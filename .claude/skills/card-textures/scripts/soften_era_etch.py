#!/usr/bin/env python3
"""Soften a set's TCG Live etch maps for viewing at screen size.

Live's Sword & Shield etch maps are hairline screens: the VMAX and VSTAR
grain is a 2 px pitch at the map's 400 px width, the gold and full-art
line art carries a fine hatch. Drawn as a hard mask and lit by the foil
recipes, that screen aliases into a wavy line pattern over the whole card
on a phone (Surfing Pikachu VMAX cel25 9 and Meowth VMAX SWSH005, Noah
2026-09-29). The real card's grain is too fine to see at arm's length; what
shows is its density following the drawing. A blur of about a pixel at map
size keeps that density and the line art and drops the screen.

    python3 .claude/skills/card-textures/scripts/soften_era_etch.py --set cel25
    python3 .claude/skills/card-textures/scripts/soften_era_etch.py --set swsh45 --cards SV121,SV122

Writes assets/foil/maps/<set>/<n>-etch-v3.webp (v2 was the plain blur; v3 lays
a wandering grain over it so the relief reads as texture, Noah 2026-09-29) and
points the card's `etchMap` at it. Files under assets/ are served immutable
for a year, so the original is never rewritten: a new name, always.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[4]
SIGMA = 1.5      # px at the map's own size (400 px wide): a 3 px screen is gone, line art keeps its weight
SUFFIX = "-etch-v3.webp"
OLD_SUFFIXES = ("-etch-v2.webp", "-etch.webp")
GRAIN = 0.55     # depth of the wandering grain laid over the blurred screen
GRAIN_SCALE = 2.2  # px: feature size of the grain at map size (never periodic)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", default="", help="comma-separated numbers (default: every card with an etch map)")
    ap.add_argument("--sigma", type=float, default=SIGMA)
    a = ap.parse_args()
    path = ROOT / "data" / f"{a.set}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else data["cards"]
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    changed = written = 0
    for c in records:
        if wanted and str(c.get("number")) not in wanted:
            continue
        src_rel = c.get("etchMap")
        if not src_rel:
            continue
        for old in (SUFFIX,) + OLD_SUFFIXES:
            if src_rel.endswith(old):
                src_rel = src_rel[: -len(old)] + "-etch.webp"
                break
        src = ROOT / src_rel
        if not src.exists():
            # The hairline original is gone (v2 shipped without it): soften
            # the v2 copy again, which is already blurred, so skip the blur.
            v2 = src.with_name(src.name.replace("-etch.webp", "-etch-v2.webp"))
            if v2.exists():
                src = v2
        if not src.exists():
            print(f"  {c['id']}: {src_rel} missing, skipped")
            continue
        out = src.with_name(src.name.replace("-etch-v2.webp", "-etch.webp").replace("-etch.webp", SUFFIX))
        if not out.exists():
            alpha = np.asarray(Image.open(src).convert("RGBA"))[..., 3].astype(np.float32) / 255
            soft = alpha if src.name.endswith("-etch-v2.webp") else ndimage.gaussian_filter(alpha, a.sigma)
            # The grain: a smooth random field with 2 to 3 px features, seeded
            # by the card so it never repeats between prints. Multiplied in,
            # it modulates the etch density (light only where the print is
            # etched), so the texture follows the art and never tiles or
            # aliases into a screen at any display scale.
            rng = np.random.default_rng(abs(hash(c["id"])) % (2**32))
            noise = ndimage.gaussian_filter(rng.standard_normal(alpha.shape).astype(np.float32), GRAIN_SCALE)
            noise = noise / (noise.std() + 1e-6)
            grain = np.clip(1 + GRAIN * noise, 0, 2)
            soft = np.clip(soft * grain, 0, 1)
            a8 = (soft * 255).round().astype(np.uint8)
            rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
            Image.fromarray(rgba, "RGBA").save(out, "WEBP", quality=85, alpha_quality=85, method=4)
            written += 1
        rel = str(out.relative_to(ROOT)).replace("\\", "/")
        if c.get("etchMap") != rel:
            c["etchMap"] = rel
            changed += 1
    if changed:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{a.set}: {written} map(s) written, {changed} card(s) repointed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
