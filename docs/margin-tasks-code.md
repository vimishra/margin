# Reading margin_tasks.py

A guided tour of `tools/margin_tasks.py`, the program behind the `margin-tasks` command. Read it with the file open beside it: each section below covers one part of the file, in the order the file has them, and quotes the lines it talks about. The Python ideas the file uses are explained where they first appear, so you can learn the language and the program together.

If you only want to *use* the command, the user guide's [Tasks from the command line](user-guide.md#tasks-from-the-command-line) is the place; this document is about how it works inside.

## Contents

1. [What the program does, in one paragraph](#1-what-the-program-does-in-one-paragraph)
2. [A sample notes folder](#2-a-sample-notes-folder)
3. [The shape of the file](#3-the-shape-of-the-file)
4. [The top: docstring, imports, version](#4-the-top-docstring-imports-version)
5. [The patterns: what a task line looks like](#5-the-patterns-what-a-task-line-looks-like)
6. [The lists, by name](#6-the-lists-by-name)
7. [The Task class: one checkbox line](#7-the-task-class-one-checkbox-line)
8. [The Note class: one file](#8-the-note-class-one-file)
9. [Front matter, without a YAML library](#9-front-matter-without-a-yaml-library)
10. [The rules for each list](#10-the-rules-for-each-list)
11. [Urgency: the default order](#11-urgency-the-default-order)
12. [Narrowing down: the query box and tags](#12-narrowing-down-the-query-box-and-tags)
13. [Finding and reading the notes folder](#13-finding-and-reading-the-notes-folder)
14. [Days typed on the command line](#14-days-typed-on-the-command-line)
15. [Output: JSON, CSV, paths, templates, the table](#15-output-json-csv-paths-templates-the-table)
16. [main(): the whole run, step by step](#16-main-the-whole-run-step-by-step)
17. [The last lines: running as a program](#17-the-last-lines-running-as-a-program)
18. [How it is kept in step with the app](#18-how-it-is-kept-in-step-with-the-app)
19. [Following one task all the way through](#19-following-one-task-all-the-way-through)
20. [Python ideas used, in one place](#20-python-ideas-used-in-one-place)
21. [Things to try](#21-things-to-try)

---

## 1. What the program does, in one paragraph

It finds your notes folder, reads every `.md` file in it, picks out the checkbox lines (`- [ ] …`), and for each one works out what is written on it: priority, planned day, due date, tags and so on. Then it keeps the tasks that belong to the list you asked for (Today, Upcoming, the Logbook…), narrows them further by any options you gave, sorts them, and prints them in the format you chose. It only ever **reads** files. Nothing in it opens a file for writing, so it cannot change a note, whatever options you pass.

The rules it uses to decide what goes in which list are the same as the app's (`src/lib/tasks.ts`), written a second time in Python. Section 18 explains how the two are kept identical.

## 2. A sample notes folder

The examples in this document use this small folder. Every output shown was produced by running the program on it with `--today 2026-11-23` (a Monday), so you can reproduce them.

```
tourvault/
├── .margin/config.json          {"triage": {"note": "Inbox/Triage"}}
├── Inbox/
│   ├── Inbox.md                 the Inbox note
│   └── Triage.md                the triage note (left out)
├── Daily/2026-11-23.md          a daily note
├── Templates/Meeting.md         a template (left out)
└── Work/Atlas.md                a project note
```

`Work/Atlas.md`:

````markdown
---
id: atlas01
title: Atlas launch
tags: [project, atlas]
---
# Atlas launch

## Build
- [ ] P1 Fix the login bug @due(2026-11-20) #atlas/backend
- [ ] Draft the hiring plan #focus
- [x] Pick the vendor @done(2026-11-18)
- [-] Old venue booking @cancelled(2026-11-17)

## Later
- [ ] Write the retrospective >someday
- [ ] Book the launch room >2026-11-28 @remind(2026-11-27 9:30) ^k3x9qa

```
- [ ] not a task: inside a code block
```
````

`Inbox/Inbox.md`:

```markdown
- [ ] Call the plumber
- [ ] Renew passport @due(2026-12-01)
```

`Daily/2026-11-23.md`:

```markdown
---
type: daily
---
## Top 3
- [ ] Send the weekly report >2026-11-23 @repeat(weekly) P2
```

`Templates/Meeting.md` holds `- [ ] Template task`, and `Inbox/Triage.md` holds `- [ ] Suggested by a program`. Neither appears in any list, for reasons sections 13 and 16 explain.

## 3. The shape of the file

The file is about 650 lines, in seven parts, each starting with a comment line of dashes:

| Lines (roughly) | Part | What it holds |
| --- | --- | --- |
| 1–24 | The top | What the program is, the modules it uses, its version |
| 26–203 | Parsing | The patterns for a task line, the `Task` and `Note` classes, front matter |
| 205–306 | The lists | Which task goes in which list; the urgency order; the query box |
| 308–374 | Reading the notes folder | Where the folder is; walking it; what to leave out |
| 377–409 | Dates on the command line | `friday`, `+3`, `tomorrow`; the first day of the week |
| 412–494 | Output | The JSON record; the coloured table |
| 497–652 | `main()` | The options, and the run from start to finish |

A good reading order for the first time: section 2 here (the sample), then `main()` (part 7) to see the whole run, then back to the top for the details. This document follows the file's order, but each section stands on its own.

## 4. The top: docstring, imports, version

```python
#!/usr/bin/env python3
"""margin-tasks: list the tasks in a Margin notes folder from the command line.
...
"""
```

- **`#!/usr/bin/env python3`** (the "shebang") tells macOS and Linux which program runs this file when you run the file itself. That is why `margin-tasks today` works without typing `python3` first: `~/.local/bin/margin-tasks` is a link to this file, and the system reads this line.
- **The text in triple quotes** is the *module docstring*: a description of the whole file. Python keeps it (as `margin_tasks.__doc__`); tools that show help read it.

```python
from __future__ import annotations
```

This makes Python treat type hints (like `-> List[Task]`) as plain text instead of working them out when the file loads. It lets a class mention a class defined further down (`Task` refers to `"Note"`), and keeps the file working on Python 3.8, the oldest version it supports.

```python
import argparse, csv, datetime as dt, hashlib, json, os, re, sys
from typing import Dict, Iterable, List, Optional, Tuple
```

Everything comes from Python's *standard library*, the modules every Python install has. That is a deliberate choice: there is nothing to install, so the tool works on any Mac or Linux machine with Python 3.8 or newer. What each is for:

| Module | Used for |
| --- | --- |
| `argparse` | Reading the command-line options and printing `--help` |
| `csv` | The `--csv` output, with correct quoting |
| `datetime` (as `dt`) | Adding days to a date, finding the weekday |
| `hashlib` | An id for a note that does not have one written in it |
| `json` | Reading the app's settings files; the `--json` output |
| `os` | Paths, walking folders, environment variables |
| `re` | Regular expressions: the patterns that recognise a task and what is written on it |
| `sys` | Standard output and error, the platform, exiting |
| `typing` | Type hints only: they document what a function takes and gives back; Python does not check them when it runs |

`VERSION = "1.2"` is what `margin-tasks --version` prints. It is the tool's own version, separate from the app's.

## 5. The patterns: what a task line looks like

The heart of the parsing is a set of *regular expressions*: patterns that describe text. `re.compile(...)` turns a pattern into an object you can use many times, which is faster than re-reading the pattern on every line.

The comment above them matters:

```python
# JavaScript's \w and \d are ASCII-only, so the classes are spelled out rather than using Python's wider ones.
```

In Python, `\d` matches any Unicode digit (Arabic-Indic digits too) and `\w` any Unicode letter. In JavaScript they match only `0-9` and `A-Za-z0-9_`. Because this file must agree exactly with the app's JavaScript, it writes `[0-9]` and `[A-Za-z0-9_]` instead. A small thing that would otherwise make the two disagree on unusual text.

### The task line itself

```python
TASK_LINE = re.compile(r"^(\s*(?:>\s*)*(?:[-*+]|[0-9]+[.)])\s+\[)([ xX-])(\]\s+)(.*)$")
```

The `r"..."` is a *raw string*: backslashes are kept as typed, which regular expressions need. Read the pattern left to right:

| Piece | Means | In `  - [x] Pick the vendor` |
| --- | --- | --- |
| `^` | start of the line | |
| `\s*` | any indentation | `  ` |
| `(?:>\s*)*` | any number of `>` quote markers, so tasks inside a quote count | (none) |
| `(?:[-*+]\|[0-9]+[.)])` | a bullet `-` `*` `+`, or a number like `1.` or `2)` | `-` |
| `\s+\[` | space, then `[` | ` [` |
| `([ xX-])` | **group 2**: the box's content: space (open), `x` or `X` (ticked), `-` (cancelled) | `x` |
| `(\]\s+)` | `]` and at least one space | `] ` |
| `(.*)$` | **group 4**: everything after, to the end of the line | `Pick the vendor` |

Brackets `( )` make a *group* whose text can be read back with `m.group(n)`; `(?: )` groups without keeping the text. Group 1 is everything up to `[`, group 3 the `] `. The program uses groups 2 and 4.

So these are all tasks: `- [ ] a`, `* [x] b`, `1. [ ] c`, `> - [ ] d` (in a quote), `    - [-] e` (indented, a subtask). These are not: `-[ ] a` (no space after the bullet), `- [ ]` with nothing after it (section 8 shows that check), `[ ] a` (no bullet).

### What can be written on a task

```python
DATE = r"[0-9]{4}-[0-9]{2}-[0-9]{2}"
PRIORITY = re.compile(r"(^|\s)[Pp]([123])(?=\s|$)")
SCHEDULED = re.compile(r"(^|\s)>(" + DATE + r"|[Ss]omeday)(?=\s|$)")
DUE = re.compile(r"(^|\s)@due\((" + DATE + r")\)")
DONE = re.compile(r"(^|\s)@done\((" + DATE + r")\)")
CANCELLED = re.compile(r"(^|\s)@cancelled\((" + DATE + r")\)")
REPEAT = re.compile(r"(^|\s)@repeat\(([^)\n]+)\)")
REMIND = re.compile(r"(^|\s)@remind\((" + DATE + r")(?:[ T]([0-9]{1,2}:[0-9]{2}))?\)")
TAG = re.compile(r"(?:^|[\s(])#([A-Za-z][A-Za-z0-9_/-]*)")
```

`DATE` is a plain string, glued into the others with `+`, so the shape of a date is written once. `{4}` means "exactly four of the thing before".

Every pattern starts with `(^|\s)`: the start of the text, or a space. That is what stops `P1` being found inside `MP3` or `>2026-…` inside `a>b`. Several end with `(?=\s|$)`, a *lookahead*: "followed by a space or the end", checked without taking those characters. So `P1` counts, `P12` does not.

| Pattern | Matches | Group 2 (or 3) gives |
| --- | --- | --- |
| `PRIORITY` | `P1`, `p2`, `P3` | the digit |
| `SCHEDULED` | `>2026-11-28`, `>someday`, `>Someday` | the date, or "someday" |
| `DUE` | `@due(2026-12-01)` | the date |
| `DONE`, `CANCELLED` | `@done(…)`, `@cancelled(…)` | the date |
| `REPEAT` | `@repeat(weekly)`, `@repeat(every 2 weeks)` | the rule: anything up to `)` |
| `REMIND` | `@remind(2026-11-27 9:30)`, `@remind(2026-11-27)` | the date (2) and the time if any (3) |
| `TAG` | `#focus`, `#atlas/backend`, `(#urgent` | the tag without `#`; it must start with a letter, so `#1` is not a tag |

`(?:[ T](…))?` in `REMIND` is an optional part: the time may follow a space or a `T`, or be missing.

### Note structure

```python
FENCE = re.compile(r"^\s*(```|~~~)")
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*$")
FRONTMATTER = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)")
NOTE_TYPES = ("note", "daily", "article", "scratch")
```

- `FENCE` finds the lines that open and close a code block, so checkboxes shown as code are not taken for tasks.
- `HEADING` finds `#` to `######` headings; group 1 is the heading's text. `(.+?)` is *non-greedy*: as little as possible, so trailing `#` marks and spaces are left to the rest of the pattern.
- `FRONTMATTER` finds the block between two `---` lines at the very top of a file. `[\s\S]*?` means "any characters, including line breaks, as few as possible"; `\r?\n` accepts Windows line endings too.
- `NOTE_TYPES` is a *tuple* (an unchangeable list) of the note types Margin knows; anything else is treated as an ordinary note.

## 6. The lists, by name

```python
LISTS = {
    "inbox": "Captured and not yet decided on: in the Inbox note, with no planned day",
    "today": "Planned for today or earlier, or due today or earlier",
    ...
}
ALIASES = {"done": "logbook", "nodate": "undated", "no-date": "undated", "this-week": "week", "next-30-days": "month"}
```

A *dictionary* (`{key: value}`) of every list the command knows, with a one-line description. It does two jobs: `main()` checks the list you typed is one of its keys, and the `--help` text prints the descriptions from it. Because both come from this one place, the help can never list a name the program does not accept.

`ALIASES` maps other names you might type to the real one, so `margin-tasks done` means the Logbook.

## 7. The Task class: one checkbox line

```python
class Task:
    __slots__ = ("note", "index", "done", "cancelled", "raw", "text", "priority", "tags", "planned", "someday", "due", "done_on", "repeat", "remind", "heading")
```

A *class* describes a kind of object; each task found becomes one `Task` object. `__slots__` lists the only attributes a task may have. It saves memory when there are thousands of tasks, and it catches typos: `t.prority = 1` raises an error instead of silently making a new attribute.

### `__init__`: working out what a line says

`__init__` runs when a task is created: `Task(note, index, done, raw, heading, cancelled)`. `self` is the new task.

```python
        self.note = note
        self.index = index  # line within the note's content, from 0, as the app counts it
        self.done = done  # finished with: ticked "[x]" or cancelled "[-]"
        self.cancelled = cancelled
        self.raw = raw
        self.heading = heading
```

It keeps what it was given. `raw` is the text after the box, exactly as written; `heading` is the nearest heading above. Note that **`done` is true for cancelled tasks too**: every list treats a cancelled task as finished with, as the app does. `cancelled` tells the two apart.

```python
        written = PRIORITY.search(raw)
        self.priority = 4 - int(written.group(2)) if written else 0  # 3 is P1, 0 is none
```

`search` looks for the pattern anywhere in the text and returns a *match object*, or `None`. The `x if condition else y` form is Python's one-line if. The number is turned around (`P1` → 3, `P2` → 2, `P3` → 1, none → 0) so that **a bigger number means more urgent**, which makes sorting simpler later.

```python
        planned = SCHEDULED.search(raw)
        value = planned.group(2) if planned else None
        self.someday = bool(value) and value.lower() == "someday"
        self.planned = None if self.someday else value
```

`>someday` and `>2026-11-28` use the same marker, so one search finds either, and the value is then sorted into `someday` (true or false) or `planned` (a date, or `None`). `None` is Python's "nothing here".

```python
        due = DUE.search(raw)
        self.due = due.group(2) if due else None
        done_on = DONE.search(raw) or CANCELLED.search(raw)
        self.done_on = done_on.group(2) if done_on else None
```

`a or b` gives `a` if it is something, otherwise `b`: the day a task was finished is its `@done` day, or failing that its `@cancelled` day.

Dates are kept as **text** (`"2026-11-20"`), never converted to date objects here. Because they are always written year-month-day with leading zeros, comparing the text gives the same answer as comparing the dates: `"2026-11-20" < "2026-11-23"` is true. The whole program leans on this; it is quick and it matches the app.

```python
        repeat = REPEAT.search(raw)
        self.repeat = repeat.group(2).strip() or None if repeat else None
        remind = REMIND.search(raw)
        self.remind = "%s %s" % (remind.group(2), (remind.group(3) or "09:00").rjust(5, "0")) if remind else None
```

A reminder with no time means 09:00, as in the app, and `rjust(5, "0")` pads `9:30` to `09:30`. `"%s %s" % (a, b)` is an older way to fill a string with values (like `f"{a} {b}"`); it is used throughout because it works the same on every Python version this supports.

### The task's text, without the markers

```python
        # A block id at the end (" ^abc123", for [[Note#^abc123]] links) is not part of what the task says.
        text = re.sub(r"\s\^[A-Za-z0-9-]+\s*$", "", raw)
        for pattern in (PRIORITY, SCHEDULED, DUE, DONE, CANCELLED, REPEAT, REMIND):
            text = pattern.sub(lambda m: m.group(1), text, count=1)
        self.text = re.sub(r"\s{2,}", " ", text).strip()
```

To show a task as `Book the launch room` rather than `Book the launch room >2026-11-28 @remind(2026-11-27 9:30) ^k3x9qa`, it removes each marker:

1. The block id at the end (` ^k3x9qa`), which belongs to links, not to the task.
2. Each marker, **once** (`count=1`, as the app does), replaced by its group 1: the space or start that came before it. `lambda m: m.group(1)` is a tiny unnamed function that gets each match `m` and returns what to put in its place.
3. Runs of two or more spaces become one, and the ends are trimmed.

Tags are **not** removed: `Fix the login bug #atlas/backend` keeps its tag, as the app shows it.

```python
        seen: List[str] = []
        for m in TAG.finditer(self.text):
            if m.group(1) not in seen:
                seen.append(m.group(1))
        self.tags = seen
```

`finditer` gives every match in turn. The list keeps each tag once, in the order written. (A *set* would also drop repeats, but would lose the order.)

### Properties

```python
    @property
    def line(self) -> int:
        """Line number in the file, from 1, as an editor shows it."""
        return self.note.offset + self.index + 1
```

`@property` makes a method read like an attribute: `t.line`, not `t.line()`. It is worked out when asked for. `index` counts from 0 within the note's content (after the front matter), which is how the app counts; `line` adds the front matter's lines and 1, so it matches the line number an editor shows. In the sample, the login-bug task is index 3 of `Atlas.md`'s content, with 5 lines of front matter: line 9.

`priority_label` turns 3 back into `"P1"`, and `key` (`Work/Atlas.md:9`) names a task uniquely.

## 8. The Note class: one file

```python
class Note:
    __slots__ = ("relpath", "path", "id", "title", "folder", "type", "tags", "content", "offset")

    def __init__(self, root: str, relpath: str, raw: str):
        self.relpath = relpath
        self.path = os.path.join(root, *relpath.split("/"))
        data, content, offset = parse_file(raw)
```

`relpath` is the note's path inside the notes folder, always with `/` (`Work/Atlas.md`); `path` is the full path on this computer. `os.path.join(root, *parts)` uses the system's own separator; the `*` *unpacks* the list into separate arguments.

`parse_file` returns three values at once (a *tuple*), and `data, content, offset = …` takes them apart into three names.

```python
        self.id = str(data["id"]) if data.get("id") else "p" + hashlib.sha1(relpath.encode("utf-8")).hexdigest()[:10]
        base = relpath.rsplit("/", 1)[-1]
        self.title = str(data["title"]) if data.get("title") else base[:-3]
        self.folder = relpath.rsplit("/", 1)[0] if "/" in relpath else ""
        self.type = data.get("type") if data.get("type") in NOTE_TYPES else "note"
```

- **id:** the `id:` from the front matter, or else one made from the path, so the same note always gets the same id. `sha1(...).hexdigest()[:10]` is a fingerprint of the path, cut to 10 characters. The id is used only to keep the order of tasks steady (section 11).
- **title:** the `title:` from the front matter, or the file name without `.md` (`base[:-3]` cuts the last three characters). The daily note's title is therefore `2026-11-23`.
- **folder:** everything before the last `/`, or `""` for a note at the top. `rsplit("/", 1)` splits once, from the right.
- `data.get("type")` gives `None` instead of failing when there is no `type`.

```python
        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = [t for t in re.split(r"[,\s]+", tags) if t]
        self.tags = [str(t).lstrip("#") for t in tags]
```

The note's own tags (from its front matter, not its text) may be written as a list or as `tags: a, b`. `isinstance` checks which. `[t for t in … if t]` is a *list comprehension*: a list built in one line from another, here dropping empty pieces.

### `tasks()`: finding the tasks in a note

```python
    def tasks(self) -> List[Task]:
        out: List[Task] = []
        if "[" not in self.content:
            return out
```

A shortcut: a note with no `[` at all has no checkboxes, so it is skipped without looking at each line.

```python
        fence = False
        heading = ""
        for index, line in enumerate(self.content.split("\n")):
            if FENCE.match(line):
                fence = not fence
            if fence:
                continue
```

`enumerate` gives each line with its number. `fence` flips on at a line starting with ```` ``` ```` and off at the next one; while it is on, lines are skipped with `continue` (go on to the next line). That is why `- [ ] not a task: inside a code block` in the sample is not listed. (`match` only looks at the start of the text; `search` looks anywhere.)

```python
            h = HEADING.match(line)
            if h:
                heading = h.group(1)
            elif line.startswith("<!-- card"):
                heading = ""  # a new canvas card starts a new context
```

The latest heading is remembered, and each task records it: that is the `› Build` shown after a task. A canvas note's cards start with a hidden `<!-- card … -->` line; a new card means the previous card's heading no longer applies.

```python
            m = TASK_LINE.match(line)
            if not m or not m.group(4).strip():
                continue
            out.append(Task(self, index, m.group(2) != " ", m.group(4), heading, m.group(2) == "-"))
        return out
```

A line that is not a task, or a task with nothing written after the box, is skipped. Otherwise a `Task` is made: done if the box holds anything but a space, cancelled if it holds `-`.

## 9. Front matter, without a YAML library

Front matter is written in YAML. Python's standard library cannot read YAML, and the tool must not need anything installed, so it reads just the parts it needs itself.

```python
def parse_file(raw: str) -> Tuple[Dict[str, object], str, int]:
    """Split a note into its frontmatter values, its content, and how many lines the frontmatter took."""
    data: Dict[str, object] = {}
    content = raw
    offset = 0
    m = FRONTMATTER.match(raw)
    if m:
        parsed = parse_frontmatter(m.group(1))
        if parsed is not None:
            data = parsed
            content = raw[m.end():]
            offset = raw[: m.end()].count("\n")
    content = content.replace("\r\n", "\n")
    if content.endswith("\n"):
        content = content[:-1]
    return data, content, offset
```

- If the file starts with a `---` block that reads as front matter, the content is what follows it (`raw[m.end():]`, a *slice* from where the match ended), and `offset` is how many lines the block took (it counts the line breaks).
- Windows line endings become plain ones, and one final line break is dropped, so the lines are numbered exactly as the app numbers them.

```python
def parse_frontmatter(text: str) -> Optional[Dict[str, object]]:
    data: Dict[str, object] = {}
    key = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s+(.*)$", line)
        if item and key:
            ...
            data[key].append(unquote(item.group(1)))
            continue
        pair = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if not pair:
            if line[:1] in (" ", "\t"):
                continue  # part of a nested value this tool does not read
            return None  # not frontmatter after all
        key, value = pair.group(1), pair.group(2).strip()
        if value.startswith("[") and value.endswith("]"):
            data[key] = [unquote(v) for v in value[1:-1].split(",") if v.strip()]
        elif value:
            data[key] = unquote(value)
        else:
            data[key] = ""
    return data
```

It handles the three shapes Margin writes:

```yaml
title: Atlas launch          # key: value
tags: [project, atlas]       # key: [a, b]
tags:                        # key:, then "- item" lines below it
  - project
```

Blank lines and `#` comments are skipped. An indented line it does not understand belongs to a nested value it does not need, and is skipped. A line that is neither means the `---` block was not front matter at all (some notes start with a horizontal rule), so it returns `None` and `parse_file` treats the whole file as content. `Optional[Dict…]` in the hint says exactly that: a dictionary, or `None`.

`unquote` takes the quotes off `"Atlas"` or `'Atlas'`.

## 10. The rules for each list

This part decides which list a task belongs to. It mirrors the app's rules exactly; these few functions are the ones to read most carefully.

```python
def add_days(day: str, n: int) -> str:
    return (dt.date.fromisoformat(day) + dt.timedelta(days=n)).isoformat()
```

Text date → date object → add `n` days → text again. One of the few places dates become real dates.

```python
def week_range(day: str, week_start: int) -> Tuple[str, str]:
    js_weekday = (dt.date.fromisoformat(day).weekday() + 1) % 7  # Sunday is 0, as in JavaScript
    start = add_days(day, -((js_weekday - week_start + 7) % 7))
    return start, add_days(start, 6)
```

Python numbers weekdays Monday = 0; JavaScript numbers them Sunday = 0. The first line converts to JavaScript's numbering so the arithmetic is the app's. Then it steps back to the first day of the week (`%` is the remainder, which keeps the step between 0 and 6) and returns that day and six days later.

```python
def is_overdue(t: Task, now: str) -> bool:
    return not t.done and bool(t.due) and t.due < now

def is_today(t: Task, now: str) -> bool:
    return not t.done and ((bool(t.planned) and t.planned <= now) or (bool(t.due) and t.due <= now))
```

The two central rules of Margin's tasks, in two lines:

- **Overdue** is only ever about the due date: open, has one, and it has passed. A planned day that has passed is never overdue.
- **Today** is: open, and planned for today or earlier, or due today or earlier. So a task planned last week is still in Today, without being overdue.

`now` is today's date as text, passed in rather than read from the clock inside, so tests and `--today` can pretend it is any day.

```python
def notebook_key(folder: str) -> str:
    return "/".join(s.strip() for s in folder.split("/") if s.strip()).lower()

INBOX_NOTE_TITLE = "Inbox"

def is_inbox_note(note: "Note", inbox: str) -> bool:
    box = notebook_key(inbox)
    return bool(box) and notebook_key(note.folder) == box and note.title.strip().lower() == INBOX_NOTE_TITLE.lower()

def in_inbox(t: Task, inbox: str) -> bool:
    return not t.done and is_inbox_note(t.note, inbox) and not t.planned and not t.someday
```

The Inbox is one note: the note titled **Inbox** in the Inbox notebook (`--inbox` names the notebook; `Inbox` by default). Names are compared ignoring capitals and stray spaces or slashes, as macOS compares folder names. A task is *in the Inbox* while it is open, in that note, and has no planned day and is not Someday. A due date alone does not take it out: in the sample, `Renew passport @due(2026-12-01)` is still in the Inbox.

`(s.strip() for s in … if s.strip())` is a *generator expression*: like a list comprehension in round brackets, giving its items one at a time to `join` without building a list.

```python
def in_list(t: Task, name: str, week_start: int, now: str, inbox: str = "Inbox") -> bool:
    if name == "all":
        return True
    if name == "logbook":
        return t.done
    if t.done:
        return False
    if name == "today":
        return is_today(t, now)
    ...
    return True  # open
```

One function answers "does this task belong in this list?". The order of the checks does work:

1. `all` takes everything; `logbook` takes the finished ones (ticked and cancelled).
2. **Every other list is about open tasks**, so a finished task is turned away once, here, instead of in each rule.
3. Then one rule per list:

| List | Rule (for an open task) | In the sample |
| --- | --- | --- |
| `today` | `is_today` | the login bug (due 20 Nov, passed), the weekly report (planned today) |
| `inbox` | `in_inbox` | Call the plumber, Renew passport |
| `anytime` | not Someday, not planned for after today, not in the Inbox | login bug, weekly report, hiring plan |
| `someday` | marked Someday | Write the retrospective |
| `week` | due or planned within this week | weekly report, Book the launch room (28 Nov) |
| `month` | due or planned from today to 30 days on | |
| `overdue` | `is_overdue` | login bug |
| `upcoming` | planned for after today | Book the launch room |
| `undated` | no due date, no planned day, not Someday, not in the Inbox | Draft the hiring plan |
| `open` | (falls through to the end) every open task | |

Notice that **Anytime includes Today's tasks**: it is "everything you could do now", which covers today's too. And Inbox tasks are kept out of Anytime and No date until you decide on them. That is the Things 3 model the app follows.

`any(d and start <= d <= end for d in (t.due, t.planned))` (in `week`) asks "is either date inside the range?". Python lets you chain comparisons: `start <= d <= end`.

## 11. Urgency: the default order

```python
def next_date(t: Task, now: str) -> str:
    """The day a task next needs attention: a missed deadline first, otherwise the nearest of its dates."""
    if t.due and t.due < now:
        return t.due
    planned = now if (t.planned and t.planned < now) else t.planned
    dates = sorted(d for d in (planned, t.due) if d)
    return dates[0] if dates else ""

def urgency_key(t: Task, now: str):
    return (next_date(t, now) or "9999", -t.priority, t.note.id, t.index)
```

Lists are sorted by urgency unless you ask otherwise. `next_date` is the day a task next needs you:

- a missed due date (overdue tasks come first, the oldest deadline first);
- otherwise the earlier of the planned day and the due date, where a planned day that has passed counts as **today** (it is waiting for you now, not in the past).

`urgency_key` returns a *tuple*, and Python sorts tuples item by item, like words in a dictionary: by the date first (tasks with no date get `"9999"`, which sorts after every real date), then by priority (`-t.priority`, so P1 before P2), then by note and position in the note. The last two only break ties, so the order is the same on every run.

## 12. Narrowing down: the query box and tags

```python
def matches_query(t: Task, query: str) -> bool:
    hay = ("%s %s" % (t.text, t.note.title)).lower()
    for word in query.lower().split():
        if re.fullmatch(r"p[123]", word):
            if t.priority < 4 - int(word[1]):
                return False
        elif word.startswith("#") and len(word) > 1:
            if not has_tag(t.tags, word[1:]):
                return False
        elif word not in hay:
            return False
    return True
```

This is `--query`, the same as the narrow-down box in the app's Tasks view. Every word must match (that is why it returns `False` at the first that does not):

- `p1`, `p2`, `p3`: that priority **or higher**. In the sample, `-q p2` lists both the P2 report and the P1 bug.
- `#tag`: the task has the tag.
- anything else: the word appears in the task's text or its note's title (the "haystack"), ignoring capitals.

```python
def has_tag(tags: Iterable[str], wanted: str) -> bool:
    wanted = wanted.lstrip("#").lower()
    return any(x.lower() == wanted or x.lower().startswith(wanted + "/") for x in tags)
```

A tag matches itself and the tags nested under it: asking for `atlas` finds `#atlas/backend`. Asking for `atlas/backend` does not find a plain `#atlas`.

## 13. Finding and reading the notes folder

### Which folder

```python
def find_vault(explicit: Optional[str]) -> str:
    if explicit:
        return os.path.abspath(os.path.expanduser(explicit))
    if os.environ.get("MARGIN_VAULT"):
        return ...
    ...  # Margin's own config.json: its "vaultDir"
    for guess in (os.path.join(home, "Documents", "Margin"),):
        ...
    raise SystemExit("margin-tasks: could not find your notes folder. Pass --vault PATH, or set MARGIN_VAULT.")
```

It tries, in order:

1. `--vault PATH`;
2. the `MARGIN_VAULT` environment variable;
3. the folder the app uses: `vaultDir` in Margin's `config.json` (in `~/Library/Application Support/Margin/` on a Mac, `%APPDATA%` on Windows, `~/.config` on Linux);
4. `~/Documents/Margin`, if it exists.

`expanduser` turns `~` into your home folder; `abspath` makes a relative path full. The `try: … except (OSError, ValueError): pass` around reading the config means "if the file is missing or not valid JSON, carry on to the next guess". Raising `SystemExit` with a message prints the message and stops with an error status, without a Python traceback.

### Leaving notes out

```python
def note_path_key(p: str) -> str:
    s = p.strip().replace("\\", "/").strip("/").lower()
    return s + ".md" if s and not s.endswith(".md") else s
```

Turns a note's path into one form for comparing: forward slashes, no slashes at either end, `.md` on the end, lower case. So `Inbox/Triage`, `/inbox/triage.md` and `Inbox\Triage.md` are all the same note.

```python
def read_notes(root: str) -> List[Note]:
    ...
    attachments = {"attachments"}
    hidden = set()
    try:
        with open(os.path.join(root, ".margin", "config.json"), encoding="utf-8") as f:
            config = json.load(f)
        attachments.add(str(config.get("attachments", "attachments")).lower())
        triage = config.get("triage") if isinstance(config.get("triage"), dict) else {}
        for key in ("note", "archive"):
            if isinstance(triage.get(key), str) and note_path_key(triage[key]):
                hidden.add(note_path_key(triage[key]))
    except (OSError, ValueError, AttributeError):
        pass
```

Before walking the folder, it reads the notes folder's own settings (`.margin/config.json`) for two things:

- the name of the attachments folder (you use `Assets`), which holds no notes;
- the **triage note** and the **triage archive**. Their tasks are suggestions from your triage program, not your tasks yet, so they are left out of every list, as in the app. That is why `Suggested by a program` in the sample's `Inbox/Triage.md` never appears.

`with open(...) as f:` opens a file and closes it again at the end of the block, even if something goes wrong. `{"attachments"}` is a *set*: an unordered collection where checking `x in s` is fast.

```python
    notes: List[Note] = []
    for folder, dirs, files in os.walk(root):
        rel = os.path.relpath(folder, root)
        rel = "" if rel == "." else rel.replace(os.sep, "/")
        # Hidden folders (history, trash) and the attachments folder hold no notes.
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and not (not rel and d.lower() in attachments))
```

`os.walk` visits a folder and every folder inside it, giving for each the folder, its subfolders and its files. The line `dirs[:] = …` is a well-known Python trick: assigning to `dirs[:]` changes the list `os.walk` itself is using, which **prunes** the walk, so it never goes into the folders removed from it. Here those are hidden folders (`.margin`, which holds history and trash, and others) and the attachments folder at the top. Sorting the folders and files makes the order the same on every computer.

```python
        for name in sorted(files):
            if name.startswith(".") or not name.lower().endswith(".md"):
                continue
            relpath = (rel + "/" + name) if rel else name
            if note_path_key(relpath) in hidden:
                continue
            try:
                with open(os.path.join(folder, name), encoding="utf-8") as f:
                    notes.append(Note(root, relpath, f.read()))
            except (OSError, UnicodeDecodeError) as e:
                print("margin-tasks: skipped %s (%s)" % (relpath, e), file=sys.stderr)
    return notes
```

Only visible `.md` files are notes, and the hidden ones are skipped. A file that cannot be read (no permission, or not UTF-8 text) is reported on **standard error** and skipped, so one bad file never stops the listing, and the message does not mix into output a script is reading from standard output.

## 14. Days typed on the command line

```python
def parse_day(text: str, now: str) -> str:
    """A day given as 2026-10-08, today, tomorrow, yesterday, +3, -2, or a weekday name (the next one)."""
```

Options like `--due-before friday` accept friendly days. In order, it tries:

| You type | Means |
| --- | --- |
| `2026-12-01` | that day (`fromisoformat` checks it is a real date, so `2026-02-30` is refused) |
| `today`, `now` | today |
| `tomorrow`, `tom`; `yesterday`, `yest` | a day either side |
| `+3`, `-2`, `+10d` | that many days from today |
| `fri`, `friday`, `mon` | the **next** such day: on a Friday, `friday` means a week later, never today (`% 7 or 7`) |

A weekday needs at least three letters and must be clear: `t` or `tu` could be Tuesday or Thursday, so they are refused. Anything else stops with a message listing what is accepted.

```python
def default_week_start() -> int:
    loc = os.environ.get("LC_ALL") or os.environ.get("LC_TIME") or os.environ.get("LANG") or ""
    region = re.search(r"_([A-Z]{2})", loc)
    sunday_first = {"US", "CA", "MX", "BR", "JP", "IN", ...}
    return 0 if region and region.group(1) in sunday_first else 1
```

The `week` list needs the first day of the week. The app's own setting lives in the app, out of reach of a command-line tool, so this guesses from your language settings (`LANG=en_US.UTF-8` gives region `US`, where weeks start on Sunday). `--week-start monday` overrides the guess.

## 15. Output: JSON, CSV, paths, templates, the table

### One task as a record

```python
def record(t: Task, now: str, inbox: str = "Inbox") -> Dict[str, object]:
    return {
        "text": t.text,
        "done": t.done,
        ...
        "line": t.line,
        "raw": t.raw,
    }
```

Every machine-readable format starts from this dictionary, so they all have the same fields with the same names. It includes worked-out answers (`overdue`, `in_today`, `in_inbox`) so a script does not have to repeat the rules. Here is the login-bug task from the sample (`margin-tasks today --json --limit 1`, path shortened):

```json
{
  "text": "Fix the login bug #atlas/backend",
  "done": false,
  "cancelled": false,
  "priority": "P1",
  "tags": ["atlas/backend"],
  "planned": null,
  "someday": false,
  "due": "2026-11-20",
  "done_on": null,
  "repeat": null,
  "remind": null,
  "overdue": true,
  "in_today": true,
  "in_inbox": false,
  "note": "Atlas launch",
  "notebook": "Work",
  "note_type": "note",
  "note_tags": ["project", "atlas"],
  "heading": "Build",
  "path": "…/tourvault/Work/Atlas.md",
  "relpath": "Work/Atlas.md",
  "line": 9,
  "raw": "P1 Fix the login bug @due(2026-11-20) #atlas/backend"
}
```

`None` in Python becomes `null` in JSON.

### The table

```python
def print_table(tasks: List[Task], now: str, color: bool, group: str) -> None:
    def paint(code: str, s: str) -> str:
        return "\033[%sm%s\033[0m" % (code, s) if color and s else s
```

Functions can be defined inside functions; these three (`paint`, `when`, `bucket`) are used only here and can see `now`, `color` and `group` from the outer function.

`paint` wraps text in *ANSI colour codes*: `\033[31m` starts red, `\033[0m` resets. Terminals turn these into colour. The codes used: `31` red (overdue, P1), `33` yellow (P2), `36` cyan (planned for today or earlier), `2` dim (P3, the note's name, finished tasks), `1` bold (group headings).

- `when(t)` builds the dates part: `plan 2026-11-23  repeats weekly`.
- `bucket(t)` names the group a task falls in for `--group`. For `date` that is Overdue, Today, Tomorrow, a date, Someday or No date.

```python
    width = max([len(t.priority_label) for t in tasks] + [0])
```

The priority column is as wide as the widest label, so the text lines up; `+ [0]` makes `max` work on an empty list. If no task has a priority, the column is left out.

A group heading is printed each time the bucket changes from the one before, which is why `main()` sorts the tasks by group first. The result, for `margin-tasks all --group note`:

```
Atlas launch
[ ] P1 Fix the login bug #atlas/backend  due 2026-11-20  Atlas launch › Build
[ ]    Book the launch room  plan 2026-11-28  remind 2026-11-27 09:30  Atlas launch › Later
[ ]    Draft the hiring plan #focus  Atlas launch › Build
[x]    Pick the vendor  done 2026-11-18  Atlas launch › Build
[-]    Old venue booking  cancelled 2026-11-17  Atlas launch › Build
[ ]    Write the retrospective  someday  Atlas launch › Later
```

## 16. main(): the whole run, step by step

`main` is where a run starts. Taking it in order:

### Step 1: the options

```python
    p = argparse.ArgumentParser(prog="margin-tasks", description=..., epilog="lists:\n" + ...)
    p.add_argument("list", nargs="?", default="today", help=...)
    p.add_argument("--vault", metavar="PATH", help=...)
    ...
    f = p.add_argument_group("narrowing down")
    f.add_argument("--tag", action="append", default=[], metavar="TAG", help=...)
    ...
    args = p.parse_args(argv)
```

`argparse` does the work of reading options: you describe each one, and it parses what was typed, checks it, and writes `--help` from the descriptions. Things to notice:

- `"list"` has no dashes, so it is a *positional* argument; `nargs="?"` makes it optional, with `today` as the default. So plain `margin-tasks` shows Today.
- `action="store_true"` makes a flag (`--json`) that is `True` when given.
- `action="append"` lets an option be repeated: `--tag a --tag b` gives `["a", "b"]`.
- `choices=(…)` refuses anything not listed, with a helpful message.
- `add_argument_group` only groups options under headings in `--help`.
- The date options are made in a loop, three for each of due, planned and done (`--due-before`, `--due-after`, `--due-on`, …), instead of nine nearly identical lines.
- `--version` prints `VERSION` and stops.
- Dashes become underscores in the result: `--due-before` is read back as `args.due_before`.

`argv` is `None` normally, meaning "read the real command line"; the tests pass their own list instead.

### Step 2: which list, which day

```python
    name = ALIASES.get(args.list.lower(), args.list.lower())
    if name not in LISTS:
        p.error("unknown list %r. Choose from: %s" % (args.list, ", ".join(LISTS)))
    now = parse_day(args.today, dt.date.today().isoformat()) if args.today else dt.date.today().isoformat()
    week_start = {"sunday": 0, "monday": 1}.get(args.week_start or "", default_week_start())
```

`ALIASES.get(x, x)` gives the real name for an alias, or the name itself. `p.error` prints the usage and the message and stops. `now` is today, unless `--today` says otherwise (handy for "what will Today look like on Friday?").

### Step 3: read, then keep the list's tasks

```python
    notes = read_notes(find_vault(args.vault))
    tasks = [t for n in notes if n.folder != args.templates for t in n.tasks()]
    tasks = [t for t in tasks if in_list(t, name, week_start, now, args.inbox)]
```

The first comprehension has two `for`s: for each note not in the Templates notebook, for each of its tasks. Read it left to right like nested loops. Template tasks are left out because they are a pattern for new notes, not tasks of yours. Only notes **directly** in that notebook are left out, exactly as in the app.

### Step 4: narrow down

```python
    def keep(t: Task) -> bool:
        if args.source != "all" and (t.note.type == "daily") != (args.source == "daily"):
            return False
        if args.query and not matches_query(t, args.query):
            return False
        if any(not has_tag(t.tags, tag) for tag in args.tag):
            return False
        ...
        return True

    tasks = [t for t in tasks if keep(t)]
```

`keep` is one long series of "if this option was given and the task fails it, reject". Some details worth seeing:

- `--source daily` compares two true/false values: is the note a daily note, and was `daily` asked for? They must be equal.
- `--tag` (all must match) uses `any(not …)`: reject if **any** asked-for tag is missing.
- `--priority p2` means P2 **or higher**, unless `--exact-priority`.
- The date options are checked in one loop over `(t.due, "due"), (t.planned, "planned"), (t.done_on, "done")`. `getattr(args, "due_before")` reads an attribute by a name built as text. A task with no such date fails any date condition on it.
- `--notebook Work` also takes notebooks inside `Work` (`Work/Clients`).

### Step 5: sort

```python
    order = args.sort or ("done" if name == "logbook" else "urgency")
    tasks.sort(key=lambda t: urgency_key(t, now))
    if order == "done":
        tasks.sort(key=lambda t: t.done_on or "", reverse=True)
    elif order == "due":
        tasks.sort(key=lambda t: t.due or "9999")
    ...
```

Look closely: it **always** sorts by urgency first, then sorts again by the chosen order. This works because Python's sort is *stable*: items that are equal in the second sort keep the order the first sort gave them. So `--sort due` gives tasks in due-date order, and tasks with the same due date (or none) stay in urgency order among themselves. Sorting twice like this is a common, clean way to get "by this, then by that".

The Logbook's default is the most recently finished first. `--reverse` flips whatever order resulted, and `--limit` keeps the first N (`max(0, …)` makes a negative limit mean none).

### Step 6: print

```python
    if args.count:
        print(len(tasks))
    elif args.json:
        json.dump([record(t, now, args.inbox) for t in tasks], sys.stdout, indent=2, ensure_ascii=False)
    elif args.csv:
        ...
    elif args.paths:
        ...
    elif args.format:
        ...
    else:
        ...
        print_table(tasks, now, sys.stdout.isatty() and not args.no_color and not os.environ.get("NO_COLOR"), args.group)
    return 0
```

One format is used, in this order of preference:

- **`--count`**: just the number (`margin-tasks overdue --count` gives `1` for the sample). Good for a status bar.
- **`--json`**: the records. `ensure_ascii=False` keeps accented letters and emoji readable instead of `é` codes.
- **`--csv`**: a header row and one row per task; tags joined with spaces, `None` written as empty.
- **`--paths`**: `path:line: [ ] text`, the format `grep` uses, so editors can jump to each task:

  ```
  …/tourvault/Work/Atlas.md:9: [ ] P1 Fix the login bug @due(2026-11-20) #atlas/backend
  ```

- **`--format TEMPLATE`**: one line per task from your own template, with any record field in braces. `\t` in the template becomes a tab (`decode("unicode_escape")`). An unknown field stops with the list of fields. `margin-tasks open --format '{priority}\t{due}\t{text}'` on the sample:

  ```
  P1	2026-11-20	Fix the login bug #atlas/backend
  P2		Send the weekly report
  		Book the launch room
  	2026-12-01	Renew passport
  …
  ```

- **otherwise, the table.** Colour is used only when `sys.stdout.isatty()` is true, meaning the output goes to a terminal and not into a file or another program, and when neither `--no-color` nor the `NO_COLOR` environment variable (a common convention) asks otherwise. "No tasks." goes to standard error, so a script reading the output sees nothing at all.

`return 0` is the exit status: 0 means success to the shell.

## 17. The last lines: running as a program

```python
if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
```

`__name__` is `"__main__"` only when this file is run as a program. When the tests `import margin_tasks`, it is `"margin_tasks"`, so nothing runs and the tests can call the functions themselves. This one `if` is what lets the same file be both a command and a library.

`BrokenPipeError` happens when output is piped into a program that stops reading early, as in `margin-tasks all | head -3`. Without this, Python would print an error after `head` finished; with it, the tool just stops quietly.

## 18. How it is kept in step with the app

The rules exist twice: in TypeScript in the app (`src/lib/tasks.ts`) and in Python here. Two copies of the same rules will drift apart unless something checks them. That something is `npm run test:tasks`:

1. **`tests/task-cases.json`** holds sample notes (with tricky cases: nested tasks, numbered lists, quotes, code blocks, front matter, the Inbox, the triage note), a fixed "today", and the **expected** answers: which tasks each list holds, in which order, and what is read from each line.
2. **`scripts/task-fixtures.mjs`** works the expected answers out with **the app's own code**. `--write` records them; `--check` fails if the app's rules no longer give the recorded answers.
3. **`tools/test_margin_tasks.py`** writes the sample notes into a temporary folder, runs **this file's** code on them, and compares with the same expected answers: every task read the same way, every list with the same tasks in the same order, the same query results, the JSON, the filters, and the friendly days.

So if either side changes a rule and the other does not, the test fails. The rule for changing a task rule (also in the project's `CLAUDE.md`): change `src/lib/tasks.ts`, run `node scripts/task-fixtures.mjs --write`, change this file to match, and run `npm run test:tasks` until it passes.

You can run the Python tests alone, too:

```bash
python3 tools/test_margin_tasks.py
```

They use `unittest`, Python's built-in test library: each method whose name starts with `test_` is one test, and `self.assertEqual(a, b)` fails the test if `a` and `b` differ.

## 19. Following one task all the way through

Take `margin-tasks today` on the sample, and follow `- [ ] P1 Fix the login bug @due(2026-11-20) #atlas/backend` in `Work/Atlas.md`:

1. **`main`** reads the options: list `today`, `now` is `2026-11-23`.
2. **`find_vault`** returns the folder (here from `--vault`).
3. **`read_notes`** reads `.margin/config.json`, notes that `Inbox/Triage.md` is hidden, walks the folder, and makes a `Note` for `Work/Atlas.md`.
4. **`Note.__init__` → `parse_file`** finds the front matter: id `atlas01`, title `Atlas launch`, tags `project` and `atlas`, `offset` 5.
5. **`Note.tasks`** goes down the content. Line index 2 is `## Build`, so `heading` becomes `Build`. Line index 3 matches `TASK_LINE`: box `" "` (open), rest `P1 Fix the login bug @due(2026-11-20) #atlas/backend`.
6. **`Task.__init__`** reads it: priority 3 (P1), no planned day, due `2026-11-20`, text `Fix the login bug #atlas/backend`, tags `["atlas/backend"]`.
7. Back in **`main`**, `Atlas.md` is not in Templates, so the task is kept, and **`in_list(…, "today", …)`** asks `is_today`: open, and due `2026-11-20` ≤ `2026-11-23`. Yes.
8. No narrowing options, so **`keep`** passes it.
9. **Sorting**: `urgency_key` is `("2026-11-20", -3, "atlas01", 3)`; its due date has passed, so `next_date` gives the deadline. That sorts before the weekly report's `("2026-11-23", -2, …)`.
10. **`print_table`**: no grouping; box `[ ]`, label `P1`, the text, `due 2026-11-20` (red in a terminal, because it is overdue), then `Atlas launch › Build`:

```
[ ] P1 Fix the login bug #atlas/backend  due 2026-11-20  Atlas launch › Build
[ ] P2 Send the weekly report  plan 2026-11-23  repeats weekly  2026-11-23 › Top 3
```

## 20. Python ideas used, in one place

| Idea | Where | In a sentence |
| --- | --- | --- |
| Shebang `#!/usr/bin/env python3` | line 1 | Lets the file run as a command |
| Docstrings `"""…"""` | top of file and functions | Descriptions Python keeps with the code |
| Type hints `-> List[Task]` | everywhere | Document what goes in and out; not checked when it runs |
| Raw strings `r"…"` | the patterns | Backslashes kept as typed |
| Regular expressions, groups, lookahead | section 5 | Describe text; read parts back with `group(n)` |
| Classes, `__init__`, `self` | `Task`, `Note` | One object per task or note |
| `__slots__` | `Task`, `Note` | Fixed attributes: less memory, typos caught |
| `@property` | `Task.line` | A method read like an attribute |
| `x if cond else y` | many | One-line if |
| `a or b` | `done_on`, `find_vault` | First one that is something |
| Tuples and unpacking `a, b, c = f()` | `parse_file` | Return and take apart several values |
| List comprehensions `[x for x in xs if …]` | many | Build a list in one line |
| Generator expressions `(x for x in xs)` | `notebook_key`, `any(…)` | The same, item by item, without a list |
| `any(…)` | `keep`, `has_tag` | True if one item is true |
| `with open(…) as f` | reading files | The file is closed afterwards, whatever happens |
| `try` / `except` | config, files | Carry on past an expected problem |
| `raise SystemExit("…")` | errors | Stop with a message, no traceback |
| `dirs[:] = …` with `os.walk` | `read_notes` | Prune the folder walk |
| Stable sort, sorting twice | `main` step 5 | "By this, then by that" |
| Tuples as sort keys | `urgency_key` | Sort by several things in order |
| `lambda` | sorts, `pattern.sub` | A tiny unnamed function |
| Functions inside functions | `print_table`, `keep` | Helpers that see the outer function's values |
| `argparse` | `main` step 1 | Options and `--help` from one description |
| `if __name__ == "__main__"` | last lines | One file, both a command and importable |
| Standard error vs standard output | messages | Messages never mix into output a script reads |

## 21. Things to try

All of these only read; none can change a note.

1. See the program's own description of itself:
   ```bash
   margin-tasks --help
   ```
2. Look at one task as the program sees it, with every field:
   ```bash
   margin-tasks today --json --limit 1
   ```
3. Check section 10's rules on your own notes: compare `today`, `anytime` and `overdue`, and find a task that is in Today but not overdue.
4. Pretend it is Friday:
   ```bash
   margin-tasks today --today friday
   ```
5. Your focus tasks, grouped by project:
   ```bash
   margin-tasks open --tag focus --group note
   ```
6. List each overdue task as `path:line`, the form editors and `grep`-aware tools can jump to:
   ```bash
   margin-tasks overdue --paths
   ```
7. Explore the code interactively. From the `tools` folder, start Python and use the functions directly:
   ```python
   import margin_tasks as mt
   t = mt.Note("/tmp", "Work/x.md", "- [ ] P2 Call Priya >2026-12-01 #atlas\n").tasks()[0]
   t.text, t.priority_label, t.planned, t.tags
   mt.in_list(t, "upcoming", 1, "2026-11-23")
   ```
   This is the fastest way to learn the parsing: change the line and see what comes out.
8. Run the tests and read `tools/test_margin_tasks.py`: each test is a short, concrete statement of something the program must do.
