#!/usr/bin/env python3
"""Foil maps for two SVP cosmos promos whose shipped maps put the art window's foil over the Pokemon
(holo family sv-promo; the audit w2-sv-promo).

  map-sv4-svp061.webp  Pineco: the shipped svp061-v2 map with Pineco's body cut out (teal body and its dark
                       shading, segmented from the scan inside Pineco's box, closed and grown by a few pixels).
  map-sv4-svp063.webp  Cetitan: the shipped svp063-v2 map with the art window cleared (Cetitan fills most of the
                       window and its white body cannot be told from the snow, so only the border keeps the foil).

  python3 .claude/skills/card-textures/scripts/fam/sv-promo/make_maps.py   (from the repo root)
"""
import colorsys
import numpy as np
from PIL import Image, ImageFilter

OUT = "assets/foil/fam/sv-promo"

def load_map(path):
    return Image.open(path).convert("RGBA")

# Pineco
m = load_map("assets/foil/maps/sv4/svp061-v2.webp")
card = np.asarray(Image.open("assets/cards/sv4/svp061.webp").convert("RGB")).astype(np.float32) / 255
h, w, _ = card.shape
mx, mn = card.max(2), card.min(2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-4), 0)
r, g, b = card[..., 0], card[..., 1], card[..., 2]
teal = (b > r + 0.04) & (g > r + 0.02) & (sat > 0.18) & (mx < 0.85)
dark = mx < 0.28
box = np.zeros((h, w), bool)
box[int(h * 0.15):int(h * 0.45), int(w * 0.30):int(w * 0.70)] = True
body = Image.fromarray(((teal | dark) & box).astype(np.uint8) * 255, "L")
body = body.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(5))
body = body.filter(ImageFilter.GaussianBlur(1.5)).resize(m.size, Image.LANCZOS)
a = np.asarray(m).copy()
a[..., 3] = (a[..., 3].astype(np.float32) * (1 - np.asarray(body).astype(np.float32) / 255)).astype(np.uint8)
Image.fromarray(a, "RGBA").save(f"{OUT}/map-sv4-svp061.webp", lossless=True)

# Cetitan: clear the window (alpha 130 there), keep the border (255).
m = load_map("assets/foil/maps/sv4/svp063-v2.webp")
a = np.asarray(m).copy()
a[..., 3] = np.where(a[..., 3] < 200, 0, a[..., 3])
Image.fromarray(a, "RGBA").save(f"{OUT}/map-sv4-svp063.webp", lossless=True)
print("wrote maps")
