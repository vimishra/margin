# Margin user guide

Margin is a note-taking app for people who keep a lot of notes: work, meetings, research, things to learn, and quick ideas. Every note is a plain markdown file in a folder on your computer. There is no database and no account.

![Margin's home screen](images/home.png)

You can open this guide from inside the app: **Help → User Guide** in the menu bar, the **User guide** button in the shortcuts window (press `?`), or type "guide" in ⌘K. The [design guide](design.md), which explains how Margin is built, is in the same places.

To search a guide, press **⌘F**: a small bar opens at the top right and highlights every match as you type. **Enter** goes to the next match and **⇧Enter** to the previous one (⌘G and ⌘⇧G do the same), and **Esc** closes the bar. **Edit → Find…** does the same from the menu bar while a guide is in front.

To print a guide, choose **Help → Printable Guides…**. It opens a folder with each guide as a PDF and as a web page. The same folder, named **Documentation**, is in the installer's window beside the app.

This guide uses the desktop app's shortcuts. In a browser, most use ⌥ in place of ⌘ (see [Shortcuts](#shortcuts)). Every shortcut can be changed in Settings.

## What Margin can do

Everything the app does, at a glance. Each heading links to the section that explains it.

**[Writing](#writing)**

- Markdown that shows as you type: headings, bold, lists and links look finished, and the raw text appears only on the line you are editing
- Tables you edit in place, with sorting, and paste from and copy to Google Sheets or Excel
- Math formulas, code blocks with syntax colouring, and images and PDFs shown in the note
- Slash commands (`/`) to insert any kind of block, a date, or a template
- Lists that nest, renumber and move with the keyboard, and wrap neatly
- A source mode for the raw markdown, and a read mode with nothing to edit

**[Linking and finding](#finding-things)**

- Links between notes with `[[`, completed as you type, including dates such as `[[next friday]]`
- Backlinks, unlinked mentions and outgoing links beside every note
- One search box (⌘K) for notes, text inside notes, tags, dates and every command
- Search inside the note you are in (⌃S), and jump to any heading (⌘⇧O)
- Company short links such as `go/name` and `b/1234567`, clickable as they stand

**[Daily notes](#daily-notes-the-calendar-and-the-canvas)**

- A note for each day, created when you open it, from a template you control
- A journal that shows all your days as one continuous, editable page
- A month calendar, and a small one in the sidebar
- A canvas side to any note: an endless board of cards you can connect

**[Capturing](#quick-capture-and-scratch-notes)**

- Quick capture from anywhere, even from another app, into today's note
- Quick task: capture a task with its dates, priority and tags, with suggestions as you type, into the Inbox
- Scratch notes that remove themselves after a week
- Research notes for articles, with a source link and a reading status

**[Meetings and people](#meeting-notes-and-templates)**

- Meeting notes in one keystroke: named, filed by month and linked from the day
- One running note for each person, for 1:1s, with a list of things to raise next time
- Templates for anything, with dates and times filled in

**[Organising](#organising)**

- Notebooks (folders) that can be nested, and tags with automatic colours
- Tags a notebook gives to every note placed in it
- Pinned notes, recent notes, and a home page
- Two notes side by side, tabs, and back and forward

**[Tasks](#tasks)**

- Any checkbox in any note is a task, with an optional priority, planned day, due date and tags
- A Tasks view that gathers them all: Inbox, Today, Upcoming, Anytime, Someday, Logbook, Overdue and more
- An Inbox, as in Things: captured tasks wait there until you give them a day or move them into a project
- Filters by words, tag and priority; grouping by date, project or priority; and filters you save to the sidebar
- Today's tasks and anything overdue shown at the top of the daily note
- A Top 3 for each day, whose unfinished items move to the next day
- Keys for everything: tick, plan for today, set dates and priority, in a note or in the Tasks view
- [A command-line tool](#tasks-from-the-command-line), `margin-tasks`, for scripts

**[Your files, kept safe](#history-trash-and-export)**

- Every note is a plain markdown file in a folder you choose; no account and no database
- Version history for every note, and a trash for anything deleted
- Export to Markdown, HTML, PDF and Word
- [Import from Obsidian](#importing-from-obsidian), with links, images and canvases

**[Making it yours](#settings)**

- Light and dark themes and a choice of accent colours
- Any installed font, with text size, weight, line spacing and page width
- Colours and sizes for each heading level, bold and italic
- Every shortcut can be changed, and sidebar sections can be hidden

## Contents

The guide has two main parts, because Margin does two different jobs. **Part 1** is about notes. **Part 2** is about tasks.

**Start here**

- [Getting started](#getting-started)
- [The window](#the-window)
- [How Margin is organised, and why](#how-margin-is-organised-and-why)

**[Part 1: Notes](#part-1-notes)**

- [Writing](#writing)
- [Finding things](#finding-things)
- [Daily notes, the calendar and the canvas](#daily-notes-the-calendar-and-the-canvas)
- [Quick capture and scratch notes](#quick-capture-and-scratch-notes)
- [Meeting notes and templates](#meeting-notes-and-templates)
- [People and 1:1s](#people-and-11s)
- [Research notes](#research-notes)
- [Organising](#organising)
- [Two notes side by side](#two-notes-side-by-side)
- [History, trash and export](#history-trash-and-export)
- [Importing from Obsidian](#importing-from-obsidian)

**[Part 2: Tasks](#part-2-tasks)**

- [Tasks](#tasks)
  - [Details on a task](#details-on-a-task)
  - [The Tasks view](#the-tasks-view)
  - [Saved filters](#saved-filters)
  - [Moving overdue tasks](#moving-overdue-tasks)
  - [The Top 3](#the-top-3)
  - [Tasks in the daily note](#tasks-in-the-daily-note)
  - [Tasks from the command line](#tasks-from-the-command-line)

**[Reference](#reference)**

- [Settings](#settings)
- [Shortcuts](#shortcuts)
- [Recommended workflows](#recommended-workflows)
- [Where your notes live](#where-your-notes-live)
- [If something goes wrong](#if-something-goes-wrong)

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run app
```

`npm run app` builds Margin and opens it as a desktop app. The first run creates a `vault` folder with a few example notes.

| Command | What it does |
| --- | --- |
| `npm run app` | Build and open the desktop app |
| `npm run dev` | Run in a browser at http://localhost:4321, reloading as the code changes |
| `npm start` | Build once and serve in a browser |
| `npm run app:dist` | Build an installer for the system you are on, into `release/` |

To use a different notes folder, choose **File → Choose Notes Folder** in the desktop app. The browser version opens the same folder the desktop app uses; to give it a different one, start it with `VAULT_DIR=~/Notes npm start`.

## The window

- **Sidebar** on the left: search, the New note button, Home, Today, Journal, Calendar, All notes, Tasks, Research, Scratch, a small calendar, your pinned notes, the five notes you opened most recently, notebooks and tags. ⌘\ hides it. Drag its right edge to make it wider or narrower; double-click the edge to go back to the usual width.
- **Tabs** along the top: every note you open stays in a tab. ⌘⇧[ and ⌘⇧] move between them, ⌥1–9 jump to one, ⌘W closes one.
- **The note** in the middle, with its title, tags, a formatting toolbar and the text.
- **The side panel** on the right of a note: backlinks, unlinked mentions, outgoing links, an outline and file details. ⌘. hides it.

**Home** shows today's note, your pinned notes, recently opened notes, your reading queue and scratch notes that are about to expire.

Back and forward work as in a browser: ⌘[ and ⌘], the mouse's back and forward buttons, or the arrows at the left of the tab bar.

## How Margin is organised, and why

Margin has a handful of ways to organise notes. This chapter explains what each is for, why it exists, and which ones you can ignore.

### The short version

- A **notebook** says where a note lives. A note is in exactly one.
- A **tag** says what kind of thing a note is. A note can have many.
- A **link** says what a note is related to. It is the most specific of the three.
- **Search** finds everything else.

If you only remember one thing: put notes in a few broad notebooks, link generously, and let search and backlinks do the rest.

### Notebooks

**What they are.** A notebook is a folder inside your notes folder. `Work/Atlas plan.md` is a note called "Atlas plan" in the notebook "Work".

**Why they exist.** Every note is a file, and a file has to be in some folder. Notebooks are simply those folders, shown in the sidebar. They are not a feature added on top; they are what the files already are. That is also why they keep working outside Margin: open the notes folder in Finder and the notebooks are right there.

**What they are good for.**

- Separating areas of your life that rarely mix: Work, Personal, Learning.
- Keeping generated notes out of the way: Daily, Meetings, Inbox, Templates, Scratch and Assets are notebooks Margin files things into for you (see the table below).
- Scoping a list. Clicking a notebook shows only what is in it.

**What they are bad at.** A note can only be in one notebook, but most notes belong to several topics. A meeting about the Atlas project with a vendor is "Meetings", "Atlas" and "Vendors" all at once. Trying to express that with folders leads to deep trees and time lost deciding where things go.

**How to use them well.**

- Keep to very few, one per area of your life, as Things has areas. For most people **Work** and **People** are enough; add **Personal** if you want a second area.
- Make each project one note inside its area: `Work/Organization`, `Work/Atlas`. See [Projects and areas](#projects-and-areas).
- Avoid nesting more than one level, except where Margin does it for you (Meetings by year and month).
- If you cannot decide where a note goes, leave it at the top level, or write it in today's note. It is still found by search, links and tags. (The Inbox notebook is for tasks, not notes.)
- Use tags and links for topics; use links for projects and people.

The notebooks Margin manages. You do not need to open or organise these; Margin creates them and files into them:

| Notebook | What goes there |
| --- | --- |
| Daily | One note per day, made by ⌘D or the journal |
| Meetings | Meeting notes, filed as Meetings/2026/Oct |
| Inbox | The Inbox note, where Quick task puts tasks |
| Templates | The daily and meeting templates, and your own |
| Scratch | Notes that remove themselves after a while |
| Assets | Pasted images and attached files (the name is a setting) |

So a simple notes folder looks like this:

```
Work/        one note per project: Organization, Atlas, …
People/      one note per person, for 1:1s
Archive/     finished projects (optional)
Daily/  Meetings/  Inbox/  Templates/  Scratch/  Assets/    managed by Margin
```

### Projects and areas

Margin follows Things 3 here, with notes instead of a separate task database:

| Things 3 | Margin |
| --- | --- |
| Area, such as Work | A notebook: `Work` |
| Project, such as Organization | A note in that notebook: `Work/Organization` |
| Heading inside a project | A `##` heading inside the note |
| To-do | A `- [ ] …` line in the note |
| Notes on a to-do | Lines indented under the task |
| Inbox | The *Inbox* note in the Inbox notebook |
| Completing a project | Tick its last tasks, then move the note to an **Archive** notebook |

A project note is more than a task list: decisions, links and background go in the same note, around the tasks.

Not every note is a project. Daily notes, meeting notes, the Inbox, templates, scratch notes and notes in **People** are not. A meeting's actions still belong to its project: when a meeting note links `[[Organization]]`, its tasks are listed under Organization in the Tasks view (grouped by Project), after Organization's own tasks, under "From" and the meeting's name. They stay in the meeting note, where the context is; ticking one there or in the Tasks view is the same thing. A task in any other note, such as today's, joins a project by linking it on its own line: `- [ ] Ring the recruiter [[Organization]]`. To move a task into the project note for good, press **M** on it in the Tasks view.

### Tags and links

**Tags** answer "what kind of note is this?" or "what state is it in?": `#meeting`, `#idea`, `#question`, `#todo`. They cut across notebooks, and a note can carry several.

**Links** answer "what is this about?". Writing `[[Atlas]]` in a meeting note connects the two, and the Atlas note's backlinks then list every note that mentions it. This is what replaces deep folder trees: you do not file the meeting under Atlas, you mention Atlas in it.

| To say | Use | Example |
| --- | --- | --- |
| Where it lives | Notebook | Work |
| What kind of thing it is | Tag | `#meeting` |
| What it relates to | Link | `[[Atlas]]`, `[[Priya]]` |
| That I need it close at hand | Pin | |

### The kinds of note

Every note is an ordinary markdown file. A few kinds get extra behaviour, switched on by one line at the top of the file. Remove that line and it is a plain note again.

| Kind | What it adds | Why it exists |
| --- | --- | --- |
| **Daily note** | Named for its date, shown on the calendar, one key to open today's, the default place captures land | You need somewhere to write when you do not yet know where something belongs. The date is a name you never have to think of. |
| **Scratch note** | An expiry date; it moves to the trash by itself | Much of what you jot down is only needed for a few days. Without an expiry, it piles up and buries the notes that matter. |
| **Research note** | A source link, a status (Unread, Reading, Done), a list filtered by status, a reading queue on Home | To keep a source and your thinking about it together, and to see what you have not finished reading. |
| **Meeting note** | Nothing special in the file. It is a plain note made from a template, filed by date, tagged `#meeting` and linked from that day | Meetings happen often and always have the same shape, so making one should take one keystroke. |
| **Canvas** | Not a kind of note: every note has a page and a canvas | Some thinking is spatial. |

### Do you need research notes?

No. Be honest with yourself about whether you would use the reading status.

A research note is a normal note with two extra fields. Its whole value is the queue: seeing at a glance what is unread, what you are part-way through, and what is done. If you collect articles, papers or documentation and want to track your way through them, that is useful.

If you do not, ignore the Research section entirely. An ordinary note with the link pasted in, and perhaps a `#reading` tag, does the same job with less ceremony. Nothing else in Margin depends on research notes.

The same goes for scratch notes and the canvas. They cost nothing if unused.

To take a section you do not use out of view, switch it off in **Settings → General → Sidebar sections**. That hides it from the sidebar and from Home. The notes themselves are untouched and still turn up in search.

### What you cannot skip

Only two things are structural:

- **The notes folder**, because that is where the files are.
- **Titles**, because links go by title. Two notes with the same title make a link ambiguous, so keep titles distinct.

Everything else is optional.

---

# Part 1: Notes

Everything about writing things down and finding them again: the editor, search, daily notes, capture, meetings, people, research and keeping the collection organised.

## Writing

### Live preview

Notes render as you type. The line your cursor is on shows its markdown; every other line shows the result. So `**bold**` becomes **bold** when you move off the line.

The buttons at the top right of a note switch between three modes:

- **Write** (live preview), the default
- **Markdown source**, the raw text
- **Read**, a read-only page. ⌘E switches between Write and Read.

### What you can write

| To get | Type |
| --- | --- |
| Heading | `# `, `## `, `### ` at the start of a line |
| Bold, italic, strikethrough | `**bold**`, `*italic*`, `~~struck~~` |
| Bulleted or numbered list | `- item` or `1. item` |
| Task | `- [ ] task`; click the box to tick it |
| Quote | `> quote` |
| Inline code, code block | `` `code` ``, or three backticks and a language on their own line |
| Link to a note | `[[Note title]]` |
| Web link | `[text](https://example.com)`, ⌘L, or just paste the address |
| Tag | `#tag` anywhere in the text |
| Inline math | `$e^{i\pi} + 1 = 0$` |
| Display math | `$$` on its own line, the formula, `$$` on its own line |
| Table | `/table`, or write it in markdown |
| Divider | `---` on its own line |

Code blocks are coloured for the language you name. Math uses LaTeX syntax.

### Slash commands

Type `/` at the start of a line or after a space. A menu appears; keep typing to narrow it and press Enter.

- **Blocks:** Heading 1–3, Bulleted list, Numbered list, Task, Quote, Text. These change the line you are on and keep its text.
- **Insert:** Code block, Table, Math block, Inline math, Divider, Link to a note, Web link, Image or file.
- **Dates:** Today, Tomorrow, Yesterday (links to that day's note), Date, Time.
- **Templates:** one entry per template; it inserts the template's text.

### Headings

⌘1 to ⌘5 turn the current line into a heading of that level. Pressing the same one again turns it back into plain text, and a different one changes the level. With several lines selected, each becomes a heading.

### Lists

- **Tab** nests an item under the one above. **⇧Tab** moves it back out. Numbering fixes itself.
- **⌥↑** and **⌥↓** move an item up or down past its neighbour, taking its sub-items along.
- **⌘⇧8**, **⌘⇧7**, **⌘⇧9** turn lines into a bulleted, numbered or task list, and back.
- **⌃A** goes to the start of the text; pressed again, to the very start of the line.

Nested levels show a faint guide line. The indent width and the guides are in Settings → Appearance.

### Folding

A section (a heading and everything under it, down to the next heading of the same or a higher level) or a list item with lines indented under it can be folded down to its first line. Hover over the line and click the small arrow to its left; a folded line always shows a solid arrow in the accent colour, pointing right, and three bold, tinted dots (**…**) at its end, so folded places are easy to spot. Click either to unfold.

- **⌘'** folds or unfolds where the cursor is. Inside a section's text, it folds that section.
- **⌘⌥↑** folds. Pressed again, it folds the next section or item out, so a few presses collapse a long note down to its main headings.
- **⌘⌥↓** unfolds the fold on the cursor's line.
- **Fold All** and **Unfold All** are in the Format menu and ⌘K. They fold every top-level section and list item.

Folding never changes the note. It is remembered for each note on this computer, so a note opens the way you left it, and tasks in a folded section still show in the Tasks view. Find, Jump to a heading and links to a section open any fold they land in. Paragraphs, tables and code blocks do not fold, and the read-only view and exports always show everything.

### Tables

Tables are edited in place. Click a cell and type.

- **Tab** and **⇧Tab** move between cells; **Enter** moves down. Both add a row at the end.
- The **+** bars on the right and bottom edges add a column or a row.
- **Right-click** a cell to insert or delete rows and columns, set alignment, or **sort** the table by that column, A to Z or Z to A. You can also sort from the header: hover a column's heading and click the arrow at its right edge; click again to reverse. The arrow stays visible on the column the table is currently sorted by. Numbers sort as numbers, and empty cells go to the bottom. Sorting reorders the rows in the note itself; ⌘Z undoes it.
- **Width:** a table is only as wide as its contents need. To stretch every table across the page instead, choose Full width in Settings → Appearance → Table width.
- **Edit markdown** (top right, on hover) shows the raw table. Click **Done**, or move the cursor out, to return.

**Working with a spreadsheet.** For anything more than a small table, edit it in Google Sheets, Excel or Numbers and bring it back:

- **From a spreadsheet:** select the cells, copy, and paste into a note. They become a markdown table. The first row is the header, and a column that holds only numbers is right-aligned. Tables copied from a web page work the same way.
- **To a spreadsheet:** hover the table and click **Copy for spreadsheet**, then paste into the sheet. The cells arrive as cells.
- **Round trip:** copy the table out, edit it in the sheet, copy it back, and paste it over the old one (use **Edit markdown** and select the old table first, or delete it and paste).

In the file, every table is written with its columns padded so the pipes line up in a fixed-width font, in markdown source mode and in any other editor:

```
| Block   | Owner   | Power (mW) |
| ------- | ------- | ---------: |
| Mempath | Shankar |         30 |
| LPCM    | Priya   |      1,200 |
```

Formulas come across as their results, and formatting such as colours, bold and merged cells is dropped. Pasting inside a code block is left as plain text.

### Images and files

Paste or drop an image, PDF or any file into a note. It is saved in your attachments folder and linked from the note.

- **Click** an image to see it larger. Esc closes it.
- **Edit**, a small button on hover, shows the image's markdown.
- **Size:** a pasted Retina screenshot is shown at the size it was on screen. The width is the number after `|` in the markdown, for example `![shot|400](attachments/shot.png)`. Change or remove it to resize.
- **Names:** a pasted image is named after the note and the time, for example `Atlas-kickoff-2026-10-06-1654.png`.
- **Border:** Settings → Appearance → Image border offers None, Hairline or Shadow.

### Links

- Type `[[` and pick a note. Typing a date phrase works too: `[[tomorrow`, `[[next friday`.
- Click a link to open it. ⌘-click opens it in the other pane.
- A link to a note that does not exist yet is shown outlined; clicking it creates the note.
- To edit a link, put the cursor on its line first; then a click places the cursor and ⌘-click opens.
- Renaming a note updates every link to it.
- **Web links:** ⌘L inserts `[]()` with the cursor between the square brackets, ready for the link's text. With words selected it wraps them and puts the cursor in the round brackets for the address.
- **Short links:** company short links written as plain text are clickable as they stand: `go/some-name`, `b/1234567` and `b/hotlists/1234567`. Clicking one opens `http://go/some-name` (or `http://b/…`) in your browser. The text in the note is not changed. They are recognised in the editor, read mode, canvas cards and the Tasks view, but not inside code, web addresses or existing links. Turn this off in Settings → Editor → Short links.
- **Paste to link:** select some words and paste a web address. The words become a link to it. This does not happen inside code or an existing link.

### Right-click and the Format menu

In the desktop app, right-clicking in a note offers spelling suggestions, Cut, Copy and Paste, Look Up, "Search Notes for…", and Format, Paragraph and Insert menus. Right-clicking a link offers Open, Open to the Side and Copy Link.

The same commands are in the menu bar under **Format**, for the note you are editing, in one list with no submenus. Lines divide it into groups:

- **Bold** (⌘B), **Italic** (⌘I), **Strikethrough**, **Inline Code**
- Heading 1 to 5
- Bulleted, Numbered and Task List, Quote, Code Block
- Link to a Note (⌘⇧K), Web Link, Table, Math, Divider
- Today's Date, Current Time
- Tick or Untick Task, Move Task to Today, Task When…, Task Due Date…, Change Task Priority
- Fold or Unfold, Fold, Unfold, Fold All, Unfold All

The menu shows each command's shortcut, including ones you have changed in Settings → Shortcuts. With no note open, the commands do nothing.

## Finding things

### Search everything: ⌘K

⌘K opens one box that searches, switches notes and runs commands.

- **Empty:** recently opened notes. The first is the note you were in before, so ⌘K then Enter flips between two notes.
- **Words:** full-text search across all notes. Opening a result scrolls to the match.
- **`#tag`:** only notes with that tag.
- **A date:** `today`, `tomorrow`, `friday`, `next monday`, `last friday`, `06/10`, `6 oct`, `in 3 days`. The first result is that day's daily note.
- **A command:** type what you want to do. `rename`, `delete`, `duplicate`, `close other`, `add tag`, `copy link`, `export`. A matching command appears at the top; press Enter.
- **A task list:** `inbox`, `today`, `upcoming`, `anytime`, `someday`, `logbook`, `overdue` and the others, or the name of a saved filter. **Tasks: Inbox** and the rest appear at the top; Enter opens that list.
- **`>`:** commands only.
- **⌥↵** opens the selected note in the side pane. **⌘↵** creates a note named with what you typed.

Commands act on the note in the active pane. The ones people reach for most:

| Type | Does |
| --- | --- |
| `rename` | Rename this note (also F2). Links to it are updated. |
| `delete` | Move this note to the trash, with Undo |
| `duplicate` | Make a copy |
| `add tag` | Add one or more tags |
| `copy link` | Copy `[[Title]]` to paste into another note |
| `close other` / `close all` | Close the other tabs, or all of them |
| `move` | Move to another notebook |
| `open to the side` | Show this note in the side pane |
| `history`, `export` | Version history; export as PDF, Markdown, HTML or Word |
| `theme`, `settings`, `page width` | Change how the app looks |

### Search inside a note: ⌃S

⌃S opens a small search bar at the bottom of the note. Matches highlight as you type and the bar shows a count.

- **⌃S** next match, **⌃R** previous match (⌃R also starts a backward search).
- **Enter** jumps to the match and closes the bar. **Esc** cancels and returns to where you were.
- Lowercase ignores case; one capital letter makes the search exact.

⌘F opens find and replace. ⌘F always finds in what is in front: in a note, this find and replace bar; in the Tasks view or a list of notes, its narrow-down box; in a guide, the guide's find bar; in the shortcuts window, its find box; anywhere else, ⌘K's search. **Edit → Find…** in the menu bar does the same.

### Jump to a heading: ⌘⇧O

Lists the headings in the note. Type to filter, Enter to jump. The Outline in the side panel does the same with the mouse.

### Backlinks

The side panel on the right of a note shows how it connects to the rest:

- **Backlinks:** every note that links to this one, with the line the link is on.
- **Unlinked mentions:** notes that contain this note's title as plain text, without a link. **Link** turns the mentions in that note into links, so they become backlinks. Titles shorter than three letters and daily notes are skipped.
- **Outgoing links:** the notes this one links to, then the web addresses in it. A note that does not exist yet is marked *create*.

## Daily notes, the calendar and the canvas

**Today** in the sidebar (⌘D) opens today's daily note, creating it if needed. Daily notes are stored as `Daily/2026-10-06.md`.

Every note has two sides, switched with the **Page / Canvas** buttons:

- **Page:** ordinary text.
- **Canvas:** an endless board of cards. Daily notes open on the canvas by default.

On the canvas:

- **Double-click** empty space to add a card; double-click a card to edit it. Cards are markdown.
- **Drag** a card to move it; drag its corner to resize.
- Drag the **dot** on a card's edge to another card to connect them, or to empty space to make a connected card.
- **Scroll** to pan; pinch or ⌘-scroll to zoom.
- Paste or drop images and files to add them as cards.
- Select a card for colours, duplicate and delete. ⌫ deletes the selection.

**Journal** in the sidebar (⌘J) shows your daily notes as one continuous page, today at the top and earlier days below. Scrolling down loads more.

- Every day is editable in place: click into any day and write. It is the same daily note, so nothing is copied.
- Each day shows its **Tasks for this day** panel, and today's also lists what is overdue.
- Only days that have a note appear, and days in the future are left out. Today is always there.
- Click a day's date to open it on its own; ⌘-click opens it beside the journal.
- Formatting shortcuts, ⌘K commands and search-in-note apply to the day you last clicked in.
- A day that also has a canvas shows a **Canvas** button. The journal shows only the page side.

**Calendar** shows a month. Days with a daily note have a dot. Click a day to see it; press Enter or double-click to open it. The small calendar in the sidebar opens a day's note with one click.

## Quick capture and scratch notes

**Quick capture** (⌘⇧C, or ⌃⌥Space from any app) opens a small box. Type, press Enter, and carry on with what you were doing. A note always goes into **today's note**: as a timestamped line (Settings → Capture & scratch → Timestamp captures), or as a card if today is on the canvas. ⇧Enter starts a new line.

To capture a task, use **Quick task** below: tasks go to the Inbox, not to today's note.

### Quick task

**Quick task** (⌘⌥C, or ⌃⌥T from any app) opens the same box ready for a task. The **Note / Task** switch at the top changes between the two, and so do their shortcuts while the box is open; what you have typed comes along.

Type the task with its details, as you would on a task line in a note, and the same suggestions appear:

| Type | Suggests |
| --- | --- |
| `>` and a day in words (`>fri`, `>next week`), or `>some` | When: the planned day, or Someday |
| `@due(` and a day in words | The due date |
| `P` after a space | P1, P2, P3 |
| `#` | Your tags |
| `[[` | A note to link |

You do not have to pick a suggestion: when the task is saved, `>fri` and `@due(next week)` are turned into the dates they mean. The line under the box shows what Margin understood (When Tomorrow, Due Fri 16 Oct, P2, #atlas) before you save.

- **Enter** saves the task and closes the box. **⇧Enter** saves it and keeps the box open for the next one.
- Every task goes to the end of the **Inbox note**: the note called *Inbox* in your Inbox notebook, made the first time it is needed.
- With no day, it waits in the **Inbox** list until you decide on it (see [The Inbox](#the-inbox)). If you typed a day (`>fri`) or Someday, it shows in Today, Upcoming or Someday instead; the line under the box tells you which before you save.
- Esc closes a suggestion list first, then the box.

Captured tasks appear in **Tasks → Inbox**, where you sort them: see [The Inbox](#the-inbox).

**Scratch notes** (⌘⌥N, or New → Scratch note) are for things you need for a few days. They expire after a week and move to the trash. Each one shows how long it has left, with buttons to extend it or **Keep** it as a normal note.

## Meeting notes and templates

**New meeting note** (⌘⇧M) asks for the meeting's name, then:

- creates the note in `Meetings/2026/Oct/`
- fills in the meeting template and tags it `#meeting`
- adds a timestamped link to it in today's daily note

**Templates** are ordinary notes in the `Templates` notebook. Edit one like any note. To use one, choose **New → From a template…**, or type `/template` in a note.

Templates can contain placeholders that are filled in when the note is made:

| Placeholder | Becomes |
| --- | --- |
| `{{date}}` | 2026-10-06 |
| `{{time}}` | 16:54, or 4:54 PM (your Time format setting) |
| `{{day}}` | Tuesday |
| `{{title}}` | The note's or meeting's name |
| `{{date:ddd, Do MMM}}` | Tue, 6th Oct |
| `{{time:h:mmA}}` | 4:54PM |

**Daily notes** start from the note called `Daily` in the Templates notebook. Margin creates it the first time a daily note is needed, with a "Top 3" checklist and a "Log" section. Edit it like any note to change what each day starts with; empty it for blank daily notes. Because it is a note, it travels with your notes folder to another computer.

- **The Top 3 carries forward.** When today's note is created, anything left unticked in the last day's Top 3 is moved into today's, with anything nested under it. Ticked items, and ones you struck through, stay where they were. An item written without a checkbox is carried too, and becomes a checkbox so it can be ticked. If today's note already exists, run "Move unfinished Top 3 to today" from ⌘K. Turn the automatic move off in Settings → Daily notes.
- Placeholders are filled in for the day the note is for, so a note for next Tuesday says Tuesday.
- Tags on the `Daily` note are given to each new daily note.
- The template is applied when a daily note is first created, whichever way that happens: Today, the calendar, the journal, quick capture, or a link such as `[[tomorrow]]`.
- Daily notes that already exist are not changed. To add the template to one, type `/template` in it.
- If you typed a template into Settings → Daily notes before, it is still used as long as there is no `Daily` note.

The format letters are the same as Obsidian's: `YYYY`, `MMMM`, `MMM`, `MM`, `Do`, `DD`, `dddd`, `ddd`, `HH`, `h`, `mm`, `A`.

## People and 1:1s

**New person note** (in the New menu, or ⌘K → "New person note") asks for a name and creates one note for that person in the `People` notebook. The note holds every 1:1 with them:

```
## Next time
- things to raise

## Meetings
### Tue, 6th Oct 2026
- notes
**Actions**
- [ ] …

## About
```

- **Between meetings:** add to *Next time*: ⌘K, type their name, and write the line under *Next time*.
- **When the meeting starts:** ⌘K → "Add today's meeting entry". A new dated heading is added at the top of *Meetings*, newest first.
- **Actions** are tasks, so they show in the Tasks view. Give them a due date with `@due(fri)`.

The layout comes from the `Person` template in the Templates notebook, which is created the first time you use the command. Edit it to change what new person notes start with. The notebook is set in Settings → Templates & meetings.

## Research notes

A research note keeps a source and your thinking about it together. **New → Research note** asks for a link and fetches the page's title.

Each one has a source link, a status (Unread, Reading, Done), and sections for a summary, quotes and your notes. Paste screenshots and PDFs straight in.

**Research** in the sidebar lists them, filtered by status. Home shows what you are reading.

## Organising

For what each of these is for, see [How Margin is organised, and why](#how-margin-is-organised-and-why). This section is the how-to.

- **Notebooks** are folders, and can be nested. Right-click one to add a note, add a notebook inside it, rename or delete it. Drag a note from a list onto a notebook to move it.
- **Tags:** add them under the title, or write `#tag` in the text. Click a tag to see everything with it. ⌘T adds a tag to the note you are in: the tags you already use are listed and narrow as you type, Enter picks the highlighted one, and a name that does not exist yet is offered as a new tag. Several words separated by spaces add several tags. Every tag has its own colour, chosen automatically from its name, and keeps it everywhere: under the title, in the text, in the sidebar and in the Tasks view. Nested tags such as `work/atlas` share the colour of their first part.
- **Notebook tags:** right-click a notebook and choose **Tags for notes here…** to give it tags, such as `#meeting` for Meetings.
  - A note created in the notebook, or moved into it, gets those tags written into the note itself, alongside the ones you add by hand.
  - Notebooks inside it inherit them.
  - When you set the tags, Margin offers to add them to the notes already there, and tells you how many.
  - Moving a note out does not remove the tags; remove them by hand if they no longer apply.
  - The notebook's page shows its tags under the title.
- **Pin** a note (the pin button) to keep it in the sidebar and on Home.
- **Move** a note with ⌥M, or by clicking its notebook name above the title.

Lists of notes can be filtered (press `/`) and sorted. ↑ and ↓ move through a list; Enter opens.

## Two notes side by side

Open a second note beside the first:

- **⌘-click** or **⌥-click** a note anywhere: a link, a tab, a list row, a backlink.
- **Right-click** a note → Open to the side.
- **⌥↵** on a result in ⌘K.
- **⌘⌥\\** opens the current note to the side, or closes the side pane.

Each pane has its own tabs. The pane you last clicked is the active one, marked with a coloured line along the top; search, jump to heading, list shortcuts and ⌘W apply to it. Drag the divider to resize; double-click it for equal halves.

## History, trash and export

**Version history** (⌥V) keeps a snapshot for every five minutes of editing. Pick a version to see what changed, then **Restore this version**.

**Deleting** a note moves it to the `.trash` folder inside your notes folder. A message offers Undo for a few seconds.

**Export** (the download button on a note):

- **Markdown**, **Web page (.html)** and **Word (.doc)** save a file.
- **PDF** saves directly in the desktop app; in a browser it opens the print dialog.
- **Copy for Google Docs** copies the formatted note; paste it into a new document.

## Importing from Obsidian

**Settings → Files & data → Import…** copies an Obsidian vault into your notes folder. Your Obsidian folder is not changed.

It brings notes with their folders, tags and dates; images and PDFs; links between notes; and canvases. Notes named like `2025-03-04` become daily notes.

Callouts appear as plain quotes, embedded notes become links, and plugin features such as Dataview stay as text. Importing the same vault twice duplicates the notes.

---

# Part 2: Tasks

Everything about deciding what to do and when: what a task is, its priority and dates, the Tasks view and its lists, saved filters and the Top 3. Tasks are written inside notes, but planning and reviewing them is a separate activity with its own view and its own keys.

## Tasks

A task is a checkbox: `- [ ] Send the proposal`. Type `/task`, press ⌘⇧9, or write it by hand, or capture one from anywhere with **Quick task** (⌘⌥C; see [Quick task](#quick-task)). Tasks can live in any note. To tick or untick the task the cursor is on, press ⌘↵ or click its box; with several lines selected, ⌘↵ ticks them all.

Ticking a task writes the day on its line, `@done(2026-10-07)`, so the Logbook can show when it was done. Unticking takes it off again. Turn this off in Settings → General → **Record when tasks are done**.

The lists work the way they do in Things 3:

- A **planned day** is the day a task *starts*. Until then it waits in Upcoming; from that day on it is in Today, and it stays there until you tick it. It never becomes overdue.
- A **due date** is a real deadline. Only a missed due date makes a task overdue.
- **Someday** parks a task. It is kept out of Today, Upcoming and Anytime until you give it a day.
- The **Inbox** holds what you have captured but not decided on: tasks in the Inbox note with no planned day. They stay out of Anytime until you give them a day or Someday, or move them into a project's note.
- A **project** is a note, and an **area** is the notebook it is in: a project called Organization is the note `Work/Organization`. Headings in the note divide the project, as headings do in Things. Notes in the notebooks Margin manages (Daily, Meetings, Inbox, Templates, Scratch) and in People are not projects.
- A meeting's actions belong to its project without being moved: a meeting note that links `[[Organization]]` lists its tasks under Organization when the Tasks view is grouped by project. A task anywhere else can do the same by linking the project on its own line: `- [ ] Ring the recruiter [[Organization]]`.

### Details on a task

Details are written on the task's own line, as plain text, so they stay readable in any editor:

```
- [ ] Send the proposal P2 #atlas >2026-10-08 @due(2026-10-10)
```

| Detail | Write | Meaning |
| --- | --- | --- |
| Priority | `P1` `P2` `P3` | High, medium, low |
| Tags | `#atlas` | The same tags as everywhere else |
| Planned day | `>2026-10-08` | The day you start on it; it is in Today from then on |
| Someday | `>someday` | Parked; out of Today, Upcoming and Anytime |
| Due date | `@due(2026-10-10)` | The deadline |
| Done on | `@done(2026-10-07)` | Written for you when you tick the task |

You do not have to type dates in full. On a task, type `>` or `@due(` and then a day in words (`fri`, `tomorrow`, `next week`, `14 oct`) and pick the suggestion; after `>`, `some` offers `someday`. The slash commands `/due`, `/plan`, `/someday` and `/p1` (or `/priority`) insert the same things.

With the cursor on a task in a note, these keys change its details without typing them:

| Key | Does |
| --- | --- |
| ⌘⌥T | Move to today: sets the planned day to today. The due date is left alone. |
| ⌘⇧S | When: opens the calendar for the planned day, with Someday |
| ⌘⇧D | Due date: opens the calendar |
| ⌘⇧P | Priority: steps through P1, P2, P3 and none |
| ⌘↵ | Tick or untick |

Move to today and Priority apply to every task in a selection. The same four are in ⌘K under "Task:", and all of them can be changed in Settings → Shortcuts. In the browser version they are ⌥⇧T, ⌥⇧S, ⌥⇧D and ⌥⇧P.

In the editor the details show as small labels. A due date turns red once it has passed. A planned day that is today or earlier is highlighted, because the task is in Today.

### The Tasks view

**Tasks** in the sidebar (⌘⇧T) gathers every checkbox from every note. Templates are left out.

- **Lists** across the top: first the ones from Things, Inbox, Today, Upcoming, Anytime, Someday and Logbook; then Overdue, This week, Next 30 days, No date and All open. Each shows its count (except the Logbook). Keys 1 to 6 pick the Things lists in that order; 7 is Overdue, 8 This week, 9 No date and 0 All open.
- **Narrow down** with the box: words match the task or its note's title, `#atlas` needs that tag, `p2` needs that priority or higher (P1 and P2). The tag chips below do the same with a click.
- **From** chooses where tasks are taken from: All, Notes (leaves out tasks written in daily notes) or Daily (only those).
- **Group by** date, project or priority. **Project** puts each project's tasks together under its notebook, in the order they are written and under their headings, with a small circle that fills as the project's tasks are ticked. After them come the tasks that belong to the project but live elsewhere, each under "From" and the note they are in: the actions of meetings that link the project, and any task whose line links it. Ticking one ticks it in its own note; nothing is moved. Tasks in daily notes that link no project are kept together as one group, latest day first; a meeting that links no project keeps its tasks under its own name. In the Logbook, grouping by date groups by the day each task was done.
- **Tick** a task to complete it. The checkbox in the note's file is ticked.
- **Hover** a task for four buttons: priority, when (planned day or Someday), due date, and move to another note. Clicking a date label changes it too.
- **Rescheduling:** the when and due-date buttons open a small calendar. Click a day, or type one in words (`fri`, `14 oct`, `in 3 days`) and press Enter. The arrow keys move the highlighted day, PgUp and PgDn change month, and Today, Tomorrow and Next week are one click. The when calendar also has **Someday**. **Remove** clears the date, or takes a task out of Someday.
- **Click** a task to open its note at that line. ⌘-click opens the note to the side.

With the keyboard:

| Key | Does |
| --- | --- |
| ↑ ↓ (or K J) | Move between tasks |
| Home, End | First and last task |
| Space (or X) | Tick or untick |
| ↵ | Open the task in its note, with the cursor at the end of the task's line; ⇧↵ opens it to the side |
| D | Due date |
| T | Move to today |
| S | When: planned day or Someday |
| P | Priority |
| M | Move to another note (a project), under its Open Threads heading |
| 1 to 9, 0 | Switch list |
| / | Narrow down; ↓ or ↵ goes back to the list |

How the lists are decided:

- **Inbox:** in the Inbox note, with no planned day and not Someday. A due date does not take a task out of the Inbox, but once it is due it also shows in Today.
- **Today:** planned for today or an earlier day, or due today or earlier.
- **Upcoming:** planned for a day after today. A task with only a due date is not here; it is in Anytime until the day it is due.
- **Anytime:** everything you could do now: not planned for a later day, not Someday, and not waiting in the Inbox. Today's tasks are here too, marked with a yellow star, as in Things. The star shows in every list except Today and Overdue, so you can see what you have already committed to today.
- **Someday:** marked `>someday`.
- **Logbook:** ticked tasks, the most recently done first. Tasks ticked before the day was recorded come last, under "Day not recorded".
- **Overdue:** the due date has passed. A planned day passing never makes a task overdue.
- **This week:** due or planned between the first and last day of this week (your Week starts on setting).
- **Next 30 days:** due or planned from today to 30 days ahead.
- **No date:** no due date, no planned day, not Someday and not waiting in the Inbox.

The number beside Tasks in the sidebar is how many are in Today, overdue ones included.

### The Inbox

The Inbox is where things wait until you decide what they are, as in Things 3. It is one note: the **Inbox note**, called *Inbox*, in the Inbox notebook (Settings → General → Inbox notebook). A task is in the Inbox list when it is in that note, has no planned day and is not Someday. That covers everything Quick task saves, and any task you write there by hand. Tasks in other notes, even other notes in the Inbox notebook, are not in the Inbox. Capitals do not matter, as on a Mac.

A task with a day is not in the Inbox list even though its line is in the Inbox note: it is in Today or Upcoming. If other notes in the Inbox notebook still hold open tasks (a *Tasks* note from an earlier version, say), the Inbox list offers **Move them into Inbox**, with Undo.

Nothing in the Inbox shows in Anytime, so your considered lists stay clean. To clear it, open **Tasks → Inbox** (⌘⇧T, then 1) and, for each task:

- **Give it a day:** S, and pick one. It moves to Today or Upcoming. T plans it for today.
- **Park it:** S, then Someday.
- **Put it in its project:** M, type part of the note's name, and press Enter. The task line, with any indented lines under it, goes under the note's **Open Threads** heading, after the tasks already there, so moved tasks always collect in one place. If the note has no such heading, `## Open Threads` is added at the end of the page. If no note matches what you typed, the picker offers **New note "…"**: it is made in the notebook of the project you edited last (Work, usually) with the heading and the task in it; type `People/Sam` to choose another notebook. Undo in the message puts the task back. A task moved out of the Inbox note with no day goes to Anytime.
- **Tick it** if it is already done, or delete the line if it is not happening.

The task's line stays where it is in the note unless you move it; only the lists it shows in change. The Inbox's count in the sidebar tells you when there is sorting to do.

### Saved filters

Under **Tasks** in the sidebar are Inbox, Today, Upcoming, Anytime, Someday and Logbook, and Overdue while anything is overdue. You can add your own:

1. In the Tasks view, choose a list, narrow it down (say `#atlas p2`), and pick From and Group by.
2. Click **Save filter** and give it a name.

It appears under Tasks in the sidebar with a live count. Open it and change anything, and an **Update filter** button appears to keep the change. The ⋯ button, or a right-click in the sidebar, renames or deletes it. Saved filters are kept with your settings, so they belong to this app on this computer.

### Moving overdue tasks

When a list contains overdue tasks, **Move all…** opens the calendar. Pick one day and every overdue task shown gets it as its new due date. Narrow the list first to move only some of them. The confirmation has an **Undo**. Tasks whose planned day has passed are not overdue, so they are not moved; they wait in Today.

### The Top 3

The Top 3 is the short checklist at the top of each daily note: the few things that would make the day a success. Its items are tasks like any other. What is left unticked moves into the next day's Top 3 when that note is created; see [Meeting notes and templates](#meeting-notes-and-templates) for the details and the setting that turns this off.

### Tasks in the daily note

A daily note shows a **Tasks for this day** panel listing tasks from other notes that are due or planned for that date. Today's note also lists what is overdue, and, under **From earlier days**, tasks planned for an earlier day that are still open. The panel is a view: nothing is copied into the daily note's file, and ticking a task there ticks it in its own note. On a canvas day the panel starts folded in the top-left corner.

### Tasks from the command line

`margin-tasks` lists your tasks in a terminal, for scripts and automation. It reads the notes folder directly, gives the same lists as the Tasks view, and never changes a note. It works whether or not Margin is running.

It ships inside Margin and needs only Python 3.8 or newer: nothing else to install.

**Installing it.** Choose **Help → Command-Line Tool…** and click **Install**. Margin puts a link named `margin-tasks` in `~/.local/bin`, a folder in your own home, so no password is needed. The link keeps working when Margin is updated.

To do the same by hand, or on a Mac where you would rather not use the button:

```bash
mkdir -p ~/.local/bin && ln -sf "/Applications/Margin.app/Contents/Resources/tools/margin_tasks.py" ~/.local/bin/margin-tasks
```

If the terminal then says `margin-tasks` is not found, `~/.local/bin` is not on your path yet. Add it once and open a new Terminal window:

| Shell | Run once |
| --- | --- |
| zsh (the Mac default) or bash | `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc` |
| fish | `fish_add_path ~/.local/bin` |

You can also run it without installing: `python3 "/Applications/Margin.app/Contents/Resources/tools/margin_tasks.py" today`. If you run Margin from the project folder, the file is `tools/margin_tasks.py` there.

It finds your notes folder from Margin's own settings. Use `--vault PATH`, or set `MARGIN_VAULT`, to point it elsewhere.

**Lists.** The first word chooses the list; without one you get Today.

```bash
margin-tasks today
margin-tasks upcoming
margin-tasks logbook --done-after -7
```

The lists are `inbox`, `today`, `upcoming`, `anytime`, `someday`, `logbook`, `overdue`, `week`, `month`, `undated`, `open`, and `all` for every task, ticked or not. `inbox` reads the note called Inbox in the Inbox notebook; if your Inbox notebook is not called Inbox, add `--inbox NAME`.

**Narrowing down.** Options combine: a task must satisfy all of them.

| Option | Keeps |
| --- | --- |
| `--tag atlas` | Tasks with that tag, including nested ones such as `atlas/finance`. Repeat for several. |
| `--priority p2` | P2 or higher. Add `--exact-priority` for P2 only. `--priority none` for tasks without one. |
| `--due-before`, `--due-after`, `--due-on` | By due date |
| `--planned-before`, `--planned-after`, `--planned-on` | By planned day |
| `--done-before`, `--done-after`, `--done-on` | By the day it was ticked |
| `--has-due`, `--no-due` | With or without a due date |
| `--notebook Work` | Tasks in that notebook and the ones inside it |
| `--note atlas` | Tasks in notes whose title contains the text |
| `--note-tag meeting` | Tasks in notes that carry that tag |
| `--source daily` | Only daily notes; `notes` for everything else |
| `-q "#atlas p2 priya"` | The same text you would type in the Tasks view's box |

A day can be written as `2026-10-12`, `today`, `tomorrow`, `yesterday`, `+3`, `-7`, or a weekday such as `friday` (the next one).

**Output.** The plain listing is for reading. For scripts, pick a format:

| Option | Gives |
| --- | --- |
| `--json` | A list of tasks, each with its text, done state, priority, tags, planned day, due date, done date, note, notebook, heading, file path and line number |
| `--csv` | The same as rows with a header |
| `--paths` | `path:line: [ ] task`, the way grep prints, which editors can jump to |
| `--format "{due}\t{text}"` | One line per task from your own template; the fields are the JSON names |
| `--count` | Only the number |

`--sort`, `--reverse`, `--limit` and `--group` control the order and layout. `margin-tasks --help` lists everything.

Some examples:

```bash
margin-tasks open --tag atlas --priority p2 --due-before friday
margin-tasks overdue --count
margin-tasks today --json
margin-tasks open --no-due --notebook Work --paths
```

Two settings live inside the app and cannot be read from outside it. If you renamed the Templates notebook, pass `--templates NAME` so its tasks are left out. If the `week` list starts on the wrong day, pass `--week-start sunday` or `monday`. Saved filters from the sidebar are not available by name; pass the equivalent options.

---

# Reference

## Settings

⌘, opens Settings. A search box at the top finds any setting or shortcut by name.

| Section | What is there |
| --- | --- |
| General | Start page, where new notes go, which sidebar sections to show, week start, sidebar calendar, time format, how typed dates are read, tabs |
| Appearance | Theme, accent colour (in the desktop app the first choice, System, follows the accent colour set in macOS System Settings), note font and code font (any installed font), text size and weight, line spacing, list indent, indent guides, image border, page width. The note font, size and weight also apply to tasks wherever they are listed: the Tasks view and the panel under daily notes. |
| Text styles | Colour and size for Heading 1–5, bold and italic, with a separate colour for the light and dark themes |
| Editor | Default mode, toolbar, spell check, auto-closing brackets, image pasting, line numbers, side panel |
| Daily notes | Canvas or page, the daily notebook, a template for new days |
| Templates & meetings | Template and meeting notebooks, how meetings are filed, the meeting template |
| Capture & scratch | Timestamps on captures, scratch expiry |
| Files & data | Notes folder, attachments folder, image naming, Obsidian import, reset |
| Shortcuts | Every shortcut; click one and press new keys |

**Text style colours** have a light-theme and a dark-theme picker. Leave the dark one on Auto and it uses a lightened version of your light colour, so a dark heading colour stays readable on a dark background.

Page width is measured in characters per line. Settings are kept per app: the desktop app and a browser each have their own.

## Shortcuts

These are the defaults. Change any of them in Settings → Shortcuts.

Press **?** (or click **Shortcuts** at the bottom of the sidebar) for a window listing every shortcut with the keys you have set. Start typing to narrow it to the ones whose name or keys match; ⌘F returns to the box, and **Esc** clears it, then closes the window.

| Action | Desktop app | Browser |
| --- | --- | --- |
| Search, switch, run commands | ⌘K | ⌘K |
| New note | ⌘N | ⌥N |
| New meeting note | ⌘⇧M | ⌥T |
| Add a tag to this note | ⌘T | ⌥G |
| Tick or untick a task | ⌘↵ | ⌘↵ |
| Heading 1 to 5 | ⌘1 to ⌘5 | ⌘⌥1 to ⌘⌥5 |
| Insert a web link | ⌘L | ⌥K |
| New scratch note | ⌘⌥N | ⌥S |
| New canvas | ⌘⇧N | — |
| Quick capture | ⌘⇧C | ⌥C |
| Quick capture from any app | ⌃⌥Space | — |
| Quick task | ⌘⌥C | ⌥⇧C |
| Quick task from any app | ⌃⌥T | — |
| Today's daily note | ⌘D | ⌥D |
| Home | ⌘⇧H | ⌥H |
| Calendar | ⌘⇧L | ⌥L |
| Journal | ⌘J | ⌥J |
| All notes | ⌘⇧A | ⌥A |
| Tasks | ⌘⇧T | ⌥I |
| Back / forward | ⌘[ / ⌘] | ⌘[ / ⌘] |
| Previous / next tab | ⌘⇧[ / ⌘⇧] | ⌥[ / ⌥] |
| Jump to tab | ⌥1–9 | ⌥1–9 |
| Close tab | ⌘W | ⌥W |
| Write / Read | ⌘E | ⌘E |
| Search in note | ⌃S, ⌃R | ⌃S, ⌃R |
| Find in what is in front (in a note: find and replace) | ⌘F | ⌘F |
| Jump to a heading | ⌘⇧O | ⌘⇧O |
| Bulleted / numbered / task list | ⌘⇧8 / ⌘⇧7 / ⌘⇧9 | same |
| Nest / un-nest list item | Tab / ⇧Tab | same |
| Move list item | ⌥↑ / ⌥↓ | same |
| Fold or unfold here | ⌘' | ⌘' |
| Fold (again: the section around it) / unfold | ⌘⌥↑ / ⌘⌥↓ | same |
| Bold / italic | ⌘B / ⌘I | same |
| Open to the side, or close it | ⌘⌥\\ | ⌘⌥\\ |
| Side panel (backlinks) | ⌘. | ⌘. |
| Sidebar | ⌘\\ | ⌘\\ |
| Version history | ⌥V | ⌥V |
| Move to notebook | ⌥M | ⌥M |
| Rename | F2 | F2 |
| Export as PDF | ⌘P | — |
| Settings | ⌘, | ⌘, |

On Windows and Linux, ⌘ is Ctrl and ⌥ is Alt.

## Recommended workflows

The full routine is in its own document: **[Theory of operations](operations.md)**. Like this guide it has two parts, one for notes and one for tasks, and each says exactly what to do every morning, during the day, in every meeting, at the end of the day, every week and every month, with the keys for each step. Open it from **Help → Theory of Operations**, or type "routine" in ⌘K.

In short, for notes:

- **Morning:** open the journal (⌘J) and glance at yesterday's Log.
- **During the day:** capture with ⌘⇧C; link people and projects as you write.
- **Meetings:** ⌘⇧M as it starts, link who and what, bullets under Notes, then Decisions.
- **End of day:** read down today's Log once.
- **Weekly:** skim the week, refresh people notes, empty Scratch.
- **Monthly:** tidy tags, notebooks and templates; back up.

And for tasks:

- **Morning:** read today's task panel, clear anything overdue, settle the Top 3.
- **During the day:** write anything that needs doing as a task; tick things as you finish.
- **Meetings:** write each action as a task, with a due date if one was agreed.
- **End of day:** tick what is done, empty the Inbox, and leave the rest.
- **Weekly:** clear Overdue, plan from Upcoming and Anytime, catch undated tasks.
- **Monthly:** review Someday, read the Logbook, close finished projects.

### Research and learning

1. **New → Research note** with the link. It starts as Unread.
2. While reading, paste quotes under **Quotes** and write your own reaction under **My notes**, in your own words.
3. When an idea is worth keeping on its own, give it a note and link back with `[[`.
4. Set the status to Done. The Research list shows what is still open.

## Where your notes live

```
vault/
  Welcome to Margin.md        a note; the file name is its title
  Work/Atlas plan.md          notebooks are folders
  Daily/2026-10-06.md         daily notes
  Meetings/2026/Oct/…         meeting notes, filed by date
  Templates/…                 your templates
  attachments/                images, PDFs and other files
  .history/                   version snapshots
  .trash/                     deleted notes
  .margin/config.json         the attachments folder name
```

A note is markdown with a few lines at the top for its tags, dates and so on. A canvas is stored at the end of the note as cards wrapped in comments, so the file still reads sensibly elsewhere.

You can edit the files in any other program, or add `.md` files to the folder. Margin picks up the changes when you return to its window.

**Back up by copying the folder**, or by keeping it in a synced location such as iCloud Drive or Dropbox.

## If something goes wrong

| Problem | What to do |
| --- | --- |
| "Port 4321 is already in use" | Margin is already running. Open http://localhost:4321, or stop the other copy. |
| A change you made is missing | Open version history (⌥V) and restore an earlier version. |
| A note disappeared | Look in the `.trash` folder inside your notes folder. Scratch notes go there when they expire. |
| A shortcut does nothing | Check Settings → Shortcuts. Another action may have taken those keys. |
| Text is not rendering | Check the mode buttons at the top right of the note; Markdown source shows raw text. |
| No spelling suggestions | Turn on Settings → Editor → Spell check. |
| The app will not open on a Mac | The build is unsigned. Right-click the app and choose Open. |
