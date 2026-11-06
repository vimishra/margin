// Recently deleted: the notes in this computer's trash, newest first. Each can be read, put back where it came
// from, or removed for good. The trash is kept per computer, outside the notes folder (see server/index.mjs).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { api, type TrashItem } from '../api'
import { ask, refreshTrash, restoreFromTrash, toast, useStore } from '../store'
import { renderMarkdown } from '../lib/markdown'
import { cx, relTime } from '../lib/util'

const where = (i: TrashItem) => (i.folder === null ? 'Notebook not known' : i.folder ? `From ${i.folder}` : 'From the top level')

export function TrashView() {
  const local = useStore((s) => s.local)
  const trashDays = useStore((s) => s.settings.trashDays)
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, string>>({})
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const filterInput = useRef<HTMLInputElement>(null)

  const reload = () =>
    api.trash().then(
      (r) => (setItems(r.items), useStore.setState({ trashCount: r.items.length })),
      (e) => (setItems([]), toast(`Could not read the trash: ${(e as Error).message}`)),
    )
  useEffect(() => {
    void reload()
    root.current?.focus()
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((i) => !q || `${i.title} ${i.folder ?? ''} ${i.snippet}`.toLowerCase().includes(q))
  }, [items, query])
  useEffect(() => setActive(0), [query])

  const toggle = (i: TrashItem) => {
    if (open === i.file) return setOpen(null)
    setOpen(i.file)
    if (preview[i.file] === undefined)
      api.trashContent(i.file).then(
        (r) => setPreview((p) => ({ ...p, [i.file]: r.content })),
        () => setPreview((p) => ({ ...p, [i.file]: '' })),
      )
  }
  const restore = async (i: TrashItem) => {
    if (await restoreFromTrash(i.file, false)) setItems((list) => (list ?? []).filter((x) => x.file !== i.file))
  }
  const removeOne = async (i: TrashItem) => {
    const ok = await ask({ title: `Delete “${i.title}” for good?`, message: 'It cannot be brought back afterwards.', input: false, confirmLabel: 'Delete for good', danger: true })
    if (ok === null) return
    const r = await api.removeTrash(i.file).catch((e) => (toast((e as Error).message), null))
    if (r) setItems(r.items), useStore.setState({ trashCount: r.items.length })
  }
  const emptyAll = async () => {
    const n = items?.length ?? 0
    const ok = await ask({ title: 'Empty the trash?', message: `${n} deleted note${n === 1 ? '' : 's'} will be removed for good. This cannot be undone.`, input: false, confirmLabel: 'Empty trash', danger: true })
    if (ok === null) return
    const r = await api.emptyTrash().catch((e) => (toast((e as Error).message), null))
    if (r) setItems(r.items), void refreshTrash()
  }

  return (
    <div
      className="page"
      ref={root}
      tabIndex={-1}
      onKeyDown={(e) => {
        const typing = e.target instanceof HTMLInputElement
        const row = rows[active]
        if (e.key === 'ArrowDown' || (!typing && e.key === 'j')) (e.preventDefault(), setActive((a) => Math.min(rows.length - 1, a + 1)))
        else if (e.key === 'ArrowUp' || (!typing && e.key === 'k')) (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
        else if (e.key === 'Enter' && row) (e.preventDefault(), toggle(row))
        else if (!typing && e.key === '/') (e.preventDefault(), filterInput.current?.focus())
        else if (typing && e.key === 'Escape') (setQuery(''), root.current?.focus())
      }}
    >
      <div className="page-inner list">
        <header className="list-head">
          <span className="list-icon">
            <Trash2 size={20} />
          </span>
          <div className="list-title">
            <h1>Recently deleted</h1>
            <p>
              On this computer · {items ? `${items.length} note${items.length === 1 ? '' : 's'}` : 'Loading…'}
              {trashDays > 0 && ` · removed after ${trashDays} days`}
            </p>
          </div>
          {!!items?.length && (
            <button className="btn danger" onClick={() => void emptyAll()}>
              Empty trash
            </button>
          )}
        </header>

        <div className="list-tools">
          <label className="filter">
            <Search size={15} />
            <input ref={filterInput} value={query} placeholder="Filter deleted notes…  /" onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        <div className="rows">
          {items && rows.length === 0 && (
            <p className="list-empty">
              {query
                ? `Nothing deleted matches “${query}”.`
                : 'Nothing here. Notes you delete on this computer wait here until you remove them, so you can bring them back.'}
            </p>
          )}
          {rows.map((i, n) => (
            <div key={i.file} className={cx('trash-item', open === i.file && 'open')}>
              <div className={cx('row', n === active && 'active')} onClick={() => toggle(i)} onMouseEnter={() => setActive(n)} title="Click to read it">
                <span className="row-icon">{open === i.file ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <div className="row-main">
                  <div className="row-title">{i.title}</div>
                  <div className="row-text">{i.snippet || 'Empty note'}</div>
                </div>
                <div className="row-meta">
                  <span className="where">{where(i)}</span>
                  <span>Deleted {relTime(new Date(i.deleted).toISOString())}</span>
                </div>
                <div className="trash-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm" title={i.folder === null ? 'Put it back, at the top level' : 'Put it back where it was'} onClick={() => void restore(i)}>
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button className="icon-btn sm" title="Delete for good" onClick={() => void removeOne(i)}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              {open === i.file && (
                <div className="trash-preview md" dangerouslySetInnerHTML={{ __html: preview[i.file] === undefined ? '<p>Loading…</p>' : preview[i.file] ? renderMarkdown(preview[i.file]) : '<p>Empty note</p>' }} />
              )}
            </div>
          ))}
        </div>

        {local && (
          <p className="trash-where">
            Kept on this computer only, in <code>{local}/trash</code>. Another computer has its own.
          </p>
        )}
      </div>
    </div>
  )
}
