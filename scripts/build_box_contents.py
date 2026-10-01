"""Build data/box-contents.json: the single cards each sealed product holds
beyond its booster packs and its promo cards.

A battle deck holds 59 more cards than its promo, a Build & Battle Box a
40-card deck, an Elite Trainer Box 45 basic Energy, a checklane blister the
Basic and Stage 1 cards under its foil. The Worker adds them to the buyer's
collection when the box is opened (worker/index.js, boxCardList in
js/catalog.js), and the opening screen lays them out under the promos.

The contents are researched per product and kept with their sources in the
project files (deck-boxes/parts/*.json, two or more sources per product).
This script folds those files into one small table and checks it against the
site's card data:

    python3 scripts/build_box_contents.py /path/to/deck-boxes/parts

Every row is keyed "<setId>/<productId>", the ids in data/products.json (or
one of the standard products: eliteTrainerBox, boosterBox, boosterBundle).

    "label"     the phrase a shop line uses: "40-card deck", "45 basic Energy".
    "cards"     [[cardId, copies]] the box always holds.
    "variants"  [{ "promos": [cardId], "cards": [[cardId, copies]] }]: a box
                whose contents follow the promo it came with.
    "spread"    { "total", "print" }: basic Energy dealt evenly over the eight (nine for the XY print, Fairy included)
                types, the odd cards on random types (an ETB's 45).
    "recipe"    a Build & Battle Box's deck, dealt fresh for each box; see
                boxCardList in js/catalog.js for how it is read.

Card ids are the site's own (`sv2-58`), or a shared basic Energy
(`energy-fire`, `energy-fire-tera`, `energy-fire-swsh`, `energy-fire-mee`,
`energy-fire-sm17`, `energy-fire-sm19`).

Sun & Moon is not in the project files: its research is committed in
scripts/box-research/sun-moon.json (sources, confidence and notes per row; the
write-up is .claude/skills/card-textures/reference/sun-moon-box-contents.md) and
folded in by sun_moon() below. Its products are matched by set + TCGplayer id,
so a set's rows appear when its products and cards are in the data: re-run the
script after a set lands.

    python3 scripts/build_box_contents.py /path/to/deck-boxes/parts
    python3 scripts/build_box_contents.py /path/to/deck-boxes/parts --trial   # writes a scratch file; add --verified-only to drop single-source rows
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "box-contents.json"
SM_RESEARCH = ROOT / "scripts" / "box-research" / "sun-moon.json"
XY_KITS_RESEARCH = ROOT / "scripts" / "box-research" / "xy-kits.json"
BW_RESEARCH = ROOT / "scripts" / "box-research" / "bw.json"
DP_RESEARCH = ROOT / "scripts" / "box-research" / "dp.json"
WOTC_NEO_RESEARCH = ROOT / "scripts" / "box-research" / "wotc-neo.json"
# Noah chose (2026-09-30) to ship single-source lists too. --verified-only drops them again;
# --trial writes the same build to a scratch file.
ALLOW_SINGLE = True
# Second-source check found these still in conflict (see verify-decks.md): held back until settled.
HOLD = {
    "svp/trainers-toolkit-2024": "card quantities disagree between sources",
    "swshp/trainers-toolkit-2021": "basic Energy count disagrees between sources",
}

ENERGY_TYPES = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"]
# The XY 2013 print (print "xy") has a ninth type, Fairy (js/catalog.js FAIRY_ENERGY); no other print does.
ENERGY_TYPES_XY = [*ENERGY_TYPES, "fairy"]
STANDARD = {"boosterBox", "eliteTrainerBox", "boosterBundle"}
# Basic Energy prints (js/catalog.js ENERGY_PRINTS): suffix by the print a box has.
PRINTS = {"": "", "tera": "-tera", "unova": "-unova", "swsh": "-swsh", "mee": "-mee", "sm17": "-sm17", "sm19": "-sm19", "xy": "-xy", "bw": "-bw", "dp": "-dp"}


def load_cards() -> set[str]:
    ids: set[str] = set()
    for path in DATA.glob("*.json"):
        if path.stem in {"products", "sealed", "pullrates", "patch-notes", "box-contents"}:
            continue
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(rows, list) and rows and isinstance(rows[0], dict) and "id" in rows[0]:
            ids.update(row["id"] for row in rows)
    for kind in ENERGY_TYPES:
        for suffix in PRINTS.values():
            ids.add(f"energy-{kind}{suffix}")
    ids.add("energy-fairy-xy")
    return ids


def load_meta() -> dict[str, tuple[str, list[str]]]:
    """card id -> (supertype, types), to weigh a deck's Energy by what its Pokémon need."""
    meta: dict[str, tuple[str, list[str]]] = {}
    for path in DATA.glob("*.json"):
        if path.stem in {"products", "sealed", "pullrates", "patch-notes", "box-contents"}:
            continue
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(rows, list) and rows and isinstance(rows[0], dict) and "id" in rows[0]:
            for row in rows:
                meta[row["id"]] = (row.get("supertype", ""), [t.lower() for t in row.get("types") or []])
    return meta


def load_offers() -> dict[str, dict]:
    """"<set>/<product>" -> {"promos": [...]} for every product the shop sells."""
    products = json.loads((DATA / "products.json").read_text(encoding="utf-8"))
    sealed = json.loads((DATA / "sealed.json").read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for set_id, rows in products.items():
        if set_id.startswith("_"):
            continue
        for row in rows:
            out[f"{set_id}/{row['id']}"] = {
                "promos": row.get("promos") or [],
                "set": set_id,
                "id": row["id"],
                "name": row.get("name") or "",
                "kind": row.get("kind"),
                "tcgplayerId": row.get("tcgplayerId"),
                "note": row.get("note") or "",
            }
    for set_id, prices in sealed.items():
        if not isinstance(prices, dict):
            continue
        for product in STANDARD:
            if isinstance(prices.get(product), (int, float)) and f"{set_id}/{product}" not in out:
                out[f"{set_id}/{product}"] = {
                    "promos": [], "set": set_id, "id": product, "note": "",
                    "kind": "etb" if product == "eliteTrainerBox" else None, "tcgplayerId": None,
                }
    return out


class Report:
    def __init__(self) -> None:
        self.problems: list[str] = []
        self.skipped: list[str] = []
        self.notes: list[str] = []

    def problem(self, key: str, text: str) -> None:
        self.problems.append(f"{key}: {text}")


def pairs(rows, cards: set[str], key: str, rep: Report) -> list[list]:
    """[{id, n}] -> [[id, n]], dropping (and reporting) ids the site doesn't have."""
    out: list[list] = []
    for row in rows or []:
        card_id, n = row["id"], int(row.get("n") or 1)
        if card_id not in cards:
            rep.problem(key, f"unknown card {card_id}")
            continue
        out.append([card_id, n])
    return out


def merge(rows: list[list]) -> list[list]:
    seen: dict[str | tuple, int] = {}
    for card_id, n in rows:
        key = tuple(card_id) if isinstance(card_id, list) else card_id  # [a, b] = one of the two, at random
        seen[key] = seen.get(key, 0) + n
    return [[list(card_id) if isinstance(card_id, tuple) else card_id, n] for card_id, n in seen.items()]


def mee_energy(missing: list[dict]) -> tuple[list[list], list[dict]]:
    """The deck's Basic Energy the research could not id, as MEE (Mega Evolution) Energy."""
    got: list[list] = []
    left: list[dict] = []
    for item in missing or []:
        printed = str(item.get("printed", ""))
        name = str(item.get("name", "")).lower()
        kind = next((t for t in ENERGY_TYPES if f" {t} energy" in name), None)
        if printed.startswith("MEE") and kind:
            got.append([f"energy-{kind}-mee", int(item["n"])])
        else:
            left.append(item)
    return got, left


def usable(entry: dict, confirmed: set[str], key: str) -> str | None:
    """None when this entry may ship, else why not."""
    grade = entry.get("confidence")
    if key in HOLD:
        return HOLD[key]
    if grade == "verified" or key in confirmed or (ALLOW_SINGLE and grade == "single-source"):
        return None
    if grade == "single-source":
        return "single source, not confirmed by a second"
    return f"{grade}"


def static_entry(key, entry, offer, cards, rep, promo_prefix) -> dict | None:
    """A deck or box with one fixed list, plus the extra copies of its own promos."""
    rows = pairs(entry.get("cards"), cards, key, rep)
    mee, left = mee_energy(entry.get("missing"))
    rows += mee
    total_seen = sum(n for _, n in rows) + sum(int(m.get("n") or 0) for m in left)
    for promo_id, info in (entry.get("promoCopiesInDeck") or {}).items():
        n = int(info.get("n") or 1)
        if promo_id in offer["promos"]:
            n -= 1  # the box's promo is dealt separately, once
        if n > 0:
            if promo_id in cards:
                rows.append([promo_id, n])
            else:
                rep.problem(key, f"promo copy {promo_id} not in data")
        total_seen += int(info.get("n") or 1)
    want = entry.get("total")
    if want and total_seen != want and total_seen + len(offer["promos"]) != want:
        rep.notes.append(f"{key}: lists {total_seen} of {want} cards")
    return {"cards": merge(rows)} if rows else None


def row(c: dict, cards: set[str], key: str, rep: Report):
    """One group or pool row of the research -> [id | [ids], n | [min, max]], or None."""
    ids = c.get("oneOf") or [c["id"]]
    for card_id in ids:
        if card_id not in cards:
            rep.problem(key, f"unknown card {card_id}")
            return None
    card = ids[0] if len(ids) == 1 else ids
    if "min" in c and "max" in c and "n" not in c:
        return [card, [int(c["min"]), int(c["max"])]] if c["min"] != c["max"] else [card, int(c["max"])]
    return [card, int(c.get("n") or 1)]


def group_types(rows: list, meta) -> dict[str, int]:
    """Energy types a group's Pokémon use, weighted by copies: {"fire": 8, "water": 3}."""
    weights: dict[str, int] = {}
    for card, n in rows:
        card_id = card[0] if isinstance(card, list) else card
        n = n[1] if isinstance(n, list) else n
        supertype, types = meta.get(card_id, ("", []))
        if supertype != "Pokémon":
            continue
        for kind in types:
            if kind in ENERGY_TYPES:
                weights[kind] = weights.get(kind, 0) + int(n)
    return weights


def recipe_entry(key, entry, cards, meta, rep, print_, kind) -> dict | None:
    """A Build & Battle Box whose deck is dealt fresh: see boxCardList in js/catalog.js."""
    set_id = key.split("/")[0]
    groups: dict[str, dict] = {}
    if kind == "sv":
        r = entry["recipe"]
        for promo, g in r["groups"].items():
            rows = [x for x in (row(c, cards, key, rep) for c in g["cards"]) if x]
            groups[f"{set_id}-{promo}"] = {"cards": rows, "types": group_types(rows, meta)}
        pool = [x for x in (row(c, cards, key, rep) for c in r["randomTrainers"]["pool"]) if x]
        pool = [[c[0], (c[1][0] if isinstance(c[1], list) else 0), (c[1][1] if isinstance(c[1], list) else c[1])] for c in pool]
        # The research gives each pool card {id, min, max}; row() folds min/max into a count.
        pool = []
        for c in r["randomTrainers"]["pool"]:
            if c["id"] not in cards:
                rep.problem(key, f"unknown card {c['id']}")
                continue
            pool.append([c["id"], int(c.get("min") or 0), int(c.get("max") or 1)])
        count = r["randomTrainers"]["count"]
        recipe = {
            "total": entry["total"],
            "groups": groups,
            "fixed": [x for x in (row(c, cards, key, rep) for c in r.get("fixedAllBoxes") or []) if x],
            "trainers": {"count": [count["min"], count["max"]], "pool": pool} if pool else None,
            "energy": {"print": print_},
        }
    else:
        for var in entry["variants"]:
            rows = [x for x in (row(c, cards, key, rep) for c in var["cards"]) if x]
            groups[f"{set_id}-{var['when'].split()[-1]}"] = {"cards": rows, "types": group_types(rows, meta)}
        rnd = entry["random"]["pool"]
        pool = []
        for c in rnd["cards"]:
            if c["id"] not in cards:
                rep.problem(key, f"unknown card {c['id']}")
                continue
            pool.append([c["id"], 0, int(c.get("max") or 2)])
        pack = 23
        recipe = {
            "total": entry["total"],
            "groups": groups,
            "trainers": {"fillTo": pack, "pool": pool} if pool else None,
        }
        if entry["total"] > pack:
            recipe["energy"] = {"print": print_, "n": entry["total"] - pack}
    recipe = {k: v for k, v in recipe.items() if v not in (None, [])}
    return {"recipe": recipe}


def build(parts_dir: Path) -> int:
    cards = load_cards()
    offers = load_offers()
    rep = Report()
    out: dict[str, dict] = {}

    confirmed: set[str] = set()
    for name in ("verify-bnb-sv", "verify-bnb-me-swsh", "verify-decks"):
        path = parts_dir / f"{name}.json"
        if path.exists():
            for key, row in json.loads(path.read_text(encoding="utf-8")).items():
                if row.get("status") == "confirmed":
                    confirmed.add(key)

    def load(name: str) -> dict:
        return json.loads((parts_dir / f"{name}.json").read_text(encoding="utf-8"))

    def resolve(data: dict, key: str) -> tuple[str, dict]:
        entry = data[key]
        while "sameAs" in entry and entry["sameAs"] in data and not entry.get("cards"):
            key = entry["sameAs"]
            entry = data[key]
        return key, entry

    # Fixed decks.
    for name in ("decks-sv", "decks-me-swsh"):
        data = load(name)
        for key, entry in data.items():
            if key not in offers:
                rep.skipped.append(f"{key}: not a product the site sells")
                continue
            why = usable(entry, confirmed, key)
            if why:
                rep.skipped.append(f"{key}: {why}")
                continue
            row = static_entry(key, entry, offers[key], cards, rep, key.split("/")[0])
            if not row:
                continue
            decks = entry.get("decks")
            count = len(decks) if decks else 1
            row["label"] = f"{count} × 60-card deck" if count > 1 else f"{entry.get('total') or 60}-card deck"
            out[key] = row

    # Mega Evolution Build & Battle Boxes: one fixed 40-card deck per promo.
    data = load("bnb-me-swsh")
    for key, entry in data.items():
        set_id, product = key.split("/")
        if not set_id.startswith("me") or product != "build-battle" or key not in offers:
            continue
        why = usable(entry, confirmed, key)
        if why:
            rep.skipped.append(f"{key}: {why}")
            continue
        variants = []
        for var in entry["variants"]:
            promo = f"{set_id}-{var['when'].split()[-1]}"
            rows = pairs(var["cards"], cards, key, rep)
            mee, left = mee_energy(var.get("missing"))
            if left:
                rep.problem(key, f"{promo}: unplaced {left}")
            variants.append({"promos": [promo], "cards": merge(rows + mee)})
        out[key] = {"label": "40-card deck", "variants": variants}

    meta = load_meta()

    # Scarlet & Violet Build & Battle Boxes: 40 cards, dealt from four themed groups.
    data = load("bnb-sv")
    for key, entry in data.items():
        if "recipe" not in entry or key not in offers:
            continue
        why = usable(entry, confirmed, key)
        if why:
            rep.skipped.append(f"{key}: {why}")
            continue
        set_id = key.split("/")[0]
        # Energy art follows the set's own pack Energy (js/catalog.js energyPrint).
        print_ = "tera" if set_id in {"sv7", "sv8", "sv9", "sv10"} else ""
        row_ = recipe_entry(key, entry, cards, meta, rep, print_, "sv")
        if row_:
            row_["label"] = "40-card deck"
            out[key] = row_

    # Sword & Shield Build & Battle Boxes: a 23-card Evolution pack (swsh1-8),
    # or that plus 17 basic Energy as a 40-card deck (swsh9-12).
    data = load("bnb-me-swsh")
    for key, entry in data.items():
        set_id, product = key.split("/")
        if not set_id.startswith("swsh") or product != "buildBattleBox" or "variants" not in entry or key not in offers:
            continue
        why = usable(entry, confirmed, key)
        if why:
            rep.skipped.append(f"{key}: {why}")
            continue
        row_ = recipe_entry(key, entry, cards, meta, rep, "swsh", "swsh")
        if row_:
            row_["label"] = f"{entry['total']}-card " + ("deck" if entry["total"] == 40 else "Evolution pack")
            out[key] = row_

    # Elite Trainer Boxes: basic Energy.
    for key, entry in load("etb-sv").items():
        if "energy" not in entry or key not in offers:
            continue
        why = usable(entry, confirmed, key)
        if why:
            rep.skipped.append(f"{key}: {why}")
            continue
        raw = entry["energy"]["print"]
        print_ = "tera" if raw.endswith("-tera") else ""
        total = int(entry["energy"]["total"])
        out[key] = {"label": f"{total} basic Energy", "spread": {"total": total, **({"print": print_} if print_ else {})}}
    for key, entry in load("etb-me-swsh").items():
        set_id = key.split("/")[0]
        if key not in offers or entry.get("sameAs"):
            continue
        why = usable(entry, confirmed, key)
        if why:
            rep.skipped.append(f"{key}: {why}")
            continue
        if set_id.startswith("me") and set_id != "me55":
            out[key] = {"label": "40 basic Energy", "spread": {"total": 40, "print": "mee"}}
        elif entry.get("cards"):
            rows = pairs(entry["cards"], cards, key, rep)
            out[key] = {"label": f"{sum(n for _, n in rows)} basic Energy", "cards": rows}
        else:
            rep.skipped.append(f"{key}: Energy print or split unknown")

    # Everything else that adds single cards to a box.
    for name in ("blisters", "tins-bundles", "premium", "collections"):
        data = load(name)
        for key in data:
            target, entry = resolve(data, key)
            if key not in offers or key in out:
                continue
            rows = pairs(entry.get("cards"), cards, key, rep)
            if not rows:
                continue
            why = usable(entry, confirmed, key)
            if why:
                rep.skipped.append(f"{key}: {why}")
                continue
            more = sum(n for _, n in rows)
            out[key] = {"label": f"{more} extra card{'s' if more != 1 else ''}", "cards": merge(rows)}

    if SM_RESEARCH.exists():
        sun_moon(json.loads(SM_RESEARCH.read_text(encoding="utf-8")), out, rep, offers, cards, meta)

    if XY_KITS_RESEARCH.exists():
        xy_kits(json.loads(XY_KITS_RESEARCH.read_text(encoding="utf-8")), out, rep, offers, cards)

    if BW_RESEARCH.exists():
        black_white(json.loads(BW_RESEARCH.read_text(encoding="utf-8")), out, rep, offers, cards)

    if DP_RESEARCH.exists():
        dp_kits(json.loads(DP_RESEARCH.read_text(encoding="utf-8")), out, rep, offers, cards)

    if WOTC_NEO_RESEARCH.exists():
        wotc_decks(json.loads(WOTC_NEO_RESEARCH.read_text(encoding="utf-8")), out, rep, offers, cards)

    write(out, rep, offers)
    return 0


def xy_kits(research: dict, out: dict, rep: Report, offers: dict, cards: set[str]) -> None:
    """XY Trainer Kits: two fixed 30-card half decks (scripts/box-research/xy-kits.json).

    Each half deck is a set of its own (xytk6a ... xytk9b, cards 1-30 in the kit's draw order)
    and the kit is sold on both pages; opening it deals all 60. The product's promo is its own
    half deck's holofoil #30 and is dealt separately, so the row holds the other 59 cards.
    """
    for kit in research["kits"]:
        halves = kit["halves"]
        for own in halves:
            key = f"{own}/{kit['product']}"
            if key not in offers:
                rep.skipped.append(f"{key}: not a product the site sells yet")
                continue
            promo = set(offers[key]["promos"])
            rows = []
            for half in halves:
                for number in range(1, int(kit["cardsPerHalf"]) + 1):
                    card_id = f"{half}-{number}"
                    if card_id not in cards:
                        rep.problem(key, f"unknown card {card_id}")
                    elif card_id not in promo:
                        rows.append([card_id, 1])
            out[key] = {"label": f"2 × {kit['cardsPerHalf']}-card half deck", "cards": rows}


def black_white(research: dict, out: dict, rep: Report, offers: dict, cards: set[str]) -> None:
    """Black & White: the two Elite Trainer Boxes' Energy, the 21 theme decks and the Trainer Kit
    (scripts/box-research/bw.json). Rows appear when the product and its cards are on the site, so
    re-run the script after the Black & White sets land; what is missing is listed under SKIPPED."""
    names: dict[str, dict[str, str]] = {}

    def card_name(card_id: str) -> str:
        set_id = card_id.split("-")[0]
        if set_id not in names:
            path = DATA / f"{set_id}.json"
            rows = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
            names[set_id] = {r["id"]: r.get("name", "") for r in rows}
        return names[set_id].get(card_id, "")

    def squash(text: str) -> str:
        return re.sub(r"[^a-z0-9]", "", text.lower())

    # Elite Trainer Boxes: 40 basic Energy, 5 of each of the eight types, the era's print.
    etb = research["etb"]
    for set_id, info in etb["sets"].items():
        found = [(k, o) for k, o in offers.items() if o.get("set") == set_id and o.get("kind") == "etb"]
        if not found:
            rep.skipped.append(f"{set_id}: Elite Trainer Box not on the site yet (no product of kind etb)")
            continue
        for key, _offer in found:
            out[key] = {"label": f"{info['total']} basic Energy", "spread": {"total": info["total"], "print": etb["print"]}}

    # Trainer Kit: both half decks, 59 cards beside the product's own promo (the half's holofoil #30).
    for kit in research["kits"]:
        for own in kit["halves"]:
            found = [(k, o) for k, o in offers.items() if o.get("set") == own and o.get("tcgplayerId") == kit["tcgplayerId"]]
            if len(found) != 1:
                rep.skipped.append(f"{own}/{kit['product']}: not a product the site sells yet")
                continue
            key, offer = found[0]
            promo = set(offer["promos"])
            rows = []
            for half in kit["halves"]:
                for number in range(1, int(kit["cardsPerHalf"]) + 1):
                    card_id = f"{half}-{number}"
                    if card_id not in cards:
                        rep.problem(key, f"unknown card {card_id}")
                    elif card_id not in promo:
                        rows.append([card_id, 1])
            out[key] = {"label": f"2 × {kit['cardsPerHalf']}-card half deck", "cards": rows}

    # Theme decks: one fixed 60-card list. The deck's exclusive print (its promo, a Cracked Ice or Tinsel
    # holo, sometimes beside a non-holo twin) replaces one copy of the same-named card in the list, so the
    # product deals 60 cards in all.
    for deck in research["decks"]:
        want = squash(deck["name"])
        in_set = [(k, o) for k, o in offers.items() if o.get("set") == deck["set"]]
        found = [(k, o) for k, o in in_set if deck.get("tcgplayerId") and o.get("tcgplayerId") == deck["tcgplayerId"]]
        if not found:
            found = [(k, o) for k, o in in_set if want in squash(o["id"]) or want in squash(o.get("name", ""))]
        if len(found) != 1:
            rep.skipped.append(f"{deck['set']}/{deck['name']}: theme deck product {'not on the site yet' if not found else 'matches several products'}")
            continue
        key, offer = found[0]
        missing = sorted({c["id"] for c in deck["cards"] if c["id"] not in cards})
        if missing:
            rep.skipped.append(f"{key}: waiting for {', '.join(sorted({m.split('-')[0] for m in missing}))}")
            continue
        wrong = [c for c in deck["cards"] if card_name(c["id"]) and squash(card_name(c["id"])) != squash(c["name"])]
        for c in wrong:
            rep.problem(key, f"{c['id']} is {card_name(c['id'])} on the site, the research says {c['name']}")
        rows = [[c["id"], c["n"]] for c in deck["cards"]]
        rows += [[f"energy-{e['type']}-{etb['print']}", e["n"]] for e in deck["energy"]]
        for kind in {e["type"] for e in deck["energy"]}:
            if f"energy-{kind}-{etb['print']}" not in cards:
                rep.problem(key, f"unknown Energy {kind}")
        dealt = 0
        for promo in offer["promos"]:
            label = card_name(promo)
            hit = next((r for r in rows if label and card_name(r[0]) == label and r[1] > 0), None)
            if hit:
                hit[1] -= 1
                dealt += 1
            else:
                rep.notes.append(f"{key}: promo {promo} ({label}) is not a card of the list; it is dealt on top of the 60")
        rows = [r for r in rows if r[1] > 0]
        out[key] = {"label": "60-card deck", "cards": merge(rows)}
        rep.notes.append(f"{key}: {sum(r[1] for r in rows)} cards + {len(offer['promos'])} promo(s) ({dealt} counted inside the list)")


def dp_kits(research: dict, out: dict, rep: Report, offers: dict, cards: set[str]) -> None:
    """Diamond & Pearl and HGSS Trainer Kits (scripts/box-research/dp.json): both half decks, the other half's cards and
    this half's own, beside the product's own promo (the half's holofoil). The HGSS halves are thirty cards each; the DP
    halves are the twelve and eleven different cards pkmn.gg lists (one of each, the copies are not on record)."""
    for kit in research["kits"]:
        for own in kit["halves"]:
            found = [(k, o) for k, o in offers.items() if o.get("set") == own and o.get("tcgplayerId") == kit["tcgplayerId"]]
            if len(found) != 1:
                rep.skipped.append(f"{own}/{kit['product']}: not a product the site sells yet")
                continue
            key, offer = found[0]
            promo = set(offer["promos"])
            rows = []
            for half in kit["halves"]:
                for number in range(1, int(kit["cards"][half]) + 1):
                    card_id = f"{half}-{number}"
                    if card_id not in cards:
                        rep.problem(key, f"unknown card {card_id}")
                    elif card_id not in promo:
                        rows.append([card_id, 1])
            out[key] = {"label": kit["label"], "cards": rows}


def wotc_decks(research: dict, out: dict, rep: Report, offers: dict, cards: set[str]) -> None:
    """Wizards of the Coast theme decks (scripts/box-research/wotc-neo.json): one fixed 60-card list each, the set's own
    numbered Energy included as ordinary cards. The deck's featured holo is the product's promo (a card of the set, dealt
    once: it replaces one copy in the list), so the product deals 60 cards in all."""
    for deck in research["decks"]:
        found = [(k, o) for k, o in offers.items() if o.get("set") == deck["set"] and o.get("tcgplayerId") == deck["tcgplayerId"]]
        if len(found) != 1:
            rep.skipped.append(f"{deck['set']}/{deck['name']}: theme deck product not on the site (TCGplayer lists no price for it)")
            continue
        key, offer = found[0]
        missing = sorted({c["id"] for c in deck["cards"] if c["id"] not in cards})
        if missing:
            rep.skipped.append(f"{key}: waiting for {', '.join(sorted({m.split('-')[0] for m in missing}))}")
            continue
        rows = [[c["id"], c["n"]] for c in deck["cards"]]
        dealt = 0
        for promo in offer["promos"]:
            hit = next((r for r in rows if r[0] == promo and r[1] > 0), None)
            if hit:
                hit[1] -= 1
                dealt += 1
            else:
                rep.problem(key, f"promo {promo} is not a card of the list")
        rows = [r for r in rows if r[1] > 0]
        out[key] = {"label": "60-card deck", "cards": merge(rows)}
        rep.notes.append(f"{key}: {sum(r[1] for r in rows)} cards + {len(offer['promos'])} promo(s) ({dealt} counted inside the list)")


def catalog_prints() -> dict[str, str]:
    """set id -> energyPrint, read from js/catalog.js (what the set's own packs carry)."""
    out: dict[str, str] = {}
    for block in (ROOT / "js" / "catalog.js").read_text(encoding="utf-8").split("\nexport const ")[1:]:
        set_id = re.search(r'\n  id: "([^"]+)"', block)
        print_ = re.search(r'\n  energyPrint: "([^"]+)"', block)
        if set_id and print_:
            out[set_id.group(1)] = print_.group(1)
    return out


def find_offer(offers: dict[str, dict], set_id: str, tcgplayer_id, kind: str | None = None) -> tuple[str, dict] | None:
    """The product a research row is about: by TCGplayer id, or the set's only product of that kind."""
    rows = [(k, o) for k, o in offers.items() if o.get("set") == set_id]
    if tcgplayer_id:
        rows = [(k, o) for k, o in rows if o.get("tcgplayerId") == tcgplayer_id]
    elif kind:
        rows = [(k, o) for k, o in rows if o.get("kind") == kind]
    else:
        return None
    return rows[0] if len(rows) == 1 else None


def sm_cards(rows: list[dict], cards: set[str], promos: list[str]) -> tuple[list[list], set[str]]:
    """Research card rows -> [[id | [ids], n]], and the ids (by set) the site does not have yet.
    A card the product already deals as a promo is dealt once, not twice."""
    out: list[list] = []
    missing: set[str] = set()
    for item in rows:
        ids = item.get("oneOf") or [item["id"]]
        gone = [i for i in ids if i not in cards]
        if gone:
            missing.update(i.rsplit("-", 1)[0] for i in gone)
            continue
        n = int(item.get("n") or 1)
        if len(ids) == 1 and ids[0] in promos:
            n -= 1
        if n > 0:
            out.append([ids[0] if len(ids) == 1 else ids, n])
    return out, missing


def sun_moon(research: dict, out: dict, rep: Report, offers: dict, cards: set[str], meta) -> None:
    """Sun & Moon sealed products: ETB Energy, reprint cards, Evolution packs (scripts/box-research/sun-moon.json)."""
    def shippable(entry: dict, key: str) -> bool:
        if entry.get("confidence") == "verified" or (ALLOW_SINGLE and entry.get("confidence") == "single-source"):
            return True
        rep.skipped.append(f"{key}: {entry.get('confidence')}, not confirmed by a second source")
        return False

    waiting: dict[str, int] = {}

    def no_product(item: dict) -> None:
        waiting[item["set"]] = waiting.get(item["set"], 0) + 1

    def stale_note(key: str, offer: dict) -> None:
        if "simulated" in offer.get("note", ""):
            rep.notes.append(f"{key}: its note in data/sets/{offer['set']}.json says cards are not simulated; update it")

    # Elite Trainer Boxes: 5 of each basic Energy, the set's own print. The 45th-card Fairy is not on the site.
    etb = research["etb"]
    in_catalog = catalog_prints()
    per_type = etb["total"] // etb["types"]
    for key, offer in sorted(offers.items()):
        print_ = etb["print"].get(offer["set"])
        if not print_ or offer.get("kind") != "etb":
            continue
        if in_catalog.get(offer["set"], print_) != print_:
            rep.problem(key, f"research says {print_}, js/catalog.js energyPrint is {in_catalog[offer['set']]}")
            continue
        if shippable(etb, key):
            n_types = len(ENERGY_TYPES_XY if print_ == "xy" else ENERGY_TYPES)
            out[key] = {"label": f"{per_type * n_types} basic Energy", "spread": {"total": per_type * n_types, "print": print_}}
    for set_id in sorted({o["set"] for o in offers.values()} & {s for s in etb["print"]}):
        if not any(k.startswith(set_id + "/") and k in out and "spread" in out[k] for k in out) and not in_catalog.get(set_id):
            rep.notes.append(f"{set_id}: no ETB row (set is not in js/catalog.js yet, or its ETB product is missing)")

    # Products that hold extra set cards (reprints, Stage 1 lines).
    for item in research["products"]:
        found = find_offer(offers, item["set"], item["tcgplayerId"])
        if not found:
            no_product(item)
            continue
        key, offer = found
        if not shippable(item, key):
            continue
        rows, need = sm_cards(item["cards"], cards, offer["promos"])
        if need:
            rep.skipped.append(f"{key}: waiting for {', '.join(sorted(need))}")
            continue
        if not rows:
            continue
        more = sum(n for _, n in rows)
        out[key] = {"label": f"{more} extra card{'s' if more != 1 else ''}", "cards": merge(rows)}
        stale_note(key, offer)

    # Build & Battle Boxes / Prerelease Kits: a 23-card Evolution pack (promo group + a random group + random Trainers).
    for item in research["buildBattle"]:
        found = find_offer(offers, item["set"], item["tcgplayerId"], "battle")
        if not found:
            no_product(item)
            continue
        key, offer = found
        if not shippable(item, key):
            continue
        by_number = {int(re.sub(r"\D", "", p.rsplit("-", 1)[-1]) or 0): p for p in offer["promos"]}
        groups: dict[str, dict] = {}
        need: set[str] = set()
        for g in item["groups"]:
            promo = by_number.get(g["promo"])
            if not promo:
                rep.problem(key, f"group {g['name']}: SM{g['promo']} is not one of the product's promos")
                break
            rows, gone = sm_cards(g["cards"], cards, [])
            need |= gone
            groups[promo] = {"cards": rows, "types": group_types(rows, meta)}
        else:
            pool = []
            for c in item["pool"]:
                if c["id"] in cards:
                    pool.append([c["id"], 0, int(c["max"])])
                else:
                    need.add(c["id"].rsplit("-", 1)[0])
            if need:
                rep.skipped.append(f"{key}: waiting for {', '.join(sorted(need))}")
                continue
            out[key] = {
                "label": f"{item['total']}-card Evolution pack",
                "recipe": {"total": item["total"], "groups": groups, "trainers": {"fillTo": item["total"], "pool": pool}},
            }
            stale_note(key, offer)
    if waiting:
        rep.notes.append("Sun & Moon research rows waiting for their product: " + ", ".join(f"{k} ({v})" for k, v in sorted(waiting.items())))


def write(out: dict, rep: Report, offers: dict) -> None:
    ordered = {key: out[key] for key in sorted(out)}
    OUT.write_text(json.dumps(ordered, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT}: {len(ordered)} products")
    for label, rows in (("PROBLEMS", rep.problems), ("SKIPPED", rep.skipped), ("NOTES", rep.notes)):
        if rows:
            print(f"\n{label} ({len(rows)})")
            for row in rows:
                print("  " + row)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        raise SystemExit(__doc__)
    if "--verified-only" in sys.argv:
        ALLOW_SINGLE = False
    if "--trial" in sys.argv:
        OUT = Path("/tmp/box-contents-trial.json")
    raise SystemExit(build(Path(args[0])))
