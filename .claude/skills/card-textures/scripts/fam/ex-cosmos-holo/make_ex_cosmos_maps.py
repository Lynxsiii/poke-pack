#!/usr/bin/env python3
"""Draw each EX cosmos holo's own foil map from its scan: assets/foil/fam/ex-cosmos-holo/<card id>.webp.

What the real card is (refs and notes: /mnt/project-files/holo-remaster/ex-cosmos-holo/): the art window's background
is printed on a mirror foil scattered with small diffraction shapes (fine specks, pixel rosettes, round orbs); the
Pokemon (and whatever else is printed on white) is matte. The site's scans are scans of the real holos, so the shapes
are already in the scan, frozen, and the Pokemon shows none. Each map is one alpha sprite, 1800 x 838, three panels
at the scan's own 600 x 838:

  [0] foil area  the window's foil: the background, the Pokemon cut out (a 1 px soft edge);
  [1] dots A     the cosmos shapes found in the scan, half of them (seeded per card), each a 1 px grown core plus a
  [2] dots B     2 px glow, so the light lands on the printed pattern; the other half in [2], so the two halves can
                 light at different tilts (css/holo/fam/ex-cosmos-holo.css).

How (per card):
  1. dots: every channel minus its 15 px median (the shapes stand out of the ink around them); connected blobs over
     22 levels that are small (<= 220 px), not long, not hollow and not on an edge of the smoothed picture (that is
     line art, not foil).
  2. foil area: the window cut into ~13 px superpixels (watershed on the dot-free median picture); each one gets a
     Poisson cost from its dot count (foil carries the card's dot rate, matte a fifteenth of it), a cost from a
     salient-object map (U2-Net and U2-NetP, the max of the two: the Pokemon is the salient object; salience only ever
     argues for matte), and twice a colour-model cost learned from the first answer; neighbours of like colour with no
     edge between them want the same label; a min-cut decides. Small islands go, small holes fill.
  3. hints (make_ex_cosmos_hints.json): per card, points (scan pixels) forced foil or matte where step 2 missed.
  4. dots kept: not on a salient blob, and inside or near the foil area, or in a dense patch of dots (a dark
     background the area missed is still foil).
  5. cards whose scan shows no cosmos at all (the plain-printed scans of NP 016-019) take the shapes of a flat scan
     of the holo print (Collexy, refs/collexy/), registered onto the site's scan (ORB + RANSAC homography).

Deterministic: cv2.setRNGSeed(7), numpy generators seeded from the card id. Needs numpy, scipy, opencv, Pillow and, for
the salient-object maps, onnxruntime and the rembg U2-Net models (u2net.onnx, u2netp.onnx from
https://github.com/danielgatis/rembg/releases/tag/v0.0.0), or a cache of their PNGs (--sal-cache, written on the first run).

  python3 make_ex_cosmos_maps.py --list cards.json [--ids ex1-3,ex16-6] [--out DIR] [--sheets DIR] [--sal-cache DIR]
         [--models DIR] [--pylib DIR]

cards.json comes from list_cards.mjs (same folder). --out defaults to assets/foil/fam/ex-cosmos-holo/ (this family's own
folder; nothing else is written in the repo). --sheets writes review contact sheets (scan | area dimmed outside, dots red).
After the family ships, a redrawn map goes to a new name (<id>-v2.webp) and VERSION in js/fam/ex-cosmos-holo.js.
"""
import argparse, hashlib, json, os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_flow, breadth_first_order

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
W, H = 600, 838
P = dict(step=13, beta=0.15, sigc=12.0, sigg=8.0, sigs=0.25, ratio=15.0, uscale=0.5, gs=0.03, iters=2, gamma=0.3, K=5,
         T=22, Gmax=5.0, amax=220, med=15, dfloor=0.4, salvote=0.5)


# ---- inputs -----------------------------------------------------------------------------------------------------
def load_card(c):
    rgb = np.asarray(Image.open(os.path.join(ROOT, c["image"])).convert("RGB")).astype(np.float32)
    win = np.asarray(Image.open(os.path.join(ROOT, c["map"])).convert("RGBA"))[..., 3].astype(np.float32) / 255
    assert rgb.shape[:2] == (H, W) and win.shape == (H, W), (c["id"], rgb.shape, win.shape)
    return rgb, win


def bbox(m, pad=20):
    ys, xs = np.where(m)
    return max(0, ys.min() - pad), min(H, ys.max() + pad + 1), max(0, xs.min() - pad), min(W, xs.max() + pad + 1)


# ---- 1. the cosmos shapes in the scan ---------------------------------------------------------------------------
def detect(rgb, win, p=P):
    med = np.stack([ndi.median_filter(rgb[..., c], size=p["med"]) for c in range(3)], -1)
    res = np.clip(rgb - med, 0, None).max(-1)
    medL = med.mean(-1)
    gx = cv2.Sobel(medL, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(medL, cv2.CV_32F, 0, 1, ksize=3)
    G = ndi.maximum_filter(np.hypot(gx, gy) / 8.0, size=7)
    m = ((res > p["T"]) & (win > 0.5)).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros(n, bool)
    if n > 1:
        gm = ndi.mean(G, lab, index=np.arange(n))
        x, y, w, h, a = st[:, 0], st[:, 1], st[:, 2], st[:, 3], st[:, 4]
        elong = (a > 4) & (np.maximum(w, h) > 2.6 * np.minimum(w, h))
        fill = a / (w * h)
        keep = (a <= p["amax"]) & ~elong & (gm <= p["Gmax"]) & ~((a > 12) & (fill < 0.25))
        keep[0] = False
    kept = np.where(keep)[0]
    remap = np.zeros(n, np.int32); remap[kept] = np.arange(1, len(kept) + 1)
    return remap[lab], cen[kept], med  # shapes labelled 1..K, their centroids (x, y), the dot-free picture


# ---- 2. the foil area: superpixels and a min-cut ----------------------------------------------------------------
def superpixels(med, win, step):
    img = np.clip(med, 0, 255).astype(np.uint8)[..., ::-1].copy()
    mk = np.zeros(win.shape, np.int32)
    k = 1
    for y in range(step // 2, win.shape[0], step):
        for x in range(step // 2, win.shape[1], step):
            if win[y, x] > 0.5:
                mk[y, x] = k; k += 1
    mk[win <= 0.5] = k
    cv2.watershed(img, mk)
    b = mk == -1
    if b.any():
        mk2 = mk.copy(); mk2[b] = 0
        idx = ndi.distance_transform_edt(mk2 == 0, return_distances=False, return_indices=True)
        mk = mk2[idx[0], idx[1]]
    return mk, k  # labels 1..k-1 inside, k outside


def adjacency(lab, n, L0):
    gx = cv2.Sobel(L0, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(L0, cv2.CV_32F, 0, 1, ksize=3)
    Gl = np.hypot(gx, gy) / 8
    keys, lens, grads = [], [], []
    for a, b, g in ((lab[:, :-1], lab[:, 1:], np.maximum(Gl[:, :-1], Gl[:, 1:])),
                    (lab[:-1, :], lab[1:, :], np.maximum(Gl[:-1, :], Gl[1:, :]))):
        m = a != b
        lo = np.minimum(a[m], b[m]).astype(np.int64); hi = np.maximum(a[m], b[m]).astype(np.int64)
        keys.append(lo * (n + 2) + hi); grads.append(g[m])
    key = np.concatenate(keys); g = np.concatenate(grads)
    u, inv = np.unique(key, return_inverse=True)
    L = np.bincount(inv).astype(float); GB = np.bincount(inv, weights=g) / L
    I = (u // (n + 2)).astype(int); J = (u % (n + 2)).astype(int)
    ok = (I > 0) & (J > 0)
    return I[ok], J[ok], L[ok], GB[ok]


def mincut(n, Cf, Cm, I, J, Wt, matte_fixed, foil_fixed):
    SRC, SNK, N = n + 1, n + 2, n + 3
    Cf = Cf.copy(); Cm = Cm.copy()
    for f in foil_fixed: Cm[f] += 1e4
    for f in matte_fixed: Cf[f] += 1e4
    d = Cm - Cf
    idx = np.arange(1, n + 1)
    pos = d[idx] > 0
    rows = np.concatenate([np.full(pos.sum(), SRC), idx[~pos], I, J])
    cols = np.concatenate([idx[pos], np.full((~pos).sum(), SNK), J, I])
    caps = np.concatenate([d[idx][pos], -d[idx][~pos], Wt, Wt])
    caps = np.minimum(np.maximum(np.round(caps * 1000), 0), 2**31 - 1).astype(np.int32)
    M = csr_matrix((caps, (rows, cols)), shape=(N, N)); M.sum_duplicates()
    R = M - maximum_flow(M, SRC, SNK, method="dinic").flow
    R.data = (R.data > 0).astype(np.int32); R.eliminate_zeros()
    lab = np.zeros(N, bool); lab[breadth_first_order(R, SRC, directed=True, return_predecessors=False)] = True
    return lab[: n + 1]


def gmm(X, w, K, rng):
    K = max(1, min(K, len(X)))
    C = X[rng.choice(len(X), K, replace=False, p=w / w.sum())]
    for _ in range(10):
        a = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
        for k in range(K):
            m = a == k
            if m.any(): C[k] = (X[m] * w[m, None]).sum(0) / w[m].sum()
    out = []
    for k in range(K):
        m = a == k
        if m.any():
            var = ((X[m] - C[k]) ** 2 * w[m, None]).sum(0) / w[m].sum() + 25.0
            out.append((w[m].sum() / w.sum(), C[k].copy(), var))
    return out


def nll(X, comps):
    ps = np.zeros(len(X))
    for pi, mu, var in comps:
        ps += pi * np.exp(-0.5 * (((X - mu) ** 2) / var).sum(-1)) / np.sqrt((2 * np.pi) ** 3 * np.prod(var))
    return -np.log(ps + 1e-12)


def foil_area(med, win, cen, sal, seeds, rng, p=P):
    w = win > 0.5
    lab, out = superpixels(med, win, p["step"])
    n = out  # node n is the outside
    area = np.bincount(lab.ravel(), minlength=n + 1).astype(float)
    cnt = np.zeros(n + 1)
    for x, y in cen:
        cnt[lab[int(round(y)), int(round(x))]] += 1
    Lab = cv2.cvtColor((np.clip(med, 0, 255) / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
    mLab = np.nan_to_num(np.stack([ndi.mean(Lab[..., c], lab, index=np.arange(n + 1)) for c in range(3)], -1))
    sbar = np.nan_to_num(ndi.mean(sal, lab, index=np.arange(n + 1)))
    I, J, L, GB = adjacency(lab, n, Lab[..., 0])
    dE = np.linalg.norm(mLab[I] - mLab[J], axis=1); dS = np.abs(sbar[I] - sbar[J])
    Wt = p["beta"] * L * np.exp(-(dE / p["sigc"]) ** 2 / 2) * np.exp(-GB / p["sigg"]) * np.exp(-(dS / p["sigs"]) ** 2 / 2)
    idx = np.arange(1, n)
    low = idx[(sbar[idx] < 0.3) & (area[idx] > 40)]
    pool = low if len(low) > 20 else idx
    dens = cnt[pool] / np.maximum(area[pool], 1)
    order = np.argsort(-dens); a = area[pool][order]; c = cnt[pool][order]
    k = np.searchsorted(np.cumsum(a), 0.5 * a.sum())
    ref = max(c[: k + 1].sum() / a[: k + 1].sum(), 1e-4)
    lf, lm = ref, ref / p["ratio"]
    Cf = p["uscale"] * (lf * area - cnt * np.log(lf * area + 1e-9)) + p["gs"] * area * sbar
    Cm = p["uscale"] * (lm * area - cnt * np.log(lm * area + 1e-9))
    matte_fixed, foil_fixed = [n], []
    hh, ww = lab.shape
    for x, y in seeds.get("matte", []):
        if 0 <= y < hh and 0 <= x < ww: matte_fixed.append(lab[y, x])
    for x, y in seeds.get("foil", []):
        if 0 <= y < hh and 0 <= x < ww: foil_fixed.append(lab[y, x])
    fg = mincut(n, Cf, Cm, I, J, Wt, matte_fixed, foil_fixed)
    for _ in range(p["iters"]):
        F = fg[idx]; X = mLab[idx]
        if F.sum() < 3 or (~F).sum() < 3: break
        nf = nll(X, gmm(X[F], area[idx][F], p["K"], rng)); nm = nll(X, gmm(X[~F], area[idx][~F], p["K"], rng))
        sc = p["gamma"] * area[idx] / 100.0
        Cf2 = Cf.copy(); Cm2 = Cm.copy()
        Cf2[idx] += sc * np.clip(nf - nm, -6, 6) / 2; Cm2[idx] += sc * np.clip(nm - nf, -6, 6) / 2
        fg = mincut(n, Cf2, Cm2, I, J, Wt, matte_fixed, foil_fixed)
    m = fg[lab] & w
    # islands under 250 px go, holes under 150 px fill
    lb, k = ndi.label(m)
    if k:
        sz = ndi.sum(m, lb, range(1, k + 1)); m &= ~np.isin(lb, np.where(sz < 250)[0] + 1)
    hol = w & ~m
    lb, k = ndi.label(hol)
    if k:
        sz = ndi.sum(hol, lb, range(1, k + 1)); m |= np.isin(lb, np.where(sz < 150)[0] + 1)
    return m, ref


# ---- salient-object maps (U2-Net) -------------------------------------------------------------------------------
_sessions = {}
SAL_MODELS = {"u2p": ("u2netp.onnx", (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), 320),
              "u2net": ("u2net.onnx", (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), 320)}
# a third opinion for the cards both U2-Nets miss (hint "isnet": true): ISNet general use, the max of all three
SAL_ISNET = ("isnet-general-use.onnx", (0.485, 0.456, 0.406), (1.0, 1.0, 1.0), 1024)


def saliency(cid, rgb, win, args, isnet=False):
    """max(u2netp, u2net[, isnet]) over the art window's tight crop, 0..1, full-card array, cached as PNGs."""
    maps = []
    models = dict(SAL_MODELS)
    if isnet:
        models["isnet"] = SAL_ISNET
    for name, (fname, mean, std, size) in models.items():
        f = os.path.join(args.sal_cache, f"{cid}.{name}.png") if args.sal_cache else None
        if f and os.path.exists(f):
            full = np.asarray(Image.open(f)).astype(np.float32) / 255
            maps.append(full); continue
        if args.pylib and args.pylib not in sys.path: sys.path.insert(0, args.pylib)
        import onnxruntime as ort
        if name not in _sessions:
            so = ort.SessionOptions(); so.intra_op_num_threads = 2; so.inter_op_num_threads = 1
            _sessions[name] = ort.InferenceSession(os.path.join(args.models, fname), so, providers=["CPUExecutionProvider"])
        s = _sessions[name]
        y0, y1, x0, x1 = bbox(win > 0.5, pad=0)
        img = Image.fromarray(np.clip(rgb[y0:y1, x0:x1], 0, 255).astype(np.uint8))
        a = np.asarray(img.resize((size, size), Image.LANCZOS)).astype(np.float32); a /= a.max()
        x = np.stack([(a[..., c] - mean[c]) / std[c] for c in range(3)], 0)[None].astype(np.float32)
        o = s.run(None, {s.get_inputs()[0].name: x})[0][0, 0]
        o = (o - o.min()) / (o.max() - o.min() + 1e-9)
        o = np.asarray(Image.fromarray((o * 255).astype(np.uint8)).resize(img.size, Image.LANCZOS)).astype(np.float32) / 255
        full = np.zeros((H, W), np.float32); full[y0:y1, x0:x1] = o
        if f: os.makedirs(args.sal_cache, exist_ok=True); Image.fromarray((full * 255).astype(np.uint8)).save(f)
        maps.append(full)
    return np.max(maps, 0)


# ---- 5. cosmos borrowed from a holo flat scan (scans of the plain print) -----------------------------------------
def borrowed_dots(c, rgb, win, ref_path, p=P):
    """Register a flat scan of the holo print onto the site's scan and detect its cosmos shapes there."""
    ref = np.asarray(Image.open(ref_path).convert("RGB")).astype(np.float32)
    g1 = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    g2 = cv2.cvtColor(np.clip(ref, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    orb = cv2.ORB_create(6000)
    k1, d1 = orb.detectAndCompute(g1, None); k2, d2 = orb.detectAndCompute(g2, None)
    mt = sorted(cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d2, d1), key=lambda m: m.distance)[:800]
    src = np.float32([k2[m.queryIdx].pt for m in mt]); dst = np.float32([k1[m.trainIdx].pt for m in mt])
    Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    warped = cv2.warpPerspective(ref, Hm, (W, H), flags=cv2.INTER_LINEAR)
    lab, cen, _ = detect(warped, win, dict(p, T=p["T"] + 8))
    return lab, cen, int(inl.sum())


# ---- compose ----------------------------------------------------------------------------------------------------
def make(c, args, hints):
    cid = c["id"]
    h = hints.get(cid, {})
    rng = np.random.default_rng(int(hashlib.md5(cid.encode()).hexdigest()[:8], 16))
    rgb, win = load_card(c)
    y0, y1, x0, x1 = bbox(win > 0.5)
    sub, sw = rgb[y0:y1, x0:x1], win[y0:y1, x0:x1]
    p = dict(P, **h.get("params", {}))
    lab, cen, med = detect(sub, sw, p)
    note = ""
    if h.get("borrow"):
        blab, bcen, ninl = borrowed_dots(c, rgb, win, os.path.join(args.refs, h["borrow"]), p)
        lab, cen = blab[y0:y1, x0:x1], bcen - np.array([x0, y0])
        note = f"borrowed {len(cen)} shapes ({ninl} inliers)"
    sal = saliency(cid, rgb, win, args, bool(h.get("isnet")))[y0:y1, x0:x1]
    seeds = {k: [(int(x) - x0, int(y) - y0) for x, y in h.get(k, [])] for k in ("foil", "matte")}
    if h.get("area") == "window":
        m, ref = sw > 0.5, 0.0
    else:
        # shapes on the salient subject are the Pokemon's own texture, not foil: they do not vote for foil
        sc0 = np.nan_to_num(ndi.mean(sal, lab, index=np.arange(len(cen) + 1)))[1:] if len(cen) else np.zeros(0)
        m, ref = foil_area(med, sw, cen[sc0 < p["salvote"]] if len(cen) else cen, sal, seeds, rng, p)
    for key, val in (("cut", False), ("add", True)):  # hint boxes [x0, y0, x1, y1] in scan pixels
        for bx in h.get(key, []):
            m[max(0, bx[1] - y0):max(0, bx[3] - y0), max(0, bx[0] - x0):max(0, bx[2] - x0)] = val
    m &= sw > 0.5
    # 3b. a patch of the area with almost no shapes in it is the Pokemon's own colours the cut let through: drop it
    if h.get("area") != "window" and len(cen) and ref > 0:
        lb, k = ndi.label(m)
        if k:
            cx = np.clip(np.round(cen[:, 0]).astype(int), 0, m.shape[1] - 1); cy = np.clip(np.round(cen[:, 1]).astype(int), 0, m.shape[0] - 1)
            nd = np.bincount(lb[cy, cx], minlength=k + 1)[1:]
            sz = np.bincount(lb.ravel(), minlength=k + 1)[1:].astype(float)
            drop = np.where(nd / np.maximum(sz, 1) < h.get("dfloor", P["dfloor"]) * ref)[0] + 1
            m &= ~np.isin(lb, drop)
    # 4. which shapes light: not on the salient subject, near the area or in a dense patch of shapes
    nlab = len(cen) + 1
    ids = np.arange(nlab)
    present = np.ones(nlab, bool); present[0] = False
    if nlab > 1:
        present[1:] = np.bincount(lab.ravel(), minlength=nlab)[1:] > 0
    salc = np.nan_to_num(ndi.mean(sal, lab, index=ids))
    near = ndi.binary_dilation(m, iterations=4)
    nearc = np.nan_to_num(ndi.mean(near.astype(np.float32), lab, index=ids)) > 0.5
    pts = np.zeros(sw.shape, np.float32)
    cxy = np.clip(np.round(cen).astype(int), 0, [sw.shape[1] - 1, sw.shape[0] - 1]) if len(cen) else np.zeros((0, 2), int)
    np.add.at(pts, (cxy[:, 1], cxy[:, 0]), 1)
    dense = cv2.filter2D(pts, -1, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)).astype(np.float32))
    densec = np.concatenate([[0], dense[cxy[:, 1], cxy[:, 0]]]) if len(cen) else np.zeros(1)
    ok = present & (salc < h.get("sal_max", 0.5)) & (nearc | (densec >= 3))
    if h.get("dots") == "window":
        ok = present
    grp = rng.random(nlab) < 0.5
    edge = ndi.binary_erosion(sw > 0.5, iterations=2)

    def dotmap(sel):
        mm = (ok & sel)[lab] & edge
        core = ndi.gaussian_filter(ndi.binary_dilation(mm, structure=ndi.generate_binary_structure(2, 1)).astype(np.float32), 0.6)
        halo = np.minimum(ndi.gaussian_filter(mm.astype(np.float32), 2.0) * 2.2, 0.55)
        return np.clip(np.maximum(core, halo), 0, 1)

    area = ndi.gaussian_filter(ndi.binary_erosion(m, iterations=1).astype(np.float32), 0.8) * np.clip(sw, 0, 1)
    full = lambda x: np.pad(x, ((y0, H - y1), (x0, W - x1)))
    if h.get("mirror") is False:  # shapes only: the area leaks onto the Pokemon here, so no mirror ground
        area = area * 0
    pan = [full(area), full(dotmap(grp)), full(dotmap(~grp))]
    al = np.clip(np.concatenate(pan, 1), 0, 1)
    al = (np.round(al * 31) / 31 * 255).round().astype(np.uint8)  # 32 levels: half the bytes, invisible
    rgba = np.dstack([np.full_like(al, 255)] * 3 + [al])
    os.makedirs(args.out, exist_ok=True)
    v = h.get("version")
    path = os.path.join(args.out, f"{cid}{'-v' + str(v) if v else ''}.webp")
    Image.fromarray(rgba, "RGBA").save(path, lossless=True, quality=100, method=6)
    stats = dict(id=cid, shapes=int(ok.sum()), found=int(present.sum()), area=round(float(m.sum() / max(1, (sw > 0.5).sum())), 3),
                 ref=round(ref * 1000, 2), bytes=os.path.getsize(path), note=note)
    review = None
    if args.sheets:
        vis = sub.copy(); vis[~m] *= 0.3
        e = m ^ ndi.binary_erosion(m); vis[e] = [0, 255, 255]
        vis[(ok[lab]) & (lab > 0)] = [255, 40, 40]
        review = np.concatenate([sub, vis], 1)
    return stats, review


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", required=True, help="cards JSON from list_cards.mjs")
    ap.add_argument("--ids", default="", help="comma-separated card ids (default: all)")
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/fam/ex-cosmos-holo"))
    ap.add_argument("--hints", default=os.path.join(HERE, "make_ex_cosmos_hints.json"))
    ap.add_argument("--refs", default="/mnt/project-files/holo-remaster/ex-cosmos-holo/refs")
    ap.add_argument("--sheets", default="", help="folder for review contact sheets")
    ap.add_argument("--sal-cache", default="", help="folder of cached salient-object PNGs")
    ap.add_argument("--models", default="", help="folder holding u2net.onnx and u2netp.onnx")
    ap.add_argument("--pylib", default="", help="extra sys.path entry for onnxruntime")
    args = ap.parse_args()
    cv2.setRNGSeed(7)
    cards = json.load(open(args.list))
    if args.ids:
        want = args.ids.split(","); cards = [c for c in cards if c["id"] in want]
    hints = json.load(open(args.hints)) if os.path.exists(args.hints) else {}
    hints = {k: v for k, v in hints.items() if not k.startswith("_")}
    rows, allstats = [], []
    cards = [c for c in cards if not hints.get(c["id"], {}).get("skip")]
    for i, c in enumerate(cards):
        stats, review = make(c, args, hints)
        allstats.append(stats)
        print(json.dumps(stats), flush=True)
        if review is not None:
            r = np.clip(review[:340], 0, 255).astype(np.uint8)
            r = np.ascontiguousarray(np.pad(r, ((0, 340 - r.shape[0]), (0, max(0, 1140 - r.shape[1])), (0, 0)))[:, :1140])
            cv2.putText(r, c["id"], (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
            rows.append(r)
            if len(rows) == 8 or i == len(cards) - 1:
                os.makedirs(args.sheets, exist_ok=True)
                pairs = [np.concatenate(rows[j:j + 2] + [np.zeros_like(rows[0])] * (2 - len(rows[j:j + 2])), 1) for j in range(0, len(rows), 2)]
                Image.fromarray(np.clip(np.concatenate(pairs, 0), 0, 255).astype(np.uint8)).save(
                    os.path.join(args.sheets, f"review-{i // 8:02d}.jpg"), quality=85)
                rows = []
    if args.sheets:
        json.dump(allstats, open(os.path.join(args.sheets, "stats.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
