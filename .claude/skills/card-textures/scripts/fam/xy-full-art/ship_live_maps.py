#!/usr/bin/env python3
"""Ship TCG Live's own etch and foil maps for the xy-full-art holo family, at Live's native size.

What it writes (into assets/foil/fam/xy-full-art/, new files only):

- `<id>-etch.webp`: TCG Live's etch map of the print, 733 x 1024: the engraved texture of an XY full art or
  secret rare (contour and fingerprint line fields that follow the drawing, solid where a shape is raised
  whole, black where the print is smooth: the attack text, the rule box, the Mega badge). White with
  alpha = the etch; Live's "not etched" floor (22/255) stretched to 0; a sub-pixel blur (sigma 0.6) so a
  one-pixel line does not alias when the browser resamples it to phone size. No grain, no downscale: the
  era's 400 px copies (assets/foil/maps/<set>/<n>-etch.webp) read as soft blotches where the real cards show
  fine ridges (SKILL.md, "Camouflage blotches").
- `<id>-map.webp`: TCG Live's foil map, 367 x 512, for the family's promos that Live has a map for but
  data/*.json does not (the Mythical, Red & Blue and Super-Premium collections in g1, the Legendary
  collection in xy8, Mawile-EX in xy10). Same format as assets/foil/maps/: white with alpha = how much
  foil shows through the ink.

Which cards: every face js/fam/xy-full-art.js claims (listed through node, so the list cannot drift from
the module). The source: https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<key>/<key>_en_<nnn>_std.
{foil,etch}.png, key = the set id for xy1..xy12, xy9-5 for Generations, xybsp for the black star promos
(the "a" prints have no Live map of their own; xybsp's 150, 198 and 200 are the regular prints: xyp150a borrows
xybsp 150's foil map, see A_PRINT_MAP).

Deterministic and re-runnable: downloads are cached (--cache), an output that exists is kept unless --force
(only until the family ships; after that a changed map goes to a new -vN name).

    python3 .claude/skills/card-textures/scripts/fam/xy-full-art/ship_live_maps.py
    python3 .claude/skills/card-textures/scripts/fam/xy-full-art/ship_live_maps.py --ids xy6-105,xy7-98 --force
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-full-art"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
FLOOR = 22  # TCG Live's "not foil" / "not etched" luminance
KEYS = {"g1": "xy9-5", "dc1": "xy5-5"}
# The "a" prints of the Premium Trainer's XY Collection share their art with a regular xybsp print. xyp150a borrows the
# FOIL map of xybsp 150 (smooth print: no etch is shipped for it). xyp198a and xyp200a use the maps already shipped for
# their regular prints (assets/foil/maps/xyp/xyp198.webp, xyp200.webp: BORROWED_MAP in js/fam/xy-full-art.js); Live has no xybsp 177.
A_PRINT_MAP = {"xyp-xyp150a": ("xybsp", 150)}

LIST_JS = r"""
import { readFileSync, readdirSync } from "node:fs";
const ROOT = process.argv[1];
const fam = await import(`${ROOT}/js/fam/xy-full-art.js`);
const out = [];
for (const f of readdirSync(`${ROOT}/data`).filter((f) => f.endsWith(".json"))) {
  let d;
  try { d = JSON.parse(readFileSync(`${ROOT}/data/${f}`, "utf8")); } catch { continue; }
  for (const raw of Array.isArray(d) ? d : d.cards || []) {
    if (!raw?.id) continue;
    const c = raw.foilAs ? { ...raw, rarity: raw.foilAs } : raw;
    if (fam.claims(c)) out.push({ id: raw.id, foilMap: raw.foilMap || null, etchMap: raw.etchMap || null });
  }
}
console.log(JSON.stringify(out));
"""


def claimed() -> list[dict]:
    res = subprocess.run(["node", "--input-type=module", "-e", LIST_JS, str(ROOT)], capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def live_source(card_id: str) -> tuple[str, int] | None:
    if card_id in A_PRINT_MAP:
        return A_PRINT_MAP[card_id]
    set_id, number = card_id.split("-", 1)
    promo = re.fullmatch(r"xyp(\d+)", number)
    if promo:
        return "xybsp", int(promo.group(1))
    if number.isdigit():
        return KEYS.get(set_id, set_id), int(number)
    return None  # an "a" print or anything else Live has no map for


def fetch(url: str, dest: Path) -> bool:
    if dest.exists():
        return True
    miss = dest.with_suffix(dest.suffix + ".none")
    if miss.exists():
        return False
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
    except Exception:
        miss.write_text("")
        return False
    dest.write_bytes(data)
    return True


def luminance(path: Path) -> np.ndarray:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    return np.clip((lum - FLOOR) * (255 / (255 - FLOOR)), 0, 255)


def white_alpha(alpha: np.ndarray) -> Image.Image:
    a = alpha.round().clip(0, 255).astype(np.uint8)
    white = np.full_like(a, 255)
    return Image.fromarray(np.dstack([white, white, white, a]), "RGBA")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", default="", help="comma-separated card ids (default: every claimed face)")
    ap.add_argument("--cache", default="/tmp/xy-full-art-live", help="where the raw Live PNGs are cached")
    ap.add_argument("--sigma", type=float, default=0.6, help="etch blur in map pixels (sub-pixel: keep under 0.7)")
    ap.add_argument("--quality", type=int, default=75)
    ap.add_argument("--alpha-quality", type=int, default=50, help="lossy alpha: about half the bytes of 80, mean error 4/255 on a binary line map")
    ap.add_argument("--force", action="store_true", help="rewrite outputs that exist (before the family ships only)")
    a = ap.parse_args()

    cards = claimed()
    wanted = {s.strip() for s in a.ids.split(",") if s.strip()}
    if wanted:
        cards = [c for c in cards if c["id"] in wanted]
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    jobs = []
    for c in cards:
        src = live_source(c["id"])
        if not src:
            continue
        key, n = src
        for kind in ("foil",) if c["id"] in A_PRINT_MAP else ("foil", "etch"):
            jobs.append((f"{BASE}/{key}/{key}_en_{n:03d}_std.{kind}.png", cache / f"{c['id']}.{kind}.png"))
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda j: fetch(*j), jobs))

    etched = mapped = 0
    no_live = []
    for c in cards:
        if not live_source(c["id"]):
            no_live.append(c["id"])
            continue
        etch_src, foil_src = cache / f"{c['id']}.etch.png", cache / f"{c['id']}.foil.png"
        if etch_src.exists():
            out = OUT / f"{c['id']}-etch.webp"
            if a.force or not out.exists():
                lum = luminance(etch_src)
                if a.sigma > 0:
                    lum = ndimage.gaussian_filter(lum, a.sigma)
                white_alpha(lum).save(out, "WEBP", quality=a.quality, alpha_quality=a.alpha_quality, method=6)
            etched += 1
        elif c["etchMap"]:
            print(f"  {c['id']}: data has an etch map but Live gave none")
        if not c["foilMap"]:
            if foil_src.exists():
                out = OUT / f"{c['id']}-map.webp"
                if a.force or not out.exists():
                    white_alpha(luminance(foil_src)).save(out, "WEBP", quality=90, alpha_quality=90, method=6)
                mapped += 1
            else:
                no_live.append(c["id"])
    print(f"{len(cards)} faces: {etched} native etches, {mapped} promo foil maps; no Live map: {', '.join(no_live) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
