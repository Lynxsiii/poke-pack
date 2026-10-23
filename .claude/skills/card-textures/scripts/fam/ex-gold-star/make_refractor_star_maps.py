#!/usr/bin/env python3
"""
Pokémon silhouette maps (v3) of the three refractor Gold Stars of the EX era (ex13-102 Gyarados, ex15-100 Charizard, ex15-101 Mew,
all delta species): on these real cards the POKÉMON is a smooth mirror foil that throws a broad rainbow when tilted and reads as
silver in diffuse light, and the art background is printed ink (2026-10-22 audit photos in /home/user/holo-refs/gs-delta-refractor/;
Collexy's EX holofoil overview).

Writes assets/foil/fam/ex-gold-star/<card id>-refractor-v3.webp, a 600 x 838 RGBA webp registered to the scan (v1 was a 300 x 419
GrabCut blob upscaled 2x, whose edges missed the outline by 10-20 CSS px). ALPHA is the Pokémon (1) inside the art window,
Charizard's flame breath and tail flame at FLAME_ALPHA (they light with the body in the tilted photo), nothing elsewhere.
The silhouette is GrabCut at full resolution, seeded from the v1 blob (probable Pokémon) and the hand corrections in FIX (dabs
and polygons, scan pixels: what v1 missed, such as Gyarados' golden belly coils and tail fin, Charizard's arm, foot and right wing
tip, Mew's thin tail loop; and the background v1 let in), then cleaned (small holes filled, islands dropped) and feathered 0.8 px.
v4 (review r2), Gyarados only: two alpha levels. The pale parts (the blue-grey and white fins, the light pink of the head and
the tail fin: low saturation, high value) stay at 1 and take the full rainbow; the red body, the crest and the gold belly drop
to BODY_LEVEL, so the sheet's overlay spectrum only tints them (v3's full-strength overlay turned the red shiny Gyarados green
and olive at some angles and hot magenta at others; the JP and FR photos keep it red-orange with a gold belly, the pastel
rainbow on the crest and fins). Gyarados and Charizard ship as <id>-refractor-v5.webp (below), Mew stays on v3.
Charizard also gets <id>-flame-v1.webp (300 x 419 greyscale, the whole card: white = its flame breath and tail flame outside the
body), which the sheet uses to light the flames warm (red-orange, gold, yellow-green) and keep the cool spectrum on the body.
v5 (review r3), Gyarados: inside a head polygon (FIX "warm") the warm pale ink (the light pink head behind the crest and the upper
neck) drops to WARM_LEVEL; it went an even pink-magenta with the fins on v4, where the JP tilted photo keeps it salmon-red. The
blue-grey fins and crest stay at 1, and so does the tail fin outside the polygon.
v5 (review r3), Charizard: three pockets of black night sky the cut let in (the sky right of the torso below the right arm,
a strip right of the neck's outline up to the horn, the channel under the jaw between the left wing's arm and the left arm) lit as
blue blocks with straight edges under the hard-light spectrum. Charizard's skin is black ink like the sky, so colour cannot part
them; the printed outline (light blue-grey) can. Each pocket is flooded from a seed over the dark pixels (4-connected) inside a hand
polygon, so the cut stops on the outline, and taken out AFTER the main cut (FIX "sky"), so nothing else in the map moves.
Deterministic. Usage (repo root):
  python3 .claude/skills/card-textures/scripts/fam/ex-gold-star/make_refractor_star_maps.py [--only id,id] [--preview DIR]
Needs opencv, numpy, scipy, Pillow.
"""
import argparse
import importlib.util
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/ex-gold-star")
_s = importlib.util.spec_from_file_location("exd", os.path.join(HERE, "..", "..", "make_ex_delta_masks.py"))
exd = importlib.util.module_from_spec(_s)
_s.loader.exec_module(exd)
W, H = 600, 838
VERSION = 3
CARD_VERSION = {"ex13-102": 5, "ex15-100": 5}
BODY_LEVEL = {"ex13-102": 0.3}  # the saturated body's alpha on a two-level map (the pale parts stay at 1)
WARM_LEVEL = {"ex13-102": 0.35}  # v5: the warm pale ink (light pink) inside FIX "warm" drops to this; the cool pale ink stays at 1
FLAME_FILE = {"ex15-100": 1}  # cards with a flame file (its version)
FLAME_ALPHA = 0.7
SKY_DARK = 35  # a sky pocket floods over pixels whose brightest channel is below this (the outline is 90-220)
SKY_FRINGE = 60  # and then takes the dark fringe 2 px into the outline

# Corrections, scan pixels. fg/bg: dabs (x, y, r); fgp/bgp: polygons; flame: polygons whose flame-coloured pixels light at FLAME_ALPHA.
FIX = {
    "ex13-102": {  # Gyarados: the whole Pokémon incl. the golden belly coils (lower left), the scaled coil to the lower right and its tail fin,
        # the blue-grey fins at the left, the crest spike top left, the fins under the head and the tail fin's tip (v3); the fire seen
        # through the neck loop is background (review r1)
        "fgp": [[(105, 289), (155, 284), (220, 299), (240, 344), (230, 384), (105, 384), (95, 334)],
                [(222, 344), (310, 304), (380, 284), (410, 299), (410, 344), (330, 364), (240, 384)],
                [(450, 320), (500, 305), (530, 325), (500, 345), (455, 340)]],
        "fg": [(80, 215, 8), (95, 240, 8), (70, 232, 6), (60, 205, 5), (88, 262, 5), (440, 262, 6), (452, 272, 5), (505, 322, 5),
               (515, 326, 4)],
        "fgl": [([(104, 82), (112, 95), (118, 110)], 6)],
        "bg": [(425, 215, 6), (420, 185, 5), (470, 120, 12), (520, 200, 12), (60, 330, 8), (224, 292, 15)],
        # v5 (review r3): the head behind the crest and the upper neck, light pink ink at 1 on v4, went an even pink-magenta with
        # the fins; the JP tilted photo keeps the head salmon-red, the pastel rainbow on the crest and the blue-grey fins. Inside
        # this polygon the warm pale ink drops to WARM_LEVEL (the blue-grey fins and crest in it stay at 1; the tail fin, outside,
        # stays at 1: it lights pale cyan in the photo).
        "warm": [[(170, 95), (245, 82), (335, 88), (352, 135), (340, 200), (320, 240), (290, 262), (240, 262), (195, 235), (170, 180)]],
    },
    "ex15-100": {  # Charizard: arm, right foot, tail and right wing tip are Pokémon; the black gaps by the head and neck are not
        "fgp": [[(205, 229), (240, 214), (285, 214), (290, 239), (265, 264), (240, 279), (210, 304), (195, 279)]],
        "fg": [(440, 255, 9), (455, 280, 7), (545, 97, 5), (300, 330, 10), (250, 330, 8)],
        "bg": [(315, 125, 6)],
        "bgp": [[(382, 129), (412, 114), (425, 139), (417, 179), (410, 209), (386, 206), (382, 184)],
                [(122, 267), (195, 265), (200, 276), (150, 284), (122, 290)],  # the black gap by the neck; the green under the tail
                # v3: the green background between the tail and the left arm (review r1: it lit as a flat cream patch)
                [(124, 287), (192, 285), (194, 300), (190, 314), (178, 318), (153, 318), (132, 302)],
                # v3: the green under the left wing, left of the membrane's dark edge (below the wing's top bone)
                [(150, 108), (224, 109), (230, 130), (230, 168), (224, 182), (160, 180)],
                # v3: the dark night sky under the right wing's bone, inside its grey outline (v2 cut it with a straight diagonal)
                [(496, 156), (551, 155), (551, 226), (498, 226), (495, 212)]],
        "flame": [[(30, 80), (180, 80), (195, 150), (205, 200), (300, 190), (300, 205), (190, 225), (180, 255), (30, 255)],
                  [(30, 255), (95, 255), (100, 330), (90, 390), (30, 390)]],
        # v4: the flame breath spills out of the window over the frame at the upper left (the window's edge cut its glow off)
        "flame_out": [[(0, 66), (40, 66), (40, 252), (0, 252)]],
        # v5: black sky pockets the cut let in, cut after it: (seed, polygon). The sky right of the torso and thigh below the right arm
        # (left to the torso's outline, up to the arm, right to the claw); the strip right of the neck's outline from the horn down to
        # the shoulder (the outline fades at y 210, so the polygon stops there: the shoulder is body, lit blue in the photo); the
        # channel under the jaw, between the left wing's arm, the jaw and the left arm (black in en-tilted-zoom.jpg)
        "sky": [((420, 280), [(376, 236), (452, 236), (466, 296), (452, 352), (354, 352), (354, 300), (370, 262)]),
                ((395, 150), [(368, 100), (402, 98), (418, 112), (416, 160), (404, 207), (384, 207), (374, 200), (362, 140)]),
                ((310, 180), [(296, 138), (320, 138), (322, 170), (352, 180), (354, 203), (340, 207), (318, 200), (296, 186)])],
        # v3: the right wing's tip pops out of the art window over the frame (the window's edge cut it with a straight line)
        "out": [[(549, 85), (558, 86), (574, 108), (589, 135), (597, 160), (597, 179), (588, 178), (575, 163), (563, 152), (550, 145)]],
    },
    "ex15-101": {  # Mew: body, feet, the tail to its tip and the thin tail loop at lower left (v3: the teal loop, not the cream splash line
        # v2 took for it); the splash and background between the belly and the tail are not (v2 lit them as a flat wedge)
        "fgl": [([(150, 258), (128, 265), (113, 280), (106, 305), (106, 330), (112, 355), (130, 370), (160, 378), (185, 381)], 10)],
        "bg": [(132, 300, 6), (134, 335, 6), (70, 355, 6)],
        "bgp": [[(258, 222), (268, 247), (300, 270), (322, 292), (338, 292), (320, 296), (285, 294), (266, 288), (260, 262), (257, 240)]],
        # the tail's oval tip runs out of the window over the frame (top right)
        "out": [[(553, 92), (580, 95), (592, 105), (591, 118), (576, 136), (553, 156)]],
    },
}


def segment(rgb, win, v1, fix):
    """GrabCut in a narrow band round the v1 blob plus the corrections: inside it surely Pokémon, 12 px out surely not."""
    z = win > 0.5
    add = np.zeros((H, W), np.uint8)
    for (x, y, r) in fix.get("fg", []):
        cv2.circle(add, (x, y), r, 1, -1)
    for poly in fix.get("fgp", []):
        cv2.fillPoly(add, [np.array(poly, np.int32)], 1)
    for line, width in fix.get("fgl", []):
        cv2.polylines(add, [np.array(line, np.int32)], False, 1, width)
    union = (v1 > 0.5) | (add > 0)
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    m[ndi.binary_dilation(union, iterations=12)] = cv2.GC_PR_BGD
    m[union] = cv2.GC_PR_FGD
    m[ndi.binary_erosion(union, iterations=18)] = cv2.GC_FGD
    for (x, y, r) in fix.get("bg", []):
        cv2.circle(m, (x, y), r, cv2.GC_BGD, -1)
    for poly in fix.get("bgp", []):
        cv2.fillPoly(m, [np.array(poly, np.int32)], cv2.GC_BGD)
    for (x, y, r) in fix.get("fg", []):
        cv2.circle(m, (x, y), max(r - 2, 1), cv2.GC_FGD, -1)
    for line, width in fix.get("fgl", []):
        cv2.polylines(m, [np.array(line, np.int32)], False, cv2.GC_FGD, max(width - 2, 1))
    m[~z] = cv2.GC_BGD
    cv2.setRNGSeed(7)
    img = np.ascontiguousarray(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    cv2.grabCut(img, m, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    sil = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & z
    sil = ndi.binary_opening(sil, iterations=1)
    lab, n = ndi.label(sil)
    if n:
        sizes = ndi.sum(sil, lab, range(1, n + 1))
        sil = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(150, 0.03 * sizes.max())])
    holes = ndi.binary_fill_holes(sil) & ~sil
    hl, nh = ndi.label(holes)
    if nh:
        area = ndi.sum(np.ones((H, W)), hl, np.arange(1, nh + 1))
        sil |= np.isin(hl, 1 + np.flatnonzero(area < 400))
    return sil


def sky_cut(rgb, sil, cuts):
    """Take hand-picked pockets of dark sky out of a finished silhouette: from each seed, the 4-connected pixels darker than SKY_DARK
    inside its polygon (the bright printed outline stops the flood), plus their dark fringe; then any island left mostly inside the
    polygons (a star, a stray fringe pixel). Runs after the main cut, so it changes nothing outside the polygons."""
    if not cuts:
        return sil
    mx = rgb.max(axis=2)
    out = sil.copy()
    zones = np.zeros((H, W), bool)
    for (sx, sy), poly in cuts:
        z = np.zeros((H, W), np.uint8)
        cv2.fillPoly(z, [np.array(poly, np.int32)], 1)
        z = z > 0
        zones |= z
        lab, _ = ndi.label((mx < SKY_DARK) & z)
        k = lab[sy, sx]
        if not k:
            raise SystemExit(f"sky seed {(sx, sy)} is not dark")
        pocket = lab == k
        pocket |= ndi.binary_dilation(pocket, iterations=2) & z & (mx < SKY_FRINGE)
        out &= ~pocket
    lab, n = ndi.label(out)
    if n:
        size = ndi.sum(out, lab, np.arange(1, n + 1))
        inside = ndi.sum(zones, lab, np.arange(1, n + 1))
        out &= ~np.isin(lab, 1 + np.flatnonzero((size < 80) & (inside >= 0.5 * size)))
    return out


def flames(rgb, win, polys):
    """Flame-coloured pixels (orange, red, yellow-white fire) inside the flame polygons, softened."""
    zone = np.zeros((H, W), np.uint8)
    for poly in polys:
        cv2.fillPoly(zone, [np.array(poly, np.int32)], 1)
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    fire = (r > 150) & (r > b + 60) & (r >= g)
    fire = ndi.binary_closing(fire, iterations=2) & (zone > 0) & (win > 0.5)
    lab, n = ndi.label(fire)
    if n:
        sizes = ndi.sum(fire, lab, range(1, n + 1))
        fire = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40])
    return np.clip(ndi.gaussian_filter(fire.astype(np.float32), 1.2) * 1.3, 0, 1)


def flames_out(rgb, polys):
    """Flame pixels outside the window (over the frame): orange and red fire, not the yellow border nor the dark smoke."""
    zone = np.zeros((H, W), np.uint8)
    for poly in polys:
        cv2.fillPoly(zone, [np.array(poly, np.int32)], 1)
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    border = (np.abs(r - g) < 22) & (b > 95)
    fire = (r > 120) & (r > b + 50) & ~border
    fire = ndi.binary_closing(fire, iterations=2) & (zone > 0) & ~border
    lab, n = ndi.label(fire)
    if n:
        sizes = ndi.sum(fire, lab, range(1, n + 1))
        fire = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 40])
    return np.clip(ndi.gaussian_filter(fire.astype(np.float32), 1.0) * 1.3, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default="")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    os.makedirs(OUT, exist_ok=True)
    for cid in ("ex13-102", "ex15-100", "ex15-101"):
        if only and cid not in only:
            continue
        s, n = cid.split("-")
        im = Image.open(os.path.join(ROOT, "assets/cards", s, f"{n}.webp")).convert("RGBA")
        rgb = np.array(Image.alpha_composite(Image.new("RGBA", im.size, (128, 128, 128, 255)), im).convert("RGB"))
        win = exd.window_alpha(cid, "star", False)
        v1 = np.asarray(Image.open(os.path.join(OUT, f"{cid}-refractor-v1.webp")).convert("RGBA").resize((W, H), Image.BILINEAR))[..., 3] / 255.0
        fix = FIX.get(cid, {})
        sil = sky_cut(rgb, segment(rgb, win, v1, fix), fix.get("sky"))
        alpha = np.clip((ndi.gaussian_filter(sil.astype(np.float32), 0.8) - 0.1) / 0.8, 0, 1) * win
        if cid in BODY_LEVEL:  # two levels: the pale parts at 1, the saturated body at BODY_LEVEL
            hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32) / 255.0
            pale = np.clip((0.42 - hsv[..., 1]) / 0.14, 0, 1) * np.clip((hsv[..., 2] - 0.5) / 0.15, 0, 1)
            pale = np.clip(ndi.gaussian_filter(pale, 1.2), 0, 1)
            level = BODY_LEVEL[cid] + (1 - BODY_LEVEL[cid]) * pale
            if cid in WARM_LEVEL and fix.get("warm"):  # v5: warm pale ink in the polygons drops to WARM_LEVEL
                hue = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[..., 0].astype(np.float32) * 2
                cool = np.clip((hue - 130) / 30, 0, 1) * np.clip((310 - hue) / 30, 0, 1)  # blue-grey, cyan, lilac
                cool = np.maximum(cool, np.clip((0.12 - hsv[..., 1]) / 0.05, 0, 1))  # near-white, near-grey
                cool = np.clip(ndi.gaussian_filter(cool, 1.2), 0, 1)
                zone = np.zeros((H, W), np.uint8)
                for poly in fix["warm"]:
                    cv2.fillPoly(zone, [np.array(poly, np.int32)], 1)
                warm = (1 - cool) * np.clip(ndi.gaussian_filter(zone.astype(np.float32), 2.0), 0, 1)
                level = level - (1 - WARM_LEVEL[cid]) * pale * warm
            alpha = alpha * level
        body = alpha.copy()
        if fix.get("flame"):
            fl = flames(rgb, win, fix["flame"]) * win
            if fix.get("flame_out"):
                fl = np.maximum(fl, flames_out(rgb, fix["flame_out"]))
            alpha = np.maximum(alpha, fl * FLAME_ALPHA)
            if cid in FLAME_FILE:  # the flames outside the body, the whole card at half size (WebKit decodes it synchronously)
                f = np.clip(fl * (1 - body), 0, 1)
                small = cv2.resize(f, (W // 2, (H + 1) // 2), interpolation=cv2.INTER_AREA)
                fpath = os.path.join(OUT, f"{cid}-flame-v{FLAME_FILE[cid]}.webp")
                px = (small * 255 + 0.5).clip(0, 255).astype(np.uint8)
                if os.path.exists(fpath) and np.array_equal(np.asarray(Image.open(fpath).convert("L")), px):
                    print(cid, "flame unchanged", os.path.basename(fpath))
                else:  # a changed flame file needs a new FLAME_FILE version (assets are cached as immutable)
                    Image.fromarray(px, "L").save(fpath, lossless=True, quality=100, method=6)
                    print(cid, "flame", round(float(f.mean()), 4), os.path.getsize(fpath))
        if fix.get("out"):  # parts of the Pokémon that leave the window (drawn by hand, feathered)
            out_m = np.zeros((H, W), np.uint8)
            for poly in fix["out"]:
                cv2.fillPoly(out_m, [np.array(poly, np.int32)], 1)
            alpha = np.maximum(alpha, np.clip(ndi.gaussian_filter(out_m.astype(np.float32), 0.8), 0, 1))
        out = np.zeros((H, W, 4), np.uint8)
        out[..., :3] = 255
        out[..., 3] = (alpha * 255 + 0.5).astype(np.uint8)
        path = os.path.join(OUT, f"{cid}-refractor-v{CARD_VERSION.get(cid, VERSION)}.webp")
        Image.fromarray(out, "RGBA").save(path, lossless=True, quality=100, method=6, exact=True)
        print(cid, round(float(alpha.mean()), 3), os.path.getsize(path))
        if a.preview:
            os.makedirs(a.preview, exist_ok=True)
            ov = rgb.astype(np.float32) * (1 - 0.45 * alpha[..., None]) + np.array([255, 0, 220], np.float32) * 0.45 * alpha[..., None]
            Image.fromarray(ov[64:400, 30:570].clip(0, 255).astype(np.uint8)).resize((1080, 672)).save(os.path.join(a.preview, f"{cid}.jpg"))


if __name__ == "__main__":
    main()
