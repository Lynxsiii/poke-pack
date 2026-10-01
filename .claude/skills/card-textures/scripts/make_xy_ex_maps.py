#!/usr/bin/env python3
"""Per-frame foil maps for the XY era's Pokémon-EX, Mega EX, BREAK and Double
Crisis EX (css/holo/xy-ex.css). TCG Live has no maps for XY, so the maps are
drawn from the frame: the layout of every card of a frame is the same (the
per-pixel median of 76 EX, 32 Mega EX and 27 BREAK scans shows the frame as a
sharp rectangle set and the art as noise), so one map per frame, not per card.

Where the foil is (photos: texture-refs/f2-ex-mega-break/SOURCES.txt): the art,
the frame rim and the gold strips; the coloured text box is matte print. The
values follow TCG Live's habit: 1.0 foil, about 0.4 to 0.5 for plates that carry
a name or a short rule (the foil shows, the text stays readable), 0 for text.

    python3 .claude/skills/card-textures/scripts/make_xy_ex_maps.py            # write the four maps
    python3 .claude/skills/card-textures/scripts/make_xy_ex_maps.py --preview OUT.png  # maps over sample scans

Writes assets/foil/maps/xy-ex.webp, xy-mega.webp, xy-dc.webp, xy-break.webp
(new files: assets are immutable-cached, so a changed map gets a -v2 name).
Boxes are in percent of the card, (x0, y0, x1, y1, value).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
W, H = 367, 512
SS = 4

# Each frame: base value, then boxes painted in order (later wins). (x0, y0, x1, y1, value, radius%)
FRAMES = {
    # Regular Pokémon-EX: name plate on top, the art window and the art that breaks out
    # of it down to y 50, the coloured text box (attacks, weakness row, rule box) below.
    "xy-ex": dict(base=1.0, boxes=[
        (10, 3.2, 98.5, 10.2, 0.45, 1.2),        # name plate (the name and HP are print)
        (4.2, 50.4, 95.8, 94.6, 0.0, 1.8),       # the text box
        (47.5, 84.0, 94.0, 94.6, 0.5, 1.0),      # the gold Pokémon-EX rule box: metallic, foil shows
    ]),
    # Mega EX: art to y 55 (full bleed), the gold Mega Evolution rule strip, then the text.
    "xy-mega": dict(base=1.0, boxes=[
        (10, 3.0, 98.5, 10.4, 0.45, 1.2),
        (3.6, 56.0, 96.4, 94.6, 0.0, 1.8),
        (3.6, 56.6, 96.4, 66.0, 0.5, 1.0),       # Mega Evolution rule strip
        (47.5, 84.0, 94.0, 94.6, 0.5, 1.0),
    ]),
    # Double Crisis's Team Magma / Team Aqua EX: the art runs behind everything and the
    # photo's bars pass under the text, so the text zone keeps a floor (0.3), not a hole.
    "xy-dc": dict(base=1.0, boxes=[
        (10, 2.5, 98.5, 9.0, 0.45, 1.2),
        (3.0, 51.0, 97.0, 94.8, 0.3, 1.8),
        (47.0, 84.0, 95.0, 94.8, 0.45, 1.0),
    ]),
    # BREAK (the scan is the landscape card turned to portrait, top of the card on the left):
    # foil is the art area behind the gold Pokémon; the name strip, the rule box and the
    # Pokémon icon are print, the border is plain, the attack text keeps a floor.
    "xy-break": dict(base=0.0, boxes=[
        (11.5, 2.0, 97.5, 98.0, 1.0, 1.5),       # art area
        (11.0, 1.0, 24.6, 45.5, 0.0, 1.5),       # BREAK Evolution Rule box (white, text)
        (3.0, 80.0, 18.0, 99.0, 0.0, 3.0),       # Pokémon icon medallion
        (46.0, 17.0, 96.0, 87.0, 0.3, 2.0),      # attack and ability text
    ]),
}


def draw(frame):
    img = Image.new("L", (W * SS, H * SS), int(round(frame["base"] * 255)))
    d = ImageDraw.Draw(img)
    for x0, y0, x1, y1, v, r in frame["boxes"]:
        box = [x0 / 100 * W * SS, y0 / 100 * H * SS, x1 / 100 * W * SS, y1 / 100 * H * SS]
        d.rounded_rectangle(box, radius=r / 100 * W * SS, fill=int(round(v * 255)))
    img = img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.1))
    return np.asarray(img, np.float32) / 255


def write(name, a):
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.round(a * 255).astype(np.uint8)
    dest = os.path.join(ROOT, "assets", "foil", "maps", f"{name}.webp")
    if os.path.exists(dest) and "--force" not in sys.argv:
        sys.exit(f"{dest} exists: assets are immutable, pick a -v2 name")
    Image.fromarray(out, "RGBA").save(dest, "WEBP", quality=88, alpha_quality=95, method=6)
    print(name, os.path.getsize(dest), "bytes")


def preview(path):
    # one sample scan per frame (any scrydex or site scan), map shown as a red tint where matte
    samples = {"xy-ex": "xy8-62", "xy-mega": "xy2-13", "xy-dc": "dc1-6", "xy-break": "xy8-79"}
    here = os.environ.get("XY_SCANS", "")
    tiles = []
    for name, cid in samples.items():
        f = os.path.join(here, f"{cid}.img")
        if not os.path.exists(f):
            continue
        im = Image.open(f).convert("RGB").resize((W, H))
        a = draw(FRAMES[name])[..., None]
        red = np.array([255, 40, 40], np.float32)
        arr = np.asarray(im, np.float32)
        arr = arr * a + (arr * 0.35 + red * 0.65) * (1 - a)
        tiles.append(Image.fromarray(arr.astype(np.uint8)))
    s = Image.new("RGB", (W * len(tiles), H))
    for i, t in enumerate(tiles):
        s.paste(t, (i * W, 0))
    s.save(path)


if __name__ == "__main__":
    if "--preview" in sys.argv:
        preview(sys.argv[sys.argv.index("--preview") + 1])
    else:
        for n, fr in FRAMES.items():
            write(n, draw(fr))
