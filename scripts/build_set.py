"""Build data/<set>.json for any set from one config file.

Replaces the per-set build_meN.py + enrich_meN.py pairs. Those were ~600 lines
each, 44% and 88% duplicated respectively, and needed cloning and hand-editing
for every new set — so a parser fix had to be applied N times or sets quietly
diverged.

One source now instead of two: pkmn.gg carries the checklist *and* the full card
text (attacks, abilities, HP, artist, flavour) as structured JSON in each page's
__NEXT_DATA__, so there is no HTML regex-scraping to keep working.

A set is declared in data/sets/<id>.json:

    {
      "id": "me5",
      "name": "Pitch Black",
      "series": "mega-evolution",
      "slug": "pitch-black",
      "scrydexId": "me5"
    }

An XY set also sets `"era": "xy"` (pkmn.gg's "Rare Holo" is then kept as the card's rarity),
and Generations adds `"rcNumbers": "^RC\\d+$"` for its Radiant Collection cards. A Black & White set
sets `"era": "bw"` (the same "Rare Holo" and basic Energy rules) and may add `"rarityOverrides": {"RC11":
"Rare Holo EX"}` (a card's rarity by number, for a label pkmn.gg gets wrong or leaves empty: Dragon
Vault's Kyurem and Trainers) and `"cardFlags": {"21": {"scarce": true}}` (extra fields by number:
the engine's `scarce` pool, js/engine.js); Legendary Treasures uses `"rcNumbers": "^RC\\d+$"` too.
A Diamond & Pearl generation set (dp1-dp7, pl1-pl4, hgss1-hgss4, col1, POP 6-9, the Trainer Kits) sets `"era": "dp"` (the same "Rare Holo"
and basic Energy rules) and gives its subsets rarities of their own with `rarityOverrides` by number, because pkmn.gg files them
as plain "Rare" / "Rare Holo": `{"SH1": "Rare Shining", "RT1": "Rare Rotom", "AR1": "Rare Arceus", "SL1": "Rare Shiny
Legendary"}`; the Alph Lithograph (number ONE to FOUR, "Rare Secret") gets `"cardFlags": {"ONE": {"alph": true}}` and Call of
Legends' eight reverse-only basic Energy (88-95) `{"88": {"reverse": true}}` each (js/engine.js `reverseEnergy`).

A Wizards of the Coast set (base1-base6, gym1-gym2, neo1-neo4, ecard1-ecard3, si1) sets `"era": "wotc"` (the same "Rare Holo" and basic Energy rules).
pkmn.gg's slugs are not the ids (`base/base` is base1, `base/jungle` base2, `base/base-set-2` base4, `other/legendary-collection` base6,
`e-card/expedition-base-set` ecard1: SCAFFOLD-NOTES has the table). The two Crystal-Pokémon runs come through as "Rare Secret" and take
`"rarityOverrides": {"148": "Rare Crystal", "149": "Rare Crystal", "150": "Rare Crystal"}` (ecard2; ecard3 145-150); Base Set's Machamp 8
(a holo that never came in a booster pack) takes `"cardFlags": {"8": {"noPack": true}}` (js/engine.js); the Dark Raichu stays "Rare
Secret". Southern Islands has no rarity at all (`rarityOverrides` for the builder to decide).

Re-running is safe: fields owned by other scripts (`market` from
fetch_prices.py, and the mirrored `image` / `imageSmall` / `imageRemote` paths
from mirror_images.py) are preserved on cards that already have them, so a
rebuild refreshes card text without undoing pricing or the image mirror.

Usage:
    py scripts/build_set.py me5              # rebuild one set
    py scripts/build_set.py me1 me2 me2pt5   # several
    py scripts/build_set.py --all
    py scripts/build_set.py --refresh me5    # ignore the page cache
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
CACHE = ROOT / "scripts" / ".cache" / "pkmngg"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip set builder"
NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)

# Emitted in this order so a rebuild diffs cleanly against the existing files.
FIELD_ORDER = [
    "id", "name", "number", "rarity", "supertype", "subtypes", "types", "hp",
    "artist", "flavorText", "evolvesFrom", "image", "imageSmall",
    "attacks", "abilities", "market", "imageRemote", "gallery", "printedNumber",
]

# Written by fetch_prices.py / mirror_images.py — never clobbered on rebuild.
OWNED_ELSEWHERE = ("market", "image", "imageSmall", "imageRemote")


def fetch(url: str, cache_key: str, refresh: bool) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{cache_key}.html"
    if cached.exists() and not refresh:
        return cached.read_text(encoding="utf-8")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as resp:
                html = resp.read().decode("utf-8", "replace")
            cached.write_text(html, encoding="utf-8")
            time.sleep(0.2)  # be a polite guest
            return html
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == 2:
                raise
            time.sleep(1.5 * (attempt + 1))
    return ""


def page_data(html: str):
    match = NEXT_DATA.search(html)
    if not match:
        raise RuntimeError("no __NEXT_DATA__ — pkmn.gg page shape changed")
    return json.loads(match.group(1))["props"]["pageProps"]["cardData"]


# A card carrying any of these is a Trainer, whatever the feed says. pkmn.gg
# has at least one record (me5-107 Energy Switch) typed as Energy while the
# printed card plainly reads "Item / TRAINER"; the subtype is the reliable
# signal, so it wins.
TRAINER_SUBTYPES = {"Item", "Supporter", "Stadium", "Pokémon Tool", "Technical Machine"}


def clean_attacks(raw) -> list[dict]:
    """Normalise to the shape the existing files use: convertedEnergyCost is
    dropped (nothing reads it) and `damage` / `text` are always present, even
    when empty, so a rebuild doesn't churn the diff."""
    out = []
    for atk in raw or []:
        entry = {"name": atk.get("name", "")}
        if atk.get("cost"):
            entry["cost"] = atk["cost"]
        entry["damage"] = atk.get("damage") or ""
        entry["text"] = expand_energy(atk.get("text") or "")
        out.append(entry)
    return out


# Twilight Masquerade (and a few older dumps) still label one Regular Rare as
# "Rare Holo". The engine's rare pool is the "Rare" string, so collapse it.
RARITY_ALIASES = {
    "Rare Holo": "Rare",
    "Rare Holofoil": "Rare",
    "Holo Rare": "Rare",
    # Unrated cards (30th Celebration's RGB Mews) come through as the string
    # "None". Blank it so merge() keeps the rarity the set already has.
    "None": "",
}

# pkmn.gg writes energy symbols as single letters ("[G] Energy"); the existing
# corpus spells them out, which reads far better. Normalise to the long form.
ENERGY_LETTER = {
    "G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning", "P": "Psychic",
    "F": "Fighting", "D": "Darkness", "M": "Metal", "Y": "Fairy",
    "N": "Dragon", "C": "Colorless",
}
LETTER_TOKEN = re.compile(r"\[([A-Z])\]")


def expand_energy(text: str) -> str:
    if not text:
        return text
    return LETTER_TOKEN.sub(
        lambda m: f"[{ENERGY_LETTER.get(m.group(1), m.group(1))}]", text
    )


def clean_abilities(raw) -> list[dict]:
    out = []
    for ab in raw or []:
        entry = {"name": ab.get("name", ""), "text": expand_energy(ab.get("text", ""))}
        if ab.get("type"):
            entry["type"] = ab["type"]
        out.append(entry)
    return out


CLASSIC_15 = {"cc15-venusaur": "15_A1", "cc15-here": "15_A2", "cc15-rockets": "15_A3", "cc15": "15_A4"}


def card_record(cfg: dict, detail: dict, subset: dict | None = None) -> dict:
    number = str(detail.get("number", "")).strip()
    set_id = cfg["id"]
    scrydex = (subset or {}).get("scrydexId") or cfg.get("scrydexId", set_id)
    remote_number = number
    rarity = detail.get("rarity", "")
    # Sword & Shield prints its holo Rares as a rarity of their own ("Rare
    # Holo", the art background foil), separate from the plain Rare, so the
    # alias that folds the two together is for the Scarlet & Violet feeds only.
    # Sun & Moon, XY and Black & White keep "Rare Holo" too (the XY window holo, pkmn.gg's
    # own word for it next to "Rare Holo EX", "Rare BREAK", "Rare ACE" and "Rare Ultra").
    if not (cfg.get("era") in ("swsh", "sm", "xy", "bw", "dp", "wotc") and rarity == "Rare Holo"):
        rarity = RARITY_ALIASES.get(rarity, rarity)
    # Prints the feed files under the wrong rarity (Generations' embossed full-art
    # Articuno 25 and Zapdos 29 are "Rare Holo" there): `"rarityOverrides": {"25": "Rare Ultra"}`.
    rarity = (cfg.get("rarityOverrides") or {}).get(number, rarity)
    if (subset or {}).get("gallery") == "cc":
        # Celebrations' Classic Collection reprints keep their original
        # numbers (4/102, 17/17), which collide with the set's own 1-25, so
        # they are filed as cc<n> like the 30th Celebration's (me55-cc4).
        # Three share number 15; pkmn.gg's numberKey tells them apart.
        key = str(detail.get("numberKey", "")).strip()
        suffix = re.sub(r"^0*\d+", "", key).strip("-")
        number = f"cc{number}" + (f"-{suffix.split('-')[0]}" if suffix else "")
    card = {
        "id": f"{set_id}-{number}",
        "name": detail.get("name", ""),
        "number": number,
        "rarity": rarity,
        "supertype": detail.get("superType", ""),
    }
    if subset:
        card["gallery"] = subset["gallery"]
    # Generations' Radiant Collection: pkmn.gg lists RC1-RC32 in the set's own checklist,
    # each under the rarity of the print it reproduces. `"rcNumbers": "^RC\\d+$"` in the
    # set's config flags them `rc: true` (js/engine.js radiantCollection pool, js/xy-foil.js xy-rc).
    if cfg.get("rcNumbers") and re.fullmatch(cfg["rcNumbers"], number):
        card["rc"] = True
    if (subset or {}).get("gallery") == "cc":
        card["printedNumber"] = f"Classic {remote_number}"
    subtypes = detail.get("subtypes") or []
    if TRAINER_SUBTYPES & set(subtypes):
        card["supertype"] = "Trainer"
    for src, dst in (("subtypes", "subtypes"), ("types", "types"), ("hp", "hp"),
                     ("artist", "artist"), ("flavorText", "flavorText"),
                     ("evolvesFrom", "evolvesFrom")):
        value = detail.get(src)
        # The feed writes "n/a" for an unknown illustrator; leave the field off
        # so the app falls back to its own "Unknown".
        if src == "artist" and str(value).strip().lower() in {"n/a", "na", "-"}:
            continue
        if value:
            card[dst] = value
    # scrydex files a Sword & Shield sub-gallery under its own id (swsh9tg-TG01,
    # swsh45sv-SV001, swsh12pt5gg-GG01) and Celebrations' Classic Collection
    # as cel25c-<n>_A; the bare set id returns the card back.
    gallery = (subset or {}).get("gallery")
    if gallery in ("tg", "sv", "gg") and not (subset or {}).get("scrydexId"):
        scrydex = f"{scrydex}{gallery}"
    if gallery == "cc":
        # The three number-15 reprints are cel25c-15_A1..A4 (A4 is Claydol).
        remote_number = CLASSIC_15.get(number, f"{remote_number}_A")
    card["image"] = f"https://images.scrydex.com/pokemon/{scrydex}-{remote_number}/large"
    card["imageSmall"] = f"https://images.scrydex.com/pokemon/{scrydex}-{remote_number}/small"
    attacks = clean_attacks(detail.get("attacks"))
    if attacks:
        card["attacks"] = attacks
    abilities = clean_abilities(detail.get("abilities"))
    if abilities:
        card["abilities"] = abilities
    # Special Energy is printed as an Uncommon, not a basic Energy slot card.
    subtypes = {str(s).lower() for s in (card.get("subtypes") or [])}
    if card["rarity"] == "Energy" and "special" in subtypes:
        card["rarity"] = "Uncommon"
    # XY, Generations and Evolutions number their basic Energy (xy1 132-140, g1 75-83,
    # xy12 91-99) as "Common". The pack odds
    # for those three sets deal Energy through xySlots' `commonEnergy` from the shared
    # print `xy` (energy-<type>-xy), so the set's own Energy rows are filed as "Energy",
    # which keeps them out of the Common pool; a builder may `skipNumbers` them.
    # Black & White's own Energy 105-112 are "Common" on pkmn.gg and sit on the commons sheet
    # (bwSlots, `commonEnergy`), so the same rule applies to the era "bw".
    # The Diamond & Pearl generation's dp1 123-130 and hgss1 115-122 are "Common" on pkmn.gg and sit on the commons sheet (dpSlots
    # `commonEnergy`); the same rule applies to the era "dp". Call of Legends' 88-95 are reverse-only: add `reverse: true` by cardFlags.
    # The Wizards of the Coast sets' basic Energy (base1 97-102 "None", base4 125-130, gym1 and gym2 127-132, neo1 106-111, ecard1 160-165,
    # all "Common" otherwise) take the same rule: the packs of base1, base4, gym1, gym2 and neo1 deal them through wotcSlots' `energy`
    # slots from the set's own cards (`energyPrint: "own"`), and the e-Card ones are theme-deck only, so "Energy" keeps them out of the
    # Common pool in both cases.
    if cfg.get("era") in ("xy", "bw", "dp", "wotc") and card["supertype"] == "Energy" and "basic" in subtypes:
        card["rarity"] = "Energy"
    # Per-number fixes from the set's config (Black & White: RC11 is "Rare" on pkmn.gg but a Pokémon-EX,
    # Dragon Vault's three cards have no rarity at all; `cardFlags` sets extra fields such as `scarce`).
    if number in (cfg.get("rarityOverrides") or {}):
        card["rarity"] = cfg["rarityOverrides"][number]
    for field, value in ((cfg.get("cardFlags") or {}).get(number) or {}).items():
        card[field] = value
    return card


ART_BASE = "https://pokesymbols.com/images/tcg/sets/booster-pack-art/"


def pack_art(cfg: dict) -> int:
    """Download the booster wrapper art for a set.

    Wrapper count varies — the main sets print four, but Ascended Heroes only
    has one — so probe upward and stop at the first miss rather than assuming.
    Each wrapper is written as .avif plus a .png fallback, matching what the
    existing sets ship and what packPicture() expects.
    """
    slug = cfg.get("artSlug")
    if not slug:
        return 0
    out_dir = ROOT / "assets" / "packs" / cfg["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    names = cfg.get("packs") or []
    found = 0
    for index in range(8):
        url = f"{ART_BASE}{slug}-pack-{index}.avif"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as resp:
                if resp.status != 200:
                    break
                raw = resp.read()
        except (urllib.error.HTTPError, urllib.error.URLError, OSError):
            break
        # The 404 page is served as an image too, so size is the honest check.
        if len(raw) < 30_000:
            break
        stem = names[index] if index < len(names) else f"pack-{index}"
        (out_dir / f"{stem}.avif").write_bytes(raw)
        try:
            from PIL import Image
            from io import BytesIO

            Image.open(BytesIO(raw)).convert("RGBA").save(out_dir / f"{stem}.png")
        except Exception as exc:  # noqa: BLE001 - keep the avif either way
            print(f"    {stem}: no png fallback ({type(exc).__name__})")
        found += 1
        time.sleep(0.2)
    return found


# The feed shouts some subtypes ("MEGA") that the existing corpus title-cases.
SUBTYPE_CASE = {"mega": "Mega", "ex": "ex", "basic": "Basic"}


def union_subtypes(fresh: list, prior: list) -> list:
    """Combine both lists without duplicating a subtype that differs only by
    case — "MEGA" and "Mega" are the same thing."""
    out: list[str] = []
    seen: set[str] = set()
    for value in list(fresh) + list(prior):
        key = str(value).lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(SUBTYPE_CASE.get(key, value))
    return out


def merge(prior: dict | None, fresh: dict) -> dict:
    """Fold a rebuilt card into what we already had.

    Fresh values win where the feed has one — that is how the me5-117 artist
    typo got corrected. But the feed is not a superset of what we hold: it has
    no Trainer rule text (the old scraper stored that as a pseudo-attack), and
    it drops "Mega"/"ex" from some subtype lists. So anything the feed leaves
    empty is carried over rather than lost, and subtypes are unioned.
    """
    if not prior:
        return fresh
    merged = dict(fresh)
    for key in OWNED_ELSEWHERE:
        if key in prior:
            merged[key] = prior[key]
    for key, old_value in prior.items():
        if key in OWNED_ELSEWHERE:
            continue
        if not merged.get(key) and old_value:
            merged[key] = old_value
    old_subtypes = prior.get("subtypes") or []
    if old_subtypes:
        merged["subtypes"] = union_subtypes(merged.get("subtypes") or [], old_subtypes)
    return merged


def ordered(card: dict) -> dict:
    out = {k: card[k] for k in FIELD_ORDER if k in card}
    # Anything unexpected still survives rather than being silently dropped.
    for k, v in card.items():
        if k not in out:
            out[k] = v
    return out


def sort_key(card: dict):
    """Numbered cards first by number, then the galleries in their own order
    (TG01... after the set, SV001..., GG01..., cc2...)."""
    number = str(card["number"])
    m = re.match(r"^([A-Za-z]*)0*(\d+)(.*)$", number)
    if not m:
        return (9, number, 0, "")
    prefix, digits, rest = m.groups()
    rank = {"": 0, "TG": 1, "SV": 1, "GG": 1, "cc": 2}.get(prefix, 3)
    return (rank, prefix, int(digits), rest)


def build(set_id: str, refresh: bool) -> int:
    cfg_path = SETS / f"{set_id}.json"
    if not cfg_path.exists():
        print(f"  no data/sets/{set_id}.json — skipped")
        return 1
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    out_path = DATA / f"{set_id}.json"
    existing = {}
    if out_path.exists():
        existing = {c["id"]: c for c in json.loads(out_path.read_text(encoding="utf-8"))}

    cards = []
    # A set's sub-galleries (Sword & Shield's Trainer Gallery, Shining Fates'
    # Shiny Vault, Crown Zenith's Galarian Gallery, Celebrations' Classic
    # Collection) are checklists of their own on pkmn.gg but one product, so
    # they build into the same data file, each card tagged with `gallery`.
    # An `inline` subset (Generations' Radiant Collection RC1-RC32) is listed in
    # the main checklist already (`rcNumbers` flags the cards); it only names the
    # TCGplayer group the prices come from.
    sources = [(cfg["slug"], None)] + [(sub["slug"], sub) for sub in cfg.get("subsets") or [] if not sub.get("inline")]
    for slug, subset in sources:
        base = f"https://www.pkmn.gg/series/{cfg['series']}/{slug}"
        tag = f"{set_id}-{subset['gallery']}" if subset else set_id
        listing = page_data(fetch(base, f"{tag}-set", refresh))
        print(f"  checklist: {len(listing)} cards" + (f" ({subset['gallery']})" if subset else ""))
        seen = set()
        for index, row in enumerate(listing, start=1):
            number = str(row.get("number", "")).strip()
            # The detail page is addressed by numberKey where the two differ
            # (TG01 lives at /TG001; the three Classic Collection number 15s
            # at /015-<name>).
            key = str(row.get("numberKey") or number).strip()
            if not number or key in seen:
                continue
            # Prize reprints the checklist lists beside the set (182a League
            # Cup Pokégear 3.0) are not in its packs or its printed total.
            if number in (cfg.get("skipNumbers") or []):
                continue
            seen.add(key)
            detail = page_data(fetch(f"{base}/{key}", f"{tag}-{key}", refresh))
            if isinstance(detail, list):  # a listing page came back; skip rather than guess
                print(f"    #{number}: unexpected page shape, skipped")
                continue
            card = card_record(cfg, detail, subset)
            cards.append(ordered(merge(existing.get(card["id"]), card)))
            if index % 25 == 0:
                print(f"    {index}/{len(listing)}…")

    # Cards the checklist doesn't carry — 30th Celebration's Classic Collection
    # reprints live in their own Scrydex expansion — were added by hand, so keep
    # them rather than let a rebuild delete them.
    fresh_ids = {c["id"] for c in cards}
    kept_extra = [c for cid, c in existing.items() if cid not in fresh_ids]
    if kept_extra:
        print(f"  kept {len(kept_extra)} card(s) not on the checklist")
    cards.extend(kept_extra)
    cards.sort(key=sort_key)
    out_path.write_text(
        json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    kept = sum(1 for c in cards if "market" in c)
    print(f"  wrote data/{set_id}.json — {len(cards)} cards, {kept} keeping prices")
    wrappers = pack_art(cfg)
    if wrappers:
        print(f"  pack art: {wrappers} wrapper(s)")
    return 0


def main(argv: list[str]) -> int:
    refresh = "--refresh" in argv
    args = [a for a in argv if not a.startswith("-")]
    if "--all" in argv:
        args = sorted(p.stem for p in SETS.glob("*.json"))
    if not args:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        print("give a set id, or --all", file=sys.stderr)
        return 2

    failed = 0
    for set_id in args:
        print(f"{set_id}:")
        try:
            failed += build(set_id, refresh)
        except (RuntimeError, urllib.error.URLError, KeyError) as exc:
            print(f"  FAILED — {exc}")
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
