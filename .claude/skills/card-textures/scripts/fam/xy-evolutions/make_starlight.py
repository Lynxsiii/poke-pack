"""Draw the star field of Evolutions' (xy12) Starlight holo: three seeded RGBA textures.

The 13 Evolutions Rare Holos (Charizard 11, Ninetales 15, Poliwrath 25, Gyarados 34, Raichu 36, Magneton 38,
Zapdos 42, Nidoking 45, Mew 53, Machamp 59, Hitmonchan 62, Clefairy 63, Chansey 70) print Collexy's "Starlight
Holofoil" in the art background (the Pokemon is matte: TCG Live's map cuts it out). Photos of the real cards
(/mnt/project-files/holo-remaster/xy-evolutions/refs/: Collexy's flat scans of Charizard, Machamp and Chansey;
YouTube frames of Hitmonchan, Gyarados, Charizard, Mew) show two depths of stars, as Bleeding Cool describes the
1999 pattern ("stars appearing closer to the surface with sharp clarity, while other stars seemed blurred and far
away"):

- near, sharp: 8-point compass stars (four long rays, four shorter diagonals), 12-point bursts, thin 4-point
  twinkles (long hairline cross, tiny core) and solid round dots, about 0.01 to 0.07 of the card's width across;
  at one angle they all flash in about one hue (cyan on the Chansey and Machamp scans), tinted by the ink;
- far, blurred: soft 4- and 8-point stars and round blobs, smeared sideways, in several hues at once
  (yellow-green, blue, cyan, orange).

Per art window (0.77 x 0.39 of the card) the scans hold about 22 sharp stars, 25 dots, 25 soft stars and 40 soft
blobs. The textures cover 1.2 x 0.62 of the card (2.5 windows) so each card shows its own crop (the CSS places it by
the card's seed), with no repeat: nothing tiles. Every texture is white (or a hue) on transparent, alpha = the light,
so the CSS can draw it as an image (screen, colour-dodge) or use it as a mask over a moving colour gradient.

    python3 .claude/skills/card-textures/scripts/fam/xy-evolutions/make_starlight.py [--preview out.png]

Writes assets/foil/fam/xy-evolutions/starlight-near-a.webp and -near-b.webp (1200 x 866: the sharp stars, split in
two random halves that the CSS lights from two directions, so neighbouring stars flash at different tilts) and
starlight-far.webp (600 x 433: the blurred layer, coloured). Seeded: the same files every run.

The shipped set is the `--suffix=-v2` run (the counts below: 62 compass stars, 16 bursts, 26 twinkles, 110 dots, 80 soft
stars, 160 blobs). The un-suffixed files in assets/foil/fam/xy-evolutions/ are the first, sparser draw (34 / 9 / 13 / 62,
62 / 130 soft), kept in place because an old file name may be cached on phones with its old bytes; this script no longer
reproduces them. The CSS points at the -v2 files.
"""
from __future__ import annotations

import argparse
import colorsys
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-evolutions"
PX = 1000  # texture pixels per card width
ASPECT = 838 / 600  # card height / width (the scans)
TEX_W, TEX_H = 1.2, 0.62  # texture size in card widths / card heights
W, H = round(TEX_W * PX), round(TEX_H * PX * ASPECT)
SS = 4  # supersampling for the sharp shapes
SEED = 1612  # Evolutions: 2 November 2016

# Counts for the whole texture (2.48 art windows).
N_COMPASS, N_BURST, N_TWINKLE, N_DOT = 62, 16, 26, 110
N_SOFT_STAR, N_BLOB = 80, 160


def place(rng, n, min_d, taken, w=W, h=H, margin=0):
    """Dart throwing: n points at least min_d (px) from each other and from `taken` (x, y, r) discs."""
    pts = []
    tries = 0
    while len(pts) < n and tries < n * 400:
        tries += 1
        x, y = rng.uniform(margin, w - margin), rng.uniform(margin, h - margin)
        if all((x - px) ** 2 + (y - py) ** 2 >= (min_d + pr) ** 2 for px, py, pr in taken):
            pts.append((x, y))
            taken.append((x, y, min_d * 0.5))
    return pts


def ray(draw, cx, cy, ang, length, half_w, fill=255):
    """A tapered ray from the centre: a thin kite, widest at the base, to a point."""
    ca, sa = math.cos(ang), math.sin(ang)
    nx, ny = -sa, ca
    pts = [(cx + nx * half_w, cy + ny * half_w)]
    steps = 10
    for i in range(1, steps + 1):
        t = i / steps
        w = half_w * (1 - t) ** 1.35
        pts.append((cx + ca * length * t + nx * w, cy + sa * length * t + ny * w))
    for i in range(steps, -1, -1):
        t = i / steps
        w = half_w * (1 - t) ** 1.35
        pts.append((cx + ca * length * t - nx * w, cy + sa * length * t - ny * w))
    draw.polygon([(x * SS, y * SS) for x, y in pts], fill=fill)


def disc(draw, cx, cy, r, fill=255):
    draw.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=fill)


def stamp(canvas, shape_fn, cx, cy, extent, value, glow=0.0):
    """Draw one shape at SS x into a small tile, downsample, add a soft glow, max it into the canvas."""
    pad = int(extent + 6)
    x0, y0 = int(cx) - pad, int(cy) - pad
    size = 2 * pad + 1
    tile = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(tile)
    shape_fn(d, cx - x0, cy - y0)
    a = np.asarray(tile.resize((size, size), Image.LANCZOS)).astype(np.float32) / 255
    a = np.clip(a, 0, 1)
    if glow:
        a = np.maximum(a, ndi.gaussian_filter(a, extent * 0.18) * glow)
    a *= value
    # paste with max (shapes may overlap)
    X0, Y0 = max(0, x0), max(0, y0)
    X1, Y1 = min(canvas.shape[1], x0 + size), min(canvas.shape[0], y0 + size)
    if X1 <= X0 or Y1 <= Y0:
        return
    sub = a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    canvas[Y0:Y1, X0:X1] = np.maximum(canvas[Y0:Y1, X0:X1], sub)


def compass(rng, r):
    """8-point star: four long rays (the vertical a little longer) and four short diagonals."""
    long_v, long_h = r, r * rng.uniform(0.82, 0.95)
    diag = r * rng.uniform(0.42, 0.58)
    wl, wd = r * rng.uniform(0.14, 0.18), r * rng.uniform(0.1, 0.13)

    def f(d, cx, cy):
        for k, (ln, w) in enumerate([(long_h, wl), (long_v, wl), (long_h, wl), (long_v, wl)]):
            ray(d, cx, cy, k * math.pi / 2, ln, w)
        for k in range(4):
            ray(d, cx, cy, math.pi / 4 + k * math.pi / 2, diag, wd)
        disc(d, cx, cy, r * 0.16)
    return f


def burst(rng, r):
    """12-point burst: long and short rays alternating (the green bursts on Charizard's scan)."""
    rot = rng.uniform(0, math.pi / 6)

    def f(d, cx, cy):
        for k in range(12):
            ln = r if k % 2 == 0 else r * 0.62
            ray(d, cx, cy, rot + k * math.pi / 6, ln, r * 0.12)
        disc(d, cx, cy, r * 0.22)
    return f


def twinkle(rng, r):
    """4-point twinkle: a long hairline cross with a tiny diamond core, sometimes faint diagonals."""
    diag = rng.random() < 0.45

    def f(d, cx, cy):
        for k in range(4):
            ray(d, cx, cy, k * math.pi / 2, r * (1.0 if k % 2 else 0.9), r * 0.065)
        if diag:
            for k in range(4):
                ray(d, cx, cy, math.pi / 4 + k * math.pi / 2, r * 0.28, r * 0.05, fill=170)
        ray(d, cx, cy, 0, r * 0.16, r * 0.12)
        ray(d, cx, cy, math.pi, r * 0.16, r * 0.12)
    return f


def soft_layer(rng, n_star, n_blob):
    """The far layer at half resolution: blurred 4/8-point stars and blobs, smeared sideways, each its own hue."""
    w, h = W // 2, H // 2
    rgb = np.zeros((h, w, 3), np.float32)
    alpha = np.zeros((h, w), np.float32)
    hues = [0.21, 0.5, 0.58, 0.08, 0.15, 0.33, 0.21, 0.5]  # yellow-green, cyan, blue, orange, gold, green (no magenta: the scans show none)
    taken = []
    items = [("star", p) for p in place(rng, n_star, 34, taken, w, h)] + [("blob", p) for p in place(rng, n_blob, 14, taken, w, h)]
    for kind, (cx, cy) in items:
        tile = np.zeros((h, w), np.float32)
        img = Image.new("L", (w * 2, h * 2), 0)
        d = ImageDraw.Draw(img)
        if kind == "star":
            r = rng.uniform(13, 26)
            points = 4 if rng.random() < 0.55 else 8
            for k in range(points):
                ln = r if k % 2 == 0 or points == 4 else r * 0.55
                ang = k * 2 * math.pi / points
                ca, sa = math.cos(ang), math.sin(ang)
                wd = r * 0.2
                d.polygon([((cx + -sa * wd) * 2, (cy + ca * wd) * 2), ((cx + ca * ln) * 2, (cy + sa * ln) * 2),
                           ((cx + sa * wd) * 2, (cy - ca * wd) * 2)], fill=255)
            d.ellipse([(cx - r * 0.3) * 2, (cy - r * 0.3) * 2, (cx + r * 0.3) * 2, (cy + r * 0.3) * 2], fill=255)
            sx, sy = rng.uniform(2.6, 4.2), rng.uniform(1.2, 2.0)
            val = rng.uniform(0.3, 0.55)
        else:
            rx, ry = rng.uniform(6, 20), rng.uniform(5, 13)
            d.ellipse([(cx - rx) * 2, (cy - ry) * 2, (cx + rx) * 2, (cy + ry) * 2], fill=255)
            sx, sy = rng.uniform(3.5, 6.0), rng.uniform(1.8, 3.0)
            val = rng.uniform(0.18, 0.4)
        tile = np.asarray(img.resize((w, h), Image.BOX)).astype(np.float32) / 255
        tile = ndi.gaussian_filter(tile, (sy, sx))
        tile /= max(tile.max(), 1e-6)
        tile *= val
        hue = hues[rng.integers(len(hues))] + rng.uniform(-0.03, 0.03)
        col = np.array(colorsys.hsv_to_rgb(hue % 1, rng.uniform(0.55, 0.8), 1.0), np.float32)
        # "over" composite in premultiplied form, so overlapping blobs mix their hues
        rgb = rgb * (1 - tile[..., None]) + col * tile[..., None]
        alpha = alpha + tile * (1 - alpha)
    out_rgb = np.where(alpha[..., None] > 1e-4, rgb / np.maximum(alpha[..., None], 1e-4), 0)
    return np.dstack([out_rgb, alpha])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", help="also write a preview PNG (the three layers over a dark field)")
    ap.add_argument("--suffix", default="", help="file name suffix, e.g. -v2 for a redraw after shipping")
    args = ap.parse_args()
    rng = np.random.default_rng(SEED)
    near = [np.zeros((H, W), np.float32), np.zeros((H, W), np.float32)]
    taken: list = []
    shapes = []
    for (x, y) in place(rng, N_COMPASS, 46, taken):
        r = rng.uniform(26, 36) if rng.random() < 0.45 else rng.uniform(15, 25)
        shapes.append((compass(rng, r), x, y, r, rng.uniform(0.75, 1.0), 0.35))
    for (x, y) in place(rng, N_BURST, 46, taken):
        r = rng.uniform(16, 24)
        shapes.append((burst(rng, r), x, y, r, rng.uniform(0.7, 0.95), 0.3))
    for (x, y) in place(rng, N_TWINKLE, 42, taken):
        r = rng.uniform(22, 32)
        shapes.append((twinkle(rng, r), x, y, r, rng.uniform(0.75, 1.0), 0.25))
    for (x, y) in place(rng, N_DOT, 20, taken):
        r = rng.uniform(4.5, 11.5)
        shapes.append(((lambda rr: (lambda d, cx, cy: disc(d, cx, cy, rr)))(r), x, y, r, rng.uniform(0.55, 0.95), 0.2))
    # Each star keeps a soft colour of its own, so the resting card shows a mixed field like the scans (the
    # Charizard scan: orange, yellow, green, cyan stars); half "a" leans cool, half "b" warm. The CSS uses the
    # alpha alone when it lights them (as a mask over a moving spectrum), the colour only at rest.
    tints = [[(0.3, 0.9, 1.0), (0.62, 0.9, 1.0), (0.35, 0.72, 1.0)], [(1.0, 0.84, 0.32), (0.55, 1.0, 0.4), (1.0, 0.66, 0.4)]]
    rgb = [np.zeros((H, W, 3), np.float32), np.zeros((H, W, 3), np.float32)]
    for fn, x, y, r, val, glow in shapes:
        k = int(rng.integers(2))
        before = near[k].copy()
        stamp(near[k], fn, x, y, r, val, glow)
        grown = np.clip(near[k] - before, 0, 1)
        col = np.array(tints[k][int(rng.integers(3))], np.float32)
        hit = grown > 0
        rgb[k][hit] = col
    far = soft_layer(rng, N_SOFT_STAR, N_BLOB)

    OUT.mkdir(parents=True, exist_ok=True)
    for k, name in ((0, "near-a"), (1, "near-b")):
        al = (np.clip(near[k], 0, 1) * 255).round().astype(np.uint8)
        c8 = (np.clip(np.where(al[..., None] > 0, rgb[k], 1.0), 0, 1) * 255).round().astype(np.uint8)
        Image.fromarray(np.dstack([c8, al]), "RGBA").save(
            OUT / f"starlight-{name}{args.suffix}.webp", "WEBP", quality=90, alpha_quality=90, method=6)
    f8 = (np.clip(far, 0, 1) * 255).round().astype(np.uint8)
    Image.fromarray(f8, "RGBA").save(OUT / f"starlight-far{args.suffix}.webp", "WEBP", quality=88, alpha_quality=88, method=6)
    for p in sorted(OUT.glob(f"starlight-*{args.suffix}.webp")):
        print(p.relative_to(ROOT), Image.open(p).size, f"{p.stat().st_size / 1024:.0f} KB")

    if args.preview:
        bg = np.zeros((H, W, 3), np.float32) + np.array([0.05, 0.06, 0.12], np.float32)
        farup = np.asarray(Image.fromarray(f8, "RGBA").resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
        bg = bg * (1 - farup[..., 3:]) + farup[..., :3] * farup[..., 3:]
        for k in (0, 1):
            a = np.clip(near[k], 0, 1)[..., None]
            bg = bg * (1 - a) + rgb[k] * a
        Image.fromarray((np.clip(bg, 0, 1) * 255).astype(np.uint8)).save(args.preview)
        print("preview", args.preview)


if __name__ == "__main__":
    main()
