#!/usr/bin/env python3
"""Text-safe fallback foil maps for Sun & Moon GX and Prism Star prints that
have no TCG Live map of their own (alternate-art promos: sm35-10a, sm4-63a,
sm5-10a).

The maps of one layout share their text boxes, frame and (for Prism Star) the
window, strip and diamond; only the Pokémon's silhouette moves. The median of
every shipped map of the layout is therefore a map that keeps the rules text
and a typical Pokémon matte and foils the rest: GX and Prism Star Pokémon
(TAG TEAM, full art, shiny and Trainer / Energy layouts are excluded).
Soft where the maps disagree, so a Pokémon that is bigger than the median only
loses a little foil at its edge.

    python3 .claude/skills/card-textures/scripts/make_sm_safe_maps.py

Writes assets/foil/maps/sm-gx-safe.webp and sm-prism-safe.webp (new files:
assets are immutable-cached; bump the name, never overwrite). js/sm-foil.js
smSafeMap() hands them to a card with no foilMap.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SIZE = (367, 512)


def stack(pred):
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "sm*.json"))):
        data = json.load(open(f, encoding="utf-8"))
        for c in data["cards"] if isinstance(data, dict) else data:
            path = c.get("foilMap")
            if pred(c) and path and os.path.exists(os.path.join(ROOT, path)):
                im = Image.open(os.path.join(ROOT, path)).convert("RGBA")
                if im.size != SIZE:
                    im = im.resize(SIZE, Image.LANCZOS)
                out.append(np.asarray(im)[..., 3].astype(np.float32) / 255)
    return np.array(out)


def save(name, maps):
    med = np.median(maps, 0)
    img = np.zeros((SIZE[1], SIZE[0], 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = np.round(med * 255).astype(np.uint8)
    dest = os.path.join(ROOT, "assets", "foil", "maps", name)
    if os.path.exists(dest) and "--force" not in sys.argv:
        sys.exit(f"{dest} exists: assets are immutable, pick a new name")
    Image.fromarray(img, "RGBA").save(dest, "WEBP", quality=85, alpha_quality=90, method=6)
    print(name, len(maps), "maps,", os.path.getsize(dest), "bytes")


def tag(c):
    return "TAG TEAM" in [str(s).upper() for s in c.get("subtypes", [])]


save("sm-gx-safe.webp", stack(lambda c: c.get("rarity") == "Rare Holo GX" and not tag(c) and c.get("supertype") == "Pokémon"
                              and not c.get("foilAs") and c.get("gallery") != "sv"))
save("sm-prism-safe.webp", stack(lambda c: c.get("rarity") == "Rare Prism Star" and c.get("supertype") == "Pokémon"))
