# Margin theory of operations

This is the routine Margin is built around: what to do each morning, in each meeting, at the end of each day, each week and each month. Follow it as written for two weeks, then change what does not fit. For what each feature does, see the [user guide](user-guide.md).

Shortcuts are for the desktop app. Every one can be changed in Settings → Shortcuts.

## Contents

- [How it fits together](#how-it-fits-together)
- [Every morning](#every-morning-five-minutes)
- [During the day](#during-the-day)
- [Every meeting](#every-meeting)
- [Every 1:1](#every-11)
- [End of the day](#end-of-the-day-two-minutes)
- [Every week](#every-week-fifteen-minutes)
- [Every month](#every-month-twenty-minutes)
- [Where things go](#where-things-go)
- [Keys you need](#keys-you-need)

## How it fits together

Four ideas carry the whole routine.

1. **The daily note is the front door.** Everything that happens today starts there or is linked from there: your Top 3, a running log, and a link to each meeting.
2. **A task lives where it came from.** An action from a meeting stays in that meeting's note. You never copy tasks into a list; the Tasks view and today's note gather them for you.
3. **A task has two dates, and they mean different things.** The **planned day** (`>date`) is when you intend to start; from that day the task sits in Today until you tick it. The **due date** (`@due(date)`) is a real deadline; only a missed due date is overdue.
4. **Link, don't file.** Write `[[Project]]` or `[[Person]]` in whatever you are writing. Each note's backlinks then show everything that mentions it.

## Every morning (five minutes)

1. **Open the journal: ⌘J.** Today is at the top. If today's note did not exist, Margin has just created it and moved yesterday's unticked Top 3 into it.
2. **Read the "Tasks for this day" panel** at the top of today. It lists, from every note:
   - tasks due or planned for today
   - tasks from earlier days that are still open
   - anything overdue
3. **Deal with each overdue task.** Do one of three things: tick it (⌘↵ in its note, or Space in the Tasks view), give it a new due date, or decide it is not happening and delete the line. Do not leave it overdue.
4. **Look at tomorrow onwards: ⌘⇧T, then 2** for Upcoming. If anything there needs to start today, highlight it and press **T**.
5. **Set the Top 3.** Back in today's note, the Top 3 should hold at most three things that would make today a success. Carried-over items count. If there are more than three, move the extras to a later day: put the cursor on the line and press ⌘⇧S, then pick a day.
6. **Scroll down one day** in the journal and glance at yesterday's Log, in case something there needs a follow-up today.

## During the day

- **Something comes to mind:** ⌘⇧C (or ⌃⌥Space from any other app), type it, press Enter. It lands in today's Log with the time. Do not stop to file it.
- **It is something you must do:** write it as a task. In quick capture, type `- [ ] ` first; in a note, press ⌘⇧9 or type `/task`.
  - Give it a planned day only if it cannot start now: ⌘⇧S.
  - Give it a due date only if there is a real deadline: ⌘⇧D.
  - Give it a priority only if it matters more than its neighbours: ⌘⇧P.
- **You finish something:** tick it where you see it: ⌘↵ on the line, or its checkbox in the panel.
- **You decide to do something today that was not planned:** cursor on the task, ⌘⌥T.
- **You need to find something:** ⌘K and type. A name, a `#tag`, or a date such as "last friday" all work.
- **Something to keep for a few days only** (a number, a draft, a command): ⌘⌥N for a scratch note. It removes itself after a week.

## Every meeting

1. **As it starts: ⌘⇧M,** type the meeting's name, press Enter. The note is created, filed under Meetings by month, and linked from today's Log with the time.
2. **Fill in "Who".** Write people as links: `[[Priya Sharma]]`.
3. **Link the project** once, anywhere in the note: `[[Atlas]]`. This is what makes the meeting findable from the project later.
4. **During the meeting, write only under Notes,** as short bullets. Do not tidy as you go.
5. **When an action is agreed, write it at once under Action items** as a task that starts with the owner: `- [ ] Priya: send the revised numbers`.
6. **In the last two minutes:**
   - Fill in **Decisions**: one line for each thing that was settled.
   - On each action that is yours, set a due date (⌘⇧D) if one was agreed. If it is yours and has to start on a particular day, set that with ⌘⇧S.
7. **Afterwards, do nothing.** Your actions appear in Today or Upcoming on their own. The meeting is reachable from today's note, from the project's backlinks and from each person's backlinks.

## Every 1:1

Keep one note per person. Create it once with ⌘K → "New person note", and pin the people you meet every week.

1. **Between meetings,** whenever something comes up for that person: ⌘⇧C, press Tab until the destination is "A note…", choose their note and the "Next time" heading. Margin remembers the choice, so next time it is Tab and Enter.
2. **As the 1:1 starts,** open their note and run ⌘K → "Add today's meeting entry". A dated heading appears at the top of Meetings.
3. **Work down "Next time".** Delete each line as you cover it, and write what was said under today's entry.
4. **Write actions as tasks** under today's entry, with a due date if there is one.
5. **Before you close the note,** add anything that must wait to "Next time".

## End of the day (two minutes)

1. **Open today's note: ⌘D.**
2. **Tick what you finished** in the Top 3 and in the panel.
3. **Leave unfinished Top 3 items alone.** They move to tomorrow's note by themselves when it is created.
4. **Read down today's Log once.** For each line, ask whether it is finished, a task, or worth keeping:
   - a task: turn the line into one (⌘⇧9)
   - worth keeping: move it into the note for that project or person, or give it its own note and link it
   - finished: leave it
5. **Stop.** There is nothing to file and nothing to close.

## Every week (fifteen minutes)

Pick a fixed time: Friday afternoon or Monday morning.

1. **Clear what is overdue.** ⌘⇧T, then 6. For each task: do it, give it a new date, or delete it. To push a batch to one day, use **Move all…**.
2. **Plan the week.** Press 2 for Upcoming and read what is coming. Then press 3 for Anytime, which is everything you could start now. For each thing you intend to do this week, press S and give it a day. For each thing you are not going to do soon, press S and choose Someday.
3. **Catch undated strays.** Press 9 for No date. Anything here has no plan: give it a day, send it to Someday, or delete it.
4. **Skim the week's notes.** ⌘J and scroll back through the week. Anything lasting that is still sitting in a Log belongs in a project or person note; move it there.
5. **Check people.** Open the note of each person you meet weekly and make sure "Next time" is current.
6. **Empty the temporary places.**
   - **Scratch** in the sidebar: press Keep on anything worth keeping. The rest expires.
   - **Research:** anything marked Reading that you have finished, set to Done.
7. **Reset the pins.** Pin what next week needs; unpin what is finished.

## Every month (twenty minutes)

1. **Review Someday.** ⌘⇧T, then 4. For each item: give it a real day, leave it, or delete it. This list is only useful if it is short enough to read.
2. **Read the Logbook.** Press 5, group by date. Scan what you finished this month. It is the easiest source for a status update or a review.
3. **Prune projects.** In the Tasks view, group by Project. A note whose tasks are all done or all stale is a project that has ended: tick or delete the leftovers.
4. **Tidy tags.** Look at the Tags list in the sidebar. Two tags that mean the same thing should become one: open the notes under the rarer tag and retag them (⌘T).
5. **Tidy notebooks.** A notebook with one or two notes is rarely worth having. Move those notes up a level.
6. **Check your saved filters.** Remove the ones you no longer open.
7. **Tune the templates.** If you delete the same section from every meeting note or daily note, remove it from the template in the Templates notebook.
8. **Back up.** Your notes are a folder of files. Make sure that folder is included in your backup, or copy it somewhere safe now.
9. **Update Margin** if there is a newer version on the releases page.

## Where things go

| You have | Put it | How |
| --- | --- | --- |
| A passing thought | Today's Log | ⌘⇧C |
| Something to do | A task, in the note it belongs to | `- [ ] …`, or ⌘⇧9 |
| A thing to raise with a person | Their note, under Next time | ⌘⇧C → A note… |
| What was said in a meeting | A meeting note | ⌘⇧M |
| Something needed for a few days | A scratch note | ⌘⌥N |
| An article or source | A research note | New → Research note |
| Lasting knowledge about a project | The project's own note | ⌘N, then link it |

Rules of thumb:

- **If you would look for it by date,** it belongs in the daily note.
- **If you would look for it by name,** it deserves its own note.
- **If it needs doing,** it is a task, wherever it is written.
- **When unsure, capture it.** Sorting it out is what the end-of-day read-through is for.

## Keys you need

| Do this | Key |
| --- | --- |
| Journal (all days on one page) | ⌘J |
| Today's note | ⌘D |
| Tasks | ⌘⇧T |
| Search, switch, run a command | ⌘K |
| Quick capture | ⌘⇧C, or ⌃⌥Space from another app |
| New meeting note | ⌘⇧M |
| New note | ⌘N |
| New scratch note | ⌘⌥N |
| Make the line a task | ⌘⇧9 |
| Tick or untick a task | ⌘↵ |
| Task: move to today | ⌘⌥T |
| Task: when | ⌘⇧S |
| Task: due date | ⌘⇧D |
| Task: priority | ⌘⇧P |
| Add a tag | ⌘T |
| Link to a note | `[[` |

In the Tasks view: 1 Today, 2 Upcoming, 3 Anytime, 4 Someday, 5 Logbook, 6 Overdue, 9 No date, 0 All open. On a highlighted task: Space ticks, T is today, S is when, D is due, P is priority, ↵ opens it.
