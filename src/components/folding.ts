// Folding: a section (a heading down to the next heading of the same or a higher level) or a list item with
// lines indented under it can be collapsed to its first line. Folds are kept by the app, per note, and never
// written into the note, so the file and everything that reads it (task lists, margin-tasks) see the whole text.
import { Annotation, type EditorState, type Extension, RangeSetBuilder, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { codeFolding, ensureSyntaxTree, syntaxTree, foldAll, foldEffect, foldNodeProp, foldState, foldable, foldedRanges, unfoldAll, unfoldEffect } from '@codemirror/language'
import type { MarkdownConfig } from '@lezer/markdown'
import { local } from '../lib/util'

/**
 * Only headings and list items fold. The Markdown support would also fold paragraphs, quotes, code blocks and
 * tables; this turns those off. (Headings fold through the Markdown support's own fold service.)
 */
export const foldOnlySectionsAndLists: MarkdownConfig = {
  props: [foldNodeProp.add((type) => (type.is('Block') && type.name !== 'ListItem' && type.name !== 'Document' ? () => null : undefined))],
}

/** Marks a change made from outside the editor (the note changed on disk, a task ticked in the Tasks view). */
export const externalChange = Annotation.define<boolean>()

type Saved = { n: number; t: string }[]
const KEY = 'folds'
let saved: Record<string, Saved> | null = null
const store = () => (saved ??= local.get<Record<string, Saved>>(KEY, {}))
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Remember each fold by its first line: the line number, and the text to find it by if lines have moved. */
function save(state: EditorState, key: string) {
  const all = store()
  const folds: Saved = []
  foldedRanges(state).between(0, state.doc.length, (from) => {
    const line = state.doc.lineAt(from)
    folds.push({ n: line.number, t: line.text })
  })
  if (folds.length) all[key] = folds
  else delete all[key]
  local.set(KEY, all)
}

function saveSoon(state: EditorState, key: string) {
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => save(state, key), 300))
}

/** The line a saved fold starts on: the same line if its text is unchanged, else the nearest line with that text. */
function findLine(state: EditorState, f: { n: number; t: string }) {
  const { doc } = state
  if (f.n <= doc.lines && doc.line(f.n).text === f.t) return doc.line(f.n)
  for (let d = 1; d < doc.lines; d++) {
    for (const n of [f.n - d, f.n + d]) if (n >= 1 && n <= doc.lines && doc.line(n).text === f.t) return doc.line(n)
    if (f.n - d < 1 && f.n + d > doc.lines) break
  }
  return null
}

/** Fold again what was folded in this note last time. A fold that would hide the cursor stays open. */
export function restoreFolds(view: EditorView, key: string) {
  const folds = store()[key]
  if (!folds?.length) return
  ensureSyntaxTree(view.state, view.state.doc.length, 300)
  const head = view.state.selection.main.head
  const effects = []
  for (const f of folds) {
    const line = findLine(view.state, f)
    const range = line && foldable(view.state, line.from, line.to)
    if (range && !(head > range.from && head < range.to)) effects.push(foldEffect.of(range))
  }
  if (effects.length) view.dispatch({ effects, annotations: externalChange.of(true) })
}

/** The fold that starts on a line, if it is folded. */
function foldOn(state: EditorState, from: number, to: number) {
  let found: { from: number; to: number } | null = null
  foldedRanges(state).between(from, to, (a, b) => {
    if (!found && a >= from && a <= to) found = { from: a, to: b }
  })
  return found as { from: number; to: number } | null
}

/** The closest section or list item that contains a line (starting above it), if there is one. */
function container(state: EditorState, lineFrom: number) {
  for (let pos = lineFrom; pos > 0; ) {
    const line = state.doc.lineAt(pos - 1)
    const range = foldable(state, line.from, line.to)
    if (range && range.to >= lineFrom) return range
    pos = line.from
  }
  return null
}

/** Fold a range; if the cursor was inside it, it moves to the end of the first line, which stays visible. */
function fold(view: EditorView, range: { from: number; to: number }) {
  const head = view.state.selection.main.head
  const inside = head > range.from && head <= range.to
  view.dispatch({ effects: foldEffect.of(range), selection: inside ? { anchor: range.from } : undefined, scrollIntoView: inside })
}

/**
 * What the commands do, at the cursor:
 * - toggle: unfold the fold on this line; otherwise fold this line's section or item, or else the one it is in.
 * - fold: the same, except that on a line already folded it folds the section or item around it, so pressing it
 *   again and again collapses outwards.
 * - unfold: open the fold on this line, or the one the cursor sits at the end of.
 */
export function foldCommand(view: EditorView, kind: 'toggle' | 'fold' | 'unfold' | 'foldAll' | 'unfoldAll'): boolean {
  if (kind === 'foldAll') return foldAll(view)
  if (kind === 'unfoldAll') return unfoldAll(view)
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const open = foldOn(state, line.from, line.to)
  if (kind === 'unfold' || (kind === 'toggle' && open)) {
    if (!open) return false
    view.dispatch({ effects: unfoldEffect.of(open) })
    return true
  }
  const own = open ? null : foldable(state, line.from, line.to)
  const range = own || container(state, line.from)
  if (!range) return false
  fold(view, range)
  return true
}

class ToggleWidget extends WidgetType {
  constructor(readonly folded: boolean) {
    super()
  }
  eq(other: ToggleWidget) {
    return other.folded === this.folded
  }
  toDOM(view: EditorView) {
    const el = document.createElement('span')
    el.className = this.folded ? 'cm-fold-toggle folded' : 'cm-fold-toggle'
    el.title = this.folded ? 'Unfold' : 'Fold'
    el.setAttribute('aria-hidden', 'true')
    el.innerHTML = '<svg viewBox="0 0 16 16" width="1em" height="1em"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const line = view.state.doc.lineAt(view.posAtDOM(el))
      const open = foldOn(view.state, line.from, line.to)
      if (open) view.dispatch({ effects: unfoldEffect.of(open) })
      else {
        const range = foldable(view.state, line.from, line.to)
        if (range) fold(view, range)
      }
    })
    return el
  }
  ignoreEvent() {
    return true
  }
}

const canFold = Decoration.widget({ widget: new ToggleWidget(false), side: -1 })
const isFolded = Decoration.widget({ widget: new ToggleWidget(true), side: -1 })

/** The arrow beside each line that can fold: shown on hover, and always on a folded line. */
const toggles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.startState.field(foldState, false) !== u.state.field(foldState, false) || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = this.build(u.view)
    }
    build(view: EditorView) {
      const { state } = view
      const marks: Range<Decoration>[] = []
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to; ) {
          const line = state.doc.lineAt(pos)
          const folded = foldOn(state, line.from, line.to)
          if (folded || foldable(state, line.from, line.to)) {
            // Beside the text, after any indent, so a nested item's arrow sits by its own bullet.
            const at = line.from + (/^\s*/.exec(line.text)?.[0].length ?? 0)
            marks.push((folded ? isFolded : canFold).range(at))
          }
          pos = (folded ? state.doc.lineAt(folded.to) : line).to + 1
        }
      }
      const b = new RangeSetBuilder<Decoration>()
      for (const m of marks) b.add(m.from, m.to, m.value)
      return b.finish()
    }
  },
  { decorations: (p) => p.decorations },
)

/** Everything folding needs in an editor. `key` names the note, to remember its folds by; none means not remembered. */
export function folding(key?: string): Extension {
  return [
    codeFolding({
      placeholderDOM(_view, onclick) {
        const el = document.createElement('span')
        el.className = 'cm-fold-more'
        el.textContent = '…'
        el.title = 'Folded: click to show'
        el.onclick = onclick
        return el
      },
    }),
    toggles,
    key
      ? EditorView.updateListener.of((u) => {
          if (u.transactions.some((tr) => tr.annotation(externalChange))) return
          if (u.startState.field(foldState, false) !== u.state.field(foldState, false)) saveSoon(u.state, key)
        })
      : [],
  ]
}
