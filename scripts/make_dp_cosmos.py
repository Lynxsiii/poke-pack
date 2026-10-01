#!/usr/bin/env python3
"""Draw the Diamond & Pearl cosmos tile: assets/foil/dp-cosmos-v1.webp.

What the real foil is (flat scans and photos of dp1 Palkia 11, dp7 Cranidos, Diamond & Pearl Collection
Cynthia's Feelings, Platinum / HGSS holos; /mnt/project-files/every-era/dp/texture-refs/h1/): a DOT-MATRIX
galaxy. Round discs, small plus and diamond clusters and single specks are all built of the same fine
dots (pitch about 0.6% of the card width), scattered over the whole art window, sparse near the edges of
a Pokemon and dense in the sky; the odd short dotted arc or spiral. Every element lights in one
saturated colour (teal, green, cyan, magenta) and the colour sweeps over the card as it tips. It is not
Base Set's star field and not the smooth round planets of the Scarlet & Violet promos.

The tile is white on transparent (alpha is the mask), 736 x 736 px at card scale (a card is about 734 px
wide), seamless in both directions, seeded. The dots inside a disc sit on a slightly jittered grid with
varied dot size so the matrix has no single frequency: a regular screen would beat against the phone's
pixel grid into a line screen at 220 px wide. css/holo/dp.css lays it as a mask, 100% wide, shifted per
card by --seed-x/--seed-y so no two cards show the same patch of sky.

    python3 scripts/make_dp_cosmos.py --out assets/foil/dp-cosmos-v1.webp [--seed 20070523]
"""
import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw

SIZE = 736           # tile edge at card scale
SS = 3               # supersampling
PITCH = 4.6          # dot pitch inside a shape, px at card scale
DOT = 1.55           # dot radius, px


def draw(seed):
    rnd = random.Random(seed)
    W = SIZE * SS
    img = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(img)

    def dot(x, y, r):
        # wraps in both directions so the tile is seamless
        for ox in (-SIZE, 0, SIZE):
            for oy in (-SIZE, 0, SIZE):
                px, py = (x + ox) * SS, (y + oy) * SS
                if -8 < px < W + 8 and -8 < py < W + 8:
                    d.ellipse((px - r * SS, py - r * SS, px + r * SS, py + r * SS), fill=255)

    def grid_shape(cx, cy, inside, extent, pitch=PITCH):
        # a jittered square dot matrix, slightly rotated, keeping the cells whose centre is `inside`
        ang = rnd.uniform(-0.25, 0.25)
        ca, sa = math.cos(ang), math.sin(ang)
        n = int(extent / pitch) + 2
        for i in range(-n, n + 1):
            for j in range(-n, n + 1):
                gx, gy = i * pitch, j * pitch
                x, y = gx * ca - gy * sa, gx * sa + gy * ca
                if not inside(x, y):
                    continue
                jx, jy = rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45)
                dot(cx + x + jx, cy + y + jy, DOT * rnd.uniform(0.78, 1.12))

    def disc(cx, cy, r):
        wob = rnd.uniform(0.04, 0.12)
        ph = rnd.uniform(0, 6.28)
        def inside(x, y):
            a = math.atan2(y, x)
            return math.hypot(x, y) <= r * (1 + wob * math.sin(3 * a + ph))
        grid_shape(cx, cy, inside, r + 2)

    def plus(cx, cy, arm):
        def inside(x, y):
            return (abs(x) < PITCH * 0.6 and abs(y) <= arm * PITCH + 0.1) or (abs(y) < PITCH * 0.6 and abs(x) <= arm * PITCH + 0.1)
        grid_shape(cx, cy, inside, arm * PITCH + 2)

    def diamond(cx, cy, k):
        grid_shape(cx, cy, lambda x, y: abs(x) + abs(y) <= k * PITCH + 0.1, k * PITCH + 2)

    def blot(cx, cy, r):
        # a lobed clover: three or four overlapping small discs
        lobes = rnd.choice((3, 4))
        for k in range(lobes):
            a = rnd.uniform(0, 6.28)
            lr = r * rnd.uniform(0.45, 0.65)
            ox, oy = math.cos(a) * r * 0.5, math.sin(a) * r * 0.5
            def inside(x, y, ox=ox, oy=oy, lr=lr):
                return math.hypot(x - ox, y - oy) <= lr
            grid_shape(cx, cy, inside, r + 2)

    def arc(cx, cy, r, span):
        a0 = rnd.uniform(0, 6.28)
        steps = max(4, int(r * span / 3.2))
        for k in range(steps):
            a = a0 + span * k / steps
            rr = r * (1 + 0.15 * k / steps)
            dot(cx + math.cos(a) * rr, cy + math.sin(a) * rr, DOT * rnd.uniform(0.7, 1.0))

    def swirl(cx, cy, r):
        turns = rnd.uniform(1.4, 2.2)
        steps = int(r * turns * 6.28 / 3.0)
        for k in range(steps):
            t = k / steps
            a = turns * 6.28 * t + rnd.uniform(-0.05, 0.05)
            rr = r * (0.15 + 0.85 * t)
            dot(cx + math.cos(a) * rr, cy + math.sin(a) * rr, DOT * rnd.uniform(0.7, 1.05))

    def spot():
        return rnd.uniform(0, SIZE), rnd.uniform(0, SIZE)

    # big and middle discs, the planets
    for _ in range(5):
        disc(*spot(), rnd.uniform(18, 25))
    for _ in range(16):
        disc(*spot(), rnd.uniform(10, 17))
    for _ in range(34):
        disc(*spot(), rnd.uniform(6, 10))
    for _ in range(22):
        blot(*spot(), rnd.uniform(9, 14))
    # plus and diamond clusters
    for _ in range(70):
        plus(*spot(), rnd.choice((1, 1, 2, 2, 3)))
    for _ in range(45):
        diamond(*spot(), rnd.choice((1, 2, 2)))
    # comma / ring flecks and the odd swirl
    for _ in range(40):
        arc(*spot(), rnd.uniform(2.2, 4.5), rnd.uniform(2.2, 5.0))
    for _ in range(2):
        swirl(*spot(), rnd.uniform(14, 20))
    # single specks and pairs, the bulk of the sky
    for _ in range(1100):
        x, y = spot()
        r = DOT * rnd.uniform(0.7, 1.25)
        dot(x, y, r)
        if rnd.random() < 0.18:
            dot(x + rnd.uniform(-3.5, 3.5), y + rnd.uniform(-3.5, 3.5), r * 0.85)

    a = img.resize((SIZE, SIZE), Image.LANCZOS)
    arr = np.array(a)
    rgba = np.zeros((SIZE, SIZE, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = arr
    return Image.fromarray(rgba, "RGBA")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20070523)
    args = ap.parse_args()
    im = draw(args.seed)
    im.save(args.out, "WEBP", lossless=True, quality=100, method=6)
    cov = np.array(im)[..., 3].mean() / 255
    print(args.out, im.size, f"coverage {cov:.3f}")
