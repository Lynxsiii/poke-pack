"""Per-card foil masks for the Sword & Shield reverse holos (swsh-reverse family, 2026-10-22).

TCG Live ships a reverse map for every Sword & Shield reverse print (`<key>_en_<nnn>_ph.foil.png`, 367 x 512): grey
where the card is foil, black where it is not. The black follows the card: the art window, the stage label and the
evolution box, the HP type circle, each attack's energy-cost dots, Ability and Rapid/Single Strike banners, the
weakness bar, the set code. The family's old mask was the per-type median of a few cards, which cut the cost dots where
MOST cards have one (a hole in the foil on the others) and printed foil over the dots of the rest; the real cards keep
their cost dots white. So every claimed print gets its own mask: Live's foil area as a binary alpha (lossless webp,
about 0.7 KB each), less Live's flat plates (the Supporter rule box, the Tool banner) and its white lettering. Darkness
cards also leave out their white-ink text (at the scan's 600 x 838: the strokes are too thin for 367 px).

    python3 .claude/skills/card-textures/scripts/fam/swsh-reverse/make_masks.py --census census.json --cache DIR [--download]

--census: the holo census (/home/user/holo-tools/census.mjs output); its swsh reverse faces are the prints to mask.
--cache: where Live's maps are (or go, with --download: cdn.malie.io, 8 at a time).
Writes assets/foil/fam/swsh-reverse/mask-v1/<set>/<number>.webp and prints the claimed prints that have no Live map
(Astral Radiance's TG reverses and a few others): js/fam/swsh-reverse.js lists them in NO_MASK, and they keep the
median tile's alpha. Trick or Trade's reprints take their original's map (the original must be in the cache: it is
when that original is a claimed face too).

Celebrations has no reverse print (the data builds the faces anyway, a data issue) and so no reverse map, but Live has
its holo map (`swsh7-5_en_<nnn>_std.foil.png`): its mask is the era's median alpha for the type less that holo area,
so the two full-art prints (Pikachu 005, Mew 025) get no chevrons over their illustration.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT = ROOT / "assets" / "foil" / "fam" / "swsh-reverse" / "mask-v1"
MAP = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/{key}/{key}_en_{num:03d}_{kind}.foil.png"
MEDIAN = ROOT / "assets" / "foil" / "swsh-reverse"  # the era's median tiles: their alpha is the old mask
HOLO_ONLY = {"cel25"}  # sets with no reverse print: mask from the holo map ("std") instead
# Trick or Trade 2023 reprints Sword & Shield cards (stamp in the window): its prints use the original's map, found
# from the printed number's set total (data/tot23.json printedNumber; 189 is two sets, so it is left out)
REPRINTS = {"tot23"}
TOTALS = {"202": "swsh1", "192": "swsh2", "185": "swsh4", "163": "swsh5", "198": "swsh6", "203": "swsh7",
          "264": "swsh8", "172": "swsh9", "196": "swsh11", "195": "swsh12"}


def original(face: dict) -> tuple[str, str] | None:
    """(set, number) of the print a reprint face copies, or None."""
    data = ROOT / "data" / f"{face['set']}.json"
    for c in json.loads(data.read_text()):
        if c.get("id") == face["id"]:
            num, _, total = str(c.get("printedNumber", "")).partition("/")
            if total in TOTALS and num.isdigit():
                return TOTALS[total], str(int(num))
    return None
KEYS = {"swsh35": "swsh3-5", "swsh45": "swsh4-5", "cel25": "swsh7-5", "pgo": "swsh10-5", "swsh12pt5": "swsh12-5"}
FLOOR = 30  # Live's "not foil" is black; its darkest pattern grey is about 50
ISLAND = 1200  # px at 367 x 512: smaller foil islands are Live's white lettering (TRAINER, ENERGY, the Supporter tag)


def foil_area(grey: np.ndarray) -> np.ndarray:
    """Live's foil, less its flat plates (the Supporter rule box, the Pokemon Tool banner: one even grey, no chevrons;
    on the cards they are printed plates over the foil) and less the small islands of lettering."""
    foil = grey > FLOOR
    m = ndimage.uniform_filter(grey, 15)
    sd = np.sqrt(np.maximum(ndimage.uniform_filter(grey * grey, 15) - m * m, 0))
    flat = (sd < 2.0) & foil
    lab, n = ndimage.label(flat)
    if n:
        sizes = ndimage.sum(flat, lab, range(1, n + 1))
        plates = np.isin(lab, 1 + np.where(sizes > 300)[0])
        foil &= ~ndimage.binary_dilation(plates, iterations=7)
    lab, n = ndimage.label(foil)
    if n:
        idx = range(1, n + 1)
        sizes = np.asarray(ndimage.sum(foil, lab, idx))
        means = np.asarray(ndimage.mean(grey, lab, idx))
        # lettering and badges (the Rapid / Single Strike marks of a Special Energy) are near-white islands
        bottoms = np.asarray(ndimage.maximum(np.indices(grey.shape)[0], lab, idx))
        # ... and a Special Energy's Rapid / Single / Fusion Strike badge: a small island in the card's upper quarter
        keep = (sizes >= ISLAND) & ~((means > 185) & (sizes < 6000)) & ~((bottoms < grey.shape[0] // 4) & (sizes < 6000))
        foil = np.isin(lab, 1 + np.where(keep)[0])
    # the Single / Rapid / Fusion Strike badge over the art window's corner: Live keeps it as an island of foil inside
    # the window (the photos show it printed, not chevron foil). Clear the window's box; the side strips are outside it.
    h, w = grey.shape

    def longest_run(idx: np.ndarray) -> tuple[int, int]:
        if not len(idx):
            return 0, -1
        breaks = np.where(np.diff(idx) > 1)[0]
        starts = np.r_[0, breaks + 1]
        ends = np.r_[breaks, len(idx) - 1]
        k = int(np.argmax(ends - starts))
        return int(idx[starts[k]]), int(idx[ends[k]])

    # the window: the longest run of upper-half rows plain across the card's middle, then the longest run of columns
    # plain on most of those rows (the thin side strips beside it are foil, so they bound the run)
    y0, y1 = longest_run(np.where((~foil[: h // 2, int(w * 0.2):int(w * 0.8)]).mean(1) > 0.7)[0])
    if y1 - y0 > h * 0.2:
        x0, x1 = longest_run(np.where((~foil[y0:y1 + 1]).mean(0) > 0.8)[0])
        if x1 - x0 > w * 0.6 and x0 > 5 and x1 < w - 6:
            foil[y0:y1 + 1, x0 + 1:x1] = False
    return foil


def from_holo(grey: np.ndarray, kind: str) -> np.ndarray:
    """A print with only a holo map: the era's median alpha for its type, less the holo window (the rows where the holo
    spans a third of the card or more, dilated 3 px; Live's stray holo specks in the text box are ignored). A full-art
    print (holo over most of the lower half too) gets no reverse at all: chevrons over its illustration would be wrong."""
    h = grey.shape[0]
    holo = grey > FLOOR
    if holo[int(h * 0.55):int(h * 0.9)].mean() > 0.3:
        return np.zeros_like(holo)
    a = Image.open(MEDIAN / f"{kind}.webp").convert("RGBA").resize(grey.shape[::-1], Image.BILINEAR)
    foil = np.asarray(a)[..., 3] > 128
    window = holo & (holo.mean(1) > 0.33)[:, None]
    foil &= ~ndimage.binary_dilation(window, iterations=3)
    lab, n = ndimage.label(foil)
    if n:
        sizes = np.asarray(ndimage.sum(foil, lab, range(1, n + 1)))
        foil = np.isin(lab, 1 + np.where(sizes >= ISLAND)[0])
    return foil


CARDS = ROOT / "assets" / "cards"
WHITE_INK = {"darkness"}  # types whose card text is white ink


def protect_white(foil: np.ndarray, scan_path: Path) -> np.ndarray:
    """Darkness cards print their text in opaque white ink over the foil: it stays white on the real card, so the mask
    leaves it out (at the scan's resolution, since the strokes are a pixel or two at Live's 367 px)."""
    scan = Image.open(scan_path).convert("RGB")
    a = np.asarray(scan).astype(np.float32)
    lum = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    big = np.asarray(Image.fromarray(np.where(foil, 255, 0).astype(np.uint8), "L").resize(scan.size, Image.BILINEAR)) > 127
    white = lum > 110
    lab, n = ndimage.label(white)
    if n:  # lettering, not the scan's light grain
        sizes = np.asarray(ndimage.sum(white, lab, range(1, n + 1)))
        white = np.isin(lab, 1 + np.where(sizes >= 8)[0])
    white = ndimage.binary_dilation(white, iterations=1)
    return big & ~white


def fetch(job: tuple[str, Path]) -> None:
    url, dest = job
    if dest.exists() and dest.stat().st_size:
        return
    if subprocess.run(["curl", "-sfL", url, "-o", str(dest)]).returncode != 0:
        dest.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--census", type=Path, required=True)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()
    faces = [f for f in json.loads(args.census.read_text()) if f["reverse"] and f["era"] == "swsh"]
    args.cache.mkdir(parents=True, exist_ok=True)
    jobs = []
    for f in faces:
        n = str(f["n"])
        if not n.isdigit() or f["set"] == "tot23":
            continue
        key = KEYS.get(f["set"], f["set"])
        kind = "std" if f["set"] in HOLO_ONLY else "ph"
        jobs.append((MAP.format(key=key, num=int(n), kind=kind), args.cache / f"{f['set']}_{n}.png"))
    if args.download:
        with ThreadPoolExecutor(8) as pool:
            list(pool.map(fetch, jobs))
    missing, sizes = [], []
    for f in faces:
        src = args.cache / f"{f['set']}_{f['n']}.png"
        if f["set"] in REPRINTS and (orig := original(f)):
            src = args.cache / f"{orig[0]}_{orig[1]}.png"
        if not src.exists():
            missing.append(f["id"])
            continue
        a = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)
        grey = a[..., :3].mean(2) * a[..., 3] / 255
        if f["set"] in HOLO_ONLY:
            kind = re.search(r"\brev-(?!sv\b|swsh\b)([a-z]+)", f.get("classes", "")).group(1)
            area = from_holo(grey, kind)
        else:
            area = foil_area(grey)
        kind = re.search(r"\brev-(?!sv\b|swsh\b)([a-z]+)", f.get("classes", ""))
        scan = ROOT / f["img"] if f.get("img") else CARDS / f["set"] / f"{f['n']}.webp"
        if kind and kind.group(1) in WHITE_INK and scan.exists():
            area = protect_white(area, scan)
        mask = Image.fromarray(np.where(area, 255, 0).astype(np.uint8), "L")
        dest = OUT / f["set"] / f"{f['n']}.webp"
        dest.parent.mkdir(parents=True, exist_ok=True)
        # alpha-only content as a white image with that alpha (mask-mode: alpha)
        rgba = Image.merge("RGBA", [Image.new("L", mask.size, 255)] * 3 + [mask])
        rgba.save(dest, lossless=True, quality=80, method=4)
        sizes.append(dest.stat().st_size)
    print(f"{len(sizes)} masks, {sum(sizes) // 1024} KB; no Live map for {len(missing)}:")
    print(json.dumps(sorted(missing)))


if __name__ == "__main__":
    main()
