"""Render the poke-pack.rip profile icon into assets/.

Square lockup: three real card scans fanned over an ember glow, the wordmark,
and a tagline. Everything is laid out inside the inscribed circle, because
every place this gets used as an avatar - Discord, X, Bluesky - crops it round
and would otherwise eat the corners.

Colours come straight off the site's tokens in css/app.css, so the icon and the
header brand stay the same thing:

    --bg #09070d   --ink #f4efe4   --gold #f0c14b   --rip #ff4d6d

    py scripts/make_avatar.py [--variant warm|neon|classic] [--all]

--all writes every variant to scripts/_debug/ for comparison instead of
publishing one to assets/.
"""
from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DEBUG_DIR = ROOT / "scripts" / "_debug"

SIZE = 1024
CENTER = SIZE / 2
# Content stays inside this radius. The avatar circle is the full inscribed
# circle (512); the margin keeps strokes and glows off the crop edge.
SAFE_R = 462

BG = (9, 7, 13)
INK = (244, 239, 228)
GOLD = (240, 193, 75)
GOLD_DEEP = (196, 137, 26)
RIP = (255, 77, 109)
RIM = (255, 231, 186)   # warm edge drawn under each card in the small mark
MUTED = (155, 148, 136)

# Windows ships no Archivo Black, the site's display face. Arial Black is the
# same species of heavy grotesque and is indistinguishable once the icon is
# scaled to an avatar; swap in ArchivoBlack-Regular.ttf here if it is ever
# vendored into the repo.
DISPLAY_FONT = Path("C:/Windows/Fonts/ariblk.ttf")

# Card fan, front-most last. Offsets are from the fan's centre, angles in
# degrees counter-clockwise.
VARIANTS = {
    "warm": {
        "cards": [
            ("me2-125", -25, (-172, 36)),      # Mega Charizard X ex SIR - dark navy, orange fire
            ("me2pt5-290", -7, (-18, -16)),    # Mega Dragonite ex SIR - warm cream
            ("me2pt5-294", 13, (140, 32)),     # Mega Charizard Y ex - solid gold
        ],
        "tagline": "RIP PACKS · FILL THE BINDER",
    },
    "neon": {
        "cards": [
            ("me2pt5-284", -25, (-172, 36)),   # Mega Gengar ex SIR - magenta
            ("me4-116", -7, (-18, -16)),       # Mega Greninja ex SIR - rainbow
            ("me2pt5-294", 13, (140, 32)),     # Mega Charizard Y ex - solid gold
        ],
        "tagline": "REAL ODDS · NO REAL MONEY",
    },
    "classic": {
        "cards": [
            ("me2-125", -25, (-172, 36)),      # Mega Charizard X ex SIR
            ("me2pt5-276", -7, (-18, -16)),    # Pikachu ex SIR - forest green
            ("me2pt5-294", 13, (140, 32)),     # Mega Charizard Y ex - solid gold
        ],
        "tagline": "PULL LIKE IT'S REAL",
    },
}

FAN_CENTER = (CENTER + 10, 368)
# The mark reuses the variant's three cards, spread into a wide symmetric fan
# instead of the lockup's overlapping one: at 40px an overlapping fan collapses
# into a single blob, while a spread one still shows three colours. The gold
# chase goes in the middle where it is flanked rather than swallowing the tile.
# Entries index into the variant's card list.
MARK_CARD_H = 540
MARK_FAN = [
    (0, -27, (-178, 58)),
    (2, 0, (0, 0)),
    (1, 27, (178, 58)),
]
CARD_H = 388
WORDMARK_W = 686
WORDMARK_Y = 722          # top of the wordmark
TAGLINE_Y = 832           # top of the tagline
TRACKING = 0.045          # wordmark letter-spacing, as a fraction of size
TAGLINE_TRACKING = 0.24


def font(size):
    return ImageFont.truetype(str(DISPLAY_FONT), size)


def text_width(draw, runs, size, tracking):
    """Width of a list of (text, colour) runs drawn with manual tracking."""
    face = font(size)
    gap = size * tracking
    total = 0.0
    for chunk, _ in runs:
        for ch in chunk:
            total += draw.textlength(ch, font=face) + gap
    return total - gap if total else 0.0


def draw_tracked(draw, runs, size, tracking, top, target_w):
    """Centre a tracked run of text on `target_w` and return its box."""
    face = font(size)
    gap = size * tracking
    width = text_width(draw, runs, size, tracking)
    x = CENTER - width / 2
    left = x
    for chunk, colour in runs:
        for ch in chunk:
            draw.text((x, top), ch, font=face, fill=colour)
            x += draw.textlength(ch, font=face) + gap
    return (left, top, x - gap, top + size)


def fit_size(runs, tracking, target_w, hi=200):
    """Largest point size whose tracked width still fits `target_w`."""
    probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    lo, best = 8, 8
    while lo <= hi:
        mid = (lo + hi) // 2
        if text_width(probe, runs, mid, tracking) <= target_w:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return best


def radial(colour, alpha, centre, radius, falloff=2.0):
    """A soft radial bloom as an RGBA layer, painted at 1/8 scale for speed."""
    small = SIZE // 8
    layer = Image.new("L", (small, small), 0)
    px = layer.load()
    cx, cy = centre[0] / 8, centre[1] / 8
    r = radius / 8
    for y in range(small):
        for x in range(small):
            d = math.hypot(x - cx, y - cy) / r
            if d >= 1:
                continue
            px[x, y] = int(alpha * 255 * (1 - d) ** falloff)
    layer = layer.resize((SIZE, SIZE), Image.BICUBIC).filter(ImageFilter.GaussianBlur(10))
    out = Image.new("RGBA", (SIZE, SIZE), colour + (0,))
    out.putalpha(layer)
    return out


def background():
    img = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    # Ember behind the fan: gold core, a hotter "rip" bloom inside it.
    img.alpha_composite(radial(GOLD_DEEP, 0.62, (FAN_CENTER[0], 400), 580, 1.4))
    img.alpha_composite(radial(GOLD, 0.40, (FAN_CENTER[0], 360), 350, 2.0))
    img.alpha_composite(radial(RIP, 0.26, (FAN_CENTER[0] - 60, 320), 270, 2.2))

    # Vignette, so the round crop lands on darkness rather than mid-glow.
    ring = Image.new("L", (SIZE, SIZE), 0)
    rp = ring.load()
    for y in range(SIZE):
        for x in range(SIZE):
            d = math.hypot(x - CENTER, y - CENTER) / CENTER
            if d > 0.70:
                rp[x, y] = int(min(1.0, (d - 0.70) / 0.34) ** 1.5 * 235)
    ring = ring.filter(ImageFilter.GaussianBlur(18))
    shade = Image.new("RGBA", (SIZE, SIZE), (4, 3, 6, 0))
    shade.putalpha(ring)
    img.alpha_composite(shade)
    return img


def grain(img, strength=7):
    """The same fine noise the site lays over its background."""
    rnd = random.Random(20260821)
    small = SIZE // 2
    noise = Image.new("L", (small, small))
    noise.putdata([rnd.randint(128 - strength, 128 + strength) for _ in range(small * small)])
    noise = noise.resize((SIZE, SIZE), Image.BILINEAR)
    speckle = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(img.convert("RGB"), speckle, 0.045).convert("RGBA")


def card_layer(card_id, angle, offset, height=None, centre=None, rim=0):
    height = height or CARD_H
    centre = centre or FAN_CENTER
    set_id, number = card_id.rsplit("-", 1)
    src = Image.open(ASSETS / "cards" / set_id / f"{number}.webp").convert("RGBA")
    w = round(height * src.width / src.height)
    src = src.resize((w, height), Image.LANCZOS)

    # Drop shadow from the card's own alpha, so it follows the rounded corners.
    pad = 60
    plate = Image.new("RGBA", (w + pad * 2, height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", plate.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 165), (pad, pad + 20), src.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    plate.alpha_composite(shadow)
    if rim:
        # A warm edge so one card still reads as separate from the next once
        # the tile is 32px across and the art inside them is gone.
        edge = src.split()[3].filter(ImageFilter.MaxFilter(rim * 2 + 1))
        plate.paste(RIM, (pad, pad), edge)
    plate.paste(src, (pad, pad), src)

    plate = plate.rotate(angle, resample=Image.BICUBIC, expand=True)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = round(centre[0] + offset[0] - plate.width / 2)
    y = round(centre[1] + offset[1] - plate.height / 2)
    layer.alpha_composite(plate, (x, y))
    return layer


def glow_text(img, runs, size, tracking, top, colour, spread=26, alpha=0.55):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_tracked(ImageDraw.Draw(layer), [(c, colour + (255,)) for c, _ in runs], size, tracking, top, SIZE)
    layer = layer.filter(ImageFilter.GaussianBlur(spread))
    layer.putalpha(layer.split()[3].point(lambda v: int(v * alpha)))
    img.alpha_composite(layer)


def render(variant):
    spec = VARIANTS[variant]
    img = background()

    for card_id, angle, offset in spec["cards"]:
        img.alpha_composite(card_layer(card_id, angle, offset))

    # A little heat spilling out from behind the fan and over its bottom edge,
    # so the cards sit in the glow instead of on top of it.
    img.alpha_composite(radial(GOLD, 0.20, (FAN_CENTER[0], 560), 470, 2.2))

    img = grain(img)
    draw = ImageDraw.Draw(img)

    runs = [("POKE-PACK", INK + (255,)), (".RIP", GOLD + (255,))]
    size = fit_size(runs, TRACKING, WORDMARK_W)
    glow_text(img, runs, size, TRACKING, WORDMARK_Y, GOLD_DEEP)
    draw = ImageDraw.Draw(img)
    draw_tracked(draw, runs, size, TRACKING, WORDMARK_Y, WORDMARK_W)

    tag = [(spec["tagline"], GOLD + (235,))]
    tag_size = min(36, fit_size(tag, TAGLINE_TRACKING, 580))
    draw_tracked(draw, tag, tag_size, TAGLINE_TRACKING, TAGLINE_Y, WORDMARK_W)
    return img


def render_mark(variant):
    """Cards only, filling the tile.

    The header sits this next to the wordmark in text, so the mark must not
    repeat it: at 32px a lockup is unreadable mush and says the name twice. A
    fan of three chase pulls is a shape, and a shape still reads that small.
    """
    img = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    img.alpha_composite(radial(GOLD_DEEP, 0.70, (CENTER, CENTER), 620, 1.3))
    img.alpha_composite(radial(GOLD, 0.46, (CENTER, CENTER - 40), 400, 1.9))
    img.alpha_composite(radial(RIP, 0.24, (CENTER - 70, CENTER - 80), 300, 2.2))

    fan = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for index, angle, offset in MARK_FAN:
        fan.alpha_composite(card_layer(
            VARIANTS[variant]["cards"][index][0], angle, offset,
            height=MARK_CARD_H, centre=(CENTER, CENTER), rim=4,
        ))
    # Centre what was actually drawn rather than trusting the offsets: a fan is
    # wider at the top than the bottom, so its ink never sits where its
    # construction lines say it does.
    box = fan.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    shift = (round(CENTER - (box[0] + box[2]) / 2), round(CENTER - (box[1] + box[3]) / 2))
    img.alpha_composite(fan, (max(0, shift[0]), max(0, shift[1])),
                        (max(0, -shift[0]), max(0, -shift[1]), SIZE, SIZE))

    img.alpha_composite(radial(GOLD, 0.16, (CENTER, CENTER + 190), 380, 2.2))
    return grain(img)


def safety(img):
    """How far the drawn content reaches, measured against the crop budget.

    Anything much brighter than the flat background counts as content, so this
    catches a card corner or a stray letter poking into the round crop.
    """
    px = img.convert("RGB").load()
    worst = 0.0
    for y in range(0, SIZE, 2):
        for x in range(0, SIZE, 2):
            r, g, b = px[x, y]
            if abs(r - BG[0]) + abs(g - BG[1]) + abs(b - BG[2]) > 42:
                worst = max(worst, math.hypot(x - CENTER, y - CENTER))
    return worst


def circle_preview(img, px=256):
    small = img.convert("RGB").resize((px, px), Image.LANCZOS)
    mask = Image.new("L", (px * 4, px * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    mask = mask.resize((px, px), Image.LANCZOS)
    out = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    out.paste(small, (0, 0), mask)
    return out


# 256 is the biggest the site ever draws the mark (60px account tile at 4x),
# so shipping 512 would be a third of a megabyte for a 44px header logo.
ICON_SIZES = [("mark.png", 256), ("icon-180.png", 180), ("icon-32.png", 32)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="warm", choices=sorted(VARIANTS))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--mark", action="store_true",
                    help="render the cards-only tile the header and favicons use")
    args = ap.parse_args()

    if args.mark:
        img = render_mark(args.variant).convert("RGB")
        for name, px in ICON_SIZES:
            path = ASSETS / name
            img.resize((px, px), Image.LANCZOS).save(path, optimize=True)
            print(f"  {path.relative_to(ROOT)}  {px}px  {path.stat().st_size:,} bytes")
        return 0

    if args.all:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        for name in sorted(VARIANTS):
            img = render(name)
            img.convert("RGB").save(DEBUG_DIR / f"avatar-{name}.png", optimize=True)
            print(f"  {name}: reach {safety(img):.0f}px of {SAFE_R} safe")
        return 0

    img = render(args.variant)
    reach = safety(img)
    out = ASSETS / "avatar.png"
    img.convert("RGB").save(out, optimize=True)
    circle_preview(img, 512).save(ASSETS / "avatar-round.png", optimize=True)
    print(f"  {out.relative_to(ROOT)}  {out.stat().st_size:,} bytes")
    print(f"  content reaches {reach:.0f}px from centre (round crop cuts past {SAFE_R})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
