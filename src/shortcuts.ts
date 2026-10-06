// App-level keyboard shortcuts. Each action has a default key combination, which can be
// overridden in Settings → Shortcuts. Combos are written like "Mod+Shift+N", where Mod is ⌘ on a Mac and Ctrl elsewhere.
import { desktop } from './desktop'
import { isMac } from './lib/util'
import { useStore } from './store'

export interface ShortcutDef {
  id: string
  label: string
  group: 'Navigate' | 'Create' | 'In a note' | 'App'
  /** Default in a browser, where ⌘N, ⌘W and ⌘T belong to the browser itself. */
  web: string
  /** Default in the desktop app, when it differs. */
  desktop?: string
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: 'search', label: 'Search, switch notes, run commands', group: 'Navigate', web: 'Mod+K' },
  { id: 'back', label: 'Back', group: 'Navigate', web: 'Mod+[' },
  { id: 'forward', label: 'Forward', group: 'Navigate', web: 'Mod+]' },
  { id: 'home', label: 'Home', group: 'Navigate', web: 'Alt+H', desktop: 'Mod+Shift+H' },
  { id: 'daily', label: "Today's daily note", group: 'Navigate', web: 'Alt+D', desktop: 'Mod+D' },
  { id: 'calendar', label: 'Calendar', group: 'Navigate', web: 'Alt+L', desktop: 'Mod+Shift+L' },
  { id: 'all', label: 'All notes', group: 'Navigate', web: 'Alt+A', desktop: 'Mod+Shift+A' },
  { id: 'research', label: 'Research', group: 'Navigate', web: 'Alt+R' },
  { id: 'goscratch', label: 'Scratch', group: 'Navigate', web: '' },
  { id: 'prevTab', label: 'Previous tab', group: 'Navigate', web: 'Alt+[', desktop: 'Mod+Shift+[' },
  { id: 'nextTab', label: 'Next tab', group: 'Navigate', web: 'Alt+]', desktop: 'Mod+Shift+]' },
  { id: 'closeTab', label: 'Close tab', group: 'Navigate', web: 'Alt+W', desktop: 'Mod+W' },
  { id: 'new', label: 'New note', group: 'Create', web: 'Alt+N', desktop: 'Mod+N' },
  { id: 'capture', label: 'Quick capture', group: 'Create', web: 'Alt+C', desktop: 'Mod+Shift+C' },
  { id: 'scratch', label: 'New scratch note', group: 'Create', web: 'Alt+S', desktop: 'Mod+Alt+N' },
  { id: 'canvas', label: 'New canvas', group: 'Create', web: '', desktop: 'Mod+Shift+N' },
  { id: 'meeting', label: 'New meeting note', group: 'Create', web: 'Alt+T', desktop: 'Mod+Shift+M' },
  { id: 'template', label: 'New note from a template', group: 'Create', web: '' },
  { id: 'article', label: 'New research note', group: 'Create', web: '' },
  { id: 'folder', label: 'New notebook', group: 'Create', web: '' },
  { id: 'side', label: 'Open to the side, or close the side pane', group: 'In a note', web: 'Mod+Alt+\\' },
  { id: 'swap', label: 'Swap the two panes', group: 'In a note', web: '' },
  { id: 'outline', label: 'Jump to a heading', group: 'In a note', web: 'Mod+Shift+O' },
  { id: 'isearch', label: 'Search in this note as you type', group: 'In a note', web: isMac ? 'Ctrl+S' : 'Mod+S' },
  { id: 'isearchBack', label: 'Search backward in this note', group: 'In a note', web: isMac ? 'Ctrl+R' : 'Mod+R' },
  { id: 'bullet', label: 'Bulleted list', group: 'In a note', web: 'Mod+Shift+8' },
  { id: 'numbered', label: 'Numbered list', group: 'In a note', web: 'Mod+Shift+7' },
  { id: 'task', label: 'Task list', group: 'In a note', web: 'Mod+Shift+9' },
  { id: 'mode', label: 'Switch between writing and read-only', group: 'In a note', web: 'Mod+E' },
  { id: 'view', label: 'Switch between page and canvas', group: 'In a note', web: '' },
  { id: 'pane', label: 'Backlinks and outline pane', group: 'In a note', web: 'Mod+.' },
  { id: 'history', label: 'Version history', group: 'In a note', web: 'Alt+V' },
  { id: 'move', label: 'Move to notebook', group: 'In a note', web: 'Alt+M' },
  { id: 'pin', label: 'Pin or unpin', group: 'In a note', web: '' },
  { id: 'expdf', label: 'Export as PDF', group: 'In a note', web: '', desktop: 'Mod+P' },
  { id: 'delete', label: 'Move to trash', group: 'In a note', web: '' },
  { id: 'sidebar', label: 'Show or hide the sidebar', group: 'App', web: 'Mod+\\' },
  { id: 'prefs', label: 'Settings', group: 'App', web: 'Mod+,' },
  { id: 'help', label: 'Keyboard shortcuts', group: 'App', web: '' },
]

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Backslash: '\\', Slash: '/', Semicolon: ';', Quote: "'",
  Minus: '-', Equal: '=', Backquote: '`', Space: 'Space', Enter: 'Enter', Tab: 'Tab',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
}

/** The combination being pressed, or null while only modifier keys are down. Uses the physical key, so ⌥N is "Alt+N" and not "˜". */
export function eventCombo(e: KeyboardEvent): string | null {
  let key = CODE_KEYS[e.code]
  if (!key) {
    const m = /^(?:Key([A-Z])|Digit(\d)|(F\d{1,2}))$/.exec(e.code)
    if (m) key = m[1] || m[2] || m[3]
    // Some keyboards and remote sessions do not report a physical key: fall back to the character.
    else if (!e.code && e.key.length === 1 && e.key !== ' ') key = e.key.toUpperCase()
    else return null
  }
  const parts: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod')
  if (isMac && e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  return [...parts, key].join('+')
}

/** A shortcut needs a modifier (or a function key), otherwise it would fire while typing. */
export const isUsable = (combo: string) => /^(Mod|Ctrl|Alt)\+/.test(combo) || /^(Shift\+)?F\d+$/.test(combo)

const SYMBOLS: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↵', Up: '↑', Down: '↓', Left: '←', Right: '→' }

/** "Mod+Shift+N" → "⇧⌘N" on a Mac, "Ctrl+Shift+N" elsewhere. */
export function formatCombo(combo: string): string {
  if (!combo) return ''
  const parts = combo.split('+').filter(Boolean)
  // A literal "+" key leaves an empty last part.
  if (combo.endsWith('+')) parts.push('+')
  if (!isMac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+')
  const key = parts.pop()!
  const order = ['Ctrl', 'Alt', 'Shift', 'Mod']
  return order.filter((m) => parts.includes(m)).map((m) => SYMBOLS[m]).join('') + (SYMBOLS[key] ?? key)
}

export const defaultCombo = (def: ShortcutDef) => (desktop ? def.desktop ?? def.web : def.web)

/** Current combo for every action: the default unless changed in settings ('' means none). */
export function bindings(): Record<string, string> {
  const overrides = useStore.getState().settings.shortcuts || {}
  const out: Record<string, string> = {}
  for (const def of SHORTCUT_DEFS) out[def.id] = def.id in overrides ? overrides[def.id] : defaultCombo(def)
  return out
}

export function actionFor(combo: string): string | undefined {
  const map = bindings()
  return Object.keys(map).find((id) => map[id] === combo)
}

/** Display form of an action's shortcut, for menus and tooltips. Empty when it has none. */
export const hint = (id: string) => formatCombo(bindings()[id] || '')

/** True while Settings is waiting for the user to press a new shortcut. */
export const recording = { active: false }

/** Tell the desktop app's menu bar which shortcuts to show. */
export function syncDesktopMenu() {
  if (!desktop?.setShortcuts) return
  const out: Record<string, string> = {}
  for (const [id, combo] of Object.entries(bindings())) {
    if (combo) out[id] = combo.replace(/\bMod\b/, 'CmdOrCtrl').replace(/\+$/, '+Plus')
  }
  desktop.setShortcuts(out)
}
