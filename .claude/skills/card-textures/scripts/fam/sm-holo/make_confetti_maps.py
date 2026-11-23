"""McDonald's Collection 2017-2019 (family sm-holo, `smh-confetti`): foil maps drawn from the scans.

  python3 .claude/skills/card-textures/scripts/fam/sm-holo/make_confetti_maps.py [--v 1] [--only mcd17-1,...]
      [--preview out.jpg]

TCG Live's maps of these 36 prints are one plain white art window (the Pokémon foiled too), but on the real cards
(Pikipek mcd17 11, Pikachu mcd18 4, Psyduck mcd18 2, Caterpie mcd19 1, Pikachu mcd19 6) only the window's background
carries the confetti; the Pokémon is smooth matte print. Every print reprints a main-set card with the same art (the
table below; Bulbapedia via /mnt/project-files/sun-moon/research/mcd-2017-2019.md), and our scans of the McDonald's
prints show the confetti as a fine polygon mottle the main-set scan does not have. So: register the main-set scan onto
the McDonald's scan (ECC, affine, on blurred copies), take each scan's fine-detail energy (high-pass at flake scale,
high-pass the difference of the two scans at flake scale (a local colour shift between the prints drops out) and average
it over about two flakes: where it is high the confetti is printed, the foil; where it is low the two prints agree, the
matte Pokémon. The Pokémon's line art is in both scans and cancels. Cleaned (small islands
dropped, holes filled), the matte grown back to the printed outline (the averaging spreads the flakes onto it),
feathered 1 px, cut to Live's window.
Writes assets/foil/fam/sm-holo/maps/<id>-v<N>.webp (367 x 512, white, the map in alpha, like the shipped maps).
"""
import argparse
import json
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
OUT = os.path.join(ROOT, "assets/foil/fam/sm-holo/maps")
W, H = 367, 512

# McDonald's print -> the main-set print it reprints (same art, no confetti)
SOURCE = {
    "mcd17-1": "sm1/9", "mcd17-2": "sm1/13", "mcd17-3": "sm1/24", "mcd17-4": "sm1/39", "mcd17-5": "smp/smp004",
    "mcd17-6": "sm1/64", "mcd17-7": "sm1/72", "mcd17-8": "sm1/78", "mcd17-9": "sm1/86", "mcd17-10": "sm1/92",
    "mcd17-11": "sm1/106", "mcd17-12": "sm1/109",
    "mcd18-1": "sm1/21", "mcd18-2": "sm1/28", "mcd18-3": "sm3/29", "mcd18-4": "sm4/30", "mcd18-5": "sm2/48",
    "mcd18-6": "sm2/63", "mcd18-7": "sm4/52", "mcd18-8": "sm5/80", "mcd18-9": "sm1/94", "mcd18-10": "sm2/101",
    "mcd18-11": "sm1/101", "mcd18-12": "sm3/103",
    "mcd19-1": "sm3/1", "mcd19-2": "sm6/2", "mcd19-3": "sm5/18", "mcd19-4": "sm5/28", "mcd19-5": "sm75/21",
    "mcd19-6": "sm35/28", "mcd19-7": "sm4/36", "mcd19-8": "sm4/50", "mcd19-9": "sm7/71", "mcd19-10": "sm8/118",
    "mcd19-11": "sm5/79", "mcd19-12": "sm5/104",
}
# Drawn maps that failed review (2026-10-22): the Pokémon foiled or the background matte. Not written; js/fam/sm-holo.js
# leaves these prints on TCG Live's plain window (CONFETTI_MAP there lists the shipped ones).
REJECT = {"mcd19-2"}
# Prints whose threshold map foiled the Pokémon (its print differs from the main-set scan, or the background is too
# dark or pale for the flakes to show): GrabCut on the main-set scan instead, seeded with the difference map (sure
# background where it is high, probable Pokémon where it is low). Rowlet's stump and Diglett's rocks come out matte too.
GRABCUT = {"mcd17-1", "mcd17-9", "mcd18-3", "mcd19-9"}
# Prints neither of those separates (2026-10-23): GrabCut on the McDonald's scan itself (blurred over the flakes),
# started from a hand-set box around the Pokémon, (left, top, right, bottom) as fractions of Live's window. Alolan
# Exeggutor mcd19 2 failed this too (its sky came out matte) and stays on Live's window (REJECT).
BOX = {"mcd17-2": (0.03, 0.12, 0.85, 0.9), "mcd19-1": (0.2, 0.05, 0.85, 0.9), "mcd19-11": (0.08, 0.15, 0.92, 0.92)}
SIZE = (600, 838)
THRESHOLD = 0.55  # matte where the flake-scale difference is under this share of the window's median
CLOSE = 5  # px, closes the line art inside a Pokémon
GROW = 6  # px at 600 wide, see draw()
MIN_MATTE = 0.012  # a matte blob smaller than this share of the window is confetti the threshold missed


def load(path):
    return np.asarray(Image.open(os.path.join(ROOT, path)).convert("RGB").resize(SIZE, Image.LANCZOS), dtype=np.float32) / 255


def register(src, dst, win):
    """Warp src onto dst (affine ECC on blurred grey copies, inside the window)."""
    a = cv2.GaussianBlur(dst.mean(2), (0, 0), 3)
    b = cv2.GaussianBlur(src.mean(2), (0, 0), 3)
    warp = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    try:
        cc, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, crit, win.astype(np.uint8), 5)
    except cv2.error:
        cc = 0.0
    out = cv2.warpAffine(src, warp, SIZE, flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    return out, cc


def draw(card):
    mcd = load(card["image"])
    live = np.asarray(Image.open(os.path.join(ROOT, card["foilMap"])).getchannel("A").resize(SIZE, Image.BILINEAR), dtype=np.float32) / 255
    win = live > 0.5
    src, cc = register(load(f"assets/cards/{SOURCE[card['id']]}.webp"), mcd, ndi.binary_erosion(win, iterations=6))
    # the confetti is detail the main-set print does not have: the difference of the two scans, high-passed at flake
    # scale (a local colour shift between the two prints drops out), averaged over about two flakes
    diff = ndi.gaussian_filter(mcd - src, (0.8, 0.8, 0))
    hp = diff - ndi.gaussian_filter(diff, (3, 3, 0))
    d = ndi.gaussian_filter(np.abs(hp).sum(2), 4)
    # flakes under dark ink and on near-white print fainter: weigh the difference by the room the print leaves
    lum = ndi.gaussian_filter(mcd.mean(2), 8)
    d = d / (np.minimum(lum, 1 - lum) + 0.2)
    level = np.median(d[win])
    if card["id"] in BOX:
        ys, xs = np.where(win)
        crop = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        img = np.ascontiguousarray((cv2.GaussianBlur(np.clip(mcd[crop], 0, 1), (0, 0), 2) * 255).astype(np.uint8)[:, :, ::-1])
        h, w = img.shape[:2]
        l, t, r, b = BOX[card["id"]]
        gc = np.zeros((h, w), np.uint8)
        cv2.setRNGSeed(1)
        cv2.grabCut(img, gc, (int(l * w), int(t * h), int((r - l) * w), int((b - t) * h)), np.zeros((1, 65)),
                    np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_RECT)
        matte = np.zeros_like(win)
        matte[crop] = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
        matte &= win
    elif card["id"] in GRABCUT:
        img = (np.clip(src, 0, 1) * 255).astype(np.uint8)[:, :, ::-1].copy()
        gc = np.full(win.shape, cv2.GC_PR_BGD, np.uint8)
        gc[~win] = cv2.GC_BGD
        gc[(d > 1.3 * level) & win] = cv2.GC_BGD
        gc[(d < 0.5 * level) & win] = cv2.GC_PR_FGD
        cv2.setRNGSeed(1)
        cv2.grabCut(img, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
        matte = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)) & win
    else:
        matte = (d < THRESHOLD * level) & win
        # the Pokémon: its line art (a thin seam of misregistration) closed over
        matte = ndi.binary_closing(matte, iterations=CLOSE)
    # holes filled, small islands dropped
    matte = ndi.binary_opening(matte, iterations=3) & win
    lab, n = ndi.label(matte)
    if n:
        sizes = ndi.sum(matte, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes > MIN_MATTE * win.sum()
        matte = ndi.binary_fill_holes(keep[lab]) & win
    fg = win & ~matte
    lab, n = ndi.label(fg)
    if n:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes > 0.004 * win.sum()
        fg = keep[lab]
    # the averaging (sigma 4) spreads the background's flakes about 6 px onto the Pokémon: grow the matte back by that
    # much, so the edge sits on the printed outline
    fg = win & ~ndi.binary_dilation(win & ~fg, iterations=2 if card["id"] in BOX else GROW)
    a = ndi.gaussian_filter(fg.astype(np.float32), 1.0) * live
    m = Image.fromarray((np.clip(a, 0, 1) * 255).round().astype(np.uint8), "L").resize((W, H), Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    out.putalpha(m)
    return out, fg.sum() / max(win.sum(), 1), cc


def cards():
    for set_id in ("mcd17", "mcd18", "mcd19"):
        d = json.load(open(os.path.join(ROOT, "data", f"{set_id}.json")))
        yield from (d if isinstance(d, list) else d.get("cards", []))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--v", type=int, default=1)
    p.add_argument("--only", default="")
    p.add_argument("--preview", default="")
    args = p.parse_args()
    os.makedirs(OUT, exist_ok=True)
    only = set(filter(None, args.only.split(",")))
    tiles = []
    for card in cards():
        if (only and card["id"] not in only) or card["id"] not in SOURCE or not card.get("foilMap"):
            continue
        if card["id"] in REJECT and not only:
            continue
        img, share, cc = draw(card)
        path = os.path.join(OUT, f"{card['id']}-v{args.v}.webp")
        img.save(path, "WEBP", lossless=True)
        print(f"{card['id']}: foil {share:.2f} of the window, registration {cc:.3f} -> {os.path.relpath(path, ROOT)}")
        if args.preview:
            scan = Image.open(os.path.join(ROOT, card["image"])).convert("RGB").resize((W, H))
            grey = Image.blend(scan, Image.new("RGB", (W, H), (0, 0, 0)), 0.6)
            tiles.append(Image.composite(scan, grey, img.getchannel("A")).crop((10, 40, W - 10, 280)))
    if args.preview and tiles:
        cols = 6
        tw, th = tiles[0].size
        sheet = Image.new("RGB", (cols * tw, ((len(tiles) + cols - 1) // cols) * th), "white")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(args.preview, quality=88)


if __name__ == "__main__":
    main()
