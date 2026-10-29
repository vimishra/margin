#!/usr/bin/env python3
"""Look for anything unusual in a Margin note file, without printing its text.

    python3 check_note.py "path/to/Note.md"            # one note
    python3 check_note.py "path/to/Note.md" --vault ~/Documents/Vault   # also look for notes sharing its id

Everything it prints is a count, a size or a line number, so the output can be shared without sharing the
note. Open the note in any text editor and go to the line numbers it gives to see what it means. It only
reads files; it never changes anything.
"""
import argparse
import os
import re
import sys
import unicodedata

LONG_LINE = 2000          # characters on one line before it is worth a mention
BIG_FILE = 2_000_000      # bytes
DEEP_LIST = 12            # levels of list nesting
WIDE_TABLE = 30           # columns


def report(label, value, warn=False, lines=None):
    mark = "!!" if warn else "  "
    where = ""
    if lines:
        shown = ", ".join(str(n) for n in lines[:15])
        more = f" (and {len(lines) - 15} more)" if len(lines) > 15 else ""
        where = f"  lines {shown}{more}"
    print(f"{mark} {label}: {value}{where}")
    return warn


def check(path, vault):
    problems = 0
    raw = open(path, "rb").read()
    print(f"File: {os.path.basename(path)}")
    problems += report("size", f"{len(raw):,} bytes", len(raw) > BIG_FILE)

    # ---- bytes and encoding ----
    problems += report("starts with a byte-order mark", "yes" if raw.startswith(b"\xef\xbb\xbf") else "no", raw.startswith(b"\xef\xbb\xbf"))
    nul = raw.count(b"\x00")
    problems += report("NUL bytes", nul, nul > 0)
    try:
        text = raw.decode("utf-8")
        report("valid UTF-8", "yes")
    except UnicodeDecodeError as e:
        problems += report("valid UTF-8", f"no, first bad byte at offset {e.start:,}", True)
        text = raw.decode("utf-8", errors="replace")
    if text.startswith("﻿"):
        text = text[1:]

    crlf = text.count("\r\n")
    lone_cr = text.count("\r") - crlf
    report("Windows line endings (CRLF)", crlf)
    problems += report("old Mac line endings (CR only)", lone_cr, lone_cr > 0)
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    report("lines", f"{len(lines):,}")

    # ---- unusual characters ----
    control, invisible, separators, private = [], [], [], []
    for n, line in enumerate(lines, 1):
        for ch in line:
            o = ord(ch)
            cat = unicodedata.category(ch)
            if ch == "\t":
                continue
            if cat == "Cc":
                control.append(n)
            elif o in (0x2028, 0x2029):
                separators.append(n)
            elif cat == "Cf":
                invisible.append(n)
            elif cat == "Co" or 0xFFF0 <= o <= 0xFFFF:
                private.append(n)
    dedupe = lambda xs: sorted(set(xs))
    problems += report("control characters", len(control), bool(control), dedupe(control))
    problems += report("Unicode line/paragraph separators (U+2028/9)", len(separators), bool(separators), dedupe(separators))
    report("invisible format characters (zero-width, direction marks)", len(invisible), False, dedupe(invisible))
    problems += report("private-use or special characters", len(private), bool(private), dedupe(private))

    # ---- long lines ----
    long_lines = [n for n, l in enumerate(lines, 1) if len(l) > LONG_LINE]
    longest = max(range(len(lines)), key=lambda i: len(lines[i])) if lines else 0
    report("longest line", f"{len(lines[longest]):,} characters, line {longest + 1}")
    problems += report(f"lines over {LONG_LINE:,} characters", len(long_lines), bool(long_lines), long_lines)
    data_uris = [n for n, l in enumerate(lines, 1) if "data:" in l and "base64," in l]
    problems += report("embedded base64 data (pasted images inline)", len(data_uris), bool(data_uris), data_uris)

    # ---- frontmatter ----
    body_start = 0
    if lines and lines[0].strip() == "---":
        end = next((i for i in range(1, min(len(lines), 200)) if lines[i].strip() == "---"), None)
        if end is None:
            problems += report("frontmatter", "starts with --- but never closes in the first 200 lines", True)
        else:
            body_start = end + 1
            keys = [l.split(":", 1)[0].strip() for l in lines[1:end] if re.match(r"^[A-Za-z_][\w-]*\s*:", l)]
            dupes = sorted({k for k in keys if keys.count(k) > 1})
            report("frontmatter", f"lines 1-{end + 1}, fields: {', '.join(keys) or 'none'}")
            if dupes:
                problems += report("frontmatter fields given twice", ", ".join(dupes), True)
            ids = [l.split(":", 1)[1].strip().strip("'\"") for l in lines[1:end] if re.match(r"^id\s*:", l)]
            note_id = ids[0] if ids else None
            report("note id", note_id or "none (Margin derives one from the file name)")
            if vault and note_id:
                problems += same_id(vault, path, note_id)
    else:
        report("frontmatter", "none")

    body = lines[body_start:]
    offset = body_start

    # ---- structure ----
    fences, open_fence = 0, None
    for i, l in enumerate(body):
        m = re.match(r"^\s{0,3}(```+|~~~+)", l)
        if m:
            if open_fence is None:
                open_fence = (m.group(1)[0], len(m.group(1)), i + offset + 1)
                fences += 1
            elif m.group(1)[0] == open_fence[0] and len(m.group(1)) >= open_fence[1]:
                open_fence = None
    report("code blocks", fences)
    if open_fence:
        problems += report("code block never closed", "opened", True, [open_fence[2]])

    joined = "\n".join(body)
    opens, closes = joined.count("<!--"), joined.count("-->")
    problems += report("HTML comments (<!-- -->)", f"{opens} opened, {closes} closed", opens != closes)
    canvas = sum(1 for l in body if l.strip() == "<!-- canvas -->")
    problems += report("canvas markers", canvas, canvas > 1)
    cards_open = joined.count("<!-- card ")
    cards_close = joined.count("<!-- /card -->")
    problems += report("canvas cards", f"{cards_open} opened, {cards_close} closed", cards_open != cards_close)

    headings = [(i + offset + 1, len(m.group(1))) for i, l in enumerate(body) if (m := re.match(r"^(#{1,6})\s", l))]
    report("headings", len(headings))
    jumps = [n for (n, lv), (_, prev) in zip(headings[1:], headings) if lv > prev + 1]
    report("headings that skip a level (# then ###)", len(jumps), False, jumps)

    depth, deep = 0, []
    for i, l in enumerate(body):
        m = re.match(r"^(\s*)(?:[-*+]|\d+[.)])\s", l)
        if m:
            indent = len(m.group(1).replace("\t", "    "))
            d = indent // 2
            depth = max(depth, d)
            if d >= DEEP_LIST:
                deep.append(i + offset + 1)
    problems += report("deepest list nesting", f"{depth} levels", depth >= DEEP_LIST, deep)

    tables, widest, wide_at, ragged = 0, 0, 0, []
    i = 0
    while i < len(body):
        if body[i].lstrip().startswith("|") and i + 1 < len(body) and re.match(r"^\s*\|?\s*:?-{1,}", body[i + 1]):
            tables += 1
            start = i
            cols = body[i].count("|")
            while i < len(body) and body[i].lstrip().startswith("|"):
                c = body[i].count("|")
                if c != cols and not body[i].count("\\|"):
                    ragged.append(i + offset + 1)
                if c > widest:
                    widest, wide_at = c, start + offset + 1
                i += 1
        else:
            i += 1
    report("tables", tables)
    if tables:
        problems += report("widest table", f"{max(widest - 1, 0)} columns, starting line {wide_at}", widest - 1 > WIDE_TABLE)
        report("table rows with a different number of cells", len(ragged), False, ragged)

    tasks = [i + offset + 1 for i, l in enumerate(body) if re.match(r"^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$", l)]
    report("tasks", len(tasks))
    links = len(re.findall(r"\[\[[^\]\n]*\]\]", joined))
    broken = [i + offset + 1 for i, l in enumerate(body) if l.count("[[") != l.count("]]")]
    report("[[links]]", links)
    report("lines with unmatched [[ or ]]", len(broken), False, broken)
    nested_quotes = [i + offset + 1 for i, l in enumerate(body) if re.match(r"^\s*(>\s*){6,}", l)]
    problems += report("quotes nested 6 or more deep", len(nested_quotes), bool(nested_quotes), nested_quotes)

    print()
    if problems:
        print(f"{problems} thing(s) marked !! above are unusual and worth a look at those lines.")
    else:
        print("Nothing unusual found in the file itself.")
    return problems


def same_id(vault, path, note_id):
    """Other notes in the folder with the same id: two files Margin would treat as one note."""
    others = []
    me = os.path.realpath(path)
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if not f.endswith(".md"):
                continue
            p = os.path.join(root, f)
            if os.path.realpath(p) == me:
                continue
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    head = fh.read(4000)
            except OSError:
                continue
            m = re.search(r"^---\n(?:.*\n)*?id:\s*['\"]?([^\s'\"]+)", head)
            if m and m.group(1) == note_id:
                others.append(os.path.relpath(p, vault))
    if others:
        print(f"!! other notes with the same id: {', '.join(others)}")
        print("   Margin treats files with one id as one note. Remove or rename the copy you do not want (keep a backup).")
        return True
    report("other notes with the same id", "none")
    return False


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("note", help="the .md file to check")
    ap.add_argument("--vault", help="the notes folder, to look for other notes with the same id")
    args = ap.parse_args()
    if not os.path.isfile(args.note):
        sys.exit(f"No such file: {args.note}")
    sys.exit(1 if check(args.note, os.path.expanduser(args.vault) if args.vault else None) else 0)
