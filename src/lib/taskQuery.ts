// Tasks blocks: a fenced ```tasks block in a note holds a filter, written in the words of the Tasks view's
// narrow-down box, and shows the matching tasks live. This is the text side: reading the filter and choosing the
// tasks. The file keeps only the filter, never the list.
import type { Note } from '../types'
import { outgoing, resolver } from './links'
import { TASK_FILTERS, allTasks, selectTasks, within, type Task, type TaskFilter, type TaskSource } from './tasks'
import { today } from './util'

export type BlockGroup = 'none' | 'date' | 'note' | 'priority'

export interface TaskQuery {
  filter: TaskFilter
  /** What is left for the narrow-down box: words, #tags, p1–p3. */
  words: string
  source: TaskSource
  group: BlockGroup
  limit: number
  /** Note titles from [[links]]: tasks in one of these notes, or linking to one. */
  links: string[]
  /** Things that could not be read, shown under the block. */
  problems: string[]
  /** The text is a query for Obsidian's Tasks plugin, which uses the same fence name. */
  obsidian: boolean
}

/** List names as they can be written, longest first so "all open" is read before "open". */
const LISTS: [string, TaskFilter][] = [
  ['next 30 days', 'month'],
  ['this week', 'week'],
  ['all open', 'open'],
  ['no date', 'undated'],
  ['inbox', 'inbox'],
  ['today', 'today'],
  ['upcoming', 'upcoming'],
  ['anytime', 'anytime'],
  ['someday', 'someday'],
  ['logbook', 'done'],
  ['done', 'done'],
  ['overdue', 'overdue'],
  ['week', 'week'],
  ['month', 'month'],
  ['undated', 'undated'],
  ['open', 'open'],
]

/** What a block can be filled in with, for suggestions as it is typed: each list's name as written, and what it shows. */
export const BLOCK_LISTS: [string, string][] = TASK_FILTERS.map(([, label, about]) => [label.toLowerCase(), about])
export const BLOCK_SETTINGS: Record<'group' | 'from', [string, string][]> = {
  group: [['date', 'Under Overdue, Today, Tomorrow, Later'], ['project', "Under each task's project or note"], ['priority', 'Under P1, P2, P3'], ['none', 'One list']],
  from: [['daily', 'Only tasks written in daily notes'], ['notes', 'Leave out tasks written in daily notes'], ['all', 'Every note']],
}

const GROUPS: Record<string, BlockGroup> = { none: 'none', date: 'date', note: 'note', project: 'note', priority: 'priority' }
const SOURCES: Record<string, TaskSource> = { all: 'all', notes: 'notes', daily: 'daily' }

/** Lines that only Obsidian's Tasks plugin writes. */
const OBSIDIAN = /^\s*(not done|(due|scheduled|starts|happens|done|created)\s+(before|after|on|in|today|this|next|last)|no (due|scheduled|start) date|has (due|scheduled|start) date|(path|description|heading|tags?|filename)\s+(includes|does not include|regex)|sort by|group by|hide |show |limit to|explain|filter by|is (recurring|not recurring)|priority is)/i

/** The block's text as a filter. Anything it cannot place is reported, so a typo does not silently match nothing. */
export function parseTaskQuery(text: string): TaskQuery {
  const q: TaskQuery = { filter: 'open', words: '', source: 'all', group: 'none', limit: 0, links: [], problems: [], obsidian: false }
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'))
  if (lines.some((l) => OBSIDIAN.test(l))) return { ...q, obsidian: true }
  let rest = lines.join(' ')
  rest = rest.replace(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g, (_m, title: string) => {
    q.links.push(title.trim())
    return ' '
  })
  rest = rest.replace(/\b(from|group|limit)\s*:\s*(\S+)/gi, (_m, key: string, value: string) => {
    const k = key.toLowerCase()
    const v = value.toLowerCase()
    if (k === 'from' && SOURCES[v]) q.source = SOURCES[v]
    else if (k === 'group' && GROUPS[v]) q.group = GROUPS[v]
    else if (k === 'limit' && /^\d+$/.test(v)) q.limit = Number(v)
    else q.problems.push(`${key}: ${value}`)
    return ' '
  })
  rest = rest.replace(/\blimit\s+(\d+)\b/gi, (_m, n: string) => {
    q.limit = Number(n)
    return ' '
  })
  let lists = 0
  for (const [name, filter] of LISTS) {
    const re = new RegExp(`(^|\\s)${name.replace(/ /g, '\\s+')}(?=\\s|$)`, 'i')
    if (re.test(rest)) {
      if (!lists++) q.filter = filter
      else q.problems.push(`only one list can be used (${name})`)
      rest = rest.replace(re, ' ')
    }
  }
  // Any other "word:" is a setting Margin does not know.
  rest = rest.replace(/(^|\s)([A-Za-z]+:(?:\s*[^\s:#[]+)?)/g, (_m, sp: string, bad: string) => {
    q.problems.push(bad)
    return sp
  })
  q.words = rest.replace(/\s+/g, ' ').trim()
  return q
}

export interface TaskContext {
  notes: Record<string, Note>
  templatesFolder: string
  inboxFolder: string
  meetingsFolder: string
  weekStart: number
  now?: string
  /** Notes left out of task lists (the triage note), by path. */
  hidden?: string[]
}

/**
 * The tasks a block shows, most urgent first (the Logbook: latest first), with the total before the limit.
 * A [[link]] keeps the tasks written in that note, the ones that link to it on their own line, and the ones in a
 * meeting note that links to it, as the Tasks view does when it groups by project.
 */
export function runTaskQuery(q: TaskQuery, ctx: TaskContext): { tasks: Task[]; total: number; missing: string[] } {
  const now = ctx.now ?? today()
  let tasks = selectTasks(allTasks(ctx.notes, ctx.templatesFolder, ctx.inboxFolder, ctx.hidden ?? []), ctx.notes, { filter: q.filter, query: q.words, source: q.source }, ctx.weekStart, now)
  const missing: string[] = []
  if (q.links.length) {
    const find = resolver(ctx.notes)
    const ids = new Set<string>()
    for (const title of q.links) {
      const id = find(title)
      if (id) ids.add(id)
      else missing.push(title)
    }
    const meetingLinks = new Map<string, boolean>()
    const meetingLinksTo = (note: Note) => {
      let hit = meetingLinks.get(note.id)
      if (hit === undefined) {
        hit = note.type === 'note' && within(note.folder, ctx.meetingsFolder) && outgoing(note).some((t) => ids.has(find(t) ?? ''))
        meetingLinks.set(note.id, hit)
      }
      return hit
    }
    const LINK = /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g
    tasks = tasks.filter((t) => {
      if (ids.has(t.noteId)) return true
      if ([...t.raw.matchAll(LINK)].some((m) => ids.has(find(m[1]) ?? ''))) return true
      const note = ctx.notes[t.noteId]
      return !!note && meetingLinksTo(note)
    })
  }
  const total = tasks.length
  return { tasks: q.limit ? tasks.slice(0, q.limit) : tasks, total, missing }
}

/** A short description of the filter, for the block's header: "Today · #atlas · [[Priya]]". */
export function describeQuery(q: TaskQuery): string {
  const list = TASK_FILTERS.find(([f]) => f === q.filter)?.[1] ?? 'All open'
  const parts = [list, ...q.links.map((l) => `[[${l}]]`), q.words]
  if (q.source !== 'all') parts.push(q.source === 'daily' ? 'daily notes' : 'not daily notes')
  return parts.filter(Boolean).join(' · ')
}
