"""Fetch TCG Live's per-card foil and etch maps, and optionally ship them.

A foil map says exactly which parts of a printed card are foil (white),
partly foil (grey) or plain (black); an etch map, for etched prints, where
the texture is cut. They are what pokemon-cards-151 masks every card with,
and the single biggest step towards a foil that looks like the real card.

Noah decided on 2026-09-27 that the site ships these maps (see
reference/masks.md). They come from Pokémon TCG Live via malie.io; credit
them in NOTICE.md when they first ship.

    # look only: into the lab's gitignored cache (lab/cache/<set>/)
    python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set me55 --cards 12,14,23

    # ship: every card's maps as site assets, and the paths onto the cards
    python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --set me55 --all --ship --write-data

--ship writes assets/foil/maps/<set>/<n>.webp (foil, 367x512) and
<n>-etch.webp (400 px wide, the size of the site's own etch maps). Both are
alpha masks, white with the map's brightness as alpha, like every other mask
on the site, so they work with the default mask-mode and in -webkit- mask
stacks. --write-data adds `foilMap` and
`etchMap` paths to each card in data/<set>.json, and removes them from cards
that have none, the way make_owner_masks.py stamps `ownerMask`.

Two extras, both written with --ship and recorded with --write-data:

- A colour foil map (TCG Live packs three foil regions into R, G and B, as
  on the 30th Celebration RGB Mews) also gets one alpha mask per channel,
  <n>-foil-r.webp, -g, -b, as `foilMapR`, `foilMapG`, `foilMapB`.
- --etch-bins <cards> splits those cards' etch maps by line direction into
  <n>-etch-h.webp (lines running across) and <n>-etch-v.webp (lines running
  up and down), as `etchMapH` and `etchMapV`. A real etch is a grating: each
  patch lights up at the tilt that matches its line direction, so two layers
  driven by different pointer axes make the cells flash separately, as on
  the Futuristic Rares' op-art plate.

Set keys: SETS below maps a site set id to TCG Live's key, plus any cards
filed under another key. Other sets: --key, or add a row after checking
https://cdn.malie.io/file/malie-io/tcgl/export/index.json.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CACHE = HERE.parent / "lab" / "cache"
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
ETCH_WIDTH = 400

# Site set id -> (TCG Live key for numbered cards, {site number: (key, number)}).
# The RGB Mews are 001-003 in me5-5m, red, green, blue (checked by colour).
SETS = {
    "me55": ("me5-5", {"R": ("me5-5m", 1), "G": ("me5-5m", 2), "B": ("me5-5m", 3)}),
}


def curl(url: str, dest: Path) -> bool:
    # urllib gets a 403 from this CDN; curl is accepted.
    res = subprocess.run(["curl", "-sfL", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
    return res.returncode == 0


def source(set_id: str, key: str | None, number: str) -> tuple[str, int] | None:
    main, extra = SETS.get(set_id, (None, {}))
    if number in extra:
        return extra[number]
    if number.isdigit() and (key or main):
        return key or main, int(number)
    return None


def alpha_mask(path: Path, width: int | None = None) -> Image.Image:
    """White with alpha = the map's luminance times its own alpha (its corners are transparent)."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    lum = lum.clip(0, 255).round().astype(np.uint8)
    white = np.full_like(lum, 255)
    img = Image.fromarray(np.dstack([white, white, white, lum]), "RGBA")
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    return img


def is_colour_map(path: Path) -> bool:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3] > 0
    return float(np.abs(rgb[..., 0] - rgb[..., 1])[alpha].mean() + np.abs(rgb[..., 1] - rgb[..., 2])[alpha].mean()) > 20


def channel_mask(path: Path, channel: int) -> Image.Image:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    v = (a[..., channel] * a[..., 3] / 255).clip(0, 255).round().astype(np.uint8)
    white = np.full_like(v, 255)
    return Image.fromarray(np.dstack([white, white, white, v]), "RGBA")


def blur(x: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian (Pillow cannot blur float images)."""
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    x = np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode="edge"), k, "valid"), 0, x)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode="edge"), k, "valid"), 1, x)


def etch_bins(path: Path, width: int) -> tuple[Image.Image, Image.Image]:
    """Split an etch map by local line direction (structure tensor)."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    lum = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) * a[..., 3] / 255
    gy, gx = np.gradient(blur(lum, 0.8))
    j11, j22, j12 = blur(gx * gx, 5), blur(gy * gy, 5), blur(gx * gy, 5)
    # cos(2 phi) of the gradient direction: +1 when lines run up and down,
    # -1 when they run across; near 0 on diagonals and ring centres.
    c2 = (j11 - j22) / np.maximum(np.hypot(j11 - j22, 2 * j12), 1e-3)
    w_v = ((1 + c2) / 2) ** 1.4
    w_h = ((1 - c2) / 2) ** 1.4
    out = []
    for w in (w_h, w_v):
        v = lum * w
        # Full strength on the brightest lines, so a lit cell reads at full
        # brightness rather than at the half it gets from sharing directions.
        v = v * (255 / max(np.percentile(v[v > 0], 99), 1)) if (v > 0).any() else v
        v = v.clip(0, 255).round().astype(np.uint8)
        white = np.full_like(v, 255)
        img = Image.fromarray(np.dstack([white, white, white, v]), "RGBA")
        out.append(img.resize((width, round(img.height * width / img.width)), Image.LANCZOS))
    return out[0], out[1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True, help="site set id, e.g. me55")
    ap.add_argument("--key", help="TCG Live set key, when the set is not in SETS")
    ap.add_argument("--cards", default="", help="comma-separated site card numbers")
    ap.add_argument("--all", action="store_true", help="every card in data/<set>.json")
    ap.add_argument("--ship", action="store_true", help="also write site assets to assets/foil/maps/<set>/")
    ap.add_argument("--write-data", action="store_true", help="stamp foilMap/etchMap onto data/<set>.json")
    ap.add_argument("--etch-bins", default="", help="card numbers whose etch maps get split by line direction")
    args = ap.parse_args()

    data_path = ROOT / "data" / f"{args.set}.json"
    raw = data_path.read_text(encoding="utf-8")
    cards = json.loads(raw)
    records = cards if isinstance(cards, list) else cards["cards"]
    numbers = [str(c["number"]) for c in records] if args.all else [n.strip() for n in args.cards.split(",") if n.strip()]
    if not numbers:
        sys.exit("give --cards or --all")

    cache = CACHE / args.set
    cache.mkdir(parents=True, exist_ok=True)
    fetched, unknown = 0, []
    for n in numbers:
        src = source(args.set, args.key, n)
        if not src:
            unknown.append(n)
            continue
        key, num = src
        for kind in ("foil", "etch"):
            dest = cache / f"{n}.{kind}.png"
            if dest.exists() or (cache / f"{n}.{kind}.none").exists():
                continue
            if curl(f"{BASE}/{key}/{key}_en_{num:03d}_std.{kind}.png", dest):
                fetched += 1
            else:
                (cache / f"{n}.{kind}.none").touch()  # remember the miss; etch maps are rare
    print(f"{fetched} maps fetched into {cache}")
    if unknown:
        print(f"no TCG Live source for: {', '.join(unknown)} (not in the export, or add them to SETS)")

    if not (args.ship or args.write_data):
        return

    out = ROOT / "assets" / "foil" / "maps" / args.set
    rel = f"assets/foil/maps/{args.set}"
    bins = {n.strip() for n in args.etch_bins.split(",") if n.strip()}
    shipped = {}
    for n in numbers:
        entry = {}
        foil, etch = cache / f"{n}.foil.png", cache / f"{n}.etch.png"
        colour = foil.exists() and is_colour_map(foil)
        split = etch.exists() and n in bins
        if foil.exists():
            entry["foilMap"] = f"{rel}/{n}.webp"
        if colour:
            for c in "RGB":
                entry[f"foilMap{c}"] = f"{rel}/{n}-foil-{c.lower()}.webp"
        if etch.exists():
            entry["etchMap"] = f"{rel}/{n}-etch.webp"
        if split:
            entry["etchMapH"] = f"{rel}/{n}-etch-h.webp"
            entry["etchMapV"] = f"{rel}/{n}-etch-v.webp"
        if args.ship and entry:
            out.mkdir(parents=True, exist_ok=True)
            if foil.exists():
                alpha_mask(foil).save(out / f"{n}.webp", "WEBP", quality=85, alpha_quality=80, method=6)
            if colour:
                for i, c in enumerate("rgb"):
                    channel_mask(foil, i).save(out / f"{n}-foil-{c}.webp", "WEBP", quality=85, alpha_quality=80, method=6)
            if etch.exists():
                alpha_mask(etch, ETCH_WIDTH).save(out / f"{n}-etch.webp", "WEBP", quality=80, alpha_quality=80, method=6)
            if split:
                h, v = etch_bins(etch, ETCH_WIDTH)
                h.save(out / f"{n}-etch-h.webp", "WEBP", quality=80, alpha_quality=80, method=6)
                v.save(out / f"{n}-etch-v.webp", "WEBP", quality=80, alpha_quality=80, method=6)
        shipped[n] = entry
    if args.ship:
        size = sum(f.stat().st_size for f in out.glob("*.webp")) if out.exists() else 0
        print(f"{sum(bool(e) for e in shipped.values())} cards shipped to {out} ({size / 1e6:.1f} MB in the folder)")

    if args.write_data:
        changed = 0
        for record in records:
            n = str(record["number"])
            if n not in shipped:
                continue
            for field in ("foilMap", "foilMapR", "foilMapG", "foilMapB", "etchMap", "etchMapH", "etchMapV"):
                value = shipped[n].get(field)
                if value and record.get(field) != value:
                    record[field] = value
                    changed += 1
                elif not value and field in record:
                    record.pop(field)
                    changed += 1
        after = json.dumps(cards, ensure_ascii=False, indent=2) + "\n"
        if after != raw:
            data_path.write_text(after, encoding="utf-8", newline="\n")
        print(f"{changed} field(s) changed in {data_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
