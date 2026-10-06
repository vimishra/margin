import { useMemo, useState } from 'react'
import { ArrowUpRight, AtSign, ChevronDown, ChevronRight, CornerDownLeft, ExternalLink, Info, Link2, ListTree } from 'lucide-react'
import type { Note } from '../types'
import { openFromClick, toast, updateNote, useStore } from '../store'
import { backlinks, linkMentions, outgoing, titleIndex, unlinkedMentions, webLinks } from '../lib/links'
import { headings } from '../lib/markdown'
import { splitContent } from '../lib/canvas'
import { displayTitle, relTime, wordCount } from '../lib/util'
import { followLink } from './Preview'

function Section({ title, count, children, startOpen = true, hue, icon }: { title: string; count?: number; children: React.ReactNode; startOpen?: boolean; hue?: number; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <section className={hue === undefined ? 'pane-section' : 'pane-section toned'} style={hue === undefined ? undefined : ({ '--tone': hue } as React.CSSProperties)}>
      <button className="pane-head" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {icon}
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

/** A line of context with the plain-text mention of this note emphasised. */
function Mentioned({ line, title }: { line: string; title: string }) {
  const clean = line.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, label?: string) => label || target).replace(/[*_`]/g, '')
  const at = clean.toLowerCase().indexOf(title.toLowerCase())
  if (at < 0) return <p className="context">{clean}</p>
  return (
    <p className="context">
      {clean.slice(0, at)}
      <mark>{clean.slice(at, at + title.length)}</mark>
      {clean.slice(at + title.length)}
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
  const web = useMemo(() => webLinks(note), [note])
  const out = useMemo(() => {
    const index = titleIndex(notes)
    return outgoing(note).map((key) => ({ key, target: notes[index.get(key) || ''] as Note | undefined }))
  }, [notes, note])

  return (
    <aside className="pane">
      <Section title="Backlinks" count={links.length} hue={212} icon={<CornerDownLeft size={13} />}>
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

      <Section title="Unlinked mentions" count={mentions.length} hue={32} icon={<AtSign size={13} />} startOpen={mentions.length > 0 && mentions.length <= 5}>
        {mentions.length === 0 && <p className="pane-empty">No other note mentions “{note.title}” without linking to it.</p>}
        {mentions.map(({ note: n, lines, count }) => (
          <div key={n.id} className="backlink mention">
            <button className="backlink-title" title="⌘-click to open beside this note" onClick={(e) => openFromClick(e, n.id)}>
              {displayTitle(n)}
            </button>
            <button
              className="btn sm"
              title={`Turn ${count === 1 ? 'the mention' : `all ${count} mentions`} in that note into ${count === 1 ? 'a link' : 'links'} to this one`}
              onClick={() => {
                updateNote(n.id, { content: linkMentions(n.content, note.title) })
                toast(`Linked ${count === 1 ? 'the mention' : `${count} mentions`} in ${displayTitle(n)}`)
              }}
            >
              <Link2 size={13} /> Link
            </button>
            {lines.map((l, i) => (
              <Mentioned key={i} line={l} title={note.title} />
            ))}
          </div>
        ))}
      </Section>

      <Section title="Outgoing links" count={out.length + web.length} hue={150} icon={<ArrowUpRight size={13} />} startOpen={out.length + web.length > 0}>
        {out.length + web.length === 0 && <p className="pane-empty">This note does not link anywhere yet. Type [[ to link to another note.</p>}
        {out.map(({ key, target }) => (
          <button key={key} className={`pane-link${target ? '' : ' missing'}`} title={target ? '⌘-click to open beside this note' : 'This note does not exist yet. Click to create it.'} onClick={(e) => (target ? openFromClick(e, target.id) : followLink(key))}>
            <span className="pane-link-label">{target ? displayTitle(target) : key}</span>
            {!target && <span className="hint">create</span>}
          </button>
        ))}
        {web.map(({ href, label }) => (
          <a key={href} className="pane-link web" href={href} target="_blank" rel="noopener noreferrer" title={href}>
            <ExternalLink size={12} />
            <span>{label || href.replace(/^https?:\/\/(www\.)?/, '')}</span>
          </a>
        ))}
      </Section>

      {outline.length > 0 && note.view !== 'canvas' && (
        <Section title="Outline" hue={268} icon={<ListTree size={13} />}>
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

      <Section title="Details" startOpen={false} hue={340} icon={<Info size={13} />}>
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
