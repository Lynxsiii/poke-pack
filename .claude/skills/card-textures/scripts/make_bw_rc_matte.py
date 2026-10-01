"""Radiant Collection window masks with the Pokemon (mostly) matte: window-basic-v2.webp, window-trainer-v2.webp.

The photos of the real Confetti prints (Radiant Gardevoir RC10, McDonald's 2011 Blitzle; /mnt/project-files/every-era/bw/texture-refs/g1/)
show the chips on the background only: the Pokemon is smooth. TCG Live has no map for the Radiant Collection, so the Pokemon's
place is the average of TCG Live's maps of every regular-frame Black & White Rare Holo Pokemon (151 of them: a soft dark blob in
the middle of the window, background light at the edges). The v2 mask is the existing window mask (make_bw_rc.py) times that
average, stretched to 0.12..1, so the chips thin out over the middle of the window instead of painting the Pokemon white, and the
text box and frame stay clear as before. A trainer's window is the same average fitted to the trainer window's box.

    python3 .claude/skills/card-textures/scripts/make_bw_rc_matte.py      (needs assets/foil/maps/bw1..bw11)

Never over an existing file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "assets" / "foil" / "bw-rc"
BOX = {"basic": (27, 49, 339, 267), "trainer": (23, 79, 343, 267)}  # x0, y0, x1, y1 of each window mask (alpha > 0.5)


def average() -> np.ndarray:
    maps = []
    for n in range(1, 12):
        data = json.loads((ROOT / "data" / f"bw{n}.json").read_text())
        for c in data["cards"] if isinstance(data, dict) else data:
            if c["rarity"] != "Rare Holo" or c["supertype"] != "Pokémon" or c.get("rc"):
                continue
            f = ROOT / "assets" / "foil" / "maps" / f"bw{n}" / f"{c['number']}.webp"
            if f.exists():
                maps.append(np.array(Image.open(f).convert("RGBA"))[..., 3] / 255.0)
    if len(maps) < 100:
        sys.exit(f"only {len(maps)} maps found; check out assets/foil/maps/bw1..bw11")
    return np.mean(maps, axis=0)


def main() -> None:
    mean = average()
    x0, y0, x1, y1 = BOX["basic"]
    core = mean[y0:y1, x0:x1]
    lo, hi = np.percentile(core, 2), np.percentile(core, 98)
    for kind, box in BOX.items():
        path = OUT / f"window-{kind}-v2.webp"
        if path.exists():
            sys.exit(f"{path} exists; pick a new name (assets are immutable)")
        win = np.array(Image.open(OUT / f"window-{kind}.webp").convert("RGBA"))
        bx0, by0, bx1, by1 = box
        part = Image.fromarray((np.clip((core - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)).resize((bx1 - bx0, by1 - by0), Image.BICUBIC)
        m = np.ones(win.shape[:2], float)
        m[by0:by1, bx0:bx1] = 0.12 + 0.88 * (np.array(part) / 255.0) ** 1.2
        win[..., 3] = (win[..., 3] * m).astype(np.uint8)
        Image.fromarray(win, "RGBA").save(path, "WEBP", quality=92, method=6)
        print("wrote", path.relative_to(ROOT), path.stat().st_size)


if __name__ == "__main__":
    main()
