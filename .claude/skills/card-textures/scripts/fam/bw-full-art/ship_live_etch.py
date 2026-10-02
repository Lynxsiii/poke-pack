#!/usr/bin/env python3
"""Ship TCG Live's etch for the textured Black & White full arts at its native size.

The holo family bw-full-art (js/fam/bw-full-art.js, css/holo/fam/bw-full-art.css) draws the engraving of
every textured full art (Next Destinies to Plasma Blast: the full-art Pokemon-EX and the full-art Supporters)
from TCG Live's own etch map. The copies under assets/foil/maps/<set>/<n>-etch.webp were shipped at 400 px wide
(fetch_foil_maps.py --ship), which halves the line pitch (about 6.5 px at Live's 733 px becomes 3.5 px) and,
once the browser scales it back up to a phone's 660 device px, blurs the hatch into a grey weave: the texture
Noah could not see ("some ultra rares dont have textures"). Black & White to Noble Victories (bw1-bw3) are not
engraved: Live's "etch" for them is a two-level silhouette (white: the Pokemon, the frame, the lettering; black: the
background, which the real card prints on a stippled sand foil), shipped too so the family's CSS can cut its sand
to the background at full size. This keeps Live's 733 x 1024 map: the floor (22,
TCG Live's "not etched") stretched to 0 as every shipped map does, a sub-pixel blur (sigma 0.6, the skill's
native_era_etch.py) so a one-pixel line does not alias when the browser resamples it, nothing else. Never
soften a Live etch further.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/ship_live_etch.py            # every face
    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/ship_live_etch.py --cards bw4-98,bw7-147

Reads the family's faces from data/<set>.json (rarity "Rare Ultra", sets bw1..bw10, with an etchMap), downloads https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<set>/<set>_en_<nnn>_std.etch.png
into --cache (default: a scratch folder, never the repo), and writes
assets/foil/fam/bw-full-art/etch/<set>-<n>.webp (white, alpha = the etch). Existing outputs are left alone unless
--force: once the family ships, a changed map takes a new name (-v2), since /assets/* is cached for a year.
Writes nothing else; data/*.json is untouched (js/fam/bw-full-art.js names the files).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-full-art" / "etch"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
FLOOR = 22
SETS = ["bw1", "bw2", "bw3", "bw4", "bw5", "bw6", "bw7", "bw8", "bw9", "bw10"]


def faces() -> list[dict]:
    """Every Rare Ultra of bw1..bw10 TCG Live has an etch for (an etchMap in the data): bw4 on engraved, bw1-bw3 silhouettes."""
    out = []
    for s in SETS:
        data = json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8"))
        for c in data if isinstance(data, list) else data["cards"]:
            if c.get("rarity") == "Rare Ultra" and c.get("etchMap") and str(c.get("number", "")).isdigit():
                out.append({"id": c["id"], "set": s, "n": int(c["number"])})
    return out


def fetch(face: dict, cache: Path) -> Path:
    dst = cache / f"{face['set']}_{face['n']:03d}.etch.png"
    if not dst.exists():
        url = f"{BASE}/{face['set']}/{face['set']}_en_{face['n']:03d}_std.etch.png"
        subprocess.run(["curl", "-sf", "-m", "60", "-o", str(dst), url], check=True)
    return dst


def build(src: Path, sigma: float) -> Image.Image:
    a = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = np.clip((lum - FLOOR) * (255 / (255 - FLOOR)), 0, 255)
    if sigma > 0:
        lum = ndimage.gaussian_filter(lum, sigma)
    lum = lum.round().astype(np.uint8)
    white = np.full_like(lum, 255)
    return Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default="", help="comma-separated card ids (default: every face)")
    ap.add_argument("--cache", default="/tmp/claude-0/-home-user-poke-pack/ac507e08-34cd-5d8d-826a-5c5dc46c57e2/scratchpad/bw-full-art/live")
    ap.add_argument("--sigma", type=float, default=0.6)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=60)
    ap.add_argument("--force", action="store_true", help="rewrite outputs that exist (only before the family ships)")
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    made = 0
    for f in faces():
        if wanted and f["id"] not in wanted:
            continue
        out = OUT / f"{f['set']}-{f['n']}.webp"
        if out.exists() and not a.force:
            continue
        src = fetch(f, cache)
        im = build(src, a.sigma)
        im.save(out, "WEBP", quality=a.quality, alpha_quality=a.alpha_quality, method=6)
        made += 1
        print(f"  {f['id']}: {out.relative_to(ROOT)} {im.size} {out.stat().st_size // 1024} KB")
    print(f"{made} etch maps written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
