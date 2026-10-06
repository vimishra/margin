import type { CanvasCard, CanvasData } from '../types'

// A note's canvas lives at the end of its markdown file, after this marker.
// Each card is ordinary markdown wrapped in HTML comments, so the file stays readable anywhere.
const MARK = '<!-- canvas -->'

export function splitContent(content: string): { page: string; canvas: string } {
  const idx = content.indexOf(MARK)
  if (idx < 0) return { page: content, canvas: '' }
  let page = content.slice(0, idx)
  if (page.endsWith('\n\n')) page = page.slice(0, -2)
  else if (page.endsWith('\n')) page = page.slice(0, -1)
  return { page, canvas: content.slice(idx + MARK.length).replace(/^\n/, '') }
}

export function joinContent(page: string, canvas: string): string {
  return canvas.trim() ? `${page}\n\n${MARK}\n${canvas}` : page
}

export function parseCanvas(raw: string): CanvasData {
  const cards: CanvasCard[] = []
  const cardRe = /<!-- card ([^>]*?) -->\n?([\s\S]*?)\n?<!-- \/card -->/g
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(raw))) {
    const attrs: Record<string, string> = {}
    for (const a of m[1].matchAll(/(\w+)=(\S+)/g)) attrs[a[1]] = a[2]
    const num = (k: string, d: number) => (Number.isFinite(Number(attrs[k])) ? Number(attrs[k]) : d)
    cards.push({
      id: attrs.id || Math.random().toString(36).slice(2, 8),
      x: num('x', 0),
      y: num('y', 0),
      w: num('w', 260),
      h: num('h', 140),
      color: attrs.color || undefined,
      text: m[2],
    })
  }
  const ids = new Set(cards.map((c) => c.id))
  const edges = [...raw.matchAll(/<!-- edge from=(\S+) to=(\S+) -->/g)]
    .map((e) => ({ from: e[1], to: e[2] }))
    .filter((e) => ids.has(e.from) && ids.has(e.to))
  return { cards, edges }
}

export function serializeCanvas(data: CanvasData): string {
  const r = Math.round
  const cards = data.cards.map(
    (c) =>
      `<!-- card id=${c.id} x=${r(c.x)} y=${r(c.y)} w=${r(c.w)} h=${r(c.h)}${c.color ? ` color=${c.color}` : ''} -->\n${c.text}\n<!-- /card -->`,
  )
  const edges = data.edges.map((e) => `<!-- edge from=${e.from} to=${e.to} -->`)
  return [...cards, ...edges].join('\n')
}

/** Add a card below the existing ones in the left-most column (used by quick capture). */
export function appendCard(content: string, text: string): string {
  const { page, canvas } = splitContent(content)
  const data = parseCanvas(canvas)
  const x = data.cards.length ? Math.min(...data.cards.map((c) => c.x)) : 0
  const column = data.cards.filter((c) => Math.abs(c.x - x) < 40)
  const y = column.length ? Math.max(...column.map((c) => c.y + c.h)) + 24 : 0
  const lines = Math.ceil(text.length / 34) + text.split('\n').length
  data.cards.push({ id: Math.random().toString(36).slice(2, 8), x, y, w: 280, h: Math.min(320, Math.max(90, 44 + lines * 22)), text })
  return joinContent(page, serializeCanvas(data))
}
