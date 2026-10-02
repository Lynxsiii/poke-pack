#!/usr/bin/env python3
"""make_tr_maps.py: the foil maps of Team Rocket's holo faces (base5 1-17 and the secret Dark Raichu 83).

Family wotc-team-rocket (older-era holo remaster, 2026-10-02; research in /mnt/project-files/holo-remaster/wotc-team-rocket/).
A Team Rocket Rare Holo is ink over the 1999 Starlight holofoil (the same foil as Base Set, Jungle and Fossil): the art window's
BACKGROUND is translucent ink over the foil, so it lights up silver and rainbow under a lamp, with glitter and the card's own
cosmos dots and stars; the Dark Pokemon (Jessie and James on the two Trainers, the printed orb on Rainbow Energy) is printed over
an opaque white underlay and stays matte, and so do the frame, the text and the stage badge. Here Comes Team Rocket! has foil
only in a few dark patches; Rainbow Energy's foil is the whole picture less the orb. The same maps as Fossil's:

  assets/foil/fam/wotc-team-rocket/<n>-bg-v1.webp     600 x 838, white, ALPHA = foil (the window background), lossless
  assets/foil/fam/wotc-team-rocket/<n>-stars-v1.webp  600 x 838, white, ALPHA = the scan's cosmos dots and stars plus bloom
  assets/foil/fam/wotc-team-rocket/glitter-a-v1.webp, glitter-b-v1.webp   copied byte for byte from Jungle's (same foil)

The figure / background cut is the draft's (tr_hints.json, hand fixes for 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 15, 16, 83): each window
pixel takes the nearer of the card's background and figure colour prototypes (Lab, scan blurred 1.2 px), figure-coloured pieces
smaller than min_fg (dots and discs) go back to the background, small holes fill (all of them where the card says so), and
polygons / circles force what colour cannot tell. `foil_only` (card 15) and `orb` (card 17) are the two special pictures.
The foil is the frame's art window (assets/foil/wotc-win/<layout>-v1.webp, eroded 2 px) less the stage badge (a consensus over
every Stage 1 / Stage 2 scan of the set) and less the figure grown 1 px; its edge is feathered under 1 px. The stars are the
scan's compact bright dots, discs and four-point stars on the foil (top-hat over a 9 px and a 41 px median; streaks and ink
edges are not stars), plus a soft bloom so a lit star flares past its printed size.

    python3 .claude/skills/card-textures/scripts/fam/wotc-team-rocket/make_tr_maps.py [--cards 4,83] [--preview DIR] [--write]

Without --write it only draws the previews (DIR/<n>-cut.png, DIR/sheet.png: every card's foil mask tinted magenta on its scan, the
matte edge in green). Deterministic: a re-run draws the same maps.
"""
import argparse
import json
import os
import shutil

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
OUT = os.path.join(ROOT, "assets/foil/fam/wotc-team-rocket")
VER = "v1"
W, H = 600, 838
BOXES = {"pokemon": (61, 94, 539, 430), "trainer": (52, 193, 551, 469), "energy": (18, 118, 583, 615)}
CARDS = list(range(1, 18)) + [83]


def layout_of(card):
    if card.get("supertype") == "Energy":
        return "energy"
    if card.get("supertype") == "Trainer":
        return "trainer"
    return "pokemon"


def load_rgb(path):
    return np.asarray(Image.open(os.path.join(ROOT, path)).convert("RGB"))


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + 0.5


def badge_cut(cards):
    """The stage badge over the window's top-left corner: pixels that barely change across the set's evolved Pokemon."""
    stack = [load_rgb(c["image"])[20:180, 20:200].astype(np.float32) for c in cards
             if c.get("supertype") == "Pokémon" and any(s in (c.get("subtypes") or []) for s in ("Stage 1", "Stage 2"))]
    sd = np.stack(stack).std(0).mean(2)
    full = np.full((H, W), 99.0, np.float32)
    full[20:180, 20:200] = ndi.gaussian_filter(sd, 0.7)
    win = np.asarray(Image.open(os.path.join(ROOT, "assets/foil/wotc-win/pokemon-v1.webp")))[..., 3] > 0
    m = (full < 58) & win
    lab, _ = ndi.label(m)
    comp = ndi.binary_fill_holes(lab == lab[97, 64])
    comp[:, 146:] = False
    comp[150:, :] = False
    return ndi.binary_dilation(comp, disk(2))


def hex2lab(h):
    rgb = np.uint8([[[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]]])
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)


def poly_mask(shape, polys, off):
    im = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([(x - off[0], y - off[1]) for x, y in p], fill=255)
    return np.asarray(im) > 127


def circle_mask(shape, circles, off):
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    m = np.zeros(shape, bool)
    for cx, cy, r in circles:
        m |= (xx + off[0] - cx) ** 2 + (yy + off[1] - cy) ** 2 <= r * r
    return m


def prune_flecks(fg):
    """Dots and discs that touch the figure's edge stick to it as bumps: an opening (radius 3) cuts every narrow part off,
    and a cut-off part goes back to the background when it is dot-like (compact, under 260 px) and at least a third of
    its rim is background. Long thin parts (an antenna, a tail, a whisker) stay."""
    opened = ndi.binary_opening(fg, disk(3))
    rem = fg & ~opened
    lab, k = ndi.label(rem, structure=np.ones((3, 3)))
    drop = np.zeros_like(fg)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        piece = lab[sl] == i
        area = int(piece.sum())
        h, w = piece.shape
        if area > 260 or max(h, w) > 2.6 * max(1, min(h, w)):
            continue
        y0, y1 = max(0, sl[0].start - 2), min(fg.shape[0], sl[0].stop + 2)
        x0, x1 = max(0, sl[1].start - 2), min(fg.shape[1], sl[1].stop + 2)
        p = lab[y0:y1, x0:x1] == i
        ring = ndi.binary_dilation(p, disk(2)) & ~p
        if ring.any() and (~fg[y0:y1, x0:x1])[ring].mean() >= 0.33:
            drop[y0:y1, x0:x1] |= p
    return fg & ~drop


def figure(rgb, inwin, hint, off):
    """True where the print is the figure (matte)."""
    shp = rgb.shape[:2]
    if "foil_only" in hint:
        f = rgb.astype(np.float32) / 255.0
        med = ndi.median_filter(f.max(2), size=7)
        foil = poly_mask(shp, hint["foil_only"], off) & (med < hint.get("dark_max", 0.33))
        foil = ndi.binary_fill_holes(ndi.binary_closing(foil, disk(2))) & poly_mask(shp, hint["foil_only"], off)
        foil = ndi.binary_opening(foil, disk(1))
        return ~foil
    if "orb" in hint:
        return circle_mask(shp, hint["orb"], off)
    inwin = ndi.binary_erosion(inwin, disk(2))  # the frame's bevel is not figure
    sm = cv2.GaussianBlur(rgb, (0, 0), 1.2)
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
    protos = np.stack([hex2lab(h) for h, _ in hint["protos"]])
    isfg = np.array([k == "f" for _, k in hint["protos"]])
    d = ((lab[:, :, None, :] - protos[None, None]) ** 2).sum(-1)
    fg = isfg[d.argmin(-1)] & inwin
    # near-black neutral ink (outlines, black sky) is neither: it joins the figure within 3 px of it
    s = sm.astype(np.float32) / 255.0
    neutral = (s.max(2) < 0.16) & (s.max(2) - s.min(2) < 0.05) & inwin
    fg = (fg & ~neutral) | (neutral & ndi.binary_dilation(fg & ~neutral, disk(3)))
    force_fg = poly_mask(shp, hint.get("fg", []), off) | circle_mask(shp, hint.get("fg_circles", []), off)
    force_bg = poly_mask(shp, hint.get("bg", []), off) | circle_mask(shp, hint.get("bg_circles", []), off)
    fg = (fg | force_fg) & ~force_bg & inwin
    # figure-coloured dots and discs in the sky go back to the background
    lab_, k = ndi.label(fg, structure=np.ones((3, 3)))
    if k:
        area = ndi.sum(fg, lab_, range(1, k + 1))
        hit = ndi.maximum(force_fg, lab_, range(1, k + 1)) if force_fg.any() else np.zeros(k, bool)
        keep = np.concatenate([[False], (area >= hint.get("min_fg", 1500)) | hit.astype(bool)])
        fg = keep[lab_]
    fg = prune_flecks(fg) | (force_fg & inwin)
    # holes: tiny ones always fill (shading specks), all of them where the card says so
    holes = ndi.binary_fill_holes(fg) & ~fg
    hl, k = ndi.label(holes)
    if k:
        area = ndi.sum(holes, hl, range(1, k + 1))
        hitbg = ndi.maximum(force_bg, hl, range(1, k + 1)) if force_bg.any() else np.zeros(k, bool)
        fill = (area < 40) | (bool(hint.get("fill")) & ~hitbg.astype(bool))
        fg |= np.concatenate([[False], fill])[hl]
    # a majority filter rounds the pixel staircase of the colour cut
    fg = ndi.uniform_filter(fg.astype(np.float32), 3) > 0.5
    return (fg | force_fg) & ~force_bg


def area_alpha(win, badge, fg):
    """Foil area: window eroded 2 px, minus the badge, minus the figure grown 1 px; 1 px soft edge."""
    inner = ndi.binary_erosion(win > 0.5, disk(2))
    a = inner & ~badge & ~ndi.binary_dilation(fg, disk(1))
    return np.clip(ndi.gaussian_filter(a.astype(np.float32), 0.6), 0, 1)


def sparkle(rgb, alpha):
    """The scan's own cosmos sparkle inside the foil area, soft alpha at scan scale. Two passes over the brightest channel:
    discs (7 to 38 px, 41 px median) fill and light whole at 0.75; dots and four-point stars (up to 18 px, 9 px median) keep the
    scan's own shape. Long or ragged pieces (streaks, drawing highlights) are not stars."""
    f = rgb.astype(np.float32) / 255.0
    mx = f.max(2)
    inside = alpha > 0.5

    def pieces(m, keep_fn):
        lab, k = ndi.label(m, structure=np.ones((3, 3)))
        if not k:
            return np.zeros_like(m)
        frac = ndi.mean(inside, lab, range(1, k + 1))
        keep = np.zeros(k + 1, bool)
        for i, sl in enumerate(ndi.find_objects(lab), 1):
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            ar = int((lab[sl] == i).sum())
            keep[i] = frac[i - 1] > 0.75 and keep_fn(h, w, ar)
        return keep[lab]

    th = np.clip(mx - ndi.median_filter(mx, size=41), 0, None)
    m = ndi.binary_fill_holes(ndi.binary_closing((th > 0.05) & inside, disk(1)))
    discs = pieces(m, lambda h, w, ar: 7 <= max(h, w) <= 38 and max(h, w) <= 1.6 * min(h, w) and ar >= 0.55 * h * w)
    out = np.clip(ndi.gaussian_filter(discs.astype(np.float32), 0.8), 0, 1) * 0.75 * (alpha > 0.2)
    th = np.clip(mx - ndi.median_filter(mx, size=9), 0, None)
    dots = pieces((th > 0.055) & inside & ~discs,
                  lambda h, w, ar: ar <= 160 and max(h, w) <= 18 and ar >= 0.3 * h * w and max(h, w) <= 2.2 * max(1, min(h, w)))
    grown = ndi.binary_dilation(dots, disk(1)) & (alpha > 0.2) & ~discs
    return np.maximum(out, smoothstep(0.04, 0.16, th) * grown)


def stars_of(core, alpha):
    bloom = cv2.GaussianBlur(core, (0, 0), 2.5) * 2.2
    return np.clip(np.maximum(core, np.minimum(bloom, 0.55)), 0, 1) * (alpha > 0.02)


def save_alpha(path, alpha):
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    rgba = np.dstack([np.full_like(a, 255)] * 3 + [a])
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6, exact=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", default=",".join(map(str, CARDS)))
    ap.add_argument("--preview", default=None, help="folder for the cut overlays and the contact sheet")
    ap.add_argument("--write", action="store_true", help="write the maps into assets/foil/fam/wotc-team-rocket/")
    args = ap.parse_args()
    hints = json.load(open(os.path.join(HERE, "tr_hints.json")))
    data = {c["number"]: c for c in json.load(open(os.path.join(ROOT, "data/base5.json")))}
    badge = badge_cut(list(data.values()))
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
    if args.write:
        os.makedirs(OUT, exist_ok=True)
    tiles = []
    for n in [int(x) for x in args.cards.split(",") if x]:
        card = data[str(n)]
        lay = layout_of(card)
        x0, y0, x1, y1 = BOXES[lay]
        scan = load_rgb(card["image"])
        rgb = scan[y0:y1, x0:x1]
        win = np.asarray(Image.open(os.path.join(ROOT, f"assets/foil/wotc-win/{lay}-v1.webp")))[..., 3][y0:y1, x0:x1] / 255.0
        bdg = badge[y0:y1, x0:x1] if lay == "pokemon" else np.zeros(rgb.shape[:2], bool)
        fg = figure(rgb, win > 0.5, hints[str(n)], (x0, y0))
        alpha = area_alpha(win, bdg, fg)
        core = sparkle(rgb, alpha)
        bg = np.zeros((H, W), np.float32)
        bg[y0:y1, x0:x1] = alpha
        stars = np.zeros((H, W), np.float32)
        stars[y0:y1, x0:x1] = stars_of(core, alpha)
        print(f"{n:2d} {card['name']:<24} {lay:<7} foil {alpha.mean():.2f} of the box, stars {stars.mean() * 1000:.1f}/1000")
        if args.write:
            save_alpha(os.path.join(OUT, f"{n}-bg-{VER}.webp"), bg)
            save_alpha(os.path.join(OUT, f"{n}-stars-{VER}.webp"), stars)
        if args.preview:
            ov = scan.astype(np.float32).copy()
            ov = ov * (1 - bg[..., None] * 0.45) + np.array([255, 0, 255], np.float32) * bg[..., None] * 0.27
            figfull = np.zeros((H, W), bool)
            figfull[y0:y1, x0:x1] = ndi.binary_dilation(fg, disk(1)) & (win > 0.5)
            edge = figfull & ~ndi.binary_erosion(figfull)
            ov[edge] = [0, 255, 0]
            st = (stars[..., None] * 255).repeat(3, -1)
            ox0, oy0, ox1, oy1 = x0 - 20, y0 - 20, x1 + 20, y1 + 20
            tile = Image.fromarray(np.concatenate([ov[oy0:oy1, ox0:ox1], st[oy0:oy1, ox0:ox1]], 1).astype(np.uint8))
            ImageDraw.Draw(tile).text((6, 6), f"{n} {card['name']}", fill=(255, 255, 0))
            tile.save(os.path.join(args.preview, f"{n}-cut.png"))
            tiles.append(Image.fromarray(ov[94:430 + 40, 40:560].astype(np.uint8)))
            ImageDraw.Draw(tiles[-1]).text((6, 6), f"{n} {card['name']}", fill=(255, 255, 0))
    if args.write:
        for half in ("a", "b"):  # the glitter is Jungle's: same foil, same streaks
            shutil.copyfile(os.path.join(ROOT, f"assets/foil/fam/wotc-jungle/glitter-{half}-{VER}.webp"), os.path.join(OUT, f"glitter-{half}-{VER}.webp"))
    if args.preview and tiles:
        tw, th = 520, 376
        cols = 3
        sheet = Image.new("RGB", (tw * cols, th * ((len(tiles) + cols - 1) // cols)), "white")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(os.path.join(args.preview, "sheet.png"))


if __name__ == "__main__":
    main()
