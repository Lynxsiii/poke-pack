#!/usr/bin/env python3
"""Write the swsh-v band gradients into css/holo/fam/swsh-v.css between the `bands.py: begin/end` markers.

Each gradient is a short repeating gradient (about twenty stops: WebKit drops a lit layer whose gradient runs to about
ninety, reference/fam-swsh-fullart.md). Two bands per period, a strong one and a weaker one, so the repeat is less
regular. `light` is the colour the sheet screens into the colour-dodge group (times the scan's luminance), `tint` the
pastel the .glare multiplies onto the light inks.
  python3 bands.py <sheet.css>
"""
import re
import sys

HUES = [(255, 0, 128), (255, 85, 0), (255, 235, 0), (40, 255, 0), (0, 255, 255), (0, 64, 255), (148, 0, 255)]


def rgb(c):
    return f"rgb({', '.join(str(max(0, min(255, round(v)))) for v in c)})"


def band(a, b, scale, kind, sat):
    out = []
    n = len(HUES)
    for i, h in enumerate(HUES):
        p = a + (b - a) * (i + 0.5) / n
        c = [v * scale for v in h] if kind == "light" else [255 - (255 - v) * sat * scale for v in h]
        out.append(f"{rgb(c)} {p:.2f}%")
    return out


def grad(name, angle, period, bands, kind, sat=0.4):
    """bands: [(start%, end%, strength)] inside one period (percent of the gradient line)."""
    base = "rgb(0, 0, 0)" if kind == "light" else "rgb(255, 255, 255)"
    stops = [f"{base} 0%"]
    for a, b, s in bands:
        stops.append(f"{base} {a:.2f}%")
        stops += band(a, b, s, kind, sat)
        stops.append(f"{base} {b:.2f}%")
    stops.append(f"{base} {period:.2f}%")
    return f"  --{name}: repeating-linear-gradient({angle}deg, " + ", ".join(stops) + ");"


def main(sheet):
    # V: bands rising to the right at about 58 deg from horizontal (gradient at 122 deg), sized 200% of the card, so a
    # strong band is about 10% of the card wide and a weaker one 7%, three or four across the card.
    lines = [
        grad("svv-light", 122, 16, [(0.8, 5.8, 0.6), (9.2, 12.8, 0.4)], "light"),
        grad("svv-tint", 122, 16, [(0.8, 5.8, 1.0), (9.2, 12.8, 0.7)], "tint", 0.5),
    ]
    css = open(sheet).read()
    block = "  /* bands.py: begin */\n" + "\n".join(lines) + "\n  /* bands.py: end */"
    css, n = re.subn(r"  /\* bands\.py: begin \*/.*?/\* bands\.py: end \*/", lambda m: block, css, flags=re.S)
    if n != 1:
        sys.exit("markers not found")
    open(sheet, "w").write(css)
    print("wrote", sheet)


if __name__ == "__main__":
    main(sys.argv[1])
