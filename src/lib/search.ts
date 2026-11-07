import MiniSearch from 'minisearch'
import type { Note } from '../types'
import { tagsOf } from './links'
import { parseDatePhrase } from './dates'
import { displayTitle, isYmd } from './util'
import { tasksOf, within, type Task } from './tasks'

interface Doc {
  id: string
  title: string
  alias: string
  body: string
  tags: string
  folder: string
}

const mini = new MiniSearch<Doc>({
  fields: ['title', 'alias', 'body', 'tags', 'folder'],
  searchOptions: { boost: { title: 5, alias: 3, tags: 2 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' },
})

// Only notes that changed since the last search are re-indexed.
const indexed = new Map<string, Note>()

function sync(notes: Record<string, Note>) {
  for (const id of [...indexed.keys()]) {
    if (!notes[id]) {
      mini.discard(id)
      indexed.delete(id)
    }
  }
  for (const note of Object.values(notes)) {
    const prev = indexed.get(note.id)
    if (prev === note) continue
    if (prev) mini.discard(note.id)
    mini.add({
      id: note.id,
      title: note.title,
      alias: displayTitle(note),
      body: note.content.replace(/<!--[\s\S]*?-->/g, ' '),
      tags: tagsOf(note).join(' '),
      folder: note.folder,
    })
    indexed.set(note.id, note)
  }
}

/**
 * A search as typed in ⌘K. Besides words (found as in a search engine, word starts and small typos allowed):
 * `"exact phrase"`, `-word` / `-"phrase"` / `-#tag` to leave out, `#tag`, `in:Notebook` (or `in:"Two words"`, with
 * the notebooks inside it), `title:word`, `is:daily|meeting|research|scratch|note`, `has:tasks` (open ones), and
 * `after:` / `before:` with a day (a daily note's own day, otherwise the day it was last changed).
 */
export interface SearchQuery {
  words: string[]
  phrases: string[]
  without: string[]
  tags: string[]
  withoutTags: string[]
  notebooks: string[]
  titleWords: string[]
  kinds: string[]
  hasTasks: boolean
  after?: string
  before?: string
  /** Operators that were not understood, shown so a typo is not silently ignored. */
  unknown: string[]
}

const KINDS = ['daily', 'meeting', 'research', 'scratch', 'note']

export function parseSearch(text: string, dayFirst = true): SearchQuery {
  const q: SearchQuery = { words: [], phrases: [], without: [], tags: [], withoutTags: [], notebooks: [], titleWords: [], kinds: [], hasTasks: false, unknown: [] }
  // A token: an optional "-", an optional "word:", then a quoted text (closed or not) or a run of non-spaces.
  for (const m of text.matchAll(/(-)?(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi)) {
    const not = !!m[1]
    const key = m[2]?.toLowerCase()
    const quoted = m[3] !== undefined
    const value = (quoted ? m[3] : m[4] ?? '').trim()
    if (!value && !key) continue
    if (!key) {
      if (value.startsWith('#') && value.length > 1 && !quoted) (not ? q.withoutTags : q.tags).push(value.slice(1).toLowerCase())
      else if (not) q.without.push(value.toLowerCase())
      else if (quoted) {
        if (value) q.phrases.push(value.toLowerCase())
      } else q.words.push(value)
      continue
    }
    const v = value.toLowerCase()
    if (key === 'in' || key === 'notebook') {
      if (value) q.notebooks.push(value)
    } else if (key === 'title') {
      if (value) q.titleWords.push(v)
    } else if (key === 'tag') {
      if (value) (not ? q.withoutTags : q.tags).push(v.replace(/^#/, ''))
    } else if (key === 'is' && KINDS.includes(v.replace(/s$/, ''))) q.kinds.push(v.replace(/s$/, ''))
    else if (key === 'has' && /^(open )?tasks?$|^todos?$/.test(v)) q.hasTasks = true
    else if ((key === 'after' || key === 'before') && value) {
      const day = parseDatePhrase(value, dayFirst)
      if (day) q[key] = day
      else q.unknown.push(`${key}:${value}`)
    } else if (/^https?$|^mailto$/.test(key) || !value) q.words.push(m[0])
    else q.unknown.push(`${key}:${value}`)
  }
  return q
}

/** Whether anything beyond plain words and #tags was used, so the results can say what they are limited to. */
export function describeSearch(q: SearchQuery): string {
  const parts = [
    ...q.notebooks.map((n) => `in ${n}`),
    ...q.kinds.map((k) => (k === 'note' ? 'ordinary notes' : k === 'research' ? 'research notes' : `${k} notes`)),
    ...q.phrases.map((p) => `“${p}”`),
    ...q.titleWords.map((w) => `title has “${w}”`),
    ...(q.hasTasks ? ['with open tasks'] : []),
    ...(q.after ? [`after ${q.after}`] : []),
    ...(q.before ? [`before ${q.before}`] : []),
    ...[...q.without, ...q.withoutTags.map((t) => '#' + t)].map((w) => `without “${w}”`),
  ]
  return parts.join(' · ')
}

export interface Hit {
  note: Note
  snippet: string
  terms: string[]
  /** The text to go to in the note when the result is opened: a phrase searched for, or the words. */
  find: string
}

const plainBody = (note: Note) => note.content.replace(/<!--[\s\S]*?-->/g, ' ')

function excerpt(note: Note, terms: string[]): string {
  const body = plainBody(note)
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
  const lower = body.toLowerCase()
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase())
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  if (at < 0) return body.slice(0, 120)
  const start = Math.max(0, at - 40)
  return (start > 0 ? '…' : '') + body.slice(start, at + 100).trim()
}

export interface SearchContext {
  meetingsFolder: string
  dayFirst?: boolean
}

/** The day a note belongs to for after: and before: — a daily note's own day, otherwise the day it last changed. */
const dayOf = (n: Note) => (n.type === 'daily' && isYmd(n.title) ? n.title : n.updated.slice(0, 10))

/** Whether a note passes everything in the search except its plain words. */
function passes(n: Note, q: SearchQuery, ctx: SearchContext): boolean {
  if (q.tags.length || q.withoutTags.length) {
    const tags = tagsOf(n).map((t) => t.toLowerCase())
    const has = (f: string) => tags.some((t) => t === f || t.startsWith(f))
    if (!q.tags.every(has) || q.withoutTags.some(has)) return false
  }
  if (q.notebooks.length && !q.notebooks.some((f) => within(n.folder, f))) return false
  if (q.kinds.length) {
    const kind = n.type === 'daily' ? 'daily' : n.type === 'article' ? 'research' : n.type === 'scratch' ? 'scratch' : within(n.folder, ctx.meetingsFolder) ? 'meeting' : 'note'
    if (!q.kinds.includes(kind)) return false
  }
  if (q.after && dayOf(n) <= q.after) return false
  if (q.before && dayOf(n) >= q.before) return false
  if (q.titleWords.length) {
    const title = `${n.title} ${displayTitle(n)}`.toLowerCase()
    if (!q.titleWords.every((w) => title.includes(w))) return false
  }
  if (q.phrases.length || q.without.length) {
    const hay = `${n.title}\n${displayTitle(n)}\n${plainBody(n)}`.toLowerCase().replace(/\s+/g, ' ')
    if (!q.phrases.every((p) => hay.includes(p.replace(/\s+/g, ' '))) || q.without.some((w) => hay.includes(w))) return false
  }
  if (q.hasTasks && !tasksOf(n).some((t) => !t.done)) return false
  return true
}

export function search(notes: Record<string, Note>, query: string, limit = 40, ctx: SearchContext = { meetingsFolder: 'Meetings' }): Hit[] {
  sync(notes)
  if (!query.trim()) return []
  const q = parseSearch(query, ctx.dayFirst)
  const text = q.words.join(' ')
  const terms0 = [...q.phrases, ...q.words.map((w) => w.toLowerCase()), ...q.titleWords]
  const find = q.phrases[0] ?? text
  if (!text) {
    // No plain words: every note that passes, the most recently changed first.
    return Object.values(notes)
      .filter((n) => passes(n, q, ctx))
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, limit)
      .map((note) => ({ note, snippet: excerpt(note, terms0), terms: terms0, find }))
  }
  return mini
    .search(text)
    .map((r) => ({ r, note: notes[r.id as string] }))
    .filter(({ note }) => note && passes(note, q, ctx))
    .slice(0, limit)
    .map(({ r, note }) => {
      const terms = [...new Set([...terms0, ...r.terms])]
      return { note, snippet: excerpt(note, terms), terms, find }
    })
}

/**
 * Whether a task matches the same search, for the Tasks group in ⌘K: the note's filters (notebook, kind, dates)
 * apply to its note, and words, phrases and exclusions to the task's own text.
 */
export function taskPasses(t: Task, note: Note, q: SearchQuery, ctx: SearchContext): boolean {
  const noteOnly: SearchQuery = { ...q, phrases: [], without: [], titleWords: [], tags: [], withoutTags: [], hasTasks: false }
  if (!passes(note, noteOnly, ctx)) return false
  const text = t.text.toLowerCase()
  const tags = t.tags.map((x) => x.toLowerCase())
  if (q.withoutTags.some((f) => tags.some((x) => x === f || x.startsWith(f + '/')))) return false
  return q.phrases.every((p) => text.includes(p)) && !q.without.some((w) => text.includes(w))
}
