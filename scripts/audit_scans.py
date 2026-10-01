#!/usr/bin/env python3
"""Audit every live set's card scans, pack art, product art, symbols and logos.

Noah's rule: no photos with white borders, crooked crops or watermarks, no
wrapper whose name does not match its art. This script measures what can be
measured and writes two Markdown reports with contact sheets so a person can
judge the rest by eye:

    python3 scripts/audit_scans.py                 # everything, reports to --out
    python3 scripts/audit_scans.py --sets sv1,me2  # only some sets
    python3 scripts/audit_scans.py --cards-only    # skip packs/products/symbols
    python3 scripts/audit_scans.py --packs-only
    python3 scripts/audit_scans.py --strict        # exit 1 when anything is flagged

Card scans (assets/cards/<set>/*.webp, every file a data/<set>.json card points
at, "image" only; the -sm file is the same encode at 320 px):
  photo     imageRemote is a JPEG (a TCGplayer listing photo, the fallback source
            when scrydex has no scan). Informational: these must have been through
            `mirror_images.py --photos`, and rim/crooked below checks that held.
  rim       a strip of near-paper white (min channel >= PALE) 2 px to RIM_MAX wide
            along an edge of the card, on at least RIM_FRAC of the sampled lines.
            Cards whose printed border is white are wider than RIM_MAX and not
            flagged; silver borders never reach PALE.
  crooked   the card border's inner edge drifts by more than DRIFT_PCT of the
            width between the top and the bottom (or left and right) of a side,
            fitted with a robust line, on a side where a border is found.
  aspect    width:height not 733:1024 within 0.5%.
  corners   the four corners are not transparent (square cut) or the body has
            transparent holes.
  blurry    the 600 px encode is soft: gradient ratio g(2px)/(2*g(1px)) is near 1
            (smooth) while edge strength is low, relative to the whole run.
  duplicate two different files with the same pixels (dHash) under different ids.
  placeholder  close to the card back, or nearly a flat colour.
  missing   data points at a file that is not on disk.

Pack art: every assets/packs/<set>/* a wrapper in js/catalog.js points at,
plus clean_pack_art.py's opaque check, white rims left along the silhouette
(`white-rim`: the bottom or the sides carry opaque near-white), aspect against
the set's other wrappers, size, png/avif agreement, unreferenced files and,
for people, a dark-background sheet next to the wrapper's card. Name against
art is a human check: the sheet pairs each wrapper with the card its `cardId`
names.

Symbols and logos (assets/cards/sets/<set>-{symbol,logo}.webp): missing,
small (symbols are drawn 192 wide by design, so the check is the mark's own
pixel size), identical files across sets.

The scan metrics are cached with --cache so the report can be rebuilt quickly.
Notes you write by hand go in <out>/scans-notes.md and <out>/pack-art-notes.md
and are included at the top of the matching report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter, defaultdict
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PACKS = ROOT / "assets" / "packs"
PRODUCTS = ROOT / "assets" / "products"
SETS_DIR = ROOT / "assets" / "cards" / "sets"
BACK = ROOT / "assets" / "cards" / "shared" / "card-back.webp"

PALE = 236  # min channel at or above this is paper
RIM_MIN, RIM_MAX_FRAC, RIM_FRAC = 2, 0.035, 0.5
DRIFT_PCT = 1.5
ASPECT = 733 / 1024
BG = (18, 20, 28)
FONT = ImageFont.load_default()


# ---------------------------------------------------------------- scan metrics
def side_lines(rgb: np.ndarray, a: np.ndarray, side: str, n: int = 40):
    """n lines running inward from one edge: (n, K, 3) colours and (n, K) alpha."""
    h, w = a.shape
    k = int(w * 0.07)
    if side in "LR":
        idx = np.linspace(int(h * 0.1), int(h * 0.9), n).astype(int)
        if side == "L":
            return rgb[idx, :k], a[idx, :k]
        return rgb[idx, ::-1][:, :k], a[idx, ::-1][:, :k]
    idx = np.linspace(int(w * 0.1), int(w * 0.9), n).astype(int)
    if side == "T":
        return rgb[:k, idx].transpose(1, 0, 2), a[:k, idx].T
    return rgb[::-1][:k, idx].transpose(1, 0, 2), a[::-1][:k, idx].T


def robust_drift(edge: np.ndarray, cap: float):
    n = len(edge)
    x = np.arange(n, dtype=float)
    e = edge.astype(float)
    ok = e < cap
    if ok.sum() < n * 0.5:
        return None
    for _ in range(3):
        if ok.sum() < n * 0.4:
            return None
        fit = np.polyfit(x[ok], e[ok], 1)
        ok = np.abs(e - np.polyval(fit, x)) < 2.5
    return float(fit[0] * (n - 1)), float(ok.mean())


def dhash(gray: np.ndarray, size: int = 16) -> int:
    img = Image.fromarray(gray.astype(np.uint8)).resize((size + 1, size), Image.BILINEAR)
    px = np.asarray(img).astype(int)
    bits = (px[:, 1:] > px[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def card_metrics(rel: str) -> dict:
    path = ROOT / rel
    out: dict = {"image": rel}
    try:
        raw = path.read_bytes()
        out["md5"] = hashlib.md5(raw).hexdigest()
        im = Image.open(path)
        im.load()
    except Exception as exc:  # noqa: BLE001 - report, never crash a 12k-file run
        out["error"] = str(exc)
        return out
    w, h = im.size
    out["w"], out["h"] = w, h
    out["aspect_err"] = abs(w / h / ASPECT - 1)
    x = np.asarray(im.convert("RGBA")).astype(np.float32)
    rgb, a = x[..., :3], x[..., 3]
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    out["corner_a"] = float(max(a[:2, :2].mean(), a[:2, -2:].mean(), a[-2:, :2].mean(), a[-2:, -2:].mean()))
    out["hole_frac"] = float((a[int(h * 0.05): int(h * 0.95), int(w * 0.05): int(w * 0.95)] < 250).mean())

    rim_w = {}
    rim_frac = {}
    drift = {}
    for s in "LRTB":
        r, al = side_lines(rgb, a, s)
        mn = r.min(axis=2)
        valid = al > 250
        runs, edges = [], []
        lo, hi = int(w * 0.02), int(w * 0.035)
        for i in range(mn.shape[0]):
            v = np.flatnonzero(valid[i])
            if not len(v):
                runs.append(0)
                edges.append(0)
                continue
            st = v[0]
            pale = mn[i, st:] >= PALE
            k = int(np.argmin(pale)) if not pale.all() else len(pale)
            runs.append(k)
            ref = np.median(r[i, lo:hi], axis=0)
            d = np.abs(r[i, st:] - ref).max(axis=1)
            beyond = d[lo:] > 40
            edges.append((int(np.argmax(beyond)) + lo if beyond.any() else len(d)) + st)
        runs = np.array(runs)
        # a paper rim is a thin pale run: wider ones are a printed white border
        thin = (runs >= RIM_MIN) & (runs <= w * RIM_MAX_FRAC)
        rim_frac[s] = float(thin.mean())
        rim_w[s] = float(np.median(runs[thin])) if thin.any() else 0.0
        drift[s] = robust_drift(np.array(edges), w * 0.065)
    out["rim_frac"], out["rim_w"] = rim_frac, rim_w
    out["drift"] = {s: (d[0] if d and d[1] > 0.6 else 0.0) for s, d in drift.items()}

    # sharpness on the interior at full size: smooth (upscaled) images have a 2 px
    # gradient close to twice the 1 px one.
    core = lum[int(h * 0.1): int(h * 0.9), int(w * 0.1): int(w * 0.9)]
    g1 = float(np.abs(np.diff(core, axis=1)).mean() + np.abs(np.diff(core, axis=0)).mean()) / 2
    g2 = float(np.abs(core[:, 2:] - core[:, :-2]).mean() + np.abs(core[2:] - core[:-2]).mean()) / 2
    out["g1"] = g1
    out["smooth"] = g2 / (2 * g1) if g1 > 0 else 1.0
    out["flat_std"] = float(core.std())
    out["dhash"] = dhash(lum)
    return out


# ---------------------------------------------------------------- data
def live_sets(only: set[str] | None) -> list[str]:
    ids = sorted(p.stem for p in (DATA / "sets").glob("*.json"))
    return [s for s in ids if (not only or s in only) and (DATA / f"{s}.json").exists()]


def load_cards(set_id: str) -> list[dict]:
    d = json.loads((DATA / f"{set_id}.json").read_text(encoding="utf-8"))
    return d if isinstance(d, list) else []


def is_photo(card: dict) -> bool:
    remote = (card.get("imageRemote") or "").split("?")[0].lower()
    return remote.endswith((".jpg", ".jpeg"))


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


# ---------------------------------------------------------------- sheets
def label_font():
    return FONT


def thumb_sheet(items: list[tuple[str, str]], out: Path, cols: int = 10, tw: int = 150):
    """items: (image relpath, label). Dark background so white rims show."""
    if not items:
        return
    th = int(tw / ASPECT)
    rows = (len(items) + cols - 1) // cols
    im = Image.new("RGB", (cols * (tw + 8) + 8, rows * (th + 22) + 8), BG)
    d = ImageDraw.Draw(im)
    for i, (rel, label) in enumerate(items):
        x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 22)
        try:
            p = Image.open(ROOT / rel).convert("RGBA").resize((tw, th), Image.LANCZOS)
            im.paste(p, (x, y), p)
        except Exception:  # noqa: BLE001
            d.rectangle((x, y, x + tw, y + th), outline=(200, 40, 40))
        d.text((x, y + th + 4), label[:26], fill=(225, 225, 225), font=FONT)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)


# ---------------------------------------------------------------- scans
def audit_scans(sets: list[str], workers: int, cache: Path | None, thresholds) -> dict:
    files: dict[str, list[tuple[str, str]]] = defaultdict(list)  # rel -> [(set, card id)]
    photo_files: set[str] = set()
    missing, noimage = [], []
    per_set_cards: dict[str, int] = {}
    for s in sets:
        cards = load_cards(s)
        per_set_cards[s] = len(cards)
        for c in cards:
            rel = c.get("image") or ""
            if not rel.startswith("assets/"):
                noimage.append((s, c["id"], rel))
                continue
            if not (ROOT / rel).exists():
                missing.append((s, c["id"], rel))
                continue
            files[rel].append((s, c["id"]))
            if is_photo(c):
                photo_files.add(rel)
    cached = {}
    if cache and cache.exists():
        cached = json.loads(cache.read_text())
    todo = [r for r in files if r not in cached]
    if todo:
        print(f"measuring {len(todo)} scans with {workers} workers ...", flush=True)
        with Pool(workers) as pool:
            for i, m in enumerate(pool.imap(card_metrics, todo, chunksize=40), 1):
                cached[m["image"]] = m
                if i % 1000 == 0:
                    print(f"  {i}/{len(todo)}", flush=True)
        if cache:
            cache.write_text(json.dumps(cached))
    metrics = {r: cached[r] for r in files}

    # back and flat references
    back_hash = None
    if BACK.exists():
        back_hash = card_metrics(str(BACK.relative_to(ROOT)))["dhash"]

    flags: dict[str, dict[str, tuple[float, str]]] = defaultdict(dict)  # class -> rel -> (severity, note)
    smooth_vals = np.array([m["smooth"] for m in metrics.values() if "smooth" in m])
    g1_vals = np.array([m["g1"] for m in metrics.values() if "g1" in m])
    smooth_cut = float(np.percentile(smooth_vals, 99)) if len(smooth_vals) else 1.0
    g1_cut = float(np.percentile(g1_vals, 3)) if len(g1_vals) else 0.0
    by_hash: dict[int, list[str]] = defaultdict(list)
    by_md5: dict[str, list[str]] = defaultdict(list)
    for rel, m in metrics.items():
        if "error" in m:
            flags["unreadable"][rel] = (1.0, m["error"])
            continue
        if m["aspect_err"] > 0.005:
            flags["aspect"][rel] = (m["aspect_err"], f"{m['w']}x{m['h']}")
        if m["corner_a"] > 20 or m["hole_frac"] > 0.002:
            flags["corners"][rel] = (max(m["corner_a"] / 255, m["hole_frac"]), f"corner alpha {m['corner_a']:.0f}, holes {m['hole_frac']:.3f}")
        rims = {s: f for s, f in m["rim_frac"].items() if f >= RIM_FRAC}
        if rims:
            wid = max(m["rim_w"][s] for s in rims)
            flags["rim"][rel] = (wid * len(rims), "sides " + ",".join(sorted(rims)) + f" ~{wid:.0f}px")
        dr = {s: d for s, d in m["drift"].items() if abs(d) > m["w"] * DRIFT_PCT / 100}
        if dr:
            flags["crooked"][rel] = (max(abs(d) for d in dr.values()) / m["w"] * 100, ", ".join(f"{s}{d:+.0f}px" for s, d in sorted(dr.items())))
        if m["smooth"] >= smooth_cut and m["g1"] <= g1_cut * 2.0:
            flags["blurry"][rel] = (m["smooth"], f"smooth {m['smooth']:.3f} g1 {m['g1']:.1f}")
        if back_hash is not None and hamming(m["dhash"], back_hash) <= 6 or m["flat_std"] < 12:
            flags["placeholder"][rel] = (1.0, f"std {m['flat_std']:.1f}")
        by_hash[m["dhash"]].append(rel)
        by_md5[m["md5"]].append(rel)
    for grp in list(by_md5.values()) + list(by_hash.values()):
        if len(grp) > 1:
            for rel in grp:
                others = [o for o in grp if o != rel]
                flags["duplicate"][rel] = (len(grp), "same pixels as " + ", ".join(others[:3]))
    for rel in photo_files:
        flags["photo"][rel] = (1.0, "TCGplayer/JPEG source")
    return dict(files=files, metrics=metrics, flags=flags, missing=missing, noimage=noimage,
                per_set_cards=per_set_cards, photo_files=photo_files,
                smooth_cut=smooth_cut, g1_cut=g1_cut)


CLASSES = ["missing", "unreadable", "aspect", "corners", "rim", "crooked", "blurry", "placeholder", "duplicate", "photo"]


def card_label(res, rel):
    s, cid = res["files"][rel][0]
    return cid


def write_scans_report(res: dict, sets: list[str], out: Path, notes: str) -> int:
    flags, files = res["flags"], res["files"]
    lines = ["# Card scan audit", "", f"Generated by `scripts/audit_scans.py`. {len(files)} distinct scan files across {len(sets)} live sets.", ""]
    if notes:
        lines += ["## Reviewer notes", "", notes.strip(), ""]
    lines += ["## Totals", "", "| class | files |", "|---|---|"]
    lines.append(f"| missing file | {len(res['missing'])} |")
    for c in CLASSES[1:]:
        lines.append(f"| {c} | {len(flags[c])} |")
    lines += ["", f"Thresholds: PALE {PALE}, rim {RIM_MIN}px to {RIM_MAX_FRAC*100:.1f}% of width on >= {RIM_FRAC:.0%} of lines, "
              f"drift {DRIFT_PCT}% of width, blur cut smooth >= {res['smooth_cut']:.3f} and g1 <= {res['g1_cut']*2:.1f}.", ""]
    # per set table
    lines += ["## Per set", "", "| set | cards | files | " + " | ".join(CLASSES[1:]) + " | missing |", "|---|---|---|" + "---|" * len(CLASSES)]
    per = {s: Counter() for s in sets}
    nfiles = Counter()
    for rel, owners in files.items():
        for s in {o[0] for o in owners}:
            nfiles[s] += 1
            for c in CLASSES[1:]:
                if rel in flags[c]:
                    per[s][c] += 1
    miss = Counter(m[0] for m in res["missing"])
    for s in sets:
        lines.append(f"| {s} | {res['per_set_cards'][s]} | {nfiles[s]} | " + " | ".join(str(per[s][c] or "") for c in CLASSES[1:]) + f" | {miss[s] or ''} |")
    # worst 20 per class
    sheets = out / "sheets"
    for c in CLASSES[1:]:
        items = sorted(flags[c].items(), key=lambda kv: -kv[1][0])
        if not items:
            continue
        lines += ["", f"## {c} (worst 20 of {len(items)})", "", "| card | file | detail |", "|---|---|---|"]
        for rel, (sev, note) in items[:20]:
            lines.append(f"| {card_label(res, rel)} | `{rel}` | {note} |")
        thumb_sheet([(rel, card_label(res, rel)) for rel, _ in items[:60]], sheets / f"scans-{c}.png")
        lines.append(f"\nContact sheet: `sheets/scans-{c}.png` (worst {min(60, len(items))}).")
    if res["missing"]:
        lines += ["", "## missing files", ""]
        lines += [f"- {s} {cid}: `{rel}`" for s, cid, rel in res["missing"][:40]]
    if res["noimage"]:
        lines += ["", f"## cards with no local image path ({len(res['noimage'])})", ""]
        lines += [f"- {s} {cid}: `{rel}`" for s, cid, rel in res["noimage"][:20]]
    # first / holo / last eyeball sheets
    eye = []
    for s in sets:
        cards = [c for c in load_cards(s) if (ROOT / (c.get("image") or "x")).exists()]
        if not cards:
            continue
        pick = [cards[0]]
        holo = next((c for c in cards if "holo" in (c.get("rarity") or "").lower() or "ultra" in (c.get("rarity") or "").lower() or "illustration" in (c.get("rarity") or "").lower()), cards[len(cards) // 2])
        pick += [holo, cards[-1]]
        eye += [(c["image"], c["id"]) for c in pick]
    for i in range(0, len(eye), 90):
        thumb_sheet(eye[i: i + 90], sheets / f"scans-eyeball-{i // 90 + 1}.png", cols=15, tw=110)
    lines += ["", "## Eyeball sheets", "", "First card, a holo/ultra rare and the last card of every set on the dark site background: "
              + ", ".join(f"`sheets/scans-eyeball-{i + 1}.png`" for i in range((len(eye) + 89) // 90)) + "."]
    (out / "scans-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return sum(len(flags[c]) for c in CLASSES[1:] if c not in ("photo", "duplicate")) + len(res["missing"])


# ---------------------------------------------------------------- packs
def node_catalog() -> list[dict]:
    js = ("import('./js/catalog.js').then(m=>{const out=[];for(const s of m.ALL_SETS){const ws=[...(s.wrappers||[])];"
          "for(const [k,v] of Object.entries(s.specialPacks||{})) if(v.wrapper) ws.push({...v.wrapper,special:k});"
          "out.push({id:s.id,name:s.name,wr:ws.map(w=>({id:w.id,name:w.name,cardId:w.cardId||null,art:w.art,fb:w.artFallback}))})}"
          "console.log(JSON.stringify(out))})")
    res = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def pack_metrics(path: Path) -> dict:
    from scipy import ndimage as ndi

    im = Image.open(path)
    im.load()
    w, h = im.size
    x = np.asarray(im.convert("RGBA")).astype(np.float32)
    a, rgb = x[..., 3] / 255, x[..., :3]
    solid = a > 0.5
    ys, xs = np.nonzero(solid)
    m = {"w": w, "h": h, "aspect": w / h, "fill": float(solid.mean())}
    if not len(xs):
        m["empty"] = True
        return m
    # bottom band: opaque white across the last rows of the silhouette
    y1 = int(ys.max())
    band = slice(max(0, y1 - int(h * 0.03)), y1 + 1)
    white = rgb.min(axis=2) >= 240
    m["white_bottom"] = float((white[band] & solid[band]).sum() / max(1, solid[band].sum()))
    # side rims: from the first opaque pixel of each row, the run of near-white
    runs = []
    for yy in range(int(h * 0.15), int(h * 0.85), 3):
        row = np.flatnonzero(solid[yy])
        if not len(row):
            continue
        for xx, step in ((row[0], 1), (row[-1], -1)):
            k = 0
            while 0 <= xx + step * k < w and solid[yy, xx + step * k] and white[yy, xx + step * k] and k < 40:
                k += 1
            runs.append(k)
    runs = np.array(runs)
    m["white_side"] = float((runs >= 3).mean()) if len(runs) else 0.0
    m["white_side_w"] = float(np.median(runs[runs >= 3])) if (runs >= 3).any() else 0.0
    er = ndi.binary_erosion(solid, iterations=2)
    edge = solid & ~er
    m["white_edge"] = float((edge & white).sum() / max(1, edge.sum()))
    m["margin_opaque"] = float(solid[int(h * 0.3): int(h * 0.7), :3].mean())
    return m


def audit_packs(sets: list[str], out: Path, notes: str) -> int:
    catalog = [s for s in node_catalog() if s["id"] in sets or not sets]
    refs: dict[str, tuple[str, dict]] = {}
    for s in catalog:
        for w in s["wr"]:
            for k in ("art", "fb"):
                if w[k]:
                    refs[w[k]] = (s["id"], w)
    flagged: list[tuple[str, str, str]] = []
    rows = []
    set_aspects: dict[str, list[float]] = defaultdict(list)
    pm: dict[str, dict] = {}
    for rel, (sid, w) in sorted(refs.items()):
        p = ROOT / rel
        if not p.exists():
            flagged.append((sid, rel, "missing file"))
            continue
        if rel.endswith(".avif"):
            pm[rel] = pack_metrics(p)
            set_aspects[sid].append(pm[rel]["aspect"])
    for rel, m in pm.items():
        sid, w = refs[rel]
        notes_l = []
        if m.get("empty"):
            notes_l.append("empty alpha")
        if m.get("margin_opaque", 0) > 0.9:
            notes_l.append("opaque side margins (run clean_pack_art.py)")
        if m.get("white_bottom", 0) > 0.35:
            notes_l.append(f"white-rim bottom {m['white_bottom']:.0%}")
        if m.get("white_side", 0) > 0.4:
            notes_l.append(f"white-rim sides {m['white_side']:.0%} ~{m['white_side_w']:.0f}px")
        med = float(np.median(set_aspects[sid]))
        if len(set_aspects[sid]) > 1 and abs(m["aspect"] / med - 1) > 0.03:
            notes_l.append(f"aspect {m['aspect']:.3f} vs set median {med:.3f}")
        if m["w"] < 300:
            notes_l.append(f"small {m['w']}px")
        # png fallback agreement
        fb = w["fb"]
        if fb and (ROOT / fb).exists() and rel.endswith(".avif"):
            pim = Image.open(ROOT / fb)
            if pim.size != (m["w"], m["h"]):
                notes_l.append(f"png size {pim.size} differs from avif")
        elif fb and not (ROOT / fb).exists():
            notes_l.append("png fallback missing")
        if notes_l:
            flagged.append((sid, rel, "; ".join(notes_l)))
        rows.append((sid, w, rel, m))
    # unreferenced files
    referenced = set(refs)
    unref = sorted(str(p.relative_to(ROOT)) for p in PACKS.glob("*/*") if p.is_file() and str(p.relative_to(ROOT)) not in referenced)
    # identical art across wrappers of one set
    dupes = []
    seen: dict[str, str] = {}
    for rel in pm:
        digest = hashlib.md5((ROOT / rel).read_bytes()).hexdigest()
        if digest in seen:
            dupes.append((seen[digest], rel))
        seen[digest] = rel
    opaque = subprocess.run([sys.executable, str(ROOT / "scripts" / "clean_pack_art.py"), "--check"], cwd=ROOT, capture_output=True, text=True)

    lines = ["# Pack and product art audit", "", f"Generated by `scripts/audit_scans.py`. {len(pm)} wrapper files in {len(catalog)} sets, rendered on the dark site background.", ""]
    if notes:
        lines += ["## Reviewer notes", "", notes.strip(), ""]
    lines += ["## clean_pack_art.py --check", "", "```", (opaque.stdout + opaque.stderr).strip() or "(no output)", "```", ""]
    lines += ["## Flagged wrappers", "", "| set | file | finding |", "|---|---|---|"]
    lines += [f"| {s} | `{r}` | {n} |" for s, r, n in flagged] or ["| | none | |"]
    lines += ["", "## Unreferenced files in assets/packs", ""] + ([f"- `{u}`" for u in unref] or ["none"])
    lines += ["", "## Identical art across wrappers", ""] + ([f"- `{a}` = `{b}`" for a, b in dupes] or ["none"])

    # wrapper/card pair sheets: wrapper beside the card its cardId names
    cards = {}
    for s in sets:
        for c in load_cards(s):
            cards[c["id"]] = c
    pairs = []
    for s in catalog:
        for w in s["wr"]:
            c = cards.get(w["cardId"] or "")
            pairs.append((s["id"], w, c["image"] if c and (ROOT / c["image"]).exists() else None))
    per = 20
    for pi in range(0, len(pairs), per):
        chunk = pairs[pi: pi + per]
        cols, tw, th = 5, 118, 216
        cw = tw + 6 + 150
        rowsn = (len(chunk) + cols - 1) // cols
        im = Image.new("RGB", (cols * (cw + 10) + 10, rowsn * (th + 34) + 10), BG)
        d = ImageDraw.Draw(im)
        for i, (sid, w, card) in enumerate(chunk):
            x, y = 10 + (i % cols) * (cw + 10), 10 + (i // cols) * (th + 34)
            try:
                p = Image.open(ROOT / w["art"]).convert("RGBA")
                p.thumbnail((tw, th))
                im.paste(p, (x, y), p)
            except Exception:  # noqa: BLE001
                d.rectangle((x, y, x + tw, y + th), outline=(200, 40, 40))
            if card:
                c = Image.open(ROOT / card).convert("RGBA")
                c.thumbnail((150, th))
                im.paste(c, (x + tw + 6, y), c)
            d.text((x, y + th + 4), f"{sid}/{w['id']}"[:34], fill=(225, 225, 225), font=FONT)
            d.text((x, y + th + 16), f"\"{(w['name'] or '')[:30]}\" {w['cardId'] or '-'}", fill=(255, 220, 120), font=FONT)
        im.save(out / "sheets" / f"packs-{pi // per + 1}.png", optimize=True)
    lines += ["", "## Contact sheets", "", "Each cell is the wrapper on the dark background, the card its `cardId` names beside it, then the wrapper id and display name. "
              "Compare the Pokémon on the art with the name: " + ", ".join(f"`sheets/packs-{i + 1}.png`" for i in range((len(pairs) + per - 1) // per)) + "."]

    # products
    plines = audit_products(out, sets)
    lines += [""] + plines
    (out / "pack-art-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(flagged) + len(unref) + len(dupes) + (1 if opaque.returncode else 0)


def audit_products(out: Path, sets: list[str]) -> list[str]:
    """assets/products/<set>/*.webp: size, alpha, white edge. Sheets by set."""
    rows = []
    for p in sorted(PRODUCTS.glob("*/*.webp")):
        if sets and p.parent.name not in sets and p.parent.name not in {"mep"}:
            continue
        im = Image.open(p)
        x = np.asarray(im.convert("RGBA")).astype(np.float32)
        a = x[..., 3] / 255
        white = (x[..., :3].min(axis=2) >= 240) & (a > 0.5)
        h, w = a.shape
        ring = np.zeros_like(a, bool)
        ring[:4], ring[-4:], ring[:, :4], ring[:, -4:] = True, True, True, True
        rows.append(dict(f=str(p.relative_to(ROOT)), w=w, h=h, mode=im.mode, opaque=float(a.min()) > 0.99,
                         white_ring=float((white & ring & (a > 0.5)).sum() / max(1, ((a > 0.5) & ring).sum())), small=w < 200 or h < 200))
    bad_opaque = [r for r in rows if r["opaque"]]
    bad_white = [r for r in rows if r["white_ring"] > 0.25 and not r["opaque"]]
    small = [r for r in rows if r["small"]]
    lines = ["## Product art (assets/products)", "", f"{len(rows)} files. Fully opaque (no cut-out): {len(bad_opaque)}. White ring on a cut-out: {len(bad_white)}. Under 200 px: {len(small)}.", ""]
    for title, grp in (("Fully opaque", bad_opaque), ("White ring on the cut-out edge", bad_white), ("Under 200 px", small)):
        if grp:
            lines += [f"### {title}", ""] + [f"- `{r['f']}` {r['w']}x{r['h']} ring {r['white_ring']:.0%}" for r in grp[:40]] + [""]
    # sheets: the flagged ones, dark background
    flagged = sorted({r["f"] for r in bad_opaque + bad_white + small})
    if flagged:
        tw, th, cols = 150, 150, 8
        rowsn = (len(flagged) + cols - 1) // cols
        im = Image.new("RGB", (cols * (tw + 8) + 8, rowsn * (th + 22) + 8), BG)
        d = ImageDraw.Draw(im)
        for i, f in enumerate(flagged):
            x, y = 8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 22)
            p = Image.open(ROOT / f).convert("RGBA")
            p.thumbnail((tw, th))
            im.paste(p, (x, y), p)
            d.text((x, y + th + 4), "/".join(f.split("/")[-2:])[:26], fill=(225, 225, 225), font=FONT)
        im.save(out / "sheets" / "products-flagged.png", optimize=True)
        lines.append("Contact sheet of the flagged ones: `sheets/products-flagged.png`.")
    return lines


# ---------------------------------------------------------------- symbols
def audit_symbols(sets: list[str], out: Path) -> tuple[list[str], int]:
    problems = []
    digest: dict[str, list[str]] = defaultdict(list)
    table = []
    for s in sets:
        for kind in ("symbol", "logo"):
            p = SETS_DIR / f"{s}-{kind}.webp"
            if not p.exists():
                problems.append(f"{s} {kind}: missing")
                continue
            digest[hashlib.md5(p.read_bytes()).hexdigest()].append(p.name)
            im = Image.open(p).convert("RGBA")
            bbox = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
            mw = (bbox[2] - bbox[0]) if bbox else 0
            mh = (bbox[3] - bbox[1]) if bbox else 0
            table.append((s, kind, im.size, (mw, mh), p.stat().st_size))
            if kind == "symbol" and min(mw, mh) < 60:
                problems.append(f"{s} symbol: mark is {mw}x{mh}px inside {im.width}x{im.height}, soft when drawn large")
            if kind == "logo" and mw < 250:
                problems.append(f"{s} logo: mark is {mw}x{mh}px (under 250 wide)")
            if not bbox:
                problems.append(f"{s} {kind}: empty image")
    dup = [g for g in digest.values() if len(g) > 1]
    lines = ["## Set symbols and logos (assets/cards/sets)", "", f"{len(table)} files for {len(sets)} sets.", ""]
    lines += ["| finding |", "|---|"] + [f"| {p} |" for p in problems] if problems else ["No missing or tiny marks."]
    lines += ["", "Identical files across sets (by design for shared logos, a problem for symbols):", ""]
    lines += [f"- {', '.join(g)}" for g in dup] or ["- none"]
    # sheets
    for kind, tw, th, cols in (("logo", 230, 100, 8), ("symbol", 110, 110, 12)):
        rowsn = (len(sets) + cols - 1) // cols
        im = Image.new("RGB", (cols * (tw + 10) + 10, rowsn * (th + 24) + 10), BG)
        d = ImageDraw.Draw(im)
        for i, s in enumerate(sets):
            p = SETS_DIR / f"{s}-{kind}.webp"
            x, y = 10 + (i % cols) * (tw + 10), 10 + (i // cols) * (th + 24)
            if p.exists():
                q = Image.open(p).convert("RGBA")
                sc = min(tw / q.width, th / q.height, 1.0)  # never upscale: shows the real softness
                q = q.resize((max(1, int(q.width * sc)), max(1, int(q.height * sc))))
                im.paste(q, (x + (tw - q.width) // 2, y + (th - q.height) // 2), q)
                d.text((x, y + th + 4), f"{s} {Image.open(p).size}", fill=(225, 225, 225), font=FONT)
        im.save(out / "sheets" / f"{kind}s.png", optimize=True)
    lines += ["", "Sheets (never upscaled): `sheets/logos.png`, `sheets/symbols.png`."]
    return lines, len(problems)


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sets", help="comma list of set ids (default every data/sets/*.json)")
    ap.add_argument("--out", default="/mnt/project-files/every-era/audit", help="report directory")
    ap.add_argument("--cache", help="JSON cache of per-scan metrics")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--cards-only", action="store_true")
    ap.add_argument("--packs-only", action="store_true")
    ap.add_argument("--strict", action="store_true", help="exit 1 when anything but photo/duplicate informational classes is flagged")
    args = ap.parse_args()
    out = Path(args.out)
    (out / "sheets").mkdir(parents=True, exist_ok=True)
    only = set(args.sets.split(",")) if args.sets else None
    sets = live_sets(only)
    bad = 0
    if not args.packs_only:
        res = audit_scans(sets, args.workers, Path(args.cache) if args.cache else None, None)
        notes = (out / "scans-notes.md").read_text() if (out / "scans-notes.md").exists() else ""
        n = write_scans_report(res, sets, out, notes)
        print("card findings:", {c: len(res["flags"][c]) for c in CLASSES[1:]}, "missing", len(res["missing"]))
        bad += n
    if not args.cards_only:
        notes = (out / "pack-art-notes.md").read_text() if (out / "pack-art-notes.md").exists() else ""
        n = audit_packs(sets, out, notes)
        sym_lines, sn = audit_symbols(sets, out)
        rp = out / "pack-art-report.md"
        rp.write_text(rp.read_text() + "\n" + "\n".join(sym_lines) + "\n", encoding="utf-8")
        print("pack findings:", n, "symbol findings:", sn)
        bad += n + sn
    return 1 if args.strict and bad else 0


if __name__ == "__main__":
    sys.exit(main())
