export interface Slide {
  index: number
  title: string
  body: string
  speakerNotes: string
}

export interface ParsedDeck {
  title: string
  slides: Slide[]
}

export function parseSlides(md: string): ParsedDeck {
  const lines = md.split('\n')
  const firstH1 = lines.find((l) => /^#\s+/.test(l))
  const title = firstH1 ? firstH1.replace(/^#\s+/, '').trim() : 'Untitled'

  const parts: string[] = []
  let buffer: string[] = []
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (buffer.length) parts.push(buffer.join('\n'))
      buffer = [line]
    } else if (buffer.length) {
      buffer.push(line)
    }
  }
  if (buffer.length) parts.push(buffer.join('\n'))

  const slides = parts.map((raw, index): Slide => {
    const rawTitle = raw.match(/^##\s+(.+)$/m)?.[1].trim() ?? `Slide ${index + 1}`
    const slideTitle = stripSlidePrefix(rawTitle) || `Slide ${index + 1}`
    const notesIdx = raw.search(/^###\s+Speaker Notes/m)
    const rawBody = notesIdx === -1 ? raw : raw.substring(0, notesIdx)
    const rawNotes =
      notesIdx === -1 ? '' : raw.substring(notesIdx).replace(/^###\s+Speaker Notes\s*\n?/m, '')
    return {
      index,
      title: slideTitle,
      body: stripTrailingHr(rawBody),
      speakerNotes: stripTrailingHr(rawNotes),
    }
  })

  return { title, slides }
}

function stripTrailingHr(s: string): string {
  return s.replace(/\n-{3,}\s*$/gm, '').trim()
}

/**
 * Remove a leading "Slide N — " / "Slide N -" / "Slide N :" prefix so titles
 * read as pure content (e.g. "Slide 1 — 封面" → "封面").
 */
function stripSlidePrefix(title: string): string {
  return title.replace(/^Slide\s*\d+\s*(?:[—–\-:·]\s*)?/i, '').trim()
}
