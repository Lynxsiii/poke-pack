"""Sun & Moon window holo (family sm-holo): the sparkle and streak tiles.

  python3 .claude/skills/card-textures/scripts/fam/sm-holo/make_sparkle.py [--v 1]

Writes assets/foil/fam/sm-holo/sparkle-v<N>.webp and streaks-v<N>.webp, both 512 x 512, seamless, light on black (they
ride inside the colour-dodged `.cure` layer, so black adds nothing and a dot or a streak only ever adds light).
The sheet shows each at 100% of the card's width: 220 CSS px on a phone, so 2.3 tile px per CSS px.

  sparkle  the fine pinpoint sparkle of the real cards (Gigalith sm1 71, Charizard sm75 3: specks about 1 px at phone
           size, dense): soft dots of sigma 0.9 tile px, about one per 45 CSS px^2, a few brighter than the rest.
  streaks  the sparse, thin, long, straight light streaks over the rainbow (same photos): 1 CSS px wide, at about +30,
           -30 and 75 degrees, fading at both ends.
"""
import argparse
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
OUT = os.path.join(ROOT, "assets/foil/fam/sm-holo")
N = 512
# Peak levels: the tiles are screened onto a dark gain inside a colour-dodge, so a full-white dot would divide by
# (almost) zero and blow every speck under it to white; at these peaks a dot or streak multiplies the print by 2-3.
PEAK_SPARKLE = 0.6
PEAK_STREAK = 0.5


def blur_wrap(a, sigma):
    """Gaussian blur with wrap-around (seamless), via FFT."""
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def sparkle(rng):
    a = np.zeros((N, N))
    count = int((220 * 220) / 45)
    ys = rng.integers(0, N, count)
    xs = rng.integers(0, N, count)
    level = rng.random(count) ** 2.2  # most faint, a few bright
    np.add.at(a, (ys, xs), 0.25 + 0.75 * level)
    a = blur_wrap(a, 0.9) * (2 * np.pi * 0.9 ** 2)
    return np.clip(a, 0, 1) * PEAK_SPARKLE


def streaks(rng):
    a = np.zeros((N, N))
    angles = [30, -30, 75, 32, -28, 78, 28, -33, 72, 35, -26]
    for ang in angles:
        t = np.deg2rad(ang)
        length = rng.uniform(0.35, 0.8) * N
        cx, cy = rng.uniform(0, N, 2)
        bright = rng.uniform(0.45, 1.0)
        steps = int(length * 2)
        for i in range(steps):
            u = i / steps
            fade = np.sin(np.pi * u) ** 1.5
            x = (cx + (u - 0.5) * length * np.cos(t)) % N
            y = (cy + (u - 0.5) * length * np.sin(t)) % N
            xi, yi = int(x), int(y)
            a[yi, xi] = max(a[yi, xi], bright * fade)
    a = blur_wrap(a, 0.8) * 3.2
    return np.clip(a, 0, 1) * PEAK_STREAK


def save(a, name):
    img = Image.fromarray((a * 255).round().astype(np.uint8), "L").convert("RGB")
    path = os.path.join(OUT, name)
    img.save(path, "WEBP", lossless=True)
    print("wrote", os.path.relpath(path, ROOT), "mean", round(float(a.mean()) * 255, 2), "cover>0.3", round(float((a > 0.3).mean()), 4))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--v", type=int, default=1)
    args = p.parse_args()
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(20261022)
    save(sparkle(rng), f"sparkle-v{args.v}.webp")
    save(streaks(rng), f"streaks-v{args.v}.webp")


if __name__ == "__main__":
    main()
