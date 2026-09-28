#!/usr/bin/env python3
"""Make the soft engraving map a gold (Scodix) print draws its dark line art
with: the TCG Live etch map blurred a little, so the thick outlines stay
dark and the fine hatch on the gold fills averages to a satin tone instead
of aliasing into speckle.

At viewer size (a 300 px card on a desktop, or 220 px on a phone) a 3 px
hatch from a 400 px map lands between pixels; difference-blended dark at
full strength it came out as a rough speckle over the whole gold and the
text (Chien-Pao ex 242, Noah 2026-09-28: "I really hope this isnt the one
it pushed"). The real card (Ting-Lu ex 244 in flat light) shows smooth
satin gold with darker gold outlines: outlines from the line art, satin
from the hatch too fine to see. A blur of about a pixel at map size gives
exactly that at any screen scale.

    python3 .claude/skills/card-textures/scripts/soften_etch.py --set sv4pt5 --all
    python3 .claude/skills/card-textures/scripts/soften_etch.py --set sv8pt5 --cards 175,176

--all takes every print with `finish: "scodix"` and an `etchMap`; writes
assets/foil/maps/<set>/<n>-etch-soft.webp and sets `etchSoft` on the card
(js/foil-maps.js passes it as `--etch-soft`).
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[4]
SIGMA = 1.2      # px at the map's own size (400 px wide)
GAIN = 1.2       # lifts the blurred outlines back to near full alpha
POWER = 2.6      # curve: the hatch tone (about 0.75 after the blur) drops to
                 # about 0.47 so the gold fills stay bright satin, while the
                 # solid line art (near 1.0) keeps nearly all its depth


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", default="", help="comma-separated numbers")
    ap.add_argument("--all", action="store_true", help="every scodix print with an etch map")
    a = ap.parse_args()
    path = ROOT / "data" / f"{a.set}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else data["cards"]
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    changed = 0
    for c in records:
        if wanted and str(c.get("number")) not in wanted:
            continue
        if not wanted and not (a.all and c.get("finish") == "scodix"):
            continue
        if not c.get("etchMap"):
            print(f"  {c['id']}: no etch map, skipped")
            continue
        src = ROOT / c["etchMap"]
        alpha = np.asarray(Image.open(src).convert("RGBA"))[..., 3].astype(np.float32) / 255
        soft = np.clip(ndimage.gaussian_filter(alpha, SIGMA) * GAIN, 0, 1) ** POWER
        out = src.with_name(src.name.replace("-etch.webp", "-etch-soft.webp"))
        a8 = (soft * 255).round().astype(np.uint8)
        rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
        Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=80, alpha_quality=80, method=6)
        rel = str(out.relative_to(ROOT)).replace("\\", "/")
        print(f"  {c['id']} {c.get('name')}: etched area tone {float(soft[(alpha > 0.5)].mean()):.2f}, {out.stat().st_size // 1024} KB")
        if c.get("etchSoft") != rel:
            c["etchSoft"] = rel
            changed += 1
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"{a.set}: {changed} card(s) now carry etchSoft")
    return 0


if __name__ == "__main__":
    sys.exit(main())
