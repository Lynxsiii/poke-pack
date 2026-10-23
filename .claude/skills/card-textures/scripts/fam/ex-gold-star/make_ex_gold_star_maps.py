#!/usr/bin/env python3
"""
Per-card foil maps (v4) for the ex-gold-star holo family: the Gold Star Pokémon of ex7-ex16, cosmos prints (the three
refractor stars have their own maps, make_refractor_star_maps.py).

The real card (2026-10-22 audit photos, /home/user/holo-refs/gs-ex7-ex8, gs-ex10-ex11, gs-ex12-ex13, gs-ex14-ex16): a plain
yellow border and frame, an art window whose BACKGROUND is a mirror foil carrying the EX cosmos (sparse dots of mixed size and
shape: pinpoints, round dots, 4-dot clover clusters, a few big soft discs, each one hue: white, gold, green, cyan, pink, the
ink's own tint), printed exactly where the scan shows them, and a Pokémon that stays matte ink. Lit, the ground brightens as
one soft silver sheet and a scatter of the dots flashes.

For every face (list_cards.mjs, same folder) this reads assets/cards/<set>/<n>.webp (600 x 838) and writes
assets/foil/fam/ex-gold-star/<card id>-v4.webp, a lossless RGBA image of the art window's box (CROP, scaled to OUT_SIZE so
WebKit decodes it synchronously), and <card id>-dots-v4.webp, the same dots alone, opaque, for the .cure layer:

  ALPHA  the foil ground: the window's background, a hard cut that ends ON the Pokémon's printed outline (GrabCut seeded
         from the card's own cosmos dots as background, the window's centre as Pokémon, plus the hand dabs and polygons in
         HINTS; no dilation, a 0.6 px feather). v2 dilated the cut 3 px and blurred it, which drew a contour line.
  RGB    the dots: the scan's OWN printed cosmos dots (local contrast peaks over a 13 px median: pinpoints, dots and clover
         clusters, plus big soft discs over a 41 px median), each drawn in its own printed shape, grown a pixel and
         feathered, in one colour (the dot's own scan hue, or a pick from the cosmos palette), plus a few fine pinpoints.
         RGB is 0 wherever the ground is not opaque, so no partial edge can light. v4 (review r1): the BASIC notch of the
         era's window filled, Raikou's and Pikachu's hints fixed, Pikachu's lilac disc added, RGB kept exact under alpha 0.

Deterministic (seeded by crc32 of the id). Usage (repo root):
  node .claude/skills/card-textures/scripts/fam/ex-gold-star/list_cards.mjs > /tmp/gs.json
  python3 .claude/skills/card-textures/scripts/fam/ex-gold-star/make_ex_gold_star_maps.py --cards /tmp/gs.json [--only id,id] [--debug-dir <dir>]
Writes only into assets/foil/fam/ex-gold-star/ (and --debug-dir). Needs numpy, scipy, opencv, Pillow.
"""
import argparse
import colorsys
import importlib.util
import json
import os
import sys
import zlib

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
OUT_DIR = os.path.join(ROOT, "assets/foil/fam/ex-gold-star")
MAP_VERSION = 4
# Maps redrawn after v4 shipped get a new name (assets are cached as immutable); js/fam/ex-gold-star.js mapVersion() lists the same.
# v5 (review r2): Rayquaza's arm and coil in the cut and its central sky in the ground (no centre seed); Entei's white paws and
# the fur under the chest cut; Mudkip's left gill and foot; Treecko's pupils; Celebi's eye; Mewtwo's mouth and the arm by the tail
# loop; Alakazam's right spoon.
CARD_VERSION = {cid: 5 for cid in ("ex8-107", "ex10-113", "ex7-107", "ex7-109", "ex14-100", "ex13-103", "ex14-99")}
# v6 (review r3): Entei's pale smoke (matte ink: the top-centre bank, the top-right bank, the right-edge column, two strands at the
# lower right), two mane-spike tips at the top and the brown fur fringe under its armour, taken out of the ground by "postcut".
CARD_VERSION["ex10-113"] = 6
W, H = 600, 838
# The map is drawn in scan space, then cropped to the art window's box and scaled to OUT_SIZE: WebKit decodes an image of
# 128,000 px or more (500 KB of RGBA) asynchronously on a tile's first paint, so a full 600 x 838 map left the layers it
# masks blank on the first lit frames (and in screenshots); 456 x 279 (127,224 px) decodes synchronously. The sheet places it
# with mask-size / background-size 87.8333% 38.5442% at 49.3151% 13.5922% (CROP in the card's 600 x 838 box).
CROP = (36, 70, 563, 393)  # x0, y0, x1, y1 (exclusive), the window's box (feather included) in scan pixels
OUT_SIZE = (456, 279)
DOT_GAIN = 1.35  # the dots file is lifted (the sheet multiplies the light onto it without a brightness filter)

_spec = importlib.util.spec_from_file_location("exmaps", os.path.join(HERE, "..", "ex-pokemon-ex", "make_ex_pokemon_ex_maps.py"))
exmaps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exmaps)


def window_mask():
    a = np.asarray(Image.open(os.path.join(ROOT, "assets/foil/ex-ex/win-A-basic.webp")).convert("RGBA"))[..., 3] / 255.0
    a = a.astype(np.float32).copy()
    # the era's window has a notch at its bottom left for the BASIC tag of the regular EX layout; on the Gold Stars the tag sits
    # below the window and the foil (and its dots) runs down to the BASIC strip (the real Torchic, review r1 ref-108-bl.jpg)
    a[373:389, :140] = a[372, :140]
    return ndi.gaussian_filter(a, 0.6)


# The cosmos palette (weight, hue range in degrees, saturation range): white/silver, green, cyan-blue, gold, pink (photos:
# Torchic, Mudkip, Latias, Metagross, Suicune). A per-card palette (CARD_PALETTE) leans to the ink's tint where the photos show it.
PALETTE = [
    (0.35, (0, 360), (0.0, 0.08)),
    (0.20, (100, 150), (0.45, 0.75)),
    (0.20, (180, 220), (0.45, 0.80)),
    (0.15, (38, 56), (0.50, 0.80)),
    (0.10, (300, 340), (0.35, 0.60)),
]
GOLD = [(0.30, (0, 360), (0.0, 0.08)), (0.55, (30, 52), (0.55, 0.85)), (0.10, (12, 28), (0.55, 0.8)), (0.05, (190, 220), (0.4, 0.7))]
CARD_PALETTE = {
    "ex12-90": GOLD,  # Regice: gold, amber, orange glitter over the red sky (lit-photo-window-gold-glitter-all-over.jpg)
    "ex12-92": GOLD,  # Registeel: gold and white in the sunburst (jp-registeel-star-lit-gold-white-glitter-sunburst.jpg)
    "ex16-102": [(0.40, (0, 360), (0.0, 0.08)), (0.35, (36, 54), (0.5, 0.8)), (0.25, (180, 210), (0.45, 0.75))],  # Vaporeon
}
# share of dots that keep their own printed hue (the rest take a palette pick); the printed tint is what the photos show
OWN_HUE = 0.6


def hsv_rgb(h, s, v):
    return np.array(colorsys.hsv_to_rgb(h % 1.0, s, v), np.float32)


def palette_pick(rng, pal):
    w = np.array([p[0] for p in pal])
    _, hr, sr = pal[rng.choice(len(pal), p=w / w.sum())]
    return hsv_rgb(rng.uniform(*hr) / 360.0, rng.uniform(*sr), 1.0)


# Hand hints per card, scan pixels. "fg"/"bg": dabs (x, y, radius) that are surely the Pokémon / surely background;
# "fgp"/"bgp": polygons [(x, y), ...] filled the same way. Everything else is GrabCut's. The Pokémon is matte on the real card.
HINTS = {
    "ex10-113": {  # Entei: the brown mane and tail fur (lower left) and the tufts under the body are Pokémon (audit gs-ex10-ex11)
        "fg": [(259, 205, 22), (212, 146, 20), (107, 246, 16), (295, 264, 20), (359, 129, 22), (448, 105, 12), (506, 188, 14),
               (471, 317, 14), (418, 358, 8), (90, 200, 14), (130, 215, 14), (160, 245, 12), (70, 230, 10), (180, 280, 10)],
        # v5 (review r2): the white front paws (lower left) and the white paw, the fur tuft and the fur strand under the chest, cut
        # after GrabCut wherever the pixel is Pokémon ink (white, brown, tan), not the dark-green forest or its dots (see INK_CUT)
        "inkcut": [[(76, 280), (95, 276), (118, 282), (122, 300), (112, 308), (85, 307), (74, 298)],
                [(155, 391), (157, 370), (175, 347), (190, 330), (200, 312), (215, 309), (225, 311), (240, 304), (260, 295),
                 (285, 291), (290, 302), (280, 325), (265, 347), (260, 366), (250, 350), (238, 336), (236, 370), (231, 391)]],
        "bg": [(71, 305, 12), (365, 293, 12), (546, 135, 14), (538, 224, 14), (504, 108, 12), (239, 101, 14), (184, 135, 12)],
        # v6 (review r3): pale smoke and fur still in the ground, cut after the dots are drawn (POST_CUT): (polygon, test)
        "postcut": [([(205, 70), (282, 70), (282, 138), (205, 138)], "ink"),  # the top-centre smoke bank and two mane-spike tips
                    ([(444, 70), (530, 70), (530, 132), (444, 132)], "pale"),  # the top-right smoke bank
                    ([(515, 100), (563, 100), (563, 330), (515, 330)], "grey"),  # the right-edge smoke column (and its grey shadow), the strand below
                    ([(380, 330), (405, 330), (405, 358), (380, 358)], "grey"),  # the tip of the smoke curve at the lower right
                    ([(372, 215), (430, 215), (430, 250), (372, 250)], "warm")],  # the brown fur fringe under the armour (right)
    },
    "ex10-114": {  # Raikou: head, open mouth, crest blades, the cloud mane and the spiky tail are Pokémon; the navy sky is not
        "fg": [(320, 110, 14), (335, 150, 14), (345, 190, 10), (330, 130, 8), (272, 145, 5), (290, 140, 6), (395, 120, 5),
               (375, 128, 6), (345, 92, 5), (385, 135, 10), (395, 165, 8), (224, 206, 9), (260, 210, 14), (200, 220, 12),
               (250, 250, 12), (290, 190, 10), (420, 215, 7), (440, 300, 9), (450, 335, 12), (455, 372, 9), (495, 225, 7), (480, 248, 4), (510, 212, 4), (446, 264, 3)],
        "bg": [(130, 100, 15), (200, 95, 12), (262, 92, 7), (452, 92, 12), (520, 100, 12), (490, 160, 10), (545, 250, 10),
               (160, 150, 10), (100, 150, 10), (545, 330, 8), (215, 165, 6), (235, 160, 5)],
    },
    "ex10-115": {  # Suicune: the teal crest and both long ribbons are Pokémon (matte in the LegitApp and CGC photos)
        "fg": [(250, 150, 22), (300, 230, 22), (290, 94, 7), (330, 114, 7), (360, 134, 6)],
        "fgl": [([(50, 139), (90, 189), (130, 239), (160, 289), (185, 339), (205, 379)], 7),
                ([(555, 124), (550, 189), (535, 254), (510, 304), (470, 344), (420, 369), (380, 374)], 7),
                ([(425, 234), (400, 274), (375, 314), (360, 349), (380, 369)], 6)],
        "bg": [(80, 110, 12), (520, 90, 12), (110, 330, 10), (470, 240, 8), (100, 240, 8), (490, 230, 8), (500, 280, 8), (470, 300, 6)],
    },
    "ex11-112": {"fg": [(488, 210, 6), (540, 245, 7), (540, 305, 7)]},  # Kyogre: the grey fins at the right are Pokémon
    "ex11-111": {"fg": [(400, 245, 18), (460, 300, 12), (430, 205, 14), (180, 310, 14), (165, 350, 10), (385, 105, 10), (395, 150, 10)]},
    "ex11-113": {"fg": [(90, 320, 18), (60, 290, 14), (140, 350, 14), (190, 300, 12), (170, 380, 8), (50, 357, 12), (50, 335, 10), (140, 385, 8)]},
    "ex12-92": {"fg": [(50, 215, 16), (55, 325, 14), (250, 355, 14), (430, 365, 12)]},
    "ex13-103": {"fg": [(80, 185, 14)], "bg": [(128, 215, 12), (372, 215, 12)],
                 # v5 (review r2): the pink mouth, and the arm's edge by the tail loop (the loop's fill ran onto it)
                 "cut": [[(299, 134), (305, 131), (314, 132), (319, 140), (319, 152), (313, 161), (304, 162), (296, 154), (295, 143)],
                         [(359, 204), (386, 199), (370, 218), (361, 222)]]},  # Mewtwo: the space inside the tail loop is background
    "ex13-104": {"bg": [(325, 235, 10), (315, 215, 6), (335, 260, 6), (330, 190, 8)],  # Pikachu: the sky between chest and tail base is background
                 "bgp": [[(316, 195), (375, 195), (366, 232), (352, 258), (334, 272), (318, 280), (314, 240)]]},
    "ex14-99": {"fg": [(55, 150, 22)],
                "cut": [[(506, 181), (520, 180), (528, 173), (545, 172), (556, 178), (557, 190), (547, 197), (530, 197), (520, 190), (506, 190)]]},  # v5: the right spoon
    "ex14-100": {"cut": [[(160, 192), (178, 198), (192, 212), (200, 232), (202, 260), (199, 285), (193, 297), (182, 294), (168, 282),
                          (152, 262), (141, 242), (138, 222), (143, 204), (150, 195)]]},  # v5 (review r2): the eye (ring, white, iris)
    "ex16-102": {"bg": [(80, 84, 8), (130, 94, 7), (170, 84, 6), (440, 190, 10), (390, 250, 10)]},  # Vaporeon: the dark water top left and inside the tail curl
    "ex7-109": {"cut": [[(222, 240), (236, 238), (242, 260), (240, 300), (238, 316), (228, 316), (222, 290)],  # v5: the pupils
                        [(384, 258), (392, 262), (396, 285), (392, 306), (384, 306), (381, 285)]],
                "bg": [(440, 130, 14), (520, 125, 12), (300, 105, 10), (480, 345, 8), (560, 350, 8), (60, 140, 12)]},
    "ex7-107": {
        "fg": [(271, 276, 28), (242, 129, 14), (448, 141, 14), (330, 317, 14), (201, 323, 16), (418, 335, 8)],
        # v5 (review r2): the left orange gill and the left foot
        "cut": [[(128, 243), (141, 249), (150, 258), (155, 275), (157, 340), (138, 343), (128, 336), (122, 322), (121, 312),
                 (122, 298), (112, 282), (108, 270), (118, 266), (127, 272), (124, 255)],
                [(136, 343), (160, 342), (175, 350), (178, 389), (136, 389), (134, 360)]],
        "bg": [(71, 129, 12), (71, 246, 12), (401, 105, 10), (495, 352, 10)],
    },
    "ex7-108": {"fg": [(322, 264, 28), (334, 188, 24), (363, 129, 16), (192, 264, 12), (334, 352, 10), (392, 294, 12)],
                "bg": [(98, 158, 14), (510, 305, 12), (98, 335, 12)]},
    "ex8-105": {"fg": [(334, 266, 26), (216, 254, 18), (475, 278, 14), (481, 172, 10), (98, 260, 8), (245, 365, 8)],
                "bg": [(98, 131, 14), (334, 113, 14), (510, 365, 12), (98, 359, 12)]},
    "ex8-106": {"fg": [(350, 345, 7), (440, 340, 4), (212, 276, 26), (124, 264, 16), (301, 129, 12), (389, 129, 12), (495, 129, 10), (418, 205, 10), (389, 246, 8),
                       (424, 346, 8), (183, 182, 8), (71, 335, 10)],
                "bg": [(260, 190, 14), (536, 246, 10), (536, 352, 10), (95, 129, 12), (83, 188, 10), (270, 215, 12), (295, 200, 10),
                       (300, 235, 8), (255, 240, 6)]},  # Latios: the sky inside the wings (the centre seed took it for Pokémon)
    "ex8-107": {"fg": [(145, 205, 14), (245, 305, 14), (375, 346, 14), (510, 323, 10), (300, 150, 8), (330, 120, 8)],
                "bg": [(275, 158, 16), (392, 188, 14), (392, 129, 14), (463, 146, 10), (304, 246, 10), (240, 210, 10), (270, 230, 10),
                       (300, 215, 8), (250, 250, 8)],  # Rayquaza: the sky inside the coils
                # v5 (review r2): the thin arm crossing the sky to the upper right, its claw and the coil down the right edge are
                # Pokémon; the grey sky under the head is ground (the window's centre seed had made it an unlit hole)
                "cutl": [([(352, 275), (375, 250), (400, 225), (412, 207), (430, 190), (447, 177), (465, 167), (480, 160), (492, 154)], 8)],
                "cut": [[(480, 160), (492, 147), (505, 140), (530, 139), (537, 152), (540, 175), (530, 192), (520, 197), (505, 195),
                         (490, 185), (480, 178)],
                        [(532, 150), (557, 150), (557, 252), (536, 250), (532, 200), (538, 175)],
                        [(357, 276), (372, 268), (391, 265), (389, 276), (373, 296), (365, 303), (359, 292)]],  # the arm's red fin
                "uncut": [[(245, 229), (240, 220), (257, 198), (270, 193), (290, 195), (294, 211), (305, 211), (310, 198), (315, 185),
                         (332, 185), (342, 188), (352, 210), (370, 227), (383, 234), (375, 240), (350, 258), (347, 268), (312, 264),
                         (300, 261), (267, 242)]]},
}
# Big soft discs the lit photos show where the scan prints none: (x, y, radius, rgb). Pikachu's lilac-blue disc in the sky
# between the chest and the tail base (PSA 9 photo, psa9-lit-window-blue-cyan-clusters-lilac-disc.jpg).
EXTRA_DISCS = {"ex13-104": [(326, 244, 14, (0.78, 0.7, 1.0))]}
NO_SHARD_SEED = {"ex7-109"}  # the sky's shards teach GrabCut that dark scenery is Pokémon; seed from the hand dabs only


def shards(rgb, z):
    """v2's compact scan sparkles, used only to seed GrabCut's background (the hints were tuned on them)."""
    bg = cv2.medianBlur(np.clip(rgb, 0, 255).astype(np.uint8), 9).astype(np.float32)
    d = rgb - bg
    lum = d.mean(-1)
    chroma = np.sqrt(((d - lum[..., None]) ** 2).sum(-1))
    score = np.maximum(lum, 0) * 0.8 + chroma
    lab, n = ndi.label((score > 38) & (z > 0.5))
    if not n:
        return np.zeros((H, W), bool)
    area = ndi.sum(np.ones_like(score), lab, np.arange(1, n + 1))
    keep = np.zeros(n + 1, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        keep[i] = 2 <= area[i - 1] <= 80 and max(h, w) <= 12 and area[i - 1] / (h * w) >= 0.35
    return keep[lab]


def segment(rgb, z, shard, cid):
    """The Pokémon inside the art window: GrabCut seeded from the window's centre, the card's cosmos shards (background) and hints."""
    z = z > 0.5
    ys, xs = np.nonzero(z)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    m[z] = cv2.GC_PR_FGD
    dens = ndi.gaussian_filter(ndi.binary_dilation(shard, iterations=1).astype(np.float32), 10)
    m[z & (dens > 0.03)] = cv2.GC_PR_BGD
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    cv2.ellipse(m, (cx, cy), (int((x1 - x0) * 0.10), int((y1 - y0) * 0.10)), 0, 0, 360, cv2.GC_FGD, -1)
    h = HINTS.get(cid, {})
    for (x, y, r) in h.get("bg", []):
        cv2.circle(m, (x, y), r, cv2.GC_BGD, -1)
    for poly in h.get("bgp", []):
        cv2.fillPoly(m, [np.array(poly, np.int32)], cv2.GC_BGD)
    for (x, y, r) in h.get("fg", []):
        cv2.circle(m, (x, y), r, cv2.GC_FGD, -1)
    for poly in h.get("fgp", []):
        cv2.fillPoly(m, [np.array(poly, np.int32)], cv2.GC_FGD)
    for line, width in h.get("fgl", []):
        cv2.polylines(m, [np.array(line, np.int32)], False, cv2.GC_FGD, width)
    img = cv2.cvtColor(ndi.median_filter(np.clip(rgb, 0, 255).astype(np.uint8), size=(3, 3, 1)), cv2.COLOR_RGB2BGR)
    sub = (slice(y0 - 2, y1 + 3), slice(x0 - 2, x1 + 3))
    mm = m[sub].copy()
    cv2.setRNGSeed(zlib.crc32(cid.encode()) & 0x7FFFFFFF)
    cv2.grabCut(np.ascontiguousarray(img[sub]), mm, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    m[sub] = mm
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & z
    fg = ndi.binary_opening(fg, iterations=1)
    lab, n = ndi.label(fg)
    if n > 1:  # drop small islands (specks of the sky the model took for Pokémon)
        area = ndi.sum(fg, lab, np.arange(1, n + 1))
        fg = np.isin(lab, 1 + np.flatnonzero(area >= 300))
    # small holes in the Pokémon are filled; a big one is sky seen through a loop (Mewtwo's tail, Rayquaza's coils, Latios's
    # wings, Pikachu's chest and tail) and stays ground (v2 filled every hole and lost those)
    holes = ndi.binary_fill_holes(fg) & ~fg
    hl, nh = ndi.label(holes)
    if nh:
        area = ndi.sum(np.ones((H, W)), hl, np.arange(1, nh + 1))
        fg = fg | np.isin(hl, 1 + np.flatnonzero(area < 500))
    bgl, nb = ndi.label(z & ~fg)
    if nb > 1:
        area = ndi.sum(np.ones((H, W)), bgl, np.arange(1, nb + 1))
        fg = fg | (np.isin(bgl, 1 + np.flatnonzero(area < 60)) & z)
    # local cuts (after GrabCut, so they move nothing else in the map: a seed added to the global GrabCut shifts its colour
    # models and re-cuts far-away parts, as v5's first draft lost Mudkip's tail lobe): each "cut" / "cutl" (Pokémon) or "uncut"
    # (ground) shape is snapped to the printed edge by a small GrabCut of its own box (core sure, a 4 px band either way open)
    for shape, to_fg in ([(poly, True) for poly in h.get("cut", [])] + [(ln, True) for ln in h.get("cutl", [])]
                         + [(poly, False) for poly in h.get("uncut", [])]):
        fg = local_cut(img, fg, z, shape, to_fg)
    # ink cuts (after GrabCut, so they move nothing else): inside each polygon, the pixels that are the Pokémon's ink (bright, or
    # warm: white paws, brown and tan fur), not the dark-green / navy forest or its cyan and green dots
    zone = np.zeros((H, W), np.uint8)
    for poly in h.get("inkcut", []):
        cv2.fillPoly(zone, [np.array(poly, np.int32)], 1)
    if zone.any():
        r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
        ink = ((r + g + b) / 3 > 150) | ((r > g + 12) & (r > 50))
        ink = ndi.binary_closing(ndi.median_filter(ink, size=3), iterations=2)
        ink = ndi.binary_dilation(ink, iterations=1) & (zone > 0) & z
        lab, n = ndi.label(ink)
        if n:  # drop specks (a dot the test took for ink)
            area = ndi.sum(ink, lab, np.arange(1, n + 1))
            ink = np.isin(lab, 1 + np.flatnonzero(area >= 25))
        fg = fg | ink
    return fg


def post_cut(rgb, z, cuts):
    """The Pokémon's or the smoke's ink inside hand polygons, for a cut made AFTER the dots are drawn (so the seeded dot colours and
    pinpoints elsewhere stay exactly as they were): "pale" = light, unsaturated ink (smoke, white fur; not the cyan, green or
    gold dots), "grey" = pale plus the smoke's mid-grey shadow (the night sky is darker, the dots saturated), "warm" = brown or tan
    fur, "ink" = pale or warm. Specks under 25 px (a white pinpoint) stay ground. Returns the cut and the polygons' union."""
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    grey = (mx - mn) / np.maximum(mx, 1) < 0.3
    pale = ((r + g + b) / 3 > 150) & grey
    warm = (r > g + 12) & (r > 50)
    out = np.zeros((H, W), bool)
    zones = np.zeros((H, W), bool)
    for poly, test in cuts:
        zone = np.zeros((H, W), np.uint8)
        cv2.fillPoly(zone, [np.array(poly, np.int32)], 1)
        zones |= zone > 0
        ink = {"pale": pale, "grey": ((r + g + b) / 3 > 100) & grey, "warm": warm, "ink": pale | warm}[test]
        ink = ndi.binary_closing(ndi.median_filter(ink, size=3), iterations=2) & (zone > 0) & (z > 0.5)
        lab, n = ndi.label(ink)
        if n:
            area = ndi.sum(ink, lab, np.arange(1, n + 1))
            out |= np.isin(lab, 1 + np.flatnonzero(area >= 25))
    return out, zones


def local_cut(img, fg, z, shape, to_fg):
    """Snap one hand-drawn shape (a polygon, or a (polyline, width)) to the print with a GrabCut of its own neighbourhood and
    add it to the Pokémon (to_fg) or to the ground."""
    pm = np.zeros((H, W), np.uint8)
    if isinstance(shape, tuple):
        cv2.polylines(pm, [np.array(shape[0], np.int32)], False, 1, shape[1])
    else:
        cv2.fillPoly(pm, [np.array(shape, np.int32)], 1)
    p = pm > 0
    core = ndi.binary_erosion(p, iterations=2)
    grow = ndi.binary_dilation(p, iterations=4)
    ys, xs = np.nonzero(ndi.binary_dilation(p, iterations=16))
    sub = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    m = np.where(fg, cv2.GC_FGD, cv2.GC_BGD).astype(np.uint8)
    if to_fg:
        m[p] = cv2.GC_PR_FGD
        m[grow & ~p & ~fg] = cv2.GC_PR_BGD
        m[core] = cv2.GC_FGD
    else:
        m[p] = cv2.GC_PR_BGD
        m[grow & ~p & fg] = cv2.GC_PR_FGD
        m[core] = cv2.GC_BGD
    mm = np.ascontiguousarray(m[sub])
    cv2.setRNGSeed(11)
    cv2.grabCut(np.ascontiguousarray(img[sub]), mm, None, np.zeros((1, 65)), np.zeros((1, 65)), 4, cv2.GC_INIT_WITH_MASK)
    res = np.zeros((H, W), bool)
    res[sub] = (mm == cv2.GC_FGD) | (mm == cv2.GC_PR_FGD)
    if to_fg:
        return fg | (res & grow & z)
    return fg & ~(~res & grow)


def contrast(rgb, k):
    """Local contrast score of each pixel against a k-px median: brighter or more coloured than its surroundings."""
    u8 = np.clip(rgb, 0, 255).astype(np.uint8)
    bg = cv2.medianBlur(u8, k).astype(np.float32)
    d = rgb - bg
    lum = d.mean(-1)
    chroma = np.sqrt(((d - lum[..., None]) ** 2).sum(-1))
    return np.maximum(lum, 0) * 0.8 + chroma


def find_dots(rgb, ground):
    """The scan's own printed cosmos dots: (label image, list of (slice, label, kind)) for small dots and big discs."""
    inside = ground > 0.5
    out = []
    s1 = contrast(rgb, 13)
    lab, n = ndi.label((s1 > 40) & inside)
    if n:
        area = ndi.sum(np.ones((H, W)), lab, np.arange(1, n + 1))
        for i, sl in enumerate(ndi.find_objects(lab), start=1):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if 2 <= area[i - 1] <= 220 and max(hh, ww) <= 18 and area[i - 1] / (hh * ww) >= 0.22:
                out.append((lab, i, sl, "dot", s1))
    s2 = contrast(rgb, 41)
    lab2, n2 = ndi.label(ndi.binary_opening((s2 > 34) & inside, iterations=2))
    if n2:
        area = ndi.sum(np.ones((H, W)), lab2, np.arange(1, n2 + 1))
        for i, sl in enumerate(ndi.find_objects(lab2), start=1):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if 120 <= area[i - 1] <= 900 and max(hh, ww) <= 36 and min(hh, ww) / max(hh, ww) >= 0.6 and area[i - 1] / (hh * ww) >= 0.55:
                out.append((lab2, i, sl, "disc", s2))
    return out


def draw(card, win, debug_dir):
    rgb, calpha = exmaps.load(card)
    z = np.clip(win * calpha, 0, 1)
    cid = card["id"]
    rng = np.random.default_rng(zlib.crc32(cid.encode()))
    shard = shards(rgb, z)
    fg = segment(rgb, z, np.zeros_like(shard) if cid in NO_SHARD_SEED else shard, cid)
    # ALPHA: the window minus the Pokémon, ending on its printed outline (grown 1 px so the black line stays matte), feathered 0.6
    pk = ndi.gaussian_filter(ndi.binary_dilation(fg, iterations=1).astype(np.float32), 0.6)
    ground = np.clip(z * (1.0 - np.clip(pk * 2.0 - 0.5, 0, 1)), 0, 1)
    solid = ground > 0.98
    # RGB: the scan's dots, each in its printed shape and one colour
    pal = CARD_PALETTE.get(cid, PALETTE)
    tex = np.zeros((H, W, 3), np.float32)
    dots = find_dots(rgb, ground * solid)
    n_dot = n_disc = 0
    for lab, i, sl, kind, score in dots:
        pad = 3
        ys = slice(max(sl[0].start - pad, 0), min(sl[0].stop + pad, H))
        xs = slice(max(sl[1].start - pad, 0), min(sl[1].stop + pad, W))
        comp = lab[ys, xs] == i
        sc = score[ys, xs]
        peak = float(sc[comp].max())
        if kind == "dot":
            shape = ndi.binary_dilation(comp, iterations=1)
            inten = np.clip((sc - 18.0) / max(peak - 18.0, 1.0), 0, 1) ** 0.6 * shape
            inten = np.maximum(inten, comp * 0.75)
            inten = ndi.gaussian_filter(inten, 0.6)
            gain = 0.7 + 0.3 * min(peak / 110.0, 1.0)
            n_dot += 1
        else:
            inten = ndi.gaussian_filter(comp.astype(np.float32), 2.0) * 0.55  # big soft disc, dimmer than the dots
            gain = 1.0
            n_disc += 1
        # colour: the dot's own printed hue (the brightest pixel's colour), or a palette pick
        iy, ix = np.unravel_index(np.argmax(np.where(comp, sc, -1)), comp.shape)
        c = rgb[ys, xs][iy, ix] / 255.0
        hh, ss, vv = colorsys.rgb_to_hsv(*c)
        if rng.random() < OWN_HUE:
            col = hsv_rgb(hh + rng.uniform(-0.03, 0.03), 0.06 if ss < 0.22 else float(np.clip(ss * 1.2, 0.5, 0.85)), 1.0)
        else:
            col = palette_pick(rng, pal)
        col = col * gain * rng.uniform(0.85, 1.0)
        tex[ys, xs] = np.maximum(tex[ys, xs], inten[..., None] * col)
    # a few fine pinpoints on the ground the scan's dots leave bare (the real cards show pinpoints between the clusters)
    gy, gx = np.nonzero(solid & (ndi.gaussian_filter(tex.max(-1), 6) < 0.02))
    n_pin = int(solid.sum() / 1400)
    if len(gy) and n_pin:
        pick = rng.choice(len(gy), size=min(n_pin, len(gy)), replace=False)
        for k in pick:
            col = palette_pick(rng, pal) * rng.uniform(0.55, 0.9)
            y, x = gy[k], gx[k]
            tex[y, x] = np.maximum(tex[y, x], col)
            for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                yy, xx = min(max(y + dy, 0), H - 1), min(max(x + dx, 0), W - 1)
                tex[yy, xx] = np.maximum(tex[yy, xx], col * 0.35)
    yy, xx = np.mgrid[0:H, 0:W]
    for (x, y, r, col) in EXTRA_DISCS.get(cid, []):
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
        tex = np.maximum(tex, (np.clip((r - d) / 4.0, 0, 1) * 0.75)[..., None] * np.array(col, np.float32))
    if HINTS.get(cid, {}).get("postcut"):  # v6: ink cut after the dots (see post_cut), feathered like the Pokémon's edge
        cut, zones = post_cut(rgb, z, HINTS[cid]["postcut"])
        pc = ndi.gaussian_filter(ndi.binary_dilation(cut, iterations=1).astype(np.float32), 0.6)
        ground = ground * (1.0 - np.clip(pc * 2.0 - 0.5, 0, 1))
        lab, n = ndi.label(ground > 0.5)  # slivers of ground the cut leaves between the spikes or in the smoke go too
        if n:
            area = ndi.sum(np.ones((H, W)), lab, np.arange(1, n + 1))
            hit = ndi.maximum(zones, lab, np.arange(1, n + 1)) > 0
            ground = ground * ~np.isin(lab, 1 + np.flatnonzero((area < 40) & hit))
        solid = ground > 0.98
    tex = np.clip(tex, 0, 1) * solid[..., None]
    # crop to the window's box and scale under WebKit's async-decode size (see CROP); RGB is 0 wherever the ground is not opaque
    x0, y0, x1, y1 = CROP
    assert (z[:y0].max() if y0 else 0) < 0.01 and z[y1:].max() < 0.01 and z[:, :x0].max() < 0.01 and z[:, x1:].max() < 0.01
    small_tex = cv2.resize(np.ascontiguousarray(tex[y0:y1, x0:x1]), OUT_SIZE, interpolation=cv2.INTER_AREA)
    small_a = cv2.resize(np.ascontiguousarray(ground[y0:y1, x0:x1].astype(np.float32)), OUT_SIZE, interpolation=cv2.INTER_AREA)
    rgba = np.dstack([small_tex * 255.0, small_a * 255.0]).round().clip(0, 255).astype(np.uint8)
    rgba[..., :3][rgba[..., 3] < 250] = 0
    # exact: keep RGB under alpha 0 as written (the encoder otherwise fills it with whatever compresses best: stray lines)
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT_DIR, f"{cid}-v{CARD_VERSION.get(cid, MAP_VERSION)}.webp"), lossless=True, quality=100, method=6,
                                       exact=True)
    # the dots alone, OPAQUE (black between them), lifted by DOT_GAIN: the .cure layer multiplies its light onto this, so no
    # transparent or half-transparent pixel can let the light through at the ground's edge (no contour line, no flat sheet)
    dots = np.clip(rgba[..., :3].astype(np.float32) * DOT_GAIN, 0, 255).round().astype(np.uint8)
    Image.fromarray(dots, "RGB").save(os.path.join(OUT_DIR, f"{cid}-dots-v{CARD_VERSION.get(cid, MAP_VERSION)}.webp"), lossless=True, quality=100, method=6)
    if debug_dir:
        crop = (slice(64, 400), slice(30, 570))
        scan = rgb[crop]
        g = ground[crop][..., None]
        vis = scan * (1 - 0.5 * g) + np.array([255, 0, 200], np.float32) * 0.5 * g
        t = tex[crop]
        vis = np.where(t.max(-1, keepdims=True) > 0.08, 255 * t / np.maximum(t.max(-1, keepdims=True), 1e-3), vis)
        Image.fromarray(np.concatenate([scan, vis], 1).clip(0, 255).astype(np.uint8)).save(os.path.join(debug_dir, f"{cid}.png"))
    return n_dot, n_disc, n_pin, float(ground[win > 0.5].mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--debug-dir", default="")
    args = ap.parse_args()
    cards = [c for c in json.load(open(args.cards)) if not c.get("refractor")]
    only = set(filter(None, args.only.split(",")))
    os.makedirs(OUT_DIR, exist_ok=True)
    if args.debug_dir:
        os.makedirs(args.debug_dir, exist_ok=True)
    win = window_mask()
    for c in cards:
        if only and c["id"] not in only:
            continue
        nd, nc, npn, cover = draw(c, win, args.debug_dir)
        print(f"{c['id']} {c['name']}: {nd} dots, {nc} discs, {npn} pinpoints, ground covers {cover:.2f} of the window", flush=True)


if __name__ == "__main__":
    sys.exit(main())
