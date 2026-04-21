import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { AudioItem, PanelId, Slide } from '../types'
import {
  VOICES,
  RATES,
  loadDeckState,
  loadCurrentDeck,
  saveCurrentDeck,
  clearCurrentDeck,
} from '../lib/storage'

const API = import.meta.env.BASE_URL + 'api'

type Stage = 'upload' | 'playing'

function detectPrimaryLang(slides: Slide[]): 'zh' | 'en' {
  const text = slides
    .map((s) => `${s.title} ${s.body} ${s.speakerNotes}`)
    .join(' ')
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latin = text.match(/[a-zA-Z]/g)?.length ?? 0
  return cjk >= latin ? 'zh' : 'en'
}

@customElement('wuti-app')
export class WutiApp extends LitElement {
  @state() private stage: Stage = 'upload'
  @state() private presentationId = ''
  @state() private deckTitle = ''
  @state() private slides: Slide[] = []
  @state() private slidesHtml = ''
  @state() private audio: AudioItem[] = []
  @state() private editedNotes: Record<number, string> = {}
  @state() private currentSlideIndex = 0
  @state() private openPanel: PanelId | null = null
  @state() private status = ''
  @state() private busy = false
  @state() private error = ''

  protected createRenderRoot() {
    return this
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener('mousedown', this.onDocMouseDown)
    void this.restoreCurrentDeck()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('mousedown', this.onDocMouseDown)
  }

  private onDocMouseDown = (e: MouseEvent) => {
    const el = this.querySelector('details.wuti-shortcuts') as HTMLDetailsElement | null
    if (!el?.open) return
    if (!e.composedPath().includes(el)) el.open = false
  }

  private async handleFile(e: CustomEvent<{ file: File }>) {
    const file = e.detail.file
    this.busy = true
    this.error = ''
    this.slidesHtml = ''
    this.audio = []
    try {
      this.status = `Uploading ${file.name} and parsing...`
      const fd = new FormData()
      fd.append('file', file)
      const uploadRes = await fetch(`${API}/upload`, { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error(await uploadRes.text())
      const data = (await uploadRes.json()) as { id: string; title: string; slides: Slide[] }
      this.presentationId = data.id
      this.deckTitle = data.title
      this.slides = data.slides
      saveCurrentDeck({ id: data.id, title: data.title })

      this.status = `Rendering ${data.slides.length} slides...`
      const slidesRes = await fetch(`${API}/generate-slides/${data.id}`, { method: 'POST' })
      if (!slidesRes.ok) throw new Error(await slidesRes.text())
      const slidesData = (await slidesRes.json()) as { html: string }
      this.slidesHtml = slidesData.html

      // Enter playing stage immediately so the player mounts while audio generates
      this.stage = 'playing'

      const prior = loadDeckState(data.id)
      const priorNotes = prior?.current.notes ?? {}
      // Pick default voice from deck language when no prior choice exists.
      //   - zh-dominant → Xiaoxiao (bilingual female, Chinese-leaning)
      //   - en-dominant → Andrew (bilingual male, English-leaning)
      const primaryLang = detectPrimaryLang(data.slides)
      const defaultVoice =
        primaryLang === 'en'
          ? 'en-US-AndrewMultilingualNeural'
          : 'zh-CN-XiaoxiaoMultilingualNeural'
      const voice =
        VOICES.find((v) => v.id === prior?.current.voice)?.id ?? defaultVoice
      const rate =
        RATES.find((r) => r.value === prior?.current.rate)?.value ?? RATES[1].value
      const tone = prior?.current.tone ?? 'normal'
      const notes: Record<number, string> = {}
      for (const s of data.slides) {
        notes[s.index] = priorNotes[s.index] ?? s.speakerNotes
      }

      await this.runGenerateAudio(voice, rate, tone, notes)
    } catch (err) {
      this.error = (err as Error).message
      this.status = ''
    } finally {
      this.busy = false
    }
  }

  private async runGenerateAudio(
    voice: string,
    rate: string,
    tone: string,
    notes: Record<number, string>,
  ) {
    this.editedNotes = notes
    const shortVoice = voice.split('-').pop()
    this.status = `Synthesizing speech (${shortVoice}, ${rate}, ${tone})...`
    const payload = {
      voice,
      rate,
      tone,
      slides: this.slides.map((s) => ({
        index: s.index,
        speakerNotes: notes[s.index] ?? s.speakerNotes,
      })),
    }
    const audioRes = await fetch(`${API}/generate-audio/${this.presentationId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!audioRes.ok) throw new Error(await audioRes.text())
    const audioData = (await audioRes.json()) as { audio: AudioItem[] }
    this.audio = audioData.audio
    this.status = `Ready. ${this.slides.length} slides · ${audioData.audio.filter((a) => a.file).length} audio clips.`
  }

  private async handleRegenerate(
    e: CustomEvent<{ voice: string; rate: string; tone: string; notes: Record<number, string> }>,
  ) {
    this.busy = true
    this.error = ''
    try {
      await this.runGenerateAudio(e.detail.voice, e.detail.rate, e.detail.tone, e.detail.notes)
    } catch (err) {
      this.error = (err as Error).message
    } finally {
      this.busy = false
    }
  }

  private reset() {
    clearCurrentDeck()
    this.stage = 'upload'
    this.presentationId = ''
    this.deckTitle = ''
    this.slides = []
    this.slidesHtml = ''
    this.audio = []
    this.editedNotes = {}
    this.status = ''
    this.error = ''
  }

  private async restoreCurrentDeck() {
    const pointer = loadCurrentDeck()
    if (!pointer) return
    this.busy = true
    this.status = `Restoring ${pointer.title}...`
    try {
      const res = await fetch(`${API}/presentation/${pointer.id}`)
      if (!res.ok) {
        clearCurrentDeck()
        this.status = ''
        return
      }
      const data = (await res.json()) as {
        id: string
        title: string
        slides: Slide[]
        html: string | null
      }

      let html = data.html
      if (!html) {
        const slidesRes = await fetch(`${API}/generate-slides/${data.id}`, { method: 'POST' })
        if (slidesRes.ok) {
          const slidesData = (await slidesRes.json()) as { html: string }
          html = slidesData.html
        }
      }
      if (!html) {
        clearCurrentDeck()
        this.status = ''
        return
      }

      this.presentationId = data.id
      this.deckTitle = data.title
      this.slides = data.slides
      this.slidesHtml = html
      this.stage = 'playing'

      const prior = loadDeckState(data.id)
      const primaryLang = detectPrimaryLang(data.slides)
      const defaultVoice =
        primaryLang === 'en'
          ? 'en-US-AndrewMultilingualNeural'
          : 'zh-CN-XiaoxiaoMultilingualNeural'
      const voice = VOICES.find((v) => v.id === prior?.current.voice)?.id ?? defaultVoice
      const rate = RATES.find((r) => r.value === prior?.current.rate)?.value ?? RATES[1].value
      const tone = prior?.current.tone ?? 'normal'
      const notes: Record<number, string> = {}
      for (const s of data.slides) {
        notes[s.index] = prior?.current.notes?.[s.index] ?? s.speakerNotes
      }
      await this.runGenerateAudio(voice, rate, tone, notes)
    } catch (err) {
      console.warn('[wuti] restore failed:', err)
      clearCurrentDeck()
      this.status = ''
    } finally {
      this.busy = false
    }
  }

  render() {
    return html`
      <div class="wuti-mobile-only">
        <div class="wuti-mobile-card">
          <p class="wuti-mobile-brand">wuti · presentation</p>
          <h1>Desktop-only. On purpose.</h1>
          <p>
            This tool needs a slide player, a notes editor, a drag-and-drop target, and enough
            horizontal room for all of that at once. Your phone is great at many things — this
            isn't one of them, and <em>"pretend to be responsive"</em> is not on the roadmap.
          </p>
          <p class="wuti-mobile-footer">Come back on a laptop. I'll be here.</p>
        </div>
      </div>
      <div class="wuti-shell">
        <header class="border-b border-stone-300 px-8 py-5 flex items-center justify-between">
          <div
            role="button"
            tabindex="0"
            class="select-none hover:opacity-70 transition"
            style="cursor: pointer;"
            @click=${this.reset.bind(this)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                this.reset()
              }
            }}
          >
            <h1 class="text-2xl tracking-wide" style="font-family: Georgia, 'Noto Serif TC', serif;">
              Wuti Presentation
            </h1>
            <p class="text-sm text-stone-500">Turn work notes into fully automated presentations</p>
          </div>
          ${this.stage !== 'upload'
            ? html`<div class="flex items-center gap-2">
                <button
                  class="px-4 py-2 text-sm rounded border border-stone-400 hover:bg-stone-100"
                  @click=${this.reset.bind(this)}
                >
                  Upload new file
                </button>
                <details class="wuti-shortcuts relative">
                  <summary
                    class="list-none w-9 h-9 rounded-full border border-stone-400 flex items-center justify-center text-stone-600 hover:bg-stone-100 select-none text-sm"
                    aria-label="Keyboard shortcuts"
                  >
                    ?
                  </summary>
                  <div
                    class="absolute right-0 top-11 w-64 p-3 bg-white border border-stone-200 rounded-xl shadow-lg text-xs text-stone-600 leading-relaxed z-20"
                  >
                    <p class="font-semibold text-stone-800 mb-2">Keyboard shortcuts</p>
                    <ul class="space-y-1">
                      <li><kbd class="font-mono">P</kbd> — pause / resume</li>
                      <li><kbd class="font-mono">R</kbd> — restart</li>
                      <li><kbd class="font-mono">← →</kbd> — manual navigation</li>
                    </ul>
                  </div>
                </details>
              </div>`
            : ''}
        </header>

        ${this.stage === 'upload'
          ? html`<main class="flex-1 overflow-auto max-w-6xl mx-auto px-8 py-10 w-full">
              <wuti-uploader @file=${this.handleFile.bind(this)}></wuti-uploader>
            </main>`
          : html`
              <main class="flex-1 min-h-0 max-w-[1600px] w-full mx-auto px-6 py-4 flex flex-col gap-3">
                <wuti-player
                  .slidesHtml=${this.slidesHtml}
                  .audio=${this.audio}
                  .slides=${this.slides}
                  .editedNotes=${this.editedNotes}
                  .openPanel=${this.openPanel}
                  @slidechange=${(e: CustomEvent<{ index: number }>) =>
                    (this.currentSlideIndex = e.detail.index)}
                  @paneltoggle=${(e: CustomEvent<{ panel: PanelId }>) => {
                    this.openPanel = this.openPanel === e.detail.panel ? null : e.detail.panel
                  }}
                ></wuti-player>
                <wuti-editor
                  .deckId=${this.presentationId}
                  .deckTitle=${this.deckTitle}
                  .slides=${this.slides}
                  .busy=${this.busy}
                  .currentSlideIndex=${this.currentSlideIndex}
                  .openPanel=${this.openPanel}
                  @generate=${this.handleRegenerate.bind(this)}
                ></wuti-editor>
              </main>
            `}
        ${this.status
          ? html`<div
              class="fixed top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-full bg-white/95 backdrop-blur border border-stone-200 text-stone-700 text-sm shadow-md flex items-center gap-3 max-w-[90vw]"
            >
              ${this.busy
                ? html`<span
                    class="inline-block w-3 h-3 rounded-full border-2 border-stone-700 border-t-transparent animate-spin"
                  ></span>`
                : html`<span class="text-emerald-600">✓</span>`}
              <span>${this.status}</span>
            </div>`
          : ''}
        ${this.error
          ? html`<pre class="fixed top-4 right-4 z-40 max-w-md p-4 bg-red-50 text-red-800 text-xs rounded border border-red-200 whitespace-pre-wrap">${this.error}</pre>`
          : ''}
      </div>
    `
  }
}
