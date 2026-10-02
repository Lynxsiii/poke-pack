#!/usr/bin/env python3
"""Ridge masks for the eight gold Items (xy5-161..164, xy6-109, xy6-110, xy7-99, xy7-100).

What it draws: `assets/foil/fam/xy-secret-gold/<id>-ridge-v1.webp`, white with an alpha that is 1 on the crests of
TCG Live's engraving and 0 in the gaps between them AND on every flat, unengraved field (the text box, the bare
margins).

From what: TCG Live's etch of the print, already shipped at its native 733 x 1024 by xy-full-art
(`assets/foil/fam/xy-full-art/<id>-etch.webp`, read only; this script never writes there and never blurs it).
Live's etch alpha is 1.0 on a ridge, about 0.25 in the gap between two ridges, and 1.0 again over a flat field, so used
as a mask for light it would glow over the whole text box. The crest mask keeps what the eye reads as the engraving
(the diagonal guilloche of the border, the header hatch, the bokeh tiles, the rings of the Poke Ball) and drops
the flat fields: crest = (etch - local mean) over a 7 px window, scaled so a ridge reaches 1. No pixel of Live's
line structure is moved or softened, the local mean is only used to decide which pixels are crests.

Why: a light layer masked by the crests flashes the lines and leaves the text box and the white margins calm
(the real cards: photos in /mnt/project-files/holo-remaster/xy-secret-gold/refs/).

    python3 .claude/skills/card-textures/scripts/fam/xy-secret-gold/make_item_ridges.py [--debug]
"""
import argparse
import io
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[6]
SRC = ROOT / "assets/foil/fam/xy-full-art"
OUT = ROOT / "assets/foil/fam/xy-secret-gold"
IDS = ["xy5-161", "xy5-162", "xy5-163", "xy5-164", "xy6-109", "xy6-110", "xy7-99", "xy7-100"]
WINDOW = 7        # px: the local mean that tells a crest from a flat field
RISE = 0.28       # a crest this far above its neighbourhood's mean is full strength


def ridges(alpha: np.ndarray) -> np.ndarray:
    mean = ndimage.uniform_filter(alpha, WINDOW, mode="nearest")
    crest = np.clip((alpha - mean) / RISE, 0.0, 1.0)
    return crest ** 0.85


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="write a contact sheet of the ridge masks to the scratchpad")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = []
    for cid in IDS:
        etch = Image.open(SRC / f"{cid}-etch.webp").convert("RGBA")
        alpha = np.asarray(etch)[..., 3].astype(np.float32) / 255.0
        r = ridges(alpha)
        out = np.dstack([np.full(alpha.shape, 255, np.uint8)] * 3 + [(r * 255 + 0.5).astype(np.uint8)])
        buf = io.BytesIO()
        Image.fromarray(out, "RGBA").save(buf, "WEBP", lossless=True, method=6)
        dest = OUT / f"{cid}-ridge-v1.webp"
        dest.write_bytes(buf.getvalue())
        print(f"{cid}: {etch.size}, crest coverage {float((r > 0.5).mean()):.1%}, {len(buf.getvalue()) // 1024} KB -> {dest.relative_to(ROOT)}")
        sheet.append(Image.fromarray((r * 255).astype(np.uint8)))
    if a.debug:
        w, h = sheet[0].size
        s = Image.new("L", (4 * w // 2, 2 * h // 2))
        for i, im in enumerate(sheet):
            s.paste(im.resize((w // 2, h // 2), Image.LANCZOS), ((i % 4) * w // 2, (i // 4) * h // 2))
        s.save("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-secret-gold/ridges-sheet.png")


if __name__ == "__main__":
    main()
