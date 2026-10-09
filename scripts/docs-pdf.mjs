// Makes the printable copies of the guides that ship with the installer: `npm run docs:pdf`.
// Run by Electron, which prints each docs/*.html page to a PDF. The result is build/Documentation/,
// holding an HTML and a PDF copy of each guide; it is generated, not checked in.
import { app, BrowserWindow, nativeTheme } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'build', 'Documentation')
// The three guides of the Help menu, under the names they have there, and the specification they link to.
const GUIDES = [
  ['user-guide', 'Margin User Guide'],
  ['operations', 'Margin Theory of Operations'],
  ['design', 'Margin Design Guide'],
  ['specification', 'Margin Specification'],
]

app.dock?.hide()
app.whenReady().then(async () => {
  // Paper is light, whatever the computer is set to.
  nativeTheme.themeSource = 'light'
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 900, height: 1100 })
  for (const [page, name] of GUIDES) {
    const source = path.join(root, 'docs', `${page}.html`)
    // The copy stands alone in a folder, so the links to the other guides point at their new names.
    let html = fs.readFileSync(source, 'utf8')
    for (const [other, otherName] of GUIDES) html = html.replaceAll(`href="${other}.html`, `href="${encodeURI(otherName)}.html`)
    fs.writeFileSync(path.join(out, `${name}.html`), html)
    await win.loadURL(pathToFileURL(source).href)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font:8px -apple-system,Helvetica,sans-serif;color:#888;padding:0 0.7in;display:flex;justify-content:space-between"><span>${name}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    })
    fs.writeFileSync(path.join(out, `${name}.pdf`), pdf)
    console.log(`build/Documentation/${name}.pdf  ${(pdf.length / 1024).toFixed(0)} KB`)
  }
  app.quit()
})
