// A ```tasks block shown as a live list of tasks, in the editor, in read mode and in exports. The block's text is
// a filter (see lib/taskQuery.ts); ticking or changing a task here changes its line in its own note.
import { Fragment, useMemo } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ListChecks, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { describeQuery, parseTaskQuery, runTaskQuery, type BlockGroup, type TaskContext } from '../lib/taskQuery'
import { priorityLabel, shortDate, weekRange, type Task } from '../lib/tasks'
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

/** The tasks in groups, in the order the groups come: [label, tasks][]; one unlabelled group when not grouped. */
function grouped(tasks: Task[], group: BlockGroup, notes: Record<string, Note>, weekStart: number): [string, Task[]][] {
  if (group === 'none') return [['', tasks]]
  const now = today()
  const weekEnd = weekRange(now, weekStart)[1]
  const groups = new Map<string, { label: string; tasks: Task[] }>()
  for (const t of tasks) {
    const [key, label] =
      group === 'date'
        ? dateBucket(t, now, weekEnd)
        : group === 'priority'
          ? [String(9 - t.priority), t.priority ? priorityLabel(t.priority) : 'No priority']
          : [displayTitle(notes[t.noteId]).toLowerCase(), displayTitle(notes[t.noteId])]
    const g = groups.get(key) ?? { label, tasks: [] }
    g.tasks.push(t)
    groups.set(key, g)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => [g.label, g.tasks])
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
  const groups = grouped(tasks, query.group, notes, ctx.weekStart)
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
            {groups.map(([label, list]) => (
              <Fragment key={label || 'all'}>
                {label && <h4 className="task-block-group">{label}</h4>}
                {list.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} showNote={query.group !== 'note'} />)}
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
  const rows = (list: Task[]) =>
    list
      .map((t) => {
        const note = s.notes[t.noteId]
        const meta = [t.priority ? priorityLabel(t.priority) : '', t.scheduled ? `planned ${shortDate(t.scheduled)}` : '', t.due ? `due ${shortDate(t.due)}` : '', t.done && t.completed ? `done ${shortDate(t.completed)}` : '', query.group !== 'note' && note ? displayTitle(note) : '']
          .filter(Boolean)
          .join(' · ')
        return `<li class="task-list-item"><input type="checkbox" disabled${t.done ? ' checked' : ''}> ${renderInline(t.text)}${meta ? ` <span style="color:#8a867f;font-size:.85em">— ${esc(meta)}</span>` : ''}</li>`
      })
      .join('')
  const body = grouped(shown, query.group, s.notes, ctx.weekStart)
    .map(([label, list]) => (label ? `<p><strong>${esc(label)}</strong></p>` : '') + `<ul class="contains-task-list">${rows(list)}</ul>`)
    .join('')
  return `<div class="task-block-export"><p style="color:#8a867f;font-size:.85em">${esc(describeQuery(query))}</p>${shown.length ? body : '<p><em>No tasks match.</em></p>'}</div>`
}
