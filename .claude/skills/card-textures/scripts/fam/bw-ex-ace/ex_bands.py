"""Print the EX colour strips (the light either side of the main pillar) for css/holo/fam/bw-ex-ace.css.

What the real card does (audit 2026-10-22; Darkrai-EX 88/113 tilt frames, Lugia-EX BW83 tilt, Chandelure-EX 77, Keldeo-EX
in-hand, Kyogre-EX in-hand; /home/user/holo-refs/bw-ex-a and bw-ex-b): under one lamp the vertical EX foil throws ONE narrow
grainy pillar (the .foil::before layer) and, close beside it, a short run of vertical colour blocks (Lugia's foot); every
block's hue drifts along its length (Darkrai's pillar runs cyan, red-orange, yellow, green-blue down the card) and
neighbouring blocks differ. Everywhere else the foil is a silver sheen, and in diffuse light there is no colour at all.

What this prints: one background layer per strip, each a vertical hue ramp (one spectrum per card height, two in its 200%
tall image, its own phase so neighbours differ) at the strip's alpha, sized to the strip's width (1.2 to 2.6% of the card,
hard edges) and positioned at (pillar + offset) with no repeat, so the strips travel with the pillar and nothing paints
more than about 0.14 card widths from it. Strength falls from 0.36 next to the pillar to 0.15 at the far strips (the pillar must lead); beyond
them the group is the plain grey (the sheen). The ramp slides down with --bxa-y and a little with the sideways tilt, about
one spectrum for a full sweep (rainbow_speed's limit is 1.5).

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/ex_bands.py
        # paste the three custom properties into the .bw-ex rule of css/holo/fam/bw-ex-ace.css
"""
HUES = [215, 190, 160, 95, 55, 30, 345, 285]   # blue cyan green lime yellow orange red-magenta violet: one cycle
# (offset from the pillar in card widths, strip width in card widths, alpha, phase step into HUES)
STRIPS = [
    (-0.128, 0.016, 0.15, 5), (-0.095, 0.012, 0.26, 1), (-0.066, 0.022, 0.36, 6),
    (+0.064, 0.012, 0.36, 2), (+0.094, 0.026, 0.26, 4), (+0.128, 0.014, 0.15, 7),
]


def ramp(alpha, shift):
    n = len(HUES)
    stops = []
    for i in range(2 * n + 1):
        h = HUES[(i + shift) % n]
        stops.append(f"hsla({h}, 100%, 60%, {alpha:.2f}) {i * 100 / (2 * n):.2f}%")
    return "linear-gradient(180deg, " + ", ".join(stops) + ")"


def num(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


imgs, sizes, poss = [], [], []
for d, w, a, k in STRIPS:
    imgs.append(ramp(a, k))
    sizes.append(f"{num(w * 100)}% 200%")
    # a no-repeat layer w wide at position p stands at p (1 - w): p = (x + d - w/2) / (1 - w)
    A, B = 100 / (1 - w), (d - w / 2) * 100 / (1 - w)
    poss.append(f"calc(var(--bxa-x) * {num(A)}% {'+' if B >= 0 else '-'} {num(abs(B))}%) var(--bxa-ry)")
print("  --bxa-strips:\n    " + ",\n    ".join(imgs) + ";")
print("  --bxa-strip-size: " + ", ".join(sizes) + ";")
print("  --bxa-strip-pos:\n    " + ",\n    ".join(poss) + ";")
