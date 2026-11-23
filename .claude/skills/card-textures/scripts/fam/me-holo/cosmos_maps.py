#!/usr/bin/env python3
"""Pixel cosmos maps for the me-holo family (meh-cosmos): cut the Pokemon out of the drawn window maps.

The era's drawn cosmos maps (scripts/cosmos_window_maps.py, stamp_knockout.py) hold the whole art window at alpha 130,
the Pokemon included; on the real prints the Pokemon is matte ink (audit w2-me-cosmos). Where the same card exists as a
plain holo Rare with TCG Live's foil map (same layout: the set number, or meg/pfl/asc/por/jtg/dri for a reprint from
another set), the new map is min(drawn, Live): the drawn map keeps its border and its stamp cut, Live's map takes the
Pokemon out of the window. Where the drawn window is empty (an owner-badge cut that wiped it), Live's map is used as is;
with no Live map either (Erika's Tangela, Team Rocket's Mimikyu), the window comes back as the ME frame's drawn window
(Kyogre 034's) with the owner badge, the only thing the broken map still holds there, cut out.
A print with no Live map at all (the Commons and Uncommons: Ralts, Oddish, Gastly ...) has no cut for its Pokemon, so its
window is held at UNCUT (about half the drawn 130) until someone draws one: the Pokemon then takes the specks faintly.
The MEP promos are skipped (their map is TCG Live's own), and so is Pikachu tef051 (its map is another card's).

Run from the repo root: python3 .claude/skills/card-textures/scripts/fam/me-holo/cosmos_maps.py
Writes assets/foil/fam/me-holo/cosmos/<set>-<number>.webp and prints the JS table for js/fam/me-holo.js (COSMOS_MAPS).
"""
import json, os, re
import numpy as np
from PIL import Image, ImageFilter

OUT = "assets/foil/fam/me-holo/cosmos"
PREFIX = {"meg": "me1", "pfl": "me2", "asc": "me2pt5", "por": "me3", "jtg": "sv9", "dri": "sv10"}
SETS = ["me1", "me2", "me2pt5", "me3", "me4", "me5"]
cache = {}


def cards(s):
    if s not in cache:
        p = f"data/{s}.json"
        j = json.load(open(p)) if os.path.exists(p) else []
        cache[s] = j if isinstance(j, list) else j.get("cards", [])
    return cache[s]


def plain_map(s, card):
    m = re.match(r"([a-z]{3})(\d+)-cosmos$", card["number"])
    if m:
        ps, num = PREFIX.get(m.group(1)), str(int(m.group(2)))
        hit = [c for c in cards(ps) if c.get("number") == num] if ps else []
    else:
        base = re.sub(r"-(cosmos|stamp|ebgames|gamestop)$", "", card["number"])
        if base == card["number"]:
            return None
        hit = [c for c in cards(s) if c.get("number") == base]
    if hit and hit[0].get("foilMap") and hit[0].get("rarity") == "Rare":
        return hit[0]["foilMap"]
    return None


def alpha(p, size=None):
    im = Image.open(p).convert("RGBA")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im.getchannel("A")).astype(np.float32)


WINDOW_FROM = "assets/foil/maps/me1/34-cosmos-v2.webp"
UNCUT = 70
SKIP = {"me2-tef051-stamp"}


def main():
    os.makedirs(OUT, exist_ok=True)
    table = {}
    ref = alpha(WINDOW_FROM)
    window = (ref > 100) & (ref < 160)
    for s in SETS:
        for c in cards(s):
            if c.get("foilAs") != "Cosmos" or not c.get("foilMap") or c["id"] in SKIP:
                continue
            if re.match(r"mep\d", c["number"]):
                continue
            live = plain_map(s, c)
            d = alpha(c["foilMap"])
            h, w = d.shape
            broken = d[int(h * 0.12):int(h * 0.5), int(w * 0.1):int(w * 0.9)].mean() < 10
            if live:
                l = alpha(live, (w, h))
                new = l if broken else np.minimum(d, l)
            elif broken and d.shape == ref.shape:
                badge = Image.fromarray(((d > 8) & window).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
                new = np.where(window & (np.asarray(badge) == 0), float(UNCUT), d)
            else:
                # the drawn window (alpha 130 over the art) held at UNCUT; the border (255) and the cuts (0) as drawn
                new = np.where((d > 100) & (d < 160), d * UNCUT / 130.0, d)
            name = f"{OUT}/{s}-{c['number']}.webp"
            rgba = np.zeros((h, w, 4), np.uint8)
            rgba[..., :3] = 255
            rgba[..., 3] = new.clip(0, 255).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(name, lossless=True)
            table[c["id"]] = f"{s}-{c['number']}.webp"
    print("const COSMOS_MAPS = " + json.dumps(table, indent=2) + ";")
    print(len(table), "maps")


main()
