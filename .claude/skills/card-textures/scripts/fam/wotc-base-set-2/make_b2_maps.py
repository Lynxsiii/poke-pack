#!/usr/bin/env python3
"""Draw the Base Set 2 (base4) holo foil maps: where each card's foil shows and the scan's own stars.

Family wotc-base-set-2 (older-era holo remaster, 2026-10-02). Every Base Set 2 Rare Holo reprints a Base Set or Jungle
holo with the same art on the same Starlight-style foil, so the shipped maps of that card (wotc-base-set / wotc-jungle,
each cut from its own scan with the method in make_jungle_maps.py) are carried over rather than cut again:

  1. each base4 scan is registered onto its reprint's scan (affine ECC on the Pokémon's own pixels, started from the two
     art windows' measured edges; scans differ by a few px of position and a little scale);
  2. the reprint's matte (art window less its foil map: the Pokémon, its halo, the evolution badge) is warped onto the
     base4 scan, and the foil map is the base4 art window (measured on this scan) less that matte, feathered 0.8 px;
  3. the stars are this scan's own sparkle on the background (top-hat of the brightest channel over a 9 px median, pale
     pixels only, plus a soft bloom), as in make_jungle_maps.py.
The shared glitter pair is copied from the Jungle family (glitter-a / glitter-b), see --glitter.

  python3 .claude/skills/card-textures/scripts/fam/wotc-base-set-2/make_b2_maps.py --preview DIR [--only 4,2] [--write]
Without --write only the previews are written (DIR/<n>-cut.png: foil tinted magenta, the matte's edge in green; sheet.png).
"""
from __future__ import annotations

import argparse
import importlib.util
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "wotc-base-set-2"
JUNGLE = ROOT / ".claude/skills/card-textures/scripts/fam/wotc-jungle/make_jungle_maps.py"
spec = importlib.util.spec_from_file_location("mjm", JUNGLE)
mjm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mjm)  # window(), stars_alpha(), soft(), save_alpha()
W, H = 600, 838
# base4 number -> (reprint set, reprint number, folder of its shipped maps)
TWIN = {
    1: ("base1", 1), 2: ("base1", 2), 3: ("base1", 3), 4: ("base1", 4), 5: ("base2", 1), 6: ("base1", 5), 7: ("base1", 6),
    8: ("base1", 7), 9: ("base1", 9), 10: ("base1", 10), 11: ("base1", 11), 12: ("base2", 7), 13: ("base1", 12),
    14: ("base2", 8), 15: ("base1", 13), 16: ("base1", 14), 17: ("base2", 10), 18: ("base1", 15), 19: ("base2", 16),
    20: ("base1", 16),
}
FOLDER = {"base1": "wotc-base-set", "base2": "wotc-jungle"}
VERSION = 1


def load(set_id, n):
    return np.asarray(Image.open(ROOT / "assets" / "cards" / set_id / f"{n}.webp").convert("RGB"))


def alpha_of(path):
    return np.asarray(Image.open(path))[..., 3].astype(np.float32) / 255.0


def register(src_rgb, dst_rgb, src_win, dst_win, matte):
    """Affine (2x3) taking src (reprint) pixels to dst (base4) pixels; ECC on the Pokémon's pixels."""
    sx0, sy0, sx1, sy1 = src_win
    dx0, dy0, dx1, dy1 = dst_win
    sx, sy = (dx1 - dx0) / (sx1 - sx0), (dy1 - dy0) / (sy1 - sy0)
    A = np.array([[sx, 0, dx0 - sx * sx0], [0, sy, dy0 - sy * sy0]], np.float32)
    g = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.2)
    s, d = g(src_rgb), g(dst_rgb)
    mask = (ndi.binary_erosion(matte, iterations=3)).astype(np.uint8)
    warp = A.copy()
    try:
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
        _, warp = cv2.findTransformECC(s, d, warp, cv2.MOTION_AFFINE, crit, mask * 1, 5)
    except cv2.error:
        warp = A
    return warp


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path)
    ap.add_argument("--only")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--glitter", action="store_true", help="copy the Jungle family's shared glitter pair")
    args = ap.parse_args()
    nums = [int(x) for x in args.only.split(",")] if args.only else list(range(1, 21))
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
    if args.write:
        OUT.mkdir(parents=True, exist_ok=True)
    import json
    names = {c["id"]: c["name"] for c in json.load(open(ROOT / "data" / "base4.json"))}
    tiles = []
    for n in nums:
        rs, rn = TWIN[n]
        dst = load("base4", n)
        src = load(rs, rn)
        rbg = alpha_of(ROOT / "assets/foil/fam" / FOLDER[rs] / f"{rn}-bg-v1.webp")
        sw, dw = mjm.window(src), mjm.window(dst)
        swin = np.zeros((H, W), bool); swin[sw[1]:sw[3], sw[0]:sw[2]] = True
        dwin = np.zeros((H, W), bool); dwin[dw[1]:dw[3], dw[0]:dw[2]] = True
        matte_src = ndi.binary_erosion(swin, iterations=2) & (rbg < 0.5)
        warp = register(src, dst, sw, dw, matte_src)
        # ECC(template=src, input=dst) returns the map src -> dst pixels
        wm = cv2.warpAffine(matte_src.astype(np.float32), warp.astype(np.float32), (W, H), flags=cv2.INTER_LINEAR)
        matte = wm > 0.5
        # the evolution badge sits a px or two off the affine fitted on the Pokémon: grow the matte 3 px around it
        zone = np.zeros((H, W), bool); zone[:200, :200] = True
        matte |= ndi.binary_dilation(matte & zone, iterations=3) & zone
        # the badge's pale grey box and its white underlay (a sliver of it sits inside the window) are never foil
        f = cv2.GaussianBlur(dst.astype(np.float32), (0, 0), 0.8)
        pale = (f.min(-1) > 140) & ((f.max(-1) - f.min(-1)) < 60) & zone
        matte |= ndi.binary_dilation(pale, iterations=2) & zone
        bg = np.clip(mjm.soft(dwin & ~matte, 0.8) * mjm.soft(dwin, 0.5), 0, 1)
        bg[~dwin] = 0
        stars = mjm.stars_alpha(dst, dwin & ~matte, bg)
        # alignment error on the Pokémon: mean abs gray difference of src warped onto dst, inside the matte
        sw_img = cv2.warpAffine(src, warp.astype(np.float32), (W, H), flags=cv2.INTER_LINEAR)
        core = ndi.binary_erosion(matte, iterations=3)
        err = np.abs(sw_img.astype(np.float32) - dst.astype(np.float32)).mean(-1)[core].mean() if core.any() else -1
        print(f"{n:2d} {names[f'base4-{n}']:<11} <- {rs}-{rn} win {dw} src {sw} warp scale {warp[0,0]:.3f},{warp[1,1]:.3f} shift {warp[0,2]:.1f},{warp[1,2]:.1f} align err {err:.1f} foil {bg[dwin].mean():.3f}")
        if args.write:
            mjm.save_alpha(OUT / f"{n}-bg-v{VERSION}.webp", bg)
            mjm.save_alpha(OUT / f"{n}-stars-v{VERSION}.webp", stars)
        if args.preview:
            ov = dst.astype(np.float32).copy()
            tint = np.array([255, 0, 255], np.float32)
            ov = ov * (1 - bg[..., None] * 0.45) + tint * bg[..., None] * 0.45 * 0.6
            edge = (wm > 0.5) ^ ndi.binary_erosion(wm > 0.5)
            ov[edge & dwin] = [0, 255, 0]
            st = (stars[..., None] * 255).repeat(3, -1)
            pair = np.concatenate([ov[60:440, 40:560], st[60:440, 40:560]], 1).astype(np.uint8)
            tile = Image.fromarray(pair)
            ImageDraw.Draw(tile).text((6, 6), f"{n} {names[f'base4-{n}']} err {err:.1f}", fill=(255, 255, 0))
            tile.save(args.preview / f"{n}-cut.png")
            tiles.append(tile)
    if args.glitter:
        for h in "ab":
            shutil.copy(ROOT / f"assets/foil/fam/wotc-jungle/glitter-{h}-v1.webp", OUT / f"glitter-{h}-v{VERSION}.webp")
    if args.preview and tiles:
        tw, th = tiles[0].size
        cols = 2
        sheet = Image.new("RGB", (tw * cols, th * ((len(tiles) + cols - 1) // cols)), "white")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(args.preview / "sheet.png")


if __name__ == "__main__":
    main()
