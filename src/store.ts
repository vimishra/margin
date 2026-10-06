import { create } from 'zustand'
import type { ReactNode } from 'react'
import { api } from './api'
import { desktop } from './desktop'
import type { Note, NotePatch, NoteType, Route } from './types'
import { appendCard } from './lib/canvas'
import { clock, displayTitle, isYmd, local, today } from './lib/util'
import { rewriteTask, shortDate, withDetails, type SavedTaskView, type Task, type TaskView } from './lib/tasks'

export interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

export interface MenuItem {
  label?: string
  icon?: ReactNode
  hint?: string
  danger?: boolean
  checked?: boolean
  separator?: boolean
  onSelect?: () => void
}

interface AskOptions {
  title: string
  message?: string
  placeholder?: string
  initial?: string
  confirmLabel?: string
  danger?: boolean
  /** When false the dialog is a plain confirmation. */
  input?: boolean
}

/** edit = live preview (rendered as you type), source = raw markdown, read = read-only page. */
export type Mode = 'edit' | 'source' | 'read'
export type Theme = 'system' | 'light' | 'dark'
export type CaptureTarget = 'daily' | 'scratch' | 'inbox' | 'note'

export type StyleKey = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'bold' | 'italic'
export interface TextStyle {
  /** Colour in the light theme, or '' to use the theme's normal text colour. */
  color: string
  /** Colour in the dark theme. '' means: a lightened version of the light-theme colour, chosen automatically. */
  darkColor?: string
  /** Size as a percentage of the note text size. */
  size: number
}
export const STYLE_KEYS: [StyleKey, string][] = [
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['h4', 'Heading 4'],
  ['h5', 'Heading 5'],
  ['bold', 'Bold'],
  ['italic', 'Italic'],
]
export const DEFAULT_STYLES: Record<StyleKey, TextStyle> = {
  h1: { color: '', size: 155 },
  h2: { color: '', size: 130 },
  h3: { color: '', size: 110 },
  h4: { color: '', size: 100 },
  h5: { color: '', size: 100 },
  bold: { color: '', size: 100 },
  italic: { color: '', size: 100 },
}

export interface Settings {
  startPage: 'home' | 'today' | 'last'
  newNoteFolder: 'current' | 'root' | 'inbox'
  inboxFolder: string
  weekStart: 'auto' | 'sunday' | 'monday'
  timeFormat: '24' | '12'
  /** How 06/10 is read when typing a date: day first (6 October) or month first (June 10). */
  dayFirst: boolean
  sidebarCalendar: boolean
  /** Sidebar sections the user has switched off; see SIDEBAR_SECTIONS. */
  hiddenSections: string[]
  tabs: boolean
  accent: string
  /** Font family for note text: an installed font's name, or 'system' for the default. */
  font: string
  /** Font family for code, or 'system' for the default monospace. */
  codeFont: string
  fontSize: number
  /** CSS font weight for note text: 400 is regular. */
  fontWeight: number
  styles: Record<StyleKey, TextStyle>
  /** Shortcut overrides by action id; '' turns a shortcut off. See src/shortcuts.ts. */
  shortcuts: Record<string, string>
  lineHeight: number
  /** Width in pixels of each level of list nesting. */
  listIndent: number
  imageBorder: 'none' | 'hairline' | 'shadow'
  /** Faint vertical lines marking each level of a nested list. */
  indentGuides: boolean
  toolbar: boolean
  spellcheck: boolean
  autoPair: boolean
  /** Show pasted Retina screenshots at the size they were on screen, not at double size. */
  imageActualSize: boolean
  /** Name pasted images after the note they are pasted into. */
  imageNoteName: boolean
  lineNumbers: boolean
  dailyView: 'canvas' | 'page'
  dailyFolder: string
  dailyTemplate: string
  captureTarget: CaptureTarget
  captureTime: boolean
  scratchDays: number
  scratchFolder: string
  templatesFolder: string
  meetingsFolder: string
  /** Date pattern for sub-folders inside the meetings notebook, e.g. YYYY/MMM. Empty for none. */
  meetingsSubfolder: string
  /** Add a link to each new meeting note in today's daily note. */
  meetingLink: boolean
  /** Task filters saved from the Tasks view; they show under Tasks in the sidebar. */
  taskViews: SavedTaskView[]
  /** Notebook for notes about people (1:1s). */
  peopleFolder: string
}

export const DEFAULT_SETTINGS: Settings = {
  startPage: 'home',
  newNoteFolder: 'current',
  inboxFolder: 'Inbox',
  weekStart: 'auto',
  timeFormat: '24',
  dayFirst: true,
  sidebarCalendar: true,
  hiddenSections: [],
  tabs: true,
  accent: 'indigo',
  font: 'system',
  codeFont: 'system',
  fontSize: 16,
  fontWeight: 400,
  styles: DEFAULT_STYLES,
  shortcuts: {},
  lineHeight: 1.7,
  listIndent: 28,
  imageBorder: 'hairline',
  indentGuides: true,
  toolbar: true,
  spellcheck: true,
  autoPair: true,
  imageActualSize: true,
  imageNoteName: true,
  lineNumbers: false,
  dailyView: 'canvas',
  dailyFolder: 'Daily',
  dailyTemplate: '',
  captureTarget: 'daily',
  captureTime: true,
  scratchDays: 7,
  scratchFolder: 'Scratch',
  templatesFolder: 'Templates',
  meetingsFolder: 'Meetings',
  meetingsSubfolder: 'YYYY/MMM',
  meetingLink: true,
  taskViews: [],
  peopleFolder: 'People',
}

/** Parts of the sidebar that can be switched off in Settings. Home and search always stay. */
export const SIDEBAR_SECTIONS: [string, string][] = [
  ['today', 'Today'],
  ['calendar', 'Calendar'],
  ['all', 'All notes'],
  ['tasks', 'Tasks'],
  ['research', 'Research'],
  ['scratch', 'Scratch'],
  ['pinned', 'Pinned'],
  ['recent', 'Recent'],
  ['notebooks', 'Notebooks'],
  ['tags', 'Tags'],
]

/** id, name, swatch colour */
export const ACCENTS: [string, string, string][] = [
  ['indigo', 'Indigo', '#5b5bd6'],
  ['blue', 'Blue', '#2b72d9'],
  ['teal', 'Teal', '#0f8f88'],
  ['green', 'Green', '#2f9150'],
  ['orange', 'Orange', '#d9731b'],
  ['rose', 'Rose', '#d6457a'],
  ['graphite', 'Graphite', '#6b6a66'],
]

const DEFAULT_MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"

/** CSS font-family for a font chosen in settings, falling back to the built-in stack. */
export function fontCss(family: string, mono = false): string {
  const fallback = mono ? DEFAULT_MONO : 'var(--font)'
  if (!family || family === 'system') return fallback
  // Values saved by earlier versions of the setting
  if (family === 'serif') return "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
  if (family === 'mono') return DEFAULT_MONO
  return `"${family.replace(/["\\]/g, '')}", ${fallback}`
}

export type PaletteState = null | { mode: 'search' | 'move' | 'template' | 'outline' | 'tag'; noteId?: string; query?: string }

interface State {
  loaded: boolean
  error: string | null
  vault: string
  /** Name of the folder inside the vault where images and other files are stored. */
  attachmentsFolder: string
  /** Tags that notes take on when created in, or moved into, a notebook. Kept in the notes folder's own config. */
  folderTags: Record<string, string[]>
  notes: Record<string, Note>
  folders: string[]
  route: Route
  tabs: string[]
  recent: string[]
  sidebar: boolean
  pane: boolean
  /** Page width in characters per line; 0 means use the full width. */
  width: number
  mode: Mode
  theme: Theme
  dirty: boolean
  palette: PaletteState
  capture: boolean
  help: boolean
  prefs: boolean
  /** Note shown in the second pane beside the main view, if any. */
  side: string | null
  /** Notes open as tabs in the side pane. */
  sideTabs: string[]
  /** Share of the width the side pane takes, 0.25 to 0.7. */
  sideWidth: number
  /** The pane that keyboard commands (search, lists, jump to heading) apply to. */
  activePane: 'main' | 'side'
  /** Set when a note is opened from a search result, so it can scroll to the match. */
  jump: { id: string; query: string; terms: string[]; pane?: 'main' | 'side' } | null
  settings: Settings
  historyFor: string | null
  /** Image shown enlarged over the page. */
  lightbox: { src: string; alt: string } | null
  toasts: Toast[]
  menu: { x: number; y: number; items: MenuItem[]; alignRight?: boolean } | null
  /** The small calendar for choosing a date, anchored to what was clicked. */
  datePick: { x: number; y: number; alignRight?: boolean; title: string; value?: string; removeLabel?: string; onPick: (date: string | null) => void } | null
  asking: (AskOptions & { resolve: (v: string | null) => void }) | null
}

const DAY = 86400000

export function parseHash(hash: string): Route {
  const [name, ...rest] = hash.replace(/^#\/?/, '').split('/')
  const arg = decodeURIComponent(rest.join('/'))
  switch (name) {
    case 'calendar':
    case 'all':
    case 'scratch':
    case 'research':
      return { name }
    case 'tasks':
      return arg ? { name, view: arg } : { name }
    case 'folder':
      return { name, path: arg }
    case 'tag':
      return arg ? { name, tag: arg } : { name: 'home' }
    case 'note':
      return arg ? { name, id: arg } : { name: 'home' }
    default:
      return { name: 'home' }
  }
}

export function routeHash(r: Route): string {
  if (r.name === 'folder') return `#/folder/${r.path.split('/').map(encodeURIComponent).join('/')}`
  if (r.name === 'tag') return `#/tag/${encodeURIComponent(r.tag)}`
  if (r.name === 'note') return `#/note/${r.id}`
  if (r.name === 'tasks' && r.view) return `#/tasks/${encodeURIComponent(r.view)}`
  return `#/${r.name}`
}

function loadSettings(): Settings {
  const saved = local.get<Partial<Settings>>('settings', {})
  // Spell check used to default to off. Turn it on once for settings saved back then; after that the user's choice stands.
  if (!local.get('spellcheckDefaultOn', false)) {
    local.set('spellcheckDefaultOn', true)
    saved.spellcheck = true
    if (Object.keys(saved).length > 1) local.set('settings', saved)
  }
  return { ...DEFAULT_SETTINGS, ...saved }
}

export const useStore = create<State>(() => ({
  loaded: false,
  error: null,
  vault: '',
  attachmentsFolder: 'attachments',
  folderTags: {},
  notes: {},
  folders: [],
  route: parseHash(location.hash),
  tabs: local.get<string[]>('tabs', []),
  recent: local.get<string[]>('recent', []),
  sidebar: local.get('sidebar', true),
  pane: local.get('pane', true),
  width: local.get('width', 90),
  mode: (['edit', 'source', 'read'] as Mode[]).find((m) => m === local.get<string>('mode', 'edit')) ?? 'edit',
  theme: local.get<Theme>('theme', 'system'),
  dirty: false,
  palette: null,
  capture: false,
  help: false,
  prefs: false,
  jump: null,
  side: local.get<string | null>('side', null),
  sideTabs: local.get<string[]>('sideTabs', []),
  sideWidth: local.get('sideWidth', 0.5),
  activePane: 'main',
  settings: loadSettings(),
  historyFor: null,
  lightbox: null,
  toasts: [],
  menu: null,
  datePick: null,
  asking: null,
}))

const get = useStore.getState
const set = useStore.setState

// ---------- routing ----------

function enterRoute(route: Route) {
  const s = get()
  if (route.name === 'note') {
    const tabs = !s.settings.tabs ? [route.id] : s.tabs.includes(route.id) ? s.tabs : [...s.tabs, route.id]
    const recent = [route.id, ...s.recent.filter((id) => id !== route.id)].slice(0, 60)
    local.set('tabs', tabs)
    local.set('recent', recent)
    set({ route, tabs, recent })
  } else {
    set({ route })
  }
}

export function go(route: Route) {
  const hash = routeHash(route)
  if (location.hash === hash) enterRoute(route)
  else location.hash = hash
}

export const openNote = (id: string) => go({ name: 'note', id })

// ---------- side pane ----------

export function openSide(id: string) {
  const s = get()
  const sideTabs = !s.settings.tabs ? [id] : s.sideTabs.includes(id) ? s.sideTabs : [...s.sideTabs, id]
  const recent = [id, ...s.recent.filter((x) => x !== id)].slice(0, 60)
  local.set('side', id)
  local.set('sideTabs', sideTabs)
  local.set('recent', recent)
  set({ side: id, sideTabs, recent, activePane: 'side' })
}

export function closeSide() {
  local.set('side', null)
  local.set('sideTabs', [])
  set({ side: null, sideTabs: [], activePane: 'main' })
}

/** Close one tab in the side pane; closing the last one closes the pane. */
export function closeSideTab(id: string) {
  const s = get()
  const open = s.sideTabs.filter((t) => s.notes[t])
  const idx = open.indexOf(id)
  const sideTabs = open.filter((t) => t !== id)
  if (!sideTabs.length) return closeSide()
  local.set('sideTabs', sideTabs)
  const side = s.side === id ? sideTabs[Math.min(Math.max(idx, 0), sideTabs.length - 1)] : s.side
  local.set('side', side)
  set({ sideTabs, side })
}

/** Exchange the notes in the two panes. */
export function swapPanes() {
  const s = get()
  const main = s.route.name === 'note' ? s.route.id : null
  if (!s.side || !main) return
  const side = s.side
  openSide(main)
  openNote(side)
}

export function setSideWidth(fraction: number) {
  const sideWidth = Math.min(0.7, Math.max(0.25, fraction))
  local.set('sideWidth', sideWidth)
  set({ sideWidth })
}

export const setActivePane = (pane: 'main' | 'side') => get().activePane !== pane && set({ activePane: pane })

/** The note that commands act on: the one in the pane you last clicked or typed in. */
export function currentNote(): Note | undefined {
  const s = get()
  if (s.activePane === 'side' && s.side && s.notes[s.side]) return s.notes[s.side]
  return s.route.name === 'note' ? s.notes[s.route.id] : undefined
}

/** Open a note from a click: ⌘-click or ⌥-click opens it in the side pane. */
export function openFromClick(e: { metaKey: boolean; altKey: boolean; ctrlKey: boolean }, id: string) {
  if (e.metaKey || e.altKey || e.ctrlKey) openSide(id)
  else openNote(id)
}

/** Open a note and scroll to where the search text first appears in it. */
export function openNoteAt(id: string, query: string, terms: string[]) {
  set({ jump: { id, query, terms } })
  openNote(id)
}

/** The same, in the side pane. */
export function openSideAt(id: string, query: string) {
  set({ jump: { id, query, terms: [], pane: 'side' } })
  openSide(id)
}

window.addEventListener('hashchange', () => enterRoute(parseHash(location.hash)))

// ---------- loading ----------

const same = (a: Note, b: Note) =>
  a.content === b.content &&
  a.updated === b.updated &&
  a.path === b.path &&
  a.title === b.title &&
  a.pinned === b.pinned &&
  a.type === b.type &&
  a.expires === b.expires &&
  a.status === b.status &&
  a.source === b.source &&
  a.view === b.view &&
  a.tags.join() === b.tags.join()

function mergeNotes(list: Note[]): Record<string, Note> {
  const prev = get().notes
  const next: Record<string, Note> = {}
  let changed = list.length !== Object.keys(prev).length
  for (const n of list) {
    const old = prev[n.id]
    if (old && same(old, n)) next[n.id] = old
    else {
      next[n.id] = n
      changed = true
    }
  }
  return changed ? next : prev
}

export async function load() {
  try {
    const data = await api.state()
    const first = !get().loaded
    set({ notes: mergeNotes(data.notes), folders: data.folders, vault: data.vault, attachmentsFolder: data.config?.attachments || 'attachments', folderTags: data.config?.folderTags || {}, loaded: true, error: null })
    // Opened without a specific page in the address: go to the start page chosen in settings.
    const { settings, recent, notes } = get()
    if (first && !location.hash.replace(/^#\/?/, '')) {
      const last = recent.find((id) => notes[id])
      if (settings.startPage === 'today') return void openDaily()
      if (settings.startPage === 'last' && last) return openNote(last)
    }
    enterRoute(get().route)
  } catch (e) {
    set({ error: (e as Error).message, loaded: true })
  }
}

/** Pick up edits made to the files outside the app. */
export async function refresh() {
  if (pending.size || !get().loaded) return
  try {
    const data = await api.state()
    if (pending.size) return
    set({ notes: mergeNotes(data.notes), folders: data.folders, error: null })
  } catch {
    /* server unreachable: keep what we have */
  }
}

// ---------- saving ----------

interface Pending {
  patch: NotePatch
  timer: number
  inflight: boolean
}
const pending = new Map<string, Pending>()

function schedule(id: string, patch: NotePatch, delay: number) {
  const p = pending.get(id) ?? { patch: {}, timer: 0, inflight: false }
  Object.assign(p.patch, patch)
  pending.set(id, p)
  clearTimeout(p.timer)
  p.timer = window.setTimeout(() => flush(id), delay)
  if (!get().dirty) set({ dirty: true })
}

async function flush(id: string) {
  const p = pending.get(id)
  if (!p || p.inflight) return
  clearTimeout(p.timer)
  const patch = p.patch
  p.patch = {}
  p.inflight = true
  try {
    const res = await api.updateNote(id, patch)
    set((s) => {
      const local = s.notes[id]
      if (!local) return s
      const notes = { ...s.notes }
      // Fields edited while the request was in flight stay as they are locally.
      notes[id] = { ...res.note, ...p.patch, content: local.content }
      for (const t of res.touched) if (!pending.has(t.id)) notes[t.id] = t
      return { notes }
    })
  } catch (e) {
    toast(`Could not save: ${(e as Error).message}`)
  } finally {
    p.inflight = false
    if (Object.keys(p.patch).length) {
      p.timer = window.setTimeout(() => flush(id), 150)
    } else {
      pending.delete(id)
      if (!pending.size) set({ dirty: false })
    }
  }
}

function flushAllNow() {
  for (const [id, p] of pending) {
    if (!Object.keys(p.patch).length) continue
    clearTimeout(p.timer)
    api.updateNote(id, p.patch, true).catch(() => {})
    p.patch = {}
  }
}
window.addEventListener('pagehide', flushAllNow)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') for (const id of pending.keys()) flush(id)
  else refresh()
})
window.addEventListener('focus', () => refresh())

export function updateNote(id: string, patch: NotePatch) {
  const note = get().notes[id]
  if (!note) return
  // Moved into a notebook: add that notebook's tags. Tags are never taken away on the way out.
  if (patch.folder !== undefined && patch.folder !== note.folder) {
    const tags = withTags(patch.tags ?? note.tags, patch.folder)
    if (tags && tags !== (patch.tags ?? note.tags)) patch = { ...patch, tags }
  }
  const next = { ...note, ...patch }
  if (patch.content !== undefined && patch.content !== note.content) next.updated = new Date().toISOString()
  set((s) => ({ notes: { ...s.notes, [id]: next } }))
  const structural = 'title' in patch || 'folder' in patch
  schedule(id, patch, structural ? 0 : 450)
}

// ---------- notes ----------

function context(): { folder: string } {
  const s = get()
  if (s.settings.newNoteFolder === 'root') return { folder: '' }
  if (s.settings.newNoteFolder === 'inbox') return { folder: s.settings.inboxFolder }
  if (s.route.name === 'folder') return { folder: s.route.path }
  if (s.route.name === 'note') {
    const n = s.notes[s.route.id]
    if (n && n.type === 'note') return { folder: n.folder }
  }
  return { folder: '' }
}

/** The tags of a notebook and of every notebook above it. */
export function inheritedTags(folder: string): string[] {
  const { folderTags } = get()
  const parts = folder ? folder.split('/') : []
  return [...new Set(parts.flatMap((_p, i) => folderTags[parts.slice(0, i + 1).join('/')] || []))]
}

const withTags = (tags: string[] | undefined, folder: string) => {
  const extra = inheritedTags(folder).filter((t) => !(tags || []).includes(t))
  return extra.length ? [...(tags || []), ...extra] : tags
}

export async function createNote(fields: Partial<Note>, open = true): Promise<Note | null> {
  try {
    // A note made in a notebook takes that notebook's tags, written into the note itself.
    const tags = withTags(fields.tags, fields.folder || '')
    const { note, folders } = await api.createNote(tags ? { ...fields, tags } : fields)
    set((s) => ({ notes: { ...s.notes, [note.id]: note }, folders }))
    if (open) openNote(note.id)
    return note
  } catch (e) {
    toast(`Could not create note: ${(e as Error).message}`)
    return null
  }
}

const ARTICLE_TEMPLATE = `## Summary\n\n\n## Quotes\n\n> \n\n## My notes\n\n`

export async function newNote(kind: NoteType | 'canvas' = 'note', fields: Partial<Note> = {}) {
  if (kind === 'scratch') {
    const stamp = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    return createNote({
      title: `Scratch — ${stamp.replace(/[:/]/g, '.')}`,
      folder: get().settings.scratchFolder,
      type: 'scratch',
      expires: new Date(Date.now() + get().settings.scratchDays * DAY).toISOString(),
      ...fields,
    })
  }
  if (kind === 'article') {
    const url = await ask({
      title: 'New research note',
      message: 'Paste a link to start from, or leave it empty.',
      placeholder: 'https://…',
      confirmLabel: 'Create',
    })
    if (url === null) return null
    let title = 'Untitled article'
    let summary = ''
    const source = /^https?:\/\//i.test(url.trim()) ? url.trim() : ''
    if (source) {
      const meta = await api.unfurl(source).catch(() => ({ title: '', description: '' }))
      title = meta.title || new URL(source).hostname
      summary = meta.description
    } else if (url.trim()) title = url.trim()
    return createNote({
      title,
      folder: 'Research',
      type: 'article',
      status: 'unread',
      source: source || undefined,
      content: summary ? ARTICLE_TEMPLATE.replace('## Summary\n\n', `## Summary\n\n${summary}\n`) : ARTICLE_TEMPLATE,
      ...fields,
    })
  }
  if (kind === 'canvas') return createNote({ title: 'Untitled canvas', view: 'canvas', ...context(), ...fields })
  return createNote({ title: 'Untitled', ...context(), ...fields })
}

export function findDaily(date: string): Note | undefined {
  return Object.values(get().notes).find((n) => n.type === 'daily' && n.title === date)
}

async function ensureDaily(date: string): Promise<Note | null> {
  const { dailyFolder, dailyView, dailyTemplate } = get().settings
  return findDaily(date) ?? createNote({ title: date, folder: dailyFolder, type: 'daily', view: dailyView === 'canvas' ? 'canvas' : '', content: dailyTemplate }, false)
}

export async function openDaily(date = today()) {
  if (!isYmd(date)) return
  const note = await ensureDaily(date)
  if (note) openNote(note.id)
}

export async function deleteNote(id: string) {
  const note = get().notes[id]
  if (!note) return
  const p = pending.get(id)
  if (p) {
    clearTimeout(p.timer)
    pending.delete(id)
    if (!pending.size) set({ dirty: false })
  }
  try {
    await api.deleteNote(id)
  } catch (e) {
    return toast(`Could not delete: ${(e as Error).message}`)
  }
  set((s) => {
    const notes = { ...s.notes }
    delete notes[id]
    return { notes }
  })
  if (get().sideTabs.includes(id) || get().side === id) closeSideTab(id)
  closeTab(id)
  toast(`Moved “${note.title}” to trash`, {
    label: 'Undo',
    run: () => createNote(note, false),
  })
}

export function closeTab(id: string) {
  const s = get()
  const idx = s.tabs.indexOf(id)
  if (idx < 0) return
  const tabs = s.tabs.filter((t) => t !== id)
  local.set('tabs', tabs)
  set({ tabs })
  if (s.route.name === 'note' && s.route.id === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)]
    go(next ? { name: 'note', id: next } : { name: 'home' })
  }
}

/** The tabs of the pane the keyboard is in, and how to open one of them there. */
export function paneTabs(): { tabs: string[]; current: string; open: (id: string) => void } {
  const s = get()
  if (s.activePane === 'side' && s.side) return { tabs: s.sideTabs.filter((id) => s.notes[id]), current: s.side, open: openSide }
  return { tabs: s.tabs.filter((id) => s.notes[id]), current: s.route.name === 'note' ? s.route.id : '', open: openNote }
}

export function cycleTab(dir: 1 | -1) {
  const { tabs, current, open } = paneTabs()
  if (!tabs.length) return
  open(tabs[(tabs.indexOf(current) + dir + tabs.length) % tabs.length])
}

/** Close every tab in the active pane except the note it is showing. */
export function closeOtherTabs() {
  const s = get()
  if (s.activePane === 'side' && s.side) {
    local.set('sideTabs', [s.side])
    return set({ sideTabs: [s.side] })
  }
  const keep = s.route.name === 'note' ? [s.route.id] : []
  local.set('tabs', keep)
  set({ tabs: keep })
}

/** Close every tab in the active pane. */
export function closeAllTabs() {
  const s = get()
  if (s.activePane === 'side' && s.side) return closeSide()
  local.set('tabs', [])
  set({ tabs: [] })
  if (s.route.name === 'note') go({ name: 'home' })
}

export async function renameNote(id: string) {
  const note = get().notes[id]
  if (!note) return
  const title = await ask({ title: 'Rename note', message: 'Links to this note in other notes are updated to match.', initial: note.title, confirmLabel: 'Rename' })
  if (title?.trim() && title.trim() !== note.title) updateNote(id, { title: title.trim() })
}

/** Open the tag picker for a note: existing tags complete as you type, or a new one is created. */
export function addTag(id: string) {
  if (get().notes[id]) ui({ palette: { mode: 'tag', noteId: id } })
}

/** Add tags to one note. Typed text may hold several, separated by spaces or commas. */
export function applyTags(id: string, text: string) {
  const note = get().notes[id]
  if (!note) return
  const tags = [...new Set(text.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean))]
  const fresh = tags.filter((t) => !note.tags.includes(t))
  if (!tags.length) return
  if (!fresh.length) return toast('This note already has that tag')
  updateNote(id, { tags: [...note.tags, ...fresh] })
  toast(`Added ${fresh.map((t) => '#' + t).join(' ')}`)
}

export async function duplicateNote(id: string) {
  const n = get().notes[id]
  if (!n) return
  const { id: _id, path: _path, created: _c, updated: _u, ...rest } = n
  await createNote({ ...rest, title: `${n.title} copy`, pinned: false })
}

/** The time in the format chosen in settings: 16:54 or 4:54 PM. */
export const timeNow = (d = new Date()) => formatDate(d, get().settings.timeFormat === '12' ? 'h:mm A' : 'HH:mm')

/** Add an entry to today's daily note: a card if the day is a canvas, otherwise a line on the page. */
async function addToDaily(body: string, withTime: boolean): Promise<Note | null> {
  const note = await ensureDaily(today())
  if (!note) return null
  const current = get().notes[note.id] ?? note
  let content: string
  if (current.view === 'canvas') content = appendCard(current.content, body)
  else {
    const [head, ...rest] = body.split('\n')
    const entry = [`- ${withTime ? `**${timeNow()}** : ` : ''}${head}`, ...rest.map((l) => '  ' + l)].join('\n')
    const idx = current.content.indexOf('\n\n<!-- canvas -->')
    const page = idx < 0 ? current.content : current.content.slice(0, idx)
    const tail = idx < 0 ? '' : current.content.slice(idx)
    content = (page.trim() ? page.replace(/\n+$/, '') + '\n' : '') + entry + tail
  }
  updateNote(note.id, { content })
  return note
}

// ---------- templates and meeting notes ----------

export const MEETING_TEMPLATE = `- **When:** {{date:ddd, Do MMM}}, {{time:h:mmA}}
- **Who:** 

## Notes

- 

## Decisions

- 

## Action items

- [ ] 
`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Format a date with the same tokens Obsidian uses: YYYY YY, MMMM MMM MM M, Do DD D, dddd ddd,
 * HH H (24-hour), hh h (12-hour), mm, A a. Text in [brackets] is kept as written.
 */
export function formatDate(d: Date, pattern: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = d.getDate()
  const ordinal = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  const h12 = d.getHours() % 12 || 12
  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MMMM: MONTHS[d.getMonth()],
    MMM: MONTHS[d.getMonth()].slice(0, 3),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    Do: day + ordinal,
    DD: pad(day),
    D: String(day),
    dddd: DAYS[d.getDay()],
    ddd: DAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()),
    H: String(d.getHours()),
    hh: pad(h12),
    h: String(h12),
    mm: pad(d.getMinutes()),
    A: d.getHours() < 12 ? 'AM' : 'PM',
    a: d.getHours() < 12 ? 'am' : 'pm',
  }
  return pattern.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|A|a/g, (token, literal) => (literal !== undefined ? literal : tokens[token]))
}

/** Fill in {{date}}, {{time}}, {{day}} and {{title}}. {{date:FORMAT}} and {{time:FORMAT}} take a pattern, see formatDate. */
export function fillTemplate(text: string, title: string): string {
  const now = new Date()
  return text.replace(/\{\{\s*(date|time|day|title)\s*(?::([^}]*))?\}\}/gi, (_m, key: string, pattern?: string) => {
    const k = key.toLowerCase()
    if (k === 'title') return title
    if (pattern?.trim()) return formatDate(now, pattern.trim())
    return k === 'date' ? today() : k === 'time' ? timeNow(now) : DAYS[now.getDay()]
  })
}

/** Templates are ordinary notes kept in the templates notebook. */
export function templates(): Note[] {
  const folder = get().settings.templatesFolder
  return Object.values(get().notes)
    .filter((n) => n.folder === folder)
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function newFromTemplate(templateId: string) {
  const template = get().notes[templateId]
  if (!template) return null
  const folder = context().folder === get().settings.templatesFolder ? '' : context().folder
  return createNote({ title: `Untitled ${template.title.toLowerCase()}`, folder, tags: template.tags, content: fillTemplate(template.content, template.title) })
}

/** The meeting template note, created from the built-in one the first time it is needed. */
export async function meetingTemplate(): Promise<Note | null> {
  const existing = templates().find((n) => n.title.toLowerCase() === 'meeting notes')
  return existing ?? createNote({ title: 'Meeting notes', folder: get().settings.templatesFolder, tags: ['meeting'], content: MEETING_TEMPLATE }, false)
}

export async function newTemplate() {
  return createNote({ title: 'Untitled template', folder: get().settings.templatesFolder })
}

export async function newMeeting() {
  const name = await ask({ title: 'New meeting note', message: 'What is the meeting? Leave empty to name it later.', placeholder: 'Atlas weekly sync', confirmLabel: 'Create' })
  if (name === null) return null
  const { meetingsFolder, meetingsSubfolder, meetingLink } = get().settings
  const template = await meetingTemplate()
  const title = name.trim() || 'Meeting'
  // Filed by date, e.g. Meetings/2026/Oct, so the notebook stays tidy without any sorting by hand.
  const folder = [meetingsFolder, meetingsSubfolder.trim() && formatDate(new Date(), meetingsSubfolder.trim())].filter(Boolean).join('/')
  const note = await createNote({ title, folder, tags: template?.tags.length ? template.tags : ['meeting'], content: fillTemplate(template?.content ?? MEETING_TEMPLATE, title) }, false)
  if (!note) return null
  if (meetingLink) await addToDaily(`[[${note.title}]]`, true)
  openNote(note.id)
  return note
}

export const PERSON_TEMPLATE = `## Next time

- 

## Meetings

### {{date:ddd, Do MMM YYYY}}

- 

**Actions**

- [ ] 

## About

- **Role:** 
- **Team:** 
`

/** The person template note, created from the built-in one the first time it is needed. */
export async function personTemplate(): Promise<Note | null> {
  const existing = templates().find((n) => n.title.toLowerCase() === 'person')
  return existing ?? createNote({ title: 'Person', folder: get().settings.templatesFolder, tags: ['person'], content: PERSON_TEMPLATE }, false)
}

/** A running note for one person: things to raise next time, then one dated entry per meeting. */
export async function newPerson() {
  const name = await ask({ title: 'New person note', message: 'Who is it for? One note holds every 1:1 with them.', placeholder: 'Priya Sharma', confirmLabel: 'Create' })
  if (!name?.trim()) return null
  const existing = Object.values(get().notes).find((n) => n.title.toLowerCase() === name.trim().toLowerCase())
  if (existing) {
    openNote(existing.id)
    toast('That note already exists, so it was opened instead')
    return existing
  }
  const template = await personTemplate()
  return createNote({ title: name.trim(), folder: get().settings.peopleFolder, tags: template?.tags.length ? template.tags : ['person'], content: fillTemplate(template?.content ?? PERSON_TEMPLATE, name.trim()) })
}

/** Lines of the page (not the canvas) and the index where the section under `heading` ends. -1 if there is no such heading. */
function sectionEnd(lines: string[], heading: string): { at: number; start: number } {
  const want = heading.trim().toLowerCase()
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, '').replace(/\s*#*\s*$/, '').toLowerCase() === want)
  if (start < 0) return { at: -1, start }
  const level = /^#+/.exec(lines[start])![0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#{1,6})\s/.exec(lines[i])
    if (h && h[1].length <= level) {
      end = i
      break
    }
  }
  while (end > start + 1 && !lines[end - 1].trim()) end--
  return { at: end, start }
}

/** Start today's entry in a person note: a dated heading at the top of "Meetings", newest first. */
export function addMeetingEntry(id: string) {
  const note = get().notes[id]
  if (!note) return
  const idx = note.content.indexOf('\n\n<!-- canvas -->')
  const page = idx < 0 ? note.content : note.content.slice(0, idx)
  const tail = idx < 0 ? '' : note.content.slice(idx)
  const lines = page.split('\n')
  const title = formatDate(new Date(), 'ddd, Do MMM YYYY')
  if (lines.some((l) => l.trim() === `### ${title}`)) return toast('Today already has an entry in this note')
  const entry = [`### ${title}`, '', '- ', '', '**Actions**', '', '- [ ] ', '']
  const { start } = sectionEnd(lines, 'Meetings')
  if (start < 0) lines.push(...(lines[lines.length - 1]?.trim() ? [''] : []), '## Meetings', '', ...entry)
  else lines.splice(start + 1, 0, '', ...entry.slice(0, -1))
  updateNote(id, { content: lines.join('\n') + tail })
  set({ jump: { id, query: `### ${title}`, terms: [] } })
}

/** Add text to a chosen note: at the end of the section under `heading`, or at the end of the page. */
export function captureToNote(text: string, id: string, heading: string) {
  const note = get().notes[id]
  const body = text.trim()
  if (!note || !body) return
  const [head, ...rest] = body.split('\n')
  // Already a list item or a task: keep it as typed.
  const entry = [/^\s*([-*+]|\d+[.)])\s/.test(head) ? head : `- ${head}`, ...rest.map((l) => '  ' + l)]
  const idx = note.content.indexOf('\n\n<!-- canvas -->')
  const page = idx < 0 ? note.content : note.content.slice(0, idx)
  const tail = idx < 0 ? '' : note.content.slice(idx)
  const lines = page.replace(/\n+$/, '').split('\n')
  const { at } = heading ? sectionEnd(lines, heading) : { at: -1 }
  if (at < 0) lines.push(...entry)
  else {
    // An empty "- " left by a template is where the first entry goes.
    if (/^\s*[-*+]\s*$/.test(lines[at - 1] ?? '')) lines.splice(at - 1, 1, ...entry)
    else lines.splice(at, 0, ...entry)
  }
  updateNote(id, { content: (lines.join('\n').trim() ? lines.join('\n') + '\n' : '') + tail })
  local.set('captureNote', { id, heading })
  const where = heading && at >= 0 ? `${displayTitle(note)} › ${heading}` : displayTitle(note)
  toast(`Added to ${where}`, { label: 'Open', run: () => openNote(id) })
}

// ---------- tasks ----------

/** Save the current list of the Tasks view under a name, and open it. */
export async function saveTaskView(view: TaskView) {
  const name = await ask({ title: 'Save this filter', message: 'It will appear under Tasks in the sidebar.', placeholder: 'Atlas this week', confirmLabel: 'Save' })
  if (!name?.trim()) return
  const saved: SavedTaskView = { ...view, id: Math.random().toString(36).slice(2, 8), name: name.trim() }
  setSetting('taskViews', [...get().settings.taskViews, saved])
  go({ name: 'tasks', view: `s:${saved.id}` })
}

export function updateTaskView(id: string, patch: Partial<SavedTaskView>) {
  setSetting('taskViews', get().settings.taskViews.map((v) => (v.id === id ? { ...v, ...patch } : v)))
}

export async function renameTaskView(id: string) {
  const view = get().settings.taskViews.find((v) => v.id === id)
  if (!view) return
  const name = await ask({ title: 'Rename filter', initial: view.name, confirmLabel: 'Rename' })
  if (name?.trim()) updateTaskView(id, { name: name.trim() })
}

export function deleteTaskView(id: string) {
  const view = get().settings.taskViews.find((v) => v.id === id)
  if (!view) return
  setSetting('taskViews', get().settings.taskViews.filter((v) => v.id !== id))
  const route = get().route
  if (route.name === 'tasks' && route.view === `s:${id}`) go({ name: 'tasks' })
  toast(`Removed the filter “${view.name}”`, { label: 'Undo', run: () => setSetting('taskViews', [...get().settings.taskViews, view]) })
}

/** Move several tasks to one day. For each, the date that made it late is the one changed. */
export function rescheduleTasks(tasks: Task[], date: string) {
  const now = today()
  const done: { before: Task; after: string }[] = []
  for (const task of tasks) {
    const note = get().notes[task.noteId]
    const field = task.due && task.due < now ? 'due' : task.scheduled ? 'scheduled' : 'due'
    const raw = withDetails(task.raw, { [field]: date })
    const content = note && rewriteTask(note.content, task, { raw })
    if (!note || content == null) continue
    updateNote(note.id, { content })
    done.push({ before: task, after: raw })
  }
  if (!done.length) return toast('Those tasks have changed since this list was drawn. Try again.')
  toast(`Moved ${done.length} task${done.length === 1 ? '' : 's'} to ${shortDate(date)}`, {
    label: 'Undo',
    run: () => {
      for (const { before, after } of done) {
        const note = get().notes[before.noteId]
        const content = note && rewriteTask(note.content, { ...before, raw: after }, { raw: before.raw })
        if (note && content != null) updateNote(note.id, { content })
      }
    },
  })
}

/** Tick a task, or change its text, wherever it lives. */
export function updateTask(task: Task, change: { done?: boolean; raw?: string }) {
  const note = get().notes[task.noteId]
  const content = note && rewriteTask(note.content, task, change)
  if (!note || content == null) return toast('That task has changed since this list was drawn. Try again.')
  updateNote(note.id, { content })
}

export async function setAttachmentsFolder(name: string) {
  try {
    const res = await api.setConfig({ attachments: name })
    set({ attachmentsFolder: res.config.attachments, folders: res.folders })
    toast(`New images and files will be saved in “${res.config.attachments}”`)
  } catch (e) {
    toast((e as Error).message)
  }
}

// ---------- import ----------

export async function importFromObsidian() {
  let source: string | null
  if (desktop?.chooseFolder) source = await desktop.chooseFolder('Choose your Obsidian vault folder')
  else source = await ask({ title: 'Import from Obsidian', message: 'Full path of your Obsidian vault folder on this computer.', placeholder: '~/Documents/Obsidian/My Vault', confirmLabel: 'Next' })
  if (!source?.trim()) return
  const name = source.trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Obsidian'
  const dest = await ask({
    title: 'Where should the notes go?',
    message: 'Your Obsidian folders are recreated inside this notebook. Clear the name to put them at the top level. The Obsidian folder itself is not changed.',
    initial: name,
    placeholder: 'Top level',
    confirmLabel: 'Import',
  })
  if (dest === null) return
  for (const id of pending.keys()) await flush(id)
  toast('Importing…')
  try {
    const r = await api.importObsidian(source.trim(), dest.trim())
    set({ notes: mergeNotes(r.notes), folders: r.folders })
    const parts = [`${r.imported} note${r.imported === 1 ? '' : 's'}`]
    if (r.canvases) parts.push(`${r.canvases} canvas${r.canvases === 1 ? '' : 'es'}`)
    if (r.attachments) parts.push(`${r.attachments} file${r.attachments === 1 ? '' : 's'}`)
    const problems = [r.missing && `${r.missing} linked file${r.missing === 1 ? '' : 's'} not found`, r.failed.length && `${r.failed.length} could not be read`].filter(Boolean)
    toast(`Imported ${parts.join(', ')}${problems.length ? ` (${problems.join(', ')})` : ''}`, dest.trim() ? { label: 'Open', run: () => go({ name: 'folder', path: dest.trim() }) } : undefined)
    if (r.failed.length) console.warn('Import problems:', r.failed)
  } catch (e) {
    toast(`Import failed: ${(e as Error).message}`)
  }
}

export async function captureText(text: string, target: CaptureTarget) {
  const body = text.trim()
  if (!body) return
  const firstLine = body.split('\n')[0].replace(/^[#>\-*\s]+/, '').slice(0, 60).trim() || 'Quick note'
  if (target === 'daily') {
    const note = await addToDaily(body, get().settings.captureTime)
    if (note) toast("Added to today's note", { label: 'Open', run: () => openNote(note.id) })
  } else if (target === 'scratch') {
    const note = await newNote('scratch', { title: `Scratch — ${firstLine}`, content: body })
    if (note) toast(`Scratch note saved, kept for ${get().settings.scratchDays} day${get().settings.scratchDays === 1 ? '' : 's'}`)
  } else {
    const note = await createNote({ title: firstLine, folder: get().settings.inboxFolder, content: body }, false)
    if (note) toast(`Saved to ${get().settings.inboxFolder}`, { label: 'Open', run: () => openNote(note.id) })
  }
}

// ---------- folders ----------

export async function createFolder(parent = '') {
  const name = await ask({ title: parent ? `New notebook in ${parent}` : 'New notebook', placeholder: 'Notebook name', confirmLabel: 'Create' })
  if (!name?.trim()) return
  try {
    const res = await api.createFolder(parent ? `${parent}/${name}` : name)
    set({ folders: res.folders })
    go({ name: 'folder', path: res.path })
  } catch (e) {
    toast((e as Error).message)
  }
}

async function saveFolderTags(next: Record<string, string[]>) {
  const res = await api.setConfig({ folderTags: next })
  set({ folderTags: res.config.folderTags || {} })
}

/** Choose the tags for a notebook, and offer to add them to the notes already in it. */
export async function editFolderTags(path: string) {
  const current = get().folderTags[path] || []
  const above = inheritedTags(path).filter((t) => !current.includes(t))
  const answer = await ask({
    title: `Tags for “${path.split('/').pop()}”`,
    message: `Notes created in or moved into this notebook get these tags, written into the note.${above.length ? ` It already inherits ${above.map((t) => '#' + t).join(' ')} from the notebook above.` : ''} Leave empty for none.`,
    initial: current.map((t) => '#' + t).join(' '),
    placeholder: '#meeting #work',
    confirmLabel: 'Save',
  })
  if (answer === null) return
  const tags = [...new Set(answer.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean))]
  const next = { ...get().folderTags }
  if (tags.length) next[path] = tags
  else delete next[path]
  try {
    await saveFolderTags(next)
  } catch (e) {
    return toast((e as Error).message)
  }
  if (!tags.length) return toast(current.length ? 'This notebook no longer adds tags. Notes keep the tags they have.' : 'No tags set')
  // Notes already here, including in notebooks inside this one, that are missing any of the tags.
  const missing = Object.values(get().notes).filter((n) => (n.folder === path || n.folder.startsWith(path + '/')) && tags.some((t) => !n.tags.includes(t)))
  const label = tags.map((t) => '#' + t).join(' ')
  if (!missing.length) return toast(`New notes in this notebook will be tagged ${label}`)
  const ok = await ask({
    title: `Add ${label} to ${missing.length} existing note${missing.length === 1 ? '' : 's'}?`,
    message: 'The tags are written into each note\'s file. Choose Cancel to tag only notes created or moved here from now on.',
    confirmLabel: `Tag ${missing.length} note${missing.length === 1 ? '' : 's'}`,
    input: false,
  })
  if (ok === null) return toast(`New notes in this notebook will be tagged ${label}`)
  const before = missing.map((n) => ({ id: n.id, tags: n.tags }))
  for (const n of missing) updateNote(n.id, { tags: [...n.tags, ...tags.filter((t) => !n.tags.includes(t))] })
  toast(`Tagged ${missing.length} note${missing.length === 1 ? '' : 's'} with ${label}`, { label: 'Undo', run: () => before.forEach((b) => updateNote(b.id, { tags: b.tags })) })
}

/** Keep notebook tags attached when a notebook is renamed, and drop them when it is deleted. */
function moveFolderTags(from: string, to: string | null) {
  const current = get().folderTags
  const next: Record<string, string[]> = {}
  let changed = false
  for (const [folder, tags] of Object.entries(current)) {
    if (folder === from || folder.startsWith(from + '/')) {
      changed = true
      if (to !== null) next[to + folder.slice(from.length)] = tags
    } else next[folder] = tags
  }
  if (changed) void saveFolderTags(next).catch(() => {})
}

export async function renameFolder(path: string) {
  const parts = path.split('/')
  const name = await ask({ title: 'Rename notebook', initial: parts[parts.length - 1], confirmLabel: 'Rename' })
  if (!name?.trim() || name.trim() === parts[parts.length - 1]) return
  const to = [...parts.slice(0, -1), name.trim()].join('/')
  for (const id of pending.keys()) await flush(id)
  try {
    const res = await api.renameFolder(path, to)
    set({ notes: mergeNotes(res.notes), folders: res.folders })
    moveFolderTags(path, to)
    const r = get().route
    if (r.name === 'folder' && (r.path === path || r.path.startsWith(path + '/'))) {
      go({ name: 'folder', path: to + r.path.slice(path.length) })
    }
  } catch (e) {
    toast((e as Error).message)
  }
}

export async function deleteFolder(path: string) {
  const count = Object.values(get().notes).filter((n) => n.folder === path || n.folder.startsWith(path + '/')).length
  const ok = await ask({
    title: `Delete “${path}”?`,
    message: count ? `${count} note${count === 1 ? '' : 's'} inside will be moved to the vault's .trash folder.` : 'This notebook is empty.',
    confirmLabel: 'Delete',
    danger: true,
    input: false,
  })
  if (ok === null) return
  try {
    const res = await api.deleteFolder(path)
    moveFolderTags(path, null)
    set((s) => ({ notes: mergeNotes(res.notes), folders: res.folders, tabs: s.tabs.filter((id) => res.notes.some((n) => n.id === id)) }))
    const r = get().route
    if (r.name === 'folder' && (r.path === path || r.path.startsWith(path + '/'))) go({ name: 'all' })
    if (r.name === 'note' && !get().notes[r.id]) go({ name: 'home' })
  } catch (e) {
    toast((e as Error).message)
  }
}

// ---------- ui ----------

let toastId = 0
export function toast(text: string, action?: Toast['action']) {
  const id = ++toastId
  set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, action }] }))
  setTimeout(() => dismissToast(id), action ? 7000 : 3500)
}
export const dismissToast = (id: number) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))

export function ask(options: AskOptions): Promise<string | null> {
  return new Promise((resolve) => {
    set({
      asking: {
        ...options,
        resolve: (v) => {
          set({ asking: null })
          resolve(v)
        },
      },
    })
  })
}

/** Open a menu under a button, or at the pointer for a context menu. */
export function openMenu(e: { currentTarget: EventTarget; clientX: number; clientY: number; type: string; preventDefault(): void }, items: MenuItem[]) {
  e.preventDefault()
  if (e.type === 'contextmenu') return set({ menu: { x: e.clientX, y: e.clientY, items } })
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const alignRight = rect.left > window.innerWidth / 2
  set({ menu: { x: alignRight ? rect.right : rect.left, y: rect.bottom + 6, items, alignRight } })
}

/** Open the date picker under a button. `onPick` gets the chosen day, or null when the date is removed. */
export function openDatePicker(e: { currentTarget: EventTarget }, options: { title: string; value?: string; removeLabel?: string; onPick: (date: string | null) => void }) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const alignRight = rect.left > window.innerWidth / 2
  set({ datePick: { x: alignRight ? rect.right : rect.left, y: rect.bottom + 6, alignRight, ...options } })
}

export function setPref<K extends 'sidebar' | 'pane' | 'mode' | 'theme' | 'width'>(key: K, value: State[K]) {
  local.set(key, value)
  set({ [key]: value } as Pick<State, K>)
  if (key === 'theme') applyTheme()
}

export const WIDTHS: [string, number][] = [
  ['Narrow', 70],
  ['Standard', 90],
  ['Wide', 120],
  ['Extra wide', 160],
  ['Full width', 0],
]

export async function askPageWidth() {
  const current = get().width
  const value = await ask({
    title: 'Page width',
    message: 'How many characters should fit on one line? (40 to 400)',
    initial: String(current || 90),
    confirmLabel: 'Set width',
  })
  if (value === null) return
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return toast('Enter a number of characters, for example 90')
  setPref('width', Math.min(400, Math.max(40, n)))
}

export function pageWidthMenu(): MenuItem[] {
  const current = get().width
  const preset = WIDTHS.some(([, n]) => n === current)
  return [
    ...WIDTHS.map(([label, n]) => ({ label: n ? `${label} · ${n} characters` : label, checked: current === n, onSelect: () => setPref('width', n) })),
    { separator: true },
    { label: preset ? 'Custom…' : `Custom · ${current} characters…`, checked: !preset, onSelect: () => void askPageWidth() },
  ]
}

/**
 * A version of a colour that reads on a dark background: same hue, lightened if it is too dark.
 * Used for the dark theme when no dark colour has been chosen.
 */
export function lightenForDark(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (l >= 0.68) return hex
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  // Rebuild at a lightness that stands out on dark, with the saturation eased so it does not glare.
  const L = 0.74
  const S = Math.min(s, 0.82)
  const c = (1 - Math.abs(2 * L - 1)) * S
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) => Math.round((v + L - c / 2) * 255).toString(16).padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`
}

/** The colour a text style uses in the given theme; '' when it should follow the theme's text colour. */
export function styleColor(style: TextStyle, dark: boolean): string {
  if (!dark) return style.color
  return style.darkColor || (style.color ? lightenForDark(style.color) : '')
}

export function applyAppearance() {
  const { accent, font, codeFont, fontSize, fontWeight, lineHeight, styles } = get().settings
  const root = document.documentElement
  root.dataset.accent = accent
  const dark = root.dataset.theme === 'dark'
  root.dataset.imageBorder = get().settings.imageBorder || 'hairline'
  root.style.setProperty('--doc-font', fontCss(font))
  root.style.setProperty('--mono', fontCss(codeFont, true))
  root.style.setProperty('--doc-size', `${fontSize}px`)
  root.style.setProperty('--doc-weight', String(fontWeight))
  root.style.setProperty('--list-indent', `${get().settings.listIndent ?? 28}px`)
  root.style.setProperty('--list-guide', get().settings.indentGuides === false ? 'transparent' : 'var(--border-strong)')
  // Bullets and list numbers take the Heading 2 colour when one is set.
  root.style.setProperty('--list-marker', (styles?.h2 && styleColor(styles.h2, dark)) || 'var(--text-3)')
  for (const [key] of STYLE_KEYS) {
    const style = { ...DEFAULT_STYLES[key], ...styles?.[key] }
    root.style.setProperty(`--${key}-color`, styleColor(style, dark) || 'inherit')
    root.style.setProperty(`--${key}-size`, `${style.size / 100}em`)
  }
  root.style.setProperty('--doc-leading', String(lineHeight))
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const settings = { ...get().settings, [key]: value }
  local.set('settings', settings)
  set({ settings })
  applyAppearance()
}

export function resetSettings() {
  local.set('settings', DEFAULT_SETTINGS)
  set({ settings: { ...DEFAULT_SETTINGS } })
  applyAppearance()
  setPref('theme', 'system')
  setPref('mode', 'edit')
  setPref('width', 90)
}

export function applyTheme() {
  const t = get().theme
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Text style colours differ between the themes.
  applyAppearance()
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)

export const ui = (patch: Partial<Pick<State, 'palette' | 'capture' | 'help' | 'prefs' | 'historyFor' | 'menu' | 'lightbox' | 'datePick'>>) => set(patch)
