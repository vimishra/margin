# Changelog

What changed in each released version of Margin. Installers are on the [releases page](https://github.com/vimishra/margin/releases).

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
