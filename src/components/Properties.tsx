// A note's properties, under its title: the fields of its front matter that are not Margin's own (status, owner,
// due, a list of people…). Each is edited in place by the kind of value it holds; changes are saved into the file's
// front matter, where other apps (Obsidian included) read them too.
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import type { Note, PropertyValue } from '../types'
import { ask, updateNote } from '../store'
import { local } from '../lib/util'

type Kind = 'text' | 'number' | 'date' | 'checkbox' | 'list'

const kindOf = (v: PropertyValue): Kind =>
  typeof v === 'boolean' ? 'checkbox' : typeof v === 'number' ? 'number' : Array.isArray(v) ? 'list' : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'date' : 'text'

const KINDS: [Kind, string][] = [
  ['text', 'Text'],
  ['list', 'List'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['checkbox', 'Checkbox'],
]
const blank: Record<Kind, PropertyValue> = { text: '', list: [], number: 0, date: new Date().toISOString().slice(0, 10), checkbox: false }

/** A value turned into another kind, keeping what can be kept. */
function convert(v: PropertyValue, kind: Kind): PropertyValue {
  const text = Array.isArray(v) ? v.join(', ') : v === null ? '' : String(v)
  if (kind === 'checkbox') return v === true || text === 'true'
  if (kind === 'number') return Number(text) || 0
  if (kind === 'list') return text.split(',').map((s) => s.trim()).filter(Boolean)
  if (kind === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : (blank.date as string)
  return text
}

function Field({ value, onChange }: { value: PropertyValue; onChange: (v: PropertyValue) => void }) {
  const kind = kindOf(value)
  const shown = Array.isArray(value) ? value.join(', ') : value === null ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])
  const commit = () => {
    if (draft === shown) return
    onChange(kind === 'number' ? Number(draft) || 0 : kind === 'list' ? draft.split(',').map((s) => s.trim()).filter(Boolean) : draft)
  }
  if (kind === 'checkbox') return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
  return (
    <input
      className="prop-input"
      type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
      value={draft}
      placeholder={kind === 'list' ? 'Items, separated by commas' : 'Empty'}
      onChange={(e) => (kind === 'date' ? onChange(e.target.value) : setDraft(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') (setDraft(shown), (e.target as HTMLInputElement).blur())
      }}
    />
  )
}

export function Properties({ note }: { note: Note }) {
  const props = note.properties ?? {}
  const keys = Object.keys(props)
  const [open, setOpen] = useState(() => local.get('propsOpen', true))
  const save = (next: Record<string, PropertyValue>) => updateNote(note.id, { properties: next })
  const set = (key: string, value: PropertyValue) => save({ ...props, [key]: value })
  const remove = (key: string) => {
    const next = { ...props }
    delete next[key]
    save(next)
  }
  const add = async () => {
    const name = (await ask({ title: 'Add a property', message: 'A field in the note’s front matter, such as status, owner or due.', placeholder: 'status', confirmLabel: 'Add' }))?.trim()
    if (!name) return
    if (name in props) return
    save({ ...props, [name]: '' })
    setOpen(true)
    local.set('propsOpen', true)
  }
  const toggle = () => {
    setOpen(!open)
    local.set('propsOpen', !open)
  }

  if (!keys.length)
    return (
      <button className="prop-add-first" onClick={() => void add()} title="Add a field to this note’s front matter">
        <Plus size={12} /> Add property
      </button>
    )
  return (
    <div className="props">
      <button className="props-head" onClick={toggle}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Properties <span className="count">{keys.length}</span>
      </button>
      {open && (
        <div className="props-rows">
          {keys.map((key) => (
            <div key={key} className="prop-row">
              <span className="prop-key" title={key}>
                {key}
              </span>
              <span className="prop-value">
                <Field value={props[key]} onChange={(v) => set(key, v)} />
              </span>
              <select
                className="prop-kind"
                title="Kind of value"
                value={kindOf(props[key])}
                onChange={(e) => set(key, convert(props[key], e.target.value as Kind))}
              >
                {KINDS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="icon-btn sm prop-x" title={`Remove “${key}”`} onClick={() => remove(key)}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button className="prop-add" onClick={() => void add()}>
            <Plus size={12} /> Add property
          </button>
        </div>
      )}
    </div>
  )
}
