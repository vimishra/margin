// Keeping finished tasks out of the way, on the text of a note: a ticked task sinks to the end of its list, and
// "archive" moves ticked tasks into an "## Archive" section at the end of the page. Pure functions on lines.
import { TASK_LINE } from './tasks'

const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s/
const ARCHIVE_HEADING = /^#{1,6}\s+Archive\s*#*\s*$/i
export const ARCHIVE = 'Archive'

const indentOf = (line: string) => /^\s*/.exec(line)![0].replace(/\t/g, '    ').length

/** The end (exclusive) of the block a list item starts: its line and the non-blank lines indented under it. */
export function blockEnd(lines: string[], i: number): number {
  const own = indentOf(lines[i])
  let end = i + 1
  while (end < lines.length && lines[end].trim() && indentOf(lines[end]) > own) end++
  return end
}

/** Lines inside fenced code blocks, which hold no tasks. */
function fenced(lines: string[]): boolean[] {
  const out: boolean[] = []
  let fence: string | null = null
  for (const line of lines) {
    const f = /^\s{0,3}(```+|~~~+)/.exec(line)
    if (f) {
      out.push(true)
      if (fence === null) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    out.push(fence !== null)
  }
  return out
}

/**
 * Move the task block starting at line `i` (the task and everything indented under it) to after the last of the
 * list items that follow it at the same indent, so a ticked task goes to the end of its own list. The list ends at
 * a blank line, a heading, or a line indented less. Null when it is already last.
 */
export function sinkTask(lines: string[], i: number): { lines: string[]; from: number; to: number } | null {
  if (!LIST_ITEM.test(lines[i] ?? '')) return null
  const own = indentOf(lines[i])
  const end = blockEnd(lines, i)
  let last = end
  while (last < lines.length && LIST_ITEM.test(lines[last]) && indentOf(lines[last]) === own) last = blockEnd(lines, last)
  if (last === end) return null
  const next = [...lines.slice(0, i), ...lines.slice(end, last), ...lines.slice(i, end), ...lines.slice(last)]
  return { lines: next, from: i, to: last }
}

/** The line that differs between two versions of a text that differ in one line (a tick), or -1. */
export function changedLine(before: string, after: string): number {
  const a = before.split('\n')
  const b = after.split('\n')
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i
  return -1
}

/** The text after ticking the task on line `i`, with it moved to the end of its list. Unchanged if it is last. */
export function sinkInText(text: string, i: number): string {
  const lines = text.split('\n')
  const done = TASK_LINE.exec(lines[i] ?? '')
  if (!done || done[2] === ' ') return text
  const moved = sinkTask(lines, i)
  return moved ? moved.lines.join('\n') : text
}

/** Where the Archive section is: its heading line and the end (exclusive) of its section. Null if there is none. */
export function archiveSection(lines: string[]): { start: number; end: number; level: number } | null {
  const inCode = fenced(lines)
  const start = lines.findIndex((l, i) => !inCode[i] && ARCHIVE_HEADING.test(l))
  if (start < 0) return null
  const level = /^#+/.exec(lines[start])![0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const h = !inCode[i] && /^(#{1,6})\s/.exec(lines[i])
    if (h && h[1].length <= level) {
      end = i
      break
    }
  }
  return { start, end, level }
}

export interface ArchiveOptions {
  /** Only the section that holds this line (0-based); otherwise the whole page. */
  line?: number
  /** Only tasks done before this day (YYYY-MM-DD), by their @done date; tasks without one are then left alone. */
  before?: string
}

/**
 * Move ticked tasks into the "## Archive" section at the end of the page, each under a "### <heading>" naming the
 * section it came from. A ticked task takes the lines indented under it with it, but only when every task among them
 * is ticked too, and a ticked task under an open one stays with it. Tasks already in the Archive are left alone.
 */
export function archiveTasks(page: string, opts: ArchiveOptions = {}): { page: string; count: number; archiveLine: number } {
  const lines = page.split('\n')
  const inCode = fenced(lines)
  const archive = archiveSection(lines)
  const inArchive = (i: number) => !!archive && i >= archive.start && i < archive.end
  // The heading above each line, and where the requested section starts and ends.
  const headingAt: string[] = []
  const headingLevel: number[] = []
  let current = ''
  let currentLevel = 0
  lines.forEach((l, i) => {
    const h = !inCode[i] && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l)
    if (h) {
      current = h[2].trim()
      currentLevel = h[1].length
    }
    headingAt.push(current)
    headingLevel.push(currentLevel)
  })
  let from = 0
  let to = lines.length
  if (opts.line !== undefined) {
    let start = -1
    for (let i = Math.min(opts.line, lines.length - 1); i >= 0; i--) if (!inCode[i] && /^#{1,6}\s/.test(lines[i])) { start = i; break }
    if (start >= 0) {
      const level = /^#+/.exec(lines[start])![0].length
      from = start + 1
      to = lines.length
      for (let i = start + 1; i < lines.length; i++) if (!inCode[i] && /^(#{1,6})\s/.exec(lines[i]) && /^#+/.exec(lines[i])![0].length <= level) { to = i; break }
    }
  }

  const taken: { from: number; to: number; heading: string }[] = []
  for (let i = from; i < to; i++) {
    if (inCode[i] || inArchive(i)) continue
    const m = TASK_LINE.exec(lines[i])
    if (!m || m[2] === ' ') continue
    // A ticked task under an open one belongs to it until that one is done.
    let parentOpen = false
    for (let j = i - 1, own = indentOf(lines[i]); j >= 0 && lines[j].trim() && own > 0; j--) {
      if (indentOf(lines[j]) < own) {
        const p = TASK_LINE.exec(lines[j])
        if (p && p[2] === ' ') parentOpen = true
        if (LIST_ITEM.test(lines[j])) break
      }
    }
    if (parentOpen) continue
    if (opts.before) {
      const done = /@done\((\d{4}-\d{2}-\d{2})\)/.exec(m[4])
      if (!done || done[1] >= opts.before) continue
    }
    const end = Math.min(blockEnd(lines, i), to)
    // Only when everything under it is finished too: an open sub-task would vanish from view.
    if (lines.slice(i + 1, end).some((l) => (TASK_LINE.exec(l)?.[2] ?? 'x') === ' ')) continue
    taken.push({ from: i, to: end, heading: headingAt[i] })
    i = end - 1
  }
  if (!taken.length) return { page, count: 0, archiveLine: archive?.start ?? -1 }

  // The blocks, written at the left edge, grouped by the heading they came from, in the order they were found.
  const groups = new Map<string, string[]>()
  for (const t of taken) {
    const block = lines.slice(t.from, t.to)
    const cut = indentOf(block[0])
    groups.set(t.heading, [...(groups.get(t.heading) ?? []), ...block.map((l) => l.slice(Math.min(cut, /^\s*/.exec(l)![0].length)))])
  }
  const kept = lines.filter((_l, i) => !taken.some((t) => i >= t.from && i < t.to))
  // Close up doubled blank lines left where tasks were taken out.
  const tidy = kept.filter((l, i) => l.trim() || !(kept[i - 1] !== undefined && !kept[i - 1].trim()))

  let out = tidy
  let sec = archiveSection(out)
  if (!sec) {
    while (out.length && !out[out.length - 1].trim()) out = out.slice(0, -1)
    out = [...out, ...(out.length ? [''] : []), `## ${ARCHIVE}`, '']
    sec = archiveSection(out)!
  }
  const sub = '#'.repeat(Math.min(6, sec.level + 1))
  for (const [heading, block] of groups) {
    const s = archiveSection(out)!
    const name = heading && heading.toLowerCase() !== ARCHIVE.toLowerCase() ? heading : ''
    // Under "### <heading>" in the Archive, made if needed; tasks from above any heading go first, under none.
    let at: number
    if (name) {
      const idx = out.findIndex((l, i) => i > s.start && i < s.end && l.trim() === `${sub} ${name}`)
      if (idx >= 0) {
        at = idx + 1
        while (at < s.end && !/^#{1,6}\s/.test(out[at])) at++
        while (at > idx + 1 && !out[at - 1].trim()) at--
        out = [...out.slice(0, at), ...block, ...out.slice(at)]
        continue
      }
      at = s.end
      while (at > s.start + 1 && !out[at - 1].trim()) at--
      out = [...out.slice(0, at), '', `${sub} ${name}`, ...block, ...out.slice(at)]
    } else {
      at = s.start + 1
      while (at < s.end && !out[at].trim()) at++
      out = [...out.slice(0, at), ...block, ...out.slice(at)]
    }
  }
  return { page: out.join('\n').replace(/\n+$/, '') + '\n', count: taken.length, archiveLine: archiveSection(out)!.start }
}
