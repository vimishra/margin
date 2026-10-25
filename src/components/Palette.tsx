import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, CalendarClock, CalendarDays, CheckSquare, CornerDownLeft, FilePlus2, Folder, FolderPlus, Hash, LayoutTemplate, Search, Square, Users, Plus } from 'lucide-react'
import { createNote, go, moveTaskToNewNote, moveTaskToNote, newProjectPlace, OPEN_THREADS, openSide, openSideAt, openDaily, newFromTemplate, newMeeting, newTemplate, openNote, openNoteAt, templates, toast, ui, updateNote, useStore, type PaletteState, applyTags } from '../store'
import { commands } from '../commands'
import { search } from '../lib/search'
import { tagCounts } from '../lib/links'
import { cx, dailyLabel, displayTitle, longDate, relTime, snippet, today } from '../lib/util'
import { parseDatePhrase } from '../lib/dates'
import { headings } from '../lib/markdown'
import { allTasks, byUrgency, matchesQuery, priorityLabel, shortDate, type Task } from '../lib/tasks'
import { splitContent } from '../lib/canvas'
import { Marked, NoteIcon } from './bits'
import { api } from '../api'

interface Item {
  key: string
  group: string
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  run: () => void
  /** Set on note results, so they can also be opened in the side pane. */
  noteId?: string
  /** What ⌥↵ does, when it is more than opening `noteId` to the side (a task opens at its line). */
  side?: () => void
}

/** A task's text without markdown marks, for a one-line result: `[[Note|label]]` shows as label, `**bold**` as bold. */
const plainTask = (text: string) => text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '')

/** How many tasks a search lists in ⌘K, and how many notes come before them. */
const TASK_RESULTS = 5
const NOTES_BEFORE_TASKS = 3

/**
 * Tasks whose text has every word typed (and `#tag` or `p1`–`p3`, as in the Tasks view's box): open ones first,
 * most urgent first, then finished ones, newest first, while there is room.
 */
function findTasks(notes: Record<string, import('../types').Note>, query: string): Task[] {
  const words = query.trim()
  if (words.replace(/[#\s]/g, '').length < 2) return []
  const { templatesFolder, inboxFolder } = useStore.getState().settings
  const hits = allTasks(notes, templatesFolder, inboxFolder).filter((t) => matchesQuery(t, '', words))
  const open = hits.filter((t) => !t.done).sort(byUrgency)
  const done = hits.filter((t) => t.done).sort((a, b) => (b.completed || '').localeCompare(a.completed || ''))
  return [...open, ...done].slice(0, TASK_RESULTS)
}

export function Palette({ state }: { state: NonNullable<PaletteState> }) {
  const notes = useStore((s) => s.notes)
  const folders = useStore((s) => s.folders)
  const recent = useStore((s) => s.recent)
  const route = useStore((s) => s.route)
  const [query, setQuery] = useState(state.query || '')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const close = () => ui({ palette: null })
  const moving = state.mode === 'move' ? notes[state.noteId || ''] : undefined

  const items = useMemo<Item[]>(() => {
    const q = query.trim()
    const lower = q.toLowerCase()

    if (state.mode === 'outline') {
      const note = notes[state.noteId || '']
      if (!note) return []
      const all = headings(splitContent(note.content).page)
      const top = Math.min(...all.map((h) => h.level), 6)
      return all
        .filter((h) => !lower || h.text.toLowerCase().includes(lower))
        .map((h) => ({
          key: 'h' + h.line,
          group: displayTitle(note),
          icon: <span className="outline-level">H{h.level}</span>,
          title: <span style={{ paddingLeft: lower ? 0 : (h.level - top) * 16 }}>{h.text}</span>,
          run: () => window.dispatchEvent(new CustomEvent('margin:line', { detail: h.line })),
        }))
    }

    if (state.mode === 'template') {
      const out: Item[] = templates()
        .filter((t) => !lower || t.title.toLowerCase().includes(lower))
        .map((t) => ({
          key: t.id,
          group: 'Templates',
          icon: <LayoutTemplate size={16} />,
          title: t.title,
          subtitle: snippet(t.content, 90) || 'Empty template',
          run: () => void newFromTemplate(t.id),
        }))
      out.push({ key: 'meeting', group: 'Built in', icon: <Users size={16} />, title: 'Meeting note', subtitle: 'Dated, filed under Meetings and linked from today', run: () => void newMeeting() })
      out.push({ key: 'new', group: 'Manage', icon: <FilePlus2 size={16} />, title: 'Create a new template', subtitle: 'Any note in the Templates notebook is a template', run: () => void newTemplate() })
      return out
    }

    if (state.mode === 'tag') {
      const note = notes[state.noteId || '']
      if (!note) return []
      const typed = lower.replace(/^#/, '')
      const pick = (tag: string) => () => applyTags(note.id, tag)
      // Tags already in use, most used first; ones that start with what was typed come before ones that only contain it.
      const known = tagCounts(notes).filter(([t]) => !note.tags.includes(t) && (!typed || t.toLowerCase().includes(typed)))
      known.sort((a, b) => Number(b[0].toLowerCase().startsWith(typed)) - Number(a[0].toLowerCase().startsWith(typed)))
      const out: Item[] = known.slice(0, 40).map(([t, n]) => ({ key: 't:' + t, group: 'Tags in use', icon: <Hash size={16} />, title: '#' + t, meta: `${n} note${n === 1 ? '' : 's'}`, run: pick(t) }))
      const words = q.split(/[\s,]+/).filter(Boolean)
      if (typed && (words.length > 1 || !tagCounts(notes).some(([t]) => t.toLowerCase() === typed))) {
        const item: Item = { key: 'new', group: 'New', icon: <Plus size={16} />, title: words.length > 1 ? `Add ${words.map((w) => '#' + w.replace(/^#/, '')).join(' ')}` : `Create #${q.replace(/^#/, '')}`, run: () => applyTags(note.id, q) }
        // Several words mean several tags, so that is what Enter does.
        if (words.length > 1) out.unshift(item)
        else out.push(item)
      }
      return out
    }

    if (state.mode === 'moveTask' && state.task) {
      const task = state.task
      // Notes a task can go into: not scratch notes or templates, latest edited first; the notebook says which area.
      const templatesFolder = useStore.getState().settings.templatesFolder
      const out: Item[] = Object.values(notes)
        .filter((n) => n.id !== task.noteId && n.type !== 'scratch' && n.folder !== templatesFolder && (!lower || displayTitle(n).toLowerCase().includes(lower) || n.folder.toLowerCase().includes(lower)))
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .slice(0, 50)
        .map((n) => ({
          key: n.id,
          group: lower ? 'Notes' : 'Recently edited',
          icon: <NoteIcon note={n} />,
          title: displayTitle(n),
          subtitle: `${n.folder ? n.folder.split('/').join(' / ') + ' · ' : ''}under ${OPEN_THREADS}`,
          run: () => moveTaskToNote(task, n.id),
        }))
      // No note called that: offer to make it, in the notebook it would go to.
      const place = q ? newProjectPlace(q) : null
      if (place?.title && !Object.values(notes).some((n) => n.title.toLowerCase() === place.title.toLowerCase() && n.folder.toLowerCase() === place.folder.toLowerCase())) {
        const item: Item = {
          key: 'new',
          group: 'New note',
          icon: <FilePlus2 size={16} />,
          title: `New note “${place.title}”`,
          subtitle: `${place.folder ? `In ${place.folder.split('/').join(' / ')}` : 'At the top level'} · the task goes under ${OPEN_THREADS} · type Notebook/Name for another notebook`,
          run: () => void moveTaskToNewNote(task, q),
        }
        // When nothing else matches, Enter makes the note.
        if (out.length) out.push(item)
        else out.unshift(item)
      }
      return out
    }

    if (state.mode === 'move' && moving) {
      const move = (folder: string) => () => {
        updateNote(moving.id, { folder })
        toast(folder ? `Moved to ${folder}` : 'Moved out of notebooks')
      }
      const out: Item[] = [{ key: '/', group: 'Notebooks', icon: <Folder size={16} />, title: 'No notebook', subtitle: 'Top level of the vault', run: move('') }]
      for (const f of folders) {
        if (f === moving.folder) continue
        out.push({ key: f, group: 'Notebooks', icon: <Folder size={16} />, title: f.split('/').join(' / '), run: move(f) })
      }
      const filtered = out.filter((i) => !lower || i.key.toLowerCase().includes(lower))
      if (q && !folders.some((f) => f.toLowerCase() === lower)) {
        filtered.push({
          key: 'new',
          group: 'Notebooks',
          icon: <FolderPlus size={16} />,
          title: `Create notebook “${q}”`,
          run: async () => {
            const res = await api.createFolder(q)
            useStore.setState({ folders: res.folders })
            move(res.path)()
          },
        })
      }
      return filtered
    }

    const cmds = commands()
    const commandItem = (c: (typeof cmds)[number]): Item => ({
      key: 'c:' + c.id,
      group: 'Actions',
      icon: c.icon,
      title: c.label,
      meta: c.hint && <kbd>{c.hint}</kbd>,
      run: c.run,
    })
    const noteItem = (id: string, group: string, terms: string[] = [], snippetText?: string): Item | null => {
      const n = notes[id]
      if (!n) return null
      return {
        key: 'n:' + group + id,
        group,
        icon: <NoteIcon note={n} />,
        title: <Marked text={displayTitle(n)} terms={terms} />,
        subtitle: snippetText ? <Marked text={snippetText} terms={terms} /> : undefined,
        meta: (
          <>
            {n.folder && <span className="where">{n.folder}</span>}
            <span>{relTime(n.updated)}</span>
          </>
        ),
        run: () => (terms.length ? openNoteAt(id, query.trim(), terms) : openNote(id)),
        noteId: id,
      }
    }

    if (q.startsWith('>')) {
      const typed = q.slice(1).trim().toLowerCase().split(/\s+/).filter(Boolean)
      return cmds.filter((x) => typed.every((w) => (x.label + ' ' + (x.keywords || '')).toLowerCase().includes(w))).map(commandItem)
    }

    if (!q) {
      // The note you were in before this one comes first, so ⌘K ↵ flips between two notes.
      const current = route.name === 'note' ? route.id : ''
      const ids = recent.filter((id) => id !== current && notes[id]).slice(0, 7)
      const fill = Object.values(notes)
        .filter((n) => !ids.includes(n.id) && n.id !== current)
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .slice(0, Math.max(0, 7 - ids.length))
        .map((n) => n.id)
      return [...[...ids, ...fill].map((id) => noteItem(id, 'Recent')!), ...cmds.slice(0, 7).map(commandItem)]
    }

    const hits = search(notes, q, 30)
    const out: Item[] = []
    // Commands whose name matches every word typed go to the top: "rename", "delete", "close other".
    const words = lower.split(/\s+/).filter(Boolean)
    const named = cmds.filter((x) => words.every((w) => x.label.toLowerCase().includes(w)))
    const byKeyword = cmds.filter((x) => !named.includes(x) && words.every((w) => (x.label + ' ' + (x.keywords || '')).toLowerCase().includes(w)))
    if (!q.startsWith('#')) out.push(...named.slice(0, 4).map(commandItem))
    // "tomorrow", "next monday", "06/10": offer that day's daily note first.
    const date = parseDatePhrase(q, useStore.getState().settings.dayFirst)
    if (date) {
      const exists = Object.values(notes).some((n) => n.type === 'daily' && n.title === date)
      out.push({
        key: 'date:' + date,
        group: 'Daily note',
        icon: <CalendarDays size={16} />,
        title: longDate(date),
        subtitle: exists ? 'Open the daily note' : 'Start the daily note for this day',
        meta: <span>{dailyLabel(date) !== longDate(date) ? dailyLabel(date) : ''}</span>,
        run: () => void openDaily(date),
      })
    }
    // The best few notes, then matching tasks, then the rest of the notes.
    const noteItems = hits.map((h) => noteItem(h.note.id, 'Notes', h.terms, h.snippet)!)
    out.push(...noteItems.slice(0, NOTES_BEFORE_TASKS))
    const now = today()
    const terms = q.split(/\s+/).filter((w) => w && !w.startsWith('#') && !/^p[123]$/i.test(w))
    for (const t of findTasks(notes, q)) {
      const n = notes[t.noteId]
      if (!n) continue
      const late = (d?: string) => !t.done && !!d && d < now
      out.push({
        key: `task:${t.noteId}:${t.line}`,
        group: 'Tasks',
        icon: t.done ? <CheckSquare size={16} /> : <Square size={16} />,
        title: (
          <span className={cx('palette-task', t.done && 'done')}>
            {t.priority > 0 && <b className="task-pri">{priorityLabel(t.priority)}</b>}
            <Marked text={plainTask(t.text)} terms={terms} />
          </span>
        ),
        subtitle: displayTitle(n) + (t.heading && t.heading !== n.title ? ` › ${t.heading}` : ''),
        meta: (
          <>
            {t.someday && (
              <span className="task-chip someday">
                <Archive size={12} /> Someday
              </span>
            )}
            {t.scheduled && (
              <span className={cx('task-chip', !t.done && t.scheduled <= now && 'now')}>
                <CalendarClock size={12} /> {shortDate(t.scheduled)}
              </span>
            )}
            {t.due && (
              <span className={cx('task-chip', late(t.due) && 'late', t.due === now && 'now')}>
                <CalendarDays size={12} /> Due {shortDate(t.due)}
              </span>
            )}
            {t.done && t.completed && <span className="task-chip done-on">Done {shortDate(t.completed)}</span>}
          </>
        ),
        // As from the Tasks view: the cursor lands at the end of the task, with nothing selected.
        run: () => openNoteAt(t.noteId, t.raw, [], true),
        noteId: t.noteId,
        side: () => openSideAt(t.noteId, t.raw, true),
      })
    }
    out.push(...noteItems.slice(NOTES_BEFORE_TASKS).map((item) => ({ ...item, group: noteItems.length > NOTES_BEFORE_TASKS && out.some((i) => i.group === 'Tasks') ? 'More notes' : 'Notes' })))
    if (!q.startsWith('#')) {
      for (const [tag, count] of tagCounts(notes)) {
        if (tag.toLowerCase().startsWith(lower) && out.length < 40) {
          out.push({ key: 't:' + tag, group: 'Tags', icon: <Hash size={16} />, title: tag, meta: <span>{count} notes</span>, run: () => go({ name: 'tag', tag }) })
        }
      }
      out.push(...[...named.slice(4), ...byKeyword].slice(0, 6).map(commandItem))
      if (!Object.values(notes).some((n) => n.title.toLowerCase() === lower)) {
        out.push({ key: 'create', group: 'Create', icon: <FilePlus2 size={16} />, title: `New note “${q}”`, run: () => createNote({ title: q }) })
      }
    }
    return out
  }, [query, notes, folders, recent, route, state.mode, moving])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    list.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item?: Item) => {
    if (!item) return
    close()
    item.run()
  }

  let group = ''
  return (
    <div className="overlay top" onMouseDown={close}>
      <div className="modal palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            placeholder={state.mode === 'moveTask' ? `Move “${state.task?.text ?? ''}” to which note?` : state.mode === 'outline' ? 'Jump to a heading in this note' : state.mode === 'template' ? 'New note from which template?' : state.mode === 'tag' ? `Tag “${notes[state.noteId || ''] ? displayTitle(notes[state.noteId || '']) : ''}” with…` : moving ? `Move “${displayTitle(moving)}” to…` : 'Search notes, #tags, a date like “next monday”, or > for commands'}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              else if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) (e.preventDefault(), setActive((a) => Math.min(items.length - 1, a + 1)))
              else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
              else if (e.key === 'Enter') {
                e.preventDefault()
                if (e.altKey && items[active]?.noteId) {
                  close()
                  if (items[active].side) items[active].side!()
                  else openSide(items[active].noteId!)
                } else if ((e.metaKey || e.ctrlKey) && query.trim() && !moving && state.mode === 'search') {
                  close()
                  createNote({ title: query.trim() })
                } else run(items[active])
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={list}>
          {items.length === 0 && <p className="palette-empty">{state.mode === 'outline' && !query ? 'This note has no headings yet. Start a line with # or ## to add one.' : state.mode === 'tag' && !query ? 'No other tags yet. Type one to create it.' : `Nothing matches “${query}”.`}</p>}
          {items.map((item, i) => {
            const header = item.group !== group
            group = item.group
            return (
              <div key={item.key}>
                {header && <div className="palette-group">{item.group}</div>}
                <button className={cx('palette-item', i === active && 'active')} onMouseMove={() => i !== active && setActive(i)} onClick={() => run(item)}>
                  <span className="palette-icon">{item.icon}</span>
                  <span className="palette-text">
                    <span className="palette-title">{item.title}</span>
                    {item.subtitle && <span className="palette-sub">{item.subtitle}</span>}
                  </span>
                  <span className="palette-meta">{item.meta}</span>
                </button>
              </div>
            )
          })}
        </div>
        {!moving && state.mode === 'search' && (
          <footer className="palette-foot">
            <span>
              <kbd>↑↓</kbd> navigate
            </span>
            <span>
              <kbd>
                <CornerDownLeft size={11} />
              </kbd>{' '}
              open
            </span>
            <span>
              <kbd>⌥↵</kbd> open to the side
            </span>
            <span>
              <kbd>⌘↵</kbd> create note from query
            </span>
          </footer>
        )}
      </div>
    </div>
  )
}
