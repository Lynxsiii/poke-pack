#!/usr/bin/env python3
"""
Per-card foil maps (v2) for the ex-gold-star holo family: the Gold Star Pokémon of ex7-ex16, cosmos prints (the three
refractor stars have their own maps, make_refractor_star_maps.py).

The real card (photos and SOURCES.txt in /mnt/project-files/holo-remaster/ex-gold-star/refs/): a plain yellow border and frame,
an art window whose BACKGROUND is fine silver-white glitter with a few cyan, green and gold shards and a streak of light that
moves with the tilt, and a Pokémon that stays matte. No rainbow wash.

For every face (list_cards.mjs, same folder) this reads assets/cards/<set>/<n>.webp (600 x 838) and writes
assets/foil/fam/ex-gold-star/<card id>-v2.webp, a lossless RGBA image registered to the scan:

  ALPHA  the foil ground: the window's background. The Pokémon is cut with GrabCut (seeded from the card's own cosmos shards
         as background, the window's centre as Pokémon, plus the hand dabs in HINTS for the cards where that fails) and
         removed from the ground; the ground is the soft density of the scan's shards.
  RGB    fine glitter: the scan's own sparkles plus procedural flecks and a few larger shards on the ground, mostly near-white
         (PALETTE), some cyan and green, a little gold and pink. The CSS lights each dot in its own colour; it lays no spectrum.

Deterministic (colours seeded by crc32 of the id). Usage (repo root):
  node .claude/skills/card-textures/scripts/fam/ex-gold-star/list_cards.mjs > /tmp/gs.json
  python3 .claude/skills/card-textures/scripts/fam/ex-gold-star/make_ex_gold_star_maps.py --cards /tmp/gs.json [--only id,id] [--debug-dir <dir>]
Writes only into assets/foil/fam/ex-gold-star/ (and --debug-dir). Needs numpy, scipy, opencv, Pillow.
"""
import argparse
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
MAP_VERSION = 2
W, H = 600, 838

_spec = importlib.util.spec_from_file_location("exmaps", os.path.join(HERE, "..", "ex-pokemon-ex", "make_ex_pokemon_ex_maps.py"))
exmaps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exmaps)


def window_mask():
    a = np.asarray(Image.open(os.path.join(ROOT, "assets/foil/ex-ex/win-A-basic.webp")).convert("RGBA"))[..., 3] / 255.0
    return ndi.gaussian_filter(a.astype(np.float32), 0.6)


PALETTE = [  # (weight, hue range in degrees, saturation range): the real cosmos is silver-white glitter with cyan and green shards
    (0.58, (0, 360), (0.0, 0.10)),
    (0.22, (175, 215), (0.35, 0.75)),
    (0.12, (110, 160), (0.4, 0.8)),
    (0.05, (40, 62), (0.3, 0.6)),
    (0.03, (290, 330), (0.25, 0.5)),
]


def glitter_colors(rng, n):
    """n colours: mostly near-white, some cyan, green, a little gold and pink (the cosmos' own mix, not a rainbow)."""
    w = np.array([p[0] for p in PALETTE])
    pick = rng.choice(len(PALETTE), size=n, p=w / w.sum())
    out = np.zeros((n, 3), np.float32)
    for i, (_, hr, sr) in enumerate(PALETTE):
        k = np.flatnonzero(pick == i)
        if not len(k):
            continue
        h = rng.uniform(*hr, len(k)) / 360.0
        sat = rng.uniform(*sr, len(k))
        v = rng.uniform(0.7, 1.0, len(k))
        c = np.zeros((len(k), 3), np.float32)
        hh = (h * 6) % 6
        f = hh - np.floor(hh)
        i6 = np.floor(hh).astype(int)
        p_, q_, t_ = v * (1 - sat), v * (1 - sat * f), v * (1 - sat * (1 - f))
        tab = [(v, t_, p_), (q_, v, p_), (p_, v, t_), (p_, q_, v), (t_, p_, v), (v, p_, q_)]
        for j in range(len(k)):
            c[j] = tab[i6[j]][0][j], tab[i6[j]][1][j], tab[i6[j]][2][j]
        out[k] = c
    return out


def stamp(canvas, ys, xs, cols, size):
    """Draw a small diamond/plus of the given radius at each point (max-composite)."""
    r = size
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if abs(dx) + abs(dy) > r:
                continue
            fall = 1.0 - 0.28 * (abs(dx) + abs(dy))
            y = np.clip(ys + dy, 0, H - 1)
            x = np.clip(xs + dx, 0, W - 1)
            np.maximum.at(canvas, (y, x), cols * fall)


# Hand hints per card, scan pixels (x, y, radius): FG = surely the Pokémon, BG = surely background (sky, scenery, glitter).
# Everything else is GrabCut's. The Pokémon is matte on the real card, so no glitter is drawn on it.
HINTS = {
    "ex10-113": ([(259, 205, 22), (212, 146, 20), (107, 246, 16), (295, 264, 20), (359, 129, 22), (448, 105, 12), (506, 188, 14), (471, 317, 14), (418, 358, 8)],
                 [(71, 305, 12), (365, 293, 12), (546, 135, 14), (538, 224, 14), (504, 108, 12), (239, 101, 14), (184, 135, 12)]),
    "ex13-103": ([(80, 185, 14)], [(128, 215, 12)]),
    "ex11-111": ([(400, 245, 18), (460, 300, 12), (430, 205, 14), (180, 310, 14), (165, 350, 10), (385, 105, 10), (395, 150, 10)], []),
    "ex11-113": ([(90, 320, 18), (60, 290, 14), (140, 350, 14), (190, 300, 12), (170, 380, 8), (50, 357, 12), (50, 335, 10), (140, 385, 8)], []),
    "ex12-92": ([(50, 215, 16), (55, 325, 14), (250, 355, 14), (430, 365, 12)], []),
    "ex14-99": ([(55, 150, 22)], []),
    "ex7-109": ([], [(440, 130, 14), (520, 125, 12), (300, 105, 10), (480, 345, 8), (560, 350, 8), (60, 140, 12)]),
    "ex7-107": ([(271, 276, 28), (242, 129, 14), (448, 141, 14), (330, 317, 14), (201, 323, 16), (418, 335, 8)],
                [(71, 129, 12), (71, 246, 12), (401, 105, 10), (495, 352, 10)]),
    "ex7-108": ([(322, 264, 28), (334, 188, 24), (363, 129, 16), (192, 264, 12), (334, 352, 10), (392, 294, 12)],
                [(98, 158, 14), (510, 305, 12), (98, 335, 12)]),
    "ex8-105": ([(334, 266, 26), (216, 254, 18), (475, 278, 14), (481, 172, 10), (98, 260, 8), (245, 365, 8)],
                [(98, 131, 14), (334, 113, 14), (510, 365, 12), (98, 359, 12)]),
    "ex8-106": ([(212, 276, 26), (124, 264, 16), (301, 129, 12), (389, 129, 12), (495, 129, 10), (418, 205, 10), (389, 246, 8), (424, 346, 8), (183, 182, 8), (71, 335, 10)],
                [(260, 190, 14), (536, 246, 10), (536, 352, 10), (95, 129, 12), (83, 188, 10)]),
    "ex8-107": ([(145, 205, 14), (245, 305, 14), (375, 346, 14), (510, 323, 10), (300, 150, 8), (330, 120, 8)],
                [(275, 158, 16), (392, 188, 14), (392, 129, 14), (463, 146, 10), (304, 246, 10)]),
}


FLOOR = 1.0  # opaque: the CSS multiplies the dot layer by black wherever the map has alpha but no dot, so a half-alpha ground leaks the bands' light as a grey veil
NO_SHARD_SEED = {"ex7-109"}  # the sky's shards teach GrabCut that dark scenery is Pokémon; seed from the hand dabs only


def segment(rgb, z, shard, cid):
    """The Pokémon inside the art window: GrabCut seeded from the window's centre, the card's cosmos shards (background) and hand dabs."""
    z = z > 0.5
    ys, xs = np.nonzero(z)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    m = np.full((H, W), cv2.GC_BGD, np.uint8)
    m[z] = cv2.GC_PR_FGD
    dens = ndi.gaussian_filter(ndi.binary_dilation(shard, iterations=1).astype(np.float32), 10)
    m[z & (dens > 0.03)] = cv2.GC_PR_BGD
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    cv2.ellipse(m, (cx, cy), (int((x1 - x0) * 0.10), int((y1 - y0) * 0.10)), 0, 0, 360, cv2.GC_FGD, -1)
    fgh, bgh = HINTS.get(cid, ([], []))
    for (x, y, r) in bgh:
        cv2.circle(m, (x, y), r, cv2.GC_BGD, -1)
    for (x, y, r) in fgh:
        cv2.circle(m, (x, y), r, cv2.GC_FGD, -1)
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
    return ndi.binary_fill_holes(fg)


def draw(card, win, debug_dir):
    rgb, alpha = exmaps.load(card)
    z = np.clip(win * alpha, 0, 1)
    rng = np.random.default_rng(zlib.crc32(card["id"].encode()))
    # 1. the scan's own sparkles: compact bright or coloured specks over the local median (the glitter the photo caught).
    #    `shard` = the clear ones (cosmos clusters), `fine` = the small ones; the ground is drawn from the clear ones only
    #    (the Pokémon's print halftone throws fine false specks, but never compact shards)
    bg = np.stack([ndi.median_filter(rgb[..., c], size=9) for c in range(3)], -1)
    d = rgb - bg
    lum = d.mean(-1)
    chroma = np.sqrt(((d - lum[..., None]) ** 2).sum(-1))
    score = np.maximum(lum, 0) * 0.8 + chroma
    lab, n = ndi.label((score > 38) & (z > 0.5))
    shard = np.zeros((H, W), bool)
    if n:
        idx = np.arange(1, n + 1)
        area = ndi.sum(np.ones_like(score), lab, idx)
        keep = np.zeros(n + 1, bool)
        for i, sl in enumerate(ndi.find_objects(lab), start=1):
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            keep[i] = 2 <= area[i - 1] <= 80 and max(h, w) <= 12 and area[i - 1] / (h * w) >= 0.35
        shard = keep[lab]
    # 2. the cosmos' ground: where the shards are (the background), none on the Pokémon's plain ink
    dens = ndi.gaussian_filter(ndi.binary_dilation(shard, iterations=2).astype(np.float32), 11.0)
    ground = np.clip((dens - 0.02) / 0.05, 0, 1) * z
    # the real card's glitter lies over the whole background, so the ground never falls below FLOOR: a density-only ground left
    # grey blob edges in the mirror and bare patches on cards whose scan caught few shards
    ground = np.maximum(ground, FLOOR * z)
    ground = ndi.gaussian_filter(ground, 1.2)
    fg = segment(rgb, z, np.zeros_like(shard) if card["id"] in NO_SHARD_SEED else shard, card["id"])
    pk = ndi.gaussian_filter(ndi.binary_dilation(fg, iterations=3).astype(np.float32), 1.2)
    ground = ground * (1 - np.clip(pk * 3.0 - 0.5, 0, 1))
    spark = shard & ~ndi.binary_dilation(fg, iterations=3)
    # 3. the texture: the scan's sparkles (grown a pixel) plus fine procedural glitter on the ground, a few bigger shards
    tex = np.zeros((H, W, 3), np.float32)
    ys, xs = np.nonzero(spark & (ground > 0.15))
    if len(ys):
        stamp(tex, ys, xs, glitter_colors(rng, len(ys)) * rng.uniform(0.75, 1.0, (len(ys), 1)).astype(np.float32), 1)
    gy, gx = np.nonzero(ground > 0.55)
    if len(gy):
        m = len(gy)
        k = rng.random(m) < 0.0085
        pick = np.flatnonzero(k)
        stamp(tex, gy[pick], gx[pick], glitter_colors(rng, len(pick)) * rng.uniform(0.55, 1.0, (len(pick), 1)).astype(np.float32), 1)
        k2 = rng.random(m) < 0.0011
        pick2 = np.flatnonzero(k2)
        stamp(tex, gy[pick2], gx[pick2], glitter_colors(rng, len(pick2)), 2)
    tex = np.stack([ndi.gaussian_filter(tex[..., c], 0.45) for c in range(3)], -1) * 1.25
    tex = np.clip(tex, 0, 1) * (ground > 0.25)[..., None]
    rgba = np.dstack([tex * 255.0, ground * 255.0]).round().clip(0, 255).astype(np.uint8)
    rgba[..., :3][rgba[..., 3] == 0] = 0
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT_DIR, f"{card['id']}-v{MAP_VERSION}.webp"), lossless=True, quality=100, method=6)
    if debug_dir:
        rgb = np.where(fg[..., None], rgb, rgb * 0.7 + np.array([0, 40, 120], np.float32))
        vis = rgb * (1 - 0.45 * ground[..., None]) + np.array([60, 140, 255], np.float32) * 0.45 * ground[..., None]
        vis = np.where(tex.max(-1, keepdims=True) > 0.05, tex * 255, vis)
        Image.fromarray(np.concatenate([rgb, vis], 1).clip(0, 255).astype(np.uint8)).save(os.path.join(debug_dir, f"{card['id']}.png"))
    return int(spark.sum()), float(ground[win > 0.5].mean())


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
        n, cover = draw(c, win, args.debug_dir)
        print(f"{c['id']} {c['name']}: {n} dots, ground covers {cover:.2f} of the window")


if __name__ == "__main__":
    sys.exit(main())
