#!/usr/bin/env python3
"""McDonald's Collection 2014, 2015, 2016 (XY frame): per-card chip maps (fix round of 2026-10-22, audit holo-work/w2-xy-mcd/AUDIT.json).

What the audit found against in-hand photos (holo-refs/w2-xy-mcd/): the finish is confetti chips over the art-window background with
the Pokemon, frame and text matte, but (1) seven v1 maps foiled parts of the Pokemon (Treecko, Lotad and its flowers, grass and leaf,
Staryu, Meditite, Marill, Pikachu's tail, Meowth's tail and feet) and Chespin's map cut the chipped dark trunk and ground out as matte;
(2) the v1 look lit each chip in the ink's own hue (the map rgb was the scan's high-pass), where the real lit chips are metallic
silver-white with broad spectral zones (cyan, lilac, pink, gold).

So the XY cards now take ONE small image each, on the canvas BOX (the union of every XY card's art window), drawn here:

  <id>-chips-v4.png  L, the chip level map: every chip of the window's foil area holds its own level (77..179, seeded per card), the
      1 px seams between chips, the Pokemon, the M and everything outside the window hold 0 (a level the CSS ramp never reaches, so
      nothing lights there: no mask is needed). The chips are the SCAN's own printed chips: SLIC superpixels of the scan at chip size
      (~11 px, 1.8% of the card) follow the printed chip edges, so a lit chip sits on a printed one.
      Foil area = the card's own art window (art_window of make_mcd_bw_v2, a side falling back to the set median when it is off by
      more than 3 px) minus the matte:
        - cards in xy_polys.json: each polygon group snapped by GrabCut on the registered set print (poke_from_poly of
          make_mcd_bw_v2), plus the McDonald's M on the 2014 cards;
        - every other card: the v1 map's matte (assets/foil/fam/mcd-promos/<id>-v1.webp alpha < 128; its edges were found right by the
          audit), carried out to the measured window edge.
  <id>-ink-v4.png  RGB (0, 0, g), the gold of yellow ink (ink_of): where the art under the chips is yellow or yellow-green, the CSS
      lights the chips' blue channel less, so they read gold (Torchic's grass), not white.
  The CSS (css/holo/fam/mcd-promos.css, class mcd-xy) lights these chips against a moving grey ramp and colours them with a broad
  spectral gradient, screened onto the scan; no image is a CSS mask (WebKit dropped image-masked foil layers at random on pages with
  many faces, see reference/fam-mcd-promos.md).

    MCD_PRINT_CACHE=<dir> python3 make_mcd_xy_v2.py [--ids mcd15-1,...] [--qa out.jpg] [--no-write]

Deterministic. Needs numpy, scipy, opencv, scikit-image, Pillow. Never overwrites a shipped file: output names are -v4.
"""
import argparse
import json
import os
import sys
import zlib

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.segmentation import slic

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_mcd_bw_v2 as bw  # noqa: E402

v1, v2 = bw.v1, bw.v2
ROOT, OUT, W, H, WIN = v1.ROOT, v1.OUT, v1.W, v1.H, v1.WIN
XY = [f"{s}-{n}" for s in ("mcd14", "mcd15", "mcd16") for n in range(1, 13)]
POLYS = {k: v for k, v in json.load(open(os.path.join(HERE, "xy_polys.json"))).items() if not k.startswith("_")}
# Groups whose matte is the foreground print picked by colour inside the polygon (by_colour: Lotad's flowers, floating leaf and grass
# blades, Treecko's dark grass blades: thin shapes GrabCut cannot snap; the real Lotad shows them matte), by key and group index.
COLOUR = {("mcd15-2", i) for i in range(1, 6)} | {("mcd15-1", 1)}
# Groups whose matte is the smooth light-green foreground leaves inside the polygon (leaves(): Weedle's outlined leaves carry no chips on
# the scan and read as clean print in hand, the chips flash on the water and the dark foliage between them), by key and group index.
LEAF = {("mcd14-1", 0)}
# Cards whose polygon groups ADD to the v1 matte instead of replacing it.
ON_V1 = {"mcd14-1"}
# The canvas: (x0, y0, x1, y1) of the 600 x 838 scan. The CSS insets .foil to exactly this box.
BOX = (44, 76, 556, 420)
MED = (51, 83, 548, 414)  # the set median of the measured windows
CHIP = 11.0  # mean chip pitch in scan px (~1.8% of the card width; the real chips are 1.5-2%)


def window(A):
    try:
        m = bw.art_window(A, False)
    except Exception:
        m = MED
    x0, y0, x1, y1 = [a if abs(a - b) <= 3 else b for a, b in zip(m, MED)]
    win = np.zeros((H, W), bool)
    win[y0:y1, x0:x1] = True
    return win, (x0, y0, x1, y1)


def old_matte(cid, win):
    """The v1 map's matte, carried out from the old fixed window (WIN) to the measured one by repeating its edge pixels."""
    al = np.asarray(Image.open(f"{OUT}/{cid}-v1.webp").convert("RGBA"))[..., 3]
    x0, y0, x1, y1 = WIN
    crop = al[y0:y1, x0:x1] < 128
    full = np.pad(crop, ((y0, H - y1), (x0, W - x1)), mode="edge")
    return full & win


def polymask(polys):
    m = np.zeros((H, W), np.uint8)
    for poly in polys:
        pts = np.array(poly, np.float32)
        cv2.fillPoly(m, [np.round(pts * 4).astype(np.int32)], 1, lineType=cv2.LINE_8, shift=2)
    return m > 0


def snap(A, win, pm, le, thr, line=False):
    """The matte inside one polygon group: the smooth (chip-free) pixels of the scan's chip energy, specks opened away, small islands
    dropped, outlines closed in, holes filled unless they carry chips; dark outline strokes next to it (or anywhere in the group when
    `line`: Marill's zigzag tail) join it."""
    L = A @ np.array([0.299, 0.587, 0.114], np.float32)
    s = (le < thr) & pm & win
    s = ndi.binary_opening(s, structure=bw.disk(2))
    lab, n = ndi.label(s)
    if n:
        sizes = np.asarray(ndi.sum(s, lab, range(1, n + 1)))
        s = np.isin(lab, np.where(sizes >= 250)[0] + 1)
    dark = ndi.binary_opening((L < 0.28) & pm & win, structure=np.ones((2, 2), bool))
    s |= dark if line else (dark & ndi.binary_dilation(s, structure=bw.disk(5)))
    s = ndi.binary_closing(s, structure=bw.disk(4)) & pm
    holes, n = ndi.label(ndi.binary_fill_holes(s) & ~s)
    if n:
        area = np.asarray(ndi.sum(np.ones_like(s), holes, range(1, n + 1)))
        chipped = np.asarray(ndi.mean(le > thr + 0.3, holes, range(1, n + 1)))
        s |= np.isin(holes, np.where(~((area > 120) & (chipped > 0.45)))[0] + 1)
    return ndi.binary_dilation(s, structure=bw.disk(2)) & ndi.binary_dilation(pm, structure=bw.disk(2)) & win


# The groups drawn with a thin dark stroke that is itself the Pokemon (Marill's zigzag tail), by key and group index.
LINE = {("mcd15-10", 1)}


def by_colour(A, pm):
    """Foreground print inside the polygon (Lotad's, Treecko's grass): the green, navy or dark grass blades and floating leaf (green over blue, dark and smooth,
    or near black) and the
    pink-purple flower petals with their outlines; the blue, cyan and white water chips between them stay foil."""
    L = A @ np.array([0.299, 0.587, 0.114], np.float32)
    r, g, b = A[..., 0], A[..., 1], A[..., 2]
    green = (g > b + 0.03) & (g > r - 0.05)
    petal = (r > g + 0.12) & (b > g - 0.05)
    # navy blades: dark and smooth (the dark-blue water chips are small and speckled)
    sd = np.sqrt(np.maximum(ndi.uniform_filter(L * L, 7) - ndi.uniform_filter(L, 7) ** 2, 0))
    navy = ndi.binary_opening((L < 0.34) & (sd < 0.045) & (b > r) & pm, structure=bw.disk(3))
    m = pm & (green | (L < 0.16) | navy | ndi.binary_dilation(petal, structure=bw.disk(2)))
    m = ndi.binary_closing(ndi.binary_opening(m, structure=bw.disk(2)), structure=bw.disk(2))
    lab, n = ndi.label(m)
    if n:
        sizes = np.asarray(ndi.sum(m, lab, range(1, n + 1)))
        m = np.isin(lab, np.where(sizes >= 120)[0] + 1)
    return ndi.binary_fill_holes(m) & pm


def leaves(A, pm):
    """Smooth light-green leaves (local std under 0.035 over 7 px, green over red and blue, luma over 0.3): opened 3 px (no chip-sized
    bits), islands under 250 px dropped, holes filled, grown 2 px over the dark outline."""
    L = A @ np.array([0.299, 0.587, 0.114], np.float32)
    r, g, b = A[..., 0], A[..., 1], A[..., 2]
    sd = np.sqrt(np.maximum(ndi.uniform_filter(L * L, 7) - ndi.uniform_filter(L, 7) ** 2, 0))
    m = pm & (sd < 0.035) & (g > b + 0.05) & (g > r - 0.02) & (L > 0.3)
    m = ndi.binary_opening(m, structure=bw.disk(3))
    lab, n = ndi.label(m)
    if n:
        sizes = np.asarray(ndi.sum(m, lab, range(1, n + 1)))
        m = np.isin(lab, np.where(sizes >= 250)[0] + 1)
    m = ndi.binary_fill_holes(ndi.binary_closing(m, structure=bw.disk(2)))
    return ndi.binary_dilation(m, structure=bw.disk(2)) & pm


def matte_of(cid, A, win):
    if cid not in POLYS or ":" in cid:
        return old_matte(cid, win), "v1 matte"
    B, cc = bw.registered_print(cid, A)
    poke = old_matte(cid, win) if cid in ON_V1 else np.zeros((H, W), bool)
    for i, group in enumerate(POLYS[cid]):
        pm = polymask(group)
        if (cid, i) in LINE:
            L = A @ np.array([0.299, 0.587, 0.114], np.float32)
            poke |= ndi.binary_closing((L < 0.3) & pm, structure=bw.disk(2))
        elif (cid, i) in COLOUR:
            poke |= by_colour(A, pm & win)
        elif (cid, i) in LEAF:
            poke |= leaves(A, pm & win)
        else:
            poke |= bw.poke_from_poly(cid, A, B, win, pm=pm)
    if cid.startswith("mcd14"):
        poke |= bw.m_mask(cid, A)
    poke = ndi.binary_dilation(poke, structure=bw.disk(1)) & win
    if cid + ":plus" in POLYS:
        poke |= polymask(POLYS[cid + ":plus"]) & win
    if cid + ":minus" in POLYS:
        poke &= ~polymask(POLYS[cid + ":minus"])
    return poke, "polygons snapped by GrabCut on the " + ("registered print" if B is not None else "scan")


def chips_of(cid, A, foil):
    """SLIC superpixels of the scan at chip size, each a random level 77..179 (0.3..0.7, the CSS ramp's range); seams and non-foil 0."""
    x0, y0, x1, y1 = BOX
    crop = A[y0:y1, x0:x1]
    n = int(crop.shape[0] * crop.shape[1] / (CHIP * CHIP))
    lab = slic(crop, n_segments=n, compactness=12, sigma=0.6, start_label=1, channel_axis=-1)
    rng = np.random.default_rng(zlib.crc32(cid.encode()))
    lev = rng.integers(77, 180, lab.max() + 1).astype(np.uint8)
    out = lev[lab]
    seam = np.zeros(lab.shape, bool)
    seam[:, :-1] |= lab[:, :-1] != lab[:, 1:]
    seam[:-1, :] |= lab[:-1, :] != lab[1:, :]
    out[seam] = 0
    out[~foil[y0:y1, x0:x1]] = 0
    return out


def ink_of(A, foil):
    """The gold of yellow ink: silver chips under yellow or yellow-green ink read gold (Torchic's grass, the 2021 reprint too). RGB =
    (0, 0, g): g = 0.33 x the yellowness (min(R, G) - B - 0.08) of the scan smoothed over a few chips, capped at 0.16, 0 off the foil.
    The CSS screens it onto each chip's distance from the ramp, so the blue channel of a chip lights less where the ink is yellow."""
    x0, y0, x1, y1 = BOX
    S = np.stack([ndi.gaussian_filter(A[..., c], 5) for c in range(3)], -1)
    yel = np.clip((np.minimum(S[..., 0], S[..., 1]) - S[..., 2] - 0.08) * 0.33, 0, 0.16)
    yel *= ndi.gaussian_filter(ndi.binary_dilation(foil, structure=bw.disk(3)).astype(np.float32), 2)
    out = np.zeros((y1 - y0, x1 - x0, 3), np.uint8)
    out[..., 2] = np.round(yel[y0:y1, x0:x1] * 255).astype(np.uint8)
    return out


def build(cid):
    A = v1.load(cid)
    win, wb = window(A)
    matte, how = matte_of(cid, A, win)
    foil = win & ~matte
    chips = chips_of(cid, A, foil)
    return cid, chips, foil, how, wb, ink_of(A, foil)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    ap.add_argument("--qa", default="")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    ids = args.ids.split(",") if args.ids else XY
    tiles = []
    for cid in ids:
        cid, chips, foil, how, wb, ink = build(cid)
        print(f"{cid:9s} window {wb} foil {foil.sum() / max(1, (wb[2] - wb[0]) * (wb[3] - wb[1])):.2f}  {how}", flush=True)
        if not args.no_write:
            Image.fromarray(chips, "L").save(f"{OUT}/{cid}-chips-v4.png", optimize=True)
            Image.fromarray(ink, "RGB").save(f"{OUT}/{cid}-ink-v4.png", optimize=True)
        if args.qa:
            A = v1.load(cid)
            x0, y0, x1, y1 = BOX
            a = A[y0:y1, x0:x1]
            f = foil[y0:y1, x0:x1, None]
            ov = a * (0.35 + 0.65 * (1 - f)) + np.array([1, 0, 0.8]) * f * 0.45
            c = np.repeat((chips[..., None] / 255.0), 3, -1)
            tiles.append((np.clip(np.concatenate([ov, c], 1), 0, 1) * 255).astype(np.uint8))
    if args.qa and tiles:
        sheet = np.concatenate(tiles, 0)
        Image.fromarray(sheet).save(args.qa, quality=88)


if __name__ == "__main__":
    main()
