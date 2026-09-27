"""Cut the white box out of booster pack art that came without transparency.

pokesymbols.com serves the Mega Evolution packs and the Scarlet & Violet packs
from Journey Together on as isolated AVIFs with real alpha. The older Scarlet &
Violet packs (and the 30th Celebration Classic Collection pack) come as opaque
RGB images: the same wrapper render, flattened onto white. On the site's dark
background that shows as a white strip down both sides of the pack, where the
wrapper pinches in between the crimps.

Every modern wrapper render has the same silhouette, so this script takes it
from the packs that do have alpha (REFERENCES), fits it to each opaque image's
own white margin row by row, and pulls the white out of the edge pixels.
It writes the .avif and the .png fallback next to each other, in place.

    python3 scripts/clean_pack_art.py assets/packs/sv8/pack-0.avif ...
    python3 scripts/clean_pack_art.py --all      # every opaque pack under assets/packs
    python3 scripts/clean_pack_art.py --check    # list opaque packs, change nothing

Packs that already have transparent margins are left alone, so reruns are safe.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "assets" / "packs"

# Isolated renders with real alpha, all the same wrapper shape.
REFERENCES = [
    "sv9/pack-0.avif", "sv9/pack-1.avif", "sv9/pack-2.avif", "sv9/pack-3.avif",
    "sv10/pack-0.avif", "sv10/pack-1.avif", "sv10/pack-2.avif", "sv10/pack-3.avif",
    "me5/darkrai.avif", "me4/greninja.avif", "me1/pack-0.avif",
]
# Vintage packs are tight photos, not wrapper renders.
SKIP_DIRS = {"base1"}

WHITE = 232  # min channel at or above this counts as background white
AVIF_QUALITY = 90


def load_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)


def is_opaque(path: Path) -> bool:
    """True when the pack's side margins are solid instead of see-through."""
    a = load_rgba(path)[..., 3]
    h = a.shape[0]
    body = a[int(h * 0.3): int(h * 0.7)]
    return float(body[:, :3].mean()) > 200 and float(body[:, -3:].mean()) > 200


def template(size: tuple[int, int]) -> np.ndarray:
    """Mean alpha of the reference renders, resized to (w, h), 0..1."""
    w, h = size
    acc = np.zeros((h, w), np.float32)
    for rel in REFERENCES:
        alpha = Image.open(PACKS / rel).convert("RGBA").getchannel("A")
        acc += np.asarray(alpha.resize((w, h), Image.BILINEAR), np.float32) / 255
    return acc / len(REFERENCES)


def edges(mask_row: np.ndarray) -> tuple[int, int]:
    xs = np.flatnonzero(mask_row)
    if not len(xs):
        return 0, len(mask_row) - 1
    return int(xs[0]), int(xs[-1])


def smooth(values: np.ndarray, window: int = 9) -> np.ndarray:
    pad = window // 2
    padded = np.pad(values, pad, mode="edge")
    return np.array([np.median(padded[i: i + window]) for i in range(len(values))])


def unmix(obs: np.ndarray, fg: np.ndarray) -> tuple[float, np.ndarray]:
    """Alpha and colour of a pixel blended over white, given the colour just inside it."""
    reach = 255 - fg
    if reach.max() < 30:  # the pack is nearly white here too: trust the shape, not the colour
        return 1.0, obs
    alpha = float(np.clip(((255 - obs) * reach).sum() / (reach * reach).sum(), 0, 1))
    if alpha < 0.05:
        return 0.0, fg
    colour = np.clip((obs - (1 - alpha) * 255) / alpha, 0, 255)
    return alpha, colour


def clean(path: Path) -> Image.Image:
    rgba = load_rgba(path)
    rgb = rgba[..., :3]
    h, w = rgb.shape[:2]
    tpl = template((w, h))

    nonwhite = rgb.min(axis=2) < WHITE
    out_rgb = rgb.copy()
    alpha = np.zeros((h, w), np.float32)

    left = np.zeros(h)
    right = np.zeros(h)
    for y in range(h):
        tl, tr = edges(tpl[y] >= 0.5)
        ol, orr = edges(nonwhite[y])
        # The measured edge wins when it agrees with the wrapper shape; where
        # white art runs into the margin, the shape decides.
        left[y] = ol if abs(ol - tl) <= 2 else tl
        right[y] = orr if abs(orr - tr) <= 2 else tr
    left = np.round(smooth(left)).astype(int)
    right = np.round(smooth(right)).astype(int)

    for y in range(h):
        lx, rx = left[y], right[y]
        alpha[y, lx: rx + 1] = 1
        # Edge pixels: one outside the edge (a faint blend) and the edge pixel itself.
        for x, inner in ((lx - 1, lx + 2), (lx, lx + 2), (rx + 1, rx - 2), (rx, rx - 2)):
            if not (0 <= x < w and 0 <= inner < w):
                continue
            a, c = unmix(rgb[y, x], rgb[y, inner])
            if x in (lx - 1, rx + 1):
                a = min(a, 0.5)
            alpha[y, x] = a
            out_rgb[y, x] = c

    out = np.dstack([out_rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def targets(args: argparse.Namespace) -> list[Path]:
    if args.files:
        return [Path(f).resolve() for f in args.files]
    found = []
    for avif in sorted(PACKS.glob("*/*.avif")):
        if avif.parent.name in SKIP_DIRS or avif.relative_to(PACKS).as_posix() in REFERENCES:
            continue
        found.append(avif)
    return found


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="pack .avif files (their .png fallback is rewritten too)")
    ap.add_argument("--all", action="store_true", help="every opaque pack under assets/packs")
    ap.add_argument("--check", action="store_true", help="only list opaque packs")
    args = ap.parse_args()
    if not args.files and not (args.all or args.check):
        ap.error("give pack files, --all or --check")

    opaque = [p for p in targets(args) if is_opaque(p)]
    for path in opaque:
        rel = path.relative_to(ROOT)
        if args.check:
            print(f"opaque  {rel}")
            continue
        img = clean(path)
        img.save(path, "AVIF", quality=AVIF_QUALITY)
        img.save(path.with_suffix(".png"), "PNG", optimize=True)
        print(f"cleaned {rel} ({path.stat().st_size // 1024} KB avif)")
    if not opaque:
        print("no opaque packs")
    return 1 if args.check and opaque else 0


if __name__ == "__main__":
    sys.exit(main())
