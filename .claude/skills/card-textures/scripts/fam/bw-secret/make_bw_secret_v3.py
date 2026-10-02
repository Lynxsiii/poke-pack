#!/usr/bin/env python3
"""Third pass of the bw-secret maps (2026-10-02, review #2). Writes NEW files (-v3) beside the shipped ones in
assets/foil/fam/bw-secret/; nothing shipped is touched. It also re-encodes the unshipped -v2 files the review flagged.

  glint-v3.webp          the 13 yellow-border faces (bw1-115 ... bw6-128): ONE full-card speck map at the native
                         733 x 1024, white with alpha = a fine round gaussian speck (sigma about 1.2 px, a few brighter
                         and larger), jittered so it never shows a grid or a repeat. Review #2: TCG Live's etch for these
                         cards is the swirl lines of the window background and the rings of the text box, so it
                         intersects the Pokemon-shaped foil mask almost nowhere and the "etched glitter" layer painted
                         nothing; the real shiny reprints glitter across the Pokemon (refs/y_crops1.jpg). The CSS draws
                         this map through the Pokemon-shaped .foil mask, so the specks land on the Pokemon only.
  fm/<id>-v3.webp        the 13 yellow-border faces: TCG Live's foil map (the Pokemon, plus the text-box symbol) with the black of the
                         print (pupils, outlines) and the red of it (cheeks) knocked out inside the art window, so the
                         rainbow band and the glitter never turn an eye cyan or a cheek violet (review #2 polish 5; hard-light
                         lifts any dark pixel the band crosses). Baked, one plain alpha map (no mask-composite fold).
  ink/<id>-v3.webp       bw11-114 Zekrom/Reshiram (the all-gold faces): alpha = 1 on the gold of the scan, 0 on every
                         other printed colour (black type, red and blue symbols, white energy) and two pixels beyond it.
                         It replaces the stacked luminance masks of v2 (the gain-2 `var(--art)` fold left the ink at
                         alpha 0.2, so the hard-light base lifted it by 11 levels); one plain alpha map is the same in
                         Chromium and WebKit (a four-layer mask-composite fold draws no foil in WebKit).
  eng/bw11-114-v2.webp, bw11-115-v2.webp   re-encoded (alpha quality 70) because the first encode was 407 KB; same pixels (unshipped).
  grain/<id>-a-v2.webp, -b-v2.webp
                         rewritten in place (unshipped): fewer, rounder, larger bumps (see grain3()).

    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_v3.py              # everything
    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_v3.py --only glint,ink
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bws_v2", HERE / "make_bw_secret_v2.py")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
v1 = v2.v1
ROOT, OUT, W, H = v2.ROOT, v2.OUT, v2.W, v2.H


def glint(seed: int = 20261002, cell: float = 6.5, prob: float = 0.6) -> np.ndarray:
    """A jittered grid of gaussian specks over the whole card; alpha 0..1. Never repeats."""
    rng = np.random.default_rng(seed)
    canvas = np.zeros((H + 24, W + 24), dtype=np.float32)
    ny, nx = int(H / cell) + 2, int(W / cell) + 2
    r = 6
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
    for j in range(ny):
        for i in range(nx):
            if rng.random() > prob:
                continue
            cx, cy = (i + rng.random()) * cell, (j + rng.random()) * cell
            bright = rng.random() < 0.12
            sigma = rng.uniform(1.6, 2.0) if bright else rng.uniform(0.95, 1.3)
            amp = 1.0 if bright else max(0.3, rng.random() ** 0.8)
            ix, iy = int(round(cx)), int(round(cy))
            patch = amp * np.exp(-(((xx - (cx - ix)) ** 2 + (yy - (cy - iy)) ** 2) / (2 * sigma ** 2)))
            y0, x0 = iy + 12 - r, ix + 12 - r
            if y0 < 0 or x0 < 0 or y0 + 2 * r + 1 > canvas.shape[0] or x0 + 2 * r + 1 > canvas.shape[1]:
                continue
            canvas[y0:y0 + 2 * r + 1, x0:x0 + 2 * r + 1] += patch
    return np.clip(canvas[12:12 + H, 12:12 + W], 0, 1)


def ink_mask(face: dict) -> np.ndarray:
    """1 on the gold of the scan, 0 on every other printed colour and two pixels beyond it."""
    scan = Image.open(ROOT / "assets" / "cards" / face["set"] / f"{face['n']}.webp").convert("RGB").resize((W, H), Image.LANCZOS)
    a = np.asarray(scan, dtype=np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn + 1e-6
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    goldness = (
        np.clip((mx - 0.5) / 0.12, 0, 1)
        * np.clip((sat - 0.28) / 0.12, 0, 1)
        * np.clip((hue - 24) / 6, 0, 1)
        * np.clip((80 - hue) / 6, 0, 1)
    )
    not_gold = ndimage.binary_dilation(goldness < 0.5, iterations=2)
    out = goldness * (~not_gold)
    return ndimage.gaussian_filter(out.astype(np.float32), 0.8)


SLIT_EYES = {"bw3-102"}  # Meowth: white eyes with a black slit pupil; the band's cyan edge turned the whole white eye cyan


def is_yellow(face: dict) -> bool:
    """The 13 yellow-border faces: every secret outside the gold sets (bw7-bw10) and the all-gold bw11 pair."""
    return face["set"] not in v1.GOLD_SETS and face["id"] not in v2.GOLD_FULL


def protect_mask(face: dict) -> np.ndarray:
    """1 on the round features of the print that must stay as printed under the band: pupils (brown-grey, darker than the face
    around them), nostrils and the red of cheeks, inside the art window only; soft, a few pixels wider than the feature.
    Only compact blobs count (at most 46 px across, discs, ellipses and the crescent of an open mouth; bw3-102 Meowth,
    SLIT_EYES, also gets a 30 px disc around each slit pupil, which stands for the whole white eye): a limb, an outline, a marking or a dark or red
    body keeps its foil (Emboar, Zoroark, Rayquaza)."""
    scan = Image.open(ROOT / "assets" / "cards" / face["set"] / f"{face['n']}.webp").convert("RGB").resize((W, H), Image.LANCZOS)
    a = np.asarray(scan, dtype=np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn + 1e-6
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    rel = lum / (ndimage.gaussian_filter(lum, 12) + 1e-3)
    dark = np.clip((0.30 - lum) / 0.05, 0, 1) * np.clip((0.55 - rel) / 0.10, 0, 1)
    dh = np.minimum(hue, 360 - hue)
    red = np.clip((14 - dh) / 4, 0, 1) * np.clip((sat - 0.45) / 0.15, 0, 1) * np.clip((mx - 0.5) / 0.15, 0, 1)
    cand = np.maximum(dark, red) > 0.5
    close = np.hypot(*np.mgrid[-6:7, -6:7]) <= 6.2
    cand = ndimage.binary_closing(np.pad(cand, 8), structure=close)[8:-8, 8:-8]  # a white highlight inside an eye
    cand = ndimage.binary_fill_holes(cand)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3)))
    size = np.bincount(lab.ravel(), minlength=n + 1)
    keep = np.zeros(n + 1, dtype=bool)
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        bh, bw = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        fill = size[i] / (bh * bw)
        keep[i] = 60 <= size[i] <= 1400 and max(bh, bw) <= 46 and max(bh, bw) / max(1, min(bh, bw)) <= 2.0 and 0.42 <= fill <= 0.95
    prot = keep[lab]
    if face["id"] in SLIT_EYES:
        # a narrow vertical slit (pupil) stands for the whole white eye around it: a disc of 30 px
        yy, xx = np.mgrid[0:H, 0:W]
        lab2, n2 = ndimage.label(np.maximum(dark, 0) > 0.5, structure=np.ones((3, 3)))
        size2 = np.bincount(lab2.ravel(), minlength=n2 + 1)
        for i, sl in enumerate(ndimage.find_objects(lab2), start=1):
            if sl is None:
                continue
            bh, bw = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if 60 <= size2[i] <= 400 and bh >= 18 and bw <= 12 and bh / max(1, bw) >= 2.2 and bh <= 40:
                cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
                prot |= (yy - cy) ** 2 + (xx - cx) ** 2 <= 30 ** 2
    # three pixels wider: the anti-aliased rim of a pupil is brown, not black, and would otherwise glow as a ring
    prot = ndimage.binary_dilation(prot, structure=np.hypot(*np.mgrid[-3:4, -3:4]) <= 3.2)
    x0, y0, x1, y1 = (round(v * W / 367) for v in v1.ART["pokemon"])
    win = np.zeros((H, W), dtype=bool)
    win[y0:y1, x0:x1] = True
    return ndimage.gaussian_filter((prot & win).astype(np.float32), 0.7)


def foil_knockout(face: dict) -> np.ndarray:
    """The shipped TCG Live foil map (white with alpha, 367 x 512; read only) at 733 x 1024 times (1 - protect)."""
    src = Image.open(ROOT / "assets" / "foil" / "maps" / face["set"] / f"{face['n']}.webp").convert("RGBA").split()[3]
    fm = np.asarray(src.resize((W, H), Image.BICUBIC), dtype=np.float32) / 255
    return np.clip(fm, 0, 1) * (1 - protect_mask(face))


def grain3(face: dict, foil_png: Path, etch_png: Path):
    """Pikachu 115 and Meowth 102: the pebbled scenery, fewer, rounder and larger than v2 (review #2: v2 read as short
    frost dashes at one angle, about 12 percent of the scenery; the real bumps are round pebbles, refs/pika_scenery_cmp.jpg).
    Bumps are gaussian domes on a jittered grid (about 12 px at 733 px, a third of the grid cells, 5 percent of the scenery), lit from the upper left
    (a, the dome's upper left crescent) and from the lower right (b, the lower right crescent)."""
    lumf, _ = v1.luminance(foil_png)
    lume, alpha = v1.luminance(etch_png)
    Hh, Ww = lume.shape
    pok = np.asarray(Image.fromarray(lumf.astype(np.uint8)).resize((Ww, Hh), Image.BILINEAR)).astype(np.float32) / 255
    pok = ndimage.binary_dilation(pok > 0.12, iterations=3)
    x0, y0, x1, y1 = (round(v * Ww / 367) for v in v1.ART["pokemon"])
    region = np.zeros((Hh, Ww), dtype=np.float32)
    region[y0 + 3:y1 - 2, x0 + 3:x1 - 3] = 1
    region *= ~pok
    region = ndimage.gaussian_filter(region, 1.5)
    rng = np.random.default_rng(zlib.crc32((face["id"] + "-v3").encode()))
    cell, prob, rad = 12.0, 0.34, 4.2
    dome = np.zeros((Hh, Ww), dtype=np.float32)
    ny, nx = int(Hh / cell) + 2, int(Ww / cell) + 2
    yy, xx = np.mgrid[-9:10, -9:10].astype(np.float32)
    for j in range(ny):
        for i in range(nx):
            if rng.random() > prob:
                continue
            cx, cy = (i + rng.random()) * cell, (j + rng.random()) * cell
            ix, iy = int(round(cx)), int(round(cy))
            s = rad * rng.uniform(0.8, 1.25)
            patch = np.exp(-(((xx - (cx - ix)) ** 2 + (yy - (cy - iy)) ** 2) / (2 * s ** 2)))
            ya, xa = iy - 9, ix - 9
            if ya < 0 or xa < 0 or ya + 19 > Hh or xa + 19 > Ww:
                continue
            dome[ya:ya + 19, xa:xa + 19] = np.maximum(dome[ya:ya + 19, xa:xa + 19], patch)
    dome = ndimage.gaussian_filter(dome, 0.6)
    gy, gx = np.gradient(ndimage.gaussian_filter(dome, 1.2))
    out = []
    for dx, dy in ((-1, -1), (1, 1)):
        shade = -(gx * dx + gy * dy) / np.sqrt(2)
        shade /= max(shade.max(), 1e-6)
        glint_ = np.clip((shade - 0.22) / 0.5, 0, 1) ** 0.9
        out.append(glint_ * region * (alpha > 0.5))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="glint,ink,eng,grain,fm")
    ap.add_argument("--cache", default="/tmp/claude-0/-home-user-poke-pack/ac507e08-34cd-5d8d-826a-5c5dc46c57e2/scratchpad/bw-secret/live")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=80)
    ap.add_argument("--force", action="store_true", help="rewrite -v3 files that exist (only before this pass ships)")
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(",") if s.strip()}
    cache = Path(a.cache)
    if "glint" in only:
        p = OUT / "glint-v3.webp"
        if a.force or not p.exists():
            v2.save_alpha(glint(), p, a.quality, a.alpha_quality)
    for face in v1.faces():
        name = f"{face['set']}-{face['n']}"
        if "ink" in only and face["id"] in v2.GOLD_FULL:
            p = OUT / "ink" / f"{name}-v3.webp"
            if a.force or not p.exists():
                v2.save_alpha(ink_mask(face), p, a.quality, a.alpha_quality)
        if "fm" in only and is_yellow(face):
            p = OUT / "fm" / f"{name}-v3.webp"
            if a.force or not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                v2.save_alpha(foil_knockout(face), p, a.quality, a.alpha_quality)
        if "eng" in only and face["id"] in v2.GOLD_FULL:
            etch = v1.fetch(face, "etch", cache)
            v2.save_alpha(v2.engraving(face, etch, 0.6), OUT / "eng" / f"{name}-v2.webp", a.quality, 70)
        if "grain" in only and face["id"] in v1.GRAIN:
            foil, etch = v1.fetch(face, "foil", cache), v1.fetch(face, "etch", cache)
            ga, gb = grain3(face, foil, etch)
            v2.save_alpha(ga, OUT / "grain" / f"{name}-a-v2.webp", a.quality, a.alpha_quality)
            v2.save_alpha(gb, OUT / "grain" / f"{name}-b-v2.webp", a.quality, a.alpha_quality)
    return 0


if __name__ == "__main__":
    sys.exit(main())
