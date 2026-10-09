import { useEffect } from 'react'
import { FileQuestion } from 'lucide-react'
import { SIDEBAR_WIDTH, closeSideTab, closeTab, cycleTab, go, load, paneTabs, setSidebarWidth, setSideWidth, ui, useStore } from './store'
import type { Note } from './types'
import { commands } from './commands'
import { actionFor, eventCombo, recording, syncDesktopMenu } from './shortcuts'
import { desktop } from './desktop'
import { displayTitle, isMac } from './lib/util'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { HomeView } from './components/HomeView'
import { CalendarView } from './components/CalendarView'
import { ListView } from './components/ListView'
import { TasksView } from './components/TasksView'
import { JournalView } from './components/JournalView'
import { DatePicker } from './components/DatePicker'
import { NoteView } from './components/NoteView'
import { followLink } from './components/Preview'
import { Palette } from './components/Palette'
import { HistoryModal } from './components/HistoryModal'
import { SettingsModal } from './components/SettingsModal'
import { AskDialog, HelpModal, Lightbox, Menu, QuickCapture, Toasts } from './components/Overlays'

let lastRun = { id: '', source: '', at: 0 }

/** Run an action by id. Called from the keyboard, and from the desktop app's menu bar. */
export function runAction(id: string, source: 'key' | 'menu') {
  // A key press can arrive both ways in the desktop app; only act on it once.
  const now = Date.now()
  if (lastRun.id === id && lastRun.source !== source && now - lastRun.at < 300) return
  lastRun = { id, source, at: now }

  const s = useStore.getState()
  const current = s.route.name === 'note' ? s.route.id : ''
  if (id === 'back') history.back()
  else if (id === 'forward') history.forward()
  else if (id === 'search') ui({ palette: s.palette ? null : { mode: 'search' }, capture: false, menu: null })
  else if (id === 'prefs') ui({ prefs: !s.prefs, palette: null, capture: false, menu: null })
  else if (id === 'closeTab') {
    if (s.activePane === 'side' && s.side) closeSideTab(s.side)
    else if (current) closeTab(current)
  }
  else if (id === 'prevTab') cycleTab(-1)
  else if (id === 'nextTab') cycleTab(1)
  else commands().find((c) => c.id === id)?.run()
}

function onKey(e: KeyboardEvent) {
  if (recording.active) return
  const s = useStore.getState()
  const overlay = !!(s.palette || s.capture || s.help || s.prefs || s.historyFor || s.asking || s.menu || s.lightbox || s.datePick)
  const combo = eventCombo(e)

  if (combo) {
    let id = actionFor(combo)
    // Ctrl+[ and Ctrl+] also go back and forward on a Mac, unless they were given to something else.
    if (!id && isMac && combo === 'Ctrl+[') id = 'back'
    if (!id && isMac && combo === 'Ctrl+]') id = 'forward'
    if (id && (!overlay || id === 'search' || id === 'prefs')) {
      e.preventDefault()
      e.stopPropagation()
      runAction(id, 'key')
      return
    }
    const digit = /^Alt\+([1-9])$/.exec(combo)
    if (digit && !overlay) {
      const { tabs, open } = paneTabs()
      const tab = tabs[Number(digit[1]) - 1]
      if (tab) (e.preventDefault(), open(tab))
      return
    }
  }
  if (overlay) return

  const el = e.target as HTMLElement
  const typing = el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
  if (e.key === '?' && !typing) ui({ help: true })
}

/** A second note beside the main view, with a divider that can be dragged to resize. */
function SidePane({ note }: { note: Note }) {
  const width = useStore((s) => s.sideWidth)
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const row = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    const move = (ev: PointerEvent) => setSideWidth((row.right - ev.clientX) / row.width)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <>
      <div className="pane-resizer" onPointerDown={startResize} onDoubleClick={() => setSideWidth(0.5)} title="Drag to resize. Double-click for equal halves." />
      <div className="side-pane" style={{ flexBasis: `${width * 100}%` }}>
        <TabBar side />
        <NoteView key={note.id} note={note} slot="side" />
      </div>
    </>
  )
}

/** The edge of the sidebar: drag it to make the sidebar wider or narrower. */
function SidebarResizer() {
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const left = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect().left
    const move = (ev: PointerEvent) => setSidebarWidth(ev.clientX - left)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div className="pane-resizer sidebar-resizer" onPointerDown={start} onDoubleClick={() => setSidebarWidth(SIDEBAR_WIDTH)} title="Drag to resize the sidebar. Double-click for the usual width." />
}

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const error = useStore((s) => s.error)
  const route = useStore((s) => s.route)
  const sidebar = useStore((s) => s.sidebar)
  const note = useStore((s) => (s.route.name === 'note' ? s.notes[s.route.id] : undefined))
  const palette = useStore((s) => s.palette)
  const capture = useStore((s) => s.capture)
  const help = useStore((s) => s.help)
  const sideNote = useStore((s) => (s.loaded && s.side ? s.notes[s.side] : undefined))
  const prefs = useStore((s) => s.prefs)
  const historyFor = useStore((s) => s.historyFor)

  useEffect(() => {
    load()
    window.addEventListener('keydown', onKey, true)
    // Mouse back/forward buttons. Browsers handle these themselves; the desktop app does not.
    const onMouse = (e: MouseEvent) => {
      if (!desktop || (e.button !== 3 && e.button !== 4)) return
      e.preventDefault()
      if (e.type !== 'mouseup') return
      if (e.button === 3) history.back()
      else history.forward()
    }
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('mouseup', onMouse, true)
    // Menu items and global shortcuts of the desktop app.
    const off = desktop?.onCommand((id) => runAction(id, 'menu'))
    const onAction = (e: Event) => runAction((e as CustomEvent<string>).detail, 'key')
    window.addEventListener('margin:action', onAction)
    const offContext = desktop?.onContextAction?.((action) => {
      if (action.type === 'open') void followLink(action.target, action.side)
      else if (action.type === 'search') ui({ palette: { mode: 'search', query: action.query } })
      else window.dispatchEvent(new CustomEvent('margin:format', { detail: action.kind }))
    })
    syncDesktopMenu()
    // Mac apps quieten their selections when the window is not in front.
    const onFocus = () => document.documentElement.classList.toggle('window-inactive', !document.hasFocus())
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onFocus)
    onFocus()
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('mouseup', onMouse, true)
      off?.()
      offContext?.()
      window.removeEventListener('margin:action', onAction)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onFocus)
    }
  }, [])

  useEffect(() => {
    document.title = note ? `${displayTitle(note)} · Margin` : 'Margin'
  }, [note?.title, note])

  let view: React.ReactNode
  if (!loaded) view = <div className="blank" />
  else if (error && !Object.keys(useStore.getState().notes).length)
    view = (
      <div className="blank">
        <FileQuestion size={28} />
        <h2>Can’t reach your notes</h2>
        <p>The Margin server is not responding ({error}). Start it with “npm run dev” and reload.</p>
        <button className="btn primary" onClick={() => load()}>
          Try again
        </button>
      </div>
    )
  else if (route.name === 'home') view = <HomeView />
  else if (route.name === 'calendar') view = <CalendarView />
  else if (route.name === 'journal') view = <JournalView />
  else if (route.name === 'tasks') view = <TasksView view={route.view} />
  else if (route.name === 'note')
    view = note ? (
      <NoteView key={note.id} note={note} />
    ) : (
      <div className="blank">
        <FileQuestion size={28} />
        <h2>This note is gone</h2>
        <p>It may have been deleted, or a scratch note may have expired.</p>
        <button className="btn" onClick={() => go({ name: 'home' })}>
          Back to Home
        </button>
      </div>
    )
  else view = <ListView key={JSON.stringify(route)} route={route} />

  return (
    <div className={sidebar ? 'app' : 'app no-sidebar'}>
      {sidebar && <Sidebar />}
      {sidebar && <SidebarResizer />}
      <main className="main">
        <div className={sideNote ? 'view split' : 'view'}>
          <div className="pane-col">
            <TabBar />
            <div className="pane-view">{view}</div>
          </div>
          {sideNote && <SidePane note={sideNote} />}
        </div>
      </main>
      {palette && <Palette key={palette.mode + (palette.noteId || '')} state={palette} />}
      {capture && <QuickCapture />}
      {help && <HelpModal />}
      {prefs && <SettingsModal />}
      {historyFor && <HistoryModal id={historyFor} />}
      <Lightbox />
      <AskDialog />
      <Menu />
      <DatePicker />
      <Toasts />
    </div>
  )
}
