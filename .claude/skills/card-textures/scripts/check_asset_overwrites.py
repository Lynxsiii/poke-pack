#!/usr/bin/env python3
"""Refuse to change a file under assets/ in place.

_headers serves /assets/* with `Cache-Control: public, max-age=31536000,
immutable`: a browser that has fetched a map, a scan or a symbol keeps it for
a year and never asks again. So a file under assets/ that changes under the
same name is invisible to everyone who already saw the old one, which is how
Espeon ex MEP 108 stayed screened on Noah's phone after PR #73 redrew its
etch map in place (2026-09-29), and how 109 stamp and cosmos maps from #44
and #68 and the tot23 maps from #70 stayed stale before it. A changed asset
needs a new filename, and the data has to point at it.

    python3 .claude/skills/card-textures/scripts/check_asset_overwrites.py           # list, exit 1 if any
    python3 .claude/skills/card-textures/scripts/check_asset_overwrites.py --fix     # rename + rewrite refs

The check compares the working tree with --base (default origin/master) and
lists every asset that is modified rather than added. --fix renames each one
to the next -vN name that has never existed in the repository's history (a
name that once existed may be cached with its old bytes) and rewrites every
exact reference to it in data/*.json, js/*.js, css/**/*.css and index.html;
it then prints what it did. sweep_finishes.py runs the check at the end of
every sweep; make_card_etch.py --ship picks a fresh name on its own.
"""
import argparse
import glob
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def ever_existed(rel):
    """True if a path under assets/ exists now or ever did in history (any branch fetched)."""
    if os.path.exists(os.path.join(ROOT, rel)):
        return True
    return bool(git("log", "--all", "--oneline", "-1", "--", rel).strip())


def fresh_name(rel):
    """The next -vN filename for rel that has never existed."""
    stem, ext = os.path.splitext(rel)
    m = re.match(r"^(.*)-v(\d+)$", stem)
    base, n = (m.group(1), int(m.group(2)) + 1) if m else (stem, 2)
    while True:
        cand = f"{base}-v{n}{ext}"
        if not ever_existed(cand):
            return cand
        n += 1


def modified_assets(base):
    out = git("diff", "--name-status", base, "--", "assets/")
    return [line.split("\t", 1)[1] for line in out.splitlines() if line.startswith("M")]


def rewrite_refs(mapping):
    files = (glob.glob(os.path.join(ROOT, "data", "*.json")) + glob.glob(os.path.join(ROOT, "js", "*.js"))
             + glob.glob(os.path.join(ROOT, "css", "**", "*.css"), recursive=True) + [os.path.join(ROOT, "index.html")])
    counts = {}
    for f in files:
        with open(f, encoding="utf-8") as fh:
            text = fh.read()
        new = text
        for old, fresh in mapping.items():
            for q in ('"', "'", "(") :
                close = {"(": ")"}.get(q, q)
                new = new.replace(q + old + close, q + fresh + close)
        if new != text:
            with open(f, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(new)
            counts[os.path.relpath(f, ROOT)] = sum(new.count(fresh) for fresh in mapping.values())
    return counts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="origin/master", help="ref to compare the working tree with")
    ap.add_argument("--fix", action="store_true", help="rename each modified asset to a fresh -vN name and rewrite references")
    args = ap.parse_args()
    modified = modified_assets(args.base)
    if not modified:
        print(f"ok: no asset changed in place against {args.base}")
        return 0
    print(f"{len(modified)} asset(s) changed in place against {args.base} (cached for a year under that name):")
    for rel in modified[:40]:
        print("  " + rel)
    if len(modified) > 40:
        print(f"  ... and {len(modified) - 40} more")
    if not args.fix:
        print("A changed asset needs a new filename: run with --fix, or rename it to -v2 and point the data at it.")
        return 1
    mapping = {}
    for rel in modified:
        fresh = fresh_name(rel)
        subprocess.run(["git", "mv", rel, fresh], cwd=ROOT, check=True)
        mapping[rel] = fresh
    counts = rewrite_refs(mapping)
    for f, n in sorted(counts.items()):
        print(f"  {f}: {n} reference(s) now point at the new names")
    referenced = sum(counts.values())
    print(f"renamed {len(mapping)} asset(s); {referenced} reference(s) rewritten")
    if referenced < len(mapping):
        print("note: fewer references than renames; an asset nobody references was renamed too (check js/ builders that compose paths)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
