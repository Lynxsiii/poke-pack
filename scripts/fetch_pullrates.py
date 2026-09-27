"""Refresh printed pull rates for every set from pullrates.gg.

The odds in js/catalog.js are the heart of the site's promise, so they should
come from a citable study rather than being copied between sets. pullrates.gg
publishes per-rarity rates with a source note, and its Pitch Black figures match
the TCGPlayer 4,000-pack study catalog.js already cites — Ultra Rare 0.083 and
SIR 0.0125 agree exactly.

Rates genuinely differ between sets: Ascended Heroes runs Ultra Rare at 1/21 and
its gold at 1/541, against 1/12 and ~1/1259 for the main sets. Reusing one set's
table for another would misstate the odds.

Writes data/pullrates.json (rates + source + date per set) and prints the slot
tables to paste into js/catalog.js, which stays the runtime source of truth so a
failed fetch can never silently change the odds mid-session.

Usage:
    py scripts/fetch_pullrates.py            # every set in data/sets/
    py scripts/fetch_pullrates.py me1 me2
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETS = ROOT / "data" / "sets"
OUT = ROOT / "data" / "pullrates.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip pull rates"

# Rarity -> the pool key used by js/engine.js.
POOL = {
    "Double Rare": "double",
    "Ultra Rare": "ultra",
    "Illustration Rare": "ir",
    "Special Illustration Rare": "sir",
    "Mega Hyper Rare": "hyper",
    "Hyper Rare": "hyper",
    "ACE SPEC Rare": "ace",
    "Black White Rare": "bwr",
    "Mega Attack Rare": "megaAttack",
    "Futuristic Rare": "futuristic",
    "Classic Collection": "classic",
    "RGB Rare": "rgb",
}


def payload(slug: str) -> dict:
    """pullrates.gg is a Nuxt app; its payload is devalue-encoded, i.e. a flat
    array where objects hold indices into that same array."""
    url = f"https://www.pullrates.gg/sets/{slug}/_payload.json"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = json.loads(resp.read().decode("utf-8", "replace"))

    def resolve(index, seen=frozenset()):
        if isinstance(index, int) and 0 <= index < len(raw):
            if index in seen:
                return None
            value = raw[index]
            if isinstance(value, dict):
                return {k: resolve(v, seen | {index}) for k, v in value.items()}
            if isinstance(value, list):
                if value and value[0] == "ShallowReactive":
                    return resolve(value[1], seen | {index})
                return [resolve(v, seen | {index}) for v in value]
            return value
        return index

    top = resolve(2)
    if not isinstance(top, dict) or not top:
        raise RuntimeError(f"unexpected payload shape for {slug}")
    return top[next(iter(top))]


def main(argv: list[str]) -> int:
    wanted = argv or sorted(p.stem for p in SETS.glob("*.json"))
    store = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    failed = 0

    for set_id in wanted:
        cfg_path = SETS / f"{set_id}.json"
        if not cfg_path.exists():
            print(f"{set_id}: no set config — skipped")
            continue
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        slug = cfg.get("pullratesSlug") or cfg.get("slug")
        print(f"{set_id} ({slug}):")
        try:
            data = payload(slug)
        except (urllib.error.URLError, RuntimeError, KeyError, ValueError) as exc:
            print(f"  FAILED — {exc}")
            failed += 1
            continue

        rates = {}
        for slot in data.get("raritySlots") or []:
            rate = slot.get("ratePerPack")
            pool = POOL.get(slot.get("rarity"))
            if pool and isinstance(rate, (int, float)) and rate > 0:
                rates[pool] = rate

        store[set_id] = {
            "name": data.get("name"),
            "printedTotal": data.get("totalCards"),
            "released": data.get("releaseDate"),
            "updated": data.get("pullRatesUpdated"),
            "source": (data.get("pullRatesNotes") or "").strip(),
            "rates": rates,
        }
        for pool, rate in rates.items():
            print(f"    {pool:6} {rate:<9} 1/{round(1 / rate)}")
        time.sleep(1)

    OUT.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
