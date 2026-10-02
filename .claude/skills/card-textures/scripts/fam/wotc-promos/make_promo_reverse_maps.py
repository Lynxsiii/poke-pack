#!/usr/bin/env python3
"""Holo family wotc-promos: the reverse-holo promos (basep 34, 35; bp 1, 2, 3, 8, 9) with the printed text cut out of the foil.

Run from the repo root:  python3 .claude/skills/card-textures/scripts/fam/wotc-promos/make_promo_reverse_maps.py [--only id,id] [--check DIR]

Uses make_promo_maps.py (same folder) for the card face (inside the yellow border, minus the art window with its bevel, the
banner and every large gold block) and adds the one thing that file does not: the printed lettering is cut out of the foil, so
a lit layer can never sit on a letter. Writes 600x838 RGBA WebP masks (white, mask in alpha, lossless) into
assets/foil/fam/wotc-promos/:

  rvfield-<id>-v1.webp  face minus lettering: black ink (name, HP digits, rules text, attack lines, damage, rule lines: pixels
                        under 62 percent of their 21 px median, grown 1 px by a 3 px disc), plus saturated colour ink (red HP,
                        Energy symbols, resistance and weakness icons), plus the Winner lettering on bp 8 and 9.
  rvdots-<id>-v1.webp   the scan's own stars (make_promo_maps.dots with its text guard), kept inside rvfield.
  rvstamp-<id>-v1.webp  Winner stamp (bp 8, 9): the word and its star, the dark strokes of the scan inside the stamp box.

Deterministic, no random numbers. --check DIR writes overlays (<id>-rv-check.png).
"""
import argparse
import os
import sys

import cv2
import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(__file__))
import make_promo_maps as m  # noqa: E402

# the Trainer card's picture runs to x 554 (make_promo_maps.py's prior stops at 503)
m.REV["bp-bp03"]["win"] = (57, 193, 553, 469)

IDS = ["basep-basep34", "basep-basep35", "bp-bp01", "bp-bp02", "bp-bp03", "bp-bp08", "bp-bp09"]


def black_ink(rgb):
    """Printed black ink. Strong ink (under 62 percent of the 21 px median) cuts at 1 px; the small rules-text lines are only
    a little darker than the foil, so a lenient read (under 74 percent) of 10+ px strokes is cut 2 px wide as well."""
    v = rgb.max(axis=2).astype(np.uint8)
    med = cv2.medianBlur(v, 21).astype(np.float32)
    vf = v.astype(np.float32)

    def comps(ink, mn):
        cc, n = ndi.label(ink)  # letters are connected strokes; the dark gaps between a star's rays are a pixel or two
        if not n:
            return ink
        sz = ndi.sum(ink, cc, range(1, n + 1))
        return np.isin(cc, 1 + np.where(sz >= mn)[0])

    strong = comps((vf < 0.62 * med) & (med > 35), 14)
    soft = comps((vf < 0.74 * med) & (med > 32), 12)
    soft = cv2.dilate(soft.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) > 0
    return strong | soft


def colour_ink(rgb, body):
    """Saturated, bright coloured print (red HP and damage, type symbols); the star dust of the scan is paler or small."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    c = (hsv[..., 1] > 130) & (hsv[..., 2] > 120) & body
    c = cv2.morphologyEx(c.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) > 0
    cc, n = ndi.label(c)
    if n:
        sz = ndi.sum(c, cc, range(1, n + 1))
        c = np.isin(cc, 1 + np.where(sz >= 60)[0])
    return c


def winner_strokes(cid, rgb):
    """The Winner lettering and its star: the scan reads the gold foil as near-black strokes (max channel under 90; the picture
    behind is 140+), inside the stamp box make_promo_maps.WINNER names, specks under 5 px dropped, grown 1 px."""
    x0, y0, x1, y1 = {"bp-bp08": (404, 318, 534, 353)}.get(cid, m.WINNER[cid])  # bp 8: inside the shadow's and frame's reach
    v = rgb.max(axis=2)
    dark = (v < {"bp-bp08": 52}.get(cid, 90)) & m.box(x0, y0, x1, y1)
    if cid == "bp-bp08":
        dark[:329, :430] = False  # Mewtwo's shadow reaches the top of the "w"; the star sits right of this corner
    cc, n = ndi.label(dark)
    if n:
        sz = ndi.sum(dark, cc, range(1, n + 1))
        dark = np.isin(cc, 1 + np.where(sz >= 5)[0])
    return ndi.binary_dilation(dark, iterations=1)


def build(cid):
    rgb, alpha = m.load(cid)
    body, tint, win, blocks, mh = m.rev_maps(cid, rgb, alpha)
    ink = black_ink(rgb) & body
    if cid != "bp-bp03":  # the Trainer card prints no colour; its coloured specks are baked stars
        ink |= colour_ink(rgb, body)
    ink = cv2.dilate(ink.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) > 0
    field = body & ~ink
    # drop specks of foil the cut leaves between letters
    cc, n = ndi.label(field)
    if n:
        sz = ndi.sum(field, cc, range(1, n + 1))
        field = np.isin(cc, 1 + np.where(sz >= 6)[0])
    stamp = None
    if cid in m.WINNER:
        stamp = winner_strokes(cid, rgb)
        field &= ~cv2.dilate(stamp.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))).astype(bool)
    d = m.dots(rgb, field, text_guard=True)
    return rgb, alpha, body, field, d, stamp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--check", default="")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    if a.check:
        os.makedirs(a.check, exist_ok=True)
    for cid in IDS:
        if only and cid not in only:
            continue
        rgb, alpha, body, field, d, stamp = build(cid)
        m.save(f"rvfield-{cid}-v1.webp", m.feather(field))
        m.save(f"rvdots-{cid}-v1.webp", d)
        if stamp is not None:
            m.save(f"rvstamp-{cid}-v1.webp", m.feather(stamp))
        print(f"{cid}: body {int(body.sum())} px, field {int(field.sum())} px ({100 * field.sum() / body.sum():.0f}% of the body), "
              f"dots mean {d[field].mean():.3f}" + (f", stamp {int(stamp.sum())} px" if stamp is not None else ""))
        if a.check:
            lay = [(~field & (alpha > 128), (255, 0, 0), 0.5), (d, (0, 255, 0), 0.9)]
            if stamp is not None:
                lay.append((stamp, (255, 200, 0), 0.9))
            m.overlay(rgb, lay, os.path.join(a.check, f"{cid}-rv-check.png"))


if __name__ == "__main__":
    sys.exit(main())
