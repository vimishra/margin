// Todoist → Margin: tasks captured in Todoist (on the phone, say) are brought into Margin's Inbox. This side talks
// to Todoist with the person's API token; the page (src/todoist.ts) writes the tasks into the Inbox note and then
// asks for them to be closed in Todoist, so each task is moved, never copied twice.
//
// The settings, token included, are kept in this computer's own folder (todoist.json beside the version history),
// never in the notes folder, which may be synced. The token is never sent back to the page.
import fs from 'node:fs/promises'
import path from 'node:path'

// MARGIN_TODOIST_API points at a stand-in server for testing; it is not set in normal use.
const API = process.env.MARGIN_TODOIST_API || 'https://api.todoist.com/api/v1'

/** Read and write this computer's Todoist settings. */
function store(dataDir) {
  const file = path.join(dataDir, 'todoist.json')
  return {
    async read() {
      try {
        return { enabled: false, project: 'Margin', label: '', token: '', ...JSON.parse(await fs.readFile(file, 'utf8')) }
      } catch {
        return { enabled: false, project: 'Margin', label: '', token: '' }
      }
    },
    async write(s) {
      await fs.mkdir(dataDir, { recursive: true })
      await fs.writeFile(file, JSON.stringify(s, null, 2), { mode: 0o600 })
    },
  }
}

/** One request to Todoist. Errors say what went wrong in words a person can act on. */
async function call(token, method, route, query) {
  const url = new URL(API + route)
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') url.searchParams.set(k, String(v))
  let r
  try {
    r = await fetch(url, { method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
  } catch {
    throw Object.assign(new Error('Could not reach Todoist. Check the internet connection.'), { status: 502 })
  }
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Todoist did not accept the token. Copy it again from Todoist → Settings → Integrations → Developer.'), { status: 400 })
  if (!r.ok) throw Object.assign(new Error(`Todoist answered ${r.status}.`), { status: 502 })
  return r.status === 204 ? null : r.json().catch(() => null)
}

/** Every page of a list from Todoist. */
async function all(token, route, query = {}) {
  const out = []
  let cursor = ''
  for (let i = 0; i < 50; i++) {
    const page = await call(token, 'GET', route, { ...query, limit: 200, cursor })
    out.push(...(page?.results ?? []))
    cursor = page?.next_cursor
    if (!cursor) break
  }
  return out
}

async function findProject(token, name) {
  if (!name.trim()) return null
  const projects = await all(token, '/projects')
  return projects.find((p) => String(p.name).trim().toLowerCase() === name.trim().toLowerCase()) ?? null
}

/** What the page sees of the settings: no token, only whether there is one. */
const visible = (s) => ({ enabled: !!s.enabled, project: s.project || '', label: s.label || '', connected: !!s.token })

export function todoistRoutes(app, h, dataDir) {
  const settings = store(dataDir)

  app.get('/api/todoist', h(async (_req, res) => res.json(visible(await settings.read()))))

  // Change the settings. A new token is checked with Todoist before it is kept; the answer says whether the project
  // was found, so a misspelt name shows at once.
  app.put('/api/todoist', h(async (req, res) => {
    const s = await settings.read()
    const b = req.body || {}
    if (typeof b.token === 'string') {
      const token = b.token.trim()
      if (token) await call(token, 'GET', '/projects', { limit: 1 })
      s.token = token
      if (!token) s.enabled = false
    }
    if (typeof b.project === 'string') s.project = b.project.trim()
    if (typeof b.label === 'string') s.label = b.label.trim().replace(/^@/, '')
    if (typeof b.enabled === 'boolean') s.enabled = b.enabled && !!s.token
    await settings.write(s)
    let projectFound = null
    if (s.token && s.project) projectFound = !!(await findProject(s.token, s.project).catch(() => null))
    res.json({ ...visible(s), projectFound })
  }))

  // The open tasks waiting to come into Margin: those in the project, and those with the label. Repeating tasks are
  // left in Todoist (closing one there only moves it to its next date), and counted so the page can say so.
  app.get('/api/todoist/tasks', h(async (_req, res) => {
    const s = await settings.read()
    if (!s.token) return res.json({ tasks: [], repeating: 0, projectMissing: false })
    const found = new Map()
    let projectMissing = false
    if (s.project) {
      const project = await findProject(s.token, s.project)
      if (project) for (const t of await all(s.token, '/tasks', { project_id: project.id })) found.set(t.id, t)
      else projectMissing = true
    }
    if (s.label) for (const t of await all(s.token, '/tasks', { label: s.label })) found.set(t.id, t)
    const tasks = [...found.values()].filter((t) => !t.checked && !t.is_deleted)
    const repeating = tasks.filter((t) => t.due?.is_recurring)
    // A sub-task comes with its parent; one whose parent repeats stays behind with it.
    const skip = new Set(repeating.map((t) => t.id))
    const keep = tasks.filter((t) => !skip.has(t.id) && !skip.has(t.parent_id))
    res.json({
      tasks: keep.map((t) => ({
        id: t.id,
        content: t.content ?? '',
        description: t.description ?? '',
        priority: t.priority ?? 1,
        due: t.due ? { date: t.due.date, datetime: t.due.datetime ?? null } : null,
        deadline: t.deadline?.date ?? null,
        labels: t.labels ?? [],
        parentId: t.parent_id ?? null,
        order: t.child_order ?? 0,
        added: t.added_at ?? '',
      })),
      repeating: repeating.length,
      projectMissing,
    })
  }))

  // Close tasks in Todoist once they are safely in a note. Each is tried on its own; the answer lists what failed.
  app.post('/api/todoist/close', h(async (req, res) => {
    const s = await settings.read()
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter((id) => /^[\w-]+$/.test(id)) : []
    const closed = []
    const failed = []
    for (const id of ids) {
      try {
        await call(s.token, 'POST', `/tasks/${encodeURIComponent(id)}/close`)
        closed.push(id)
      } catch {
        failed.push(id)
      }
    }
    res.json({ closed, failed })
  }))
}
