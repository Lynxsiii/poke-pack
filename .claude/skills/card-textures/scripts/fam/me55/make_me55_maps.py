#!/usr/bin/env python3
"""The me55 family's per-card maps and texture tiles (holo accuracy overhaul, 2026-10-22).

1. Commons and Pikachu Rares: TCG Live's foil map with its "not foil" floor taken to 0. Live's me55 maps hold every
   matte pixel (the Pokémon, the text box) at alpha 33/255, so a recipe masked by them painted 13% of its foil over the
   Pokémon and the rules text. The copy stretches alpha 36..255 to 0..255 (the window's grades kept in order):
   assets/foil/maps/me55/<n>.webp -> assets/foil/fam/me55/maps/<n>-v<V>.webp.
2. Tiles (seeded, seamless), assets/foil/fam/me55/:
   - ice-v1.webp: the Pikachu Rare border's cracked ice. Angular Voronoi flakes, each its own grey (mid to bright) and
     its own tint (silver, light blue, pink), drawn for hard-light: under 0.5 darkens, over 0.5 lightens.
   - flakes-gold-v1.webp: the Pikachu Rare head's faceted glitter. Dense angular flakes coloured for hard-light over
     the head's yellow: gold, green-yellow, orange and olive (taking colour out towards the photos' ochre gold) and
     a few pale ones that flash.
   - rings-v1.webp: StitchedRings, the cast-and-cure bursts. Concentric rings of short radial dashes (bold enough to
     read at phone size: about 1.4% of the card long and 0.5% wide when the tile is drawn at 70% of the card), with a
     fine starburst core. White on transparent: a mask.
   - sparkle-v1.webp: sparse fine glitter points for the commons' border grain and the dark-window sparkle.
   - stars-v1.webp: the Classic Collection border's puffy flat-colour stars (red, orange, yellow, green, cyan).
   - flecks-warm-v1.webp: the Classic border's coarse warm flecks (gold, orange, red, yellow; a little green, cyan).
   - dots-v1.webp: the Classic art background's round confetti, as a mask (the colour comes from the CSS bands).

    python3 .claude/skills/card-textures/scripts/fam/me55/make_me55_maps.py            # everything
    python3 .claude/skills/card-textures/scripts/fam/me55/make_me55_maps.py --tiles    # tiles only
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "foil", "fam", "me55")
SRC = "assets/foil/maps/me55/"
V = 1
FLOOR = 36


def stretched_maps():
    cards = json.load(open(os.path.join(ROOT, "data", "me55.json")))
    os.makedirs(os.path.join(OUT, "maps"), exist_ok=True)
    n = 0
    for c in cards:
        if c.get("rarity") not in ("Common", "Pikachu Rare") or c.get("promo"):
            continue
        m = c.get("foilMap", "")
        if not m.startswith(SRC):
            continue
        im = Image.open(os.path.join(ROOT, m)).convert("RGBA")
        a = np.asarray(im)[..., 3].astype(np.float32)
        a = np.clip((a - FLOOR) / (255 - FLOOR), 0, 1)
        out = np.zeros(a.shape + (4,), np.uint8)
        out[..., :3] = 255
        out[..., 3] = np.round(a * 255).astype(np.uint8)
        name = m[len(SRC):-5]
        Image.fromarray(out, "RGBA").save(os.path.join(OUT, "maps", f"{name}-v{V}.webp"), lossless=True, quality=100, method=6)
        n += 1
    print(f"maps: {n}")


def voronoi_labels(size, n_cells, rng):
    """Seamless Voronoi cell labels on a size x size torus, with jittered 'angular' cells."""
    from scipy.spatial import cKDTree

    pts = rng.random((n_cells, 2)) * size
    # the torus: the points copied into the 8 neighbouring tiles
    tiled = np.concatenate([pts + (ox * size, oy * size) for ox in (-1, 0, 1) for oy in (-1, 0, 1)])
    ids = np.tile(np.arange(n_cells), 9)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    q = np.stack([xx.ravel(), yy.ravel()], 1)
    # Chebyshev metric (p=inf) mixed in: straighter, more angular cell edges than Euclid
    dist, idx = cKDTree(tiled).query(q, k=2, p=np.inf)
    lab = ids[idx[:, 0]].reshape(size, size)
    edge = ((dist[:, 1] - dist[:, 0]) < 1.0).reshape(size, size)
    return lab, edge


def hsv2rgb(h, s, v):
    i = int(h * 6) % 6
    f = h * 6 - int(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    return [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]


def tile_ice(rng):
    size = 512
    lab, edge = voronoi_labels(size, 900, rng)
    n = lab.max() + 1
    # Grey per flake for hard-light: most mid-dark (the mosaic reads grey at rest), some bright.
    g = np.where(rng.random(n) < 0.3, rng.uniform(0.62, 0.86, n), rng.uniform(0.36, 0.52, n))
    tint = rng.choice(3, n, p=[0.5, 0.3, 0.2])  # silver, light blue, pink
    col = np.zeros((n, 3), np.float32)
    for i in range(n):
        v = g[i]
        if tint[i] == 0:
            col[i] = (v, v, v * 1.02)
        elif tint[i] == 1:
            col[i] = (v * 0.86, v * 0.97, min(1, v * 1.1))
        else:
            col[i] = (min(1, v * 1.08), v * 0.88, min(1, v * 1.02))
    img = col[lab]
    img[edge] = img[edge] * 0.9
    Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8), "RGB").save(os.path.join(OUT, "ice-v1.webp"), quality=92)


def tile_flakes(rng):
    """The Pikachu Rare head's faceted glitter, coloured for hard-light over the head's bright yellow: a channel
    under 0.5 takes colour out, over 0.5 adds light. Gold, green-yellow and orange flakes darken the yellow towards
    the photos' ochre-olive gold; a few pale flakes flash. Every cell is a flake (dense, as on the card); edges
    transparent so the olive ground shows as hairline cracks."""
    size = 512
    lab, edge = voronoi_labels(size, 1100, rng)
    n = lab.max() + 1
    kind = rng.choice(5, n, p=[0.32, 0.24, 0.16, 0.18, 0.10])  # gold, green-yellow, orange, olive, pale
    base = {
        0: (0.50, 0.41, 0.28),
        1: (0.37, 0.50, 0.28),
        2: (0.56, 0.36, 0.25),
        3: (0.38, 0.35, 0.22),
        4: (0.86, 0.83, 0.68),
    }
    col = np.zeros((n, 4), np.float32)
    for i in range(n):
        r, g, b = base[int(kind[i])]
        j = rng.uniform(-0.05, 0.07)
        col[i] = (r + j, g + j, b + j * 0.5, 1.0)
    img = col[lab]
    img[edge, 3] = 0
    Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "flakes-gold-v1.webp"), lossless=True)


def tile_rings(rng):
    """StitchedRings: a 1024 tile drawn at 70% of the card, so 1% of the card is 14.6 px here."""
    size = 1024
    ss = 2
    big = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(big)
    unit = size / 70.0  # px per 1% of card width
    bursts = []
    tries = 0
    while len(bursts) < 6 and tries < 400:
        tries += 1
        r = rng.uniform(10, 17.5) * unit  # radius: 20-35% of the card across
        cx, cy = rng.uniform(0, size), rng.uniform(0, size)
        ok = True
        for (bx, by, br) in bursts:
            dx = min(abs(cx - bx), size - abs(cx - bx))
            dy = min(abs(cy - by), size - abs(cy - by))
            if math.hypot(dx, dy) < (r + br) * 0.8:
                ok = False
                break
        if ok:
            bursts.append((cx, cy, r))
    for (cx, cy, r) in bursts:
        spacing = rng.uniform(2.2, 2.8) * unit
        dash = 1.4 * unit
        width = 0.5 * unit
        rad = spacing * 1.6
        k = 0
        while rad < r:
            n = max(10, int(2 * math.pi * rad / (dash * 1.9)))
            phase = rng.uniform(0, 2 * math.pi)
            a_fade = 1.0 - 0.35 * (rad / r)
            for j in range(n):
                th = phase + 2 * math.pi * j / n
                for ox in (-size, 0, size):
                    for oy in (-size, 0, size):
                        x0 = cx + ox + math.cos(th) * (rad - dash / 2)
                        y0 = cy + oy + math.sin(th) * (rad - dash / 2)
                        x1 = cx + ox + math.cos(th) * (rad + dash / 2)
                        y1 = cy + oy + math.sin(th) * (rad + dash / 2)
                        if -60 < x0 < size + 60 and -60 < y0 < size + 60:
                            d.line([(x0 * ss, y0 * ss), (x1 * ss, y1 * ss)], fill=int(255 * a_fade), width=max(1, int(width * ss)))
            rad += spacing
            k += 1
        # the core: a small starburst of fine radial strokes
        for j in range(48):
            th = 2 * math.pi * j / 48 + rng.uniform(-0.05, 0.05)
            ln = spacing * rng.uniform(0.9, 1.5)
            for ox in (-size, 0, size):
                for oy in (-size, 0, size):
                    x0, y0 = cx + ox, cy + oy
                    if -60 < x0 < size + 60 and -60 < y0 < size + 60:
                        d.line([(x0 * ss, y0 * ss), ((x0 + math.cos(th) * ln) * ss, (y0 + math.sin(th) * ln) * ss)], fill=200, width=max(1, int(width * 0.6 * ss)))
    m = big.resize((size, size), Image.LANCZOS)
    rgba = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    rgba.putalpha(m)
    rgba.save(os.path.join(OUT, "rings-v1.webp"), lossless=True)


def tile_sparkle(rng):
    size = 256
    a = np.zeros((size, size), np.float32)
    n = int(size * size * 0.012)
    xs = rng.integers(0, size, n)
    ys = rng.integers(0, size, n)
    v = rng.uniform(0.35, 1.0, n) ** 2
    a[ys, xs] = v
    # a few 2px points
    m = n // 6
    xs2, ys2 = rng.integers(0, size, m), rng.integers(0, size, m)
    for x, y, vv in zip(xs2, ys2, rng.uniform(0.6, 1.0, m)):
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            a[(y + dy) % size, (x + dx) % size] = max(a[(y + dy) % size, (x + dx) % size], vv * (1 if (dx, dy) == (0, 0) else 0.6))
    img = np.repeat(a[..., None], 3, axis=2)
    Image.fromarray(np.round(img * 255).astype(np.uint8), "RGB").save(os.path.join(OUT, "sparkle-v1.webp"), lossless=True)


def tile_stars(rng):
    """The Classic Collection border's puffy stars: flat saturated red, orange, yellow, green and cyan five-point
    stars with rounded points, about 3.2% of the card wide when the tile is drawn at 40% of the card (41 px here),
    dense enough that one lands on the border every tenth of its length."""
    size = 512
    ss = 4
    big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    cols = [(235, 45, 40), (250, 130, 25), (250, 215, 30), (60, 200, 70), (40, 200, 235)]
    pts = []
    tries = 0
    while len(pts) < 16 and tries < 2000:
        tries += 1
        x, y = rng.uniform(0, size), rng.uniform(0, size)
        if all(min(abs(x - a), size - abs(x - a)) ** 2 + min(abs(y - b), size - abs(y - b)) ** 2 > 90 ** 2 for a, b in pts):
            pts.append((x, y))
    for (x, y) in pts:
        r = rng.uniform(19, 22)
        rot = rng.uniform(0, 2 * math.pi)
        col = cols[int(rng.integers(0, len(cols)))]
        poly = []
        for k in range(10):
            rr = r if k % 2 == 0 else r * 0.55
            th = rot + k * math.pi / 5
            poly.append((math.cos(th) * rr, math.sin(th) * rr))
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d.polygon([((x + ox + px) * ss, (y + oy + py) * ss) for px, py in poly], fill=col + (255,))
    # puff: soften the points a little (blur the alpha, re-threshold softly)
    a = np.asarray(big)[..., 3].astype(np.float32) / 255
    from scipy import ndimage as ndi
    a = ndi.gaussian_filter(a, ss * 2.2, mode="wrap")
    a = np.clip((a - 0.35) / 0.2, 0, 1)
    rgb = np.asarray(big)[..., :3].astype(np.float32)
    # spread the colour under the softened alpha
    for c in range(3):
        rgb[..., c] = ndi.maximum_filter(rgb[..., c], size=ss * 3, mode="wrap")
    out = np.dstack([rgb, a * 255]).astype(np.uint8)
    Image.fromarray(out, "RGBA").resize((size, size), Image.LANCZOS).save(os.path.join(OUT, "stars-v1.webp"), lossless=True)


def tile_flecks_warm(rng):
    """The Classic Collection border's coarse warm flecks: angular flakes (Voronoi cells, 0.5-1% of the card when the
    tile is drawn at 20% of the card) in gold, orange, red and yellow with a little green and cyan, on a transparent
    ground; about 40% of the area, as in the macro photos of Lugia and Gengar."""
    size = 512
    lab, edge = voronoi_labels(size, 1000, rng)
    n = lab.max() + 1
    on = rng.random(n) < 0.42
    pal = np.array([(1.0, 0.82, 0.3), (1.0, 0.55, 0.15), (0.95, 0.26, 0.15), (1.0, 0.93, 0.45), (0.45, 0.9, 0.3), (0.3, 0.85, 0.95)], np.float32)
    kind = rng.choice(len(pal), n, p=[0.3, 0.24, 0.16, 0.18, 0.08, 0.04])
    br = rng.uniform(0.7, 1.0, n)
    col = np.zeros((n, 4), np.float32)
    col[:, :3] = pal[kind] * br[:, None]
    col[:, 3] = on.astype(np.float32)
    img = col[lab]
    img[edge, 3] = 0
    Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "flecks-warm-v1.webp"), lossless=True)


def tile_dots(rng):
    """The Classic Collection art background's round confetti, as a mask: white dots with alpha 0.5-1, 0.3-0.75% of
    the card across when the tile is drawn at 16% of the card, about a third of the area."""
    size = 512
    ss = 3
    big = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(big)
    for _ in range(900):
        x, y = rng.uniform(0, size), rng.uniform(0, size)
        r = rng.uniform(5, 12)
        v = int(255 * rng.uniform(0.5, 1.0))
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                cx, cy = x + ox, y + oy
                if -20 < cx < size + 20 and -20 < cy < size + 20:
                    d.ellipse([(cx - r) * ss, (cy - r) * ss, (cx + r) * ss, (cy + r) * ss], fill=v)
    a = big.resize((size, size), Image.LANCZOS)
    rgba = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    rgba.putalpha(a)
    rgba.save(os.path.join(OUT, "dots-v1.webp"), lossless=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", action="store_true", help="tiles only")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(5530)
    tile_ice(rng)
    tile_flakes(rng)
    tile_rings(rng)
    tile_sparkle(rng)
    tile_stars(rng)
    tile_flecks_warm(rng)
    tile_dots(rng)
    print("tiles: ice-v1, flakes-gold-v1, rings-v1, sparkle-v1, stars-v1, flecks-warm-v1, dots-v1")
    if not args.tiles:
        stretched_maps()


if __name__ == "__main__":
    main()
