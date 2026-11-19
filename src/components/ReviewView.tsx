// The weekly review: how the week's finished work splits between focus (important) and everything else, the focus
// tasks that have not moved, and every live project with its progress and next action, flagging stalled ones. The
// stars on next actions are where next week's focus is chosen. Nothing is stored apart from the notes, except the
// day each focus task was first seen (on this computer, for "not moved in two weeks").
import { useMemo, useRef, useState, useEffect } from 'react'
import { Archive, CalendarCheck, ChevronLeft, ChevronRight, FileText, Plus, Star, Target } from 'lucide-react'
import { OPEN_THREADS, ask, hiddenTaskNotes, openNote, toast, triageNote, updateNote, usePageWidthStyle, useStore } from '../store'
import { TaskRow, weekStartOf } from './TasksView'
import { archiveProject } from '../archive'
import { focusSince, toggleFocus } from '../focus'
import { focusKey, isFocus, projectList, taskKey, withTag, type Project } from '../lib/focus'
import { allTasks, shortDate, weekRange } from '../lib/tasks'
import { insertUnderHeading, parseTriage } from '../lib/triage'
import { renderInline } from '../lib/markdown'
import { joinContent, splitContent } from '../lib/canvas'
import { addDays, cx, displayTitle, today } from '../lib/util'

/** Focus tasks open this long (on this computer's count) are pointed out as not moving. */
const STUCK_DAYS = 14

/** A task's words for a small chip: link labels, no tags, no markdown marks. */
const plain = (text: string) =>
  text
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, t, l) => l || t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)#[A-Za-z][\w/-]*/g, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** Write a new task at the end of a project note's Open Threads section (made if missing), as a focus task or not. */
async function addProjectTask(project: Project, focus: boolean) {
  const tag = focusKey(useStore.getState().settings.focusTag)
  const text = (await ask({ title: `Next step for ${displayTitle(project.note)}`, message: focus && tag ? `Written under ${OPEN_THREADS} in the project note, tagged #${tag}.` : `Written under ${OPEN_THREADS} in the project note.`, placeholder: 'Draft the…', confirmLabel: 'Add' }))?.trim()
  if (!text) return
  const note = useStore.getState().notes[project.note.id]
  if (!note) return
  const heading = useStore.getState().triage.heading?.trim() || OPEN_THREADS
  const { page, canvas } = splitContent(note.content)
  updateNote(note.id, { content: joinContent(insertUnderHeading(page, [`- [ ] ${focus && tag ? withTag(text, tag, true) : text}`], heading), canvas) })
  toast(`Added “${text}” to ${displayTitle(note)}`)
}

export function ReviewView() {
  const notes = useStore((s) => s.notes)
  const settings = useStore((s) => s.settings)
  const triagePath = useStore((s) => s.triage.note)
  const pageWidth = usePageWidthStyle()
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => root.current?.focus(), [])
  const tag = focusKey(settings.focusTag)
  const now = today()
  const [weeksBack, setWeeksBack] = useState(0)
  const [from, to] = weekRange(addDays(now, -7 * weeksBack), weekStartOf(settings.weekStart))

  const tasks = useMemo(() => allTasks(notes, settings.templatesFolder, settings.inboxFolder, triagePath ? [triagePath] : []), [notes, settings.templatesFolder, settings.inboxFolder, triagePath])
  const projects = useMemo(() => projectList(notes, tasks, settings, tag), [notes, tasks, settings, tag])

  // The week: finished (not cancelled) tasks in your notes, how many were focus, and what was completed in Triage.
  const week = useMemo(() => {
    const inWeek = (d?: string) => !!d && d >= from && d <= to
    const done = tasks.filter((t) => t.done && !t.cancelled && inWeek(t.completed))
    const focus = done.filter((t) => isFocus(t, tag))
    const tri = triagePath ? triageNote() : undefined
    const triageIds = new Set<string>()
    let triageRuns = 0
    if (tri) {
      const doc = parseTriage(tri.content)
      triageRuns = doc.runs.length
      for (const run of doc.runs) for (const c of run.categories) for (const g of c.groups) for (const t of g.tasks) if (t.state === 'done' && inWeek(t.closedOn)) triageIds.add(t.id.replace(/#\d+$/, ''))
    }
    return { done, focus, triage: triageIds.size, triageRuns, hasTriage: !!tri }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tag, from, to, triagePath, notes])

  const since = focusSince()
  const focusOpen = useMemo(() => tasks.filter((t) => !t.done && isFocus(t, tag)), [tasks, tag])
  const stuck = focusOpen.filter((t) => since[taskKey(t)] && daysBetween(since[taskKey(t)], now) >= STUCK_DAYS)
  const focusProjects = new Set(projects.filter((p) => p.focus.length).map((p) => p.note.id))
  const stalled = projects.filter((p) => !p.open.length)
  const areas = useMemo(() => {
    const by = new Map<string, Project[]>()
    for (const p of projects) by.set(p.note.folder, [...(by.get(p.note.folder) ?? []), p])
    return [...by]
  }, [projects])

  const total = week.done.length + week.triage
  const share = total ? Math.round((week.focus.length / total) * 100) : 0
  const verdict = !tag
    ? 'Focus is off (no focus tag in Settings → General), so nothing is counted as focus.'
    : !total
      ? 'Nothing finished yet this week.'
      : !week.focus.length
        ? 'None of the finished tasks was focus work. Protect the first block of each day next week, or cut the focus into smaller next actions.'
        : share < 20
          ? `About ${share}% of what you finished was focus work. Urgent work took most of the week.`
          : `About ${share}% of what you finished was focus work.`

  return (
    <div className="page" ref={root} tabIndex={-1}>
      <div className="page-inner list tasks review" style={pageWidth}>
        <header className="list-head">
          <span className="list-icon">
            <CalendarCheck size={20} />
          </span>
          <div className="list-title">
            <h1>Weekly review</h1>
            <p>
              {shortDate(from)} to {shortDate(to)}
              {weeksBack === 0 ? ' · this week' : weeksBack === 1 ? ' · last week' : ` · ${weeksBack} weeks ago`}
            </p>
          </div>
          <button className="icon-btn" title="The week before" onClick={() => setWeeksBack(weeksBack + 1)}>
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn" title="The week after" disabled={weeksBack === 0} onClick={() => setWeeksBack(Math.max(0, weeksBack - 1))}>
            <ChevronRight size={16} />
          </button>
        </header>

        <section className="review-section">
          <h2>The week</h2>
          <div className="review-tiles">
            <div className="review-tile">
              <b>{week.done.length}</b>
              <span>done in your notes</span>
            </div>
            <div className={cx('review-tile', tag && 'focus')}>
              <b>{week.focus.length}</b>
              <span>of them focus work</span>
            </div>
            {week.hasTriage && (
              <div className="review-tile">
                <b>{week.triage}</b>
                <span>completed in Triage</span>
              </div>
            )}
          </div>
          <p className={cx('review-verdict', tag && total > 0 && share < 20 && 'warn')}>{verdict}</p>
          {week.hasTriage && (
            <p className="review-note">
              Triage counts what was completed in the triage note itself, from the {week.triageRuns} run{week.triageRuns === 1 ? '' : 's'} still in it; tasks moved out with M count where they were finished.
            </p>
          )}
          {week.focus.length > 0 && (
            <div className="day-tasks-body review-list">
              {week.focus.map((t) => notes[t.noteId] && <TaskRow key={`${t.noteId}:${t.line}`} task={t} note={notes[t.noteId]} />)}
            </div>
          )}
        </section>

        {tag && (
          <section className="review-section">
            <h2>
              <Target size={15} /> Focus now
            </h2>
            {!focusOpen.length ? (
              <p className="review-note">No open focus tasks. Choose next week’s below: star the next action of the two or three projects that matter most.</p>
            ) : (
              <>
                {focusProjects.size > 3 && <p className="review-verdict warn">{focusProjects.size} projects have focus tasks. Two or three keep the word meaningful.</p>}
                <div className="day-tasks-body review-list">
                  {focusOpen.map((t) => {
                    const first = since[taskKey(t)]
                    const age = first ? daysBetween(first, now) : 0
                    return (
                      notes[t.noteId] && (
                        <div key={`${t.noteId}:${t.line}`} className={cx('review-row', age >= STUCK_DAYS && 'stuck')}>
                          <TaskRow task={t} note={notes[t.noteId]} />
                          <span className="review-age" title={first ? `First seen as a focus task on ${shortDate(first)} (on this computer)` : ''}>
                            {age >= STUCK_DAYS ? `Not moved in ${age} days` : age > 0 ? `${age} day${age === 1 ? '' : 's'}` : 'New'}
                          </span>
                        </div>
                      )
                    )
                  })}
                </div>
                {stuck.length > 0 && (
                  <p className="review-note">
                    A focus task open for two weeks is too vague (rewrite it as something you could start in five minutes) or not really important (press F on it, or untick the star below, to let it go). Both are fine; leaving it stuck is not.
                  </p>
                )}
              </>
            )}
          </section>
        )}

        <section className="review-section">
          <h2>Projects</h2>
          <p className="review-note">
            Every project note with tasks, outside {settings.archiveFolder || 'Archive'}. {stalled.length ? `${stalled.length} ${stalled.length === 1 ? 'has' : 'have'} no open task: write the next step, or archive it if it is finished. ` : 'Each has a next step. '}
            {tag ? 'Star a next action to make it a focus task for next week.' : ''}
          </p>
          {!projects.length && <p className="empty-hint">No projects yet: a project is a note in a notebook of your own (such as Work) with tasks in it.</p>}
          {areas.map(([area, list]) => (
            <div key={area} className="review-area">
              <h3>{area || 'Top level'}</h3>
              {list.map((p) => (
                <div key={p.note.id} className={cx('review-project', !p.open.length && 'stalled', p.focus.length > 0 && 'has-focus')}>
                  <div className="review-project-head">
                    <button className="review-project-title" onClick={() => openNote(p.note.id)} title="Open the project note">
                      <FileText size={14} /> {displayTitle(p.note)}
                    </button>
                    <span className="review-progress" title={`${p.done} of ${p.total} tasks finished`}>
                      <span className="review-bar">
                        <span style={{ width: `${Math.round((p.done / Math.max(1, p.total)) * 100)}%` }} />
                      </span>
                      {p.done}/{p.total}
                    </span>
                    {p.lastDone && <span className="review-last">last done {shortDate(p.lastDone)}</span>}
                  </div>
                  {p.open.length ? (
                    <div className="review-next">
                      <span className="review-label">Next</span>
                      {p.next ? (
                        <>
                          <span className="review-next-text" dangerouslySetInnerHTML={{ __html: renderInline(tag ? withTag(p.next.text, tag, false) : p.next.text) }} />
                          {tag && (
                            <button className={cx('icon-btn sm', isFocus(p.next, tag) && 'active')} title={isFocus(p.next, tag) ? 'A focus task. Click to take it out of focus.' : 'Make this a focus task'} onClick={() => toggleFocus(p.next!)}>
                              <Star size={14} fill={isFocus(p.next, tag) ? 'currentColor' : 'none'} />
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="review-next-text muted">Only Someday tasks left</span>
                      )}
                      {p.focus.filter((t) => t !== p.next).map((t) => (
                        <span key={t.line} className="review-chip" title="Another focus task in this project">
                          <Target size={11} /> {plain(t.text)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="review-next">
                      <span className="review-label warn">Stalled</span>
                      <span className="review-next-text muted">No open task.</span>
                      <button className="btn sm" onClick={() => void addProjectTask(p, false)}>
                        <Plus size={13} /> Write the next step
                      </button>
                      {tag && (
                        <button className="btn sm" onClick={() => void addProjectTask(p, true)}>
                          <Target size={13} /> …as a focus task
                        </button>
                      )}
                      <button className="btn sm" title={`Move the note to ${settings.archiveFolder || 'Archive'}`} onClick={() => void archiveProject(p.note)}>
                        <Archive size={13} /> Archive
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
