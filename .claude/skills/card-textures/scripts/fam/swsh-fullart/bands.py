#!/usr/bin/env python3
"""The rainbow bands of css/holo/fam/swsh-fullart.css, as CSS gradients (print them, paste them into the sheet).

Each finish gets two gradients with the same geometry:
  light  black between the bands, each band a compact spectrum whose brightest channel is at most LIGHT_MAX: screened
         inside the colour-dodge `.foil` group after being multiplied by the scan, so a band lifts the light inks most
         and leaves dark ink dark (dodge gain 1 / (1 - band x ink)).
  tint   white between the bands, each band the same hues as pastel tints (TINT_SAT of the full hue): multiplied onto the
         card through the inverted scan (1 - (1 - tint) x ink), so the bands colour the white keylines, the white wings
         and the silver frame, which the dodge cannot, and still leave dark ink alone.

Geometry (positions are % of the gradient line of a tile `size` x `size` of the card):
  vfa  the full-art V: broad bands, each about a third of the card wide, a short silver gap between, at 115deg
       (Charizard V SWSH050 on wood, Orbeetle V VIV 166, Umbreon V alt cs4aC 152).
  tfa  the full-art Supporter: many narrow streaks, 2-4% of the card wide, at uneven gaps of 6-12%, at 120deg (rising
       left to right about 60 degrees, the angled English Chili & Cilan & Cress FST 258).
  alt  the alternate arts: one broad arc of colour (Celebi V FST 245's sky, Umbreon V alt), the rest silver.

    python3 .claude/skills/card-textures/scripts/fam/swsh-fullart/bands.py
"""
import colorsys

LIGHT_MAX = 0.40
TINT_SAT = 0.36


def rgb(h, s=1.0, l=0.5):
    return colorsys.hls_to_rgb((h % 360) / 360, l, s)


def light(h, k):
    r, g, b = rgb(h)
    m = max(r, g, b)
    return tuple(c / m * LIGHT_MAX * k for c in (r, g, b))


def tint(h, k):
    r, g, b = rgb(h)
    sat = TINT_SAT * k
    return tuple(1 - sat + sat * c for c in (r, g, b))


def css(c):
    return f"rgb({round(c[0] * 255)}, {round(c[1] * 255)}, {round(c[2] * 255)})"


# the spectrum of one band, as the photos order it: magenta-pink, yellow, green, cyan, violet
HUES = [330, 20, 55, 110, 180, 225, 275]


def band_stops(start, width, k, kind, profile):
    """A band's stops: `profile` lists (hue or None for the silver-white core, place 0..1 across the band)."""
    stops = []
    for h, f in profile:
        pos = start + width * f
        if h is None:
            c = (CORE * k,) * 3 if kind == "light" else (1 - TINT_SAT * 0.15 * k,) * 3
        else:
            c = light(h, k) if kind == "light" else tint(h, k)
        stops.append((pos, c))
    return stops


# the broad band of the V and the alternate arts: a full spectrum, magenta-pink to violet
BROAD = [(h, 0.08 + 0.84 * i / (len(HUES) - 1)) for i, h in enumerate(HUES)]
# a Supporter's streak: a silver-white core with a blue-cyan edge on one side and yellow-pink on the other
STREAK = [(215, 0.1), (190, 0.26), (None, 0.45), (None, 0.58), (55, 0.74), (330, 0.9)]
CORE = 0.36


def gradient(angle, bands, kind, profile, end=100.0):
    """A linear gradient (end 100) or, for a shorter `end`, a repeating one of that period (WebKit drops a layer whose
    gradient runs to some ninety stops, so the Supporter's many streaks repeat a period of three)."""
    base = (0, 0, 0) if kind == "light" else (1, 1, 1)
    out = [f"{css(base)} 0%"]
    for start, width, k in bands:
        out.append(f"{css(base)} {start:.2f}%")
        for pos, c in band_stops(start, width, k, kind, profile):
            out.append(f"{css(c)} {pos:.2f}%")
        out.append(f"{css(base)} {start + width:.2f}%")
    out.append(f"{css(base)} {end:.2f}%")
    fn = "linear-gradient" if end >= 100 else "repeating-linear-gradient"
    lines, cur = [], f"{fn}({angle}deg,"
    for s in out:
        if len(cur) + len(s) + 2 > 116:
            lines.append(cur)
            cur = "   "
        cur += f" {s},"
    lines.append(cur.rstrip(",") + ")")
    return "\n".join(lines)


def vfa():
    # 200% tile at 115deg: the line is ~3.0 card widths; a band of 10-11% of it is a third of the card wide. One period
    # of 26% of the line (0.78 card widths) holds two bands of uneven strength with a short silver gap after each.
    return [(1.0, 11.0, 1.0), (14.5, 10.0, 0.8)]


VFA_PERIOD = 26.0


def tfa():
    # 150% tile at 120deg: the line is ~2.35 card widths. One period of 14% of the line (0.33 card widths) holds three
    # streaks of uneven width (2.2-2.8%: 5-6.5% of the card), strength and spacing, so about eleven cross the card.
    return [(0.4, 2.6, 1.0), (5.0, 2.2, 0.7), (9.3, 2.8, 0.88)]


TFA_PERIOD = 14.0


def alt():
    # 250% tile at 105deg (line ~3.3 card widths): one broad band of colour, about 40% of the card wide, through the
    # middle of the card held level, sliding about 0.4 card widths across a tilt; a faint echo beyond it
    return [(42, 13, 1.0), (72, 9, 0.45)]


def block():
    out = []
    for name, angle, bands, profile, end in (("v", 115, vfa(), BROAD, VFA_PERIOD), ("t", 120, tfa(), STREAK, TFA_PERIOD),
                                             ("a", 105, alt(), BROAD, 100.0)):
        for kind in ("light", "tint"):
            out.append(f"  --sfa-{name}-{kind}: {gradient(angle, bands, kind, profile, end)};")
    return "\n".join(out)


if __name__ == "__main__":
    import sys
    from pathlib import Path

    text = block()
    if "--write" in sys.argv:
        # replace the generated block between the markers in the family sheet
        sheet = Path(__file__).resolve().parents[6] / "css" / "holo" / "fam" / "swsh-fullart.css"
        css = sheet.read_text()
        a, b = "  /* bands.py: begin */\n", "  /* bands.py: end */\n"
        i, j = css.index(a) + len(a), css.index(b)
        sheet.write_text(css[:i] + text + "\n" + css[j:])
        print(f"wrote {sheet}")
    else:
        print(text)
