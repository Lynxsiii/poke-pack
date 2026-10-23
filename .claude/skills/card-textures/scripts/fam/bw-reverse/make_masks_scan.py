#!/usr/bin/env python3
"""bw-reverse: masks for the BW reverse faces that have no TCG Live reverse map, built from each print's OWN scan (2026-10-23).

Draws: assets/foil/fam/bw-reverse/<set>/<number>-s1.webp (367x512 lossless WebP, white with alpha, the same format as the -v3 masks) and, for Dragon
       Pokemon, <number>-s1g.webp (the glare's mask, see make_masks_v3.py). Prints the JS list (`SCAN_MASKS`) for js/fam/bw-reverse.js.
Which: the 94 reverse faces the family did not claim (census, 2026-10-22): bw10 / bw11 Rare Holo (TCG Live's file for a holo print is its HOLO map,
       the art window, not the reverse one), Legendary Treasures' Radiant Collection RC1-RC20 (no TCG Live file at all), Dragon Vault dv1-1..21 (its
       maps are the holo prints'; no real reverse print is known, the faces are in the game data), and the 13 Dragons Exalted prints whose misnumbered
       TCG Live file could not be matched by image (make_masks_bw6.py "skipped").
How:   the same rules as the TCG Live masks (make_masks.py + make_masks_v3.py): foil on the body, the name bar, the stat line and the frame strip; the art
       window, the yellow border, the evolution picture, every printed symbol and every line of ink cut out.
       1. Fixed layout (`consensus`): the mean of the -v3 alpha of every claimed bw7-bw11 print of the same layout (era class bw-lay-basic / -evo /
          -trainer; Plasma prints have their own). A pixel that is a hole on 85% or more of them (the yellow border, the art window, the evolution picture,
          the type icon by the HP, the "weakness / resistance / retreat" labels, the flavour box's outline, the set mark) is a hole here, with the
          consensus' own soft edge. Its small holes (400 px^2 or less: icons, labels) are kept only where this print's scan is not plain body there.
       2. Symbols: the attack-cost, weakness, resistance and retreat circles are found on the full-size scan (Hough circles, radius 9-14 px of 600, in the
          attack rows and the bottom row, each checked for a ring of contrast against the body) and cut as discs 2 map px wider (the -v3 erosion).
       3. Ink: as make_masks_v3.py: darker than 110 and more than 40 in RGB distance from the 11 px median (components of 6 px^2 or more outside the
          text zone), dilated 1 px; the Ability badge (red box) whole; then every text-zone hole of 24 px^2 or less whose darkest FULL-SIZE scan pixel
          is 50 or lighter (grain, not ink) is filled. Near-black bodies (text-zone median under 75: Darkness) take no ink cut (white text stays white
          under the screen). Dragon prints with WHITE text: the white letters are cut from the foil mask (lighter than 165, 50 from the median) and the
          glare mask keeps them (make_masks_v3.py).
Check: `--validate` runs steps 1-3 on claimed prints and scores them against their TCG Live (-v3) masks (hole recall / precision in map px).
Run:   python3 make_masks_scan.py [--validate N] [--only <id,id>]
"""
import argparse, json, re
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets/foil/fam/bw-reverse"
CENSUS = Path("/home/user/holo-tools/census.json")
Z0, Z1 = 266, 476
DISK2 = np.hypot(*np.mgrid[-2:3, -2:3]) <= 2.2

TARGETS = {
    "bw10": "16 33 37 41 46 49 54 56 64 69 74",
    "bw11": "8 12 15 16 19 22 23 27 28 32 39 43 46 50 51 53 66 68 72 78 80 84 85 90 91 93 96 99 105 108 "
            "RC1 RC2 RC3 RC4 RC5 RC6 RC7 RC8 RC9 RC10 RC12 RC13 RC14 RC15 RC16 RC17 RC18 RC19 RC20",
    "bw6": "2 3 5 6 10 18 19 21 33 34 47 48 49",
    "dv1": " ".join(str(i) for i in range(1, 22)),
}


def layout_key(classes):
    cl = classes.split()
    lay = next((c for c in cl if c.startswith("bw-lay-")), "bw-lay-basic")
    return lay + ("+plasma" if "bw-rev-plasma" in cl else "")


def consensus_maps(census):
    """Mean -v3 alpha per layout over the claimed prints of bw7-bw11 (cached in the work dir)."""
    cache = Path("/home/user/holo-work/fix-bw-reverse-rest/consensus.npz")
    if cache.exists():
        z = np.load(cache)
        return {k: z[k] for k in z.files}
    acc = {}
    for f in census:
        if f.get("family") != "bw-reverse" or f["set"] not in ("bw7", "bw8", "bw9", "bw10", "bw11"):
            continue
        k = layout_key(f["classes"])
        a = np.asarray(Image.open(OUT / f["set"] / f"{f['n']}-v3.webp").convert("RGBA"))[..., 3] / 255.0
        acc.setdefault(k, []).append(a)
    out = {k: np.mean(v, 0).astype(np.float32) for k, v in acc.items()}
    np.savez_compressed(cache, **out)
    return out


def lum_of(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def fixed_holes(cons, sf, lum):
    """Step 1: the layout's fixed holes, soft-edged from the consensus; small ones only where this scan is not plain body."""
    core = cons < 0.15
    lab, k = ndi.label(core)
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, k + 1))
    bg = cv2.medianBlur(np.ascontiguousarray(sf.astype(np.uint8)), 21).astype(np.float32)
    keep = np.zeros(core.shape, bool)
    for i, z in enumerate(sizes, 1):
        if z < 6:
            continue
        m = lab == i
        if z <= 400:
            # a label or icon this print may not have (no resistance, a shorter label): keep it where the scan differs from the body around it
            ring = ndi.binary_dilation(m, iterations=4) & ~ndi.binary_dilation(m, iterations=1)
            body = np.median(sf[ring], axis=0)
            d = np.sqrt(((sf[m] - body) ** 2).sum(-1))
            if np.percentile(d, 75) < 30:
                continue
        keep |= m
    near = ndi.binary_dilation(keep, iterations=3)
    soft = np.clip((cons - 0.15) / 0.7, 0, 1)
    return np.where(near, np.where(keep, 0.0, soft), 1.0)


COST_X, COST_DX, COST_R = 62.0, 32.5, 13.0          # attack-cost spheres on the 600x838 scan: first centre x, spacing, radius
SMALL_R = 10.0                                      # weakness / resistance / retreat spheres
RETREAT_X, RETREAT_DX, RETREAT_Y = 130.8, 25.5, 781.5
BADGE = ("bw10", "16", 463, 501, 46, 178)           # the silver "Ability" badge, cut from Blastoise's scan (y0, y1, x0, x1)


def disc_hole(m, cx, cy, r):
    """Share of hole pixels (alpha < 0.5) of the 367x512 mask `m` in a disc (map px)."""
    y0, y1, x0, x1 = int(cy - r - 1), int(cy + r + 2), int(cx - r - 1), int(cx + r + 2)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = (xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r
    return (m[y0:y1, x0:x1] < 0.5)[d].mean()


def harvest(census, n=260, seed=1):
    """Template banks from claimed prints: where a print's TCG Live (-v3) mask holds a solid disc at a cost column (or a retreat slot), its scan holds a
    printed sphere there. Cached in the work dir."""
    cache = Path("/home/user/holo-work/fix-bw-reverse-rest/banks.npz")
    if cache.exists():
        z = np.load(cache)
        return z["big"], z["small"], z["badge"], set(z["ids"].tolist())
    pool = [f for f in census if f.get("family") == "bw-reverse" and f["set"] in ("bw7", "bw8", "bw9", "bw10", "bw11") and "trainer" not in f["classes"]]
    rng = np.random.default_rng(seed)
    big, small, ids = [], [], []
    for i in rng.choice(len(pool), n, replace=False):
        f = pool[i]
        ids.append(f["id"])
        m = np.asarray(Image.open(OUT / f["set"] / f"{f['n']}-v3.webp").convert("RGBA"))[..., 3] / 255.0
        full = np.asarray(Image.open(ROOT / f["img"]).convert("RGB"))
        for k in range(5):
            cx = COST_X + COST_DX * k
            ys = [y for y in range(Z0 + 4, 430) if disc_hole(m, cx * 367 / 600, y, 4.5) > 0.97]
            runs = []
            for y in ys:
                if runs and y - runs[-1][-1] <= 1:
                    runs[-1].append(y)
                else:
                    runs.append([y])
            for r in runs:
                if len(r) >= 3:
                    cy = (np.mean(r) + 0.5) * 838 / 512
                    x0, y0 = int(round(cx - 15)), int(round(cy - 15))
                    crop = full[y0:y0 + 30, x0:x0 + 30]
                    if crop.shape == (30, 30, 3):
                        big.append(crop)
        for k in range(5):
            cx = RETREAT_X + RETREAT_DX * k
            if disc_hole(m, cx * 367 / 600, RETREAT_Y * 512 / 838, 3.5) > 0.97:
                x0, y0 = int(round(cx - 12)), int(round(RETREAT_Y - 12))
                crop = full[y0:y0 + 24, x0:x0 + 24]
                if crop.shape == (24, 24, 3):
                    small.append(crop)
    s, n_, y0, y1, x0, x1 = BADGE
    badge = np.asarray(Image.open(ROOT / f"assets/cards/{s}/{n_}.webp").convert("RGB"))[y0:y1, x0:x1]
    big, small = prune(np.array(big)), prune(np.array(small))
    np.savez_compressed(cache, big=big, small=small, badge=badge, ids=np.array(ids))
    return big, small, badge, set(ids)


def prune(b, agree=0.85, need=3, same=0.95):
    """A bank without its strays and near-duplicates: a crop is kept when it matches (NCC 0.85 or more) at least 3 others and is not flat (luminance
    s.d. 35 or more): a stray (a TCG Live hole over plain body, white attack-name text on a dark card, part of the Ability badge) matches few. Then
    greedily drop crops within NCC 0.95 of one already kept."""
    v = b.reshape(len(b), -1).astype(np.float64)
    v -= v.mean(1, keepdims=True)
    v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
    m = v @ v.T
    np.fill_diagonal(m, 0)
    lum = lum_of(b.astype(np.float64)).reshape(len(b), -1).std(1)
    ok = np.where(((m >= agree).sum(1) >= need) & (lum >= 35))[0]
    kept = []
    for i in ok[np.argsort(-(m[ok] >= agree).sum(1))]:
        if all(m[i, j] < same for j in kept):
            kept.append(i)
    return b[kept]


def ncc_max(img, bank):
    """Max normalised cross-correlation over a template bank, per position (valid region)."""
    best = None
    for t in bank:
        r = cv2.matchTemplate(img, t, cv2.TM_CCOEFF_NORMED)
        best = r if best is None else np.maximum(best, r)
    return best


def peaks1d(v, thr, mind):
    out = []
    for i in np.argsort(-v):
        if v[i] < thr:
            break
        if all(abs(i - j) >= mind for j in out):
            out.append(int(i))
    return out


def symbols(full, banks, t_big=0.72, t_small=0.72, t_badge=0.6):
    """Step 2: the printed spheres and the Ability badge on the full-size scan; a hole mask at 367x512 and the list of what was found."""
    big, small, badge = banks[:3]
    H, W = full.shape[:2]
    img = np.ascontiguousarray(full.astype(np.uint8))
    yy, xx = np.mgrid[0:512, 0:367]
    holes = np.zeros((512, 367), bool)
    found = []
    fy0, fy1 = int(Z0 * H / 512), int(432 * H / 512)
    for k in range(5):
        cx = COST_X + COST_DX * k
        x0 = int(round(cx - 15)) - 3
        strip = img[fy0:fy1, x0:x0 + 36]
        r = ncc_max(strip, big)                 # (h-29, 7)
        prof = r.max(1)
        for i in peaks1d(prof, t_big, 20):
            dx = int(np.argmax(r[i]))
            found.append(("cost", k, x0 + dx + 14.5, fy0 + i + 14.5, float(prof[i])))
    # weakness / resistance / retreat row
    by0, by1, bx0, bx1 = int(722 * H / 838), int(800 * H / 838), 30, 300
    r = ncc_max(img[by0:by1, bx0:bx1], small)
    rr = r.copy()
    while True:
        j = np.unravel_index(np.argmax(rr), rr.shape)
        if rr[j] < t_small:
            break
        found.append(("small", 0, bx0 + j[1] + 11.5, by0 + j[0] + 11.5, float(rr[j])))
        rr[max(0, j[0] - 16):j[0] + 17, max(0, j[1] - 16):j[1] + 17] = -1
    # the Ability badge (left-aligned in the attack column)
    bh, bw = badge.shape[:2]
    r = cv2.matchTemplate(img[fy0:fy1, 30:70 + bw], badge, cv2.TM_CCOEFF_NORMED)
    for i in peaks1d(r.max(1), t_badge, 30):
        dx = int(np.argmax(r[i]))
        found.append(("badge", 0, 30 + dx, fy0 + i, float(r[i].max())))
    for kind, k, cx, cy, sc in found:
        if kind == "badge":
            y0m, y1m = cy * 512 / H - 2, (cy + bh) * 512 / H + 2
            x0m, x1m = cx * 367 / W - 2, (cx + bw) * 367 / W + 2
            holes |= (yy + 0.5 >= y0m) & (yy + 0.5 <= y1m) & (xx + 0.5 >= x0m) & (xx + 0.5 <= x1m)
            continue
        mr = (COST_R if kind == "cost" else SMALL_R) * 367 / W + (2.0 if kind == "cost" else 1.6)
        holes |= (xx + 0.5 - cx * 367 / W) ** 2 + (yy + 0.5 - cy * 512 / H) ** 2 <= mr ** 2
    return holes, found


def red_ink(full, fl, sl, H, W):
    fy0, fy1 = int(sl[0].start * H / 512), int(np.ceil(sl[0].stop * H / 512))
    fx0, fx1 = int(sl[1].start * W / 367), int(np.ceil(sl[1].stop * W / 367))
    reg, regl = full[fy0:fy1, fx0:fx1], fl[fy0:fy1, fx0:fx1]
    d = reg[np.unravel_index(np.argmin(regl), regl.shape)]
    return bool(d[0] > 150 and d[1] < 50 and d[0] - d[1] > 110)


def grain_fill(a, zone, full, maxsz=24, always=False):
    """make_masks_v3.py grain_holes (without the bar spurs: no shipped grain cut here): text-zone holes of maxsz px^2 or less whose full-size scan
    has no ink-dark (under 50) or red-ink pixel are filled."""
    lab, k = ndi.label((a < 0.5) & zone)
    H, W = full.shape[:2]
    fl = lum_of(full)
    fill = np.zeros(a.shape, bool)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        m = lab[sl] == i
        if m.sum() > maxsz:
            continue
        fy0, fy1 = int(sl[0].start * H / 512), int(np.ceil(sl[0].stop * H / 512))
        fx0, fx1 = int(sl[1].start * W / 367), int(np.ceil(sl[1].stop * W / 367))
        regl = fl[fy0:fy1, fx0:fx1]
        if regl.size == 0:
            continue
        if always or (regl.min() >= 50 and not red_ink(full, fl, sl, H, W)):
            fill[sl][m] = True
    return fill


def build(c, face, cons, banks):
    """The mask (and, for Dragon prints, the glare mask) of one print: float alpha arrays 512x367."""
    img = Image.open(ROOT / c["image"]).convert("RGB")
    full = np.asarray(img).astype(np.float32)
    scan = np.asarray(img.resize((367, 512), Image.LANCZOS))
    sf = scan.astype(np.float32)
    lum = lum_of(sf)
    zone = np.zeros(lum.shape, bool)
    zone[Z0:Z1] = True
    kind = c.get("supertype") if c.get("supertype") in ("Trainer", "Energy") else (c.get("types") or ["?"])[0]
    trainer = kind in ("Trainer", "Energy")
    a = fixed_holes(cons[layout_key(face["classes"])], sf, lum)
    # 2. symbols: the attack rows (left 40% of the text zone) and the bottom stat row (weakness / resistance / retreat)
    if not trainer:
        sym, _ = symbols(full, banks)
        a = np.where(sym, 0.0, a)
    bg = cv2.medianBlur(np.ascontiguousarray(scan), 11).astype(np.float32)
    dist = np.sqrt(((sf - bg) ** 2).sum(-1))
    dark_body = np.median(lum[Z0:Z1]) < 75
    if not dark_body:
        dark = (dist > 40) & (lum < 110)
        labd, kd = ndi.label(dark & ~zone)
        sized = ndi.sum(np.ones_like(labd), labd, range(1, kd + 1))
        dark = (dark & zone) | np.isin(labd, [i + 1 for i, z in enumerate(sized) if z >= 6])
        a = np.where(ndi.binary_dilation(dark, iterations=1), 0.0, a)
    fill = grain_fill(a, zone, full)
    a = np.where(fill, 1.0, a)
    glare = None
    if kind == "Dragon":
        light = (dist > 50) & (lum > 165) & zone
        darkink = (dist > 40) & (lum < 90) & zone
        if light.sum() > darkink.sum():
            glare = a.copy()
            lab2, k2 = ndi.label(light)
            sizes2 = ndi.sum(np.ones_like(lab2), lab2, range(1, k2 + 1))
            peak2 = ndi.maximum(lum, lab2, range(1, k2 + 1))
            ink = np.isin(lab2, [i + 1 for i, (z, pk) in enumerate(zip(sizes2, peak2)) if z >= 12 or (z >= 5 and pk > 190)])
            a = np.where(ink, 0.0, a)
        else:
            glare = a.copy()
    return a, glare


def save(a, path):
    rgba = np.zeros(a.shape + (4,), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, lossless=True, quality=60, method=1, exact=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", type=int, default=0, help="score N claimed bw7-bw11 prints against their -v3 masks instead of writing")
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    census = json.loads(CENSUS.read_text())
    cons = consensus_maps(census)
    banks = harvest(census)
    faces = {f["id"]: f for f in census if f.get("reverse") and f["set"] in ("bw6", "bw7", "bw8", "bw9", "bw10", "bw11", "dv1")}
    data = {}
    for s in ("bw6", "bw7", "bw8", "bw9", "bw10", "bw11", "dv1"):
        for c in json.loads((ROOT / f"data/{s}.json").read_text()):
            data[c["id"]] = c
    if args.validate:
        rng = np.random.default_rng(7)
        pool = [f for f in census if f.get("family") == "bw-reverse" and f["set"] in ("bw10", "bw11", "bw7", "bw9") and f["id"] not in banks[3]]
        pick = [pool[i] for i in rng.choice(len(pool), args.validate, replace=False)]
        if args.only:
            pick = [faces[i] for i in args.only.split(",")]
        tot = []
        for f in pick:
            c = data[f["id"]]
            a, _ = build(c, f, cons, banks)
            v3 = np.asarray(Image.open(OUT / f["set"] / f"{f['n']}-v3.webp").convert("RGBA"))[..., 3] / 255.0
            body = ndi.binary_erosion(cons[layout_key(f["classes"])] > 0.5, iterations=2)
            th, tv = a < 0.5, v3 < 0.5
            miss = (tv & ~th & body).sum()     # foil here where TCG Live has a hole
            extra = (th & ~tv & body).sum()    # a hole here where TCG Live has foil
            tot.append((f["id"], int(miss), int(extra), int((tv & body).sum())))
            if args.out:
                sc = np.asarray(Image.open(ROOT / c["image"]).convert("RGB").resize((367, 512), Image.LANCZOS)).astype(np.float32)
                ov = sc.copy()
                ov[tv & ~th] = [255, 0, 0]
                ov[th & ~tv] = [0, 120, 255]
                ov[th & tv] = sc[th & tv] * 0.4 + np.array([255, 0, 255]) * 0.6
                Image.fromarray(ov.astype(np.uint8)).save(f"{args.out}/val-{f['id']}.png")
        for t in tot:
            print(*t)
        print("mean miss", np.mean([t[1] for t in tot]), "mean extra", np.mean([t[2] for t in tot]))
    else:
        js = {}
        only = set(args.only.split(",")) if args.only else None
        for s, nums in TARGETS.items():
            for n in nums.split():
                cid = f"{s}-{n}"
                if only and cid not in only:
                    continue
                f = faces[cid]
                a, g = build(data[cid], f, cons, banks)
                (OUT / s).mkdir(parents=True, exist_ok=True)
                save(a, OUT / s / f"{n}-s1.webp")
                if g is not None:
                    save(g, OUT / s / f"{n}-s1g.webp")
                js.setdefault(s, []).append(n)
        for s, ns in js.items():
            print(f'  {s}: "{" ".join(ns)}",')
