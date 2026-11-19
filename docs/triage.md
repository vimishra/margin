# Margin triage guide

Triage is how Margin handles the suggested tasks that a program of yours writes from your mail, chat and bug tracker. This guide explains how it works, how to set it up, how to work through it each day, and what Margin promises not to do to your notes. The [user guide](user-guide.md) covers the rest of Margin; its section [The triage note](user-guide.md#the-triage-note) is a short version of this one.

## Contents

- [The idea](#the-idea)
- [Setting it up](#setting-it-up)
- [The Triage view](#the-triage-view)
- [The note beside the view](#the-note-beside-the-view)
- [Working through triage](#working-through-triage)
- [Deciding on a task](#deciding-on-a-task)
- [Moving tasks into your notes](#moving-tasks-into-your-notes)
- [Working in the note itself](#working-in-the-note-itself)
- [Rules: where tasks go](#rules-where-tasks-go)
- [What Margin promises](#what-margin-promises)
- [Keeping old runs in an archive note](#keeping-old-runs-in-an-archive-note)
- [For the program that writes the note](#for-the-program-that-writes-the-note)
- [Keys](#keys)
- [Settings](#settings)
- [When something looks wrong](#when-something-looks-wrong)

## The idea

Your triage program runs several times a day. Each time, it reads what came in (mail, chat, bugs) and rewrites one note, the **triage note**, with what it thinks you may need to do: quick replies, actions, and things to know about, grouped by area (a **category**, such as a project or a team).

Those are **suggestions**, not commitments. Margin keeps them apart from your own tasks until you decide on each one:

- **Done already, or quick enough to do now:** complete it.
- **Not yours, or not worth doing:** drop it.
- **Real work:** move it into the note where you track that work (a **workstream** note, such as *Payments Platform*). From then on it is one of your tasks, in Today, Anytime and the rest.
- **Not sure yet:** leave it. It stays in the triage note, and your program may carry it into its next run.

The **Triage view** makes each of those one key.

## Setting it up

You do this once, on the computer where you want to triage (Settings are in the notes folder, so a second computer that opens the same folder gets them too).

1. **Tell Margin which note it is.** Settings → Triage → **Triage note**: the note's path in your notes folder, such as `Inbox/Triage`. From then on its tasks stay out of your task lists, and **Triage** appears under Tasks in the sidebar with the number of open suggestions.
2. **Tell Margin where work goes.** Either or both:
   - **A workstream notebook.** If your workstream notes live in one notebook (say *Workstreams*) and are named like your triage categories (a category *Payments Platform* and a note *Workstreams/Payments Platform*), set **Workstream notebook** to that notebook. That is all: each task goes to the note named like its category.
   - **Rules**, for everything that does not line up by name: *Category is* "Pay Ops" → *Workstreams/Payments Platform*; *Has tag* `#oncall` → *Work/On-call*; *Title contains* "invoice" → *Finance/Invoices*. See [Rules](#rules-where-tasks-go).
3. **If your program moves old runs into another note** (say runs older than four weeks into `Inbox/Triage_archive`), set **Triage archive** to that note. Margin then treats it like the triage note: its tasks stay out of Today, Anytime, the Logbook, the counts and `margin-tasks`, ticking there changes only the box, and archiving leaves it alone. Without this setting it would be an ordinary note, and its old suggestions would show up as your tasks. The Weekly review counts what was completed in both notes.
4. **Optionally:** a **default note** for anything nothing else places; the **heading** moved tasks go under (Open Threads unless you change it); words to **take off** as tasks move (such as `#quick`); and whether to add a **"from triage"** line under each moved task.

You do not have to set up rules before starting. In the Triage view, choosing a note with **⌥↵** instead of ↵ adds a rule for that category as you go, so the mapping builds itself over the first few days.

## The Triage view

Open it with **Triage** under Tasks in the sidebar, or ⌘K → *Go to Triage*.

- **Header:** the newest run's label (for example "Mon 5 Jan, 11:00") with its counts of open, done and dropped tasks; **Open the note**, to see the note itself in place of the view; and, beside it, a button that opens the note on the right instead (see [below](#the-note-beside-the-view)).
- **Summary:** your program's summary of the run, which you can fold away.
- **Filters:** words (in the title, tags, link names and details), category, kind (quick, action, other) and priority. **Done & dropped** also shows what you have already dealt with; **Older runs** shows earlier runs below, as they were.
- **Categories**, each foldable, with its open count and, when you point at it, **Move all**. Inside, quick replies first, then actions, then anything else.
- **Each task:** its box, priority, title, a chip for each link (mail, chat, bug; click one to open it in your browser), its dates and tags, **carried** if your program brought it over from an earlier run, and, in a dashed chip, the note **M** would move it to. Click a task, or press ↵, for its details: the lines under it and its links in full. **FYI** lines are folded at the end of each category.

The view follows the note. When your program writes a new run, it appears within a few seconds, and you keep your place: the task you were on, the details you opened, your folds and your filters.

## The note beside the view

The view shows each task, its details and links, but not everything your program writes around them. To read the note itself while you triage, open it **on the right**, beside the view:

- **N** shows the selected task in the note, on the right, with its line lit up for a moment. So does **Show in the triage note** in a task's right-click menu, the button next to **Open the note**, or ⌥-click on **Open the note**.
- **The keyboard stays in the view,** so you go on with ↓, Space, M and the rest. While the note is open on the right, it **follows** you: each ↑ or ↓ brings the new task's place in the note into view.
- **Click in the note** to work there with the note's own keys (see [Working in the note itself](#working-in-the-note-itself)); click the view to go back to its keys.
- The note on the right is an ordinary tab: close it with its ×, or drag the divider to give either side more room.

## Working through triage

A routine that works well: two fixed sittings of 20 to 30 minutes, late morning (after an hour on your most important work) and mid-afternoon, rather than whenever a new run comes in. Triage always has something in it; kept open all day, the urgent crowds out the important. The **Focus** box at the top of the view keeps the week's important next actions in sight while you triage.

1. **Open Triage** and read the Summary. If you want your program's full notes in view as you go, press **N** to open the triage note on the right.
2. **Take the quick replies first.** Answer them (O opens the message), then **Space** to complete each.
3. **Go down the actions with ↓.** For each, one key: **Space** (done), **C** (not doing it), **M** (it is real work: move it to its workstream), **F** (it is important: move it and make it a focus task), **S** (plan a day for it) or just **↓** (leave it for now).
4. **When a whole category is real work,** press **A** on any of its tasks: everything open in it moves to where it belongs in one step.
5. **Stop when the list is short.** What is left is what still needs a decision; your next run will carry it over.

Two habits help:

- **Decide, do not do.** Triage is for sorting. Anything that takes more than a couple of minutes, move it to its workstream and do it from there.
- **Ask "does this belong to something important?"** If it does, **F** moves it into that project as a focus task, so it becomes part of the important work instead of competing with it.
- **Let the rules grow.** Each time you pick a note by hand for a category that will come up again, use ⌥↵: next time M will know.

After triage, your moved tasks are where you plan the day from: Today, Anytime and each workstream note, as described in the [theory of operations](operations.md).

## Deciding on a task

| Key | Does | In the triage note |
| --- | --- | --- |
| **Space** or **X** (or the box) | Complete; again to reopen | `- [ ]` becomes `- [x]`, and `@done(date)` is added |
| **C** | Drop (not doing it); again to reopen | `- [-]`, and `@cancelled(date)` is added |
| **S** | When you plan to do it, or Someday | `>2026-01-07` (or `>someday`) in place of the one there, or at the end |
| **D** | Its due date | `@due(2026-01-09)` likewise |
| **M**, **⇧M**, **A** | Move it, or the whole category | its lines are taken out (see below) |
| **F** | Move it as M does, as a focus task | its lines are taken out; in the note it goes to, the task line gets the focus tag (`#focus`) |

Every one says what it did in a message with **Undo**. The dates are left out if you turned off recording them (Settings → General). In the view, only tasks of the newest run can be changed; earlier runs are history. (In the note itself, the keys work on any task.)

## Moving tasks into your notes

- **M** moves the task where your rules send it (the dashed chip shows where, beforehand). If nothing decides, it asks.
- **⇧M** always asks: type part of a note's name, or a new name to make one (`Workstreams/Hiring`). **⌥↵** instead of ↵ also remembers that note for the task's category.
- **F** moves it as M does (asking when nothing decides), and adds the focus tag to the task line as it goes in, before its priority and dates.
- **A** (or **Move all** on the category's heading) moves every open task of the category, each where its rules send it; the ones nothing places go together to a note you pick. It is one step, with one Undo.

What happens to a moved task:

1. **It goes into the note unchanged** (with F, plus the focus tag): the task line, with its links, priority, tags and dates, and the lines under it. It is added at the end of the note's **Open Threads** section (or the heading you chose; at the top if you chose that). A note without that heading gets it at the end.
2. **Then it is taken out of the triage note**: just its lines. The category's heading stays, even if empty.
3. **If the note already has the task** (an open task there links to the same message or bug), nothing is added: the task just leaves the triage note, and the message says so.
4. **Undo** puts every note involved back exactly as it was. If one of them has changed since (your program wrote a new run, say), Undo does nothing and says so: the task stays where it went, so it is never lost.

Because the link stays on the task's line, your program can see that you have taken the item on (it finds the link in an open task in your notes) and does not suggest it again.

## Working in the note itself

You can also act on tasks while reading the triage note, on the right or in its own tab. Put the cursor on a task (anywhere on its line or the lines under it), or select several, and use the note's task keys:

| Key | Does |
| --- | --- |
| ⌘↵ (or the box) | Complete; again to reopen |
| ⌘⌥↵ | Drop; again to reopen |
| ⌘⌥T | Plan for today |
| ⌘⇧S | When: a day, or Someday |
| ⌘⇧D | Due date |
| ⌃⌘M | Move it where its rules send it (asks if nothing decides), as **M** does in the view |
| ⌃⇧⌘M | Move it to a note you pick (⌥↵ there also adds a rule), as **⇧M** does |

They do exactly what the view's keys do, the same way: Margin reads the note fresh from disk, changes only that task's line (or, for a move, takes out its lines), and saves it only if the file has not changed since. So a run your program writes at the same moment is never saved over, and the cursor stays on the task. Each says what it did, with **Undo**. Only typing in the note is saved the ordinary way (see [What Margin promises](#what-margin-promises)).

⌃⌘M and ⌃⇧⌘M also work in any other note: they ask which note to move the task to, as M does in the Tasks view. They are under Format and in a task's right-click menu, and can be changed in Settings → Shortcuts (they are not ⌥⌘M, which macOS keeps for Minimize All).

## Rules: where tasks go

M takes the first of these that applies:

1. **Rules**, top to bottom. Each one is:
   - **Category is** *name*: the task's category (the `### ` heading it is under), ignoring capitals;
   - **Has tag** *#tag*: the task has that tag, or one under it (`#oncall` matches `#oncall/pager`);
   - **Title contains** *words*: the words appear in the task's title;
   
   and names a note. A rule whose note is missing is skipped (Settings marks it in red).
2. **The workstream notebook:** a note in that notebook (or one inside it) whose name is the task's category.
3. **The default note.**
4. Otherwise, M asks.

Put narrow rules (a tag, some words) above broad ones (a whole category), since the first match wins. Reorder them with ↑ ↓ in Settings → Triage.

The rules are kept in your notes folder, in `.margin/config.json`, so you can edit them in any text editor while Margin is running:

```json
"triage": {
  "note": "Inbox/Triage",
  "workstreamNotebook": "Workstreams",
  "rules": [
    { "tag": "oncall", "note": "Work/On-call" },
    { "title": "invoice", "note": "Finance/Invoices" },
    { "category": "Pay Ops", "note": "Workstreams/Payments Platform" }
  ],
  "default": "Work/Unsorted",
  "heading": "Open Threads",
  "strip": ["#quick"],
  "addLine": true
}
```

Notes are named by their path in the notes folder, with or without `.md`. Rules made in Margin also keep the note's id (`"id": "…"`), so they keep working after you rename or move that note.

## What Margin promises

Your triage program and Margin both write the triage note, so Margin is careful with it:

- **It never overwrites a newer version.** Every change is saved only if the file is still the version Margin read. Task actions, from the Triage view or with the task keys in the note itself, read the newest version and apply your action there (or tell you the task is gone). Only what you type in the note is saved as a whole: if your program has written in between, it is not saved over it, and a message offers **Use mine**.
- **It changes as little as possible.** Completing, dropping and dates change only that task's line, and only its box and Margin's own tokens. Moving takes out only the task's lines. Headings, group labels, blank lines, other tasks and your program's own text are never touched; nothing is reordered or reformatted. (Margin does keep the `updated` date at the top of the note current, as for any note it saves.)
- **It writes whole files.** A note is written to a hidden temporary file and renamed over the old one, so nothing ever reads half a note.
- **It never loses a task when moving.** The other note is saved first; the triage note only afterwards. If something fails in between, you find the task in both places.
- **Suggestions stay suggestions.** Tasks in the triage note (and in the triage archive, when set) are left out of Today, Anytime, the counts, tasks blocks, reminders and `margin-tasks` until you move them into a note of your own. Ticking there never moves anything, and archiving leaves those notes alone.

## Keeping old runs in an archive note

If your program moves old runs out of the triage note (to keep it short), have it move them into one archive note and set that note as **Triage archive** (see [Setting it up](#setting-it-up)). The archive uses the same layout as the triage note, so your own scripts can read both the same way.

- **Margin does not show the archive in the Triage view.** Open it as a note to read it. What you tick there changes only that line's box, as in the triage note.
- **Its tasks are not yours:** they stay out of every list, the Logbook and `margin-tasks`, so archived suggestions never come back as tasks.
- **The Weekly review** counts a task completed in Triage once, whether its run is still in the triage note or already in the archive.
- **Write it whole,** like the triage note: to a temporary file in the same folder, then renamed over it.
- **A script that sums up what you did** should read both notes for what was completed in Triage (`- [x]` with `@done(date)`), and your other notes for the rest, including tasks moved out of Triage (they keep their links, and with **Note where moved tasks came from** on, a `_from triage, date_` line).

## For the program that writes the note

If you change your triage program, this is what Margin reads and does. Anything else in the note is kept as it is and ignored.

```markdown
## Triage Mon 5 Jan, 11:00

**Summary**
- A line of summary.

### Category One
**Quick replies**
- [ ] Person A: short reply needed - [chat](https://…) #category-one #quick P3
**Actions**
- [ ] Do the thing about X - [mail](https://…) #category-one P1
  - One line of context.
  - _carried from Mon 5 Jan, 06:00_
**FYI**
- Informational line - [mail](https://…)
```

- **A run** starts at a line beginning `## Triage`; the rest of the line is its label. Write the newest run first. Any other `## ` heading ends a run.
- **The summary** is a line that is exactly `**Summary**`, before the first category, followed by `- ` lines.
- **A category** is a `### ` heading. **A group** is a line that is all bold: names starting "Quick" are quick replies, "Action" actions, "FYI" information lines; any other name is shown as it is.
- **A task** is `- [ ] `, `- [x] ` or `- [-] ` at the start of the line, with any lines indented under it as its details. A detail line `_carried from <label>_` shows as the "carried" marker.
- **On a task line**, Margin reads markdown links (`[label](address)`, the first one being the task's identity together with its title), `#tags`, a priority `P1` to `P4`, and its own dates (`>date`, `@due(date)`, `@done(date)`, `@cancelled(date)`). Keep the title before the links.
- **What Margin writes:** `[x]` with `@done(date)`, `[-]` with `@cancelled(date)`, `>date` and `@due(date)` on task lines; it removes moved tasks' lines; it updates `updated` in the front matter. When your program writes the next run, it should keep, or carry over, open tasks as it sees fit; tasks already marked done or dropped can be left out.
- **To skip what the user has taken on,** look for each item's link in open tasks (`- [ ]`) in the user's other notes.
- **Write the file whole**, to a temporary file in the same folder and then rename it over the note, as Margin does. Margin notices the change within a few seconds.

## Keys

In the Triage view:

| Key | Does |
| --- | --- |
| ↑ ↓ or J K | Move between tasks |
| Home, End | First, last task |
| ↵ | Show or hide the task's details |
| Space or X | Complete, or reopen |
| C | Drop, or reopen a dropped task |
| S | When: plan a day, or Someday |
| D | Due date |
| M | Move to the note its rules name, or pick one |
| ⇧M | Move to a note you pick (⌥↵ there also adds a rule) |
| A | Move every open task of its category |
| F | It is important: move it as M does, tagged as a focus task (see Focus in the user guide) |
| O | Open its first link |
| N | Show it in the triage note, on the right; the note then follows ↑ ↓ |
| / or ⌘F | Narrow down; Esc or ↓ goes back to the list |

The same actions are on the buttons that appear when you point at a task, and in its right-click menu. The keys are also listed under "Triage" in the keyboard shortcuts window (`?`). In the note itself, the task keys are in [Working in the note itself](#working-in-the-note-itself).

## Settings

All in Settings → Triage, and kept in `.margin/config.json` in your notes folder under `"triage"`.

| Setting | In the file | What it does | Unless set |
| --- | --- | --- | --- |
| Triage note | `note` | The note your program writes, as a path | No triage |
| Triage archive | `archive` | The note your program moves old runs into, as a path; treated like the triage note | None |
| Where tasks go | `rules` | Category, tag or title words → a note; first match wins | No rules |
| Workstream notebook | `workstreamNotebook` | A task goes to the note there named like its category | Off |
| Default note | `default` | Where tasks go when nothing else decides | M asks |
| Heading for moved tasks | `heading` | The heading they go under, made if missing | Open Threads |
| Put moved tasks at | `position` | `top` of that section, or its bottom | The bottom |
| Take off when moving | `strip` | Words or tags removed from the task line | Nothing |
| Note where moved tasks came from | `addLine` | Adds "_from triage, date_" under each | Off |

The view's own choices (done and dropped shown, older runs, folds, filters) are kept on each computer, not in the notes folder.

## When something looks wrong

| What you see | What it means, and what to do |
| --- | --- |
| "No triage note set" | Set it in Settings → Triage. |
| "No triage note yet" | There is no note at that path. Check the path, or wait for your program's next run. |
| "Nothing to triage" | The note has no `## Triage` runs Margin recognises. Open the note to look; compare it with [the layout above](#for-the-program-that-writes-the-note). |
| Tasks under "Uncategorised" | They are in a run but above any `### ` category heading. |
| "That task is no longer in the triage note" | Your program rewrote the note between your looking and your key press, without that task. Nothing was changed. |
| "… was changed outside Margin, so your last change was not saved" | You were typing in the triage note (or any note) while it changed on disk. (Task keys never cause this: they always work on the newest version.) The note now shows the newer version; **Use mine** puts yours back over it, or close the message to keep the newer one. |
| "The notes have changed since the move, so it was not undone" | Undo only works while every note involved is as the move left it. The task is in the note it went to; move it back by hand if needed. |
| M asks every time | No rule, workstream note or default note matches the task. Add a rule, or use ⌥↵ next time. |
| A rule in red in Settings | Its note is missing (renamed or deleted, and the rule has no id for it). Point it at the note again. |
| The triage tasks show in Today or Anytime | The triage note setting does not match the note's path. Check it in Settings → Triage. |

If the note itself seems odd, `check_note.py` (Help → Command-Line Tool…, or attached to each release) reports on a note file using only counts and line numbers, so you can share its output without sharing the note (use your own notes folder and triage note path):

```bash
python3 check_note.py ~/Documents/Vault/Inbox/Triage.md --vault ~/Documents/Vault
```
