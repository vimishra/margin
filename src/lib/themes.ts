// Colour themes in Bear's theme format (a .theme file: JSON with sections "base", "editor", "sidebar", "notes";
// a value can refer to another as "$section.key"). Margin reads the colours and turns them into its own CSS
// variables; fonts and sizes in the file are left out, so Margin's own text settings still apply.

export type ThemeFile = Record<string, unknown>

export interface ColorTheme {
  /** The name, from the file name. */
  name: string
  theme: ThemeFile
}

/** A value in the file, following "$section.key" references (keys may contain spaces, never dots). */
export function themeValue(theme: ThemeFile, key: string, depth = 0): unknown {
  let cur: unknown = theme
  for (const part of key.split('.')) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[part] : undefined
  if (typeof cur === 'string' && cur.startsWith('$') && depth < 12) return themeValue(theme, cur.slice(1), depth + 1)
  return cur
}

/** A colour from the file as CSS, or '' when the key is missing or not a colour. */
export function themeColor(theme: ThemeFile, key: string): string {
  const v = themeValue(theme, key)
  if (typeof v !== 'string') return ''
  const s = v.trim()
  return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) || /^(rgb|hsl)a?\([^)]*\)$/i.test(s) ? s : ''
}

/** Relative brightness of a hex colour, 0 (black) to 1 (white); 1 for anything else. */
export function luminance(color: string): number {
  const m = /^#([0-9a-f]{6}|[0-9a-f]{3})(?:[0-9a-f]{2}|[0-9a-f])?$/i.exec(color.trim())
  if (!m) return 1
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The page's background colour. */
export const pageColor = (t: ThemeFile) => themeColor(t, 'editor.background color') || themeColor(t, 'base.background color')

/** True for a theme with a dark page. */
export const isDarkTheme = (t: ThemeFile) => luminance(pageColor(t) || '#ffffff') < 0.2

/** True when the file has what a theme needs: a page and a text colour. */
export const isThemeFile = (t: unknown): t is ThemeFile =>
  !!t && typeof t === 'object' && !!pageColor(t as ThemeFile) && !!(themeColor(t as ThemeFile, 'editor.text color') || themeColor(t as ThemeFile, 'base.text color'))

const mix = (a: string, pct: number, b: string) => `color-mix(in srgb, ${a} ${pct}%, ${b})`

/**
 * Margin's CSS variables for a theme, set on the page root. Page colours use Margin's usual names; the sidebar's
 * own colours (a light theme can have a dark sidebar) and the few things Margin otherwise colours itself (links,
 * tags, the cursor, selection, headings) use --theme-* names that the stylesheet applies while a theme is on.
 */
export function themeVars(t: ThemeFile): Record<string, string> {
  const c = (key: string) => themeColor(t, key)
  const dark = isDarkTheme(t)
  const bg = pageColor(t)
  const text = c('editor.text color') || c('base.text color')
  const text2 = c('base.text secondary color') || c('editor.text light color') || mix(text, 75, bg)
  const accent = c('editor.accent color') || c('base.accent color') || text
  const secondary = c('base.background secondary color') || mix(text, 5, bg)
  const vars: Record<string, string> = {
    '--bg': bg,
    '--bg-raised': dark ? secondary : bg,
    '--bg-sunken': c('editor.code.background color') || secondary,
    '--hover': mix(text, 6, 'transparent'),
    '--active': mix(text, 12, 'transparent'),
    '--border': c('base.stroke color') || mix(text, 12, bg),
    '--border-strong': mix(text, 25, bg),
    '--text': text,
    '--text-2': text2,
    '--text-3': c('editor.text light color') ? mix(c('editor.text light color'), 85, bg) : mix(text, 55, bg),
    '--text-4': mix(text, 35, bg),
    '--accent': accent,
    '--accent-hover': mix(accent, 85, text),
    '--accent-soft': mix(accent, dark ? 18 : 12, 'transparent'),
    '--accent-text': accent,
    '--code': c('editor.code.text color') || text,
    '--mark': c('editor.highlighter.default.background color') || mix(accent, 25, 'transparent'),
    '--dot': mix(text, 12, 'transparent'),
    '--theme-link': c('editor.link color') || accent,
    '--theme-heading': c('editor.headers.text color'),
    '--theme-list-marker': c('editor.list marker color') || accent,
    '--theme-cursor': c('editor.cursor color') || accent,
    '--theme-selection': c('editor.selection color') || mix(accent, 25, 'transparent'),
    '--theme-tag-bg': c('editor.tag.background color') || mix(accent, 14, 'transparent'),
    '--theme-tag-text': c('editor.tag.text color') || accent,
    '--theme-check': c('editor.task.check color') || accent,
    '--theme-mark-text': c('editor.highlighter.default.text color') || 'inherit',
    '--theme-code-border': c('editor.code.border color') || c('base.stroke color') || mix(text, 15, bg),
  }
  // The code colours, by kind.
  const syn: [string, string][] = [
    ['comment', 'comment'],
    ['keyword', 'keyword'],
    ['string', 'string'],
    ['number', 'number'],
    ['function', 'function'],
    ['type', 'entity'],
    ['property', 'variable'],
  ]
  for (const [ours, theirs] of syn) {
    const v = c(`editor.code.syntax highlight.${theirs}`)
    if (v) vars[`--syn-${ours}`] = v
  }
  vars['--syn-punct'] = mix(vars['--code'], 65, bg)
  // The sidebar: its own page, text and selection.
  const sideBg = c('sidebar.background color') || bg
  const sideText = c('sidebar.text color') || text
  const sideDark = luminance(sideBg) < 0.2
  Object.assign(vars, {
    '--theme-side-bg': sideBg,
    '--theme-side-text': sideText,
    '--theme-side-text-2': mix(sideText, 85, sideBg),
    '--theme-side-text-3': c('sidebar.icon color') ? mix(c('sidebar.icon color'), 85, sideBg) : mix(sideText, 60, sideBg),
    '--theme-side-text-4': mix(sideText, 38, sideBg),
    '--theme-side-raised': mix(sideText, sideDark ? 9 : 4, sideBg),
    '--theme-side-border': c('sidebar.stroke color') || mix(sideText, 15, sideBg),
    '--theme-side-hover': mix(sideText, 8, 'transparent'),
    '--theme-side-active': c('sidebar.background secondary color') || mix(sideText, 15, 'transparent'),
    '--theme-side-accent': c('sidebar.selected icon color') || c('sidebar.accent color') || accent,
    '--theme-side-scheme': sideDark ? 'dark' : 'light',
  })
  for (const k of Object.keys(vars)) if (!vars[k]) delete vars[k]
  return vars
}

/** Every variable a theme can set, to take them all off again when it is turned off. */
export const THEME_VAR_NAMES = Object.keys(themeVars({ editor: { 'background color': '#fff', 'text color': '#000' } }))
  .concat(['--syn-comment', '--syn-keyword', '--syn-string', '--syn-number', '--syn-function', '--syn-type', '--syn-property', '--theme-heading'])
  .filter((v, i, a) => a.indexOf(v) === i)

/** Three colours that sum a theme up, for its swatch: page, text, accent. */
export function themeSwatch(t: ThemeFile): [string, string, string, string] {
  const v = themeVars(t)
  return [v['--bg'], v['--text'], v['--accent'], v['--theme-side-bg']]
}
