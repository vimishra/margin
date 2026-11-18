// What the status bar counts in a note: words and characters of the text as it reads (markdown marks, link
// addresses, block ids and task details left out), reading time, and its tasks.
import { TASK_LINE } from './tasks'

/** The note's text as a reader sees it, for counting. */
export function readableText(md: string): string {
  return md
    .replace(/^(```|~~~)[^\n]*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, t, label) => label || t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\^[^\]]+\]:?/g, '')
    .replace(/\s\^[A-Za-z0-9-]+$/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?/gm, '')
    .replace(/^\s*>\s?(\[![A-Za-z-]+\][+-]?\s*)?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(^|\s)(P[1-3]|>(?:\d{4}-\d{2}-\d{2}|someday)|@(?:due|done|cancelled|repeat|remind)\([^)]*\))(?=\s|$)/gim, '$1')
    .replace(/[*_~`=]+/g, '')
}

export const wordCount = (text: string): number => (text.match(/[\p{L}\p{N}]+(?:['’.\-][\p{L}\p{N}]+)*/gu) ?? []).length

/** Characters, not counting line breaks. */
export const charCount = (text: string): number => text.replace(/\r?\n/g, '').length

export interface TaskCounts {
  open: number
  done: number
  cancelled: number
}

export function taskCounts(md: string): TaskCounts {
  const out = { open: 0, done: 0, cancelled: 0 }
  let fence = false
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const m = TASK_LINE.exec(line)
    if (!m || !m[4].trim()) continue
    if (m[2] === ' ') out.open++
    else if (m[2] === '-') out.cancelled++
    else out.done++
  }
  return out
}
