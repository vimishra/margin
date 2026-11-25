// Dragging tasks in the editor. Pointing at a task line shows a handle at its left; dragging the handle carries the
// task (its line and the lines indented under it), as task rows in lists do. Dropped:
//  - on a calendar day, a note in the sidebar, or a tab: handled there (taskDrag.ts);
//  - in the same note: the block moves to where the drop line shows, as one change that ⌘Z undoes;
//  - in another note's editor (the other pane, another day in the Journal): moved there, at that place (`moveTasksTo`).
// The triage note's layout belongs to the program that writes it, so its tasks get no handle and it takes no drops.
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { editorNote } from './lists'
import { TASK_DRAG, readTaskDrag, setTaskDrag } from '../taskDrag'
import { isProtectedNote, moveTasksTo, useStore } from '../store'
import { TASK_LINE, tasksOf } from '../lib/tasks'

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
    constructor(readonly view: EditorView) {
      this.handle = document.createElement('div')
      this.handle.className = 'cm-task-handle'
      this.handle.draggable = true
      this.handle.title = "Drag to move this task: onto a day in the calendar, a note in the sidebar or a tab, or elsewhere in a note"
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
    }
    /** Show the handle beside a task line under the pointer. */
    point(x: number, y: number) {
      const { view } = this
      if (!this.noteId || isProtectedNote(this.noteId) || view.state.readOnly) return this.hide()
      const pos = view.posAtCoords({ x, y }, false)
      const line = view.state.doc.lineAt(pos)
      const m = TASK_LINE.exec(line.text)
      if (!m || !m[4].trim() || m[2] !== ' ') return this.hide()
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
    }
    onDragStart = (e: DragEvent) => {
      const { view } = this
      if (!this.line || !e.dataTransfer) return e.preventDefault()
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
      if (u.docChanged || u.viewportChanged) this.hide()
    }
    destroy() {
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
        if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.cm-task-handle')) this.hide()
      },
      dragover(e) {
        if (!e.dataTransfer?.types.includes(TASK_DRAG) || isProtectedNote(this.noteId)) return false
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
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
