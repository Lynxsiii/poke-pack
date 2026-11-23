"""Redraw the Sword & Shield reverse holo chevron sheet for the swsh-reverse family (2026-10-22).

TCG Live's reverse maps (the medians in assets/foil/swsh-reverse/<type>.webp, make_swsh_reverse.py) have the right
geometry: 7 columns of up-pointing chevrons, the columns offset by half a cell, one type icon per cell. Their grey
levels are wrong for this site, though: Live alternates white icons in dark cells, and the real cards never show a light
icon. On the physical card (Oddish CRZ 001, Golduck EVS 025, Bidoof PGO 059, Slugma and Vullaby FST, Peonia CRE 149)
every cell has its own tone, every icon is darker than its cell with the veins at the cell's tone, and the chevron
edges are thin darker lines. So this script keeps Live's geometry and redraws the greys:

- folds Live's tile onto one cell (period, column pitch and the two column phases are measured from its thin bright
  separator lines) and averages every cell into one icon stencil and one separator stencil, contrast-normalised per
  cell, which removes Live's light/dark alternation and the median's noise;
- draws the lattice over the whole card at 734 x 1024 (the per-card masks decide where the foil is, so the tile has no
  holes: a hole in a median tile is wherever MOST cards have a cost dot);
- tones: a column base from a fixed sequence (0.62 .. 1.0) times a small per-cell variation; icon = 0.55 x its cell;
  separators = 0.78 x the cell. White = untouched in a multiply.

Output: assets/foil/fam/swsh-reverse/tone-<type>-v1.webp (grey, opaque). `energy` (Special Energy: stars) folds the
median of the Special Energy reverse maps, whose band sits lower on the card (needs --live-dir with those maps).

    python3 .claude/skills/card-textures/scripts/fam/swsh-reverse/make_tiles.py [--live-dir DIR] [--preview DIR]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
SRC = ROOT / "assets" / "foil" / "swsh-reverse"
OUT = ROOT / "assets" / "foil" / "fam" / "swsh-reverse"
TYPES = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless", "trainer"]
SIZE = (734, 1024)
VERSION = 1
# Column base tones (left to right, the partial edge columns included) and the per-cell variation down a column.
COLUMN = [0.80, 0.97, 0.70, 0.88, 0.62, 0.92, 0.74, 0.84, 0.66]
CELL = [1.0, 0.86, 1.08, 0.93, 0.82, 1.05, 0.90, 1.0, 0.85, 1.07, 0.95]
ICON = 0.6
SEP = 0.78


def load(path: Path) -> tuple[np.ndarray, np.ndarray]:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    return a[..., :3].mean(2), a[..., 3] > 128


def tophat(g: np.ndarray) -> np.ndarray:
    return g - ndimage.grey_opening(g, size=(5, 5))


def lattice(g: np.ndarray, valid: np.ndarray, rows: slice) -> tuple[float, float, float, float, float]:
    """Column edge x0, pitch w, period p and the even/odd column phases, from the thin bright separators."""
    th = np.where(valid, tophat(g), 0)
    prof = th[rows].mean(0)
    # the vertical separators: the pitch and offset whose 8 lines collect the most separator strength
    xs = np.arange(len(prof))
    best = (-1.0, 0.0, 0.0)
    for w in np.arange(44.5, 47.0, 0.05):
        for x0 in np.arange(0, w, 0.25):
            score = float(np.interp(x0 + w * np.arange(8), xs, prof).sum())
            if score > best[0]:
                best = (score, x0, w)
    _, x0, w = best
    p = 60.0
    phases = []
    for parity in (0, 1):
        acc = np.zeros(int(p))
        for c in range(parity, 7, 2):
            ex = int(round(x0 + w * c + 3))
            col = th[:, ex - 1:ex + 2].mean(1) * valid[:, ex]
            for y in range(len(col)):
                acc[int(y % p)] += col[y]
        phases.append(float(np.argmax(acc)))
    return float(x0), float(w), p, phases[0], phases[1]


def fold(g: np.ndarray, valid: np.ndarray, x0: float, w: float, p: float, ph: tuple[float, float], scale: int = 4):
    """Average every cell into one W x P stencil (scale x finer): icon membership (0..1) and separator strength."""
    fw, fp = int(round(w * scale)), int(round(p * scale))
    icon = np.zeros((fp, fw)); sep = np.zeros((fp, fw)); n = np.zeros((fp, fw))
    th = tophat(g)
    yy, xx = np.mgrid[0:fp, 0:fw] / scale
    for c in range(7):
        phase = ph[c % 2]
        for k in range(-1, int(g.shape[0] / p) + 1):
            # cell window: from this column's separator at its edge, one period down
            X = x0 + w * c + xx
            Y = phase + k * p + yy
            inside = (Y >= 0) & (Y < g.shape[0] - 1)
            if inside.mean() < 0.999:
                continue
            ok = ndimage.map_coordinates(valid.astype(np.float32), [Y, X], order=0) > 0.5
            if ok.mean() < 0.9:
                continue
            patch = ndimage.map_coordinates(g, [Y, X], order=1)
            tpatch = ndimage.map_coordinates(th, [Y, X], order=1)
            lo, hi = np.percentile(patch, [25, 97])
            if hi - lo < 12:
                continue
            icon += np.clip((patch - lo) / (hi - lo), 0, 1)
            sep += tpatch
            n += 1
    count = int(n.max())
    return icon / np.maximum(n, 1), sep / np.maximum(n, 1), count


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def draw(icon: np.ndarray, sep: np.ndarray, x0: float, w: float, p: float, ph: tuple[float, float], src_w: int, src_h: int) -> np.ndarray:
    """The lattice over the whole card at SIZE, supersampled 2x."""
    ss = 2
    W, H = SIZE[0] * ss, SIZE[1] * ss
    sx, sy = src_w / W, src_h / H
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    X = (xx + 0.5) * sx - 0.5
    Y = (yy + 0.5) * sy - 0.5
    c = np.floor((X - x0) / w).astype(int)
    xf = X - (x0 + w * c)
    phase = np.where(c % 2 == 0, ph[0], ph[1])
    k = np.floor((Y - phase) / p).astype(int)
    yf = Y - (phase + k * p)
    fp, fw = icon.shape
    scale = fw / w
    coords = [np.clip(yf * scale, 0, fp - 1), np.clip(xf * scale, 0, fw - 1)]
    I = ndimage.map_coordinates(icon, coords, order=1, mode="nearest")
    S = ndimage.map_coordinates(sep, coords, order=1, mode="nearest")
    # which cell (for its tone): the separator V runs through the window, so a pixel above the V line belongs to the
    # cell above. The V line in the window: the separator's per-column argmax.
    # The V (pointing up): at the column's edges the separator sits at the window's foot (y' = P), at its middle D higher.
    # the apex: the separator's strongest row in the middle of the window, searched only 5..20 px above the foot
    mid = slice(int(fw * 0.45), int(fw * 0.55))
    band = slice(int((p - 20) * scale), int((p - 5) * scale))
    apex = (band.start + float(np.argmax(sep[band, mid].mean(1)))) / scale
    depth = p - apex
    vy = p - depth * (1 - np.abs(2 * xf / w - 1))
    cell_k = k + (yf >= vy).astype(int)
    col_i = np.clip(c + 1, 0, len(COLUMN) - 1)
    base = np.array(COLUMN)[col_i]
    var = np.array(CELL)[(cell_k * 3 + c * 5) % len(CELL)]
    tone = np.clip(base * var, 0.55, 1.0)
    # a soft lift towards the top of each cell, as on the photos (the chevron catches more light at its point)
    tone = tone * (1.0 - 0.04 * np.clip((yf - vy) / p, 0, 1))
    ic = smoothstep(0.42, 0.62, I)
    sp = smoothstep(0.35, 0.75, S / max(float(S.max()), 1e-6))
    out = tone * (1 - ic * (1 - ICON))
    out = out * (1 - sp * (1 - SEP))
    out = out.reshape(SIZE[1], ss, SIZE[0], ss).mean((1, 3))
    return out


def energy_source(live_dir: Path) -> tuple[np.ndarray, np.ndarray] | None:
    maps = sorted(live_dir.glob("swsh*_*.png"))
    stack = []
    for m in maps:
        g, v = load(m)
        if v.mean() < 0.99:  # Live's maps are opaque; the foil is where the grey is above its floor
            pass
        a = np.asarray(Image.open(m).convert("RGBA")).astype(np.float32)
        grey = a[..., :3].mean(2) * a[..., 3] / 255
        stack.append(grey)
    if len(stack) < 3:
        return None
    med = np.median(np.stack(stack), 0)
    return med, med > 40


def grain() -> None:
    """The metallic grain the glow rides on (grain-v1.webp): 96 px of fine noise, 0.72 .. 1.0, shown at 1.5 css px a dot."""
    rng = np.random.default_rng(25)
    n = ndimage.gaussian_filter(rng.random((96, 96)), 0.6, mode="wrap")
    n = (n - n.min()) / (n.max() - n.min())
    img = Image.fromarray(np.clip((0.72 + 0.28 * n) * 255, 0, 255).astype(np.uint8), "L")
    img.save(OUT / f"grain-v{VERSION}.webp", quality=90, method=6)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live-dir", type=Path, help="TCG Live reverse maps of the Special Energy prints (for energy)")
    ap.add_argument("--preview", type=Path, help="also write a preview jpg per tile here")
    ap.add_argument("--only", help="comma list of tiles")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    grain()
    names = TYPES + (["energy"] if args.live_dir else [])
    if args.only:
        names = [n for n in names if n in args.only.split(",")]
    for name in names:
        if name == "energy":
            src = energy_source(args.live_dir)
            if src is None:
                print("energy: no maps")
                continue
            g, valid = src
            rows = slice(int(g.shape[0] * 0.66), int(g.shape[0] * 0.9))
        else:
            g, valid = load(SRC / f"{name}.webp")
            g = np.where(valid, g, 0)
            rows = slice(int(g.shape[0] * 0.52), int(g.shape[0] * 0.84))
        x0, w, p, pa, pb = lattice(g, valid, rows)
        icon, sep, count = fold(g, valid, x0, w, p, (pa, pb))
        out = draw(icon, sep, x0, w, p, (pa, pb), g.shape[1], g.shape[0])
        img = Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8), "L")
        path = OUT / f"tone-{name}-v{VERSION}.webp"
        img.save(path, quality=84, method=6)
        print(f"{name}: depth {p - (np.argmax(sep[int((p - 20) * 4):int((p - 5) * 4), int(sep.shape[1] * 0.45):int(sep.shape[1] * 0.55)].mean(1)) / 4 + p - 20):.1f}, x0 {x0:.1f} pitch {w:.2f} period {p:.0f} phases {pa:.0f}/{pb:.0f}, {count} cells, {path.stat().st_size // 1024} KB")
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            img.convert("RGB").save(args.preview / f"tone-{name}.jpg", quality=88)


if __name__ == "__main__":
    main()
