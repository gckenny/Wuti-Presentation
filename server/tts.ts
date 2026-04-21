export interface TTSResult {
  audio: ArrayBuffer
  durationSec: number
}

export interface TTSOptions {
  voice?: string
  rate?: string
  tone?: string
}

export interface TTSEnv {
  AZURE_SPEECH_KEY: string
  AZURE_SPEECH_REGION: string
  AZURE_SPEECH_VOICE?: string
}

export async function synthesize(
  text: string,
  env: TTSEnv,
  options: TTSOptions = {},
): Promise<TTSResult> {
  const KEY = env.AZURE_SPEECH_KEY
  const REGION = env.AZURE_SPEECH_REGION
  const VOICE = options.voice || env.AZURE_SPEECH_VOICE || 'zh-TW-HsiaoChenNeural'
  const RATE = options.rate || '0%'
  const TONE = options.tone || 'normal'

  if (!KEY || !REGION) {
    throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured')
  }

  const spec = TONE_SPECS[TONE] ?? TONE_SPECS.normal
  const combinedRate = combineRates(RATE, spec.rateOffset)
  const ssml = buildSsml(text, VOICE, combinedRate, spec)
  const endpoint = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'wuti-presentation',
    },
    body: ssml,
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`TTS failed (${res.status}): ${detail}`)
  }

  const audio = await res.arrayBuffer()
  return { audio, durationSec: estimateDurationSec(text, combinedRate, spec) }
}

const RATE_PERCENT_RE = /^([+-]?)(\d+(?:\.\d+)?)%$/
const SENTENCE_END_RE = /([。！？!?.])(\s|$)/g

// Rough approximation used only for the "total duration" display in the UI.
// Actual playback uses HTMLAudio.duration at runtime.
function estimateDurationSec(text: string, combinedRate: string, spec: ToneSpec): number {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length
  const other = text.length - cjk
  // ~4 CJK chars/sec, ~15 latin chars/sec
  const baseSec = cjk / 4 + other / 15
  const speedFactor = Math.max(1 + parseRatePercent(combinedRate) / 100, 0.1)
  const breakCount = spec.sentenceBreakMs > 0 ? (text.match(SENTENCE_END_RE) ?? []).length : 0
  const breakSec = (breakCount * spec.sentenceBreakMs) / 1000
  return Math.round((baseSec / speedFactor + breakSec) * 10) / 10
}

function parseRatePercent(s: string): number {
  const m = s.match(RATE_PERCENT_RE)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * parseFloat(m[2])
}

interface ToneSpec {
  style?: string
  styleDegree?: string
  rateOffset: number
  pitch?: string
  sentenceBreakMs: number
}

const TONE_SPECS: Record<string, ToneSpec> = {
  normal: { rateOffset: 0, sentenceBreakMs: 0 },
  podcast: {
    style: 'chat',
    styleDegree: '1.2',
    rateOffset: -5,
    pitch: '-2%',
    sentenceBreakMs: 280,
  },
  news: {
    style: 'newscast',
    styleDegree: '1.0',
    rateOffset: 0,
    sentenceBreakMs: 180,
  },
  storytelling: {
    style: 'narration-professional',
    styleDegree: '1.1',
    rateOffset: -3,
    pitch: '-1%',
    sentenceBreakMs: 240,
  },
}

function buildSsml(text: string, voice: string, combinedRate: string, spec: ToneSpec): string {
  const lang = voice.split('-').slice(0, 2).join('-') || 'zh-TW'
  const escapedText = escapeSsml(text)
  const bodyWithBreaks =
    spec.sentenceBreakMs > 0
      ? insertSentenceBreaks(escapedText, spec.sentenceBreakMs)
      : escapedText

  const pitchAttr = spec.pitch ? ` pitch="${spec.pitch}"` : ''
  const prosodyBlock = `<prosody rate="${combinedRate}"${pitchAttr}>${bodyWithBreaks}</prosody>`

  const styledBlock = spec.style
    ? `<mstts:express-as style="${spec.style}" styledegree="${spec.styleDegree ?? '1'}">${prosodyBlock}</mstts:express-as>`
    : prosodyBlock

  return `<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voice}">
    ${styledBlock}
  </voice>
</speak>`
}

function escapeSsml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function insertSentenceBreaks(text: string, ms: number): string {
  return text.replace(SENTENCE_END_RE, `$1<break time="${ms}ms"/>$2`)
}

function combineRates(userRate: string, toneOffsetPercent: number): string {
  if (!RATE_PERCENT_RE.test(userRate)) return userRate
  const combined = Math.round(parseRatePercent(userRate) + toneOffsetPercent)
  return `${combined >= 0 ? '+' : ''}${combined}%`
}
