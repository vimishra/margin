// Open the current note in the external editor (Settings → General → External editor), at the cursor's line. Desktop
// app only: a browser cannot start a program. Unsaved typing is saved first, so the editor opens what is on screen.
import { desktop } from './desktop'
import { currentNote, saveNow, toast, useStore } from './store'

/** The default command: neomacsclient, the client of a running Neomacs, opening at the line without waiting. */
export const DEFAULT_EDITOR = 'neomacsclient -n +{line} {file}'

/** The cursor's line (from 1) in the active pane's page, asked of that pane's editor; 1 when it has none. */
function caretLine(): number {
  let line = 0
  window.dispatchEvent(new CustomEvent('margin:caretLine', { detail: (l: number) => (line = l) }))
  return line + 1
}

export const canOpenExternally = () => !!desktop?.openInEditor

export async function openInExternalEditor() {
  const note = currentNote()
  if (!note || !desktop?.openInEditor) return
  const line = caretLine()
  if (!(await saveNow(note.id))) {
    toast('Not opened: the note could not be saved first. Try again in a moment.')
    return
  }
  const command = useStore.getState().settings.externalEditor?.trim() || DEFAULT_EDITOR
  const result = await desktop.openInEditor(note.path, line, command)
  if (!result.ok) toast(`Could not open the note in your editor: ${result.error} Set the editor in Settings → General → External editor.`)
}
