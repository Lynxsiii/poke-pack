"""Build the Scarlet & Violet reverse holo patterns from TCG Live's reverse maps.

Every reverse print in TCG Live has a reverse foil map next to its holo one
(`<key>_en_<nnn>_ph.foil.png`): black where the card is plain, grey levels
where it is foil. On Scarlet & Violet cards the grey levels draw the
reverse's pattern, the "cobblestone": pebbles, the type's symbol scattered
between them and a large type badge on the right of the body. It is the same
picture on every card of a type, in every Scarlet & Violet set, so the site
ships one pattern per type instead of a map per card:

- `<type>.webp` for Pokémon (grass ... dragon, colorless), non-Paradox.
- `trainer.webp`: Trainers get the same pebbles with Poké Balls.
- `special-energy.webp`: Special Energy is foil only in the text box, under
  the colorless (star) pattern.

Each is grey where the pattern is and transparent where the card is plain
(the map's black: the art window, the name bar, the energy-cost dots), so
one image is both the texture and the mask.

Ancient and Future cards (Paradox Rift on) are a plain mirror: their maps
are one flat grey. So are Mega Evolution reverses. Neither needs an asset.

Each pattern is the per-pixel median of several cards' maps, which drops what
differs card to card (the energy-cost dots, the art window of a Stage card).
The art window and the evolution circle stay the site's own window masks
(windows.css).

    python3 .claude/skills/card-textures/scripts/make_sv_reverse.py

Downloads land in the lab's gitignored cache (lab/cache/sv-reverse/). The
run prints, per group, how many cards went in and how far each card's
pattern strays from the median (mean absolute difference in grey levels,
body only), which is how to tell the pattern really is shared.
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
CACHE = HERE.parent / "lab" / "cache" / "sv-reverse"
OUT = ROOT / "assets" / "foil" / "sv-reverse"
EXPORT = "https://cdn.malie.io/file/malie-io/tcgl/export/v0.1.9.13/{key}.en-US.json"
MAP = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{key}/{key}_en_{num:03d}_ph.foil.png"
TYPES = ["GRASS", "FIRE", "WATER", "LIGHTNING", "PSYCHIC", "FIGHTING", "DARKNESS", "METAL", "DRAGON", "COLORLESS"]
PARADOX = {"ANCIENT", "FUTURE"}
SIZE = (367, 512)


def curl(url: str, dest: Path) -> bool:
    # urllib gets a 403 from this CDN; curl is accepted.
    dest.parent.mkdir(parents=True, exist_ok=True)
    res = subprocess.run(["curl", "-sfL", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
        return False
    return True


def export(key: str) -> list[dict]:
    path = CACHE / f"{key}.en-US.json"
    if not path.exists() and not curl(EXPORT.format(key=key), path):
        raise SystemExit(f"no TCG Live export for {key}")
    return json.loads(path.read_text(encoding="utf-8"))


def group_of(card: dict) -> str | None:
    """Which pattern a reverse print carries, or None for a mirror."""
    tags = set(card.get("tags") or [])
    if tags & PARADOX:
        return None
    kind = card.get("card_type")
    if kind == "POKEMON":
        types = card.get("types") or []
        return types[0].lower() if types and types[0] in TYPES else None
    if kind == "TRAINER":
        return "trainer"
    if kind == "ENERGY" and card.get("subtype") == "SPECIAL":
        return "special-energy"
    return None


def grey(path: Path) -> np.ndarray:
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, (0, 0, 0, 255))
    flat.alpha_composite(im)
    return np.asarray(flat.convert("L").resize(SIZE, Image.LANCZOS), np.float32)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keys", default="sv4,sv5,sv6,sv2,sv7", help="TCG Live set keys to draw cards from")
    ap.add_argument("--per-group", type=int, default=7, help="cards per pattern")
    args = ap.parse_args()

    picks: dict[str, list[tuple[str, int]]] = {}
    mirrors: list[tuple[str, int]] = []
    keys = args.keys.split(",")
    # Round-robin over the sets so every pattern mixes prints from several.
    pools = {key: [c for c in export(key) if (c.get("foil") or {}).get("mask") == "REVERSE"] for key in keys}
    for i in range(max(len(p) for p in pools.values())):
        for key in keys:
            if i >= len(pools[key]):
                continue
            card = pools[key][i]
            num = card["collector_number"]["numeric"]
            group = group_of(card)
            if group is None:
                if set(card.get("tags") or []) & PARADOX and len(mirrors) < 4:
                    mirrors.append((key, num))
                continue
            if len(picks.setdefault(group, [])) < args.per_group:
                picks[group].append((key, num))

    OUT.mkdir(parents=True, exist_ok=True)
    for group in [t.lower() for t in TYPES] + ["trainer", "special-energy"]:
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
        # The map's pebbles differ by a few dozen grey levels, which reads as
        # a faint pattern under the reverse recipe. Stretch the body to the
        # full range so the pebbles catch the light like the real cards.
        lo, hi = np.percentile(med[body], [2, 98])
        stretched = np.where(body, (med - lo) / max(hi - lo, 1) * 215 + 40, med)
        pattern = np.clip(stretched, 0, 255).astype(np.uint8)
        # Grey is the pattern, alpha is where the card is foil at all (the
        # map's black is plain card), so one image is texture and mask.
        alpha = Image.fromarray(np.where(body, 255, 0).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
        Image.merge("RGBA", [Image.fromarray(pattern, "L")] * 3 + [alpha]).save(OUT / f"{group}.webp", quality=82, method=6)

    for key, num in mirrors:
        path = CACHE / f"{key}_{num:03d}.ph.png"
        if path.exists() or curl(MAP.format(key=key, num=num), path):
            g = grey(path)
            body = g > 40
            print(f"mirror check {key} {num}: body grey {g[body].mean():.0f} +/- {g[body].std():.1f}")


if __name__ == "__main__":
    main()
