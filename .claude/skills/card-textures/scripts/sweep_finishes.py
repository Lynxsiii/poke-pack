#!/usr/bin/env python3
"""Render one card of every finish a set prints, at phone size, at rest and
lit, into one contact sheet per set: the check to run before merging any
change to a foil recipe or a shared sheet (reference/verify.md, "The sweep").

    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --set sv4pt5
    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --all
    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --set sv10 --poses rest,30:25,70:60 --w 300 --scale 2

Picks one card per rarity, layout (evolution badge or not), supertype,
promo finish (`foilAs`) and variant, plus the first stamped print and one
reverse holo, so every recipe the set can reach is on the sheet. Renders
through scripts/foil_probe.mjs (Playwright, Chromium) at `--w` CSS px and
`--scale` device pixels per CSS px: the default 220 x 3 is a phone, which
is where the 2026-09-28 failures showed (op-art rings, flat full arts,
glitter speckle) and headless desktop size hid them. Sheets land in
`--out-dir` (default: <tmp>/foil-sweep/<set>-<n>.jpg, six cards a sheet).
Read every sheet.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PROBE = os.path.join(HERE, "foil_probe.mjs")


def has_evo(card):
    return any(s.startswith("Stage") for s in card.get("subtypes") or [])


def pick(set_id, cards):
    """One card per recipe the set can reach: rarity (with variant and
    special stock), promo finish, the first stamped print, one reverse."""
    seen, out = set(), []
    copies = [c for c in cards if "-" in str(c.get("id", ""))[len(set_id) + 1:]]
    for c in cards:
        if c.get("reverse") or c in copies:
            continue
        key = (("promo", c.get("foilAs")) if c.get("promo")
               else (c.get("rarity"), c.get("variant"), c.get("finish")))
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    if copies:
        out.append(copies[0])
    ids = [str(c["id"])[len(set_id) + 1:] for c in out]
    common = next((c for c in cards if c.get("rarity") == "Common"), None)
    if common:
        ids.append(f"r{common['number']}")
    return ids


def load(set_id):
    path = os.path.join(ROOT, "data", f"{set_id}.json")
    with open(path) as f:
        d = json.load(f)
    return d.get("cards", d) if isinstance(d, dict) else d


def sweep(set_id, out_dir, poses, w, scale, per_row):
    cards = load(set_id)
    ids = pick(set_id, cards)
    rc = 0
    sheets = [ids[i:i + per_row] for i in range(0, len(ids), per_row)]
    for n, chunk in enumerate(sheets, 1):
        png = os.path.join(out_dir, f"{set_id}-{n}.png")
        query = f"set={set_id}&cards={','.join(chunk)}&proof=off&maps=1&w={w}&poses={poses}"
        width = len(chunk) * (w + 40) + 60
        cmd = ["node", PROBE, "--query", query, "--out", png, "--width", str(width), "--scale", str(scale)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            print(f"{set_id} sheet {n}: probe failed\n{r.stderr.strip()[-400:]}")
            rc = 1
            continue
        out = png[:-4] + ".jpg"
        try:
            from PIL import Image
            Image.open(png).convert("RGB").save(out, "JPEG", quality=88)
            os.remove(png)
        except ImportError:
            out = png
        print(f"{set_id} sheet {n}/{len(sheets)}: {', '.join(chunk)} -> {out}")
    return rc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", action="append", default=[], help="set id (data/<set>.json); repeatable")
    ap.add_argument("--all", action="store_true", help="every set in data/")
    ap.add_argument("--poses", default="rest,30:25", help="lab poses (default rest,30:25)")
    ap.add_argument("--w", type=int, default=220, help="card width in CSS px (default 220, a phone)")
    ap.add_argument("--scale", type=int, default=3, help="device pixels per CSS px (default 3, a phone)")
    ap.add_argument("--per-row", type=int, default=6, help="cards per sheet (a set gets several sheets)")
    ap.add_argument("--out-dir", default=os.path.join(tempfile.gettempdir(), "foil-sweep"))
    a = ap.parse_args()
    sets = a.set
    if a.all:
        sets = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, "data"))
                      if f.endswith(".json") and os.path.exists(os.path.join(ROOT, "data", f)) and f[:-5] not in ("products", "prices"))
        sets = [s for s in sets if isinstance(load(s), list) and any(c.get("rarity") for c in load(s))]
    if not sets:
        ap.error("give --set <id> or --all")
    os.makedirs(a.out_dir, exist_ok=True)
    rc = 0
    for s in sets:
        rc |= sweep(s, a.out_dir, a.poses, a.w, a.scale, a.per_row)
    return rc


if __name__ == "__main__":
    sys.exit(main())
