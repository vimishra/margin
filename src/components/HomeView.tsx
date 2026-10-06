import { useMemo, useState } from 'react'
import { ArrowRight, BookMarked, CalendarCheck, FilePlus2, Hourglass, LayoutDashboard, Pin, Zap, Users } from 'lucide-react'
import type { Note } from '../types'
import { captureText, findDaily, go, newNote, openDaily, openMenu, openNote, useStore, newMeeting, openFromClick } from '../store'
import { parseCanvas, splitContent } from '../lib/canvas'
import { ALT, cx, displayTitle, expiresIn, longDate, relTime, snippet, today } from '../lib/util'
import { NoteIcon, noteMenu } from './bits'
import { hint } from '../shortcuts'

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Card({ note, meta }: { note: Note; meta?: React.ReactNode }) {
  return (
    <button className="note-card" onClick={(e) => openFromClick(e, note.id)} onContextMenu={(e) => openMenu(e, noteMenu(note))}>
      <span className="note-card-head">
        <NoteIcon note={note} size={15} />
        <span className="note-card-title">{displayTitle(note)}</span>
      </span>
      <span className="note-card-text">{snippet(note.content, 110) || 'Empty note'}</span>
      <span className="note-card-meta">{meta ?? (note.folder || 'No notebook')}</span>
    </button>
  )
}

function Row({ note, meta }: { note: Note; meta: React.ReactNode }) {
  return (
    <button className="mini-row" onClick={(e) => openFromClick(e, note.id)} onContextMenu={(e) => openMenu(e, noteMenu(note))}>
      <NoteIcon note={note} size={15} />
      <span className="mini-title">{displayTitle(note)}</span>
      <span className="mini-meta">{meta}</span>
    </button>
  )
}

export function HomeView() {
  const notes = useStore((s) => s.notes)
  const recent = useStore((s) => s.recent)
  const folders = useStore((s) => s.folders)
  const [text, setText] = useState('')
  const list = useMemo(() => Object.values(notes), [notes])
  const daily = findDaily(today())

  const pinned = list.filter((n) => n.pinned)
  const recents = useMemo(() => {
    const opened = recent.map((id) => notes[id]).filter(Boolean)
    const rest = list.filter((n) => !recent.includes(n.id)).sort((a, b) => b.updated.localeCompare(a.updated))
    return [...opened, ...rest].slice(0, 8)
  }, [recent, notes, list])
  const scratch = list.filter((n) => n.type === 'scratch').sort((a, b) => (a.expires || '9').localeCompare(b.expires || '9'))
  const reading = list
    .filter((n) => n.type === 'article' && n.status !== 'done')
    .sort((a, b) => (a.status === 'reading' ? -1 : 1) - (b.status === 'reading' ? -1 : 1) || b.updated.localeCompare(a.updated))
  const dailyCards = daily ? parseCanvas(splitContent(daily.content).canvas).cards.length : 0

  // Sections switched off in the sidebar are left off Home too.
  const hidden = useStore((s) => s.settings.hiddenSections) || []
  const shown = (id: string) => !hidden.includes(id)
  const showReading = shown('research') && reading.length > 0
  const showScratch = shown('scratch') && scratch.length > 0
  type Action = [React.ReactNode, string, string, () => void]
  const actions: Action[] = [
    [<FilePlus2 size={16} />, 'New note', hint('new'), () => newNote('note')],
    [<CalendarCheck size={16} />, "Today's note", hint('daily'), () => openDaily()],
    ...(shown('scratch') ? [[<Hourglass size={16} />, 'Scratch note', hint('scratch'), () => newNote('scratch')] as Action] : []),
    [<Users size={16} />, 'Meeting note', hint('meeting'), () => void newMeeting()],
    ...(shown('research') ? [[<BookMarked size={16} />, 'Research note', '', () => newNote('article')] as Action] : []),
    [<LayoutDashboard size={16} />, 'Canvas', '', () => newNote('canvas')],
  ]

  return (
    <div className="page">
      <div className="page-inner home">
        <header className="home-head">
          <h1>{greeting()}</h1>
          <p>
            {longDate(today())} · {list.length} notes in {folders.length} notebooks
          </p>
        </header>

        <form
          className="home-capture"
          onSubmit={(e) => {
            e.preventDefault()
            captureText(text, 'daily')
            setText('')
          }}
        >
          <Zap size={17} />
          <input value={text} placeholder="Capture a thought into today's note…" onChange={(e) => setText(e.target.value)} />
          <kbd>↵</kbd>
        </form>

        <div className="home-actions">
          {actions.map(([icon, label, hint, run]) => (
            <button key={label} className="btn" onClick={run}>
              {icon} {label} {hint && <kbd>{hint}</kbd>}
            </button>
          ))}
        </div>

        <section>
          <h2>Today</h2>
          <button className="today-card" onClick={() => openDaily()}>
            <span className="today-date">
              <b>{new Date().getDate()}</b>
              {new Date().toLocaleDateString(undefined, { month: 'short' })}
            </span>
            <span className="today-body">
              <span className="today-title">{new Date().toLocaleDateString(undefined, { weekday: 'long' })}</span>
              <span className="today-text">
                {daily
                  ? snippet(daily.content, 150) || 'Your daily note is open and empty.'
                  : 'Start today’s daily note: a page and an infinite canvas for the day.'}
              </span>
            </span>
            <span className="today-meta">
              {dailyCards > 0 && `${dailyCards} card${dailyCards === 1 ? '' : 's'}`}
              <ArrowRight size={16} />
            </span>
          </button>
        </section>

        {pinned.length > 0 && (
          <section>
            <h2>
              <Pin size={14} /> Pinned
            </h2>
            <div className="card-grid">
              {pinned.map((n) => (
                <Card key={n.id} note={n} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2>
            Recent
            <button className="link" onClick={() => go({ name: 'all' })}>
              All notes
            </button>
          </h2>
          <div className="card-grid">
            {recents.map((n) => (
              <Card key={n.id} note={n} meta={`${n.folder || 'No notebook'} · ${relTime(n.updated)}`} />
            ))}
          </div>
        </section>

        <div className={cx('home-cols', (!showScratch || !showReading) && 'one')}>
          {showReading && (
            <section>
              <h2>
                Reading queue
                <button className="link" onClick={() => go({ name: 'research' })}>
                  Research
                </button>
              </h2>
              <div className="mini-list">
                {reading.slice(0, 6).map((n) => (
                  <Row key={n.id} note={n} meta={<span className={cx('status', n.status)}>{n.status || 'unread'}</span>} />
                ))}
              </div>
            </section>
          )}
          {showScratch && (
            <section>
              <h2>
                Scratch
                <button className="link" onClick={() => go({ name: 'scratch' })}>
                  All scratch
                </button>
              </h2>
              <div className="mini-list">
                {scratch.slice(0, 6).map((n) => (
                  <Row key={n.id} note={n} meta={expiresIn(n.expires)} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
