"""Sun & Moon Build & Battle Box / Prerelease Kit Evolution packs, from Bulbapedia.

Every Sun & Moon Prerelease Kit (sm1-sm4: "<set> Prerelease Kit", sm5, sm7-sm12: "<set> Build & Battle Box")
holds four booster packs and a 23-card Evolution pack: the group of cards that goes with the stamped promo
the box came with, a second group picked at random from the other three, and random Trainers
(no more than 2 copies of one). Bulbapedia's page for each kit lists the groups and the Trainer pool:

    python3 scripts/box-research/sm_bnb.py sm10 sm11 > /tmp/bnb.json      # entries for sun-moon.json "buildBattle"
    python3 scripts/box-research/sm_bnb.py --all                          # every set with a page

Bulbapedia is the only card-level source found for these lists (pokemon.com and TCGplayer give the structure
only), so each entry is written with "confidence": "single-source" and build_box_contents.py holds it back until
a second source makes it "verified" (see reference/sun-moon-box-contents.md). Cards of sets outside Sun & Moon
(XY) are not on the site: they go in "missing". Reads the wiki through its API (the page itself 403s).
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request

API = "https://bulbapedia.bulbagarden.net/w/api.php"
SETS = {
    "Sun & Moon": "sm1", "Guardians Rising": "sm2", "Burning Shadows": "sm3", "Shining Legends": "sm35",
    "Crimson Invasion": "sm4", "Ultra Prism": "sm5", "Forbidden Light": "sm6", "Celestial Storm": "sm7",
    "Dragon Majesty": "sm75", "Lost Thunder": "sm8", "Team Up": "sm9", "Unbroken Bonds": "sm10",
    "Unified Minds": "sm11", "Hidden Fates": "sm115", "Cosmic Eclipse": "sm12",
}
# set id -> (Bulbapedia page, TCGplayer product id of the Prerelease Kit / Build & Battle Box)
PAGES = {
    "sm1": ("Sun & Moon Prerelease Kit", 206409), "sm2": ("Guardians Rising Prerelease Kit", 131273),
    "sm3": ("Burning Shadows Prerelease Kit", 139888), "sm4": ("Crimson Invasion Prerelease Kit", 153081),
    "sm5": ("Ultra Prism Prerelease Kit", None), "sm6": ("Forbidden Light Build & Battle Box", None),
    "sm7": ("Celestial Storm Build & Battle Box", 170280), "sm8": ("Lost Thunder Build & Battle Box", 179423),
    "sm9": ("Team Up Build & Battle Box", 183975), "sm10": ("Unbroken Bonds Build & Battle Box", 189823),
    "sm11": ("Unified Minds Build & Battle Box", 195612), "sm12": ("Cosmic Eclipse Build & Battle Box", 199310),
}


def wikitext(title: str) -> str:
    url = API + "?" + urllib.parse.urlencode({"action": "parse", "page": title + " (TCG)", "prop": "wikitext", "format": "json", "redirects": 1})
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "poke-pack-research"}), timeout=60) as r:
        return json.load(r)["parse"]["wikitext"]["*"]


def entry(set_id: str, title: str, tcg_id: int | None) -> dict:
    text = wikitext(title)
    promos = {name.lower(): int(num) for name, num in re.findall(r"\{\{TCG ID\|SM Promo\|([^|}]+)\|(\d+)\}\}", text)}
    groups: list[dict] = []
    pool: dict[str, dict] = {}
    missing: list[dict] = []
    current = None
    for line in text.splitlines():
        head = re.match(r"\{\{Halfdecklist/nmheader\|title=([^|}]+)", line)
        if head:
            title_ = head.group(1).strip()
            current = {"name": re.sub(r"\s+group$", "", title_, flags=re.I), "cards": []} if re.search(r"group$", title_, re.I) else {"pool": True}
            if "pool" not in current:
                groups.append(current)
            continue
        row = re.match(r"\{\{Halfdecklist/nmentry\|[^|]*\|\{\{TCG ID\|([^|}]+)\|([^|}]+)\|([^|}]+)\}\}\|(.*)\}\}\s*$", line)
        if not row or current is None:
            continue
        expansion, name, number, rest = row.groups()
        count = rest.split("|")[-1].strip()
        lo, _, hi = count.partition("-")
        n = int(hi or lo)
        set_ = SETS.get(expansion)
        if not set_:
            missing.append({"name": name, "set": expansion, "number": number, "n": n})
            continue
        card = f"{set_}-{number}"
        if "pool" in current:
            pool[card] = {"id": card, "name": name, "max": n}
        else:
            current["cards"].append({"id": card, "name": name, "n": n})
    for g in groups:
        g["promo"] = promos.get(g["name"].lower())
    return {
        "set": set_id,
        "tcgplayerId": tcg_id,
        "name": title,
        "total": 23,
        "groups": groups,
        "pool": list(pool.values()),
        "missing": missing,
        "confidence": "single-source",
        "sources": [{"url": "https://bulbapedia.bulbagarden.net/wiki/" + urllib.parse.quote(title.replace(" ", "_") + "_(TCG)"), "quote": "Each box included two of the following four groups, one always coinciding with the prerelease promo, plus random Trainers (max 2 of each)"}],
    }


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--all" in sys.argv:
        args = list(PAGES)
    if not args:
        raise SystemExit(__doc__)
    print(json.dumps([entry(s, *PAGES[s]) for s in args], indent=1, ensure_ascii=False))
