#!/usr/bin/env python3
"""Draw the Rotom (Rising Rivals RT1-RT6) cracked-ice maps from each card's own scan.

What the real card does (photos in /mnt/project-files/holo-remaster/dp-special-rares/refs/, SOURCES.md): everything inside
the yellow border except the art window (and its silver bevel and dex strip) is reverse "cracked ice" foil: flat angular
shards, 5-13% of the card wide, each a small mirror at its own angle. Tipped under a lamp, a shard lights all at once in
one colour (white-yellow through the yellow ink of RT1-RT5, vivid pink, cyan, yellow, white through the grey of RT6),
many at a time, different shards at different tilts. The Scrydex scan already shows every shard (frozen in the colour
the scanner's lamp gave it), so the shards are segmented from the scan itself and only the LIGHT is drawn.

Per card, three files in assets/foil/fam/dp-special-rares/:

    rt<n>-ice.webp  RGBA. Alpha = where the foil is (inside the border, minus the art window, the dark ink cut out; the
                    window's bevel and dex strip at half, for the sheen only). RGB = the colour each shard flashes
                    (a saturated hue per shard, black on the bevel and dex strip so they never flash).
    rt<n>-px.webp,  greyscale, lossless: each shard's tilt "phase" along x and along y (uniform random per shard). The
    rt<n>-py.webp   sheet gates the colour with |phase - pointer ramp| (css/holo/fam/dp-special-rares.css), so a shard
                    lights only when the card is tipped to its own angle.

How the shards are found: dark ink (text, line art) is inpainted away, the result mean-shift filtered so each shard is
flat, low-gradient cores become watershed markers, the watershed regions are redrawn as simplified polygons (crisp
straight edges like the real cracks), and a region bigger than any real shard (two merged neighbours of the same colour)
is split along straight Voronoi edges.

    python3 .claude/skills/card-textures/scripts/fam/dp-special-rares/make_rotom_ice.py [--cards RT1,RT6] [--preview DIR]

Seeded from the card id; reruns give the same bytes.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
import scipy.ndimage as nd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dsr_common import (H, W, body_inset, load_scan, luminance, rng_for, save_alpha, save_gray,  # noqa: E402
                        smoothstep, window_mask)

# Hues a real shard flashes (degrees), how often, and how saturated: hot pink and magenta lead, then cyan, green, a pale
# yellow, sky blue and lavender. Blue and violet are kept light: the sheet multiplies the flash colour in (`.glare`), and a
# deep blue would leave a dark shard, which real foil never does.
PALETTE = [(318, 0.16, 0.95), (338, 0.13, 0.9), (186, 0.16, 0.9), (200, 0.08, 0.75), (218, 0.09, 0.6), (122, 0.11, 0.8),
           (150, 0.06, 0.8), (272, 0.09, 0.55), (52, 0.12, 0.5)]
MAX_SHARD = 5200     # px at 600 x 838: a region above this is two shards merged; split it
SPLIT_TO = 2600      # target area of the parts


def frame_zone(card_id: str, win: np.ndarray) -> np.ndarray:
    """The art window's silver bevel (and the dex strip under a Pokemon's window, Charon's Choice's edge rails): printed,
    no shards in the scan. They keep the sheen (half alpha) but never flash."""
    w = (win > 0.5).astype(np.uint8)
    pad = 13 if card_id != "pl2-RT6" else 11
    z = cv2.dilate(w, cv2.getStructuringElement(cv2.MORPH_RECT, (2 * pad + 1, 2 * pad + 1))).astype(bool)
    if card_id != "pl2-RT6":
        z[417:448, 26:575] = True   # the dex strip ("NO. 479 Plasma Pokemon ...")
    else:
        z[:, :33] = True            # Charon's Choice: the printed rails with orange ticks down both edges
        z[:, 567:] = True
    return z


def segment(rgb: np.ndarray, region: np.ndarray, card_id: str) -> np.ndarray:
    L = luminance(rgb)
    bgr = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    ink = cv2.dilate((L < 0.38).astype(np.uint8), np.ones((3, 3), np.uint8))
    clean = cv2.inpaint(bgr, ink * 255, 4, cv2.INPAINT_TELEA)
    flat = cv2.pyrMeanShiftFiltering(clean, 8, 18, maxLevel=1)
    lab = cv2.cvtColor(flat, cv2.COLOR_BGR2LAB).astype(np.float32)
    grad = np.zeros(L.shape, np.float32)
    for c in range(3):
        gx = cv2.Sobel(lab[..., c], cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(lab[..., c], cv2.CV_32F, 0, 1, ksize=3)
        grad = np.maximum(grad, np.hypot(gx, gy))
    core = cv2.erode(((grad < 22) & region).astype(np.uint8), np.ones((3, 3), np.uint8))
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(core, connectivity=4)
    markers = np.zeros(L.shape, np.int32)
    k = 0
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 25:
            k += 1
            markers[lbl == i] = k
    ws = cv2.watershed(flat.copy(), markers)
    hole = ws <= 0
    idx = nd.distance_transform_edt(hole, return_distances=False, return_indices=True)
    ws = ws[idx[0], idx[1]]
    ws[~region] = 0

    # Redraw every region as a simplified polygon, biggest first, so the cracks are straight like the real ones.
    out = np.zeros_like(ws)
    ids, areas = np.unique(ws[ws > 0], return_counts=True)
    for lab_id in ids[np.argsort(-areas)]:
        m = (ws == lab_id).astype(np.uint8)
        contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for cnt in contours:
            if cv2.contourArea(cnt) < 12:
                continue
            poly = cv2.approxPolyDP(cnt, 1.6, True)
            cv2.fillPoly(out, [poly], int(lab_id))
    gap = (out == 0) & region
    idx = nd.distance_transform_edt(out == 0, return_distances=False, return_indices=True)
    out = np.where(gap, out[idx[0], idx[1]], out)
    out[~region] = 0

    # Split regions bigger than a real shard along straight (Voronoi) edges.
    rng = rng_for(card_id, "split")
    nxt = int(out.max()) + 1
    ids, areas = np.unique(out[out > 0], return_counts=True)
    for lab_id, area in zip(ids, areas):
        if area <= MAX_SHARD:
            continue
        ys, xs = np.nonzero(out == lab_id)
        parts = int(round(area / SPLIT_TO))
        seeds = np.stack([xs, ys], 1)[rng.choice(len(xs), size=parts, replace=False)].astype(np.float32)
        for _ in range(6):  # a few Lloyd steps so the parts are even
            d = ((xs[:, None] - seeds[None, :, 0]) ** 2 + (ys[:, None] - seeds[None, :, 1]) ** 2)
            near = d.argmin(1)
            for j in range(parts):
                sel = near == j
                if sel.any():
                    seeds[j] = (xs[sel].mean(), ys[sel].mean())
        d = ((xs[:, None] - seeds[None, :, 0]) ** 2 + (ys[:, None] - seeds[None, :, 1]) ** 2)
        near = d.argmin(1)
        for j in range(1, parts):
            sel = near == j
            out[ys[sel], xs[sel]] = nxt
            nxt += 1
    return out


def build(card_id: str, preview: Path | None) -> None:
    rgb, card_alpha = load_scan(card_id)
    L = luminance(rgb)
    win = window_mask(card_id)
    body = body_inset()
    frame = frame_zone(card_id, win)
    region = (body > 0.5) & ~frame
    labels = segment(rgb, region, card_id)

    rng = rng_for(card_id, "phase")
    n = int(labels.max()) + 1
    px = rng.random(n).astype(np.float32)
    py = rng.random(n).astype(np.float32)
    hues = np.array([h for h, _, _ in PALETTE], np.float32)
    weights = np.array([w for _, w, _ in PALETTE], np.float64)
    sats = np.array([s for _, _, s in PALETTE], np.float32)
    pick = rng.choice(len(PALETTE), size=n, p=weights / weights.sum())
    hue = (hues[pick] + rng.uniform(-8, 8, n)) % 360
    sat = np.clip(sats[pick] + rng.uniform(-0.08, 0.05, n), 0.0, 1.0)
    hsv = np.stack([hue / 2, sat * 255, np.full(n, 255.0)], 1).astype(np.uint8)[None]
    lut = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)[0].astype(np.float32) / 255.0
    lut[0] = 0.0
    px[0] = py[0] = 0.0

    colour = lut[labels]
    colour[frame] = 0.0
    ink = smoothstep(0.42, 0.24, L)
    alpha = body * (1.0 - win) * (1.0 - 0.85 * ink) * card_alpha
    alpha = np.where(frame, alpha * 0.5, alpha)
    tag = card_id.split("-")[1].lower()
    save_alpha(alpha, f"{tag}-ice.webp", rgb=colour, quality=92)
    save_gray(px[labels], f"{tag}-px.webp")
    save_gray(py[labels], f"{tag}-py.webp")
    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        vis = (colour * alpha[..., None] + rgb * (1 - alpha[..., None]) * 0.35)
        cv2.imwrite(str(preview / f"{tag}-ice-preview.png"), cv2.cvtColor((vis * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
        print(card_id, "shards", len(np.unique(labels)) - 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default="RT1,RT2,RT3,RT4,RT5,RT6")
    ap.add_argument("--preview", type=Path, default=None, help="also write colour previews into this folder")
    a = ap.parse_args()
    for c in a.cards.split(","):
        build(f"pl2-{c.strip()}", a.preview)


if __name__ == "__main__":
    main()
