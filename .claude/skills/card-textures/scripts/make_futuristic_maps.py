"""Draw a Futuristic Rare's foil map and op-art etch for a card TCG Live has
no maps for yet, in the same form fetch_foil_maps.py ships.

The 30th Celebration's two Pikachu ex Futuristic promos (MEP 107 and 109, from
the Ultra-Premium Collections) were not in TCG Live's export on 2026-09-27, so
their maps are drawn here from the card scan, the way TCG Live's own
Futuristic maps (Mewtwo ex 157, Mew ex 158) are laid out:

- foil map: the whole card is foil (white), the Pokémon at part strength
  (grey, as on 157), the text and the 30 stamp not foil (black);
- etch: fine op-art lines over everything, concentric rings round each energy
  orb and hard-edged cells of rings and hatching elsewhere; the Pokémon smooth
  (black) and the text solid (white).

Per-card hints live in lab/masks/futuristic/<set>.json, in card fractions:
`cut` seeds a GrabCut of the Pokémon (`hull` maybe the Pokémon, `fg`
certainly, `bg` and `bg_circles` certainly not); `orbs` are [x, y, r] ring
centres; `like` is a card with TCG Live maps and the same frame. Its stamp is
matched to place this card's, and its map's bottom strip (rule box,
illustrator, copyright: the same on every ex) is reused. The cut is saved as
lab/masks/futuristic/<n>.png and reused; pass --recut after editing `cut`.

    python3 .claude/skills/card-textures/scripts/make_futuristic_maps.py \\
      --set me55 --cards mep107,mep109 --write-data --debug

Writes assets/foil/maps/<set>/<n>.webp, <n>-etch.webp, <n>-etch-h.webp and
<n>-etch-v.webp; --write-data records foilMap, etchMap, etchMapH, etchMapV,
stampPos and stampSize on the card; --debug writes a contact sheet to
lab/cache/<set>/<n>.futuristic.png. Needs opencv-python-headless.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from fetch_foil_maps import ETCH_WIDTH, etch_bins

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
HINTS = HERE.parent / "lab" / "masks" / "futuristic"
CACHE = HERE.parent / "lab" / "cache"
STAMP = ROOT / "assets" / "masks" / "stamp" / "stamp30.png"

MAP_SIZE = (367, 512)  # TCG Live's foil maps
POKEMON = 158          # the Pokémon's foil strength on 157's map
INK = 24               # text on 157's map
PITCH = 2.3            # etch line pitch at ETCH_WIDTH, measured on 157
# Rows of printed text whose ink colour is matched on the scan (name and HP,
# attacks, weakness row); below BOTTOM the `like` card's map is reused.
TEXT_ROWS = ((0.015, 0.08), (0.555, 0.80), (0.84, 0.885))
BOTTOM = 0.885


def poly(points, W, H):
    return np.array([[x * W, y * H] for x, y in points], np.int32)


def cut_pokemon(rgb: np.ndarray, cut: dict) -> np.ndarray:
    """GrabCut seeded by the hints; the largest blob, holes filled."""
    H, W = rgb.shape[:2]
    mask = np.full((H, W), cv2.GC_BGD, np.uint8)
    cv2.fillPoly(mask, [poly(cut["hull"], W, H)], cv2.GC_PR_FGD)
    for p in cut.get("fg", []):
        cv2.fillPoly(mask, [poly(p, W, H)], cv2.GC_FGD)
    for p in cut.get("bg", []):
        cv2.fillPoly(mask, [poly(p, W, H)], cv2.GC_BGD)
    for x, y, r in cut.get("bg_circles", []):
        cv2.circle(mask, (round(x * W), round(y * H)), round(r * W), cv2.GC_BGD, -1)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, 10, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(fg)
    fg = np.where(labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    holes = fg.copy()
    cv2.floodFill(holes, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 255)
    return fg | cv2.bitwise_not(holes)


def css_box(pos: str, size: str, W: int, H: int, aspect: float):
    """CSS mask-position / mask-size percentages -> pixel box."""
    px, py = (float(v) / 100 for v in re.findall(r"[\d.]+", pos))
    w = float(re.findall(r"[\d.]+", size)[0]) / 100 * W
    h = w * aspect
    return round((W - w) * px), round((H - h) * py), round(w), round(h)


def find_stamp(rgb: np.ndarray, like_rgb: np.ndarray, like: dict, stamp: np.ndarray):
    """Match the like card's stamp on this card; return pixel box and CSS fields."""
    H, W = rgb.shape[:2]
    x, y, w, h = css_box(like["stampPos"], like["stampSize"], W, H, stamp.shape[0] / stamp.shape[1])
    lr = cv2.resize(like_rgb, (W, H), interpolation=cv2.INTER_AREA)
    tpl = lr[y:y + h, x:x + w]
    tmask = cv2.resize(stamp, (w, h), interpolation=cv2.INTER_AREA)
    tmask = np.dstack([tmask] * 3).astype(np.float32) / 255
    y0, x0 = max(0, y - h), max(0, x - w)
    region = rgb[y0:min(H, y + 2 * h), x0:min(W, x + 2 * w)]
    res = cv2.matchTemplate(region.astype(np.float32), tpl.astype(np.float32), cv2.TM_CCORR_NORMED, mask=tmask)
    _, score, _, (mx, my) = cv2.minMaxLoc(np.nan_to_num(res))
    bx, by = x0 + mx, y0 + my
    fields = {
        "stampPos": f"{bx / (W - w) * 100:.2f}% {by / (H - h) * 100:.2f}%",
        "stampSize": like["stampSize"],
    }
    return (bx, by, w, h), fields, score


def ink_mask(rgb: np.ndarray, tol: float = 34) -> np.ndarray:
    """Printed text: pixels in the text rows close to the ink of the HP digits."""
    H, W = rgb.shape[:2]
    box = rgb[int(0.03 * H):int(0.075 * H), int(0.77 * W):int(0.89 * W)].reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
    cv2.setRNGSeed(1)
    _, _, centres = cv2.kmeans(box, 3, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    hsv = cv2.cvtColor(centres.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_RGB2HSV)[0].astype(float)
    ink = centres[np.argmax(hsv[:, 1] * hsv[:, 2])]  # the coloured cluster, not paper or shadow
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    ink_lab = cv2.cvtColor(ink.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)
    near = np.linalg.norm(lab - ink_lab, axis=2) < tol
    # Card text has a white keyline; painting in the same colour does not.
    lum = lab[..., 0]
    keyline = cv2.dilate(lum, np.ones((7, 7), np.uint8))
    near &= (keyline > 200) & (keyline - lum > 60)
    rows = np.zeros((H, W), bool)
    for y0, y1 in TEXT_ROWS:
        rows[int(y0 * H):int(y1 * H), int(0.03 * W):int(0.97 * W)] = True
    m = (near & rows).astype(np.uint8)
    # Glyphs are short (a line of tight text can join up, so width says
    # nothing); anything taller than the HP digits is painting.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m)
    big = np.flatnonzero(stats[:, cv2.CC_STAT_HEIGHT] > 0.055 * H)
    m[np.isin(labels, big[big > 0])] = 0
    return cv2.dilate(m, np.ones((2, 2), np.uint8)) > 0


def etch_plate(Wt: int, Ht: int, orbs, seed: int, pitch: float) -> np.ndarray:
    """Op-art line cells in [0, 1]: rings round each orb, Voronoi cells of rings
    or hatching between them, hard edges everywhere."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:Ht, 0:Wt].astype(np.float32)
    # Background cells.
    n = 16
    cx, cy = rng.uniform(-0.1, 1.1, n) * Wt, rng.uniform(-0.1, 1.1, n) * Ht
    kind = rng.choice(["rings", "hatch", "chevron"], n, p=[0.5, 0.3, 0.2])
    angle = rng.uniform(0, np.pi, n)
    d = np.stack([np.hypot(xx - x, yy - y) for x, y in zip(cx, cy)])
    cell = d.argmin(0)
    out = np.zeros((Ht, Wt), np.float32)
    for i in range(n):
        sel = cell == i
        if kind[i] == "rings":
            phase = d[i][sel]
        else:
            u = (xx[sel] - cx[i]) * np.cos(angle[i]) + (yy[sel] - cy[i]) * np.sin(angle[i])
            v = -(xx[sel] - cx[i]) * np.sin(angle[i]) + (yy[sel] - cy[i]) * np.cos(angle[i])
            phase = u if kind[i] == "hatch" else u + np.abs(v)
        out[sel] = phase
    # Orbs on top, biggest first so small ones stay whole.
    for x, y, r in sorted(orbs, key=lambda o: -o[2]):
        ox, oy, orad = x * Wt, y * Ht, r * Wt * 1.12
        dist = np.hypot(xx - ox, yy - oy)
        sel = dist < orad
        out[sel] = dist[sel]
    return 0.5 + 0.5 * np.cos(2 * np.pi * out / pitch)


def alpha_img(a: np.ndarray, size) -> Image.Image:
    v = Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8), "L").resize(size, Image.LANCZOS)
    white = Image.new("L", size, 255)
    return Image.merge("RGBA", (white, white, white, v))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", required=True, help="comma-separated card numbers with hints")
    ap.add_argument("--recut", action="store_true", help="redo the GrabCut even if the saved cut exists")
    ap.add_argument("--write-data", action="store_true")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    hints = json.loads((HINTS / f"{args.set}.json").read_text(encoding="utf-8"))
    data_path = ROOT / "data" / f"{args.set}.json"
    raw = data_path.read_text(encoding="utf-8")
    cards = json.loads(raw)
    records = cards if isinstance(cards, list) else cards["cards"]
    by_number = {str(c["number"]): c for c in records}
    stamp = np.asarray(Image.open(STAMP).convert("RGBA"))[..., 3]
    out_dir = ROOT / "assets" / "foil" / "maps" / args.set
    rel = f"assets/foil/maps/{args.set}"

    for n in [s.strip() for s in args.cards.split(",") if s.strip()]:
        card, hint = by_number[n], hints[n]
        like = by_number[hint["like"]]
        rgb = np.asarray(Image.open(ROOT / card["image"]).convert("RGB"))
        like_rgb = np.asarray(Image.open(ROOT / like["image"]).convert("RGB"))
        H, W = rgb.shape[:2]

        cut_path = HINTS / f"{n}.png"
        if args.recut or not cut_path.exists():
            Image.fromarray(cut_pokemon(rgb, hint["cut"])).convert("1").save(cut_path, optimize=True)
        pokemon = np.asarray(Image.open(cut_path).convert("L").resize((W, H))) > 127

        (sx, sy, sw, sh), stamp_fields, score = find_stamp(rgb, like_rgb, like, stamp)
        stamp_px = np.zeros((H, W), np.float32)
        stamp_px[sy:sy + sh, sx:sx + sw] = cv2.resize(stamp, (sw, sh), interpolation=cv2.INTER_AREA)[: H - sy, : W - sx] / 255

        text = ink_mask(rgb)
        like_map = np.asarray(Image.open(ROOT / like["foilMap"]).convert("RGBA").resize((W, H), Image.LANCZOS))[..., 3].astype(np.float32)
        bottom = np.zeros((H, W), bool)
        bottom[int(BOTTOM * H):] = True
        text |= bottom & (like_map < 90)
        corners = like_map < 8  # the rounded corners are transparent
        corners[int(0.06 * H):int(0.94 * H)] = False

        foil = np.full((H, W), 255, np.float32)
        foil[pokemon] = POKEMON
        foil[text] = INK
        foil = foil * (1 - stamp_px)
        foil[corners] = 0

        # The etch is drawn at twice its size and shrunk, so the fine lines
        # come out anti-aliased rather than stair-stepped.
        ew, eh = ETCH_WIDTH, round(ETCH_WIDTH * H / W)
        big = (ew * 2, eh * 2)
        plate = etch_plate(*big, hint["orbs"], hint.get("seed", 0), PITCH * 2) * 235
        up = lambda m: cv2.resize(m.astype(np.float32), big, interpolation=cv2.INTER_LINEAR)
        plate = plate * (1 - up(pokemon))
        plate = np.maximum(plate, up(text) * 255)
        plate = plate * (1 - up(stamp_px)) * (1 - up(corners))

        out_dir.mkdir(parents=True, exist_ok=True)
        alpha_img(foil, MAP_SIZE).save(out_dir / f"{n}.webp", "WEBP", quality=85, alpha_quality=80, method=6)
        etch_path = out_dir / f"{n}-etch.webp"
        alpha_img(plate, (ew, eh)).save(etch_path, "WEBP", quality=80, alpha_quality=80, method=6)
        h, v = etch_bins(etch_path, ETCH_WIDTH)
        h.save(out_dir / f"{n}-etch-h.webp", "WEBP", quality=80, alpha_quality=80, method=6)
        v.save(out_dir / f"{n}-etch-v.webp", "WEBP", quality=80, alpha_quality=80, method=6)
        print(f"{n}: maps written; stamp matched at {stamp_fields['stampPos']} (score {score:.3f})")

        card.update({
            "foilMap": f"{rel}/{n}.webp",
            "etchMap": f"{rel}/{n}-etch.webp",
            "etchMapH": f"{rel}/{n}-etch-h.webp",
            "etchMapV": f"{rel}/{n}-etch-v.webp",
            **stamp_fields,
        })

        if args.debug:
            tiles = [Image.fromarray(rgb).resize(MAP_SIZE)]
            for name in (f"{n}.webp", f"{n}-etch.webp", f"{n}-etch-h.webp"):
                im = Image.open(out_dir / name).convert("RGBA").resize(MAP_SIZE)
                bg = Image.new("RGBA", MAP_SIZE, (0, 0, 0, 255))
                bg.alpha_composite(im)
                tiles.append(bg.convert("RGB"))
            sheet = Image.new("RGB", (MAP_SIZE[0] * len(tiles), MAP_SIZE[1]))
            for i, t in enumerate(tiles):
                sheet.paste(t, (MAP_SIZE[0] * i, 0))
            (CACHE / args.set).mkdir(parents=True, exist_ok=True)
            sheet.save(CACHE / args.set / f"{n}.futuristic.png")

    if args.write_data:
        after = json.dumps(cards, ensure_ascii=False, indent=2) + "\n"
        if after != raw:
            data_path.write_text(after, encoding="utf-8", newline="\n")
            print(f"updated {data_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
