import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, Archive, BookmarkPlus, Box, CalendarClock, CalendarDays, Check, ChevronDown, ChevronRight, FileText, Flag, FolderInput, ListChecks, ListTree, MoreHorizontal, Search, Star, Users } from 'lucide-react'
import type { Note } from '../types'
import { deleteTaskView, go, openDatePicker, openFromClick, openMenu, openNoteAt, openSideAt, renameTaskView, rescheduleTasks, saveTaskView, ensureInboxNote, inboxNotebook, moveTasksToNote, ui, updateTask, updateTaskView, useStore, type MenuItem } from '../store'
import { hint } from '../shortcuts'
import { archiveEverywhere } from '../archive'
import { renderInline, renderMarkdown } from '../lib/markdown'
import { PRIORITIES, TASK_FILTERS, TASK_LINE, TASK_SOURCES, allTasks, byUrgency, isCarried, isOn, isOverdue, isToday, nextDate, priorityLabel, projectsOf, sameNotebook, selectTasks, shortDate, weekRange, withDetails, within, type ProjectFolders, type Task, type TaskFilter, type TaskGroup, type TaskSource, type TaskView } from '../lib/tasks'
import { addDays, cx, displayTitle, firstWeekday, local, today, tagStyle } from '../lib/util'

const weekStartOf = (setting: string) => (setting === 'sunday' ? 0 : setting === 'monday' ? 1 : firstWeekday())

const GROUPS: [TaskGroup, string][] = [
  ['date', 'Date'],
  ['note', 'Project'],
  ['priority', 'Priority'],
  ['none', 'None'],
]

/** Keys for the lists: 1 to 6 are the Things lists in order, then Overdue, This week, No date, and 0 for All open. */
const LIST_KEYS: Record<string, TaskFilter> = { '1': 'inbox', '2': 'today', '3': 'upcoming', '4': 'anytime', '5': 'someday', '6': 'done', '7': 'overdue', '8': 'week', '9': 'undated', '0': 'open' }
const keyOf = (f: TaskFilter) => Object.keys(LIST_KEYS).find((k) => LIST_KEYS[k] === f)

/** Choose a note to move a task into, as Things moves a to-do into a project. */
const moveToNote = (task: Task) => ui({ palette: { mode: 'moveTask', task } })

/** Open the calendar for a task's due date or planned day, under the element given. The planned day can also be Someday. */
function pickDate(anchor: Element, task: Task, field: 'due' | 'scheduled') {
  const planning = field === 'scheduled'
  openDatePicker({ currentTarget: anchor }, {
    title: planning ? 'When' : 'Due date',
    value: task[field],
    removeLabel: !planning ? 'Remove due date' : task.someday ? 'Take out of Someday' : 'Remove planned day',
    someday: planning ? (task.someday ? 'on' : 'off') : undefined,
    onPick: (date) => updateTask(task, { raw: withDetails(task.raw, planning && date === 'someday' ? { someday: true } : { [field]: date }) }),
  })
}

const priorityMenu = (task: Task): MenuItem[] =>
  [3, 2, 1, 0].map((p) => ({ label: p ? `${priorityLabel(p)}  ${PRIORITIES[p]}` : 'No priority', checked: task.priority === p, onSelect: () => updateTask(task, { raw: withDetails(task.raw, { priority: p }) }) }))

/**
 * A task's notes: the lines indented under it in its note, up to the first blank or less indented line, with the
 * common indent taken off. Tasks among them are left out, as they are listed on their own. Read from the note
 * each time, so they are whatever the note says now; nothing is stored apart from it.
 */
export function taskNotes(note: Note | undefined, task: Task): string {
  if (!note) return ''
  const lines = note.content.split('\n')
  const indentOf = (l: string) => /^\s*/.exec(l)![0].length
  const own = indentOf(lines[task.line] ?? '')
  const out: string[] = []
  for (let i = task.line + 1; i < lines.length && lines[i].trim() && indentOf(lines[i]) > own; i++) if (!TASK_LINE.test(lines[i])) out.push(lines[i])
  const cut = Math.min(...out.map(indentOf))
  return out.map((l) => l.slice(cut)).join('\n')
}

/**
 * One task with its details. Used in the Tasks view and under daily notes. `star` marks a task that is also in
 * Today, as Things does in Anytime and in its projects.
 */
export function TaskRow({ task, note, showNote = true, active = false, star = false, onHover, notesOpen, onToggleNotes }: { task: Task; note: Note; showNote?: boolean; active?: boolean; star?: boolean; onHover?: () => void; notesOpen?: boolean; onToggleNotes?: () => void }) {
  const now = today()
  const html = useMemo(() => renderInline(task.text), [task.text])
  // The lines under the task, shown on request. The Tasks view keeps which are open (so N works); elsewhere the row does.
  const notes = useMemo(() => taskNotes(note, task), [note, task])
  const [ownOpen, setOwnOpen] = useState(false)
  const showNotes = !!notes && (notesOpen ?? ownOpen)
  const toggleNotes = onToggleNotes ?? (() => setOwnOpen((o) => !o))
  const notesHtml = useMemo(() => (showNotes ? renderMarkdown(notes) : ''), [showNotes, notes])
  const open = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return
    // Land with the cursor at the end of the task, not with the line selected, so a stray key cannot wipe it.
    if (e.metaKey || e.altKey || e.ctrlKey) openSideAt(note.id, task.raw, true)
    else openNoteAt(note.id, task.raw, [], true)
  }
  const late = (d?: string) => !task.done && !!d && d < now
  return (
    <div className={cx('task', task.done && 'done', `pri-${task.priority}`, active && 'active')} onMouseMove={onHover}>
      <input type="checkbox" checked={task.done} title={task.done ? 'Mark as not done' : 'Mark as done'} onChange={() => updateTask(task, { done: !task.done })} />
      <div className="task-main" onClick={open} title="Open in its note">
        <span className="task-text">
          {star && <Star size={13} fill="currentColor" className="task-star" aria-label="In Today" />}
          {task.priority > 0 && <b className="task-pri">{priorityLabel(task.priority)}</b>}
          <span dangerouslySetInnerHTML={{ __html: html }} />
          {notes && (
            <button
              className={cx('task-notes-btn', showNotes && 'open')}
              title={`${showNotes ? 'Hide' : 'Show'} notes  N\n\n${notes.length > 300 ? notes.slice(0, 300) + '…' : notes}`}
              aria-expanded={showNotes}
              onClick={(e) => (e.stopPropagation(), toggleNotes())}
            >
              <AlignLeft size={13} />
            </button>
          )}
        </span>
        <span className="task-meta">
          {task.done && task.completed && (
            <span className="task-chip done-on" title="The day it was ticked">
              <Check size={12} /> Done {shortDate(task.completed)}
            </span>
          )}
          {task.scheduled && (
            <button
              className={cx('task-chip', !task.done && task.scheduled <= now && 'now')}
              title={!task.done && task.scheduled < now ? 'Planned for this day, so it has been in Today since. Click to change.' : 'Planned for this day. Click to change.'}
              onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'scheduled'))}
            >
              <CalendarClock size={12} /> {shortDate(task.scheduled)}
            </button>
          )}
          {task.someday && (
            <button className="task-chip someday" title="Someday: kept out of Today, Upcoming and Anytime. Click to change." onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'scheduled'))}>
              <Archive size={12} /> Someday
            </button>
          )}
          {task.due && (
            <button className={cx('task-chip', late(task.due) && 'late', task.due === now && 'now')} title="Due date. Click to change." onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'due'))}>
              <CalendarDays size={12} /> Due {shortDate(task.due)}
            </button>
          )}
          {showNote && (
            <span className="task-where">
              <FileText size={12} className="task-where-icon" />
              {displayTitle(note)}
              {task.heading && task.heading !== note.title ? ` › ${task.heading}` : ''}
            </span>
          )}
        </span>
        {showNotes && (
          // Reading the notes (or selecting text in them) does not open the note; a link in them opens as usual.
          <div className="task-notes md" onClick={(e) => !(e.target as HTMLElement).closest('a') && e.stopPropagation()} dangerouslySetInnerHTML={{ __html: notesHtml }} />
        )}
      </div>
      <div className="task-actions">
        <button className={cx('icon-btn sm', task.priority > 0 && 'active')} title="Priority" onClick={(e) => openMenu(e, priorityMenu(task))}>
          <Flag size={14} />
        </button>
        <button className={cx('icon-btn sm', (task.scheduled || task.someday) && 'active')} title="When: plan for a day, or Someday" onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'scheduled'))}>
          <CalendarClock size={14} />
        </button>
        <button className={cx('icon-btn sm', task.due && 'active')} title="Due date" onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'due'))}>
          <CalendarDays size={14} />
        </button>
        <button className="icon-btn sm" title="Move to another note (a project)" onClick={(e) => (e.stopPropagation(), moveToNote(task))}>
          <FolderInput size={14} />
        </button>
      </div>
    </div>
  )
}

function dateBucket(t: Task, now: string, weekEnd: string): [string, string] {
  // The Logbook is grouped by the day each task was done, the latest first.
  if (t.done) return t.completed ? [`0${t.completed.replace(/\d/g, (c) => String(9 - Number(c)))}`, shortDate(t.completed, now)] : ['1', 'Day not recorded']
  if (t.someday && !t.due) return ['6', 'Someday']
  const d = nextDate(t, now)
  if (!d) return ['5', 'No date']
  if (d < now) return ['0', 'Overdue']
  if (d === now) return ['1', 'Today']
  if (d === addDays(now, 1)) return ['2', 'Tomorrow']
  if (d <= weekEnd) return ['3', 'Later this week']
  return ['4', 'Later']
}

interface Group {
  label: string
  tasks: Task[]
  /** The project's note, when grouped by project. */
  noteId?: string
  /** The notebook the project is in. */
  area?: string
  /** Ticked and all tasks in the project, for its progress circle. */
  progress?: [number, number]
  /** The small heading a task sits under inside its group. */
  sub?: (t: Task) => string
  /** The icon before that heading: a heading of the note itself, a meeting, a day, or another note. */
  subIcon?: (t: Task) => React.ReactNode
}

/** A small circle that fills as a project's tasks are ticked, as in Things. */
function Progress({ done, total }: { done: number; total: number }) {
  const share = total ? done / total : 0
  return <span className="task-progress" title={`${done} of ${total} done`} style={{ '--share': `${Math.round(share * 360)}deg` } as React.CSSProperties} />
}

/**
 * Group by project, as in Things: each project note's tasks under its notebook (the area), in the order they are
 * written and under their headings, followed by the tasks from meeting notes (and lines) that link the project.
 * Daily-note tasks that link no project are kept together. The progress circle counts every task listed there.
 */
function projectGroups(shown: Task[], all: Task[], notes: Record<string, Note>, folders: ProjectFolders): [string, Group][] {
  const progress = new Map<string, [number, number]>()
  for (const t of all)
    for (const id of projectsOf(t, notes, folders)) {
      const p = progress.get(id) ?? [0, 0]
      p[1]++
      if (t.done) p[0]++
      progress.set(id, p)
    }
  const map = new Map<string, Group>()
  for (const t of shown)
    for (const id of projectsOf(t, notes, folders)) {
      const home = notes[id]
      if (!home) continue
      const daily = home.type === 'daily'
      const key = daily ? '2' : `1${(home.folder || '').toLowerCase()}\u0000${displayTitle(home).toLowerCase()}\u0000${id}`
      let entry = map.get(key)
      if (!entry) {
        entry = daily ? { label: 'Daily notes', tasks: [] } : { label: displayTitle(home), tasks: [], noteId: id, area: home.folder, progress: progress.get(id) }
        map.set(key, entry)
      }
      entry.tasks.push(t)
    }
  for (const g of map.values()) {
    const own = (t: Task) => t.noteId === g.noteId
    // Its own tasks first, in written order; then the linked ones, latest note first. Daily notes: latest day first.
    const created = (t: Task) => notes[t.noteId]?.created ?? ''
    g.tasks.sort((a, b) =>
      g.noteId
        ? Number(own(b)) - Number(own(a)) || created(b).localeCompare(created(a)) || a.noteId.localeCompare(b.noteId) || a.line - b.line
        : notes[b.noteId].title.localeCompare(notes[a.noteId].title) || a.line - b.line,
    )
    g.sub = (t: Task) => (!g.noteId ? displayTitle(notes[t.noteId]) : own(t) ? t.heading : `From ${displayTitle(notes[t.noteId])}`)
    g.subIcon = (t: Task) => {
      const from = notes[t.noteId]
      if (g.noteId && own(t)) return <ListTree size={14} />
      if (from?.type === 'daily') return <CalendarDays size={14} />
      return from && within(from.folder, folders.meetingsFolder) ? <Users size={14} /> : <FileText size={14} />
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export function TasksView({ view }: { view?: string }) {
  const notes = useStore((s) => s.notes)
  const settings = useStore((s) => s.settings)
  // The address decides the list: a built-in one ("today"), or a saved filter ("s:<id>").
  const saved = view?.startsWith('s:') ? settings.taskViews.find((v) => `s:${v.id}` === view) : undefined
  const builtIn = TASK_FILTERS.find(([f]) => f === view)?.[0]
  const [filter, setFilter] = useState<TaskFilter>(saved?.filter ?? builtIn ?? 'open')
  const [group, setGroup] = useState<TaskGroup>(() => saved?.group ?? local.get<TaskGroup>('taskGroup', 'date'))
  const [source, setSource] = useState<TaskSource>(() => saved?.source ?? local.get<TaskSource>('taskSource', 'all'))
  const [query, setQuery] = useState(saved?.query ?? '')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  /** True while the highlighted row is being moved by keys, so it is scrolled into view; a mouse hover must not scroll. */
  const keyboard = useRef(false)
  const weekStart = weekStartOf(settings.weekStart)
  const now = today()

  const wasSaved = useRef(!!saved)
  useEffect(() => root.current?.focus(), [])
  // After a menu or the calendar closes, the keyboard goes back to the list.
  const overlay = useStore((s) => !!(s.menu || s.datePick || s.asking || s.palette))
  useEffect(() => {
    if (!overlay && (document.activeElement === document.body || !document.activeElement)) root.current?.focus()
  }, [overlay])
  // Moving between lists from the sidebar.
  useEffect(() => {
    const next = view?.startsWith('s:') ? useStore.getState().settings.taskViews.find((v) => `s:${v.id}` === view) : undefined
    if (next) {
      setFilter(next.filter)
      setQuery(next.query)
      setGroup(next.group)
      setSource(next.source)
    } else {
      setFilter(TASK_FILTERS.find(([f]) => f === view)?.[0] ?? 'open')
      // Coming out of a saved filter: drop its narrowing and go back to the usual settings.
      if (wasSaved.current) {
        setQuery('')
        setGroup(local.get<TaskGroup>('taskGroup', 'date'))
        setSource(local.get<TaskSource>('taskSource', 'all'))
      }
    }
    wasSaved.current = !!next
    setClosed({})
  }, [view])

  const tasks = useMemo(() => allTasks(notes, settings.templatesFolder, settings.inboxFolder), [notes, settings.templatesFolder, settings.inboxFolder])
  const counts = useMemo(
    () => Object.fromEntries(TASK_FILTERS.map(([f]) => [f, selectTasks(tasks, notes, { filter: f, query: '', source }, weekStart, now).length])),
    [tasks, notes, source, weekStart, now],
  )
  const shown = useMemo(() => selectTasks(tasks, notes, { filter, query, source }, weekStart, now), [tasks, notes, filter, query, source, weekStart, now])
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const t of selectTasks(tasks, notes, { filter, query: '', source }, weekStart, now)) for (const tag of t.tags) count.set(tag, (count.get(tag) || 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [tasks, notes, filter, source, weekStart, now])

  const groups = useMemo(() => {
    if (group === 'note') return projectGroups(shown, tasks, notes, settings)
    const weekEnd = weekRange(now, weekStart)[1]
    const map = new Map<string, Group>()
    for (const t of shown) {
      const [key, label] =
        group === 'date' ? dateBucket(t, now, weekEnd)
        : group === 'priority' ? [String(3 - t.priority), t.priority ? `${priorityLabel(t.priority)} · ${PRIORITIES[t.priority]} priority` : 'No priority']
        : ['', '']
      const entry = map.get(key) ?? { label, tasks: [] }
      entry.tasks.push(t)
      map.set(key, entry)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown, group, notes, now, weekStart, tasks, settings])

  // The tasks in the order they are drawn, for moving through them with the keyboard. A task can be listed
  // under two projects, so a row is known by its place, counted from the start of its group.
  const rows = useMemo(() => groups.flatMap(([key, g]) => (closed[key] ? [] : g.tasks)), [groups, closed])
  const starts = useMemo(() => {
    let n = 0
    return groups.map(([key, g]) => {
      const start = n
      if (!closed[key]) n += g.tasks.length
      return start
    })
  }, [groups, closed])
  const [active, setActive] = useState(0)
  const at = Math.min(active, rows.length - 1)
  // Tasks whose notes are showing, by note and line.
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set())
  const notesKey = (t: Task) => `${t.noteId}:${t.line}`
  const toggleNotes = (t: Task) =>
    setOpenNotes((s) => {
      const next = new Set(s)
      if (!next.delete(notesKey(t))) next.add(notesKey(t))
      return next
    })
  useEffect(() => setActive(0), [filter, query, source, group, view])
  useEffect(() => {
    if (keyboard.current) root.current?.querySelector('.task.active')?.scrollIntoView({ block: 'nearest' })
  }, [at])
  // Inside a saved filter the lists adjust it; otherwise each list has its own address, so Back works.
  const pick = (f: TaskFilter) => (saved ? setFilter(f) : go({ name: 'tasks', view: f === 'open' ? undefined : f }))
  const current: TaskView = { filter, query: query.trim(), source, group }
  const changed = !!saved && (saved.filter !== filter || saved.query !== query.trim() || saved.source !== source || saved.group !== group)
  const late = shown.filter((t) => isOverdue(t, now))
  // Open tasks in the Inbox notebook's other notes, such as a Tasks note from before there was one Inbox note.
  const strays = useMemo(
    () => (filter === 'inbox' ? tasks.filter((t) => !t.done && !t.inInbox && notes[t.noteId] && notes[t.noteId].type !== 'scratch' && sameNotebook(notes[t.noteId].folder, settings.inboxFolder)) : []),
    [filter, tasks, notes, settings.inboxFolder],
  )
  const moveStrays = async () => {
    const inbox = await ensureInboxNote()
    if (inbox) moveTasksToNote(strays, inbox.id)
  }
  const moveLate = (e: React.MouseEvent) =>
    openDatePicker(e, { title: `Move ${late.length} overdue task${late.length === 1 ? '' : 's'} to`, value: now, onPick: (date) => date && rescheduleTasks(late, date) })
  const hasTag = (tag: string) => query.toLowerCase().split(/\s+/).includes('#' + tag.toLowerCase())
  const toggleTag = (tag: string) =>
    setQuery((q) => (hasTag(tag) ? q.split(/\s+/).filter((w) => w.toLowerCase() !== '#' + tag.toLowerCase()).join(' ') : `${q.trim()} #${tag}`.trim()))
  const overdue = counts.overdue

  return (
    <div
      className="page"
      ref={root}
      tabIndex={-1}
      onKeyDown={(e) => {
        const typing = e.target instanceof HTMLInputElement && e.target.type !== 'checkbox'
        const plain = !e.metaKey && !e.ctrlKey && !e.altKey
        const task = rows[at]
        const rowEl = () => root.current?.querySelector('.task.active') ?? root.current!
        const move = (to: number) => {
          e.preventDefault()
          keyboard.current = true
          setActive(Math.max(0, Math.min(rows.length - 1, to)))
        }
        if (typing) {
          if (e.key === 'Escape') (setQuery(''), root.current?.focus())
          // Down or Enter leaves the box for the list, keeping what was typed.
          else if (e.key === 'ArrowDown' || e.key === 'Enter') (e.preventDefault(), root.current?.focus(), (keyboard.current = true), setActive(0))
          return
        }
        // A focused button or checkbox handles Enter and Space itself.
        if ((e.target as HTMLElement).closest('button, a, select, input') && (e.key === 'Enter' || e.key === ' ')) return
        if (!plain) return
        if (e.key === '/') (e.preventDefault(), input.current?.focus())
        else if (LIST_KEYS[e.key]) pick(LIST_KEYS[e.key])
        else if (e.key === 'ArrowDown' || e.key === 'j') move(at + 1)
        else if (e.key === 'ArrowUp' || e.key === 'k') move(at - 1)
        else if (e.key === 'Home') move(0)
        else if (e.key === 'End') move(rows.length - 1)
        else if (!task) return
        else if (e.key === ' ' || e.key === 'x') (e.preventDefault(), updateTask(task, { done: !task.done }))
        else if (e.key === 'Enter') (e.preventDefault(), e.shiftKey ? openSideAt(task.noteId, task.raw, true) : openNoteAt(task.noteId, task.raw, [], true))
        else if (e.key === 't') (e.preventDefault(), updateTask(task, { raw: withDetails(task.raw, { scheduled: now }) }))
        else if (e.key === 'd') (e.preventDefault(), pickDate(rowEl(), task, 'due'))
        else if (e.key === 's') (e.preventDefault(), pickDate(rowEl(), task, 'scheduled'))
        else if (e.key === 'm') (e.preventDefault(), moveToNote(task))
        else if (e.key === 'n' && taskNotes(notes[task.noteId], task)) (e.preventDefault(), toggleNotes(task))
        else if (e.key === 'p') (e.preventDefault(), openMenu({ currentTarget: rowEl(), clientX: 0, clientY: 0, type: 'key', preventDefault() {} }, priorityMenu(task)))
      }}
    >
      <div className="page-inner list tasks">
        <header className="list-head">
          <span className="list-icon">
            <ListChecks size={20} />
          </span>
          <div className="list-title">
            <h1>{saved ? saved.name : 'Tasks'}</h1>
            <p>
              {saved
                ? `Saved filter · ${shown.length} task${shown.length === 1 ? '' : 's'}`
                : filter === 'inbox'
                  ? `Tasks in the Inbox note (${inboxNotebook()} › Inbox) with no day yet · tasks with a day are in Today or Upcoming`
                  : `${counts.open} open${overdue ? ` · ${overdue} overdue` : ''} · every checkbox in your notes`}
            </p>
          </div>
          {saved ? (
            <>
              {changed && (
                <button className="btn primary" title="Keep the changes you made to this filter" onClick={() => updateTaskView(saved.id, current)}>
                  Update filter
                </button>
              )}
              <button
                className="btn"
                onClick={(e) =>
                  openMenu(e, [
                    { label: 'Rename…', onSelect: () => void renameTaskView(saved.id) },
                    { label: 'Save as a new filter…', onSelect: () => void saveTaskView(current) },
                    { separator: true },
                    { label: 'Delete this filter', danger: true, onSelect: () => deleteTaskView(saved.id) },
                  ])
                }
              >
                <MoreHorizontal size={15} />
              </button>
            </>
          ) : (
            <button className="btn" title="Keep this list, its narrowing and grouping in the sidebar" onClick={() => void saveTaskView(current)}>
              <BookmarkPlus size={15} /> Save filter
            </button>
          )}
        </header>

        <div className="task-filters">
          {TASK_FILTERS.map(([f, label, title], i) => (
            <button key={f} className={cx('chip', filter === f && 'active', f === 'overdue' && counts.overdue > 0 && 'warn', i === 6 && 'after-gap')} title={keyOf(f) ? `${title}  (${keyOf(f)})` : title} onClick={() => pick(f)}>
              {label} {f !== 'done' && <span className="count">{counts[f]}</span>}
            </button>
          ))}
        </div>

        <div className="list-tools">
          <label className="filter">
            <Search size={15} />
            <input ref={input} value={query} placeholder="Narrow down: words, #tag, p1 for priority…  /" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <span className="tools-label">From</span>
          <div className="seg sm">
            {TASK_SOURCES.map(([v, label, title]) => (
              <button key={v} className={cx(source === v && 'on')} title={title} onClick={() => (setSource(v), saved || local.set('taskSource', v))}>
                {label}
              </button>
            ))}
          </div>
          <span className="tools-label">Group by</span>
          <div className="seg sm">
            {GROUPS.map(([g, label]) => (
              <button key={g} className={cx(group === g && 'on')} onClick={() => (setGroup(g), saved || local.set('taskGroup', g))}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="subfolders">
            {tags.map(([tag, n]) => (
              <button key={tag} className={cx('chip tag', hasTag(tag) && 'active')} style={tagStyle(tag)} onClick={() => toggleTag(tag)}>
                #{tag} <span className="count">{n}</span>
              </button>
            ))}
          </div>
        )}

        {filter === 'inbox' && strays.length > 0 && (
          <div className="task-bulk">
            <span>
              {strays.length} open task{strays.length === 1 ? ' is' : 's are'} in other notes of the {inboxNotebook()} notebook ({[...new Set(strays.map((t) => displayTitle(notes[t.noteId])))].join(', ')}). Only the Inbox note is the Inbox.
            </span>
            <button className="btn sm" title="Move them to the end of the Inbox note, with Undo" onClick={() => void moveStrays()}>
              <FolderInput size={13} /> Move them into Inbox
            </button>
          </div>
        )}
        {filter === 'done' && (
          <div className="task-bulk quiet">
            <span>Ticked tasks stay in their notes. Archiving moves them to an Archive section at the end of each note, out of the way; they stay listed here.</span>
            <button className="btn sm" title={`Tasks ticked at least ${settings.archiveAfterDays ?? 7} days ago, in every note but daily notes and templates. Asks first, with Undo.`} onClick={() => void archiveEverywhere()}>
              <Archive size={13} /> Archive done tasks…
            </button>
          </div>
        )}
        {late.length > 0 && group !== 'date' && (
          <div className="task-bulk">
            <span>
              {late.length} overdue in this list
            </span>
            <button className="btn sm" title="Choose one day for all of them" onClick={moveLate}>
              <CalendarClock size={13} /> Move all…
            </button>
          </div>
        )}

        <div className="task-groups">
          {shown.length === 0 && (
            <p className="list-empty">
              {query.trim()
                ? `No task here matches “${query.trim()}”.`
                : filter === 'open'
                  ? 'No open tasks. Write “- [ ] something” in any note and it shows up here.'
                  : filter === 'inbox'
                    ? `The Inbox is empty. Tasks captured with Quick task (${hint('captureTask')}), or written in the Inbox note, wait here until you give them a day or move them into a note.`
                    : 'Nothing in this list.'}
            </p>
          )}
          {groups.map(([key, g], gi) => {
            const isClosed = closed[key]
            // Grouped by project, as in Things: each notebook (the area) as a heading over its projects.
            const byProject = group === 'note'
            const area = byProject && g.noteId ? g.area || '' : ''
            const newArea = !!area && (gi === 0 || groups[gi - 1][1].area !== g.area)
            return (
              <section key={key} className={cx('task-group', g.label === 'Overdue' && 'late', byProject && 'project')}>
                {newArea && (
                  <h3 className="task-area-head">
                    <Box size={16} /> {area.split('/').pop()}
                  </h3>
                )}
                {g.label && (
                  <header>
                    <button className={cx('task-group-head', byProject && 'project-head')} onClick={() => setClosed({ ...closed, [key]: !isClosed })}>
                      {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {g.progress ? <Progress done={g.progress[0]} total={g.progress[1]} /> : byProject && <CalendarDays size={16} className="project-icon" />}
                      {g.label}
                      <span className="count">{g.tasks.length}</span>
                    </button>
                    {g.label === 'Overdue' && late.length > 0 && (
                      <button className="btn ghost sm" title="Choose one day for all of these" onClick={moveLate}>
                        <CalendarClock size={13} /> Move all…
                      </button>
                    )}
                    {g.noteId && (
                      <button className="btn ghost sm" onClick={(e) => openFromClick(e, g.noteId!)}>
                        Open note
                      </button>
                    )}
                  </header>
                )}
                {!isClosed &&
                  g.tasks.map((t, n) => {
                    const i = starts[gi] + n
                    const sub = g.sub?.(t)
                    return (
                      notes[t.noteId] && (
                        <Fragment key={`${t.noteId}:${t.line}`}>
                          {sub && sub !== g.label && (n === 0 || sub !== g.sub!(g.tasks[n - 1])) && <h5 className="task-subhead">{g.subIcon?.(t)}{sub}</h5>}
                          <TaskRow task={t} note={notes[t.noteId]} showNote={group !== 'note'} star={filter !== 'today' && filter !== 'overdue' && isToday(t, now)} active={i === at} onHover={() => ((keyboard.current = false), i !== at && setActive(i))} notesOpen={openNotes.has(notesKey(t))} onToggleNotes={() => toggleNotes(t)} />
                        </Fragment>
                      )
                    )
                  })}
              </section>
            )
          })}
        </div>
        {rows.length > 0 && (
          <p className="tasks-keys">
            <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Space</kbd> tick · <kbd>↵</kbd> open · <kbd>T</kbd> today · <kbd>D</kbd> due · <kbd>S</kbd> when · <kbd>P</kbd> priority · <kbd>M</kbd> move to note · <kbd>N</kbd> notes · <kbd>/</kbd> narrow down
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Tasks from other notes that are due or planned for a day, shown with that day's note.
 * Today's also lists what is overdue and what was planned for an earlier day and is still open, as the Today list does.
 */
export function DayTasks({ note, floating = false }: { note: Note; floating?: boolean }) {
  const notes = useStore((s) => s.notes)
  const templatesFolder = useStore((s) => s.settings.templatesFolder)
  const inboxFolder = useStore((s) => s.settings.inboxFolder)
  // Over a canvas it starts folded away, so it does not cover the cards.
  const key = floating ? 'dayTasksOpenCanvas' : 'dayTasksOpen'
  const [open, setOpen] = useState(() => local.get(key, !floating))
  const date = note.title
  const now = today()
  const { due, late, carried } = useMemo(() => {
    const elsewhere = allTasks(notes, templatesFolder, inboxFolder).filter((t) => t.noteId !== note.id)
    const isNow = date === now
    return {
      due: elsewhere.filter((t) => isOn(t, date)).sort((a, b) => Number(a.done) - Number(b.done) || byUrgency(a, b)),
      late: isNow ? elsewhere.filter((t) => isOverdue(t, now)).sort(byUrgency) : [],
      carried: isNow ? elsewhere.filter((t) => isCarried(t, now) && !isOn(t, now)).sort(byUrgency) : [],
    }
  }, [notes, templatesFolder, inboxFolder, note.id, date, now])
  if (!due.length && !late.length && !carried.length) return null
  const left = due.filter((t) => !t.done).length
  return (
    <section className="day-tasks">
      <button className="day-tasks-head" onClick={() => (setOpen(!open), local.set(key, !open))}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <ListChecks size={14} /> Tasks for this day
        <span className="count">
          {left} open{late.length ? ` · ${late.length} overdue` : ''}{carried.length ? ` · ${carried.length} from earlier days` : ''}
        </span>
      </button>
      {open && (
        <div className="day-tasks-body">
          {due.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)}
          {late.length > 0 && <h4>Overdue</h4>}
          {late.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)}
          {carried.length > 0 && <h4 className="carried">From earlier days</h4>}
          {carried.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)}
        </div>
      )}
    </section>
  )
}
