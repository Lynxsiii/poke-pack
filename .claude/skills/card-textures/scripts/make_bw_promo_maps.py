#!/usr/bin/env python3
"""Drawn foil maps for the Black & White promos and reprints TCG Live has no map for (bwp 029-031, 033, 100,
the theme-deck Cracked Ice and box Cosmos reprints, the Trainer Kit holos). New files only (assets are cached for a
year): an existing file is kept and named; `--force` writes a `-v2`, `-v3`... file instead.

    python3 .claude/skills/card-textures/scripts/make_bw_promo_maps.py [--only bw2-40-cracked-ice,...] [--preview DIR] [--write-data]

Why drawn, and what each family is (photos and sources: texture-refs/promo-maps/SOURCES.txt, finish-sheets/promo-maps/):

- **Cracked Ice reprints** (bw2-40, bw2-62, bw3-12, bw3-80 and the three bw1 theme-deck prints): the set card is a plain
  Rare, so there is no TCG Live map to borrow, and the print is not the Tinsel holo's anyway. Pokumon's flat scans of the real
  prints (Accelgor, Escavalier, Krookodile, Scolipede, Emboar: EN_S398, S406, S392, S387, S357) show the facets over the whole
  art window INCLUDING the Pokémon (the body of Accelgor and Escavalier is faceted), while the frame, name bar and text stay
  plain. So the map is the window of the evolution frame (the p95 of every Live Stage map's foil, the evolution circle's notch
  included) at Live's strength (0.8, what an inked art background gets), no Pokémon cut out: `bw-promo/window-evo-v1.webp`.
  The three bw1 Cracked Ice prints used the set holo's map, whose Pokémon is matte; the area does not match, so they take this one.
- **Cosmos / Tinsel reprints and promos on a Pokémon frame** (Snivy, Tepig, Oshawott boxes, Riolu BW33, the Zoroark and Excadrill
  Trainer Kit holos): TCG Live's maps of every BW cosmos and tinsel promo (bwp001-027, bwp034 ...) have the Pokémon matte and the
  window at about 0.8, so each print gets the same: GrabCut inside the window cuts the Pokémon out, the window stays at 0.8.
  `HINTS` steers it where the art defeats it.
- **Victory Cup (BW29-31) and N (BW100)** are the Trainer prints whose foil is the BODY of the card: the Pokumon scans and a
  hand-held photo of the 2013 Victory Cup show a horizontally brushed foil over the grey text panel (and, on the Victory Cup,
  the art window and cup); N's League print leaves the art window plain. The maps foil the panel at 0.55 and the Victory Cup's
  window at 0.8, never the lettering, the placement text, the foot rule or the Battle Road stamp (`HOLES`, card pixels).

Maps are 367 x 512 white webps whose alpha is the foil, like TCG Live's (`has-foil-map`).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

cv2.setNumThreads(1)
ROOT = Path(__file__).resolve().parents[4]
W, H = 600, 838
MW, MH = 367, 512
WIN_ALPHA = 0.80   # an inked art background in a TCG Live BW map (measured: 0.80 over 74 Stage maps)
PANEL_ALPHA = 0.55

# Card pixels (600 x 838): art window and panel boxes of the Trainer frame, measured on the scans.
TRAINER = {
    # window x0, y0, x1, y1; panel x0, y0, x1, y1 (the grey text panel under it)
    "bwp029": {"win": (46, 124, 554, 428), "panel": (20, 434, 580, 734)},
    "bwp030": {"win": (46, 124, 554, 428), "panel": (20, 434, 580, 734)},
    "bwp031": {"win": (46, 124, 554, 428), "panel": (20, 434, 580, 734)},
    "bwp100": {"win": None, "panel": (22, 436, 578, 712)},
}
# Where the foil must not go: rules text, placement line, the Battle Road stamp (an ellipse), card pixels [x0, y0, x1, y1, shape].
HOLES = {
    "bwp029": [[56, 536, 548, 650, "box"], [56, 688, 250, 734, "box"], [392, 612, 566, 800, "ellipse"]],
    "bwp030": [[56, 536, 548, 650, "box"], [56, 688, 250, 734, "box"], [392, 612, 566, 800, "ellipse"]],
    "bwp031": [[56, 536, 548, 650, "box"], [56, 688, 250, 734, "box"], [392, 612, 566, 800, "ellipse"]],
    "bwp100": [[66, 526, 548, 630, "box"]],
}

# id -> (set folder, scan relative to assets/cards, output stem, frame). frame: "evo" cracked-ice window with the Pokémon,
# "poke-evo" / "poke-basic" window with the Pokémon cut out, "trainer" the hand boxes above.
CARDS = {
    "bw2-bw1-1-cosmos": ("bw2", "bw1/1", "bw1-1-cosmos", "poke-basic"),
    "bw2-bw1-15-cosmos": ("bw2", "bw1/15", "bw1-15-cosmos", "poke-basic"),
    "bw2-bw1-27-cosmos": ("bw2", "bw1/27", "bw1-27-cosmos", "poke-basic"),
    "bw4-bwp033": ("bw4", "bw4/bwp033", "bwp033", "poke-basic"),
    "bwtk5a-30": ("bwtk5a", "bwtk5a/30", "30", "poke-evo"),
    "bwtk5b-30": ("bwtk5b", "bwtk5b/30", "30", "poke-evo"),
    "bwp-bwp029": ("bwp", "bwp/bwp029", "bwp029", "trainer"),
    "bwp-bwp030": ("bwp", "bwp/bwp030", "bwp030", "trainer"),
    "bwp-bwp031": ("bwp", "bwp/bwp031", "bwp031", "trainer"),
    "bwp-bwp100": ("bwp", "bwp/bwp100", "bwp100", "trainer"),
}
# Dragon Vault's stamped Mirror Holo promos (dv1-<n>-dvstamp): the plain card's Live map (window, Pokémon matte) with the
# DRAGON VAULT wordmark printed in the window cut out. Box on the 600 x 838 scan (x, y, w, h), measured on the five photos.
DV_STAMP = (50, 346, 252, 70)
DV_CARDS = ["9", "10", "11", "16", "17"]
# The Cracked Ice reprints share one window map (no Pokémon cut out).
CRACKED = ["bw1-5-cracked-ice", "bw1-19-cracked-ice", "bw1-31-cracked-ice", "bw2-40-cracked-ice", "bw2-62-cracked-ice",
           "bw3-12-cracked-ice", "bw3-80-cracked-ice"]
SHARED = "assets/foil/bw-promo/window-evo-v1.webp"

# GrabCut steering, card pixels: bgpoly / fgpoly lists of polygons, fg / bg dabs [x, y, r], box (nothing outside is Pokémon).
HINTS: dict[str, dict] = {}
_hint_file = Path(__file__).with_name("make_bw_promo_hints.json")
if _hint_file.exists():
    HINTS = json.load(open(_hint_file))


def records():
    out = {}
    for f in sorted((ROOT / "data").glob("bw*.json")) + [ROOT / "data" / "dv1.json"]:
        d = json.load(open(f, encoding="utf-8"))
        for c in d["cards"] if isinstance(d, dict) else d:
            out[c["id"]] = (f, c)
    return out


def live_window(stage: bool) -> np.ndarray:
    """The art window of the BW Pokémon frame, bool at 367 x 512: where any Live holo map of a Basic or Stage card is
    foil in the 95th percentile (the Pokémon is matte on each, the background is not, so the p95 is the window)."""
    maps = []
    for f in sorted((ROOT / "data").glob("bw*.json")) + [ROOT / "data" / "dv1.json"]:
        d = json.load(open(f, encoding="utf-8"))
        for c in d["cards"] if isinstance(d, dict) else d:
            p = c.get("foilMap")
            subs = [s.lower() for s in c.get("subtypes", [])]
            if not p or c.get("supertype") != "Pokémon" or "ex" in subs or c.get("rc") or c.get("rarity") not in ("Rare Holo", "Promo"):
                continue
            if c.get("variant") or str(c["id"]).endswith("cracked-ice"):
                continue
            is_stage = any(s.startswith("stage") for s in subs)
            if is_stage != stage or not (ROOT / p).exists():
                continue
            im = Image.open(ROOT / p).convert("RGBA")
            if im.size != (MW, MH):
                im = im.resize((MW, MH), Image.LANCZOS)
            maps.append(np.asarray(im)[..., 3] / 255.0)
    if len(maps) < 20:
        sys.exit(f"only {len(maps)} Live maps found (is assets/foil/maps checked out?)")
    win = np.percentile(np.array(maps), 95, axis=0) > 0.45
    win = ndi.binary_opening(win, iterations=2)
    lab, n = ndi.label(win)
    win = lab == (np.argmax(ndi.sum(win, lab, range(1, n + 1))) + 1)
    return ndi.binary_fill_holes(win)


def feather(mask: np.ndarray, sigma: float) -> np.ndarray:
    return np.clip(ndi.gaussian_filter(mask.astype(np.float32), sigma), 0, 1)


def up(win367: np.ndarray) -> np.ndarray:
    return np.asarray(Image.fromarray((win367 * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)) > 127


def segment(rgb: np.ndarray, win: np.ndarray, hint: dict) -> np.ndarray:
    """GrabCut inside the window's bounding box; bool at 600 x 838."""
    ys, xs = np.where(win)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    h, w = crop.shape[:2]
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]
    inside = np.ones((h, w), bool)
    if "box" in hint:
        bx0, by0, bx1, by1 = hint["box"]
        inside = (xx + x0 >= bx0) & (xx + x0 < bx1) & (yy + y0 >= by0) & (yy + y0 < by1)
    ell = (((xx - w * 0.5) / (w * 0.40)) ** 2 + ((yy - h * 0.52) / (h * 0.42)) ** 2) < 1
    core = (((xx - w * 0.5) / (w * 0.14)) ** 2 + ((yy - h * 0.52) / (h * 0.16)) ** 2) < 1
    m[ell & inside] = cv2.GC_PR_FGD
    if "fg" not in hint and "fgpoly" not in hint:
        m[core & inside] = cv2.GC_FGD
    m[~inside] = cv2.GC_BGD
    b = 3
    m[:b, :] = m[-b:, :] = cv2.GC_BGD
    m[:, :b] = m[:, -b:] = cv2.GC_BGD
    for k, v in (("bg", cv2.GC_BGD), ("fg", cv2.GC_FGD)):
        for (px, py, r) in hint.get(k, []):
            cv2.circle(m, (int(px - x0), int(py - y0)), int(r), int(v), -1)
    for k, v in (("bgpoly", cv2.GC_BGD), ("fgpoly", cv2.GC_FGD)):
        for poly in hint.get(k, []):
            cv2.fillPoly(m, [np.array([[px - x0, py - y0] for px, py in poly], np.int32)], int(v))
    cv2.setRNGSeed(7)  # fixed k-means seeding: a redraw gives the same silhouette
    cv2.grabCut(crop, m, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    sil = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)) & inside
    full = np.zeros((H, W), bool)
    full[y0:y1, x0:x1] = sil
    return full


def clean(sil: np.ndarray, win: np.ndarray) -> np.ndarray:
    sil = ndi.binary_opening(sil, iterations=1)
    lab, n = ndi.label(sil)
    if n:
        sizes = ndi.sum(sil, lab, range(1, n + 1))
        sil = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(200, 0.04 * sizes.max())])
    sil = ndi.binary_closing(sil, structure=np.ones((3, 3)), iterations=3)
    holes = ndi.binary_fill_holes(sil) & ~sil
    lab, n = ndi.label(holes)
    for i in range(1, n + 1):
        if (lab == i).sum() < 0.012 * win.sum():
            sil |= lab == i
    return ndi.binary_dilation(sil, iterations=2)  # the Pokémon's dark outline belongs to it


def shape_mask(box, kind) -> np.ndarray:
    x0, y0, x1, y1 = box
    yy, xx = np.mgrid[0:H, 0:W]
    if kind == "ellipse":
        return (((xx - (x0 + x1) / 2) / ((x1 - x0) / 2)) ** 2 + ((yy - (y0 + y1) / 2) / ((y1 - y0) / 2)) ** 2) <= 1
    return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)


def pokemon_map(cid: str, scan: str, stage: bool) -> tuple[np.ndarray, float, np.ndarray, np.ndarray]:
    im = Image.open(ROOT / "assets" / "cards" / f"{scan}.webp").convert("RGBA")
    bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
    rgb = np.array(Image.alpha_composite(bg, im).convert("RGB").resize((W, H)))
    win = up(live_window(stage))
    sil = clean(segment(rgb, win, HINTS.get(cid, {})), win)
    frac = float(sil[win].mean())
    a = feather(win, 1.0) * (1 - feather(sil, 1.6)) * WIN_ALPHA
    return a, frac, rgb, sil


def trainer_map(key: str) -> np.ndarray:
    t = TRAINER[key]
    a = np.zeros((H, W), np.float32)
    if t["win"]:
        a = np.maximum(a, feather(shape_mask(t["win"], "box"), 1.0) * WIN_ALPHA)
    a = np.maximum(a, feather(shape_mask(t["panel"], "box"), 2.0) * PANEL_ALPHA)
    for x0, y0, x1, y1, kind in HOLES[key]:
        hole = feather(ndi.binary_dilation(shape_mask((x0, y0, x1, y1), kind), iterations=4), 3.0)
        a = a * (1 - hole)
    return a


def dv_map(n: str) -> np.ndarray:
    base = np.asarray(Image.open(ROOT / "assets" / "foil" / "maps" / "dv1" / f"{n}.webp").convert("RGBA"))[..., 3] / 255.0
    a = np.asarray(Image.fromarray((base * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    x, y, w, h = DV_STAMP
    hole = feather(ndi.binary_dilation(shape_mask((x, y, x + w, y + h), "box"), iterations=4), 3.0)
    return a * (1 - hole)


def write(a: np.ndarray, dest: Path, force: bool) -> Path:
    if dest.exists():
        if not force:
            print(f"  kept {dest.relative_to(ROOT)} (exists; --force writes a -vN copy)")
            return dest
        n = 2
        while dest.with_name(f"{dest.stem}-v{n}{dest.suffix}").exists():
            n += 1
        dest = dest.with_name(f"{dest.stem}-v{n}{dest.suffix}")
    small = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((MW, MH), Image.LANCZOS)
    rgba = Image.new("RGBA", (MW, MH), (255, 255, 255, 0))
    rgba.putalpha(small)
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dest, "WEBP", quality=85, alpha_quality=85, method=6, exact=True)
    print(f"  wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma-separated card ids")
    ap.add_argument("--preview", default="", help="directory for overlay previews (scan, map, scan under the map)")
    ap.add_argument("--write-data", action="store_true", help="set foilMap on the cards")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry", action="store_true", help="preview only, write no map")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    recs = records()
    paths: dict[str, str] = {}
    prev = Path(args.preview) if args.preview else None
    if prev:
        prev.mkdir(parents=True, exist_ok=True)

    def preview(cid, scan, a):
        if not prev:
            return
        sc = np.asarray(Image.open(ROOT / "assets" / "cards" / f"{scan}.webp").convert("RGB").resize((W, H))).astype(float)
        m = np.dstack([a * 255] * 3)
        ov = sc * (0.25 + 0.75 * a[..., None])
        Image.fromarray(np.hstack([sc, m, ov]).astype(np.uint8)).resize((900, 419)).save(prev / f"{cid}.png")

    if not only or only & set(CRACKED):
        win = live_window(True)
        a = feather(up(win), 1.0) * WIN_ALPHA
        if not args.dry:
            dest = write(a, ROOT / SHARED, args.force)
            paths.update({c: str(dest.relative_to(ROOT)) for c in CRACKED if not only or c in only})
        else:
            paths.update({c: SHARED for c in CRACKED if not only or c in only})
        preview("window-evo", "bw2/40", a)
    for cid, (setid, scan, stem, frame) in CARDS.items():
        if only and cid not in only:
            continue
        print(cid, frame)
        if frame == "trainer":
            a = trainer_map(cid.split("-")[1])
        else:
            a, frac, _, _ = pokemon_map(cid, scan, frame == "poke-evo")
            print(f"  Pokémon {frac:.0%} of the window")
        preview(cid, scan, a)
        if not args.dry:
            paths[cid] = str(write(a, ROOT / "assets" / "foil" / "maps" / setid / f"{stem}.webp", args.force).relative_to(ROOT))
    for n in DV_CARDS:
        cid = f"dv1-{n}-dvstamp"
        if only and cid not in only:
            continue
        print(cid, "dragon vault stamp")
        a = dv_map(n)
        preview(cid, f"dv1/{n}-dvstamp", a)
        if not args.dry:
            paths[cid] = str(write(a, ROOT / "assets" / "foil" / "maps" / "dv1" / f"{n}-dvstamp.webp", args.force).relative_to(ROOT))
    if args.write_data and paths:
        by_file: dict[Path, list] = {}
        for cid, p in paths.items():
            f, _ = recs[cid]
            by_file.setdefault(f, []).append((cid, p))
        for f, items in by_file.items():
            raw = f.read_text(encoding="utf-8")
            d = json.loads(raw)
            cards = d["cards"] if isinstance(d, dict) else d
            for c in cards:
                for cid, p in items:
                    if c["id"] == cid:
                        c["foilMap"] = p
            after = json.dumps(d, ensure_ascii=False, indent=2) + "\n"
            if after != raw:
                f.write_text(after, encoding="utf-8", newline="\n")
                print("data:", f.relative_to(ROOT), [i[0] for i in items])


if __name__ == "__main__":
    main()
