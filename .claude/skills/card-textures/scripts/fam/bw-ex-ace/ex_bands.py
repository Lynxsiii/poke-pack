"""Print the CSS gradient for the EX band comb: vertical bands of small spectra with alpha, in an image three
card-widths wide (u = 50% is the main pillar; a card-width offset d sits at u = 50 + d * 100/3 %).
Irregular spacing and widths (no fixed period), strength falling off with distance from the main pillar.
Every alpha is lifted a -> min(0.95, 0.30 + 0.75a) (2026-10-02): the far bands (0.14 to 0.3) read pastel at phone size, the lift
keeps the fall-off and gives them a 0.4 floor. Paste the printed gradient into --bxa-bands in css/holo/fam/bw-ex-ace.css."""
import math
SPEC = {
 'a': [220, 190, 150],        # blue cyan green
 'b': [55, 30, 330],          # yellow orange magenta
 'c': [140, 75, 45],          # green lime yellow
 'd': [275, 230, 195],        # violet blue cyan
 'e': [330, 290, 250],        # magenta violet blue
 'f': [185, 160, 95],         # cyan green lime
}
# (offset d in card widths, half-width, spectrum)
BANDS = [
 (-1.30, 0.045, 'f'), (-1.08, 0.05, 'c'), (-0.86, 0.055, 'e'), (-0.65, 0.05, 'a'), (-0.41, 0.06, 'b'),
 (-0.23, 0.05, 'd'), (0.0, 0.075, 'a'), (0.19, 0.055, 'b'), (0.42, 0.065, 'e'), (0.60, 0.045, 'c'),
 (0.83, 0.06, 'd'), (1.04, 0.05, 'f'), (1.27, 0.055, 'b'),
]
def alpha(d):
    return 0.85 if d == 0 else max(0.18, 0.85 * math.exp(-abs(d) / 0.6))
def lift(a):
    return min(0.95, 0.30 + 0.75 * a)
def hsla(h, a, l=60):
    return f"hsla({h}, 100%, {l}%, {lift(a):.2f})"
u = lambda dd: 50 + dd * 100 / 3
stops = ["transparent 0%"]
for d, hw, key in BANDS:
    hs, pk = SPEC[key], alpha(d)
    stops += [f"transparent {u(d - hw):.2f}%", f"{hsla(hs[0], pk * 0.75)} {u(d - hw * 0.45):.2f}%",
              f"{hsla(hs[1], pk)} {u(d):.2f}%", f"{hsla(hs[2], pk * 0.75)} {u(d + hw * 0.45):.2f}%",
              f"transparent {u(d + hw):.2f}%"]
stops.append("transparent 100%")
print("linear-gradient(90deg,\n    " + ",\n    ".join(", ".join(stops[i:i + 5]) for i in range(0, len(stops), 5)) + ")")
