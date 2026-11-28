#!/usr/bin/env python3
"""Find and cut white page background left on sealed product photos.

Every shop tile shows its product on the site's dark stage, so paper left
around a box, tin or blister reads as a white wedge. Most of it came from
build_products.cut_out: it wraps the product in a convex hull, so a concave
outline (a collector chest's handle, a trainer kit's hanger tabs, a display
box's raised lid, blisters hung side by side) keeps the white in the dips.

This cuts by SHAPE, not colour, so white printed on a product survives:

  * a light pixel (min channel >= 249, unsaturated) is a candidate only when a
    run of light pixels joins it to the transparent background or the image
    edge, so white art inside a box is never reached;
  * the candidate area is opened with a 3 px disk and blobs under 0.08% of the
    image are dropped, so a white box edge that runs along the outline as a
    thin strip is kept: only solid patches of paper go;
  * then a 2 px rim of light pixels along the outline (the photo's white halo)
    is faded, and the new edge is softened;
  * then defringe() un-mixes the outer 3 px from white: a rim pixel lighter
    than the product just inside it is faded and given the product's colour.

A photo is also flagged when more than 60% of its outline is a white halo
(halo()). That catches photos cut from a JPEG whose page is off-white (the
Evolutions Elite Trainer Boxes, 11-28: page at 243-248 under a faint
watermark, which the 249 cut above never sees). Open those on the dark stage:
off-white page between items laid out on white needs `--wide --holes`.

    python3 scripts/check_product_photos.py              # check every photo, exit 1 when one is flagged
    python3 scripts/check_product_photos.py --changed    # only photos changed from origin/master (new products)
    python3 scripts/check_product_photos.py --sheet out.png   # draw flagged photos, paper in magenta
    python3 scripts/check_product_photos.py --fix assets/products/xy4/collector-chest-2014.webp ...

--fix never overwrites (assets/ is cached for a year): it writes the next free
-vN name, sets `imageVersion` on the product in data/sets/<set>.json and the
new `image` in data/products.json, and deletes nothing. `--wide` cuts lighter
paper too (min channel >= 240) for photos whose page is off-white with no
white art at the edge (the Plasma Blast sleeved bundle). `--holes` also cuts
page shut inside the product (the gaps between an old ETB's contents), flooded
from points picked by eye and listed in scripts/product_photo_holes.json.

A photo whose flagged edge is real white product (a white box side, white
blister card, white pack art) is listed in scripts/product_photo_ok.txt after
it has been looked at on the dark stage. Keep that list honest: open the
--sheet first. Run this on every new product photo (set-building checklist).
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
OK_LIST = ROOT / "scripts" / "product_photo_ok.txt"
HOLES = ROOT / "scripts" / "product_photo_holes.json"
LIGHT = 249        # min channel at or above: paper
GREY = 24          # max - min channel at or under: unsaturated
OPEN_R = 3         # disk radius that thin white box edges don't survive
MIN_BLOB = 0.0008  # share of the image a paper blob must cover
FLAG = 0.003       # share of the product that would be cut, above which a photo is flagged
BAND = 3           # px of outline that defringe() looks at
HALO = 0.6         # share of the outline that is a white halo, above which a photo is flagged


def disk(r: int) -> np.ndarray:
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def paper(px: np.ndarray, light: int = LIGHT) -> tuple[np.ndarray, np.ndarray]:
    """(paper mask, outside mask) for an RGBA array."""
    rgb, a = px[..., :3].astype(int), px[..., 3].astype(int)
    mn, mx = rgb.min(-1), rgb.max(-1)
    out = a < 40
    frame = np.zeros_like(out)
    frame[0, :] = frame[-1, :] = frame[:, 0] = frame[:, -1] = True
    edge = out | frame
    pale = (a >= 40) & (mn >= light) & ((mx - mn) <= GREY)
    lab, _ = ndi.label(pale, structure=np.ones((3, 3)))
    ids = np.unique(lab[ndi.binary_dilation(edge, structure=np.ones((3, 3))) & pale])
    rm = np.isin(lab, ids[ids > 0])
    rm = ndi.binary_opening(rm, structure=disk(OPEN_R))
    lab, n = ndi.label(rm)
    if n:
        sizes = ndi.sum(rm, lab, range(1, n + 1))
        rm = np.isin(lab, np.flatnonzero(sizes >= MIN_BLOB * rm.size) + 1)
        lab, _ = ndi.label(rm)
        ids = np.unique(lab[ndi.binary_dilation(edge, iterations=OPEN_R + 2) & rm])
        rm = np.isin(lab, ids[ids > 0])
        # the blob's own pale fringe goes with it
        rm |= ndi.binary_dilation(rm, iterations=OPEN_R + 1) & (mn >= 228) & ((mx - mn) <= 32)
    # a 2 px white halo along the outline
    bg = out | rm
    for _ in range(2):
        bg |= ndi.binary_dilation(bg, structure=np.ones((3, 3))) & ~bg & (mn >= 236) & ((mx - mn) <= 30)
    return bg & ~out, out


def photo_key(rel: str) -> str:
    """'xy12/etb-mega-charizard-y' for any version of that photo."""
    return re.sub(r"(-v\d+)?\.webp$", "", rel.split("assets/products/")[-1])


def hole_seeds(rel: str) -> list[list[int]]:
    if not HOLES.exists():
        return []
    return json.loads(HOLES.read_text()).get(photo_key(rel), [])


def holes(px: np.ndarray, seeds: list[list[int]]) -> np.ndarray:
    """Pale page shut inside the product: a gap between items laid out on white (an old Elite Trainer Box's contents)
    that the convex hull closed over. A gap like that looks exactly like white art (an Energy symbol, a damage
    counter's cross), so nothing here guesses: the page is flooded from the points listed for the photo in
    scripts/product_photo_holes.json, which someone picked after looking at it."""
    rgb, a = px[..., :3].astype(int), px[..., 3].astype(int)
    mn, mx = rgb.min(-1), rgb.max(-1)
    pale = (a >= 40) & (mn >= 225) & ((mx - mn) <= 30)
    lab, _ = ndi.label(pale)
    ids = {int(lab[y, x]) for x, y in seeds if 0 <= y < lab.shape[0] and 0 <= x < lab.shape[1]} - {0}
    keep = np.isin(lab, list(ids))
    keep |= ndi.binary_dilation(keep, iterations=2) & (mn >= 200) & ((mx - mn) <= 40)
    return keep


def defringe(px: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Fade the white halo a cut on white leaves along the outline.

    A pixel in the outer BAND px that is lighter than the product just inside it is that product mixed with white
    page: c = k*f + (1-k)*255, with f the nearest pixel deeper than BAND. Solve k per channel, scale alpha by it and
    give the pixel f's colour, so the edge fades into the stage instead of glowing. A white box edge is as light as
    the box inside it, so it is not touched. Returns (photo, pixels faded below 70%)."""
    a = px[..., 3].astype(float)
    gone = a < 40
    dist = ndi.distance_transform_edt(~gone)
    core = dist > BAND
    if not core.any():
        return px, np.zeros(a.shape, bool)
    _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
    band = ~gone & ~core
    rgb = px[..., :3].astype(float)
    f = rgb[iy, ix]
    den = 255 - f
    k = np.where(den >= 40, (255 - rgb) / np.maximum(den, 1), -1).max(-1)
    k = np.where(k < 0, 1, np.clip(k, 0, 1))
    lighter = (rgb.min(-1) - f.min(-1)) > 12
    k = np.where(band & lighter, k, 1)
    out = px.copy()
    out[..., 3] = (a * k).round().astype(np.uint8)
    sel = k < 1
    out[..., :3][sel] = f[sel].round().astype(np.uint8)
    return out, k < 0.7


def halo(px: np.ndarray) -> float:
    """Share of the solid outline that defringe() would fade below 70%."""
    a = px[..., 3]
    rim = (a >= 200) & ndi.binary_dilation(a < 40, structure=np.ones((3, 3)))
    _, faded = defringe(px)
    return float((faded & rim).sum()) / max(1, int(rim.sum()))


def clean(px: np.ndarray, light: int = LIGHT, seeds: list[list[int]] | None = None) -> tuple[np.ndarray, np.ndarray]:
    rm, _ = paper(px, light)
    if seeds:
        rm |= holes(px, seeds)
    a = px[..., 3]
    alpha = np.where(rm, 0, a).astype(np.uint8)
    soft = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7)))
    near = ndi.binary_dilation(rm, iterations=2)
    out = px.copy()
    out[..., 3] = np.where(near, np.minimum(alpha, soft), a)
    out, faded = defringe(out)
    return out, rm | faded


def share(px: np.ndarray, rm: np.ndarray) -> float:
    """Share of the product that is paper, not counting the 2 px halo (every photo has a little)."""
    core = ndi.binary_opening(rm, structure=disk(2))
    return float(core.sum()) / max(1, int((px[..., 3] >= 128).sum()))


def load(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"))


def ok_list() -> set[str]:
    if not OK_LIST.exists():
        return set()
    return {ln.split("#")[0].strip() for ln in OK_LIST.read_text().splitlines() if ln.split("#")[0].strip()}


def live_images() -> list[str]:
    d = json.loads((ROOT / "data/products.json").read_text())
    return sorted({p["image"] for k, v in d.items() if not k.startswith("_") for p in v if p.get("image")})


def changed_images() -> list[str]:
    try:
        out = subprocess.run(["git", "diff", "--name-only", "--diff-filter=AM", "origin/master", "--", "assets/products"],
                             cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return []
    return [ln for ln in out.splitlines() if ln.endswith(".webp")]


def next_name(rel: str) -> str:
    m = re.match(r"(.*?)(?:-v(\d+))?\.webp$", rel)
    base, v = m.group(1), int(m.group(2) or 1)
    while True:
        v += 1
        cand = f"{base}-v{v}.webp"
        if not (ROOT / cand).exists():
            return cand


def fix(rel: str, light: int, cut_holes: bool = False) -> str | None:
    px = load(ROOT / rel)
    seeds = hole_seeds(rel) if cut_holes else None
    if cut_holes and not seeds:
        print(f"{rel}: --holes, but scripts/product_photo_holes.json lists no points for {photo_key(rel)}")
    out, rm = clean(px, light, seeds)
    if not rm.any():
        return None
    new = next_name(rel)
    Image.fromarray(out).save(ROOT / new, "WEBP", quality=90, method=6, exact=True)
    set_id, file = rel.split("/")[-2], rel.split("/")[-1]
    pid = re.sub(r"(-v\d+)?\.webp$", "", file)
    version = int(re.search(r"-v(\d+)\.webp$", new).group(1))
    cfg_path = ROOT / f"data/sets/{set_id}.json"
    if cfg_path.exists():
        text = cfg_path.read_text()
        cfg = json.loads(text)
        for p in cfg.get("products", []):
            if p.get("id") == pid:
                p["imageVersion"] = version
        cfg_path.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    prod_path = ROOT / "data/products.json"
    prod = json.loads(prod_path.read_text())
    for key, rows in prod.items():  # a kit's two half-deck pages share one photo
        for p in rows if isinstance(rows, list) else []:
            if p.get("image") == rel:
                p["image"] = new
    prod_path.write_text(json.dumps(prod, indent=2, ensure_ascii=False) + "\n")
    return new


def sheet(items: list[tuple[str, np.ndarray, np.ndarray]], dest: Path) -> None:
    cell, cols = 220, 6
    rows = max(1, (len(items) + cols - 1) // cols)
    canvas = Image.new("RGB", (cols * cell, rows * (cell + 14)), (34, 30, 52))
    d = ImageDraw.Draw(canvas)
    for i, (rel, px, rm) in enumerate(items):
        t = px.copy()
        t[rm] = (255, 0, 170, 255)
        im = Image.fromarray(t)
        im.thumbnail((cell - 8, cell - 8))
        x, y = (i % cols) * cell, (i // cols) * (cell + 14)
        canvas.paste(im, (x + 4, y + 4), im)
        d.text((x + 3, y + cell - 2), rel[16:56], fill=(230, 230, 230))
    canvas.save(dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--changed", action="store_true", help="only photos added or changed since origin/master")
    ap.add_argument("--fix", action="store_true", help="write cleaned -vN copies and point the data at them")
    ap.add_argument("--wide", action="store_true", help="with --fix: cut off-white paper too (min channel >= 240)")
    ap.add_argument("--holes", action="store_true", help="with --fix: also cut page shut inside the product, flooded from the photo's points in product_photo_holes.json")
    ap.add_argument("--sheet", help="draw the flagged photos with the paper in magenta")
    args = ap.parse_args()
    rels = [str(Path(p).resolve().relative_to(ROOT)) for p in args.paths] if args.paths else (
        changed_images() if args.changed else live_images())
    if args.fix:
        for rel in rels:
            new = fix(rel, 240 if args.wide else LIGHT, args.holes)
            print(f"{rel} -> {new}" if new else f"{rel}: nothing to cut")
        return 0
    allowed = ok_list()
    flagged = []
    for rel in rels:
        px = load(ROOT / rel)
        rm, _ = paper(px)
        s = share(px, rm)
        h = halo(px)
        if (s > FLAG or h > HALO) and rel not in allowed:
            flagged.append((rel, px, rm | defringe(px)[1]))
            why = f"{s:.1%} of the product looks like white page" if s > FLAG else f"{h:.0%} of the outline is a white halo"
            print(f"{rel}: {why}")
    if args.sheet and flagged:
        sheet(flagged, Path(args.sheet))
    print(f"{len(flagged)} of {len(rels)} product photos flagged", file=sys.stderr)
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
