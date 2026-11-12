// Reminders: a task with "@remind(YYYY-MM-DD HH:MM)" on its line gives a notification at that time while Margin is
// open (in the desktop app, also while its window is closed but the app is running). Each reminder is shown once on
// this computer; one missed while Margin was not running is shown when it starts, if it is less than a day old.
import { desktop } from './desktop'
import { hiddenTaskNotes, openNoteAt, toast, useStore } from './store'
import { allTasks, type Task } from './lib/tasks'
import { displayTitle, local } from './lib/util'

const SEEN = 'reminded'
const DAY = 24 * 60 * 60 * 1000

/** When a reminder is due, as a time on this computer's clock. */
const timeOf = (remind: string) => new Date(`${remind.slice(0, 10)}T${remind.slice(11, 16)}:00`).getTime()
/** One reminder: the task's note, its text and its time, so a moved or reworded task is not reminded twice. */
const keyOf = (t: Task) => `${t.noteId}\u0000${t.text}\u0000${t.remind}`
const plain = (text: string) => text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '')

/** The tasks waiting for reminders: id given to the notification → the task, so a click can open it. */
const pending = new Map<string, Task>()
let counter = 0

function open(id: string) {
  const t = pending.get(id)
  pending.delete(id)
  if (t && useStore.getState().notes[t.noteId]) openNoteAt(t.noteId, t.raw, [], true)
}

function notify(t: Task) {
  const note = useStore.getState().notes[t.noteId]
  const title = plain(t.text)
  const body = `${t.remind!.slice(11)} · ${note ? displayTitle(note) : ''}`
  const id = String(++counter)
  pending.set(id, t)
  if (desktop?.notify) return desktop.notify(id, title, body)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const n = new Notification(title, { body, tag: keyOf(t) })
    n.onclick = () => (window.focus(), open(id), n.close())
    return
  }
  // No notifications allowed in this browser: say it in the app, and ask once for next time.
  toast(`Reminder: ${title}`, { label: 'Open', run: () => open(id) })
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
}

/** Show the reminders that are due and not yet shown, and forget ones older than a few days. */
export function checkReminders(now = Date.now()) {
  const s = useStore.getState()
  if (!s.loaded) return
  const seen = local.get<Record<string, number>>(SEEN, {})
  let changed = false
  for (const t of allTasks(s.notes, s.settings.templatesFolder, s.settings.inboxFolder, hiddenTaskNotes())) {
    if (t.done || !t.remind) continue
    const at = timeOf(t.remind)
    const key = keyOf(t)
    if (Number.isNaN(at) || at > now || now - at > DAY || seen[key]) continue
    seen[key] = now
    changed = true
    notify(t)
  }
  for (const [key, when] of Object.entries(seen)) {
    if (now - when > 3 * DAY) {
      delete seen[key]
      changed = true
    }
  }
  if (changed) local.set(SEEN, seen)
}

/** Check every 20 seconds, and as soon as the notes have loaded. Returns a function that stops it. */
export function startReminders(): () => void {
  const timer = window.setInterval(() => checkReminders(), 20_000)
  const stopLoad = useStore.subscribe((s, prev) => {
    if (s.loaded && !prev.loaded) checkReminders()
  })
  const stopClick = desktop?.onNotifyClick?.(open)
  checkReminders()
  return () => {
    clearInterval(timer)
    stopLoad()
    stopClick?.()
  }
}
