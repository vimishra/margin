import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import { RotateCcw, X } from 'lucide-react'
import { api } from '../api'
import { toast, ui, updateNote, useStore } from '../store'
import { splitContent } from '../lib/canvas'
import { cx, displayTitle } from '../lib/util'
import { Preview } from './Preview'

function when(ts: number): { day: string; time: string } {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return {
    day: today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

export function HistoryModal({ id }: { id: string }) {
  const note = useStore((s) => s.notes[id])
  const [versions, setVersions] = useState<number[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [view, setView] = useState<'diff' | 'preview'>('diff')
  const close = () => ui({ historyFor: null })

  useEffect(() => {
    api
      .versions(id)
      .then((r) => {
        setVersions(r.versions)
        setSelected(r.versions[0] ?? null)
      })
      .catch(() => setVersions([]))
  }, [id])

  useEffect(() => {
    if (selected === null) return
    let stale = false
    setContent(null)
    api.version(id, selected).then((r) => !stale && setContent(r.content))
    return () => {
      stale = true
    }
  }, [id, selected])

  const diff = useMemo(() => (content === null || !note ? [] : diffLines(content, note.content)), [content, note])
  const changed = diff.some((p) => p.added || p.removed)

  if (!note) return null
  let lastDay = ''

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal history" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()} tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2>Version history</h2>
            <p>{displayTitle(note)}</p>
          </div>
          <div className="seg sm">
            <button className={cx(view === 'diff' && 'on')} onClick={() => setView('diff')}>
              Changes
            </button>
            <button className={cx(view === 'preview' && 'on')} onClick={() => setView('preview')}>
              Preview
            </button>
          </div>
          <button
            className="btn primary"
            disabled={content === null || !changed}
            onClick={() => {
              updateNote(id, { content: content! })
              toast('Version restored')
              close()
            }}
          >
            <RotateCcw size={14} /> Restore this version
          </button>
          <button className="icon-btn" onClick={close} title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="history-body">
          <nav className="history-list">
            {versions === null && <p className="pane-empty">Loading…</p>}
            {versions?.length === 0 && <p className="pane-empty">No saved versions yet. A snapshot is kept every few minutes while you edit.</p>}
            {versions?.map((ts) => {
              const w = when(ts)
              const header = w.day !== lastDay
              lastDay = w.day
              return (
                <div key={ts}>
                  {header && <div className="history-day">{w.day}</div>}
                  <button className={cx('history-item', selected === ts && 'on')} onClick={() => setSelected(ts)}>
                    {w.time}
                  </button>
                </div>
              )
            })}
          </nav>
          <div className="history-view">
            {content === null ? (
              versions?.length ? <p className="pane-empty">Loading…</p> : null
            ) : view === 'preview' ? (
              <Preview source={splitContent(content).page} />
            ) : !changed ? (
              <p className="pane-empty">This version is the same as the current note.</p>
            ) : (
              <>
                <p className="diff-legend">
                  <span className="del">Red</span> is in this version only, <span className="add">green</span> was added since.
                </p>
                <pre className="diff">
                  {diff.map((part, i) => (
                    <span key={i} className={part.removed ? 'del' : part.added ? 'add' : ''}>
                      {part.value}
                    </span>
                  ))}
                </pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
