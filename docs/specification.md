# Margin product specification

This document specifies Margin completely enough to build it again from nothing. It describes what the app does and the rules it follows, not how the current code is organised. It matches version 1.10.0.

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

## 3. Data: the notes folder

### 3.1 Layout

```
<notes folder>/
  Any/Nested/Folders/Note title.md
  attachments/            images, PDFs and other files (name configurable)
  .history/<note id>/<timestamp>.md
  .trash/                 deleted notes
  .margin/config.json     settings that belong to the folder
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
5. Under Tasks: Today, Upcoming, Anytime, Someday, Logbook, and Overdue only while something is overdue, each with an icon in its own colour and a count (no count for Logbook); then the user's saved filters.
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
- **Read:** a rendered, read-only page. Checkboxes still tick. Double-click switches to Write.

An empty note always opens in Write. The mode is one global setting.

### 5.2 A note's header

Above the text: the notebook as a breadcrumb (click to open it or to move the note), the saved state, Page / Canvas buttons, mode buttons, and buttons for pin, jump to heading, version history, export, side panel and a "more" menu (pin, history, move, open to the side, duplicate, page width, move to trash). Then the title as an editable field, the tag row, and an optional formatting toolbar: heading, bold, italic, bulleted list, numbered list, task list, quote, code, link, link to note, table, math, attach.

Research notes add a status selector and a source link field. Scratch notes add a strip showing time left with "+1 day", "+1 week" and "Keep".

### 5.3 Markdown support

Headings 1 to 6, bold, italic, strikethrough, inline code, fenced code blocks with syntax colouring by language (in all modes), block quotes, bulleted, numbered and task lists, links, bare web addresses as links, images, tables, horizontal rules, inline math `$…$` and display math `$$…$$` in LaTeX, `[[wikilinks]]`, `#tags`, and embedded PDFs.

### 5.4 Live preview rules

- Syntax marks (`#`, `**`, `>`, list markers, link brackets and addresses, code fences) are hidden on lines without the cursor.
- These are replaced by rendered widgets unless the cursor touches them: math, images and PDFs, note links (as pills), checkboxes, bullets, horizontal rules and tables.
- The document is always plain markdown. Preview is decoration only; what is saved is exactly what was typed.
- A current search match counts as "the cursor is here", so text hidden inside a widget is revealed and highlighted.

### 5.5 Lists

- Bullets show as a round dot in a configurable colour. Numbers are styled the same.
- **Tab** nests an item under the one above; **⇧Tab** un-nests. Numbered lists renumber automatically. Numbered items need three spaces of indent in the file; bullets need two.
- Nesting is drawn at a fixed width per level (setting, default 28 px) regardless of the spaces in the file, with a faint guide line per level (setting) that runs the full height of a wrapped item.
- **⌥↑ / ⌥↓** move an item, with its sub-items, past its neighbour.
- Toggle shortcuts turn the selected lines into a bulleted, numbered or task list, and back.
- **Wrapped lines hang under the item's text**, not under the marker, for bullets, numbers and tasks at any depth. Markers occupy a fixed width so numbers align.
- **⌃A** (Mac) goes to the start of the text, and on a second press to the start of the line.

### 5.6 Headings

Shortcuts set heading level 1 to 5 on the current line or each selected line. The same level again removes the heading; a different level changes it.

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
- ⌘F opens ordinary find and replace.

### 5.13 Other editor behaviour

- Spell check (setting, on) with suggestions in the right-click menu in the desktop app.
- Auto-closing brackets and quotes (setting, on).
- Bold ⌘B, italic ⌘I, wrap in a note link ⌘⇧K, undo and redo.
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
- The tag row under a title shows frontmatter tags as removable chips, inline tags as outlined chips, and an input for adding one.
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
- **`#tag`:** notes with that tag.
- **A date phrase:** that day's daily note first.
- **Command names:** matching commands rank above notes.
- **`>`:** commands only.
- **⌥↵** opens the selected note in the side pane. **⌘↵** creates a note named with the typed text.

The palette has further modes with the same look: move a note to a notebook (with "create notebook"), choose a template, jump to a heading, and choose a tag.

**Jumping to a place in a note** (from search or the Tasks view) selects the text, scrolls it to the middle, repeats the scroll a few times over the first second while images and tables settle, and flashes the line for about 1.5 seconds. It works in either pane.

**Commands** cover every action in the app: create (note, canvas, scratch, meeting, person, research, from template, notebook), go to (each view), on the current note (side, swap, jump to heading, search, formatting, headings, lists, task actions, mode, page or canvas, rename, duplicate, add tag, copy link, reveal file, close tab, close others, close all, pin, history, move, export as Markdown, HTML, PDF, Word, delete), and app (page width, sidebar, side panel, theme, settings, import, help pages, keyboard shortcuts).

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

A small box with a text area and a destination selector. Enter saves, ⇧Enter adds a line, Tab cycles destinations, Esc closes.

| Destination | Result |
| --- | --- |
| Today's note (default) | Appended to the page as `- **time** : text`, or as a card when today is a canvas. An empty trailing bullet left by the template is replaced. Text typed as a task (`- [ ] …`) is added as that task with no timestamp. |
| Scratch | A new scratch note |
| Inbox | A new note in the Inbox notebook, titled with the first line |
| A note… | Appended as a list item to a chosen note, at the end of a chosen heading's section or the end of the page. The note and heading are remembered. ⌥↓ picks another note. |

The default destination and whether to add the time are settings. In the desktop app a global hotkey opens capture from any application.

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

and the text after the box is not blank. `x` or `X` means done. Lines inside fenced code blocks (``` or ~~~) are ignored. Tasks in the Templates notebook are left out of every list. Tasks on canvas cards count.

Details are written on the same line as plain text:

| Detail | Written |
| --- | --- |
| Priority | `P1`, `P2`, `P3` (P1 highest; lower case accepted) |
| Planned day | `>2026-10-08` |
| Someday | `>someday`, in the same place as a planned day |
| Due date | `@due(2026-10-10)` |
| Done on | `@done(2026-10-07)` |
| Tags | `#atlas`, as for note tags |

The exact patterns, each applied to the text after the checkbox:

```
priority   (^|\s)[Pp]([123])(?=\s|$)
planned    (^|\s)>(\d{4}-\d{2}-\d{2}|[Ss]omeday)(?=\s|$)
due        (^|\s)@due\((\d{4}-\d{2}-\d{2})\)
done on    (^|\s)@done\((\d{4}-\d{2}-\d{2})\)
tag        (?:^|[\s(])#([A-Za-z][A-Za-z0-9_/-]*)
```

`\d` and the tag characters are ASCII only.

Only the first occurrence of each counts. The task's display text is the line with those four details removed and spaces collapsed. Each task also records the nearest heading above it.

When the app rewrites a task's details it writes: text, priority, planned day or `>someday`, due date, done date, in that order. A planned day and Someday replace each other.

### 12.2 Entering details

- Type them by hand, or use the slash menu.
- On a task line, `>` or `@due(` followed by a phrase offers dates: today, tomorrow, weekday names, next week, next month, or any phrase from [section 20](#20-dates-typed-in-words); `>some` offers someday.
- With the cursor on a task (shortcuts in [section 16](#16-keyboard-shortcuts)): tick or untick; move to today (sets the planned day to today and leaves the due date); when (opens the date picker for the planned day, with Someday); due date (opens the date picker); priority (steps P1, P2, P3, none). Tick, move to today and priority apply to every task in a selection. On a non-task line they say so.
- In the editor, details show as small labels: priority badge red for P1, amber for P2, grey for P3; dates as pills, the planned day highlighted when it is today or earlier, the due date red once passed. A done task is struck through and its labels muted.

### 12.3 Ticking

- Ticking writes `@done(<today>)` at the end of the line; unticking removes it. Setting, on by default.
- A selection that mixes ticked and unticked is all ticked; a fully ticked selection is cleared.

### 12.4 The lists

Given today's date `now`:

| List | A task is in it when |
| --- | --- |
| Today | Not done, and planned on or before `now`, or due on or before `now` |
| Upcoming | Not done, and planned after `now` |
| Anytime | Not done, not Someday, and not planned after `now` |
| Someday | Not done, and marked Someday |
| Logbook | Done |
| Overdue | Not done, and due before `now` |
| This week | Not done, and due or planned within the current week |
| Next 30 days | Not done, and due or planned from `now` to `now` + 30 days inclusive |
| No date | Not done, no due date, no planned day, not Someday |
| All open | Not done |

Consequences that must hold: a planned day passing never makes a task overdue, it stays in Today until ticked; a task with only a future due date is in Anytime; Today's tasks are also in Anytime; a Someday task with a due date appears in Today once that date arrives.

**Order.** Lists sort by the day a task next needs attention: a passed due date first; otherwise the earlier of its planned day (a passed planned day counts as today) and its due date; undated last. Then higher priority, then note, then position in the note. The Logbook sorts by done date, latest first, with undated last.

### 12.5 The Tasks view

- A header with the open and overdue counts, and a **Save filter** button.
- A row of chips, one per list in the order of the table above, each with its count (none for the Logbook). Keys 1 to 9 and 0 select them in order.
- A narrow-down box: words must all appear in the task text or its note's title; `#tag` requires that tag or a nested one; `p1`, `p2`, `p3` require that priority or higher. Tag chips below it toggle a tag.
- **From:** All, Notes (not daily notes), Daily (only daily notes).
- **Group by:** Date (Overdue, Today, Tomorrow, Later this week, Later, No date, Someday; in the Logbook, by done date, latest first, with "Day not recorded" last), Project (each note's tasks together under its notebook, in written order under their headings, with a progress circle; daily notes kept as one group), Priority, None. Groups fold.
- **A row** shows a checkbox, the priority badge, the task text rendered as inline markdown, date labels, and the note and heading it comes from. On hover: buttons for priority, when and due date. Clicking the row opens its note at that line; ⌘-click opens it to the side at that line.
- **Bulk move:** when overdue tasks are shown, "Move all…" opens the date picker and gives each a new due date, with Undo.
- **Keys** on the highlighted row: ↑ ↓ (J K), Home, End, Space or X to tick, T for today, S for when, D for due, P for priority, Enter to open, ⇧Enter to open to the side, `/` to focus the box (↓ or Enter returns to the list). After a menu or picker closes, focus returns to the list. A line at the bottom lists the keys.

### 12.6 Saved filters

A saved filter is a list, a narrow-down text, a From value and a grouping, with a name. It appears under Tasks in the sidebar with a live count. Opening one and changing anything offers **Update filter**. It can be renamed, saved as new, or deleted (with Undo). Stored in app settings.

### 12.7 Date picker

A small popover with: a text box that accepts a day in words and shows the date it understood, quick choices (Today, Tomorrow, Next week, and Someday when planning), a month grid with previous and next, and a Remove link when a date is set. Arrow keys move the highlighted day, PgUp and PgDn change month, Enter sets, Esc closes. Text that is not a date turns the box red and Enter does nothing.

## 13. Organising

- **Notebooks:** create, nest, rename, delete (its notes go to the trash, after confirming with the count). Right-click offers: new note here, new notebook inside, rename, tags for notes here, delete.
- **Move** a note by the palette, by dragging onto a notebook, or from the breadcrumb.
- **Pin** a note to keep it in the sidebar and on Home.
- **Duplicate**, **copy a link** (`[[Title]]`), and **reveal the file** in the system file manager (desktop).
- **Rename** by editing the title, or by a dialog with the name pre-selected.
- **Delete** moves to the trash, closes the tab, and shows Undo.

## 14. History, trash, export, import

### 14.1 Version history

- Each save writes a snapshot of the note into `.history/<id>/`, at most one per 5-minute window (later saves in the window overwrite it). The state before the first tracked edit is kept too. The newest 200 are kept.
- The history window lists versions by time, shows a diff against the current text, and restores one.

### 14.2 Trash

Deleted notes and folders move to `.trash/` in the notes folder. Expired scratch notes go there too.

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
| New notes go to | Current notebook, top level, Inbox | Current |
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
| Capture goes to | Today's note, Scratch, Inbox | Today's note |
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
| Anywhere, not typing | `?` | Keyboard shortcuts window |
| Anywhere (Mac) | Ctrl+[ / Ctrl+] | Back / forward, unless reassigned |
| Editor | `/` | Slash commands |
| Editor | `[[` | Link to a note |
| Editor | Mod+B, Mod+I | Bold, italic |
| Editor | Mod+Shift+K | Wrap selection in a note link |
| Editor | Mod+F | Find and replace |
| Editor | Ctrl+A (Mac) | Start of text, then start of line |
| Editor | Tab / Shift+Tab | Nest / un-nest a list item |
| Editor | Alt+↑ / Alt+↓ | Move a line or list item |
| Editor | Mod+click | Follow a link while editing its line |
| Lists of notes | ↑ ↓ or J K, Enter, `/` | Move, open, filter |
| Tasks view | see section 12.5 | |
| Canvas | Double-click, N, Enter, Esc, ⌫, scroll, Mod+scroll | See section 10 |
| Quick capture | Enter, Shift+Enter, Tab, Alt+↓, Esc | See section 11.1 |
| Desktop, any app | Ctrl+Alt+Space | Quick capture |

## 17. Appearance

- **Themes:** light, dark, or follow the system. Applied before first paint to avoid a flash.
- **Palette**, measured from Things 3:

| | Light | Dark |
| --- | --- | --- |
| Page | `#ffffff` | `#282828` |
| Sidebar | `#f9f9fb` | `#282828`, with a darker dividing line |
| Text | `#15171a` | `#e4e4e5` |
| Secondary text | `#3c3e41` | `#c2c2c4` |
| Muted text | `#8e9093`, `#b7b8ba` | `#8a8a8c`, `#69696b` |
| Borders | `#ebecee`, `#d3d5d8` | `#1f2021`, `#4a4b4d` |
| Selected row | about `#dfe1e7` | about `#393b3d` |
| Default accent | `#255fb3` | `#5b9df0` |
| Danger | `#e0345a` | `#f0577a` |
| Today / Upcoming / Anytime / Someday / Logbook | `#fed301` / `#d92f5c` / `#39a69c` / `#cbbf7f` / `#4dbc61` | `#fed402` / `#d73d67` / `#4eb0a4` / `#d1c68a` / `#4dbd61` |

- **Native behaviour:** the cursor is the arrow over every control and only becomes the pointing hand over links inside notes. Dividing lines are 1 px, or 0.5 px on high-density screens with a slightly stronger colour. Hover shading is faint (about 5% tint). When the window is not the front window, the selected sidebar row and tab fall back to the hover tint, coloured icons desaturate and the primary button dims. Menus and dialogs appear with a short (0.12 s) fade and slight scale, disabled when the system asks for reduced motion.
- **Typography:** the system font by default. Interface text uses one scale of sizes (11, 12, 13, 14, 15, 17, 24, 28 px) and the weights 400, 500, 600 and 700 only; letter-spacing is slightly tight (-0.006em) and tightens further on large titles, small capital labels are spaced out, and digits in the interface are tabular. Note text keeps the font's own spacing and digits. Spacing is in multiples of 4 px; buttons are 30 px tall (26 px small) with a 7 px radius. Interface text is 15 px; sidebar rows are 34 px tall (30 px for the lists under Tasks); labels in the sidebar, tabs and panels are at least medium weight (500). Note text is 16 px at 1.7 line height, with headings sized as a percentage of body text. The note column has 72 px of side margin.
- **Page width** is measured in characters of the chosen font, so "90" means 90 average characters per line.
- **Help pages** follow the app's theme, not only the system's.
- A simple logo: a rounded square with a page-and-margin mark, used as the app icon.

## 18. Desktop shell

- Single window; a second launch focuses the existing one.
- Window size and position are remembered.
- **Menu bar:** App (about, settings, quit), File (new items, choose notes folder, show notes folder, close tab, close window), Edit (standard), View (sidebar, side panel, mode, zoom, full screen, reload, developer tools), Go (back, forward, each view, tabs), Window, Help (User Guide, Theory of Operations, Design Guide, Keyboard Shortcuts, Command-Line Tool…). Menu items show the user's current shortcuts; the keys themselves are handled by the page so they can be customised, and an action triggered by both within 300 ms runs once.
- **Right-click in a note:** spelling suggestions, Cut, Copy, Paste, Paste as Plain Text, Look Up, "Search Notes for…", and Format, Paragraph and Insert submenus. On a link: Open, Open to the Side, Copy Link. On an image: Copy Image.
- **Choosing a notes folder** saves the choice and restarts the app on it; nothing is moved.
- **PDF export** saves directly to a chosen file.
- **Web links** open in the default browser; only the app's own pages load in app windows.
- **Help pages** open in a separate window that is reused.
- **Global hotkey** Ctrl+Alt+Space opens quick capture.
- **Installed fonts** are listed for the font picker.
- **Packaging:** a `.dmg` for Apple silicon, signed ad hoc (no Apple developer account); unsigned builds require `xattr -cr` once after installing. Versioned releases with a changelog.
- **Command-Line Tool…** shows where the bundled tool is and can link it into `~/.local/bin/margin-tasks`, a folder the user owns, so no administrator rights are needed. It replaces an older link of its own but never a real file.

## 19. Command-line tool

`margin-tasks`: a single Python file using only the standard library (Python 3.8 or newer). It reads the notes folder directly, applies exactly the rules of [section 12](#12-tasks), and never writes. It ships inside the app.

```
margin-tasks [LIST] [options]
```

- **LIST:** `today` (default), `upcoming`, `anytime`, `someday`, `logbook` (alias `done`), `overdue`, `week`, `month`, `undated` (alias `nodate`), `open`, `all`.
- **Finding the folder:** `--vault PATH`, else `$MARGIN_VAULT`, else the desktop app's saved choice, else `~/Documents/Margin`.
- **Reading files:** skip hidden entries and the top-level attachments folder; read `id`, `title`, `type` and `tags` from frontmatter without a YAML library; leave out the Templates notebook (`--templates NAME` to change).
- **Narrowing** (all must hold): `--tag TAG` (repeatable; matches nested tags), `--note-tag TAG`, `--priority p1|p2|p3|none` (that level or higher; `--exact-priority` for only that level), `--due-before|after|on DAY`, `--planned-before|after|on DAY`, `--done-before|after|on DAY`, `--has-due`, `--no-due`, `--notebook NAME` (and those inside it), `--note TEXT` (title contains), `--source all|notes|daily`, `-q TEXT` (the Tasks view's narrow-down syntax).
- **DAY:** `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+N`, `-N`, or a weekday name meaning the next one.
- **Output:** a plain listing by default (checkbox, priority, text, dates, note and heading; colour when writing to a terminal); `--json`; `--csv`; `--paths` (`path:line: [ ] task`); `--format TEMPLATE` with the JSON field names; `--count`.
- **JSON fields:** `text`, `done`, `priority`, `tags`, `planned`, `someday`, `due`, `done_on`, `overdue`, `in_today`, `note`, `notebook`, `note_type`, `note_tags`, `heading`, `path`, `relpath`, `line` (1-based, in the file), `raw`.
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
- Deleting puts the file in `.trash`; history files appear in `.history`.

**Editing**

- Live preview hides syntax off the cursor line and shows math, images, link pills, checkboxes and tables.
- Tables can be edited in place, sorted from the header, pasted from a spreadsheet, and are padded in the file.
- Long list items wrap under their own text.
- Slash commands, `[[` and `#` completion work.
- Search in note behaves as in section 5.12.

**Notes**

- Daily notes are created from the Daily template with placeholders filled for their own date.
- The journal shows all days, editable, loading more on scroll.
- Quick capture reaches all four destinations, and a typed task stays a task.
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

**App**

- Every shortcut in section 16.1 can be changed, and the change shows in menus and hints.
- Settings search finds any setting.
- Light and dark themes both work everywhere, including the help pages.
- The desktop app and the browser version open the same notes folder.
- There are no AI features and no network calls except fetching a page title for a research note.
