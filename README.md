# Wuti-Presentation

Turn a markdown file (slides + speaker notes) into a self-narrating web deck.
Azure TTS reads your notes; reveal.js flips the slides; Gemini is the fallback
parser when your markdown is too irregular for the heuristic splitter.

Runs on Cloudflare Workers. Assets live in R2. The whole app is one Worker
behind a single route.

## Stack

- Frontend: Lit web components + Vite + Tailwind v4 + reveal.js
- Worker: Hono on Cloudflare Workers
- Storage: R2 (markdown, parsed JSON, rendered HTML, mp3 per slide)
- TTS: Azure Speech (SSML, neural voices)
- Fallback parser: Gemini via Vertex AI (service-account JWT → OAuth)

## Prerequisites

You need accounts with:

- **Cloudflare** — for Workers + R2. Install `wrangler` (comes via `pnpm install`)
  and run `wrangler login` once.
- **Azure Speech** — create a Cognitive Services / Speech resource in the portal,
  copy the key and region.
- **GCP Vertex AI** — enable Vertex AI API on a project, create a service
  account with `roles/aiplatform.user`, download its JSON key.

## First-time setup

```sh
pnpm install

# Cloudflare side
wrangler login
wrangler r2 bucket create <your-bucket-name>

# Config files (both are gitignored — fill in your values)
cp wrangler.example.toml wrangler.toml      # route, zone, bucket name, GCP project
cp .dev.vars.example .dev.vars              # AZURE_SPEECH_KEY, GOOGLE_SERVICE_ACCOUNT_JSON
```

`GOOGLE_SERVICE_ACCOUNT_JSON` must be the entire service account JSON on a
single line (newlines inside `private_key` stay as literal `\n`).

If you do not have a custom domain, delete the `[[routes]]` block in
`wrangler.toml`; the Worker will still be reachable at
`<name>.<subdomain>.workers.dev` because `workers_dev = true`.

## Local dev

```sh
pnpm dev        # Vite + wrangler dev in parallel
```

Vite serves the SPA with HMR; wrangler runs the Worker locally. Frontend hits
the Worker at `/api/*`. Secrets come from `.dev.vars`; non-secret vars come
from `wrangler.toml` `[vars]`.

## Deploy

```sh
# One-time: push secrets to production (values not in .dev.vars for deploys)
wrangler secret put AZURE_SPEECH_KEY
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON

pnpm run deploy   # vite build && wrangler deploy
```

## Markdown format

```markdown
# Deck Title

## Slide 1 — Title of first slide

Body content here (markdown).

### Speaker Notes

What the narrator says for this slide.

---

## Slide 2 — Next slide
...
```

- Each `## ...` heading starts a new slide.
- Each `### Speaker Notes` section becomes TTS audio for that slide.
- Slides without speaker notes get a 2.5 s silent pause during auto-play.
- If the parser finds fewer than 2 slides it falls back to Gemini, which
  tolerates irregular headings.

## File layout

```
server/          Cloudflare Worker (Hono routes, TTS, Gemini, markdown → HTML)
  worker.ts      routes: /api/upload, /api/generate-slides, /api/generate-audio, /storage/*
  parse-md.ts    heuristic markdown → slides[]
  render-slides.ts  slides[] → reveal.js HTML
  tts.ts         Azure Speech SSML builder + duration estimator
  gemini.ts      Vertex AI call with service-account JWT
src/             Lit SPA (uploader → editor → player)
public/          static assets (sample.md)
```

## Secrets hygiene

- `.env`, `.dev.vars`, `wrangler.toml`, `.wrangler/`, `dist/`, `storage/` are
  all gitignored.
- Only `.dev.vars.example` and `wrangler.example.toml` ship in the repo.
- Source has no hardcoded keys; the Worker reads everything from bindings.
- The client bundle never sees secrets (everything lives behind `/api/*`).
