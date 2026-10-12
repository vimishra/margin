// Turns the markdown guides in docs/ into standalone HTML pages: `npm run docs`.
// The pages follow the theme chosen in the app (see the script in the template below), not only the system's.
import MarkdownIt from 'markdown-it'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs')
const md = new MarkdownIt({ html: true, linkify: true })

// Headings get the same anchors GitHub gives them, so the links work in both places.
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
md.core.ruler.push('heading_ids', (state) => {
  state.tokens.forEach((token, i) => {
    if (token.type === 'heading_open') token.attrSet('id', slug(state.tokens[i + 1].content))
  })
})
// Links between the guides point at the HTML versions.
const linkOpen = md.renderer.rules.link_open || ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options))
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  const href = tokens[i].attrGet('href') || ''
  if (/^[\w-]+\.md(#.*)?$/.test(href)) tokens[i].attrSet('href', href.replace('.md', '.html'))
  return linkOpen(tokens, i, options, env, self)
}
md.renderer.rules.table_open = () => '<div class="table"><table>'
md.renderer.rules.table_close = () => '</table></div>'

const css = `
:root{--bg:#fff;--text:#15171a;--muted:#6a6e74;--line:#e4e6e9;--soft:#f5f6f8;--accent:#255fb3;--code:#c2410c;color-scheme:light}
:root[data-theme=dark]{--bg:#161617;--text:#f8f8f9;--muted:#a3a3a6;--line:#303033;--soft:#222224;--accent:#7fb2f5;--code:#f0987c;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:820px;margin:0 auto;padding:56px 28px 120px}
header.top{display:flex;align-items:center;gap:12px;margin-bottom:8px;color:var(--muted);font-size:14px}
header.top img{width:36px;height:36px}
header.top a{color:inherit;text-decoration:none}
header.top a:hover{color:var(--accent)}
h1{font-size:2.2em;line-height:1.15;letter-spacing:-.02em;margin:.2em 0 .6em}
h2{font-size:1.5em;letter-spacing:-.01em;margin:2.2em 0 .6em;padding-top:.6em;border-top:1px solid var(--line)}
h3{font-size:1.15em;margin:1.8em 0 .5em}
h2,h3{scroll-margin-top:16px}
p,ul,ol{margin:0 0 1em}
ul,ol{padding-left:1.4em}
li{margin:.25em 0}
a{color:var(--accent);text-underline-offset:3px}
img{max-width:100%;border-radius:10px;border:1px solid var(--line)}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:.1em .35em}
pre{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;line-height:1.5}
pre code{background:none;border:none;padding:0;font-size:13.5px}
.table{overflow-x:auto;margin:0 0 1.2em;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:.95em}
th,td{text-align:left;vertical-align:top;padding:8px 14px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:none}
th{background:var(--soft);font-weight:620;color:var(--muted);font-size:.92em}
blockquote{margin:0 0 1em;padding:.1em 0 .1em 1em;border-left:3px solid var(--line);color:var(--muted)}
@media print{main{padding:0}h2{break-after:avoid}pre,.table,img{break-inside:avoid}}
.find{position:fixed;top:12px;right:16px;z-index:10;display:flex;align-items:center;gap:4px;padding:5px 5px 5px 12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.14);font-size:14px}
.find[hidden]{display:none}
.find input{width:220px;border:none;outline:none;background:none;color:inherit;font:inherit}
.find-count{min-width:5.5em;text-align:right;color:var(--muted);font-size:13px;white-space:nowrap}
.find-count.none{color:#d23d5f}
.find button{border:none;background:none;color:var(--muted);font:inherit;width:28px;height:26px;border-radius:6px;cursor:default}
.find button:hover{background:var(--soft);color:var(--text)}
mark.find-hit{background:#ffe680;color:inherit;border-radius:2px}
mark.find-hit.current{background:#ffab2e}
:root[data-theme=dark] mark.find-hit{background:#6b5a1a}
:root[data-theme=dark] mark.find-hit.current{background:#b5761a}
@media print{.find{display:none}mark.find-hit{background:none}}
`

// ⌘F (Ctrl+F) opens a small find bar: matches are highlighted as you type, Enter and Shift+Enter (or ⌘G and
// ⌘⇧G) move between them, Esc closes. The guides open in a plain app window that has no find of its own.
const findBar = `<div class="find" id="find" hidden role="search">
<input type="text" placeholder="Find in this guide" aria-label="Find in this guide" spellcheck="false">
<span class="find-count" aria-live="polite"></span>
<button type="button" data-step="-1" title="Previous  ⇧↵">↑</button>
<button type="button" data-step="1" title="Next  ↵">↓</button>
<button type="button" data-close title="Close  Esc">✕</button>
</div>
<script>
(function () {
  var bar = document.getElementById('find'), input = bar.querySelector('input'), count = bar.querySelector('.find-count')
  var main = document.querySelector('main'), hits = [], at = -1, timer = 0
  function clear() {
    var parents = []
    hits.forEach(function (m) {
      var p = m.parentNode
      if (!p) return
      p.replaceChild(document.createTextNode(m.textContent), m)
      if (parents.indexOf(p) < 0) parents.push(p)
    })
    parents.forEach(function (p) { p.normalize() })
    hits = []
    at = -1
  }
  function find(query) {
    clear()
    var q = query.trim().toLowerCase()
    if (!q) return show()
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.parentNode.closest('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT },
    })
    var nodes = []
    while (walker.nextNode()) nodes.push(walker.currentNode)
    nodes.forEach(function (node) {
      var text = node.nodeValue, lower = text.toLowerCase(), from = 0, i = lower.indexOf(q)
      if (i < 0 || hits.length > 2000) return
      var frag = document.createDocumentFragment()
      while (i >= 0) {
        frag.appendChild(document.createTextNode(text.slice(from, i)))
        var mark = document.createElement('mark')
        mark.className = 'find-hit'
        mark.textContent = text.slice(i, i + q.length)
        frag.appendChild(mark)
        hits.push(mark)
        from = i + q.length
        i = lower.indexOf(q, from)
      }
      frag.appendChild(document.createTextNode(text.slice(from)))
      node.parentNode.replaceChild(frag, node)
    })
    // Start from the first match below the top of the window, so finding does not jump back to the start.
    var below = hits.findIndex(function (m) { return m.getBoundingClientRect().top >= 0 })
    move(below < 0 ? 0 : below, true)
  }
  function move(to, absolute) {
    if (!hits.length) return show()
    if (at >= 0) hits[at].classList.remove('current')
    at = absolute ? to : (at + to + hits.length) % hits.length
    hits[at].classList.add('current')
    hits[at].scrollIntoView({ block: 'center' })
    show()
  }
  function show() {
    var typed = input.value.trim()
    count.textContent = !typed ? '' : hits.length ? (at + 1) + ' of ' + hits.length : 'No matches'
    count.classList.toggle('none', !!typed && !hits.length)
  }
  function open() {
    bar.hidden = false
    input.focus()
    input.select()
    if (input.value.trim() && !hits.length) find(input.value)
  }
  function close() {
    bar.hidden = true
    clear()
    show()
  }
  window.marginFind = open
  addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey
    if (mod && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); open() }
    else if (mod && e.key.toLowerCase() === 'g' && hits.length) { e.preventDefault(); move(e.shiftKey ? -1 : 1) }
    else if (e.key === 'Escape' && !bar.hidden) { e.preventDefault(); close() }
  })
  input.addEventListener('input', function () {
    clearTimeout(timer)
    timer = setTimeout(function () { find(input.value) }, 120)
  })
  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    clearTimeout(timer)
    if (!hits.length) find(input.value)
    else move(e.shiftKey ? -1 : 1)
  })
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button')
    if (!b) return
    if (b.hasAttribute('data-close')) close()
    else { move(Number(b.dataset.step)); input.focus() }
  })
})()
</script>`

const pages = fs.readdirSync(docs).filter((f) => f.endsWith('.md'))
for (const file of pages) {
  const source = fs.readFileSync(path.join(docs, file), 'utf8')
  const title = /^#\s+(.+)$/m.exec(source)?.[1] || 'Margin'
  const others = pages
    .filter((p) => p !== file)
    .map((p) => `<a href="${p.replace('.md', '.html')}">${/^#\s+(.+)$/m.exec(fs.readFileSync(path.join(docs, p), 'utf8'))?.[1] || p}</a>`)
    .join(' · ')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="images/icon.png">
<script>
// Follow the theme chosen in Margin (light, dark or match the system). Opened as a plain file, follow the system.
(function () {
  var dark = matchMedia('(prefers-color-scheme: dark)')
  function apply() {
    var t = 'system'
    try { t = JSON.parse(localStorage.getItem('margin.theme') || '"system"') } catch (e) {}
    document.documentElement.dataset.theme = t === 'dark' || (t !== 'light' && dark.matches) ? 'dark' : 'light'
  }
  apply()
  // Keep up if the theme is changed in the app, or the system switches, while the guide is open.
  addEventListener('storage', apply)
  dark.addEventListener('change', apply)
})()
</script>
<style>${css}</style>
</head>
<body>
<main>
<header class="top"><img src="images/icon.png" alt=""><span>Margin${others ? ' · ' + others : ''}</span></header>
${md.render(source)}
</main>
${findBar}
</body>
</html>
`
  // Embed the images so each page is one file that can be shared on its own.
  const standalone = html.replace(/(src|href)="(images\/[^"]+)"/g, (whole, attr, rel) => {
    const image = path.join(docs, rel)
    if (!fs.existsSync(image)) return whole
    return `${attr}="data:image/${path.extname(rel).slice(1)};base64,${fs.readFileSync(image).toString('base64')}"`
  })
  fs.writeFileSync(path.join(docs, file.replace('.md', '.html')), standalone)
  console.log(`docs/${file.replace('.md', '.html')}`)
}
