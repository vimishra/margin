// Todoist tasks as Margin task lines: the text side of bringing tasks in from Todoist (src/todoist.ts does the rest).
import type { TodoistTask } from '../api'
import { ymd } from './util'

/** A Todoist label as a Margin tag: letters, digits, "_", "/" and "-"; it must start with a letter. */
const asTag = (label: string) => {
  const tag = label.trim().replace(/[^\w/-]+/g, '-').replace(/^[^A-Za-z]+/, '')
  return tag ? '#' + tag : ''
}

/** "2026-11-10T14:30:00" (a time of day wherever you are) or "…Z" (a fixed moment), as Margin's "YYYY-MM-DD HH:MM". */
export function remindAt(datetime: string): string {
  if (/Z$|[+-]\d\d:?\d\d$/.test(datetime)) {
    const d = new Date(datetime)
    if (!Number.isNaN(d.getTime())) return `${ymd(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${datetime.slice(0, 10)} ${datetime.slice(11, 16)}`
}

/**
 * One Todoist task as a Margin task line and the notes under it: its date becomes the planned day, a time on it a
 * reminder, its deadline the due date, p1–p3 the same priorities, its labels tags (not the import label), and its
 * description the lines under it.
 */
export function taskLines(t: TodoistTask, importLabel: string, indent = ''): string[] {
  const text = t.content.replace(/\s*\n\s*/g, ' ').trim() || 'Untitled task'
  const priority = t.priority >= 2 && t.priority <= 4 ? `P${5 - t.priority}` : ''
  const date = t.due?.date?.slice(0, 10)
  const planned = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `>${date}` : ''
  const remind = t.due?.datetime ? `@remind(${remindAt(t.due.datetime)})` : ''
  const due = t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? `@due(${t.deadline})` : ''
  const tags = t.labels.filter((l) => l.toLowerCase() !== importLabel.toLowerCase()).map(asTag).filter((x) => x && !text.includes(x))
  const line = `${indent}- [ ] ${[text, ...tags, priority, planned, due, remind].filter(Boolean).join(' ')}`
  const notes = t.description
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .map((l) => `${indent}  ${l}`)
  return [line, ...notes]
}

/** The tasks as lines, each sub-task indented under its parent, in Todoist's order. */
export function todoistLines(tasks: TodoistTask[], importLabel: string): string {
  const ids = new Set(tasks.map((t) => t.id))
  const children = new Map<string, TodoistTask[]>()
  for (const t of tasks) {
    const parent = t.parentId && ids.has(t.parentId) ? t.parentId : ''
    children.set(parent, [...(children.get(parent) ?? []), t])
  }
  const out: string[] = []
  const walk = (parent: string, indent: string) => {
    for (const t of (children.get(parent) ?? []).sort((a, b) => a.order - b.order || a.added.localeCompare(b.added))) {
      out.push(...taskLines(t, importLabel, indent))
      walk(t.id, indent + '  ')
    }
  }
  walk('', '')
  return out.join('\n')
}
