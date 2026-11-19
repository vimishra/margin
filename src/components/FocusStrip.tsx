// The week's focus tasks, shown above the urgent lists (Today, Triage) so important work stays in view all day.
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Target } from 'lucide-react'
import { go, useStore } from '../store'
import { TaskRow } from './TasksView'
import { focusKey, focusTasks } from '../lib/focus'
import { allTasks, byUrgency } from '../lib/tasks'
import { local } from '../lib/util'

export function useFocusTasks() {
  const notes = useStore((s) => s.notes)
  const settings = useStore((s) => s.settings)
  const triagePath = useStore((s) => s.triage.note)
  const tag = focusKey(settings.focusTag)
  return useMemo(
    () => (tag ? focusTasks(allTasks(notes, settings.templatesFolder, settings.inboxFolder, triagePath ? [triagePath] : []), tag).sort(byUrgency) : []),
    [notes, settings.templatesFolder, settings.inboxFolder, triagePath, tag],
  )
}

/** A folding box of the open focus tasks. With none, a one-line hint (or nothing, with `quietWhenEmpty`). */
export function FocusStrip({ quietWhenEmpty = false }: { quietWhenEmpty?: boolean }) {
  const notes = useStore((s) => s.notes)
  const tag = useStore((s) => focusKey(s.settings.focusTag))
  const tasks = useFocusTasks()
  const [open, setOpen] = useState(() => local.get('focusOpen', true))
  if (!tag || (!tasks.length && quietWhenEmpty)) return null
  return (
    <section className="day-tasks focus-strip">
      <div className="focus-strip-head">
        <button className="day-tasks-head" onClick={() => (setOpen(!open), local.set('focusOpen', !open))} title="The important next actions you chose for the week (tagged #focus)">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Target size={14} /> Focus
          <span className="count">{tasks.length ? `${tasks.length} important next action${tasks.length === 1 ? '' : 's'}` : 'none chosen'}</span>
        </button>
        <button className="link-btn" onClick={() => go({ name: 'review' })}>
          Weekly review
        </button>
      </div>
      {open && (
        <div className="day-tasks-body">
          {tasks.length ? (
            tasks.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)
          ) : (
            <p className="focus-empty">
              Nothing marked as focus. Press <kbd>F</kbd> on an important next action, or choose them in the Weekly review.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
