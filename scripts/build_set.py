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
    "attacks", "abilities", "market", "imageRemote",
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


def card_record(cfg: dict, detail: dict) -> dict:
    number = str(detail.get("number", "")).strip()
    set_id = cfg["id"]
    scrydex = cfg.get("scrydexId", set_id)
    card = {
        "id": f"{set_id}-{number}",
        "name": detail.get("name", ""),
        "number": number,
        "rarity": RARITY_ALIASES.get(detail.get("rarity", ""), detail.get("rarity", "")),
        "supertype": detail.get("superType", ""),
    }
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
    card["image"] = f"https://images.scrydex.com/pokemon/{scrydex}-{number}/large"
    card["imageSmall"] = f"https://images.scrydex.com/pokemon/{scrydex}-{number}/small"
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
    # Older sets come back as a flat photo on a white backdrop rather than an
    # isolated wrapper. On the dark site that reads as a pack in a white box,
    # so cut it out before it ships. A wrapper that already has alpha is
    # left alone.
    try:
        from cut_pack_art import run as cut_pack_art

        cut_pack_art(cfg["id"])
    except Exception as exc:  # noqa: BLE001 - the art is downloaded either way
        print(f"    pack art not cut out ({type(exc).__name__}: {exc})")
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


def build(set_id: str, refresh: bool) -> int:
    cfg_path = SETS / f"{set_id}.json"
    if not cfg_path.exists():
        print(f"  no data/sets/{set_id}.json — skipped")
        return 1
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    base = f"https://www.pkmn.gg/series/{cfg['series']}/{cfg['slug']}"
    listing = page_data(fetch(base, f"{set_id}-set", refresh))
    print(f"  checklist: {len(listing)} cards")

    out_path = DATA / f"{set_id}.json"
    existing = {}
    if out_path.exists():
        existing = {c["id"]: c for c in json.loads(out_path.read_text(encoding="utf-8"))}

    cards = []
    seen = set()
    for index, row in enumerate(listing, start=1):
        number = str(row.get("number", "")).strip()
        if not number or number in seen:
            continue
        seen.add(number)
        detail = page_data(fetch(f"{base}/{number}", f"{set_id}-{number}", refresh))
        if isinstance(detail, list):  # a listing page came back; skip rather than guess
            print(f"    #{number}: unexpected page shape, skipped")
            continue
        card = card_record(cfg, detail)
        cards.append(ordered(merge(existing.get(card["id"]), card)))
        if index % 25 == 0:
            print(f"    {index}/{len(listing)}…")

    cards.sort(key=lambda c: (len(c["number"]), c["number"]))
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
