#!/usr/bin/env python3
"""Neo Destiny (neo4) holo family: draw each card's two foil maps from its own scan.

    python3 .claude/skills/card-textures/scripts/fam/wotc-neo-destiny/make_nd_maps.py            # all 16 faces
    python3 .../make_nd_maps.py 4 11 --preview /tmp/x                                              # previews only

What the real card does (refs: /mnt/project-files/holo-remaster/wotc-neo-destiny/refs/SOURCES.md): the cosmos holofoil sits
in the art window's background only. Seen at an angle it is a field of separate elements, each lit in its own colour: fine
multicoloured specks, small squares and plus shapes, mid discs, a few large soft orbs (JP Dark Espeon close-up; the Dark
Scizor, Dark Crobat and Dark Donphan tilt clips). At the lamp's angle the whole background flashes as one sheen with that
texture inside it. The Pokemon, the evolution badge, the frame and the text are matte.

For each face it writes, at the scan's size (600 x 838, so a mask needs no placement: size 100% 100%):

- `<n>-area-v2.webp`  alpha = the foil area (nd_segment.foil_area: the window's background, the Pokemon cut out, soft 1 px
  edge), RGB white. The CSS uses it as the mask of every foil layer.
- `<n>-fleck-v2.webp` alpha = the cosmos elements, RGB = each element's own colour. The elements are
  (1) the ones the scan shows: a white top-hat of each colour channel at two scales (radius 5 and 13 px) inside the foil
      area, compact pieces only (2-700 px, not elongated, so painted lightning, streaks and outlines stay out), lit in the
      scan's own colour pushed to full saturation; and
  (2) seeded elements of the same four kinds wherever the foil is, so the parts of the sky printed in pale ink (where the
      scan shows none) carry them too, fainter on pale ink, where the real glitter reads less.

Seeded per card (RandomState(4000 + n)), so a re-run writes the same files. Never writes outside
assets/foil/fam/wotc-neo-destiny/ (or the --preview folder).
"""
from __future__ import annotations

import argparse
import colorsys
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nd_segment  # noqa: E402

cv2.setNumThreads(1)
ROOT = nd_segment.ROOT
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-neo-destiny"
VERSION = "v2"
H, W = nd_segment.H, nd_segment.W
SS = 3  # supersampling of the drawn elements

# element colours: the cosmos palette of the photos (cyan and teal, blue-violet, magenta and pink, orange-red and gold,
# green), as hues; specks take any hue
SQUARE_HUES = [(20, 3), (8, 2), (44, 2), (130, 2), (175, 2), (300, 1)]
DISC_HUES = [(255, 3), (270, 3), (220, 2), (190, 1), (320, 1)]
ORB_HUES = [(250, 2), (275, 2), (210, 1)]


def pick(rs, table):
    hues, weights = zip(*table)
    p = np.array(weights, float)
    return hues[rs.choice(len(hues), p=p / p.sum())]


def hsv(h, s, v):
    return np.array(colorsys.hsv_to_rgb((h % 360) / 360.0, s, v), np.float32)


def scan_flecks(rgb: np.ndarray, area: np.ndarray):
    """The cosmos elements the scan shows: per-channel white top-hat at two scales, compact pieces only."""
    inside = area > 0.5
    th = np.zeros(rgb.shape[:2], np.float32)
    for rad, gain in ((5, 1.0), (13, 0.9)):
        se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * rad + 1, 2 * rad + 1))
        for c in range(3):
            ch = np.ascontiguousarray(rgb[..., c])
            th = np.maximum(th, (ch - cv2.morphologyEx(ch, cv2.MORPH_OPEN, se)) * gain)
    th *= inside
    b = th > 0.075
    lab, k = ndi.label(b)
    keep = np.zeros(k + 1, bool)
    if k:
        sizes = ndi.sum(b, lab, range(1, k + 1))
        for i, sl in enumerate(ndi.find_objects(lab)):
            if sl is None:
                continue
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            a = sizes[i]
            keep[i + 1] = 2 <= a <= 700 and max(h, w) / max(1, min(h, w)) <= 2.6 and a / (h * w) >= 0.32
    m = keep[lab]
    # grow each kept piece by its soft rim so a disc keeps its edge, then the strength from the top-hat
    strength = np.clip((th - 0.04) / 0.22, 0, 1) * ndi.binary_dilation(m, iterations=1)
    strength = cv2.GaussianBlur(strength.astype(np.float32), (0, 0), 0.6)
    # colour: the scan's own colour at the element, at full saturation and value
    blur = cv2.GaussianBlur(rgb, (0, 0), 1.0)
    mx = blur.max(2, keepdims=True)
    mn = blur.min(2, keepdims=True)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    col = (blur - mn) / np.maximum(mx - mn, 1e-4)  # hue at full saturation
    col = col * np.clip(sat * 2.2, 0, 1) + (1 - np.clip(sat * 2.2, 0, 1))  # unsaturated elements stay white
    return strength.astype(np.float32), col.astype(np.float32)


class Canvas:
    """Supersampled RGBA accumulation: elements drawn over each other with 'lighten' on alpha."""

    def __init__(self):
        self.a = np.zeros((H * SS, W * SS), np.float32)
        self.c = np.zeros((H * SS, W * SS, 3), np.float32)

    def blob(self, x, y, r, peak, color, shape, angle=0.0, soft=0.5):
        """shape: 'gauss' (soft dot, r = sigma), 'disc', 'square', 'plus'."""
        R = int(np.ceil((r * 3 + 2) * SS))
        cx, cy = x * SS, y * SS
        x0, x1 = max(0, int(cx) - R), min(W * SS, int(cx) + R + 1)
        y0, y1 = max(0, int(cy) - R), min(H * SS, int(cy) + R + 1)
        if x0 >= x1 or y0 >= y1:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dx, dy = (xx + 0.5 - cx) / SS, (yy + 0.5 - cy) / SS
        if shape == "gauss":
            v = np.exp(-(dx * dx + dy * dy) / (2 * r * r))
        else:
            ca, sa = np.cos(angle), np.sin(angle)
            u, w = dx * ca + dy * sa, -dx * sa + dy * ca
            if shape == "disc":
                d = np.sqrt(u * u + w * w) - r
            elif shape == "square":
                d = np.maximum(np.abs(u), np.abs(w)) - r
            else:  # plus: two bars a third as thick as they are long
                d = np.minimum(np.maximum(np.abs(u) - r, np.abs(w) - r / 3), np.maximum(np.abs(w) - r, np.abs(u) - r / 3))
            v = np.clip(0.5 - d / max(soft, 1e-3), 0, 1)
        v = (v * peak).astype(np.float32)
        a = self.a[y0:y1, x0:x1]
        win = v > a
        self.c[y0:y1, x0:x1][win] = color
        self.a[y0:y1, x0:x1] = np.maximum(a, v)

    def done(self):
        a = cv2.resize(self.a, (W, H), interpolation=cv2.INTER_AREA)
        c = cv2.resize(self.c * self.a[..., None], (W, H), interpolation=cv2.INTER_AREA) / np.maximum(a[..., None], 1e-4)
        return a.astype(np.float32), np.clip(c, 0, 1).astype(np.float32)


def procedural(n: int, area: np.ndarray, box, lum: np.ndarray):
    """Seeded cosmos elements wherever the foil is: specks, squares and plus shapes, discs, orbs."""
    rs = np.random.RandomState(4000 + n)
    x0, y0, x1, y1 = box
    inside = area > 0.5
    n_px = float(inside.sum())
    cv_ = Canvas()

    def spots(count):
        out = []
        tries = 0
        while len(out) < count and tries < count * 30:
            tries += 1
            x, y = rs.uniform(x0, x1), rs.uniform(y0, y1)
            if inside[min(H - 1, int(y)), min(W - 1, int(x))]:
                out.append((x, y))
        return out

    # large soft orbs and mid discs first (they sit under the small elements)
    for x, y in spots(int(n_px / 18000)):
        cv_.blob(x, y, rs.uniform(9, 14), rs.uniform(0.16, 0.28), hsv(pick(rs, ORB_HUES), 0.55, 1.0), "gauss")
    for x, y in spots(int(n_px / 3200)):
        cv_.blob(x, y, rs.uniform(4.5, 8.5), rs.uniform(0.3, 0.55), hsv(pick(rs, DISC_HUES), 0.6, 1.0), "disc", soft=1.6)
    for x, y in spots(int(n_px / 1300)):
        kind = "plus" if rs.rand() < 0.3 else "square"
        cv_.blob(x, y, rs.uniform(1.4, 3.0), rs.uniform(0.55, 1.0), hsv(pick(rs, SQUARE_HUES), 0.85, 1.0), kind,
                 angle=rs.choice([0.0, np.pi / 4]), soft=0.7)
    for x, y in spots(int(n_px / 240)):
        cv_.blob(x, y, rs.uniform(0.55, 0.9), rs.uniform(0.3, 0.85), hsv(rs.uniform(0, 360), rs.uniform(0.45, 0.95), 1.0),
                 "gauss")
    a, c = cv_.done()
    # pale ink shows less glitter: ease the drawn elements where the print is light
    t = np.clip((lum - 0.55) / 0.35, 0, 1)
    a *= 1 - 0.6 * t * t * (3 - 2 * t)
    return a, c


def build(n: int):
    rgb = nd_segment.load(n)
    area, box = nd_segment.foil_area(n)
    lum = cv2.GaussianBlur(rgb @ np.array([0.299, 0.587, 0.114], np.float32), (0, 0), 3.0)
    s_int, s_col = scan_flecks(rgb, area)
    p_int, p_col = procedural(n, area, box, lum)
    use_scan = s_int >= p_int
    fl_a = np.maximum(s_int, p_int) * area
    fl_c = np.where(use_scan[..., None], s_col, p_col)
    return area, fl_a, fl_c, box


def save_rgba(path: Path, rgb: np.ndarray, alpha: np.ndarray, quality=88, alpha_quality=100):
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alpha, 0, 1) * 255]).round().astype(np.uint8), "RGBA")
    im.save(path, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6, exact=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cards", nargs="*", type=int)
    ap.add_argument("--preview", help="write preview PNGs to this folder instead of the shipped maps")
    args = ap.parse_args()
    cards = args.cards or list(range(1, 17))
    if not args.preview:
        OUT.mkdir(parents=True, exist_ok=True)
    for n in cards:
        area, fl_a, fl_c, box = build(n)
        if args.preview:
            pv = Path(args.preview)
            pv.mkdir(parents=True, exist_ok=True)
            x0, y0, x1, y1 = box
            rgb = nd_segment.load(n)
            sl = (slice(y0, y1), slice(x0, x1))
            panels = [rgb[sl], np.repeat(area[sl][..., None], 3, 2), fl_c[sl] * fl_a[sl][..., None]]
            sheet = np.concatenate([np.pad(p, ((0, 0), (0, 4), (0, 0)), constant_values=1) for p in panels], 1)
            Image.fromarray((np.clip(sheet, 0, 1) * 255).astype(np.uint8)).save(pv / f"maps-{n}.png")
            print(n, "preview", pv / f"maps-{n}.png")
            continue
        a_path = OUT / f"{n}-area-{VERSION}.webp"
        f_path = OUT / f"{n}-fleck-{VERSION}.webp"
        save_rgba(a_path, np.ones((H, W, 3), np.float32), area, quality=80)
        save_rgba(f_path, fl_c, fl_a, quality=60, alpha_quality=55)
        print(n, a_path.name, a_path.stat().st_size, f_path.name, f_path.stat().st_size)


if __name__ == "__main__":
    main()
