#!/bin/bash
# Installs or updates Margin from the GitHub releases, without the "downloaded from the internet" block.
#
#   margin-update            install the newest release
#   margin-update 1.18.1     install that version
#
# A browser marks what it downloads, and macOS then refuses to open an app that is not notarised, which is why
# the release notes say to run `xattr -cr`. This script downloads with the GitHub command-line tool (or curl),
# which does not mark the file, so the app opens straight away. The first run also copies this script to
# ~/.local/bin/margin-update, so later updates are one command.
#
# The repository is private, so the download needs to be signed in, either way:
#   - the GitHub command-line tool, `gh`, signed in once with `gh auth login`; or
#   - a GitHub token with read access to the repository, in ~/.config/margin/github-token
#     (or in the GITHUB_TOKEN environment variable).
#
# For testing: MARGIN_APPS=<folder> installs into that folder instead of /Applications and leaves a running Margin
# alone; MARGIN_SELF_COPY=<file> keeps the copy of this script there instead of in ~/.local/bin.

set -euo pipefail

REPO="vimishra/margin"
APPS="${MARGIN_APPS:-/Applications}"
TOKEN_FILE="$HOME/.config/margin/github-token"
SELF_COPY="${MARGIN_SELF_COPY:-$HOME/.local/bin/margin-update}"
version="${1:-}"
version="${version#v}"

say() { printf '%s\n' "$*"; }
fail() { printf 'margin-update: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || fail "this installs the Mac app; run it on a Mac."
[ "$(uname -m)" = arm64 ] || fail "the releases are built for Apple silicon (M1 and later); this Mac has an Intel processor."

work=$(mktemp -d "${TMPDIR:-/tmp}/margin-update.XXXXXX")
mnt="$work/mnt"
# shellcheck disable=SC2329 # called by the trap below
cleanup() {
  [ -d "$mnt" ] && hdiutil detach -quiet "$mnt" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

# ---- 1. Download the installer ------------------------------------------------------------------
token="${GITHUB_TOKEN:-}"
[ -z "$token" ] && [ -r "$TOKEN_FILE" ] && token=$(tr -d '[:space:]' <"$TOKEN_FILE")

if [ -z "$token" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  tag="${version:+v$version}"
  [ -z "$tag" ] && tag=$(gh release view --repo "$REPO" --json tagName -q .tagName)
  say "Downloading Margin ${tag#v}…"
  gh release download "$tag" --repo "$REPO" --pattern '*-arm64.dmg' --dir "$work"
elif [ -n "$token" ]; then
  api="https://api.github.com/repos/$REPO/releases/${version:+tags/v$version}"
  [ -z "$version" ] && api="https://api.github.com/repos/$REPO/releases/latest"
  curl -fsSL -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" "$api" -o "$work/release.json" ||
    fail "could not read the release from GitHub. Check the token in $TOKEN_FILE and that it can read $REPO."
  tag=$(plutil -extract tag_name raw -o - "$work/release.json")
  # Find the Apple-silicon installer among the release's files (plutil reads JSON, so nothing else is needed).
  asset=""
  i=0
  while name=$(plutil -extract "assets.$i.name" raw -o - "$work/release.json" 2>/dev/null); do
    case "$name" in *-arm64.dmg) asset=$(plutil -extract "assets.$i.url" raw -o - "$work/release.json"); break ;; esac
    i=$((i + 1))
  done
  [ -n "$asset" ] || fail "release $tag has no Apple-silicon installer."
  say "Downloading Margin ${tag#v}…"
  curl -fL --progress-bar -H "Authorization: Bearer $token" -H "Accept: application/octet-stream" "$asset" -o "$work/$name"
else
  fail "not signed in to GitHub. Either run 'gh auth login' once, or put a token in $TOKEN_FILE (see the user guide: Installing and updating)."
fi

dmg=$(find "$work" -maxdepth 1 -name "*.dmg" | head -1)
[ -n "$dmg" ] || fail "the download did not produce an installer."

# ---- 2. Close Margin if it is open, so it can be replaced --------------------------------------
if [ -z "${MARGIN_APPS:-}" ] && pgrep -xq Margin; then
  say "Closing Margin (your notes are saved as you type)…"
  osascript -e 'tell application "Margin" to quit' >/dev/null 2>&1 || true
  for _ in $(seq 20); do pgrep -xq Margin || break; sleep 0.5; done
  pgrep -xq Margin && fail "Margin is still open. Quit it and run this again."
fi

# ---- 3. Copy the app out of the installer -------------------------------------------------------
mkdir -p "$mnt"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$dmg"
[ -d "$mnt/Margin.app" ] || fail "the installer does not contain Margin.app."
mkdir -p "$APPS"
rm -rf "$APPS/Margin.app.new"
# ditto keeps the app's signature and extended attributes intact.
ditto "$mnt/Margin.app" "$APPS/Margin.app.new" || fail "could not write to $APPS. Is it a folder you can change?"
rm -rf "$APPS/Margin.app"
mv "$APPS/Margin.app.new" "$APPS/Margin.app"
# Nothing should have marked the copy, but make sure, so it always opens without the warning.
xattr -dr com.apple.quarantine "$APPS/Margin.app" 2>/dev/null || true

installed=$(plutil -extract CFBundleShortVersionString raw -o - "$APPS/Margin.app/Contents/Info.plist")
say "Margin $installed is installed in $APPS."

# ---- 4. Keep a copy of this script for next time ------------------------------------------------
here="${BASH_SOURCE[0]}"
if [ -f "$here" ] && [ "$(cd "$(dirname "$here")" && pwd)/$(basename "$here")" != "$SELF_COPY" ]; then
  mkdir -p "$(dirname "$SELF_COPY")"
  cp "$here" "$SELF_COPY"
  chmod +x "$SELF_COPY"
  say "Next time, update with: margin-update"
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) say "(Add ~/.local/bin to your PATH to type it without the full path: $SELF_COPY)" ;; esac
fi

[ -z "${MARGIN_APPS:-}" ] && open "$APPS/Margin.app"
exit 0
