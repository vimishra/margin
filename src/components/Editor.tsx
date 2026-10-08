import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { type Match, findMatches, isearchHighlight, setMatches, smartLineStart } from './isearch'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { search, searchKeymap } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'
import { uploadAsMarkdown } from '../api'
import { linkHref } from '../lib/markdown'
import { fillTemplate, openDatePicker, templates, timeNow, toast, useStore } from '../store'
import { tagCounts } from '../lib/links'
import { parseDatePhrase } from '../lib/dates'
import { TASK_LINE, parseTaskText, withDetails } from '../lib/tasks'
import { dailyLabel, isYmd, longDate, today, tagHue } from '../lib/util'
import { livePreview } from './livePreview'
import { cellsFromClipboard, serializeTable, tableFromCells } from './tableWidget'
import { type ListKind, moveListItem, shiftListItem, toggleDone, toggleList } from './lists'
import { syntaxTree } from '@codemirror/language'

export interface EditorHandle {
  focus(): void
  insert(text: string): void
  wrap(before: string, after?: string, placeholder?: string): void
  prefixLines(prefix: string): void
  /** Insert a markdown link, leaving the cursor where the missing part goes. */
  insertLink(): void
  toggleList(kind: ListKind): void
  /** Tick or untick the task under the cursor. */
  toggleDone(): void
  /** Change a detail of the task under the cursor: its priority, due date or planned day, or plan it for today. */
  taskEdit(kind: 'priority' | 'due' | 'when' | 'today'): void
  scrollToLine(line: number): void
  /** Select a range of text and bring it to the middle of the view. */
  reveal(from: number, to: number): void
  upload(files: File[]): void
}

interface Props {
  value: string
  onChange: (value: string) => void
  onFollowLink: (target: string, side?: boolean) => void
  autoFocus?: boolean
  /** Render markdown in place, Obsidian-style. */
  live?: boolean
  spellcheck?: boolean
  autoPair?: boolean
  lineNumbers?: boolean
}

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: 'var(--h1-size)', color: 'var(--h1-color)', fontWeight: '700', letterSpacing: '-0.015em' },
  { tag: t.heading2, fontSize: 'var(--h2-size)', color: 'var(--h2-color)', fontWeight: '680', letterSpacing: '-0.01em' },
  { tag: t.heading3, fontSize: 'var(--h3-size)', color: 'var(--h3-color)', fontWeight: '650' },
  { tag: t.heading4, fontSize: 'var(--h4-size)', color: 'var(--h4-color)', fontWeight: '650' },
  { tag: [t.heading5, t.heading6], fontSize: 'var(--h5-size)', color: 'var(--h5-color)', fontWeight: '650' },
  { tag: t.strong, fontWeight: '700', fontSize: 'var(--bold-size)', color: 'var(--bold-color)' },
  { tag: t.emphasis, fontStyle: 'italic', fontSize: 'var(--italic-size)', color: 'var(--italic-color)' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-3)' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--text-3)' },
  { tag: t.monospace, fontFamily: 'var(--mono)', fontSize: '0.9em', color: 'var(--code)' },
  { tag: t.quote, color: 'var(--text-2)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--text-4)' },
  { tag: t.labelName, color: 'var(--text-3)' },
  // Code inside fenced blocks
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.character, t.attributeValue], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: 'var(--syn-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName)), t.macroName], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], color: 'var(--syn-type)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--syn-property)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--syn-punct)' },
])

/** Briefly lights up the line a jump landed on. The value is a position in that line, or null to clear. */
const flashLine = StateEffect.define<number | null>()
const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(flashLine)) value = e.value == null ? Decoration.none : Decoration.set([Decoration.line({ class: 'cm-jump-flash' }).range(tr.state.doc.lineAt(Math.min(e.value, tr.state.doc.length)).from)])
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

const decorator = new MatchDecorator({
  regexp: /\[\[[^\]\n]+\]\]|(?<![\w&])#[A-Za-z][\w/-]*|\$\$?[^$\n]+\$\$?/g,
  decoration: (m) =>
    m[0].startsWith('#')
      ? Decoration.mark({ class: 'cm-hashtag', attributes: { style: `--tag-hue: ${tagHue(m[0])}` } })
      : Decoration.mark({ class: m[0].startsWith('[[') ? 'cm-wikilink' : 'cm-math' }),
})

const marks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorator.createDeco(view)
    }
    update(u: ViewUpdate) {
      this.decorations = decorator.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)

/** A whole web address and nothing else. */
const WEB_URL = /^(?:https?:\/\/|mailto:|www\.)\S+$/i

const LINE_MARKUP = /^(\s*)(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+|(?:>\s?)+)?/

/**
 * Slash commands: type "/" at the start of a line or after a space to pick a block or insert something.
 * Typing more letters narrows the list ("/h2", "/table", "/tom").
 */
function slashCommands(ctx: CompletionContext) {
  const word = ctx.matchBefore(/\/[\w-]*/)
  if (!word) return null
  const line = ctx.state.doc.lineAt(word.from)
  const before = line.text.slice(0, word.from - line.from)
  // Not in the middle of a word, a path or a web address.
  if (before && !/\s$/.test(before)) return null
  for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(ctx.state).resolveInner(word.from, -1); n; n = n.parent) {
    if (/Code|URL|Link|HTML/.test(n.name)) return null
  }

  /** Change what kind of line this is (heading, list item, quote), keeping its text. */
  const block = (prefix: string) => (view: EditorView, _c: unknown, from: number, to: number) => {
    const l = view.state.doc.lineAt(from)
    const text = l.text.slice(0, from - 1 - l.from) + l.text.slice(to - l.from)
    const m = LINE_MARKUP.exec(text)!
    const indent = m[1]
    const body = text.slice(m[0].length)
    const next = indent + (prefix === '1. ' ? numberAfter(view, l.number, indent.length) : prefix) + body
    view.dispatch({ changes: { from: l.from, to: l.to, insert: next }, selection: { anchor: l.from + next.length - body.length + Math.max(0, from - 1 - l.from - m[0].length) } })
  }
  /** Replace the typed command with text; "‸" marks where the cursor goes, "‹…›" a part left selected. */
  const insert = (template: string | (() => string), ownLine = false) => (view: EditorView, _c: unknown, from: number, to: number) => {
    const l = view.state.doc.lineAt(from)
    let text = typeof template === 'function' ? template() : template
    if (ownLine && l.text.slice(0, from - 1 - l.from).trim()) text = '\n' + text
    const sel = /‹([^›]*)›/.exec(text)
    const caret = text.replace(/‹|›/g, '').indexOf('‸')
    const clean = text.replace(/‹|›/g, '').replace('‸', '')
    const start = from - 1
    const anchor = sel ? start + text.indexOf('‹') - (caret >= 0 && caret < text.indexOf('‹') ? 1 : 0) : start + (caret >= 0 ? caret : clean.length)
    view.dispatch({ changes: { from: start, to, insert: clean }, selection: sel ? { anchor, head: anchor + sel[1].length } : { anchor } })
  }
  const dayFirst = useStore.getState().settings.dayFirst
  const date = (phrase: string) => () => parseDatePhrase(phrase, dayFirst) || ''

  const options: Completion[] = [
    { label: 'Heading 1', detail: '#', apply: block('# '), section: 'Blocks' },
    { label: 'Heading 2', detail: '##', apply: block('## '), section: 'Blocks' },
    { label: 'Heading 3', detail: '###', apply: block('### '), section: 'Blocks' },
    { label: 'Bulleted list', detail: '-', apply: block('- '), section: 'Blocks' },
    { label: 'Numbered list', detail: '1.', apply: block('1. '), section: 'Blocks' },
    { label: 'Task', detail: '- [ ]', apply: block('- [ ] '), section: 'Blocks' },
    { label: 'To-do', detail: '- [ ]', apply: block('- [ ] '), section: 'Blocks' },
    { label: 'Quote', detail: '>', apply: block('> '), section: 'Blocks' },
    { label: 'Text', detail: 'plain paragraph', apply: block(''), section: 'Blocks' },
    { label: 'Code block', detail: '```', apply: insert('```‹language›\n\n```\n', true), section: 'Insert' },
    { label: 'Table', detail: '| |', apply: insert('\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n\n', true), section: 'Insert' },
    { label: 'Math block', detail: '$$', apply: insert('$$\n‸\n$$\n', true), section: 'Insert' },
    { label: 'Inline math', detail: '$x$', apply: insert('$‹x^2›$'), section: 'Insert' },
    { label: 'Divider', detail: '---', apply: insert('\n---\n\n', true), section: 'Insert' },
    { label: 'Link to a note', detail: '[[ ]]', apply: insert('[[‸]]'), section: 'Insert' },
    { label: 'Web link', detail: '[text](url)', apply: insert('[‹text›](https://)'), section: 'Insert' },
    {
      label: 'Image or file',
      detail: 'attach',
      section: 'Insert',
      apply(view: EditorView, _c: unknown, from: number, to: number) {
        view.dispatch({ changes: { from: from - 1, to, insert: '' } })
        const picker = document.createElement('input')
        picker.type = 'file'
        picker.multiple = true
        picker.onchange = () => uploadInto(view, [...(picker.files ?? [])])
        picker.click()
      },
    },
    { label: 'Due today', detail: '@due(…)', apply: insert(() => `@due(${today()})`), section: 'Tasks' },
    { label: 'Due tomorrow', detail: '@due(…)', apply: insert(() => `@due(${date('tomorrow')()})`), section: 'Tasks' },
    { label: 'Due date', detail: 'type a day', apply: insert('@due(‸)'), section: 'Tasks' },
    { label: 'Plan for today', detail: '>date', apply: insert(() => `>${today()}`), section: 'Tasks' },
    { label: 'Plan for tomorrow', detail: '>date', apply: insert(() => `>${date('tomorrow')()}`), section: 'Tasks' },
    { label: 'Plan for a day', detail: 'type a day', apply: insert('>‸'), section: 'Tasks' },
    { label: 'Someday', detail: '>someday', apply: insert('>someday'), section: 'Tasks' },
    { label: 'P1 high priority', detail: 'P1', apply: insert('P1 '), section: 'Tasks', boost: 2 },
    { label: 'P2 medium priority', detail: 'P2', apply: insert('P2 '), section: 'Tasks', boost: 1 },
    { label: 'P3 low priority', detail: 'P3', apply: insert('P3 '), section: 'Tasks' },
    { label: 'Today', detail: today(), apply: insert(() => `[[${today()}]]`), section: 'Dates' },
    { label: 'Tomorrow', detail: date('tomorrow')(), apply: insert(() => `[[${date('tomorrow')()}]]`), section: 'Dates' },
    { label: 'Yesterday', detail: date('yesterday')(), apply: insert(() => `[[${date('yesterday')()}]]`), section: 'Dates' },
    { label: 'Date', detail: 'as text', apply: insert(() => today()), section: 'Dates' },
    { label: 'Time', detail: 'now', apply: insert(() => timeNow()), section: 'Dates' },
    ...templates().map(
      (t): Completion => ({ label: `Template: ${t.title}`, detail: 'insert', apply: insert(() => fillTemplate(t.content, t.title), true), section: 'Templates' }),
    ),
  ]
  return { from: word.from + 1, options, validFor: /^[\w-]*$/ }
}

/** The number a new numbered item should take: one more than a numbered item directly above at the same indent. */
function numberAfter(view: EditorView, lineNumber: number, indent: number): string {
  if (lineNumber > 1) {
    const m = /^(\s*)(\d+)[.)]\s/.exec(view.state.doc.line(lineNumber - 1).text)
    if (m && m[1].length === indent) return `${Number(m[2]) + 1}. `
  }
  return '1. '
}

function completions(ctx: CompletionContext) {
  const link = ctx.matchBefore(/\[\[[^\]\n|]*/)
  if (link) {
    const notes = Object.values(useStore.getState().notes).sort((a, b) => b.updated.localeCompare(a.updated))
    const insert = (title: string) => (view: EditorView, _c: unknown, from: number, to: number) => {
      const closed = view.state.sliceDoc(to, to + 2) === ']]'
      view.dispatch({ changes: { from, to, insert: title + (closed ? '' : ']]') }, selection: { anchor: from + title.length + 2 } })
    }
    const options: Completion[] = notes.map((n, i) => ({
      label: n.title,
      detail: n.type === 'daily' && isYmd(n.title) ? dailyLabel(n.title) : n.folder || undefined,
      type: n.type,
      boost: -i,
      apply: insert(n.title),
    }))
    // "[[tomorrow" or "[[next friday" links to that day's daily note.
    const typed = ctx.state.sliceDoc(link.from + 2, ctx.pos)
    const date = parseDatePhrase(typed, useStore.getState().settings.dayFirst)
    if (date) {
      return {
        from: link.from + 2,
        filter: false,
        options: [{ label: date, detail: longDate(date), type: 'daily', apply: insert(date) }, ...options.filter((o) => o.label.toLowerCase().includes(typed.toLowerCase())).slice(0, 20)],
      }
    }
    return { from: link.from + 2, options, validFor: (text: string) => /^[^\]\n|]*$/.test(text) && !parseDatePhrase(text, useStore.getState().settings.dayFirst) }
  }
  // On a task: ">fri" plans it for a day and "@due(fri" sets the deadline; any date phrase works.
  const when = ctx.matchBefore(/(?:(?<=\s)>|@due\()[\w ./-]*$/)
  if (when && TASK_LINE.test(ctx.state.doc.lineAt(when.from).text)) {
    const start = when.from + (when.text.startsWith('>') ? 1 : 5)
    const typed = ctx.state.sliceDoc(start, ctx.pos)
    const due = !when.text.startsWith('>')
    const dayFirst = useStore.getState().settings.dayFirst
    const apply = (date: string) => (view: EditorView, _c: unknown, from: number, to: number) => {
      const close = due && view.state.sliceDoc(to, to + 1) !== ')' ? ')' : ''
      const skip = due && !close ? 1 : 0
      view.dispatch({ changes: { from, to, insert: date + close }, selection: { anchor: from + date.length + close.length + skip } })
    }
    const phrases = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'next week', 'next month']
    const exact = parseDatePhrase(typed, dayFirst)
    const options: Completion[] = phrases
      .filter((p) => p.startsWith(typed.trim().toLowerCase()) && parseDatePhrase(p, dayFirst) !== exact)
      .map((p, i) => ({ label: p, detail: longDate(parseDatePhrase(p, dayFirst)!), type: 'daily', boost: -i, apply: apply(parseDatePhrase(p, dayFirst)!) }))
    if (exact && exact !== typed.trim()) options.unshift({ label: typed.trim() || exact, detail: longDate(exact), type: 'daily', boost: 5, apply: apply(exact) })
    // ">someday" parks the task instead of giving it a day.
    if (!due && typed.trim() && 'someday'.startsWith(typed.trim().toLowerCase()) && typed.trim().toLowerCase() !== 'someday')
      options.push({ label: 'someday', detail: 'Out of Today, Upcoming and Anytime', type: 'daily', apply: apply('someday') })
    if (options.length) return { from: start, filter: false, options }
  }
  const slash = slashCommands(ctx)
  if (slash) return slash
  const tag = ctx.matchBefore(/(?<![\w&])#[\w/-]*/)
  if (tag && (tag.to - tag.from > 1 || ctx.explicit)) {
    // A "#" at the start of a line is a heading, not a tag.
    if (ctx.state.doc.lineAt(tag.from).from === tag.from) return null
    return {
      from: tag.from + 1,
      options: tagCounts(useStore.getState().notes).map(([label, n]) => ({ label, detail: String(n) })),
      validFor: /^[\w/-]*$/,
    }
  }
  return null
}

function wrapSelection(view: EditorView, before: string, after = before, fallback = '') {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to) || fallback
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
    scrollIntoView: true,
  })
  view.focus()
  return true
}

async function uploadInto(view: EditorView, files: File[], pos?: number, pasted = false) {
  for (const file of files) {
    try {
      const s = useStore.getState()
      // The note this editor belongs to, for naming pasted images after it.
      const inSide = view.dom.closest<HTMLElement>('[data-pane]')?.dataset.pane === 'side'
      const note = inSide ? s.notes[s.side || ''] : s.route.name === 'note' ? s.notes[s.route.id] : s.route.name === 'journal' ? s.notes[s.journalNote || ''] : undefined
      const md = await uploadAsMarkdown(file, { pasted, actualSize: s.settings.imageActualSize, noteTitle: s.settings.imageNoteName ? note?.title : undefined })
      const at = pos ?? view.state.selection.main.head
      const line = view.state.doc.lineAt(at)
      const insert = (line.text.trim() && at === line.to ? '\n' : '') + md + '\n'
      view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length } })
      pos = at + insert.length
    } catch {
      toast(`Could not attach ${file.name}`)
    }
  }
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ value, onChange, onFollowLink, autoFocus, live, spellcheck, autoPair = true, lineNumbers: showLineNumbers }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const cb = useRef({ onChange, onFollowLink })
  cb.current = { onChange, onFollowLink }

  // ----- incremental search (Ctrl-S / Ctrl-R) -----
  const [isearch, setIsearch] = useState<null | { query: string; index: number; count: number; back: boolean; wrapped: boolean }>(null)
  const [barBox, setBarBox] = useState({ left: 0, width: 0, bottom: 0 })
  const session = useRef<null | { anchor: number; head: number; top: number; matches: Match[]; index: number; query: string; back: boolean }>(null)
  const lastQuery = useRef('')
  const searchInput = useRef<HTMLInputElement>(null)
  const scroller = () => host.current?.closest<HTMLElement>('.note-scroll') ?? null

  function searchFor(query: string, back: boolean, step: 'type' | 'next' | 'prev') {
    const view = viewRef.current
    const s = session.current
    if (!view || !s) return
    const matches = findMatches(view.state.doc.toString(), query)
    let index = -1
    let wrapped = false
    if (matches.length) {
      if (step === 'type' || s.index < 0 || query !== s.query) {
        // Start from where the cursor was when the search began.
        index = back ? matches.map((m) => m.from < s.head).lastIndexOf(true) : matches.findIndex((m) => m.from >= s.head)
        if (index < 0) {
          index = back ? matches.length - 1 : 0
          wrapped = true
        }
      } else {
        index = (s.index + (step === 'next' ? 1 : -1) + matches.length) % matches.length
        wrapped = step === 'next' ? index <= s.index : index >= s.index
      }
    }
    Object.assign(s, { matches, index, query, back })
    const hit = matches[index]
    view.dispatch({
      effects: [setMatches.of({ matches, current: index }), ...(hit ? [EditorView.scrollIntoView(hit.from, { y: 'center' })] : [])],
      selection: hit ? { anchor: hit.from, head: hit.to } : undefined,
    })
    setIsearch({ query, index, count: matches.length, back, wrapped })
  }

  function startSearch(back: boolean) {
    const view = viewRef.current
    if (!view) return
    if (session.current) {
      // Already searching: Ctrl-S / Ctrl-R step through matches. With an empty box they recall the last search.
      const s = session.current
      if (!s.query && lastQuery.current) searchFor(lastQuery.current, back, 'type')
      else searchFor(s.query, back, back ? 'prev' : 'next')
      return
    }
    const box = scroller()?.getBoundingClientRect()
    const sel = view.state.selection.main
    session.current = { anchor: sel.anchor, head: sel.head, top: scroller()?.scrollTop ?? 0, matches: [], index: -1, query: '', back }
    // Show the box and move focus to it before this key press finishes, so the very next key lands in it.
    flushSync(() => {
      if (box) setBarBox({ left: box.left, width: box.width, bottom: window.innerHeight - box.bottom })
      setIsearch({ query: '', index: -1, count: 0, back, wrapped: false })
    })
    searchInput.current?.focus()
  }

  function endSearch(accept: boolean) {
    const view = viewRef.current
    const s = session.current
    session.current = null
    setIsearch(null)
    if (!view || !s) return
    const hit = s.matches[s.index]
    if (accept && hit) {
      lastQuery.current = s.query
      // Like Emacs: the cursor lands after the match going forward, before it going backward.
      view.dispatch({ effects: setMatches.of(null), selection: { anchor: s.back ? hit.from : hit.to }, scrollIntoView: true })
    } else {
      view.dispatch({ effects: setMatches.of(null), selection: { anchor: s.anchor, head: s.head } })
      if (!accept) requestAnimationFrame(() => scroller()?.scrollTo({ top: s.top }))
    }
    view.focus()
  }

  useEffect(() => {
    // With two notes side by side, only the one in the active pane responds.
    const onSearch = (e: Event) => {
      const mine = host.current?.closest<HTMLElement>('[data-pane]')?.dataset.pane || 'main'
      if (mine === useStore.getState().activePane) startSearch((e as CustomEvent<string>).detail === 'back')
    }
    window.addEventListener('margin:isearch', onSearch)
    return () => window.removeEventListener('margin:isearch', onSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          highlightSpecialChars(),
          indentOnInput(),
          autoPair ? closeBrackets() : [],
          showLineNumbers && !live ? lineNumbers() : [],
          EditorView.contentAttributes.of({ spellcheck: spellcheck ? 'true' : 'false', autocorrect: spellcheck ? 'on' : 'off' }),
          EditorView.lineWrapping,
          flashField,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlight),
          marks,
          isearchHighlight,
          live ? livePreview((target, side) => cb.current.onFollowLink(target, side)) : [],
          EditorView.editorAttributes.of({ class: live ? 'cm-live' : 'cm-source' }),
          search({ top: true }),
          autocompletion({ override: [completions], icons: false }),
          placeholder('Start writing, or type [[ to link a note…'),
          keymap.of([
            // In a list these move the item with its sub-items; elsewhere the editor's own line move applies.
            // They come first so they win over the built-in line move.
            { key: 'Alt-ArrowUp', run: (v) => moveListItem(v, -1) },
            { key: 'Alt-ArrowDown', run: (v) => moveListItem(v, 1) },
            { mac: 'Ctrl-a', run: (v) => smartLineStart(v, false), shift: (v) => smartLineStart(v, true) },
            { key: 'Mod-b', run: (v) => wrapSelection(v, '**', '**', 'bold') },
            { key: 'Mod-i', run: (v) => wrapSelection(v, '*', '*', 'italic') },
            { key: 'Mod-Shift-k', run: (v) => wrapSelection(v, '[[', ']]') },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...defaultKeymap.filter((k) => k.key !== 'Mod-Enter' && k.key !== 'Mod-/'),
            { key: 'Tab', run: (v) => shiftListItem(v, 1) },
            { key: 'Shift-Tab', run: (v) => shiftListItem(v, -1) },
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            paste(e, v) {
              const files = [...(e.clipboardData?.files ?? [])]
              // A web address pasted over selected words turns them into a link to it.
              const pasted = e.clipboardData?.getData('text/plain').trim() ?? ''
              const sel = v.state.selection.main
              if (!files.length && !sel.empty && WEB_URL.test(pasted)) {
                const words = v.state.sliceDoc(sel.from, sel.to)
                let inCode = false
                for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(v.state).resolveInner(sel.from, 1); n; n = n.parent) if (/Code|URL|Link|Image/.test(n.name)) inCode = true
                // Not when the selection is itself an address (that is replacing one link with another), spans lines, or sits in code or a link.
                if (!WEB_URL.test(words.trim()) && !words.includes('\n') && words.trim() && !inCode) {
                  e.preventDefault()
                  const insert = `[${words}](${pasted})`
                  v.dispatch({ changes: { from: sel.from, to: sel.to, insert }, selection: { anchor: sel.from + insert.length }, userEvent: 'input.paste', scrollIntoView: true })
                  return true
                }
              }
              // Cells copied from a spreadsheet (or a table from a web page) become a markdown table.
              // A spreadsheet also puts a picture of the cells on the clipboard, so this comes before files.
              const cells = cellsFromClipboard(e.clipboardData?.getData('text/html') ?? '', e.clipboardData?.getData('text/plain') ?? '')
              if (cells) {
                let inCode = false
                for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(v.state).resolveInner(sel.from, -1); n; n = n.parent) if (/Code/.test(n.name)) inCode = true
                if (!inCode) {
                  e.preventDefault()
                  const table = serializeTable(tableFromCells(cells))
                  // A table needs an empty line above and below to be read as one.
                  const before = v.state.sliceDoc(Math.max(0, sel.from - 2), sel.from)
                  const after = v.state.sliceDoc(sel.to, Math.min(v.state.doc.length, sel.to + 2))
                  const lead = sel.from === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
                  const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') || sel.to === v.state.doc.length ? '\n' : '\n\n'
                  const insert = lead + table + trail
                  v.dispatch({ changes: { from: sel.from, to: sel.to, insert }, selection: { anchor: sel.from + insert.length }, userEvent: 'input.paste', scrollIntoView: true })
                  return true
                }
              }
              if (!files.length) return false
              e.preventDefault()
              uploadInto(v, files, undefined, true)
              return true
            },
            drop(e, v) {
              const files = [...(e.dataTransfer?.files ?? [])]
              if (!files.length) return false
              e.preventDefault()
              uploadInto(v, files, v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined)
              return true
            },
            mousedown(e, v) {
              // A rendered link opens on a plain click. Once the cursor is on its line (so the markdown is
              // showing), clicks place the cursor instead, and ⌘-click opens.
              const rendered = e.button === 0 ? (e.target as HTMLElement).closest<HTMLElement>('[data-href]') : null
              if (rendered) {
                const at = v.posAtDOM(rendered)
                const editing = v.hasFocus && v.state.doc.lineAt(v.state.selection.main.head).number === v.state.doc.lineAt(at).number
                if (!editing || e.metaKey || e.ctrlKey) {
                  e.preventDefault()
                  window.open(linkHref(rendered.dataset.href || ''), '_blank', 'noopener')
                  return true
                }
              }
              if (!(e.metaKey || e.ctrlKey)) return false
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
              if (pos == null) return false
              const line = v.state.doc.lineAt(pos)
              for (const m of line.text.matchAll(/\[\[([^\]\n|#]+)[^\]\n]*\]\]/g)) {
                const start = line.from + m.index!
                if (pos >= start && pos <= start + m[0].length) {
                  e.preventDefault()
                  cb.current.onFollowLink(m[1].trim())
                  return true
                }
              }
              // ⌘-click a markdown link to open it.
              for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(v.state).resolveInner(pos, 1); n; n = n.parent) {
                const url = n.name === 'Link' ? n.getChild('URL') : n.name === 'URL' ? n : null
                if (!url) continue
                const href = v.state.sliceDoc(url.from, url.to)
                e.preventDefault()
                window.open(linkHref(href), '_blank', 'noopener')
                return true
              }
              return false
            },
          }),
        ],
      }),
    })
    viewRef.current = view
    if (autoFocus) view.focus()
    return () => view.destroy()
    // The editor is created once per mounted note; value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync changes that did not come from typing (version restore, file edited on disk, task toggles).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      const head = Math.min(view.state.selection.main.head, value.length)
      view.dispatch({ changes: { from: 0, to: current.length, insert: value }, selection: { anchor: head } })
    }
  }, [value])

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    insert(text) {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true })
      view.focus()
    },
    wrap(before, after, fallback) {
      if (viewRef.current) wrapSelection(viewRef.current, before, after, fallback)
    },
    taskEdit(kind) {
      const view = viewRef.current
      if (!view) return
      /** Rewrite the details of the task on a line; false if the line is not a task. */
      const rewrite = (lineNo: number, change: (raw: string) => string) => {
        const line = view.state.doc.line(lineNo)
        const m = TASK_LINE.exec(line.text)
        if (!m) return false
        const from = line.from + m[1].length + 1 + m[3].length
        const next = change(m[4])
        if (next !== m[4]) view.dispatch({ changes: { from, to: line.to, insert: next }, userEvent: 'input' })
        return true
      }
      const sel = view.state.selection.main
      const first = view.state.doc.lineAt(sel.from).number
      const last = view.state.doc.lineAt(sel.to).number
      if (kind === 'today' || kind === 'priority') {
        // These apply to every task in the selection. Priority steps P1, P2, P3, none.
        let any = false
        for (let n = first; n <= last; n++) {
          const done = rewrite(n, (raw) => {
            if (kind === 'today') return withDetails(raw, { scheduled: today() })
            const p = parseTaskText(raw).priority
            return withDetails(raw, { priority: p === 0 ? 3 : p - 1 })
          })
          any = any || done
        }
        if (!any) toast('The cursor is not on a task')
        return
      }
      const head = view.state.doc.lineAt(sel.head)
      const m = TASK_LINE.exec(head.text)
      if (!m) return void toast('The cursor is not on a task')
      const now = parseTaskText(m[4])
      const planning = kind === 'when'
      // The calendar opens just under the cursor.
      const at = view.coordsAtPos(sel.head) ?? view.contentDOM.getBoundingClientRect()
      const anchor = { getBoundingClientRect: () => ({ left: at.left, right: at.left, top: at.top, bottom: at.bottom }) } as unknown as EventTarget
      openDatePicker({ currentTarget: anchor }, {
        title: planning ? 'When' : 'Due date',
        value: planning ? now.scheduled : now.due,
        removeLabel: !planning ? 'Remove due date' : now.someday ? 'Take out of Someday' : 'Remove planned day',
        someday: planning ? (now.someday ? 'on' : 'off') : undefined,
        onPick: (date) => {
          rewrite(head.number, (raw) => withDetails(raw, planning ? (date === 'someday' ? { someday: true } : { scheduled: date }) : { due: date }))
          view.focus()
        },
      })
    },
    toggleDone() {
      if (viewRef.current && !toggleDone(viewRef.current, useStore.getState().settings.logCompletion)) toast('The cursor is not on a task')
    },
    toggleList(kind) {
      if (viewRef.current) toggleList(viewRef.current, kind)
    },
    insertLink() {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const selected = view.state.sliceDoc(from, to)
      // Nothing selected: [|](). A web address selected: [|](address). Words selected: [words](|).
      const isUrl = WEB_URL.test(selected.trim())
      const insert = !selected ? '[]()' : isUrl ? `[](${selected.trim()})` : `[${selected}]()`
      const anchor = !selected || isUrl ? from + 1 : from + insert.length - 1
      view.dispatch({ changes: { from, to, insert }, selection: { anchor }, scrollIntoView: true })
      view.focus()
    },
    prefixLines(prefix) {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const first = view.state.doc.lineAt(from).number
      const last = view.state.doc.lineAt(to).number
      const changes = []
      for (let n = first; n <= last; n++) {
        const line = view.state.doc.line(n)
        const existing = /^(#{1,6}\s|>\s|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s)/.exec(line.text)
        if (existing && existing[0] === prefix) changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
        else changes.push({ from: line.from, to: line.from + (existing ? existing[0].length : 0), insert: prefix })
      }
      view.dispatch({ changes })
      view.focus()
    },
    reveal(from, to) {
      const view = viewRef.current
      if (!view) return
      const end = Math.min(to, view.state.doc.length)
      const start = Math.min(from, end)
      view.dispatch({ selection: { anchor: start, head: end }, effects: EditorView.scrollIntoView(start, { y: 'center' }) })
      view.focus()
      // Images, tables and a pane that has only just opened change the layout after the first scroll,
      // so scroll again once things have settled, unless the cursor has been moved since.
      const settle = (_again: boolean) => {
        if (viewRef.current !== view) return
        const sel = view.state.selection.main
        if (sel.from !== start || sel.to !== end) return
        view.dispatch({ effects: EditorView.scrollIntoView(start, { y: 'center' }) })
      }
      // Briefly light up the line, so it is obvious where the jump landed.
      view.dispatch({ effects: flashLine.of(start) })
      setTimeout(() => viewRef.current === view && view.dispatch({ effects: flashLine.of(null) }), 1700)
      setTimeout(() => settle(true), 120)
      setTimeout(() => settle(false), 450)
      setTimeout(() => settle(false), 1000)
    },
    scrollToLine(line) {
      const view = viewRef.current
      if (!view) return
      const pos = view.state.doc.line(Math.min(line + 1, view.state.doc.lines)).from
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 80 }) })
      view.focus()
    },
    upload(files) {
      if (viewRef.current) uploadInto(viewRef.current, files)
    },
  }))

  return (
    <>
      <div className="editor" ref={host} />
      {isearch &&
        createPortal(
          <div className="isearch" style={{ left: barBox.left, width: barBox.width, bottom: barBox.bottom }}>
            <div className={isearch.query && !isearch.count ? 'isearch-bar failed' : 'isearch-bar'}>
              <Search size={14} />
              <span className="isearch-label">{isearch.back ? 'Search backward' : 'Search'}</span>
              <input
                ref={searchInput}
                autoFocus
                value={isearch.query}
                spellCheck={false}
                placeholder={lastQuery.current ? `Type to search, or ⌃S for “${lastQuery.current}”` : 'Type to search this note'}
                onChange={(e) => searchFor(e.target.value, isearch.back, 'type')}
                onBlur={() => session.current && endSearch(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.preventDefault(), endSearch(true))
                  else if (e.key === 'Escape' || (e.ctrlKey && e.key === 'g')) (e.preventDefault(), e.stopPropagation(), endSearch(false))
                  else if (e.key === 'ArrowDown') (e.preventDefault(), searchFor(isearch.query, false, 'next'))
                  else if (e.key === 'ArrowUp') (e.preventDefault(), searchFor(isearch.query, true, 'prev'))
                }}
              />
              <span className="isearch-count">
                {!isearch.query ? '' : isearch.count ? `${isearch.index + 1} of ${isearch.count}${isearch.wrapped ? ' · wrapped' : ''}` : 'No matches'}
              </span>
              <button className="icon-btn xs" title="Previous match  ⌃R" onMouseDown={(e) => (e.preventDefault(), searchFor(isearch.query, true, 'prev'))}>
                <ChevronUp size={14} />
              </button>
              <button className="icon-btn xs" title="Next match  ⌃S" onMouseDown={(e) => (e.preventDefault(), searchFor(isearch.query, false, 'next'))}>
                <ChevronDown size={14} />
              </button>
              <button className="icon-btn xs" title="Cancel  Esc" onMouseDown={(e) => (e.preventDefault(), endSearch(false))}>
                <X size={13} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
})
