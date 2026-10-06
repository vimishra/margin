import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ui, useStore } from '../store'
import { parseDatePhrase } from '../lib/dates'
import { weekRange } from '../lib/tasks'
import { addDays, cx, firstWeekday, longDate, parseYmd, today, ymd } from '../lib/util'

/** A small month calendar with a box for typing a day in words. Opened with openDatePicker(). */
export function DatePicker() {
  const pick = useStore((s) => s.datePick)
  if (!pick) return null
  return <Picker key={`${pick.x}:${pick.y}:${pick.title}`} />
}

function Picker() {
  const pick = useStore((s) => s.datePick)!
  const { weekStart, dayFirst } = useStore((s) => s.settings)
  const start = weekStart === 'sunday' ? 0 : weekStart === 'monday' ? 1 : firstWeekday()
  const now = today()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: 0 })
  const [text, setText] = useState('')
  // The day that Enter will choose: moved with the arrow keys, or set by what is typed.
  const [cursor, setCursor] = useState(pick.value || now)
  const [month, setMonth] = useState(cursor.slice(0, 7))
  const typed = text.trim() ? parseDatePhrase(text, dayFirst) : null
  const invalid = !!text.trim() && !typed

  useLayoutEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(pick.alignRight ? pick.x - width : pick.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(pick.y, window.innerHeight - height - 8)),
    })
  }, [pick])

  const days = useMemo(() => {
    const first = parseYmd(month + '-01')
    const lead = (first.getDay() - start + 7) % 7
    const from = addDays(ymd(first), -lead)
    return Array.from({ length: 42 }, (_, i) => addDays(from, i))
  }, [month, start])
  const letters = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + start + i).toLocaleDateString(undefined, { weekday: 'narrow' }))

  const close = () => ui({ datePick: null })
  const choose = (date: string | null) => {
    close()
    pick.onPick(date)
  }
  const move = (date: string) => {
    setCursor(date)
    setMonth(date.slice(0, 7))
  }
  const shift = (n: number) => {
    const d = parseYmd(month + '-01')
    d.setMonth(d.getMonth() + n)
    setMonth(ymd(d).slice(0, 7))
  }
  const nextWeek = addDays(weekRange(now, start)[0], 7)
  const quick: [string, string][] = [
    ['Today', now],
    ['Tomorrow', addDays(now, 1)],
    ['Next week', nextWeek],
  ]

  return (
    <div className="menu-layer" onMouseDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
      <div ref={ref} className="menu date-pick" style={pos} onMouseDown={(e) => e.stopPropagation()}>
        <div className="date-pick-title">{pick.title}</div>
        <input
          autoFocus
          className={cx(invalid && 'invalid')}
          value={text}
          placeholder="Type a day: fri, 14 oct, in 3 days…"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            const date = e.target.value.trim() ? parseDatePhrase(e.target.value, dayFirst) : null
            if (date) move(date)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), close())
            else if (e.key === 'Enter') {
              e.preventDefault()
              if (!invalid) choose(cursor)
            } else if (e.key === 'ArrowDown') (e.preventDefault(), move(addDays(cursor, 7)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), move(addDays(cursor, -7)))
            // Left and right move by a day unless there is text to move through.
            else if (e.key === 'ArrowRight' && !text) (e.preventDefault(), move(addDays(cursor, 1)))
            else if (e.key === 'ArrowLeft' && !text) (e.preventDefault(), move(addDays(cursor, -1)))
            else if (e.key === 'PageDown') (e.preventDefault(), shift(1))
            else if (e.key === 'PageUp') (e.preventDefault(), shift(-1))
          }}
        />
        <div className={cx('date-pick-reads', invalid && 'invalid')}>{invalid ? 'Not a date Margin understands' : `${longDate(cursor)}  ·  ↵ to set`}</div>
        <div className="date-pick-quick">
          {quick.map(([label, date]) => (
            <button key={label} className={cx('chip', pick.value === date && 'active')} onClick={() => choose(date)}>
              {label}
            </button>
          ))}
        </div>
        <div className="date-pick-head">
          <span>{parseYmd(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button className="icon-btn xs" title="Previous month  PgUp" tabIndex={-1} onClick={() => shift(-1)}>
            <ChevronLeft size={14} />
          </button>
          <button className="icon-btn xs" title="Next month  PgDn" tabIndex={-1} onClick={() => shift(1)}>
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="mini-cal-grid">
          {letters.map((l, i) => (
            <span key={i} className="mini-cal-dow">
              {l}
            </span>
          ))}
          {days.map((day) => (
            <button
              key={day}
              tabIndex={-1}
              className={cx('mini-cal-day', day.slice(0, 7) !== month && 'outside', day === now && 'today', day === cursor && 'selected', day === pick.value && 'current')}
              title={longDate(day)}
              onClick={() => choose(day)}
            >
              {Number(day.slice(8))}
            </button>
          ))}
        </div>
        {pick.value && (
          <button className="date-pick-remove" onClick={() => choose(null)}>
            {pick.removeLabel || 'Remove date'}
          </button>
        )}
      </div>
    </div>
  )
}
