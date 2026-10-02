#!/usr/bin/env python3
"""Pair each Expedition Rare Holo (ecard1 1-32) with its non-holo twin and register the twin's scan onto the holo's.

Family wotc-expedition, shared helper of make_holo_maps.py and make_rev_scans.py (no output of its own; run it to print the
pairing and the fit). Expedition printed every Rare Holo (1-32) a second time as a Rare (33-70) with the same art, and the two
prints differ only where the holo print is foil: its window drops or darkens the background ink over bare foil, and its strip
carries foil slots, ladder marks and the gold e logo where the Rare carries the e-Reader dot code and the blue logo. So the
holo minus its registered twin is the holo's foil, and the twin's window is what the reverse holo of the Rare Holo prints
(the reverse photos in /mnt/project-files/holo-remaster/wotc-expedition/refs/ show the twin's art: Charizard 6 = 40,
Dragonite 9 = 43, Golem 14 = 49).

Pairing: the Rares that share the holo's name (six names have two: Blastoise 36/37, Charizard 39/40, Feraligatr 46/47,
Meganium 53/54, Typhlosion 64/65, Venusaur 67/68), the one whose registered window correlates best.
Registration: SIFT matches on the frame (name bar, text box, border; window, strip and ladder column masked), an affine
fitted with RANSAC (median residual about 0.4 px), then refined on the window alone when the window has enough matching
ink (the Pokemon), because the window art sits up to 2 px apart from the frame between the two prints.
Colour: the twin is matched to the holo per channel (a line fitted on the text box and border), the two scans were not
exposed alike.

    python3 .claude/skills/card-textures/scripts/fam/wotc-expedition/twins.py        # print the pairs and fits
"""
import json
import os
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
CARDS = os.path.join(ROOT, "assets", "cards", "ecard1")
W, H = 600, 838


@lru_cache(None)
def data():
    with open(os.path.join(ROOT, "data", "ecard1.json")) as f:
        d = json.load(f)
    cards = d if isinstance(d, list) else d["cards"]
    return {int(c["number"]): c for c in cards if str(c["number"]).isdigit()}


def scan(n, small=False):
    """RGBA uint8 scan of ecard1 card n."""
    p = os.path.join(CARDS, f"{n}-sm.webp" if small else f"{n}.webp")
    return np.asarray(Image.open(p).convert("RGBA"))


@lru_cache(None)
def window_mask():
    a = np.asarray(Image.open(os.path.join(ROOT, "assets", "foil", "wotc-ecard", "win-pokemon-v1.webp")).convert("RGBA"))
    return a[..., 3] > 127


@lru_cache(None)
def frame_mask():
    """Where the two prints agree: the frame less the window, the strip and the ladder column."""
    fm = np.full((H, W), 255, np.uint8)
    fm[window_mask()] = 0
    fm[int(0.915 * H):, :] = 0
    fm[:, : int(0.075 * W)] = 0
    return cv2.erode(fm, np.ones((9, 9), np.uint8))


_sift = None


def sift():
    global _sift
    if _sift is None:
        _sift = cv2.SIFT_create(nfeatures=5000)
    return _sift


def gray(rgba):
    return cv2.cvtColor(np.ascontiguousarray(rgba[..., :3]), cv2.COLOR_RGB2GRAY)


def fit_affine(src_gray, dst_gray, mask_src, mask_dst, thresh=1.5):
    """Affine taking src pixel coords to dst pixel coords, from SIFT matches inside the masks. Returns (M, inliers)."""
    ks, ds = sift().detectAndCompute(src_gray, mask_src)
    kd, dd = sift().detectAndCompute(dst_gray, mask_dst)
    if ds is None or dd is None or len(ks) < 8 or len(kd) < 8:
        return None, 0
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(ds, dd, k=2)
    good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < 0.7 * p[1].distance]
    if len(good) < 8:
        return None, 0
    s = np.float32([ks[g.queryIdx].pt for g in good])
    d = np.float32([kd[g.trainIdx].pt for g in good])
    cv2.setRNGSeed(2002)  # RANSAC draws from OpenCV's RNG: a fixed seed makes every rerun identical
    M, inl = cv2.estimateAffine2D(s, d, ransacReprojThreshold=thresh, maxIters=8000, confidence=0.999)
    return M, int(inl.sum()) if inl is not None else 0


def warp(img, M, size=(W, H)):
    return cv2.warpAffine(img, M, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def colour_match(src, ref, mask):
    """Per-channel line a*src+b fitted to ref on mask (robust: trimmed least squares)."""
    out = src.astype(np.float32).copy()
    for c in range(3):
        x = src[..., c][mask].astype(np.float32)
        y = ref[..., c][mask].astype(np.float32)
        a, b = np.polyfit(x, y, 1)
        r = np.abs(a * x + b - y)
        keep = r < np.percentile(r, 80)
        a, b = np.polyfit(x[keep], y[keep], 1)
        out[..., c] = a * src[..., c] + b
    return np.clip(out, 0, 255)


def window_ncc(a, b):
    w = window_mask()
    x = a[w].astype(np.float32)
    y = b[w].astype(np.float32)
    x -= x.mean()
    y -= y.mean()
    return float((x * y).sum() / (np.sqrt((x * x).sum() * (y * y).sum()) + 1e-9))


@lru_cache(None)
def pair(n):
    """Register the twin of holo n. Returns dict(twin, M_frame, M_window, inliers, ncc)."""
    cards = data()
    name = cards[n]["name"]
    holo = scan(n)
    hg = gray(holo)
    best = None
    for t in range(33, 71):
        if cards[t]["name"] != name:
            continue
        tw = scan(t)
        tg = gray(tw)
        M, inl = fit_affine(tg, hg, frame_mask(), frame_mask())
        if M is None:
            continue
        wg = warp(tg, M)
        ncc = window_ncc(wg, hg)
        cand = dict(twin=t, M_frame=M, inliers=inl, ncc=ncc)
        if best is None or ncc > best["ncc"]:
            best = cand
    if best is None:
        raise SystemExit(f"no twin for ecard1-{n} {name}")
    # refine on the window: the Pokemon's ink matches between the prints even where the background does not
    tw = scan(best["twin"])
    wmask = cv2.erode(window_mask().astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
    Mw, inl_w = fit_affine(gray(tw), hg, None, wmask, thresh=1.2)
    # keep the window fit only when it is well supported and close to the frame fit
    if Mw is not None and inl_w >= 40:
        pts = np.float32([[100, 150], [500, 150], [100, 400], [500, 400]])
        a = pts @ best["M_frame"][:, :2].T + best["M_frame"][:, 2]
        b = pts @ Mw[:, :2].T + Mw[:, 2]
        if np.abs(a - b).max() < 6:
            best["M_window"] = Mw
            best["inliers_window"] = inl_w
    best.setdefault("M_window", best["M_frame"])
    best.setdefault("inliers_window", 0)
    return best


def registered_twin(n):
    """The twin's RGB scan in holo n's frame: the frame by the frame fit, the window by the window fit, colour-matched."""
    p = pair(n)
    tw = scan(p["twin"])
    holo = scan(n)
    frame = warp(tw, p["M_frame"])
    win = warp(tw, p["M_window"])
    wm = cv2.GaussianBlur(window_mask().astype(np.float32), (0, 0), 3)[..., None]
    rgb = frame[..., :3].astype(np.float32) * (1 - wm) + win[..., :3].astype(np.float32) * wm
    rgb = colour_match(rgb, holo[..., :3], frame_mask() > 0)
    return rgb


if __name__ == "__main__":
    for n in range(1, 33):
        p = pair(n)
        print(f"ecard1-{n:<3} {data()[n]['name']:<11} twin {p['twin']:<3} ncc {p['ncc']:.3f} inliers {p['inliers']:<4} "
              f"window inliers {p['inliers_window']:<4} scale {p['M_frame'][0, 0]:.4f} {p['M_frame'][1, 1]:.4f}")
