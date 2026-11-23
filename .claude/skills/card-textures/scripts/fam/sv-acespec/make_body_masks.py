#!/usr/bin/env python3
"""ACE SPEC Rare body masks (family sv-acespec).

The scans print the card stock as a neon fuchsia (about rgb(238, 0, 141), hue 324); the real foil card is a deeper
raspberry (hue 330-340). The family tints only the stock, so the cyan ACE SPEC banners, the art window, the item and
the rule box keep their colour. This writes one alpha mask per card: opaque where the scan is the stock pink (high
red, near-zero green, hue 300-345), softened by a 1 px blur so the edge against the white text is not stair-stepped.

  python3 make_body_masks.py            # every ACE SPEC Rare in data/, writes assets/foil/fam/sv-acespec/<id>-body-v1.webp
Run from the repo root.
"""
import colorsys, json, sys
from pathlib import Path
from PIL import Image, ImageFilter

IDS = """sv5-141 sv5-152 sv5-153 sv5-154 sv5-157 sv5-158 sv5-162 sv6-152 sv6-162 sv6-163 sv6-164 sv6-165 sv6-167
sv6pt5-58 sv6pt5-60 sv6pt5-62 sv7-134 sv7-136 sv7-142 sv8-162 sv8-164 sv8-176 sv8-182 sv8-183 sv8-185 sv8-186
sv8-191 sv8pt5-116 sv8pt5-117 sv8pt5-119 sv8pt5-128 sv8pt5-129 sv8pt5-131""".split()
OUT = Path("assets/foil/fam/sv-acespec")
W, H = 367, 512


def window_box(cid):
    """The art window's box from the TCG Live foil map (it is the 150-250 alpha block in the upper half), or None."""
    set_, n = cid.split("-", 1)
    f = Path(f"assets/foil/maps/{set_}/{n}.webp")
    if not f.exists():
        return None
    m = Image.open(f).convert("RGBA").getchannel("A").resize((W, H))
    sel = m.point(lambda v: 255 if 150 <= v <= 250 else 0).crop((int(W * 0.08), int(H * 0.1), int(W * 0.92), int(H * 0.6)))
    bb = sel.getbbox()
    return None if not bb else (bb[0] + int(W * 0.08), bb[1] + int(H * 0.1), bb[2] + int(W * 0.08), bb[3] + int(H * 0.1))


def mask_for(scan: Image.Image, box=None) -> Image.Image:
    rgb = scan.convert("RGB").resize((W, H), Image.LANCZOS)
    a = Image.new("L", (W, H), 0)
    px, pa = rgb.load(), a.load()
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue = h * 360
            if v > 0.45 and s > 0.62 and (hue >= 300 or hue <= 8) and g < 90:
                # full weight on clean stock, fading as it turns toward white text or other inks
                w = min(1.0, (s - 0.62) / 0.2) * min(1.0, (v - 0.45) / 0.25)
                pa[x, y] = int(255 * w)
    if box:  # the item art can be pink too (Max Rod): the window is never stock
        a.paste(0, box)
    return a.filter(ImageFilter.GaussianBlur(0.6))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for cid in IDS:
        set_, n = cid.split("-", 1)
        scan = Path(f"assets/cards/{set_}/{n}.webp")
        if not scan.exists():
            print("missing scan", scan, file=sys.stderr)
            continue
        a = mask_for(Image.open(scan), window_box(cid))
        im = Image.new("RGBA", (W, H), (255, 255, 255, 0))
        im.putalpha(a)
        dst = OUT / f"{cid}-body-v1.webp"
        im.save(dst, "WEBP", quality=80, method=6)
        print(dst, dst.stat().st_size)


if __name__ == "__main__":
    main()
