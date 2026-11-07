// Repeating tasks: a task with "@repeat(…)" on its line comes back when it is ticked. The ticked line stays as the
// record of that time (without its @repeat, so it does not repeat again), and a new open copy goes in its place
// with its dates moved on. Pure functions on lines; every tick path calls `afterTick`.
import { blockEnd, sinkTask } from './archive'
import { TASK_LINE, parseTaskText } from './tasks'
import { addDays, parseYmd, today, ymd } from './util'

export interface RepeatRule {
  unit: 'day' | 'week' | 'month' | 'year'
  every: number
  /** Days of the week it falls on, 0 Sunday to 6 Saturday; empty when it is every so many units. */
  weekdays: number[]
  /** Counted from the day it was ticked, not from its own date. */
  afterDone: boolean
}

const DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 }
const dayOf = (word: string): number | undefined => {
  const w = word.toLowerCase().replace(/s$/, '')
  return DAYS[w] ?? DAYS[w.slice(0, 3)] ?? undefined
}
const UNITS: Record<string, RepeatRule['unit']> = { day: 'day', week: 'week', month: 'month', year: 'year', d: 'day', w: 'week', m: 'month', y: 'year' }

/**
 * Read a rule: "daily", "weekly", "monthly", "yearly", "weekdays", "fortnightly", "every 2 weeks", "3 days",
 * "every other month", "every monday", "mon, thu", "tuesdays and fridays", each optionally followed by "after done"
 * (count from the day it is ticked). Null when it is not understood.
 */
export function parseRepeat(text: string): RepeatRule | null {
  let s = text.trim().toLowerCase().replace(/\s+/g, ' ')
  let afterDone = false
  s = s.replace(/[ ,]*(after|from) (done|completion|completed|ticking|it is done)$/, () => ((afterDone = true), '')).trim()
  s = s.replace(/^every /, '').trim()
  const rule = (unit: RepeatRule['unit'], every = 1, weekdays: number[] = []): RepeatRule => ({ unit, every, weekdays, afterDone })
  const simple: Record<string, RepeatRule> = {
    daily: rule('day'), day: rule('day'), weekly: rule('week'), week: rule('week'), monthly: rule('month'), month: rule('month'),
    yearly: rule('year'), year: rule('year'), annually: rule('year'), fortnightly: rule('week', 2), quarterly: rule('month', 3),
    weekday: rule('week', 1, [1, 2, 3, 4, 5]), weekdays: rule('week', 1, [1, 2, 3, 4, 5]), weekend: rule('week', 1, [0, 6]), weekends: rule('week', 1, [0, 6]),
  }
  if (simple[s]) return simple[s]
  const other = /^other (day|week|month|year)$/.exec(s)
  if (other) return rule(UNITS[other[1]], 2)
  const n = /^(\d+) ?(days?|weeks?|months?|years?|d|w|m|y)$/.exec(s)
  if (n) return Number(n[1]) > 0 ? rule(UNITS[n[2].replace(/s$/, '')], Number(n[1])) : null
  // Days of the week: "mon", "monday, thursday", "tuesdays and fridays".
  const words = s.split(/\s*(?:,|\band\b|&|\+|\/)\s*|\s+/).filter(Boolean)
  const days = words.map(dayOf)
  if (words.length && days.every((d) => d !== undefined)) return rule('week', 1, [...new Set(days as number[])].sort())
  return null
}

function addMonths(date: string, n: number, day: number): string {
  const d = parseYmd(date)
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(day, last)))
}

/** One step of the rule from a day (no weekdays). `day` is the day of the month to keep for months and years. */
function step(date: string, r: RepeatRule, day: number): string {
  if (r.unit === 'day') return addDays(date, r.every)
  if (r.unit === 'week') return addDays(date, 7 * r.every)
  return addMonths(date, r.unit === 'month' ? r.every : 12 * r.every, day)
}

/**
 * The next date of a repeating task, ticked on `done`. `anchor` is the date it had (due, planned, or reminder day).
 * On a schedule, the next date on that schedule after both its date and the day it was ticked, so a task ticked
 * late does not come back already overdue; "after done", the rule counted from the day it was ticked.
 */
export function nextOccurrence(r: RepeatRule, anchor: string | undefined, done: string): string {
  const ref = r.afterDone || !anchor || done > anchor ? done : anchor
  if (r.weekdays.length) {
    for (let d = addDays(ref, 1), i = 0; i < 8; d = addDays(d, 1), i++) if (r.weekdays.includes(parseYmd(d).getDay())) return d
  }
  if (r.afterDone || !anchor) return step(done, r, parseYmd(done).getDate())
  const day = parseYmd(anchor).getDate()
  let next = anchor
  // Months keep the anchor's day of the month (31 → 30 in November, back to 31 in December).
  for (let k = 1; next <= ref && k < 5000; k++) next = r.unit === 'month' || r.unit === 'year' ? addMonths(anchor, (r.unit === 'month' ? r.every : 12 * r.every) * k, day) : step(next, r, day)
  return next
}

const DATE_IN = (name: string) => new RegExp(`(^|\\s)${name}(\\d{4}-\\d{2}-\\d{2})`)
const daysBetween = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000)

/**
 * For a ticked task line with "@repeat(…)": the open line for its next time, and the ticked line without the
 * @repeat. Its due day, planned day and reminder move by the same number of days, so the gaps between them stay;
 * a task with no date at all is planned for the next date. Null when the line does not repeat or the rule is not
 * understood.
 */
export function repeatLine(line: string, done = today()): { next: string; ticked: string } | null {
  const m = TASK_LINE.exec(line)
  if (!m || m[2] === ' ') return null
  const task = parseTaskText(m[4])
  const rule = task.repeat && parseRepeat(task.repeat)
  if (!rule) return null
  const doneOn = task.completed ?? done
  const anchor = task.due || task.scheduled || task.remind?.slice(0, 10)
  const next = nextOccurrence(rule, anchor, doneOn)
  let raw = m[4].replace(/(^|\s)@(?:done|cancelled)\(\d{4}-\d{2}-\d{2}\)/, '$1').replace(/\s{2,}/g, ' ').trimEnd()
  if (anchor) {
    const shift = daysBetween(anchor, next)
    for (const name of ['>', '@due\\(', '@remind\\(']) raw = raw.replace(DATE_IN(name), (_x, lead: string, d: string) => `${lead}${name.replace('\\', '')}${addDays(d, shift)}`)
  } else if (!task.someday) raw = `${raw} >${next}`
  const ticked = m[4].replace(/(^|\s)@repeat\([^)\n]+\)/, '$1').replace(/\s{2,}/g, ' ').trimEnd()
  return { next: `${m[1]} ${m[3]}${raw}`, ticked: `${m[1]}${m[2]}${m[3]}${ticked}` }
}

/** A line under a repeating task, for its next time: a sub-task unticked, with no done day. */
function fresh(line: string): string {
  const m = TASK_LINE.exec(line)
  if (!m) return line
  return `${m[1]} ${m[3]}${m[4].replace(/(^|\s)@(?:done|cancelled)\(\d{4}-\d{2}-\d{2}\)/, '$1').replace(/\s{2,}/g, ' ').trimEnd()}`
}

/**
 * What follows ticking the tasks on these lines (0-based): each repeating one gets its next time in its place,
 * with the lines indented under it (sub-tasks unticked), and the ticked one just after it; then, with `sink`, the
 * ticked ones go to the end of their lists. Returns the new lines (the same array when nothing changed).
 */
export function afterTick(lines: string[], ticked: number[], opts: { sink: boolean; now?: string }): string[] {
  let out = lines
  for (const i of [...new Set(ticked)].sort((a, b) => b - a)) {
    let at = i
    const r = repeatLine(out[i] ?? '', opts.now)
    if (r) {
      const end = blockEnd(out, i)
      const under = out.slice(i + 1, end)
      out = [...out.slice(0, i), r.next, ...under.map(fresh), r.ticked, ...out.slice(i + 1)]
      at = i + 1 + under.length
    }
    if (opts.sink && TASK_LINE.exec(out[at] ?? '')?.[2] !== ' ') {
      const moved = sinkTask(out, at)
      if (moved) out = moved.lines
    }
  }
  return out
}
