#!/usr/bin/env python3
"""Draw the Pokémon silhouette masks of the EX generation's refractor ("Holon") holos: assets/foil/ex-delta/<card id>.webp.

A refractor print (js/ex-foil.js exRefractor: Delta Species, Holon Phantoms, the Crystal Guardians delta holos, all of Dragon
Frontiers) shines on the POKÉMON; the art background is matte. TCG Live has no EX maps, so the silhouette is derived from the card
scan: GrabCut (OpenCV) inside the art window, seeded from a centred ellipse and the window's edge, steered by a few hand hints per
card where the art defeats it (`HINTS`, in pixels of the preview crop, i.e. the 600 x 838 scan minus the offset OFF: `fg` / `bg` = [x, y, radius] dabs, `bgpoly` / `fgpoly` = lists of polygons [[x, y], ...] that are surely
background / Pokémon, `box` = a rectangle outside which nothing is Pokémon), then cleaned (largest bodies kept, holes filled, closed, grown a pixel so the dark
outline is inside) and feathered. A card whose silhouette comes out implausible takes a soft centred oval instead (`FALLBACK`).

Each mask is a 300 x 419 white webp whose ALPHA is the shine (`has-foil-map`, `mask-size: 100% 100%`, like the other drawn EX masks):
    1.0   the Pokémon (inside the art window: the window masks of the regular and the ex frames cut off the printed chain frame,
          the Evolves-from circle and the BASIC tab),
    0.30  the yellow border of a Delta Species holo (the clips show a soft sheen on it; a Pokémon-ex and a Gold Star keep a plain
          border: Elite Fourum posts 54 and 60), edge to edge but never the name bar, text or footer,
    0     the art background, the printed frame, the name bar, the text box and the foot.

The Special-Energy-free sheen Energy (Holon Phantoms 105-110, Power Keepers 103-108) take `energy-art.webp`: the art window alone,
one file for both sets (same frame), drawn from the window of the basic Energy frame measured on the scans.

New files only (assets are cached for a year); an existing file is kept and named. `--force` redraws into a `-vN` suffix.

    python3 .claude/skills/card-textures/scripts/make_ex_delta_masks.py [--only ex11-8,ex15-2] [--preview DIR] [--out DIR]
"""
from __future__ import annotations

import argparse
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "ex-delta-holon"
W, H = 600, 838
OW, OH = 300, 419
RIM = 11  # the yellow border, card pixels (measured: the border to body edge sits 9-12 px in on the scans)
RIM_ALPHA = 0.30
# the art window of the regular frames, from assets/foil/ex-win; the ex / Gold Star frames from assets/foil/ex-ex
WIN_BOX = (43, 78, 556, 388)

# hand hints, card pixels: fg / bg dabs [x, y, r], box [x0, y0, x1, y1] (nothing outside it is Pokémon)
HINTS: dict[str, dict] = json.load(open(Path(__file__).with_name("make_delta_holon_hints.json")))
# cards that take a soft centred oval instead of a derived silhouette
FALLBACK: set[str] = set()
# cards whose art is the Pokémon edge to edge (Rayquaza's coils fill the window): the whole window, eased in from its edge
FULL: set[str] = {"ex13-16"}


OFF = (36, 70)  # hints are read off the preview crop (the art window with a margin): add this to get card pixels


def shift_hint(h: dict) -> dict:
    ox, oy = OFF
    out = {}
    for k, v in h.items():
        if k in ("fg", "bg"):
            out[k] = [(x + ox, y + oy, r) for x, y, r in v]
        elif k in ("fgpoly", "bgpoly"):
            out[k] = [[(x + ox, y + oy) for x, y in poly] for poly in v]
        elif k == "box":
            out[k] = (v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy)
    return out


def card_list() -> list[tuple[str, str]]:
    """(card id, kind) of every refractor print: kind is 'pokemon', 'ex' or 'star' (the frame)."""
    out = []
    for s in ("ex11", "ex13", "ex14", "ex15"):
        for c in json.load(open(ROOT / "data" / f"{s}.json")):
            r = c["rarity"]
            if c.get("supertype") == "Energy" or c.get("holoEnergy"):
                continue
            n = c["id"].split("-")[1]
            if s == "ex11" and r == "Rare Holo":
                out.append((c["id"], "pokemon"))
            elif s == "ex13" and r == "Rare Holo":
                out.append((c["id"], "pokemon"))
            elif s == "ex13" and r == "Rare Holo Star" and n == "102":
                out.append((c["id"], "star"))
            elif s == "ex14" and "δ" in c["name"] and r in ("Rare Holo", "Rare Holo EX"):
                out.append((c["id"], "pokemon" if r == "Rare Holo" else "ex"))
            elif s == "ex15" and r == "Rare Holo":
                out.append((c["id"], "pokemon"))
            elif s == "ex15" and r == "Rare Holo EX":
                out.append((c["id"], "ex"))
            elif s == "ex15" and r == "Rare Holo Star":
                out.append((c["id"], "star"))
    return out


def window_alpha(cid: str, kind: str, stage: bool) -> np.ndarray:
    """The art window of the card's frame as 0..1 at 600 x 838."""
    if kind == "pokemon":
        f = ROOT / "assets/foil/ex-win" / ("pokemon-evo.webp" if stage else "pokemon.webp")
    else:
        f = ROOT / "assets/foil/ex-ex" / ("win-A-stage.webp" if stage else "win-A-basic.webp")
    return np.array(Image.open(f).convert("RGBA"))[..., 3].astype(np.float32) / 255.0


def segment(rgb: np.ndarray, win: np.ndarray, hint: dict) -> np.ndarray:
    hint = shift_hint(hint)
    """GrabCut inside the window's bounding box; returns a 0/1 float array at 600 x 838 (0 outside the window)."""
    ys, xs = np.where(win > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    h, w = crop.shape[:2]
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    if "box" in hint:
        bx0, by0, bx1, by1 = hint["box"]
        inside = (xx + x0 >= bx0) & (xx + x0 < bx1) & (yy + y0 >= by0) & (yy + y0 < by1)
    else:
        inside = np.ones((h, w), bool)
    ell = (((xx - w * 0.5) / (w * 0.40)) ** 2 + ((yy - h * 0.5) / (h * 0.40)) ** 2) < 1
    core = (((xx - w * 0.5) / (w * 0.16)) ** 2 + ((yy - h * 0.5) / (h * 0.16)) ** 2) < 1
    m[ell & inside] = cv2.GC_PR_FGD
    if "fg" not in hint:
        m[core & inside] = cv2.GC_FGD
    m[~inside] = cv2.GC_BGD
    b = 3
    m[:b, :] = m[-b:, :] = cv2.GC_BGD
    m[:, :b] = m[:, -b:] = cv2.GC_BGD
    for k, v in (("bg", cv2.GC_BGD), ("fg", cv2.GC_FGD)):
        for (px, py, r) in hint.get(k, []):
            cv2.circle(m, (int(px - x0), int(py - y0)), int(r), int(v), -1)
    for k, v in (("bgpoly", cv2.GC_BGD), ("fgpoly", cv2.GC_FGD)):
        for poly in hint.get(k, []):
            pts = np.array([[px - x0, py - y0] for px, py in poly], np.int32)
            cv2.fillPoly(m, [pts], int(v))
    bgm = np.zeros((1, 65))
    fgm = np.zeros((1, 65))
    cv2.setRNGSeed(7)  # GrabCut's k-means seeding: fixed, so a redraw gives the same silhouette
    cv2.grabCut(crop, m, None, bgm, fgm, 5, cv2.GC_INIT_WITH_MASK)
    sil = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & inside
    full = np.zeros((H, W), bool)
    full[y0:y1, x0:x1] = sil
    return full


def clean(sil: np.ndarray, win: np.ndarray) -> np.ndarray:
    """Keep the real bodies, fill holes, close small gaps, grow a pixel (the dark outline belongs to the Pokémon)."""
    sil = ndi.binary_opening(sil, iterations=1)
    lab, n = ndi.label(sil)
    if n:
        sizes = ndi.sum(sil, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(150, 0.04 * sizes.max())]
        sil = np.isin(lab, keep)
    sil = ndi.binary_closing(sil, structure=np.ones((3, 3)), iterations=3)
    # fill small holes only: a loop of the body can enclose real background (Deoxys' coil)
    holes = ndi.binary_fill_holes(sil) & ~sil
    lab, n = ndi.label(holes)
    for i in range(1, n + 1):
        if (lab == i).sum() < 0.012 * (win > 0.5).sum():
            sil |= lab == i
    sil = ndi.binary_dilation(sil, iterations=1)
    return sil


def oval_fallback(win: np.ndarray) -> np.ndarray:
    ys, xs = np.where(win > 0.5)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    rx, ry = (xs.max() - xs.min()) * 0.30, (ys.max() - ys.min()) * 0.40
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip((1.2 - d) / 0.5, 0, 1).astype(np.float32)


def draw(args) -> tuple[str, float, bool, np.ndarray, np.ndarray]:
    cid, kind, stage = args
    s, n = cid.split("-")
    im = Image.open(ROOT / "assets" / "cards" / s / f"{n}.webp").convert("RGBA")
    scan_alpha = np.array(im)[..., 3].astype(np.float32) / 255.0
    bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
    rgb = np.array(Image.alpha_composite(bg, im).convert("RGB"))
    win = window_alpha(cid, kind, stage)
    fb = cid in FALLBACK
    if cid in FULL:
        inner = ndi.gaussian_filter(ndi.binary_erosion(win > 0.5, iterations=7).astype(np.float32), 3.0)
        return cid, float((inner * win).mean()), False, inner * win, rgb
    if not fb:
        sil = clean(segment(rgb, win, HINTS.get(cid, {})), win)
        frac = sil[win > 0.5].mean()
        if frac < 0.05 or frac > 0.80:
            fb = True
    if fb:
        poke = oval_fallback(win)
    else:
        poke = ndi.gaussian_filter(sil.astype(np.float32), 1.4)
        poke = np.clip((poke - 0.15) / 0.7, 0, 1)
    a = poke * win
    if kind == "pokemon":
        yy, xx = np.mgrid[0:H, 0:W]
        rim = (xx < RIM) | (xx >= W - RIM) | (yy < RIM) | (yy >= H - RIM)
        a = np.maximum(a, rim.astype(np.float32) * RIM_ALPHA * scan_alpha)
    return cid, float(a.mean()), fb, a, rgb


def save(a: np.ndarray, path: Path) -> int:
    small = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((OW, OH), Image.LANCZOS)
    rgba = Image.new("RGBA", (OW, OH), (255, 255, 255, 0))
    rgba.putalpha(small)
    rgba.save(path, "WEBP", quality=88, alpha_quality=90, method=6, exact=True)
    return path.stat().st_size


ENERGY_ART = (13, 77, 587, 785)  # x0, y0, x1, y1 of the basic Energy's picture (header bar above, footer strip below)


def energy_mask() -> np.ndarray:
    x0, y0, x1, y1 = ENERGY_ART
    a = np.zeros((H, W), np.float32)
    a[y0:y1, x0:x1] = 1.0
    return ndi.gaussian_filter(a, 1.2)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--force", default="", help="suffix (-v2) to redraw existing files under")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    jobs = []
    for cid, kind in card_list():
        if only and cid not in only:
            continue
        stage = "Stage" in " ".join(
            next(c for c in json.load(open(ROOT / "data" / f"{cid.split('-')[0]}.json")) if c["id"] == cid)["subtypes"])
        jobs.append((cid, kind, stage))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    prev = Path(a.preview) if a.preview else None
    if prev:
        prev.mkdir(parents=True, exist_ok=True)
    total = 0
    with Pool(4) as pool:
        for cid, mean, fb, alpha, rgb in pool.imap(draw, jobs):
            path = out / f"{cid}{a.force}.webp"
            note = ""
            if not a.no_save:
                if path.exists():
                    note = " (kept)"
                else:
                    total += save(alpha, path)
            print(f"{cid:10s} mean {mean:.3f}{' FALLBACK' if fb else ''}{note}", flush=True)
            if prev:
                ov = rgb.astype(np.float32) * (0.18 + 0.82 * alpha[..., None])
                crop = ov[70:395, 36:564].astype(np.uint8)
                Image.fromarray(crop).save(prev / f"{cid}.png")
    if not only or "energy-art" in only:
        path = out / f"energy-art{a.force}.webp"
        if not a.no_save and not path.exists():
            total += save(energy_mask(), path)
        if prev:
            im = Image.open(ROOT / "assets/cards/ex13/105.webp").convert("RGBA")
            bgc = Image.new("RGBA", im.size, (128, 128, 128, 255))
            rgb = np.array(Image.alpha_composite(bgc, im).convert("RGB")).astype(np.float32)
            Image.fromarray((rgb * (0.18 + 0.82 * energy_mask()[..., None])).astype(np.uint8)).save(prev / "energy-art.png")
    print("bytes written", total)


if __name__ == "__main__":
    sys.exit(main())
