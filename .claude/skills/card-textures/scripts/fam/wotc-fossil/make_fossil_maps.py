#!/usr/bin/env python3
"""Draw the Fossil (base3) holo foil maps: where each card's foil shows, and its own stars.

Family wotc-fossil (older-era holo remaster, 2026-10-02; the research is in /mnt/project-files/holo-remaster/wotc-fossil/).
A Fossil Rare Holo is ink printed over the same 1999 Starlight holofoil as Jungle and Base Set: the art window's BACKGROUND
is translucent ink over the foil, so it flashes and glitters under a lamp, while the Pokémon is printed over an opaque white
underlay and stays matte; so do the frame, the text and the evolution badge. Dark ink (Muk's black, Moltres' black hole)
blocks the foil by itself once the CSS applies it as a colour-dodge gain on the print, so the maps need no special case for it.
TCG Live published no maps for 1999, so every map is drawn from the card's own scan (assets/cards/base3/<n>.webp, 600 x 838):

  1. The art window is measured on each scan (the same step-detector as Jungle's generator; it falls back to the nominal
     WotC window when a measurement is more than 6 px off).
  2. Stage 1 and Stage 2 cards (1, 4, 5, 6, 8, 9, 11, 13, 14) print the evolution badge over the window's top-left corner.
     Its shape is voted from every Stage scan of base1-base3, slid onto each card by template matching (+-6 px) and
     grown 2 px.
  3. The Pokémon silhouette is a hand-guided cut of the scan, the same recipe for all fifteen (hints in HINTS below):
       - a rough mask: an outline polygon drawn by hand over the 2x window crop (1, 4, 5), a GrabCut from a polygon (3), or a
         luminance threshold of the scan's blurred channels (2, 6-15; `auto`: thr, open, mode, keep), with `iadd` / `ihole`
         polygons to repair it;
       - `markers()` turns it into sure-Pokémon (its core, `band` px eroded, plus hand `ifgline` strokes) and sure-background
         seeds (outside the mask grown by `band`, outside the window, and `ibgpoly` polygons);
       - a watershed (default) or a ridge-barrier flood fill (`"method": "ridge"`, Dragonite) on a barrier image made from the
         scan's ridge response (the thin dark ink outline) and colour gradient decides the edge; dark outline pixels touching
         the Pokémon are taken in, small holes filled.
     The cut is grown 1 px so the black outline stays matte, and the foil edge is feathered under 1 px.
  4. The foil (`bg`): the window less the Pokémon (grown 1 px) less the badge. The stars: the scan already shows this
     copy's foil (its four-point stars and the soft smears the scanner lamp drew), so the brightest channel's top-hat over a
     9 px median, on the background only, is the card's own sparkle; a soft bloom (Gaussian, 2.5 px) is added so a lit star
     flares past its printed size.
  5. The glitter is Jungle's (same foil): glitter-a-v1.webp and glitter-b-v1.webp are copied byte for byte from
     assets/foil/fam/wotc-jungle/ (--write does it; there is nothing to draw).

Outputs (assets are cached for a year: once shipped, a change is a new -vN name):
  assets/foil/fam/wotc-fossil/<n>-bg-v1.webp      600 x 838, white, ALPHA = foil (the window background), lossless
  assets/foil/fam/wotc-fossil/<n>-stars-v1.webp   600 x 838, white, ALPHA = the scan's stars and sparkle plus bloom
  assets/foil/fam/wotc-fossil/glitter-a-v1.webp   copied from Jungle's, as is
  assets/foil/fam/wotc-fossil/glitter-b-v1.webp   the other half

  python3 .claude/skills/card-textures/scripts/fam/wotc-fossil/make_fossil_maps.py --preview DIR [--only 4,12] [--write]

Without --write it only writes the previews (DIR/<n>-cut.png: background tinted, the Pokémon's matte edge in green;
DIR/sheet.png: all cards on one sheet). Seeded (cv2.setRNGSeed), so a re-run draws the same maps.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-fossil"
JUNGLE = ROOT / "assets" / "foil" / "fam" / "wotc-jungle"
SET = "base3"
W, H = 600, 838
NOMINAL = (62, 95, 538, 429)  # x0, y0, x1, y1 (exclusive) of the window: the shared WotC window (assets/foil/wotc-win)
X0, Y0, X1, Y1 = 61, 94, 539, 430  # the shared window's box with a 1 px margin: the hand outlines (2x crop coords) are in it
VERSION = 1
WIN_SOFT = np.asarray(Image.open(ROOT / "assets" / "foil" / "wotc-win" / "pokemon-v1.webp"))[..., 3].astype(np.float32) / 255
WIN_IN = WIN_SOFT > 0.5

# Per-card cut hints. Coordinates marked i* (ipoly, ifgline, ibgpoly, iadd, ihole) are in 2x pixels of the window crop
# (card px = x / 2 + (61, 94)); `poly` (the GrabCut outline of card 3) is in card px.
HINTS: dict = json.loads("""
{"1": {"method": "ws", "ipoly": [[[0, 0], [162, 0], [216, 27], [259, 32], [297, 49], [346, 76], [389, 97], [427,
114], [449, 116], [465, 92], [470, 59], [486, 40], [510, 8], [530, 0], [543, 0], [545, 40], [597, 30], [650, 55],
[705, 86], [726, 51], [775, 6], [800, 8], [830, 20], [870, 35], [900, 40], [956, 45], [956, 146], [915, 178], [867,
227], [824, 259], [810, 276], [791, 284], [780, 320], [775, 350], [783, 375], [802, 414], [818, 462], [815, 505],
[764, 530], [737, 511], [710, 484], [672, 500], [591, 538], [510, 560], [500, 590], [480, 625], [440, 648], [378,
657], [303, 625], [259, 576], [254, 538], [178, 517], [108, 479], [89, 487], [41, 360], [162, 427], [120, 445],
[140, 460], [160, 474], [178, 463], [184, 430], [205, 403], [243, 387], [254, 371], [249, 322], [276, 303], [303,
281], [324, 270], [314, 254], [319, 227], [346, 205], [314, 189], [270, 184], [216, 186], [162, 200], [135, 216],
[97, 178], [54, 135], [0, 103]]], "ifgline": [[[[60, 380], [110, 430], [178, 500], [254, 523]], 10]], "ibgpoly":
[[[583, 373], [627, 400], [600, 447], [550, 477], [520, 487], [540, 443], [577, 420]], {"poly": [[183, 450], [205,
445], [212, 470], [200, 488], [185, 478]], "band": 3}, {"poly": [[233, 475], [260, 470], [265, 495], [240, 502]],
"band": 3}]}, "2": {"band": 4, "ibgpoly": [{"poly": [[606, 445], [680, 447], [662, 488], [625, 525], [606, 525]],
"band": 4}], "auto": {"thr": 0.45, "open": 2}}, "3": {"band": 5, "grabcut": {"poly": [[[141, 149], [143, 137], [153,
127], [168, 125], [186, 131], [206, 149], [226, 161], [241, 169], [251, 168], [276, 156], [296, 151], [316, 156],
[331, 174], [351, 179], [371, 174], [391, 176], [411, 189], [431, 204], [446, 224], [456, 244], [471, 274], [486,
304], [496, 334], [506, 364], [509, 384], [501, 394], [461, 397], [361, 395], [261, 395], [161, 395], [111, 393],
[101, 384], [108, 364], [121, 329], [136, 294], [143, 259], [146, 219], [143, 179]]], "band": 6}}, "4": {"ipoly":
[[[135, 415], [132, 360], [150, 300], [180, 255], [215, 220], [255, 190], [285, 165], [320, 175], [360, 160], [400,
150], [420, 125], [470, 118], [520, 125], [548, 155], [560, 200], [565, 240], [590, 270], [592, 310], [605, 370],
[615, 410], [700, 420], [710, 460], [650, 478], [700, 485], [760, 505], [808, 535], [818, 575], [802, 608], [760,
625], [715, 635], [680, 628], [620, 615], [580, 625], [560, 645], [250, 645], [225, 610], [235, 540], [265, 480],
[290, 430], [285, 380], [240, 370], [175, 395]]], "ifgline": [[[[440, 135], [400, 105], [350, 72], [300, 50], [272,
52], [262, 68]], 8], [[[468, 128], [468, 90], [472, 58], [486, 38]], 8]], "ibgpoly": [[[662, 568], [700, 563], [712,
583], [695, 598], [664, 596]]], "method": "ridge"}, "5": {"ipoly": [[[287, 0], [328, 58], [374, 97], [380, 60],
[386, 50], [393, 58], [397, 97], [451, 87], [503, 97], [528, 106], [736, 4], [740, 8], [705, 70], [690, 110], [672,
130], [690, 155], [672, 175], [697, 180], [678, 212], [700, 225], [682, 245], [705, 252], [692, 270], [710, 284],
[702, 300], [700, 394], [682, 488], [668, 550], [643, 594], [617, 605], [611, 650], [598, 672], [572, 672], [545,
620], [520, 572], [460, 558], [399, 540], [386, 550], [333, 566], [324, 519], [302, 487], [275, 453], [230, 450],
[222, 400], [224, 362], [238, 329], [251, 277], [277, 213], [282, 110], [283, 0]]], "ibgpoly": [[[280, 460], [294,
458], [298, 488], [284, 490]]]}, "6": {"band": 3, "auto": {"thr": 0.3, "open": 2}}, "7": {"band": 3, "ibgpoly":
[{"poly": [[497, 50], [528, 50], [530, 84], [500, 86]], "band": 3}, {"poly": [[700, 632], [722, 632], [722, 650],
[700, 650]], "band": 3}, {"poly": [[470, 60], [497, 60], [497, 84], [470, 84]], "band": 3}, {"poly": [[536, 48],
[562, 48], [562, 78], [536, 78]], "band": 3}, {"poly": [[600, 60], [620, 60], [620, 76], [600, 76]], "band": 2},
{"poly": [[462, 74], [497, 74], [497, 88], [462, 88]], "band": 2}], "auto": {"thr": 0.36, "open": 2}}, "8": {"band":
3, "ibgpoly": [{"poly": [[590, 335], [640, 335], [640, 385], [595, 385]], "band": 4}, {"poly": [[625, 60], [660,
60], [660, 92], [625, 92]], "band": 2}, {"poly": [[325, 350], [355, 350], [370, 400], [360, 440], [330, 440]],
"band": 4}], "auto": {"thr": 0.36, "open": 2}}, "9": {"band": 3, "ibgpoly": [{"poly": [[492, 70], [522, 70], [528,
108], [490, 110]], "band": 2}, {"poly": [[655, 436], [690, 446], [715, 452], [712, 465], [680, 462], [655, 450]],
"band": 2}, {"poly": [[214, 446], [228, 444], [232, 470], [216, 472]], "band": 2}], "auto": {"thr": 0.33, "open":
2}}, "10": {"band": 3, "auto": {"thr": 0.4, "open": 2}}, "11": {"band": 4, "iadd": [[[67, 210], [187, 210], [220,
230], [227, 273], [220, 320], [193, 337], [67, 337], [67, 293], [178, 290], [183, 265], [172, 257], [67, 257]],
[[465, 35], [495, 33], [511, 51], [526, 97], [536, 155], [538, 212], [530, 251], [511, 257], [488, 247], [482, 166],
[486, 97], [467, 95]], [[295, 548], [323, 503], [353, 477], [377, 470], [410, 477], [430, 500], [437, 530], [427,
567], [410, 597], [397, 620], [380, 627], [350, 613], [357, 593], [380, 580], [390, 563], [397, 540], [393, 523],
[380, 517], [367, 527], [353, 547], [333, 577], [323, 577], [300, 560]], [[577, 459], [607, 443], [638, 440], [666,
459], [707, 474], [710, 527], [685, 534], [663, 527], [641, 502], [622, 487], [613, 493], [616, 515], [641, 540],
[679, 549], [682, 596], [654, 599], [632, 584], [597, 543], [579, 502]]], "ibgpoly": [{"poly": [[448, 110], [470,
110], [472, 160], [452, 160]], "band": 3}, {"poly": [[80, 265], [170, 265], [170, 285], [80, 285]], "band": 3},
{"poly": [[378, 528], [388, 532], [366, 585], [358, 580]], "band": 2}, {"poly": [[625, 497], [640, 505], [655, 525],
[640, 530], [625, 515]], "band": 2}, {"poly": [[642, 58], [660, 58], [660, 74], [642, 74]], "band": 2}, {"poly":
[[310, 392], [328, 392], [328, 418], [310, 418]], "band": 2}], "auto": {"thr": 0.36, "open": 2}}, "12": {"band": 3,
"auto": {"thr": 0.4, "open": 2, "keep": 2}}, "13": {"band": 3, "auto": {"thr": 0.3, "open": 2}}, "14": {"band": 3,
"iadd": [[[740, 0], [695, 18], [640, 55], [600, 100], [575, 140], [562, 185], [565, 200], [600, 198], [645, 185],
[690, 175], [725, 170], [755, 183], [775, 205], [778, 225], [762, 236], [742, 230], [730, 212], [705, 180], [690,
150], [688, 120], [700, 80], [722, 30], [745, 2]], [[442, 32], [415, 55], [385, 100], [365, 150], [362, 190], [375,
220], [400, 200], [415, 180], [410, 135], [420, 90], [445, 35]], [[692, 408], [751, 385], [815, 370], [869, 363],
[901, 367], [915, 385], [910, 417], [887, 458], [851, 499], [805, 535], [751, 567], [696, 590], [633, 608], [578,
617], [560, 620], [560, 600], [642, 585], [683, 572], [733, 549], [787, 522], [833, 490], [869, 458], [892, 426],
[896, 399], [887, 388], [855, 390], [815, 399], [765, 417], [719, 445], [687, 476]]], "ibgpoly": [{"poly": [[730,
470], [790, 430], [850, 410], [870, 420], [850, 455], [800, 490], [740, 520], [700, 530], [700, 500]], "band": 3}],
"auto": {"thr": 0.42, "open": 2}}, "15": {"band": 3, "auto": {"thr": 0.38, "open": 1, "mode": "light_or_warm"}}}
""")


def load(n: int | str) -> np.ndarray:
    return np.asarray(Image.open(ROOT / "assets" / "cards" / SET / f"{n}.webp").convert("RGB"))


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
    diff = (np.abs(S - med).max(-1) > 28).mean(0)
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


# ---- the Pokémon cut -----------------------------------------------------------------------------------------------------

def img2card(p):
    return [[x / 2 + X0, y / 2 + Y0] for x, y in p]


def polymask(polys) -> np.ndarray:
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([tuple(map(float, q)) for q in p], fill=255)
    return np.asarray(im) > 127


def linemask(lines) -> np.ndarray:
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for pts, wd in lines:
        d.line([tuple(q) for q in img2card(pts)], fill=255, width=max(1, int(round(wd / 2))), joint="curve")
    return np.asarray(im) > 127


def auto_mask(rgb: np.ndarray, p: dict) -> np.ndarray:
    """Rough mask by threshold: the blurred luminance (or, `light_or_warm`, luminance or a warm hue), opened, the biggest
    `keep` blobs, closed and filled."""
    f = rgb.astype(np.float32) / 255
    thr, op = p["thr"], p.get("open", 2)
    L = ndi.gaussian_filter(f.mean(2), 0.8)
    G, B = ndi.gaussian_filter(f[..., 1], 0.8), ndi.gaussian_filter(f[..., 2], 0.8)
    m = (L > thr) | ((G - B > -0.03) & (L > 0.08)) if p.get("mode") == "light_or_warm" else (L > thr)
    m &= WIN_IN
    yy, xx = np.mgrid[-op: op + 1, -op: op + 1]
    disk = (xx * xx + yy * yy) <= op * op + 0.5
    m = ndi.binary_opening(m, structure=disk)
    lab, k = ndi.label(m)
    sz = ndi.sum(m, lab, range(1, k + 1))
    keep = np.zeros(k + 1, bool)
    keep[1 + np.argsort(sz)[::-1][: p.get("keep", 1)]] = True
    m = keep[lab]
    m = ndi.binary_closing(m, structure=disk, iterations=1)
    return ndi.binary_fill_holes(m)


def grabcut_mask(rgb: np.ndarray, g: dict, band: int = 6) -> np.ndarray:
    """Card 3 (Ditto, a soft blob on a checkered sky): GrabCut seeded by the outline polygon."""
    P = polymask(g["poly"])
    m = np.full((H, W), cv2.GC_PR_BGD, np.uint8)
    m[P] = cv2.GC_PR_FGD
    m[ndi.binary_erosion(P, iterations=band)] = cv2.GC_FGD
    m[~ndi.binary_dilation(P, iterations=band)] = cv2.GC_BGD
    sub = m[Y0 - 4: Y1 + 4, X0 - 4: X1 + 4].copy()
    crop = np.ascontiguousarray(cv2.cvtColor(rgb[Y0 - 4: Y1 + 4, X0 - 4: X1 + 4], cv2.COLOR_RGB2BGR))
    bgm, fgm = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.setRNGSeed(7)
    cv2.grabCut(crop, sub, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
    sil = np.zeros((H, W), bool)
    sil[Y0 - 4: Y1 + 4, X0 - 4: X1 + 4] = (sub == cv2.GC_FGD) | (sub == cv2.GC_PR_FGD)
    sil = ndi.binary_opening(sil, iterations=1)
    lab, k = ndi.label(sil)
    if k:
        sizes = ndi.sum(sil, lab, range(1, k + 1))
        sil = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 60])
    holes = ndi.binary_fill_holes(sil) & ~sil
    lab, k = ndi.label(holes)
    for i in range(1, k + 1):
        if (lab == i).sum() < 400:
            sil |= lab == i
    return sil


def ridge(g: np.ndarray) -> np.ndarray:
    R = 0
    for s in (0.9, 1.4):
        Ixx = ndi.gaussian_filter(g, s, order=(0, 2))
        Iyy = ndi.gaussian_filter(g, s, order=(2, 0))
        Ixy = ndi.gaussian_filter(g, s, order=(1, 1))
        l1 = (Ixx + Iyy) / 2 + np.sqrt(((Ixx - Iyy) / 2) ** 2 + Ixy ** 2)
        R = np.maximum(R, np.clip(l1, 0, None) * s * s)
    return R


def gradmag(rgb: np.ndarray, s: float = 1.0) -> np.ndarray:
    G = 0
    for c in range(3):
        gx = ndi.gaussian_filter(rgb[..., c], s, order=(0, 1))
        gy = ndi.gaussian_filter(rgb[..., c], s, order=(1, 0))
        G = G + gx * gx + gy * gy
    return np.sqrt(G)


def markers(rgb: np.ndarray, hint: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    band = hint.get("band", 12)
    P = polymask([img2card(p) for p in hint.get("ipoly", [])])
    if "auto" in hint:
        P |= auto_mask(rgb, hint["auto"])
    if "grabcut" in hint:
        P |= grabcut_mask(rgb, hint["grabcut"])
    if hint.get("iadd"):
        P |= polymask([img2card(p) for p in hint["iadd"]])
    if hint.get("ihole"):
        P &= ~polymask([img2card(p) for p in hint["ihole"]])
    lines = hint.get("ifgline", [])
    L = linemask(lines) if lines else np.zeros((H, W), bool)
    sureF = ndi.binary_erosion(P, iterations=band) | L
    if hint.get("ifgpoly"):
        sureF |= polymask([img2card(p) for p in hint["ifgpoly"]])
    Pl = P | (ndi.binary_dilation(L, iterations=6) if lines else False)
    sureB = ~ndi.binary_dilation(Pl, iterations=band)
    sureB |= ~WIN_IN
    sureB &= ~sureF
    for e in hint.get("ibgpoly", []):
        poly, gb = (e["poly"], e["band"]) if isinstance(e, dict) else (e, hint.get("gapband", band))
        IB = polymask([img2card(poly)])
        sureB |= IB
        sureF &= ~(ndi.binary_dilation(IB, iterations=gb) if gb > 0 else IB)
    return P, sureF, sureB


def pokemon(rgb8: np.ndarray, hint: dict) -> np.ndarray:
    """The Pokémon's silhouette (card px, bool): seeds from `markers`, then watershed or ridge-barrier flood fill."""
    rgb = rgb8.astype(np.float32) / 255
    g = rgb.mean(2)
    P, sureF, sureB = markers(rgb8, hint)
    R, Gm = ridge(g), gradmag(rgb)
    Rn = R / np.percentile(R[WIN_IN], 99)
    Gn = Gm / np.percentile(Gm[WIN_IN], 99)
    B8 = np.clip(np.maximum(hint.get("wr", 1.0) * Rn, hint.get("wg", 1.0) * Gn) * 200, 0, 255).astype(np.uint8)
    loc = ndi.gaussian_filter(g, 3)
    if hint.get("method", "ws") == "ridge":
        thr = np.percentile(R[WIN_IN], hint.get("ridge_pct2", 92))
        barrier = (R > thr) & (g < loc - hint.get("dark", 0.01))
        barrier = ndi.binary_closing(barrier, structure=np.ones((2, 2)))
        region = ~sureF & ~sureB
        bg = ndi.binary_propagation(sureB, mask=sureB | (region & ~barrier))
        fg = ndi.binary_propagation(sureF, mask=sureF | (region & ~bg))
    else:
        mk = np.zeros((H, W), np.int16)
        mk[sureB] = 1
        mk[sureF] = 2
        fg = ndi.watershed_ift(B8, mk) == 2
    # dark outline pixels touching the Pokémon belong to it (the ink line is printed with it)
    line = (R > np.percentile(R[WIN_IN], hint.get("ridge_pct", 90))) & (g < loc - 0.01)
    for _ in range(hint.get("grow", 2)):
        fg |= ndi.binary_dilation(fg) & line & ~sureB
    holes = ndi.binary_fill_holes(fg) & ~fg
    hl, k = ndi.label(holes)
    if k:
        for i, s in enumerate(ndi.sum(holes, hl, range(1, k + 1)), 1):
            if s < hint.get("maxhole", 300):
                fg |= hl == i
    fg = ndi.binary_opening(fg, structure=np.ones((2, 2))) | sureF
    return fg & WIN_IN


def soft(mask: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)


def stars_alpha(rgb: np.ndarray, open_bg: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """The scan's own sparkle on the background: top-hat of the brightest channel over a 9 px median, plus a bloom.

    Only 3 px or more inside the background (`open_bg`), so the window line and the Pokémon's pale rim never count, and
    only where the sparkle is light rather than ink-coloured (min / max channel): a star or a scanner smear is white,
    pale or sky-tinted; an orange flame wisp is ink, not foil light."""
    f = rgb.astype(np.float32)
    mx = rgb.max(-1).astype(np.uint8)
    th = np.clip(mx.astype(np.float32) - cv2.medianBlur(mx, 9).astype(np.float32), 0, None)
    blur = cv2.GaussianBlur(f, (0, 0), 0.8)
    pale = np.clip((blur.min(-1) / np.maximum(blur.max(-1), 1.0) - 0.15) / 0.30, 0, 1)
    core = np.clip((th - 10.0) / 60.0, 0, 1) ** 0.85 * np.clip(mx / 255.0 * 1.4, 0, 1) * pale
    core *= ndi.binary_erosion(open_bg, iterations=3)
    bloom = cv2.GaussianBlur(core, (0, 0), 2.5) * 2.2
    return np.clip(np.maximum(core, np.minimum(bloom, 0.55)), 0, 1) * bg


def save_alpha(path: Path, alpha: np.ndarray) -> None:
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    rgba = np.dstack([np.full_like(a, 255)] * 3 + [a])
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6, exact=False)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write the cut overlays and a contact sheet here")
    ap.add_argument("--only", help="comma-separated card numbers (default 1-15)")
    ap.add_argument("--write", action="store_true", help="write the maps into assets/foil/fam/wotc-fossil/")
    ap.add_argument("--version", type=int, default=VERSION)
    args = ap.parse_args()
    nums = [int(x) for x in args.only.split(",")] if args.only else list(range(1, 16))
    cards = {c["id"]: c for c in json.load(open(ROOT / "data" / f"{SET}.json"))}
    badge, med, agree = badge_template()
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
    if args.write:
        OUT.mkdir(parents=True, exist_ok=True)
    tiles = []
    for n in nums:
        card = cards[f"{SET}-{n}"]
        rgb = load(n)
        x0, y0, x1, y1 = window(rgb)
        win = np.zeros((H, W), bool)
        win[y0:y1, x0:x1] = True
        region = win.copy()
        shift = (0, 0)
        if stage_of(card):
            placed, shift = place_badge(rgb, badge, med, agree)
            region &= ~ndi.binary_dilation(placed, iterations=2)
        sil = pokemon(rgb, HINTS[str(n)]) & win
        matte = ndi.binary_dilation(sil, iterations=1)  # the black outline and the underlay's halo stay matte
        bg = np.clip(soft(region & ~matte, 0.8) * soft(win, 0.5), 0, 1)
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
            tiles.append(Image.fromarray(ov[60:440, 40:560].astype(np.uint8)))
    if args.write:
        for half in ("a", "b"):  # the glitter is Jungle's: same foil, same streaks
            shutil.copyfile(JUNGLE / f"glitter-{half}-v{args.version}.webp", OUT / f"glitter-{half}-v{args.version}.webp")
    if args.preview and tiles:
        tw, th = tiles[0].size
        cols = 3
        sheet = Image.new("RGB", (tw * cols, th * ((len(tiles) + cols - 1) // cols)), "white")
        for i, t in enumerate(tiles):
            ImageDraw.Draw(t).text((6, 6), f"{nums[i]} {cards[f'{SET}-{nums[i]}']['name']}", fill=(255, 255, 0))
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(args.preview / "sheet.png")


if __name__ == "__main__":
    main()
