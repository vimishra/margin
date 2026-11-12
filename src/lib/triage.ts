// The triage note: written by a program outside Margin with suggested tasks, grouped by run (newest first), then by
// category, then by kind. This reads it into a model for the Triage view. It never rewrites anything: every line is
// kept as found, so writing the lines back gives the same text, and actions later change single lines or blocks.
//
// The layout it recognises (anything else is kept and ignored):
//   ## Triage <label>          a run
//   **Summary**                then "- " bullets: the run's summary
//   ### <name>                 a category
//   **<label>**                a group: Quick…, Action…, FYI, or any other label
//   - [ ] / [x] / [-] <task>   a task at the left edge, with the indented lines under it as its details
//   - <text>                   under an FYI group: an information line, not a task
import { notePathKey, parseTaskText, setLineCancelled, setLineDone, within } from './tasks'
import type { TriageConfig, TriageRule } from '../api'
import { today } from './util'

export type TriageState = 'open' | 'done' | 'dropped'
export type GroupKind = 'quick' | 'action' | 'fyi' | 'other'

export interface TriageLink {
  label: string
  url: string
}

export interface TriageTask {
  /** Stable across rewrites of the note: the first link's address and the title, as written. */
  id: string
  state: TriageState
  /** The task's line and the lines under it, exactly as in the file. */
  rawLines: string[]
  /** Where the block starts (0-based) and ends (exclusive) in the text that was read. */
  line: number
  end: number
  title: string
  links: TriageLink[]
  tags: string[]
  /** 1 (highest) to 4; 0 when none is written. */
  priority: number
  /** Details written with Margin's own syntax. */
  planned?: string
  someday: boolean
  due?: string
  closedOn?: string
  /** The lines under the task, without their indent. */
  details: string[]
  /** The run it was carried over from, from a "_carried from …_" line. */
  carriedFrom?: string
  run: string
  category: string
  group: GroupKind
  groupLabel: string
}

export interface TriageGroup {
  kind: GroupKind
  /** The label as written ("Quick replies"); '' for tasks under no label. */
  label: string
  tasks: TriageTask[]
  /** FYI lines: text only. */
  info: string[]
}

export interface TriageCategory {
  /** '' for tasks in a run that are under no category ("Uncategorised"). */
  name: string
  line: number
  groups: TriageGroup[]
}

export interface TriageRun {
  label: string
  line: number
  summary: string[]
  categories: TriageCategory[]
}

export interface TriageDoc {
  runs: TriageRun[]
  /** The text's lines as read, for writing back unchanged. */
  lines: string[]
}

const RUN = /^## Triage\b\s*(.*?)\s*$/
const OTHER_H2 = /^##\s/
const CATEGORY = /^### +(.+?)\s*$/
const LABEL = /^\*\*(.+?)\*\*\s*$/
const TASK = /^- \[([ xX-])\] (.*)$/
const BULLET = /^- (.*)$/
const CARRIED = /^_carried from (.+?)_\s*$/
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g
const TAG = /(^|\s)#([A-Za-z][\w/-]*)/g
const PRIORITY = /(^|\s)P([1-4])(?=\s|$)/

/** The kind of a group from its label: Quick…, Action…, FYI, or other. */
export function groupKind(label: string): GroupKind {
  const l = label.trim().toLowerCase()
  if (l.startsWith('quick')) return 'quick'
  if (l.startsWith('action')) return 'action'
  if (l.startsWith('fyi')) return 'fyi'
  return 'other'
}

/** The parts of a task line: title, links, tags, priority and Margin's own details. The text is never changed. */
export function readTaskLine(text: string) {
  const links = [...text.matchAll(LINK)].map((m) => ({ label: m[1].trim(), url: m[2] }))
  const tags = [...new Set([...text.matchAll(TAG)].map((m) => m[2]))]
  const p = PRIORITY.exec(text)
  const margin = parseTaskText(text)
  // The title: the text before its links and tokens, without the " - " that separates them.
  const title = margin.text
    .replace(LINK, ' ')
    .replace(TAG, '$1')
    .replace(/(^|\s)P4(?=\s|$)/, '$1')
    .replace(/\s+/g, ' ')
    .replace(/(\s+-)+\s*$/, '')
    .trim()
  return {
    title: title || text.trim(),
    links,
    tags,
    priority: p ? Number(p[2]) : 0,
    planned: margin.scheduled,
    someday: margin.someday,
    due: margin.due,
    closedOn: margin.completed,
  }
}

/** What identifies a task when the note is rewritten: its first link and its title, ignoring case and spacing. */
export const triageId = (title: string, links: TriageLink[]) => `${links[0]?.url ?? ''}|${title.toLowerCase().replace(/\s+/g, ' ').trim()}`

/**
 * Read the triage note's text (with or without its front matter) into runs, categories, groups and tasks. Lines
 * it does not recognise are kept in `lines` and otherwise ignored; a text with no runs gives no runs.
 */
export function parseTriage(text: string): TriageDoc {
  const lines = text.split('\n')
  const runs: TriageRun[] = []
  let start = 0
  // Front matter, when the whole file is given: skipped, never read.
  if (lines[0]?.replace(/\r$/, '') === '---') {
    const close = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '').trim() === '---')
    if (close > 0) start = close + 1
  }
  let run: TriageRun | null = null
  let category: TriageCategory | null = null
  let group: TriageGroup | null = null
  let inSummary = false
  const seen = new Map<string, number>()

  const ensureCategory = (): TriageCategory => {
    if (!category) {
      category = { name: '', line: -1, groups: [] }
      run!.categories.push(category)
    }
    return category
  }
  const ensureGroup = (): TriageGroup => {
    const c = ensureCategory()
    if (!group) {
      group = { kind: 'other', label: '', tasks: [], info: [] }
      c.groups.push(group)
    }
    return group
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    const r = RUN.exec(line)
    if (r) {
      run = { label: r[1], line: i, summary: [], categories: [] }
      runs.push(run)
      category = null
      group = null
      inSummary = false
      continue
    }
    if (OTHER_H2.test(line) && !line.startsWith('###')) {
      // Some other section: not part of any run.
      run = null
      continue
    }
    if (!run) continue
    const c = CATEGORY.exec(line)
    if (c) {
      category = { name: c[1], line: i, groups: [] }
      run.categories.push(category)
      group = null
      inSummary = false
      continue
    }
    const l = LABEL.exec(line)
    if (l) {
      if (l[1].trim() === 'Summary' && !category) {
        inSummary = true
        continue
      }
      inSummary = false
      group = { kind: groupKind(l[1]), label: l[1].trim(), tasks: [], info: [] }
      ensureCategory().groups.push(group)
      continue
    }
    const t = TASK.exec(line)
    if (t) {
      inSummary = false
      let end = i + 1
      while (end < lines.length && lines[end].replace(/\r$/, '').trim() && /^\s/.test(lines[end])) end++
      const rawLines = lines.slice(i, end)
      const details = rawLines.slice(1).map((d) => d.replace(/\r$/, '').trim().replace(/^- /, ''))
      const carried = details.map((d) => CARRIED.exec(d)?.[1]).find(Boolean)
      const parts = readTaskLine(t[2])
      const g = ensureGroup()
      const base = triageId(parts.title, parts.links)
      // Two identical tasks in one note get different ids, in the order they appear.
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      g.tasks.push({
        id: n === 1 ? base : `${base}#${n}`,
        state: t[1] === ' ' ? 'open' : t[1] === '-' ? 'dropped' : 'done',
        rawLines,
        line: i,
        end,
        ...parts,
        details: details.filter((d) => !CARRIED.test(d)),
        carriedFrom: carried,
        run: run.label,
        category: category ? (category as TriageCategory).name : '',
        group: g.kind,
        groupLabel: g.label,
      })
      i = end - 1
      continue
    }
    const b = BULLET.exec(line)
    if (b) {
      if (inSummary) run.summary.push(b[1].trim())
      else if (group && (group as TriageGroup).kind === 'fyi') (group as TriageGroup).info.push(b[1].trim())
      continue
    }
    // A blank line ends the summary.
    if (!line.trim()) inSummary = false
  }
  return { runs, lines }
}

/** The text again from what was read: the lines exactly as they were. */
export const serializeTriage = (doc: TriageDoc) => doc.lines.join('\n')

/** Every task in a run, in the order they appear. */
export const runTasks = (run: TriageRun) => run.categories.flatMap((c) => c.groups.flatMap((g) => g.tasks))

/** Counts of open, done and dropped tasks. */
export function triageCounts(tasks: TriageTask[]) {
  return {
    open: tasks.filter((t) => t.state === 'open').length,
    done: tasks.filter((t) => t.state === 'done').length,
    dropped: tasks.filter((t) => t.state === 'dropped').length,
  }
}

/** Groups in the order the view shows them: quick, action, other; FYI is shown apart. */
export const GROUP_ORDER: GroupKind[] = ['quick', 'action', 'other']

// ---------- changing one task (the Triage view's actions) ----------

/** What an action does to one task line. Dates are YYYY-MM-DD; null removes the date. */
export type TriageAction =
  | { kind: 'complete' }
  | { kind: 'drop' }
  | { kind: 'reopen' }
  | { kind: 'planned'; date: string | null; someday?: boolean }
  | { kind: 'due'; date: string | null }

/**
 * Find a task again in a newer version of the note: by its identity, preferring the same run and category when
 * there are several; failing that, by its line exactly as it was. Null when it is no longer there.
 */
export function locateTask(doc: TriageDoc, task: Pick<TriageTask, 'id' | 'run' | 'category' | 'rawLines'>): TriageTask | null {
  const all = doc.runs.flatMap(runTasks)
  const base = (id: string) => id.replace(/#\d+$/, '')
  const same = all.filter((t) => base(t.id) === base(task.id))
  return (
    same.find((t) => t.id === task.id && t.run === task.run && t.category === task.category) ??
    same.find((t) => t.run === task.run && t.category === task.category) ??
    same.find((t) => t.id === task.id) ??
    (same.length === 1 ? same[0] : undefined) ??
    all.find((t) => t.rawLines[0] === task.rawLines[0]) ??
    null
  )
}

const PLANNED_TOKEN = /(^|\s)>(\d{4}-\d{2}-\d{2}|[Ss]omeday)(?=\s|$)/
const DUE_TOKEN = /(^|\s)@due\(\d{4}-\d{2}-\d{2}\)/

/** Put a token in place of the one that matches, or add it at the end of the line; '' takes it away. Nothing else moves. */
function setToken(text: string, pattern: RegExp, token: string): string {
  if (pattern.test(text)) return text.replace(pattern, token ? `$1${token}` : '').replace(/\s+$/, '')
  return token ? `${text.replace(/\s+$/, '')} ${token}` : text
}

/**
 * One task line after an action, with only what the action changes: the box and Margin's own done or cancelled
 * date for complete, drop and reopen; the planned-day or due-date token for dates. The rest of the line, and a
 * Windows line end, stay as they were. Null when the line is not a task.
 */
export function changeTaskLine(line: string, action: TriageAction, stamp = true, now = today()): string | null {
  const cr = line.endsWith('\r') ? '\r' : ''
  const plain = cr ? line.slice(0, -1) : line
  const box = /^- \[([ xX-])\] /.exec(plain)
  if (!box) return null
  let next: string | null
  if (action.kind === 'complete') next = box[1] === '-' ? setLineDone(setLineCancelled(plain, false, stamp, now) ?? plain, true, stamp, now) : setLineDone(plain, true, stamp, now)
  else if (action.kind === 'drop') next = setLineCancelled(plain, true, stamp, now)
  else if (action.kind === 'reopen') next = box[1] === '-' ? setLineCancelled(plain, false, stamp, now) : setLineDone(plain, false, stamp, now)
  else {
    const head = plain.slice(0, 6)
    const text = plain.slice(6)
    next =
      action.kind === 'planned'
        ? head + setToken(text, PLANNED_TOKEN, action.someday ? '>someday' : action.date ? `>${action.date}` : '')
        : head + setToken(text, DUE_TOKEN, action.date ? `@due(${action.date})` : '')
  }
  return next === null ? null : next + cr
}

/**
 * Apply an action to a task in the note's text, as it is now: the task is found again first (see locateTask). The
 * new text, or null when the task is no longer in the note or the line did not change.
 */
export function applyTriageAction(text: string, task: Pick<TriageTask, 'id' | 'run' | 'category' | 'rawLines'>, action: TriageAction, stamp = true, now = today()): { text: string; task: TriageTask } | null {
  const doc = parseTriage(text)
  const found = locateTask(doc, task)
  if (!found) return null
  const line = changeTaskLine(doc.lines[found.line], action, stamp, now)
  if (line === null || line === doc.lines[found.line]) return null
  const lines = [...doc.lines]
  lines[found.line] = line
  return { text: lines.join('\n'), task: found }
}

// ---------- moving a task into another note ----------

/** A task's block (its line and the lines under it) as it goes into another note: unchanged, without CR line ends. */
export const blockLines = (doc: TriageDoc, task: Pick<TriageTask, 'line' | 'end'>) => doc.lines.slice(task.line, task.end).map((l) => l.replace(/\r$/, ''))

/** The text with a task's block taken out, and nothing else changed (blank lines and headings stay). */
export function removeBlock(text: string, task: Pick<TriageTask, 'line' | 'end'>): string {
  const lines = text.split('\n')
  lines.splice(task.line, task.end - task.line)
  return lines.join('\n')
}

/** Whether a note already has an open task whose line links to this address (so the task is there already). */
export function hasOpenTaskLinking(page: string, url: string): boolean {
  if (!url) return false
  return page.split('\n').some((l) => /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s/.test(l) && l.includes(`](${url})`))
}

/**
 * A page with lines added to the section under a heading (matched ignoring capitals and #s): at its end, after its
 * last non-blank line, or at its top, just under the heading. A missing heading is made, as "## <heading>", at the
 * end of the page.
 */
export function insertUnderHeading(page: string, lines: string[], heading: string, position: 'top' | 'bottom' = 'bottom'): string {
  // The page's own ending (a final newline or not) is kept.
  const tail = /\n+$/.exec(page)?.[0] ?? ''
  const out = page.replace(/\n+$/, '').split('\n')
  if (out.length === 1 && !out[0]) out.length = 0
  const want = heading.trim().toLowerCase()
  const start = out.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, '').replace(/\s*#*\s*$/, '').toLowerCase() === want)
  if (start < 0) {
    const gap = out.length ? [''] : []
    return [...out, ...gap, `## ${heading.trim()}`, '', ...lines].join('\n') + (tail ? '\n' : '')
  }
  const level = /^#+/.exec(out[start])![0].length
  let end = out.length
  for (let i = start + 1; i < out.length; i++) {
    const h = /^(#{1,6})\s/.exec(out[i])
    if (h && h[1].length <= level) {
      end = i
      break
    }
  }
  let at: number
  if (position === 'top') {
    at = start + 1
    while (at < end && !out[at].trim()) at++
  } else {
    at = end
    while (at > start + 1 && !out[at - 1].trim()) at--
  }
  // Right under the heading: keep a blank line between them, as a heading has.
  const lead = at === start + 1 ? [''] : []
  out.splice(at, 0, ...lead, ...lines)
  return out.join('\n') + tail
}

// ---------- where a task goes: rules ----------

/** What rules need to know of a note. */
export interface NoteRef {
  id: string
  path: string
  title: string
  folder: string
}

/** The note a rule (or the default) names: by its id when it has one and that note still exists, else by its path. */
export function findNote(notes: NoteRef[], ref: { note: string; id?: string }): NoteRef | undefined {
  return (ref.id ? notes.find((n) => n.id === ref.id) : undefined) ?? notes.find((n) => notePathKey(n.path) === notePathKey(ref.note))
}

/** What a rule matches, in words: "category <name>", "tag #<tag>", "title contains “<words>”". */
export const ruleLabel = (r: TriageRule) => (r.category ? `category ${r.category}` : r.tag ? `tag #${r.tag.replace(/^#/, '')}` : `title contains “${r.title ?? ''}”`)

/** Whether a rule matches a task: the same category or tag (capitals ignored; a tag also matches tags under it), or words in the title. */
export function ruleMatches(r: TriageRule, t: Pick<TriageTask, 'category' | 'tags' | 'title'>): boolean {
  if (r.category) return t.category.trim().toLowerCase() === r.category.trim().toLowerCase()
  if (r.tag) {
    const want = r.tag.replace(/^#/, '').trim().toLowerCase()
    return t.tags.some((x) => x.toLowerCase() === want || x.toLowerCase().startsWith(want + '/'))
  }
  return !!r.title && t.title.toLowerCase().includes(r.title.trim().toLowerCase())
}

/**
 * Where a task goes, in order: the first rule that matches it and names a note that exists; a note named like its
 * category in the workstream notebook; the default note. Never the triage note itself. Null: ask.
 */
export function resolveDestination(t: Pick<TriageTask, 'category' | 'tags' | 'title'>, cfg: TriageConfig, notes: NoteRef[], triageId?: string): { note: NoteRef; reason: string } | null {
  const ok = (n: NoteRef | undefined) => (n && n.id !== triageId ? n : undefined)
  for (const r of cfg.rules ?? []) {
    if (!ruleMatches(r, t)) continue
    const n = ok(findNote(notes, r))
    if (n) return { note: n, reason: ruleLabel(r) }
  }
  if (cfg.workstreamNotebook && t.category.trim()) {
    const n = ok(notes.find((x) => within(x.folder, cfg.workstreamNotebook!) && x.title.trim().toLowerCase() === t.category.trim().toLowerCase()))
    if (n) return { note: n, reason: `the ${cfg.workstreamNotebook} notebook` }
  }
  if (cfg.default) {
    const n = ok(findNote(notes, { note: cfg.default }))
    if (n) return { note: n, reason: 'the default note' }
  }
  return null
}

/**
 * The block as it goes into the other note, with the move options: the words and tags in `strip` taken off the
 * task's line (as whole words), and, with `addLine`, a line saying where and when it came from.
 */
export function prepareBlock(block: string[], cfg: Pick<TriageConfig, 'strip' | 'addLine'>, now = today()): string[] {
  let [first, ...rest] = block
  for (const word of cfg.strip ?? []) {
    const esc = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (esc) first = first.replace(new RegExp(`(^|\\s)${esc}(?=\\s|$)`, 'g'), '$1').replace(/ {2,}/g, ' ').replace(/\s+$/, '')
  }
  return [first, ...rest, ...(cfg.addLine ? [`  - _from triage, ${now}_`] : [])]
}
