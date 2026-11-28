"""Photos for older-era sealed products TCGplayer never listed, from PriceCharting.

PriceCharting lists some of these under their own name with a real product
photo (https://www.pricecharting.com/console/<set>). Only exact matches are
used: a tin or box whose Pokémon and set both match. PriceCharting's generic
"Blister Pack" photo is one random blister, so it is never used for a named
one. Each photo is cut out with build_products.cut_out (convex hull; every
product here is a convex box or tin), saved as assets/products/<set>/<id>.webp
and recorded as `image` in data/products.json.

    python3 scripts/add_older_product_photos.py               # every photo below
    python3 scripts/add_older_product_photos.py xy11/elite-trainer-box   # just these

assets/ is cached for a year, so a photo that already exists is never
overwritten: the new cut takes the next -vN name and `imageVersion` in
data/sets/<set>.json, which build_products.py keeps.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_products as bp  # noqa: E402
from PIL import Image  # noqa: E402

# (set, product id): (PriceCharting console slug, listing title), or ("url", a photo on white) where PriceCharting has none
# Left out: PriceCharting's Lucario and Dialga LV.X tin photos are shot on grey and beige, so the cut-out leaves a ragged edge.
PHOTOS: dict[tuple[str, str], tuple[str, str]] = {
    ("hgss1", "legendary-beast-tin-raikou"): ("pokemon-heartgold-&-soulsilver", "Raikou Tin"),
    ("hgss1", "legendary-beast-tin-entei"): ("pokemon-heartgold-&-soulsilver", "Sealed Entei Tin"),
    ("hgss1", "legendary-beast-tin-suicune"): ("pokemon-heartgold-&-soulsilver", "Suicune Tin"),
    ("hgss1", "collectors-tin-feraligatr"): ("pokemon-heartgold-&-soulsilver", "Sealed Feraligatr Tin"),
    ("hgss1", "collectors-tin-typhlosion"): ("pokemon-heartgold-&-soulsilver", "Typhlosion Tin"),
    ("dp1", "collectors-tin-torterra"): ("pokemon-diamond-&-pearl", "Torterra LV.X Tin"),
    ("dp4", "spring-tin-palkia-lvx"): ("pokemon-diamond-&-pearl", "Palkia LV. X Tin"),
    ("dp6", "dialga-premium-box"): ("pokemon-diamond-&-pearl", "Dialga Premium Box"),
    ("bw5", "superb-serperior-box"): ("pokemon-black-&-white", "Superb Serperior Box"),
    ("neo3", "booster-box"): ("pokemon-neo-revelation", "Booster Box"),
    ("ecard1", "booster-box"): ("pokemon-expedition", "Booster Box"),
    ("ecard2", "booster-box"): ("pokemon-aquapolis", "Booster Box"),
    ("ecard3", "booster-box"): ("pokemon-skyridge", "Booster Box"),
    # TCGplayer's listing photo for this box is the Steam Siege logo (11-28).
    ("xy11", "elite-trainer-box"): ("pokemon-steam-siege", "Elite Trainer Box"),
    # TCGplayer's photo for the kit is the logo too, and PriceCharting doesn't list it: a retailer's studio shot on white.
    ("xy11", "prerelease-kit"): ("url", "https://cdn.shopify.com/s/files/1/0515/0189/1783/products/f9465df9-cd04-50e4-a292-1b9070b7c7c0.jpg"),
}


def listing_images(slug: str) -> dict[str, str]:
    html = bp.fetch(f"https://www.pricecharting.com/console/{slug}", f"pc-{slug}.html").decode("utf-8", "replace")
    out: dict[str, str] = {}
    for row in bp.re.finditer(r'<tr id="product-\d+"(.*?)</tr>', html, bp.re.S):
        title = bp.re.search(r'class="title".*?<a href="[^"]+"[^>]*>([^<]+)', row.group(1), bp.re.S)
        img = bp.re.search(r'<img[^>]+src="([^"]+)"', row.group(1))
        if title and img and "#" not in title.group(1):
            out.setdefault(title.group(1).strip(), img.group(1))
    return out


def main() -> int:
    import check_product_photos as cpp
    only = set(sys.argv[1:])
    products = json.loads(bp.OUT.read_text(encoding="utf-8"))
    status = 0
    for (set_id, pid), (slug, title) in PHOTOS.items():
        if only and f"{set_id}/{pid}" not in only:
            continue
        entry = next((p for p in products.get(set_id, []) if p["id"] == pid), None)
        thumb = title if slug == "url" else listing_images(slug).get(title)
        if not entry or not thumb:
            print(f"{set_id} {pid}: not found ({'entry' if not entry else 'listing'})")
            status = 1
            continue
        rel = f"assets/products/{set_id}/{pid}.webp"
        src = thumb if slug == "url" else thumb.rsplit("/", 1)[0] + "/1600.jpg"
        raw = bp.fetch(src, f"pc-{set_id}-{pid}.jpg")
        img = bp.cut_out(raw)
        if img.width > bp.PRODUCT_WIDTH:
            img = img.resize((bp.PRODUCT_WIDTH, round(img.height * bp.PRODUCT_WIDTH / img.width)), Image.LANCZOS)
        (bp.ROOT / rel).parent.mkdir(parents=True, exist_ok=True)
        if (bp.ROOT / rel).exists():
            rel = cpp.next_name(rel)
            cfg_path = bp.SETS / f"{set_id}.json"
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
            for p in cfg.get("products", []):
                if p.get("id") == pid:
                    p["imageVersion"] = int(rel.rsplit("-v", 1)[1].split(".")[0])
            cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        img.save(bp.ROOT / rel, "WEBP", quality=80, method=6, exact=True)
        entry["image"] = rel
        print(f"{set_id} {pid}: {img.size}")
    bp.OUT.write_text(json.dumps(products, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return status


if __name__ == "__main__":
    sys.exit(main())
