#!/usr/bin/env python3
"""Foil maps for the 18 Pokemon LEGEND halves (hgss1 111-114, hgss2 90-95, hgss3 87-90, hgss4 99-102).

What the real card does (photos and sources: /mnt/project-files/holo-remaster/dp-legend/refs/SOURCES.md): the picture,
the type-coloured swooshes and bands and the attack text printed over the picture are DP cosmos holofoil; the
pearl/silver plates (name column or header plate, the LEGEND tag, the Illus. plate, the dual-name rule tab, the Pokedex
bar, the knock-out bar), the energy orbs and the cream gold-dust border are opaque print and stay matte. The border runs
round the joined PAIR: the top half has none on its right edge, the bottom half none on its left edge (the picture
crosses the join there).

How the mask is found (data, not hand-drawn shapes, so it follows each card's own plate lengths):
  1. the frame every card of a group shares: per pixel standard deviation of the group's scans (the hgss2-hgss4 halves
     are a group of seven per side, the two hgss1 halves of a side a group of two); low deviation = printed frame;
  2. per card, the pearl/silver pixels (light, low chroma) inside the zones where plates can be (boxes measured on
     rulered crops per half and set group: hgss1 has no rule tab on the top half, a Pokedex bar and no knock-out bar on
     the bottom half);
  3. closing and small-hole filling swallow the lettering printed on the plates (gold names, HP digits, rule text);
  4. the type-coloured swoosh in the name column / header plate is foil: its shape is the union, over the group, of the
     cards where it is saturated, so a pale band (Colorless, Steel) gets the shape its group prints; edges feathered 3 px
     (it fades into the plate on the card);
  5. the outer border: the group frame plus cream/gold-dust pixels in the outer band (art that breaks the frame, like
     Ho-Oh's flames, is not cream and stays foil);
  6. the energy orbs printed over the picture (ORBS_ART, reviewed list) are cut as discs;
  7. alpha = foil, feathered 0.8 px; RGB is white (no luminance zones).

Output: RGBA webp 600x838 (lossless), one per face, legend-<set>-<number>.webp in assets/foil/fam/dp-legend/ (or --out).
--debug <sheet.jpg> writes an overlay sheet (matte tinted). --find-orbs <sheet.png> prints orb candidates on the bottom
halves and writes a contact sheet to review them (how ORBS_ART was made). Deterministic: no randomness is used.

Usage: python3 make_legend_maps.py [--root <repo>] [--out <dir>] [--debug <sheet.jpg>] [--find-orbs <sheet.png>]
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

CARDS = {
    "hgss1": (111, 112, 113, 114),
    "hgss2": (90, 91, 92, 93, 94, 95),
    "hgss3": (87, 88, 89, 90),
    "hgss4": (99, 100, 101, 102),
}
FIRST = {"hgss1": 111, "hgss2": 90, "hgss3": 87, "hgss4": 99}

# Zones where plates can be, card pixels (x0, x1, y0, y1) on a 600x838 scan, per (half, set group).
ZONES = {
    ("top", "h1"): [(20, 86, 18, 816), (80, 104, 22, 400), (74, 108, 600, 816)],
    ("top", "h24"): [(20, 86, 18, 816), (80, 104, 22, 400), (74, 108, 600, 816), (96, 382, 18, 66)],
    ("bottom", "h1"): [(18, 590, 18, 90), (18, 216, 74, 112), (496, 530, 440, 780)],
    ("bottom", "h24"): [(18, 590, 18, 90), (18, 216, 74, 112), (518, 566, 505, 792)],
}
BAND = 23  # outer border width (px); the bottom border is 26
# Where the type-coloured swoosh can run inside the plates: the top half's name column (below the HP orbs, above the
# name) and the bottom half's header plate (between the name and the orbs).
SWOOSH = {
    ("top", "h1"): (20, 86, 128, 520),
    ("top", "h24"): (20, 86, 128, 372),
    ("bottom", "h1"): (205, 560, 22, 82),
    ("bottom", "h24"): (205, 560, 22, 82),
}
# The energy orbs printed on the header plate (x, y, r): the band runs up to them, they stay print.
ORBS_HEADER = {
    ("bottom", "h1"): [(544, 50, 19)],
    ("bottom", "h24"): [(507, 50, 19), (545, 50, 19)],
}
# Energy orbs printed over the picture on the bottom halves (x, y, r): attack costs, weakness, resistance, retreat.
# Found with --find-orbs (Hough circles scored by radial gradient alignment) and reviewed by eye on its contact sheet:
# Poke-BODY / Poke-POWER badges, set symbols, digits and round shapes in the art were dropped. Opaque print: matte.
ORBS_ART = {
    "hgss1-112": [(546, 124, 11.1), (546, 150, 11.5), (548, 260, 12.2), (548, 386, 13.4), (422, 404, 16.7), (418, 438, 16.2), (402, 468, 15.5), (410, 504, 15.2)],
    "hgss1-114": [(546, 136, 12.9), (548, 262, 13.1), (548, 386, 11.1), (314, 734, 15.7), (370, 760, 15.1), (336, 766, 15.6)],
    "hgss2-91": [(548, 370, 12.4), (548, 398, 12.3), (436, 576, 14.3), (442, 612, 15.4), (394, 716, 14.1), (392, 754, 13.9)],
    "hgss2-93": [(548, 136, 13.9), (438, 332, 15.1), (452, 366, 14.7), (546, 374, 11.9), (466, 396, 13.9), (548, 398, 12.9), (390, 690, 15.7), (414, 716, 14.7), (428, 748, 15.7)],
    "hgss2-95": [(546, 138, 11.1), (546, 372, 12.3), (320, 398, 14.5), (546, 400, 11.5), (342, 424, 14.9), (370, 440, 16.7), (390, 706, 15.2), (390, 742, 13.4), (364, 774, 15.9)],
    "hgss3-88": [(546, 112, 11.5), (548, 138, 12.8), (546, 164, 11.7), (336, 254, 15.5), (358, 278, 14.9), (548, 372, 13.4), (546, 400, 12.9), (428, 692, 14.5), (408, 720, 14.5), (408, 752, 13.9), (388, 784, 12.8)],
    "hgss3-90": [(548, 110, 12.4), (548, 138, 12.4), (546, 164, 12.3), (546, 400, 10.8), (408, 690, 14.7), (420, 724, 15.6), (428, 756, 12.9), (438, 794, 16.7)],
    "hgss4-100": [(546, 124, 10.7), (546, 150, 11.9), (546, 398, 11.9), (314, 676, 15.3), (312, 710, 14.9), (312, 740, 14.0), (484, 772, 16.5), (306, 776, 12.9)],
    "hgss4-102": [(546, 110, 11.5), (546, 138, 11.7), (546, 164, 12.5), (546, 398, 11.9), (430, 416, 12.9), (426, 708, 16.7), (438, 742, 16.7)],
}


def disk(r):
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    return x * x + y * y <= r * r


def fill_small(mask, max_area):
    holes = ndi.binary_fill_holes(mask) & ~mask
    lab, n = ndi.label(holes)
    if n == 0:
        return mask
    sizes = ndi.sum(holes, lab, range(1, n + 1))
    return mask | np.isin(lab, np.where(sizes < max_area)[0] + 1)


def drop_small(mask, min_area):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return np.isin(lab, np.where(sizes >= min_area)[0] + 1)


def half_of(set_id, number):
    return "top" if (number - FIRST[set_id]) % 2 == 0 else "bottom"


def group_of(set_id, number):
    return (half_of(set_id, number), "h1" if set_id == "hgss1" else "h24")


def load(root, set_id, number):
    im = Image.open(os.path.join(root, "assets", "cards", set_id, f"{number}.webp")).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    return a[..., :3], a[..., 3]


def hue_deg(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx = c.max(-1)
    d = np.maximum(mx - c.min(-1), 1e-3)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4))
    return h * 60


def build(root):
    faces = [(s, n) for s, ns in CARDS.items() for n in ns]
    rgb, alpha = {}, {}
    for f in faces:
        rgb[f], alpha[f] = load(root, *f)
    groups = {}
    for f in faces:
        groups.setdefault(group_of(*f), []).append(f)

    stats, swoosh = {}, {}
    for g, members in groups.items():
        stack = np.stack([rgb[m] for m in members])
        mean = stack.mean(0)
        std = np.abs(stack[0] - stack[1]).mean(-1) / 2 if len(members) == 2 else stack.std(0).mean(-1)
        stats[g] = (mean, std)
        x0, x1, y0, y1 = SWOOSH[g]
        box = np.zeros(stack.shape[1:3], bool)
        box[y0:y1, x0:x1] = True
        union = np.zeros_like(box)
        for c in stack:
            union |= ndi.binary_opening(((c.max(-1) - c.min(-1)) > 45) & box, structure=disk(5))
        union = ndi.binary_fill_holes(ndi.binary_closing(union, structure=disk(5)))
        yy, xx = np.mgrid[0 : union.shape[0], 0 : union.shape[1]]
        for ox, oy, orad in ORBS_HEADER.get(g, []):
            union &= (xx - ox) ** 2 + (yy - oy) ** 2 > orad * orad
        swoosh[g] = drop_small(union, 1500)

    maps = {}
    for f in faces:
        s, n = f
        g = group_of(s, n)
        mean, std = stats[g]
        c = rgb[f]
        H, W, _ = c.shape
        V = c.max(-1)
        C = V - c.min(-1)
        yy, xx = np.mgrid[0:H, 0:W]
        zone = np.zeros((H, W), bool)
        for x0, x1, y0, y1 in ZONES[g]:
            zone[y0:y1, x0:x1] = True
        same = (np.abs(c - mean).mean(-1) < 30) & (std < (16 if g[1] == "h24" else 10))
        silver = (V > 115) & (C < 52)

        # plates: silver pixels in the plate zones, plus the shared frame there (gold LEGEND, bevel lines)
        plate = zone & (silver | (same & (V > 70)))
        plate = ndi.binary_opening(plate, structure=disk(1))
        plate = ndi.binary_closing(plate, structure=disk(3)) & zone
        plate = drop_small(fill_small(plate, 3000), 250)

        # border: the outer band (not along the join) where it is cream / gold dust, or the group's shared frame
        side = (xx < BAND) if g[0] == "top" else (xx >= W - BAND)
        band = side | (yy < BAND) | (yy >= H - 26)
        h = hue_deg(c)
        cream = (V > 110) & ((C < 45) | ((h > 22) & (h < 62) & (C < 150)))
        border = ndi.binary_closing(band & (cream | same), structure=disk(2)) & band
        border = drop_small(fill_small(border, 400), 120)

        # orbs printed over the picture
        orbs = np.zeros((H, W), np.float32)
        for ox, oy, orad in ORBS_ART.get(f"{s}-{n}", []):
            d = np.sqrt((xx - ox) ** 2 + (yy - oy) ** 2)
            orbs = np.maximum(orbs, np.clip(orad + 0.5 - d, 0, 1))

        soft_swoosh = np.clip(ndi.gaussian_filter(swoosh[g].astype(np.float32), 3.0) * 1.6 - 0.3, 0, 1)
        matte = np.maximum(plate.astype(np.float32) * (1 - soft_swoosh), border.astype(np.float32))
        matte = np.maximum(ndi.gaussian_filter(matte, 0.8), orbs)
        maps[f] = (1 - matte) * (alpha[f] > 8)
    return maps, rgb


def save(maps, out):
    os.makedirs(out, exist_ok=True)
    for (s, n), foil in maps.items():
        H, W = foil.shape
        a = np.clip(foil * 255 + 0.5, 0, 255).astype(np.uint8)
        rgba = np.dstack([np.full((H, W), 255, np.uint8)] * 3 + [a])
        Image.fromarray(rgba, "RGBA").save(os.path.join(out, f"legend-{s}-{n}.webp"), lossless=True, quality=100, method=6)


def debug_sheet(maps, rgb, path):
    tiles = []
    for f, foil in maps.items():
        c = rgb[f]
        m = (1 - foil)[..., None]
        grey = c.mean(-1, keepdims=True)
        o = c * (1 - m) + (grey * 0.45 + np.array([0, 90, 200]) * 0.55) * m
        tiles.append(Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).resize((300, 419), Image.LANCZOS))
    sheet = Image.new("RGB", (300 * 6, 419 * 3), "black")
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % 6) * 300, (i // 6) * 419))
    sheet.save(path, quality=88)


def find_orbs(root, path):
    """Candidates for ORBS_ART: Hough circles, each scored by how many rays cross a strong edge at its radius and how
    radial that edge is. Prints them per card and writes a contact sheet; the list in ORBS_ART is this, reviewed."""
    import cv2

    def grads(c):
        lab = cv2.cvtColor(c.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
        gx = np.zeros(c.shape[:2], np.float32)
        gy = np.zeros_like(gx)
        for ch in range(3):
            b = cv2.GaussianBlur(lab[..., ch], (0, 0), 0.8)
            sx = cv2.Sobel(b, cv2.CV_32F, 1, 0, ksize=3)
            sy = cv2.Sobel(b, cv2.CV_32F, 0, 1, ksize=3)
            sel = np.hypot(sx, sy) > np.hypot(gx, gy)
            gx[sel], gy[sel] = sx[sel], sy[sel]
        return gx, gy

    def score(gx, gy, cx, cy, r):
        H, W = gx.shape
        mags, aligns = [], []
        for a in np.linspace(0, 2 * np.pi, 64, endpoint=False):
            ca, sa = np.cos(a), np.sin(a)
            bm, bal = 0.0, 0.0
            for rr in np.arange(r - 1.5, r + 1.51, 0.5):
                x, y = int(round(cx + rr * ca)), int(round(cy + rr * sa))
                if 0 <= x < W and 0 <= y < H:
                    m = float(np.hypot(gx[y, x], gy[y, x]))
                    if m > bm:
                        bm, bal = m, abs(gx[y, x] * ca + gy[y, x] * sa) / (m + 1e-6)
            mags.append(bm)
            aligns.append(bal)
        mags, aligns = np.array(mags), np.array(aligns)
        strong = mags > 60
        return float(strong.mean()), float(aligns[strong].mean()) if strong.any() else 0.0

    crops = []
    for s, ns in CARDS.items():
        for n in ns:
            if half_of(s, n) != "bottom":
                continue
            c, _ = load(root, s, n)
            gx, gy = grads(c)
            g8 = cv2.GaussianBlur(cv2.cvtColor(c.astype(np.uint8), cv2.COLOR_RGB2GRAY), (5, 5), 1.2)
            cands = []
            for rmin, rmax in ((8, 13), (12, 17)):
                cs = cv2.HoughCircles(g8, cv2.HOUGH_GRADIENT, dp=1, minDist=8, param1=70, param2=9, minRadius=rmin, maxRadius=rmax)
                if cs is not None:
                    cands += list(cs[0])
            keep = []
            for cx, cy, r in cands:
                if not (98 < cx < 575 and 88 < cy < 812):
                    continue
                best = max(
                    ((lambda cv: (cv[0] * cv[1], cx + dx, cy + dy, r + dr, cv[0], cv[1]))(score(gx, gy, cx + dx, cy + dy, r + dr))
                     for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dr in (-1, -0.5, 0, 0.5, 1)),
                    key=lambda t: t[0],
                )
                _, x2, y2, r2, cov, al = best
                right = 536 <= x2 <= 558 and 9.0 <= r2 <= 13.0
                attack = 12.0 <= r2 <= 16.8
                if (right and cov >= 0.93 and al >= 0.88) or (attack and cov >= 0.92 and al >= 0.88):
                    keep.append((x2, y2, r2, cov, al))
            fin = []
            for k in sorted(keep, key=lambda k: -(k[3] * k[4])):
                if all(np.hypot(k[0] - q[0], k[1] - q[1]) > max(k[2], q[2]) for q in fin):
                    fin.append(k)
            fin.sort(key=lambda k: (k[1], k[0]))
            print(f"{s}-{n}:", [(round(x), round(y), round(r + 0.5, 1)) for x, y, r, _, _ in fin])
            im = Image.fromarray(c.astype(np.uint8))
            for i, (x, y, r, cov, al) in enumerate(fin):
                t = im.crop((int(x - 24), int(y - 24), int(x + 24), int(y + 24))).resize((96, 96), Image.LANCZOS)
                d = ImageDraw.Draw(t)
                d.ellipse([48 - r * 2, 48 - r * 2, 48 + r * 2, 48 + r * 2], outline=(0, 255, 0), width=1)
                d.rectangle([0, 0, 95, 11], fill=(0, 0, 0))
                d.text((2, 0), f"{n}#{i} {cov:.2f}/{al:.2f}", fill=(255, 255, 0))
                crops.append(t)
    cols = 14
    sheet = Image.new("RGB", (cols * 98, ((len(crops) + cols - 1) // cols) * 98), "black")
    for i, t in enumerate(crops):
        sheet.paste(t, ((i % cols) * 98, (i // cols) * 98))
    sheet.save(path)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=os.path.abspath(os.path.join(here, "../../../../../..")))
    ap.add_argument("--out", default=None)
    ap.add_argument("--debug", default=None)
    ap.add_argument("--find-orbs", default=None)
    args = ap.parse_args()
    if args.find_orbs:
        find_orbs(args.root, args.find_orbs)
        return
    out = args.out or os.path.join(args.root, "assets", "foil", "fam", "dp-legend")
    maps, rgb = build(args.root)
    save(maps, out)
    if args.debug:
        debug_sheet(maps, rgb, args.debug)
    print(f"wrote {len(maps)} maps to {out}")


if __name__ == "__main__":
    main()
