// Focus: the few important (not urgent) next actions chosen for the week, marked with one tag (Settings → Tasks →
// Focus tag, `focus` by default). Shown above the urgent lists so important work is in view all day; the weekly
// review counts them and lists the projects. Nothing here changes the task rules: a focus task is an ordinary task
// with a tag, so `margin-tasks` and other apps read it as one.
import { TASK_LINE, isProjectNote, projectsOf, type ProjectFolders, type Task } from './tasks'
import type { Note } from '../types'

/** The tag as written in settings, without `#`, lower case; '' when there is none. */
export const focusKey = (tag: string | undefined) => (tag ?? '').trim().replace(/^#/, '').toLowerCase()

/** Whether a task carries the focus tag (exactly that tag, not a sub-tag). */
export const isFocus = (t: Pick<Task, 'tags'>, tag: string) => !!tag && t.tags.some((x) => x.toLowerCase() === tag)

/** The open focus tasks, in the order they were written. */
export const focusTasks = (tasks: Task[], tag: string) => tasks.filter((t) => !t.done && isFocus(t, tag))

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The details Margin writes at the end of a task (priority, dates, repeat, reminder, a block id): a tag goes before them.
const TRAILING = /(?:\s+(?:P[1-4]|>\S+|@(?:due|done|cancelled|repeat|remind)\([^)]*\)|\^[A-Za-z0-9-]+))*\s*$/

/**
 * A task's text (everything after the box) with the tag added or taken off. Added after the words, before the
 * details at the end; taken off wherever it is, however it is capitalised.
 */
export function withTag(raw: string, tag: string, on: boolean): string {
  const t = focusKey(tag)
  if (!t) return raw
  const has = new RegExp(`(^|\\s)#${escape(t)}(?=\\s|$)`, 'i')
  if (on) {
    if (has.test(raw)) return raw
    const at = TRAILING.exec(raw)?.index ?? raw.length
    const head = raw.slice(0, at).replace(/\s+$/, '')
    return `${head}${head ? ' ' : ''}#${t}${raw.slice(at)}`
  }
  return raw.replace(new RegExp(`(^|\\s)#${escape(t)}(?=\\s|$)`, 'gi'), '').replace(/ {2,}/g, ' ').replace(/^\s+/, '')
}

/** A task's words for a message: without the focus tag, shortened. */
export function focusLabel(text: string, tag: string, max = 50): string {
  const plain = tag ? withTag(text, tag, false) : text
  return plain.length > max ? plain.slice(0, max - 3) + '…' : plain
}

/** A whole task line (box included) with the tag added; other lines unchanged. */
export function tagTaskLine(line: string, tag: string): string {
  const m = TASK_LINE.exec(line)
  return m ? m[1] + m[2] + m[3] + withTag(m[4], tag, true) : line
}

export interface Project {
  note: Note
  /** Every task listed under it (as the Tasks view groups by project), and how many are finished. */
  total: number
  done: number
  open: Task[]
  /** The first open task you could do now: its own, in written order, before ones from meetings that link it. */
  next?: Task
  focus: Task[]
  /** The day its last task was finished, if any. */
  lastDone?: string
}

/**
 * The live projects: project notes that have tasks (a note with none is a reference note, not a project), outside
 * the Archive notebook, with their progress, next action and focus tasks. A project with no open task is stalled.
 */
export function projectList(notes: Record<string, Note>, tasks: Task[], f: ProjectFolders & { archiveFolder?: string }, tag: string): Project[] {
  const by = new Map<string, Task[]>()
  for (const t of tasks) for (const id of projectsOf(t, notes, f)) by.set(id, [...(by.get(id) ?? []), t])
  const archived = (n: Note) => !!f.archiveFolder && (n.folder === f.archiveFolder || n.folder.toLowerCase().startsWith(f.archiveFolder.toLowerCase() + '/'))
  const out: Project[] = []
  for (const [id, list] of by) {
    const note = notes[id]
    if (!note || !isProjectNote(note, f) || archived(note)) continue
    const open = list.filter((t) => !t.done)
    const own = open.filter((t) => t.noteId === id).sort((a, b) => a.line - b.line)
    const next = own.find((t) => !t.someday) ?? open.find((t) => !t.someday)
    const finished = list.filter((t) => t.done && t.completed).map((t) => t.completed!).sort()
    out.push({ note, total: list.length, done: list.length - open.length, open, next, focus: open.filter((t) => isFocus(t, tag)), lastDone: finished[finished.length - 1] })
  }
  return out.sort((a, b) => a.note.folder.localeCompare(b.note.folder) || a.note.title.localeCompare(b.note.title))
}

/** A key for a task that survives edits elsewhere in its note: the note and its words. */
export const taskKey = (t: Pick<Task, 'noteId' | 'text'>) => `${t.noteId}|${t.text.replace(/\s+/g, ' ').trim().toLowerCase()}`
