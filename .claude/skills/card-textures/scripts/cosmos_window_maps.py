#!/usr/bin/env python3
"""Rebuild the drawn window-and-frame foil maps of the cosmos promos so
they follow TCG Live's convention: the inked art background at about half
alpha, the bare silver frame at full, the owner badge cut out, and, where
the plain print has a TCG Live map, that map's art window (Pokémon cut
out) instead of the plain box.

`stamp_knockout.py`'s `window_map` drew the window at full alpha with the
Pokémon left in, so a cosmos promo's `.foil` (screened on) ran at twice
the strength of a Live-mapped print over the whole art window: the art
bleached and the Pokémon washed out (Hop's Dubwool 136/159, Noah
2026-09-28, "the art is bleached so Dubwool is hard to make out").

    python3 .claude/skills/card-textures/scripts/cosmos_window_maps.py --all
    python3 .claude/skills/card-textures/scripts/cosmos_window_maps.py --set sv9 --cards 136-cosmos

Only maps that look drawn (no soft edges, few alpha levels) are rebuilt;
a print that already carries a TCG Live map is left alone. Stamp holes an
existing map cuts out are kept (the result is never brighter than the map
it replaces). Paths do not change, so no data file is written.
"""
import argparse
import glob
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
SIZE = (367, 512)
WINDOW_ALPHA = 130   # TCG Live's inked art background (sv9 136: mean 131)


def is_cosmos(card: dict) -> bool:
    finish = str(card.get("foilAs") or card.get("rarity") or "")
    return "Cosmos" in finish


def looks_drawn(alpha: np.ndarray) -> bool:
    soft = ((alpha > 8) & (alpha < 247)).mean()
    return len(np.unique(alpha)) <= 40 or soft < 0.06


def owner_alpha(card: dict) -> np.ndarray | None:
    name = card.get("ownerMask")
    if not name:
        return None
    for variant in ("-evo", ""):
        path = ROOT / "assets" / "masks" / "owner" / f"{name}{variant}.png"
        if path.exists():
            im = Image.open(path).convert("RGBA").resize(SIZE, Image.LANCZOS)
            return np.asarray(im)[..., 3].astype(np.float32)
    return None


def rebuild(card: dict, base: dict | None, existing: np.ndarray) -> np.ndarray:
    frame = existing >= 250
    # the frame is the full-alpha band along the four edges of the box map
    h, w = existing.shape
    band = np.zeros_like(frame)
    fy = int(0.026 * h) + 1
    fx = int(0.036 * w) + 1
    band[:fy, :] = band[h - fy:, :] = True
    band[:, :fx] = band[:, w - fx:] = True
    frame = frame & band
    window = (existing >= 250) & ~band
    live = None
    if base and base.get("foilMap") and (ROOT / base["foilMap"]).exists():
        live = np.asarray(Image.open(ROOT / base["foilMap"]).convert("RGBA").resize(SIZE, Image.LANCZOS))[..., 3].astype(np.float32)
    out = np.zeros_like(existing, dtype=np.float32)
    if live is not None:
        out = np.where(window, live, 0)
    else:
        out = np.where(window, WINDOW_ALPHA, 0).astype(np.float32)
    badge = owner_alpha(card)
    if badge is not None:
        out = out * (1 - badge / 255)
    out = np.where(frame, 255, out)
    return np.minimum(out, existing.astype(np.float32))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", default="")
    ap.add_argument("--cards", default="", help="comma-separated card numbers")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dry", action="store_true", help="report only")
    a = ap.parse_args()
    files = [ROOT / "data" / f"{a.set}.json"] if a.set else [Path(f) for f in sorted(glob.glob(str(ROOT / "data" / "*.json")))]
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    done = 0
    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        records = data if isinstance(data, list) else data.get("cards", [])
        if not isinstance(records, list):
            continue
        by_id = {c["id"]: c for c in records if isinstance(c, dict) and "id" in c}
        for c in records:
            if not isinstance(c, dict) or not is_cosmos(c):
                continue
            if wanted and str(c.get("number")) not in wanted:
                continue
            if not wanted and not a.all:
                continue
            fm = c.get("foilMap")
            if not fm or not (ROOT / fm).exists():
                continue
            im = Image.open(ROOT / fm).convert("RGBA")
            alpha = np.asarray(im)[..., 3]
            if not looks_drawn(alpha):
                continue
            base = by_id.get(c["id"].rsplit("-", 1)[0]) if "-" in c["id"] else None
            new = rebuild(c, base, alpha)
            src = "live window" if base and base.get("foilMap") and (ROOT / base["foilMap"]).exists() else f"window at {WINDOW_ALPHA}"
            print(f"  {c['id']} {c.get('name')}: {src}{', badge cut' if c.get('ownerMask') else ''}")
            if a.dry:
                continue
            a8 = new.round().astype(np.uint8)
            rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
            Image.fromarray(rgba, "RGBA").save(ROOT / fm, "WEBP", quality=90, alpha_quality=90, method=6)
            done += 1
    print(f"{done} map(s) rebuilt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
