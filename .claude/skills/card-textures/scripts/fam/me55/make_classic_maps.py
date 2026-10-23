#!/usr/bin/env python3
"""Draw the 30th Celebration Classic Collection foil maps from the scans (TCG Live has none: me5-5c is empty).

What the real cards do (photos in /home/user/holo-refs/w2-me55-special, reference/fam-me55.md): the foil is the gold
border and the art background behind the subject. The Pokémon (or trainer) and its foreground are matte; on an
old-style frame so are the name bar, the species strip, the text box and the inner frame; on a full-art reprint the
background runs behind the attack text. The 30 Pikachu stamp is flat ink.

Per card (hints in classic_hints.json): the border is a band of the measured widths; the background is the art
window (or, on a full art, everything inside the border) minus the subject, which GrabCut separates inside the window
(the window's outer band seeds the background model, its centre the subject; `fg` / `bg` rectangles pin parts). The
stamp is cut out where data/me55.json places it (stampPos / stampSize, the same maths as maps.css).

Writes assets/foil/fam/me55/cc/<n>-v<V>.webp (border + background) and <n>-border-v<V>.webp (border alone), white
with the mask in alpha, 367 x 512 like TCG Live's maps, and a check sheet with --sheet <path>.

    python3 .claude/skills/card-textures/scripts/fam/me55/make_classic_maps.py [--cards cc4,cc5] [--sheet out.jpg]
"""
import argparse
import json
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "foil", "fam", "me55", "cc")
V = 1
MW, MH = 367, 512


def stamp_mask(card, W, H):
    """The stamp's alpha placed as maps.css does: mask-size <s>% auto, mask-position <x>% <y>%."""
    m = np.zeros((H, W), np.float32)
    if not card.get("stampPos") or not card.get("stampSize"):
        return m
    st = Image.open(os.path.join(ROOT, "assets", "masks", "stamp", "stamp30.png")).convert("RGBA")
    sw = float(card["stampSize"].split("%")[0]) / 100 * W
    sh = sw * st.height / st.width
    px, py = [float(v.rstrip("%")) / 100 for v in card["stampPos"].split()]
    x = (W - sw) * px
    y = (H - sh) * py
    a = np.asarray(st.resize((max(1, round(sw)), max(1, round(sh))), Image.LANCZOS))[..., 3] / 255.0
    x0, y0 = int(round(x)), int(round(y))
    h, w = a.shape
    xs0, ys0 = max(0, x0), max(0, y0)
    xs1, ys1 = min(W, x0 + w), min(H, y0 + h)
    if xs1 > xs0 and ys1 > ys0:
        m[ys0:ys1, xs0:xs1] = a[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
    # a small margin round the white outline
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    return m


def subject_mask(rgb, win, fg_rects, bg_rects, full):
    """GrabCut inside the window: 1 where the subject is."""
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = [int(round(v)) for v in (win[0] * W, win[1] * H, win[2] * W, win[3] * H)]
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1, ::-1])  # BGR
    h, w = crop.shape[:2]
    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    band = 0.07 if not full else 0.05
    bx, by = max(2, int(w * band)), max(2, int(h * band))
    mask[:by, :] = cv2.GC_PR_BGD
    mask[-by:, :] = cv2.GC_PR_BGD
    mask[:, :bx] = cv2.GC_PR_BGD
    mask[:, -bx:] = cv2.GC_PR_BGD
    # a thinner outer ring as sure background (the corners of the window are almost always background)
    cx, cy = max(1, int(w * 0.02)), max(1, int(h * 0.02))
    corner = np.zeros((h, w), bool)
    k = 0.12
    corner[: int(h * k), : int(w * k)] = True
    corner[: int(h * k), -int(w * k):] = True
    corner[-int(h * k):, : int(w * k)] = True
    corner[-int(h * k):, -int(w * k):] = True
    ring = np.zeros((h, w), bool)
    ring[:cy, :] = ring[-cy:, :] = True
    ring[:, :cx] = ring[:, -cx:] = True
    mask[ring & corner] = cv2.GC_BGD

    def rect_px(r):
        return (int(round(r[0] * W)) - x0, int(round(r[1] * H)) - y0, int(round(r[2] * W)) - x0, int(round(r[3] * H)) - y0)

    for r in bg_rects:
        a, b, c, d = rect_px(r)
        mask[max(0, b):max(0, d), max(0, a):max(0, c)] = cv2.GC_BGD
    for r in fg_rects:
        a, b, c, d = rect_px(r)
        mask[max(0, b):max(0, d), max(0, a):max(0, c)] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    # clean: keep sizeable components, fill holes
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 0.004 * h * w:
            keep[lab == i] = 1
    # fill enclosed holes (eyes, highlights inside the body)
    inv = (1 - keep).astype(np.uint8)
    n2, lab2, stats2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n2):
        x, y, ww, hh, area = stats2[i]
        touches = x == 0 or y == 0 or x + ww >= w or y + hh >= h
        if not touches and area < 0.01 * h * w:
            keep[lab2 == i] = 1
    out = np.zeros((H, W), np.float32)
    out[y0:y1, x0:x1] = keep
    return out


def draw(n, card, hint):
    img = Image.open(os.path.join(ROOT, card["image"])).convert("RGBA")
    W, H = img.size
    rgb = np.asarray(img)[..., :3].copy()
    alpha = np.asarray(img)[..., 3] / 255.0
    bl, bt, br, bb = hint["border"]
    inner = np.zeros((H, W), np.float32)
    inner[int(round(bt * H)):H - int(round(bb * H)), int(round(bl * W)):W - int(round(br * W))] = 1
    border = (1 - inner) * (alpha > 0.5)
    full = hint.get("win") is None
    if full:
        e = 0.004
        win = [bl + e, bt + e, 1 - br - e, 1 - bb - e]
    else:
        e = 0.006
        x0, y0, x1, y1 = hint["win"]
        win = [x0 + e, y0 + e, x1 - e, y1 - e]
    subj = subject_mask(rgb, win, hint.get("fg", []), hint.get("bg", []), full)
    winm = np.zeros((H, W), np.float32)
    winm[int(round(win[1] * H)):int(round(win[3] * H)), int(round(win[0] * W)):int(round(win[2] * W))] = 1
    back = winm * (1 - subj)
    stamp = stamp_mask(card, W, H)
    fmap = np.clip(np.maximum(border, back) - stamp, 0, 1)
    bmap = np.clip(border - stamp, 0, 1)
    # soften the cut by a pixel (at the scan's 600 px), then down to Live's map size
    fmap = cv2.GaussianBlur(fmap, (3, 3), 0.7)
    bmap = cv2.GaussianBlur(bmap, (3, 3), 0.7)
    os.makedirs(OUT, exist_ok=True)
    for arr, name in ((fmap, f"{n}-v{V}.webp"), (bmap, f"{n}-border-v{V}.webp")):
        a = cv2.resize(arr, (MW, MH), interpolation=cv2.INTER_AREA)
        o = np.zeros((MH, MW, 4), np.uint8)
        o[..., :3] = 255
        o[..., 3] = np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)
        Image.fromarray(o, "RGBA").save(os.path.join(OUT, name), lossless=True, quality=100, method=6)
    return img.convert("RGB"), fmap, bmap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards", default="")
    ap.add_argument("--sheet", default="")
    args = ap.parse_args()
    hints = json.load(open(os.path.join(HERE, "classic_hints.json")))
    cards = {c["number"]: c for c in json.load(open(os.path.join(ROOT, "data", "me55.json")))}
    todo = [n for n in hints if not n.startswith("_")]
    if args.cards:
        todo = [n for n in args.cards.split(",") if n in hints]
    tiles = []
    for n in todo:
        img, fmap, bmap = draw(n, cards[n], hints[n])
        print("drew", n)
        if args.sheet:
            a = np.asarray(img).astype(np.float32)
            tint = a.copy()
            # foil background: tinted cyan; border: magenta; matte: as is, dimmed
            tint = a * 0.55
            back = np.clip(fmap - bmap, 0, 1)[..., None]
            tint = tint * (1 - back) + (a * 0.5 + np.array([0, 140, 160]) * 0.5) * back
            tint = tint * (1 - bmap[..., None]) + (a * 0.5 + np.array([200, 0, 160]) * 0.5) * bmap[..., None]
            t = Image.fromarray(np.clip(tint, 0, 255).astype(np.uint8)).resize((300, 419))
            ImageDraw.Draw(t).text((4, 4), n, fill="white")
            tiles.append(t)
    if args.sheet and tiles:
        cols = 8
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 300, rows * 419), "black")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * 300, (i // cols) * 419))
        sheet.save(args.sheet, quality=88)


if __name__ == "__main__":
    main()
