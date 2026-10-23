"""Full-strength copies of the foil maps of the bw-tinsel-holo family's Tinsel, Dragon Vault, Cosmos and Mirror faces.

Why: TCG Live's per-card maps (assets/foil/maps/<set>/<n>.webp) are not binary. Where the art is inked they come out
at part alpha, and how much varies from card to card: Dragonite bw9-83 is a flat 0.61 over the whole sky, Blastoise
bw10-16 0.63 over a fifth of the window, Venusaur bw5-3 and Garchomp bw6-90 hold their cliffs and temple at about 0.5,
Blissey bw5-82 at 0.14. The real cards are foiled at full strength over the whole background (the in-hand photos of
Dragonite 83/116, Blastoise 16/101, Venusaur 3/101 and the Japanese Garchomp: 2026-10-22 audit), so the foil drew at
half strength or less exactly where the photos show it plainly. These copies keep where the foil is and drop how
strong: alpha' = smoothstep(LO, HI, alpha), so every foil pixel goes to full and "not foil" stays 0. Blastoise also
gets a small closing (its map has a hole at every spray drop, which the photo does not show), and the Trainer Kit
Zoroark bwtk5a-30 a small erosion (its drawn map leaks onto the paw and the tail tip).

The module (js/fam/bw-tinsel-holo.js) points a face at its copy by name: assets/foil/maps/<path>.webp becomes
assets/foil/fam/bw-tinsel-holo/maps/<path>-v1.webp. A changed copy needs a new -vN name (assets are cached for a year)
and the module's MAP_V bumped.

    ROOT=. node /home/user/holo-tools/census.mjs > /tmp/census.json   # or any JSON list of {id, family, classes}
    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_maps.py --census /tmp/census.json [--force]
    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_maps.py --census /tmp/census.json --check
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import grey_closing, grey_erosion

ROOT = Path(__file__).resolve().parents[6]
SRC = "assets/foil/maps/"
DST = "assets/foil/fam/bw-tinsel-holo/maps/"
V = "v1"
LO, HI = 0.04, 0.40
FINISHES = ("bwt-tinsel", "bwt-vault", "bwt-cosmos", "bwt-mirror")
CLOSE = {"bw10-16": 5}  # card id -> closing size in map px (367 x 512 maps)
ERODE = {"bwtk5a-30": 3}  # card id -> erosion size: the drawn GrabCut map of Zoroark's Trainer Kit print leaks onto its paw


def target(foil_map: str) -> str:
    return DST + foil_map[len(SRC):].removesuffix(".webp") + f"-{V}.webp"


def data_maps() -> dict[str, str]:
    out = {}
    for f in glob.glob(str(ROOT / "data" / "*.json")):
        try:
            j = json.load(open(f))
        except Exception:
            continue
        cards = j.get("cards") if isinstance(j, dict) else j
        if not isinstance(cards, list):
            continue
        for c in cards:
            if isinstance(c, dict) and c.get("id") and c.get("foilMap"):
                out[c["id"]] = c["foilMap"]
    return out


def normalise(path: Path, close: int, erode: int) -> Image.Image:
    im = np.asarray(Image.open(path).convert("RGBA")).astype(float) / 255
    a = im[..., 3]
    if close:
        a = grey_closing(a, size=(close, close))
    if erode:
        a = grey_erosion(a, size=(erode, erode))
    t = np.clip((a - LO) / (HI - LO), 0, 1)
    a2 = t * t * (3 - 2 * t)
    rgba = np.dstack([np.ones_like(a2)] * 3 + [a2])
    return Image.fromarray(np.uint8(np.clip(rgba, 0, 1) * 255 + 0.5), "RGBA")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--census", required=True)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--check", action="store_true", help="only report faces whose copy is missing")
    args = ap.parse_args()
    faces = [r for r in json.load(open(args.census))
             if r.get("family") == "bw-tinsel-holo" and any(f in r.get("classes", "").split() for f in FINISHES)]
    maps = data_maps()
    missing, wrote, kept, skipped = [], 0, 0, 0
    for r in faces:
        m = maps.get(r["id"])
        if not m or not m.startswith(SRC):
            skipped += 1
            continue
        out = ROOT / target(m)
        if args.check:
            if not out.exists():
                missing.append(r["id"])
            continue
        if out.exists() and not args.force:
            kept += 1
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        normalise(ROOT / m, CLOSE.get(r["id"], 0), ERODE.get(r["id"], 0)).save(out, "WEBP", lossless=True, method=6)
        wrote += 1
    if args.check:
        print("missing:", " ".join(missing) or "none")
        sys.exit(1 if missing else 0)
    print(f"faces {len(faces)}: wrote {wrote}, kept {kept}, no Live map {skipped}")


if __name__ == "__main__":
    main()
