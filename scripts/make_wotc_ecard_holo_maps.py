#!/usr/bin/env python3
"""Draw the e-Card Rare Holo foil maps: assets/foil/wotc-ecard/holo-<set>-<n>-v1.webp (every Rare Holo of ecard1, ecard2, ecard3).

Review finding (rv-j2): the one shared art-window mask (win-pokemon-v1) put the added cosmos flakes over the Pokemon too, and a
screened flake on dark ink (Gengar's belly, Mewtwo's legs) reads as a white block stuck on the drawing. On the real cards the Pokemon
is nearly clear (Pokemon Holo tilt clips of Mewtwo 20, Butterfree 5, Nidoking H18, Blastoise 4: dots in the sky and the ground, the
body and the white wings clean), and the scan's own baked sparkle shows where the foil is. So each Rare Holo gets a map like the Crystal
Pokemon's (make_wotc_crystal_masks.py): the art window times a smoothed density of the scan's baked sparkle, with a floor so the
sheen and a few flakes still reach the Pokemon and a scan with little baked sparkle is not left bare.

    python3 scripts/make_wotc_ecard_holo_maps.py --root . [--suffix -v1] [--preview <png>]
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 838
FLOOR = 0.22  # the Pokemon keeps this much of the foil: a few flakes and the sheen, never a bare cut-out


def density(rgb, win):
    lum = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    tophat = lum - ndi.grey_opening(lum, size=(7, 7))
    fleck = (tophat > 38).astype(np.float32)
    dens = ndi.gaussian_filter(fleck, 11)
    dens[~win] = 0
    ref = np.percentile(dens[win], 80)
    d = np.clip(dens / max(ref, 1e-4), 0, 1)
    d = np.clip((d - 0.28) / 0.35, 0, 1)
    return ndi.gaussian_filter(d, 2.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    args = ap.parse_args()
    outd = os.path.join(args.root, "assets/foil/wotc-ecard")
    winimg = np.asarray(Image.open(os.path.join(outd, "win-pokemon-v1.webp")))[..., 3]
    win = winimg > 127
    a = winimg.astype(np.float32) / 255
    prev = []
    for s in ("ecard1", "ecard2", "ecard3"):
        d = json.load(open(os.path.join(args.root, "data", f"{s}.json")))
        for c in d["cards"] if isinstance(d, dict) else d:
            if c.get("rarity") != "Rare Holo":
                continue
            n = c["id"].split("-", 1)[1]
            rgb = np.asarray(Image.open(os.path.join(args.root, "assets/cards", s, f"{n}.webp")).convert("RGB").resize((W, H), Image.LANCZOS))
            m = np.clip(a * (FLOOR + (1 - FLOOR) * density(rgb, win)), 0, 1)
            path = os.path.join(outd, f"holo-{s}-{n}{args.suffix}.webp")
            if os.path.exists(path):
                raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
            rgba = np.zeros((H, W, 4), np.uint8)
            rgba[..., :3] = 255
            rgba[..., 3] = (m * 255).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
            if len(prev) < 12 or n in ("13", "20", "5"):
                prev.append(Image.fromarray(rgba[..., 3]).resize((150, 210)))
    if args.preview:
        sh = Image.new("L", (150 * len(prev), 210))
        for i, im in enumerate(prev):
            sh.paste(im, (i * 150, 0))
        sh.save(args.preview)


if __name__ == "__main__":
    main()
