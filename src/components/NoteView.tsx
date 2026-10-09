import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code,
  ArrowLeftRight,
  Code2,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Heading2,
  History,
  Hourglass,
  Italic,
  LayoutDashboard,
  Link2,
  List,
  ListChecks,
  ListTree,
  ListOrdered,
  MoreHorizontal,
  MoveHorizontal,
  PanelRight,
  Paperclip,
  PenLine,
  Pin,
  Printer,
  Quote,
  Sigma,
  Table,
  Trash2,
  FolderInput,
  X,
} from 'lucide-react'
import type { Note } from '../types'
import { timeNow, deleteNote, duplicateNote, go, openDaily, openMenu, openSide, pageWidthMenu, setActivePane, setPref, swapPanes, toast, ui, updateNote, useStore, type Mode, type Settings, fontCss } from '../store'
import { joinContent, splitContent } from '../lib/canvas'
import { tagsOf } from '../lib/links'
import { ALT, MOD, addDays, cx, dailyLabel, displayTitle, expiresIn, isYmd, today, tagStyle } from '../lib/util'
import { copyRichText, exportHtml, exportMarkdown, exportPdf, exportWord } from '../lib/export'
import { Editor, type EditorHandle } from './Editor'
import { Preview, followLink } from './Preview'
import { CanvasView } from './CanvasView'
import { RightPane } from './RightPane'
import { DayTasks } from './TasksView'
import { desktop } from '../desktop'
import { hint } from '../shortcuts'

const DAY = 86400000

const measured: Record<string, number> = {}
/** Average width in pixels of one character of body text, so "90 characters per line" means what it says. */
export function charWidth(mono: boolean, settings: Settings): number {
  const size = mono ? 14 : settings.fontSize
  const key = `${mono}:${settings.font}:${settings.codeFont}:${size}`
  if (!measured[key]) {
    const sample = 'The quick brown fox jumps over the lazy dog, then stops to read 42 pages of notes.'
    const ctx = document.createElement('canvas').getContext('2d')
    // Canvas cannot resolve CSS variables, so substitute the app's base font stack.
    const base = getComputedStyle(document.documentElement).getPropertyValue('--font')
    const family = (mono ? fontCss(settings.codeFont, true) : fontCss(settings.font)).replace('var(--font)', base)
    if (ctx) {
      ctx.font = `${size}px ${family}`
      measured[key] = ctx.measureText(sample).width / sample.length
    }
    if (!measured[key]) measured[key] = size * (mono ? 0.6 : 0.48)
  }
  return measured[key]
}

function exportItems(note: Note) {
  const run = (fn: (n: Note) => unknown, done?: string) => async () => {
    try {
      await fn(note)
      if (done) toast(done)
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`)
    }
  }
  return [
    { label: 'Markdown (.md)', icon: <FileText size={15} />, onSelect: run(exportMarkdown) },
    { label: 'Web page (.html)', icon: <Code size={15} />, onSelect: run(exportHtml) },
    {
      label: 'PDF…',
      icon: <Printer size={15} />,
      hint: desktop ? undefined : 'Print dialog',
      onSelect: run(async (n) => {
        const saved = await exportPdf(n)
        if (saved) toast(`PDF saved to ${saved}`)
      }),
    },
    { label: 'Word (.doc)', icon: <Download size={15} />, onSelect: run(exportWord) },
    { separator: true },
    {
      label: 'Copy for Google Docs',
      icon: <Copy size={15} />,
      onSelect: run(async (n) => {
        await copyRichText(n)
        toast('Copied with formatting. Paste into a Google Doc.', {
          label: 'New Google Doc',
          run: () => window.open('https://docs.new', '_blank', 'noopener'),
        })
      }),
    },
  ]
}

function Tags({ note }: { note: Note }) {
  const [draft, setDraft] = useState('')
  const inline = tagsOf(note).filter((t) => !note.tags.includes(t))
  const add = () => {
    const tag = draft.trim().replace(/^#/, '').replace(/\s+/g, '-')
    setDraft('')
    if (tag && !note.tags.includes(tag)) updateNote(note.id, { tags: [...note.tags, tag] })
  }
  return (
    <div className="tags-row">
      {note.tags.map((t) => (
        <span key={t} className="chip tag" style={tagStyle(t)}>
          <button className="chip-label" onClick={() => go({ name: 'tag', tag: t })}>
            #{t}
          </button>
          <button className="chip-x" title="Remove tag" onClick={() => updateNote(note.id, { tags: note.tags.filter((x) => x !== t) })}>
            <X size={11} />
          </button>
        </span>
      ))}
      {inline.map((t) => (
        <button key={t} className="chip tag inline" style={tagStyle(t)} title="Tag written in the note" onClick={() => go({ name: 'tag', tag: t })}>
          #{t}
        </button>
      ))}
      <input
        className="tag-input"
        value={draft}
        placeholder={note.tags.length || inline.length ? 'Add tag' : '+ Add tag'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !draft && note.tags.length) {
            updateNote(note.id, { tags: note.tags.slice(0, -1) })
          }
        }}
      />
    </div>
  )
}

function Strip({ note }: { note: Note }) {
  const [source, setSource] = useState(note.source || '')
  useEffect(() => setSource(note.source || ''), [note.source, note.id])

  if (note.type === 'article') {
    return (
      <div className="strip">
        <div className="seg sm">
          {['unread', 'reading', 'done'].map((s) => (
            <button key={s} className={cx((note.status || 'unread') === s && 'on')} onClick={() => updateNote(note.id, { status: s })}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="source">
          <Link2 size={14} />
          <input
            value={source}
            placeholder="Source link"
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => source.trim() !== (note.source || '') && updateNote(note.id, { source: source.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {note.source && (
            <a className="icon-btn sm" href={note.source} target="_blank" rel="noopener noreferrer" title="Open source">
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    )
  }
  if (note.type === 'scratch') {
    const extend = (days: number) =>
      updateNote(note.id, { expires: new Date(Math.max(Date.now(), new Date(note.expires || 0).getTime()) + days * DAY).toISOString() })
    return (
      <div className="strip scratch">
        <span className="strip-label">
          <Hourglass size={14} /> Scratch note · {note.expires ? expiresIn(note.expires) : 'no expiry'}
        </span>
        <button className="btn ghost sm" onClick={() => extend(1)}>
          +1 day
        </button>
        <button className="btn ghost sm" onClick={() => extend(7)}>
          +1 week
        </button>
        <button
          className="btn sm"
          onClick={() => {
            updateNote(note.id, { type: 'note', expires: '', folder: '', title: note.title.replace(/^Scratch — /, '') })
            toast('Kept as a regular note')
          }}
        >
          Keep
        </button>
      </div>
    )
  }
  return null
}

function Toolbar({ editor }: { editor: React.RefObject<EditorHandle> }) {
  const file = useRef<HTMLInputElement>(null)
  const e = () => editor.current
  const items: [React.ReactNode, string, () => void][] = [
    [<Heading2 size={16} />, 'Heading', () => e()?.prefixLines('## ')],
    [<Bold size={16} />, `Bold  ${MOD}B`, () => e()?.wrap('**', '**', 'bold')],
    [<Italic size={16} />, `Italic  ${MOD}I`, () => e()?.wrap('*', '*', 'italic')],
    [<List size={16} />, `Bulleted list  ${hint('bullet')}`, () => e()?.toggleList('bullet')],
    [<ListOrdered size={16} />, `Numbered list  ${hint('numbered')}`, () => e()?.toggleList('numbered')],
    [<ListChecks size={16} />, `Task list  ${hint('task')}`, () => e()?.toggleList('task')],
    [<Quote size={16} />, 'Quote', () => e()?.prefixLines('> ')],
    [<Code size={16} />, 'Code', () => e()?.wrap('`', '`', 'code')],
    [<Link2 size={16} />, `Link  ${hint('mdlink')}`, () => e()?.insertLink()],
    [<BookOpen size={16} />, `Link to note  ${MOD}⇧K`, () => e()?.wrap('[[', ']]')],
    [<Table size={16} />, 'Table', () => e()?.insert('\n\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n\n')],
    [<Sigma size={16} />, 'Math', () => e()?.wrap('$', '$', 'x^2')],
    [<Paperclip size={16} />, 'Attach image, PDF or file', () => file.current?.click()],
  ]
  return (
    <div className="toolbar">
      {items.map(([icon, title, run], i) => (
        <button key={i} className="icon-btn sm" title={title} onMouseDown={(ev) => ev.preventDefault()} onClick={run}>
          {icon}
        </button>
      ))}
      <input
        ref={file}
        type="file"
        multiple
        hidden
        onChange={(ev) => {
          e()?.upload([...(ev.target.files ?? [])])
          ev.target.value = ''
        }}
      />
    </div>
  )
}

/** Carry out a formatting command (from a shortcut, the menu bar or ⌘K) in an editor. */
export function applyFormat(ed: EditorHandle, kind: string) {
  const actions: Record<string, () => void> = {
    bullet: () => ed.toggleList('bullet'),
    numbered: () => ed.toggleList('numbered'),
    task: () => ed.toggleList('task'),
    done: () => ed.toggleDone(),
    taskPriority: () => ed.taskEdit('priority'),
    taskDue: () => ed.taskEdit('due'),
    taskWhen: () => ed.taskEdit('when'),
    taskToday: () => ed.taskEdit('today'),
    bold: () => ed.wrap('**', '**', 'bold'),
    italic: () => ed.wrap('*', '*', 'italic'),
    strike: () => ed.wrap('~~', '~~', 'text'),
    code: () => ed.wrap('`', '`', 'code'),
    h1: () => ed.prefixLines('# '),
    h2: () => ed.prefixLines('## '),
    h3: () => ed.prefixLines('### '),
    h4: () => ed.prefixLines('#### '),
    h5: () => ed.prefixLines('##### '),
    mdlink: () => ed.insertLink(),
    quote: () => ed.prefixLines('> '),
    wikilink: () => ed.wrap('[[', ']]'),
    link: () => ed.insertLink(),
    math: () => ed.wrap('$', '$', 'x^2'),
    table: () => ed.insert('\n\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n\n'),
    date: () => ed.insert(today()),
    time: () => ed.insert(timeNow()),
  }
  actions[kind]?.()
}

export function NoteView({ note, slot = 'main' }: { note: Note; slot?: 'main' | 'side' }) {
  const isSide = slot === 'side'
  const split = useStore((s) => !!s.side)
  const activePane = useStore((s) => s.activePane)
  const mode = useStore((s) => s.mode)
  const width = useStore((s) => s.width)
  const settings = useStore((s) => s.settings)
  const pane = useStore((s) => s.pane)
  const dirty = useStore((s) => s.dirty)
  const editor = useRef<EditorHandle>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(note.title)
  const isCanvas = note.view === 'canvas'
  const isDaily = note.type === 'daily' && isYmd(note.title)
  const { page, canvas } = useMemo(() => splitContent(note.content), [note.content])
  const fresh = useRef(note.title.startsWith('Untitled'))
  // An empty note has nothing to read, so it opens ready for writing.
  useEffect(() => {
    if (!page.trim() && !isCanvas && useStore.getState().mode === 'read') setPref('mode', 'edit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => setTitle(note.title), [note.title])
  useEffect(() => {
    if (fresh.current && !isCanvas) {
      titleInput.current?.focus()
      titleInput.current?.select()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The outline in the side pane asks the note to scroll to a heading.
  useEffect(() => {
    const onLine = (e: Event) => {
      if (useStore.getState().activePane !== slot) return
      const line = (e as CustomEvent<number>).detail
      const heading = scroller.current?.querySelector(`.md [data-line="${line}"]`)
      if (heading && mode === 'read') heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else editor.current?.scrollToLine(line)
    }
    // List shortcuts and commands are app-level, so they reach the editor as an event.
    const onFormat = (e: Event) => {
      const ed = editor.current
      if (!ed || useStore.getState().activePane !== slot) return
      applyFormat(ed, (e as CustomEvent<string>).detail)
    }
    window.addEventListener('margin:line', onLine)
    window.addEventListener('margin:format', onFormat)
    return () => {
      window.removeEventListener('margin:line', onLine)
      window.removeEventListener('margin:format', onFormat)
    }
  }, [mode])

  // Opened from a search result: go to the first place the search text appears.
  const jump = useStore((s) => s.jump)
  useEffect(() => {
    if (!jump || jump.id !== note.id || (jump.pane && jump.pane !== slot)) return
    const caret = !!jump.caret
    useStore.setState({ jump: null })
    if (isCanvas) return
    const lower = page.toLowerCase()
    let at = jump.query ? lower.indexOf(jump.query.toLowerCase()) : -1
    let length = jump.query.length
    if (at < 0) {
      for (const term of jump.terms) {
        const i = lower.indexOf(term.toLowerCase())
        if (i >= 0 && (at < 0 || i < at)) {
          at = i
          length = term.length
        }
      }
    }
    if (at < 0) return
    const needle = page.slice(at, at + length)
    // A short delay rather than the next frame: frames do not run while the window is hidden.
    setTimeout(() => {
      if (editor.current) return editor.current.reveal(caret ? at + length : at, at + length)
      // Read-only view: find the same text in the rendered page and select it.
      const root = scroller.current?.querySelector('.reading')
      if (!root) return
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const i = (node.textContent || '').toLowerCase().indexOf(needle.toLowerCase())
        if (i < 0) continue
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + needle.length)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        node.parentElement?.scrollIntoView({ block: 'center' })
        break
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, note.id])

  const setPage = (next: string) => updateNote(note.id, { content: joinContent(next, canvas) })
  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== note.title) updateNote(note.id, { title: t })
    else setTitle(note.title)
  }

  const more = (e: React.MouseEvent) => {
    const anchor = e.currentTarget.getBoundingClientRect()
    openMenu(e, [
      { label: note.pinned ? 'Unpin' : 'Pin', icon: <Pin size={15} />, onSelect: () => updateNote(note.id, { pinned: !note.pinned }) },
      { label: 'Version history', icon: <History size={15} />, hint: hint('history'), onSelect: () => ui({ historyFor: note.id }) },
      { label: 'Move to notebook…', icon: <FolderInput size={15} />, hint: hint('move'), onSelect: () => ui({ palette: { mode: 'move', noteId: note.id } }) },
      ...(isSide ? [] : [{ label: 'Open to the side', icon: <Columns2 size={15} />, hint: hint('side'), onSelect: () => openSide(note.id) }]),
      { label: 'Duplicate', icon: <Copy size={15} />, onSelect: () => duplicateNote(note.id) },
      {
        label: 'Page width…',
        icon: <MoveHorizontal size={15} />,
        onSelect: () => ui({ menu: { x: anchor.right, y: anchor.bottom + 6, alignRight: true, items: pageWidthMenu() } }),
      },
      { separator: true },
      { label: 'Move to trash', icon: <Trash2 size={15} />, danger: true, onSelect: () => deleteNote(note.id) },
    ])
  }

  const modes: [Mode, React.ReactNode, string][] = [
    ['edit', <PenLine size={15} />, 'Write (live preview)'],
    ['source', <Code2 size={15} />, 'Markdown source'],
    ['read', <BookOpen size={15} />, 'Read'],
  ]

  return (
    <div
      className={cx('note', isSide && 'side', split && activePane === slot && 'active-pane')}
      data-pane={slot}
      onMouseDownCapture={() => setActivePane(slot)}
      onFocusCapture={() => setActivePane(slot)}
    >
      <header className="note-bar">
        <div className="crumbs">
          <button
            className="crumb"
            title={note.folder ? 'Open notebook' : 'Move to a notebook'}
            onClick={() => (note.folder ? go({ name: 'folder', path: note.folder }) : ui({ palette: { mode: 'move', noteId: note.id } }))}
          >
            <Folder size={14} />
            {note.folder ? note.folder.split('/').join(' / ') : 'No notebook'}
          </button>
          {(isCanvas || isSide) && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb current">{displayTitle(note)}</span>
            </>
          )}
        </div>
        {!isSide && <span className={cx('save-state', dirty && 'saving')}>{dirty ? 'Saving…' : 'Saved'}</span>}
        <div className="seg" role="tablist" aria-label="View">
          <button className={cx(!isCanvas && 'on')} onClick={() => updateNote(note.id, { view: '' })} title="Page">
            <FileText size={15} /> Page
            {isCanvas && page.trim() && <i className="dot" />}
          </button>
          <button className={cx(isCanvas && 'on')} onClick={() => updateNote(note.id, { view: 'canvas' })} title="Canvas">
            <LayoutDashboard size={15} /> Canvas
            {!isCanvas && canvas.trim() && <i className="dot" />}
          </button>
        </div>
        {!isCanvas && (
          <div className="seg icons" aria-label="Mode">
            {modes.map(([m, icon, label]) => (
              <button key={m} className={cx(mode === m && 'on')} onClick={() => setPref('mode', m)} title={`${label}${m !== 'source' ? `  ${hint('mode')}` : ''}`}>
                {icon}
              </button>
            ))}
          </div>
        )}
        {isSide ? (
          <div className="bar-actions">
            {!isCanvas && (
              <button className="icon-btn" title={`Jump to a heading  ${hint('outline')}`} onClick={() => ui({ palette: { mode: 'outline', noteId: note.id } })}>
                <ListTree size={16} />
              </button>
            )}
            <button className="icon-btn" title="Swap the two panes" onClick={() => swapPanes()}>
              <ArrowLeftRight size={16} />
            </button>
            <button className="icon-btn" title="More" onClick={more}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        ) : (
          <div className="bar-actions">
            <button className={cx('icon-btn', note.pinned && 'active')} title={note.pinned ? 'Unpin' : 'Pin'} onClick={() => updateNote(note.id, { pinned: !note.pinned })}>
              <Pin size={16} fill={note.pinned ? 'currentColor' : 'none'} />
            </button>
            {!isCanvas && (
              <button className="icon-btn" title={`Jump to a heading  ${hint('outline')}`} onClick={() => ui({ palette: { mode: 'outline', noteId: note.id } })}>
                <ListTree size={16} />
              </button>
            )}
            <button className="icon-btn" title="Version history" onClick={() => ui({ historyFor: note.id })}>
              <History size={16} />
            </button>
            <button className="icon-btn" title="Export" onClick={(e) => openMenu(e, exportItems(note))}>
              <Download size={16} />
            </button>
            <button className={cx('icon-btn', pane && 'active')} title={`Backlinks and outline  ${hint('pane')}`} onClick={() => setPref('pane', !pane)}>
              <PanelRight size={16} />
            </button>
            <button className="icon-btn" title="More" onClick={more}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        )}
      </header>

      <div className="note-body">
        {isCanvas ? (
          <>
            <CanvasView key={note.id} note={note} />
            {isDaily && (
              <div className="day-tasks-float">
                <DayTasks note={note} floating />
              </div>
            )}
          </>
        ) : (
          <div className="note-scroll" ref={scroller}>
            <div className="doc" style={{ maxWidth: width ? Math.round(width * charWidth(mode === 'source', settings)) + 144 : 'none' }}>
              {isDaily ? (
                <div className="daily-head">
                  <div className="daily-nav">
                    <button className="icon-btn sm" title="Previous day" onClick={() => openDaily(addDays(note.title, -1))}>
                      <ChevronLeft size={16} />
                    </button>
                    <button className="btn ghost sm" onClick={() => go({ name: 'calendar' })}>
                      <CalendarDays size={14} /> {dailyLabel(note.title)}
                    </button>
                    <button className="icon-btn sm" title="Next day" onClick={() => openDaily(addDays(note.title, 1))}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <h1 className="title static">{displayTitle(note)}</h1>
                </div>
              ) : (
                <input
                  ref={titleInput}
                  className="title"
                  value={title}
                  placeholder="Untitled"
                  spellCheck={false}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      if (editor.current) editor.current.focus()
                      else (e.target as HTMLInputElement).blur()
                    }
                  }}
                />
              )}
              <Strip note={note} />
              <Tags note={note} />
              {isDaily && <DayTasks note={note} />}
              {mode !== 'read' && settings.toolbar && <Toolbar editor={editor} />}
              <div className={`doc-body mode-${mode}`}>
                {mode !== 'read' && (
                  <Editor
                    key={`${note.id}:${mode}:${settings.spellcheck}:${settings.autoPair}:${settings.lineNumbers}`}
                    live={mode === 'edit'}
                    spellcheck={settings.spellcheck}
                    autoPair={settings.autoPair}
                    lineNumbers={settings.lineNumbers}
                    ref={editor} value={page} onChange={setPage} onFollowLink={(target, other) => followLink(target, isSide ? !other : other)} autoFocus={!fresh.current} />
                )}
                {mode === 'read' && (
                  <div className="reading" onDoubleClick={() => setPref('mode', 'edit')}>
                    {page.trim() ? (
                      <Preview source={page} onChange={setPage} />
                    ) : (
                      <p className="empty-hint">Nothing here yet. Press {hint('mode')} to start writing.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {pane && !isSide && <RightPane note={note} />}
      </div>
    </div>
  )
}
