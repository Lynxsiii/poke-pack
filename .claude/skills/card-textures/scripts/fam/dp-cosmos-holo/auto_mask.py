"""dp-cosmos-holo, step 1: an automatic Pokemon cut-out per card, so the foil can leave the Pokemon matte.

What it draws: for each card id, a soft mask (0..255, at the art-window crop size) of the Pokemon, written to
<out>/<id>.npz (mask, box = the window crop in card px, iou, area, prompts).
From what: the card scan (assets/cards/<set>/<n>.webp), the era's art-window shape (the card's `map` in census.json, one of
assets/foil/dp-win/*.webp) and SAM2-small (ONNX encoder + decoder; HuggingFace vietanhdev/segment-anything-2-onnx-models,
sam2_hiera_small.encoder.onnx and .decoder.onnx; put them in --models). Prompts are automatic: the window box, one saliency
peak (colour distance from the window's border colours, centre-weighted) and the centre of the saliency blob; the best of the
six candidate masks by predicted IoU with an area between 8 and 78 percent of the window wins.
usage: auto_mask.py --models DIR --out DIR --census census.json <id> [<id> ...]      (about 4 s a card on 2 threads)"""
import argparse, json, os, sys, time
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
import onnxruntime as ort

ROOT = os.environ.get("ROOT", "/home/user/poke-pack")
S = 1024
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def sessions(md):
    so = ort.SessionOptions(); so.intra_op_num_threads = 2; so.inter_op_num_threads = 1; so.log_severity_level = 3
    return (ort.InferenceSession(os.path.join(md, "sam2_hiera_small.encoder.onnx"), so, providers=["CPUExecutionProvider"]),
            ort.InferenceSession(os.path.join(md, "sam2_hiera_small.decoder.onnx"), so, providers=["CPUExecutionProvider"]))


def encode(enc, crop):
    w, h = crop.size
    s = S / max(w, h); nw, nh = int(round(w * s)), int(round(h * s))
    a = np.zeros((S, S, 3), np.float32)
    a[:nh, :nw] = (np.asarray(crop.resize((nw, nh), Image.BILINEAR)).astype(np.float32) / 255 - MEAN) / STD
    return enc.run(None, {"image": a.transpose(2, 0, 1)[None]}), s, nw, nh


def decode(dec, feats, s, nw, nh, w, h, points, labels):
    out = dec.run(None, {"image_embed": feats[2], "high_res_feats_0": feats[0], "high_res_feats_1": feats[1],
                         "point_coords": (np.array(points, np.float32) * s)[None], "point_labels": np.array(labels, np.float32)[None],
                         "mask_input": np.zeros((1, 1, 256, 256), np.float32), "has_mask_input": np.zeros(1, np.float32)})
    res = []
    for m in out[0][0]:
        mm = np.asarray(Image.fromarray(m.astype(np.float32)).resize((S, S), Image.BILINEAR))[:nh, :nw]
        mm = np.asarray(Image.fromarray(mm).resize((w, h), Image.BILINEAR))
        res.append(1 / (1 + np.exp(-mm)))
    return np.stack(res), out[1][0]


def window_crop(row):
    im = Image.open(f"{ROOT}/{row['img']}").convert("RGB")
    win = np.asarray(Image.open(f"{ROOT}/{row['map']}").convert("RGBA").resize(im.size, Image.BILINEAR))[..., 3] > 128
    ys, xs = np.nonzero(win)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return im.crop(box), box, win[box[1]:box[3], box[0]:box[2]]


def saliency(crop, win):
    lab = cv2.cvtColor(np.asarray(crop), cv2.COLOR_RGB2LAB).astype(np.float32)
    h, w = win.shape
    ring = np.zeros((h, w), bool); b = max(6, int(min(h, w) * 0.06))
    ring[:b] = ring[-b:] = True; ring[:, :b] = True; ring[:, -b:] = True
    px = lab[ring & win]
    if len(px) < 50:
        return np.ones((h, w), np.float32)
    _, _, cen = cv2.kmeans(px, 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 15, 1.0), 2, cv2.KMEANS_PP_CENTERS)
    d = cv2.GaussianBlur(np.min([np.linalg.norm(lab - c, axis=-1) for c in cen], axis=0), (0, 0), 5)
    yy, xx = np.mgrid[0:h, 0:w]
    prior = np.exp(-(((xx - w / 2) / (0.33 * w)) ** 2 + ((yy - h / 2) / (0.33 * h)) ** 2))
    return (d / max(d.max(), 1e-3) * prior * win).astype(np.float32)


def run(enc, dec, row, out):
    crop, box, win = window_crop(row)
    w, h = crop.size
    sal = saliency(crop, win)
    y1, x1 = np.unravel_index(int(np.argmax(sal)), sal.shape)
    top = sal >= np.percentile(sal[win], 85)
    lab, n = ndi.label(top)
    if n:
        k = int(np.argmax(ndi.sum(top, lab, range(1, n + 1)))) + 1
        cy, cx = ndi.center_of_mass(lab == k)
    else:
        cy, cx = h / 2, w / 2
    prompts = [[2, 2], [w - 3, h - 3], [x1, y1], [cx, cy]]
    feats, s, nw, nh = encode(enc, crop)
    m1, i1 = decode(dec, feats, s, nw, nh, w, h, prompts, [2, 3, 1, 1])
    m2, i2 = decode(dec, feats, s, nw, nh, w, h, [[2, 2], [w - 3, h - 3], [w / 2, h / 2]], [2, 3, 1])
    allm, alli = np.concatenate([m1, m2]), np.concatenate([i1, i2])
    wa = max(1, win.sum())
    best, bs = None, -1
    for m, q in zip(allm, alli):
        fr = ((m > 0.5) & win).sum() / wa
        if 0.08 <= fr <= 0.78 and q > bs:
            best, bs = (m, q, fr), q
    if best is None:
        k = int(np.argmax(alli)); best = (allm[k], alli[k], float(((allm[k] > 0.5) & win).sum() / wa))
    m, q, fr = best
    np.savez_compressed(os.path.join(out, f"{row['id']}.npz"), mask=(m * 255).astype(np.uint8), box=np.array(box), iou=q, area=fr,
                        prompts=np.array(prompts, np.float32))
    return q, fr


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True); ap.add_argument("--out", required=True); ap.add_argument("--census", required=True)
    ap.add_argument("ids", nargs="+")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rows = {r["id"]: r for r in json.load(open(a.census))}
    enc, dec = sessions(a.models)
    for cid in a.ids:
        t = time.time(); q, fr = run(enc, dec, rows[cid], a.out)
        print(cid, "iou %.2f area %.2f %.1fs" % (q, fr, time.time() - t), flush=True)
