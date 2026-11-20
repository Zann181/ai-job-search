#!/usr/bin/env python3
"""Block personal data from reaching git.

Run from the repo root:
    python tools/privacy_scan.py                 # scan every committable file
    python tools/privacy_scan.py --staged        # scan what `git commit` would record
    python tools/privacy_scan.py --install-hook  # run --staged before every commit

The private terms live in `.private-terms.txt` at the repo root (gitignored):
one term per line, `#` starts a comment, blank lines are skipped. Matching is
case-insensitive and ignores accents, so `José` also catches `jose`, and the
spaces inside a term also match `_`, `-`, `.` or nothing, so `Ana Pérez` catches
`ana_perez`, `Ana-Pérez` and `AnaPerez` (file names, handles, slugs).

Default mode reads every file `git ls-files` and `git ls-files --others
--exclude-standard` list - tracked files plus the untracked ones a plain
`git add .` would pick up. `--staged` reads the index copy of each added,
copied, modified or renamed file (`git show :path`), which is what the commit
records even when the working copy differs. Both modes check file names too,
and skip binary files (a NUL byte in the first 8 KiB).

Every hit prints as `path:line: matches 'term'`. Exit 0 when clean, 1 on any
hit, 2 when git itself fails. A missing `.private-terms.txt` is a warning and
exit 0, so a fresh fork without the file can still commit.

`--install-hook` writes a pre-commit hook into `git rev-parse --git-path
hooks`. It refuses to replace a different hook that is already there: chain
the command into that hook by hand instead. The hook lives in `.git/`, so it
is local to this clone and never committed.

Stdlib only.
"""

import argparse
import functools
import re
import stat
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TERMS_FILE = ".private-terms.txt"
BINARY_SNIFF = 8192

HOOK_MARKER = "# privacy_scan pre-commit hook"
HOOK_SCRIPT = f"""#!/bin/sh
{HOOK_MARKER} (written by tools/privacy_scan.py --install-hook)
# Blocks a commit whose staged files contain a term from .private-terms.txt.
# Bypass once, knowingly: git commit --no-verify
[ -f tools/privacy_scan.py ] || exit 0
for py in python python3 py; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c "import sys" >/dev/null 2>&1; then
    exec "$py" tools/privacy_scan.py --staged
  fi
done
echo "privacy_scan: no Python found; commit not scanned" >&2
exit 1
"""


def fold(text: str) -> str:
    """Lower-case and strip accents so matching ignores both."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def load_terms(path: Path) -> list[str] | None:
    """Return the folded terms, or None when the file is missing."""
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        return None
    terms = []
    for line in raw.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            folded = fold(line)
            if folded not in terms:
                terms.append(folded)
    return terms


def git(root: Path, *args: str) -> bytes:
    proc = subprocess.run(["git", *args], cwd=root, capture_output=True)
    if proc.returncode != 0:
        message = proc.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {message}")
    return proc.stdout


def split_z(output: bytes) -> list[str]:
    return [part.decode("utf-8", "surrogateescape") for part in output.split(b"\0") if part]


def committable_files(root: Path) -> list[str]:
    tracked = split_z(git(root, "ls-files", "-z"))
    untracked = split_z(git(root, "ls-files", "-z", "--others", "--exclude-standard"))
    return sorted(set(tracked) | set(untracked))


def staged_files(root: Path) -> list[str]:
    return sorted(split_z(git(root, "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")))


def is_binary(data: bytes) -> bool:
    return b"\0" in data[:BINARY_SNIFF]


@functools.lru_cache(maxsize=None)
def term_pattern(term: str) -> re.Pattern:
    """Regex for a folded term whose inner spaces also match _ - . ( ) / or nothing."""
    return re.compile(r"[\s_.\-()/]*".join(re.escape(part) for part in term.split()))


def find_terms(text: str, terms: list[str]) -> list[str]:
    folded = fold(text)
    return [term for term in terms if term_pattern(term).search(folded)]


def scan_content(rel: str, data: bytes, terms: list[str]) -> list[tuple[str, str, str]]:
    """Return (path, line-or-'name', term) for every hit in one file."""
    hits = [(rel, "name", term) for term in find_terms(rel, terms)]
    if rel == TERMS_FILE:
        # The terms file is gitignored; seeing it here means it was forced in.
        return hits + [(rel, "file", "the private terms list itself")]
    if is_binary(data):
        return hits
    text = data.decode("utf-8", "replace")
    for number, line in enumerate(text.split("\n"), start=1):
        for term in find_terms(line, terms):
            hits.append((rel, str(number), term))
    return hits


def scan(root: Path, terms: list[str], staged: bool) -> list[tuple[str, str, str]]:
    hits = []
    for rel in staged_files(root) if staged else committable_files(root):
        if staged:
            data = git(root, "show", f":{rel}")
        else:
            path = root / rel
            if not path.is_file():
                continue  # deleted in the working tree, or a submodule
            try:
                data = path.read_bytes()
            except OSError as exc:
                print(f"privacy_scan: cannot read {rel}: {exc}", file=sys.stderr)
                continue
        hits.extend(scan_content(rel, data, terms))
    return hits


def install_hook(root: Path) -> int:
    hooks = Path(git(root, "rev-parse", "--git-path", "hooks").decode("utf-8").strip())
    if not hooks.is_absolute():
        hooks = root / hooks
    hook = hooks / "pre-commit"
    if hook.exists():
        current = hook.read_text(encoding="utf-8", errors="replace")
        if current.replace("\r\n", "\n") == HOOK_SCRIPT:
            print(f"privacy_scan: hook already installed at {hook}")
            return 0
        print(
            f"privacy_scan: refusing to overwrite the existing pre-commit hook at {hook}.\n"
            "It was not written by this tool. Add this line to it by hand instead:\n"
            "  python tools/privacy_scan.py --staged || exit 1",
            file=sys.stderr,
        )
        return 1
    hooks.mkdir(parents=True, exist_ok=True)
    with open(hook, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(HOOK_SCRIPT)
    hook.chmod(hook.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print(f"privacy_scan: pre-commit hook installed at {hook}")
    return 0


def _force_utf8_output() -> None:
    """Use UTF-8 for piped output even on legacy-console hosts."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)  # absent on a StringIO under test
        if reconfigure:
            reconfigure(encoding="utf-8")


def main(argv=None) -> int:
    _force_utf8_output()
    parser = argparse.ArgumentParser(description="Block personal data from reaching git.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true", help="scan the index copy of staged files")
    mode.add_argument("--install-hook", action="store_true", help="install a pre-commit hook running --staged")
    parser.add_argument("--root", type=Path, default=None, help="repo root (default: the repo holding this tool)")
    args = parser.parse_args(argv)
    root = (args.root or ROOT).resolve()

    try:
        if args.install_hook:
            return install_hook(root)
        terms = load_terms(root / TERMS_FILE)
        if terms is None:
            print(
                f"privacy_scan: WARNING {TERMS_FILE} not found at {root}; nothing to check. "
                "Create it with one private term per line (it is gitignored).",
                file=sys.stderr,
            )
            return 0
        if not terms:
            print(f"privacy_scan: WARNING {TERMS_FILE} lists no terms; nothing to check.", file=sys.stderr)
            return 0
        hits = scan(root, terms, args.staged)
    except RuntimeError as exc:
        print(f"privacy_scan: {exc}", file=sys.stderr)
        return 2

    scope = "staged files" if args.staged else "committable files"
    if not hits:
        print(f"privacy_scan: OK ({len(terms)} terms, {scope} clean)")
        return 0
    for rel, where, term in hits:
        print(f"{rel}:{where}: matches {term!r}")
    files = len({rel for rel, _, _ in hits})
    print(
        f"privacy_scan: {len(hits)} hit(s) in {files} file(s) of the {scope}. "
        "Move the personal value to a gitignored file, or gitignore the file.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
