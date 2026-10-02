#!/usr/bin/env python3
"""Draw the wotc-crystal family's per-card foil maps: assets/foil/fam/wotc-crystal/<set>-<n>-{foil,dots-a,dots-b}-v1.webp.

What the real card does (photos, frames and sources: /mnt/project-files/holo-remaster/wotc-crystal/refs/SOURCES.md):
the nine Crystal Pokémon of Aquapolis (ecard2 148-150) and Skyridge (ecard3 145-150) are e-Card HOLO prints. The foil is
the e-Card cosmos (one-colour squares, dots, rounded crosses and big round sparkle discs), and it shows only where the ink
lets it through: the art window's BACKGROUND (the sky, the ground, the glows), the see-through parts of the "crystal"
drawing (Nidoking's chest plates, Kingdra's fins, Ho-Oh's ghost outline), the left-edge slot dashes, the 13 slots of the
e-Reader strip and the e logo. The Pokémon itself (ink on a white underlay), the yellow border, the name bar, the pastel
text box and the red "Crystal Type" banner are matte print. Each scan carries the real card's sparkle baked in (it is a
scan of the foil), so each card's maps are drawn from its own scan:

  foil    alpha = where the card is foil: the window minus the Pokémon (a GrabCut segmentation seeded by the scan's own
          sparkle density, per-card colour rules and hand polygons, below), the see-through parts at SEE_W, the slot
          dashes, the strip slots and the e logo at SMALL_W. Soft 1 px edge.
  dots-a  alpha = the sparkle flecks of the scan (a fleck: the brightest channel stands 30+ levels above its 9 px median,
  dots-b  or a colour outlier as bright as its surround; small, compact, not hugging a dark ink line), inside the foil
          map, with a faint 2 px halo so a lit fleck blooms. The flecks are split at random (seeded) into two halves that
          the CSS lights at different tilts, the way neighbouring cosmos elements catch the lamp at different angles.

All files are white RGBA 600 x 838 (the scan's size, so `mask-size: 100% 100%` lines up), alpha is the mask, lossless WebP.
Never overwrite a shipped map: a redraw takes a new suffix (--suffix -v2).

    python3 .claude/skills/card-textures/scripts/fam/wotc-crystal/make_crystal_maps.py [--cards ecard3-146,...]
        [--suffix -v1] [--preview <dir>] [--dry-run] [--force]

--preview writes one overlay per card (figure tinted red, see-through amber, flecks yellow, small foil cyan) to judge the
maps against the scan; --dry-run draws the previews without writing assets; --force rewrites this family's own unshipped
files (never use it once the lead says the family shipped).
"""
import argparse
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "foil", "fam", "wotc-crystal")
WIN = os.path.join(ROOT, "assets", "foil", "wotc-ecard", "win-pokemon-v1.webp")
W, H = 600, 838
SEED = 20030916  # Skyridge's release date
SEE_W = 0.5      # a see-through part of the drawing: the ink over it is thinner, not gone
SMALL_W = 0.75   # the slot dashes, the strip slots and the e logo: dark ink over the foil, the flecks show
FLECK = 30       # sparkle threshold, levels over the 9 px median


def ell(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def poly_mask(polys, shape=(H, W)):
    m = np.zeros(shape, np.uint8)
    for p in polys or []:
        cv2.fillPoly(m, [np.array(p, np.int32).reshape(-1, 2)], 1)
    return m.astype(bool)


# Per card: colour rules (numpy expressions over H in degrees, S and V in 0..1, L luminance 0..255) for sure figure (fgc)
# and sure foil (bgc); polygons in scan pixels for sure figure (fg), sure foil (bg), probable figure (pfg) and the
# see-through parts (see). Polygons were read off a 10 px grid over each scan.
def E(cx, cy, rx, ry, n=18):
    """An ellipse as a polygon."""
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return [(int(round(cx + rx * np.cos(a))), int(round(cy + ry * np.sin(a)))) for a in t]


CARDS = {
    "ecard2-148": dict(
        name="Kingdra",
        outline=[[(283, 190), (292, 178), (318, 170), (330, 150), (338, 120), (345, 95), (410, 92), (430, 98), (470, 96),
                  (505, 106), (490, 118), (478, 135), (482, 170), (470, 195), (500, 200), (538, 218), (530, 232),
                  (490, 238), (512, 262), (515, 320), (548, 335), (555, 375), (545, 405), (500, 410), (330, 410),
                  (296, 405), (288, 330), (290, 262), (300, 238), (318, 232), (300, 215), (283, 200)]],
        band=6,
        bg=[E(472, 156, 13, 14)],
        see=[[(286, 236), (338, 234), (338, 410), (296, 410), (285, 330)],
             [(398, 245), (510, 245), (515, 322), (470, 330), (420, 320), (400, 290)]],
    ),
    "ecard2-149": dict(
        name="Lugia",
        fgc="((V > 0.7) & (S < 0.25)) | ((H > 255) & (H < 320) & (S > 0.3) & (V > 0.22))", fgc_open=3,
        bgc="(V < 0.42) & (H > 195) & (H < 250) & (S > 0.3)",
        bg=[[(58, 96), (150, 96), (150, 110), (140, 150), (152, 190), (175, 215), (190, 330), (58, 330)]],
    ),
    "ecard2-150": dict(
        name="Nidoking",
        fgc="(H > 255) & (H < 325) & (S > 0.15) & (V > 0.42)", fgc_open=3,
        bgc="(V < 0.28) & (S > 0.3)", bgc_open=3,
        see=[[(212, 262), (255, 250), (300, 262), (300, 300), (285, 330), (300, 360), (260, 372), (225, 360), (215, 320)]],
        bg=[[(548, 345), (580, 330), (580, 410), (540, 410)]],
    ),
    "ecard3-145": dict(
        name="Celebi",
        fgc="(H > 60) & (H < 120) & (S > 0.3) & (V > 0.6)", fgc_open=3,
        bgc="(V < 0.3)", bgc_open=3,
    ),
    "ecard3-146": dict(
        name="Charizard",
        fgc="((H < 75) | (H > 335)) & (S > 0.42) & (V > 0.3)",
        fg=[E(153, 270, 18, 30), E(111, 342, 28, 20), E(218, 335, 16, 22), E(430, 365, 33, 18), E(415, 392, 14, 12),
            [(356, 262), (386, 258), (392, 300), (394, 345), (385, 350), (360, 330), (352, 300)]],
        bg=[[(57, 96), (148, 96), (141, 140), (134, 180), (128, 212), (118, 228), (96, 242), (76, 264), (62, 288), (57, 296)]],
    ),
    "ecard3-147": dict(
        name="Crobat",
        fgc="((H > 300) | (H < 10)) & (S > 0.35) & (V > 0.35)",
        bgc="(V < 0.35) & (H > 180) & (H < 250)",
    ),
    "ecard3-148": dict(
        name="Golem",
        outline=[[(123, 220), (135, 200), (163, 180), (177, 173), (220, 153), (243, 140), (267, 133), (293, 127), (313, 123),
                  (340, 127), (367, 137), (393, 153), (410, 173), (420, 187), (430, 207), (422, 225), (421, 250), (418, 283),
                  (414, 310), (405, 332), (388, 348), (345, 352), (300, 322), (260, 296), (225, 276), (205, 270), (183, 263),
                  (150, 258), (130, 250)]],
        band=6,
    ),
    "ecard3-149": dict(
        name="Ho-Oh",
        fgc="(((H < 45) | (H > 300)) & (S > 0.45) & (V > 0.45)) | ((H >= 45) & (H < 65) & (S > 0.5) & (V > 0.8))",
        bgc="((H > 35) & (H < 80) & (V < 0.6) & (V > 0.18) & (S > 0.3)) | ((V < 0.4) & (H > 200) & (H < 265))",
        min_hole=150,
    ),
    "ecard3-150": dict(
        name="Kabutops",
        fgc="(H > 20) & (H < 50) & (S > 0.35) & (V > 0.45)", fgc_open=3,
        pfg=[[(280, 186), (267, 185), (220, 185), (180, 198), (147, 221), (123, 248), (110, 275), (103, 305), (107, 348),
              (123, 392), (150, 368), (152, 321), (165, 281), (190, 250), (223, 230), (253, 222), (282, 216)],
             [(367, 288), (413, 275), (443, 261), (463, 268), (480, 295), (487, 338), (497, 381), (500, 410), (460, 410),
              (450, 371), (440, 335), (430, 303), (400, 306), (370, 309)]],
        bg=[[(150, 96), (325, 96), (290, 120), (262, 150), (240, 160), (180, 152), (150, 140)],
            [(318, 380), (345, 365), (380, 355), (425, 350), (440, 365), (452, 410), (300, 410)]],
    ),
}


def sparkle(rgb):
    """Boolean map of the scan's baked sparkle flecks and a 0..1 strength."""
    rgbf = rgb.astype(np.float32)
    V = rgbf.max(-1)
    med = cv2.medianBlur(V.astype(np.uint8), 9).astype(np.float32)
    th = V - med
    medc = cv2.medianBlur(rgb, 9).astype(np.float32)
    cd = np.sqrt(((rgbf - medc) ** 2).sum(-1))
    lum = rgbf @ np.array([0.299, 0.587, 0.114], np.float32)
    lmed = medc @ np.array([0.299, 0.587, 0.114], np.float32)
    score = np.maximum(th, np.where(lum > lmed - 4, cd * 0.7, 0))
    b = cv2.morphologyEx((score > FLECK).astype(np.uint8), cv2.MORPH_CLOSE, ell(1))
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
    dark = cv2.erode(lum, ell(3))
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < 3 or max(w, h) > 18 or max(w, h) > 2.6 * min(w, h) + 2:
            continue
        sl = lab[y:y + h, x:x + w] == i
        # a bright edge beside a dark ink line is the drawing's highlight, not a fleck
        if lmed[y:y + h, x:x + w][sl].mean() - dark[y:y + h, x:x + w][sl].min() > 75:
            continue
        keep[i] = True
    fl = keep[lab]
    strength = np.clip((score - FLECK * 0.6) / 40.0, 0, 1) * cv2.dilate(fl.astype(np.uint8), ell(1)).astype(bool)
    return fl, strength, lab * fl


def small_foil(rgb):
    """The slot dashes down the left edge, the 13 slots of the e-Reader strip and the e logo."""
    lum = rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    m = np.zeros((H, W), bool)
    # left-edge dashes: dark bars on the yellow border
    box = np.zeros((H, W), bool)
    box[8:830, 4:58] = True
    d = (lum < 150) & box
    d = cv2.morphologyEx(d.astype(np.uint8), cv2.MORPH_CLOSE, ell(1))
    n, lab, st, _ = cv2.connectedComponentsWithStats(d, 8)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 14 <= w <= 60 and 3 <= h <= 14 and a >= 25:
            m |= lab == i
    # strip slots: dark upright bars
    box[:] = False
    box[780:836, 320:575] = True
    d = (lum < 150) & box
    d = cv2.morphologyEx(d.astype(np.uint8), cv2.MORPH_CLOSE, ell(1))
    n, lab, st, _ = cv2.connectedComponentsWithStats(d, 8)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 3 <= w <= 14 and 18 <= h <= 50 and a >= 40:
            m |= lab == i
    # the e logo: olive gold, darker than the border
    box[:] = False
    box[760:836, 0:110] = True
    d = (lum < 178) & box
    d = cv2.morphologyEx(d.astype(np.uint8), cv2.MORPH_CLOSE, ell(2))
    n, lab, st, _ = cv2.connectedComponentsWithStats(d, 8)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a >= 60:
            m |= lab == i
    return cv2.dilate(m.astype(np.uint8), ell(1)).astype(bool)


def card_window(rgb, old):
    """The art window of this scan: the shared e-Card window (win-pokemon-v1) fitted to the card's own yellow bevel.

    The shared mask reaches 1 to 3 px onto the bevel on the left and the bottom, stops 4 px short of the right edge and
    carries a stepped tab into the name bar and the evolution circle at the top left: the bevel's yellow is cut away
    within 9 px of the shared edge, the window may grow 7 px into non-yellow print, and only the main body is kept."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    Hh, Ss, Vv = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
    yellow = (Hh > 30) & (Hh < 70) & (Ss > 0.45) & (Vv > 0.6)
    o = (old > 0.5).astype(np.uint8)
    core = cv2.erode(o, ell(9)).astype(bool)
    zone = cv2.dilate(o, ell(7)).astype(bool) & ~core
    w = core | (zone & ~yellow)
    w[:109, :120] &= ~zone[:109, :120]
    w = cv2.morphologyEx(w.astype(np.uint8), cv2.MORPH_OPEN, ell(1))
    n, lab, st, _ = cv2.connectedComponentsWithStats(w, 4)
    w = lab == (1 + int(np.argmax(st[1:, 4])))
    inv = (~w).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        x, y, ww, hh, a = st[i]
        if x > 0 and y > 0 and x + ww < W and y + hh < H:
            w[lab == i] = True
    return np.clip(cv2.GaussianBlur(w.astype(np.float32), (0, 0), 0.6), 0, 1)


def segment(rgb, win, fl, cfg):
    """Figure (True) vs foil background inside the window, by GrabCut."""
    Wb = win > 0.5
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    env = dict(H=hsv[..., 0] * 360 / 256, S=hsv[..., 1] / 255, V=hsv[..., 2] / 255,
               L=rgb.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32), np=np)
    D = cv2.GaussianBlur((fl & Wb).astype(np.float32), (0, 0), 9)
    Dn = D / max(np.percentile(D[Wb], 85), 1e-6)
    gm = np.where(Dn > cfg.get("pr_bg", 0.3), cv2.GC_PR_BGD, cv2.GC_PR_FGD).astype(np.uint8)
    gm[Dn > cfg.get("sure_bg", 0.85)] = cv2.GC_BGD
    if cfg.get("outline"):
        o = poly_mask(cfg["outline"]).astype(np.uint8)
        band = cfg.get("band", 6)
        inner = cv2.erode(o, ell(band)).astype(bool)
        outer = cv2.dilate(o, ell(band)).astype(bool)
        ob = o.astype(bool)
        gm[:] = cv2.GC_BGD
        gm[outer & ~ob] = cv2.GC_PR_BGD
        gm[ob & ~inner] = cv2.GC_PR_FGD
        gm[inner] = cv2.GC_FGD
    if cfg.get("fgc"):
        f = eval(cfg["fgc"], {}, env).astype(np.uint8)
        f = cv2.morphologyEx(f, cv2.MORPH_OPEN, ell(cfg.get("fgc_open", 2))).astype(bool)
        gm[f] = cv2.GC_FGD
    if cfg.get("bgc"):
        b = eval(cfg["bgc"], {}, env).astype(np.uint8)
        b = cv2.morphologyEx(b, cv2.MORPH_OPEN, ell(cfg.get("bgc_open", 2))).astype(bool)
        gm[b] = cv2.GC_BGD
    gm[poly_mask(cfg.get("pfg"))] = cv2.GC_PR_FGD
    gm[poly_mask(cfg.get("pbg"))] = cv2.GC_PR_BGD
    gm[poly_mask(cfg.get("fg"))] = cv2.GC_FGD
    gm[poly_mask(cfg.get("bg"))] = cv2.GC_BGD
    # outside the window: copy the nearest window pixel's label and colour, so the frame's yellow never trains a model
    out = ~Wb
    _, idx = cv2.distanceTransformWithLabels(out.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(~out)
    lut_y = np.zeros(idx.max() + 1, np.int32)
    lut_x = np.zeros(idx.max() + 1, np.int32)
    lut_y[idx[~out]] = ys
    lut_x[idx[~out]] = xs
    ny, nx = lut_y[idx], lut_x[idx]
    img = rgb.copy()
    img[out] = rgb[ny[out], nx[out]]
    gm[out] = gm[ny[out], nx[out]]
    x0, x1, y0, y1 = 50, 590, 85, 412
    sub = gm[y0:y1, x0:x1].copy()
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    if (sub == cv2.GC_FGD).any() or (sub == cv2.GC_PR_FGD).any():
        cv2.grabCut(np.ascontiguousarray(img[y0:y1, x0:x1, ::-1]), sub, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    gm[y0:y1, x0:x1] = sub
    fig = ((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD)) & Wb
    # tidy: drop figure crumbs, fill pin holes
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_OPEN, ell(1))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fig, 8)
    for i in range(1, n):
        if st[i, 4] < cfg.get("min_fig", 120):
            fig[lab == i] = 0
    inv = (1 - fig).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 8)
    for i in range(1, n):
        if st[i, 4] < cfg.get("min_hole", 30):
            fig[lab == i] = 1
    return fig.astype(bool)


def draw(cid, cfg, win, rng):
    s, n = cid.split("-")
    rgb = np.asarray(Image.open(os.path.join(ROOT, "assets", "cards", s, f"{n}.webp")).convert("RGB").resize((W, H), Image.LANCZOS))
    fl, strength, lab = sparkle(rgb)
    win = card_window(rgb, win)
    fig = segment(rgb, win, fl, cfg)
    see = poly_mask(cfg.get("see")) & fig
    figf = cv2.GaussianBlur(fig.astype(np.float32), (0, 0), 0.8)
    seef = cv2.GaussianBlur(see.astype(np.float32), (0, 0), 1.5)
    foil = win * np.clip(1 - figf + seef * cfg.get("see_w", SEE_W), 0, 1)
    sm = small_foil(rgb)
    foil = np.maximum(foil, cv2.GaussianBlur(sm.astype(np.float32), (0, 0), 0.7) * SMALL_W)
    # flecks inside the foil, split in two halves at random by fleck
    inside = (foil > 0.25) | sm
    ids = np.unique(lab[(lab > 0) & inside])
    half = rng.random(int(lab.max()) + 1) < 0.5
    a = np.isin(lab, ids[half[ids]])
    b = np.isin(lab, ids[~half[ids]])
    out = {"foil": foil}
    for k, m in (("dots-a", a), ("dots-b", b)):
        core = strength * cv2.dilate(m.astype(np.uint8), ell(1)).astype(bool)
        halo = cv2.GaussianBlur(core, (0, 0), 2.0) * 0.55
        out[k] = np.clip(np.maximum(core, halo), 0, 1) * np.clip(foil / 0.5, 0, 1)
    return rgb, fig, see, fl & inside, sm, out


def preview(path, rgb, fig, see, fl, sm, foil):
    v = rgb.astype(np.float32).copy()
    v[fig & ~see] = v[fig & ~see] * 0.45 + np.array([200, 30, 60]) * 0.4
    v[see] = v[see] * 0.5 + np.array([255, 170, 0]) * 0.35
    v[fl] = [255, 255, 0]
    v[sm] = v[sm] * 0.3 + np.array([0, 255, 255]) * 0.7
    top = Image.fromarray(v.clip(0, 255).astype(np.uint8)).crop((50, 85, 590, 412)).resize((1080, 654), Image.LANCZOS)
    m = Image.fromarray((foil * 255).astype(np.uint8)).convert("RGB")
    sheet = Image.new("RGB", (1080 + 300, 654), (20, 20, 20))
    sheet.paste(top, (0, 0))
    sheet.paste(m.resize((300, 419)), (1080, 0))
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cards", default=",".join(CARDS))
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--preview")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    win = np.asarray(Image.open(WIN))[..., 3].astype(np.float32) / 255
    os.makedirs(OUT, exist_ok=True)
    for cid in [c.strip() for c in args.cards.split(",") if c.strip()]:
        cfg = CARDS[cid]
        rng = np.random.default_rng(SEED + int(cid.split("-")[1]) + (1000 if cid.startswith("ecard3") else 0))
        rgb, fig, see, fl, sm, out = draw(cid, cfg, win, rng)
        winb = win > 0.5
        print(f"{cid} {cfg['name']:9s} figure {fig[winb].mean():.2f} of the window, foil {out['foil'][winb].mean():.2f},"
              f" flecks a {int((out['dots-a'] > 0.5).sum())} b {int((out['dots-b'] > 0.5).sum())} px")
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            preview(os.path.join(args.preview, f"{cid}.png"), rgb, fig, see, fl, sm, out["foil"])
        if args.dry_run:
            continue
        for k, m in out.items():
            path = os.path.join(OUT, f"{cid}-{k}{args.suffix}.webp")
            if os.path.exists(path) and not args.force:
                raise SystemExit(f"{path} exists: never overwrite a shipped map, pass --suffix")
            rgba = np.zeros((H, W, 4), np.uint8)
            rgba[..., :3] = 255
            rgba[..., 3] = np.round(np.clip(m, 0, 1) * 255).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)


if __name__ == "__main__":
    main()
