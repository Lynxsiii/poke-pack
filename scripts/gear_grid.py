#!/usr/bin/env python3
"""Helpers for picking sleeve corners and coin circles in a source photo.

    python3 scripts/gear_grid.py grid   <src> --out grid.png            # labelled 50 px grid over the photo
    python3 scripts/gear_grid.py quad   <src> --quad "x,y x,y x,y x,y"|auto --out check.png [--no-snap]
    python3 scripts/gear_grid.py circle <src> --circle "cx,cy,r" --out check.png [--no-snap] [--crop x0,y0,x1,y1]

<src> is a TCGplayer product id (the 1000 px listing photo), a path (absolute, or
relative to the research folder), or a URL. `quad` draws the corners you gave
(yellow), the snapped corners the builder will use (green) and the straightened
sleeve next to them, so a wrong corner is obvious before anything is built.
`circle` does the same for a coin. Look at the PNG, adjust, repeat.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import gear_art as g  # noqa: E402
from build_gear import RESEARCH, open_src  # noqa: E402


def load(src: str) -> Image.Image:
    if src.isdigit():
        return open_src({"tcgplayer": int(src)})
    if src.startswith("http"):
        return open_src({"url": src})
    p = Path(src)
    if not p.is_absolute() and not p.exists():
        p = RESEARCH / src
    return Image.open(p)


def draw_grid(im: Image.Image, step: int = 50) -> Image.Image:
    out = im.convert("RGB").copy()
    d = ImageDraw.Draw(out)
    for x in range(0, out.width, step):
        major = x % (step * 2) == 0
        d.line((x, 0, x, out.height), fill=(255, 0, 255) if major else (255, 160, 255), width=1)
        if major:
            d.text((x + 2, 2), str(x), fill=(255, 255, 0))
            d.text((x + 2, out.height - 12), str(x), fill=(255, 255, 0))
    for y in range(0, out.height, step):
        major = y % (step * 2) == 0
        d.line((0, y, out.width, y), fill=(255, 0, 255) if major else (255, 160, 255), width=1)
        if major:
            d.text((2, y + 2), str(y), fill=(255, 255, 0))
            d.text((out.width - 30, y + 2), str(y), fill=(255, 255, 0))
    return out


def parse_pts(text: str):
    return [tuple(float(v) for v in pt.split(",")) for pt in text.replace(";", " ").split()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["grid", "quad", "circle"])
    ap.add_argument("src")
    ap.add_argument("--out", required=True)
    ap.add_argument("--quad")
    ap.add_argument("--circle")
    ap.add_argument("--crop")
    ap.add_argument("--no-snap", action="store_true")
    ap.add_argument("--step", type=int, default=50)
    a = ap.parse_args()
    im = load(a.src)
    if a.mode == "grid":
        draw_grid(im, a.step).save(a.out)
        print(f"{im.width}x{im.height} -> {a.out}")
        return 0
    if a.mode == "quad":
        quad = g.auto_quad(im) if a.quad == "auto" else parse_pts(a.quad)
        if not quad:
            raise SystemExit("auto quad found no sleeve; give the four corners")
        if len(quad) != 4:
            raise SystemExit("quad needs four x,y corners: TL TR BR BL")
        snapped = quad if a.no_snap else g.refine_quad(im, quad)
        card = g.sleeve_card(im, quad=snapped)
        over = draw_grid(im, a.step)
        d = ImageDraw.Draw(over)
        d.polygon([tuple(p) for p in quad], outline=(255, 255, 0), width=2)
        d.polygon([tuple(p) for p in snapped], outline=(0, 255, 0), width=2)
        sheet = Image.new("RGB", (over.width + card.width + 30, max(over.height, card.height)), (40, 40, 44))
        sheet.paste(over, (0, 0))
        bg = Image.new("RGBA", card.size, (200, 200, 205, 255))
        bg.alpha_composite(card)
        sheet.paste(bg.convert("RGB"), (over.width + 20, 0))
        sheet.save(a.out)
        print("given  :", [tuple(round(v) for v in p) for p in quad])
        print("snapped:", [tuple(round(v) for v in p) for p in snapped])
        return 0
    cx, cy, r = parse_pts(a.circle)[0]
    photo = im.convert("RGBA")
    if a.crop:
        photo = photo.crop(tuple(int(v) for v in a.crop.split(",")))
    found = (cx, cy, r) if a.no_snap else g.find_circle(photo, cx, cy, r)
    fx, fy, fr = found
    face = g.coin_face(photo.crop((round(fx - fr), round(fy - fr), round(fx + fr), round(fy + fr))))
    over = draw_grid(photo, a.step)
    d = ImageDraw.Draw(over)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 0), width=2)
    d.ellipse((fx - fr, fy - fr, fx + fr, fy + fr), outline=(0, 255, 0), width=2)
    big = face.resize((512, 512), Image.LANCZOS)
    sheet = Image.new("RGB", (over.width + 552, max(over.height, 512)), (40, 40, 44))
    sheet.paste(over, (0, 0))
    bg = Image.new("RGBA", big.size, (200, 200, 205, 255))
    bg.alpha_composite(big)
    sheet.paste(bg.convert("RGB"), (over.width + 20, 0))
    sheet.save(a.out)
    print("given  :", (cx, cy, r))
    print("snapped:", found)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
