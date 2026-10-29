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

/** A fold by its first line (number and text) and, when it stops before the end of its section, how many lines it covers. */
type Saved = { n: number; t: string; e?: number }[]
const KEY = 'folds'
let saved: Record<string, Saved> | null = null
const store = () => (saved ??= local.get<Record<string, Saved>>(KEY, {}))
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Remember each fold by its first line: the line number, and the text to find it by if lines have moved. */
function save(state: EditorState, key: string) {
  const all = store()
  const folds: Saved = []
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    const line = state.doc.lineAt(from)
    const whole = foldable(state, line.from, line.to)
    const end = state.doc.lineAt(to).number
    folds.push(whole && whole.to === to ? { n: line.number, t: line.text } : { n: line.number, t: line.text, e: end - line.number })
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
    const whole = line && foldable(view.state, line.from, line.to)
    // A fold of only part of a section (a heading's own text) ends where it ended before, never past the section.
    const range =
      whole && f.e !== undefined ? { from: whole.from, to: Math.min(whole.to, view.state.doc.line(Math.min(view.state.doc.lines, line.number + f.e)).to) } : whole
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

// ---------- Outline folding, as org-mode does it ----------

interface Heading {
  level: number
  line: { from: number; to: number; number: number }
}

/** The note's headings in order (not ones inside code blocks), with their levels. */
function headingsOf(state: EditorState): Heading[] {
  const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state)
  const out: Heading[] = []
  tree.iterate({
    enter(node) {
      const m = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name)
      if (m) {
        const line = state.doc.lineAt(node.from)
        out.push({ level: Number(m[1]), line: { from: line.from, to: line.to, number: line.number } })
        return false
      }
      return undefined
    },
  })
  return out
}

/** The text under a heading before the next heading of any level, as a range to fold; null when there is none. */
function ownText(state: EditorState, all: Heading[], i: number) {
  const h = all[i]
  const next = all[i + 1]
  const end = next ? next.line.from - 1 : state.doc.length
  const to = state.doc.lineAt(Math.max(h.line.to, end)).to
  if (to <= h.line.to || !state.doc.sliceString(h.line.to, to).trim()) return null
  // Keep one blank line before the next heading visible, as the section's own fold does.
  let stop = to
  while (stop > h.line.to && !state.doc.lineAt(stop).text.trim()) stop = state.doc.lineAt(stop).from - 1
  return stop > h.line.to ? { from: h.line.to, to: stop } : null
}

const sameSet = (a: { from: number; to: number }[], b: { from: number; to: number }[]) =>
  a.length === b.length && a.every((r) => b.some((x) => x.from === r.from && x.to === r.to))

const allFolds = (state: EditorState) => {
  const out: { from: number; to: number }[] = []
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    out.push({ from, to })
  })
  return out
}

/** Replace every fold with these; if the cursor would be hidden it moves to the visible line the fold starts on. */
function setFolds(view: EditorView, ranges: { from: number; to: number }[]) {
  const head = view.state.selection.main.head
  const hiding = ranges.find((r) => head > r.from && head <= r.to)
  view.dispatch({
    effects: [...allFolds(view.state).map((r) => unfoldEffect.of(r)), ...ranges.map((r) => foldEffect.of(r))],
    selection: hiding ? { anchor: hiding.from } : undefined,
    scrollIntoView: true,
  })
}

/**
 * The folds that show every heading down to `level` and hide the rest: a heading at that level folds its whole
 * section; one above it folds only its own text, so the headings under it stay in view.
 */
function foldsToLevel(state: EditorState, level: number) {
  const all = headingsOf(state)
  const out: { from: number; to: number }[] = []
  all.forEach((h, i) => {
    if (h.level > level) return
    const range = h.level === level ? foldable(state, h.line.from, h.line.to) : ownText(state, all, i)
    if (range) out.push(range)
  })
  return out
}

/** Show the headings down to `level` and fold everything below them. */
export function foldToLevel(view: EditorView, level: number): boolean {
  if (!headingsOf(view.state).length) return false
  setFolds(view, foldsToLevel(view.state, level))
  return true
}

/** The heading the cursor is on, or else the one whose section it is in. */
function headingAt(state: EditorState, pos: number) {
  const all = headingsOf(state)
  let found: Heading | undefined
  for (const h of all) if (h.line.from <= pos) found = h
  return found
}

/** Keep headings down to the level of the heading the cursor is in, and fold everything deeper. */
export function foldBelowHere(view: EditorView): boolean {
  const h = headingAt(view.state, view.state.selection.main.head)
  return h ? foldToLevel(view, h.level) : false
}

/** The heading on the cursor's line, if the line is one and nothing is selected. */
function headingOnCursorLine(state: EditorState) {
  const sel = state.selection.main
  if (!sel.empty) return null
  const line = state.doc.lineAt(sel.head)
  const all = headingsOf(state)
  const i = all.findIndex((h) => h.line.from === line.from)
  return i < 0 ? null : { all, i }
}

/**
 * Tab on a heading, as org-mode's TAB: folded → its subheadings showing, each folded → everything open → folded.
 * A section with no subheadings goes straight from folded to open. Returns false off a heading line, or on a
 * heading with nothing under it, so Tab keeps its usual job there.
 */
export function cycleSection(view: EditorView): boolean {
  const at = headingOnCursorLine(view.state)
  if (!at) return false
  const { state } = view
  const { all, i } = at
  const h = all[i]
  const whole = foldable(state, h.line.from, h.line.to)
  if (!whole) return false
  const inside = allFolds(state).filter((r) => r.from >= whole.from && r.from <= whole.to)
  const ownFold = inside.find((r) => r.from === whole.from)
  // Direct children: the headings inside the section one level down from it (the shallowest present).
  const below = all.slice(i + 1).filter((x) => x.line.from <= whole.to && x.level > h.level)
  const childLevel = Math.min(...below.map((x) => x.level))
  const children = below.filter((x) => x.level === childLevel).map((x) => foldable(state, x.line.from, x.line.to)).filter((r): r is { from: number; to: number } => !!r)
  const keepOthers = allFolds(state).filter((r) => r.from < whole.from || r.from > whole.to)
  const apply = (inSection: { from: number; to: number }[]) => setFolds(view, [...keepOthers, ...inSection])
  if (ownFold) apply(children)
  else if (children.length && sameSet(inside, children)) apply([])
  else apply([whole])
  return true
}

/**
 * ⇧Tab on a heading, as org-mode's S-TAB, for the whole note: only the top headings → every heading, no text →
 * everything open → only the top headings. Returns false off a heading line, so ⇧Tab keeps its usual job there.
 */
export function cycleNote(view: EditorView): boolean {
  if (!headingOnCursorLine(view.state)) return false
  const { state } = view
  const top = Math.min(...headingsOf(state).map((h) => h.level))
  const overview = foldsToLevel(state, top)
  const contents = foldsToLevel(state, 6)
  const now = allFolds(state)
  // With headings all at one level the first two steps are the same, so it goes straight to everything open.
  if (now.length && sameSet(now, overview)) setFolds(view, sameSet(overview, contents) ? [] : contents)
  else if (now.length && sameSet(now, contents)) setFolds(view, [])
  else setFolds(view, overview)
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
    // Open: a light chevron, shown on hover. Folded: a solid triangle in the accent colour, so it stands out.
    el.innerHTML = this.folded
      ? '<svg viewBox="0 0 16 16" width="1em" height="1em"><path d="M5.5 3.2 11.8 8l-6.3 4.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 16 16" width="1em" height="1em"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
        // Three round dots drawn rather than typed, so they stay bold in any font.
        el.innerHTML = '<svg viewBox="0 0 18 6" width="1.3em" height="0.45em"><circle cx="3" cy="3" r="2.1"/><circle cx="9" cy="3" r="2.1"/><circle cx="15" cy="3" r="2.1"/></svg>'
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
