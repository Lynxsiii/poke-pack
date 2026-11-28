#!/usr/bin/env python3
"""Cosmos fleck maps from each card's own scan: one RGBA map per card, alpha = where the card is foil, RGB = the flecks.

Why: the 2026-11-28 site review failed the DP cosmos families for "square pixel-grid sparkles stacked on the scan's own
cosmos" (the earlier maps pasted synthetic grids of 1.25 px dots over the dots the scan already shows) and for confetti on
the Pokémon. Real cosmos foil is soft round dots of varied size that light up near the highlight. So the flecks are now:

  1. the scan's OWN dots, lit where they are: every small round blob that stands out of a 7 px median inside the foil area
     (make_figure_masks.dot_map), soft-edged, one light colour per dot (seeded by the card id);
  2. a sparse seeded sprinkle of soft round dots of varied size (most 1-2 px, some 3-5 px, a few faint 6-9 px discs),
     placed where the scan shows some grain (proof the spot is foil), thinned where it already shows many, and nearly
     absent on smooth print: a Pokémon the cut-out missed gets no glitter.
No grids, no plus signs, no squares. RGB is black wherever there is no fleck, so a recipe can multiply the map by a pool of
light and screen it: the flecks only show round the pointer.

The foil AREA (alpha) comes from a source the family names: the family's shipped map (its Pokémon cut-out is kept), or an
era frame map times (1 - figure mask) from make_figure_masks.py (dp-lvx). New file names only; nothing shipped is rewritten.

    make_cosmos_flecks.py --family dp-cosmos-holo [--cards id,id] [--preview DIR] [--force]
    make_cosmos_flecks.py --family dp-lvx --figures DIR        # DIR = make_figure_masks.py --out
    families: dp-cosmos-holo, dp-sp, dp-special-rares, dp-legend, dp-lvx     (RESOLVE below; add one function per family)
Prints the ids written, as the space-separated list a js/fam module's MAPPED set takes.
"""
from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_figure_masks import dot_map  # noqa: E402

cv2.setNumThreads(1)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("ROOT") or os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
W, H = 600, 838
# light dichroic colours: teal, cyan, sky, violet, magenta, pink, gold, lime, white-ish
MIN_COVER = 0.03   # the least share of the foil area a card's flecks light (the DP1-DP6 scans give 0.03-0.05 on their own)
HUES = [0.47, 0.52, 0.58, 0.72, 0.83, 0.92, 0.12, 0.30]


def seed_of(cid: str) -> int:
    return int(hashlib.sha1(cid.encode()).hexdigest()[:8], 16)


def colour(rng) -> np.ndarray:
    if rng.random() < 0.22:
        return np.array([1.0, 1.0, 1.0], np.float32)
    h = HUES[int(rng.integers(len(HUES)))] + rng.uniform(-0.025, 0.025)
    return np.array(colorsys.hsv_to_rgb(h % 1, rng.uniform(0.45, 0.8), 1.0), np.float32)


def flecks(rgb: np.ndarray, area: np.ndarray, cid: str, synth: float = 1.0, scan: float = 1.0, floor: float = 0.1,
           min_cover: float = 0.0) -> np.ndarray:
    """rgb: scan (H, W, 3 uint8); area: float foil area 0..1. Returns float RGB (H, W, 3) 0..1, black where no fleck."""
    rng = np.random.default_rng(seed_of(cid))
    out = np.zeros(rgb.shape, np.float32)
    inside = area > 0.5
    # 1. the scan's own dots
    dots = dot_map(rgb) & inside
    lab, n = ndi.label(dots)
    if n and scan > 0:
        f = rgb.astype(np.float32)
        res = np.clip((f - cv2.medianBlur(rgb, 7).astype(np.float32)).max(axis=2), 0, None)
        strength = np.clip(ndi.maximum(res, lab, range(1, n + 1)) / 70.0, 0.35, 1.0)
        pal = np.stack([colour(rng) for _ in range(n)])
        lut = np.zeros((n + 1, 3), np.float32)
        lut[1:] = pal * strength[:, None] * scan
        out = lut[lab]
        # a scan thick with dots (the DP-era scans) would light up as a white field: thin them where they crowd
        crowd = ndi.gaussian_filter(dots.astype(np.float32), 10)
        out = cv2.GaussianBlur(out, (0, 0), 0.9) * 1.25 * np.clip(1.15 - crowd / 0.05, 0.4, 1.0)[..., None]
    # 2. a sparse sprinkle of soft round dots: most where the scan shows SOME grain (evidence that the spot is foil), thinned
    # where it already shows many, and nearly none where the print is smooth (a Pokémon the cut-out missed stays clean)
    dens = ndi.gaussian_filter(dot_map(rgb).astype(np.float32), 10)
    proof = np.clip(dens / 0.02, 0.0, 1.0)
    free = np.clip(1 - dens / 0.06, 0.2, 1.0) * np.maximum(floor, proof)
    ys, xs = np.where(inside)
    k = int(synth * len(ys) / 520)

    def sprinkle(out, k, free):
        SS = 3
        big = np.zeros((rgb.shape[0] * SS, rgb.shape[1] * SS, 3), np.float32)
        pick = rng.integers(len(ys), size=k)
        for i in pick:
            y, x = int(ys[i]), int(xs[i])
            if rng.random() > free[y, x]:
                continue
            u = rng.random()
            if u < 0.70:
                r, a = rng.uniform(0.7, 1.5), rng.uniform(0.55, 1.0)
            elif u < 0.95:
                r, a = rng.uniform(1.6, 3.2), rng.uniform(0.45, 0.85)
            else:
                r, a = rng.uniform(4.0, 7.5), rng.uniform(0.16, 0.3)
            c = colour(rng) * a
            cx, cy = (x + rng.random()) * SS, (y + rng.random()) * SS
            cv2.circle(big, (int(cx), int(cy)), max(1, int(round(r * SS))), tuple(float(v) for v in c), -1, lineType=cv2.LINE_AA)
        big = cv2.GaussianBlur(big, (0, 0), 0.8 * SS)
        return np.maximum(out, cv2.resize(big, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_AREA))

    if k and len(ys):
        out = sprinkle(out, k, free)
    # Round 2 (2026-11-28, "holo shows nothing when lit" on Call of Legends, the Shiny Legends and several LV.X): a clean scan
    # shows no grain, so both passes above leave the map nearly empty and the lit card looks like plain print. Top the map up
    # to a minimum share of lit pixels with the same soft round dots, spread evenly over the foil area (the cut-out keeps
    # them off the Pokemon).
    for _ in range(6):
        cover = float((out.max(axis=2)[inside] > 0.25).mean()) if len(ys) else 1.0
        if cover >= min_cover:
            break
        out = sprinkle(out, max(8, int((min_cover - cover) * len(ys) / 9)), np.full(dens.shape, 1.0, np.float32))
    return np.clip(out, 0, 1) * (area[..., None] > 0.02)


# ---------------------------------------------------------------- where each family keeps its foil area and its files
def _rgba(path: str) -> np.ndarray:
    return np.asarray(Image.open(os.path.join(ROOT, path)).convert("RGBA").resize((W, H), Image.LANCZOS)).astype(np.float32) / 255


def r_cosmos_holo(face, args):
    s, n = face["id"].split("-", 1)
    src = f"assets/foil/fam/dp-cosmos-holo/{s}/{n}.webp"
    return (_rgba(src)[..., 3], f"assets/foil/fam/dp-cosmos-holo/{s}/{n}-f3.webp", {}) if os.path.exists(os.path.join(ROOT, src)) else None


def r_sp(face, args):
    name = {"pl2-9": "pl2-9-v2"}.get(face["id"], face["id"])
    src = f"assets/foil/fam/dp-sp/{name}.webp"
    return (_rgba(src)[..., 3], f"assets/foil/fam/dp-sp/{face['id']}-f2.webp", {"min_cover": 0.0}) if os.path.exists(os.path.join(ROOT, src)) else None


def r_special(face, args):
    s, n = face["id"].split("-", 1)
    for key in (face["id"].lower(), n.lower()):
        src = f"assets/foil/fam/dp-special-rares/cos-{key}-v2.webp"
        if os.path.exists(os.path.join(ROOT, src)):
            return _rgba(src)[..., 3], f"assets/foil/fam/dp-special-rares/cos-{key}-v4.webp", {}
    return None


def r_legend(face, args):
    src = f"assets/foil/fam/dp-legend/legend-{face['id']}.webp"
    # a LEGEND is foil over the whole picture: fewer, finer dots (the scan's own grain is paint texture, not foil dots)
    return (_rgba(src)[..., 3], f"assets/foil/fam/dp-legend/legend-{face['id']}-f2.webp", {"scan": 0.0, "synth": 1.0, "floor": 1.0, "min_cover": 0.0}) if os.path.exists(os.path.join(ROOT, src)) else None


def r_lvx(face, args):
    sp = bool(__import__("re").search(r"\s(G|GL|FB|E4|C)\s+LV\.?X$", face["name"])) or "SP" in (face.get("sub") or "").split("/")
    m = _rgba(f"assets/foil/dp-special/{'lvx-sp' if sp else 'lvx'}.webp")
    fig = os.path.join(args.figures or "", face["id"] + ".png")
    if not os.path.exists(fig):
        # no figure masks at hand: keep the cut-out of the card's shipped map (its alpha is already softened and feathered)
        old = f"assets/foil/fam/dp-lvx/{face['id']}.webp"
        if not os.path.exists(os.path.join(ROOT, old)):
            return None
        return _rgba(old)[..., 3], f"assets/foil/fam/dp-lvx/{face['id']}-f2.webp", {"window": m[..., :3].mean(axis=2) * m[..., 3], "kept": True}
    f = np.asarray(Image.open(fig).convert("L").resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    return m[..., 3] * (1 - f), f"assets/foil/fam/dp-lvx/{face['id']}-f2.webp", {"window": m[..., :3].mean(axis=2) * m[..., 3], "soften": True}


# a family whose module only claims mapped faces is found by its finish class too, so a first run can see its cards
PATTERN = {"dp-lvx": "dp-lvx"}
RESOLVE = {"dp-cosmos-holo": r_cosmos_holo, "dp-sp": r_sp, "dp-special-rares": r_special, "dp-legend": r_legend, "dp-lvx": r_lvx}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--family", required=True, choices=sorted(RESOLVE))
    ap.add_argument("--cards")
    ap.add_argument("--figures")
    ap.add_argument("--preview")
    ap.add_argument("--force", action="store_true", help="rewrite a file this script wrote earlier in the same branch (never a shipped one)")
    args = ap.parse_args()
    census = json.loads(subprocess.run(["node", os.path.join(HERE, "foil_census.mjs")], capture_output=True, text=True,
                                       cwd=ROOT, check=True, env={**os.environ, "ROOT": ROOT}).stdout)
    ids = set(filter(None, (args.cards or "").split(",")))
    done, seen = [], set()
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
    for f in census:
        mine = f.get("family") == args.family or (args.family in PATTERN and PATTERN[args.family] in (f.get("pattern") or "").split())
        if not mine or f.get("reverse") or f["id"] in seen or (ids and f["id"] not in ids):
            continue
        seen.add(f["id"])
        r = RESOLVE[args.family](f, args)
        if r is None:
            print("no foil area for", f["id"], file=sys.stderr)
            continue
        area, out, opt = r
        dst = os.path.join(ROOT, out)
        if os.path.exists(dst) and not args.force:
            done.append(f["id"])
            continue
        rgb = np.asarray(Image.open(os.path.join(ROOT, f["img"])).convert("RGB").resize((W, H), Image.LANCZOS))
        zone = area if "window" not in opt else area * (opt["window"] > 0.5)   # LV.X: coloured flecks in the art window only
        if opt.get("kept"):
            zone = np.clip(zone * 2.2, 0, 1)   # the shipped alpha is halved where the scan shows no grain: flecks go there too
        fl = flecks(rgb, zone, f["id"], synth=opt.get("synth", 1.0), scan=opt.get("scan", 1.0), floor=opt.get("floor", 0.1),
                    min_cover=opt.get("min_cover", MIN_COVER))
        if opt.get("soften"):
            # where the scan shows no grain at all the cut-out may have missed part of the Pokémon: half the foil there
            proof = np.clip(ndi.gaussian_filter(dot_map(rgb).astype(np.float32), 12) / 0.02, 0, 1)
            area = area * np.where(opt["window"] > 0.5, 0.5 + 0.5 * proof, 1.0)
        # feather the foil area toward the cut-out, so the sheen fades into the Pokémon instead of tracing the mask's edge
        if not opt.get("kept"):
            area = np.minimum(area, np.clip((ndi.gaussian_filter(area.astype(np.float32), 5) - 0.5) * 2.2, 0, 1))
        rgba = np.dstack([fl, area])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA").save(dst, lossless=True, method=4, exact=True)
        done.append(f["id"])
        if args.preview:
            scan = rgb.astype(np.float32) / 255
            lit = 1 - (1 - scan) * (1 - fl * area[..., None])
            cut = scan * (0.3 + 0.7 * area[..., None])
            Image.fromarray((np.hstack([cut, lit])[:460] * 255).astype(np.uint8)).save(os.path.join(args.preview, f["id"] + ".jpg"), quality=86)
    print(" ".join(sorted(done)))


if __name__ == "__main__":
    main()
