#!/usr/bin/env python3
"""Checks tools/margin_tasks.py against tests/task-cases.json.

The expected results in that file are produced by the app's own task rules (scripts/task-fixtures.mjs),
so passing here means the command-line tool and the app agree. Run with `npm run test:tasks`, or directly.
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import margin_tasks as mt  # noqa: E402

with open(os.path.join(HERE, "..", "tests", "task-cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)
NOW = CASES["today"]
WEEK = CASES["weekStart"]


class SharedCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        for note in CASES["notes"]:
            path = os.path.join(cls.dir.name, *note["path"].split("/"))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8", newline="") as out:
                out.write(note["raw"])
        # Things the tool must ignore: hidden folders, the attachments folder, files that are not notes.
        for extra in (".history/x/1.md", ".trash/old.md", "attachments/readme.md", "Work/notes.txt"):
            path = os.path.join(cls.dir.name, *extra.split("/"))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as out:
                out.write("- [ ] must not be listed @due(%s)\n" % NOW)
        notes = mt.read_notes(cls.dir.name)
        cls.tasks = [t for n in notes if n.folder != CASES["templates"] for t in n.tasks()]

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def select(self, name, query=""):
        chosen = [t for t in self.tasks if mt.in_list(t, name, WEEK, NOW) and (not query or mt.matches_query(t, query))]
        chosen.sort(key=lambda t: mt.urgency_key(t, NOW))
        if name == "logbook":
            chosen.sort(key=lambda t: t.done_on or "", reverse=True)
        return [t.key for t in chosen]

    def test_every_task_is_read_the_same_way(self):
        got = {t.key: t for t in self.tasks}
        want = {t["key"]: t for t in CASES["expected"]["tasks"]}
        self.assertEqual(sorted(got), sorted(want), "the set of lines counted as tasks differs")
        for key, w in want.items():
            t = got[key]
            mine = {
                "key": key, "text": t.text, "done": t.done, "priority": t.priority_label or None, "tags": t.tags,
                "planned": t.planned, "someday": t.someday, "due": t.due, "done_on": t.done_on, "heading": t.heading,
                "overdue": mt.is_overdue(t, NOW), "in_today": mt.is_today(t, NOW),
            }
            self.assertEqual(mine, w, key)

    def test_every_list_has_the_same_tasks_in_the_same_order(self):
        for name, keys in CASES["expected"]["lists"].items():
            self.assertEqual(self.select(name), keys, "list %r" % name)

    def test_queries_narrow_the_same_way(self):
        for q in CASES["expected"]["queries"]:
            self.assertEqual(self.select(q["list"], q["query"]), q["keys"], "%(list)s / %(query)r" % q)

    # ---- the command itself

    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = mt.main(["--vault", self.dir.name, "--today", NOW, "--week-start", "monday" if WEEK == 1 else "sunday", *args])
        self.assertEqual(code, 0)
        return out.getvalue()

    def test_json_output_matches_the_list(self):
        rows = json.loads(self.run_cli("today", "--json"))
        self.assertEqual(["%s:%d" % (r["relpath"], r["line"]) for r in rows], CASES["expected"]["lists"]["today"])
        for r in rows:
            with open(r["path"], encoding="utf-8") as f:
                line = f.read().split("\n")[r["line"] - 1]
            self.assertTrue(line.rstrip().endswith(r["raw"].rstrip()), "path and line must point at the task: %r" % line)

    def test_count_and_default_list(self):
        self.assertEqual(self.run_cli("overdue", "--count").strip(), str(len(CASES["expected"]["lists"]["overdue"])))
        self.assertEqual(self.run_cli("--count").strip(), str(len(CASES["expected"]["lists"]["today"])))
        self.assertEqual(self.run_cli("done", "--count").strip(), str(len(CASES["expected"]["lists"]["logbook"])))

    def test_filters(self):
        def texts(*args):
            return [r["text"] for r in json.loads(self.run_cli(*args, "--json"))]

        self.assertEqual(texts("open", "--priority", "p1", "--exact-priority", "--note", "atlas"), ["Book venue", "Parked idea"])
        self.assertTrue(all("#atlas" in t for t in texts("open", "--tag", "atlas")))
        self.assertIn("Call Priya about budget #atlas/finance", texts("open", "--tag", "atlas"))
        self.assertEqual(texts("open", "--due-on", "today", "--notebook", "Personal"), ["Train tickets"])
        self.assertEqual(texts("open", "--due-before", NOW), ["Book venue"])
        done = texts("logbook", "--done-after", "-2")
        self.assertEqual(done[0], "Capital X counts as done")  # the most recent day first
        self.assertEqual(sorted(done[1:]), ["Done yesterday", "Logged and done"])
        self.assertEqual(texts("open", "--source", "daily", "--priority", "p1"), ["Daily top item"])
        self.assertEqual(texts("open", "--note-tag", "meeting", "--priority", "p3"), ["Me: follow up"])
        self.assertEqual(texts("open", "--priority", "none", "--has-due", "--notebook", "Work/Meetings"), ["Sunday of this week", "Priya: send numbers #atlas"])  # planned for the 11th comes before due on the 12th
        self.assertEqual(texts("all", "--note", "lisbon", "--limit", "1"), ["Train tickets"])

    def test_other_outputs(self):
        paths = self.run_cli("overdue", "--paths").strip()
        self.assertRegex(paths, r"Project Atlas\.md:10: \[ \] Book venue P1 @due\(2026-10-04\)$")
        self.assertEqual(self.run_cli("overdue", "--format", "{due}\\t{priority}\\t{text}").strip(), "2026-10-04\tP1\tBook venue")
        csv_out = self.run_cli("overdue", "--csv").strip().splitlines()
        self.assertEqual(csv_out[0].split(",")[:3], ["done", "priority", "text"])
        self.assertEqual(len(csv_out), 2)
        table = self.run_cli("today", "--group", "date", "--no-color")
        self.assertIn("Overdue", table)
        self.assertIn("[ ] P1 Book venue", table)

    def test_days_on_the_command_line(self):
        self.assertEqual(mt.parse_day("today", NOW), NOW)
        self.assertEqual(mt.parse_day("+3", NOW), "2026-10-11")
        self.assertEqual(mt.parse_day("-7", NOW), "2026-10-01")
        self.assertEqual(mt.parse_day("fri", NOW), "2026-10-09")
        self.assertEqual(mt.parse_day("thursday", NOW), "2026-10-15")  # the next one, not today
        with self.assertRaises(SystemExit):
            mt.parse_day("someday-ish", NOW)


if __name__ == "__main__":
    unittest.main(verbosity=1)
