#!/usr/bin/env python3
"""Write Dialga-EX 122/119's silver bands, rainbow stripes and lamp mask as three CSS gradients.

The real card (eBay scans and photos in /mnt/project-files/holo-remaster/xy-secret-silver/refs/) shows three or four tall
vertical bands across the card at once, dark grey to bright silver, each its own width and depth, with a thin rainbow
stripe on most dark-to-bright edges: some strong, some faint, unevenly spaced (the lamp photo yPgAAeSwfEhqqKse, the scans
2ewAAeSwtqBqQzB6 and MDcAAeSwwHBquXU3). The first remake (v17) repeated one band and one stripe every half card, so the
card showed two identical stripes half a card apart.

Here the bands are SEGMENTS laid end to end over one repeat of the 200%-wide background (two card widths), each:
a dark core at its start (its own lightness), a ramp to bright silver with the stripe on it (red on the dark side, the
violet end onto the bright band), a bright band (its own peak and width) and a soft fall into the next segment's core.
`--xss-lit` is opaque on each bright band (the lamp lights only bright-band ridges). The sweep factor keeps about one
stripe passing a point per pointer sweep (rainbow_motion.py median 1.1, the limit is 1.5).

    python3 .claude/skills/card-textures/scripts/fam/xy-secret-silver/make_bands.py           # print the CSS
    python3 .claude/skills/card-textures/scripts/fam/xy-secret-silver/make_bands.py --write   # rewrite the sheet's values
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
SHEET = ROOT / "css/holo/fam/xy-secret-silver.css"

# width (% of the 200% background), dark core lightness, bright peak lightness, bright band share of the segment,
# stripe width (% of the background), stripe alpha
SEGS = [
    [13.0, 24, 96, 0.44, 2.6, 0.85], [16.0, 28, 93, 0.48, 1.8, 0.60], [12.0, 25, 97, 0.40, 2.3, 0.80],
    [17.5, 23, 96, 0.50, 3.0, 0.90], [14.0, 27, 92, 0.42, 1.7, 0.60], [15.0, 25, 95, 0.46, 2.4, 0.75],
    [12.5, 26, 94, 0.40, 2.0, 0.65]]
FALL = (0.08, 0.17, 0.28, 0.45)  # where the fall reaches 74%, 50%, core + 8 and core + 3, as shares of the band's tail
SWEEP_X, SWEEP_Y = 1.1, 0.1
HUES = [(0, 88, 58), (24, 95, 58), (50, 98, 56), (105, 72, 52), (180, 85, 50), (215, 92, 63), (262, 75, 69)]


def pct(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".") + "%"


def grey(l: float, h: int = 212, s: int = 8) -> str:
    return f"hsl({h}, {s}%, {round(l)}%)"


def gradients() -> dict:
    assert abs(sum(s[0] for s in SEGS) - 100) < 1e-6, "the segments must fill one repeat"
    bands, stripe, lit = [], [("hsla(0, 88%, 58%, 0)", 0.0)], [("rgba(0, 0, 0, 0)", 0.0)]
    x0 = 0.0
    for i, (w, dark, peak, share, sw, alpha) in enumerate(SEGS):
        dark_next = SEGS[(i + 1) % len(SEGS)][1]
        ramp0 = x0 + w * 0.26
        ramp1 = ramp0 + max(sw * 0.8, w * 0.06)
        b_end = min(ramp1 + w * share, x0 + w * 0.8)
        tail = x0 + w - b_end
        bands += [(grey(dark), x0), (grey(dark + 2), x0 + w * 0.1), (grey(dark + 5), x0 + w * 0.2),
                  (grey(dark + 8), ramp0), (grey(60, 220, 10), ramp0 + (ramp1 - ramp0) * 0.6),
                  (grey(82, 225, 14), ramp1), (grey(min(92, peak - 2), 225, 18), ramp1 + w * 0.04),
                  (grey(peak, 0, 0), ramp1 + (b_end - ramp1) * 0.35), (grey(peak - 2, 40, 10), ramp1 + (b_end - ramp1) * 0.7),
                  (grey(88, 210, 6), b_end), (grey(74, 212, 7), b_end + tail * FALL[0]), (grey(50), b_end + tail * FALL[1]),
                  (grey(dark_next + 8), b_end + tail * FALL[2]), (grey(dark_next + 3), b_end + tail * FALL[3])]
        s0 = ramp0 - sw * 0.2
        stripe.append(("hsla(0, 88%, 58%, 0)", s0))
        stripe += [(f"hsla({h}, {s}%, {l}%, {alpha})", s0 + sw * (0.13 + k * 0.117)) for k, (h, s, l) in enumerate(HUES)]
        stripe.append(("hsla(262, 75%, 69%, 0)", s0 + sw))
        lit += [("rgba(0, 0, 0, 0)", ramp1 - w * 0.02), ("rgba(0, 0, 0, 1)", ramp1 + w * 0.02),
                ("rgba(0, 0, 0, 1)", b_end - w * 0.02), ("rgba(0, 0, 0, 0)", b_end + w * 0.012)]
        x0 += w
    bands.append((grey(SEGS[0][1]), 100.0))
    stripe.append(("hsla(262, 75%, 69%, 0)", 100.0))
    lit.append(("rgba(0, 0, 0, 0)", 100.0))
    out = {}
    for name, stops in (("xss-bands", bands), ("xss-stripe", stripe), ("xss-lit", lit)):
        xs = [x for _, x in stops]
        assert xs == sorted(xs), f"{name}: stops out of order"
        parts = [f"{c} {pct(x)}" for c, x in stops]
        rows = [", ".join(parts[i:i + 4]) for i in range(0, len(parts), 4)]
        out[name] = "repeating-linear-gradient(90deg,\n    " + ",\n    ".join(rows) + ")"
    out["xss-sweep-pos"] = (f"calc(50% + (var(--background-x) - 50%) * {SWEEP_X} + "
                            f"(var(--background-y) - 50%) * {SWEEP_Y}) 0")
    return out


def main() -> None:
    values = gradients()
    if "--write" not in sys.argv:
        for name, value in values.items():
            print(f"  --{name}: {value};")
        return
    css = SHEET.read_text()
    for name, value in values.items():
        css, n = re.subn(rf"  --{name}: .*?;\n", lambda _m: f"  --{name}: {value};\n", css, count=1, flags=re.S)
        assert n == 1, f"--{name} not found in {SHEET}"
    SHEET.write_text(css)
    print(f"wrote {SHEET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
