#!/usr/bin/env python3
"""xy-sheen-holo: draw a foil window for the Sheen prints TCG Live has no map for (Kalos starter set, the Mirror
black-star promos, the trainer kits), with the Pokemon cut out.

Each card's own art decides: the era's layout window (assets/foil/xy-win/pokemon.webp, or pokemon-evo.webp when the card
has the evolution circle) is the base; OpenCV GrabCut inside the window separates the Pokemon (centre prior, border strip
= background); the Pokemon (opened, closed, holes filled, 1 px grown and feathered) is removed from the window alpha.
Real Sheen promos print the Pokemon matte over foil background (Tyranitar XY130, Kyurem, Raikou photos). A card whose
cut-out is implausible (under 7% or over 72% of the window) keeps the plain window and is listed as "kept".

Output: assets/foil/fam/xy-sheen-holo/win/<id>.webp (600 x 838, white with the window as alpha) and a QA sheet.
Seeded and re-runnable:  python3 draw_windows.py [--sheet out.jpg] [ids...]
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

ROOT = "/home/user/poke-pack"
OUT = f"{ROOT}/assets/foil/fam/xy-sheen-holo/win"
W, H = 600, 838
IDS = ["xy0-k10", "xy0-k14", "xy0-k5", "xy1-xyp001", "xy1-xyp002", "xy1-xyp003", "xy1-xyp004",
       "xy10-xyp127", "xy10-xyp128", "xy10-xyp129", "xy10-xyp130", "xy10-xyp153", "xy10-xyp156",
       "xy4-xyp036", "xy4-xyp037", "xy4-xyp038",
       "xytk6a-30", "xytk6b-30", "xytk7a-30", "xytk7b-30", "xytk8a-30", "xytk8b-30", "xytk9a-30", "xytk9b-30"]


# The printed XY Fates Collide logo (bottom right of the art, matte on the real card) as a box in card px (600 x 838).
LOGO = {cid: (285, 328, 548, 405) for cid in ("xy10-xyp127", "xy10-xyp128", "xy10-xyp129", "xy10-xyp130")}
# xyp067a (Jirachi) is a borderless art on another frame: left to the era's window.


def load_cards():
    out = {}
    for f in os.listdir(f"{ROOT}/data"):
        if not f.endswith(".json"):
            continue
        d = json.load(open(f"{ROOT}/data/{f}"))
        for c in (d if isinstance(d, list) else d.get("cards", [])):
            out[c["id"]] = c
    return out


def draw(card):
    subs = card.get("subtypes") or []
    circle = "Stage 1" in subs or "Stage 2" in subs or bool(card.get("evolvesFrom"))
    base = Image.open(f"{ROOT}/assets/foil/xy-win/{'pokemon-evo' if circle else 'pokemon'}.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
    A = np.asarray(base)[..., 3].astype(np.float32) / 255.0
    im = Image.open(f"{ROOT}/{card['image']}").convert("RGBA").resize((W, H), Image.LANCZOS)
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    rgb = cv2.cvtColor(np.asarray(bg.convert("RGB")), cv2.COLOR_RGB2BGR)
    ys, xs = np.where(A > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgb[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    sc = 0.6
    small = cv2.resize(crop, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    m = np.full((sh, sw), cv2.GC_PR_BGD, np.uint8)
    b = int(min(sh, sw) * 0.07)
    m[:b, :] = cv2.GC_BGD; m[-b:, :] = cv2.GC_BGD; m[:, :b] = cv2.GC_BGD; m[:, -b:] = cv2.GC_BGD
    yy, xx = np.mgrid[0:sh, 0:sw]
    ell = ((xx - sw * 0.5) / (sw * 0.30)) ** 2 + ((yy - sh * 0.52) / (sh * 0.36)) ** 2 < 1
    m[ell & (m == cv2.GC_PR_BGD)] = cv2.GC_PR_FGD
    core = ((xx - sw * 0.5) / (sw * 0.12)) ** 2 + ((yy - sh * 0.52) / (sh * 0.16)) ** 2 < 1
    m[core] = cv2.GC_FGD
    cv2.setRNGSeed(7)
    bgm = np.zeros((1, 65), np.float64); fgm = np.zeros((1, 65), np.float64)
    cv2.grabCut(small, m, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 0.015 * sh * sw:
            keep[lab == i] = 1
    cnts, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(keep)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    frac = float(filled.mean())
    full = cv2.resize(filled.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    full = cv2.GaussianBlur(full, (0, 0), 1.6)
    full = np.clip((full - 0.35) * 2.2, 0, 1)
    full = cv2.dilate(full, np.ones((3, 3), np.uint8))
    matte = np.zeros((H, W), np.float32)
    matte[y0:y1, x0:x1] = full
    ok = 0.07 < frac < 0.72
    if card["id"] in LOGO:
        x0b, y0b, x1b, y1b = LOGO[card["id"]]
        box = np.zeros((H, W), np.float32)
        box[y0b:y1b, x0b:x1b] = 1.0
        box = cv2.GaussianBlur(box, (0, 0), 3.0)
        matte = np.maximum(matte, np.clip(box * 1.6, 0, 1))
    alpha = A * (1.0 - matte) if ok else A
    return alpha, frac, ok, rgb


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sheet = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    if sheet:
        args = [a for a in args if a != sheet]
    ids = args or IDS
    cards = load_cards()
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for cid in ids:
        alpha, frac, ok, rgb = draw(cards[cid])
        rgba = np.dstack([np.full((H, W, 3), 255, np.uint8), (alpha * 255).astype(np.uint8)])
        Image.fromarray(rgba, "RGBA").save(f"{OUT}/{cid}.webp", quality=92, method=6)
        print(f"{cid:14} {cards[cid]['name']:14} pokemon {frac*100:4.0f}% of window  {'cut' if ok else 'KEPT plain window'}")
        art = cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB).astype(np.float32)
        tint = np.array([255, 0, 200], np.float32)
        vis = art * (1 - 0.55 * alpha[..., None]) + tint * 0.55 * alpha[..., None]
        tiles.append(Image.fromarray(vis.clip(0, 255).astype(np.uint8)).crop((0, 60, W, 480)).resize((300, 210)))
    if sheet and tiles:
        cols = 5
        rows = (len(tiles) + cols - 1) // cols
        S = Image.new("RGB", (cols * 300, rows * 210), (20, 20, 20))
        for i, t in enumerate(tiles):
            S.paste(t, ((i % cols) * 300, (i // cols) * 210))
        S.save(sheet, quality=88)


if __name__ == "__main__":
    main()
