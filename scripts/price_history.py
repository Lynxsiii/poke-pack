"""Read and write the per-set price history files, data/prices/<set>.json.

Each file holds one set's market price history, oldest point first:

    {"set": "me1", "updated": "2026-09-27", "source": "...",
     "cards": {"me1-1": [["2025-09-29", 0.14], ...], ...},
     "sealed": {"boosterPack": [["2025-09-29", 5.12], ...], ...}}

`cards` is keyed by card id, `sealed` by the id the shop uses for the product
(a data/sealed.json key such as boosterPack, or a data/products.json id). The
page loads a set's file only when someone opens one of its cards, so the whole
catalogue's history never has to be downloaded at once.

scripts/backfill_prices.py fills a year of history from TCGplayer and records
the daily point; fetch_prices.py and build_products.py record today's price
through record() as well.

Every write is additive: a date that already has a point keeps it, and no point
is ever dropped for its age. The files grow by one point per series per day.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HISTORY_DIR = DATA / "prices"
# The single file every set shared before history was split per set.
LEGACY = DATA / "price-history.json"
SECTIONS = ("cards", "sealed")


def set_of(card_id: str) -> str:
    """Set ids never contain a dash, so a card id's set is everything before one."""
    return card_id.split("-", 1)[0]


def path_for(set_id: str) -> Path:
    return HISTORY_DIR / f"{set_id}.json"


def load(set_id: str) -> dict:
    path = path_for(set_id)
    store = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    store["set"] = set_id
    for section in SECTIONS:
        if not isinstance(store.get(section), dict):
            store[section] = {}
    return store


def tidy(points: list) -> list:
    """Sort by date with one point per date. The first point for a date wins, so
    a price already on file is never replaced by a later write."""
    by_day: dict[str, float] = {}
    for day, price in points:
        if isinstance(price, (int, float)) and price > 0 and day not in by_day:
            by_day[day] = round(float(price), 2)
    return [[d, by_day[d]] for d in sorted(by_day)]


def has_day(points: list, day: str) -> bool:
    return any(p[0] == day for p in points)


def save(store: dict) -> Path:
    """Write one entry per line, so a refresh diffs as the series it touched."""
    set_id = store["set"]
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    head = {k: v for k, v in store.items() if k not in SECTIONS}
    lines = ["{" + json.dumps(head, ensure_ascii=False, separators=(",", ":"))[1:-1] + ","]
    for i, section in enumerate(SECTIONS):
        series = {k: tidy(v) for k, v in store[section].items()}
        series = {k: v for k, v in series.items() if v}
        lines.append(f'"{section}":{{')
        rows = [
            f"{json.dumps(key, ensure_ascii=False)}:{json.dumps(points, separators=(',', ':'))}"
            for key, points in sorted(series.items(), key=lambda kv: _sort_key(kv[0]))
        ]
        lines.append(",\n".join(rows))
        lines.append("}" + ("," if i < len(SECTIONS) - 1 else ""))
    lines.append("}")
    path = path_for(set_id)
    path.write_text("\n".join(line for line in lines if line) + "\n", encoding="utf-8")
    return path


def _sort_key(key: str):
    """me1-2 before me1-10, and promo numbers after the set's own."""
    tail = key.split("-", 1)[-1]
    digits = "".join(ch for ch in tail if ch.isdigit())
    return (not tail[:1].isdigit(), int(digits) if digits else 0, key)


def record(set_id: str, section: str, prices: dict[str, float], day: str | None = None) -> int:
    """Add `day`'s point (today by default) for each key that has none yet.

    A key that already has a point for that day keeps it: the first price
    recorded for a date stands."""
    if not prices:
        return 0
    day = day or time.strftime("%Y-%m-%d")
    store = load(set_id)
    series = store[section]
    written = 0
    for key, price in prices.items():
        if not isinstance(price, (int, float)) or price <= 0:
            continue
        points = series.setdefault(key, [])
        if has_day(points, day):
            continue
        points.append([day, round(float(price), 2)])
        written += 1
    store["updated"] = max(store.get("updated") or day, day)
    save(store)
    return written


def fold_legacy() -> list[str]:
    """Move data/price-history.json's points into the per-set files, then delete it.

    A branch started before the split can still write the old file; running any
    of the price scripts after merging it folds those points in.
    """
    if not LEGACY.exists():
        return []
    old = json.loads(LEGACY.read_text(encoding="utf-8")).get("cards") or {}
    by_set: dict[str, dict[str, list]] = {}
    for card_id, points in old.items():
        by_set.setdefault(set_of(card_id), {})[card_id] = points
    for set_id, cards in by_set.items():
        store = load(set_id)
        for card_id, points in cards.items():
            # Points already in the per-set file win over the old snapshots.
            have = {p[0] for p in store["cards"].get(card_id, [])}
            extra = [p for p in points if p[0] not in have]
            store["cards"][card_id] = tidy(store["cards"].get(card_id, []) + extra)
        save(store)
    LEGACY.unlink()
    return sorted(by_set)
