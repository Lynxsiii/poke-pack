"""Generate Prismatic Evolutions' Poké Ball and Master Ball pattern textures.

Every Common, Uncommon and Rare in Prismatic Evolutions has a Poké Ball
pattern print, and the Pokémon among them a Master Ball one as well
(scripts/build_patterns.py files them as cards of their own). Pokémon TCG
Live prints both RAINBOW / ETCHED: rainbow foil over the whole card except
the Pokémon and the text, cut with a grating of crystal shards, each shard
ruled with parallel lines at its own angle so that each one lights at its own
tilt, and a big unetched ball behind the attacks that catches the light as
one smooth rainbow (Poké Ball dome, band and lower rim; the Master Ball adds
its two side bumps and the M).

The shards and the balls sit in the same place on every card, so rather than
ship an etch map per print (about 160 KB each, 167 prints), this script reads
them out of TCG Live's own etch maps once. The per-pixel median over every
print keeps what all of them share and drops each card's own art and text.
Fill the lab cache first:

    python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv8pt5 --all --variant sph
    python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set sv8pt5 --all --variant mph
    python3 scripts/make_prismatic_textures.py

Outputs (assets/foil/prismatic/), each covering the whole card, which the
CSS stretches to the card (css/holo/prismatic.css):

    shards.webp      the shards: grey is the angle of the shard's lines
                     (0-180deg as 0-255), so the CSS can light the shards
                     whose lines face the light; transparent in the art
                     window, which has no shards
    pokeball.webp    the Poké Ball in the pastel rainbow it shows at rest,
                     alpha = its shape
    masterball.webp  the Master Ball, likewise
"""
from __future__ import annotations

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".claude" / "skills" / "card-textures" / "lab" / "cache" / "sv8pt5"
OUT = ROOT / "assets" / "foil" / "prismatic"
WIDTH = 367  # half TCG Live's 733: every shape here is broad and smooth.

# Measured on the medians (TCG Live's 733 x 1024 maps): the ball's circle,
# and the art window, where every card's own art etch disagrees.
BALL = (366.0, 691.0, 161.0)  # centre x, centre y, radius
ART = (58, 115, 675, 485)  # left, top, right, bottom


def luminance(path: Path) -> np.ndarray:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    return (a[..., :3].mean(-1) * a[..., 3] / 255).astype(np.uint8)


def etch_stats(variant: str) -> tuple[np.ndarray, np.ndarray]:
    """Per-pixel median and 15th percentile over every print's etch map."""
    paths = sorted(CACHE.glob(f"*-{variant}.etch.png"))
    if len(paths) < 20:
        sys.exit(f"only {len(paths)} {variant} etch maps in {CACHE}; fetch them first (see the docstring)")
    print(f"  {variant}: {len(paths)} etch maps")
    stack = np.stack([luminance(p) for p in paths])
    return np.median(stack, axis=0).astype(np.float32), np.percentile(stack, 15, axis=0).astype(np.float32)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian (Pillow cannot blur float images)."""
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = a.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r, r)
        p = np.pad(out, pad, mode="edge")
        n = out.shape[axis]
        out = sum(w * np.take(p, range(i, i + n), axis=axis) for i, w in enumerate(k))
    return out


def shrink(a: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize(size, Image.BOX), dtype=np.float32)


def shard_angles(med: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """RGBA: grey = each shard's line angle, alpha 0 in the art window."""
    lum = med
    gy, gx = np.gradient(blur(lum, 0.8))
    j11, j22, j12 = blur(gx * gx, 3), blur(gy * gy, 3), blur(gx * gy, 3)
    # Doubled-angle vector of the gradient: lines at 0 and 180deg agree, and
    # averaging it across a shard keeps the shard's angle.
    c, s = j11 - j22, 2 * j12
    energy = np.hypot(c, s)
    coherent = (energy / np.maximum(j11 + j22, 1e-3) > 0.6) & (energy > np.percentile(energy, 40))
    # Text left in the median, the ball and the bars carry no lines; they take
    # the angle of the nearest shard.
    c, s, w = (shrink(v, size) for v in (np.where(coherent, c / np.maximum(energy, 1e-3), 0),
                                         np.where(coherent, s / np.maximum(energy, 1e-3), 0),
                                         coherent.astype(np.float32)))
    known = w > 0.5
    c, s = np.where(known, c / np.maximum(w, 1e-3), 0), np.where(known, s / np.maximum(w, 1e-3), 0)
    for _ in range(400):
        if known.all():
            break
        grow = np.zeros_like(c), np.zeros_like(s), np.zeros_like(c)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            k = np.roll(known, (dy, dx), (0, 1))
            grow[0][...] += np.where(k, np.roll(c, (dy, dx), (0, 1)), 0)
            grow[1][...] += np.where(k, np.roll(s, (dy, dx), (0, 1)), 0)
            grow[2][...] += k
        new = ~known & (grow[2] > 0)
        c = np.where(new, grow[0] / np.maximum(grow[2], 1), c)
        s = np.where(new, grow[1] / np.maximum(grow[2], 1), s)
        known |= new
    # Gradient angle -> line angle (perpendicular), 0..180deg -> 0..1.
    angle = ((np.arctan2(s, c) / 2 + np.pi / 2) % np.pi) / np.pi
    grey = (angle * 255).round().astype(np.uint8)
    alpha = np.full_like(grey, 255)
    sx, sy = size[0] / med.shape[1], size[1] / med.shape[0]
    left, top, right, bottom = ART
    alpha[round(top * sy):round(bottom * sy), round(left * sx):round(right * sx)] = 0
    return np.dstack([grey, grey, grey, alpha])


def ball_shape(dark: np.ndarray, size: tuple[int, int], margin: float, mirror: str) -> np.ndarray:
    """0..1 alpha of the unetched ball: dark (no lines) and on the ball.

    Both balls are symmetric, which cleans up what the median leaves:
    `mirror="min"` keeps only what both halves agree on (text residue on one
    side drops out), "max" restores an outline one half lost.
    """
    h, w = dark.shape
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy, r = BALL
    inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= (r + margin) ** 2
    solid = ((blur(dark, 3) < 55) & inside).astype(np.float32)
    flipped = solid[:, np.clip(np.round(2 * cx - np.arange(w)).astype(int), 0, w - 1)]
    solid = np.minimum(solid, flipped) if mirror == "min" else np.maximum(solid, flipped)
    # Close: fill pinholes and hairline breaks.
    solid = (blur(solid, 3) > 0.25).astype(np.float32)
    solid = (blur(solid, 3) > 0.75).astype(np.float32)
    return shrink(blur(solid, 1.2), size).clip(0, 1)


def pastel_rainbow(size: tuple[int, int], saturation: float) -> np.ndarray:
    """The ball's resting colours: a diagonal sweep from warm to cool, as photos
    of the Poké Ball print show (orange and yellow on the dome's upper left,
    cyan through the middle, violet and pink on the lower right)."""
    w, h = size
    cx, cy, r = (v * w / 733 for v in BALL)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (((xx - cx) + (yy - cy)) / (2 * r) + 0.5).clip(0, 1)
    hues = np.array([28, 50, 95, 185, 250, 300, 330], np.float32) / 360
    stops = np.linspace(0, 1, len(hues))
    hue = np.interp(t, stops, hues)
    rgb = np.zeros((h, w, 3), np.float32)
    for y in range(h):
        for x in range(w):
            rgb[y, x] = colorsys.hls_to_rgb(float(hue[y, x]), 0.76, saturation)
    return (rgb * 255).round().astype(np.uint8)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    (sph, sph_low), (mph, _) = etch_stats("sph"), etch_stats("mph")
    height = round(WIDTH * sph.shape[0] / sph.shape[1])
    size = (WIDTH, height)

    Image.fromarray(shard_angles(sph, size), "RGBA").save(
        OUT / "shards.webp", "WEBP", lossless=True, method=6)
    # Attack names cross the Poké Ball's dome at every height, which frays the
    # median's edge there; the low percentile keeps it round. Below the dome
    # both balls are the same drawing, and the Master Ball prints (Pokémon
    # only, fewer layouts) leave a cleaner median of it. The Master Ball's
    # dome carries the M and two side bumps, which the median keeps and the
    # percentile smudges; the bumps stand a little proud of the circle.
    rows = np.arange(sph.shape[0])[:, None]
    dome = rows < BALL[1] - 0.42 * BALL[2]
    balls = (
        ("pokeball", np.where(dome, sph_low, mph), 2, "max", 0.9),
        ("masterball", mph, 14, "max", 0.55),
    )
    for name, dark, margin, mirror, saturation in balls:
        alpha = (ball_shape(dark, size, margin, mirror) * 255).round().astype(np.uint8)
        rgb = pastel_rainbow(size, saturation)
        Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(
            OUT / f"{name}.webp", "WEBP", quality=88, alpha_quality=90, method=6)
    for p in sorted(OUT.glob("*.webp")):
        print(f"  {p.relative_to(ROOT)}  {p.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
