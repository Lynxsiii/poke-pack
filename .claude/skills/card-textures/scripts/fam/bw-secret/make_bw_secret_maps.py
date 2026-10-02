#!/usr/bin/env python3
"""Build the per-card masks the bw-secret holo family draws with (Black & White secret rares, 32 faces).

js/fam/bw-secret.js names these files and css/holo/fam/bw-secret.css paints with them. For every Rare Secret of
bw1..bw11 (data/<set>.json) this reads TCG Live's own maps,
    https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<set>/<set>_en_<nnn>_std.foil.png   (367 x 512, luminance)
    https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<set>/<set>_en_<nnn>_std.etch.png   (733 x 1024, luminance)
caches them in --cache (a scratch folder, never the repo) and writes into assets/foil/fam/bw-secret/:

  etch/<set>-<n>.webp    Live's etch at its native 733 x 1024, in "lines" polarity: alpha = what Live etched (the
                         black lines, dots and solid regions of the raw map), white elsewhere transparent. The raw
                         floor (22, Live's "not etched") is stretched to 0 as fetch_foil_maps.py does, then the
                         skill's sub-pixel blur (sigma 0.6, native_era_etch.py) so a one-pixel line does not alias
                         when the browser resamples it. Nothing else: a Live etch is never softened further.
  metal/<set>-<n>.webp   gold secrets (bw7..bw10) only: the gold metal of the frame (border, name band, bars),
                         i.e. Live's foil map at full strength outside the art window. 367 x 512.
  holo/<set>-<n>.webp    gold secrets only: the rest of Live's foil map (art window, type symbol), metal removed.
  grain/<set>-<n>-a.webp, -b.webp
                         bw1-115 Pikachu and bw3-102 Meowth only: the pebbled varnish of the scenery (art window
                         minus the foil Pokemon). A seeded bump field, lit from the upper left (a) and lower right
                         (b): the small highlights each bump throws. 733 x 1024.

    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_maps.py            # every face
    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_maps.py --cards bw7-152,bw1-115

Seeded (the grain seed is the card id), so a re-run writes the same files. Existing outputs are left alone unless
--force: once the family ships, a changed map takes a new name (-v2), since /assets/* is cached for a year.
Writes nothing else: data/*.json and assets/foil/maps/ are untouched.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-secret"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
FLOOR = 22
SETS = [f"bw{i}" for i in range(1, 12)]
GOLD_SETS = {"bw7", "bw8", "bw9", "bw10"}
GRAIN = {"bw1-115", "bw3-102"}
# Art window of the Black & White frame in Live's 367 x 512 foil map (x0, y0, x1, y1), measured on the maps:
# Pokemon (Meowth's etch marks the same box at 733 px: 63..668 x 107..505) and Trainer (the Item frame).
ART = {"pokemon": (31, 53, 335, 254), "trainer": (36, 81, 330, 262)}


def faces() -> list[dict]:
    out = []
    for s in SETS:
        data = json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8"))
        for c in data if isinstance(data, list) else data["cards"]:
            if c.get("rarity") == "Rare Secret" and str(c.get("number", "")).isdigit():
                out.append({"id": c["id"], "set": s, "n": int(c["number"]),
                            "layout": "trainer" if c.get("supertype") == "Trainer" else "pokemon"})
    return out


def fetch(face: dict, kind: str, cache: Path) -> Path:
    dst = cache / f"{face['set']}_{face['n']}.{kind}.png"
    if not dst.exists():
        url = f"{BASE}/{face['set']}/{face['set']}_en_{face['n']:03d}_std.{kind}.png"
        subprocess.run(["curl", "-sf", "-m", "60", "-o", str(dst), url], check=True)
    return dst


def luminance(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Luminance 0..255 (premultiplied by alpha, as fetch_foil_maps.py reads Live's maps) and the alpha 0..1."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    return lum, a[..., 3] / 255


def white_alpha(alpha: np.ndarray) -> Image.Image:
    al = np.clip(alpha, 0, 255).round().astype(np.uint8)
    white = np.full_like(al, 255)
    return Image.fromarray(np.dstack([white, white, white, al]), "RGBA")


def etch_lines(src: Path, sigma: float) -> Image.Image:
    lum, alpha = luminance(src)
    stretched = np.clip((lum - FLOOR) * (255 / (255 - FLOOR)), 0, 255)
    lines = 255 - stretched
    if sigma > 0:
        lines = ndimage.gaussian_filter(lines, sigma)
    return white_alpha(lines * (alpha > 0.5))


def metal_and_holo(src: Path, layout: str) -> tuple[Image.Image, Image.Image]:
    lum, _ = luminance(src)
    f = lum / 255
    x0, y0, x1, y1 = ART[layout]
    inside = np.zeros_like(f, dtype=bool)
    inside[y0:y1, x0:x1] = True
    # the gold of the frame: Live draws it at 0.8-1.0; inside the art window the bright bits are the Pokemon
    metal = np.clip((f - 0.72) / 0.12, 0, 1) * ~inside
    metal = ndimage.gaussian_filter(metal, 0.5)
    holo = np.clip(f - metal, 0, 1)
    return white_alpha(metal * 255), white_alpha(holo * 255)


def grain(face: dict, foil: Path, etch: Path) -> tuple[Image.Image, Image.Image]:
    """The pebbled scenery of the two flat yellow secrets: bumps about 5 px across at 733 px (0.7 % of the card,
    as the Pikachu clip shows them), lit from two sides. Region: art window minus the foil Pokemon."""
    lumf, _ = luminance(foil)
    lume, alpha = luminance(etch)
    H, W = lume.shape
    pok = np.asarray(Image.fromarray(lumf.astype(np.uint8)).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    pok = ndimage.binary_dilation(pok > 0.12, iterations=3)
    x0, y0, x1, y1 = (round(v * W / 367) for v in ART["pokemon"])
    region = np.zeros((H, W), dtype=np.float32)
    region[y0 + 3:y1 - 2, x0 + 3:x1 - 3] = 1
    region *= ~pok
    region = ndimage.gaussian_filter(region, 1.5)
    rng = np.random.default_rng(zlib.crc32(face["id"].encode()))
    field = ndimage.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 1.6)
    field /= field.std()
    gy, gx = np.gradient(field)
    out = []
    for dx, dy in ((-1, -1), (1, 1)):
        shade = -(gx * dx + gy * dy) / np.sqrt(2)
        shade /= shade.std()
        glint = np.clip((shade - 1.1) / 1.2, 0, 1) ** 1.3
        out.append(white_alpha(glint * region * (alpha > 0.5) * 255))
    return out[0], out[1]


def save(im: Image.Image, path: Path, a: argparse.Namespace) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=a.quality, alpha_quality=a.alpha_quality, method=6)
    print(f"  {path.relative_to(ROOT)} {im.size} {path.stat().st_size // 1024} KB")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default="", help="comma-separated card ids (default: every face)")
    ap.add_argument("--cache", default="/tmp/claude-0/-home-user-poke-pack/ac507e08-34cd-5d8d-826a-5c5dc46c57e2/scratchpad/bw-secret/live")
    ap.add_argument("--sigma", type=float, default=0.6)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=70)
    ap.add_argument("--force", action="store_true", help="rewrite outputs that exist (only before the family ships)")
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    made = 0
    for f in faces():
        if wanted and f["id"] not in wanted:
            continue
        name = f"{f['set']}-{f['n']}"
        foil, etch = fetch(f, "foil", cache), fetch(f, "etch", cache)
        jobs = [("etch", lambda: [etch_lines(etch, a.sigma)])]
        if f["set"] in GOLD_SETS:
            jobs.append(("metal+holo", lambda: list(metal_and_holo(foil, f["layout"]))))
        if f["id"] in GRAIN:
            jobs.append(("grain", lambda: list(grain(f, foil, etch))))
        for kind, build in jobs:
            paths = {"etch": [OUT / "etch" / f"{name}.webp"],
                     "metal+holo": [OUT / "metal" / f"{name}.webp", OUT / "holo" / f"{name}.webp"],
                     "grain": [OUT / "grain" / f"{name}-a.webp", OUT / "grain" / f"{name}-b.webp"]}[kind]
            if all(p.exists() for p in paths) and not a.force:
                continue
            for im, p in zip(build(), paths):
                save(im, p, a)
                made += 1
    print(f"{made} maps written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
