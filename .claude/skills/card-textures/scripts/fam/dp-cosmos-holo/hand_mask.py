"""dp-cosmos-holo, hand-prompted Pokemon cut-outs (for the cards auto_mask.py / fix_masks.py could not cut).

What it draws: for each card in the prompts file, the three SAM2-small candidate masks for the clicks given, as
<out>/<id>.npz (masks (3,h,w) float16, iou, box = the art-window crop in card px) and a review sheet (the crop with the clicks, then
the three candidates with the Pokemon in its own colours and the foil area tinted blue). `pick` then writes the chosen candidate in
auto_mask.py's format (mask uint8, box, iou, area, prompts) for gen_maps.py.
Prompts file, one card a line: `<id>: [box=C2-K7] +F3 +D5@0.3,0.8 -K2 ...`; cells are the 12 x 8 grid over the window crop (A-L, 1-8,
the clicked point is the cell centre, or @fx,fy inside the cell); + is on the Pokemon, - is background.
usage: hand_mask.py run --models DIR --census census.json --out DIR --sheet sheet.png prompts.txt
       hand_mask.py pick --census census.json --hand DIR --out DIR <id>=<k> [<id>=<k> ...]      (k = candidate 0-2; <id>=<k>:add=x0,y0,x1,y1 or :sub=... in crop px, or :fill=1 to fill the holes the mask encloses)"""
import argparse, json, os, re, sys
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import auto_mask as A

COLS, ROWS = 12, 8
CELL = re.compile(r"^([A-L])([1-8])(?:@([\d.]+),([\d.]+))?$")


def parse(line):
    cid, rest = line.split(":", 1)
    box, pts, lab = None, [], []
    for tok in rest.split():
        if tok.startswith("box="):
            a, b = tok[4:].split("-")
            box = (a, b); continue
        sign = 1 if tok[0] == "+" else 0
        m = CELL.match(tok[1:])
        pts.append((m.group(1), int(m.group(2)), float(m.group(3) or 0.5), float(m.group(4) or 0.5))); lab.append(sign)
    return cid.strip(), box, pts, lab


def px(cell, w, h):
    c, r, fx, fy = cell
    return [("ABCDEFGHIJKL".index(c) + fx) * w / COLS, (r - 1 + fy) * h / ROWS]


def tinted(crop, m):
    a = np.asarray(crop).astype(np.float32)
    mk = (m > 0.5)[..., None]
    v = np.where(mk, a, (a.mean(-1, keepdims=True) * 0.35 + 20) * np.array([0.7, 0.8, 1.3]))
    return Image.fromarray(np.clip(v, 0, 255).astype(np.uint8))


def run(a):
    rows = {r["id"]: r for r in json.load(open(a.census))}
    enc, dec = A.sessions(a.models)
    os.makedirs(a.out, exist_ok=True)
    tiles = []
    for line in open(a.prompts):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cid, box, pts, lab = parse(line)
        crop, bx, win = A.window_crop(rows[cid])
        w, h = crop.size
        P, L = [], []
        if box:
            (c0, r0), (c1, r1) = (("ABCDEFGHIJKL".index(box[0][0]), int(box[0][1])), ("ABCDEFGHIJKL".index(box[1][0]), int(box[1][1])))
            P += [[c0 * w / COLS, (r0 - 1) * h / ROWS], [(c1 + 1) * w / COLS, r1 * h / ROWS]]; L += [2, 3]
        xy = [px(p, w, h) for p in pts]
        P += xy; L += lab
        feats, s, nw, nh = A.encode(enc, crop)
        ms, iou = A.decode(dec, feats, s, nw, nh, w, h, P, L)
        np.savez_compressed(os.path.join(a.out, cid + ".npz"), masks=ms.astype(np.float16), iou=iou, box=np.array(bx))
        print(cid, "iou", np.round(iou, 2), "area", [round(float(((m > .5) & win).sum() / win.sum()), 2) for m in ms], flush=True)
        tw = 380; sc = tw / w
        row = Image.new("RGB", (tw * 4, int(h * sc)), (16, 16, 20))
        c0 = crop.copy(); d = ImageDraw.Draw(c0)
        for (x, y), l in zip(xy, lab):
            d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(0, 255, 0) if l else (255, 0, 0), width=3)
        row.paste(c0.resize((tw, int(h * sc))), (0, 0))
        for k in range(3):
            t = tinted(crop, ms[k]).resize((tw, int(h * sc)))
            ImageDraw.Draw(t).text((4, 4), f"{cid} k{k} iou {iou[k]:.2f}", fill=(255, 255, 0))
            row.paste(t, (tw * (k + 1), 0))
        tiles.append(row)
    sh = Image.new("RGB", (max(t.width for t in tiles), sum(t.height for t in tiles)))
    y = 0
    for t in tiles:
        sh.paste(t, (0, y)); y += t.height
    sh.save(a.sheet); print("sheet", a.sheet, sh.size)


def pick(a):
    rows = {r["id"]: r for r in json.load(open(a.census))}
    os.makedirs(a.out, exist_ok=True)
    for spec in a.picks:
        main, *ops = spec.split(":")
        cid, k = main.split("="); k = int(k)
        z = np.load(os.path.join(a.hand, cid + ".npz"))
        m = z["masks"][k].astype(np.float32)
        h, w = m.shape
        for op in ops:
            kind, v = op.split("=")
            if kind == "fill":      # fill every hole the mask encloses (a creature with no see-through gaps)
                from scipy import ndimage as ndi
                m = ndi.binary_fill_holes(m > 0.5).astype(np.float32)
                continue
            x0, y0, x1, y1 = [int(float(t)) for t in v.split(",")]
            m[y0:y1, x0:x1] = 1.0 if kind == "add" else 0.0
        crop, bx, win = A.window_crop(rows[cid])
        np.savez_compressed(os.path.join(a.out, cid + ".npz"), mask=(m * 255).astype(np.uint8), box=np.array(bx), iou=float(z["iou"][k]),
                            area=float(((m > .5) & win).sum() / win.sum()), prompts=np.zeros((1, 2), np.float32))
        print("picked", cid, k, ops)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest="cmd", required=True)
    r = sp.add_parser("run"); r.add_argument("--models", required=True); r.add_argument("--census", required=True); r.add_argument("--out", required=True)
    r.add_argument("--sheet", required=True); r.add_argument("prompts")
    p = sp.add_parser("pick"); p.add_argument("--census", required=True); p.add_argument("--hand", required=True); p.add_argument("--out", required=True)
    p.add_argument("picks", nargs="+")
    a = ap.parse_args()
    run(a) if a.cmd == "run" else pick(a)
