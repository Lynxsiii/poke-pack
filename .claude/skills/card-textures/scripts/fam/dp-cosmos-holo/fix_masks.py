"""dp-cosmos-holo, re-cut of the cards whose first automatic cut-out failed (foil on the creature, creature missing, empty map).

What it draws: for each id a new Pokemon mask, written in auto_mask.py's format (<out>/<id>.npz: mask, box, iou, area, prompts).
How: SAM2-small on the art-window crop with several prompt sets (a hand rectangle round the middle of the window as the box,
the window box with negative points at the corners, a tight box round the saliency blob) plus the first cut-out and its inverse;
the candidate wins on: Pokemon area 10-80% of the window, little of the window's border ring covered (the sky is at the
border, the creature is in the middle: that rejects inverted masks), a high predicted IoU and an outline that follows real
edges. usage: fix_masks.py --models DIR --old DIR --out DIR --census census.json <id> ..."""
import argparse, json, os, sys
import numpy as np, cv2
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import auto_mask as A


def ring_of(win):
    h, w = win.shape
    r = np.zeros((h, w), bool); b = max(8, int(min(h, w) * 0.07))
    r[:b] = r[-b:] = True; r[:, :b] = True; r[:, -b:] = True
    return r & win


def stats(m, win, gm, rg):
    mb = (m > 0.5) & win
    fr = mb.sum() / max(1, win.sum())
    rf = (mb & rg).sum() / max(1, rg.sum())
    rim = (ndi.binary_dilation(mb, iterations=2) & ~ndi.binary_erosion(mb, iterations=2)) & win
    edge = float(gm[rim].mean() / max(1e-3, gm[win].mean())) if rim.sum() > 50 else 0.0
    return fr, rf, edge


def score(q, fr, rf, edge):
    if not (0.10 <= fr <= 0.80) or rf > 0.5:
        return -1
    return 0.45 * q + 0.35 * min(edge, 3.0) / 3.0 + 0.2 * (1 - min(1.0, rf / 0.5))


def run(enc, dec, row, old, out):
    cid = row["id"]
    crop, box, win = A.window_crop(row)
    w, h = crop.size
    gray = cv2.GaussianBlur(cv2.cvtColor(np.asarray(crop), cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.2)
    gm = np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1))
    rg = ring_of(win)
    sal = A.saliency(crop, win)
    y1, x1 = np.unravel_index(int(np.argmax(sal)), sal.shape)
    top = sal >= np.percentile(sal[win], 80)
    ys, xs = np.nonzero(top)
    tb = [max(2, np.percentile(xs, 3) - 0.06 * w), max(2, np.percentile(ys, 3) - 0.06 * h), min(w - 3, np.percentile(xs, 97) + 0.06 * w), min(h - 3, np.percentile(ys, 97) + 0.06 * h)]
    feats, s, nw, nh = A.encode(enc, crop)
    cx, cy = w / 2, h / 2
    mid = [0.10 * w, 0.06 * h, 0.90 * w, 0.96 * h]
    sets = {
        "mid+sal": ([mid[:2], mid[2:], [x1, y1], [cx, cy]], [2, 3, 1, 1]),
        "mid": ([mid[:2], mid[2:], [cx, cy]], [2, 3, 1]),
        "win-neg": ([[2, 2], [w - 3, h - 3], [x1, y1], [0.05 * w, 0.08 * h], [0.95 * w, 0.08 * h], [0.05 * w, 0.92 * h], [0.95 * w, 0.92 * h]], [2, 3, 1, 0, 0, 0, 0]),
        "tight": ([tb[:2], tb[2:], [x1, y1]], [2, 3, 1]),
        "tight-neg": ([tb[:2], tb[2:], [x1, y1], [0.05 * w, 0.08 * h], [0.95 * w, 0.92 * h]], [2, 3, 1, 0, 0]),
    }
    cands = []
    for name, (pts, lab) in sets.items():
        ms, ious = A.decode(dec, feats, s, nw, nh, w, h, pts, lab)
        for k, (m, q) in enumerate(zip(ms, ious)):
            cands.append((f"{name}.{k}", m, float(q)))
    z = np.load(os.path.join(old, cid + ".npz"))
    om = z["mask"].astype(np.float32) / 255
    cands.append(("old", om, float(z["iou"])))
    cands.append(("old-inv", 1 - om, float(z["iou"])))
    best = None
    for name, m, q in cands:
        fr, rf, edge = stats(m, win, gm, rg)
        sc = score(q, fr, rf, edge)
        if best is None or sc > best[0]:
            best = (sc, name, m, q, fr, rf, edge)
    sc, name, m, q, fr, rf, edge = best
    np.savez_compressed(os.path.join(out, cid + ".npz"), mask=(m * 255).astype(np.uint8), box=np.array(box), iou=q, area=fr,
                        prompts=np.array([[x1, y1], [cx, cy]], np.float32))
    return name, sc, q, fr, rf, edge


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True); ap.add_argument("--old", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--census", required=True); ap.add_argument("ids", nargs="+")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rows = {r["id"]: r for r in json.load(open(a.census))}
    enc, dec = A.sessions(a.models)
    for cid in a.ids:
        name, sc, q, fr, rf, edge = run(enc, dec, rows[cid], a.old, a.out)
        print(f"{cid:14s} {name:12s} score {sc:.2f} iou {q:.2f} area {fr:.2f} ring {rf:.2f} edge {edge:.2f}", flush=True)
