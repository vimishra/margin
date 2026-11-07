// A ```tasks block shown as a live list of tasks, in the editor, in read mode and in exports. The block's text is
// a filter (see lib/taskQuery.ts); ticking or changing a task here changes its line in its own note.
import { Fragment, useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ListChecks, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { describeQuery, parseTaskQuery, runTaskQuery, type BlockGroup, type TaskContext } from '../lib/taskQuery'
import { priorityLabel, projectsOf, shortDate, weekRange, type ProjectFolders, type Task } from '../lib/tasks'
import { renderInline } from '../lib/markdown'
import { displayTitle, today } from '../lib/util'
import type { Note } from '../types'
import { TaskRow, dateBucket, weekStartOf } from './TasksView'

/** Shown when nothing is narrowed down and no limit is given: enough for any real list, not a whole Logbook. */
const MOST = 200

type State = ReturnType<typeof useStore.getState>

function contextOf(s: Pick<State, 'notes' | 'settings'>): TaskContext {
  return {
    notes: s.notes,
    templatesFolder: s.settings.templatesFolder,
    inboxFolder: s.settings.inboxFolder,
    meetingsFolder: s.settings.meetingsFolder,
    weekStart: weekStartOf(s.settings.weekStart),
  }
}

/**
 * The tasks in groups, in the order the groups come; one unlabelled group when not grouped. By project, as the Tasks
 * view does: a task goes under its project, a meeting's actions under the projects the meeting links, tasks in daily
 * notes under "Daily notes" (so a task can be under more than one); `noteId` is the project's note.
 */
function grouped(tasks: Task[], group: BlockGroup, notes: Record<string, Note>, weekStart: number, folders: ProjectFolders): { label: string; tasks: Task[]; noteId?: string }[] {
  if (group === 'none') return [{ label: '', tasks }]
  const now = today()
  const weekEnd = weekRange(now, weekStart)[1]
  const groups = new Map<string, { label: string; tasks: Task[]; noteId?: string }>()
  const add = (key: string, label: string, t: Task, noteId?: string) => {
    const g = groups.get(key) ?? { label, tasks: [], noteId }
    g.tasks.push(t)
    groups.set(key, g)
  }
  for (const t of tasks) {
    if (group === 'date') add(...dateBucket(t, now, weekEnd), t)
    else if (group === 'priority') add(String(9 - t.priority), t.priority ? priorityLabel(t.priority) : 'No priority', t)
    else
      for (const id of projectsOf(t, notes, folders)) {
        const home = notes[id]
        if (!home) continue
        if (home.type === 'daily') add('2', 'Daily notes', t)
        else add(`1${(home.folder || '').toLowerCase()}\u0000${displayTitle(home).toLowerCase()}\u0000${id}`, displayTitle(home), t, id)
      }
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g)
}

export function TaskBlock({ source, onEdit }: { source: string; onEdit?: () => void }) {
  const notes = useStore((s) => s.notes)
  const settings = useStore((s) => s.settings)
  const query = useMemo(() => parseTaskQuery(source), [source])
  const ctx = contextOf({ notes, settings })
  const { tasks, total, missing } = useMemo(() => {
    const result = runTaskQuery(query, ctx)
    return query.limit || result.tasks.length <= MOST ? result : { ...result, tasks: result.tasks.slice(0, MOST) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, notes, settings.templatesFolder, settings.inboxFolder, settings.meetingsFolder, settings.weekStart])
  const groups = grouped(tasks, query.group, notes, ctx.weekStart, settings)
  const open = tasks.filter((t) => !t.done).length

  return (
    <section className="day-tasks task-block" contentEditable={false}>
      <div className="day-tasks-head task-block-head">
        <ListChecks size={14} />
        <span className="task-block-title">{query.obsidian ? 'Tasks query' : describeQuery(query)}</span>
        {!query.obsidian && <span className="count">{query.filter === 'done' ? `${total} done` : `${open} open`}</span>}
        {onEdit && (
          <button className="icon-btn sm task-block-edit" title="Change what this block shows" onMouseDown={(e) => (e.preventDefault(), onEdit())}>
            <Pencil size={13} />
          </button>
        )}
      </div>
      <div className="day-tasks-body">
        {query.obsidian ? (
          <p className="task-block-note">This is a query for Obsidian's Tasks plugin, which Margin does not run. Write the filter as in the Tasks view, for example <code>today #atlas p2</code>.</p>
        ) : (
          <>
            {groups.map((g) => (
              <Fragment key={(g.noteId ?? '') + g.label || 'all'}>
                {g.label && <h4 className="task-block-group">{g.label}</h4>}
                {/* Under its project, a task shows its note only when it was written somewhere else (a meeting, a day). */}
                {g.tasks.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} showNote={query.group !== 'note' || t.noteId !== g.noteId} />)}
              </Fragment>
            ))}
            {!tasks.length && <p className="task-block-note">No tasks match.</p>}
            {total > tasks.length && <p className="task-block-note">and {total - tasks.length} more{query.limit ? '' : '; narrow it down, or add limit 20'}</p>}
            {missing.length > 0 && <p className="task-block-note warn">No note called {missing.map((m) => `“${m}”`).join(', ')}.</p>}
            {query.problems.length > 0 && <p className="task-block-note warn">Not understood: {query.problems.join(', ')}</p>}
          </>
        )}
      </div>
    </section>
  )
}

/** Show TaskBlocks in every `.task-block-mount` under an element (read mode); returns a function that removes them. */
export function mountTaskBlocks(root: HTMLElement): () => void {
  const roots: Root[] = []
  root.querySelectorAll<HTMLElement>('.task-block-mount').forEach((el) => {
    const r = createRoot(el)
    r.render(<TaskBlock source={el.dataset.query || ''} />)
    roots.push(r)
  })
  // Unmounting while React is rendering warns; do it just after.
  return () => setTimeout(() => roots.forEach((r) => r.unmount()))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The block as plain HTML, as it is now, for exports: a task list with each task's note and dates. */
export function taskBlockSnapshot(source: string): string {
  const s = useStore.getState()
  const query = parseTaskQuery(source)
  if (query.obsidian) return `<pre><code>${esc(source)}</code></pre>`
  const ctx = contextOf(s)
  const { tasks } = runTaskQuery(query, ctx)
  const shown = query.limit ? tasks : tasks.slice(0, MOST)
  const rows = (list: Task[], groupNote?: string) =>
    list
      .map((t) => {
        const note = s.notes[t.noteId]
        const meta = [t.priority ? priorityLabel(t.priority) : '', t.scheduled ? `planned ${shortDate(t.scheduled)}` : '', t.due ? `due ${shortDate(t.due)}` : '', t.cancelled ? `cancelled${t.completed ? ' ' + shortDate(t.completed) : ''}` : t.done && t.completed ? `done ${shortDate(t.completed)}` : '', (query.group !== 'note' || t.noteId !== groupNote) && note ? displayTitle(note) : '']
          .filter(Boolean)
          .join(' · ')
        return `<li class="task-list-item${t.cancelled ? ' cancelled' : ''}"><input type="checkbox" disabled${t.done ? ' checked' : ''}${t.cancelled ? ' class="box-cancelled"' : ''}> ${renderInline(t.text)}${meta ? ` <span style="color:#8a867f;font-size:.85em">— ${esc(meta)}</span>` : ''}</li>`
      })
      .join('')
  const body = grouped(shown, query.group, s.notes, ctx.weekStart, s.settings)
    .map((g) => (g.label ? `<p><strong>${esc(g.label)}</strong></p>` : '') + `<ul class="contains-task-list">${rows(g.tasks, g.noteId)}</ul>`)
    .join('')
  return `<div class="task-block-export"><p style="color:#8a867f;font-size:.85em">${esc(describeQuery(query))}</p>${shown.length ? body : '<p><em>No tasks match.</em></p>'}</div>`
}
