"""Per-card light masks of the Black & White ACE SPEC Trainers (family bw-ex-ace): where the coloured dashes may light.

What the real card does (audit 2026-10-22, /home/user/holo-refs/bw-ace: Crystal Wall, Master Ball and Computer Search
zooms, the room-light fan): the foil is the TCG Live map's (border ring, art ground, name strip, ACE SPEC lettering, rule
pill), but dark ink printed over it stays dark: the black name pill, Crystal Wall's black ground and Master Ball's or
Dowsing Machine's dark swirl show only thin bright lines, never a coloured sheet. The site's ACE recipe lays each dash's hue
on with hard-light (the only blend that gives a saturated colour on the pale silver border), and hard-light lifts black,
so the colour layer needs to know where the ink is dark. A luminance mask of the scan in CSS (mask-mode: luminance) drew
nothing in Chromium or WebKit here, so the gate is baked per card.

What this writes: for each ACE SPEC print, assets/foil/fam/bw-ex-ace/ace-<set>-<n>.webp (the map's size, white with
alpha) = the TCG Live map added to itself (2a - a^2, as the EX recipe's double map) times a smoothstep of the scan's
luminance (0 at or under LO, 1 at or over HI), so the dashes light the border and the art ground fully and fade out over
dark ink. js/fam/bw-ex-ace.js points --bxa-ace-mask at it.

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ace_masks.py [--lo 0.10 --hi 0.40]

Re-running with the same arguments rewrites the same bytes. Once shipped, a changed mask needs a new name (-v2).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
CARDS = {"bw7": [137, 138, 139, 140], "bw8": [128, 129, 130], "bw9": [107, 108], "bw10": [92, 93, 94, 95]}


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lo", type=float, default=0.10, help="scan luminance at and under which no colour lights")
    ap.add_argument("--hi", type=float, default=0.40, help="scan luminance at and over which the full colour lights")
    ap.add_argument("--suffix", default="", help="name suffix for a redrawn set, e.g. -v2")
    a = ap.parse_args()
    for st, nums in CARDS.items():
        data = {str(c.get("number")): c for c in json.loads((ROOT / f"data/{st}.json").read_text())}
        for n in nums:
            rec = data[str(n)]
            m = Image.open(ROOT / rec["foilMap"]).convert("RGBA")
            al = np.asarray(m, np.float32)[..., 3] / 255
            scan = Image.open(ROOT / f"assets/cards/{st}/{n}.webp").convert("RGB").resize(m.size, Image.LANCZOS)
            rgb = np.asarray(scan, np.float32) / 255
            lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
            out_a = (2 * al - al * al) * smooth(lum, a.lo, a.hi)
            a8 = (np.clip(out_a, 0, 1) * 255).round().astype(np.uint8)
            white = np.full_like(a8, 255)
            out = ROOT / f"assets/foil/fam/bw-ex-ace/ace-{st}-{n}{a.suffix}.webp"
            Image.fromarray(np.dstack([white, white, white, a8]), "RGBA").save(out, "WEBP", quality=85, alpha_quality=80, method=6)
            print(out.relative_to(ROOT), out.stat().st_size, "bytes; mean alpha", round(float(a8.mean()), 1))


if __name__ == "__main__":
    main()
