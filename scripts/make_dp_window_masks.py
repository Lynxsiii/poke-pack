#!/usr/bin/env python3
"""Draw the art-window masks of the Diamond & Pearl generation's regular frames: assets/foil/dp-win/<frame>-<layout>.webp.

TCG Live has no foil maps for 2007-2011, so the window holo (css/holo/dp.css `dp-holo`, through `dpMap()`
in js/dp-foil.js) and the reverse holo (the Mirror: the whole card minus the window, `--dp-win`) take
a drawn mask per frame. The window of a frame is fixed on the card, so it is measured, not drawn by hand:
the per-pixel standard deviation over every scan of one layout is high where the picture is and zero
where the frame, the name bar and the text box are printed. Threshold it, keep the main blob, fill the
holes, round it off, and the tab ("BASIC") and the evolution circle that overlap the picture stay cut out.

Frames (two, measured on dp1, dp3, pl1, pl3 and hgss1, hgss3, col1; the DP and Platinum windows agree to
within 0.2% of the card, the HeartGold & SoulSilver window is taller and sits lower):
    dp    Diamond & Pearl through Platinum (also POP 6-9, the DP promos, the DP Trainer Kits)
    hgss  HeartGold & SoulSilver, Call of Legends, the HGSS promos and Trainer Kits
Layouts: basic (Pokemon with the BASIC tab), stage (Stage 1 / 2: the evolution circle), trainer (Trainer,
Supporter, Stadium), senergy (Special Energy). A basic Energy has no window (the whole card is picture).

Output: white RGBA, alpha is the window, 600 x 825 (the scan's own size, so `mask-size: 100% 100%` lines
up), antialiased; about 2 KB each. Never overwrite a shipped mask: `--suffix -v2` for a redraw.

    python3 scripts/make_dp_window_masks.py --scans <dir of <set>-<n>.jpg> --meta <dir of <set>.json> --out assets/foil/dp-win
The meta files are api.pokemontcg.io /v2/cards?q=set.id:<set>&select=id,number,supertype,subtypes.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 600, 825
FRAMES = {
    "dp": ["dp1", "dp2", "dp3", "dp5", "dp7", "pl1", "pl2", "pl3", "pl4"],
    "hgss": ["hgss1", "hgss2", "hgss3", "hgss4", "col1"],
}


def layout_of(card):
    st = " ".join(card.get("subtypes", []))
    if card["supertype"] == "Trainer":
        return "trainer"
    if card["supertype"] == "Energy":
        return "energy" if "Basic" in st else "senergy"
    up = st.upper()
    if any(k in up for k in ("LEVEL-UP", "LEGEND")) or "Prime" in st or "SP" in st.split():
        return None  # LV.X, LEGEND, Prime, SP: h2's frames
    if "Stage 1" in st or "Stage 2" in st:
        return "stage"
    if "Basic" in st:
        return "basic"
    return None


def load(path):
    return np.asarray(Image.open(path).convert("L").resize((W, H), Image.LANCZOS), dtype=np.float32)


def std_map(frame, scans, meta):
    groups = {}
    for s in FRAMES[frame]:
        mp = os.path.join(meta, f"{s}.json")
        if not os.path.exists(mp):
            continue
        try:
            cards = json.load(open(mp))["data"]
        except (ValueError, KeyError):
            continue  # an API error page, not a card list
        for c in cards:
            lay = layout_of(c)
            p = os.path.join(scans, f"{s}-{c['number']}.jpg")
            if lay and os.path.exists(p):
                groups.setdefault(lay, []).append(p)
    return groups


def window(stack, layout):
    s = stack.std(0)
    sm = ndi.uniform_filter(s, 5)
    # the picture varies a lot from card to card; the frame does not. The cut sits on the bevel line.
    m = sm > 26
    m[int(H * (0.76 if layout == "senergy" else 0.66)):] = False
    m = ndi.binary_opening(m, structure=np.ones((9, 9)))
    lab, k = ndi.label(m)
    if not k:
        raise SystemExit(f"no window found for {layout}")
    sizes = ndi.sum(m, lab, range(1, k + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    m = ndi.binary_fill_holes(m)
    m = ndi.binary_closing(m, structure=np.ones((5, 5)))
    m = ndi.binary_fill_holes(m)
    # the std blur widens the blob by about its kernel: pull the edge back 2 px so the foil stops on the bevel
    m = ndi.binary_erosion(m, structure=np.ones((3, 3)), iterations=2)
    if layout == "senergy":
        # the picture runs under the title and bleeds to both sides of the frame: its rectangle
        rows = np.where(m.sum(1) > 0.55 * m.sum(1).max())[0]
        cols = np.where(m[rows[0]:rows[-1]].sum(0) > 0.55 * (rows[-1] - rows[0]))[0]
        m = np.zeros_like(m)
        m[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1] = True
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scans", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--suffix", default="")
    ap.add_argument("--preview", help="write a contact sheet of the masks here")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    prev = []
    for frame in FRAMES:
        for lay, paths in std_map(frame, args.scans, args.meta).items():
            if lay == "energy" or len(paths) < 3:
                continue
            stack = np.stack([load(p) for p in paths])
            m = window(stack, lay)
            ys, xs = np.where(m)
            print(f"{frame}-{lay}: {len(paths)} scans, x {xs.min() / W:.4f}-{(xs.max() + 1) / W:.4f}, y {ys.min() / H:.4f}-{(ys.max() + 1) / H:.4f}")
            # antialias: blur the binary edge a little
            a = ndi.gaussian_filter(m.astype(np.float32), 0.8)
            rgba = np.zeros((H, W, 4), np.uint8)
            rgba[..., :3] = 255
            rgba[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
            out = os.path.join(args.out, f"{frame}-{lay}{args.suffix}.webp")
            if os.path.exists(out):
                raise SystemExit(f"{out} exists: never overwrite a shipped asset, pass --suffix")
            Image.fromarray(rgba, "RGBA").save(out, "WEBP", lossless=True, quality=100, method=6)
            prev.append((f"{frame}-{lay}", rgba[..., 3]))
    if args.preview and prev:
        sh = Image.new("L", (300 * len(prev), 413))
        for i, (_, a) in enumerate(prev):
            sh.paste(Image.fromarray(a).resize((300, 413)), (i * 300, 0))
        sh.save(args.preview)


if __name__ == "__main__":
    main()
