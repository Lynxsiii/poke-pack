#!/usr/bin/env python3
"""Bake the lit texture maps of the Black & White full arts (holo family bw-full-art), so no lit layer draws the card art
(`--art`) itself, and no layer's background is a large image.

Why: in WebKit's full-page probe (3 cards x 4 poses at scale 3), the rows below the first screen sometimes painted the
engraved faces' lit lines without the scan multiplied in (`--art` x `--art` in the layer's background): a white or blue
line screen over the face, black lettering cut by white dashes (review 2026-10-22, round 2: Entei-EX bw5-103,
Articuno-EX bw8-132). WebKit decodes a large image (about 500 KB decoded and up) for a background asynchronously when it
first paints off screen, at the size it is drawn, and each pose draws it at another size, so a lower row can miss it;
the same maps used as masks always painted. A first try in this round that put the whole texture into one large
background-and-mask map lost the whole layer in those rows instead. So each face gets two maps:

  flank-v1/<id>.webp  where the texture catches the light (white RGB, the map in alpha, lossless, 733 x 1024: the
                      layer's mask)
      engraved faces (`bwfa-lines`, bw4-bw10 and the drawn promos): the ridges' lit flanks, the etch minus itself
          shifted 1.3 px right and down (make_flanks.py's SHIFT), 4 levels, x the scan's alpha;
      flat faces (`bwfa-sand`, bw1-bw3): the background the sand sits on, 1 - Live's silhouette (etch/<id>.webp, the
          Genies' etch/<id>-v3.webp), x the scan's alpha.
  tone-v1/<id>.webp   the colour the light takes there (RGB, the scan's alpha), small enough (280 x 391, about 440 KB
                      decoded) for WebKit to decode it on the spot: the engraved faces' scan squared (so dark ink stays
                      dark and light ink shimmers in its own hue), the flat faces' scan.

Live's etch has dot-field regions besides its lines: mostly white with small black holes (Mewtwo-EX's tail, Groudon-EX's
body, Registeel-EX, Ghetsis's coat). Lit through the flanks they read as a dense bright speckle, sandpaper at phone size
(review 2026-10-22, round 2), where the real cards show a fine woven hatch (Mewtwo-EX eBay scan). So before the flanks
are taken, each such region (small black specks dense, the etch mostly white; regions over 800 px) is redrawn as fine
lines at Live's 6.5 px pitch (make_lines_v2.py's lines()), running along the region's long axis, feathered in.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_lit.py            # every face
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/make_lit.py --cards bw5-103,bw3-98

Writes assets/foil/fam/bw-full-art/flank-v1/<id>.webp and tone-v1/<id>.webp only; existing outputs are left alone unless
--force (drafts only: once shipped, a changed map takes a new folder name, flank-v2 / tone-v2).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_flanks import LEVELS, SHIFT, faces as flank_faces  # noqa: E402
from make_lines_v2 import PITCH  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
DIR = ROOT / "assets" / "foil" / "fam" / "bw-full-art"
FLANK = DIR / "flank-v1"
TONE = DIR / "tone-v1"
TONE_SIZE = (280, 391)
MODULE = ROOT / "js" / "fam" / "bw-full-art.js"
SIZE = (733, 1024)
QUALITY = 82


def module_ids() -> tuple[list[str], list[str]]:
    """(engraved ids, flat ids) as js/fam/bw-full-art.js lists them."""
    src = MODULE.read_text(encoding="utf-8")
    live = re.findall(r'"(bw\d+-\w+)"', re.search(r"const LIVE = new Set\(\[(.*?)\]\)", src, re.S).group(1))
    drawn = re.search(r"const DRAWN = \{(.*?)\};", src, re.S).group(1)
    lines = [i for i in live if not re.match(r"bw[123]-", i)]
    lines += [fid for fid, cls in re.findall(r'"(bw\d+-\w+)":\s*\["([^"]+)"', drawn) if "bwfa-lines" in cls.split()]
    flat = [i for i in live if re.match(r"bw[123]-", i)]
    return lines, flat


def scan(face_id: str) -> np.ndarray:
    s = face_id.split("-")[0]
    data = json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8"))
    card = next(c for c in (data if isinstance(data, list) else data["cards"]) if c.get("id") == face_id)
    im = Image.open(ROOT / card["image"]).convert("RGBA").resize(SIZE, Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def alpha_of(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    if im.size != SIZE:
        im = im.resize(SIZE, Image.LANCZOS)
    return np.asarray(im, np.float32)[..., 3] / 255.0


def alpha_map(weight: np.ndarray) -> Image.Image:
    out = np.zeros(weight.shape + (4,), np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.round(np.clip(weight, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def tone_map(rgb: np.ndarray, card_alpha: np.ndarray) -> Image.Image:
    out = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.round(np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    out[..., 3] = np.round(np.clip(card_alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize(TONE_SIZE, Image.LANCZOS)


def dot_fields(e: np.ndarray) -> np.ndarray:
    """Live's dot-field regions: dense small black specks (30 px or less) on a mostly white etch."""
    black = e < 0.5
    lab, n = ndimage.label(black)
    sizes = ndimage.sum(black, lab, range(1, n + 1))
    specks = np.isin(lab, 1 + np.where(sizes <= 30)[0])
    dense = ndimage.gaussian_filter(specks.astype(np.float32), 6) > 0.06
    m = dense & (ndimage.gaussian_filter(e, 6) > 0.55)
    m = ndimage.binary_opening(ndimage.binary_closing(m, iterations=3), iterations=2)
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return np.isin(lab, 1 + np.where(sizes > 800)[0]) * lab


def rehatch(e: np.ndarray) -> np.ndarray:
    """The etch with each dot-field region redrawn as fine lines along the region's long axis, feathered in."""
    regions = dot_fields(e)
    if not regions.any():
        return e
    fill = np.zeros_like(e)
    h, w = e.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    # make_lines_v2.py's lines(): a gentle sway of up to three pitches, one noise field for the face
    warp = ndimage.gaussian_filter(np.random.default_rng(7).standard_normal((h, w)).astype(np.float32), 38)
    warp *= 3.0 / max(float(np.abs(warp).max()), 1e-6)
    for i in np.unique(regions[regions > 0]):
        ys, xs = np.nonzero(regions == i)
        cov = np.cov(np.vstack([xs, ys]).astype(np.float64))
        _, v = np.linalg.eigh(cov)
        axis = float(np.arctan2(v[1, -1], v[0, -1]) + np.pi / 2)   # the normal of the long axis: lines run along it
        m = regions == i
        phase = (x[m] * np.cos(axis) + y[m] * np.sin(axis)) / PITCH + warp[m]
        fill[m] = (0.5 + 0.5 * np.cos(2 * np.pi * phase) > 0.5).astype(np.float32)
    cover = ndimage.gaussian_filter(ndimage.binary_dilation(regions > 0, iterations=1).astype(np.float32), 1.5)
    out = e * (1 - cover) + ndimage.gaussian_filter(fill, 0.6) * cover
    return out


def flanks(face_id: str, card_alpha: np.ndarray) -> np.ndarray:
    """The ridges' lit flanks (as make_flanks.py: the etch minus itself shifted, 4 levels), dot fields redrawn as lines."""
    e = alpha_of(flank_faces()[face_id])
    e = rehatch(e)
    shifted = ndimage.shift(e, (SHIFT, SHIFT), order=1, mode="nearest")
    f = np.clip(e * (1.0 - shifted) * card_alpha, 0, 1)
    return np.round(f * (LEVELS - 1)) / (LEVELS - 1)


def maps_lines(face_id: str) -> tuple[Image.Image, Image.Image]:
    s = scan(face_id)
    return alpha_map(flanks(face_id, s[..., 3])), tone_map(s[..., :3] ** 2, s[..., 3])


def maps_flat(face_id: str) -> tuple[Image.Image, Image.Image]:
    s = scan(face_id)
    sil_name = f"{face_id}-v3" if face_id in ("bw2-97", "bw2-98") else face_id
    sil = alpha_of(DIR / "etch" / f"{sil_name}.webp")
    return alpha_map((1.0 - sil) * s[..., 3]), tone_map(s[..., :3], s[..., 3])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", help="comma-separated ids (default: every engraved and flat face of the module)")
    ap.add_argument("--force", action="store_true", help="rewrite existing outputs (drafts only)")
    args = ap.parse_args()
    lines, flat = module_ids()
    ids = args.cards.split(",") if args.cards else lines + flat
    FLANK.mkdir(parents=True, exist_ok=True)
    TONE.mkdir(parents=True, exist_ok=True)
    for fid in ids:
        dst, tdst = FLANK / f"{fid}.webp", TONE / f"{fid}.webp"
        if dst.exists() and tdst.exists() and not args.force:
            print(f"{fid}: exists, skipped")
            continue
        maps = maps_lines(fid) if fid in lines else maps_flat(fid) if fid in flat else None
        if maps is None:
            print(f"{fid}: not a face of the module", file=sys.stderr)
            return 1
        maps[0].save(dst, "WEBP", lossless=True, method=4)
        maps[1].save(tdst, "WEBP", quality=QUALITY, alpha_quality=100, method=4)
        print(f"{fid}: {dst.relative_to(ROOT)} {dst.stat().st_size // 1024} KB, {tdst.relative_to(ROOT)} {tdst.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
