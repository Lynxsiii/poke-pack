"""Draw the orange-peel facet tile the Sun & Moon GX / Prism Star foils light.

Photos of Espeon-GX sm1 61 and Solgaleo & Lunala-GX sm12 75 (texture-refs/gx-tag-prism)
show the foil under a specular pool as crumpled metal: irregular pebbled dimples about
1% of the card wide, no direction, no pitch. It is not a grating, so nothing here can
beat against the screen into a line pattern. The tile is a seamless heightfield (band-passed
noise, FFT-periodic) lit from a fixed direction; the output is white with the specular
response as alpha, so it only ever adds light (glitter never darkens).

    python3 .claude/skills/card-textures/scripts/make_sm_peel.py            # assets/foil/sm-peel.webp
"""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]


def periodic_noise(n, sigma_lo, sigma_hi, rng):
    f = np.fft.fftfreq(n)[:, None] ** 2 + np.fft.fftfreq(n)[None, :] ** 2
    spec = np.fft.fft2(rng.standard_normal((n, n)))
    # difference of Gaussians in the frequency domain: a ring of features
    filt = np.exp(-2 * (np.pi * sigma_lo) ** 2 * f) - np.exp(-2 * (np.pi * sigma_hi) ** 2 * f)
    h = np.real(np.fft.ifft2(spec * filt))
    return h / h.std()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--seed", type=int, default=3017)
    ap.add_argument("--lo", type=float, default=2.2, help="small-feature sigma in tile px")
    ap.add_argument("--hi", type=float, default=5.0, help="large-feature sigma in tile px")
    ap.add_argument("--power", type=float, default=14.0)
    ap.add_argument("--out", default="assets/foil/sm-peel.webp")
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    h = periodic_noise(a.size, a.lo, a.hi, rng)
    # Isotropic facets: where the crumpled surface faces the lamp is where the
    # band-passed height peaks (a directional normal dot product drew worm-like
    # diagonal strands, which read as a grating). Soft-thresholded blobs.
    lo, hi = np.percentile(h, 62), np.percentile(h, 97)
    spec = np.clip((h - lo) / (hi - lo), 0, 1) ** 1.3
    alpha = (spec * 255).round().astype(np.uint8)
    white = np.full_like(alpha, 255)
    out = ROOT / a.out
    Image.fromarray(np.dstack([white, white, white, alpha]), "RGBA").save(out, "WEBP", quality=80, alpha_quality=85, method=6)
    print(out, out.stat().st_size, "bytes; mean alpha", round(float(alpha.mean()), 1))


if __name__ == "__main__":
    main()
