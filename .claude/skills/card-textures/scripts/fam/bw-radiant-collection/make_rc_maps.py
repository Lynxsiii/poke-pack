#!/usr/bin/env python3
"""Legendary Treasures' Radiant Collection: the foil-zone map of every confetti card, the Pokemon cut out.

What the real cards do (photos: /mnt/project-files/holo-remaster/bw-radiant-collection/refs/SOURCES.md): the Confetti
holofoil chips sit on the BACKGROUND of the art window and over the text box; the Pokemon itself is matte ink (the
Serebii scan of Mew-EX RC24 and the TCGplayer scans show smooth pink Mew with glittering blue ground round it; the
Bleeding Cool photo of Pikachu RC7 shows no chips on the yellow Pokemon). The frame and name bar are matte. On the
full arts the chips run edge to edge over everything but the Pokemon.

The silhouette comes from the real scans themselves: the TCGplayer and Serebii photos of the real cards, registered
onto the site's digital scans (the earlier pass's reg_test.py), give a local-normalised difference map (refs/loc/rc<n>.png:
where the physical card carries texture the digital scan does not). Here:

  1. evidence  = local texture energy of that difference + its smoothed mean (flake-covered ground differs, matte ink does not);
  2. P         = a colour guided filter (He et al.) of the evidence, guided by the digital scan, so the evidence follows
                 the printed edges, then scaled between the 70th and 8th percentile of the region of interest;
  3. silhouette = cv2.grabCut on the scan, seeded from P (sure Pokemon where P > 0.85, sure ground where P < 0.08 or
                 outside the region of interest), keeping the blobs larger than 0.3% of the region.
  The region of interest is the art window on a regular frame and the whole face on a full art or an EX.

The zone map is then the era's own zone map (assets/foil/maps/bw-rc-v1.webp: the art window at full strength, the text box
at half; bw-rc-fa-v1.webp for RC11 and RC21-RC25: the whole face, the name bar and text box at half) times (1 - the silhouette,
feathered). Alpha only; 400 x 559; one file per card:

    python3 .claude/skills/card-textures/scripts/fam/bw-radiant-collection/make_rc_maps.py [--contact out.jpg]

Writes assets/foil/fam/bw-radiant-collection/map-rc<n>.webp (lossless) for the cards in CHIPS. Deterministic (grabCut is seeded
by the mask; cv2.setRNGSeed fixes the rest).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-radiant-collection"
LOC = Path("/mnt/project-files/holo-remaster/bw-radiant-collection/refs/loc")
SCANS = ROOT / "assets" / "cards" / "bw11"
# n: full-frame (the EX and the full arts)
CHIPS = {3: 0, 4: 0, 6: 0, 7: 0, 10: 0, 11: 1, 12: 0, 13: 0, 14: 0, 19: 0, 21: 1, 22: 1, 23: 1, 24: 1, 25: 1}
SIZE = (400, 559)
# The era's zone map holds the text box at half strength; the real chips run over it as strongly as over the window (Pikachu RC7's
# body is covered), so it is lifted to 0.8 (below the lower edge of the art window, y > 0.5 of the card).
BODY_GAIN = 1.6
# The grabCut silhouette misses the Pokemon's dark and grey ink (review 1, 2026-10-02: Emolga's black ears, Stunfisk's shell, Meloetta's
# navy hair loops, Cinccino's grey fur carried chips). For these cards every dark (lum < T) or neutral-grey pixel inside the region of
# interest joins the cut-out, but only the pieces that touch the existing silhouette (dilated 12 px) and are smaller than CAP of the
# region: a dark GROUND (Purrloin, Piplup, Reshiram, Mew-EX) is not a Pokemon part and keeps its chips. n: (kind, T, CAP).
# Cinccino (RC19) is grey on a pale ground, so a grey test eats the whole window rim: it gets a hand rectangle seed like Eevee instead.
# Last number: the margin (share of the card) kept out of the cut, so a card's own dark border keeps its chips (RC11's is thick).
INK = {11: ("dark", 90, 0.20, 0.06), 12: ("dark", 110, 0.60, 0.025), 23: ("dark", 135, 0.20, 0.025), 25: ("dark", 90, 0.20, 0.025)}
# The evidence is too weak on a few cards (Eevee: a pale window): grabCut starts from a hand rectangle round the Pokemon
# (fractions of the scan: x0, y0, x1, y1) instead of the evidence; the colour models do the rest.
RECT = {14: (0.17, 0.125, 0.93, 0.455), 19: (0.20, 0.12, 0.76, 0.46)}


def box(a, r):
    return cv2.boxFilter(a, -1, (2 * r + 1, 2 * r + 1), normalize=True, borderType=cv2.BORDER_REFLECT)


def guided(I, p, r, eps):
    """He et al. colour guided filter. I: HxWx3 float32 guide, p: HxW float32 input."""
    mI = np.stack([box(I[..., c], r) for c in range(3)], -1)
    mp = box(p, r)
    cov_Ip = np.stack([box(I[..., c] * p, r) for c in range(3)], -1) - mI * mp[..., None]
    var = np.empty(I.shape[:2] + (3, 3), np.float32)
    for i in range(3):
        for j in range(i, 3):
            v = box(I[..., i] * I[..., j], r) - mI[..., i] * mI[..., j]
            var[..., i, j] = v
            var[..., j, i] = v
    var += eps * np.eye(3, dtype=np.float32)
    a = np.linalg.solve(var, cov_Ip[..., None])[..., 0]
    b = mp - (a * mI).sum(-1)
    ma = np.stack([box(a[..., c], r) for c in range(3)], -1)
    mb = box(b, r)
    return (ma * I).sum(-1) + mb


def add_ink(fg: np.ndarray, dig: np.ndarray, n: int, roi: np.ndarray) -> np.ndarray:
    """Add the dark (or neutral grey) ink of the Pokemon that grabCut left out: only pieces touching the silhouette."""
    kind, t, cap, margin = INK[n]
    rgb = dig[..., :3].astype(np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    if kind == "dark":
        ink = lum < t
    else:   # neutral grey: low saturation, mid luminance (Cinccino's ears and fur on a pink ground)
        sat = (rgb.max(-1) - rgb.min(-1)) / np.maximum(rgb.max(-1), 1)
        ink = (sat < 0.16) & (lum > 70) & (lum < 235)
    H, W = fg.shape
    inner = np.zeros_like(fg)
    inner[int(margin * H):int((1 - margin) * H), int(margin * W):int((1 - margin) * W)] = True   # the card's own border keeps its chips
    ink = ndi.binary_closing(ink & roi & inner, structure=np.ones((5, 5), bool))
    holes, hk = ndi.label(ndi.binary_fill_holes(ink) & ~ink)   # small lighter patches ringed by ink (ear highlights, letter counters) go too
    if hk:
        hs = ndi.sum(np.ones_like(holes), holes, np.arange(1, hk + 1))
        ink = ink | np.isin(holes, 1 + np.nonzero(hs < 0.004 * roi.sum())[0])
    lab, k = ndi.label(ink)
    if not k:
        return fg
    idx = np.arange(1, k + 1)
    area = ndi.sum(np.ones_like(lab), lab, idx)
    touch = ndi.sum(ndi.binary_dilation(fg, iterations=12), lab, idx)
    good = idx[(touch > 0) & (area <= cap * roi.sum())]
    print(f"  RC{n}: {k} {kind} pieces, {len(good)} touch the Pokemon, +{int(np.isin(lab, good).sum() - (fg & np.isin(lab, good)).sum())} px")
    fg = fg | np.isin(lab, good)
    fg = ndi.binary_closing(fg, structure=np.ones((13, 13), bool)) & roi   # pockets narrower than ~13 px between ink and body (ear highlights)
    holes, hk = ndi.label(ndi.binary_fill_holes(fg) & ~fg)
    if hk:
        hs = ndi.sum(np.ones_like(holes), holes, np.arange(1, hk + 1))
        fg = fg | np.isin(holes, 1 + np.nonzero(hs < 0.004 * roi.sum())[0])
    return fg


def silhouette(n: int, full: int) -> np.ndarray:
    cv2.setRNGSeed(2013)
    dig = np.array(Image.open(SCANS / f"RC{n}.webp").convert("RGBA"))
    H, W = dig.shape[:2]
    a = dig[..., 3] > 200
    m = np.array(Image.open(LOC / f"rc{n}.png").convert("L")).astype(np.float32) / 255 * 0.6 - 0.05
    hp = m - ndi.gaussian_filter(m, 2.5)
    tex = np.sqrt(ndi.gaussian_filter(hp ** 2, 5))
    mean = ndi.gaussian_filter(m, 5)
    t = tex / np.percentile(tex[a], 90)
    mm = mean / np.percentile(np.abs(mean[a]), 90)
    ev = np.clip(0.65 * t + 0.35 * np.clip(mm, -1, 2), 0, 1.5) / 1.5
    ev[~a] = 0
    if full:
        roi = ndi.binary_erosion(a, iterations=10)
    else:
        roi = np.zeros_like(a)
        roi[int(0.115 * H):int(0.48 * H), int(0.065 * W):int(0.935 * W)] = True
    I = dig[..., :3].astype(np.float32) / 255
    q = guided(I, ndi.gaussian_filter(ev.astype(np.float32), 3), 12, 2e-3)
    q = guided(I, q, 6, 1e-3)
    bg = np.percentile(q[roi], 70)
    pk = np.percentile(q[roi], 8)
    P = np.clip((bg - q) / (bg - pk + 1e-6), 0, 1)
    P[~roi] = 0
    g = np.full((H, W), cv2.GC_PR_BGD, np.uint8)
    if n in RECT:
        x0, y0, x1, y1 = RECT[n]
        g[:] = cv2.GC_BGD
        g[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = cv2.GC_PR_FGD
        core = (int((y0 + 0.35 * (y1 - y0)) * H), int((y1 - 0.2 * (y1 - y0)) * H), int((x0 + 0.3 * (x1 - x0)) * W), int((x1 - 0.2 * (x1 - x0)) * W))
        g[core[0]:core[1], core[2]:core[3]] = cv2.GC_FGD
    else:
        g[P > 0.5] = cv2.GC_PR_FGD
        g[ndi.binary_erosion(P > 0.85, iterations=4)] = cv2.GC_FGD
        g[ndi.binary_erosion(P < 0.08, iterations=4) | ~roi] = cv2.GC_BGD
    img = np.ascontiguousarray(dig[..., 2::-1])
    cv2.grabCut(img, g, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    fg = (g == cv2.GC_FGD) | (g == cv2.GC_PR_FGD)
    lab, k = ndi.label(fg)
    if k:
        sizes = ndi.sum(fg, lab, range(1, k + 1))
        fg = np.isin(lab, 1 + np.nonzero(sizes > 0.003 * roi.sum())[0])
    if n in INK:
        fg = add_ink(fg, dig, n, roi)
    return fg


def zone_map(n: int, full: int) -> Image.Image:
    base = Image.open(ROOT / "assets" / "foil" / "maps" / ("bw-rc-fa-v1.webp" if full else "bw-rc-v1.webp")).convert("RGBA")
    zone = np.array(base.resize((600, 838), Image.LANCZOS))[..., 3].astype(np.float32) / 255
    fg = silhouette(n, full)
    fg = ndi.binary_dilation(fg, iterations=2)
    soft = np.clip(ndi.gaussian_filter(fg.astype(np.float32), 2.2) * 1.15, 0, 1)
    zone = zone * (1 - 0.96 * soft)
    zone[int(0.5 * 838):] = np.minimum(zone[int(0.5 * 838):] * BODY_GAIN, 1.0)
    out = np.zeros((838, 600, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.round(np.clip(zone, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize(SIZE, Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tiles = []
    only = {int(a) for a in sys.argv[1:] if a.isdigit()}
    for n, full in CHIPS.items():
        if only and n not in only:
            continue
        im = zone_map(n, full)
        path = OUT / f"map-rc{n}.webp"
        im.save(path, lossless=True, quality=100, method=6, exact=True)
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")
        if "--contact" in sys.argv:
            dig = Image.open(SCANS / f"RC{n}.webp").convert("RGBA").resize(SIZE)
            al = np.array(im)[..., 3:4].astype(np.float32) / 255
            vis = np.array(dig)[..., :3].astype(np.float32)
            vis = vis * (1 - 0.55 * al) + np.array([255, 0, 200]) * 0.55 * al
            tiles.append(Image.fromarray(vis.astype(np.uint8)).resize((240, 335)))
    if tiles:
        cols = 8
        sheet = Image.new("RGB", (240 * cols, 335 * ((len(tiles) + cols - 1) // cols)))
        for k, t in enumerate(tiles):
            sheet.paste(t, ((k % cols) * 240, (k // cols) * 335))
        sheet.save(sys.argv[sys.argv.index("--contact") + 1], quality=85)


if __name__ == "__main__":
    main()
