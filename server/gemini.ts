export interface GeminiEnv {
  GOOGLE_SERVICE_ACCOUNT_JSON: string
  GOOGLE_CLOUD_PROJECT: string
  GOOGLE_CLOUD_LOCATION?: string
  GEMINI_MODEL?: string
}

interface ServiceAccount {
  client_email: string
  private_key: string
}

interface TokenCache {
  token?: string
  expiresAt?: number
}

// Module-level cache. Persists within an isolate; worst case a cold start signs
// one extra JWT — cheap.
const tokenCache: TokenCache = {}

export async function callGemini(prompt: string, env: GeminiEnv): Promise<string> {
  const project = env.GOOGLE_CLOUD_PROJECT
  const location = env.GOOGLE_CLOUD_LOCATION || 'global'
  const model = env.GEMINI_MODEL || 'gemini-2.5-pro'
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not configured')
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret not set')
  }

  const token = await getAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const host =
    location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Vertex AI call failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Vertex AI returned empty response')
  return text
}

export function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:html|xml|json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}

async function getAccessToken(saJson: string): Promise<string> {
  const now = Date.now()
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }
  const sa = JSON.parse(saJson) as ServiceAccount
  const jwt = await signServiceAccountJwt(sa)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`OAuth exchange failed (${res.status}): ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache.token = data.access_token
  tokenCache.expiresAt = now + data.expires_in * 1000
  return data.access_token
}

async function signServiceAccountJwt(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: iat + 3600,
    iat,
  }
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${b64urlBytes(new Uint8Array(sig))}`
}

function b64urlJson(obj: object): string {
  return b64urlBytes(new TextEncoder().encode(JSON.stringify(obj)))
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}
