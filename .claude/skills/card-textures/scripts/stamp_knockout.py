"""Knock a stamped print's stamp out of its foil map.

Promos and set cards come in stamped prints: a Pokémon Center logo on the
collection-box promo, the set logo on a Build & Battle or Premium Collection
promo, a Prerelease or Pokémon Day stamp. TCG Live has no map for the
stamped print (its map of svp072 is the plain print's), so the site files it
with the plain print's foil map and the foil runs straight over the stamp.
On the real card the stamp is opaque ink with no foil under it.

For each card whose id is `<base>-<suffix>` (svp072-stamp, mep009-pc,
14-stamp, 34-prerelease) the stamp is found one of three ways, in order:

  1. **Difference.** When both scans come from the same source (the two
     differ on under 5% of the card), align them (whole-card phase
     correlation, then per tile), difference, blur, threshold, and keep the
     strongest compact blob in the zone a stamp of that kind sits in (bottom
     right for Pokémon Center, the art window for set and Prerelease
     stamps), plus the blobs next to it (a logo and its text). The crop of
     the stamped scan under that blob becomes a template.
  2. **Template.** Scans from different sources differ everywhere (a
     re-scan with a different border crop or sharpening), so the stamp is
     found by masked normalised cross-correlation of the templates step 1
     produced for that kind (Pokémon Center stamps are the same logo on
     every promo; set stamps match within a set), at three scales.
  3. **Hand box.** scripts/stamp_boxes.json maps a card id to
     [x, y, w, h] on the 600x838 scan; a rounded rectangle is knocked out.

The stamp is dilated two pixels, feathered, and subtracted from the base
print's foil map, shipped as assets/foil/maps/<set>/<number>.webp with the
card's `foilMap` pointed at it (etch maps stay the base's). Maps come out
with TCG Live's dark floor removed (their "not foil" is 22/255, not 0;
fetch_foil_maps.py does the same since 2026-09-27).

    python3 .claude/skills/card-textures/scripts/stamp_knockout.py --all --debug
    python3 .claude/skills/card-textures/scripts/stamp_knockout.py --set sv4pt5 --only svp072-stamp

`--debug` writes a contact sheet per set (stamped scan, difference, the
stamp, the new map) to scripts/_debug/stamps/, which is gitignored. Look at
it: a stamp that sits on non-foil ink costs nothing, but a blob that is not
the stamp would punch a hole in the foil. Anything the script skips is
listed at the end with the reason; give it a box in stamp_boxes.json.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from scipy.signal import fftconvolve

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
FLOOR = 22  # TCG Live's "not foil" luminance
SCAN = (600, 838)
# Where a stamp of each kind sits, as fractions of the scan: x0, y0, x1, y1.
ZONES = {
    "pc": (0.5, 0.42, 1.0, 0.9),
    "stamp": (0.0, 0.04, 1.0, 0.62),
    "stamped": (0.0, 0.04, 1.0, 0.62),
    "prerelease": (0.0, 0.04, 1.0, 0.62),
    "pokemon-day": (0.0, 0.0, 1.0, 1.0),
    "blister": (0.0, 0.0, 1.0, 1.0),
    "gamestop": (0.3, 0.04, 1.0, 0.62),
    "ebgames": (0.3, 0.04, 1.0, 0.62),
}
# Stamps that are the same logo on every set share their templates.
GLOBAL_KINDS = ("pc", "gamestop", "ebgames")
# The art window and the outer silver frame of a standard layout, as shares of
# the card: for a print whose plain card has no map (a non-holo Rare that only
# goes holo as a cosmos promo), the map is drawn from these instead.
WINDOW = (0.07937, 0.09318, 1 - 0.07302, 1 - 0.52727)  # x0, y0, x1, y1 (windows.css)
FRAME = (0.036, 0.026)
SUFFIXES = tuple(ZONES)
NOISE_MAX = 0.05  # share of the card that may differ for the pair to count as one source
MATCH_MIN = 0.5  # normalised cross-correlation a template match must reach


def shift_between(a: np.ndarray, b: np.ndarray, limit: int) -> tuple[int, int]:
    """(dy, dx) that moves b onto a, by phase correlation, within +-limit px."""
    fa, fb = np.fft.fft2(a - a.mean()), np.fft.fft2(b - b.mean())
    r = fa * np.conj(fb)
    r /= np.maximum(np.abs(r), 1e-6)
    corr = np.fft.ifft2(r).real
    h, w = corr.shape
    window = np.full_like(corr, -np.inf)
    ys = np.r_[0:limit + 1, h - limit:h]
    xs = np.r_[0:limit + 1, w - limit:w]
    window[np.ix_(ys, xs)] = corr[np.ix_(ys, xs)]
    y, x = np.unravel_index(int(np.argmax(window)), corr.shape)
    dy = y if y <= h // 2 else y - h
    dx = x if x <= w // 2 else x - w
    return int(dy), int(dx)


def shifted(img: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.roll(img, (dy, dx), axis=(0, 1))
    # Rolled-in edges are junk: copy the nearest real row/column instead.
    if dy > 0:
        out[:dy] = out[dy:dy + 1]
    elif dy < 0:
        out[dy:] = out[dy - 1:dy]
    if dx > 0:
        out[:, :dx] = out[:, dx:dx + 1]
    elif dx < 0:
        out[:, dx:] = out[:, dx - 1:dx]
    return out


def aligned(a: np.ndarray, b: np.ndarray, tile: int = 120, limit: int = 10) -> tuple[np.ndarray, tuple[int, int]]:
    """b moved onto a, tile by tile: two scans of one card differ by a
    whole-card shift plus a little scale, so each tile gets its own small
    shift, found on the grey images and applied to the colour one."""
    ga, gb = a.mean(axis=2), b.mean(axis=2)
    H, W = ga.shape
    dy0, dx0 = shift_between(ga, gb, 24)
    b = shifted(b, dy0, dx0)
    gb = shifted(gb, dy0, dx0)
    out = b.copy()
    pad = limit + 4
    for y in range(0, H, tile):
        for x in range(0, W, tile):
            y1, x1 = min(y + tile, H), min(x + tile, W)
            sy, sx = slice(max(0, y - pad), min(H, y1 + pad)), slice(max(0, x - pad), min(W, x1 + pad))
            ta, tb = ga[sy, sx], gb[sy, sx]
            if ta.std() < 2 or tb.std() < 2:
                continue
            dy, dx = shift_between(ta, tb, limit)
            src = shifted(b[sy, sx], dy, dx)
            oy, ox = y - sy.start, x - sx.start
            out[y:y1, x:x1] = src[oy:oy + (y1 - y), ox:ox + (x1 - x)]
    return out, (dy0, dx0)


def blur(m: np.ndarray, radius: float) -> np.ndarray:
    return np.asarray(Image.fromarray(m.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)


def feathered(keep: np.ndarray) -> np.ndarray:
    keep = ndimage.binary_closing(keep, iterations=3)
    keep = ndimage.binary_fill_holes(keep)
    keep = ndimage.binary_dilation(keep, iterations=2)
    return blur(keep * 255.0, 0.8) / 255


def in_zone(box: list[int], kind: str, shape: tuple[int, int]) -> bool:
    H, W = shape
    x0, y0, x1, y1 = ZONES[kind]
    cx, cy = box[0] + box[2] / 2, box[1] + box[3] / 2
    return x0 * W <= cx <= x1 * W and y0 * H <= cy <= y1 * H


def near(a: list[int], b: list[int], gap: int) -> bool:
    return not (a[0] + a[2] + gap < b[0] or b[0] + b[2] + gap < a[0] or a[1] + a[3] + gap < b[1] or b[1] + b[3] + gap < a[1])


def union_box(boxes: list[list[int]]) -> list[int]:
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return [x0, y0, x1 - x0, y1 - y0]


def by_difference(a: np.ndarray, b: np.ndarray, kind: str, thr: int, min_fill: float) -> tuple[np.ndarray | None, dict]:
    """The stamp as 0..1 alpha from the two scans, or None with the reason."""
    H, W = a.shape[:2]
    b, shift = aligned(a, b)
    diff = np.max(np.stack([np.abs(blur(a[..., c], 1.5) - blur(b[..., c], 1.5)) for c in range(3)]), axis=0)
    noise = float((diff > thr).mean())
    info = {"shift": list(shift), "noise": round(noise, 3), "diff": diff, "aligned": b}
    if noise > NOISE_MAX:
        info["why"] = f"scans differ on {noise:.0%} of the card (different sources)"
        return None, info
    binary = ndimage.binary_opening(diff > thr, iterations=2)
    labels, _ = ndimage.label(binary)
    area = H * W
    blobs = []
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is None:
            continue
        blob = labels[sl] == i
        size = int(blob.sum())
        bh, bw = blob.shape
        box = [int(sl[1].start), int(sl[0].start), bw, bh]
        fill = size / (bh * bw)
        strength = float(diff[sl][blob].mean())
        ok = (0.0008 * area <= size <= 0.12 * area and fill >= min_fill and bh < 0.4 * H and bw < 0.6 * W
              and strength >= thr * 1.5 and in_zone(box, kind, (H, W)))
        blobs.append({"i": i, "sl": sl, "box": box, "px": size, "fill": round(fill, 2), "strength": round(strength), "ok": ok})
    cands = [bl for bl in blobs if bl["ok"]]
    if not cands:
        info["why"] = "no stamp-sized difference in the stamp's zone"
        return None, info
    best = max(cands, key=lambda bl: bl["strength"] * np.sqrt(bl["px"]))
    chosen = [best]
    grew = True
    while grew:
        grew = False
        ub = union_box([c["box"] for c in chosen])
        for bl in cands:
            if bl in chosen or not near(ub, bl["box"], 36):
                continue
            nb = union_box([ub, bl["box"]])
            if nb[2] <= 0.5 * W and nb[3] <= 0.22 * H:
                chosen.append(bl)
                grew = True
    keep = np.zeros((H, W), bool)
    for bl in chosen:
        keep[bl["sl"]] |= labels[bl["sl"]] == bl["i"]
    info["box"] = union_box([c["box"] for c in chosen])
    info["blobs"] = [(c["box"], c["fill"], c["strength"]) for c in chosen]
    return feathered(keep), info


def highpass(g: np.ndarray) -> np.ndarray:
    return g - blur(g, 6)


def masked_ncc(img: np.ndarray, tmpl: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Zero-normalised cross-correlation of tmpl (under mask) over img, 'valid' positions."""
    n = mask.sum()
    tm = (tmpl * mask).sum() / n
    tt = (mask * (tmpl - tm) ** 2).sum()
    corr = lambda src, kern: fftconvolve(src, kern[::-1, ::-1], mode="valid")
    im = corr(img, mask)  # sum of the image under the mask, per position
    ii = corr(img * img, mask)
    num = corr(img, (tmpl - tm) * mask)  # sum(M (I - Im)(T - Tm)): the Im term cancels, T - Tm has mean 0 under M
    var = (ii - im * im / n).clip(1e-6, None)
    return num / np.sqrt(var * tt)


def by_template(b: np.ndarray, kind: str, templates: list[dict]) -> tuple[np.ndarray | None, dict]:
    """Place the best-matching template of this kind on the stamped scan."""
    H, W = b.shape[:2]
    g = highpass(b.mean(axis=2))
    x0, y0, x1, y1 = ZONES[kind]
    zx0, zy0, zx1, zy1 = int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)
    zone = g[zy0:zy1, zx0:zx1]
    best = None
    max_area = max((t["mask"].sum() for t in templates), default=1)
    for t in templates:
        for scale in (0.72, 0.8, 0.94, 1.0, 1.06):  # Pokémon Center stamps come in two sizes
            tw, th = max(8, round(t["grey"].shape[1] * scale)), max(8, round(t["grey"].shape[0] * scale))
            if th >= zone.shape[0] or tw >= zone.shape[1]:
                continue
            tg = np.asarray(Image.fromarray(t["grey"]).resize((tw, th), Image.LANCZOS)).astype(np.float32)
            tm = np.asarray(Image.fromarray((t["mask"] * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS)).astype(np.float32) / 255
            ta = np.asarray(Image.fromarray((t["alpha"] * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS)).astype(np.float32) / 255
            ncc = masked_ncc(zone, highpass(tg), tm)
            y, x = np.unravel_index(int(np.argmax(ncc)), ncc.shape)
            score = float(ncc[y, x])
            rank = score * (0.7 + 0.3 * t["mask"].sum() / max_area)
            if best is None or rank > best["rank"]:
                best = {"rank": rank, "score": score, "x": zx0 + x, "y": zy0 + y, "alpha": ta, "from": t["from"], "scale": scale}
    if best is None or best["score"] < MATCH_MIN:
        return None, {"why": f"no template match (best {best['score']:.2f} from {best['from']})" if best else "no template for this kind"}
    alpha = np.zeros((H, W), np.float32)
    ta = best["alpha"]
    alpha[best["y"]:best["y"] + ta.shape[0], best["x"]:best["x"] + ta.shape[1]] = ta
    box = [int(best["x"]), int(best["y"]), ta.shape[1], ta.shape[0]]
    return alpha, {"box": box, "score": round(best["score"], 2), "from": best["from"], "scale": best["scale"]}


def by_box(box: list[int], shape: tuple[int, int], diff: np.ndarray | None, thr: int) -> tuple[np.ndarray, str]:
    """A hand box, refined to the stamp's shape from the scans' difference
    inside it when there is one (the stamp is the strongest difference in
    its own box even when the two scans come from different sources)."""
    H, W = shape
    x, y, w, h = box[:4]
    if diff is not None and len(box) == 4:
        d = diff[y:y + h, x:x + w]
        t = max(thr, 0.5 * (np.percentile(d, 25) + np.percentile(d, 90)))
        binary = ndimage.binary_opening(d > t, iterations=1)
        labels, _ = ndimage.label(binary)
        sizes = ndimage.sum(binary, labels, range(1, labels.max() + 1))
        keep = np.isin(labels, [i + 1 for i, n in enumerate(sizes) if n >= 0.004 * w * h])
        if keep.mean() >= 0.15:
            full = np.zeros((H, W), bool)
            full[y:y + h, x:x + w] = keep
            return feathered(full), f"hand box {box}, shape from the difference ({keep.mean():.0%} of the box)"
    im = Image.new("L", (W, H), 0)
    if len(box) > 4 and box[4] == "ellipse":
        ImageDraw.Draw(im).ellipse([x, y, x + w, y + h], fill=255)
    else:
        ImageDraw.Draw(im).rounded_rectangle([x, y, x + w, y + h], radius=8, fill=255)
    return blur(np.asarray(im).astype(np.float32), 1.0) / 255, f"hand box {box}"


def template_from(b: np.ndarray, alpha: np.ndarray, box: list[int], name: str) -> dict:
    x, y, w, h = box
    pad = 4
    x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(b.shape[1], x + w + pad), min(b.shape[0], y + h + pad)
    a = alpha[y0:y1, x0:x1]
    return {"grey": b[y0:y1, x0:x1].mean(axis=2).astype(np.float32), "mask": (a > 0.5).astype(np.float32), "alpha": a, "from": name}


def floor_alpha(alpha: np.ndarray) -> np.ndarray:
    """Rescale so TCG Live's dark floor becomes fully transparent."""
    return ((alpha - FLOOR) * (255 / (255 - FLOOR))).clip(0, 255)


def window_map(scan: np.ndarray) -> np.ndarray:
    """A foil map for a standard-layout print with no TCG Live map: the art
    window and the outer frame, at the scan's size, as 0..255 alpha. The
    Pokémon stays foil (there is nothing to cut it out with), as it was on
    the window fallback this replaces; the frame is the gain."""
    H, W = scan.shape[:2]
    alpha = np.zeros((H, W), np.float32)
    x0, y0, x1, y1 = int(WINDOW[0] * W), int(WINDOW[1] * H), int(WINDOW[2] * W), int(WINDOW[3] * H)
    alpha[y0:y1, x0:x1] = 255
    fx, fy = int(FRAME[0] * W), int(FRAME[1] * H)
    alpha[:fy, :] = 255
    alpha[H - fy:, :] = 255
    alpha[:, :fx] = 255
    alpha[:, W - fx:] = 255
    return alpha


def knock_out(map_path: Path | None, stamp: np.ndarray, scan: np.ndarray | None = None) -> Image.Image:
    if map_path is None:
        alpha = window_map(scan)
        alpha = np.asarray(Image.fromarray(alpha.astype(np.uint8)).resize((367, 512), Image.LANCZOS)).astype(np.float32)
        m = np.zeros((512, 367, 4), np.float32)
    else:
        m = np.asarray(Image.open(map_path).convert("RGBA")).astype(np.float32)
        alpha = floor_alpha(m[..., 3])
    st = np.asarray(Image.fromarray((stamp * 255).astype(np.uint8)).resize((m.shape[1], m.shape[0]), Image.LANCZOS)).astype(np.float32) / 255
    alpha = alpha * (1 - st)
    white = np.full_like(alpha, 255)
    return Image.fromarray(np.dstack([white, white, white, alpha]).round().astype(np.uint8), "RGBA")


def sheet(rows: list[tuple[str, list[Image.Image]]], dest: Path) -> None:
    w, h = 240, 335
    out = Image.new("RGB", (w * 4, h * len(rows)), "black")
    draw = ImageDraw.Draw(out)
    for r, (label, imgs) in enumerate(rows):
        for c, im in enumerate(imgs[:4]):
            out.paste(im.convert("RGB").resize((w, h)), (c * w, r * h))
        draw.text((4, r * h + 4), label, fill="yellow")
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest)


def load_set(set_id: str):
    path = ROOT / "data" / f"{set_id}.json"
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    records = data if isinstance(data, list) else data.get("cards")
    if not isinstance(records, list) or not records or not isinstance(records[0], dict) or "id" not in records[0]:
        return None
    return {"path": path, "raw": raw, "data": data, "records": records, "by_id": {c["id"]: c for c in records}}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", help="site set id")
    ap.add_argument("--all", action="store_true", help="every data/<set>.json")
    ap.add_argument("--only", default="", help="comma-separated card numbers")
    ap.add_argument("--thr", type=int, default=44, help="difference threshold, 0-255")
    ap.add_argument("--min-fill", type=float, default=0.22, help="a blob must fill this share of its box")
    ap.add_argument("--debug", action="store_true", help="write contact sheets to scripts/_debug/stamps/")
    args = ap.parse_args()
    if args.all:
        set_ids = sorted(p.stem for p in (ROOT / "data").glob("*.json"))
    elif args.set:
        set_ids = [args.set]
    else:
        sys.exit("give --set or --all")
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    boxes = json.loads((HERE / "stamp_boxes.json").read_text(encoding="utf-8")) if (HERE / "stamp_boxes.json").exists() else {}

    sets = {}
    jobs = []
    for set_id in set_ids:
        loaded = load_set(set_id)
        if loaded:
            sets[set_id] = loaded
    for set_id, loaded in sets.items():
        for card in loaded["records"]:
            m = re.fullmatch(r"(.+?)-([a-z-]+)", card["id"])
            if not m or m.group(2) not in SUFFIXES:
                continue
            if only and str(card["number"]) not in only:
                continue
            base = loaded["by_id"].get(m.group(1))
            if not base:
                # A print filed under another set's number (Black Bolt's file
                # carries White Flare's wht020-stamp): the plain print is the
                # card of the same name and number in any loaded set.
                digits = re.sub(r"^[a-z]+0*", "", str(card["number"]).split("-")[0])
                for other in sets.values():
                    base = next((c for c in other["records"] if c.get("name") == card.get("name")
                                 and str(c.get("number")) == digits and not c.get("promo") and c.get("image")), None)
                    if base:
                        break
            jobs.append({"set": set_id, "card": card, "base": base, "kind": m.group(2)})

    # Pass 1: difference on same-source pairs; collect templates.
    templates: dict[str, list[dict]] = {}
    pending = []
    for job in jobs:
        card, base, kind = job["card"], job["base"], job["kind"]
        var_scan = ROOT / card["image"]
        if not var_scan.exists():
            job["skip"] = "stamped scan missing"
            continue
        v_img = Image.open(var_scan).convert("RGB")
        if v_img.size != SCAN:
            v_img = v_img.resize(SCAN, Image.LANCZOS)
        job["b"] = np.asarray(v_img).astype(np.float32)
        base_scan = ROOT / base["image"] if base and base.get("image") else None
        if base_scan and base_scan.exists():
            a_img = Image.open(base_scan).convert("RGB")
            if a_img.size != SCAN:
                a_img = a_img.resize(SCAN, Image.LANCZOS)
            a = np.asarray(a_img).astype(np.float32)
            b = job["b"] * (a.mean() / max(job["b"].mean(), 1))
            alpha, info = by_difference(a, b, kind, args.thr, args.min_fill)
            job["diff"] = info.get("diff")
            if alpha is not None:
                job["alpha"], job["how"] = alpha, f"difference (noise {info['noise']:.1%}, box {info['box']})"
                key = kind if kind in GLOBAL_KINDS else f"{job['set']}:{kind}"
                templates.setdefault(key, []).append(template_from(info["aligned"], alpha, info["box"], card["id"]))
                continue
            job["why"] = info.get("why")
        if card["id"] in boxes:
            key = kind if kind in GLOBAL_KINDS else f"{job['set']}:{kind}"
            job["alpha"], job["how"] = by_box(boxes[card["id"]], SCAN[::-1], job.get("diff"), args.thr)
            templates.setdefault(key, []).append(template_from(job["b"], job["alpha"], boxes[card["id"]][:4], card["id"]))
            continue
        pending.append(job)

    # The Pokémon Center stamp is one logo with "Pokémon Center" lettered
    # beside it; a difference often catches only the ball, so every PC print
    # gets the widest complete detection placed by template instead.
    full = [t for t in templates.get("pc", []) if t["grey"].shape[1] >= 150]
    if full:
        templates["pc"] = [max(full, key=lambda t: t["grey"].shape[1])]
        for job in jobs:
            if job["kind"] == "pc" and "alpha" in job and "box" in job["how"] and "hand" not in job["how"]:
                width = int(job["how"].split("box [")[1].split("]")[0].split(",")[2])
                if width < 150:
                    alpha, info = by_template(job["b"], "pc", templates["pc"])
                    if alpha is not None:
                        job["alpha"], job["how"] = alpha, f"template {info['from']} (score {info['score']}, scale {info['scale']}, box {info['box']}) over a partial difference"

    # Pass 2: templates for the rest.
    for job in pending:
        card, kind = job["card"], job["kind"]
        key = kind if kind in GLOBAL_KINDS else f"{job['set']}:{kind}"
        alpha, info = by_template(job["b"], kind, templates.get(key, []))
        if alpha is not None:
            job["alpha"], job["how"] = alpha, f"template {info['from']} (score {info['score']}, scale {info['scale']}, box {info['box']})"
            continue
        job["skip"] = f"{job.get('why') or ''}; {info['why']}".strip("; ")

    # Write maps and data.
    rows: dict[str, list] = {}
    counts: dict[str, list[int]] = {}
    for job in jobs:
        set_id, card, base = job["set"], job["card"], job["base"]
        counts.setdefault(set_id, [0, 0])
        if "alpha" not in job:
            print(f"  skipped {card['id']}: {job.get('skip', 'no stamp found')}")
            continue
        out = ROOT / "assets" / "foil" / "maps" / set_id / f"{card['number']}.webp"
        rel = str(out.relative_to(ROOT)).replace("\\", "/")
        # The map to cut from: the plain print's, else the print's own TCG Live
        # map (a stamped promo Live carries), else the standard window and frame.
        live = out.with_name(f"{card['number']}.live.webp")
        if base and base.get("foilMap"):
            source = ROOT / base["foilMap"]
        elif card.get("foilMap") and (ROOT / card["foilMap"]).exists():
            # The print's own TCG Live map (a stamped promo Live carries). The
            # original is kept beside the cut one, so a rerun cuts from it.
            if not live.exists():
                live.parent.mkdir(parents=True, exist_ok=True)
                live.write_bytes((ROOT / card["foilMap"]).read_bytes())
            source = live
        elif live.exists():
            source = live
        else:
            source = None
            job["how"] += ", on a drawn window-and-frame map"
        new_map = knock_out(source, job["alpha"], job["b"])
        out.parent.mkdir(parents=True, exist_ok=True)
        new_map.save(out, "WEBP", quality=85, alpha_quality=80, method=6)
        changed = 0
        if card.get("foilMap") != rel:
            card["foilMap"] = rel
            changed += 1
        for field in ("etchMap", "etchAngle", "etchMapH", "etchMapV", "foilMapR", "foilMapG", "foilMapB"):
            if base and base.get(field) and card.get(field) != base[field]:
                card[field] = base[field]
                changed += 1
        counts[set_id][0] += 1
        counts[set_id][1] += changed
        print(f"  {card['id']}: {job['how']}")
        if args.debug:
            diff = job.get("diff")
            d_img = Image.fromarray((diff.clip(0, 255)).astype(np.uint8)) if diff is not None else Image.new("L", SCAN, 0)
            rows.setdefault(set_id, []).append((f"{card['id']} · {job['how'].split(' (')[0]}", [
                Image.fromarray(job["b"].astype(np.uint8)), d_img,
                Image.fromarray((job["alpha"] * 255).astype(np.uint8)), Image.fromarray(np.asarray(new_map)[..., 3])]))
    for set_id, loaded in sets.items():
        after = json.dumps(loaded["data"], ensure_ascii=False, indent=2) + "\n"
        if after != loaded["raw"]:
            loaded["path"].write_text(after, encoding="utf-8", newline="\n")
        if set_id in counts:
            print(f"{set_id}: {counts[set_id][0]} stamped print(s) knocked out, {counts[set_id][1]} field(s) changed")
    if args.debug:
        for set_id, r in rows.items():
            dest = ROOT / "scripts" / "_debug" / "stamps" / f"{set_id}.png"
            sheet(r, dest)
            print(f"  contact sheet -> {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
