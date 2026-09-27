"""Add a set's Poké Ball and Master Ball pattern prints as cards of their own.

Prismatic Evolutions prints every Common, Uncommon and Rare a third time with
a Poké Ball foil pattern, and the Pokémon among them a fourth time with a
Master Ball pattern. They come out of the same booster packs as the base
card, carry its number and scan, and TCGplayer sells them as products of
their own: Umbreon 059/131 books at under a dollar, its Master Ball print at
around seventy. Filed as a plain reverse holo, a Master Ball pull would sell
for the reverse's price, so each print is its own card here, with its own
market price:

    sv8pt5-59      Umbreon                 Rare
    sv8pt5-59-pb   Umbreon, Poké Ball      rarity "Poké Ball",   printedRarity "Rare"
    sv8pt5-59-mb   Umbreon, Master Ball    rarity "Master Ball", printedRarity "Rare"

The engine deals them from the reverse slots (js/engine.js poolsFrom picks
them up by `pattern`), and the site draws them with the set's pattern finish.

Which cards have which print comes from pkmn.gg's `variantMap`
(`pokeballPattern`, `masterballPattern`), the same page fetch_prices.py reads;
the script refuses to run if that disagrees with Pokémon TCG Live, where the
prints are the `sph` and `mph` variants. A set opts in with
`"patternPrints": ["pokeball", "masterball"]` in data/sets/<id>.json.

Re-running is safe: the pattern cards are rebuilt from their base cards, keep
any foil map fields written by the card-textures skill's fetch_foil_maps.py,
and land after the numbered cards (Poké Ball then Master Ball for each
number), ahead of any promos.

Usage:
    python3 scripts/build_patterns.py sv8pt5
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip pattern builder"
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)
TCGL_INDEX = "https://cdn.malie.io/file/malie-io/tcgl/export/index.json"
TCGL = "https://cdn.malie.io/file/malie-io/tcgl/export/{path}"

# kind -> (id suffix, rarity, pkmn.gg variant key, TCG Live variant code)
PATTERNS = {
    "pokeball": ("pb", "Poké Ball", "pokeballPattern", "sph"),
    "masterball": ("mb", "Master Ball", "masterballPattern", "mph"),
}
# Written by other scripts onto the pattern cards; kept on a rebuild.
KEEP = ("foilMap", "etchMap")


def fetch(url: str) -> bytes:
    if "malie.io" in url:
        # This CDN refuses Python's client; curl is accepted.
        return subprocess.run(["curl", "-sfL", url], capture_output=True, check=True).stdout
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def pkmngg_variants(cfg: dict) -> dict[str, dict]:
    """Collector number -> pkmn.gg variantMap."""
    html = fetch(f"https://www.pkmn.gg/series/{cfg['series']}/{cfg['slug']}").decode("utf-8", "replace")
    match = NEXT_DATA.search(html)
    if not match:
        raise RuntimeError("no __NEXT_DATA__ on the pkmn.gg set page")
    rows = json.loads(match.group(1))["props"]["pageProps"]["cardData"]
    return {str(row["number"]): {"name": row.get("name", ""), **(row.get("variantMap") or {})} for row in rows}


def tcgl_numbers(key: str) -> dict[str, set[str]]:
    """TCG Live variant code -> collector numbers printed in it."""
    index = json.loads(fetch(TCGL_INDEX))["en-US"]
    cards = json.loads(fetch(TCGL.format(path=index[key]["path"])))
    out: dict[str, set[str]] = {}
    for card in cards:
        variant = card["ext"]["tcgl"]["longFormID"].split("_")[3]
        out.setdefault(variant, set()).add(str(card["collector_number"]["numeric"]))
    return out


def printed_number(number: str, total: int) -> str:
    width = max(3, len(str(total)))
    return f"{number.zfill(width)}/{str(total).zfill(width)}"


def build(set_id: str) -> None:
    cfg = json.loads((SETS / f"{set_id}.json").read_text(encoding="utf-8"))
    kinds = cfg.get("patternPrints") or []
    if not kinds:
        raise SystemExit(f"{set_id}: no patternPrints in data/sets/{set_id}.json")
    path = DATA / f"{set_id}.json"
    cards = json.loads(path.read_text(encoding="utf-8"))
    old = {c["id"]: c for c in cards if c.get("pattern")}
    base = [c for c in cards if not c.get("pattern") and not c.get("promo")]
    promos = [c for c in cards if c.get("promo")]
    total = int(cfg["printedTotal"])

    variants = pkmngg_variants(cfg)
    tcgl = tcgl_numbers(cfg["tcglKey"]) if cfg.get("tcglKey") else {}

    made: list[dict] = []
    for kind in kinds:
        suffix, rarity, vkey, code = PATTERNS[kind]
        have = {n for n, v in variants.items() if vkey in v}
        if tcgl and have != tcgl.get(code, set()):
            raise RuntimeError(
                f"{set_id} {kind}: pkmn.gg and TCG Live disagree on "
                f"{sorted(have ^ tcgl.get(code, set()), key=int)}"
            )
        print(f"  {kind}: {len(have)} prints")
    for card in base:
        number = str(card["number"])
        for kind in kinds:
            suffix, rarity, vkey, _ = PATTERNS[kind]
            entry = (variants.get(number) or {}).get(vkey)
            if not entry:
                continue
            if variants[number]["name"].lower() != card["name"].lower():
                raise RuntimeError(f"#{number}: ours {card['name']!r} vs pkmn.gg {variants[number]['name']!r}")
            card_id = f"{card['id']}-{suffix}"
            out = {
                k: v for k, v in card.items()
                if k not in ("id", "number", "rarity", "market", "imageRemote", "foilMap", "etchMap",
                             "foilMapR", "foilMapG", "foilMapB", "etchMapH", "etchMapV", "reverseMap")
            }
            out = {
                "id": card_id,
                "name": card["name"],
                "number": f"{number}-{suffix}",
                "rarity": rarity,
                **{k: v for k, v in out.items() if k != "name"},
                "printedRarity": card["rarity"],
                "printedNumber": printed_number(number, total),
                "pattern": kind,
                "base": card["id"],
            }
            price = entry.get("price")
            if isinstance(price, (int, float)) and price > 0:
                out["market"] = round(float(price), 2)
            elif "market" in old.get(card_id, {}):
                out["market"] = old[card_id]["market"]
            if entry.get("tcgPlayerId"):
                out["tcgplayerId"] = int(entry["tcgPlayerId"])
            for key in KEEP:
                if key in old.get(card_id, {}):
                    out[key] = old[card_id][key]
            made.append(out)

    order = {kind: i for i, kind in enumerate(kinds)}
    made.sort(key=lambda c: (int(c["base"].rsplit("-", 1)[1]), order[c["pattern"]]))
    path.write_text(json.dumps(base + made + promos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    priced = sum(1 for c in made if c.get("market"))
    print(f"  wrote data/{set_id}.json: {len(base)} cards, {len(made)} pattern prints ({priced} priced), {len(promos)} promos")


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    for set_id in argv:
        print(f"{set_id}:")
        build(set_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
