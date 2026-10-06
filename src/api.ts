import type { Note, NotePatch } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || res.statusText)
  }
  return res.json()
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: JSON.stringify(body ?? {}) })

/** Settings kept in the notes folder itself, in .margin/config.json. */
export interface VaultConfig {
  attachments: string
  folderTags?: Record<string, string[]>
}

export const api = {
  state: () => request<{ notes: Note[]; folders: string[]; vault: string; config?: VaultConfig }>('/api/state'),
  setConfig: (config: Partial<VaultConfig>) => request<{ config: VaultConfig; folders: string[] }>('/api/config', json('PUT', config)),
  createNote: (note: Partial<Note>) => request<{ note: Note; folders: string[] }>('/api/notes', json('POST', note)),
  updateNote: (id: string, patch: NotePatch, keepalive = false) =>
    request<{ note: Note; touched: Note[] }>(`/api/notes/${id}`, { ...json('PUT', patch), keepalive }),
  deleteNote: (id: string) => request<{ ok: true }>(`/api/notes/${id}`, { method: 'DELETE' }),
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
