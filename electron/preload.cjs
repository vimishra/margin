// Bridge between the desktop shell and the web app. Only these functions are exposed to the page.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('marginDesktop', {
  platform: process.platform,
  /** Menu items and global shortcuts arrive as command ids (see src/commands.tsx). */
  onCommand: (handler) => {
    const listener = (_event, id) => handler(id)
    ipcRenderer.on('command', listener)
    return () => ipcRenderer.removeListener('command', listener)
  },
  /** Choices made in the right-click menu that the page has to carry out. */
  onContextAction: (handler) => {
    const listener = (_event, action) => handler(action)
    ipcRenderer.on('context-action', listener)
    return () => ipcRenderer.removeListener('context-action', listener)
  },
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  revealVault: () => ipcRenderer.invoke('vault:reveal'),
  revealFile: (relativePath) => ipcRenderer.invoke('vault:reveal-file', relativePath),
  chooseFolder: (title) => ipcRenderer.invoke('folder:choose', title),
  savePdf: (name) => ipcRenderer.invoke('pdf:save', name),
  setShortcuts: (map) => ipcRenderer.send('shortcuts:set', map),
  /** The accent colour from the system's settings ("#rrggbb"), and a way to hear when it changes. */
  accentColor: () => ipcRenderer.invoke('accent:get'),
  onAccent: (handler) => {
    const listener = (_event, color) => handler(color)
    ipcRenderer.on('accent', listener)
    return () => ipcRenderer.removeListener('accent', listener)
  },
})
