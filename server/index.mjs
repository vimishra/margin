// Margin server: a thin layer over a folder of markdown files.
// Every note is a plain .md file with YAML frontmatter. There is no database.
import express from 'express'
import yaml from 'js-yaml'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { seedNotes } from './seed.mjs'
import { importObsidian } from './obsidian.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// The notes folder: VAULT_DIR if given, else the folder chosen in the desktop app, else ./vault.
// The desktop app always passes VAULT_DIR, so this lookup only matters when run from a terminal.
function desktopVault() {
  const base =
    process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.platform === 'win32' ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  try {
    const dir = JSON.parse(fssync.readFileSync(path.join(base, 'Margin', 'config.json'), 'utf8')).vaultDir
    if (typeof dir !== 'string' || !dir) return null
    if (fssync.existsSync(dir)) return dir
    console.warn(`\n  The notes folder chosen in the desktop app is missing: ${dir}\n  Using ./vault instead.`)
  } catch {}
  return null
}
const VAULT = path.resolve(process.env.VAULT_DIR || desktopVault() || path.join(ROOT, 'vault'))
const PORT = Number(process.env.PORT || 4321)
const DEV = process.argv.includes('--dev')
const HISTORY = path.join(VAULT, '.history')
const TRASH = path.join(VAULT, '.trash')
const CONFIG_FILE = path.join(VAULT, '.margin', 'config.json')
// Settings that belong to the notes folder itself rather than to one browser or app.
const config = { attachments: 'attachments', folderTags: {} }
try {
  Object.assign(config, JSON.parse(fssync.readFileSync(CONFIG_FILE, 'utf8')))
} catch {
  /* no config yet: defaults apply */
}
/** Folders that hold files, not notes: the configured one, plus the original default so older links keep working. */
const isAttachmentsDir = (name) => [config.attachments, 'attachments'].some((n) => n.toLowerCase() === name.toLowerCase())
const BUCKET = 5 * 60 * 1000 // one version snapshot per 5-minute window
const MAX_VERSIONS = 200
const TYPES = ['note', 'daily', 'article', 'scratch']

/** id -> { id, path, extra, ...fields, content } */
let notes = new Map()
let folders = []

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const h = (fn) => (req, res, next) => fn(req, res).catch(next)
const newId = () => crypto.randomBytes(5).toString('hex')
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex')
const exists = (p) => fs.access(p).then(() => true, () => false)

function abs(rel) {
  const p = path.resolve(VAULT, rel)
  if (p !== VAULT && !p.startsWith(VAULT + path.sep)) throw new HttpError(400, 'Invalid path')
  return p
}

function sanitizeName(name) {
  const s = String(name ?? '')
    .replace(/[\/\\:*?"<>|#^\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim()
  return s || 'Untitled'
}

function sanitizeFolder(folder) {
  return String(folder ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(sanitizeName)
    .join('/')
}

function iso(v) {
  if (!v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

function parseFile(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw)
  let data = {}
  let content = raw
  if (m) {
    try {
      const loaded = yaml.load(m[1], { schema: yaml.JSON_SCHEMA })
      if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
        data = loaded
        content = raw.slice(m[0].length)
      }
    } catch {
      /* not valid frontmatter: treat the whole file as content */
    }
  }
  if (content.endsWith('\n')) content = content.slice(0, -1)
  return { data, content }
}

const KNOWN = ['id', 'title', 'type', 'tags', 'pinned', 'created', 'updated', 'expires', 'source', 'status', 'view']

function toRecord(rel, raw, stat) {
  const { data, content } = parseFile(raw)
  const extra = {}
  for (const k of Object.keys(data)) if (!KNOWN.includes(k)) extra[k] = data[k]
  const tags = Array.isArray(data.tags)
    ? data.tags.map(String)
    : typeof data.tags === 'string'
      ? data.tags.split(/[,\s]+/).filter(Boolean)
      : []
  return {
    id: data.id ? String(data.id) : 'p' + sha(rel).slice(0, 10),
    path: rel,
    title: data.title ? String(data.title) : path.basename(rel, '.md'),
    type: TYPES.includes(data.type) ? data.type : 'note',
    tags: tags.map((t) => t.replace(/^#/, '')),
    pinned: data.pinned === true,
    created: iso(data.created) || stat.birthtime.toISOString(),
    updated: iso(data.updated) || stat.mtime.toISOString(),
    expires: iso(data.expires),
    source: data.source ? String(data.source) : undefined,
    status: data.status ? String(data.status) : undefined,
    view: data.view === 'canvas' ? 'canvas' : undefined,
    content,
    extra,
  }
}

function serialize(rec) {
  const data = { id: rec.id }
  if (sanitizeName(rec.title) !== path.basename(rec.path, '.md')) data.title = rec.title
  if (rec.type !== 'note') data.type = rec.type
  if (rec.tags.length) data.tags = rec.tags
  if (rec.pinned) data.pinned = true
  data.created = rec.created
  data.updated = rec.updated
  for (const k of ['expires', 'source', 'status', 'view']) if (rec[k]) data[k] = rec[k]
  Object.assign(data, rec.extra)
  return '---\n' + yaml.dump(data, { lineWidth: -1 }) + '---\n' + rec.content + '\n'
}

function publicNote(rec) {
  const { extra, ...rest } = rec
  const folder = path.dirname(rec.path)
  return { ...rest, folder: folder === '.' ? '' : folder.split(path.sep).join('/') }
}

async function writeRecord(rec) {
  const file = abs(rec.path)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, serialize(rec))
}

/** A free path for `title` inside `folder`; `current` is the note's own path (allowed). */
async function freePath(folder, title, current) {
  const base = sanitizeName(title)
  for (let i = 1; ; i++) {
    const rel = path.posix.join(folder, (i === 1 ? base : `${base} ${i}`) + '.md')
    if (current && rel.toLowerCase() === current.toLowerCase()) return rel
    if (!(await exists(abs(rel)))) return rel
  }
}

// ---------- vault scanning ----------

async function scan() {
  await fs.mkdir(VAULT, { recursive: true })
  const next = new Map()
  const dirs = []
  async function walk(dir, rel) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const r = rel ? rel + '/' + e.name : e.name
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!rel && isAttachmentsDir(e.name)) continue
        dirs.push(r)
        await walk(full, r)
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        const [raw, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
        const rec = toRecord(r, raw, stat)
        if (next.has(rec.id)) rec.id = 'p' + sha(r).slice(0, 10) // duplicated file: keep ids unique
        next.set(rec.id, rec)
      }
    }
  }
  await walk(VAULT, '')
  notes = next
  folders = dirs.sort((a, b) => a.localeCompare(b))
  await purgeExpired()
}

async function trashFile(rec) {
  await fs.mkdir(TRASH, { recursive: true })
  const dest = path.join(TRASH, `${Date.now()}-${path.basename(rec.path)}`)
  await fs.rename(abs(rec.path), dest).catch(() => {})
  notes.delete(rec.id)
}

async function purgeExpired() {
  const now = Date.now()
  for (const rec of [...notes.values()]) {
    if (rec.type === 'scratch' && rec.expires && new Date(rec.expires).getTime() < now) await trashFile(rec)
  }
}

// ---------- version history ----------

async function listVersions(id) {
  const dir = path.join(HISTORY, id)
  const files = await fs.readdir(dir).catch(() => [])
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => Number(f.slice(0, -3)))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)
}

async function snapshot(id, previous, content) {
  const dir = path.join(HISTORY, id)
  await fs.mkdir(dir, { recursive: true })
  const versions = await listVersions(id)
  const bucket = Math.floor(Date.now() / BUCKET) * BUCKET
  // Keep the state from before the first tracked edit so there is always something to go back to.
  if (!versions.length && previous.trim()) await fs.writeFile(path.join(dir, `${bucket - BUCKET}.md`), previous)
  await fs.writeFile(path.join(dir, `${bucket}.md`), content)
  for (const old of versions.slice(MAX_VERSIONS)) await fs.rm(path.join(dir, `${old}.md`), { force: true })
}

// ---------- app ----------

const app = express()
app.use('/api', express.json({ limit: '25mb' }))

app.get('/api/state', h(async (_req, res) => {
  await scan()
  res.json({ notes: [...notes.values()].map(publicNote), folders, vault: VAULT, config })
}))

app.post('/api/notes', h(async (req, res) => {
  const b = req.body || {}
  const folder = sanitizeFolder(b.folder)
  const title = String(b.title || 'Untitled').trim() || 'Untitled'
  const now = new Date().toISOString()
  const rec = {
    id: b.id && !notes.has(b.id) ? String(b.id) : newId(),
    path: await freePath(folder, title),
    title,
    type: TYPES.includes(b.type) ? b.type : 'note',
    tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
    pinned: b.pinned === true,
    created: iso(b.created) || now,
    updated: now,
    expires: iso(b.expires),
    source: b.source ? String(b.source) : undefined,
    status: b.status ? String(b.status) : undefined,
    view: b.view === 'canvas' ? 'canvas' : undefined,
    content: String(b.content ?? ''),
    extra: {},
  }
  // If the name was taken, the file got a numeric suffix: make the title match it.
  rec.title = sanitizeName(title) === title ? path.basename(rec.path, '.md') : title
  await writeRecord(rec)
  notes.set(rec.id, rec)
  const top = folder.split('/').filter(Boolean)
  for (let i = 1; i <= top.length; i++) {
    const f = top.slice(0, i).join('/')
    if (!folders.includes(f)) folders.push(f)
  }
  folders.sort((a, b) => a.localeCompare(b))
  res.json({ note: publicNote(rec), folders })
}))

app.put('/api/notes/:id', h(async (req, res) => {
  const rec = notes.get(req.params.id)
  if (!rec) throw new HttpError(404, 'Note not found')
  const b = req.body || {}
  const touched = []
  const previous = rec.content
  const oldTitle = rec.title
  const oldPath = rec.path

  if (typeof b.content === 'string') rec.content = b.content
  if (Array.isArray(b.tags)) rec.tags = [...new Set(b.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean))]
  if (typeof b.pinned === 'boolean') rec.pinned = b.pinned
  if (TYPES.includes(b.type)) rec.type = b.type
  for (const k of ['source', 'status']) if (k in b) rec[k] = b[k] ? String(b[k]) : undefined
  if ('expires' in b) rec.expires = iso(b.expires)
  if ('view' in b) rec.view = b.view === 'canvas' ? 'canvas' : undefined
  if (typeof b.title === 'string' && b.title.trim()) rec.title = b.title.trim()

  const curFolder = path.posix.dirname(rec.path) === '.' ? '' : path.posix.dirname(rec.path)
  const folder = typeof b.folder === 'string' ? sanitizeFolder(b.folder) : curFolder
  if (rec.title !== oldTitle || folder !== curFolder) {
    const target = await freePath(folder, rec.title, oldPath)
    if (target !== oldPath) {
      await fs.mkdir(path.dirname(abs(target)), { recursive: true })
      await fs.rename(abs(oldPath), abs(target))
      rec.path = target
      if (sanitizeName(rec.title) === rec.title) rec.title = path.basename(target, '.md')
    }
  }

  const contentChanged = rec.content !== previous
  if (contentChanged || rec.title !== oldTitle) rec.updated = new Date().toISOString()
  await writeRecord(rec)
  if (contentChanged) await snapshot(rec.id, previous, rec.content)

  // Keep [[wikilinks]] pointing at this note when it is renamed.
  if (rec.title !== oldTitle) {
    const esc = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\[\\[${esc}(\\]\\]|\\||#)`, 'gi')
    for (const other of notes.values()) {
      if (other.id === rec.id) continue
      const replaced = other.content.replace(re, (_m, tail) => `[[${rec.title}${tail}`)
      if (replaced !== other.content) {
        other.content = replaced
        await writeRecord(other)
        touched.push(publicNote(other))
      }
    }
  }
  res.json({ note: publicNote(rec), touched })
}))

app.delete('/api/notes/:id', h(async (req, res) => {
  const rec = notes.get(req.params.id)
  if (rec) await trashFile(rec)
  res.json({ ok: true })
}))

app.get('/api/notes/:id/versions', h(async (req, res) => {
  const versions = await listVersions(path.basename(req.params.id))
  res.json({ versions })
}))

app.get('/api/notes/:id/versions/:ts', h(async (req, res) => {
  const file = path.join(HISTORY, path.basename(req.params.id), `${Number(req.params.ts)}.md`)
  const content = await fs.readFile(file, 'utf8').catch(() => null)
  if (content === null) throw new HttpError(404, 'Version not found')
  res.json({ content })
}))

app.post('/api/folders', h(async (req, res) => {
  const folder = sanitizeFolder(req.body?.path)
  if (!folder) throw new HttpError(400, 'Folder name required')
  await fs.mkdir(abs(folder), { recursive: true })
  await scan()
  res.json({ folders, path: folder })
}))

app.patch('/api/folders', h(async (req, res) => {
  const from = sanitizeFolder(req.body?.from)
  const to = sanitizeFolder(req.body?.to)
  if (!from || !to) throw new HttpError(400, 'Folder name required')
  if (!(await exists(abs(from)))) throw new HttpError(404, 'Folder not found')
  if (await exists(abs(to))) throw new HttpError(409, 'A folder with that name already exists')
  await fs.mkdir(path.dirname(abs(to)), { recursive: true })
  await fs.rename(abs(from), abs(to))
  // Files without a stored id are identified by path, so pin their ids before the move is visible.
  for (const rec of notes.values()) {
    if (rec.path === from || rec.path.startsWith(from + '/')) {
      rec.path = to + rec.path.slice(from.length)
      await writeRecord(rec)
    }
  }
  await scan()
  res.json({ notes: [...notes.values()].map(publicNote), folders })
}))

app.delete('/api/folders', h(async (req, res) => {
  const folder = sanitizeFolder(req.body?.path)
  if (!folder) throw new HttpError(400, 'Folder name required')
  for (const rec of [...notes.values()]) {
    if (rec.path.startsWith(folder + '/')) await trashFile(rec)
  }
  await fs.rm(abs(folder), { recursive: true, force: true })
  await scan()
  res.json({ notes: [...notes.values()].map(publicNote), folders })
}))

app.post('/api/attachments', express.raw({ type: () => true, limit: '200mb' }), h(async (req, res) => {
  const original = path.basename(String(req.query.name || 'file'))
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const base = path.basename(original, path.extname(original)).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'
  await fs.mkdir(abs(config.attachments), { recursive: true })
  let name = `${base}-${crypto.randomBytes(3).toString('hex')}${ext}`
  // A name chosen for the file (note title and time) is kept as it is, with a number added only if it is taken.
  if (req.query.keep === '1') {
    for (let i = 1; ; i++) {
      name = `${i === 1 ? base : `${base}-${i}`}${ext}`
      if (!(await exists(abs(path.join(config.attachments, name))))) break
    }
  }
  await fs.writeFile(abs(path.join(config.attachments, name)), req.body)
  res.json({ path: `${config.attachments}/${name}`.replace(/ /g, '%20'), name: original })
}))

// Fetch a page title for research notes.
app.get('/api/unfurl', h(async (req, res) => {
  let url
  try {
    url = new URL(String(req.query.url))
  } catch {
    throw new HttpError(400, 'Invalid URL')
  }
  if (!/^https?:$/.test(url.protocol)) throw new HttpError(400, 'Invalid URL')
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (Margin notes)' } })
    const html = (await r.text()).slice(0, 300_000)
    const pick = (re) => (re.exec(html)?.[1] || '').replace(/\s+/g, ' ').trim()
    const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    res.json({
      title: decode(pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || pick(/<title[^>]*>([^<]*)<\/title>/i)),
      description: decode(pick(/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)["']/i)),
    })
  } catch {
    res.json({ title: '', description: '' })
  }
}))

app.put('/api/config', h(async (req, res) => {
  if (typeof req.body?.attachments === 'string') {
    const name = sanitizeName(req.body.attachments)
    if (notes.size && [...notes.values()].some((n) => n.path.toLowerCase().startsWith(name.toLowerCase() + '/'))) {
      throw new HttpError(409, `“${name}” is a notebook with notes in it. Pick a folder that only holds files.`)
    }
    config.attachments = name
  }
  // Tags that notes take on when they are created in, or moved into, a notebook: { "Meetings": ["meeting"] }.
  if (req.body?.folderTags && typeof req.body.folderTags === 'object') {
    const next = {}
    for (const [folder, tags] of Object.entries(req.body.folderTags)) {
      const clean = Array.isArray(tags) ? [...new Set(tags.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean))] : []
      if (sanitizeFolder(folder) && clean.length) next[sanitizeFolder(folder)] = clean
    }
    config.folderTags = next
  }
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
  if (typeof req.body?.attachments === 'string') await scan()
  res.json({ config, folders })
}))

// Copy an Obsidian vault into this one. The Obsidian folder is only read.
app.post('/api/import/obsidian', h(async (req, res) => {
  const given = String(req.body?.source || '').trim()
  if (!given) throw new HttpError(400, 'Choose the Obsidian folder to import')
  const source = path.resolve(given.replace(/^~(?=$|\/)/, os.homedir()))
  const stat = await fs.stat(source).catch(() => null)
  if (!stat?.isDirectory()) throw new HttpError(400, `Could not find a folder at ${source}`)
  if (source === VAULT || source.startsWith(VAULT + path.sep) || VAULT.startsWith(source + path.sep)) {
    throw new HttpError(400, 'Choose a folder that is separate from your Margin notes folder')
  }
  await scan()
  const result = await importObsidian(source, sanitizeFolder(req.body?.dest), {
    VAULT,
    attachments: config.attachments,
    toRecord,
    writeRecord,
    freePath,
    newId,
    hasDaily: (title) => [...notes.values()].some((n) => n.type === 'daily' && n.title === title),
  })
  await scan()
  res.json({ ...result, notes: [...notes.values()].map(publicNote), folders })
}))

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')))
app.use('/files', express.static(VAULT, { dotfiles: 'deny', index: false }))
app.use('/files', (_req, res) => res.status(404).end())
// The guides (Help menu). The HTML pages are self-contained, so nothing else in docs/ is served.
app.get('/docs/:page.html', (req, res) => {
  const file = path.join(ROOT, 'docs', `${req.params.page}.html`)
  if (!/^[\w-]+$/.test(req.params.page) || !fssync.existsSync(file)) return res.status(404).send('Guide not found. Run `npm run docs`.')
  res.sendFile(file)
})

const server = http.createServer(app)

if (DEV) {
  const { createServer } = await import('vite')
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = path.join(ROOT, 'dist')
  if (!fssync.existsSync(path.join(dist, 'index.html'))) {
    console.error('No build found. Run `npm run build` first, or use `npm run dev`.')
    process.exit(1)
  }
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: err.message || 'Server error' })
})

await scan()
if (notes.size === 0 && folders.length === 0) {
  for (const n of seedNotes()) {
    const rec = { id: newId(), tags: [], pinned: false, type: 'note', extra: {}, ...n }
    await writeRecord(rec)
  }
  await scan()
  console.log(`Created a starter vault with ${notes.size} notes.`)
}
setInterval(() => purgeExpired().catch(() => {}), 60_000).unref()

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Margin is probably already running at http://localhost:${PORT}`)
    console.error(`  Open that address, stop the other copy, or pick another port: PORT=${PORT + 1} npm run dev\n`)
    process.exit(1)
  }
  throw err
})

/** Resolves once the server accepts connections. The desktop app waits for this before opening its window. */
export const ready = new Promise((resolve) => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  Margin is running at http://localhost:${PORT}`)
    console.log(`  Notes folder: ${VAULT}\n`)
    resolve({ port: PORT, vault: VAULT })
  })
})
