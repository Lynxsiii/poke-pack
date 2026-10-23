#!/usr/bin/env python3
"""Tiles for the holo family sv-reverse (css/holo/fam/sv-reverse.css).

  grain-v1.webp   the fine sandy grain of the Scarlet & Violet reverse foil (the Grimer SVI 126 and Greavard PAF macros):
                  white pinpoint specks on transparent, one tile pixel each, most of them dim. Drawn at 64 CSS px per
                  192 px tile, a speck is a third of a CSS px (one device pixel on a 3x phone). It rides the lit `.cure`
                  layer (overlay), so it only ever lightens, and noticed second.
  <pattern>-dark-v1.webp
                  the cobblestone of each type (the era's assets/foil/sv-reverse/<pattern>.webp: TCG Live's reverse
                  map, grey = how bare the foil is, alpha = where the card is foil) turned into the mask the photos
                  call for: white, alpha = d inside the foil region, d = clip((grey - 0.35) / 0.65) ** 1.4. TCG Live's
                  white network (the barest foil, the darkest part of a real card in room light) is 1, the pebbles
                  0.25-0.7, the symbols, stars and badge ring 0; blurred by 0.9 px and faded in over the region's edge,
                  so no sliver of it reads as a dark speck (dark_specks.py). The sheet multiplies a grey through it (`.foil`) and
                  lights the rest of the region (`.cure`, the era pattern's alpha minus this). A mask, not a
                  background: WebKit paints a CSS background image only once it has decoded it, so a fresh card can
                  flash plain; masks were reliable in every render.
  chain-v1.svg    Shrouded Fable's reverse: Poké Balls in double-outlined hexagons, the same geometry as the era's
                  assets/foil/sv6pt5/chain.svg (drawn to PokeBeach's set guide photos), redrawn as a multiply map:
                  white hexagon cells, the field between them a little darker, the double outlines and the balls a
                  clear step darker (the Joltik SFA 001 and Genesect SFA 040 photos: bold outlines in a darker shade
                  of the frame colour, lighter cells).
  chain-light-v1.svg
                  the same chain as an alpha mask for the lit `.cure` layer: the cells 1, the field 0.75, the outlines
                  and the balls 0.2, so the light lands on the cells and the outlines stay dark (the chain stays plain
                  under a lamp, as in the Horsea SFA 010 photo). Alpha comes from an SVG <mask>, so the CSS mask can
                  stay in alpha mode (WebKit and Chromium agree on it).
  inks            prints the per-type multiply colour the sheet uses on a coloured frame (`python3 ... inks`):
                  ink = 0.94 * (1 - k * (1 - c^2)), c the median frame colour of the type's reverse scans, k = 0.6
                  (0.45 on Darkness).

Run from the repo root: python3 .claude/skills/card-textures/scripts/fam/sv-reverse/make_sv_reverse_tiles.py
Never overwrite a shipped name: bump the -vN suffix and point the sheet at the new file.
"""
import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

OUT = "assets/foil/fam/sv-reverse"


def grain(path, size=192, density=0.07, seed=7):
    rng = np.random.default_rng(seed)
    alpha = np.zeros((size, size), np.float32)
    n = int(size * size * density)
    ys = rng.integers(0, size, n)
    xs = rng.integers(0, size, n)
    # most specks dim, a few bright: an exponential spread of levels
    lv = np.clip(rng.exponential(0.32, n), 0.08, 1.0)
    alpha[ys, xs] = np.maximum(alpha[ys, xs], lv)
    rgba = np.zeros((size, size, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, lossless=True, quality=100, method=6)


PATTERNS = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless",
            "trainer", "special-energy"]
FLOOR, GAMMA = 0.35, 1.4
BLUR, FEATHER = 0.9, 1.6


def soft(a, blur):
    return np.asarray(Image.fromarray((a * 255).round().astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))) / 255


def dark(src, path):
    im = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32) / 255
    d = np.clip((im[..., 0] - FLOOR) / (1 - FLOOR), 0, 1) ** GAMMA
    # A touch of blur (the map is 512 px for a 614 px card at scale 2): slivers and dots of the network a pixel or two
    # wide no longer leave hard dark specks; the network itself (3-6 px) keeps its edge.
    d = soft(d, BLUR)
    # The region pulled in by two map pixels and feathered, so the darkening fades in at the silver border, the art
    # window and the name bar instead of stopping on a hard edge in fragments (dark_specks.py counted those).
    region = np.asarray(Image.fromarray((im[..., 3] * 255).round().astype(np.uint8)).filter(ImageFilter.MinFilter(5)))
    region = soft(region / 255, FEATHER)
    rgba = np.full(im.shape, 255, np.uint8)
    rgba[..., 3] = (d * region * 255).round().astype(np.uint8)
    # alpha_quality 70: half the lossless size, mean error 1.3 levels (max 12 at an edge)
    Image.fromarray(rgba, "RGBA").save(path, quality=80, alpha_quality=70, method=6)


def hexagon(cx, cy, r):
    pts = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (-90, -30, 30, 90, 150, 210)]
    return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "Z"


def chain(path):
    # same lattice as assets/foil/sv6pt5/chain.svg: hexagon centres at (30,26), (90,78) and their wraps, outer radius 30
    centres = [(30, 26), (30, 130), (90, 78), (90, -26)]
    cells, outer, inner, balls = [], [], [], []
    for cx, cy in centres:
        cells.append(hexagon(cx, cy, 28.0))
        outer.append(hexagon(cx, cy, 30.0))
        inner.append(hexagon(cx, cy, 26.0))
        balls.append(
            f"M{cx - 13} {cy}h8.5m9 0h8.5"
            f"M{cx + 13} {cy}a13 13 0 1 1 -26 0a13 13 0 1 1 26 0"
            f"M{cx + 4.5} {cy}a4.5 4.5 0 1 1 -9 0a4.5 4.5 0 1 1 9 0"
        )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 104" width="120" height="104">
  <!-- Shrouded Fable reverse, the multiply map of css/holo/fam/sv-reverse.css (scripts/fam/sv-reverse/make_sv_reverse_tiles.py). -->
  <rect width="120" height="104" fill="#e4e4e4"/>
  <path d="{''.join(cells)}" fill="#ffffff"/>
  <g fill="none" stroke="#8a8a8a" stroke-linejoin="round">
    <path d="{''.join(outer)}" stroke-width="2.4"/>
    <path d="{''.join(inner)}" stroke-width="1.5"/>
    <path d="{''.join(balls)}" stroke-width="2.1"/>
  </g>
</svg>
"""
    with open(path, "w") as f:
        f.write(svg)


def chain_light(path):
    centres = [(30, 26), (30, 130), (90, 78), (90, -26)]
    cells, outer, inner, balls = [], [], [], []
    for cx, cy in centres:
        cells.append(hexagon(cx, cy, 28.0))
        outer.append(hexagon(cx, cy, 30.0))
        inner.append(hexagon(cx, cy, 26.0))
        balls.append(
            f"M{cx - 13} {cy}h8.5m9 0h8.5"
            f"M{cx + 13} {cy}a13 13 0 1 1 -26 0a13 13 0 1 1 26 0"
            f"M{cx + 4.5} {cy}a4.5 4.5 0 1 1 -9 0a4.5 4.5 0 1 1 9 0"
        )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 104" width="120" height="104">
  <!-- Shrouded Fable reverse, the lit layer's alpha mask (css/holo/fam/sv-reverse.css; scripts/fam/sv-reverse/make_sv_reverse_tiles.py). -->
  <defs>
    <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="104">
      <rect width="120" height="104" fill="#bfbfbf"/>
      <path d="{''.join(cells)}" fill="#ffffff"/>
      <g fill="none" stroke="#333333" stroke-linejoin="round">
        <path d="{''.join(outer)}" stroke-width="2.4"/>
        <path d="{''.join(inner)}" stroke-width="1.5"/>
        <path d="{''.join(balls)}" stroke-width="2.1"/>
      </g>
    </mask>
  </defs>
  <rect width="120" height="104" fill="#ffffff" mask="url(#m)"/>
</svg>
"""
    with open(path, "w") as f:
        f.write(svg)


INK_K = {"darkness": 0.45}


def inks():
    import glob
    import json
    import random

    random.seed(3)
    by = {}
    for f in sorted(glob.glob("data/*.json")):
        set_id = os.path.basename(f)[:-5]
        if not re.match(r"^[rz]?sv\d", set_id):
            continue
        d = json.load(open(f))
        for c in d["cards"] if isinstance(d, dict) else d:
            t = (c.get("types") or [""])[0].lower()
            if c.get("supertype") == "Pokémon" and t and t not in ("colorless", "metal") and c.get("image"):
                by.setdefault(t, []).append(c["image"])
    for t, imgs in sorted(by.items()):
        dm = np.asarray(Image.open(os.path.join(OUT, f"{t}-dark-v1.webp")).convert("RGBA"))[..., 3] / 255
        reg = np.asarray(Image.open(f"assets/foil/sv-reverse/{t}.webp").convert("RGBA"))[..., 3] / 255
        cols = []
        for img in random.sample(imgs, min(14, len(imgs))):
            if not os.path.exists(img):
                continue
            a = np.asarray(Image.open(img).convert("RGB").resize((dm.shape[1], dm.shape[0]))).astype(np.float32) / 255
            m = (reg > 0.9) & (dm > 0.15) & (dm < 0.6) & (a @ [0.299, 0.587, 0.114] > 0.3)
            if m.sum() > 500:
                cols.append(np.median(a[m], 0))
        c = np.median(np.array(cols), 0)
        ink = 0.94 * (1 - INK_K.get(t, 0.6) * (1 - c * c))
        print(f"{t:10s} frame {'#' + ''.join(f'{round(v * 255):02x}' for v in c)}  ink {'#' + ''.join(f'{round(v * 255):02x}' for v in ink)}")


def main():
    if not os.path.isdir(OUT):
        sys.exit(f"run from the repo root ({OUT} missing)")
    if sys.argv[1:] == ["inks"]:
        return inks()
    grain(os.path.join(OUT, "grain-v1.webp"))
    for name in PATTERNS:
        dark(f"assets/foil/sv-reverse/{name}.webp", os.path.join(OUT, f"{name}-dark-v1.webp"))
    chain(os.path.join(OUT, "chain-v1.svg"))
    chain_light(os.path.join(OUT, "chain-light-v1.svg"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
