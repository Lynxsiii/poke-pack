#!/usr/bin/env python3
"""Draw the Base Set (base1) holo foil masks: where the real card's foil shows, card by card.

Family wotc-base-set (older-era holo remaster, 2026-10-01). A Base Set Rare Holo is ink printed over a holographic mirror
foil: the art window's BACKGROUND is translucent ink over the foil (it flashes silver and rainbow under a lamp), while the
Pokémon is printed over an opaque white underlay and stays matte; so does the frame. TCG Live published no maps for 1999, so
every mask is drawn from the card's own scan (assets/cards/base1/<n>.webp, 600 x 838):

  1. The art window is measured on each scan (the strongest bright-to-dark step of the gold window line, median over the edge),
     because the shared WotC window (assets/foil/wotc-win/pokemon-v1.webp) runs 2-3 px short of the base1 window on the right
     and at the bottom.
  2. The Pokémon is segmented with GrabCut (OpenCV) on a median-smoothed copy of the scan (the 7 px median removes the foil's
     stars and streaks, so the background is one colour family), seeded with the window's edge band as background, a centred
     ellipse as probable Pokémon, and the hand hints in make_base1_masks_hints.json (card pixels): `fg` / `bg` dabs [x, y, r],
     `fgpoly` / `bgpoly` polygons [[x, y], ...], `box` [x0, y0, x1, y1] outside which nothing is Pokémon, `edge_fg` the window
     sides the Pokémon touches ("left", "right", "top", "bottom": no background seed there).
     After the cut: `ink` adds black ink joined to the Pokémon (a thin black tail), `lines` draws thin parts (whiskers) as
     Pokémon, `cut` / `add` polygons force background / Pokémon.
  3. The silhouette is cleaned (small specks dropped, holes up to `hole` (default 1.2 %) of the window filled, closed, grown by
     `grow` px (default 1) so the dark outline and the white-underlay halo stay matte) and feathered by 0.8 px.

Output (new files only; assets are cached for a year, so a change is a new -vN name):
  assets/foil/fam/wotc-base-set/<n>-bg-v<k>.webp   600 x 838, white, ALPHA = foil (1 on the window background, 0 on the Pokémon
                                                   and outside the window), lossless.
Debug: --preview DIR writes <n>-overlay.png (the mask's edge drawn on the scan) and a contact sheet.

  python3 .claude/skills/card-textures/scripts/fam/wotc-base-set/make_base1_masks.py --preview /tmp/x [--only 4,2] [--version 1] [--write]

Seeded (cv2.setRNGSeed), so a re-run draws the same masks.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-base-set"
W, H = 600, 838
NOMINAL = (62, 96, 539, 431)  # x0, y0, x1, y1 (exclusive end) of the base1 art window, measured on Charizard, Blastoise, Mewtwo
HINTS: dict = json.load(open(Path(__file__).with_name("make_base1_masks_hints.json")))
# The Stage 1 and Stage 2 cards print the evolution badge (a grey box with the earlier Pokémon, in a gold starburst) over the
# window's top-left corner: matte ink, never foil. Its shape is the same plate on every evolved card, so it is voted from them.
STAGE = (1, 2, 4, 6, 8, 9, 11, 12, 13, 14, 15)
BADGE_PAD = 4  # the template is cut from (x0 - 4, y0 - 4) to (x0 + 100, y0 + 70) of each card's measured window
BADGE_W, BADGE_H = 104, 74


def scan(n: int) -> tuple[np.ndarray, np.ndarray]:
    im = Image.open(ROOT / "assets" / "cards" / "base1" / f"{n}.webp").convert("RGBA")
    a = np.array(im)
    return a[..., :3].copy(), a[..., 3].astype(np.float32) / 255.0


def luminance(rgb: np.ndarray) -> np.ndarray:
    f = rgb.astype(np.float32)
    return f[..., 0] * 0.299 + f[..., 1] * 0.587 + f[..., 2] * 0.114


def window(rgb: np.ndarray) -> tuple[int, int, int, int]:
    """The art window's inner rectangle: the bright gold line meets the dark art. Median of the strongest step per row / column."""
    L = cv2.GaussianBlur(luminance(rgb), (0, 0), 0.7)
    x0n, y0n, x1n, y1n = NOMINAL
    rows = range(y0n + 40, y1n - 40, 2)
    cols = range(x0n + 40, x1n - 40, 2)
    # left edge: bright (frame) at x-1, dark at x -> largest L[x-1] - L[x]
    def step(profile: np.ndarray, start: int, sign: int) -> int:
        d = (profile[:-1] - profile[1:]) * sign
        return start + int(np.argmax(d)) + 1

    left = [step(L[y, x0n - 8: x0n + 8], x0n - 8, 1) for y in rows]
    right = [step(L[y, x1n - 8: x1n + 8], x1n - 8, -1) for y in rows]  # dark then bright: first bright index
    top = [step(L[y0n - 8: y0n + 8, x], y0n - 8, 1) for x in cols]
    bottom = [step(L[y1n - 8: y1n + 8, x], y1n - 8, -1) for x in cols]
    return int(np.median(left)), int(np.median(top)), int(np.median(right)), int(np.median(bottom))


def badge_like(rgb: np.ndarray, win: tuple[int, int, int, int]) -> np.ndarray:
    """Gold-starburst or grey-box pixels in the window's top-left corner region (BADGE_H x BADGE_W, bool)."""
    x0, y0 = win[0], win[1]
    c = rgb[y0 - BADGE_PAD: y0 - BADGE_PAD + BADGE_H, x0 - BADGE_PAD: x0 - BADGE_PAD + BADGE_W].astype(int)
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(2), c.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    gold = (R > 140) & (G > 100) & (R - B > 50) & (G - B > 20) & (R >= G - 10)
    grey = (sat < 0.16) & (mx > 115) & (mx < 240)
    return gold | grey


def badge_template() -> np.ndarray:
    """The evolution badge voted over the evolved cards: majority of badge-like pixels, holes filled (the box's picture varies),
    the piece joined to the corner kept, one pixel grown. Bool, BADGE_H x BADGE_W, origin (x0 - 4, y0 - 4)."""
    votes = []
    for n in STAGE:
        rgb, _ = scan(n)
        votes.append(badge_like(rgb, window(rgb)).astype(np.float32))
    v = cv2.GaussianBlur(np.mean(votes, 0), (0, 0), 0.8) > 0.5
    v = ndi.binary_closing(v, iterations=2)
    v = ndi.binary_fill_holes(v)
    lab, n = ndi.label(v)
    if n:
        corner = lab[BADGE_PAD + 2, BADGE_PAD + 2]
        v = lab == corner if corner else lab == (1 + int(np.argmax(ndi.sum(v, lab, range(1, n + 1)))))
    # the badge hangs from the frame: everything above its lowest pixel in each column is badge (the box's picture runs off the
    # top of the template, so a hole fill cannot close it)
    for x in range(v.shape[1]):
        ys = np.where(v[:, x])[0]
        if len(ys):
            v[: ys.max() + 1, x] = True
    return ndi.binary_dilation(v, iterations=1)


def place_badge(template: np.ndarray, win: tuple[int, int, int, int]) -> np.ndarray:
    full = np.zeros((H, W), bool)
    x0, y0 = win[0] - BADGE_PAD, win[1] - BADGE_PAD
    full[y0: y0 + BADGE_H, x0: x0 + BADGE_W] = template
    return full


def segment(rgb: np.ndarray, win: tuple[int, int, int, int], hint: dict) -> np.ndarray:
    """GrabCut inside the window; returns a bool Pokémon mask at 600 x 838."""
    x0, y0, x1, y1 = win
    smooth = cv2.medianBlur(rgb, 7)
    crop = np.ascontiguousarray(smooth[y0:y1, x0:x1])
    h, w = crop.shape[:2]
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    ell = (((xx - w * 0.5) / (w * 0.34)) ** 2 + ((yy - h * 0.52) / (h * 0.42)) ** 2) < 1
    m[ell] = cv2.GC_PR_FGD
    band = int(hint.get("band", 4))
    touch = set(hint.get("edge_fg", []))
    if "top" not in touch:
        m[:band, :] = cv2.GC_BGD
    if "bottom" not in touch:
        m[-band:, :] = cv2.GC_BGD
    if "left" not in touch:
        m[:, :band] = cv2.GC_BGD
    if "right" not in touch:
        m[:, -band:] = cv2.GC_BGD
    if "box" in hint:
        bx0, by0, bx1, by1 = hint["box"]
        inside = (xx + x0 >= bx0) & (xx + x0 < bx1) & (yy + y0 >= by0) & (yy + y0 < by1)
        m[~inside] = cv2.GC_BGD
    for k, v in (("bg", cv2.GC_BGD), ("fg", cv2.GC_FGD), ("prbg", cv2.GC_PR_BGD), ("prfg", cv2.GC_PR_FGD)):
        for (px, py, r) in hint.get(k, []):
            cv2.circle(m, (int(px - x0), int(py - y0)), int(r), int(v), -1)
    for k, v in (("bgpoly", cv2.GC_BGD), ("fgpoly", cv2.GC_FGD), ("prbgpoly", cv2.GC_PR_BGD), ("prfgpoly", cv2.GC_PR_FGD)):
        for poly in hint.get(k, []):
            pts = np.array([[px - x0, py - y0] for px, py in poly], np.int32)
            cv2.fillPoly(m, [pts], int(v))
    bgm = np.zeros((1, 65), np.float64)
    fgm = np.zeros((1, 65), np.float64)
    cv2.setRNGSeed(7)
    cv2.grabCut(crop, m, None, bgm, fgm, int(hint.get("iters", 6)), cv2.GC_INIT_WITH_MASK)
    sil = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    full = np.zeros((H, W), bool)
    full[y0:y1, x0:x1] = sil
    return full


def add_ink(sil: np.ndarray, rgb: np.ndarray, win: tuple[int, int, int, int], ink) -> np.ndarray:
    """Black ink joined to the Pokémon is Pokémon: a thin black tail or the back of an ear is the same colour family as a dark
    background after smoothing, so GrabCut drops it, but its brightest channel stays far below the background's (Raichu's tail
    reads 10-20, the starlight background 55+). `ink` is the threshold, or {"t": threshold, "box": [x0, y0, x1, y1]}."""
    t, box = (ink["t"], ink.get("box")) if isinstance(ink, dict) else (ink, None)
    x0, y0, x1, y1 = win
    dark = cv2.medianBlur(rgb, 3).max(2) < int(t)
    lim = np.zeros((H, W), bool)
    lim[y0 + 3: y1 - 3, x0 + 3: x1 - 3] = True
    if box:
        b = np.zeros((H, W), bool)
        b[box[1]: box[3], box[0]: box[2]] = True
        lim &= b
    dark &= lim
    lab, n = ndi.label(dark, structure=np.ones((3, 3)))
    if not n:
        return sil
    near = ndi.binary_dilation(sil, iterations=2)
    hit = np.unique(lab[near & dark])
    add = np.isin(lab, hit[hit > 0])
    # the ink's anti-aliased rim is lighter than the threshold: one pixel more
    return sil | (ndi.binary_dilation(add, iterations=1) & lim)


def clean(sil: np.ndarray, win: tuple[int, int, int, int], hint: dict, rgb: np.ndarray | None = None) -> np.ndarray:
    x0, y0, x1, y1 = win
    area = (x1 - x0) * (y1 - y0)
    sil = ndi.binary_opening(sil, iterations=1)
    lab, n = ndi.label(sil)
    if n:
        sizes = ndi.sum(sil, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(60, float(hint.get("minpart", 0.02)) * sizes.max())]
        sil = np.isin(lab, keep)
    if hint.get("ink") and rgb is not None:
        sil = add_ink(sil, rgb, win, hint["ink"])
    sil = ndi.binary_closing(sil, structure=np.ones((3, 3)), iterations=2)
    holes = ndi.binary_fill_holes(sil) & ~sil
    lab, n = ndi.label(holes)
    hole = float(hint.get("hole", 0.012))
    for i in range(1, n + 1):
        if (lab == i).sum() < hole * area:
            sil |= lab == i
    g = int(hint.get("grow", 1))
    if g > 0:
        sil = ndi.binary_dilation(sil, iterations=g)
    elif g < 0:
        sil = ndi.binary_erosion(sil, iterations=-g)
    # hand corrections: `add` polygons and `lines` (thin parts such as whiskers: [{"w": width px, "pts": [[x, y], ...]}]) are
    # Pokémon; then the halo; then `cut` polygons (foil stars that touch the outline) are foil whatever the halo says
    def poly_mask(poly) -> np.ndarray:
        img = Image.new("L", (W, H), 0)
        ImageDraw.Draw(img).polygon([tuple(p) for p in poly], fill=255)
        return np.array(img) > 0

    for poly in hint.get("add", []):
        sil |= poly_mask(poly)
    for ln in hint.get("lines", []):
        img = Image.new("L", (W, H), 0)
        ImageDraw.Draw(img).line([tuple(p) for p in ln["pts"]], fill=255, width=int(ln.get("w", 3)), joint="curve")
        sil |= np.array(img) > 0
    # the halo: on most of these cards the white underlay runs ~6 px past the Pokémon's outline, a band printed in a lighter
    # "glow" colour (Mewtwo's maroon, Charizard's lilac, Zapdos's olive) that is matte on the real card (it reads the same in
    # scans and in lit photos, where the background around it flashes). Measured as a colour step 6-7 px out from the
    # segmented outline; cards without it (Chansey, Clefairy, Gyarados, Hitmonchan, Machamp, Magneton) keep 0.
    halo = float(hint.get("halo", 0))
    if halo > 0:
        sil |= ndi.distance_transform_edt(~sil) <= halo + 0.5
    # pin-holes the hints left inside the Pokémon (a speck between a drawn line and the outline) are matte too
    holes = ndi.binary_fill_holes(sil) & ~sil
    lab, n = ndi.label(holes)
    for i in range(1, n + 1):
        if (lab == i).sum() < 40:
            sil |= lab == i
    for poly in hint.get("cut", []):
        sil &= ~poly_mask(poly)
    return sil


def foil_alpha(sil: np.ndarray, win: tuple[int, int, int, int], scan_alpha: np.ndarray) -> np.ndarray:
    x0, y0, x1, y1 = win
    inwin = np.zeros((H, W), np.float32)
    # inset half a pixel from the measured line: the gold window line is matte
    inwin[y0:y1, x0:x1] = 1.0
    inwin = cv2.GaussianBlur(inwin, (0, 0), 0.6)
    bg = (~sil).astype(np.float32)
    bg = cv2.GaussianBlur(bg, (0, 0), 0.8)
    return np.clip(bg * inwin * scan_alpha, 0, 1)


def overlay(rgb: np.ndarray, a: np.ndarray, win) -> Image.Image:
    base = Image.fromarray(rgb).convert("RGB")
    tint = np.array(base).astype(np.float32)
    # foil area brightened and tinted cyan, Pokémon untouched; the edge drawn in red
    t = tint.copy()
    t = t * (1 - 0.45 * a[..., None]) + np.array([60, 255, 255]) * 0.45 * a[..., None]
    edge = (cv2.Canny((a * 255).astype(np.uint8), 60, 160) > 0)
    t[edge] = [255, 30, 30]
    x0, y0, x1, y1 = win
    return Image.fromarray(np.clip(t, 0, 255).astype(np.uint8)).crop((x0 - 6, y0 - 6, x1 + 6, y1 + 6))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--version", type=int, default=1)
    ap.add_argument("--write", action="store_true", help="write the masks into assets/foil/fam/wotc-base-set/")
    args = ap.parse_args()
    nums = [int(s) for s in args.only.split(",") if s] or list(range(1, 17))
    prev = Path(args.preview) if args.preview else None
    if prev:
        prev.mkdir(parents=True, exist_ok=True)
    sheet = []
    report = {}
    badge = badge_template()
    for n in nums:
        rgb, sa = scan(n)
        win = window(rgb)
        hint = HINTS.get(str(n), {})
        if "win" in hint:
            win = tuple(hint["win"])
        sil = clean(segment(rgb, win, hint), win, hint, rgb)
        if n in STAGE:
            sil |= place_badge(badge, win)
        a = foil_alpha(sil, win, sa)
        x0, y0, x1, y1 = win
        frac = float(a[y0:y1, x0:x1].mean())
        report[n] = {"win": win, "foil_share": round(frac, 3)}
        print(n, "window", win, "foil share of window", round(frac, 3))
        if args.write:
            OUT.mkdir(parents=True, exist_ok=True)
            out = OUT / f"{n}-bg-v{args.version}.webp"
            rgba = np.zeros((H, W, 4), np.uint8)
            rgba[..., :3] = 255
            rgba[..., 3] = np.round(a * 255).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(out, "WEBP", lossless=True, quality=100, method=6)
            print("  wrote", out.relative_to(ROOT), out.stat().st_size, "bytes")
        if prev:
            Image.fromarray(np.round(a * 255).astype(np.uint8), "L").save(prev / f"{n}-mask.png")
            ov = overlay(rgb, a, win)
            ov.save(prev / f"{n}-overlay.png")
            sheet.append((n, ov))
    if prev and sheet:
        cw, ch = sheet[0][1].size
        cols = 4
        rows = (len(sheet) + cols - 1) // cols
        S = Image.new("RGB", (cols * cw, rows * (ch + 14)), (20, 20, 20))
        d = ImageDraw.Draw(S)
        for k, (n, ov) in enumerate(sheet):
            x, y = (k % cols) * cw, (k // cols) * (ch + 14)
            S.paste(ov.resize((cw, ch)), (x, y + 14))
            d.text((x + 4, y + 1), str(n), fill=(255, 255, 255))
        S.save(prev / "sheet.png")
        print("sheet", prev / "sheet.png")
    if prev:
        json.dump(report, open(prev / "report.json", "w"), indent=1)


if __name__ == "__main__":
    main()
