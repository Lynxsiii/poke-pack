#!/usr/bin/env python3
"""List the Sun & Moon full arts whose Pokémon is matte (alternate arts).

A standard full-art GX / Tag Team is foil edge to edge: TCG Live's foil map
greys the Pokémon (part strength). An alternate art (the painted Tag Teams of
Team Up to Cosmic Eclipse) and Cosmic Eclipse's full-colour secret Pokémon
are foil on the scenery only: the Pokémon is black in the map. The card data
does not say which is which, so this measures it: the share of the picture
window that is "not foil" in TCG Live's map (luminance near its 22/255
floor). Alternate arts measure 25% and up, standard full arts close to 0.

    python3 .claude/skills/card-textures/scripts/sm_alt_art.py sm9 sm12 ...

Needs data/<set>.json and the raw maps in lab/cache/<set>/ (fetch_foil_maps.py
fills them; this fetches the Rare Ultra / Rare Secret Pokémon it needs). Prints
the ids to paste into SM_ALT_ART in js/sm-foil.js, with the measure.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CACHE = HERE.parent / "lab" / "cache"
THRESH = 0.3  # share of the window that is not foil; standard full arts sit under 0.2, alternate arts over 0.45


def matte_share(png: Path) -> float:
    a = np.asarray(Image.open(png).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    h, w = lum.shape
    win = lum[int(h * 0.14):int(h * 0.52), int(w * 0.06):int(w * 0.94)]
    return float((win < 40).mean())


def main() -> int:
    out = []
    for st in sys.argv[1:]:
        p = ROOT / "data" / f"{st}.json"
        d = json.loads(p.read_text(encoding="utf-8"))
        cs = d if isinstance(d, list) else d["cards"]
        want = [c for c in cs if c["supertype"] == "Pokémon" and c["rarity"] in ("Rare Ultra", "Rare Secret")
                and str(c["number"]).isdigit()]
        need = [str(c["number"]) for c in want if not (CACHE / st / f"{c['number']}.foil.png").exists()]
        if need:
            subprocess.run([sys.executable, str(HERE / "fetch_foil_maps.py"), "--set", st, "--cards", ",".join(need)],
                           capture_output=True)
        for c in want:
            f = CACHE / st / f"{c['number']}.foil.png"
            if not f.exists():
                print(f"  {c['id']}: no map", file=sys.stderr)
                continue
            m = matte_share(f)
            tag = "ALT" if m >= THRESH else "   "
            print(f"{tag} {c['id']:<10} {m:5.2f}  {c['name']} ({c['rarity']})")
            if m >= THRESH:
                out.append(c["id"])
    print("\n" + ", ".join(f'"{i}"' for i in out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
