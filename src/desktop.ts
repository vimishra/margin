// The desktop app (Electron) exposes a few native features to the page. In a browser this is undefined.
import { EditorView } from '@codemirror/view'

export type ContextAction = { type: 'open'; target: string; side?: boolean } | { type: 'search'; query: string } | { type: 'format'; kind: string }

export interface DesktopBridge {
  platform: string
  onCommand(handler: (id: string) => void): () => void
  onContextAction?(handler: (action: ContextAction) => void): () => void
  chooseVault(): Promise<boolean>
  revealVault(): Promise<unknown>
  revealFile(relativePath: string): Promise<unknown>
  savePdf(name: string): Promise<string | null>
  /** Ask for a folder; resolves to its path, or null if cancelled. */
  chooseFolder?(title: string): Promise<string | null>
  /** Action id → accelerator, shown next to the menu bar items. */
  setShortcuts?(map: Record<string, string>): void
  /** The keys that open Quick task (`captureTask`) and Quick capture (`capture`) from any app. */
  globalKeys?(): Promise<GlobalKeys>
  setGlobalKey?(id: GlobalKeyId, combo: string): Promise<GlobalKeys>
  /** The system's accent colour as "#rrggbb", or null where there is none. */
  accentColor?(): Promise<string | null>
  onAccent?(handler: (color: string | null) => void): () => void
  /** A system notification (a task's reminder); a click brings the window forward and calls onNotifyClick with the id. */
  notify?(id: string, title: string, body: string): void
  onNotifyClick?(handler: (id: string) => void): () => void
}

declare global {
  interface Window {
    marginDesktop?: DesktopBridge
  }
}

export const desktop: DesktopBridge | undefined = window.marginDesktop
export const fileManager = desktop?.platform === 'darwin' ? 'Finder' : 'file manager'

/** The tasks a right-click in the editor is about, for the task items at the top of the desktop menu. */
export interface ContextTasks {
  /** Every one of them ticked or cancelled. */
  allDone: boolean
  allCancelled: boolean
  count: number
}

const TASK_BOX = /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([ xX-])\]\s/

/**
 * The tasks under a right-click in the editor: the selected ones when the click is inside a selection, otherwise the
 * line clicked, and then the cursor moves to that line, so the menu's task items act on what was clicked.
 */
export function tasksAt(e: MouseEvent): ContextTasks | undefined {
  const content = (e.target as HTMLElement).closest<HTMLElement>('.cm-content')
  const view = content && EditorView.findFromDOM(content)
  const pos = view?.posAtCoords({ x: e.clientX, y: e.clientY })
  if (!view || pos == null) return undefined
  const { doc, selection } = view.state
  const sel = selection.main
  const inside = !sel.empty && pos >= sel.from && pos <= sel.to
  const first = doc.lineAt(inside ? sel.from : pos).number
  const last = doc.lineAt(inside ? sel.to : pos).number
  const boxes: string[] = []
  for (let n = first; n <= last; n++) {
    const m = TASK_BOX.exec(doc.line(n).text)
    if (m) boxes.push(m[1])
  }
  if (!boxes.length) return undefined
  if (!inside && !(sel.empty && doc.lineAt(sel.head).number === first)) view.dispatch({ selection: { anchor: pos } })
  return { allDone: boxes.every((b) => b !== ' '), allCancelled: boxes.every((b) => b === '-'), count: boxes.length }
}

if (desktop) {
  // Tells the desktop app's right-click menu what is under the pointer.
  let context: { editor?: boolean; note?: string; href?: string; tasks?: ContextTasks; handled?: boolean } = {}
  ;(window as unknown as { __marginContext: () => typeof context }).__marginContext = () => context
  window.addEventListener(
    'contextmenu',
    (e) => {
      const el = e.target as HTMLElement
      const note = el.closest<HTMLElement>('[data-target]')?.dataset.target
      const href = el.closest<HTMLElement>('[data-href]')?.dataset.href
      const editor = !!el.closest('.cm-content')
      context = { editor, note, href: href ? (/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : /^www\./i.test(href) ? 'https://' + href : href) : undefined, tasks: editor ? tasksAt(e) : undefined }
    },
    true,
  )
  // A right-click that the page answered with its own menu (a task in the Tasks view): no system menu as well.
  window.addEventListener('contextmenu', (e) => (context.handled = e.defaultPrevented))
}

if (desktop) document.documentElement.classList.add('desktop', `desktop-${desktop.platform}`)

export type GlobalKeyId = 'captureTask' | 'capture'
/** Combos in the page's form ("Ctrl+Alt+Space"); '' is off. `status` says whether the system accepted each one. */
export interface GlobalKeys {
  keys: Record<GlobalKeyId, string>
  defaults: Record<GlobalKeyId, string>
  status: Partial<Record<GlobalKeyId, 'on' | 'off' | 'refused'>>
}
