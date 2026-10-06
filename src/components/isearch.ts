// Incremental search inside a note, in the style of Emacs: matches are found and highlighted as you type.
import { type Extension, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

export interface Match {
  from: number
  to: number
}

/** All places `query` appears. Lower-case queries ignore case; one capital letter makes the search exact. */
export function findMatches(text: string, query: string): Match[] {
  if (!query) return []
  const exact = /[A-Z]/.test(query)
  const haystack = exact ? text : text.toLowerCase()
  const needle = exact ? query : query.toLowerCase()
  const out: Match[] = []
  for (let at = haystack.indexOf(needle); at >= 0 && out.length < 5000; at = haystack.indexOf(needle, at + needle.length)) {
    out.push({ from: at, to: at + needle.length })
  }
  return out
}

export const setMatches = StateEffect.define<{ matches: Match[]; current: number } | null>()

const mark = Decoration.mark({ class: 'cm-isearch' })
const currentMark = Decoration.mark({ class: 'cm-isearch cm-isearch-current' })

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setMatches)) continue
      value = e.value ? Decoration.set(e.value.matches.map((m, i) => (i === e.value!.current ? currentMark : mark).range(m.from, m.to))) : Decoration.none
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** The matches of the search in progress, for the live preview: text hidden inside a rendered link or formula still has to show them. */
export const isearchState = StateField.define<{ matches: Match[]; current: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setMatches)) value = e.value
    if (value && tr.docChanged) value = null
    return value
  },
})

export const isearchHighlight: Extension = [isearchState, field]

const MARKUP = /^(\s*)(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+|(?:>\s?)+)/

/**
 * Ctrl-A on a line that starts with markup (a list marker, checkbox, heading or quote mark):
 * go to the start of the text first, and to the very start of the line on a second press.
 */
export function smartLineStart(view: EditorView, extend: boolean): boolean {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.head)
  const m = MARKUP.exec(line.text)
  const textStart = line.from + (m ? m[0].length : /^\s*/.exec(line.text)![0].length)
  const target = sel.head === textStart ? line.from : textStart
  view.dispatch({ selection: { anchor: extend ? sel.anchor : target, head: target }, scrollIntoView: true, userEvent: 'select' })
  return true
}
