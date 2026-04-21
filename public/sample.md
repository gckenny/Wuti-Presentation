# Your Deck Title Goes Here

## Cover slide — how this file works

Anything on the first `##` heading becomes the cover.
The first H1 (`# ...`) above is the overall deck title.

### Speaker Notes

Whatever you write under a `Speaker Notes` heading becomes the spoken narration for that slide. Write it the way you'd say it out loud — short sentences, natural pauses, no jargon the TTS voice can't pronounce.

---

## One heading, one slide

Every `##` starts a new slide. The body under it is free-form Markdown:

- Bulleted lists work
- So do **bold**, *italic*, `inline code`, and [links](https://example.com)
- Tables, code blocks, and blockquotes render as-is (GitHub-flavored)

The `---` separator is optional — it just helps readability in your editor.

### Speaker Notes

This slide shows that the body of each slide is just Markdown. You don't need a special format. Tables and code blocks keep their shape. If you can write a GitHub README, you can write a Wuti deck.

---

## Code and tables, as a sanity check

```ts
function narrate(slide: Slide): string {
  return slide.speakerNotes || slide.title
}
```

| Feature         | Supported  |
| --------------- | ---------- |
| Fenced code     | Yes        |
| GFM tables      | Yes        |
| Emoji in notes  | Please don't — TTS reads them literally |

### Speaker Notes

Fenced code blocks keep their formatting with syntax highlighting. Tables render as real tables. One warning — avoid putting emoji inside speaker notes, because the text-to-speech voice will read the emoji names out loud, which nobody wants.

---

## That's the whole format

Drop this file into the uploader to see it run end-to-end. Then copy, rename, and overwrite with your own content.

### Speaker Notes

That is the entire format. There is no hidden step. You drop a Markdown file in, the app parses it, renders slides, synthesizes speech, and plays it back. Now go write the deck you actually came here to write.
