#!/usr/bin/env python3
"""Window-only fallback foil map for Sun & Moon Rare Holo Pokémon that have no
TCG Live map of their own (the holo reprints: sm1-101a, sm2-21a, sm4-84a, the
Detective Pikachu holos; `foilAs: "Rare Holo"`).

Every TCG Live holo map of the era foils the art window only (frame, text box
and name bar black) and knocks the Pokémon's silhouette out. The per-pixel
median of the shipped maps is a window with a typical Pokémon matte: the
window's edge band and its corners stay foil, the centre where most Pokémon
stand stays print. Without it the window holo paints over the whole card.

    python3 .claude/skills/card-textures/scripts/make_sm_window_map.py

Writes assets/foil/maps/sm-holo-safe.webp (new file: assets are immutable-cached,
never overwrite). js/sm-foil.js smSafeMap() hands it to a window holo with no
foilMap.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SIZE = (367, 512)
NAME = "sm-holo-safe.webp"


def main() -> None:
    maps = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "sm*.json"))) + [os.path.join(ROOT, "data", "det1.json")]:
        if not os.path.exists(f):
            continue
        data = json.load(open(f, encoding="utf-8"))
        for c in data["cards"] if isinstance(data, dict) else data:
            path = c.get("foilMap")
            if (c.get("rarity") == "Rare Holo" and c.get("supertype") == "Pokémon" and not c.get("gallery") and path
                    and os.path.exists(os.path.join(ROOT, path))):
                im = Image.open(os.path.join(ROOT, path)).convert("RGBA")
                if im.size != SIZE:
                    im = im.resize(SIZE, Image.LANCZOS)
                maps.append(np.asarray(im)[..., 3].astype(np.float32) / 255)
    if len(maps) < 10:
        sys.exit(f"only {len(maps)} maps found")
    med = np.median(np.array(maps), 0)
    # The Ultra Beast banner (and its text) sits at the window's top right on some prints; keep that corner print.
    med[46:84, 200:345] = 0
    # Soften the silhouette edge, so a Pokémon bigger than the median loses foil gradually.
    med = np.asarray(Image.fromarray((med * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
    img = np.zeros((SIZE[1], SIZE[0], 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = np.round(med * 255).astype(np.uint8)
    dest = os.path.join(ROOT, "assets", "foil", "maps", NAME)
    if os.path.exists(dest) and "--force" not in sys.argv:
        sys.exit(f"{dest} exists: assets are immutable, pick a new name")
    Image.fromarray(img, "RGBA").save(dest, "WEBP", quality=85, alpha_quality=90, method=6)
    print(NAME, len(maps), "maps,", os.path.getsize(dest), "bytes")


if __name__ == "__main__":
    main()
