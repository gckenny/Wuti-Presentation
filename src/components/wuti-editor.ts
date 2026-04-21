import { LitElement, html, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { PanelId, Slide } from '../types'
import {
  loadDeckState,
  saveDeckState,
  saveVersion,
  deleteVersion,
  VOICES,
  RATES,
  TONES,
  type NotesVersion,
} from '../lib/storage'

@customElement('wuti-editor')
export class WutiEditor extends LitElement {
  @property({ attribute: false }) deckId = ''
  @property({ attribute: false }) deckTitle = ''
  @property({ attribute: false }) slides: Slide[] = []
  @property({ attribute: false, type: Boolean }) busy = false
  @property({ attribute: false, type: Number }) currentSlideIndex = 0
  @property({ attribute: false }) openPanel: PanelId | null = null
  @state() private activeTab = 0

  @state() private notes: Record<number, string> = {}
  @state() private voice = VOICES[0].id
  @state() private rate = RATES[1].value
  @state() private tone = TONES[0].id
  @state() private versions: NotesVersion[] = []
  @state() private versionName = ''

  protected createRenderRoot() {
    return this
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has('currentSlideIndex')) {
      this.activeTab = this.currentSlideIndex
    }
    if (changed.has('slides') || changed.has('deckId')) {
      const state = loadDeckState(this.deckId)
      if (state) {
        this.voice = state.current.voice
        this.rate = state.current.rate
        this.tone = state.current.tone ?? TONES[0].id
        this.notes = { ...state.current.notes }
        this.versions = state.versions
      } else {
        const seed: Record<number, string> = {}
        this.slides.forEach((s) => (seed[s.index] = s.speakerNotes))
        this.notes = seed
        this.versions = []
      }
    }
    if (changed.has('deckTitle') && this.deckTitle && !this.versionName) {
      this.versionName = this.deckTitle
    }
  }

  protected updated(changed: PropertyValues) {
    if (changed.has('openPanel') && this.openPanel) {
      const section = this.querySelector('section')
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  private persist() {
    saveDeckState(this.deckId, {
      current: { voice: this.voice, rate: this.rate, tone: this.tone, notes: this.notes },
      versions: this.versions,
    })
  }

  private onNoteInput(index: number, value: string) {
    this.notes = { ...this.notes, [index]: value }
    this.persist()
  }

  private onVoiceChange(e: Event) {
    this.voice = (e.target as HTMLSelectElement).value
    this.persist()
  }

  private onRateChange(e: Event) {
    this.rate = (e.target as HTMLSelectElement).value
    this.persist()
  }

  private onToneChange(e: Event) {
    this.tone = (e.target as HTMLSelectElement).value
    this.persist()
  }

  private reloadVersions() {
    this.versions = loadDeckState(this.deckId)?.versions ?? []
  }

  private onSaveVersion() {
    const name = this.versionName.trim() || new Date().toLocaleString()
    saveVersion(this.deckId, name, {
      voice: this.voice,
      rate: this.rate,
      tone: this.tone,
      notes: this.notes,
    })
    this.reloadVersions()
    this.versionName = ''
  }

  private onLoadVersion(v: NotesVersion) {
    this.voice = v.voice
    this.rate = v.rate
    this.tone = v.tone ?? TONES[0].id
    this.notes = { ...v.notes }
    this.persist()
  }

  private onDeleteVersion(v: NotesVersion) {
    deleteVersion(this.deckId, v.id)
    this.reloadVersions()
  }

  private onGenerate() {
    this.dispatchEvent(
      new CustomEvent('generate', {
        detail: {
          voice: this.voice,
          rate: this.rate,
          tone: this.tone,
          notes: this.notes,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private onReset(index: number) {
    const original = this.slides.find((s) => s.index === index)?.speakerNotes || ''
    this.onNoteInput(index, original)
  }

  private renderActiveTab() {
    const slide = this.slides.find((s) => s.index === this.activeTab) ?? this.slides[0]
    if (!slide) return html``
    const value = this.notes[slide.index] ?? ''
    const rows = Math.max(6, Math.ceil(value.length / 50))
    return html`
      <div class="flex items-baseline justify-between mb-2">
        <span class="text-xs font-mono text-stone-500">#${slide.index + 1} · ${slide.title}</span>
        <button
          class="text-xs text-stone-500 hover:text-stone-800"
          @click=${() => this.onReset(slide.index)}
        >
          Reset to original
        </button>
      </div>
      <textarea
        class="w-full px-3 py-2 border border-stone-300 rounded text-sm leading-relaxed font-serif"
        rows=${rows}
        .value=${value}
        @input=${(e: Event) =>
          this.onNoteInput(slide.index, (e.target as HTMLTextAreaElement).value)}
        @blur=${() => this.persist()}
      ></textarea>
    `
  }

  private renderVoicePanel() {
    return html`
      <div>
        <div class="flex flex-wrap gap-4 items-end">
          <label class="text-sm text-stone-700 flex flex-col gap-1 flex-1 min-w-[140px]">
            Voice
            <select
              class="px-3 py-2 border border-stone-300 rounded bg-white text-sm"
              .value=${this.voice}
              @change=${this.onVoiceChange.bind(this)}
            >
              ${VOICES.map(
                (v) =>
                  html`<option value=${v.id} ?selected=${v.id === this.voice}>${v.label}</option>`,
              )}
            </select>
          </label>
          <label class="text-sm text-stone-700 flex flex-col gap-1">
            Speed
            <select
              class="px-3 py-2 border border-stone-300 rounded bg-white text-sm"
              .value=${this.rate}
              @change=${this.onRateChange.bind(this)}
            >
              ${RATES.map(
                (r) =>
                  html`<option value=${r.value} ?selected=${r.value === this.rate}>
                    ${r.label} (${r.value})
                  </option>`,
              )}
            </select>
          </label>
          <label class="text-sm text-stone-700 flex flex-col gap-1">
            Tone
            <select
              class="px-3 py-2 border border-stone-300 rounded bg-white text-sm"
              .value=${this.tone}
              @change=${this.onToneChange.bind(this)}
            >
              ${TONES.map(
                (t) =>
                  html`<option value=${t.id} ?selected=${t.id === this.tone}>${t.label}</option>`,
              )}
            </select>
          </label>
        </div>
        <button
          class="mt-4 w-full px-6 py-2 rounded-full bg-stone-900 text-white text-sm hover:bg-stone-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          ?disabled=${this.busy}
          @click=${this.onGenerate.bind(this)}
        >
          ${this.busy
            ? html`<span
                  class="inline-block w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"
                ></span>
                Synthesizing...`
            : html`Regenerate audio`}
        </button>
      </div>
    `
  }

  private renderVersionsPanel() {
    return html`
      <div>
        <div class="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="version name (optional)"
            class="flex-1 px-3 py-1 border border-stone-300 rounded text-sm"
            .value=${this.versionName}
            @input=${(e: Event) => (this.versionName = (e.target as HTMLInputElement).value)}
          />
          <button
            class="px-4 py-1 rounded-full border border-stone-400 text-sm hover:bg-stone-100"
            @click=${this.onSaveVersion.bind(this)}
          >
            Save
          </button>
        </div>
        ${this.versions.length === 0
          ? html`<p class="text-xs text-stone-500">
              No saved versions yet. Edit notes and click Save to snapshot.
            </p>`
          : html`
              <ul class="space-y-1">
                ${this.versions.map(
                  (v) => html`
                    <li
                      class="flex items-center justify-between text-sm py-2 border-b border-stone-100 last:border-0"
                    >
                      <div class="flex-1 min-w-0">
                        <div class="font-medium truncate">${v.name}</div>
                        <div class="text-xs text-stone-500">
                          ${new Date(v.savedAt).toLocaleString()} · ${v.voice.split('-').pop()} ·
                          ${v.rate}
                        </div>
                      </div>
                      <button
                        class="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-100"
                        @click=${() => this.onLoadVersion(v)}
                      >
                        Load
                      </button>
                      <button
                        class="text-xs px-2 py-1 ml-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                        @click=${() => this.onDeleteVersion(v)}
                      >
                        Delete
                      </button>
                    </li>
                  `,
                )}
              </ul>
            `}
      </div>
    `
  }

  private renderNotesPanel() {
    return html`
      <div>
        <div
          class="flex gap-1 mb-3 overflow-x-auto pb-1 border-b border-stone-200"
          role="tablist"
        >
          ${this.slides.map((s) => {
            const active = s.index === this.activeTab
            const isCurrent = s.index === this.currentSlideIndex
            const base =
              'text-xs font-mono px-2.5 py-1 rounded-t border-b-2 whitespace-nowrap transition'
            let style: string
            if (active) {
              style = 'border-stone-900 text-stone-900 bg-stone-100'
            } else if (isCurrent) {
              style = 'border-amber-400 text-stone-700 hover:bg-stone-50'
            } else {
              style = 'border-transparent text-stone-500 hover:bg-stone-50'
            }
            return html`
              <button
                role="tab"
                aria-selected=${active}
                class="${base} ${style}"
                @click=${() => (this.activeTab = s.index)}
                data-tip=${s.title}
              >
                #${s.index + 1}
              </button>
            `
          })}
        </div>
        ${this.renderActiveTab()}
      </div>
    `
  }

  private renderActivePanel() {
    switch (this.openPanel) {
      case 'voice':
        return this.renderVoicePanel()
      case 'versions':
        return this.renderVersionsPanel()
      case 'notes':
        return this.renderNotesPanel()
      default:
        return ''
    }
  }

  render() {
    if (!this.openPanel) return html``
    return html`
      <section class="p-5 bg-white border border-stone-200 rounded-xl">
        ${this.renderActivePanel()}
      </section>
    `
  }
}

