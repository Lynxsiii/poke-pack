#!/usr/bin/env python3
"""Cut the Pokémon out of maps that already shipped: the next version of each map, with no foil on the figure.

Why: the WotC Neo family maps took their matte (the Pokémon, printed on white ink, which does not shine) from hand hints.
Where a hint missed a limb or the body, the cosmos flecks and the sheen sat on the Pokémon (2026-11-28 site review:
"rainbow confetti on Steelix's body", "mask out of line, a doubled wing edge"). This takes the figure from the card's own
scan with make_figure_masks.figure_mask() (foil grain + SAM2) and multiplies every listed map's alpha by (1 - figure), so
the old matte is kept and only widened. It never overwrites: each map is written under --to (v2 -> v3).

    cut_figure_from_maps.py --set neo1 --cards 5,9,15 --models DIR \
        --maps "assets/foil/fam/wotc-neo-genesis/{n}-bg-v2.webp,assets/foil/fam/wotc-neo-genesis/{n}-fleck-a-v2.webp" \
        --from v2 --to v3 [--crop 61,94,539,430] [--window assets/foil/wotc-win/pokemon-v1.webp] [--preview DIR] [--dry]

  --crop    the maps are this box of the 600 x 838 scan (omit when a map is the whole card)
  --zone    where the figure may be (default: --crop, else the WotC Pokémon window 61,94,539,430)
A figure that covers more than --max-cover of the zone is refused (the cut found the background, not the Pokémon): look at
the preview (figure tinted magenta) before shipping any of them, and list only the good cards in the family module.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, HERE)
import make_figure_masks as FIG  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", required=True)
    ap.add_argument("--maps", required=True)
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", required=True)
    ap.add_argument("--crop")
    ap.add_argument("--zone")
    ap.add_argument("--window", default="assets/foil/wotc-win/pokemon-v1.webp")
    ap.add_argument("--models")
    ap.add_argument("--preview")
    ap.add_argument("--max-cover", type=float, default=0.7)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--panels", type=int, default=1, help="the map is a sprite of this many equal panels side by side")
    a = ap.parse_args()
    crop = tuple(int(v) for v in a.crop.split(",")) if a.crop else None
    zone = tuple(int(v) for v in a.zone.split(",")) if a.zone else (crop or (61, 94, 539, 430))
    window = FIG.load_mask(os.path.join(ROOT, a.window)) if a.window else None
    sam = FIG.Sam(a.models) if a.models else None
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
    bad = []
    for n in a.cards.split(","):
        scan = np.asarray(Image.open(os.path.join(ROOT, f"assets/cards/{a.set}/{n}.webp")).convert("RGB").resize((600, 838), Image.LANCZOS))
        fig, info = FIG.figure_mask(scan, zone, window, False, sam)
        ok = info["cover"] <= a.max_cover
        print(f"{a.set}-{n}: {info}{'' if ok else '  <-- refused'}", flush=True)
        if a.preview:
            FIG.preview(scan, 1 - fig, zone, os.path.join(a.preview, f"{a.set}-{n}.jpg"))
        if not ok:
            bad.append(n)
            continue
        # 1 px grown so the printed outline is inside the matte, 1 px feathered
        keep = np.clip(ndi.distance_transform_edt(fig < 0.5) - 1.0, 0, 1).astype(np.float32)
        for tpl in a.maps.split(","):
            src = os.path.join(ROOT, tpl.format(n=n))
            dst = src.replace(f"-{a.src}.webp", f"-{a.to}.webp") if a.src else src[:-5] + f"-{a.to}.webp"
            if dst == src or os.path.exists(dst):
                sys.exit(f"refusing to overwrite {dst}")
            im = np.asarray(Image.open(src).convert("RGBA")).copy()
            k = keep[crop[1]:crop[3], crop[0]:crop[2]] if crop else keep
            if a.panels > 1:  # a sprite of equal panels side by side (ex-cosmos-holo: area | dots A | dots B)
                k = np.concatenate([k] * a.panels, 1)
            if k.shape != im.shape[:2]:
                k = np.asarray(Image.fromarray((k * 255).astype(np.uint8)).resize((im.shape[1], im.shape[0]), Image.BILINEAR), np.float32) / 255
            im[..., 3] = np.round(im[..., 3] * k).astype(np.uint8)
            im[im[..., 3] == 0, :3] = 0
            if not a.dry:
                Image.fromarray(im, "RGBA").save(dst, lossless=True, quality=100, method=6, exact=True)
    if bad:
        print("refused:", ",".join(bad), file=sys.stderr)


if __name__ == "__main__":
    main()
