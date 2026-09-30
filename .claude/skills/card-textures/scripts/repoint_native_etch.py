#!/usr/bin/env python3
"""Point cards at their already-shipped native etch (`<n>-etch-v4.webp`).

native_era_etch.py needs TCG Live's raw maps in lab/cache to (re)write a
file; when the -etch-v4 files are already committed (Sun & Moon's full-art
family shipped them from a worktree that had the cache) this only repoints
`etchMap` in data/<set>.json, for every card whose v4 file exists.

    python3 .claude/skills/card-textures/scripts/repoint_native_etch.py sm1 sm2 ...
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
for s in sys.argv[1:]:
    p = ROOT / "data" / f"{s}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    recs = data if isinstance(data, list) else data["cards"]
    n = 0
    for c in recs:
        cur = c.get("etchMap")
        if not cur or cur.endswith("-etch-v4.webp"):
            continue
        new = f"assets/foil/maps/{s}/{c['number']}-etch-v4.webp"
        if (ROOT / new).exists():
            c["etchMap"] = new
            n += 1
    if n:
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{s}: {n} repointed")
