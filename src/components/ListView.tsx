import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, BookMarked, Files, Folder, FolderOpen, Hash, Hourglass, Pin, Plus, Search, Trash2 } from 'lucide-react'
import type { Note, Route } from '../types'
import { deleteNote, editFolderTags, go, inheritedTags, newNote, openFromClick, openMenu, openNote, updateNote, useStore } from '../store'
import { tagsOf } from '../lib/links'
import { cx, displayTitle, expiresIn, local, relTime, snippet, tagStyle } from '../lib/util'
import { NoteIcon, noteMenu } from './bits'

type Sort = 'updated' | 'created' | 'title' | 'expires'
const SORTS: Record<Sort, string> = { updated: 'Last edited', created: 'Date created', title: 'Title', expires: 'Expiring soonest' }

interface Config {
  title: string
  icon: React.ReactNode
  subtitle?: string
  filter: (n: Note) => boolean
  create: () => void
  createLabel: string
  empty: string
}

function configFor(route: Route): Config {
  switch (route.name) {
    case 'folder':
      return {
        title: route.path.split('/').pop() || '',
        icon: <FolderOpen size={20} />,
        subtitle: route.path.includes('/') ? route.path.split('/').slice(0, -1).join(' / ') : 'Notebook',
        filter: (n) => n.folder === route.path || n.folder.startsWith(route.path + '/'),
        create: () => newNote('note', { folder: route.path }),
        createLabel: 'New note',
        empty: 'This notebook is empty.',
      }
    case 'tag':
      return {
        title: route.tag,
        icon: <Hash size={20} />,
        subtitle: 'Tag',
        filter: (n) => tagsOf(n).includes(route.tag),
        create: () => newNote('note', { tags: [route.tag] }),
        createLabel: 'New note',
        empty: 'No notes carry this tag.',
      }
    case 'scratch':
      return {
        title: 'Scratch',
        icon: <Hourglass size={20} />,
        subtitle: 'Temporary notes that clean themselves up',
        filter: (n) => n.type === 'scratch',
        create: () => newNote('scratch'),
        createLabel: 'New scratch note',
        empty: 'No scratch notes. They are good for things you only need for a few days.',
      }
    case 'research':
      return {
        title: 'Research',
        icon: <BookMarked size={20} />,
        subtitle: 'Articles and sources, with your quotes, files and notes',
        filter: (n) => n.type === 'article',
        create: () => newNote('article'),
        createLabel: 'New research note',
        empty: 'Nothing here yet. Start a research note from a link.',
      }
    default:
      return {
        title: 'All notes',
        icon: <Files size={20} />,
        filter: () => true,
        create: () => newNote('note'),
        createLabel: 'New note',
        empty: 'No notes yet.',
      }
  }
}

export function ListView({ route }: { route: Route }) {
  const notes = useStore((s) => s.notes)
  const folders = useStore((s) => s.folders)
  useStore((s) => s.folderTags)
  const config = useMemo(() => configFor(route), [route])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<Sort>(() => (route.name === 'scratch' ? 'expires' : local.get<Sort>('sort', 'updated')))
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const filterInput = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = Object.values(notes).filter(
      (n) =>
        config.filter(n) &&
        (status === 'all' || (n.status || 'unread') === status) &&
        (!q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || tagsOf(n).some((t) => t.toLowerCase().includes(q))),
    )
    const by: Record<Sort, (a: Note, b: Note) => number> = {
      updated: (a, b) => b.updated.localeCompare(a.updated),
      created: (a, b) => b.created.localeCompare(a.created),
      title: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
      expires: (a, b) => (a.expires || '9').localeCompare(b.expires || '9'),
    }
    list.sort(by[sort])
    // Pinned notes float to the top unless sorting alphabetically.
    return sort === 'title' ? list : [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)]
  }, [notes, config, query, sort, status])

  const subfolders = route.name === 'folder' ? folders.filter((f) => f.startsWith(route.path + '/') && !f.slice(route.path.length + 1).includes('/')) : []

  useEffect(() => setActive(0), [query, sort, status])
  useEffect(() => root.current?.focus(), [])
  useEffect(() => {
    root.current?.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const sortMenu = (e: React.MouseEvent) =>
    openMenu(
      e,
      (Object.keys(SORTS) as Sort[])
        .filter((s) => s !== 'expires' || route.name === 'scratch')
        .map((s) => ({
          label: SORTS[s],
          checked: sort === s,
          onSelect: () => {
            setSort(s)
            if (s !== 'expires') local.set('sort', s)
          },
        })),
    )

  return (
    <div
      className="page"
      ref={root}
      tabIndex={-1}
      onKeyDown={(e) => {
        const typing = e.target instanceof HTMLInputElement
        if (e.key === 'ArrowDown' || (!typing && e.key === 'j')) (e.preventDefault(), setActive((a) => Math.min(rows.length - 1, a + 1)))
        else if (e.key === 'ArrowUp' || (!typing && e.key === 'k')) (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
        else if (e.key === 'Enter' && rows[active]) openNote(rows[active].id)
        else if (!typing && e.key === '/') (e.preventDefault(), filterInput.current?.focus())
        else if (typing && e.key === 'Escape') (setQuery(''), root.current?.focus())
      }}
    >
      <div className="page-inner list">
        <header className="list-head">
          <span className="list-icon">{config.icon}</span>
          <div className="list-title">
            <h1>{config.title}</h1>
            <p>
              {config.subtitle ? `${config.subtitle} · ` : ''}
              {rows.length} note{rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <button className="btn primary" onClick={config.create}>
            <Plus size={15} /> {config.createLabel}
          </button>
        </header>

        <div className="list-tools">
          <label className="filter">
            <Search size={15} />
            <input ref={filterInput} value={query} placeholder="Filter this list…  /" onChange={(e) => setQuery(e.target.value)} />
          </label>
          {route.name === 'research' && (
            <div className="seg sm">
              {['all', 'unread', 'reading', 'done'].map((s) => (
                <button key={s} className={cx(status === s && 'on')} onClick={() => setStatus(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
          <button className="btn ghost" onClick={sortMenu}>
            <ArrowDownUp size={14} /> {SORTS[sort]}
          </button>
        </div>

        {route.name === 'folder' && (
          <div className="folder-tags">
            <button className="btn ghost sm" title="Tags that notes get when they are created in or moved into this notebook" onClick={() => void editFolderTags(route.path)}>
              <Hash size={13} />
              {inheritedTags(route.path).length ? `Notes here are tagged ${inheritedTags(route.path).map((t) => '#' + t).join(' ')}` : 'Tags for notes here…'}
            </button>
          </div>
        )}

        {subfolders.length > 0 && (
          <div className="subfolders">
            {subfolders.map((f) => (
              <button key={f} className="chip" onClick={() => go({ name: 'folder', path: f })}>
                <Folder size={13} /> {f.split('/').pop()}
              </button>
            ))}
          </div>
        )}

        <div className="rows">
          {rows.length === 0 && <p className="list-empty">{query ? `Nothing matches “${query}”.` : config.empty}</p>}
          {rows.map((n, i) => (
            <div
              key={n.id}
              className={cx('row', i === active && 'active')}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/margin-note', n.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={(e) => openFromClick(e, n.id)}
              onMouseEnter={() => setActive(i)}
              onContextMenu={(e) => openMenu(e, noteMenu(n))}
            >
              <span className="row-icon">
                <NoteIcon note={n} />
              </span>
              <div className="row-main">
                <div className="row-title">
                  {displayTitle(n)}
                  {n.pinned && <Pin size={12} fill="currentColor" className="row-pin" />}
                </div>
                <div className="row-text">{snippet(n.content, 140) || 'Empty note'}</div>
              </div>
              <div className="row-tags">
                {n.type === 'article' && <span className={cx('status', n.status || 'unread')}>{n.status || 'unread'}</span>}
                {tagsOf(n)
                  .slice(0, 3)
                  .map((t) => (
                    <span key={t} className="chip tag static" style={tagStyle(t)}>
                      #{t}
                    </span>
                  ))}
              </div>
              <div className="row-meta">
                {n.type === 'scratch' && n.expires ? (
                  <span className="expiry">{expiresIn(n.expires)}</span>
                ) : (
                  <>
                    {route.name !== 'folder' && n.folder && <span className="where">{n.folder}</span>}
                    <span>{relTime(sort === 'created' ? n.created : n.updated)}</span>
                  </>
                )}
              </div>
              <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                {n.type === 'scratch' && (
                  <button className="btn sm" onClick={() => updateNote(n.id, { type: 'note', expires: '', folder: '', title: n.title.replace(/^Scratch — /, '') })}>
                    Keep
                  </button>
                )}
                <button className={cx('icon-btn sm', n.pinned && 'active')} title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => updateNote(n.id, { pinned: !n.pinned })}>
                  <Pin size={14} />
                </button>
                <button className="icon-btn sm" title="Move to trash" onClick={() => deleteNote(n.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
