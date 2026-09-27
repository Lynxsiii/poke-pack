"""Refresh real market prices for every playable set.

Two sources, both read straight off the pages' own structured data rather than
scraped markup, so a cosmetic redesign on either site won't silently break us:

  * singles  — pkmn.gg set page, ``__NEXT_DATA__`` → ``props.pageProps.cardData``
  * sealed   — pittpokeresearch.com set page, JSON-LD ``Product`` offers

Singles are written back into ``data/<set>.json`` as a ``market`` field on each
card (USD), and today's price is added to the card's chart in
``data/prices/<set>.json``. Sealed prices land in ``data/sealed.json``, keyed by
set id, which is what the shop reads for pack cost.

Cards are matched by collector number, and the run aborts for a set if the
names don't line up — a silent mismatch would mis-price the whole binder.

Usage:
    py scripts/fetch_prices.py            # all sets
    py scripts/fetch_prices.py me5 me4    # just these
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import price_history  # noqa: E402
from build_patterns import PATTERNS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SEALED_OUT = DATA / "sealed.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip price refresh"

def load_set_cfgs() -> dict[str, dict]:
    """data/sets/<id>.json is the source of truth for series/slug/pitt."""
    out: dict[str, dict] = {}
    for path in sorted((DATA / "sets").glob("*.json")):
        cfg = json.loads(path.read_text(encoding="utf-8"))
        if cfg.get("id"):
            out[cfg["id"]] = cfg
    return out


PITT = "https://www.pittpokeresearch.com/pokemon-set/{slug}"

# Sealed product name suffix -> key we store it under.
SEALED_KEYS = [
    ("Pokémon Center Elite Trainer Box", "pcEliteTrainerBox"),
    ("Elite Trainer Box", "eliteTrainerBox"),
    ("Booster Box", "boosterBox"),
    ("Booster Bundle", "boosterBundle"),
    ("Build & Battle Box", "buildBattleBox"),
    ("Booster Pack", "boosterPack"),
]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", "replace")


def singles(cfg: dict) -> dict[str, dict]:
    """Collector number -> USD market price for the pack-pulled printing."""
    series = cfg["series"]
    slug = cfg["slug"]
    html = fetch(f"https://www.pkmn.gg/series/{series}/{slug}")
    blob = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    if not blob:
        raise RuntimeError(f"no __NEXT_DATA__ on pkmn.gg/{series}/{slug} — page shape changed")
    cards = json.loads(blob.group(1))["props"]["pageProps"]["cardData"]
    out: dict[str, dict] = {}
    for card in cards:
        number = str(card.get("number", "")).strip()
        price = card.get("sortPrice")
        if not number or not isinstance(price, (int, float)):
            continue
        price = float(price)
        # Prismatic (and 151-style sets) list Poké Ball / Master Ball printings
        # as extra rows of the same number. Keep the cheapest — that's the
        # pack-pulled base, not the Master Ball chase.
        prev = out.get(number)
        if prev is None or price < prev["price"]:
            out[number] = {"price": price, "name": card.get("name", "")}
        # Sets that file those printings as cards of their own
        # (scripts/build_patterns.py) price each one from its own variant.
        for kind in cfg.get("patternPrints") or []:
            suffix, _, key, _ = PATTERNS[kind]
            entry = (card.get("variantMap") or {}).get(key) or {}
            if isinstance(entry.get("price"), (int, float)) and entry["price"] > 0:
                out[f"{number}-{suffix}"] = {"price": float(entry["price"]), "name": card.get("name", "")}
    return out


def sealed(slug: str) -> dict[str, float]:
    """Sealed product key -> USD, from the page's JSON-LD Product offers."""
    html = fetch(PITT.format(slug=slug))
    found: dict[str, float] = {}

    def walk(node):
        if isinstance(node, dict):
            if node.get("@type") == "Product":
                name = str(node.get("name", ""))
                offer = node.get("offers") or {}
                price = offer.get("price")
                if price is not None:
                    for suffix, key in SEALED_KEYS:
                        # Most specific suffix wins; PC ETB also ends in "Elite
                        # Trainer Box", so order in SEALED_KEYS matters.
                        if name.endswith(suffix) and key not in found:
                            found[key] = round(float(price), 2)
                            break
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for block in re.findall(
        r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S
    ):
        try:
            walk(json.loads(block))
        except json.JSONDecodeError:
            continue
    return found


def apply_singles(set_id: str, priced: dict[str, dict]) -> tuple[int, int]:
    path = DATA / f"{set_id}.json"
    cards = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(cards, list):
        raise RuntimeError(f"{path.name}: expected a list of cards")

    mismatched = [
        (c["number"], c["name"], priced[str(c["number"])]["name"])
        for c in cards
        if str(c["number"]) in priced
        and c["name"].lower() != priced[str(c["number"])]["name"].lower()
    ]
    if mismatched:
        for number, ours, theirs in mismatched[:5]:
            print(f"    #{number}: ours {ours!r} vs theirs {theirs!r}")
        raise RuntimeError(
            f"{set_id}: {len(mismatched)} name mismatch(es) — refusing to price "
            "a set whose numbering has drifted"
        )

    hit = 0
    for card in cards:
        entry = priced.get(str(card["number"]))
        if not entry:
            continue
        card["market"] = round(entry["price"], 2)
        hit += 1

    path.write_text(json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return hit, len(cards)


def record_history(set_id: str, priced: dict[str, dict], today: str) -> int:
    """Add today's price for each card to data/prices/<set>.json.

    scripts/backfill_prices.py fills in the year before; this keeps the chart
    moving. Re-running on the same day overwrites that day rather than stacking
    duplicates.
    """
    prices = {f"{set_id}-{number}": entry["price"] for number, entry in priced.items()}
    return price_history.record(set_id, "cards", prices, today)


def main(argv: list[str]) -> int:
    cfgs = load_set_cfgs()
    wanted = argv or list(cfgs)
    unknown = [s for s in wanted if s not in cfgs]
    if unknown:
        print(f"unknown set(s): {', '.join(unknown)}", file=sys.stderr)
        return 2

    today = time.strftime("%Y-%m-%d")
    price_history.fold_legacy()
    store = {}
    if SEALED_OUT.exists():
        store = json.loads(SEALED_OUT.read_text(encoding="utf-8"))

    failed = []
    for set_id in wanted:
        cfg = cfgs[set_id]
        pitt_slug = cfg.get("pittSlug")
        print(f"{set_id}:")
        try:
            priced = singles(cfg)
            hit, total = apply_singles(set_id, priced)
            logged = record_history(set_id, priced, today)
            print(f"  singles  {hit}/{total} priced, {logged} history points logged")
        except (urllib.error.URLError, RuntimeError, KeyError) as exc:
            print(f"  singles  FAILED — {exc}")
            failed.append(set_id)
        time.sleep(1)
        if not pitt_slug:
            print("  sealed   skipped (no pittSlug)")
            continue
        try:
            products = sealed(pitt_slug)
            if not products:
                raise RuntimeError("no Product offers in JSON-LD")
            store[set_id] = products
            listed = ", ".join(f"{k} ${v:.2f}" for k, v in sorted(products.items()))
            print(f"  sealed   {listed}")
        except (urllib.error.URLError, RuntimeError) as exc:
            print(f"  sealed   FAILED — {exc}")
            failed.append(set_id)
        time.sleep(1)

    store["_fetchedAt"] = today
    SEALED_OUT.write_text(json.dumps(store, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {SEALED_OUT.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
