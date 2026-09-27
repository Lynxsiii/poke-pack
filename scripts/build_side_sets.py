"""Build the Scarlet & Violet side sets: packs that are not expansions.

Trick or Trade BOOster Bundles (tot23, tot24) and McDonald's Happy Meal
promos (mcd23, mcd24) are small sets sold as their own packs, and the
Scarlet & Violet Energies (sve) are the basic Energy printed for the era.
None of them fits build_set.py, so they are declared differently in
data/sets/<id>.json:

    {
      "id": "tot23",
      "tcgplayerGroup": 23266,
      "cards": [
        { "from": "sword-shield/lost-origin/16", "tcgplayerId": 515647 },
        { "from": "sword-shield/lost-origin/17", "tcgplayerId": 515648,
          "holo": true, "foilAs": "Rare" }
      ]
    }

  * `cards` lists the checklist in order; card N is `<id>-N`. A card with
    `from` reprints the pkmn.gg card at <series>/<slug>/<number>: its text
    and rarity come from there, its printed number is the original's, and
    its scan is its own TCGplayer photo, since Trick or Trade's stamped
    prints have no scan host. A card with `number` is read from the set's
    own pkmn.gg checklist (`series` + `slug`), scanned by Scrydex
    (`scrydexId`).
  * `holo` marks the prints that come foil, which is how these packs are
    filled (js/engine.js `holo` and `plain` pools); `foilAs` names the
    rarity whose foil recipe the print borrows, as on promos (foilLook() in
    js/app.js).
  * `tcgl` names a TCG Live print ("svalt/sv3_en_136_alt") whose foil map
    is the same print's: it ships as assets/foil/maps/<id>/<n>.webp.
  * `variant` and `like` add a second printing of a card already on the
    checklist (an Energy's Cosmos Holo), with its own scan and price.

Every card is priced at its TCGplayer market price (the Holofoil listing
for a holo print, Normal otherwise) and carries its `tcgplayerId`; scans are
mirrored to assets/cards/<id>/ at the site's two sizes.

Usage:
    python3 scripts/build_side_sets.py tot23 tot24 mcd23 mcd24 sve
    python3 scripts/build_side_sets.py --all
    python3 scripts/build_side_sets.py --prices-only --all
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_set import card_record, fetch, merge, ordered, page_data  # noqa: E402
from mirror_images import encode  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
CACHE = ROOT / "scripts" / ".cache" / "side-sets"
sys.path.insert(0, str(ROOT / ".claude" / "skills" / "card-textures" / "scripts"))
from fetch_foil_maps import alpha_mask  # noqa: E402

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip side set builder"
TCGCSV = "https://tcgcsv.com/tcgplayer/3/{group}/{what}"
TCG_IMAGE = "https://tcgplayer-cdn.tcgplayer.com/product/{id}_in_1000x1000.jpg"
TCGL_PNG = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{path}.foil.png"
PKMN = "https://www.pkmn.gg/series/{path}"


def get(url: str, cache_name: str | None = None, refresh: bool = False) -> bytes:
    if cache_name:
        CACHE.mkdir(parents=True, exist_ok=True)
        cached = CACHE / cache_name
        if cached.exists() and not refresh:
            return cached.read_bytes()
    for attempt in range(3):
        try:
            if "malie.io" in url:
                # This CDN refuses Python's client; curl is accepted.
                raw = subprocess.run(["curl", "-sfL", url], capture_output=True, check=True).stdout
            else:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read()
            if cache_name:
                (CACHE / cache_name).write_bytes(raw)
            time.sleep(0.2)
            return raw
        except (OSError, subprocess.CalledProcessError):
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    return b""


def tcg_prices(group: int) -> dict[int, dict[str, float]]:
    """TCGplayer product id -> {printing: market price}, fetched fresh."""
    rows = json.loads(get(TCGCSV.format(group=group, what="prices")))["results"]
    out: dict[int, dict[str, float]] = {}
    for row in rows:
        price = row.get("marketPrice") or row.get("midPrice")
        if price:
            out.setdefault(row["productId"], {})[row["subTypeName"]] = round(float(price), 2)
    return out


def market(prices: dict[str, float], holo: bool) -> float | None:
    order = ("Holofoil", "Reverse Holofoil", "Normal") if holo else ("Normal", "Holofoil")
    return next((prices[k] for k in order if prices.get(k)), None)


def pkmn_detail(path: str, refresh: bool) -> dict:
    """One card's pkmn.gg record, from "<series>/<slug>/<number>"."""
    return page_data(fetch(PKMN.format(path=path), "side-" + path.replace("/", "-"), refresh))


def reprint(cfg: dict, n: int, spec: dict, refresh: bool) -> tuple[dict, str]:
    series, slug, number = spec["from"].split("/")
    detail = pkmn_detail(spec["from"], refresh)
    record = card_record({"id": cfg["id"]}, detail)
    listing = page_data(fetch(PKMN.format(path=f"{series}/{slug}"), f"list-{slug}", refresh))
    total = next((str(row.get("printedTotal") or "") for row in listing if row.get("printedTotal")), "")
    printed = spec.get("printedNumber") or f"{int(number):03d}/{total or cfg.get('reprintTotals', {}).get(slug, '')}".rstrip("/")
    record.update(id=f"{cfg['id']}-{n}", number=str(n), printedNumber=printed)
    return record, TCG_IMAGE.format(id=spec["tcgplayerId"])


def own_card(cfg: dict, spec: dict, refresh: bool) -> tuple[dict, str]:
    number = spec["number"]
    detail = pkmn_detail(f"{cfg['series']}/{cfg['slug']}/{number}", refresh)
    scrydex = cfg.get("scrydexId", cfg["id"])
    record = card_record({"id": cfg["id"], "scrydexId": scrydex}, detail)
    n = int(number)
    record.update(id=f"{cfg['id']}-{n}", number=str(n))
    if cfg.get("printedTotal"):
        record["printedNumber"] = f"{n:03d}/{int(cfg['printedTotal']):03d}"
    return record, f"https://images.scrydex.com/pokemon/{scrydex}-{n}/large"


def ship_foil_map(set_id: str, stem: str, tcgl: str, refresh: bool) -> str:
    raw = get(TCGL_PNG.format(path=tcgl), f"tcgl-{tcgl.replace('/', '-')}.foil.png", refresh)
    src = CACHE / f"tcgl-{tcgl.replace('/', '-')}.foil.png"
    if not src.exists():
        src.write_bytes(raw)
    out = ROOT / "assets" / "foil" / "maps" / set_id
    out.mkdir(parents=True, exist_ok=True)
    alpha_mask(src).save(out / f"{stem}.webp", "WEBP", quality=85, alpha_quality=80, method=6)
    return f"assets/foil/maps/{set_id}/{stem}.webp"


def mirror(set_id: str, record: dict, remote: str, refresh: bool) -> None:
    stem = record["number"]
    local = f"assets/cards/{set_id}/{stem}.webp"
    if refresh or not (ROOT / local).exists():
        raw = get(remote)
        encode(raw, ROOT / "assets" / "cards" / set_id, stem, force=True)
    record["image"] = local
    record["imageSmall"] = f"assets/cards/{set_id}/{stem}-sm.webp"
    record["imageRemote"] = remote


# Card fields this script owns; anything else on a card (a hand-set field)
# survives a rebuild through merge().
SIDE_FIELDS = ("printedNumber", "holo", "foilAs", "variant", "energy", "tcgplayerId", "foilMap")


def build(set_id: str, prices_only: bool, refresh: bool) -> int:
    cfg = json.loads((SETS / f"{set_id}.json").read_text(encoding="utf-8"))
    path = DATA / f"{set_id}.json"
    prior = {c["id"]: c for c in json.loads(path.read_text(encoding="utf-8"))} if path.exists() else {}
    groups = [cfg["tcgplayerGroup"], *cfg.get("extraGroups", [])]
    prices: dict[int, dict[str, float]] = {}
    for group in groups:
        prices.update(tcg_prices(group))

    cards: list[dict] = []
    for index, spec in enumerate(cfg["cards"], start=1):
        stem = spec.get("stem") or str(index)
        card_id = f"{set_id}-{stem}"
        if prices_only and card_id in prior:
            record, remote = dict(prior[card_id]), None
        elif spec.get("like"):
            base = next(c for c in cards if c["id"] == f"{set_id}-{spec['like']}")
            record = {k: v for k, v in base.items() if k not in ("image", "imageSmall", "imageRemote", "market", "foilMap", "tcgplayerId")}
            record.update(id=card_id, number=stem)
            remote = spec.get("image") or TCG_IMAGE.format(id=spec["tcgplayerId"])
        elif spec.get("from"):
            record, remote = reprint(cfg, index, spec, refresh)
        else:
            record, remote = own_card(cfg, spec, refresh)
        if cfg.get("rarity"):
            record["rarity"] = cfg["rarity"]
        if spec.get("rarity"):
            record["rarity"] = spec["rarity"]
        for key in SIDE_FIELDS:
            if key in spec and key != "foilMap":
                record[key] = spec[key]
        if spec.get("tcgl") and not (prices_only and record.get("foilMap")):
            record["foilMap"] = ship_foil_map(set_id, stem, spec["tcgl"], refresh)
        if remote:
            record = merge(prior.get(card_id), record) if card_id in prior else record
            for key in SIDE_FIELDS:
                if key not in spec and key != "foilMap" and key in record and key not in ("printedNumber", "energy"):
                    record.pop(key)
            mirror(set_id, record, remote, refresh)
        pid = spec.get("tcgplayerId")
        value = market(prices.get(pid, {}), bool(spec.get("holo"))) if pid else None
        if value:
            record["market"] = value
        cards.append(ordered(record))

    path.write_text(json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    priced = sum(1 for c in cards if c.get("market"))
    unpriced = [c["id"] for c in cards if not c.get("market")]
    note = f"; no market price: {', '.join(unpriced)}" if unpriced else ""
    print(f"  wrote data/{set_id}.json: {len(cards)} cards, {priced} priced{note}")
    return 0


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    prices_only = "--prices-only" in argv
    wanted = [a for a in argv if not a.startswith("-")]
    if "--all" in argv:
        wanted = sorted(
            p.stem for p in SETS.glob("*.json")
            if json.loads(p.read_text(encoding="utf-8")).get("side")
        )
    if not wanted:
        print("give a set id, or --all", file=sys.stderr)
        return 2
    failed = 0
    for set_id in wanted:
        print(f"{set_id}:")
        try:
            failed += build(set_id, prices_only, refresh)
        except (RuntimeError, OSError, KeyError, StopIteration, subprocess.CalledProcessError) as exc:
            print(f"  FAILED: {exc!r}")
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
