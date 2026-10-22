#!/usr/bin/env python3
"""bw-reverse: every claimed print's mask redrawn as <number>-v3.webp (2026-10-22 audits bw-rev-a and bw-rev-b, review round 1).

Draws: assets/foil/fam/bw-reverse/<set>/<number>-v3.webp (367x512 lossless WebP, white with alpha) for every print js/fam/bw-reverse.js claims (MASKS), from
       its shipped mask <number>.webp (make_masks.py / make_masks_bw6.py: TCG Live's map, eroded, the text zone's dark ink cut) and its own scan. The module
       points every print at -v3; the shipped <number>.webp files are left as they are (assets are cached as immutable, so a changed map needs a new name).
Why:   (1) the sheen lights the foil with a pointer pool and a narrow coloured streak (screen, css/holo/fam/bw-reverse.css), and the shipped masks cut the ink
       only in the text zone (rows 266-476 of 512): the name, the HP, "Evolves from", the weakness/resistance labels and the illustrator line sat under the
       foil, so the streak tinted the black HP digits green. The real card's ink is printed over the foil and never takes its colour.
       (2) the shipped dark-ink cut took the scan's GRAIN for ink: darker grain spots on a mid body (Fighting's copper, some Metal and Water, every Dragon's
       olive) were punched out as holes of a few pixels (a 1 px seed dilated to a '+'). They stay matte while the lit body around them is screened
       brighter, so they read as dirt (bw2-56 Excadrill: a cluster of 10 above "30" of Metal Claw; the same cluster sits on 97 of 98 Fighting prints).
       (3) a Dragon reverse prints WHITE text on an olive body (text-zone median luminance about 104): its white letters must be cut, and a dilated cut
       left a matte rim round each letter that read dark inside the lit hot spot (bw6-84 Altaria, bw7-98 Vibrava at 75:65).
How:   all prints but near-black bodies (text-zone median under 75: Darkness, white text, as make_masks.py): the DARK ink outside the text zone is cut the
       way make_masks.py cuts it inside (darker than 110 and more than 40 in RGB distance from the 11 px median of the scan; components of 6 px^2 or more,
       so lone grain pixels stay; dilated 1 px; alpha 0).
       Every print: each hole of 24 px^2 or less in the text zone, and each grain spur hanging off the Pokedex bar into the zone (bar_spurs), is
       checked against the FULL-SIZE scan (600x838; real ink is printed black and its darkest pixel there is under 45 of 255, grain's is 55-110): one
       whose darkest scan pixel is 50 or lighter, and not red ink (the Ability names), is filled.
       Dragon prints (white text on olive): every text-zone hole of 40 px^2 or less is filled, and so is every text-zone hole that is 80% or more olive
       body or white letter (the shipped cut's word-shaped blobs round the white words, which read as dark rims when lit); the cost circles, the
       Ability badge and the red names are not and stay cut. That mask, with its small (400 px^2 or less) holes that are 70% or more olive filled
       too, is written as <number>-v3g.webp for the GLARE (a screen leaves white ink white; a cut letter's soft edge, the mask being drawn 1.8x
       larger at phone size, stayed half-lit inside the hot spot and read as a dark rim). Then the foil mask cuts the LIGHT ink: lighter than 165
       and more than 50 from the median, components of 12 px^2 or more (5 or more when one pixel is lighter than 190: an i, a comma), not dilated.
Run:   python3 make_masks_v3.py   (prints a summary: prints written, holes filled per type, small holes left)
"""
import json, re
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets/foil/fam/bw-reverse"
Z0, Z1 = 266, 476
SMALL = 24      # a hole up to this many px^2 (of 367x512) is checked against the full-size scan
INK = 50        # real ink's darkest full-size pixel is under this; grain's is not
SPUR_INK = 60   # the same for a spur off the Pokedex bar, tested pixel by pixel


def bar_spurs(a):
    """The grain spurs hanging off the bottom of the Pokedex bar (and the frame cuts above the text zone) into the zone's top rows: the shipped cut's
    grain holes there touch the bar's own hole, so they are not small holes of their own (bw2-56 Excadrill: two marks under "WT: 89.1 lbs."; bw8-76
    Riolu: two '+' spurs at rows 269-275, cols 277-296, on 95 Fighting-heavy prints, review round 2). A spur is what a 5 px opening takes off a hole
    that reaches above the zone: an 8-connected piece of 3-80 px^2 that ends by row 292 (a printed line that runs on down the zone is longer and stays).
    Each is returned as its own label for the darkest-pixel test (grain_holes)."""
    hole = a < 0.5
    lab, k = ndi.label(hole)
    above = np.unique(lab[: Z0][lab[: Z0] > 0])
    big = np.isin(lab, above)
    core = ndi.binary_opening(big, structure=np.ones((5, 5), bool))
    spur = big & ~core
    spur[:Z0] = False
    sl, ks = ndi.label(spur, structure=np.ones((3, 3), bool))
    keep = np.zeros(a.shape, np.int32)
    n = 0
    for i, box in enumerate(ndi.find_objects(sl), 1):
        m = sl[box] == i
        if box[0].stop > 292 or not 3 <= m.sum() <= 80:
            continue
        n += 1
        keep[box][m] = n
    return keep, n


def red_ink(full, fl, sl, H, W):
    """Whether the darkest full-size pixel in a hole's box is red ink (the Ability names), not Fighting's copper grain (160, 70, 10)."""
    fy0, fy1 = int(sl[0].start * H / 512), int(np.ceil(sl[0].stop * H / 512))
    fx0, fx1 = int(sl[1].start * W / 367), int(np.ceil(sl[1].stop * W / 367))
    reg, regl = full[fy0:fy1, fx0:fx1], fl[fy0:fy1, fx0:fx1]
    d = reg[np.unravel_index(np.argmin(regl), regl.shape)]
    return bool(d[0] > 150 and d[1] < 50 and d[0] - d[1] > 110)


def grain_holes(a, zone, full, maxsz, always=False, spur=True):
    """Labels of the text zone's holes of `maxsz` px^2 or less whose full-size scan holds no ink-dark (or red-ink) pixel (`always`: every one), and the
    same test on the grain spurs under the Pokedex bar (bar_spurs)."""
    lab, k = ndi.label((a < 0.5) & zone)
    spurs, ks = bar_spurs(a) if spur else (np.zeros(a.shape, np.int32), 0)
    lab = np.where(spurs > 0, spurs + k, lab)
    H, W = full.shape[:2]
    fl = 0.2126 * full[..., 0] + 0.7152 * full[..., 1] + 0.0722 * full[..., 2]
    fill = np.zeros(a.shape, bool)
    n = 0
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        m = lab[sl] == i
        if i > k:
            # A spur (round 3): the darkest full-size pixel under its OWN pixels (its box takes in the bar's dark edge), 60 or lighter and not red:
            # the Fighting spurs' is 77-97, the Trainer rule's anti-aliased corner 50-55 (kept).
            ys, xs = np.nonzero(m)
            ys, xs = ys + sl[0].start, xs + sl[1].start
            low = min(fl[int(y * H / 512):int(np.ceil((y + 1) * H / 512)), int(x * W / 367):int(np.ceil((x + 1) * W / 367))].min() for y, x in zip(ys, xs))
            if low >= SPUR_INK and not red_ink(full, fl, sl, H, W):
                fill[sl][m] = True
                n += 1
            continue
        if m.sum() > maxsz:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        fy0, fy1 = int(y0 * H / 512), int(np.ceil(y1 * H / 512))
        fx0, fx1 = int(x0 * W / 367), int(np.ceil(x1 * W / 367))
        reg, regl = full[fy0:fy1, fx0:fx1], fl[fy0:fy1, fx0:fx1]
        if regl.size == 0:
            continue
        j = np.unravel_index(np.argmin(regl), regl.shape)
        darkest = reg[j]
        red = darkest[0] > 150 and darkest[1] < 50 and darkest[0] - darkest[1] > 110  # red ink (Ability names), not Fighting's copper grain (160, 70, 10)
        if always or (regl.min() >= INK and not red):
            fill[sl][m] = True
            n += 1
    return fill, n


js = (ROOT / "js/fam/bw-reverse.js").read_text()
masks = {s: n.split() for s, n in re.findall(r'(bw\d+): "([\d ]+)"', js)}
listing, filled, left = {}, {}, {}
for s, nums in masks.items():
    data = {str(c["number"]): c for c in json.loads((ROOT / f"data/{s}.json").read_text())}
    for n in nums:
        c = data[n]
        kind = c.get("supertype") if c.get("supertype") in ("Trainer", "Energy") else (c.get("types") or ["?"])[0]
        dragon = kind == "Dragon"
        rgba = np.array(Image.open(OUT / s / f"{n}.webp").convert("RGBA"))
        a = rgba[..., 3].astype(np.float32) / 255.0
        zone = np.zeros(a.shape, bool)
        zone[Z0:Z1] = True
        img = Image.open(ROOT / c["image"]).convert("RGB")
        full = np.asarray(img).astype(np.float32)
        scan = np.asarray(img.resize((367, 512), Image.LANCZOS))
        sf = scan.astype(np.float32)
        lum = 0.2126 * sf[..., 0] + 0.7152 * sf[..., 1] + 0.0722 * sf[..., 2]
        bg = cv2.medianBlur(np.ascontiguousarray(scan), 11).astype(np.float32)
        dist = np.sqrt(((sf - bg) ** 2).sum(-1))
        if np.median(lum[Z0:Z1]) >= 75:
            dark = (dist > 40) & (lum < 110) & ~zone
            labd, kd = ndi.label(dark)
            sized = ndi.sum(np.ones_like(labd), labd, range(1, kd + 1))
            dark = ndi.binary_dilation(np.isin(labd, [i + 1 for i, z in enumerate(sized) if z >= 6]), iterations=1)
            a = np.where(dark, 0.0, a)
        # Metal prints keep their bar spurs: a printed hatch line starts at the bar there (Ferrothorn, Klink).
        fill, nf = grain_holes(a, zone, full, 40, always=True) if dragon else grain_holes(a, zone, full, SMALL, spur=kind != "Metal")
        a = np.where(fill, 1.0, a)
        if dragon:
            # The shipped dark-ink cut also punched whole WORD-shaped blobs of olive body round the white letters (the 11 px median there is lifted
            # by the letters, so the olive itself passed for ink): they stayed matte round every word and read as dark rims when lit. A text-zone
            # hole whose pixels are 80% or more olive body (within 60 of the zone's body colour) or white letter is filled whole; the cost circles,
            # the Ability badge and the red names are not and stay cut. The white letters are cut again just below.
            body = np.median(sf[zone & (a > 0.5)], axis=0)
            olive = (np.sqrt(((sf - body) ** 2).sum(-1)) < 60) | ((lum > 165) & (sf.max(-1) - sf.min(-1) < 60))
            labw, kw = ndi.label((a < 0.5) & zone)
            share = ndi.mean(olive.astype(np.float32), labw, range(1, kw + 1))
            words = np.isin(labw, [i + 1 for i, f in enumerate(share) if f >= 0.8])
            a = np.where(words, 1.0, a)
            # The GLARE's mask (<number>-v3g.webp): this one, before the white letters are cut. A screen leaves white ink white, and a cut letter's
            # soft edge (the 367 px mask is drawn 1.8x larger at phone size) stayed half-lit inside the hot spot: a dark rim round every letter.
            # The glare's mask also fills the smaller holes (400 px^2 or less) that are 70% or more olive or white: a word whose blob took in a darker
            # grain spot ("Weakness" on Altaria), and the small symbols with their 2 px olive margin (a screen over them only lightens them in the hot
            # spot, as the gloss does on the photos). The Ability badge, the cost circles and the red names stay cut.
            fillg = np.isin(labw, [i + 1 for i, f in enumerate(share) if f >= 0.7]) & ~words
            lg, kg = ndi.label(fillg)
            szg = ndi.sum(np.ones_like(lg), lg, range(1, kg + 1))
            fillg = np.isin(lg, [i + 1 for i, z in enumerate(szg) if z <= 400])
            g = rgba.copy()
            g[..., :3] = 255
            g[..., 3] = np.round(np.where(fillg, 1.0, a) * 255).astype(np.uint8)
            Image.fromarray(g, "RGBA").save(OUT / s / f"{n}-v3g.webp", lossless=True, quality=60, method=1, exact=True)
            ink = (dist > 50) & (lum > 165) & zone
            lab2, k2 = ndi.label(ink)
            sizes2 = ndi.sum(np.ones_like(lab2), lab2, range(1, k2 + 1))
            peak2 = ndi.maximum(lum, lab2, range(1, k2 + 1))
            ink = np.isin(lab2, [i + 1 for i, (z, pk) in enumerate(zip(sizes2, peak2)) if z >= 12 or (z >= 5 and pk > 190)])
            a = np.where(ink, 0.0, a)
        rgba[..., :3] = 255
        rgba[..., 3] = np.round(a * 255).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(OUT / s / f"{n}-v3.webp", lossless=True, quality=60, method=1, exact=True)
        lab3, k3 = ndi.label((a < 0.5) & zone)
        sizes3 = ndi.sum(np.ones_like(lab3), lab3, range(1, k3 + 1))
        filled[kind] = filled.get(kind, 0) + nf
        left.setdefault(kind, []).append(int(sum(1 for z in sizes3 if z <= 12)))
        listing.setdefault(s, []).append(int(n))
print(json.dumps({"written": {s: len(ns) for s, ns in listing.items()}, "total": sum(len(ns) for ns in listing.values()),
                  "holes_filled": filled,
                  "small_holes_left_per_print": {k: {"max": max(v), "mean": round(sum(v) / len(v), 1)} for k, v in left.items()}}, indent=1))
