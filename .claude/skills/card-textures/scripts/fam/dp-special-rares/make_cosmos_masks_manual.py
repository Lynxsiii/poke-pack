#!/usr/bin/env python3
"""Hand-prompted SAM2 cut-outs of the Pokemon, for the cosmos maps where dp-cosmos-holo's auto_mask.py picked the wrong thing.

auto_mask.py prompts SAM2 with the window box and two automatic points and keeps the candidate with the best predicted IoU; on
Arceus AR5 (silver Arceus on a black disc) it took the dark sky for the Pokemon (foil on Arceus), on Dialga SL2 it left holes in
the creature, on Palkia SL8 it left a patch on the arm and on Suicune SL11 (blue mane over a pink swirl) it took the whole window. Here every card gets points chosen by eye
on the scan (card pixels, 600 x 838): positives on the Pokemon, negatives on the background, plus the window box.

    stage 1  make_cosmos_masks_manual.py --models DIR --work DIR [--cards pl4-AR5,...]
             writes <work>/cand-<id>.png (every SAM candidate tinted on the window) and <work>/cand-<id>.npz
    stage 2  make_cosmos_masks_manual.py --work DIR --pick pl4-AR5=1,col1-SL2=0,pl1-129=1/1   (k/n: keep the n largest blobs of candidate k)
             writes <work>/masks2/<id>.npz in auto_mask.py's format; then run dp-cosmos-holo's gen_maps.py with --masks <work>/masks2

Never edits dp-cosmos-holo's scripts; imports auto_mask.py for the SAM session, the window crop and the decoder.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
sys.path.insert(0, str(ROOT / ".claude" / "skills" / "card-textures" / "scripts" / "fam" / "dp-cosmos-holo"))

# card pixels (600 x 838): where the Pokemon is (pos) and where it is not (neg)
PROMPTS = {
    "pl4-AR5": dict(pos=[(265, 316), (275, 136), (390, 241), (430, 376), (320, 376), (165, 141)],
                    neg=[(90, 301), (490, 116), (340, 191), (515, 376), (440, 151)]),
    "col1-SL2": dict(pos=[(401, 266), (439, 186), (294, 271), (369, 311), (194, 211), (304, 366), (469, 376), (144, 321)],
                     neg=[(244, 146), (84, 251), (494, 151), (519, 326), (74, 156), (394, 411)]),
    "col1-SL8": dict(pos=[(193, 189), (360, 243), (273, 276), (473, 143), (493, 209), (407, 356), (133, 296), (200, 278), (330, 330)],
                     neg=[(107, 143), (507, 343), (67, 343), (307, 96), (80, 220), (530, 260)]),
    # secrets (--work = a folder holding the secrets' census.json)
    "dp7-103": dict(pos=[(375, 311), (237, 208), (237, 173), (478, 229), (354, 380), (513, 394), (120, 229), (216, 218)],
                    neg=[(133, 111), (333, 118), (513, 111), (71, 373), (168, 394), (300, 145)]),
    "pl1-129": dict(pos=[(275, 125), (220, 246), (331, 253), (303, 270), (200, 332), (351, 360), (220, 384), (365, 401), (255, 190)],
                    neg=[(82, 139), (482, 153), (517, 277), (82, 311), (255, 400), (448, 387), (150, 250), (450, 250)]),
    "pl2-112": dict(pos=[(237, 242), (168, 146), (354, 173), (257, 346), (499, 346), (533, 298), (420, 240)],
                    neg=[(71, 173), (257, 118), (395, 111), (513, 139), (92, 373), (450, 373), (120, 300)]),
    "pl2-113": dict(pos=[(296, 311), (400, 311), (351, 187), (131, 194), (165, 256), (186, 318), (331, 360)],
                    neg=[(103, 277), (517, 153), (482, 298), (220, 139), (400, 111), (103, 380), (296, 111), (480, 380)]),
    "pl2-114": dict(pos=[(306, 180), (271, 249), (354, 98), (216, 132), (106, 242), (175, 291), (389, 201)],
                    neg=[(444, 139), (478, 208), (120, 139), (85, 346), (375, 367), (513, 332), (340, 298)]),
    "pl3-149": dict(pos=[(450, 232), (381, 289), (105, 242), (243, 187), (236, 111), (333, 111), (202, 394), (140, 298), (367, 208)],
                    neg=[(57, 139), (519, 139), (533, 298), (84, 360), (381, 366), (484, 401), (300, 130)]),
    "dp2-124": dict(pos=[(180, 190), (150, 265), (470, 175), (500, 250), (370, 350), (330, 390), (190, 385), (95, 330)],
                    neg=[(300, 260), (330, 130), (420, 300), (100, 150), (500, 385), (270, 335), (300, 165)]),
    "pl3-148": dict(pos=[(60, 250), (90, 232), (110, 190), (180, 170), (270, 155), (230, 110), (105, 285), (180, 270), (310, 310), (455, 305),
                         (510, 280), (390, 340), (480, 375), (290, 375), (350, 400)],
                    neg=[(380, 195), (370, 260), (325, 130), (480, 145), (530, 260), (90, 365), (155, 390), (70, 120), (380, 385), (440, 230)]),
    "col1-SL11": dict(pos=[(269, 146), (404, 201), (444, 241), (209, 276), (324, 321), (154, 321), (469, 291)],
                      neg=[(159, 116), (494, 136), (304, 336), (114, 251), (514, 366)]),
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--models", type=Path)
    ap.add_argument("--work", required=True, type=Path)
    ap.add_argument("--cards", default=",".join(PROMPTS))
    ap.add_argument("--pick", default="", help="id=k,... : write masks2/<id>.npz from candidate k")
    a = ap.parse_args()
    a.work.mkdir(parents=True, exist_ok=True)
    rows = {r["id"]: r for r in json.load(open(a.work / "census.json"))}
    if a.pick:
        (a.work / "masks2").mkdir(exist_ok=True)
        for item in a.pick.split(","):
            cid, k = item.split("=")
            keep = 0
            if "/" in k:                      # "1/2": candidate 1, keep its 2 largest blobs (drops stray patches of background)
                k, keep = k.split("/"); keep = int(keep)
            z = np.load(a.work / f"cand-{cid}.npz")
            m = z["masks"][int(k)]
            if keep:
                from scipy import ndimage as ndi
                lab, n = ndi.label(m > 0.5)
                if n > keep:
                    sizes = ndi.sum(m > 0.5, lab, range(1, n + 1))
                    ok = np.zeros(n + 1, bool); ok[1 + np.argsort(sizes)[::-1][:keep]] = True
                    m = np.where(ok[lab], m, 0)
            np.savez_compressed(a.work / "masks2" / f"{cid}.npz", mask=(m * 255).astype(np.uint8), box=z["box"], iou=z["iou"][int(k)],
                                area=float(z["area"][int(k)]), prompts=z["prompts"])
            print("picked", cid, k)
        return
    import auto_mask as am
    enc, dec = am.sessions(str(a.models))
    for cid in a.cards.split(","):
        crop, box, win = am.window_crop(rows[cid])
        w, h = crop.size
        P = PROMPTS[cid]
        pts = [[2, 2], [w - 3, h - 3]] + [[x - box[0], y - box[1]] for x, y in P["pos"]] + [[x - box[0], y - box[1]] for x, y in P["neg"]]
        lab = [2, 3] + [1] * len(P["pos"]) + [0] * len(P["neg"])
        feats, s, nw, nh = am.encode(enc, crop)
        masks, iou = am.decode(dec, feats, s, nw, nh, w, h, pts, lab)
        area = np.array([((m > 0.5) & win).sum() / max(1, win.sum()) for m in masks])
        np.savez_compressed(a.work / f"cand-{cid}.npz", masks=masks.astype(np.float16), box=np.array(box), iou=iou, area=area,
                            prompts=np.array(pts, np.float32))
        base = np.asarray(crop).astype(np.float32)
        tiles = []
        for k, m in enumerate(masks):
            v = base * (1 - 0.6 * (m[..., None] > 0.5)) + np.array([255, 0, 200], np.float32) * 0.6 * (m[..., None] > 0.5)
            t = Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)).resize((w * 3 // 2, h * 3 // 2), Image.LANCZOS)
            ImageDraw.Draw(t).text((6, 6), f"{cid} cand {k} iou {iou[k]:.2f} area {area[k]:.2f}", fill=(255, 255, 0))
            tiles.append(t)
        sheet = Image.new("RGB", (tiles[0].width * 2, tiles[0].height * ((len(tiles) + 1) // 2)))
        for k, t in enumerate(tiles):
            sheet.paste(t, ((k % 2) * t.width, (k // 2) * t.height))
        sheet.save(a.work / f"cand-{cid}.png")
        print(cid, [f"{k}: iou {iou[k]:.2f} area {area[k]:.2f}" for k in range(len(masks))], flush=True)


if __name__ == "__main__":
    main()
