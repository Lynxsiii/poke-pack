"""Draw the horizontal dash foil of the Black & White ACE SPEC Trainers (family bw-ex-ace), with a hue per dash.

What the real card does (audit 2026-10-22, photos in /home/user/holo-refs/bw-ace/: Computer Search sunlit zooms, Master Ball
and Crystal Wall room-light zooms, G Booster, Victory Piece clips; RegiPacks' Rock Guard close-up): the foil (border ring,
art ground, name strip, ACE SPEC lettering) is ruled with fine, straight HORIZONTAL dashes. Each line is 1-2 px tall at
phone size, lines sit 0.5-1% of the card height apart, and each dash runs 3-25% of the card width with gaps between, so the
rows are broken. In room light the dashes read neutral silver; in strong light each dash lights in its own saturated hue
(green, cyan, blue, violet, magenta, orange, yellow) and neighbouring dashes disagree like confetti. Dark ink over the foil
stays dark with thin bright lines across it.

What this draws: one card-sized RGBA image (no repeat on the card, so no seam and no grid). Alpha = the dash: rows two
(sometimes three) tile pixels tall, 1-3 px apart (pitch 3-6 px, random, so no single frequency to beat against the phone's
pixels), dashes 20-160 px long with 2-4 px end fades and 4-40 px gaps, each with a random brightness 0.5-1.0, nothing
between dashes (no floor). RGB = that dash's own hue at full saturation (hsl(h, 100%, 55%)), so the same image is the
colour (background) and the shape (mask) of the light layers and the two always register.

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ace_dash.py
        # -> assets/foil/fam/bw-ex-ace/ace-dash.webp (640 x 894, the card's 600:838 shape)
    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ace_dash.py --seed 4021 --keep 0.3 \
        --out assets/foil/fam/bw-ex-ace/ace-glint.webp
        # -> the glint sheet: a third of the dashes of another draw, so the white glints near the lamp fall on their own
        #    lines and leave most coloured dashes their hue (only its alpha is used)

Re-running with the same arguments rewrites the same bytes. Once the family has shipped, write a changed image under a new
name (--out ...-v2.webp) and point the sheet at it: /assets is cached for a year.
"""
import argparse
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
HUES = [140, 185, 215, 270, 320, 30, 55]   # green, cyan, blue, violet, magenta, orange, yellow


def draw(w, h, seed, keep=1.0):
    rng = np.random.default_rng(seed)
    alpha = np.zeros((h, w), np.float32)
    hue = np.zeros((h, w), np.float32)
    y = int(rng.integers(0, 3))
    while y < h:
        rh = int(rng.choice([2, 2, 2, 2, 3]))          # row height, tile px
        row_gain = rng.uniform(0.75, 1.0)               # some rows a little dimmer overall
        x = -int(rng.integers(0, 120))
        while x < w:
            length = int(np.exp(rng.uniform(np.log(20), np.log(160))))
            fade = int(rng.integers(2, 5))
            b = rng.uniform(0.5, 1.0) * row_gain
            hh = HUES[int(rng.integers(0, len(HUES)))] + rng.uniform(-8, 8)
            prof = np.ones(length, np.float32)
            ramp = (np.arange(fade, dtype=np.float32) + 1) / (fade + 1)
            prof[:fade] = np.minimum(prof[:fade], ramp)
            prof[-fade:] = np.minimum(prof[-fade:], ramp[::-1])
            x0, x1 = max(0, x), min(w, x + length)
            if keep < 1.0 and rng.uniform() > keep:                     # a sparser sheet: drop this dash
                x1 = x0
            if x1 > x0:
                seg = prof[x0 - x:x1 - x] * b
                for r in range(y, min(h, y + rh)):
                    edge = 0.55 if (rh == 3 and r == y + 2) else 1.0
                    alpha[r, x0:x1] = np.maximum(alpha[r, x0:x1], seg * edge)
                    hue[r, x0:x1] = hh
            x += length + int(rng.integers(4, 41))
        y += rh + int(rng.integers(1, 4))
    return alpha, hue


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=894)
    ap.add_argument("--seed", type=int, default=2013)
    ap.add_argument("--keep", type=float, default=1.0, help="share of the dashes drawn (the glint sheet keeps fewer)")
    ap.add_argument("--out", default="assets/foil/fam/bw-ex-ace/ace-dash.webp")
    a = ap.parse_args()
    alpha, hue = draw(a.width, a.height, a.seed, a.keep)
    lut = {}
    rgb = np.zeros((a.height, a.width, 3), np.uint8)
    hq = np.round(hue).astype(np.int32) % 360
    for hv in np.unique(hq):
        if hv not in lut:
            lut[hv] = [round(c * 255) for c in colorsys.hls_to_rgb(hv / 360, 0.55, 1.0)]
        rgb[hq == hv] = lut[hv]
    a8 = (np.clip(alpha, 0, 1) * 255).round().astype(np.uint8)
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([rgb, a8]), "RGBA").save(out, "WEBP", lossless=True, method=6, exact=True)
    print(out, out.stat().st_size, "bytes; mean alpha", round(float(a8.mean()), 1), "coverage", round(float((a8 > 40).mean()), 3))


if __name__ == "__main__":
    main()
