// Open a note in the editor of the owner's choice (Settings → General → External editor), at a line.
//
// The command is a template such as `neomacsclient -n +{line} {file}` or `code -g {file}:{line}`. It is split into
// words here and started directly, never through a shell, so a note's path cannot inject anything. An app started
// from Finder or the Dock has only a minimal PATH, so the login shell's PATH (where Homebrew and ~/.local/bin are)
// is looked up once and used.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_EDITOR = 'neomacsclient -n +{line} {file}'

/** Split a command into words: spaces separate them, quotes ('…' or "…") keep spaces inside one, \ escapes a character. */
export function splitCommand(command) {
  const words = []
  let word = ''
  let quote = ''
  let started = false
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      if (ch === quote) quote = ''
      else if (ch === '\\' && quote === '"' && i + 1 < command.length) word += command[++i]
      else word += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (ch === '\\' && i + 1 < command.length) {
      word += command[++i]
      started = true
    } else if (/\s/.test(ch)) {
      if (started) words.push(word)
      word = ''
      started = false
    } else {
      word += ch
      started = true
    }
  }
  if (started) words.push(word)
  return words
}

/** The words to run: {file} and {line} filled in; the file added at the end when the command does not mention it. */
export function editorArgs(template, file, line) {
  const words = splitCommand(template || DEFAULT_EDITOR)
  if (!words.some((w) => w.includes('{file}'))) words.push('{file}')
  return words.map((w) => w.replaceAll('{file}', file).replaceAll('{line}', String(line)))
}

/** Lines of front matter at the top of a file, as the server splits it (so a line in the page is a line in the file). */
export function frontMatterLines(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw)
  return m ? m[0].split('\n').length - 1 : 0
}

let loginPath = null
/** PATH as the owner's login shell sets it, with the usual places for command-line tools added. */
function searchPath() {
  if (loginPath === null) {
    let fromShell = ''
    const shell = process.env.SHELL || '/bin/zsh'
    try {
      // printenv works the same in zsh, bash and fish (fish's own `echo $PATH` separates with spaces).
      const r = spawnSync(shell, ['-l', '-c', 'printenv PATH'], { encoding: 'utf8', timeout: 4000 })
      if (r.status === 0) fromShell = r.stdout.trim().split('\n').pop() || ''
    } catch {
      /* fall back to the usual places */
    }
    const home = os.homedir()
    const extra = ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local', 'bin'), path.join(home, 'bin')]
    const parts = [...fromShell.split(':'), ...(process.env.PATH || '').split(':'), ...extra].filter(Boolean)
    loginPath = [...new Set(parts)].join(':')
  }
  return loginPath
}

/**
 * Start the editor on a note. `rel` is the note's path in the notes folder, `pageLine` the line in its page (from 1).
 * Resolves { ok: true } once it has started, or { ok: false, error } when it could not start or failed at once
 * (an emacsclient with no Emacs server running exits with a message, for instance).
 */
export function openInEditor(vault, rel, pageLine, template) {
  const file = path.resolve(vault, String(rel))
  if (!file.startsWith(vault + path.sep)) return Promise.resolve({ ok: false, error: 'That note is not in the notes folder.' })
  let offset = 0
  try {
    offset = frontMatterLines(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return Promise.resolve({ ok: false, error: `Could not read the note's file (${e.code || e.message}).` })
  }
  const line = Math.max(1, offset + (Number(pageLine) || 1))
  const [cmd, ...args] = editorArgs(template, file, line)
  if (!cmd) return Promise.resolve({ ok: false, error: 'No external editor is set.' })
  return new Promise((resolve) => {
    let settled = false
    let stderr = ''
    const done = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let child
    try {
      child = spawn(cmd, args, { env: { ...process.env, PATH: searchPath() }, cwd: path.dirname(file), detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (e) {
      return done({ ok: false, error: e.message })
    }
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-600)))
    child.on('error', (e) => done({ ok: false, error: e.code === 'ENOENT' ? `“${cmd}” was not found.` : e.message }))
    child.on('exit', (code) => done(code === 0 ? { ok: true } : { ok: false, error: stderr.trim().split('\n').pop() || `“${cmd}” stopped with code ${code}.` }))
    // An editor that keeps running (a GUI app started without -n) has started fine; let it go on its own.
    setTimeout(() => {
      child.stderr.destroy()
      child.unref()
      done({ ok: true })
    }, 2500)
  })
}
