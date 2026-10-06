// Live preview for the editor: markdown is rendered in place, and the raw syntax
// is only shown for the line (or the formula, link, table) the cursor is in.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { type EditorState, type Extension, type Range, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import katex from 'katex'
import { fileUrl } from '../lib/markdown'
import { TableWidget, parseTable, tableActions } from './tableWidget'
import { isearchState, setMatches } from './isearch'
import { resolver } from '../lib/links'
import { ui, useStore } from '../store'

const setFocus = StateEffect.define<boolean>()
const focusField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocus)) value = e.value
    return value
  },
})

/** The table currently shown as markdown source (after "Edit markdown"), tracked through edits. */
const setRawTable = StateEffect.define<{ from: number; to: number } | null>()
const rawTable = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    if (value && tr.docChanged) value = { from: tr.changes.mapPos(value.from, -1), to: tr.changes.mapPos(value.to, 1) }
    for (const e of tr.effects) if (e.is(setRawTable)) value = e.value
    // Moving the cursor out of the table turns it back into a table.
    if (value && (tr.selection || tr.docChanged)) {
      const head = tr.state.selection.main.head
      if (head < value.from || head > value.to) value = null
    }
    return value
  },
})

tableActions.editRaw = (view, from, to) => {
  view.dispatch({ effects: setRawTable.of({ from, to }), selection: { anchor: from } })
  view.focus()
}

class TableDoneWidget extends WidgetType {
  toDOM(view: EditorView) {
    const button = document.createElement('button')
    button.className = 'cm-table-done'
    button.textContent = 'Done'
    button.title = 'Show as a table again'
    button.addEventListener('mousedown', (e) => {
      e.preventDefault()
      view.dispatch({ effects: setRawTable.of(null) })
    })
    return button
  }
  ignoreEvent() {
    return true
  }
}

const mathCache = new Map<string, string>()
function mathHtml(tex: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + tex
  let html = mathCache.get(key)
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, { displayMode: display, throwOnError: false })
    } catch {
      html = ''
    }
    if (mathCache.size > 2000) mathCache.clear()
    mathCache.set(key, html)
  }
  return html
}

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly display: boolean, readonly block: boolean) {
    super()
  }
  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display && other.block === this.block
  }
  toDOM() {
    const el = document.createElement(this.block ? 'div' : 'span')
    el.className = this.display ? 'cm-math-block' : 'cm-math-inline'
    el.innerHTML = mathHtml(this.tex, this.display)
    return el
  }
  ignoreEvent() {
    return false
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super()
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM(view: EditorView) {
    const url = fileUrl(this.src)
    const wrap = document.createElement('span')
    const isPdf = /\.pdf($|[?#])/i.test(this.src)
    wrap.className = isPdf ? 'cm-embed cm-pdf' : 'cm-embed'

    if (isPdf) {
      const frame = document.createElement('iframe')
      frame.src = url
      frame.title = this.alt || 'PDF'
      wrap.append(frame)
    } else {
      const img = document.createElement('img')
      img.className = 'cm-image'
      img.src = url
      const width = /\|(\d+)$/.exec(this.alt)
      if (width) img.width = Number(width[1])
      img.alt = this.alt.replace(/\|\d+$/, '')
      img.title = 'Click to enlarge'
      img.addEventListener('click', () => ui({ lightbox: { src: url, alt: img.alt } }))
      wrap.append(img)
    }

    // Shows the markdown for this image, where its path and size can be changed.
    const edit = document.createElement('button')
    edit.className = 'cm-embed-edit'
    edit.textContent = 'Edit'
    edit.title = 'Edit the markdown for this ' + (isPdf ? 'PDF' : 'image')
    edit.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) + 2 }, scrollIntoView: true })
      view.focus()
    })
    wrap.append(edit)
    return wrap
  }
  ignoreEvent() {
    return true
  }
}

class RuleWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-rule'
    return el
  }
  ignoreEvent() {
    return false
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-bullet'
    el.textContent = '•'
    return el
  }
  ignoreEvent() {
    return false
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-checkbox'
    box.checked = this.checked
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(box)
      const text = view.state.sliceDoc(pos, pos + 3)
      if (/^\[[ xX]\]$/.test(text)) view.dispatch({ changes: { from: pos, to: pos + 3, insert: text === '[ ]' ? '[x]' : '[ ]' } })
    })
    return box
  }
  ignoreEvent() {
    return true
  }
}

class WikiWidget extends WidgetType {
  constructor(readonly target: string, readonly label: string, readonly exists: boolean, readonly follow: (t: string, side?: boolean) => void, readonly found = false) {
    super()
  }
  eq(other: WikiWidget) {
    return other.target === this.target && other.label === this.label && other.exists === this.exists && other.found === this.found
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-wikilink-pill' + (this.exists ? '' : ' missing') + (this.found ? ' cm-isearch' : '')
    el.textContent = this.label
    el.dataset.target = this.target
    el.title = this.exists ? `Open “${this.target}”  (⌘-click to open beside this note)` : `Create “${this.target}”`
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      this.follow(this.target, e.metaKey || e.altKey)
    })
    return el
  }
  ignoreEvent() {
    return true
  }
}

const hide = Decoration.replace({})

function build(state: EditorState, follow: (t: string, side?: boolean) => void): DecorationSet {
  const doc = state.doc
  const focused = state.field(focusField)
  const sel = state.selection.ranges
  const text = doc.toString()
  const out: Range<Decoration>[] = []
  /** The cursor or selection touches [from, to]. */
  // During a search, the match being visited counts as "the cursor is here", so text that is normally
  // hidden (inside a link pill, a formula, a link's address) is shown with the match highlighted.
  const searching = state.field(isearchState, false) ?? null
  const visiting = searching ? searching.matches[searching.current] : undefined
  const found = (from: number, to: number) => !!searching && searching.matches.some((m) => m.from < to && m.to > from)
  const touches = (from: number, to: number) => (focused && sel.some((r) => r.from <= to && r.to >= from)) || (!!visiting && visiting.from <= to && visiting.to >= from)
  /** The cursor or selection is on one of the lines spanned by [from, to]. */
  const onLines = (from: number, to: number) => touches(doc.lineAt(from).from, doc.lineAt(to).to)

  const tree = ensureSyntaxTree(state, doc.length, 40) ?? syntaxTree(state)

  // Ranges whose inner syntax must be left alone: code, and things rendered as a single widget.
  const code: [number, number][] = []
  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode' || node.name === 'HTMLBlock' || node.name === 'CommentBlock' || node.name === 'Comment') {
        code.push([node.from, node.to])
        return false
      }
    },
  })
  const inside = (list: [number, number][], from: number, to: number) => list.some(([a, b]) => from >= a && to <= b)
  const overlaps = (list: [number, number][], from: number, to: number) => list.some(([a, b]) => from < b && to > a)
  const atoms: [number, number][] = []

  // Display math: $$ ... $$
  for (const m of text.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
    const from = m.index!
    const to = from + m[0].length
    if (overlaps(code, from, to) || !m[1].trim()) continue
    atoms.push([from, to])
    const first = doc.lineAt(from)
    const last = doc.lineAt(to)
    const wholeLines = first.from === from && last.to === to
    if (first.number !== last.number && !wholeLines) continue
    if (onLines(from, to)) continue
    out.push(Decoration.replace({ widget: new MathWidget(m[1].trim(), true, wholeLines), block: wholeLines }).range(from, to))
  }
  // Inline math: $ ... $
  for (const m of text.matchAll(/(?<![\\$\w])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?![\d$])/g)) {
    const from = m.index!
    const to = from + m[0].length
    if (overlaps(code, from, to) || overlaps(atoms, from, to)) continue
    atoms.push([from, to])
    if (!touches(from, to)) out.push(Decoration.replace({ widget: new MathWidget(m[1], false, false) }).range(from, to))
  }
  // Wikilinks: [[Target|label]]
  const resolve = resolver(useStore.getState().notes)
  for (const m of text.matchAll(/\[\[([^\]\n|#]+)(#[^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g)) {
    const from = m.index!
    const to = from + m[0].length
    if (overlaps(code, from, to) || overlaps(atoms, from, to)) continue
    atoms.push([from, to])
    if (touches(from, to)) continue
    const target = m[1].trim()
    out.push(Decoration.replace({ widget: new WikiWidget(target, (m[3] || target + (m[2] || '')).trim(), !!resolve(target), follow, found(from, to)) }).range(from, to))
  }

  /** Hide a syntax mark together with the single space that follows it. */
  const hideMark = (from: number, to: number) => {
    const end = text[to] === ' ' ? to + 1 : to
    out.push(hide.range(from, end))
  }

  tree.iterate({
    enter(node) {
      const { name, from, to } = node
      if (inside(atoms, from, to)) return false

      if (name === 'FencedCode') {
        const first = doc.lineAt(from)
        const last = doc.lineAt(to)
        const active = onLines(from, to)
        for (let n = first.number; n <= last.number; n++) {
          const line = doc.line(n)
          const fence = (n === first.number || n === last.number) && /^\s*(```|~~~)/.test(line.text)
          out.push(Decoration.line({ class: `cm-code-line${n === first.number ? ' cm-code-first' : ''}${n === last.number ? ' cm-code-last' : ''}${fence ? ' cm-code-fence' : ''}` }).range(line.from))
          if (fence && !active && line.length) out.push(hide.range(line.from, line.to))
        }
        return false
      }
      if (name === 'InlineCode') {
        out.push(Decoration.mark({ class: 'cm-inline-code' }).range(from, to))
        if (!onLines(from, to)) {
          const open = node.node.firstChild
          const close = node.node.lastChild
          if (open && close && open.name === 'CodeMark' && close.name === 'CodeMark' && open.to <= close.from) {
            out.push(hide.range(open.from, open.to), hide.range(close.from, close.to))
          }
        }
        return false
      }
      if (name === 'Table') {
        const source = text.slice(from, to)
        const model = parseTable(source)
        const raw = state.field(rawTable)
        const editingSource = !!raw && raw.from <= to && raw.to >= from
        if (model && !editingSource) {
          out.push(Decoration.replace({ widget: new TableWidget(source, model), block: true }).range(doc.lineAt(from).from, doc.lineAt(to).to))
        } else {
          for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) out.push(Decoration.line({ class: 'cm-table-source' }).range(doc.line(n).from))
          if (editingSource) out.push(Decoration.widget({ widget: new TableDoneWidget(), side: 1 }).range(doc.lineAt(from).to))
        }
        return false
      }
      if (name === 'Image') {
        if (!onLines(from, to)) {
          const m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)$/.exec(text.slice(from, to))
          if (m) out.push(Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }).range(from, to))
        }
        return false
      }
      if (name === 'HorizontalRule') {
        if (!onLines(from, to)) out.push(Decoration.replace({ widget: new RuleWidget() }).range(from, to))
        return false
      }
      if (/^ATXHeading[1-6]$/.test(name)) {
        out.push(Decoration.line({ class: `cm-heading cm-heading-${name.slice(-1)}` }).range(doc.lineAt(from).from))
        return
      }
      if (name === 'Blockquote') {
        for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) out.push(Decoration.line({ class: 'cm-quote-line' }).range(doc.line(n).from))
        return
      }
      if (name === 'HeaderMark' || name === 'QuoteMark') {
        if (!onLines(from, to)) hideMark(from, to)
        return
      }
      if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
        if (!onLines(from, to)) out.push(hide.range(from, to))
        return
      }
      if (name === 'ListMark') {
        // Nested items are indented by a fixed width per level (set in Settings), whatever spaces the file uses.
        const lineStart = doc.lineAt(from).from
        if (from > lineStart && !/\S/.test(text.slice(lineStart, from))) {
          let depth = -1
          for (let n = node.node.parent; n; n = n.parent) if (n.name === 'BulletList' || n.name === 'OrderedList') depth++
          if (depth > 0) out.push(Decoration.mark({ class: 'cm-list-indent', attributes: { style: `width: calc(${depth} * var(--list-indent))` } }).range(lineStart, from))
        }
        const task = /^ \[[ xX]\] /.exec(text.slice(to, to + 5))
        const ordered = node.node.parent?.parent?.name === 'OrderedList'
        if (task) {
          if (!onLines(from, to)) {
            out.push(hide.range(from, to + 1))
            out.push(Decoration.replace({ widget: new CheckboxWidget(text[to + 2] !== ' ') }).range(to + 1, to + 4))
            if (text[to + 2] !== ' ') out.push(Decoration.line({ class: 'cm-task-done' }).range(doc.lineAt(from).from))
          }
        } else if (ordered) {
          out.push(Decoration.mark({ class: 'cm-list-number' }).range(from, to))
        } else if (!touches(from, to)) {
          out.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to))
        }
        return
      }
      // A bare web address typed into the text: show and treat it as a link.
      if (name === 'URL') {
        const parent = node.node.parent?.name
        if (parent !== 'Link' && parent !== 'Image' && /^(https?:\/\/|www\.|mailto:)/i.test(text.slice(from, to))) {
          out.push(Decoration.mark({ class: 'cm-link-text', attributes: { 'data-href': text.slice(from, to) } }).range(from, to))
        }
        return
      }
      if (name === 'Link') {
        const marks = node.node.getChildren('LinkMark')
        const url = node.node.getChild('URL')
        // Only inline links: [text](url)
        if (marks.length >= 4 && url && text[marks[1].to] === '(') {
          const href = text.slice(url.from, url.to)
          out.push(Decoration.mark({ class: 'cm-link-text', attributes: { title: href, 'data-href': href } }).range(marks[0].to, marks[1].from))
          if (!onLines(from, to)) out.push(hide.range(marks[0].from, marks[0].to), hide.range(marks[1].from, to))
        }
        return
      }
    },
  })

  try {
    return Decoration.set(out, true)
  } catch {
    return Decoration.none
  }
}

export function livePreview(follow: (target: string, side?: boolean) => void): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => build(state, follow),
    update(deco, tr) {
      const changed =
        tr.docChanged || tr.selection !== undefined || tr.effects.some((e) => e.is(setFocus) || e.is(setRawTable) || e.is(setMatches)) || tr.startState.field(rawTable) !== tr.state.field(rawTable) || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      return changed ? build(tr.state, follow) : deco
    },
    provide: (f) => EditorView.decorations.from(f),
  })
  return [focusField, rawTable, field, EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing))]
}
