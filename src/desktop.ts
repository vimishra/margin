// The desktop app (Electron) exposes a few native features to the page. In a browser this is undefined.
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
  /** The system's accent colour as "#rrggbb", or null where there is none. */
  accentColor?(): Promise<string | null>
  onAccent?(handler: (color: string | null) => void): () => void
}

declare global {
  interface Window {
    marginDesktop?: DesktopBridge
  }
}

export const desktop: DesktopBridge | undefined = window.marginDesktop
export const fileManager = desktop?.platform === 'darwin' ? 'Finder' : 'file manager'

if (desktop) {
  // Tells the desktop app's right-click menu what is under the pointer.
  let context: { editor?: boolean; note?: string; href?: string } = {}
  ;(window as unknown as { __marginContext: () => typeof context }).__marginContext = () => context
  window.addEventListener(
    'contextmenu',
    (e) => {
      const el = e.target as HTMLElement
      const note = el.closest<HTMLElement>('[data-target]')?.dataset.target
      const href = el.closest<HTMLElement>('[data-href]')?.dataset.href
      context = { editor: !!el.closest('.cm-content'), note, href: href ? (/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : /^www\./i.test(href) ? 'https://' + href : href) : undefined }
    },
    true,
  )
}

if (desktop) document.documentElement.classList.add('desktop', `desktop-${desktop.platform}`)
