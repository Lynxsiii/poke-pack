#!/usr/bin/env python3
"""xy-sheen-holo: the Cosmos window of Pikachu XY95 ("Let's Eat Together", Kanako Eo, 2016), drawn from its outlines.

Review 2 held this card on the era look: draw_windows_v2.py's GrabCut cut-out left 8% of the card as foil (slivers of sky),
because the polygons around Chespin, Pikachu and Sylveon also took the meadow. Photos of the real card
(/mnt/project-files/holo-remaster/xy-sheen-holo/refs/pikachu-xy95/) show the Cosmos foil on the whole background: the sky,
the trees, the meadow and the striped picnic blanket sparkle, while the three Pokemon, the basket, the food and the apple
are matte.

The art is drawn with closed dark crayon outlines, so the cut-out needs no colour model: the regions between the outlines
(luminance under 90, walls grown 1 px) are labelled, and the background is every region holding one of the hand-picked
points below (sky and trees, meadow patches, the blanket). Sylveon's upper ribbon has gaps in its outline where it leaves
the window, so it is cut from the sky by a hand polygon. Outline pixels inside the background (tree and cloud lines) are
closed back into it and specks under 120 px dropped, then the Pokemon matte is grown 3 px and feathered 1.6 px (as in
draw_windows_v2.py) so the foil never touches their ink. Writes assets/foil/fam/xy-sheen-holo/win/xy9-xyp095-v2.webp
(600 x 838, white with the foil area as alpha) and refuses to overwrite it. `--sheet out.jpg` writes an overlay to check.
"""
import os, sys
import numpy as np, cv2
from PIL import Image

ROOT = "/home/user/poke-pack"
OUT = f"{ROOT}/assets/foil/fam/xy-sheen-holo/win/xy9-xyp095-v2.webp"
W, H = 600, 838
INK, WALL = 90, 3
# One point in each background region (card px at 600 x 838).
BACKGROUND = [
    (100, 95),   # sky and the trees on the left
    (175, 95),   # cloud between the trees
    (300, 100),  # sky, trees and meadow behind Pikachu
    (520, 100),  # sky top right (Sylveon's upper ribbon cut by RIBBON below)
    (155, 155),  # meadow between Chespin's leaves
    (215, 210),  # meadow between Chespin and Pikachu
    (360, 180),  # meadow between Pikachu's ear and Sylveon
    (65, 197),   # meadow left of Chespin's leaf
    (510, 240),  # meadow right of Sylveon
    (62, 245),   # meadow strip at the left edge
    (405, 268),  # meadow under Sylveon's chin
    (345, 268),  # meadow between Pikachu's arm and tail
    (300, 400),  # the picnic blanket and the grass along the bottom
    (532, 312),  # meadow at the right edge
    (202, 322),  # blanket between Chespin's leg and Pikachu's foot
    (240, 351),  # blanket between Chespin's foot and the apple
]
RIBBON = [(466, 112), (480, 108), (495, 109), (505, 112), (515, 116), (525, 121), (535, 126), (548, 130),
          (548, 164), (535, 160), (525, 156), (515, 151), (505, 146), (495, 141), (485, 136), (475, 132), (464, 131)]


def load():
    im = Image.open(f"{ROOT}/assets/cards/xy9/xyp095.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    rgb = np.asarray(bg.convert("RGB")).astype(np.float32)
    win = Image.open(f"{ROOT}/assets/foil/xy-win/pokemon.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
    return rgb, np.asarray(win)[..., 3].astype(np.float32) / 255.0


def draw():
    rgb, win = load()
    inside = win > 0.5
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    wall = cv2.dilate(((lum < INK) & inside).astype(np.uint8), np.ones((WALL, WALL), np.uint8))
    free = (inside & (wall == 0)).astype(np.uint8)
    _, lab = cv2.connectedComponents(free, connectivity=4)
    ids = {int(lab[y, x]) for x, y in BACKGROUND}
    assert 0 not in ids, "a background point sits on an outline"
    bgm = np.isin(lab, sorted(ids)).astype(np.uint8)
    ribbon = np.zeros((H, W), np.uint8)
    cv2.fillPoly(ribbon, [np.array(RIBBON, np.int32)], 1)
    bgm[ribbon == 1] = 0
    # outline pixels between two background regions (trees, clouds, the blanket's grass) go back to the background
    bgm = cv2.morphologyEx(bgm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    bgm[ribbon == 1] = 0
    fg = (inside & (bgm == 0)).astype(np.uint8)
    n, flab, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 120:
            fg[flab == i] = 0
    f = cv2.dilate(fg.astype(np.float32), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    matte = np.clip((cv2.GaussianBlur(f, (0, 0), 1.6) - 0.3) * 2.0, 0, 1)
    return win * (1.0 - matte), rgb


def main():
    alpha, rgb = draw()
    print(f"foil: {alpha.mean() * 100:.1f}% of the card, {(alpha > 0.5).sum() / (np.asarray(load()[1]) > 0.5).sum() * 100:.0f}% of the art window")
    if "--sheet" in sys.argv:
        out = sys.argv[sys.argv.index("--sheet") + 1]
        a = alpha[..., None] * 0.6
        ov = rgb * (1 - a) + np.array([255, 0, 255], np.float32) * a
        sheet = np.concatenate([rgb, ov], 1)[60:440].astype(np.uint8)
        Image.fromarray(sheet).resize((sheet.shape[1] * 2, sheet.shape[0] * 2), Image.LANCZOS).save(out, quality=90)
        print("sheet", out)
    if "--write" in sys.argv:
        if os.path.exists(OUT):
            sys.exit(f"{OUT} exists: assets are immutable, write a -v3")
        img = np.zeros((H, W, 4), np.uint8); img[..., :3] = 255
        img[..., 3] = np.round(alpha * 255).astype(np.uint8)
        Image.fromarray(img, "RGBA").save(OUT, lossless=True, method=6)
        print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
