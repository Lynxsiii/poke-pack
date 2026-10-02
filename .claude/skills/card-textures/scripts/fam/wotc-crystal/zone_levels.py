#!/usr/bin/env python3
"""Measure what the wotc-crystal foil adds, zone by zone: foil-minus-bare luminance on each Crystal Pokémon.

Renders the lab twice with flat poses (tilt=0, so the card's pixels line up with its maps): once as the site draws the
card, once with .foil, .cure and .glare hidden. Each card's maps (assets/foil/fam/wotc-crystal/<id>-foil-v1.webp) give
the zones:
  sky       the art window's foil (foil map > 0.6): should rise clearly when lit (a Rare Holo window is +20..30)
  pokemon   the window where the map is 0 (the Pokémon): matte, within a few levels of bare
  textbox   the attack / Poké-BODY box (matte print)
  frame     the yellow border right of the window and the name bar (matte print)
Prints mean and 95th percentile of foil-minus-bare (luminance levels) per card, pose and zone.

    python3 .claude/skills/card-textures/scripts/fam/wotc-crystal/zone_levels.py --set ecard3 --cards 146,149 \\
        [--poses rest,30:25,75:65,50:78] [--scale 2] [--out <dir>] [--browser webkit]
Wrap it in /home/user/holo-tools/render-slot.sh (it runs two browser renders).
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "..", ".."))
PROBE = os.path.join(ROOT, ".claude", "skills", "card-textures", "scripts", "foil_probe.mjs")
MAPS = os.path.join(ROOT, "assets", "foil", "fam", "wotc-crystal")
WIN = os.path.join(ROOT, "assets", "foil", "wotc-ecard", "win-pokemon-v1.webp")
HIDE = ".tcg .foil, .tcg .glare, .tcg .cure { display: none !important }"


def probe(query, out, width, scale, browser, css=None):
    cmd = ["node", PROBE, "--query", query, "--out", out, "--width", str(width), "--scale", str(scale), "--boxes"]
    if css:
        cmd += ["--css", css]
    if browser != "chromium":
        cmd += ["--browser", browser]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        sys.stderr.write(r.stdout + r.stderr)
        raise SystemExit("foil_probe failed")


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", required=True)
    ap.add_argument("--poses", default="rest,30:25,75:65,50:78")
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--w", type=int, default=220)
    ap.add_argument("--browser", default="chromium")
    ap.add_argument("--out", default="/tmp/crystal-zones")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    cards = [c for c in args.cards.split(",") if c]
    q = f"set={args.set}&cards={','.join(cards)}&proof=off&tilt=0&w={args.w}&poses={args.poses}"
    width = (args.w + 60) * len(cards) + 80
    foil_png = os.path.join(args.out, f"{args.set}-foil.png")
    bare_png = os.path.join(args.out, f"{args.set}-bare.png")
    probe(q, foil_png, width, args.scale, args.browser)
    probe(q, bare_png, width, args.scale, args.browser, HIDE)
    boxes = json.load(open(foil_png[:-4] + ".boxes.json"))
    foil = np.asarray(Image.open(foil_png).convert("RGB")).astype(np.float32)
    bare = np.asarray(Image.open(bare_png).convert("RGB")).astype(np.float32)
    h = min(foil.shape[0], bare.shape[0])
    d = lum(foil[:h]) - lum(bare[:h])
    win = np.asarray(Image.open(WIN))[..., 3] > 127
    s = args.scale
    print(f"{'card':12s} {'pose':6s} " + " ".join(f"{z:>14s}" for z in ("sky", "pokemon", "textbox", "frame")))
    for b in boxes:
        num = b["caption"].split("·", 1)[-1].strip().split()[0]
        cid = f"{args.set}-{num}"
        mp = os.path.join(MAPS, f"{cid}-foil-v1.webp")
        if not os.path.exists(mp):
            continue
        x0, y0 = int(round(b["x"] * s)), int(round(b["y"] * s))
        x1, y1 = int(round((b["x"] + b["w"]) * s)), int(round((b["y"] + b["h"]) * s))
        dd = d[y0:y1, x0:x1]
        H, W = dd.shape
        fm = np.asarray(Image.open(mp).resize((W, H), Image.BILINEAR))[..., 3] / 255.0
        wm = np.asarray(Image.fromarray(win.astype(np.uint8) * 255).resize((W, H), Image.BILINEAR)) > 127
        yy, xx = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
        zones = {
            "sky": (fm > 0.6) & wm,
            "pokemon": wm & (fm < 0.02),
            "textbox": (yy > 0.52) & (yy < 0.85) & (xx > 0.16) & (xx < 0.9),
            "frame": ((xx > 0.955) & (xx < 0.985) & (yy > 0.1) & (yy < 0.9)) | ((yy > 0.06) & (yy < 0.1) & (xx > 0.3) & (xx < 0.7)),
        }
        cells = []
        for z, m in zones.items():
            v = dd[m]
            cells.append(f"{v.mean():+6.1f} p95{np.percentile(v, 95):+5.0f}" if v.size else " " * 14)
        print(f"{cid:12s} {b['pose']:6s} " + " ".join(cells))


if __name__ == "__main__":
    main()
