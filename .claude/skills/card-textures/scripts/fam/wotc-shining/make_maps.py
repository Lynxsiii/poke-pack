#!/usr/bin/env python3
"""Draw the light maps of the WotC Shining family (holo remaster, 2026-10-01) from the card scans and the family's masks.

The scans are photos of the real foil under a scanner lamp: dark metal with the printed ink over it and the foil's grain frozen
in as fine bright specks. The CSS screens LIGHT onto that scan, never paints over it, so these maps say how much light each
pixel takes back and which specks catch it:

  <set>-<n>-lit-v1.webp    RGB, what the foil shows under a lamp at full light before the tint: the ink's transmission. The
                           scan's luminance with the grain opened away (grey opening, disk 1, then a 3 px median), stretched
                           between the line art (p2 -> 0) and the brightest metal (p98 -> 1), a gamma that lifts the shading
                           (lit photos: the whole figure goes bright silver, the drawing's shading stays as darker silver),
                           the black lines held at 0 (a black-hat line finder), and the ink's own hue relative to the figure's
                           median (Tyranitar's purple belly plate and Celebi's maroon lower body stay coloured under the lamp:
                           photos nd-113-*, nd-106-*), times the mask. Neo Revelation (the galaxy background): the sky's
                           luminance with the cosmos dots opened away (disk 20), 0.45 + 0.55 x stretched, colourless: the lit
                           sky in nr-65-gyarados-specular-silver-ebay.jpg is one silver-lavender haze with the swirl through it.
  <set>-<n>-spark-v1.webp  RGB, black ground. Neo Destiny: the scan's own grain specks (white top-hat, disk 1), only the
                           strongest (~p92 up), each speck a hue drawn around blue-lavender (+-70 deg) or near-white (the
                           Charizard eBay zoom: specks of blue, lavender, white); the CSS turns the hue with the tilt. Neo
                           Revelation: the scan's cosmos dots and discs (top-hat over the disk-20 sky), each dot one hue of
                           the whole spectrum (nr-65-gyarados-flat-dots-ebay.jpg: green, cyan, pink, red glints) and its own
                           brightness, so a tilt lights a different set.

Masks come from make_masks.py (assets/foil/fam/wotc-shining/<set>-<n>-mask-v1.webp). Lossless webp, 600 x 838 like the scans,
so a 1-2 px line of the drawing registers on the scan's line.
    python3 .claude/skills/card-textures/scripts/fam/wotc-shining/make_maps.py [--only neo4-107,...] [--force] [--preview DIR]
Seeded (numpy default_rng(card number)): re-running draws the same maps.
"""
import argparse, colorsys, os, sys
import cv2
import numpy as np
import scipy.ndimage as ndi
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets/foil/fam/wotc-shining")
VERSION = "v1"
SPARK_VERSION = "v2"
# Neo Destiny spark hue (degrees) and spread per figure: the specks take the metal's lit tint (photos in
# /mnt/project-files/holo-remaster/wotc-shining/refs/: Charizard blue/lavender/white specks, Raichu, Steelix, Tyranitar and
# Noctowl gold, Celebi rose, Kabutops silver-beige, Mewtwo lavender). 40% of specks are near-white.
SPARK_HUE = {106: (350, 22), 107: (255, 55), 108: (38, 16), 109: (272, 30), 110: (54, 16), 111: (47, 12), 112: (42, 14), 113: (45, 14)}
CARDS = [("neo3", 65), ("neo3", 66)] + [("neo4", k) for k in range(106, 114)]
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + r


def load(s, n):
    im = np.asarray(Image.open(os.path.join(ROOT, "assets/cards", s, f"{n}.webp")).convert("RGB")).astype(np.float32) / 255
    a = np.asarray(Image.open(os.path.join(OUT, f"{s}-{n}-mask-{VERSION}.webp")).convert("RGBA")).astype(np.float32)[..., 3] / 255
    return im, a


def stretch(x, lo, hi):
    return np.clip((x - lo) / max(hi - lo, 1e-4), 0, 1)


def rel_hue(im, inside):
    """The ink's colour relative to the figure's median colour, as a 0-1 RGB factor (white where the ink is the figure's usual).
    Only a clearly different ink keeps its colour (Tyranitar's purple plate, Celebi's maroon legs: strength up to 0.85); a
    small shift (Raichu's green bolt against its olive body, gold in nd-111-raichu-gold-ricardo.jpg) mostly takes the tint."""
    # normalized convolution inside the figure, so the sky's colour does not bleed into the figure's rim
    m = inside_soft = ndi.binary_dilation(inside, iterations=2).astype(np.float32)
    c = ndi.gaussian_filter(ndi.median_filter(im, size=(5, 5, 1)) * m[..., None], (2.5, 2.5, 0))
    c = c / np.maximum(ndi.gaussian_filter(inside_soft, 2.5), 1e-3)[..., None]
    lum = np.maximum(c @ LUMA, 0.02)[..., None]
    chroma = c / lum
    med = np.median(chroma[inside], axis=0)
    rel = np.clip(chroma / np.maximum(med, 0.05), 0.2, 4.0)
    dev = np.abs(np.log(rel)).max(axis=2, keepdims=True)
    w = np.clip((dev - 0.3) / 0.4, 0, 1)
    w = w * w * (3 - 2 * w)
    rel = rel ** (0.2 + 0.65 * w)
    return rel / rel.max(axis=2, keepdims=True)


def lit_neo4(im, a):
    Y = im @ LUMA
    Yo = ndi.median_filter(ndi.grey_opening(Y, footprint=disk(1)), 3)
    inside = ndi.binary_erosion(a > 0.5, iterations=3)
    lo, hi = np.percentile(Yo[inside], [2, 98])
    # the metal: the opened scan smoothed further (two bilateral passes: the grain's mottle goes, the drawing's shading and
    # its edges stay), stretched, a gamma that lifts the shading
    base = Yo.astype(np.float32)
    for _ in range(2):
        base = cv2.bilateralFilter(base, 9, 0.05, 4)
    T = stretch(base, lo, hi) ** 0.6
    # the black lines, found on the lightly cleaned scan: what a closing (disk 2) fills in, relative to the figure's range,
    # kept by hysteresis (a stroke above 0.2 with a core above 0.55 and 16 px or more): the grain's dark gaps are faint
    # 1-4 px dots and would print as black speckle, a drawn line is long and has a dark core
    bh = np.clip((ndi.grey_closing(Yo, footprint=disk(2)) - Yo) / (0.45 * (hi - lo)), 0, 1) * (a > 0.5)
    strokes = hysteresis(bh, 0.2, 0.55, 16)
    T = T * (1 - bh * ndi.binary_dilation(strokes, iterations=1))
    # the rim: the figure's outline is ink, so the last 2 px take the darkest of their neighbours (no bright halo of
    # sky-coloured edge pixels)
    rim = (a > 0.02) & ~ndi.binary_erosion(a > 0.5, iterations=2)
    T = np.where(rim, np.minimum(T, ndi.grey_erosion(T, footprint=disk(2))), T)
    C = rel_hue(im, inside)
    return np.clip(T[..., None] * C * a[..., None], 0, 1)


def hysteresis(x, lo, hi, min_px):
    lab, k = ndi.label(x > lo, structure=np.ones((3, 3)))
    if k == 0:
        return np.zeros(x.shape, bool)
    peak = np.asarray(ndi.maximum(x, lab, range(1, k + 1)))
    size = np.asarray(ndi.sum(x > lo, lab, range(1, k + 1)))
    return np.isin(lab, 1 + np.flatnonzero((peak > hi) & (size >= min_px)))


def keep_big(m, min_px):
    lab, k = ndi.label(m, structure=np.ones((3, 3)))
    if k == 0:
        return m
    sz = ndi.sum(m, lab, range(1, k + 1))
    return np.isin(lab, 1 + np.flatnonzero(sz >= min_px))


def lit_neo3(im, a):
    Y = im @ LUMA
    sky = ndi.gaussian_filter(ndi.grey_opening(Y, footprint=disk(20)), 3)
    inside = ndi.binary_erosion(a > 0.5, iterations=3)
    lo, hi = np.percentile(sky[inside], [2, 98])
    T = 0.45 + 0.55 * stretch(sky, lo, hi)
    return np.clip(np.repeat((T * a)[..., None], 3, axis=2), 0, 1)


def hue_rgb(h, s, v):
    return np.array(colorsys.hsv_to_rgb(h % 1.0, s, v), np.float32)


def spark_neo4(im, a, rng, n=107):
    h0, spread = SPARK_HUE[n]
    Y = im @ LUMA
    th = Y - ndi.grey_opening(Y, footprint=disk(1))
    inside = ndi.binary_erosion(a > 0.5, iterations=2)
    t0, t1 = np.percentile(th[inside], [92, 99.5])
    v = stretch(th, t0, t1) * (a > 0.5)
    lab, k = ndi.label(v > 0)
    cols = np.zeros((k + 1, 3), np.float32)
    for i in range(1, k + 1):
        if rng.random() < 0.2:
            cols[i] = hue_rgb(rng.random(), 0.12, 1.0)
        else:
            cols[i] = hue_rgb(h0 / 360 + rng.uniform(-spread, spread) / 360, rng.uniform(0.55, 0.9), 1.0)
    out = cols[lab] * (v ** 0.8)[..., None]
    return np.clip(out * a[..., None], 0, 1)


def spark_neo3(im, a, rng):
    Y = im @ LUMA
    sky = ndi.gaussian_filter(ndi.grey_opening(Y, footprint=disk(20)), 3)
    th = np.maximum(Y - sky, 0)
    inside = ndi.binary_erosion(a > 0.5, iterations=2)
    t0, t1 = np.percentile(th[inside], [70, 99.7])
    v = stretch(th, t0, t1)
    lab, k = ndi.label(v > 0.02)
    cols = np.zeros((k + 1, 3), np.float32)
    gain = np.zeros(k + 1, np.float32)
    for i in range(1, k + 1):
        cols[i] = hue_rgb(rng.random(), rng.uniform(0.35, 0.7), 1.0)
        gain[i] = rng.uniform(0.45, 1.0)
    out = cols[lab] * (gain[lab] * v)[..., None]
    return np.clip(out * a[..., None], 0, 1)


def save(arr, path, force):
    if os.path.exists(path) and not force:
        sys.exit(f"{path} exists: pass --force (before the family ships) or bump VERSION")
    Image.fromarray((np.clip(arr, 0, 1) * 255).round().astype(np.uint8), "RGB").save(path, lossless=True, quality=100, method=6)
    print(path, os.path.getsize(path))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    for s, n in CARDS:
        if a.only and f"{s}-{n}" not in a.only.split(","):
            continue
        rng = np.random.default_rng(n)
        im, al = load(s, n)
        if s == "neo4":
            lit, spark = lit_neo4(im, al), spark_neo4(im, al, rng, n)
        else:
            lit, spark = lit_neo3(im, al), spark_neo3(im, al, rng)
        lp = os.path.join(OUT, f"{s}-{n}-lit-{VERSION}.webp")
        if not os.path.exists(lp) or a.force:
            save(lit, lp, True)
        if s == "neo4":  # Neo Revelation keeps its v1 sparks (the cosmos dots are already every hue)
            save(spark, os.path.join(OUT, f"{s}-{n}-spark-{SPARK_VERSION}.webp"), a.force)


if __name__ == "__main__":
    main()
