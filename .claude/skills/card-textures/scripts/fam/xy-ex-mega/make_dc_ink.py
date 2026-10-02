#!/usr/bin/env python3
"""Redraw the lettering knockout of the two Double Crisis EX (dc1-6, dc1-15): the name plate (make_ink_masks.build) PLUS the text rows.

Why (REVIEW-2, 2026-10-02): the shard layers (`.foil` tint, `.cure` facets, `.glare` lamp) lift the dark ink of the Ability and the
attack text and tint it; on the real card (Japanese prints: BuyGradedCards CGC 9 Groudon-EX, Spud 'n Cards PSA 6) the shards run across
the text box too but the ink stays black. So the DC masks also cover the lettering below the art: dark thin ink on the light text box
(the Ability and attack names and text, the energy costs, damage, weakness / retreat numerals) and the light lettering on the black
"Pokemon-EX rule" strip. Same file names as make_ink_masks.py (`<id>-ink.webp`, 600 x 838, white, alpha = 1 - lettering), so the
module and the CSS did not change; these two files are not on origin/master, so they may be rewritten until the pair ships.

    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/make_dc_ink.py [--preview DIR]

Seedless and deterministic.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_ink_masks as base  # noqa: E402

IDS = {"dc1-6": "assets/cards/dc1/6.webp", "dc1-15": "assets/cards/dc1/15.webp"}
TEXT = (455, 838, 14, 590)  # rows, columns of the text box, the rule strip and the footer


def text_ink(rgb: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    box = np.zeros(gray.shape, bool)
    box[TEXT[0]:TEXT[1], TEXT[2]:TEXT[3]] = True
    # dark ink on a light ground: the black top-hat of the luminance
    th = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, k9)
    ground = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, k9)
    dark = (th > 48) & (gray < 125) & (ground > 135) & box
    # light lettering on the black rule strip: the white top-hat over a dark ground
    wh = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, k9)
    floor = cv2.morphologyEx(gray, cv2.MORPH_OPEN, k9)
    strip = np.zeros(gray.shape, bool)
    strip[728:792, 240:590] = True
    light = (wh > 60) & (gray > 140) & (floor < 95) & strip
    return (dark | light)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", type=Path, default=None)
    a = ap.parse_args()
    for cid, img in IDS.items():
        src = base.ROOT / img
        rgb = base.load(src)
        k_plate = base.build(rgb)
        ti = text_ink(rgb).astype(np.uint8)
        ti = cv2.dilate(ti, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        k_text = np.clip(cv2.GaussianBlur(ti.astype(np.float32), (0, 0), 0.9) * 1.7, 0, 1)
        k = np.maximum(k_plate, k_text)
        alpha = ((1.0 - k) * 255).round().astype(np.uint8)
        white = np.full_like(alpha, 255)
        dest = base.OUT / f"{cid}-ink.webp"
        Image.fromarray(np.dstack([white, white, white, alpha]), "RGBA").save(dest, "WEBP", lossless=True, method=6)
        print("wrote", dest, f"({int((k > 0.5).sum())} px knocked out)", file=sys.stderr)
        if a.preview:
            a.preview.mkdir(parents=True, exist_ok=True)
            vis = rgb.astype(np.float32) * (1 - 0.7 * k[..., None]) + np.array([255, 0, 255], np.float32) * 0.7 * k[..., None]
            Image.fromarray(vis.clip(0, 255).astype(np.uint8)).save(a.preview / f"{cid}-ink-preview.png")


if __name__ == "__main__":
    main()
