// Desktop shell: runs the same file-backed server as `npm start` inside the app
// and shows it in a native window with a menu, standard shortcuts and a notes-folder picker.
import { app, BrowserWindow, Menu, clipboard, dialog, globalShortcut, ipcMain, session, shell } from 'electron'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const isMac = process.platform === 'darwin'
// A fixed port keeps the app's origin stable, which is what the saved settings are tied to.
const BASE_PORT = 43117
const iconPath = path.join(here, '..', 'build', 'icon.png')
// Run from source there is no app bundle to carry the name and icon, so set them here.
app.setName('Margin')
const configFile = () => path.join(app.getPath('userData'), 'config.json')

let win = null
let origin = ''
let vault = ''

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(patch) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify({ ...readConfig(), ...patch }, null, 2))
}

function vaultDir() {
  if (process.env.VAULT_DIR) return path.resolve(process.env.VAULT_DIR)
  const saved = readConfig().vaultDir
  if (saved) return saved
  // Run from the project folder: keep using the project's vault. Installed app: a folder in Documents.
  return app.isPackaged ? path.join(os.homedir(), 'Documents', 'Margin') : path.join(here, '..', 'vault')
}

function freePort(port, attempts = 20) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', () => (attempts > 0 ? resolve(freePort(port + 1, attempts - 1)) : reject(new Error('No free port'))))
    probe.once('listening', () => probe.close(() => resolve(port)))
    probe.listen(port, '127.0.0.1')
  })
}

// The guides open in a plain window of their own, reused between the two.
let docWin = null
function openDoc(page) {
  const url = `${origin}/docs/${page}.html`
  if (docWin && !docWin.isDestroyed()) {
    docWin.loadURL(url)
    docWin.show()
    docWin.focus()
    return
  }
  docWin = new BrowserWindow({ width: 940, height: 860, minWidth: 480, minHeight: 360, title: 'Margin', icon: iconPath, webPreferences: { contextIsolation: true, nodeIntegration: false } })
  docWin.on('closed', () => (docWin = null))
  const outside = (target) => !target.startsWith(`${origin}/docs/`)
  docWin.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^(https?|mailto):/i.test(target) && outside(target)) shell.openExternal(target)
    else if (!outside(target)) docWin.loadURL(target)
    return { action: 'deny' }
  })
  docWin.webContents.on('will-navigate', (event, target) => {
    if (!outside(target)) return
    event.preventDefault()
    if (/^(https?|mailto):/i.test(target)) shell.openExternal(target)
  })
  docWin.loadURL(url)
}

const send = (id) => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('command', id)
}

async function chooseVault() {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose your notes folder',
    message: 'Margin keeps every note as a markdown file in this folder.',
    defaultPath: vault,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use this folder',
  })
  if (result.canceled || !result.filePaths[0] || result.filePaths[0] === vault) return false
  writeConfig({ vaultDir: result.filePaths[0] })
  app.relaunch()
  app.exit(0)
  return true
}

// Shortcuts are handled by the page (so they can be customised in Settings). The menu shows the
// current keys; until the page reports them, these defaults are shown.
let accelerators = {
  search: 'CmdOrCtrl+K', back: 'CmdOrCtrl+[', forward: 'CmdOrCtrl+]', home: 'CmdOrCtrl+Shift+H', daily: 'CmdOrCtrl+D',
  calendar: 'CmdOrCtrl+Shift+L', all: 'CmdOrCtrl+Shift+A', prevTab: 'CmdOrCtrl+Shift+[', nextTab: 'CmdOrCtrl+Shift+]',
  closeTab: 'CmdOrCtrl+W', new: 'CmdOrCtrl+N', capture: 'CmdOrCtrl+Shift+C', scratch: 'CmdOrCtrl+Alt+N',
  canvas: 'CmdOrCtrl+Shift+N', meeting: 'CmdOrCtrl+Shift+M', expdf: 'CmdOrCtrl+P', prefs: 'CmdOrCtrl+,', tasks: 'CmdOrCtrl+Shift+T', journal: 'CmdOrCtrl+J',
  h1: 'CmdOrCtrl+1', h2: 'CmdOrCtrl+2', h3: 'CmdOrCtrl+3', h4: 'CmdOrCtrl+4', h5: 'CmdOrCtrl+5', mdlink: 'CmdOrCtrl+L',
}

function buildMenu() {
  const cmd = (label, id) => ({ label, accelerator: accelerators[id] || undefined, registerAccelerator: false, click: () => send(id) })
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              cmd('Settings…', 'prefs'),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        cmd('New Note', 'new'),
        cmd('New Canvas', 'canvas'),
        cmd('New Scratch Note', 'scratch'),
        cmd('New Meeting Note', 'meeting'),
        cmd('New Person Note', 'person'),
        cmd('New from Template…', 'template'),
        cmd('New Research Note', 'article'),
        cmd('New Notebook', 'folder'),
        { type: 'separator' },
        cmd('Quick Capture', 'capture'),
        { type: 'separator' },
        cmd('Export as PDF…', 'expdf'),
        cmd('Export as Markdown', 'exmd'),
        cmd('Export as HTML', 'exhtml'),
        cmd('Export as Word', 'exdoc'),
        { type: 'separator' },
        cmd('Import from Obsidian…', 'import'),
        { label: 'Choose Notes Folder…', click: () => chooseVault() },
        { label: isMac ? 'Show Notes Folder in Finder' : 'Open Notes Folder', click: () => shell.openPath(vault) },
        { type: 'separator' },
        cmd('Close Tab', 'closeTab'),
        { label: 'Close Window', role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
        ...(isMac ? [] : [{ type: 'separator' }, cmd('Settings…', 'prefs'), { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        cmd('Toggle Sidebar', 'sidebar'),
        cmd('Toggle Backlinks Pane', 'pane'),
        cmd('Switch Writing / Reading', 'mode'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload', accelerator: 'CmdOrCtrl+Alt+R' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        cmd('Search and Switch…', 'search'),
        { type: 'separator' },
        cmd('Back', 'back'),
        cmd('Forward', 'forward'),
        { type: 'separator' },
        cmd('Home', 'home'),
        cmd("Today's Daily Note", 'daily'),
        cmd('Journal', 'journal'),
        cmd('Calendar', 'calendar'),
        cmd('All Notes', 'all'),
        cmd('Tasks', 'tasks'),
        cmd('Research', 'research'),
        cmd('Scratch', 'goscratch'),
        { type: 'separator' },
        cmd('Previous Tab', 'prevTab'),
        cmd('Next Tab', 'nextTab'),
      ],
    },
    // No "Close" here: ⌘W belongs to Close Tab unless the user reassigns it.
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])] },
    {
      role: 'help',
      submenu: [
        { label: 'User Guide', click: () => openDoc('user-guide') },
        { label: 'Design Guide', click: () => openDoc('design') },
        { type: 'separator' },
        cmd('Keyboard Shortcuts', 'help'),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const saved = readConfig().bounds
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    ...(saved || {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Margin',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: '#f8f7f4',
    icon: iconPath,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, spellcheck: true },
  })
  win.once('ready-to-show', () => win.show())
  win.on('close', () => writeConfig({ bounds: win.getBounds() }))
  win.on('closed', () => (win = null))
  // Mouse back/forward buttons on Windows and Linux, and three-finger swipes on a Mac trackpad.
  win.on('app-command', (_e, command) => {
    if (command === 'browser-backward') send('back')
    else if (command === 'browser-forward') send('forward')
  })
  win.on('swipe', (_e, direction) => {
    if (direction === 'left') send('back')
    else if (direction === 'right') send('forward')
  })

  // Web links open in the default browser; only the app itself and its attachments load in app windows.
  const external = (url) => /^(https?|mailto):/i.test(url) && !url.startsWith(origin)
  win.webContents.setWindowOpenHandler(({ url }) => {
    const doc = url.startsWith(`${origin}/docs/`) && /\/docs\/([\w-]+)\.html/.exec(url)
    if (doc) {
      openDoc(doc[1])
      return { action: 'deny' }
    }
    if (external(url)) shell.openExternal(url)
    return { action: url.startsWith(origin) ? 'allow' : 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin)) return
    event.preventDefault()
    if (external(url)) shell.openExternal(url)
  })
  // Right-click menu. The page says what was clicked (a note link, the editor); Electron supplies
  // the spelling suggestions and the standard editing commands.
  win.webContents.on('context-menu', async (_event, p) => {
    let ctx = {}
    try {
      ctx = (await win.webContents.executeJavaScript('window.__marginContext ? window.__marginContext() : null')) || {}
    } catch {
      /* page not ready: show the basic menu */
    }
    const act = (action) => () => win.webContents.send('context-action', action)
    const sep = { type: 'separator' }
    const items = []

    if (p.misspelledWord) {
      for (const word of p.dictionarySuggestions.slice(0, 6)) items.push({ label: word, click: () => win.webContents.replaceMisspelling(word) })
      if (!p.dictionarySuggestions.length) items.push({ label: 'No Guesses Found', enabled: false })
      items.push({ label: `Learn “${p.misspelledWord}”`, click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, sep)
    }

    if (ctx.note) {
      items.push({ label: `Open “${ctx.note}”`, click: act({ type: 'open', target: ctx.note }) }, { label: 'Open to the Side', click: act({ type: 'open', target: ctx.note, side: true }) }, sep)
    }
    const link = ctx.href || (p.linkURL && !p.linkURL.startsWith(origin) ? p.linkURL : '')
    if (link) {
      items.push(
        { label: 'Open Link', click: () => (/^(https?|mailto):/i.test(link) ? shell.openExternal(link) : shell.openExternal(new URL(link, origin).href)) },
        { label: 'Copy Link', click: () => clipboard.writeText(link) },
        sep,
      )
    }
    if (p.mediaType === 'image') {
      items.push({ label: 'Copy Image', click: () => win.webContents.copyImageAt(p.x, p.y) }, sep)
    }

    const selection = p.selectionText.trim()
    if (selection) {
      const short = selection.length > 28 ? selection.slice(0, 27) + '…' : selection
      if (isMac) items.push({ label: `Look Up “${short}”`, click: () => win.webContents.showDefinitionForSelection() })
      items.push({ label: `Search Notes for “${short}”`, click: act({ type: 'search', query: selection.slice(0, 80) }) }, sep)
    }

    if (p.isEditable) {
      items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste })
      if (ctx.editor) items.push({ role: 'pasteAndMatchStyle', label: 'Paste as Plain Text', enabled: p.editFlags.canPaste })
      items.push({ role: 'selectAll' })
    } else if (selection) {
      items.push({ role: 'copy' })
    }

    if (ctx.editor) {
      const format = (label, kind, accelerator) => ({ label, accelerator, registerAccelerator: false, click: act({ type: 'format', kind }) })
      items.push(
        sep,
        {
          label: 'Format',
          submenu: [format('Bold', 'bold', 'CmdOrCtrl+B'), format('Italic', 'italic', 'CmdOrCtrl+I'), format('Strikethrough', 'strike'), format('Inline Code', 'code')],
        },
        {
          label: 'Paragraph',
          submenu: [
            format('Heading 1', 'h1', accelerators.h1),
            format('Heading 2', 'h2', accelerators.h2),
            format('Heading 3', 'h3', accelerators.h3),
            format('Heading 4', 'h4', accelerators.h4),
            format('Heading 5', 'h5', accelerators.h5),
            sep,
            format('Bulleted List', 'bullet', accelerators.bullet),
            format('Numbered List', 'numbered', accelerators.numbered),
            format('Task List', 'task', accelerators.task),
            format('Quote', 'quote'),
          ],
        },
        {
          label: 'Insert',
          submenu: [format('Link to a Note', 'wikilink'), format('Web Link', 'link', accelerators.mdlink), format('Table', 'table'), format('Math', 'math'), format("Today's Date", 'date'), format('Current Time', 'time')],
        },
      )
    }

    if (!app.isPackaged) items.push(sep, { label: 'Inspect Element', click: () => win.webContents.inspectElement(p.x, p.y) })
    // No doubled, leading or trailing dividers.
    const tidy = items.filter((item, i) => item.type !== 'separator' || (i > 0 && items[i - 1].type !== 'separator'))
    while (tidy.length && tidy[tidy.length - 1].type === 'separator') tidy.pop()
    if (tidy.length) Menu.buildFromTemplate(tidy).popup({ window: win })
  })

  win.loadURL(origin)

  // For smoke tests: MARGIN_CAPTURE=/path/to.png saves a picture of the window and quits.
  if (process.env.MARGIN_CAPTURE) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        fs.writeFileSync(process.env.MARGIN_CAPTURE, (await win.webContents.capturePage()).toPNG())
        app.exit(0)
      }, 2500),
    )
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => send('focus'))
  app.whenReady().then(async () => {
    vault = vaultDir()
    const port = await freePort(BASE_PORT)
    process.env.VAULT_DIR = vault
    process.env.PORT = String(port)
    const server = await import('../server/index.mjs')
    await server.ready
    origin = `http://127.0.0.1:${port}`

    // Lets the font picker in Settings list the fonts installed on this computer.
    const allow = (permission) => ['local-fonts', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission)
    session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => requestingOrigin.startsWith(origin) && allow(permission))
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(wc.getURL().startsWith(origin) && allow(permission)))

    ipcMain.on('shortcuts:set', (_e, map) => {
      if (!map || typeof map !== 'object') return
      accelerators = Object.fromEntries(Object.entries(map).filter(([, v]) => typeof v === 'string'))
      buildMenu()
    })
    ipcMain.handle('folder:choose', async (_e, title) => {
      const result = await dialog.showOpenDialog(win, { title: String(title || 'Choose a folder'), properties: ['openDirectory'], buttonLabel: 'Choose' })
      return result.canceled ? null : result.filePaths[0] || null
    })
    ipcMain.handle('vault:choose', () => chooseVault())
    ipcMain.handle('vault:reveal', () => shell.openPath(vault))
    ipcMain.handle('vault:reveal-file', (_e, rel) => {
      const file = path.resolve(vault, String(rel))
      if (file.startsWith(vault + path.sep)) shell.showItemInFolder(file)
    })
    ipcMain.handle('pdf:save', async (_e, name) => {
      const safe = String(name || 'note').replace(/[\/\\:*?"<>|]/g, ' ').trim() || 'note'
      const result = await dialog.showSaveDialog(win, {
        title: 'Export as PDF',
        defaultPath: path.join(app.getPath('documents'), `${safe}.pdf`),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return null
      const data = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
      fs.writeFileSync(result.filePath, data)
      return result.filePath
    })

    if (isMac && !app.isPackaged && fs.existsSync(iconPath)) app.dock.setIcon(iconPath)
    buildMenu()
    createWindow()
    // Capture a thought from any app.
    globalShortcut.register('Control+Alt+Space', () => send('capture'))

    app.on('activate', () => (win ? win.show() : createWindow()))
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })
}
