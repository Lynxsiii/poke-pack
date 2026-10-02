#!/usr/bin/env python3
"""cosmos-glints.webp for the dp-legend family: the era's two cosmos alpha textures merged, with every blob bigger than
MAXBLOB px removed (the era's cosmos-middle-trans has a few dozen-px discs that read as stickers on a phone; the real
foil's glints are speckle). Reads assets/foil/promo/cosmos-middle-trans.webp and cosmos-top-trans.webp (read-only), writes
assets/foil/fam/dp-legend/cosmos-glints.webp (734x1024 RGBA, white where there is a glint). Deterministic."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

MAXBLOB = 220
root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
a = np.array(Image.open(os.path.join(root, "assets/foil/promo/cosmos-middle-trans.webp")).convert("RGBA"))[..., 3] > 128
b = np.array(Image.open(os.path.join(root, "assets/foil/promo/cosmos-top-trans.webp")).convert("RGBA"))[..., 3] > 128
m = a | b
lab, n = ndi.label(m)
sizes = ndi.sum(m, lab, range(1, n + 1))
keep = np.zeros(n + 1, bool)
keep[1:] = sizes <= MAXBLOB
m = keep[lab]
out = np.zeros(m.shape + (4,), np.uint8)
out[..., :3] = 255
out[..., 3] = m * 255
os.makedirs(os.path.join(root, "assets/foil/fam/dp-legend"), exist_ok=True)
Image.fromarray(out, "RGBA").save(os.path.join(root, "assets/foil/fam/dp-legend/cosmos-glints.webp"), lossless=True)
print("glints kept", int(m.sum()), "of", int((a | b).sum()), "px; blobs", int(keep.sum()), "of", n)
