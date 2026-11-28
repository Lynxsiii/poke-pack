#!/usr/bin/env python3
"""Shining Fates / Shiny Star V baby shinies: a background-only foil map per card, from the card's own scan.

TCG Live's foil map holds the Pokémon at full foil, so the family's grey silver, its rainbow ray and the shared
shine all sat on the figure (per-card review 2026-11-28: "rainbow covers the Pokémon", "glitter specks over dark
body"). The scan says where the silver shows bare: the art window's background scans paper white. This keeps
Live's map only where the scan is white AND that white reaches the window's edge (a white belly or paw enclosed
by the figure's outline is ink, not bare foil), feathered by a pixel.

  python3 make_bg_maps.py            # every sf-shiny baby in data/swsh45.json and data/js4a.json
  python3 make_bg_maps.py --ids swsh45-SV040 --preview /tmp/x   # also write a PNG to look at
Writes assets/foil/fam/swsh-sf-shiny/bg/<id>-v1.webp (alpha = foil). js/fam/swsh-sf-shiny.js points at it by id.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
OUT = "assets/foil/fam/swsh-sf-shiny/bg"
VER = "v1"


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def bg_map(scan_path, map_path, photo=False):
    live = np.asarray(Image.open(map_path).convert("RGBA"))[..., 3].astype(np.float32) / 255
    h, w = live.shape
    rgb = np.asarray(Image.open(scan_path).convert("RGB").resize((w, h), Image.LANCZOS)).astype(np.float32)
    lo, hi = rgb.min(-1), rgb.max(-1)
    if photo:
        # a photographed print (the Japanese scans): the bare silver is a pale grey with the etch and a faint
        # rainbow in it, never paper white. Smooth the grain away first, then take pale and nearly grey.
        soft_rgb = ndi.gaussian_filter(rgb, (1.6, 1.6, 0))
        lo, hi = soft_rgb.min(-1), soft_rgb.max(-1)
        white = smooth(lo, 128, 168) * (1 - smooth(hi - lo, 34, 70))
    else:
        white = smooth(lo, 200, 238) * (1 - smooth(hi - lo, 18, 55))
    # the art window: the bounding box of Live's foil in the top half of the card
    top = live[: int(h * 0.56)] > 0.25
    ys, xs = np.where(ndi.binary_opening(top, iterations=2))
    if len(ys) == 0:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    cand = (white > 0.5) & (live > 0.12)
    lab, n = ndi.label(cand)
    edge = np.zeros_like(cand)
    m = 4
    edge[y0 : y0 + m, x0:x1 + 1] = edge[y1 - m + 1 : y1 + 1, x0:x1 + 1] = True
    edge[y0:y1 + 1, x0 : x0 + m] = edge[y0:y1 + 1, x1 - m + 1 : x1 + 1] = True
    keep_ids = np.unique(lab[edge & cand])
    keep = np.isin(lab, keep_ids[keep_ids > 0])
    keep[int(h * 0.56):] = False
    soft = ndi.gaussian_filter(keep.astype(np.float32), 0.8)
    out = live * white * np.clip(soft * 1.3, 0, 1)
    share = keep[y0:y1, x0:x1].mean()
    return out, share


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids")
    ap.add_argument("--preview")
    a = ap.parse_args()
    only = set(a.ids.split(",")) if a.ids else None
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    low = []
    for s in ("swsh45", "js4a"):
        d = json.load(open(os.path.join(ROOT, "data", s + ".json")))
        for c in d["cards"] if isinstance(d, dict) else d:
            if c.get("gallery") != "sv" or c.get("rarity") != "Rare Shiny" or not c.get("foilMap"):
                continue
            if only and c["id"] not in only:
                continue
            r = bg_map(os.path.join(ROOT, c["image"]), os.path.join(ROOT, c["foilMap"]), photo=(s == "js4a"))
            if r is None:
                print("no window:", c["id"]); continue
            m, share = r
            if share < 0.2:
                low.append((c["id"], round(float(share), 2)))
            al = (m * 255 + 0.5).astype(np.uint8)
            im = Image.merge("RGBA", [Image.new("L", al.shape[::-1], 255)] * 3 + [Image.fromarray(al)])
            im.save(os.path.join(ROOT, OUT, f"{c['id']}-{VER}.webp"), quality=88, method=4, exact=True)
            if a.preview:
                os.makedirs(a.preview, exist_ok=True)
                Image.fromarray(al).save(os.path.join(a.preview, c["id"] + ".png"))
    if low:
        print("background under 20% of the window (check by eye):", low)


if __name__ == "__main__":
    main()
