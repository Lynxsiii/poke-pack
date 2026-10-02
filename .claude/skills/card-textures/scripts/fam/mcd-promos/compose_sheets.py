#!/usr/bin/env python3
"""Compose the before/after and phone-compare sheets of the mcd-promos family from mcd_cards.mjs renders.

mcd_cards.mjs writes <png> and <png without .png>.json (each face's rectangle in CSS px per pose row; the PNGs are scale 3).
    python3 compose_sheets.py --bef a.png,b.png --aft c.png,d.png --out /mnt/project-files/holo-remaster/mcd-promos/sheets \
        [--real zorua=/path.png,...] [--compare mcd11-9,mcd12-5,mcd16-7]

Writes before-after-<id>.jpg (a real photo column if --real has one, then the four poses of the before print over the four
of the after print, cards at 220 CSS px x 3, JPEG q88) and phone-compare.jpg (about 1170 px wide: real photo | before | after).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

SC = 3
POSES = ["rest", "30:25", "75:65", "50:78"]


def tiles(pngs):
    out = {}
    for png in pngs:
        im = Image.open(png).convert("RGB")
        js = json.load(open(png[:-4] + ".json"))
        for row in js:
            for c in row["cards"]:
                x, y, w, h = (c[k] * SC for k in "xywh")
                box = (int(x - 16 * SC), int(y - 12 * SC), int(x + w + 16 * SC), int(y + h + 12 * SC))
                out[(c["id"], row["pose"])] = im.crop(box)
    return out


def real_crop(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    yel = (a[..., 0] > 190) & (a[..., 1] > 160) & (a[..., 2] < 120)
    cols = np.where(yel.mean(0) > 0.35)[0]
    x0 = int(cols[0]) if len(cols) else 0
    return im.crop((x0, 0, im.width, im.height))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bef", required=True)
    ap.add_argument("--aft", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--real", default="")
    ap.add_argument("--compare", default="")
    args = ap.parse_args()
    bef, aft = tiles(args.bef.split(",")), tiles(args.aft.split(","))
    real = {}
    for kv in args.real.split(",") if args.real else []:
        k, v = kv.split("=")
        real[k] = real_crop(v)
    ids = sorted({k[0] for k in aft})
    for cid in ids:
        t0 = bef[(cid, POSES[0])]
        tw, th = t0.size
        left = real.get(cid)
        lw = tw if left else 0
        sheet = Image.new("RGB", (lw + 4 * tw, 2 * th), (14, 15, 17))
        if left:
            r = left.resize((lw, int(left.height * lw / left.width)), Image.LANCZOS)
            sheet.paste(r, (0, 0))
        for i, p in enumerate(POSES):
            sheet.paste(bef[(cid, p)].resize((tw, th)), (lw + i * tw, 0))
            sheet.paste(aft[(cid, p)].resize((tw, th)), (lw + i * tw, th))
        sheet.save(os.path.join(args.out, f"before-after-{cid}.jpg"), quality=88)
        print("wrote", f"before-after-{cid}.jpg", sheet.size)
    cmp_ids = [c for c in args.compare.split(",") if c]
    if cmp_ids:
        cw = 390
        rows = []
        for cid in cmp_ids:
            win = lambda t: t.crop((int(t.width * 0.07), int(t.height * 0.075), int(t.width * 0.93), int(t.height * 0.50)))
            pose = "50:78"
            cells = []
            if cid in real:
                r = real[cid]
                cells.append(r.resize((cw, int(r.height * cw / r.width)), Image.LANCZOS))
            for t in (bef[(cid, pose)], aft[(cid, pose)]):
                w = win(t)
                cells.append(w.resize((cw, int(w.height * cw / w.width)), Image.LANCZOS))
            rh = max(c.height for c in cells)
            row = Image.new("RGB", (cw * 3, rh), (14, 15, 17))
            for i, c in enumerate(cells):
                row.paste(c, (i * cw, 0))
            rows.append(row)
        sheet = Image.new("RGB", (cw * 3, sum(r.height for r in rows) + 6 * (len(rows) - 1)), (14, 15, 17))
        y = 0
        for r in rows:
            sheet.paste(r, (0, y))
            y += r.height + 6
        sheet.save(os.path.join(args.out, "phone-compare.jpg"), quality=88)
        print("wrote phone-compare.jpg", sheet.size)


if __name__ == "__main__":
    main()
