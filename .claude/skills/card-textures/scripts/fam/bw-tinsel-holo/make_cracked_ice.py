"""Draw the bw-tinsel-holo family's Cracked Ice texture (the Black & White theme-deck reprints and promos).

What the real foil does (refs/SOURCES.md in /mnt/project-files/holo-remaster/bw-tinsel-holo/): Cracked Ice is foil cut
into flat angular facets, each a little mirror at its own angle, so under a lamp a few facets flash bright at a time
and the rest stay dark, and which ones flash changes as the card turns. On the Black & White theme-deck reprints
(Serperior, Emboar, Samurott, Scolipede, Krookodile, Accelgor, Escavalier: Pokumon's scans) the facets run over the
whole window, Pokemon included; on Minccino BW13, Scraggy BW25, Luxio BW34 and the Virizion/Terrakion/Cobalion BW70-72
the Pokemon is matte (TCG Live's maps). Version 2 (2026-10-22 audit): the shards are silver-white to icy blue mirrors
with only a pastel hint, 5-12 % of the card's width, and the print's dark and saturated ink stays dark and saturated
under them (Pokumon's Accelgor, Escavalier, Krookodile, Emboar, Serperior scans); version 1's candy pastels under
hard-light lifted every ink to pastel and made the art unreadable. The site's scans are clean digital images, so the
facets have to be drawn.

Two full-card textures, 512 x 1024 (stretched over the card), from one facet list so they line up exactly:

- ice-tint-v2.webp: RGB, each facet's mirror as an `overlay` source (see tint()): mostly near-neutral icy silver, a
  quarter dark blue, a fifth bright silver-blue, a tenth a pale pastel.
- ice-facets-v2.webp: grey, one value per facet (its "angle", 0-1, uniform), drawn 3x supersampled so the edges are
  clean and anti-aliased. Facets are the Delaunay triangles of a Poisson-disc point set (about 36 px apart, with a
  quarter of the points pulled close to a neighbour so long slivers appear), 60 % of them merged with a neighbour (up
  to three to a shard: irregular quads and pentagons), each shard with a faint gradient across it so a flat facet is
  not one dead value. The CSS lights a facet when the tilt matches its value (a difference against a
  grey that follows the pointer, then a colour-burn to sharpen), the way a real facet flashes at its own angle.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_cracked_ice.py [--force] [--preview <png>]

Writes assets/foil/fam/bw-tinsel-holo/ice-facets-v2.webp and ice-tint-v2.webp. A file that exists is kept unless
--force (only for a draft that has never shipped: /assets/* is cached for a year, so a change is a new -vN name).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import Delaunay

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
W, H = 512, 1024
SS = 3
SEED = 20121
SPACING = 36.0   # round 2: Pokumon's Serperior reprint is a dense mosaic of small and medium shards (was 46)
V = "v2"


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
    angle = {r: rng.uniform(0, 2 * np.pi) for r in centre}
    out = np.zeros((H * SS, W * SS))
    key = np.zeros((H * SS, W * SS))  # the shard's own value, without the gradient: its colour
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
        key[y0:y1, x0:x1][mm] = v
    return out.reshape(H, SS, W, SS).mean(axis=(1, 3)), key


def tint(v: np.ndarray, seed: int) -> np.ndarray:
    """Each facet's mirror as an overlay source, keyed by its value through a fixed random palette (so one facet is one
    colour, and the facets' look does not line up with their flash order): 34 % near-neutral icy silver (grey
    0.40-0.58, icy blue), 32 % dark blue mirrors (0.19-0.31, the floor held for the dark-speck budget: the shards that read on a pale sky, Pokumon's Accelgor and
    Serperior scans), 26 % bright silver-blue (0.84-0.98), 8 % a pale pastel (round 2: more dark and bright shards, so
    the mosaic reads at rest as on Pokumon's Serperior reprint)
    (hue anywhere, saturation 0.22, value 0.82). Under `overlay` a facet scales the ink by its grey: black and white ink stay as they are, so dark ink
    stays dark and only the mid and pale parts of the art show the shards (the Pokumon scans of the deck reprints)."""
    import colorsys

    rng = np.random.default_rng(seed + 7)
    lut = np.empty((256, 3))
    for i in range(256):
        u = rng.random()
        if u < 0.34:
            g = rng.uniform(0.40, 0.58)
            lut[i] = (g - 0.05, g, g + 0.08)
        elif u < 0.66:
            g = rng.uniform(0.19, 0.31)
            lut[i] = (g - 0.05, g + 0.01, g + 0.15)
        elif u < 0.92:
            g = rng.uniform(0.84, 0.98)
            lut[i] = (g - 0.06, g, min(g + 0.04, 1))
        else:
            lut[i] = colorsys.hsv_to_rgb(rng.random(), 0.22, 0.82)
    return lut[np.clip((np.mod(v, 1.0) * 255).round().astype(int), 0, 255)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    arr, key = draw(SEED)
    col = tint(key, SEED).reshape(H, SS, W, SS, 3).mean(axis=(1, 3))
    u8 = lambda a: np.uint8(np.clip(a, 0, 1) * 255 + 0.5)  # noqa: E731
    jobs = [
        (f"ice-facets-{V}.webp", Image.fromarray(u8(arr), "L"), 90),
        (f"ice-tint-{V}.webp", Image.fromarray(u8(col), "RGB"), 92),
    ]
    for name, img, q in jobs:
        out = OUT / name
        if out.exists() and not args.force:
            print("kept", out.relative_to(ROOT), "(pass --force before the family ships to rewrite it)")
            continue
        img.save(out, "WEBP", quality=q, method=6)
        print("wrote", out.relative_to(ROOT), out.stat().st_size, "bytes")
    if args.preview:
        jobs[1][1].save(args.preview)


if __name__ == "__main__":
    main()
