import type { Note } from '../types'

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl+'
export const ALT = isMac ? '⌥' : 'Alt+'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
export const uid = () => Math.random().toString(36).slice(2, 8)

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number): string {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export const clock = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export function longDate(s: string): string {
  return parseYmd(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function dailyLabel(s: string): string {
  const t = today()
  if (s === t) return 'Today'
  if (s === addDays(t, -1)) return 'Yesterday'
  if (s === addDays(t, 1)) return 'Tomorrow'
  return parseYmd(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Daily notes are stored as 2026-10-06.md but shown as a readable date. */
export function displayTitle(n: Note): string {
  if (n.type === 'daily' && isYmd(n.title)) return longDate(n.title)
  return n.title
}

export function relTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24 && ymd(d) === today()) return `${hr}h ago`
  if (ymd(d) === addDays(today(), -1)) return 'yesterday'
  const days = Math.round(diff / 86400000)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export function expiresIn(iso?: string): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expiring now'
  const hours = ms / 3600000
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))} min left`
  if (hours < 36) return `${Math.round(hours)}h left`
  return `${Math.round(hours / 24)} days left`
}

/** Plain-text preview of markdown content. */
export function snippet(content: string, length = 160): string {
  return content
    .slice(0, length * 4)
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/```[a-z]*\n?/g, ' ')
    .replace(/\$\$?/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length)
}

export function wordCount(content: string): number {
  const text = content.replace(/<!--[\s\S]*?-->/g, ' ').trim()
  return text ? text.split(/\s+/).length : 0
}

export function download(filename: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem('margin.' + key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem('margin.' + key, JSON.stringify(value))
    } catch {
      /* storage unavailable */
    }
  },
}

/** First day of the week for the user's region: 0 is Sunday, 1 is Monday. */
export function firstWeekday(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } }
    const info = loc.getWeekInfo?.() ?? loc.weekInfo
    if (info) return info.firstDay % 7
  } catch {
    /* fall through */
  }
  return 0
}
