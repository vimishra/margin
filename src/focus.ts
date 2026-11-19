// Focus in the app: marking a task (F), and, when a focus task is ticked, offering to write its project's next step
// as the new focus task, so a focus project never runs out of next actions. Also remembers, on this computer, the
// day each focus task was first seen, so the weekly review can point out ones that have not moved.
import { OPEN_THREADS, ask, hiddenTaskNotes, toast, updateNote, updateTask, useStore } from './store'
import { focusKey, focusLabel, focusTasks, isFocus, taskKey, withTag } from './lib/focus'
import { allTasks, projectsOf, type Task } from './lib/tasks'
import { insertUnderHeading } from './lib/triage'
import { joinContent, splitContent } from './lib/canvas'
import { displayTitle, local, today } from './lib/util'

export const focusTag = () => focusKey(useStore.getState().settings.focusTag)

/** Add the focus tag to a task, or take it off (F). */
export function toggleFocus(task: Task) {
  const tag = focusTag()
  if (!tag) return toast('Focus is off: set a focus tag in Settings → General')
  const on = !isFocus(task, tag)
  updateTask(task, { raw: withTag(task.raw, tag, on) })
  const short = focusLabel(task.text, tag)
  toast(on ? `“${short}” is a focus task` : `“${short}” is no longer a focus task`)
}

/** The first day each open focus task was seen on this computer, by `taskKey`. */
export const focusSince = (): Record<string, string> => local.get<Record<string, string>>('focusSeen', {})

const tasksNow = () => {
  const { notes, settings } = useStore.getState()
  return allTasks(notes, settings.templatesFolder, settings.inboxFolder, hiddenTaskNotes())
}

/**
 * Ask for the next step of a project whose focus task was just ticked, and write it as a focus task: in the project
 * note just above the ticked one (so at the end of the open tasks in that list), or, when the ticked task was in a
 * meeting note, under the project note's Open Threads heading.
 */
export async function addNextStep(done: Task, projectId: string) {
  const tag = focusTag()
  const project = useStore.getState().notes[projectId]
  if (!project || !tag) return
  const text = (await ask({ title: `Next step for ${displayTitle(project)}`, message: 'Written as a focus task in the project note. Something you could start in five minutes works best.', placeholder: 'Draft the…', confirmLabel: 'Add' }))?.trim()
  if (!text) return
  const note = useStore.getState().notes[projectId]
  if (!note) return
  const line = `- [ ] ${withTag(text, tag, true)}`
  const lines = note.content.split('\n')
  // The ticked task, found again by its words (it may have moved to the end of its list).
  const at = done.noteId === note.id ? tasksNow().find((t) => t.noteId === note.id && t.done && taskKey(t) === taskKey(done))?.line : undefined
  let content: string
  if (at !== undefined) {
    const indent = /^\s*/.exec(lines[at])![0]
    // Above the ticked tasks gathered at the end of the list, so it follows the open ones.
    let where = at
    while (where > 0 && /^\s*/.exec(lines[where - 1])![0] === indent && /^\s*(?:[-*+]|\d+[.)])\s+\[[xX-]\]/.test(lines[where - 1])) where--
    lines.splice(where, 0, indent + line)
    content = lines.join('\n')
  } else {
    const { page, canvas } = splitContent(note.content)
    content = joinContent(insertUnderHeading(page, [line], useStore.getState().triage.heading?.trim() || OPEN_THREADS), canvas)
  }
  updateNote(note.id, { content })
  toast(`Added “${text}” to ${displayTitle(note)} as a focus task`)
}

/**
 * Watch the notes: keep the first-seen days of open focus tasks, and when one is ticked (today) and its project has
 * no other open focus task, offer to write the next step. Returns a function that stops watching.
 */
export function watchFocus(): () => void {
  let open: Map<string, Task> | null = null
  const check = () => {
    const { notes, settings } = useStore.getState()
    const tag = focusKey(settings.focusTag)
    if (!Object.keys(notes).length) return
    const tasks = tasksNow()
    const now = new Map(focusTasks(tasks, tag).map((t) => [taskKey(t), t]))
    // First-seen days: keep those still open, add new ones.
    const seen = focusSince()
    const kept: Record<string, string> = {}
    for (const k of now.keys()) kept[k] = seen[k] ?? today()
    if (JSON.stringify(kept) !== JSON.stringify(seen)) local.set('focusSeen', kept)
    if (open && tag) {
      const day = today()
      for (const [k, before] of open) {
        if (now.has(k)) continue
        const done = tasks.find((t) => t.done && !t.cancelled && t.completed === day && taskKey(t) === k)
        if (!done) continue
        const projects = projectsOf(done, notes, settings).filter((id) => notes[id])
        const id = projects[0] ?? before.noteId
        const stillFocus = [...now.values()].some((t) => projectsOf(t, notes, settings).includes(id))
        if (stillFocus || !notes[id]) continue
        const short = focusLabel(done.text, tag, 40)
        toast(`Focus task done: “${short}”. What is the next step for ${displayTitle(notes[id])}?`, { label: 'Add next step', run: () => void addNextStep(done, id) })
      }
    }
    open = now
  }
  check()
  return useStore.subscribe((s, prev) => {
    if (s.notes !== prev.notes || s.settings.focusTag !== prev.settings.focusTag) check()
  })
}
