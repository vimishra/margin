// When Margin is run from source on a Mac, the menu bar shows the name of the Electron app bundle
// it runs inside, which is "Electron". This renames that development copy to "Margin".
// It only touches node_modules/electron and is safe to run repeatedly. Packaged builds do not need it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform === 'darwin') {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const plist = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'Info.plist')
  try {
    const before = fs.readFileSync(plist, 'utf8')
    const after = before.replace(/(<key>CFBundle(?:Display)?Name<\/key>\s*<string>)[^<]*(<\/string>)/g, '$1Margin$2')
    if (after !== before) {
      fs.writeFileSync(plist, after)
      console.log('Named the development app "Margin".')
    }
  } catch {
    // Electron is not installed yet, or its layout changed: the app still runs, just under the old name.
  }
}
