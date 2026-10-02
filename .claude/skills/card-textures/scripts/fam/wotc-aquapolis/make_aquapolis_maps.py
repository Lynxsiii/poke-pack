#!/usr/bin/env python3
"""Draw the foil maps of the Aquapolis (ecard2) Rare Holos H1-H32: one RGBA WebP per card.

Family wotc-aquapolis (older-era holo remaster, 2026-10-01). Research, photos and sources:
/mnt/project-files/holo-remaster/wotc-aquapolis/refs/SOURCES.md; the family note is
.claude/skills/card-textures/reference/fam-wotc-aquapolis.md.

What the real card does: an e-Card holo is printed on "cosmos" foil, and the foil shows wherever the print leaves out
its white underlay. On an Aquapolis H holo that is the art window's BACKGROUND (the Pokemon, and whatever else the artist
painted on white, stays matte ink), the dark ladder bars on the left edge, the 13 slots at the bottom and the olive e
logo. The foil carries a field of pinpoint dots, plus / snowflake clusters and pixel discs, each element lit in one
colour; the flat foil between them mirrors the lamp (silver-white flare at the specular angle).

Every map is drawn from the site's own scans (assets/cards/ecard2/), which are scans of the real foil cards:

  window   flood fill of the non-yellow art window (the yellow frame walls it; holes filled), inset 1 px.
  opaque   Aquapolis printed every H holo's painting a second time as a plain Rare (PAIR). Over bare foil the
           background ink scans darker than over paper and carries dots the plain print does not, while the Pokemon on
           its white underlay scans the same. So the plain twin is registered onto the holo (ECC affine on the text
           box, refined on the window's edges, colour matched per channel on the text box) and the seeds are: foil
           where the holo is much darker than its twin or dense in holo-only dots; opaque where neither, over a whole
           neighbourhood. GrabCut on the holo scan settles the rest and snaps the edge to the drawing. Hand hints
           (aquapolis_hints.json, beside this script) force boxes or polygons foil or opaque, and `bg` scales a
           card's window foil where its background keeps part of its white (the dots there are sparse and faint).
  frame    the dark ladder bars (x 10-62), the 13 slots (y 786-834) and the olive e logo, found by colour (not the
           frame's yellow), each soft-edged.
  dots     the foil's own dots: a line-robust point detector (the smallest of four 9 px line top-hats, so ink lines
           and edges do not answer) on the holo, less the same on the twin (dilated 1 px), inside the foil area.

Output: assets/foil/fam/wotc-aquapolis/H<n>-v1.webp, 600 x 838 (the scan's size, so `100% 100%` lines up):
  alpha = the foil area (window background x bg, bars, slots, e logo), feathered;
  RGB   = the dots, grey (0 between them), with a 1 px bloom; css/holo/fam/wotc-aquapolis.css lights them.
Deterministic (GrabCut's k-means is seeded). Never overwrite a shipped map: a redraw takes a new suffix.

    python3 make_aquapolis_maps.py [--cards H9,H25] [--qa <dir>] [--write] [--suffix -v1] [--force]

--qa writes one overlay per card (window foil tinted cyan, opaque left as is, frame foil magenta, the edge green) and a
dots preview, to judge the map against the scan; nothing is written under assets/ without --write.
"""
import argparse
import json
import os

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
CARDS = os.path.join(ROOT, "assets", "cards", "ecard2")
OUT = os.path.join(ROOT, "assets", "foil", "fam", "wotc-aquapolis")
HINTS = os.path.join(HERE, "aquapolis_hints.json")
W, H = 600, 838
SEED = 2003

# Each H holo and the plain Rare that prints the same painting (same artist; data/ecard2.json).
PAIR = {
    "H1": "1", "H2": "2", "H3": "3", "H4": "4", "H5": "5", "H6": "6", "H7": "8", "H8": "10", "H9": "11",
    "H10": "12", "H11": "15", "H12": "16", "H13": "17", "H14": "19", "H15": "21", "H16": "22", "H17": "23",
    "H18": "24", "H19": "25", "H20": "26", "H21": "32", "H22": "34", "H23": "35", "H24": "36", "H25": "37",
    "H26": "38", "H27": "39", "H28": "40", "H29": "41", "H30": "42", "H31": "43", "H32": "44",
}
ALL = [f"H{i}" for i in range(1, 33)]

# Seeds and thresholds (levels are 0-255 unless noted). Tuned on all 32 cards with the --qa overlays.
DOT_T = 18          # point response that counts as a dot
DOT_SIGMA = 6.0     # px, dot density blur
RHO_FOIL = 0.07     # dot density that is surely foil
DL_FOIL = 20.0      # L* (0-100) the holo sits below its twin where it is surely foil
DL_OPAQUE = 7.0     # |dL| under which (and no dot near) the print is surely the same ink
FAR = 14            # px from the nearest holo-only dot for a sure-opaque seed
NEAR = 8            # px from the nearest dot for a probable-opaque seed
QUALITY = 82        # WebP quality of the dots (RGB); the alpha (foil area) is lossless


def load(name):
    return np.asarray(Image.open(os.path.join(CARDS, f"{name}.webp")).convert("RGB"))


def line_se(length, angle):
    k = np.zeros((length, length), np.uint8)
    c = length // 2
    for t in np.linspace(-c, c, 4 * length):
        x = int(round(c + t * np.cos(np.radians(angle))))
        y = int(round(c - t * np.sin(np.radians(angle))))
        k[y, x] = 1
    return k


SES = [line_se(9, a) for a in (0, 45, 90, 135)]


def point_resp(ch):
    """White top-hat that only points answer: the smallest of four line openings."""
    return np.min(np.stack([ch - cv2.morphologyEx(ch, cv2.MORPH_OPEN, k) for k in SES]), axis=0)


def dots(rgb):
    f = rgb.astype(np.float32)
    lum = point_resp(f.mean(axis=2))
    col = np.max(np.stack([point_resp(f[..., i]) for i in range(3)]), axis=0) * 0.85
    return np.maximum(lum, col)


def grad(g):
    g = cv2.GaussianBlur(g, (0, 0), 1.5)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
    return np.sqrt(gx * gx + gy * gy)


def ecc(a, b, mask, warp=None):
    if warp is None:
        warp = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7)
    return cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, crit, mask, 5)


def register(holo, plain):
    """The plain twin warped onto the holo: affine on the text box and name bar, refined on the window's edges."""
    ga = cv2.cvtColor(holo, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gb = cv2.cvtColor(plain, cv2.COLOR_RGB2GRAY).astype(np.float32)
    m1 = np.zeros(ga.shape, np.uint8)
    m1[440:760, 40:580] = 255
    m1[10:85, 80:580] = 255
    cc1, w1 = ecc(cv2.GaussianBlur(ga, (0, 0), 1.5), cv2.GaussianBlur(gb, (0, 0), 1.5), m1)
    m2 = np.zeros(ga.shape, np.uint8)
    m2[100:405, 65:575] = 255
    try:
        cc2, w2 = ecc(grad(ga), grad(gb), m2, w1.copy())
    except cv2.error:
        cc2, w2 = 0.0, w1
    warp = w2 if (cc2 > 0.4 and np.abs(w2[:, 2] - w1[:, 2]).max() < 2.5) else w1
    out = cv2.warpAffine(plain, warp, (W, H), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
                         borderMode=cv2.BORDER_REPLICATE)
    # colour: a line per channel fitted on the text box (the same print on both)
    res = out.astype(np.float32)
    for c in range(3):
        a = holo[450:750, 60:570, c].astype(np.float32).ravel()
        b = out[450:750, 60:570, c].astype(np.float32).ravel()
        p = np.polyfit(b, a, 1)
        res[..., c] = np.clip(res[..., c] * p[0] + p[1], 0, 255)
    return res.astype(np.uint8), (cc1, cc2)


def fill_holes(m):
    m8 = m.astype(np.uint8) * 255
    ff = m8.copy()
    pad = np.zeros((H + 2, W + 2), np.uint8)
    cv2.floodFill(ff, pad, (0, 0), 255)
    return (m8 | cv2.bitwise_not(ff)) > 0


def hsv(rgb):
    h = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    return h[..., 0] * 2, h[..., 1] / 255, h[..., 2] / 255


def window(holo):
    """The art window: the non-yellow region the frame walls in, holes filled."""
    hh, ss, vv = hsv(holo)
    yellow = (hh > 35) & (hh < 65) & (ss > 0.45) & (vv > 0.6)
    yel = cv2.morphologyEx(yellow.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    free = (1 - yel).astype(np.uint8)
    box = np.zeros_like(free)
    box[85:415, 50:590] = 1
    num, lab = cv2.connectedComponents(free * box, connectivity=4)
    cen = lab[150:380, 150:540]
    ids, cnt = np.unique(cen[cen > 0], return_counts=True)
    keep = ids[cnt > cnt.sum() * 0.05] if len(ids) else []
    return fill_holes(np.isin(lab, keep))


def not_yellow(holo):
    hh, ss, vv = hsv(holo)
    return ~((hh > 36) & (hh < 68) & (ss > 0.5) & (vv > 0.74))


# The frame foil: where the ladder bars, the slots and the e logo sit. Printed with the frame, so every card has them
# in the same place up to the scan's offset (a few px). Each group's shape is the consensus of all 32 scans (the
# not-yellow pixels, aligned group by group and averaged, kept where more than half agree); each card then takes the
# consensus shifted to its own scan (the best of +-6 px). Colour alone misses bars and slots wherever a bright dot sits
# inside them or the illustrator banner touches a slot.
FRAME_GROUPS = {  # y0, y1, x0, x1
    "bars_top": (2, 202, 8, 63),
    "bars_bottom": (482, 750, 8, 63),
    "slots": (788, 836, 262, 532),
    "logo": (760, 836, 0, 100),
}
SHIFT = 6


def darkness(holo):
    return cv2.GaussianBlur(not_yellow(holo).astype(np.float32), (0, 0), 0.7)


def best_shift(dark, tpl, box):
    """The (dx, dy) that lays the template's box best onto this scan's darkness."""
    y0, y1, x0, x1 = box
    pad = np.pad(dark, SHIFT)
    t = tpl[y0:y1, x0:x1] - tpl[y0:y1, x0:x1].mean()
    best = (-1e18, 0, 0)
    for dy in range(-SHIFT, SHIFT + 1):
        for dx in range(-SHIFT, SHIFT + 1):
            patch = pad[y0 + dy + SHIFT:y1 + dy + SHIFT, x0 + dx + SHIFT:x1 + dx + SHIFT]
            score = float((patch * t).sum())
            if score > best[0]:
                best = (score, dx, dy)
    return best[1], best[2]


def shifted(img, dx, dy):
    m = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(img, m, (W, H), flags=cv2.INTER_NEAREST, borderValue=0)


_FRAME = {}


def frame_template():
    """Consensus shape of each frame-foil group over all 32 holos (computed once per run)."""
    if "tpl" in _FRAME:
        return _FRAME["tpl"]
    darks = {n: darkness(load(n)) for n in ALL}
    tpl = np.mean(list(darks.values()), axis=0)
    for _ in range(3):
        acc = np.zeros((H, W), np.float32)
        for d in darks.values():
            for box in FRAME_GROUPS.values():
                dx, dy = best_shift(d, tpl, box)
                y0, y1, x0, x1 = box
                acc[y0:y1, x0:x1] += shifted(d, -dx, -dy)[y0:y1, x0:x1]
        tpl = acc / len(darks)
    groups = {}
    for g, (y0, y1, x0, x1) in FRAME_GROUPS.items():
        m = np.zeros((H, W), bool)
        m[y0:y1, x0:x1] = tpl[y0:y1, x0:x1] > 0.5
        num, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
        keep = np.zeros((H, W), bool)
        for i in range(1, num):
            if st[i, cv2.CC_STAT_AREA] >= 12:
                keep |= lab == i
        if g == "logo":
            keep = fill_holes(keep)
        groups[g] = keep
    _FRAME["tpl"] = (tpl, groups)
    return _FRAME["tpl"]


def frame_foil(holo, win):
    """Soft masks (0-1) of the ladder bars, the 13 slots and the e logo, each group placed on this scan."""
    tpl, groups = frame_template()
    dark = darkness(holo)
    near_win = cv2.dilate(win.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    out = {}
    for g, box in FRAME_GROUPS.items():
        dx, dy = best_shift(dark, tpl, box)
        m = shifted(groups[g].astype(np.float32), dx, dy) > 0.5
        if g.startswith("bars"):
            m &= ~near_win
        out[g] = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.6)
    return np.maximum(out["bars_top"], out["bars_bottom"]), out["slots"], out["logo"]


def poly_mask(polys):
    m = np.zeros((H, W), np.uint8)
    for p in polys:
        pts = np.array(p, np.int32)
        if len(pts) == 2:  # a box [[x0, y0], [x1, y1]]
            cv2.rectangle(m, tuple(pts[0]), tuple(pts[1]), 1, -1)
        else:
            cv2.fillPoly(m, [pts], 1)
    return m > 0


def opaque(holo, twin, win, hint):
    """The window's matte ink (the Pokemon and whatever else keeps its white underlay), as a bool mask."""
    la = cv2.cvtColor(cv2.medianBlur(holo, 5), cv2.COLOR_RGB2LAB).astype(np.float32)
    lb = cv2.cvtColor(cv2.medianBlur(twin, 5), cv2.COLOR_RGB2LAB).astype(np.float32)
    dl = cv2.GaussianBlur((lb[..., 0] - la[..., 0]) * 100 / 255, (0, 0), 2)
    d_holo = dots(holo)
    d_twin = cv2.dilate(dots(twin), np.ones((3, 3), np.uint8))
    own = np.clip(d_holo - d_twin, 0, None)
    dot = (own > DOT_T) & win
    rho = cv2.GaussianBlur(dot.astype(np.float32), (0, 0), DOT_SIGMA)
    dist = cv2.distanceTransform((~dot).astype(np.uint8), cv2.DIST_L2, 5)
    dlt = hint.get("dl_foil", DL_FOIL)
    sure_foil = win & ((dl > dlt) | (rho > hint.get("rho_foil", RHO_FOIL)))
    sure_op = win & (dist > hint.get("far", FAR)) & (np.abs(dl) < hint.get("dl_opaque", DL_OPAQUE))
    sure_op = cv2.erode(sure_op.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
    sure_foil &= ~sure_op
    prob_op = win & (dist > NEAR) & (dl < dlt * 0.6)
    gc = np.full((H, W), cv2.GC_BGD, np.uint8)
    gc[win] = cv2.GC_PR_BGD
    gc[prob_op] = cv2.GC_PR_FGD
    gc[sure_op] = cv2.GC_FGD
    gc[sure_foil & cv2.erode(win.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)] = cv2.GC_BGD
    force_f = poly_mask(hint.get("foil", [])) & win
    force_o = poly_mask(hint.get("opaque", [])) & win
    if hint.get("opaque_color"):  # a colour rule over H (deg), S, V (0-1) for the Pokemon's own inks, opened to drop specks
        hh, ss, vv = hsv(holo)
        rule = eval(hint["opaque_color"], {}, dict(H=hh, S=ss, V=vv, np=np)).astype(np.uint8)
        rule = cv2.morphologyEx(rule, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        k = int(hint.get("opaque_close", 7))
        rule = cv2.morphologyEx(rule, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        force_o |= (rule > 0) & win
    gc[force_f] = cv2.GC_BGD
    gc[force_o] = cv2.GC_FGD
    if (gc == cv2.GC_FGD).sum() > 50 and ((gc == cv2.GC_BGD) | (gc == cv2.GC_PR_BGD)).sum() > 50:
        cv2.setRNGSeed(SEED)
        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)
        cv2.grabCut(cv2.cvtColor(holo, cv2.COLOR_RGB2BGR), gc, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    op = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)) & win
    # tidy: no specks of either kind
    num, lab, st, _ = cv2.connectedComponentsWithStats(op.astype(np.uint8), connectivity=8)
    keep = np.zeros_like(op)
    for i in range(1, num):
        if st[i, cv2.CC_STAT_AREA] >= hint.get("min_opaque", 220):
            keep |= lab == i
    op = keep
    holes = win & ~op
    num, lab, st, _ = cv2.connectedComponentsWithStats(holes.astype(np.uint8), connectivity=8)
    for i in range(1, num):
        if st[i, cv2.CC_STAT_AREA] < hint.get("min_foil", 90):
            op |= lab == i
    op |= force_o
    op &= ~force_f
    # smooth the edge (no pixel staircase), keep it on the drawing
    op = cv2.GaussianBlur(op.astype(np.float32), (0, 0), 1.0) > 0.5
    return op & win, dict(dl=dl, rho=rho, own=own)


# The colours a lit dot takes in the photos (Houndoom H11 off the specular, Tentacruel H26, Exeggutor H10): one per
# element, neighbours differing, white and cyan leading. Each dot of the map gets one of these at random (seeded per
# card); the CSS multiplies them by a ramp that slides with the tilt, so a dot lights when the ramp passes its colour.
PALETTE = [  # (r, g, b), weight
    ((1.00, 1.00, 1.00), 0.22), ((0.40, 1.00, 1.00), 0.16), ((1.00, 0.52, 0.86), 0.14), ((1.00, 0.95, 0.42), 0.12),
    ((0.55, 1.00, 0.58), 0.10), ((0.55, 0.68, 1.00), 0.10), ((0.80, 0.55, 1.00), 0.08), ((1.00, 0.70, 0.40), 0.08),
]


def tinted(tex, card_seed):
    """RGB dots: each connected dot (or cluster) one palette colour; the bloom takes its dot's colour."""
    core = tex > 0.05
    num, lab = cv2.connectedComponents(core.astype(np.uint8), connectivity=8)
    rng = np.random.default_rng(card_seed)
    cols = np.array([c for c, _ in PALETTE], np.float32)
    wts = np.array([w for _, w in PALETTE], np.float64)
    pick = rng.choice(len(PALETTE), size=num, p=wts / wts.sum())
    tint = cols[pick]
    tint[0] = 0
    t = tint[lab] * core[..., None]
    # spread each dot's colour into its bloom: normalised blur of the tint
    tb = cv2.GaussianBlur(t, (0, 0), 1.2)
    mb = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 1.2)[..., None]
    t = np.where(core[..., None], t, tb / np.maximum(mb, 1e-4))
    return np.clip(tex[..., None] * t, 0, 1)


def build(name, hints):
    hint = hints.get(name, {})
    holo = load(name)
    twin, fit = register(holo, load(PAIR[name]))
    win_raw = window(holo)
    win = cv2.erode(win_raw.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    op, cue = opaque(holo, twin, win, hint)
    winfoil = cv2.GaussianBlur((win & ~op).astype(np.float32), (0, 0), 0.7) * win
    winfoil *= float(hint.get("bg", 1.0))
    # partial foil: ink that lets some foil through (faint dots, a little darker than the twin): a set alpha
    for part in hint.get("partial", []):
        region = poly_mask([part["poly"]]) & win & op
        soft = cv2.GaussianBlur(region.astype(np.float32), (0, 0), 0.7)
        winfoil = np.maximum(winfoil, soft * float(part["alpha"]))
    bars, slots, logo = frame_foil(holo, win_raw)
    frame = np.maximum(bars, np.maximum(slots, logo))
    alpha = np.clip(np.maximum(winfoil, frame), 0, 1)
    # the dots: holo-only point response inside the foil area, with a 1 px bloom, one colour per dot
    own = cue["own"]
    area = alpha > 0.02
    sel = area & (own > DOT_T)
    ref = np.percentile(own[sel], 97) if sel.sum() > 50 else 80.0
    tex = np.clip((own - DOT_T * 0.5) / max(ref - DOT_T * 0.5, 1.0), 0, 1) ** 0.85
    tex = np.maximum(tex, cv2.GaussianBlur(tex, (0, 0), 1.0) * 0.55)
    tex *= area
    rgb = tinted(tex, SEED * 100 + int(name[1:]))
    return dict(holo=holo, twin=twin, fit=fit, win=win, op=op, alpha=alpha, tex=tex, rgb=rgb, frame=frame, cue=cue)


def save_map(r, path):
    a = (np.clip(r["alpha"], 0, 1) * 255 + 0.5).astype(np.uint8)
    c = (np.clip(r["rgb"], 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(np.dstack([c, a]), "RGBA").save(path, "WEBP", quality=QUALITY, alpha_quality=100, method=6)


def qa_image(name, r):
    holo = r["holo"].astype(np.float32)
    v = holo.copy()
    wf = (r["alpha"] > 0.5) & r["win"]
    v[wf] = v[wf] * 0.55 + np.array([0, 230, 255]) * 0.45
    fr = r["frame"] > 0.5
    v[fr] = v[fr] * 0.4 + np.array([255, 0, 255]) * 0.6
    edge = cv2.Canny((wf * 255).astype(np.uint8), 50, 150) > 0
    v[edge] = [40, 255, 40]
    tex = r["rgb"] * 255
    top = np.concatenate([holo[80:425], v[80:425], tex[80:425]], axis=1)
    # the frame foil: ladder bars (top and bottom groups) and the strip, side by side
    left = np.concatenate([v[0:200, 0:80], v[480:680, 0:80], v[600:800, 0:80]], axis=1)
    strip = v[760:838, 0:600]
    row = np.zeros((200, 1800, 3), np.float32)
    row[:, :240] = left
    row[:78, 260:860] = strip
    row[100:178, 260:860] = holo[760:838, 0:600]
    return np.concatenate([top, row], axis=0).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cards", default=",".join(ALL))
    ap.add_argument("--qa", default="")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--suffix", default="-v1")
    ap.add_argument("--force", action="store_true", help="rewrite this family's own unshipped maps")
    args = ap.parse_args()
    hints = {}
    if os.path.exists(HINTS):
        with open(HINTS) as f:
            hints = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    names = [c.strip() for c in args.cards.split(",") if c.strip()]
    if args.qa:
        os.makedirs(args.qa, exist_ok=True)
    if args.write:
        os.makedirs(OUT, exist_ok=True)
    for name in names:
        r = build(name, hints)
        foil_win = float(((r["alpha"] > 0.5) & r["win"]).sum()) / max(1, r["win"].sum())
        print(f"{name}: twin {PAIR[name]} ecc {r['fit'][0]:.2f}/{r['fit'][1]:.2f}  window foil {foil_win:.0%}")
        if args.qa:
            Image.fromarray(qa_image(name, r)).save(os.path.join(args.qa, f"{name}.png"))
        if args.write:
            path = os.path.join(OUT, f"{name}{args.suffix}.webp")
            if os.path.exists(path) and not args.force:
                raise SystemExit(f"{path} exists: pass --force to redraw this family's unshipped map, or a new --suffix")
            save_map(r, path)


if __name__ == "__main__":
    main()
