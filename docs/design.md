# Margin design and development flow

This document explains how Margin is built, why it is built that way, and the recommended way to change it. Read it before making a non-trivial change. For how to use the app, see the [user guide](user-guide.md).

## Contents

- [Principles](#principles)
- [The pieces](#the-pieces)
- [How data flows](#how-data-flows)
- [The file format](#the-file-format)
- [Key decisions](#key-decisions)
- [Where to change what](#where-to-change-what)
- [Recommended development flow](#recommended-development-flow)
- [Known limits](#known-limits)

## Principles

These settle most design questions. When two of them pull apart, the earlier one wins.

1. **The notes are plain files.** A note is a markdown file a person can read and edit without Margin. Nothing essential lives only in the app.
2. **Nothing is lost quietly.** Deleting moves to a trash folder. Edits are snapshotted. An import copies and never changes its source.
3. **Fast with hundreds of notes.** Everything is loaded into memory once; search, backlinks and lists work from there.
4. **Keyboard and mouse are both first-class.** Every action has a shortcut and a visible control.
5. **One codebase.** The desktop app is the web app in a window, not a second implementation.

## The pieces

```
┌──────────────────────────── Desktop shell (electron/) ───────────────────────────┐
│  window, menu bar, right-click menu, folder picker, PDF save, global hotkey      │
│                                                                                  │
│  ┌────────────── Web app (src/) ──────────────┐      ┌──── Server (server/) ───┐ │
│  │  React views                               │ HTTP │  Express on 127.0.0.1   │ │
│  │  store.ts: all notes in memory, autosave   │◄────►│  reads and writes files │ │
│  │  CodeMirror editor with live preview       │ JSON │  history, trash, import │ │
│  └────────────────────────────────────────────┘      └────────────┬────────────┘ │
└───────────────────────────────────────────────────────────────────┼──────────────┘
                                                                    ▼
                                                    vault/  (markdown files on disk)
```

**Server** (`server/index.mjs`, about 500 lines). A small Express app bound to `127.0.0.1`. It is the only thing that touches the notes folder. It scans the folder into memory, serves it as JSON, writes changes back, keeps version snapshots, moves deleted notes to the trash, stores attachments and runs the Obsidian import (`server/obsidian.mjs`).

**Web app** (`src/`). React and TypeScript, built with Vite.

- `store.ts` holds every note in memory (Zustand) along with settings, tabs and panes. It owns autosave and routing.
- `components/` are the views: the note editor, canvas, calendar, lists, the ⌘K palette, settings.
- `lib/` is logic with no interface: markdown rendering, the canvas format, links and backlinks, search, dates, export.

**Editor** (`components/Editor.tsx` and its helpers). CodeMirror 6 with extensions written for Margin:

| File | Does |
| --- | --- |
| `livePreview.ts` | Renders markdown in place: hides syntax off the cursor line, draws math, images, link pills and checkboxes |
| `tableWidget.ts` | The in-place table editor |
| `lists.ts` | Nesting, renumbering and moving list items |
| `isearch.ts` | Incremental search and smart line-start |

**Desktop shell** (`electron/`). Starts the server inside the app, opens a window on it, and adds what a browser cannot: a menu bar, a native right-click menu, a folder picker, direct PDF saving and a global hotkey. `preload.cjs` is the narrow bridge the page uses to reach those.

## How data flows

### Starting up

1. The server scans the notes folder and parses every `.md` file.
2. The page asks for `/api/state` and gets all notes, the folder list and the vault's config.
3. `store.ts` keeps them in memory. From here, reading is instant: no view asks the server for a note.

When the window regains focus the page asks again, so edits made in another program appear.

### Typing in a note

```
keystroke → CodeMirror → onChange → store.updateNote()
                                      ├─ updates the note in memory at once (the UI follows)
                                      └─ schedules a save 450 ms later
save → PUT /api/notes/:id → server writes the file, snapshots a version
     → response merged back, keeping anything typed meanwhile
```

Saves for one note never overlap: a second save waits for the first. On closing the window, pending saves are sent immediately.

### Renaming or moving a note

The title is the file name, so a rename is a file rename. The server also rewrites `[[Old title]]` in every other note and returns the notes it touched. A note's `id` (in its frontmatter) never changes, which is what tabs, history and the address bar refer to.

### Search, links and tags

All derived in the browser from the notes in memory:

- **Search** (`lib/search.ts`) keeps a MiniSearch index and re-indexes only notes that changed.
- **Backlinks and tags** (`lib/links.ts`) parse each note once and cache the result until its text changes.
- **Tasks** (`lib/tasks.ts`) are the checkbox lines of every note, parsed the same way. Priority and dates are plain text on the line (`P2`, `>2026-10-08`, `@due(2026-10-10)`), so the Tasks view and the panel under a daily note are views over the files, never a second copy. Changing a task rewrites its one line in its note.

### Live preview

`livePreview.ts` builds a set of decorations from CodeMirror's syntax tree on every change or cursor move:

- syntax marks on lines without the cursor are hidden
- math, images, note links, checkboxes and tables are replaced by widgets
- whatever the cursor (or the current search match) touches is left as raw text

The document itself is always plain markdown. Preview is only decoration, so what is saved is exactly what was typed.

### Shortcuts

`shortcuts.ts` defines each action with a default key combination per platform. One handler in `App.tsx` turns a key press into a combination, looks up the action and runs it. Overrides are stored in settings. In the desktop app the page sends the current keys to the shell so the menu bar shows them.

### Two panes

The main pane follows the address bar (`#/note/<id>`). The side pane is separate state in the store (`side`, `sideTabs`). `activePane` records which one was last clicked; commands that act on "the current note" read it.

## The file format

```markdown
---
id: 3f9a1c20be
tags: [atlas, plan]
pinned: true
created: '2026-10-01T09:12:00.000Z'
updated: '2026-10-06T08:30:00.000Z'
---
The page, in ordinary markdown.

<!-- canvas -->
<!-- card id=c1 x=0 y=0 w=280 h=170 color=amber -->
Each canvas card is markdown too.
<!-- /card -->
<!-- edge from=c1 to=c2 -->
```

- The **file name** is the title. Folders are notebooks.
- **Frontmatter** holds `id`, `type` (`daily`, `article`, `scratch`), `tags`, `pinned`, dates, and for some types `expires`, `source`, `status`, `view`. Keys Margin does not know are kept as they are.
- The **canvas** is appended after a marker, as cards in HTML comments. Other markdown tools show the page and ignore the canvas.
- **Images** are ordinary markdown images; a width is written as `![name|400](path)`.

Beside the notes: `attachments/` (or the name chosen in settings), `.history/<id>/<time>.md` for versions, `.trash/` for deleted notes, and `.margin/config.json` for settings that belong to the folder: the attachments folder name and the tags each notebook gives its notes.

## Key decisions

| Decision | Why | Cost |
| --- | --- | --- |
| A local server, not direct file access from the page | Works the same in a browser and in the desktop app; one place enforces the file rules | A process has to be running |
| All notes in memory | Search, backlinks and switching are instant | Start-up reads every file; fine for thousands, not for hundreds of thousands |
| Live preview over a rich-text editor | The file is exactly what was typed, so math and tables round-trip | Preview is rebuilt on each change; some things (tables in tables, nested embeds) are not rendered |
| Canvas stored inside the note | One file per note, readable anywhere | Large canvases make long files |
| Title as file name, links by title | Files make sense in Finder and in other tools | Two notes with one title are ambiguous to a link; a rename rewrites links |
| Electron over Tauri | The server is Node, and the editor is only tested in Chromium | A large download |
| Settings in the browser's storage | Simple, immediate | Not shared between the desktop app and a browser; the attachments folder is the exception and lives in the vault |
| Shortcuts handled in the page | They can be customised in one place | The desktop menu has to be told what to display |

## Where to change what

| To change | Look in |
| --- | --- |
| How a note is read, written or renamed | `server/index.mjs` |
| What a new setting does | `Settings` and `DEFAULT_SETTINGS` in `src/store.ts`, then `components/SettingsModal.tsx` |
| A shortcut or its default | `src/shortcuts.ts`; the action itself in `src/commands.tsx` |
| How markdown looks while editing | `components/livePreview.ts` and the "live preview" part of `src/styles.css` |
| How markdown looks when reading or exported | `lib/markdown.ts`, `lib/export.ts` |
| What counts as a task, its details, the lists in the Tasks view | `lib/tasks.ts`; the view itself in `components/TasksView.tsx` |
| Slash commands, link completion | `slashCommands` and `completions` in `components/Editor.tsx` |
| The menu bar or right-click menu | `electron/main.mjs` |
| Colours, spacing, fonts | The tokens at the top of `src/styles.css` |
| The starter notes | `server/seed.mjs` |

Adding a setting takes four steps: add it to the `Settings` type, give it a default, use it where it matters, add a row in `SettingsModal.tsx`. The settings search picks the row up automatically.

## Recommended development flow

### Set up

```bash
npm install
npm run dev
```

`npm run dev` serves the app at http://localhost:4321 and reloads the page as files change. Changes under `server/` or `electron/` need a restart.

Use a throwaway notes folder while developing, so tests never touch real notes:

```bash
VAULT_DIR=/tmp/margin-test npm run dev
```

### Make a change

1. **Decide where it belongs** using the table above. Keep file rules in the server, state in the store, and rendering in components.
2. **Change the smallest thing that works.** Match the surrounding code.
3. **Type-check:** `npm run typecheck`.
4. **Try it in the browser** with the throwaway folder. Check the thing you changed and the things next to it.
5. **Try it in the desktop app** (`npm run app`) if it touches shortcuts, menus, files or the window.

### Check before committing

- Does the note file still look right in a plain text editor?
- Does it survive a reload and a restart?
- Does it work in both light and dark themes?
- With two panes open, does it act on the active one?
- Is anything deleted that should have gone to the trash?

### Commit and publish

```bash
git add -A
git commit -m "Describe what changed and why"
git push
```

Work on a branch for anything larger than a small fix, and merge when it is tested.

### Build installers

```bash
npm run app:dist
```

This writes an installer for the current system to `release/`. Build on each system you want to ship for. Builds are unsigned; signing needs an Apple or Windows developer certificate.

### Rebuild the documentation

The HTML guides are generated from the markdown ones:

```bash
npm run docs
```

## Known limits

- **One window.** The desktop app has a single window with up to two panes.
- **No sync.** Put the notes folder in a synced location if you want it on several machines. Two machines editing the same note at once will conflict at the file level.
- **Titles must be unique to link reliably.** Links go by title.
- **Search inside tables and rendered math** counts matches but does not highlight them until opened.
- **Settings are per app,** except the attachments folder.
- **No automated tests yet.** Changes are verified by hand using the checks above. The pure logic in `src/lib/` and `components/lists.ts` would be the first place to add them.
