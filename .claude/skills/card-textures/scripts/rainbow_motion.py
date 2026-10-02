#!/usr/bin/env python3
"""How many spectra really slide past as the pointer crosses a card, measured from renders.

  python3 .claude/skills/card-textures/scripts/rainbow_motion.py --set svp --cards svp004,svp001 [--steps 41]
      [--axis x|y|both] [--browser webkit]

rainbow_speed.py reads the CSS, one layer at a time; this renders the card the way the site draws it, every layer
and blend together. The lab draws the cards flat (tilt off) at --steps poses across the card (x, at mid height)
and down it (y, at mid width); per pixel it follows the colour's chroma (a = R - G, b = (R + G) / 2 - B) minus its
mean over the sweep, which turns once round for every spectrum that slides past. It prints, over the pixels whose
colour moves at all, the median and 75th percentile of those turns, and of light bars passing (half the sign
changes of the pixel's brightness about its mean). A real holo is about one; XY Glaceon-EX 116 (Noah's "moves way
too fast", 2026-10-02) measured 6.8 and 9.0. The steps must keep a turn under half a circle: 41 reads up to ~20.
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROBE = os.path.join(HERE, "foil_probe.mjs")

ap = argparse.ArgumentParser()
ap.add_argument("--set", required=True); ap.add_argument("--cards", required=True)
ap.add_argument("--steps", type=int, default=41); ap.add_argument("--axis", default="both")
ap.add_argument("--w", type=int, default=220); ap.add_argument("--browser", default="chromium")
ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "rainbow-motion")); ap.add_argument("--css", default="")
ap.add_argument("--keep", action="store_true")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

def sweep(axis):
    vals = np.linspace(0, 100, a.steps)
    poses = ",".join(f"{v:.1f}:50" if axis == "x" else f"50:{v:.1f}" for v in vals)
    png = os.path.join(a.out, f"{a.set}-{axis}.png")
    q = f"set={a.set}&cards={a.cards}&proof=off&maps=1&w={a.w}&tilt=0&poses={poses}"
    n = len(a.cards.split(","))
    cmd = ["node", PROBE, "--query", q, "--out", png, "--width", str(n * (a.w + 40) + 60), "--scale", "1", "--boxes", "1",
           "--browser", a.browser]
    if a.css: cmd += ["--css", a.css]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])
    img = np.asarray(Image.open(png).convert("RGB")).astype(np.float32)
    boxes = json.load(open(png[:-4] + ".boxes.json"))
    if not a.keep: os.remove(png); os.remove(png[:-4] + ".boxes.json")
    by = {}
    for j, b in enumerate(boxes):
        by.setdefault(j % n, []).append(b)
    out = {}
    for i, bs in by.items():
        w, h = int(bs[0]["w"]) - 4, int(bs[0]["h"]) - 4
        stack = np.stack([img[int(round(b["y"])) + 2:int(round(b["y"])) + 2 + h, int(round(b["x"])) + 2:int(round(b["x"])) + 2 + w] for b in bs])
        out[bs[0]["caption"][:40] + f" #{i}"] = (stack, bs[0]["card"])
    return out

def measure(stack):
    R, G, B = stack[..., 0], stack[..., 1], stack[..., 2]
    ca, cb = R - G, (R + G) / 2 - B
    L = (R + G + B) / 3
    ra, rb = ca - ca.mean(0), cb - cb.mean(0)
    mag = np.hypot(ra, rb)
    th = np.arctan2(rb, ra)
    d = np.angle(np.exp(1j * np.diff(th, axis=0)))
    ok = (mag[1:] > 6) & (mag[:-1] > 6)
    d = np.where(ok, d, 0)
    wind = np.abs(d.sum(0)) / (2 * np.pi)
    act = mag.mean(0) > 14
    rl = L - L.mean(0)
    s = np.sign(np.where(np.abs(rl) > 4, rl, 0))
    bars = np.zeros(L.shape[1:])
    last = np.zeros(L.shape[1:])
    for t in range(s.shape[0]):
        cur = s[t]
        flip = (cur != 0) & (last != 0) & (cur != last)
        bars += flip
        last = np.where(cur != 0, cur, last)
    bars /= 2
    lact = np.abs(rl).mean(0) > 6
    def stat(v, m):
        return (float(np.median(v[m])), float(np.percentile(v[m], 75))) if m.sum() > 50 else (0.0, 0.0)
    return stat(wind, act), float(act.mean()), stat(bars, lact), float(lact.mean())

axes = ["x", "y"] if a.axis == "both" else [a.axis]
for ax in axes:
    for name, (stack, cls) in sweep(ax).items():
        (wm, wp), af, (bm, bp), lf = measure(stack)
        fin = [c for c in cls.split() if c.startswith("foil-")]
        print(f"{ax} {name:44s} rainbow turns median {wm:.2f} p75 {wp:.2f} on {af*100:.0f}% | bars median {bm:.2f} p75 {bp:.2f} on {lf*100:.0f}% | {' '.join(fin)}")
