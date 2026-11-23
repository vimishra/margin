// Colour themes in Bear's theme format. Themes are kept in the notes folder (.margin/themes/<name>.theme), so every
// computer that opens the folder has them, Bear or not. They come from the Bear app installed on this computer (read
// only, never changed) or from a .theme file. Margin ships no themes of its own in this format.
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Margin's own example themes (themes/ in the project, Resources/themes in the app). Each is Margin's work: it names a
 * Bear theme as its "base theme" and lists only what it changes, so no Bear file is shipped; it is filled in from that
 * base, from Bear on this computer or the notes folder, when it is added.
 */
function exampleThemeDir() {
  const candidates = [process.resourcesPath && path.join(process.resourcesPath, 'themes'), path.join(here, '..', 'themes')]
  return candidates.find((d) => d && fssync.existsSync(d)) || null
}

/** Where Bear keeps its themes on this computer, if it is installed. MARGIN_BEAR_THEMES points elsewhere for tests. */
function bearThemeDir() {
  if (process.env.MARGIN_BEAR_THEMES !== undefined) return process.env.MARGIN_BEAR_THEMES || null
  if (process.platform !== 'darwin') return null
  const inside = 'Contents/Frameworks/BearCore.framework/Versions/A/Resources'
  for (const app of ['/Applications/Bear.app', path.join(os.homedir(), 'Applications', 'Bear.app')]) {
    const dir = path.join(app, inside)
    if (fssync.existsSync(dir)) return dir
  }
  return null
}

/** A theme's name as a file name: no path parts, nothing a file system refuses. */
function cleanName(name) {
  const n = String(name ?? '')
    .replace(/\.theme$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (!n || n.startsWith('.')) return ''
  return n
}

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** b over a: objects merged key by key, anything else from b. */
function deepMerge(a, b) {
  if (!isObject(a) || !isObject(b)) return b === undefined ? a : b
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v)
  return out
}

/**
 * A theme with what it inherits filled in: Bear's themes can name a "base theme" (in "meta") and list only what
 * they change. Bases are looked up among `known` (name → theme); a missing base leaves the theme as it is.
 */
function complete(theme, known, seen = new Set()) {
  const base = theme?.meta?.['base theme']
  if (typeof base !== 'string' || seen.has(base) || !known.has(base)) return theme
  seen.add(base)
  const merged = deepMerge(complete(known.get(base), known, seen), theme)
  return { ...merged, meta: { ...(merged.meta || {}), 'base theme': base } }
}

/** The themes in a folder: [{ name, theme }], skipping files that are not JSON objects. */
async function readThemes(dir) {
  const files = await fs.readdir(dir).catch(() => [])
  const out = []
  for (const f of files.filter((f) => f.toLowerCase().endsWith('.theme')).sort((a, b) => a.localeCompare(b))) {
    try {
      const theme = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))
      if (theme && typeof theme === 'object' && !Array.isArray(theme)) out.push({ name: f.replace(/\.theme$/i, ''), theme })
    } catch {
      /* not a theme */
    }
  }
  return out
}

export function themeRoutes(app, h, VAULT, HttpError) {
  const dir = path.join(VAULT, '.margin', 'themes')
  const hasPage = (t) => ['editor', 'base'].some((s) => typeof t?.[s]?.['background color'] === 'string')
  /** The themes a theme can be built on: Bear's on this computer, then the notes folder's (which win). */
  const knownThemes = async () => {
    const from = bearThemeDir()
    return new Map([...(from ? await readThemes(from) : []), ...(await readThemes(dir))].map((t) => [t.name, t.theme]))
  }
  /** Margin's examples, each filled in from its base when that is here; `ready` is false when it is not. */
  const examples = async () => {
    const from = exampleThemeDir()
    if (!from) return []
    const known = await knownThemes()
    return (await readThemes(from)).map((t) => {
      const full = complete(t.theme, known)
      const base = typeof t.theme?.meta?.['base theme'] === 'string' ? t.theme.meta['base theme'] : ''
      return { name: t.name, theme: full, base, ready: hasPage(full) && (!base || known.has(base)) }
    })
  }

  // Margin's example themes, to choose from in the gallery.
  app.get('/api/themes/examples', h(async (_req, res) => {
    res.json({ themes: await examples() })
  }))

  // The themes in the notes folder.
  app.get('/api/themes', h(async (_req, res) => {
    res.json({ themes: await readThemes(dir), bear: !!bearThemeDir() })
  }))

  // The themes in the Bear app on this computer, to choose from.
  app.get('/api/themes/bear', h(async (_req, res) => {
    const from = bearThemeDir()
    if (!from) throw new HttpError(404, 'Bear is not installed on this computer')
    const themes = await readThemes(from)
    const known = new Map(themes.map((t) => [t.name, t.theme]))
    res.json({ themes: themes.map((t) => ({ name: t.name, theme: complete(t.theme, known) })) })
  }))

  // Add themes to the notes folder: { names: [...] } from Bear, or { name, theme } from a file. A theme with the
  // same name is replaced. Each is written to a hidden file and renamed into place.
  app.post('/api/themes', h(async (req, res) => {
    const add = []
    if (Array.isArray(req.body?.examples)) {
      const all = new Map((await examples()).map((t) => [t.name, t]))
      for (const n of req.body.examples) {
        const t = all.get(n)
        if (!t) throw new HttpError(404, `Margin has no example theme called “${n}”`)
        if (!t.ready) throw new HttpError(400, `It builds on the theme “${t.base}”, which is not here: add that one first, or add it on a computer with Bear`)
        add.push({ name: cleanName(n), theme: t.theme })
      }
    } else if (Array.isArray(req.body?.names)) {
      const from = bearThemeDir()
      if (!from) throw new HttpError(404, 'Bear is not installed on this computer')
      const bear = new Map((await readThemes(from)).map((t) => [t.name, t.theme]))
      for (const n of req.body.names) {
        if (!bear.has(n)) throw new HttpError(404, `Bear has no theme called “${n}”`)
        // Written complete, so it does not depend on Bear being on the computer that uses it.
        add.push({ name: cleanName(n), theme: complete(bear.get(n), bear) })
      }
    } else {
      const theme = req.body?.theme
      if (!isObject(theme)) throw new HttpError(400, 'That is not a theme file')
      // A theme built on another: filled in from the themes in the notes folder, then Bear's, when it has one.
      const full = complete(theme, await knownThemes())
      if (!hasPage(full)) {
        const base = theme?.meta?.['base theme']
        throw new HttpError(400, typeof base === 'string' ? `It builds on the theme “${base}”, which is not here: add that one first, or add it on a computer with Bear` : 'That is not a theme file')
      }
      add.push({ name: cleanName(req.body?.name), theme: full })
    }
    if (add.some((t) => !t.name)) throw new HttpError(400, 'A theme needs a name')
    await fs.mkdir(dir, { recursive: true })
    for (const t of add) {
      const file = path.join(dir, `${t.name}.theme`)
      const tmp = path.join(dir, `.${t.name}.${process.pid}.tmp`)
      await fs.writeFile(tmp, JSON.stringify(t.theme, null, 2))
      await fs.rename(tmp, file)
    }
    res.json({ themes: await readThemes(dir), added: add.map((t) => t.name) })
  }))

  // Take a theme out of the notes folder.
  app.delete('/api/themes/:name', h(async (req, res) => {
    const name = cleanName(req.params.name)
    if (!name) throw new HttpError(400, 'A theme needs a name')
    await fs.rm(path.join(dir, `${name}.theme`), { force: true })
    res.json({ themes: await readThemes(dir) })
  }))
}
