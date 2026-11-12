# Margin product specification

This document specifies Margin completely enough to build it again from nothing. It describes what the app does and the rules it follows, not how the current code is organised. It matches version 1.35.0.

It is written to be handed to a developer or a coding tool. Where a detail is a free choice for the implementer, it says so; everything else is a requirement.

## Contents

1. [Purpose and constraints](#1-purpose-and-constraints)
2. [Platforms and architecture](#2-platforms-and-architecture)
3. [Data: the notes folder](#3-data-the-notes-folder)
4. [The window](#4-the-window)
5. [The editor](#5-the-editor)
6. [Links, tags and the side panel](#6-links-tags-and-the-side-panel)
7. [Search and commands](#7-search-and-commands)
8. [Kinds of note](#8-kinds-of-note)
9. [Daily notes, journal, calendar](#9-daily-notes-journal-calendar)
10. [Canvas](#10-canvas)
11. [Capture, templates, meetings, people](#11-capture-templates-meetings-people)
12. [Tasks](#12-tasks)
13. [Organising](#13-organising)
14. [History, trash, export, import](#14-history-trash-export-import)
15. [Settings](#15-settings)
16. [Keyboard shortcuts](#16-keyboard-shortcuts)
17. [Appearance](#17-appearance)
18. [Desktop shell](#18-desktop-shell)
19. [Command-line tool](#19-command-line-tool)
20. [Dates typed in words](#20-dates-typed-in-words)
21. [Acceptance checklist](#21-acceptance-checklist)

---

## 1. Purpose and constraints

Margin is a note-taking app for one person who keeps hundreds of notes: work, meetings, research, learning and quick ideas. It also manages that person's tasks, which are written inside the notes.

Hard constraints:

- **Notes are plain markdown files** in an ordinary folder. There is no database. A person must be able to read and edit every note without Margin.
- **Local only.** No account, no server on the internet, no sync. The only network use is fetching a page title when a research note is created from a link.
- **No AI features of any kind.**
- **Nothing is lost quietly.** Deleting moves to a trash folder, edits are snapshotted, and an import never changes its source.
- **Fast with hundreds of notes.** Switching notes, searching and listing must feel instant.
- **Keyboard and mouse are both first-class.** Every action has a visible control and can have a shortcut. Every shortcut can be changed.
- **One codebase** serves a desktop app and a browser version.

Non-goals: collaboration, mobile apps, plugins, encryption, publishing.

## 2. Platforms and architecture

- **Desktop app** for macOS (primary), Linux and Windows. **Browser version** served from the same code for development and occasional use.
- **Three parts:**
  1. A local server bound to `127.0.0.1`. It is the only code that reads or writes the notes folder. It exposes a small JSON API.
  2. A web front end that loads every note into memory at start, renders all views, and saves through the API.
  3. A desktop shell that starts the server in-process, shows the front end in a window, and adds native menus, a folder picker, PDF saving and a global hotkey.
- **Ports:** the browser version listens on 4321. The desktop app uses 43117, or the next free port.
- The reference implementation uses Node with Express, React with TypeScript, CodeMirror 6, markdown-it, KaTeX, highlight.js, MiniSearch and Electron. Any stack that meets this specification is acceptable. All libraries must be permissively licensed; no AGPL or GPL dependencies.

### 2.1 Server API

All bodies are JSON unless noted.

| Method and path | Does |
| --- | --- |
| `GET /api/state` | Every note, the list of folders, the notes folder path, and the folder's config |
| `POST /api/notes` | Create a note from given fields; returns the note and the folder list |
| `PUT /api/notes/:id` | Change a note's content or fields. A change of title or folder renames or moves the file and rewrites links in other notes; returns every note touched |
| `DELETE /api/notes/:id` | Move the note's file to the trash |
| `GET /api/notes/:id/versions` | Timestamps of the note's saved versions |
| `GET /api/notes/:id/versions/:ts` | The content of one version |
| `POST /api/folders` | Create a folder |
| `PATCH /api/folders` | Rename or move a folder |
| `DELETE /api/folders` | Move a folder's notes to the trash and remove it |
| `POST /api/attachments` | Store an uploaded file (raw body, up to 200 MB); returns its path |
| `GET /api/unfurl?url=` | Title and description of a web page |
| `PUT /api/config` | Change the folder's config (attachments folder, notebook tags) |
| `POST /api/import/obsidian` | Copy an Obsidian vault into the notes folder |
| `GET /files/...` | Serve a file from the notes folder (attachments); hidden files denied |
| `GET /docs/<page>.html` | Serve a built-in help page |

### 2.2 Loading and saving

- At start the server scans the folder and parses every `.md` file. The front end fetches the whole state once and keeps it in memory. No view asks the server for a single note.
- When the window regains focus, the front end fetches the state again, so edits made in other programs appear. It must not do this while a save is pending.
- Typing updates the note in memory immediately and schedules a save 450 ms later. Saves for one note never overlap: a second waits for the first. Title and folder changes save at once.
- When the window is hidden or closed, pending saves are sent immediately.
- A "Saving… / Saved" indicator shows in the note's header.
- **Versions.** Each note carries the version of its file (a hash of the file's bytes as last read or written). A save of new content sends the version it was made from. The server first re-reads the file; if it has changed on disk since that version, the save is refused (409) and the note as it is now is sent back. The front end then shows that version and a message that stays until closed: the note "was changed outside Margin, so your last change was not saved", with **Use mine**, which saves the refused content over the newer version. Saves that change only other fields (pin, tags, title) are applied to the file as it is on disk, never to an older copy in memory. Renaming a note updates links in other notes from their files as they are on disk.
- **Atomic writes.** A note is written to a hidden temporary file beside it and renamed over it, so no reader ever sees half a note. Hidden files are ignored when scanning.
- **Notes changed outside Margin** while on screen (the note in each pane, the journal day in use, and the triage note) are checked against their files every 10 seconds while the window is visible, and replaced in memory when changed, unless they have unsaved changes (whose save is then refused, as above).

## 3. Data: the notes folder

### 3.1 Layout

```
<notes folder>/
  Any/Nested/Folders/Note title.md
  attachments/            images, PDFs and other files (name configurable)
  .margin/config.json     settings that belong to the folder (attachments folder, notebook tags, triage note);
                          read again whenever the state is fetched, so it can be edited by hand
```

- A **notebook** is a folder. Notebooks nest.
- Entries whose name starts with `.` are never treated as notes or notebooks.
- The top-level attachments folder is not a notebook.
- The notes folder is chosen by the user. Default when run from source: `./vault`. Default for an installed app: `~/Documents/Margin`. The choice is stored in the app's own config file (`config.json` in the operating system's per-app data folder, key `vaultDir`). The browser version uses, in order: the `VAULT_DIR` environment variable, the desktop app's saved choice, `./vault`.
- If the folder is completely empty on first run, it is filled with about 15 starter notes that demonstrate the features.

### 3.2 A note file

```markdown
---
id: 3f9a1c20be
tags:
  - atlas
  - plan
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

- **Title** is the file name without `.md`. A `title` key in the frontmatter is written only when the title contains characters a file name cannot hold.
- **Frontmatter** is YAML. Known keys: `id`, `title`, `type`, `tags`, `pinned`, `created`, `updated`, `expires`, `source`, `status`, `view`. Unknown keys must be preserved untouched when the note is saved.
  - `id`: a stable identifier that never changes on rename. A note without one gets `p` followed by the first 10 hex digits of the SHA-1 of its path, until it is first saved.
  - `type`: `daily`, `article` or `scratch`; omitted for an ordinary note.
  - `tags`: a list, or a comma- or space-separated string. A leading `#` is dropped.
  - `expires`: ISO time; scratch notes only.
  - `source`, `status`: research notes only. `status` is `unread`, `reading` or `done`.
  - `view`: `canvas` when the note opens on its canvas side.
- A file with no frontmatter, or invalid frontmatter, is treated as all content.
- **Content** is everything after the frontmatter, with one trailing newline removed.
- **The canvas** is appended to the page after a blank line and the marker `<!-- canvas -->`. See [section 10](#10-canvas).
- When saving, write `id`, then `title` if needed, `type` if not a plain note, `tags` if any, `pinned` if true, `created`, `updated`, then `expires`, `source`, `status`, `view` when set, then the unknown keys.

### 3.3 Renaming and moving

- Changing a title renames the file. Changing a notebook moves it.
- On a rename, every `[[Old title]]` in every other note is rewritten to the new title, keeping any `#heading` and `|label` parts.
- Names are sanitised for the file system. If the target name exists, a number is appended.

### 3.4 Folder config

`.margin/config.json` holds settings that must travel with the notes:

```json
{
  "attachments": "attachments",
  "folderTags": { "Meetings": ["meeting"], "Work/Atlas": ["atlas"] }
}
```

All other settings belong to the app on one computer (see [section 15](#15-settings)).

### 3.5 Attachments

- A pasted or dropped file is stored in the attachments folder and linked from the note as a markdown image or link.
- Names are made unique by appending a number.
- A pasted image is named after the note and the time, for example `Atlas-kickoff-2026-10-06-1654.png` (setting: on by default).
- An image's display width is written after a `|` in its alt text: `![shot|400](attachments/shot.png)`.
- A pasted Retina screenshot is given half its pixel width, so it appears at the size it had on screen (setting: on by default). Use the PNG's `pHYs` density when present, otherwise the screen's pixel ratio.
- Changing the attachments folder name is refused if a notebook with notes already uses that name.

## 4. The window

### 4.1 Layout

Left to right: **sidebar**, **main area**, and optionally a **side pane** showing a second note. The main area has a tab bar on top and one view below it. A note view may also show a **side panel** on its right (backlinks and outline).

### 4.2 Sidebar

Top to bottom:

1. App name and logo, and a button to hide the sidebar.
2. A search button that opens the palette, showing its shortcut.
3. **New note** button; a **New…** menu (Note, Canvas, Scratch note, Meeting note, Person note, Research note, From a template…, Notebook); a **Quick capture** button.
4. Navigation: Home, Today, Journal, Calendar, All notes (with count), Tasks (with the Today count), Research (count), Scratch (count). Each entry's icon has its own colour, kept whether or not the entry is selected; notebook icons share one colour. Note icons are coloured by kind wherever notes are listed: ordinary notes blue, daily notes amber, research notes purple, scratch notes brown, canvas notes teal.
5. Under Tasks: Inbox, Today, Upcoming, Anytime, Someday, Logbook, and Overdue only while something is overdue, each with an icon in its own colour and a count (no count for Logbook); then the user's saved filters.
6. A small month calendar that can be folded. Days with a daily note have a dot; today is ringed; clicking a day opens its note.
7. **Pinned** notes, alphabetical.
8. **Recent**: the five notes opened most recently, newest first.
9. **Notebooks** as a tree, each with a note count, foldable, with a button to add one. Notes can be dragged from lists onto a notebook to move them.
10. **Tags**, most used first, as coloured chips with counts.
11. Footer: Settings and Shortcuts buttons.

- Each section from Today to Tags can be hidden in Settings. Home and search always show.
- The sidebar's width can be changed by dragging its right edge: 224 to 480 px, default 264; double-click resets. It can be hidden entirely.

### 4.3 Tabs, history and panes

- Every opened note becomes a tab (setting; when off there is one tab). Tabs persist across restarts. The open tab is marked by a bold title on a slightly darker background, with no outline or coloured line; the others are dimmer.
- **Many tabs:** a tab is 120 to 200 px wide; past that the row scrolls sideways, with its scrollbar hidden. A mouse wheel over the row scrolls it sideways (a trackpad's sideways swipe already does). An end with tabs hidden past it fades out. While any tabs are out of sight, a small button after the row shows how many are open; it opens the palette listing that pane's tabs in order (title, notebook, which is showing, ⌥1–9 for the first nine), filtered by typing, Enter to open. The same list is "Show all open tabs…" in the palette, with an optional shortcut.
- **Tab limit** (setting, off by default; 5, 10, 15, 20 or 30): when opening a note would make more tabs than the limit in a pane, the tabs used longest ago (by the order notes were last opened) are closed until it fits; the one being opened stays. Notes are not affected, only their tabs.
- Back and forward work like a browser, by keys, by buttons at the left of the tab bar, by the mouse's back and forward buttons, and by a trackpad swipe in the desktop app.
- The address reflects the view: `#/home`, `#/note/<id>`, `#/journal`, `#/calendar`, `#/all`, `#/tasks`, `#/tasks/<list>`, `#/tasks/s:<filter id>`, `#/folder/<path>`, `#/tag/<tag>`, `#/research`, `#/scratch`.
- **Side pane:** a second note beside the main view, with its own tabs. It opens by ⌘-click or ⌥-click on any note reference, by "Open to the side", or by ⌥↵ in the palette. The divider drags between 25% and 70% of the width; double-click gives equal halves. The two panes can be swapped.
- The pane last clicked is the **active pane**, marked by a thick accent line along the top of its tab bar. Every app-level command that acts on "the current note" (formatting, search in note, jump to heading, close tab, rename and so on) applies to the active pane's note.

### 4.4 Home

Shows a greeting and date, a quick-capture box, buttons for the common "new" actions, today's daily note, pinned notes, recently opened notes, the research reading queue, and scratch notes about to expire. Sections whose sidebar counterpart is hidden are hidden here too.

### 4.5 Note lists

All notes, a notebook, a tag, Research and Scratch share one list view: a title and count, a filter box (`/` focuses it), a sort menu (Last edited, Date created, Title; Expiring soonest for Scratch), rows with title, snippet, tags, notebook and time. ↑ ↓ (or J K) move, Enter opens, ⌘-click opens to the side, right-click gives the note menu. Pinned notes float to the top except when sorting by title. Research adds a status filter. A notebook's page shows its sub-notebooks and its notebook tags.

## 5. The editor

### 5.1 Three modes

- **Write** (default): live preview. Markdown is rendered in place, and the raw syntax of a line shows only while the cursor is on that line.
- **Source:** the raw markdown, monospaced, optional line numbers.
- **Read:** a rendered, read-only page. Checkboxes still tick. Double-click switches to Write. A single line break in the text is kept as a line break (as in the editor), here, in exports and in task notes; a blank line still starts a new paragraph. A task's checkbox hangs to the left, so the lines under the task start under its text.

An empty note always opens in Write. The mode is one global setting.

### 5.2 A note's header

Above the text: the notebook as a breadcrumb (click to open it or to move the note), the saved state, Page / Canvas buttons, mode buttons, and buttons for pin, jump to heading, version history, export, side panel and a "more" menu (pin, history, move, open to the side, duplicate, page width, move to trash). Then the title as an editable field, the tag row, and an optional formatting toolbar: heading, bold, italic, bulleted list, numbered list, task list, quote, code, link, link to note, table, math, attach.

Research notes add a status selector and a source link field. Scratch notes add a strip showing time left with "+1 day", "+1 week" and "Keep".

### 5.3 Markdown support

Headings 1 to 6, bold, italic, strikethrough, inline code, fenced code blocks with syntax colouring by language (in all modes), block quotes, bulleted, numbered and task lists, links, bare web addresses as links, images, tables, horizontal rules, inline math `$…$` and display math `$$…$$` in LaTeX, `[[wikilinks]]`, `#tags`, and embedded PDFs.

### 5.4 Live preview rules

- Syntax marks (`#`, `**`, `>`, list markers, link brackets and addresses, code fences) are hidden on lines without the cursor.
- These are replaced by rendered widgets unless the cursor touches them: math, images and PDFs, note links (as pills), checkboxes, bullets, horizontal rules and tables.
- A link of any kind inside a heading takes the heading's size and weight; its colour, underline or pill background stay the link's.
- The document is always plain markdown. Preview is decoration only; what is saved is exactly what was typed.
- A current search match counts as "the cursor is here", so text hidden inside a widget is revealed and highlighted.

### 5.5 Lists

- Bullets show as a round dot in a configurable colour. Numbers are styled the same.
- **Tab** nests an item under the one above; **⇧Tab** un-nests. Numbered lists renumber automatically. Numbered items need three spaces of indent in the file; bullets need two.
- Nesting is drawn at a fixed width per level (setting, default 28 px) regardless of the spaces in the file, with a faint guide line per level (setting) that runs the full height of a wrapped item.
- **⌥↑ / ⌥↓** move an item, with its sub-items, past its neighbour.
- Toggle shortcuts turn the selected lines into a bulleted, numbered or task list, and back.
- **Wrapped lines hang under the item's text**, not under the marker, for bullets, numbers and tasks at any depth. Markers occupy a fixed width so numbers align.
- **The other lines of an item** (indented lines under it, or lazy continuation lines, such as notes under a task or an image) are drawn at the item's text position by the same rule, with their leading spaces taking no width. Not inside quotes or code.
- **⌃A** (Mac) goes to the start of the text, and on a second press to the start of the line.

### 5.6 Headings

Shortcuts set heading level 1 to 5 on the current line or each selected line. The same level again removes the heading; a different level changes it.

### 5.6a Folding

- A heading folds from the end of its line to the end of its section (the last block before the next heading of the same or a higher level). A list item folds from the end of its first line to the end of the item, when it has lines under it (sub-items or indented text). Nothing else folds: paragraphs, quotes, tables and code blocks do not.
- A foldable line shows an arrow in the left margin on hover; a folded line always shows it as a solid right-pointing triangle in the accent colour, and ends with a "…" marker tinted in the accent colour. Clicking either toggles the fold. The arrow takes no room in the line.
- Commands, all acting at the cursor in the active pane's editor: **Fold or unfold here** (Mod+'): unfold a fold on this line, else fold this line, else fold the closest section or item that contains it. **Fold** (Mod+Alt+↑): the same, except that on an already folded line it folds the closest container, so repeated presses collapse outwards. **Unfold** (Mod+Alt+↓): open the fold on this line. **Fold all**, **Unfold all**: no default keys. When folding hides the cursor, it moves to the end of the folded line. With nothing to fold, a message says so.
- **Outline folding, as in org-mode** (on by default; Settings → Editor → "Tab folds headings" turns it off). Only on a heading line with nothing selected; elsewhere Tab and Shift+Tab keep their jobs (list nesting, table cells, indenting). Headings are found from the syntax tree, so `#` lines in code blocks are not headings.
  - **Tab** cycles the heading's section through three states: *folded* (the section's own fold) → *children* (the section open, each of its direct subheadings, the shallowest level below it present, folded) → *subtree* (nothing in the section folded) → folded. If the section has no subheadings, children is skipped. From any other mix of folds inside the section, Tab folds it. Folds outside the section are left alone. A heading with nothing under it does nothing special.
  - **Shift+Tab** cycles the whole note: *overview* (every heading at the note's top level folded) → *contents* (every heading visible: each folds only its own text, up to the next heading of any level, and the deepest headings their whole section) → *show all* → overview. From any other set of folds it goes to overview. When overview and contents are the same (all headings at one level), contents is skipped.
  - **Fold to level N** (N = 1, 2, 3) shows the headings of level 1 to N and folds the rest: a level-N heading folds its whole section, a heading above N folds only its own text. **Fold below this level** does the same with N = the level of the heading the cursor is on or in. Both replace any folds the note had.
  - When a fold would hide the cursor, it moves to the end of the visible line the fold starts on.
- Folds are never written into the note. They are kept per note in the app's local storage (`margin.folds`: the line number and text of each folded line, and, for a fold that stops before the end of its section, how many lines it covers) and restored when the note opens, by the same line or, if lines have moved, the nearest line with the same text. A change from outside the editor (the file changed on disk, a task ticked in the Tasks view) keeps the folds. A fold that would hide the cursor is not restored.
- Moving the cursor into a fold (find, find and replace, search in note, jump to a heading, a link to a section) opens it. Folding applies in writing and source modes and in the journal; the read-only view and exports show everything.

### 5.7 Tables

- A table renders as an editable grid. Click a cell and type; Tab and ⇧Tab move between cells and Enter moves down, both adding a row at the end.
- Bars on the right and bottom edges add a column or row.
- Right-clicking a cell offers: insert row above or below, insert column left or right, sort by this column A to Z or Z to A, align left, centre or right, delete row, delete column, delete table.
- **Sorting:** hovering a column heading shows an arrow; clicking sorts by that column, and again reverses. The arrow stays lit on the column the table is sorted by. Numbers sort as numbers (understanding thousands separators, currency signs, percentages and bracketed negatives) and before text; text sorts naturally ("item 2" before "item 10"), ignoring case; empty cells stay last in both directions; ties keep their order. Sorting rewrites the rows in the note.
- **Edit markdown** shows the raw table until the cursor leaves it or **Done** is clicked.
- **Copy for spreadsheet** copies the table as tab-separated text.
- **Paste from a spreadsheet:** when the clipboard holds an HTML table, or tab-separated text in which every line has the same number of tabs (at least one), pasting inserts a markdown table. The first row is the header. A column whose filled cells are all numbers is right-aligned. A merged cell keeps its text in the first column it covered and leaves the rest empty. Line breaks inside a cell become spaces and `|` is escaped. This does not happen inside a code block. A blank line is ensured above and below.
- **In the file,** every table is written with columns padded so the pipes line up in a fixed-width font: left-aligned cells padded on the right, right-aligned on the left, centred on both sides. Wide characters count as two columns.
- **Width:** a table is as wide as its contents need, up to the page width, then scrolls sideways. A setting stretches all tables to full width.
- Headings are bold, in the full text colour and slightly larger than body text.

### 5.8 Images and files

- Paste or drop to attach. Images show inline; PDFs show in an embedded viewer.
- Pasted at the end of a line inside a list item, the file goes on a new line indented by the item's indent plus its marker and the space after it, with no blank line after it, so the list stays tight. Elsewhere it goes on a line of its own followed by an empty line, as before.
- Clicking an image opens it enlarged over the page; Esc, Space or Enter closes it.
- A small **Edit** button on hover reveals the image's markdown.
- Border style is a setting: none, hairline or shadow.

### 5.9 Links in the editor

- A rendered link opens on a plain click. If the cursor is already on that line, a click places the cursor and ⌘-click opens.
- **Insert link** shortcut: with nothing selected, inserts `[]()` with the cursor between the square brackets; with words selected, `[words]()` with the cursor in the round brackets; with a web address selected, `[](address)` with the cursor in the square brackets.
- **Paste to link:** pasting a single web address over selected words turns them into `[words](address)`. Not when the selection is itself an address, spans lines, or is inside code or a link.
- **Short links:** `go/<name>` (letters, digits, hyphens, underscores; further `/segments` allowed) and `b/<digits>` or `b/hotlists/<digits>`, standing on their own, are shown as links to `http://<text>` in every mode and in the Tasks view. The note's text is not changed. They are not recognised inside code, web addresses, existing links or longer paths. Setting, on by default.

### 5.10 Slash commands

Typing `/` at the start of a line or after a space opens a menu that narrows as you type.

| Group | Entries |
| --- | --- |
| Blocks (change the current line, keep its text) | Heading 1, Heading 2, Heading 3, Bulleted list, Numbered list, Task (also "To-do"), Quote, Text |
| Insert | Code block, Table, Math block, Inline math, Divider, Link to a note, Web link, Image or file |
| Tasks | Due today, Due tomorrow, Due date, Plan for today, Plan for tomorrow, Plan for a day, Someday, P1 high priority, P2 medium priority, P3 low priority |
| Dates | Today, Tomorrow, Yesterday (each a link to that day's note), Date (as text), Time |
| Templates | One entry per template; inserts its text with placeholders filled |

Not offered inside code, links or web addresses.

### 5.11 Completion

- `[[` lists notes, most recently edited first, with their notebook. Typing a date phrase offers that day's daily note first.
- `#` (not at the start of a line) lists existing tags with counts.
- On a task line, `>` or `@due(` followed by a day in words offers the date (see [section 12.2](#122-entering-details)).
- The completion list uses the app's own visual style.

### 5.12 Search inside a note

An Emacs-style incremental search:

- The shortcut opens a small bar at the bottom of the note; the next keystroke must go into it.
- Matches highlight as you type, with a count. The same key again goes to the next match; the backward key goes to the previous one and also starts a backward search.
- Enter stays at the match and closes the bar. Esc returns to where the search began.
- All lowercase ignores case; any capital makes it exact.
- ⌘F opens ordinary find and replace. Outside the editor ⌘F (and Edit → Find… in the desktop app) finds in what is in front: the Tasks view's or a list's narrow-down box gets focus with its text selected, a guide window opens its find bar, the keyboard shortcuts window focuses its find box, and anywhere else the palette opens for search.

### 5.13 Other editor behaviour

- Spell check (setting, on) with suggestions in the right-click menu in the desktop app.
- **Task items in the right-click menu** (desktop app): when the click is on a task line, or inside a selection holding tasks, the menu starts with: Mark as Done (Mark as Not Done when every one is ticked or cancelled) and Cancel Task (only Reopen Task when every one is cancelled; "Tasks" for several), then Move to Today, When…, Due Date…, Change Priority, each with its shortcut. A click outside the selection first moves the cursor to the clicked line (only when that line is a task), so they act on it; inside a selection they act on every task in it. The Tick and Cancel items are also in the Paragraph submenu.
- **Right-click on a task row** (Tasks view, tasks blocks, the daily note's task panel; drawn by the app, so also in a browser): Mark as done or Mark as not done (Reopen task when cancelled), Cancel task, Move to today, When…, Due date…, Move to another note…, the four priorities (the current one marked), Open in its note, Open to the side; each with its key. The desktop app shows no system menu over it.
- Auto-closing brackets and quotes (setting, on).
- Bold ⌘B, italic ⌘I, wrap in a note link ⌘⇧K, undo and redo. Wrapping commands leave whitespace at either end of the selection outside the marks (a selected `word ` becomes `**word** `); with nothing selected they insert placeholder text inside the marks. Bold, italic, strikethrough and inline code are toggles: when the selection, or an empty cursor strictly between the marks, is inside text with that style (as the markdown parser reads it, so `__bold__` and `***both***` count), its opening and closing marks are removed and the selection keeps covering the same text; bold-italic loses only the chosen style. A cursor just outside the marks wraps as usual.
- **Timestamps** inserted by capture are written as `**4:54 PM** : text`, bold time, then space, colon, space.

## 6. Links, tags and the side panel

### 6.1 Note links

- Syntax: `[[Title]]`, `[[Title#Heading]]`, `[[Title|label]]`.
- Links resolve by title, ignoring case. If two notes share a title, the first found wins.
- A link to a note that does not exist is shown outlined; clicking it creates the note. A link whose target is a date (`YYYY-MM-DD`) creates that day's daily note, with the daily template.

### 6.2 Tags

- A note's tags are its frontmatter tags plus every `#tag` written in its text.
- An inline tag is `#` followed by a letter and then letters, digits, `_`, `-` or `/`, preceded by start of line, whitespace or `(`. A `#` beginning a line is a heading. Tags inside code are ignored.
- Nested tags use `/`.
- **Every tag has a colour derived from its name,** the same everywhere it appears. Nested tags take the colour of their first segment. Hash the lower-cased first segment and spread the result around the hue wheel by the golden angle; text uses a dark shade on a light tint in the light theme and the reverse in the dark theme.
- The tag row under a title shows frontmatter tags as removable chips, inline tags as outlined chips, and an input for adding one. While the input has focus it lists up to eight tags already in use that the note does not have, most used first with their counts: with text typed, tags starting with it, then tags containing it, then the typed text as a new tag if no tag has that name. ↑/↓ move, Enter or Tab (Tab only once text is typed) adds the highlighted one, a click adds one, Esc closes; Enter, comma or space with no list adds the typed text; Backspace in an empty input removes the last tag.
- **Add a tag** (shortcut) opens a picker listing tags already in use, most used first with counts, narrowing as you type, prefix matches first. A name that matches nothing is offered as a new tag. Several words add several tags. It tags only the current note.

### 6.3 Notebook tags

- Right-click a notebook → "Tags for notes here…" sets tags for it, stored in the folder config.
- A note created in the notebook, or moved into it, gets those tags written into its frontmatter. Sub-notebooks inherit their parents' tags.
- After setting them, the app offers to add them to the notes already there, stating the count, with Undo.
- Tags are never removed automatically, on moving out or on clearing the notebook's tags.
- Renaming a notebook keeps its tags; deleting it drops them.

### 6.4 Side panel

Beside a note, five foldable sections, each with an icon and a bold heading, separated by a thin line (no colour):

1. **Backlinks:** notes linking here, each with up to three lines of context and the link highlighted.
2. **Unlinked mentions:** notes containing this note's title as a whole word or phrase, without linking to it. Each has a **Link** button that turns the mentions in that note into links (`[[Title]]`, or `[[Title|as written]]` when the case differs). Skipped for titles under three characters, daily notes and "Untitled" notes; never inside code, links or web addresses.
3. **Outgoing links:** notes this one links to (missing ones marked "create"), then its web addresses.
4. **Outline:** the note's headings; clicking scrolls to one.
5. **Details:** word count, edited, created, file path.

## 7. Search and commands

One palette, opened by ⌘K, does three jobs.

- **Empty:** recently opened notes. The first is the note you were in before the current one, so the shortcut followed by Enter flips between two notes.
- **Words:** full-text search over titles and content, with a snippet. Opening a result scrolls to the first match and flashes that line.
- **`#tag`:** notes with that tag (and tags under it).
- **Search operators**, combinable with words and with each other, in any order:
  - `"exact phrase"`: the text appears as typed (case and runs of spaces ignored), in the title or the page. An unclosed quote runs to the end.
  - `-word`, `-"phrase"`, `-#tag`: leave out notes containing it, or carrying the tag.
  - `in:Notebook` or `in:"Two words/Sub"` (also `notebook:`): only notes in that notebook or a notebook inside it, compared as folder names are (capitals and stray slashes ignored).
  - `title:word`: the title contains it.
  - `tag:name`: as `#name`.
  - `is:daily`, `is:meeting` (in the meetings notebook), `is:research`, `is:scratch`, `is:note` (any other note); plural accepted. Several are alternatives.
  - `has:tasks`: notes with at least one open task.
  - `after:day`, `before:day` (any day in words): a daily note's own day, otherwise the day it last changed, strictly after or before.
  - Any other `word:value` is shown as not understood; `word:` with nothing after it, and web addresses, are ordinary words.
  With plain words, results are ranked by the full-text search and then filtered; with only operators, every note that passes is listed, most recently changed first. When operators are used, the Notes group's heading says what the search is limited to ("Notes · in Work · “budget review” · without “draft”"), and the create-a-note item is not offered. Opening a result goes to the first phrase searched for, otherwise to the words.
- **Tasks:** with at least two characters typed, a "Tasks" group after the first three note results lists up to five tasks (templates excluded) whose text contains every typed word; `#tag` and `p1`–`p3` filter as in the Tasks view's box; phrases and exclusions apply to the task's text, and `in:`, `is:`, `after:` and `before:` to its note. Open tasks come first in urgency order, then done ones, most recently done first. Each shows the priority badge, the text without markdown marks with the words highlighted, the note (and heading), and its planned, someday, due and done labels. Enter opens the task like the Tasks view does (cursor at the end of its line); ⌥↵ does the same in the side pane. Remaining note results follow under "More notes". Tasks cannot be ticked or rescheduled from here.
- **A date phrase:** that day's daily note first.
- **Command names:** matching commands rank above notes. Every list of the Tasks view is a command named "Tasks: <list>" (Inbox, Today, …, All open), with that list's icon and colour, and so is every saved filter ("Tasks: <name>"); each opens that list.
- **`>`:** commands only.
- **⌥↵** opens the selected note in the side pane. **⌘↵** creates a note named with the typed text.

The palette has further modes with the same look: move a note to a notebook (with "create notebook"), choose a template, jump to a heading, and choose a tag.

**Jumping to a place in a note** (from search or the Tasks view): a note search result selects the text found; a task (from the Tasks view or a ⌘K task result), or a meeting entry just added, puts the cursor at the end of its line with nothing selected, so a stray key cannot replace the line. Either way the editor scrolls it to the middle, repeats the scroll a few times over the first second while images and tables settle, and flashes the line for about 1.5 seconds. It works in either pane.

**Commands** cover every action in the app: create (note, canvas, scratch, meeting, person, research, from template, notebook), go to (each view, each task list and saved filter), on the current note (side, swap, jump to heading, search, formatting, headings, lists, task actions, mode, page or canvas, rename, duplicate, add tag, copy link, reveal file, close tab, pin, history, move, export as Markdown, HTML, PDF, Word, delete), tabs (close all tabs, offered from any view while tabs are open; close all other tabs, offered when a note is in front with other tabs open), and app (page width, sidebar, side panel, theme, settings, import, help pages, keyboard shortcuts).

## 8. Kinds of note

| Kind | `type` | Where | Behaviour |
| --- | --- | --- | --- |
| Note | none | Anywhere | The default |
| Daily | `daily` | Daily notebook | Titled `YYYY-MM-DD`; shown with the long date; has previous and next day buttons; cannot be renamed |
| Research | `article` | `Research` | Created from an optional link; title and summary fetched from the page; has a status (unread, reading, done) and a source; starts with Summary, Quotes and My notes sections |
| Scratch | `scratch` | Scratch notebook | Expires after a set number of days (default 7) and is then moved to the trash; shows time left; "Keep" turns it into an ordinary note |

New notes are titled "Untitled" with the title selected, and go into the current notebook, the top level, or the Inbox, by setting.

## 9. Daily notes, journal, calendar

### 9.1 Daily notes

- Opening a day creates its note if needed. It is stored as `<Daily notebook>/YYYY-MM-DD.md`.
- A new daily note starts from the note called `Daily` (or "Daily note", "Daily notes") in the Templates notebook. If none exists and the user has not typed a template into Settings, that note is created from the built-in template and used:

```markdown
## Top 3 for {{day}}

- [ ] 

## Log

- 
```

- The template is applied on every path that creates a daily note. Placeholders are filled for the day the note is for, not for today. The template note's tags are given to the new note.
- Two requests for the same new day must not create it twice.
- Daily notes can open on the page or the canvas (setting; default canvas).

### 9.2 Top 3

- The Top 3 is the list under a heading beginning "Top 3" (or "Top three").
- When today's note is created, the unfinished top-level items in the Top 3 of the most recent earlier daily note are moved into today's: removed from the old note and added to the new one, with anything nested under them.
- Unfinished means an unticked task, or a list item without a checkbox that is not struck through. Items without a checkbox become unticked tasks as they move.
- An empty placeholder item in the target is replaced. If the source list becomes empty, one empty checkbox is left.
- A command does the same on demand. A confirmation offers Undo. A setting turns the automatic move off.

### 9.3 Tasks panel

Every daily note shows a foldable panel, "Tasks for this day", above its text. It lists tasks from other notes that are due or planned for that date. Today's note also lists, under their own headings, overdue tasks and tasks planned for an earlier day that are still open. It is a view: nothing is copied into the note, and ticking a task there ticks it in its own note. Its tasks use the note's font, size and weight. On a canvas day it starts folded in the top-left corner.

### 9.4 Journal

One continuous page of daily notes, today at the top, older days below.

- Only days that have a note appear; future days are left out; today's note is created if missing.
- Seven days load first and seven more each time the end approaches.
- Every day is the real note, editable in place, with its date as a heading (plus a Today or Yesterday badge) and its tasks panel.
- Clicking a date opens that day alone; ⌘-click opens it beside the journal. A day with canvas content shows a Canvas button.
- App-level commands apply to the day last clicked in, which counts as the current note.

### 9.5 Calendar

A month grid. Days with a daily note have a dot. Selecting a day previews it; Enter or double-click opens it. The week starts on Sunday or Monday by setting, or by locale.

## 10. Canvas

Every note has a second side: an unbounded board of cards.

- A card has a position, size, optional colour (amber, green, blue, pink, purple) and markdown text. Edges connect two cards.
- Double-click empty space adds a card; double-click a card edits it; N adds one; Enter and Esc start and finish editing.
- Drag to move; drag a corner to resize; drag the dot on a card's edge to another card to connect, or to empty space to create a connected card.
- Scroll pans; pinch or ⌘-scroll zooms. A toolbar offers add card, add file, zoom controls and fit.
- Pasting or dropping images and files adds them as cards.
- Selecting a card offers colours, duplicate and delete; ⌫ deletes the selection.
- Stored in the note file as shown in [section 3.2](#32-a-note-file): each card is an HTML comment with `id`, `x`, `y`, `w`, `h` and optional `color`, then its markdown, then `<!-- /card -->`; each edge is `<!-- edge from=… to=… -->`.
- The Page and Canvas buttons show a dot when the other side has content.

## 11. Capture, templates, meetings, people

### 11.1 Quick capture

A small box with a text area. Enter saves, ⇧Enter adds a line, Esc closes. There is one destination, today's daily note: the text is appended to the page as `- **time** : text` (without the time when that setting is off), or as a card when today is a canvas. An empty trailing bullet left by the template is replaced. Text typed as a task (`- [ ] …`) is added as that task with no timestamp.

Whether to add the time is a setting. In the desktop app a global hotkey opens capture from any application.

**Quick task.** The same box can be opened for a task (its own shortcut and global hotkey). A Note / Task switch at the top changes between the two; the shortcuts of either do the same while the box is open, and the text typed so far is kept.

- One line of the editor: a pasted line break becomes a space. The details are marked as labels as they are typed, as on a task line in a note.
- Suggestions: `>` or `@due(` with a phrase offer dates as in [section 12.2](#122-entering-details) (`>some` offers someday); `P` after a space offers P1, P2, P3; `#` offers tags; `[[` offers notes. No slash commands.
- A line under the text shows the details read from it (when or Someday, due date, priority, tags), with dates typed in words already turned into dates.
- On save, a date phrase after `>` (the longest run of up to three words that reads as a date, or `someday`) and inside `@due(…)` is replaced by the date; anything that is not a date is left as typed. The task is saved as `- [ ] <text>`.
- **Notes**: a multi-line box under the task line (Tab from the task line, Shift+Tab back). Enter makes a new line; Mod+Enter saves, Mod+Shift+Enter saves and keeps the box open. Each non-blank line is saved under the task indented by two spaces (blank lines are dropped, so the notes stay in the task's block for Move to note). Switching from the note box carries its first line to the task and the rest to the notes; switching back joins them.
- One destination: appended as the last line of the **Inbox note**, the note titled `Inbox` in the Inbox notebook, which is created empty when it does not exist. A task with no planned day is then in the Inbox list ([section 12.4](#124-the-lists)); one with a day or Someday is in that list instead, and the line under the text says which before saving.
- Enter saves and closes; ⇧Enter saves and clears the box for another task; Esc closes an open suggestion list, otherwise the box.

### 11.2 Templates

- A template is any note in the Templates notebook.
- "New from template" creates a note from one; the slash menu inserts one.
- Placeholders: `{{date}}` (YYYY-MM-DD), `{{time}}`, `{{day}}` (weekday name), `{{title}}`, and `{{date:FORMAT}}` / `{{time:FORMAT}}`.
- Format tokens: `YYYY YY MMMM MMM MM M Do DD D dddd ddd HH H hh h mm A a`; text in `[brackets]` is literal.

### 11.3 Meeting notes

One action asks for the meeting's name, then:

1. Creates the note in `<Meetings>/<YYYY>/<MMM>/` (the sub-folder pattern is a setting; empty for none).
2. Titles it with the name only, no date.
3. Fills it from the `Meeting notes` template note, created on first use from:

```markdown
- **When:** {{date:ddd, Do MMM}}, {{time:h:mmA}}
- **Who:** 

## Notes

- 

## Decisions

- 

## Action items

- [ ] 
```

4. Tags it `meeting` (or the template's tags).
5. Adds a timestamped link to it in today's daily note (setting).

### 11.4 People

- "New person note" asks for a name and creates a note in the People notebook from the `Person` template note, created on first use from:

```markdown
## Next time

- 

## Meetings

### {{date:ddd, Do MMM YYYY}}

- 

**Actions**

- [ ] 

## About

- **Role:** 
- **Team:** 
```

- If a note with that name exists, it is opened instead.
- "Add today's meeting entry" inserts a dated heading with notes and actions at the top of the Meetings section, newest first, once per day.

## 12. Tasks

### 12.1 What a task is

A task is a markdown checkbox line. It lives in whatever note it was written in; there is no separate task store.

A line is a task when it matches:

```
^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$
```

and the text after the box is not blank. `x` or `X` means done; `-` means cancelled, which every list treats as finished (see [12.3d](#123d-cancelling)). Lines inside fenced code blocks (``` or ~~~) are ignored. Tasks in the Templates notebook are left out of every list. Tasks on canvas cards count.

Details are written on the same line as plain text:

| Detail | Written |
| --- | --- |
| Priority | `P1`, `P2`, `P3` (P1 highest; lower case accepted) |
| Planned day | `>2026-10-08` |
| Someday | `>someday`, in the same place as a planned day |
| Due date | `@due(2026-10-10)` |
| Done on | `@done(2026-10-07)` |
| Cancelled on | `@cancelled(2026-10-07)`; it counts as the day finished, for the Logbook and archiving |
| Repeats | `@repeat(weekly)` ([12.3b](#123b-repeating-tasks)) |
| Reminder | `@remind(2026-10-08 14:30)`; a day alone means 09:00 ([12.3c](#123c-reminders)) |
| Tags | `#atlas`, as for note tags |

The exact patterns, each applied to the text after the checkbox:

```
priority   (^|\s)[Pp]([123])(?=\s|$)
planned    (^|\s)>(\d{4}-\d{2}-\d{2}|[Ss]omeday)(?=\s|$)
due        (^|\s)@due\((\d{4}-\d{2}-\d{2})\)
done on    (^|\s)@done\((\d{4}-\d{2}-\d{2})\)
cancelled  (^|\s)@cancelled\((\d{4}-\d{2}-\d{2})\)
repeat     (^|\s)@repeat\(([^)\n]+)\)
remind     (^|\s)@remind\((\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?\)
tag        (?:^|[\s(])#([A-Za-z][A-Za-z0-9_/-]*)
```

`\d` and the tag characters are ASCII only.

Only the first occurrence of each counts. The task's display text is the line with those seven details removed and spaces collapsed. A reminder is kept as `YYYY-MM-DD HH:MM` (the hour padded to two digits). Neither a repeat nor a reminder changes which lists a task is in. Each task also records the nearest heading above it.

When the app rewrites a task's details it writes: text, priority, planned day or `>someday`, due date, repeat, reminder, done date, in that order. A planned day and Someday replace each other.

### 12.2 Entering details

- Type them by hand, or use the slash menu.
- On a task line, `@repeat(` offers daily, weekdays, weekly, every 2 weeks, monthly, yearly, every monday and 3 days after done, and any typed rule that is understood; `@remind(` followed by a day and time in words (`fri 2pm`, `tomorrow 9:30`, `14:00` for today, a day alone for 09:00) offers it as `YYYY-MM-DD HH:MM`, plus today 17:00, tomorrow, monday, friday and next monday at 09:00. The slash commands Repeat and Remind me insert the start and open those suggestions. Quick task turns `@remind(words)` into a day and time when it saves.
- On a task line, `>` or `@due(` followed by a phrase offers dates: today, tomorrow, weekday names, next week, next month, or any phrase from [section 20](#20-dates-typed-in-words); `>some` offers someday.
- With the cursor on a task (shortcuts in [section 16](#16-keyboard-shortcuts)): tick or untick; move to today (sets the planned day to today and leaves the due date); when (opens the date picker for the planned day, with Someday); due date (opens the date picker); priority (steps P1, P2, P3, none). Tick, move to today and priority apply to every task in a selection. On a non-task line they say so.
- In the editor, details show as small labels: priority badge red for P1, amber for P2, grey for P3; dates as pills, the planned day highlighted when it is today or earlier, the due date red once passed. A done task is struck through and its labels muted.

### 12.3 Ticking

- Ticking writes `@done(<today>)` at the end of the line; unticking removes it. Setting, on by default.
- A selection that mixes ticked and unticked is all ticked; a fully ticked selection is cleared.
- **Sinking** (setting, on): a task that is ticked (in the editor by its checkbox or the shortcut, in the Tasks view, or in the read-only view) moves, with its block (its line and the following non-blank lines indented more), to after the last of the list items that follow it at the same indent; the run of items ends at a blank line, a heading or a line indented less. Unticking does not move it. In the editor the move is a second change after the tick, and the cursor stays at its position, now on the next item. With several lines ticked at once, each is moved, lowest first.

### 12.3b Repeating tasks

A task with `@repeat(rule)` comes back when it is ticked.

- **Rules** (case and extra spaces ignored, an optional leading `every`): `daily`/`day`, `weekly`/`week`, `monthly`/`month`, `yearly`/`year`/`annually`, `fortnightly` (2 weeks), `quarterly` (3 months), `weekdays` (Monday to Friday), `weekends`, `other day|week|month|year` (every 2), `N days|weeks|months|years` (also `Nd`, `Nw`, `Nm`, `Ny`; N ≥ 1), and days of the week (`mon`, `monday, thursday`, `tuesdays and fridays`). Any rule may end in `after done` (also `from done`, `after completion`): counted from the day it is ticked. A rule not understood does nothing.
- **Next date.** The task's date is its due day, else its planned day, else its reminder's day. With days of the week: the first of them after the later of its date and the day it was ticked. After done, or with no date: the rule applied once to the day it was ticked. Otherwise: its date stepped by the rule until it is after both its date and the day it was ticked, so a task ticked late does not come back overdue and one ticked early comes back at its next turn. Months and years keep the day of the month, clamped to the month's last day.
- **On ticking** (every way of ticking: the editor's checkbox and shortcut, the read-only view, the Tasks view, tasks blocks): a new open copy goes in the task's place, with its lines indented under it (sub-tasks unticked, their done days removed), its done day removed, and its due day, planned day and reminder moved by the same number of days so their gaps stay; a task with no date gets the next date as its planned day (a Someday task stays Someday with no date). The ticked line, with its block, follows the copy, without its `@repeat`, so it is the record of that time and does not repeat again; it then sinks as usual. In the editor this is one change: one Undo puts it all back.
- Unticking the record does not remove the copy.
- In the Tasks view and tasks blocks an open repeating task shows a chip with a repeat icon and its rule.

### 12.3d Cancelling

A cancelled task has `-` in its box (`- [-] …`). It is finished with: out of every list but the Logbook, where it shows a "Cancelled" chip (with its day) instead of "Done"; it sinks and is archived as a ticked task is.

- **Cancel or reopen** (command "Task: cancel or reopen", default ⌘⌥↵ in the desktop app and the browser; in the Format menu and the editor's right-click menu; key C, a hover button and the right-click menu in the Tasks view): on a selection, every task is cancelled unless all are cancelled already, in which case they are reopened. Cancelling writes `@cancelled(<today>)` at the end of the line (when recording the day is on), replacing any `@done`; reopening sets the box to a space and removes the date. Ticking or clicking the box of a cancelled task reopens it. A ticked task can be cancelled.
- **Appearance:** the box is drawn with a cross (no tick), the text greyed (lighter than a done task) and struck through, in the editor, read mode, the Tasks view and tasks blocks. In read mode, clicking its box reopens it.
- **Repeating:** cancelling counts as ticking for `@repeat`: the next occurrence is added and the cancelled line kept, without its `@repeat`.
- **Exports** show it with a crossed box. The command-line tool lists it with `[-]`, `done` true and `cancelled` true, `done_on` its cancelled day.

### 12.3f The triage note

A note that a program outside Margin writes with suggested tasks, and rewrites several times a day (by writing a temporary file and renaming it over the note). Its path in the notes folder is the setting `triage.note` in `.margin/config.json` (Settings → Triage → Triage note; compared ignoring capitals, slashes at either end, and a missing `.md`; a path leaving the folder is refused).

- Its tasks are left out of every task list, the counts, tasks blocks, reminders, the Tasks group in ⌘K and the command-line tool (which reads the same setting), until they are moved into another note.
- Margin never changes its layout: ticking, unticking, cancelling or reopening a task there (in the editor, read mode or elsewhere) changes only the box and Margin's own date mark; the task does not sink and a repeat is not added. Archiving skips it, and archiving it directly is refused with a message.
- It is one of the notes checked against its file every 10 seconds (see 2.2), and saves to it are refused when the file has changed since the version they were made from.

**The Triage view** (route `#/tasks/triage`; sidebar entry under Tasks when a triage note is set, with the count of open tasks in the newest run; command "Go to Triage", no default shortcut) shows the triage note read-only.

- **Reading the note** (never changing it): a run starts at a line matching `^## Triage\b`, the rest of the line its label; runs are listed in file order, the first being the newest. Any other `## ` heading ends a run. In a run, a line exactly `**Summary**` before any category starts the summary, its `- ` bullets read until a blank line. `^### +(.+?)\s*$` starts a category. A whole line `^\*\*(.+?)\*\*\s*$` starts a group, of kind quick (label starts "Quick"), action (starts "Action"), fyi (starts "FYI") or other; tasks under a category with no label are an "other" group with no label, and tasks before any category belong to an unnamed category shown as "Uncategorised". A task is a line `^- \[( |x|X|-)\] ` at the left edge (open, done, dropped) plus the following non-blank lines that begin with whitespace (its details). A `- ` line under an FYI group is an information line. Everything else is kept and ignored. Front matter is skipped; CRLF line ends are read the same as LF; the lines are kept exactly, so writing them back gives the same bytes.
- **A task's parts:** its links (every markdown link, label and address), its tags (`#word`), its priority (a standalone `P1`–`P4`, 1 highest), Margin's own details (planned day, Someday, due, done day) by the task rules, its title (the text without those, without the links and the " - " before them; a title may itself contain " - "), its details (lines without their indent and a leading "- "), and "carried from" (a detail line `_carried from <label>_`, not shown as a detail). Its identity is its first link's address and its title (lower case, spaces collapsed); identical tasks get a number after the first.
- **Layout:** header with the newest run's label and counts (open, done, dropped) and an "Open the note" button; the Summary, foldable; filters; then the newest run's tasks by category (foldable, open count), by group in the order quick, action, other, each with its label. Rows: a read-only box (crossed when dropped), the priority badge (P4 grey), the title on one line, a chip per link (label; opens the address in the browser), planned and due chips, tag pills, a "carried" chip whose tooltip names the run. Clicking a row or ↵ shows its details, the links in full and where it was carried from. FYI lines are folded at the end of each category.
- **Filters:** free text (title, category, group, tags, link labels, details), category, kind (quick, action, other), priority (P1, or Pn or higher). **Done & dropped** shows closed tasks; **Older runs** shows earlier runs below, each headed "Earlier run: <label>". The filters, toggles and folds are kept in local storage.
- **Keys:** ↑ ↓ or J K, Home, End, ↵ (details), O (open the first link), / or Mod+F (the filter box); Esc, ↓ or ↵ in the box returns to the list; Space or X (complete, or reopen a done or dropped task), C (drop, or reopen a dropped one), S (planned day or Someday, date picker), D (due date, date picker). Actions apply to tasks of the newest run only; earlier runs are read-only (their boxes disabled).
- **Actions:** complete writes `[x]` and `@done(today)`; drop writes `[-]` and `@cancelled(today)`, replacing a done date; reopen writes `[ ]` and removes Margin's date (dates only when recording them is on, as for any tick). A planned day or Someday replaces the existing `>…` token in place, or is added at the end of the line; a due date likewise with `@due(…)`; removing one removes its token. No other character of the line or the note changes, and a CR line end is kept. The same actions are on hover buttons (drop, when, due) and the box, and in a right-click menu (complete or reopen, drop, when, due, open each link, show in the triage note). Each is followed by a message with Undo, which applies the opposite action the same way.
- **Where a task goes** (settings in `.margin/config.json` under `triage`, read again whenever the state is fetched; Settings → Triage edits them): `rules` (in order; each one of `category` (equal, ignoring case and surrounding spaces), `tag` (one of the task's tags equal, or under it as `tag/…`, ignoring case and a leading #) or `title` (contained, ignoring case), with `note`, a path, and `id` when made in Margin: the note is found by id when that note exists, else by path); `workstreamNotebook` (a note in that notebook or one inside it, titled like the task's category, ignoring case); `default` (a path). The first rule matching the task whose note exists wins, then the notebook, then the default; never the triage note. Settings → Triage lists the rules (kind, value, note with suggestions; ↑ ↓ ×; Add a rule), marking in red those whose note is missing, and has the notebook, default note, `heading` (default Open Threads), `position` (bottom, or top: just under the heading), `strip` (words removed from the task line as whole words, then runs of spaces collapsed to one) and `addLine` (a line `  - _from triage, <date>_` added under the task).
- **M** moves the selected task where the rules send it (the row shows that note in a dashed chip; the message ends "(by <rule>)"), or opens the picker when nothing decides; **⇧M** always opens the picker. In the picker, when the task has a category, each note offers ⌥↵, which adds a rule `{category, note, id}` (replacing one for the same category) and then moves the task.
- **Moving a task** (M, or ⇧M; a hover button; Move… in the right-click menu): opens the note picker (notes other than the triage note, scratch notes and templates, latest edited first, each with "notebook · under Open Threads"; a typed name not matching a note offers New note, in the notebook typed as `Notebook/Name`, or else the notebook of the project note edited last, made with the heading). On choosing: unsaved changes to either note are saved first (refusal or failure stops the move). The triage note is read fresh and the task found again (as for actions); its block (the task line and the indented lines under it, CR line ends dropped) is the text moved. The destination is read fresh; if its page has an open task line containing `](<first link's address>)`, nothing is added (the task only leaves the triage note, and the message says it was already there). Otherwise the block (after the move options) is inserted after the last non-blank line (or, with position top, before the first line) of the section under the configured heading ("Open Threads" by default) (matched ignoring case and #s; the section runs to the next heading of the same or a higher level), or, with no such heading, `## <heading>` and the block are added at the end of the page after a blank line; the page's own ending is kept, and a canvas is untouched. The destination is saved with its version as base (on refusal: read again, insert again, up to three times). Only then is the triage note read again, the task found again and its block removed (nothing else, blank lines and headings included), saved likewise; a task no longer there is not an error. The message ("Moved “…” to <note> › Open Threads") offers Undo, which writes both notes back to their earlier content, the triage note first, only if both are still exactly as the move left them; otherwise it does nothing and says the task is in the note it went to. Moving into the triage note itself is refused.
- **How an action writes:** unsaved changes to the triage note are saved first (if that save is refused or fails, the action does not run and says why). Then the note is read from disk (`GET /api/notes/:id/fresh`), the task is found again (same identity, preferring the same run and category; then the same identity anywhere; then the same first line), its line changed, and the note saved with the version read as its base. A refused save (the file changed in between) repeats this, up to three times. If the task is not found, nothing is written and a message says the note was rewritten.
- **Following the note:** it re-reads the note whenever its file changes (see 2.2), keeping the selection and opened details by task identity, the folds by category name (in the newest run), the filters and the scroll position.
- **Empty states:** no triage note set (with Open Settings); no note at the path (it appears when written); no runs in the note (with Open the note); no tasks matching.

### 12.3e Bringing tasks in from Todoist

Tasks captured in Todoist (on a phone) are moved into the Inbox note.

- **Settings,** kept by the server on each computer in its own folder (`todoist.json` in the app's data folder, readable only by the user), never in the notes folder: an API token, whether the import is on, a project name (default "Margin") and a label (optional, a leading `@` dropped). The page never receives the token, only whether there is one. A new token is checked with Todoist (a project list request) before it is kept; a refused token is not saved and the error says where to copy it from. After a change the server says whether a project of that name exists (compared ignoring case and surrounding spaces). Removing the token turns the import off. Settings → Capture & scratch has the token field (Connect, or Connected with Remove), the on/off switch, the project and label fields, Check now, and a line describing the last check.
- **Which tasks:** open tasks in the project, and open tasks with the label, from Todoist API v1 (`GET /tasks` by `project_id` and by `label`, all pages). Repeating tasks (`due.is_recurring`), and sub-tasks of them, are left in Todoist and counted.
- **When:** at start once the notes have loaded, every 5 minutes while the app runs, and on the window gaining focus if the last check was over a minute ago; and on demand with the command "Todoist: check for new tasks now" (no default shortcut; it says so when the import is not set up on this computer) or the Check now button. One check at a time.
- **Each check:** tasks already brought in on this computer (their ids remembered for 30 days) are not added again. The others are written at the end of the Inbox note (made if needed) as task lines, one per task, sub-tasks indented two spaces under their parent, in Todoist's order: the text (on one line), the task's other labels as tags followed by `#todoist` on each task brought in (not on its sub-tasks; each tag once, and not when the text already has it) (characters other than letters, digits, `_`, `/` and `-` become `-`; leading non-letters dropped; not repeated if already in the text), the priority (Todoist 4, 3, 2 as `P1`, `P2`, `P3`), the date as the planned day `>date`, the deadline as `@due(date)`, a time as `@remind(date HH:MM)` (a floating time as written; a fixed-zone time in this computer's time), and the description's non-blank lines indented under it. The note is then saved and the server's confirmation awaited; only then are all the tasks fetched closed in Todoist, each separately (`POST /tasks/{id}/close`). Ones that fail stay remembered and are closed on a later check. A message says how many were added, with Open.
- **Errors** (no connection, token refused, Todoist error, the note not saved) leave the tasks in Todoist and are shown on the settings line, and in a message when the check was asked for.
- `MARGIN_TODOIST_API` points the server at another address, for tests only.

### 12.3c Reminders

A task with `@remind(YYYY-MM-DD HH:MM)` gives a notification at that time on this computer's clock.

- **When:** checked when the notes load and every 20 seconds while the app runs (in the desktop app also while its window is closed). A reminder fires once on a computer, when its time has come and is less than a day ago; one missed while the app was not running is shown when it starts, if it is less than a day old. Ticked tasks give none. A reminder is identified by its note, its text and its time, so changing the time or the text makes it new. The record of shown reminders is kept in local storage for three days.
- **How:** in the desktop app, a system notification with the task's text as title and the time and note as body; clicking it brings the window forward and opens the note with the cursor at the end of the task. In a browser, a web notification when allowed (clicking it does the same); otherwise an in-app message with Open, and the browser is asked once for permission.
- In the Tasks view and tasks blocks an open task with a reminder shows a chip with a bell, its day and time; the day is highlighted when it is today.
- Repeating tasks move their reminder with their other dates.

### 12.3a Archiving

- **The Archive section** is the first heading named `Archive` (any level, any case, outside code blocks) in the page; it is created as `## Archive` at the end of the page when needed, after a blank line.
- **What is archived:** a ticked task outside the Archive section, outside code blocks, whose nearest less-indented list line is not an open task, and whose block contains no open task. Its block goes with it, unindented to the left edge.
- **Where:** under a heading one level below the Archive heading, named after the heading the task was under (made at the end of the Archive section if missing, otherwise the task goes at the end of that subheading's text); a task above any heading goes directly under the Archive heading, before its subheadings. Doubled blank lines left behind are closed up.
- **Commands:** *Archive done tasks in this section* (the section of the heading at or above the cursor; the whole page if there is none), *in this note*, and *in all notes…*, which takes only tasks with `@done(date)` earlier than today minus the "archive after" setting (default 7 days; 0 for any), in every note except daily notes, scratch notes and templates, after a confirmation stating the number of tasks and notes. After archiving, the Archive heading is remembered as folded for that note. Each ends with one Undo over all the notes it changed (only if none has been edited since).
- **Move this note to the Archive** (ordinary notes): moves the note to `<archive notebook>/<its notebook>` (setting, default `Archive`); not when it is already inside it. With open tasks, a confirmation says how many and that they stay in the lists. Undo moves it back and removes the notebooks the move created if they are empty.
- Archived tasks are ordinary task lines: they stay in the Logbook and count wherever ticked tasks count.

### 12.4 The lists

Given today's date `now`:

| List | A task is in it when |
| --- | --- |
| Inbox | Not done, in the Inbox note, no planned day, not Someday |
| Today | Not done, and planned on or before `now`, or due on or before `now` |
| Upcoming | Not done, and planned after `now` |
| Anytime | Not done, not Someday, not planned after `now`, and not in the Inbox |
| Someday | Not done, and marked Someday |
| Logbook | Done |
| Overdue | Not done, and due before `now` |
| This week | Not done, and due or planned within the current week |
| Next 30 days | Not done, and due or planned from `now` to `now` + 30 days inclusive |
| No date | Not done, no due date, no planned day, not Someday, not in the Inbox |
| All open | Not done |

"The Inbox note" is the note titled `Inbox` in the notebook named by the Inbox notebook setting (default `Inbox`), both compared ignoring capitals and stray spaces, as macOS compares folder names. Other notes in that notebook, and notebooks inside it, are not the Inbox. When other notes in the Inbox notebook hold open tasks, the Inbox list offers to move them all into the Inbox note (as Move to another note does, with one Undo). A note created in or moved into a notebook whose name differs from an existing one only in capitals goes into the existing one, under its spelling.

Consequences that must hold: a planned day passing never makes a task overdue, it stays in Today until ticked; a task with only a future due date is in Anytime, unless it is in the Inbox; an Inbox task leaves the Inbox when it is given a planned day or Someday, or moved to another note, and nothing else is needed; an Inbox task due on or before `now` is in both the Inbox and Today; Today's tasks are also in Anytime; a Someday task with a due date appears in Today once that date arrives.

**Order.** Lists sort by the day a task next needs attention: a passed due date first; otherwise the earlier of its planned day (a passed planned day counts as today) and its due date; undated last. Then higher priority, then note, then position in the note. The Logbook sorts by done date, latest first, with undated last.

### 12.5 The Tasks view

- A header with the open and overdue counts, and a **Save filter** button.
- A row of chips, one per list in the order of the table above, each with its count (none for the Logbook). Keys: 1 Inbox, 2 Today, 3 Upcoming, 4 Anytime, 5 Someday, 6 Logbook, 7 Overdue, 8 This week, 9 No date, 0 All open; Next 30 days has none.
- A narrow-down box: words must all appear in the task text or its note's title; `#tag` requires that tag or a nested one; `p1`, `p2`, `p3` require that priority or higher. Tag chips below it toggle a tag.
- **From:** All, Notes (not daily notes), Daily (only daily notes).
- **Group by:** Date (Overdue, Today, Tomorrow, Later this week, Later, No date, Someday; in the Logbook, by done date, latest first, with "Day not recorded" last), Project (see below), Priority, None. Groups fold.
- **A row** shows a checkbox, a yellow star when the task is also in Today (in every list but Today and Overdue, as Things marks Today's to-dos in Anytime and projects), the priority badge, the task text rendered as inline markdown, date labels, and the note and heading it comes from. On hover: buttons for priority, when, due date, and move to another note. Clicking the row opens its note at that line; ⌘-click opens it to the side at that line.
- **Move to another note:** opens the palette listing notes (not scratch notes or templates, most recently edited first, with their notebook), filtered as you type. Choosing one removes the task's line, with the indented lines under it, from its note and adds them at the end of the section under the chosen note's `Open Threads` heading (any level, capitals ignored), after what is already there and before the next heading of the same or a higher level; when the section is empty a blank line separates heading and task. A note without that heading gets `## Open Threads` at the end of its page, after a blank line, with the task under it. The lines go in at the left margin, the lines under the task keeping their indent relative to it. When the typed text matches no note's title, a "New note" item makes a note of that name containing `## Open Threads` and the task: in the notebook typed before a slash (`People/Sam`), otherwise in the notebook of the most recently edited project note, otherwise at the top level. A message offers Undo, which restores both notes if neither has changed since. (The Inbox list's "Move them into Inbox" adds at the end of the Inbox note, with no heading.)
- **Bulk move:** when overdue tasks are shown, "Move all…" opens the date picker and gives each a new due date, with Undo.
- **Task notes**: the lines indented under a task in its note, up to the first blank or less indented line, with sub-task lines left out and the common indent removed. A task that has any shows a notes icon after its text; its tooltip shows them as written, and clicking it (or N) shows them rendered as markdown under the task, in a quieter, smaller style with a rule on the left. Clicking the notes does not open the note; links in them work. Nothing is stored: they are read from the note each time. The same applies to task rows in the panel under daily notes, where each row keeps its own open state.
- **Keys** on the highlighted row: ↑ ↓ (J K), Home, End, Space or X to tick, T for today, S for when, D for due, P for priority, M to move to another note, N to show or hide its notes, Enter to open, ⇧Enter to open to the side, `/` to focus the box (↓ or Enter returns to the list). After a menu or picker closes, focus returns to the list. A line at the bottom lists the keys.

**Group by Project.** A *project* is an ordinary note (not daily, research or scratch) outside the Daily, Meetings, Inbox, Templates, Scratch and People notebooks and the notebooks inside them. Each task is listed under:

1. its own note, when that note is a project;
2. otherwise, the projects linked (`[[Title]]`) on the task's own line, if any;
3. otherwise, when its note is in the Meetings notebook, the projects that note links anywhere;
4. otherwise, its own note; daily notes that come to this are gathered into one "Daily notes" group, latest day first.

A task can so be listed under several projects. Laid out as in Things: each notebook (the area) is a heading with a box icon over its projects (shown once, before the first project in it; top-level notes have none), at 9/8 of the note text size, bold. A project's group shows its progress circle in the accent colour (ticked over all tasks listed under it, including linked ones), its title at 17/16 of the note text size, bold, and the count of tasks shown. Its headings are bold, in the accent colour at 15/16 of the note text size, with a rule under them and an icon: a section of the note, a meeting ("From <meeting>"), a day, or another note. All of these use the note font. They share one grid: the fold arrow in a 22 px gutter; the progress circle, each heading's icon and each task's checkbox centred in a column as wide as the checkbox (the note text size); and the project's title, the headings' text and the tasks' text starting 12 px after that column. When not grouped by project, each task's note and heading are shown under it with a note icon. Inside it, its own tasks come first in written order under their headings, then the linked ones under "From <note>", latest note first. Nothing in any note changes. The command-line tool's `--group note` groups by each task's own note.

### 12.6 Saved filters

A saved filter is a list, a narrow-down text, a From value and a grouping, with a name. It appears under Tasks in the sidebar with a live count. Opening one and changing anything offers **Update filter**. It can be renamed, saved as new, or deleted (with Undo). Stored in app settings.

### 12.6a Tasks blocks

A fenced code block whose info string is `tasks` is a live list of tasks. Its text is a filter; the note stores only the filter.

- **Filter words**, in any order, on one or more lines (lines starting `//` are ignored): one list name (`inbox`, `today`, `upcoming`, `anytime`, `someday`, `logbook` or `done`, `overdue`, `this week` or `week`, `next 30 days` or `month`, `no date` or `undated`, `all open` or `open`; default all open; a second is reported); `#tag`, `p1`–`p3` and words as in the Tasks view's narrow-down; `[[Title]]` links (several allowed; tasks in that note, tasks whose own line links to it, and tasks in a meeting note that links to it); `from: all|notes|daily`; `group: none|date|project|note|priority`; `limit N` or `limit: N`. Any other `word: value` is reported as not understood. A link to no note is reported.
- **Obsidian Tasks queries** (lines such as `not done`, `due before …`, `sort by …`, `path includes …`) are recognised and shown with a note that Margin does not run them.
- **Order:** as the Tasks view (most urgent first; the Logbook latest first). Without a limit, at most 200 are shown, with the number left out.
- **Shown** as a panel like the daily note's task panel: a header with a list icon, the filter described (list, links, words), the count open (or done, for the Logbook) and, in the editor, a pencil button; then the task rows of the Tasks view (tick, priority, when, due, move, click to open), under group headings when grouped, each with its note. Grouped by date, under the Tasks view's date headings; by priority, under P1, P2, P3, No priority; by project, under the projects the Tasks view would list it under (its project note, the projects a task line or a meeting note links to, otherwise its own note; daily notes under one "Daily notes" heading), headings ordered by notebook then title, a task showing its own note only when that is not the project.
- **Suggestions** while typing on a filter line: tags after `#` (also at the start of the line, unlike elsewhere), note titles after `[[`, the list names (matching the words before the cursor, so `next 3` offers `next 30 days`) with each list's description, `group:`, `from:` and `limit`, and the values after `group:` (date, project, priority, none) and `from:` (daily, notes, all).
- **Editor:** the block is replaced by the panel unless the cursor or selection is on one of its lines; the pencil puts the cursor at the end of the filter line. An unclosed fence stays text.
- **Read mode:** the same panel, without the pencil; ticking it changes the task's own note, never the note holding the block.
- **Exports:** the tasks at the time of export as a disabled checkbox list, each with priority, dates and note, under the filter described.

### 12.7 Date picker

A small popover with: a text box that accepts a day in words and shows the date it understood, quick choices (Today, Tomorrow, Next week, and Someday when planning), a month grid with previous and next, and a Remove link when a date is set. Arrow keys move the highlighted day, PgUp and PgDn change month, Enter sets, Esc closes. Text that is not a date turns the box red and Enter does nothing.

## 13. Organising

- **Notebooks:** create, nest, rename, delete (its notes go to the trash, after confirming with the count). Right-click offers: new note here, new notebook inside, rename, tags for notes here, delete.
- **Move** a note by the palette, by dragging onto a notebook, or from the breadcrumb.
- **Pin** a note to keep it in the sidebar and on Home.
- **Duplicate**, **copy a link** (`[[Title]]`), and **reveal the file** in the system file manager (desktop).
- **Rename** by editing the title, or by a dialog with the name pre-selected.
- **Delete** moves to the trash, closes the tab, and shows Undo.
- **Reorganising** (commands, no default keys; each ends with one Undo that restores the content, notebook and tags of every note it changed, removes the notes it made, brings back the note it removed, and removes a notebook it made once empty; nothing is undone if one of those notes was edited since). Sections are a heading (outside code blocks) down to the next heading of the same or a higher level; headings are matched as in section 5. All four work on the page, not the canvas.
  - **Extract to a new note:** with a selection, the selected text becomes a new note and is replaced by `[[Title]]`. With none, the section around the cursor: its text under the heading (blank lines trimmed, headings shifted so its subheadings start at `##`) becomes the new note, and the heading stays with `[[Title]]` as its only text. A dialog asks for the title, offering the heading's text or the selection's first line (list and task markers removed, up to 60 characters). The new note goes in the same notebook (the top level for daily, research and scratch notes). A title already used gets a number.
  - **Move this section to another note:** a palette like Move to note lists notes (not scratch notes or templates, latest edited first); typing a name that matches none offers a new note, `Notebook/Name` choosing the notebook. The section, heading included, is appended to the end of the target's page and removed from the source, closing up blank lines.
  - **Turn this note into a notebook** (ordinary notes only): after a confirmation naming the new notes, makes the notebook `<the note's notebook>/<the note's title>` and, for each heading at the page's shallowest level, a note titled with the heading's text (link brackets and emphasis removed) holding that section's text (heading removed, subheadings shifted to start at `##`). A title already used by another note gets ` (<original title>)`, then a number. The original note keeps its id and title, moves into the notebook, and its page becomes the text above the first such heading followed by `## Notes` and a `- [[Title]]` line per new note; its canvas stays with it.
  - **Merge this note into another** (not when this note has a canvas): a palette picks the target. The source's page is appended under `## <source title>`, its headings shifted down so the shallowest is `###`; the target gets the union of both notes' tags; in every other note, `[[Source]]`, `[[Source|label]]` and `[[Source#heading]]` are rewritten to the target's title (case-insensitive); the source goes to the trash.

## 14. History, trash, export, import

### 14.1 Version history

- Version history and deleted notes are kept **on each computer, outside the notes folder**, so a synced notes folder holds no copies of notes (Google Docs lists anything that reads as Markdown, whatever its extension). They are in the app's own data folder (on a Mac, `~/Library/Application Support/Margin/Notes folders/<notes folder name and code>/`, with `history/<note id>/<timestamp>.snapshot` and `trash/<time>-<name>.md.deleted`), one folder per notes folder, named after it with a short code from its full path. Each computer keeps its own. When the app starts, it moves any `.history/` and `.trash/` left inside the notes folder by older versions into that folder (keeping files already there) and removes them, and renames `.md` files there to these extensions.
- Each save writes a snapshot of the note into its history folder, at most one per 5-minute window (later saves in the window overwrite it). The state before the first tracked edit is kept too. The newest 200 are kept.
- The history window lists versions by time, shows a diff against the current text, and restores one.

### 14.2 Trash

Deleted notes and folders move to this computer's trash folder for the notes folder (see 14.1). Expired scratch notes go there too. Settings shows that folder's path, with a button to copy it.

- Moving between the notes folder and the trash works across disks (copy, then remove the original only once the copy is in place). If a note cannot be moved, deleting it fails with a message and nothing else happens; deleting a notebook stops before its folder is removed.
- The trash keeps, for each deleted note, the path it had (`trash/index.json`), so it can go back to its notebook.
- **Recently deleted** (`#/trash`; sidebar entry under Scratch while the trash holds anything, hideable like the other sections; ⌘K "Go to Recently deleted", shortcut assignable): the trashed notes, newest first, with title, the notebook they came from ("Notebook not known" for notes trashed before this was recorded), when deleted, and a line of text; a filter box; ↑ ↓ (J K) to move, Enter to show the note read-only under its row, `/` to filter.
- **Restore** moves the file back into its notebook (made again if missing; top level when not known), keeping its id and so its version history. If a file of that name exists there, it is restored as "<name> (restored)". A message offers Open.
- **Undo** after deleting restores the same file from the trash.
- **Delete for good** (one note) and **Empty trash** (all) ask first.
- Setting **Remove deleted notes after** (never, the default; 30 days, 90 days, 1 year): when the app opens, trashed notes deleted longer ago than that are removed.

### 14.3 Export

From a note: Markdown file, HTML page (self-contained), PDF (saved directly in the desktop app; print dialog in a browser), Word-compatible `.doc`, and "Copy for Google Docs" (rich text on the clipboard).

### 14.4 Import from Obsidian

Copies a chosen Obsidian vault into a chosen notebook (or the top level). The source is only read.

- Notes keep their folders, frontmatter tags and dates.
- `![[image.png|300]]` becomes a markdown image with that width, and the file is copied into attachments (de-duplicated).
- `![[Note]]` becomes `[[Note]]`. `[[folder/Note|alias]]` becomes `[[Note|alias]]`.
- Relative image and file links are copied and rewritten.
- A `.canvas` file becomes a note that opens on its canvas, with the same cards, colours and connections.
- Notes named `YYYY-MM-DD` become daily notes.
- Callouts stay as quotes and plugin syntax stays as text.
- A summary reports notes, canvases and files imported, links not found, and files that could not be read.

## 15. Settings

A settings window with a search box that finds any setting or shortcut by name, and sections: General, Appearance, Text styles, Editor, Daily notes, Templates & meetings, Capture & scratch, Files & data, Shortcuts. Changes apply at once. Settings are stored per app on one computer (browser local storage in the reference implementation), except the folder config in [section 3.4](#34-folder-config).

| Setting | Values | Default |
| --- | --- | --- |
| Start page | Home, today's note, last note | Home |
| New notes go to | Current notebook, top level | Current |
| Inbox notebook | name | `Inbox` |
| Sidebar sections shown | any of the 11 | all |
| Week starts on | Auto, Sunday, Monday | Auto |
| Sidebar calendar | on, off | on |
| Time format | 24-hour, 12-hour | 24-hour |
| Typed dates are day first | on, off | on |
| Tabs | on, off | on |
| Record when tasks are done | on, off | on |
| Theme | Match system, Light, Dark | Match system |
| Accent | System (desktop app only: the accent colour from the computer's own settings, followed live), Blue, Indigo, Bright blue, Teal, Green, Orange, Rose, Graphite | Blue |
| Note font, code font | any installed font, or system | system |
| Text size | px | 16 |
| Text weight | 300 to 700 in steps of 10 | 400 |
| Line spacing | number | 1.7 |
| List indent | px per level | 28 |
| Indent guides | on, off | on |
| Image border | None, Hairline, Shadow | Hairline |
| Table width | Fit contents, Full width | Fit contents |
| Page width | characters per line: 70, 90, 120, 160, full, or any number | 90 |
| Text styles | colour (light), colour (dark, or auto), size %, for Heading 1 to 5, Bold, Italic | sizes 155, 130, 110, 100, 100, 100, 100; no colours |
| Formatting toolbar | on, off | on |
| Spell check | on, off | on |
| Auto-close brackets | on, off | on |
| Short links | on, off | on |
| Paste images at actual size | on, off | on |
| Name pasted images after the note | on, off | on |
| Line numbers in source mode | on, off | off |
| Daily notes open as | Canvas, Page | Canvas |
| Daily notebook | name | `Daily` |
| Carry the Top 3 forward | on, off | on |
| Daily template text (used only if no `Daily` template note) | text | empty |
| Templates notebook | name | `Templates` |
| Meetings notebook | name | `Meetings` |
| File meetings by date | date pattern, or empty | `YYYY/MMM` |
| Link new meetings from today's note | on, off | on |
| People notebook | name | `People` |
| Add the time to captures | on, off | on |
| Scratch notes expire after | days | 7 |
| Scratch notebook | name | `Scratch` |
| Notes folder | path (desktop: picker; restarts the app) | see section 3.1 |
| Attachments folder | name | `attachments` |
| Shortcuts | per action | section 16 |

Notes:

- **Text weight** applies to note text at its full value and to the rest of the interface up to 540.
- **Text style colours:** the dark colour defaults to a lightened version of the light one.
- **Font picker** lists the fonts installed on the computer, with a search box.
- A "Reset settings" action restores defaults.

## 16. Keyboard shortcuts

Every action below can be reassigned or cleared in Settings → Shortcuts, which has its own search box and records the keys you press. A shortcut needs a modifier or a function key. The desktop menu bar shows the current keys. `Mod` is ⌘ on a Mac and Ctrl elsewhere. The browser version avoids keys the browser keeps for itself.

### 16.1 Reassignable

| Action | Desktop | Browser |
| --- | --- | --- |
| Search, switch notes, run commands | Mod+K | Mod+K |
| Back / Forward | Mod+[ / Mod+] | same |
| Home | Mod+Shift+H | Alt+H |
| Today's daily note | Mod+D | Alt+D |
| Journal | Mod+J | Alt+J |
| Calendar | Mod+Shift+L | Alt+L |
| All notes | Mod+Shift+A | Alt+A |
| Tasks | Mod+Shift+T | Alt+I |
| Research | Alt+R | Alt+R |
| Scratch | none | none |
| Previous / Next tab | Mod+Shift+[ / Mod+Shift+] | Alt+[ / Alt+] |
| Close tab | Mod+W | Alt+W |
| Close other tabs, Close all tabs | none | none |
| New note | Mod+N | Alt+N |
| Quick capture | Mod+Shift+C | Alt+C |
| Quick task | Mod+Alt+C | Alt+Shift+C |
| New scratch note | Mod+Alt+N | Alt+S |
| New canvas | Mod+Shift+N | none |
| New meeting note | Mod+Shift+M | Alt+T |
| New person note, New from template, New research note, New notebook | none | none |
| Add today's meeting entry | none | none |
| Open to the side / close side pane | Mod+Alt+\ | same |
| Swap panes | none | none |
| Jump to a heading | Mod+Shift+O | same |
| Search in this note / backward | Ctrl+S / Ctrl+R on Mac; Mod+S / Mod+R elsewhere | same |
| Heading 1 to 5 | Mod+1 to Mod+5 | Mod+Alt+1 to Mod+Alt+5 |
| Insert a web link | Mod+L | Alt+K |
| Bulleted / Numbered / Task list | Mod+Shift+8 / 7 / 9 | same |
| Tick or untick the task | Mod+Enter | same |
| Task: move to today | Mod+Alt+T | Alt+Shift+T |
| Task: when | Mod+Shift+S | Alt+Shift+S |
| Task: due date | Mod+Shift+D | Alt+Shift+D |
| Task: priority | Mod+Shift+P | Alt+Shift+P |
| Move unfinished Top 3 to today | none | none |
| Fold or unfold here | Mod+' | same |
| Fold (again: the container) / Unfold | Mod+Alt+↑ / Mod+Alt+↓ | same |
| Fold all, Unfold all | none | none |
| Cycle a section / the whole note (on a heading line) | Tab / Shift+Tab | same |
| Fold below this level, Fold to level 1, 2, 3 | none | none |
| Switch writing / reading | Mod+E | same |
| Switch page / canvas | none | none |
| Side panel | Mod+. | same |
| Version history | Alt+V | same |
| Move to notebook | Alt+M | same |
| Rename | F2 | same |
| Add a tag | Mod+T | Alt+G |
| Duplicate, Copy link, Pin, Delete | none | none |
| Export as PDF | Mod+P | none |
| Show or hide the sidebar | Mod+\ | same |
| Settings | Mod+, | same |
| Keyboard shortcuts | none (also `?`) | same |

### 16.2 Fixed

| Where | Key | Does |
| --- | --- | --- |
| Anywhere | Alt+1 to Alt+9 | Jump to that tab |
| Anywhere, not typing | `?` | Keyboard shortcuts window, with a find box that has focus: typing narrows the list to shortcuts whose group, name or keys contain the text (ignoring case); Esc clears it, then closes the window |
| Anywhere (Mac) | Ctrl+[ / Ctrl+] | Back / forward, unless reassigned |
| Editor | `/` | Slash commands |
| Editor | `[[` | Link to a note |
| Editor | Mod+B, Mod+I | Bold, italic |
| Editor | Mod+Shift+K | Wrap selection in a note link |
| Editor | Mod+F | Find and replace; elsewhere, find in what is in front (see section 5) |
| Editor | Ctrl+A (Mac) | Start of text, then start of line |
| Editor | Tab / Shift+Tab | Nest / un-nest a list item |
| Editor | Alt+↑ / Alt+↓ | Move a line or list item |
| Editor | Mod+click | Follow a link while editing its line |
| Lists of notes | ↑ ↓ or J K, Enter, `/` | Move, open, filter |
| Tasks view | see section 12.5 | |
| Canvas | Double-click, N, Enter, Esc, ⌫, scroll, Mod+scroll | See section 10 |
| Quick capture | Enter, Shift+Enter, Tab, Alt+↓, Esc | See section 11.1 |
| Desktop, any app | Ctrl+Alt+N | Quick capture |
| Desktop, any app | Ctrl+Alt+Space | Quick task |

## 17. Appearance

- **Themes:** light, dark, or follow the system. Applied before first paint to avoid a flash.
- **Palette**, measured from Things 3:

| | Light | Dark |
| --- | --- | --- |
| Page | `#ffffff` | `#161617` (near-black) |
| Sidebar | `#f9f9fb` | `#161617`, with a darker dividing line |
| Text | `#15171a` | `#f8f8f9` (almost white) |
| Secondary text | `#3c3e41` | `#d8d8da` |
| Muted text | `#8e9093`, `#b7b8ba` | `#98989b`, `#69696b` |
| Borders | `#ebecee`, `#d3d5d8` | `#0c0c0d`, `#4a4b4d` |
| Panels and pop-ups | `#ffffff` | `#222224` |
| Selected row | about `#dfe1e7` | about `#393b3d` |
| Default accent | `#255fb3` | `#5b9df0` |
| Danger | `#e0345a` | `#f0577a` |
| Inbox | `#1b89f0` | `#3d9cf3` |
| Today / Upcoming / Anytime / Someday / Logbook | `#fed301` / `#d92f5c` / `#39a69c` / `#cbbf7f` / `#4dbc61` | `#fed402` / `#d73d67` / `#4eb0a4` / `#d1c68a` / `#4dbd61` |

- **Native behaviour:** the cursor is the arrow over every control and only becomes the pointing hand over links inside notes. Dividing lines are 1 px, or 0.5 px on high-density screens with a slightly stronger colour. Hover shading is faint (about 5% tint). When the window is not the front window, the selected sidebar row and tab fall back to the hover tint, coloured icons desaturate and the primary button dims. Menus and dialogs appear with a short (0.12 s) fade and slight scale, disabled when the system asks for reduced motion.
- **Typography:** the system font by default. Interface text uses one scale of sizes (11, 12, 13, 14, 15, 17, 24, 28 px) and the weights 400, 500, 600 and 700 only; letter-spacing is slightly tight (-0.006em) and tightens further on large titles, small capital labels are spaced out, and digits in the interface are tabular. Note text keeps the font's own spacing and digits. Spacing is in multiples of 4 px; buttons are 30 px tall (26 px small) with a 7 px radius. Interface text is 15 px; sidebar rows are 34 px tall (30 px for the lists under Tasks); labels in the sidebar, tabs and panels are at least medium weight (500). Note text is 16 px by default (the Text size setting) at 1.7 line height, with headings sized as a percentage of body text. The note column has 72 px of side margin. Tasks are lines of notes, so in the Tasks view a task's text uses the note font and weight at 15/16 of the note text size, and its labels (dates, note name) 13/16; in a note's task panel the task text is the full note size. What is typed in Quick capture and Quick task is note text too: the full note font, size, weight and line height, and a task's notes at 7/8 of the size. All of these follow the Text size, font and weight settings.
- **Page width** is measured in characters of the chosen font, so "90" means 90 average characters per line.
- **Help pages** follow the app's theme, not only the system's. Each page has its own find bar: ⌘F (Ctrl+F) opens it at the top right; matches are highlighted as you type, ignoring case, with "n of m" or "No matches"; the first match below the top of the window is current; Enter and ⇧Enter (or ⌘G and ⌘⇧G) move between matches, wrapping; Esc closes it and removes the highlighting. It is part of the page, so it also works in a browser and in the printable HTML copies, and it is hidden when printing.
- A simple logo: a rounded square with a page-and-margin mark, used as the app icon.

## 18. Desktop shell

- Single window; a second launch focuses the existing one.
- Window size and position are remembered.
- **Menu bar:** App (about, settings, quit), File (new items, choose notes folder, show notes folder, close tab, close window), Edit (standard, plus Find… ⌘F, which finds in the window in front: the note or list in the main window, or the guide in a guide window), Format (one flat list, no submenus, in separated groups: Bold, Italic, Strikethrough, Inline Code | Heading 1 to 5 | Bulleted, Numbered and Task List, Quote, Code Block | Link to a Note, Web Link, Table, Math, Divider | Today's Date, Current Time | Tick or Untick Task, Move Task to Today, Task When…, Task Due Date…, Change Task Priority | Fold or Unfold, Fold, Unfold, Fold All, Unfold All; each acts on the active pane's editor), View (sidebar, side panel, mode, zoom, full screen, reload, developer tools), Go (back, forward, each view, tabs), Window, Help (User Guide, Theory of Operations, Design Guide, Printable Guides…, Keyboard Shortcuts, Command-Line Tool…). Menu items show the user's current shortcuts; the keys themselves are handled by the page so they can be customised, and an action triggered by both within 300 ms runs once.
- **Right-click in a note:** spelling suggestions, Cut, Copy, Paste, Paste as Plain Text, Look Up, "Search Notes for…", and Format, Paragraph and Insert submenus, the same commands as the Format menu. On a link: Open, Open to the Side, Copy Link. On an image: Copy Image.
- **Choosing a notes folder** saves the choice and restarts the app on it; nothing is moved.
- **PDF export** saves directly to a chosen file.
- **Web links** open in the default browser; only the app's own pages load in app windows.
- **Help pages** open in a separate window that is reused.
- **Global hotkeys** Ctrl+Alt+Space opens quick task, Ctrl+Alt+N quick capture, by default (on Linux and Windows, Ctrl+Alt+N is also New scratch note, which the global key then takes over). Both can be changed or turned off in Settings → Shortcuts under "From any app" (desktop only). They are stored with the desktop app's own settings (not the page's), so they are registered at start-up before the window opens, and re-registered at once when changed. If the system refuses a key (held by another app or the system), that row says so and the key stays off. The same key cannot be given to both; one that matches an in-app shortcut is pointed out, since the global key wins.
- **Installed fonts** are listed for the font picker.
- **Packaging:** a `.deb` for 64-bit Intel and AMD Linux (Debian, Ubuntu, a Chromebook's Linux environment), installing into `/opt/Margin` with a `margin` command and a launcher entry, attached to the same releases. A `.dmg` for Apple silicon, signed ad hoc (no Apple developer account); unsigned builds require `xattr -cr` once after installing from a browser download. An install script (`margin-update`) downloads a release with the GitHub command-line tool or a read-only token instead, which leaves no download mark, so no `xattr` step is needed; it closes the running app, replaces it in Applications, keeps a copy of itself in `~/.local/bin`, and can install a named version. Versioned releases with a changelog.
- **Note checker:** a read-only script shipped beside the command-line tool. Given a note file (and optionally the notes folder), it prints, without any of the note's text, counts and line numbers for: size, byte-order mark, NUL bytes, invalid UTF-8, line endings, control, invisible, separator and private-use characters, lines over 2,000 characters, inline base64 data, frontmatter (fields, duplicates, the id), other notes with the same id, code blocks never closed, HTML comments and canvas cards not balanced, more than one canvas marker, headings and level jumps, list nesting depth, tables (widest, ragged rows), tasks, links, unmatched `[[`, and quotes nested six or more deep. Unusual findings are marked and the exit status is 1.
- **Printable Guides…** opens a folder shipped inside the app holding each guide (user guide, theory of operations, design guide, specification) as a PDF and as a standalone HTML page. The installer's window shows the same folder, named Documentation, beside the app.
- **Command-Line Tool…** shows where the bundled tool is and can link it into `~/.local/bin/margin-tasks`, a folder the user owns, so no administrator rights are needed. It replaces an older link of its own but never a real file.

## 19. Command-line tool

`margin-tasks`: a single Python file using only the standard library (Python 3.8 or newer). It reads the notes folder directly, applies exactly the rules of [section 12](#12-tasks), and never writes. It ships inside the app.

```
margin-tasks [LIST] [options]
```

- **LIST:** `inbox`, `today` (default), `upcoming`, `anytime`, `someday`, `logbook` (alias `done`), `overdue`, `week`, `month`, `undated` (alias `nodate`), `open`, `all`.
- **Finding the folder:** `--vault PATH`, else `$MARGIN_VAULT`, else the desktop app's saved choice, else `~/Documents/Margin`.
- **Reading files:** skip hidden entries and the top-level attachments folder; read `id`, `title`, `type` and `tags` from frontmatter without a YAML library; leave out the Templates notebook (`--templates NAME` to change); the Inbox notebook is `Inbox` unless `--inbox NAME` is given, since the app's setting is not stored in the notes folder.
- **Narrowing** (all must hold): `--tag TAG` (repeatable; matches nested tags), `--note-tag TAG`, `--priority p1|p2|p3|none` (that level or higher; `--exact-priority` for only that level), `--due-before|after|on DAY`, `--planned-before|after|on DAY`, `--done-before|after|on DAY`, `--has-due`, `--no-due`, `--notebook NAME` (and those inside it), `--note TEXT` (title contains), `--source all|notes|daily`, `-q TEXT` (the Tasks view's narrow-down syntax).
- **DAY:** `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+N`, `-N`, or a weekday name meaning the next one.
- **Output:** a plain listing by default (checkbox, priority, text, dates, note and heading; colour when writing to a terminal); `--json`; `--csv`; `--paths` (`path:line: [ ] task`); `--format TEMPLATE` with the JSON field names; `--count`.
- **JSON fields:** `text`, `done`, `cancelled`, `priority`, `tags`, `planned`, `someday`, `due`, `done_on`, `repeat`, `remind`, `overdue`, `in_today`, `in_inbox`, `note`, `notebook`, `note_type`, `note_tags`, `heading`, `path`, `relpath`, `line` (1-based, in the file), `raw`.
- **Order:** `--sort urgency|due|planned|priority|note|done`, `--reverse`, `--limit N`, `--group none|date|note|notebook|priority`.
- **Other:** `--today DAY` to pretend it is another day, `--week-start sunday|monday`, `--no-color`, `--version`, `--help`.
- **Exit codes:** 0 on success, 1 when the folder cannot be found or read, 2 for a bad argument.

**Keeping two implementations in step.** A file of shared cases (sample notes, a fixed "today", and for each task its parsed fields, plus the expected contents and order of every list and several searches) is generated from the app's rules and checked against both the app and the tool by one test command. Any re-implementation should carry the same kind of test.

## 20. Dates typed in words

Wherever a date can be typed (the palette, `[[` completion, task dates, the date picker), these are understood. Weeks run Monday to Sunday for "this" and "next".

| Phrase | Means |
| --- | --- |
| `today`, `tod`, `now` | Today |
| `tomorrow`, `tom`, `tmr`, `tmrw` | Tomorrow |
| `yesterday`, `yest` | Yesterday |
| `next week`, `last week`, `this month`, `next year`, … | The same day one unit away |
| `in 3 days`, `3 days ago`, `2 weeks from now`, `in 1 month` | That offset |
| `+3`, `-2` | Days from today |
| `friday`, `fri` | The coming Friday (never today) |
| `this friday` | The Friday of this week |
| `next friday` | The Friday of next week |
| `last friday` | The most recent Friday |
| `2026-10-06` | That date |
| `06/10`, `06/10/26`, `06-10-2026` | Day first or month first by setting; if only one reading is a real date, that one |
| `6 oct`, `6th october 2026`, `oct 6`, `october 6th 2026` | That date; month names from three letters |

## 21. Acceptance checklist

A build meets this specification when all of these hold.

**Files**

- Every note is a `.md` file that opens correctly in a plain text editor, with frontmatter as in section 3.2.
- Unknown frontmatter keys survive a save.
- Renaming a note updates `[[links]]` to it in other notes.
- Deleting puts the file in this computer's trash folder for the notes folder; nothing but notes, notebooks, attachments and `.margin/` is left in the notes folder.

**Editing**

- Live preview hides syntax off the cursor line and shows math, images, link pills, checkboxes and tables.
- Tables can be edited in place, sorted from the header, pasted from a spreadsheet, and are padded in the file.
- Long list items wrap under their own text.
- Slash commands, `[[` and `#` completion work.
- Search in note behaves as in section 5.12.

**Notes**

- Daily notes are created from the Daily template with placeholders filled for their own date.
- The journal shows all days, editable, loading more on scroll.
- Quick capture adds to today's note, and a typed task stays a task.
- Quick task offers dates, priorities and tags as it is typed, turns typed date words into dates on save, and adds to the Inbox note.
- Meeting and person notes are created as in sections 11.3 and 11.4.
- Backlinks, unlinked mentions (with Link) and outgoing links are correct.
- Two panes work, with commands going to the active one.

**Tasks**

- Every list in section 12.4 contains exactly the tasks its rule describes, in the stated order.
- A task planned for yesterday is in Today and not in Overdue.
- Ticking adds `@done(date)`; unticking removes it.
- The Tasks view can be driven entirely from the keyboard.
- Saved filters appear in the sidebar with live counts.
- Unticked Top 3 items move to the next day's note when it is created.
- The command-line tool gives the same lists as the app for the same folder and date.
- A task captured to the Inbox with no day is in the Inbox list and not in Anytime; planning it, parking it or moving it into another note takes it out; Move to another note carries the lines under the task and can be undone.

**App**

- Every shortcut in section 16.1 can be changed, and the change shows in menus and hints.
- Settings search finds any setting.
- Light and dark themes both work everywhere, including the help pages.
- The desktop app and the browser version open the same notes folder.
- There are no AI features and no network calls except fetching a page title for a research note.
