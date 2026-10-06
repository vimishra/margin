// Import an Obsidian vault by copying it into the Margin vault. The Obsidian folder is only read, never changed.
//
// What gets converted on the way in:
//   ![[image.png|300]]      → ![image|300](attachments/image.png), and the file is copied
//   ![[Some note]]          → [[Some note]]              (note embeds become links)
//   [[folder/Note|alias]]   → [[Note|alias]]             (Margin links by note title)
//   ![](../assets/pic.png)  → ![](attachments/pic.png)   (relative files are copied too)
//   Board.canvas            → a note that opens as a canvas, with the same cards and connections
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const EMBEDDABLE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.pdf'])
// Obsidian's numbered canvas colours: red, orange, yellow, green, cyan, purple.
const CANVAS_COLORS = { 1: 'pink', 2: 'amber', 3: 'amber', 4: 'green', 5: 'blue', 6: 'purple' }

const hash = async (file) => crypto.createHash('sha1').update(await fs.readFile(file)).digest('hex')
const exists = (p) => fs.access(p).then(() => true, () => false)

export async function importObsidian(source, dest, ctx) {
  const { VAULT, toRecord, writeRecord, freePath, newId, hasDaily } = ctx
  const attachments = ctx.attachments || 'attachments'
  const notes = []
  const canvases = []
  const files = new Set()
  const byName = new Map()

  async function walk(dir, rel) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path.join(dir, e.name), r)
      else if (!e.isFile()) continue
      else if (/\.md$/i.test(e.name)) notes.push(r)
      else if (/\.canvas$/i.test(e.name)) canvases.push(r)
      else {
        files.add(r)
        const key = e.name.toLowerCase()
        // Obsidian resolves a bare file name to the shortest matching path.
        if (!byName.has(key) || r.length < byName.get(key).length) byName.set(key, r)
      }
    }
  }
  await walk(source, '')

  const copied = new Map()
  let missing = 0

  /** Copy a referenced file into the attachments folder (once) and return its new path, or null if it cannot be found. */
  async function attach(ref, noteDir) {
    let wanted = ref.trim().replace(/^<|>$/g, '')
    try {
      wanted = decodeURIComponent(wanted)
    } catch {
      /* not URL-encoded */
    }
    wanted = wanted.split(/[#?]/)[0]
    const candidates = [path.posix.normalize(path.posix.join(noteDir, wanted)), path.posix.normalize(wanted), byName.get(path.posix.basename(wanted).toLowerCase())]
    const found = candidates.find((c) => c && files.has(c))
    if (!found) return null
    if (copied.has(found)) return copied.get(found)
    const from = path.join(source, found)
    const ext = path.extname(found).toLowerCase()
    const base = path.basename(found, path.extname(found)).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file'
    await fs.mkdir(path.join(VAULT, attachments), { recursive: true })
    let rel = ''
    for (let i = 1; ; i++) {
      rel = `${attachments}/${i === 1 ? base : `${base}-${i}`}${ext}`
      const target = path.join(VAULT, rel)
      if (!(await exists(target))) {
        await fs.copyFile(from, target)
        break
      }
      // Importing the same vault twice should not duplicate its files.
      if ((await hash(target)) === (await hash(from))) break
    }
    rel = rel.replace(/ /g, '%20')
    copied.set(found, rel)
    return rel
  }

  const noteName = (target) => path.posix.basename(target.trim()).replace(/\.md$/i, '')

  /** Rewrite Obsidian-specific syntax in one piece of markdown. Fenced code is left alone. */
  async function convert(text, noteDir) {
    const parts = text.split(/(^```[\s\S]*?^```[^\n]*$|^~~~[\s\S]*?^~~~[^\n]*$)/m)
    for (let i = 0; i < parts.length; i += 2) parts[i] = await convertProse(parts[i], noteDir)
    return parts.join('')
  }

  async function convertProse(text, noteDir) {
    // Resolve every referenced file first, since copying is asynchronous.
    const refs = new Map()
    for (const m of text.matchAll(/!\[\[([^\]\n|]+)/g)) refs.set(m[1].split('#')[0].trim(), null)
    for (const m of text.matchAll(/\]\(\s*(<[^>\n]+>|[^)\s]+)/g)) refs.set(m[1], null)
    for (const ref of [...refs.keys()]) {
      const ext = path.extname(ref.replace(/^<|>$/g, '').split(/[#?]/)[0]).toLowerCase()
      // Web links, anchors and links to other notes are not files to copy.
      if (!ext || ext === '.md' || /^[a-z][a-z0-9+.-]*:|^#/i.test(ref)) refs.delete(ref)
      else refs.set(ref, await attach(ref, noteDir))
    }

    return text
      .replace(/!\[\[([^\]\n]+)\]\]/g, (whole, inner) => {
        const [target, ...options] = inner.split('|')
        const file = target.split('#')[0].trim()
        const ext = path.extname(file).toLowerCase()
        if (!ext || ext === '.md') return `[[${noteName(file)}${target.includes('#') ? '#' + target.split('#').slice(1).join('#') : ''}]]`
        const rel = refs.get(file)
        if (!rel) {
          missing++
          return whole
        }
        const label = path.basename(file, ext).replace(/[\[\]|]/g, ' ')
        const width = options.map((o) => /^(\d+)(x\d+)?$/.exec(o.trim())).find(Boolean)
        return EMBEDDABLE.has(ext) ? `![${label}${width ? '|' + width[1] : ''}](${rel})` : `[${path.basename(file)}](${rel})`
      })
      .replace(/(?<!!)\[\[([^\]\n|#]+)([#|][^\]\n]*)?\]\]/g, (whole, target, rest = '') =>
        target.includes('/') || /\.md$/i.test(target.trim()) ? `[[${noteName(target)}${rest}]]` : whole,
      )
      .replace(/(!?)\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)((?:\s+"[^"\n]*")?)\s*\)/g, (whole, bang, label, url, title) => {
        if (/^[a-z][a-z0-9+.-]*:|^#/i.test(url)) return whole
        const clean = url.replace(/^<|>$/g, '').split(/[#?]/)[0]
        if (/\.md$/i.test(clean)) {
          let name = clean
          try {
            name = decodeURIComponent(clean)
          } catch {
            /* keep as written */
          }
          return `[[${noteName(name)}${label && label !== noteName(name) ? '|' + label : ''}]]`
        }
        const rel = refs.get(url)
        if (rel === undefined) return whole
        if (rel === null) {
          missing++
          return whole
        }
        return `${bang}[${label}](${rel}${title})`
      })
  }

  async function canvasToMarkdown(raw, noteDir) {
    const data = JSON.parse(raw)
    const cards = []
    const ids = new Map()
    for (const node of Array.isArray(data.nodes) ? data.nodes : []) {
      let text = ''
      if (node.type === 'text') text = await convert(String(node.text || ''), noteDir)
      else if (node.type === 'link') text = `[${node.url}](${node.url})`
      else if (node.type === 'file') {
        const file = String(node.file || '')
        text = /\.md$/i.test(file) ? `[[${noteName(file)}]]` : await convertProse(`![[${file}]]`, noteDir)
      } else if (node.type === 'group' && node.label) text = `**${node.label}**`
      if (!text.trim() || node.type === 'group') continue
      const id = `c${cards.length + 1}`
      ids.set(node.id, id)
      const n = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d)
      const color = CANVAS_COLORS[node.color]
      cards.push(`<!-- card id=${id} x=${n(node.x, 0)} y=${n(node.y, 0)} w=${Math.max(140, n(node.width, 260))} h=${Math.max(60, n(node.height, 140))}${color ? ` color=${color}` : ''} -->\n${text.trim()}\n<!-- /card -->`)
    }
    const edges = (Array.isArray(data.edges) ? data.edges : [])
      .filter((e) => ids.has(e.fromNode) && ids.has(e.toNode))
      .map((e) => `<!-- edge from=${ids.get(e.fromNode)} to=${ids.get(e.toNode)} -->`)
    return `\n\n<!-- canvas -->\n${[...cards, ...edges].join('\n')}`
  }

  const folderFor = (rel) => [dest, path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel)].filter(Boolean).join('/')
  let imported = 0
  let boards = 0
  const failed = []

  for (const rel of notes) {
    try {
      const file = path.join(source, rel)
      const rec = toRecord(rel, await fs.readFile(file, 'utf8'), await fs.stat(file))
      const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel)
      rec.id = newId()
      rec.title = path.basename(rel, path.extname(rel))
      rec.content = await convert(rec.content, dir)
      if (rec.type === 'note' && /^\d{4}-\d{2}-\d{2}$/.test(rec.title) && !hasDaily(rec.title)) rec.type = 'daily'
      rec.path = await freePath(folderFor(rel), rec.title)
      await writeRecord(rec)
      imported++
    } catch (e) {
      failed.push(`${rel}: ${e.message}`)
    }
  }

  for (const rel of canvases) {
    try {
      const file = path.join(source, rel)
      const stat = await fs.stat(file)
      const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel)
      const title = path.basename(rel, path.extname(rel))
      const rec = toRecord(rel, '', stat)
      rec.id = newId()
      rec.title = title
      rec.view = 'canvas'
      rec.content = await canvasToMarkdown(await fs.readFile(file, 'utf8'), dir)
      rec.path = await freePath(folderFor(rel), title)
      await writeRecord(rec)
      boards++
    } catch (e) {
      failed.push(`${rel}: ${e.message}`)
    }
  }

  return { imported, canvases: boards, attachments: copied.size, missing, unused: files.size - copied.size, failed }
}
