import MiniSearch from 'minisearch'
import type { Note } from '../types'
import { tagsOf } from './links'
import { displayTitle } from './util'

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

export interface Hit {
  note: Note
  snippet: string
  terms: string[]
}

function excerpt(note: Note, terms: string[]): string {
  const body = note.content
    .replace(/<!--[\s\S]*?-->/g, ' ')
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

export function search(notes: Record<string, Note>, query: string, limit = 40): Hit[] {
  sync(notes)
  const q = query.trim()
  if (!q) return []
  // "#tag" narrows to notes carrying that tag.
  const tagFilters = [...q.matchAll(/(?:^|\s)#([\w/-]+)/g)].map((m) => m[1].toLowerCase())
  const text = q.replace(/(?:^|\s)#[\w/-]+/g, ' ').trim()
  const matchesTags = (n: Note) => {
    const tags = tagsOf(n).map((t) => t.toLowerCase())
    return tagFilters.every((f) => tags.some((t) => t.startsWith(f)))
  }
  if (!text) {
    return Object.values(notes)
      .filter(matchesTags)
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, limit)
      .map((note) => ({ note, snippet: excerpt(note, []), terms: [] }))
  }
  const queryTerms = text.toLowerCase().split(/\s+/)
  return mini
    .search(text)
    .map((r) => ({ r, note: notes[r.id as string] }))
    .filter(({ note }) => note && matchesTags(note))
    .slice(0, limit)
    .map(({ r, note }) => {
      const terms = [...new Set([...queryTerms, ...r.terms])]
      return { note, snippet: excerpt(note, terms), terms }
    })
}
