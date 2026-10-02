#!/usr/bin/env python3
"""
Per-card foil maps for the ex-gold-star holo family (the Gold Star Pokémon of ex7-ex16, cosmos prints; the three
refractor stars, Gyarados/Charizard/Mew delta, are ex-delta-holon's).

The real card (photos in /mnt/project-files/holo-remaster/ex-gold-star/refs/): a plain yellow border and frame, an art window
that is cosmos foil BEHIND the Pokémon (glittering dots and clover clusters in the sky or the scenery), and a Pokémon
that is plain, matte ink coming out of its window. The scan already shows the dots it was photographed with.

For every face (list_cards.mjs, same folder) this reads assets/cards/<set>/<n>.webp (600 x 838) and writes
assets/foil/fam/ex-gold-star/<card id>-v1.webp, a lossless RGBA image registered to the scan:

  RGB    every compact colour spot the scan shows inside the art window (same detector as the Pokémon-ex maps,
         make_ex_pokemon_ex_maps.cosmos_dots), each one random saturated hue (seeded by the card id), grown by a pixel;
         dots sitting on the Pokémon are dropped (below);
  ALPHA  the foil ground: a soft glow around each kept dot, inside the art window (the era's window mask,
         assets/foil/ex-ex/win-A-basic.webp). There is no Pokémon silhouette to draw from the scan, so the density of the
         dots stands in for it: the cosmos is dense in the background and absent on the Pokémon's flat ink, so a dot
         far from the cosmos (a highlight on the Pokémon) is dropped, and no foil lies where there are no dots.

Deterministic (colours seeded by crc32 of the id). Usage (repo root):
  node .claude/skills/card-textures/scripts/fam/ex-gold-star/list_cards.mjs > /tmp/gs.json
  python3 .claude/skills/card-textures/scripts/fam/ex-gold-star/make_ex_gold_star_maps.py --cards /tmp/gs.json [--debug-dir <dir>]
Writes only into assets/foil/fam/ex-gold-star/ (and --debug-dir). Needs numpy, scipy, Pillow.
"""
import argparse
import importlib.util
import json
import os
import sys
import zlib

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
OUT_DIR = os.path.join(ROOT, "assets/foil/fam/ex-gold-star")
MAP_VERSION = 1
W, H = 600, 838

_spec = importlib.util.spec_from_file_location("exmaps", os.path.join(HERE, "..", "ex-pokemon-ex", "make_ex_pokemon_ex_maps.py"))
exmaps = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(exmaps)


def window_mask():
    a = np.asarray(Image.open(os.path.join(ROOT, "assets/foil/ex-ex/win-A-basic.webp")).convert("RGBA"))[..., 3] / 255.0
    return ndi.gaussian_filter(a.astype(np.float32), 0.6)


def draw(card, win, debug_dir):
    rgb, alpha = exmaps.load(card)
    z = np.clip(win * alpha, 0, 1)
    rng = np.random.default_rng(zlib.crc32(card["id"].encode()))
    tex, n = exmaps.cosmos_dots(rgb, z, rng)
    dots = tex.max(-1) > 0.05
    # the cosmos' density (dot pixels blurred): a dot is kept only where the cosmos is dense enough that it is the
    # background's (a highlight on the Pokémon's ink has none around it); the ground is the kept dots' own soft glow, so
    # no blotch of foil ever lies over the Pokémon or the dark sky between the dots
    dens = ndi.gaussian_filter(ndi.binary_dilation(dots, iterations=2).astype(np.float32), 9.0)
    keep = dens > 0.03
    tex = tex * keep[..., None]
    kept = (tex.max(-1) > 0.05).astype(np.float32)
    ground = np.clip(ndi.gaussian_filter(ndi.binary_dilation(kept > 0, iterations=1).astype(np.float32), 2.4) * 3.0, 0, 1) * z
    rgba = np.dstack([tex * 255.0, ground * 255.0]).round().clip(0, 255).astype(np.uint8)
    rgba[..., :3][rgba[..., 3] == 0] = 0
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT_DIR, f"{card['id']}-v{MAP_VERSION}.webp"), lossless=True, quality=100, method=6)
    if debug_dir:
        vis = rgb * (1 - 0.5 * ground[..., None]) + np.array([60, 140, 255], np.float32) * 0.5 * ground[..., None]
        vis = np.where(tex.max(-1, keepdims=True) > 0.05, tex * 255, vis)
        Image.fromarray(np.concatenate([rgb, vis], 1).clip(0, 255).astype(np.uint8)).save(os.path.join(debug_dir, f"{card['id']}.png"))
    return n, float(ground[win > 0.5].mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--debug-dir", default="")
    args = ap.parse_args()
    cards = [c for c in json.load(open(args.cards)) if not c.get("refractor")]
    only = set(filter(None, args.only.split(",")))
    os.makedirs(OUT_DIR, exist_ok=True)
    if args.debug_dir:
        os.makedirs(args.debug_dir, exist_ok=True)
    win = window_mask()
    for c in cards:
        if only and c["id"] not in only:
            continue
        n, cover = draw(c, win, args.debug_dir)
        print(f"{c['id']} {c['name']}: {n} dots, ground covers {cover:.2f} of the window")


if __name__ == "__main__":
    sys.exit(main())
