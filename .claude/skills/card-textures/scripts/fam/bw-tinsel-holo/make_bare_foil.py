"""Bare-foil masks for the Cosmos promos whose window is printed white: Eevee BW94.

What the real card does (2026-10-22 audit: Collexy's scan of Eevee BW94 and an in-hand video frame,
/home/user/holo-refs/bw-tinsel-bwp-bwtk5a-bwtk5b/bwp094/; Collexy's Glaceon BW90): where the window's ink is white or
very pale there is no ink over the foil, so the card shows bare metal: a mid-to-dark grey silver (35-55 % luminance)
under the cosmos glitter, darker than the text box. The site's scans are clean digital images, white there, and a
light foil cannot darken white, so these cards read as non-foil. This draws, per card, where the scan is near white
inside the card's foil map, as a grey the hard-light `.foil` darkens it with (grey GREY: white x2xGREY).

Writes assets/foil/fam/bw-tinsel-holo/bare/<id>-v1.webp (RGBA: grey GREY, alpha = how bare). The module gives the
face `--bwc-bare: url(...)`; css/holo/fam/bw-tinsel-holo.css lays it under the glints.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_bare_foil.py [--force]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo" / "bare"
V = "v1"
CARDS = {"bwp-bwp094": "bwp094"}  # Glaceon BW90 and Vaporeon BW89 measured 0 % and 2 % bare: not worth a mask
GREY = 0.24            # hard-light: white x0.48, a mid-grey metal
LO, HI = 0.80, 0.93    # scan luma ramp: below LO inked (untouched), above HI bare


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, n in CARDS.items():
        out = OUT / f"{cid}-{V}.webp"
        if out.exists() and not args.force:
            print("kept", out.relative_to(ROOT))
            continue
        scan = Image.open(ROOT / "assets" / "cards" / "bwp" / f"{n}.webp").convert("RGB")
        fmap = Image.open(ROOT / "assets" / "foil" / "maps" / "bwp" / f"{n}.webp").convert("RGBA")
        scan = scan.resize(fmap.size, Image.LANCZOS)
        rgb = np.asarray(scan).astype(float) / 255
        luma = rgb @ [0.299, 0.587, 0.114]
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        t = np.clip((luma - LO) / (HI - LO), 0, 1) * np.clip((0.22 - sat) / 0.12, 0, 1)
        a = np.asarray(fmap)[..., 3].astype(float) / 255
        bare = gaussian_filter(t * t * (3 - 2 * t), 0.7) * np.clip(a / 0.4, 0, 1)
        share = (bare > 0.5).sum() / max((a > 0.2).sum(), 1)
        img = np.dstack([np.full(bare.shape + (3,), GREY * 255), bare * 255])
        Image.fromarray(np.uint8(np.clip(img, 0, 255) + 0.5), "RGBA").save(out, "WEBP", lossless=True, method=6)
        print("wrote", out.relative_to(ROOT), f"bare share of the foil {share:.0%}")


if __name__ == "__main__":
    main()
