// Acting on the triage note from the Triage view: complete, drop, reopen, and set dates. Each action reads the
// note as it is on disk right now, finds the task again there (lib/triage.ts), changes only its line, and saves with
// the version it read, so a note rewritten by the triage program in between is never overwritten: the save is
// refused, and the action is tried once more on the newer note. Every action can be undone from its message.
import { api, isConflict } from './api'
import { OPEN_THREADS, addTriageRule, saveNow, takeNote, toast, triageNote, ui, useStore } from './store'
import { applyTriageAction, blockLines, hasOpenTaskLinking, insertUnderHeading, locateTask, parseTriage, prepareBlock, removeBlock, resolveDestination, ruleLabel, type TriageAction, type TriageTask } from './lib/triage'
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

/**
 * Move a task of the triage note into another note: its block, unchanged (so its links stay on the task line and
 * the triage program does not list it again), goes under the Open Threads heading of that note, made if missing;
 * then, only once that is saved, the block is taken out of the triage note. If the note already has an open task
 * with the same link, nothing is added there and the task only leaves the triage note. One Undo puts both back.
 */
export async function triageMove(task: TriageTask, targetId: string, reason = ''): Promise<boolean> {
  const triage = triageNote()
  const target = useStore.getState().notes[targetId]
  if (!triage || !target) return false
  if (target.id === triage.id) {
    toast('A task cannot be moved into the triage note itself')
    return false
  }
  if (busy) return false
  busy = true
  try {
    for (const id of [triage.id, target.id]) {
      if (!(await saveNow(id))) {
        toast(`Your unsaved changes to “${displayTitle(useStore.getState().notes[id] ?? target)}” could not be saved, so nothing was moved.`)
        return false
      }
    }
    // The task as it is in the triage note right now.
    const { note: tri } = await api.freshNote(triage.id)
    const found = locateTask(parseTriage(tri.content), task)
    if (!found) {
      takeNote(tri)
      toast('That task is no longer in the triage note: it was rewritten in the meantime. Nothing was moved.')
      return false
    }
    const cfg = useStore.getState().triage
    const heading = cfg.heading?.trim() || OPEN_THREADS
    const block = prepareBlock(blockLines(parseTriage(tri.content), found), cfg)
    const url = found.links[0]?.url ?? ''
    // 1. Into the other note first, so a failure in between leaves a copy, never a lost task.
    let duplicate = false
    const dest = await saveFresh(target.id, (current) => {
      const { page, canvas } = splitContent(current.content)
      if (hasOpenTaskLinking(page, url)) {
        duplicate = true
        return current.content
      }
      return joinContent(insertUnderHeading(page, block, heading, cfg.position === 'top' ? 'top' : 'bottom'), canvas)
    })
    if (!dest) return false
    // 2. Then out of the triage note, as it is by now (the program may have rewritten it meanwhile).
    const out = await saveFresh(triage.id, (current) => {
      const again = locateTask(parseTriage(current.content), found)
      return again ? removeBlock(current.content, again) : current.content
    })
    if (!out) return false
    const where = `${displayTitle(dest.after)} › ${heading}${reason ? ` (by ${reason})` : ''}`
    const short = found.title.length > 50 ? found.title.slice(0, 47) + '…' : found.title
    toast(duplicate ? `“${short}” is already in ${displayTitle(dest.after)}: taken out of the triage note only` : `Moved “${short}” to ${where}`, {
      label: 'Undo',
      run: () => void undoMove(triage.id, out, target.id, duplicate ? null : dest),
    })
    return true
  } catch (e) {
    toast(`Could not move the task: ${(e as Error).message}`)
    return false
  } finally {
    busy = false
  }
}

/**
 * Put a move back: the triage note and the other note as they were, but only if neither has changed since (in
 * which case nothing is undone, and the task stays where it went, so it is never lost). The triage note first.
 */
async function undoMove(triageId: string, tri: { before: Note; after: Note }, targetId: string, dest: { before: Note; after: Note } | null) {
  try {
    const [{ note: t }, d] = await Promise.all([api.freshNote(triageId), dest ? api.freshNote(targetId) : Promise.resolve(null)])
    if (t.content !== tri.after.content || (dest && d && d.note.content !== dest.after.content)) {
      return toast('The notes have changed since the move, so it was not undone. The task is still in the note it went to.')
    }
    const res = await api.updateNote(triageId, { content: tri.before.content, base: t.version })
    takeNote({ ...res.note, content: tri.before.content })
    if (dest && d) {
      const r2 = await api.updateNote(targetId, { content: dest.before.content, base: d.note.version })
      takeNote({ ...r2.note, content: dest.before.content })
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

/** Move a task into a note, and from now on send every task of its category there (⌥↵ in the picker). */
export async function moveAndRemember(task: TriageTask, note: Note) {
  if (task.category) {
    const rule = { category: task.category, note: note.path, id: note.id }
    if (await addTriageRule(rule)) toast(`From now on, ${ruleLabel(rule)} goes to ${displayTitle(note)}`)
  }
  await triageMove(task, note.id, task.category ? `category ${task.category}` : '')
}
