// The text box of the task capture box: one line of CodeMirror, so typing a task offers the same
// suggestions as on a task line in a note (">fri", "@due(", "#tag", "[[") plus P1 to P3, and shows
// the details as labels while they are typed.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap, closeCompletion, completionKeymap } from '@codemirror/autocomplete'
import { TASK_TOKENS } from '../lib/tasks'
import { today } from '../lib/util'
import { captureCompletions, marks } from './Editor'

export interface TaskInputHandle {
  focus(): void
  clear(): void
}

interface Props {
  /** Text to start with, such as what was typed in the note box before switching. */
  initial?: string
  onChange(text: string): void
  /** Enter saves; with Shift the box stays open for the next task. */
  onSubmit(again: boolean): void
  onCancel(): void
  /** Tab and Shift+Tab, to change where the task goes. */
  onTab(back: boolean): void
}

/** Priority and dates as small labels, as on a task in a note. A due date in the past is red. */
function detailMarks(view: EditorView): DecorationSet {
  const now = today()
  const text = view.state.doc.toString()
  const out = []
  for (const m of text.matchAll(TASK_TOKENS)) {
    const cls = m[1] ? `cm-task-pri cm-task-pri-${4 - Number(m[1])}`
      : m[4] ? 'cm-task-date cm-task-someday'
      : m[5] ? 'cm-task-date cm-task-done-on'
      : m[3] ? `cm-task-date cm-task-due${m[3] < now ? ' late' : m[3] === now ? ' now' : ''}`
      : `cm-task-date${m[2] <= now ? ' now' : ''}`
    out.push(Decoration.mark({ class: cls }).range(m.index!, m.index! + m[0].length))
  }
  return Decoration.set(out)
}

const details = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = detailMarks(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = detailMarks(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

/** A task is one line: a pasted line break becomes a space. */
const oneLine: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.lines === 1) return tr
  const text = tr.newDoc.toString()
  const flat = text.replace(/\s*\n\s*/g, ' ')
  return [tr, { changes: { from: 0, to: text.length, insert: flat }, selection: { anchor: Math.min(tr.newSelection.main.head, flat.length) }, sequential: true }]
})

export const TaskInput = forwardRef<TaskInputHandle, Props>(function TaskInput(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cb = useRef(props)
  cb.current = props

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: (cb.current.initial ?? '').replace(/\s*\n\s*/g, ' '),
        selection: { anchor: (cb.current.initial ?? '').replace(/\s*\n\s*/g, ' ').length },
        extensions: [
          history(),
          closeBrackets(),
          oneLine,
          marks,
          details,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Task' }),
          autocompletion({ override: [captureCompletions], icons: false }),
          placeholder('Send the proposal >fri @due(mon) P2 #atlas'),
          keymap.of([
            // The suggestion list takes Enter, the arrows and Escape while it is open.
            ...completionKeymap,
            { key: 'Enter', run: () => (cb.current.onSubmit(false), true), shift: () => (cb.current.onSubmit(true), true) },
            { key: 'Tab', run: () => (cb.current.onTab(false), true), shift: () => (cb.current.onTab(true), true) },
            { key: 'Escape', run: () => (cb.current.onCancel(), true) },
            ...closeBracketsKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => u.docChanged && cb.current.onChange(u.state.doc.toString())),
          // Moving to the notes (or clicking away) closes the suggestion list.
          EditorView.domEventHandlers({ blur: (_e, v) => void closeCompletion(v) }),
        ],
      }),
    })
    view.current = v
    v.focus()
    return () => v.destroy()
  }, [])

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    clear: () => {
      const v = view.current
      if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } })
    },
  }))

  return <div ref={host} className="editor capture-editor" />
})
