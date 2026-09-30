#!/usr/bin/env python3
"""Build the sleeve and coin catalog: data/gear.json plus assets/sleeves and assets/coins.

    python3 scripts/build_gear.py                    # every spec in scripts/gear/*.json
    python3 scripts/build_gear.py --only me          # only spec files whose name starts with "me"
    python3 scripts/build_gear.py --preview out.png  # also write a contact sheet of what was built

A spec file is {"items": [...], "productRules": {...}}. An item:

  { "kind": "sleeve" | "coin", "id": "me1-mega-lucario", "name": "Mega Lucario sleeves",
    "sets": ["me1"], "subject": "Mega Lucario ex", "blurb": "one plain sentence",
    "count": 65,                       # sleeves
    "material": "metal|plastic|foil",  # coins
    "products": ["me1/pc-etb-lucario", "me1/eliteTrainerBox"],   # <setId>/<productId>
    "src": { "tcgplayer": 662629 }     # the 1000px photo of a standalone sleeve listing
         | { "file": "refs/me-a/x.jpg" }   # relative to the research folder
         | { "url": "https://..." }
         | { "render": { "dex": 143, "finish": "bronze", "holo": false } },   # coins only
    "crop": [x0, y0, x1, y1] | null,   # pixels in the source image
    "quadInset": 0.02,                       # sleeves: shrink the quad toward its centre (default 0.025, 0 disables)
    "quad": "auto" | [[x,y],[x,y],[x,y],[x,y]] | null,   # sleeves: "auto" finds the front sleeve of a
                                       # fanned stack on white by itself; else the four corners TL TR BR BL of the
                                       # sleeve in the photo; it is straightened (perspective) and
                                       # snapped to the nearest edge (set "snap": false to keep the
                                       # exact points). Replaces crop. scripts/gear_grid.py helps.
    "rotate": 0,                       # sleeves: degrees counter-clockwise, for a tilted flat scan
    "circle": [cx, cy, r] | null,      # coins photographed with a busy background; the circle is
                                       # snapped to the coin's rim unless "snap": false
    "inset": 0.02,                     # coins: trim this fraction of the radius off the rim when
                                       # background leaks in around a photographed coin
    "backSrc": same shapes as src | null,   # a real photo of the reverse, when one exists
    "v": 1,                            # bump when the picture changes (assets are immutable)
    "evidence": "verified|single-source|inferred", "sources": ["https://..."] }

Assets under assets/ are cached for a year, so a file is never overwritten with
different pixels: change `v` and the new file gets a new name.
The research folder is /mnt/project-files/sleeves-coins (override with GEAR_RESEARCH).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import gear_art as g  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = Path(os.environ.get("GEAR_RESEARCH", "/mnt/project-files/sleeves-coins"))
CACHE = RESEARCH / "cache"
SPECS = ROOT / "scripts" / "gear"
DEFAULT_QUAD_INSET = 0.025
UA = {"User-Agent": "curl/8.5.0", "Accept": "*/*"}
ARTWORK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{}.png"


def fetch(url: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + Path(url.split("?")[0]).suffix[:5])
    if not p.exists():
        req = urllib.request.Request(url, headers=UA)
        p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return p


def open_src(src: dict) -> Image.Image:
    if "tcgplayer" in src:
        return Image.open(fetch(f"https://tcgplayer-cdn.tcgplayer.com/product/{src['tcgplayer']}_in_1000x1000.jpg"))
    if "file" in src:
        return Image.open(RESEARCH / src["file"])
    if "url" in src:
        return Image.open(fetch(src["url"]))
    raise ValueError(f"unusable src {src}")


def build_sleeve(item: dict) -> tuple[Image.Image, str]:
    im = open_src(item["src"])
    quad = item.get("quad")
    if quad == "auto":
        quad = g.auto_quad(im)
        if not quad:
            raise ValueError("auto quad found no sleeve; give the four corners")
    if quad and item.get("snap", True):
        quad = g.refine_quad(im, quad)
    # Every quad crop is pulled 2.5% inside the sleeve edge unless the item says
    # otherwise: real sleeves have rounded corners and stack photos show a sliver
    # of the next sleeve or the background right at the edge.
    inset = float(item["quadInset"]) if item.get("quadInset") is not None else (DEFAULT_QUAD_INSET if quad else 0)
    if quad and inset:
        # Pull every corner toward the centre so a sleeve's rounded corners and the
        # sliver of whatever sits behind it stay outside the tile.
        cx = sum(x for x, _ in quad) / 4
        cy = sum(y for _, y in quad) / 4
        quad = [(x + (cx - x) * inset, y + (cy - y) * inset) for x, y in quad]
    card = g.sleeve_card(im, item.get("crop"), quad=quad, rotate=float(item.get("rotate") or 0))
    return card, g.dominant_tint(card)


def build_coin(item: dict) -> tuple[Image.Image, str, bool]:
    src = item["src"]
    if "render" in src:
        r = src["render"]
        art = Image.open(fetch(ARTWORK.format(r["dex"]))) if "dex" in r else Image.open(RESEARCH / r["file"])
        face = g.render_coin(art, r.get("finish", "silver"), holo=bool(r.get("holo")))
        rendered = True
    else:
        photo = open_src(src)
        if item.get("crop"):
            photo = photo.crop(tuple(item["crop"]))
        if item.get("circle"):
            cx, cy, rad = item["circle"]
            if item.get("snap", True):
                cx, cy, rad = g.find_circle(photo, cx, cy, rad)
            photo = photo.convert("RGBA").crop((round(cx - rad), round(cy - rad), round(cx + rad), round(cy + rad)))
            face = g.coin_face(photo.convert("RGBA"), inset=float(item.get("inset") or 0))
        else:
            face = g.coin_face(photo, inset=float(item.get("inset") or 0))
        rendered = False
    back = None
    if item.get("backSrc"):
        back = g.coin_face(open_src(item["backSrc"]))
    sheet = Image.new("RGBA", (g.COIN * 2, g.COIN), (0, 0, 0, 0))
    sheet.paste(face, (0, 0))
    sheet.paste(back if back is not None else g.generic_reverse(face), (g.COIN, 0))
    return sheet, g.dominant_tint(face), rendered


def product_names() -> dict[str, str]:
    """`<setId>/<productId>` -> a name a player would recognise."""
    out = {}
    products = json.load(open(ROOT / "data" / "products.json"))
    for set_id, rows in products.items():
        if set_id == "_fetchedAt":
            continue
        for row in rows:
            out[f"{set_id}/{row['id']}"] = row["name"]
    return out


def set_names() -> dict[str, str]:
    out = {}
    for f in (ROOT / "data" / "sets").glob("*.json"):
        d = json.load(open(f))
        out[d["id"]] = d["name"]
    return out


STANDARD = {"eliteTrainerBox": "Elite Trainer Box", "boosterBundle": "Booster Bundle", "boosterBox": "Booster Box"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview", default="")
    ap.add_argument("--no-catalog", action="store_true", help="build images only")
    args = ap.parse_args()

    items, rules = [], {}
    for f in sorted(SPECS.glob("*.json")):
        if args.only and not f.name.startswith(args.only):
            continue
        d = json.load(open(f))
        items += [dict(i, _file=f.name) for i in d.get("items", [])]
        rules.update(d.get("productRules", {}))
    ids = {}
    for it in items:
        key = (it["kind"], it["id"])
        if key in ids:
            raise SystemExit(f"duplicate {key} in {it['_file']} and {ids[key]}")
        ids[key] = it["_file"]

    names, sets = product_names(), set_names()
    catalog = {"version": 1, "sleeves": {}, "coins": {}, "products": {}}
    previews = []
    failed = []
    for it in items:
        v = int(it.get("v", 1))
        try:
            if it["kind"] == "sleeve":
                img, tint = build_sleeve(it)
                rel = f"assets/sleeves/{it['id']}-v{v}.webp"
                q = 88
            else:
                img, tint, rendered = build_coin(it)
                rel = f"assets/coins/{it['id']}-v{v}.webp"
                q = 88
        except Exception as e:  # keep going so one bad crop doesn't hide the rest
            failed.append((it["id"], repr(e)))
            continue
        path = ROOT / rel
        if not path.exists():
            g.save_webp(img, path, q)
        else:
            # Never overwrite a published asset with different pixels.
            probe = ROOT / f".gear-probe-{os.getpid()}.webp"
            g.save_webp(img, probe, q)
            same = probe.read_bytes() == path.read_bytes()
            probe.unlink()
            if not same:
                print(f"NOTE {rel} exists and would change; bump v for {it['id']}", file=sys.stderr)
        row = {
            "id": it["id"], "name": it["name"], "sets": it.get("sets", []), "subject": it.get("subject", ""),
            "blurb": it.get("blurb", ""), "tint": tint, "from": list(it.get("products", [])),
            "evidence": it.get("evidence", ""),
        }
        if it["kind"] == "sleeve":
            row.update({"count": int(it.get("count", 65)), "art": rel})
            catalog["sleeves"][it["id"]] = row
        else:
            row.update({"material": it.get("material", "unknown"), "front": rel, "drawn": rendered})
            catalog["coins"][it["id"]] = row
        previews.append((it, img))
        for key in it.get("products", []):
            slot = catalog["products"].setdefault(key, {"sleeves": [], "coins": []})
            slot["sleeves" if it["kind"] == "sleeve" else "coins"].append(it["id"])

    for key, slot in catalog["products"].items():
        set_id, prod = key.split("/", 1)
        base = names.get(key) or STANDARD.get(prod, prod)
        set_name = sets.get(set_id, set_id)
        slot["name"] = base if set_name.lower() in base.lower() else f"{base} ({set_name})"
        if key in rules and rules[key].get("pick"):
            slot["pick"] = rules[key]["pick"]
        slot["sleeves"] = sorted(set(slot["sleeves"]))
        slot["coins"] = sorted(set(slot["coins"]))
        if not slot["sleeves"]:
            del slot["sleeves"]
        if not slot["coins"]:
            del slot["coins"]

    if not args.no_catalog and not args.only:
        (ROOT / "data" / "gear.json").write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n")

    if args.preview and previews:
        from PIL import ImageDraw
        cw, ch = 240, 320
        cols = 5
        rows = (len(previews) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw, rows * ch), (28, 28, 32))
        d = ImageDraw.Draw(sheet)
        for i, (it, img) in enumerate(previews):
            x, y = (i % cols) * cw, (i // cols) * ch
            tile = img.convert("RGBA")
            if it["kind"] == "coin":
                tile = tile.crop((0, 0, g.COIN, g.COIN))
            tile.thumbnail((cw - 16, ch - 60))
            bg = Image.new("RGBA", tile.size, (70, 70, 76, 255))
            bg.alpha_composite(tile)
            sheet.paste(bg.convert("RGB"), (x + 8, y + 8))
            d.text((x + 8, ch + y - 46), it["id"][:38], fill=(235, 235, 235))
            d.text((x + 8, ch + y - 32), it["name"][:38], fill=(190, 190, 190))
            d.text((x + 8, ch + y - 18), ("drawn " if it["kind"] == "coin" and "render" in it["src"] else "") + it["_file"][:20], fill=(150, 150, 160))
        sheet.save(args.preview)

    print(f"{len(catalog['sleeves'])} sleeves, {len(catalog['coins'])} coins, {len(catalog['products'])} products")
    for i, e in failed:
        print("FAILED", i, e)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
