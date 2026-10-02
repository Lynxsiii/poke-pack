#!/usr/bin/env python3
"""Draw the etch maps of the three full-art Black Star promos TCG Live has no map for (holo family bw-full-art).

Darkrai BW73 and Giratina BW74 (Team Plasma box, 2013): photos of a real BW73 show the Next Destinies engraving, fine
whorled lines (a fingerprint) over the whole print, Pokemon included, with vertical rainbow bands crossing them. Landorus BW43
(Forces of Nature Collection, 2012): a hammered pebble grain edge to edge, Pokemon included (photos in /mnt/project-files/holo-remaster/bw-full-art/landorus/), the same bands over it.
No promo carries a stamp, so there is nothing to keep foil off.

Lines: make_card_etch.etch_from (a seeded, band-passed fingerprint steered by the drawing's own edges) redrawn at Live's
native 733 x 1024 with the pitch of its bw4-bw10 engravings (about 6.5 px), then pushed toward the two-level look of
those maps (a soft step, not a mid-tone sheen, so the mask reads as ridges). Pebble: hammered dimples drawn as Voronoi cells with a groove round each (see pebble()).
Output: white with the etch as alpha, assets/foil/fam/bw-full-art/<id>-etch-{V[cid]}.webp.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_promo_etch.py [--preview out.png]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]

OUT = ROOT / "assets" / "foil" / "fam" / "bw-full-art"
W, H = 733, 1024
PITCH = 6.5      # Live's bw4-bw10 engravings
CONTOURS = 3.5   # line periods across the picture's full tonal range: how far the lines follow the drawing
COVER = 0.42     # share of a pitch a line covers (Live's: about half)
V = {"bw9-bwp073": "v1", "bw9-bwp074": "v1", "bw4-bwp043": "v9"}
CARDS = {"bw9-bwp073": ("lines", "assets/cards/bw9/bwp073.webp"),
         "bw9-bwp074": ("lines", "assets/cards/bw9/bwp074.webp"),
         "bw4-bwp043": ("pebble", "assets/cards/bw4/bwp043.webp"),
         }


def lines(cid: str, path: str) -> np.ndarray:
    """Smooth engraved lines at Live's pitch whose phase is a slow ramp plus the drawing's own smoothed luminance, so the
    lines run along the shapes (contours of the picture) and bend round them; thin printed ink stays smooth."""
    rng = np.random.default_rng(int(hashlib.sha1(cid.encode()).hexdigest()[:8], 16))
    scan = Image.open(ROOT / path).convert("RGB").resize((W, H), Image.LANCZOS)
    rgb = np.asarray(scan).astype(np.float32)
    gray = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    sm = ndimage.gaussian_filter(gray, 7) / 255.0
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = rng.uniform(0.5, 1.1)
    warp = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 45)
    warp *= 2.5 / max(float(np.abs(warp).max()), 1e-6)
    phase = (x * np.cos(ang) + y * np.sin(ang)) / PITCH + warp + CONTOURS * sm
    e = 0.5 + 0.5 * np.cos(2 * np.pi * phase)
    e = np.clip((e - (1 - COVER)) * 6.0 + 0.5, 0, 1)  # a line is a ridge of COVER of the pitch, soft edged
    e = ndimage.gaussian_filter(e, 0.5)
    # Printed ink (dark, neutral, thin) stays smooth, as on Live's maps.
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    dark = (gray < 40) & (chroma < 40)
    r = 8
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    fills = ndimage.binary_opening(dark, structure=(xx * xx + yy * yy) <= r * r)
    keep = ndimage.gaussian_filter(ndimage.binary_dilation(dark & ~fills, iterations=1).astype(np.float32), 0.7)
    return e * (1 - keep)


CELL = 4.5    # hammered dimples: a real BW43 dimple is 5-8 px on a 1000 px photo, so about 4-5 px at Live's 733 px
LIGHT = (-0.7071, -0.7071)  # the room's light, from the top left


def pebble(cid: str, path: str) -> np.ndarray:
    """Landorus BW43: a fine hammered grain under smooth broad rainbow bands (the bands, in the sheet, carry the colour). One
    soft dome per jittered Voronoi cell, each of its own size and height, lit from one side: the map is the dome's shading (a
    bright flank facing the light, dark away from it), so the grain only modulates brightness. Earlier tries read as static
    (1-px grain), stained glass (15-px mosaic cells with grooves) and confetti (round dots)."""
    from scipy.spatial import cKDTree
    rng = np.random.default_rng(int(hashlib.sha1(cid.encode()).hexdigest()[:8], 16))
    nx, ny = int(W / CELL) + 3, int(H / CELL) + 3
    pts = []
    for j in range(ny):
        for i in range(nx):
            pts.append(((i - 1 + 0.5 + rng.uniform(-0.45, 0.45) + 0.5 * (j % 2)) * CELL,
                        (j - 1 + 0.5 + rng.uniform(-0.45, 0.45)) * CELL * 0.92))
    pts = np.array(pts, np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    d, idx = cKDTree(pts).query(np.stack([xx.ravel(), yy.ravel()], 1), k=2)
    f1 = d[:, 0].reshape(H, W)
    own = idx[:, 0]
    R = (rng.uniform(0.55, 0.85, len(pts)) * CELL).astype(np.float32)[own].reshape(H, W)
    ht = rng.uniform(0.6, 1.0, len(pts)).astype(np.float32)[own].reshape(H, W)
    u = np.clip(f1 / R, 0, 1)
    h = np.sqrt(1 - u * u) * ht  # a dome, flat-edged where the cell ends
    h = ndimage.gaussian_filter(h, 0.6)
    gy, gx = np.gradient(h)
    shade = -(gx * LIGHT[0] + gy * LIGHT[1])  # > 0 on the flank facing the light
    shade = shade / (np.percentile(np.abs(shade), 99) + 1e-6)
    return np.clip(0.38 + 0.55 * shade, 0, 1).astype(np.float32)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", default="")
    ap.add_argument("--only", default="", help="card ids (comma list); an existing file is never overwritten")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    sheet = []
    for cid, (kind, path) in CARDS.items():
        if only and cid not in only:
            continue
        if not a.preview and (OUT / f"{cid}-etch-{V[cid]}.webp").exists():
            print("kept", cid)
            continue
        e = pebble(cid, path) if kind == "pebble" else lines(cid, path)
        alpha = (e * 255).astype(np.uint8)
        sheet.append(alpha[:400, :400])
        if a.preview:
            continue
        rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
        buf = io.BytesIO()
        Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=80, alpha_quality=80, method=6)
        dest = OUT / f"{cid}-etch-{V[cid]}.webp"
        dest.write_bytes(buf.getvalue())
        print(dest.relative_to(ROOT), len(buf.getvalue()) // 1024, "KB")
    if a.preview:
        Image.fromarray(np.hstack(sheet)).save(a.preview)
    return 0


if __name__ == "__main__":
    sys.exit(main())
