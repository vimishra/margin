// Archiving: ticked tasks into an "## Archive" section at the end of their note (one section, one note, or every
// note), and finished project notes into the Archive notebook. Each offers one Undo.
import { api } from './api'
import { ask, currentNote, toast, updateNote, useStore } from './store'
import { archiveTasks } from './lib/archive'
import { joinContent, splitContent } from './lib/canvas'
import { addDays, displayTitle, today } from './lib/util'
import { rememberFold } from './components/folding'
import { tasksOf } from './lib/tasks'
import type { Note } from './types'

const state = () => useStore.getState()

/** Undo for a change of contents (and notebooks), only if none of the notes has been edited since. */
function offerUndo(message: string, before: Record<string, Partial<Note>>) {
  const after = Object.fromEntries(Object.keys(before).map((id) => [id, state().notes[id]?.content]))
  toast(message, {
    label: 'Undo',
    run: () => {
      const now = state().notes
      if (Object.keys(before).some((id) => now[id] && now[id].content !== after[id])) return toast('Those notes have changed since; nothing was undone.')
      for (const [id, patch] of Object.entries(before)) if (now[id]) updateNote(id, patch)
    },
  })
}

/** Archive one note's ticked tasks; returns how many moved. The Archive section starts folded. */
function archiveNote(note: Note, opts: { line?: number; before?: string }): number {
  const { page, canvas } = splitContent(note.content)
  const result = archiveTasks(page, opts)
  if (!result.count) return 0
  const lines = result.page.split('\n')
  rememberFold(note.id, result.archiveLine + 1, lines[result.archiveLine])
  updateNote(note.id, { content: joinContent(result.page, canvas) })
  return result.count
}

/** Archive the ticked tasks in the section the cursor is in (`line`, 0-based), or in the whole note. */
export function archiveHere(scope: 'section' | 'note', line?: number) {
  const note = currentNote()
  if (!note) return
  const before = { [note.id]: { content: note.content } }
  const count = archiveNote(note, scope === 'section' ? { line: line ?? 0 } : {})
  if (!count) return toast(scope === 'section' ? 'No ticked tasks to archive in this section' : 'No ticked tasks to archive in this note')
  offerUndo(`Archived ${count} task${count === 1 ? '' : 's'} at the end of ${displayTitle(note)}`, before)
}

/** The notes "archive in all notes" goes through: not daily notes, templates or scratch notes. */
function archivable(n: Note) {
  const s = state().settings
  return n.type !== 'daily' && n.type !== 'scratch' && n.folder !== s.templatesFolder && !n.folder.startsWith(s.templatesFolder + '/')
}

/** Archive, in every note, the tasks ticked at least the set number of days ago, after saying how many. */
export async function archiveEverywhere() {
  const days = Math.max(0, state().settings.archiveAfterDays ?? 7)
  const cutoff = addDays(today(), -days)
  const plan = Object.values(state().notes)
    .filter(archivable)
    .map((n) => ({ note: n, count: archiveTasks(splitContent(n.content).page, { before: cutoff }).count }))
    .filter((x) => x.count)
  if (!plan.length) return toast(`No tasks were ticked more than ${days} day${days === 1 ? '' : 's'} ago outside an Archive section`)
  const total = plan.reduce((a, x) => a + x.count, 0)
  const ok = await ask({
    title: 'Archive done tasks?',
    message: `${total} task${total === 1 ? '' : 's'} ticked before ${cutoff} in ${plan.length} note${plan.length === 1 ? '' : 's'} will move to an Archive section at the end of each note. They stay in the Logbook. Daily notes and templates are left as they are.`,
    confirmLabel: 'Archive',
    input: false,
  })
  if (ok === null) return
  const before: Record<string, Partial<Note>> = {}
  let moved = 0
  for (const { note } of plan) {
    const now = state().notes[note.id]
    if (!now) continue
    before[now.id] = { content: now.content }
    moved += archiveNote(now, { before: cutoff })
  }
  offerUndo(`Archived ${moved} task${moved === 1 ? '' : 's'} in ${plan.length} note${plan.length === 1 ? '' : 's'}`, before)
}

/**
 * Move a finished project note into the Archive notebook, keeping its own notebook inside it (Work/Atlas goes to
 * Archive/Work/Atlas). If it still has open tasks, asks first: they keep showing in the task lists.
 */
export async function archiveProject() {
  const note = currentNote()
  if (!note) return
  const root = (state().settings.archiveFolder || 'Archive').replace(/^\/+|\/+$/g, '')
  if (note.folder === root || note.folder.startsWith(root + '/')) return toast(`“${displayTitle(note)}” is already in ${root}`)
  if (note.type !== 'note') return toast('Only ordinary notes can be archived this way')
  const open = tasksOf(note).filter((t) => !t.done).length
  if (open) {
    const ok = await ask({
      title: `Archive “${displayTitle(note)}”?`,
      message: `It still has ${open} open task${open === 1 ? '' : 's'}. They go with it and keep showing in your task lists; tick them, or move them with M in the Tasks view, if they are finished or belong elsewhere.`,
      confirmLabel: 'Archive anyway',
      input: false,
    })
    if (ok === null) return
  }
  const folder = [root, note.folder].filter(Boolean).join('/')
  const from = note.folder
  const existed = new Set(state().folders.map((f) => f.toLowerCase()))
  updateNote(note.id, { folder })
  toast(`Moved “${displayTitle(note)}” to ${folder}`, {
    label: 'Undo',
    run: async () => {
      if (!state().notes[note.id]) return
      updateNote(note.id, { folder: from })
      // Notebooks made by the move, and empty again, go too: the deepest first.
      await new Promise((r) => setTimeout(r, 300))
      const parts = folder.split('/')
      for (let n = parts.length; n > 0; n--) {
        const path = parts.slice(0, n).join('/')
        if (existed.has(path.toLowerCase()) || Object.values(state().notes).some((x) => x.folder === path || x.folder.startsWith(path + '/'))) break
        const res = await api.deleteFolder(path).catch(() => null)
        if (res?.folders) useStore.setState({ folders: res.folders })
      }
    },
  })
}
