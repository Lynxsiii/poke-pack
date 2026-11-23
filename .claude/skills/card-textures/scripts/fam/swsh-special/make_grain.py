"""Sparkle grain for the Radiant Rare plaid (css/holo/fam/swsh-special.css, ssp-rad): assets/foil/glitter-fine.webp
lifted onto a grey floor, so multiplying it into the band light leaves the band at 60% between the pinpoints and full
on them.  python3 make_grain.py <repo>"""
import sys
import numpy as np
from PIL import Image
repo = sys.argv[1]
g = np.asarray(Image.open(f"{repo}/assets/foil/glitter-fine.webp").convert("L"), dtype=float) / 255
out = 0.6 + 0.4 * np.clip(g * 1.6, 0, 1)
Image.fromarray((out * 255).round().astype(np.uint8), "L").convert("RGB").save(
    f"{repo}/assets/foil/fam/swsh-special/grain-v1.webp", quality=92)
