// Todoist → Margin: tasks captured in Todoist (from the phone) are moved into the Inbox note. Every few minutes
// while Margin runs, the tasks in the chosen Todoist project, or with the chosen label, are written into the Inbox
// as Margin tasks, saved, and only then closed in Todoist. The settings and token live on this computer
// (server/todoist.mjs); turn it on on one computer only, so two never take the same task.
import { api } from './api'
import { addToInbox, openNote, inboxNote, toast, useStore } from './store'
import { local } from './lib/util'
import { todoistLines } from './lib/todoist'

const SEEN = 'todoistImported'
const STATUS = 'todoistStatus'
const EVERY = 5 * 60_000
const KEEP = 30 * 24 * 60 * 60_000

/** What the last import did, for the settings page. */
export interface TodoistStatus {
  at: number
  added: number
  repeating: number
  projectMissing: boolean
  error?: string
}

export const todoistStatus = () => local.get<TodoistStatus | null>(STATUS, null)

let running = false

/**
 * Bring the waiting tasks into the Inbox. Tasks already brought in (remembered on this computer) are not added
 * again, only closed in Todoist if that failed before. `quiet` leaves out the message when nothing came in.
 */
export async function importFromTodoist(quiet = true): Promise<TodoistStatus | null> {
  if (running || !useStore.getState().loaded) return null
  running = true
  const status: TodoistStatus = { at: Date.now(), added: 0, repeating: 0, projectMissing: false }
  try {
    const settings = await api.todoist()
    if (!settings.enabled || !settings.connected) {
      if (!quiet) toast('Todoist is not set up on this computer: Settings → Capture & scratch')
      return null
    }
    const { tasks, repeating, projectMissing } = await api.todoistTasks()
    status.repeating = repeating
    status.projectMissing = projectMissing
    const seen = local.get<Record<string, number>>(SEEN, {})
    const fresh = tasks.filter((t) => !seen[t.id])
    if (fresh.length) {
      if (!(await addToInbox(todoistLines(fresh, settings.label)))) throw new Error('Could not save the Inbox note; the tasks were left in Todoist.')
      for (const t of fresh) seen[t.id] = Date.now()
      status.added = fresh.length
    }
    for (const [id, at] of Object.entries(seen)) if (Date.now() - at > KEEP) delete seen[id]
    local.set(SEEN, seen)
    // Safely in the note: now they can go from Todoist. Ones that fail are tried again next time, not re-added.
    if (tasks.length) await api.closeTodoist(tasks.map((t) => t.id))
    if (status.added) {
      const inbox = inboxNote()
      toast(`${status.added} task${status.added === 1 ? '' : 's'} from Todoist added to the Inbox`, inbox ? { label: 'Open', run: () => openNote(inbox.id) } : undefined)
    } else if (!quiet) toast(projectMissing ? `No Todoist project called “${settings.project}”` : 'Nothing waiting in Todoist')
  } catch (e) {
    status.error = (e as Error).message
    if (!quiet) toast(`Todoist: ${status.error}`)
  } finally {
    running = false
  }
  local.set(STATUS, status)
  window.dispatchEvent(new CustomEvent('margin:todoist'))
  return status
}

/** Check when the notes have loaded, every five minutes, and on coming back to the window (at most once a minute). */
export function startTodoist(): () => void {
  let last = 0
  const run = () => {
    last = Date.now()
    void importFromTodoist()
  }
  const timer = window.setInterval(run, EVERY)
  const onFocus = () => Date.now() - last > 60_000 && run()
  window.addEventListener('focus', onFocus)
  const stop = useStore.subscribe((s, prev) => s.loaded && !prev.loaded && run())
  if (useStore.getState().loaded) run()
  return () => {
    clearInterval(timer)
    window.removeEventListener('focus', onFocus)
    stop()
  }
}
