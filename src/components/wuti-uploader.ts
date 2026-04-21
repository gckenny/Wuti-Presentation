import { LitElement, html } from 'lit'
import { customElement, query, state } from 'lit/decorators.js'

@customElement('wuti-uploader')
export class WutiUploader extends LitElement {
  @state() private dragging = false
  @query('details.wuti-help') private helpEl?: HTMLDetailsElement

  protected createRenderRoot() {
    return this
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('dragenter', this.onWindowDragOver)
    window.addEventListener('dragover', this.onWindowDragOver)
    window.addEventListener('dragleave', this.onWindowDragLeave)
    window.addEventListener('drop', this.onWindowDrop)
    document.addEventListener('mousedown', this.onDocMouseDown)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('dragenter', this.onWindowDragOver)
    window.removeEventListener('dragover', this.onWindowDragOver)
    window.removeEventListener('dragleave', this.onWindowDragLeave)
    window.removeEventListener('drop', this.onWindowDrop)
    document.removeEventListener('mousedown', this.onDocMouseDown)
  }

  private onDocMouseDown = (e: MouseEvent) => {
    const el = this.helpEl
    if (!el?.open) return
    if (!e.composedPath().includes(el)) el.open = false
  }

  private emit(file: File) {
    this.dispatchEvent(
      new CustomEvent('file', {
        detail: { file },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private hasFile(e: DragEvent): boolean {
    return e.dataTransfer?.types?.includes('Files') ?? false
  }

  private onWindowDragOver = (e: DragEvent) => {
    if (!this.hasFile(e)) return
    e.preventDefault()
    this.dragging = true
  }

  private onWindowDragLeave = (e: DragEvent) => {
    // Only clear when leaving the window itself
    if (e.relatedTarget === null || (e as any).clientX === 0) {
      this.dragging = false
    }
  }

  private onWindowDrop = (e: DragEvent) => {
    if (!this.hasFile(e)) return
    e.preventDefault()
    this.dragging = false
    const file = e.dataTransfer?.files?.[0]
    if (file) this.emit(file)
  }

  private onPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) this.emit(file)
  }

  render() {
    return html`
      <label
        class="relative block border-2 border-dashed rounded-3xl p-20 text-center cursor-pointer transition border-stone-400 hover:border-stone-700"
      >
        <details class="wuti-help absolute top-4 right-4 text-left" @click=${(e: Event) => e.stopPropagation()}>
          <summary
            class="list-none w-8 h-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-500 hover:bg-stone-100 select-none"
            aria-label="Markdown format help"
          >
            ?
          </summary>
          <div
            class="absolute right-0 mt-2 w-80 p-4 bg-white border border-stone-200 rounded-xl shadow-lg text-xs text-stone-600 leading-relaxed z-10"
          >
            <p class="font-semibold text-stone-800 mb-2">Markdown format</p>
            <ul class="space-y-1 list-disc pl-4">
              <li>Each <code class="bg-stone-100 px-1 rounded">## Slide</code> heading becomes one slide.</li>
              <li>
                Each <code class="bg-stone-100 px-1 rounded">### Speaker Notes</code> section under a slide is converted
                to voice.
              </li>
              <li>Tables, lists, code blocks and blockquotes render as-is.</li>
              <li>
                Not sure what a valid file looks like? Grab
                <a
                  href="${import.meta.env.BASE_URL}sample.md"
                  download="wuti-sample.md"
                  class="text-stone-800 underline underline-offset-2 hover:bg-stone-900 hover:text-white"
                  @click=${(e: Event) => e.stopPropagation()}
                  >sample.md</a
                >
                and open it in your editor.
              </li>
            </ul>
          </div>
        </details>

        <p class="text-2xl mb-3" style="font-family: Georgia, 'Noto Serif TC', serif;">
          Drop your .md file anywhere on this page
        </p>
        <p class="text-sm text-stone-500 mb-8">
          or click to pick a file — Markdown deck with Speaker Notes supported
        </p>
        <input
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          class="hidden"
          @change=${this.onPick.bind(this)}
        />
        <span
          class="inline-block px-8 py-3 rounded-full bg-stone-900 text-white text-sm tracking-wide"
        >
          Choose file
        </span>
      </label>

      ${this.dragging
        ? html`
            <div
              class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
              style="background: rgba(26,26,26,0.78); backdrop-filter: blur(6px);"
            >
              <div
                class="text-center text-white"
                style="font-family: Georgia, 'Noto Serif TC', serif;"
              >
                <p class="text-5xl mb-4">Drop anywhere</p>
                <p class="text-sm opacity-70">Release to upload your Markdown deck</p>
              </div>
            </div>
          `
        : ''}
    `
  }
}
