// The icon of each list under Tasks, the kind Things gives it. Used by the sidebar and by the ⌘K commands that open the lists.
import { Archive, BookCheck, CalendarDays, Flag, Inbox, Layers, Star } from 'lucide-react'

export function listIcon(list: string, size = 13) {
  switch (list) {
    case 'inbox':
      return <Inbox size={size} />
    case 'today':
      return <Star size={size} fill="currentColor" />
    case 'upcoming':
      return <CalendarDays size={size} />
    case 'anytime':
      return <Layers size={size} />
    case 'someday':
      return <Archive size={size} />
    case 'done':
      return <BookCheck size={size} />
    case 'overdue':
      return <Flag size={size} fill="currentColor" />
    default:
      return null
  }
}

/** The colour of a list's icon, as a CSS value; empty for lists that have none. */
export function listColor(list: string) {
  return ['inbox', 'today', 'upcoming', 'anytime', 'someday'].includes(list) ? `var(--list-${list})` : list === 'done' ? 'var(--list-logbook)' : ''
}
