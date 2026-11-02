import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, PanelLeft, Plus, X } from 'lucide-react'
import { closeSide, closeSideTab, closeTab, newNote, openMenu, openNote, openSide, setActivePane, setPref, ui, useStore } from '../store'
import { ALT, cx, displayTitle, local } from '../lib/util'
import { NoteIcon, noteMenu } from './bits'
import { hint } from '../shortcuts'

/** The row of open notes above a pane. Each pane (main and side) keeps its own tabs. */
export function TabBar({ side = false }: { side?: boolean }) {
  const notes = useStore((s) => s.notes)
  const tabs = useStore((s) => (side ? s.sideTabs : s.tabs))
  const route = useStore((s) => s.route)
  const sideNote = useStore((s) => s.side)
  const sidebar = useStore((s) => s.sidebar)
  const isActivePane = useStore((s) => !!s.side && s.activePane === (side ? 'side' : 'main'))
  const strip = useRef<HTMLDivElement>(null)
  const active = side ? sideNote || '' : route.name === 'note' ? route.id : ''
  const open = tabs.filter((id) => notes[id])

  useEffect(() => {
    strip.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  // Whether tabs are hidden off either end of the row: those ends fade, and the count button shows.
  const [hidden, setHidden] = useState({ left: false, right: false })
  const measure = () => {
    const el = strip.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setHidden((h) => (h.left === left && h.right === right ? h : { left, right }))
  }
  useLayoutEffect(measure, [open.length, active])
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  // A mouse wheel scrolls up and down; over the tabs it moves the row sideways. A trackpad's sideways swipe is left alone.
  const onWheel = (e: React.WheelEvent) => {
    const el = strip.current
    if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
  }
  const overflowing = hidden.left || hidden.right

  const here = (id: string) => (side ? openSide(id) : openNote(id))
  const there = (id: string) => (side ? openNote(id) : openSide(id))
  const close = (id: string) => (side ? closeSideTab(id) : closeTab(id))
  const closeOthers = (keep: string) => {
    local.set(side ? 'sideTabs' : 'tabs', [keep])
    useStore.setState(side ? { sideTabs: [keep] } : { tabs: [keep] })
    here(keep)
  }

  return (
    <div className={cx('tabbar', side && 'side', isActivePane && 'active-pane')} onMouseDownCapture={() => setActivePane(side ? 'side' : 'main')}>
      {!side && !sidebar && (
        <button className="icon-btn" title={`Show sidebar  ${hint('sidebar')}`} onClick={() => setPref('sidebar', true)}>
          <PanelLeft size={16} />
        </button>
      )}
      {!side && (
        <>
          <button className="icon-btn sm" title={`Back  ${hint('back')}`} onClick={() => history.back()}>
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn sm" title={`Forward  ${hint('forward')}`} onClick={() => history.forward()}>
            <ChevronRight size={16} />
          </button>
        </>
      )}
      <div className={cx('tabs', hidden.left && 'fade-left', hidden.right && 'fade-right')} ref={strip} onScroll={measure} onWheel={onWheel}>
        {open.map((id, i) => {
          const n = notes[id]
          return (
            <div
              key={id}
              className={cx('tab', id === active && 'active')}
              title={`${displayTitle(n)}${i < 9 ? `  ${ALT}${i + 1}` : ''}`}
              // ⌘-click or ⌥-click sends the note to the other pane.
              onClick={(e) => (e.metaKey || e.altKey || e.ctrlKey ? there(id) : here(id))}
              onAuxClick={(e) => e.button === 1 && close(id)}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Close tab', hint: hint('closeTab'), onSelect: () => close(id) },
                  { label: 'Close other tabs', onSelect: () => closeOthers(id) },
                  { label: side ? 'Open in the main pane' : 'Open in the side pane', onSelect: () => there(id) },
                  { separator: true },
                  ...noteMenu(n).filter((item) => item.label !== 'Open to the side'),
                ])
              }
            >
              <NoteIcon note={n} size={14} />
              <span className="tab-title">{displayTitle(n)}</span>
              <button
                className="tab-close"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  close(id)
                }}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
      {overflowing && (
        <button className="tab-count" title={`All ${open.length} open tabs${hint('tabList') ? `  ${hint('tabList')}` : ''}`} onClick={() => ui({ palette: { mode: 'tabs', pane: side ? 'side' : 'main' } })}>
          {open.length}
        </button>
      )}
      {side ? (
        <button className="icon-btn" title={`Close the side pane  ${hint('side')}`} onClick={() => closeSide()}>
          <X size={16} />
        </button>
      ) : (
        <button className="icon-btn" title={`New note  ${hint('new')}`} onClick={() => newNote('note')}>
          <Plus size={16} />
        </button>
      )}
    </div>
  )
}
