// Tasks are ordinary markdown checkboxes. Extra details are written on the same line as plain text:
//   - [ ] Send the proposal P2 #atlas >2026-10-08 @due(2026-10-10)
// "P1", "P2", "P3" is the priority (P1 highest), ">date" the day to work on it, "@due(date)" the deadline.
// ">someday" parks a task out of the active lists, and "@done(date)" records the day it was ticked.
// The lists follow Things: a planned day is when a task starts, so it stays in Today until it is done;
// only a missed deadline makes it overdue. A task in the Inbox note (the note called Inbox in the Inbox notebook)
// with no planned day waits in the Inbox list, out of Anytime, until it is given a day, Someday, or moved into a
// project's note.
import type { Note } from '../types'
import { addDays, parseYmd, today } from './util'
import { parseDatePhrase } from './dates'
import { outgoing, resolver } from './links'

export interface Task {
  noteId: string
  /** Index of the task's line in the note's content. */
  line: number
  /** Finished with: ticked ("[x]") or cancelled ("[-]"). Every list treats the two alike. */
  done: boolean
  /** Dropped rather than done: "[-]". `done` is true as well. */
  cancelled: boolean
  /** Everything after the checkbox, as written. */
  raw: string
  /** The task without its priority and dates. */
  text: string
  /** 0 none, 1 low (P3), 2 medium (P2), 3 high (P1) */
  priority: number
  tags: string[]
  scheduled?: string
  /** Planned for "someday": kept out of Today, Upcoming and Anytime. */
  someday: boolean
  due?: string
  /** The day it was ticked (or cancelled), when that was recorded. */
  completed?: string
  /** How it repeats, as written in "@repeat(…)": ticking it adds the next one (lib/repeat.ts). */
  repeat?: string
  /** When to be reminded: "YYYY-MM-DD HH:MM", from "@remind(…)". A day without a time means 09:00. */
  remind?: string
  /** Nearest heading above the task. */
  heading: string
  /** In the Inbox note. Set by allTasks. */
  inInbox?: boolean
}

export const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX-])(\]\s+)(.*)$/
const DATE = '\\d{4}-\\d{2}-\\d{2}'
const PRIORITY = /(^|\s)[Pp]([123])(?=\s|$)/
/** How a priority is written: P1 is the highest. */
export const priorityLabel = (priority: number) => (priority ? `P${4 - priority}` : '')
const SCHEDULED = new RegExp(`(^|\\s)>(${DATE}|[Ss]omeday)(?=\\s|$)`)
const DUE = new RegExp(`(^|\\s)@due\\((${DATE})\\)`)
const DONE = new RegExp(`(^|\\s)@done\\((${DATE})\\)`)
const CANCELLED = new RegExp(`(^|\\s)@cancelled\\((${DATE})\\)`)
const REPEAT = /(^|\s)@repeat\(([^)\n]+)\)/
const TIME = '\\d{1,2}:\\d{2}'
const REMIND = new RegExp(`(^|\\s)@remind\\((${DATE})(?:[ T](${TIME}))?\\)`)
const TAG = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g
/** The same details, for highlighting them where they are written. */
// Groups: 1 priority, 2 planned day, 3 due date, 4 "someday", 5 day it was done (or cancelled), 6 how it repeats, 7 reminder day.
export const TASK_TOKENS = new RegExp(`(?<=^|\\s)(?:[Pp]([123])(?=\\s|$)|>(${DATE})(?=\\s|$)|@due\\((${DATE})\\)|>([Ss]omeday)(?=\\s|$)|@(?:done|cancelled)\\((${DATE})\\)|@repeat\\(([^)\\n]+)\\)|@remind\\((${DATE})(?:[ T]${TIME})?\\))`, 'g')

export const PRIORITIES = ['None', 'Low', 'Medium', 'High']

export function parseTaskText(raw: string): Pick<Task, 'text' | 'priority' | 'tags' | 'scheduled' | 'someday' | 'due' | 'completed' | 'repeat' | 'remind'> {
  const written = PRIORITY.exec(raw)?.[2]
  const priority = written ? 4 - Number(written) : 0
  const planned = SCHEDULED.exec(raw)?.[2]
  const someday = planned?.toLowerCase() === 'someday'
  const scheduled = someday ? undefined : planned
  const due = DUE.exec(raw)?.[2]
  const completed = DONE.exec(raw)?.[2] ?? CANCELLED.exec(raw)?.[2]
  const repeat = REPEAT.exec(raw)?.[2].trim() || undefined
  const r = REMIND.exec(raw)
  const remind = r ? `${r[2]} ${(r[3] ?? '09:00').padStart(5, '0')}` : undefined
  const text = raw.replace(PRIORITY, '$1').replace(SCHEDULED, '$1').replace(DUE, '$1').replace(DONE, '$1').replace(CANCELLED, '$1').replace(REPEAT, '$1').replace(REMIND, '$1').replace(/\s{2,}/g, ' ').trim()
  const tags = [...new Set([...text.matchAll(TAG)].map((m) => m[1]))]
  return { text, priority, tags, scheduled, someday, due, completed, repeat, remind }
}

/**
 * Rewrite the details on a task: priority and dates go at the end of the line, in a fixed order.
 * A planned day and "someday" share one place, so setting either replaces the other.
 */
export function withDetails(raw: string, patch: { priority?: number; scheduled?: string | null; someday?: boolean; due?: string | null; repeat?: string | null; remind?: string | null }): string {
  const now = parseTaskText(raw)
  const priority = patch.priority ?? now.priority
  const scheduled = patch.someday ? undefined : patch.scheduled === undefined ? now.scheduled : patch.scheduled
  const someday = patch.someday ?? (patch.scheduled === undefined ? now.someday : false)
  const due = patch.due === undefined ? now.due : patch.due
  const repeat = patch.repeat === undefined ? now.repeat : patch.repeat
  const remind = patch.remind === undefined ? now.remind : patch.remind
  const planned = someday ? '>someday' : scheduled ? `>${scheduled}` : ''
  const done = DONE.exec(raw)?.[2]
  const cancelled = CANCELLED.exec(raw)?.[2]
  const closed = done ? `@done(${done})` : cancelled ? `@cancelled(${cancelled})` : ''
  return [now.text, priorityLabel(priority), planned, due ? `@due(${due})` : '', repeat ? `@repeat(${repeat})` : '', remind ? `@remind(${remind})` : '', closed].filter(Boolean).join(' ')
}

/**
 * Dates typed in words, turned into the dates they mean: ">fri" becomes ">2026-10-16" and
 * "@due(next week)" becomes "@due(2026-10-19)". ">" takes up to three words, the longest that reads as a date.
 * Anything that is not a date is left as typed. Used when a task is captured, so suggestions need not be picked.
 */
export function resolveTaskWords(raw: string, dayFirst = true): string {
  const out = raw
    .replace(/@due\(([^)]*)\)/g, (m, words: string) => {
      const date = parseDatePhrase(words.trim(), dayFirst)
      return date ? `@due(${date})` : m
    })
    .replace(/@remind\(([^)]*)\)/g, (m, words: string) => {
      const when = parseRemind(words, dayFirst)
      return when ? `@remind(${when})` : m
    })
  return out.replace(/(^|\s)>(\S+(?:[ \t]+(?![>@])\S+){0,2})/g, (m, lead: string, words: string) => {
    // Where each of the (up to three) words ends, so the longest that reads as a date can be cut off.
    const ends = [...words.matchAll(/\S+/g)].map((w) => w.index! + w[0].length)
    for (let n = ends.length; n > 0; n--) {
      const phrase = words.slice(0, ends[n - 1])
      const date = /^someday$/i.test(phrase) ? 'someday' : parseDatePhrase(phrase, dayFirst)
      if (date) return `${lead}>${date}${words.slice(ends[n - 1])}`
    }
    return m
  })
}

/**
 * A reminder typed in words: "fri 2pm", "tomorrow 9:30", "14:00" (today), "next monday" (at 09:00), or already
 * "2026-11-10 14:00". Gives "YYYY-MM-DD HH:MM", or null when it is not a day and time.
 */
export function parseRemind(words: string, dayFirst = true, now = today()): string | null {
  let s = words.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null
  let time = '09:00'
  const t = /(?:^|\s)(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$|(?:^|\s)(?:at\s+)?(\d{1,2})[:.](\d{2})$|(?:^|[\sT])(\d{1,2}):(\d{2})$/.exec(s)
  if (t) {
    let h: number
    let m: number
    if (t[3]) {
      h = Number(t[1]) % 12 + (t[3] === 'pm' ? 12 : 0)
      m = Number(t[2] ?? 0)
    } else if (t[4]) {
      h = Number(t[4])
      m = Number(t[5])
    } else {
      h = Number(t[6])
      m = Number(t[7])
    }
    if (h > 23 || m > 59) return null
    time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    s = s.slice(0, t.index).trim()
  }
  const date = s ? parseDatePhrase(s, dayFirst) : t ? now : null
  return date ? `${date} ${time}` : null
}

/** The task's text with "@done(date)" added at the end, or taken away. Nothing else on the line moves. */
export function withCompleted(raw: string, date: string | null, as: 'done' | 'cancelled' = 'done'): string {
  const without = raw.replace(DONE, '').replace(CANCELLED, '').trimEnd()
  return date ? `${without} @${as}(${date})` : without
}

/**
 * A whole line with its task ticked or unticked, recording the day when `stamp` is on.
 * Null when the line is not a task.
 */
export function setLineDone(line: string, done: boolean, stamp: boolean, now = today()): string | null {
  const m = TASK_LINE.exec(line)
  if (!m) return null
  const was = m[2] !== ' '
  if (was === done) return line
  let raw = m[4]
  if (!done) raw = withCompleted(raw, null)
  else if (stamp && raw.trim() && !DONE.test(raw)) raw = withCompleted(raw, now)
  return m[1] + (done ? 'x' : ' ') + m[3] + raw
}

/**
 * A whole line with its task cancelled ("[-]", recording the day as "@cancelled(date)" when `stamp` is on), or
 * reopened when it was cancelled. A ticked task can be cancelled too. Null when the line is not a task.
 */
export function setLineCancelled(line: string, cancelled: boolean, stamp: boolean, now = today()): string | null {
  const m = TASK_LINE.exec(line)
  if (!m) return null
  if ((m[2] === '-') === cancelled) return line
  if (!cancelled) return m[1] + ' ' + m[3] + withCompleted(m[4], null)
  return m[1] + '-' + m[3] + (stamp && m[4].trim() ? withCompleted(m[4], now, 'cancelled') : withCompleted(m[4], null))
}

/** The smallest edits that turn one version of a task line into another: the box, and the end of the line. */
function boxChanges(line: string, next: string): { from: number; to: number; insert: string }[] {
  const start = TASK_LINE.exec(line)![1].length
  const changes = [{ from: start, to: start + 1, insert: next[start] }]
  let same = start + 1
  while (same < line.length && same < next.length && line[same] === next[same]) same++
  if (same < line.length || same < next.length) changes.push({ from: same, to: line.length, insert: next.slice(same) })
  return changes
}

/** The same change as setLineCancelled, as the smallest edits to the line. Null when the line is not a task. */
export function lineCancelChanges(line: string, cancelled: boolean, stamp: boolean, now = today()): { from: number; to: number; insert: string }[] | null {
  const next = setLineCancelled(line, cancelled, stamp, now)
  return next == null ? null : boxChanges(line, next)
}

/**
 * The same change as setLineDone, as the smallest edits to the line (offsets from its start):
 * the mark in the box, and the end of the line where "@done(date)" goes. Editing only those keeps
 * the cursor where it was. Null when the line is not a task.
 */
export function lineDoneChanges(line: string, done: boolean, stamp: boolean, now = today()): { from: number; to: number; insert: string }[] | null {
  const next = setLineDone(line, done, stamp, now)
  return next == null ? null : boxChanges(line, next)
}

const cache = new Map<string, { content: string; tasks: Task[] }>()

export function tasksOf(note: Note): Task[] {
  const hit = cache.get(note.id)
  if (hit && hit.content === note.content) return hit.tasks
  const tasks: Task[] = []
  if (note.content.includes('[')) {
    let fence = false
    let heading = ''
    note.content.split('\n').forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence
      if (fence) return
      const h = /^#{1,6}\s+(.+?)\s*#*$/.exec(line)
      if (h) heading = h[1]
      // A new canvas card starts a new context.
      else if (line.startsWith('<!-- card')) heading = ''
      const m = TASK_LINE.exec(line)
      if (!m || !m[4].trim()) return
      tasks.push({ noteId: note.id, line: index, done: m[2] !== ' ', cancelled: m[2] === '-', raw: m[4], heading, ...parseTaskText(m[4]) })
    })
  }
  cache.set(note.id, { content: note.content, tasks })
  return tasks
}

/** A notebook path compared the way macOS compares folder names: capitals and stray spaces or slashes do not matter. */
const notebookKey = (folder: string) => folder.split('/').map((s) => s.trim()).filter(Boolean).join('/').toLowerCase()

/** Whether two notebook paths name the same notebook, as macOS compares folder names. */
export const sameNotebook = (a: string, b: string) => notebookKey(a) === notebookKey(b)

/** The title of the one note that is the tasks Inbox. It lives in the Inbox notebook. */
export const INBOX_NOTE_TITLE = 'Inbox'

/** Whether a note is the Inbox note: the note called Inbox in the Inbox notebook. Capitals do not matter, as on a Mac. */
export function isInboxNote(note: Pick<Note, 'folder' | 'title'>, inboxFolder: string): boolean {
  return !!notebookKey(inboxFolder) && notebookKey(note.folder) === notebookKey(inboxFolder) && note.title.trim().toLowerCase() === INBOX_NOTE_TITLE.toLowerCase()
}

let lastNotes: Record<string, Note> | null = null
let lastFolder = ''
let lastInbox = ''
let lastHidden = ''
let lastAll: Task[] = []

/** A note path as compared for `hidden`: no leading or trailing slashes, ".md" added, capitals ignored. */
export const notePathKey = (p: string) => {
  const s = p.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase()
  return s && !s.endsWith('.md') ? s + '.md' : s
}
/** Every task in every note, except the ones in templates. Tasks in the Inbox note are marked `inInbox`. */
export function allTasks(notes: Record<string, Note>, templatesFolder: string, inboxFolder = '', hidden: string[] = []): Task[] {
  // Notes whose tasks are not yours yet (the triage note an outside program writes), by their path in the folder.
  const skip = new Set(hidden.map(notePathKey).filter(Boolean))
  const hiddenKey = [...skip].sort().join('\n')
  if (notes === lastNotes && templatesFolder === lastFolder && inboxFolder === lastInbox && hiddenKey === lastHidden) return lastAll
  lastAll = Object.values(notes).flatMap((n) =>
    n.folder === templatesFolder || (skip.size && skip.has(notePathKey(n.path))) ? [] : isInboxNote(n, inboxFolder) ? tasksOf(n).map((t) => ({ ...t, inInbox: true })) : tasksOf(n),
  )
  lastNotes = notes
  lastFolder = templatesFolder
  lastInbox = inboxFolder
  lastHidden = hiddenKey
  return lastAll
}

/**
 * The note's content with one task line replaced, or null if that line is no longer the same task.
 * Ticking with `stamp` on records the day; unticking takes the day away.
 */
export function rewriteTask(content: string, task: Task, change: { done?: boolean; cancelled?: boolean; raw?: string; stamp?: boolean }): string | null {
  const lines = content.split('\n')
  const m = TASK_LINE.exec(lines[task.line] ?? '')
  if (!m || m[4] !== task.raw) return null
  let line = m[1] + m[2] + m[3] + (change.raw ?? m[4])
  if (change.done !== undefined) line = setLineDone(line, change.done, !!change.stamp) ?? line
  if (change.cancelled !== undefined) line = setLineCancelled(line, change.cancelled, !!change.stamp) ?? line
  lines[task.line] = line
  return lines.join('\n')
}

/** The date a task belongs to when sorting: its deadline if it has one, otherwise the day it is planned for. */
export const taskDate = (t: Task) => t.due || t.scheduled || ''

/**
 * The day a task next needs attention: a missed deadline first, otherwise the nearest of its dates.
 * A planned day that has passed counts as today, because the task is still waiting in Today.
 */
export function nextDate(t: Task, now = today()): string {
  if (t.due && t.due < now) return t.due
  const planned = t.scheduled && t.scheduled < now ? now : t.scheduled
  return [planned, t.due].filter((d): d is string => !!d).sort()[0] || ''
}

/** Past its deadline. A planned day going by does not make a task overdue: it stays in Today. */
export const isOverdue = (t: Task, now = today()) => !t.done && !!t.due && t.due < now

/** In Today: planned for today or an earlier day, or due today or earlier. */
export const isToday = (t: Task, now = today()) => !t.done && ((!!t.scheduled && t.scheduled <= now) || (!!t.due && t.due <= now))

/**
 * Waiting in the Inbox: open, in the Inbox note, and not yet decided on (no planned day, not Someday).
 * A due date does not take it out; a task due today or earlier is also in Today.
 */
export const inInbox = (t: Task) => !t.done && !!t.inInbox && !t.scheduled && !t.someday

/** Planned for an earlier day and still not done, so carried into today. */
export const isCarried = (t: Task, now = today()) => !t.done && !!t.scheduled && t.scheduled < now && !isOverdue(t, now) && t.due !== now

/** Due or planned for exactly this day. */
export const isOn = (t: Task, date: string) => t.due === date || t.scheduled === date

/** First and last day of the week containing `date`. `weekStart` is 0 for Sunday, 1 for Monday. */
export function weekRange(date: string, weekStart: number): [string, string] {
  const offset = (parseYmd(date).getDay() - weekStart + 7) % 7
  const from = addDays(date, -offset)
  return [from, addDays(from, 6)]
}

export type TaskFilter = 'open' | 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'week' | 'month' | 'overdue' | 'undated' | 'done'

/** The lists, in the order they are shown. The first six are the ones from Things. */
export const TASK_FILTERS: [TaskFilter, string, string][] = [
  ['inbox', 'Inbox', 'Captured and not yet decided on: in the Inbox note, with no planned day'],
  ['today', 'Today', 'Planned for today or earlier, or due today or earlier'],
  ['upcoming', 'Upcoming', 'Planned for a day after today'],
  ['anytime', 'Anytime', 'Everything you could do now: not planned for later, not someday, not waiting in the Inbox'],
  ['someday', 'Someday', 'Parked for later, kept out of the other lists'],
  ['done', 'Logbook', 'Ticked tasks, most recently done first'],
  ['overdue', 'Overdue', 'Past the due date'],
  ['week', 'This week', 'Due or planned for this week'],
  ['month', 'Next 30 days', 'Due or planned from today to 30 days ahead'],
  ['undated', 'No date', 'No due date, no planned day, not someday and not waiting in the Inbox'],
  ['open', 'All open', 'Every task that is not ticked'],
]

export function matchesFilter(t: Task, filter: TaskFilter, weekStart: number, now = today()): boolean {
  if (filter === 'done') return t.done
  if (t.done) return false
  const [from, to] = weekRange(now, weekStart)
  const inRange = (d?: string) => !!d && d >= from && d <= to
  switch (filter) {
    case 'today':
      return isToday(t, now)
    case 'inbox':
      return inInbox(t)
    case 'anytime':
      return !t.someday && !(t.scheduled && t.scheduled > now) && !inInbox(t)
    case 'someday':
      return t.someday
    case 'week':
      return inRange(t.due) || inRange(t.scheduled)
    case 'month': {
      const end = addDays(now, 30)
      return [t.due, t.scheduled].some((d) => !!d && d >= now && d <= end)
    }
    case 'overdue':
      return isOverdue(t, now)
    case 'upcoming':
      return !!t.scheduled && t.scheduled > now
    case 'undated':
      return !taskDate(t) && !t.someday && !inInbox(t)
    default:
      return true
  }
}

/** The notebooks that matter for telling projects apart: the ones the app files into, and People. */
export interface ProjectFolders {
  dailyFolder: string
  meetingsFolder: string
  peopleFolder: string
  templatesFolder: string
  scratchFolder: string
  inboxFolder: string
}

/** Whether a notebook is `folder` or a notebook inside it, compared as macOS compares folder names. */
/** A notebook, or one inside it (spelling of capitals and slashes ignored). */
export const within = (notebook: string, folder: string) => !!notebookKey(folder) && (notebookKey(notebook) === notebookKey(folder) || notebookKey(notebook).startsWith(notebookKey(folder) + '/'))

/**
 * A project, as in Things: an ordinary note outside the notebooks the app manages (daily notes, meetings, the
 * Inbox, templates, scratch) and outside People. "Work/Organization" is a project; a meeting note is not.
 */
export function isProjectNote(note: Note, f: ProjectFolders): boolean {
  if (note.type !== 'note') return false
  return ![f.dailyFolder, f.meetingsFolder, f.peopleFolder, f.templatesFolder, f.scratchFolder, f.inboxFolder].some((x) => within(note.folder, x))
}

const LINK = /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g

/**
 * The projects a task is shown under when the Tasks view is grouped by project, as note ids:
 * - in a project note: that project;
 * - linking a project on its own line ("- [ ] Send the deck [[Organization]]"): the projects it links;
 * - in a meeting note that links projects anywhere: those projects, so a meeting's actions show with its project;
 * - otherwise its own note.
 * Nothing in the notes changes; this only decides where a task is listed.
 */
export function projectsOf(t: Task, notes: Record<string, Note>, f: ProjectFolders): string[] {
  const own = notes[t.noteId]
  if (!own) return []
  if (isProjectNote(own, f)) return [own.id]
  const find = resolver(notes)
  const projects = (titles: string[]) => [...new Set(titles.map((x) => find(x)).filter((id): id is string => !!id && id !== own.id && isProjectNote(notes[id], f)))]
  const onLine = projects([...t.raw.matchAll(LINK)].map((m) => m[1]))
  if (onLine.length) return onLine
  if (own.type === 'note' && within(own.folder, f.meetingsFolder)) {
    const linked = projects(outgoing(own))
    if (linked.length) return linked
  }
  return [own.id]
}

/** Which notes tasks are taken from: everywhere, ordinary notes only, or daily notes only. */
export type TaskSource = 'all' | 'notes' | 'daily'
export const TASK_SOURCES: [TaskSource, string, string][] = [
  ['all', 'All', 'Tasks from every note'],
  ['notes', 'Notes', 'Leave out tasks written in daily notes'],
  ['daily', 'Daily', 'Only tasks written in daily notes'],
]
export type TaskGroup = 'date' | 'note' | 'priority' | 'none'

/** A list in the Tasks view: which tasks, narrowed how, grouped how. Saved ones have a name and show in the sidebar. */
export interface TaskView {
  filter: TaskFilter
  query: string
  source: TaskSource
  group: TaskGroup
}
export interface SavedTaskView extends TaskView {
  id: string
  name: string
}

/** The tasks a view shows, most urgent first. */
export function selectTasks(tasks: Task[], notes: Record<string, Note>, view: Pick<TaskView, 'filter' | 'query' | 'source'>, weekStart: number, now = today()): Task[] {
  const q = view.query.trim()
  return tasks
    .filter((t) => {
      const note = notes[t.noteId]
      if (!note || !matchesFilter(t, view.filter, weekStart, now)) return false
      if (view.source !== 'all' && (note.type === 'daily') !== (view.source === 'daily')) return false
      return !q || matchesQuery(t, note.title, q)
    })
    .sort(view.filter === 'done' ? byCompleted : byUrgency)
}

/** Most recently done first; ticked tasks with no recorded day go last. */
export function byCompleted(a: Task, b: Task): number {
  return (b.completed || '').localeCompare(a.completed || '') || byUrgency(a, b)
}

/**
 * Narrow tasks with a typed query. Words must all appear in the task or its note's title;
 * "#tag" needs that tag, and "p1", "p2" or "p3" needs that priority or higher.
 */
export function matchesQuery(t: Task, noteTitle: string, query: string): boolean {
  const hay = `${t.text} ${noteTitle}`.toLowerCase()
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (/^p[123]$/.test(word)) {
      if (t.priority < 4 - Number(word[1])) return false
    } else if (word.startsWith('#') && word.length > 1) {
      const tag = word.slice(1)
      if (!t.tags.some((x) => x.toLowerCase() === tag || x.toLowerCase().startsWith(tag + '/'))) return false
    } else if (!hay.includes(word)) return false
  }
  return true
}

/** Most urgent first: by date (undated last), then priority, then the order they were written. */
export function byUrgency(a: Task, b: Task): number {
  const [da, db] = [nextDate(a) || '9999', nextDate(b) || '9999']
  return da.localeCompare(db) || b.priority - a.priority || a.noteId.localeCompare(b.noteId) || a.line - b.line
}

/** "Today", "Tomorrow", "Fri 9 Oct", with the year when it is not this one. */
export function shortDate(date: string, now = today()): string {
  if (date === now) return 'Today'
  if (date === addDays(now, 1)) return 'Tomorrow'
  if (date === addDays(now, -1)) return 'Yesterday'
  const d = parseYmd(date)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(date.slice(0, 4) === now.slice(0, 4) ? {} : { year: 'numeric' }) })
}
