import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { captureText, dismissToast, ui, useStore, type CaptureTarget } from '../store'
import { shortcutGroups } from '../commands'
import { MOD, cx, local } from '../lib/util'

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
]

export function QuickCapture() {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<CaptureTarget>(() => useStore.getState().settings.captureTarget)
  const close = () => ui({ capture: false })
  const save = () => {
    if (!text.trim()) return close()
    captureText(text, target)
    close()
  }
  return (
    <div className="overlay top" onMouseDown={close}>
      <div className="modal capture" onMouseDown={(e) => e.stopPropagation()}>
        <textarea
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
            }
          }}
        />
        <footer>
          <div className="seg sm">
            {TARGETS.map(([t, label, title]) => (
              <button key={t} className={cx(target === t && 'on')} title={title} onClick={() => setTarget(t)}>
                {label}
              </button>
            ))}
          </div>
          <span className="capture-hint">
            <kbd>Tab</kbd> destination · <kbd>⇧↵</kbd> new line · <kbd>↵</kbd> save
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
