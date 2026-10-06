import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Note } from '../types'
import { openDaily, openNote, useStore } from '../store'
import { parseCanvas, splitContent } from '../lib/canvas'
import { addDays, cx, displayTitle, firstWeekday, isYmd, longDate, parseYmd, today, ymd } from '../lib/util'
import { NoteIcon } from './bits'
import { Preview } from './Preview'

export function CalendarView() {
  const notes = useStore((s) => s.notes)
  const [selected, setSelected] = useState(today())
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const grid = useRef<HTMLDivElement>(null)
  const weekStart = useStore((s) => s.settings.weekStart)
  const start = weekStart === 'sunday' ? 0 : weekStart === 'monday' ? 1 : firstWeekday()

  const { dailies, byDay } = useMemo(() => {
    const dailies = new Map<string, Note>()
    const byDay = new Map<string, Note[]>()
    for (const n of Object.values(notes)) {
      if (n.type === 'daily' && isYmd(n.title)) {
        dailies.set(n.title, n)
        continue
      }
      const day = ymd(new Date(n.created))
      byDay.set(day, [...(byDay.get(day) || []), n])
    }
    return { dailies, byDay }
  }, [notes])

  const days = useMemo(() => {
    const first = parseYmd(month + '-01')
    const offset = (first.getDay() - start + 7) % 7
    const from = addDays(ymd(first), -offset)
    return Array.from({ length: 42 }, (_, i) => addDays(from, i))
  }, [month, start])

  const select = (day: string) => {
    setSelected(day)
    setMonth(day.slice(0, 7))
  }
  const shiftMonth = (n: number) => {
    const d = parseYmd(month + '-01')
    d.setMonth(d.getMonth() + n)
    setMonth(ymd(d).slice(0, 7))
  }

  useEffect(() => grid.current?.focus(), [])

  const daily = dailies.get(selected)
  const created = byDay.get(selected) || []
  const dailyParts = daily ? splitContent(daily.content) : null
  const cards = dailyParts ? parseCanvas(dailyParts.canvas).cards : []
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + start + i).toLocaleDateString(undefined, { weekday: 'short' }))

  return (
    <div className="page calendar-page">
      <div className="calendar">
        <header className="cal-head">
          <h1>{parseYmd(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h1>
          <div className="cal-nav">
            <button className="btn" onClick={() => select(today())}>
              Today
            </button>
            <button className="icon-btn" onClick={() => shiftMonth(-1)} title="Previous month">
              <ChevronLeft size={17} />
            </button>
            <button className="icon-btn" onClick={() => shiftMonth(1)} title="Next month">
              <ChevronRight size={17} />
            </button>
          </div>
        </header>
        <div className="cal-weekdays">
          {weekdays.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div
          className="cal-grid"
          ref={grid}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
            if (step) (e.preventDefault(), select(addDays(selected, step)))
            else if (e.key === 'Enter') openDaily(selected)
            else if (e.key === 't') select(today())
          }}
        >
          {days.map((day) => {
            const d = dailies.get(day)
            const others = byDay.get(day) || []
            return (
              <button
                key={day}
                tabIndex={-1}
                className={cx('cal-day', day.slice(0, 7) !== month && 'outside', day === today() && 'today', day === selected && 'selected')}
                onClick={() => select(day)}
                onDoubleClick={() => openDaily(day)}
              >
                <span className="cal-num">
                  {Number(day.slice(8))}
                  {d && <i className="dot" title="Daily note" />}
                </span>
                {others.slice(0, 2).map((n) => (
                  <span key={n.id} className="cal-note">
                    {displayTitle(n)}
                  </span>
                ))}
                {others.length > 2 && <span className="cal-more">+{others.length - 2} more</span>}
              </button>
            )
          })}
        </div>
        <p className="cal-hint">Arrow keys move between days · Enter opens the daily note · T jumps to today</p>
      </div>

      <aside className="cal-side">
        <h2>{longDate(selected)}</h2>
        <button className="btn primary" onClick={() => openDaily(selected)}>
          {daily ? 'Open daily note' : 'Start daily note'} <ArrowRight size={15} />
        </button>

        {daily && (
          <div className="cal-preview">
            {dailyParts!.page.trim() && <Preview source={dailyParts!.page} className="compact" />}
            {cards.length > 0 && (
              <>
                <div className="cal-label">
                  {cards.length} canvas card{cards.length === 1 ? '' : 's'}
                </div>
                {cards.slice(0, 4).map((c) => (
                  <div key={c.id} className={cx('cal-card', c.color && `c-${c.color}`)}>
                    <Preview source={c.text} className="compact" />
                  </div>
                ))}
              </>
            )}
            {!dailyParts!.page.trim() && !cards.length && <p className="pane-empty">The daily note is empty.</p>}
          </div>
        )}

        {created.length > 0 && (
          <>
            <div className="cal-label">Created this day</div>
            <div className="mini-list">
              {created.map((n) => (
                <button key={n.id} className="mini-row" onClick={() => openNote(n.id)}>
                  <NoteIcon note={n} size={15} />
                  <span className="mini-title">{displayTitle(n)}</span>
                  <span className="mini-meta">{n.folder}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {!daily && !created.length && <p className="pane-empty">Nothing on this day yet.</p>}
      </aside>
    </div>
  )
}
