import { useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkPlus, CalendarClock, CalendarDays, ChevronDown, ChevronRight, Flag, ListChecks, MoreHorizontal, Search } from 'lucide-react'
import type { Note } from '../types'
import { deleteTaskView, go, openDatePicker, openFromClick, openMenu, openNoteAt, openSideAt, renameTaskView, rescheduleTasks, saveTaskView, updateTask, updateTaskView, useStore, type MenuItem } from '../store'
import { renderInline } from '../lib/markdown'
import { PRIORITIES, TASK_FILTERS, TASK_SOURCES, allTasks, byUrgency, isOn, isOverdue, nextDate, priorityLabel, selectTasks, shortDate, weekRange, withDetails, type Task, type TaskFilter, type TaskGroup, type TaskSource, type TaskView } from '../lib/tasks'
import { addDays, cx, displayTitle, firstWeekday, local, today, tagStyle } from '../lib/util'

const weekStartOf = (setting: string) => (setting === 'sunday' ? 0 : setting === 'monday' ? 1 : firstWeekday())

const GROUPS: [TaskGroup, string][] = [
  ['date', 'Date'],
  ['note', 'Note'],
  ['priority', 'Priority'],
  ['none', 'None'],
]

/** Open the calendar for a task's due date or planned day, under the element given. */
function pickDate(anchor: Element, task: Task, field: 'due' | 'scheduled') {
  openDatePicker({ currentTarget: anchor }, {
    title: field === 'due' ? 'Due date' : 'Plan for a day',
    value: task[field],
    removeLabel: field === 'due' ? 'Remove due date' : 'Remove planned day',
    onPick: (date) => updateTask(task, { raw: withDetails(task.raw, { [field]: date }) }),
  })
}

const priorityMenu = (task: Task): MenuItem[] =>
  [3, 2, 1, 0].map((p) => ({ label: p ? `${priorityLabel(p)}  ${PRIORITIES[p]}` : 'No priority', checked: task.priority === p, onSelect: () => updateTask(task, { raw: withDetails(task.raw, { priority: p }) }) }))

/** One task with its details. Used in the Tasks view and under daily notes. */
export function TaskRow({ task, note, showNote = true, active = false, onHover }: { task: Task; note: Note; showNote?: boolean; active?: boolean; onHover?: () => void }) {
  const now = today()
  const html = useMemo(() => renderInline(task.text), [task.text])
  const open = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return
    if (e.metaKey || e.altKey || e.ctrlKey) openSideAt(note.id, task.raw)
    else openNoteAt(note.id, task.raw, [])
  }
  const late = (d?: string) => !task.done && !!d && d < now
  return (
    <div className={cx('task', task.done && 'done', `pri-${task.priority}`, active && 'active')} onMouseMove={onHover}>
      <input type="checkbox" checked={task.done} title={task.done ? 'Mark as not done' : 'Mark as done'} onChange={() => updateTask(task, { done: !task.done })} />
      <div className="task-main" onClick={open} title="Open in its note">
        <span className="task-text">
          {task.priority > 0 && <b className="task-pri">{priorityLabel(task.priority)}</b>}
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </span>
        <span className="task-meta">
          {task.scheduled && (
            <button className={cx('task-chip', late(task.scheduled) && !task.due && 'late', task.scheduled === now && 'now')} title="Planned for this day. Click to change." onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'scheduled'))}>
              <CalendarClock size={12} /> {shortDate(task.scheduled)}
            </button>
          )}
          {task.due && (
            <button className={cx('task-chip', late(task.due) && 'late', task.due === now && 'now')} title="Due date. Click to change." onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'due'))}>
              <CalendarDays size={12} /> Due {shortDate(task.due)}
            </button>
          )}
          {showNote && (
            <span className="task-where">
              {displayTitle(note)}
              {task.heading && task.heading !== note.title ? ` › ${task.heading}` : ''}
            </span>
          )}
        </span>
      </div>
      <div className="task-actions">
        <button className={cx('icon-btn sm', task.priority > 0 && 'active')} title="Priority" onClick={(e) => openMenu(e, priorityMenu(task))}>
          <Flag size={14} />
        </button>
        <button className={cx('icon-btn sm', task.scheduled && 'active')} title="Plan for a day" onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'scheduled'))}>
          <CalendarClock size={14} />
        </button>
        <button className={cx('icon-btn sm', task.due && 'active')} title="Due date" onClick={(e) => (e.stopPropagation(), pickDate(e.currentTarget, task, 'due'))}>
          <CalendarDays size={14} />
        </button>
      </div>
    </div>
  )
}

function dateBucket(t: Task, now: string, weekEnd: string): [string, string] {
  const d = nextDate(t, now)
  if (!d) return ['5', 'No date']
  if (d < now) return ['0', 'Overdue']
  if (d === now) return ['1', 'Today']
  if (d === addDays(now, 1)) return ['2', 'Tomorrow']
  if (d <= weekEnd) return ['3', 'Later this week']
  return ['4', 'Later']
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
  const overlay = useStore((s) => !!(s.menu || s.datePick || s.asking))
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

  const tasks = useMemo(() => allTasks(notes, settings.templatesFolder), [notes, settings.templatesFolder])
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
    const weekEnd = weekRange(now, weekStart)[1]
    const map = new Map<string, { label: string; noteId?: string; tasks: Task[] }>()
    for (const t of shown) {
      const note = notes[t.noteId]
      const [key, label] =
        group === 'date' ? dateBucket(t, now, weekEnd)
        : group === 'note' ? [`${note ? displayTitle(note).toLowerCase() : ''}:${t.noteId}`, note ? displayTitle(note) : '']
        : group === 'priority' ? [String(3 - t.priority), t.priority ? `${priorityLabel(t.priority)} · ${PRIORITIES[t.priority]} priority` : 'No priority']
        : ['', '']
      const entry = map.get(key) || { label, noteId: group === 'note' ? t.noteId : undefined, tasks: [] }
      entry.tasks.push(t)
      map.set(key, entry)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown, group, notes, now, weekStart])

  // The tasks in the order they are drawn, for moving through them with the keyboard.
  const rows = useMemo(() => groups.flatMap(([key, g]) => (closed[key] ? [] : g.tasks)), [groups, closed])
  const [active, setActive] = useState(0)
  const at = Math.min(active, rows.length - 1)
  useEffect(() => setActive(0), [filter, query, source, group, view])
  useEffect(() => {
    if (keyboard.current) root.current?.querySelector('.task.active')?.scrollIntoView({ block: 'nearest' })
  }, [at])
  // Inside a saved filter the lists adjust it; otherwise each list has its own address, so Back works.
  const pick = (f: TaskFilter) => (saved ? setFilter(f) : go({ name: 'tasks', view: f === 'open' ? undefined : f }))
  const current: TaskView = { filter, query: query.trim(), source, group }
  const changed = !!saved && (saved.filter !== filter || saved.query !== query.trim() || saved.source !== source || saved.group !== group)
  const late = shown.filter((t) => isOverdue(t, now))
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
        else if (/^[1-8]$/.test(e.key)) pick(TASK_FILTERS[Number(e.key) - 1][0])
        else if (e.key === 'ArrowDown' || e.key === 'j') move(at + 1)
        else if (e.key === 'ArrowUp' || e.key === 'k') move(at - 1)
        else if (e.key === 'Home') move(0)
        else if (e.key === 'End') move(rows.length - 1)
        else if (!task) return
        else if (e.key === ' ' || e.key === 'x') (e.preventDefault(), updateTask(task, { done: !task.done }))
        else if (e.key === 'Enter') (e.preventDefault(), e.shiftKey ? openSideAt(task.noteId, task.raw) : openNoteAt(task.noteId, task.raw, []))
        else if (e.key === 'd') (e.preventDefault(), pickDate(rowEl(), task, 'due'))
        else if (e.key === 's') (e.preventDefault(), pickDate(rowEl(), task, 'scheduled'))
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
              {saved ? `Saved filter · ${shown.length} task${shown.length === 1 ? '' : 's'}` : `${counts.open} open${overdue ? ` · ${overdue} overdue` : ''} · every checkbox in your notes`}
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
            <button key={f} className={cx('chip', filter === f && 'active', f === 'overdue' && counts.overdue > 0 && 'warn')} title={`${title}  (${i + 1})`} onClick={() => pick(f)}>
              {label} <span className="count">{counts[f]}</span>
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
              {query.trim() ? `No task here matches “${query.trim()}”.` : filter === 'open' ? 'No open tasks. Write “- [ ] something” in any note and it shows up here.' : 'Nothing in this list.'}
            </p>
          )}
          {groups.map(([key, g]) => {
            const isClosed = closed[key]
            return (
              <section key={key} className={cx('task-group', g.label === 'Overdue' && 'late')}>
                {g.label && (
                  <header>
                    <button className="task-group-head" onClick={() => setClosed({ ...closed, [key]: !isClosed })}>
                      {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
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
                  g.tasks.map((t) => {
                    const i = rows.indexOf(t)
                    return notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} showNote={group !== 'note'} active={i === at} onHover={() => ((keyboard.current = false), i !== at && setActive(i))} />
                  })}
              </section>
            )
          })}
        </div>
        {rows.length > 0 && (
          <p className="tasks-keys">
            <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Space</kbd> tick · <kbd>↵</kbd> open · <kbd>D</kbd> due · <kbd>S</kbd> plan · <kbd>P</kbd> priority · <kbd>/</kbd> narrow down
          </p>
        )}
      </div>
    </div>
  )
}

/** Tasks from other notes that are due or planned for a day, shown with that day's note. Today also lists what is overdue. */
export function DayTasks({ note, floating = false }: { note: Note; floating?: boolean }) {
  const notes = useStore((s) => s.notes)
  const templatesFolder = useStore((s) => s.settings.templatesFolder)
  // Over a canvas it starts folded away, so it does not cover the cards.
  const key = floating ? 'dayTasksOpenCanvas' : 'dayTasksOpen'
  const [open, setOpen] = useState(() => local.get(key, !floating))
  const date = note.title
  const now = today()
  const { due, late } = useMemo(() => {
    const elsewhere = allTasks(notes, templatesFolder).filter((t) => t.noteId !== note.id)
    return {
      due: elsewhere.filter((t) => isOn(t, date)).sort((a, b) => Number(a.done) - Number(b.done) || byUrgency(a, b)),
      late: date === now ? elsewhere.filter((t) => isOverdue(t, now)).sort(byUrgency) : [],
    }
  }, [notes, templatesFolder, note.id, date, now])
  if (!due.length && !late.length) return null
  const left = due.filter((t) => !t.done).length
  return (
    <section className="day-tasks">
      <button className="day-tasks-head" onClick={() => (setOpen(!open), local.set(key, !open))}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <ListChecks size={14} /> Tasks for this day
        <span className="count">
          {left} open{late.length ? ` · ${late.length} overdue` : ''}
        </span>
      </button>
      {open && (
        <div className="day-tasks-body">
          {due.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)}
          {late.length > 0 && <h4>Overdue</h4>}
          {late.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)}
        </div>
      )}
    </section>
  )
}
