#!/usr/bin/env python3
"""Draw the foil masks of the EX generation's Pokemon-ex, Gold Star, Unown and secret rare frames: assets/foil/ex-ex/<name>.webp.

TCG Live published no foil maps for 2003-2007, so the masks are drawn (css/holo/ex-ex.css through `exMap()` in
js/ex-foil.js). The geometry is MEASURED on the Scrydex scans of ex1-ex16 (600 x 838): the art window's four edges are the
strongest brightness gradient on the rows and columns through it, taken per card and medianed over every card of a set (the
spread is 0.2 to 0.3 per cent of the card), and the other shapes (the evolution circle, the BASIC tab, the Knocked Out box,
the dot strip) are read off gridded scans. Everything below is a fraction of the card, so a mask stretches with it.

What is foil on the real card (Pokemon Holo's tilt clips of Lapras ex, Hitmonchan ex, Typhlosion ex; Collexy flat scans of
Mightyena ex and Vaporeon ex; see texture-refs/ex-ex/SOURCES.txt):
  * Pokemon-ex: the art window (the Pokemon too) and the SILVER FRAME all round it, a glittering ring: the outer border and the
    side strips next to the window. The name plate, the text box, the stats and the BASIC / evolution marks are flat print.
  * Gold Star, Unown, non-ex secret rares: the art window only; the yellow border is plain.

Variants (the frame moves a little from set to set):
    A   ex1, ex4, ex5, ex7-ex16   window x 6.7-93.1, y 8.85-46.4
    A2  ex2                       window x 7.8-92.3, y 9.2-46.5
    B   ex3, ex6                  window x 8.7-91.2, y 10.2-46.5
    `-s` suffix: the 13-line dot strip along the foot (ex2, ex3, ex4: cut out of the ring)
    `win-trainer`: the Supporter frame of Here Comes Team Rocket!
    `-basic` (BASIC tab cut) and `-stage` (evolution circle cut) for each; `win-` files are the window alone, `ring-` the
    window plus the silver frame.

Output: RGBA, alpha is where the foil is (window and silver frame), the colour is the art window alone (white in the window, black in the
frame, so a layer can take the window or the frame by mask-mode luminance or alpha minus luminance), 600 x 838, antialiased; about 1-2 KB each. Never
overwrite a shipped mask: `--suffix -v2` for a redraw.

    python3 scripts/make_ex_ex_masks.py --out assets/foil/ex-ex
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 600, 838
SS = 4  # supersampling

FRAMES = {
    "A": dict(L=6.7, R=93.1, T=8.85, B=46.4),
    "A2": dict(L=7.8, R=92.3, T=9.2, B=46.5),
    "B": dict(L=8.7, R=91.2, T=10.2, B=46.5),
}
RING_TOP = 2.2      # per cent of the height: the outer border above the name plate
RING_BOTTOM = 96.6  # the border under the footer
STRIP = dict(x0=46.0, x1=98.0, y0=91.0, y1=99.2)  # the dot strip (ex2-ex4)
KO_BOX = dict(x0=38.0, x1=96.8, y0=46.0, y1=53.5)  # "When Pokemon-ex has been Knocked Out" box under the window
TAB = dict(x0=2.0, x1=22.0, y0=44.6, y1=49.0)      # the BASIC tab
CIRCLE = dict(cx=10.4, cy=48.5, rx=7.4, ry=4.8)    # the evolution portrait and its ring


def px(v, n):
    return v / 100.0 * n * SS


def make(frame, ring, layout, strip):
    f = FRAMES[frame]
    w, h = W * SS, H * SS
    r = int(0.6 / 100 * w)
    win = Image.new("L", (w, h), 0)  # the window alone
    ImageDraw.Draw(win).rounded_rectangle((px(f["L"], W), px(f["T"], H), px(f["R"], W), px(f["B"], H)), radius=r, fill=255)
    allm = win.copy()                # window plus the silver frame
    if ring:
        rd = ImageDraw.Draw(allm)
        rd.rectangle((0, 0, px(f["L"], W), h), fill=255)
        rd.rectangle((px(f["R"], W), 0, w, h), fill=255)
        rd.rectangle((0, 0, w, px(RING_TOP, H)), fill=255)
        rd.rectangle((0, px(RING_BOTTOM, H), w, h), fill=255)
        # the Knocked Out box sits on the strips
        rd.rectangle((px(KO_BOX["x0"], W), px(KO_BOX["y0"], H), px(KO_BOX["x1"], W), px(KO_BOX["y1"], H)), fill=0)
        if strip:
            rd.rectangle((px(STRIP["x0"], W), px(STRIP["y0"], H), px(STRIP["x1"], W), px(STRIP["y1"], H)), fill=0)
        # the window stays whole inside the frame (the box above must not bite it)
        allm = Image.fromarray(np.maximum(np.asarray(allm), np.asarray(win)))
    # what is printed over the window's corner cuts both
    for im in (win, allm):
        d = ImageDraw.Draw(im)
        if layout == "basic":
            d.rounded_rectangle((px(TAB["x0"], W), px(TAB["y0"], H), px(TAB["x1"], W), px(TAB["y1"], H)), radius=int(0.8 / 100 * w), fill=0)
        elif layout == "stage":
            d.ellipse((px(CIRCLE["cx"] - CIRCLE["rx"], W), px(CIRCLE["cy"] - CIRCLE["ry"], H),
                       px(CIRCLE["cx"] + CIRCLE["rx"], W), px(CIRCLE["cy"] + CIRCLE["ry"], H)), fill=0)
    win = win.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    allm = allm.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    rgba = np.zeros((H, W, 4), np.uint8)
    # RGB (luminance) = the art window, alpha = everything that is foil: a layer that wants the frame only subtracts the
    # luminance from the alpha (mask-mode: alpha, luminance; mask-composite: subtract)
    wv = np.asarray(win)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = wv
    rgba[..., 3] = np.asarray(allm)
    return Image.fromarray(rgba, "RGBA")


def make_trainer():
    """The Trainer frame (Here Comes Team Rocket!, the one box-topper Trainer): window only, x 9.2-90.6, y 13.9-48.6."""
    f = dict(L=9.2, R=90.6, T=13.9, B=48.6)
    w, h = W * SS, H * SS
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((px(f["L"], W), px(f["T"], H), px(f["R"], W), px(f["B"], H)), radius=int(0.6 / 100 * w), fill=255)
    out = img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.asarray(out)
    return Image.fromarray(rgba, "RGBA")


# name -> (frame, ring, strip)
FILES = {
    "ring-A": ("A", True, False),
    "ring-A-s": ("A", True, True),
    "ring-A2-s": ("A2", True, True),
    "ring-B": ("B", True, False),
    "ring-B-s": ("B", True, True),
    "win-A": ("A", False, False),
    "win-B": ("B", False, False),
}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for name, (frame, ring, strip) in FILES.items():
        for layout in ("basic", "stage"):
            fn = os.path.join(a.out, f"{name}-{layout}{a.suffix}.webp")
            if os.path.exists(fn):
                print("exists, skipped", fn)
                continue
            make(frame, ring, layout, strip).save(fn, "WEBP", lossless=True, quality=100, method=6)
            print(fn, os.path.getsize(fn))
    fn = os.path.join(a.out, f"win-trainer{a.suffix}.webp")
    if not os.path.exists(fn):
        make_trainer().save(fn, "WEBP", lossless=True, quality=100, method=6)
        print(fn, os.path.getsize(fn))
