"""Draw the bw-tinsel-holo family's Crosshatch foil: the Victory Cup trophy promos BW29, BW30 and BW31.

What the real foil does (2026-10-22 audit; Collexy's scans of BW29 autumn 2011 and spring 2012, BW30 and BW31 with a
2x zoom of BW31's text panel, in /home/user/holo-refs/bw-tinsel-bw1-bw2/bwp-victory-cup/ and
/home/user/holo-refs/bw-tinsel-bwp-bwtk5a-bwtk5b/bwp029..bwp031/; Collexy's BW holofoil overview files BW29-31 as
"Crosshatch"): a reverse-style foil over the card's BODY: the silver frame, the TRAINER header and the whole text
panel (under the rules text too), silver-white and plainly metallic at any angle. Its pattern is a plaid: fine
straight horizontal ridges (about 0.8 % of the card height apart) crossed by broad diagonal bands at +45 and -45
degrees, 3-6 % of the card width, edged with thin brighter lines, so the panel reads as a tartan; scattered rainbow
sparkle points. The art window is not foil (the bwp audit, from all three scans; the round-2 review found Collexy's
BW29 and BW31 windows dark with no lattice, where a third-strength window drew a diamond grid over the confetti at
every pose): alpha 0. The Battle Road stamp and the blue rule bar are printed ink: cut out.

Writes, 512 x 1024 textures (stretched over the card, built in millimetre space so the diagonals are at 45 degrees on
the 63 x 88 mm card) and one map per card:

- crosshatch-v1.webp: grey, the plaid as a hard-light source around 0.48 (the scan already shows the panel's grey
  metal), the bands and their pinstripes +-0.22, floored at 0.457 (a dark band shades white by at most 36 levels,
  the dark-speck budget), the ridges +-0.04, no 2-4 px grating anywhere (the diagonal band edges are 13+ device px
  apart on a phone).
- crosshatch-sparkle-v1.webp: grey on black, about 1500 hard pinpoints for the held rainbow sparkle.
- maps/bwp/bwp0NN-cross-v1.webp: RGBA white, alpha the foil: 1 on the body (everything inside the yellow border),
  0 in the art window, 0 on the Battle Road stamp, 0.3 on the blue rule bar; read from the card's own scan, so the
  cut-outs sit on the printed edges.

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_crosshatch.py [--force] [--preview <png>]

A file that exists is kept unless --force (only for a draft that has never shipped: /assets/* is cached for a year).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_opening, gaussian_filter, gaussian_filter1d, label

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
V = "v1"
W, H = 512, 1024
MM_W, MM_H = 63.0, 88.0
SEED = 20129
CARDS = ("bwp029", "bwp030", "bwp031")
WINDOW = (0.079, 0.148, 0.918, 0.508)   # the art window (x0, y0, x1, y1), from the cards' TCG Live-style maps
WINDOW_ALPHA = 0.0


def bands(rng: np.random.Generator, u: np.ndarray, span: float) -> np.ndarray:
    """A plaid family along u (mm): bands 1.9-3.8 mm wide (3-6 % of the card width), each its own (soft) level, and
    thin brighter pinstripes at the band edges and 0.5-1.4 mm apart inside them (the scan's tartan is mostly lines)."""
    edges = [-span - rng.uniform(0, 4)]
    while edges[-1] < span + 4:
        edges.append(edges[-1] + rng.uniform(1.9, 3.8))
    edges = np.array(edges)
    levels = rng.uniform(-1, 1, len(edges))
    idx = np.clip(np.searchsorted(edges, u) - 1, 0, len(edges) - 1)
    val = levels[idx] * 0.35
    # thin lines (0.2 mm): one at each band edge and pinstripes 0.5-1.4 mm apart inside the bands, each its own weight
    pins = [edges[0]]
    while pins[-1] < edges[-1]:
        pins.append(pins[-1] + rng.uniform(0.5, 1.4))
    pins = np.sort(np.concatenate([edges, np.array(pins)]))
    weight = rng.uniform(0.2, 1.0, len(pins)) * (rng.random(len(pins)) < 0.7)
    k = np.clip(np.searchsorted(pins, u), 1, len(pins) - 1)
    d0, d1 = np.abs(u - pins[k - 1]), np.abs(pins[k] - u)
    line = weight[k - 1] * np.exp(-0.5 * (d0 / 0.11) ** 2) + weight[k] * np.exp(-0.5 * (d1 / 0.11) ** 2)
    return gaussian_filter(val, 1.0) + 0.9 * line


def ridges(rng: np.random.Generator) -> np.ndarray:
    """Fine horizontal ridges, aperiodic 6.5-9.5 px pitch (about 0.8 % of the card height), broken into streaks."""
    out = np.zeros((H, W))
    x = np.arange(W)
    y = rng.uniform(0, 6.5)
    while y < H + 10:
        pitch = rng.uniform(6.5, 9.5)
        half = pitch * rng.uniform(0.3, 0.4)
        amp = np.full(W, rng.uniform(0.5, 1.0))
        pos = -rng.uniform(0, 60)
        while pos < W:
            ln = rng.uniform(20, 90)
            a, b = int(max(pos, 0)), int(min(pos + ln, W))
            if b > a:
                amp[a:b] *= rng.uniform(0.6, 1.0)
            pos += ln
        amp = gaussian_filter1d(amp, 3)
        rows = np.arange(max(int(y - half) - 1, 0), min(int(y + half) + 2, H))
        d = (rows - y) / half
        prof = np.where(np.abs(d) < 1, 0.5 * (1 + np.cos(np.pi * d)), 0.0)
        out[rows] = np.maximum(out[rows], prof[:, None] * amp[None, :])
        y += pitch
    return gaussian_filter(out, (0.5, 1.0))


def texture(seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    X, Y = (xx + 0.5) * MM_W / W, (yy + 0.5) * MM_H / H
    up = (X + Y) / np.sqrt(2)
    dn = (X - Y) / np.sqrt(2)
    span = (MM_W + MM_H) / np.sqrt(2)
    plaid = bands(rng, up, span) + bands(rng, dn, span)
    plaid = plaid / (np.percentile(np.abs(plaid), 99) + 1e-9)
    rid = ridges(rng)
    # just under neutral (the scan already carries the panel's grey metal): the bright bands and pinstripes lift, the
    # dark bands shade the pale panel, floored at 0.457 (0.43 after WebP ringing: hard-light x0.86, at most 36 levels on white: a dark line that
    # crosses bright print never makes a dark speck, dark_specks.py), so the tartan reads by its dark bands
    tex = np.maximum(0.48 + 0.22 * plaid + 0.08 * (rid - rid.mean()), 0.457)
    sparkle = np.zeros((H, W))
    for _ in range(1500):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(0.5, 1.0)
        x0, x1, y0, y1 = int(max(cx - 3, 0)), int(min(cx + 4, W)), int(max(cy - 3, 0)), int(min(cy + 4, H))
        sy, sx = np.mgrid[y0:y1, x0:x1]
        dd = np.hypot(sx + 0.5 - cx, sy + 0.5 - cy)
        sparkle[y0:y1, x0:x1] = np.maximum(sparkle[y0:y1, x0:x1], np.clip(r + 0.5 - dd, 0, 1) * rng.uniform(0.6, 1.0))
    return np.clip(tex, 0, 1), sparkle


def card_map(n: str) -> np.ndarray:
    im = np.asarray(Image.open(ROOT / "assets" / "cards" / "bwp" / f"{n}.webp").convert("RGBA")).astype(int)
    h, w = im.shape[:2]
    r, g, b, a = (im[..., i] for i in range(4))
    yellow = (r > 170) & (g > 140) & (b < 120) & (r - b > 80)
    # the border is the yellow run from the card's edge; the body is everything inside it
    border = np.zeros((h, w), bool)
    lab, _ = label(yellow)
    for edge in (lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]):
        for k in np.unique(edge):
            if k:
                border |= lab == k
    body = (a > 0) & ~binary_dilation(border, iterations=1)
    alpha = body.astype(float)
    x0, y0, x1, y1 = (int(round(v * s)) for v, s in zip(WINDOW, (w, h, w, h)))
    alpha[y0:y1, x0:x1] *= WINDOW_ALPHA
    # the blue rule bar (lower fifth): blue ink
    blue = (b > r + 50) & (b > 130) & (np.arange(h)[:, None] > h * 0.8)
    blue = binary_opening(blue, iterations=2)
    if blue.any():
        ys, xs = np.where(blue)
        alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1] *= 0.3
    # the Battle Road stamp (lower right): its green crest, grown to cover its white and black outline
    green = (g > r + 35) & (g > b + 25) & (np.arange(h)[:, None] > h * 0.7) & (np.arange(w)[None, :] > w * 0.55)
    green = binary_opening(green, iterations=1)
    if green.any():
        stamp = binary_dilation(green, iterations=int(0.012 * w))
        lab2, k = label(stamp)
        sizes = np.bincount(lab2.ravel())
        sizes[0] = 0
        stamp = lab2 == sizes.argmax()
        ys, xs = np.where(stamp)
        pad = int(0.01 * w)
        top = int(0.035 * h)  # the "Pokemon" wordmark sits above the green crest
        hull = np.zeros_like(stamp)
        hull[max(ys.min() - top, 0):ys.max() + pad, max(xs.min() - pad, 0):xs.max() + pad] = True
        alpha[hull] = 0
    alpha = gaussian_filter(alpha, 0.8)
    return np.dstack([np.full((h, w, 3), 255, np.uint8), np.uint8(np.clip(alpha, 0, 1) * 255 + 0.5)])


def save(img: Image.Image, path: Path, force: bool, **kw) -> None:
    if path.exists() and not force:
        print("kept", path.relative_to(ROOT), "(pass --force to rewrite a draft that has never shipped)")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", method=6, **kw)
    print("wrote", path.relative_to(ROOT), path.stat().st_size, "bytes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()
    tex, sparkle = texture(SEED)
    u8 = lambda a: np.uint8(np.clip(a, 0, 1) * 255 + 0.5)  # noqa: E731
    save(Image.fromarray(u8(tex), "L"), OUT / f"crosshatch-{V}.webp", args.force, quality=92)
    save(Image.fromarray(u8(sparkle), "L"), OUT / f"crosshatch-sparkle-{V}.webp", args.force, quality=92)
    for n in CARDS:
        save(Image.fromarray(card_map(n), "RGBA"), OUT / "maps" / "bwp" / f"{n}-cross-{V}.webp", args.force, lossless=True)
    if args.preview:
        Image.fromarray(u8(tex), "L").save(args.preview)


if __name__ == "__main__":
    main()
