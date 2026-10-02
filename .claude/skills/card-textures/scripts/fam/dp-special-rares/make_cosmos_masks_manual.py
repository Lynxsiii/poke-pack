#!/usr/bin/env python3
"""Hand-prompted SAM2 cut-outs of the Pokemon, for the cosmos maps where dp-cosmos-holo's auto_mask.py picked the wrong thing.

auto_mask.py prompts SAM2 with the window box and two automatic points and keeps the candidate with the best predicted IoU; on
Arceus AR5 (silver Arceus on a black disc) it took the dark sky for the Pokemon (foil on Arceus), on Dialga SL2 it left holes in
the creature, on Palkia SL8 it left a patch on the arm and on Suicune SL11 (blue mane over a pink swirl) it took the whole window. Here every card gets points chosen by eye
on the scan (card pixels, 600 x 838): positives on the Pokemon, negatives on the background, plus the window box.

    stage 1  make_cosmos_masks_manual.py --models DIR --work DIR [--cards pl4-AR5,...]
             writes <work>/cand-<id>.png (every SAM candidate tinted on the window) and <work>/cand-<id>.npz
    stage 2  make_cosmos_masks_manual.py --work DIR --pick pl4-AR5=1,col1-SL2=0
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
            z = np.load(a.work / f"cand-{cid}.npz")
            m = z["masks"][int(k)]
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
