// The task keys used inside the triage note itself (in the editor or read mode), sent through the same path as the
// Triage view (src/triage.ts): read the file fresh, change only the task's line, save with the version read. So a
// run written by the triage program at the same moment is never saved over, as it could be by saving the whole
// note from the editor. Moving a task from any note is here too.
import { isTriageNoteId, toast, ui, useStore } from './store'
import { parseTriage, runTasks, type TriageAction, type TriageTask } from './lib/triage'
import { tasksOf } from './lib/tasks'
import { moveByRules, moveCategory, triageAct } from './triage'
import { today } from './lib/util'

/** True when a note is the triage note, so its task keys go through the Triage path. */
export const isTriageNote = (noteId: string | undefined) => isTriageNoteId(noteId)

/**
 * The triage tasks touched by lines `from` to `to` (0-based) of the note's text as it is in the editor: a task
 * counts when the range meets its line or the lines under it.
 */
export function triageTasksAt(text: string, from: number, to: number): TriageTask[] {
  return parseTriage(text)
    .runs.flatMap(runTasks)
    .filter((t) => t.line <= to && t.end > from)
}

export type TriageKey = 'done' | 'cancel' | 'today'

/** One after another, as each reads the note fresh. */
async function actOnEach(list: [TriageTask, TriageAction][]) {
  for (const [t, action] of list) if (!(await triageAct(t, action))) break
}

/**
 * Do a task key in the triage note, through the Triage path. False when no triage task is on those lines (the
 * caller then does what it does in any note). Done: complete what is open, or reopen when all are finished.
 * Cancel: drop, or reopen when all are dropped. Today: plan for today.
 */
export function triageKey(noteId: string, text: string, from: number, to: number, key: TriageKey): boolean {
  if (!isTriageNote(noteId)) return false
  const tasks = triageTasksAt(text, from, to)
  if (!tasks.length) return false
  let list: [TriageTask, TriageAction][]
  if (key === 'done') {
    const open = tasks.filter((t) => t.state === 'open')
    list = open.length ? open.map((t) => [t, { kind: 'complete' }]) : tasks.map((t) => [t, { kind: 'reopen' }])
  } else if (key === 'cancel') {
    const notDropped = tasks.filter((t) => t.state !== 'dropped')
    list = notDropped.length ? notDropped.map((t) => [t, { kind: 'drop' }]) : tasks.map((t) => [t, { kind: 'reopen' }])
  } else list = tasks.map((t) => [t, { kind: 'planned', date: today() }])
  void actOnEach(list)
  return true
}

/**
 * Move the task at the cursor (or the tasks in the selection) into another note. In the triage note, as M does in
 * the Triage view: where the rules send each one, asking for a note when none decides; with `pick`, always asking
 * (⇧M), where ⌥↵ also adds a rule. In any other note, the note is asked for, as M does in the Tasks view.
 */
export function moveTaskFromEditor(noteId: string, text: string, from: number, to: number, pick: boolean) {
  if (isTriageNote(noteId)) {
    const tasks = triageTasksAt(text, from, to)
    if (!tasks.length) return toast('The cursor is not on a task of the triage note')
    if (tasks.length === 1) return pick ? ui({ palette: { mode: 'triageMove', triageTask: tasks[0] } }) : moveByRules(tasks[0])
    if (!pick) return moveCategory(tasks)
    return ui({ palette: { mode: 'triageMove', triageTask: tasks[0], triageTasks: tasks, triagePlan: [] } })
  }
  const note = useStore.getState().notes[noteId]
  if (!note) return
  // The note in the store holds what is typed, so its tasks' lines match the editor's.
  const task = tasksOf(note).find((t) => t.line >= from && t.line <= to)
  if (!task) return toast('The cursor is not on a task')
  ui({ palette: { mode: 'moveTask', task } })
}
