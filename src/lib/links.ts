import type { Note } from '../types'

type Notes = Record<string, Note>

const WIKI = /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g
const TAG = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g

interface Parsed {
  content: string
  links: string[]
  tags: string[]
}
const parsed = new Map<string, Parsed>()

function parse(note: Note): Parsed {
  const hit = parsed.get(note.id)
  if (hit && hit.content === note.content) return hit
  // Ignore code so that "#include" or "[[" in a snippet are not treated as tags and links.
  const text = note.content.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')
  const links = [...new Set([...text.matchAll(WIKI)].map((m) => m[1].trim().toLowerCase()))]
  const tags = [...new Set([...text.replace(/^#{1,6}\s.*$/gm, ' ').matchAll(TAG)].map((m) => m[1]))]
  const next = { content: note.content, links, tags }
  parsed.set(note.id, next)
  return next
}

export const outgoing = (note: Note) => parse(note).links

/** Frontmatter tags plus inline #hashtags. */
export function tagsOf(note: Note): string[] {
  const inline = parse(note).tags
  if (!inline.length) return note.tags
  return [...new Set([...note.tags, ...inline])]
}

function memo<T>(fn: (notes: Notes) => T): (notes: Notes) => T {
  let lastNotes: Notes | null = null
  let last: T
  return (notes) => {
    if (notes !== lastNotes) {
      last = fn(notes)
      lastNotes = notes
    }
    return last
  }
}

/** Lower-cased title -> note id. */
export const titleIndex = memo((notes) => {
  const map = new Map<string, string>()
  for (const n of Object.values(notes)) if (!map.has(n.title.toLowerCase())) map.set(n.title.toLowerCase(), n.id)
  return map
})

export const tagCounts = memo((notes) => {
  const counts = new Map<string, number>()
  for (const n of Object.values(notes)) for (const t of tagsOf(n)) counts.set(t, (counts.get(t) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
})

export function resolver(notes: Notes) {
  const index = titleIndex(notes)
  return (title: string) => index.get(title.trim().toLowerCase())
}

export interface Backlink {
  note: Note
  lines: string[]
}

export function backlinks(notes: Notes, target: Note): Backlink[] {
  const key = target.title.toLowerCase()
  const out: Backlink[] = []
  for (const n of Object.values(notes)) {
    if (n.id === target.id || !outgoing(n).includes(key)) continue
    const needle = '[[' + key
    const lines = n.content
      .split('\n')
      .filter((l) => l.toLowerCase().includes(needle) && !l.startsWith('<!--'))
      .slice(0, 3)
      .map((l) => l.replace(/^\s*([-*+]|\d+\.|>|#{1,6})\s+(\[[ xX]\]\s+)?/, '').trim())
    out.push({ note: n, lines })
  }
  return out.sort((a, b) => b.note.updated.localeCompare(a.note.updated))
}

/** Notes that mention the title in plain text without linking to it. */
export function unlinkedMentions(notes: Notes, target: Note): Note[] {
  const key = target.title.toLowerCase()
  if (key.length < 4 || target.type === 'daily') return []
  return Object.values(notes).filter(
    (n) => n.id !== target.id && !outgoing(n).includes(key) && n.content.toLowerCase().includes(key),
  )
}

/** Changes only when the set of note titles changes; used to re-render wikilinks. */
export const titlesKey = memo((notes) => Object.values(notes).map((n) => n.title).join('\n'))
