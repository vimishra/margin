import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, ExternalLink, LayoutDashboard } from 'lucide-react'
import type { Note } from '../types'
import { ensureDaily, openFromClick, setPref, updateNote, useStore } from '../store'
import { joinContent, splitContent } from '../lib/canvas'
import { cx, dailyLabel, isYmd, longDate, today } from '../lib/util'
import { Editor, type EditorHandle } from './Editor'
import { Preview, followLink } from './Preview'
import { applyFormat, charWidth } from './NoteView'
import { DayTasks } from './TasksView'

const STEP = 7

/** One day in the journal: its date, the tasks that fall on it, and the daily note, editable in place. */
const Day = memo(function Day({ note, focused, first, onFocus, handle }: { note: Note; focused: boolean; first: boolean; onFocus: (id: string) => void; handle: (id: string, ed: EditorHandle | null) => void }) {
  const mode = useStore((s) => s.mode)
  const settings = useStore((s) => s.settings)
  const { page, canvas } = useMemo(() => splitContent(note.content), [note.content])
  const setPage = (next: string) => updateNote(note.id, { content: joinContent(next, canvas) })
  const label = dailyLabel(note.title)
  const relative = /^(Today|Yesterday|Tomorrow)$/.test(label)
  return (
    // data-pane tells the editor whether app-level commands (search in note, formatting) are meant for it.
    <section className={cx('journal-day', focused && 'focused')} data-pane={focused ? 'main' : 'idle'} onFocusCapture={() => onFocus(note.id)} onMouseDownCapture={() => onFocus(note.id)}>
      <header>
        <button className="journal-date" title="Open this day on its own. ⌘-click opens it beside the journal." onClick={(e) => openFromClick(e, note.id)}>
          {relative && <span className="journal-rel">{label}</span>}
          {longDate(note.title)}
          <ExternalLink size={13} />
        </button>
        {canvas.trim() && (
          <button className="btn ghost sm" title="This day also has a canvas" onClick={() => (updateNote(note.id, { view: 'canvas' }), openFromClick({ metaKey: false, altKey: false, ctrlKey: false }, note.id))}>
            <LayoutDashboard size={13} /> Canvas
          </button>
        )}
      </header>
      <DayTasks note={note} />
      <div className={`doc-body mode-${mode}`}>
        {mode === 'read' ? (
          <div className="reading" onDoubleClick={() => setPref('mode', 'edit')}>
            {page.trim() ? <Preview source={page} onChange={setPage} /> : <p className="empty-hint">Nothing written this day.</p>}
          </div>
        ) : (
          <Editor
            key={`${note.id}:${mode}:${settings.spellcheck}:${settings.autoPair}:${settings.lineNumbers}`}
            ref={(ed) => handle(note.id, ed)}
            live={mode === 'edit'}
            spellcheck={settings.spellcheck}
            autoPair={settings.autoPair}
            lineNumbers={settings.lineNumbers}
            value={page}
            onChange={setPage}
            onFollowLink={(target, side) => followLink(target, side)}
            autoFocus={first}
          />
        )}
      </div>
    </section>
  )
})

/** Daily notes as one continuous page, newest first. Scrolling down loads earlier days. */
export function JournalView() {
  const notes = useStore((s) => s.notes)
  const mode = useStore((s) => s.mode)
  const width = useStore((s) => s.width)
  const settings = useStore((s) => s.settings)
  const [count, setCount] = useState(STEP)
  const [focused, setFocused] = useState('')
  const editors = useRef(new Map<string, EditorHandle>())
  const focusedRef = useRef('')
  const now = today()

  // Days that have a note, up to today. Days in the future are left to the calendar.
  const days = useMemo(
    () =>
      Object.values(notes)
        .filter((n) => n.type === 'daily' && isYmd(n.title) && n.title <= now)
        .sort((a, b) => b.title.localeCompare(a.title)),
    [notes, now],
  )

  // Today is always there to write in.
  useEffect(() => void ensureDaily(today()), [])

  // The day being written in is "the current note" for commands, and gets the formatting shortcuts.
  const onFocus = useRef((id: string) => {
    if (focusedRef.current === id) return
    focusedRef.current = id
    setFocused(id)
    useStore.setState({ journalNote: id, activePane: 'main' })
  }).current
  const handle = useRef((id: string, ed: EditorHandle | null) => {
    if (ed) editors.current.set(id, ed)
    else editors.current.delete(id)
  }).current
  useEffect(() => {
    const onFormat = (e: Event) => {
      const ed = editors.current.get(focusedRef.current)
      if (ed && useStore.getState().activePane === 'main') applyFormat(ed, (e as CustomEvent<string>).detail)
    }
    window.addEventListener('margin:format', onFormat)
    return () => {
      window.removeEventListener('margin:format', onFormat)
      useStore.setState({ journalNote: null })
    }
  }, [])

  // Load earlier days as the end of the page comes near.
  const scroller = useRef<HTMLDivElement>(null)
  const total = days.length
  const loadMore = () => {
    const el = scroller.current
    if (el && el.scrollTop + el.clientHeight > el.scrollHeight - 900) setCount((c) => (c < total ? c + STEP : c))
  }
  // A short journal may not fill the window: keep adding days until it does, or until they run out.
  useEffect(loadMore, [count, total])

  const shown = days.slice(0, count)
  return (
    <div className="note journal">
      <div className="note-scroll" ref={scroller} onScroll={loadMore}>
        <div className="doc" style={{ maxWidth: width ? Math.round(width * charWidth(mode === 'source', settings)) + 112 : 'none' }}>
          <header className="journal-head">
            <BookOpenText size={18} />
            <h1>Journal</h1>
            <span>
              {days.length} day{days.length === 1 ? '' : 's'}
            </span>
          </header>
          {shown.map((n, i) => (
            <Day key={n.id} note={n} focused={focused === n.id} first={i === 0} onFocus={onFocus} handle={handle} />
          ))}
          {days.length > count ? (
            <div className="journal-more">
              <button className="btn ghost sm" onClick={() => setCount((c) => c + STEP)}>
                Show earlier days
              </button>
            </div>
          ) : (
            <p className="journal-end">{days.length ? 'That is the first day of your journal.' : 'Your journal starts today.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
