import { LitElement, html, type PropertyValues } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import Reveal from 'reveal.js'
import type { AudioItem, PanelId, Slide } from '../types'
import { PANEL_TABS } from '../lib/icons'

@customElement('wuti-player')
export class WutiPlayer extends LitElement {
  @property({ attribute: false }) slidesHtml = ''
  @property({ attribute: false }) audio: AudioItem[] = []
  @property({ attribute: false }) slides: Slide[] = []
  @property({ attribute: false }) editedNotes: Record<number, string> = {}
  @property({ attribute: false }) openPanel: PanelId | null = null

  @state() private currentIndex = 0
  @state() private playing = false
  @state() private rate = 1.0
  @state() private progress = 0
  @state() private currentNotes = ''

  private deck: any = null
  private audioEl: HTMLAudioElement | null = null
  private initialized = false
  private notesWindow: Window | null = null

  protected createRenderRoot() {
    return this
  }

  protected firstUpdated(_: PropertyValues) {
    const container = this.querySelector('.reveal') as HTMLElement | null
    if (!container) return
    this.deck = new Reveal(container, {
      embedded: true,
      hash: false,
      controls: true,
      progress: true,
      slideNumber: 'c/t',
      keyboard: true,
      transition: 'fade',
      width: 1280,
      height: 720,
      margin: 0.04,
      center: false,
    })
    this.deck.initialize().then(() => {
      this.initialized = true
      this.deck.on('slidechanged', (e: any) => {
        const idx = e.indexh
        const changed = idx !== this.currentIndex
        this.currentIndex = idx
        if (changed) this.progress = 0
        this.updateNotes()
        if (!changed) return
        // Sync audio to the new slide for both auto-advance and manual navigation.
        this.audioEl?.pause()
        if (this.playing) void this.playCurrent()
        else if (this.audioEl) this.audioEl.currentTime = 0
      })
      this.updateNotes()
    })

    window.addEventListener('keydown', this.onKey)
    this.exposeRemoteControl()
  }

  private exposeRemoteControl() {
    // Exposed so the pop-out notes window can drive the deck via window.opener
    const api: PlayerRemote = {
      toggle: () => {
        if (this.playing) this.pause()
        else this.resume()
      },
      pause: () => this.pause(),
      resume: () => this.resume(),
      restart: () => this.restart(),
      next: () => this.deck?.next(),
      prev: () => this.deck?.prev(),
    }
    ;(window as unknown as { __wutiPlayer?: PlayerRemote }).__wutiPlayer = api
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('keydown', this.onKey)
    this.audioEl?.pause()
    if (this.notesWindow && !this.notesWindow.closed) {
      this.notesWindow.close()
    }
    this.notesWindow = null
    delete (window as unknown as { __wutiPlayer?: PlayerRemote }).__wutiPlayer
  }

  protected updated(changed: PropertyValues) {
    // New deck or audio variant — reset player state so nothing auto-plays.
    if (changed.has('slidesHtml') || changed.has('audio')) {
      if (this.audioEl) {
        this.audioEl.pause()
        this.audioEl.currentTime = 0
      }
      this.playing = false
      this.progress = 0
      if (this.initialized && this.deck) {
        // Reveal may have been mid-deck before the import — force slide 0.
        this.deck.sync?.()
        this.deck.slide(0)
        this.currentIndex = 0
      }
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'KeyP') {
      e.preventDefault()
      if (this.playing) this.pause()
      else this.resume()
    } else if (e.code === 'KeyR') {
      e.preventDefault()
      this.restart()
    }
  }

  private updateNotes() {
    const slide = this.slides[this.currentIndex]
    if (!slide) return
    this.currentNotes = this.editedNotes[slide.index] ?? slide.speakerNotes ?? ''
    this.pushToNotesWindow()
    this.dispatchEvent(
      new CustomEvent('slidechange', {
        detail: { index: this.currentIndex },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private popOutNotes() {
    if (this.notesWindow && !this.notesWindow.closed) {
      this.notesWindow.focus()
      return
    }
    const w = window.open('', 'wuti-notes', 'width=640,height=880,resizable=yes,scrollbars=yes')
    if (!w) return
    this.notesWindow = w
    w.document.open()
    w.document.write(NOTES_WINDOW_HTML)
    w.document.close()
    w.addEventListener('beforeunload', () => {
      this.notesWindow = null
    })
    this.pushToNotesWindow()
  }

  private pushToNotesWindow() {
    const w = this.notesWindow
    if (!w || w.closed) return
    const total = this.slides.length
    const idx = this.currentIndex
    const slide = this.slides[idx]
    try {
      const counter = w.document.getElementById('counter')
      const titleEl = w.document.getElementById('slide-title')
      const notesEl = w.document.getElementById('notes')
      const toggleBtn = w.document.getElementById('btn-toggle')
      if (counter) counter.textContent = `${idx + 1} / ${total}`
      if (titleEl) titleEl.textContent = slide?.title || ''
      if (notesEl) notesEl.textContent = this.currentNotes || '(no notes for this slide)'
      if (toggleBtn) toggleBtn.textContent = this.playing ? '⏸ Pause' : '▶ Play'
    } catch {
      // Cross-origin or closed
    }
  }

  private async start() {
    if (!this.initialized) return
    this.playing = true
    await this.playCurrent()
  }

  private async playCurrent() {
    if (!this.playing) return
    this.updateNotes()
    const item = this.audio[this.currentIndex]
    if (!item?.file) {
      await this.wait(2500)
      this.advance()
      return
    }
    if (!this.audioEl) {
      this.audioEl = new Audio()
      this.audioEl.addEventListener('timeupdate', () => {
        if (this.audioEl && this.audioEl.duration) {
          this.progress = this.audioEl.currentTime / this.audioEl.duration
        }
      })
    }
    if (this.audioEl.src !== location.origin + item.file) {
      this.audioEl.src = item.file
    }
    this.audioEl.playbackRate = this.rate
    this.audioEl.onended = () => this.advance()
    try {
      await this.audioEl.play()
    } catch (err) {
      console.error('audio play failed', err)
    }
  }

  private advance() {
    if (!this.playing) return
    if (this.currentIndex >= this.slides.length - 1) {
      this.playing = false
      return
    }
    // The slidechanged handler will drive audio switching.
    this.deck.next()
  }

  private pause() {
    this.playing = false
    this.audioEl?.pause()
  }

  private async resume() {
    if (!this.initialized) return
    this.playing = true
    const a = this.audioEl
    const canResumeInPlace = a && a.src && !a.ended && a.currentTime > 0
    if (canResumeInPlace) {
      await a!.play()
    } else {
      await this.playCurrent()
    }
  }

  private restart() {
    this.pause()
    if (this.audioEl) this.audioEl.currentTime = 0
    this.progress = 0
    this.deck?.slide(0)
    this.currentIndex = 0
  }

  private wait(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms))
  }

  private onRate(e: Event) {
    this.rate = parseFloat((e.target as HTMLInputElement).value)
    if (this.audioEl) this.audioEl.playbackRate = this.rate
  }

  private onTogglePanel(id: PanelId) {
    this.dispatchEvent(
      new CustomEvent('paneltoggle', {
        detail: { panel: id },
        bubbles: true,
        composed: true,
      }),
    )
  }

  render() {
    const rawDuration = this.audio.reduce((a, b) => a + (b?.durationSec || 0), 0)
    const totalDuration = rawDuration / Math.max(this.rate, 0.01)
    return html`
      <div class="flex flex-col gap-3 h-full min-h-0">
        <div class="reveal flex-1 min-h-0" style="background: #faf8f3;">
          <div class="slides">${unsafeHTML(this.slidesHtml)}</div>
        </div>

        <div
          class="flex items-center gap-4 flex-wrap p-4 bg-stone-100 rounded-xl border border-stone-200"
        >
          ${!this.playing
            ? html`
                <button
                  class="px-5 py-2 rounded-full bg-stone-900 text-white text-sm hover:bg-stone-700"
                  @click=${this.start.bind(this)}
                >
                  ▶ Play
                </button>
                <button
                  class="px-4 py-2 rounded-full border border-stone-400 text-sm hover:bg-white"
                  @click=${this.resume.bind(this)}
                >
                  Resume
                </button>
              `
            : html`
                <button
                  class="px-5 py-2 rounded-full bg-stone-900 text-white text-sm hover:bg-stone-700"
                  @click=${this.pause.bind(this)}
                >
                  ⏸ Pause
                </button>
              `}
          <button
            class="px-4 py-2 rounded-full border border-stone-400 text-sm hover:bg-white"
            @click=${this.restart.bind(this)}
          >
            ↺ Restart
          </button>
          <button
            class="px-4 py-2 rounded-full border border-stone-400 text-sm hover:bg-white"
            @click=${this.popOutNotes.bind(this)}
          >
            ⧉ Popup
          </button>

          ${PANEL_TABS.map((t) => {
            const open = this.openPanel === t.id
            const cls = open
              ? 'h-9 w-9 rounded-full border border-stone-900 bg-stone-900 text-white flex items-center justify-center'
              : 'h-9 w-9 rounded-full border border-stone-400 text-stone-700 hover:bg-white flex items-center justify-center'
            return html`
              <button
                class=${cls}
                data-tip=${t.label}
                aria-label=${t.label}
                aria-pressed=${open}
                @click=${() => this.onTogglePanel(t.id)}
              >
                <span class="w-5 h-5 inline-block">${t.icon}</span>
              </button>
            `
          })}

          <label class="text-sm text-stone-700 flex items-center gap-2">
            Speed
            <input
              type="range"
              min="0.75"
              max="1.5"
              step="0.05"
              .value=${String(this.rate)}
              @input=${this.onRate.bind(this)}
            />
            <span class="tabular-nums">${this.rate.toFixed(2)}×</span>
          </label>

          <span class="text-sm text-stone-500 ml-auto tabular-nums">
            ${this.currentIndex + 1} / ${this.slides.length} ·
            Total ${formatTime(totalDuration)}
          </span>
        </div>

        <div class="h-1 bg-stone-200 rounded overflow-hidden">
          <div
            class="h-full bg-stone-900 transition-all"
            style="width: ${((this.currentIndex + this.progress) / Math.max(this.slides.length, 1)) * 100}%"
          ></div>
        </div>

      </div>
    `
  }
}

interface PlayerRemote {
  toggle: () => void
  pause: () => void
  resume: () => Promise<void> | void
  restart: () => void
  next: () => void
  prev: () => void
}

function formatTime(sec: number): string {
  if (!sec || !isFinite(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * HTML template for the pop-out speaker notes window. Kept as a module-level
 * constant so the player method stays readable. The inline script talks back
 * to `window.opener.__wutiPlayer` which is exposed by WutiPlayer.firstUpdated.
 */
const NOTES_WINDOW_HTML = `<!doctype html><html><head><meta charset="utf-8" /><title>Wuti — Speaker Notes</title>
<style>
  :root { color-scheme: light; }
  html, body { margin:0; padding:0; background:#faf8f3; color:#1a1a1a;
    font-family: Georgia, 'Noto Serif TC', serif; }
  body { padding: 0; line-height: 1.75; font-size: 20px; }
  .wrap { padding: 24px 32px 96px; }
  header { display:flex; align-items:baseline; justify-content:space-between;
    border-bottom: 1px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 18px; }
  header .title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; }
  header .counter { font-size: 14px; color: #888; font-variant-numeric: tabular-nums; }
  h2 { font-size: 22px; margin: 0 0 14px 0; font-weight: 600; }
  #notes { white-space: pre-wrap; font-size: 22px; }
  #bar { position: fixed; left: 0; right: 0; bottom: 0; background: #1a1a1a;
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 14px 16px; box-shadow: 0 -4px 16px rgba(0,0,0,0.15); }
  #bar button { background: transparent; border: 1px solid rgba(255,255,255,0.3);
    color: #faf8f3; font-family: inherit; font-size: 14px; padding: 8px 14px;
    border-radius: 999px; cursor: pointer; min-width: 44px; }
  #bar button:hover { background: rgba(255,255,255,0.1); }
  #bar .primary { background: #faf8f3; color: #1a1a1a; font-weight: 600; }
  #bar .primary:hover { background: #fff; }
  #hint { position: fixed; top: 10px; right: 14px; font-size: 12px; color: #999; }
</style>
</head><body>
<div class="wrap">
  <header><span class="title">Speaker Notes</span><span class="counter" id="counter">— / —</span></header>
  <h2 id="slide-title"></h2>
  <div id="notes">(waiting)</div>
</div>
<div id="hint">Space · ← → · R</div>
<div id="bar">
  <button data-cmd="prev" title="Previous slide (←)">◀</button>
  <button data-cmd="toggle" class="primary" id="btn-toggle" title="Play / Pause (Space)">▶ Play</button>
  <button data-cmd="next" title="Next slide (→)">▶</button>
  <button data-cmd="restart" title="Restart (R)">↺</button>
</div>
<script>
  const call = (cmd) => {
    try { window.opener && window.opener.__wutiPlayer && window.opener.__wutiPlayer[cmd](); }
    catch (e) { console.error(e); }
  };
  document.querySelectorAll('#bar button').forEach(b => {
    b.addEventListener('click', () => call(b.dataset.cmd));
  });
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') { e.preventDefault(); call('toggle'); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); call('next'); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); call('prev'); }
    else if (e.code === 'KeyR') { e.preventDefault(); call('restart'); }
    else if (e.code === 'KeyP') { e.preventDefault(); call('toggle'); }
  });
</script>
</body></html>`
