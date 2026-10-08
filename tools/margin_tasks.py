#!/usr/bin/env python3
"""margin-tasks: list the tasks in a Margin notes folder from the command line.

Tasks are checkbox lines in markdown notes. This reads the notes folder directly and works out the
same lists the app shows (Today, Upcoming, Anytime, Someday, Logbook, ...). It never changes a file.

The rules here mirror src/lib/tasks.ts. tests/task-cases.json holds cases checked against both, so
if one side changes and the other does not, `npm run test:tasks` fails.

Standard library only; Python 3.8 or newer.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sys
from typing import Dict, Iterable, List, Optional, Tuple

VERSION = "1.0"

# ---------------------------------------------------------------- parsing (mirrors src/lib/tasks.ts)

# JavaScript's \w and \d are ASCII-only, so the classes are spelled out rather than using Python's wider ones.
TASK_LINE = re.compile(r"^(\s*(?:>\s*)*(?:[-*+]|[0-9]+[.)])\s+\[)([ xX])(\]\s+)(.*)$")
DATE = r"[0-9]{4}-[0-9]{2}-[0-9]{2}"
PRIORITY = re.compile(r"(^|\s)[Pp]([123])(?=\s|$)")
SCHEDULED = re.compile(r"(^|\s)>(" + DATE + r"|[Ss]omeday)(?=\s|$)")
DUE = re.compile(r"(^|\s)@due\((" + DATE + r")\)")
DONE = re.compile(r"(^|\s)@done\((" + DATE + r")\)")
TAG = re.compile(r"(?:^|[\s(])#([A-Za-z][A-Za-z0-9_/-]*)")
FENCE = re.compile(r"^\s*(```|~~~)")
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*$")
FRONTMATTER = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)")
NOTE_TYPES = ("note", "daily", "article", "scratch")

LISTS = {
    "today": "Planned for today or earlier, or due today or earlier",
    "upcoming": "Planned for a day after today",
    "anytime": "Everything you could do now: not planned for later and not someday",
    "someday": "Parked for later, kept out of the other lists",
    "logbook": "Ticked tasks, most recently done first",
    "overdue": "Past the due date",
    "week": "Due or planned for this week",
    "month": "Due or planned from today to 30 days ahead",
    "undated": "No due date, no planned day and not someday",
    "open": "Every task that is not ticked",
    "all": "Every task, ticked or not",
}
ALIASES = {"done": "logbook", "nodate": "undated", "no-date": "undated", "this-week": "week", "next-30-days": "month"}


class Task:
    __slots__ = ("note", "index", "done", "raw", "text", "priority", "tags", "planned", "someday", "due", "done_on", "heading")

    def __init__(self, note: "Note", index: int, done: bool, raw: str, heading: str):
        self.note = note
        self.index = index  # line within the note's content, from 0, as the app counts it
        self.done = done
        self.raw = raw
        self.heading = heading
        written = PRIORITY.search(raw)
        self.priority = 4 - int(written.group(2)) if written else 0  # 3 is P1, 0 is none
        planned = SCHEDULED.search(raw)
        value = planned.group(2) if planned else None
        self.someday = bool(value) and value.lower() == "someday"
        self.planned = None if self.someday else value
        due = DUE.search(raw)
        self.due = due.group(2) if due else None
        done_on = DONE.search(raw)
        self.done_on = done_on.group(2) if done_on else None
        text = raw
        for pattern in (PRIORITY, SCHEDULED, DUE, DONE):
            text = pattern.sub(lambda m: m.group(1), text, count=1)
        self.text = re.sub(r"\s{2,}", " ", text).strip()
        seen: List[str] = []
        for m in TAG.finditer(self.text):
            if m.group(1) not in seen:
                seen.append(m.group(1))
        self.tags = seen

    @property
    def line(self) -> int:
        """Line number in the file, from 1, as an editor shows it."""
        return self.note.offset + self.index + 1

    @property
    def priority_label(self) -> str:
        return "P%d" % (4 - self.priority) if self.priority else ""

    @property
    def key(self) -> str:
        return "%s:%d" % (self.note.relpath, self.line)


class Note:
    __slots__ = ("relpath", "path", "id", "title", "folder", "type", "tags", "content", "offset")

    def __init__(self, root: str, relpath: str, raw: str):
        self.relpath = relpath
        self.path = os.path.join(root, *relpath.split("/"))
        data, content, offset = parse_file(raw)
        self.content = content
        self.offset = offset  # lines of frontmatter above the content
        self.id = str(data["id"]) if data.get("id") else "p" + hashlib.sha1(relpath.encode("utf-8")).hexdigest()[:10]
        base = relpath.rsplit("/", 1)[-1]
        self.title = str(data["title"]) if data.get("title") else base[:-3]
        self.folder = relpath.rsplit("/", 1)[0] if "/" in relpath else ""
        self.type = data.get("type") if data.get("type") in NOTE_TYPES else "note"
        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = [t for t in re.split(r"[,\s]+", tags) if t]
        self.tags = [str(t).lstrip("#") for t in tags]

    def tasks(self) -> List[Task]:
        out: List[Task] = []
        if "[" not in self.content:
            return out
        fence = False
        heading = ""
        for index, line in enumerate(self.content.split("\n")):
            if FENCE.match(line):
                fence = not fence
            if fence:
                continue
            h = HEADING.match(line)
            if h:
                heading = h.group(1)
            elif line.startswith("<!-- card"):
                heading = ""  # a new canvas card starts a new context
            m = TASK_LINE.match(line)
            if not m or not m.group(4).strip():
                continue
            out.append(Task(self, index, m.group(2) != " ", m.group(4), heading))
        return out


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


def parse_frontmatter(text: str) -> Optional[Dict[str, object]]:
    """The few frontmatter values this tool needs (id, title, type, tags), without a YAML library."""
    data: Dict[str, object] = {}
    key = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s+(.*)$", line)
        if item and key:
            if not isinstance(data.get(key), list):
                data[key] = []
            data[key].append(unquote(item.group(1)))  # type: ignore[union-attr]
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


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


# ---------------------------------------------------------------- the lists (mirrors src/lib/tasks.ts)

def add_days(day: str, n: int) -> str:
    return (dt.date.fromisoformat(day) + dt.timedelta(days=n)).isoformat()


def week_range(day: str, week_start: int) -> Tuple[str, str]:
    """First and last day of the week containing `day`. week_start is 0 for Sunday, 1 for Monday."""
    js_weekday = (dt.date.fromisoformat(day).weekday() + 1) % 7  # Sunday is 0, as in JavaScript
    start = add_days(day, -((js_weekday - week_start + 7) % 7))
    return start, add_days(start, 6)


def is_overdue(t: Task, now: str) -> bool:
    return not t.done and bool(t.due) and t.due < now


def is_today(t: Task, now: str) -> bool:
    return not t.done and ((bool(t.planned) and t.planned <= now) or (bool(t.due) and t.due <= now))


def in_list(t: Task, name: str, week_start: int, now: str) -> bool:
    if name == "all":
        return True
    if name == "logbook":
        return t.done
    if t.done:
        return False
    if name == "today":
        return is_today(t, now)
    if name == "anytime":
        return not t.someday and not (t.planned and t.planned > now)
    if name == "someday":
        return t.someday
    if name == "week":
        start, end = week_range(now, week_start)
        return any(d and start <= d <= end for d in (t.due, t.planned))
    if name == "month":
        end = add_days(now, 30)
        return any(d and now <= d <= end for d in (t.due, t.planned))
    if name == "overdue":
        return is_overdue(t, now)
    if name == "upcoming":
        return bool(t.planned) and t.planned > now
    if name == "undated":
        return not (t.due or t.planned) and not t.someday
    return True  # open


def next_date(t: Task, now: str) -> str:
    """The day a task next needs attention: a missed deadline first, otherwise the nearest of its dates."""
    if t.due and t.due < now:
        return t.due
    planned = now if (t.planned and t.planned < now) else t.planned
    dates = sorted(d for d in (planned, t.due) if d)
    return dates[0] if dates else ""


def urgency_key(t: Task, now: str):
    return (next_date(t, now) or "9999", -t.priority, t.note.id, t.index)


def matches_query(t: Task, query: str) -> bool:
    """The app's narrow-down box: words in the task or note title, "#tag", and "p1".."p3" for that priority or higher."""
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


def has_tag(tags: Iterable[str], wanted: str) -> bool:
    wanted = wanted.lstrip("#").lower()
    return any(x.lower() == wanted or x.lower().startswith(wanted + "/") for x in tags)


# ---------------------------------------------------------------- reading the notes folder

def find_vault(explicit: Optional[str]) -> str:
    if explicit:
        return os.path.abspath(os.path.expanduser(explicit))
    if os.environ.get("MARGIN_VAULT"):
        return os.path.abspath(os.path.expanduser(os.environ["MARGIN_VAULT"]))
    home = os.path.expanduser("~")
    if sys.platform == "darwin":
        base = os.path.join(home, "Library", "Application Support")
    elif os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.join(home, "AppData", "Roaming")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config")
    try:
        with open(os.path.join(base, "Margin", "config.json"), encoding="utf-8") as f:
            saved = json.load(f).get("vaultDir")
        if saved:
            return saved
    except (OSError, ValueError):
        pass
    for guess in (os.path.join(home, "Documents", "Margin"),):
        if os.path.isdir(guess):
            return guess
    raise SystemExit("margin-tasks: could not find your notes folder. Pass --vault PATH, or set MARGIN_VAULT.")


def read_notes(root: str) -> List[Note]:
    if not os.path.isdir(root):
        raise SystemExit("margin-tasks: %s is not a folder." % root)
    attachments = {"attachments"}
    try:
        with open(os.path.join(root, ".margin", "config.json"), encoding="utf-8") as f:
            attachments.add(str(json.load(f).get("attachments", "attachments")).lower())
    except (OSError, ValueError):
        pass
    notes: List[Note] = []
    for folder, dirs, files in os.walk(root):
        rel = os.path.relpath(folder, root)
        rel = "" if rel == "." else rel.replace(os.sep, "/")
        # Hidden folders (history, trash) and the attachments folder hold no notes.
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and not (not rel and d.lower() in attachments))
        for name in sorted(files):
            if name.startswith(".") or not name.lower().endswith(".md"):
                continue
            relpath = (rel + "/" + name) if rel else name
            try:
                with open(os.path.join(folder, name), encoding="utf-8") as f:
                    notes.append(Note(root, relpath, f.read()))
            except (OSError, UnicodeDecodeError) as e:
                print("margin-tasks: skipped %s (%s)" % (relpath, e), file=sys.stderr)
    return notes


# ---------------------------------------------------------------- dates typed on the command line

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def parse_day(text: str, now: str) -> str:
    """A day given as 2026-10-08, today, tomorrow, yesterday, +3, -2, or a weekday name (the next one)."""
    s = text.strip().lower()
    if re.fullmatch(DATE, s):
        dt.date.fromisoformat(s)
        return s
    if s in ("today", "now"):
        return now
    if s in ("tomorrow", "tom"):
        return add_days(now, 1)
    if s in ("yesterday", "yest"):
        return add_days(now, -1)
    m = re.fullmatch(r"([+-])(\d{1,4})d?", s)
    if m:
        return add_days(now, int(m.group(2)) * (1 if m.group(1) == "+" else -1))
    names = [w for w in WEEKDAYS if len(s) >= 3 and w.startswith(s)]
    if len(names) == 1:
        ahead = (WEEKDAYS.index(names[0]) - dt.date.fromisoformat(now).weekday()) % 7 or 7
        return add_days(now, ahead)
    raise SystemExit("margin-tasks: %r is not a day. Use YYYY-MM-DD, today, tomorrow, +3, or a weekday." % text)


def default_week_start() -> int:
    """Sunday in the places that start the week on Sunday, Monday elsewhere. The app's own setting is not readable from here."""
    loc = os.environ.get("LC_ALL") or os.environ.get("LC_TIME") or os.environ.get("LANG") or ""
    region = re.search(r"_([A-Z]{2})", loc)
    sunday_first = {"US", "CA", "MX", "BR", "JP", "IN", "IL", "KR", "TW", "HK", "PH", "ZA", "SA", "TH", "CO", "PE", "VE"}
    return 0 if region and region.group(1) in sunday_first else 1


# ---------------------------------------------------------------- output

def record(t: Task, now: str) -> Dict[str, object]:
    return {
        "text": t.text,
        "done": t.done,
        "priority": t.priority_label or None,
        "tags": t.tags,
        "planned": t.planned,
        "someday": t.someday,
        "due": t.due,
        "done_on": t.done_on,
        "overdue": is_overdue(t, now),
        "in_today": is_today(t, now),
        "note": t.note.title,
        "notebook": t.note.folder,
        "note_type": t.note.type,
        "note_tags": t.note.tags,
        "heading": t.heading,
        "path": t.note.path,
        "relpath": t.note.relpath,
        "line": t.line,
        "raw": t.raw,
    }


def print_table(tasks: List[Task], now: str, color: bool, group: str) -> None:
    def paint(code: str, s: str) -> str:
        return "\033[%sm%s\033[0m" % (code, s) if color and s else s

    def when(t: Task) -> str:
        parts = []
        if t.someday:
            parts.append("someday")
        if t.planned:
            parts.append(paint("36" if t.planned <= now and not t.done else "0", "plan " + t.planned))
        if t.due:
            parts.append(paint("31" if is_overdue(t, now) else "0", "due " + t.due))
        if t.done_on:
            parts.append("done " + t.done_on)
        return "  ".join(parts)

    def bucket(t: Task) -> str:
        if group == "note":
            return t.note.title
        if group == "notebook":
            return t.note.folder or "(no notebook)"
        if group == "priority":
            return t.priority_label or "No priority"
        if group == "date":
            if t.done:
                return t.done_on or "Day not recorded"
            d = next_date(t, now)
            if not d:
                return "Someday" if t.someday else "No date"
            if t.due and t.due < now:
                return "Overdue"
            return "Today" if d == now else "Tomorrow" if d == add_days(now, 1) else d
        return ""

    width = max([len(t.priority_label) for t in tasks] + [0])
    last = None
    for t in tasks:
        b = bucket(t)
        if group != "none" and b != last:
            if last is not None:
                print()
            print(paint("1", b))
            last = b
        box = "[x]" if t.done else "[ ]"
        pri = paint("33" if t.priority == 2 else "31" if t.priority == 3 else "2", t.priority_label.ljust(width))
        where = t.note.title + (" › " + t.heading if t.heading and t.heading != t.note.title else "")
        bits = [box] + ([pri] if width else []) + [paint("2" if t.done else "0", t.text)]
        extra = "  ".join(x for x in (when(t), paint("2", where)) if x)
        print(" ".join(bits) + ("  " + extra if extra else ""))


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(
        prog="margin-tasks",
        description="List the tasks in your Margin notes. Read-only: it never changes a note.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="lists:\n" + "\n".join("  %-9s %s" % (k, v) for k, v in LISTS.items())
        + "\n\nexamples:\n  margin-tasks today\n  margin-tasks open --tag atlas --priority p2\n  margin-tasks open --due-before friday --json\n  margin-tasks logbook --done-after -7 --group date\n  margin-tasks overdue --count",
    )
    p.add_argument("list", nargs="?", default="today", help="which list to show (default: today); see below")
    p.add_argument("--vault", metavar="PATH", help="notes folder (default: the one Margin uses, or $MARGIN_VAULT)")
    p.add_argument("--templates", metavar="NAME", default="Templates", help="templates notebook, whose tasks are left out (default: Templates)")
    p.add_argument("--week-start", choices=("sunday", "monday"), help="first day of the week, for the week list")
    p.add_argument("--today", metavar="DAY", help="treat this day as today (for scripts and testing)")

    f = p.add_argument_group("narrowing down")
    f.add_argument("-q", "--query", metavar="TEXT", help='the same as the app\'s box: words, "#tag", and p1/p2/p3 for that priority or higher')
    f.add_argument("--tag", action="append", default=[], metavar="TAG", help="tasks with this tag; repeat for several (all must match)")
    f.add_argument("--note-tag", action="append", default=[], metavar="TAG", help="tasks in notes that carry this tag")
    f.add_argument("--priority", metavar="P", choices=("p1", "p2", "p3", "none"), type=str.lower, help="p1, p2 or p3 for that priority or higher; none for tasks without one")
    f.add_argument("--exact-priority", action="store_true", help="with --priority: only that priority, not higher ones")
    for field, label in (("due", "due date"), ("planned", "planned day"), ("done", "day it was done")):
        f.add_argument("--%s-before" % field, metavar="DAY", help="%s before this day" % label)
        f.add_argument("--%s-after" % field, metavar="DAY", help="%s after this day" % label)
        f.add_argument("--%s-on" % field, metavar="DAY", help="%s on this day" % label)
    f.add_argument("--has-due", action="store_true", help="only tasks with a due date")
    f.add_argument("--no-due", action="store_true", help="only tasks without a due date")
    f.add_argument("--notebook", metavar="NAME", help="tasks in this notebook or the notebooks inside it")
    f.add_argument("--note", metavar="TEXT", help="tasks in notes whose title contains this")
    f.add_argument("--source", choices=("all", "notes", "daily"), default="all", help="all notes, ordinary notes only, or daily notes only")

    o = p.add_argument_group("output")
    o.add_argument("--json", action="store_true", help="a JSON array, one object per task")
    o.add_argument("--csv", action="store_true", help="comma-separated values with a header row")
    o.add_argument("--paths", action="store_true", help="path:line: task, the way grep prints, for editors and scripts")
    o.add_argument("--count", action="store_true", help="only the number of tasks")
    o.add_argument("--format", metavar="TEMPLATE", help='one line per task from a template, e.g. "{due}\\t{text}"; fields are the JSON keys')
    o.add_argument("--sort", choices=("urgency", "due", "planned", "priority", "note", "done"), help="order (default: urgency; logbook: done)")
    o.add_argument("--reverse", action="store_true", help="reverse the order")
    o.add_argument("--limit", type=int, metavar="N", help="at most N tasks")
    o.add_argument("--group", choices=("none", "date", "note", "notebook", "priority"), default="none", help="headings in the plain listing")
    o.add_argument("--no-color", action="store_true", help="no colours in the plain listing")
    o.add_argument("--version", action="version", version="margin-tasks " + VERSION)
    args = p.parse_args(argv)

    name = ALIASES.get(args.list.lower(), args.list.lower())
    if name not in LISTS:
        p.error("unknown list %r. Choose from: %s" % (args.list, ", ".join(LISTS)))
    now = parse_day(args.today, dt.date.today().isoformat()) if args.today else dt.date.today().isoformat()
    week_start = {"sunday": 0, "monday": 1}.get(args.week_start or "", default_week_start())

    notes = read_notes(find_vault(args.vault))
    tasks = [t for n in notes if n.folder != args.templates for t in n.tasks()]
    tasks = [t for t in tasks if in_list(t, name, week_start, now)]

    def day(option: Optional[str]) -> Optional[str]:
        return parse_day(option, now) if option else None

    def keep(t: Task) -> bool:
        if args.source != "all" and (t.note.type == "daily") != (args.source == "daily"):
            return False
        if args.query and not matches_query(t, args.query):
            return False
        if any(not has_tag(t.tags, tag) for tag in args.tag):
            return False
        if any(not has_tag(t.note.tags, tag) for tag in args.note_tag):
            return False
        if args.priority:
            if args.priority == "none":
                if t.priority:
                    return False
            else:
                want = 4 - int(args.priority[1])
                if (t.priority != want) if args.exact_priority else (t.priority < want):
                    return False
        for value, prefix in ((t.due, "due"), (t.planned, "planned"), (t.done_on, "done")):
            before, after, on = (day(getattr(args, "%s_%s" % (prefix, s))) for s in ("before", "after", "on"))
            if (before or after or on) and not value:
                return False
            if (before and not value < before) or (after and not value > after) or (on and value != on):
                return False
        if args.has_due and not t.due:
            return False
        if args.no_due and t.due:
            return False
        if args.notebook:
            nb = args.notebook.strip("/").lower()
            if not (t.note.folder.lower() == nb or t.note.folder.lower().startswith(nb + "/")):
                return False
        if args.note and args.note.lower() not in t.note.title.lower():
            return False
        return True

    tasks = [t for t in tasks if keep(t)]

    order = args.sort or ("done" if name == "logbook" else "urgency")
    tasks.sort(key=lambda t: urgency_key(t, now))
    if order == "done":
        tasks.sort(key=lambda t: t.done_on or "", reverse=True)
    elif order == "due":
        tasks.sort(key=lambda t: t.due or "9999")
    elif order == "planned":
        tasks.sort(key=lambda t: t.planned or "9999")
    elif order == "priority":
        tasks.sort(key=lambda t: -t.priority)
    elif order == "note":
        tasks.sort(key=lambda t: (t.note.title.lower(), t.index))
    if args.reverse:
        tasks.reverse()
    if args.limit is not None:
        tasks = tasks[: max(0, args.limit)]

    if args.count:
        print(len(tasks))
    elif args.json:
        json.dump([record(t, now) for t in tasks], sys.stdout, indent=2, ensure_ascii=False)
        print()
    elif args.csv:
        fields = ["done", "priority", "text", "tags", "planned", "someday", "due", "done_on", "note", "notebook", "heading", "relpath", "line"]
        w = csv.writer(sys.stdout)
        w.writerow(fields)
        for t in tasks:
            r = record(t, now)
            r["tags"] = " ".join(t.tags)
            w.writerow(["" if r[k] is None else r[k] for k in fields])
    elif args.paths:
        for t in tasks:
            print("%s:%d: [%s] %s" % (t.note.path, t.line, "x" if t.done else " ", t.raw))
    elif args.format:
        template = args.format.encode("utf-8").decode("unicode_escape") if "\\" in args.format else args.format
        for t in tasks:
            r = {k: ("" if v is None else " ".join(v) if isinstance(v, list) else v) for k, v in record(t, now).items()}
            try:
                print(template.format(**r))
            except KeyError as e:
                raise SystemExit("margin-tasks: no field %s. Fields: %s" % (e, ", ".join(sorted(r))))
    else:
        if not tasks:
            print("No tasks.", file=sys.stderr)
        # Grouping needs the group's members together; keep each group's own order.
        if args.group != "none" and not args.sort and name != "logbook":
            if args.group == "note":
                tasks.sort(key=lambda t: t.note.title.lower())
            elif args.group == "notebook":
                tasks.sort(key=lambda t: t.note.folder.lower())
            elif args.group == "priority":
                tasks.sort(key=lambda t: -t.priority)
        print_table(tasks, now, sys.stdout.isatty() and not args.no_color and not os.environ.get("NO_COLOR"), args.group)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(0)
