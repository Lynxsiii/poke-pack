#!/usr/bin/env python3
"""Foil masks for the Diamond & Pearl generation Mirror reverse (family dp-reverse).

What it draws: one mask per frame x layout, 600x838 like the site's scans, white where the real reverse card is
foil, transparent where it is matte. On a real DP, Platinum, HGSS or Call of Legends reverse (refs in
/mnt/project-files/holo-remaster/dp-reverse/refs/) the foil is everything inside the yellow border except the
picture: the art window, the evolution circle's little picture on Stage cards, the big picture of a Special
Energy. The yellow border is matte too.

From what: the site's own scans, so the masks sit where the site's pictures sit (the dp-win masks of the last pass
were drawn from another scan source and miss by 3-8 px). For every frame (dp: dp1-dp7 and pl1-pl4; hgss: hgss1-4
and col1) and layout (basic, stage, trainer, senergy, energy, as dpLayout() in js/dp-foil.js files them) it averages
every dealt card's scan and takes the per-pixel spread (std). The frame is printed the same on every card of a
layout, the pictures differ, so the picture areas are the high-spread regions; each is flood-filled from a seed
inside it and stops at the window's frame line, which every card shares (low spread). The border is a rounded
rectangle just inside the measured inner edge of the yellow border (DP about 11 px wide, HGSS about 24 px).

The DP-frame scans are registered to about +-3 px (HGSS to +-1 px), so the matte holes are grown by GROW px and
every edge gets a FEATHER px soft ramp: the foil never reaches the picture of a card that sits a little off.

Deterministic (no randomness). Re-run: python3 make_masks.py [--out DIR] [--preview DIR] [--only dp-sp,...]
Default output: assets/foil/fam/dp-reverse/<frame>-<layout>.webp (lossless, white RGB + alpha).
LIVE MASKS ARE IMMUTABLE (cached a year by the site): dp-basic, dp-senergy, dp-stage, dp-trainer, hgss-basic,
hgss-energy, hgss-senergy, hgss-stage, hgss-trainer. Never rewrite them: pass --only <name> so just that file is
written, and give a changed mask a new name (-v2).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
SETS = {
    "dp": ["dp1", "dp2", "dp3", "dp4", "dp5", "dp6", "dp7", "pl1", "pl2", "pl3", "pl4"],
    "hgss": ["hgss1", "hgss2", "hgss3", "hgss4", "col1"],
}
DEALT = {"Common", "Uncommon", "Rare", "Rare Holo"}
W, H = 600, 838

# Inner edge of the yellow border (left, top, right, bottom) and its corner radius, in scan px. The mean scans put
# it at 11.5 / 9.5 / 589.5 / 827.5 (DP) and 23.5 / 23.5 / 575.5 / 813.5 (HGSS); single DP scans scatter +-2 px round
# that, so the foil starts 2 px inside it (1 px for HGSS) and never paints the yellow of a card that sits off.
BORDER = {"dp": (13.5, 11.5, 587.5, 825.5, 14.0), "hgss": (24.5, 24.5, 574.5, 812.5, 12.0)}
# Seeds inside each picture area (x, y): the art window, a Special Energy's picture.
SEEDS = {
    "basic": [(300, 250)],
    "stage": [(300, 250)],
    "trainer": [(300, 260)],
    "senergy": [(300, 300)],
    "energy": [],
    "sp": [(300, 250)],
}
# The evolution circle's picture disc on Stage cards (centre x, y, radius to the inside of its ring), fitted on the
# mean scans: the ring is the strongest circular edge, the grey disc inside it ends 4 px before the ring's peak. Its
# picture varies too little card to card for the spread test, so it is drawn as a circle.
CIRCLE = {"dp": (68.0, 103.0, 34.5), "hgss": (60.0, 54.0, 32.5)}
# A DP-frame Special Energy's picture runs from border to border between the ENERGY bar and the text box title
# (rows 69.5 and 582.5, the two strongest steps of its mean scan); the pictures share too much of their swirl for
# the spread test, so it is a rectangle.
# A DP-frame Trainer's window has a dark rule round it whose outer edge sits at x 45-56 / 546-555 and y 112-122 /
# 401-423 across the 123 scans (measured per card): the rectangle covers the outermost, so no picture is foiled.
# Each entry: (x0, y0, x1, y1, grow).
RECT = {("dp", "senergy"): (11.5, 69.5, 589.5, 582.5, 3.0), ("dp", "trainer"): (45.5, 111.5, 555.5, 421.5, 0.5)}
# A Pokemon SP frame's owner portrait (Platinum G, GL, E4, FB, C, M, 4): a gold-rimmed bowl at the lower right of the art
# window, with the owner's head and hair spilling up over the window, all part of the picture (matte on the real card;
# review #1 found foil on the face). Measured on the mean and spread images of the 81 dealt SP scans (the bowl is at x 462-576,
# y 395-472; the heads reach y 330-350): two ellipses (centre x, centre y, radius x, radius y) in mask px, the bowl and the
# head, punched out like the other picture holes (same GROW and FEATHER). Pixel coordinates of the 600 x 838 mask.
PORTRAIT = {"sp": [(519.0, 430.0, 64.0, 50.0), (522.0, 376.0, 52.0, 52.0)]}
# Call of Legends' Energy (col1 88-95, the Crosshatch, layout "energy" in the hgss frame): the whole face inside the border is foil
# EXCEPT the opaque white ENERGY title bar (CE101 PSA 10 photos: no lattice on the white; the dark letters and the type disc on it
# carry glints). The bar's white fill is identical on all 8 scans (mean min-channel above 205, spread under 22), the letters and the
# disc are not white, so they stay foil. Box (x0, y0, x1, y1) in mask px. The mask is written as hgss-energy-v2.webp:
# hgss-energy.webp (the whole face) is live and immutable.
ENERGY_BAR = (28.0, 28.0, 572.0, 78.0)
NAMES = {("hgss", "energy"): "hgss-energy-v2"}
# Shipped masks: cached for a year, never rewritten (a change gets a new name).
LIVE = {"dp-basic", "dp-senergy", "dp-stage", "dp-trainer", "hgss-basic", "hgss-energy", "hgss-senergy", "hgss-stage", "hgss-trainer"}
# Spread threshold per frame: picture pixels vary more than this between cards. HGSS frames are near identical
# card to card (spread 1-10), DP frames take the type colour (spread up to ~55), so DP needs a higher bar.
THRESH = {"dp": 58.0, "hgss": 30.0}
GROW = {"dp": 3.0, "hgss": 1.5}
FEATHER = 1.6


def layout_of(card):
    """dpLayout() from js/dp-foil.js, in Python, plus "sp": a Pokemon SP (Platinum's G, GL, E4, FB, C, M, 4) has its
    own frame, the picture running under the name bar between the SP logo and the owner's portrait, so it gets its
    own mask (the module adds the class dpr-sp for it)."""
    subs = card.get("subtypes") or []
    if "SP" in subs:
        return "sp"
    if card.get("supertype") == "Trainer":
        return "trainer"
    if card.get("supertype") == "Energy" or card.get("energy"):
        return "senergy" if "Special" in subs else "energy"
    if "Stage 1" in subs or "Stage 2" in subs or card.get("evolvesFrom"):
        return "stage"
    return "basic"


def dealt_scans(frame):
    groups = {}
    for s in SETS[frame]:
        with open(os.path.join(ROOT, "data", f"{s}.json")) as fh:
            cards = json.load(fh)
        for c in cards:
            ok = (c.get("rarity") in DEALT and not c.get("promo")) or (c.get("reverse") and c.get("rarity") == "Energy")
            if not ok:
                continue
            p = os.path.join(ROOT, c["image"])
            if os.path.exists(p):
                groups.setdefault(layout_of(c), []).append(p)
    return groups


def spread(paths):
    acc = None
    acc2 = None
    n = 0
    for p in paths:
        a = np.asarray(Image.open(p).convert("RGB").resize((W, H), Image.LANCZOS), dtype=np.float64)
        acc = a if acc is None else acc + a
        acc2 = a * a if acc2 is None else acc2 + a * a
        n += 1
    mean = acc / n
    var = np.maximum(acc2 / n - mean * mean, 0)
    return mean, np.sqrt(var).mean(-1)


def round_rect(x0, y0, x1, y1, r, ss=4):
    """Antialiased rounded rectangle coverage (1 inside) by supersampling."""
    ys = (np.arange(H * ss) + 0.5) / ss
    xs = (np.arange(W * ss) + 0.5) / ss
    X, Y = np.meshgrid(xs, ys)
    cx = np.clip(X, x0 + r, x1 - r)
    cy = np.clip(Y, y0 + r, y1 - r)
    inside = ((X - cx) ** 2 + (Y - cy) ** 2 <= r * r) & (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
    return inside.reshape(H, ss, W, ss).mean((1, 3))


def picture_holes(std, frame, layout):
    """Union of the flood-filled picture regions (1 = picture)."""
    if (frame, layout) in RECT:
        x0, y0, x1, y1, _ = RECT[(frame, layout)]
        yy, xx = np.mgrid[0:H, 0:W]
        return (xx + 0.5 >= x0) & (xx + 0.5 <= x1) & (yy + 0.5 >= y0) & (yy + 0.5 <= y1)
    hi = std > THRESH[frame]
    hi = ndi.binary_opening(hi, iterations=1)
    lab, _ = ndi.label(hi)
    holes = np.zeros_like(hi)
    for (sx, sy) in SEEDS[layout]:
        k = lab[sy, sx]
        if k == 0:
            raise SystemExit(f"{frame}-{layout}: seed {(sx, sy)} is not in a high-spread region")
        holes |= lab == k
    holes = ndi.binary_fill_holes(ndi.binary_closing(holes, iterations=3))
    if layout == "stage":
        cx, cy, r = CIRCLE[frame]
        yy, xx = np.mgrid[0:H, 0:W]
        holes |= (xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r
    return holes


def soft(binary, grow):
    """Signed distance ramp: 1 inside the grown region, 0 beyond it, a FEATHER px ramp between."""
    if not binary.any():
        return np.zeros(binary.shape)
    d_out = ndi.distance_transform_edt(~binary)
    d_in = ndi.distance_transform_edt(binary)
    sd = np.where(binary, -d_in, d_out) - grow  # <0 inside the grown region
    return np.clip(0.5 - sd / FEATHER, 0, 1)


def energy_bar_hole(mean, std):
    """The white fill of the ENERGY title bar (1 = opaque white, no foil)."""
    x0, y0, x1, y1 = ENERGY_BAR
    yy, xx = np.mgrid[0:H, 0:W]
    box = (xx + 0.5 >= x0) & (xx + 0.5 <= x1) & (yy + 0.5 >= y0) & (yy + 0.5 <= y1)
    white = (mean.min(-1) > 205) & (std < 22) & box
    white = ndi.binary_closing(ndi.binary_opening(white, iterations=1), iterations=2) & box
    return white


def build(frame, layout, std, mean=None):
    x0, y0, x1, y1, r = BORDER[frame]
    inside = round_rect(x0, y0, x1, y1, r)
    if SEEDS[layout]:
        grow = RECT[(frame, layout)][4] if (frame, layout) in RECT else GROW[frame]
        holes = soft(picture_holes(std, frame, layout), grow)
    else:
        holes = np.zeros((H, W))
    out = inside * (1 - holes)
    if layout == "energy" and (frame, layout) in NAMES and mean is not None:
        out = out * (1 - soft(energy_bar_hole(mean, std), 1.0))
    if layout in PORTRAIT:
        yy, xx = np.mgrid[0:H, 0:W]
        disc = np.zeros((H, W), bool)
        for cx, cy, rx, ry in PORTRAIT[layout]:
            disc |= ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1.0
        out = out * (1 - soft(disc, GROW[frame]))
    return np.clip(out, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/fam/dp-reverse"))
    ap.add_argument("--preview", default="")
    ap.add_argument("--allow-live", action="store_true", help="also write the live masks (only into a scratch --out)")
    ap.add_argument("--only", default="", help="comma list of <frame>-<layout> names to write (default: all)")
    args = ap.parse_args()
    only = {n for n in args.only.split(",") if n}
    os.makedirs(args.out, exist_ok=True)
    for frame in ("dp", "hgss"):
        groups = dealt_scans(frame)
        for layout in ("basic", "stage", "trainer", "senergy", "energy", "sp"):
            paths = groups.get(layout)
            if not paths:
                continue
            name = NAMES.get((frame, layout), f"{frame}-{layout}")
            if only and name not in only:
                continue
            if name in LIVE and not args.allow_live:
                print(f"skip {name}: a live mask is immutable (pass --allow-live to a scratch --out to preview it)")
                continue
            mean, std = spread(paths)
            m = build(frame, layout, std, mean)
            a = (m * 255 + 0.5).astype(np.uint8)
            rgba = np.dstack([np.full((H, W, 3), 255, np.uint8), a])
            out = os.path.join(args.out, f"{name}.webp")
            Image.fromarray(rgba, "RGBA").save(out, lossless=True, quality=100, method=6)
            print(out, len(paths), "cards", f"foil {m.mean() * 100:.1f}% of the face", os.path.getsize(out), "bytes")
            if args.preview:
                os.makedirs(args.preview, exist_ok=True)
                prev = mean.copy()
                prev[..., 0] = prev[..., 0] * (1 - 0.55 * m) + 255 * 0.55 * m
                Image.fromarray(np.clip(prev, 0, 255).astype(np.uint8)).save(
                    os.path.join(args.preview, f"prev-{name}.png"))
    # A frame x layout the dealt cards never use (a DP basic Energy shown as reverse in the lab) falls back to the
    # basic mask in the CSS, so nothing else is written.


if __name__ == "__main__":
    main()
