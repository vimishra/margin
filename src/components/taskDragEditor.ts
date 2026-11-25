// Dragging in the editor. Pointing at an open task, a list item or a heading shows a handle at its left, in one
// column. A task travels as a task (its line and the lines indented under it), as task rows in lists do; a list item
// with the lines under it, and a heading with its whole section, travel as a block (BLOCK_DRAG), which calendar days
// do not take. Dropped:
//  - on a calendar day, a note in the sidebar, or a tab: handled there (taskDrag.ts);
//  - in the same note: the block moves to where the drop line shows, as one change that ⌘Z undoes (a list item is
//    re-indented to the list it lands in; a section is set off by blank lines);
//  - in another note's editor (the other pane, another day in the Journal): moved there, at that place
//    (`moveTasksTo`, `moveBlockTo`).
// The triage note's layout belongs to the program that writes it, so its tasks get no handle and it takes no drops.
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { editorNote } from './lists'
import { BLOCK_DRAG, TASK_DRAG, readBlockDrag, readTaskDrag, setBlockDrag, setTaskDrag } from '../taskDrag'
import { blockRange, isProtectedNote, moveBlockTo, moveTasksTo, useStore } from '../store'
import { TASK_LINE, tasksOf } from '../lib/tasks'
import { sections } from '../lib/refactor'

type Kind = 'task' | 'list' | 'section'
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+\S/
const TITLES: Record<Kind, string> = {
  task: 'Drag to move this task: onto a day in the calendar, a note in the sidebar or a tab, or elsewhere in a note',
  list: 'Drag to move this item, with what is under it: elsewhere in the note, or onto a note in the sidebar or a tab',
  section: 'Drag to move this section (the heading and everything under it): elsewhere in the note, or onto a note in the sidebar or a tab',
}

/** Lines (1-based) inside fenced code blocks, and the lines headings start sections on. Kept per document. */
function outline(view: EditorView): { fenced: Set<number>; headings: Set<number> } {
  const fenced = new Set<number>()
  let fence: string | null = null
  const doc = view.state.doc
  for (let n = 1; n <= doc.lines; n++) {
    const f = /^\s{0,3}(```+|~~~+)/.exec(doc.line(n).text)
    if (f) {
      fenced.add(n)
      if (fence === null) fence = f[1][0].repeat(f[1].length)
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
    } else if (fence !== null) fenced.add(n)
  }
  return { fenced, headings: new Set(sections(doc.toString()).map((x) => x.start + 1)) }
}

/**
 * Move a section (lines a to b, 1-based) within this note, to before line `before`, as one change: set off by a blank
 * line above and below, and without leaving two blank lines where it was.
 */
function reorderSection(view: EditorView, [a, b]: [number, number], before: number) {
  if (before >= a && before <= b + 1) return false
  const doc = view.state.doc
  const old = doc.toString()
  const all: (string | null)[] = old.split('\n')
  // A marker where it goes, so the place survives taking the section out.
  all.splice(before - 1, 0, null)
  const from = before - 1 < a - 1 ? a : a - 1
  const block = all.splice(from, b - a + 1) as string[]
  while (block.length > 1 && !block[block.length - 1].trim()) block.pop()
  // The gap it leaves: no doubled blank line.
  while (from > 0 && from < all.length && all[from - 1] !== null && all[from] !== null && !all[from - 1]!.trim() && !all[from]!.trim()) all.splice(from, 1)
  // Taken from the end: no blank lines left trailing there.
  if (from >= all.length - (all[all.length - 1] === null ? 1 : 0)) while (all.length > 1 && all[all.length - 1] !== null && !all[all.length - 1]!.trim() && from > 0) all.pop()
  const at = all.indexOf(null)
  const above = at > 0 && (all[at - 1] ?? '').trim() !== ''
  const below = at < all.length - 1 && (all[at + 1] ?? '').trim() !== ''
  all.splice(at, 1, ...(above ? [''] : []), ...block, ...(below ? [''] : []))
  const next = (all as string[]).join('\n')
  // One change covering only what differs, so the cursor and ⌘Z behave.
  let p = 0
  while (p < old.length && p < next.length && old[p] === next[p]) p++
  let q = 0
  while (q < old.length - p && q < next.length - p && old[old.length - 1 - q] === next[next.length - 1 - q]) q++
  view.dispatch({ changes: { from: p, to: old.length - q, insert: next.slice(p, next.length - q) }, userEvent: 'move.drop' })
  return true
}

/** The block of the task on a line (1-based): that line and the lines indented under it, as [first, last] line numbers. */
function blockOf(view: EditorView, lineNo: number): [number, number] {
  const doc = view.state.doc
  const first = doc.line(lineNo)
  const indent = /^\s*/.exec(first.text)![0].length
  let last = lineNo
  while (last < doc.lines) {
    const next = doc.line(last + 1).text
    if (!next.trim() || /^\s*/.exec(next)![0].length <= indent) break
    last++
  }
  return [lineNo, last]
}

/** Where a drop at a point goes: before line `before` (1-based; doc.lines + 1 means the end), and the y for the marker. */
function dropPlace(view: EditorView, x: number, y: number): { before: number; y: number } | null {
  const pos = view.posAtCoords({ x, y }, false)
  const line = view.state.doc.lineAt(pos)
  const box = view.coordsAtPos(line.from)
  const end = view.coordsAtPos(line.to)
  if (!box || !end) return null
  const lower = y > (box.top + end.bottom) / 2
  return { before: lower ? line.number + 1 : line.number, y: lower ? end.bottom : box.top }
}

/** The indent of the list a drop lands in: the list item at the drop line, or else the one above it. */
function indentAt(view: EditorView, before: number): string {
  const doc = view.state.doc
  for (const n of [before, before - 1]) {
    if (n < 1 || n > doc.lines) continue
    const text = doc.line(n).text
    if (/^\s*([-*+]|\d+[.)])\s/.test(text)) return /^\s*/.exec(text)![0]
  }
  return ''
}

/** Move a block within this note, to before line `before`, re-indented to the list it lands in. */
function reorder(view: EditorView, [a, b]: [number, number], before: number) {
  if (before >= a && before <= b + 1) return false
  const doc = view.state.doc
  const lines: string[] = []
  for (let n = a; n <= b; n++) lines.push(doc.line(n).text)
  const old = /^\s*/.exec(lines[0])![0].length
  const indent = indentAt(view, before)
  const text = lines.map((l) => indent + l.slice(Math.min(old, /^\s*/.exec(l)![0].length))).join('\n')
  const from = doc.line(a).from
  const to = b < doc.lines ? doc.line(b + 1).from : doc.line(b).to
  // At the very end, the block follows the last line; elsewhere it goes in front of the line it is dropped before.
  const insert = before > doc.lines ? { from: doc.length, insert: (b === doc.lines ? '' : '\n') + text } : { from: doc.line(before).from, insert: text + '\n' }
  const remove = b === doc.lines && a > 1 ? { from: doc.line(a - 1).to, to: doc.line(b).to } : { from, to }
  view.dispatch({ changes: [remove, insert], userEvent: 'move.drop' })
  return true
}

export const taskDragEditor = ViewPlugin.fromClass(
  class {
    handle: HTMLElement
    marker: HTMLElement
    line = 0
    kind: Kind = 'task'
    shape: ReturnType<typeof outline> | null = null
    /** The line the handle is for, on screen: the band in which the pointer keeps it, from the handle to the text. */
    band: { left: number; right: number; top: number; bottom: number } | null = null
    watching = false
    constructor(readonly view: EditorView) {
      this.handle = document.createElement('div')
      this.handle.className = 'cm-task-handle'
      this.handle.draggable = true
      this.handle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>'
      this.handle.addEventListener('dragstart', this.onDragStart)
      this.handle.addEventListener('dragend', () => (this.view.dom.classList.remove('cm-task-dragging'), this.hide()))
      this.marker = document.createElement('div')
      this.marker.className = 'cm-task-drop-line'
      view.dom.append(this.handle, this.marker)
      this.hide()
    }
    get noteId() {
      return this.view.state.facet(editorNote)
    }
    hide() {
      this.handle.style.display = 'none'
      this.line = 0
      this.band = null
      this.unwatch()
    }
    /**
     * The handle sits left of the text, outside the editor's own area, so the pointer leaves the editor on its way
     * there. While it is in the strip between the handle and the text, level with the line, the handle stays.
     */
    inBand(x: number, y: number) {
      const b = this.band
      return !!b && x >= b.left - 8 && x <= b.right + 4 && y >= b.top - 6 && y <= b.bottom + 6
    }
    track = (e: MouseEvent) => {
      if (this.view.dom.contains(e.target as Node)) return this.unwatch()
      if (!this.inBand(e.clientX, e.clientY)) this.hide()
    }
    watch() {
      if (this.watching) return
      this.watching = true
      document.addEventListener('mousemove', this.track, true)
    }
    unwatch() {
      if (!this.watching) return
      this.watching = false
      document.removeEventListener('mousemove', this.track, true)
    }
    /** Show the handle beside an open task, a list item or a heading under the pointer. */
    point(x: number, y: number) {
      const { view } = this
      if (!this.noteId || isProtectedNote(this.noteId) || view.state.readOnly) return this.hide()
      const pos = view.posAtCoords({ x, y }, false)
      const line = view.state.doc.lineAt(pos)
      this.shape ??= outline(view)
      if (this.shape.fenced.has(line.number)) return this.hide()
      const m = TASK_LINE.exec(line.text)
      const kind: Kind | null = m && m[4].trim() && m[2] === ' ' ? 'task' : LIST_ITEM.test(line.text) ? 'list' : this.shape.headings.has(line.number) ? 'section' : null
      if (!kind) return this.hide()
      this.kind = kind
      this.handle.title = TITLES[kind]
      const at = view.coordsAtPos(line.from)
      if (!at) return this.hide()
      const box = view.dom.getBoundingClientRect()
      const left = view.contentDOM.getBoundingClientRect().left
      this.line = line.number
      this.handle.style.display = ''
      this.handle.style.top = `${at.top - box.top + (at.bottom - at.top) / 2 - 10}px`
      // Always in one column, left of the fold arrows (which sit just left of the text), so it is in the same place
      // on every task line and never under the arrow of a task with sub-items.
      const hx = left - 48
      this.handle.style.left = `${hx - box.left}px`
      this.band = { left: hx, right: left, top: Math.min(at.top, at.top + (at.bottom - at.top) / 2 - 10), bottom: Math.max(at.bottom, at.top + (at.bottom - at.top) / 2 + 10) }
    }
    onDragStart = (e: DragEvent) => {
      const { view } = this
      if (!this.line || !e.dataTransfer) return e.preventDefault()
      if (this.kind !== 'task') {
        setBlockDrag(e.dataTransfer, { noteId: this.noteId, line: this.line - 1, text: view.state.doc.line(this.line).text, kind: this.kind })
        const node = view.domAtPos(view.state.doc.line(this.line).from).node
        const el = (node instanceof HTMLElement ? node : node.parentElement)?.closest('.cm-line')
        if (el) e.dataTransfer.setDragImage(el, 0, 12)
        view.dom.classList.add('cm-task-dragging')
        return
      }
      const note = useStore.getState().notes[this.noteId]
      // The note in the store holds what is typed, so its tasks' lines are the editor's.
      const task = note && tasksOf(note).find((t) => t.line === this.line - 1)
      if (!task) return e.preventDefault()
      setTaskDrag(e.dataTransfer, task)
      const lineEl = view.domAtPos(view.state.doc.line(this.line).from).node
      const el = (lineEl instanceof HTMLElement ? lineEl : lineEl.parentElement)?.closest('.cm-line')
      if (el) e.dataTransfer.setDragImage(el, 0, 12)
      view.dom.classList.add('cm-task-dragging')
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.shape = null
      if (u.docChanged || u.viewportChanged) this.hide()
    }
    destroy() {
      this.unwatch()
      this.handle.remove()
      this.marker.remove()
    }
  },
  {
    eventHandlers: {
      mousemove(e) {
        if (!(e.target as HTMLElement).closest?.('.cm-task-handle')) this.point(e.clientX, e.clientY)
      },
      mouseleave(e) {
        if ((e.relatedTarget as HTMLElement | null)?.closest?.('.cm-task-handle')) return
        // On the way to the handle: keep it while the pointer stays level with the line, between it and the text.
        if (this.inBand(e.clientX, e.clientY)) this.watch()
        else this.hide()
      },
      dragover(e) {
        const types = e.dataTransfer?.types ?? []
        if ((!types.includes(TASK_DRAG) && !types.includes(BLOCK_DRAG)) || isProtectedNote(this.noteId)) return false
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move"
        const place = dropPlace(this.view, e.clientX, e.clientY)
        if (!place) return true
        const box = this.view.dom.getBoundingClientRect()
        this.marker.style.display = 'block'
        this.marker.style.top = `${place.y - box.top - 1}px`
        return true
      },
      dragleave(e) {
        if (!this.view.dom.contains(e.relatedTarget as Node)) this.marker.style.display = 'none'
        return false
      },
      drop(e) {
        this.marker.style.display = 'none'
        if (e.dataTransfer?.types.includes(BLOCK_DRAG) && !isProtectedNote(this.noteId)) {
          e.preventDefault()
          const ref = readBlockDrag(e.dataTransfer)
          const place = dropPlace(this.view, e.clientX, e.clientY)
          if (!ref || !place) return true
          if (ref.noteId === this.noteId) {
            // Within the note: found again in the text as it is now, then moved as one undoable change.
            const lines = this.view.state.doc.toString().split('\n')
            const range = blockRange(lines, ref)
            if (!range) return true
            const span: [number, number] = [range[0] + 1, range[1]]
            if (ref.kind === 'section') reorderSection(this.view, span, place.before)
            else reorder(this.view, span, place.before)
          } else moveBlockTo(ref, this.noteId, { at: place.before - 1, indent: ref.kind === 'list' ? indentAt(this.view, place.before) : '' })
          return true
        }
        if (!e.dataTransfer?.types.includes(TASK_DRAG) || isProtectedNote(this.noteId)) return false
        e.preventDefault()
        const task = readTaskDrag(e.dataTransfer)
        const place = dropPlace(this.view, e.clientX, e.clientY)
        if (!task || !place) return true
        if (task.noteId === this.noteId) {
          // Within the note: check the line is still the task, then move it as one undoable change.
          const line = this.view.state.doc.line(task.line + 1)
          if (TASK_LINE.exec(line.text)?.[4] === task.raw) reorder(this.view, blockOf(this.view, task.line + 1), place.before)
        } else void moveTasksTo([task], this.noteId, { at: place.before - 1, indent: indentAt(this.view, place.before) })
        return true
      },
    },
  },
)
