// Small changes between two versions of a note's text, so an editor can take a change made outside it (the file
// rewritten on disk, a task changed from a list) without moving the cursor or losing its folds.

/** The change within one stretch of text: the part between what the old and new have in common at each end. */
function stretchChange(a: string, b: string, offset: number) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  return { from: offset + start, to: offset + a.length - end, insert: b.slice(start, b.length - end) }
}

/**
 * The changes that turn one text into another, small enough that a cursor elsewhere keeps its place: the lines the
 * two have in common at each end are left alone; when the lines between are as many in both (lines edited in
 * place), each changed line is its own change; otherwise there is one change, between the characters the two
 * have in common at each end.
 */
export function textChanges(a: string, b: string): { from: number; to: number; insert: string }[] {
  const x = a.split('\n')
  const y = b.split('\n')
  let p = 0
  while (p < x.length && p < y.length && x[p] === y[p]) p++
  let q = 0
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++
  let offset = x.slice(0, p).reduce((n, l) => n + l.length + 1, 0)
  if (x.length - p - q === y.length - p - q) {
    const out = []
    for (let i = p; i < x.length - q; i++) {
      if (x[i] !== y[i]) out.push(stretchChange(x[i], y[i], offset))
      offset += x[i].length + 1
    }
    return out
  }
  // Lines added or taken out: one change, between what the two texts have in common at each end.
  return [stretchChange(a, b, 0)]
}
