// Tasks are ordinary markdown checkboxes. Extra details are written on the same line as plain text:
//   - [ ] Send the proposal P2 #atlas >2026-10-08 @due(2026-10-10)
// "P1", "P2", "P3" is the priority (P1 highest), ">date" the day to work on it, "@due(date)" the deadline.
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
  due?: string
  /** Nearest heading above the task. */
  heading: string
}

export const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/
const DATE = '\\d{4}-\\d{2}-\\d{2}'
const PRIORITY = /(^|\s)[Pp]([123])(?=\s|$)/
/** How a priority is written: P1 is the highest. */
export const priorityLabel = (priority: number) => (priority ? `P${4 - priority}` : '')
const SCHEDULED = new RegExp(`(^|\\s)>(${DATE})(?=\\s|$)`)
const DUE = new RegExp(`(^|\\s)@due\\((${DATE})\\)`)
const TAG = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g
/** The same details, for highlighting them where they are written. */
export const TASK_TOKENS = new RegExp(`(?<=^|\\s)(?:[Pp]([123])(?=\\s|$)|>(${DATE})(?=\\s|$)|@due\\((${DATE})\\))`, 'g')

export const PRIORITIES = ['None', 'Low', 'Medium', 'High']

export function parseTaskText(raw: string): Pick<Task, 'text' | 'priority' | 'tags' | 'scheduled' | 'due'> {
  const written = PRIORITY.exec(raw)?.[2]
  const priority = written ? 4 - Number(written) : 0
  const scheduled = SCHEDULED.exec(raw)?.[2]
  const due = DUE.exec(raw)?.[2]
  const text = raw.replace(PRIORITY, '$1').replace(SCHEDULED, '$1').replace(DUE, '$1').replace(/\s{2,}/g, ' ').trim()
  const tags = [...new Set([...text.matchAll(TAG)].map((m) => m[1]))]
  return { text, priority, tags, scheduled, due }
}

/** Rewrite the details on a task: priority and dates go at the end of the line, in a fixed order. */
export function withDetails(raw: string, patch: { priority?: number; scheduled?: string | null; due?: string | null }): string {
  const now = parseTaskText(raw)
  const priority = patch.priority ?? now.priority
  const scheduled = patch.scheduled === undefined ? now.scheduled : patch.scheduled
  const due = patch.due === undefined ? now.due : patch.due
  return [now.text, priorityLabel(priority), scheduled ? `>${scheduled}` : '', due ? `@due(${due})` : ''].filter(Boolean).join(' ')
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

/** The note's content with one task line replaced, or null if that line is no longer the same task. */
export function rewriteTask(content: string, task: Task, change: { done?: boolean; raw?: string }): string | null {
  const lines = content.split('\n')
  const m = TASK_LINE.exec(lines[task.line] ?? '')
  if (!m || m[4] !== task.raw) return null
  const mark = change.done === undefined ? m[2] : change.done ? 'x' : ' '
  lines[task.line] = m[1] + mark + m[3] + (change.raw ?? m[4])
  return lines.join('\n')
}

/** The date a task belongs to when sorting: its deadline if it has one, otherwise the day it is planned for. */
export const taskDate = (t: Task) => t.due || t.scheduled || ''

/** The day a task next needs attention: a missed deadline first, otherwise the nearest of its two dates still ahead. */
export function nextDate(t: Task, now = today()): string {
  if (t.due && t.due < now) return t.due
  const ahead = [t.scheduled, t.due].filter((d): d is string => !!d && d >= now).sort()
  return ahead[0] || taskDate(t)
}

/** Past its deadline, or planned for a day that has gone by with no deadline set. */
export const isOverdue = (t: Task, now = today()) => !t.done && !!taskDate(t) && taskDate(t) < now

/** Due or planned for exactly this day. */
export const isOn = (t: Task, date: string) => t.due === date || t.scheduled === date

/** First and last day of the week containing `date`. `weekStart` is 0 for Sunday, 1 for Monday. */
export function weekRange(date: string, weekStart: number): [string, string] {
  const offset = (parseYmd(date).getDay() - weekStart + 7) % 7
  const from = addDays(date, -offset)
  return [from, addDays(from, 6)]
}

export type TaskFilter = 'open' | 'today' | 'week' | 'month' | 'overdue' | 'upcoming' | 'undated' | 'done'

export const TASK_FILTERS: [TaskFilter, string, string][] = [
  ['open', 'All open', 'Every task that is not ticked'],
  ['today', 'Today', 'Due or planned for today'],
  ['week', 'This week', 'Due or planned for this week'],
  ['month', 'Next 30 days', 'Due or planned from today to 30 days ahead'],
  ['overdue', 'Overdue', 'Past the due date, or planned for a day that has passed'],
  ['upcoming', 'Upcoming', 'Dated after today'],
  ['undated', 'No date', 'Neither a due date nor a planned day'],
  ['done', 'Done', 'Ticked tasks'],
]

export function matchesFilter(t: Task, filter: TaskFilter, weekStart: number, now = today()): boolean {
  if (filter === 'done') return t.done
  if (t.done) return false
  const [from, to] = weekRange(now, weekStart)
  const inRange = (d?: string) => !!d && d >= from && d <= to
  switch (filter) {
    case 'today':
      return isOn(t, now)
    case 'week':
      return inRange(t.due) || inRange(t.scheduled)
    case 'month': {
      const end = addDays(now, 30)
      return [t.due, t.scheduled].some((d) => !!d && d >= now && d <= end)
    }
    case 'overdue':
      return isOverdue(t, now)
    case 'upcoming':
      return nextDate(t, now) > now
    case 'undated':
      return !taskDate(t)
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
    .sort(byUrgency)
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
