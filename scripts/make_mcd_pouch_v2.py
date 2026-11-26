"""Redraw the Happy Meal pouch for the McDonald's years that had no printed pack.

2011 to 2019 came one card to a Happy Meal in a clear sleeve, and no photo of a
2026 pack is online, so these nine sets have no wrapper to scan
(/mnt/project-files/promos-redesign/mcdonalds-packaging.md). The site still
needs a pack to tear. The first stand-in (make_mcd_*_wrappers.py) was a flat
red and yellow drawing; Noah asked for it to be polished toward the real 2023
and 2024 wrappers (2026-11-26). This draws it the way those are built: the
Pokémon wordmark, the white "Trading Card Game" plate, a sunburst behind the
set's own Pikachu (or Oshawott) card, a black count strip at the foot, crimped
seals, and the light a foil pouch catches. It is still a drawing, not a scan.

    python3 scripts/make_mcd_pouch_v2.py [--out DIR]

Writes assets/packs/<set>/pack-0-v2.avif and .png. /assets/ is cached for a
year, so an existing file is never overwritten: bump VERSION for a new look.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "scripts" / "art"
VERSION = 2
S = 2  # drawn at twice the shipped size, then scaled down
# set: (year, the card on the front, cards in a Happy Meal)
SETS = {
    "mcd11": ("2011", 4, 1), "mcd12": ("2012", 10, 1),
    "mcd14": ("2014", 5, 1), "mcd15": ("2015", 6, 1), "mcd16": ("2016", 6, 1),
    "mcd17": ("2017", 5, 1), "mcd18": ("2018", 4, 1), "mcd19": ("2019", 6, 1),
    "mcd26": ("2026", 4, 2),
}
HEAVY = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
RED, DEEP, GOLD, INK = (222, 36, 31), (128, 12, 14), (255, 201, 40), (22, 24, 34)


def silhouette() -> Image.Image:
    """The 2023 wrapper's outline: a real Happy Meal pouch."""
    return Image.open(ROOT / "assets/packs/mcd23/pack-0.png").convert("RGBA").getchannel("A")


def sunburst(w: int, h: int, cx: float, cy: float) -> Image.Image:
    """Red ground, brighter toward the card, with rays turning round it."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    r = np.hypot(dx, dy) / (0.62 * h)
    ray = (np.sin(np.arctan2(dy, dx) * 14) > 0).astype(np.float32)
    lift = np.clip(1 - r, 0, 1)
    top, low = np.array(RED, np.float32), np.array(DEEP, np.float32)
    base = low + (top - low) * np.clip(1.15 - r, 0, 1)[..., None]
    base += ray[..., None] * (18 + 34 * lift[..., None]) * np.array([1.0, 0.55, 0.2], np.float32)
    glow = np.clip(1 - np.hypot(dx, dy) / (0.36 * h), 0, 1) ** 1.6
    base = base * (1 - 0.82 * glow[..., None]) + np.array(GOLD, np.float32) * 0.82 * glow[..., None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def shadow_of(layer: Image.Image, blur: float, strength: float) -> Image.Image:
    pad = int(blur * 3)
    out = Image.new("RGBA", (layer.width + pad * 2, layer.height + pad * 2), (0, 0, 0, 0))
    a = Image.new("L", out.size, 0)
    a.paste(layer.getchannel("A").point(lambda v: int(v * strength)), (pad, pad))
    out.putalpha(a.filter(ImageFilter.GaussianBlur(blur)))
    return out


def build(set_id: str) -> Image.Image:
    year, hero, count = SETS[set_id]
    alpha = silhouette()
    w, h = alpha.width * S, alpha.height * S
    img = sunburst(w, h, w * 0.5, h * 0.555)
    d = ImageDraw.Draw(img)

    # The seals: a darker band with pressed ridges and a gold rule, top and foot.
    seal = int(h * 0.052)
    for y0, y1, rule in ((0, seal, seal), (h - seal, h, h - seal - 3 * S)):
        d.rectangle([0, y0, w, y1], fill=DEEP)
        for x in range(0, w, 7 * S):
            d.rectangle([x, y0, x + 3 * S, y1], fill=(158, 22, 20))
            d.line([(x + 3 * S, y0), (x + 3 * S, y1)], fill=(84, 6, 10), width=S)
        d.rectangle([0, rule, w, rule + 3 * S], fill=GOLD)

    # The card, tilted on the sunburst.
    card = Image.open(ROOT / f"assets/cards/{set_id}/{hero}.webp").convert("RGBA")
    cw = int(w * 0.61)
    card = card.resize((cw, int(cw * card.height / card.width)), Image.LANCZOS).rotate(-6, expand=True, resample=Image.BICUBIC)
    cx, cy = (w - card.width) // 2, int(h * 0.555) - card.height // 2
    sh = shadow_of(card, 11 * S, 0.62)
    img.alpha_composite(sh, (cx - (sh.width - card.width) // 2 + 6 * S, cy - (sh.height - card.height) // 2 + 12 * S))
    img.alpha_composite(card, (cx, cy))

    # The wordmark, over the top of the card as on a real wrapper.
    mark = Image.open(ART / "pokemon-wordmark.png").convert("RGBA")
    mw = int(w * 0.86)
    mark = mark.resize((mw, int(mw * mark.height / mark.width)), Image.LANCZOS)
    mx, my = (w - mw) // 2, int(h * 0.066)
    sh = shadow_of(mark, 5 * S, 0.7)
    img.alpha_composite(sh, (mx - (sh.width - mw) // 2 + 2 * S, my - (sh.height - mark.height) // 2 + 5 * S))
    img.alpha_composite(mark, (mx, my))

    # "Trading Card Game": white plate, red keyline, ink letters.
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(HEAVY, 19 * S)
    text = "TRADING CARD GAME"
    tw = d.textlength(text, font=font)
    px, py, ph = (w - tw) / 2 - 13 * S, my + mark.height + 1 * S, 31 * S
    d.rounded_rectangle([px - 3 * S, py - 3 * S, px + tw + 29 * S, py + ph + 3 * S], radius=6 * S, fill=(120, 16, 30))
    d.rounded_rectangle([px, py, px + tw + 26 * S, py + ph], radius=4 * S, fill=(255, 255, 255), outline=RED, width=2 * S)
    d.text((w / 2, py + ph / 2), text, font=font, fill=INK, anchor="mm")

    # The foot: the golden arches, then the black count strip of the 2024 wrapper.
    arches = Image.open(ART / "mcdonalds-mark.png").convert("RGBA")
    aw = int(w * 0.18)
    arches = arches.resize((aw, int(aw * arches.height / arches.width)), Image.LANCZOS)
    sy0, sy1 = int(h * 0.895), int(h * 0.935)
    ax, ay = int(w * 0.07), sy0 - arches.height - 7 * S
    sh = shadow_of(arches, 4 * S, 0.5)
    img.alpha_composite(sh, (ax - (sh.width - aw) // 2 + 2 * S, ay - (sh.height - arches.height) // 2 + 4 * S))
    img.alpha_composite(arches, (ax, ay))
    d = ImageDraw.Draw(img)
    d.rectangle([0, sy0, w, sy1], fill=INK)
    d.rectangle([0, sy0 - 2 * S, w, sy0], fill=GOLD)
    small = ImageFont.truetype(HEAVY, 13 * S)
    label = f"GAME CARD{'S' if count > 1 else ''}  ·  COLLECTION {year}"
    lw = d.textlength(label, font=small)
    r = 9 * S
    x0 = (w - (lw + r * 2 + 6 * S)) / 2
    mid = (sy0 + sy1) / 2
    d.ellipse([x0, mid - r, x0 + r * 2, mid + r], outline=(255, 255, 255), width=2 * S)
    d.text((x0 + r, mid), str(count), font=small, fill=(255, 255, 255), anchor="mm")
    d.text((x0 + r * 2 + 6 * S, mid), label, font=small, fill=(255, 255, 255), anchor="lm")

    # The light on a foil pouch: round from side to side, one soft diagonal sheen, print grain.
    px_ = np.asarray(img.convert("RGB"), np.float32)
    x = np.linspace(-1, 1, w, dtype=np.float32)[None, :, None]
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    px_ *= 1 - 0.30 * np.abs(x) ** 2.4
    band = np.exp(-(((x + 0.46 - (y - 0.5) * 0.5) / 0.16) ** 2))
    px_ += 30 * band
    px_ += np.random.default_rng(7).normal(0, 2.2, px_.shape[:2] + (1,)).astype(np.float32)
    out = Image.fromarray(np.clip(px_, 0, 255).astype(np.uint8), "RGB").resize(alpha.size, Image.LANCZOS).convert("RGBA")
    out.putalpha(alpha)
    return out


def main() -> None:
    args = argparse.ArgumentParser()
    args.add_argument("--out", type=Path, help="write previews here and leave assets/ alone")
    out_dir = args.parse_args().out
    for set_id in SETS:
        img = build(set_id)
        if out_dir:
            out_dir.mkdir(parents=True, exist_ok=True)
            img.save(out_dir / f"{set_id}.png")
            continue
        base = ROOT / "assets" / "packs" / set_id / f"pack-0-v{VERSION}"
        if base.with_suffix(".png").exists():
            print(f"{set_id}: v{VERSION} is already there; bump VERSION to redraw")
            continue
        img.save(base.with_suffix(".png"), optimize=True)
        img.save(base.with_suffix(".avif"), quality=90)
        print(f"{set_id}: wrote {base}.png and .avif")


if __name__ == "__main__":
    main()
