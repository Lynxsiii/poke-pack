#!/usr/bin/env python3
"""Draw the Crystal Pokémon foil maps: assets/foil/wotc-ecard/crystal-<id>-v1.webp (ecard2 148-150, ecard3 145-150).

On a Crystal Pokémon (Aquapolis, Skyridge) the cosmos sparkle sits in the BACKGROUND of the art window and the Pokémon itself is
clear, unlike an ordinary e-Card holo whose dots run over everything in the window (scrydex scans of the nine cards; Pokemon Holo,
PSA and BGS slab clips of Crystal Charizard, Celebi, Golem, Kingdra, Lugia). There are only nine, so each card gets its own map
drawn from its own scan: the baked sparkle of the scan marks where the foil is (bright small peaks, a white top-hat, blurred into a
density); the Pokémon is where the density is low. Map = the art window (win-pokemon-v1) times that density, held between 0 and 1.

    python3 scripts/make_wotc_crystal_masks.py --root . [--suffix -v1] [--preview <png>]
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 838
CARDS = [("ecard2", n) for n in (148, 149, 150)] + [("ecard3", n) for n in (145, 146, 147, 148, 149, 150)]


def figure_free(rgb, win):
    lum = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    # a fleck: brighter than the neighbourhood within ~5 px
    tophat = lum - ndi.grey_opening(lum, size=(7, 7))
    sat = rgb.max(-1).astype(np.float32) - rgb.min(-1).astype(np.float32)
    fleck = (tophat > 38).astype(np.float32)
    dens = ndi.gaussian_filter(fleck, 11)
    dens[~win] = 0
    # normalise by the window's own typical density so a sparse card still gets its background
    ref = np.percentile(dens[win], 80)
    d = np.clip(dens / max(ref, 1e-4), 0, 1)
    d = np.clip((d - 0.28) / 0.35, 0, 1)
    d = ndi.gaussian_filter(d, 2.0)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    args = ap.parse_args()
    outd = os.path.join(args.root, "assets/foil/wotc-ecard")
    win = np.asarray(Image.open(os.path.join(outd, "win-pokemon-v1.webp")))[..., 3] > 127
    prev = []
    for s, n in CARDS:
        rgb = np.asarray(Image.open(os.path.join(args.root, "assets/cards", s, f"{n}.webp")).convert("RGB").resize((W, H), Image.LANCZOS))
        d = figure_free(rgb, win)
        a = np.asarray(Image.open(os.path.join(outd, "win-pokemon-v1.webp")))[..., 3].astype(np.float32) / 255
        m = np.clip(a * d, 0, 1)
        rgba = np.zeros((H, W, 4), np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = (m * 255).astype(np.uint8)
        path = os.path.join(outd, f"crystal-{s}-{n}{args.suffix}.webp")
        if os.path.exists(path):
            raise SystemExit(f"{path} exists: never overwrite a shipped asset, pass --suffix")
        Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
        print(path, "window foiled", round(float(m[win].mean()), 3))
        t = rgb.astype(np.float32) * (0.35 + 0.65 * m[..., None])
        prev.append(Image.fromarray(t.astype(np.uint8)).crop((40, 90, 580, 420)))
    if args.preview:
        sh = Image.new("RGB", (540 * 3, 330 * 3))
        for i, im in enumerate(prev):
            sh.paste(im, ((i % 3) * 540, (i // 3) * 330))
        sh.save(args.preview)


if __name__ == "__main__":
    main()
