#!/usr/bin/env python3
"""bw-reverse: the shade and flash maps of each type's Energy-symbol pattern (round 5, 2026-10-22).

Draws: assets/foil/fam/bw-reverse/shade-<kind>.webp and flash-<kind>.webp (367x512 lossless WebP, greyscale stored RGB), one pair per tile kind of
       the era (assets/foil/bw-reverse/<kind>.webp: colorless darkness dragon energy energy-plasma fighting fire grass lightning metal plasma psychic
       trainer water).
Why:   the real BW reverses keep the body's printed colour; the Energy-symbol pattern shows as lighter and darker shades OF that colour. Away from the
       light the symbol outlines, veins and rings (WHITE in TCG Live's map = the most mirror-like foil) read DARKER than the body (Excadrill's dark-brown
       fists on orange, Drifblim's dark-purple eyes, Cradily's dark veins, Ferrothorn's dark hatch; refs in /home/user/holo-refs/bw-rev-a and -b), and
       only where the lamp is specular do they flash bright. So the site multiplies a SHADE map onto the body at every pose (white = untouched, the
       pattern's bright strokes darker by K) and, lit, screens a pointer pool times a FLASH map (body A, strokes 1).
How:   relief r = clip((t - p50) / (p98 - p50), 0, 1) ** GAMMA of the tile's body zone (the median body grey goes to 0, the white strokes to 1; plasma's
       tile is a white field with a grey shield, so its relief is the shield: r = clip((250 - t) / 110, 0, 1)). Every black feature of the tile in the
       body zone (the source print's cost discs, its weakness / resistance / retreat discs, divider and flavour-box lines: they are the source print's
       holes, not pattern) is inpainted first (cv2 Telea), so no print shows another print's symbols. shade = 1 - K * r, flash = A + (1 - A) * r. Trainers are the exception: their Poke Balls
       keep the tile's polarity (photo of Caitlin bw10-78), so their relief is what is DARKER than the median.
       Black outside the body zone (the art window, the header, the card edge) stays r = 0: untouched by the shade, base flash (the mask decides
       where the foil is, not this map).
Round 2 (review of 2026-10-22): the strokes were too faint on light and silver bodies (Caitlin's Poke Balls, Lairon's chevrons, Beartic's drops,
       Surskit's veins, Drifblim's eyes) and the bodies were paler than the photos (a reverse body is the ink over foil, which reads deeper than the
       ink over white card away from the light: Drifblim's violet, Wartortle's blue, Lairon's mid grey). Now shade = B - K * r with a per-kind body
       share B (the whole body a little deeper) and a stronger stroke K (BODY below), and the relief's thin lines are thickened by 1 px (grey dilation
       at 0.85) and softened (Gaussian 0.6 px), so a stroke stays one smooth line at phone size instead of breaking into dark specks. With the share
       --bwr-k per type (js/fam/bw-reverse.js: k x the type's light body is about 120 levels) a coloured body is about 15 levels deeper and its strokes
       about 45 below it. Trainers: the Poke Balls' thin bright RINGS darken too (white top-hat of the tile), as on the Caitlin photo, besides the
       darker-than-median halves, and their flash is even (0.8). Metal (WIDE): its prints carry a printed diagonal hatch that chops a thin stroke
       into dashes dark_specks counts as specks (Ferrothorn 185, Lairon 236 at rest), so its strokes are drawn wide (5 px grey dilation, 1 px blur)
       on a lighter body share (B 0.90): 10-24.
Run:   python3 make_shades.py   (prints per kind the black features inpainted and the relief's levels)
"""
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
SRC = ROOT / "assets/foil/bw-reverse"
OUT = ROOT / "assets/foil/fam/bw-reverse"
KINDS = ["colorless", "darkness", "dragon", "energy", "energy-plasma", "fighting", "fire", "grass", "lightning", "metal", "plasma", "psychic", "trainer", "water"]
K = 0.30       # (round 1) shade: the brightest stroke multiplies the body by 1 - K; the median body grey untouched. Darkness keeps it (its shade is inverted).
# Per kind (B, K): the body's multiplier and the stroke's extra darkening, before the type's share --bwr-k. Coloured bodies: B 0.875, K 0.375; silver (Metal,
# Colorless, Energy) a deeper body (the photos' mid-grey Lairon, Braviary); Trainers keep a light body (Caitlin) with their own K for rings and halves.
BODY = {"darkness": (1.0, 0.30), "metal": (0.90, 0.36), "colorless": (0.82, 0.36), "energy": (0.84, 0.36), "trainer": (0.88, 0.34)}
COLOURED = (0.875, 0.375)
WIDE = {"metal"}
A = 0.55       # flash: the body's share of the pointer pool; strokes take all of it
GAMMA = 1.15   # relief curve: the white strokes lead, the soft grey fills follow
Z0, Z1 = 258, 506   # body zone rows of the 367x512 tile (below the art window, above the bottom border)


def black_features(t, level=14, small=None):
    """Black blobs and lines inside the body zone that are the source print's holes: under `level`, not touching the zone's edges (the art window,
    the card border); a solid block over 2500 px^2 (the Special Energy picture box) stays, a thin frame of any size goes (the Trainer rule box).
    `small` (plasma, whose field is white and whose source discs are grey): only components whose box is under small x small or at most 6 px tall."""
    zone = np.zeros(t.shape, bool)
    zone[Z0:Z1, 6:361] = True
    lab, n = ndi.label((t < level) & zone)
    out = np.zeros(t.shape, np.uint8)
    found = 0
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        if ys.start <= Z0 or ys.stop >= Z1 or xs.start <= 6 or xs.stop >= 361:
            continue
        blob = lab[sl] == i
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if small is not None and not ((h < small and w < small) or h <= 6):
            continue
        if blob.sum() > 2500 and blob.sum() > 0.5 * h * w:
            continue
        out[sl][blob] = 255
        if h < 10 and w <= 20 and small is None:  # the black sliver under a half-hidden grey disc (fighting's second-row pair): the whole disc goes
            cy, cx = (ys.start + ys.stop) / 2, (xs.start + xs.stop) / 2
            cv2.circle(out, (int(round(cx)), int(round(cy)) - 5), 11, 255, -1)
        found += 1
    return cv2.dilate(out, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))), found


report = {}
for kind in KINDS:
    t = np.asarray(Image.open(SRC / f"{kind}.webp").convert("L"))
    holes, found = black_features(t, 200, 40) if kind == "plasma" else black_features(t)
    if found:
        t = cv2.inpaint(np.ascontiguousarray(t), holes, 5, cv2.INPAINT_TELEA)
    tf = t.astype(np.float32)
    body = tf[Z0 + 20:Z1 - 10, 20:347]
    body = body[body > 14]
    if kind == "plasma":
        r = np.clip((250.0 - tf) / 110.0, 0, 1)
        r[t < 14] = 0
        lo = hi = None
    elif kind == "trainer":
        # Poke Balls keep the tile's own polarity (Caitlin bw10-78: the balls' upper halves and centre bands are the DARK parts, the lower halves light):
        # only what is darker than the median body grey shades.
        lo, hi = float(np.percentile(body, 50)), float(np.percentile(body, 3))
        r = np.clip((lo - tf) / max(lo - hi, 1.0), 0, 1)
        r[t < 14] = 0
        # ...and the balls' thin bright rings (outer ring, centre band, button ring), which read as mid-grey outlines on the photo: a white top-hat (5 px).
        ring = tf - ndi.grey_opening(tf, size=(5, 5))
        r = np.maximum(r, np.clip((ring - 10.0) / 24.0, 0, 1))
        r[t < 14] = 0
        r[:Z0] = 0  # above the body the trainer tile carries the source print's header and name bar (dark bars), not Poke Balls
    else:
        lo, hi = float(np.percentile(body, 50)), float(np.percentile(body, 98))
        r = np.clip((tf - lo) / max(hi - lo, 1.0), 0, 1)
    r = r ** GAMMA
    # Thin lines thickened by 1 px at 0.85 and softened, so a stroke is one smooth line at phone size (no breaks that read as dark specks).
    r = ndi.gaussian_filter(np.maximum(r, 0.85 * ndi.grey_dilation(r, size=(3, 3))), 0.6)
    if kind in WIDE:
        # Metal prints carry a printed diagonal hatch over the body (Ferrothorn, Lairon, Durant): it chops a thin stroke into short dashes that read as
        # dark specks. Their strokes are drawn wider (5 px grey dilation, softened 1 px), so a stroke is a broad band the hatch cannot break up.
        r = ndi.gaussian_filter(np.maximum(r, 0.9 * ndi.grey_dilation(r, size=(5, 5))), 1.0)
    b, k = BODY.get(kind, COLOURED)
    # The body share applies to the whole card (name bar and frame strip too, as on the photos); each print's mask decides where the foil is.
    shade = np.round(255 * np.clip(b - k * r, 0, 1)).astype(np.uint8)
    # Trainers: the Poke Balls stay mid-grey outlines in the light too (Caitlin's scan, lamp-lit all over), so their flash is even (0.8), not the strokes.
    flash = np.round(255 * (np.full_like(r, 0.8) if kind == "trainer" else A + (1 - A) * r)).astype(np.uint8)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, arr in (("shade", shade), ("flash", flash)):
        Image.fromarray(arr, "L").convert("RGB").save(OUT / f"{name}-{kind}.webp", lossless=True, quality=60, method=4)
    report[kind] = {"inpainted": found, "p50": lo, "p98": hi, "B": b, "K": k, "relief_mean_body": round(float(r[Z0:Z1, 20:347].mean()), 3)}
print(json.dumps(report, indent=1))
