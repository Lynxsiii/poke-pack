"""Per-card etched foil maps for Special Illustration and Black White Rares.

These are the stamp layer under the sheen. Each map is registered to that
card's illustration so ridges follow the painting instead of a tiled swirl.

They are synthesised from our own scans — not third-party TCG Live dumps:

  1. Difference-of-Gaussians pulls the high-frequency hatch already in the
     photo (SARs and BWRs print with a physical stamp; it shows up in the scan).
  2. A sunpillar (radial rays + concentric rings) fills flatter regions, warped
     by the painting's light so the extra lines bend with the art.
  3. Flow-aligned hatch follows local edge direction, the way engraved lines
     wrap a figure.
  4. The subject is softened, not punched out, so the Pokémon keeps a faint
     form-following etch instead of a hard silhouette hole.

Output is a white-on-transparent WebP (alpha = ridge strength) at the scan
size, used as a CSS mask so the sheen only catches on the stamp.

    py scripts/make_etch_maps.py
    py scripts/make_etch_maps.py --only me1/177 zsv10pt5/172
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "assets" / "foil" / "etch"
SKIP_DATA = {"patch-notes.json", "sealed.json", "price-history.json"}
RARITIES = {"Special Illustration Rare", "Black White Rare"}


def blur(arr: np.ndarray, radius: float) -> np.ndarray:
    im = Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), "L")
    im = im.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.asarray(im, dtype=np.float32) / 255.0


def sobel(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    p = np.pad(arr, 1, mode="edge")
    gx = (
        -p[:-2, :-2]
        + p[:-2, 2:]
        - 2 * p[1:-1, :-2]
        + 2 * p[1:-1, 2:]
        - p[2:, :-2]
        + p[2:, 2:]
    )
    gy = (
        -p[:-2, :-2]
        - 2 * p[:-2, 1:-1]
        - p[:-2, 2:]
        + p[2:, :-2]
        + 2 * p[2:, 1:-1]
        + p[2:, 2:]
    )
    return gx.astype(np.float32), gy.astype(np.float32)


def smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def thin_ridges(field: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return smoothstep((field - lo) / max(hi - lo, 1e-5))


def hatch_bank(yy: np.ndarray, xx: np.ndarray, theta: np.ndarray, spacing: float) -> np.ndarray:
    """Three gratings mixed by how well each matches local edge direction."""
    acc = np.zeros_like(xx, dtype=np.float32)
    wsum = np.zeros_like(xx, dtype=np.float32)
    for ang in (0.0, math.pi / 3, 2 * math.pi / 3):
        align = np.cos(theta - ang) ** 2
        phase = (xx * math.cos(ang) + yy * math.sin(ang)) * (2 * math.pi / spacing)
        acc += align * np.abs(np.sin(phase)).astype(np.float32)
        wsum += align
    return acc / np.maximum(wsum, 1e-5)


def make_etch(img: Image.Image, *, mono: bool) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    h, w = rgb.shape[:2]
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    gx, gy = sobel(luma)
    mag = np.sqrt(gx * gx + gy * gy)
    mag_n = mag / (float(np.percentile(mag, 98)) + 1e-5)
    mag_n = np.clip(mag_n, 0, 1)
    theta = np.arctan2(gy, gx) + math.pi / 2

    dog = np.abs(blur(luma, 0.7) - blur(luma, 2.4))
    scan = thin_ridges(dog / (float(np.percentile(dog, 96)) + 1e-5), 0.18, 0.72)

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # Border falloff — keep a frame band for a tighter hatch.
    edge = np.minimum.reduce([xx, yy, (w - 1) - xx, (h - 1) - yy])
    inner = smoothstep((edge - 10) / 36)
    frame = 1.0 - smoothstep((edge - 6) / 14)

    # Subject: colourful or high-detail, away from the frame.
    detail = blur(mag_n, 7)
    chroma = blur(sat, 8)
    if mono:
        subject = smoothstep((detail - 0.12) / 0.28) * inner
        subject *= 0.55
    else:
        subject = smoothstep((detail * 0.65 + chroma * 0.55 - 0.14) / 0.32) * inner

    # Focal point: dark, saturated mass (the figure), biased toward centre.
    cy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    cx = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    centre = np.exp(-((cx - 0.5) ** 2 / 0.18 + (cy - 0.42) ** 2 / 0.22))
    weight = (0.25 + sat) * (1.05 - luma) * centre * inner
    wtot = float(weight.sum()) + 1e-5
    fx = float((weight * xx).sum() / wtot)
    fy = float((weight * yy).sum() / wtot)

    dx = xx - fx
    dy = yy - fy
    radius = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    warp = (blur(luma, 10) - 0.5) * 2.4 + (blur(mag_n, 12) - 0.2) * 1.1

    rays = np.abs(np.sin(ang * 40 + warp * 3.2))
    rings = np.abs(np.sin(radius * 0.38 + warp * 2.4))
    pillar = np.maximum(thin_ridges(rays, 0.62, 0.9), thin_ridges(rings, 0.64, 0.9) * 0.9)

    fine = hatch_bank(yy, xx, theta, 3.15)
    form = hatch_bank(yy, xx, theta, 5.4)
    hatch = np.maximum(thin_ridges(fine, 0.7, 0.94) * 0.85, thin_ridges(form, 0.68, 0.92) * 0.55)

    frame_hatch = thin_ridges(
        np.abs(np.sin((xx * 0.85 + yy * 0.55) * (2 * math.pi / 3.4))),
        0.66,
        0.92,
    )

    bg = np.maximum(pillar, hatch * 0.28)
    fg = np.maximum(hatch * (0.4 if mono else 0.5), scan)
    # Background carries the sunpillar; the figure keeps a quieter form-etch.
    amp_bg = 1.0 - subject * (0.28 if mono else 0.7)
    amp_fg = 0.2 + subject * (0.85 if mono else 0.72)
    out = bg * amp_bg + fg * amp_fg
    out = np.maximum(out, frame_hatch * frame * 0.7)
    out = np.clip(out * 1.12, 0, 1)

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (out * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def iter_cards():
    for path in sorted(DATA.glob("*.json")):
        if path.name in SKIP_DATA:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, list):
            continue
        for card in data:
            if card.get("rarity") not in RARITIES:
                continue
            rel = card.get("image") or ""
            src = ROOT / rel.replace("\\", "/")
            if not src.is_file():
                print(f"skip missing {rel}")
                continue
            yield card, src


def dest_for(src: Path) -> Path:
    # assets/cards/<set>/<number>.webp → assets/foil/etch/<set>/<number>.webp
    set_id = src.parent.name
    return OUT / set_id / src.name


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", default=(), help="set/number stems, e.g. me1/177")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    wanted = {item.replace("\\", "/").lower() for item in args.only}

    n = 0
    for card, src in iter_cards():
        key = f"{src.parent.name}/{src.stem}".lower()
        if wanted and key not in wanted:
            continue
        dest = dest_for(src)
        if dest.exists() and not args.force:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        mono = card.get("rarity") == "Black White Rare"
        img = Image.open(src)
        etch = make_etch(img, mono=mono)
        # Masks scale with the card; a shorter edge keeps the stamp sharp
        # enough and the files small enough to ship with the set.
        etch = etch.resize((400, 559), Image.Resampling.LANCZOS)
        etch.save(dest, format="WEBP", quality=78, method=4)
        n += 1
        print(f"{key:22} {dest.stat().st_size:6}B  {card['name']}")
    print(f"wrote {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
