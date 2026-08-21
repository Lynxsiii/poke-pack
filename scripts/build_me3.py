"""Build data/me3.json skeleton and download Perfect Order pack art.

Names and rarities come from the public Perfect Order checklist
(pokemoncardscanner.app/sets/me3, matching Pokemon's POR PDF).
Images are the same Scrydex scans the live Mega Evolution sets already use.
Card text (attacks, abilities, HP, artist) is filled by enrich_me3.py from
Limitless POR pages — this script keeps those fields if they already exist.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "me3.json"
PACK_DIR = ROOT / "assets" / "packs" / "me3"

# (number, name, rarity) — collector order 1..124
CARDS = [
    (1, "Spinarak", "Common"),
    (2, "Ariados", "Common"),
    (3, "Shaymin", "Uncommon"),
    (4, "Snivy", "Common"),
    (5, "Servine", "Common"),
    (6, "Serperior", "Rare"),
    (7, "Scatterbug", "Common"),
    (8, "Spewpa", "Common"),
    (9, "Vivillon", "Uncommon"),
    (10, "Rowlet", "Common"),
    (11, "Dartrix", "Common"),
    (12, "Decidueye ex", "Double Rare"),
    (13, "Fletchinder", "Common"),
    (14, "Talonflame", "Uncommon"),
    (15, "Salandit", "Common"),
    (16, "Salazzle ex", "Double Rare"),
    (17, "Turtonator", "Uncommon"),
    (18, "Seel", "Common"),
    (19, "Dewgong", "Rare"),
    (20, "Staryu", "Common"),
    (21, "Mega Starmie ex", "Double Rare"),
    (22, "Lapras ex", "Double Rare"),
    (23, "Amaura", "Common"),
    (24, "Aurorus", "Rare"),
    (25, "Volcanion", "Uncommon"),
    (26, "Shinx", "Common"),
    (27, "Luxio", "Uncommon"),
    (28, "Luxray", "Rare"),
    (29, "Dedenne", "Common"),
    (30, "Clefairy", "Common"),
    (31, "Mega Clefable ex", "Double Rare"),
    (32, "Mawile", "Common"),
    (33, "Espurr", "Common"),
    (34, "Meowstic", "Uncommon"),
    (35, "Spritzee", "Common"),
    (36, "Aromatisse", "Uncommon"),
    (37, "Nosepass", "Common"),
    (38, "Probopass", "Common"),
    (39, "Hippopotas", "Common"),
    (40, "Hippowdon", "Uncommon"),
    (41, "Landorus", "Rare"),
    (42, "Binacle", "Common"),
    (43, "Barbaracle", "Uncommon"),
    (44, "Tyrunt", "Common"),
    (45, "Tyrantrum", "Rare"),
    (46, "Hawlucha", "Common"),
    (47, "Mega Zygarde ex", "Double Rare"),
    (48, "Gastly", "Common"),
    (49, "Haunter", "Common"),
    (50, "Gengar", "Rare"),
    (51, "Skorupi", "Common"),
    (52, "Drapion", "Uncommon"),
    (53, "Yveltal ex", "Double Rare"),
    (54, "Chien-Pao", "Rare"),
    (55, "Mega Skarmory ex", "Double Rare"),
    (56, "Honedge", "Common"),
    (57, "Doublade", "Common"),
    (58, "Aegislash", "Uncommon"),
    (59, "Klefki", "Common"),
    (60, "Rattata", "Common"),
    (61, "Raticate", "Uncommon"),
    (62, "Meowth ex", "Double Rare"),
    (63, "Snorlax", "Common"),
    (64, "Bunnelby", "Common"),
    (65, "Diggersby", "Uncommon"),
    (66, "Fletchling", "Common"),
    (67, "Furfrou", "Common"),
    (68, "Antique Jaw Fossil", "Common"),
    (69, "Antique Sail Fossil", "Common"),
    (70, "Core Memory", "Uncommon"),
    (71, "Crushing Hammer", "Common"),
    (72, "Energy Search", "Common"),
    (73, "Energy Swatter", "Uncommon"),
    (74, "Hole-Digging Shovel", "Common"),
    (75, "Jacinthe", "Uncommon"),
    (76, "Judge", "Uncommon"),
    (77, "Lumiose City", "Uncommon"),
    (78, "Lumiose Galette", "Uncommon"),
    (79, "Naveen", "Uncommon"),
    (80, "Poké Ball", "Common"),
    (81, "Poké Pad", "Uncommon"),
    (82, "Pokémon Catcher", "Common"),
    (83, "Potion", "Common"),
    (84, "Rosa's Encouragement", "Uncommon"),
    (85, "Tarragon", "Uncommon"),
    (86, "Growing Grass Energy", "Rare"),
    (87, "Rocky Fighting Energy", "Rare"),
    (88, "Telepathic Psychic Energy", "Rare"),
    (89, "Spewpa", "Illustration Rare"),
    (90, "Rowlet", "Illustration Rare"),
    (91, "Talonflame", "Illustration Rare"),
    (92, "Aurorus", "Illustration Rare"),
    (93, "Dedenne", "Illustration Rare"),
    (94, "Clefairy", "Illustration Rare"),
    (95, "Espurr", "Illustration Rare"),
    (96, "Probopass", "Illustration Rare"),
    (97, "Drapion", "Illustration Rare"),
    (98, "Doublade", "Illustration Rare"),
    (99, "Raticate", "Illustration Rare"),
    (100, "Decidueye ex", "Ultra Rare"),
    (101, "Salazzle ex", "Ultra Rare"),
    (102, "Mega Starmie ex", "Ultra Rare"),
    (103, "Mega Clefable ex", "Ultra Rare"),
    (104, "Mega Zygarde ex", "Ultra Rare"),
    (105, "Yveltal ex", "Ultra Rare"),
    (106, "Mega Skarmory ex", "Ultra Rare"),
    (107, "Meowth ex", "Ultra Rare"),
    (108, "Energy Recycler", "Ultra Rare"),
    (109, "Forest of Vitality", "Ultra Rare"),
    (110, "Jacinthe", "Ultra Rare"),
    (111, "Lumiose City", "Ultra Rare"),
    (112, "Naveen", "Ultra Rare"),
    (113, "Poké Pad", "Ultra Rare"),
    (114, "Rosa's Encouragement", "Ultra Rare"),
    (115, "Sacred Ash", "Ultra Rare"),
    (116, "Tarragon", "Ultra Rare"),
    (117, "Wondrous Patch", "Ultra Rare"),
    (118, "Mega Starmie ex", "Special Illustration Rare"),
    (119, "Mega Clefable ex", "Special Illustration Rare"),
    (120, "Mega Zygarde ex", "Special Illustration Rare"),
    (121, "Meowth ex", "Special Illustration Rare"),
    (122, "Jacinthe", "Special Illustration Rare"),
    (123, "Rosa's Encouragement", "Special Illustration Rare"),
    (124, "Mega Zygarde ex", "Mega Hyper Rare"),
]

TRAINERS = {
    "Antique Jaw Fossil",
    "Antique Sail Fossil",
    "Core Memory",
    "Crushing Hammer",
    "Energy Search",
    "Energy Swatter",
    "Hole-Digging Shovel",
    "Jacinthe",
    "Judge",
    "Lumiose City",
    "Lumiose Galette",
    "Naveen",
    "Poké Ball",
    "Poké Pad",
    "Pokémon Catcher",
    "Potion",
    "Rosa's Encouragement",
    "Tarragon",
    "Energy Recycler",
    "Forest of Vitality",
    "Sacred Ash",
    "Wondrous Patch",
}

PACKS = [
    ("clefable", "perfect-order-pack-0.avif"),
    ("starmie", "perfect-order-pack-1.avif"),
    ("zygarde", "perfect-order-pack-2.avif"),
    ("meowth", "perfect-order-pack-3.avif"),
]

ART_BASE = "https://pokesymbols.com/images/tcg/sets/booster-pack-art/"


def supertype(name: str) -> str:
    if name.endswith(" Energy"):
        return "Energy"
    if name in TRAINERS:
        return "Trainer"
    return "Pokémon"


def subtypes(name: str, kind: str) -> list[str]:
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
                "id": f"me3-{number}",
                "name": name,
                "number": str(number),
                "rarity": rarity,
                "supertype": kind,
                "subtypes": subtypes(name, kind),
                "image": f"https://images.scrydex.com/pokemon/me3-{number}/large",
                "imageSmall": f"https://images.scrydex.com/pokemon/me3-{number}/small",
            }
        )
    return out


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "poke-pack.rip/me3-build"})
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
