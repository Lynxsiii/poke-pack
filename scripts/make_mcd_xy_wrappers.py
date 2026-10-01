"""Draw the Happy Meal pouch for McDonald's Collection 2014, 2015 and 2016.

Like 2017-2019 (scripts/make_mcd_sm_wrappers.py, whose drawing this reuses) these
sets came one card to a Happy Meal, so there is no printed booster wrapper to
download, and pokesymbols.com has no booster-pack art for them (probed 2026-10-01).
The pouch is a stand-in painted in the silhouette of the 2023 pouch with the set's
own Pikachu card and the McDonald's mark; the real card came in a clear sleeve.

    python3 scripts/make_mcd_xy_wrappers.py

Writes assets/packs/mcd14|mcd15|mcd16/pack-0.avif and .png (new files only; an
existing file is left alone, assets are cached for a year).
"""
from __future__ import annotations

import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

import make_mcd_sm_wrappers as base

ROOT = Path(__file__).resolve().parents[1]
SETS = {"mcd14": ("2014", 5), "mcd15": ("2015", 6), "mcd16": ("2016", 6)}  # year, the Pikachu's number


def main() -> None:
    raw = urllib.request.urlopen(urllib.request.Request(base.LOGO, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
    logo = Image.open(BytesIO(raw)).convert("RGBA")
    box = logo.getchannel("A").getbbox()
    logo = logo.crop(box) if box else logo
    for set_id, (year, hero) in SETS.items():
        out = ROOT / "assets" / "packs" / set_id
        out.mkdir(parents=True, exist_ok=True)
        if (out / "pack-0.png").exists():
            print(f"{set_id}: already there")
            continue
        img = base.build(set_id, year, hero, logo)
        img.save(out / "pack-0.png")
        img.save(out / "pack-0.avif", quality=90)
        print(f"{set_id}: wrote {out}")


if __name__ == "__main__":
    main()
