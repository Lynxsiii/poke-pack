"""Give every set's Booster Box, Booster Bundle and Elite Trainer Box a product photo.

data/sealed.json prices these three for each set, but a photo only came with
an ETB's promo config, so the shop drew a plain black carton for the rest. This
finds each one's TCGplayer listing in the set's group (tcgcsv.com), cuts the
photo out with build_products.cut_out, saves it as
assets/products/<set>/<id>.webp, and records it two ways: a config row in
data/sets/<set>.json (so build_products.py keeps it) and the entry the shop
reads in data/products.json.

    python3 scripts/add_sealed_photos.py [--check] [set ...]

--check lists what would be added and downloads nothing. Product ids that
TCGplayer lists several times (store exclusives, set-of-two, display cases,
Enhanced boxes, one ETB per Pokémon) are picked by the rules in `pick`, or by
OVERRIDE; a set whose ETB comes in two designs already has its photos in its
promo config.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_products as bp  # noqa: E402

ROOT = bp.ROOT
STD = {
    "boosterBox": ("Booster Box", "box", 36),
    "eliteTrainerBox": ("Elite Trainer Box", "etb", 9),
    "boosterBundle": ("Booster Bundle", "bundle", 6),
}
# Listings the rules below can't tell apart: (set, product id) -> TCGplayer product id.
OVERRIDE: dict[tuple[str, str], int] = {
    ("sv8", "boosterBundle"): 679564,  # the retail bundle; the other is the card-shop one
    ("me1", "boosterBox"): 644298,  # not the Enhanced Booster Box
}
SKIP = re.compile(r"Case|Code Card|Half|Display|Enhanced|Exclusive|Pokemon Center|Set of|Sam's|Dollar|Plus|\[|\(LGS\)", re.I)


def pick(products: list[dict], pid: str) -> list[dict]:
    word = STD[pid][0]
    rows = [r for r in products if re.search(rf"\b{word}\b", r["name"], re.I) and not SKIP.search(r["name"])]
    return rows


def cut_display_box(raw: bytes, light: int = 228, tol: int = 22) -> Image.Image:
    """A booster box photo as RGBA. build_products.cut_out keeps the convex hull, which would
    fill the notches either side of the box's raised back panel with white; this flood fills
    the background in from the border instead (white, or the pale colour the photo's corners
    carry), keeps the biggest piece and fills any holes."""
    img = Image.open(BytesIO(raw)).convert("RGB")
    a = np.asarray(img).astype(int)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    pale = border[border.min(axis=1) >= 200]
    ref = np.median(pale, axis=0) if len(pale) else np.array([255, 255, 255])
    cand = (np.abs(a - ref).max(axis=2) <= tol) | (a.min(axis=2) >= light)
    lab, _ = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(edge))
    lab2, n = ndimage.label(fg)
    if n > 1:
        fg = lab2 == 1 + int(np.argmax(ndimage.sum(fg, lab2, range(1, n + 1))))
    fg = ndimage.binary_opening(ndimage.binary_fill_holes(fg), iterations=1)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    return out.crop(box) if box else out


def save_photo(set_id: str, pid: str, tid: int) -> str | None:
    rel = f"assets/products/{set_id}/{pid}.webp"
    if pid != "boosterBox":
        return bp.save_product_image(set_id, {"id": pid, "tcgplayerId": tid}, False)
    try:
        raw = bp.fetch(bp.TCG_IMAGE.format(id=tid))
    except (urllib.error.URLError, OSError):
        return None
    img = cut_display_box(raw)
    if img.width > bp.PRODUCT_WIDTH:
        img = img.resize((bp.PRODUCT_WIDTH, round(img.height * bp.PRODUCT_WIDTH / img.width)), Image.LANCZOS)
    dest = ROOT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=80, method=6, exact=True)
    return rel


def main(argv: list[str]) -> int:
    check = "--check" in argv
    wanted = [a for a in argv if not a.startswith("-")]
    sealed = json.loads((bp.DATA / "sealed.json").read_text(encoding="utf-8"))
    products_json = json.loads(bp.OUT.read_text(encoding="utf-8"))
    status = 0
    for set_id, row in sealed.items():
        if set_id.startswith("_") or (wanted and set_id not in wanted):
            continue
        cfg_path = bp.SETS / f"{set_id}.json"
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        have = {p["id"]: p for p in products_json.get(set_id, [])}
        todo = [k for k in STD if isinstance(row.get(k), (int, float)) and row[k] > 0 and not (have.get(k) or {}).get("image")]
        if not todo:
            continue
        group = cfg["tcgplayerGroup"]
        listing = list(bp.tcg_products(group, False).values())
        for pid in todo:
            if (set_id, pid) in OVERRIDE:
                tid = OVERRIDE[(set_id, pid)]
            else:
                rows = pick(listing, pid)
                if len(rows) != 1:
                    print(f"{set_id:9} {pid:16} NEEDS A CHOICE: {[(r['productId'], r['name']) for r in rows]}")
                    status = 1
                    continue
                tid = rows[0]["productId"]
            name, kind, packs = STD[pid]
            title = next((r["name"] for r in listing if r["productId"] == tid), "?")
            print(f"{set_id:9} {pid:16} {tid}  {title}")
            if check:
                continue
            image = save_photo(set_id, pid, tid)
            if not image:
                print("    no photo, skipped")
                status = 1
                continue
            conf = next((p for p in cfg.get("products") or [] if p["id"] == pid), None)
            if conf is None:
                cfg.setdefault("products", []).append({"id": pid, "name": name, "kind": kind, "tcgplayerId": tid, "packs": packs, "promos": []})
            else:
                conf["tcgplayerId"] = tid
            entry = next((p for p in products_json.setdefault(set_id, []) if p["id"] == pid), None)
            if entry is None:
                entry = {"id": pid, "name": name, "kind": kind, "packs": packs, "promos": [], "price": row[pid], "tcgplayerId": tid}
                products_json[set_id].append(entry)
            entry["tcgplayerId"] = tid
            entry["image"] = image
        if not check:
            cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not check:
        bp.OUT.write_text(json.dumps(products_json, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
