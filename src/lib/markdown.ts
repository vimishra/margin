import { tagHue } from './util'
import { callout } from './callouts'
import { setLineDone } from './tasks'
import { shortLinkHref, shortLinkPattern, shortLinks } from './shortlinks'
import MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
// @ts-expect-error no types published
import taskLists from 'markdown-it-task-lists'
import footnotes from 'markdown-it-footnote'
import katexPlugin from '@vscode/markdown-it-katex'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'

export interface RenderEnv {
  /** Resolve a wikilink target to a note id. */
  resolve?: (title: string) => string | undefined
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Attachment paths in notes are relative to the vault; the server exposes the vault at /files. */
export function fileUrl(src: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\/files\/)/i.test(src)) return src
  return '/files/' + src.replace(/^(\.{0,2}\/)+/, '')
}

const WEB_ADDRESS = /^(www\.[^\s/]+|[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|edu|gov|io|dev|ai|app|co|me|info|tech|uk|us|de|fr|in|ca|au|jp|ch|nl|se|no|es|it|eu))(?=[/:?#]|$)/i

/**
 * Where a link written in a note should go. "www.google.com" has no "https://" in front, but it is
 * plainly a web address and not a file in the vault.
 */
export function linkHref(href: string): string {
  const h = href.trim().replace(/^<|>$/g, '')
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(h)) return h
  if (WEB_ADDRESS.test(h)) return 'https://' + h
  return fileUrl(h)
}

function wikilink(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false
  const end = src.indexOf(']]', pos + 2)
  if (end < 0) return false
  const inner = src.slice(pos + 2, end)
  if (!inner.trim() || /[\n\[]/.test(inner)) return false
  if (!silent) {
    const [target, alias] = inner.split('|')
    const token = state.push('wikilink', '', 0)
    const hash = target.indexOf('#')
    // The label of a block link reads as the note's name, not its id.
    const shown = alias ?? (target.slice(hash + 1).startsWith('^') ? target.slice(0, hash) : target)
    token.meta = { target: target.split('#')[0].trim(), anchor: hash >= 0 ? target.slice(hash + 1).trim() : '', label: shown.trim() }
  }
  state.pos = end + 2
  return true
}

function hashtag(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x23) return false
  if (pos > 0 && !/[\s(]/.test(src[pos - 1])) return false
  const m = /^#([A-Za-z][\w/-]*)/.exec(src.slice(pos, pos + 60))
  if (!m) return false
  if (!silent) {
    const token = state.push('hashtag', '', 0)
    token.meta = { tag: m[1] }
  }
  state.pos = pos + m[0].length
  return true
}

function build(math: boolean): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    // A line break in a note stays a line break when it is read or exported, as in the editor, so a note
    // under a task or an image under a list item shows on its own line.
    breaks: true,
    linkify: true,
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value
        } catch {
          /* fall through */
        }
      }
      return ''
    },
  })
  md.use(taskLists, { enabled: true })
  // A cancelled task, "[-]", which the task-list plugin does not know: a box with a cross, the item greyed.
  md.core.ruler.push('cancelled_tasks', (state) => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      const t = tokens[i]
      if (t.type !== 'inline' || !t.content.startsWith('[-] ') || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue
      const first = t.children?.[0]
      if (!first || first.type !== 'text' || !first.content.startsWith('[-] ')) continue
      first.content = first.content.slice(4)
      const box = new state.Token('html_inline', '', 0)
      box.content = '<input class="task-list-item-checkbox box-cancelled" type="checkbox" checked title="Cancelled. Click to reopen.">'
      t.children!.unshift(box)
      tokens[i - 2].attrJoin('class', 'task-list-item cancelled')
      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].level === tokens[i - 2].level - 1 && /^(bullet|ordered)_list_open$/.test(tokens[j].type)) {
          if (!/contains-task-list/.test(tokens[j].attrGet('class') || '')) tokens[j].attrJoin('class', 'contains-task-list')
          break
        }
      }
    }
  })
  if (math) md.use(((katexPlugin as any).default ?? katexPlugin) as any, { throwOnError: false })
  // Footnotes: [^1] in the text, "[^1]: …" anywhere; listed at the end, numbered without brackets.
  md.use(footnotes as unknown as Parameters<typeof md.use>[0])
  md.renderer.rules.footnote_caption = (tokens, idx) => {
    // The same number every time a footnote is mentioned again (not "1:1").
    const meta = tokens[idx].meta
    return String(Number(meta.id) + 1)
  }
  md.inline.ruler.before('link', 'wikilink', wikilink)
  md.inline.ruler.push('hashtag', hashtag)
  // Company short links (go/name, b/123) in ordinary text become links. This runs over finished text,
  // because they start with a letter and so cannot be caught while the line is being read.
  md.core.ruler.push('shortlinks', (state) => {
    if (!shortLinks.on) return
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue
      const out: typeof block.children = []
      let inLink = 0
      for (const token of block.children) {
        if (token.type === 'link_open') inLink++
        else if (token.type === 'link_close') inLink--
        if (token.type !== 'text' || inLink > 0 || !/(?:^|[^\w/])(?:b|go)\//.test(token.content)) {
          out.push(token)
          continue
        }
        let last = 0
        for (const m of token.content.matchAll(shortLinkPattern())) {
          if (m.index! > last) {
            const before = new state.Token('text', '', 0)
            before.content = token.content.slice(last, m.index)
            out.push(before)
          }
          const link = new state.Token('html_inline', '', 0)
          link.content = `<a class="shortlink" href="${esc(shortLinkHref(m[0]))}" target="_blank" rel="noopener noreferrer">${esc(m[0])}</a>`
          out.push(link)
          last = m.index! + m[0].length
        }
        if (last === 0) out.push(token)
        else if (last < token.content.length) {
          const after = new state.Token('text', '', 0)
          after.content = token.content.slice(last)
          out.push(after)
        }
      }
      block.children = out
    }
  })

  // Callouts: a quote starting "[!type] Title" becomes a coloured box with that title (or the type's name).
  md.core.ruler.before('inline', 'callouts', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open' || tokens[i + 2].type !== 'inline') continue
      const inline = tokens[i + 2]
      const m = /^\[!([A-Za-z-]+)\][+-]?[ \t]*([^\n]*)\n?/.exec(inline.content)
      if (!m) continue
      const c = callout(m[1], m[2])
      tokens[i].attrJoin('class', `callout callout-${c.color}`)
      tokens[i].attrSet('data-callout', c.type)
      const open = new state.Token('paragraph_open', 'p', 1)
      open.attrSet('class', 'callout-title')
      const title = new state.Token('inline', '', 0)
      title.content = c.title
      title.children = []
      const close = new state.Token('paragraph_close', 'p', -1)
      inline.content = inline.content.slice(m[0].length)
      // Only a title: the empty paragraph that held it goes.
      if (!inline.content.trim()) tokens.splice(i + 1, 3, open, title, close)
      else tokens.splice(i + 1, 0, open, title, close)
    }
  })

  // Block ids (" ^abc123" at the end of a line, for [[Note#^abc123]] links) are not shown when reading.
  md.core.ruler.push('block_ids', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue
      const kids = block.children
      kids.forEach((token, i) => {
        const next = kids[i + 1]
        if (token.type === 'text' && (!next || next.type === 'softbreak' || next.type === 'hardbreak')) token.content = token.content.replace(/\s\^[A-Za-z0-9-]+\s*$/, '')
      })
    }
  })

  md.renderer.rules.wikilink = (tokens, idx, _o, env: RenderEnv) => {
    const { target, label, anchor } = tokens[idx].meta
    const id = env.resolve?.(target)
    return `<a class="wikilink${id ? '' : ' missing'}" data-target="${esc(target)}"${anchor ? ` data-anchor="${esc(anchor)}"` : ''}${id ? ` href="#/note/${id}"` : ''}>${esc(label)}</a>`
  }
  md.renderer.rules.hashtag = (tokens, idx) => {
    const tag = tokens[idx].meta.tag
    return `<a class="hashtag" style="--tag-hue: ${tagHue(tag)}" data-tag="${esc(tag)}" href="#/tag/${encodeURIComponent(tag)}">#${esc(tag)}</a>`
  }

  const image = md.renderer.rules.image!
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const src = token.attrGet('src') || ''
    if (/\.pdf($|[?#])/i.test(src)) {
      return `<div class="pdf-embed" data-src="${esc(fileUrl(src))}" data-name="${esc(token.content || 'PDF')}"></div>`
    }
    token.attrSet('src', fileUrl(src))
    token.attrSet('loading', 'lazy')
    const width = /\|(\d+)$/.exec(token.content)
    if (width) token.attrSet('width', width[1])
    return image(tokens, idx, options, env, self)
  }

  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]
    const href = token.attrGet('href') || ''
    if (!href.startsWith('#')) {
      token.attrSet('href', linkHref(href))
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
    }
    return self.renderToken(tokens, idx, options)
  }

  // Source line numbers let the outline and the editor find rendered headings, and a jump find a list item.
  md.core.ruler.push('source_lines', (state) => {
    for (const token of state.tokens) {
      if ((token.type === 'heading_open' || token.type === 'list_item_open') && token.map) token.attrSet('data-line', String(token.map[0]))
    }
  })
  // A ```tasks block is a live list of tasks: a mount point here, filled in by read mode (TaskBlock.tsx).
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (token.info.trim().toLowerCase() === 'tasks') return `<div class="task-block-mount" data-query="${esc(token.content)}"></div>`
    return fence(tokens, idx, options, env, self)
  }
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>'
  md.renderer.rules.table_close = () => '</table></div>'
  return md
}

const withMath = build(true)
const plain = build(false)

export function renderMarkdown(src: string, env: RenderEnv = {}, opts: { math?: boolean } = {}): string {
  const html = (opts.math === false ? plain : withMath).render(src, env)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

/** Inline markdown only (no paragraphs), for table cells. */
export function renderInline(src: string, env: RenderEnv = {}): string {
  return DOMPurify.sanitize(withMath.renderInline(src, env), { ADD_ATTR: ['target'] })
}

export interface Heading {
  level: number
  text: string
  line: number
}

export function headings(src: string): Heading[] {
  const out: Heading[] = []
  let fenced = false
  src.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) return
    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line)
    if (m) out.push({ level: m[1].length, text: m[2].replace(/[*_`]|\[\[|\]\]/g, ''), line: i })
  })
  return out
}

/** Toggle the nth task checkbox in the markdown source. With `stamp`, ticking records the day as "@done(date)". */
export function toggleTask(src: string, index: number, stamp = false): string {
  let i = -1
  return src
    .split('\n')
    .map((line) => {
      const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX-])\]/.exec(line)
      if (!m || ++i !== index) return line
      return setLineDone(line, m[2] === ' ', stamp) ?? `${m[1]}[${m[2] === ' ' ? 'x' : ' '}]${line.slice(m[0].length)}`
    })
    .join('\n')
}
