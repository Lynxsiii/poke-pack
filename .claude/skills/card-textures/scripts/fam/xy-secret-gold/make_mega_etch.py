#!/usr/bin/env python3
"""Etch maps for the seven gold Mega EX secrets (xy2-107, 108, 109, xy3-112, 113, xy4-120, 121), drawn from each card's own scan.

What it draws: `assets/foil/fam/xy-secret-gold/<id>-etch-v1.webp`, 733 x 1024, white with the etch as alpha (the shape of
TCG Live's etch maps, so a recipe can use either), one file per card.

From what: the card's scan (`assets/cards/<set>/<n>.webp`) through `make_card_etch.etch_from`: a fine fingerprint of
short ridges steered by the drawing's edges, the printed black ink (outlines, lettering) left smooth, seeded by the card id
so no two cards share a pattern. The scan is the only input; Live ships no etch for these prints (cdn.malie.io answers 404 for
`xy2_en_107..109`, `xy3_en_112/113`, `xy4_en_120/121` `_std.etch.png`, probed 2026-10-02).

Why drawn and why this fine: photos of the real cards (refs/ in /mnt/project-files/holo-remaster/xy-secret-gold/) show a
pebbled grain over the whole face, not Live-style contour lines (native crops of M Charizard 107 and M Gengar 121), so the ridge
pitch is the finest `etch_from` gives that does not alias into a line screen at phone size: `PITCH` 4.4 px at 733 px wide (the
module's default, 2.6 px at 400, is 4.8 here; Live's XY contour etches are 5.6). `CONTRAST` then pulls the soft fingerprint
(two thirds mid-tone) towards crest and gap, because the recipe lights the crests, never the gaps.

    python3 .claude/skills/card-textures/scripts/fam/xy-secret-gold/make_mega_etch.py [--debug]
"""
import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(ROOT / ".claude/skills/card-textures/scripts"))
import make_card_etch as mce  # noqa: E402

OUT = ROOT / "assets/foil/fam/xy-secret-gold"
IDS = ["xy2-107", "xy2-108", "xy2-109", "xy3-112", "xy3-113", "xy4-120", "xy4-121"]
WIDTH = 733
PITCH = 4.4       # px at 733 px wide
CONTRAST = 1.55   # >1 pulls the fingerprint's mid-tones towards crest or gap
GRAIN = 0.025


def draw(card_id: str) -> np.ndarray:
    s, n = card_id.split("-")
    scan = Image.open(ROOT / f"assets/cards/{s}/{n}.webp")
    mce.WIDTH, mce.PITCH, mce.GRAIN = WIDTH, PITCH, GRAIN
    # the module's filters are in px: scale the ones that are tied to the drawing's size from 400 px to 733 px
    k = WIDTH / 400.0
    mce.FLOW_SIGMA = 10 * k
    mce.SOFTEN = 0.5
    mce.INK_WIDTH = int(11 * k) | 1
    etch, _ = mce.etch_from(scan, card_id)
    etch = np.clip(0.5 + (etch - 0.5) * CONTRAST, 0.0, 1.0)
    return etch


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--ids", default="")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ids = [i for i in a.ids.split(",") if i] or IDS
    sheet = []
    for cid in ids:
        etch = draw(cid)
        alpha = (etch * 255 + 0.5).astype(np.uint8)
        rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
        buf = io.BytesIO()
        Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=80, alpha_quality=55, method=6)
        dest = OUT / f"{cid}-etch-v1.webp"
        dest.write_bytes(buf.getvalue())
        print(f"{cid}: {etch.shape[::-1]} mean {etch.mean():.2f}, {float((etch > 0.5).mean()):.0%} above half, {len(buf.getvalue()) // 1024} KB -> {dest.relative_to(ROOT)}")
        sheet.append(Image.fromarray(alpha))
    if a.debug:
        w, h = sheet[0].size
        cols = 4
        rows = (len(sheet) + cols - 1) // cols
        s = Image.new("L", (cols * w // 2, rows * h // 2))
        for i, im in enumerate(sheet):
            s.paste(im.resize((w // 2, h // 2), Image.LANCZOS), ((i % cols) * w // 2, (i // cols) * h // 2))
        s.save("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-secret-gold/mega-etch-sheet.png")


if __name__ == "__main__":
    main()
