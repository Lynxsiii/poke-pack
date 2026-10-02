#!/usr/bin/env python3
"""Draw the Jungle (base2) holo foil maps: where each card's foil shows, its own stars, and the starlight glitter.

Family wotc-jungle (older-era holo remaster, 2026-10-01; reference/fam-wotc-jungle.md). A Jungle Rare Holo is ink printed
over a Starlight holofoil (the same foil as Base Set): the art window's BACKGROUND is translucent ink over the foil, so it
flashes silver and rainbow and glitters under a lamp, while the Pokémon is printed over an opaque white underlay and stays
matte; so do the frame, the text and the evolution badge. TCG Live published no maps for 1999, so every map is drawn from
the card's own scan (assets/cards/base2/<n>.webp, 600 x 838):

  1. The art window is measured on each scan (median of the strongest gold-line-to-art step per row and column; the scans sit
     up to 4 px off one another, Jolteon most).
  2. Stage 1 and Stage 2 cards print the evolution badge (grey box, gold starburst) over the window's top-left corner. Its
     shape is voted from every Stage scan of base1-base3 (the pixels where 80 % of them agree with the median), then slid onto
     each card by template matching (+-6 px) and grown 2 px.
  3. The Pokémon is cut out with GrabCut (OpenCV, seeded) on a 3 px median of the scan inside the window less the badge:
     a centred ellipse is probable Pokémon, its core sure Pokémon, a 4 px rim of the window sure background, plus the hand
     hints in make_jungle_maps_hints.json (`fg` / `bg` dabs, `fgpoly` / `bgpoly` polygons, `fgline` thin parts). The cut is
     cleaned (specks dropped, holes under 1 % of the window filled), grown 1 px so the black outline stays matte, feathered.
  4. The stars: the scan already shows this copy's foil (its four-point stars and the soft smears the scanner lamp drew), so
     the brightest channel's top-hat over a 9 px median, on the background only, is the card's own sparkle; a soft bloom
     (Gaussian, 2.5 px) is added so a lit star flares past its printed size.
  5. The glitter (shared by all 16 cards): the dense multi-coloured micro-streaks every tilt clip and photo of a Jungle or
     Base Set holo shows under a lamp (short upright dashes, a few tiny four-point stars, gold, green, cyan, blue, violet,
     pink and white, about 10 card px apart). Seeded, drawn at 4x and averaged down, split into two halves (a, b) so the
     CSS can light one half and then the other as the card turns. Not a tile: one image over the whole window.

Outputs (assets are cached for a year: once shipped, a change is a new -vN name):
  assets/foil/fam/wotc-jungle/<n>-bg-v1.webp      600 x 838, white, ALPHA = foil (the window background), lossless
  assets/foil/fam/wotc-jungle/<n>-stars-v1.webp   600 x 838, white, ALPHA = the scan's stars and sparkle plus bloom
  assets/foil/fam/wotc-jungle/glitter-a-v1.webp   956 x 672 (the window, 478 x 336 card px, at 2x), coloured streaks
  assets/foil/fam/wotc-jungle/glitter-b-v1.webp   the other half

  python3 .claude/skills/card-textures/scripts/fam/wotc-jungle/make_jungle_maps.py --preview DIR [--only 4,12] [--write]
  (--glitter-only draws just the two glitter halves)

Without --write it only writes the previews (DIR/<n>-cut.png: background tinted, the cut's edge in green; DIR/sheet.png).
Seeded (cv2.setRNGSeed, numpy default_rng), so a re-run draws the same maps.
"""
from __future__ import annotations

import argparse
import colorsys
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-jungle"
SET = "base2"
W, H = 600, 838
NOMINAL = (62, 95, 538, 429)  # x0, y0, x1, y1 (exclusive) of the window: the shared WotC window (assets/foil/wotc-win)
HINTS: dict = json.load(open(Path(__file__).with_name("make_jungle_maps_hints.json")))
VERSION = 1
# the glitter's frame: the window with a 1 px margin, the same box as the era's spark maps (--wotc-map-size / -pos)
GLIT_BOX = (61, 94, 539, 430)  # 478 x 336 card px
GLIT_SCALE = 2


def load(set_id: str, n: int | str) -> np.ndarray:
    return np.asarray(Image.open(ROOT / "assets" / "cards" / set_id / f"{n}.webp").convert("RGB"))


def luminance(rgb: np.ndarray) -> np.ndarray:
    f = rgb.astype(np.float32)
    return f[..., 0] * 0.299 + f[..., 1] * 0.587 + f[..., 2] * 0.114


def window(rgb: np.ndarray) -> tuple[int, int, int, int]:
    """The art window: the strongest bright-to-dark step of the gold window line, median over each edge."""
    L = cv2.GaussianBlur(luminance(rgb), (0, 0), 0.7)
    x0n, y0n, x1n, y1n = NOMINAL

    def step(profile: np.ndarray, start: int, sign: int) -> int:
        d = (profile[:-1] - profile[1:]) * sign
        return start + int(np.argmax(d)) + 1

    rows = range(y0n + 40, y1n - 40, 2)
    cols = range(x0n + 40, x1n - 40, 2)
    got = (
        int(np.median([step(L[y, x0n - 8: x0n + 8], x0n - 8, 1) for y in rows])),
        int(np.median([step(L[y0n - 8: y0n + 8, x], y0n - 8, 1) for x in cols])),
        int(np.median([step(L[y, x1n - 8: x1n + 8], x1n - 8, -1) for y in rows])),
        int(np.median([step(L[y1n - 8: y1n + 8, x], y1n - 8, -1) for x in cols])),
    )
    # a measurement more than 6 px off the nominal window is a failed one: keep the nominal edge
    return tuple(g if abs(g - n) <= 6 else n for g, n in zip(got, NOMINAL))  # type: ignore[return-value]


def stage_of(card: dict) -> bool:
    return any("Stage" in s for s in card.get("subtypes") or [])


def badge_template() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Vote the evolution badge from every Stage scan of base1-base3: (badge mask, median image, agreeing pixels)."""
    stack = []
    for s in ("base1", "base2", "base3"):
        for c in json.load(open(ROOT / "data" / f"{s}.json")):
            if c.get("supertype") != "Pokémon" or not stage_of(c):
                continue
            path = ROOT / "assets" / "cards" / s / f"{c['id'].split('-', 1)[1]}.webp"
            if not path.exists():
                continue
            im = Image.open(path).convert("RGB")
            if im.size != (W, H):
                im = im.resize((W, H), Image.LANCZOS)
            stack.append(np.asarray(im, np.float32)[:200, :200])
    S = np.stack(stack)
    med = np.median(S, 0)
    diff = (np.abs(S - med).max(-1) > 28).mean(0)  # share of the cards that differ from the median, per pixel
    d = ndi.uniform_filter(diff, 3)
    box = np.zeros_like(d, bool)
    box[35:170, 15:160] = True
    lab, _ = ndi.label((d < 0.80) & box)
    reg = lab[60:140, 30:140]
    vals, counts = np.unique(reg[reg > 0], return_counts=True)
    badge = ndi.binary_fill_holes(lab == vals[np.argmax(counts)])
    agree = (diff < 0.30) & badge
    full = np.zeros((H, W), bool)
    full[:200, :200] = badge
    return full, med, agree


def place_badge(rgb: np.ndarray, badge: np.ndarray, med: np.ndarray, agree: np.ndarray) -> tuple[np.ndarray, tuple[int, int]]:
    """Slide the voted badge onto this scan: the shift (+-6 px) that best matches the median on the agreeing pixels."""
    f = rgb.astype(np.float32)
    ys, xs = np.where(agree)
    best, shift = None, (0, 0)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            yy, xx = ys + dy, xs + dx
            ok = (yy >= 0) & (xx >= 0) & (yy < H) & (xx < W)
            err = np.abs(f[yy[ok], xx[ok]] - med[ys[ok], xs[ok]]).mean()
            if best is None or err < best:
                best, shift = err, (dx, dy)
    dx, dy = shift
    moved = np.zeros_like(badge)
    src = badge[max(0, -dy): H - max(0, dy), max(0, -dx): W - max(0, dx)]
    moved[max(0, dy): max(0, dy) + src.shape[0], max(0, dx): max(0, dx) + src.shape[1]] = src
    return moved, shift


def grabcut(rgb: np.ndarray, region: np.ndarray, hints: dict) -> np.ndarray:
    ys, xs = np.where(region)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = cv2.medianBlur(np.ascontiguousarray(rgb[y0:y1, x0:x1]), 3)
    reg = region[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w * hints.get("cx", 0.5), h * hints.get("cy", 0.55)
    ell = (((xx - cx) / (w * hints.get("rx", 0.36))) ** 2 + ((yy - cy) / (h * hints.get("ry", 0.42))) ** 2) < 1
    core = (((xx - cx) / (w * 0.10)) ** 2 + ((yy - cy) / (h * 0.10)) ** 2) < 1
    m[ell] = cv2.GC_PR_FGD
    m[core] = cv2.GC_FGD
    m[~reg] = cv2.GC_BGD
    m[reg & ~ndi.binary_erosion(reg, iterations=4)] = cv2.GC_BGD
    for key, val in (("bg", cv2.GC_BGD), ("fg", cv2.GC_FGD)):
        for px, py, r in hints.get(key, []):
            cv2.circle(m, (int(px - x0), int(py - y0)), int(r), int(val), -1)
    for key, val in (("bgpoly", cv2.GC_BGD), ("fgpoly", cv2.GC_FGD)):
        for poly in hints.get(key, []):
            cv2.fillPoly(m, [np.array([[px - x0, py - y0] for px, py in poly], np.int32)], int(val))
    for pts, width in hints.get("fgline", []):
        cv2.polylines(m, [np.array([[px - x0, py - y0] for px, py in pts], np.int32)], False, int(cv2.GC_FGD), thickness=int(width))
    bgm, fgm = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.setRNGSeed(7)
    cv2.grabCut(crop, m, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
    out = np.zeros((H, W), bool)
    out[y0:y1, x0:x1] = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & reg
    return out


def clean(sil: np.ndarray, region: np.ndarray) -> np.ndarray:
    sil = ndi.binary_opening(sil, iterations=1)
    lab, n = ndi.label(sil)
    if n:
        sizes = ndi.sum(sil, lab, range(1, n + 1))
        sil = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(120, 0.03 * sizes.max())])
    sil = ndi.binary_closing(sil, structure=np.ones((3, 3)), iterations=2)
    lab, n = ndi.label(ndi.binary_fill_holes(sil) & ~sil)
    for i in range(1, n + 1):
        if (lab == i).sum() < 0.010 * region.sum():
            sil |= lab == i
    return sil


def soft(mask: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)


def stars_alpha(rgb: np.ndarray, open_bg: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """The scan's own sparkle on the background: top-hat of the brightest channel over a 9 px median, plus a bloom.

    Only 3 px or more inside the background (`open_bg`), so the window line and the Pokémon's pale rim never count, and
    only where the sparkle is light rather than ink-coloured (min / max channel): a star or a scanner smear is white,
    pale or sky-tinted; Flareon's orange flame wisps are ink, not foil light."""
    f = rgb.astype(np.float32)
    mx = rgb.max(-1).astype(np.uint8)
    th = np.clip(mx.astype(np.float32) - cv2.medianBlur(mx, 9).astype(np.float32), 0, None)
    blur = cv2.GaussianBlur(f, (0, 0), 0.8)
    pale = np.clip((blur.min(-1) / np.maximum(blur.max(-1), 1.0) - 0.15) / 0.30, 0, 1)
    core = np.clip((th - 10.0) / 60.0, 0, 1) ** 0.85 * np.clip(mx / 255.0 * 1.4, 0, 1) * pale
    core *= ndi.binary_erosion(open_bg, iterations=3)
    bloom = cv2.GaussianBlur(core, (0, 0), 2.5) * 2.2
    return np.clip(np.maximum(core, np.minimum(bloom, 0.55)), 0, 1) * bg


PALETTE = [  # (hue degrees, weight): what the tilt clips show the streaks light in
    (48, 3.0), (62, 1.5), (95, 2.0), (165, 1.5), (190, 2.0), (215, 2.0), (250, 1.5), (285, 1.5), (320, 1.5), (345, 0.8),
]


def glitter(seed: int = 1999) -> tuple[np.ndarray, np.ndarray]:
    """Two halves of the starlight glitter, RGBA float, at GLIT_SCALE x the window (drawn at 2x that, averaged down)."""
    rng = np.random.default_rng(seed)
    gw, gh = (GLIT_BOX[2] - GLIT_BOX[0]) * GLIT_SCALE, (GLIT_BOX[3] - GLIT_BOX[1]) * GLIT_SCALE
    S = 2  # supersampling
    hues = np.array([h for h, _ in PALETTE], float)
    weights = np.array([w for _, w in PALETTE], float)
    weights /= weights.sum()
    halves = []
    for half in range(2):
        rgb = np.zeros((gh * S, gw * S, 3), np.float32)
        alpha = np.zeros((gh * S, gw * S), np.float32)
        # blue-noise-ish placement: jittered grid, one sparkle per cell, cells 13 card px (two halves -> ~9 px apart)
        cell = 13 * GLIT_SCALE * S
        for gy in range(0, gh * S, cell):
            for gx in range(0, gw * S, cell):
                x = gx + rng.uniform(0, cell)
                y = gy + rng.uniform(0, cell)
                if rng.random() < 0.08:
                    continue
                hue = rng.choice(hues, p=weights) + rng.normal(0, 8)
                white = rng.random() < 0.16
                sat = 0.0 if white else rng.uniform(0.4, 0.8)
                val = rng.uniform(0.85, 1.0)
                col = np.array(colorsys.hsv_to_rgb((hue % 360) / 360, sat, val), np.float32)
                peak = 0.55 + 0.45 * rng.random() ** 1.4  # bright enough to read after the 2x -> card resampling
                star = rng.random() < 0.06
                length = rng.lognormal(np.log(7.5), 0.5) * GLIT_SCALE * S  # card px -> drawing px
                width = rng.uniform(1.0, 1.7) * GLIT_SCALE * S  # full width at half height, 1-1.7 card px
                tilt = rng.normal(0, 6)  # degrees off upright
                spots = [(length, width, tilt)]
                if star:
                    arm = rng.uniform(3.0, 5.5) * GLIT_SCALE * S
                    spots = [(arm * 2, width * 0.8, 0), (arm * 2, width * 0.8, 90)]
                r = int(max(length, width) + 4)
                x0, x1 = int(max(0, x - r)), int(min(gw * S, x + r + 1))
                y0, y1 = int(max(0, y - r)), int(min(gh * S, y + r + 1))
                if x1 <= x0 or y1 <= y0:
                    continue
                yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
                a = np.zeros_like(xx)
                for ln, wd, tl in spots:
                    t = np.deg2rad(tl)
                    u = (xx - x) * np.sin(t) + (yy - y) * np.cos(t)  # along the streak
                    v = (xx - x) * np.cos(t) - (yy - y) * np.sin(t)  # across
                    along = np.clip(1 - (u / (ln / 2)) ** 2, 0, 1) ** 1.5
                    across = np.exp(-0.5 * (v / (wd / 2)) ** 2)
                    a = np.maximum(a, along * across)
                if star:
                    a = np.maximum(a, np.exp(-0.5 * ((xx - x) ** 2 + (yy - y) ** 2) / (width * 0.9) ** 2))
                a *= peak
                sub = alpha[y0:y1, x0:x1]
                take = a > sub
                rgb[y0:y1, x0:x1][take] = col
                alpha[y0:y1, x0:x1] = np.maximum(sub, a)
        # average down (premultiplied) to GLIT_SCALE
        pre = rgb * alpha[..., None]
        pre = pre.reshape(gh, S, gw, S, 3).mean((1, 3))
        al = alpha.reshape(gh, S, gw, S).mean((1, 3))
        col = np.where(al[..., None] > 1e-4, pre / np.maximum(al[..., None], 1e-4), 0)
        halves.append(np.dstack([np.clip(col, 0, 1), np.clip(al, 0, 1)]))
    return halves[0], halves[1]


def save_alpha(path: Path, alpha: np.ndarray) -> None:
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    rgba = np.dstack([np.full_like(a, 255)] * 3 + [a])
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6, exact=False)


def save_rgba(path: Path, rgba: np.ndarray) -> None:
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    im.save(path, "WEBP", lossless=True, quality=100, method=6, exact=False)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write the cut overlays and a contact sheet here")
    ap.add_argument("--only", help="comma-separated card numbers (default 1-16)")
    ap.add_argument("--write", action="store_true", help="write the maps into assets/foil/fam/wotc-jungle/")
    ap.add_argument("--version", type=int, default=VERSION)
    ap.add_argument("--glitter-only", action="store_true", help="draw only the shared glitter")
    args = ap.parse_args()
    nums = [] if args.glitter_only else [int(x) for x in args.only.split(",")] if args.only else list(range(1, 17))
    cards = {c["id"]: c for c in json.load(open(ROOT / "data" / f"{SET}.json"))}
    badge, med, agree = badge_template() if nums else (None, None, None)
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
    if args.write:
        OUT.mkdir(parents=True, exist_ok=True)
    tiles = []
    for n in nums:
        card = cards[f"{SET}-{n}"]
        rgb = load(SET, n)
        x0, y0, x1, y1 = window(rgb)
        win = np.zeros((H, W), bool)
        win[y0:y1, x0:x1] = True
        region = win.copy()
        shift = (0, 0)
        if stage_of(card):
            placed, shift = place_badge(rgb, badge, med, agree)
            region &= ~ndi.binary_dilation(placed, iterations=2)
        sil = clean(grabcut(rgb, region, HINTS.get(str(n), {})), region)
        matte = ndi.binary_dilation(sil, iterations=1)  # the black outline and the underlay's halo stay matte
        bg = np.clip(soft(region & ~matte, 0.8) * soft(win, 0.5) * 1.0, 0, 1)
        bg[~win] = 0
        stars = stars_alpha(rgb, region & ~matte, bg)
        print(f"{n:2d} {card['name']:<11} window {x0},{y0}-{x1},{y1} badge shift {shift} "
              f"pokemon {sil[win].mean():.3f} foil {bg[win].mean():.3f} stars {stars[win].mean():.4f}")
        if args.write:
            save_alpha(OUT / f"{n}-bg-v{args.version}.webp", bg)
            save_alpha(OUT / f"{n}-stars-v{args.version}.webp", stars)
        if args.preview:
            ov = rgb.astype(np.float32).copy()
            tint = np.array([255, 0, 255], np.float32)
            ov = ov * (1 - bg[..., None] * 0.45) + tint * bg[..., None] * 0.45 * 0.6
            edge = matte ^ ndi.binary_erosion(matte)
            ov[edge & win] = [0, 255, 0]
            st = (stars[..., None] * 255).repeat(3, -1)
            pair = np.concatenate([ov[60:440, 40:560], st[60:440, 40:560]], 1).astype(np.uint8)
            tile = Image.fromarray(pair)
            ImageDraw.Draw(tile).text((6, 6), f"{n} {card['name']}", fill=(255, 255, 0))
            tile.save(args.preview / f"{n}-cut.png")
            tiles.append(tile)
    if args.write or args.preview:
        a, b = glitter()
        if args.write:
            save_rgba(OUT / f"glitter-a-v{args.version}.webp", a)
            save_rgba(OUT / f"glitter-b-v{args.version}.webp", b)
        if args.preview:
            both = np.zeros_like(a)
            for g in (a, b):
                both[..., :3] = both[..., :3] * (1 - g[..., 3:]) + g[..., :3] * g[..., 3:]
                both[..., 3] = np.maximum(both[..., 3], g[..., 3])
            Image.fromarray((np.clip(both[..., :3], 0, 1) * 255).astype(np.uint8)).save(args.preview / "glitter.png")
    if args.preview and tiles:
        tw, th = tiles[0].size
        cols = 2
        sheet = Image.new("RGB", (tw * cols, th * ((len(tiles) + cols - 1) // cols)), "white")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(args.preview / "sheet.png")


if __name__ == "__main__":
    main()
