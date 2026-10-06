import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Note } from '../types'
import { openFromClick, useStore } from '../store'
import { backlinks, outgoing, titleIndex, unlinkedMentions } from '../lib/links'
import { headings } from '../lib/markdown'
import { splitContent } from '../lib/canvas'
import { displayTitle, relTime, wordCount } from '../lib/util'
import { followLink } from './Preview'

function Section({ title, count, children, startOpen = true }: { title: string; count?: number; children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <section className="pane-section">
      <button className="pane-head" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </button>
      {open && children}
    </section>
  )
}

/** Show a line of context with the link to this note emphasised. */
function Context({ line, title }: { line: string; title: string }) {
  const parts = line.split(/(\[\[[^\]]+\]\])/g)
  return (
    <p className="context">
      {parts.map((part, i) => {
        const m = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/.exec(part)
        if (!m) return part.replace(/[*_`]/g, '')
        const label = m[2] || m[1]
        return m[1].trim().toLowerCase() === title.toLowerCase() ? <mark key={i}>{label}</mark> : <span key={i}>{label}</span>
      })}
    </p>
  )
}

export function RightPane({ note }: { note: Note }) {
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)
  const links = useMemo(() => backlinks(notes, note), [notes, note])
  const mentions = useMemo(() => unlinkedMentions(notes, note), [notes, note])
  const page = useMemo(() => splitContent(note.content).page, [note.content])
  const outline = useMemo(() => headings(page), [page])
  const out = useMemo(() => {
    const index = titleIndex(notes)
    return outgoing(note).map((key) => ({ key, target: notes[index.get(key) || ''] as Note | undefined }))
  }, [notes, note])

  return (
    <aside className="pane">
      <Section title="Backlinks" count={links.length}>
        {links.length === 0 && <p className="pane-empty">No notes link here yet. Type [[{note.title}]] in another note to connect them.</p>}
        {links.map(({ note: n, lines }) => (
          <button key={n.id} className="backlink" title="⌘-click to open beside this note" onClick={(e) => openFromClick(e, n.id)}>
            <span className="backlink-title">{displayTitle(n)}</span>
            {lines.map((l, i) => (
              <Context key={i} line={l} title={note.title} />
            ))}
          </button>
        ))}
      </Section>

      {mentions.length > 0 && (
        <Section title="Unlinked mentions" count={mentions.length} startOpen={false}>
          {mentions.map((n) => (
            <button key={n.id} className="pane-link" onClick={(e) => openFromClick(e, n.id)}>
              {displayTitle(n)}
            </button>
          ))}
        </Section>
      )}

      {out.length > 0 && (
        <Section title="Links from this note" count={out.length}>
          {out.map(({ key, target }) => (
            <button key={key} className={`pane-link${target ? '' : ' missing'}`} onClick={() => followLink(target ? target.title : key)}>
              {target ? displayTitle(target) : key}
              {!target && <span className="hint">create</span>}
            </button>
          ))}
        </Section>
      )}

      {outline.length > 0 && note.view !== 'canvas' && (
        <Section title="Outline">
          {outline.map((h) => (
            <button
              key={h.line}
              className="pane-link outline"
              style={{ paddingLeft: 10 + (h.level - 1) * 12 }}
              onClick={() => window.dispatchEvent(new CustomEvent('margin:line', { detail: h.line }))}
            >
              {h.text}
            </button>
          ))}
        </Section>
      )}

      <Section title="Details" startOpen={false}>
        <dl className="details">
          <dt>Words</dt>
          <dd>{wordCount(note.content).toLocaleString()}</dd>
          <dt>Edited</dt>
          <dd>{relTime(note.updated)}</dd>
          <dt>Created</dt>
          <dd>{new Date(note.created).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd>
          <dt>File</dt>
          <dd className="path" title={`${vault}/${note.path}`}>
            {note.path}
          </dd>
        </dl>
      </Section>
    </aside>
  )
}
