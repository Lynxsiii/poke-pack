"""Backfill a year of TCGplayer market prices into data/prices/<set>.json.

The price chart used to start on the day this site began tracking a card. This
fills in what came before from TCGplayer's own price history, the one behind
the chart on every tcgplayer.com product page:

  * the last 30 days as daily points,
  * 30 to 90 days back as 3-day points,
  * 90 days to a year back as weekly points,

each the TCGplayer market price for the Near Mint copy of the card's pack
printing (Holofoil, else Normal; never the reverse holo) or for the Unopened
product. A card or product younger than a year simply starts at its release.

It covers every card in data/<set>.json (promos included), the set's booster
pack, box, ETB, bundle and Build & Battle Box from data/sealed.json, and every
promo product in data/products.json. Cards are matched to TCGplayer products
by collector number and name through tcgcsv.com's mirror of the catalogue; a
card that matches nothing is listed and left without history, never guessed.

Re-running is safe and only ever adds: a backfilled point fills a date the file
has no point for and never replaces one it already holds, so prices the site
recorded itself stay as they were.

Usage:
    python3 scripts/backfill_prices.py sv5            # one set, a year back
    python3 scripts/backfill_prices.py sv5 sv6 sv7
    python3 scripts/backfill_prices.py --all
    python3 scripts/backfill_prices.py --daily --all  # only today's point
    add --refresh to ignore today's download cache

`--daily` records today's market price for the same cards and products from
tcgcsv.com's daily TCGplayer price files: one request per TCGplayer group, so
it is cheap enough to run every day, and a routine runs it each morning (UTC)
and merges the result. It is additive too: a card or product that already has
a point for today keeps it. A set whose data/sets/<id>.json has no
`tcgplayerGroup` is looked up among TCGplayer's groups by its name.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import price_history  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
CACHE = ROOT / "scripts" / ".cache" / "prices"

TCGCSV = "https://tcgcsv.com/tcgplayer/3/{path}"
HISTORY_API = "https://infinite-api.tcgplayer.com/price/history/{pid}/detailed?range={span}"
# TCGplayer buckets: month is daily, quarter is every 3 days, annual is weekly.
SPANS = ("month", "quarter", "annual")
# Product-only prints (blister exclusives) and multi-set collections live here.
BLISTER_EXCLUSIVES = 2289
WORKERS = 4
SOURCE = "TCGplayer market price: Near Mint for cards (holofoil, else normal), Unopened for sealed"

BROWSER = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
# TCGplayer's API answers 403 without a browser's origin headers.
TCG_HEADERS = {
    "User-Agent": BROWSER,
    "Origin": "https://www.tcgplayer.com",
    "Referer": "https://www.tcgplayer.com/",
    "Accept": "application/json",
}
CSV_HEADERS = {"User-Agent": "poke-pack.rip price history (github.com/Lynxsiii/poke-pack)"}

# data/sealed.json key -> does a TCGplayer product name describe it?
_NOT_SEALED = re.compile(r"\b(case|display|code card|sleeved|blister|art bundle|half|enhanced)\b", re.I)
SEALED_NAMES = {
    "boosterPack": lambda n: n.endswith("Booster Pack"),
    "boosterBox": lambda n: n.endswith("Booster Box"),
    "eliteTrainerBox": lambda n: "Elite Trainer Box" in n and "Pokemon Center" not in n,
    "pcEliteTrainerBox": lambda n: "Pokemon Center Elite Trainer Box" in n,
    "boosterBundle": lambda n: n.endswith("Booster Bundle"),
    "buildBattleBox": lambda n: bool(re.search(r"Build (&|and) Battle Box", n)),
}
VARIANT_ORDER = ("Holofoil", "Normal", "Unopened")

TODAY = time.strftime("%Y-%m-%d")


# ---------------------------------------------------------------- fetching

def fetch_json(url: str, headers: dict, cache_name: str, refresh: bool):
    cached = CACHE / TODAY / cache_name
    if cached.exists() and not refresh:
        return json.loads(cached.read_text(encoding="utf-8"))
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == 4:
                raise
        time.sleep(2 ** (attempt + 1))
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(raw)
    return json.loads(raw)


def prune_cache() -> None:
    """Downloads are only reused on the day they were made."""
    if not CACHE.exists():
        return
    for day in CACHE.iterdir():
        if day.is_dir() and day.name != TODAY:
            shutil.rmtree(day, ignore_errors=True)


def tcgcsv(path: str, refresh: bool) -> list[dict]:
    name = "tcgcsv-" + path.replace("/", "-") + ".json"
    return fetch_json(TCGCSV.format(path=path), CSV_HEADERS, name, refresh)["results"]


def history(pid: int, span: str, refresh: bool) -> list[dict]:
    url = HISTORY_API.format(pid=pid, span=span)
    return fetch_json(url, TCG_HEADERS, f"history-{pid}-{span}.json", refresh).get("result") or []


# ---------------------------------------------------------------- matching

def plain(text: str) -> str:
    """Compare names without case, accents, punctuation or TCGplayer's suffixes."""
    text = re.sub(r"\s+-\s+[\w/]+$", "", text)  # "Bulbasaur - 001/132"
    text = bare_name(text)  # "(Delta Species)", "[Mega Gardevoir]"
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", text.lower())


def bare_name(name: str) -> str:
    """"Surging Sparks Booster Bundle (LGS)" -> "Surging Sparks Booster Bundle"."""
    return re.sub(r"\s*[\(\[][^\)\]]*[\)\]]", "", name).strip()


def number_key(value: str) -> str:
    """'001/132' -> '1', 'SV001/SV122' -> 'sv1', 'TG05' -> 'tg5', 'cc11g' -> 'cc11g'."""
    head = str(value).split("/")[0].strip().lower()
    m = re.fullmatch(r"([a-z]*)\s*0*(\d+)([a-z]*)", head)
    return f"{m[1]}{m[2]}{m[3]}" if m else head


def number_digits(value: str) -> str:
    m = re.search(r"\d+", str(value).split("/")[0])
    return str(int(m[0])) if m else ""


def product_number(product: dict) -> str:
    for field in product.get("extendedData") or []:
        if field.get("name") == "Number":
            return str(field.get("value") or "")
    return ""


def pick_variant(rows: list[dict], name_key: str) -> dict | None:
    """The row for the card's pack printing: Holofoil, else Normal, reverse last."""
    rows = [r for r in rows if r.get(name_key)]
    for variant in VARIANT_ORDER:
        for row in rows:
            if row[name_key] == variant:
                return row
    rest = sorted(rows, key=lambda r: "reverse" in r[name_key].lower())
    return rest[0] if rest else None


class Catalogue:
    """TCGplayer products and today's prices for the groups a set draws on."""

    def __init__(self, refresh: bool):
        self.refresh = refresh
        self.products: dict[int, list[dict]] = {}
        self.prices: dict[int, dict[int, list[dict]]] = {}
        self._groups: list[dict] | None = None

    def groups(self) -> list[dict]:
        if self._groups is None:
            self._groups = tcgcsv("groups", self.refresh)
        return self._groups

    def load(self, group: int) -> None:
        if group in self.products:
            return
        self.products[group] = tcgcsv(f"{group}/products", self.refresh)
        rows: dict[int, list[dict]] = {}
        for row in tcgcsv(f"{group}/prices", self.refresh):
            rows.setdefault(row["productId"], []).append(row)
        self.prices[group] = rows

    def market(self, pid: int) -> float | None:
        for rows in self.prices.values():
            if pid in rows:
                row = pick_variant(rows[pid], "subTypeName")
                price = row and row.get("marketPrice")
                return round(float(price), 2) if price else None
        return None

    def set_group(self, cfg: dict) -> int:
        if cfg.get("tcgplayerGroup"):
            return int(cfg["tcgplayerGroup"])
        want = plain(cfg["name"])
        for suffix in ("", "baseset"):
            for g in self.groups():
                if plain(g["name"].split(": ", 1)[-1]) == want + suffix:
                    return int(g["groupId"])
        raise RuntimeError(
            f"no TCGplayer group named like {cfg['name']!r}; add \"tcgplayerGroup\" to "
            f"data/sets/{cfg['id']}.json"
        )

    def subsets(self, group: int) -> list[int]:
        """Groups filed as part of this one: "ME: 30th Celebration Classic Collection"."""
        name = next((g["name"] for g in self.groups() if g["groupId"] == group), None)
        if not name:
            return []
        return [int(g["groupId"]) for g in self.groups() if g["name"].startswith(name + " ")]


def match_card(card: dict, products: list[dict]) -> tuple[dict | None, str]:
    """TCGplayer product for a card, by collector number then name."""
    key = number_key(card["number"])
    numbered = [(p, product_number(p)) for p in products if product_number(p)]
    same = [p for p, n in numbered if number_key(n) == key]
    loose = same or [p for p, n in numbered if number_digits(n) == number_digits(card["number"])]
    named = [p for p in loose if plain(p["name"]) == plain(card["name"])]
    if len(named) > 1:
        # Prismatic-style pattern prints share the number; the plain print has no suffix.
        bare = [p for p in named if bare_name(p["name"]) == p["name"]]
        named = bare or named
    if named:
        return named[0], ""
    if len(same) == 1:
        return same[0], f"name differs: ours {card['name']!r}, TCGplayer {same[0]['name']!r}"
    return None, "no product with this number and name"


# ---------------------------------------------------------------- targets

def targets_for(set_id: str, cat: Catalogue) -> tuple[dict, dict, list[str]]:
    """{card id: pid}, {sealed key: pid} and warnings for one set."""
    cfg = json.loads((SETS / f"{set_id}.json").read_text(encoding="utf-8"))
    cards = json.loads((DATA / f"{set_id}.json").read_text(encoding="utf-8"))
    group = cat.set_group(cfg)
    card_groups = [group, *cat.subsets(group)]
    extra = [s.get("tcgplayerGroup") for s in (cfg.get("promoSeries") or {}).values()]
    extra += [p.get("tcgplayerGroup") for p in cfg.get("products") or []]
    for g in [*card_groups, *extra, BLISTER_EXCLUSIVES]:
        if g:
            cat.load(int(g))
    products = [p for g in card_groups for p in cat.products[g]]

    warnings: list[str] = []
    card_pids: dict[str, int] = {}
    for card in cards:
        if card.get("tcgplayerId"):
            card_pids[card["id"]] = int(card["tcgplayerId"])
            continue
        product, note = match_card(card, products)
        if product:
            card_pids[card["id"]] = int(product["productId"])
        if note:
            warnings.append(f"{card['id']} {card['name']}: {note}")

    sealed_pids: dict[str, int] = {}
    listed = json.loads((DATA / "products.json").read_text(encoding="utf-8")).get(set_id) or []
    for item in listed:
        if item.get("tcgplayerId"):
            sealed_pids[item["id"]] = int(item["tcgplayerId"])
    charged = json.loads((DATA / "sealed.json").read_text(encoding="utf-8")).get(set_id) or {}
    own = cat.products[group]
    for key, price in charged.items():
        if key in sealed_pids or key not in SEALED_NAMES:
            continue
        found = [
            p for p in own
            if not product_number(p) and SEALED_NAMES[key](bare_name(p["name"])) and not _NOT_SEALED.search(p["name"])
        ]
        # The shop charges data/sealed.json's price, so the product nearest it is
        # the one it means (a set with two Pokémon Center ETBs, say).
        found.sort(key=lambda p: abs((cat.market(p["productId"]) or 1e9) - price))
        if found:
            sealed_pids[key] = int(found[0]["productId"])
        else:
            warnings.append(f"sealed {key}: no TCGplayer product")
    return card_pids, sealed_pids, warnings


# ---------------------------------------------------------------- history

def series_for(pid: int, refresh: bool) -> list[list]:
    """A year of points for one product, finest buckets where they overlap."""
    points: list[list] = []
    boundary = None
    variant = None
    for span in SPANS:  # month, then quarter, then annual
        results = history(pid, span, refresh)
        if variant is None:
            best = pick_variant(results, "variant")
            variant = best and best["variant"]
        rows = [r for r in results if r.get("variant") == variant]
        row = next((r for r in rows if r.get("condition") in ("Near Mint", "Unopened")), rows[0] if rows else None)
        buckets = (row or {}).get("buckets") or []
        if not buckets:
            continue
        for bucket in buckets:
            day = bucket.get("bucketStartDate")
            price = float(bucket.get("marketPrice") or 0)
            if day and price > 0 and (boundary is None or day < boundary):
                points.append([day, round(price, 2)])
        first = min(b["bucketStartDate"] for b in buckets if b.get("bucketStartDate"))
        boundary = first if boundary is None else min(boundary, first)
    points.sort()
    return points


def merge(old: list, new: list) -> list:
    """Additive: a backfilled point only fills a date the file has no point for."""
    have = {p[0] for p in old}
    return old + [p for p in new if p[0] not in have]


def backfill(set_id: str, cat: Catalogue, daily: bool) -> str:
    card_pids, sealed_pids, warnings = targets_for(set_id, cat)
    store = price_history.load(set_id)
    store["source"] = SOURCE
    jobs = [("cards", k, pid) for k, pid in card_pids.items()] + [("sealed", k, pid) for k, pid in sealed_pids.items()]

    written = {"cards": 0, "sealed": 0}
    if daily:
        for section, key, pid in jobs:
            price = cat.market(pid)
            points = store[section].setdefault(key, [])
            # Additive like the backfill: a date already on file keeps its price.
            if price and not price_history.has_day(points, TODAY):
                points.append([TODAY, price])
                written[section] += 1
    else:
        with ThreadPoolExecutor(WORKERS) as pool:
            results = pool.map(lambda job: series_for(job[2], cat.refresh), jobs)
            for (section, key, pid), points in zip(jobs, results):
                if points:
                    store[section][key] = merge(store[section].get(key, []), points)
                    written[section] += 1
                else:
                    warnings.append(f"{section} {key}: TCGplayer has no price history (product {pid})")

    store["updated"] = TODAY
    price_history.save(store)
    for line in warnings:
        print(f"    {line}")
    cards_total = len(json.loads((DATA / f"{set_id}.json").read_text(encoding="utf-8")))
    return (
        f"{written['cards']}/{cards_total} cards, {written['sealed']}/{len(sealed_pids)} sealed "
        f"{'priced today' if daily else 'backfilled'}"
    )


def all_sets() -> list[str]:
    return sorted(p.stem for p in SETS.glob("*.json") if (DATA / p.name).exists())


def main(argv: list[str]) -> int:
    daily = "--daily" in argv
    refresh = "--refresh" in argv
    wanted = all_sets() if "--all" in argv else [a for a in argv if not a.startswith("-")]
    unknown = [s for s in wanted if s not in all_sets()]
    if not wanted or unknown:
        print(__doc__.split("Usage:")[1].split("`--daily`")[0].rstrip(), file=sys.stderr)
        if unknown:
            print(f"\nno data/<id>.json and data/sets/<id>.json for: {', '.join(unknown)}", file=sys.stderr)
        return 2

    folded = price_history.fold_legacy()
    if folded:
        print(f"folded data/price-history.json into data/prices/ for {', '.join(folded)}")
    prune_cache()
    cat = Catalogue(refresh)
    failed = 0
    for set_id in wanted:
        started = time.time()
        print(f"{set_id}:")
        try:
            summary = backfill(set_id, cat, daily)
        except (RuntimeError, urllib.error.URLError, KeyError, OSError, ValueError) as exc:
            print(f"  FAILED: {exc}")
            failed += 1
            continue
        print(f"  {summary} in {time.time() - started:.0f}s -> {price_history.path_for(set_id).relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
