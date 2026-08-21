"""Fill Perfect Order (me3.json) attacks/abilities/HP from Limitless POR pages.

Keep existing ids, rarities, and Scrydex image URLs. Do not invent card text.
"""
from __future__ import annotations

import html as htmlmod
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "me3.json"
CACHE = ROOT / "scripts" / ".cache" / "por"

SYMBOL = {
    "G": "Grass",
    "R": "Fire",
    "W": "Water",
    "L": "Lightning",
    "P": "Psychic",
    "F": "Fighting",
    "D": "Darkness",
    "M": "Metal",
    "Y": "Fairy",
    "C": "Colorless",
    "N": "Dragon",
}

ENERGY_SPAN = re.compile(
    r'<span class="copy-only">\[</span>'
    r'<span style="font-family: ptcg-font" data-tooltip="([^"]+)">.</span>'
    r'<span class="copy-only">\]</span>',
    re.I,
)
CARD_TEXT = re.compile(
    r'<div class="card-text">(.*?)</div>\s*<div class="card-legality">',
    re.S,
)
TITLE = re.compile(r'<p class="card-text-title">(.*?)</p>', re.S)
NAME = re.compile(r'<span class="card-text-name">.*?</span>', re.S)
TYPE_LINE = re.compile(r'<p class="card-text-type">(.*?)</p>', re.S)
ARTIST = re.compile(
    r'<div class="card-text-section card-text-artist">.*?Illustrated by\s*(.*?)</div>',
    re.S,
)
ABILITY = re.compile(
    r'<div class="card-text-ability(?:\s[^"]*)?">\s*'
    r'<p class="card-text-ability-info">(.*?)</p>\s*'
    r'<p class="card-text-ability-effect">(.*?)</p>',
    re.S,
)
ATTACK = re.compile(
    r'<div class="card-text-attack(?:\s[^"]*)?">\s*'
    r'<p class="card-text-attack-info">(.*?)</p>\s*'
    r'<p class="card-text-attack-effect">(.*?)</p>',
    re.S,
)
SECTION = re.compile(r'<div class="card-text-section(?:\s[^"]*)?">(.*?)</div>', re.S)
PTCG = re.compile(r'<span class="ptcg-symbol">([^<]*)</span>')
DAMAGE = re.compile(r"^(.+?)\s+(\d+[×x+]*)$")
HP = re.compile(r"^(\d+)\s*HP$", re.I)


def fetch(n: int) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{n:03d}.html"
    if path.exists() and path.stat().st_size > 800:
        return path.read_text(encoding="utf-8")
    url = f"https://limitlesstcg.com/cards/en/POR/{n}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "poke-pack.rip/enrich-me3 (personal fan project)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    path.write_text(body, encoding="utf-8")
    time.sleep(0.18)
    return body


def plain(chunk: str) -> str:
    chunk = ENERGY_SPAN.sub(lambda m: f"[{m.group(1)}]", chunk)
    chunk = re.sub(r'<span class="reminder-text">(.*?)</span>', r"\1", chunk, flags=re.S)
    chunk = re.sub(r"<br\s*/?>", "\n", chunk, flags=re.I)
    chunk = re.sub(r"<[^>]+>", " ", chunk)
    chunk = htmlmod.unescape(chunk)
    return re.sub(r"\s+", " ", chunk).strip()


def costs(info: str) -> list[str]:
    out: list[str] = []
    for match in PTCG.finditer(info):
        for ch in match.group(1).strip():
            name = SYMBOL.get(ch)
            if name:
                out.append(name)
    return out


def attack_name_damage(info: str) -> tuple[str, str]:
    rest = PTCG.sub("", info)
    rest = plain(rest)
    match = DAMAGE.match(rest)
    if match:
        return match.group(1).strip(), match.group(2).replace("x", "×")
    return rest, ""


def parse_title(block: str) -> tuple[str, list[str], str | None]:
    title = TITLE.search(block)
    if not title:
        return "", [], None
    html = title.group(1)
    name_html = NAME.search(html)
    name = plain(name_html.group(0)) if name_html else ""
    rest = NAME.sub("", html)
    types: list[str] = []
    hp = None
    for part in (p.strip(" -") for p in plain(rest).split("-")):
        part = part.strip()
        if not part:
            continue
        hit = HP.match(part)
        if hit:
            hp = hit.group(1)
        else:
            types.append(part)
    return name, types, hp


def parse_type_line(block: str) -> tuple[str, list[str], str | None]:
    line = TYPE_LINE.search(block)
    if not line:
        return "", [], None
    text = plain(line.group(1))
    parts = [p.strip() for p in text.split("-") if p.strip()]
    if not parts:
        return "", [], None
    supertype = parts[0]
    subtypes: list[str] = []
    evolves = None
    for part in parts[1:]:
        if part.lower().startswith("evolves from"):
            evolves = part[12:].strip()
        else:
            subtypes.append(part)
    return supertype, subtypes, evolves


def parse_artist(block: str) -> str | None:
    match = ARTIST.search(block)
    if not match:
        return None
    name = plain(match.group(1))
    return name or None


NESTED = re.compile(
    r'<div class="card-text-(?:ability|attack)(?:\s[^"]*)?">.*?</div>',
    re.S,
)
PREAMBLE = re.compile(
    r'<p class="card-text-type">.*?</p>\s*</div>\s*'
    r'<div class="card-text-section">\s*(.*?)\s*'
    r'(?:<div class="card-text-(?:ability|attack)|</div>)',
    re.S,
)


def leftover_rules(block: str) -> str:
    match = PREAMBLE.search(block)
    if not match:
        return ""
    body = NESTED.sub("", match.group(1))
    return plain(body)


def parse_page(src: str) -> dict:
    block_match = CARD_TEXT.search(src)
    if not block_match:
        raise ValueError("no card-text block")
    block = block_match.group(1)
    name, types, hp = parse_title(block)
    supertype, subtypes, evolves = parse_type_line(block)
    subtypes = tidy_mega(name, subtypes)

    abilities = []
    for info, effect in ABILITY.findall(block):
        label = re.sub(r"^Ability:\s*", "", plain(info), flags=re.I)
        abilities.append({"name": label, "text": plain(effect), "type": "Ability"})

    attacks = []
    for info, effect in ATTACK.findall(block):
        atk_name, damage = attack_name_damage(info)
        attacks.append(
            {
                "name": atk_name,
                "cost": costs(info),
                "damage": damage,
                "text": plain(effect),
            }
        )

    rules = leftover_rules(block)
    if rules:
        tag = subtypes[0] if subtypes else supertype
        preamble = {"name": tag, "cost": [], "damage": "", "text": rules}
        if not attacks and not abilities:
            attacks.append(preamble)
        elif supertype == "Trainer" and not any(a.get("text") == rules for a in attacks):
            attacks.insert(0, preamble)

    out: dict = {
        "name": name,
        "supertype": supertype,
        "subtypes": subtypes,
    }
    if types and supertype == "Pokémon":
        out["types"] = types
    if hp:
        out["hp"] = hp
    artist = parse_artist(block)
    if artist:
        out["artist"] = artist
    if evolves:
        out["evolvesFrom"] = evolves
    if attacks:
        out["attacks"] = attacks
    if abilities:
        out["abilities"] = abilities
    return out


def tidy_mega(name: str, subtypes: list[str]) -> list[str]:
    tags = list(subtypes)
    if name.startswith("Mega ") and "Mega" not in tags:
        stage = next((t for t in tags if t.startswith("Stage") or t == "Basic"), None)
        if stage:
            i = tags.index(stage) + 1
            tags.insert(i, "Mega")
        else:
            tags.insert(0, "Mega")
    if name.endswith(" ex") and "ex" not in tags:
        tags.append("ex")
    return tags


ORDER = (
    "id",
    "name",
    "number",
    "rarity",
    "supertype",
    "subtypes",
    "types",
    "hp",
    "artist",
    "flavorText",
    "evolvesFrom",
    "image",
    "imageSmall",
    "attacks",
    "abilities",
)


def merge_card(base: dict, extra: dict) -> dict:
    extra["subtypes"] = tidy_mega(extra.get("name") or base["name"], extra.get("subtypes") or [])
    extra["subtypes"] = ["Special" if t == "Special Energy" else t for t in extra["subtypes"]]
    merged = {
        "id": base["id"],
        "name": extra.get("name") or base["name"],
        "number": base["number"],
        "rarity": base["rarity"],
        "supertype": extra.get("supertype") or base["supertype"],
        "subtypes": extra.get("subtypes") or base.get("subtypes") or [],
        "image": base["image"],
        "imageSmall": base["imageSmall"],
    }
    for key in ("types", "hp", "artist", "flavorText", "evolvesFrom", "attacks", "abilities"):
        if extra.get(key):
            merged[key] = extra[key]
        elif base.get(key):
            merged[key] = base[key]
    return {k: merged[k] for k in ORDER if k in merged}


def main() -> None:
    cards = json.loads(DATA.read_text(encoding="utf-8"))
    out = []
    failures = []
    for card in cards:
        n = int(card["number"])
        try:
            extra = parse_page(fetch(n))
            merged = merge_card(card, extra)
            if merged["supertype"] == "Pokémon" and not merged.get("attacks") and not merged.get("abilities"):
                failures.append((n, "pokemon missing attacks"))
            out.append(merged)
            print(f"{n:3d} {merged['name']:28s} atk={len(merged.get('attacks') or [])} ab={len(merged.get('abilities') or [])}")
        except Exception as exc:
            failures.append((n, str(exc)))
            out.append(card)
            print(f"{n:3d} FAIL {exc}")
    DATA.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {DATA} ({len(out)} cards, {len(failures)} issues)")
    for n, msg in failures:
        print(f"  POR/{n}: {msg}")


if __name__ == "__main__":
    main()
