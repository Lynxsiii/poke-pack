#!/usr/bin/env python3
"""Draw the per-card foil masks of the Gym Heroes and Gym Challenge holos (holo family wotc-gym):
assets/foil/fam/wotc-gym/<set>-<n>-bg-v1.webp and <set>-<n>-dots-v1.webp.

What the real cards do (photos in /mnt/project-files/holo-remaster/wotc-gym/refs/, SOURCES.md): the cosmos foil lies
under the whole art window, but only the BACKGROUND shows it. The Pokémon (or the Gym Leader, the badge outlines of a
Trainer, Charizard's flames, the evolution badge) is printed on a white underlay and stays matte. Under a lamp the
background flashes as a broad metallic sheen tinted by its ink (navy sky -> electric blue, brown -> copper, grey rock ->
silver) and its dots, discs and snowflake stars light up in one saturated colour each.

The scans are scans of the real foil cards, so the printed dots are in the scan. This script draws, per card:

  bg   = the art window (measured on the card: the strongest edge of the bevel, per side), minus the STAGE badge
         (the printed starburst and portrait box, a consensus of every Stage card of both sets, aligned per card),
         minus the figure. The figure is cut by GrabCut (OpenCV, seeded RNG) inside the window: seeded as background
         where the scan's cosmos dots are dense, as figure where there is no dot within ~12 px, steered by hand hints
         per card (make_gym_masks_hints.json, card pixels of the 600 x 838 scan: `fg`/`bg` dabs [x, y, r], `fgpoly`/
         `bgpoly` polygons and `keyed` colour keys (hue, saturation, value ranges, see keyed_mask) that seed GrabCut,
         `matte`/`foil` polygons that override its answer, `ell` the probable-figure ellipse, `edge_fg` the window
         sides the figure runs off, `window` [l, t, r, b] to override the measured window edges, `grabcut: false` to
         use the polygons alone, `streaks` on a card with bolts or webs of lightning, `nodots` polygons).
         Cleaned (small islands dropped, small dot-free holes filled, the figure's dark outline kept matte) and feathered
         about a pixel. 1x, alpha.
  dots = the cosmos dots of the scan inside bg, redrawn smooth: a top-hat of the brightest channel over a 13 px opening,
         relative to the local level; a small dot is redrawn as an anti-aliased round disc of the same area at its
         weighted centre, a larger piece (snowflake star, cross, rosette) keeps its own shape, upsampled smooth (cubic,
         then a narrow smoothstep: no pixel staircase). Plus a faint floor over bg (`--floor`). 2x, alpha.

Both files cover the same box of the card (BOX: every window of both layouts fits it), so one mask-size and
mask-position place them (css/holo/fam/wotc-gym.css). White RGB, the mask in alpha.

    python3 .claude/skills/card-textures/scripts/fam/wotc-gym/make_gym_masks.py [--only gym2-2,gym1-14] [--preview DIR] [--no-save]

New files only: an existing file is kept unless `--overwrite` is given (allowed until the family ships; after that a
change goes to a new `--suffix -v2`).
"""
from __future__ import annotations

import argparse
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

cv2.setNumThreads(1)
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-gym"
W, H = 600, 838
# the box every mask covers (card pixels, x0 y0 x1 y1): all Pokémon and Trainer windows of both sets fit inside
BOX = (46, 84, 564, 478)
DOTS_SCALE = 2
SETS = ("gym1", "gym2")
# search ranges for the window edges (card pixels): the edge index k is the boundary between pixel k and k + 1
RANGES = {
    "pokemon": {"top": (84, 100), "bottom": (355, 436), "left": (55, 70), "right": (530, 545)},
    "trainer": {"top": (180, 198), "bottom": (460, 475), "left": (46, 60), "right": (548, 562)},
}
# the STAGE badge region used to build and align its consensus (card pixels)
BADGE_REGION = (30, 50, 230, 200)

HINTS: dict[str, dict] = json.load(open(HERE / "make_gym_masks_hints.json"))


def cards() -> list[dict]:
    out = []
    for s in SETS:
        for c in json.load(open(ROOT / "data" / f"{s}.json")):
            if c.get("rarity") == "Rare Holo":
                out.append(c)
    return out


def is_stage(c: dict) -> bool:
    return any("Stage" in x for x in (c.get("subtypes") or []))


def layout(c: dict) -> str:
    return "trainer" if c.get("supertype") == "Trainer" else "pokemon"


def load_rgb(c: dict) -> np.ndarray:
    s, n = c["id"].split("-")
    im = Image.open(ROOT / "assets" / "cards" / s / f"{n}.webp").convert("RGBA")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    grey = Image.new("RGBA", im.size, (128, 128, 128, 255))
    return np.asarray(Image.alpha_composite(grey, im).convert("RGB")).astype(np.float32)


# ---- the window ---------------------------------------------------------------------------------------------------

def measure_window(rgb: np.ndarray, lay: str) -> dict:
    """The art window's edges: per side, the row or column of the strongest mean luminance step in its search range,
    averaged over the middle of the opposite side (so the badge and the corners do not vote)."""
    L = rgb.mean(2)
    R = RANGES[lay]
    gy = np.abs(np.diff(L[:, 150:450], axis=0)).mean(1)
    y_lo = R["top"][1] + 40
    y_hi = R["bottom"][0] - 10 if lay == "trainer" else 340
    gx = np.abs(np.diff(L[y_lo:y_hi, :], axis=1)).mean(0)
    box = {}
    for side, g in (("top", gy), ("bottom", gy), ("left", gx), ("right", gx)):
        lo, hi = R[side]
        box[side] = lo + int(np.argmax(g[lo:hi + 1]))
    return box


def window_mask(box: dict, inset: float = 1.0) -> np.ndarray:
    """Soft box: art pixels are rows top+1 .. bottom and columns left+1 .. right; `inset` px more are left out (the
    bevel's inner highlight), with a one-pixel ramp."""
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    t, b, l, r = box["top"] + 1 + inset, box["bottom"] - inset, box["left"] + 1 + inset, box["right"] - inset
    fy = np.clip(np.minimum(yy - t + 1, b - yy + 1), 0, 1)
    fx = np.clip(np.minimum(xx - l + 1, r - xx + 1), 0, 1)
    return fy * fx


_BADGE = None


def badge_template(all_cards: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Consensus of the STAGE badge over every Stage Pokémon of both sets (holo or not): the per-pixel median, its
    median absolute deviation, and the badge shape (the low-deviation region joined to the starburst, holes filled:
    the portrait inside the box differs per card)."""
    global _BADGE
    if _BADGE is not None:
        return _BADGE
    x0, y0, x1, y1 = BADGE_REGION
    stack = []
    for s in SETS:
        for c in json.load(open(ROOT / "data" / f"{s}.json")):
            if c.get("supertype") == "Pokémon" and is_stage(c):
                stack.append(load_rgb(c)[y0:y1, x0:x1])
    S = np.stack(stack)
    med = np.median(S, 0)
    mad = np.median(np.abs(S - med), 0).mean(-1)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    low = (mad < 22) & (xx <= 170) & (yy <= 172)
    low = ndi.binary_opening(low, np.ones((2, 2)))
    lab, _ = ndi.label(low)
    seed = lab[127 - y0, 80 - x0]  # a pixel of the starburst's lower body
    shape = ndi.binary_fill_holes(lab == seed)
    _BADGE = (med, mad, shape)
    return _BADGE


def badge_mask(rgb: np.ndarray, all_cards: list[dict]) -> tuple[np.ndarray, tuple[int, int]]:
    """The STAGE badge of this card at 600 x 838 (0..1, grown 1.5 px and feathered), aligned by the shift that best
    matches the consensus over its stable pixels."""
    med, mad, shape = badge_template(all_cards)
    x0, y0, x1, y1 = BADGE_REGION
    ref = shape & (mad < 14)
    best = None
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            crop = rgb[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
            e = np.abs(crop - med).mean(-1)[ref].mean()
            if best is None or e < best[0]:
                best = (e, dx, dy)
    _, dx, dy = best
    full = np.zeros((H, W), np.float32)
    full[y0 + dy:y1 + dy, x0 + dx:x1 + dx] = shape
    grown = ndi.distance_transform_edt(full < 0.5)
    return np.clip(2.5 - grown, 0, 1), (dx, dy)


# ---- the dots -----------------------------------------------------------------------------------------------------

def disk(r: int) -> np.ndarray:
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y <= r * r + 0.5).astype(np.uint8)


def tophat_response(rgb: np.ndarray, r: int) -> np.ndarray:
    """How far each pixel's brightest channel stands above the local floor (an opening by a disc of radius r), relative
    to that floor (a dot on dark sky counts at a smaller step than one on pale ink), mapped to 0..1: 0 at 0.5x the
    floor's scale, 1 at 1.5x. Strict enough that the soft halos of neighbouring dots do not merge them."""
    mx = rgb.max(2)
    op = cv2.morphologyEx(mx, cv2.MORPH_OPEN, disk(r))
    th = np.clip(mx - op, 0, None)
    rel = th / (op * 0.35 + 28.0)
    return np.clip((rel - 0.5) / 1.0, 0, 1)


def dot_response(rgb: np.ndarray) -> np.ndarray:
    """The small dots' response (13 px opening): used to keep dot-free holes of a figure matte."""
    return tophat_response(rgb, 6)


def _shape_stats(lab: np.ndarray, n: int):
    idx = np.arange(1, n + 1)
    h, w = lab.shape
    gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
    my, mx_ = ndi.mean(gy, lab, idx), ndi.mean(gx, lab, idx)
    syy = ndi.mean(gy * gy, lab, idx) - my * my
    sxx = ndi.mean(gx * gx, lab, idx) - mx_ * mx_
    sxy = ndi.mean(gx * gy, lab, idx) - mx_ * my
    tr, det = sxx + syy, sxx * syy - sxy * sxy
    dd = np.sqrt(np.maximum(tr * tr / 4 - det, 0))
    elong = np.sqrt((tr / 2 + dd) / np.maximum(tr / 2 - dd, 0.08))
    area = ndi.sum(lab > 0, lab, idx)
    return area, elong, ndi.find_objects(lab)


def small_dots(resp: np.ndarray, allowed: np.ndarray) -> np.ndarray:
    """Pinpoints, dots, crosses and snowflake stars: pieces of the small response over 0.25 (4-connected), at most 14 px
    across, round enough (elongation under 2.5 once wider than 5 px) and not branching (filling a third of their box
    once wider than 8 px). A bigger piece is split at 0.5 and then 0.75 and its parts judged again (touching dots).
    Bolts, aura rims and pale streaks fail and are left to the broad flash."""
    keep = np.zeros(resp.shape, bool)
    todo = (resp > 0.25) & allowed
    for level in (0.5, 0.75, None):
        nxt = np.zeros(resp.shape, bool)
        lab, n = ndi.label(todo)
        if not n:
            break
        area, elong, objs = _shape_stats(lab, n)
        for i, sl in enumerate(objs):
            hh = sl[0].stop - sl[0].start
            ww = sl[1].stop - sl[1].start
            ext = max(hh, ww)
            piece = lab[sl] == i + 1
            if ext > 14:
                if level is not None:
                    nxt[sl] |= piece & (resp[sl] > level)
                continue
            if (ext > 5 and elong[i] > 2.5) or (ext > 8 and area[i] < hh * ww / 3):
                continue
            keep[sl] |= piece
        todo = nxt
    return keep


def big_discs(resp: np.ndarray, allowed: np.ndarray) -> np.ndarray:
    """The big soft discs ("planets") and rosettes: the large response (29 px opening) over 0.25, opened by a 9 px
    disc (which drops the pinpoints and the bridges between neighbours); kept when 10-44 px across, round (elongation
    under 1.8) and filled (over 45 % of its box)."""
    m = ndi.binary_opening((resp > 0.25) & allowed, structure=disk(4).astype(bool))
    lab, n = ndi.label(m)
    keep = np.zeros(resp.shape, bool)
    if not n:
        return keep
    area, elong, objs = _shape_stats(lab, n)
    for i, sl in enumerate(objs):
        hh = sl[0].stop - sl[0].start
        ww = sl[1].stop - sl[1].start
        ext = max(hh, ww)
        if 10 <= ext <= 44 and elong[i] < 1.8 and area[i] > 0.45 * hh * ww:
            keep[sl] |= lab[sl] == i + 1
    return keep


def streaks(rb: np.ndarray) -> np.ndarray:
    """Bolts, webs of lightning and electric auras (the `streaks` hint, cards that print them): bright structures of
    the large response over 150 px that are thin (filling under 35 % of their box), long (elongation over 2.5) or wide
    (over 50 px), and solid (an opening by a 5 px disc keeps half of them), grown 2 px. Foil under light ink: they
    flash with the background but carry no dots."""
    B = rb > 0.25
    lab, n = ndi.label(B, np.ones((3, 3)))
    out = np.zeros(B.shape, bool)
    if not n:
        return out
    area, elong, objs = _shape_stats(lab, n)
    for i, sl in enumerate(objs):
        hh = sl[0].stop - sl[0].start
        ww = sl[1].stop - sl[1].start
        piece = lab[sl] == i + 1
        solid = ndi.binary_opening(piece, structure=disk(2).astype(bool)).sum() / max(area[i], 1)
        if area[i] > 150 and (area[i] < 0.35 * hh * ww or elong[i] > 2.5 or max(hh, ww) > 50) and solid > 0.5:
            out[sl] |= piece
    return ndi.binary_dilation(out, iterations=2)


def dots_map(rgb: np.ndarray, bg: np.ndarray, floor: float, nodots: np.ndarray | None = None,
             skip_streaks: bool = False) -> np.ndarray:
    """The dots inside bg at DOTS_SCALE x the BOX crop, drawn smooth from the scan's own response (cubic upsampling,
    then a soft threshold: round edges, no pixel staircase), at the dot's own brightness; plus `floor` over bg.
    Dots within 3 px of the figure are left out (the bright rim of an aura hugs the outline), and so is a hint's
    `nodots` area (a bolt, a web of lightning: foil, but flashing as plain metal)."""
    x0, y0, x1, y1 = BOX
    k = DOTS_SCALE
    allowed = ndi.binary_erosion(bg > 0.5, iterations=3)
    if nodots is not None:
        allowed &= ~nodots
    rs = tophat_response(rgb, 6)
    rb = tophat_response(rgb, 14)
    if skip_streaks:
        allowed &= ~streaks(rb)
    ks = small_dots(rs, allowed)
    kb = big_discs(rb, allowed)
    # each kept piece with a 2 px soft rim of its own response, so the edge falls off as the scan's dot does
    rim_s = ndi.binary_dilation(ks, iterations=2) & allowed
    rim_b = ndi.binary_dilation(kb, iterations=2) & allowed
    fs = np.where(ks, rs, np.where(rim_s, rs * 0.7, 0))
    fb = np.where(kb, rb, np.where(rim_b, rb * 0.6, 0)) * 0.8
    field = np.maximum(fs, fb)[y0:y1, x0:x1]
    h, w = field.shape
    up = cv2.resize(field, (w * k, h * k), interpolation=cv2.INTER_CUBIC)
    a = np.clip((up - 0.10) / 0.40, 0, 1)
    a = a * a * (3 - 2 * a)
    bg2 = cv2.resize(bg[y0:y1, x0:x1], (w * k, h * k), interpolation=cv2.INTER_LINEAR)
    return np.maximum(a * bg2, floor * bg2)


# ---- the figure ---------------------------------------------------------------------------------------------------

def poly_mask(polys: list, shape=(H, W)) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for poly in polys:
        pts = np.array(poly, np.int32)
        cv2.fillPoly(m, [pts], 1)
    return m.astype(bool)


def dab_mask(dabs: list, shape=(H, W)) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for x, y, r in dabs:
        cv2.circle(m, (int(x), int(y)), int(r), 1, -1)
    return m.astype(bool)


def keyed_mask(smooth: np.ndarray, rule: dict) -> np.ndarray:
    """A colour key on the median-smoothed scan: `h` [lo, hi] hue in degrees (lo > hi wraps through red), `s` and `v`
    [lo, hi] in 0..1, optionally inside `poly` (a polygon or a list of polygons) and eroded by `erode` px."""
    hsv = cv2.cvtColor(smooth, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, sat, val = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
    m = np.ones(h.shape, bool)
    if "h" in rule:
        lo, hi = rule["h"]
        m &= ((h >= lo) & (h <= hi)) if lo <= hi else ((h >= lo) | (h <= hi))
    if "s" in rule:
        m &= (sat >= rule["s"][0]) & (sat <= rule["s"][1])
    if "v" in rule:
        m &= (val >= rule["v"][0]) & (val <= rule["v"][1])
    if "poly" in rule:
        polys = rule["poly"] if isinstance(rule["poly"][0][0], (list, tuple)) else [rule["poly"]]
        m &= poly_mask(polys)
    if rule.get("erode"):
        m = ndi.binary_erosion(m, iterations=int(rule["erode"]))
    return m


def segment(rgb: np.ndarray, win: np.ndarray, resp: np.ndarray, hint: dict, lay: str) -> np.ndarray:
    """The matte figure inside the window (bool, 600 x 838). GrabCut runs on a 7 px median of the scan, which wipes the
    cosmos dots out of the background so the sky is one colour family; seeds: the window's edge band is background
    (except the sides in `edge_fg`, where the figure runs off the window), an ellipse (`ell` [cx, cy, rx, ry], default
    the window's middle) is probably figure, a Trainer's gold badge outline is figure, plus the hand hints."""
    inside = win > 0.5
    fgp = poly_mask(hint.get("fgpoly", [])) | dab_mask(hint.get("fg", []))
    bgp = poly_mask(hint.get("bgpoly", [])) | dab_mask(hint.get("bg", []))
    if hint.get("grabcut", True):
        ys, xs = np.where(inside)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        sl = (slice(y0, y1), slice(x0, x1))
        smooth = cv2.medianBlur(np.clip(rgb, 0, 255).astype(np.uint8), int(hint.get("median", 7)))
        crop = np.ascontiguousarray(smooth[sl])
        m = np.full(crop.shape[:2], cv2.GC_PR_BGD, np.uint8)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        cx, cy, rx, ry = hint.get("ell", [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.28, (y1 - y0) * 0.36])
        m[((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 < 1] = cv2.GC_PR_FGD
        band = int(hint.get("band", 5))
        edge_fg = set(hint.get("edge_fg", []))
        for side, sel in (("top", yy < y0 + band), ("bottom", yy >= y1 - band),
                          ("left", xx < x0 + band), ("right", xx >= x1 - band)):
            if side not in edge_fg:
                m[sel] = cv2.GC_BGD
        if lay == "trainer" and hint.get("gold_matte", True):
            R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
            gold = (R > 170) & (G > 140) & (B < 120) & (R - B > 90)
            gold = ndi.binary_opening(gold, np.ones((2, 2)))
            m[gold[sl]] = cv2.GC_FGD
        for rule in hint.get("keyed", []):
            km = keyed_mask(smooth, rule)
            m[km[sl]] = cv2.GC_FGD if rule.get("to", "fg") == "fg" else cv2.GC_BGD
        m[fgp[sl]] = cv2.GC_FGD
        m[bgp[sl]] = cv2.GC_BGD
        m[~inside[sl]] = cv2.GC_BGD
        bgm = np.zeros((1, 65))
        fgm = np.zeros((1, 65))
        cv2.setRNGSeed(7)
        cv2.grabCut(crop, m, None, bgm, fgm, int(hint.get("iters", 6)), cv2.GC_INIT_WITH_MASK)
        fig = np.zeros((H, W), bool)
        fig[sl] = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    else:
        fig = fgp.copy()
    dots = (resp > 0.25) & inside
    fig &= inside
    # clean: drop small islands, fill small dot-free holes, close hairline gaps
    fig = ndi.binary_opening(fig, iterations=1)
    lab, n = ndi.label(fig)
    if n:
        sizes = ndi.sum(fig, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= hint.get("min_island", 120)]
        fig = np.isin(lab, keep)
    fig = ndi.binary_closing(fig, structure=np.ones((3, 3)), iterations=2) & inside
    holes = ndi.binary_fill_holes(fig) & ~fig
    lab, n = ndi.label(holes)
    for i in range(1, n + 1):
        h = lab == i
        if h.sum() < hint.get("max_hole", 400) and dots[h].sum() <= 2:
            fig |= h
    # overrides
    fig |= poly_mask(hint.get("matte", [])) & inside
    fig &= ~poly_mask(hint.get("foil", []))
    return fig


def draw(c: dict, all_cards: list[dict], floor: float) -> dict:
    cid = c["id"]
    hint = HINTS.get(cid, {})
    lay = layout(c)
    rgb = load_rgb(c)
    box = measure_window(rgb, lay)
    if "window" in hint:
        l, t, r, b = hint["window"]
        box = {"left": l, "top": t, "right": r, "bottom": b}
    win = window_mask(box, inset=hint.get("inset", 1.0))
    shift = None
    if lay == "pokemon" and is_stage(c):
        bm, shift = badge_mask(rgb, all_cards)
        win = win * (1 - bm)
    resp = dot_response(rgb)
    fig = segment(rgb, win, resp, hint, lay)
    # the figure's own dark outline stays matte: grow the figure a pixel, then feather the background edge
    figd = ndi.binary_dilation(fig, iterations=hint.get("grow", 1))
    soft = ndi.gaussian_filter(figd.astype(np.float32), 0.7)
    bg = np.clip(win * (1 - np.clip(soft * 1.4, 0, 1)), 0, 1)
    dots = dots_map(rgb, bg, floor, poly_mask(hint.get("nodots", [])) if hint.get("nodots") else None,
                    bool(hint.get("streaks")))
    return {"id": cid, "box": box, "shift": shift, "bg": bg, "dots": dots, "fig": fig, "rgb": rgb, "win": win}


def save_alpha(a: np.ndarray, path: Path, overwrite: bool) -> int | None:
    if path.exists() and not overwrite:
        return None
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, method=6, exact=False)
    return path.stat().st_size


def preview_tile(res: dict, zoom: int = 1, grid: bool = False, stack: bool = False) -> Image.Image:
    """scan | figure tinted red, background clear, dots cyan (the BOX crop). `grid` draws card-pixel ticks every 50 px
    (labels at every 100), to read hint coordinates off."""
    x0, y0, x1, y1 = BOX
    rgb = res["rgb"][y0:y1, x0:x1]
    bg = res["bg"][y0:y1, x0:x1]
    win = res["win"][y0:y1, x0:x1]
    dots = cv2.resize(res["dots"], (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    ov = rgb * (0.45 + 0.55 * bg[..., None])
    matte = (win > 0.5) & (bg < 0.5)
    ov[matte] = ov[matte] * 0.55 + np.array([255, 40, 40]) * 0.45
    ov[win < 0.5] *= 0.25
    dd = np.clip((dots - 0.2) / 0.8, 0, 1)[..., None] * 0.8
    ov = ov * (1 - dd) + np.array([0, 255, 255]) * dd
    a = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    b = Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8))
    if zoom != 1:
        a = a.resize((a.width * zoom, a.height * zoom), Image.NEAREST)
        b = b.resize((b.width * zoom, b.height * zoom), Image.NEAREST)
    if grid:
        for im in (a, b):
            d = ImageDraw.Draw(im)
            for gx in range((x0 // 50 + 1) * 50, x1, 50):
                X = (gx - x0) * zoom
                d.line([(X, 0), (X, im.height)], fill=(255, 255, 0) if gx % 100 == 0 else (150, 150, 0), width=1)
                d.text((X + 2, 2), str(gx), fill=(255, 255, 0))
            for gy in range((y0 // 50 + 1) * 50, y1, 50):
                Y = (gy - y0) * zoom
                d.line([(0, Y), (im.width, Y)], fill=(255, 255, 0) if gy % 100 == 0 else (150, 150, 0), width=1)
                d.text((2, Y + 2), str(gy), fill=(255, 255, 0))
    if stack:
        t = Image.new("RGB", (a.width, a.height * 2 + 24), (20, 20, 20))
        t.paste(a, (0, 18))
        t.paste(b, (0, a.height + 24))
    else:
        t = Image.new("RGB", (a.width * 2 + 6, a.height + 18), (20, 20, 20))
        t.paste(a, (0, 18))
        t.paste(b, (a.width + 6, 18))
    d = ImageDraw.Draw(t)
    d.text((4, 3), f"{res['id']}  window {res['box']}  badge shift {res['shift']}", fill=(255, 255, 0))
    return t


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--floor", type=float, default=0.10)
    ap.add_argument("--no-save", action="store_true")
    ap.add_argument("--overwrite", action="store_true", help="rewrite this family's own unshipped files")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    allc = cards()
    todo = [c for c in allc if not only or c["id"] in only]
    badge_template(allc)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    prev = Path(a.preview) if a.preview else None
    if prev:
        prev.mkdir(parents=True, exist_ok=True)
    tiles = []
    total = 0
    for c in todo:
        res = draw(c, allc, a.floor)
        s, n = res["id"].split("-")
        x0, y0, x1, y1 = BOX
        notes = []
        if not a.no_save:
            for kind, arr in (("bg", res["bg"][y0:y1, x0:x1]), ("dots", res["dots"])):
                size = save_alpha(arr, out / f"{s}-{n}-{kind}{a.suffix}.webp", a.overwrite)
                notes.append(f"{kind} {'kept' if size is None else size}")
                total += size or 0
        bgf = float(res["bg"][res["win"] > 0.5].mean())
        print(f"{res['id']:8s} window {res['box']} shift {res['shift']} bg {bgf:.2f} {' '.join(notes)}", flush=True)
        if prev:
            t = preview_tile(res)
            tiles.append(t)
            preview_tile(res, zoom=2, grid=True, stack=True).save(prev / f"{res['id']}.png")
    if prev and tiles:
        per = 4
        for i in range(0, len(tiles), per):
            group = tiles[i:i + per]
            sheet = Image.new("RGB", (max(t.width for t in group), sum(t.height for t in group)), (0, 0, 0))
            y = 0
            for t in group:
                sheet.paste(t, (0, y))
                y += t.height
            sheet.save(prev / f"sheet-{i // per:02d}.png")
    print(f"total {total} bytes", file=sys.stderr)


if __name__ == "__main__":
    main()
