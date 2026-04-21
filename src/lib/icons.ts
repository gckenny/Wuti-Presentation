import { svg, type SVGTemplateResult } from 'lit'
import type { PanelId } from '../types'

/**
 * Wrap a Heroicons-style outline path in a standard 24x24 SVG shell. All three
 * panel icons share the same stroke / fill / viewBox so factoring this keeps
 * each definition to a single `d` string.
 */
function outlineIcon(d: string): SVGTemplateResult {
  return svg`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d=${d} />
    </svg>
  `
}

// Microphone
export const VoiceIcon: SVGTemplateResult = outlineIcon(
  'M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z',
)

// Clock (history / versions)
export const VersionsIcon: SVGTemplateResult = outlineIcon(
  'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
)

// Document with text (speaker notes)
export const NotesIcon: SVGTemplateResult = outlineIcon(
  'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12m-8.625.75h17.25c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125Z',
)

export const PANEL_TABS: Array<{ id: PanelId; icon: SVGTemplateResult; label: string }> = [
  { id: 'voice', icon: VoiceIcon, label: 'Voice' },
  { id: 'versions', icon: VersionsIcon, label: 'Versions' },
  { id: 'notes', icon: NotesIcon, label: 'Notes' },
]
