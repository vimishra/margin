// The colour theme gallery: a panel beside the page, so a theme can be judged on the note itself. Each theme is a
// small page drawn in its colours; clicking one applies it at once, for the light or the dark appearance. The
// themes are added here too (from the Bear app on this computer, or from .theme files) and taken out again.
import { useEffect, useState } from 'react'
import { Check, Moon, Plus, Sun, X } from 'lucide-react'
import { api } from '../api'
import { setColorThemes, setSetting, toast, ui, useStore } from '../store'
import { isDarkTheme, isThemeFile, themeVars, type ColorTheme, type ThemeFile } from '../lib/themes'
import { cx } from '../lib/util'

/** A theme drawn as a tiny page: its sidebar, a heading, lines of text, a link and its accent. */
/** Margin's own colours (styles.css), for the "None" card, which must not show the theme in use. */
const MARGIN_COLORS = {
  light: { '--bg': '#ffffff', '--text': '#8e9093', '--accent': '#5b5bd6', '--theme-side-bg': '#f3f4f6', '--theme-link': '#5b5bd6', '--theme-heading': '#15171a' },
  dark: { '--bg': '#161617', '--text': '#98989b', '--accent': '#8787f2', '--theme-side-bg': '#222224', '--theme-link': '#8787f2', '--theme-heading': '#f8f8f9' },
}

export function ThemeCard({ theme, size = 'card', dark = false }: { theme: ThemeFile | null; size?: 'card' | 'chip'; dark?: boolean }) {
  const v: Record<string, string> = theme ? themeVars(theme) : MARGIN_COLORS[dark ? 'dark' : 'light']
  const heading = v['--theme-heading'] || v['--text']
  return (
    <span className={cx('theme-mini', size)} style={{ background: v['--bg'] }} aria-hidden>
      <span className="theme-mini-side" style={{ background: v['--theme-side-bg'] }} />
      <span className="theme-mini-page">
        <span className="theme-mini-line h" style={{ background: heading }} />
        <span className="theme-mini-line" style={{ background: v['--text'] }} />
        <span className="theme-mini-line short" style={{ background: v['--text'] }} />
        <span className="theme-mini-row">
          <span className="theme-mini-dot" style={{ background: v['--accent'] }} />
          <span className="theme-mini-line link" style={{ background: v['--theme-link'] }} />
        </span>
      </span>
    </span>
  )
}

export function ThemeGallery() {
  const kind = useStore((s) => s.themeGallery)
  const themes = useStore((s) => s.colorThemes)
  const settings = useStore((s) => s.settings)
  const bearInstalled = useStore((s) => s.bearInstalled)
  const showing = useStore((s) => s.theme)
  const [bear, setBear] = useState<ColorTheme[] | null>(null)
  const [examples, setExamples] = useState<(ColorTheme & { base: string; ready: boolean })[] | null>(null)
  const dark = kind === 'dark'
  const key = dark ? 'themeDark' : 'themeLight'
  const current = settings[key]

  // Bear's themes, to offer the ones not in the notes folder yet.
  useEffect(() => {
    if (!bearInstalled || bear) return
    api.bearThemes().then((r) => setBear(r.themes), () => setBear([]))
  }, [bearInstalled, bear])
  // Margin's own example themes, built on a Bear theme; filled in from it when added. Asked again when the themes
  // here change, since adding the base makes an example ready.
  useEffect(() => {
    if (!kind) return
    api.exampleThemes().then((r) => setExamples(r.themes), () => setExamples([]))
  }, [kind, themes])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && ui({ themeGallery: '' })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!kind) return null

  const mine = themes.filter((t) => isDarkTheme(t.theme) === dark)
  const have = new Set(themes.map((t) => t.name))
  const notYet = (bear ?? []).filter((t) => !have.has(t.name) && isDarkTheme(t.theme) === dark)
  const exampleCards = (examples ?? []).filter((t) => !have.has(t.name) && isDarkTheme(t.theme) === dark)
  // What the page shows now, so it is clear when a choice applies only later.
  const pageIsDark = document.documentElement.dataset.theme === 'dark'

  const addBear = async (names: string[], choose?: string) => {
    try {
      const res = await api.addBearThemes(names)
      setColorThemes(res.themes)
      if (choose) setSetting(key, choose)
      else toast(res.added.length === 1 ? `Added “${res.added[0]}”` : `Added ${res.added.length} themes`)
    } catch (e) {
      toast(`Could not add the themes: ${(e as Error).message}`)
    }
  }
  const addExample = async (name: string) => {
    try {
      const res = await api.addExampleThemes([name])
      setColorThemes(res.themes)
      setSetting(key, name)
    } catch (e) {
      toast(`Could not add “${name}”: ${(e as Error).message}`)
    }
  }
  const addFiles = async (files: File[]) => {
    const added: string[] = []
    const refused: string[] = []
    const orphans: string[] = []
    for (const file of files) {
      try {
        const theme = JSON.parse(await file.text())
        // A theme built on another ("base theme") is completed by the server; anything else must be complete.
        if (!isThemeFile(theme) && typeof theme?.meta?.['base theme'] !== 'string') {
          refused.push(file.name)
          continue
        }
        const res = await api.addThemeFile(file.name, theme)
        setColorThemes(res.themes)
        added.push(...res.added)
      } catch (e) {
        const base = /^It builds on the theme “(.+?)”/.exec((e as Error).message)?.[1]
        if (base) orphans.push(`“${file.name}” builds on “${base}”, which is not here: add that one first, or add it on a computer with Bear`)
        else refused.push(file.name)
      }
    }
    const done = added.length === 1 ? `Added “${added[0]}”` : added.length ? `Added ${added.length} themes` : ''
    const bad = refused.length === 1 ? `“${refused[0]}” is not a theme file Margin can read` : refused.length ? `${refused.length} files are not theme files Margin can read (${refused.join(', ')})` : ''
    toast([done, bad, ...orphans].filter(Boolean).join('. '))
  }
  const remove = async (name: string) => {
    const res = await api.removeTheme(name)
    if (settings.themeLight === name) setSetting('themeLight', '')
    if (settings.themeDark === name) setSetting('themeDark', '')
    setColorThemes(res.themes)
    toast(`Removed “${name}” from this notes folder`)
  }

  return (
    <aside className="theme-gallery" aria-label="Colour themes">
      <header className="theme-gallery-head">
        <h2>Colour themes</h2>
        <button className="icon-btn" title="Close  Esc" onClick={() => ui({ themeGallery: '' })}>
          <X size={16} />
        </button>
      </header>
      <div className="theme-gallery-tabs" role="tablist">
        <button role="tab" aria-selected={!dark} className={cx(!dark && 'on')} onClick={() => ui({ themeGallery: 'light' })}>
          <Sun size={14} /> For light
        </button>
        <button role="tab" aria-selected={dark} className={cx(dark && 'on')} onClick={() => ui({ themeGallery: 'dark' })}>
          <Moon size={14} /> For dark
        </button>
      </div>
      {pageIsDark !== dark && (
        <p className="theme-gallery-note">
          Margin is showing its {pageIsDark ? 'dark' : 'light'} look now{showing === 'system' ? ' (it follows your Mac)' : ''}, so a {dark ? 'dark' : 'light'} theme chosen here shows when it is {dark ? 'dark' : 'light'}.
        </p>
      )}

      <div className="theme-gallery-body">
        <div className="theme-grid">
          <button className={cx('theme-card', !current && 'on')} onClick={() => setSetting(key, '')} title="Margin's own colours (or the Bear style's)">
            <ThemeCard theme={null} dark={dark} />
            <span className="theme-card-name">None{!current && <Check size={13} />}</span>
          </button>
          {mine.map((t) => (
            <div key={t.name} className={cx('theme-card', current === t.name && 'on')}>
              <button className="theme-card-pick" onClick={() => setSetting(key, t.name)} title={`Use “${t.name}”`}>
                <ThemeCard theme={t.theme} />
                <span className="theme-card-name">
                  {t.name}
                  {current === t.name && <Check size={13} />}
                </span>
              </button>
              <button className="theme-card-remove" title={`Remove “${t.name}” from this notes folder`} onClick={() => void remove(t.name)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {exampleCards.length > 0 && (
          <>
            <div className="theme-gallery-section">
              <h3>Examples from Margin</h3>
            </div>
            <div className="theme-grid">
              {exampleCards.map((t) => (
                <button
                  key={t.name}
                  className="theme-card add"
                  disabled={!t.ready}
                  onClick={() => void addExample(t.name)}
                  title={t.ready ? `Add “${t.name}” (built on “${t.base}”) to this notes folder and use it` : `Built on “${t.base}”, which is not here: add it from Bear first`}
                >
                  <ThemeCard theme={t.theme} />
                  <span className="theme-card-name">
                    <Plus size={12} /> {t.name}
                  </span>
                  {!t.ready && <small className="theme-card-needs">Needs {t.base}</small>}
                </button>
              ))}
            </div>
          </>
        )}

        {notYet.length > 0 && (
          <>
            <div className="theme-gallery-section">
              <h3>In Bear, not added yet</h3>
              <button className="btn ghost sm" onClick={() => void addBear(notYet.map((t) => t.name))}>
                <Plus size={13} /> Add all {notYet.length}
              </button>
            </div>
            <div className="theme-grid">
              {notYet.map((t) => (
                <button key={t.name} className="theme-card add" onClick={() => void addBear([t.name], t.name)} title={`Add “${t.name}” to this notes folder and use it`}>
                  <ThemeCard theme={t.theme} />
                  <span className="theme-card-name">
                    <Plus size={12} /> {t.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="theme-gallery-foot">
        <label className="btn sm">
          Add .theme files…
          <input
            type="file"
            accept=".theme,application/json"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) void addFiles(files)
            }}
          />
        </label>
        <small>
          Themes are kept in the notes folder (.margin/themes), so every computer that opens it has them.{' '}
          {bearInstalled ? '' : 'Bear is not installed here: add .theme files copied from .margin/themes on a computer that has it.'}
        </small>
      </footer>
    </aside>
  )
}
