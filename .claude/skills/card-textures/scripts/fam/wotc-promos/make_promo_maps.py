#!/usr/bin/env python3
"""Holo family wotc-promos: draw every mask the family's sheet uses, from the site's own scans.

Run from the repo root:  python3 .claude/skills/card-textures/scripts/fam/wotc-promos/make_promo_maps.py [--only id,id] [--check DIR]

Reads assets/cards/{basep,bp,si1}/*.webp (600x838 RGBA scans of the real foil cards) and writes 600x838 RGBA WebP masks,
white with the mask in the alpha channel (lossless), into assets/foil/fam/wotc-promos/:

  field-<id>.webp  Cosmos window holo (basep 9, 10, 11, 13, 15, 17, 24): the art window inside its bevel, minus the
                   Pokemon (printed over a white underlay, matte on the real card) and minus the Stage box printed over
                   the window's top-left corner. The Pokemon is cut by colour: the window is clustered into 14 colours
                   (k-means in Lab on a 7 px median, seed 7), the clusters listed in HINTS[id]["keep"] that touch the
                   seed points are the figure, holes up to HINTS[id]["maxhole"] px are filled, and the hand polygons
                   in "add"/"sub" fix what colour cannot tell (ear tips, the birthday table, gaps between candles).
                   Mew's thin tail is grown from the pale pixels of the raw scan ("grow").
  body-<id>.webp   Cosmos reverse (basep 34, 35; bp 1, 2, 3, 8, 9; si1 1, 4, 7, 11, 14, 17): the card face inside
                   the yellow border minus the art window with its bevel, the info banner and every large printed gold
                   or tan block (baby rule box, TRAINER header, evolution circle, Rocket emblem, the stage tag), found
                   as connected gold/tan regions over 900 px (holes filled), plus the per-card boxes in REV[id]["cut"].
  tint-<id>.webp   The reverse body where the scan shows bare foil or black ink (what the type tint may recolour): the
                   body minus saturated colour ink (red text, Energy symbols, coloured cosmos dots) whose hue is more
                   than 38 degrees from the body's median hue.
  dots-<id>.webp   The cosmos pattern the scanner froze: white top-hat of the scan's brightest channel (radius 3 and 8),
                   kept inside the field/body, components over 450 px dropped (Energy symbols), normalised to the 99.5th
                   percentile with a soft floor. Every card has its own, so no two cards share a pattern and nothing tiles.
  stamp-<id>.webp  First Movie stamp (basep 2-5): the gold lettering's strokes read from basep05's flat blue sky
                   (dark strokes 18+ levels under a 15 px median), "POKeMON" outlined with its counters left open (the art
                   shows through on the real card), aligned to each card by gradient cross-correlation within +-6 px.
                   Winner stamp (bp 8, 9): the pale letters and star inside the box in WINNER[id].

Every edge is feathered by a 0.8 px Gaussian. Deterministic: no random numbers beyond OpenCV's seeded k-means
(cv2.setRNGSeed(7); written with OpenCV 5.0.0, NumPy 2.4, SciPy 1.17, Pillow 12.3). --check DIR writes overlays
(<id>-check.png) for review. Writes nothing else.
"""
import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
CARDS = os.path.join(ROOT, "assets", "cards")
OUT = os.path.join(ROOT, "assets", "foil", "fam", "wotc-promos")
W, H = 600, 838

# ---------------------------------------------------------------------------------------------------------------------
# Cosmos window holos: segmentation hints (card coordinates, 600x838). Window = the art's inner edge (the bevel stops
# there; WotC holo foil is the art box only).
HOLO = ["basep-basep09", "basep-basep10", "basep-basep11", "basep-basep13", "basep-basep15", "basep-basep17", "basep-basep24"]
WIN_PRIOR = (63, 97, 538, 429)
HINTS = {
    "basep-basep09": {  # Mew: pale figure, thin tail grown from the raw scan's pale pixels
        "keep": [10, 11, 12], "seeds": [[300, 250], [310, 360], [470, 400], [150, 170]], "grow": {"L": 140, "S": 120},
        "maxhole": 600,
        "sub": [[[322, 132], [345, 132], [345, 158], [322, 158]], [[236, 278], [256, 278], [256, 297], [236, 297]]],
    },
    "basep-basep10": {"keep": [0, 2, 5, 8, 9, 10, 11, 12, 13], "seeds": [[330, 330], [250, 300], [200, 200]]},
    "basep-basep11": {"keep": [0, 6, 8, 9, 10, 11, 12, 13], "seeds": [[200, 300], [440, 320]]},
    "basep-basep13": {  # Venusaur + the Stage 2 box over the window's corner
        "keep": [5, 6, 7, 8, 9, 10, 11, 12, 13], "seeds": [[300, 380], [330, 190], [80, 110]],
        "add": [[[64, 96], [141, 96], [136, 101], [130, 108], [125, 114], [118, 121], [110, 125], [104, 130], [97, 137],
                 [91, 145], [85, 146], [80, 139], [74, 140], [68, 142], [64, 142]]],
    },
    "basep-basep15": {"keep": [5, 8, 9, 10, 11, 13], "seeds": [[250, 180], [420, 380], [300, 330]]},
    "basep-basep17": {  # Dark Persian + the Stage 1 box, the dark ears by hand
        "keep": [9, 10, 11, 12, 13], "seeds": [[220, 380], [330, 210], [80, 110]],
        "add": [[[65, 98], [137, 98], [133, 103], [128, 110], [122, 117], [114, 123], [108, 128], [102, 135], [97, 141],
                 [92, 148], [86, 148], [80, 141], [73, 142], [65, 141]],
                [[227, 170], [226, 140], [230, 118], [240, 108], [250, 106], [260, 112], [268, 124], [276, 138],
                 [262, 150], [245, 156], [232, 166]],
                [[317, 142], [327, 127], [338, 118], [348, 117], [357, 124], [360, 138], [358, 160], [351, 177],
                 [340, 177], [328, 160]]],
    },
    "basep-basep24": {  # _____'s Pikachu: ear tips and the birthday table by hand, the gap between candles 1 and 2 is sky
        "keep": [6, 7, 9, 10, 11, 12, 13], "seeds": [[420, 300], [200, 400], [300, 400]],
        "add": [[[261, 146], [270, 144], [281, 151], [291, 162], [286, 176], [278, 181], [271, 179], [265, 166], [261, 155]],
                [[461, 160], [480, 147], [495, 137], [501, 139], [498, 155], [491, 173], [483, 186], [475, 191],
                 [467, 186], [462, 175]],
                [[64, 383], [95, 381], [150, 378], [250, 374], [300, 369], [366, 366], [370, 429], [64, 429]],
                [[498, 398], [538, 396], [538, 429], [500, 429]]],
        "sub": [[[166, 250], [189, 250], [189, 297], [166, 297]]],
    },
}

# ---------------------------------------------------------------------------------------------------------------------
# Cosmos reverses: window prior (art inner edge) and extra cuts (x0, y0, x1, y1 boxes, inclusive) per card.
REV = {
    "basep-basep34": {"scan": "basep/basep34", "win": (62, 96, 539, 429), "cut": []},
    "basep-basep35": {"scan": "basep/basep35", "win": (63, 96, 539, 429), "cut": []},
    "bp-bp01": {"scan": "bp/bp01", "win": (64, 93, 535, 426), "cut": []},
    "bp-bp02": {"scan": "bp/bp02", "win": (64, 93, 535, 426), "cut": []},
    "bp-bp03": {"scan": "bp/bp03", "win": (57, 193, 503, 469), "cut": [], "trainer": True},
    "bp-bp08": {"scan": "bp/bp08", "win": (57, 101, 542, 372), "cut": [(72, 379, 533, 411), (410, 696, 558, 806)]},
    "bp-bp09": {"scan": "bp/bp09", "win": (64, 93, 535, 426), "cut": [(410, 696, 558, 806)]},
    "si1-1": {"scan": "si1/1", "win": (63, 97, 539, 432), "cut": []},
    "si1-4": {"scan": "si1/4", "win": (63, 97, 539, 432), "cut": []},
    "si1-7": {"scan": "si1/7", "win": (63, 97, 539, 432), "cut": []},
    "si1-11": {"scan": "si1/11", "win": (63, 97, 539, 432), "cut": []},
    "si1-14": {"scan": "si1/14", "win": (63, 97, 539, 432), "cut": [], "circle": (56, 80, 41)},
    "si1-17": {"scan": "si1/17", "win": (63, 97, 539, 432), "cut": [], "circle": (56, 80, 41)},
}

STAMPS = ["basep-basep02", "basep-basep03", "basep-basep04", "basep-basep05"]
STAMP_ZONE = (364, 98, 526, 204)
# Dragonite's horn crosses "The First Movie" on basep05: its outline is not the stamp; the strokes under it come from basep03.
HORN = [[456, 150], [474, 155], [476, 206], [420, 206], [436, 182]]
WING = [[355, 180], [381, 194], [384, 206], [355, 206]]  # Dragonite's wing outline, left of "The"
# Winner stamp: the box that holds the word and its star (card coordinates).
WINNER = {"bp-bp08": (398, 308, 540, 362), "bp-bp09": (396, 380, 530, 428)}


def scan_path(cid):
    if cid in REV:
        return os.path.join(CARDS, REV[cid]["scan"] + ".webp")
    s, n = cid.split("-", 1)
    return os.path.join(CARDS, s, n + ".webp")


def load(cid):
    rgba = np.asarray(Image.open(scan_path(cid)).convert("RGBA"))
    assert rgba.shape[:2] == (H, W), (cid, rgba.shape)
    return rgba[..., :3].copy(), rgba[..., 3].copy()


def poly(pts):
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(im) > 0


def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool)
    m[y0:y1 + 1, x0:x1 + 1] = True
    return m


def feather(mask, sigma=0.8):
    a = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)
    return np.clip(a, 0, 1)


def save(name, alpha):
    a = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    rgba = np.dstack([np.full((H, W), 255, np.uint8)] * 3 + [a])
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, name), lossless=True, quality=100, method=6)


def fill_small(m, maxa):
    if maxa is None:
        return ndi.binary_fill_holes(m)
    holes = ndi.binary_fill_holes(m) & ~m
    cc, nc = ndi.label(holes)
    if nc == 0:
        return m
    sz = ndi.sum(holes, cc, range(1, nc + 1))
    return m | np.isin(cc, 1 + np.where(sz <= maxa)[0])


def lum(rgb):
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)


def edge_at(L, axis, prior, lo, hi, span=6):
    """The straight edge nearest `prior` (+-span) along `axis` ('x' = a vertical line), by the median gradient between lo..hi."""
    best, at = -1, prior
    for p in range(prior - span, prior + span + 1):
        if axis == "x":
            g = np.abs(L[lo:hi, p] - L[lo:hi, p - 1])
        else:
            g = np.abs(L[p, lo:hi] - L[p - 1, lo:hi])
        v = float(np.median(g))
        if v > best:
            best, at = v, p
    return at


def window(rgb, prior):
    """Art window inner edges (x0, y0, x1, y1): the first art pixel on each side."""
    L = cv2.GaussianBlur(lum(rgb), (0, 0), 0.7)
    x0, y0, x1, y1 = prior
    xa = edge_at(L, "x", x0, y0 + 25, y1 - 25)
    xb = edge_at(L, "x", x1 + 1, y0 + 25, y1 - 25) - 1
    ya = edge_at(L, "y", y0, x0 + 25, x1 - 25)
    yb = edge_at(L, "y", y1 + 1, x0 + 25, x1 - 25) - 1
    return xa, ya, xb, yb


# ---------------------------------------------------------------------------------------------------------------------
def holo_field(cid, rgb):
    h = HINTS[cid]
    x0, y0, x1, y1 = window(rgb, WIN_PRIOR)
    win = box(x0, y0, x1, y1)
    med = cv2.medianBlur(rgb, 7)
    lab = cv2.cvtColor(med, cv2.COLOR_RGB2LAB).astype(np.float32)
    # Clustering runs on the fixed prior rectangle so the labels do not move with the detected edges.
    px0, py0, px1, py1 = (64, 98, 538, 429) if cid in ("basep-basep09", "basep-basep17") else (64, 96, 538, 429)
    if cid == "basep-basep17":
        px0, px1 = 65, 537
    sub = lab[py0:py1, px0:px1].reshape(-1, 3)
    cv2.setRNGSeed(7)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
    _, lbl, cent = cv2.kmeans(sub, 14, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    order = np.argsort(cent[:, 0])
    remap = np.zeros(14, int)
    remap[order] = np.arange(14)
    labels = np.full((H, W), -1)
    labels[py0:py1, px0:px1] = remap[lbl.ravel()].reshape(py1 - py0, px1 - px0)

    inner = np.zeros((H, W), bool)
    inner[py0 + 2:py1 - 1, px0 + 2:px1 - 1] = True
    add = np.zeros((H, W), bool)
    cut = np.zeros((H, W), bool)
    for p in h.get("add", []):
        add |= poly(p)
    for p in h.get("sub", []):
        cut |= poly(p)
    cand = (np.isin(labels, h["keep"]) | add) & ~cut & inner
    cand = cv2.morphologyEx(cand.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) > 0
    cand |= add & inner
    if "grow" in h:
        g = h["grow"]
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        lr = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0].astype(int)
        wi = np.zeros((H, W), bool)
        wi[py0 + 5:py1 - 4, px0 + 5:px1 - 4] = True
        cand |= (lr > g["L"]) & (hsv[..., 1].astype(int) < g["S"]) & wi & ~cut
    cc, _ = ndi.label(cand)
    keep = {cc[y, x] for x, y in h["seeds"] if cc[y, x] > 0}
    fig = np.isin(cc, sorted(keep))
    fig = fill_small(fig, h.get("maxhole"))
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
    fig = fill_small(fig, h.get("maxhole"))
    if "grow" not in h:
        fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
    fig = (fig | add) & ~cut
    fig = fill_small(fig, h.get("maxhole")) & ~cut
    cc2, n2 = ndi.label(fig)
    if n2:
        sz = ndi.sum(fig, cc2, range(1, n2 + 1))
        fig = np.isin(cc2, 1 + np.where(sz >= 60)[0])
    # Pokemon edges: the matte underlay covers the outline, so the cut reaches 1 px past the colour edge.
    fig = ndi.binary_dilation(fig, iterations=1)
    field = win & ~fig
    return field, fig, (x0, y0, x1, y1)


def gold_blocks(rgb, inside):
    """Large printed gold/tan/yellow blocks inside the face (banner, rule boxes, header, tags, emblems), holes filled."""
    hsv = cv2.cvtColor(cv2.medianBlur(rgb, 5), cv2.COLOR_RGB2HSV).astype(int)
    hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    gold = (hh >= 8) & (hh <= 38) & (ss >= 45) & (vv >= 110)
    gold &= inside
    gold = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
    cc, n = ndi.label(gold)
    if not n:
        return gold
    sz = ndi.sum(gold, cc, range(1, n + 1))
    big = np.isin(cc, 1 + np.where(sz >= 900)[0])
    return ndi.binary_fill_holes(big)


def rev_maps(cid, rgb, alpha):
    r = REV[cid]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    # The yellow border: saturated yellow connected to the card's outline.
    yellow = (hsv[..., 0] >= 15) & (hsv[..., 0] <= 34) & (hsv[..., 1] >= 150) & (hsv[..., 2] >= 170)
    yellow |= alpha < 128
    seed = np.zeros((H, W), bool)
    seed[[0, -1], :] = True
    seed[:, [0, -1]] = True
    cc, _ = ndi.label(yellow)
    border = np.isin(cc, np.unique(cc[seed & yellow]))
    face = ~border & (alpha >= 250)
    face = ndi.binary_fill_holes(face)
    # keep the main face component only, eroded 1 px off the border
    cc, n = ndi.label(face)
    sz = ndi.sum(face, cc, range(1, n + 1))
    face = cc == 1 + int(np.argmax(sz))
    face = ndi.binary_erosion(face, iterations=1)
    x0, y0, x1, y1 = window(rgb, r["win"])
    if r.get("trainer"):
        win_out = box(x0 - 2, y0 - 2, x1 + 2, y1 + 2)
    else:
        win_out = box(x0 - 14, y0 - 14, x1 + 14, y1 + 14)  # the gold bevel (about 12 px) is printed, not bare foil
    blocks = gold_blocks(rgb, face & ~win_out)
    cut = win_out | blocks
    for b in r["cut"]:
        cut |= box(*b)
    if "circle" in r:  # the evolution circle: a printed portrait in a gold ring
        cx, cy, rad = r["circle"]
        yy, xx = np.mgrid[0:H, 0:W]
        cut |= (xx - cx) ** 2 + (yy - cy) ** 2 <= rad * rad
    body = face & ~cut
    # drop specks of body cut off inside blocks
    cc, n = ndi.label(body)
    if n:
        sz = ndi.sum(body, cc, range(1, n + 1))
        body = np.isin(cc, 1 + np.where(sz >= 400)[0])
    # Tint: where the scan shows bare foil or black ink, not saturated colour ink.
    hue = hsv[..., 0] * 2.0
    sat = hsv[..., 1] / 255.0
    val = hsv[..., 2] / 255.0
    core = body & (val > 0.12) & (val < 0.6) & (sat < 0.75)
    # circular median hue of the body
    ang = np.deg2rad(hue[core])
    mh = np.rad2deg(np.arctan2(np.median(np.sin(ang)), np.median(np.cos(ang)))) % 360
    dh = np.abs(((hue - mh) + 180) % 360 - 180)
    ink = (sat > 0.42) & (val > 0.28) & (dh > 38) & body
    cc, n = ndi.label(ink)
    if n:  # colour ink is text, symbols and dots; a large patch is the scan's own colour cast on bare foil
        sz = ndi.sum(ink, cc, range(1, n + 1))
        ink = np.isin(cc, 1 + np.where(sz <= 1500)[0])
    ink = cv2.dilate(ink.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) > 0
    tint = body & ~ink
    return body, tint, (x0, y0, x1, y1), blocks, mh


def ink_zone(rgb):
    """Printed black ink (card text, rule lines) and 3 px around it: pixels under their 21 px median."""
    v = rgb.max(axis=2).astype(np.float32)
    med = cv2.medianBlur(np.clip(v, 0, 255).astype(np.uint8), 21).astype(np.float32)
    ink = (v < 0.78 * med) & (med > 28)
    return cv2.dilate(ink.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0


def dots(rgb, area, text_guard=False):
    v = rgb.max(axis=2).astype(np.float32)
    v = cv2.GaussianBlur(v, (0, 0), 0.6)
    k1 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    t1 = v - cv2.morphologyEx(v, cv2.MORPH_OPEN, k1)
    t2 = v - cv2.morphologyEx(v, cv2.MORPH_OPEN, k2)
    t = np.maximum(t1, 0.75 * t2)
    t[~area] = 0
    if text_guard:  # reverse faces: the ground between printed letters reads as a top-hat ghost of the text, which a lit layer would fade
        t[ink_zone(rgb)] = 0
    blob = t > 18
    cc, n = ndi.label(blob)
    if n:
        sz = ndi.sum(blob, cc, range(1, n + 1))
        t[np.isin(cc, 1 + np.where(sz > 450)[0])] = 0
        if text_guard:  # a star is a compact blob: the rims of Energy symbols and rule-line fragments are hollow or long
            for i, sl in enumerate(ndi.find_objects(cc), 1):
                h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
                if max(h, w) >= 14 and sz[i - 1] / (h * w) < 0.55:
                    t[sl][cc[sl] == i] = 0
    ref = np.percentile(t[area & (t > 0)], 99.5) if np.any(area & (t > 0)) else 1
    d = np.clip((t / max(ref, 1) - 0.12) / 0.88, 0, 1) ** 0.8
    d = cv2.GaussianBlur(d, (0, 0), 0.6)
    return np.clip(d, 0, 1) * feather(area)


def first_movie_template():
    rgb, _ = load("basep-basep05")
    x0, y0, x1, y1 = STAMP_ZONE
    L = lum(rgb)
    bg = cv2.medianBlur(L.astype(np.uint8), 15).astype(np.float32)
    stroke = (bg - L) > 18
    zone = box(x0, y0, x1, y1)
    # Dragonite's own outline crosses the stamp: keep strokes on the blue sky (the stamp's own pixels), which are bluish.
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    sky = cv2.medianBlur(((hsv[..., 0] >= 95) & (hsv[..., 0] <= 125) & (hsv[..., 1] >= 60)).astype(np.uint8) * 255, 9) > 0
    near_sky = cv2.dilate(sky.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0
    stroke &= zone & near_sky & ~poly(HORN) & ~poly(WING)
    cc, n = ndi.label(stroke)
    if n:
        sz = ndi.sum(stroke, cc, range(1, n + 1))
        stroke = np.isin(cc, 1 + np.where(sz >= 6)[0])
    # patch the strokes the horn hides from basep03 (Mewtwo's pale sky shows the dark lettering)
    rgb3, _ = load("basep-basep03")
    dx, dy = align(stroke, rgb3, STAMP_ZONE)
    L3 = lum(rgb3)
    bg3 = cv2.medianBlur(L3.astype(np.uint8), 15).astype(np.float32)
    s3 = ((bg3 - L3) > 18) & np.roll(np.roll(poly(HORN) & zone, dy, 0), dx, 1)
    stroke |= np.roll(np.roll(s3, -dy, 0), -dx, 1)
    return stroke


def align(template, rgb, zone, span=8):
    """Shift (dx, dy) that best lays `template`'s strokes on the card's own gradient inside `zone`."""
    x0, y0, x1, y1 = zone
    L = cv2.GaussianBlur(lum(rgb), (0, 0), 1.0)
    gx = cv2.Sobel(L, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(L, cv2.CV_32F, 0, 1)
    g = np.hypot(gx, gy)
    tg = cv2.GaussianBlur(template.astype(np.float32), (0, 0), 1.0)
    tgx = cv2.Sobel(tg, cv2.CV_32F, 1, 0)
    tgy = cv2.Sobel(tg, cv2.CV_32F, 0, 1)
    te = np.hypot(tgx, tgy)
    best, at = -1, (0, 0)
    for dy in range(-span, span + 1):
        for dx in range(-span, span + 1):
            sh = np.roll(np.roll(te, dy, 0), dx, 1)
            v = float((sh[y0:y1, x0:x1] * g[y0:y1, x0:x1]).sum())
            if v > best:
                best, at = v, (dx, dy)
    return at


def winner_mask(cid, rgb):
    x0, y0, x1, y1 = WINNER[cid]
    L = lum(rgb)
    bg = cv2.medianBlur(L.astype(np.uint8), 21).astype(np.float32)
    # The gold foil letters scan dark (a mirror facing the scanner's dark lid), as on the photos when they are not
    # catching the lamp: the stroke is the dark lettering and its star.
    dark = (bg - L) > 25
    m = dark & box(x0, y0, x1, y1)
    cc, n = ndi.label(m)
    if n:
        sz = ndi.sum(m, cc, range(1, n + 1))
        m = np.isin(cc, 1 + np.where(sz >= 5)[0])
    return ndi.binary_dilation(m, iterations=1)


def overlay(rgb, layers, path):
    o = rgb.astype(np.float32).copy()
    for mask, col, a in layers:
        mm = mask.astype(np.float32) if mask.dtype != np.float32 else mask
        o = o * (1 - a * mm[..., None]) + np.array(col, np.float32) * (a * mm[..., None])
    Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="")
    ap.add_argument("--check", default="")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    want = lambda cid: not only or cid in only
    if a.check:
        os.makedirs(a.check, exist_ok=True)
    report = []

    for cid in HOLO:
        if not want(cid):
            continue
        rgb, alpha = load(cid)
        field, fig, win = holo_field(cid, rgb)
        fa = feather(field)
        save(f"field-{cid}.webp", fa)
        d = dots(rgb, field)
        save(f"dots-{cid}.webp", d)
        report.append(f"{cid}: window {win}, field {int(field.sum())} px, figure {int(fig.sum())} px, dots mean {d[field].mean():.3f}")
        if a.check:
            overlay(rgb, [(fig, (255, 0, 255), 0.35), (d, (0, 255, 0), 0.9)], os.path.join(a.check, f"{cid}-check.png"))

    for cid in REV:
        if not want(cid):
            continue
        rgb, alpha = load(cid)
        body, tint, win, blocks, mh = rev_maps(cid, rgb, alpha)
        save(f"body-{cid}.webp", feather(body))
        save(f"tint-{cid}.webp", feather(tint))
        d = dots(rgb, body, text_guard=True)
        save(f"dots-{cid}.webp", d)
        extra = ""
        if cid in WINNER:
            wm = winner_mask(cid, rgb)
            save(f"stamp-{cid}.webp", feather(wm))
            extra = f", winner {int(wm.sum())} px"
        report.append(f"{cid}: window {win}, body {int(body.sum())} px, tint {int(tint.sum())} px, body hue {mh:.0f}{extra}")
        if a.check:
            lay = [(~body & (alpha > 128), (255, 0, 0), 0.45), (body & ~tint, (0, 255, 255), 0.8), (d, (0, 255, 0), 0.9)]
            if cid in WINNER:
                lay.append((winner_mask(cid, rgb), (255, 200, 0), 0.9))
            overlay(rgb, lay, os.path.join(a.check, f"{cid}-check.png"))

    if any(want(c) for c in STAMPS):
        tpl = first_movie_template()
        for cid in STAMPS:
            if not want(cid):
                continue
            rgb, _ = load(cid)
            dx, dy = (0, 0) if cid == "basep-basep05" else align(tpl, rgb, STAMP_ZONE)
            m = np.roll(np.roll(tpl, dy, 0), dx, 1)
            m = ndi.binary_dilation(m, iterations=1)
            save(f"stamp-{cid}.webp", feather(m))
            report.append(f"{cid}: stamp shift ({dx}, {dy}), {int(m.sum())} px")
            if a.check:
                overlay(rgb, [(m, (255, 0, 255), 0.7)], os.path.join(a.check, f"{cid}-check.png"))
    print("\n".join(report))


if __name__ == "__main__":
    sys.exit(main())
