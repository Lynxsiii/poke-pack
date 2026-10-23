#!/usr/bin/env python3
"""Print the `--bwfa-stripes` gradient of css/holo/fam/bw-full-art.css (the flat full arts' rainbow stripes).

Real cards (Reshiram 113 EF macro and in-hand clip, N 101 CGC slab, Thundurus 97 and Tornadus 98 tilt clips): narrow,
crisp, fully saturated vertical spectral stripes, each a few percent of the card wide, at uneven gaps, two or three
bright near the light and more, fainter, across the face. Each stripe here runs blue, cyan, green, yellow, orange, red
on a 0.5 grey (hard-light leaves it alone), with plateaus at both ends (a one-pixel violet or red sliver broke into dark
dots). Positions, widths and strengths are uneven on purpose: an even repeat read as a printed candy stripe (review
2026-10-22). The image is 180% of the card wide in the CSS, so a gap of g% of the image is 1.8 g% of the card.

    python3 .claude/skills/card-textures/scripts/fam/bw-full-art/stripes.py   # paste the output over the variable
"""
from __future__ import annotations

STARTS = [2, 10.5, 17, 29, 36.5, 49, 58, 66, 78.5, 87, 95]  # % of the image
WIDTHS = [2.0, 1.7, 2.3, 1.8, 2.1, 1.6, 2.2, 1.9, 2.0, 1.7, 2.1]
STRENGTH = [1.0, 0.7, 0.95, 0.75, 1.0, 0.65, 0.9, 0.75, 1.0, 0.7, 0.9]
# (fraction of the stripe, hue, saturation, lightness)
RUN = [(0.07, 222, 90, 52), (0.2, 222, 90, 52), (0.33, 190, 95, 46), (0.46, 125, 75, 43), (0.6, 52, 100, 50),
       (0.7, 30, 100, 52), (0.8, 356, 88, 55), (0.93, 356, 88, 55)]
GREY = "hsl(0, 0%, 50%)"


def colour(h: int, s: int, l: int, k: float) -> str:
    """The stripe colour taken toward the 0.5 grey by k (1: full strength)."""
    return f"hsl({h}, {round(s * k)}%, {round(50 + (l - 50) * k)}%)"


def main() -> None:
    parts = [f"{GREY} 0%"]
    for start, width, k in zip(STARTS, WIDTHS, STRENGTH):
        parts.append(f"{GREY} {start:.2f}%")
        parts += [f"{colour(h, s, l, k)} {start + width * f:.2f}%" for f, h, s, l in RUN]
        parts.append(f"{GREY} {start + width:.2f}%")
    parts.append(f"{GREY} 100%")
    lines, cur = [], "    "
    for i, part in enumerate(parts):
        text = part + (", " if i < len(parts) - 1 else ");")
        if len(cur) + len(text) > 118:
            lines.append(cur.rstrip())
            cur = "    "
        cur += text
    lines.append(cur.rstrip())
    print("  --bwfa-stripes: linear-gradient(96deg,\n" + "\n".join(lines))


if __name__ == "__main__":
    main()
