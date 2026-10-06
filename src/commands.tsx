import type { ReactNode } from 'react'
import {
  BookMarked,
  BookOpen,
  CalendarDays,
  Download,
  FilePlus2,
  Files,
  FolderInput,
  History,
  Home,
  Hourglass,
  Columns2,
  Keyboard,
  ListTree,
  Search,
  List,
  ListChecks,
  ListOrdered,
  LayoutTemplate,
  Users,
  Settings2,
  LayoutDashboard,
  Moon,
  PanelLeft,
  PanelRight,
  Pin,
  Sun,
  SunMoon,
  Trash2,
  Zap,
  CalendarCheck,
  FolderPlus,
} from 'lucide-react'
import { askPageWidth, closeSide, createFolder, currentNote, openSide, swapPanes, importFromObsidian, newMeeting, deleteNote, go, newNote, openDaily, setPref, ui, updateNote, useStore } from './store'
import { exportHtml, exportMarkdown, exportPdf, exportWord } from './lib/export'
import { ALT, MOD } from './lib/util'
import { SHORTCUT_DEFS, hint } from './shortcuts'

export interface Command {
  id: string
  label: string
  icon: ReactNode
  hint?: string
  keywords?: string
  run: () => void
}

const format = (kind: string) => window.dispatchEvent(new CustomEvent('margin:format', { detail: kind }))

export function toggleMode() {
  const s = useStore.getState()
  setPref('mode', s.mode === 'read' ? 'edit' : 'read')
}

export function commands(): Command[] {
  const s = useStore.getState()
  const note = currentNote()
  const i = (El: typeof Home) => <El size={16} />
  const list: Command[] = [
    { id: 'new', label: 'New note', icon: i(FilePlus2), hint: `${ALT}N`, keywords: 'create page', run: () => newNote('note') },
    { id: 'capture', label: 'Quick capture', icon: i(Zap), hint: `${ALT}C`, keywords: 'jot inbox', run: () => ui({ capture: true }) },
    { id: 'daily', label: "Open today's daily note", icon: i(CalendarCheck), hint: `${ALT}D`, keywords: 'journal today', run: () => openDaily() },
    { id: 'scratch', label: 'New scratch note', icon: i(Hourglass), hint: `${ALT}S`, keywords: 'temporary expire', run: () => newNote('scratch') },
    { id: 'canvas', label: 'New canvas', icon: i(LayoutDashboard), keywords: 'board whiteboard', run: () => newNote('canvas') },
    { id: 'meeting', label: 'New meeting note', icon: i(Users), keywords: 'minutes template', run: () => void newMeeting() },
    { id: 'template', label: 'New note from a template…', icon: i(LayoutTemplate), keywords: 'templates', run: () => ui({ palette: { mode: 'template' } }) },
    { id: 'article', label: 'New research note', icon: i(BookMarked), keywords: 'article link clip', run: () => newNote('article') },
    { id: 'folder', label: 'New notebook', icon: i(FolderPlus), keywords: 'folder', run: () => createFolder() },
    { id: 'home', label: 'Go to Home', icon: i(Home), hint: `${ALT}H`, run: () => go({ name: 'home' }) },
    { id: 'calendar', label: 'Go to Calendar', icon: i(CalendarDays), hint: `${ALT}L`, run: () => go({ name: 'calendar' }) },
    { id: 'all', label: 'Go to All notes', icon: i(Files), hint: `${ALT}A`, run: () => go({ name: 'all' }) },
    { id: 'goscratch', label: 'Go to Scratch', icon: i(Hourglass), run: () => go({ name: 'scratch' }) },
    { id: 'research', label: 'Go to Research', icon: i(BookMarked), hint: `${ALT}R`, run: () => go({ name: 'research' }) },
  ]
  if (note) {
    list.push(
      { id: 'side', label: s.side ? 'Close the side pane' : 'Open this note to the side', icon: i(Columns2), keywords: 'split pane two', run: () => (s.side ? closeSide() : openSide(note.id)) },
      ...(s.side ? [{ id: 'swap', label: 'Swap the two panes', icon: i(Columns2), keywords: 'split side', run: () => swapPanes() }] : []),
      { id: 'outline', label: 'Jump to a heading…', icon: i(ListTree), keywords: 'outline index contents toc section', run: () => ui({ palette: { mode: 'outline', noteId: note.id } }) },
      { id: 'isearch', label: 'Search in this note', icon: i(Search), keywords: 'find incremental isearch', run: () => window.dispatchEvent(new CustomEvent('margin:isearch', { detail: 'forward' })) },
      { id: 'isearchBack', label: 'Search backward in this note', icon: i(Search), keywords: 'find reverse', run: () => window.dispatchEvent(new CustomEvent('margin:isearch', { detail: 'back' })) },
      { id: 'bullet', label: 'Bulleted list', icon: i(List), keywords: 'unordered bullets', run: () => format('bullet') },
      { id: 'numbered', label: 'Numbered list', icon: i(ListOrdered), keywords: 'ordered numbers', run: () => format('numbered') },
      { id: 'task', label: 'Task list', icon: i(ListChecks), keywords: 'todo checkbox', run: () => format('task') },
      { id: 'mode', label: s.mode === 'read' ? 'Switch to writing' : 'Switch to reading', icon: i(BookOpen), hint: `${MOD}E`, keywords: 'preview edit', run: toggleMode },
      { id: 'view', label: note.view === 'canvas' ? 'Show page' : 'Show canvas', icon: i(LayoutDashboard), keywords: 'board', run: () => updateNote(note.id, { view: note.view === 'canvas' ? '' : 'canvas' }) },
      { id: 'pin', label: note.pinned ? 'Unpin this note' : 'Pin this note', icon: i(Pin), run: () => updateNote(note.id, { pinned: !note.pinned }) },
      { id: 'history', label: 'Version history', icon: i(History), hint: `${ALT}V`, keywords: 'restore undo', run: () => ui({ historyFor: note.id }) },
      { id: 'move', label: 'Move to notebook…', icon: i(FolderInput), hint: `${ALT}M`, keywords: 'folder', run: () => ui({ palette: { mode: 'move', noteId: note.id } }) },
      { id: 'exmd', label: 'Export as Markdown', icon: i(Download), run: () => exportMarkdown(note) },
      { id: 'exhtml', label: 'Export as HTML', icon: i(Download), keywords: 'web page', run: () => exportHtml(note) },
      { id: 'expdf', label: 'Export as PDF', icon: i(Download), keywords: 'print', run: () => exportPdf(note) },
      { id: 'exdoc', label: 'Export as Word / Google Docs file', icon: i(Download), keywords: 'docx gdoc', run: () => exportWord(note) },
      { id: 'delete', label: 'Move this note to trash', icon: i(Trash2), keywords: 'delete remove', run: () => deleteNote(note.id) },
    )
  }
  list.push(
    { id: 'width', label: 'Page width…', icon: i(PanelRight), keywords: 'line length characters wide narrow', run: () => void askPageWidth() },
    { id: 'sidebar', label: 'Toggle sidebar', icon: i(PanelLeft), hint: `${MOD}\\`, run: () => setPref('sidebar', !useStore.getState().sidebar) },
    { id: 'pane', label: 'Toggle backlinks pane', icon: i(PanelRight), hint: `${MOD}.`, keywords: 'outline', run: () => setPref('pane', !useStore.getState().pane) },
    { id: 'light', label: 'Theme: Light', icon: i(Sun), keywords: 'appearance', run: () => setPref('theme', 'light') },
    { id: 'dark', label: 'Theme: Dark', icon: i(Moon), keywords: 'appearance night', run: () => setPref('theme', 'dark') },
    { id: 'system', label: 'Theme: Match system', icon: i(SunMoon), keywords: 'appearance auto', run: () => setPref('theme', 'system') },
    { id: 'prefs', label: 'Settings', icon: i(Settings2), hint: `${MOD},`, keywords: 'preferences options configure font accent', run: () => ui({ prefs: true }) },
    { id: 'import', label: 'Import from Obsidian…', icon: i(Download), keywords: 'migrate vault', run: () => void importFromObsidian() },
    { id: 'help', label: 'Keyboard shortcuts', icon: i(Keyboard), hint: '?', run: () => ui({ help: true }) },
  )
  // Show each command's current shortcut, which may have been changed in settings.
  return list.map((c) => ({ ...c, hint: hint(c.id) || (c.id === 'help' ? '?' : undefined) }))
}

/** Everything shown in the shortcut list: the customisable ones with their current keys, then the fixed ones. */
export function shortcutGroups(): [string, [string, string][]][] {
  const groups = new Map<string, [string, string][]>()
  for (const def of SHORTCUT_DEFS) {
    const keys = hint(def.id)
    if (keys) groups.set(def.group, [...(groups.get(def.group) || []), [keys, def.label]])
  }
  groups.get('Navigate')?.push([`${ALT}1–9`, 'Jump to tab'])
  groups.get('App')?.push(['?', 'Keyboard shortcuts'])
  return [...groups.entries(), ...FIXED_SHORTCUTS]
}

/** Built into the editor and the canvas; these cannot be changed. */
export const FIXED_SHORTCUTS: [string, [string, string][]][] = [
  [
    'Editing',
    [
      ['/', 'Slash commands: headings, lists, tables, dates, templates'],
      ['[[', 'Link to a note'],
      [`${MOD}B  ${MOD}I`, 'Bold / italic'],
      [`${MOD}⇧K`, 'Wrap selection in a note link'],
      [`${MOD}F`, 'Find and replace'],
      ['⌃A', 'Start of text, then start of line (Mac)'],
      [`${MOD}Z  ${MOD}⇧Z`, 'Undo / redo'],
      ['Tab  ⇧Tab', 'Nest / un-nest a list item, or indent'],
      [`${ALT}↑  ${ALT}↓`, 'Move a line, or a list item with its sub-items'],
      [`${MOD}+click`, 'Follow a link while writing'],
    ],
  ],
  [
    'Canvas',
    [
      ['Double-click', 'New card, or edit a card'],
      ['N', 'New card'],
      ['Enter / Esc', 'Edit / finish editing'],
      ['⌫', 'Delete selection'],
      ['Scroll', 'Pan'],
      [`${MOD}+scroll`, 'Zoom'],
    ],
  ],
]
