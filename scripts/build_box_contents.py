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
    "spread"    { "total", "print" }: basic Energy dealt evenly over the eight
                types, the odd cards on random types (an ETB's 45).
    "recipe"    a Build & Battle Box's deck, dealt fresh for each box; see
                boxCardList in js/catalog.js for how it is read.

Card ids are the site's own (`sv2-58`), or a shared basic Energy
(`energy-fire`, `energy-fire-tera`, `energy-fire-swsh`, `energy-fire-mee`).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "box-contents.json"
# --trial ships single-source rows too, to a scratch file, to exercise the deal.
ALLOW_SINGLE = False

ENERGY_TYPES = ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"]
STANDARD = {"boosterBox", "eliteTrainerBox", "boosterBundle"}
# Basic Energy prints (js/catalog.js ENERGY_PRINTS): suffix by the print a box has.
PRINTS = {"": "", "tera": "-tera", "unova": "-unova", "swsh": "-swsh", "mee": "-mee"}


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
            out[f"{set_id}/{row['id']}"] = {"promos": row.get("promos") or []}
    for set_id, prices in sealed.items():
        if not isinstance(prices, dict):
            continue
        for product in STANDARD:
            if isinstance(prices.get(product), (int, float)) and f"{set_id}/{product}" not in out:
                out[f"{set_id}/{product}"] = {"promos": []}
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
    seen: dict[str, int] = {}
    for card_id, n in rows:
        seen[card_id] = seen.get(card_id, 0) + n
    return [[card_id, n] for card_id, n in seen.items()]


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

    write(out, rep, offers)
    return 0


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
    if "--trial" in sys.argv:
        ALLOW_SINGLE = True
        OUT = Path("/tmp/box-contents-trial.json")
    raise SystemExit(build(Path(args[0])))
