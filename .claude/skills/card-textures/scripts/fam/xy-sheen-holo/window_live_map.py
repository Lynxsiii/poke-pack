#!/usr/bin/env python3
"""xy-sheen-holo: a Sheen print's TCG Live foil map, cut to the art window, for a promo whose Live map another family ships.

TCG Live's map for some black-star promos also marks the evolution circle, the Stage label and the Energy symbols as foil, and
holds the art background at full strength; the Live maps the set holos carry (assets/foil/maps/<set>/) have those icons at
nothing and the background at a median of about 0.8. The Sheen recipe on those icons reads as a pink Litleo, so this keeps
Live's own cut-out of the Pokemon and its background, cut to the era's art window (assets/foil/xy-win/pokemon-evo.webp for a
card with the evolution circle, else pokemon.webp), scaled to the set holos' level.

    python3 window_live_map.py xy2-xyp026
Writes assets/foil/fam/xy-sheen-holo/<id>-map-v1.webp (600 x 838, white, alpha = the map). New files only.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = "/home/user/poke-pack"
SRC = {"xy2-xyp026": "assets/foil/fam/xy-ex-mega/xy2-xyp026-map.webp"}  # shipped by xy-ex-mega (ship_promo_maps.py), read-only
LEVEL = 0.82
W, H = 600, 838


def card(cid):
    for f in os.listdir(f"{ROOT}/data"):
        if f.endswith(".json"):
            d = json.load(open(f"{ROOT}/data/{f}"))
            for c in (d if isinstance(d, list) else d.get("cards", [])):
                if c.get("id") == cid:
                    return c
    raise SystemExit(f"no card {cid}")


def main():
    for cid in sys.argv[1:] or list(SRC):
        c = card(cid)
        circle = "Stage 1" in (c.get("subtypes") or []) or "Stage 2" in (c.get("subtypes") or []) or bool(c.get("evolvesFrom"))
        win = Image.open(f"{ROOT}/assets/foil/xy-win/{'pokemon-evo' if circle else 'pokemon'}.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
        live = Image.open(f"{ROOT}/{SRC[cid]}").convert("RGBA").resize((W, H), Image.LANCZOS)
        a = np.asarray(live)[..., 3].astype(np.float32) / 255 * np.asarray(win)[..., 3].astype(np.float32) / 255 * LEVEL
        out = f"{ROOT}/assets/foil/fam/xy-sheen-holo/{cid}-map-v1.webp"
        if os.path.exists(out):
            raise SystemExit(f"{out} exists: write a new -vN name")
        al = (a * 255).round().clip(0, 255).astype(np.uint8)
        w = np.full_like(al, 255)
        Image.fromarray(np.dstack([w, w, w, al]), "RGBA").save(out, "WEBP", quality=90, alpha_quality=90, method=6)
        print(cid, "->", out, f"median window alpha {np.median(al[al > 30]):.0f}")


if __name__ == "__main__":
    main()
