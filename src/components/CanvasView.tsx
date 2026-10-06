import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Copy, ImagePlus, Maximize, Minus, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import type { CanvasCard, CanvasData, Note } from '../types'
import { joinContent, parseCanvas, serializeCanvas, splitContent } from '../lib/canvas'
import { api } from '../api'
import { toast, updateNote } from '../store'
import { cx, local, uid } from '../lib/util'
import { Preview } from './Preview'

interface Viewport {
  x: number
  y: number
  zoom: number
}

const COLORS = ['', 'amber', 'green', 'blue', 'pink', 'purple']
const clampZoom = (z: number) => Math.min(2.5, Math.max(0.2, z))

function edgePath(a: CanvasCard, b: CanvasCard): string {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  if (Math.abs(dx) * (a.h + b.h) > Math.abs(dy) * (a.w + b.w)) {
    const x1 = dx > 0 ? a.x + a.w : a.x
    const x2 = dx > 0 ? b.x - 6 : b.x + b.w + 6
    const k = Math.max(30, Math.abs(x2 - x1) / 2)
    const s = dx > 0 ? 1 : -1
    return `M${x1},${ac.y} C${x1 + s * k},${ac.y} ${x2 - s * k},${bc.y} ${x2},${bc.y}`
  }
  const y1 = dy > 0 ? a.y + a.h : a.y
  const y2 = dy > 0 ? b.y - 6 : b.y + b.h + 6
  const k = Math.max(30, Math.abs(y2 - y1) / 2)
  const s = dy > 0 ? 1 : -1
  return `M${ac.x},${y1} C${ac.x},${y1 + s * k} ${bc.x},${y2 - s * k} ${bc.x},${y2}`
}

async function imageCardSize(file: File): Promise<{ w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const w = Math.min(360, Math.max(160, bmp.width))
    return { w: w + 26, h: Math.round((w * bmp.height) / bmp.width) + 26 }
  } catch {
    return { w: 320, h: 240 }
  }
}

export function CanvasView({ note }: { note: Note }) {
  const { page, canvas } = useMemo(() => splitContent(note.content), [note.content])
  const [data, setData] = useState<CanvasData>(() => parseCanvas(canvas))
  const [vp, setVp] = useState<Viewport>(() => local.get<Viewport>(`vp.${note.id}`, { x: 0, y: 0, zoom: 0 }))
  const [selected, setSelected] = useState<string[]>([])
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [connect, setConnect] = useState<{ from: string; x: number; y: number } | null>(null)

  const root = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const bodies = useRef(new Map<string, HTMLDivElement>())
  const lastRaw = useRef(canvas)
  const live = useRef({ data, vp, page, editing, draft })
  live.current = { data, vp, page, editing, draft }
  const dragged = useRef(false)

  // Pick up changes made elsewhere (quick capture, version restore, edits on disk).
  useEffect(() => {
    if (canvas !== lastRaw.current) {
      lastRaw.current = canvas
      setData(parseCanvas(canvas))
    }
  }, [canvas])

  function commit(next: CanvasData) {
    const raw = serializeCanvas(next)
    lastRaw.current = raw
    live.current.data = next
    setData(next)
    updateNote(note.id, { content: joinContent(live.current.page, raw) })
  }

  function fit(cards = live.current.data.cards) {
    const el = root.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (!cards.length) return setVp({ x: width / 2 - 130, y: height / 2 - 100, zoom: 1 })
    const x1 = Math.min(...cards.map((c) => c.x))
    const y1 = Math.min(...cards.map((c) => c.y))
    const x2 = Math.max(...cards.map((c) => c.x + c.w))
    const y2 = Math.max(...cards.map((c) => c.y + c.h))
    const zoom = clampZoom(Math.min(1, (width - 120) / (x2 - x1), (height - 160) / (y2 - y1)))
    setVp({ x: width / 2 - ((x1 + x2) / 2) * zoom, y: height / 2 - ((y1 + y2) / 2) * zoom, zoom })
  }

  useLayoutEffect(() => {
    if (!vp.zoom) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!vp.zoom) return
    const t = setTimeout(() => local.set(`vp.${note.id}`, vp), 300)
    return () => clearTimeout(t)
  }, [vp, note.id])

  const toWorld = (clientX: number, clientY: number) => {
    const rect = root.current!.getBoundingClientRect()
    const v = live.current.vp
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom }
  }

  function zoomBy(factor: number, cx?: number, cy?: number) {
    const rect = root.current!.getBoundingClientRect()
    const px = cx ?? rect.width / 2
    const py = cy ?? rect.height / 2
    setVp((v) => {
      const zoom = clampZoom(v.zoom * factor)
      const k = zoom / v.zoom
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }

  // Wheel pans; pinch or ⌘/Ctrl+wheel zooms around the pointer.
  useEffect(() => {
    const el = root.current!
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('textarea')) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top)
      } else {
        setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function track(onMove: (e: PointerEvent) => void, onUp?: (e: PointerEvent) => void) {
    const move = (e: PointerEvent) => onMove(e)
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onUp?.(e)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function finishEditing() {
    const { editing: id, draft: text, data: d } = live.current
    if (!id) return
    live.current.editing = null
    setEditing(null)
    const card = d.cards.find((c) => c.id === id)
    if (!card) return
    if (!text.trim()) {
      commit({ cards: d.cards.filter((c) => c.id !== id), edges: d.edges.filter((e) => e.from !== id && e.to !== id) })
      return
    }
    if (text !== card.text) commit({ ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, text } : c)) })
    // Grow the card if the text no longer fits.
    requestAnimationFrame(() => {
      const el = bodies.current.get(id)
      if (!el || el.scrollHeight <= el.clientHeight + 2) return
      const cur = live.current.data
      const grow = el.scrollHeight - el.clientHeight
      commit({ ...cur, cards: cur.cards.map((c) => (c.id === id ? { ...c, h: Math.min(900, c.h + grow + 4) } : c)) })
    })
  }

  function startEditing(card: CanvasCard) {
    finishEditing()
    setDraft(card.text)
    setEditing(card.id)
    setSelected([card.id])
  }

  function addCard(x: number, y: number, fields: Partial<CanvasCard> = {}, edit = true): CanvasCard {
    const card: CanvasCard = { id: uid(), x: Math.round(x), y: Math.round(y), w: 260, h: 140, text: '', ...fields }
    const d = live.current.data
    if (edit) {
      // An empty card only exists locally until it has text.
      setData({ ...d, cards: [...d.cards, card] })
      setDraft(card.text)
      setEditing(card.id)
    } else commit({ ...d, cards: [...d.cards, card] })
    setSelected([card.id])
    return card
  }

  function addAtCenter() {
    finishEditing()
    const rect = root.current!.getBoundingClientRect()
    const p = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const n = live.current.data.cards.length
    addCard(p.x - 130 + (n % 5) * 18, p.y - 70 + (n % 5) * 18)
  }

  async function addFiles(files: File[], x: number, y: number) {
    for (const [i, file] of files.entries()) {
      try {
        const { path, name } = await api.upload(file)
        const isImage = file.type.startsWith('image/')
        const isPdf = /\.pdf$/i.test(name)
        const size = isImage ? await imageCardSize(file) : isPdf ? { w: 380, h: 460 } : { w: 260, h: 80 }
        const label = name.replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '')
        addCard(x + i * 24, y + i * 24, { ...size, text: isImage || isPdf ? `![${label}](${path})` : `[${name}](${path})` }, false)
      } catch {
        toast(`Could not attach ${file.name}`)
      }
    }
  }

  function remove(ids: string[]) {
    const d = live.current.data
    commit({ cards: d.cards.filter((c) => !ids.includes(c.id)), edges: d.edges.filter((e) => !ids.includes(e.from) && !ids.includes(e.to)) })
    setSelected([])
  }

  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    finishEditing()
    setSelected([])
    setSelectedEdge(null)
    root.current?.focus()
    const start = { x: e.clientX, y: e.clientY, vp: live.current.vp }
    root.current?.classList.add('panning')
    track(
      (ev) => setVp({ ...start.vp, x: start.vp.x + ev.clientX - start.x, y: start.vp.y + ev.clientY - start.y }),
      () => root.current?.classList.remove('panning'),
    )
  }

  function onCardDown(e: React.PointerEvent, card: CanvasCard) {
    if (e.button !== 0) return
    e.stopPropagation()
    if (editing === card.id) return
    finishEditing()
    root.current?.focus()
    setSelectedEdge(null)
    let ids = selected
    if (e.shiftKey) ids = selected.includes(card.id) ? selected.filter((i) => i !== card.id) : [...selected, card.id]
    else if (!selected.includes(card.id)) ids = [card.id]
    setSelected(ids)
    const start = { x: e.clientX, y: e.clientY }
    const origin = new Map(live.current.data.cards.map((c) => [c.id, { x: c.x, y: c.y }]))
    dragged.current = false
    track(
      (ev) => {
        const dx = (ev.clientX - start.x) / live.current.vp.zoom
        const dy = (ev.clientY - start.y) / live.current.vp.zoom
        if (!dragged.current && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return
        dragged.current = true
        setData((d) => ({
          ...d,
          cards: d.cards.map((c) => (ids.includes(c.id) ? { ...c, x: origin.get(c.id)!.x + dx, y: origin.get(c.id)!.y + dy } : c)),
        }))
      },
      () => {
        if (dragged.current) commit(live.current.data)
      },
    )
  }

  function onResizeDown(e: React.PointerEvent, card: CanvasCard) {
    e.stopPropagation()
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    track(
      (ev) => {
        const z = live.current.vp.zoom
        const w = Math.max(140, card.w + (ev.clientX - start.x) / z)
        const h = Math.max(60, card.h + (ev.clientY - start.y) / z)
        setData((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, w, h } : c)) }))
      },
      () => commit(live.current.data),
    )
  }

  function onConnectDown(e: React.PointerEvent, card: CanvasCard) {
    e.stopPropagation()
    e.preventDefault()
    finishEditing()
    track(
      (ev) => setConnect({ from: card.id, ...toWorld(ev.clientX, ev.clientY) }),
      (ev) => {
        setConnect(null)
        const p = toWorld(ev.clientX, ev.clientY)
        const d = live.current.data
        const hit = [...d.cards].reverse().find((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h)
        if (hit?.id === card.id) return
        if (hit) {
          const has = d.edges.some((x) => (x.from === card.id && x.to === hit.id) || (x.from === hit.id && x.to === card.id))
          if (!has) commit({ ...d, edges: [...d.edges, { from: card.id, to: hit.id }] })
        } else if (Math.hypot(p.x - (card.x + card.w), p.y - (card.y + card.h / 2)) > 40) {
          // Dropping on empty space starts a new connected card there.
          const created: CanvasCard = { id: uid(), x: Math.round(p.x), y: Math.round(p.y - 70), w: 260, h: 140, text: '' }
          setData({ cards: [...d.cards, created], edges: [...d.edges, { from: card.id, to: created.id }] })
          setDraft('')
          setEditing(created.id)
          setSelected([created.id])
        }
      },
    )
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing) {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        e.stopPropagation()
        finishEditing()
        root.current?.focus()
      }
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (selected.length) remove(selected)
      else if (selectedEdge !== null) {
        commit({ ...data, edges: data.edges.filter((_, i) => i !== selectedEdge) })
        setSelectedEdge(null)
      }
    } else if (e.key === 'Enter' && selected.length === 1) {
      e.preventDefault()
      const card = data.cards.find((c) => c.id === selected[0])
      if (card) startEditing(card)
    } else if (e.key === 'Escape') {
      setSelected([])
      setSelectedEdge(null)
    } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setSelected(data.cards.map((c) => c.id))
    } else if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      addAtCenter()
    } else if (e.key.startsWith('Arrow') && selected.length) {
      e.preventDefault()
      const step = e.shiftKey ? 40 : 10
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      commit({ ...data, cards: data.cards.map((c) => (selected.includes(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c)) })
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    if (editing) return
    const rect = root.current!.getBoundingClientRect()
    const p = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const files = [...e.clipboardData.files]
    const text = e.clipboardData.getData('text/plain')
    if (files.length) {
      e.preventDefault()
      addFiles(files, p.x - 160, p.y - 120)
    } else if (text.trim()) {
      e.preventDefault()
      addCard(p.x - 130, p.y - 70, { text: text.trim(), h: Math.min(360, 70 + text.trim().split('\n').length * 24) }, false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const p = toWorld(e.clientX, e.clientY)
    const files = [...e.dataTransfer.files]
    const text = e.dataTransfer.getData('text/plain')
    if (files.length) addFiles(files, p.x, p.y)
    else if (text.trim()) addCard(p.x, p.y, { text: text.trim() }, false)
  }

  const byId = new Map(data.cards.map((c) => [c.id, c]))
  const single = selected.length === 1 && !editing ? byId.get(selected[0]) : undefined
  const grid = 24 * vp.zoom

  return (
    <div
      ref={root}
      className="canvas"
      tabIndex={0}
      style={{ backgroundPosition: `${vp.x}px ${vp.y}px`, backgroundSize: `${grid}px ${grid}px` }}
      onPointerDown={onBackgroundDown}
      onDoubleClick={(e) => {
        if (e.target !== root.current && !(e.target as HTMLElement).classList.contains('canvas-layer')) return
        const p = toWorld(e.clientX, e.clientY)
        addCard(p.x - 20, p.y - 20)
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="canvas-layer" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom || 1})` }}>
        <svg className="canvas-edges">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1,1 L9,5 L1,9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {data.edges.map((edge, i) => {
            const a = byId.get(edge.from)
            const b = byId.get(edge.to)
            if (!a || !b) return null
            const d = edgePath(a, b)
            return (
              <g key={i} className={cx('edge', selectedEdge === i && 'selected')}>
                <path d={d} className="edge-line" markerEnd="url(#arrow)" />
                <path
                  d={d}
                  className="edge-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    finishEditing()
                    setSelected([])
                    setSelectedEdge(i)
                    root.current?.focus()
                  }}
                />
              </g>
            )
          })}
          {connect && byId.get(connect.from) && (
            <path
              className="edge-line pending"
              d={edgePath(byId.get(connect.from)!, { id: '', x: connect.x, y: connect.y, w: 0, h: 0, text: '' })}
            />
          )}
        </svg>

        {data.cards.map((card) => {
          const isEditing = editing === card.id
          return (
            <div
              key={card.id}
              className={cx('card', card.color && `c-${card.color}`, selected.includes(card.id) && 'selected', isEditing && 'editing')}
              style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
              onPointerDown={(e) => onCardDown(e, card)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (!isEditing) startEditing(card)
              }}
              onClickCapture={(e) => {
                if (dragged.current) {
                  e.stopPropagation()
                  e.preventDefault()
                  dragged.current = false
                }
              }}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  value={draft}
                  placeholder="Write in markdown…  [[link]] a note, add $math$"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={finishEditing}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="card-body"
                  ref={(el) => {
                    if (el) bodies.current.set(card.id, el)
                    else bodies.current.delete(card.id)
                  }}
                >
                  <Preview
                    source={card.text}
                    onChange={(text) => commit({ ...data, cards: data.cards.map((c) => (c.id === card.id ? { ...c, text } : c)) })}
                  />
                </div>
              )}
              {!isEditing && (
                <>
                  <div className="card-connect" title="Drag to connect" onPointerDown={(e) => onConnectDown(e, card)} />
                  <div className="card-resize" onPointerDown={(e) => onResizeDown(e, card)} />
                </>
              )}
            </div>
          )
        })}

        {single && (
          <div
            className="card-tools"
            style={{ left: single.x, top: single.y, transform: `scale(${1 / vp.zoom}) translateY(calc(-100% - 8px))` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {COLORS.map((color) => (
              <button
                key={color}
                className={cx('swatch', color ? `c-${color}` : 'c-none', (single.color || '') === color && 'on')}
                title={color || 'Default'}
                onClick={() => commit({ ...data, cards: data.cards.map((c) => (c.id === single.id ? { ...c, color: color || undefined } : c)) })}
              />
            ))}
            <span className="sep" />
            <button className="icon-btn sm" title="Edit (Enter)" onClick={() => startEditing(single)}>
              <Pencil size={14} />
            </button>
            <button
              className="icon-btn sm"
              title="Duplicate"
              onClick={() => addCard(single.x + 24, single.y + 24, { ...single, id: uid(), x: single.x + 24, y: single.y + 24 }, false)}
            >
              <Copy size={14} />
            </button>
            <button className="icon-btn sm" title="Delete (⌫)" onClick={() => remove([single.id])}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {!data.cards.length && (
        <div className="canvas-empty">
          <StickyNote size={22} />
          <p>Double-click anywhere to add a card</p>
          <span>Paste or drop images and files. Scroll to pan, pinch or ⌘-scroll to zoom.</span>
        </div>
      )}

      <div className="canvas-bar" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button className="btn ghost" onClick={addAtCenter} title="New card (N)">
          <Plus size={15} /> Card
        </button>
        <button className="btn ghost" onClick={() => fileInput.current?.click()} title="Add an image or file">
          <ImagePlus size={15} /> File
        </button>
        <span className="sep" />
        <button className="icon-btn sm" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">
          <Minus size={15} />
        </button>
        <button className="zoom-label" onClick={() => zoomBy(1 / vp.zoom)} title="Reset zoom">
          {Math.round((vp.zoom || 1) * 100)}%
        </button>
        <button className="icon-btn sm" onClick={() => zoomBy(1.2)} title="Zoom in">
          <Plus size={15} />
        </button>
        <button className="icon-btn sm" onClick={() => fit()} title="Fit to screen">
          <Maximize size={14} />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const rect = root.current!.getBoundingClientRect()
            const p = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
            addFiles([...(e.target.files ?? [])], p.x - 160, p.y - 120)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
