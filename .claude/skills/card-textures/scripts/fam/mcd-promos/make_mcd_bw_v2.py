#!/usr/bin/env python3
"""McDonald's Collection 2011 and 2012 (BW frame): per-card ink plates and chip mattes (fix rounds 1-2, 2026-10-22).

What the audit (holo-work/bw-mcd11-mcd12/AUDIT.json) found against in-hand photos: the scans carry the chips baked in as a LIT mosaic
(Dewott's sky is a pale blue-white chip mosaic where the real card, unlit, shows a dark navy sky), the per-card maps foiled the
Pokemon's head on eight 2012 cards and left matte blobs in the background, and the chips took the art's tint. So for the BW cards the
look is rebuilt from three parts, and this script draws the two per-card ones, both on the canvas BOX (522 x 342 px of the 600 x 838
scan, the union of every card's art window; the CSS insets `.foil` and `.glare` to exactly this box):

  <id>-plate-v3.webp  RGBA, the UNLIT ink where the foil is:
      alpha = the card's own art window (window(): grey side bars, the dark line under the top bevel, a per-column step for the 2012
              evolution bar, the HP pill) minus the Pokemon (whole body), the McDonald's M (template shifted to the card's yellow)
              and the evolution circle (Hough); feathered 0.7 px. Outside it the plate is transparent and the card's own scan shows.
      rgb   = reprints (all of 2012, and Maractus, Alomomola, Audino of 2011) take the registered set print, colour-fitted to the McD
              scan on the Pokemon; new 2011 artworks (no print) take the scan with its chips removed (non-local means, chroma median),
              then TONE / SKY / CHROMA_FROM_SCAN per card, soften_dots and cap_dips (no dark specks where the print's droplets
              register a pixel off the scan's), and the DARK / THIN darkening (ink over un-lit foil reads darker than the plain print).
  <id>-matte-v3.png   L, 255 x (1 - alpha): white where there are no chips. The CSS layers it with `lighten` over the chip stack, so
              the chips stop at the Pokemon, the M and the window edge.
  The CSS paints the plate as the foil layer's own background (no mask), so at rest the window is the clean, darker art, and the lit
  chips (shared tile chips-bw-v3.png, make_mcd_chips.py) are screened over it only while the card is held.

Silhouettes: cards in bw_polys.json (the ones the audit found wrong) start from a rough hand polygon, snapped to the art by GrabCut on
the registered print, plus every chip-free pixel inside it (scan minus a local linear fit of the print: chips do not fit, the Pokemon
does). Alomomola's loose hand hull is snapped the same way; Snivy's (mcd11-1) collar notch is closed and its tail gap opened by a
`:minus` polygon. Every other card keeps the silhouette of its v1 map snapped to the print or scan.

    MCD_PRINT_CACHE=<dir> python3 make_mcd_bw_v2.py [--ids mcd12-5,...] [--qa out.jpg] [--no-write]
    MCD_PRINT_CACHE reuses registered prints saved as <id>-print.npy (uint8, 600 x 838 x 3) and saves new ones there.
    A full run (no --ids) rewrites the WARM table in js/fam/mcd-promos.js.

Deterministic. Needs numpy, scipy, opencv, Pillow. Never overwrites a shipped file: output names are -v3.
"""
import argparse
import json
import os
import re
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_mcd_maps_v2 as v2  # noqa: E402

v1 = v2.v1
ROOT, OUT, W, H, WIN = v1.ROOT, v1.OUT, v1.W, v1.H, v1.WIN
BW = [f"{s}-{n}" for s in ("mcd11", "mcd12") for n in range(1, 13)]
POLYS = json.load(open(os.path.join(HERE, "bw_polys.json")))
POLY_IDS = {k for k in POLYS if k.startswith("mcd") and ":" not in k}
# Un-lit foil under the ink reads darker than the plain print, most where the ink is thin (white clouds and splash show the dark
# metal; Dewott's blue sky reads navy-purple in hand): x (DARK - THIN x luma), with a cool metal tint.
DARK, THIN, TINT = 0.92, 0.11, np.array([0.98, 0.98, 1.02], np.float32)
NO_PRINT = {"mcd11-1", "mcd11-3", "mcd11-4", "mcd11-6", "mcd11-7", "mcd11-8", "mcd11-9", "mcd11-10", "mcd11-11"}  # new 2011 artworks
CACHE = os.environ.get("MCD_PRINT_CACHE", "")
# The plate canvas: the union of every card's art window (art_window), (x0, y0, x1, y1) of the 600 x 838 scan. The CSS insets `.foil`
# to exactly this box (css/holo/fam/mcd-promos.css); each card's alpha is its own window, measured on its scan (the windows differ by
# up to 6 px between cards: Dewott's runs to x 557, Snivy's to 547).
BOX = (40, 75, 562, 417)
# No image is ever used as a CSS mask: on a 12-face WebKit page the faces whose `.foil` was cut by an image mask (the v1 maps, the
# first plates) dropped every foil layer at random, a different set of faces in each screenshot of the same page; with the mask off,
# 0 of 8 screenshots dropped (2026-10-22, holo-work/fix-mcd-promos/r2/varlog.txt). So the plate carries the foil area in its own alpha
# (a background, not a mask) and the chips are kept off the Pokemon by the matte (<id>-matte-v3.png: white = no chips), a background
# layer of their own stack: black there, and screened over the card (`.foil` is no stacking context: z-index auto).
REFINE = {"mcd11-5"}  # Alomomola: the hand hull runs past the fin tips (audit 2026-10-22)
# Audino: the v1 cut leaves the ear curls out, so the print's curls sat a pixel off the scan's (98 dark specks at rest): the v1
# silhouette closed over the curls, then snapped by GrabCut on the print.
CLOSE_HULL = {"mcd11-12"}
# Maractus: its pale sky reads chip-free, so the chip-free union pulled sky patches into the matte (baked chips round the flowers).
NO_FREE = {"mcd11-2"}
# ... and GrabCut still gives it sky beside the arms: the print's blue or near-white pixels are never Maractus (green, pink, yellow)
SKY_NOT_POKE = {"mcd11-2"}
# :plus polygons that add only the warm (brown, tan) strokes of the art inside them
PLUS_WARM = {"mcd11-12"}


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def art_window(A, bw2011=False):
    """The art window of a BW-frame McD scan, (x0, y0, x1, y1) exclusive: inside the grey side bars (median over rows of the inner end
    of the bar), below the dark line under the name bar's bevel, above the dark line over the bottom pill (its top row - 5)."""
    L = A @ np.array([0.299, 0.587, 0.114], np.float32)
    g = ((A.max(-1) - A.min(-1)) < 0.10) & (L > 0.30) & (L < 0.85)

    def inner(run):
        best, k = None, 0
        for i, v in enumerate(run):
            k = k + 1 if v else 0
            if k >= 3:
                best = i
            if best is not None and not v and i - best > 4:
                break
        return best

    xl = [20 + v for v in (inner(g[y, 20:80]) for y in range(130, 370, 2)) if v is not None]
    xr = [580 - v for v in (inner(g[y, 580:520:-1]) for y in range(130, 370, 2)) if v is not None]
    rm = np.median(L[:, 200:420], 1)  # bottom: the pill's top row
    lo, hi = (80, 87) if bw2011 else (70, 81)
    pk = next(y for y in range(lo, hi) if rm[y] >= 0.6 and rm[y] >= rm[y + 1])  # the bevel's crest
    y = pk + 1
    while y < pk + 12 and not (rm[y] < 0.4 and rm[y] <= rm[y + 1]):
        y += 1
    if bw2011:
        y = pk + 4  # the 2011 frame: grey bar, its dark line 4 px below the crest, then the art
    p = next(y for y in range(414, 445) if rm[y] > 0.72 and rm[y + 1] > 0.72)
    return int(np.median(xl)) + 1, y + 1, int(np.median(xr)), p - 5


def _top_level(rm, lo, hi):
    pk = next(y for y in range(lo, hi) if rm[y] >= 0.6 and rm[y] >= rm[y + 1])  # the bevel's crest
    y = pk + 1
    while y < pk + 12 and not (rm[y] < 0.4 and rm[y] <= rm[y + 1]):
        y += 1
    return y + 1


def top_edge(A, x0, x1, yl):
    """2012 frame: the name bar's bevel steps up right of the name, so the window starts ~7 px higher under the HP than under the name
    (yl). The right level comes from the median profile under the HP; in the step zone (x 300-460) each column takes the row under its
    lowest frame-like pixel (bright grey bevel or its dark line) between the two levels, kept monotonic."""
    L = A @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = A.max(-1) - A.min(-1)
    yr = _top_level(np.median(L[:, x1 - 130:x1 - 30], 1), 66, 84)
    yr = min(yr, yl)
    top = np.full(W, yl)
    top[460:] = yr
    frame = ((L > 0.55) & (sat < 0.12)) | ((L < 0.32) & (sat < 0.15))
    for x in range(300, 460):
        band = [y for y in range(yr - 1, yl) if frame[y, x]]
        top[x] = max(band) + 1 if band else yr
    z = ndi.median_filter(top[300:460], 9, mode="nearest")
    top[300:460] = np.minimum.accumulate(np.maximum(z, yr))
    return top


def window(cid, A):
    x0, y0, x1, y1 = art_window(A, cid.startswith("mcd11"))
    win = np.zeros((H, W), bool)
    if cid.startswith("mcd11"):
        win[y0:y1, x0:x1] = True
    else:
        top = top_edge(A, x0, x1, y0)
        rows = np.arange(H)[:, None]
        win[:, x0:x1] = (rows >= top[None, x0:x1]) & (rows < y1)
        y0 = int(top[x0:x1].min())
    return win, (x0, y0, x1, y1)


def old_window():
    x0, y0, x1, y1 = WIN
    win = np.zeros((H, W), bool)
    win[y0:y1, x0:x1] = True
    return win


def registered_print(cid, A):
    if CACHE and os.path.exists(f"{CACHE}/{cid}-print.npy"):
        return np.load(f"{CACHE}/{cid}-print.npy").astype(np.float32) / 255, None
    best = None
    for sid in list(dict.fromkeys(v2.C.get(cid, []) + v2.name_candidates(cid)))[:7]:
        p = v2.img_path(sid)
        if not p:
            continue
        try:
            B = v2.loadp(p)
        except Exception:
            continue
        regs = []
        try:
            regs.append(v2.register_sift(A, B))
        except Exception:
            pass
        if not regs or regs[0][1] < 0.85:
            try:
                regs.append(v2.register(A, B))
            except Exception:
                pass
        if not regs:
            continue
        Bw, cc = max(regs, key=lambda t: t[1])
        if best is None or cc > best[1]:
            best = (Bw, cc, sid)
        if cc > 0.86:
            break
    if not best or best[1] < 0.85:
        return None, best[1] if best else None
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
        np.save(f"{CACHE}/{cid}-print.npy", (best[0] * 255 + 0.5).astype(np.uint8))
    return best[0], best[1]


def _box(x, r):
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)


def chip_energy(A, B):
    """Scan minus a local linear fit of the print (a guided filter, r 7): the art fits, the chips do not."""
    R = np.zeros_like(A)
    for c in range(3):
        I, p = B[..., c], A[..., c]
        mI, mp = _box(I, 7), _box(p, 7)
        a = (_box(I * p, 7) - mI * mp) / (_box(I * I, 7) - mI * mI + 1e-3)
        b = mp - a * mI
        R[..., c] = p - (_box(a, 7) * I + _box(b, 7))
    E = ndi.gaussian_filter(ndi.median_filter(np.sqrt((R ** 2).sum(-1)), 5), 2)
    return np.log(E + 1e-4)


def polymask(cid):
    m = np.zeros((H, W), np.uint8)
    for poly in POLYS.get(cid, []):
        pts = np.array([[46 + X / 2, 84 + Y / 2] for X, Y in poly], np.float32)
        cv2.fillPoly(m, [np.round(pts * 4).astype(np.int32)], 1, lineType=cv2.LINE_8, shift=2)
    return m > 0


def poke_from_poly(cid, A, B, win, pm=None):
    if B is None:  # no print: the scan's own chip energy, and GrabCut on the scan
        le = np.log(v1.chip_energy(A)[1] + 1e-3)
        B = A
    else:
        le = chip_energy(A, B)
    thr = v1.otsu(le[win])
    pm = (polymask(cid) if pm is None else pm) & win
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    m[pm] = cv2.GC_PR_FGD
    core = ndi.binary_erosion(pm, structure=disk(10))
    m[core & (le < thr)] = cv2.GC_FGD
    m[ndi.binary_opening((le > thr + 0.4) & pm, structure=disk(3)) & ~core] = cv2.GC_PR_BGD
    img = np.ascontiguousarray((B * 255).astype(np.uint8)[..., ::-1])
    cv2.grabCut(img, m, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    poke = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & win
    # every chip-free pixel inside the polygon is Pokemon too (white blades, pale tufts the colour model gives to the clouds)
    if cid not in NO_FREE:
        free = ndi.binary_closing(ndi.binary_opening((le < thr) & pm, structure=disk(1)), structure=disk(2))
        poke |= free & ndi.binary_dilation(poke, structure=disk(12))
    lab, n = ndi.label(poke)
    if n:
        sizes = np.asarray(ndi.sum(poke, lab, range(1, n + 1)))
        poke = np.isin(lab, np.where(sizes >= 0.002 * win.sum())[0] + 1)
    poke = ndi.binary_closing(poke, structure=disk(2))
    # fill the holes, except a hole that carries plain chips: background the Pokemon encloses (sky between Servine's neck and collar)
    holes, n = ndi.label(ndi.binary_fill_holes(poke) & ~poke)
    if n:
        area = np.asarray(ndi.sum(np.ones_like(poke), holes, range(1, n + 1)))
        chipped = np.asarray(ndi.mean(le > thr + 0.2, holes, range(1, n + 1)))
        poke |= np.isin(holes, np.where(~((area > 150) & (chipped > 0.5)))[0] + 1)
    if cid + ":minus" in POLYS:
        poke &= ~(polymask(cid + ":minus") & ndi.binary_closing(le > thr, structure=disk(2)))
        poke = ndi.binary_opening(poke, structure=disk(1))
    if cid + ":plus" in POLYS:
        plus = polymask(cid + ":plus")
        if cid in PLUS_WARM:  # only the art's warm strokes inside the polygon (Audino's brown and tan ear curls), not the teal trees
            plus &= ndi.binary_dilation((B[..., 0] > B[..., 2] + 0.04) & (B[..., 0] >= B[..., 1] - 0.02), structure=disk(1))
        poke |= plus
    return poke & win


def old_matte(cid, win):
    al = np.asarray(Image.open(f"{OUT}/{cid}-v1.webp").convert("RGBA"))[..., 3]
    return win & old_window() & (al < 128)  # the v1 maps cover only the old fixed window


_CIRCLE = {}


def corner_circle(cid, win, A=None):
    """The evolution circle (Stage 1 cards) where it overlaps the window's top-left corner: a Hough circle of radius 36-46 px centred
    left of x 75 and between y 70 and 95 of the scan, grown 2 px (the ring is frame: matte)."""
    if cid not in _CIRCLE:
        A = v1.load(cid) if A is None else A
        g = cv2.GaussianBlur(cv2.cvtColor((A * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)[40:180, 0:170], (0, 0), 1.5)
        c = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1, minDist=50, param1=90, param2=30, minRadius=25, maxRadius=60)
        out = np.zeros((H, W), bool)
        for cx, cy, r in ([] if c is None else c[0]):
            cy += 40
            if 36 <= r <= 46 and cx < 75 and 70 <= cy <= 95:
                yy, xx = np.mgrid[0:H, 0:W]
                out = np.hypot(xx - cx, yy - cy) <= r + 2
                break
        _CIRCLE[cid] = out
    return _CIRCLE[cid] & win


def m_mask(cid, A):
    """The golden-arches badge of this card: the set's template (make_mcd_maps_v2.m_template) shifted onto this scan's own yellow
    (the scans sit a few px apart)."""
    s = cid.split("-")[0]
    t = ndi.binary_erosion(v2.m_template(s), structure=disk(2))  # the template is grown 3 px: 1 px is enough (no chip halo round it)
    hsv = cv2.cvtColor((A * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    yel = (hsv[..., 0] > 14) & (hsv[..., 0] < 32) & (hsv[..., 1] > 150) & (hsv[..., 2] > 170)
    box = np.zeros((H, W), bool)
    box[320:425, 455:565] = True
    yel &= box
    tc = ndi.binary_erosion(t, structure=disk(3))
    best = max(((int((np.roll(np.roll(tc, dy, 0), dx, 1) & yel).sum()), dy, dx) for dy in range(-7, 8) for dx in range(-7, 8)))
    return np.roll(np.roll(t, best[1], 0), best[2], 1)


def plate_from_scan(A, matte):
    """The scan with its baked chips calmed, edges kept: non-local means (h 18, the chips are noise to it; trunks, roofs and outlines
    repeat and stay), then the chroma median-filtered and blurred 2 px (the pink and cyan chip tints). The Pokemon is filled with the
    nearby background first so its outline does not bleed into the plate's edge."""
    bg = ~matte
    fill = A.copy()
    if matte.any():
        _, (iy, ix) = ndi.distance_transform_edt(matte, return_indices=True)
        fill = A[iy, ix]
    u8 = (np.clip(fill, 0, 1) * 255 + 0.5).astype(np.uint8)
    n = cv2.fastNlMeansDenoisingColored(u8, None, 18, 18, 7, 21)
    lab = cv2.cvtColor(n, cv2.COLOR_RGB2LAB).astype(np.float32)
    a = cv2.GaussianBlur(cv2.medianBlur(lab[..., 1].astype(np.uint8), 5).astype(np.float32), (0, 0), 2)
    b = cv2.GaussianBlur(cv2.medianBlur(lab[..., 2].astype(np.uint8), 5).astype(np.float32), (0, 0), 2)
    o = cv2.cvtColor(np.clip(np.stack([lab[..., 0], a, b], -1), 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)
    return np.where(bg[..., None], o.astype(np.float32) / 255, A)


def plate_from_print(A, B, fit):
    """The print with the McD scan's ink: a per-channel gain fitted on the Pokemon (no chips there), held to 0.85..1.15 so colours the
    Pokemon lacks (Servine's blue sky, Purrloin's green meadow) keep the print's own saturation."""
    g = np.median(A[fit], 0) / np.maximum(np.median(B[fit], 0), 1e-3)
    return np.clip(B * np.clip(g, 0.85, 1.15)[None, None], 0, 1).astype(np.float32)


# Per-card tone of the un-lit plate, on top of DARK/THIN/TINT: (extra gain, tint). Dewott's sky reads dark navy-purple in hand
# (holo-refs/bw-mcd11-mcd12/mcd12-5/zoom-window-inhand-3frames-sky-dark.jpg).
TONE = {"mcd12-5": (0.86, np.array([0.96, 0.96, 1.02], np.float32))}
# ... and on its blue sky only (blue-dominant, not white): x0.72 toward navy-purple; the white splash stays light as in hand.
SKY = {"mcd12-5": (0.72, np.array([0.92, 0.85, 1.0], np.float32))}
# Cards whose McD print is coloured differently from the set print it reprints: the plate takes its low-frequency chroma (Lab a, b,
# blurred 10 px) from the calmed McD scan. Purrloin's upper sky is pale green and white in hand, lavender-beige in bw2-64.
CHROMA_FROM_SCAN = {"mcd12-9"}


def chroma_from(ink, ref, sigma=10):
    li = cv2.cvtColor((np.clip(ink, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    lr = cv2.cvtColor((np.clip(ref, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    for c in (1, 2):
        li[..., c] += cv2.GaussianBlur(lr[..., c], (0, 0), sigma) - cv2.GaussianBlur(li[..., c], (0, 0), sigma)
    return cv2.cvtColor(np.clip(li, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32) / 255


def soften_dots(ink, where, depth=16 / 255, area=48):
    """Small dark dots of the plate (a print's droplet rims and specks, a pixel of registration jitter) sit where the scan has a bright
    baked chip, so the bare scan never shows them; at phone size they read as dirt over the window (dark_specks.py). Each compact dark
    blob (black top-hat over a 7 px closing deeper than `depth`, at most `area` px) is lifted to `depth` below its surroundings.
    Lines and larger dark shapes are left alone."""
    L = ink @ np.array([0.299, 0.587, 0.114], np.float32)
    C = ndi.grey_closing(L, size=(7, 7))
    th = (C - L) * where
    lab, n = ndi.label(th > depth)
    if not n:
        return ink
    sizes = np.asarray(ndi.sum(np.ones_like(L), lab, range(1, n + 1)))
    dots = np.isin(lab, np.where(sizes <= area)[0] + 1)
    target = np.where(dots, C - depth, L)
    return np.clip(ink * (target / np.maximum(L, 1e-3))[..., None], 0, 1)


def cap_dips(ink, A, where, cap=16 / 255):
    """Where the plate is much darker than the scan (the pale baked chips: Dewott's sky), a fine dark detail of the print (a droplet's
    rim, a streak) sits on flat scan and reads as a dark speck against the bare card (dark_specks.py: a dot 24 levels under its
    surroundings). There, the plate's luma is held to at most `cap` under its 11 px local median; bright detail is untouched."""
    w = np.array([0.299, 0.587, 0.114], np.float32)
    L, S = ink @ w, A @ w
    darker = cv2.GaussianBlur(np.clip((S - L - 30 / 255) * 8, 0, 1).astype(np.float32), (0, 0), 3) * where
    med = ndi.median_filter(L, size=11)
    target = np.maximum(L, med - cap)
    L2 = L + (target - L) * darker
    return np.clip(ink * (L2 / np.maximum(L, 1e-3))[..., None], 0, 1)


def build(cid):
    A = v1.load(cid)
    win, rect = window(cid, A)
    B, cc = (None, None) if cid in NO_PRINT else registered_print(cid, A)
    if cid in POLY_IDS and B is not None:
        poke = poke_from_poly(cid, A, B, win)
        how = "polygon + grabcut"
    elif cid in CLOSE_HULL and B is not None:
        hull = ndi.binary_closing(old_matte(cid, win), structure=disk(18)) & ~corner_circle(cid, win)
        lab, n = ndi.label(hull)  # the v1 cut's stray background blobs are foil
        if n:
            sizes = np.asarray(ndi.sum(hull, lab, range(1, n + 1)))
            hull = np.isin(lab, np.where(sizes >= 0.05 * sizes.max())[0] + 1)
        poke = poke_from_poly(cid, A, B, win, ndi.binary_dilation(hull, structure=disk(3)))
        how = "v1 hull closed, snapped by grabcut"
    elif cid in REFINE or (cid in NO_PRINT and cid != "mcd11-1"):
        # the v1 silhouette is a loose hull (Alomomola) or the official art's alpha grown 5 px (the new 2011 artworks: a ring of
        # baked chips showed round the Pokemon): snap it to the art
        hull = old_matte(cid, win) & ~corner_circle(cid, win)
        poke = poke_from_poly(cid, A, B, win, ndi.binary_dilation(hull, structure=disk(2)))
        how = "v1 hull snapped by grabcut"
    else:
        poke = old_matte(cid, win) & ~corner_circle(cid, win)
        if cid.startswith("mcd12"):
            poke &= ~m_mask(cid, A)
        if cid == "mcd11-1":
            # the v1 cut left a notch at the collar: close it, but keep the background the tail and body enclose (it carries chips)
            closed = ndi.binary_closing(poke, structure=disk(6))
            holes, n = ndi.label(ndi.binary_fill_holes(closed) & ~closed)
            keep = [i for i in range(1, n + 1) if (holes == i).sum() < 150]
            poke = closed | np.isin(holes, keep)
            poke = poke_from_poly(cid, A, None, win, ndi.binary_dilation(poke, structure=disk(2)))
        lab, n = ndi.label(poke)  # stray matte blobs of the v1 cut (Audino's background) are foil: keep the Pokemon's own parts
        if n:
            sizes = np.asarray(ndi.sum(poke, lab, range(1, n + 1)))
            poke = np.isin(lab, np.where(sizes >= max(0.02 * win.sum(), 0.05 * sizes.max()))[0] + 1)
        how = "v1 silhouette" + (", snapped" if cid == "mcd11-1" else "")
    if cid in SKY_NOT_POKE and B is not None:
        sky = ((B[..., 2] > B[..., 0] + 0.05) & (B[..., 2] >= B[..., 1] - 0.02)) | (B.min(-1) > 0.78)
        poke = ndi.binary_opening(poke & ~ndi.binary_opening(sky, structure=disk(1)), structure=disk(1))
        lab, n = ndi.label(poke)
        if n:
            sizes = np.asarray(ndi.sum(poke, lab, range(1, n + 1)))
            poke = np.isin(lab, np.where(sizes >= 0.002 * win.sum())[0] + 1)
        poke = ndi.binary_fill_holes(poke)
    matte = poke | corner_circle(cid, win)
    if cid.startswith("mcd12"):
        matte |= m_mask(cid, A)
    matte = ndi.binary_dilation(matte, structure=disk(1)) & win
    matte |= ndi.binary_dilation(matte, structure=disk(2)) & ~win  # a Pokemon that meets the window's edge stays matte past it
    # foil alpha: the window minus the matte, feathered 0.7 px; at the window's own edge the plate runs 1 px on under the frame's dark
    # line and stops there, so no sliver of the scan's baked chips shows between the plate and the frame
    al = np.clip(cv2.GaussianBlur((ndi.binary_dilation(win, iterations=2) & ~matte).astype(np.float32), (0, 0), 0.7) * 1.1 - 0.05, 0, 1)
    al *= ndi.binary_dilation(win, iterations=1)
    if B is not None:
        fit = ndi.binary_erosion(poke, structure=disk(4))
        if fit.sum() < 2000:
            fit = win
        ink = plate_from_print(A, B, fit)
        if cid in CHROMA_FROM_SCAN:
            ink = np.where(win[..., None], chroma_from(ink, plate_from_scan(A, matte | ~win)), ink)
        how += f", print cc {cc:.3f}" if cc else ", cached print"
    else:
        ink = plate_from_scan(A, matte | ~win)
        how += ", calmed scan"
    luma = ink @ np.array([0.299, 0.587, 0.114], np.float32)
    ink = ink * (DARK - THIN * luma)[..., None] * TINT
    if cid in TONE:
        ink = ink * TONE[cid][0] * TONE[cid][1]
    if cid in SKY:
        lum = ink @ np.array([0.299, 0.587, 0.114], np.float32)
        wsky = np.clip((ink[..., 2] - ink[..., :2].max(-1)) * 6, 0, 1) * np.clip((0.8 - lum) * 4, 0, 1)
        wsky = cv2.GaussianBlur(wsky, (0, 0), 2)[..., None]
        ink = ink * (1 - wsky + wsky * SKY[cid][0] * SKY[cid][1])
    ink = np.clip(ink, 0, 1)
    if B is not None:
        # the set print's own window line can sit a pixel or two inside the McD scan's (Maractus: a dashed dark line under the top
        # bevel and down the left edge): the outer 3 px of the plate take the ink 4 px further in
        inner = ndi.binary_erosion(win, iterations=4)
        band = ndi.binary_dilation(win, iterations=2) & ~ndi.binary_erosion(win, iterations=3)
        _, (iy, ix) = ndi.distance_transform_edt(~inner, return_indices=True)
        ink = np.where(band[..., None], ink[iy, ix], ink)
    ink = soften_dots(ink, al > 0.01)
    ink = cap_dips(ink, A, al > 0.01)
    x0, y0, x1, y1 = BOX
    # rgb outside the foil is the scan's own (never seen: alpha 0 there, so the card image shows; a plate copy of the Pokemon or the
    # frame, resampled differently from the <img>, read as dark specks along its fine lines)
    ink = ink * (al[..., None] > 0) + A * (al[..., None] <= 0)
    rgba = np.concatenate([ink, al[..., None]], -1)[y0:y1, x0:x1]
    # pale or green-yellow art lights warm gold and white chips (Snivy, Servine, Purrloin in hand): the warm chip tile
    m = A[(al > 0.5)].mean(0)
    warm = bool(m[2] < m[1] - 0.05 and float(m @ np.array([0.299, 0.587, 0.114])) > 0.4)
    return cid, rgba, how + (", warm chips" if warm else "") + f", window {rect}", float(poke[win].mean()), warm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    ap.add_argument("--qa", default="")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    ids = args.ids.split(",") if args.ids else BW
    tiles = []
    warm = []
    for cid in ids:
        cid, rgba, how, share, w = build(cid)
        if w:
            warm.append(cid)
        print(f"{cid:9s} pokemon {share:.2f}  {how}", flush=True)
        if not args.no_write:
            Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(
                f"{OUT}/{cid}-plate-v3.webp", quality=92, alpha_quality=100, method=6)
            Image.fromarray(((1 - np.clip(rgba[..., 3], 0, 1)) * 255 + 0.5).astype(np.uint8), "L").save(
                f"{OUT}/{cid}-matte-v3.png", optimize=True)
        if args.qa:
            x0, y0, x1, y1 = BOX
            A = v1.load(cid)[y0:y1, x0:x1]
            al = rgba[..., 3:4]
            comp = rgba[..., :3] * al + A * (1 - al)
            mag = A * 0.45 + np.array([1, 0, 1]) * 0.55
            tiles.append((np.concatenate([np.clip(comp, 0, 1), al * A * 0.5 + (1 - al) * mag, A], 1) * 255).astype(np.uint8))
    if args.qa and tiles:
        Image.fromarray(np.concatenate(tiles, 0)).save(args.qa, quality=88)
    if not args.ids and not args.no_write:  # the warm-palette cards, for js/fam/mcd-promos.js
        p = os.path.join(ROOT, "js/fam/mcd-promos.js")
        src = open(p).read()
        table = "const WARM = new Set(" + json.dumps(warm, separators=(",", ":")) + ");"
        src = re.sub(r"// WARM-BEGIN.*?// WARM-END", "// WARM-BEGIN\n" + table + "\n// WARM-END", src, flags=re.S)
        open(p, "w").write(src)


if __name__ == "__main__":
    main()
