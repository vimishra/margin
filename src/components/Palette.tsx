import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, CornerDownLeft, FilePlus2, Folder, FolderPlus, Hash, LayoutTemplate, Search, Users } from 'lucide-react'
import { createNote, go, openSide, openDaily, newFromTemplate, newMeeting, newTemplate, openNote, openNoteAt, templates, toast, ui, updateNote, useStore, type PaletteState } from '../store'
import { commands } from '../commands'
import { search } from '../lib/search'
import { tagCounts } from '../lib/links'
import { cx, dailyLabel, displayTitle, longDate, relTime, snippet } from '../lib/util'
import { parseDatePhrase } from '../lib/dates'
import { headings } from '../lib/markdown'
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
      const c = q.slice(1).trim().toLowerCase()
      return cmds.filter((x) => (x.label + ' ' + (x.keywords || '')).toLowerCase().includes(c)).map(commandItem)
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
    out.push(...hits.map((h) => noteItem(h.note.id, 'Notes', h.terms, h.snippet)!))
    if (!q.startsWith('#')) {
      for (const [tag, count] of tagCounts(notes)) {
        if (tag.toLowerCase().startsWith(lower) && out.length < 40) {
          out.push({ key: 't:' + tag, group: 'Tags', icon: <Hash size={16} />, title: tag, meta: <span>{count} notes</span>, run: () => go({ name: 'tag', tag }) })
        }
      }
      out.push(...cmds.filter((x) => (x.label + ' ' + (x.keywords || '')).toLowerCase().includes(lower)).slice(0, 5).map(commandItem))
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
            placeholder={state.mode === 'outline' ? 'Jump to a heading in this note' : state.mode === 'template' ? 'New note from which template?' : moving ? `Move “${displayTitle(moving)}” to…` : 'Search notes, #tags, a date like “next monday”, or > for commands'}
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
                  openSide(items[active].noteId!)
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
          {items.length === 0 && <p className="palette-empty">{state.mode === 'outline' && !query ? 'This note has no headings yet. Start a line with # or ## to add one.' : `Nothing matches “${query}”.`}</p>}
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
