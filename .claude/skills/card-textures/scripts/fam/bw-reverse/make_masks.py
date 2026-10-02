#!/usr/bin/env python3
"""bw-reverse: one alpha mask per Black & White reverse-holo print, cut from TCG Live's own foil map.

Draws: assets/foil/fam/bw-reverse/<set>/<number>.webp (367x512 lossless WebP, white with an alpha channel).
From:  TCG Live's reverse foil maps, https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<set>/<set>_en_<NNN>_ph.foil.png
       (RGBA PNG; the foil grey is R*A/255; "not foil" is exactly 0, a printed pattern never goes below 25), kept in --cache
       as <set>_<NNN>.png. mask = ink_cut(erode(clean(clip(grey / 24, 0, 1)))): the art window, the evolution notch, the type and weakness symbols
       and the text TCG Live cuts out of the foil come out transparent, the rest opaque, edges anti-aliased as they were. TCG Live leaves the BODY
       text (attacks, rules text, Trainer and Energy text) under the foil, as the real card does: the ink is opaque and stays black. An overlay
       sheen on a dark or grey letter tints it (review #2: Float Stone, DCE), so the print's own SCAN decides the ink: in the text zone (rows 266-476
       of 512) every pixel darker than 110 that differs from the local body colour by more than 40 is ink, dilated 1 px, and cut out of the foil
       (alpha 0). A near-black body (Darkness Pokemon, white text) gets no ink cut: white stays white under an overlay.
Which prints: Common, Uncommon, Rare and Rare Holo of bw1-bw11 (Rare only in bw10-bw11) that are not promos or Radiant
       Collection. Dragons Exalted (bw6) is NOT written here: its TCG Live files are duplicated and misnumbered, so make_masks_bw6.py matches
       them to the prints by image (the pass that found it is in /mnt/project-files/holo-remaster/bw-reverse/AGENT-LOG-thread-b.md).
Prints the JS list of the numbers written, per set, for js/fam/bw-reverse.js (MASKS).
Run: python3 make_masks.py --cache <dir with <set>_<NNN>.png>
"""
import argparse, json
from multiprocessing import Pool
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
# The foil stops 2 map px short of every hole (a disc erosion of the mask): the anti-aliased rim of a printed symbol, the art window frame and the
# cost circles is mid grey, and an overlay on it drew a dark or orange ring around every symbol (found on bw11 DCE, 2026-10-02).
DISK = np.hypot(*np.mgrid[-2:3, -2:3]) <= 2.2


def clean(m):
    """The print's own TCG Live map, cleaned: (1) a stray alpha under 0.25 is zero (Live's "not foil" is exactly 0; bw10-3's art window carried 0.2),
    (2) holes under 12 px^2 are filled (specks only: Live cuts the print's own TEXT out letter by letter and the ink must stay matte, as on the real
    card, or the overlay tints it: review #2), (3) the foil is eroded by DISK (ink and symbols get a 2 px margin)."""
    m = np.where(m < 0.25, 0.0, m)
    lab, n = ndi.label(m < 0.9)
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    small = np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z < 12])
    return ndi.grey_erosion(np.where(small, 1.0, m), footprint=DISK)


def scan_ink(c):
    """The DARK ink of print `c`, from its own scan: True where the foil must stay off (text zone, rows 266-476 of 512; a pixel darker than 110 (of 255) that
    differs from the local body colour (11 px median) by more than 40 in RGB distance; dilated by 1 px). A near-black body (zone median under 75: the
    Darkness Pokemon, white text) gets none: white ink stays white under an overlay and the gaps between its letters are not ink."""
    scan = np.asarray(Image.open(ROOT / c["image"]).convert("RGB").resize((367, 512), Image.LANCZOS))
    sf = scan.astype(np.float32)
    lum = 0.2126 * sf[..., 0] + 0.7152 * sf[..., 1] + 0.0722 * sf[..., 2]
    if np.median(lum[266:476]) < 75:
        return np.zeros(lum.shape, bool)
    bg = cv2.medianBlur(np.ascontiguousarray(scan), 11).astype(np.float32)
    ink = (np.sqrt(((sf - bg) ** 2).sum(-1)) > 40) & (lum < 110)
    zone = np.zeros_like(ink)
    zone[266:476] = True
    return ndi.binary_dilation(ink & zone, iterations=1)


def one(job):
    s, c, f, out = job
    a = np.asarray(Image.open(f).convert("RGBA")).astype(np.float32)
    g = a[..., 0] * a[..., 3] / 255.0
    m = clean(np.clip(g / 24.0, 0, 1))
    m = np.where(scan_ink(c), 0.0, m)
    rgba = np.zeros(m.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(m * 255).astype(np.uint8)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(out, lossless=True, quality=60, method=1, exact=True)
    return s, int(c["number"])


SETS = ["bw1", "bw2", "bw3", "bw4", "bw5", "bw7", "bw8", "bw9", "bw10", "bw11"]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--jobs", type=int, default=3)
    args = ap.parse_args()
    cache = Path(args.cache)
    out_root = ROOT / "assets/foil/fam/bw-reverse"
    jobs = []
    for s in SETS:
        rr = ["Common", "Uncommon", "Rare", "Rare Holo"] if s not in ("bw10", "bw11") else ["Common", "Uncommon", "Rare"]
        for c in json.loads((ROOT / f"data/{s}.json").read_text()):
            if c.get("promo") or c.get("rc") or c["rarity"] not in rr:
                continue
            f = cache / f"{s}_{int(c['number']):03d}.png"
            if f.exists():
                jobs.append((s, c, f, out_root / s / f"{c['number']}.webp"))
    listing = {s: [] for s in SETS}
    with Pool(args.jobs) as pool:
        for s, n in pool.imap_unordered(one, jobs, chunksize=8):
            listing[s].append(n)
    print(f"// {sum(len(v) for v in listing.values())} masks")
    for s, n in listing.items():
        print(f'  {s}: "{" ".join(map(str, sorted(n)))}",')
