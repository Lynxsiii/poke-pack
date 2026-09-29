#!/usr/bin/env python3
"""Draw the Sword & Shield "textured" streak tile: assets/foil/swsh-streaks-v2.webp.

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
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
# -v2 (2026-09-29): the first tile had 63 hairlines across the card, a 3.5 px
# pitch on a phone, and Noah saw a diagonal line screen over Surfing Pikachu
# V. Assets are cached immutable for a year, so the new tile takes a new name.
OUT = os.path.join(ROOT, "assets", "foil", "swsh-streaks-v2.webp")
W = 512


def smooth_field(rng, shape, scale, amp):
    """A smooth random field, periodic in the tile (seamless), amplitude amp."""
    f = rng.normal(size=shape)
    f = ndimage.gaussian_filter(f, scale, mode="wrap")
    f -= f.mean()
    return f / (f.std() + 1e-9) * amp


def main():
    rng = np.random.default_rng(11)
    y, x = np.mgrid[0:W, 0:W].astype(np.float64) / W
    tau = 2 * np.pi
    # Lines perpendicular to (a, b): 55 degrees from the horizontal, rising to
    # the right. 16 streaks across the tile (one card width), about 6% apart,
    # like the broad soft rays the Glaceon V and Zacian V photos show, not a
    # hairline grating. Integer wave numbers keep the tile seamless.
    a, b = 13, 9
    u = a * x + b * y
    v = b * x - a * y
    # The streaks wander: the phase across the streaks is bent by a smooth
    # field (verify.md: a straight grating aliases to a line screen).
    wander = smooth_field(rng, (W, W), 40, 0.16)
    lines = 0.5 + 0.5 * np.cos(tau * (u + wander))
    # Each streak has its own width and strength (a low-frequency profile
    # across u), and fades in and out along its length (a profile along v).
    strength = 0.5 + 0.5 * np.tanh(1.5 * smooth_field(rng, (W, W), 28, 1.0))
    along = 0.5 + 0.5 * np.tanh(1.2 * smooth_field(rng, (W, W), 60, 1.0))
    width = 0.35 + 0.4 * strength           # soft threshold: strong streaks are wider
    core = np.clip((lines - (1 - width)) / width, 0, 1)
    etch = core ** 1.4 * (0.35 + 0.65 * strength) * (0.3 + 0.7 * along)
    # Soft profile: a light blur so the edge of a streak is a gradient, and a
    # touch of grain so no two spots along a streak are alike.
    etch = ndimage.gaussian_filter(etch, 1.2, mode="wrap")
    grain = rng.uniform(0.85, 1.0, size=(W, W))
    alpha = np.clip(etch * grain, 0, 1)
    # Judge it by numbers before the look (SKILL.md): no fft peak far above
    # the mean, so the browser cannot turn it into a screen.
    spec = np.abs(np.fft.fft2(alpha - alpha.mean()))
    spec[0, 0] = 0
    peak = spec.max() / (spec.mean() + 1e-9)
    img = np.zeros((W, W, 4), np.uint8)
    img[..., :3] = 255
    img[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(OUT, "WEBP", quality=85, method=6)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {W}x{W}, etched {alpha.mean():.0%}, fft peak {peak:.0f}x mean, {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    sys.exit(main())
