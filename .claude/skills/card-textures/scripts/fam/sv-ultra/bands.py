"""Print the two band gradients of css/holo/fam/sv-ultra.css (--svu-light and --svu-tint).

The Scarlet & Violet full-art Ultra Rares throw several narrow, parallel, diagonal rainbow bands toward grazing angles,
of uneven width and strength (photos: /home/user/holo-refs/w2-sv-ur). One period of the repeating gradient holds three
bands (strong, weak, medium) at uneven spacing, so the face shows five or six bands that do not read as a regular
grating. The same stops draw:
  --svu-light  what .foil's colour-dodge adds: black between the bands, each band a spectrum whose brightest channel is
               at most LIGHT_MAX (dodge gain <= 1 / (1 - LIGHT_MAX)), so near-black ink stays near black.
  --svu-tint   what the hard-light .glare multiplies onto its grey: white between, each band's complement taken off, so
               a band is a saturated spectrum on the silver frame and on pale ink rather than a white streak.
Usage: python3 bands.py   (paste the output into the sheet's shared rule)
"""

PERIOD = 26.0  # % of the tile's gradient line (tile 200% of the card at 120deg: the line is ~3.13 card widths)
ANGLE = 120
# (start %, width %, strength 0-1) inside one period
BANDS = [(2.0, 3.2, 1.0), (9.6, 1.8, 0.55), (15.6, 2.5, 0.8)]
LIGHT_MAX = 0.5
# hue stops of one band: (fraction across the band, light rgb 0-1 before scaling, tint rgb 0-1 at full strength)
SPECTRUM = [
    (0.10, (0.95, 0.10, 0.35), (1.00, 0.66, 0.72)),
    (0.26, (1.00, 0.35, 0.08), (1.00, 0.72, 0.52)),
    (0.42, (1.00, 0.85, 0.06), (1.00, 0.95, 0.56)),
    (0.58, (0.45, 1.00, 0.20), (0.66, 1.00, 0.62)),
    (0.74, (0.08, 0.92, 1.00), (0.52, 0.94, 1.00)),
    (0.88, (0.25, 0.45, 1.00), (0.64, 0.70, 1.00)),
    (0.97, (0.75, 0.20, 1.00), (0.86, 0.60, 1.00)),
]


def css(rgb):
    return "rgb(%d, %d, %d)" % tuple(round(max(0, min(1, c)) * 255) for c in rgb)


def gradient(kind):
    neutral = "#000" if kind == "light" else "#fff"
    stops = [f"{neutral} 0%"]
    for start, width, k in BANDS:
        stops.append(f"{neutral} {start:.2f}%")
        for f, light, tint in SPECTRUM:
            if kind == "light":
                col = tuple(c * LIGHT_MAX * k for c in light)
            else:
                col = tuple(1 - (1 - c) * k for c in tint)
            stops.append(f"{css(col)} {start + f * width:.2f}%")
        stops.append(f"{neutral} {start + width:.2f}%")
    stops.append(f"{neutral} {PERIOD:.2f}%")
    body = ",\n    ".join(", ".join(stops[i:i + 4]) for i in range(0, len(stops), 4))
    return f"repeating-linear-gradient({ANGLE}deg,\n    {body})"


if __name__ == "__main__":
    print("  --svu-light: " + gradient("light") + ";")
    print("  --svu-tint: " + gradient("tint") + ";")
