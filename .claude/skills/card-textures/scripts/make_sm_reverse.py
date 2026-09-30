"""Build the Sun & Moon reverse holo patterns from TCG Live's reverse maps.

The Sun & Moon reverse holo (every set, sm1 to sm12) is a type-symbol sheet:
small symbols of the card's type tiled over the right of the body and along
the top and bottom borders, a giant symbol ghosted lower left, the art window,
the name bar and the attack-name text left plain. TCG Live's reverse map of
every reverse print (`<key>_en_<nnn>_ph.foil.png`) draws it in grey levels;
it is the same picture for a type in every set of the era (only the overall
grey level drifts a few levels set to set), so the site ships one pattern per
type, like make_sv_reverse.py and make_swsh_reverse.py:

- `<type>.webp` for Pokémon (grass ... fairy, dragon, colorless).
- `trainer.webp`: the same tiling with Poké Balls.

Each is grey where the pattern is and transparent where the card is plain, the
per-pixel median of several cards' maps (a dozen, round-robin over the sets, so
one set's grey drift and a card's Stage bite drop out), its grey stretched to
the full range. Cards come from data/<set>.json; `SM_DATA_DIRS` (colon
separated) adds places to look for a set's file that is not merged yet.

    python3 .claude/skills/card-textures/scripts/make_sm_reverse.py

Downloads land in the lab's gitignored cache (lab/cache/sm-reverse/).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CACHE = HERE.parent / "lab" / "cache" / "sm-reverse"
OUT = ROOT / "assets" / "foil" / "sm-reverse"
MAP = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{key}/{key}_en_{num:03d}_ph.foil.png"
KEY = {"sm1": "sm1", "sm2": "sm2", "sm3": "sm3", "sm35": "sm3-5", "sm4": "sm4", "sm5": "sm5", "sm6": "sm6",
       "sm7": "sm7", "sm75": "sm7-5", "sm8": "sm8", "sm9": "sm9", "sm10": "sm10", "sm11": "sm11",
       "sm115": "sm11-5", "sm12": "sm12"}
TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Fairy", "Dragon", "Colorless"]
SIZE = (367, 512)


def curl(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = subprocess.run(["curl", "-sfL", "-m", "30", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
    return res.returncode == 0


def load_set(set_id: str) -> list[dict] | None:
    places = [ROOT / "data"] + [Path(p) / "data" for p in os.environ.get("SM_DATA_DIRS", "").split(":") if p]
    for place in places:
        f = place / f"{set_id}.json"
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8"))
    return None


def group_of(card: dict) -> str | None:
    if card.get("gallery") or card.get("rarity") not in ("Common", "Uncommon", "Rare", "Rare Holo"):
        return None
    if card.get("supertype") == "Trainer":
        return "trainer"
    if card.get("supertype") == "Energy":
        return None
    types = card.get("types") or []
    return types[0].lower() if types and types[0] in TYPES else None


def clean_text(med: np.ndarray, group: str) -> np.ndarray:
    """Wipe the printed text that survives the median, in place.

    The footer (illustrator, number, copyright) sits at the same place on every
    card and white-on-dark types (Darkness, Metal) map it, and their attack
    names, as foil; a Trainer's "TRAINER / Supporter" header strip too. Strokes
    are 1 to 3 px; a 9 px median inside those zones drops them and keeps the
    type symbols, which are much larger.
    """
    h, w = med.shape
    if group not in ("darkness", "metal", "trainer"):
        return med  # black print: the map already holds the letters as holes
    smooth = ndimage.median_filter(med, size=9)
    out = med.copy()
    for y0, y1, x1 in (((0.905, 1.0, 0.62), (0.52, 0.80, 0.62)) if group != "trainer" else ()):
        ys, xs = slice(int(h * y0), int(h * y1)), slice(0, int(w * x1))
        out[ys, xs] = smooth[ys, xs]
    if group == "trainer":
        out[: int(h * 0.095), :] = 0
    return out


def grey(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0, 0, 0, 255))
    flat.alpha_composite(im)
    return np.asarray(flat.convert("L").resize(SIZE, Image.LANCZOS), np.float32)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sets", default="sm1,sm5,sm7,sm9,sm10,sm11,sm12,sm2,sm3,sm4,sm6,sm8,sm35,sm75,sm115")
    ap.add_argument("--per-group", type=int, default=12, help="cards per pattern")
    args = ap.parse_args()

    pools = {}
    for s in args.sets.split(","):
        data = load_set(s)
        if data is None:
            print(f"{s}: no data file, skipped")
            continue
        pools[s] = data
    picks: dict[str, list[tuple[str, int]]] = {}
    for i in range(max(len(p) for p in pools.values())):
        for s, pool in pools.items():
            if i >= len(pool):
                continue
            card = pool[i]
            group = group_of(card)
            if group is None or not str(card["number"]).isdigit():
                continue
            if len(picks.setdefault(group, [])) < args.per_group:
                picks[group].append((s, int(card["number"])))

    OUT.mkdir(parents=True, exist_ok=True)
    for group in [t.lower() for t in TYPES] + ["trainer"]:
        stack = []
        for s, num in picks.get(group, []):
            key = KEY[s]
            path = CACHE / f"{key}_{num:03d}.ph.png"
            if path.exists() or curl(MAP.format(key=key, num=num), path):
                stack.append(grey(path))
        if len(stack) < 3:
            print(f"{group}: only {len(stack)} maps, skipped")
            continue
        maps = np.stack(stack)
        med = np.median(maps, axis=0)
        med = clean_text(med, group)
        body = med > 40
        strays = [float(np.abs(m - med)[body].mean()) for m in maps]
        print(f"{group}: {len(stack)} cards, stray from median {', '.join(f'{x:.1f}' for x in strays)}")
        lo, hi = np.percentile(med[body], [2, 98])
        stretched = np.where(body, (med - lo) / max(hi - lo, 1) * 215 + 40, med)
        pattern = np.clip(stretched, 0, 255).astype(np.uint8)
        alpha = Image.fromarray(np.where(body, 255, 0).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
        Image.merge("RGBA", [Image.fromarray(pattern, "L")] * 3 + [alpha]).save(OUT / f"{group}.webp", quality=82, method=6)


if __name__ == "__main__":
    main()
