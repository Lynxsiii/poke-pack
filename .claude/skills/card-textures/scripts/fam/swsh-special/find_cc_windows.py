"""Find the art-window rectangle of Celebrations Classic Collection reprints (no TCG Live foil map) from the scan:
the strongest edge rows / columns inside the expected band of each side. Prints CSS insets (top right bottom left, %)
for js/fam/swsh-special.js and writes a check sheet with the rectangles drawn.
  python3 find_cc_windows.py <repo> <out.jpg> cc2 cc4 ...
"""
import sys
import numpy as np
from PIL import Image, ImageDraw

repo, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
# expected bands (fraction of the card) for each edge: top, bottom, left, right
BANDS = {"top": (0.08, 0.16), "bottom": (0.42, 0.56), "left": (0.04, 0.14), "right": (0.86, 0.96)}
sheet = []
for n in ids:
    im = Image.open(f"{repo}/assets/cards/cel25/{n}.webp").convert("RGB")
    a = np.asarray(im.convert("L"), dtype=float)
    h, w = a.shape
    gy = np.abs(np.diff(a, axis=0))[:, int(w * 0.25):int(w * 0.75)].mean(axis=1)
    gx = np.abs(np.diff(a, axis=1))[int(h * 0.2):int(h * 0.4), :].mean(axis=0)
    def pick(g, lo, hi, size):
        i0, i1 = int(lo * size), int(hi * size)
        return i0 + int(np.argmax(g[i0:i1]))
    t = pick(gy, *BANDS["top"], h) + 1
    b = pick(gy, *BANDS["bottom"], h)
    l = pick(gx, *BANDS["left"], w) + 1
    r = pick(gx, *BANDS["right"], w)
    ins = (t / h * 100, (w - r) / w * 100, (h - b) / h * 100, l / w * 100)
    print(n, "inset(%.2f%% %.2f%% %.2f%% %.2f%%)" % ins)
    d = ImageDraw.Draw(im)
    d.rectangle([l, t, r, b], outline=(255, 0, 255), width=2)
    sheet.append(im.resize((300, int(300 * h / w))))
W = 300 * min(6, len(sheet)); rows = (len(sheet) + 5) // 6
o = Image.new("RGB", (W, rows * sheet[0].height))
for i, s in enumerate(sheet):
    o.paste(s, ((i % 6) * 300, (i // 6) * sheet[0].height))
o.save(out, quality=85)
