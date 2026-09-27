"""Build the promo products a set can be opened as, and the promo cards in them.

Collection boxes, tins, premium collections, Elite Trainer Boxes and battle
decks each come with one or more promo cards that no booster pack carries.
A set lists the ones worth opening in data/sets/<id>.json:

    "products": [
      { "id": "upc-day", "name": "Ultra-Premium Collection: Day",
        "kind": "premium", "tcgplayerId": 704190, "packs": 29,
        "special": { "classic": 1 }, "promos": ["mep107", "mep108"] }
    ],
    "promoCards": {
      "mep107": { "foilAs": "Futuristic Rare" },
      "mep101-pc": { "like": "mep101", "variant": "Pokémon Center stamp",
                     "tcgplayerId": 713261 }
    },
    "promoSeries": { "mep": { "series": "mega-evolution",
                              "slug": "me-black-star-promos", "scrydex": "mep",
                              "tcgplayerGroup": 24451, "printed": "MEP" } }

`packs` counts the set's own booster packs; `special` names extra packs from
the set's `specialPacks` in js/catalog.js (the Ultra-Premium Collections'
Classic Collection pack). `pick` is how many of `promos` one box holds when it
is not all of them (a Build & Battle Box holds one of four at random), and
`tcgplayerGroup` names the TCGplayer group of a product filed outside the
set's own (Miscellaneous Cards & Products, 2374). A product whose id matches one of SEALED_PRODUCTS
(eliteTrainerBox) only adds its promos to that product.

This script then:

  * writes each promo card into data/<id>.json as `<id>-<number>` with
    `rarity: "Promo"`, `promo: true`, the printed number and `foilAs`, the
    rarity whose foil recipe it borrows. A number with a promoSeries prefix
    (mep094) is read from pkmn.gg's promo pages; one with `like` copies an
    existing card and swaps in its own scan (a stamped or product-only print).
    `foilAs` comes from Pokémon TCG Live's foil type when the export has the
    card, else from the config.
  * mirrors each promo scan to assets/cards/<id>/ at the site's two sizes.
  * prices every product from TCGplayer's market price (tcgcsv.com mirrors
    TCGplayer's catalogue as JSON) and every promo card from pkmn.gg, as
    fetch_prices.py does the singles, and logs the card prices into
    data/price-history.json.
  * cuts each product photo out of its white background into
    assets/products/<id>/<product>.webp.
  * writes data/products.json, which the shop and the Worker read.

Usage:
    python3 scripts/build_products.py me55
    python3 scripts/build_products.py --all
    python3 scripts/build_products.py --prices-only --all   # daily refresh
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_set import card_record, merge, ordered  # noqa: E402
from mirror_images import encode  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
OUT = DATA / "products.json"
HISTORY = DATA / "price-history.json"
PRODUCT_DIR = ROOT / "assets" / "products"
CACHE = ROOT / "scripts" / ".cache" / "products"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip product builder"
TCGCSV = "https://tcgcsv.com/tcgplayer/3/{group}/{what}"
TCG_IMAGE = "https://tcgplayer-cdn.tcgplayer.com/product/{id}_in_1000x1000.jpg"
TCGL = "https://cdn.malie.io/file/malie-io/tcgl/export/{path}"
TCGL_INDEX = "https://cdn.malie.io/file/malie-io/tcgl/export/index.json"
# TCG Live's key for each promo series prefix.
TCGL_KEYS = {"mep": "mebsp", "svp": "svbsp"}
PRODUCT_WIDTH = 560
BLISTER_EXCLUSIVES = 2289
HISTORY_LIMIT = 400
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)


def fetch(url: str, cache_name: str | None = None, refresh: bool = False) -> bytes:
    if cache_name:
        CACHE.mkdir(parents=True, exist_ok=True)
        cached = CACHE / cache_name
        if cached.exists() and not refresh:
            return cached.read_bytes()
    for attempt in range(3):
        try:
            if "malie.io" in url:
                # This CDN refuses Python's client; curl is accepted.
                res = subprocess.run(["curl", "-sfL", url], capture_output=True, check=True)
                raw = res.stdout
            else:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read()
            if cache_name:
                (CACHE / cache_name).write_bytes(raw)
            time.sleep(0.2)
            return raw
        except (urllib.error.URLError, TimeoutError, OSError, subprocess.CalledProcessError):
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    return b""


def page_data(raw: bytes):
    match = NEXT_DATA.search(raw.decode("utf-8", "replace"))
    if not match:
        raise RuntimeError("no __NEXT_DATA__ on pkmn.gg page; its shape changed")
    return json.loads(match.group(1))["props"]["pageProps"]["cardData"]


def tcg_prices(group: int, refresh: bool) -> dict[int, float]:
    """TCGplayer product id -> market price (or mid, for a presale with no sales yet)."""
    raw = fetch(TCGCSV.format(group=group, what="prices"), f"tcg-{group}-prices.json", refresh)
    out: dict[int, float] = {}
    for row in json.loads(raw)["results"]:
        price = row.get("marketPrice") or row.get("midPrice")
        if price and row["productId"] not in out:
            out[row["productId"]] = round(float(price), 2)
    return out


def tcg_products(group: int, refresh: bool) -> dict[int, dict]:
    raw = fetch(TCGCSV.format(group=group, what="products"), f"tcg-{group}-products.json", refresh)
    return {row["productId"]: row for row in json.loads(raw)["results"]}


_tcgl: dict[str, dict[int, dict]] = {}


def tcgl_card(key: str, number: int) -> dict | None:
    """A card's record in Pokémon TCG Live's export, if the export has it yet."""
    if key not in _tcgl:
        index = json.loads(fetch(TCGL_INDEX, "tcgl-index.json"))
        entry = index.get("en-US", {}).get(key)
        _tcgl[key] = {}
        if entry:
            cards = json.loads(fetch(TCGL.format(path=entry["path"]), f"tcgl-{key}.json"))
            _tcgl[key] = {c["collector_number"]["numeric"]: c for c in cards}
    return _tcgl[key].get(number)


def foil_from_tcgl(card: dict) -> str:
    """The site rarity whose foil recipe matches TCG Live's print type."""
    foil = card.get("foil") or {}
    kind, long_id = foil.get("type", ""), card.get("ext", {}).get("tcgl", {}).get("longFormID", "")
    if kind == "COSMOS":
        return "Cosmos"
    if kind == "SV_HOLO":
        return "Rare"
    if kind == "SUN_PILLAR":
        return "Double Rare" if "DoubleRare" in long_id else "Illustration Rare"
    if kind == "SV_ULTRA":
        if "SpecialIllustration" in long_id:
            return "Special Illustration Rare"
        return "Ultra Rare" if "UltraRare" in long_id else "Double Rare"
    return ""


def split_number(number: str, series: dict) -> tuple[str, int] | None:
    match = re.fullmatch(r"([a-z]+)(\d+)", number)
    if match and match.group(1) in series:
        return match.group(1), int(match.group(2))
    return None


def convex_hull(points: np.ndarray) -> list[tuple[float, float]]:
    """Andrew's monotone chain over (x, y) points."""
    pts = sorted(set(map(tuple, points.tolist())))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for pt in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], pt) <= 0:
            lower.pop()
        lower.append(pt)
    for pt in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], pt) <= 0:
            upper.pop()
        upper.append(pt)
    return lower[:-1] + upper[:-1]


def cut_out(raw: bytes) -> Image.Image:
    """A product photo on white, as RGBA with the background removed.

    Flood-fills the white in from the edges, then keeps the convex hull of
    what is left: boxes, tins and blisters are convex, and the hull stops the
    fill from eating white box art that happens to touch the photo's edge.
    The hull is drawn at 4x and scaled down so its edge is antialiased.
    """
    img = Image.open(BytesIO(raw)).convert("RGB")
    marked = img.copy()
    w, h = img.size
    sentinel = (255, 0, 254)
    seeds = [(x, y) for x in range(0, w, 8) for y in (0, h - 1)] + [
        (x, y) for y in range(0, h, 8) for x in (0, w - 1)
    ]
    for seed in seeds:
        r, g, b = marked.getpixel(seed)
        if min(r, g, b) >= 235 and (r, g, b) != sentinel:
            ImageDraw.floodfill(marked, seed, sentinel, thresh=24)
    a = np.asarray(marked)
    fg = ~((a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 254))
    # Specks of dust or JPEG noise out in the white would stretch the hull.
    fg = np.asarray(Image.fromarray(fg.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))) > 0
    ys, xs = np.nonzero(fg)
    if not len(xs):
        return img.convert("RGBA")
    edge = []
    for y in np.unique(ys):
        row = xs[ys == y]
        edge += [(row.min(), y), (row.max() + 1, y)]
    edge_pts = np.array(edge)
    hull = convex_hull(np.vstack([edge_pts, edge_pts + [0, 1]]))
    scale = 4
    big = Image.new("L", (w * scale, h * scale), 0)
    ImageDraw.Draw(big).polygon([(x * scale, y * scale) for x, y in hull], fill=255)
    alpha = big.resize((w, h), Image.LANCZOS)
    out = img.convert("RGBA")
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    return out.crop(box) if box else out


def save_product_image(set_id: str, product: dict, refresh: bool) -> str | None:
    rel = f"assets/products/{set_id}/{product['id']}.webp"
    dest = ROOT / rel
    if dest.exists() and not refresh:
        return rel
    try:
        raw = fetch(TCG_IMAGE.format(id=product["tcgplayerId"]))
    except (urllib.error.URLError, OSError) as exc:
        print(f"    {product['id']}: no photo ({exc})")
        return None
    img = cut_out(raw)
    if img.width > PRODUCT_WIDTH:
        img = img.resize((PRODUCT_WIDTH, round(img.height * PRODUCT_WIDTH / img.width)), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=80, method=6, exact=True)
    return rel


def promo_record(cfg: dict, number: str, spec: dict, cards: dict[str, dict], refresh: bool) -> tuple[dict, float | None, str]:
    """The card record for one promo, its market price, and where its scan comes from."""
    set_id = cfg["id"]
    series = cfg.get("promoSeries", {})
    card_id = f"{set_id}-{number}"
    prior = cards.get(card_id)
    price = None
    remote = ""

    if spec.get("like"):
        base = cards.get(f"{set_id}-{spec['like']}")
        if not base:
            raise RuntimeError(f"{number}: like {spec['like']} is not in data/{set_id}.json yet")
        keep = {k: v for k, v in base.items() if k not in (
            "image", "imageSmall", "imageRemote", "market", "foilMap", "etchMap",
            "etchMapH", "etchMapV", "stampPos", "stampSize", "variant", "tcgplayerId")}
        record = {**keep, "id": card_id, "number": number}
        if "printedNumber" not in record:
            record["printedNumber"] = f"{base['number']}/{cfg.get('printedTotal', '')}".rstrip("/")
        remote = TCG_IMAGE.format(id=spec["tcgplayerId"])
    else:
        parts = split_number(number, series)
        if not parts:
            raise RuntimeError(f"{number}: no promoSeries prefix and no `like`")
        prefix, n = parts
        ser = series[prefix]
        base_url = f"https://www.pkmn.gg/series/{ser['series']}/{ser['slug']}"
        detail = page_data(fetch(f"{base_url}/{n}", f"pkmngg-{prefix}-{n}.html", refresh))
        record = card_record({"id": set_id, "scrydexId": ser["scrydex"]}, detail)
        record["id"], record["number"] = card_id, number
        record["printedNumber"] = f"{ser['printed']} {n:03d}"
        record["image"] = f"https://images.scrydex.com/pokemon/{ser['scrydex']}-{n}/large"
        record["imageSmall"] = f"https://images.scrydex.com/pokemon/{ser['scrydex']}-{n}/small"
        remote = record["image"]
        if isinstance(detail.get("sortPrice"), (int, float)) and detail["sortPrice"] > 0:
            price = round(float(detail["sortPrice"]), 2)
        # Kept so a promo pkmn.gg has no price for yet is priced from TCGplayer.
        listing = next((v.get("tcgPlayerId") for v in detail.get("variations") or [] if v.get("tcgPlayerId")), None)
        if listing and str(listing).isdigit():
            record["tcgplayerId"] = int(listing)
        live = tcgl_card(TCGL_KEYS.get(prefix, ""), n)
        if live and not spec.get("foilAs"):
            record["foilAs"] = foil_from_tcgl(live)

    # pkmn.gg pads some names ("Alakazam  ").
    record["name"] = str(record.get("name", "")).strip()
    record["rarity"] = "Promo"
    record["promo"] = True
    for key in ("foilAs", "variant", "tcgplayerId", "printedNumber"):
        if spec.get(key):
            record[key] = spec[key]
    record = merge(prior, record) if prior else record
    # A rebuild must not keep a mirrored path that points at another card's scan.
    if not prior:
        record["imageRemote"] = remote
    return ordered(record), price, remote


def mirror(set_id: str, record: dict, remote: str, refresh: bool) -> None:
    stem = record["number"]
    local = f"assets/cards/{set_id}/{stem}.webp"
    if (ROOT / local).exists() and not refresh and record.get("image") == local:
        return
    raw = fetch(remote)
    encode(raw, ROOT / "assets" / "cards" / set_id, stem, force=True)
    record["image"] = local
    record["imageSmall"] = f"assets/cards/{set_id}/{stem}-sm.webp"
    record["imageRemote"] = remote


def log_history(prices: dict[str, float], today: str) -> None:
    if not prices:
        return
    store = json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else {}
    series = store.setdefault("cards", {})
    for card_id, price in prices.items():
        points = series.setdefault(card_id, [])
        if points and points[-1][0] == today:
            points[-1] = [today, price]
        else:
            points.append([today, price])
        del points[:-HISTORY_LIMIT]
    store["updated"] = today
    HISTORY.write_text(json.dumps(store, separators=(",", ":")) + "\n", encoding="utf-8")


def build(set_id: str, prices_only: bool, refresh: bool) -> list[dict]:
    cfg = json.loads((SETS / f"{set_id}.json").read_text(encoding="utf-8"))
    products = cfg.get("products") or []
    if not products:
        return []
    data_path = DATA / f"{set_id}.json"
    records = json.loads(data_path.read_text(encoding="utf-8"))
    cards = {c["id"]: c for c in records}
    today = time.strftime("%Y-%m-%d")

    # Products TCGplayer has no price for are left out, and so are promos that
    # only they carry: a card no product sells can't be pulled.
    market_by: dict[int, dict[int, float]] = {}
    meta_by: dict[int, dict[int, dict]] = {}

    def product_market(product: dict) -> tuple[float | None, dict]:
        group = product.get("tcgplayerGroup") or cfg["tcgplayerGroup"]
        if group not in market_by:
            market_by[group] = tcg_prices(group, refresh=True)
            meta_by[group] = tcg_products(group, refresh)
        pid = product["tcgplayerId"]
        return market_by[group].get(pid), meta_by[group].get(pid) or {}

    sold = {n for product in products if product_market(product)[0] is not None for n in product.get("promos") or []}
    unsold = [n for n in (cfg.get("promoCards") or {}) if n not in sold]
    if unsold:
        print(f"  promos with no priced product, left out: {', '.join(unsold)}")

    # Promo cards: build or refresh each, keeping them after the set's own cards.
    card_prices: dict[str, float] = {}
    listings: dict[str, dict[str, float]] = {}
    groups = [cfg.get("tcgplayerGroup"), *(s.get("tcgplayerGroup") for s in cfg.get("promoSeries", {}).values())]
    # Product-only prints (blister exclusives) are filed in a group of their own.
    groups = [g for g in groups if g] + [BLISTER_EXCLUSIVES]
    tcg_market: dict[int, dict[int, float]] = {}

    def tcg_price(pid: int) -> float | None:
        for g in groups:
            if g not in tcg_market:
                tcg_market[g] = tcg_prices(g, refresh=True)
            if pid in tcg_market[g]:
                return tcg_market[g][pid]
        return None

    def listed_price(prefix: str, n: int) -> float | None:
        if prefix not in listings:
            ser = cfg["promoSeries"][prefix]
            rows = page_data(fetch(f"https://www.pkmn.gg/series/{ser['series']}/{ser['slug']}"))
            listings[prefix] = {
                str(r.get("number")): round(float(r["sortPrice"]), 2)
                for r in rows if isinstance(r.get("sortPrice"), (int, float)) and r["sortPrice"] > 0
            }
        return listings[prefix].get(str(n))

    for number, spec in (cfg.get("promoCards") or {}).items():
        if number not in sold:
            continue
        card_id = f"{set_id}-{number}"
        if prices_only and card_id in cards:
            record, price = dict(cards[card_id]), None
            parts = split_number(number, cfg.get("promoSeries", {}))
            if parts and not spec.get("like"):
                price = listed_price(*parts)
        else:
            record, price, remote = promo_record(cfg, number, spec, cards, refresh)
            if refresh or not str(record.get("image", "")).startswith("assets/"):
                mirror(set_id, record, remote, refresh)
        # A stamped or product-only print is priced from its own TCGplayer
        # listing, and so is a promo pkmn.gg has no price for.
        listing = spec.get("tcgplayerId") or record.get("tcgplayerId")
        if listing and (spec.get("like") or not price):
            price = tcg_price(listing) or price
        if price is not None:
            record["market"] = price
            card_prices[card_id] = price
        cards[card_id] = record

    promo_ids = {f"{set_id}-{n}" for n in (cfg.get("promoCards") or {}) if n in sold}
    ordered_records = [cards[c["id"]] for c in records if c["id"] not in promo_ids and not c.get("promo")]
    ordered_records += [cards[i] for i in sorted(promo_ids, key=lambda i: cards[i]["number"])]
    data_path.write_text(json.dumps(ordered_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log_history(card_prices, today)
    print(f"  promo cards: {len(promo_ids)} ({len(card_prices)} priced)")

    # Products: price, photo, contents. Collections sold across sets are filed
    # in another TCGplayer group (Miscellaneous Cards & Products), named per product.
    out = []
    for product in products:
        pid = product["tcgplayerId"]
        price, info = product_market(product)
        if price is None:
            print(f"    {product['id']}: no TCGplayer price, left out")
            continue
        promos = [f"{set_id}-{n}" for n in product.get("promos") or []]
        missing = [p for p in promos if p not in cards]
        if missing:
            raise RuntimeError(f"{product['id']}: promo card(s) {missing} not built")
        released = (info.get("presaleInfo") or {}).get("releasedOn") or ""
        entry = {
            "id": product["id"],
            "name": product["name"],
            "kind": product.get("kind", "collection"),
            "packs": int(product.get("packs", 0)),
            **({"special": product["special"]} if product.get("special") else {}),
            "promos": promos,
            **({"pick": int(product["pick"])} if product.get("pick") else {}),
            "price": price,
            "tcgplayerId": pid,
            **({"released": released[:10]} if released else {}),
        }
        if not prices_only or not (ROOT / f"assets/products/{set_id}/{product['id']}.webp").exists():
            image = save_product_image(set_id, product, refresh)
        else:
            image = f"assets/products/{set_id}/{product['id']}.webp"
        if image:
            entry["image"] = image
        out.append(entry)
        print(f"    {product['id']:<16} ${price:>8.2f}  {entry['packs']:>2} packs  {', '.join(product.get('promos') or [])}")
    return out


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    prices_only = "--prices-only" in argv
    wanted = [a for a in argv if not a.startswith("-")]
    if "--all" in argv:
        wanted = sorted(p.stem for p in SETS.glob("*.json"))
    if not wanted:
        print("give a set id, or --all", file=sys.stderr)
        return 2
    store = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    failed = 0
    for set_id in wanted:
        print(f"{set_id}:")
        try:
            built = build(set_id, prices_only, refresh)
        except (RuntimeError, urllib.error.URLError, KeyError, OSError) as exc:
            print(f"  FAILED: {exc}")
            failed += 1
            continue
        if built:
            store[set_id] = built
        elif set_id in store:
            del store[set_id]
    store["_fetchedAt"] = time.strftime("%Y-%m-%d")
    store = {"_fetchedAt": store.pop("_fetchedAt"), **dict(sorted(store.items()))}
    OUT.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
