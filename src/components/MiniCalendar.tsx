import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { go, openDaily, useStore } from '../store'
import { addDays, cx, firstWeekday, isYmd, local, longDate, parseYmd, today, ymd } from '../lib/util'

/** A small month calendar for the sidebar. Click a day to open (or start) its daily note. */
export function MiniCalendar() {
  const notes = useStore((s) => s.notes)
  const route = useStore((s) => s.route)
  const weekStart = useStore((s) => s.settings.weekStart)
  const [open, setOpen] = useState(() => local.get('miniCalendar', true))
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const start = weekStart === 'sunday' ? 0 : weekStart === 'monday' ? 1 : firstWeekday()

  const dailies = useMemo(() => {
    const set = new Set<string>()
    for (const n of Object.values(notes)) if (n.type === 'daily' && isYmd(n.title)) set.add(n.title)
    return set
  }, [notes])
  const current = route.name === 'note' ? notes[route.id] : undefined
  const selected = current?.type === 'daily' ? current.title : ''

  // Follow along when a daily note from another month is opened.
  useEffect(() => {
    if (selected) setMonth(selected.slice(0, 7))
  }, [selected])

  const days = useMemo(() => {
    const first = parseYmd(month + '-01')
    const from = addDays(ymd(first), -((first.getDay() - start + 7) % 7))
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate() + ((first.getDay() - start + 7) % 7) > 35 ? 42 : 35
    return Array.from({ length: count }, (_, i) => addDays(from, i))
  }, [month, start])

  const shift = (n: number) => {
    const d = parseYmd(month + '-01')
    d.setMonth(d.getMonth() + n)
    setMonth(ymd(d).slice(0, 7))
  }
  const toggle = () => {
    local.set('miniCalendar', !open)
    setOpen(!open)
  }
  const letters = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + start + i).toLocaleDateString(undefined, { weekday: 'narrow' }))

  return (
    <div className="nav-group mini-cal">
      <div className="nav-head">
        <button className="mini-cal-title" onClick={toggle} title={open ? 'Hide calendar' : 'Show calendar'}>
          <ChevronDown size={12} style={{ transform: open ? undefined : 'rotate(-90deg)' }} />
          {open ? parseYmd(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Calendar'}
        </button>
        {open && (
          <span className="mini-cal-nav">
            <button className="icon-btn xs" title="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft size={13} />
            </button>
            <button className="mini-cal-today" title="This month" onClick={() => setMonth(today().slice(0, 7))} onDoubleClick={() => go({ name: 'calendar' })}>
              Today
            </button>
            <button className="icon-btn xs" title="Next month" onClick={() => shift(1)}>
              <ChevronRight size={13} />
            </button>
          </span>
        )}
      </div>
      {open && (
        <div className="mini-cal-grid">
          {letters.map((l, i) => (
            <span key={i} className="mini-cal-dow">
              {l}
            </span>
          ))}
          {days.map((day) => (
            <button
              key={day}
              className={cx('mini-cal-day', day.slice(0, 7) !== month && 'outside', day === today() && 'today', day === selected && 'selected', dailies.has(day) && 'has-note')}
              title={`${longDate(day)}${dailies.has(day) ? '' : ' · start daily note'}`}
              onClick={() => openDaily(day)}
            >
              {Number(day.slice(8))}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
