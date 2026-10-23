#!/usr/bin/env python3
"""Fifth pass of the bw-secret maps (2026-10-22, round 2 of the photo-audit fix, after the fresh review). Writes NEW
files only (names git has never seen) into assets/foil/fam/bw-secret/; nothing shipped is touched.

Gold-border faces (bw7-bw10, 17):
  wave/<id>.webp   the art's own etch (tex/<id>-v2: Live's etch inside the window) only where TCG Live's foil map
                   holds the Pokemon or the Item (alpha over about 0.6; the 0.3-0.4 background is left out), weighted
                   by the scan's luminance (none on dark ink). The review: Virizion's Pokemon showed no wave etch
                   at rest; the real card's dense wavy etch and deep metallic pink are the main texture at every angle.
  pok/<id>.webp    the Pokemon or the Item as a solid area (the same part of Live's foil map, soft edge, dark ink at
                   0.3, light ink thinned so it never loses 40 levels): the sheet darkens it a little (ink printed on metal reads deeper than on card: the real
                   Virizion is a deep metallic pink) and puts the small lamp hot spot on it.
                   Cards in PINK (Virizion) keep it only on the Pokemon's pink ink (hue 300-10, saturated): the sheet
                   gives them a crimson tone there instead of the grey (the real card's body is a deep metallic
                   crimson-pink; on white, yellow or purple ink that tone would read as a stain).
                   Round 3: at full strength on the pink (the thinned map left the body at 62 percent lightness).
  texg/<id>.webp   tex/<id>-v2 weighted by the scan's luminance (none on dark ink): the rainbow glints of the
                   window follow it, so a black head (Terrakion) or a navy body (Garchomp) no longer gets a pale line
                   screen near the lamp.

Yellow-border faces (bw1, bw3-bw6, 13):
  etch/<id>-v2.webp  Live's etch (etch/<id>) without the Pokemon: on bw6 Live's etch also holds a stipple over the
                   Pokemon, and drawn silver-white near the lamp it covered Rayquaza's and Krookodile's dark bodies in
                   white stars. The window background's arcs and the text-box symbol's rings stay.
  stip/<id>-v2.webp  the Pokemon's fine stipple (make_bw_secret_v4.stipple) with a harder dark-ink gate: nothing below
                   a luminance of 0.2, all of it from 0.5 (v4 kept an eighth on black ink).
  dark/<id>.webp   the Pokemon's near-black ink (fm-v4 inside the window, luminance under about 0.22 since round 3, soft
                   edges): the real Rayquaza's black body throws a localised green/pink/gold sheen near the lamp, not
                   dots; brown and grey ink (Krookodile, Zoroark) stays out.

    python3 .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_v5.py [--only wave,pok,texg,etch,stip,dark] [--force]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("bws_v4", HERE / "make_bw_secret_v4.py")
v4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4)
v2, v1 = v4.v2, v4.v1
ROOT, OUT = v4.ROOT, v4.OUT
W, H = v4.W, v4.H
GOLD = ["bw7-150", "bw7-151", "bw7-152", "bw7-153", "bw8-136", "bw8-137", "bw8-138",
        "bw9-117", "bw9-118", "bw9-119", "bw9-120", "bw9-121", "bw9-122",
        "bw10-102", "bw10-103", "bw10-104", "bw10-105"]
GOLD_ITEMS = set(v4.GOLD_ITEMS)
YELLOW = v4.YELLOW
GRAIN = set(v4.GRAIN)
PINK = {"bw10-103": (335.0, 30.0)}  # card: (hue centre, half width) of the ink that takes the crimson tone


def ramp(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip((x - lo) / (hi - lo), 0, 1)


def live_foil(cid: str) -> np.ndarray:
    s, n = cid.split("-")
    return v4.alpha_of(ROOT / "assets" / "foil" / "maps" / s / f"{n}.webp")


def gold_window(cid: str) -> tuple[int, int, int, int]:
    box = v1.ART["trainer" if cid in GOLD_ITEMS else "pokemon"]
    return tuple(int(round(v * W / 367)) for v in box)


def wave(cid: str) -> np.ndarray:
    tex = v4.alpha_of(OUT / "tex" / f"{cid}-v2.webp")
    live = live_foil(cid)
    x0, y0, x1, y1 = gold_window(cid)
    pok = np.zeros_like(tex)
    pok[y0:y1, x0:x1] = ramp(ndimage.gaussian_filter(live, 1.0)[y0:y1, x0:x1], 0.5, 0.75)
    lum = v4.scan_lum(cid)
    gate = ramp(ndimage.gaussian_filter(lum, 1.0), 0.22, 0.5)  # pale lines never sit on dark ink (Terrakion's head,
    # Garchomp's navy body)
    out = tex * pok * gate
    return out


def pok_gold(cid: str) -> np.ndarray:
    live = live_foil(cid)
    x0, y0, x1, y1 = gold_window(cid)
    pok = np.zeros_like(live)
    pok[y0:y1, x0:x1] = ramp(ndimage.gaussian_filter(live, 1.5)[y0:y1, x0:x1], 0.5, 0.75)
    lum = ndimage.gaussian_filter(v4.scan_lum(cid), 1.0)
    gate = 0.3 + 0.7 * ramp(lum, 0.12, 0.4)
    # the sheet's grey multiplies by 0.76: light ink (a white egg, Garchomp's claws) would lose over 40 levels, and
    # between the pale etch lines that reads as dark specks (dark_specks.py), so the area thins out above 0.64
    light = np.clip(0.64 / np.maximum(lum, 1e-3), 0, 1)
    out = ndimage.gaussian_filter(pok, 0.8) * gate * light
    if cid in PINK:
        # round 3: at full strength (the review measured the thinned body at luminance 62 percent against the photo's
        # 33). The sheet draws the etched lines a lighter crimson that still sits over 40 levels under the print, so
        # body and lines are one dark area for dark_specks.py instead of dark pieces between pale lines.
        out = ndimage.gaussian_filter(pok, 0.8) * gate * ndimage.gaussian_filter(pinkness(cid), 1.0)
    return out


def pinkness(cid: str) -> np.ndarray:
    s, n = cid.split("-")
    hsv = np.asarray(Image.open(ROOT / "assets" / "cards" / s / f"{n}.webp").convert("HSV").resize((W, H), Image.BILINEAR),
                     dtype=np.float32) / 255
    hue = hsv[..., 0] * 360
    centre, half = PINK[cid]
    d = np.abs((hue - centre + 180) % 360 - 180)
    return np.clip((half + 12 - d) / 12, 0, 1) * ramp(hsv[..., 1], 0.18, 0.32)


def texg(cid: str) -> np.ndarray:
    tex = v4.alpha_of(OUT / "tex" / f"{cid}-v2.webp")
    lum = v4.scan_lum(cid)
    return tex * ramp(ndimage.gaussian_filter(lum, 1.0), 0.2, 0.5)


def pokemon(cid: str, fm: np.ndarray) -> np.ndarray:
    x0, y0, x1, y1 = v4.window(cid)
    pok = np.zeros_like(fm)
    pok[y0:y1, x0:x1] = ramp(fm[y0:y1, x0:x1], 0.45, 0.8)
    return pok


def etch2(cid: str, fm: np.ndarray) -> np.ndarray:
    etch = v4.alpha_of(OUT / "etch" / f"{cid}.webp")
    pok = ndimage.grey_dilation(pokemon(cid, fm), size=(3, 3))
    return etch * (1 - pok)


def stip2(cid: str, fm: np.ndarray) -> np.ndarray:
    rng = np.random.default_rng(zlib.crc32((cid + "-stip").encode()))
    pok = pokemon(cid, fm)
    seeds = (rng.random((H, W)) < 1 / 7.0).astype(np.float32) * rng.uniform(0.55, 1.0, (H, W)).astype(np.float32)
    dots = ndimage.gaussian_filter(seeds, 0.55) * (2 * np.pi * 0.55 ** 2)
    dots = np.clip(dots / 0.75, 0, 1)
    gate = ramp(ndimage.gaussian_filter(v4.scan_lum(cid), 1.0), 0.2, 0.5)
    return dots * pok * gate


def dark(cid: str, fm: np.ndarray) -> np.ndarray:
    # round 3: near-black ink only (Rayquaza's body, Chandelure's arms): the review saw a flat green tint over
    # Krookodile's brown head and Zoroark's grey legs (luminance 0.2-0.35), which the real cards do not throw
    lum = ndimage.gaussian_filter(v4.scan_lum(cid), 2.0)
    return ndimage.gaussian_filter(pokemon(cid, fm) * ramp(0.22 - lum, 0.0, 0.1), 2.0)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="wave,pok,texg,etch,stip,dark")
    ap.add_argument("--cards", default="")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--alpha-quality", type=int, default=80)
    ap.add_argument("--force", action="store_true", help="rewrite files of this pass that exist (only before it ships)")
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(",") if s.strip()}
    cards = {s.strip() for s in a.cards.split(",") if s.strip()}

    def save(arr: np.ndarray, p: Path) -> None:
        if a.force or not p.exists():
            v2.save_alpha(arr, p, a.quality, a.alpha_quality)

    for cid in GOLD:
        if cards and cid not in cards:
            continue
        if "wave" in only:
            save(wave(cid), OUT / "wave" / f"{cid}.webp")
        if "pok" in only:
            save(pok_gold(cid), OUT / "pok" / f"{cid}.webp")
        if "texg" in only:
            save(texg(cid), OUT / "texg" / f"{cid}.webp")
    for cid in YELLOW:
        if cards and cid not in cards:
            continue
        fm = v4.alpha_of(OUT / "fm" / f"{cid}-v4.webp")
        if "etch" in only:
            save(etch2(cid, fm), OUT / "etch" / f"{cid}-v2.webp")
        if "stip" in only:
            save(stip2(cid, fm), OUT / "stip" / f"{cid}-v2.webp")
        if "dark" in only and cid not in GRAIN:
            save(dark(cid, fm), OUT / "dark" / f"{cid}.webp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
