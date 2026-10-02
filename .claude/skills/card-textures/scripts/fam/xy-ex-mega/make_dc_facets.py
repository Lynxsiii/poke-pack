#!/usr/bin/env python3
"""Draw the Double Crisis EX "shattered glass" facet textures (Team Aqua's Kyogre-EX dc1-6, Team Magma's Groudon-EX dc1-15).

What the real cards do (refs/SOURCES.md in /mnt/project-files/holo-remaster/xy-ex-mega/: ddog281330's two-card tilt clips of the
Japanese 006/034 and 015/034, Hakuhodo's angled product shot, Skelly's and Aaron Walton's clips, Pokemon Holo's English
6/34): TCG Live has no etch map for Double Crisis, but the cards are not smooth. The whole face, Pokemon and text box included,
is cut into flat angular facets 3-10 % of the card's width (triangles, slivers, quads, pentagons), each a little mirror at its
own angle: at any tilt a few facets burn in a saturated colour (green, yellow, magenta, cyan, orange) and the rest stay dull
silver, and which ones change as the card turns. It is the Cracked Ice family of foils, not the fingerprint etch of the
other XY full arts.

Per card, two files in assets/foil/fam/xy-ex-mega/ (600 x 838, the scan's grid; one facet list so they line up exactly):

- <id>-facets-v1.webp  grey, one value per facet (its "angle", 0-1), 3x supersampled. The sheet lights the facets whose value
                       is within a tenth of a grey that follows the pointer (css/holo/fam/xy-ex-mega.css, `xm-dc`).
- <id>-tint-v1.webp    RGB, each facet a pastel colour (its own random hue, independent of its angle, saturation 0.5, value 0.92): laid
                       hard-light for the faint cut, and multiplied into the gate (saturated by the sheet) for the flash.

The facets are the Delaunay triangles of a Poisson-disc point set (about 38 px apart on 600; a quarter of the points pulled
close to a neighbour so long slivers appear), 60 % of them merged with a neighbour (up to three to a shard), each shard with a
faint gradient across it. Seeded from the card id; each card has its own layout.

    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/make_dc_facets.py [--force] [--preview DIR]

A file that exists is kept unless --force (only until the family ships; after that a change is a new -vN name).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import Delaunay

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-ex-mega"
W, H = 600, 838
SS = 3
SPACING = 38.0
SEEDS = {"dc1-6": 20150006, "dc1-15": 20150015}


def poisson(rng: np.random.Generator, spacing: float) -> np.ndarray:
    """Dart-throwing Poisson-disc points over a margin-padded card (so edge facets are whole)."""
    pad = spacing * 1.5
    cell = spacing / np.sqrt(2)
    gw, gh = int((W + 2 * pad) / cell) + 1, int((H + 2 * pad) / cell) + 1
    grid = -np.ones((gh, gw), int)
    pts: list[tuple[float, float]] = []
    for _ in range(60000):
        x, y = rng.uniform(-pad, W + pad), rng.uniform(-pad, H + pad)
        gx, gy = int((x + pad) / cell), int((y + pad) / cell)
        ok = True
        for j in range(max(gy - 2, 0), min(gy + 3, gh)):
            for i in range(max(gx - 2, 0), min(gx + 3, gw)):
                k = grid[j, i]
                if k >= 0 and (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2 < spacing ** 2:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            grid[gy, gx] = len(pts)
            pts.append((x, y))
    p = np.array(pts)
    # slivers: pull a quarter of the points most of the way towards a random neighbour
    pull = rng.random(len(p)) < 0.25
    for i in np.where(pull)[0]:
        d = np.hypot(*(p - p[i]).T)
        d[i] = 1e9
        j = np.argmin(d)
        p[i] = p[i] + (p[j] - p[i]) * rng.uniform(0.35, 0.6)
    return p


def draw(seed: int) -> tuple[np.ndarray, np.ndarray]:
    """(angle, hue): one grey per facet for the gate, and an independent random per facet for its colour, so the facets lit
    at the same tilt are different colours (green, yellow, magenta, cyan side by side, as in the photos)."""
    rng = np.random.default_rng(seed)
    pts = poisson(rng, SPACING)
    tri = Delaunay(pts)
    n = len(tri.simplices)
    # shards: merge each triangle with a random neighbour (60 %), at most three triangles to a shard, so the facets
    # are irregular quads and pentagons as well as triangles and slivers
    group = np.arange(n)
    size = np.ones(n, int)

    def find(i: int) -> int:
        while group[i] != i:
            group[i] = group[group[i]]
            i = group[i]
        return i

    for i in rng.permutation(n):
        if rng.random() < 0.6:
            nb = [j for j in tri.neighbors[i] if j >= 0]
            if nb:
                a, b = find(i), find(nb[rng.integers(len(nb))])
                if a != b and size[a] + size[b] <= 3:
                    group[b] = a
                    size[a] += size[b]
    roots = np.array([find(i) for i in range(n)])
    centre = {}
    for r in np.unique(roots):
        centre[r] = np.mean([pts[tri.simplices[i]].mean(axis=0) for i in np.where(roots == r)[0]], axis=0)
    value = {r: rng.random() for r in centre}
    hue_of = {r: rng.random() for r in centre}
    angle = {r: rng.uniform(0, 2 * np.pi) for r in centre}
    out = np.zeros((H * SS, W * SS))
    out2 = np.zeros((H * SS, W * SS))
    for idx, simplex in enumerate(tri.simplices):
        poly = pts[simplex]
        r = roots[idx]
        v, ang = value[r], angle[r]
        # a faint gradient across the shard: value v +- 0.06 along a random direction
        x0, y0 = np.floor(poly.min(axis=0) * SS).astype(int) - 2
        x1, y1 = np.ceil(poly.max(axis=0) * SS).astype(int) + 2
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, W * SS), min(y1, H * SS)
        if x1 <= x0 or y1 <= y0:
            continue
        m = Image.new("L", (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(m).polygon([((px * SS) - x0, (py * SS) - y0) for px, py in poly], fill=255)
        mm = np.asarray(m) > 127
        if not mm.any():
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        c = centre[r] * SS
        g = ((xx - c[0]) * np.cos(ang) + (yy - c[1]) * np.sin(ang)) / (SPACING * SS)
        val = np.clip(v + 0.06 * g, 0, 1)
        region = out[y0:y1, x0:x1]
        region[mm] = val[mm]
        out2[y0:y1, x0:x1][mm] = hue_of[r]
    return out.reshape(H, SS, W, SS).mean(axis=(1, 3)), out2.reshape(H, SS, W, SS).mean(axis=(1, 3))


def tint(v: np.ndarray) -> np.ndarray:
    """Pastel RGB from the facet's hue value: saturation 0.5, value 0.92."""
    import colorsys

    h = np.mod(v, 1.0)
    out = np.empty(v.shape + (3,))
    # a 256-entry palette keeps this fast
    lut = np.array([colorsys.hsv_to_rgb(i / 255, 0.5, 0.92) for i in range(256)])
    out[...] = lut[np.clip((h * 255).round().astype(int), 0, 255)]
    return out



def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview", type=Path, default=None)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    u8 = lambda a: np.uint8(np.clip(a, 0, 1) * 255 + 0.5)  # noqa: E731
    for cid, seed in SEEDS.items():
        arr, hue = draw(seed)
        jobs = [
            (f"{cid}-facets-v1.webp", Image.fromarray(u8(arr), "L"), None),
            (f"{cid}-tint-v1.webp", Image.fromarray(u8(tint(hue)), "RGB"), 92),
        ]
        for name, img, q in jobs:
            out = OUT / name
            if out.exists() and not args.force:
                print("kept", out.relative_to(ROOT))
                continue
            if q is None:
                img.save(out, "WEBP", lossless=True, method=6)
            else:
                img.save(out, "WEBP", quality=q, method=6)
            print("wrote", out.relative_to(ROOT), out.stat().st_size, "bytes")
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            jobs[1][1].save(args.preview / f"{cid}-tint.png")
            jobs[0][1].save(args.preview / f"{cid}-facets.png")


if __name__ == "__main__":
    main()
