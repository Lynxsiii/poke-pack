"""Build the Sword & Shield reverse holo patterns from TCG Live's reverse maps.

The Sword & Shield reverse holo is a chevron sheet: rows of arrowhead tiles
in alternating greys, each carrying the card's type symbol (leaves on a Grass
card, flames on Fire, Poké Balls on a Trainer, stars on an Energy). TCG Live's
reverse map of every reverse print (`<key>_en_<nnn>_ph.foil.png`) draws that
pattern in its grey levels, and it is the same picture on every card of a
type across the era, so the site ships one pattern per type rather than a
map per card, exactly as make_sv_reverse.py does for Scarlet & Violet:

- `<type>.webp` for Pokémon (grass ... dragon, colorless).
- `trainer.webp`: Poké Balls.
- `energy.webp`: stars, foil only below the art (the basic Energy reverses
  in Celebrations and Crown Zenith).

Each is grey where the pattern is and transparent where the card is plain
(the art window, the name bar, the energy-cost dots), the per-pixel median
of several cards' maps, which drops what differs card to card (the Rapid
Strike and Single Strike badges, a Stage card's evolution circle). Cards
come from the site's own data (data/<set>.json), since TCG Live's export
index does not carry the era.

    python3 .claude/skills/card-textures/scripts/make_swsh_reverse.py

Downloads land in the lab's gitignored cache (lab/cache/swsh-reverse/).
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CACHE = HERE.parent / "lab" / "cache" / "swsh-reverse"
OUT = ROOT / "assets" / "foil" / "swsh-reverse"
MAP = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{key}/{key}_en_{num:03d}_ph.foil.png"
TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless"]
SIZE = (367, 512)


def curl(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = subprocess.run(["curl", "-sfL", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
    return res.returncode == 0


def group_of(card: dict) -> str | None:
    if card.get("gallery") or card.get("rarity") not in ("Common", "Uncommon", "Rare"):
        return None
    if card.get("supertype") == "Trainer":
        return "trainer"
    if card.get("supertype") == "Energy":
        return None
    types = card.get("types") or []
    return types[0].lower() if types and types[0] in TYPES else None


def grey(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0, 0, 0, 255))
    flat.alpha_composite(im)
    return np.asarray(flat.convert("L").resize(SIZE, Image.LANCZOS), np.float32)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sets", default="swsh7,swsh9,swsh11,swsh6,swsh12,swsh8", help="site set ids to draw cards from")
    ap.add_argument("--per-group", type=int, default=7, help="cards per pattern")
    args = ap.parse_args()

    picks: dict[str, list[tuple[str, int]]] = {}
    sets = args.sets.split(",")
    pools = {s: json.loads((ROOT / "data" / f"{s}.json").read_text(encoding="utf-8")) for s in sets}
    for i in range(max(len(p) for p in pools.values())):
        for s in sets:
            if i >= len(pools[s]):
                continue
            card = pools[s][i]
            group = group_of(card)
            if group is None or not str(card["number"]).isdigit():
                continue
            if len(picks.setdefault(group, [])) < args.per_group:
                picks[group].append((s, int(card["number"])))

    OUT.mkdir(parents=True, exist_ok=True)
    for group in [t.lower() for t in TYPES] + ["trainer"]:
        stack = []
        for key, num in picks.get(group, []):
            path = CACHE / f"{key}_{num:03d}.ph.png"
            if path.exists() or curl(MAP.format(key=key, num=num), path):
                stack.append(grey(path))
        if len(stack) < 3:
            print(f"{group}: only {len(stack)} maps, skipped")
            continue
        maps = np.stack(stack)
        med = np.median(maps, axis=0)
        body = med > 40
        strays = [float(np.abs(m - med)[body].mean()) for m in maps]
        print(f"{group}: {len(stack)} cards, stray from median {', '.join(f'{s:.1f}' for s in strays)}")
        lo, hi = np.percentile(med[body], [2, 98])
        stretched = np.where(body, (med - lo) / max(hi - lo, 1) * 215 + 40, med)
        pattern = np.clip(stretched, 0, 255).astype(np.uint8)
        alpha = Image.fromarray(np.where(body, 255, 0).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
        Image.merge("RGBA", [Image.fromarray(pattern, "L")] * 3 + [alpha]).save(OUT / f"{group}.webp", quality=82, method=6)


if __name__ == "__main__":
    main()
