#!/usr/bin/env python3
"""
Per-card foil maps for the ex-pokemon-ex holo family (EX-era Pokémon-ex: cosmos ex and cracked-ice ex).

For every face the family claims (list_cards.mjs, same folder) it reads the site's scan, assets/cards/<set>/<n>.webp
(600 x 838), and writes assets/foil/fam/ex-pokemon-ex/<card id>-v1.webp, a lossless RGBA image registered pixel for pixel
to the scan:

  ALPHA  where the real card is foil (refs and notes: /mnt/project-files/holo-remaster/ex-pokemon-ex/):
           the outer silver border, from the card edge to the coloured body (a rounded rectangle), the wide e-Reader
           foot of ex1-ex4 included (its logo and dot strip are printed over the foil), plus the art window inside its
           grey frame line, minus the evolution ring of a Stage 1/2 frame. np001/np002 print a yellow (plain ink)
           border: the window alone. The name bar, the body, the frame line, the ring, the text box are 0.
  RGB    the foil's own pattern as the scan caught it, on black:
           cosmos ex    every compact colour spot the scan shows in the foil area (the frozen cosmos pinpoints and
                        rosette pixels), each painted ONE random saturated hue (seeded), value from its strength;
           cracked ice  every shard (mean-shift + watershed segmentation of the scan), each ONE flat random hue;
                        shards bigger than a real shard are cut into seeded angular pieces and dimmed (opaque ink).
         The page lights these by multiplying with a moving spectrum, so each dot or shard flashes when its hue
         matches (css/holo/fam/ex-pokemon-ex.css).

How the geometry is measured (all from the scans, nothing hand-placed):
  body     per card: the strongest colour step of the median profile across 40% of the side, inside a per-set
           plausible range (the borders differ per set: ex2's dark rim, ex1/ex3/ex4's wide e-Reader foot, ex6's
           wide frame); body corner radii per frame family;
  window   per set: the colour-step profiles of every card of the set, aligned at the body edges (the bottom in
           body-height units), averaged so the printed frame adds up and the art averages out; the frame-to-art step
           is the window edge;
  ring     per set: the mean of the stage cards' corner crops (aligned at the window's bottom-left corner), the outer
           ellipse of the light ring fitted by the strongest outward brightness drop.

Deterministic: geometry has no randomness; colours are seeded by the card id (crc32), so a rerun writes the same files.

Usage (repo root):
  node .claude/skills/card-textures/scripts/fam/ex-pokemon-ex/list_cards.mjs > /tmp/expex-cards.json
  python3 .claude/skills/card-textures/scripts/fam/ex-pokemon-ex/make_ex_pokemon_ex_maps.py --cards /tmp/expex-cards.json \
      [--only ex6-105,ex3-97] [--debug-dir <dir>] [--dry-run]
Writes only into assets/foil/fam/ex-pokemon-ex/ (and --debug-dir). Needs numpy, scipy, Pillow, opencv-python.
"""
import argparse
import json
import os
import sys
import zlib

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
OUT_DIR = os.path.join(ROOT, "assets/foil/fam/ex-pokemon-ex")
W, H = 600, 838

# Plausible body-edge depth (px from the card edge) per set and side; everything else is 4-19 px.
STD_RANGE = {"L": (4, 19), "R": (4, 19), "T": (4, 19), "B": (4, 19)}
RANGES = {
    "ex1": {"L": (6, 22), "R": (6, 22), "T": (5, 18), "B": (40, 72)},
    "ex2": {"L": (12, 27), "R": (12, 27), "T": (10, 22), "B": (58, 80)},
    "ex3": {"L": (17, 32), "R": (17, 32), "T": (18, 32), "B": (55, 72)},
    "ex4": {"L": (5, 22), "R": (5, 22), "T": (5, 18), "B": (38, 56)},
    "ex5": {"L": (5, 21), "R": (5, 21), "T": (5, 21), "B": (5, 21)},
    "ex6": {"L": (16, 32), "R": (16, 32), "T": (16, 32), "B": (16, 32)},
    "np": {"L": (5, 22), "R": (5, 22), "T": (5, 18), "B": (35, 60)},
}
# Body corner radii (px): the e-Reader frames (ex1-ex4, the np promos) round the name bar and the body; later frames are
# nearly square.
CORNERS_EREADER = {"TL": 20.0, "TR": 16.0, "BL": 12.0, "BR": 16.0}
CORNERS_LATER = {"TL": 5.0, "TR": 8.0, "BL": 5.0, "BR": 6.0}
EREADER = {"ex1", "ex2", "ex3", "ex4", "np"}
MAP_VERSION = 1  # bump when a map is redrawn after it shipped (js/fam/ex-pokemon-ex.js reads the same number)
SS = 4  # supersampling for the anti-aliased zone


def load(card):
    im = Image.open(os.path.join(ROOT, card["image"])).convert("RGBA")
    if im.size != (W, H):
        raise SystemExit(f"{card['id']}: scan is {im.size}, expected {(W, H)}")
    a = np.asarray(im).astype(np.float32)
    return a[..., :3], a[..., 3] / 255.0


def step_profile(band):
    """Median colour across lines (axis 0), lightly smoothed; returns the 4-px colour-step strength per depth."""
    med = ndi.uniform_filter1d(np.median(band, axis=0), 3, axis=0)
    s = np.zeros(len(med))
    s[2:-2] = np.sqrt(((med[4:] - med[:-4]) ** 2).sum(-1))
    return s


def centroid(s, d):
    w = s[d - 2:d + 3]
    x = np.arange(d - 2, d + 3)
    return float((w * x).sum() / w.sum())


def strongest_step(band, lo, hi):
    s = step_profile(band)
    best = None
    for d in range(max(lo, 3), hi + 1):
        if s[d] >= s[d - 1] and s[d] >= s[d + 1] and (best is None or s[d] > s[best]):
            best = d
    return centroid(s, best) if best is not None else None


def detect_body(rgb, set_id):
    """L, R, T, B: depth (px) of the coloured body's edge from each card edge."""
    rg = RANGES.get(set_id, STD_RANGE)
    d = 95
    y0, y1 = int(0.52 * H), int(0.86 * H)
    e4 = set_id in EREADER
    bx0, bx1 = (110, 290) if e4 else (int(0.35 * W), int(0.62 * W))
    if set_id == "ex2":  # the Sandstorm dot strip starts at x~108: read the foot between the logo and the strip
        bx0, bx1 = 92, 106
    tx0, tx1 = int(0.40 * W), int(0.55 * W)
    bands = {
        "L": rgb[y0:y1, 0:d],
        "R": rgb[y0:y1, W - d:W][:, ::-1],
        "T": np.swapaxes(rgb[0:d, tx0:tx1], 0, 1),
        "B": np.swapaxes(rgb[H - d:H, bx0:bx1][::-1], 0, 1),
    }
    out = {k: strongest_step(bands[k], *rg[k]) for k in "LRTB"}
    for k, v in out.items():
        if v is None:
            raise SystemExit(f"no body edge found ({k}, set {set_id})")
    return out


def window_template(scans, bodies):
    """Per-set window offsets from the body edges: (tL, tR, tT, uB) with uB in body-height units from the body top."""
    acc = {k: [] for k in "LRTB"}
    grid = np.arange(0.30, 0.55, 0.0005)
    for rgb, b in zip(scans, bodies):
        bh = H - b["T"] - b["B"]
        y0, y1 = int(b["T"] + 0.14 * bh), int(b["T"] + 0.30 * bh)
        li, ri, ti = int(round(b["L"])), int(round(b["R"])), int(round(b["T"]))
        acc["L"].append(step_profile(rgb[y0:y1, li:li + 90]))
        acc["R"].append(step_profile(rgb[y0:y1, W - ri - 90:W - ri][:, ::-1]))
        acc["T"].append(step_profile(np.swapaxes(rgb[ti:ti + 90, int(0.35 * W):int(0.65 * W)], 0, 1)))
        yy0, yy1 = int(b["T"] + 0.30 * bh), int(b["T"] + 0.55 * bh)
        sb = step_profile(np.swapaxes(rgb[yy0:yy1, int(0.35 * W):int(0.65 * W)], 0, 1))
        acc["B"].append(np.interp(grid, (np.arange(yy0, yy1) - b["T"]) / bh, sb))

    def peaks(m, lo, hi):
        top = m[lo:hi].max()
        return [d for d in range(lo, hi) if m[d] >= m[d - 1] and m[d] >= m[d + 1] and m[d] > 0.35 * top]

    t = {}
    for k in "LR":  # the frame-to-art step: the innermost strong step 22-34 px in from the body edge
        m = np.mean(acc[k], axis=0)
        p = [d for d in peaks(m, 3, 88) if 22 <= d <= 34]
        t[k] = centroid(m, p[-1])
    m = np.mean(acc["T"], axis=0)  # under the name bar: dark swoosh line, light frame band, then the art
    p = [d for d in peaks(m, 3, 88) if 58 <= d <= 68]
    t["T"] = centroid(m, p[-1])
    m = np.mean(acc["B"], axis=0)  # the first step below the art is the art's bottom edge
    p = peaks(m, 2, len(m) - 2)
    j = p[0]
    w = m[j - 2:j + 3]
    t["B"] = float((w * grid[j - 2:j + 3]).sum() / w.sum())
    return t


def window_of(b, t):
    bh = H - b["T"] - b["B"]
    return b["L"] + t["L"], W - b["R"] - t["R"], b["T"] + t["T"], b["T"] + t["B"] * bh


def ring_template(crops):
    """Outer ellipse of the evolution ring on the mean of the stage cards' crops (window bottom-left corner at (50, 50)):
    the strongest outward brightness drop along the ellipse, the right-hand side (where the ring joins the STAGE bar)
    left out. Returns dx, dy (centre from the corner), ra, rb."""
    from scipy.ndimage import gaussian_filter, map_coordinates

    lum = gaussian_filter(np.mean(crops, axis=0).mean(-1), 0.8)
    th = np.linspace(0, 2 * np.pi, 360, endpoint=False)
    th = th[(th > np.radians(40)) & (th < np.radians(320))]
    ct, st = np.cos(th), np.sin(th)

    def score(cx, cy, ra, rb):
        inner = map_coordinates(lum, [cy + (rb - 1.5) * st, cx + (ra - 1.5) * ct], order=1)
        outer = map_coordinates(lum, [cy + (rb + 1.5) * st, cx + (ra + 1.5) * ct], order=1)
        return float((inner - outer).mean())

    best = (-1e9, None)
    for cx in np.arange(50, 90, 2):
        for cy in np.arange(50, 90, 2):
            for ra in np.arange(34, 52, 2):
                for rb in np.arange(28, 48, 2):
                    if rb > ra + 2:
                        continue
                    s = score(cx, cy, ra, rb)
                    if s > best[0]:
                        best = (s, (cx, cy, ra, rb))
    p = np.array(best[1], float)
    for step in (1.0, 0.5, 0.25):
        improved = True
        while improved:
            improved = False
            for dv in np.vstack([np.eye(4), -np.eye(4)]):
                q = p + step * dv
                s = score(*q)
                if s > best[0]:
                    best, p, improved = (s, tuple(q)), q, True
    cx, cy, ra, rb = p
    return {"dx": cx - 50, "dy": cy - 50, "ra": ra, "rb": rb}


def ring_crop(rgb, win):
    pad = np.pad(rgb, ((60, 60), (60, 60), (0, 0)), mode="edge")
    x0, y0 = int(round(win[0])) - 50 + 60, int(round(win[3])) - 50 + 60
    return pad[y0:y0 + 150, x0:x0 + 140], (int(round(win[0])) - 50, int(round(win[3])) - 50)


def zone(card, body, win, ring, card_alpha):
    """Anti-aliased foil area (0..1)."""
    ys, xs = np.mgrid[0:H * SS, 0:W * SS].astype(np.float32)
    xs = (xs + 0.5) / SS
    ys = (ys + 0.5) / SS
    L, R, T, B = body["L"], W - body["R"], body["T"], H - body["B"]
    rad = CORNERS_EREADER if card["set"] in EREADER else CORNERS_LATER
    inside = (xs >= L) & (xs <= R) & (ys >= T) & (ys <= B)
    for (cx, cy, sx, sy, r) in ((L, T, 1, 1, rad["TL"]), (R, T, -1, 1, rad["TR"]), (L, B, 1, -1, rad["BL"]), (R, B, -1, -1, rad["BR"])):
        ox, oy = cx + sx * r, cy + sy * r
        corner = ((xs - ox) * sx < 0) & ((ys - oy) * sy < 0)
        inside &= ~(corner & ((xs - ox) ** 2 + (ys - oy) ** 2 > r * r))
    wl, wr, wt, wb = win
    window = (xs >= wl) & (xs <= wr) & (ys >= wt) & (ys <= wb)
    if ring is not None:
        ex, ey = wl + ring["dx"], wb + ring["dy"]
        window &= ((xs - ex) / (ring["ra"] + 1.0)) ** 2 + ((ys - ey) / (ring["rb"] + 1.0)) ** 2 > 1.0
    z = window if card["windowOnly"] else (window | ~inside)
    z = z.reshape(H, SS, W, SS).mean(axis=(1, 3))
    return np.clip(z * card_alpha, 0, 1)


def hsv_colors(rng, n, vmin=1.0):
    """n random saturated colours (any hue), as float RGB 0..1."""
    h = rng.random(n) * 6.0
    s = 0.85 + 0.15 * rng.random(n)
    v = vmin + (1.0 - vmin) * rng.random(n)
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def cosmos_dots(rgb, z, rng):
    """The scan's compact colour spots inside the foil area, each one random hue; value from its contrast."""
    bg = np.stack([ndi.median_filter(rgb[..., c], size=9) for c in range(3)], -1)
    d = rgb - bg
    lum = d.mean(-1)
    chroma = np.sqrt(((d - lum[..., None]) ** 2).sum(-1))
    score = np.maximum(lum, 0) * 0.8 + chroma
    lab, n = ndi.label((score > 38) & (z > 0.5))
    if n == 0:
        return np.zeros((H, W, 3), np.float32), 0
    idx = np.arange(1, n + 1)
    area = ndi.sum(np.ones_like(score), lab, idx)
    peak = ndi.maximum(score, lab, idx)
    keep = np.zeros(n + 1, bool)
    for i, sl in enumerate(ndi.find_objects(lab), start=1):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        a = area[i - 1]
        keep[i] = 2 <= a <= 80 and max(h, w) <= 12 and a / (h * w) >= 0.35
    cols = np.zeros((n + 1, 3), np.float32)
    k = np.flatnonzero(keep)
    cols[k] = hsv_colors(rng, len(k)) * np.clip(peak[k - 1] / 90.0, 0.55, 1.0)[:, None]
    out = cols[lab]
    # a real dot is a little bigger than its few scan pixels: grow each by one pixel (the brighter neighbour wins)
    out = np.stack([ndi.maximum_filter(out[..., c], size=3) for c in range(3)], -1)
    # soften the pixel edges a little (the dots are round on the card)
    out = np.stack([ndi.gaussian_filter(out[..., c], 0.5) for c in range(3)], -1) * 1.15
    return np.clip(out, 0, 1), len(k)


def ice_shards(rgb, z, rng, seed):
    """The scan's cracked-ice shards: mean shift flattens each shard, a watershed on the colour edges splits them.
    Regions larger than a real shard (opaque ink, merged shards) are cut into seeded angular pieces and dimmed."""
    bgr = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    ms = cv2.pyrMeanShiftFiltering(bgr, sp=6, sr=18, maxLevel=1)
    labf = cv2.cvtColor(ms, cv2.COLOR_BGR2LAB).astype(np.float32)
    g = np.zeros(labf.shape[:2], np.float32)
    for c in range(3):
        gx = cv2.Sobel(labf[..., c], cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(labf[..., c], cv2.CV_32F, 0, 1, ksize=3)
        g += gx * gx + gy * gy
    edges = (np.sqrt(g) > 40).astype(np.uint8)
    inner = cv2.erode(1 - edges, np.ones((3, 3), np.uint8))
    _, markers = cv2.connectedComponents(inner)
    markers = markers + 1
    markers[inner == 0] = 0
    ws = cv2.watershed(ms, markers.astype(np.int32))
    ws[ws < 0] = 0
    inzone = z > 0.5
    labels = np.where(inzone, ws, 0)
    # cut regions bigger than a real shard into angular pieces (Voronoi of seeded points, ~350 px each)
    nxt = labels.max() + 1
    sizes = np.bincount(labels.ravel())
    dim = np.zeros(0, int)
    big = [r for r in np.flatnonzero(sizes > 1400) if r != 0]
    dims = []
    for r in big:
        yy, xx = np.nonzero(labels == r)
        k = max(2, int(round(len(yy) / 350)))
        pick = rng.choice(len(yy), size=k, replace=False)
        py, px = yy[pick].astype(np.float32), xx[pick].astype(np.float32)
        dist = (yy[:, None] - py[None]) ** 2 + (xx[:, None] - px[None]) ** 2
        part = dist.argmin(1)
        labels[yy, xx] = nxt + part
        dims.extend(range(nxt, nxt + k))
        nxt += k
    dim = np.array(dims, int)
    n = labels.max()
    cols = np.zeros((n + 1, 3), np.float32)
    ids = np.unique(labels)
    ids = ids[ids != 0]
    cols[ids] = hsv_colors(rng, len(ids), vmin=0.75)
    if len(dim):
        cols[dim] *= 0.55
    # small specks are not shards: leave them dark
    sizes = np.bincount(labels.ravel(), minlength=n + 1)
    cols[sizes < 25] = 0
    out = cols[labels]
    # the shard seams (watershed lines, 1 px) take the neighbour's colour so no dark grid shows
    out = np.where(out.max(-1, keepdims=True) > 0, out, ndi.maximum_filter(out, size=(3, 3, 1)))
    return np.clip(out, 0, 1), len(ids)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", required=True, help="JSON from list_cards.mjs")
    ap.add_argument("--only", default="", help="comma-separated card ids to write (templates still use the whole set)")
    ap.add_argument("--debug-dir", default="", help="write overlay previews here")
    ap.add_argument("--jobs", type=int, default=3, help="sets drawn in parallel")
    ap.add_argument("--dry-run", action="store_true", help="measure and preview, write no map")
    args = ap.parse_args()
    cards = json.load(open(args.cards))
    only = set(filter(None, args.only.split(",")))
    by_set = {}
    for c in cards:
        by_set.setdefault(c["set"], []).append(c)
    os.makedirs(OUT_DIR, exist_ok=True)
    if args.debug_dir:
        os.makedirs(args.debug_dir, exist_ok=True)
    report = {}
    todo = [(s, g) for s, g in sorted(by_set.items()) if not only or any(c["id"] in only for c in g)]
    if args.jobs > 1 and len(todo) > 1:
        import multiprocessing as mp
        with mp.Pool(args.jobs) as pool:
            for rep in pool.imap_unordered(_run_set, [(s, g, only, args.debug_dir, args.dry_run) for s, g in todo]):
                report.update(rep)
    else:
        for s, g in todo:
            report.update(_run_set((s, g, only, args.debug_dir, args.dry_run)))
    if args.debug_dir:
        json.dump(report, open(os.path.join(args.debug_dir, "report.json"), "w"), indent=1)


def _run_set(job):
    """Draw every map of one set (a worker of the pool); returns the report rows."""
    set_id, group, only, debug_dir, dry_run = job
    report = {}
    if True:
        scans = [load(c) for c in group]
        bodies = [detect_body(rgb, set_id) for rgb, _ in scans]
        tmpl = window_template([s[0] for s in scans], bodies)
        wins = [window_of(b, tmpl) for b in bodies]
        stage_crops = [ring_crop(rgb, w)[0] for (rgb, _), w, c in zip(scans, wins, group) if c["stage"]]
        ring = ring_template(stage_crops) if stage_crops else None
        print(f"{set_id}: {len(group)} faces; window offsets L{tmpl['L']:.1f} R{tmpl['R']:.1f} T{tmpl['T']:.1f} "
              f"B{tmpl['B']:.4f}; ring {None if ring is None else {k: round(v, 1) for k, v in ring.items()}}")
        for c, (rgb, alpha), b, w in zip(group, scans, bodies, wins):
            if only and c["id"] not in only:
                continue
            rng = np.random.default_rng(zlib.crc32(c["id"].encode()))
            z = zone(c, b, w, ring if c["stage"] else None, alpha)
            if c["cracked"]:
                tex, n = ice_shards(rgb, z, rng, c["id"])
            else:
                tex, n = cosmos_dots(rgb, z, rng)
            rgba = np.dstack([tex * 255.0, z * 255.0]).round().clip(0, 255).astype(np.uint8)
            rgba[..., :3][rgba[..., 3] == 0] = 0
            report[c["id"]] = {"body": {k: round(v, 2) for k, v in b.items()}, "window": [round(v, 2) for v in w],
                               "pattern": "shards" if c["cracked"] else "dots", "count": int(n)}
            if not dry_run:
                Image.fromarray(rgba, "RGBA").save(os.path.join(OUT_DIR, f"{c['id']}-v{MAP_VERSION}.webp"), lossless=True, quality=100, method=6)
            if debug_dir:
                base = (rgb * 0.55).astype(np.float32)
                tint = np.array([60, 140, 255], np.float32)
                vis = base * (1 - 0.45 * z[..., None]) + tint * 0.45 * z[..., None]
                vis = np.where(tex.max(-1, keepdims=True) > 0.05, tex * 255, vis)
                Image.fromarray(np.concatenate([rgb, vis], 1).clip(0, 255).astype(np.uint8)).save(
                    os.path.join(debug_dir, f"{c['id']}.png"))
            print(f"  {c['id']}: body L{b['L']:.1f} R{b['R']:.1f} T{b['T']:.1f} B{b['B']:.1f} window "
                  f"{w[0]:.1f}-{w[1]:.1f} x {w[2]:.1f}-{w[3]:.1f} {'shards' if c['cracked'] else 'dots'} {n}")
    return report


if __name__ == "__main__":
    sys.exit(main())
