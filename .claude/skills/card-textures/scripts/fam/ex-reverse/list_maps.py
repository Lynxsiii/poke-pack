#!/usr/bin/env python3
"""Regenerates the MAPPED set and VERSION table of js/fam/ex-reverse.js from assets/foil/fam/ex-reverse/<id>-v<N>.webp.
Run from the repo root after the maps change:  python3 .claude/skills/card-textures/scripts/fam/ex-reverse/list_maps.py
A card is claimed only when its map file exists; the highest -vN of an id wins."""
import re, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parents[6]
folder = ROOT / "assets/foil/fam/ex-reverse"
js = ROOT / "js/fam/ex-reverse.js"
# cards whose map is drawn but wrong in review (left on the era look): background chunks marked matte, etc. (none now: ex8-8 has -v2)
EXCLUDE = set()
best = {}
for f in folder.glob("*-v*.webp"):
    m = re.fullmatch(r"(ex\d+)-(.+)-v(\d+)\.webp", f.name)
    if not m or not (5 <= int(m.group(1)[2:]) <= 16):
        continue
    key = (m.group(1), m.group(2))
    if key in EXCLUDE:
        continue
    best[key] = max(best.get(key, 0), int(m.group(3)))
sets = collections.defaultdict(list)
for (s, n) in best:
    sets[s].append(n)
key = lambda n: (0, int(n)) if n.isdigit() else (1, n)
rows = "\n".join(f'    "{s}:{" ".join(sorted(sets[s], key=key))}",' for s in sorted(sets, key=lambda s: int(s[2:])))
vers = "\n".join(f'  "{s}-{n}": {v},' for (s, n), v in sorted(best.items()) if v != 1)
text = js.read_text()
text = re.sub(r"(// BEGIN-MAPPED[^\n]*\n).*?(    // END-MAPPED)", lambda m: m.group(1) + (rows + "\n" if rows else "") + m.group(2), text, flags=re.S)
text = re.sub(r"(  // BEGIN-VERSION\n).*?(  // END-VERSION)", lambda m: m.group(1) + (vers + "\n" if vers else "") + m.group(2), text, flags=re.S)
js.write_text(text)
print(f"{len(best)} maps in {len(sets)} sets:", {s: len(v) for s, v in sets.items()})
