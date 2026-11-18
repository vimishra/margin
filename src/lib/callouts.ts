// Callouts, as in Obsidian and GitHub: a quote whose first line is `> [!type] Optional title`. The type sets the
// colour and the default title. Unknown types are shown as a note.

export const CALLOUT_LINE = /^\s*>\s*\[!([A-Za-z-]+)\][+-]?\s*(.*)$/

/** Each type: its default title and its colour family (used as a CSS class). */
const TYPES: Record<string, [string, string]> = {
  note: ['Note', 'blue'],
  info: ['Info', 'blue'],
  todo: ['To do', 'blue'],
  abstract: ['Summary', 'teal'],
  summary: ['Summary', 'teal'],
  tldr: ['TL;DR', 'teal'],
  tip: ['Tip', 'teal'],
  hint: ['Hint', 'teal'],
  important: ['Important', 'purple'],
  success: ['Done', 'green'],
  check: ['Done', 'green'],
  done: ['Done', 'green'],
  decision: ['Decision', 'green'],
  question: ['Question', 'yellow'],
  help: ['Question', 'yellow'],
  faq: ['Question', 'yellow'],
  warning: ['Warning', 'orange'],
  caution: ['Caution', 'orange'],
  attention: ['Attention', 'orange'],
  failure: ['Failed', 'red'],
  fail: ['Failed', 'red'],
  missing: ['Missing', 'red'],
  danger: ['Danger', 'red'],
  error: ['Error', 'red'],
  bug: ['Bug', 'red'],
  example: ['Example', 'purple'],
  quote: ['Quote', 'grey'],
  cite: ['Quote', 'grey'],
}

/** The title a callout shows (its own, else its type's) and its colour family. */
export function callout(type: string, title: string): { title: string; color: string; type: string } {
  const t = type.toLowerCase()
  const [name, color] = TYPES[t] ?? [t.charAt(0).toUpperCase() + t.slice(1), 'blue']
  return { title: title.trim() || name, color, type: t }
}

/** The types offered when typing "> [!". */
export const CALLOUT_TYPES = ['note', 'info', 'tip', 'important', 'decision', 'question', 'warning', 'danger', 'success', 'example', 'quote', 'todo', 'abstract', 'bug']
