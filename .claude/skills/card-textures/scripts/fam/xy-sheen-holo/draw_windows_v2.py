#!/usr/bin/env python3
"""xy-sheen-holo: second pass at the drawn Cosmos windows (2026-10-02 19:00).

draw_windows.py cut the Pokemon out of the era's plain window with one GrabCut recipe. On eight of the 36 mapless
Cosmos promos that left square-edged foil over the Pokemon (QA overlay `cos_win_qa.jpg`, magenta = foil):

  * five FULL-BLEED cards (Fearow xy7-xyp057, Malamar xy7-xyp058, Salamence xy7-xyp059, Regirock xy6-xyp049, Sableye
    xy8-xyp092, Celebi xy8-xyp093 are six): the art runs under the whole upper card with the Ability / Ancient Trait bar and
    the attack text printed over it, so the era's art-window rectangle (x 7..93%, y 12..50%) is the wrong shape: it
    cut straight edges through the art and left the Pokemon inside it;
  * Rayquaza xy6-xyp064: the cloud on the right was cut out as "Pokemon" and the tail was not;
  * Pikachu xy9-xyp095: Chespin and Sylveon kept the foil.

What each draws (all seeded, re-runnable: `python3 draw_windows_v2.py [--sheet out.jpg] [ids...]`; writes
assets/foil/fam/xy-sheen-holo/win/<id>.webp, 600 x 838, white with the foil area as alpha; the 36 Cosmos windows are
new files, none is on origin/master, so they are rewritten in place):

  full-bleed: the foil area is the art zone UNDER the printed Ability / Trait bar (card px x 28..572, y 142..466; the
    bar's lower edge is a printed straight edge, the frame is the card's own), fading to nothing over the last 36 px
    above the attack text, minus the Pokemon. The Pokemon is cut out per card from its own colours:
      Fearow    warm pixels (R - B > 12): a brown bird on blue sky;
      Celebi    light yellow-green pixels (G > 135, G - B > 30);
      Sableye   violet pixels (B - G > 28, R < B) over the green / red gems;
      Malamar   saturated blue (B - R > 42) + a hand polygon for the grey belly, closed with a 25 px ellipse;
      Salamence GrabCut seeded from colour (red, teal-blue, orange = Pokemon; white / cyan streaks, green hills = background);
      Regirock  a hand polygon (white and cream on cream: no colour separates it) refined by a 14 px GrabCut band.
  window cards: the era window (assets/foil/xy-win/pokemon.webp) minus the Pokemon:
      Rayquaza  green pixels (G - B > 10, G - R > 25), the mouth and outlines closed;
      Pikachu   GrabCut per character (Chespin, Pikachu, Sylveon) from hand polygons, plus the basket.
The Pokemon matte is closed, filled, grown 3 px and feathered 1.6 px so foil never touches the ink.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

ROOT = "/home/user/poke-pack"
OUT = f"{ROOT}/assets/foil/fam/xy-sheen-holo/win"
W, H = 600, 838


def load_cards():
    out = {}
    for f in os.listdir(f"{ROOT}/data"):
        if f.endswith(".json"):
            d = json.load(open(f"{ROOT}/data/{f}"))
            for c in (d if isinstance(d, list) else d.get("cards", [])):
                out[c["id"]] = c
    return out


def get_rgb(card):
    im = Image.open(f"{ROOT}/{card['image']}").convert("RGBA").resize((W, H), Image.LANCZOS)
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    return np.asarray(bg.convert("RGB"))


def poly_mask(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m


def zone_alpha(x0=28, x1=572, y0=142, y1=466, fade=36, edge=2.0):
    z = np.zeros((H, W), np.float32)
    z[y0:y1, x0:x1] = 1.0
    z = cv2.GaussianBlur(z, (0, 0), edge)
    ramp = np.ones(H, np.float32)
    ramp[y1 - fade:y1] = np.linspace(1, 0, fade)
    ramp[y1:] = 0
    return z * ramp[:, None]


def window_alpha(card):
    subs = card.get("subtypes") or []
    circle = "Stage 1" in subs or "Stage 2" in subs or bool(card.get("evolvesFrom"))
    base = Image.open(f"{ROOT}/assets/foil/xy-win/{'pokemon-evo' if circle else 'pokemon'}.webp").convert("RGBA").resize((W, H), Image.LANCZOS)
    return np.asarray(base)[..., 3].astype(np.float32) / 255.0


def clean(fg, open_px=3, close_px=9, min_area=0.004):
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((open_px, open_px), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_px, close_px)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > min_area * H * W:
            keep[lab == i] = 1
    cnts, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(keep)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    return filled


def soften(filled, grow=3, blur=1.6):
    f = cv2.dilate(filled.astype(np.float32), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    f = cv2.GaussianBlur(f, (0, 0), blur)
    return np.clip((f - 0.3) * 2.0, 0, 1)


def run_grabcut(rgb, init, iters=6, scale=0.75, seed=7):
    """init: H x W uint8 of cv2.GC_* labels. Returns the foreground at full size."""
    small = cv2.resize(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    m = cv2.resize(init, (sw, sh), interpolation=cv2.INTER_NEAREST)
    cv2.setRNGSeed(seed)
    bgm = np.zeros((1, 65), np.float64); fgm = np.zeros((1, 65), np.float64)
    cv2.grabCut(small, m, None, bgm, fgm, iters, cv2.GC_INIT_WITH_MASK)
    fg = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
    return cv2.resize(fg, (W, H), interpolation=cv2.INTER_NEAREST)


def ch(rgb):
    return [rgb[..., i].astype(int) for i in range(3)]


# ---- full-bleed cut-outs -------------------------------------------------------------------------------------------
def cut_fearow(rgb, zone):
    r, g, b = ch(rgb)
    key = ((r - b) > 12).astype(np.uint8); key[:142] = 0
    key = cv2.morphologyEx(key, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return clean(key, 3, 15)


def cut_celebi(rgb, zone):
    r, g, b = ch(rgb)
    key = ((g > 135) & (g - b > 30) & (r > 90)).astype(np.uint8); key[:142] = 0
    key = cv2.morphologyEx(key, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return clean(key, 3, 15, 0.01)


def cut_sableye(rgb, zone):
    r, g, b = ch(rgb)
    key = ((b - g > 28) & (r > 25) & (b > 70) & (r < b)).astype(np.uint8); key[:142] = 0
    key = cv2.morphologyEx(key, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return clean(key, 3, 15, 0.006)


MAL_BELLY = [(215, 350), (260, 325), (340, 325), (390, 355), (405, 420), (380, 470), (240, 470), (205, 420)]


def cut_malamar(rgb, zone):
    r, g, b = ch(rgb)
    key = (((b - r) > 42) & (b > 70)).astype(np.uint8); key[:142] = 0
    key = cv2.morphologyEx(key, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    key = key | poly_mask(MAL_BELLY)
    key = cv2.morphologyEx(key, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    return clean(key, 3, 9, 0.01)


def cut_salamence(rgb, zone):
    r, g, b = ch(rgb)
    mn = np.minimum(np.minimum(r, g), b)
    lum = (r + g + b) / 3
    zr = (zone > 0.02).astype(np.uint8)
    seed_fg = ((r > 150) & (g < 90) & (b < 90)) | (((b - r) > 80) & (b > 130) & (g < 175)) | ((r > 200) & (g > 70) & (g < 170) & (b < 90))
    seed_fg = cv2.erode(cv2.morphologyEx(seed_fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((3, 3), np.uint8))
    seed_bg = (mn > 165) | ((g > b + 5) & (g > r + 5) & (lum < 200)) | (((b - r) < 75) & ((b - r) > 30) & (g > 200))
    seed_bg = cv2.erode(seed_bg.astype(np.uint8), np.ones((3, 3), np.uint8))
    init = np.full((H, W), cv2.GC_BGD, np.uint8)
    init[zr == 1] = cv2.GC_PR_BGD
    init[(seed_fg == 1) & (zr == 1)] = cv2.GC_FGD
    init[(seed_bg == 1) & (zr == 1) & (init != cv2.GC_FGD)] = cv2.GC_BGD
    return clean(run_grabcut(rgb, init), 5, 11, 0.01)


REG_POLY = [(145, 195), (215, 190), (260, 215), (285, 250), (330, 232), (385, 245), (410, 232), (450, 250), (468, 285), (500, 320),
            (512, 380), (500, 440), (470, 468), (260, 468), (215, 440), (190, 400), (172, 340), (150, 300), (132, 240)]


def cut_regirock(rgb, zone):
    poly = poly_mask(REG_POLY)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29))
    inner = cv2.erode(poly, k); outer = cv2.dilate(poly, k)
    init = np.full((H, W), cv2.GC_BGD, np.uint8)
    init[outer == 1] = cv2.GC_PR_BGD
    init[poly == 1] = cv2.GC_PR_FGD
    init[inner == 1] = cv2.GC_FGD
    fg = run_grabcut(rgb, init)
    return clean(fg | inner, 3, 9, 0.01)


# ---- window cards ----------------------------------------------------------------------------------------------------
def cut_rayquaza(rgb, zone):
    r, g, b = ch(rgb)
    key = ((g - b > 10) & (g - r > 25)).astype(np.uint8)
    key = cv2.morphologyEx(key, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    key = cv2.morphologyEx(key, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    return clean(key, 3, 9, 0.004)


PIK = {
    "chespin": ([(48, 150), (120, 148), (180, 150), (215, 190), (238, 250), (235, 330), (225, 375), (150, 385), (70, 380), (48, 300)],
                [(80, 200), (150, 190), (205, 230), (215, 300), (190, 360), (110, 365), (75, 300)]),
    "pikachu": ([(205, 150), (232, 128), (262, 150), (318, 150), (345, 115), (368, 135), (372, 200), (352, 260), (340, 300), (300, 330), (250, 320), (222, 290), (205, 230)],
                [(235, 175), (300, 170), (335, 215), (325, 290), (280, 310), (240, 290), (228, 220)]),
    "sylveon": ([(365, 95), (430, 90), (480, 100), (520, 140), (555, 200), (555, 300), (545, 395), (470, 395), (430, 370), (400, 320), (372, 260), (385, 200), (368, 150)],
                [(430, 150), (500, 170), (525, 240), (520, 330), (480, 370), (440, 330), (420, 250), (420, 190)]),
}
BASKET = [(275, 300), (330, 285), (440, 300), (445, 340), (425, 385), (330, 395), (285, 365)]


def cut_pikachu(rgb, zone):
    prob_all = np.zeros((H, W), np.uint8)
    init = np.full((H, W), cv2.GC_BGD, np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    for prob, sure in PIK.values():
        prob_all |= poly_mask(prob)
    init[cv2.dilate(prob_all, k) == 1] = cv2.GC_PR_BGD
    init[prob_all == 1] = cv2.GC_PR_FGD
    for prob, sure in PIK.values():
        init[poly_mask(sure) == 1] = cv2.GC_FGD
    fg = run_grabcut(rgb, init)
    return clean(fg | poly_mask(BASKET), 3, 9, 0.01)


SPECS = {
    # id: (layout, cut-out function)
    "xy7-xyp057": ("full", cut_fearow), "xy7-xyp058": ("full", cut_malamar), "xy7-xyp059": ("full", cut_salamence),
    "xy6-xyp049": ("full", cut_regirock), "xy8-xyp092": ("full", cut_sableye), "xy8-xyp093": ("full", cut_celebi),
    "xy6-xyp064": ("window", cut_rayquaza), "xy9-xyp095": ("window", cut_pikachu),
}


def draw(cid, cards):
    card = cards[cid]
    layout, fn = SPECS[cid]
    rgb = get_rgb(card)
    zone = zone_alpha() if layout == "full" else window_alpha(card)
    fg = fn(rgb, zone)
    matte = soften(fg)
    return zone * (1.0 - matte), rgb


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sheet = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    if sheet:
        args = [a for a in args if a != sheet]
    ids = args or list(SPECS)
    cards = load_cards()
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for cid in ids:
        alpha, rgb = draw(cid, cards)
        rgba = np.dstack([np.full((H, W, 3), 255, np.uint8), (alpha * 255).astype(np.uint8)])
        Image.fromarray(rgba, "RGBA").save(f"{OUT}/{cid}.webp", quality=92, method=6)
        print(f"{cid:12} {cards[cid]['name']:10} foil {alpha.mean() * 100:4.1f}% of the card")
        tint = np.array([255, 0, 200], np.float32)
        vis = rgb.astype(np.float32) * (1 - 0.6 * alpha[..., None]) + tint * 0.6 * alpha[..., None]
        tiles.append(Image.fromarray(vis.clip(0, 255).astype(np.uint8)).crop((0, 90, W, 520)).resize((450, 322)))
    if sheet and tiles:
        cols = 4
        rows = (len(tiles) + cols - 1) // cols
        S = Image.new("RGB", (cols * 450, rows * 322), (20, 20, 20))
        for i, t in enumerate(tiles):
            S.paste(t, ((i % cols) * 450, (i // cols) * 322))
        S.save(sheet, quality=88)


if __name__ == "__main__":
    main()
