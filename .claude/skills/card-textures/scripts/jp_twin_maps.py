#!/usr/bin/env python3
"""Give a Japanese print the English twin's TCG Live maps when the art is the same, from ANY English set.

scripts/build_jp_set.py copies maps from one `englishTwin` set (151 for jsv2a). The Japanese high-class and special
sets reprint art from many English sets (Shiny Treasure ex's Double Rares are Paldea Evolved's and Obsidian Flames';
Terastal Festival's are Temporal Forces' and Twilight Masquerade's), so those prints had no map at all and fell to the
old no-map recipes: a flat wash, no texture (Noah, 2026-11-27: the Japanese cards "feel so weak with the texture").

For every Japanese face of a mapped finish with no foilMap, this looks for English cards of the same name and rarity
in every English set of the same era, compares the art (the scans' top 55%, grey, 96 px wide, normalised
cross-correlation; the frame and text differ between the languages, the painting does not) and takes the best match
over --min-corr. It copies foilMap, etchMap (Live's only: a drawn English etch belongs to the English scan) and sets
foilTwin. Full arts are not touched: their Japanese text sits elsewhere, so an English etch would ghost English text;
they take a drawn etch of their own (make_card_etch.py).

    python3 jp_twin_maps.py            # report
    python3 jp_twin_maps.py --write    # and write data/<jp set>.json
"""
import argparse
import glob
import json
import os
import re

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
MAPPED = {"Double Rare", "Shiny Rare", "Shiny Ultra Rare", "ACE SPEC Rare", "Rare", "Rare Holo", "Rare Prism Star",
          "Illustration Rare", "Rare Holo GX", "Rare Holo V", "Radiant Rare"}
ERA_SETS = {"sv": r"^(sv\d|sv\d+pt5|svp)", "sm": r"^(sm\d|smp)", "swsh": r"^(swsh|cel25|pgo)"}


def art(path):
    im = Image.open(os.path.join(ROOT, path)).convert("L")
    w, h = im.size
    im = im.crop((int(w * .06), int(h * .09), int(w * .94), int(h * .55))).resize((96, 64), Image.BILINEAR)
    a = np.asarray(im, np.float32)
    return (a - a.mean()) / (a.std() + 1e-3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--min-corr", type=float, default=0.55)
    a = ap.parse_args()
    english = {}
    for p in glob.glob(os.path.join(ROOT, "data", "*.json")):
        s = os.path.basename(p)[:-5]
        if s.startswith("j") or s in ("pullrates", "products", "patch-notes"):
            continue
        try:
            d = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(d, list) and d and isinstance(d[0], dict) and "rarity" in d[0]:
            english[s] = d
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "j*.json"))):
        s = os.path.basename(p)[:-5]
        cfg_p = os.path.join(ROOT, "data", "sets", f"{s}.json")
        if not os.path.exists(cfg_p):
            continue
        era = json.load(open(cfg_p, encoding="utf-8")).get("era") or "sv"
        pat = re.compile(ERA_SETS.get(era, r"^$"))
        cards = json.load(open(p, encoding="utf-8"))
        changed = 0
        for c in cards:
            if c.get("foilMap") or c.get("rarity") not in MAPPED or not c.get("image") or c.get("pattern"):
                continue
            mine = art(c["image"])
            best = None
            for es, ecards in english.items():
                if not pat.match(es):
                    continue
                for e in ecards:
                    if e.get("name") != c.get("name") or not e.get("foilMap") or not e.get("image"):
                        continue
                    if e.get("rarity") != c.get("rarity") and not (c["rarity"].startswith("Shiny") and e.get("rarity") == "Promo"):
                        continue
                    try:
                        corr = float((mine * art(e["image"])).mean())
                    except OSError:
                        continue
                    if not best or corr > best[0]:
                        best = (corr, e)
            if not best:
                print(f"  {c['id']:14} {c['name']:24} {c['rarity']:18} no English card of that name with a map")
                continue
            corr, e = best
            ok = corr >= a.min_corr
            print(f"{'ok' if ok else '  '} {c['id']:14} {c['name']:24} {c['rarity']:18} <- {e['id']:14} art corr {corr:.2f}")
            if ok and a.write:
                c["foilMap"] = e["foilMap"]
                if e.get("etchMap") and not e.get("etchDrawn"):
                    c["etchMap"] = e["etchMap"]
                c["foilTwin"] = e["id"]
                changed += 1
        if changed:
            with open(p, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(cards, ensure_ascii=False, indent=2) + "\n")
            print(f"{s}: {changed} prints now wear their English twin's maps")


if __name__ == "__main__":
    main()
