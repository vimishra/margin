// Checks the triage note parser (src/lib/triage.ts) against the example in tests/triage/example.md, the layout the
// owner's triage program writes. Run with `npm run test:triage`.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
const { parseTriage, serializeTriage, runTasks, triageCounts, applyTriageAction, changeTaskLine, locateTask, blockLines, removeBlock, hasOpenTaskLinking, insertUnderHeading, resolveDestination, prepareBlock, findNote } = await vite.ssrLoadModule('/src/lib/triage.ts')
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

const diffLines = (a, b) => {
  const x = a.split('\n')
  const y = b.split('\n')
  assert.equal(x.length, y.length, 'same number of lines')
  return x.map((l, i) => (l === y[i] ? null : i)).filter((i) => i !== null)
}
const taskNamed = (text, title) => runTasks(parseTriage(text).runs[0]).find((t) => t.title === title)

check('complete, drop and reopen change only the box and Margin\'s date, on one line (criterion 2)', () => {
  const t = taskNamed(example, 'Do the thing about X')
  const done = applyTriageAction(example, t, { kind: 'complete' }, true, '2026-01-05').text
  assert.deepEqual(diffLines(example, done), [t.line])
  assert.equal(done.split('\n')[t.line], '- [x] Do the thing about X - [mail](https://example.com/mail/1) #category-one P1 @done(2026-01-05)')
  const dropped = applyTriageAction(example, t, { kind: 'drop' }, true, '2026-01-05').text
  assert.equal(dropped.split('\n')[t.line], '- [-] Do the thing about X - [mail](https://example.com/mail/1) #category-one P1 @cancelled(2026-01-05)')
  // Reopening puts the line back exactly as it was.
  assert.equal(applyTriageAction(done, taskNamed(done, 'Do the thing about X'), { kind: 'reopen' }).text, example)
  assert.equal(applyTriageAction(dropped, taskNamed(dropped, 'Do the thing about X'), { kind: 'reopen' }).text, example)
  // Without recording the day, only the box changes.
  assert.equal(applyTriageAction(example, t, { kind: 'complete' }, false).text.split('\n')[t.line], '- [x] Do the thing about X - [mail](https://example.com/mail/1) #category-one P1')
})

check('dates replace their own token in place, or go at the end; nothing else moves', () => {
  const y = taskNamed(example, 'Follow up on Y')
  const planned = applyTriageAction(example, y, { kind: 'planned', date: '2026-01-09' }).text
  assert.deepEqual(diffLines(example, planned), [y.line])
  assert.equal(planned.split('\n')[y.line], '- [ ] Follow up on Y - [chat](https://example.com/chat/2) [bug](https://example.com/bug/9) #category-one P2 >2026-01-09')
  const due = applyTriageAction(example, y, { kind: 'due', date: '2026-01-12' }).text
  assert.equal(due.split('\n')[y.line], '- [ ] Follow up on Y - [chat](https://example.com/chat/2) [bug](https://example.com/bug/9) #category-one P2 >2026-01-07 @due(2026-01-12)')
  assert.equal(changeTaskLine('- [ ] A P1 >2026-01-07 more', { kind: 'planned', date: null }), '- [ ] A P1 more')
  assert.equal(changeTaskLine('- [ ] A @due(2026-01-01) #t', { kind: 'due', date: '2026-02-02' }), '- [ ] A @due(2026-02-02) #t')
  assert.equal(changeTaskLine('- [ ] A >2026-01-07', { kind: 'planned', date: null, someday: true }), '- [ ] A >someday')
})

check('a task is found again after the note is rewritten; one that is gone is not (criterion 8)', () => {
  const t = taskNamed(example, 'Another task')
  const rewritten = example.replace('## Triage Mon 5 Jan, 11:00', '## Triage Mon 5 Jan, 16:00\n\n### New\n- [ ] Brand new - [mail](https://x/9)\n\n## Triage Mon 5 Jan, 11:00')
  const r = applyTriageAction(rewritten, t, { kind: 'complete' }, true, '2026-01-05')
  assert.ok(r)
  assert.deepEqual(diffLines(rewritten, r.text).length, 1)
  assert.match(r.text.split('\n')[r.task.line], /^- \[x\] Another task/)
  const gone = example.replace(/^- \[ \] Another task.*$/m, '')
  assert.equal(applyTriageAction(gone, t, { kind: 'complete' }), null)
})

check('identical tasks: the one in the same category is chosen', () => {
  const text = '## Triage X\n### A\n- [ ] Same - [mail](https://m/1)\n### B\n- [ ] Same - [mail](https://m/1)\n'
  const [, inB] = runTasks(parseTriage(text).runs[0])
  const r = applyTriageAction(text, inB, { kind: 'complete' }, false)
  assert.deepEqual(r.text.split('\n').filter((l) => l.startsWith('- [x]')).length, 1)
  assert.equal(r.text.split('\n')[4], '- [x] Same - [mail](https://m/1)')
  assert.equal(locateTask(parseTriage(text), inB).category, 'B')
})

check('CRLF lines keep their line end', () => {
  const crlf = example.replace(/\n/g, '\r\n')
  const t = taskNamed(crlf, 'Another task')
  const r = applyTriageAction(crlf, t, { kind: 'complete' }, false).text
  assert.equal(r.split('\n')[t.line], '- [x] Another task - [mail](https://example.com/mail/3) #category-two P2\r')
  assert.equal(r.replace('- [x] Another', '- [ ] Another'), crlf)
})

check('moving: the block, unchanged, goes under the heading; it leaves the triage note and nothing else changes (criterion 3)', () => {
  const doc = parseTriage(example)
  const y = locateTask(doc, taskNamed(example, 'Follow up on Y'))
  const block = blockLines(doc, y)
  assert.deepEqual(block, ['- [ ] Follow up on Y - [chat](https://example.com/chat/2) [bug](https://example.com/bug/9) #category-one P2 >2026-01-07', '  - Context.', '  - _carried from Mon 5 Jan, 06:00_'])
  const dest = '# Payments\n\n## Open Threads\n\n- [ ] Existing task\n\n## Notes\n\nSome text\n'
  const after = insertUnderHeading(dest, block, 'Open Threads')
  assert.equal(after, '# Payments\n\n## Open Threads\n\n- [ ] Existing task\n' + block.join('\n') + '\n\n## Notes\n\nSome text\n')
  // Taken out of the triage note: only those lines, everything else byte for byte.
  const left = removeBlock(example, y)
  assert.equal(left.split('\n').length, example.split('\n').length - 3)
  assert.equal(left, example.split('\n').filter((_l, i) => i < y.line || i >= y.end).join('\n'))
  assert.equal(runTasks(parseTriage(left).runs[0]).find((t) => t.title === 'Follow up on Y'), undefined)
})

check('the heading: made at the end when missing; an empty section; top of the section; the page ending kept', () => {
  assert.equal(insertUnderHeading('# Note\n\nText', ['- [ ] T'], 'Open Threads'), '# Note\n\nText\n\n## Open Threads\n\n- [ ] T')
  assert.equal(insertUnderHeading('', ['- [ ] T'], 'Open Threads'), '## Open Threads\n\n- [ ] T')
  assert.equal(insertUnderHeading('## Open Threads\n\n## Next\n', ['- [ ] T'], 'open threads'), '## Open Threads\n\n- [ ] T\n\n## Next\n')
  assert.equal(insertUnderHeading('## Open Threads\n\n- [ ] A\n- [ ] B\n', ['- [ ] T'], 'Open Threads', 'top'), '## Open Threads\n\n- [ ] T\n- [ ] A\n- [ ] B\n')
  assert.equal(insertUnderHeading('### Open Threads\n- [ ] A\n## Higher\n', ['- [ ] T'], 'Open Threads'), '### Open Threads\n- [ ] A\n- [ ] T\n## Higher\n')
})

check('duplicates: an open task linking the same address counts; a done one does not (criterion 9)', () => {
  const page = '## Open Threads\n- [ ] Do the thing about X - [mail](https://example.com/mail/1)\n- [x] Old - [chat](https://example.com/chat/1)\n'
  assert.equal(hasOpenTaskLinking(page, 'https://example.com/mail/1'), true)
  assert.equal(hasOpenTaskLinking(page, 'https://example.com/chat/1'), false)
  assert.equal(hasOpenTaskLinking(page, 'https://example.com/mail'), false)
  assert.equal(hasOpenTaskLinking(page, ''), false)
})

const notes = [
  { id: 'pay', path: 'Workstreams/Payments Platform.md', title: 'Payments Platform', folder: 'Workstreams' },
  { id: 'one', path: 'Workstreams/Category One.md', title: 'Category One', folder: 'Workstreams' },
  { id: 'oncall', path: 'Work/On-call.md', title: 'On-call', folder: 'Work' },
  { id: 'unsorted', path: 'Work/Unsorted.md', title: 'Unsorted', folder: 'Work' },
  { id: 'tri', path: 'Inbox/Triage.md', title: 'Triage', folder: 'Inbox' },
]
const task = (o) => ({ category: 'Category One', tags: ['category-one'], title: 'Do the thing about X', ...o })

check('rules: the first that matches and names a note wins; then the notebook; then the default (criterion 4)', () => {
  const cfg = {
    rules: [
      { tag: '#oncall', note: 'Work/On-call' },
      { category: 'category one', note: 'Workstreams/Payments Platform.md' },
      { title: 'invoice', note: 'Gone/Missing.md' },
    ],
    workstreamNotebook: 'Workstreams',
    default: 'Work/Unsorted',
  }
  assert.equal(resolveDestination(task({ tags: ['oncall'] }), cfg, notes).note.id, 'oncall')
  assert.equal(resolveDestination(task({ tags: ['oncall/pager'] }), cfg, notes).note.id, 'oncall')
  assert.deepEqual(resolveDestination(task({}), cfg, notes), { note: notes[0], reason: 'category category one' })
  // A rule naming a missing note is passed over.
  assert.equal(resolveDestination(task({ category: 'Other', title: 'Pay the invoice' }), cfg, notes).note.id, 'unsorted')
  // The notebook: a note named like the category.
  assert.equal(resolveDestination(task({ category: 'Category One' }), { workstreamNotebook: 'workstreams' }, notes).note.id, 'one')
  assert.equal(resolveDestination(task({ category: '' }), { workstreamNotebook: 'Workstreams' }, notes), null)
  // Nothing set: ask.
  assert.equal(resolveDestination(task({}), {}, notes), null)
  // Never the triage note.
  assert.equal(resolveDestination(task({}), { default: 'Inbox/Triage' }, notes, 'tri'), null)
})

check('a rule found by its note id survives a rename; by path otherwise', () => {
  const renamed = notes.map((n) => (n.id === 'pay' ? { ...n, path: 'Workstreams/Payments.md', title: 'Payments' } : n))
  assert.equal(findNote(renamed, { note: 'Workstreams/Payments Platform.md', id: 'pay' }).id, 'pay')
  assert.equal(findNote(renamed, { note: 'Workstreams/Payments Platform.md' }), undefined)
  assert.equal(findNote(notes, { note: 'workstreams/payments platform' }).id, 'pay')
})

check('move options: words taken off the task line, the "from triage" line added', () => {
  const block = ['- [ ] Person A: short reply needed - [chat](https://example.com/chat/1) #category-one #quick P3', '  - Context.']
  assert.deepEqual(prepareBlock(block, {}), block)
  assert.deepEqual(prepareBlock(block, { strip: ['#quick'] }), ['- [ ] Person A: short reply needed - [chat](https://example.com/chat/1) #category-one P3', '  - Context.'])
  // Whole words only: #quick does not take a bite out of #quickly.
  assert.deepEqual(prepareBlock(['- [ ] A #quickly #quick'], { strip: ['#quick'] }), ['- [ ] A #quickly'])
  assert.deepEqual(prepareBlock(block, { addLine: true }, '2026-11-12'), [...block, '  - _from triage, 2026-11-12_'])
})

check('no note, folder, heading or tag name is written into the code (criterion 12)', () => {
  const sources = ['src/lib/triage.ts', 'src/triage.ts', 'src/components/TriageView.tsx'].map((f) => fs.readFileSync(path.join(root, f), 'utf8'))
  for (const name of ['Payments', 'Workstreams', 'Category One', 'Inbox/Triage', '#quick', 'category-one']) for (const src of sources) assert.ok(!src.includes(name), `${name} appears in the code`)
})

await vite.close()
console.log(`triage parser: ${checks} checks passed`)
