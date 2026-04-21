import { marked } from 'marked'
import type { ParsedDeck, Slide } from './parse-md.js'

marked.setOptions({ gfm: true, breaks: false })

export function renderDeck(deck: ParsedDeck): string {
  return deck.slides.map((s, i) => renderSlide(s, i === 0)).join('\n\n')
}

function renderSlide(slide: Slide, isCover: boolean): string {
  const bodyMd = slide.body.replace(/^##\s+.*$/m, '').trim()
  const bodyHtml = marked.parse(bodyMd, { async: false }) as string
  const titleTag = isCover ? 'h1' : 'h2'
  const coverAttr = isCover ? ' data-state="cover"' : ''
  const classes = isCover ? 'wuti-section wuti-cover' : 'wuti-section'
  return `<section class="${classes}"${coverAttr}>
  <${titleTag} class="wuti-title">${escapeHtml(slide.title)}</${titleTag}>
  <div class="wuti-body">${bodyHtml}</div>
</section>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
