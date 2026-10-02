#!/usr/bin/env python3
"""Draw the dp-sp family's per-card foil maps: Platinum-era SP Rare Holos that are not LV.X (Pokemon G, GL, FB, C).

What the real card does (photos and video frames: /mnt/project-files/holo-remaster/dp-sp/refs/SOURCES.md): the cosmos
holofoil of an SP Rare Holo shows in the art window's BACKGROUND only. The Pokemon is printed over white and stays matte,
so does the trainer portrait in its medallion (bottom right, the head often breaking into the window), the printed SP
logo (its "S" crosses the window's bottom-left corner), the frame and the "X's Pokemon" strip. The scans carry the
frozen cosmos (dots that caught the scanner's light) in the background only, never on the Pokemon.

Output, one file per card: assets/foil/fam/dp-sp/<card id>.webp, 600 x 838 (the scan's size, stretched 100% x 100%),
RGBA, lossless:
  alpha = where the foil is: the DP basic art window (assets/foil/dp-win/dp-basic.webp) minus the SP logo and the
          medallion ring (the pixels the 80-odd SP basic scans share, per-pixel deviation under STD_FRAME), minus the
          medallion disc, minus the Pokemon and the portrait head (GrabCut inside the window, steered by the scribbles in
          make_sp_maps_hints.json), shrunk 1 px off the Pokemon's ink outline and feathered.
  RGB   = grey, the cosmos dots a layer lights through `mask-mode: luminance`: every bright blob of the scan inside the
          foil (multi-scale determinant of Hessian, local maxima, drawn back as soft round dots of the blob's size and
          strength), plus a seeded synthetic cosmos of the same size statistics at SYNTH_GAIN where the scan shows few
          dots (dark backgrounds: Weavile G, Dialga G), so every card sparkles.

Re-cut options (hints file, per card; absent = the card's map is exactly what it was, so live maps stay reproducible):
  "erode": [[x0, y0, x1, y1, px], ...]  foil shrunk by px inside the box (a pale outline round the Pokemon, an aura)
  "card":  "pl2-9"  a hints key that names another card (a `-vN` re-cut of a live map: the live file stays, the new one is
           written under the key's own name; same scan, same scribbles, same dots, because the seed follows `card`)
  "pale":  {"l0", "l1", "floor", "sigma", "core"}  a pale or grey sky washes flat under the colour-dodge sweep (review #1:
           Lucario GL, Regigigas FB, Blaziken FB, Staraptor FB), so the alpha is cut where the sky is pale: 1 where the
           blurred scan luminance is under l0, `floor` where it is over l1, smooth between; the dots stay full alpha (a
           dot core of `core` strength or more), so a pale sky shows coloured sparkles, not a flat wash.

Inputs: the scans (data/*.json `image`), dp-basic.webp, the hints file. Deterministic (SEED).

    python3 make_sp_maps.py [--ids pl2-9,pl3-8] [--preview DIR] [--out DIR] [--stats]

--preview writes <id>-check.png per card (left: the scan; middle: matte areas tinted red, the foil edge in yellow;
right: the speck channel) and contact.jpg; --stats prints the foil share and speck counts.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "dp-sp"
HINTS = json.load(open(Path(__file__).with_name("make_sp_maps_hints.json")))
W, H = 600, 838
SEED = 20261001
STD_FRAME = 16.0  # per-pixel luminance deviation over the SP basic scans under which a pixel is printed frame
MEDALLION = (519.0, 401.0, 62.0, 71.0)  # centre x, y and radii of the portrait disc (dp-basic-sp.webp's cut, 838 px high)
LOGO_BOX = (30, 340, 150, 430)  # where the SP logo's "S" can cross into the window
RING_BOX = (440, 320, 580, 430)  # where the medallion ring can cross into the window
SIGMAS = (0.9, 1.3, 1.8, 2.5, 3.5, 4.8)  # blob scales (px); a dot of radius r peaks near sigma = r / 1.4
DOH_MIN = 0.0016  # scale-normalised DoH (luminance 0..1) below which a maximum is noise (JPEG blocks, paper grain)
EDGE_RATIO = 3.0  # a blob's larger curvature at most this many times its smaller one (rejects lines and rims)
SYNTH_GAIN = (0.3, 0.7)  # synthetic dots' peak strength range (scan dots run 0.25..1)
SYNTH_RMAX = 3.0  # synthetic dot radius cap (px); the big scan blobs are often art, not cosmos
FULL_DENSITY = 0.005  # scan dots per px^2 of a dot-rich scan (Luxray GL 0.004, Staraptor FB 0.006): no synthetic dots there


def load_cards() -> dict[str, dict]:
    cards = {}
    for f in sorted((ROOT / "data").glob("*.json")):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        for c in d if isinstance(d, list) else d.get("cards", []):
            if isinstance(c, dict) and c.get("id"):
                cards[c["id"]] = c
    return cards


def load_scan(card: dict) -> np.ndarray:
    im = Image.open(ROOT / card["image"]).convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    return np.asarray(im)


def window_mask() -> np.ndarray:
    """The DP basic art window (600 x 825 alpha) stretched to the scan's 838 rows, as 0..1."""
    a = Image.open(ROOT / "assets/foil/dp-win/dp-basic.webp").getchannel("A").resize((W, H), Image.BILINEAR)
    return np.asarray(a, dtype=np.float32) / 255.0


def frame_constant(cards: dict[str, dict]) -> np.ndarray:
    """Pixels every SP basic scan prints alike (SP logo, medallion ring): per-pixel std of luminance over all of them."""
    sp = [c for c in cards.values()
          if "SP" in (c.get("subtypes") or []) and "LV.X" not in (c.get("subtypes") or [])
          and "Basic" in (c.get("subtypes") or []) and str(c.get("id", "")).startswith(("pl1-", "pl2-", "pl3-", "pl4-"))
          and (ROOT / c.get("image", "")).is_file()]
    acc = np.zeros((H, W), np.float64)
    acc2 = np.zeros((H, W), np.float64)
    for c in sp:
        y = cv2.cvtColor(load_scan(c), cv2.COLOR_RGB2GRAY).astype(np.float64)
        acc += y
        acc2 += y * y
    n = max(1, len(sp))
    std = np.sqrt(np.maximum(acc2 / n - (acc / n) ** 2, 0))
    print(f"frame consensus over {len(sp)} SP basic scans")
    return ndi.median_filter(std, 3)


def stroke_mask(strokes: list, shape=(H, W)) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for s in strokes:
        r = int(s[0])
        pts = [(int(s[i]), int(s[i + 1])) for i in range(1, len(s), 2)]
        for p in pts:
            cv2.circle(m, p, r, 1, -1, lineType=cv2.LINE_8)
        for p, q in zip(pts, pts[1:]):
            cv2.line(m, p, q, 1, 2 * r, lineType=cv2.LINE_8)
    return m.astype(bool)


def ellipse(cx, cy, rx, ry) -> np.ndarray:
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0


def foil_area(rgb: np.ndarray, win: np.ndarray, const: np.ndarray, hint: dict) -> np.ndarray:
    """Binary foil area: the window's background. GrabCut, foil = foreground, matte (Pokemon, portrait) = background."""
    inside = win > 0.5
    disc = ellipse(*MEDALLION)
    matte_s = stroke_mask(hint.get("matte", [])) & inside
    foil_s = stroke_mask(hint.get("foil", [])) & inside & ~const & ~disc
    # Colours GrabCut learns from: the window only. Frame and logo pixels take their nearest window colour, so the
    # white frame never enters either model.
    learn = inside & ~const
    _, (iy, ix) = ndi.distance_transform_edt(~learn, return_indices=True)
    img = rgb[iy, ix]
    img = cv2.bilateralFilter(np.ascontiguousarray(img), 5, 18, 3)
    mask = np.full((H, W), cv2.GC_PR_FGD, np.uint8)
    mask[disc & inside] = cv2.GC_BGD
    mask[matte_s] = cv2.GC_BGD
    mask[foil_s] = cv2.GC_FGD
    ys, xs = np.nonzero(inside)
    x0, x1, y0, y1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
    sub = np.ascontiguousarray(mask[y0:y1, x0:x1])
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.setRNGSeed(SEED)
    cv2.grabCut(np.ascontiguousarray(img[y0:y1, x0:x1]), sub, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    mask[y0:y1, x0:x1] = sub
    foil = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)) & inside & ~const & ~disc
    # clean: drop foil crumbs, fill matte pinholes (cosmos dots read as "different" by the colour model)
    lab, n = ndi.label(foil)
    if n:
        sizes = ndi.sum(foil, lab, np.arange(1, n + 1))
        foil = np.isin(lab, 1 + np.nonzero(sizes >= 60)[0])
    holes = inside & ~foil & ~const & ~disc & ~matte_s
    lab, n = ndi.label(holes)
    if n:
        sizes = ndi.sum(holes, lab, np.arange(1, n + 1))
        foil |= np.isin(lab, 1 + np.nonzero(sizes < 45)[0])
    foil = ndi.binary_opening(foil, iterations=1)
    # every foil region holds a foil scribble (a pocket of "background" colour inside the Pokemon is ink: matte) ...
    eight = np.ones((3, 3), bool)
    lab, n = ndi.label(foil, structure=eight)
    keep = np.unique(lab[foil_s & foil])
    foil = np.isin(lab, keep[keep > 0])
    # ... and every matte region touches a matte scribble, the portrait disc or the printed frame (a cosmos disc the
    # colour model took for the Pokemon is foil)
    matte = inside & ~foil
    lab, n = ndi.label(matte, structure=eight)
    keep = np.unique(lab[(matte_s | disc | const) & matte])
    foil |= matte & ~np.isin(lab, keep[keep > 0])
    foil = foil & ~const & ~disc
    for x0, y0, x1, y1, px in hint.get("erode", []):
        box = np.zeros((H, W), bool)
        box[y0:y1, x0:x1] = True
        foil = np.where(box, ndi.binary_erosion(foil, iterations=int(px)), foil)
    return foil


def doh_blobs(lum: np.ndarray, area: np.ndarray):
    """Bright round blobs: local maxima of the scale-normalised determinant of Hessian over SIGMAS, inside `area`.
    Elongated maxima (a bead on a lightning bolt or an ink rim: curvature ratio over EDGE_RATIO) are dropped.
    Returns arrays x, y, sigma, strength (DoH)."""
    stack, ratio = [], []
    for s in SIGMAS:
        hxx = ndi.gaussian_filter(lum, s, order=(0, 2))
        hyy = ndi.gaussian_filter(lum, s, order=(2, 0))
        hxy = ndi.gaussian_filter(lum, s, order=(1, 1))
        det = hxx * hyy - hxy * hxy
        tr = hxx + hyy
        bright = (tr < 0) & (det > 0)  # both curvatures negative
        stack.append(np.where(bright, (s ** 4) * det, 0))
        ratio.append(np.where(bright, tr * tr / np.maximum(det, 1e-12), np.inf))
    st = np.stack(stack)
    mx = ndi.maximum_filter(st, size=(3, 5, 5), mode="nearest")
    lim = (EDGE_RATIO + 1) ** 2 / EDGE_RATIO
    peaks = (st == mx) & (st > DOH_MIN) & area[None] & (np.stack(ratio) < lim)
    k, y, x = np.nonzero(peaks)
    return x, y, np.asarray(SIGMAS)[k], st[k, y, x]


def draw_dots(x, y, r, v, shape=(H, W), ss=4) -> np.ndarray:
    """Soft round dots (supersampled ss x, then box-reduced): radius r px, peak v (0..1)."""
    big = np.zeros((shape[0] * ss, shape[1] * ss), np.float32)
    for xi, yi, ri, vi in zip(x, y, r, v):
        cv2.circle(big, (int(round((xi + 0.5) * ss)), int(round((yi + 0.5) * ss))), max(1, int(round(ri * ss))),
                   float(vi), -1, lineType=cv2.LINE_AA)
    small = cv2.resize(big, (shape[1], shape[0]), interpolation=cv2.INTER_AREA)
    return cv2.GaussianBlur(small, (0, 0), 0.45)


def synth_cosmos(rng: np.random.Generator, radii: np.ndarray, density: float) -> tuple:
    """A cosmos field over the whole card: dots placed by a jittered grid (no clumps, no visible grid: jitter is the full
    cell), sizes drawn from the measured scan dots (capped at SYNTH_RMAX)."""
    cell = 1.0 / np.sqrt(max(density, 1e-5))
    gx, gy = np.meshgrid(np.arange(0, W, cell), np.arange(0, H, cell))
    x = (gx + rng.random(gx.shape) * cell).ravel()
    y = (gy + rng.random(gy.shape) * cell).ravel()
    keep = (x < W - 0.5) & (y < H - 0.5)
    x, y = x[keep], y[keep]
    r = np.minimum(rng.choice(radii, size=x.size) * rng.uniform(0.85, 1.15, size=x.size), SYNTH_RMAX)
    v = rng.uniform(*SYNTH_GAIN, size=x.size)
    return x, y, r, v


def pale_sky(lum: np.ndarray, foil: np.ndarray, alpha: np.ndarray, dots: np.ndarray, cfg: dict) -> np.ndarray:
    """Alpha for a pale or grey sky: the colour-dodge sweep multiplies the base, so over a bright sky it lands on one flat
    hue. Cut the alpha where the sky (scan luminance blurred over the foil area only, matte pixels do not count) is bright;
    keep the dots at full alpha, so the pale part shows coloured sparkles."""
    f = foil.astype(np.float32)
    s = float(cfg.get("sigma", 9))
    lb = cv2.GaussianBlur(lum * f, (0, 0), s) / np.maximum(cv2.GaussianBlur(f, (0, 0), s), 1e-3)
    l0, l1, floor = float(cfg["l0"]), float(cfg["l1"]), float(cfg["floor"])
    t = np.clip((lb - l0) / (l1 - l0), 0, 1)
    atten = 1.0 - (t * t * (3 - 2 * t)) * (1.0 - floor)
    core = np.clip(dots / float(cfg.get("core", 0.35)), 0, 1) ** 0.7
    return np.clip(alpha * np.maximum(atten, core), 0, 1)


def build(cid: str, card: dict, win: np.ndarray, const: np.ndarray, rng: np.random.Generator, stats: bool):
    rgb = load_scan(card)
    hint = HINTS[cid]
    foil = foil_area(rgb, win, const, hint)
    # alpha: 1 px off the Pokemon's ink (the outline is print), then a soft edge
    core = ndi.binary_erosion(foil, iterations=1)
    alpha = np.clip(cv2.GaussianBlur(core.astype(np.float32), (0, 0), 0.6) * foil * win, 0, 1)  # never outside the cut
    # dots of the scan inside the foil (2 px off its edge: the ink outline makes blobs)
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    vmax = rgb.max(axis=2).astype(np.float32) / 255.0
    inner = ndi.binary_erosion(foil, iterations=2)
    x, y, s, d = doh_blobs(0.5 * lum + 0.5 * vmax, inner)
    r = np.clip(s * 1.35, 0.8, 6.5)
    v = np.clip((d - DOH_MIN) / (DOH_MIN * 6), 0.25, 1.0) ** 0.8
    scan_dots = draw_dots(x, y, r, v)
    # where the scan shows few dots, synthetic dots fill in: each kept with the local shortfall of scan dots
    pts = np.zeros((H, W), np.float32)
    pts[y, x] = 1.0
    norm = cv2.GaussianBlur(inner.astype(np.float32), (0, 0), 16)
    dens = cv2.GaussianBlur(pts, (0, 0), 16) / np.maximum(norm, 1e-3)
    short = np.clip(1.0 - dens / FULL_DENSITY, 0, 1)
    sx, sy, sr, sv = synth_cosmos(rng, build.radii, FULL_DENSITY)
    ix, iy = np.clip(sx.astype(int), 0, W - 1), np.clip(sy.astype(int), 0, H - 1)
    sel = inner[iy, ix] & (rng.random(sx.size) < short[iy, ix])
    syn = draw_dots(sx[sel], sy[sel], sr[sel], sv[sel])
    dots = np.maximum(scan_dots, syn) * alpha
    if hint.get("pale"):
        alpha = pale_sky(lum, foil, alpha, dots, hint["pale"])
    rgba = np.zeros((H, W, 4), np.uint8)
    g = np.clip(dots * 255 + 0.5, 0, 255).astype(np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = g
    rgba[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)
    if stats:
        insidew = win > 0.5
        print(f"{cid:10s} foil {foil.sum() / insidew.sum():5.2f} of window  scan dots {len(x):4d}  "
              f"dens {len(x) / max(1, inner.sum()):.4f}/px2  synthetic {int(sel.sum()):4d}")
    return rgba, rgb, foil, dots, (x, y, r)


def preview(path: Path, rgb, foil, dots, win):
    over = rgb.astype(np.float32).copy()
    matte = (win > 0.5) & ~foil
    over[matte] = over[matte] * 0.45 + np.array([255, 40, 40]) * 0.55
    edge = foil ^ ndi.binary_erosion(foil)
    over[edge] = [255, 230, 0]
    sp = np.repeat((dots * 255)[..., None], 3, axis=2)
    crop = (slice(60, 440), slice(25, 575))
    row = np.concatenate([rgb[crop], over[crop].astype(np.uint8), sp[crop].astype(np.uint8)], axis=1)
    Image.fromarray(row).resize((row.shape[1] * 2, row.shape[0] * 2), Image.NEAREST).save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ids", default="", help="comma-separated card ids (default: every card in the hints file)")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--preview", default="")
    ap.add_argument("--stats", action="store_true")
    a = ap.parse_args()
    ids = [i for i in (a.ids.split(",") if a.ids else HINTS) if not i.startswith("_")]
    cards = load_cards()
    win = window_mask()
    std = frame_constant(cards)
    const = (std < STD_FRAME) & (win > 0.02)
    lb, rb = np.zeros_like(const), np.zeros_like(const)
    lb[LOGO_BOX[1]:LOGO_BOX[3], LOGO_BOX[0]:LOGO_BOX[2]] = True
    rb[RING_BOX[1]:RING_BOX[3], RING_BOX[0]:RING_BOX[2]] = True
    edge_band = (win > 0.02) & ~ndi.binary_erosion(win > 0.5, iterations=3)
    const = const & (lb | rb | edge_band)
    const = ndi.binary_dilation(const, iterations=1) & (lb | rb | edge_band)
    # dot sizes for the synthetic field: the radii found on the dot-rich scans (Luxray GL, Darkrai G, Rayquaza C)
    radii = []
    for rid in ("pl2-9", "pl2-3", "pl3-8"):
        rgb = load_scan(cards[rid])
        lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
        vmax = rgb.max(axis=2).astype(np.float32) / 255.0
        area = ndi.binary_erosion(foil_area(rgb, win, const, HINTS[rid]), iterations=2)
        _, _, s, _ = doh_blobs(0.5 * lum + 0.5 * vmax, area)
        radii.append(np.clip(s * 1.35, 0.8, 6.5))
    build.radii = np.concatenate(radii)
    print("synthetic dot radii: median %.2f, p90 %.2f px" % (np.median(build.radii), np.percentile(build.radii, 90)))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    pv = Path(a.preview) if a.preview else None
    if pv:
        pv.mkdir(parents=True, exist_ok=True)
    tiles = []
    for cid in ids:
        src = HINTS[cid].get("card", cid)
        rng = np.random.default_rng([SEED, sum(map(ord, src))])
        rgba, rgb, foil, dots, _ = build(cid, cards[src], win, const, rng, a.stats)
        Image.fromarray(rgba, "RGBA").save(out / f"{cid}.webp", lossless=True, quality=100, method=6, exact=False)
        if pv:
            preview(pv / f"{cid}-check.png", rgb, foil, dots, win)
            tiles.append(cid)
    if pv and tiles:
        ims = [Image.open(pv / f"{t}-check.png") for t in tiles]
        w0, h0 = ims[0].size
        sheet = Image.new("RGB", (w0 // 2, (h0 // 2) * len(ims)))
        for i, im in enumerate(ims):
            sheet.paste(im.resize((w0 // 2, h0 // 2), Image.LANCZOS), (0, i * (h0 // 2)))
        sheet.save(pv / "contact.jpg", quality=85)


if __name__ == "__main__":
    main()
