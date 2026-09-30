"""Draw the Happy Meal pouch for McDonald's Collection 2017, 2018 and 2019.

Those three English sets came one card to a Happy Meal (Bulbapedia), so there
is no printed booster wrapper to download, as there is for 2023's four-card
pack. The site still needs a pack to tear: this paints one in the silhouette
of the 2023 pouch (assets/packs/mcd23/pack-0.png), red with a yellow band,
the set's own Pikachu card in the middle and the McDonald's mark from the set
logo. It is a stand-in, not a scan of anything; the real thing was a card in a
clear sleeve.

    python3 scripts/make_mcd_sm_wrappers.py

Writes assets/packs/mcd17|mcd18|mcd19/pack-0.avif and .png (new files only;
an existing file is left alone, assets are cached for a year).
"""
from __future__ import annotations

import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHAPE = Path("/home/user/poke-pack/assets/packs/mcd23/pack-0.png")
LOGO = "https://images.pokemontcg.io/mcd17/logo.png"
SETS = {"mcd17": ("2017", 5), "mcd18": ("2018", 4), "mcd19": ("2019", 6)}  # year, the Pikachu's number
BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
RED, DEEP, YELLOW, BLUE = (218, 41, 28), (150, 18, 14), (255, 199, 44), (35, 70, 160)


def shape() -> Image.Image:
    src = SHAPE if SHAPE.exists() else ROOT / "assets/packs/mcd23/pack-0.png"
    return Image.open(src).convert("RGBA")


def outlined(draw: ImageDraw.ImageDraw, xy, text, font, fill, edge, width):
    x, y = xy
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx * dx + dy * dy <= width * width:
                draw.text((x + dx, y + dy), text, font=font, fill=edge, anchor="mm")
    draw.text(xy, text, font=font, fill=fill, anchor="mm")


def build(set_id: str, year: str, hero: int, logo: Image.Image) -> Image.Image:
    alpha = shape().getchannel("A")
    w, h = alpha.size
    art = np.zeros((h, w, 3), np.float32)
    t = np.linspace(0, 1, h)[:, None]
    top, bottom = np.array(RED, np.float32), np.array(DEEP, np.float32)
    art[:] = (top * (1 - t) + bottom * t)[:, None, :]
    img = Image.fromarray(art.astype(np.uint8), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img)
    # Yellow band behind the card, with a fine white rule either side.
    d.rectangle([0, int(h * 0.30), w, int(h * 0.76)], fill=YELLOW)
    for y in (int(h * 0.30), int(h * 0.76)):
        d.rectangle([0, y - 3, w, y], fill=(255, 255, 255))
    # Crimps top and bottom.
    for y0, y1 in ((0, 26), (h - 26, h)):
        d.rectangle([0, y0, w, y1], fill=DEEP)
        for x in range(0, w, 6):
            d.line([(x, y0), (x, y1)], fill=(110, 10, 8), width=1)
    # Logo line.
    outlined(d, (w // 2, int(h * 0.115)), "POKÉMON", ImageFont.truetype(BOLD, 62), YELLOW, BLUE, 5)
    d.text((w // 2, int(h * 0.205)), "TRADING CARD GAME", font=ImageFont.truetype(BOLD, 25), fill=(255, 255, 255), anchor="mm")
    # The hero card, tilted, with a shadow.
    card = Image.open(ROOT / f"assets/cards/{set_id}/{hero}.webp").convert("RGBA")
    card.thumbnail((int(w * 0.66), int(h * 0.56)), Image.LANCZOS)
    card = card.rotate(-6, expand=True, resample=Image.BICUBIC)
    shadow = Image.new("RGBA", card.size, (0, 0, 0, 0))
    shadow.putalpha(card.getchannel("A").point(lambda v: v * 0.5))
    shadow = Image.composite(Image.new("RGBA", card.size, (0, 0, 0, 255)), shadow, card.getchannel("A")).filter(ImageFilter.GaussianBlur(9))
    cx, cy = w // 2 - card.width // 2, int(h * 0.53) - card.height // 2
    img.alpha_composite(shadow, (cx + 8, cy + 12))
    img.alpha_composite(card, (cx, cy))
    # McDonald's mark and the footer.
    mark = logo.copy()
    mark.thumbnail((int(w * 0.30), int(h * 0.11)), Image.LANCZOS)
    img.alpha_composite(mark, (w // 2 - mark.width // 2, int(h * 0.80)))
    d = ImageDraw.Draw(img)
    d.text((w // 2, int(h * 0.935)), f"COLLECTION {year}  ·  1 CARD", font=ImageFont.truetype(BOLD, 21), fill=(255, 255, 255), anchor="mm")
    img.putalpha(alpha)
    return img


def main() -> None:
    raw = urllib.request.urlopen(urllib.request.Request(LOGO, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
    logo = Image.open(BytesIO(raw)).convert("RGBA")
    box = logo.getchannel("A").getbbox()
    logo = logo.crop(box) if box else logo
    for set_id, (year, hero) in SETS.items():
        out = ROOT / "assets" / "packs" / set_id
        out.mkdir(parents=True, exist_ok=True)
        if (out / "pack-0.png").exists():
            print(f"{set_id}: already there")
            continue
        img = build(set_id, year, hero, logo)
        img.save(out / "pack-0.png")
        img.save(out / "pack-0.avif", quality=90)
        print(f"{set_id}: wrote {out}")


if __name__ == "__main__":
    main()
