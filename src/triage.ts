// Acting on the triage note from the Triage view: complete, drop, reopen, and set dates. Each action reads the
// note as it is on disk right now, finds the task again there (lib/triage.ts), changes only its line, and saves with
// the version it read, so a note rewritten by the triage program in between is never overwritten: the save is
// refused, and the action is tried once more on the newer note. Every action can be undone from its message.
import { api, isConflict } from './api'
import { OPEN_THREADS, addTriageRule, saveNow, takeNote, toast, triageNote, ui, useStore } from './store'
import { applyTriageAction, blockLines, hasOpenTaskLinking, insertUnderHeading, locateTask, parseTriage, prepareBlock, removeBlocks, resolveDestination, ruleLabel, type TriageAction, type TriageTask } from './lib/triage'
import { shortDate } from './lib/tasks'
import { joinContent, splitContent } from './lib/canvas'
import { displayTitle } from './lib/util'
import type { Note } from './types'

const words: Record<TriageAction['kind'], string> = { complete: 'Completed', drop: 'Dropped', reopen: 'Reopened', planned: 'Planned', due: 'Due date set for' }

/** The action that puts a task back as it was before `action`. */
function undoOf(task: TriageTask, action: TriageAction): TriageAction {
  if (action.kind === 'complete' || action.kind === 'drop') return task.state === 'open' ? { kind: 'reopen' } : task.state === 'done' ? { kind: 'complete' } : { kind: 'drop' }
  if (action.kind === 'reopen') return task.state === 'dropped' ? { kind: 'drop' } : { kind: 'complete' }
  if (action.kind === 'planned') return { kind: 'planned', date: task.planned ?? null, someday: task.someday }
  return { kind: 'due', date: task.due ?? null }
}

const describe = (action: TriageAction, title: string) => {
  const short = title.length > 60 ? title.slice(0, 57) + '…' : title
  if (action.kind === 'planned') return action.someday ? `“${short}” moved to Someday` : action.date ? `“${short}” planned for ${shortDate(action.date)}` : `Planned day removed from “${short}”`
  if (action.kind === 'due') return action.date ? `“${short}” due ${shortDate(action.date)}` : `Due date removed from “${short}”`
  return `${words[action.kind]} “${short}”`
}

let busy = false

/**
 * Do an action on a task of the triage note. True when it was saved. Unsaved typing in the note is saved first;
 * if that is refused (the file changed), the action does not go ahead.
 */
export async function triageAct(task: TriageTask, action: TriageAction, offerUndo = true): Promise<boolean> {
  const note = triageNote()
  if (!note) {
    toast('The triage note is not there any more')
    return false
  }
  if (busy) return false
  busy = true
  try {
    if (!(await saveNow(note.id))) {
      toast('Your unsaved changes to the triage note could not be saved, so nothing was changed. Look at the note first.')
      return false
    }
    const stamp = useStore.getState().settings.logCompletion
    for (let attempt = 0; attempt < 3; attempt++) {
      const { note: fresh } = await api.freshNote(note.id)
      const result = applyTriageAction(fresh.content, task, action, stamp)
      if (!result) {
        const still = locateTask(parseTriage(fresh.content), task)
        takeNote(fresh)
        // Already as asked (the note was rewritten with it so): nothing to do.
        if (still) return true
        toast('That task is no longer in the triage note: it was rewritten in the meantime. Nothing was changed.')
        return false
      }
      try {
        const res = await api.updateNote(note.id, { content: result.text, base: fresh.version })
        takeNote({ ...res.note, content: result.text })
        if (offerUndo) {
          const back = undoOf(result.task, action)
          toast(describe(action, result.task.title), { label: 'Undo', run: () => void triageAct({ ...result.task, rawLines: [result.text.split('\n')[result.task.line]] }, back, false) })
        }
        return true
      } catch (e) {
        // Rewritten between reading and saving: read it again and try on the newer note.
        if (isConflict(e)) continue
        throw e
      }
    }
    toast('The triage note kept changing while saving. Nothing was changed; try again.')
    return false
  } catch (e) {
    toast(`Could not change the triage note: ${(e as Error).message}`)
    return false
  } finally {
    busy = false
  }
}

// ---------- moving a task into another note ----------

/**
 * Save new content for a note, made from the version read just now; when the file has changed in between, read it
 * again and remake the content from that (`make` returns null to give up). The saved note, or null.
 */
async function saveFresh(id: string, make: (current: Note) => string | null): Promise<{ before: Note; after: Note } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { note: current } = await api.freshNote(id)
    const content = make(current)
    if (content === null) return null
    if (content === current.content) return { before: current, after: current }
    try {
      const res = await api.updateNote(id, { content, base: current.version })
      const after = { ...res.note, content }
      takeNote(after)
      return { before: current, after }
    } catch (e) {
      if (!isConflict(e)) throw e
    }
  }
  throw new Error('the note kept changing while saving')
}

/** One task to move, where to, and why (a rule, for the message). */
export interface MovePlan {
  task: TriageTask
  targetId: string
  reason?: string
}

/**
 * Move tasks of the triage note into other notes, as one action with one Undo. Each task's block goes in unchanged
 * (so its links stay on the task line and the triage program does not list it again) under the configured heading
 * of its note, made if missing; a note that already has an open task with the same link gets nothing for that task.
 * Only once every note is saved are the blocks taken out of the triage note, as it is by then. Tasks no longer in
 * the triage note are left out and counted.
 */
export async function triageMoveMany(plan: MovePlan[]): Promise<boolean> {
  const triage = triageNote()
  const notes = useStore.getState().notes
  if (!triage || !plan.length) return false
  if (plan.some((p) => p.targetId === triage.id)) {
    toast('A task cannot be moved into the triage note itself')
    return false
  }
  const targets = [...new Set(plan.map((p) => p.targetId))].filter((id) => notes[id])
  if (busy) return false
  busy = true
  try {
    for (const id of [triage.id, ...targets]) {
      if (!(await saveNow(id))) {
        toast(`Your unsaved changes to “${displayTitle(notes[id])}” could not be saved, so nothing was moved.`)
        return false
      }
    }
    // The tasks as they are in the triage note right now.
    const { note: tri } = await api.freshNote(triage.id)
    const doc = parseTriage(tri.content)
    const cfg = useStore.getState().triage
    const heading = cfg.heading?.trim() || OPEN_THREADS
    const found: { task: TriageTask; targetId: string; reason?: string; block: string[] }[] = []
    let missing = 0
    for (const p of plan) {
      const t = notes[p.targetId] ? locateTask(doc, p.task) : null
      if (!t || found.some((f) => f.task.line === t.line)) {
        missing += t ? 0 : 1
        continue
      }
      found.push({ task: t, targetId: p.targetId, reason: p.reason, block: prepareBlock(blockLines(doc, t), cfg) })
    }
    if (!found.length) {
      takeNote(tri)
      toast(`${plan.length === 1 ? 'That task is' : 'Those tasks are'} no longer in the triage note: it was rewritten in the meantime. Nothing was moved.`)
      return false
    }
    // 1. Into the other notes first, so a failure in between leaves copies, never lost tasks.
    const dests: { id: string; before: Note; after: Note }[] = []
    const duplicates = new Set<TriageTask>()
    for (const id of [...new Set(found.map((f) => f.targetId))]) {
      const mine = found.filter((f) => f.targetId === id)
      const saved = await saveFresh(id, (current) => {
        const { page, canvas } = splitContent(current.content)
        let next = page
        for (const f of mine) {
          const url = f.task.links[0]?.url ?? ''
          if (hasOpenTaskLinking(next, url)) duplicates.add(f.task)
          else next = insertUnderHeading(next, f.block, heading, cfg.position === 'top' ? 'top' : 'bottom')
        }
        return next === page ? current.content : joinContent(next, canvas)
      })
      if (saved && saved.after.content !== saved.before.content) dests.push({ id, ...saved })
    }
    // 2. Then out of the triage note, as it is by now (the program may have rewritten it meanwhile).
    const out = await saveFresh(triage.id, (current) => {
      const now = parseTriage(current.content)
      const again = found.map((f) => locateTask(now, f.task)).filter((t): t is TriageTask => !!t)
      return again.length ? removeBlocks(current.content, again) : current.content
    })
    if (!out) return false
    toast(movedMessage(found, duplicates, missing, heading), { label: 'Undo', run: () => void undoMove(triage.id, out, dests) })
    return true
  } catch (e) {
    toast(`Could not move ${plan.length === 1 ? 'the task' : 'the tasks'}: ${(e as Error).message}`)
    return false
  } finally {
    busy = false
  }
}

/** What a move did, in a sentence. */
function movedMessage(found: { task: TriageTask; targetId: string; reason?: string }[], duplicates: Set<TriageTask>, missing: number, heading: string) {
  const notes = useStore.getState().notes
  const name = (id: string) => (notes[id] ? displayTitle(notes[id]) : 'a note')
  const short = (t: string) => (t.length > 50 ? t.slice(0, 47) + '…' : t)
  const gone = missing ? ` ${missing} ${missing === 1 ? 'was' : 'were'} no longer in the triage note.` : ''
  if (found.length === 1) {
    const f = found[0]
    if (duplicates.has(f.task)) return `“${short(f.task.title)}” is already in ${name(f.targetId)}: taken out of the triage note only`
    return `Moved “${short(f.task.title)}” to ${name(f.targetId)} › ${heading}${f.reason ? ` (by ${f.reason})` : ''}`
  }
  const per = new Map<string, number>()
  for (const f of found) if (!duplicates.has(f.task)) per.set(f.targetId, (per.get(f.targetId) ?? 0) + 1)
  const parts = [...per].map(([id, n]) => `${n} to ${name(id)}`)
  const dup = duplicates.size ? `; ${duplicates.size} already there, taken out of the triage note only` : ''
  return `Moved ${found.length} tasks: ${parts.join(', ') || 'none added'}${dup}.${gone}`
}

/** Move one task (M, the picker). */
export const triageMove = (task: TriageTask, targetId: string, reason = '') => triageMoveMany([{ task, targetId, reason }])

/**
 * Put a move back: the triage note and every note it added to as they were, but only if none has changed since (in
 * which case nothing is undone, and the tasks stay where they went, so none is lost). The triage note first.
 */
async function undoMove(triageId: string, tri: { before: Note; after: Note }, dests: { id: string; before: Note; after: Note }[]) {
  try {
    const [{ note: t }, ...ds] = await Promise.all([api.freshNote(triageId), ...dests.map((d) => api.freshNote(d.id))])
    if (t.content !== tri.after.content || ds.some((d, i) => d.note.content !== dests[i].after.content)) {
      return toast('The notes have changed since the move, so it was not undone. The tasks are still in the notes they went to.')
    }
    const res = await api.updateNote(triageId, { content: tri.before.content, base: t.version })
    takeNote({ ...res.note, content: tri.before.content })
    for (const [i, d] of dests.entries()) {
      const r = await api.updateNote(d.id, { content: d.before.content, base: ds[i].note.version })
      takeNote({ ...r.note, content: d.before.content })
    }
    toast('Move undone')
  } catch (e) {
    toast(isConflict(e) ? 'The notes changed while undoing; nothing more was undone.' : `Could not undo the move: ${(e as Error).message}`)
  }
}

/** The notes rules can name. */
const noteRefs = () => Object.values(useStore.getState().notes).map((n) => ({ id: n.id, path: n.path, title: n.title, folder: n.folder }))

/** Where the rules send a task, if anywhere: the note and why (for menus and messages). */
export function destinationOf(task: TriageTask) {
  return resolveDestination(task, useStore.getState().triage, noteRefs(), triageNote()?.id)
}

/** Move a task where the rules send it (M); with no rule for it, ask which note (as ⇧M always does). */
export function moveByRules(task: TriageTask) {
  const dest = destinationOf(task)
  if (dest) void triageMove(task, dest.note.id, dest.reason)
  else ui({ palette: { mode: 'triageMove', triageTask: task } })
}

/**
 * Move tasks into a note picked in the picker (with any already placed by rules, as one action). With `remember`
 * (⌥↵), from now on every task of their category goes there.
 */
export async function moveToPicked(tasks: TriageTask[], note: Note, placed: MovePlan[] = [], remember = false) {
  const category = tasks[0]?.category ?? ''
  if (remember && category) {
    const rule = { category, note: note.path, id: note.id }
    if (await addTriageRule(rule)) toast(`From now on, ${ruleLabel(rule)} goes to ${displayTitle(note)}`)
  }
  await triageMoveMany([...placed, ...tasks.map((task) => ({ task, targetId: note.id, reason: remember && category ? `category ${category}` : '' }))])
}

/**
 * Move every open task of a category (in the newest run) where the rules send each one, as one action with one
 * Undo (Move all, A). Tasks no rule places go together into a note you pick, with the rest, still as one action.
 */
export function moveCategory(tasks: TriageTask[]) {
  const open = tasks.filter((t) => t.state === 'open')
  if (!open.length) return toast('Nothing open in this category')
  const plan: MovePlan[] = []
  const unplaced: TriageTask[] = []
  for (const t of open) {
    const dest = destinationOf(t)
    if (dest) plan.push({ task: t, targetId: dest.note.id, reason: dest.reason })
    else unplaced.push(t)
  }
  if (!unplaced.length) return void triageMoveMany(plan)
  ui({ palette: { mode: 'triageMove', triageTask: unplaced[0], triageTasks: unplaced, triagePlan: plan } })
}
