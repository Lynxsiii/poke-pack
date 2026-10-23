#!/usr/bin/env python3
"""Ship TCG Live's foil maps for the Mega Evolution Illustration Rares that the data gives none (holo family me-ir).

Every ME Illustration Rare (me1-me5, me2pt5, and the ME Black Star promos foiled as IR) has a SUN_PILLAR / HOLO foil map
on TCG Live: the Pokemon (and trainer) at 0, the painted background graded by tone, the silver border at full. Until
2026-10-22, 128 of the 145 faces ran on the all-white fallback (assets/foil/maps/full.webp), so the foil covered the
Pokemon and the text. This script fetches each missing map, converts it the way scripts/fetch_foil_maps.py --ship does
(white with alpha = luminance x alpha, TCG Live's 22/255 "not foil" floor stretched to 0, 367 x 512 webp) and writes it
to assets/foil/fam/me-ir/<id>-map.webp, a name no other file has used. js/fam/me-ir.js points the face at it through
--foil-map (LIVE_MAP); the data files are not touched.

    python3 .claude/skills/card-textures/scripts/fam/me-ir/ship_live_maps.py [--cache DIR] [--force] [--ids-only]

--ids-only prints the ids (for LIVE_MAP) without fetching. Never rewrites a shipped file unless --force (and a changed
asset needs a new name anyway: assets are cached for a year).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets/foil/fam/me-ir"
SETS = {"me1": "me1", "me2": "me2", "me2pt5": "me2-5", "me3": "me3", "me4": "me4", "me5": "me5"}
CDN = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
FLOOR = 22  # TCG Live's "not foil" luminance (fetch_foil_maps.py)
WIDTH = 367


def faces() -> list[tuple[str, str, int]]:
    """(id, live key, live number) of every ME Illustration Rare face with no foilMap in the data."""
    out = []
    for site, key in SETS.items():
        for card in json.loads((ROOT / f"data/{site}.json").read_text()):
            rarity = card.get("foilAs") or card.get("rarity")
            if rarity != "Illustration Rare" or card.get("reverse") or card.get("foilMap"):
                continue
            number = str(card["number"])
            promo = re.fullmatch(r"mep(\d+)(-[a-z0-9]+)?", number)
            if promo:
                out.append((card["id"], "mebsp", int(promo.group(1))))
            elif number.isdigit():
                out.append((card["id"], key, int(number)))
            else:
                print(f"skip {card['id']}: no Live number for {number!r}", file=sys.stderr)
    return out


def alpha_mask(path: Path) -> Image.Image:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = ((lum - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    img = Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")
    if img.width != WIDTH:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="/tmp/me-ir-live-cache")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--ids-only", action="store_true")
    args = ap.parse_args()
    todo = faces()
    if args.ids_only:
        print(json.dumps([cid for cid, _, _ in todo]))
        return
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    shipped, missing = [], []
    for cid, key, n in todo:
        dest = OUT / f"{cid}-map.webp"
        if dest.exists() and not args.force:
            shipped.append(cid)
            continue
        raw = cache / f"{key}_{n:03d}.foil.png"
        if not raw.exists():
            url = f"{CDN}/{key}/{key}_en_{n:03d}_std.foil.png"
            res = subprocess.run(["curl", "-sfL", url, "-o", str(raw)], capture_output=True)
            if res.returncode != 0:
                raw.unlink(missing_ok=True)
                missing.append(cid)
                print(f"404 {cid} {url}", file=sys.stderr)
                continue
        alpha_mask(raw).save(dest, "WEBP", quality=85, alpha_quality=80, method=6)
        shipped.append(cid)
    print(json.dumps({"shipped": shipped, "missing": missing}))


if __name__ == "__main__":
    main()
