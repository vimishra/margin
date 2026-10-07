export type NoteType = 'note' | 'daily' | 'article' | 'scratch'

export interface Note {
  id: string
  /** Path of the markdown file, relative to the vault. */
  path: string
  folder: string
  title: string
  type: NoteType
  tags: string[]
  pinned: boolean
  created: string
  updated: string
  expires?: string
  source?: string
  status?: string
  view?: 'canvas' | ''
  content: string
}

export type NotePatch = Partial<Omit<Note, 'id' | 'path' | 'created' | 'updated'>>

export type Route =
  | { name: 'home' }
  | { name: 'calendar' }
  | { name: 'journal' }
  | { name: 'all' }
  /** `view` is a built-in list ("today", "overdue"…) or "s:<id>" for a saved filter. */
  | { name: 'tasks'; view?: string }
  | { name: 'scratch' }
  | { name: 'research' }
  | { name: 'folder'; path: string }
  | { name: 'tag'; tag: string }
  | { name: 'note'; id: string }

export interface CanvasCard {
  id: string
  x: number
  y: number
  w: number
  h: number
  color?: string
  text: string
}

export interface CanvasEdge {
  from: string
  to: string
}

export interface CanvasData {
  cards: CanvasCard[]
  edges: CanvasEdge[]
}
