"""Price a set's singles and sealed products straight from TCGplayer.

tcgcsv.com mirrors TCGplayer's catalogue and market prices as JSON, one
group per set (https://tcgcsv.com/tcgplayer/3/<group>/products|prices). A
set opts in with `tcgplayerGroup` in data/sets/<id>.json.

Singles: each numbered card in data/<id>.json gets `market` (USD, the
TCGplayer market price of the pack-pulled print: Normal for Commons and
Uncommons, Holofoil for everything else) and `tcgplayerId`, so every price
traces back to its TCGplayer listing. Cards are matched by collector number,
and the run refuses a set whose names don't line up, as fetch_prices.py does.
Promo cards are left to build_products.py.

Sealed: the set's row in data/sealed.json gets the standard products' market
prices (booster box, ETB, Pokémon Center ETB, bundle, Build & Battle Box,
pack), matched by product name within the set's group.

Price history is not written here; see the price history backfill.

Usage:
    python3 scripts/fetch_tcgplayer_prices.py sv8
    python3 scripts/fetch_tcgplayer_prices.py sv8 --singles-only
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEALED = DATA / "sealed.json"
TCGCSV = "https://tcgcsv.com/tcgplayer/3/{group}/{what}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip price refresh"

# sealed.json key -> product-name test. Cases, displays, code cards, sleeved
# and half boxes are other products that share the words.
NOT_RETAIL = re.compile(r"\b(Case|Display|Code Card|Sleeved|Half|Art Bundle|Set of)\b", re.I)
SEALED_NAMES = [
    ("pcEliteTrainerBox", re.compile(r"Pok[eé]mon Center Elite Trainer Box", re.I)),
    ("eliteTrainerBox", re.compile(r"(?<!Center )Elite Trainer Box$", re.I)),
    ("boosterBox", re.compile(r"Booster Box$", re.I)),
    # Retail and local-store bundles are the same six packs; retail wins.
    ("boosterBundle", re.compile(r"Booster Bundle( \(Retail\))?$", re.I)),
    ("buildBattleBox", re.compile(r"Build (&|and) Battle Box$", re.I)),
    ("boosterPack", re.compile(r"Booster Pack$", re.I)),
]


def fetch(group: int, what: str) -> list[dict]:
    req = urllib.request.Request(TCGCSV.format(group=group, what=what), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["results"]


def norm(name: str) -> str:
    name = re.sub(r"\s+-\s+\d+/\d+$", "", name)
    return name.replace("’", "'").strip().lower()


def market(rows: list[dict], sub: str) -> float | None:
    for row in rows:
        if row.get("subTypeName") == sub and row.get("marketPrice"):
            return round(float(row["marketPrice"]), 2)
    return None


def price_singles(set_id: str, products: list[dict], prices: dict[int, list[dict]]) -> None:
    path = DATA / f"{set_id}.json"
    raw = path.read_text(encoding="utf-8")
    cards = json.loads(raw)
    by_number: dict[str, dict] = {}
    for product in products:
        ext = {e["name"]: e["value"] for e in product.get("extendedData", [])}
        number = ext.get("Number", "")
        if re.fullmatch(r"\d+/\d+", number):
            by_number[str(int(number.split("/")[0]))] = product

    wrong = [
        (c["number"], c["name"], by_number[c["number"]]["name"])
        for c in cards
        if not c.get("promo") and c["number"] in by_number
        and norm(c["name"]) != norm(by_number[c["number"]]["name"])
    ]
    if wrong:
        for row in wrong[:5]:
            print("    #%s: ours %r vs TCGplayer %r" % row)
        raise SystemExit(f"{set_id}: {len(wrong)} name mismatch(es); refusing to price a drifted set")

    priced, missing = 0, []
    for card in cards:
        if card.get("promo") or card.get("number") not in by_number:
            continue
        product = by_number[card["number"]]
        rows = prices.get(product["productId"], [])
        first = "Normal" if card["rarity"] in ("Common", "Uncommon") else "Holofoil"
        value = market(rows, first) or market(rows, "Normal") or market(rows, "Holofoil")
        card["tcgplayerId"] = product["productId"]
        if value:
            card["market"] = value
            priced += 1
        else:
            missing.append(card["number"])
    out = json.dumps(cards, ensure_ascii=False, indent=2) + "\n"
    if out != raw:
        path.write_text(out, encoding="utf-8", newline="\n")
    print(f"  singles  {priced}/{len(cards)} priced" + (f", no market price: {', '.join(missing)}" if missing else ""))


def price_sealed(set_id: str, products: list[dict], prices: dict[int, list[dict]]) -> None:
    found: dict[str, float] = {}
    for key, test in SEALED_NAMES:
        for product in sorted(products, key=lambda p: "(Retail)" not in p["name"]):
            if NOT_RETAIL.search(product["name"]) or not test.search(product["name"]):
                continue
            value = market(prices.get(product["productId"], []), "Normal")
            if value and key not in found:
                found[key] = value
    store = json.loads(SEALED.read_text(encoding="utf-8"))
    row = store.setdefault(set_id, {})
    row.update(found)
    SEALED.write_text(json.dumps(store, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("  sealed   " + ", ".join(f"{k} ${v:.2f}" for k, v in found.items()))


def main(argv: list[str]) -> int:
    singles_only = "--singles-only" in argv
    for set_id in [a for a in argv if not a.startswith("--")]:
        cfg = json.loads((DATA / "sets" / f"{set_id}.json").read_text(encoding="utf-8"))
        group = cfg.get("tcgplayerGroup")
        if not group:
            print(f"{set_id}: no tcgplayerGroup in data/sets/{set_id}.json", file=sys.stderr)
            return 2
        print(f"{set_id} (TCGplayer group {group}):")
        products = fetch(group, "products")
        prices: dict[int, list[dict]] = {}
        for row in fetch(group, "prices"):
            prices.setdefault(row["productId"], []).append(row)
        price_singles(set_id, products, prices)
        if not singles_only:
            price_sealed(set_id, products, prices)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
