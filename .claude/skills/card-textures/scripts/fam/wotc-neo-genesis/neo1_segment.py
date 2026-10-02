"""Prototype 2: per-card sky (foil area) segmentation for the neo1 window holos.

Marker watershed on the window crop of the scan: the cosmos dots and discs seed the sky, bright or saturated ink blobs
and hand hints (neo1_matte_hints.json) seed the Pokemon, and the flood meets on the ink outline. Writes fg_<n>.npy (True = matte
Pokemon) and a 2x preview with a labelled 25 px grid (1x window coordinates).
"""
import numpy as np, cv2, sys, json, os
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
cv2.setNumThreads(1)
S = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(S, *['..'] * 6))
OUT = os.environ.get('NEO1_SEG_OUT', os.path.join(S, '_seg'))
os.makedirs(OUT, exist_ok=True)
BOX = {'pokemon': (61, 94, 539, 430), 'energy': (18, 118, 583, 615)}
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 13) if os.path.exists(
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf') else ImageFont.truetype(
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 13)


def load(n):
    im = np.asarray(Image.open(f'{ROOT}/assets/cards/neo1/{n}.webp').convert('RGB')).astype(np.float32) / 255
    x0, y0, x1, y1 = BOX['energy' if n == 19 else 'pokemon']
    return im[y0:y1, x0:x1]


def comps(m):
    lab, k = ndi.label(m)
    return lab, k, ndi.find_objects(lab), (ndi.sum(m, lab, range(1, k + 1)) if k else np.zeros(0))


DOTBG = 0.55


def dots(c):
    """Small bright specks of the cosmos pattern (pinpoints and small dots), clustered, off the ink outlines."""
    L = c.max(2)
    med = ndi.median_filter(L, size=9)
    m = (L - med) > 0.08
    lab, k, objs, sz = comps(m)
    keep = np.zeros(k + 1, bool)
    for i, (sl, a) in enumerate(zip(objs, sz), 1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if 2 <= a <= 90 and max(h, w) <= 14 and a >= 0.3 * h * w:
            keep[i] = True
    d = keep[lab]
    # a cosmos dot sits on sky ink: its surroundings are not bright Pokemon paint
    bg = ndi.median_filter(L, size=15)
    lab0, k0 = ndi.label(d)
    if k0:
        mb = np.asarray(ndi.mean(bg, lab0, range(1, k0 + 1)))
        okb = np.zeros(k0 + 1, bool); okb[1:] = mb < DOTBG
        d = okb[lab0]
    dark = ndi.minimum_filter(L, size=7)
    edge = ndi.maximum_filter(((med - dark) > 0.30).astype(np.uint8), size=3) > 0
    lab3, k3 = ndi.label(d)
    if k3:
        bad = np.zeros(k3 + 1, bool); bad[1:] = ndi.maximum(edge.astype(np.uint8), lab3, range(1, k3 + 1)) > 0
        d = d & ~bad[lab3]
    cnt = ndi.uniform_filter(d.astype(np.float32), 37) * 37 * 37
    lab2, k2 = ndi.label(d)
    if k2:
        com = ndi.center_of_mass(d, lab2, range(1, k2 + 1))
        dens = np.array([cnt[int(round(y)), int(round(x))] for y, x in com])
        good = np.zeros(k2 + 1, bool); good[1:] = dens >= 10
        d = good[lab2]
    return d


def discs(c):
    """Large round bright discs of the cosmos pattern (up to ~32 px): bright against a wide median, round, solid."""
    L = c.max(2)
    med = ndi.median_filter(L, size=41)
    m = (L - med) > 0.18
    m = ndi.binary_opening(m, iterations=1)
    lab, k, objs, sz = comps(m)
    keep = np.zeros(k + 1, bool)
    for i, (sl, a) in enumerate(zip(objs, sz), 1):
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if 30 <= a <= 900 and max(h, w) <= 34 and 0.6 <= h / w <= 1.65 and a >= 0.62 * (np.pi / 4) * h * w:
            keep[i] = True
    return keep[lab]


def window_rect(c):
    """The art window inside the crop: per side, the mean colour profile of the middle half of that edge, and the
    biggest jump in its first 10 px (frame plateau -> art). Returns (l, t, r, b), the first and last+1 art pixels."""
    H, W = c.shape[:2]
    def edge(profile):
        dif = np.abs(np.diff(profile, axis=0)).sum(1)
        return int(np.argmax(dif[:10])) + 1
    l = edge(c[H // 4: 3 * H // 4, :12].mean(0))
    r = W - edge(c[H // 4: 3 * H // 4, ::-1][:, :12].mean(0))
    t = edge(c[:12, W // 4: 3 * W // 4].mean(1))
    b = H - edge(c[::-1][:12, W // 4: 3 * W // 4].mean(1))
    return l, t, r, b


def hintmask(shape, h, key):
    m = Image.new('L', (shape[1], shape[0]), 0); dr = ImageDraw.Draw(m)
    for p in h.get(key, []):
        dr.polygon([tuple(q) for q in p], fill=255)
    for x, y, r in h.get(key + 'dab', []):
        dr.ellipse((x - r, y - r, x + r, y + r), fill=255)
    for line in h.get(key + 'line', []):
        dr.line([tuple(q) for q in line[1:]], fill=255, width=int(line[0]))
    return np.asarray(m) > 0


def segment(n, h):
    global auto
    c = load(n)
    d = dots(c)
    dk = discs(c) if not h.get('nodiscs') else np.zeros(c.shape[:2], bool)
    fgm = hintmask(c.shape, h, 'fg'); bgm = hintmask(c.shape, h, 'bg')
    markers = np.zeros(c.shape[:2], np.int32)
    markers[d | dk] = 1
    if not h.get('noauto'):
        L = c.max(2); mn = c.min(2); sat = (L - mn) / (L + 1e-4)
        dist = ndi.distance_transform_edt(~(d | dk))
        auto = (dist > h.get('autodist', 10)) & ((L > h.get('autoL', 0.5)) | ((sat > h.get('autosat', 2.0)) & (L > 0.35)))
        auto &= ~ndi.binary_dilation(dk, iterations=3)
        lab4, k4, _, sz = comps(auto)
        if k4:
            keep = np.zeros(k4 + 1, bool); keep[1:] = sz >= h.get('autoarea', 120); auto = keep[lab4]
        auto = ndi.binary_erosion(auto, iterations=h.get('autoerode', 3))
        lab5, k5, _, sz5 = comps(auto)
        if k5:
            keep = np.zeros(k5 + 1, bool); keep[1:] = sz5 >= h.get('autokeep', 60)
            auto = keep[lab5]
        # seeds near a bg hint go (a light ray, a big disc, a blurred background leaf)
        auto &= ~ndi.binary_dilation(bgm, iterations=h.get('bgclear', 8))
        markers[auto & (markers == 0)] = 2
    else:
        auto = np.zeros(c.shape[:2], bool)
    if not h.get('nodark'):
        L = c.max(2)
        far = ndi.distance_transform_edt(~auto) > h.get('darkdist', 14)
        farh = ndi.distance_transform_edt(~fgm) > h.get('darkhintdist', 6)
        dark = (ndi.uniform_filter(L, 5) < h.get('darkL', 0.22)) & far & farh
        markers[dark & (markers == 0)] = 1
    img = (c * 255).astype(np.uint8)[:, :, ::-1].copy()
    sm = cv2.bilateralFilter(img, 7, 40, 5)
    if not h.get('nocolor'):
        # sky colour model: the ink right around the detected dots and discs (plus the bg hints)
        from scipy.spatial import cKDTree
        smf = cv2.medianBlur(img, 5)[:, :, ::-1].astype(np.float32) / 255
        dd = d | dk
        ring = (ndi.binary_dilation(dd, iterations=3) & ~ndi.binary_dilation(dd, iterations=1)) | bgm
        ring &= ndi.distance_transform_edt(~auto) > 6
        ring &= ndi.distance_transform_edt(~fgm) > 4
        pts = smf[ring]
        rng = np.random.default_rng(n)
        if len(pts) > 4000:
            pts = pts[rng.choice(len(pts), 4000, replace=False)]
        if len(pts) > 20:
            tree = cKDTree(pts)
            dist, _ = tree.query(smf.reshape(-1, 3), k=3)
            dist = dist.mean(1).reshape(smf.shape[:2])
            skyc = dist < h.get('colortol', 0.035)
            skyc &= ndi.distance_transform_edt(~auto) > h.get('colorautodist', 8)
            skyc &= ndi.distance_transform_edt(~fgm) > h.get('darkhintdist', 6)
            skyc = ndi.binary_opening(skyc, iterations=1)
            markers[skyc & (markers == 0)] = 1
    markers[bgm] = 1
    if h.get('bgouter'):
        markers[~ndi.binary_dilation(fgm, iterations=int(h['bgouter']))] = 1
    markers[fgm] = 2
    ws = cv2.watershed(sm, markers.copy())
    fg = (ws == 2) | (ws == -1)
    fg = ndi.binary_opening(fg, iterations=1)
    # small sky islands enclosed by the Pokemon (eye glints, highlights) go matte; small matte islands in the sky go foil
    lab, k, _, sz = comps(~fg)
    for i in range(1, k + 1):
        if sz[i - 1] < h.get('minsky', 250):
            fg[lab == i] = True
    lab, k, _, sz = comps(fg)
    for i in range(1, k + 1):
        if not ((fgm | auto) & (lab == i)).any():
            fg[lab == i] = False
    l, t, r, b = window_rect(c)
    inside = np.zeros(fg.shape, bool); inside[t:b, l:r] = True
    fg |= ~inside
    return c, d, dk, fg, fgm, bgm


def preview(n, c, d, dk, fg, fgm, bgm, path, scale=2):
    H, W = fg.shape
    base = Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8)).resize((W * scale, H * scale), Image.BICUBIC)
    a = np.asarray(base).astype(np.float32)
    sky = np.kron(~fg, np.ones((scale, scale), bool))
    a[sky] = a[sky] * 0.62 + np.array([0, 190, 70]) * 0.38
    edge = np.kron(fg ^ ndi.binary_erosion(fg), np.ones((scale, scale), bool))
    a[edge] = [255, 235, 0]
    dd = np.kron(dk, np.ones((scale, scale), bool)) & ~np.kron(ndi.binary_erosion(dk), np.ones((scale, scale), bool))
    a[dd] = [255, 60, 60]
    for hm, col in ((fgm, [255, 255, 255]), (bgm, [0, 255, 255])):
        e = np.kron(hm ^ ndi.binary_erosion(hm), np.ones((scale, scale), bool))
        a[e] = col
    for gx in range(0, W, 25):
        a[:, gx * scale] = a[:, gx * scale] * 0.6 + np.array([255, 0, 255]) * 0.4
    for gy in range(0, H, 25):
        a[gy * scale, :] = a[gy * scale, :] * 0.6 + np.array([255, 0, 255]) * 0.4
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    for gx in range(0, W, 50):
        dr.text((gx * scale + 2, 1), str(gx), font=FONT, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    for gy in range(50, H, 50):
        dr.text((1, gy * scale + 1), str(gy), font=FONT, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    im.save(path)


if __name__ == '__main__':
    hints = json.load(open(f'{S}/neo1_matte_hints.json')) if os.path.exists(f'{S}/neo1_matte_hints.json') else {}
    for n in [int(x) for x in sys.argv[1:]]:
        h = hints.get(str(n), {})
        c, d, dk, fg, fgm, bgm = segment(n, h)
        np.save(f'{OUT}/fg_{n}.npy', fg)
        preview(n, c, d, dk, fg, fgm, bgm, f'{OUT}/p_{n}.png')
        print(n, 'rect', window_rect(c), 'sky', round(float((~fg).mean()), 3), 'dots', int(d.sum()), 'discs', int(ndi.label(dk)[1]))
