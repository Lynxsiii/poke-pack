#!/usr/bin/env python3
"""Legendary Treasures' Radiant Collection: the two foil textures every RC card shares.

What the real cards carry (2026-10-22 audit, photos in /home/user/holo-refs/bw-rc/, SOURCES.md there):

- Uncommons, RC11 and the full arts (RC21-RC25): "Confetti" holofoil, packed round foil sequins about 2% of the card wide,
  nearly touching and overlapping, over the WHOLE face (Pikachu RC7, Meloetta-EX RC11 and RC25, Reshiram RC22 photos). In
  room light a pale disc texture; tipped, single chips flash one saturated colour.
- Commons (RC1, 2, 5, 8, 9, 15-18 and Elesa RC20): a star holo: small five-point stars (about 3% of the card), sparse,
  10-15 lit at once over the whole face (Snivy RC1, Minccino RC18 photos).

Both textures are RGBA: alpha is the sequin's (star's) coverage, anti-aliased, and RGB is one grey value g in 0.35..0.85
over the whole sequin: its "facet". css/holo/fam/bw-radiant-collection.css masks `.foil` by this coverage (only the
sequins paint) and picks which sequins are lit at a pose by blending a pointer-driven ramp L under the texture with
`difference` and crushing the result (invert/brightness/contrast), so a sequin lights where |g - L| is small.

Sequins are laid in random order and every one cuts a thin clear ring round itself into the ones below (make `chips`),
so two facets never share an edge: an interpolated edge between two greys would light a hairline.

The textures are seamless TILES (v3), 320 x 384 px at 440 px per card width (so a tile is 72.7% of the card wide and 62.5%
of it tall), repeated and offset per card by --seed-x/--seed-y. Why a tile and not one 150%-wide sheet (v2, 660 x 922): WebKit
decodes an image of 500 KB or more decoded (128,000 px and up) asynchronously when it paints it outside the viewport or after its
decoded frame was purged, and an image in a MASK layer that is not decoded yet masks out the whole element: multi-card WebKit
renders (and a phone scrolling a binder) showed whole cards with no `.foil` at some screenshots and not at others (diagnostic of
2026-10-22: the 660 px texture in the mask dropped out at 400 ms, 3 s or 8 s; the art + zone mask alone never). A 122,880 px tile
stays under that size and decodes synchronously. The disc pattern is random and the light (hue band, sweep) differs across the
card, so the repeat does not read.

    python3 .claude/skills/card-textures/scripts/fam/bw-radiant-collection/make_rc_textures.py

Writes assets/foil/fam/bw-radiant-collection/rc-chips-v3.webp and rc-stars-v3.webp (the facets, lossless) and
rc-chips-mask-v3.webp, rc-stars-mask-v3.webp (the coverage alone, for the mask layer: see main()). Seeded: reruns give
the same files. (rc-chips(-v2).webp / rc-stars(-v2).webp are earlier versions, no longer referenced.)
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-radiant-collection"
CARD = 440                      # card width in texture px: the texture is 150% of the card wide and drawn at 1.5x at phone size
W, H = 320, 384                 # the tile (122,880 px: under WebKit's 128,000 px async-decoding size, see above)
SS = 3                          # supersampling for the coverage
G_LO, G_HI = 0.35, 0.85         # facet range
CHIP_D = 0.021                  # sequin diameter, share of the card's width (photos: 1.8-2.2%)
CHIP_NN = 0.015                 # first sampling's minimum centre distance; relax() then evens the packing out (v4): about 1760
                                # sequins 2.04% apart, each a 2.1% disc, so they overlap a little, as on the card (RC11
                                # photos), and keep most of their disc. v3 (0.0138, no relaxing) had the later discs cut the
                                # earlier ones down to crescents, and a lit crescent read as a fragment (review of round 3).
CHIP_GAP = 0.7                  # clear ring round every sequin, texture px (about 1 device px)
STAR_NN = 0.085                 # star spacing (photos: about 10-15 lit on a whole card, 8-10% apart)
STAR_D = 0.046                  # star outer diameter: the photos' stars read about 3% of the card across their body; a thin
                                # 5-point outline at 3.4% read half that size at phone size (review of 2026-10-22)
STAR_INNER = 0.5                # inner radius / outer: bold points
VERSION = {"chips": "v4", "stars": "v3"}


def poisson(rng: np.random.Generator, w: int, h: int, r: float, k: int = 30) -> np.ndarray:
    """Bridson's Poisson disc sampling on a torus: points at least r apart (wrapping round the edges), filling w x h."""
    gw, gh = max(1, int(w / (r / math.sqrt(2)))), max(1, int(h / (r / math.sqrt(2))))
    cell = max(w / gw, h / gh)
    gw, gh = int(math.ceil(w / cell)), int(math.ceil(h / cell))
    grid = -np.ones((gh, gw), int)
    pts: list[tuple[float, float]] = []
    active: list[int] = []

    def fits(x: float, y: float) -> bool:
        gx, gy = int(x / cell) % gw, int(y / cell) % gh
        for yy in range(gy - 3, gy + 4):
            for xx in range(gx - 3, gx + 4):
                j = grid[yy % gh, xx % gw]
                if j >= 0:
                    ddx = abs(pts[j][0] - x); ddy = abs(pts[j][1] - y)
                    ddx = min(ddx, w - ddx); ddy = min(ddy, h - ddy)
                    if ddx * ddx + ddy * ddy < r * r:
                        return False
        return True

    x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
    pts.append((x0, y0)); active.append(0); grid[int(y0 / cell) % gh, int(x0 / cell) % gw] = 0
    while active:
        i = active[rng.integers(len(active))]
        px, py = pts[i]
        for _ in range(k):
            a = rng.uniform(0, 2 * math.pi); d = rng.uniform(r, 2 * r)
            x, y = (px + d * math.cos(a)) % w, (py + d * math.sin(a)) % h
            if fits(x, y):
                pts.append((x, y)); active.append(len(pts) - 1); grid[int(y / cell) % gh, int(x / cell) % gw] = len(pts) - 1
                break
        else:
            active.remove(i)
    return np.array(pts)


def stamp(rgba: np.ndarray, cx: float, cy: float, reach: float, inside, g: float) -> None:
    """Rasterise one shape (inside(dx, dy) -> bool on the supersampled grid) into the RGBA float canvas."""
    h, w = rgba.shape[:2]
    x0, x1 = int(math.floor(cx - reach)) - 1, int(math.ceil(cx + reach)) + 1
    y0, y1 = int(math.floor(cy - reach)) - 1, int(math.ceil(cy + reach)) + 1
    x0c, y0c, x1c, y1c = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    if x1c <= x0c or y1c <= y0c:
        return
    sx = (np.arange(x0c * SS, x1c * SS) + 0.5) / SS - cx
    sy = (np.arange(y0c * SS, y1c * SS) + 0.5) / SS - cy
    dx, dy = np.meshgrid(sx, sy)
    cov = inside(dx, dy).astype(np.float32)
    cov = cov.reshape(y1c - y0c, SS, x1c - x0c, SS).mean(axis=(1, 3))
    a = rgba[y0c:y1c, x0c:x1c, 3]
    new = np.maximum(a, cov)
    grow = cov > a
    rgba[y0c:y1c, x0c:x1c, 0][grow] = g
    rgba[y0c:y1c, x0c:x1c, 3] = new


def disc(lab: np.ndarray, i: int, X: float, Y: float, R: float, gap: float) -> None:
    """Paint disc i (centre X, Y and radius R in supersampled px) into the label canvas, cutting a clear ring of width gap
    round it into the discs painted before."""
    h, w = lab.shape
    reach = R + gap + 2
    x0, x1 = max(0, int(X - reach)), min(w, int(X + reach) + 1)
    y0, y1 = max(0, int(Y - reach)), min(h, int(Y + reach) + 1)
    if x1 <= x0 or y1 <= y0:
        return
    dx = np.arange(x0, x1) + 0.5 - X
    dy = np.arange(y0, y1) + 0.5 - Y
    d = np.hypot(dx[None, :], dy[:, None])
    patch = lab[y0:y1, x0:x1]
    patch[(d > R) & (d <= R + gap)] = -1
    patch[d <= R] = i


def relax(pts: np.ndarray, iters: int = 40) -> np.ndarray:
    """Push the sequins apart on the torus until they sit about evenly (a jammed, irregular packing rather than Poisson
    sampling's mix of crowds and holes): each pair closer than the mean spacing moves apart by part of the shortfall."""
    pts = pts.copy()
    n = len(pts)
    t = math.sqrt(W * H / (0.866 * n))        # the spacing of a hexagonal packing of n sequins
    for _ in range(iters):
        d = pts[:, None, :] - pts[None, :, :]
        d[..., 0] -= W * np.round(d[..., 0] / W)
        d[..., 1] -= H * np.round(d[..., 1] / H)
        r = np.hypot(d[..., 0], d[..., 1]) + np.eye(n) * 1e9
        push = np.clip(t - r, 0, None) / r * 0.25
        pts += (d * push[..., None]).sum(1)
        pts[:, 0] %= W
        pts[:, 1] %= H
    return pts


def chip_layout(seed: int = 2013):
    """The sequins' layout on the supersampled tile: (label per subpixel, -1 in the clear rings; the facet per sequin)."""
    rng = np.random.default_rng(seed)
    spacing = CHIP_NN * CARD                 # minimum centre distance of the first sampling
    pts = relax(poisson(rng, W, H, spacing))
    rng.shuffle(pts)
    lab = -np.ones((H * SS, W * SS), np.int32)
    facets = (np.round(rng.uniform(G_LO, G_HI, len(pts)) * 64) / 64).astype(np.float32)   # 32 facet levels: a smaller file
    gap = CHIP_GAP * SS
    for i, (cx, cy) in enumerate(pts):
        R = CHIP_D / 2 * CARD * rng.uniform(0.9, 1.1) * SS
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                disc(lab, i, (cx + ox) * SS, (cy + oy) * SS, R, gap)
    return lab, facets


def chips(seed: int = 2013) -> Image.Image:
    """Packed, overlapping sequins (2026-10-22 audit: the real chips touch, about 2% of the card wide, nearest neighbour
    2.1-2.3%, covering 80-90% of the face). Discs are laid in random order; each one cuts a thin clear ring round itself
    into the discs below, so every pixel belongs to one chip (one facet) and two chips never share an edge: the browser
    can never interpolate between two facets and light a hairline."""
    lab, facets = chip_layout(seed)
    on = lab >= 0
    g = np.where(on, facets[np.clip(lab, 0, None)], 0).astype(np.float32)
    on_s = on.reshape(H, SS, W, SS).astype(np.float32).sum(axis=(1, 3))
    g_s = g.reshape(H, SS, W, SS).sum(axis=(1, 3))
    rgba = np.zeros((H, W, 4), np.float32)
    rgba[..., 0] = np.where(on_s > 0, g_s / np.maximum(on_s, 1), 0)
    rgba[..., 3] = on_s / (SS * SS)
    full = np.pi * (CHIP_D / 2 * CARD * SS) ** 2
    vis = np.bincount(lab[on], minlength=len(facets)) / full
    print(f"chips: {len(facets)} discs, coverage {rgba[..., 3].mean():.2f}, visible share of a disc: median {np.median(vis):.2f}, "
          f"under half {np.mean(vis < 0.5):.2f}")
    return to_image(rgba)


# The rest mosaic (v4, round 4): what the sequins look like in room light. Real: a packed, nearly touching disc texture over the
# whole face that reads even unlit (RC11 black-background photo, RC7 photos, RC4 real scan, JP Piplup SC006 scan): every disc a
# slightly different pale silver (a faint cool, lavender, warm, mint or pink cast), the overlaps and gaps a touch darker, and a
# few discs glinting a pastel colour. Drawn as hard-light values on the same layout as rc-chips (so a lit facet flashes over its
# own disc): 0.5 is neutral, s > 0.5 screens 2s - 1 onto the print, s < 0.5 multiplies it by 2s.
REST_A = (0.05, 0.17)            # per-disc screen amount (on mid-grey print about +8 to +25 levels under the 0.45-1 ink mask)
REST_RING = 0.95                 # the clear ring between sequins: multiply (0.88 with a darker rim drew every disc outlined, a
REST_RIM = 0.975                 # bubble-wrap look); one supersampled px either side of the ring: multiply
REST_GLINT = 0.035               # share of discs that glint at rest
REST_TINTS = np.array([(1, 1, 1), (1, 1, 1), (0.86, 0.91, 1), (0.92, 0.86, 1), (1, 0.94, 0.86), (0.88, 1, 0.93),
                       (1, 0.88, 0.95)], np.float32)
GLINT_TINTS = np.array([(0.8, 1, 0.35), (1, 0.72, 0.35), (0.5, 0.72, 1), (0.78, 0.55, 1), (1, 0.55, 0.82), (1, 1, 0.62)],
                       np.float32)


def rest(seed: int = 2013) -> Image.Image:
    lab, facets = chip_layout(seed)
    rng = np.random.default_rng(seed + 7)
    n = len(facets)
    a = rng.uniform(*REST_A, n).astype(np.float32)
    tint = REST_TINTS[rng.integers(len(REST_TINTS), size=n)]
    glint = rng.random(n) < REST_GLINT
    a[glint] = rng.uniform(0.32, 0.48, glint.sum())
    tint[glint] = GLINT_TINTS[rng.integers(len(GLINT_TINTS), size=glint.sum())]
    disc_s = 0.5 + (a[:, None] * tint) / 2                                   # n x 3
    on = lab >= 0
    s = np.where(on[..., None], disc_s[np.clip(lab, 0, None)], 0.5 * REST_RING).astype(np.float32)
    # the rim: subpixels next to a different label (a neighbouring disc or the ring) darken a little
    pad = np.pad(lab, 1, mode="wrap")
    edge = np.zeros(lab.shape, bool)
    for dy, dx in ((0, 1), (2, 1), (1, 0), (1, 2)):
        edge |= pad[dy:dy + lab.shape[0], dx:dx + lab.shape[1]] != lab
    s[edge & on] = 0.5 * REST_RIM
    s = s.reshape(H, SS, W, SS, 3).mean(axis=(1, 3))
    print(f"rest: {n} discs, {glint.sum()} glints, mean s {s.mean():.3f}")
    return Image.fromarray(np.round(np.clip(s, 0, 1) * 255).astype(np.uint8), "RGB")


def stars(seed: int = 2013) -> Image.Image:
    rng = np.random.default_rng(seed + 1)
    spacing = STAR_NN * CARD
    pts = poisson(rng, W, H, spacing)
    rgba = np.zeros((H, W, 4), np.float32)
    for cx, cy in pts:
        R = STAR_D / 2 * CARD * rng.uniform(0.85, 1.12)
        rot = rng.uniform(0, 2 * math.pi / 5)
        inner = STAR_INNER
        angles = rot - math.pi / 2 + np.arange(10) * math.pi / 5
        radii = np.where(np.arange(10) % 2 == 0, R, R * inner)
        poly = np.stack([np.cos(angles) * radii, np.sin(angles) * radii], 1)

        def inside(dx, dy, poly=poly):
            # even-odd rule point in polygon, vectorised over the supersampled patch
            res = np.zeros(dx.shape, bool)
            n = len(poly)
            for i in range(n):
                xa, ya = poly[i]; xb, yb = poly[(i + 1) % n]
                cond = (ya > dy) != (yb > dy)
                xint = (xb - xa) * (dy - ya) / (yb - ya + 1e-12) + xa
                res ^= cond & (dx < xint)
            return res

        g = rng.uniform(G_LO, G_HI)
        for ox in (-W, 0, W):
            for oy in (-H, 0, H):
                stamp(rgba, cx + ox, cy + oy, R, inside, g)
    print(f"stars: {len(pts)} stars")
    return to_image(rgba)


def to_image(rgba: np.ndarray) -> Image.Image:
    g = rgba[..., 0]
    out = np.zeros(rgba.shape[:2] + (4,), np.uint8)
    on = rgba[..., 3] > 0
    v = np.round(g * 255).astype(np.uint8)
    out[..., 0][on] = v[on]; out[..., 1][on] = v[on]; out[..., 2][on] = v[on]
    out[..., 3] = np.round(rgba[..., 3] * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, fn in (("chips", chips), ("stars", stars)):
        img = fn()
        # The facets (the background layer) and, as a SEPARATE file, the coverage alone (the mask layer): WebKit dropped the
        # whole `.foil` at some screenshots and not at others while one URL was both its background and its mask image (four
        # diagnostic runs of 2026-10-22: 3 of 4 dropped out at 400 ms, 3 s, 5 s or 8 s), and never with two files.
        mask = Image.new("RGBA", img.size, (255, 255, 255, 0))
        mask.putalpha(img.getchannel("A"))
        for name, im in ((f"rc-{kind}-{VERSION[kind]}.webp", img), (f"rc-{kind}-mask-{VERSION[kind]}.webp", mask)):
            path = OUT / name
            im.save(path, lossless=True, quality=100, method=6, exact=True)
            print(f"{path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {path.stat().st_size // 1024} KB")
    path = OUT / "rc-chips-rest-v4.webp"
    rest().save(path, lossless=True, quality=100, method=6, exact=True)
    print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
