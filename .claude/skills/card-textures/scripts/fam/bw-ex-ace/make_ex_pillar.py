"""Draw the light of the Black & White Pokemon-EX foil under one lamp (family bw-ex-ace): the pillar and its fan.

What the real card does (audit 2026-10-22: Darkrai-EX 88/113 three tilt frames, /home/user/holo-refs/bw-ex-a/shared/
ph-darkrai-ex-bw5-63_3frames.jpg; Lugia-EX BW83 tilt pair, /home/user/holo-refs/bw-ex-b/same-stock/
lugia-ex-bw83-plasma-tilt-foot-colour-blocks.png; Keldeo-EX in hand): under one lamp the EX foil throws ONE pillar about a
tenth of the card wide, blazing: a broad, mottled white-hot core in a column of saturated colour whose edges are ragged and
streaky, the colour in blotches, changing mostly down its length (cyan/white at the top, red-orange and yellow mid, green-blue
lower) and a little across it, the whole broken by sparkle grain. Beside it, at most a short run of broad smooth colour
blocks (4-6% of the card wide each) in spectral order, much dimmer than the pillar. The rest of the foil stays silver.

What this draws (RGBA, colour premultiplied by nothing; the alpha IS the shape):

  ex-pillar.webp   the pillar, 34% of the card wide by two card heights (one spectrum per 0.6 card height, so the sheet
                   can slide the drift with background-position-y). Round 3 (the reviewer: "a pasted RGB ribbon": parallel,
                   hard-edged, ruler-straight stripes, smooth inside) draws it as the Darkrai photos show it: the column's
                   middle wanders a little down its length (+-0.7% of the card, slow, plus a fine jitter) and so does its
                   width (+-22%); its edges are ragged (vertical streak noise added to the distance from the middle); alpha 1
                   over the inner 55% of its half-width (about 7% of the card in all), falling to 0 by about +-8.7%, a pale
                   bloom of 0.25 to +-15%, and mottled (0.55-1). A broad white-hot core about 5.6% wide (+-35% down the
                   length), its edge jittered and its strength mottled, with thin white streaks running down the colour
                   beside it. The hue is
                   H(y) drifting down the length (the main change, cyan at the top, violet, red-orange, yellow, green-blue),
                   plus a mild sideways fan (15 deg per 5% of the card) and round patches (+-25 deg about 3% of the card big,
                   +-12 deg smaller), so the colour comes in blotches that change along the pillar. Saturation 100%, lightness
                   58%, every channel lifted to at least about 0.3 so under hard-light a blue or magenta patch tints a pale
                   ground more than it darkens it (a light only adds light). The image is 34% of the card wide (the edges
                   fenced to zero) by two card heights.
  ex-fan.webp      the blocks beside it, 46% of the card wide by two card heights: four broad, very soft blocks 6% of the
                   card wide at -18.5, -11.5, +11.5 and +18% of the card from the pillar's middle, alpha 0.24 for the inner
                   two and 0.12 for the outer two (well under the pillar), each the same spectrum as the pillar shifted by
                   its own phase and by 45 deg per block left to right (spectral order across the run, as at Lugia's foot),
                   lightness 58%.

  Round 4 (review: "pale green and white, split into 3-4 thin parallel stripes"; the real Darkrai pillar is a saturated
  warm rainbow, red on one side and yellow-green on the other of a white core): the warm run (red, orange, yellow) now
  takes about 40% of the spectrum and green-to-cyan 20%, lightness 52% (was 58%), the sideways fan 18 deg per 5% (a warm
  flank either side of the white core, as in Darkrai frame 1; 30 deg laid a whole spectrum across), hue patches +-32 deg,
  the white core about 3.5% wide (was 5.6%) and no thin white streaks; the fan's blocks at half strength (0.13 / 0.06), so
  they no longer read as separate stripes.

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ex_pillar.py
        # -> assets/foil/fam/bw-ex-ace/ex-pillar.webp, ex-fan.webp

Re-running with the same arguments rewrites the same bytes. Once shipped, write a changed image under a new name.
"""
import argparse
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, gaussian_filter1d

ROOT = Path(__file__).resolve().parents[6]
CARD_ASPECT = 1.395  # height / width
PERIOD = 0.6         # the pillar's hue runs through one spectrum in this many card heights (Darkrai frame 1: cyan
                     # at the top of the art to red at its foot, about 0.35 card heights, for about 200 deg)


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def hsl_to_rgb(h, s, l):
    """Vectorised HSL (h in degrees) to RGB 0..1."""
    h = (h % 360) / 360.0
    out = np.zeros(h.shape + (3,))
    flat_h = h.ravel()
    flat_s = np.broadcast_to(s, h.shape).ravel()
    flat_l = np.broadcast_to(l, h.shape).ravel()
    res = np.array([colorsys.hls_to_rgb(a, c, b) for a, b, c in zip(flat_h, flat_s, flat_l)])
    return res.reshape(out.shape)


def spectrum(t):
    """The pillar's hue down one card height (t 0..1 top to bottom): cyan at the top, violet, red, orange and yellow
    mid, green-blue lower, back to cyan, with the warm part drawn out (it is the brightest on the real card)."""
    t = t % 1.0
    # piecewise-linear hue keyed on t; hues increase (unwrapped) so the drift is continuous
    # round 4 (review: "pale green and white"): the warm run (red, orange, yellow) takes about 40% of the period, the
    # green-to-cyan return only 20%, as in the Darkrai-EX 88/113 frames
    keys_t = np.array([0.00, 0.10, 0.22, 0.34, 0.50, 0.66, 0.80, 0.90, 1.00])
    keys_h = np.array([190, 235, 300, 355, 385, 410, 450, 500, 550])
    return np.interp(t, keys_t, keys_h) % 360


def hsl_to_rgb_fast(h, s, l):
    """Vectorised HSL (h in degrees, s and l scalars or arrays) to RGB 0..1."""
    h = (h % 360) / 30.0
    s = np.broadcast_to(s, h.shape)
    l = np.broadcast_to(l, h.shape)
    a = s * np.minimum(l, 1 - l)
    out = []
    for n in (0, 8, 4):
        k = (n + h) % 12
        out.append(l - a * np.maximum(-1, np.minimum(np.minimum(k - 3, 9 - k), 1)))
    return np.stack(out, -1)


def unit(v):
    v = v - v.mean()
    return v / (v.std() + 1e-9)


def ragged_pillar(px_per_card, width_frac, seed=63):
    """The round-3 pillar: ragged, mottled, streaky, a broad white core, hue drifting down its length (see the docstring)."""
    rng = np.random.default_rng(seed)
    w = int(round(px_per_card * width_frac))
    h = int(round(px_per_card * CARD_ASPECT * 2))
    ppy = h / 2.0                                                      # px per card height
    x = (np.arange(w) + 0.5) / px_per_card - width_frac / 2           # card widths from the middle
    y = (np.arange(h) + 0.5) / h * 2                                   # card heights, 0..2
    X, Y = np.meshgrid(x, y)

    def n1(sig_h):                                                     # smooth 1-D noise down the length, unit std
        return unit(gaussian_filter1d(rng.standard_normal(h), sig_h * ppy, mode="reflect"))[:, None]

    def n2(sig_h, sig_w):                                              # 2-D noise, sigma in card heights / widths
        return unit(gaussian_filter(rng.standard_normal((h, w)), (sig_h * ppy, sig_w * px_per_card), mode="reflect"))

    centre = 0.007 * n1(0.06) + 0.0025 * n1(0.012)
    dx = X - centre
    half = 0.065 * np.clip(1 + 0.22 * n1(0.10), 0.6, 1.5)
    edge = 0.012 * n2(0.02, 0.009)                                    # ragged edges
    ax = np.abs(dx) + edge
    flat = 0.55 * half
    zero = half + 0.022
    alpha = 1 - smooth((ax - flat) / (zero - flat))
    mottle = n2(0.012, 0.012)
    alpha = alpha * np.clip(0.86 + 0.18 * mottle, 0.55, 1)
    bloom = 0.25 * (1 - smooth((ax - flat) / (0.15 - flat)))
    # the white-hot core: broad, its width wandering, its edge jittered, its strength mottled
    core_half = 0.017 * np.clip(1 + 0.35 * n1(0.05), 0.45, 1.8)       # round 4: about 3.5% wide (was 5.6%)
    white = 1 - smooth((np.abs(dx) + 0.007 * n2(0.015, 0.006) - core_half) / 0.016)
    white = white * np.clip(0.9 + 0.2 * n2(0.012, 0.010), 0.6, 1)
    # a few thin white streaks down the colour beside the core
    # (round 3 drew a few thin white streaks down the colour; round 4 drops them: with the core they read as parallel
    # stripes. The noise is still drawn so every later draw keeps its round-3 values.)
    streak = smooth((n2(0.05, 0.003) - 1.6) / 0.8) * (1 - smooth((np.abs(dx) - 0.7 * half) / 0.02)) * 0.0
    white = np.maximum(white, streak)
    # hue: drift down the length (the main change), a mild sideways fan, and patches of two sizes
    hue = spectrum(Y / PERIOD) + 18 * dx / 0.05 + 32 * n2(0.02, 0.028) + 12 * n2(0.01, 0.012)
    rgb = hsl_to_rgb_fast(hue, 1.0, 0.52)                              # round 4: deeper hue (was lightness 58%)
    rgb = rgb * 0.82 + 0.18                                            # every channel >= ~0.27: a light mostly adds light
    pale = 0.75 * smooth((ax - (zero - 0.01)) / 0.03)
    rgb = rgb * (1 - pale[..., None]) + pale[..., None] * 0.92          # the bloom is pale: light, not more rainbow
    rgb = rgb * (1 - white[..., None]) + white[..., None]
    fence = 1 - smooth((np.abs(X) - (width_frac / 2 - 0.025)) / 0.02)  # nothing reaches the image's sides
    a = np.maximum(alpha, bloom) * fence
    return np.dstack([rgb, a])


def fan(px_per_card, width_frac, blocks, light):
    w = int(round(px_per_card * width_frac))
    h = int(round(px_per_card * CARD_ASPECT * 2))
    x = (np.arange(w) + 0.5) / px_per_card - width_frac / 2
    y = (np.arange(h) + 0.5) / h * 2
    X, Y = np.meshgrid(x, y)
    alpha = np.zeros_like(X)
    rgb = np.zeros(X.shape + (3,))
    for i, (centre, width, a, phase) in enumerate(blocks):
        half = width / 2
        soft = width * 0.45                                               # soft edge on each side
        d = np.abs(X - centre)
        prof = (1 - smooth((d - (half - soft)) / soft)) * a
        hue = spectrum(Y + phase) + 45 * (i - (len(blocks) - 1) / 2)
        col = hsl_to_rgb(hue, 1.0, light)
        take = prof > alpha
        rgb[take] = col[take]
        alpha = np.maximum(alpha, prof)
    return np.dstack([rgb, alpha])


def save(arr, out):
    a8 = (np.clip(arr, 0, 1) * 255).round().astype(np.uint8)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a8, "RGBA").save(out, "WEBP", quality=88, alpha_quality=90, method=6)
    print(out, a8.shape[1], "x", a8.shape[0], out.stat().st_size, "bytes")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--px-per-card", type=int, default=500, help="image px per card width")
    ap.add_argument("--out-dir", default="assets/foil/fam/bw-ex-ace")
    a = ap.parse_args()
    out = ROOT / a.out_dir
    save(ragged_pillar(a.px_per_card, 0.34), out / "ex-pillar.webp")
    # round 4: the blocks at half their round-3 strength (0.13 / 0.06): at 0.24 they read as separate stripes beside the pillar
    blocks = [(-0.185, 0.060, 0.06, 0.37), (-0.115, 0.060, 0.13, 0.11), (0.115, 0.060, 0.13, 0.63), (0.180, 0.060, 0.06, 0.83)]
    save(fan(200, 0.46, blocks, 0.58), out / "ex-fan.webp")             # 200 px per card, as in round 2


if __name__ == "__main__":
    main()
