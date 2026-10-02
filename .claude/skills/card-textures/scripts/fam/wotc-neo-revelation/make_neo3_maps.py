#!/usr/bin/env python3
"""Neo Revelation (neo3) Rare Holo foil maps for the wotc-neo-revelation holo family.

What the real cards do (refs/ and SOURCES.md in /mnt/project-files/holo-remaster/wotc-neo-revelation/): the cosmos holofoil is
printed under the art, and Wizards laid an opaque WHITE layer over it to keep it out of parts of the picture. On the regular
print (our scans) the Pokemon and a thin outline round it sit on white, and so do the brightly painted parts of some skies
(Ho-Oh's rainbow rays, Houndoom's magenta sunset, Celebi's black planet, Crobat's pale clouds): the foil shows in the DARK
background gaps only. The frame, name bar, text box and evolution badge carry none.

Per card it writes, at the scan's own size (600 x 838, so a mask needs no placement: 100% 100% at 0 0), into
assets/foil/fam/wotc-neo-revelation/:

  <n>-area-v1.webp   RGBA, RGB white, ALPHA = where the foil shows: the window's background measured from the scan (GrabCut over a
                     fleck-free copy of the window, seeded by the local fleck density and steered per card by hints.json: `figure`
                     outlines of the Pokemon, `matte` / `foil` polygons and dabs; `mode: dark|navy` takes the dark ground of
                     the cards whose foil is only the dark gaps), a pixel clear of the Pokemon's outline, eased on pale ink.
  <n>-fleck-v1.webp  RGBA, ALPHA = the cosmos elements (specks, squares, plus shapes, discs, soft orbs), RGB = each element's own
                     colour: the ones the scan shows (white top-hat of each channel at two scales, compact pieces) plus seeded
                     ones of the same kinds where the foil is but the scan printed none (the same method as Neo Destiny's).

    python3 .claude/skills/card-textures/scripts/fam/wotc-neo-revelation/make_neo3_maps.py --cards 7,3,4 --preview <dir>
    python3 .../make_neo3_maps.py --ship          # write the assets (all 14)
Seeded per card (numpy RandomState(4000 + 30 + n)): re-running writes the same files. A changed map takes a new SUFFIX.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-neo-revelation"
X0, Y0, X1, Y1 = 61, 94, 539, 430          # the art window crop, card pixels of the 600 x 838 scan
SUFFIX = "-v1"
H, W = 838, 600
HINTS: dict[str, dict] = json.load(open(Path(__file__).with_name("hints.json")))


def load(n: int):
    rgb = np.asarray(Image.open(ROOT / "assets" / "cards" / "neo3" / f"{n}.webp").convert("RGB")).astype(np.float32)
    win = np.asarray(Image.open(ROOT / "assets" / "foil" / "wotc-win" / "pokemon-v1.webp"))[..., 3].astype(np.float32) / 255
    return rgb, win


def fleck_mask(rgb, win):
    """Small bright features standing above their 9 px median: the cosmos dots, squares and crosses (the drawing's ink lines,
    long and thin, and the bright side of a dark line are dropped)."""
    mx = rgb.max(2)
    med = ndi.median_filter(mx, size=9)
    th = np.clip(mx - med, 0, None)
    dark = ndi.minimum_filter(mx, size=7)
    edge = ndi.maximum_filter(((med - dark) > 75).astype(np.uint8), size=3) > 0
    m = (th > 12) & (win > 0.5) & ~edge
    lab, k = ndi.label(m, structure=np.ones((3, 3)))
    keep = np.zeros(k + 1, bool)
    if k:
        objs = ndi.find_objects(lab)
        area = ndi.sum(m, lab, range(1, k + 1))
        for i, (sl, ar) in enumerate(zip(objs, area), 1):
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            if ar <= 300 and max(h, w) <= 30 and max(h, w) <= 4 * max(1, min(h, w)):
                keep[i] = True
    return keep[lab], th


def disc_mask(rgb, win):
    """The big cosmos discs (Raikou's blue and cyan circles, Houndoom's moon-like disc): round bright blobs 9 to 40 px across
    standing above a 41 px median."""
    lum = rgb.mean(2)
    med = ndi.median_filter(lum, size=41)
    th = lum - med
    m = (th > 22) & (win > 0.5)
    m = ndi.binary_opening(m, iterations=2)
    lab, k = ndi.label(m)
    keep = np.zeros(k + 1, bool)
    if k:
        objs = ndi.find_objects(lab)
        area = ndi.sum(m, lab, range(1, k + 1))
        for i, (sl, ar) in enumerate(zip(objs, area), 1):
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            if 9 <= max(h, w) <= 40 and ar >= 0.55 * h * w * 0.785 and max(h, w) <= 1.5 * min(h, w):
                keep[i] = True
    return keep[lab]


def poly_mask(shape, polys):
    im = Image.new("L", (shape[1], shape[0]), 0)
    dr = ImageDraw.Draw(im)
    for p in polys:
        dr.polygon([tuple(v) for v in p], fill=255)
    return np.asarray(im) > 0


def dab_mask(shape, dabs):
    im = Image.new("L", (shape[1], shape[0]), 0)
    dr = ImageDraw.Draw(im)
    for x, y, r in dabs:
        dr.ellipse((x - r, y - r, x + r, y + r), fill=255)
    return np.asarray(im) > 0


def line_mask(shape, lines):
    """Polylines with a width: [[x0, y0, x1, y1, ...], width] (a tail, a ribbon, a magnet's arm)."""
    im = Image.new("L", (shape[1], shape[0]), 0)
    dr = ImageDraw.Draw(im)
    for pts, w in lines:
        q = [(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)]
        dr.line(q, fill=255, width=int(w), joint="curve")
        for x, y in q:
            dr.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=255)
    return np.asarray(im) > 0


def hint_mask(shape, h, side):
    return (poly_mask(shape, h.get(side, [])) | dab_mask(shape, h.get(side + "dab", []))
            | line_mask(shape, h.get(side + "line", [])))


def area_map(n: int, rgb, win, fm):
    h = HINTS.get(str(n), {})
    crop = rgb[Y0:Y1, X0:X1]
    winc = win[Y0:Y1, X0:X1] > 0.5
    shape = winc.shape
    clean = np.stack([ndi.median_filter(crop[..., c], size=7) for c in range(3)], 2)
    lum = clean.mean(2) / 255
    none = np.zeros(shape, bool)
    foil_hint = hint_mask(shape, h, "foil")
    sharp_hint = hint_mask(shape, h, "matte")
    # `fade`: matte polygons whose edge the `soft` fade blurs (a sunset painted over the white layer, not the Pokemon)
    matte_hint = sharp_hint | poly_mask(shape, h.get("fade", []))
    # `figure`: a rough outline of the Pokemon (to within `fband` px): deeper inside is matte, the band is GrabCut's call.
    # `loose`: an outline whose whole inside is GrabCut's call (ribbons with the field showing between them).
    fband = float(h.get("fband", 8))
    fig = poly_mask(shape, h.get("figure", []))
    loose = poly_mask(shape, h.get("loose", []))
    near = fig | loose
    fig_in = fig & (ndi.distance_transform_edt(fig) > fband) if fig.any() else none
    far = ~near & (ndi.distance_transform_edt(~near) > fband) if near.any() else none
    # precedence: a matte hint beats a foil hint beats the inside of a figure outline
    hard_matte = matte_hint | (fig_in & ~foil_hint)
    hard_foil = foil_hint & ~matte_hint
    if h.get("mode") in ("dark", "navy"):
        # the foil is the dark ground only (the bright paint sits on the white layer): the dark pixels of the window, or
        # (navy) the dark blue ones, the night sky over trees, grass, a snowman or a sunset
        if h["mode"] == "dark":
            fg = (lum < float(h.get("dark", 0.3))) & winc
        else:
            blue = clean[..., 2] - np.maximum(clean[..., 0], clean[..., 1])
            fg = (lum < float(h.get("dark", 0.5))) & (blue > float(h.get("blue", 12))) & winc
            if h.get("black"):  # the black gaps too (Crobat's sky between the wings)
                fg |= (ndi.gaussian_filter(lum, 2) < float(h["black"])) & winc
        fg = ndi.binary_opening(fg, iterations=int(h.get("open", 1)))
        fg = ndi.binary_closing(fg, iterations=1)
    else:
        dens = ndi.gaussian_filter(fm[Y0:Y1, X0:X1].astype(np.float32), 7)
        p = np.percentile(dens[winc], 90)
        dn = np.clip(dens / max(p, 1e-4), 0, 1)
        mask = np.full(shape, cv2.GC_PR_BGD, np.uint8)
        mask[dn > 0.25] = cv2.GC_PR_FGD
        mask[dn > 0.55] = cv2.GC_FGD
        mask[ndi.gaussian_filter(dn, 6) < 0.04] = cv2.GC_BGD
        if h.get("band"):
            # the matte hints cover the Pokemon to within `band` px: anything farther out is the field
            mask[ndi.distance_transform_edt(~hard_matte) > float(h["band"])] = cv2.GC_FGD
        if near.any():
            mask[near] = cv2.GC_PR_BGD
            mask[~near & ~far] = cv2.GC_PR_FGD
            if h.get("whole"):
                mask[far] = cv2.GC_FGD
        mask[hard_foil] = cv2.GC_FGD
        mask[hard_matte] = cv2.GC_BGD
        mask[~winc] = cv2.GC_BGD
        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)
        img = cv2.cvtColor(np.clip(clean, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
        cv2.grabCut(img, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
        fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    fg |= hard_foil & winc
    fg &= ~hard_matte
    if h.get("whole"):
        # the whole background is foil: only the matte pieces holding a matte hint or lying in an outline (the Pokemon)
        # stay matte, every other pocket GrabCut called matte (a darker patch of the field) goes back to foil
        lab, k = ndi.label(winc & ~fg)
        if k:
            hold = ndi.binary_dilation(hard_matte, iterations=1) | loose
            held = np.unique(lab[hold & (lab > 0)])
            fg = winc & ~np.isin(lab, held[held > 0])
    matte_hint = hard_matte
    # drop crumbs, fill the specks and discs GrabCut left out of the field (anything small surrounded by foil)
    lab, k = ndi.label(fg)
    if k:
        sizes = ndi.sum(fg, lab, range(1, k + 1))
        fg = np.isin(lab, 1 + np.flatnonzero(sizes >= int(h.get("crumb", 60))))
    holes = ndi.binary_fill_holes(fg) & ~fg
    lab, k = ndi.label(holes)
    if k:
        sizes = ndi.sum(holes, lab, range(1, k + 1))
        fill = np.isin(lab, 1 + np.flatnonzero(sizes <= int(h.get("hole", 700))))
        fg |= fill & ~matte_hint
    fg &= winc
    # keep a pixel off the Pokemon's white outline, feather a pixel
    fg = ndi.binary_erosion(fg, iterations=int(h.get("erode", 1)))
    a = ndi.gaussian_filter(fg.astype(np.float32), 0.8)
    if h.get("soft"):
        # the foil fades out over `soft` px where the field turns to the painted-on-white part (Houndoom's sunset); the
        # Pokemon's own edge stays sharp
        figm = (fig | sharp_hint) & ~fg & winc
        a = ndi.gaussian_filter((fg | figm).astype(np.float32), float(h["soft"])) * ndi.gaussian_filter(
            (~figm).astype(np.float32), 0.8) * winc
    # pale ink over foil dodges to white fast: ease the light there (the real pale field still flashes, just less)
    lim = np.clip(1.0 - (lum - 0.42) / 0.5 * 0.55, 0.45, 1.0)
    a = a * lim * float(h.get("gain", 1.0))
    return np.clip(a, 0, 1), fg, clean


# ---- the cosmos elements (the method of Neo Destiny's make_nd_maps.py, here from this family's own area) ----------------------
import colorsys  # noqa: E402

SQUARE_HUES = [(20, 3), (8, 2), (44, 2), (130, 2), (175, 2), (300, 1)]
DISC_HUES = [(255, 3), (270, 3), (220, 2), (190, 1), (320, 1)]
ORB_HUES = [(250, 2), (275, 2), (210, 1)]
DENSITY = 1.6  # more elements than Neo Destiny's: these skies are denser (CGC scans, the Raikou and Blissey clips)
GAIN = 1.5      # the elements' strength
SS = 3  # supersampling of the drawn elements


def pick(rs, table):
    hues, weights = zip(*table)
    p = np.array(weights, float)
    return hues[rs.choice(len(hues), p=p / p.sum())]


def hsv(h, s, v):
    return np.array(colorsys.hsv_to_rgb((h % 360) / 360.0, s, v), np.float32)


def scan_flecks(rgb, area):
    """The elements the scan shows: per-channel white top-hat at two scales, compact pieces only, in the scan's own hue."""
    inside = area > 0.5
    th = np.zeros(rgb.shape[:2], np.float32)
    for rad, gain in ((5, 1.0), (13, 0.9)):
        se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * rad + 1, 2 * rad + 1))
        for c in range(3):
            ch = np.ascontiguousarray(rgb[..., c])
            th = np.maximum(th, (ch - cv2.morphologyEx(ch, cv2.MORPH_OPEN, se)) * gain)
    th *= inside
    b = th > 0.075
    lab, k = ndi.label(b)
    keep = np.zeros(k + 1, bool)
    if k:
        sizes = ndi.sum(b, lab, range(1, k + 1))
        for i, sl in enumerate(ndi.find_objects(lab)):
            if sl is None:
                continue
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            a = sizes[i]
            keep[i + 1] = 2 <= a <= 700 and max(h, w) / max(1, min(h, w)) <= 2.6 and a / (h * w) >= 0.32
    m = keep[lab]
    strength = np.clip((th - 0.04) / 0.22, 0, 1) * ndi.binary_dilation(m, iterations=1)
    strength = cv2.GaussianBlur(strength.astype(np.float32), (0, 0), 0.6)
    blur = cv2.GaussianBlur(rgb, (0, 0), 1.0)
    mx = blur.max(2, keepdims=True)
    mn = blur.min(2, keepdims=True)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    col = (blur - mn) / np.maximum(mx - mn, 1e-4)
    col = col * np.clip(sat * 2.2, 0, 1) + (1 - np.clip(sat * 2.2, 0, 1))
    return strength.astype(np.float32), col.astype(np.float32)


class Canvas:
    """Supersampled RGBA accumulation: elements drawn over each other with 'lighten' on alpha."""

    def __init__(self):
        self.a = np.zeros((H * SS, W * SS), np.float32)
        self.c = np.zeros((H * SS, W * SS, 3), np.float32)

    def blob(self, x, y, r, peak, color, shape, angle=0.0, soft=0.5):
        R = int(np.ceil((r * 3 + 2) * SS))
        cx, cy = x * SS, y * SS
        x0, x1 = max(0, int(cx) - R), min(W * SS, int(cx) + R + 1)
        y0, y1 = max(0, int(cy) - R), min(H * SS, int(cy) + R + 1)
        if x0 >= x1 or y0 >= y1:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dx, dy = (xx + 0.5 - cx) / SS, (yy + 0.5 - cy) / SS
        if shape == "gauss":
            v = np.exp(-(dx * dx + dy * dy) / (2 * r * r))
        else:
            ca, sa = np.cos(angle), np.sin(angle)
            u, w = dx * ca + dy * sa, -dx * sa + dy * ca
            if shape == "disc":
                d = np.sqrt(u * u + w * w) - r
            elif shape == "square":
                d = np.maximum(np.abs(u), np.abs(w)) - r
            else:
                d = np.minimum(np.maximum(np.abs(u) - r, np.abs(w) - r / 3), np.maximum(np.abs(w) - r, np.abs(u) - r / 3))
            v = np.clip(0.5 - d / max(soft, 1e-3), 0, 1)
        v = (v * peak).astype(np.float32)
        a = self.a[y0:y1, x0:x1]
        win = v > a
        self.c[y0:y1, x0:x1][win] = color
        self.a[y0:y1, x0:x1] = np.maximum(a, v)

    def done(self):
        a = cv2.resize(self.a, (W, H), interpolation=cv2.INTER_AREA)
        c = cv2.resize(self.c * self.a[..., None], (W, H), interpolation=cv2.INTER_AREA) / np.maximum(a[..., None], 1e-4)
        return a.astype(np.float32), np.clip(c, 0, 1).astype(np.float32)


def procedural(n, area, lum, dens=1.0, big=1.0):
    """Seeded cosmos elements wherever the foil is: specks, squares and plus shapes, discs, orbs."""
    rs = np.random.RandomState(4030 + n)
    inside = area > 0.5
    ys, xs = np.nonzero(inside)
    n_px = float(inside.sum())
    cv_ = Canvas()

    def spots(count):
        if not len(xs):
            return []
        i = rs.randint(0, len(xs), count)
        return [(xs[j] + rs.rand(), ys[j] + rs.rand()) for j in i]

    for x, y in spots(int(n_px * dens * big * 0.5 / 18000)):
        cv_.blob(x, y, rs.uniform(9, 14), rs.uniform(0.16, 0.28), hsv(pick(rs, ORB_HUES), 0.55, 1.0), "gauss")
    for x, y in spots(int(n_px * dens * big * 0.7 / 3200)):
        cv_.blob(x, y, rs.uniform(4.5, 8.5), rs.uniform(0.3, 0.55), hsv(pick(rs, DISC_HUES), 0.6, 1.0), "disc", soft=1.6)
    for x, y in spots(int(n_px * dens / 1300)):
        kind = "plus" if rs.rand() < 0.3 else "square"
        cv_.blob(x, y, rs.uniform(1.4, 3.0), rs.uniform(0.55, 1.0), hsv(pick(rs, SQUARE_HUES), 0.85, 1.0), kind,
                 angle=rs.choice([0.0, np.pi / 4]), soft=0.7)
    for x, y in spots(int(n_px * dens / 240)):
        cv_.blob(x, y, rs.uniform(0.55, 0.9), rs.uniform(0.3, 0.85), hsv(rs.uniform(0, 360), rs.uniform(0.45, 0.95), 1.0), "gauss")
    a, c = cv_.done()
    t = np.clip((lum - 0.55) / 0.35, 0, 1)
    a *= 1 - 0.6 * t * t * (3 - 2 * t)
    return a, c


def build(n):
    rgb255, win = load(n)
    fm, _th = fleck_mask(rgb255, win)
    a_crop, fg, _clean = area_map(n, rgb255, win, fm)
    area = np.zeros((H, W), np.float32)
    area[Y0:Y1, X0:X1] = a_crop
    rgb = rgb255 / 255.0
    lum = cv2.GaussianBlur(rgb @ np.array([0.299, 0.587, 0.114], np.float32), (0, 0), 3.0)
    s_int, s_col = scan_flecks(rgb, area)
    h = HINTS.get(str(n), {})
    p_int, p_col = procedural(n, area, lum, DENSITY * float(h.get("dens", 1.0)), float(h.get("big", 1.0)))
    use_scan = s_int >= p_int
    fl_a = np.clip(np.maximum(s_int, p_int) * GAIN * float(h.get("fgain", 1.0)), 0, 1) * area
    fl_c = np.where(use_scan[..., None], s_col, p_col)
    return rgb, area, fl_a, fl_c


def save_rgba(path, rgb, alpha, quality=88, alpha_quality=100):
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alpha, 0, 1) * 255]).round().astype(np.uint8), "RGBA")
    im.save(path, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6, exact=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", default=",".join(str(i) for i in range(1, 15)))
    ap.add_argument("--preview", default="", help="write PNG previews here instead of shipping")
    ap.add_argument("--ship", action="store_true")
    args = ap.parse_args()
    for n in [int(c) for c in args.cards.split(",") if c]:
        rgb, area, fl_a, fl_c = build(n)
        cover = float((area[Y0:Y1, X0:X1] > 0.5).mean())
        print(f"neo3-{n}: foil {cover:.0%} of the window crop", file=sys.stderr)
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            sl = (slice(Y0, Y1), slice(X0, X1))
            ov = rgb[sl] * (0.3 + 0.7 * area[sl][..., None])
            panels = [rgb[sl], ov, fl_c[sl] * fl_a[sl][..., None]]
            sheet = np.concatenate([np.pad(p, ((0, 0), (0, 4), (0, 0)), constant_values=1) for p in panels], 1)
            Image.fromarray((np.clip(sheet, 0, 1) * 255).astype(np.uint8)).save(os.path.join(args.preview, f"maps-{n}.png"))
        if args.ship:
            OUT.mkdir(parents=True, exist_ok=True)
            save_rgba(OUT / f"{n}-area{SUFFIX}.webp", np.ones((H, W, 3), np.float32), area, quality=80)
            save_rgba(OUT / f"{n}-fleck{SUFFIX}.webp", fl_c, fl_a, quality=60, alpha_quality=55)


if __name__ == "__main__":
    main()
