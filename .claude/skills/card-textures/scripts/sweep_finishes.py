#!/usr/bin/env python3
"""Render one card of every finish a set prints, at phone size, at rest and
lit, into one contact sheet per set: the check to run before merging any
change to a foil recipe or a shared sheet (reference/verify.md, "The sweep").

    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --set sv4pt5
    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --all
    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --set sv10 --poses rest,30:25,70:60 --w 300 --scale 2
    python3 .claude/skills/card-textures/scripts/sweep_finishes.py --all --stamped   # every stamped print (the stamp sweep)

Also lists every promo the site draws as a window holo that has no foil
map (it falls to the old window recipe, which clips through a stamp printed
in the art and streaks over it: Sprigatito svp191, 2026-09-28) and exits 1.
Also lists every etched full art (SIR, full-art Ultra Rare, gold) with no
etch map of its own (it shares the engraving tile with every other such
print, and no two real cards share a texture: Noah, 2026-09-28) and exits 1.
`--stamped` sheets every stamped print instead of one card per finish.
First checks every sheet in css/holo/ for a rule defined twice at the top
level (PR #55 pasted a stale copy of shiny-vault.css after the new rules,
and the later copy won, so the fix it shipped never showed); an identical
duplicate fails the run, a same-selector override is only listed. Then
picks one card per rarity, layout (evolution badge or not), supertype,
promo finish (`foilAs`) and variant, plus the first stamped print and one
reverse holo, so every recipe the set can reach is on the sheet. Renders
through scripts/foil_probe.mjs (Playwright, Chromium) at `--w` CSS px and
`--scale` device pixels per CSS px: the default 220 x 3 is a phone, which
is where the 2026-09-28 failures showed (op-art rings, flat full arts,
glitter speckle) and headless desktop size hid them. The default poses are
rest, the light from the top left (30:25) and a thumb low on the text box
(50:78), which is where a phone is held and where Murkrow's shiny went grey
and washed (2026-09-28). Sheets land in
`--out-dir` (default: <tmp>/foil-sweep/<set>-<n>.jpg, six cards a sheet).
Read every sheet.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PROBE = os.path.join(HERE, "foil_probe.mjs")


def has_evo(card):
    return any(s.startswith("Stage") for s in card.get("subtypes") or [])


HOLO_LOOKS = {"Rare", "Pikachu Rare", "Cosmos", "Metal", "Confetti", "Holo", "Holo Rare", "Rare Holo"}
STAMP_SUFFIXES = ("pc", "stamp", "stamped", "prerelease", "pokemon-day", "blister", "gamestop", "ebgames")


def hand_boxes():
    path = os.path.join(HERE, "stamp_boxes.json")
    if not os.path.exists(path):
        return set()
    with open(path) as f:
        return {k for k in json.load(f) if not k.startswith("_")}


def stamped(cards, boxes):
    """Every print that carries a stamp: an id with a stamp suffix, or a plain
    id with a hand box (a print whose only copy is the stamped one)."""
    out = []
    for c in cards:
        cid = str(c.get("id", ""))
        if cid in boxes or any(cid.endswith("-" + s) for s in STAMP_SUFFIXES):
            out.append(str(c.get("number")))
    return out


def check_promos(set_id, cards, boxes):
    """A promo the site draws as a window holo (foilClass() in js/app.js) with
    no foil map falls to the old window recipe, whose clip cuts through
    anything printed in the art and streaks over it (Sprigatito svp191, the
    Horizons promo, 2026-09-28). It needs a TCG Live map, or a hand box in
    stamp_boxes.json and a stamp_knockout.py run (which also draws the
    window-and-frame map)."""
    n = 0
    for c in cards:
        if not c.get("promo") or c.get("foilMap"):
            continue
        look = c.get("foilAs") or c.get("rarity")
        if look in HOLO_LOOKS:
            print(f"{set_id}: {c['id']} ({c.get('name')}, {look}) is a window holo promo with no foil map: "
                  f"old window recipe; give it a Live map or a hand box and run stamp_knockout.py")
            n += 1
    return n


ETCHED_LOOKS = {"Special Illustration Rare", "Ultra Rare", "Hyper Rare", "Mega Hyper Rare"}


def check_etched(set_id, cards):
    """Every etched full art (SIR, full-art Ultra Rare, gold) carries its own
    etch map: TCG Live's, or one drawn from the card's art by
    make_card_etch.py. A print left on the shared engraving tile shares its
    texture with every other tile print, and no two real cards do (Noah,
    2026-09-28: "I want every texture to be unique to each card")."""
    n = 0
    for c in cards:
        look = c.get("foilAs") or c.get("rarity")
        if look in ETCHED_LOOKS and c.get("image") and not c.get("etchMap"):
            print(f"{set_id}: {c['id']} ({c.get('name')}, {look}) has no etch map: shared tile; "
                  f"fetch Live's (fetch_foil_maps.py) or draw one (make_card_etch.py --set {set_id} --all --ship --write-data)")
            n += 1
    return n


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


def rules(path):
    """Top-level (selector, body, line) triples of a sheet, comments blanked."""
    raw = open(path).read()
    src = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group()), raw, flags=re.S)
    out, depth, last, sel, line = [], 0, 0, "", 0
    for m in re.finditer(r"[{}]", src):
        if m.group() == "{":
            if depth == 0:
                sel = " ".join(src[last:m.start()].split())
                line = src.count("\n", 0, m.start()) + 1
            depth += 1
        else:
            depth -= 1
            if depth == 0 and not sel.startswith("@"):
                out.append((sel, " ".join(src[last:m.start()].split()), line))
        last = m.end()
    return out


def check_sheets(holo_dir=os.path.join(ROOT, "css", "holo")):
    """A rule defined twice at the top level of one sheet: the later copy wins
    silently. Identical copies are a pasted stale block and fail; a second
    block under the same selector with other declarations is listed so the
    reader knows which one paints."""
    bad = 0
    for name in sorted(os.listdir(holo_dir)):
        if not name.endswith(".css"):
            continue
        path = os.path.join(holo_dir, name)
        by_sel = collections.defaultdict(list)
        for sel, body, line in rules(path):
            by_sel[sel].append((body, line))
        for sel, blocks in by_sel.items():
            if len(blocks) < 2:
                continue
            lines = ", ".join(str(b[1]) for b in blocks)
            if len({b[0] for b in blocks}) < len(blocks):
                print(f"css/holo/{name}: identical rule pasted twice (lines {lines}): {sel[:70]}")
                bad += 1
            else:
                print(f"css/holo/{name}: selector defined twice (lines {lines}), the later one wins: {sel[:70]}")
    return bad


def sweep(set_id, out_dir, poses, w, scale, per_row, only_stamped=False):
    cards = load(set_id)
    boxes = hand_boxes()
    rc = 1 if (check_promos(set_id, cards, boxes) + check_etched(set_id, cards)) else 0
    ids = stamped(cards, boxes) if only_stamped else pick(set_id, cards)
    if not ids:
        return rc
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
    ap.add_argument("--poses", default="rest,30:25,50:78",
                    help="lab poses (default rest,30:25,50:78: rest, light top left, thumb on the text box)")
    ap.add_argument("--check-only", action="store_true", help="only check the sheets for rules defined twice")
    ap.add_argument("--stamped", action="store_true",
                    help="sheet every stamped print instead of one card per finish (the stamp sweep)")
    ap.add_argument("--w", type=int, default=220, help="card width in CSS px (default 220, a phone)")
    ap.add_argument("--scale", type=int, default=3, help="device pixels per CSS px (default 3, a phone)")
    ap.add_argument("--per-row", type=int, default=6, help="cards per sheet (a set gets several sheets)")
    ap.add_argument("--out-dir", default=os.path.join(tempfile.gettempdir(), "foil-sweep"))
    a = ap.parse_args()
    dup = check_sheets()
    if dup:
        print(f"{dup} rule(s) pasted twice: delete the stale copy before sweeping")
        return 1
    if a.check_only:
        return 0
    sets = a.set
    if a.all:
        sets = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, "data"))
                      if f.endswith(".json") and os.path.exists(os.path.join(ROOT, "data", f)) and f[:-5] not in ("products", "prices"))
        sets = [s for s in sets if isinstance(load(s), list) and any(c.get("rarity") for c in load(s))]
    if not sets:
        ap.error("give --set <id>, --all or --check-only")
    os.makedirs(a.out_dir, exist_ok=True)
    rc = 0
    for s in sets:
        rc |= sweep(s, a.out_dir, a.poses, a.w, a.scale, a.per_row, a.stamped)
    return rc


if __name__ == "__main__":
    sys.exit(main())
