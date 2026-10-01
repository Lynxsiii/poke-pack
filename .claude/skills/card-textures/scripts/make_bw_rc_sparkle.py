#!/usr/bin/env python3
"""Legendary Treasures' Radiant Collection: the sparkle tile and the two safe maps.

Photos (texture-refs/g3/SOURCES.txt: Pikachu RC7, Growlithe RC4, Eevee RC14, Mew-EX RC24, Reshiram RC22) and
Bleeding Cool ("a tiny, dotted pattern that resembles glittering jewelry") show a confetti of tiny round
glitter dots over the whole art window and the lower box, a few four-point stars, and on the Eevee a heart
made of dots; no rainbow bands. TCG Live has no map for the Radiant Collection, so the maps are ours.

    python3 .claude/skills/card-textures/scripts/make_bw_rc_sparkle.py

Writes (new names; assets are immutable-cached, an existing file is never overwritten):
  assets/foil/bw-rc-sparkle-v1.webp       512 px seamless tile: white dots with a soft alpha, a few stars
  assets/foil/maps/bw-rc-v1.webp          367x512 map of the regular frame: art window full, text box about half
  assets/foil/maps/bw-rc-fa-v1.webp       367x512 map of the full arts and RC11 (whole card, name bar and text calmer)
Geometry measured on the 17 regular-frame RC scans (std-dev across cards): window x 5.4-94.8 percent, y 10.9-48.8
percent; text box y 52-94 percent.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
T, SS = 512, 3


def star(d, cx, cy, r, a):
    pts = []
    for i in range(8):
        ang = i * math.pi / 4 - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.2
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    d.polygon(pts, fill=(255, 255, 255, a))


def sparkle():
    rnd = random.Random(2013)
    S = T * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    placed = []
    tries = 0
    while len(placed) < 520 and tries < 60000:
        tries += 1
        x, y = rnd.uniform(0, T), rnd.uniform(0, T)
        r = rnd.choice([2.2, 2.8, 3.4, 4.0, 5.0])
        if any(min(abs(x - px), T - abs(x - px)) ** 2 + min(abs(y - py), T - abs(y - py)) ** 2 < (r + pr + 6) ** 2 for px, py, pr in placed):
            continue
        placed.append((x, y, r))
        a = rnd.randint(140, 255)
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                d.ellipse(((x + ox - r) * SS, (y + oy - r) * SS, (x + ox + r) * SS, (y + oy + r) * SS), fill=(255, 255, 255, a))
    stars = 0
    tries = 0
    while stars < 14 and tries < 5000:
        tries += 1
        x, y = rnd.uniform(0, T), rnd.uniform(0, T)
        r = rnd.choice([11, 14, 17])
        if any(min(abs(x - px), T - abs(x - px)) ** 2 + min(abs(y - py), T - abs(y - py)) ** 2 < (r + pr + 8) ** 2 for px, py, pr in placed):
            continue
        placed.append((x, y, r))
        stars += 1
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                star(d, (x + ox) * SS, (y + oy) * SS, r * SS, 255)
    return img.filter(ImageFilter.GaussianBlur(0.6 * SS)).resize((T, T), Image.LANCZOS), len(placed)


def rect_map(rects, base=0.0, soft=2.0):
    W, H = 367, 512
    m = Image.new("L", (W, H), int(base * 255))
    d = ImageDraw.Draw(m)
    for (x0, y0, x1, y1, a) in rects:
        d.rectangle((x0 * W, y0 * H, x1 * W, y1 * H), fill=int(a * 255))
    m = m.filter(ImageFilter.GaussianBlur(soft))
    out = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    out.putalpha(m)
    return out


def save_new(img, rel, **kw):
    dest = os.path.join(ROOT, rel)
    if os.path.exists(dest):
        print(dest, "exists; skipped")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    img.save(dest, "WEBP", quality=88, alpha_quality=95, method=6, **kw)
    print(os.path.getsize(dest), "bytes ->", dest)


def main():
    tile, n = sparkle()
    print(n, "shapes")
    save_new(tile, "assets/foil/bw-rc-sparkle-v1.webp")
    regular = rect_map([(0.054, 0.109, 0.948, 0.488, 1.0), (0.06, 0.525, 0.94, 0.925, 0.5)])
    save_new(regular, "assets/foil/maps/bw-rc-v1.webp")
    full = rect_map([(0.0, 0.0, 1.0, 1.0, 0.8), (0.0, 0.035, 1.0, 0.11, 0.55), (0.05, 0.52, 0.95, 0.93, 0.42)], soft=3.0)
    save_new(full, "assets/foil/maps/bw-rc-fa-v1.webp")


if __name__ == "__main__":
    main()
