"""Build the Scarlet & Violet side sets: packs that are not expansions.

Trick or Trade BOOster Bundles (tot23, tot24) and McDonald's Happy Meal
promos (mcd23, mcd24) are small sets sold as their own packs, and the
Scarlet & Violet Energies (sve) are the basic Energy printed for the era.
None of them fits build_set.py, so each is declared in data/sets/<id>.json
with `"side": true` and a `cards` list, the checklist in order:

    {
      "id": "tot23", "side": true, "tcgplayerGroup": 23266,
      "cards": [
        { "from": "sword-shield/lost-origin/16", "printedNumber": "016/196",
          "tcgplayerId": 515647 },
        { "from": "sword-shield/lost-origin/17", "printedNumber": "017/196",
          "tcgplayerId": 515648, "holo": true, "foilAs": "Rare" }
      ]
    }

Card N of the list is `<id>-N` (or `<id>-<stem>` with a `stem`).

  * `from` reprints the pkmn.gg card at <series>/<slug>/<number>: its text
    and rarity come from there and its scan is its own TCGplayer photo,
    because Trick or Trade's stamped prints have no scan host.
  * `number` reads the card from the set's own pkmn.gg checklist (`series`
    and `slug` in the config), scanned by Scrydex (`scrydexId`).
  * `like` is another printing of a card already on the list (an Energy's
    Cosmos Holo), with its own scan (`image`, else the TCGplayer photo).
  * `holo` marks the prints that come foil, which is how these packs are
    filled (the `holo` and `plain` pools in js/engine.js). `foilAs` names
    the rarity whose foil recipe the print borrows, as promos do (foilLook()
    in js/app.js).
  * `tcgl` names the TCG Live print whose foil map this print shares
    ("svalt/sv3_en_136_alt", "sv1/sv1_en_122_std"), and `border` adds the
    silver border to it, for the finishes that foil the border too (the
    McDonald's confetti, the Trick or Trade 2024 cosmos). The mask ships as
    assets/foil/maps/<id>/<stem>.webp and lands on the card as `foilMap`.

Every card is priced at the TCGplayer market price of its own print
(Holofoil for a holo, Normal otherwise) and keeps its `tcgplayerId`. Scans
are mirrored to assets/cards/<id>/ at the site's two sizes. `sealed` maps
data/sealed.json keys to TCGplayer listings ({"boosterPack": 505945}, the
single mini pack). Products (the bundles) are built by build_products.py
from the same config's `products`.

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
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_set import card_record, fetch, ordered, page_data  # noqa: E402
from mirror_images import replace_scan  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETS = DATA / "sets"
SEALED = DATA / "sealed.json"
CACHE = ROOT / "scripts" / ".cache" / "side-sets"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip side set builder"
TCGCSV = "https://tcgcsv.com/tcgplayer/3/{group}/{what}"
TCG_IMAGE = "https://tcgplayer-cdn.tcgplayer.com/product/{id}_in_1000x1000.jpg"
TCGL_FOIL = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{path}.foil.png"
PKMN = "https://www.pkmn.gg/series/{path}"

# The inside edge of the silver border on a 367x512 TCG Live map, measured
# on a Cosmos Holo print whose map foils the border (svalt Darkrai 136/197).
BORDER_INNER = (14, 14, 351, 498)  # left, top, right, bottom (exclusive)
# The Scarlet & Violet art window on the same maps (Klawf, Dragonite and
# Mimikyu SV_HOLO prints agree to a pixel), and the print whose outline a
# synthetic window mask is cut to.
ART_WINDOW = (28, 50, 338, 243)
OUTLINE_MAP = "sv1/sv1_en_122_std"

# Fields this script sets from the config; a rebuild drops them from a card
# whose config no longer has them.
SPEC_FIELDS = ("printedNumber", "holo", "foilAs", "variant", "tcgplayerId", "promo")


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


def pkmn_card(path: str, refresh: bool) -> dict:
    """A card's pkmn.gg record, from "<series>/<slug>/<number>"."""
    return page_data(fetch(PKMN.format(path=path), "side-" + path.replace("/", "-"), refresh))


def new_record(cfg: dict, stem: str, spec: dict, built: dict[str, dict], refresh: bool) -> tuple[dict, str]:
    """A card built from scratch, and the URL of its scan."""
    set_id = cfg["id"]
    if spec.get("like"):
        base = built[f"{set_id}-{spec['like']}"]
        record = {k: v for k, v in base.items() if k not in (
            "image", "imageSmall", "imageRemote", "market", "foilMap", *SPEC_FIELDS)}
        if base.get("printedNumber"):
            record["printedNumber"] = base["printedNumber"]
        remote = spec.get("image") or TCG_IMAGE.format(id=spec["tcgplayerId"])
    elif spec.get("from"):
        record = card_record({"id": set_id}, pkmn_card(spec["from"], refresh))
        remote = TCG_IMAGE.format(id=spec["tcgplayerId"])
    else:
        number = int(spec["number"])
        scrydex = cfg.get("scrydexId", set_id)
        record = card_record({"id": set_id, "scrydexId": scrydex},
                             pkmn_card(f"{cfg['series']}/{cfg['slug']}/{spec['number']}", refresh))
        if cfg.get("printedTotal"):
            record["printedNumber"] = f"{number:03d}/{int(cfg['printedTotal']):03d}"
        remote = spec.get("image") or f"https://images.scrydex.com/pokemon/{scrydex}-{number}/large"
    record.update(id=f"{set_id}-{stem}", number=stem)
    # pkmn.gg pads some names and curls some apostrophes; the site spells them plainly.
    record["name"] = str(record.get("name", "")).strip().replace("’", "'")
    return record, remote


def tcgl_map(path: str, refresh: bool) -> tuple[np.ndarray, np.ndarray]:
    """A TCG Live foil map at 367x512: (foil 0-255, the card's own alpha)."""
    raw = get(TCGL_FOIL.format(path=path), f"tcgl-{path.replace('/', '-')}.foil.png", refresh)
    a = np.asarray(Image.open(BytesIO(raw)).convert("RGBA").resize((367, 512), Image.LANCZOS)).astype(np.float32)
    return (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255, a[..., 3]


def foil_mask(set_id: str, stem: str, spec: dict, evolves: bool, refresh: bool) -> str:
    """Ship the print's foil map, with the border added when it foils that too.

    `"tcgl": "window"` is for a holo with no TCG Live print of its art: the
    whole art window, Pokémon included, cut to an SV card's outline. A Stage
    1 or 2 card's window leaves out its evolution badge, with the same cut
    the site's window foils use (assets/masks/win-evo.png). The Sword &
    Shield window sits within a pixel or two of the SV one.
    """
    if spec["tcgl"] == "window":
        _, card = tcgl_map(OUTLINE_MAP, refresh)
        left, top, right, bottom = ART_WINDOW
        lum = np.zeros_like(card)
        lum[top:bottom, left:right] = 255
        if evolves:
            evo = Image.open(ROOT / "assets" / "masks" / "win-evo.png").convert("RGBA")
            cut = np.asarray(evo.resize((367, 512), Image.LANCZOS))[..., 3].astype(np.float32)
            lum = np.minimum(lum, np.where(cut > 127, 255, 0).astype(np.float32))
    else:
        lum, card = tcgl_map(spec["tcgl"], refresh)
    if spec.get("border"):
        left, top, right, bottom = BORDER_INNER
        ring = np.ones_like(lum, dtype=bool)
        ring[top:bottom, left:right] = False
        lum = np.where(ring, np.maximum(lum, card), lum)
    lum = lum.clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    out = ROOT / "assets" / "foil" / "maps" / set_id
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([white, white, white, lum]), "RGBA").save(
        out / f"{stem}.webp", "WEBP", quality=85, alpha_quality=80, method=6)
    return f"assets/foil/maps/{set_id}/{stem}.webp"


def mirror(set_id: str, record: dict, remote: str, refresh: bool) -> None:
    stem = record["number"]
    have = record.get("image") or ""
    # mirror_images.py --photos may have moved the scan to <stem>-v2.
    mine = re.fullmatch(rf"assets/cards/{set_id}/{re.escape(stem)}(-v\d+)?\.webp", have)
    if refresh or not mine or not (ROOT / have).exists() or record.get("imageRemote") != remote:
        (ROOT / "assets" / "cards" / set_id).mkdir(parents=True, exist_ok=True)
        # Changed art lands under a new name, since the old one is cached for a year.
        replace_scan(get(remote), set_id, record, stem)
    record["imageRemote"] = remote


def build(set_id: str, prices_only: bool, refresh: bool) -> int:
    cfg = json.loads((SETS / f"{set_id}.json").read_text(encoding="utf-8"))
    path = DATA / f"{set_id}.json"
    prior = {c["id"]: c for c in json.loads(path.read_text(encoding="utf-8"))} if path.exists() else {}
    prices: dict[int, dict[str, float]] = {}
    for group in [cfg["tcgplayerGroup"], *cfg.get("extraGroups", [])]:
        prices.update(tcg_prices(group))

    built: dict[str, dict] = {}
    for index, spec in enumerate(cfg["cards"], start=1):
        stem = str(spec.get("stem") or index)
        card_id = f"{set_id}-{stem}"
        if prices_only and card_id in prior:
            record = dict(prior[card_id])
        else:
            record, remote = new_record(cfg, stem, spec, built, refresh)
            # Fields other scripts or hands added (ownerMask, pullWeight) survive.
            for key, value in (prior.get(card_id) or {}).items():
                if key not in record and key not in ("market", "foilMap", *SPEC_FIELDS):
                    record[key] = value
            for key, value in {**cfg.get("defaults", {}), **spec.get("set", {})}.items():
                record[key] = value
            for key in SPEC_FIELDS:
                if key in spec:
                    record[key] = spec[key]
            # A Rare printed without foil (Trick or Trade's Banette, the 2024
            # Chandelure) would otherwise take the Rare holo: it borrows the
            # Common's look, which is none.
            if not record.get("holo") and record.get("rarity") == "Rare":
                record["foilAs"] = "Common"
            if spec.get("tcgl"):
                subtypes = record.get("subtypes") or []
                evolves = "Stage 1" in subtypes or "Stage 2" in subtypes
                record["foilMap"] = foil_mask(set_id, stem, spec, evolves, refresh)
            mirror(set_id, record, remote, refresh)
        pid = spec.get("tcgplayerId")
        value = market(prices.get(pid, {}), bool(spec.get("holo") or spec.get("priceAs") == "holo")) if pid else None
        if value:
            record["market"] = value
        built[card_id] = ordered(record)

    # The single pack's own TCGplayer listing is what one pack costs here
    # (packCost() in worker/index.js); the bundles are build_products.py's.
    sealed = {key: market(prices.get(pid, {}), False) for key, pid in cfg.get("sealed", {}).items()}
    sealed = {key: value for key, value in sealed.items() if value}
    if sealed:
        store = json.loads(SEALED.read_text(encoding="utf-8"))
        store.setdefault(set_id, {}).update(sealed)
        SEALED.write_text(json.dumps(store, indent=2) + "\n", encoding="utf-8", newline="\n")

    cards = list(built.values())
    path.write_text(json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    unpriced = [c["id"] for c in cards if not c.get("market")]
    note = f"; no market price: {', '.join(unpriced)}" if unpriced else ""
    print(f"  wrote data/{set_id}.json: {len(cards)} cards, {len(cards) - len(unpriced)} priced{note}")
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
        except (RuntimeError, OSError, KeyError, subprocess.CalledProcessError) as exc:
            print(f"  FAILED: {exc!r}")
            failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
