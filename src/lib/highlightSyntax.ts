// ==Highlighted text==, as Bear and many Markdown editors write it: an inline syntax for the editor's Markdown parser,
// made the same way as ~~strikethrough~~ (two = on each side; not three, not around spaces). Read mode and exports
// use markdown-it-mark, which follows the same rules.
import { Tag, tags } from '@lezer/highlight'
import type { MarkdownConfig } from '@lezer/markdown'

/** The style tag of highlighted text, for the editor's highlight style. */
export const highlightTag = Tag.define()

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' }
const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~¡‐-‧]/

export const HighlightSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: { 'Highlight/...': highlightTag } },
    { name: 'HighlightMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        // "==", not "===" (and not the second = of one).
        if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61 || cx.char(pos - 1) === 61) return -1
        const before = cx.slice(pos - 1, pos)
        const after = cx.slice(pos + 2, pos + 3)
        const sBefore = /\s|^$/.test(before)
        const sAfter = /\s|^$/.test(after)
        const pBefore = PUNCTUATION.test(before)
        const pAfter = PUNCTUATION.test(after)
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, !sAfter && (!pAfter || sBefore || pBefore), !sBefore && (!pBefore || sAfter || pAfter))
      },
      after: 'Emphasis',
    },
  ],
}
