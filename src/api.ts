import type { Note, NotePatch } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // The status and the whole answer go with the error: a refused save (409) carries the note as it is now.
    throw Object.assign(new Error(body.error || res.statusText), { status: res.status, body })
  }
  return res.json()
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: JSON.stringify(body ?? {}) })

/** Settings kept in the notes folder itself, in .margin/config.json. */
export interface VaultConfig {
  attachments: string
  folderTags?: Record<string, string[]>
  /** The triage note an outside program writes (its path in the notes folder), and later how its tasks are moved. */
  triage?: TriageConfig
}

export interface TriageConfig {
  /** The triage note's path in the notes folder. */
  note?: string
  /** Where tasks go, first match wins: a category, tag or words in the title → a note (path; id when picked in Margin). */
  rules?: TriageRule[]
  /** A task whose category is the name of a note in this notebook goes to that note. */
  workstreamNotebook?: string
  /** Where tasks go when nothing else decides. */
  default?: string
  /** The heading moved tasks go under; Open Threads when not set. */
  heading?: string
  /** 'top' to put them at the top of that section; the bottom when not set. */
  position?: 'top' | ''
  /** Words or tags taken off a task as it moves (such as #quick). */
  strip?: string[]
  /** Add a line "_from triage, <date>_" under a moved task. */
  addLine?: boolean
}

export interface TriageRule {
  category?: string
  tag?: string
  title?: string
  note: string
  id?: string
}

/** A refused save: the note was changed on disk after the version the save was made from. */
export const isConflict = (e: unknown): e is Error & { status: 409; body: { note: Note } } => (e as { status?: number })?.status === 409 && !!(e as { body?: { note?: Note } }).body?.note

/** A deleted note in this computer's trash. `folder` is the notebook it came from ('' top level, null not known). */
export interface TrashItem {
  file: string
  title: string
  folder: string | null
  /** When it was deleted, in ms. */
  deleted: number
  snippet: string
}

/** This computer's Todoist import settings, as the server shows them (the token itself never comes back). */
export interface TodoistSettings {
  enabled: boolean
  project: string
  label: string
  connected: boolean
  /** After a change: whether a project of that name was found in Todoist. */
  projectFound?: boolean | null
}

/** A task waiting in Todoist to come into Margin. `priority` is Todoist's: 4 is P1, 1 is none. */
export interface TodoistTask {
  id: string
  content: string
  description: string
  priority: number
  due: { date: string; datetime: string | null } | null
  deadline: string | null
  labels: string[]
  parentId: string | null
  order: number
  added: string
}

export const api = {
  todoist: () => request<TodoistSettings>('/api/todoist'),
  setTodoist: (patch: Partial<TodoistSettings> & { token?: string }) => request<TodoistSettings>('/api/todoist', json('PUT', patch)),
  todoistTasks: () => request<{ tasks: TodoistTask[]; repeating: number; projectMissing: boolean }>('/api/todoist/tasks'),
  closeTodoist: (ids: string[]) => request<{ closed: string[]; failed: string[] }>('/api/todoist/close', json('POST', { ids })),
  state: () => request<{ notes: Note[]; folders: string[]; vault: string; local?: string; config?: VaultConfig }>('/api/state'),
  setConfig: (config: Partial<VaultConfig>) => request<{ config: VaultConfig; folders: string[] }>('/api/config', json('PUT', config)),
  createNote: (note: Partial<Note>) => request<{ note: Note; folders: string[] }>('/api/notes', json('POST', note)),
  /** Save changes to a note. `base` is the version the new content was made from; the save is refused (409) if the file has changed since. */
  updateNote: (id: string, patch: NotePatch & { base?: string }, keepalive = false) =>
    request<{ note: Note; touched: Note[] }>(`/api/notes/${id}`, { ...json('PUT', patch), keepalive }),
  /** The notes, of those given with the versions the page has, whose files have changed since. */
  /** A note as it is on disk right now. */
  freshNote: (id: string) => request<{ note: Note }>(`/api/notes/${id}/fresh`),
  changedNotes: (versions: Record<string, string>) => request<{ changed: Note[] }>('/api/versions', json('POST', { versions })),
  deleteNote: (id: string) => request<{ ok: true; trashed: string | null }>(`/api/notes/${id}`, { method: 'DELETE' }),
  trash: () => request<{ items: TrashItem[] }>('/api/trash'),
  trashContent: (file: string) => request<{ content: string }>(`/api/trash/${encodeURIComponent(file)}`),
  restoreTrash: (file: string) => request<{ note: Note | null; notes: Note[]; folders: string[] }>(`/api/trash/${encodeURIComponent(file)}/restore`, json('POST')),
  removeTrash: (file: string) => request<{ items: TrashItem[] }>(`/api/trash/${encodeURIComponent(file)}`, { method: 'DELETE' }),
  /** Remove everything in the trash, or with `days`, only what was deleted longer ago than that. */
  emptyTrash: (days = 0) => request<{ items: TrashItem[] }>('/api/trash/empty', json('POST', { days })),
  versions: (id: string) => request<{ versions: number[] }>(`/api/notes/${id}/versions`),
  version: (id: string, ts: number) => request<{ content: string }>(`/api/notes/${id}/versions/${ts}`),
  createFolder: (path: string) => request<{ folders: string[]; path: string }>('/api/folders', json('POST', { path })),
  renameFolder: (from: string, to: string) =>
    request<{ notes: Note[]; folders: string[] }>('/api/folders', json('PATCH', { from, to })),
  deleteFolder: (path: string) => request<{ notes: Note[]; folders: string[] }>('/api/folders', json('DELETE', { path })),
  importObsidian: (source: string, dest: string) =>
    request<{ imported: number; canvases: number; attachments: number; missing: number; unused: number; failed: string[]; notes: Note[]; folders: string[] }>(
      '/api/import/obsidian',
      json('POST', { source, dest }),
    ),
  unfurl: (url: string) => request<{ title: string; description: string }>(`/api/unfurl?url=${encodeURIComponent(url)}`),
  /** `saveAs` names the stored file (without extension); otherwise the file's own name is used with a short random suffix. */
  async upload(file: File, saveAs?: string): Promise<{ path: string; name: string }> {
    const ext = /\.[A-Za-z0-9]+$/.exec(file.name || '')?.[0] || '.png'
    const query = saveAs ? `name=${encodeURIComponent(saveAs + ext)}&keep=1` : `name=${encodeURIComponent(file.name || 'pasted.png')}`
    const res = await fetch(`/api/attachments?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
}

/** Pixels per point recorded inside a PNG file (2 for a Retina screenshot), or 0 when it does not say. */
async function pngScale(file: File): Promise<number> {
  if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) return 0
  try {
    const bytes = new DataView(await file.slice(0, 262144).arrayBuffer())
    // PNG is a signature followed by chunks: length, 4-letter type, data, checksum. Resolution is in "pHYs".
    for (let at = 8; at + 12 <= bytes.byteLength; ) {
      const length = bytes.getUint32(at)
      const type = String.fromCharCode(bytes.getUint8(at + 4), bytes.getUint8(at + 5), bytes.getUint8(at + 6), bytes.getUint8(at + 7))
      if (type === 'IDAT') break
      if (type === 'pHYs' && at + 17 <= bytes.byteLength) {
        const perMetre = bytes.getUint32(at + 8)
        const unitIsMetre = bytes.getUint8(at + 16) === 1
        return unitIsMetre ? Math.max(1, Math.round((perMetre * 0.0254) / 72)) : 0
      }
      at += 12 + length
    }
  } catch {
    /* unreadable: treat as unknown */
  }
  return 0
}

/**
 * The width to show an image at so it looks the size it was on screen. A Retina screenshot has twice
 * the pixels it had points, so shown pixel-for-pixel it would be double size.
 * Returns 0 when the image should simply be shown at its own size.
 */
async function displayWidth(file: File, pasted: boolean): Promise<number> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return 0
  let scale = await pngScale(file)
  // Images pasted from the clipboard lose their resolution tag; assume they came from this screen.
  if (!scale && pasted) scale = window.devicePixelRatio || 1
  if (scale <= 1.05) return 0
  try {
    const bitmap = await createImageBitmap(file)
    const width = Math.round(bitmap.width / scale)
    bitmap.close()
    return width
  } catch {
    return 0
  }
}

/**
 * A name for an image pasted from the clipboard, which otherwise arrives as plain "image.png":
 * the note's title and the time, e.g. "Atlas kickoff 2026-10-06 1654". Files that already have
 * a name of their own keep it.
 */
function pastedName(file: File, options: { pasted?: boolean; noteTitle?: string }): string | undefined {
  if (!options.pasted || options.noteTitle === undefined || !file.type.startsWith('image/')) return undefined
  if (!/^(image|pasted|untitled|blob)?(\.\w+)?$/i.test(file.name || '')) return undefined
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`
  const title = options.noteTitle.trim().slice(0, 60)
  // A daily note is already named for the date; an untitled note adds nothing useful.
  if (!title || /^untitled/i.test(title)) return `${date} ${time}`
  return title.includes(date) ? `${title} ${time}` : `${title} ${date} ${time}`
}

/** Markdown for an uploaded file: images and PDFs embed, everything else links. */
export async function uploadAsMarkdown(file: File, options: { pasted?: boolean; actualSize?: boolean; noteTitle?: string } = {}): Promise<string> {
  const width = options.actualSize === false ? 0 : await displayWidth(file, !!options.pasted)
  const { path, name } = await api.upload(file, pastedName(file, options))
  const label = name.replace(/\.[^.]+$/, '').replace(/[\[\]|]/g, '')
  const embed = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|avif|pdf)$/i.test(name)
  return `${embed ? '!' : ''}[${embed ? label + (width ? `|${width}` : '') : name}](${path})`
}
