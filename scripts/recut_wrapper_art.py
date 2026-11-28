#!/usr/bin/env python3
"""Re-cut booster wrapper art from full-size official renders, by shape.

Why this exists (11-28): the Brilliant Stars, Astral Radiance, Lost Origin and
Silver Tempest wrappers on the site came from pokesymbols.com at ~357 px wide,
flattened onto white, and were cut by a white threshold. Those renders fade the
crimps into the white page, so the threshold chewed the crimps into torn
shreds, ate the white clouds inside the art, and left bits of page at the
bottom. On a phone the set page hero shows the pack ~290 CSS px wide (~870
device px), so a 357 px file is stretched 2.4x and looks soft.

This script:
  * downloads the 780x1429 official wrapper renders (Pokémon's press images,
    reposted losslessly on pocketmonsters.net; TCGplayer and PriceCharting
    serve the same render for the wrapper on each set's single-pack listing);
  * cuts each one by SHAPE, never by colour inside the pack: the side edges are
    fitted as a smooth curve from the body rows, the outline is drawn
    anti-aliased (4x supersampled), and only in the crimp bands (top and bottom
    3.5%) is the white page un-mixed into transparency (colour-to-alpha), so
    the crimps keep their ridges as soft see-through foil with no jagged edge;
  * writes the next free -vN .avif and .png (assets/ is cached for a year:
    never overwrite) and prints the version to set in js/catalog.js.

    python3 scripts/recut_wrapper_art.py            # cut every wrapper in SOURCES
    python3 scripts/recut_wrapper_art.py swsh11     # one set
    python3 scripts/recut_wrapper_art.py --check    # flag torn outlines on every pack the catalog uses

--check measures each live pack's outline (top, bottom and sides) against a
median-smoothed copy of itself; a torn crimp or chewed side stands out at
once. Run it after adding pack art (set-building checklist).
"""
from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "assets" / "packs"
UA = "Mozilla/5.0 (poke-pack art fetch)"
PM = "https://media.pocketmonsters.net/imageboard/30/{}.png"
AVIF_QUALITY = 72

# set -> wrapper files in catalog order (pack-0, pack-1, ...).
# Threads: Brilliant Stars 5881, Astral Radiance 6006, Lost Origin 6094,
# Silver Tempest 6141 on pocketmonsters.net/imageboard/thread/<id>.
# Matched to the old pokesymbols art by picture (scripts would mis-order
# otherwise: the threads post them in a different order).
SOURCES: dict[str, list[str]] = {
    "swsh9": ["16359554060034", "16359553920012", "16359553790028", "16359553660086"],
    "swsh10": ["16467511960018", "16467509840028", "1646751006007", "16467511380069", "16467510610083"],
    "swsh11": ["16560138340060", "16560138200043", "16560138470021", "16560137350021"],
    "swsh12": ["16614584000060", "16614584270023", "16614583660030", "16614583410058"],
}

CRIMP = 0.035  # crimp band, share of pack height, top and bottom
CRIMP_FLOOR = 0.75  # lowest crimp opacity


def fetch(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return Image.open(io.BytesIO(resp.read())).convert("RGBA")


def cut(img: Image.Image) -> Image.Image:
    # Some renders come with real alpha where the wrapper pinches in at the
    # sides. Read them on white (so a see-through pixel is page, not black ink)
    # and keep their alpha on top of the cut.
    rgba = img.convert("RGBA")
    src_alpha = np.asarray(rgba)[..., 3].astype(np.float32) / 255
    flat = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    flat.alpha_composite(rgba)
    a = np.asarray(flat.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    mn, mx = a.min(2), a.max(2)
    ink = ndi.binary_opening((mn < 238) | ((mx - mn) > 22), iterations=1)
    rowfrac = ink.mean(1)
    rows = np.where(rowfrac > 0.06)[0]
    top, bot = int(rows[0]), int(rows[-1])
    height = bot - top + 1

    # Side edges: per-row extent of ink, fitted as a smooth curve on the body
    # rows only (the crimps fade out and would drag the fit).
    ys = np.arange(h)
    left = np.full(h, np.nan)
    right = np.full(h, np.nan)
    for y in range(top, bot + 1):
        xs = np.where(ink[y])[0]
        if len(xs) > w * 0.2:
            left[y], right[y] = xs[0], xs[-1]
    b0, b1 = top + int(height * 0.10), bot - int(height * 0.10)

    def fit(edge: np.ndarray) -> np.ndarray:
        ok = ~np.isnan(edge)
        ok[:b0] = False
        ok[b1:] = False
        yy, ee = ys[ok], edge[ok]
        keep = np.abs(ee - ndi.median_filter(ee, 31)) < 2.5
        return np.polyval(np.polyfit(yy[keep], ee[keep], 2), ys)

    lf, rf = fit(left) + 0.7, fit(right) - 0.7

    ss = 4
    yy = (np.arange(h * ss) + 0.5) / ss - 0.5
    xx = (np.arange(w * ss) + 0.5) / ss - 0.5
    ls, rs = np.interp(yy, ys, lf), np.interp(yy, ys, rf)
    inside = (
        (xx[None, :] >= ls[:, None] - 0.5)
        & (xx[None, :] <= rs[:, None] + 0.5)
        & (yy[:, None] >= top - 0.5)
        & (yy[:, None] <= bot + 0.5)
    )
    shape = inside.reshape(h, ss, w, ss).mean((1, 3))

    # Crimp bands: un-mix the white page (colour-to-alpha), eased in.
    band = int(height * CRIMP)
    dist = np.minimum(ys - top, bot - ys).astype(np.float32)
    ramp = np.clip(1 - (dist - band) / (band * 0.3), 0, 1)
    page = ndi.gaussian_filter(np.clip((250 - mn) / 45.0, 0, 1), 0.8)
    # Keep a floor so the crimp is a solid strip with a clean edge: white ridges
    # read as silver foil, not as holes in the pack.
    page = CRIMP_FLOOR + (1 - CRIMP_FLOOR) * page
    see = 1 - ramp[:, None] * (1 - page)  # how much of each pixel is pack, not page
    alpha = shape * see * src_alpha
    # Un-mix only the page white. The outline's anti-aliasing is coverage, not
    # white, so un-mixing it too would darken the pack's side edges into a line.
    al = np.clip(see, 1e-3, 1)[..., None]
    col = np.clip((a - (1 - al) * 255) / al, 0, 255)
    col = np.where(alpha[..., None] > 0.02, col, 0)
    out = Image.fromarray(np.dstack([col, alpha * 255]).astype(np.uint8), "RGBA")
    return out.crop(out.getbbox())


def next_version(set_id: str, index: int) -> int:
    """One past the highest version on disk for this wrapper (pack-0.avif counts as v1)."""
    found = [1]
    for f in (PACKS / set_id).glob(f"pack-{index}*"):
        m = re.fullmatch(rf"pack-{index}(?:-v(\d+))?\.(?:avif|png)", f.name)
        if m:
            found.append(int(m.group(1) or 1))
    return max(found) + 1


def recut(set_id: str) -> int:
    ids = SOURCES[set_id]
    version = max(next_version(set_id, i) for i in range(len(ids)))
    for i, fid in enumerate(ids):
        art = cut(fetch(PM.format(fid)))
        dest = PACKS / set_id / f"pack-{i}-v{version}"
        art.save(dest.with_suffix(".avif"), "AVIF", quality=AVIF_QUALITY)
        art.save(dest.with_suffix(".png"), optimize=True)
        print(f"{set_id} pack-{i}-v{version}  {art.width}x{art.height}  "
              f"{dest.with_suffix('.avif').stat().st_size // 1024} KB avif")
    return version


# ---------------------------------------------------------------- check

def roughness(path: Path) -> dict:
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 16  # the silhouette; see-through crimp ridges are texture
    h, w = a.shape
    cols, rows = np.where(a.any(0))[0], np.where(a.any(1))[0]
    c0, c1 = cols[0] + int(w * 0.08), cols[-1] - int(w * 0.08)
    r0, r1 = rows[0] + int(h * 0.10), rows[-1] - int(h * 0.10)
    scale = w / 360  # judge every pack as if it were 360 px wide

    def rough(prof) -> float:
        prof = np.asarray(prof, float)
        return float(np.mean(np.abs(prof - ndi.median_filter(prof, 15)))) / scale

    return {
        "top": rough([np.argmax(a[:, c]) for c in range(c0, c1)]),
        "bottom": rough([h - 1 - np.argmax(a[::-1, c]) for c in range(c0, c1)]),
        "sides": (rough([np.argmax(a[y]) for y in range(r0, r1)])
                  + rough([w - 1 - np.argmax(a[y, ::-1]) for y in range(r0, r1)])) / 2,
    }


def live_packs() -> list[Path]:
    js = (
        "const m = await import(process.argv[1]); const seen = new Set();"
        "const walk = (o) => { if (!o || typeof o !== 'object') return;"
        " for (const v of Object.values(o)) { if (typeof v === 'string' && /^assets\\/packs\\/.*\\.png$/.test(v)) seen.add(v);"
        " else if (typeof v === 'object') walk(v); } };"
        "for (const v of Object.values(m)) walk(v); console.log(JSON.stringify([...seen]));"
    )
    out = subprocess.run(["node", "--input-type=module", "-e", js, (ROOT / "js" / "catalog.js").as_uri()],
                         capture_output=True, text=True, check=True).stdout
    return [ROOT / p for p in json.loads(out)]


def check() -> int:
    bad = []
    for p in live_packs():
        if not p.exists():
            continue
        r = roughness(p)
        # Clean cuts measure 0.0-0.15 here; the torn Silver Tempest crimps measured 1-4; dp5 pack-2 (a real photo with a bent crimp) measures 0.30.
        if r["top"] > 0.35 or r["bottom"] > 0.35 or r["sides"] > 0.2:
            bad.append((p.relative_to(ROOT).as_posix(), r))
    for p, r in bad:
        print(f"torn outline: {p}  top {r['top']:.2f} bottom {r['bottom']:.2f} sides {r['sides']:.2f}")
    print(f"{len(bad)} pack(s) with a torn outline")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sets", nargs="*")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        return check()
    for s in args.sets or SOURCES:
        v = recut(s)
        print(f"  -> js/catalog.js: boosterWrappers(\"{s}\", [...], {v})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
