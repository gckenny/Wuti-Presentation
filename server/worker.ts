import { Hono } from 'hono'
import { parseSlides, type ParsedDeck } from './parse-md.js'
import { renderDeck } from './render-slides.js'
import { callGemini, stripFences } from './gemini.js'
import { synthesize } from './tts.js'

interface Env {
  WUTI_STORAGE: R2Bucket
  ASSETS: Fetcher
  AZURE_SPEECH_KEY: string
  AZURE_SPEECH_REGION: string
  AZURE_SPEECH_VOICE?: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
  GOOGLE_CLOUD_PROJECT: string
  GOOGLE_CLOUD_LOCATION?: string
  GEMINI_MODEL?: string
}

// The Worker is deployed behind Cloudflare Routes as tools.orz.tw/presentation*.
// Strip the prefix so Hono and R2 keys never carry it; prepend it when building
// URLs that go back to the client.
const PUBLIC_PREFIX = '/presentation'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.post('/api/upload', async (c) => {
  const body = await c.req.parseBody()
  let md: string | undefined
  const file = body.file
  if (file instanceof File) {
    md = await file.text()
  } else if (typeof body.markdown === 'string') {
    md = body.markdown
  }
  if (!md) return c.json({ error: 'No file or markdown provided' }, 400)

  const id = (await sha1Hex(md)).slice(0, 12)
  const bucket = c.env.WUTI_STORAGE

  await bucket.put(`${id}/source.md`, md, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
  })

  let parsed = parseSlides(md)
  if (parsed.slides.length < 2) {
    try {
      parsed = await geminiParseDeck(md, c.env)
    } catch (err) {
      console.warn('[wuti] Gemini parse fallback failed:', (err as Error).message)
    }
  }
  await bucket.put(`${id}/slides.json`, JSON.stringify(parsed, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  })

  return c.json({ id, ...parsed })
})

app.post('/api/generate-slides/:id', async (c) => {
  const id = c.req.param('id')
  const bucket = c.env.WUTI_STORAGE
  const force = c.req.query('force')

  const parsedObj = await bucket.get(`${id}/slides.json`)
  if (!parsedObj) return c.json({ error: 'deck not found' }, 404)
  const parsed = JSON.parse(await parsedObj.text()) as ParsedDeck

  if (!force) {
    const cached = await bucket.get(`${id}/slides.html`)
    if (cached) {
      return c.json({ html: await cached.text(), cached: true })
    }
  }

  const html = renderDeck(parsed)
  await bucket.put(`${id}/slides.html`, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
  })
  return c.json({ html, cached: false })
})

app.post('/api/generate-audio/:id', async (c) => {
  const id = c.req.param('id')
  const bucket = c.env.WUTI_STORAGE
  const force = c.req.query('force')
  const body = (await c.req.json().catch(() => ({}))) as {
    slides?: Array<{ index: number; speakerNotes: string }>
    voice?: string
    rate?: string
    tone?: string
  }

  const parsedObj = await bucket.get(`${id}/slides.json`)
  if (!parsedObj) return c.json({ error: 'deck not found' }, 404)
  const parsed = JSON.parse(await parsedObj.text()) as ParsedDeck

  const voice = body.voice || c.env.AZURE_SPEECH_VOICE || 'zh-TW-HsiaoChenNeural'
  const rate = body.rate || '0%'
  const tone = body.tone || 'normal'

  const overrides = new Map<number, string>(
    (body.slides ?? []).map((s) => [s.index, s.speakerNotes || '']),
  )
  const effectiveSlides = parsed.slides.map((s) => ({
    index: s.index,
    speakerNotes: overrides.get(s.index) ?? s.speakerNotes,
  }))

  const variant = (
    await sha1Hex(
      JSON.stringify({
        voice,
        rate,
        tone,
        notes: effectiveSlides.map((s) => s.speakerNotes),
      }),
    )
  ).slice(0, 10)
  const manifestKey = `${id}/audio/${variant}/manifest.json`

  if (!force) {
    const cached = await bucket.get(manifestKey)
    if (cached) {
      const manifest = JSON.parse(await cached.text())
      if (Array.isArray(manifest) && manifest.length === effectiveSlides.length) {
        return c.json({ audio: manifest, cached: true, variant, voice, rate, tone })
      }
    }
  }

  const manifest: Array<{ index: number; file: string | null; durationSec: number }> = []
  for (const slide of effectiveSlides) {
    const fileName = `slide-${slide.index + 1}.mp3`
    if (!slide.speakerNotes?.trim()) {
      manifest.push({ index: slide.index, file: null, durationSec: 0 })
      continue
    }
    const result = await synthesize(slide.speakerNotes, c.env, { voice, rate, tone })
    const objectKey = `${id}/audio/${variant}/${fileName}`
    await bucket.put(objectKey, result.audio, {
      httpMetadata: { contentType: 'audio/mpeg' },
    })
    manifest.push({
      index: slide.index,
      file: `${PUBLIC_PREFIX}/storage/${objectKey}`,
      durationSec: result.durationSec,
    })
  }
  await bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  })
  return c.json({ audio: manifest, cached: false, variant, voice, rate, tone })
})

app.get('/api/presentation/:id', async (c) => {
  const id = c.req.param('id')
  const bucket = c.env.WUTI_STORAGE
  const parsedObj = await bucket.get(`${id}/slides.json`)
  if (!parsedObj) return c.json({ error: 'deck not found' }, 404)
  const parsed = JSON.parse(await parsedObj.text()) as ParsedDeck

  let html: string | null = null
  const htmlObj = await bucket.get(`${id}/slides.html`)
  if (htmlObj) html = await htmlObj.text()

  return c.json({ id, ...parsed, html, audio: [] })
})

// Static stream from R2: /storage/<id>/...rest
app.get('/storage/*', async (c) => {
  const url = new URL(c.req.url)
  const key = url.pathname.replace(/^\/storage\//, '')
  if (!key) return c.text('not found', 404)
  const obj = await c.env.WUTI_STORAGE.get(key)
  if (!obj) return c.text('not found', 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('cache-control', 'public, max-age=3600')
  headers.set('etag', obj.httpEtag)
  return new Response(obj.body, { headers })
})

async function geminiParseDeck(md: string, env: Env): Promise<ParsedDeck> {
  const prompt = `You are a markdown deck parser. Convert the following document into a JSON object with this exact shape:

{
  "title": "deck title (string)",
  "slides": [
    {
      "index": 0,
      "title": "slide title",
      "body": "slide body as markdown (WITHOUT the slide title heading and WITHOUT any Speaker Notes section)",
      "speakerNotes": "speaker notes as plain text, or empty string"
    }
  ]
}

Rules:
- Preserve ALL original content verbatim (no summarization, no translation).
- Detect slide boundaries intelligently even if the source uses irregular headings.
- Extract speaker notes from any section labelled 'Speaker Notes' or equivalent.
- Output ONLY valid JSON. No markdown fences, no commentary.

=== SOURCE ===

${md}

=== END ===`
  const raw = await callGemini(prompt, env)
  const parsed = JSON.parse(stripFences(raw)) as ParsedDeck
  parsed.slides = parsed.slides.map((s, i) => ({
    index: i,
    title: s.title || `Slide ${i + 1}`,
    body: s.body || '',
    speakerNotes: s.speakerNotes || '',
  }))
  return parsed
}

async function sha1Hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data)
  const hash = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Redirect bare /presentation → /presentation/ so relative asset paths resolve.
    if (url.pathname === PUBLIC_PREFIX) {
      return Response.redirect(`${url.origin}${PUBLIC_PREFIX}/`, 301)
    }
    if (url.pathname.startsWith(PUBLIC_PREFIX + '/')) {
      url.pathname = url.pathname.slice(PUBLIC_PREFIX.length)
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/storage/')) {
        return app.fetch(new Request(url.toString(), request), env, ctx)
      }
      return env.ASSETS.fetch(new Request(url.toString(), request))
    }

    // Everything else on tools.orz.tw — deadpan landing/blocker.
    return new Response(BLOCKER_HTML, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  },
}

const BLOCKER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>tools.orz.tw — nothing here yet</title>
  <style>
    :root { --ink:#1a1a1a; --paper:#fafaf7; --rule:#d6d3c7; --mute:#8a8679; --open:#4a7a4f; }
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;padding:0;background:var(--paper);color:var(--ink)}
    body{min-height:100vh;font-family:Georgia,"Noto Serif TC","Songti TC",serif;display:flex;align-items:center;justify-content:center;padding:6vh 6vw}
    main{max-width:620px;width:100%}
    .brand{font-size:.75rem;letter-spacing:.3em;text-transform:uppercase;color:var(--mute);margin:0 0 2.5rem}
    h1{font-size:clamp(2rem,5.5vw,3rem);line-height:1.15;margin:0 0 1.4rem;font-weight:400}
    .lede{font-size:1.0625rem;line-height:1.65;color:#3d3a31;margin:0 0 2.2rem}
    .lede p{margin:0 0 .9rem}
    ul{list-style:none;padding:0;margin:0 0 2.5rem;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
    li{padding:1rem 0;border-top:1px solid var(--rule);display:flex;justify-content:space-between;align-items:baseline;gap:1rem;font-size:1rem}
    li:first-child{border-top:0}
    li a{color:var(--ink);text-decoration:none;font-weight:500;border-bottom:1px solid var(--ink);padding-bottom:2px;transition:background .12s}
    li a:hover{background:var(--ink);color:var(--paper);border-bottom-color:transparent}
    li .path{font-family:Menlo,ui-monospace,monospace;color:var(--mute);font-size:.95rem}
    .status{font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);font-family:Menlo,ui-monospace,monospace}
    .status.on{color:var(--open)}
    .footer{font-size:.78rem;color:var(--mute);font-family:Menlo,ui-monospace,monospace;line-height:1.7}
    .footer b{color:var(--ink);font-weight:500}
  </style>
</head>
<body>
  <main>
    <p class="brand">tools · orz · tw</p>
    <h1>Members-only. The membership has one member.</h1>
    <div class="lede">
      <p>You've reached the front desk of a personal tool shelf. Most of the shelf is empty.</p>
      <p>I tend to build things only when I actually need them. Right now, I need exactly one.</p>
    </div>
    <ul>
      <li>
        <a href="/presentation/">/presentation</a>
        <span class="status on">Open · the only door</span>
      </li>
      <li>
        <span class="path">/everything-else</span>
        <span class="status">Shipping Q∞</span>
      </li>
    </ul>
    <p class="footer">HTTP <b>404</b> · nothing here · the back button still works — I checked, twice.</p>
  </main>
</body>
</html>`

