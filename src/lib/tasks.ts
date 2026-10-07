// Tasks are ordinary markdown checkboxes. Extra details are written on the same line as plain text:
//   - [ ] Send the proposal P2 #atlas >2026-10-08 @due(2026-10-10)
// "P1", "P2", "P3" is the priority (P1 highest), ">date" the day to work on it, "@due(date)" the deadline.
// ">someday" parks a task out of the active lists, and "@done(date)" records the day it was ticked.
// The lists follow Things: a planned day is when a task starts, so it stays in Today until it is done;
// only a missed deadline makes it overdue.
import type { Note } from '../types'
import { addDays, parseYmd, today } from './util'

export interface Task {
  noteId: string
  /** Index of the task's line in the note's content. */
  line: number
  done: boolean
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
  /** The day it was ticked, when that was recorded. */
  completed?: string
  /** Nearest heading above the task. */
  heading: string
}

export const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/
const DATE = '\\d{4}-\\d{2}-\\d{2}'
const PRIORITY = /(^|\s)[Pp]([123])(?=\s|$)/
/** How a priority is written: P1 is the highest. */
export const priorityLabel = (priority: number) => (priority ? `P${4 - priority}` : '')
const SCHEDULED = new RegExp(`(^|\\s)>(${DATE}|[Ss]omeday)(?=\\s|$)`)
const DUE = new RegExp(`(^|\\s)@due\\((${DATE})\\)`)
const DONE = new RegExp(`(^|\\s)@done\\((${DATE})\\)`)
const TAG = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g
/** The same details, for highlighting them where they are written. */
// Groups: 1 priority, 2 planned day, 3 due date, 4 "someday", 5 day it was done.
export const TASK_TOKENS = new RegExp(`(?<=^|\\s)(?:[Pp]([123])(?=\\s|$)|>(${DATE})(?=\\s|$)|@due\\((${DATE})\\)|>([Ss]omeday)(?=\\s|$)|@done\\((${DATE})\\))`, 'g')

export const PRIORITIES = ['None', 'Low', 'Medium', 'High']

export function parseTaskText(raw: string): Pick<Task, 'text' | 'priority' | 'tags' | 'scheduled' | 'someday' | 'due' | 'completed'> {
  const written = PRIORITY.exec(raw)?.[2]
  const priority = written ? 4 - Number(written) : 0
  const planned = SCHEDULED.exec(raw)?.[2]
  const someday = planned?.toLowerCase() === 'someday'
  const scheduled = someday ? undefined : planned
  const due = DUE.exec(raw)?.[2]
  const completed = DONE.exec(raw)?.[2]
  const text = raw.replace(PRIORITY, '$1').replace(SCHEDULED, '$1').replace(DUE, '$1').replace(DONE, '$1').replace(/\s{2,}/g, ' ').trim()
  const tags = [...new Set([...text.matchAll(TAG)].map((m) => m[1]))]
  return { text, priority, tags, scheduled, someday, due, completed }
}

/**
 * Rewrite the details on a task: priority and dates go at the end of the line, in a fixed order.
 * A planned day and "someday" share one place, so setting either replaces the other.
 */
export function withDetails(raw: string, patch: { priority?: number; scheduled?: string | null; someday?: boolean; due?: string | null }): string {
  const now = parseTaskText(raw)
  const priority = patch.priority ?? now.priority
  const scheduled = patch.someday ? undefined : patch.scheduled === undefined ? now.scheduled : patch.scheduled
  const someday = patch.someday ?? (patch.scheduled === undefined ? now.someday : false)
  const due = patch.due === undefined ? now.due : patch.due
  const planned = someday ? '>someday' : scheduled ? `>${scheduled}` : ''
  return [now.text, priorityLabel(priority), planned, due ? `@due(${due})` : '', now.completed ? `@done(${now.completed})` : ''].filter(Boolean).join(' ')
}

/** The task's text with "@done(date)" added at the end, or taken away. Nothing else on the line moves. */
export function withCompleted(raw: string, date: string | null): string {
  const without = raw.replace(DONE, '').trimEnd()
  return date ? `${without} @done(${date})` : without
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
 * The same change as setLineDone, as the smallest edits to the line (offsets from its start):
 * the mark in the box, and the end of the line where "@done(date)" goes. Editing only those keeps
 * the cursor where it was. Null when the line is not a task.
 */
export function lineDoneChanges(line: string, done: boolean, stamp: boolean, now = today()): { from: number; to: number; insert: string }[] | null {
  const next = setLineDone(line, done, stamp, now)
  if (next == null) return null
  const start = TASK_LINE.exec(line)![1].length
  const changes = [{ from: start, to: start + 1, insert: done ? 'x' : ' ' }]
  let same = start + 1
  while (same < line.length && same < next.length && line[same] === next[same]) same++
  if (same < line.length || same < next.length) changes.push({ from: same, to: line.length, insert: next.slice(same) })
  return changes
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
      tasks.push({ noteId: note.id, line: index, done: m[2] !== ' ', raw: m[4], heading, ...parseTaskText(m[4]) })
    })
  }
  cache.set(note.id, { content: note.content, tasks })
  return tasks
}

let lastNotes: Record<string, Note> | null = null
let lastFolder = ''
let lastAll: Task[] = []
/** Every task in every note, except the ones in templates. */
export function allTasks(notes: Record<string, Note>, templatesFolder: string): Task[] {
  if (notes === lastNotes && templatesFolder === lastFolder) return lastAll
  lastAll = Object.values(notes).flatMap((n) => (n.folder === templatesFolder ? [] : tasksOf(n)))
  lastNotes = notes
  lastFolder = templatesFolder
  return lastAll
}

/**
 * The note's content with one task line replaced, or null if that line is no longer the same task.
 * Ticking with `stamp` on records the day; unticking takes the day away.
 */
export function rewriteTask(content: string, task: Task, change: { done?: boolean; raw?: string; stamp?: boolean }): string | null {
  const lines = content.split('\n')
  const m = TASK_LINE.exec(lines[task.line] ?? '')
  if (!m || m[4] !== task.raw) return null
  let line = m[1] + m[2] + m[3] + (change.raw ?? m[4])
  if (change.done !== undefined) line = setLineDone(line, change.done, !!change.stamp) ?? line
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

export type TaskFilter = 'open' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'week' | 'month' | 'overdue' | 'undated' | 'done'

/** The lists, in the order they are shown. The first five are the ones from Things. Keys 1 to 9 and 0 pick them. */
export const TASK_FILTERS: [TaskFilter, string, string][] = [
  ['today', 'Today', 'Planned for today or earlier, or due today or earlier'],
  ['upcoming', 'Upcoming', 'Planned for a day after today'],
  ['anytime', 'Anytime', 'Everything you could do now: not planned for later and not someday'],
  ['someday', 'Someday', 'Parked for later, kept out of the other lists'],
  ['done', 'Logbook', 'Ticked tasks, most recently done first'],
  ['overdue', 'Overdue', 'Past the due date'],
  ['week', 'This week', 'Due or planned for this week'],
  ['month', 'Next 30 days', 'Due or planned from today to 30 days ahead'],
  ['undated', 'No date', 'No due date, no planned day and not someday'],
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
    case 'anytime':
      return !t.someday && !(t.scheduled && t.scheduled > now)
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
      return !taskDate(t) && !t.someday
    default:
      return true
  }
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
