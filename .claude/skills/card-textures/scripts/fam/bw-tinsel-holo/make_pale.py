"""List the bw-tinsel-holo family's pale-window Tinsel faces (class `bwt-pale` in js/fam/bw-tinsel-holo.js).

Why: under a lamp a real Tinsel crest throws its own pastel, and how much of it shows depends on the ink over the foil:
over pale ink the colour is plain (Articuno 32/113 tilted: pink, peach, green and lavender ridges side by side over the
sky), over dark ink the crest stays a silver-white line with at most a faint tint (the Victini 14/101 tilt video, the
Klinklang 90/135 zoom; the round-2 review). The `.foil` layer is hard-light, which tints dark ink twice as much as the
same source tints pale ink, so one recipe cannot do both: the family keeps the ridge hues faint under a broad silver
by default (dark and mid windows: Victini, Cobalion, Weezing, Electivire, Meloetta) and lets them show through a wider
band on the faces whose foiled window is mostly pale ink, listed here.

A face is pale when the mean luma of its scan under its foil map (alpha-weighted, full-strength map copies from
make_maps.py) is at least PALE and at most DARK_MAX of the foiled area is dark ink (luma under 0.35).

    ROOT=. node /home/user/holo-tools/census.mjs > /tmp/census.json
    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_pale.py --census /tmp/census.json [--all]

Prints the ids as a JS string for the module's PALE set (and with --all every face's numbers).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
SRC = "assets/foil/maps/"
DST = "assets/foil/fam/bw-tinsel-holo/maps/"
V = "v1"
PALE = 0.62
DARK_MAX = 0.12
# faces given the pale recipe although their window is not pale, on photo evidence
EXTRA = {
    "bw10-16": "Blastoise 16/101 pack-pull photo: bright rainbow streak blocks over the dark water right of its head",
}


def data_maps() -> dict:
    out = {}
    for f in (ROOT / "data").glob("*.json"):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        cards = d.get("cards", d) if isinstance(d, dict) else d
        if not isinstance(cards, list):
            continue
        for c in cards:
            if isinstance(c, dict) and c.get("id") and c.get("foilMap"):
                out.setdefault(c["id"], c["foilMap"])
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--census", required=True)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    rows = json.loads(Path(args.census).read_text())
    maps = data_maps()
    pale = []
    for r in rows:
        if r.get("family") != "bw-tinsel-holo" or "bwt-tinsel" not in r.get("classes", "").split():
            continue
        m = maps.get(r["id"], "")
        if not m.startswith(SRC):
            continue
        mp = ROOT / (DST + m[len(SRC):-5] + f"-{V}.webp")
        if not mp.exists():
            continue
        a = np.asarray(Image.open(mp).convert("RGBA"))[..., 3].astype(float) / 255
        img = Image.open(ROOT / r["img"]).convert("RGB").resize((a.shape[1], a.shape[0]), Image.BILINEAR)
        rgb = np.asarray(img).astype(float) / 255
        luma = rgb @ np.array([0.2126, 0.7152, 0.0722])
        wsum = a.sum()
        if wsum < 1:
            continue
        mean = float((a * luma).sum() / wsum)
        dark = float((a * (luma < 0.35)).sum() / wsum)
        ok = (mean >= PALE and dark <= DARK_MAX) or r["id"] in EXTRA
        if args.all:
            print(f"{r['id']:16s} {r['name'][:16]:16s} mean {mean:.2f} dark {dark:.2f} {'PALE' if ok else ''}")
        if ok:
            pale.append(r["id"])
    print(f"// {len(pale)} pale faces")
    print(" ".join(pale))


if __name__ == "__main__":
    main()
