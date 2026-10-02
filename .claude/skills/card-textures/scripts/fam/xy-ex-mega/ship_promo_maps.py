#!/usr/bin/env python3
"""Ship TCG Live's own foil maps for the xy-ex-mega family's black star promos (assets/foil/fam/xy-ex-mega/<id>-map.webp).

The 40 Pokemon-EX / Mega EX promos of the family (xy1-xyp009 ... xy12-xyp171) carry no `foilMap` in data/*.json, so the
site drew them on the all-white fallback map (foil over the Pokemon and the lettering). TCG Live has a map for each
(xybsp_en_<nnn>_std.foil.png, 367 x 512): the foil is the frame and the art background, the Pokemon, the text box and the
lettering are matte. This writes it in the same format as assets/foil/maps/: white with alpha = how much foil shows through
the ink (Live's "not foil" floor, 22/255, stretched to 0). New files only.

Source: https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/xybsp/xybsp_en_<nnn>_std.foil.png (cached in --cache).
    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/ship_promo_maps.py
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-ex-mega"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/xybsp/xybsp_en_{n:03d}_std.foil.png"
FLOOR = 22

LIST_JS = r"""
import { readFileSync, readdirSync } from "node:fs";
const ROOT = process.argv[1];
const fam = await import(`${ROOT}/js/fam/xy-ex-mega.js`);
const out = [];
for (const f of readdirSync(`${ROOT}/data`).filter((f) => f.endsWith(".json"))) {
  let d; try { d = JSON.parse(readFileSync(`${ROOT}/data/${f}`, "utf8")); } catch { continue; }
  for (const raw of Array.isArray(d) ? d : d.cards || []) {
    if (!raw?.id) continue;
    const c = raw.foilAs ? { ...raw, rarity: raw.foilAs } : raw;
    if (fam.claims(c) && !raw.foilMap) out.push(raw.id);
  }
}
console.log(JSON.stringify(out));
"""


def luminance(path: Path) -> np.ndarray:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    return np.clip((lum - FLOOR) * (255 / (255 - FLOOR)), 0, 255)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default="/tmp/xy-ex-mega-live")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    ids = json.loads(subprocess.run(["node", "--input-type=module", "-e", LIST_JS, str(ROOT)], capture_output=True, text=True, check=True).stdout)
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    done, missing = 0, []
    for cid in ids:
        m = re.fullmatch(r"[a-z0-9]+-xyp(\d+)", cid)
        if not m:
            missing.append(cid)
            continue
        n = int(m.group(1))
        src = cache / f"{n:03d}.png"
        if not src.exists():
            try:
                with urllib.request.urlopen(BASE.format(n=n), timeout=60) as r:
                    src.write_bytes(r.read())
            except Exception:
                missing.append(cid)
                continue
        out = OUT / f"{cid}-map.webp"
        if a.force or not out.exists():
            al = luminance(src).round().clip(0, 255).astype(np.uint8)
            w = np.full_like(al, 255)
            Image.fromarray(np.dstack([w, w, w, al]), "RGBA").save(out, "WEBP", quality=90, alpha_quality=90, method=6)
        done += 1
    print(f"{len(ids)} promo faces: {done} Live foil maps shipped; none: {', '.join(missing) or '-'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
