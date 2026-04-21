export interface Slide {
  index: number
  title: string
  body: string
  speakerNotes: string
}

export interface AudioItem {
  index: number
  file: string | null
  durationSec: number
}

export interface PresentationData {
  id: string
  title: string
  slides: Slide[]
  html: string | null
  audio: AudioItem[]
}

export type PanelId = 'voice' | 'versions' | 'notes'
