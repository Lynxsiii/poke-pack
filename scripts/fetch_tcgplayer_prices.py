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
import unicodedata
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
    ("boosterBox", re.compile(r"Booster Box( \[Unlimited Edition\])?$", re.I)),
    # Retail and local-store bundles are the same six packs; retail wins.
    ("boosterBundle", re.compile(r"Booster Bundle( \(Retail\))?$", re.I)),
    ("buildBattleBox", re.compile(r"Build (&|and) Battle Box$", re.I)),
    ("boosterPack", re.compile(r"Booster Pack( \[Unlimited Edition\])?$", re.I)),
]


# Prismatic Evolutions' Poké Ball and Master Ball prints are products of their
# own; data/<id>.json files them as cards <n>-pb and <n>-mb (build_patterns.py).
PATTERN = re.compile(r"\s+\((Poke|Master) Ball Pattern\)$", re.I)
PATTERN_SUFFIX = {"poke": "pb", "master": "mb"}


def fetch(group: int, what: str) -> list[dict]:
    req = urllib.request.Request(TCGCSV.format(group=group, what=what), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["results"]


def norm(name: str) -> str:
    name = PATTERN.sub("", name)
    name = re.sub(r"^(Unown) \(([A-Z?!]+)\)$", r"\1 \2", name)  # Legends Awakened lists "Unown (J)" (the generic bracket strip below would drop the letter)
    # XY Evolutions #109 is printed "ナッシー[Exeggutor]"; TCGplayer lists "Exeggutor".
    bilingual = re.match(r"^[^\x00-\x7f]+\[([^\]]+)\]$", name)
    if bilingual:
        name = bilingual.group(1)
    # Diamond & Pearl generation: TCGplayer files the Unown by letter in brackets ("Unown [A]") where we print "Unown A",
    # and the Pokédex HANDY910is Trainer's model in parentheses.
    name = re.sub(r"^(Unown) \[([A-Z?!]+)\]$", r"\1 \2", name)
    name = re.sub(r"\((HANDY910is)\)", r"\1", name)
    # Skyridge's Miracle Spheres and Mystery Plates print a Greek letter, TCGplayer spells it out.
    name = name.replace("\u03b1", "Alpha").replace("\u03b2", "Beta").replace("\u03b3", "Gamma").replace("\u03b4", "Delta")
    # Same-name cards carry their number: "Finizen - 60/197", "Tadbulb 074/197",
    # "Ninetales -199/197".
    name = re.sub(r"\s+-?\s*\d+/\d+$", "", name)
    # Sword & Shield listings tag the print in brackets: "Shaymin V (Full
    # Art)", "Wormadam (10)", "Umbreon VMAX (Alternate Art Secret)", and
    # which professor a Professor's Research shows ("[Professor Oak]"), in
    # any order and sometimes with the number in between.
    for _ in range(3):
        name = re.sub(r"(\s+\([^)]*\))+$", "", name)
        name = re.sub(r"\s+-?\s*\d+/\d+$", "", name)
        name = re.sub(r"\s+\[[^\]]*\]$", "", name)
    # Nidoran: pkmn.gg keeps the gender sign, TCGplayer writes "(F)" / "(M)" (stripped above).
    name = name.replace("\u2640", "").replace("\u2642", "").strip()
    # Black & White's Plasma Freeze lists them "Nidoran F" / "Nidoran M".
    name = re.sub(r"\b(Nidoran)\s+[FM]$", r"\1", name)  # also Gym Challenge's "Giovanni's Nidoran F"
    # Sun & Moon's Unit Energy: TCGplayer writes the types as letters ("Unit
    # Energy FDY"), pkmn.gg spells them out ("FightingDarknessFairy").
    name = re.sub(r"^(Unit Energy)\s+\S+$", r"\1", name)
    # Black & White Blend Energy: pkmn.gg spells the types out, TCGplayer uses letters ("Blend Energy GFPD").
    name = re.sub(r"^(Blend Energy)\s+\S+$", r"\1", name)
    # Special Energy by type letter ("Speed L Energy" for Speed Lightning Energy).
    name = re.sub(r"\b([GRWLPFDMNC]) Energy$", lambda m: {"G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning", "P": "Psychic", "F": "Fighting", "D": "Darkness", "M": "Metal", "N": "Dragon", "C": "Colorless"}[m.group(1)] + " Energy", name)
    # Sun & Moon: Prism Stars print a diamond ("Celebi ◇", TCGplayer says "Celebi
    # Prism Star"), and the Fairy Charm tools carry their type as one letter
    # ("Fairy Charm L" is Lightning, "Fairy Charm O" is Dragon).
    name = name.replace("◇", " Prism Star")
    name = re.sub(r"\b(Fairy Charm) ([GRWLPFDMNCO])$", lambda m: m.group(1) + " " + {"G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning", "P": "Psychic", "F": "Fighting", "D": "Darkness", "M": "Metal", "N": "Dragon", "O": "Dragon", "C": "Colorless"}[m.group(2)], name)
    # TCGplayer spells Nidoran's symbols out ("Nidoran F"); our data keeps ♀/♂.
    name = name.replace("♀", " F").replace("♂", " M").replace("’", "'")
    # Classic Collection reprints: "M Rayquaza-EX" vs "M Rayquaza EX",
    # "Umbreon ★" vs "Umbreon Star", "_____'s Pikachu" vs "___'s Pikachu".
    name = re.sub(r"-(EX|GX)\b", r" \1", name).replace("★", " Star").replace(" δ", "").replace("◇", " Prism Star")
    name = re.sub(r"_+", "_", name)
    # Wizards of the Coast: TCGplayer spells it "Imposter Professor Oak" (Base Set 73), the card prints "Impostor".
    name = name.replace("Imposter", "Impostor")
    # ...and drops accents ("Flabebe" for Flabébé).
    name = "".join(ch for ch in unicodedata.normalize("NFKD", name) if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", name).strip().lower()


def market(rows: list[dict], sub: str) -> float | None:
    for row in rows:
        if row.get("subTypeName") == sub and row.get("marketPrice"):
            return round(float(row["marketPrice"]), 2)
    # Wizards of the Coast groups list a card as "1st Edition" and "Unlimited" (plus "... Holofoil"): the site deals Unlimited.
    unlimited = {"Normal": "Unlimited", "Holofoil": "Unlimited Holofoil"}.get(sub)
    if unlimited:
        for row in rows:
            if row.get("subTypeName") == unlimited and row.get("marketPrice"):
                return round(float(row["marketPrice"]), 2)
    return None


def price_singles(set_id: str, products: list[dict], prices: dict[int, list[dict]]) -> None:
    path = DATA / f"{set_id}.json"
    raw = path.read_text(encoding="utf-8")
    cards = json.loads(raw)
    by_number: dict[str, dict] = {}
    # Celebrations' Classic Collection reprints keep their original numbers
    # (three are 15/xxx), filed on the site as cc<n>; pick among the
    # candidates by name.
    classic: dict[str, list[dict]] = {}
    for product in products:
        ext = {e["name"]: e["value"] for e in product.get("extendedData", [])}
        number = ext.get("Number", "")
        if product.get("_gallery") == "cc":
            if re.fullmatch(r"\d+/\d+", number):
                classic.setdefault(str(int(number.split("/")[0])), []).append(product)
            continue
        # Sword & Shield's sub-galleries number their cards TG01/TG30,
        # SV001/SV122, GG01/GG70; the site keeps those numbers as printed.
        gallery = re.fullmatch(r"(TG|SV|GG|RC)(\d+)/(?:TG|SV|GG|RC)?\d+", number)
        if gallery:
            number = ""
            by_number[gallery.group(1) + gallery.group(2)] = product
        # Call of Legends' Shiny Legendaries (SL1-SL11) and the Alph Lithograph (ONE-FOUR) keep their printed numbers.
        if re.fullmatch(r"SL\d+|ONE|TWO|THREE|FOUR", number):
            by_number[number] = product
        # The e-Card sets' separately numbered holos print "H08/H32" (ours H8), and Aquapolis' four e-reader variants "050a/147" (our
        # 50, 74, 95, 103 take the "a" print's listing below).
        holo = re.fullmatch(r"H(\d+)/H\d+", number)
        if holo:
            by_number["H" + str(int(holo.group(1)))] = product
        variant = re.fullmatch(r"(\d+)([ab])/\d+", number)
        if variant:
            by_number[str(int(variant.group(1))) + variant.group(2)] = product
        if re.fullmatch(r"\d+/\d+", number):
            pattern = PATTERN.search(product["name"])
            suffix = f"-{PATTERN_SUFFIX[pattern.group(1).lower()]}" if pattern else ""
            key = str(int(number.split("/")[0])) + suffix
            # Any other variant print filed under the same number ("Mew ex -
            # 205/165 (151 Metal Card)") never displaces the pack print.
            if not pattern and key in by_number and product["name"].endswith(")"):
                continue
            by_number[key] = product
    for card in cards:
        m = re.fullmatch(r"cc(\d+)(-.*)?", str(card.get("number", "")))
        if not m:
            continue
        options = classic.get(m.group(1), [])
        match = [o for o in options if norm(o["name"]) == norm(card["name"])] or options[:1]
        if match:
            by_number[card["number"]] = match[0]

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
        # Sun & Moon's later print runs add an "a" card (sm2 60a, the 2018
        # Tapu Lele-GX) that TCGplayer files under the same listing as the
        # original, so it takes that price.
        key = card.get("number")
        if key not in by_number and re.fullmatch(r"\d+a", str(key)):
            key = str(key)[:-1]
        if key not in by_number and str(key) + "a" in by_number:
            key = str(key) + "a"
        if card.get("promo") or key not in by_number:
            continue
        product = by_number[key]
        rows = prices.get(product["productId"], [])
        first = "Normal" if card["rarity"] in ("Common", "Uncommon") else "Holofoil"
        value = market(rows, first) or market(rows, "Normal") or market(rows, "Holofoil") or market(rows, "Reverse Holofoil")  # a card TCGplayer lists only as a reverse holo (Southern Islands 1, 4, 7, 11, 14, 17)
        # Jungle and Fossil list a 1st Edition and an Unlimited price for every card ("Unlimited", "Unlimited Holofoil"): the site
        # deals the Unlimited print (the 1st Edition rows are never read).
        if any(str(r.get("subTypeName", "")).startswith("Unlimited") for r in rows):
            value = market(rows, "Unlimited Holofoil" if card["rarity"] == "Rare Holo" else "Unlimited") or market(rows, "Unlimited Holofoil") or market(rows, "Unlimited")
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
        # A sub-gallery (Trainer Gallery, Shiny Vault...) is its own TCGplayer
        # group; its singles join the set's, its sealed products do not exist.
        for sub in cfg.get("subsets") or []:
            if not sub.get("tcgplayerGroup"):
                continue
            for product in fetch(sub["tcgplayerGroup"], "products"):
                if not NOT_RETAIL.search(product["name"]):
                    products.append({**product, "_gallery": sub.get("gallery")})
            for row in fetch(sub["tcgplayerGroup"], "prices"):
                prices.setdefault(row["productId"], []).append(row)
        price_singles(set_id, products, prices)
        if not singles_only:
            price_sealed(set_id, products, prices)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
