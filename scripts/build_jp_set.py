"""Build data/<set>.json for a Japanese set from Scrydex.

The English builder (scripts/build_set.py) reads pkmn.gg, which has no
Japanese cards. Scrydex does, every era, and each card page embeds the card as
JSON with its English translation and its TCGplayer product ids (TCGplayer's
"Pokemon Japan" category, 85). So a Japanese card here keeps the English name,
text and type words the rest of the site reads and searches, plus `nameJa`,
and its face is the Japanese scan.

A Japanese set is declared in data/sets/<id>.json like any other, with:

    "lang": "ja",
    "scrydexId": "sv2a_ja",          scrydex's expansion id
    "tcgplayerCategory": 85,         Pokemon Japan
    "rarityMap": {"RR": "Double Rare", ...}   scrydex rarity_code -> the site's rarity
    "patternPrints": ["pokeball", "masterball"]   optional: the ball mirrors become
                                     cards of their own (<id>-<n>-pb / -mb), as
                                     scripts/build_patterns.py does for Prismatic
    "englishTwin": "sv3pt5"          optional: copy foil maps from the English
                                     print of the same art (matched by name and
                                     rarity), which TCG Live has and Japan does not

Set ids for Japanese sets start with "j" (jsv2a, jsm12a): the Japanese codes
reuse English ones (Japan's SV8 is not Surging Sparks), and a card id may not
hold a second hyphen in its set part.

Re-running is safe: `market`, the mirrored image paths and foil-map fields on
existing cards are kept.

Usage:
    python3 scripts/build_jp_set.py jsv2a
    python3 scripts/build_jp_set.py --refresh jsm12a
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
CACHE = ROOT / "scripts" / ".cache" / "scrydex-ja"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip set builder"
EXPANSION_URL = "https://scrydex.com/pokemon/expansions/x/{id}"
BLOB = re.compile(r'data-[a-z-]*="(\{&quot;.*?)"', re.S)

# Fields other scripts own; a rebuild keeps them.
KEEP = ("market", "marketSource", "image", "imageSmall", "imageRemote", "tcgplayerId", "foilMap", "etchMap", "reverseMap",
        "foilMapSource", "pullWeight")
PATTERNS = {
    "pokeball": ("pb", "Poké Ball", "pokeBallReverseHolofoil"),
    "masterball": ("mb", "Master Ball", "masterBallReverseHolofoil"),
}
TRAINER_SUBTYPES = {"Item", "Supporter", "Stadium", "Pokémon Tool", "Pokemon Tool", "Technical Machine"}
TYPE_WORDS = {"Lightning", "Fire", "Water", "Grass", "Psychic", "Fighting", "Darkness", "Metal", "Dragon",
              "Colorless", "Fairy"}


def fetch(url: str, key: str, refresh: bool) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{key}.html"
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as res:
                text = res.read().decode("utf-8", "replace")
            path.write_text(text, encoding="utf-8")
            return text
        except Exception as err:  # noqa: BLE001 - retried, then raised
            if "404" in str(err):
                return ""
            if attempt == 3:
                raise RuntimeError(f"{url}: {err}") from err
            time.sleep(2 * (attempt + 1))
    return ""


def blobs(text: str) -> list[dict]:
    out = []
    for raw in BLOB.findall(text):
        try:
            out.append(json.loads(html.unescape(raw)))
        except json.JSONDecodeError:
            continue
    return out


def card_json(text: str) -> dict | None:
    for blob in blobs(text):
        data = blob.get("data") if isinstance(blob, dict) else None
        if isinstance(data, dict) and data.get("id"):
            return data
    return None


def expansion(cfg: dict, refresh: bool) -> list[str]:
    """The scrydex card ids the expansion page lists (numbers can skip, so they are read, not counted)."""
    sid = cfg["scrydexId"]
    text = fetch(EXPANSION_URL.format(id=sid), f"exp-{sid}", refresh)
    # Card pages by their own links: /pokemon/cards/<slug>/<id>. A made-up slug works for most cards but not all
    # (sv2a_ja-154 answers only under antique-helix-fossil).
    paths = list(dict.fromkeys(re.findall(rf'href="(/pokemon/cards/[^/"]+/{re.escape(sid)}-[A-Za-z0-9]+)', text)))
    if not paths:
        raise RuntimeError(f"no cards listed for {sid}")
    return paths


def clean_attacks(raw) -> list[dict]:
    out = []
    for atk in raw or []:
        entry = {"name": atk.get("name", "")}
        if atk.get("cost"):
            entry["cost"] = atk["cost"]
        entry["damage"] = atk.get("damage") or ""
        entry["text"] = atk.get("text") or ""
        out.append(entry)
    return out


def product_id(card: dict, names: tuple[str, ...]) -> int | None:
    for variant in card.get("variants") or []:
        if variant.get("name") in names:
            for market in variant.get("marketplaces") or []:
                if market.get("name") == "tcgplayer" and str(market.get("product_id") or "").isdigit():
                    return int(market["product_id"])
    return None


def record(cfg: dict, raw: dict) -> dict:
    en = (raw.get("translation") or {}).get("en") or {}
    number = str(raw.get("number", "")).strip().lstrip("0") or "0"
    code = raw.get("rarity_code") or ""
    rarity = (cfg.get("rarityMap") or {}).get(code)
    if rarity is None:
        raise RuntimeError(f"{raw['id']}: rarity code {code!r} ({raw.get('rarity')}) has no rarityMap entry")
    rarity = (cfg.get("rarityOverrides") or {}).get(number, rarity)
    supertype = en.get("supertype") or ""
    subtypes = [s for s in (en.get("subtypes") or []) if s]
    if supertype in ("Trainer", "Trainers") or TRAINER_SUBTYPES & set(subtypes):
        supertype = "Trainer"
    card = {
        "id": f"{cfg['id']}-{number}",
        "name": en.get("name") or raw.get("name", ""),
        "nameJa": raw.get("name", ""),
        "number": number,
        "rarity": rarity,
        "supertype": supertype,
        "lang": "ja",
    }
    if subtypes:
        card["subtypes"] = subtypes
    types = [t for t in (en.get("types") or []) if t in TYPE_WORDS]
    if types:
        card["types"] = types
    if raw.get("hp"):
        card["hp"] = str(raw["hp"])
    if raw.get("artist") and str(raw["artist"]).strip().lower() not in {"n/a", "-"}:
        card["artist"] = raw["artist"]
    if en.get("flavor_text"):
        card["flavorText"] = en["flavor_text"]
    evolves = en.get("evolves_from") or []
    if evolves:
        card["evolvesFrom"] = evolves[0]
    attacks = clean_attacks(en.get("attacks"))
    if attacks:
        card["attacks"] = attacks
    abilities = [{"name": a.get("name", ""), "text": a.get("text", ""), **({"type": a["type"]} if a.get("type") else {})}
                 for a in en.get("abilities") or []]
    if abilities:
        card["abilities"] = abilities
    if en.get("rules"):
        card["rules"] = en["rules"]
    for key, field in (("weaknesses", "weaknesses"), ("resistances", "resistances")):
        rows = [{"type": w.get("type"), "value": w.get("value")} for w in en.get(key) or [] if w.get("type")]
        if rows:
            card[field] = rows
    if en.get("retreat_cost"):
        card["retreatCost"] = en["retreat_cost"]
    if raw.get("national_pokedex_numbers"):
        card["nationalPokedexNumbers"] = raw["national_pokedex_numbers"]
    if raw.get("regulation_mark"):
        card["regulationMark"] = raw["regulation_mark"]
    # A Japanese print number: 201/165, 001/173.
    if raw.get("printed_number"):
        card["printedNumber"] = raw["printed_number"]
    remote = f"https://images.scrydex.com/pokemon/{raw['id']}"
    card["image"] = f"{remote}/large"
    card["imageSmall"] = f"{remote}/small"
    pid = product_id(raw, ("normal", "holofoil", "unlimitedHolofoil", "unlimited"))
    if pid:
        card["tcgplayerId"] = pid
    for field, value in ((cfg.get("cardFlags") or {}).get(number) or {}).items():
        card[field] = value
    return card


def patterns(cfg: dict, card: dict, raw: dict) -> list[dict]:
    out = []
    for kind in cfg.get("patternPrints") or []:
        suffix, rarity, variant = PATTERNS[kind]
        pid = product_id(raw, (variant,))
        if not pid:
            continue
        ball = {k: v for k, v in card.items() if k not in ("tcgplayerId", "market", "rarity", "id", "number")}
        ball.update({
            "id": f"{card['id']}-{suffix}",
            "number": f"{card['number']}-{suffix}",
            "rarity": rarity,
            "printedRarity": card["rarity"],
            "pattern": kind,
            "base": card["id"],
            "tcgplayerId": pid,
        })
        out.append(ball)
    return out


CODE_OF = {"Common": "C", "Uncommon": "U", "Rare": "R", "Double Rare": "RR", "Illustration Rare": "AR",
           "Ultra Rare": "SR", "Special Illustration Rare": "SAR", "Hyper Rare": "UR"}


def twin_raw(cfg: dict, twin: dict, sid: str) -> dict:
    """A scrydex-shaped record from the English twin card (names, text) for a Japanese page scrydex lacks."""
    en = {
        "name": twin["name"], "supertype": twin.get("supertype"), "subtypes": twin.get("subtypes"), "types": twin.get("types"),
        "attacks": twin.get("attacks"), "abilities": twin.get("abilities"), "rules": twin.get("rules"),
        "flavor_text": twin.get("flavorText"), "evolves_from": [twin["evolvesFrom"]] if twin.get("evolvesFrom") else [],
    }
    return {
        "id": sid, "name": twin["name"], "number": twin["number"], "rarity_code": CODE_OF.get(twin.get("rarity"), ""),
        "hp": twin.get("hp"), "artist": twin.get("artist"),
        "printed_number": f"{int(sid.rsplit('-', 1)[1]):03d}/{cfg.get('printedTotal', '')}".rstrip("/"),
        "translation": {"en": en}, "variants": [],
    }


def twin_maps(cfg: dict) -> dict:
    """English cards of the same art, by (name, rarity): their foil-map fields."""
    twin = cfg.get("englishTwin")
    if not twin:
        return {}
    cards = json.loads((DATA / f"{twin}.json").read_text(encoding="utf-8"))
    out = {}
    for c in cards:
        if c.get("promo") or c.get("pattern"):
            continue
        fields = {k: c[k] for k in ("foilMap", "etchMap", "reverseMap") if c.get(k)}
        if fields:
            # Families that keep per-card masks by id (js/fam/sv-sir.js) read the English card's.
            fields["foilTwin"] = c["id"]
            out.setdefault((c.get("name"), c.get("rarity")), fields)
    return out


def build(set_id: str, refresh: bool) -> int:
    cfg = json.loads((SETS / f"{set_id}.json").read_text(encoding="utf-8"))
    paths = expansion(cfg, refresh)
    ids = [p.rsplit("/", 1)[1] for p in paths]
    with ThreadPoolExecutor(max_workers=8) as pool:
        pages = list(pool.map(lambda p: fetch(f"https://scrydex.com{p}", p.rsplit("/", 1)[1], refresh), paths))
    path = DATA / f"{set_id}.json"
    prior = {c["id"]: c for c in json.loads(path.read_text(encoding="utf-8"))} if path.exists() else {}
    maps = twin_maps(cfg)
    cards: list[dict] = []
    balls: list[dict] = []
    missing = []
    twin_cards = {}
    if cfg.get("englishTwin"):
        twin_cards = {c["number"]: c for c in json.loads((DATA / f"{cfg['englishTwin']}.json").read_text(encoding="utf-8"))
                      if not c.get("promo") and not c.get("pattern")}
    slug = lambda name: re.sub(r"[^a-z0-9]+", "-", str(name).lower().replace("'", "")).strip("-")
    twin_by_slug = {}
    for c in twin_cards.values():
        if c.get("rarity") in ("Common", "Uncommon", "Rare", "Double Rare"):
            twin_by_slug.setdefault(slug(c["name"]), c)
    for link, sid, text in zip(paths, ids, pages):
        raw = card_json(text)
        number = sid.rsplit("-", 1)[1]
        twin = twin_by_slug.get(link.split("/")[3])
        if not raw and twin and int(number) <= int(cfg.get("printedTotal") or 0):
            # Scrydex answers 404 for a few pages (sv2a_ja-154 to 156, the fossils). The English print of the same
            # card (by name, from the page's own link) stands in for the text, under the Japanese number and scan.
            raw = twin_raw(cfg, twin, sid)
            raw["number"] = number
        if not raw:
            missing.append(sid)
            continue
        card = record(cfg, raw)
        twin = maps.get((card["name"], card["rarity"]))
        if twin and cfg.get("twinMaps", True):
            card.update(twin)
        cards.append((card, raw))
    if missing:
        raise RuntimeError(f"{set_id}: no card data for {', '.join(missing[:10])}")
    def keep(card: dict) -> dict:
        old = prior.get(card["id"]) or {}
        for key in KEEP:
            if key in old and key != "tcgplayerId":
                if key in ("image", "imageSmall") and not str(old[key]).startswith("assets/"):
                    continue
                card[key] = old[key]
        return card

    out = [keep(card) for card, _ in cards]
    for card, raw in cards:
        for ball in patterns(cfg, card, raw):
            # A pattern print is the base card's scan under a ball foil: same image, no file of its own.
            for key in ("image", "imageSmall", "imageRemote"):
                if card.get(key):
                    ball[key] = card[key]
            balls.append(keep(ball))
            for key in ("image", "imageSmall", "imageRemote"):
                if card.get(key):
                    ball[key] = card[key]
    out += balls
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{set_id}: {len(out) - len(balls)} cards + {len(balls)} pattern prints -> {path.relative_to(ROOT)}")
    return 0


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    sets = [a for a in argv if not a.startswith("-")]
    if not sets:
        print(__doc__)
        return 1
    for set_id in sets:
        build(set_id, refresh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
