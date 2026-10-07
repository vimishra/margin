// List editing for the markdown editor: nest and un-nest items with Tab / Shift+Tab,
// keep numbered lists numbered, and switch lines between list kinds.
import type { EditorView } from '@codemirror/view'
import { lineDoneChanges } from '../lib/tasks'

const ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/

interface Item {
  indent: number
  marker: string
  /** Column where the item's text starts; a nested item must be indented at least this far. */
  content: number
}

function parse(text: string): Item | null {
  const m = ITEM.exec(text)
  return m ? { indent: m[1].length, marker: m[2], content: m[1].length + m[2].length + m[3].length } : null
}

const ordered = (marker: string) => /^\d/.test(marker)

/** Renumber every numbered list in a run of lines. Each list keeps the number its first item starts with. */
function renumber(lines: string[]): string[] {
  const stack: { indent: number; next: number }[] = []
  return lines.map((line) => {
    const item = parse(line)
    if (!item) {
      // Unindented text ends the list; indented text belongs to the item above.
      if (line.trim() && !/^\s/.test(line)) stack.length = 0
      return line
    }
    while (stack.length && stack[stack.length - 1].indent > item.indent) stack.pop()
    const top = stack[stack.length - 1]
    if (!ordered(item.marker)) {
      if (top && top.indent === item.indent) stack.pop()
      return line
    }
    let n: number
    if (top && top.indent === item.indent) n = top.next++
    else {
      n = parseInt(item.marker, 10)
      stack.push({ indent: item.indent, next: n + 1 })
    }
    const suffix = item.marker.slice(-1)
    return line.slice(0, item.indent) + n + suffix + line.slice(item.indent + item.marker.length)
  })
}

/** The run of non-blank lines around a line: the list it is part of. */
function block(view: EditorView, lineNumber: number) {
  const doc = view.state.doc
  let first = lineNumber
  let last = lineNumber
  while (first > 1 && doc.line(first - 1).text.trim()) first--
  while (last < doc.lines && doc.line(last + 1).text.trim()) last++
  const lines: string[] = []
  for (let n = first; n <= last; n++) lines.push(doc.line(n).text)
  return { first, last, lines }
}

function replaceBlock(view: EditorView, first: number, last: number, before: string[], after: string[], cursorLine: number, cursorShift: number) {
  if (before.join('\n') === after.join('\n')) return
  const doc = view.state.doc
  const head = view.state.selection.main.head
  const line = doc.lineAt(head)
  const column = Math.max(0, head - line.from + cursorShift)
  const from = doc.line(first).from
  let start = from
  for (let n = first; n < cursorLine; n++) start += after[n - first].length + 1
  view.dispatch({
    changes: { from, to: doc.line(last).to, insert: after.join('\n') },
    selection: { anchor: Math.min(start + column, start + after[cursorLine - first].length) },
    userEvent: 'input.indent',
  })
}

/**
 * Tab / Shift+Tab inside a list. Nesting uses the indentation markdown actually requires
 * ("1. " needs three spaces, "- " needs two), and numbering is fixed up afterwards.
 * Returns false when the cursor is not on a list item, so the normal Tab behaviour applies.
 */
export function shiftListItem(view: EditorView, direction: 1 | -1): boolean {
  const { state } = view
  const sel = state.selection.main
  const firstLine = state.doc.lineAt(sel.from).number
  const lastLine = state.doc.lineAt(sel.to).number
  if (!parse(state.doc.line(firstLine).text)) return false

  const { first, last, lines } = block(view, firstLine)
  const next = [...lines]
  let cursorShift = 0

  for (let n = firstLine; n <= Math.min(lastLine, last); n++) {
    const i = n - first
    const item = parse(next[i])
    if (!item) continue
    let target = item.indent
    let restart: number | null = null

    if (direction === 1) {
      // Nest under the nearest item above at the same level.
      let sibling: Item | null = null
      let lastChild: Item | null = null
      for (let j = i - 1; j >= 0; j--) {
        const above = parse(next[j])
        if (!above) continue
        if (above.indent < item.indent) break
        if (above.indent === item.indent) {
          sibling = above
          break
        }
        if (!lastChild) lastChild = above
      }
      if (!sibling) continue
      target = sibling.content
      // Join the sibling's existing sub-list if it has one, otherwise start a new one at 1.
      restart = lastChild && lastChild.indent === target && ordered(lastChild.marker) ? parseInt(lastChild.marker, 10) + 1 : 1
    } else {
      if (item.indent === 0) continue
      let parent: Item | null = null
      for (let j = i - 1; j >= 0; j--) {
        const above = parse(next[j])
        if (above && above.indent < item.indent) {
          parent = above
          break
        }
      }
      target = parent ? parent.indent : 0
      restart = parent && ordered(parent.marker) ? parseInt(parent.marker, 10) + 1 : 1
    }

    const delta = target - item.indent
    if (!delta) continue
    const shift = (line: string) => (delta > 0 ? ' '.repeat(delta) + line : line.slice(Math.min(-delta, line.length - line.trimStart().length)))
    // Sub-items and wrapped text under this item move with it.
    let end = i + 1
    while (end < next.length && next[end].length - next[end].trimStart().length > item.indent && n + (end - i) > lastLine) end++
    for (let k = i; k < end; k++) next[k] = shift(next[k])
    if (ordered(item.marker) && restart !== null) {
      next[i] = next[i].replace(/^(\s*)\d+/, `$1${restart}`)
    }
    if (n === state.doc.lineAt(sel.head).number) cursorShift = next[i].length - lines[i].length
  }

  replaceBlock(view, first, last, lines, renumber(next), state.doc.lineAt(sel.head).number, cursorShift)
  return true
}

const indentOf = (line: string) => line.length - line.trimStart().length

/**
 * Move the list item under the cursor up or down past its neighbour at the same level, taking its
 * sub-items with it, like an outliner. Returns false when the cursor is not on a list item.
 */
export function moveListItem(view: EditorView, direction: 1 | -1): boolean {
  const { state } = view
  const cursorLine = state.doc.lineAt(state.selection.main.head).number
  const item = parse(state.doc.line(cursorLine).text)
  if (!item) return false
  const { first, last, lines } = block(view, cursorLine)
  const i = cursorLine - first
  // The item plus everything nested under it.
  let end = i + 1
  while (end < lines.length && indentOf(lines[end]) > item.indent) end++

  let next: string[]
  let moved: number
  if (direction === -1) {
    let j = i - 1
    while (j >= 0 && indentOf(lines[j]) > item.indent) j--
    if (j < 0 || indentOf(lines[j]) !== item.indent || !parse(lines[j])) return true
    next = [...lines.slice(0, j), ...lines.slice(i, end), ...lines.slice(j, i), ...lines.slice(end)]
    moved = j - i
  } else {
    if (end >= lines.length || indentOf(lines[end]) !== item.indent || !parse(lines[end])) return true
    let after = end + 1
    while (after < lines.length && indentOf(lines[after]) > item.indent) after++
    next = [...lines.slice(0, i), ...lines.slice(end, after), ...lines.slice(i, end), ...lines.slice(after)]
    moved = after - end
  }
  // The list keeps the number it started with, whichever item is now first.
  let firstSibling = i
  for (let j = i - 1; j >= 0 && indentOf(lines[j]) >= item.indent; j--) if (indentOf(lines[j]) === item.indent && parse(lines[j])) firstSibling = j
  const startsWith = parse(lines[firstSibling])
  const nowFirst = parse(next[firstSibling])
  if (startsWith && nowFirst && ordered(startsWith.marker) && ordered(nowFirst.marker)) {
    next[firstSibling] = next[firstSibling].replace(/^(\s*)\d+/, `$1${parseInt(startsWith.marker, 10)}`)
  }
  const numbered = renumber(next)
  const target = i + moved
  // The item's number may have changed width; keep the cursor at the same place in its text.
  const shift = numbered[target].length - lines[i].length
  const head = state.selection.main.head
  const column = Math.max(0, head - state.doc.line(cursorLine).from + shift)
  let start = state.doc.line(first).from
  for (let k = 0; k < target; k++) start += numbered[k].length + 1
  view.dispatch({
    changes: { from: state.doc.line(first).from, to: state.doc.line(last).to, insert: numbered.join('\n') },
    selection: { anchor: Math.min(start + column, start + numbered[target].length) },
    scrollIntoView: true,
    userEvent: 'move.line',
  })
  return true
}

export type ListKind = 'bullet' | 'numbered' | 'task'

/** Turn the selected lines into a list of this kind, or back into plain lines if they already are one. */
export function toggleList(view: EditorView, kind: ListKind) {
  const { state } = view
  const sel = state.selection.main
  const firstLine = state.doc.lineAt(sel.from).number
  const lastLine = state.doc.lineAt(sel.to).number
  const { first, last, lines } = block(view, firstLine)
  const next = [...lines]
  const is = (text: string) => {
    const m = ITEM.exec(text)
    if (!m) return false
    if (kind === 'task') return !!m[4]
    return !m[4] && (kind === 'numbered') === ordered(m[2])
  }
  const targets: number[] = []
  for (let n = firstLine; n <= Math.min(lastLine, last); n++) if (lines[n - first].trim() || firstLine === lastLine) targets.push(n - first)
  const remove = targets.length > 0 && targets.every((i) => is(lines[i]))

  let counter = 0
  let shift = 0
  for (const i of targets) {
    const m = ITEM.exec(next[i])
    const indent = m ? m[1] : /^\s*/.exec(next[i])![0]
    const body = m ? next[i].slice(m[0].length) : next[i].slice(indent.length)
    let marker = ''
    if (!remove) {
      if (kind === 'bullet') marker = '- '
      else if (kind === 'task') marker = '- [ ] '
      else {
        // Continue the numbering of a numbered item directly above, otherwise start at 1.
        if (!counter) {
          const above = i > 0 ? parse(next[i - 1]) : null
          counter = above && above.indent === indent.length && ordered(above.marker) ? parseInt(above.marker, 10) : 0
        }
        marker = `${++counter}. `
      }
    }
    const updated = indent + marker + body
    if (i === state.doc.lineAt(sel.head).number - first) shift = updated.length - next[i].length
    next[i] = updated
  }
  replaceBlock(view, first, last, lines, renumber(next), state.doc.lineAt(sel.head).number, shift)
  view.focus()
}

/** Tick or untick the task on the cursor's line, or every task in the selection. With `stamp`, ticking records the day. */
export function toggleDone(view: EditorView, stamp = false) {
  const { state } = view
  const sel = state.selection.main
  const changes: { from: number; to: number; insert: string }[] = []
  const boxes: boolean[] = []
  for (let n = state.doc.lineAt(sel.from).number; n <= state.doc.lineAt(sel.to).number; n++) {
    const line = state.doc.line(n)
    const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/.exec(line.text)
    if (!m) continue
    boxes.push(m[2] !== ' ')
    changes.push({ from: line.from + m[1].length, to: line.from + m[1].length + 1, insert: '' })
  }
  if (!changes.length) return false
  // A mixed selection is all ticked first; a fully ticked one is cleared.
  const done = !boxes.every(Boolean)
  // Ticking can also add "@done(date)" at the end of the line, and unticking take it off.
  view.dispatch({
    changes: changes.flatMap((c) => {
      const line = state.doc.lineAt(c.from)
      return (lineDoneChanges(line.text, done, stamp) ?? []).map((x) => ({ from: line.from + x.from, to: line.from + x.to, insert: x.insert }))
    }),
    userEvent: 'input',
  })
  return true
}
