#!/usr/bin/env python3
"""Draw each EX reverse holo's foil-area map (ex5-ex16) from its scan: assets/foil/fam/ex-reverse/<card id>-v1.webp.

What the real card is (notes: /mnt/project-files/holo-remaster/ex-reverse/NOTES.md): on the reverse holos of ex5-ex16 the
card body is matte and the art window's BACKGROUND is printed on foil; the Pokemon (the main subject, and whatever else is
printed on white in the window) is matte. Each map is one alpha webp at the scan's size, 600 x 838:

  alpha 255  the art window's background (where the foil is);
  alpha 0    the Pokemon and every other matte thing in the window, and everything outside the art window;
  a 1 px soft edge, quantised to 32 levels (lossless, half the bytes, invisible).

How (per card):
  - a Rare Holo whose cosmos-holo print has its own map already (assets/foil/fam/ex-cosmos-holo/<id>(-vN).webp) takes
    that sprite's panel [0] (the left 600 px): the reverse print has the same art, and that panel is this very mask. A map
    drawn with `mirror: false` there (its panel is empty) is drawn here instead.
  - every other card ports make_ex_cosmos_maps.py's foil-area step without its dot-count term (the scans of reverses show
    no cosmos dots): the art window (the layout's window map, js/ex-foil.js exWindow()) is cut into ~13 px superpixels
    (watershed on the 15 px median picture); each gets a cost from a salient-object map (the max of U2-Net and U2-NetP over
    the window's crop: the Pokemon is the salient object) and, twice, a colour-model cost learned from the first answer;
    neighbours of like colour with no edge between them want the same label; a min-cut decides. Small islands go and small
    holes fill.
  - hints (make_ex_reverse_hints.json), per card: points forced foil or matte before the min-cut ("foil", "matte", scan
    pixels), boxes cleared from or added to the result afterwards ("cut", "add": [x0, y0, x1, y1]), "area": "window"
    (the whole window), "isnet": true (a third salience opinion), "params" (overrides of P), "skip": true (no map: the card
    keeps the era's look).
    Cards whose automatic cut failed are redrawn with: "sal": ["isnet" | "anime" | "u2p" | "u2net", ...] (the salience models to
    use), "gc": {...} (a centred-ellipse GrabCut, see gc_silhouette), "hand": {"polys", "strokes", "cut", "refine"} (a traced
    silhouette, GrabCut settles the edge within "refine" px), "from_map": a silhouette map of another family, "recompute": true
    (never take the cosmos panel), "version": N (the file is <id>-vN.webp; a redrawn shipped map needs a new N).

Deterministic: cv2.setRNGSeed(7), numpy generators seeded from the card id. Needs numpy, scipy, opencv, Pillow and
onnxruntime with the rembg U2-Net models (u2net.onnx, u2netp.onnx; isnet-general-use.onnx for the hint) from
https://github.com/danielgatis/rembg/releases/tag/v0.0.0, or a cache of their PNGs (--sal-cache, written on the first run).

  node list_cards.mjs cards.json
  python3 make_ex_reverse_maps.py --list cards.json [--ids ex16-1,ex16-2 | --sets ex16,ex15] [--out DIR] [--sheets DIR]
          [--sal-cache DIR] [--models DIR] [--pylib DIR]

--sheets writes review contact sheets, masks-<set>.jpg (scan | the same with the matte area dimmed and an outline).
"""
import argparse, glob, hashlib, json, os, re, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_flow, breadth_first_order

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, *[".."] * 6))
W, H = 600, 838
P = dict(step=13, beta=0.15, sigc=12.0, sigg=8.0, sigs=0.25, uscale=0.012, gamma=0.3, iters=0, near=40, slo=0.0, gcR=150, gcit=5, gcw=0.7, gcmax=99.0, K=5, med=15, sbias=0.0, msal=0.4)


# ---- inputs -----------------------------------------------------------------------------------------------------
def load_card(c):
    rgb = np.asarray(Image.open(os.path.join(ROOT, c["image"])).convert("RGB")).astype(np.float32)
    win = np.asarray(Image.open(os.path.join(ROOT, c["map"])).convert("RGBA"))[..., 3].astype(np.float32) / 255
    assert rgb.shape[:2] == (H, W) and win.shape == (H, W), (c["id"], rgb.shape, win.shape)
    return rgb, win


def bbox(m, pad=20):
    ys, xs = np.where(m)
    return max(0, ys.min() - pad), min(H, ys.max() + pad + 1), max(0, xs.min() - pad), min(W, xs.max() + pad + 1)


# ---- foil area: superpixels and a min-cut (make_ex_cosmos_maps.py, without the dot term) ------------------------------
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
    b = (mk == -1) | ((mk == k) & (win > 0.5))  # the outside seed must not leak into the window along the rim's edges
    if b.any():
        mk2 = mk.copy(); mk2[b] = 0
        idx = ndi.distance_transform_edt(mk2 == 0, return_distances=False, return_indices=True)
        mk = mk2[idx[0], idx[1]]
    return mk, k  # labels 1..k-1 inside, k outside


def adjacency(lab, n, L0):
    gx = cv2.Sobel(L0, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(L0, cv2.CV_32F, 0, 1, ksize=3)
    Gl = np.hypot(gx, gy) / 8
    keys, grads = [], []
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


def foil_area(med, win, sal, seeds, rng, p=P):
    w = win > 0.5
    lab, out = superpixels(med, win, p["step"])
    n = out  # node n is the outside
    area = np.bincount(lab.ravel(), minlength=n + 1).astype(float)
    Lab = cv2.cvtColor((np.clip(med, 0, 255) / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
    mLab = np.nan_to_num(np.stack([ndi.mean(Lab[..., c], lab, index=np.arange(n + 1)) for c in range(3)], -1))
    sbar = np.nan_to_num(ndi.mean(sal, lab, index=np.arange(n + 1)))
    I, J, L, GB = adjacency(lab, n, Lab[..., 0])
    dE = np.linalg.norm(mLab[I] - mLab[J], axis=1); dS = np.abs(sbar[I] - sbar[J])
    Wt = p["beta"] * L * np.exp(-(dE / p["sigc"]) ** 2 / 2) * np.exp(-GB / p["sigg"]) * np.exp(-(dS / p["sigs"]) ** 2 / 2)
    idx = np.arange(1, n)
    s = np.clip(sbar + p["sbias"], p["slo"], 1 - p["slo"])
    Cf = p["uscale"] * area * s * 2          # salient: matte
    Cm = p["uscale"] * area * (1 - s) * 2    # not salient: foil
    matte_fixed, foil_fixed = [n], []
    hh, ww = lab.shape
    for x, y in seeds.get("matte", []):
        if 0 <= y < hh and 0 <= x < ww: matte_fixed.append(lab[y, x])
    for x, y in seeds.get("foil", []):
        if 0 <= y < hh and 0 <= x < ww: foil_fixed.append(lab[y, x])
    fg = mincut(n, Cf, Cm, I, J, Wt, matte_fixed, foil_fixed)
    r = int(p["near"])
    nearpx = cv2.dilate((sal > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) if r else np.ones(sal.shape, np.uint8)
    nearf = np.nan_to_num(ndi.mean(nearpx.astype(np.float32), lab, index=np.arange(n + 1)))
    for _ in range(p["iters"]):
        F = fg[idx]; X = mLab[idx]
        if F.sum() < 3 or (~F).sum() < 3: break
        nf = nll(X, gmm(X[F], area[idx][F], p["K"], rng)); nm = nll(X, gmm(X[~F], area[idx][~F], p["K"], rng))
        sc = p["gamma"] * area[idx] / 100.0 * nearf[idx]  # the colour model only reaches what lies near the salient subject
        Cf2 = Cf.copy(); Cm2 = Cm.copy()
        Cf2[idx] += sc * np.clip(nf - nm, -6, 6) / 2; Cm2[idx] += sc * np.clip(nm - nf, -6, 6) / 2
        fg = mincut(n, Cf2, Cm2, I, J, Wt, matte_fixed, foil_fixed)
    m = fg[lab] & w
    # a matte region the salience barely supports (rocks, a dark rim of the window) is background: foil
    lb, k = ndi.label(w & ~m)
    if k:
        ms = ndi.mean(sal, lb, index=np.arange(1, k + 1))
        m |= np.isin(lb, np.where(ms < p["msal"])[0] + 1)
    lb, k = ndi.label(m)  # islands under 250 px go, holes under 150 px fill
    if k:
        sz = ndi.sum(m, lb, range(1, k + 1)); m &= ~np.isin(lb, np.where(sz < 250)[0] + 1)
    hol = w & ~m
    lb, k = ndi.label(hol)
    if k:
        sz = ndi.sum(hol, lb, range(1, k + 1)); m |= np.isin(lb, np.where(sz < 150)[0] + 1)
    return m


# ---- GrabCut on the salient-object map: a limb the maps only half caught follows by colour -----------------------
def grabcut_sal(sub, sw, sal, p):
    """The salient map as a trimap (sure subject where it is sure, the rest probably background, sure background farther
    than gcR px from the subject) for cv2.grabCut on the window crop; the result mixed back into a 0..1 map."""
    img = np.clip(sub, 0, 255).astype(np.uint8)[..., ::-1].copy()
    if (sal > 0.6).sum() < 400:
        return sal
    R = int(p["gcR"])
    near = cv2.dilate((sal > 0.6).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * R + 1, 2 * R + 1))) > 0
    mask = np.full(sal.shape, cv2.GC_PR_BGD, np.uint8)
    mask[sal > 0.2] = cv2.GC_PR_FGD
    sure = cv2.erode((sal > 0.8).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    mask[sure] = cv2.GC_FGD
    mask[~near] = cv2.GC_BGD
    mask[sw <= 0.5] = cv2.GC_BGD
    bgd = np.zeros((1, 65)); fgd = np.zeros((1, 65))
    cv2.grabCut(img, mask, None, bgd, fgd, int(p["gcit"]), cv2.GC_INIT_WITH_MASK)
    g = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.float32)
    a0 = float((sal > 0.5).sum()); a1 = float(g.sum())
    if a1 > p["gcmax"] * a0 + 1500:  # the cut ran away into like-coloured background: keep the salient map
        return sal
    g = ndi.gaussian_filter(g, 1.0)
    return np.clip(p["gcw"] * g + (1 - p["gcw"]) * sal, 0, 1)


# ---- salient-object maps (U2-Net, U2-NetP, optionally ISNet) ------------------------------------------------------
_sessions = {}
SAL_MODELS = {"u2p": ("u2netp.onnx", (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), 320),
              "u2net": ("u2net.onnx", (0.485, 0.456, 0.406), (0.229, 0.224, 0.225), 320)}
SAL_ISNET = ("isnet-general-use.onnx", (0.485, 0.456, 0.406), (1.0, 1.0, 1.0), 1024)
SAL_ANIME = ("isnet-anime.onnx", (0.485, 0.456, 0.406), (1.0, 1.0, 1.0), 1024)


def saliency(cid, rgb, win, args, isnet=False, only=None):
    """max(u2netp, u2net[, isnet]) over the art window's tight crop, 0..1, full-card array, cached as PNGs.
    only: a list of model names ("u2p", "u2net", "isnet", "anime") that replaces the default set (hint "sal")."""
    maps = []
    models = dict(SAL_MODELS)
    if isnet:
        models["isnet"] = SAL_ISNET
    if only:
        allm = dict(SAL_MODELS, isnet=SAL_ISNET, anime=SAL_ANIME)
        models = {k: allm[k] for k in only}
    for name, (fname, mean, std, size) in models.items():
        f = os.path.join(args.sal_cache, f"{cid}.{name}.png") if args.sal_cache else None
        if f and os.path.exists(f):
            maps.append(np.asarray(Image.open(f)).astype(np.float32) / 255); continue
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


# ---- reuse of the cosmos holo's panel [0] ------------------------------------------------------------------------
def cosmos_panel(cid):
    files = glob.glob(os.path.join(ROOT, "assets/foil/fam/ex-cosmos-holo", f"{cid}.webp")) + \
        glob.glob(os.path.join(ROOT, "assets/foil/fam/ex-cosmos-holo", f"{cid}-v*.webp"))
    if not files:
        return None
    best = max(files, key=lambda f: int((re.search(r"-v(\d+)\.webp$", f) or [0, 0])[1]))
    a = np.asarray(Image.open(best).convert("RGBA"))[..., 3]
    if a.shape != (H, 3 * W):
        return None
    a = a[:, :W].astype(np.float32) / 255
    return a if (a > 0.5).sum() > 2000 else None  # an empty panel = a card drawn with mirror: false


def hand_silhouette(hand):
    """Rasterise a hand-drawn Pokemon silhouette (polygons plus variable-width strokes, cut polygons removed) at 600 x 838."""
    m = np.zeros((H, W), np.uint8)
    for poly in hand.get("polys", []):
        cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    for st in hand.get("strokes", []):
        for (x0, y0, r0), (x1, y1, r1) in zip(st, st[1:]):
            n = max(2, int(max(abs(x1 - x0), abs(y1 - y0))))
            for t in np.linspace(0, 1, n):
                cv2.circle(m, (int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t)), max(1, int(r0 + (r1 - r0) * t)), 1, -1)
    for poly in hand.get("cut", []):
        cv2.fillPoly(m, [np.array(poly, np.int32)], 0)
    return m.astype(bool)


def gc_silhouette(sub, sw, g):
    """GrabCut from a centred ellipse (ported from make_delta_holon_maps.py) for art where the Pokemon fills the window and the
    salient-object maps see nothing to separate. g: {"ell": 0.40 (ellipse half-size / window size), "core": 0.16, "box": [x0, y0, x1, y1]
    (nothing outside is Pokemon), "fg"/"bg": [[x, y, r], ...] dabs, "fgpoly"/"bgpoly": [[[x, y], ...]], all scan pixels, "iters": 5}.
    Returns the Pokemon as a bool array over the window crop (sub)."""
    h, w = sub.shape[:2]
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    y0, x0 = g["_o"]
    if "box" in g:
        bx0, by0, bx1, by1 = g["box"]
        inside = (xx + x0 >= bx0) & (xx + x0 < bx1) & (yy + y0 >= by0) & (yy + y0 < by1)
    else:
        inside = np.ones((h, w), bool)
    e, c = g.get("ell", 0.40), g.get("core", 0.16)
    ell = (((xx - w * 0.5) / (w * e)) ** 2 + ((yy - h * 0.5) / (h * e)) ** 2) < 1
    core = (((xx - w * 0.5) / (w * c)) ** 2 + ((yy - h * 0.5) / (h * c)) ** 2) < 1
    m[ell & inside] = cv2.GC_PR_FGD
    if "fg" not in g and c > 0:
        m[core & inside] = cv2.GC_FGD
    m[~inside] = cv2.GC_BGD
    m[sw <= 0.5] = cv2.GC_BGD
    b = 3
    m[:b, :] = m[-b:, :] = cv2.GC_BGD; m[:, :b] = m[:, -b:] = cv2.GC_BGD
    for k, v in (("bg", cv2.GC_BGD), ("fg", cv2.GC_FGD)):
        for (px, py, r) in g.get(k, []):
            cv2.circle(m, (int(px - x0), int(py - y0)), int(r), int(v), -1)
    for k, v in (("bgpoly", cv2.GC_BGD), ("fgpoly", cv2.GC_FGD)):
        for poly in g.get(k, []):
            cv2.fillPoly(m, [np.array([[px - x0, py - y0] for px, py in poly], np.int32)], int(v))
    img = np.ascontiguousarray(np.clip(sub, 0, 255).astype(np.uint8)[..., ::-1])
    cv2.setRNGSeed(7)
    cv2.grabCut(img, m, None, np.zeros((1, 65)), np.zeros((1, 65)), int(g.get("iters", 5)), cv2.GC_INIT_WITH_MASK)
    sil = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & inside & (sw > 0.5)
    sil = ndi.binary_opening(sil, iterations=1)
    lab, n = ndi.label(sil)
    if n:
        sz = ndi.sum(sil, lab, range(1, n + 1)); sil = np.isin(lab, [i + 1 for i, z in enumerate(sz) if z >= max(150, 0.04 * sz.max())])
    sil = ndi.binary_closing(sil, structure=np.ones((3, 3)), iterations=3)
    holes = ndi.binary_fill_holes(sil) & ~sil
    lab, n = ndi.label(holes)
    for i in range(1, n + 1):
        if (lab == i).sum() < 0.012 * (sw > 0.5).sum(): sil |= lab == i
    return ndi.binary_dilation(sil, iterations=1)


# ---- compose ----------------------------------------------------------------------------------------------------
def make(c, args, hints):
    cid = c["id"]
    h = hints.get(cid, {})
    cv2.setRNGSeed(7)  # each card draws the same whatever the run order (GrabCut seeds from the global state)
    rng = np.random.default_rng(int(hashlib.md5(cid.encode()).hexdigest()[:8], 16))
    rgb, win = load_card(c)
    y0, y1, x0, x1 = bbox(win > 0.5)
    sub, sw = rgb[y0:y1, x0:x1], win[y0:y1, x0:x1]
    p = dict(P, **h.get("params", {}))
    note = ""
    reuse = None if (args.no_reuse or h.get("recompute") or h.get("cut") or h.get("add") or h.get("foil") or h.get("matte")) else \
        (cosmos_panel(cid) if c["rarity"] == "Rare Holo" else None)
    if reuse is not None:
        area = reuse[y0:y1, x0:x1]; m = area > 0.5; note = "cosmos panel"
    else:
        med = np.stack([ndi.median_filter(sub[..., ch], size=p["med"]) for ch in range(3)], -1)
        sal = saliency(cid, rgb, win, args, bool(h.get("isnet")), h.get("sal"))[y0:y1, x0:x1]
        if not h.get("nogc"):
            sal = grabcut_sal(sub, sw, sal, p)
        seeds = {k: [(int(x) - x0, int(y) - y0) for x, y in h.get(k, [])] for k in ("foil", "matte")}
        if h.get("area") == "window":
            m = sw > 0.5
        elif h.get("gc"):
            m = (sw > 0.5) & ~gc_silhouette(sub, sw, dict(h["gc"], _o=(y0, x0)))
        elif h.get("hand") or h.get("from_map"):
            # a hand-traced silhouette (card pixels) replaces the cut: {"polys": [[[x, y], ...]], "strokes": [[[x, y, r], ...]],
            # "cut": [[[x, y], ...]], "refine": 9}; the foil is the window minus the silhouette (ported from
            # make_delta_holon_maps.py). With "refine": n the trace may be loose: GrabCut settles the edge within n px of it
            # (sure Pokemon deeper than n px inside the trace, sure background farther than n px outside).
            hd = h.get("hand") or {}
            if h.get("from_map"):  # a Pokemon silhouette map drawn for another family (alpha > 0.5 = the Pokemon), any size
                fm = Image.open(os.path.join(ROOT, h["from_map"])).convert("RGBA").getchannel("A").resize((W, H), Image.LANCZOS)
                sil0 = np.asarray(fm) > 127
                if hd: sil0 = sil0 | hand_silhouette(hd)
                sil = sil0[y0:y1, x0:x1]
            else:
                sil = hand_silhouette(hd)[y0:y1, x0:x1]
            n = int(hd.get("refine", h.get("refine", 0)))
            if n:
                st = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * n + 1, 2 * n + 1))
                su = sil.astype(np.uint8)
                outer = cv2.dilate(su, st) > 0
                inner = cv2.erode(su, st) > 0
                gm = np.full(sil.shape, cv2.GC_BGD, np.uint8)
                gm[outer] = cv2.GC_PR_BGD; gm[sil] = cv2.GC_PR_FGD; gm[inner] = cv2.GC_FGD
                gm[sw <= 0.5] = cv2.GC_BGD
                cv2.setRNGSeed(7)
                im8 = np.ascontiguousarray(np.clip(sub, 0, 255).astype(np.uint8)[..., ::-1])
                cv2.grabCut(im8, gm, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
                sil = ((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD)) & outer
                sil = ndi.binary_closing(sil, structure=np.ones((3, 3)), iterations=2)
                sil = ndi.binary_opening(sil, iterations=1)
            m = (sw > 0.5) & ~sil
        else:
            m = foil_area(med, sw, sal, seeds, rng, p)
        for key, val in (("cut", False), ("add", True)):  # hint boxes [x0, y0, x1, y1] in scan pixels
            for bx in h.get(key, []):
                m[max(0, bx[1] - y0):max(0, bx[3] - y0), max(0, bx[0] - x0):max(0, bx[2] - x0)] = val
        # "fill": [[x, y, tol], ...] flood-fills the picture from a point (colour tolerance tol, default 14) and takes the
        # region out of the foil ("fillfoil" puts it in): a limb the salient-object maps missed
        for key, val in (("fill", False), ("fillfoil", True)):
            for pt in h.get(key, []):
                x, y = int(pt[0]) - x0, int(pt[1]) - y0
                if not (0 <= x < sub.shape[1] and 0 <= y < sub.shape[0]): continue
                tol = int(pt[2]) if len(pt) > 2 else 14
                img = np.ascontiguousarray(np.clip(med, 0, 255).astype(np.uint8))
                ff = np.zeros((img.shape[0] + 2, img.shape[1] + 2), np.uint8)
                cv2.floodFill(img, ff, (x, y), 0, (tol,) * 3, (tol,) * 3, 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8))
                m[ff[1:-1, 1:-1] > 0] = val
        m &= sw > 0.5
        area = ndi.gaussian_filter(ndi.binary_erosion(m, iterations=1).astype(np.float32), 0.8) * np.clip(sw, 0, 1)
    full = np.pad(area, ((y0, H - y1), (x0, W - x1)))
    al = (np.round(np.clip(full, 0, 1) * 31) / 31 * 255).round().astype(np.uint8)
    rgba = np.dstack([np.full_like(al, 255)] * 3 + [al])
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"{cid}-v{h.get('version', 1)}.webp")
    Image.fromarray(rgba, "RGBA").save(path, lossless=True, quality=100, method=6)
    stats = dict(id=cid, area=round(float(m.sum() / max(1, (sw > 0.5).sum())), 3), bytes=os.path.getsize(path), note=note)
    vis = sub.copy(); vis[~m] *= 0.3
    e = m ^ ndi.binary_erosion(m); vis[e] = [0, 255, 255]
    return stats, np.concatenate([sub, vis], 1)


def write_sheet(rows, sheets, name):
    r0 = np.zeros_like(rows[0])
    pairs = [np.concatenate(rows[j:j + 2] + [r0] * (2 - len(rows[j:j + 2])), 1) for j in range(0, len(rows), 2)]
    os.makedirs(sheets, exist_ok=True)
    Image.fromarray(np.clip(np.concatenate(pairs, 0), 0, 255).astype(np.uint8)).save(os.path.join(sheets, name), quality=82)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", required=True, help="cards JSON from list_cards.mjs")
    ap.add_argument("--ids", default="", help="comma-separated card ids (default: all)")
    ap.add_argument("--sets", default="", help="comma-separated sets, e.g. ex16,ex15")
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/fam/ex-reverse"))
    ap.add_argument("--hints", default=os.path.join(HERE, "make_ex_reverse_hints.json"))
    ap.add_argument("--sheets", default="", help="folder for review contact sheets (masks-<set>.jpg)")
    ap.add_argument("--sal-cache", default="", help="folder of cached salient-object PNGs")
    ap.add_argument("--models", default="", help="folder holding u2net.onnx and u2netp.onnx")
    ap.add_argument("--pylib", default="", help="extra sys.path entry for onnxruntime")
    ap.add_argument("--no-reuse", action="store_true", help="draw Rare Holos too instead of taking the cosmos panel")
    ap.add_argument("--sheet-suffix", default="", help="sheet file name suffix (parallel runs of one set)")
    args = ap.parse_args()
    cv2.setRNGSeed(7)
    cards = json.load(open(args.list))
    if args.ids:
        want = args.ids.split(","); cards = [c for c in cards if c["id"] in want]
    if args.sets:
        want = args.sets.split(","); cards = [c for c in cards if c["set"] in want]
    hints = json.load(open(args.hints)) if os.path.exists(args.hints) else {}
    hints = {k: v for k, v in hints.items() if not k.startswith("_")}
    cards = [c for c in cards if not hints.get(c["id"], {}).get("skip")]
    rows, allstats, cur = [], [], None
    for i, c in enumerate(cards):
        if cur is not None and c["set"] != cur and rows:
            write_sheet(rows, args.sheets, f"masks-{cur}{args.sheet_suffix}.jpg"); rows = []
        cur = c["set"]
        stats, review = make(c, args, hints)
        allstats.append(stats)
        print(json.dumps(stats), flush=True)
        if args.sheets:
            r = cv2.resize(np.clip(review, 0, 255).astype(np.uint8), None, fx=0.7, fy=0.7, interpolation=cv2.INTER_AREA)
            r = np.ascontiguousarray(np.pad(r, ((0, max(0, 260 - r.shape[0])), (0, max(0, 840 - r.shape[1])), (0, 0)))[:260, :840])
            cv2.putText(r, c["id"], (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            rows.append(r)
    if args.sheets and rows:
        write_sheet(rows, args.sheets, f"masks-{cur}{args.sheet_suffix}.jpg")


if __name__ == "__main__":
    main()
