#!/usr/bin/env python3
"""Ink knockouts for the Prismatic Evolutions Poke Ball / Master Ball prints (holo family sv-prismatic).

Most sv8pt5 `-ball` foil maps do not cut the printed text out, so the hard-lit foil recoloured black ink.
This writes assets/foil/fam/sv-prismatic/<n>-ink.webp per card number (shared by the -pb and -mb faces):
alpha 255 where foil may show, 0 on dark low-chroma ink (luminance < 0.34, chroma < 0.14), the knockout
grown by about one scan pixel and softened so letter edges do not halo.

  python3 .claude/skills/card-textures/scripts/fam/sv-prismatic/make_ink_masks.py   (run from the repo root)
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.getcwd()
OUT = os.path.join(ROOT, "assets/foil/fam/sv-prismatic")
os.makedirs(OUT, exist_ok=True)
cards = json.load(open(os.path.join(ROOT, "data/sv8pt5.json")))
cards = cards if isinstance(cards, list) else cards.get("cards", [])
done = set()
for c in cards:
    if not c.get("pattern") or not c.get("foilMap"):
        continue
    base = c["number"].split("-")[0]
    if base in done:
        continue
    done.add(base)
    im = Image.open(os.path.join(ROOT, c["image"])).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    chroma = a.max(2) - a.min(2)
    ink = ((lum < 0.34) & (chroma < 0.14)).astype(np.uint8) * 255
    m = Image.fromarray(ink, "L").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    alpha = Image.fromarray(255 - np.asarray(m), "L")
    out = Image.new("RGBA", im.size, (255, 255, 255, 255))
    out.putalpha(alpha)
    out.save(os.path.join(OUT, f"{base}-ink.webp"), lossless=True, method=6)
print(len(done), "ink masks in", OUT)
