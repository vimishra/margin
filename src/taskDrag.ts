// Dragging a task onto a day: task rows (Tasks view, the panel under daily notes, tasks blocks, Focus) can be picked
// up and dropped on a day in the sidebar calendar or the Calendar view, which moves the task into that day's daily
// note, under Planned (`moveTasksToDay`). The task travels as its note, line and text, and is found again on drop,
// so a list redrawn in between cannot move the wrong line.
import type React from 'react'
import { isProtectedNote, moveBlockTo, moveTasksTo, moveTasksToDay, openDatePicker, toast, useStore, type BlockRef } from './store'
import { tasksOf, type Task } from './lib/tasks'

export const TASK_DRAG = 'text/margin-task'
/** A list item (with the lines under it) or a section, dragged by its handle in the editor. Not taken by days. */
export const BLOCK_DRAG = 'text/margin-block'

/** Put a list item or a section on a drag. */
export function setBlockDrag(dt: DataTransfer, ref: BlockRef) {
  dt.setData(BLOCK_DRAG, JSON.stringify(ref))
  dt.setData('text/plain', ref.text.trim())
  dt.effectAllowed = 'move'
}

/** The list item or section a drop carries (checked against its note again when it is moved). */
export function readBlockDrag(dt: DataTransfer): BlockRef | undefined {
  try {
    const ref = JSON.parse(dt.getData(BLOCK_DRAG)) as BlockRef
    return ref && typeof ref.noteId === 'string' && typeof ref.line === 'number' && typeof ref.text === 'string' && (ref.kind === 'list' || ref.kind === 'section') ? ref : undefined
  } catch {
    return undefined
  }
}

/** Put a task on a drag. */
export function setTaskDrag(dt: DataTransfer, task: Task) {
  dt.setData(TASK_DRAG, JSON.stringify({ noteId: task.noteId, line: task.line, raw: task.raw }))
  dt.setData('text/plain', task.text)
  dt.effectAllowed = 'move'
}

/** Start dragging a task row. Triage suggestions are not dragged: they move with M or F first. */
export function startTaskDrag(e: React.DragEvent, task: Task) {
  if (isProtectedNote(task.noteId) || task.done) return e.preventDefault()
  setTaskDrag(e.dataTransfer, task)
}

/** The task a drop carries, as it is in its note now; undefined when it has changed or gone. */
export function readTaskDrag(dt: DataTransfer): Task | undefined {
  try {
    const { noteId, line, raw } = JSON.parse(dt.getData(TASK_DRAG))
    const note = useStore.getState().notes[noteId]
    return note ? tasksOf(note).find((t) => t.line === line && t.raw === raw) : undefined
  } catch {
    return undefined
  }
}
const droppedTask = (e: React.DragEvent) => readTaskDrag(e.dataTransfer)

/**
 * Props that make a note (a sidebar entry, a tab, a row in a list) take a dropped task: into its Open Threads, as M
 * does, or for a daily note under Planned, as a move to that day does. A dragged list item goes under Open Threads
 * too (at the end of a daily note), and a section at the end. `over` marks it while a task is held over it.
 */
export function noteDropProps(noteId: string, over: string, setOver: (id: string) => void) {
  const carries = (e: React.DragEvent) => (e.dataTransfer.types.includes(TASK_DRAG) || e.dataTransfer.types.includes(BLOCK_DRAG)) && !isProtectedNote(noteId)
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!carries(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== noteId) setOver(noteId)
    },
    onDragLeave: () => over === noteId && setOver(''),
    onDrop: (e: React.DragEvent) => {
      if (!carries(e)) return
      e.preventDefault()
      e.stopPropagation()
      setOver('')
      // A list item or a section: under Open Threads (a section at the end), as Move section does.
      if (e.dataTransfer.types.includes(BLOCK_DRAG)) {
        const ref = readBlockDrag(e.dataTransfer)
        if (ref && ref.noteId !== noteId) moveBlockTo(ref, noteId)
        return
      }
      const task = droppedTask(e)
      if (!task) return toast('That task has changed since it was picked up. Try again.')
      void moveTasksTo([task], noteId)
    },
  }
}

/** Props that make a day (a calendar cell) take a dropped task; `over` marks it while a task is held over it. */
export function dayDropProps(day: string, over: string, setOver: (day: string) => void) {
  const carries = (e: React.DragEvent) => e.dataTransfer.types.includes(TASK_DRAG)
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!carries(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== day) setOver(day)
    },
    onDragLeave: () => over === day && setOver(''),
    onDrop: (e: React.DragEvent) => {
      if (!carries(e)) return
      e.preventDefault()
      setOver('')
      const task = droppedTask(e)
      if (!task) return toast('That task has changed since it was picked up. Try again.')
      void moveTasksToDay([task], day)
    },
  }
}

/** Ask for a day, then move the task there (⇧S in the Tasks view, the task menu, and the command in a note). */
export function pickDayFor(anchor: { currentTarget: EventTarget }, task: Task) {
  openDatePicker(anchor, {
    title: "Move to a day's note",
    value: task.scheduled,
    onPick: (date) => date && date !== 'someday' && void moveTasksToDay([task], date),
  })
}
