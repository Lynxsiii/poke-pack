#!/usr/bin/env python3
"""Print the xy-ex-mega prism-bar gradient (`--xm-bars` in css/holo/fam/xy-ex-mega.css).

What the real cards do (audit w2-xy-ex, 2026-10-22: Pokemon Holo's tilt clip of Mewtwo-EX 62/162, Charizard-EX 11/106,
Gengar-EX 34/119; the English Team Aqua's Kyogre-EX 6/34 and Team Magma's Groudon-EX 15/34 under a lamp): the rainbow is
DISCRETE narrow vertical prism bars, each about 2.5-7 % of the card's width (3-4 % on Mewtwo-EX, 5-7 % on the Double Crisis pair) and the full height of the foil it crosses, a
saturated spectrum across the bar, only two or three on the card at once, with wide gaps (25-45 % of the card) where the
foil is just the print and a silver sparkle. They slide sideways as the card turns.

The layer is 400 % of the card wide (background-size 400% 100%), so in layer units a bar of 1.2 % is 4.8 % of the card and
a gap of 9 % is 36 %. The spacing and the widths are irregular (no two bars the same distance apart, so the card never
shows a regular comb) and each bar has its own strength. The gaps are TRANSPARENT: the sheet lays the bars over black for
colour-dodge (black is the dodge identity) and over 50 % grey for hard-light (the hard-light identity), and `.cure` uses them
bare (a transparent hard-light layer changes nothing).

    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/make_bars.py

Deterministic (fixed table below). Paste the output into the vars rule as `--xm-bars`.
"""

# (centre in layer %, width in layer %, strength 0..1). Only about 34-66 % of the layer is ever on the card (the
# columns move by 0.35 / 0.07 of --background-x/-y, whose range is 37-63 %); the rest keeps the edges of a sweep filled.
BARS = [
    (2.0, 1.2, 0.9), (11.5, 1.05, 0.8), (19.0, 1.3, 1.0), (28.5, 1.1, 0.85), (36.0, 1.35, 1.0), (45.5, 1.05, 0.8),
    (52.5, 1.3, 1.0), (62.0, 1.2, 0.9), (69.5, 1.35, 1.0), (78.5, 1.05, 0.85), (86.0, 1.3, 1.0), (95.0, 1.2, 0.9),
]

# a spectrum across the bar, red on the left to violet on the right: (fraction of the width from the left edge, hue, sat, light)
SPEC = [
    (0.12, 350, 100, 60), (0.26, 30, 100, 58), (0.38, 58, 100, 55), (0.5, 120, 95, 55), (0.62, 180, 100, 55),
    (0.75, 225, 100, 64), (0.88, 285, 95, 66),
]


def fmt(v: float) -> str:
    return f"{v:.3f}".rstrip("0").rstrip(".")


def main() -> None:
    stops = ["hsla(0, 0%, 0%, 0) 0%"]
    for c, w, s in BARS:
        left = c - w / 2
        stops.append(f"hsla(350, 100%, 60%, 0) {fmt(left)}%")
        for f, h, sa, li in SPEC:
            stops.append(f"hsla({h}, {sa}%, {li}%, {fmt(s)}) {fmt(left + f * w)}%")
        stops.append(f"hsla(285, 95%, 66%, 0) {fmt(left + w)}%")
    stops.append("hsla(0, 0%, 0%, 0) 100%")
    print("  --xm-bars: linear-gradient(90deg,")
    line = "   "
    out = []
    for i, st in enumerate(stops):
        piece = f" {st}" + ("," if i < len(stops) - 1 else ");")
        if len(line) + len(piece) > 118:
            out.append(line)
            line = "   "
        line += piece
    out.append(line)
    print("\n".join(out))


if __name__ == "__main__":
    main()
