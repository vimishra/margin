// The Triage view: the triage note (written by the owner's own program from mail, chat and the bug tracker) shown
// as runs, categories and groups of suggested tasks. Read-only for now: it shows the newest run, filters it, opens
// links, and follows the note as the program rewrites it. Acting on tasks comes later; lib/triage.ts reads the note.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, CalendarDays, ChevronDown, ChevronRight, ExternalLink, FileText, FolderInput, History, ListFilter, Search, SquareCheck, SquareX } from 'lucide-react'
import { go, openDatePicker, openMenu, openNote, openNoteAt, triageNote, ui, useStore, type MenuItem } from '../store'
import { destinationOf, moveByRules, moveCategory, triageAct } from '../triage'
import { GROUP_ORDER, parseTriage, runTasks, triageCounts, type GroupKind, type TriageCategory, type TriageRun, type TriageTask } from '../lib/triage'
import { renderInline } from '../lib/markdown'
import { shortDate } from '../lib/tasks'
import { cx, local, tagStyle, today } from '../lib/util'

const KINDS: [GroupKind | '', string][] = [
  ['', 'All kinds'],
  ['quick', 'Quick'],
  ['action', 'Action'],
  ['other', 'Other'],
]

/** Open a task's link in the browser (in the desktop app, the system's browser). */
const openLink = (url: string) => window.open(url, '_blank', 'noopener')

/** The words the free-text filter looks in. */
const haystack = (t: TriageTask) => [t.title, t.category, t.groupLabel, ...t.tags.map((x) => '#' + x), ...t.links.map((l) => l.label), ...t.details].join(' ').toLowerCase()

/** Complete an open task, or reopen a finished one (the box, Space or X). */
const toggleDone = (t: TriageTask) => void triageAct(t, t.state === 'open' ? { kind: 'complete' } : { kind: 'reopen' })
/** Pick a note to move a task into (⇧M, or M when no rule decides). */
const moveTo = (t: TriageTask) => ui({ palette: { mode: 'triageMove', triageTask: t } })

/** Drop an open or done task, or reopen a dropped one (C). */
const toggleDrop = (t: TriageTask) => void triageAct(t, t.state === 'dropped' ? { kind: 'reopen' } : { kind: 'drop' })

/** The calendar for a task's planned day (with Someday) or due date, under the element given. */
function pickDate(anchor: Element, t: TriageTask, field: 'planned' | 'due') {
  const planning = field === 'planned'
  openDatePicker({ currentTarget: anchor }, {
    title: planning ? 'When' : 'Due date',
    value: planning ? t.planned : t.due,
    removeLabel: !planning ? 'Remove due date' : t.someday ? 'Take out of Someday' : 'Remove planned day',
    someday: planning ? (t.someday ? 'on' : 'off') : undefined,
    onPick: (date) => void triageAct(t, planning ? (date === 'someday' ? { kind: 'planned', date: null, someday: true } : { kind: 'planned', date }) : { kind: 'due', date }),
  })
}

/** The right-click menu of a task: everything its keys do. Earlier runs offer only opening. */
function triageMenu(t: TriageTask, row: Element, readOnly: boolean, noteId: string | undefined): MenuItem[] {
  const acts: MenuItem[] = readOnly
    ? []
    : [
        t.state === 'open'
          ? { label: 'Complete', hint: 'Space', icon: <SquareCheck size={14} />, onSelect: () => toggleDone(t) }
          : { label: 'Reopen', hint: t.state === 'dropped' ? 'C' : 'Space', icon: <SquareCheck size={14} />, onSelect: () => void triageAct(t, { kind: 'reopen' }) },
        ...(t.state === 'dropped' ? [] : [{ label: 'Drop', hint: 'C', icon: <SquareX size={14} />, onSelect: () => toggleDrop(t) }]),
        { separator: true },
        { label: 'When…', hint: 'S', icon: <CalendarClock size={14} />, onSelect: () => pickDate(row, t, 'planned') },
        { label: 'Due date…', hint: 'D', icon: <CalendarDays size={14} />, onSelect: () => pickDate(row, t, 'due') },
        ...(() => {
          const dest = destinationOf(t)
          return dest
            ? [
                { label: `Move to ${dest.note.title}`, hint: 'M', icon: <FolderInput size={14} />, onSelect: () => moveByRules(t) },
                { label: 'Move to another note…', hint: '⇧M', onSelect: () => moveTo(t) },
              ]
            : [{ label: 'Move to a note…', hint: 'M', icon: <FolderInput size={14} />, onSelect: () => moveTo(t) }]
        })(),
        { separator: true },
      ]
  return [
    ...acts,
    ...t.links.map((l, i) => ({ label: `Open ${l.label}`, hint: i === 0 ? 'O' : undefined, icon: <ExternalLink size={14} />, onSelect: () => openLink(l.url) })),
    ...(noteId ? [{ label: 'Show in the triage note', icon: <FileText size={14} />, onSelect: () => openNoteAt(noteId, t.rawLines[0].replace(/\r$/, ''), [], true) }] : []),
  ]
}

export function TriageView() {
  const path = useStore((s) => s.triage.note)
  const notes = useStore((s) => s.notes)
  const note = useMemo(() => (path ? triageNote() : undefined), [path, notes])
  const doc = useMemo(() => (note ? parseTriage(note.content) : null), [note])

  // What the view keeps on this computer: the toggles, folded categories and summary, and the filters.
  const [showClosed, setShowClosed] = useState(() => local.get('triage.showClosed', false))
  const [showOlder, setShowOlder] = useState(() => local.get('triage.showOlder', false))
  const [folded, setFolded] = useState<string[]>(() => local.get('triage.folded', []))
  const [summaryOpen, setSummaryOpen] = useState(() => local.get('triage.summaryOpen', true))
  const [category, setCategory] = useState(() => local.get('triage.category', ''))
  const [kind, setKind] = useState<GroupKind | ''>(() => local.get('triage.kind', ''))
  const [priority, setPriority] = useState(() => local.get('triage.priority', 0))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const input = useRef<HTMLInputElement>(null)
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => local.set('triage.showClosed', showClosed), [showClosed])
  useEffect(() => local.set('triage.showOlder', showOlder), [showOlder])
  useEffect(() => local.set('triage.folded', folded), [folded])
  useEffect(() => local.set('triage.summaryOpen', summaryOpen), [summaryOpen])
  useEffect(() => local.set('triage.category', category), [category])
  useEffect(() => local.set('triage.kind', kind), [kind])
  useEffect(() => local.set('triage.priority', priority), [priority])
  useEffect(() => page.current?.focus(), [])

  const newest = doc?.runs[0]
  const runs = doc ? (showOlder ? doc.runs : doc.runs.slice(0, 1)) : []
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const keep = (t: TriageTask) =>
    (showClosed || t.state === 'open') &&
    (!category || t.category === category) &&
    (!kind || t.group === kind) &&
    (!priority || (t.priority > 0 && t.priority <= priority)) &&
    words.every((w) => haystack(t).includes(w))
  // The rows on screen, in order, for the keys.
  const visible = runs.flatMap((r) => r.categories.filter((c) => !folded.includes(foldKey(r, c, newest))).flatMap((c) => GROUP_ORDER.flatMap((k) => c.groups.filter((g) => g.kind === k).flatMap((g) => g.tasks.filter(keep)))))
  const counts = newest ? triageCounts(runTasks(newest)) : { open: 0, done: 0, dropped: 0 }
  const categories = newest ? [...new Set(newest.categories.map((c) => c.name))] : []

  // Keep a selected task selected through a rewrite of the note. When it leaves the list (completed, dropped),
  // the one that took its place is selected, so you can go on down the list.
  const lastIds = useRef<string[]>([])
  useEffect(() => {
    const ids = visible.map((t) => t.id)
    if (!ids.includes(selected)) {
      const was = lastIds.current.indexOf(selected)
      setSelected(ids[Math.min(Math.max(was, 0), ids.length - 1)] ?? '')
    }
    lastIds.current = ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((t) => t.id).join('\n')])

  const move = (by: number) => {
    const i = Math.max(0, visible.findIndex((t) => t.id === selected))
    const next = visible[Math.min(visible.length - 1, Math.max(0, i + by))]
    if (next) {
      setSelected(next.id)
      page.current?.querySelector(`[data-triage="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }
  const rowEl = (t: TriageTask) => page.current?.querySelector(`[data-triage="${CSS.escape(t.id)}"]`) ?? page.current!
  const toggleExpanded = (id: string) => setExpanded((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, select, textarea')) {
      if (e.key === 'Escape' || (e.key === 'ArrowDown' && e.target === input.current) || (e.key === 'Enter' && e.target === input.current)) {
        e.preventDefault()
        page.current?.focus()
      }
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const task = visible.find((t) => t.id === selected)
    if (e.key === '/') (e.preventDefault(), input.current?.focus())
    else if (e.key === 'ArrowDown' || e.key === 'j') (e.preventDefault(), move(1))
    else if (e.key === 'ArrowUp' || e.key === 'k') (e.preventDefault(), move(-1))
    else if (e.key === 'Home') (e.preventDefault(), move(-visible.length))
    else if (e.key === 'End') (e.preventDefault(), move(visible.length))
    else if (task && e.key === 'Enter') (e.preventDefault(), toggleExpanded(task.id))
    else if (task && e.key === 'o' && task.links[0]) (e.preventDefault(), openLink(task.links[0].url))
    // Actions: only on the newest run; earlier runs are history.
    else if (!task || task.run !== newest?.label) return
    else if (e.key === ' ' || e.key === 'x') (e.preventDefault(), toggleDone(task))
    else if (e.key === 'c') (e.preventDefault(), toggleDrop(task))
    else if (e.key === 's') (e.preventDefault(), pickDate(rowEl(task), task, 'planned'))
    else if (e.key === 'd') (e.preventDefault(), pickDate(rowEl(task), task, 'due'))
    else if (e.key === 'M' || (e.key === 'm' && e.shiftKey)) (e.preventDefault(), moveTo(task))
    else if (e.key === 'm') (e.preventDefault(), moveByRules(task))
    else if (e.key === 'a') {
      // Move all: every open task of the selected task's category, in the newest run.
      e.preventDefault()
      const cat = newest?.categories.find((c) => c.name === task.category)
      if (cat) moveCategory(cat.groups.flatMap((g) => g.tasks))
    }
  }

  const header = (
    <header className="list-head">
      <span className="list-icon">
        <ListFilter size={20} />
      </span>
      <div className="list-title">
        <h1>Triage</h1>
        <p>{newest ? `${newest.label ? newest.label + ' · ' : ''}${counts.open} open · ${counts.done} done · ${counts.dropped} dropped` : 'Suggested tasks from your triage note'}</p>
      </div>
      {note && (
        <button className="btn triage-open-note" title="Open the triage note itself" onClick={() => openNote(note.id)}>
          <FileText size={15} /> Open the note
        </button>
      )}
    </header>
  )

  // Nothing to show: say why, calmly.
  const empty = (title: string, text: string, action?: [string, () => void]) => (
    <div ref={page} className="page" tabIndex={-1}>
      <div className="page-inner list tasks triage">
        {header}
        <div className="empty-state">
          <h3>{title}</h3>
          <p>{text}</p>
          {action && (
            <button className="btn" onClick={action[1]}>
              {action[0]}
            </button>
          )}
        </div>
      </div>
    </div>
  )
  if (!path) return empty('No triage note set', 'Tell Margin which note your triage program writes, in Settings → Triage.', ['Open Settings', () => ui({ prefs: true })])
  if (!note) return empty('No triage note yet', `There is no note at “${path}” yet. It shows here as soon as your triage program writes it.`, ['Open Settings', () => ui({ prefs: true })])
  if (!doc?.runs.length) return empty('Nothing to triage', 'The triage note has no runs in it yet, or they are not in the expected layout (“## Triage …” headings). Open the note to look.', ['Open the note', () => openNote(note.id)])

  const foldToggle = (key: string) => setFolded((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]))
  const now = today()

  return (
    <div ref={page} className="page" tabIndex={-1} onKeyDown={onKey}>
      <div className="page-inner list tasks triage">
        {header}

        {newest!.summary.length > 0 && (
          <section className="triage-summary">
            <button className="triage-fold" onClick={() => setSummaryOpen(!summaryOpen)} aria-expanded={summaryOpen}>
              {summaryOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Summary
            </button>
            {summaryOpen && (
              <ul>
                {newest!.summary.map((s, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(s) }} />
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="list-tools">
          <label className="filter">
            <Search size={15} />
            <input ref={input} value={query} placeholder="Narrow down: words, #tag, mail…  /" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select className="set-select sm" value={category} onChange={(e) => setCategory(e.target.value)} title="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c || 'Uncategorised'}
              </option>
            ))}
          </select>
          <select className="set-select sm" value={kind} onChange={(e) => setKind(e.target.value as GroupKind | '')} title="Kind">
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select className="set-select sm" value={priority} onChange={(e) => setPriority(Number(e.target.value))} title="Priority">
            <option value={0}>Any priority</option>
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {p === 1 ? 'P1' : `P${p} or higher`}
              </option>
            ))}
          </select>
          <div className="seg sm">
            <button className={cx(showClosed && 'on')} title="Also show tasks marked done or dropped" onClick={() => setShowClosed(!showClosed)}>
              Done &amp; dropped
            </button>
            <button className={cx(showOlder && 'on')} title="Also show earlier runs, read-only" onClick={() => setShowOlder(!showOlder)}>
              Older runs
            </button>
          </div>
        </div>

        {runs.map((run, ri) => (
          <section key={run.line} className={cx('triage-run', ri > 0 && 'older')}>
            {ri > 0 && <h2 className="triage-run-head">Earlier run: {run.label}</h2>}
            {run.categories.map((c) => {
              const key = foldKey(run, c, newest)
              const shown = GROUP_ORDER.flatMap((k) => c.groups.filter((g) => g.kind === k)).map((g) => ({ g, tasks: g.tasks.filter(keep) })).filter((x) => x.tasks.length)
              const info = c.groups.filter((g) => g.kind === 'fyi').flatMap((g) => g.info)
              const open = c.groups.flatMap((g) => g.tasks).filter((t) => t.state === 'open').length
              if (!shown.length && !(info.length && !category && !kind && !priority && !words.length)) return null
              const isFolded = folded.includes(key)
              return (
                <div key={key} className="task-group triage-category">
                  <div className="triage-category-head">
                    <button className="task-group-head" onClick={() => foldToggle(key)} aria-expanded={!isFolded}>
                      {isFolded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <span>{c.name || 'Uncategorised'}</span>
                      <span className="count">{open}</span>
                    </button>
                    {ri === 0 && open > 0 && (
                      <button className="btn sm triage-move-all" title="Move every open task of this category where your rules send it, as one step with one Undo  A" onClick={() => moveCategory(c.groups.flatMap((g) => g.tasks))}>
                        <FolderInput size={13} /> Move all
                      </button>
                    )}
                  </div>
                  {!isFolded && (
                    <>
                      {shown.map(({ g, tasks }) => (
                        <Fragment key={`${g.kind}:${g.label}`}>
                          {g.label && <h4 className="triage-group">{g.label}</h4>}
                          {tasks.map((t) => (
                            <TriageRow key={t.id} task={t} now={now} readOnly={ri > 0} noteId={note.id} active={t.id === selected} open={expanded.has(t.id)} onSelect={() => setSelected(t.id)} onToggle={() => (setSelected(t.id), toggleExpanded(t.id))} />
                          ))}
                        </Fragment>
                      ))}
                      {info.length > 0 && <Fyi lines={info} folded={!folded.includes(`${key}:fyi:open`)} onToggle={() => foldToggle(`${key}:fyi:open`)} />}
                    </>
                  )}
                </div>
              )
            })}
          </section>
        ))}
        {!visible.length && <p className="empty-hint">{counts.open ? 'No tasks match.' : 'Nothing open: everything in this run is done, dropped or moved.'}</p>}
        <div className="tasks-keys">
          <kbd>↑</kbd>
          <kbd>↓</kbd> move · <kbd>Space</kbd> complete · <kbd>C</kbd> drop · <kbd>S</kbd> when · <kbd>D</kbd> due · <kbd>M</kbd> move · <kbd>⇧M</kbd> move to another note · <kbd>A</kbd> move all in the category · <kbd>↵</kbd> details · <kbd>O</kbd> open link · <kbd>/</kbd> narrow down
        </div>
      </div>
    </div>
  )
}

/**
 * What a folded category is remembered by: in the newest run its name alone, so it stays folded when the program
 * writes a new run; in older runs, the run too.
 */
function foldKey(run: TriageRun, c: TriageCategory, newest: TriageRun | undefined) {
  return `${run === newest ? '' : run.label}\u0000${c.name || '\u0001'}`
}

function Fyi({ lines, folded, onToggle }: { lines: string[]; folded: boolean; onToggle: () => void }) {
  return (
    <div className="triage-fyi">
      <button className="triage-fold" onClick={onToggle} aria-expanded={!folded}>
        {folded ? <ChevronRight size={13} /> : <ChevronDown size={13} />} FYI <span className="count">{lines.length}</span>
      </button>
      {!folded && (
        <ul>
          {lines.map((l, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(l) }} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TriageRow({ task: t, now, readOnly, noteId, active, open, onSelect, onToggle }: { task: TriageTask; now: string; readOnly: boolean; noteId: string; active: boolean; open: boolean; onSelect: () => void; onToggle: () => void }) {
  const title = useMemo(() => renderInline(t.title), [t.title])
  const triageCfg = useStore((s) => s.triage)
  const notesCount = useStore((s) => Object.keys(s.notes).length)
  // Where M sends it, for the button's tooltip and a hint in the row.
  const dest = useMemo(() => (readOnly ? null : destinationOf(t)), [t, triageCfg, notesCount, readOnly])
  return (
    <div
      data-triage={t.id}
      className={cx('task', 'triage-task', t.state !== 'open' && 'done', t.state === 'dropped' && 'cancelled', `pri-${t.priority > 3 ? 0 : t.priority ? 4 - t.priority : 0}`, active && 'active', open && 'expanded')}
      onMouseMove={onSelect}
      onContextMenu={(e) => (onSelect(), openMenu(e, triageMenu(t, e.currentTarget, readOnly, noteId)))}
    >
      <input
        type="checkbox"
        className={t.state === 'dropped' ? 'box-cancelled' : undefined}
        checked={t.state !== 'open'}
        disabled={readOnly}
        readOnly={readOnly}
        title={readOnly ? 'An earlier run: shown as it was' : t.state === 'open' ? 'Complete' : t.state === 'done' ? 'Done. Click to reopen.' : 'Dropped. Click to reopen.'}
        onChange={() => toggleDone(t)}
      />
      <div className="task-main" onClick={(e) => !(e.target as HTMLElement).closest('a, button') && onToggle()} title={open ? 'Hide details' : 'Show details'}>
        <span className={cx('task-text', !open && 'one-line')}>
          {t.priority > 0 && <b className={cx('task-pri', `triage-p${t.priority}`)}>P{t.priority}</b>}
          <span dangerouslySetInnerHTML={{ __html: title }} />
        </span>
        <span className="task-meta">
          {t.links.map((l, i) => (
            <button key={i} className="task-chip triage-link" title={l.url} onClick={() => openLink(l.url)}>
              <ExternalLink size={12} /> {l.label}
            </button>
          ))}
          {t.planned && (
            <span className={cx('task-chip', t.planned <= now && t.state === 'open' && 'now')}>
              <CalendarClock size={12} /> {shortDate(t.planned)}
            </span>
          )}
          {t.someday && <span className="task-chip someday">Someday</span>}
          {t.due && (
            <span className={cx('task-chip due', t.state === 'open' && t.due < now && 'late', t.due === now && 'now')}>
              <CalendarDays size={12} /> Due {shortDate(t.due)}
            </span>
          )}
          {t.tags.map((tag) => (
            <a key={tag} className="hashtag" style={tagStyle(tag)} onClick={(e) => (e.preventDefault(), go({ name: 'tag', tag }))} href={`#/tag/${encodeURIComponent(tag)}`}>
              #{tag}
            </a>
          ))}
          {dest && t.state === 'open' && (
            <span className="task-chip triage-dest" title={`M moves it to ${dest.note.title}, by ${dest.reason}`}>
              <FolderInput size={12} /> {dest.note.title}
            </span>
          )}
          {t.carriedFrom && (
            <span className="task-chip triage-carried" title={`Carried over from the run of ${t.carriedFrom}`}>
              <History size={12} /> carried
            </span>
          )}
        </span>
        {open && (
          <div className="task-notes md triage-details">
            {t.details.length > 0 && (
              <ul>
                {t.details.map((d, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: renderInline(d) }} />
                ))}
              </ul>
            )}
            {t.links.map((l, i) => (
              <p key={i} className="triage-url">
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}: {l.url}
                </a>
              </p>
            ))}
            {t.carriedFrom && <p className="triage-url">Carried over from {t.carriedFrom}</p>}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="task-actions">
          <button className={cx('icon-btn sm', t.state === 'dropped' && 'active')} title={t.state === 'dropped' ? 'Reopen  C' : 'Drop: not doing it  C'} onClick={(e) => (e.stopPropagation(), toggleDrop(t))}>
            <SquareX size={14} />
          </button>
          <button className={cx('icon-btn sm', (t.planned || t.someday) && 'active')} title="When: plan for a day, or Someday  S" onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, t, 'planned'))}>
            <CalendarClock size={14} />
          </button>
          <button className={cx('icon-btn sm', t.due && 'active')} title="Due date  D" onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, t, 'due'))}>
            <CalendarDays size={14} />
          </button>
          <button className="icon-btn sm" title={dest ? `Move to ${dest.note.title} (by ${dest.reason})  M` : 'Move to a note (a workstream, a project)  M'} onClick={(e) => (e.stopPropagation(), moveByRules(t))}>
            <FolderInput size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
