// An editable table for the live-preview editor. Cells are edited in place and every
// change is written back to the note as a normal markdown table.
import { type EditorView, WidgetType } from '@codemirror/view'
import { renderInline } from '../lib/markdown'
import { resolver } from '../lib/links'
import { type MenuItem, toast, ui, useStore } from '../store'

type Align = '' | 'left' | 'center' | 'right'

export interface TableModel {
  head: string[]
  align: Align[]
  rows: string[][]
}

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '\\|'
      i++
    } else if (s[i] === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += s[i]
  }
  cells.push(cur.trim())
  return cells
}

export function parseTable(source: string): TableModel | null {
  const lines = source.split('\n').filter((l) => l.trim())
  if (lines.length < 2) return null
  const head = splitRow(lines[0])
  const delim = splitRow(lines[1])
  if (!head.length || !delim.every((d) => /^:?-+:?$/.test(d))) return null
  const align = head.map((_, i): Align => {
    const d = delim[i] || '---'
    const l = d.startsWith(':')
    const r = d.endsWith(':')
    return l && r ? 'center' : r ? 'right' : l ? 'left' : ''
  })
  const rows = lines.slice(2).map((l) => {
    const cells = splitRow(l)
    return head.map((_, i) => cells[i] ?? '')
  })
  return { head, align, rows }
}

/** How many columns a piece of text takes in a fixed-width font: wide characters (CJK, emoji) count as two. */
function textWidth(text: string): number {
  let w = 0
  for (const ch of text) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u.test(ch) ? 2 : 1
  return w
}

/**
 * The table as markdown, with every column padded so the pipes line up in a fixed-width font.
 * Right-aligned columns are padded on the left and centred ones on both sides, so the file reads the way the table looks.
 */
export function serializeTable(m: TableModel): string {
  const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim()
  const head = m.head.map(clean)
  const rows = m.rows.map((r) => head.map((_, i) => clean(r[i] ?? '')))
  const width = head.map((h, i) => Math.max(3, textWidth(h), ...rows.map((r) => textWidth(r[i]))))
  const pad = (cell: string, i: number) => {
    const space = width[i] - textWidth(cell)
    const a = m.align[i]
    if (a === 'right') return ' '.repeat(space) + cell
    if (a === 'center') return ' '.repeat(Math.floor(space / 2)) + cell + ' '.repeat(Math.ceil(space / 2))
    return cell + ' '.repeat(space)
  }
  const line = (cells: string[]) => '| ' + cells.map(pad).join(' | ') + ' |'
  const delim = '| ' + head.map((_, i) => {
    const a = m.align[i]
    const left = a === 'left' || a === 'center' ? ':' : ''
    const right = a === 'right' || a === 'center' ? ':' : ''
    return left + '-'.repeat(width[i] - left.length - right.length) + right
  }).join(' | ') + ' |'
  return [line(head), delim, ...rows.map(line)].join('\n')
}

const NUMBER = /^[-+(]?[$€£₹¥]?\s?\d[\d,.\s]*\)?\s?(%|[kKmMbB]|[a-zA-Z]{1,3})?$/

/** A table from rows of cells, as copied from a spreadsheet. The first row is the header; columns of numbers are right-aligned. */
export function tableFromCells(cells: string[][]): TableModel {
  const cols = Math.max(...cells.map((r) => r.length))
  const grid = cells.map((r) => Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\s*\n\s*/g, ' ').trim()))
  const [head, ...rows] = grid
  const align = head.map((_, i): Align => {
    const filled = rows.map((r) => r[i]).filter(Boolean)
    return filled.length > 0 && filled.every((v) => NUMBER.test(v)) ? 'right' : ''
  })
  return { head, align, rows }
}

/**
 * Cells on the clipboard, if what was copied is a block of spreadsheet cells or a table from a web page.
 * Google Sheets, Excel and Numbers put an HTML table on the clipboard; plain tab-separated text is accepted too.
 */
export function cellsFromClipboard(html: string, text: string): string[][] | null {
  if (/<table[\s>]/i.test(html)) {
    const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table')
    const out: string[][] = []
    for (const tr of table?.querySelectorAll('tr') ?? []) {
      // Rows of a table nested inside a cell belong to that cell, not to this table.
      if (tr.closest('table') !== table) continue
      const row: string[] = []
      for (const cell of tr.querySelectorAll('th, td')) {
        if (cell.closest('tr') !== tr) continue
        cell.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
        row.push((cell.textContent || '').replace(/ /g, ' ').trim())
        // A merged cell keeps its text in the first column and leaves the rest empty.
        for (let i = 1; i < Number(cell.getAttribute('colspan') || 1); i++) row.push('')
      }
      if (row.length) out.push(row)
    }
    while (out.length && out[out.length - 1].every((c) => !c)) out.pop()
    if (out.length && out.reduce((n, r) => n + r.length, 0) >= 2) return out
  }
  // Tab-separated text: every line must have the same number of tabs, and at least one.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  const tabs = (l: string) => l.split('\t').length - 1
  if (lines.length >= 1 && tabs(lines[0]) >= 1 && lines.every((l) => tabs(l) === tabs(lines[0]))) return lines.map((l) => l.split('\t').map((c) => c.trim()))
  return null
}

/** A cell as a number, if that is all it holds: "1,200", "-5.5", "$40", "12%". */
function cellNumber(cell: string): number | null {
  const s = cell.trim()
  if (!NUMBER.test(s)) return null
  const n = Number(s.replace(/[^\d.()+-]/g, '').replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : null
}

/**
 * Sort the rows by one column. Numbers sort as numbers and come before text; text sorts the way a person
 * would expect ("item 2" before "item 10"); empty cells stay at the bottom either way. Rows that tie keep their order.
 */
export function sortRows(m: TableModel, col: number, dir: 1 | -1) {
  const text = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  m.rows = m.rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const [x, y] = [a.row[col] ?? '', b.row[col] ?? '']
      if (!x.trim() || !y.trim()) return (x.trim() ? 0 : 1) - (y.trim() ? 0 : 1) || a.i - b.i
      const [nx, ny] = [cellNumber(x), cellNumber(y)]
      const order = nx !== null && ny !== null ? nx - ny : nx !== null ? -1 : ny !== null ? 1 : text.compare(x, y)
      return order * dir || a.i - b.i
    })
    .map((x) => x.row)
}

/** The table as tab-separated text, which spreadsheets paste as cells. Markdown marks inside cells are left as written. */
export function tableToTsv(m: TableModel): string {
  const cell = (s: string) => s.replace(/\\\|/g, '|').replace(/[\t\n]/g, ' ')
  return [m.head, ...m.rows].map((r) => r.map(cell).join('\t')).join('\n')
}

/** Set by the live preview: show a table's markdown source for editing. */
export const tableActions = { editRaw: (_view: EditorView, _from: number, _to: number) => {} }

interface Live {
  source: string
  model: TableModel
  view: EditorView
  timer: number
}
const live = new WeakMap<HTMLElement, Live>()
/** Where to put the caret back if the editor has to rebuild the table while a cell is being edited. */
let restore: { at: number; r: number; c: number; offset: number } | null = null

const raw = (m: TableModel, r: number, c: number) => (r < 0 ? m.head[c] : m.rows[r][c]) ?? ''
const cellAt = (dom: HTMLElement, r: number, c: number) => dom.querySelector<HTMLElement>(`.tw-cell[data-r="${r}"][data-c="${c}"]`)
const coords = (cell: HTMLElement) => ({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) })

function showRendered(cell: HTMLElement, text: string) {
  cell.classList.remove('editing')
  cell.innerHTML = text ? renderInline(text, { resolve: resolver(useStore.getState().notes) }) : ''
}

function caretOffset(cell: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !cell.contains(sel.focusNode)) return (cell.textContent || '').length
  const range = document.createRange()
  range.selectNodeContents(cell)
  range.setEnd(sel.focusNode!, sel.focusOffset)
  return range.toString().length
}

function focusCell(dom: HTMLElement, r: number, c: number, offset?: number) {
  const cell = cellAt(dom, r, c)
  if (!cell) return
  cell.focus()
  const sel = window.getSelection()
  if (!sel) return
  const text = cell.firstChild
  if (offset !== undefined && text && text.nodeType === Node.TEXT_NODE) sel.collapse(text, Math.min(offset, text.textContent!.length))
  else {
    sel.selectAllChildren(cell)
    sel.collapseToEnd()
  }
}

function render(dom: HTMLElement) {
  const { model } = live.get(dom)!
  const cell = (tag: 'th' | 'td', r: number, c: number) => {
    const el = document.createElement(tag)
    if (model.align[c]) el.style.textAlign = model.align[c]
    const inner = document.createElement('div')
    inner.className = 'tw-cell'
    inner.dataset.r = String(r)
    inner.dataset.c = String(c)
    inner.setAttribute('contenteditable', 'true')
    inner.spellcheck = false
    showRendered(inner, raw(model, r, c))
    el.append(inner)
    return el
  }
  const table = document.createElement('table')
  const thead = table.createTHead().insertRow()
  model.head.forEach((_, c) => thead.append(cell('th', -1, c)))
  const tbody = table.createTBody()
  model.rows.forEach((row, r) => {
    const tr = tbody.insertRow()
    row.forEach((_, c) => tr.append(cell('td', r, c)))
  })
  const wrap = document.createElement('div')
  wrap.className = 'table-wrap'
  wrap.append(table)
  const button = (cls: string, title: string) => {
    const b = document.createElement('button')
    b.className = cls
    b.title = title
    b.textContent = '+'
    b.tabIndex = -1
    return b
  }
  const edit = document.createElement('button')
  edit.className = 'tw-raw'
  edit.title = 'Edit this table as markdown'
  edit.textContent = 'Edit markdown'
  edit.tabIndex = -1
  const copy = document.createElement('button')
  copy.className = 'tw-raw tw-copy'
  copy.title = 'Copy this table so it pastes into Google Sheets, Excel or Numbers as cells'
  copy.textContent = 'Copy for spreadsheet'
  copy.tabIndex = -1
  dom.replaceChildren(wrap, copy, edit, button('tw-add tw-add-col', 'Add column'), button('tw-add tw-add-row', 'Add row'))
}

/** Write the table back into the note. */
function commit(dom: HTMLElement) {
  const st = live.get(dom)
  if (!st || !dom.isConnected) return
  clearTimeout(st.timer)
  const next = serializeTable(st.model)
  if (next === st.source) return
  const at = st.view.posAtDOM(dom)
  if (st.view.state.sliceDoc(at, at + st.source.length) !== st.source) return
  const active = document.activeElement as HTMLElement | null
  restore = active && dom.contains(active) && active.classList.contains('tw-cell') ? { at, ...coords(active), offset: caretOffset(active) } : null
  const previous = st.source
  st.source = next
  st.view.dispatch({ changes: { from: at, to: at + previous.length, insert: next } })
}

/** Change the table's shape, then redraw and save it. */
function reshape(dom: HTMLElement, change: (m: TableModel) => void, focus?: { r: number; c: number }) {
  const st = live.get(dom)
  if (!st) return
  change(st.model)
  render(dom)
  commit(dom)
  if (focus) requestAnimationFrame(() => focusCell(dom, Math.min(focus.r, st.model.rows.length - 1), Math.min(focus.c, st.model.head.length - 1)))
}

const addRow = (m: TableModel, at: number) => m.rows.splice(at, 0, m.head.map(() => ''))
function addCol(m: TableModel, at: number) {
  m.head.splice(at, 0, '')
  m.align.splice(at, 0, '')
  m.rows.forEach((r) => r.splice(at, 0, ''))
}

function attach(dom: HTMLElement) {
  const state = () => live.get(dom)!
  const cellOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('.tw-cell')
  const store = (cell: HTMLElement) => {
    const { r, c } = coords(cell)
    const m = state().model
    const text = (cell.textContent || '').replace(/\n/g, ' ')
    if (r < 0) m.head[c] = text
    else if (m.rows[r]) m.rows[r][c] = text
  }

  dom.addEventListener('focusin', (e) => {
    const cell = cellOf(e)
    if (!cell || cell.classList.contains('editing')) return
    const { r, c } = coords(cell)
    const text = raw(state().model, r, c)
    cell.classList.add('editing')
    // Swap the rendered cell for its markdown only when they differ, so a click keeps its caret position.
    if (cell.childNodes.length !== 1 || cell.firstChild!.nodeType !== Node.TEXT_NODE || cell.textContent !== text) {
      cell.textContent = text
      const sel = window.getSelection()
      sel?.selectAllChildren(cell)
      sel?.collapseToEnd()
    }
  })
  dom.addEventListener('input', (e) => {
    const cell = cellOf(e)
    if (!cell) return
    store(cell)
    const st = state()
    clearTimeout(st.timer)
    st.timer = window.setTimeout(() => commit(dom), 700)
  })
  dom.addEventListener('focusout', (e) => {
    const cell = cellOf(e)
    if (!cell || !cell.classList.contains('editing')) return
    store(cell)
    const { r, c } = coords(cell)
    showRendered(cell, raw(state().model, r, c))
    commit(dom)
  })
  dom.addEventListener('paste', (e) => {
    if (!cellOf(e)) return
    e.preventDefault()
    document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') || '').replace(/\s*\n\s*/g, ' '))
  })
  dom.addEventListener('keydown', (e) => {
    const cell = cellOf(e)
    if (!cell || e.isComposing) return
    const { r, c } = coords(cell)
    const m = state().model
    const cols = m.head.length
    const go = (nr: number, nc: number) => {
      e.preventDefault()
      if (nr >= m.rows.length) {
        store(cell)
        reshape(dom, (t) => addRow(t, t.rows.length), { r: nr, c: nc })
      } else focusCell(dom, nr, nc)
    }
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (c > 0) go(r, c - 1)
        else if (r >= 0) go(r - 1, cols - 1)
        else e.preventDefault()
      } else if (c < cols - 1) go(r, c + 1)
      else go(r + 1, 0)
    } else if (e.key === 'Enter') go(r + 1, c)
    else if (e.key === 'ArrowDown' && r < m.rows.length - 1) go(r + 1, c)
    else if (e.key === 'ArrowUp' && r >= 0) go(r - 1, c)
    else if (e.key === 'Escape') {
      e.preventDefault()
      cell.blur()
      const st = state()
      const end = st.view.posAtDOM(dom) + st.source.length
      st.view.dispatch({ selection: { anchor: Math.min(end + 1, st.view.state.doc.length) } })
      st.view.focus()
    }
  })
  dom.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.tw-copy')) {
      e.preventDefault()
      const active = document.activeElement as HTMLElement | null
      if (active && dom.contains(active)) active.blur()
      commit(dom)
      const m = state().model
      navigator.clipboard.writeText(tableToTsv(m)).then(
        () => toast(`Copied ${m.rows.length + 1} row${m.rows.length ? 's' : ''}. Paste into a spreadsheet.`),
        () => toast('Could not copy the table'),
      )
      return
    }
    if ((e.target as HTMLElement).closest('.tw-raw')) {
      e.preventDefault()
      const active = document.activeElement as HTMLElement | null
      if (active && dom.contains(active)) active.blur()
      commit(dom)
      const st = state()
      const from = st.view.posAtDOM(dom)
      tableActions.editRaw(st.view, from, from + st.source.length)
      return
    }
    const add = (e.target as HTMLElement).closest('.tw-add')
    if (!add) return
    e.preventDefault()
    const m = state().model
    if (add.classList.contains('tw-add-row')) reshape(dom, (t) => addRow(t, t.rows.length), { r: m.rows.length, c: 0 })
    else reshape(dom, (t) => addCol(t, t.head.length), { r: -1, c: m.head.length })
  })
  dom.addEventListener('contextmenu', (e) => {
    const cell = cellOf(e)
    if (!cell) return
    e.preventDefault()
    store(cell)
    const { r, c } = coords(cell)
    const m = state().model
    const align = (a: Align) => () => reshape(dom, (t) => (t.align[c] = a), { r, c })
    const items: MenuItem[] = [
      { label: 'Insert row above', onSelect: () => reshape(dom, (t) => addRow(t, Math.max(0, r)), { r: Math.max(0, r), c }) },
      { label: 'Insert row below', onSelect: () => reshape(dom, (t) => addRow(t, r + 1), { r: r + 1, c }) },
      { label: 'Insert column left', onSelect: () => reshape(dom, (t) => addCol(t, c), { r, c }) },
      { label: 'Insert column right', onSelect: () => reshape(dom, (t) => addCol(t, c + 1), { r, c: c + 1 }) },
      { separator: true },
      { label: `Sort by “${m.head[c] || 'this column'}”, A to Z`, onSelect: () => reshape(dom, (t) => sortRows(t, c, 1), { r, c }) },
      { label: `Sort by “${m.head[c] || 'this column'}”, Z to A`, onSelect: () => reshape(dom, (t) => sortRows(t, c, -1), { r, c }) },
      { separator: true },
      { label: 'Align left', checked: m.align[c] === 'left', onSelect: align('left') },
      { label: 'Align center', checked: m.align[c] === 'center', onSelect: align('center') },
      { label: 'Align right', checked: m.align[c] === 'right', onSelect: align('right') },
      { separator: true },
    ]
    if (r >= 0) items.push({ label: 'Delete row', danger: true, onSelect: () => reshape(dom, (t) => t.rows.splice(r, 1), { r: Math.max(-1, r - 1), c }) })
    if (m.head.length > 1) {
      items.push({
        label: 'Delete column',
        danger: true,
        onSelect: () =>
          reshape(
            dom,
            (t) => {
              t.head.splice(c, 1)
              t.align.splice(c, 1)
              t.rows.forEach((row) => row.splice(c, 1))
            },
            { r, c: Math.max(0, c - 1) },
          ),
      })
    }
    items.push({
      label: 'Delete table',
      danger: true,
      onSelect: () => {
        const st = state()
        const at = st.view.posAtDOM(dom)
        if (st.view.state.sliceDoc(at, at + st.source.length) === st.source) st.view.dispatch({ changes: { from: at, to: at + st.source.length, insert: '' } })
      },
    })
    ui({ menu: { x: e.clientX, y: e.clientY, items } })
  })
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string, readonly model: TableModel) {
    super()
  }
  eq(other: TableWidget) {
    return other.source === this.source
  }
  toDOM(view: EditorView) {
    const dom = document.createElement('div')
    dom.className = 'md cm-table-widget'
    live.set(dom, { source: this.source, model: this.model, view, timer: 0 })
    render(dom)
    attach(dom)
    if (restore) {
      const r = restore
      restore = null
      requestAnimationFrame(() => {
        if (dom.isConnected && view.posAtDOM(dom) === r.at) focusCell(dom, r.r, r.c, r.offset)
      })
    }
    return dom
  }
  updateDOM(dom: HTMLElement, view: EditorView) {
    const st = live.get(dom)
    if (!st) return false
    st.view = view
    // The change came from this table: the DOM is already up to date, keep the caret where it is.
    if (st.source === this.source) {
      restore = null
      return true
    }
    st.source = this.source
    st.model = this.model
    render(dom)
    return true
  }
  ignoreEvent() {
    return true
  }
}
