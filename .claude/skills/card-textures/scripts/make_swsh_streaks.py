#!/usr/bin/env python3
"""Draw the Sword & Shield "textured" streak tile: assets/foil/swsh-streaks.webp.

Every Sword & Shield Pokémon V, VMAX, VSTAR and full-art Trainer is etched
with long straight streaks running lower left to upper right at about 55
degrees (reference: /mnt/project-files/sword-shield/texture-refs/v-regular,
trainer-full-art). TCG Live ships no etch for the regular V, and the etch it
ships for the full arts follows the painting, so the streaks are drawn here:
a family of parallel lines a few millimetres apart whose brightness and
width vary streak by streak and along each streak, so some run the whole
card and others fade in and out. Seamless (integer wave numbers). Alpha is
the streak; RGB is white. css/holo/swsh.css lights it under the pointer on
`.glare::after` and cuts the V foil to it.

    python3 .claude/skills/card-textures/scripts/make_swsh_streaks.py
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "foil", "swsh-streaks.webp")
W = 512


def main():
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:W, 0:W].astype(np.float64) / W
    tau = 2 * np.pi
    # Lines perpendicular to (a, b): direction (b, -a), 55 degrees from the
    # horizontal, rising to the right. 63 lines across the tile.
    a, b = 52, 36
    u = a * x + b * y            # across the streaks (integer period: seamless)
    v = b * x - a * y            # along the streaks
    lines = 0.5 + 0.5 * np.cos(tau * u)
    # Each streak has its own strength and width: a seeded profile over u,
    # periodic in the tile.
    k = np.arange(1, 9)
    strength = np.zeros_like(u)
    for i, f in enumerate(k):
        strength += rng.uniform(0.3, 1) * np.sin(tau * (f * u / (a + b) * 0 + f * (u / 88.0)) + rng.uniform(0, tau)) / (i + 1)
    strength = 0.55 + 0.45 * np.tanh(2 * strength)
    # Streaks fade in and out along their length.
    along = 0.5 + 0.5 * (np.sin(tau * (3 * v / 88.0) + 0.3) * np.cos(tau * (2 * u / 88.0)))
    along = 0.35 + 0.65 * along
    thresh = 0.55 + 0.3 * (1 - strength)
    etch = np.clip((lines - thresh) / (1 - thresh), 0, 1) ** 0.6 * strength * along
    # A sparser, thinner second family at the same angle, offset, for the
    # in-between hairlines the photos show under a hard light.
    fine = 0.5 + 0.5 * np.cos(tau * (2 * u + 0.5))
    fine = np.clip((fine - 0.8) / 0.2, 0, 1) * 0.35 * (0.5 + 0.5 * np.sin(tau * (v / 88.0 + 0.2)))
    alpha = np.clip(np.maximum(etch, fine), 0, 1)
    img = np.zeros((W, W, 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(OUT, "WEBP", quality=80, method=6)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {W}x{W}, etched {alpha.mean():.0%}, {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    sys.exit(main())
