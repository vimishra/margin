// Works out, with the app's own task rules, what every case in tests/task-cases.json should give.
//   node scripts/task-fixtures.mjs --write   record the results as the expected ones
//   node scripts/task-fixtures.mjs --check   fail if the app's rules no longer give the recorded results
// The command-line tool (tools/margin_tasks.py) is tested against the same file, so the two cannot drift apart unnoticed.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { createServer } from 'vite'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'tests', 'task-cases.json')
const cases = JSON.parse(fs.readFileSync(file, 'utf8'))

// The rules ask the clock what today is. Pin it to the day the cases were written for.
const RealDate = Date
const fixed = new RealDate(`${cases.today}T12:00:00`).getTime()
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [fixed]))
  }
  static now() {
    return fixed
  }
}

const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
const tasks = await vite.ssrLoadModule('/src/lib/tasks.ts')

// Read each note the way the server does (server/index.mjs: parseFile and toRecord).
const TYPES = ['note', 'daily', 'article', 'scratch']
const notes = {}
const offsets = {}
for (const { path: rel, raw } of cases.notes) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw)
  let data = {}
  let content = raw
  let offset = 0
  if (m) {
    try {
      const loaded = yaml.load(m[1], { schema: yaml.JSON_SCHEMA })
      if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
        data = loaded
        content = raw.slice(m[0].length)
        offset = m[0].split('\n').length - 1
      }
    } catch {}
  }
  if (content.endsWith('\n')) content = content.slice(0, -1)
  const id = data.id ? String(data.id) : 'p' + crypto.createHash('sha1').update(rel).digest('hex').slice(0, 10)
  const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
  notes[id] = { id, path: rel, folder, title: data.title ? String(data.title) : path.basename(rel, '.md'), type: TYPES.includes(data.type) ? data.type : 'note', tags: [], content }
  offsets[id] = offset
}

const key = (t) => `${notes[t.noteId].path}:${offsets[t.noteId] + t.line + 1}`
const all = tasks.allTasks(notes, cases.templates)
const LISTS = { today: 'today', upcoming: 'upcoming', anytime: 'anytime', someday: 'someday', logbook: 'done', overdue: 'overdue', week: 'week', month: 'month', undated: 'undated', open: 'open' }
const select = (list, query) => tasks.selectTasks(all, notes, { filter: LISTS[list], query, source: 'all' }, cases.weekStart, cases.today).map(key)

const expected = {
  tasks: all.map((t) => ({
    key: key(t),
    text: t.text,
    done: t.done,
    priority: tasks.priorityLabel(t.priority) || null,
    tags: t.tags,
    planned: t.scheduled ?? null,
    someday: t.someday,
    due: t.due ?? null,
    done_on: t.completed ?? null,
    heading: t.heading,
    overdue: tasks.isOverdue(t, cases.today),
    in_today: tasks.isToday(t, cases.today),
  })),
  lists: Object.fromEntries(Object.keys(LISTS).map((l) => [l, select(l, '')])),
  queries: cases.queries.map(([list, query]) => ({ list, query, keys: select(list, query) })),
}
await vite.close()

if (process.argv.includes('--write')) {
  fs.writeFileSync(file, JSON.stringify({ ...cases, expected }, null, 1) + '\n')
  console.log(`Recorded ${expected.tasks.length} tasks, ${Object.keys(expected.lists).length} lists and ${expected.queries.length} queries in tests/task-cases.json`)
} else {
  const same = JSON.stringify(expected) === JSON.stringify(cases.expected)
  if (!same) {
    console.error("The app's task rules no longer give the results recorded in tests/task-cases.json.")
    console.error('If the change is intended: run `node scripts/task-fixtures.mjs --write`, then make tools/margin_tasks.py match and run `npm run test:tasks`.')
    process.exit(1)
  }
  console.log(`app rules: ${expected.tasks.length} tasks, ${Object.keys(expected.lists).length} lists, ${expected.queries.length} queries match`)
}
