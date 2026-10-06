import MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
// @ts-expect-error no types published
import taskLists from 'markdown-it-task-lists'
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
    token.meta = { target: target.split('#')[0].trim(), label: (alias ?? target).trim() }
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
  if (math) md.use(((katexPlugin as any).default ?? katexPlugin) as any, { throwOnError: false })
  md.inline.ruler.before('link', 'wikilink', wikilink)
  md.inline.ruler.push('hashtag', hashtag)

  md.renderer.rules.wikilink = (tokens, idx, _o, env: RenderEnv) => {
    const { target, label } = tokens[idx].meta
    const id = env.resolve?.(target)
    return `<a class="wikilink${id ? '' : ' missing'}" data-target="${esc(target)}"${id ? ` href="#/note/${id}"` : ''}>${esc(label)}</a>`
  }
  md.renderer.rules.hashtag = (tokens, idx) => {
    const tag = tokens[idx].meta.tag
    return `<a class="hashtag" data-tag="${esc(tag)}" href="#/tag/${encodeURIComponent(tag)}">#${esc(tag)}</a>`
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

  // Source line numbers let the outline and the editor find rendered headings.
  md.core.ruler.push('source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'heading_open' && token.map) token.attrSet('data-line', String(token.map[0]))
    }
  })
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

/** Toggle the nth task checkbox in the markdown source. */
export function toggleTask(src: string, index: number): string {
  let i = -1
  return src.replace(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm, (m, lead, mark) => {
    i++
    return i === index ? `${lead}[${mark === ' ' ? 'x' : ' '}]` : m
  })
}
