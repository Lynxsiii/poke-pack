#!/usr/bin/env python3
"""Draw the sv-sir family's per-card masks: TCG Live's foil map with the dark ink kept matte.

The Scarlet & Violet Special Illustration Rares print their black text, HP numbers and line art in an opaque
matte ink over the foil: in every photo of a real card (reference/fam-sv-sir.md) the ink stays black at every
angle. Live's foil map does not cut the ink out (it is the foil sheet, not the print), so any layer masked by it
alone lifts the text grey under the light. This multiplies the map (resampled to the scan's size) by a
keep-dark pass from the scan: a pixel that is both dark and neutral (black or charcoal ink; not a navy or a
deep red, which are translucent inks the foil shows through and the glitter sparkles in) leaves the mask, grown
by one pixel so the letters' anti-aliased rims go with them. Moltres' stamp is already cut out of its map.

    python3 .claude/skills/card-textures/scripts/fam/sv-sir/make_sir_masks.py            # every claimed face
    python3 .claude/skills/card-textures/scripts/fam/sv-sir/make_sir_masks.py --ids sv8-236,sv4-245

Writes assets/foil/fam/sv-sir/<set>/<n>-map-v1.webp (white, alpha = the mask, the scan's size). Never
overwrites a file that exists (assets are cached immutable): a redraw needs a new suffix (--suffix -map-v2).
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
OUT = ROOT / "assets" / "foil" / "fam" / "sv-sir"
SV_ID = re.compile(r"^[zr]?sv\d")

# Ink: value (max channel) under V_HI fades in to fully ink at V_LO; chroma (max - min) under C_HI fades in at C_LO.
V_LO, V_HI = 0.10, 0.22
C_LO, C_HI = 0.05, 0.13


def faces():
    """Every SV SIR face in the data: (id, scan path, foil map path)."""
    for f in sorted((ROOT / "data").glob("*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        cards = d if isinstance(d, list) else d.get("cards", []) if isinstance(d, dict) else []
        for c in cards:
            if not isinstance(c, dict) or not c.get("id"):
                continue
            rarity = c.get("foilAs") or c.get("rarity")
            if rarity != "Special Illustration Rare" or not SV_ID.match(str(c["id"])) or not c.get("foilMap"):
                continue
            yield c["id"], ROOT / c["image"], ROOT / c["foilMap"]


def ramp(x, lo, hi):
    """1 at or under lo, 0 at or over hi, linear between."""
    return np.clip((hi - x) / (hi - lo), 0, 1)


def build(scan_path: Path, map_path: Path) -> Image.Image:
    scan = Image.open(scan_path).convert("RGBA")
    w, h = scan.size
    s = np.asarray(scan).astype(np.float32) / 255
    rgb, alpha = s[..., :3], s[..., 3]
    v = rgb.max(axis=2)
    c = v - rgb.min(axis=2)
    ink = ramp(v, V_LO, V_HI) * ramp(c, C_LO, C_HI)
    # take the letters' anti-aliased rims with them, then soften the cut by half a pixel
    ink = ndimage.grey_dilation(ink, size=(3, 3))
    keep = ndimage.gaussian_filter(1 - ink, 0.5)
    m = Image.open(map_path).convert("RGBA").split()[3].resize((w, h), Image.BILINEAR)
    m = np.asarray(m).astype(np.float32) / 255
    out = np.clip(m * keep * (alpha > 0.5), 0, 1)
    a = (out * 255).round().astype(np.uint8)
    white = np.full_like(a, 255)
    return Image.fromarray(np.dstack([white, white, white, a]), "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", default="", help="comma-separated card ids (default: every SV SIR face with a foil map)")
    ap.add_argument("--suffix", default="-map-v1")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=50)
    ap.add_argument("--preview", default="", help="write a PNG of each mask here instead of shipping")
    a = ap.parse_args()
    wanted = {s.strip() for s in a.ids.split(",") if s.strip()}
    made = skipped = 0
    for cid, scan, fmap in faces():
        if wanted and cid not in wanted:
            continue
        cut = cid.index("-")
        out = OUT / cid[:cut] / f"{cid[cut + 1:]}{a.suffix}.webp"
        if a.preview:
            Path(a.preview).mkdir(parents=True, exist_ok=True)
            build(scan, fmap).split()[3].save(Path(a.preview) / f"{cid}.png")
            made += 1
            continue
        if out.exists():
            skipped += 1
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        build(scan, fmap).save(out, "WEBP", quality=a.quality, alpha_quality=a.alpha_quality, method=6)
        made += 1
    print(f"made {made}, kept {skipped} existing", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
