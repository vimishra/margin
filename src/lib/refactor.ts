// The text side of reorganising notes: finding a section, splitting a page by its headings, and shifting heading
// levels. Pure functions on markdown text; the actions that create, change and move notes are in `refactor.ts`.

export interface Section {
  /** Index of the heading's line in the page's lines. */
  start: number
  /** Index of the first line after the section (the next heading of the same or a higher level, or the end). */
  end: number
  level: number
  /** The heading's text, without the #s and without markup. */
  title: string
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** The page's headings, outside fenced code blocks, as sections reaching to the next heading of their level or higher. */
export function sections(page: string): Section[] {
  const lines = page.split('\n')
  const found: { start: number; level: number; title: string }[] = []
  let fence: string | null = null
  lines.forEach((line, i) => {
    const f = /^\s{0,3}(```+|~~~+)/.exec(line)
    if (f) {
      if (fence === null) fence = f[1][0].repeat(f[1].length)
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      return
    }
    if (fence !== null) return
    const m = HEADING.exec(line)
    if (m) found.push({ start: i, level: m[1].length, title: plainTitle(m[2]) })
  })
  return found.map((h, k) => {
    const next = found.slice(k + 1).find((x) => x.level <= h.level)
    return { ...h, end: next ? next.start : lines.length }
  })
}

/** Heading text as a note title: link brackets, emphasis and code marks taken out. */
export function plainTitle(text: string): string {
  return text
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

/** The section the given line is in: the closest heading at or above it. */
export function sectionAtLine(page: string, line: number): Section | null {
  const all = sections(page).filter((s) => s.start <= line && line < s.end)
  return all.length ? all[all.length - 1] : null
}

/** Trim blank lines from both ends of a block of lines. */
export function trimLines(lines: string[]): string[] {
  let a = 0
  let b = lines.length
  while (a < b && !lines[a].trim()) a++
  while (b > a && !lines[b - 1].trim()) b--
  return lines.slice(a, b)
}

/** Move every heading (outside code blocks) up or down by `by` levels, kept between 1 and 6. */
export function shiftHeadings(text: string, by: number): string {
  if (!by) return text
  let fence: string | null = null
  return text
    .split('\n')
    .map((line) => {
      const f = /^\s{0,3}(```+|~~~+)/.exec(line)
      if (f) {
        if (fence === null) fence = f[1]
        else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
        return line
      }
      if (fence !== null) return line
      const m = /^(#{1,6})(\s.*)$/.exec(line)
      return m ? '#'.repeat(Math.min(6, Math.max(1, m[1].length + by))) + m[2] : line
    })
    .join('\n')
}

/** The shallowest heading level in a page, or 0 if it has none. */
export function topLevel(page: string): number {
  const all = sections(page)
  return all.length ? Math.min(...all.map((s) => s.level)) : 0
}

/**
 * A page cut at its top-level headings: the text before the first one, and each section with its title and its
 * text (the heading line itself left out, the headings under it raised so the section's subheadings start at ##).
 */
export function splitAtTop(page: string): { intro: string; parts: { title: string; body: string }[]; level: number } {
  const level = topLevel(page)
  const lines = page.split('\n')
  if (!level) return { intro: page, parts: [], level }
  const tops = sections(page).filter((s) => s.level === level)
  const intro = trimLines(lines.slice(0, tops[0].start)).join('\n')
  const parts = tops.map((s) => {
    const body = trimLines(lines.slice(s.start + 1, s.end)).join('\n')
    // Its subheadings were one level below the section; in a note of its own they start at ##.
    return { title: s.title, body: shiftHeadings(body, 2 - (level + 1)) }
  })
  return { intro, parts, level }
}

/** A title no other note has yet (links find notes by title), adding the context and then a number if needed. */
export function uniqueTitle(wanted: string, taken: (t: string) => boolean, context = ''): string {
  const base = wanted.trim() || 'Untitled'
  if (!taken(base)) return base
  const withContext = context ? `${base} (${context})` : base
  if (context && !taken(withContext)) return withContext
  for (let n = 2; ; n++) if (!taken(`${withContext} ${n}`)) return `${withContext} ${n}`
}

/**
 * Every `[[From]]`, `[[From|label]]` and `[[From#heading]]` in a text pointed at `to` instead, case-insensitively,
 * as renaming a note does.
 */
export function relink(text: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`\\[\\[\\s*${esc}\\s*(\\]\\]|\\||#)`, 'gi'), (_m, tail: string) => `[[${to}${tail}`)
}
