#!/usr/bin/env python3
"""Write the swsh-vmax band gradients into css/holo/fam/swsh-vmax.css between the `bands.py: begin/end` markers.

An even repeat of one band read as a ruler pattern over a large pale Pokemon (Flying Pikachu VMAX cel25-7, Togekiss
VMAX swsh4-141; lead review 2026-11-23). So the bands are two sets that do not line up: set A at 120 deg (rising right,
about 60 deg from horizontal) with three bands of uneven width and strength in a 23% period, set B at 113 deg with two
in a 37% period (the sheet sizes and slides them differently). Each set is broken along its length by a breaker
gradient that runs along the bands (30 / 24 deg), on and off at uneven lengths. Each gradient stays short (about thirty
stops at most): WebKit drops a lit layer whose gradient runs to about ninety (reference/fam-swsh-fullart.md).
`light` is screened into the colour-dodge group (times the scan's luminance), `tint` is the pastel the .glare
multiplies onto the light inks; `break` multiplies the light, `break-tint` (its inverse) is screened over the tint.
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


def grad(name, angle, period, bands, kind, sat=0.4, top=1.0):
    """bands: [(start%, end%, strength)] inside one period (percent of the gradient line); top scales the light."""
    base = "rgb(0, 0, 0)" if kind == "light" else "rgb(255, 255, 255)"
    stops = [f"{base} 0%"]
    for a, b, s in bands:
        stops.append(f"{base} {a:.2f}%")
        stops += band(a, b, s * top, kind, sat)
        stops.append(f"{base} {b:.2f}%")
    stops.append(f"{base} {period:.2f}%")
    return f"  --{name}: repeating-linear-gradient({angle}deg, " + ", ".join(stops) + ");"


def breaker(name, angle, segs, invert=False):
    """segs: [(position%, grey 0..255)], a soft on/off along the bands; invert for the tint's screen layer."""
    stops = []
    for p, g in segs:
        v = 255 - g if invert else g
        stops.append(f"rgb({v}, {v}, {v}) {p:.2f}%")
    return f"  --{name}: repeating-linear-gradient({angle}deg, " + ", ".join(stops) + ");"


A = (120, 23, [(0.5, 5.5, 1.0), (8.5, 11.5, 0.55), (15.0, 19.5, 0.8)])
B = (113, 37, [(2.0, 7.0, 0.7), (19.0, 22.5, 0.45)])
BREAK_A = (30, [(0, 255), (6, 255), (9, 60), (11, 60), (14.5, 255), (23, 255), (26, 120), (29.5, 255), (31, 255)])
BREAK_B = (24, [(0, 255), (4, 255), (8, 80), (12, 255), (19, 255), (21, 150), (24, 150), (27, 255), (35, 255),
                (39, 50), (41, 255), (43, 255)])


def main(sheet):
    lines = []
    for pre, top_a, top_b, sat in (("svm-v", 1.0, 0.75, 0.42), ("svm-s", 0.8, 0.6, 0.32)):
        lines += [
            grad(f"{pre}-light-a", A[0], A[1], A[2], "light", top=top_a),
            grad(f"{pre}-light-b", B[0], B[1], B[2], "light", top=top_b),
            grad(f"{pre}-tint", A[0], A[1], A[2], "tint", sat),
        ]
    lines += [
        breaker("svm-break-a", *BREAK_A),
        breaker("svm-break-b", *BREAK_B),
        breaker("svm-break-tint", *BREAK_A, invert=True),
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
