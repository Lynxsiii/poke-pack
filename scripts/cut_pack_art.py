"""Give flat booster-pack photos a real alpha edge.

pokesymbols serves isolated AVIFs with alpha for the newest sets, but
Prismatic Evolutions and everything older comes back as a flat photo of the
pack on a white studio backdrop. Dropped onto the dark site those read as a
pack in a white box, so the wrapper needs cutting out before it ships.

The packs are photographed straight on, so the backdrop is a thin frame:
seven-ish pixels down each side, nothing above or below where the crimped
seal flares out to the edge. That shape is what makes this tractable — walk
inward from each edge, stop at the first pixel that is not the backdrop, and
the run you consumed is background. Flood fill is not needed and would risk
leaking through the pale art some wrappers carry at their edge.

Usage:  python3 scripts/cut_pack_art.py [set-id ...]      (default: all flat sets)
"""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACKS = ROOT / "assets" / "packs"

# Sets whose upstream art has no alpha. Prismatic Evolutions and down.
FLAT_SETS = ["sv8pt5", "sv8", "sv7", "sv6pt5", "sv6", "sv5", "base1"]

# How far a pixel may drift from the sampled backdrop and still count as
# backdrop. The studio white is even; the Base Set collage is a soft grey
# gradient, so it needs the looser band.
TOLERANCE = {"base1": 34}
DEFAULT_TOLERANCE = 26

# Below `SOFT` from the backdrop a pixel is fully background, above `HARD` it
# is fully pack; between, it is the anti-aliased edge and gets partial alpha.
SOFT = 10
HARD = 30


def backdrop(rgb: np.ndarray) -> np.ndarray:
    """Median colour of the outermost two pixels — the photo's backdrop."""
    edges = np.concatenate([
        rgb[:2].reshape(-1, 3), rgb[-2:].reshape(-1, 3),
        rgb[:, :2].reshape(-1, 3), rgb[:, -2:].reshape(-1, 3),
    ])
    return np.median(edges, axis=0)


def inward_runs(light: np.ndarray) -> np.ndarray:
    """For each row, how many backdrop pixels sit between the left edge and
    the pack. Rows that are backdrop end to end return the full width.

    A wrapper whose own art runs pale right up to its edge can let a row eat
    further in than the wrapper's straight side, so cap the runs at a little
    past the typical one. The sides are straight; a lone deep row is a leak,
    not a notch.
    """
    width = light.shape[1]
    runs = np.argmin(light, axis=1)
    full = light.all(axis=1)
    runs[full] = width
    body = runs[(runs > 0) & ~full]
    if body.size:
        cap = int(np.percentile(body, 90)) + 2
        runs = np.where(full, runs, np.minimum(runs, cap))
    return runs


def background_mask(light: np.ndarray) -> np.ndarray:
    """Backdrop reachable by walking in from any of the four edges."""
    height, width = light.shape
    cols = np.arange(width)[None, :]
    rows = np.arange(height)[None, :]

    left = cols < inward_runs(light)[:, None]
    right = (cols < inward_runs(light[:, ::-1])[:, None])[:, ::-1]
    top = (rows < inward_runs(light.T)[:, None]).T
    bottom = (rows < inward_runs(light.T[:, ::-1])[:, None])[:, ::-1].T
    return left | right | top | bottom


def dilate(mask: np.ndarray) -> np.ndarray:
    """Grow a mask by one pixel in all eight directions."""
    out = mask.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def decontaminate(rgb: np.ndarray, keep: np.ndarray, edge: np.ndarray) -> np.ndarray:
    """Pull interior colour outward over the edge pixels.

    An edge pixel is part wrapper, part backdrop — on a white backdrop that
    blend is exactly the pale fringe we are trying to lose. Replacing it with
    the mean of its solid neighbours keeps the silhouette while dropping the
    white out of it.
    """
    solid = keep & ~edge
    out = rgb.astype(float).copy()
    weight = solid.astype(float)
    total = np.zeros_like(weight)
    accum = np.zeros_like(out)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            accum += np.roll(np.roll(out * weight[..., None], dy, 0), dx, 1)
            total += np.roll(np.roll(weight, dy, 0), dx, 1)
    blended = np.divide(accum, total[..., None], out=out.copy(), where=total[..., None] > 0)
    return np.where((edge & (total > 0))[..., None], blended, out)


def cut(path: Path, tolerance: int) -> Image.Image:
    rgb = np.array(Image.open(path).convert("RGB")).astype(float)
    bg = backdrop(rgb)
    distance = np.abs(rgb - bg).max(axis=2)

    background = background_mask(distance <= tolerance)
    keep = ~background

    # Soft alpha for the pixels straddling the silhouette, so the edge does
    # not come out stair-stepped against the site's dark panels. Only pixels
    # touching the backdrop get it: wrappers carry plenty of near-white in
    # their own art — the crimped seal is a field of white diamonds — and
    # grading those by how pale they are would punch holes in the pack.
    rim = keep & dilate(background)
    soft = np.clip((distance - SOFT) / (HARD - SOFT), 0.0, 1.0)
    alpha = np.where(keep, np.where(rim, soft, 1.0), 0.0)
    edge = keep & (alpha < 0.999)
    rgb = decontaminate(rgb, keep, edge)

    out = np.zeros(rgb.shape[:2] + (4,), dtype=np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    image = Image.fromarray(out, "RGBA")

    box = image.getbbox()
    return image.crop(box) if box else image


def run(set_id: str) -> int:
    folder = PACKS / set_id
    if not folder.is_dir():
        print(f"{set_id}: no such pack folder")
        return 0
    tolerance = TOLERANCE.get(set_id, DEFAULT_TOLERANCE)
    done = 0
    for png in sorted(folder.glob("*.png")):
        before = Image.open(png)
        if before.mode == "RGBA" and np.array(before)[..., 3].min() < 255:
            print(f"  {png.name}: already cut out, left alone")
            continue
        cutout = cut(png, tolerance)
        cutout.save(png)
        cutout.save(png.with_suffix(".avif"), quality=82)
        clear = (np.array(cutout)[..., 3] < 16).mean()
        print(f"  {png.name}: {before.size[0]}x{before.size[1]} -> "
              f"{cutout.size[0]}x{cutout.size[1]}, {clear:.1%} transparent")
        done += 1
    return done


def main(argv: list[str]) -> None:
    for set_id in argv or FLAT_SETS:
        print(set_id)
        run(set_id)


if __name__ == "__main__":
    main(sys.argv[1:])
