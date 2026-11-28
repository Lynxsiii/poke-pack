#!/usr/bin/env python3
"""Draw the sv-shiny family's per-card foil maps: TCG Live's map with the Pokémon cut out.

A Paldean Fates / Shiny Treasure ex shiny is a silver sheet engraved with fingerprint whorls, and the Pokémon is
printed on it in colour ink: lit, the silver flashes and the Pokémon keeps its ink (photos: Pikachu 131, Gardevoir ex
217 in paldean-fates/texture-refs). Live's foil map is 1.0 on the bare silver and 0.6-0.75 under the Pokémon's ink
(measured on all 149 English prints: the mode is 1.0 on every one), and every layer masked by it painted the
Pokémon at that strength: grey silver multiplied over it, the glitter, the spectrum, the band (the per-card review
of 2026-11-28: "brown foil texture on black fur", "Pokemon greyed/dimmed by silver foil", "red glitter in mouths").

The cut comes from the map and the scan, no hand masks:
- the map: alpha x smoothstep(LO, HI, alpha), so bare silver stays and anything under ink leaves;
- the scan: on a Shiny Ultra Rare the map climbs back to 0.9-1.0 over the Pokémon's highlights (Clodsire ex 219's
  back took the band as a brown patch), but the scan prints bare silver as white paper and the Pokémon in colour. A
  coloured or dark pixel well under the card's own bare-silver tone (the 85th percentile of the scan where the map is 1) is ink. Skipped when the
  scan has no such white (the stamped promos' images are photos of the foil card).
A thin rim (one pixel) is taken off round the cut so the Pokémon's outline is not haloed.

    assets/foil/fam/sv-shiny/<set>/<n>-foil-v1.webp   replaces --foil-map on the face (js/fam/sv-shiny.js)

    python3 .claude/skills/card-textures/scripts/fam/sv-shiny/make_shiny_masks.py            # every claimed face
    python3 .claude/skills/card-textures/scripts/fam/sv-shiny/make_shiny_masks.py --ids sv4pt5-136 --preview /tmp/p

Never overwrites a file that exists (assets are cached immutable): a redraw needs a new --version.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "sv-shiny"
SV_ID = re.compile(r"^(?:[zrj]?sv\d|svp-)")
RARE = {"Shiny Rare", "Shiny Ultra Rare"}


def faces():
    """Every SV shiny face in the data: (id, foil map path)."""
    for f in sorted((ROOT / "data").glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        cards = d if isinstance(d, list) else d.get("cards", []) if isinstance(d, dict) else []
        for c in cards:
            if not isinstance(c, dict) or not c.get("id"):
                continue
            if (c.get("foilAs") or c.get("rarity")) not in RARE or not SV_ID.match(str(c["id"])):
                continue
            if not c.get("foilMap"):
                continue
            yield c["id"], ROOT / c["foilMap"], ROOT / c["image"]


LO, HI = 0.84, 0.97


def build(foil_path, scan_path):
    fim = Image.open(foil_path).convert("RGBA").split()[3]
    f = np.asarray(fim).astype(np.float32) / 255
    t = np.clip((f - LO) / (HI - LO), 0, 1)
    keep = t * t * (3 - 2 * t)
    scan = np.asarray(Image.open(scan_path).convert("RGB").resize(fim.size, Image.LANCZOS)).astype(np.float32) / 255
    low = scan.min(axis=2)
    bare = f >= 0.985
    if bare.sum() > 200:
        # the 85th percentile, not the median: on some prints most of the map's 1.0 is the Pokémon itself
        tone = float(np.percentile(low[bare], 85))
        if tone > 0.8:
            u = np.clip((low - (tone - 0.24)) / 0.14, 0, 1)
            u = u * u * (3 - 2 * u)
            # the frame of a Shiny Ultra Rare scans as a neutral mid grey and is bare silver: only coloured or dark
            # pixels count as ink
            high = scan.max(axis=2)
            ink = np.maximum(np.clip((high - low - 0.05) / 0.06, 0, 1), np.clip((0.5 - high) / 0.1, 0, 1))
            keep *= 1 - (1 - u) * ink
    # a pixel off the cut's rim, then half a pixel of blur: no halo round the outline
    keep = ndimage.gaussian_filter(ndimage.grey_erosion(keep, size=(3, 3)), 0.6)
    return f * keep


def webp(a):
    a8 = (np.clip(a, 0, 1) * 255).round().astype(np.uint8)
    white = np.full_like(a8, 255)
    return Image.fromarray(np.dstack([white, white, white, a8]), "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", default="", help="comma-separated card ids (default: every claimed face)")
    ap.add_argument("--version", default="v1")
    ap.add_argument("--preview", default="", help="write PNGs of the masks here instead of shipping")
    a = ap.parse_args()
    wanted = {s.strip() for s in a.ids.split(",") if s.strip()}
    made = skipped = 0
    for cid, fmap, scan in faces():
        if wanted and cid not in wanted:
            continue
        cut = cid.index("-")
        out = OUT / cid[:cut] / f"{cid[cut + 1:]}-foil-{a.version}.webp"
        if a.preview:
            Path(a.preview).mkdir(parents=True, exist_ok=True)
            Image.fromarray((build(fmap, scan) * 255).astype(np.uint8)).save(Path(a.preview) / f"{cid}.png")
            made += 1
            continue
        if out.exists():
            skipped += 1
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        webp(build(fmap, scan)).save(out, "WEBP", quality=80, alpha_quality=60, method=6)
        made += 1
    print(f"made {made}, kept {skipped} existing", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
