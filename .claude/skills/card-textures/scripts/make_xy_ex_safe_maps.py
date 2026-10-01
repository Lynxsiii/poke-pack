#!/usr/bin/env python3
"""Median foil maps for XY Pokémon-EX, Mega EX and BREAK prints that have no TCG Live map.

TCG Live publishes a map for the numbered sets' EX, Mega EX and BREAK prints but not for most of
the promo reprints (XY black star promos filed under their home set with `foilAs`), so those fell
to the recipe with no mask and painted bars over the text box and the Pokémon. This writes one map
per frame (`ex`, `mega`, `break`): the pixel-wise median of every real map of that frame in
data/xy*.json (Rare Holo EX / Rare BREAK, not the full arts), so it is foil where nearly every
real map is (frame border, name tab, rule strips, energy burst corners) and matte where most are
(text box, the Pokémon's middle). Used by xyExSafeMap() in js/xy-foil.js.

    python3 .claude/skills/card-textures/scripts/make_xy_ex_safe_maps.py [--out assets/foil] [--version 1]

Never overwrites: refuses if a target exists (use --version 2).
"""
import argparse, glob, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


def frame_of(c):
    r = c.get("foilAs") or c.get("rarity")
    subs = [str(s).upper() for s in c.get("subtypes", [])]
    if r == "Rare BREAK":
        return "break"
    if r == "Rare Holo EX" and not c.get("rc"):
        return "mega" if ("MEGA" in subs or str(c.get("name", "")).startswith("M ")) else "ex"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets/foil")
    ap.add_argument("--version", default="1")
    a = ap.parse_args()
    groups = {"ex": [], "mega": [], "break": []}
    for f in sorted(glob.glob(os.path.join(ROOT, "data/xy*.json")) + [os.path.join(ROOT, "data/dc1.json")]):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if not isinstance(d, list):
            continue
        for c in d:
            if not isinstance(c, dict) or not c.get("foilMap") or c["id"].startswith("dc1"):
                continue
            g = frame_of(c)
            p = os.path.join(ROOT, c["foilMap"])
            if g and os.path.exists(p):
                groups[g].append(p)
    for g, paths in groups.items():
        if len(paths) < 5:
            print(g, "too few maps", len(paths)); continue
        arr = np.stack([np.asarray(Image.open(p).convert("RGBA").resize((367, 512)))[..., 3].astype(np.float32) for p in paths])
        med = np.median(arr, axis=0)
        im = Image.fromarray(med.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2))
        rgba = Image.merge("RGBA", (Image.new("L", im.size, 255),) * 3 + (im,))
        out = os.path.join(ROOT, a.out, f"xy-ex-safe-{g}-v{a.version}.webp")
        if os.path.exists(out):
            sys.exit(f"{out} exists; use --version")
        rgba.save(out, "WEBP", quality=90, method=6)
        print(g, len(paths), "maps ->", out, os.path.getsize(out), "bytes; mean alpha %.1f" % np.asarray(im).mean())


main()
