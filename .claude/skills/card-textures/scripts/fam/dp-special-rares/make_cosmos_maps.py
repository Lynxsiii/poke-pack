#!/usr/bin/env python3
"""Draw the cosmos maps of the Arceus AR1-AR9 (pl4) and Shiny Legendary SL1-SL11 (col1) cards: assets/foil/fam/dp-special-rares/cos-<id>.webp.

Same maps as the live dp-cosmos-holo family (scripts/fam/dp-cosmos-holo/): 600 x 838 RGBA, alpha = the era's art window minus the
Pokemon (ink over foil on the real card), RGB = the cosmos flecks, each element one saturated hue. Two steps, both that family's scripts
run on these ids (nothing here edits them):

  1. auto_mask.py   SAM2-small cut-out of the Pokemon -> <work>/masks/<id>.npz   (about 8 s a card on a quiet box, 30 s under load)
  2. gen_maps.py    flecks + the cut-out -> <work>/out/<set>/<n>.webp

then copies each map you list in --install to cos-<n lower case>.webp. Judge every cut-out by eye before installing: a cut that picked the
background instead of the Pokemon puts the foil ON the creature (Arceus AR5, whose art is a dark disc, did) and must stay out of COSMOS
in js/fam/dp-special-rares.js. AR5, SL2, SL8 and SL11 were re-cut with make_cosmos_masks_manual.py (hand-picked SAM2 prompts) and run through
gen_maps.py again; those four are in COSMOS.

    python3 make_cosmos_maps.py --models DIR_WITH_SAM2_ONNX --work DIR [--install pl4-AR1,col1-SL10]
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
COS = ROOT / ".claude" / "skills" / "card-textures" / "scripts" / "fam" / "dp-cosmos-holo"
OUT = ROOT / "assets" / "foil" / "fam" / "dp-special-rares"
IDS = [f"pl4-AR{i}" for i in range(1, 10)] + [f"col1-SL{i}" for i in range(1, 12)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", required=True, type=Path)
    ap.add_argument("--work", required=True, type=Path)
    ap.add_argument("--install", default="", help="comma list of ids whose map to copy into assets/foil/fam/dp-special-rares/")
    a = ap.parse_args()
    a.work.mkdir(parents=True, exist_ok=True)
    rows = [dict(id=i, img=f"assets/cards/{i.split('-')[0]}/{i.split('-', 1)[1]}.webp",
                 map="assets/foil/dp-win/" + ("dp-basic.webp" if i.startswith("pl4") else "hgss-basic.webp")) for i in IDS]
    census = a.work / "census.json"
    census.write_text(json.dumps(rows))
    (a.work / "masks").mkdir(exist_ok=True)
    subprocess.run([sys.executable, str(COS / "auto_mask.py"), "--models", str(a.models), "--out", str(a.work / "masks"),
                    "--census", str(census), *IDS], check=True)
    subprocess.run([sys.executable, str(COS / "gen_maps.py"), "--census", str(census), "--masks", str(a.work / "masks"),
                    "--out", str(a.work / "out"), *IDS], check=True)
    for i in [x for x in a.install.split(",") if x]:
        s, n = i.split("-", 1)
        shutil.copy(a.work / "out" / s / f"{n}.webp", OUT / f"cos-{n.lower()}.webp")
        print("installed", OUT / f"cos-{n.lower()}.webp")


if __name__ == "__main__":
    main()
