"""Build data/me4.json skeleton and download Chaos Rising pack art.

Names and rarities come from the public Chaos Rising checklist
(pokemoncardscanner.app/sets/me4, matching Pokemon's ME04 PDF).
Images are the same Scrydex scans the live Pitch Black set already uses.
Card text (attacks, abilities, HP, artist) is filled by enrich_me4.py from
Limitless CRI pages — this script keeps those fields if they already exist.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "me4.json"
PACK_DIR = ROOT / "assets" / "packs" / "me4"

# (number, name, rarity) — collector order 1..122
CARDS = [
    (1, "Weedle", "Common"),
    (2, "Kakuna", "Common"),
    (3, "Beedrill ex", "Double Rare"),
    (4, "Carnivine", "Common"),
    (5, "Chespin", "Common"),
    (6, "Quilladin", "Common"),
    (7, "Chesnaught", "Rare"),
    (8, "Vulpix", "Common"),
    (9, "Ninetales", "Uncommon"),
    (10, "Ho-Oh", "Rare"),
    (11, "Fennekin", "Common"),
    (12, "Braixen", "Common"),
    (13, "Delphox", "Rare"),
    (14, "Litleo", "Common"),
    (15, "Mega Pyroar ex", "Double Rare"),
    (16, "Remoraid", "Common"),
    (17, "Octillery", "Common"),
    (18, "Delibird", "Uncommon"),
    (19, "Keldeo", "Rare"),
    (20, "Froakie", "Common"),
    (21, "Frogadier", "Common"),
    (22, "Mega Greninja ex", "Double Rare"),
    (23, "Bergmite", "Common"),
    (24, "Avalugg", "Uncommon"),
    (25, "Wimpod", "Common"),
    (26, "Golisopod", "Uncommon"),
    (27, "Mareep", "Common"),
    (28, "Flaaffy", "Common"),
    (29, "Ampharos", "Rare"),
    (30, "Emolga", "Common"),
    (31, "Deoxys", "Uncommon"),
    (32, "Deoxys", "Uncommon"),
    (33, "Deoxys", "Uncommon"),
    (34, "Deoxys", "Uncommon"),
    (35, "Mega Floette ex", "Double Rare"),
    (36, "Espurr", "Common"),
    (37, "Meowstic", "Uncommon"),
    (38, "Phantump", "Common"),
    (39, "Trevenant", "Rare"),
    (40, "Pumpkaboo", "Common"),
    (41, "Gourgeist ex", "Double Rare"),
    (42, "Xerneas", "Rare"),
    (43, "Sudowoodo", "Uncommon"),
    (44, "Phanpy", "Common"),
    (45, "Donphan", "Common"),
    (46, "Baltoy", "Common"),
    (47, "Claydol", "Uncommon"),
    (48, "Mega Gallade ex", "Double Rare"),
    (49, "Zubat", "Common"),
    (50, "Golbat", "Common"),
    (51, "Crobat", "Rare"),
    (52, "Qwilfish", "Common"),
    (53, "Stunky", "Common"),
    (54, "Skuntank", "Uncommon"),
    (55, "Krookodile ex", "Double Rare"),
    (56, "Trubbish", "Common"),
    (57, "Garbodor", "Uncommon"),
    (58, "Skrelp", "Common"),
    (59, "Beldum", "Common"),
    (60, "Metang", "Common"),
    (61, "Metagross", "Uncommon"),
    (62, "Ferroseed", "Common"),
    (63, "Ferrothorn", "Uncommon"),
    (64, "Cobalion ex", "Double Rare"),
    (65, "Mega Dragalge ex", "Double Rare"),
    (66, "Goomy", "Common"),
    (67, "Sliggoo", "Common"),
    (68, "Goodra", "Rare"),
    (69, "Tauros", "Uncommon"),
    (70, "Patrat", "Common"),
    (71, "Watchog", "Common"),
    (72, "Minccino", "Common"),
    (73, "Cinccino ex", "Double Rare"),
    (74, "Adversity Policy", "Uncommon"),
    (75, "Ange Floette", "Uncommon"),
    (76, "AZ's Tranquility", "Uncommon"),
    (77, "Emma", "Uncommon"),
    (78, "Great Haul Net", "Uncommon"),
    (79, "Philippe", "Uncommon"),
    (80, "Prism Tower", "Uncommon"),
    (81, "Roxie's Performance", "Uncommon"),
    (82, "Special Red Card", "Uncommon"),
    (83, "Transformation Tome", "Uncommon"),
    (84, "Bubbly Water Energy", "Rare"),
    (85, "Magnetic Metal Energy", "Rare"),
    (86, "Nitro Fire Energy", "Rare"),
    (87, "Chespin", "Illustration Rare"),
    (88, "Froakie", "Illustration Rare"),
    (89, "Frogadier", "Illustration Rare"),
    (90, "Ampharos", "Illustration Rare"),
    (91, "Xerneas", "Illustration Rare"),
    (92, "Claydol", "Illustration Rare"),
    (93, "Crobat", "Illustration Rare"),
    (94, "Metang", "Illustration Rare"),
    (95, "Sliggoo", "Illustration Rare"),
    (96, "Tauros", "Illustration Rare"),
    (97, "Watchog", "Illustration Rare"),
    (98, "Beedrill ex", "Ultra Rare"),
    (99, "Mega Pyroar ex", "Ultra Rare"),
    (100, "Mega Greninja ex", "Ultra Rare"),
    (101, "Mega Floette ex", "Ultra Rare"),
    (102, "Gourgeist ex", "Ultra Rare"),
    (103, "Cobalion ex", "Ultra Rare"),
    (104, "Mega Dragalge ex", "Ultra Rare"),
    (105, "Cinccino ex", "Ultra Rare"),
    (106, "AZ's Tranquility", "Ultra Rare"),
    (107, "Emma", "Ultra Rare"),
    (108, "Energy Retrieval", "Ultra Rare"),
    (109, "Jumbo Ice Cream", "Ultra Rare"),
    (110, "Philippe", "Ultra Rare"),
    (111, "Prism Tower", "Ultra Rare"),
    (112, "Roxie's Performance", "Ultra Rare"),
    (113, "Special Red Card", "Ultra Rare"),
    (114, "Surfing Beach", "Ultra Rare"),
    (115, "Tool Scrapper", "Ultra Rare"),
    (116, "Mega Greninja ex", "Special Illustration Rare"),
    (117, "Mega Floette ex", "Special Illustration Rare"),
    (118, "Mega Dragalge ex", "Special Illustration Rare"),
    (119, "Cinccino ex", "Special Illustration Rare"),
    (120, "AZ's Tranquility", "Special Illustration Rare"),
    (121, "Roxie's Performance", "Special Illustration Rare"),
    (122, "Mega Greninja ex", "Mega Hyper Rare"),
]

TRAINERS = {
    "Adversity Policy",
    "Ange Floette",
    "AZ's Tranquility",
    "Emma",
    "Great Haul Net",
    "Philippe",
    "Prism Tower",
    "Roxie's Performance",
    "Special Red Card",
    "Transformation Tome",
    "Energy Retrieval",
    "Jumbo Ice Cream",
    "Surfing Beach",
    "Tool Scrapper",
}

PACKS = [
    ("dragalge", "chaos-rising-pack-0.avif"),
    ("floette", "chaos-rising-pack-1.avif"),
    ("greninja", "chaos-rising-pack-2.avif"),
    ("pyroar", "chaos-rising-pack-3.avif"),
]

ART_BASE = "https://pokesymbols.com/images/tcg/sets/booster-pack-art/"


def supertype(name: str) -> str:
    if name.endswith(" Energy"):
        return "Energy"
    if name in TRAINERS:
        return "Trainer"
    return "Pokémon"


def subtypes(name: str, kind: str) -> list[str]:
    # Only tags that are in the printed name — don't guess Item vs Supporter.
    if kind != "Pokémon":
        return []
    tags = []
    if name.startswith("Mega "):
        tags.append("Mega")
    if name.endswith(" ex"):
        tags.append("ex")
    return tags


def build_cards() -> list[dict]:
    out = []
    for number, name, rarity in CARDS:
        kind = supertype(name)
        out.append(
            {
                "id": f"me4-{number}",
                "name": name,
                "number": str(number),
                "rarity": rarity,
                "supertype": kind,
                "subtypes": subtypes(name, kind),
                "image": f"https://images.scrydex.com/pokemon/me4-{number}/large",
                "imageSmall": f"https://images.scrydex.com/pokemon/me4-{number}/small",
            }
        )
    return out


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "poke-pack.rip/me4-build"})
    with urllib.request.urlopen(req, timeout=30) as src, dest.open("wb") as out:
        shutil.copyfileobj(src, out)


def to_png(avif: Path, png: Path) -> bool:
    try:
        from PIL import Image
        Image.open(avif).save(png)
        return True
    except Exception:
        pass
    magick = shutil.which("magick")
    if magick and Path(magick).name.lower() != "convert.exe":
        subprocess.check_call([magick, str(avif), str(png)])
        return True
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        subprocess.check_call(
            [ffmpeg, "-y", "-i", str(avif), str(png)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    return False


KEEP = (
    "types",
    "hp",
    "artist",
    "flavorText",
    "evolvesFrom",
    "attacks",
    "abilities",
    "subtypes",
    "supertype",
)


def merge_existing(cards: list[dict]) -> list[dict]:
    if not DATA.exists():
        return cards
    prior = {c["id"]: c for c in json.loads(DATA.read_text(encoding="utf-8"))}
    out = []
    for card in cards:
        old = prior.get(card["id"]) or {}
        merged = dict(card)
        for key in KEEP:
            if old.get(key):
                merged[key] = old[key]
        out.append(merged)
    return out


def main() -> None:
    cards = merge_existing(build_cards())
    DATA.write_text(json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {DATA} ({len(cards)} cards)")

    PACK_DIR.mkdir(parents=True, exist_ok=True)
    for name, remote in PACKS:
        avif = PACK_DIR / f"{name}.avif"
        png = PACK_DIR / f"{name}.png"
        download(ART_BASE + remote, avif)
        print(f"downloaded {avif.name} ({avif.stat().st_size} bytes)")
        if to_png(avif, png):
            print(f"  png {png.stat().st_size} bytes")
        else:
            print("  no magick/ffmpeg — png fallback skipped")


if __name__ == "__main__":
    main()
