#!/usr/bin/env python3
"""Turn TCG Live's silhouette of Thundurus 97 and Tornadus 98 (Emerging Powers) the right way round.

The family's CSS reads `--bwfa-sil` (assets/foil/fam/bw-full-art/etch/<id>.webp, ship_live_etch.py) as white on the
smooth mirror (the Pokemon, the frame, the lettering) and black on the stippled background, which is how Live draws
seven of the nine flat full arts. Live's maps of the two Genies have the art window the other way round: the Pokemon
black and the sky white (audit 2026-10-22: the sand speckled Thundurus's body; the tilt clips show the bodies clean).
This keeps the frame and the name bar as the other seven agree on (white in every one of them), and inverts the rest,
so the Genie's body is mirror and the sky takes the sand.

v3 (review 2026-10-22): Live's maps only ever drew the head and torso, so the inverted map left Tornadus's purple
tail and Thundurus's black orbs and purple ring as background, and the sand salted them (the tilt clips show them
smooth, the orbs black). v3 adds every pixel of the scan that is not the sky: on Tornadus the sky is a grey swirl
(HSV saturation under 0.17), so anything coloured is the Pokemon (body, tail, yellow ornaments); on Thundurus the sky
is the yellow lightning, so the Pokemon is the dark ink (luma under 0.32: orbs, ring, shading), the dull greys
(an orb's highlight) and the blue to purple hues. Small holes (an orb's highlight) are filled, specks dropped, the edge grown a pixel and softened.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/fix_genie_sil.py

Writes assets/foil/fam/bw-full-art/etch/bw2-97-v3.webp and bw2-98-v3.webp (new names: /assets/* is cached for a year);
v2 is rebuilt in memory as its base.
"""
from __future__ import annotations

import sys
from pathlib import Path

import json

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
DIR = ROOT / "assets" / "foil" / "fam" / "bw-full-art" / "etch"
GOOD = ["bw1-113", "bw1-114", "bw3-97", "bw3-98", "bw3-99", "bw3-100", "bw3-101"]
FIX = ["bw2-97", "bw2-98"]


def alpha(fid: str) -> np.ndarray:
    return np.asarray(Image.open(DIR / f"{fid}.webp").convert("RGBA"), np.float32)[..., 3] / 255.0


def scan_hsl(fid: str, shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    s = fid.split("-")[0]
    data = json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8"))
    card = next(c for c in (data if isinstance(data, list) else data["cards"]) if c.get("id") == fid)
    im = Image.open(ROOT / card["image"]).convert("RGB").resize((shape[1], shape[0]), Image.LANCZOS)
    rgb = np.asarray(im, np.float32) / 255.0
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    return hue, sat, luma


def pokemon_from_scan(fid: str, shape: tuple[int, int]) -> np.ndarray:
    hue, sat, luma = scan_hsl(fid, shape)
    if fid == "bw2-98":  # Tornadus: grey sky, so colour is the Pokemon
        m = (sat > 0.17) & (luma > 0.08)
    else:  # Thundurus: yellow sky, so dark ink and blue to purple are the Pokemon
        m = (luma < 0.32) | ((hue > 170) & (hue < 310) & (sat > 0.2)) | ((sat < 0.22) & (luma < 0.5))
    m = ndimage.binary_closing(m, iterations=2)
    holes = ndimage.binary_fill_holes(m) & ~m
    lab, n = ndimage.label(holes)
    if n:
        size = ndimage.sum(holes, lab, range(1, n + 1))
        m |= np.isin(lab, np.nonzero(size < 4000)[0] + 1)
    lab, n = ndimage.label(m)
    if n:
        size = ndimage.sum(m, lab, range(1, n + 1))
        m &= np.isin(lab, np.nonzero(size >= 150)[0] + 1)
    m = ndimage.binary_dilation(m, iterations=1)
    return ndimage.gaussian_filter(m.astype(np.float32), 0.6)


def save(out: np.ndarray, dst: Path) -> None:
    rgba = np.zeros(out.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(np.clip(out, 0, 1) * 255).astype(np.uint8)
    if dst.exists():
        print(f"{dst.name} exists, skipped")
        return
    Image.fromarray(rgba, "RGBA").save(dst, "WEBP", lossless=True, method=6)
    print(f"{dst.relative_to(ROOT)} mean {rgba[..., 3].mean():.0f}")


def main() -> int:
    # The frame: white in every correctly drawn map (border, name bar, the shared lettering), grown a pixel.
    frame = np.minimum.reduce([alpha(f) for f in GOOD])
    frame = ndimage.grey_dilation(frame, size=(3, 3))
    for fid in FIX:
        a = alpha(fid)
        v2 = np.maximum(frame, 1.0 - a)
        save(np.maximum(v2, pokemon_from_scan(fid, a.shape)), DIR / f"{fid}-v3.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
