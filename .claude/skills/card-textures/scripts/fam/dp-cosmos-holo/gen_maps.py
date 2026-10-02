"""dp-cosmos-holo, step 2: the per-card foil map (assets/foil/fam/dp-cosmos-holo/<set>/<n>.webp, 600x838 RGBA, lossless).

What it draws: alpha = the foil area (the era's art-window shape minus the Pokemon, which is ink over foil on the real card);
RGB = the cosmos flecks, each element (a disc of dots, a plus sign, a lone dot) ONE saturated hue, as on the real card, where
every fleck is its own dichroic colour. The CSS uses the alpha as the foil's mask and the RGB as the lit fleck layer.
From what: the card scan (the printed dots the scan still shows are lit again where they are, in the colour they stand out
in), seeded synthetic cosmos elements for the rest (disc/plus/diamond grids of 1.25 px dots on a 3.75 px pitch, the
vocabulary of scripts/make_dp_cosmos.py at 600 px card width; fewer of them where the scan already shows many dots), and
the Pokemon cut-out of auto_mask.py. Seeded by the card id: re-running gives identical files.
usage: gen_maps.py --census census.json --masks DIR --out DIR <id> [<id> ...]"""
import argparse, hashlib, json, math, os, random
import numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.environ.get("ROOT", "/home/user/poke-pack")
PALETTE = [0.47, 0.53, 0.36, 0.62, 0.80, 0.90, 0.13, 0.50, 0.44]  # teal, cyan, green, blue, magenta, pink, gold


def seed_of(cid):
    return int(hashlib.sha1(cid.encode()).hexdigest()[:8], 16)


def poke_soft(npz, shape, win):
    """full-card soft Pokemon mask from the SAM crop mask: smooth, drop specks, fill pin holes, close, 1 px margin."""
    z = np.load(npz)
    m = z["mask"].astype(np.float32) / 255
    x0, y0, x1, y1 = [int(v) for v in z["box"]]
    m = cv2.GaussianBlur(m, (0, 0), 1.3)
    full = np.zeros(shape, np.float32)
    full[y0:y1, x0:x1] = m
    b = (full > 0.5) & (win > 0.3)
    lab, n = ndi.label(b)
    if n:
        sizes = ndi.sum(b, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sizes >= max(160, 0.004 * (win > 0.3).sum())
        b = keep[lab]
    holes = ndi.binary_fill_holes(b) & ~b
    lab, n = ndi.label(holes)
    if n:
        sizes = ndi.sum(holes, lab, range(1, n + 1))
        small = np.zeros(n + 1, bool); small[1:] = sizes < 320
        b |= small[lab]
    b = ndi.binary_closing(b, structure=np.ones((3, 3)), iterations=2)
    b = ndi.binary_opening(b, structure=np.ones((3, 3)), iterations=1)
    b = ndi.binary_dilation(b, iterations=1)
    if "foil" in z.files:   # optional: pixels that must stay foil whatever the smoothing did (a moon among flames, sky between them)
        f = np.zeros(shape, bool); f[y0:y1, x0:x1] = z["foil"] > 127
        b &= ~f
    return ndi.gaussian_filter(b.astype(np.float32), 1.0)


_SES = []
for _ang in (0, 45, 90, 135):
    _k = np.zeros((9, 9), np.uint8)
    for _t in range(-4, 5):
        _k[int(round(4 - _t * math.sin(math.radians(_ang)))), int(round(4 + _t * math.cos(math.radians(_ang))))] = 1
    _SES.append(_k)


def spots(rgb):
    """bright dots: per channel the white top-hat along four line directions, minimum over the directions (a dot is bright
    along every direction, a line or an edge is not). (H, W, 3) float"""
    rgb8 = np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8)
    out = []
    for c in range(3):
        th = None
        for k in _SES:
            t = cv2.morphologyEx(np.ascontiguousarray(rgb8[..., c]), cv2.MORPH_TOPHAT, k).astype(np.float32) / 255
            th = t if th is None else np.minimum(th, t)
        out.append(th)
    return np.stack(out, -1)


def hsv2rgb(h, s, v):
    h = (h % 1.0) * 6
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,), np.float32)
    for k, (a, b, c) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel, 0], out[sel, 1], out[sel, 2] = a[sel], b[sel], c[sel]
    return out


def synth(shape, area, rnd, density=1.0):
    """seeded cosmos elements: float intensity and an element id per pixel"""
    H, W = shape
    SS = 3
    img = Image.new("L", (W * SS, H * SS), 0)
    ids = Image.new("I", (W * SS, H * SS), 0)
    d, di = ImageDraw.Draw(img), ImageDraw.Draw(ids)
    PITCH, DOT = 3.75, 1.25
    eid = [0]

    def dot(x, y, r, e):
        bb = ((x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS)
        d.ellipse(bb, fill=255); di.ellipse(bb, fill=e)

    def grid_shape(cx, cy, inside, extent):
        eid[0] += 1; e = eid[0]
        ang = rnd.uniform(-0.25, 0.25); ca, sa = math.cos(ang), math.sin(ang)
        n = int(extent / PITCH) + 2
        for i in range(-n, n + 1):
            for j in range(-n, n + 1):
                gx, gy = i * PITCH, j * PITCH
                x, y = gx * ca - gy * sa, gx * sa + gy * ca
                if inside(x, y):
                    dot(cx + x + rnd.uniform(-0.35, 0.35), cy + y + rnd.uniform(-0.35, 0.35), DOT * rnd.uniform(0.8, 1.1), e)

    def disc(cx, cy, r):
        wob, ph = rnd.uniform(0.04, 0.12), rnd.uniform(0, 6.28)
        grid_shape(cx, cy, lambda x, y: math.hypot(x, y) <= r * (1 + wob * math.sin(3 * math.atan2(y, x) + ph)), r + 2)

    def plus(cx, cy, arm):
        grid_shape(cx, cy, lambda x, y: (abs(x) < PITCH * 0.6 and abs(y) <= arm * PITCH + 0.1) or (abs(y) < PITCH * 0.6 and abs(x) <= arm * PITCH + 0.1), arm * PITCH + 2)

    def diamond(cx, cy, k):
        grid_shape(cx, cy, lambda x, y: abs(x) + abs(y) <= k * PITCH + 0.1, k * PITCH + 2)

    ys, xs = np.nonzero(area > 0.02)
    if len(xs) == 0:
        return np.zeros(shape, np.float32), np.zeros(shape, np.int64)

    def spot():
        i = rnd.randrange(len(xs)); return xs[i] + rnd.uniform(-0.5, 0.5), ys[i] + rnd.uniform(-0.5, 0.5)

    A = len(xs) / (600 * 838 * 0.45)
    k = lambda n: max(0, int(round(n * A * density)))
    for _ in range(k(3)): disc(*spot(), rnd.uniform(13, 18))
    for _ in range(k(10)): disc(*spot(), rnd.uniform(7, 12))
    for _ in range(k(22)): disc(*spot(), rnd.uniform(4, 7))
    for _ in range(k(60)): plus(*spot(), rnd.choice((1, 1, 2, 2, 3)))
    for _ in range(k(40)): diamond(*spot(), rnd.choice((1, 1, 2)))
    for _ in range(k(700)):
        eid[0] += 1
        x, y = spot(); r = DOT * rnd.uniform(0.7, 1.15)
        dot(x, y, r, eid[0])
        if rnd.random() < 0.2:
            dot(x + rnd.uniform(-3, 3), y + rnd.uniform(-3, 3), r * 0.85, eid[0])
    inten = np.asarray(img.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    idm = np.asarray(ids.resize((W, H), Image.NEAREST)).astype(np.int64)
    idm = ndi.maximum_filter(idm, size=3)
    return inten, idm


def detected(rgb, area, rnd):
    """the scan's own printed dots inside the foil area: intensity, element labels, and a per-pixel hue (the colour the dots
    stand out in, else a palette pick) plus the density of coloured dots per 1000 px"""
    inner = ndi.binary_erosion(area > 0.5, iterations=3)
    sp = spots(rgb) * inner[..., None]
    m = sp.max(-1)
    pk = (m == ndi.maximum_filter(m, size=3)) & (m > 0.12)
    ys, xs = np.nonzero(pk)
    v = sp[ys, xs]
    chroma = (v.max(-1) - v.min(-1)) / np.maximum(v.max(-1), 1e-4)
    colored = float((chroma > 0.6).sum()) / max(1, inner.sum()) * 1000
    inten = np.clip((m - 0.05) / 0.18, 0, 1) ** 0.85
    el = ndi.binary_dilation(m > 0.07, iterations=1)
    idm, n = ndi.label(el)
    idm = idm * (inten > 0)
    res = sp / np.maximum(m[..., None], 1e-4)
    mx, mn = res.max(-1), res.min(-1)
    r_, g_, b_ = res[..., 0], res[..., 1], res[..., 2]
    dl = np.maximum(mx - mn, 1e-4)
    hh = np.where(mx == r_, ((g_ - b_) / dl) % 6, np.where(mx == g_, (b_ - r_) / dl + 2, (r_ - g_) / dl + 4)) / 6
    wts = inten * (mx - mn)
    idx = np.arange(n + 1)
    cx = ndi.sum(np.cos(hh * 2 * np.pi) * wts, idm, idx)
    sx = ndi.sum(np.sin(hh * 2 * np.pi) * wts, idm, idx)
    sat = ndi.sum(wts, idm, idx) / np.maximum(ndi.sum(inten, idm, idx), 1e-4)
    hue = np.array([(math.atan2(sx[i], cx[i]) / (2 * np.pi)) % 1 if sat[i] > 0.25 else rnd.choice(PALETTE) for i in idx], np.float32)
    return inten, hue[idm], colored


def build(row, masks):
    cid = row["id"]
    im = Image.open(f"{ROOT}/{row['img']}").convert("RGBA")
    W, H = im.size
    win = np.asarray(Image.open(f"{ROOT}/{row['map']}").convert("RGBA").resize((W, H), Image.BILINEAR))[..., 3].astype(np.float32) / 255
    rgb = np.asarray(im)[..., :3].astype(np.float32) / 255
    poke = poke_soft(os.path.join(masks, cid + ".npz"), (H, W), win)
    area = np.clip(win * (1 - poke), 0, 1)
    rnd = random.Random(seed_of(cid))
    inten_d, hue_d, colored = detected(rgb, area, rnd)
    density = float(np.clip(1.9 - colored / 1.5, 0.7, 1.9))
    inten_s, idm = synth((H, W), area, rnd, density)
    n = int(idm.max())
    hue_s = np.array([rnd.choice(PALETTE) + rnd.uniform(-0.03, 0.03) for _ in range(n + 1)], np.float32)[idm]
    sat = np.full((H, W), 0.85, np.float32)
    col = np.maximum(hsv2rgb(hue_d, sat, inten_d), hsv2rgb(hue_s, sat, np.clip(inten_s, 0, 1)))
    a8 = np.clip(area * 255 + 0.5, 0, 255).astype(np.uint8)
    rgb8 = np.clip(col * 255 + 0.5, 0, 255).astype(np.uint8)
    rgb8[a8 == 0] = 0
    # edge score: how much stronger the scan's gradient is on the cut-out's rim than in the foil area (a cut that follows the
    # Pokemon's real outline scores high; a blocky or wandering one scores near 1)
    g = cv2.GaussianBlur(cv2.cvtColor(np.asarray(im.convert("RGB")), cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.2)
    gm = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    rim = (ndi.binary_dilation(poke > 0.5, iterations=2) & ~ndi.binary_erosion(poke > 0.5, iterations=2)) & (win > 0.5)
    base = (area > 0.5)
    edge = float(gm[rim].mean() / max(1e-3, gm[base].mean())) if rim.sum() > 50 and base.sum() > 50 else 0.0
    info = dict(id=cid, poke=round(float(poke[win > 0.3].mean()), 3), edge=round(edge, 2), colored=round(colored, 2), synth_density=round(density, 2),
                fleck_cover=round(float((np.maximum(inten_d, inten_s) > 0.3).sum()) / max(1, float((area > 0.5).sum())), 4))
    return np.dstack([rgb8, a8]), info


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--census", required=True); ap.add_argument("--masks", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--info", default="")
    ap.add_argument("ids", nargs="+")
    a = ap.parse_args()
    rows = {r["id"]: r for r in json.load(open(a.census))}
    infos = []
    for cid in a.ids:
        out, info = build(rows[cid], a.masks)
        s, n = cid.split("-", 1)
        os.makedirs(os.path.join(a.out, s), exist_ok=True)
        p = os.path.join(a.out, s, f"{n}.webp")
        Image.fromarray(out, "RGBA").save(p, "WEBP", lossless=True, quality=100, method=6)
        info["kb"] = os.path.getsize(p) // 1024
        infos.append(info)
        print(info, flush=True)
    if a.info:
        json.dump(infos, open(a.info, "w"), indent=0)
