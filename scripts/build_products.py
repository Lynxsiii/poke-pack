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
is not all of them (a Build & Battle Box holds one of four at random;
`groupOf` 3 makes that one of the runs of three in `promos`, one region's
starters in a First Partner Illustration Collection), and
`tcgplayerGroup` names the TCGplayer group of a product filed outside the
set's own (Miscellaneous Cards & Products, 2374). A product whose id matches one of SEALED_PRODUCTS
(eliteTrainerBox) only adds its promos to that product. `gift: true` marks a
store's gift-with-purchase promo (GameStop and EB Games stamps): no box holds
it, so it is sold with the product it came free with, at both market prices.

A promo set with no boosters of its own (svp, the SV Black Star Promos)
names the sets its products' packs come from instead of `packs`:

    { "id": "charizard-ex-premium", "kind": "premium", "tcgplayerId": 516576,
      "from": { "sv3": 3, "sv2": 3 }, "promos": ["svp056"],
      "note": "The real box held 6 assorted Scarlet & Violet packs." }

and sells a promo handed out on its own (a tournament reward, a museum
giveaway) as `"kind": "event"`: the card alone, priced from its own listing
in the promo group (`tcgplayerGroup` 22872), with no box photo.

This script then:

  * writes each promo card into data/<id>.json as `<id>-<number>` with
    `rarity: "Promo"`, `promo: true`, the printed number and `foilAs`, the
    rarity whose foil recipe it borrows. A number with a promoSeries prefix
    (mep094) is read from pkmn.gg's promo pages; one with `like` copies an
    existing card and swaps in its own scan (a stamped or product-only print).
    `like: "me2:17"` copies a card of another set, for a product that ships
    another set's card (Chaos Rising's checklane blisters carry Phantasmal
    Flames cosmos holos). `tcgl` names the print in Pokémon TCG Live's alt
    exports (`svalt/zsv10-5_en_012_alt2`): its render becomes the scan, its
    foil map ships to assets/foil/maps/<id>/, and its foil type sets `foilAs`.
    `foilAs` comes from Pokémon TCG Live's foil type when the export has the
    card, else from the config.
  * mirrors each promo scan to assets/cards/<id>/ at the site's two sizes.
  * prices every product from TCGplayer's market price (tcgcsv.com mirrors
    TCGplayer's catalogue as JSON) and every promo card from pkmn.gg, as
    fetch_prices.py does the singles, and adds today's card and product prices
    to the charts in data/prices/<id>.json. Run backfill_prices.py <id> once
    to fill in the year before.
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
import price_history  # noqa: E402
from build_set import card_record, merge, ordered  # noqa: E402
from mirror_images import replace_scan  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
OUT = DATA / "products.json"
PRODUCT_DIR = ROOT / "assets" / "products"
CACHE = ROOT / "scripts" / ".cache" / "products"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip product builder"
TCGCSV = "https://tcgcsv.com/tcgplayer/3/{group}/{what}"
TCG_IMAGE = "https://tcgplayer-cdn.tcgplayer.com/product/{id}_in_1000x1000.jpg"
TCGL = "https://cdn.malie.io/file/malie-io/tcgl/export/{path}"
TCGL_INDEX = "https://cdn.malie.io/file/malie-io/tcgl/export/index.json"
TCGL_PRINT = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{path}{kind}.png"
# TCG Live's key for each promo series prefix.
TCGL_KEYS = {"mep": "mebsp", "svp": "svbsp"}
PRODUCT_WIDTH = 560
BLISTER_EXCLUSIVES = 2289
MISC = 2374
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


def tcgl_print(path: str) -> dict | None:
    """A print from TCG Live's alt exports (svalt, mealt) by its image path."""
    key = path.split("/")[0]
    if key not in _tcgl:
        index = json.loads(fetch(TCGL_INDEX, "tcgl-index.json"))
        entry = index.get("en-US", {}).get(key)
        cards = json.loads(fetch(TCGL.format(path=entry["path"]), f"tcgl-{key}.json")) if entry else []
        _tcgl[key] = {c["images"]["tcgl"]["png"]["front"]: c for c in cards if c.get("images")}
    return _tcgl[key].get(TCGL_PRINT.format(path=path, kind=""))


def ship_print_map(set_id: str, number: str, path: str) -> str | None:
    """Ship a TCG Live print's foil map as the site's alpha mask; its repo path."""
    rel = f"assets/foil/maps/{set_id}/{number}.webp"
    if (ROOT / rel).exists():
        return rel
    try:
        raw = fetch(TCGL_PRINT.format(path=path, kind=".foil"))
    except (subprocess.CalledProcessError, OSError):
        return None
    # As the card-textures skill's fetch_foil_maps.py ships them: white, with
    # the map's brightness (times its own alpha) as the alpha.
    a = np.asarray(Image.open(BytesIO(raw)).convert("RGBA")).astype(np.float32)
    lum = ((0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255).clip(0, 255)
    white = np.full(lum.shape, 255, np.uint8)
    mask = Image.fromarray(np.dstack([white, white, white, lum.round().astype(np.uint8)]), "RGBA")
    (ROOT / rel).parent.mkdir(parents=True, exist_ok=True)
    mask.save(ROOT / rel, "WEBP", quality=85, alpha_quality=80, method=6)
    return rel


_set_cards: dict[str, dict[str, dict]] = {}


def set_cards(set_id: str) -> dict[str, dict]:
    """Another set's cards by id, for a promo that copies one of them."""
    if set_id not in _set_cards:
        records = json.loads((DATA / f"{set_id}.json").read_text(encoding="utf-8"))
        _set_cards[set_id] = {c["id"]: c for c in records}
    return _set_cards[set_id]


def foil_from_tcgl(card: dict) -> str:
    """The site rarity whose foil recipe matches TCG Live's print type."""
    foil = card.get("foil") or {}
    kind, long_id = foil.get("type", ""), card.get("ext", {}).get("tcgl", {}).get("longFormID", "")
    if kind == "COSMOS":
        return "Cosmos"
    # White Flare prints its holo rares in tinsel; the site draws them as its holo.
    if kind in ("SV_HOLO", "TINSEL"):
        return "Rare"
    if kind == "SUN_PILLAR":
        return "Double Rare" if "DoubleRare" in long_id else "Illustration Rare"
    if kind == "SV_ULTRA":
        if "SpecialIllustration" in long_id:
            return "Special Illustration Rare"
        return "Ultra Rare" if "UltraRare" in long_id else "Double Rare"
    return ""


def split_number(number: str, series: dict) -> tuple[str, int] | None:
    # A trailing letter (smp30a, smp103a) is pkmn.gg's second print of a number.
    match = re.fullmatch(r"([a-z]+)(\d+)[a-z]?", number)
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
    remote = fallback = ""

    if spec.get("like"):
        like_set, _, like = spec["like"].rpartition(":")
        pool = set_cards(like_set) if like_set else cards
        base = pool.get(f"{like_set or set_id}-{like}")
        if not base:
            raise RuntimeError(f"{number}: like {spec['like']} is not in data/{like_set or set_id}.json yet")
        drop = ["image", "imageSmall", "imageRemote", "market", "stampPos", "stampSize", "variant", "tcgplayerId", "reverseMap"]
        # `keepMaps`: the same print in another foil (151's cosmos holo Rares,
        # the UPC's metal Mew ex) still foils where the set card does.
        if not spec.get("keepMaps"):
            drop += ["foilMap", "etchMap", "etchMapH", "etchMapV"]
        # `keepScan`: a print that differs from the set card only in its foil
        # (151's cosmos holos) keeps the set card's clean scan. A scan of the
        # foil print bakes the foil in dark, and the foil engine draws it again.
        if spec.get("keepScan"):
            drop = [k for k in drop if k not in ("image", "imageSmall", "imageRemote")]
        keep = {k: v for k, v in base.items() if k not in drop}
        record = {**keep, "id": card_id, "number": number}
        if "printedNumber" not in record:
            record["printedNumber"] = f"{base['number']}/{cfg.get('printedTotal', '')}".rstrip("/")
        # A print with no scan of its own anywhere (Perfect Order's cosmos
        # Meganium has no TCGplayer listing) shows the card it copies.
        # TCGplayer has no photo of some listings (Hydrapple's cosmos holo
        # answers 403), so the copied card's scan stands in for those too.
        remote = TCG_IMAGE.format(id=spec["tcgplayerId"]) if spec.get("tcgplayerId") else base.get("imageRemote", "")
        fallback = base.get("imageRemote", "")
        if spec.get("keepScan"):
            remote = fallback = ""
        if spec.get("tcgl"):
            live = tcgl_print(spec["tcgl"])
            if not live:
                raise RuntimeError(f"{number}: {spec['tcgl']} is not in TCG Live's exports")
            remote = TCGL_PRINT.format(path=spec["tcgl"], kind="")
            if not spec.get("foilAs"):
                record["foilAs"] = foil_from_tcgl(live)
            foil_map = ship_print_map(set_id, number, spec["tcgl"])
            if foil_map:
                record["foilMap"] = foil_map
    else:
        parts = split_number(number, series)
        if not parts:
            raise RuntimeError(f"{number}: no promoSeries prefix and no `like`")
        prefix, n = parts
        ser = series[prefix]
        base_url = f"https://www.pkmn.gg/series/{ser['series']}/{ser['slug']}"
        # pkmn.gg files the Sword & Shield promos under their printed key (SWSH001).
        suffix = re.sub(r"^[a-z]+\d+", "", number)
        page_key = ser.get("pkmnKey", "{n}").format(n=n) + suffix
        detail = page_data(fetch(f"{base_url}/{page_key}", f"pkmngg-{prefix}-{n}{suffix}.html", refresh))
        record = card_record({"id": set_id, "scrydexId": ser["scrydex"]}, detail)
        record["id"], record["number"] = card_id, number
        record["printedNumber"] = f"{ser['printed']} {n:03d}{suffix}"
        # scrydex answers a bare number with the card back for the Sword & Shield promos.
        # Sun & Moon's promos are smp-SM01 there but SM001 on pkmn.gg: `scrydexKey`.
        scry_key = ser.get("scrydexKey", "{n}").format(n=n) + suffix if ser.get("scrydexKey") else page_key
        record["image"] = f"https://images.scrydex.com/pokemon/{ser['scrydex']}-{scry_key}/large"
        record["imageSmall"] = f"https://images.scrydex.com/pokemon/{ser['scrydex']}-{scry_key}/small"
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

    # pkmn.gg pads some names ("Alakazam  ") and curls some apostrophes
    # ("Iono’s Bellibolt ex"), which the set's own cards spell straight.
    record["name"] = str(record.get("name", "")).strip().replace("’", "'")
    # A Sword & Shield promo takes the era's finishes (js/foil-maps.js swshPattern).
    parts = split_number(number, series)
    if parts and not spec.get("like") and series[parts[0]].get("era"):
        record["era"] = series[parts[0]]["era"]
    record["rarity"] = "Promo"
    record["promo"] = True
    # `foilMap`: a hand-made map for a print TCG Live has none for.
    for key in ("foilAs", "variant", "tcgplayerId", "printedNumber", "foilMap"):
        if spec.get(key):
            record[key] = spec[key]
    record = merge(prior, record) if prior else record
    # A rebuild must not keep a mirrored path that points at another card's scan.
    if not prior and remote:
        record["imageRemote"] = remote
    return ordered(record), price, (remote, fallback) if fallback and fallback != remote else remote


def mirror(set_id: str, record: dict, remote: str | tuple[str, str], refresh: bool) -> None:
    stem = record["number"]
    local = f"assets/cards/{set_id}/{stem}.webp"
    if (ROOT / local).exists() and not refresh and record.get("image") == local:
        return
    remote, fallback = remote if isinstance(remote, tuple) else (remote, "")
    try:
        raw = fetch(remote)
    except urllib.error.HTTPError:
        if not fallback:
            raise
        print(f"    {record['number']}: no scan at {remote}, showing the card it copies")
        raw, remote = fetch(fallback), fallback
    # A rescan that changes the art lands under a new name (<stem>-v2), since
    # the old one is cached for a year.
    replace_scan(raw, set_id, record, stem)
    record["imageRemote"] = remote


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
    # Product-only prints (blister exclusives) are filed in a group of their own,
    # or in Miscellaneous Cards & Products (Journey Together's Cosmos Holo box
    # cards, the stamped store promos), and a promo spec can name another.
    groups = [g for g in groups if g] + [BLISTER_EXCLUSIVES, MISC]
    groups += sorted({p["tcgplayerGroup"] for p in products if p.get("tcgplayerGroup")} - set(groups))
    groups += sorted({s["tcgplayerGroup"] for s in (cfg.get("promoCards") or {}).values() if s.get("tcgplayerGroup")} - set(groups))
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
        ser = cfg["promoSeries"][prefix]
        key = ser.get("scrydexKey", "{n}").format(n=n)
        return listings[prefix].get(str(n)) or listings[prefix].get(key)

    for number, spec in (cfg.get("promoCards") or {}).items():
        if number not in sold:
            continue
        card_id = f"{set_id}-{number}"
        if prices_only and card_id in cards:
            record, price = dict(cards[card_id]), None
            parts = split_number(number, cfg.get("promoSeries", {}))
            if parts and not spec.get("like") and not number[-1].isalpha():
                price = listed_price(*parts)
        else:
            record, price, remote = promo_record(cfg, number, spec, cards, refresh)
            if remote and (refresh or not str(record.get("image", "")).startswith("assets/")):
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
    # A promo-only print the set's own checklist carries (Crimson Invasion 63a, the
    # alternate-art Guzzlord-GX) has a real rarity and `promo: true`; it stays.
    # A set's own box-only reprints ("a" numbers: sm2 60a) are kept with promo: true.
    ordered_records = [
        cards[c["id"]]
        for c in records
        if c["id"] not in promo_ids
        and (not c.get("promo") or c.get("rarity") != "Promo" or re.fullmatch(r"\d+a", str(c.get("number"))))
    ]
    ordered_records += [cards[i] for i in sorted(promo_ids, key=lambda i: cards[i]["number"])]
    data_path.write_text(json.dumps(ordered_records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    price_history.record(set_id, "cards", card_prices, today)
    print(f"  promo cards: {len(promo_ids)} ({len(card_prices)} priced)")

    # Products: price, photo, contents. Collections sold across sets are filed
    # in another TCGplayer group (Miscellaneous Cards & Products), named per product.
    out = []
    product_prices: dict[str, float] = {}
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
        if product.get("gift"):
            # A store gave this promo free with the product, so the offer costs
            # both: the product's market price plus the promo's.
            gifts = [cards[p].get("market") for p in promos]
            if not all(gifts):
                print(f"    {product['id']}: its gift promo has no price, left out")
                continue
            price = round(price + sum(gifts), 2)
        released = (info.get("presaleInfo") or {}).get("releasedOn") or ""
        source = {str(k): int(v) for k, v in (product.get("from") or {}).items() if int(v) > 0}
        entry = {
            "id": product["id"],
            "name": product["name"],
            "kind": product.get("kind", "collection"),
            "packs": sum(source.values()) if source else int(product.get("packs", 0)),
            **({"from": source} if source else {}),
            **({"note": product["note"]} if product.get("note") else {}),
            **({"special": product["special"]} if product.get("special") else {}),
            "promos": promos,
            **({"pick": int(product["pick"])} if product.get("pick") else {}),
            **({"groupOf": int(product["groupOf"])} if product.get("groupOf") else {}),
            "price": price,
            "tcgplayerId": pid,
            **({"released": released[:10]} if released else {}),
        }
        if entry["kind"] == "event":
            # The card is the product: its own scan stands in for a box photo.
            image = None
        elif not prices_only or not (ROOT / f"assets/products/{set_id}/{product['id']}.webp").exists():
            image = save_product_image(set_id, product, refresh)
        else:
            image = f"assets/products/{set_id}/{product['id']}.webp"
        if image:
            entry["image"] = image
        out.append(entry)
        product_prices[product["id"]] = price
        print(f"    {product['id']:<24} ${price:>8.2f}  {entry['packs']:>2} packs  {', '.join(product.get('promos') or [])}")
    price_history.record(set_id, "sealed", product_prices, today)
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
    price_history.fold_legacy()
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
