import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Check, Workflow, X } from 'lucide-react'
import { captureTask, captureText, dismissToast, ui, useStore } from '../store'
import { TaskInput, type TaskInputHandle } from './TaskCapture'
import { parseTaskText, priorityLabel, PRIORITIES, resolveTaskWords, shortDate } from '../lib/tasks'
import { actionFor, eventCombo, hint } from '../shortcuts'
import { openGuide, shortcutGroups } from '../commands'
import { cx, MOD, today } from '../lib/util'

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
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const groups = shortcutGroups()
    .map(([group, rows]) => [group, q && !group.toLowerCase().includes(q) ? rows.filter(([keys, label]) => `${label} ${keys}`.toLowerCase().includes(q)) : rows] as const)
    .filter(([, rows]) => rows.length)
  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal help" tabIndex={-1} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
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
        <div className="help-find">
          {/* Typing filters at once; ⌘F comes back here. Escape clears what is typed, then closes. */}
          <input
            autoFocus
            value={query}
            placeholder="Find a shortcut by name or keys…"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), setQuery(''))}
          />
        </div>
        <div className="help-grid">
          {groups.map(([group, rows]) => (
            <section key={group}>
              <h3>{group}</h3>
              {rows.map(([keys, label]) => (
                <div key={keys + label} className="help-row">
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
          {!groups.length && <p className="help-none">No shortcut matches “{query.trim()}”.</p>}
        </div>
      </div>
    </div>
  )
}

/** What has been typed, kept when switching between the note and the task box. */
let carried = ''

/** The quick capture box, for a note or for a task. Its own shortcuts switch between the two while it is open. */
export function QuickCapture() {
  const kind = useStore((s) => s.capture)
  return kind === 'task' ? <TaskCapture /> : <NoteCapture />
}

/** Note / Task, at the top of the capture box. */
function CaptureKind({ kind, text }: { kind: 'note' | 'task'; text: string }) {
  const to = (k: 'note' | 'task') => {
    if (k === kind) return
    carried = text
    ui({ capture: k })
  }
  return (
    <div className="capture-kind seg sm">
      <button className={cx(kind === 'note' && 'on')} title={`Capture a note  ${hint('capture')}`} onClick={() => to('note')}>
        Note
      </button>
      <button className={cx(kind === 'task' && 'on')} title={`Capture a task  ${hint('captureTask')}`} onClick={() => to('task')}>
        Task
      </button>
    </div>
  )
}

/** Pressing the shortcut of the other kind of capture while the box is open switches to it, keeping the text. */
function switchKeys(e: React.KeyboardEvent, kind: 'note' | 'task', text: string) {
  const combo = eventCombo(e.nativeEvent)
  const id = combo && actionFor(combo)
  if (id !== 'capture' && id !== 'captureTask') return
  e.preventDefault()
  e.stopPropagation()
  const next = id === 'capture' ? 'note' : 'task'
  if (next !== kind) {
    carried = text
    ui({ capture: next })
  }
}

/** The capture box for a note: always saved to today's daily note, with the time if that setting is on. */
function NoteCapture() {
  const [text, setText] = useState(() => {
    const t = carried
    carried = ''
    return t
  })
  const area = useRef<HTMLTextAreaElement>(null)
  // Text carried over from the task box: the cursor goes after it.
  useEffect(() => area.current?.setSelectionRange(area.current.value.length, area.current.value.length), [])
  const close = () => ui({ capture: false })
  const save = () => {
    if (text.trim()) void captureText(text)
    close()
  }
  return (
    <div className="overlay top" onMouseDown={close}>
      <div className="modal capture" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => switchKeys(e, 'note', text)}>
        <CaptureKind kind="note" text={text} />
        <textarea
          ref={area}
          autoFocus
          value={text}
          rows={4}
          placeholder="Capture a thought, a link, a note… It goes into today's note."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            }
          }}
        />
        <footer>
          <span className="capture-to">Saves to today's note</span>
          <span className="capture-hint">
            <kbd>⇧↵</kbd> new line · <kbd>↵</kbd> save
          </span>
          <button className="btn primary" onClick={save} title="↵">
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}

/**
 * The capture box for a task. It is saved as "- [ ] …", with dates typed in words turned into dates, at the end
 * of the Inbox note. With no day it waits in the Inbox list; with one it shows in Today or Upcoming.
 */
function TaskCapture() {
  const dayFirst = useStore((s) => s.settings.dayFirst)
  // Text carried over from the note box: its first line is the task, the rest its notes.
  const [[initial, initialNotes]] = useState(() => {
    const [first, ...rest] = carried.replace(/^\s+/, '').split('\n')
    carried = ''
    return [first ?? '', rest.join('\n').trim()]
  })
  const [text, setText] = useState(initial)
  const [notes, setNotes] = useState(initialNotes)
  const [saved, setSaved] = useState(0)
  const input = useRef<TaskInputHandle>(null)
  const notesBox = useRef<HTMLTextAreaElement>(null)
  const [inNotes, setInNotes] = useState(false)
  const both = () => [text, notes].filter((s) => s.trim()).join('\n')
  const task = useMemo(() => parseTaskText(resolveTaskWords(text, dayFirst)), [text, dayFirst])
  const now = today()
  // Where the task will show once saved, as the Inbox list's rules decide.
  const lands = task.someday ? 'Someday' : task.scheduled ? (task.scheduled <= now ? 'Today' : 'Upcoming') : 'the Inbox'

  const close = () => ui({ capture: false })
  const save = (again: boolean) => {
    if (!text.trim()) return again || close()
    void captureTask(resolveTaskWords(text, dayFirst), notes)
    if (!again) return close()
    // Shift+Enter: ready for the next one.
    input.current?.clear()
    setNotes('')
    setSaved((n) => n + 1)
    input.current?.focus()
  }
  return (
    <div className="overlay top" onMouseDown={close}>
      <div className="modal capture" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => switchKeys(e, 'task', both())}>
        <CaptureKind kind="task" text={both()} />
        <div className="capture-task">
          {/* Tab goes down to the notes. */}
          <TaskInput ref={input} initial={initial} onChange={setText} onSubmit={save} onCancel={close} onTab={(back) => !back && notesBox.current?.focus()} />
        </div>
        <div className="capture-reads">
          {text.trim() ? (
            <>
              {task.someday && <span className="task-chip someday">Someday</span>}
              {task.scheduled && <span className={cx('task-chip', task.scheduled <= now && 'now')}>When {shortDate(task.scheduled)}</span>}
              {task.due && <span className={cx('task-chip', task.due < now && 'late', task.due === now && 'now')}>Due {shortDate(task.due)}</span>}
              {task.priority > 0 && <span className="task-chip">{priorityLabel(task.priority)} · {PRIORITIES[task.priority]}</span>}
              {task.tags.map((tag) => (
                <span key={tag} className="task-chip">#{tag}</span>
              ))}
              <span className="capture-tip">{lands === 'the Inbox' ? 'No day yet: it waits in the Inbox until you decide.' : `It goes to ${lands}.`}</span>
            </>
          ) : (
            <span className="capture-tip">
              <kbd>&gt;</kbd> when · <kbd>@due(</kbd> deadline · <kbd>P</kbd> priority · <kbd>#</kbd> tag · <kbd>[[</kbd> link
              {saved > 0 && ` · ${saved} saved`}
            </span>
          )}
        </div>
        <textarea
          ref={notesBox}
          className="capture-notes"
          value={notes}
          rows={Math.min(8, Math.max(2, notes.split('\n').length))}
          placeholder="Notes (optional): saved on the lines under the task"
          spellCheck
          onFocus={() => setInNotes(true)}
          onBlur={() => setInNotes(false)}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            // Enter starts a new line here; ⌘↵ saves, ⇧⌘↵ saves and starts another, ⇧Tab goes back to the task.
            if (e.key === 'Escape') close()
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              save(e.shiftKey)
            } else if (e.key === 'Tab' && e.shiftKey) {
              e.preventDefault()
              input.current?.focus()
            }
          }}
        />
        <footer>
          <span className="capture-to">Saves to the Inbox note</span>
          <span className="capture-hint">
            {inNotes ? (
              <>
                <kbd>⇧⇥</kbd> task · <kbd>↵</kbd> new line · <kbd>{MOD}↵</kbd> save
              </>
            ) : (
              <>
                <kbd>⇥</kbd> notes · <kbd>⇧↵</kbd> save, add another · <kbd>↵</kbd> save
              </>
            )}
          </span>
          <button className="btn primary" onClick={() => save(false)}>
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
