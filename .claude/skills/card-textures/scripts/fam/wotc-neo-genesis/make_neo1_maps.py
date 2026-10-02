#!/usr/bin/env python3
"""Neo Genesis (neo1) Rare Holo cosmos maps, drawn from each card's own scan (holo family wotc-neo-genesis).

What the real cards do (refs in /mnt/project-files/holo-remaster/wotc-neo-genesis/refs/, SOURCES.md: Lugia and Typhlosion
macro and tilt frames, Elite Fourum's PSA 9 slabs of all nineteen): the cosmos foil is the art window's BACKGROUND, the
Pokemon is opaque ink over it and stays matte (PSA 9409: "a Pokemon that's just stuck up there with a lot of holofoil
around it"). Under a lamp the sky is a broad metallic sheen (warm silver-gold one way, copper, navy the other) and the
printed flecks (pinpoints, dots, big rimmed discs, snowflakes, swirls) each light in ONE saturated colour that changes with
the tilt; the dark ink of Ampharos' and Steelix's sky keeps the foil dim.

For every Rare Holo (neo1 1-18 the window cards; 19 Metal Energy, its picture box 18,118-583,615, sphere and flare matte) this writes into assets/foil/fam/wotc-neo-genesis/ three crops of the art window
(card box 61,94-539,430 of the 600x838 scan, 478x336, placed by wotc.css's --wotc-map-size / --wotc-map-pos):

  <n>-bg-v1.webp       alpha: where the foil shows. The layout's window (assets/foil/wotc-win/pokemon-v1.webp) less the
                       matte Pokemon (neo1_segment.py: marker watershed seeded by the scan's own cosmos dots and hand hints
                       in neo1_matte_hints.json, 1 px grown and feathered) less the evolution badge corner.
  <n>-fleck-a-v1.webp  RGBA: half of the flecks the scan shows (white top-hat of the brightest channel against a 9 px
  <n>-fleck-b-v1.webp  median, up to 34 px), outside the matte, each tinted one random hue (saturation 0.55-1) and whitened
                       at its brightest pixels; RGBA, alpha = the fleck. The sheet paints each half over the print and
                       hue-rotates it with the tilt (the halves opposite ways), so every fleck lights in its own colour
                       and neighbours differ.

Run:  python3 make_neo1_maps.py [--cards 1,9] [--check <png>] [--out <dir>]
Seeded and deterministic (numpy default_rng(2000 * 100 + n)).
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
os.environ.setdefault("NEO1_SEG_OUT", "/tmp/neo1_seg")
import neo1_segment as seg  # noqa: E402

BOX = seg.BOX["pokemon"]
VERSION = "v1"
STAGE = {1, 2, 3, 4, 5, 7, 8, 10, 11, 14, 15, 16, 17, 18}  # the evolution badge's corner reaches into the window


def load_window(box, layout="pokemon"):
    a = np.asarray(Image.open(ROOT / f"assets/foil/wotc-win/{layout}-v1.webp"))[..., 3].astype(np.float32) / 255
    x0, y0, x1, y1 = box
    return a[y0:y1, x0:x1]


def flecks(rgb, keep):
    """The scan's printed flecks: (alpha 0-1 per pixel, component label image, count)."""
    mx = rgb.max(2)
    med = ndi.median_filter(mx, size=9)
    th = np.clip(mx - med, 0, None)
    head = np.clip(255 - med, 20, None)
    cand = (th > 12) & (((th / head) > 0.2) | (th > 40)) & keep
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
            if ar > 900 or max(hh, ww) > 34 or pk < 15:
                continue
            if max(hh, ww) >= 8 and ar / (hh * ww) < 0.18:  # a thin outline piece, not a fleck
                continue
            m = lab[sl] == i
            a = np.clip(th[sl] / (0.7 * pk), 0, 1) * m * np.clip(pk / 45, 0.5, 1)
            alpha[sl] = np.maximum(alpha[sl], a)
            kept += 1
            out_lab[sl][m] = kept
    return alpha, out_lab, kept


def fleck_colours(alpha, lab, k, n):
    rng = np.random.default_rng(2000 * 100 + n)
    hue = rng.uniform(0, 1, k + 1)
    sat = rng.uniform(0.55, 1.0, k + 1)
    hsv = np.zeros(alpha.shape + (3,), np.float32)
    hsv[..., 0] = hue[lab] * 179
    hsv[..., 1] = sat[lab] * 255
    hsv[..., 2] = 255
    rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32) / 255
    v = np.clip(alpha * 1.15, 0, 1)
    wht = 0.4 * v ** 2
    col = v[..., None] * (rgb * (1 - wht[..., None]) + wht[..., None])
    col[lab == 0] = 0
    return col, (np.arange(k + 1) % 2)[lab]


def badge_cut(shape):
    """The Stage badge's disc reaches into the window's top left corner: a soft 0-1 mask (1 = badge)."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = xx + BOX[0], yy + BOX[1]
    d = np.hypot(cx - 62, cy - 96)  # the disc is centred up and left of the window
    return np.clip((52 - d) / 2.0, 0, 1)


ENERGY_BOX = seg.BOX["energy"]
# Metal Energy 19: the picture box's matte is the sphere and the white flare body (window coordinates, 565 x 497)
ENERGY_CIRCLE = (285, 345, 121)
ENERGY_FLARE = [(285, 38), (300, 100), (325, 190), (380, 235), (432, 330), (470, 440), (480, 497), (95, 497), (110, 430),
                (150, 340), (205, 250), (250, 190), (275, 100)]


def energy_matte(shape):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(ENERGY_FLARE, np.int32)], 1)
    cv2.circle(m, ENERGY_CIRCLE[:2], ENERGY_CIRCLE[2], 1, -1)
    return m.astype(bool)


def build(n, hints, win):
    rgb = seg.load(n) * 255
    if n == 19:
        dk = np.zeros(win.shape, bool)
        matte = energy_matte(win.shape)
    else:
        c, d, dk, fg, fgm, bgm = seg.segment(n, hints.get(str(n), {}))
        matte = fg
    dist = ndi.distance_transform_edt(~matte)
    open_ = np.clip(dist - 1.0, 0, 1)
    badge = badge_cut(win.shape) if n in STAGE else np.zeros_like(win)
    bg = win * open_ * (1 - badge)
    keep = (open_ > 0.5) & (win > 0.5) & (badge < 0.5)
    alpha, lab, k = flecks(rgb, keep)
    # the big rimmed discs the 9 px median swallows: the segmenter's disc finder (bright against a 41 px median, round)
    dl, dn = ndi.label(dk & keep)
    soft = ndi.gaussian_filter((dl > 0).astype(np.float32), 0.8)
    new = (dl > 0) & (lab == 0)
    lab[new] = dl[new] + k
    alpha = np.maximum(alpha, np.where(dl > 0, np.clip(soft * 1.2, 0, 1) * 0.9, 0))
    k += dn
    col, half = fleck_colours(alpha, lab, k, n)
    return rgb, matte, bg, col, half, alpha, k


def save(n, bg, col, half, alpha, out):
    out.mkdir(parents=True, exist_ok=True)
    a = np.clip(bg * 255 + 0.5, 0, 255).astype(np.uint8)
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = a
    Image.fromarray(rgba, "RGBA").save(out / f"{n}-bg-{VERSION}.webp", lossless=True, quality=100, method=6)
    # colour per fleck (un-premultiplied) and its alpha; the sheet hue-rotates each half with the tilt
    al = np.clip(alpha * 0.95, 0, 1)
    c = np.clip(col / np.clip(alpha[..., None] * 1.15, 1e-3, 1) * 255 + 0.5, 0, 255).astype(np.uint8)
    for name, sel in (("a", half == 0), ("b", half == 1)):
        rgba = np.zeros(al.shape + (4,), np.uint8)
        rgba[..., :3] = c
        rgba[..., 3] = np.where(sel, np.clip(al * 255 + 0.5, 0, 255), 0).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(out / f"{n}-fleck-{name}-{VERSION}.webp", quality=88, alpha_quality=100, method=6)


def check_tile(n, rgb, matte, bg, alpha):
    vis = rgb.copy() * (0.35 + 0.65 * bg[..., None])
    vis[matte] = vis[matte] * 0.55 + np.array([255, 0, 255]) * 0.45
    vis = vis * (1 - alpha[..., None] * 0.9) + np.array([0, 255, 0]) * alpha[..., None] * 0.9
    t = Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8))
    ImageDraw.Draw(t).text((4, 4), str(n), fill=(255, 255, 255))
    return t


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", default=",".join(str(i) for i in range(1, 20)))
    ap.add_argument("--out", default=str(ROOT / "assets/foil/fam/wotc-neo-genesis"))
    ap.add_argument("--check", default="")
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args()
    hints = json.load(open(HERE / "neo1_matte_hints.json"))
    win = load_window(BOX)
    win19 = load_window(ENERGY_BOX, "energy")
    tiles = []
    for n in [int(s) for s in a.cards.split(",") if s]:
        rgb, matte, bg, col, half, alpha, k = build(n, hints, win19 if n == 19 else win)
        print(f"neo1-{n}: matte {matte.mean() * 100:.1f}% of the crop, foil {bg.mean() * 100:.1f}%, {k} flecks")
        if not a.no_write:
            save(n, bg, col, half, alpha, Path(a.out))
        if a.check:
            tiles.append(check_tile(n, rgb, matte, bg, alpha))
    if a.check and tiles:
        cols = 3
        W, H = tiles[0].size
        sheet = Image.new("RGB", (cols * (W + 6), ((len(tiles) + cols - 1) // cols) * (H + 6)), (20, 20, 20))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * (W + 6), (i // cols) * (H + 6)))
        sheet.save(a.check)
        print(a.check)


if __name__ == "__main__":
    main()
