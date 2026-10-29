// Reorganising notes: extract a selection or section into a new note, move a section to another note, turn a
// note into a notebook of notes, and merge a note into another. Each is an ordinary edit of plain .md files, with
// version history behind it, and one Undo that puts every note back if none has changed since.
import { api } from './api'
import { closeTab, createNote, currentNote, ask, toast, ui, updateNote, useStore } from './store'
import { joinContent, splitContent } from './lib/canvas'
import { displayTitle } from './lib/util'
import { relink, sectionAtLine, sections, shiftHeadings, splitAtTop, topLevel, trimLines, uniqueTitle } from './lib/refactor'
import type { Note } from './types'

const state = () => useStore.getState()
const titleTaken = (except?: string) => (t: string) => Object.values(state().notes).some((n) => n.id !== except && n.title.toLowerCase() === t.toLowerCase())

/** Characters a file or folder name cannot have, as the server cleans them. */
const cleanName = (s: string) => s.replace(/[/\\:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'Untitled'

/** Where notes made out of this one go: beside it, unless it is a daily note or another kind Margin files itself. */
const besideFolder = (note: Note) => (note.type === 'note' ? note.folder : '')

/** Take a note out quietly (to the trash), as part of an Undo or a merge. */
async function discard(id: string) {
  await api.deleteNote(id).catch(() => {})
  useStore.setState((s) => {
    const notes = { ...s.notes }
    delete notes[id]
    return { notes }
  })
  closeTab(id)
}

/**
 * Offer one Undo for a reorganisation: put back the contents (and notebooks) of the notes changed, take out the
 * notes made, and bring back the notes removed. Nothing is undone if one of the changed notes has been edited since.
 */
function offerUndo(message: string, change: { before: Record<string, Partial<Note>>; made?: string[]; removed?: Note[]; newFolder?: string }) {
  const after = Object.fromEntries(Object.keys(change.before).map((id) => [id, state().notes[id]?.content]))
  toast(message, {
    label: 'Undo',
    run: async () => {
      const now = state().notes
      if (Object.keys(change.before).some((id) => now[id] && now[id].content !== after[id])) return toast('Those notes have changed since; nothing was undone.')
      for (const id of change.made ?? []) await discard(id)
      for (const note of change.removed ?? []) await createNote(note, false)
      for (const [id, patch] of Object.entries(change.before)) if (state().notes[id]) updateNote(id, patch)
      // A notebook made by this, and now empty again, goes too.
      const folder = change.newFolder
      if (folder) {
        await new Promise((r) => setTimeout(r, 300))
        if (!Object.values(state().notes).some((n) => n.folder === folder || n.folder.startsWith(folder + '/'))) {
          const res = await api.deleteFolder(folder).catch(() => null)
          if (res?.folders) useStore.setState({ folders: res.folders })
        }
      }
    },
  })
}

// ---------- 1. Extract to a new note ----------

/**
 * Move the selected text, or with nothing selected the section the cursor is in, into a new note beside this one,
 * leaving a [[link]] to it in its place. `from`/`to`/`line` are positions in the note's page.
 */
export async function extractToNote(sel: { from: number; to: number; line: number } | null) {
  const note = currentNote()
  if (!note || !sel) return
  const { page, canvas } = splitContent(note.content)
  const lines = page.split('\n')
  let text: string
  let suggested: string
  let rebuild: (link: string) => string
  if (sel.to > sel.from) {
    text = page.slice(sel.from, sel.to)
    const firstHeading = sections(text)[0]
    suggested = firstHeading?.title ?? text.split('\n').find((l) => l.trim())?.replace(/^\s*([-*+>]|\d+[.)])?\s*(\[[ xX]\]\s*)?/, '').slice(0, 60).trim() ?? ''
    rebuild = (link) => page.slice(0, sel.from) + link + page.slice(sel.to)
  } else {
    const s = sectionAtLine(page, sel.line)
    if (!s) return toast('Select the text to extract, or put the cursor in a section under a heading')
    const body = trimLines(lines.slice(s.start + 1, s.end))
    if (!body.length) return toast('This section has nothing under its heading to extract')
    // In a note of its own the section's subheadings start at ##.
    text = shiftHeadings(body.join('\n'), 2 - (s.level + 1))
    suggested = s.title
    // The heading stays, with a link to the new note as its text.
    rebuild = (link) => [...lines.slice(0, s.start + 1), '', link, ...(s.end < lines.length ? [''] : []), ...lines.slice(s.end)].join('\n')
  }
  const typed = await ask({ title: 'Extract to a new note', message: `It goes in ${besideFolder(note) || 'the top level'}, and a link to it takes the text's place.`, initial: suggested, placeholder: 'Title of the new note', confirmLabel: 'Extract' })
  if (typed === null) return
  const title = uniqueTitle(cleanName(typed), titleTaken())
  const made = await createNote({ title, folder: besideFolder(note), content: text.replace(/\s+$/, '') + '\n' }, false)
  if (!made) return
  const before = { [note.id]: { content: note.content } }
  updateNote(note.id, { content: joinContent(rebuild(`[[${made.title}]]`), canvas) })
  offerUndo(`Extracted to “${made.title}”`, { before, made: [made.id] })
}

// ---------- 2. Move a section to another note ----------

/** Open the note picker to move the section the cursor is in. */
export function pickSectionTarget(line: number) {
  const note = currentNote()
  if (!note) return
  const s = sectionAtLine(splitContent(note.content).page, line)
  if (!s) return toast('Put the cursor in a section under a heading to move it')
  ui({ palette: { mode: 'moveSection', noteId: note.id, section: { line: s.start, title: s.title } } })
}

/** Move a section (its heading and everything under it) to the end of another note's page. */
export async function moveSectionToNote(sourceId: string, section: { line: number; title: string }, target: { id?: string; newTitle?: string; folder?: string }) {
  const source = state().notes[sourceId]
  if (!source) return
  const { page, canvas } = splitContent(source.content)
  const lines = page.split('\n')
  const s = sections(page).find((x) => x.start === section.line && x.title === section.title)
  if (!s) return toast('That section has changed since; nothing was moved')
  const block = trimLines(lines.slice(s.start, s.end)).join('\n')
  let made: Note | null = null
  let dest = target.id ? state().notes[target.id] : undefined
  if (!dest && target.newTitle) {
    made = await createNote({ title: uniqueTitle(cleanName(target.newTitle), titleTaken()), folder: target.folder ?? besideFolder(source), content: '' }, false)
    dest = made ?? undefined
  }
  if (!dest) return
  const before: Record<string, Partial<Note>> = { [source.id]: { content: source.content } }
  if (!made) before[dest.id] = { content: dest.content }
  // Out of the source, with the blank lines around it closed up.
  const rest = [...trimLines(lines.slice(0, s.start)), ...(s.end < lines.length ? ['', ...trimLines(lines.slice(s.end))] : [])].join('\n')
  updateNote(source.id, { content: joinContent(rest, canvas) })
  const target2 = splitContent(state().notes[dest.id]?.content ?? '')
  const kept = target2.page.replace(/\s+$/, '')
  updateNote(dest.id, { content: joinContent((kept ? kept + '\n\n' : '') + block + '\n', target2.canvas) })
  offerUndo(`Moved “${s.title}” to ${displayTitle(dest)}`, { before, made: made ? [made.id] : [] })
}

// ---------- 3. Turn a note into a notebook ----------

/**
 * Make a notebook named after the note, with one note per top-level section. The note itself moves in as the
 * notebook's overview: it keeps its title (so links to it keep working), its text above the first section, and gets
 * a link to each new note.
 */
export async function turnIntoNotebook() {
  const note = currentNote()
  if (!note) return
  if (note.type !== 'note') return toast('Only ordinary notes can become a notebook (not daily, research or scratch notes)')
  const { page, canvas } = splitContent(note.content)
  const { intro, parts, level } = splitAtTop(page)
  if (!parts.length) return toast('This note has no headings to split it by. Add a heading above each part first.')
  const folder = [note.folder, cleanName(note.title)].filter(Boolean).join('/')
  const folderExisted = state().folders.some((f) => f.toLowerCase() === folder.toLowerCase())
  const hashes = '#'.repeat(level)
  const ok = await ask({
    title: `Turn “${displayTitle(note)}” into a notebook?`,
    message: `${parts.length} note${parts.length === 1 ? '' : 's'} will be made in the notebook ${folder}, one for each ${hashes} heading: ${parts.map((p) => p.title).join(', ')}. “${displayTitle(note)}” moves in with them as the overview, keeping the text above its first ${hashes} heading and a link to each new note. Links to it keep working.`,
    confirmLabel: 'Turn into notebook',
    input: false,
  })
  if (ok === null) return
  const taken = titleTaken(note.id)
  const made: Note[] = []
  for (const part of parts) {
    const title = uniqueTitle(cleanName(part.title), (t) => taken(t) || made.some((m) => m.title.toLowerCase() === t.toLowerCase()), note.title)
    const created = await createNote({ title, folder, content: part.body ? part.body + '\n' : '' }, false)
    if (!created) {
      for (const m of made) await discard(m.id)
      return toast('Could not make all the notes; nothing was changed')
    }
    made.push(created)
  }
  const list = ['## Notes', '', ...made.map((m) => `- [[${m.title}]]`)].join('\n')
  const overview = (intro ? intro + '\n\n' : '') + list + '\n'
  const before = { [note.id]: { content: note.content, folder: note.folder } }
  updateNote(note.id, { content: joinContent(overview, canvas), folder })
  offerUndo(`Made the notebook ${folder} with ${made.length} note${made.length === 1 ? '' : 's'}`, { before, made: made.map((m) => m.id), newFolder: folderExisted ? undefined : folder })
}

// ---------- 4. Merge a note into another ----------

/**
 * Add this note's page to the end of another under a heading with its title, give the other its tags, point every
 * link to this note at the other, and move this one to the trash.
 */
export async function mergeIntoNote(sourceId: string, targetId: string) {
  const s0 = state()
  const source = s0.notes[sourceId]
  const target = s0.notes[targetId]
  if (!source || !target || source.id === target.id) return
  const src = splitContent(source.content)
  const dst = splitContent(target.content)
  if (src.canvas.trim()) return toast(`“${displayTitle(source)}” has a canvas, which cannot be merged. Move its cards first.`)
  // Its headings go under the new ## heading, so its shallowest becomes ###.
  const lowest = topLevel(src.page)
  const body = shiftHeadings(src.page.trim(), lowest ? Math.max(0, 3 - lowest) : 0)
  const before: Record<string, Partial<Note>> = { [target.id]: { content: target.content, tags: target.tags } }
  const kept = dst.page.replace(/\s+$/, '')
  const tags = [...new Set([...target.tags, ...source.tags])]
  updateNote(target.id, { content: joinContent((kept ? kept + '\n\n' : '') + `## ${displayTitle(source)}\n\n` + (body ? body + '\n' : ''), dst.canvas), tags })
  // Links to the merged note now lead to the note it went into.
  let relinked = 0
  for (const other of Object.values(state().notes)) {
    if (other.id === source.id) continue
    const next = relink(other.content, source.title, target.title)
    if (next !== other.content) {
      if (!before[other.id]) before[other.id] = { content: other.content }
      updateNote(other.id, { content: next })
      relinked++
    }
  }
  await discard(source.id)
  offerUndo(`Merged “${displayTitle(source)}” into “${displayTitle(target)}”${relinked ? `; links updated in ${relinked} note${relinked === 1 ? '' : 's'}` : ''}`, { before, removed: [source] })
}

/** Open the note picker to merge the current note into another. */
export function pickMergeTarget() {
  const note = currentNote()
  if (!note) return
  if (splitContent(note.content).canvas.trim()) return toast(`“${displayTitle(note)}” has a canvas, which cannot be merged`)
  ui({ palette: { mode: 'merge', noteId: note.id } })
}
