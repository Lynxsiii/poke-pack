"""Generate the seamless foil textures used by the holo layers.

Everything here is synthesised from a seeded RNG, so the output is ours and
reproducible — no third-party texture packs and no licence to inherit. Re-run
after changing a constant to regenerate:

    py scripts/make_foil_textures.py

Outputs (assets/foil/):
    grain.png           128px  fine sensor-style noise, tiles invisibly
    glitter.png         256px  sparse bright specks for illustration/secret rares
    cosmos.png          384px  crystalline cosmos flakes, for reverse holo
    weave.png           192px  fine crosshatch ridges (kept for other recipes)
    metal.png           256px  brushed directional streaks, for gold Mega Hyper Rares
    facet.png           256px  angular crystal seams, for Pokemon ex / full-art foils
    prism.png           256px  oil-slick interference bands, for Ultra Rares
    swirl.png           384px  nebula swirl arms, for SAR / Black White Rare holos
    pokeball.png        256px  tiled Poké Balls, for 151-style reverse holos
    pokeball-tiny.png   256px  denser smaller Poké Balls, second reverse layer
    masterball.png      256px  tiled Master Balls
    masterball-tiny.png 256px  denser smaller Master Balls

All three are tileable: the noise lattice wraps, and any speck that crosses an
edge is drawn again on the opposite side.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "foil"
SEED = 20260819


def smoothstep(t: float) -> float:
    return t * t * (3 - 2 * t)


def value_noise(size: int, cells: int, rng: random.Random, cells_y: int | None = None):
    """Tileable value noise: the lattice wraps, so opposite edges match.

    `cells_y` lets the lattice be stretched on one axis, which is how the
    brushed-metal streaks get their direction.
    """
    cx = cells
    cy = cells_y or cells
    lattice = [[rng.random() for _ in range(cx)] for _ in range(cy)]
    step_x = size / cx
    step_y = size / cy
    out = [[0.0] * size for _ in range(size)]
    for y in range(size):
        gy = y / step_y
        y0 = int(gy) % cy
        y1 = (y0 + 1) % cy
        fy = smoothstep(gy - int(gy))
        for x in range(size):
            gx = x / step_x
            x0 = int(gx) % cx
            x1 = (x0 + 1) % cx
            fx = smoothstep(gx - int(gx))
            top = lattice[y0][x0] * (1 - fx) + lattice[y0][x1] * fx
            bottom = lattice[y1][x0] * (1 - fx) + lattice[y1][x1] * fx
            out[y][x] = top * (1 - fy) + bottom * fy
    return out


def worley(size: int, cells: int, rng: random.Random):
    """Tileable cellular noise, returned as F2-F1 (distance to the cell edge).

    That difference is near zero along the boundary between two feature points
    and rises inside each cell, which draws crystalline facet seams rather than
    blobs — the look of an angular full-art foil.
    """
    step = size / cells
    points = [
        [(rng.random(), rng.random()) for _ in range(cells)] for _ in range(cells)
    ]
    out = [[0.0] * size for _ in range(size)]
    for y in range(size):
        cyi = int(y / step)
        for x in range(size):
            cxi = int(x / step)
            best = second = 1e9
            for oy in (-1, 0, 1):
                gy = (cyi + oy) % cells
                for ox in (-1, 0, 1):
                    gx = (cxi + ox) % cells
                    px, py = points[gy][gx]
                    # Feature point in absolute space, offset so wrapped
                    # neighbours measure across the seam correctly.
                    fx = ((cxi + ox) + px) * step
                    fy = ((cyi + oy) + py) * step
                    d = math.hypot(fx - x, fy - y)
                    if d < best:
                        second, best = best, d
                    elif d < second:
                        second = d
            out[y][x] = second - best
    hi = max(max(r) for r in out) or 1
    for y in range(size):
        row = out[y]
        for x in range(size):
            row[x] /= hi
    return out


def fractal(size: int, octaves: list[tuple[int, float]], rng: random.Random):
    """Sum several value-noise octaves, normalised to 0..1."""
    acc = [[0.0] * size for _ in range(size)]
    total = 0.0
    for cells, weight in octaves:
        layer = value_noise(size, cells, rng)
        for y in range(size):
            row = acc[y]
            src = layer[y]
            for x in range(size):
                row[x] += src[x] * weight
        total += weight
    lo = min(min(r) for r in acc)
    hi = max(max(r) for r in acc)
    span = (hi - lo) or 1
    for y in range(size):
        row = acc[y]
        for x in range(size):
            row[x] = ((row[x] - lo) / span - 0.0) / (total / total)
    # renormalise to 0..1 after the divide above
    lo = min(min(r) for r in acc)
    hi = max(max(r) for r in acc)
    span = (hi - lo) or 1
    for y in range(size):
        row = acc[y]
        for x in range(size):
            row[x] = (row[x] - lo) / span
    return acc


def make_grain(size: int = 128) -> Image.Image:
    """White noise at low alpha — per-pixel random is inherently seamless."""
    rng = random.Random(SEED)
    img = Image.new("LA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            v = rng.random()
            # Bias hard toward transparent so grain adds sparkle, not haze.
            px[x, y] = (255, int(95 * (v ** 3)))
    return img


def make_glitter(size: int = 256, specks: int = 900) -> Image.Image:
    rng = random.Random(SEED + 1)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()

    def dot(cx: float, cy: float, radius: float, tint: tuple[int, int, int], power: float):
        span = int(math.ceil(radius)) + 1
        for dy in range(-span, span + 1):
            for dx in range(-span, span + 1):
                d = math.hypot(dx, dy)
                if d > radius:
                    continue
                fall = (1 - d / radius) ** 2
                a = int(255 * fall * power)
                if a <= 0:
                    continue
                # Wrap so specks crossing an edge reappear on the far side.
                x = int(cx + dx) % size
                y = int(cy + dy) % size
                r, g, b, old = px[x, y]
                if a > old:
                    px[x, y] = (tint[0], tint[1], tint[2], a)

    tints = [
        (255, 255, 255),
        (255, 240, 200),
        (200, 240, 255),
        (255, 205, 240),
        (215, 255, 220),
    ]
    for _ in range(specks):
        dot(
            rng.uniform(0, size),
            rng.uniform(0, size),
            rng.uniform(0.6, 2.1),
            rng.choice(tints),
            rng.uniform(0.35, 1.0),
        )
    return img


def make_cosmos(size: int = 384) -> Image.Image:
    """Crystalline "cosmos" foil: sharp bright flakes over a dark field.

    Real cosmos foil is not fog — it is a scatter of angular reflective shards.
    Turbulence (folded noise) gives those hard creases, and a steep contrast
    curve keeps the flakes crisp instead of smearing into cloud.
    """
    rng = random.Random(SEED + 2)
    base = fractal(size, [(6, 1.0), (12, 0.6), (24, 0.42), (48, 0.28), (96, 0.16)], rng)
    # White everywhere; the pattern lives entirely in alpha. That is what an
    # overlay layer actually needs, and it halves the file as grayscale+alpha.
    img = Image.new("LA", (size, size))
    px = img.load()
    for y in range(size):
        row = base[y]
        for x in range(size):
            # Fold around the midpoint so ridges form hard creases.
            v = 1.0 - abs(row[x] * 2.0 - 1.0)
            # Narrow, high threshold: only the top of each ridge becomes a
            # flake, so the field stays mostly dark like real cosmos foil.
            v = min(1.0, max(0.0, (v - 0.80) / 0.18))
            v = v * v * (3 - 2 * v)
            px[x, y] = (255, int(240 * v))

    # Bright pinpoints scattered through the flakes.
    for _ in range(int(size * size * 0.0025)):
        px[rng.randrange(size), rng.randrange(size)] = (255, rng.randrange(170, 256))
    return img


def make_weave(size: int = 192) -> Image.Image:
    """Fine crosshatch for Special Illustration Rares.

    Two sets of ridges running across each other. Integer wave counts over the
    tile keep it seamless at any angle, which plain rotated stripes would not.
    """
    rng = random.Random(SEED + 3)
    jitter = value_noise(size, 12, rng)
    img = Image.new("LA", (size, size))
    px = img.load()
    tau = math.pi * 2
    # (waves across x, waves across y) — the pair sets the ridge angle.
    a = (17, 9)
    b = (-9, 17)
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            wobble = (jitter[y][x] - 0.5) * 0.18
            ridge_a = math.sin(tau * (a[0] * u + a[1] * v) + wobble * tau)
            ridge_b = math.sin(tau * (b[0] * u + b[1] * v) - wobble * tau)
            # Sharpen: only the crest of each ridge lights up.
            ca = max(0.0, ridge_a) ** 5
            cb = max(0.0, ridge_b) ** 5
            val = min(1.0, ca * 0.85 + cb * 0.7 + ca * cb * 0.6)
            px[x, y] = (255, int(210 * val))
    return img


def make_metal(size: int = 256) -> Image.Image:
    """Brushed metal for the gold Mega Hyper Rares.

    A lattice stretched hard on one axis gives long directional streaks, the
    way a polished gold card catches a lamp along one direction only.
    """
    rng = random.Random(SEED + 4)
    coarse = value_noise(size, 3, rng, cells_y=110)
    fine = value_noise(size, 6, rng, cells_y=220)
    img = Image.new("LA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            v = coarse[y][x] * 0.65 + fine[y][x] * 0.35
            # Centre on the midpoint so streaks read as highlights and shadows
            # rather than a uniform wash.
            v = min(1.0, max(0.0, (v - 0.42) / 0.34))
            px[x, y] = (255, int(200 * (v ** 1.5)))
    return img


def make_facet(size: int = 256) -> Image.Image:
    """Angular crystal facets for Pokémon ex / full-art foils."""
    rng = random.Random(SEED + 5)
    seams = worley(size, 9, rng)
    sparkle = value_noise(size, 48, rng)
    img = Image.new("LA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            # Invert so the seam itself is the bright line.
            edge = 1.0 - min(1.0, seams[y][x] / 0.30)
            edge = edge ** 2.2
            grit = max(0.0, sparkle[y][x] - 0.72) * 1.4
            val = min(1.0, edge * 0.9 + grit * 0.5)
            px[x, y] = (255, int(215 * val))
    return img


def make_prism(size: int = 256) -> Image.Image:
    """Oil-slick interference for Ultra Rares.

    Several plane waves at different angles summed together give a moire
    ripple — the diffraction sheen of a full-art foil, as opposed to the
    crosshatch on a Special Illustration Rare or the brushed streaks on a gold.
    Integer wave counts keep every wave periodic over the tile, so it wraps.
    """
    rng = random.Random(SEED + 6)
    waves = [(3, 7), (-6, 4), (9, -2), (-2, -9), (12, 6)]
    img = Image.new("LA", (size, size))
    px = img.load()
    tau = math.pi * 2
    phases = [rng.uniform(0, tau) for _ in waves]
    lo, hi = 10.0, -10.0
    field = [[0.0] * size for _ in range(size)]
    for y in range(size):
        v = y / size
        row = field[y]
        for x in range(size):
            u = x / size
            acc = 0.0
            for (kx, ky), ph in zip(waves, phases):
                acc += math.sin(tau * (kx * u + ky * v) + ph)
            row[x] = acc
            lo = min(lo, acc)
            hi = max(hi, acc)
    span = (hi - lo) or 1
    for y in range(size):
        row = field[y]
        for x in range(size):
            t = (row[x] - lo) / span
            # Bias to the crests so the sheen reads as bands, not grey soup.
            t = smoothstep(min(1.0, max(0.0, (t - 0.42) / 0.5)))
            px[x, y] = (255, int(205 * t))
    return img


def make_swirl(size: int = 384) -> Image.Image:
    """Tileable nebula swirls for Special Illustration and Black White Rares.

    Integer-frequency sine arms plus a tiled noise warp. The warp turns the
    bands into curls instead of stripes; wrapping the noise keeps opposite
    edges matching so the sheet can pan under the pointer without a seam.
    """
    rng = random.Random(SEED + 8)
    warp = fractal(size, [(4, 1.0), (8, 0.55), (16, 0.32), (32, 0.18)], rng)
    dust = fractal(size, [(12, 0.7), (24, 0.4), (48, 0.25), (96, 0.15)], rng)
    img = Image.new("LA", (size, size))
    px = img.load()
    tau = math.pi * 2
    arms = ((3, 5, 1.0), (-5, 2, 0.72), (1, -6, 0.55))
    for y in range(size):
        v = y / size
        wrow = warp[y]
        drow = dust[y]
        for x in range(size):
            u = x / size
            w = (wrow[x] - 0.5) * 1.35
            acc = 0.0
            wt = 0.0
            for kx, ky, amp in arms:
                acc += amp * math.sin(tau * (kx * u + ky * v) + w * tau)
                wt += amp
            t = (acc / wt + 1) * 0.5
            ridge = smoothstep(min(1.0, max(0.0, (t - 0.38) / 0.42))) ** 1.15
            mist = max(0.0, drow[x] - 0.55) * 1.6
            val = min(1.0, ridge * 0.88 + mist * 0.45)
            px[x, y] = (255, int(230 * val))
    for _ in range(int(size * size * 0.0018)):
        x = rng.randrange(size)
        y = rng.randrange(size)
        a = px[x, y][1]
        if a > 80:
            px[x, y] = (255, min(255, a + rng.randrange(20, 70)))
    return img


def _put(px, size: int, x: int, y: int, rgb: tuple[int, int, int], a: int) -> None:
    x %= size
    y %= size
    px[x, y] = (rgb[0], rgb[1], rgb[2], a)


def _disk(px, size: int, cx: float, cy: float, radius: float, rgb: tuple[int, int, int], a: int = 230) -> None:
    span = int(math.ceil(radius)) + 1
    r2 = radius * radius
    for dy in range(-span, span + 1):
        for dx in range(-span, span + 1):
            if dx * dx + dy * dy > r2:
                continue
            _put(px, size, round(cx + dx), round(cy + dy), rgb, a)


def make_ball_tile(size: int, count: int, master: bool) -> Image.Image:
    """Seamless grid of Poké Balls or Master Balls.

    Drawn, not sampled — same licence story as the other foil sheets. The tile
    repeats on the reverse-holo frame; two sizes stacked in CSS give depth.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    step = size / count
    radius = step * 0.36
    if master:
        top, bottom, band, button, ring = (
            (118, 62, 196),
            (246, 228, 255),
            (22, 14, 36),
            (236, 92, 186),
            (18, 12, 28),
        )
    else:
        top, bottom, band, button, ring = (
            (214, 42, 48),
            (248, 248, 252),
            (18, 14, 18),
            (248, 248, 252),
            (18, 14, 18),
        )
    for gy in range(count):
        for gx in range(count):
            cx = (gx + 0.5) * step
            cy = (gy + 0.5) * step
            _disk(px, size, cx, cy, radius + 1.4, ring, 235)
            span = int(math.ceil(radius)) + 1
            r2 = radius * radius
            band_h = radius * 0.16
            for dy in range(-span, span + 1):
                for dx in range(-span, span + 1):
                    if dx * dx + dy * dy > r2:
                        continue
                    colour = top if dy < 0 else bottom
                    if abs(dy) <= band_h:
                        colour = band
                    _put(px, size, round(cx + dx), round(cy + dy), colour, 230)
            _disk(px, size, cx, cy, radius * 0.28, ring, 240)
            _disk(px, size, cx, cy, radius * 0.18, button, 240)
            _disk(px, size, cx, cy, radius * 0.08, ring, 240)
    return img


def make_pokeball() -> Image.Image:
    return make_ball_tile(256, 4, False)


def make_pokeball_tiny() -> Image.Image:
    return make_ball_tile(256, 8, False)


def make_masterball() -> Image.Image:
    return make_ball_tile(256, 4, True)


def make_masterball_tiny() -> Image.Image:
    return make_ball_tile(256, 8, True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("grain.png", make_grain),
        ("glitter.png", make_glitter),
        ("cosmos.png", make_cosmos),
        ("weave.png", make_weave),
        ("metal.png", make_metal),
        ("facet.png", make_facet),
        ("prism.png", make_prism),
        ("swirl.png", make_swirl),
        ("pokeball.png", make_pokeball),
        ("pokeball-tiny.png", make_pokeball_tiny),
        ("masterball.png", make_masterball),
        ("masterball-tiny.png", make_masterball_tiny),
    ]
    for name, fn in jobs:
        img = fn()
        path = OUT / name
        img.save(path, optimize=True)
        print(f"  {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
