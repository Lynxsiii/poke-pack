#!/usr/bin/env python3
"""Draw the name-plate knockout masks of the xy-ex-mega family: one per claimed print, from the card's own scan.

Why (REVIEW-1, 2026-10-02): the colour-dodge columns and the hard-light stripe light the whole name plate, because TCG
Live's foil map counts the plate as foil, and they wash out what is printed on it: the gold "EX", the dark
"Evolves from ..." ink, the name, the HP digits and the evolution circle. On the real cards the plate flashes but the
lettering stays ink (Pokemon Holo's Mewtwo-EX and M Blastoise-EX tilt frames: the EX stays gold, the small print dark).

What a mask is: assets/foil/fam/xy-ex-mega/<id>-ink.webp, 600 x 838 (the scan's own grid), white with alpha = 1 minus the
lettering, so the sheet can use it as one more `mask-composite: intersect` layer on `.foil`, `.cure` and `.glare`.
Only the top band of the card (rows 8-175: name plate, "Evolves from", Mega badge, HP and type) is ever knocked out.

What is knocked out (all inside the band):
  - dark thin ink inside the plate box (rows 24-141, columns 95-547): the black top-hat of the luminance (a dark feature
    narrower than 13 px, on a light ground: letters, digits, outlines); dark art and big dark areas stay foil;
  - gold lettering: gold pixels (hue 35-66, saturation > 0.5, value > 0.55) thinner than 17 px (the EX, the gold "Mega"
    outline), the white top-hat of the gold mask;
  - the evolution circle: a compact gold blob of 2000-14000 px in the left fifth of the band (the picture on a yellow disc
    of the Mega frames), holes filled, so the picture stays as printed.
The result is dilated 2 px and blurred (sigma 1.1), so a halo of plain print surrounds each stroke and the dodge never
bleeds into the letters.

    node .claude/skills/card-textures/scripts/fam/xy-ex-mega/list_claimed.mjs > ids.tsv
    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/make_ink_masks.py ids.tsv [--only xy2-69,xy6-76] [--preview DIR]

Seedless and deterministic (no randomness). An existing file is kept unless --force (only until the family ships; after
that a change is a new -vN name and the module's INK_SUFFIX).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-ex-mega"
W, H = 600, 838
BAND = (8, 175)  # rows: the circle and the Mega badge are searched here
PLATE = (24, 142, 95, 548)  # rows and columns the lettering is looked for in: the name plate, "Evolves from", HP


def load(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    return np.asarray(bg.convert("RGB").resize((W, H), Image.LANCZOS))


def build(rgb: np.ndarray) -> np.ndarray:
    """Return the knockout as float 0..1 (1 = lettering) over the whole card."""
    r0, r1 = BAND
    band = np.zeros((H, W), bool)
    band[r0:r1] = True
    plate = np.zeros((H, W), bool)
    plate[PLATE[0]:PLATE[1], PLATE[2]:PLATE[3]] = True
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    # dark thin ink: black top-hat (closing minus the image) over a 13 px disc
    k13 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    th = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, k13)
    ground = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, k13)
    # a letter is dark, thin, and sits on a light plate: dark art around the plate is not lettering
    ink = (th > 55) & (gray < 125) & (ground > 150) & plate
    # gold lettering: thin gold
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hue = hsv[..., 0].astype(np.float32) * 2.0
    sat = hsv[..., 1].astype(np.float32) / 255.0
    val = hsv[..., 2].astype(np.float32) / 255.0
    gold = ((hue >= 35) & (hue <= 66) & (sat > 0.5) & (val > 0.55)).astype(np.uint8)
    gold_all = gold.copy()
    gold[~plate] = 0
    k17 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    thin_gold = (gold - cv2.morphologyEx(gold, cv2.MORPH_OPEN, k17)).astype(bool)
    # the evolution circle: a compact gold blob in the left fifth
    circle = np.zeros((H, W), np.uint8)
    gold_all[~band] = 0
    close = cv2.morphologyEx(gold_all, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(close, connectivity=8)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if x < W * 0.2 and 2000 <= area <= 14000 and 0.65 <= w / max(h, 1) <= 1.5 and area / (w * h) > 0.55:
            blob = (lbl == i).astype(np.uint8)
            cnts, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(circle, cnts, -1, 1, thickness=-1)  # filled: the picture inside stays as printed
    knock = (ink | thin_gold | circle.astype(bool)).astype(np.uint8)
    knock = cv2.dilate(knock, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    k = cv2.GaussianBlur(knock.astype(np.float32), (0, 0), 1.1)
    return np.clip(k * 1.6, 0, 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", type=Path, help="TSV from list_claimed.mjs: <id><TAB><image path>")
    ap.add_argument("--only", default="", help="comma-separated ids")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview", type=Path, default=None)
    a = ap.parse_args()
    only = {s for s in a.only.split(",") if s}
    OUT.mkdir(parents=True, exist_ok=True)
    done = 0
    for line in a.ids.read_text().splitlines():
        if not line.strip():
            continue
        cid, img = line.split("\t")
        if only and cid not in only:
            continue
        dest = OUT / f"{cid}-ink.webp"
        if dest.exists() and not a.force and not a.preview:
            continue
        rgb = load(ROOT / img)
        k = build(rgb)
        alpha = ((1.0 - k) * 255).round().astype(np.uint8)
        white = np.full_like(alpha, 255)
        Image.fromarray(np.dstack([white, white, white, alpha]), "RGBA").save(dest, "WEBP", lossless=True, method=6)
        done += 1
        if a.preview:
            a.preview.mkdir(parents=True, exist_ok=True)
            vis = rgb.astype(np.float32) * (1 - 0.65 * k[..., None]) + np.array([255, 0, 255], np.float32) * 0.65 * k[..., None]
            Image.fromarray(vis.clip(0, 255).astype(np.uint8)[:200]).save(a.preview / f"{cid}-ink-preview.png")
    print(f"wrote {done} masks to {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
