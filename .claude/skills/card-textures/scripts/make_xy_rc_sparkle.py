#!/usr/bin/env python3
"""The Radiant Collection's sparkle sheet: a seamless 512 px tile of small hearts,
four-point stars and dots, white with a soft alpha, scattered with a minimum gap.

Photos of Generations' RC cards (texture-refs/f3/SOURCES.txt: Flareon EX RC6,
Sylveon EX RC32, Altaria RC24) show the whole card carrying a confetti of heart
and star shaped foil that lights and darkens as the card turns. The tile is the
shape source for css/holo/xy-fullart.css (`xy-rc`): drawn lighter and moved by the
pointer, never dark (glitter only adds light).

    python3 .claude/skills/card-textures/scripts/make_xy_rc_sparkle.py

Writes assets/foil/xy-rc-sparkle-v1.webp (new file: assets are immutable-cached).
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
T = 512
SS = 3  # supersample


def heart(d, cx, cy, r, a, k):
    pts = []
    for i in range(48):
        t = i / 48 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * r / 17, cy + y * r / 17))
    d.polygon(pts, fill=(255, 255, 255, a))


def star(d, cx, cy, r, a, k):
    pts = []
    for i in range(8):
        ang = i * math.pi / 4 - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.22
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    d.polygon(pts, fill=(255, 255, 255, a))


def dot(d, cx, cy, r, a, k):
    d.ellipse((cx - r * .35, cy - r * .35, cx + r * .35, cy + r * .35), fill=(255, 255, 255, a))


def main():
    rnd = random.Random(1618)
    S = T * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    placed = []
    kinds = [heart] * 5 + [star] * 3 + [dot] * 2
    tries = 0
    while len(placed) < 70 and tries < 20000:
        tries += 1
        x, y = rnd.uniform(0, T), rnd.uniform(0, T)
        r = rnd.choice([9, 11, 13, 16, 19, 23])
        if any(min(abs(x - px), T - abs(x - px)) ** 2 + min(abs(y - py), T - abs(y - py)) ** 2 < (r + pr + 14) ** 2 for px, py, pr in placed):
            continue
        placed.append((x, y, r))
        fn = rnd.choice(kinds)
        a = rnd.randint(150, 255)
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                fn(d, (x + ox) * SS, (y + oy) * SS, r * SS, a, 0)
    img = img.filter(ImageFilter.GaussianBlur(0.9 * SS)).resize((T, T), Image.LANCZOS)
    dest = os.path.join(ROOT, "assets", "foil", "xy-rc-sparkle-v1.webp")
    if os.path.exists(dest) and "--force" not in sys.argv:
        print(dest, "exists; skipped")
        return
    img.save(dest, "WEBP", quality=85, alpha_quality=90, method=6)
    print(len(placed), "shapes", os.path.getsize(dest), "bytes ->", dest)


if __name__ == "__main__":
    main()
