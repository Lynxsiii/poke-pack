#!/usr/bin/env python3
"""McDonald's Collection 2011-2016: the per-card maps, second pass (review #1 of 2026-10-02).

What v1 (make_mcd_maps.py) got wrong: it found the Pokemon as "big compact chip-free blobs" of the SCAN's own energy, so thin or pale parts
(legs, ears, gears, tails) read as chips and got foil, and flat or pale background read as Pokemon and got none. v2 builds the silhouette
from the card's SET PRINT instead:

  1. Every McD card is a reprint of a set card (table C below, found by the first pass). The print is registered to the McD scan (ECC affine,
     the window region) and colour-fitted to it (robust polynomial); scan minus fitted print is the chips and nothing else: the art cancels.
  2. The residual's high-pass energy says where chips are printed. The Pokemon, the "M" and the evolution circle are chip-free blobs of that
     residual (opened by 1 px so misregistration lines do not count, closed and hole-filled, grown 3 px, feathered 0.5 px). Matte = silhouette,
     M, circle; the rest of the window is foil whether or not the scan shows chips there.
  3. The two flat-yellow Pikachu (mcd14-5, mcd15-6) are cut by hand-style: the silhouette is the interior of the print's black outline
     (flood fill from the window border over the non-outline pixels, outline closed by 2 px), the head and ears included.
  4. Where the scan carries no chip signature (pale sky, flat colour: low residual energy) a seeded Voronoi chip field (cells 6-12 px, per-cell
     per-channel level with the statistics of that card's own chips) is blended into the signature so the foil has chips to light.
  5. A card with no usable print (registration below 0.85, or a silhouette outside 4-50% of the window) falls back to v1's mask.
  6. Writes the per-card gain (js/fam/mcd-promos.js GAIN table, between the GAIN markers): 1 for dark art, 0.5 for pale art, from the mean
     luma of the window's foil area; the CSS scales the lit foil by it so pale art is not driven to white.

    python3 make_mcd_maps_v2.py [--ids mcd11-9,...] [--qa out.png] [--no-write] [--jobs 3]

Deterministic (seeded per card). Needs numpy, scipy, opencv, Pillow. Output: assets/foil/fam/mcd-promos/<id>-v1.webp (never shipped, so the
name is reused).
"""
import argparse
import glob
import json
import os
import re
import sys
import zlib
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(__file__))
import make_mcd_maps as v1  # noqa: E402

ROOT, OUT, W, H, WIN, M_BOX, SETS = v1.ROOT, v1.OUT, v1.W, v1.H, v1.WIN, v1.M_BOX, v1.SETS
OUTLINE = {"mcd14-5", "mcd15-6"}
C = {
    "mcd11-1": ["bw1-bwp001"], "mcd11-2": ["bw1-11"], "mcd11-3": ["bw1-bwp002"], "mcd11-4": ["bw1-bwp003"], "mcd11-5": ["bw1-38"],
    "mcd11-12": ["bw1-87", "bwtk5b-12", "bwtk5b-18"],
    "mcd12-1": ["bw1-3"], "mcd12-2": ["bw2-1"], "mcd12-3": ["bw3-6"], "mcd12-4": ["bw1-17"], "mcd12-5": ["bw1-29"], "mcd12-6": ["bw2-32"],
    "mcd12-7": ["bw2-36"], "mcd12-8": ["bw2-54", "bwtk5b-13", "bwtk5b-25"], "mcd12-9": ["bw2-64"], "mcd12-10": ["bw1-68"], "mcd12-11": ["bw2-75"],
    "mcd12-12": ["bw3-86"],
    "mcd14-1": ["xy0-1"], "mcd14-2": ["xy0-3", "xy1-xyp001"], "mcd14-3": ["xy0-8", "xy1-xyp002"], "mcd14-4": ["xy0-12", "xy1-xyp003"],
    "mcd14-5": ["xy1-42"], "mcd14-6": ["xy0-18"], "mcd14-7": ["xy0-21"], "mcd14-8": ["xy0-22", "xytk6b-11", "xytk6b-27"],
    "mcd14-9": ["xy0-24", "xytk7b-1", "xytk7b-18"], "mcd14-10": ["xy0-30"], "mcd14-11": ["xy0-31", "xytk6b-1", "xytk6b-19"],
    "mcd14-12": ["xy0-32", "xy0-33", "xy2-87", "xytk6b-16", "xytk6b-22", "xytk6a-20"],
    "mcd15-1": ["xy5-6", "xy4-xyp036", "xytk8b-7", "xytk8b-24"], "mcd15-2": ["xy5-10", "xytk8b-11", "xytk8b-23"], "mcd15-3": ["xy5-25", "xy4-xyp037"],
    "mcd15-4": ["xy5-32"], "mcd15-5": ["xy5-33", "xy4-xyp038"], "mcd15-6": ["xy6-20"], "mcd15-7": ["xy5-59"],
    "mcd15-8": ["xy5-74", "g1-49", "xytk8a-15", "xytk8a-23"], "mcd15-9": ["xy5-79"], "mcd15-10": ["xy5-102"], "mcd15-11": ["xy5-111"],
    "mcd15-12": ["xy5-113", "xytk8a-1", "xytk8a-27"],
    "mcd16-1": ["xy5-20"], "mcd16-2": ["xy5-25", "xy4-xyp037"], "mcd16-3": ["xy1-24"], "mcd16-4": ["xy7-19"], "mcd16-5": ["xy4-15"], "mcd16-6": ["xy6-20"],
    "mcd16-7": ["xy3-66"], "mcd16-8": ["xy1-87", "xytk7b-12", "xytk7b-25"], "mcd16-9": ["xy6-43"], "mcd16-10": ["xy4-70"], "mcd16-11": ["xy7-61"],
    "mcd16-12": ["xy7-63", "xytk9b-4"],
}
_IMG = {}


def img_path(sid):
    if not _IMG:
        for f in glob.glob(ROOT + "/data/*.json"):
            try:
                d = json.load(open(f))
            except Exception:
                continue
            if isinstance(d, dict):
                d = d.get("cards", [])
            if isinstance(d, list):
                for c in d:
                    if isinstance(c, dict) and "id" in c and "image" in c:
                        _IMG[c["id"]] = c["image"]
    return _IMG.get(sid)


_BY_NAME = {}
_MCD = {}


def name_candidates(cid):
    """Set prints with the McD card's own name (same HP first): the reprint's source is one of them. Registration picks the best."""
    if not _BY_NAME:
        for f in glob.glob(ROOT + "/data/*.json"):
            try:
                d = json.load(open(f))
            except Exception:
                continue
            cs = d if isinstance(d, list) else (d.get("cards", []) if isinstance(d, dict) else [])
            base = os.path.basename(f)[:-5]
            for c in cs:
                if not isinstance(c, dict) or "id" not in c or "name" not in c:
                    continue
                if base.startswith("mcd"):
                    _MCD[c["id"]] = (c["name"], str(c.get("hp")))
                elif c.get("image") and re.match(r"^(bw|xy|g1|dc|det|dv|rc)", base):
                    _BY_NAME.setdefault(c["name"], []).append((c["id"], str(c.get("hp"))))
    nm, hp = _MCD.get(cid, (None, None))
    lst = _BY_NAME.get(nm, [])
    lst = sorted(lst, key=lambda t: (t[1] != hp, "tk" in t[0], "cosmos" in t[0]))
    return [t[0] for t in lst]


def loadp(path):
    im = Image.open(ROOT + "/" + path).convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def register(A, B):
    ga = cv2.GaussianBlur(cv2.cvtColor(A, cv2.COLOR_RGB2GRAY), (0, 0), 2.0)
    gb = cv2.GaussianBlur(cv2.cvtColor(B, cv2.COLOR_RGB2GRAY), (0, 0), 2.0)
    m = np.zeros(ga.shape, np.uint8)
    m[60:440, 30:570] = 255
    warp = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    cc, warp = cv2.findTransformECC(ga, gb, warp, cv2.MOTION_AFFINE, crit, m, 5)
    ga = cv2.GaussianBlur(cv2.cvtColor(A, cv2.COLOR_RGB2GRAY), (0, 0), 0.8)
    gb = cv2.GaussianBlur(cv2.cvtColor(B, cv2.COLOR_RGB2GRAY), (0, 0), 0.8)
    try:
        cc, warp = cv2.findTransformECC(ga, gb, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-7), m, 1)
    except cv2.error:
        pass
    Bw = cv2.warpAffine(B, warp, (W, H), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    return np.clip(Bw, 0, 1), float(cc)


def sift_init(A, B):
    """A -> B similarity from SIFT matches inside the art windows (the A scan carries chips: the ratio test drops them)."""
    sift = cv2.SIFT_create(3000)
    ga = cv2.cvtColor((A * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    gb = cv2.cvtColor((B * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    ma = np.zeros_like(ga)
    ma[70:430, 40:560] = 255
    mb = np.zeros_like(gb)
    mb[30:480, 0:600] = 255
    ka, da = sift.detectAndCompute(ga, ma)
    kb, db = sift.detectAndCompute(gb, mb)
    if da is None or db is None or len(ka) < 8 or len(kb) < 8:
        return None
    m = cv2.BFMatcher().knnMatch(da, db, k=2)
    good = [a for a, b in (x for x in m if len(x) == 2) if a.distance < 0.8 * b.distance]
    if len(good) < 8:
        return None
    pa = np.float32([ka[g.queryIdx].pt for g in good])
    pb = np.float32([kb[g.trainIdx].pt for g in good])
    M, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=4.0)
    if M is None or int(inl.sum()) < 8:
        return None
    return M.astype(np.float32)


def register_sift(A, B):
    warp = sift_init(A, B)
    if warp is None:
        raise RuntimeError("no sift match")
    ga = cv2.GaussianBlur(cv2.cvtColor(A, cv2.COLOR_RGB2GRAY), (0, 0), 1.5)
    gb = cv2.GaussianBlur(cv2.cvtColor(B, cv2.COLOR_RGB2GRAY), (0, 0), 1.5)
    m = np.zeros(ga.shape, np.uint8)
    m[60:440, 30:570] = 255
    cc = -1.0
    try:
        cc, warp = cv2.findTransformECC(ga, gb, warp.copy(), cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 150, 1e-6), m, 3)
    except cv2.error:
        Bw0 = cv2.warpAffine(gb, warp, (W, H), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
        a_, b_ = ga[m > 0], Bw0[m > 0]
        cc = float(np.corrcoef(a_, b_)[0, 1])
    Bw = cv2.warpAffine(B, warp, (W, H), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    return np.clip(Bw, 0, 1), float(cc)


def colfit(A, Bw, sl):
    x = Bw[sl].reshape(-1, 3)
    y = A[sl].reshape(-1, 3)

    def feats(x):
        r, g, b = x[:, 0], x[:, 1], x[:, 2]
        return np.stack([np.ones_like(r), r, g, b, r * r, g * g, b * b, r * g, g * b, r * b], 1)

    X = feats(x)
    w = np.ones(len(x))
    for _ in range(6):
        coef = np.linalg.lstsq(X * w[:, None], y * w[:, None], rcond=None)[0]
        res = np.sqrt(((y - X @ coef) ** 2).sum(1))
        s = np.median(res) * 1.48 + 1e-4
        w = 1 / np.maximum(1, res / (2 * s))
    return (feats(Bw.reshape(-1, 3)) @ coef).reshape(A.shape)


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


def window_mask():
    x0, y0, x1, y1 = WIN
    win = np.zeros((H, W), bool)
    win[y0:y1, x0:x1] = True
    return win


def residual_chips(A, Bw):
    x0, y0, x1, y1 = WIN
    sl = (slice(y0, y1), slice(x0, x1))
    F = colfit(A, Bw, sl)
    R = A - F
    Hp = R - np.stack([ndi.gaussian_filter(R[..., c], 5) for c in range(3)], -1)
    M = np.sqrt((Hp ** 2).sum(-1))
    return ndi.gaussian_filter(M, 1.2)


def poke_from_residual(M, win):
    lm = np.log(M + 1e-3)
    thr = v1.otsu(lm[win])
    chip = (lm > thr) & win
    free = win & ~chip
    free = ndi.binary_opening(free, structure=np.ones((3, 3)), iterations=1)
    lab, n = ndi.label(free)
    poke = np.zeros((H, W), bool)
    if n:
        sizes = np.asarray(ndi.sum(free, lab, range(1, n + 1)))
        main = float(sizes.max())
        keep = sizes >= 0.30 * main
        # pale cloud-shaped background reads as chip-free too: only blobs near the main ones (thin parts: ears, tails, gear rims) or
        # in the evolution circle's corner stay
        kept = np.isin(lab, np.where(keep)[0] + 1)
        near = ndi.binary_dilation(kept, structure=disk(12))
        for i, sz in enumerate(sizes, 1):
            if keep[i - 1] or sz < 120:
                continue
            comp = lab == i
            cy, cx = ndi.center_of_mass(comp)
            if (comp & near).any() or (cx < 140 and cy < 140):
                keep[i - 1] = True
        poke = np.isin(lab, np.where(keep)[0] + 1)
    poke = ndi.binary_closing(poke, structure=disk(5))
    poke = ndi.binary_fill_holes(poke)
    return poke, chip


def poke_from_outline(Bw, win):
    g = Bw @ np.array([0.299, 0.587, 0.114], np.float32)
    dark = (g < 0.30) & win
    dark = ndi.binary_closing(dark, structure=np.ones((3, 3)), iterations=2)
    free = win & ~dark
    lab, n = ndi.label(free)
    border = np.zeros((H, W), bool)
    x0, y0, x1, y1 = WIN
    border[y0, x0:x1] = border[y1 - 1, x0:x1] = True
    border[y0:y1, x0] = border[y0:y1, x1 - 1] = True
    outside = set(np.unique(lab[border & free]).tolist())
    inside = np.zeros((H, W), bool)
    sizes = ndi.sum(free, lab, range(1, n + 1)) if n else []
    for i, sz in enumerate(sizes, 1):
        if i not in outside and sz >= 0.02 * win.sum():
            inside |= lab == i
    inside = ndi.binary_dilation(inside, structure=np.ones((3, 3)), iterations=3) & win
    # the outline pixels that touch the inside belong to the Pokemon, and the eyes, mouth and cheeks inside are holes
    poke = ndi.binary_fill_holes(inside | (ndi.binary_dilation(inside, iterations=2) & dark))
    return poke


def refine_v1(al, win):
    """No usable print: take v1's silhouette and close it. Close by 9 px, fill holes, add every foil island under ~28 px wide that touches
    it (legs, ears, gear faces, fringes read as chips because their scan texture looks like chips), grow it 3 px."""
    foil = al > 0.5
    poke = win & ~foil
    poke = ndi.binary_closing(poke, structure=disk(9))
    poke = ndi.binary_fill_holes(poke)
    near = ndi.binary_dilation(poke, structure=disk(3))
    f2 = win & ~poke
    lab, n = ndi.label(f2)
    for i in range(1, n + 1):
        comp = lab == i
        if not (comp & near).any():
            continue
        sz = int(comp.sum())
        ys, xs = np.where(comp)
        sub = comp[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        if ndi.distance_transform_edt(np.pad(sub, 1)).max() < 14 and sz < 6000:
            poke |= comp
    poke = ndi.binary_closing(poke, structure=disk(4))
    poke = ndi.binary_fill_holes(poke)
    return ndi.binary_dilation(poke, structure=disk(3)) & win


# mcd11 6-11 are new Ken Sugimori artworks (no set print to register): the official artwork's silhouette (refs/oa/<dex>.png, 475 px RGBA)
# is placed on the card by multi-scale edge template matching, then grown 4 px.
OA = {"mcd11-5": 594, "mcd11-1": 495, "mcd11-3": 498, "mcd11-4": 501, "mcd11-6": 522, "mcd11-7": 517, "mcd11-8": 551, "mcd11-9": 570, "mcd11-10": 599, "mcd11-11": 519}
OA_DIR = os.environ.get("MCD_OA", "/mnt/project-files/holo-remaster/mcd-promos/refs/oa")


def _gmag(g):
    g = g.astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return cv2.GaussianBlur(np.sqrt(gx * gx + gy * gy), (0, 0), 1.3)


def poke_from_official(cid, A, win):
    path = f"{OA_DIR}/{OA[cid]}.png"
    if not os.path.exists(path):
        return None, 0.0
    arr = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32) / 255
    al = arr[..., 3]
    ys, xs = np.where(al > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    al, rgb = al[y0:y1, x0:x1], arr[y0:y1, x0:x1, :3]
    g = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) * (al > 0.5)
    gt = _gmag(g)
    wx0, wy0, wx1, wy1 = WIN
    ga = _gmag(cv2.cvtColor((A * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY))[wy0:wy1, wx0:wx1]
    best = (-1, None)
    for sc in np.arange(0.30, 0.98, 0.02):
        tw, th = int(gt.shape[1] * sc), int(gt.shape[0] * sc)
        if tw >= ga.shape[1] or th >= ga.shape[0] or tw < 40:
            continue
        tpl = cv2.resize(gt, (tw, th), interpolation=cv2.INTER_AREA)
        r = cv2.matchTemplate(ga, tpl, cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(r)
        if mx > best[0]:
            best = (mx, (sc, loc[0], loc[1], tw, th))
    if best[1] is None:
        return None, 0.0
    sc, lx, ly, tw, th = best[1]
    sil = cv2.resize((al > 0.5).astype(np.uint8), (tw, th), interpolation=cv2.INTER_AREA) > 0
    poke = np.zeros((H, W), bool)
    poke[wy0 + ly:wy0 + ly + th, wx0 + lx:wx0 + lx + tw] = sil
    poke = ndi.binary_closing(poke, structure=disk(4))
    poke = ndi.binary_fill_holes(poke)
    return poke & win, float(best[0])


def voronoi_field(cid, std):
    rng = np.random.default_rng(zlib.crc32(cid.encode()))
    n = int(W * H / 80)
    pts = np.stack([rng.uniform(0, W, n), rng.uniform(0, H, n)], 1)
    tree = cKDTree(pts)
    ys, xs = np.mgrid[0:H, 0:W]
    idx = tree.query(np.stack([xs.ravel(), ys.ravel()], 1), k=1)[1].reshape(H, W)
    lev = rng.normal(0, 1, (n, 3)).astype(np.float32)
    lum = rng.normal(0, 1, (n, 1)).astype(np.float32)
    lev = 0.65 * lev + 0.8 * lum
    return np.clip(0.5 + 0.5 * lev[idx] / 2.0, 0, 1)


M_REF = {"mcd12": "mcd12-9", "mcd14": "mcd14-6"}
_MT = {}


def m_template(s):
    """The golden-arches badge as a mask: strict yellow in the badge box of a clean card of the same year (the badge sits in the same place
    on all twelve), grown 3 px. The old per-card yellow step took the whole box on cards with yellow-green art (Axew)."""
    if s in _MT:
        return _MT[s]
    A = v1.load(M_REF[s])
    mx0, my0, mx1, my1 = M_BOX[s]
    hsv = cv2.cvtColor((A * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    yel = (hsv[..., 0] > 14) & (hsv[..., 0] < 32) & (hsv[..., 1] > 150) & (hsv[..., 2] > 170)
    box = np.zeros((H, W), bool)
    box[my0:my1, mx0:mx1] = True
    m = yel & box
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=2))
    keep = np.zeros((H, W), bool)
    for i in range(1, n + 1):
        comp = (lab == i) & m
        if comp.sum() >= 120:
            keep |= comp
    _MT[s] = ndi.binary_dilation(keep, structure=disk(3))
    return _MT[s]


def build(cid):
    A = v1.load(cid)
    win = window_mask()
    rel, e = v1.chip_energy(A)
    info = ""
    poke = None
    Bw = None
    best = None
    cands = [] if cid in OA else list(dict.fromkeys(C.get(cid, []) + name_candidates(cid)))[:int(os.environ.get('MCD_NCAND', '7'))]  # new artwork: no set print to register
    for sid in cands:
        p = img_path(sid)
        if not p:
            continue
        try:
            B = loadp(p)
        except Exception:
            continue
        cands_reg = []
        try:
            cands_reg.append(register_sift(A, B))  # SIFT first: it finds the print when the plain ECC from identity does not
        except Exception:
            pass
        if not cands_reg or cands_reg[0][1] < 0.85:
            try:
                cands_reg.append(register(A, B))
            except Exception:
                pass
        if not cands_reg:
            continue
        Bw_, cc = max(cands_reg, key=lambda t: t[1])
        if best is None or cc > best[1]:
            best = (Bw_, cc, sid)
        if cc > 0.86:
            break
    M = None
    if best and best[1] >= 0.80:
        Bw, cc, sid = best
        M = residual_chips(A, Bw)
        if cid in OUTLINE:
            poke = poke_from_outline(Bw, win)
            info = f"outline via {sid} cc={cc:.3f}"
        else:
            poke, _ = poke_from_residual(M, win)
            info = f"residual via {sid} cc={cc:.3f}"
        share = poke.sum() / win.sum()
        if not 0.04 < share < 0.66:
            info += f" (silhouette share {share:.2f} out of range: v1 fallback)"
            poke = None
    else:
        info = f"no usable print (best cc {best[1] if best else 'none'}): v1 fallback"
    if poke is None and cid in OA:
        pk, score = poke_from_official(cid, A, win)
        if pk is not None and score >= 0.25 and 0.04 < pk.sum() / win.sum() < 0.5:
            poke = pk
            info += f" official-art silhouette match {score:.2f}"
    if poke is None:
        al0 = v1.foil_alpha(cid, A, rel, e)
        poke = refine_v1(al0, win)
        mask = win & ~poke
        al = np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 0.7) * 1.1 - 0.05, 0, 1)
    else:
        s = cid.split("-")[0]
        if s in M_BOX:
            poke = poke | m_template(s)
        poke = ndi.binary_dilation(poke, structure=disk(3)) & win
        mask = win & ~poke
        al = np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 0.7) * 1.1 - 0.05, 0, 1)
    sig = v1.signature(rel, al)
    # chip weight: where the residual (or scan) energy says chips are printed, keep the scan's signature; else the synthetic field
    if M is not None:
        ref = np.percentile(M[win & (al > 0.5)], 75) if (win & (al > 0.5)).any() else 0.05
        w = np.clip(ndi.gaussian_filter(M, 3) / (0.55 * ref + 1e-4), 0, 1)
    else:
        q = np.clip((np.log(e + 1e-3) + 5) / 6, 0, 1)
        ref = np.percentile(q[win & (al > 0.5)], 75) if (win & (al > 0.5)).any() else 0.5
        w = np.clip(ndi.gaussian_filter(q, 3) / (0.8 * ref + 1e-4), 0, 1)
    syn = voronoi_field(cid, 1.0)
    sig = sig * w[..., None] + syn * (1 - w[..., None])
    # luma of the window foil area, for the gain
    lum = (A @ np.array([0.299, 0.587, 0.114], np.float32))
    m_ = win & (al > 0.5)
    mean_l = float(lum[m_].mean()) if m_.any() else 0.5
    return cid, np.concatenate([sig, al[..., None]], -1), info, mean_l, float(1 - m_.sum() / win.sum())


def gain_of(mean_l):
    return round(float(np.clip(1.0 - (mean_l - 0.35) * 1.8, 0.5, 1.0)), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    ap.add_argument("--qa", default="")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--jobs", type=int, default=3)
    args = ap.parse_args()
    ids = args.ids.split(",") if args.ids else [f"{s}-{n}" for s in SETS for n in range(1, 13)]
    os.makedirs(OUT, exist_ok=True)
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        results = list(ex.map(build, ids))
    gains = {}
    tiles = []
    for cid, rgba, info, mean_l, matte in results:
        gains[cid] = gain_of(mean_l)
        print(f"{cid:9s} matte {matte:.2f} luma {mean_l:.2f} gain {gains[cid]:.2f}  {info}", flush=True)
        if not args.no_write:
            Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(f"{OUT}/{cid}-v1.webp", quality=88, alpha_quality=100, method=6)
        if args.qa:
            A = v1.load(cid)
            al = rgba[..., 3:4]
            ov = A * (0.3 + 0.7 * (1 - al)) + np.array([1, 0, 0.2]) * al * 0.3
            tiles.append((np.clip(ov, 0, 1)[60:430, 30:570] * 255).astype(np.uint8))
    if args.qa and tiles:
        cols = 4
        rows = [np.concatenate(tiles[i:i + cols] + [np.zeros_like(tiles[0])] * (cols - len(tiles[i:i + cols])), 1) for i in range(0, len(tiles), cols)]
        Image.fromarray(np.concatenate(rows, 0)).save(args.qa)
    if not args.ids and not args.no_write:
        p = os.path.join(ROOT, "js/fam/mcd-promos.js")
        s = open(p).read()
        table = "const GAIN = " + json.dumps(gains, separators=(",", ":")) + ";"
        s = re.sub(r"// GAIN-BEGIN.*?// GAIN-END", "// GAIN-BEGIN\n" + table + "\n// GAIN-END", s, flags=re.S)
        open(p, "w").write(s)


if __name__ == "__main__":
    main()
