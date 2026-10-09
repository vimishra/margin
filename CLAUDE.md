# Margin

A local-first markdown note-taking app: an Electron desktop app and a browser app from one codebase. Every note is a plain `.md` file in a folder; there is no database. Repo: https://github.com/vimishra/margin (private, branch `main`).

`docs/specification.md` is the full product specification (what the app must do, independent of this code); keep it current when behaviour changes. Read `docs/design.md` before a non-trivial change: it has the architecture, data flow, file format and a "where to change what" table. `docs/user-guide.md` describes every feature as the user sees it.

## Commands

```bash
npm run app        # build, then open the desktop app (what the owner uses day to day)
npm run dev        # browser at http://localhost:4321 with reload on change
npm run typecheck  # tsc --noEmit; run after every change
npm run docs       # regenerate docs/*.html from docs/*.md
npm run docs:pdf   # the same, then HTML and PDF copies into build/Documentation/ for the installer
npm run test:tasks # the task rules, checked in the app's code and in the Python command-line tool
npm run app:dist   # installers into release/ (only when asked)
npx vite build && npm run docs:pdf && npx electron-builder --mac dmg --arm64   # the Apple-silicon installer used for releases
```

Changes under `server/` or `electron/` need a restart; `src/` reloads in `npm run dev`. The desktop app serves the built `dist/`, so it needs `npm run app` again to pick anything up.

## Never touch the real notes

The owner's real notes (work meetings) are in `~/Documents/Vault`, set as `vaultDir` in `~/Library/Application Support/Margin/config.json`. Both `npm run app` and `npm run dev` open that folder unless `VAULT_DIR` is set, and so does the `margin` preview config. `vault/` in the project is the fallback when no folder is chosen; it is git-ignored and must stay that way.

- Test against a throwaway folder: `PORT=4477 VAULT_DIR=<scratch dir> node server/index.mjs --dev`. For the browser preview, add a launch config that runs `env VAULT_DIR=<scratch dir> PORT=4490 node server/index.mjs --dev`; the plain `margin` config opens the real notes.
- Or, in the running app, create a note titled `zz …` through the API, test on it, and delete it afterwards. Restore `localStorage` keys (`margin.settings`, `margin.tabs`, `margin.mode`, `margin.theme`) you changed.
- Do not type into, rename or reformat existing notes while testing.

## Layout

- `server/index.mjs` — the only code that touches the notes folder. `server/obsidian.mjs` is the importer, `server/seed.mjs` the starter notes.
- `src/store.ts` — all state (Zustand): notes in memory, settings, tabs, panes, autosave, routing.
- `src/shortcuts.ts`, `src/commands.tsx` — every action: its default keys, and what it does. ⌘K, the menu bar and Settings → Shortcuts all read from these.
- `src/components/Editor.tsx` — CodeMirror setup, slash commands, link completion, incremental search bar. Helpers: `livePreview.ts`, `tableWidget.ts`, `lists.ts`, `isearch.ts`.
- `src/lib/tasks.ts` — tasks are checkbox lines with `P1`–`P3`, `>date` or `>someday`, `@due(date)` and `@done(date)` written on them. The lists follow Things 3: Today (planned today or earlier, or due), Upcoming, Anytime, Someday, Logbook; only a missed due date is overdue. Ticking writes `@done(date)` unless the setting is off; `components/TasksView.tsx` is the Tasks view and the panel under daily notes. Saved filters are `settings.taskViews`; the route is `#/tasks/<list>` or `#/tasks/s:<id>`. `components/DatePicker.tsx` is the calendar opened by `openDatePicker()`.
- Notebook tags live in the vault's `.margin/config.json` (`folderTags`). `createNote` and `updateNote` in `store.ts` write them into a note's own tags when it is created in or moved into a notebook; they are never removed automatically.
- `tools/margin_tasks.py` — a read-only Python command-line tool that lists tasks straight from the notes folder. It is packaged into the app (`extraResources`) and Help → Command-Line Tool… links it into `~/.local/bin/margin-tasks`; the owner wants it there, not in `/usr/local/bin`, so nothing needs sudo. It re-implements the rules in `src/lib/tasks.ts`, so **any change to those rules must be made in both**: run `node scripts/task-fixtures.mjs --write` to re-record `tests/task-cases.json` from the app's code, update the Python to match, and run `npm run test:tasks`.
- `src/lib/top3.ts` — the Top 3 list of a daily note: `carryTop3()` in `store.ts` moves unticked items from the last daily note into today's when it is created.
- `src/components/JournalView.tsx` — all daily notes on one page, each with its own editor. The day last clicked in is `journalNote` in the store and is what `currentNote()` returns there; editors find out whether app-level commands are for them from the nearest `data-pane` attribute.
- `src/lib/shortlinks.ts` — the pattern for company short links (`go/name`, `b/123`). `livePreview.ts` marks them in the editor and a core rule in `lib/markdown.ts` does the same for rendered text; neither changes the note.
- `src/components/SettingsModal.tsx` — settings UI. `src/lib/` — markdown, canvas format, links, search, dates, export.
- `electron/main.mjs` — window, menu bar, right-click menu, IPC. `electron/preload.cjs` — the bridge, typed in `src/desktop.ts`.

## How to add things

- **A setting:** add to `Settings` and `DEFAULT_SETTINGS` in `store.ts`, use it, add a `<Row>` in `SettingsModal.tsx`. Search picks it up automatically. Appearance settings are applied in `applyAppearance()` as CSS variables.
- **An action:** add a command in `commands.tsx` (it appears in ⌘K), and a line in `SHORTCUT_DEFS` if it should have or allow a shortcut. Desktop menu items are in `electron/main.mjs` and call the same ids.
- **Something the editor must do from outside:** dispatch a window event (`margin:format`, `margin:isearch`, `margin:line`, `margin:action`) and handle it in `NoteView`/`Editor`. Handlers must check `activePane` so only the active pane reacts.
- **"The current note"** is `currentNote()` in `store.ts`, not the route: it respects the side pane.

## Things that have bitten before

- A state name used as a bare CSS class collided with an existing class (`source`). Prefix such classes (`mode-source`).
- CodeMirror's own styles outrank short selectors. Tooltip/completion styles need `.editor .cm-editor .cm-tooltip.cm-tooltip-autocomplete …`.
- Keymap order matters: custom bindings that override built-ins (⌥↑/⌥↓, ⌃A) go before `defaultKeymap`.
- When a key press opens an input that must receive the next keystroke, render it with `flushSync` and focus it in the same handler. Do not rely on `requestAnimationFrame` or effects for focus or selection.
- Widgets that replace text (link pills, math, tables, images) hide anything decorated underneath; search and similar features must account for that.
- On macOS, the menu-bar name and Dock icon of the unpackaged app come from `node_modules/electron`; `scripts/brand-dev-app.mjs` handles the name, `app.dock.setIcon` the icon.
- The preview's typing tool does not open CodeMirror's completion popup. To test completions, get the view from `document.querySelector('.cm-content').cmTile.view` and dispatch changes with `userEvent: 'input.type'`.
- A smoke test of the packaged app is answered by the owner's own running Margin (port 43117) unless the packaged one gets its own profile: start it with `--user-data-dir=<scratch dir>` and read the port from its output.
- Native menus cannot be clicked from tests. Verify their logic by emitting the event in a scratch Electron script, and say plainly what was not exercised.

## Working agreements with the owner

- Commit and push only when asked. End commit messages with the `Co-Authored-By` line.
- Build and publish an installer only when asked ("deploy" means: commit, push, bump the version, add a `CHANGELOG.md` entry, build the Apple-silicon `.dmg`, smoke-test it against a scratch folder, and publish a GitHub release). `.github/workflows/mac-build.yml` can also build the `.dmg` on demand from the Actions tab.
- Work done from another computer, or by another coding agent, arrives as a branch on GitHub named after the tool (`claude/...`, `codex/...`), not on `main`; fetch and check for one when asked to sync.
- `AGENTS.md` is a link to this file, so every agent reads the same instructions. Edit this file; never replace the link with a copy.
- After changing behaviour, update `docs/user-guide.md` and run `npm run docs`.
- Report in plain language what changed, what was tested and how, and what was not tested.
- Preferences already reflected in defaults: day-first typed dates, meeting notes filed as `Meetings/YYYY/MMM`, attachments folder configurable (they use `Assets`).

## Open ideas, not yet built

- Task details shown as labels in read mode and exports (today they appear as typed).
- Per-pane drag and drop of tabs; more than two panes.
- Search highlighting inside tables and rendered math.
- Version-history frequency as a setting (needs server-side config).
- More automated tests (only the task rules are covered, by `npm run test:tasks`); `src/lib/` and `components/lists.ts` next.
- Write commands for `margin-tasks` (tick, plan, due, add). Deliberately left out so far; they should go through the local server when the app is running.
