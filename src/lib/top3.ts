// The "Top 3" list at the head of a daily note: what is not ticked by the end of the day moves to the next day.
import { TASK_LINE } from './tasks'

const CANVAS = '\n\n<!-- canvas -->'
const HEADING = /^#{1,6}\s+top\s*(?:3|three)\b/i
const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/

function split(content: string): { lines: string[]; tail: string } {
  const at = content.indexOf(CANVAS)
  return { lines: (at < 0 ? content : content.slice(0, at)).split('\n'), tail: at < 0 ? '' : content.slice(at) }
}

/** Where the Top 3 section is: the line of its heading and the line after its last one. Null if the note has none. */
function section(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((l) => HEADING.test(l))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i
      break
    }
  }
  return { start, end }
}

/**
 * Take the unfinished items out of a note's Top 3. Each item comes back as its lines (the item and anything
 * nested under it), written as an unticked task. Ticked items and struck-through ones stay where they are.
 */
export function takeUnfinishedTop3(content: string): { items: string[][]; rest: string } {
  const { lines, tail } = split(content)
  const sec = section(lines)
  if (!sec) return { items: [], rest: content }
  const items: string[][] = []
  const keep: string[] = []
  for (let i = sec.start + 1; i < sec.end; i++) {
    const line = lines[i]
    const m = ITEM.exec(line)
    const task = TASK_LINE.exec(line)
    const text = task ? task[4] : m ? m[2] : ''
    const top = !!m && m[1].length === 0
    const unfinished = top && !!text.trim() && (task ? task[2] === ' ' : !/^~~.*~~$/.test(text.trim()))
    if (!unfinished) {
      keep.push(line)
      continue
    }
    // An item written without a checkbox becomes a task, so it can be ticked from now on.
    const block = [task ? line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '- ') : `- [ ] ${text}`]
    while (i + 1 < sec.end && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i])
    items.push(block)
  }
  if (!items.length) return { items, rest: content }
  // Leave an empty checkbox behind if the list is now empty, so the section still invites an entry.
  if (!keep.some((l) => ITEM.test(l))) {
    while (keep.length && !keep[keep.length - 1].trim()) keep.pop()
    while (keep.length && !keep[0].trim()) keep.shift()
    keep.unshift('')
    keep.push('- [ ] ', '')
  }
  const rest = [...lines.slice(0, sec.start + 1), ...keep, ...lines.slice(sec.end)].join('\n') + tail
  return { items, rest }
}

/** Put items into a note's Top 3, after what is already there. An empty placeholder item is replaced. */
export function addToTop3(content: string, items: string[][]): string {
  if (!items.length) return content
  const { lines, tail } = split(content)
  const added = items.flat()
  const sec = section(lines)
  if (!sec) return ['## Top 3', '', ...added, '', ...lines].join('\n') + tail
  const body = lines.slice(sec.start + 1, sec.end).filter((l) => !/^\s*(?:[-*+]|\d+[.)])\s*(?:\[ \])?\s*$/.test(l))
  while (body.length && !body[body.length - 1].trim()) body.pop()
  while (body.length && !body[0].trim()) body.shift()
  return [...lines.slice(0, sec.start + 1), '', ...body, ...added, '', ...lines.slice(sec.end)].join('\n') + tail
}
