"""House coin v3: a booster pack (heads) and three fanned cards (tails).

v2's emblem was a four-point sparkle, the mark AI products use for themselves
(DESIGN.md, House style). This draws the site's own things flat and runs them
through the same relief pass as build_house_coin.py.

    python3 scripts/build_house_coin_v3.py [--preview out.png]  -> assets/casino/house-coin-v3.webp
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import build_house_coin as b  # noqa: E402
import gear_art as g  # noqa: E402

OUT = b.ROOT / "assets" / "casino" / "house-coin-v3.webp"
BODY = (238, 196, 92, 255)
INK = (60, 34, 4, 255)


def pack_art(S: int) -> Image.Image:
    """A booster pack leaning on the site's slant: crimped top and bottom, a seam under each crimp."""
    ss = 2
    W = S * ss
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lw = int(W * 0.018)
    x0, x1, yt, yb = W * 0.27, W * 0.73, W * 0.10, W * 0.90
    n, t = 7, W * 0.035
    w = (x1 - x0) / n
    pts = [(x0, yt + t)]
    for i in range(n):
        pts += [(x0 + w * (i + 0.5), yt), (x0 + w * (i + 1), yt + t)]
    pts += [(x1, yb - t)]
    for i in range(n):
        pts += [(x1 - w * (i + 0.5), yb), (x1 - w * (i + 1), yb - t)]
    d.polygon(pts, fill=BODY, outline=INK, width=lw)
    for y in (yt + W * 0.11, yb - W * 0.11):
        d.line((x0, y, x1, y), fill=INK, width=int(lw * 0.8))
    # the window where the art sits, and a tear notch at the top right
    d.rectangle((x0 + W * 0.07, yt + W * 0.19, x1 - W * 0.07, yb - W * 0.30), outline=INK, width=int(lw * 0.8))
    d.line((x0 + W * 0.07, yb - W * 0.22, x1 - W * 0.07, yb - W * 0.22), fill=INK, width=int(lw * 0.8))
    im = im.transform(im.size, Image.AFFINE, (1, 0.18, -0.09 * W, 0, 1, 0), resample=Image.BICUBIC)
    return im.resize((S, S), Image.LANCZOS)


def cards_art(S: int) -> Image.Image:
    """Three cards fanned, as in the logo, with no lettering."""
    ss = 2
    W = S * ss
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    lw = int(W * 0.018)
    cw, ch = W * 0.34, W * 0.47

    def card(cx: float, cy: float, tilt: float) -> None:
        layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
        d.rounded_rectangle(box, radius=int(cw * 0.09), fill=BODY, outline=INK, width=lw)
        m = cw * 0.13
        d.rounded_rectangle((box[0] + m, box[1] + m, box[2] - m, box[3] - m), radius=int(cw * 0.05), outline=INK, width=int(lw * 0.7))
        layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(cx, cy))
        im.alpha_composite(layer)

    cx, cy = W / 2, W / 2
    card(cx - W * 0.21, cy + W * 0.04, 16)
    card(cx + W * 0.21, cy + W * 0.04, -16)
    card(cx, cy - W * 0.02, 0)
    return im.resize((S, S), Image.LANCZOS)


def main() -> int:
    S = b.FACE * b.SS
    heads = b.to_image(b.relief(pack_art(S), S, b.EMBLEM * 0.98, line_gain=7.0), b.FACE)
    tails = b.to_image(b.relief(cards_art(S), S, b.EMBLEM * 0.95, line_gain=7.0), b.FACE)
    sheet = Image.new("RGBA", (b.FACE * 2, b.FACE), (0, 0, 0, 0))
    sheet.paste(heads, (0, 0))
    sheet.paste(tails, (b.FACE, 0))
    if OUT.exists() and "--force" not in sys.argv:
        print(f"{OUT.relative_to(b.ROOT)} exists; bump the -v suffix (or --force before it ships)")
        return 1
    g.save_webp(sheet, OUT, quality=90)
    print(OUT.relative_to(b.ROOT), sheet.size, f"{OUT.stat().st_size // 1024} KB")
    if "--preview" in sys.argv:
        pv = Image.new("RGBA", sheet.size, (0, 0, 0, 255))
        d = ImageDraw.Draw(pv)
        for i in range(2):
            d.ellipse((i * b.FACE + 4, 4, i * b.FACE + b.FACE - 4, b.FACE - 4), fill=(200, 150, 50, 255))
            d.ellipse((i * b.FACE + 32, 32, i * b.FACE + b.FACE - 32, b.FACE - 32), fill=(214, 166, 64, 255))
        pv.alpha_composite(sheet)
        pv.save(sys.argv[sys.argv.index("--preview") + 1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
