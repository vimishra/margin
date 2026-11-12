// Checks the triage note parser (src/lib/triage.ts) against the example in tests/triage/example.md, the layout the
// owner's triage program writes. Run with `npm run test:triage`.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
const { parseTriage, serializeTriage, runTasks, triageCounts } = await vite.ssrLoadModule('/src/lib/triage.ts')
const example = fs.readFileSync(path.join(root, 'tests/triage/example.md'), 'utf8')
let checks = 0
const check = (name, fn) => {
  fn()
  checks++
  if (process.argv.includes('-v')) console.log('ok', name)
}

check('reads the runs, newest first', () => {
  const doc = parseTriage(example)
  assert.deepEqual(doc.runs.map((r) => r.label), ['Mon 5 Jan, 11:00', 'Mon 5 Jan, 06:00'])
})

check('the newest run: summary, categories, open tasks', () => {
  const run = parseTriage(example).runs[0]
  assert.deepEqual(run.summary, ['Free-text bullet.', 'Carried over 2 open item(s) from earlier runs.'])
  assert.deepEqual(run.categories.map((c) => c.name), ['Category One', 'Category Two'])
  const open = runTasks(run).filter((t) => t.state === 'open')
  // The spec's criterion 1 says three; the example has four open tasks in the newest run.
  assert.equal(open.length, 4)
  assert.deepEqual(open.map((t) => t.title), ['Person A: short reply needed', 'Do the thing about X', 'Follow up on Y', 'Another task'])
  assert.deepEqual(triageCounts(runTasks(run)), { open: 4, done: 0, dropped: 0 })
})

check('groups and their kinds', () => {
  const [one, two] = parseTriage(example).runs[0].categories
  assert.deepEqual(one.groups.map((g) => [g.kind, g.label]), [['quick', 'Quick replies'], ['action', 'Actions'], ['fyi', 'FYI']])
  assert.deepEqual(one.groups[2].info, ['Informational line - [mail](https://example.com/mail/2)'])
  assert.deepEqual(two.groups.map((g) => g.kind), ['action'])
})

check('a task line: title, links, tags, priority, dates, details, carried', () => {
  const tasks = runTasks(parseTriage(example).runs[0])
  const y = tasks.find((t) => t.title === 'Follow up on Y')
  assert.deepEqual(y.links, [{ label: 'chat', url: 'https://example.com/chat/2' }, { label: 'bug', url: 'https://example.com/bug/9' }])
  assert.deepEqual(y.tags, ['category-one'])
  assert.equal(y.priority, 2)
  assert.equal(y.planned, '2026-01-07')
  assert.deepEqual(y.details, ['Context.'])
  assert.equal(y.carriedFrom, 'Mon 5 Jan, 06:00')
  assert.equal(y.rawLines.length, 3)
  const a = tasks.find((t) => t.title.startsWith('Person A'))
  assert.deepEqual(a.tags, ['category-one', 'quick'])
  assert.equal(a.priority, 3)
  assert.equal(a.group, 'quick')
})

check('the older run: a done task', () => {
  const old = runTasks(parseTriage(example).runs[1])
  assert.equal(old.length, 1)
  assert.equal(old[0].state, 'done')
  assert.equal(old[0].closedOn, '2026-01-05')
})

check('titles with " - " in them, P4, dropped tasks, no links', () => {
  const doc = parseTriage('## Triage Now\n### C\n**Actions**\n- [-] Fix A - B mismatch - [bug](https://x/1) P4\n- [ ] No link at all #tag\n')
  const [a, b] = runTasks(doc.runs[0])
  assert.equal(a.title, 'Fix A - B mismatch')
  assert.equal(a.priority, 4)
  assert.equal(a.state, 'dropped')
  assert.equal(b.title, 'No link at all')
  assert.deepEqual(b.links, [])
})

check('tasks under no category or no group label', () => {
  const doc = parseTriage('## Triage X\n- [ ] Loose task\n### Cat\n- [ ] Directly under the category\n')
  const cats = doc.runs[0].categories
  assert.deepEqual(cats.map((c) => c.name), ['', 'Cat'])
  assert.equal(cats[1].groups[0].kind, 'other')
  assert.equal(cats[1].groups[0].label, '')
})

check('identical tasks get different ids; ids survive a rewrite that moves them', () => {
  const doc = parseTriage('## Triage X\n### C\n- [ ] Same - [mail](https://m/1)\n- [ ] Same - [mail](https://m/1)\n')
  const [a, b] = runTasks(doc.runs[0])
  assert.notEqual(a.id, b.id)
  const moved = parseTriage('## Triage Y\n### Other\n**FYI**\n- info\n### C\n- [ ] Same - [mail](https://m/1)\n')
  assert.equal(runTasks(moved.runs[0])[0].id, a.id)
})

check('text that is not a triage note gives no runs, without failing', () => {
  for (const text of ['', 'just some text', '# Title\n\n- [ ] a task\n', '---\nid: x\n---\n## Not triage\n- [ ] t\n']) assert.deepEqual(parseTriage(text).runs, [])
})

check('round trip: the text comes back byte for byte', () => {
  const variants = [
    example,
    example + 'A line the view does not know\n<!-- a comment -->\n',
    example.replace(/\n/g, '\r\n'),
    example.replace(/\n$/, ''),
    'Ünïcödé 🎉 — ## Triage\n## Triage ✨\n### Kat 🐱\n- [ ] Ça marche - [mail](https://x/é)\n',
  ]
  for (const text of variants) assert.equal(serializeTriage(parseTriage(text)), text)
})

check('CRLF text reads the same as LF', () => {
  const lf = runTasks(parseTriage(example).runs[0]).map((t) => [t.title, t.priority, t.details])
  const crlf = runTasks(parseTriage(example.replace(/\n/g, '\r\n')).runs[0]).map((t) => [t.title, t.priority, t.details])
  assert.deepEqual(crlf, lf)
})

await vite.close()
console.log(`triage parser: ${checks} checks passed`)
