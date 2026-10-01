"""Build the Black & White reverse holo from TCG Live's reverse maps.

TCG Live publishes the reverse print of every non-holo card of the era as `<key>_en_<nnn>_ph.foil.png` (367 x 512, probed
2026-10-01 on bw1..bw11). Two finishes, both read from those maps:

- Black & White (bw1): a PLAIN mirror. The map is flat white over the whole card except the art window and the printed
  symbols (Collexy: "the Set Reverse Holofoil pattern is the Mirror Pattern"; codedyellow: "no pattern ... a single holographic
  sheen in the colour of the Pokemon type"). Only the layout differs (Basic, Stage 1/2 with the evolution notch, Trainer),
  so bw1 ships three layout masks and no tile.
- Emerging Powers on (bw2..bw11): the ENERGY pattern, a sheet of big shaded type symbols (leaves with veins, drops with a
  highlight, flames ...) and, for Trainers, Poke Balls, in two or three sizes. It is the same picture for a type in every set
  (median distance between two cards of one type: 3 grey levels out of 255), so the site ships one tile per type.

What it writes (never over an existing file):
  assets/foil/bw-reverse/<type>.webp   grass fire water lightning psychic fighting darkness metal dragon colorless trainer energy:
                                       the type's pattern, grey = shine, opaque, the per-pixel median of a dozen cards' maps
                                       (round robin over the sets so a set's grey drift and a card's own text drop out)
  assets/foil/bw-reverse/layout-<basic|evo|trainer>.webp   alpha mask of where a reverse card is foil: the card less its art
                                       window, the type icon and the other symbols that are never foil (median of bw1's maps)

Cards come from data/<set>.json; BW_DATA_DIRS (colon separated) adds places to look for a set's file that is not merged yet.
Downloads land in the lab's gitignored cache, lab/cache/bw-reverse/ (or --cache).

    python3 .claude/skills/card-textures/scripts/make_bw_reverse.py
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUT = ROOT / "assets" / "foil" / "bw-reverse"
MAP = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{key}/{key}_en_{num:03d}_ph.foil.png"
SETS = ["bw2", "bw3", "bw4", "bw5", "bw6", "bw7", "bw8", "bw9", "bw10", "bw11"]
TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Colorless", "Dragon"]
SIZE = (367, 512)
FLOOR = 22  # TCG Live paints "not foil" as 22/255


def curl(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = subprocess.run(["curl", "-sfL", "-m", "30", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
    return res.returncode == 0


def load_set(set_id: str) -> list[dict] | None:
    places = [ROOT / "data"] + [Path(p) / "data" for p in os.environ.get("BW_DATA_DIRS", "").split(":") if p]
    for place in places:
        f = place / f"{set_id}.json"
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8"))
    return None


def group_of(card: dict) -> str | None:
    if card.get("rarity") not in ("Common", "Uncommon", "Rare", "Rare Holo"):
        return None
    if card.get("supertype") == "Trainer":
        return "trainer"
    if card.get("supertype") == "Energy":
        return "energy"
    types = card.get("types") or []
    return types[0].lower() if types and types[0] in TYPES else None


def layout_of(card: dict) -> str:
    if card.get("supertype") == "Trainer":
        return "trainer"
    subs = card.get("subtypes") or []
    return "evo" if "Stage 1" in subs or "Stage 2" in subs else "basic"


def grey(path: Path) -> np.ndarray:
    """The map's brightness, flat on black (its corners are transparent), floor stretched to 0."""
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0, 0, 0, 255))
    flat.alpha_composite(im)
    g = np.asarray(flat.convert("L").resize(SIZE, Image.LANCZOS), np.float32)
    return ((g - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255)


def clean_text(med: np.ndarray, group: str) -> np.ndarray:
    """Close the printed text that survives the median.

    Darkness and Dragon cards print their text white and the map reads it as holes in the foil; the name bar, HP, attack lines and footer
    sit at the same place on every card, so a trace survives the median of even 60 cards. The strokes are 1 to 4 px dark
    gaps in a lighter field: a grey closing inside those zones fills them and leaves the symbols (large) and their light
    outlines (closing never removes a bright line) alone.
    """
    if group not in ("darkness", "dragon"):
        return med
    h, w = med.shape
    closed = ndi.grey_closing(med, size=(7, 7))
    out = med.copy()
    for y0, y1, x0, x1 in ((0.0, 0.095, 0.0, 0.85), (0.5, 0.905, 0.0, 0.97), (0.905, 1.0, 0.0, 0.7)):
        ys, xs = slice(int(h * y0), int(h * y1)), slice(int(w * x0), int(w * x1))
        out[ys, xs] = closed[ys, xs]
    return out


def fetch(cache: Path, set_id: str, num: int) -> Path | None:
    f = cache / f"{set_id}_{num:03d}.png"
    if f.exists() and f.stat().st_size:
        return f
    return f if curl(MAP.format(key=set_id, num=num), f) else None


def save(arr: np.ndarray, name: str, mode: str = "L") -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / name
    if dest.exists():
        print("exists, kept:", dest.name)
        return
    if mode == "L":
        Image.fromarray(arr.clip(0, 255).round().astype(np.uint8), "L").save(dest, "WEBP", quality=88, method=6)
    else:  # white with alpha = arr
        a = arr.clip(0, 255).round().astype(np.uint8)
        w = np.full_like(a, 255)
        Image.fromarray(np.dstack([w, w, w, a]), "RGBA").save(dest, "WEBP", quality=88, alpha_quality=90, method=6)
    print("wrote", dest.relative_to(ROOT), dest.stat().st_size, "bytes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-group", type=int, default=14, help="cards per pattern (Darkness and Dragon take every map they can: their text needs diluting)")
    ap.add_argument("--cache", default=str(HERE.parent / "lab" / "cache" / "bw-reverse"))
    args = ap.parse_args()
    cache = Path(args.cache)

    # ---- the layouts, from bw1's plain mirror maps -------------------------------------------------
    bw1 = load_set("bw1")
    if bw1 is None:
        raise SystemExit("bw1: no data file (set BW_DATA_DIRS)")
    foil: dict[str, list[np.ndarray]] = {"basic": [], "evo": [], "trainer": []}
    for card in bw1:
        num = str(card.get("number", ""))
        if not num.isdigit() or card.get("rarity") not in ("Common", "Uncommon", "Rare"):
            continue
        if card.get("supertype") == "Energy":
            continue
        f = fetch(cache, "bw1", int(num))
        if f:
            foil[layout_of(card)].append(grey(f) > 100)
    for lay, stack in foil.items():
        if not stack:
            continue
        med = np.stack(stack).mean(0)
        mask = (med > 0.5).astype(np.float32) * 255
        mask = ndi.gaussian_filter(mask, 0.6)  # a hair of softness on the edge, none on the rest
        save(mask, f"layout-{lay}.webp", "A")
        print(f"layout {lay}: {len(stack)} cards")

    # ---- the pattern tiles, from bw2..bw11 ---------------------------------------------------------
    pools: dict[str, dict[str, list[tuple[str, int]]]] = {}
    for s in SETS:
        data = load_set(s)
        if data is None:
            print(f"{s}: no data file, skipped")
            continue
        for card in data:
            g = group_of(card)
            num = str(card.get("number", ""))
            if g and num.isdigit():
                pools.setdefault(g, {}).setdefault(s, []).append((s, int(num)))
    for g, per_set in sorted(pools.items()):
        picks: list[tuple[str, int]] = []
        for i in range(60):  # round robin over the sets
            for s in per_set:
                if i < len(per_set[s]):
                    picks.append(per_set[s][i])
        stack = []
        seen = set()
        for s, n in picks:
            if (s, n) in seen:
                continue
            seen.add((s, n))
            f = fetch(cache, s, n)
            if f:
                stack.append(grey(f))
            if len(stack) >= (60 if g in ("darkness", "dragon") else args.per_group):
                break
        if len(stack) < 3:
            print(f"{g}: only {len(stack)} maps, skipped")
            continue
        med = clean_text(np.median(np.stack(stack), axis=0), g)
        print(f"{g}: {len(stack)} maps, median grey {med[300:480].mean():.0f}")
        save(med, f"{g}.webp")


if __name__ == "__main__":
    main()
