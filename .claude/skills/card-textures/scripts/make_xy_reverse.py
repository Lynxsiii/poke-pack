"""Draw the XY era's reverse holo patterns, one grey tile per type.

The XY reverse (every set, xy1 to xy12, Generations) is a sheet of big ghosted type symbols over the card's body:
outlined drops, leaves, flames, eyes in two or three sizes, tilted this way and that, overlapping, with a
mottled mirror between them (photos: Collexy's flat scans of Leafeon 7/111, Mudkip 33/160, Chandelure 43/119,
and the Pokemon Holo clips; /mnt/project-files/every-era/xy/texture-refs/f1-holo-reverse/SOURCES.txt).
TCG Live has no map for it, so the tile is drawn:

- the symbols are the XY set of type symbols (the same glyphs as the 2013 XY Energy cards' orbs), drawn here as
  polygons and curves on a 400 px canvas (an extraction from the Energy scans kept the orb's specular bite);
- each tile scatters ten glyphs (a seeded layout per type) in three sizes with a lighter body and a soft dark
  outline, on a smooth mottle. Grey is the shine (the CSS multiplies the light by it); the tile is opaque, the
  CSS cuts the art window out with the frame's own window mask (assets/foil/xy-win/).

    python3 .claude/skills/card-textures/scripts/make_xy_reverse.py

Writes assets/foil/xy-reverse/<type>.webp (grass fire water lightning psychic fighting darkness metal fairy dragon
colorless trainer), 600 x 838, never over an existing file.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "assets" / "foil" / "xy-reverse"
W, H = 600, 838
G = 400  # glyph canvas
SS = 3

def poly(d, s, pts, fill=255):
    d.polygon([(s * x, s * y) for x, y in pts], fill=fill)


def bez(p0, p1, p2, p3, n=24):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return [tuple(q) for q in ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)]


def path(*segs):
    pts = []
    for seg in segs:
        pts += bez(*seg)
    return pts


def line(d, s, a, b, w, fill=0):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy) or 1
    nx, ny = -dy / n * w / 2, dx / n * w / 2
    poly(d, s, [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)], fill)


def draw_grass(d, s):
    # a leaf: a lens from the lower left to the upper right, a midrib and three pairs of veins cut out of it
    lens = path(((.10, .90), (.02, .45), (.38, .08), (.92, .06)), ((.92, .06), (.96, .52), (.62, .94), (.10, .90)))
    poly(d, s, lens)
    line(d, s, (.16, .86), (.80, .20), .030)
    for t, ln in ((.30, .20), (.48, .22), (.64, .17)):
        cx, cy = .16 + .64 * t, .86 - .66 * t
        line(d, s, (cx, cy), (cx + ln * .85, cy + ln * .35), .024)
        line(d, s, (cx, cy), (cx - ln * .35, cy - ln * .85), .024)


def draw_fire(d, s):
    flame = path(((.50, .98), (.10, .98), (.04, .60), (.30, .50)),
                 ((.30, .50), (.22, .40), (.26, .28), (.34, .22)),
                 ((.34, .22), (.34, .36), (.42, .40), (.46, .40)),
                 ((.46, .40), (.40, .22), (.46, .08), (.56, .02)),
                 ((.56, .02), (.58, .20), (.72, .30), (.76, .44)),
                 ((.76, .44), (.84, .38), (.88, .30), (.88, .26)),
                 ((.88, .26), (.98, .50), (.94, .98), (.50, .98)))
    poly(d, s, flame)
    inner = path(((.50, .90), (.34, .90), (.30, .76), (.40, .66)), ((.40, .66), (.44, .72), (.50, .70), (.52, .60)),
                 ((.52, .60), (.64, .68), (.68, .90), (.50, .90)))
    poly(d, s, inner, 0)


def draw_water(d, s):
    drop = path(((.94, .06), (.60, .12), (.30, .20), (.12, .50)), ((.12, .50), (.02, .74), (.20, .96), (.50, .96)),
                ((.50, .96), (.82, .96), (.92, .66), (.74, .38)), ((.74, .38), (.70, .24), (.80, .12), (.94, .06)))
    poly(d, s, drop)
    d.ellipse((s * .24, s * .72, s * .50, s * .86), fill=0)


def draw_lightning(d, s):
    poly(d, s, [(.62, .02), (.18, .52), (.42, .52), (.30, .98), (.82, .40), (.56, .40), (.74, .02)])


def draw_psychic(d, s):
    eye = path(((.02, .50), (.24, .14), (.76, .14), (.98, .50)), ((.98, .50), (.76, .86), (.24, .86), (.02, .50)))
    poly(d, s, eye)
    inner = path(((.12, .50), (.28, .24), (.72, .24), (.88, .50)), ((.88, .50), (.72, .76), (.28, .76), (.12, .50)))
    poly(d, s, inner, 0)
    d.ellipse((s * .33, s * .27, s * .67, s * .73), fill=255)
    d.ellipse((s * .41, s * .35, s * .59, s * .65), fill=0)


def draw_fighting(d, s):
    for x0, x1, y0 in ((.08, .27, .18), (.30, .48, .10), (.51, .69, .12), (.72, .90, .22)):
        d.rounded_rectangle((s * x0, s * y0, s * x1, s * (.50)), radius=s * .04, fill=255)
    poly(d, s, [(.08, .54), (.90, .54), (.90, .86), (.74, .96), (.30, .96), (.08, .78)])
    line(d, s, (.20, .78), (.42, .78), .035)
    line(d, s, (.42, .78), (.42, .66), .035)
    line(d, s, (.42, .66), (.62, .66), .035)


def draw_darkness(d, s):
    d.ellipse((s * .10, s * .08, s * .90, s * .88), fill=255)
    d.ellipse((s * .30, s * .00, s * 1.08, s * .72), fill=0)


def draw_metal(d, s):
    poly(d, s, [(.50, .90), (.16, .46), (.84, .46)])
    for sign in (-1, 1):
        x = lambda v: .5 + sign * v
        poly(d, s, [(x(.10), .10), (x(.40), .10), (x(.48), .24), (x(.48), .36), (x(.36), .36), (x(.36), .28), (x(.30), .20), (x(.10), .20)])


def draw_fairy(d, s):
    star = []
    for i in range(8):
        a = math.pi / 2 + i * math.pi / 4
        r = .30 if i % 2 == 0 else .07
        star.append((.5 + r * math.cos(a), .32 - r * math.sin(a)))
    poly(d, s, star)
    for sign in (-1, 1):
        x = lambda v: .5 + sign * v
        petal = path(((x(.04), .98), (x(.02), .70), (x(.10), .52), (x(.24), .50)), ((x(.24), .50), (x(.40), .50), (x(.46), .62), (x(.44), .78)),
                     ((x(.44), .78), (x(.30), .70), (x(.20), .72), (x(.14), .80)), ((x(.14), .80), (x(.10), .88), (x(.06), .94), (x(.04), .98)))
        poly(d, s, petal)


def draw_dragon(d, s):
    for sign in (-1, 1):
        x = lambda v: .5 + sign * v
        horn = path(((x(.06), .90), (x(.10), .50), (x(.30), .24), (x(.50), .06)), ((x(.50), .06), (x(.42), .30), (x(.34), .50), (x(.18), .90)))
        poly(d, s, horn)
    poly(d, s, [(.38, .96), (.62, .96), (.56, .58), (.44, .58)])


def draw_colorless(d, s):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = .48 if i % 2 == 0 else .20
        pts.append((.5 + r * math.cos(a), .54 + r * math.sin(a)))
    poly(d, s, pts)


def draw_ball(d, s):
    d.ellipse((s * .04, s * .04, s * .96, s * .96), fill=255)
    d.rectangle((s * .04, s * .46, s * .96, s * .54), fill=0)
    d.ellipse((s * .36, s * .36, s * .64, s * .64), fill=0)
    d.ellipse((s * .43, s * .43, s * .57, s * .57), fill=255)


DRAWN = {"grass": draw_grass, "fire": draw_fire, "water": draw_water, "lightning": draw_lightning, "psychic": draw_psychic,
         "fighting": draw_fighting, "darkness": draw_darkness, "metal": draw_metal, "fairy": draw_fairy,
         "dragon": draw_dragon, "colorless": draw_colorless, "trainer": draw_ball}


def shape_canvas(draw_fn) -> np.ndarray:
    im = Image.new("L", (G * SS, G * SS), 0)
    draw_fn(ImageDraw.Draw(im), G * SS)
    return np.asarray(im.resize((G, G), Image.LANCZOS)).astype(float) / 255


def glyph_for(kind: str) -> np.ndarray:
    return shape_canvas(DRAWN[kind])


def smooth_noise(shape, sigma, rng):
    n = rng.standard_normal(shape)
    n = ndi.gaussian_filter(n, sigma)
    return n / (n.std() + 1e-9)


def layout(kind: str):
    """(cx, cy, size, rotation) in fractions of the card width/height, seeded per type."""
    rng = np.random.default_rng(sum(map(ord, kind)) * 7919)
    items = []
    sizes = [0.40, 0.36, 0.31, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.16]
    # a jittered grid over the whole card; the bigger glyphs first so they claim room
    cells = [(x, y) for y in np.linspace(0.13, 0.95, 4) for x in np.linspace(0.18, 0.84, 3)]
    rng.shuffle(cells)
    for size, (x, y) in zip(sizes, cells):
        items.append((float(np.clip(x + rng.uniform(-0.07, 0.07), 0.04, 0.96)),
                      float(np.clip(y + rng.uniform(-0.04, 0.04), 0.04, 0.98)),
                      size, float(rng.uniform(-40, 40))))
    return items, rng


def make_tile(kind: str) -> Image.Image:
    base = glyph_for(kind)
    items, rng = layout(kind)
    body = np.zeros((H, W))
    line = np.zeros((H, W))
    for cx, cy, size, rot in items:
        px = max(24, round(size * W))
        g = Image.fromarray((base * 255).astype(np.uint8)).resize((px, px), Image.LANCZOS)
        g = g.rotate(rot, resample=Image.BICUBIC, expand=True)
        a = np.asarray(g).astype(float) / 255
        edge = np.clip(a - ndi.grey_erosion(a, size=(5, 5)), 0, 1)  # the outline, a few px wide
        edge = ndi.gaussian_filter(edge, 1.1)
        x0, y0 = round(cx * W - a.shape[1] / 2), round(cy * H - a.shape[0] / 2)
        for target, src in ((body, a), (line, edge)):
            xs, ys = max(0, x0), max(0, y0)
            xe, ye = min(W, x0 + src.shape[1]), min(H, y0 + src.shape[0])
            if xe <= xs or ye <= ys:
                continue
            piece = src[ys - y0:ye - y0, xs - x0:xe - x0]
            target[ys:ye, xs:xe] = np.maximum(target[ys:ye, xs:xe], piece)
    body = ndi.gaussian_filter(body, 1.0)
    # base mirror: broad mottle, never a fine grain
    mott = smooth_noise((H, W), 16, rng) * 0.03 + smooth_noise((H, W), 6, rng) * 0.012
    grey = 0.50 + mott + body * 0.30 - line * 0.34
    return Image.fromarray((np.clip(grey, 0, 1) * 255).astype(np.uint8), "L")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", nargs="*", default=["grass", "fire", "water", "lightning", "psychic", "fighting",
                                                   "darkness", "metal", "fairy", "dragon", "colorless", "trainer"])
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--force", action="store_true", help="overwrite (only for scratch dirs: assets are immutable)")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for kind in args.types:
        path = args.out / f"{kind}.webp"
        if path.exists() and not args.force:
            print("exists, kept:", path.name)
            continue
        make_tile(kind).save(path, "WEBP", quality=72, method=6)
        print(path, path.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
