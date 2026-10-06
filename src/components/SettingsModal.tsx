import { createContext, useContext, useState } from 'react'
import { CalendarDays, Search, LayoutTemplate, FolderCog, Keyboard, Palette, PenLine, RotateCcw, Settings2, SlidersHorizontal, Type, X, Zap } from 'lucide-react'
import {
  ACCENTS,
  formatDate,
  setAttachmentsFolder,
  importFromObsidian,
  meetingTemplate,
  newTemplate,
  openNote,
  templates,
  DEFAULT_STYLES,
  STYLE_KEYS,
  WIDTHS,
  resetSettings,
  setPref,
  setSetting,
  toast,
  ui,
  useStore,
  type Mode,
  type Settings,
  type StyleKey,
  type TextStyle,
  type Theme,
} from '../store'
import { FIXED_SHORTCUTS } from '../commands'
import { SHORTCUT_DEFS, defaultCombo, eventCombo, formatCombo, isUsable, recording, syncDesktopMenu } from '../shortcuts'
import { cx } from '../lib/util'
import { desktop, fileManager } from '../desktop'
import { FontPicker } from './FontPicker'

type Section = 'general' | 'appearance' | 'styles' | 'editor' | 'daily' | 'templates' | 'capture' | 'files' | 'shortcuts'

const SECTIONS: [Section, string, React.ReactNode][] = [
  ['general', 'General', <SlidersHorizontal size={16} />],
  ['appearance', 'Appearance', <Palette size={16} />],
  ['styles', 'Text styles', <Type size={16} />],
  ['editor', 'Editor', <PenLine size={16} />],
  ['daily', 'Daily notes', <CalendarDays size={16} />],
  ['templates', 'Templates & meetings', <LayoutTemplate size={16} />],
  ['capture', 'Capture & scratch', <Zap size={16} />],
  ['files', 'Files & data', <FolderCog size={16} />],
  ['shortcuts', 'Shortcuts', <Keyboard size={16} />],
]

/** What is being searched for in settings; rows that do not mention it hide themselves. */
const SearchContext = createContext('')
const matchesSearch = (query: string, text: string) => {
  const haystack = text.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}

function Row({ label, hint, children, stack }: { label: string; hint?: string; children: React.ReactNode; stack?: boolean }) {
  const query = useContext(SearchContext)
  if (query && !matchesSearch(query, `${label} ${hint || ''}`)) return null
  return (
    <div className={cx('set-row', stack && 'stack')}>
      <div className="set-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Select<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <select
      className="set-select"
      value={String(value)}
      onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}
    >
      {options.map(([v, label]) => (
        <option key={String(v)} value={String(v)}>
          {label}
        </option>
      ))}
    </select>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg sm">
      {options.map(([v, label]) => (
        <button key={v} className={cx(value === v && 'on')} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={value} aria-label={label} className={cx('switch', value && 'on')} onClick={() => onChange(!value)} />
}

function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  return (
    <div className="stepper">
      <button onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label="Decrease">
        −
      </button>
      <input
        key={value}
        defaultValue={Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')}
        inputMode="decimal"
        onBlur={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n !== value) onChange(clamp(n))
          else e.target.value = String(value)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {unit && <span className="unit">{unit}</span>}
      <button onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label="Increase">
        +
      </button>
    </div>
  )
}

function Text({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <input
      key={value}
      className="set-text"
      defaultValue={value}
      placeholder={placeholder}
      spellCheck={false}
      onBlur={(e) => {
        const v = e.target.value.trim().replace(/^\/+|\/+$/g, '')
        if (v && v !== value) onChange(v)
        else e.target.value = value
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function ShortcutEditor({ filter }: { filter?: string }) {
  const overrides = useStore((st) => st.settings.shortcuts) || {}
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [ownQuery, setQuery] = useState('')
  // Inside the settings-wide search the query comes from outside and only matching shortcuts are listed.
  const embedded = filter !== undefined
  const query = embedded ? filter : ownQuery
  const current = (id: string) => (id in overrides ? overrides[id] : defaultCombo(SHORTCUT_DEFS.find((d) => d.id === id)!))

  const save = (next: Record<string, string>) => {
    setSetting('shortcuts', next)
    syncDesktopMenu()
  }
  const stop = () => {
    recording.active = false
    setRecordingId(null)
  }
  const assign = (id: string, combo: string) => {
    const next = { ...overrides, [id]: combo }
    // A combination can only do one thing: take it away from whatever had it.
    const clash = combo && SHORTCUT_DEFS.find((d) => d.id !== id && current(d.id) === combo)
    if (clash) {
      next[clash.id] = ''
      toast(`${formatCombo(combo)} was “${clash.label}”. That action now has no shortcut.`)
    }
    const def = SHORTCUT_DEFS.find((d) => d.id === id)!
    if (next[id] === defaultCombo(def)) delete next[id]
    save(next)
  }
  const reset = (id: string) => {
    const next = { ...overrides }
    delete next[id]
    save(next)
  }

  const onKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (recordingId !== id) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return stop()
    if (e.key === 'Backspace' || e.key === 'Delete') {
      assign(id, '')
      return stop()
    }
    const combo = eventCombo(e.nativeEvent)
    if (!combo) return
    if (!isUsable(combo)) return toast('Include ⌘, Ctrl or ⌥ so the shortcut does not fire while typing')
    assign(id, combo)
    stop()
  }

  let group = ''
  const changed = Object.keys(overrides).length > 0
  // Match on the action's name, its group, or its keys ("⌘N", "cmd n", "alt").
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (def: (typeof SHORTCUT_DEFS)[number]) => {
    const combo = current(def.id)
    const haystack = `${def.label} ${def.group} ${formatCombo(combo)} ${combo.replace(/\+/g, ' ').replace('Mod', 'Mod Cmd Command Ctrl Control').replace('Alt', 'Alt Option Opt')}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  }
  const shown = SHORTCUT_DEFS.filter(matches)
  if (embedded && !shown.length) return null
  return (
    <>
      <p className="set-note" style={{ marginTop: 0 }} hidden={embedded}>
        Click a shortcut, then press the new keys. Backspace removes it, Esc cancels.
        {changed && (
          <>
            {' '}
            <button className="link" onClick={() => save({})}>
              Reset all to defaults
            </button>
          </>
        )}
      </p>
      <label className="filter key-search" hidden={embedded}>
        <Search size={15} />
        <input autoFocus value={query} placeholder="Search shortcuts by name or keys…" spellCheck={false} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), setQuery(''))} />
        {query && (
          <button className="icon-btn xs" title="Clear" onClick={() => setQuery('')}>
            <X size={12} />
          </button>
        )}
      </label>
      {shown.length === 0 && <p className="pane-empty">No shortcut matches “{query}”.</p>}
      {shown.map((def) => {
        const combo = current(def.id)
        const isChanged = def.id in overrides
        const header = def.group !== group
        group = def.group
        return (
          <div key={def.id}>
            {header && <div className="key-group">{def.group}</div>}
            <div className="key-row">
              <span>{def.label}</span>
              <button
                className={cx('key-btn', !combo && 'none', isChanged && 'changed', recordingId === def.id && 'recording')}
                onClick={() => {
                  recording.active = true
                  setRecordingId(def.id)
                }}
                onBlur={() => recordingId === def.id && stop()}
                onKeyDown={(e) => onKeyDown(e, def.id)}
              >
                {recordingId === def.id ? 'Press keys…' : combo ? formatCombo(combo) : 'None'}
              </button>
              <button className={cx('icon-btn sm', isChanged && 'show')} title="Back to default" onClick={() => reset(def.id)} tabIndex={isChanged ? 0 : -1}>
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        )
      })}
      {!query && <p className="set-note">These are built into the editor and the canvas and cannot be changed:</p>}
      {!query && (
        <div className="help-grid">
          {FIXED_SHORTCUTS.map(([name, rows]) => (
            <section key={name}>
              <h3>{name}</h3>
              {rows.map(([keys, label]) => (
                <div key={keys} className="help-row">
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )
}

/** The theme's normal text colour as #rrggbb, for the colour picker's starting point. */
function textColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--text').trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#1f1e1b'
}

export function SettingsModal() {
  const s = useStore((st) => st.settings)
  const theme = useStore((st) => st.theme)
  const mode = useStore((st) => st.mode)
  const width = useStore((st) => st.width)
  const vault = useStore((st) => st.vault)
  const attachmentsFolder = useStore((st) => st.attachmentsFolder)
  const pane = useStore((st) => st.pane)
  const noteCount = useStore((st) => Object.keys(st.notes).length)
  const folderCount = useStore((st) => st.folders.length)
  const [section, setSection] = useState<Section>('general')
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const show = (id: Section) => searching || section === id
  const close = () => ui({ prefs: false })
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => setSetting(key, value)
  const presetWidth = WIDTHS.some(([, n]) => n === width)

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="modal settings" tabIndex={-1} ref={(el) => el && !el.contains(document.activeElement) && el.focus()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <nav className="set-nav">
          <h2>
            <Settings2 size={16} /> Settings
          </h2>
          <label className="filter set-search">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              placeholder="Search settings"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.stopPropagation()
                  setQuery('')
                }
              }}
            />
            {query && (
              <button className="icon-btn xs" title="Clear" onClick={() => setQuery('')}>
                <X size={12} />
              </button>
            )}
          </label>
          {SECTIONS.map(([id, label, icon]) => (
            <button key={id} className={cx('nav-item', !searching && section === id && 'active')} onClick={() => (setQuery(''), setSection(id))}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="set-main">
          <header>
            <h3>{searching ? `Results for “${query.trim()}”` : SECTIONS.find(([id]) => id === section)![1]}</h3>
            <button className="icon-btn" onClick={close} title="Close">
              <X size={16} />
            </button>
          </header>
          <div className={cx('set-body', searching && 'searching')}>
            <SearchContext.Provider value={searching ? query : ''}>
            {show('general') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">General</h4>}
                <Row label="When Margin opens" hint="What you see first when you open the app.">
                  <Select value={s.startPage} onChange={set('startPage')} options={[['home', 'Home'], ['today', "Today's daily note"], ['last', 'The note I had open last']]} />
                </Row>
                <Row label="New notes go to" hint="Where a new note is created when you press New note.">
                  <Select value={s.newNoteFolder} onChange={set('newNoteFolder')} options={[['current', 'The notebook I am in'], ['root', 'Top level, no notebook'], ['inbox', 'The Inbox notebook']]} />
                </Row>
                <Row label="Inbox notebook" hint="Used for quick captures and, if chosen above, new notes.">
                  <Text value={s.inboxFolder} onChange={set('inboxFolder')} />
                </Row>
                <Row label="Week starts on" hint="For the calendar.">
                  <Segmented value={s.weekStart} onChange={set('weekStart')} options={[['auto', 'Auto'], ['sunday', 'Sunday'], ['monday', 'Monday']]} />
                </Row>
                <Row label="Calendar in the sidebar" hint="A small month calendar; click a day to open its daily note.">
                  <Toggle label="Calendar in the sidebar" value={s.sidebarCalendar} onChange={set('sidebarCalendar')} />
                </Row>
                <Row label="Time format" hint="Used for timestamps on captures and for {{time}} in templates.">
                  <Segmented value={s.timeFormat} onChange={set('timeFormat')} options={[['24', '24-hour · 16:54'], ['12', '12-hour · 4:54 PM']]} />
                </Row>
                <Row label="Typed dates" hint="How a date like 06/10 is read when you type it in search or a link.">
                  <Segmented value={s.dayFirst ? 'dmy' : 'mdy'} onChange={(v) => setSetting('dayFirst', v === 'dmy')} options={[['dmy', 'Day first · 6 Oct'], ['mdy', 'Month first · Jun 10']]} />
                </Row>
                <Row label="Open notes in tabs" hint="Keep a tab for every note you open. Turn off to keep only the current note.">
                  <Toggle label="Open notes in tabs" value={s.tabs} onChange={set('tabs')} />
                </Row>
              </div>
            )}

            {show('appearance') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Appearance</h4>}
                <Row label="Theme">
                  <Segmented value={theme} onChange={(v: Theme) => setPref('theme', v)} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
                </Row>
                <Row label="Accent colour">
                  <div className="swatches">
                    {ACCENTS.map(([id, label, color]) => (
                      <button key={id} title={label} aria-label={label} className={cx('accent-dot', s.accent === id && 'on')} style={{ background: color }} onClick={() => setSetting('accent', id)} />
                    ))}
                  </div>
                </Row>
                <Row label="Note font" hint="Any font installed on this computer. Used for note text and titles.">
                  <FontPicker value={s.font} onChange={set('font')} defaultLabel="System default" />
                </Row>
                <Row label="Code font" hint="Used for code blocks, inline code and markdown source.">
                  <FontPicker value={s.codeFont} onChange={set('codeFont')} defaultLabel="System monospace" preferMono />
                </Row>
                <Row label="Text size">
                  <Stepper value={s.fontSize} min={12} max={24} unit="px" onChange={set('fontSize')} />
                </Row>
                <Row label="Text weight" hint="400 is regular, 700 is bold. In-between values need a variable font, such as the system default or Inter.">
                  <div className="slider">
                    <input type="range" min={300} max={700} step={10} value={s.fontWeight} aria-label="Text weight" onChange={(e) => setSetting('fontWeight', Number(e.target.value))} />
                    <output>{s.fontWeight}</output>
                    {s.fontWeight !== 400 && (
                      <button className="btn ghost sm" onClick={() => setSetting('fontWeight', 400)}>
                        Reset
                      </button>
                    )}
                  </div>
                </Row>
                <Row label="Line spacing">
                  <Segmented
                    value={String(s.lineHeight)}
                    onChange={(v) => setSetting('lineHeight', Number(v))}
                    options={[['1.45', 'Compact'], ['1.7', 'Comfortable'], ['1.95', 'Relaxed']]}
                  />
                </Row>
                <Row label="List indent" hint="How far each level of a nested list is indented. Bullets and numbers use the Heading 2 colour from Text styles.">
                  <Stepper value={s.listIndent} min={12} max={80} step={4} unit="px" onChange={set('listIndent')} />
                </Row>
                <Row label="Indent guides" hint="A faint vertical line down each level of a nested list.">
                  <Toggle label="Indent guides" value={s.indentGuides} onChange={set('indentGuides')} />
                </Row>
                <Row label="Image border" hint="Separates images from the page. Useful for screenshots with a white background.">
                  <Segmented value={s.imageBorder} onChange={set('imageBorder')} options={[['none', 'None'], ['hairline', 'Hairline'], ['shadow', 'Shadow']]} />
                </Row>
                <Row label="Page width" hint="How many characters fit on one line of a note.">
                  <Select
                    value={presetWidth ? width : -1}
                    onChange={(n) => n >= 0 && setPref('width', n)}
                    options={[...WIDTHS.map(([label, n]): [number, string] => [n, n ? `${label} · ${n}` : label]), ...(presetWidth ? [] : [[-1, `Custom · ${width}`] as [number, string]])]}
                  />
                  {width > 0 && <Stepper value={width} min={40} max={400} step={5} unit="ch" onChange={(n) => setPref('width', n)} />}
                </Row>
                <div className="set-sample" style={{ fontFamily: 'var(--doc-font)', fontSize: 'var(--doc-size)', fontWeight: 'var(--doc-weight)' as never, lineHeight: 'var(--doc-leading)' }}>
                  <b>Preview.</b> The quick brown fox jumps over the lazy dog. Notes link to each other with <span className="cm-wikilink-pill">double brackets</span>.
                </div>
              </div>
            )}

            {show('styles') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Text styles</h4>}
                <p className="set-note" style={{ marginTop: 0 }}>
                  Sizes are a percentage of the note text size. A custom colour is used in both the light and the dark theme, so pick one that reads well on both.
                </p>
                {STYLE_KEYS.map(([key, label]) => {
                  if (searching && !matchesSearch(query, `${label} text style colour color size heading bold italic`)) return null
                  const style = { ...DEFAULT_STYLES[key], ...s.styles?.[key] }
                  const update = (patch: Partial<TextStyle>) => setSetting('styles', { ...DEFAULT_STYLES, ...s.styles, [key]: { ...style, ...patch } } as Record<StyleKey, TextStyle>)
                  const sample: React.CSSProperties = {
                    fontSize: `${Math.min(style.size, 190) / 100}em`,
                    color: style.color || undefined,
                    fontWeight: key === 'italic' ? 'var(--doc-weight)' as never : 700,
                    fontStyle: key === 'italic' ? 'italic' : undefined,
                  }
                  return (
                    <div key={key} className="set-row style-row">
                      <div className="set-label">
                        <span style={sample}>{label}</span>
                      </div>
                      <div className="set-control">
                        <label className="color-pick" title="Colour">
                          <input type="color" value={style.color || textColor()} onChange={(e) => update({ color: e.target.value })} />
                          {style.color ? (
                            <>
                              {style.color}
                              <button title="Use the default colour" onClick={(e) => (e.preventDefault(), update({ color: '' }))}>
                                <X size={13} />
                              </button>
                            </>
                          ) : (
                            'Default'
                          )}
                        </label>
                        <Stepper value={style.size} min={60} max={300} step={5} unit="%" onChange={(size) => update({ size })} />
                      </div>
                    </div>
                  )
                })}
                <Row label="Reset text styles" hint="Put heading, bold and italic colours and sizes back to their defaults.">
                  <button className="btn sm" onClick={() => setSetting('styles', DEFAULT_STYLES)}>
                    Reset
                  </button>
                </Row>
              </div>
            )}

            {show('editor') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Editor</h4>}
                <Row label="Default editing mode" hint="Live preview renders markdown as you type. Source shows the raw markdown.">
                  <Select value={mode} onChange={(v: Mode) => setPref('mode', v)} options={[['edit', 'Live preview'], ['source', 'Markdown source'], ['read', 'Read-only']]} />
                </Row>
                <Row label="Formatting toolbar" hint="The row of buttons above the note for headings, lists, tables and attachments.">
                  <Toggle label="Formatting toolbar" value={s.toolbar} onChange={set('toolbar')} />
                </Row>
                <Row label="Spell check" hint="Underline misspelled words using your browser's dictionary.">
                  <Toggle label="Spell check" value={s.spellcheck} onChange={set('spellcheck')} />
                </Row>
                <Row label="Auto-close brackets and quotes" hint="Typing ( [ { or a quote inserts the closing one too.">
                  <Toggle label="Auto-close brackets" value={s.autoPair} onChange={set('autoPair')} />
                </Row>
                <Row label="Paste images at actual size" hint="A screenshot from a Retina display has twice the pixels it had on screen. With this on, it is shown at the size you saw, not doubled. You can change the number after the | in the image's markdown.">
                  <Toggle label="Paste images at actual size" value={s.imageActualSize} onChange={set('imageActualSize')} />
                </Row>
                <Row label="Line numbers in source mode">
                  <Toggle label="Line numbers" value={s.lineNumbers} onChange={set('lineNumbers')} />
                </Row>
                <Row label="Backlinks pane" hint="Show backlinks, outline and details beside each note.">
                  <Toggle label="Backlinks pane" value={pane} onChange={(v) => setPref('pane', v)} />
                </Row>
              </div>
            )}

            {show('templates') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Templates &amp; meetings</h4>}
                <Row label="Templates notebook" hint="Every note in this notebook is a template. Edit one like any other note.">
                  <Text value={s.templatesFolder} onChange={set('templatesFolder')} />
                </Row>
                <Row label="Your templates" hint="Templates can use {{date}}, {{time}}, {{day}} and {{title}}, filled in when a note is created. For a custom format write {{date:ddd, Do MMM}} or {{time:h:mmA}}, with the same tokens as Obsidian." stack>
                  <div className="template-list">
                    {templates().map((t) => (
                      <button key={t.id} className="chip" onClick={() => (ui({ prefs: false }), openNote(t.id))}>
                        {t.title}
                      </button>
                    ))}
                    <button className="btn sm" onClick={() => (ui({ prefs: false }), void newTemplate())}>
                      New template
                    </button>
                  </div>
                </Row>
                <Row label="Meeting notes notebook" hint="New meeting notes are saved here.">
                  <Text value={s.meetingsFolder} onChange={set('meetingsFolder')} />
                </Row>
                <Row label="File meetings by date" hint={`Sub-folders made from the meeting's date. ${s.meetingsSubfolder ? `Today's meetings go to ${s.meetingsFolder}/${formatDate(new Date(), s.meetingsSubfolder)}.` : 'Off: all meetings go straight into the notebook.'}`}>
                  <Select
                    value={s.meetingsSubfolder}
                    onChange={set('meetingsSubfolder')}
                    options={[
                      ['YYYY/MMM', 'Year / month · 2026/Oct'],
                      ['YYYY/MM', 'Year / month · 2026/10'],
                      ['YYYY/MM MMM', 'Year / month · 2026/10 Oct'],
                      ['YYYY-MM', 'Month · 2026-10'],
                      ['YYYY', 'Year · 2026'],
                      ['', 'Do not file by date'],
                    ]}
                  />
                </Row>
                <Row label="Link meetings from the daily note" hint="Add a timestamped link to each new meeting note in today's daily note.">
                  <Toggle label="Link meetings from the daily note" value={s.meetingLink} onChange={set('meetingLink')} />
                </Row>
                <Row label="Meeting template" hint="Used for every new meeting note. It is the template called “Meeting notes”.">
                  <button
                    className="btn sm"
                    onClick={async () => {
                      const t = await meetingTemplate()
                      if (t) (ui({ prefs: false }), openNote(t.id))
                    }}
                  >
                    Edit template
                  </button>
                </Row>
              </div>
            )}

            {show('daily') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Daily notes</h4>}
                <Row label="New daily notes open as" hint="Every daily note has both. This sets which one a new day starts on.">
                  <Segmented value={s.dailyView} onChange={set('dailyView')} options={[['canvas', 'Canvas'], ['page', 'Page']]} />
                </Row>
                <Row label="Daily notes notebook" hint="New daily notes are saved here as YYYY-MM-DD.md. Existing ones stay where they are.">
                  <Text value={s.dailyFolder} onChange={set('dailyFolder')} />
                </Row>
                <Row label="Template for new daily notes" hint="Markdown placed on the page of each new daily note. Leave empty for a blank page." stack>
                  <textarea
                    key={s.dailyTemplate}
                    className="set-textarea"
                    defaultValue={s.dailyTemplate}
                    rows={5}
                    placeholder={'## Plan\n\n- [ ] \n\n## Notes\n'}
                    spellCheck={false}
                    onBlur={(e) => e.target.value !== s.dailyTemplate && setSetting('dailyTemplate', e.target.value)}
                  />
                </Row>
              </div>
            )}

            {show('capture') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Capture &amp; scratch</h4>}
                <Row label="Quick capture saves to" hint="The destination selected when quick capture opens. Tab switches it for one capture.">
                  <Select value={s.captureTarget} onChange={set('captureTarget')} options={[['daily', "Today's daily note"], ['scratch', 'A new scratch note'], ['inbox', 'A new note in the Inbox']]} />
                </Row>
                <Row label="Timestamp captures" hint="Start page captures in the daily note with the time, like 14:05.">
                  <Toggle label="Timestamp captures" value={s.captureTime} onChange={set('captureTime')} />
                </Row>
                <Row label="Scratch notes expire after" hint="Applies to new scratch notes. Expired notes move to the trash folder.">
                  <Select
                    value={s.scratchDays}
                    onChange={set('scratchDays')}
                    options={[[1, '1 day'], [3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '30 days'], [90, '90 days']]}
                  />
                </Row>
                <Row label="Scratch notebook" hint="Where new scratch notes are saved.">
                  <Text value={s.scratchFolder} onChange={set('scratchFolder')} />
                </Row>
              </div>
            )}

            {show('files') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Files &amp; data</h4>}
                <Row label="Notes folder" hint={desktop ? 'Every note is a markdown file in this folder. Changing it restarts Margin with the new folder; nothing is moved or deleted.' : 'Every note is a markdown file in this folder. To use another folder, start Margin with VAULT_DIR set, for example: VAULT_DIR=~/Notes npm start'} stack>
                  <div className="set-path">
                    <code>{vault || 'Unknown'}</code>
                    <button
                      className="btn sm"
                      onClick={() => navigator.clipboard.writeText(vault).then(() => toast('Path copied'), () => toast('Could not copy the path'))}
                    >
                      Copy path
                    </button>
                    {desktop && (
                      <>
                        <button className="btn sm" onClick={() => desktop!.revealVault()}>
                          Show in {fileManager}
                        </button>
                        <button className="btn sm primary" onClick={() => desktop!.chooseVault()}>
                          Change…
                        </button>
                      </>
                    )}
                  </div>
                </Row>
                <Row label="Attachments folder" hint="Where pasted and dropped images, PDFs and files are saved. Files already saved elsewhere stay where they are and keep working.">
                  <Text value={attachmentsFolder} onChange={(v) => void setAttachmentsFolder(v)} />
                </Row>
                <Row label="Name pasted images after the note" hint="A pasted image is saved as the note's title and the time, like “Atlas kickoff 2026-10-06 1654.png”, in place of “image-5d92af.png”. Files you drop in keep their own names.">
                  <Toggle label="Name pasted images after the note" value={s.imageNoteName} onChange={set('imageNoteName')} />
                </Row>
                <Row label="In this folder" hint="Version snapshots are in .history/, deleted notes in .trash/.">
                  <span className="set-value">
                    {noteCount} notes · {folderCount} notebooks
                  </span>
                </Row>
                <Row label="Version history" hint="A snapshot is kept for every 5 minutes of editing, up to 200 per note.">
                  <span className="set-value">Always on</span>
                </Row>
                <Row label="Import from Obsidian" hint="Copies an Obsidian vault into your notes folder: notes, images, PDFs and canvases. The Obsidian folder is not changed.">
                  <button className="btn sm" onClick={() => (ui({ prefs: false }), void importFromObsidian())}>
                    Import…
                  </button>
                </Row>
                <Row label="Reset settings" hint="Put every setting on this screen back to its default. Your notes are not touched.">
                  <button
                    className="btn sm"
                    onClick={() => {
                      resetSettings()
                      syncDesktopMenu()
                      toast('Settings reset to defaults')
                    }}
                  >
                    Reset to defaults
                  </button>
                </Row>
                <p className="set-note">Settings are stored {desktop ? 'by this app on this computer' : 'in this browser'}. Notes, attachments and history live in the folder above.</p>
              </div>
            )}

            {show('shortcuts') && (
              <div className="set-section">
                {searching && <h4 className="set-section-title">Shortcuts</h4>}
                <ShortcutEditor filter={searching ? query : undefined} />
              </div>
            )}
            </SearchContext.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}
