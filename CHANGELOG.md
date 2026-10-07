# Changelog

What changed in each released version of Margin. Installers are on the [releases page](https://github.com/vimishra/margin/releases).

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
