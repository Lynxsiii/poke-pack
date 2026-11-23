#!/usr/bin/env python3
"""Resting speck textures for the SV cosmos promos (holo family sv-promo).

The clean Scrydex/malie scans of the SVP cosmos promos show a plain silver border and no dots, while the real card
reads charcoal with white pinpoint dots and grey planets even in flat light. css/holo/fam/sv-promo.css paints these
textures on `.foil` at rest. They are the shipped galaxy layers recoloured: same alpha, white dots, planets a light
grey, so they read as foil specks on charcoal and over the art.

  specks-hd.webp     cosmos-middle-trans + cosmos-top-trans (smooth/HD print)
  specks-pixel.webp  pixel-cosmos (retro/pixel print)

  python3 .claude/skills/card-textures/scripts/fam/sv-promo/make_specks.py   (from the repo root)
"""
import os
import numpy as np
from PIL import Image, ImageFilter

SRC = "assets/foil/promo"
OUT = "assets/foil/fam/sv-promo"
os.makedirs(OUT, exist_ok=True)

def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGBA")).astype(np.float32) / 255

def recolour(a, grey_planets=0.78):
    """Dots white and crisp; the inside of any blob wider than ~5 px (planets, swirl clusters) a grey at low alpha."""
    al = a[..., 3]
    solid = Image.fromarray((al * 255).astype(np.uint8), "L").filter(ImageFilter.MinFilter(5))
    solid = Image.fromarray(np.asarray(solid)).filter(ImageFilter.MaxFilter(5))
    planet = np.asarray(solid).astype(np.float32) / 255 > 0.35
    out = np.zeros_like(a)
    v = np.where(planet, grey_planets, 1.0)
    out[..., 0] = out[..., 1] = out[..., 2] = v
    out[..., 3] = np.where(planet, al * 0.32, np.clip(al * 0.95, 0, 1))
    return out

mid, top = load("cosmos-middle-trans.webp"), load("cosmos-top-trans.webp")
m, t = recolour(mid, 0.72), recolour(top, 0.9)
# top over middle
al = t[..., 3:] + m[..., 3:] * (1 - t[..., 3:])
rgb = (t[..., :3] * t[..., 3:] + m[..., :3] * m[..., 3:] * (1 - t[..., 3:])) / np.maximum(al, 1e-4)
hd = np.concatenate([rgb, al], 2)
Image.fromarray((hd * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(OUT, "specks-hd.webp"), quality=90, method=6)
px = recolour(load("pixel-cosmos.webp"), 0.8)
Image.fromarray((px * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(OUT, "specks-pixel.webp"), lossless=True, method=6)
print("wrote", OUT)
