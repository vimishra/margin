import { memo, useEffect, useMemo, useRef } from 'react'
import { renderMarkdown, toggleTask } from '../lib/markdown'
import { resolver, titlesKey } from '../lib/links'
import { createNote, go, isProtectedNote, openNote, openSide, ui, useStore, ensureDaily } from '../store'
import { changedLine } from '../lib/archive'
import { afterTick } from '../lib/repeat'
import { isYmd } from '../lib/util'
import { openDaily } from '../store'
import { mountTaskBlocks } from './TaskBlock'

/** Open the note a wikilink points to, creating it when it does not exist yet. */
export async function followLink(target: string, side = false) {
  const id = resolver(useStore.getState().notes)(target)
  if (side) {
    // Open beside the current note, creating the note first if the link points at nothing yet.
    const note = id ? { id } : isYmd(target) ? await ensureDaily(target) : await createNote({ title: target }, false)
    if (note) openSide(note.id)
    return
  }
  if (id) openNote(id)
  else if (isYmd(target)) openDaily(target)
  else createNote({ title: target })
}

interface Props {
  source: string
  className?: string
  /** Called with new markdown when a task checkbox is ticked. */
  onChange?: (source: string) => void
  /** The note shown, when it is one: ticking in a note an outside program owns changes only the box. */
  noteId?: string
}

export const Preview = memo(function Preview({ source, className, onChange, noteId }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Re-render links when the set of note titles changes, not on every keystroke elsewhere.
  const titles = useStore((s) => titlesKey(s.notes))
  const html = useMemo(
    () => renderMarkdown(source, { resolve: resolver(useStore.getState().notes) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, titles],
  )

  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('.pdf-embed:empty').forEach((el) => {
      const src = el.dataset.src || ''
      const bar = document.createElement('div')
      bar.className = 'pdf-bar'
      const name = document.createElement('span')
      name.textContent = el.dataset.name || 'PDF'
      const link = document.createElement('a')
      link.href = src
      link.target = '_blank'
      link.rel = 'noopener'
      link.textContent = 'Open'
      bar.append(name, link)
      const frame = document.createElement('iframe')
      frame.src = src
      frame.title = el.dataset.name || 'PDF'
      frame.loading = 'lazy'
      el.append(bar, frame)
    })
  }, [html])

  useEffect(() => (ref.current ? mountTaskBlocks(ref.current) : undefined), [html])

  function onClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement
    // A tasks block handles its own clicks: its tasks belong to other notes.
    if (el.closest('.task-block-mount')) return
    const wiki = el.closest<HTMLElement>('a.wikilink')
    if (wiki) {
      e.preventDefault()
      // In the side pane links stay in that pane; ⌘-click sends them to the other one.
      const inSide = ref.current?.closest<HTMLElement>('.note')?.dataset.pane === 'side'
      const other = e.metaKey || e.altKey
      followLink(wiki.dataset.target || '', inSide ? !other : other)
      return
    }
    if (el instanceof HTMLImageElement && !el.closest('a')) {
      ui({ lightbox: { src: el.currentSrc || el.src, alt: el.alt.replace(/\|\d+$/, '') } })
      return
    }
    const tag = el.closest<HTMLElement>('a.hashtag')
    if (tag) {
      e.preventDefault()
      go({ name: 'tag', tag: tag.dataset.tag || '' })
      return
    }
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (!onChange) return e.preventDefault()
      const boxes = [...ref.current!.querySelectorAll('input[type=checkbox]')].filter((b) => !b.closest('.task-block-mount'))
      const s = useStore.getState().settings
      const next = toggleTask(source, boxes.indexOf(el), s.logCompletion)
      // Ticked: a repeating task comes back, and the ticked one goes to the end of its list, as in the editor.
      onChange(el.checked && !isProtectedNote(noteId) ? afterTick(next.split('\n'), [changedLine(source, next)], { sink: s.sinkDoneTasks }).join('\n') : next)
    }
  }

  return <div ref={ref} className={`md ${className || ''}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
})
