#!/usr/bin/env python3
"""Figure masks from a holo card's own scan: where the Pokémon (matte ink) is, so a foil map can leave it out.

Why: a holo's foil is the BACKGROUND of the picture; the Pokémon is printed on white ink and does not shine. A foil map that
is the whole art window puts the cosmos, the glitter and the sheen on the Pokémon (the 2026-11-28 site review failed every
DP LV.X for it). TCG Live has no maps for the older eras, so the cut-out comes from the scan, with two cues:

  1. Foil grain. A holo scan shows the foil: isolated bright or coloured dots and speckle where the card is foil, smooth print
     where it is matte. `dot_density()` counts small round blobs that stand out of a 5 px median (lines and edges are not
     round and are dropped) and smooths the count: high = foil, low = matte.
  2. SAM2 (ONNX, optional: --models DIR with sam2_hiera_small.encoder.onnx / .decoder.onnx from HuggingFace
     vietanhdev/segment-anything-2-onnx-models). Prompted automatically: positive points on the calmest (matte) spots near
     the middle of the zone, negative points on the densest foil; several prompt sets, the candidate that best separates
     matte from foil (matte inside, grain outside) wins. SAM gives the clean outline the grain cannot.
  Without the models it falls back to GrabCut seeded by the grain (rougher edges).

The result is cleaned (small islands dropped, pin holes filled, 1 px grown so the dark outline is inside) and written as an
8-bit PNG, 255 = figure, at the scan's size. A family generator then multiplies its foil map by (1 - figure).

    make_figure_masks.py --family dp-lvx --zone 0,0,600,440 --models DIR --out DIR [--preview DIR]
    make_figure_masks.py --sets pl2,pl3 --window assets/foil/dp-win/basic.webp --out DIR
    make_figure_masks.py --cards pl2-108,pl2-109 --zone 40,80,560,420 --out DIR

  --family also takes a finish class (dp-lvx, dp-prime ...): every face whose pattern has it.
  --zone x0,y0,x1,y1   the rectangle (scan pixels at 600 wide) the figure may be in; default: the window mask's bounding box
  --window FILE        a mask image of the art window (--window-channel alpha|lum|auto); the grain is judged inside it and
                       pixels outside it are never figure unless --spill
  --spill              the figure may leave the window (LV.X, Prime, ex: the Pokémon breaks the frame)
  --max-cover F        fail (exit 1, listed) a mask that covers more than F of the zone (default 0.80) or less than --min-cover
The module is importable: figure_mask(rgb, zone, window=None, spill=False, sam=None) -> (mask float 0..1, info dict).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

cv2.setNumThreads(1)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("ROOT") or os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
W, H = 600, 838
S = 1024
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


# ---------------------------------------------------------------- cue 1: the foil's grain in the scan
def dot_map(rgb: np.ndarray) -> np.ndarray:
    """Boolean map of the small round blobs that stand out of their surroundings (the foil's dots and speckle)."""
    f = rgb.astype(np.float32)
    med = cv2.medianBlur(rgb, 7).astype(np.float32)
    d = f - med
    res = np.maximum(d.max(axis=2), 0) + 0.5 * np.abs(d).max(axis=2)  # brighter in any channel, or a colour that differs
    b = res > 26
    lab, n = ndi.label(b)
    if not n:
        return np.zeros(b.shape, bool)
    sl = ndi.find_objects(lab)
    area = ndi.sum(b, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    for i, s in enumerate(sl):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        a = area[i]
        # a dot: small, about as wide as tall, and filling its box (a stroke of line art is long or sparse)
        keep[i + 1] = a <= 60 and max(h, w) <= 10 and max(h, w) <= 2.5 * min(h, w) + 1 and a >= 0.45 * h * w
    return keep[lab]


def dot_density(rgb: np.ndarray, sigma: float = 7.0) -> np.ndarray:
    """Smoothed share of dot pixels (0..1, about 0.02-0.2 on foil, near 0 on matte ink)."""
    return ndi.gaussian_filter(dot_map(rgb).astype(np.float32), sigma)


# ---------------------------------------------------------------- cue 2: SAM2
class Sam:
    def __init__(self, models: str, threads: int = 2):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        self.enc = ort.InferenceSession(os.path.join(models, "sam2_hiera_small.encoder.onnx"), so, providers=["CPUExecutionProvider"])
        self.dec = ort.InferenceSession(os.path.join(models, "sam2_hiera_small.decoder.onnx"), so, providers=["CPUExecutionProvider"])

    def encode(self, crop: np.ndarray):
        h, w = crop.shape[:2]
        s = S / max(w, h)
        nw, nh = int(round(w * s)), int(round(h * s))
        a = np.zeros((S, S, 3), np.float32)
        a[:nh, :nw] = (cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255 - MEAN) / STD
        return self.enc.run(None, {"image": a.transpose(2, 0, 1)[None]}), s, nw, nh, w, h

    def decode(self, state, points, labels):
        feats, s, nw, nh, w, h = state
        out = self.dec.run(None, {"image_embed": feats[2], "high_res_feats_0": feats[0], "high_res_feats_1": feats[1],
                                  "point_coords": (np.array(points, np.float32) * s)[None],
                                  "point_labels": np.array(labels, np.float32)[None],
                                  "mask_input": np.zeros((1, 1, 256, 256), np.float32), "has_mask_input": np.zeros(1, np.float32)})
        masks, ious = out[0][0], out[1][0]
        res = []
        for m, iou in zip(masks, ious):
            m = cv2.resize(m, (S, S), interpolation=cv2.INTER_LINEAR)[:nh, :nw]
            res.append((cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR) > 0, float(iou)))
        return res


def _peaks(score: np.ndarray, ok: np.ndarray, k: int, sep: int) -> list[tuple[int, int]]:
    """The k highest points of `score` inside `ok`, at least `sep` px apart: (x, y)."""
    s = np.where(ok, score, -1e9).copy()
    out = []
    for _ in range(k):
        i = int(np.argmax(s))
        y, x = divmod(i, s.shape[1])
        if s[y, x] <= -1e8:
            break
        out.append((x, y))
        cv2.circle(s, (x, y), sep, -1e9, -1)
    return out


def clean(b: np.ndarray, zone_area: int) -> np.ndarray:
    lab, n = ndi.label(b)
    if n:
        sizes = ndi.sum(b, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= max(120, 0.02 * sizes.max(), 0.002 * zone_area)
        b = keep[lab]
    holes = ndi.binary_fill_holes(b) & ~b
    lab, n = ndi.label(holes)
    if n:
        sizes = ndi.sum(holes, lab, range(1, n + 1))
        small = np.zeros(n + 1, bool)
        small[1:] = sizes < 0.004 * zone_area
        b = b | small[lab]
    b = ndi.binary_closing(b, structure=np.ones((3, 3)), iterations=2)
    b = ndi.binary_opening(b, structure=np.ones((3, 3)), iterations=1)
    b = ndi.gaussian_filter(b.astype(np.float32), 1.6) > 0.5  # round off ragged steps
    return ndi.binary_dilation(b, iterations=1)


def figure_mask(rgb: np.ndarray, zone, window: np.ndarray | None = None, spill: bool = False, sam: Sam | None = None,
                keep_out: np.ndarray | None = None):
    """rgb: the scan (H, W, 3 uint8). zone: (x0, y0, x1, y1). window: float mask of the art window or None.
    keep_out: bool mask of pixels that are printed frame furniture (never figure, never foil), ignored by the scoring.
    Returns (mask float32 0..1 at scan size, info)."""
    x0, y0, x1, y1 = zone
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    h, w = crop.shape[:2]
    win = np.ones((h, w), bool) if window is None else window[y0:y1, x0:x1] > 0.3
    dens = dot_density(crop)
    inwin = win if keep_out is None else win & ~keep_out[y0:y1, x0:x1]
    # the grain level that splits this scan: between the calm and the grainy halves of the window
    hi = float(np.percentile(dens[inwin], 90)) if inwin.any() else 0.0
    thr = max(0.012, 0.3 * hi)
    foil = dens > thr
    matte = dens < 0.45 * thr
    # the centre counts more: a figure sits in the middle, foil reaches the window's edge
    yy, xx = np.mgrid[0:h, 0:w]
    cen = 1 - np.clip(np.hypot((xx - w / 2) / (w / 2), (yy - h * 0.55) / (h / 2)), 0, 1.4) / 1.4
    calm = ndi.gaussian_filter(matte.astype(np.float32), 9) * (0.5 + 0.5 * cen)
    info = {"thr": round(thr, 4), "foil": round(float((foil & inwin).mean()), 3), "method": "grain"}

    # the window's rim: a figure touches some of it, the background nearly all of it
    rim = inwin & ~ndi.binary_erosion(inwin, iterations=7)
    nwin = max(1, int(inwin.sum()))

    def parts(m: np.ndarray):
        a = m & inwin
        b = ~m & inwin
        cover = a.sum() / nwin
        if a.sum() == 0 or b.sum() == 0:
            return cover, 0.0, 1.0
        sep = float((1 - foil[a].mean()) + foil[b].mean() - 1)  # -1..1; near 0 when the scan shows no grain to go by
        return cover, sep, float((m & rim).sum() / max(1, rim.sum()))

    def score(m: np.ndarray, iou: float = 0.8) -> float:
        """Grain separation (matte inside, grain outside) + SAM's own confidence - background-like shapes."""
        cover, sep, edge = parts(m)
        if not 0.08 <= cover <= 0.74:
            return -1.0
        missed = (matte & ~m & inwin).sum() / max(1, (matte & inwin).sum())  # calm print left outside
        return float(1.2 * sep + 0.5 * iou - 0.9 * max(0.0, edge - 0.42) - 0.25 * missed * max(0.0, sep) + 0.15 * cen[m & inwin].mean())

    def saliency() -> np.ndarray:
        """Colour distance from the colours along the window's rim, centre-weighted (the figure differs from the sky)."""
        lab = cv2.cvtColor(crop, cv2.COLOR_RGB2LAB).astype(np.float32)
        px = lab[rim]
        if len(px) < 50:
            return cen.astype(np.float32)
        cv2.setRNGSeed(7)
        _, _, cs = cv2.kmeans(px, 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 15, 1.0), 2, cv2.KMEANS_PP_CENTERS)
        d = cv2.GaussianBlur(np.min([np.linalg.norm(lab - c, axis=-1) for c in cs], axis=0), (0, 0), 5)
        return (d / max(float(d.max()), 1e-3) * (0.35 + 0.65 * cen) * inwin).astype(np.float32)

    best, best_s = None, -1.0
    if sam is not None:
        state = sam.encode(crop)
        wy, wx = np.where(inwin)
        box = [[int(wx.min()) + 2, int(wy.min()) + 2], [int(wx.max()) - 2, int(wy.max()) - 2]]
        sal = saliency()
        spk = _peaks(sal, inwin, 2, int(0.2 * w))
        top = sal >= np.percentile(sal[inwin], 85)
        lab_, n_ = ndi.label(top)
        if n_:
            k_ = int(np.argmax(ndi.sum(top, lab_, range(1, n_ + 1)))) + 1
            cy_, cx_ = ndi.center_of_mass(lab_ == k_)
        else:
            cy_, cx_ = h / 2, w / 2
        pos = _peaks(calm, inwin, 4, int(0.14 * w))
        neg = _peaks(ndi.gaussian_filter(foil.astype(np.float32), 9), inwin, 4, int(0.16 * w))
        prompt_sets = [(box + spk[:1] + [(cx_, cy_)], [2, 3, 1, 1]), (box + [(w / 2, h / 2)], [2, 3, 1]),
                       (spk[:1] + [(cx_, cy_)], [1, 1]), (box + spk, [2, 3] + [1] * len(spk))]
        if info["foil"] > 0.08:  # the scan shows grain: prompt from it too
            for k in (1, 2, 3):
                if len(pos) >= k:
                    prompt_sets.append((pos[:k] + neg[:2], [1] * k + [0] * len(neg[:2])))
                    prompt_sets.append((box + pos[:k] + neg[:3], [2, 3] + [1] * k + [0] * len(neg[:3])))
        cands, salient = [], []
        for k_, (pts, labs) in enumerate(prompt_sets):
            for m, iou in sam.decode(state, pts, labs):
                cands.append(m)
                if k_ < 4:
                    salient.append((m, iou))
                sc = score(m, iou)
                if sc > best_s:
                    best, best_s = m, sc

        def goal(m: np.ndarray) -> float:
            cover, sep, edge = parts(m)
            return -9.0 if cover > 0.74 else sep - 0.9 * max(0.0, edge - 0.42)

        if best is not None:
            # A figure is often several SAM objects (a head, a wing, a body). Where the grain is a guide, grow the winner
            # by any candidate that makes the split cleaner (more matte inside, more grain outside), then prompt the calm
            # areas still left out and do the same.
            for _ in range(5):
                g0 = goal(best)
                if parts(best)[1] < 0.2:
                    break
                left = ndi.binary_opening(matte & inwin & ~best, iterations=6)
                extra = []
                if left.sum() > 0.02 * nwin:
                    pt = _peaks(ndi.gaussian_filter(left.astype(np.float32), 7), inwin, 1, 10)
                    extra = [m for m, _ in sam.decode(state, pt + neg[:2], [1] + [0] * len(neg[:2]))]
                    extra = [m for m in extra if (m & inwin).sum() < 0.35 * nwin]
                pick, gp = None, g0 + 0.012
                for m in cands + extra:
                    if (m & ~best & inwin).sum() < 0.01 * nwin:
                        continue
                    g = goal(best | m)
                    if g > gp:
                        pick, gp = m, g
                if pick is None:
                    break
                best = best | pick
            # Still much calm print left outside (SAM kept a head and dropped the body, or took one of several objects):
            # let GrabCut grow the figure by colour, seeded with SAM's pick as sure figure and the grainy foil as sure ground.
            missed = (matte & ~best & inwin).sum() / max(1, (matte & inwin).sum())
            if missed > 0.3 and parts(best)[0] < 0.5:
                gc = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
                gc[(calm > 0.42) & inwin] = cv2.GC_PR_FGD
                gc[ndi.binary_erosion(best, iterations=3)] = cv2.GC_FGD
                gc[ndi.binary_erosion(foil, iterations=3) & ~best] = cv2.GC_BGD
                gc[~inwin & ~best] = cv2.GC_PR_BGD
                try:
                    cv2.setRNGSeed(7)
                    cv2.grabCut(crop[:, :, ::-1].copy(), gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 4, cv2.GC_INIT_WITH_MASK)
                    grown = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)) & (inwin | best)
                    grown = ndi.binary_opening(grown, iterations=3) | best
                    if goal(grown) > goal(best) - 0.02 and parts(grown)[0] <= 0.74:
                        best = grown
                        info["grown"] = True
                except cv2.error:
                    pass
            # The grain could not find the figure (a small or badly split pick): fall back on SAM's own idea of the main
            # object, the most confident saliency-prompted candidate of a plausible size that the grain does not contradict.
            cover, sep, edge = parts(best)
            if cover < 0.3 or sep < 0.33:
                alt, alt_s = None, -1.0
                for m, iou in salient:
                    c2, s2, e2 = parts(m | best)
                    if 0.25 <= c2 <= 0.74 and s2 > min(sep, 0.2) - 0.12:
                        v = iou + 0.4 * float(cen[m & inwin].mean()) - 0.9 * max(0.0, e2 - 0.5) + 0.5 * s2
                        if v > alt_s:
                            alt, alt_s = m, v
                if alt is not None:
                    best = best | alt
                    info["salient"] = True
            cover, sep, edge = parts(best)
            info.update(method="sam", score=round(best_s, 3), sep=round(sep, 3), edge=round(edge, 3))
    if best is None:
        gc = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
        gc[calm > 0.5] = cv2.GC_PR_FGD
        gc[ndi.binary_erosion(matte, iterations=8) & (cen > 0.5)] = cv2.GC_FGD
        gc[ndi.binary_erosion(foil, iterations=3)] = cv2.GC_BGD
        try:
            cv2.grabCut(crop[:, :, ::-1].copy(), gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 4, cv2.GC_INIT_WITH_MASK)
            best = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
        except cv2.error:
            best = calm > 0.5
        info.update(method="grabcut", score=round(score(best), 3))
        info["sep"] = round(parts(best)[1], 3)
    if not spill:
        best = best & win
    best = clean(best, int(inwin.sum()))
    full = np.zeros(rgb.shape[:2], np.float32)
    full[y0:y1, x0:x1] = best
    info["cover"] = round(float((best & inwin).sum() / max(1, inwin.sum())), 3)
    return ndi.gaussian_filter(full, 0.8), info


# ---------------------------------------------------------------- command line
def point_mask(rgb: np.ndarray, zone, points, sam: "Sam"):
    """The figure by prompt alone, for scans where the foil's grain does not separate it (a plain print, a dark figure on a
    dark sky, a busy background): SAM2 prompted with `points` on the figure (scan pixels) and the zone's four corners as
    background; of its masks, the best-scored one covering 6-70% of the zone, holes filled. Returns (mask float32 0..1 at
    scan size, info) like figure_mask()."""
    x0, y0, x1, y1 = zone
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    h, w = crop.shape[:2]
    st = sam.encode(crop)
    pos = [(x - x0, y - y0) for x, y in points]
    neg = [(8, 8), (w - 8, 8), (8, h - 8), (w - 8, h - 8)]
    cands = [(iou, m) for m, iou in sam.decode(st, pos + neg, [1] * len(pos) + [0] * 4) if 0.06 < m.mean() < 0.7]
    out = np.zeros(rgb.shape[:2], np.float32)
    if not cands:
        return out, {"method": "points", "cover": 1.0}
    iou, m = max(cands, key=lambda t: t[0])
    m = ndi.binary_fill_holes(m)
    out[y0:y1, x0:x1] = m
    return out, {"method": "points", "iou": round(iou, 3), "cover": round(float(m.mean()), 3)}


def load_mask(path: str, channel: str = "auto") -> np.ndarray:
    im = Image.open(path)
    a = np.asarray(im.convert("RGBA").resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    if channel == "lum":
        return a[..., :3].mean(axis=2) * a[..., 3]
    return a[..., 3] if channel == "alpha" or a[..., 3].min() < 0.99 else a[..., :3].mean(axis=2)


def faces(args) -> list[dict]:
    census = json.loads(subprocess.run(["node", os.path.join(HERE, "foil_census.mjs")], capture_output=True, text=True,
                                       cwd=ROOT, check=True, env={**os.environ, "ROOT": ROOT}).stdout)
    seen, out = set(), []
    fams = set(filter(None, (args.family or "").split(",")))
    sets = set(filter(None, (args.sets or "").split(",")))
    ids = set(filter(None, (args.cards or "").split(",")))
    for f in census:
        if f.get("reverse") or f["id"] in seen:
            continue
        if (f.get("family") in fams) or (fams & set((f.get("pattern") or "").split())) or (f.get("set") in sets) or (f["id"] in ids):
            seen.add(f["id"])
            out.append(f)
    return out


def preview(rgb, mask, zone, path):
    x0, y0, x1, y1 = zone
    c = rgb[y0:y1, x0:x1].astype(np.float32)
    m = mask[y0:y1, x0:x1, None]
    dark = c * (0.45 + 0.55 * m) + np.array([255, 0, 255], np.float32) * 0.55 * (1 - m)  # foil = magenta
    Image.fromarray(np.hstack([c, dark]).astype(np.uint8)).save(path, quality=85)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--family")
    ap.add_argument("--sets")
    ap.add_argument("--cards")
    ap.add_argument("--zone")
    ap.add_argument("--window")
    ap.add_argument("--window-channel", default="auto", choices=["auto", "alpha", "lum"])
    ap.add_argument("--spill", action="store_true")
    ap.add_argument("--models")
    ap.add_argument("--out", required=True)
    ap.add_argument("--preview")
    ap.add_argument("--max-cover", type=float, default=0.80)
    ap.add_argument("--min-cover", type=float, default=0.06)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
    window = load_mask(os.path.join(ROOT, args.window) if args.window and not os.path.isabs(args.window) else args.window, args.window_channel) if args.window else None
    if args.zone:
        zone = tuple(int(v) for v in args.zone.split(","))
    elif window is not None:
        ys, xs = np.where(window > 0.3)
        zone = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    else:
        sys.exit("give --zone or --window")
    sam = Sam(args.models) if args.models else None
    bad, log = [], {}
    for f in faces(args):
        rgb = np.asarray(Image.open(os.path.join(ROOT, f["img"])).convert("RGB").resize((W, H), Image.LANCZOS))
        mask, info = figure_mask(rgb, zone, window, args.spill, sam)
        Image.fromarray((mask * 255).round().astype(np.uint8)).save(os.path.join(args.out, f["id"] + ".png"))
        log[f["id"]] = info
        if args.preview:
            preview(rgb, mask, zone, os.path.join(args.preview, f["id"] + ".jpg"))
        flag = "" if args.min_cover <= info["cover"] <= args.max_cover else "  <-- cover out of range"
        if flag:
            bad.append(f["id"])
        print(f"{f['id']:14s} {info}{flag}", flush=True)
    json.dump(log, open(os.path.join(args.out, "figure-masks.json"), "w"), indent=1)
    if bad:
        print("out of range:", " ".join(bad), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
