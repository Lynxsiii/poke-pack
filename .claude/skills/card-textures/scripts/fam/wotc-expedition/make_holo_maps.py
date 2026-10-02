#!/usr/bin/env python3
"""Draw the foil map of every Expedition Rare Holo (ecard1 1-32) from the holo scan and its registered non-holo twin.

Family wotc-expedition. Real card (photos in /mnt/project-files/holo-remaster/wotc-expedition/refs/: Dragonite 9, Blastoise 4,
Gengar 13 holos; the earlier Pokemon Holo tilt clips of Butterfree 5, Mewtwo 20, Blastoise 4): the foil is the art window's
BACKGROUND, wherever the holo print drops its background ink to bare foil (a dark navy starfield with pixel-cluster cosmos in
the scan: Charizard 6, Dragonite 9, Mewtwo 20, Venusaur 30 ...) or thins it so the foil shows through with sparkle
(Gengar 13's ground, Alakazam 1, Blastoise 4's mist); the Pokemon is matte ink, and so are the border, name bar and text box.
The ladder marks, the 13 strip slots and the gold e logo are foil too (the twin prints them yellow, as the dot code and blue).
The era's maps (assets/foil/wotc-ecard/holo-ecard1-<n>-v1.webp) were the window times a blurred sparkle density: soft clouds
that ignored the Pokemon.

Here the holo print is compared with the twin print of the same art (twins.py: same name, SIFT affine registration, colour
matched on the frame):
  window   alpha = smoothstep(DE0, DE1) of the CIELAB difference holo vs twin (blurred 2 px), snapped to the art's edges by a
           guided filter on the holo scan: bare foil (the twin's sky replaced) comes out at 1, ink thinned over foil part way,
           the Pokemon (same ink in both prints) at 0.
  gate     the Pokemon is sometimes recoloured between the prints (Arbok 3: purple-grey on the holo, violet on the twin), which
           the difference alone reads as foil. The foil is where the holo scan carries its sparkle: dots (local maxima of the
           holo's lightness detail, 2.5 px, not matched in the twin) counted per area (Gaussian 9 px) and compared with the
           median count inside the difference zone; dense = foil, empty = ink. Where the holo is far darker than the twin
           (bare navy foil, scanned dark) passes too. The gate is snapped to the art by a wide guided filter and multiplies
           the window alpha. PROTECT lists hand-drawn polygons (card px) for anything the gate still lets through.
  frame    the ladder column, the strip below the number line and the e logo corner: where the holo is darker than the twin
           (the marks are bare foil in the holo print, yellow in the twin).
  RGB      the holo scan's own cosmos: its dots (2 px) and clusters (8 px) brighter than their surroundings and not in the
           twin's art, x the alpha. The CSS lights these, so the dots that flash are the ones printed on the card.

Output: assets/foil/fam/wotc-expedition/holo-ecard1-<n>-v1.webp, 600 x 838 RGBA (lossy RGB, lossless alpha).

    python3 .claude/skills/card-textures/scripts/fam/wotc-expedition/make_holo_maps.py [--only 6,9] [--sheet out.jpg]

Deterministic (no randomness; twins.py seeds its RANSAC).
"""
import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import twins  # noqa: E402

OUT = os.path.join(twins.ROOT, "assets", "foil", "fam", "wotc-expedition")
W, H = twins.W, twins.H

DE0, DE1 = 9.0, 30.0       # CIELAB difference: below DE0 the prints agree (matte ink), above DE1 the holo is bare foil
GUIDE_R, GUIDE_EPS = 4, 4e-3
DOT_T, DOT_SIGMA = 14.0, 9.0   # dot contrast (L*) and the density window of the sparkle gate
GATE0, GATE1 = 0.12, 0.45      # density / median zone density: below GATE0 ink, above GATE1 foil
# Hand-drawn polygons (card px, 600 x 838) where the Pokemon's ink differs between the two scans with no foil under it.
PROTECT = {}


def _tile(pts, ox, oy, k=0.893):
    """Hand-picked points read off the review sheet (tile offset ox, oy; sheet scale k) -> card px."""
    return [(20 + (x - ox) / k, 60 + (y - oy) / k) for x, y in pts]


def _ellipse(cx, cy, rx, ry, ox, oy, n=40):
    import math
    return _tile([(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)], ox, oy)


# the recoloured Pokemon (read off the overlay sheet): Arbok 3's cobra, Cloyster 8's shell, Weezing 32's two bodies
PROTECT[3] = [_tile([(145, 160), (175, 112), (215, 88), (262, 84), (303, 100), (338, 140), (350, 190), (352, 245), (335, 285), (300, 306),
                     (250, 310), (200, 306), (165, 282), (148, 235)], 0, 0)]
PROTECT[8] = [_tile([(1255, 62), (1300, 48), (1335, 98), (1380, 38), (1420, 38), (1510, 28), (1510, 315), (1335, 315), (1268, 282), (1245, 200),
                     (1248, 120)], 1000, 0)]
PROTECT[32] = [_ellipse(1168, 548, 122, 98, 1000, 375), _ellipse(1388, 520, 78, 92, 1000, 375)]


def lab(rgb):
    return cv2.cvtColor((np.clip(rgb, 0, 255) / 255).astype(np.float32), cv2.COLOR_RGB2LAB)


def blur(x, s):
    return cv2.GaussianBlur(x, (0, 0), s)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def guided(guide, p, r, eps):
    """He et al.'s guided filter with a colour guide (H x W x 3, 0..1): p follows the guide's edges."""
    def box(x):
        return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), normalize=True, borderType=cv2.BORDER_REFLECT)
    mean_i = [box(guide[..., c]) for c in range(3)]
    mean_p = box(p)
    cov = np.stack([box(guide[..., c] * p) - mean_i[c] * mean_p for c in range(3)], -1)
    var = np.empty(p.shape + (3, 3), np.float32)
    for i in range(3):
        for j in range(3):
            var[..., i, j] = box(guide[..., i] * guide[..., j]) - mean_i[i] * mean_i[j] + (eps if i == j else 0.0)
    a = np.linalg.solve(var, cov[..., None])[..., 0]
    b = mean_p - sum(a[..., c] * mean_i[c] for c in range(3))
    return sum(box(a[..., c]) * guide[..., c] for c in range(3)) + box(b)


def regions():
    """Frame zones where the holo print's foil marks sit: the ladder column, the slot strip, the e logo corner."""
    win = twins.window_mask()
    reg = np.zeros((H, W), bool)
    reg[:, : int(0.075 * W)] = True                      # ladder marks
    reg[int(0.925 * H):, int(0.22 * W):] = True          # the 13 slots
    reg[int(0.885 * H):, : int(0.22 * W)] = True         # the e logo
    return reg & ~win


def protect_mask(n):
    m = Image.new("L", (W, H), 0)
    for poly in PROTECT.get(n, []):
        ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
    return blur(np.asarray(m, np.float32) / 255, 2.0)


def sparkle_gate(lh, lt, inner, raw, holo):
    """1 where the holo scan carries the foil's sparkle (or is scanned far darker than the twin), 0 on recoloured ink."""
    l_h, l_t = lh[..., 0], lt[..., 0]
    c = (l_h - blur(l_h, 2.5)) - np.clip(l_t - blur(l_t, 2.5), 0, None)
    peak = cv2.dilate(c, np.ones((3, 3), np.uint8))
    dots = ((c >= peak - 1e-3) & (c > DOT_T)).astype(np.float32) * inner
    dens = blur(dots, DOT_SIGMA)
    core = (raw > 0.5) & (inner > 0)
    ref = np.median(dens[core]) if core.sum() > 500 else np.percentile(dens[inner > 0], 80)
    g = smoothstep(GATE0, GATE1, dens / (ref + 1e-6))
    g = np.maximum(g, smoothstep(22, 38, l_t - l_h))
    return np.clip(guided(holo / 255.0, g.astype(np.float32), 10, 1e-2), 0, 1)


def build(n):
    holo = twins.scan(n)[..., :3].astype(np.float32)
    twin = twins.registered_twin(n)
    lh, lt = lab(holo), lab(twin)
    win = twins.window_mask().astype(np.uint8)
    inner = cv2.erode(win, np.ones((5, 5), np.uint8)).astype(np.float32)

    # window: where the holo print departs from the twin's art
    de = blur(np.linalg.norm(lh - lt, axis=-1), 2.0)
    raw = smoothstep(DE0, DE1, de) * inner
    zone = np.clip(guided(holo / 255.0, raw.astype(np.float32), GUIDE_R, GUIDE_EPS), 0, 1) * inner
    zone *= sparkle_gate(lh, lt, inner, raw, holo) * (1 - protect_mask(n))

    # frame: ladder marks, slots, e logo (bare foil in the holo print: darker than the twin's yellow)
    de_sharp = np.linalg.norm(lh - lt, axis=-1)
    darker = lt[..., 0] - lh[..., 0]
    frame = np.zeros((H, W), np.float32)
    reg = regions()
    frame[reg] = np.maximum(smoothstep(22, 45, de_sharp), smoothstep(15, 35, darker))[reg]
    frame = np.clip(blur(frame, 0.7) * 1.15, 0, 1)

    alpha = np.maximum(zone, frame)

    # RGB: the holo's own dots and clusters, brighter than their surroundings and not in the twin's art
    lH, lT = lh[..., 0], lt[..., 0]
    dots = np.clip((lH - blur(lH, 1.5)) - np.clip(lT - blur(lT, 1.5), 0, None) - 1.5, 0, None)
    clusters = np.clip((lH - blur(lH, 4.0)) - np.clip(lT - blur(lT, 4.0), 0, None) - 3.0, 0, None)
    spark = np.clip(dots / 10.0 + clusters / 18.0, 0, 1)
    # a soft floor so the bare foil between the dots still catches some light in the RGB-lit layers
    spark = np.clip(np.maximum(spark, 0.0), 0, 1)
    return alpha, spark, zone, frame


def save(n):
    os.makedirs(OUT, exist_ok=True)
    alpha, spark, zone, frame = build(n)
    g = np.clip(spark * 255 + 0.5, 0, 255).astype(np.uint8)
    a = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    path = os.path.join(OUT, f"holo-ecard1-{n}-v1.webp")
    Image.fromarray(np.dstack([g, g, g, a]), "RGBA").save(path, quality=88, alpha_quality=100, method=6)
    w = twins.window_mask()
    print(f"ecard1-{n:<3} twin {twins.pair(n)['twin']:<3} {os.path.getsize(path):>6} bytes  window foil {zone[w].mean():.2f}"
          f"  bare {(zone[w] > 0.8).mean():.2f}")
    return alpha, spark


def sheet_cell(n, alpha, spark):
    holo = twins.scan(n)[..., :3].astype(np.float32)
    over = holo * (1 - 0.55 * alpha[..., None]) + np.array([255, 0, 255], np.float32) * 0.55 * alpha[..., None]
    a3 = np.repeat((alpha * 255)[..., None], 3, -1)
    s3 = np.repeat((spark * alpha * 255)[..., None], 3, -1)
    row = np.concatenate([holo, a3, s3, over], 1).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(row).resize((800, 279), Image.LANCZOS)
    ImageDraw.Draw(im).text((4, 4), f"{n} {twins.data()[n]['name']}", fill=(255, 0, 255))
    return im


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated holo numbers (default 1-32)")
    ap.add_argument("--sheet", help="write review sheets (scan | alpha | lit dots | overlay) to <path>-<k>.jpg")
    ap.add_argument("--contact", help="write one contact sheet of the window overlays (magenta = foil) to <path>")
    args = ap.parse_args()
    nums = [int(x) for x in args.only.split(",")] if args.only else list(range(1, 33))
    built = {n: save(n) for n in nums}
    cells = [sheet_cell(n, *built[n]) for n in nums] if args.sheet else []
    if args.contact:
        tiles = []
        for n in nums:
            holo = twins.scan(n)[..., :3].astype(np.float32)
            a = built[n][0][..., None]
            over = (holo * (1 - 0.6 * a) + np.array([255, 0, 255], np.float32) * 0.6 * a)[60:460, 20:580]
            im = Image.fromarray(over.clip(0, 255).astype(np.uint8)).resize((280, 200), Image.LANCZOS)
            ImageDraw.Draw(im).text((3, 3), str(n), fill=(255, 255, 0))
            tiles.append(im)
        cs = Image.new("RGB", (4 * 280, 200 * ((len(tiles) + 3) // 4)))
        for i, im in enumerate(tiles):
            cs.paste(im, ((i % 4) * 280, (i // 4) * 200))
        cs.save(args.contact, quality=86)
        print(args.contact)
    if args.sheet:
        base, ext = os.path.splitext(args.sheet)
        for k in range(0, len(cells), 8):
            part = cells[k:k + 8]
            sh = Image.new("RGB", (800, 283 * len(part)), (0, 0, 0))
            for i, im in enumerate(part):
                sh.paste(im, (0, i * 283))
            sh.save(f"{base}-{k // 8}{ext}", quality=85)
            print(f"{base}-{k // 8}{ext}")
