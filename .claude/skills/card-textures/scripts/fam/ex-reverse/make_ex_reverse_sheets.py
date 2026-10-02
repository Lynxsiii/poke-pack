#!/usr/bin/env python3
"""Contact sheets of the EX reverse maps: per card the scan and the scan with the matte area dimmed (outline cyan).

  python3 make_ex_reverse_sheets.py --list cards.json --maps DIR --out DIR [--sets ex16,ex15] [--per 24] [--cols 3]

Writes <out>/masks-<set>.jpg (one tall image per set) and, with --pages, <out>/pages/masks-<set>-<n>.jpg (--per cards each).
"""
import argparse, json, os
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))


def cell(c, path, scale):
    rgb = np.asarray(Image.open(os.path.join(ROOT, c["image"])).convert("RGB")).astype(np.float32)
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3].astype(np.float32) / 255
    win = np.asarray(Image.open(os.path.join(ROOT, c["map"])).convert("RGBA"))[..., 3] > 128
    ys, xs = np.where(win)
    y0, y1, x0, x1 = ys.min() - 12, ys.max() + 13, xs.min() - 12, xs.max() + 13
    m = a > 0.5
    vis = rgb.copy(); vis[~m] *= 0.28
    edge = m ^ cv2.erode(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    vis[edge] = [0, 255, 255]
    both = np.concatenate([rgb[y0:y1, x0:x1], vis[y0:y1, x0:x1]], 1)
    both = cv2.resize(np.clip(both, 0, 255).astype(np.uint8), None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    both = np.ascontiguousarray(both)
    cv2.putText(both, c["id"], (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
    return both


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--list", required=True); ap.add_argument("--maps", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--sets", default=""); ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--cols", type=int, default=3); ap.add_argument("--per", type=int, default=24)
    ap.add_argument("--pages", action="store_true")
    ap.add_argument("--ids", default="")
    a = ap.parse_args()
    cards = json.load(open(a.list))
    if a.sets: cards = [c for c in cards if c["set"] in a.sets.split(",")]
    if a.ids: cards = [c for c in cards if c["id"] in a.ids.split(",")]
    os.makedirs(a.out, exist_ok=True)
    for s in dict.fromkeys(c["set"] for c in cards):
        cells = []
        for c in [c for c in cards if c["set"] == s]:
            p = os.path.join(a.maps, f"{c['id']}-v1.webp")
            if os.path.exists(p): cells.append(cell(c, p, a.scale))
        if not cells: continue
        w = max(x.shape[1] for x in cells)
        cells = [np.pad(x, ((0, 0), (0, w - x.shape[1]), (0, 0))) for x in cells]

        def grid(cs):
            cs = cs + [np.zeros_like(cs[0])] * (-len(cs) % a.cols)
            rows = []
            for i in range(0, len(cs), a.cols):
                r = cs[i:i + a.cols]; h = max(x.shape[0] for x in r)
                rows.append(np.concatenate([np.pad(x, ((0, h - x.shape[0]), (0, 0), (0, 0))) for x in r], 1))
            return np.concatenate(rows, 0)
        Image.fromarray(grid(cells)).save(os.path.join(a.out, f"masks-{s}.jpg"), quality=80)
        if a.pages:
            os.makedirs(os.path.join(a.out, "pages"), exist_ok=True)
            for n, i in enumerate(range(0, len(cells), a.per)):
                Image.fromarray(grid(cells[i:i + a.per])).save(os.path.join(a.out, "pages", f"masks-{s}-{n}.jpg"), quality=80)


if __name__ == "__main__":
    main()
