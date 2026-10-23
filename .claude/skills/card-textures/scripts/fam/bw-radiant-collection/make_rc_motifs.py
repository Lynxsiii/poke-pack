#!/usr/bin/env python3
"""Legendary Treasures' Radiant Collection: the per-card motif masks of the Confetti uncommons, and Mew-EX RC24's zone.

The motifs. The regular-art uncommons carry a pattern in the text box and the name bar that the site's scans lack
(Pikachu RC7: Pikachu heads, four-point sparkles, hearts, ring hearts, bolts; Growlithe RC4: rows of dashes with five-petal
flowers and hearts; Eevee RC14: a polka-dot heart, a star heart, dot chains, sparkles, hollow hearts; Stunfisk RC12: outlined
and filled hearts; Serperior RC3 vines and flowers, Piplup RC6 bubbles, Gardevoir RC10 lace, Cinccino RC19 stripes and hearts).
On the real card it is the bare foil where the box's ink is left out: darker, crisp shapes (olive on Pikachu's yellow box,
deep red on Growlithe's, brown-grey on Stunfisk's, grey on Eevee's) with the chips running on over them. Purrloin RC13's
motifs are printed in the scan already.

v3 (2026-10-22, round 3): RC4, RC7, RC12 and RC14 are drawn from photos and scans of the REAL cards (REAL below; sources in
REAL/SOURCES.md), registered onto the site's scan (SIFT + homography), as the darkening the real card shows over the site's
scan (luminance ratio, normalised by a smooth gain field that leaves out the motif and the text; the text itself is filled
in from around it). Then cleaned per card into crisp shapes:
- the evidence is smoothed (sigma 1.2-2 px at 1200 px), thresholded, closed (fills the lit chips inside a motif), its
  small holes filled (a flower's centre and a hollow heart's middle are kept), opened, small pieces dropped, contours
  smoothed;
- RC4: the rows of dashes are redrawn as clean bars (rounded ends, 7 px at 600 px) along the eight measured rows, broken
  where the real card's are and around every flower and heart; the flowers and hearts are the mask opened with a 4 px disc
  (which removes the dashes' ragged edges), each replaced by a clean five-petal flower or heart template where one fits
  (correlation 0.62 or more; two flowers run together keep their extracted shape); the name bar's two flowers, heart and half-hidden flower are stamped from a
  five-petal template (the scan is too small there); kept off the white swoosh and the energy symbols;
- RC14: the polka-dot heart is its extracted silhouette with the dots punched on the lattice measured from its holes
  (30 x 24 px centred rectangular, dots 5.1 px at 600 px); the star heart and the corner polka heart are hearts fitted to
  the photo (the lit chips break their silhouettes) with stars (37.5 x 31 px staggered lattice fitted to the photo's white
  stars) or dots punched out; the small hollow heart at the right edge is stamped;
- RC7: the bottom-left head and ring heart (the photo's glare there) are copies of their lattice neighbours one row up.
RC6, RC19 and RC10 (v3) come from the registered difference maps refs/loc/rc<n>.png of the earlier pass (no real-card image
shows their motifs clearly enough), drawn as clean shapes instead of thresholded strokes:
- RC6: the bubbles as discs with a highlight hole at the upper left (0.3 r, offset 0.36 r): the twelve big ones (their inside is
  mottled in the map and neighbours run together) placed from a Hough search of the map smoothed 3 px, spurious hits dropped,
  the top-left one and the one cut by the box's left edge placed by eye; the small ones fitted to the round pieces of the map
  smoothed 2 px; the sparkles kept as the map's own shapes;
- RC19: the vertical stripes, as a square wave of the period and phase measured on the map (38.6 px at 600 px, half on), kept
  where the map's local stripe amplitude (smoothed 12 px, the box's upper 60%) says they are: the ribbon, the bow and the
  hearts leave smooth gaps;
- RC10: the lace bands, gems and sparkles, the map's own fine lines (smoothing 0.8 px, pieces under 30 px dropped), drawn
  LIGHT (`screen`, class rcf-motif-light): on the dark purple box the bare foil reads as silvery-lavender lace in the real
  scan (refs-real/rc10.jpg), not darker.
RC3 keeps v2 (thresholded strokes of the same map).

The motif image carries its own colour: RGB is the multiply colour, alpha the motif, so `.cure` draws it as a plain
background in `multiply` with no mask (an image in a mask layer that WebKit has not decoded masks the whole layer out).
v3 colours are measured on the real images (median of the motif over the box around it): RC4 (0.55, 0.33, 0.32) deep red (the median, 0.47/0.39/0.5, pushed redder: on the scan it read maroon-brown),
RC7 (0.53, 0.59, 0.48) olive, RC12 (0.6, 0.64, 0.68) brown-grey, RC14 (0.72, 0.72, 0.77) grey; RC19 (0.82, 0.82, 0.86) a light
grey (no photo), RC6 (0.58, 0.6, 0.66) blue-grey (no photo), RC10 (0.44, 0.41, 0.52) added in `screen`.
300 x 419 px (under WebKit's 128,000 px size for asynchronous decoding), drawn at 1200 x 1676 and area-reduced.

Mew-EX RC24: the one Confetti print whose Pokemon may read smoother than its ground (one tilted photo); its old map cut Mew
out at 0, the photos of RC7, RC11, RC22 and RC25 show chips on the Pokemon. The new map keeps Mew at 0.6.

    python3 .claude/skills/card-textures/scripts/fam/bw-radiant-collection/make_rc_motifs.py [--sheet out.jpg]

Writes assets/foil/fam/bw-radiant-collection/motif-rc{4,7,10,12,14}-v3.webp, motif-rc{6,19}-v4.webp, motif-rc3-v2.webp
(RGBA, 300 x 419) and map-rc24-v3.webp (alpha, 300 x 419).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-radiant-collection"
SCANS = ROOT / "assets" / "cards" / "bw11"
LOC = Path("/mnt/project-files/holo-remaster/bw-radiant-collection/refs/loc")
REAL = Path("/home/user/holo-work/fix-bw-radiant-collection/refs-real")
SIZE = (300, 419)
S = 2                                   # working scale: 1200 x 1676 (2x the 600 x 838 scan)
SC = 4                                  # supersampling of stamped shapes over the working scale

V3 = {4: "rc4.jpg", 7: "rc7.jpg", 12: "rc12.jpg", 14: "rc14.jpg"}
V3_COLOUR = {4: (0.55, 0.33, 0.32), 7: (0.53, 0.59, 0.48), 12: (0.6, 0.64, 0.68), 14: (0.72, 0.72, 0.77),
             19: (0.82, 0.82, 0.86), 10: (0.44, 0.41, 0.52), 6: (0.58, 0.6, 0.66)}
V3_LOC = (6, 10, 19)                    # v3 drawn from refs/loc
# v4 (round 4): Piplup RC6's bubbles at half the darkening (the JP Shiny Collection 006/020 scan, same finish: soft, translucent
# bubbles only a little darker than the blue box; /home/user/holo-refs/bw-rc/RC6/), Cinccino RC19's stripes over the whole text box
# without the ragged cut-outs the map's amplitude left (no real image of RC19's motif was found to confirm them).
V4_COLOUR = {6: (0.79, 0.8, 0.83), 19: (0.82, 0.82, 0.86)}
# per card: evidence smoothing, threshold, closing radius, holes filled below (px at 1200), smallest piece kept, opening radius
CLEAN = {4: dict(sig=1.5, t=0.20, close=3, fill=260, min_a=500, open=2),
         12: dict(sig=2.0, t=0.16, close=5, fill=900, min_a=900, open=3),
         14: dict(sig=1.2, t=0.17, close=2, fill=60, min_a=300, open=2),
         7: dict(sig=1.5, t=0.18, close=4, fill=700, min_a=600, open=2)}

# v2 (refs/loc) cards
V2_CARDS = (3,)
THRESH = {3: 70}
RAMP = 55.0
MIN_AREA = 70
V2_COLOUR = {}
DEFAULT_COLOUR = (0.56, 0.56, 0.6)
# Text box and name bar on a 600 x 838 regular BW scan (x0, y0, x1, y1).
ZONES = ((150, 16, 584, 66), (20, 426, 580, 812))


def disc(r: int) -> np.ndarray:
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def zone_mask(shape) -> np.ndarray:
    z = np.zeros(shape, np.float32)
    for x0, y0, x1, y1 in ZONES:
        z[y0 * S:y1 * S, x0 * S:x1 * S] = 1
    return z


def rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), np.float32) / 255


def register(n: int):
    """The real image warped onto the site's scan, both at the working scale."""
    real, site = rgb(REAL / V3[n]), rgb(SCANS / f"RC{n}.webp")
    g = lambda a: (cv2.cvtColor(a, cv2.COLOR_RGB2GRAY) * 255).astype(np.uint8)
    sift = cv2.SIFT_create(10000)
    k1, d1 = sift.detectAndCompute(g(real), None)
    k2, d2 = sift.detectAndCompute(g(site), None)
    good = [a for a, b in cv2.BFMatcher().knnMatch(d1, d2, k=2) if a.distance < 0.75 * b.distance]
    p1 = np.float32([k1[m.queryIdx].pt for m in good])
    p2 = np.float32([k2[m.trainIdx].pt for m in good])
    h, _ = cv2.findHomography(p1, p2, cv2.RANSAC, 2.5)
    size = (600 * S, 838 * S)
    warped = cv2.warpPerspective(real, np.diag([S, S, 1.0]) @ h, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return warped, cv2.resize(site, size, interpolation=cv2.INTER_CUBIC)


def nconv(v, w, sig):
    return cv2.GaussianBlur(v * w, (0, 0), sig) / np.maximum(cv2.GaussianBlur(w, (0, 0), sig), 1e-4)


def evidence(w: np.ndarray, s: np.ndarray):
    """Relative darkening of the real card over the site's scan in the text box and name bar (0 none, 0.3-0.5 a motif)."""
    lum = lambda a: a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    lw, ls = lum(w), lum(s)
    zone = zone_mask(ls.shape)
    bg = cv2.GaussianBlur(cv2.dilate(ls, disc(7)), (0, 0), 6)
    text = cv2.dilate((ls < bg * 0.72).astype(np.uint8), disc(2)).astype(np.float32)
    ok = (1 - text) * zone
    ratio = lw / np.maximum(ls, 0.03)
    d = 1 - ratio / np.maximum(nconv(ratio, ok, 40), 1e-3)
    for _ in range(2):                  # the gain field again, without the motif
        mot = (cv2.GaussianBlur(d, (0, 0), 3) > 0.12).astype(np.float32)
        d = 1 - ratio / np.maximum(nconv(ratio, ok * (1 - mot), 40), 1e-3)
    return np.where(ok > 0, d, nconv(d, ok, 2.0)) * zone


def fill_small_holes(m: np.ndarray, max_a: int) -> np.ndarray:
    k, lab, st, _ = cv2.connectedComponentsWithStats((1 - m).astype(np.uint8), 4)
    out = m.copy()
    for i in range(1, k):
        if st[i, 4] < max_a:
            out[lab == i] = 1
    return out


def clean(d: np.ndarray, n: int) -> np.ndarray:
    p = CLEAN[n]
    m = (cv2.GaussianBlur(d, (0, 0), p["sig"]) > p["t"]).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, disc(p["close"]))
    m = fill_small_holes(m, p["fill"])
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, disc(p["open"]))
    k, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    for i in range(1, k):
        _, _, bw, bh, area = st[i]
        if area < p["min_a"] or (n != 4 and bh < 14 and bw > 60):     # crumbs; a text line or a rule
            continue
        keep[lab == i] = 1
    keep *= (zone_mask(m.shape) > 0).astype(np.uint8)
    a = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.6)
    return (np.clip((a - 0.5) * 2.5 + 0.5, 0, 1) > 0.5).astype(np.uint8)


def heart_poly(x0, y0, x1, y1, sc):
    t = np.linspace(0, 2 * np.pi, 400)
    hx = 16 * np.sin(t) ** 3
    hy = -(13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t))
    hx = (hx - hx.min()) / np.ptp(hx) * (x1 - x0) + x0
    hy = (hy - hy.min()) / np.ptp(hy) * (y1 - y0) + y0
    return np.stack([hx * S * sc, hy * S * sc], 1).astype(np.int32)


def heart(shape, box, sc=1):
    img = np.zeros((shape[0] * sc, shape[1] * sc), np.uint8)
    cv2.fillPoly(img, [heart_poly(*box, sc)], 1)
    return img


def flower(img, cx, cy, r, th):
    """Five round petals round a disc with a hole (600 px units, drawn on a SC-times canvas)."""
    f = S * SC
    for k in range(5):
        a = th + k * 2 * np.pi / 5
        cv2.circle(img, (int((cx + 0.58 * r * np.cos(a)) * f), int((cy + 0.58 * r * np.sin(a)) * f)), int(0.43 * r * f), 1, -1)
    cv2.circle(img, (int(cx * f), int(cy * f)), int(0.52 * r * f), 1, -1)
    cv2.circle(img, (int(cx * f), int(cy * f)), int(0.2 * r * f), 0, -1)


def down(big: np.ndarray, shape) -> np.ndarray:
    return cv2.resize(big.astype(np.float32), (shape[1], shape[0]), interpolation=cv2.INTER_AREA)


def stamp_fit(d: np.ndarray, cx: float, cy: float, ext: float):
    """Best five-petal flower or heart template for an object at (cx, cy) (working px) of extent ext (600 px units):
    (score, kind, size, angle, x, y) with x, y in 600 px units."""
    best = None
    for kind, sizes, angles in (("f", np.arange(8, 30, 1.0), np.deg2rad(np.arange(0, 72, 6))), ("h", np.arange(12, 40, 2.0), [0])):
        for sz in sizes:
            if not 0.8 * ext <= (2 * sz if kind == "f" else sz) <= 1.3 * ext:
                continue
            for th in angles:
                n = int((2 * sz if kind == "f" else sz) * 1.4) + 8
                big = np.zeros((n * S * SC, n * S * SC), np.uint8)
                if kind == "f":
                    flower(big, n / 2, n / 2, sz, th)
                else:
                    big = heart((n * S, n * S), (n / 2 - sz / 2, n / 2 - sz * 0.45, n / 2 + sz / 2, n / 2 + sz * 0.45), SC)
                tm = cv2.resize(big.astype(np.float32), (n * S, n * S), interpolation=cv2.INTER_AREA)
                y0, x0 = int(cy - n * S / 2) - 8, int(cx - n * S / 2) - 8
                if y0 < 0 or x0 < 0 or y0 + n * S + 16 > d.shape[0] or x0 + n * S + 16 > d.shape[1]:
                    continue
                res = cv2.matchTemplate(d[y0:y0 + n * S + 16, x0:x0 + n * S + 16], tm, cv2.TM_CCOEFF_NORMED)
                _, mv, _, ml = cv2.minMaxLoc(res)
                if best is None or mv > best[0]:
                    best = (mv, kind, sz, th, (x0 + ml[0]) / S + n / 2, (y0 + ml[1]) / S + n / 2)
    return best


def rc4(m: np.ndarray, s: np.ndarray, d: np.ndarray) -> np.ndarray:
    h, w = m.shape
    rows = (455, 502, 549.5, 597, 644, 691, 737.5, 785)
    # flowers and hearts: the mask opened with a 4 px disc, less what is left of the dashes; a piece the flower or heart
    # template fits well (correlation 0.62 or more on the evidence) is replaced by the clean template, the others (two flowers
    # run together, a flower behind the energy symbols) stay as extracted
    op = cv2.morphologyEx(m, cv2.MORPH_OPEN, disc(4 * S))
    k, lab, st, cent = cv2.connectedComponentsWithStats(op, 8)
    keep = np.zeros_like(m)
    big = np.zeros((h * SC, w * SC), np.uint8)
    ds = cv2.GaussianBlur(d, (0, 0), 1.5).astype(np.float32)
    for i in range(1, k):
        _, y, bw, bh, area = st[i]
        on_row = min(abs((y + bh / 2) / S - r) for r in rows) < 5
        if area < (9 * S) ** 2 or (on_row and bh < 17 * S and bw > bh * 1.25) or y < 100 * S:
            continue                                               # dash remnants; the name bar is stamped below
        fit = stamp_fit(ds, cent[i][0], cent[i][1], max(bw, bh) / S)
        if fit and fit[0] >= 0.62:
            _, kind, sz, th, fx, fy = fit
            if kind == "f":
                flower(big, fx, fy, sz, th)
            else:
                big = np.maximum(big, heart(m.shape, (fx - sz / 2, fy - sz * 0.45, fx + sz / 2, fy + sz * 0.45), SC))
        else:
            keep[lab == i] = 1
    objs = np.clip((cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.4) - 0.5) * 3 + 0.5, 0, 1)
    for cx, cy, r, th in ((322, 35, 11, 0.3), (341, 57, 10, 0.9), (402, 45, 13, 0.1)):
        flower(big, cx, cy, r, th)
    big = np.maximum(big, heart(m.shape, (355, 30, 380, 54), SC))
    objs = np.maximum(objs, down(big, m.shape))
    # the dashes: clean bars along the rows where the real card has them, with a gap round every object
    gap = cv2.dilate((objs > 0.5).astype(np.uint8), disc(4 * S))
    bars = np.zeros((h * SC, w * SC), np.uint8)
    th = 3.5 * S
    for yc in rows:
        cov = m[int((yc - 4) * S):int((yc + 4) * S)].mean(0)
        on = (cov > 0.45) & (gap[int(yc * S - th):int(yc * S + th) + 1].max(0) == 0)
        on[:24 * S] = False
        on[577 * S:] = False
        on = cv2.morphologyEx(on.astype(np.uint8)[None], cv2.MORPH_CLOSE, np.ones((1, 3 * S), np.uint8))[0].astype(bool)
        xs = np.flatnonzero(np.diff(np.r_[0, on.astype(int), 0]))
        for s0, s1 in zip(xs[::2], xs[1::2]):
            if s1 - s0 < 7 * S:
                continue
            p0, p1 = int((s0 + th) * SC), int((s1 - th) * SC)
            yy = int(yc * S * SC)
            cv2.rectangle(bars, (p0, int((yc * S - th) * SC)), (p1, int((yc * S + th) * SC)), 1, -1)
            cv2.circle(bars, (p0, yy), int(th * SC), 1, -1)
            cv2.circle(bars, (p1, yy), int(th * SC), 1, -1)
    a = np.maximum(objs, down(bars, m.shape))
    # never on white or grey ink (the name bar's swoosh, the energy symbols): the real card prints those over the foil
    hsv = cv2.cvtColor(s, cv2.COLOR_RGB2HSV)
    return a * np.clip((hsv[..., 1] - 0.22) / 0.1, 0, 1)


def rc14(m: np.ndarray, w: np.ndarray) -> np.ndarray:
    h, wd = m.shape
    k, lab, st, cent = cv2.connectedComponentsWithStats(m, 8)
    star_heart, corner_heart = heart(m.shape, (338, 466, 560, 664)), heart(m.shape, (503, 666, 573, 736))
    # the polka-dot heart: the largest piece left of x 200
    left = max((i for i in range(1, k) if cent[i][0] < 200 * S), key=lambda i: st[i, 4])
    drop = np.zeros_like(m)
    for i in range(1, k):
        cx, cy = cent[i] / S
        if (i == left or star_heart[int(cent[i][1]), int(cent[i][0])] or corner_heart[int(cent[i][1]), int(cent[i][0])]
                or (495 <= cx <= 585 and 590 <= cy <= 750)                     # the corner heart's and hollow heart's crumbs
                or (cy > 765 and (cx < 110 or cx > 430)) or (415 <= cx <= 480 and 700 <= cy <= 745)):  # glare crumbs
            drop[lab == i] = 1
    rest = (m & (1 - drop)).astype(np.uint8)
    lm = (lab == left).astype(np.uint8)
    sil = cv2.morphologyEx(lm, cv2.MORPH_CLOSE, disc(24))
    ff = sil.copy()
    cv2.floodFill(ff, np.zeros((h + 2, wd + 2), np.uint8), (0, 0), 1)
    sil = cv2.morphologyEx(sil | (1 - ff), cv2.MORPH_OPEN, disc(12))
    sil = (cv2.GaussianBlur(sil.astype(np.float32), (0, 0), 3) > 0.5).astype(np.uint8)

    def lattice_fit(o, v1, v2, pts):
        mtx = np.array([v1, v2]).T
        q = np.round(np.linalg.solve(mtx, (pts - o).T).T)
        return pts - (o + (mtx @ q.T).T)

    def lattice(o, v1, v2, box):
        x0, y0, x1, y1 = box
        return [o + i * v1 + j * v2 for i in range(-40, 40) for j in range(-40, 40)
                if x0 <= (o + i * v1 + j * v2)[0] <= x1 and y0 <= (o + i * v1 + j * v2)[1] <= y1]

    # dots: lattice (30, 0), (15, 12) fitted to the round holes of the polka-dot heart
    kk, _, hs, hc = cv2.connectedComponentsWithStats(1 - lm, 4)
    x, y, bw, bh, _ = st[left]
    pts = np.array([hc[j] / S for j in range(1, kk)
                    if hs[j, 0] > x and hs[j, 1] > y and hs[j, 0] + hs[j, 2] < x + bw and hs[j, 1] + hs[j, 3] < y + bh
                    and 50 * S * S < hs[j, 4] < 120 * S * S and max(hs[j, 2], hs[j, 3]) < 1.5 * min(hs[j, 2], hs[j, 3])])
    v1, v2 = np.array([30.0, 0]), np.array([15.0, 12])
    o = pts[0]
    for _ in range(5):
        o = o + lattice_fit(o, v1, v2, pts).mean(0)
    up = lambda a: cv2.resize(a, (wd * SC, h * SC), interpolation=cv2.INTER_NEAREST)
    big_l, big_c, big_s = up(sil), up(corner_heart), up(star_heart)
    for p in lattice(o, v1, v2, (0, 400, 600, 840)):
        c = (int(p[0] * S * SC), int(p[1] * S * SC))
        cv2.circle(big_l, c, int(5.1 * S * SC), 0, -1)
        cv2.circle(big_c, c, int(5.1 * S * SC), 0, -1)

    # stars: staggered lattice (37.5, 0), (18.75, 31) fitted to the photo's pale stars inside the star heart
    def star(cx, cy, r, inner=0.45):
        ang = -np.pi / 2 + np.arange(10) * np.pi / 5
        rr = np.where(np.arange(10) % 2 == 0, r, r * inner)
        return np.stack([(cx + rr * np.cos(ang)) * S * SC, (cy + rr * np.sin(ang)) * S * SC], 1).astype(np.int32)

    pale = w.min(2) - (w.max(2) - w.min(2))
    tmpl = np.zeros((40, 40), np.uint8)
    cv2.fillPoly(tmpl, [star(10, 10, 8) // SC], 1)
    res = cv2.matchTemplate((pale * star_heart).astype(np.float32), tmpl.astype(np.float32), cv2.TM_CCOEFF_NORMED)
    pk = np.argwhere((res == cv2.dilate(res, np.ones((25, 25)))) & (res > 0.35))
    pts = np.array([(xx + 20, yy + 20) for yy, xx in pk], np.float32) / S
    pts = np.array([p for p in pts if star_heart[int(p[1] * S), int(p[0] * S)]])
    u1, u2 = np.array([37.5, 0]), np.array([18.75, 31])
    best = None
    for p0 in pts:
        o2 = p0.copy()
        for _ in range(4):
            r = lattice_fit(o2, u1, u2, pts)
            near = np.hypot(r[:, 0], r[:, 1]) < 6
            if near.sum() < 3:
                break
            o2 = o2 + r[near].mean(0)
        r = lattice_fit(o2, u1, u2, pts)
        score = (np.hypot(r[:, 0], r[:, 1]) < 5).sum()
        if best is None or score > best[0]:
            best = (score, o2)
    for p in lattice(best[1], u1, u2, (300, 440, 560, 680)):
        cv2.fillPoly(big_s, [star(p[0], p[1], 8.6)], 0)
    hollow = heart(m.shape, (513, 599, 543, 625), SC)
    big_s = np.maximum(big_s, hollow - cv2.erode(hollow, disc(int(3.6 * S * SC))))
    hearts = down(np.maximum(np.maximum(big_l, big_c), big_s), m.shape)
    return np.maximum(hearts, cv2.GaussianBlur(rest.astype(np.float32), (0, 0), 0.8))


def rc7(m: np.ndarray) -> np.ndarray:
    """The photo's glare spoils the bottom-left head and ring heart: copy their lattice neighbours one row up."""
    k, lab, st, cent = cv2.connectedComponentsWithStats(m, 8)
    out = m.copy()
    for i in range(1, k):
        cx, cy = cent[i] / S
        if (cx < 140 and cy > 660) or (cy > 785 and st[i, 3] < 16 * S):    # glare streaks, a thin piece under the number
            out[lab == i] = 0

    def piece(cx0, cy0):
        i = min(range(1, k), key=lambda j: np.hypot(*(cent[j] / S - (cx0, cy0))))
        return (lab == i).astype(np.uint8)

    head, ring = piece(53, 482), piece(109, 549)                 # the top-left head, the ring heart of the row below it
    out |= np.roll(head, 289 * S, axis=0)
    out |= np.roll(np.roll(ring, 137 * S, axis=0), -6 * S, axis=1)
    return cv2.GaussianBlur(out.astype(np.float32), (0, 0), 0.8)


def motif_v3(n: int):
    if n == 19:
        return rc19_stripes()
    if n == 10:
        return rc10_lace()
    if n == 6:
        return rc6_bubbles()
    w, s = register(n)
    d = evidence(w, s)
    m = clean(d, n)
    if n == 4:
        a = rc4(m, s, d)
    elif n == 14:
        a = rc14(m, w)
    elif n == 7:
        a = rc7(m)
    else:
        a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8)
    return np.clip(cv2.resize(a, SIZE, interpolation=cv2.INTER_AREA), 0, 1)


def loc_map(n: int) -> np.ndarray:
    return np.asarray(Image.open(LOC / f"rc{n}.png").convert("L"), np.float32) / 255


def loc_zone(shape, box_only=False) -> np.ndarray:
    z = np.zeros(shape, np.float32)
    for x0, y0, x1, y1 in ZONES[1:] if box_only else ZONES:
        z[y0:y1, x0:x1] = 1
    return z


def rc19_stripes(cutouts: bool = True) -> np.ndarray:
    loc = loc_map(19)
    h, w = loc.shape
    zone = loc_zone(loc.shape, box_only=True)
    sm = cv2.GaussianBlur(loc, (0, 0), 1.5)
    hp = sm - cv2.GaussianBlur(sm, (0, 0), 20)
    period = 38.6
    xx = np.broadcast_to(np.arange(w, dtype=np.float32)[None, :], (h, w))
    c = cv2.GaussianBlur(hp * np.cos(2 * np.pi * xx / period), (0, 0), 10)
    s = cv2.GaussianBlur(hp * np.sin(2 * np.pi * xx / period), (0, 0), 10)
    rows = np.r_[440:500, 690:800]                              # rows the ribbon does not cross
    phase = np.arctan2(s[rows, 40:560].sum(), c[rows, 40:560].sum())
    amp = cv2.GaussianBlur(np.hypot(c, s), (0, 0), 12)
    reg = ((amp > np.percentile(amp[zone > 0], 40)) * zone).astype(np.uint8)
    reg = cv2.morphologyEx(reg, cv2.MORPH_OPEN, disc(15))
    reg = (cv2.GaussianBlur(reg.astype(np.float32), (0, 0), 4) > 0.5).astype(np.float32)
    if not cutouts:                                             # v4: the whole box, a soft 6 px margin
        reg = cv2.erode(zone.astype(np.uint8), disc(6)).astype(np.float32)
    reg = cv2.GaussianBlur(reg, (0, 0), 1.0)
    xs = (np.arange(w * SC) + 0.5) / SC
    wave = (np.cos(2 * np.pi * xs / period - phase) > 0).astype(np.float32).reshape(w, SC).mean(1)
    return cv2.resize(wave[None, :] * reg, SIZE, interpolation=cv2.INTER_AREA)


RC6_BIG = ((157, 485, 43), (359.5, 489.5, 32), (274.5, 652.5, 37), (476.5, 710.5, 27), (518.5, 489.5, 31), (472.5, 475.5, 28),
           (530.5, 572.5, 23), (129.5, 746.5, 23), (230.5, 795.5, 21), (559.5, 449.5, 32), (358.5, 607.5, 21), (33, 580, 24))


def rc6_bubbles() -> np.ndarray:
    loc = loc_map(6)
    h, w = loc.shape
    zone = loc_zone(loc.shape).astype(np.uint8)
    big = np.zeros((h * SC, w * SC), np.uint8)
    taken = np.zeros((h, w), np.uint8)
    for cx, cy, r in RC6_BIG:
        cv2.circle(big, (int(cx * SC), int(cy * SC)), int(r * SC), 1, -1)
        cv2.circle(taken, (int(cx), int(cy)), int(r * 1.15) + 3, 1, -1)
    for cx, cy, r in RC6_BIG:
        if cx - r > 20:                                            # no highlight on a bubble the box edge cuts
            cv2.circle(big, (int((cx - 0.36 * r) * SC), int((cy - 0.36 * r) * SC)), int(0.3 * r * SC), 0, -1)
    b = ((cv2.GaussianBlur(loc, (0, 0), 2.0) > 0.30) & (zone > 0) & (taken == 0)).astype(np.uint8)
    ff = b.copy()
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    b = cv2.morphologyEx(b | (1 - ff), cv2.MORPH_OPEN, disc(2))
    sharp = ((cv2.GaussianBlur(loc, (0, 0), 1.0) > 0.42) & (zone > 0)).astype(np.uint8)
    other = np.zeros_like(b)
    k, lab, st, cent = cv2.connectedComponentsWithStats(b, 8)
    for i in range(1, k):
        _, _, bw, bh, area = st[i]
        if area < 20:
            continue
        cnts, _ = cv2.findContours((lab == i).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        per = cv2.arcLength(cnts[0], True)
        if 4 * np.pi * area / max(per * per, 1) > 0.62 and max(bw, bh) < 1.35 * min(bw, bh):     # a small bubble
            r = np.sqrt(area / np.pi)
            cx, cy = cent[i]
            cv2.circle(big, (int(cx * SC), int(cy * SC)), int(r * SC), 1, -1)
            if r > 9:
                cv2.circle(big, (int((cx - 0.38 * r) * SC), int((cy - 0.38 * r) * SC)), int(0.2 * r * SC), 0, -1)
        else:                                                                                       # a sparkle
            other |= ((lab == i) & (sharp > 0)).astype(np.uint8)
    other = cv2.morphologyEx(other, cv2.MORPH_OPEN, disc(1))
    k, lab, st, _ = cv2.connectedComponentsWithStats(other, 8)
    keep = np.zeros_like(other)
    for i in range(1, k):
        if st[i, 4] >= 25:
            keep[lab == i] = 1
    big *= cv2.resize(zone, (w * SC, h * SC), interpolation=cv2.INTER_NEAREST)
    a = np.maximum(down(big, (h, w)), cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 0.7))
    return cv2.resize(a, SIZE, interpolation=cv2.INTER_AREA)


def rc10_lace() -> np.ndarray:
    loc = loc_map(10)
    zone = loc_zone(loc.shape)
    sm = cv2.GaussianBlur(loc, (0, 0), 0.8)
    b = ((sm > 0.36) * zone).astype(np.uint8)
    k, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
    keep = np.zeros_like(b)
    for i in range(1, k):
        if st[i, 4] >= 30:
            keep[lab == i] = 1
    keep = cv2.dilate(keep, disc(1))
    a = cv2.GaussianBlur(np.clip((sm - 0.28) / 0.22, 0, 1) * keep, (0, 0), 0.6)
    return cv2.resize(a, SIZE, interpolation=cv2.INTER_AREA)


def motif_v2(n: int) -> np.ndarray:
    loc = np.asarray(Image.open(LOC / f"rc{n}.png").convert("L"), np.float32)
    sm = cv2.GaussianBlur(loc, (0, 0), 1.0)
    ramp = np.clip((sm - THRESH[n]) / RAMP, 0, 1)
    m = (sm > THRESH[n] + 12).astype(np.uint8)
    zone = np.zeros_like(m)
    for x0, y0, x1, y1 in ZONES:
        zone[y0:y1, x0:x1] = 1
    m &= zone
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, disc(1))
    k, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    for i in range(1, k):
        _, _, bw, bh, area = st[i]
        if area < MIN_AREA or (max(bw, bh) > 60 and max(bw, bh) > 12 * max(1, min(bw, bh))):
            continue
        keep[lab == i] = 1
    keep = cv2.dilate(keep, disc(2))
    a = cv2.GaussianBlur((ramp * keep * zone).astype(np.float32), (0, 0), 1.0)
    return cv2.resize(a, SIZE, interpolation=cv2.INTER_AREA)


def save_rgba(a: np.ndarray, colour, path: Path) -> None:
    a8 = np.clip(np.round(a * 255), 0, 255).astype(np.uint8)
    rgba = np.zeros(a8.shape + (4,), np.uint8)
    rgba[..., :3] = np.round(np.array(colour) * 255).astype(np.uint8)
    rgba[..., 3] = a8
    Image.fromarray(rgba, "RGBA").save(path, lossless=True, quality=100, method=6, exact=True)
    print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB  mean {a.mean():.3f}")


def main() -> None:
    sheet = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    only = [int(x) for x in sys.argv[sys.argv.index("--cards") + 1].split(",")] if "--cards" in sys.argv else None
    tiles = []
    for n in sorted(set(V3) | set(V3_LOC) | set(V2_CARDS)):
        if only and n not in only:
            continue
        if n in V4_COLOUR:
            a = rc19_stripes(cutouts=False) if n == 19 else motif_v3(n)
            colour, name = V4_COLOUR[n], f"motif-rc{n}-v4.webp"
        elif n in V3 or n in V3_LOC:
            a, colour, name = motif_v3(n), V3_COLOUR[n], f"motif-rc{n}-v3.webp"
        else:
            a, colour, name = motif_v2(n), V2_COLOUR.get(n, DEFAULT_COLOUR), f"motif-rc{n}-v2.webp"
        save_rgba(a, colour, OUT / name)
        if sheet:
            scan = np.asarray(Image.open(SCANS / f"RC{n}.webp").convert("RGB").resize(SIZE), np.float32) / 255
            drawn = (1 - (1 - scan) * (1 - a[..., None] * np.array(colour)) if n == 10
                     else scan * (1 - a[..., None] * (1 - np.array(colour))))
            tiles.append(np.concatenate([scan, drawn], 1))
    if not only:
        old = np.asarray(Image.open(OUT / "map-rc24.webp").convert("RGBA"), np.float32)[..., 3] / 255
        new = cv2.GaussianBlur(0.6 + 0.4 * old, (0, 0), 1.5)
        save_rgba(cv2.resize(new, SIZE, interpolation=cv2.INTER_AREA), (1, 1, 1), OUT / "map-rc24-v3.webp")
    if sheet and tiles:
        while len(tiles) % 4:
            tiles.append(np.zeros_like(tiles[0]))
        rows = [np.concatenate(tiles[i:i + 4], 1) for i in range(0, len(tiles), 4)]
        Image.fromarray((np.concatenate(rows, 0) * 255).astype(np.uint8)).save(sheet, quality=88)


if __name__ == "__main__":
    main()
