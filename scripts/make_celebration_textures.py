"""Generate the 30th Celebration foil textures.

Each one is drawn from what the physical cards show (photos and TCG Live's
finish names, see the card-textures skill's reference/30th-celebration.md),
from a seeded RNG, so the output is ours and reproducible. Every texture
tiles: anything that crosses an edge is drawn again on the opposite side.

    python3 scripts/make_celebration_textures.py

Outputs (assets/foil/celebration/), sizes relative to the card's width W,
which is how the CSS sizes each tile:

    southern-cross.webp  tile = 0.62W  Double Rare cast-and-cure: four-point
                                       sparkles, eight-point stars and crosses,
                                       each one flat colour (RGBA)
    stitched-rings.webp  tile = 0.70W  Pikachu Rare cast-and-cure: firework
                                       bursts, a hairline core inside rings of
                                       short radial dashes (white + alpha)
    cracked-ice.webp     tile = 0.24W  Pikachu Rare foil: small angular flakes,
                                       each its own brightness (grey)
    confetti.webp        tile = 0.30W  Classic Collection: dense round glitter
                                       dots, iridescent, on black
    classic-stars.webp   tile = 0.60W  Classic Collection: sparse puffy
                                       five-point stars, each one flat colour
                                       (RGBA)
    glitter-grid.webp    tile = 0.20W  Futuristic Rare: pin-point dots on an
                                       almost regular grid, on black
"""
from __future__ import annotations

import colorsys
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "foil" / "celebration"
SEED = 20260916  # the set's release date
SS = 4  # supersampling factor for anything drawn with polygons


def wrap_offsets(x: float, y: float, r: float, size: int):
    """Positions to draw a shape of radius r at (x, y) so it tiles."""
    xs = [x] + ([x + size] if x - r < 0 else []) + ([x - size] if x + r > size else [])
    ys = [y] + ([y + size] if y - r < 0 else []) + ([y - size] if y + r > size else [])
    return [(a, b) for a in xs for b in ys]


def star_points(cx, cy, r_outer, r_inner, points, rot=0.0, radii=None):
    pts = []
    for i in range(points * 2):
        ang = rot + math.pi * i / points - math.pi / 2
        if i % 2 == 0:
            r = r_outer * (radii[(i // 2) % len(radii)] if radii else 1)
        else:
            r = r_inner
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return pts


def sparkle_points(cx, cy, r, rot=0.0, p=0.45, n=96):
    """A concave four-point sparkle: the superellipse |x|^p + |y|^p = r^p."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        x = r * math.copysign(abs(c) ** (2 / p), c)
        y = r * math.copysign(abs(s) ** (2 / p), s)
        xr = x * math.cos(rot) - y * math.sin(rot)
        yr = x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + xr, cy + yr))
    return pts


def spectral(rng: random.Random, sat=1.0, val=1.0):
    h = rng.random()
    r, g, b = colorsys.hsv_to_rgb(h, sat, val)
    return int(r * 255), int(g * 255), int(b * 255)


def save(img: Image.Image, name: str, quality=88):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    img.save(path, "WEBP", quality=quality, alpha_quality=90, method=6)
    print(f"  {name:22s} {img.size[0]}x{img.size[1]}  {path.stat().st_size / 1024:.0f} KB")


def southern_cross(size=512, stars=26):
    """Coloured star glints, as on the Double Rares (Umbreon ex shows ~35 in
    the upper art). 1.5-5% of card width at a 0.62W tile is 12-41 px across;
    drawn a little bolder than that so they read at binder size."""
    rng = random.Random(SEED + 1)
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Spread out (a minimum spacing), with some in twos and threes.
    placed = []
    while len(placed) < stars:
        x, y = rng.random() * size, rng.random() * size
        near = min((min(abs(x - a), size - abs(x - a)) ** 2 + min(abs(y - b), size - abs(y - b)) ** 2
                    for a, b in placed), default=1e9)
        if near < 78 ** 2:
            continue
        placed.append((x, y))
        if rng.random() < 0.35:
            placed.append(((x + rng.uniform(18, 34) * rng.choice([-1, 1])) % size,
                           (y + rng.uniform(18, 34) * rng.choice([-1, 1])) % size))
    for x, y in placed:
        kind = rng.random()
        r = rng.uniform(11, 30)
        colour = spectral(rng) + (255,)
        rot = rng.uniform(-0.25, 0.25)
        for ox, oy in wrap_offsets(x, y, r, size):
            cx, cy, rr = ox * SS, oy * SS, r * SS
            if kind < 0.55:
                draw.polygon(sparkle_points(cx, cy, rr, rot, p=0.55), fill=colour)
            elif kind < 0.85:
                draw.polygon(star_points(cx, cy, rr, rr * 0.2, 8, rot, radii=[1, 0.55]), fill=colour)
            else:
                draw.polygon(sparkle_points(cx, cy, rr, rot, p=0.35), fill=colour)
                draw.polygon(sparkle_points(cx, cy, rr * 0.55, rot + math.pi / 4, p=0.35), fill=colour)
    save(img.resize((size, size), Image.LANCZOS), "southern-cross.webp")


def stitched_rings(size=1024):
    """Firework bursts: rings of short radial dashes around a hairline core.
    At a 0.70W tile: bursts 20-34% of W across, dashes ~1.1% long, rings
    ~2.5% apart (reference/30th-celebration.md, Pikachu Rare)."""
    rng = random.Random(SEED + 2)
    big = size * SS
    img = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(img)
    u = size / 0.70  # px per card width
    # Bursts overlap and cover the face, as on the cards.
    bursts = [(0.22, 0.28, 0.17), (0.74, 0.60, 0.16), (0.28, 0.80, 0.13),
              (0.82, 0.10, 0.12), (0.55, 0.05, 0.08), (0.02, 0.58, 0.10), (0.56, 0.92, 0.07)]
    for bx, by, rad in bursts:
        cx, cy, R = bx * size, by * size, rad * u
        strength = rng.uniform(0.75, 1.0)
        core = R * 0.28
        # Hairline core: fine radial lines.
        for i in range(56):
            a = 2 * math.pi * i / 56 + rng.uniform(-0.02, 0.02)
            r0 = core * rng.uniform(0.15, 0.4)
            r1 = core * rng.uniform(0.7, 1.0)
            for ox, oy in wrap_offsets(cx, cy, R, size):
                draw.line([((ox + r0 * math.cos(a)) * SS, (oy + r0 * math.sin(a)) * SS),
                           ((ox + r1 * math.cos(a)) * SS, (oy + r1 * math.sin(a)) * SS)],
                          fill=int(170 * strength), width=max(1, int(0.0016 * u * SS)))
        # Rings of radial dashes.
        ring_gap, dash_len, dash_w = 0.022 * u, 0.011 * u, 0.0032 * u
        r = core + ring_gap * 0.8
        k = 0
        while r < R:
            step = 0.017 * u / r  # dash pitch along the ring
            n = max(8, int(2 * math.pi / step))
            phase = rng.random() * 2 * math.pi / n if k % 2 else 0
            fade = 1 - 0.35 * (r - core) / (R - core)
            for i in range(n):
                a = phase + 2 * math.pi * i / n
                half = dash_len * rng.uniform(0.35, 0.6)
                l0, l1 = r - half, r + half
                for ox, oy in wrap_offsets(cx, cy, R + dash_len, size):
                    draw.line([((ox + l0 * math.cos(a)) * SS, (oy + l0 * math.sin(a)) * SS),
                               ((ox + l1 * math.cos(a)) * SS, (oy + l1 * math.sin(a)) * SS)],
                              fill=int(255 * strength * fade), width=max(1, int(dash_w * SS)))
            r += ring_gap
            k += 1
    alpha = img.resize((size, size), Image.LANCZOS)
    white = Image.new("L", (size, size), 255)
    save(Image.merge("RGBA", (white, white, white, alpha)), "stitched-rings.webp")


def voronoi_flakes(size, cells, rng, edge=0.9):
    """Periodic Voronoi: a cell id and edge distance per pixel."""
    pts = np.array([[rng.random() * size, rng.random() * size] for _ in range(cells)])
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    best = np.full((size, size), np.inf, np.float32)
    second = np.full((size, size), np.inf, np.float32)
    ids = np.zeros((size, size), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, size - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, size - dy)
        # Chebyshev-leaning metric: angular flakes rather than soft cells.
        d = np.maximum(dx, dy) * 0.55 + np.hypot(dx, dy) * 0.45
        closer = d < best
        second = np.where(closer, best, np.minimum(second, d))
        best = np.where(closer, d, best)
        ids = np.where(closer, i, ids)
    return ids, second - best


def cracked_ice(size=512):
    """Angular flakes 0.5-1% of W across, each its own brightness; the
    Pikachu Rare's border and foil windows. At 0.24W, a flake is ~16 px."""
    rng = random.Random(SEED + 3)
    ids, edge = voronoi_flakes(size, 950, rng)
    levels = np.array([rng.random() ** 2.2 for _ in range(ids.max() + 1)], np.float32)
    v = levels[ids]
    v = np.where(edge < 1.2, v * 0.35, v)  # the crack between flakes
    img = Image.fromarray((v * 255).clip(0, 255).astype(np.uint8), "L")
    save(img.convert("RGB"), "cracked-ice.webp", quality=90)


def confetti(size=512, dots=700):
    """Classic Collection glitter: round dots 0.4-0.9% of W (7-15 px at a
    0.30W tile), iridescent: gold, white-green, cyan, blue, orange."""
    rng = random.Random(SEED + 4)
    big = size * SS
    img = Image.new("RGB", (big, big), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    hues = [0.12, 0.14, 0.30, 0.50, 0.58, 0.62, 0.08]
    for _ in range(dots):
        x, y = rng.random() * size, rng.random() * size
        r = rng.uniform(3.5, 7.5)
        h = (rng.choice(hues) + rng.uniform(-0.03, 0.03)) % 1
        s = rng.uniform(0.25, 0.8)
        v = rng.uniform(0.35, 1.0) ** 1.5
        c = tuple(int(255 * t) for t in colorsys.hsv_to_rgb(h, s, v))
        for ox, oy in wrap_offsets(x, y, r, size):
            draw.ellipse([(ox - r) * SS, (oy - r) * SS, (ox + r) * SS, (oy + r) * SS], fill=c)
    save(img.resize((size, size), Image.LANCZOS), "confetti.webp")


def classic_stars(size=512, stars=6):
    """Puffy rounded five-point stars, about 4.5% of W across (a 0.60W tile),
    sparse, each one flat colour."""
    rng = random.Random(SEED + 5)
    big = size * SS
    colours = [(255, 96, 40), (255, 150, 30), (255, 222, 60), (170, 235, 255), (90, 230, 120), (255, 120, 170)]
    shape = Image.new("L", (big, big), 0)
    colour = Image.new("RGB", (big, big), (0, 0, 0))
    placed = []
    while len(placed) < stars:
        x, y = rng.random() * size, rng.random() * size
        if all(min(abs(x - a), size - abs(x - a)) ** 2 + min(abs(y - b), size - abs(y - b)) ** 2 > 130 ** 2 for a, b in placed):
            placed.append((x, y))
    for i, (x, y) in enumerate(placed):
        r = rng.uniform(21, 25)
        rot = rng.uniform(0, 2 * math.pi)
        c = colours[i % len(colours)]
        for ox, oy in wrap_offsets(x, y, r * 1.3, size):
            layer = Image.new("L", (big, big), 0)
            ImageDraw.Draw(layer).polygon(star_points(ox * SS, oy * SS, r * SS, r * 0.5 * SS, 5, rot), fill=255)
            # Puffy: round the points off.
            layer = layer.filter(ImageFilter.GaussianBlur(r * SS * 0.16)).point(lambda p: 255 if p > 110 else 0)
            shape = Image.fromarray(np.maximum(np.asarray(shape), np.asarray(layer)))
            ImageDraw.Draw(colour).rectangle([(ox - 2 * r) * SS, (oy - 2 * r) * SS, (ox + 2 * r) * SS, (oy + 2 * r) * SS], fill=c)
    alpha = shape.resize((size, size), Image.LANCZOS)
    rgb = colour.resize((size, size), Image.NEAREST)
    save(Image.merge("RGBA", (*rgb.split(), alpha)), "classic-stars.webp")


def glitter_grid(size=256, pitch=8):
    """Futuristic Rare glitter: pin-point dots on an almost regular grid,
    most dim, some white, a few prismatic. 32 dots across a 0.20W tile."""
    rng = random.Random(SEED + 6)
    big = size * SS
    img = Image.new("RGB", (big, big), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    for gy in range(size // pitch):
        for gx in range(size // pitch):
            x = gx * pitch + pitch / 2 + rng.uniform(-1.2, 1.2)
            y = gy * pitch + pitch / 2 + rng.uniform(-1.2, 1.2)
            v = rng.random() ** 3
            if rng.random() < 0.18:
                c = tuple(int(255 * t) for t in colorsys.hsv_to_rgb(rng.random(), 0.7, 0.55 + 0.45 * v))
            else:
                c = (int(255 * v),) * 3
            r = 0.9 + 1.1 * v
            for ox, oy in wrap_offsets(x, y, r, size):
                draw.ellipse([(ox - r) * SS, (oy - r) * SS, (ox + r) * SS, (oy + r) * SS], fill=c)
    save(img.resize((size, size), Image.LANCZOS), "glitter-grid.webp")


def main():
    print(f"writing to {OUT.relative_to(ROOT)}/")
    southern_cross()
    stitched_rings()
    cracked_ice()
    confetti()
    classic_stars()
    glitter_grid()


if __name__ == "__main__":
    main()
