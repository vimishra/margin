// Understands dates typed in plain words: "today", "tomorrow", "friday", "next monday", "last week",
// "in 3 days", "2 weeks ago", "6 oct", "oct 6 2026", "06/10", "06/10/2026", "2026-10-06".
import { addDays, parseYmd, today, ymd } from './util'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Index of the name `word` abbreviates (at least three letters), or -1. */
const lookup = (names: string[], word: string) => (word.length >= 3 ? names.findIndex((n) => n.startsWith(word)) : -1)

function valid(year: number, month: number, day: number): string | null {
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? ymd(d) : null
}

const fullYear = (y: string) => (y.length <= 2 ? 2000 + Number(y) : Number(y))

/**
 * The date a phrase refers to, as YYYY-MM-DD, or null if it is not a date.
 * `dayFirst` decides how 06/10 is read: 6 October when true, June 10 when false.
 */
export function parseDatePhrase(input: string, dayFirst = true): string | null {
  const text = input.trim().toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ')
  if (!text) return null
  const now = today()
  const base = parseYmd(now)

  if (text === 'today' || text === 'tod' || text === 'now') return now
  if (text === 'tomorrow' || text === 'tom' || text === 'tmr' || text === 'tmrw') return addDays(now, 1)
  if (text === 'yesterday' || text === 'yest') return addDays(now, -1)

  // Whole weeks and months
  let m = /^(next|last|this) (week|month|year)$/.exec(text)
  if (m) {
    const step = m[1] === 'next' ? 1 : m[1] === 'last' ? -1 : 0
    if (m[2] === 'week') return addDays(now, step * 7)
    const d = new Date(base)
    if (m[2] === 'month') d.setMonth(d.getMonth() + step)
    else d.setFullYear(d.getFullYear() + step)
    return ymd(d)
  }

  // "in 3 days", "3 days ago", "+3", "-2"
  m = /^(?:in )?(\d{1,3}) ?(d|day|days|w|week|weeks|m|month|months)( ago| from now)?$/.exec(text)
  if (m && (text.startsWith('in ') || m[3])) {
    const sign = m[3]?.trim() === 'ago' ? -1 : 1
    const n = Number(m[1]) * sign
    if (m[2].startsWith('d')) return addDays(now, n)
    if (m[2].startsWith('w')) return addDays(now, n * 7)
    const d = new Date(base)
    d.setMonth(d.getMonth() + n)
    return ymd(d)
  }
  m = /^([+-])(\d{1,3})$/.exec(text)
  if (m) return addDays(now, Number(m[2]) * (m[1] === '-' ? -1 : 1))

  // Weekdays. "friday" is the coming Friday, "next friday" the Friday of next week, "last friday" the most recent one.
  m = /^(?:(next|last|this|on) )?([a-z]+)$/.exec(text)
  if (m) {
    const target = lookup(WEEKDAYS, m[2])
    if (target >= 0) {
      const current = base.getDay()
      if (m[1] === 'last') return addDays(now, -(((current - target + 7) % 7) || 7))
      // Weeks run Monday to Sunday here, so "this friday" and "next friday" mean what people usually mean.
      const mondayOffset = (current + 6) % 7
      const inWeek = (target + 6) % 7
      if (m[1] === 'this') return addDays(now, inWeek - mondayOffset)
      if (m[1] === 'next') return addDays(now, 7 - mondayOffset + inWeek)
      return addDays(now, ((target - current + 7) % 7) || 7)
    }
  }

  // ISO: 2026-10-06
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))

  // 06/10, 06/10/26, 06/10/2026 (also with - or .)
  m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/.exec(text)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const year = m[3] ? fullYear(m[3]) : base.getFullYear()
    // If only one reading is a real date (say 25/12), use that one.
    return (dayFirst ? valid(year, b, a) ?? valid(year, a, b) : valid(year, a, b) ?? valid(year, b, a))
  }

  // "6 oct", "6th october 2026", "oct 6", "october 6th 2026"
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?: (\d{2}|\d{4}))?$/.exec(text) || null
  let day = 0
  let month = -1
  let year = base.getFullYear()
  if (m) {
    day = Number(m[1])
    month = lookup(MONTHS, m[2])
    if (m[3]) year = fullYear(m[3])
  } else {
    m = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(text)
    if (m) {
      month = lookup(MONTHS, m[1])
      day = Number(m[2])
      if (m[3]) year = Number(m[3])
    }
  }
  if (month >= 0 && day) return valid(year, month + 1, day)
  return null
}
