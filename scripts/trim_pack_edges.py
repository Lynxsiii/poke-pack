#!/usr/bin/env python3
"""Peel the thin white outline off booster pack art.

Many wrappers were cut from a white page a pixel or two too wide: a hairline of
paper white runs along the top crimp, the bottom crimp or a side. On the site's
dark stage it reads as a white line over or under the pack (Noah's Base Set
report, 2026-10-01). clean_pack_art.py only handles packs whose side margins
are fully opaque and cut_pack_white.py only white wedges in the corners, so
neither sees it.

For every line of the image (columns walking in from the top and from the
bottom, rows from the left and from the right) this looks at the first visible
pixels. One to three pixels that are blends of paper white and the first
clearly darker opaque pixel behind them (the wrapper) are a hairline candidate:
the lightest of them is near white and the wrapper pixel at least 35 levels
darker. Candidates count only where they line up along a straight stretch of
the edge (ten lines or more, the edge moving at most two pixels from one line
to the next; a bright crimp ridge may interrupt a stretch for up to three
lines), so lone specks and a zigzag crimp's highlights never do.

A side is cut too wide when those stretches cover enough of it and look like
paper: mostly pure white over a share of 30% or more, or a lighter grey
anti-aliased line along nearly all of it. Crimps that are white or silver
themselves (Gym Heroes, Neo Genesis), cream or coloured rims and white art
(sv3pt5/mew.avif, as in cut_pack_white.py) fail this and are left alone. On a
side that passes, the paper runs the whole straight edge, also where white art
(a glare, a white crimp) hides it from the per-line test, so every line of that
edge loses the same depth and the silhouette stays straight. Each of those
pixels is unmixed from white against the wrapper colour behind it, so pure
paper turns transparent and a soft edge stays soft, without the white.

/assets/ is cached as immutable for a year, so a tracked file is never
overwritten: the art goes to the next free -vN name (pack-0.avif ->
pack-0-v2.avif, pack-0-v2.avif -> pack-0-v3.avif) with its .png fallback, the
old pair is deleted, and the script prints the new paths for js/catalog.js to
point at (a wrapper face's `v` in boosterWrappers).

A corner can also keep a small white wedge where the cut went wide on two
sides at once, too small for cut_pack_white.py --check to list (Ultra Prism's
Necrozma pack, sm5/pack-1-v2 before it became -v3). --wedge runs that script's
cut on the trimmed art as well; use it only on a pack whose corners are not
white art.

    python3 scripts/trim_pack_edges.py --check            # list packs cut too wide
    python3 scripts/trim_pack_edges.py --check --json     # the same, machine-readable
    python3 scripts/trim_pack_edges.py assets/packs/<set>/pack-0.avif ...
    python3 scripts/trim_pack_edges.py --wedge assets/packs/<set>/pack-1.avif
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import clean_pack_art as cpa  # noqa: E402
import cut_pack_white as cpw  # noqa: E402

ROOT = cpa.ROOT
PACKS = cpa.PACKS
LUMA = np.array([0.299, 0.587, 0.114], np.float32)
SIDES = ("T", "B", "L", "R")
MAX_RUN = 3        # paper hairlines are one to three pixels deep
PAPER = 215        # the lightest pixel of a hairline is at least this light (luma)
MIN_LIGHT = 150    # pixels darker than this are never paper
LIGHTER = 35       # the wrapper starts at the first opaque pixel this much darker than the hairline
OFF_BLEND = 30     # how far (RGB) a hairline pixel may sit from a blend of white and the wrapper colour
SOFT = 25          # the wrapper's first pixel is itself part paper when the next one is this much darker
STRETCH = 10       # lines in a row that must carry the hairline
GAP = 3            # lines a stretch may jump where a bright crimp ridge runs into the paper
STEP = 2           # how far the edge may move from one line to the next along a straight edge
CORNER = 4         # lines past either end of a stretch that still count when they carry a hairline
# A side is cut too wide when its hairline covers at least this share of its middle ...
SIDE_SHARE = 0.3
# ... and most of its lines (this share) carry pure white paper (luma 245+) ...
WHITE, WHITE_SHARE = 245, 0.6
# ... or it is a lighter anti-aliased line that covers (share) and stands clear of the wrapper (luma).
GREY_LINES = ((0.9, 80), (0.6, 150))
# Leftover specks: light and greyish (luma, saturation).
SPECK_LIGHT, SPECK_SAT = 150, 70
# Edges whose white is the wrapper's own art, judged by eye (2026-10-01): Gym Heroes' white top crimp, whose dark
# lettering reads as a wrapper behind paper, and Detective Pikachu's wavy white bottom band.
ART_EDGES = {"gym1/pack-1.avif": "T", "gym1/pack-2.avif": "T", "gym1/pack-3.avif": "T", "det1/pack-0-v2.avif": "B"}


def load(path: Path) -> np.ndarray:
    """The pack's pixels, from its lossless .png fallback when there is one."""
    png = path.with_suffix(".png")
    src = png if png.exists() else path
    return np.asarray(Image.open(src).convert("RGBA")).astype(np.float32)


def _line(x: np.ndarray, side: str, k: int) -> np.ndarray:
    """Line k of the image as seen walking in from `side` (pixels x RGBA)."""
    if side == "T":
        return x[:, k]
    if side == "B":
        return x[::-1, k]
    if side == "L":
        return x[k]
    return x[k, ::-1]


def _index(side: str, k: int, i: int, h: int, w: int) -> tuple[int, int]:
    """Image (row, column) of pixel i of line k seen from `side`."""
    if side == "T":
        return i, k
    if side == "B":
        return h - 1 - i, k
    if side == "L":
        return k, i
    return k, w - 1 - i


def _on_blend(c: np.ndarray, ink: np.ndarray) -> bool:
    """Is colour c a blend of paper white and the wrapper colour `ink`?"""
    span = 255 - ink
    t = np.clip((c - ink) @ span / max(float(span @ span), 1.0), 0, 1)
    return float(np.linalg.norm(c - (ink + t * span))) <= OFF_BLEND


def _hairline(line: np.ndarray) -> tuple[int, list[int], np.ndarray | None]:
    """(edge index, hairline pixel indices, wrapper colour behind them) for one line."""
    a = line[:, 3] / 255
    vis = np.flatnonzero(a > 0.02)
    if not len(vis):
        return -1, [], None
    edge = int(vis[0])
    rgb = line[:, :3]
    run: list[int] = []
    top = 0.0
    for i in range(edge, min(edge + MAX_RUN + 1, len(line))):
        lum = float(rgb[i] @ LUMA)
        if run and a[i] >= 0.9 and lum <= top - LIGHTER:
            # the wrapper proper: was everything before it paper blended into it?
            ink = rgb[i]
            if top < PAPER or not all(_on_blend(rgb[j], ink) for j in run):
                return edge, [], None
            # A soft edge: the wrapper's first pixel is itself part paper when the next one is much darker.
            if i + 1 < len(line) and a[i + 1] >= 0.9 and rgb[i + 1] @ LUMA < lum - SOFT:
                run.append(i)
                ink = rgb[i + 1]
            return edge, run, ink.copy()
        if lum < MIN_LIGHT:
            return edge, [], None
        run.append(i)
        top = max(top, lum)
    return edge, [], None


def _stretches(ok: np.ndarray, edge: np.ndarray) -> np.ndarray:
    """Lines inside straight stretches of hairline, short gaps bridged."""
    n = len(ok)
    bridged = ok.copy()
    i = 0
    while i < n:
        if ok[i]:
            i += 1
            continue
        j = i
        while j < n and not ok[j]:
            j += 1
        # a bright crimp ridge breaks the hairline for a line or three; the edge itself carries on
        if 0 < i and j < n and j - i <= GAP and (edge[i:j] >= 0).all() \
                and np.abs(np.diff(edge[i - 1:j + 1])).max() <= STEP:
            bridged[i:j] = True
        i = j
    keep = np.zeros(n, bool)
    start = None
    for i in range(n + 1):
        on = i < n and bridged[i]
        broken = on and start is not None and abs(edge[i] - edge[i - 1]) > STEP
        if start is not None and (not on or broken):
            if i - start >= STRETCH and ok[start:i].mean() >= 0.5:
                keep[start:i] = True
            start = None
        if on and start is None:
            start = i
    # A stretch runs on into the corners, where the crimp turns and the edge moves faster.
    for i in np.flatnonzero(keep):
        for j in (*range(i - 1, max(i - 1 - CORNER, -1), -1), *range(i + 1, min(i + 1 + CORNER, n))):
            if ok[j]:
                keep[j] = True
    return keep & ok


def _segments(edge: np.ndarray) -> np.ndarray:
    """Number the straight runs of the edge: neighbouring visible lines whose edge moves at most STEP."""
    seg = np.full(len(edge), -1)
    sid = 0
    for k, e in enumerate(edge):
        if e < 0:
            continue
        if k == 0 or edge[k - 1] < 0 or abs(e - edge[k - 1]) > STEP:
            sid += 1
        seg[k] = sid
    return seg


def side_paper(x: np.ndarray, side: str) -> tuple[list[tuple[int, list[int], np.ndarray, bool]], dict]:
    """The pixels to unmix along one side, and what was measured.

    Each entry is (line, pixel indices, wrapper colour, borrowed): a borrowed line had no hairline of its own
    (white art hid it, or it came out a shade too light or too dark) and takes the side's usual hairline depth, and
    its colour when the art behind it is white too, from the nearest line that had one.
    """
    h, w = x.shape[:2]
    n = w if side in ("T", "B") else h
    lo, hi = (0.1, 0.9) if side in ("T", "B") else (0.15, 0.85)
    rows = [_hairline(_line(x, side, k)) for k in range(n)]
    ok = np.array([bool(r[1]) for r in rows])
    edge = np.array([r[0] for r in rows])
    keep = _stretches(ok, edge)
    middle = [k for k in range(int(n * lo), int(n * hi)) if edge[k] >= 0]
    share = sum(keep[k] for k in middle) / max(len(middle), 1)
    lines = np.flatnonzero(keep)
    info = {"share": round(float(share), 2)}
    if not len(lines):
        return [], info | {"paper": False}
    tops = np.array([max(float(_line(x, side, k)[i, :3] @ LUMA) for i in rows[k][1]) for k in lines])
    inks = np.array([float(rows[k][2] @ LUMA) for k in lines])
    white = float((tops >= WHITE).mean())
    contrast = float(np.median(tops - inks))
    paper = share >= SIDE_SHARE and (
        white >= WHITE_SHARE or any(share >= s and contrast >= c for s, c in GREY_LINES))
    info |= {"white": round(white, 2), "contrast": round(contrast), "paper": paper}
    if not paper:
        return [], info

    # The paper runs the whole straight edge, also where the test above missed it: every line of an edge segment
    # that carries the hairline loses the side's usual depth, unmixed against the wrapper colour behind the band.
    seg = _segments(edge)
    depth = int(np.median([len(rows[k][1]) for k in lines]))
    found = []
    for k in np.flatnonzero(np.isin(seg, seg[lines])):
        if keep[k]:
            found.append((int(k), rows[k][1], rows[k][2], False))
            continue
        line = _line(x, side, k)
        e = int(edge[k])
        inner = e + depth
        if inner < len(line) and line[inner, 3] >= 230 and (255 - line[inner, :3]).max() >= 60:
            ink = line[inner, :3]
        else:
            # White behind the band too (a bright crimp ridge, a glare): fade it against the nearest hairline's
            # wrapper colour, like its neighbours, rather than cut it to a notch or leave a white bump.
            ink = rows[lines[np.abs(lines - k).argmin()]][2]
        found.append((int(k), list(range(e, min(inner, len(line)))), ink.copy(), True))
    return found, info


def paper_sides(x: np.ndarray, rel: str = "") -> dict[str, tuple[list, dict]]:
    """side_paper for all four sides; nothing for art that is white on purpose (rel is the path under assets/packs)."""
    out = {}
    for s in SIDES:
        if rel in cpw.WHITE_ART or s in ART_EDGES.get(rel, ""):
            out[s] = ([], {"share": 0.0, "paper": False, "white_art": True})
        else:
            out[s] = side_paper(x, s)
    return out


def _unmix(c: np.ndarray, ink: np.ndarray) -> float:
    """How much of pixel colour c is the wrapper colour `ink` rather than paper white (0..1)."""
    reach = 255 - ink
    if reach.max() < 30:
        return 0.0
    return float(np.clip(((255 - c) * reach).sum() / (reach * reach).sum(), 0, 1))


def _light(rgb: np.ndarray) -> np.ndarray:
    return (rgb @ LUMA >= SPECK_LIGHT) & (rgb.max(axis=-1) - rgb.min(axis=-1) <= SPECK_SAT)


def trim(path: Path) -> tuple[Image.Image, dict[str, dict]]:
    x = load(path)
    h, w = x.shape[:2]
    rel = path.relative_to(PACKS).as_posix() if path.is_relative_to(PACKS) else path.name
    sides = paper_sides(x, rel)
    out = x.copy()
    touched = np.zeros((h, w), bool)
    for side, (found, _) in sides.items():
        for k, run, ink, _ in found:
            for i in run:
                y, xx = _index(side, k, i, h, w)
                c = x[y, xx, :3]
                u = _unmix(c, ink)
                if u >= 1:
                    continue
                out[y, xx, 3] = x[y, xx, 3] * u
                out[y, xx, :3] = ink
                touched[y, xx] = True
    # Where a hairline met a corner or broke off, a speck of paper can stick out on its own: a light
    # pixel with open air on two sides, close to the trimmed line. Unmix those against the nearest
    # wrapper pixel too (twice, for two-pixel specks).
    if touched.any():
        near = ndi.binary_dilation(touched, np.ones((13, 13), bool))
        for _ in range(2):
            a = out[..., 3] / 255
            air = np.pad(a < 0.1, 1, constant_values=True)
            open_sides = air[:-2, 1:-1].astype(int) + air[2:, 1:-1] + air[1:-1, :-2] + air[1:-1, 2:]
            speck = (a > 0.02) & near & (open_sides >= 2) & _light(out[..., :3])
            if not speck.any():
                break
            ink_px = (a >= 0.9) & ~_light(out[..., :3])
            if not ink_px.any():
                break
            _, (iy, ix) = ndi.distance_transform_edt(~ink_px, return_indices=True)
            for y, xx in zip(*np.nonzero(speck)):
                ink = out[iy[y, xx], ix[y, xx], :3].copy()
                out[y, xx, 3] *= _unmix(out[y, xx, :3], ink)
                out[y, xx, :3] = ink
    img = Image.fromarray(out.round().clip(0, 255).astype(np.uint8), "RGBA")
    return img, {s: info for s, (_, info) in sides.items()}


def targets(files: list[str]) -> list[Path]:
    if files:
        return [Path(f).resolve() for f in files]
    return sorted(PACKS.glob("*/*.avif"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="pack .avif files (their .png fallback is rewritten too)")
    ap.add_argument("--check", action="store_true", help="only list packs cut too wide")
    ap.add_argument("--json", action="store_true", help="with --check: print JSON")
    ap.add_argument("--wedge", action="store_true", help="also cut a white wedge left in a corner (cut_pack_white.py)")
    args = ap.parse_args()
    if not args.files and not args.check:
        ap.error("give pack files or --check")

    if args.check:
        flagged = {}
        for path in targets(args.files):
            sides = paper_sides(load(path), path.relative_to(PACKS).as_posix())
            hit = {s: info["share"] for s, (_, info) in sides.items() if info["paper"]}
            if hit:
                flagged[path.relative_to(ROOT).as_posix()] = hit
        if args.json:
            print(json.dumps(flagged, indent=1))
        else:
            for rel, hit in flagged.items():
                print(f"white outline  {rel}  ({' '.join(f'{s} {v:.0%}' for s, v in hit.items())})")
            print(f"{len(flagged)} pack(s) with a white outline" if flagged else "no white outlines")
        return 1 if flagged else 0

    for path in targets(args.files):
        img, sides = trim(path)
        if args.wedge:
            img = cpw.cut_px(np.asarray(img).astype(np.float32))
        dest = cpa.next_version(path) if cpa.is_tracked(path) else path
        img.save(dest, "AVIF", quality=cpa.AVIF_QUALITY)
        img.save(dest.with_suffix(".png"), "PNG", optimize=True)
        if dest != path:
            path.unlink()
            path.with_suffix(".png").unlink(missing_ok=True)
        hit = " ".join(f"{s} {info['share']:.0%}" for s, info in sides.items() if info["paper"])
        print(f"{path.relative_to(ROOT)} -> {dest.relative_to(ROOT)}  ({hit or 'clean'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
