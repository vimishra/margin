import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, Workflow, X } from 'lucide-react'
import { captureText, captureToNote, dismissToast, ui, useStore, type CaptureTarget } from '../store'
import type { Note } from '../types'
import { headings } from '../lib/markdown'
import { splitContent } from '../lib/canvas'
import { openGuide, shortcutGroups } from '../commands'
import { MOD, cx, displayTitle, local } from '../lib/util'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function Menu() {
  const menu = useStore((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(menu.alignRight ? menu.x - width : menu.x, window.innerWidth - width - 8))
    const top = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))
    setPos({ left, top })
    ref.current.focus()
  }, [menu])

  if (!menu) return null
  const close = () => ui({ menu: null })
  return (
    <div className="menu-layer" onMouseDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
      <div
        ref={ref}
        className="menu"
        style={pos}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button')]
          const i = items.indexOf(document.activeElement as HTMLButtonElement)
          if (e.key === 'Escape') close()
          else if (e.key === 'ArrowDown') (e.preventDefault(), items[(i + 1) % items.length]?.focus())
          else if (e.key === 'ArrowUp') (e.preventDefault(), items[(i - 1 + items.length) % items.length]?.focus())
        }}
      >
        {menu.items.map((item, i) =>
          item.separator ? (
            <hr key={i} />
          ) : (
            <button
              key={i}
              className={cx(item.danger && 'danger')}
              onClick={() => {
                close()
                item.onSelect?.()
              }}
            >
              <span className="menu-icon">{item.checked ? <Check size={15} /> : item.icon}</span>
              <span className="menu-label">{item.label}</span>
              {item.hint && <kbd>{item.hint}</kbd>}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

export function AskDialog() {
  const asking = useStore((s) => s.asking)
  const input = useRef<HTMLInputElement | null>(null)
  // The box starts with its text already in place and selected, so typing replaces it (renaming, for example).
  const prepare = (el: HTMLInputElement | null) => {
    input.current = el
    if (el && !el.dataset.ready) {
      el.dataset.ready = '1'
      el.focus()
      el.select()
    }
  }
  if (!asking) return null
  const withInput = asking.input !== false
  const submit = () => asking.resolve(withInput ? input.current?.value ?? '' : '')
  return (
    <div className="overlay" onMouseDown={() => asking.resolve(null)}>
      <form
        className="modal ask"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && asking.resolve(null)}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2>{asking.title}</h2>
        {asking.message && <p>{asking.message}</p>}
        {withInput && (
          <input key={asking.title + (asking.initial || '')} ref={prepare} defaultValue={asking.initial || ''} placeholder={asking.placeholder} />
        )}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => asking.resolve(null)}>
            Cancel
          </button>
          <button type="submit" className={cx('btn', asking.danger ? 'danger' : 'primary')} autoFocus={!withInput}>
            {asking.confirmLabel || 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function HelpModal() {
  const close = () => ui({ help: false })
  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal help" tabIndex={-1} ref={(el) => el?.focus()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <header className="modal-head">
          <h2>Keyboard shortcuts</h2>
          <button className="btn ghost sm" onClick={() => openGuide('user-guide')}>
            <BookOpen size={15} /> User guide
          </button>
          <button className="btn ghost sm" onClick={() => openGuide('operations')}>
            <BookOpen size={15} /> Routine
          </button>
          <button className="btn ghost sm" onClick={() => openGuide('design')}>
            <Workflow size={15} /> Design guide
          </button>
          <button className="icon-btn" onClick={close} title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="help-grid">
          {shortcutGroups().map(([group, rows]) => (
            <section key={group}>
              <h3>{group}</h3>
              {rows.map(([keys, label]) => (
                <div key={keys} className="help-row">
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

const TARGETS: [CaptureTarget, string, string][] = [
  ['daily', "Today's note", 'Lands on today’s daily note'],
  ['scratch', 'Scratch', 'A temporary note that expires on its own'],
  ['inbox', 'Inbox', 'A new note in the Inbox notebook'],
  ['note', 'A note…', 'Added to a note you choose, under a heading if you like'],
]

export function QuickCapture() {
  const notes = useStore((s) => s.notes)
  const [text, setText] = useState('')
  const [target, setTarget] = useState<CaptureTarget>(() => useStore.getState().settings.captureTarget)
  // The note chosen last time is offered again, so a regular destination takes no extra steps.
  const [dest, setDest] = useState(() => local.get<{ id: string; heading: string }>('captureNote', { id: '', heading: '' }))
  const [picking, setPicking] = useState(false)
  const [find, setFind] = useState('')
  const [active, setActive] = useState(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const chosen = notes[dest.id] as Note | undefined
  const sections = useMemo(() => (chosen ? headings(splitContent(chosen.content).page) : []), [chosen])
  const heading = sections.some((h) => h.text === dest.heading) ? dest.heading : ''
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase()
    return Object.values(notes)
      .filter((n) => n.type !== 'scratch' && (!q || displayTitle(n).toLowerCase().includes(q)))
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 6)
  }, [notes, find])
  const choosing = target === 'note' && (picking || !chosen)

  const close = () => ui({ capture: false })
  const save = () => {
    if (!text.trim()) return close()
    if (target === 'note') {
      if (!chosen) return setPicking(true)
      captureToNote(text, chosen.id, heading)
    } else captureText(text, target)
    close()
  }
  const choose = (n: Note) => {
    setDest({ id: n.id, heading: n.id === dest.id ? heading : '' })
    setPicking(false)
    setFind('')
    area.current?.focus()
  }
  return (
    <div className="overlay top" onMouseDown={close}>
      <div className="modal capture" onMouseDown={(e) => e.stopPropagation()}>
        <textarea
          ref={area}
          autoFocus
          value={text}
          rows={4}
          placeholder="Capture a thought, a link, a to-do…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            } else if (e.key === 'Tab') {
              e.preventDefault()
              const i = TARGETS.findIndex(([t]) => t === target)
              setTarget(TARGETS[(i + (e.shiftKey ? TARGETS.length - 1 : 1)) % TARGETS.length][0])
            } else if (e.key === 'ArrowDown' && e.altKey && target === 'note') {
              e.preventDefault()
              setPicking(true)
            }
          }}
        />
        {target === 'note' && (
          <div className="capture-dest">
            {choosing ? (
              <>
                <input
                  ref={(el) => picking && el?.focus()}
                  value={find}
                  placeholder="Which note? Type to search…"
                  onChange={(e) => (setFind(e.target.value), setActive(0))}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(matches.length - 1, i + 1)))
                    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(0, i - 1)))
                    else if (e.key === 'Enter' && matches[active]) (e.preventDefault(), choose(matches[active]))
                    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), setPicking(false), area.current?.focus())
                  }}
                />
                <div className="capture-notes">
                  {matches.map((n, i) => (
                    <button key={n.id} className={cx(i === active && 'active')} onMouseEnter={() => setActive(i)} onClick={() => choose(n)}>
                      {displayTitle(n)}
                      {n.folder && <span>{n.folder}</span>}
                    </button>
                  ))}
                  {matches.length === 0 && <p>No note matches.</p>}
                </div>
              </>
            ) : (
              <>
                <span className="capture-to">Add to</span>
                <button className="chip" title="Choose another note  ⌥↓" onClick={() => setPicking(true)}>
                  {displayTitle(chosen!)}
                </button>
                {sections.length > 0 && (
                  <>
                    <span className="capture-to">under</span>
                    <select value={heading} onChange={(e) => setDest({ id: chosen!.id, heading: e.target.value })}>
                      <option value="">End of the note</option>
                      {sections.map((h) => (
                        <option key={h.line} value={h.text}>
                          {'\u2003'.repeat(Math.max(0, h.level - 1))}
                          {h.text}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
        )}
        <footer>
          <div className="seg sm">
            {TARGETS.map(([t, label, title]) => (
              <button key={t} className={cx(target === t && 'on')} title={title} onClick={() => (setTarget(t), area.current?.focus())}>
                {label}
              </button>
            ))}
          </div>
          <span className="capture-hint">
            <kbd>Tab</kbd> destination · {target === 'note' && chosen ? <><kbd>⌥↓</kbd> change · </> : null}<kbd>↵</kbd> save
          </span>
          <button className="btn primary" onClick={save} title={`${MOD}↵`}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}

/** An image enlarged over the page. Click anywhere or press Esc to close. */
export function Lightbox() {
  const image = useStore((s) => s.lightbox)
  useEffect(() => {
    if (!image) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      ui({ lightbox: null })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [image])
  if (!image) return null
  return (
    <div className="overlay lightbox" onClick={() => ui({ lightbox: null })}>
      <img src={image.src} alt={image.alt} />
      {image.alt && <span className="lightbox-caption">{image.alt}</span>}
      <button className="icon-btn lightbox-close" title="Close  Esc">
        <X size={18} />
      </button>
    </div>
  )
}
