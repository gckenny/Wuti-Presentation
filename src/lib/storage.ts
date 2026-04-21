export interface NotesVersion {
  id: string
  name: string
  savedAt: number
  voice: string
  rate: string
  tone: string
  notes: Record<number, string>
}

export interface DeckState {
  current: {
    voice: string
    rate: string
    tone: string
    notes: Record<number, string>
  }
  versions: NotesVersion[]
}

const PREFIX = 'wuti-deck-v1:'
const CURRENT_KEY = 'wuti-current-deck-v1'

function key(deckId: string) {
  return PREFIX + deckId
}

export interface CurrentDeckPointer {
  id: string
  title: string
}

export function loadCurrentDeck(): CurrentDeckPointer | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    return raw ? (JSON.parse(raw) as CurrentDeckPointer) : null
  } catch {
    return null
  }
}

export function saveCurrentDeck(deck: CurrentDeckPointer) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(deck))
}

export function clearCurrentDeck() {
  localStorage.removeItem(CURRENT_KEY)
}

export function loadDeckState(deckId: string): DeckState | null {
  try {
    const raw = localStorage.getItem(key(deckId))
    if (!raw) return null
    return JSON.parse(raw) as DeckState
  } catch {
    return null
  }
}

export function saveDeckState(deckId: string, state: DeckState) {
  localStorage.setItem(key(deckId), JSON.stringify(state))
}

export function saveVersion(
  deckId: string,
  name: string,
  data: { voice: string; rate: string; tone: string; notes: Record<number, string> },
): NotesVersion {
  const existing = loadDeckState(deckId) || {
    current: { voice: data.voice, rate: data.rate, tone: data.tone, notes: data.notes },
    versions: [],
  }
  const version: NotesVersion = {
    id: String(Date.now()),
    name: name || new Date().toLocaleString(),
    savedAt: Date.now(),
    voice: data.voice,
    rate: data.rate,
    tone: data.tone,
    notes: { ...data.notes },
  }
  existing.versions = [version, ...existing.versions].slice(0, 20)
  existing.current = {
    voice: data.voice,
    rate: data.rate,
    tone: data.tone,
    notes: { ...data.notes },
  }
  saveDeckState(deckId, existing)
  return version
}

export function deleteVersion(deckId: string, versionId: string) {
  const state = loadDeckState(deckId)
  if (!state) return
  state.versions = state.versions.filter((v) => v.id !== versionId)
  saveDeckState(deckId, state)
}

export interface Voice {
  id: string
  label: string
  gender: 'female' | 'male'
  region: 'bilingual' | 'tw' | 'us' | 'uk'
  lang: string
}

export const VOICES: Voice[] = [
  // Bilingual (Chinese + English, auto code-switch) — recommended for mixed decks
  {
    id: 'zh-CN-XiaoxiaoMultilingualNeural',
    label: '曉曉 · 中英雙語女聲（推薦）',
    gender: 'female',
    region: 'bilingual',
    lang: 'zh-CN',
  },
  {
    id: 'zh-CN-YunyiMultilingualNeural',
    label: '雲逸 · 中英雙語男聲',
    gender: 'male',
    region: 'bilingual',
    lang: 'zh-CN',
  },
  {
    id: 'en-US-AvaMultilingualNeural',
    label: 'Ava · EN + 中英雙語女聲',
    gender: 'female',
    region: 'bilingual',
    lang: 'en-US',
  },
  {
    id: 'en-US-AndrewMultilingualNeural',
    label: 'Andrew · EN + 中英雙語男聲',
    gender: 'male',
    region: 'bilingual',
    lang: 'en-US',
  },
  // Taiwan (Chinese) — 1 female + 1 male
  {
    id: 'zh-TW-HsiaoChenNeural',
    label: '曉臻 · 台灣女聲',
    gender: 'female',
    region: 'tw',
    lang: 'zh-TW',
  },
  {
    id: 'zh-TW-YunJheNeural',
    label: '雲哲 · 台灣男聲',
    gender: 'male',
    region: 'tw',
    lang: 'zh-TW',
  },
  // US (English) — 1 female + 1 male
  {
    id: 'en-US-JennyNeural',
    label: 'Jenny · US Female',
    gender: 'female',
    region: 'us',
    lang: 'en-US',
  },
  {
    id: 'en-US-GuyNeural',
    label: 'Guy · US Male',
    gender: 'male',
    region: 'us',
    lang: 'en-US',
  },
  // UK (English) — 1 female + 1 male
  {
    id: 'en-GB-SoniaNeural',
    label: 'Sonia · UK Female',
    gender: 'female',
    region: 'uk',
    lang: 'en-GB',
  },
  {
    id: 'en-GB-RyanNeural',
    label: 'Ryan · UK Male',
    gender: 'male',
    region: 'uk',
    lang: 'en-GB',
  },
]

export const RATES: Array<{ id: string; label: string; value: string }> = [
  { id: 'slow', label: 'Slow', value: '-15%' },
  { id: 'medium', label: 'Medium', value: '0%' },
  { id: 'fast', label: 'Fast', value: '+15%' },
]

export interface Tone {
  id: string
  label: string
  description: string
}

export const TONES: Tone[] = [
  { id: 'normal', label: 'Normal', description: 'Neutral delivery' },
  { id: 'podcast', label: 'Podcast', description: 'Casual, conversational with natural pauses' },
  { id: 'news', label: 'Newscast', description: 'Formal news anchor style' },
  { id: 'storytelling', label: 'Storytelling', description: 'Warm narrator style' },
]
