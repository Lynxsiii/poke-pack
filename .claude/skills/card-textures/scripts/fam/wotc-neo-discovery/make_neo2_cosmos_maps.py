#!/usr/bin/env python3
"""Neo Discovery (neo2) Rare Holo cosmos maps, drawn from each card's own scan (holo family wotc-neo-discovery).

What the real cards do (refs in /mnt/project-files/holo-remaster/wotc-neo-discovery/refs/, SOURCES.md): the cosmos foil is
the art window's BACKGROUND. Off the specular angle its printed flecks (dots, discs, rings, snowflakes) each light in one
saturated colour, the colour sliding across the window with the tilt; at the specular angle the whole background flashes
a brushed metal tinted by its ink. The Pokemon is opaque ink over the foil and stays matte, as do a few other drawn
elements (Espeon's petals and light beam, Hitmontop's disc and spikes, Politoed's trunk, Umbreon's moon and rock); dense
black ink (Houndoom's shadow, Tyranitar's blobs, Magnemite's space, Yanma's ground) stays black at every angle.

For every Rare Holo (neo2 1-17) this writes into assets/foil/fam/wotc-neo-discovery/ two crops of the art window
(card box 61,94-539,430 of the 600x838 scan, 478x336, placed by wotc.css's --wotc-map-size / --wotc-map-pos):

  <n>-bg-v1.webp     alpha: where the foil shows. The layout's window (assets/foil/wotc-win/pokemon-v1.webp) less the
                     matte parts (GrabCut seeded by the hand hints in neo2_matte_hints.json, grown 1 px, feathered),
                     less the Stage evolution badge's yellow swoosh (measured per card on its scan), times a gate that
                     closes on dense black ink (the scan's brightest channel, 14 -> 40 of 255).
  <n>-fleck-v1.webp  opaque RGB: the flecks the scan itself shows (white top-hat of the brightest channel against a
                     9 px median, components up to 24 px, hairlines dropped), outside the matte, each tinted one hue
                     drawn from a seeded generator (saturation 0.55-1) and whitened at its brightest pixels, on black.
                     The sheet multiplies it by a rainbow that slides with the tilt, so a fleck lights when the
                     rainbow's hue there is near its own: neighbours share the region's colour, no two light alike.

Run:  python3 make_neo2_cosmos_maps.py [--cards 1,13] [--check <png>] [--out <dir>]
      --check writes an overlay sheet (matte magenta, flecks green, foil gate dimming) to judge the cut.
Seeded and deterministic (numpy default_rng(2001 * 100 + n), cv2.setRNGSeed(7)).
"""
import argparse
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
BOX = (61, 94, 539, 430)  # the window crop, same as scripts/make_wotc_spark_maps.py BOXES["pokemon"]
STAGE = {1, 2, 4, 6, 8, 9, 10, 12, 13, 15}  # Stage 1 and Stage 2: the evolution badge's swoosh reaches into the window
VERSION = "v1"


def load_crop(n):
    a = np.asarray(Image.open(ROOT / f"assets/cards/neo2/{n}.webp").convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = BOX
    return a[y0:y1, x0:x1]


def load_window():
    a = np.asarray(Image.open(ROOT / "assets/foil/wotc-win/pokemon-v1.webp"))[..., 3].astype(np.float32) / 255
    x0, y0, x1, y1 = BOX
    return a[y0:y1, x0:x1]


def draw_shapes(shapes, shape_hw, grow=0):
    """Rasterise hint shapes (poly, circle, line) into a bool mask, each grown by `grow` px."""
    h, w = shape_hw
    m = np.zeros((h, w), np.uint8)
    for s in shapes or []:
        if "poly" in s:
            cv2.fillPoly(m, [np.array(s["poly"], np.int32)], 1)
        elif "circle" in s:
            x, y, r = s["circle"]
            cv2.circle(m, (int(x), int(y)), int(r), 1, -1)
        elif "line" in s:
            pts = np.array(s["line"], np.int32)
            r = int(s.get("r", 3))
            cv2.polylines(m, [pts], False, 1, thickness=2 * r + 1)
            for p in pts:
                cv2.circle(m, (int(p[0]), int(p[1])), r, 1, -1)
    m = m.astype(bool)
    if grow > 0:
        m = ndi.binary_dilation(m, iterations=grow)
    return m


def flecks(rgb, keep):
    """The scan's printed flecks: (alpha 0-1 per pixel, component label image, component count)."""
    mx = rgb.max(2)
    med = ndi.median_filter(mx, size=9)
    th = np.clip(mx - med, 0, None)
    head = np.clip(255 - med, 20, None)
    rel = th / head
    cand = (th > 12) & ((rel > 0.22) | (th > 40)) & keep
    lab, k = ndi.label(cand, structure=np.ones((3, 3)))
    alpha = np.zeros_like(th)
    out_lab = np.zeros(lab.shape, np.int32)
    kept = 0
    if k:
        objs = ndi.find_objects(lab)
        area = ndi.sum(cand, lab, range(1, k + 1))
        peak = ndi.maximum(th, lab, range(1, k + 1))
        for i, (sl, ar, pk) in enumerate(zip(objs, area, peak), 1):
            hh = sl[0].stop - sl[0].start
            ww = sl[1].stop - sl[1].start
            if ar > 260 or max(hh, ww) > 24 or pk < 15:
                continue
            if max(hh, ww) >= 8 and ar / (hh * ww) < 0.18:  # a thin line piece (grid lines, outlines), not a fleck
                continue
            m = lab[sl] == i
            a = np.clip(th[sl] / (0.7 * pk), 0, 1) * m * np.clip(pk / 45, 0.45, 1)
            alpha[sl] = np.maximum(alpha[sl], a)
            kept += 1
            out_lab[sl][m] = kept
    return alpha, out_lab, kept


def segment(rgb, win, hint, fleck_seed=None):
    """Matte parts of the window (bool): GrabCut inside the hinted regions plus a margin, forced seeds kept.

    The scan's own flecks are background seeds (the printed cosmos is only ever in the background), except under a
    forced matte seed; a glint they knock out of a Pokemon comes back with the small-hole fill."""
    h, w = win.shape
    band = int(hint.get("band", 10))
    pr_core = draw_shapes(hint.get("pr"), (h, w))
    pr_zone = draw_shapes(hint.get("pr"), (h, w), grow=band)
    fg = draw_shapes(hint.get("fg"), (h, w))
    bg = draw_shapes(hint.get("bg"), (h, w))
    erode = int(hint.get("erode", 6))  # sure-matte core of a tight hint shape; 0 for loose shapes with background pockets
    eroded = ndi.binary_erosion(pr_core, iterations=erode) if erode else np.zeros_like(pr_core)
    gc = np.full((h, w), cv2.GC_BGD, np.uint8)
    gc[pr_zone] = cv2.GC_PR_BGD
    gc[pr_core] = cv2.GC_PR_FGD
    gc[eroded | fg] = cv2.GC_FGD
    if fleck_seed is not None:
        gc[ndi.binary_dilation(fleck_seed) & ~fg & ~eroded] = cv2.GC_BGD
    gc[bg] = cv2.GC_BGD
    # a 5 px median first: the flecks would otherwise teach both colour models white, cyan and gold
    img = cv2.medianBlur(np.ascontiguousarray(np.clip(rgb[..., ::-1], 0, 255).astype(np.uint8)), 5)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.setRNGSeed(7)
    cv2.grabCut(img, gc, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    m = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
    m |= fg
    m &= ~bg
    # keep only the pieces that touch a seed or are large; fill small holes (eyes, spots, flecks GrabCut left out)
    lab, k = ndi.label(m)
    if k:
        seeds = eroded | fg
        sizes = ndi.sum(m, lab, range(1, k + 1))
        touch = ndi.maximum(seeds, lab, range(1, k + 1))
        keep = [i + 1 for i in range(k) if touch[i] or sizes[i] >= 300]
        m = np.isin(lab, keep)
    holes = ndi.binary_fill_holes(m) & ~m
    hl, hk = ndi.label(holes)
    if hk:
        hs = ndi.sum(holes, hl, range(1, hk + 1))
        m |= np.isin(hl, 1 + np.nonzero(hs < 500)[0])
    m &= ~bg
    return m


def badge_cut(rgb):
    """The Stage badge's yellow swoosh in the window's top left corner, as a soft 0-1 mask (1 = badge).

    Its edge is a straight diagonal through (101,95)-(64,131) of the card (40 px of it inside the window); the print
    registration moves it 1-5 px from card to card, so the edge is taken where yellow falls under 30 % along the normal."""
    h, w = rgb.shape[:2]
    x0, y0 = BOX[0], BOX[1]
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = xx + x0, yy + y0
    nrm = np.hypot(36, 37)
    s = (36 * (cx - 101) + 37 * (cy - 95)) / nrm
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    yellow = (r > 150) & (g > 120) & (b < 110) & (r - b > 80) & (g - b > 60)
    inside = (cx >= 67) & (cy >= 98) & (cx < 115) & (cy < 140)
    edge = 6.0
    for t in np.arange(-2, 8, 1.0):
        sel = inside & (s >= t) & (s < t + 1)
        if sel.sum() and yellow[sel].mean() < 0.3:
            edge = t
            break
    edge += 1.5  # the swoosh's own dark rim
    return np.clip(edge + 1.0 - s, 0, 1) * ((cx < 125) & (cy < 150))


def fleck_colours(alpha, lab, k, n):
    rng = np.random.default_rng(2001 * 100 + n)
    hue = rng.uniform(0, 1, k + 1)
    sat = rng.uniform(0.2, 0.65, k + 1)
    hsv = np.zeros(alpha.shape + (3,), np.float32)
    hsv[..., 0] = hue[lab] * 179
    hsv[..., 1] = sat[lab] * 255
    hsv[..., 2] = 255
    rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32) / 255
    v = np.clip(alpha * 1.15, 0, 1)
    wht = 0.45 * v ** 2
    col = v[..., None] * (rgb * (1 - wht[..., None]) + wht[..., None])
    col[lab == 0] = 0
    return col


def build(n, hints, win):
    rgb = load_crop(n)
    hint = hints.get(str(n), {})
    seed_alpha, _, _ = flecks(rgb, win > 0.5)
    matte = segment(rgb, win, hint, seed_alpha > 0.35)
    # grow the matte 1 px and feather 1 px so no foil rims the Pokemon's outline
    dist = ndi.distance_transform_edt(~matte)
    open_ = np.clip(dist - 1.0, 0, 1)
    gate_src = ndi.gaussian_filter(rgb.max(2), 0.7)
    gate = np.clip((gate_src - 14) / (40 - 14), 0, 1)
    gate = gate * gate * (3 - 2 * gate)
    badge = badge_cut(rgb) if n in STAGE else np.zeros_like(win)
    bg = win * open_ * (1 - badge) * gate
    keep = (open_ > 0.5) & (win > 0.5) & (badge < 0.5)
    alpha, lab, k = flecks(rgb, keep)
    col = fleck_colours(alpha, lab, k, n)
    return rgb, matte, bg, col, alpha, k


def save(n, bg, col, out):
    out.mkdir(parents=True, exist_ok=True)
    a = np.clip(bg * 255 + 0.5, 0, 255).astype(np.uint8)
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = a
    Image.fromarray(rgba, "RGBA").save(out / f"{n}-bg-{VERSION}.webp", lossless=True, quality=100, method=6)
    c = np.clip(col * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(c, "RGB").save(out / f"{n}-fleck-{VERSION}.webp", lossless=True, quality=100, method=6)


def check_tile(n, rgb, matte, bg, alpha):
    vis = rgb.copy()
    vis = vis * (0.35 + 0.65 * bg[..., None])  # dim where the foil gate is shut
    vis[matte] = vis[matte] * 0.55 + np.array([255, 0, 255]) * 0.45
    vis = vis * (1 - alpha[..., None] * 0.9) + np.array([0, 255, 0]) * alpha[..., None] * 0.9
    edge = matte & ~ndi.binary_erosion(matte)
    vis[edge] = [255, 255, 0]
    t = Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8))
    ImageDraw.Draw(t).text((4, 4), str(n), fill=(255, 255, 255))
    return t


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", default=",".join(str(i) for i in range(1, 18)))
    ap.add_argument("--out", default=str(ROOT / "assets/foil/fam/wotc-neo-discovery"))
    ap.add_argument("--check", default="")
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args()
    hints = json.load(open(HERE / "neo2_matte_hints.json"))
    win = load_window()
    tiles = []
    for n in [int(s) for s in a.cards.split(",") if s]:
        rgb, matte, bg, col, alpha, k = build(n, hints, win)
        print(f"neo2-{n}: matte {matte.mean() * 100:.1f}% of the crop, foil {bg.mean() * 100:.1f}%, {k} flecks")
        if not a.no_write:
            save(n, bg, col, Path(a.out))
        if a.check:
            tiles.append(check_tile(n, rgb, matte, bg, alpha))
    if a.check and tiles:
        cols = 2
        W, H = tiles[0].size
        sheet = Image.new("RGB", (cols * (W + 6), ((len(tiles) + cols - 1) // cols) * (H + 6)), (20, 20, 20))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * (W + 6), (i // cols) * (H + 6)))
        sheet.save(a.check)
        print(a.check)


if __name__ == "__main__":
    main()
