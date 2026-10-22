# Changelog

What changed in each released version of Margin. Installers are on the [releases page](https://github.com/vimishra/margin/releases).

## 1.18.0 (2026-10-22)

### Added

- **Notes in Quick task.** Press **Tab** in the Quick task box to add notes under the task: context, a link, a few bullets. **⌘↵** saves. They are saved on the lines under the task, indented, so they travel with it when you move it to a note with **M**.
- **Task notes in the Tasks view.** A task with lines indented under it shows a small notes icon. Hover it to read them, or click it (or press **N**) to show them under the task. They are read straight from the note; nothing is stored separately.

### Fixed

- The suggestion list in the Quick task box no longer stays open after you move out of the task line.

## 1.17.1 (2026-10-16)

### Changed

- **Folded lines stand out more.** The arrow on a folded heading or list item is now a solid triangle in the accent colour, and the **…** after it is drawn as three bold dots, tinted to match.

## 1.17.0 (2026-10-15)

### Added

- **Folding.** A section (a heading and what is under it) or a list item with lines under it folds down to its first line. Hover and click the arrow to its left, or use **⌘'** to fold or unfold where the cursor is, **⌘⌥↑** to fold (again for the section around it) and **⌘⌥↓** to unfold. **Fold All** and **Unfold All** are in the Format menu and ⌘K. Folds are remembered for each note and never change the file; find and jumps open the fold they land in.

## 1.16.1 (2026-10-14)

### Changed

- **The Format menu is one flat list.** The Paragraph, Insert and Task submenus are gone; their commands sit directly in Format, still divided into groups by lines. The right-click menu keeps its submenus.

### Added

- **Find in the shortcuts window.** The window that **?** opens has a find box: type to narrow the list to the shortcuts whose name or keys match. ⌘F and **Edit → Find…** go to it while the window is open; **Esc** clears it, then closes the window.

## 1.16.0 (2026-10-14)

### Changed

- **Move to note files tasks under "Open Threads".** M in the Tasks view puts the task at the end of the chosen note's `## Open Threads` section, after the tasks already there, instead of at the very end of the note, so moved tasks collect in one place. A note without the heading gets it, at the end of the page.

### Added

- **New note from the Move to note picker:** type a name that matches no note and choose **New note "…"**. It is made in the notebook of the project you edited last (or the one you type, as in `People/Sam`), with the Open Threads heading and the task in it.

## 1.15.6 (2026-10-13)

### Added

- **A Format menu in the menu bar,** with the Markdown commands for the note being edited: Bold, Italic, Strikethrough and Inline Code, then Paragraph (headings, lists, quote, code block), Insert (note link, web link, table, math, divider, date, time) and Task submenus. Shortcuts shown follow Settings → Shortcuts.
- **Code Block** and **Divider** commands, also in the right-click menu.

## 1.15.5 (2026-10-13)

### Changed

- **⌘F finds in what is in front**, as in any Mac app: in a note, the find and replace bar (as before); in the Tasks view or a list of notes, its narrow-down box; in a guide, the guide's find bar; anywhere else, ⌘K's search. It used to do nothing outside notes and guides.
- The menu item is now **Edit → Find…**, acting on the window in front. **Help → Find in Guide** is gone: it suggested that ⌘F always searched the guides.

## 1.15.4 (2026-10-13)

### Fixed

- **Text settings now reach the Tasks view.** Note font, Text size and Text weight (Settings → Appearance) changed notes but not the task lists, whose sizes were fixed. Task text now uses the note font and weight, and the task text, labels, checkbox and headings scale with Text size. The panel under daily notes follows it too.

## 1.15.3 (2026-10-12)

### Changed

- **Darker dark theme:** the page and sidebar are near-black (`#161617`) instead of charcoal (`#282828`), with panels, pop-ups and lines moved down to match, so the dark theme no longer looks washed out. The guides' dark theme follows.

## 1.15.2 (2026-10-12)

### Documentation

- **Projects and areas:** the user guide explains how Things 3's areas, projects, headings and to-dos map onto notebooks, notes, headings and task lines, with a suggested layout (Work and People, plus the notebooks Margin manages) and an Archive notebook for finished projects. The notebooks advice no longer suggests the Inbox for notes.
- The theory of operations adds "an area is a notebook, a project is a note", where new projects and a meeting's actions go, and archiving finished projects in the monthly review.

## 1.15.1 (2026-10-12)

### Changed

- **Dark theme text is almost white** (`#f8f8f9`, secondary text `#d8d8da`), as in Things 3, for easier reading. The guides' dark theme follows.

## 1.15.0 (2026-10-12)

### Added

- **Meeting actions under their project:** with the Tasks view grouped by Project, the tasks of a meeting note that links `[[Organization]]` are listed under Organization, after its own tasks, under "From" and the meeting's name. A task anywhere else joins a project by linking it on its own line. Nothing is moved; ticking one ticks it in its own note, and the project's progress circle counts them.
- Projects are ordinary notes outside the notebooks Margin manages (Daily, Meetings, Inbox, Templates, Scratch) and People, so a meeting that links only a person keeps its tasks under its own name.

## 1.14.1 (2026-10-12)

### Added

- A yellow star on tasks that are also in Today, in Anytime and the other lists (not in Today or Overdue themselves), as Things marks them.

## 1.14.0 (2026-10-12)

One Inbox, for tasks.

### Changed

- **The tasks Inbox is one note:** the note called *Inbox* in the Inbox notebook. Its tasks with no planned day are the Inbox list; tasks in other notes of the notebook no longer count. As before, a task with a day is in Today or Upcoming rather than the Inbox.
- **Quick task always adds to the Inbox note.** The destination choice and its setting are gone.
- **Quick capture of a note always goes to today's note.** The Scratch, Inbox and "A note…" destinations and the "Quick capture saves to" setting are gone. Scratch notes are still made with New → Scratch note (⌘⌥N).
- "New notes go to the Inbox notebook" is no longer offered; if it was chosen, new notes go to the notebook you are in.

### Added

- When other notes in the Inbox notebook still hold open tasks (such as the *Tasks* note earlier versions made), the Inbox list offers **Move them into Inbox**, with Undo.
- Move to note can move several tasks at once, with one Undo.

## 1.13.1 (2026-10-12)

### Fixed

- **Tasks missing from the Inbox list** when the Inbox notebook's name on disk differed from the setting only in capitals (for example `inbox` and `Inbox`). macOS treats these as one folder but Margin compared them letter for letter, so hand-written tasks never counted, and a Quick task could show for a moment and then disappear after a restart. Notebook names are now compared ignoring capitals and stray spaces, in the app and in `margin-tasks`.
- New notes, notes moved into a notebook and new notebooks reuse the spelling of an existing folder that differs only in capitals, instead of being recorded under a second name. Quick task adds to the existing Tasks note rather than making a "Tasks 2".

### Changed

- The Inbox list says which notebook it reads.

## 1.13.0 (2026-10-12)

### Added

- **Find in the guides:** ⌘F in the user guide, theory of operations, design guide or specification opens a small find bar. Matches are highlighted as you type; Enter and ⇧Enter move between them, Esc closes. Also Help → Find in Guide, and it works in the printable HTML copies.
- **Task lists in ⌘K:** type `inbox`, `today`, `upcoming`, `anytime`, `someday`, `logbook` and so on, or a saved filter's name, and "Tasks: Inbox" (and the rest) opens that list.

## 1.12.0 (2026-10-12)

The Inbox now works as it does in Things 3.

### Added

- **Inbox list:** Tasks → Inbox, first in the Tasks view and the sidebar, with a count. It holds tasks in the Inbox notebook that have no planned day and are not Someday: everything Quick task saves there, and any task written in a note in that notebook.
- **Move to note:** M in the Tasks view, or the new button on a task's row, moves the task (with the lines indented under it) into another note, such as a project. Undo puts it back.
- `margin-tasks inbox` lists the Inbox from the command line; `--inbox NAME` if your Inbox notebook has another name. The JSON output has an `in_inbox` field.

### Changed

- Inbox tasks stay out of **Anytime** and **No date** until you decide on them: give one a day or Someday, or move it into another note, and it leaves the Inbox. A due date does not take a task out of the Inbox, but a task that is due also shows in Today.
- List keys in the Tasks view: 1 Inbox, 2 Today, 3 Upcoming, 4 Anytime, 5 Someday, 6 Logbook, 7 Overdue, 8 This week, 9 No date, 0 All open.
- The theory of operations guide empties the Inbox at the end of each day and at the start of the weekly review.

No note is changed: tasks you already have in the Inbox notebook simply appear in the Inbox list.

## 1.11.1 (2026-10-12)

### Changed

- The Mac build on GitHub (Actions → Build Mac app) names each run after the branch it was built from, and puts the version in the download's name and on the run's page, so you can tell which version a build contains.

## 1.11.0 (2026-10-12)

### Added

- **Quick task:** ⌘⌥C, or ⌃⌥T from any app, opens the capture box ready for a task. Type it with its details and the same suggestions as on a task line appear: `>` and `@due(` for dates, `P` for priority, `#` for tags, `[[` for links. Dates typed in words (`>fri`, `@due(next week)`) are turned into dates on save, so suggestions need not be picked, and the line under the box shows what was understood.
- Quick task saves to the Inbox, a note called *Tasks* in the Inbox notebook (made the first time), or to today's note; Tab switches. ⇧Enter saves and keeps the box open for the next task. Settings → Capture & scratch → **Quick task saves to** sets the default.
- A **Note / Task** switch at the top of the capture box. Either capture shortcut switches while the box is open, keeping what was typed.

## 1.10.2 (2026-10-09)

### Added

- **Printable guides:** the installer window now has a **Documentation** folder with an HTML and a PDF copy of the user guide, the theory of operations, the design guide and the specification. The same folder ships inside the app: **Help → Printable Guides…** opens it.

## 1.10.1 (2026-10-09)

### Changed

- Dark theme: text is a little brighter (main text, secondary text and the grey used for hints and counts), for easier reading without the glare of pure white.

### Fixed

- Opening a task from the Tasks view (or the panel under a daily note) no longer selects the whole line, where the next key pressed would replace it. The cursor now lands at the end of the task, ready to type. The same goes for a meeting entry just added to a person's note.

## 1.10.0 (2026-10-09)

### Changed

- **Typography and spacing:** larger interface text (15 px), taller sidebar rows, medium-weight labels, softer text in the dark theme, more margin around notes and more room in task rows.
- **One type scale:** text across the app now uses a small set of sizes (11, 12, 13, 14, 15, 17, 24 and 28 px) and three weights (regular, medium, semibold; bold for titles), instead of the many in-between values that had built up. Spacing snaps to a 4 px grid, and buttons share one height and corner radius.
- **Closer to a Mac app:** the arrow cursor over buttons and rows (the pointing hand only over links in notes), half-point dividing lines on Retina screens, lighter hover shading, system-style letter-spacing with evenly spaced digits in counts and dates, and selections and coloured icons that go quiet when the window is not in front.
- The side panel's section headings (Backlinks, Outline and the rest) are plain again: bold, with a dividing line between sections; only the small icon beside each heading takes the accent colour. Backlinks and unlinked mentions are plain rows with space between them, shaded on hover, instead of bordered cards.
- The open tab is easier to spot: a bold title on a slightly darker background, while the other tabs are dimmer.
- The main sidebar entries (Home, Today, Journal, Calendar, All notes, Tasks, Research, Scratch) and notebooks have coloured icons, like the task lists. Note icons are coloured by kind (note, daily, research, scratch, canvas) in the sidebar, tabs, lists and search.

### Added

- **System accent colour** (desktop app): Settings → Appearance → Accent has a new first choice that follows the accent colour chosen in macOS System Settings, and changes with it.
- **Product specification** (`docs/specification.md`): a complete, implementation-neutral description of the app, with every feature, rule, setting and shortcut, written so it could be rebuilt from scratch.

## 1.9.1 (2026-10-09)

### Changed

- The user guide now opens with **What Margin can do**: every feature in one page, grouped by area, each linking to its section.
- `AGENTS.md` is in the repository as a link to `CLAUDE.md`, so other coding agents read the same project instructions.

No change to the app itself.

## 1.9.0 (2026-10-08)

### Added

- **`margin-tasks`, a command-line tool** (`tools/margin_tasks.py`) that lists tasks from the notes folder: the same lists as the Tasks view, narrowed by tag, priority, dates, notebook or note, with JSON, CSV and grep-style output. It is read-only and needs only Python. It ships inside the app: Help → Command-Line Tool… installs it as `margin-tasks` in `~/.local/bin`, a folder of your own, so no password is needed.
- **Shared test cases for the task rules** (`tests/task-cases.json`), checked against both the app and the command-line tool by `npm run test:tasks`.

## 1.8.2 (2026-10-08)

### Fixed

- The **Text weight** setting now applies to the whole app (sidebar, lists, the Tasks view), not only to the text of notes, so the two no longer look mismatched.
- Tasks in the **Tasks for this day** panel are shown in the note's own font, size and weight, so they read like the rest of the page.
- The help guides follow the theme chosen in Margin. They used to follow the system's light or dark setting, so a light app could open a dark guide. Their colours now match the app's palette too.

## 1.8.1 (2026-10-08)

### Changed

- **The documentation is split into notes and tasks.** The theory of operations now has a Part 1 for notes and a Part 2 for tasks, each with its own morning, daily, meeting, weekly and monthly routine, and a one-table overview of how the two fit into a day. The user guide is grouped the same way, with everything about tasks together in Part 2. No change to the app itself.

## 1.8.0 (2026-10-08)

### Added

- **Task shortcuts in a note:** with the cursor on a task, ⌘⌥T plans it for today (the due date is left alone), ⌘⇧S and ⌘⇧D open the calendar for the planned day and the due date, and ⌘⇧P steps the priority through P1, P2, P3 and none.
- **The Top 3 carries forward:** when today's note is created, what was left unticked in the last day's Top 3 moves into today's. "Move unfinished Top 3 to today" in ⌘K does the same on demand, and a setting turns the automatic move off.
- **T** in the Tasks view plans the highlighted task for today.
- **Theory of operations:** a new guide with the routine to follow every morning, meeting, day, week and month. Open it from Help → Theory of Operations.

### Changed

- A task typed into quick capture (`- [ ] …`) is added to today's note as that task, instead of as a timestamped line containing it.
- The built-in daily template's Top 3 is now a checklist. A `Daily` template note you already have is not changed.

## 1.7.0 (2026-10-07)

### Added

- **Sort from the header:** hover a column heading in a table and click the arrow to sort by it; click again to reverse.

### Changed

- Table headings are slightly larger and bolder.

## 1.6.0 (2026-10-07)

### Added

- **Paste from a spreadsheet:** cells copied from Google Sheets, Excel or Numbers (or a table from a web page) paste into a note as a markdown table. The first row is the header and columns of numbers are right-aligned.
- **Copy for spreadsheet:** a button on each table copies it as cells for pasting into a spreadsheet.
- **Sort a table by a column:** right-click a cell and choose A to Z or Z to A. Numbers sort as numbers and empty cells go to the bottom.

### Changed

- Tables are now only as wide as their contents need, instead of always filling the page. Settings → Appearance → Table width switches back to full width.
- Tables are written with right-aligned and centred columns padded to match, so the file lines up in a fixed-width font whatever the alignment.

## 1.5.0 (2026-10-07)

Tasks now follow the Things 3 workflow.

### Added

- **Anytime:** everything you could do now, leaving out tasks planned for later and Someday.
- **Someday:** write `>someday` on a task, or pick Someday in the when calendar, to park it. It stays out of Today, Upcoming and Anytime and has its own list.
- **Logbook:** ticking a task writes the day on its line as `@done(2026-10-07)`, and the Logbook lists ticked tasks by the day they were done, latest first. Unticking takes the day off. Can be turned off in Settings → General.
- **Group by project:** each note's tasks together under its notebook, in the order they are written and under their headings, with a progress circle.
- Today, Upcoming, Anytime, Someday and Logbook are in the sidebar under Tasks. Overdue is shown there only while something is overdue.

### Changed

- **Today** now holds tasks planned for today *or earlier* and tasks due today or earlier. A planned day that has passed no longer makes a task overdue: it stays in Today until it is ticked.
- **Overdue** means a missed due date only. **Move all…** sets a new due date.
- **Upcoming** holds tasks planned for a later day. A task with only a due date is in Anytime until it is due.
- The list keys are now 1 to 9 and 0, in the new order. Done is called Logbook; saved filters that used it still work.
- The number beside Tasks in the sidebar is the Today count.

- **Both themes have a new palette, measured from Things 3.** Light: a white page, a barely-grey sidebar and near-black text in place of the warm greys. Dark: one charcoal for the page and the sidebar with a darker line between them. The default accent is now the deep blue Things uses for project titles and headings; if you were on the old default (Indigo) you are moved to it once, and any other accent you chose is kept.
- **The sidebar can be resized:** drag its right edge; double-click the edge for the usual width.
- The lists under Tasks in the sidebar have their own icons and colours: a yellow star for Today, red for Upcoming, teal for Anytime, tan for Someday and green for the Logbook.

No note is changed until you tick, plan or park a task.

## 1.4.0 (2026-10-07)

### Added

- **Short links:** `go/some-name`, `b/1234567` and `b/hotlists/1234567` written as plain text are shown as links and open in the browser. The text in the note is not changed. Can be turned off in Settings → Editor.

## 1.3.0 (2026-10-07)

### Added

- **Journal:** all daily notes on one continuous page, today at the top, each day editable in place with its tasks. ⌘J, or Journal in the sidebar.
- **A default daily template:** new daily notes start with a "Top 3" list and a "Log" section. The template is a note called `Daily` in the Templates notebook, created the first time it is needed, so it travels with your notes to another computer. Edit that note to change it.

### Fixed

- The daily template is applied however a daily note comes to exist. Following a link to a day (such as `[[next monday]]`) into the side pane used to create an empty note.
- Placeholders in the daily template (`{{day}}`, `{{date:Do MMM}}`, `{{time}}`) are now filled in, for the day the note is for.

### Changed

- Date headings in the journal are larger.
- Quick capture to today's note fills the template's empty Log bullet instead of adding below it.

Existing daily notes are not changed.

## 1.2.0 (2026-10-07)

### Added

- **Heading shortcuts:** ⌘1 to ⌘5 turn the current line into a heading of that level. The same key again turns it back into plain text. In the browser version the keys are ⌘⌥1 to ⌘⌥5.
- **Link shortcut:** ⌘L inserts `[]()` with the cursor between the square brackets. With words selected it wraps them and puts the cursor where the address goes. ⌥K in the browser version.
- **Paste to link:** select some words and paste a web address, and the words become a link to it. Pasting inside code or an existing link is unchanged.

### Changed

- The Link button in the toolbar and "Web Link" in the right-click menu now insert an empty `[]()` instead of `[text](https://)`.

## 1.1.0 (2026-10-06)

### Fixed

- Long list items wrap neatly: the following lines start under the item's text instead of at the margin. This applies to bullets, numbered items and tasks at any depth.
- Numbers in a numbered list line up, and the guide lines of nested items run the full height of a wrapped item.

## 1.0.0 (2026-10-06)

First packaged build, for Macs with Apple silicon.

- Markdown notes as plain files, with live preview, tables, math, images and a canvas.
- Daily notes, calendar, quick capture, scratch notes, meeting and person notes, templates.
- Tasks with priority, planned and due dates; a Tasks view with saved filters.
- Links, backlinks, unlinked mentions, tags with automatic colours, notebook tags.
- Search, two panes, version history, export, and import from Obsidian.
