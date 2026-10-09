import { BookMarked, CalendarDays, Columns2, Copy, FileText, FolderInput, History, Hourglass, LayoutDashboard, Pin, Trash2 } from 'lucide-react'
import type { Note } from '../types'
import { deleteNote, duplicateNote, openSide, ui, updateNote, type MenuItem } from '../store'

export function NoteIcon({ note, size = 16 }: { note: Note; size?: number }) {
  // Each kind of note has its own icon and colour, the same wherever a note is listed.
  if (note.type === 'daily') return <CalendarDays size={size} className="note-icon ni-daily" />
  if (note.type === 'article') return <BookMarked size={size} className="note-icon ni-article" />
  if (note.type === 'scratch') return <Hourglass size={size} className="note-icon ni-scratch" />
  if (note.view === 'canvas') return <LayoutDashboard size={size} className="note-icon ni-canvas" />
  return <FileText size={size} className="note-icon ni-note" />
}

export function noteMenu(note: Note): MenuItem[] {
  return [
    { label: note.pinned ? 'Unpin' : 'Pin', icon: <Pin size={15} />, onSelect: () => updateNote(note.id, { pinned: !note.pinned }) },
    { label: 'Open to the side', icon: <Columns2 size={15} />, onSelect: () => openSide(note.id) },
    { label: 'Move to notebook…', icon: <FolderInput size={15} />, onSelect: () => ui({ palette: { mode: 'move', noteId: note.id } }) },
    { label: 'Version history', icon: <History size={15} />, onSelect: () => ui({ historyFor: note.id }) },
    { label: 'Duplicate', icon: <Copy size={15} />, onSelect: () => duplicateNote(note.id) },
    { separator: true },
    { label: 'Move to trash', icon: <Trash2 size={15} />, danger: true, onSelect: () => deleteNote(note.id) },
  ]
}

/** Wrap the parts of `text` that match any of `terms` in <mark>. */
export function Marked({ text, terms }: { text: string; terms: string[] }) {
  const clean = terms.filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!clean.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${clean.join('|')})`, 'ig'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}
