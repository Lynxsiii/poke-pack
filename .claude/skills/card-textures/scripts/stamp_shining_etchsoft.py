#!/usr/bin/env python3
"""Soften and stamp the etch of Shining Legends' Shining Pokemon (sm35).

    python3 .claude/skills/card-textures/scripts/stamp_shining_etchsoft.py [--sigma 0.9]

TCG Live's 400 px etch of these cards is a regular engraving (coherence 0.5-0.7) and
draws a line screen in WebKit at DPR 1. For every card of data/sm35.json that draws
`sm-shining` (rarity "Rare Shining", or a promo with foilAs "Rare Shining": Ho-Oh
smp070, Celebi smp079, Lugia smp082), this writes `<etchMap minus -etch>-etch-arc.webp`
next to the etch (white + Gaussian-softened alpha; never overwrites an existing file) and
stamps `etchSoft` on the card, keeping the JSON layout (indent 2). css/holo/sm-shiny.css
uses `--etch-soft` for the etch layer. Re-run it after any change to data/sm35.json
that drops the field (a data rebuild); it is idempotent.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("--sigma", type=float, default=0.9)
ap.add_argument("--data", default="data/sm35.json")
a = ap.parse_args()

raw = open(a.data).read()
cards = json.loads(raw)
for c in cards:
    if "Rare Shining" not in (c.get("rarity"), c.get("foilAs")) or not c.get("etchMap"):
        continue
    src = c["etchMap"]
    dst = src.replace("-etch.webp", "-etch-arc.webp")
    if dst == src:
        raise SystemExit(f"unexpected etch name {src}")
    if not os.path.exists(dst):
        al = np.asarray(Image.open(src).getchannel("A")).astype(np.float32) / 255
        arr = (np.clip(ndimage.gaussian_filter(al, a.sigma), 0, 1) * 255).round().astype(np.uint8)
        w = np.full_like(arr, 255)
        Image.fromarray(np.dstack([w, w, w, arr]), "RGBA").save(dst, "WEBP", quality=80, alpha_quality=80, method=6)
        print("wrote", dst)
    c["etchSoft"] = dst
open(a.data, "w").write(json.dumps(cards, indent=2, ensure_ascii=False) + ("\n" if raw.endswith("\n") else ""))
print("stamped", sum(1 for c in cards if c.get("etchSoft")), "cards")
