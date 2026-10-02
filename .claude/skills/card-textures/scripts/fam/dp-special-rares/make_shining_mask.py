#!/usr/bin/env python3
"""Draw the Shining (SH1-SH12) foil mask: where the Mirror foil is, shared by all twelve cards.

What the real card does (photos in /mnt/project-files/holo-remaster/dp-special-rares/refs/, SOURCES.md): a Shining Pokemon of
the Platinum era is printed like a reverse holo: the whole face inside the yellow border is one smooth "Mirror" foil
(Bagon-style: a broad vertical rainbow band that slides sideways as the card tips) and only the art window (the shiny-colour
picture) is plain. The names, text and numbers are ink over foil.

Per card, one file (their frames and windows are the same, the ink and the card colour differ):

    sh<n>-mask.webp  RGBA, white. Alpha = where the foil is: inside the printed border (about 13 px a side at 600 x 838),
                     minus the art window (the era's drawn window mask, assets/foil/dp-win/dp-basic.webp), the window's
                     silver bevel and the dex strip at 0.45 (sheen only), and minus the card's own INK (text, numbers,
                     thin dark lines: a pixel much darker than the grey-closing of its neighbourhood, found per card
                     because the cards run from yellow to dark red), so the text stays dark under the light as on the
                     real card instead of turning blue and pink under a colour-dodge.

    python3 .claude/skills/card-textures/scripts/fam/dp-special-rares/make_shining_mask.py [--cards SH1,...] [--preview DIR]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dsr_common import body_inset, load_scan, luminance, save_alpha, smoothstep, window_mask  # noqa: E402
from make_rotom_ice import frame_zone  # noqa: E402


SETS = {"SH1": "dp7", "SH2": "dp7", "SH3": "dp7", "SH4": "pl1", "SH5": "pl1", "SH6": "pl1", "SH7": "pl3", "SH8": "pl3",
        "SH9": "pl3", "SH10": "pl4", "SH11": "pl4", "SH12": "pl4"}


def ink_mask(rgb: np.ndarray) -> np.ndarray:
    """1 on thin dark strokes (text, numbers, rules), 0 elsewhere, 0..1 soft: darker than the local background by 0.17+."""
    L = luminance(rgb).astype(np.float32)
    bg = cv2.morphologyEx(L, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    bg = cv2.GaussianBlur(bg, (0, 0), 1.2)
    d = bg - L
    ink = smoothstep(0.12, 0.26, d) * smoothstep(0.55, 0.30, L + 0.0)   # darker than its surround AND dark in itself
    ink = np.maximum(ink, smoothstep(0.28, 0.14, L))                    # plain black
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8))
    return cv2.GaussianBlur(ink, (0, 0), 0.7)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default=",".join(SETS))
    ap.add_argument("--preview", type=Path, default=None)
    a = ap.parse_args()
    for c in a.cards.split(","):
        c = c.strip()
        cid = f"{SETS[c]}-{c}"
        rgb, card_alpha = load_scan(cid)
        win = window_mask("pl3-SH7" if c == "SH7" else "pl4-SH10")
        frame = frame_zone("pl4-SH10", win)
        alpha = body_inset() * (1.0 - win)
        alpha = np.where(frame, alpha * 0.45, alpha)
        alpha = alpha * (1.0 - 0.9 * ink_mask(rgb)) * card_alpha
        save_alpha(alpha, f"{c.lower()}-mask.webp", quality=92)
        if a.preview:
            a.preview.mkdir(parents=True, exist_ok=True)
            vis = rgb * (0.25 + 0.75 * alpha[..., None])
            cv2.imwrite(str(a.preview / f"{c.lower()}-mask-preview.png"), cv2.cvtColor((vis * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))


if __name__ == "__main__":
    main()
