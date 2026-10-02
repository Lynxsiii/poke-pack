"""Draw the bw-tinsel-holo family's Cracked Ice texture (the Black & White theme-deck reprints and promos).

What the real foil does (refs/SOURCES.md in /mnt/project-files/holo-remaster/bw-tinsel-holo/): Cracked Ice is foil cut
into flat angular facets, each a little mirror at its own angle, so under a lamp a few facets flash bright at a time
and the rest stay dark, and which ones flash changes as the card turns. On the Black & White theme-deck reprints
(Serperior, Emboar, Samurott, Scolipede, Krookodile, Accelgor, Escavalier: Pokumon's scans) the facets run over the
whole window, Pokemon included; on Minccino BW13, Scraggy BW25, Luxio BW34 and the Virizion/Terrakion/Cobalion BW70-72
the Pokemon is matte (TCG Live's maps). Facets are 3-8 % of the card's width, triangles and slivers. The site's scans
are clean digital images, so the facets have to be drawn.

Two full-card textures, 512 x 1024 (stretched over the card), from one facet list so they line up exactly:

- ice-tint.webp: RGB, each facet a pastel colour (hue = the facet's value, saturation 0.45, value 0.9: its brightest
  channel 0.9, its weakest 0.5, so a hard-light `.foil` lifts the print towards the pastel and never shades it), the
  way every real facet is its own colour; the hue follows the value so the colour that flashes changes with the tilt.
- ice-facets.webp: grey, one value per facet (its "angle", 0-1, uniform), drawn 3x supersampled so the edges are
  clean and anti-aliased. Facets are the Delaunay triangles of a Poisson-disc point set (about 32 px apart, with a
  quarter of the points pulled close to a neighbour so long slivers appear), 60 % of them merged with a neighbour (up
  to three to a shard: irregular quads and pentagons), each shard with a faint gradient across it so a flat facet is
  not one dead value. The CSS lights a facet when the tilt matches its value (a difference against a
  grey that follows the pointer, then a colour-burn to sharpen), the way a real facet flashes at its own angle.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_cracked_ice.py [--force] [--preview <png>]

Writes assets/foil/fam/bw-tinsel-holo/ice-facets.webp and ice-tint.webp; --force overwrites them (only until the family
ships; after that a change is a new -vN name). A file that exists is kept unless --force.
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
SPACING = 32.0


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


def draw(seed: int) -> np.ndarray:
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
    return out.reshape(H, SS, W, SS).mean(axis=(1, 3))


def tint(v: np.ndarray) -> np.ndarray:
    """Pastel RGB from the facet value: hue = value, saturation 0.45, value 0.9."""
    import colorsys

    h = np.mod(v, 1.0)
    out = np.empty(v.shape + (3,))
    # a 256-entry palette keeps this fast
    lut = np.array([colorsys.hsv_to_rgb(i / 255, 0.45, 0.9) for i in range(256)])
    out[...] = lut[np.clip((h * 255).round().astype(int), 0, 255)]
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    arr = draw(SEED)
    u8 = lambda a: np.uint8(np.clip(a, 0, 1) * 255 + 0.5)  # noqa: E731
    jobs = [
        ("ice-facets.webp", Image.fromarray(u8(arr), "L"), 90),
        ("ice-tint.webp", Image.fromarray(u8(tint(arr)), "RGB"), 92),
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
