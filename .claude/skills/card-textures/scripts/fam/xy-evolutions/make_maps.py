"""Ship the masks of the Evolutions (xy12) holo family into assets/foil/fam/xy-evolutions/.

1. map-11.webp: Charizard 11's holo map with the EVOLUTIONS logo cut out. TCG Live's map (assets/foil/maps/xy12/11.webp,
   the art background foil, Charizard and his flames cut out) is right for the real pack card, which prints no logo
   (Collexy's flat scan, YouTube kE6CEqBwOyo). The site's scan (scrydex / pokemontcg.io, the official database image)
   prints the logo over the lower right of the art, so the stars would ride over its letters: the logo's outline,
   traced by hand on the scan (LOGO, card fractions) and feathered, is cut from the map.
2. rev/<n>.webp: TCG Live's map of the reverse holo print (`<key>_en_<nnn>_ph.foil.png`) of every Evolutions card that
   can be a reverse (Common, Uncommon, Rare, Rare Holo: data/xy12.json, the set's reverseRarities): the whole card is
   foil except the art window, the evolution box, the Pokedex bar, the type, cost and weakness symbols (the Trainers:
   the title plate and the picture). Evolutions' reverse is a plain mirror (Collexy: "the Set Reverse Holofoil Pattern
   is the Mirror Pattern"), so the maps are flat white, unlike every other XY set's, which carry the type symbols.
   Converted as fetch_foil_maps.py --ship does (white, alpha = luminance with TCG Live's 22/255 floor stretched to 0).

    python3 .claude/skills/card-textures/scripts/fam/xy-evolutions/make_maps.py [--cache DIR]

Downloads into --cache (default: the scratch folder, else the lab cache), never over an existing asset file.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "xy-evolutions"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/xy12"
FLOOR = 22
REVERSE_RARITIES = {"Common", "Uncommon", "Rare", "Rare Holo"}

# The EVOLUTIONS logo on the scan of xy12-11, outer outline, in card fractions (x of the width, y of the height).
LOGO = [
    (0.481, 0.467), (0.516, 0.467), (0.519, 0.452), (0.668, 0.452), (0.678, 0.452), (0.813, 0.452),
    (0.826, 0.468), (0.849, 0.468), (0.850, 0.511), (0.781, 0.511), (0.746, 0.519), (0.713, 0.525),
    (0.679, 0.519), (0.669, 0.513), (0.660, 0.521), (0.544, 0.522), (0.524, 0.513), (0.481, 0.511),
]


def alpha_mask(path: Path) -> Image.Image:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = ((lum - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    return Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")


def logo_cut(map_path: Path) -> Image.Image:
    m = Image.open(map_path).convert("RGBA")
    w, h = m.size
    ss = 4
    poly = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(poly).polygon([(x * w * ss, y * h * ss) for x, y in LOGO], fill=255)
    # grow by about 1.5 map px (the grey outline's anti-aliasing), then feather
    poly = poly.filter(ImageFilter.MaxFilter(13)).resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    a = np.asarray(m).astype(np.float32)
    cut = np.asarray(poly).astype(np.float32) / 255
    a[..., 3] *= 1 - cut
    return Image.fromarray(a.round().clip(0, 255).astype(np.uint8), "RGBA")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default="/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-evolutions/live")
    ap.add_argument("--force", action="store_true", help="rewrite files this script wrote before (only before the family ships)")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rev").mkdir(exist_ok=True)

    def write(img: Image.Image, dest: Path) -> None:
        if dest.exists() and not args.force:
            print("exists, kept:", dest.relative_to(ROOT))
            return
        img.save(dest, "WEBP", quality=85, alpha_quality=80, method=6)

    write(logo_cut(ROOT / "assets/foil/maps/xy12/11.webp"), OUT / "map-11.webp")

    cards = json.loads((ROOT / "data" / "xy12.json").read_text(encoding="utf-8"))
    numbers = [str(c["number"]) for c in cards if c.get("rarity") in REVERSE_RARITIES and str(c["number"]).isdigit()]
    shipped = []
    for n in numbers:
        src = cache / f"xy12_{int(n):03d}_ph.foil.png"
        if not src.exists():
            res = subprocess.run(["curl", "-sfL", f"{BASE}/xy12_en_{int(n):03d}_ph.foil.png", "-o", str(src)], capture_output=True)
            if res.returncode != 0:
                src.unlink(missing_ok=True)
                print("no reverse map on TCG Live:", n)
                continue
        write(alpha_mask(src), OUT / "rev" / f"{n}.webp")
        shipped.append(int(n))
    print(f"{len(shipped)} reverse maps:", ",".join(map(str, sorted(shipped))))
    size = sum(p.stat().st_size for p in (OUT / "rev").glob("*.webp"))
    print(f"rev/ holds {size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
