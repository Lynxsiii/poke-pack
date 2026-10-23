#!/usr/bin/env python3
"""Draw the v2 lettering knockouts of the xy-ex-mega family: `<id>-ink-v2.webp`, one per claimed print.

v1 (make_ink_masks.py, `<id>-ink.webp`) knocked the name plate's dark lettering and its compact gold blobs out of the foil
layers. The audit of 2026-10-22 (w2-xy-ex) found three faults it left:

1. The gold "EX" turned pink or green on 28 prints (xy2-11 Charizard-EX, xy4-23 Manectric-EX, xy1-46 Emolga-EX, xy10-85 M Audino,
   ...): on a yellow, green or orange plate the EX merges with the plate in v1's broad gold test and is left in the foil. The
   EX is one flat ink (about rgb 214 174 8, hue 48, saturation 0.96) in one typeface at one size on every card, so v2 finds it
   by SHAPE: the strict EX-gold pixels of the band are matched against the EX of Venusaur-EX xy1-1 (normalised
   cross-correlation, scales 0.88-1.12) and the template's filled glyph, dilated, is stamped where it matches.
2. The Pokémon's eye highlights turned rainbow (xy1-46 Emolga-EX, xy2-11 Charizard-EX): TCG Live's map marks a few small
   islands inside the matte Pokémon as foil. v2 knocks out map islands under 0.9 % of the card's area whose ring (a 4 px
   band around it) is matte (mean map alpha < 0.05): in the art the pale or greyish ones (the eyes; mean saturation < 0.6),
   in the name plate the small ones (under 0.4 %: the EX itself) and below the art all of them (the rule text, the
   illustrator line).
3. The white lettering on the black "Pokémon-EX rule" / "Mega Evolution rule" header turned colour where a bar crossed it:
   the white top-hat of the luminance over a dark ground in the lower fifth of the card is knocked out too (light letters
   on dark ink only; the gold box and the frame are not dark, so they stay foil).

The Double Crisis pair (dc1-6, dc1-15) also keeps its text-row knockout (make_dc_ink.text_ink: the Ability and attack text).

    node .claude/skills/card-textures/scripts/fam/xy-ex-mega/list_claimed.mjs > ids.tsv
    python3 .claude/skills/card-textures/scripts/fam/xy-ex-mega/make_ink_masks_v2.py ids.tsv [--only xy2-11,xy4-23] [--preview DIR] [--report FILE]

Writes assets/foil/fam/xy-ex-mega/<id>-ink-v2.webp (600 x 838, white, alpha = 1 - lettering). Deterministic. A file that
is on master is never rewritten: a change is a new -vN name (the module's INK suffix).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_dc_ink as dc  # noqa: E402
import make_ink_masks as base  # noqa: E402

W, H = base.W, base.H
SUFFIX = "-ink-v2"
TEMPLATE_CARD = ("xy1-1", "assets/cards/xy1/1.webp", (293, 29, 86, 56))  # the EX of Venusaur-EX, x y w h with a 6 px margin
SEARCH = (18, 105, 110, 575)  # rows, columns the EX is looked for in (the name plate)
EX_MIN_SCORE = 0.42
ISLAND_MAX = 0.009  # of the card's area
RULE_BAND = (0.79, 0.975)  # rows (fraction of the height) of the rule box header and the footer


def ex_gold(rgb: np.ndarray) -> np.ndarray:
    """The EX ink, strictly: a saturated mid-bright gold (hue 38-58, S > 0.75, V 0.6-0.97)."""
    hsv = cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0].astype(np.int32) * 2, hsv[..., 1], hsv[..., 2]
    return ((h >= 38) & (h <= 58) & (s > 190) & (v > 150) & (v < 248)).astype(np.float32)


def template() -> tuple[np.ndarray, np.ndarray]:
    """The EX template: its strict-gold pixels (to match) and its filled glyph (to stamp)."""
    _, img, (x, y, w, h) = TEMPLATE_CARD
    g = ex_gold(base.load(base.ROOT / img))[y:y + h, x:x + w]
    filled = cv2.morphologyEx((g > 0).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    return g, filled.astype(np.float32)


def find_ex(rgb: np.ndarray, tmpl: tuple[np.ndarray, np.ndarray]) -> tuple[np.ndarray, float]:
    """Stamp the EX glyph where the strict-gold pixels of the plate match the template best (score >= EX_MIN_SCORE)."""
    g = ex_gold(rgb)
    r0, r1, c0, c1 = SEARCH
    region = g[r0:r1, c0:c1]
    best = (-1.0, None, None)
    for sc in (0.88, 0.94, 1.0, 1.06, 1.12):
        t = cv2.resize(tmpl[0], None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
        f = cv2.resize(tmpl[1], None, fx=sc, fy=sc, interpolation=cv2.INTER_LINEAR)
        if t.shape[0] >= region.shape[0] or t.shape[1] >= region.shape[1]:
            continue
        res = cv2.matchTemplate(region, t, cv2.TM_CCOEFF_NORMED)
        res = np.nan_to_num(res, nan=-1.0)
        _, mx, _, loc = cv2.minMaxLoc(res)
        if mx > best[0]:
            best = (mx, loc, f)
    out = np.zeros((H, W), np.float32)
    score, loc, f = best
    if loc is not None and score >= EX_MIN_SCORE:
        x, y = loc[0] + c0, loc[1] + r0
        out[y:y + f.shape[0], x:x + f.shape[1]] = (f > 0.5)
        # the glyph's own gold pixels nearby too (the template's italic cut can differ by a pixel)
        near = cv2.dilate(out.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(bool)
        out = np.maximum(out, (g > 0) & near)
    return out, float(score)


def map_islands(card: dict, rgb: np.ndarray) -> np.ndarray:
    """Small foil islands of the card's Live map enclosed by matte print, at the scan's grid: in the art only the pale or
    greyish ones (eye highlights and pupils, mean saturation < 0.6; a saturated island such as a sweet on M Gengar stays foil),
    in the name plate and below the art all of them (the EX, the rule text, the illustrator line)."""
    out = np.zeros((H, W), np.float32)
    sat = cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2HSV)[..., 1].astype(np.float32) / 255.0
    fm = card.get("map")
    if not fm or not (base.ROOT / fm).exists():
        return out
    a = np.asarray(Image.open(base.ROOT / fm).convert("RGBA"))[..., 3]
    a = cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
    lab = (a > 0.2).astype(np.uint8)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(lab, connectivity=8)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area > ISLAND_MAX * W * H or area < 12:
            continue
        comp = (lbl == i).astype(np.uint8)
        ring = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool) & (comp == 0)
        if a[ring].mean() >= 0.05:
            continue
        in_plate = y + h <= 0.13 * H
        in_art = not in_plate and y < 0.5 * H
        # the plate band: only the small islands (the EX, the HP digits); a promo map that cuts the plate itself into
        # islands keeps them foil, the plate flashes
        if in_plate and area > 0.004 * W * H:
            continue
        if not in_art or sat[comp > 0].mean() < 0.6:
            out[comp > 0] = 1.0
    return out


def rule_lettering(rgb: np.ndarray) -> np.ndarray:
    """Light lettering on dark ink in the lower fifth of the card: the rule box header ("Pokémon-EX rule", "Mega Evolution rule")."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    wh = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, k9)
    floor = cv2.morphologyEx(gray, cv2.MORPH_OPEN, k9)
    band = np.zeros(gray.shape, bool)
    band[int(RULE_BAND[0] * H):int(RULE_BAND[1] * H), int(0.3 * W):int(0.97 * W)] = True
    return ((wh > 60) & (gray > 140) & (floor < 80) & band).astype(np.float32)


def build(rgb: np.ndarray, card: dict, tmpl) -> tuple[np.ndarray, dict]:
    k1 = base.build(rgb)
    ex, score = find_ex(rgb, tmpl)
    isl = map_islands(card, rgb)
    rl = rule_lettering(rgb)
    extra = np.maximum(ex, isl)
    extra = cv2.dilate(extra.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))).astype(np.float32)
    extra = np.clip(cv2.GaussianBlur(extra, (0, 0), 1.1) * 1.6, 0, 1)
    rl = cv2.dilate(rl.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))).astype(np.float32)
    rl = np.clip(cv2.GaussianBlur(rl, (0, 0), 0.9) * 1.7, 0, 1)
    k = np.maximum.reduce([k1, extra, rl])
    if card["id"] in dc.IDS:
        ti = cv2.dilate(dc.text_ink(rgb).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        k = np.maximum(k, np.clip(cv2.GaussianBlur(ti.astype(np.float32), (0, 0), 0.9) * 1.7, 0, 1))
    return k, {"ex_score": round(score, 3), "ex_px": int(ex.sum()), "island_px": int(isl.sum()), "rule_px": int(rl.sum() > 0 and (rl > 0.5).sum())}


def cards_by_id() -> dict:
    """id -> {map}: the data's foilMap, else the family's shipped promo map."""
    out = {}
    for f in sorted((base.ROOT / "data").glob("*.json")):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        for c in d if isinstance(d, list) else d.get("cards", []):
            if isinstance(c, dict) and c.get("id"):
                out[c["id"]] = c.get("foilMap")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", type=Path, help="TSV from list_claimed.mjs: <id><TAB><image path>")
    ap.add_argument("--only", default="", help="comma-separated ids")
    ap.add_argument("--preview", type=Path, default=None)
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--dry", action="store_true", help="previews and report only, write no masks")
    a = ap.parse_args()
    only = {s for s in a.only.split(",") if s}
    maps = cards_by_id()
    tmpl = template()
    report = {}
    for line in a.ids.read_text().splitlines():
        if not line.strip():
            continue
        cid, img = line.split("\t")
        if only and cid not in only:
            continue
        fm = maps.get(cid)
        promo = base.OUT / f"{cid}-map.webp"
        if not fm and promo.exists():
            fm = str(promo.relative_to(base.ROOT))
        rgb = base.load(base.ROOT / img)
        k, info = build(rgb, {"id": cid, "map": fm}, tmpl)
        report[cid] = info
        if not a.dry:
            alpha = ((1.0 - k) * 255).round().astype(np.uint8)
            white = np.full_like(alpha, 255)
            Image.fromarray(np.dstack([white, white, white, alpha]), "RGBA").save(base.OUT / f"{cid}{SUFFIX}.webp", "WEBP", lossless=True, method=6)
        if a.preview:
            a.preview.mkdir(parents=True, exist_ok=True)
            vis = rgb.astype(np.float32) * (1 - 0.7 * k[..., None]) + np.array([255, 0, 255], np.float32) * 0.7 * k[..., None]
            Image.fromarray(vis.clip(0, 255).astype(np.uint8)).save(a.preview / f"{cid}-ink-v2.jpg", quality=88)
    if a.report:
        a.report.write_text(json.dumps(report, indent=1))
    low = sorted((v["ex_score"], c) for c, v in report.items() if v["ex_score"] < EX_MIN_SCORE)
    print(f"{len(report)} cards; EX not found on {len(low)}: {low}", file=sys.stderr)


if __name__ == "__main__":
    main()
