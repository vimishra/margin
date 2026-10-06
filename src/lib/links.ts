import type { Note } from '../types'

type Notes = Record<string, Note>

const WIKI = /\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g
const TAG = /(?:^|[\s(])#([A-Za-z][\w/-]*)/g

interface Parsed {
  content: string
  lower: string
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
  const next = { content: note.content, lower: note.content.toLowerCase(), links, tags }
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

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The title as a whole word or phrase, not as part of a longer word. */
const mentionRe = (title: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(title)}(?![\\p{L}\\p{N}_])`, 'giu')

/** Stretches of text where a mention must not be turned into a link: code, links, canvas markers. */
function protectedRanges(content: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of content.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]*`|\[\[[^\]\n]*\]\]|\[[^\]\n]*\]\([^)\n]*\)|<!--[\s\S]*?-->|https?:\/\/\S+/g)) out.push([m.index!, m.index! + m[0].length])
  return out
}

function plainMentions(content: string, title: string): { from: number; to: number }[] {
  const skip = protectedRanges(content)
  return [...content.matchAll(mentionRe(title))].map((m) => ({ from: m.index!, to: m.index! + m[0].length })).filter((r) => !skip.some(([a, b]) => r.from < b && r.to > a))
}

export interface Mention {
  note: Note
  /** Lines where the title appears as plain text. */
  lines: string[]
  count: number
}

/** Notes that mention the title in plain text without linking to it. */
export function unlinkedMentions(notes: Notes, target: Note): Mention[] {
  const title = target.title.trim()
  const key = title.toLowerCase()
  if (key.length < 3 || target.type === 'daily' || /^untitled/i.test(title)) return []
  const out: Mention[] = []
  for (const n of Object.values(notes)) {
    if (n.id === target.id || !parse(n).lower.includes(key)) continue
    const found = plainMentions(n.content, title)
    if (!found.length) continue
    const lines = [...new Set(found.map((r) => n.content.slice(n.content.lastIndexOf('\n', r.from - 1) + 1, (n.content.indexOf('\n', r.to) + 1 || n.content.length + 1) - 1)))]
      .slice(0, 3)
      .map((l) => l.replace(/^\s*([-*+]|\d+\.|>|#{1,6})\s+(\[[ xX]\]\s+)?/, '').trim())
    out.push({ note: n, lines, count: found.length })
  }
  return out.sort((a, b) => b.note.updated.localeCompare(a.note.updated))
}

/** The note's content with plain mentions of the title turned into links; all of them, or only the first. */
export function linkMentions(content: string, title: string, all = true): string {
  const found = plainMentions(content, title)
  let out = content
  for (const r of (all ? found : found.slice(0, 1)).reverse()) {
    const written = content.slice(r.from, r.to)
    out = out.slice(0, r.from) + (written === title ? `[[${title}]]` : `[[${title}|${written}]]`) + out.slice(r.to)
  }
  return out
}

/** Web addresses the note links to, in the order they appear. */
export function webLinks(note: Note): { href: string; label: string }[] {
  const text = note.content.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
  const seen = new Map<string, string>()
  for (const m of text.matchAll(/\[([^\]\n]+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?[^)]*\)|(https?:\/\/[^\s<>)\]]+)/g)) {
    const href = (m[2] || m[3]).replace(/[.,;:!?]+$/, '')
    if (!seen.has(href)) seen.set(href, m[1] || '')
  }
  return [...seen.entries()].map(([href, label]) => ({ href, label }))
}

/** Changes only when the set of note titles changes; used to re-render wikilinks. */
export const titlesKey = memo((notes) => Object.values(notes).map((n) => n.title).join('\n'))
