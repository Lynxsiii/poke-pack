#!/usr/bin/env python3
"""Draw the foil map of every sleeve that carries hot-stamped foil or a holo film.

A real Elite Trainer Box sleeve is plain ink with, on about forty of them, a
mirror foil (silver, gold or bronze) stamped onto the line art, the logo or
the corner panels; one (Prismatic Evolutions) is printed on a holo film that
shows wherever the ink is pale. The site lights that foil with the card
engine, and the engine needs to know where it is: this script reads each
sleeve's finished tile from data/gear.json, segments the foil by colour
(scripts/gear/foil.json says which colour family and the thresholds) and
writes an alpha map next to the tile, assets/sleeves/foil/<id>-vN.webp.

    python3 scripts/gear_foil.py                 # every sleeve in foil.json
    python3 scripts/gear_foil.py sm-lunala-etb   # one or more ids
    python3 scripts/gear_foil.py --sheet out.png # review sheet: tile | map | overlay

The map version is the sleeve's own `v` plus the spec's `mv` (default 1); a
map that exists with different pixels is never overwritten, the script says
so and the spec's `mv` has to go up (assets/ is served immutable).

foil.json, per sleeve id:
  {
    "metal": "gold",            # gold | silver | bronze | rainbow | film: drives the CSS tint
    "mode": "gold",             # which detector below; defaults to the metal
    "hue": [25, 65],            # degrees, for the hue detectors
    "sat": [0.3, 1.0],          # saturation range 0..1
    "lum": [0.25, 0.92],        # lightness range 0..1
    "open": 1,                  # pixels of morphological opening (kills ink speckle)
    "blur": 0.8,                # soft edge, pixels
    "box": [x0, y0, x1, y1],    # optional: only inside this box (fractions of the tile)
    "not": [[x0, y0, x1, y1]],  # optional: never inside these boxes
    "mv": 1
  }
  or "colors": [[r,g,b], ...], "dist": 36   # pixels within dist of any listed colour

    python3 scripts/gear_foil.py --probe sm-rayquaza-etb   # the tile's main colours
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "scripts" / "gear" / "foil.json"
CATALOG = ROOT / "data" / "gear.json"
OUT = ROOT / "assets" / "sleeves" / "foil"
SPECS = ROOT / "scripts" / "gear"

DEFAULTS = {
    # Mirror gold: a warm yellow that is clearly more saturated than cream or white.
    "gold": {"hue": [28, 62], "sat": [0.32, 1.0], "lum": [0.22, 0.9]},
    # Mirror silver: grey, between the black ink and the white paper.
    "silver": {"hue": None, "sat": [0.0, 0.2], "lum": [0.3, 0.96]},
    # Bronze / copper: an orange that is duller than printed orange.
    "bronze": {"hue": [8, 48], "sat": [0.18, 0.72], "lum": [0.18, 0.72]},
    # A white line that the foil colours: near-white, low saturation.
    "rainbow": {"hue": None, "sat": [0.0, 0.3], "lum": [0.8, 1.0]},
    # A holo film shows through pale ink: lightness alone, soft.
    "film": {"hue": None, "sat": [0.0, 1.0], "lum": [0.62, 1.0], "soft": 0.2},
}


def rgb_to_hsl(a: np.ndarray):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
    l = (mx + mn) / 2
    d = mx - mn
    s = np.where(d == 0, 0, d / (1 - np.abs(2 * l - 1) + 1e-9))
    h = np.zeros_like(l)
    m = d > 0
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    return h * 60, s, l


def sleeve_v(sleeve_id: str) -> int:
    for spec in SPECS.glob("*.json"):
        if spec.name == "foil.json":
            continue
        for it in json.loads(spec.read_text()).get("items", []):
            if it.get("id") == sleeve_id:
                return int(it.get("v", 1))
    return 1


def draw_map(tile: Image.Image, spec: dict) -> Image.Image:
    if spec.get("or"):
        parts = [draw_map(tile, {**spec, "or": None, **part}) for part in spec["or"]]
        out = parts[0]
        for p in parts[1:]:
            out = Image.fromarray(np.maximum(np.asarray(out), np.asarray(p)), "L")
        return out
    mode = spec.get("mode") or spec["metal"]
    if spec.get("colors"):
        # Explicit foil colours (RGB) with a tolerance: the surest way when the
        # foil's hue overlaps the ink around it.
        a = np.asarray(tile.convert("RGBA")).astype(np.float32)
        rgb, alpha = a[..., :3], a[..., 3] / 255
        dist = float(spec.get("dist", 36))
        m = np.zeros(rgb.shape[:2], bool)
        for c in spec["colors"]:
            m |= np.sqrt(((rgb - np.asarray(c, np.float32)) ** 2).sum(-1)) <= dist
        out = m.astype(np.float32) * alpha
        return _finish(out, spec)
    base = DEFAULTS[mode]
    hue = spec.get("hue", base["hue"])
    sat = spec.get("sat", base["sat"])
    lum = spec.get("lum", base["lum"])
    a = np.asarray(tile.convert("RGBA")).astype(np.float32) / 255
    alpha = a[..., 3]
    h, s, l = rgb_to_hsl(a[..., :3])
    m = (s >= sat[0]) & (s <= sat[1]) & (l >= lum[0]) & (l <= lum[1])
    if hue:
        m &= (h >= hue[0]) & (h <= hue[1])
    soft = spec.get("soft", base.get("soft", 0))
    if soft:
        # Film: ramp in over `soft` of lightness instead of a hard cut.
        ramp = np.clip((l - lum[0]) / max(soft, 1e-6), 0, 1)
        if hue:
            ramp = np.where((h >= hue[0]) & (h <= hue[1]), ramp, 0)
        ramp = np.where((s >= sat[0]) & (s <= sat[1]), ramp, 0)
        out = ramp
    else:
        out = m.astype(np.float32)
    out *= alpha
    return _finish(out, spec, soft)


def _finish(out: np.ndarray, spec: dict, soft: float = 0) -> Image.Image:
    hgt, wid = out.shape
    if spec.get("box"):
        x0, y0, x1, y1 = spec["box"]
        keep = np.zeros_like(out)
        keep[int(y0 * hgt):int(y1 * hgt), int(x0 * wid):int(x1 * wid)] = 1
        out = out * keep
    for x0, y0, x1, y1 in spec.get("not", []):
        out[int(y0 * hgt):int(y1 * hgt), int(x0 * wid):int(x1 * wid)] = 0
    im = Image.fromarray((out * 255).astype(np.uint8), "L")
    k = int(spec.get("open", 1))
    if k > 0 and not soft:
        size = 2 * k + 1
        im = im.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    close = int(spec.get("close", 0))
    if close > 0:
        size = 2 * close + 1
        im = im.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    blur = float(spec.get("blur", 0.8))
    if blur > 0:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return im


def map_path(sleeve_id: str, spec: dict) -> Path:
    v = sleeve_v(sleeve_id) * 10 + int(spec.get("mv", 1))
    return OUT / f"{sleeve_id}-v{v}.webp"


def build(ids=None, write=True):
    spec = json.loads(SPEC.read_text())
    catalog = json.loads(CATALOG.read_text())
    done = []
    for sleeve_id, rule in spec.items():
        if ids and sleeve_id not in ids:
            continue
        row = catalog["sleeves"].get(sleeve_id)
        if not row:
            print(f"NOTE {sleeve_id} is not in data/gear.json", file=sys.stderr)
            continue
        tile = Image.open(ROOT / row["art"])
        im = draw_map(tile, rule)
        path = map_path(sleeve_id, rule)
        if write:
            OUT.mkdir(parents=True, exist_ok=True)
            if path.exists():
                probe = path.with_suffix(".probe.webp")
                im.save(probe, "WEBP", lossless=True)
                same = probe.read_bytes() == path.read_bytes()
                probe.unlink()
                if not same:
                    print(f"NOTE {path.relative_to(ROOT)} exists and would change; bump mv for {sleeve_id}", file=sys.stderr)
            else:
                im.save(path, "WEBP", lossless=True)
        done.append((sleeve_id, rule, tile, im, path))
    return done


def sheet(done, out: Path, cols: int = 4):
    from PIL import ImageDraw

    tw, th = 210, 293
    cell = tw * 3 + 24
    rows = (len(done) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * (cell + 12) + 12, rows * (th + 30) + 12), (255, 0, 255))
    d = ImageDraw.Draw(canvas)
    for n, (sleeve_id, rule, tile, im, path) in enumerate(done):
        x = 12 + (n % cols) * (cell + 12)
        y = 12 + (n // cols) * (th + 30)
        t = tile.convert("RGBA").resize((tw, th), Image.LANCZOS)
        m = im.resize((tw, th), Image.LANCZOS)
        canvas.paste(t, (x, y), t)
        canvas.paste(m.convert("RGB"), (x + tw + 12, y))
        over = t.copy()
        tint = Image.new("RGBA", (tw, th), (0, 255, 0, 170))
        over.paste(tint, (0, 0), m)
        canvas.paste(over, (x + 2 * tw + 24, y), over)
        d.text((x, y + th + 6), f"{sleeve_id}  {rule['metal']}", fill=(0, 0, 0))
    canvas.save(out)
    print(out, canvas.size)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--sheet")
    ap.add_argument("--dry", action="store_true", help="draw but write no map")
    ap.add_argument("--probe", action="store_true", help="print the main colours of the named tiles")
    args = ap.parse_args()
    if args.probe:
        catalog = json.loads(CATALOG.read_text())
        for sleeve_id in args.ids:
            tile = Image.open(ROOT / catalog["sleeves"][sleeve_id]["art"]).convert("RGB")
            a = np.asarray(tile).reshape(-1, 3).astype(np.float32)
            rng = np.random.default_rng(1)
            centres = a[rng.choice(len(a), 10, replace=False)]
            for _ in range(12):
                d = ((a[:, None, :] - centres[None]) ** 2).sum(-1)
                lab = d.argmin(1)
                centres = np.stack([a[lab == i].mean(0) if (lab == i).any() else centres[i] for i in range(10)])
            share = np.bincount(lab, minlength=10) / len(a)
            print(sleeve_id)
            for c, sh in sorted(zip(centres.tolist(), share.tolist()), key=lambda t: -t[1]):
                print(f"  rgb {int(c[0]):3d} {int(c[1]):3d} {int(c[2]):3d}  {sh*100:5.1f}%")
        sys.exit()
    done = build(args.ids or None, write=not args.dry)
    if args.sheet:
        sheet(done, Path(args.sheet))
    print(f"{len(done)} maps")
