#!/usr/bin/env python3
"""Draw the holo map of every coin from its own art.

A coin's art (assets/coins/<id>-vN.webp) is one 512x256 file: the obverse on the
left, the reverse (a Poke Ball) on the right. The site lights each coin with a
moving spectrum and a mirror band (css/casino-coin.css, js/coin.js), and the
engine needs to know where the coin is actually reflective, so the holo sits
where a real coin catches light and stays off the printed colour. This script
reads every coin from data/gear.json and writes a luminance map in the same
512x256 layout, assets/coins/foil/<id>-m<v*10+mv>.webp (white = reflective).

By material (what the real coin is):

  metal    struck metal: the whole disc is a mirror, brightest on the relief
           (the engraved lines catch the light) and on the rim
  foil     holographic foil: shows wherever the print is bright or coloured,
           and the rainbow it already carries is kept as the base
  plastic  glossy plastic with printed ink: only the silver / iridescent ink
           and any bright metallic accent reflects, the coloured enamel and the
           black field stay flat (they only get the plastic gloss)

Per coin overrides in scripts/gear/coin-foil.json:
  { "<id>": { "mode": "metal|foil|plastic|off", "gain": 1.0, "floor": 0.0, "mv": 1 } }

  python3 scripts/coin_foil.py                  # every coin
  python3 scripts/coin_foil.py <id> [<id> ...]  # some
  python3 scripts/coin_foil.py --sheet out.png  # review sheet: art | map | overlay
  python3 scripts/coin_foil.py --dry            # no files, no catalog change

A map that exists with different pixels is never overwritten (assets/ is served
immutable): bump the coin's `mv` in coin-foil.json instead.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "gear.json"
SPEC = ROOT / "scripts" / "gear" / "coin-foil.json"
OUT = ROOT / "assets" / "coins" / "foil"
SIZE = 256  # one face, in px


def load_spec() -> dict:
    return json.loads(SPEC.read_text()) if SPEC.exists() else {}


def blur(a: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im, dtype=np.float32) / 255.0


def morph(a: np.ndarray, n: int, grow: bool) -> np.ndarray:
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L")
    im = im.filter(ImageFilter.MaxFilter(n) if grow else ImageFilter.MinFilter(n))
    return np.asarray(im, dtype=np.float32) / 255.0


def rgb_to_hs(rgb: np.ndarray):
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0.0)
    return mx, sat


def disc(size: int, r: float) -> np.ndarray:
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.hypot(x - (size - 1) / 2, y - (size - 1) / 2) / (size / 2)
    return d, np.clip((r - d) * size / 2, 0, 1)  # radius map, soft-edged disc


def face_map(face: Image.Image, mode: str, gain: float, floor: float) -> np.ndarray:
    rgba = face.convert("RGBA")
    arr = np.asarray(rgba, dtype=np.float32) / 255.0
    rgb = arr[..., :3]
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    val, sat = rgb_to_hs(rgb)
    dist, inside = disc(face.size[0], 0.985)
    # high-pass of the lightness: the relief and the engraved lines
    detail = np.abs(lum - blur(lum, 2.4))
    detail = np.clip(detail / (np.percentile(detail[inside > 0.5], 96) + 1e-4), 0, 1)
    detail = blur(detail, 0.8)
    rim = np.clip((dist - 0.86) / 0.10, 0, 1) * np.clip((0.99 - dist) / 0.03, 0, 1)

    if mode == "metal":
        m = 0.38 + 0.62 * detail + 0.22 * np.clip((lum - 0.55) * 2.2, 0, 1)
        m = np.maximum(m, 0.7 * rim)
    elif mode == "foil":
        color = np.clip(sat * 1.35 + (lum - 0.3) * 0.7, 0, 1)
        m = 0.28 + 0.72 * np.maximum(color, detail * 0.9)
        m = np.maximum(m, 0.6 * rim)
    else:  # plastic: only bright, low-saturation ink (silver) and bright accents
        silver = np.clip((lum - 0.42) * 2.6, 0, 1) * np.clip(1.25 - sat * 1.6, 0, 1)
        sparkle = np.clip((val - 0.78) * 4, 0, 1) * np.clip(sat * 2, 0, 1)
        m = np.maximum(silver, sparkle * 0.8)
        m = morph(morph(m, 3, False), 3, True)  # kills halftone speckle
        m = np.maximum(m, 0.35 * rim)
    m = np.clip(m * gain + floor, 0, 1)
    m = blur(m, 0.7)
    return np.clip(m * inside, 0, 1)


def map_path(cid: str, coin: dict, spec: dict) -> Path:
    v = int(str(coin["front"]).rsplit("-v", 1)[1].split(".")[0])
    mv = int(spec.get(cid, {}).get("mv", 1))
    return OUT / f"{cid}-m{v * 10 + mv}.webp"


def finish_of(coin: dict, spec: dict) -> str:
    conf = spec.get(coin["id"], {})
    return conf.get("mode") or {"metal": "metal", "foil": "foil"}.get(coin.get("material"), "plastic")


def render(coin: dict, spec: dict):
    art = Image.open(ROOT / coin["front"]).convert("RGBA")
    w, h = art.size
    conf = spec.get(coin["id"], {})
    mode = finish_of(coin, spec)
    gain = float(conf.get("gain", 1.0))
    floor = float(conf.get("floor", 0.0))
    out = np.zeros((h, w), dtype=np.float32)
    if mode != "off":
        for i in range(2):
            face = art.crop((i * (w // 2), 0, (i + 1) * (w // 2), h))
            out[:, i * (w // 2):(i + 1) * (w // 2)] = face_map(face, mode, gain, floor)
    return art, out, mode


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--sheet")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    cat = json.loads(CATALOG.read_text())
    spec = load_spec()
    coins = cat["coins"]
    ids = args.ids or sorted(coins)
    sheet = []
    changed = False
    for cid in ids:
        coin = coins.get(cid)
        if not coin or not coin.get("front"):
            print(f"skip {cid}", file=sys.stderr)
            continue
        art, m, mode = render(coin, spec)
        if mode == "off":
            if "foil" in coin:
                del coin["foil"]
                changed = True
            continue
        img = Image.fromarray((m * 255).astype(np.uint8), "L")
        path = map_path(cid, coin, spec)
        rel = path.relative_to(ROOT).as_posix()
        if not args.dry:
            OUT.mkdir(parents=True, exist_ok=True)
            if path.exists():
                import io
                buf = io.BytesIO()
                img.save(buf, "WEBP", quality=88, method=6)
                new = np.asarray(Image.open(buf).convert("L")).astype(int)
                old = np.asarray(Image.open(path).convert("L")).astype(int)
                if np.abs(old - new).max() > 2:
                    print(f"NOTE {cid}: {rel} exists with different pixels; bump mv in {SPEC.name}", file=sys.stderr)
            else:
                img.save(path, "WEBP", quality=88, method=6)
        row = {"finish": mode, "map": rel}
        if coin.get("foil") != row:
            coin["foil"] = row
            changed = True
        sheet.append((cid, art, img))
    if changed and not args.dry:
        CATALOG.write_text(json.dumps(cat, indent=1, ensure_ascii=False) + "\n")
        print(f"updated {CATALOG.relative_to(ROOT)}")
    if args.sheet and sheet:
        cols = 3
        cell = 256
        rows = (len(sheet) + cols - 1) // cols
        S = Image.new("RGB", (cols * cell * 3 // 1, rows * cell), (22, 20, 18))
        for i, (cid, art, mp) in enumerate(sheet):
            front = art.crop((0, 0, 256, 256))
            mf = mp.crop((0, 0, 256, 256)).convert("RGB")
            ov = Image.composite(Image.new("RGB", (256, 256), (255, 40, 200)), front.convert("RGB"), mp.crop((0, 0, 256, 256)).point(lambda p: int(p * 0.55)))
            x, y = (i % cols) * cell * 3, (i // cols) * cell
            bg = Image.new("RGB", (256, 256), (22, 20, 18))
            bg.paste(front, (0, 0), front)
            S.paste(bg, (x, y))
            S.paste(mf, (x + cell, y))
            S.paste(ov, (x + cell * 2, y))
        S.save(args.sheet)
    print(f"{len(sheet)} maps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
