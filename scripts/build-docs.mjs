// Turns the markdown guides in docs/ into standalone HTML pages: `npm run docs`.
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
:root{--bg:#fff;--text:#1f1e1b;--muted:#6b6862;--line:#e6e3dd;--soft:#f6f5f2;--accent:#4a4ac4;--code:#b0452a}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a19;--text:#ecebe7;--muted:#a09e97;--line:#2f2f2c;--soft:#232321;--accent:#a6a6ff;--code:#f0987c}}
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
`

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
<style>${css}</style>
</head>
<body>
<main>
<header class="top"><img src="images/icon.png" alt=""><span>Margin${others ? ' · ' + others : ''}</span></header>
${md.render(source)}
</main>
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
