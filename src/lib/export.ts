import type { Note } from '../types'
import { parseCanvas, splitContent } from './canvas'
import { renderMarkdown } from './markdown'
import { displayTitle, download } from './util'
import { desktop } from '../desktop'

const DOC_CSS = `
body{font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#1c1b1a;max-width:760px;margin:48px auto;padding:0 24px}
h1{font-size:2em;line-height:1.2;margin:0 0 .8em}h2{font-size:1.4em;margin:1.6em 0 .5em}h3{font-size:1.15em;margin:1.4em 0 .4em}
a{color:#4a4ac4}img{max-width:100%;border-radius:6px}
blockquote{margin:1em 0;padding:.1em 1em;border-left:3px solid #d9d6d0;color:#55524d}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:#f3f1ed;padding:.15em .35em;border-radius:4px}
pre{background:#f6f4f0;padding:14px 16px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid #dedbd5;padding:6px 12px;text-align:left}th{background:#f6f4f0}
hr{border:none;border-top:1px solid #dedbd5;margin:2em 0}
ul.contains-task-list{list-style:none;padding-left:1.2em}
.hashtag{color:#6b6862;text-decoration:none}
`

const safeName = (note: Note) => displayTitle(note).replace(/[\/\\:*?"<>|]/g, ' ').trim() || 'note'

/** The note as one linear markdown document: the page, then any canvas cards. */
export function fullMarkdown(note: Note): string {
  const { page, canvas } = splitContent(note.content)
  const cards = parseCanvas(canvas).cards.sort((a, b) => a.y - b.y || a.x - b.x)
  return [page.trim(), ...cards.map((c) => c.text.trim())].filter(Boolean).join('\n\n---\n\n')
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function buildBody(note: Note, opts: { math: boolean; inlineImages: boolean }): Promise<HTMLElement> {
  const root = document.createElement('div')
  root.innerHTML = `<h1></h1>` + renderMarkdown(fullMarkdown(note), {}, { math: opts.math })
  root.querySelector('h1')!.textContent = displayTitle(note)
  // Links between notes mean nothing outside the app: keep the text only.
  root.querySelectorAll('a.wikilink').forEach((a) => a.replaceWith(document.createTextNode(a.textContent || '')))
  root.querySelectorAll('a.hashtag').forEach((a) => a.removeAttribute('href'))
  root.querySelectorAll<HTMLElement>('.pdf-embed').forEach((el) => {
    const a = document.createElement('a')
    a.href = new URL(el.dataset.src || '', location.origin).href
    a.textContent = `${el.dataset.name || 'PDF'} (PDF)`
    const p = document.createElement('p')
    p.append(a)
    el.replaceWith(p)
  })
  root.querySelectorAll('input[type=checkbox]').forEach((el) => el.setAttribute('disabled', ''))
  if (opts.inlineImages) {
    await Promise.all(
      [...root.querySelectorAll('img')].map(async (img) => {
        const src = img.getAttribute('src') || ''
        if (!src.startsWith('/files/')) return
        img.removeAttribute('loading')
        try {
          img.src = await toDataUrl(src)
        } catch {
          img.src = new URL(src, location.origin).href
        }
      }),
    )
  }
  return root
}

function page(title: string, body: string, extraHead = ''): string {
  const t = title.replace(/</g, '&lt;')
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${t}</title>\n${extraHead}<style>${DOC_CSS}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

export function exportMarkdown(note: Note) {
  download(`${safeName(note)}.md`, `# ${displayTitle(note)}\n\n${fullMarkdown(note)}\n`, 'text/markdown')
}

export async function exportHtml(note: Note) {
  const body = await buildBody(note, { math: true, inlineImages: true })
  const katex = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">\n'
  download(`${safeName(note)}.html`, page(displayTitle(note), body.innerHTML, katex), 'text/html')
}

/** Word-compatible file. Google Docs opens it too (File → Open → Upload). */
export async function exportWord(note: Note) {
  const body = await buildBody(note, { math: false, inlineImages: true })
  const html = page(displayTitle(note), body.innerHTML).replace(
    '<html lang="en">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">',
  )
  download(`${safeName(note)}.doc`, '﻿' + html, 'application/msword')
}

/** Puts the formatted note on the clipboard, ready to paste into a Google Doc. */
export async function copyRichText(note: Note) {
  const body = await buildBody(note, { math: false, inlineImages: true })
  const html = `<div style="font-family:Arial,sans-serif;font-size:11pt">${body.innerHTML}</div>`
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([`${displayTitle(note)}\n\n${fullMarkdown(note)}`], { type: 'text/plain' }),
    }),
  ])
}

/** Opens the system print dialog with only the note on the page; choose "Save as PDF". */
export async function exportPdf(note: Note) {
  const target = document.getElementById('print-root')!
  const body = await buildBody(note, { math: true, inlineImages: false })
  target.replaceChildren(...body.childNodes)
  await Promise.all([...target.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
  // The desktop app writes the PDF straight to a file you choose.
  if (desktop) {
    try {
      return await desktop.savePdf(safeName(note))
    } finally {
      target.replaceChildren()
    }
  }
  const previous = document.title
  document.title = safeName(note)
  const done = () => {
    document.title = previous
    target.replaceChildren()
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
  return null
}
