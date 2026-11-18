// Block references, as in Obsidian: a line ending in ` ^id` can be linked to as `[[Note#^id]]`, and a heading as
// `[[Note#Heading]]`. The id is written in the note, so links keep working in other apps that read the files.

/** A block id at the end of a line: ` ^abc123`. */
export const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/

/** A short new id, unlikely to clash within a note. */
export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** The line's own id, if it has one. */
export const blockIdOf = (line: string): string | null => BLOCK_ID.exec(line)?.[1] ?? null

/** The line without its id. */
export const stripBlockId = (line: string): string => line.replace(BLOCK_ID, '')

const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/

/** The heading text a line is, or null. */
export const headingText = (line: string): string | null => HEADING.exec(line)?.[1] ?? null

/**
 * The line an anchor points at: `^id` finds the line carrying that id, anything else the heading with that text
 * (capitals ignored). -1 when there is none.
 */
export function anchorLine(content: string, anchor: string): number {
  const lines = content.split('\n')
  const a = anchor.replace(/^#/, '').trim()
  if (!a) return -1
  if (a.startsWith('^')) {
    const id = a.slice(1)
    return lines.findIndex((l) => blockIdOf(l) === id)
  }
  const want = a.toLowerCase()
  return lines.findIndex((l) => headingText(l)?.trim().toLowerCase() === want)
}

export interface Block {
  /** Index of the line in the note. */
  line: number
  /** The line as it reads, without list markers or its id. */
  text: string
  id: string | null
}

/** The lines of a note that can be linked to: paragraphs and list items, not headings, code or front matter. */
export function blocksOf(content: string): Block[] {
  const out: Block[] = []
  let fence = false
  content.split('\n').forEach((raw, line) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence
      return
    }
    if (fence || !raw.trim() || headingText(raw) !== null || /^\s*(---|\|)/.test(raw) || raw.startsWith('<!--')) return
    const text = stripBlockId(raw)
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?/, '')
      .replace(/^>\s?/, '')
      .trim()
    if (text) out.push({ line, text, id: blockIdOf(raw) })
  })
  return out
}
