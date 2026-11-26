#!/usr/bin/env python3
"""Does each card's foil map (and etch map) line up with the scan the site draws under it?

Noah, 2026-11-26: "a lot of holos arent lined up" (Kyogre MEP 117 with the Pokémon Center stamp: every lit layer sat
about 1.3 % off the print, the text doubled) and "the holo didnt fit the card it was too small" (Expedition Mewtwo).
The first was a class: a variant print (stamp, cosmos, store promo) whose scan is a product photo cropped a little
differently from the base print's scan, wearing a map made for the base print. No render shows it at a glance and no
other gate measures it.

For every card with a `foilMap` or `etchMap` this fits the affine that takes the map's edges onto the scan's edges
(OpenCV ECC on gradient images at 360 px) and reports how far that moves a card corner, as a share of the card's width.
A map made for its scan fits at under 0.5 %; over --max (default 0.8 %) the map is off the print, provided the fit is
real: map edges and scan edges are different things (a map's holes are the print's lettering), so a weak fit wanders.
A fit counts only when it raises the correlation by --min-gain (0.1) over the map as it lies AND a second opinion
agrees (confirmed(): a large gain, or the same answer from each half of the card). First full run: 16 of 9,739 maps,
all stamped, Pokémon Center, prerelease and black star promos wearing a map made for another scan.

    python3 .claude/skills/card-textures/scripts/foil_align.py                  # every card, about 10 minutes
    python3 .claude/skills/card-textures/scripts/foil_align.py --sets me6,sv8   # some sets
    python3 .claude/skills/card-textures/scripts/foil_align.py --fix            # rewrite the maps that are off (new -aN files)

`--fix` warps each failing map onto its scan with the fitted affine, writes it beside the old one under a new name
(`<name>-a1.webp`; files under assets/ are never overwritten) and points the card's data at it. A fit with a low
correlation (--min-cc; a map with almost no edges, such as a plain window) is listed as unmeasured, never fixed.
Needs opencv-python-headless.
"""
import argparse
import json
import os
import re
import sys
from multiprocessing import Pool

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
W, H = 360, 503


def lum(path):
    return np.asarray(Image.open(path).convert("L").resize((W, H), Image.LANCZOS), dtype=np.float32) / 255


def alpha(path):
    m = Image.open(path)
    ch = m.getchannel("A") if m.mode in ("RGBA", "LA") else m.convert("L")
    return np.asarray(ch.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255


def edges(x):
    x = cv2.GaussianBlur(x, (0, 0), 1.0)
    gx, gy = cv2.Sobel(x, cv2.CV_32F, 1, 0), cv2.Sobel(x, cv2.CV_32F, 0, 1)
    e = np.sqrt(gx * gx + gy * gy)
    return cv2.GaussianBlur(e / (e.max() + 1e-6), (0, 0), 1.5)


def fit(scan_path, map_path):
    """(correlation, corner displacement in % of the width, 2x3 affine taking the map onto the scan) or None."""
    try:
        a, b = edges(lum(scan_path)), edges(alpha(map_path))
        if b.max() < 1e-3 or float((b > 0.08).mean()) < 0.01:
            return None
        cc, w = cv2.findTransformECC(a, b, np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE,
                                     (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    except (cv2.error, OSError, ValueError):
        return None
    pts = np.array([[0, 0, 1], [W, 0, 1], [0, H, 1], [W, H, 1]], dtype=np.float32)
    a0, b0 = a - a.mean(), b - b.mean()
    cc0 = float((a0 * b0).sum() / np.sqrt((a0 * a0).sum() * (b0 * b0).sum() + 1e-9))
    return float(cc), float(np.abs(pts @ w.T - pts[:, :2]).max() / W * 100), w.tolist(), float(cc) - cc0


def confirmed(scan_path, map_path, r, min_gain):
    """A second opinion on a fit that says a map is off. Real when the fit lifts the correlation a long way (a window
    map on the wrong crop), when the fitted correlation is itself strong (0.6), or when fits made on the card's four halves alone land where the whole-card fit did (a
    wandering fit does not repeat: the first run moved four correct GX maps by 2 to 5 % on correlations near 0.4)."""
    if r[3] >= 2 * min_gain or r[0] >= 0.6:
        return True
    a, b, full = edges(lum(scan_path)), edges(alpha(map_path)), np.array(r[2])
    close = 0
    for ys, xs in ((slice(0, H // 2), slice(None)), (slice(H // 2, H), slice(None)),
                   (slice(None), slice(0, W // 2)), (slice(None), slice(W // 2, W))):
        m = np.zeros((H, W), np.uint8)
        m[ys, xs] = 255
        try:
            _, w = cv2.findTransformECC(a, b, np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE,
                                        (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), m, 5)
        except cv2.error:
            continue
        c = np.array([np.mean(range(W)[xs]), np.mean(range(H)[ys]), 1.0])
        close += float(np.abs(w @ c - full @ c).max() / W * 100) < 0.15
    return close >= 3


def job(t):
    cid, key, scan, mp = t
    r = fit(os.path.join(ROOT, scan), os.path.join(ROOT, mp))
    return cid, key, scan, mp, r


def cards(sets):
    for f in sorted(os.listdir(os.path.join(ROOT, "data"))):
        if not f.endswith(".json") or (sets and f[:-5] not in sets):
            continue
        try:
            d = json.load(open(os.path.join(ROOT, "data", f)))
        except (OSError, ValueError):
            continue
        for c in (d if isinstance(d, list) else d.get("cards", []) if isinstance(d, dict) else []):
            if isinstance(c, dict) and c.get("id") and c.get("image"):
                yield f, c


def warp(map_path, w, out_path):
    m = Image.open(map_path)
    arr = np.asarray(m.convert("RGBA"))
    h, wd = arr.shape[:2]
    # the affine was fitted at W x H; rescale it to the map's own size
    sx, sy = wd / W, h / H
    A = np.array(w, dtype=np.float64)
    A = np.array([[A[0, 0], A[0, 1] * sx / sy, A[0, 2] * sx], [A[1, 0] * sy / sx, A[1, 1], A[1, 2] * sy]])
    # ECC's warp maps scan coordinates to map coordinates (it is applied with WARP_INVERSE_MAP)
    out = cv2.warpAffine(arr, A, (wd, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    Image.fromarray(out, "RGBA").save(out_path, quality=90, alpha_quality=100, method=6)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--sets")
    ap.add_argument("--max", type=float, default=0.8, help="largest corner displacement, %% of the card width")
    ap.add_argument("--min-cc", type=float, default=0.35, help="fits under this correlation are unmeasured")
    ap.add_argument("--min-gain", type=float, default=0.1,
                    help="the fit must raise the correlation by this much over the map as it lies, or it is noise")
    ap.add_argument("--out", default="/tmp/foil-align.json")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--jobs", type=int, default=4)
    args = ap.parse_args()
    sets = set(filter(None, (args.sets or "").split(",")))
    todo = [(c["id"], k, c["image"], c[k]) for _, c in cards(sets) for k in ("foilMap", "etchMap") if c.get(k)]
    with Pool(args.jobs) as p:
        res = p.map(job, todo, chunksize=32)
    json.dump([{"id": i, "key": k, "scan": s, "map": m, "fit": r} for i, k, s, m, r in res], open(args.out, "w"))
    bad = [(i, k, s, m, r) for i, k, s, m, r in res if r and r[0] >= args.min_cc and r[1] > args.max and r[3] >= args.min_gain]
    bad = [t for t in bad if confirmed(os.path.join(ROOT, t[2]), os.path.join(ROOT, t[3]), t[4], args.min_gain)]
    unmeasured = sum(1 for *_, r in res if not r or r[0] < args.min_cc)
    for i, k, s, m, r in sorted(bad, key=lambda t: -t[4][1]):
        print(f"{i:28} {k:8} off {r[1]:5.2f}%  cc {r[0]:.2f} (+{r[3]:.2f})  {m}")
    print(f"{len(bad)} of {len(res)} maps off their scan by more than {args.max}%; {unmeasured} unmeasured; {args.out}",
          file=sys.stderr)
    if args.fix and bad:
        new = {}
        for i, k, s, m, r in bad:
            base, ext = os.path.splitext(m)
            n = 1
            base0 = re.sub(r"-a\d+$", "", base)
            while os.path.exists(os.path.join(ROOT, f"{base0}-a{n}{ext}")):
                n += 1
            out = f"{base0}-a{n}{ext}"
            if (m, tuple(map(tuple, r[2]))) not in new:
                warp(os.path.join(ROOT, m), r[2], os.path.join(ROOT, out))
                new[(m, tuple(map(tuple, r[2])))] = out
            new[(i, k)] = new[(m, tuple(map(tuple, r[2])))]
        for f in sorted({f for f, c in cards(sets)}):
            p = os.path.join(ROOT, "data", f)
            text = open(p).read()
            d = json.loads(text)
            changed = False
            for c in (d if isinstance(d, list) else d.get("cards", [])):
                for k in ("foilMap", "etchMap"):
                    if isinstance(c, dict) and (c.get("id"), k) in new:
                        old, nw = c[k], new[(c["id"], k)]
                        # replace as text inside this card's own entry, so the file's formatting is kept
                        at = text.find(json.dumps(c["id"]))
                        j = text.find(json.dumps(old), at)
                        if at >= 0 and j >= 0:
                            text = text[:j] + json.dumps(nw) + text[j + len(json.dumps(old)):]
                            changed = True
            if changed:
                open(p, "w").write(text)
                json.loads(text)
        print(f"rewrote {len({v for k, v in new.items() if isinstance(k[1], tuple)})} maps", file=sys.stderr)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
