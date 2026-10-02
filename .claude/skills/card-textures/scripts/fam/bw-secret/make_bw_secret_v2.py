#!/usr/bin/env python3
"""Second pass of the bw-secret maps (2026-10-02, Noah: "most have really shitty texture ... overuse of the rainbow
glare"). Writes NEW files (-v2) beside the shipped ones in assets/foil/fam/bw-secret/; nothing shipped is touched.

The first pass gave every layer the whole etch and the foil map, so the lines of one zone were painted with the colour
meant for another (a rainbow over the brushed frame and the text box). These maps split TCG Live's own etch by zone,
so each CSS layer paints only the zone it belongs to, in the colour that zone has on the real card:

  hatch/<id>-v2.webp   gold secrets (bw7-bw10): Live's etch inside the gold FRAME only (the brushed hatch of the
                       border, name band and bars). Zone = the metal map (v1) dilated 2 px. 733 x 1024, alpha = line.
  tex/<id>-v2.webp     gold secrets: Live's etch inside the art WINDOW and the type SYMBOL of the text box (the stipple
                       on the Pokemon, the swirls behind it, the rings of the symbol). Zone = the window box and the
                       v1 holo map below the window, dilated 4 px (that map is Live's foil map with the ink of the
                       text knocked out, so no ring is drawn through a word).
  eng/<id>-v2.webp     bw11 gold Reshiram and Zekrom: the whole etch (the engraving of the dragon) with the printed ink
                       of the card knocked out (the scan's dark pixels, dilated 2 px), so a pale engraving line is
                       never laid over a letter.
  grain/<id>-a-v2.webp, -b-v2.webp
                       bw1-115 Pikachu, bw3-102 Meowth: the pebbled varnish of the scenery, denser than v1 (about 12
                       percent of the scenery lit, bumps 7 px across at 733 px), lit from the upper left (a) and the
                       lower right (b). Region = art window minus the foil Pokemon, as v1.

Every etch is Live's, resized never, blurred only by the sigma 0.6 of native_era_etch.py. Seeded (grain: crc32 of the
card id), so a re-run writes the same files.

    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_v2.py            # every face
    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_v2.py --cards bw7-152
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bws_v1", HERE / "make_bw_secret_maps.py")
v1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v1)

ROOT, OUT = v1.ROOT, v1.OUT
W, H = 733, 1024
GOLD_FULL = {"bw11-114", "bw11-115"}


def up(a: np.ndarray, order: int = 1) -> np.ndarray:
    """A 367 x 512 map to 733 x 1024."""
    return ndimage.zoom(a, (H / a.shape[0], W / a.shape[1]), order=order)[:H, :W]


def etch_alpha(etch_png: Path, sigma: float) -> np.ndarray:
    return np.asarray(v1.etch_lines(etch_png, sigma))[..., 3].astype(np.float32) / 255


def save_alpha(alpha: np.ndarray, path: Path, quality: int, alpha_quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    v1.white_alpha(np.clip(alpha, 0, 1) * 255).save(path, "WEBP", quality=quality, alpha_quality=alpha_quality, method=6)
    print(f"  {path.relative_to(ROOT)} {path.stat().st_size // 1024} KB")


def gold(face: dict, foil_png: Path, etch_png: Path, sigma: float):
    lum, _ = v1.luminance(foil_png)
    f = lum / 255
    x0, y0, x1, y1 = v1.ART[face["layout"]]
    inside = np.zeros_like(f, dtype=bool)
    inside[y0:y1, x0:x1] = True
    metal = ndimage.gaussian_filter(np.clip((f - 0.72) / 0.12, 0, 1) * ~inside, 0.5)
    holo = np.clip(f - metal, 0, 1)
    lines = etch_alpha(etch_png, sigma)
    # frame zone: the metal, dilated 2 px at 733 px
    frame = ndimage.binary_dilation(up(metal) > 0.12, iterations=2).astype(np.float32)
    frame = ndimage.gaussian_filter(frame, 0.8)
    hatch = lines * frame
    # window and symbol zone
    box = np.zeros((H, W), dtype=np.float32)
    bx0, bx1 = round(x0 * W / 367) + 4, round(x1 * W / 367) - 4
    by0, by1 = y0 * 2 + 4, y1 * 2 - 4
    box[by0:by1, bx0:bx1] = 1
    sym = holo.copy()
    sym[: y1 + 6, :] = 0
    sym_up = ndimage.binary_dilation(up(sym) > 0.06, iterations=4).astype(np.float32)
    sym_soft = ndimage.gaussian_filter(sym_up, 1.0) * np.clip(up(holo) * 3 + 0.35, 0, 1)
    tex = lines * np.maximum(ndimage.gaussian_filter(box, 1.0), sym_soft)
    return hatch, tex


def engraving(face: dict, etch_png: Path, sigma: float) -> np.ndarray:
    lines = etch_alpha(etch_png, sigma)
    scan = Image.open(ROOT / "assets" / "cards" / face["set"] / f"{face['n']}.webp").convert("L").resize((W, H), Image.LANCZOS)
    ink = np.asarray(scan).astype(np.float32) < 95
    ink = ndimage.binary_dilation(ink, iterations=2)
    ink = ndimage.gaussian_filter(ink.astype(np.float32), 0.8)
    return lines * (1 - np.clip(ink * 1.6, 0, 1))


def grain2(face: dict, foil_png: Path, etch_png: Path):
    """Denser than v1: a smoothed random field, shaded from two corners, thresholded low."""
    lumf, _ = v1.luminance(foil_png)
    lume, alpha = v1.luminance(etch_png)
    Hh, Ww = lume.shape
    pok = np.asarray(Image.fromarray(lumf.astype(np.uint8)).resize((Ww, Hh), Image.BILINEAR)).astype(np.float32) / 255
    pok = ndimage.binary_dilation(pok > 0.12, iterations=3)
    x0, y0, x1, y1 = (round(v * Ww / 367) for v in v1.ART["pokemon"])
    region = np.zeros((Hh, Ww), dtype=np.float32)
    region[y0 + 3:y1 - 2, x0 + 3:x1 - 3] = 1
    region *= ~pok
    region = ndimage.gaussian_filter(region, 1.5)
    rng = np.random.default_rng(zlib.crc32((face["id"] + "-v2").encode()))
    field = ndimage.gaussian_filter(rng.standard_normal((Hh, Ww)).astype(np.float32), 2.0)
    field /= field.std()
    gy, gx = np.gradient(field)
    out = []
    for dx, dy in ((-1, -1), (1, 1)):
        shade = -(gx * dx + gy * dy) / np.sqrt(2)
        shade /= shade.std()
        glint = np.clip((shade - 0.75) / 1.1, 0, 1) ** 1.1
        out.append(glint * region * (alpha > 0.5))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default="")
    ap.add_argument("--cache", default="/tmp/claude-0/-home-user-poke-pack/ac507e08-34cd-5d8d-826a-5c5dc46c57e2/scratchpad/bw-secret/live")
    ap.add_argument("--sigma", type=float, default=0.6)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=80)
    ap.add_argument("--force", action="store_true", help="rewrite -v2 files that exist (only before this pass ships)")
    a = ap.parse_args()
    cache = Path(a.cache)
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    for face in v1.faces():
        if wanted and face["id"] not in wanted:
            continue
        name = f"{face['set']}-{face['n']}"
        foil, etch = v1.fetch(face, "foil", cache), v1.fetch(face, "etch", cache)
        jobs = []
        if face["set"] in v1.GOLD_SETS:
            def build_gold():
                hatch, tex = gold(face, foil, etch, a.sigma)
                return {f"hatch/{name}-v2.webp": hatch, f"tex/{name}-v2.webp": tex}
            jobs.append(build_gold)
        if face["id"] in GOLD_FULL:
            jobs.append(lambda: {f"eng/{name}-v2.webp": engraving(face, etch, a.sigma)})
        if face["id"] in v1.GRAIN:
            def build_grain():
                ga, gb = grain2(face, foil, etch)
                return {f"grain/{name}-a-v2.webp": ga, f"grain/{name}-b-v2.webp": gb}
            jobs.append(build_grain)
        for build in jobs:
            for rel, arr in build().items():
                path = OUT / rel
                if path.exists() and not a.force:
                    continue
                save_alpha(arr, path, a.quality, a.alpha_quality)
    return 0


if __name__ == "__main__":
    sys.exit(main())
