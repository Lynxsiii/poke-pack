#!/usr/bin/env python3
"""Bold black line art for the Prismatic Evolutions gold Hyper Rares (sv8pt5 176-180), family sv-gold.

The real cards print the Pokemon as bold black line art over the brass gold and the glitter silhouette (Pikachu 179:
holo-refs/w2-sv-gold/sv8pt5-176/s4/01.jpg); the site's scans carry none. TCG Live's soft etch (`-etch-soft`, the
etch blurred) draws those strokes as thin ridges brighter than the hatched fills round them, so a white top-hat
(etch-soft minus its 7x7 grey opening) isolates them. Then: a light blur and a threshold, components under 45 px of
the 400 px etch dropped (letter edges and hatch specks), cut to the art window and kept off the printed ink (dark in the
scan or empty in the foil map: text, symbols), small pieces dropped again after that cut. Output assets/foil/fam/sv-gold/sv8pt5-<n>-lines-v1.webp: near-black strokes on
transparent at twice the etch's size, edges smoothed so they do not alias at 220 CSS px x3.

  python3 .claude/skills/card-textures/scripts/fam/sv-gold/make_pre_lines.py [--preview out.jpg]
"""
import argparse, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *[".."] * 6))
CARDS = [176, 177, 178, 179, 180]


def alpha_of(path, size=None):
    im = Image.open(path).split()[3]
    if size:
        im = im.resize(size, Image.BILINEAR)
    return np.array(im).astype(np.float32) / 255


def lines(n):
    es = alpha_of(f"{ROOT}/assets/foil/maps/sv8pt5/{n}-etch-soft.webp")
    h, w = es.shape
    fm = alpha_of(f"{ROOT}/assets/foil/maps/sv8pt5/{n}.webp", (w, h))
    ridge = es - ndi.grey_opening(es, size=(7, 7))
    ridge = ndi.gaussian_filter(ridge, 0.8)
    core = ridge > 0.13
    lab, k = ndi.label(core, structure=np.ones((3, 3)))
    sizes = ndi.sum(core, lab, range(1, k + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes >= 45))
    region = np.zeros_like(keep)
    region[int(h * 0.12):int(h * 0.80), int(w * 0.05):int(w * 0.95)] = True
    # printed ink (text, symbols, outlines of the banners): dark in the scan, or empty in the foil map
    scan = np.array(Image.open(f"{ROOT}/assets/cards/sv8pt5/{n}.webp").convert("L").resize((w, h), Image.BILINEAR))
    ink = ndi.binary_dilation((scan < 110) | (fm < 0.12), iterations=2)
    keep &= region & ~ink
    lab, k = ndi.label(keep, structure=np.ones((3, 3)))
    sizes = ndi.sum(keep, lab, range(1, k + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes >= 30))
    soft = np.clip((ridge - 0.07) / 0.14, 0, 1) * (ndi.binary_dilation(keep, iterations=1) & ~ink)
    out = Image.fromarray((soft * 255).astype(np.uint8)).resize((w * 2, h * 2), Image.BICUBIC)
    out = out.filter(ImageFilter.GaussianBlur(0.7))
    return Image.merge("RGBA", [Image.new("L", out.size, 16)] * 3 + [out])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    a = ap.parse_args()
    os.makedirs(f"{ROOT}/assets/foil/fam/sv-gold", exist_ok=True)
    tiles = []
    for n in CARDS:
        im = lines(n)
        path = f"{ROOT}/assets/foil/fam/sv-gold/sv8pt5-{n}-lines-v1.webp"
        im.save(path, quality=88, method=6)
        print(path, os.path.getsize(path))
        if a.preview:
            scan = Image.open(f"{ROOT}/assets/cards/sv8pt5/{n}.webp").convert("RGBA").resize(im.size)
            scan.alpha_composite(im)
            tiles.append(scan.convert("RGB").resize((400, 559)))
    if a.preview:
        sheet = Image.new("RGB", (410 * len(tiles), 559))
        for i, t in enumerate(tiles):
            sheet.paste(t, (i * 410, 0))
        sheet.save(a.preview, quality=88)


if __name__ == "__main__":
    main()
