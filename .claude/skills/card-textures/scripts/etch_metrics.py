#!/usr/bin/env python3
"""Numbers that say whether an etch map will draw a line screen, before you look.

    python3 .claude/skills/card-textures/scripts/etch_metrics.py assets/foil/maps/sv8pt5/155-etch.webp assets/foil/maps/me55/mep108-etch-v3.webp

One line per map (an RGBA map: white with the etch as the alpha channel):

  lb   peak / mean of the 2D FFT in the 2 to 9 px period band. One dominant
       pitch is a screen once the browser scales the map. TCG Live's etches
       measure 8 to 18, a straight grating 30 to 200.
  ori  share of that band's energy within 12 degrees of its dominant
       direction. Live: 0.19 to 0.50. Parallel stripes: 0.7 and up.
  mid  share of etched pixels between 0.25 and 0.75. Live: 0.55 to 0.65; ours
       run higher (0.8), which reads as sheen, not lines.
  coh  local direction coherence, structure tensor at sigma 8, weighted by
       gradient energy. Live: 0.34 to 0.59. The straight-facet gratings this
       skill drew until 2026-09-29 measured 0.70 (0.58 to 0.78) and read as
       diagonal hatching at 340 px; the fingerprint draw measures 0.30 to 0.45.

The numbers rank candidates; the verdict is a WebKit render at 220 and 340 CSS
px x 3 beside a Live-etch print of similar art (foil_probe.mjs --browser webkit).
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def alpha(path):
    im = Image.open(path)
    a = im.getchannel("A") if im.mode in ("RGBA", "LA") else im.convert("L")
    return np.asarray(a).astype(np.float32) / 255


def band(a):
    """(lb, ori, mid) of an etch alpha array."""
    h, w = a.shape
    win = a[int(h * .2):int(h * .8), int(w * .1):int(w * .9)].copy()
    win -= win.mean()
    win *= np.outer(np.hanning(win.shape[0]), np.hanning(win.shape[1]))
    F = np.abs(np.fft.fftshift(np.fft.fft2(win)))
    hh, ww = F.shape
    yy, xx = np.mgrid[:hh, :ww]
    fy, fx = (yy - hh / 2) / hh, (xx - ww / 2) / ww
    f = np.hypot(fy, fx)
    m = (f > 1 / 9) & (f < 1 / 2)
    lb = F[m].max() / F[m].mean()
    ang = np.mod(np.arctan2(fy, fx), np.pi)
    hist, _ = np.histogram(ang[m], bins=90, range=(0, np.pi), weights=(F ** 2)[m])
    k = hist.argmax()
    ori = hist[[(k + d) % 90 for d in range(-6, 7)]].sum() / hist.sum()
    e = a[a > 0.05]
    mid = float(((e > .25) & (e < .75)).mean()) if e.size else 0.0
    return float(lb), float(ori), mid


def coherence(a, sigma=8):
    g = ndimage.gaussian_filter(a, 0.8)
    gx, gy = ndimage.sobel(g, axis=1), ndimage.sobel(g, axis=0)
    jxx, jyy, jxy = (ndimage.gaussian_filter(v, sigma) for v in (gx * gx, gy * gy, gx * gy))
    tr = jxx + jyy + 1e-9
    coh = 2 * np.sqrt(((jxx - jyy) / 2) ** 2 + jxy ** 2) / tr
    return float((coh * tr / tr.sum()).sum())


if __name__ == "__main__":
    for p in sys.argv[1:]:
        a = alpha(p)
        lb, ori, mid = band(a)
        print(f"{p.split('assets/')[-1][-46:]:48s} lb {lb:5.1f}  ori {ori:4.2f}  mid {mid:4.2f}  coh {coherence(a):4.2f}")
