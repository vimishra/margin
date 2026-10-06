import { useMemo, useState } from 'react'
import {
  BookMarked,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Home,
  Hourglass,
  Keyboard,
  LayoutTemplate,
  Users,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sun,
  SunMoon,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  createFolder,
  deleteFolder,
  findDaily,
  go,
  newMeeting,
  newNote,
  openDaily,
  openFromClick,
  openMenu,
  openNote,
  renameFolder,
  setPref,
  ui,
  updateNote,
  useStore,
} from '../store'
import type { Route } from '../types'
import { tagCounts } from '../lib/links'
import { ALT, MOD, cx, displayTitle, local, today } from '../lib/util'
import { NoteIcon, noteMenu } from './bits'
import { MiniCalendar } from './MiniCalendar'
import logo from '../assets/logo.svg'
import { hint } from '../shortcuts'

interface TreeNode {
  path: string
  name: string
  children: TreeNode[]
}

function buildTree(folders: string[]): TreeNode[] {
  const roots: TreeNode[] = []
  const byPath = new Map<string, TreeNode>()
  for (const path of [...folders].sort((a, b) => a.localeCompare(b))) {
    const parts = path.split('/')
    const node: TreeNode = { path, name: parts[parts.length - 1], children: [] }
    byPath.set(path, node)
    const parent = byPath.get(parts.slice(0, -1).join('/'))
    ;(parent ? parent.children : roots).push(node)
  }
  return roots
}

function NavItem({ icon, label, count, active, hint, onClick }: { icon: React.ReactNode; label: string; count?: number; active?: boolean; hint?: string; onClick: () => void }) {
  return (
    <button className={cx('nav-item', active && 'active')} onClick={onClick} title={hint}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  )
}

export function Sidebar() {
  const notes = useStore((s) => s.notes)
  const folders = useStore((s) => s.folders)
  const route = useStore((s) => s.route)
  const showCalendar = useStore((s) => s.settings.sidebarCalendar)
  const hidden = useStore((s) => s.settings.hiddenSections) || []
  const shown = (id: string) => !hidden.includes(id)
  const [collapsed, setCollapsed] = useState<string[]>(() => local.get('collapsed', []))
  const [allTags, setAllTags] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const list = useMemo(() => Object.values(notes), [notes])
  const tree = useMemo(() => buildTree(folders), [folders])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of list) {
      const parts = n.folder ? n.folder.split('/') : []
      for (let i = 1; i <= parts.length; i++) {
        const p = parts.slice(0, i).join('/')
        m.set(p, (m.get(p) || 0) + 1)
      }
    }
    return m
  }, [list])
  const pinned = useMemo(() => list.filter((n) => n.pinned).sort((a, b) => a.title.localeCompare(b.title)), [list])
  const tags = tagCounts(notes)
  const todayNote = findDaily(today())
  const is = (name: Route['name']) => route.name === name
  const activeNote = route.name === 'note' ? route.id : ''

  const toggle = (path: string) => {
    const next = collapsed.includes(path) ? collapsed.filter((p) => p !== path) : [...collapsed, path]
    setCollapsed(next)
    local.set('collapsed', next)
  }

  const renderFolder = (node: TreeNode, depth: number): React.ReactNode => {
    const open = !collapsed.includes(node.path)
    const active = route.name === 'folder' && route.path === node.path
    return (
      <div key={node.path}>
        <button
          className={cx('nav-item folder', active && 'active', dropTarget === node.path && 'drop')}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => go({ name: 'folder', path: node.path })}
          onContextMenu={(e) =>
            openMenu(e, [
              { label: 'New note here', icon: <FilePlus2 size={15} />, onSelect: () => newNote('note', { folder: node.path }) },
              { label: 'New notebook inside', icon: <FolderPlus size={15} />, onSelect: () => createFolder(node.path) },
              { label: 'Rename', icon: <Pencil size={15} />, onSelect: () => renameFolder(node.path) },
              { separator: true },
              { label: 'Delete notebook', icon: <Trash2 size={15} />, danger: true, onSelect: () => deleteFolder(node.path) },
            ])
          }
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/margin-note')) {
              e.preventDefault()
              setDropTarget(node.path)
            }
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/margin-note')
            setDropTarget(null)
            if (id) updateNote(id, { folder: node.path })
          }}
        >
          <span
            className={cx('twisty', !node.children.length && 'leaf')}
            onClick={(e) => {
              e.stopPropagation()
              toggle(node.path)
            }}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span className="nav-icon">{active ? <FolderOpen size={16} /> : <Folder size={16} />}</span>
          <span className="nav-label">{node.name}</span>
          <span className="count">{counts.get(node.path) || ''}</span>
        </button>
        {open && node.children.map((c) => renderFolder(c, depth + 1))}
      </div>
    )
  }


  return (
    <nav className="sidebar">
      <div className="side-top">
        <div className="brand">
          <img className="logo" src={logo} alt="" />
          Margin
        </div>
        <button className="icon-btn sm" title={`Hide sidebar  ${hint('sidebar')}`} onClick={() => setPref('sidebar', false)}>
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button className="search-box" onClick={() => ui({ palette: { mode: 'search' } })}>
        <Search size={15} />
        <span>Search</span>
        <kbd>{hint('search')}</kbd>
      </button>

      <div className="side-actions">
        <button className="btn primary grow" onClick={() => newNote('note')} title={`New note  ${hint('new')}`}>
          <Plus size={15} /> New note
        </button>
        <button
          className="btn icon"
          title="New…"
          onClick={(e) =>
            openMenu(e, [
              { label: 'Note', icon: <FilePlus2 size={15} />, hint: hint('new'), onSelect: () => newNote('note') },
              { label: 'Canvas', icon: <LayoutDashboard size={15} />, onSelect: () => newNote('canvas') },
              { label: 'Scratch note', icon: <Hourglass size={15} />, hint: hint('scratch'), onSelect: () => newNote('scratch') },
              { label: 'Meeting note', icon: <Users size={15} />, hint: hint('meeting'), onSelect: () => void newMeeting() },
              { label: 'From a template…', icon: <LayoutTemplate size={15} />, onSelect: () => ui({ palette: { mode: 'template' } }) },
              { label: 'Research note', icon: <BookMarked size={15} />, onSelect: () => newNote('article') },
              { separator: true },
              { label: 'Notebook', icon: <FolderPlus size={15} />, onSelect: () => createFolder() },
            ])
          }
        >
          <ChevronDown size={15} />
        </button>
        <button className="btn icon" title={`Quick capture  ${hint('capture')}`} onClick={() => ui({ capture: true })}>
          <Zap size={15} />
        </button>
      </div>

      <div className="side-scroll">
        <div className="nav-group">
          <NavItem icon={<Home size={16} />} label="Home" active={is('home')} hint={hint('home')} onClick={() => go({ name: 'home' })} />
          {shown('today') && (
            <NavItem icon={<CalendarCheck size={16} />} label="Today" active={!!todayNote && activeNote === todayNote.id} hint={hint('daily')} onClick={() => openDaily()} />
          )}
          {shown('calendar') && (
            <NavItem icon={<CalendarDays size={16} />} label="Calendar" active={is('calendar')} hint={hint('calendar')} onClick={() => go({ name: 'calendar' })} />
          )}
          {shown('all') && <NavItem icon={<Files size={16} />} label="All notes" count={list.length} active={is('all')} hint={hint('all')} onClick={() => go({ name: 'all' })} />}
          {shown('research') && (
            <NavItem
              icon={<BookMarked size={16} />}
              label="Research"
              count={list.filter((n) => n.type === 'article').length}
              active={is('research')}
              hint={hint('research')}
              onClick={() => go({ name: 'research' })}
            />
          )}
          {shown('scratch') && (
            <NavItem icon={<Hourglass size={16} />} label="Scratch" count={list.filter((n) => n.type === 'scratch').length} active={is('scratch')} onClick={() => go({ name: 'scratch' })} />
          )}
        </div>

        {showCalendar && <MiniCalendar />}

        {shown('pinned') && pinned.length > 0 && (
          <div className="nav-group">
            <div className="nav-head">Pinned</div>
            {pinned.map((n) => (
              <button key={n.id} className={cx('nav-item', activeNote === n.id && 'active')} onClick={(e) => openFromClick(e, n.id)} onContextMenu={(e) => openMenu(e, noteMenu(n))}>
                <span className="nav-icon">
                  <NoteIcon note={n} />
                </span>
                <span className="nav-label">{displayTitle(n)}</span>
              </button>
            ))}
          </div>
        )}

        {shown('notebooks') && (
          <div className="nav-group">
            <div className="nav-head">
              Notebooks
              <button className="icon-btn xs" title="New notebook" onClick={() => createFolder()}>
                <Plus size={13} />
              </button>
            </div>
            {tree.length === 0 && <p className="nav-empty">No notebooks yet</p>}
            {tree.map((n) => renderFolder(n, 0))}
          </div>
        )}

        {shown('tags') && tags.length > 0 && (
          <div className="nav-group">
            <div className="nav-head">Tags</div>
            <div className="tag-cloud">
              {(allTags ? tags : tags.slice(0, 12)).map(([tag, count]) => (
                <button key={tag} className={cx('chip tag', route.name === 'tag' && route.tag === tag && 'active')} onClick={() => go({ name: 'tag', tag })}>
                  <Hash size={11} />
                  {tag}
                  <span className="count">{count}</span>
                </button>
              ))}
              {tags.length > 12 && (
                <button className="chip more" onClick={() => setAllTags(!allTags)}>
                  {allTags ? 'Show fewer' : `+${tags.length - 12} more`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="side-foot">
        <button className="btn ghost sm" title={`Settings  ${hint('prefs')}`} onClick={() => ui({ prefs: true })}>
          <Settings2 size={15} /> Settings
        </button>
        <button className="btn ghost sm" title="Keyboard shortcuts  ?" onClick={() => ui({ help: true })}>
          <Keyboard size={15} /> Shortcuts
        </button>
      </div>
    </nav>
  )
}
