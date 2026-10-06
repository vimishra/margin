import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { fontCss } from '../store'
import { cx } from '../lib/util'

// Checked for availability when the browser cannot list installed fonts itself.
const CANDIDATES = [
  'American Typewriter', 'Andale Mono', 'Arial', 'Athelas', 'Avenir', 'Avenir Next', 'Baskerville', 'Bookman Old Style', 'Calibri', 'Cambria',
  'Candara', 'Cantarell', 'Cascadia Code', 'Cascadia Mono', 'Century Gothic', 'Charter', 'Cochin', 'Comic Sans MS', 'Consolas', 'Constantia',
  'Corbel', 'Courier', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'Didot', 'Fira Code', 'Fira Mono', 'Fira Sans',
  'Futura', 'Garamond', 'Geneva', 'Georgia', 'Gill Sans', 'Hack', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'IBM Plex Mono',
  'IBM Plex Sans', 'IBM Plex Serif', 'Inconsolata', 'Inter', 'Iosevka', 'Iowan Old Style', 'JetBrains Mono', 'Lato', 'Liberation Mono',
  'Liberation Sans', 'Liberation Serif', 'Lucida Grande', 'Menlo', 'Merriweather', 'Monaco', 'Montserrat', 'New York', 'Noto Sans',
  'Noto Sans Mono', 'Noto Serif', 'Open Sans', 'Optima', 'Palatino', 'Palatino Linotype', 'PT Mono', 'PT Sans', 'PT Serif', 'Roboto',
  'Roboto Mono', 'Roboto Slab', 'Rockwell', 'SF Mono', 'SF Pro Text', 'Segoe UI', 'Seravek', 'Source Code Pro', 'Source Sans 3',
  'Source Serif 4', 'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Ubuntu', 'Ubuntu Mono', 'Verdana',
]
const MONO = /mono|code|courier|menlo|consol|monaco|hack|iosevka|inconsolata|terminal|typewriter/i

/** A font is installed if text set in it measures differently from the generic fallbacks. */
function isInstalled(family: string): boolean {
  const ctx = (isInstalled as { ctx?: CanvasRenderingContext2D | null }).ctx ?? ((isInstalled as { ctx?: CanvasRenderingContext2D | null }).ctx = document.createElement('canvas').getContext('2d'))
  if (!ctx) return true
  const sample = 'mmmmmmmmmlli WQ@ 0123'
  return ['monospace', 'serif'].some((fallback) => {
    ctx.font = `72px ${fallback}`
    const base = ctx.measureText(sample).width
    ctx.font = `72px "${family}", ${fallback}`
    return ctx.measureText(sample).width !== base
  })
}

let cached: string[] | null = null
async function installedFonts(): Promise<string[]> {
  if (cached) return cached
  let families: string[] = []
  const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
  if (query) {
    try {
      families = [...new Set((await query.call(window)).map((f) => f.family))].filter((f) => !f.startsWith('.'))
    } catch {
      /* permission refused: fall back to probing well-known fonts */
    }
  }
  if (!families.length) families = CANDIDATES.filter(isInstalled)
  cached = families.sort((a, b) => a.localeCompare(b))
  return cached
}

interface Props {
  value: string
  onChange: (family: string) => void
  /** Label for the built-in default, e.g. "System default". */
  defaultLabel: string
  /** List monospaced fonts first (for the code font). */
  preferMono?: boolean
}

export function FontPicker({ value, onChange, defaultLabel, preferMono }: Props) {
  const [open, setOpen] = useState(false)
  const [fonts, setFonts] = useState<string[] | null>(cached)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const isDefault = !value || value === 'system'

  useEffect(() => {
    if (!open) return
    installedFonts().then(setFonts)
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (fonts || []).filter((f) => !q || f.toLowerCase().includes(q))
    return preferMono ? [...list.filter((f) => MONO.test(f)), ...list.filter((f) => !MONO.test(f))] : list
  }, [fonts, query, preferMono])
  const typed = query.trim()
  const custom = typed && !shown.some((f) => f.toLowerCase() === typed.toLowerCase()) ? typed : ''

  const pick = (family: string) => {
    onChange(family)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="font-picker" ref={root}>
      <button className="font-button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span style={{ fontFamily: fontCss(value, preferMono) }}>{isDefault ? defaultLabel : value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="font-pop" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))}>
          <label className="font-search">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              placeholder="Search fonts or type a name"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (custom ? pick(custom) : shown[0] && pick(shown[0]))}
            />
          </label>
          <div className="font-list" role="listbox">
            {!typed && (
              <button className={cx('font-item', isDefault && 'on')} onClick={() => pick('system')}>
                <span>{defaultLabel}</span>
                {isDefault && <Check size={14} />}
              </button>
            )}
            {fonts === null && <p className="pane-empty">Looking for installed fonts…</p>}
            {shown.map((f) => (
              <button key={f} className={cx('font-item', f === value && 'on')} onClick={() => pick(f)}>
                <span style={{ fontFamily: `"${f}"` }}>{f}</span>
                {f === value && <Check size={14} />}
              </button>
            ))}
            {custom && (
              <button className="font-item" onClick={() => pick(custom)}>
                <span>
                  Use “<span style={{ fontFamily: `"${custom}"` }}>{custom}</span>”
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
