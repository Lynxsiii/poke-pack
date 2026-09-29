#!/usr/bin/env python3
"""Ship TCG Live's etch map at its native size as a luminance texture.

The site's `<n>-etch.webp` maps are 400 px wide and used as masks. A recipe
that draws the etch as an image (Shining Fates' Shiny Vault, `sf-shiny` in
css/holo/shiny-vault.css, a port of pokemon-cards-css's shiny rare) needs
the rings sharp, at the 733 x 1024 TCG Live publishes, with their dark
ground: soft-lit over the foil, only the rings then catch the colour dodge.

    python3 .claude/skills/card-textures/scripts/make_etch_hd.py --set sv4pt5 --cards 92,93
    python3 .claude/skills/card-textures/scripts/make_etch_hd.py --set sv4pt5 --rarity "Shiny Rare,Shiny Ultra Rare" --write-data

Reads lab/cache/<set>/<n>.etch.png (fetch_foil_maps.py fills the cache),
stretches TCG Live's floor (22/255, its "not etched") to black, and writes
assets/foil/maps/<set>/<n>-etch-hd.webp (RGB luminance, WEBP q80). It never
overwrites an existing file: /assets/* is cached immutable for a year, so a
changed texture gets a new name (`--suffix -hd-v2`). --write-data sets
`etchHd` on each card in data/<set>.json (js/foil-maps.js turns it into
`--etch-hd` and `has-etch-hd`).
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent.parent
CACHE = HERE.parent / "lab" / "cache"
FLOOR = 22  # TCG Live's "not etched" grey
WIDTH = 733


def convert(src: Path, dst: Path) -> tuple[int, int]:
    im = Image.open(src).convert("L")
    if im.width != WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    a = np.clip((a - FLOOR) / (255 - FLOOR), 0, 1) * 255
    out = Image.fromarray(a.round().astype(np.uint8)).convert("RGB")
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "WEBP", quality=80, method=6)
    return out.size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", default="", help="comma list of card numbers")
    ap.add_argument("--rarity", default="", help="comma list of rarities (matched against rarity, then foilAs)")
    ap.add_argument("--suffix", default="-etch-hd", help="filename suffix (default -etch-hd; use -etch-hd-v2 for a redraw)")
    ap.add_argument("--write-data", action="store_true", help="set etchHd on the cards in data/<set>.json")
    args = ap.parse_args()

    data_path = ROOT / "data" / f"{args.set}.json"
    with open(data_path) as f:
        data = json.load(f)
    cards = data if isinstance(data, list) else data["cards"]
    wanted = {c.strip() for c in args.cards.split(",") if c.strip()}
    rarities = {r.strip() for r in args.rarity.split(",") if r.strip()}
    picks = [c for c in cards if str(c["number"]) in wanted or (c.get("foilAs") or c.get("rarity")) in rarities]
    if not picks:
        sys.exit("no cards picked: give --cards or --rarity")

    made = skipped = missing = 0
    for c in picks:
        n = str(c["number"])
        src = CACHE / args.set / f"{n}.etch.png"
        # A stamped print (svp072-stamp) has no map of its own: TCG Live's
        # map is the plain print's, and its stamp only lives in the foil
        # map. Its etch is the base print's file.
        if not src.exists() and "-" in n and (CACHE / args.set / f"{n.split('-')[0]}.etch.png").exists():
            n = n.split("-")[0]
            src = CACHE / args.set / f"{n}.etch.png"
        rel = f"assets/foil/maps/{args.set}/{n}{args.suffix}.webp"
        dst = ROOT / rel
        if not src.exists():
            print(f"{n}: no cached etch ({src.relative_to(ROOT)}); run fetch_foil_maps.py first")
            missing += 1
            continue
        if dst.exists():
            skipped += 1
        else:
            w, h = convert(src, dst)
            print(f"{n}: {rel} {w}x{h} {dst.stat().st_size // 1024} KB")
            made += 1
        if args.write_data and c.get("etchHd") != rel:
            items = list(c.items())
            c.clear()
            for k, v in items:
                if k == "etchHd":
                    continue
                c[k] = v
                if k == "etchMap":
                    c["etchHd"] = rel
            if "etchHd" not in c:
                c["etchHd"] = rel
    if args.write_data:
        with open(data_path, "w") as f:
            f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"made {made}, kept {skipped} existing (never overwritten), missing {missing}")
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
