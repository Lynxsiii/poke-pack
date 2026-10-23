#!/usr/bin/env python3
"""Foil maps for the Mega Evolution-era pixel cosmos promos (family me-cosmos).

On the real cards (reference/fam-me-cosmos.md) the foil is the art-window
background and the whole outer border; the Pokémon, the header, the inner
frame, the text box, the weakness bar and any stamp are matte ink. The maps
the data carries drew the window as a flat rectangle at 130 with the Pokémon
in it, wiped the whole window on the owner ("Arven's", "Erika's" ...) prints,
and gave Pikachu tef051 another card's map. This script redraws every one:

- border: the outer silver band of the existing map (stamp holes kept), 255;
- window, plain print has a TCG Live map (the Rare prints, Live's own map for
  the MEP Black Star promos): Live's window, Pokémon cut out, registered onto
  the cosmos scan (ECC, translation + scale) and normalised so the inked
  background reads about 255 (the family sheet sets the strength);
- window, no Live map (the Common and Uncommon prints): the Pokémon segmented
  from the scan with GrabCut, seeded per card from `hints.json`;
- owner prints: the owner badge cut out with assets/masks/owner/<name>.png
  (white = window minus badge), never the whole window;
- stamps: the holes the old drawn map cut, plus `holes` circles in hints.json;
- everything else (text box, header, frame) 0: no floor.

Writes assets/foil/fam/me-cosmos/<id>-v<N>.webp (new names only: assets are
cached immutable) and a preview sheet with --preview.

    python3 .claude/skills/card-textures/scripts/fam/me-cosmos/make_maps.py --all --version 1
    python3 .claude/skills/card-textures/scripts/fam/me-cosmos/make_maps.py --ids me1-58-cosmos --dry --preview /tmp/x.jpg
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

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
OUT_DIR = ROOT / "assets" / "foil" / "fam" / "me-cosmos"
SIZE = (367, 512)  # map size, like TCG Live's
SETS = ["me1", "me2", "me2pt5", "me3", "me4", "me5"]
# the art window of every ME / late SV standard frame, as fractions of the card (the drawn maps' rectangle)
WIN = (0.079, 0.094, 0.924, 0.469)
# plain prints of the cross-set cosmos promos: prefix -> data file
XSET = {"jtg": "sv9", "dri": "sv10", "tef": "sv5", "meg": "me1", "pfl": "me2", "asc": "me2pt5", "por": "me3"}


def load(set_id: str) -> list[dict]:
    data = json.loads((ROOT / "data" / f"{set_id}.json").read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("cards", [])


def cosmos_cards() -> list[dict]:
    out = []
    for s in SETS:
        for c in load(s):
            if c.get("foilAs") == "Cosmos" and not c.get("reverse"):
                c["_set"] = s
                out.append(c)
    return out


def base_print(card: dict, cache: dict) -> dict | None:
    """The plain print whose TCG Live map has this art (same set number, or the cross-set original)."""
    num = str(card["number"])
    if re.match(r"^mep\d", num):
        return card if card.get("foilMap") else None  # Live's own map for the Black Star promo
    m = re.match(r"^([a-z]{3})(\d+)-", num)
    if m:
        set_id, n = XSET[m.group(1)], str(int(m.group(2)))
    else:
        set_id, n = card["_set"], re.sub(r"-(cosmos|stamp|ebgames|gamestop)$", "", num)
    if set_id not in cache:
        cache[set_id] = {str(c.get("number")): c for c in load(set_id)}
    b = cache[set_id].get(n)
    return b if b and b.get("foilMap") and (ROOT / b["foilMap"]).exists() else None


def alpha_of(path: str | Path, size=SIZE) -> np.ndarray:
    im = Image.open(ROOT / path).convert("RGBA")
    if im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im)[..., 3].astype(np.float32)


def gray_of(path: str | Path, size) -> np.ndarray:
    im = Image.open(ROOT / path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    return np.asarray(bg.convert("L").resize(size, Image.LANCZOS)).astype(np.float32)


def register(base_img: str, cosmos_img: str) -> np.ndarray:
    """Affine (scale + translation) taking the plain print's scan onto the cosmos scan, in map pixels."""
    size = SIZE
    a = gray_of(base_img, size)
    b = gray_of(cosmos_img, size)
    x0, y0, x1, y1 = (int(WIN[0] * size[0]), int(WIN[1] * size[1]), int(WIN[2] * size[0]), int(WIN[3] * size[1]))
    # register on the whole card: the frame lines and the text are the same print
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
        ga = cv2.GaussianBlur(a, (0, 0), 1.2)
        gb = cv2.GaussianBlur(b, (0, 0), 1.2)
        _, warp = cv2.findTransformECC(ga, gb, warp, cv2.MOTION_AFFINE, crit, None, 5)
        # keep it to scale + translation: a rotated or sheared fit is a bad fit
        if abs(warp[0, 1]) > 0.01 or abs(warp[1, 0]) > 0.01 or abs(warp[0, 0] - 1) > 0.04 or abs(warp[1, 1] - 1) > 0.04 \
                or abs(warp[0, 2]) > 12 or abs(warp[1, 2]) > 12:
            warp = np.eye(2, 3, dtype=np.float32)
    except cv2.error:
        warp = np.eye(2, 3, dtype=np.float32)
    return warp


def window_mask(size=SIZE) -> np.ndarray:
    w, h = size
    m = np.zeros((h, w), bool)
    m[int(round(WIN[1] * h)):int(round(WIN[3] * h)) + 1, int(round(WIN[0] * w)):int(round(WIN[2] * w)) + 1] = True
    return m


def band_mask(size=SIZE) -> np.ndarray:
    w, h = size
    fy, fx = int(0.026 * h) + 1, int(0.036 * w) + 1
    m = np.zeros((h, w), bool)
    m[:fy, :] = m[h - fy:, :] = True
    m[:, :fx] = m[:, w - fx:] = True
    return m


def live_window(base: dict, card: dict) -> np.ndarray:
    live = alpha_of(base["foilMap"])
    if base is not card:
        warp = register(base["image"], card["image"])
        live = cv2.warpAffine(live, warp, SIZE, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    win = window_mask()
    floor = float(np.median(live[int(0.6 * SIZE[1]):int(0.85 * SIZE[1]), int(0.15 * SIZE[0]):int(0.85 * SIZE[0])]))
    v = np.clip(live - floor, 0, None)
    inside = v[win]
    ref = float(np.percentile(inside[inside > 40], 75)) if (inside > 40).any() else 200.0
    out = np.clip(v / max(ref, 1) * 255, 0, 255)
    return np.where(win, out, 0)


def grabcut_window(card: dict, hint: dict) -> np.ndarray:
    """255 where the art background is (foil), 0 on the Pokémon, inside the window."""
    img = Image.open(ROOT / card["image"]).convert("RGBA")
    bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
    bg.alpha_composite(img)
    rgb = np.asarray(bg.convert("RGB"))
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = int(WIN[0] * W), int(WIN[1] * H), int(WIN[2] * W), int(WIN[3] * H)
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1, ::-1])  # BGR
    ch, cw = crop.shape[:2]
    mask = np.full((ch, cw), cv2.GC_BGD, np.uint8)
    rx0, ry0, rx1, ry1 = hint["rect"]
    mask[int(ry0 * ch):int(ry1 * ch), int(rx0 * cw):int(rx1 * cw)] = cv2.GC_PR_FGD
    for kind, val in (("bgp", cv2.GC_PR_BGD), ("fgp", cv2.GC_PR_FGD), ("bg", cv2.GC_BGD), ("fg", cv2.GC_FGD)):
        for item in hint.get(kind, []):
            if len(item) == 3:
                x, y, r = item
                cv2.circle(mask, (int(x * cw), int(y * ch)), max(1, int(r * cw)), int(val), -1)
            else:  # polygon [[x,y],...]
                pts = np.array([[int(px * cw), int(py * ch)] for px, py in item], np.int32)
                cv2.fillPoly(mask, [pts], int(val))
    cv2.setRNGSeed(7)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, mask, None, bgd, fgd, int(hint.get("iter", 6)), cv2.GC_INIT_WITH_MASK)
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    # the Pokémon is one or a few big blobs: drop specks, fill holes
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    keep = np.zeros_like(fg)
    min_area = hint.get("min_area", 0.004) * ch * cw
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            keep[lab == i] = 1
    inv = 1 - keep
    n2, lab2, stats2, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n2):
        x, y, w2, h2, a = stats2[i]
        touches = x == 0 or y == 0 or x + w2 >= cw or y + h2 >= ch
        if not touches and a < hint.get("hole_max", 0.01) * ch * cw:
            keep[lab2 == i] = 1
    d = int(hint.get("dilate", 2))
    if d > 0:
        keep = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * d + 1, 2 * d + 1)))
    full = np.zeros((H, W), np.float32)
    full[y0:y1, x0:x1] = (1 - keep) * 255.0
    full = cv2.GaussianBlur(full, (0, 0), 0.8)
    small = np.asarray(Image.fromarray(full.clip(0, 255).astype(np.uint8)).resize(SIZE, Image.LANCZOS)).astype(np.float32)
    return np.where(window_mask(), small, 0)


def build(card: dict, hints: dict, cache: dict) -> tuple[np.ndarray, str]:
    cid = card["id"]
    hint = hints.get(cid, {})
    old = alpha_of(card["foilMap"])
    band = band_mask()
    win = window_mask()
    drawn = len(np.unique(old)) <= 8
    # border: the old drawn map's band (its stamp holes kept); Live's band (241-255) read as 255
    border = np.where(band, np.where(old >= 200, 255.0, old if drawn else 0.0), 0.0)
    base = base_print(card, cache)
    if hint.get("rect"):
        window, src = grabcut_window(card, hint), "grabcut"
    elif base is not None:
        window, src = live_window(base, card), ("live own" if base is card else f"live {base['id']}")
    else:
        window, src = np.where(win, 255.0, 0.0), "box (NO POKEMON CUT)"
    # stamp holes of the old drawn map (a stamp over the window is cut to 0 there); skip a wiped window
    if drawn and old[win].mean() > 60:
        expect = np.where(win, 130.0, 0)
        factor = np.where(win, np.clip(old / 130.0, 0, 1), 1)
        window = window * factor
    owner = card.get("ownerMask")
    if owner and not (base is not None and not hint.get("rect")):
        path = ROOT / "assets" / "masks" / "owner" / f"{owner}.png"
        if path.exists():
            allow = alpha_of(path.relative_to(ROOT)) / 255.0
            window = window * allow
            src += f", owner {owner}"
    for x, y, r in hint.get("holes", []):
        hole = np.zeros(old.shape, np.uint8)
        cv2.circle(hole, (int(x * SIZE[0]), int(y * SIZE[1])), int(r * SIZE[0]), 1, -1)
        window = np.where(hole > 0, 0, window)
        border = np.where(hole > 0, 0, border)
    out = np.maximum(border, window)
    return out.clip(0, 255), src


def next_name(cid: str, version: int) -> Path:
    return OUT_DIR / f"{cid}-v{version}.webp"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ids", default="", help="comma-separated card ids")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--version", type=int, default=1)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--preview", default="", help="write a scan + map overlay sheet here")
    a = ap.parse_args()
    hints = json.loads((HERE / "hints.json").read_text(encoding="utf-8"))
    wanted = {s.strip() for s in a.ids.split(",") if s.strip()}
    cache: dict = {}
    tiles = []
    for card in cosmos_cards():
        if wanted and card["id"] not in wanted:
            continue
        if not wanted and not a.all:
            continue
        m, src = build(card, hints, cache)
        print(f"  {card['id']:22s} {card['name']}: {src}")
        if not a.dry:
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            a8 = m.round().astype(np.uint8)
            rgba = np.dstack([np.full_like(a8, 255)] * 3 + [a8])
            Image.fromarray(rgba, "RGBA").save(next_name(card["id"], a.version), "WEBP", quality=92, alpha_quality=92, method=6)
        if a.preview:
            sc = Image.open(ROOT / card["image"]).convert("RGBA").resize(SIZE, Image.LANCZOS)
            bgc = Image.new("RGBA", SIZE, (0, 0, 0, 255))
            bgc.alpha_composite(sc)
            s = np.asarray(bgc.convert("RGB")).astype(np.float32)
            k = (m / 255.0)[..., None]
            ov = s * (1 - 0.6 * k) + np.array([255, 0, 160], np.float32) * 0.6 * k
            tiles.append(Image.fromarray(ov.clip(0, 255).astype(np.uint8)).crop((0, 0, SIZE[0], int(0.5 * SIZE[1]))))
    if a.preview and tiles:
        cols = 6
        tw, th = tiles[0].size
        sheet = Image.new("RGB", (tw * cols, th * ((len(tiles) + cols - 1) // cols)), "black")
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
        sheet.save(a.preview, quality=88)
    return 0


if __name__ == "__main__":
    sys.exit(main())
