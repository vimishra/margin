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
import { parseTaskText } from './tasks'

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
