#!/usr/bin/env python3
"""Find foil layers that darken the card in specks.

Real glitter and foil only ever add light: a fleck catches the light or it
does not. A layer that leaves dark dots over the print (a difference or
exclusion blend over a glitter tile, an overlay with a dark texture, a shadow
sliver drawn too strong) reads as dirt or a glitchy render, which Noah called
out on 2026-09-28 ("makes it look glitchy").

The check renders the lab twice at phone size, once as the site draws the
card and once with every foil layer hidden, and compares them pixel by pixel
inside each card. A "dark speck" is a small blob of pixels the foil made
darker than the bare print by more than DROP luminance levels; a large dark
area (a shadow, a pool, a multiply wash) is reported separately as "dark
area" so an engraving shadow is not counted as glitter.

    python3 .claude/skills/card-textures/scripts/dark_specks.py --set sv4pt5 --cards 242,243
    python3 .claude/skills/card-textures/scripts/dark_specks.py --set me1            # default lab picks
    python3 .claude/skills/card-textures/scripts/dark_specks.py --set me1 --all      # every card

Prints one line per card and pose with the speck count, the share of the
card's area they cover and the darkest drop, sorted worst first, and writes
<out>/<set>-specks.png: the foiled sheet with every dark speck marked red so
you can see where a layer misbehaves. Exit 1 when any card is over the
budget (--max-specks, default 40 per card at scale 2, about what a dusty
scan already carries), so sweep_finishes.py can run it as a gate.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PROBE = os.path.join(HERE, "foil_probe.mjs")
HIDE = ".tcg .foil, .tcg .glare, .tcg .cure { display: none !important }"
DROP = 40          # luminance levels darker than the bare print: a visible dark dot
SMALL = 24         # a blob up to this many device px is a speck (about 3 CSS px across at scale 2)
BIG = 400          # a blob this large is an area (a shadow, a pool), reported apart
DIP = 24           # a speck must also sit this far below its own surroundings in the foiled render
EDGE = 18          # luminance gradient of the bare print above which a pixel is an edge, not flat print
INSET = 0.03       # ignore the card's edge band (corners, drop shadow)


def probe(query, out, width, scale, css=None, boxes=False):
    cmd = ["node", PROBE, "--query", query, "--out", out, "--width", str(width), "--scale", str(scale)]
    if css:
        cmd += ["--css", css]
    if boxes:
        cmd += ["--boxes"]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        sys.stderr.write(r.stdout + r.stderr)
        raise SystemExit(f"foil_probe failed for {query}")


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def blobs(mask):
    """Connected components (4-neighbour) of a boolean mask: list of (size, bbox)."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        n = 0
        miny = maxy = y0
        minx = maxx = x0
        while stack:
            y, x = stack.pop()
            n += 1
            miny, maxy, minx, maxx = min(miny, y), max(maxy, y), min(minx, x), max(maxx, x)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        out.append((n, (minx, miny, maxx, maxy)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--cards", default="", help="comma list of card numbers (default: the lab's picks)")
    ap.add_argument("--all", action="store_true", help="every card of the set, in batches")
    ap.add_argument("--poses", default="rest,30:25,50:78")
    ap.add_argument("--w", type=int, default=220, help="card width in CSS px (phone size)")
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--max-specks", type=int, default=40)
    ap.add_argument("--out", default="/tmp/foil-specks")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    if args.all:
        with open(os.path.join(ROOT, "data", f"{args.set}.json")) as f:
            data = json.load(f)
        cards = [str(c["number"]) for c in (data if isinstance(data, list) else data["cards"])]
    else:
        cards = [c for c in args.cards.split(",") if c.strip()]
    batches = [cards[i:i + args.batch] for i in range(0, len(cards), args.batch)] if cards else [[]]

    rows = []
    marked_sheets = []
    for bi, batch in enumerate(batches):
        q = f"set={args.set}&proof=off&maps=1&w={args.w}&poses={args.poses}"
        if batch:
            q += "&cards=" + ",".join(batch)
        width = max(520, min(1600, (args.w + 40) * min(len(batch) or 6, 6) + 40))
        foil_png = os.path.join(args.out, f"{args.set}-{bi}-foil.png")
        bare_png = os.path.join(args.out, f"{args.set}-{bi}-bare.png")
        probe(q, foil_png, width, args.scale, boxes=True)
        probe(q, bare_png, width, args.scale, css=HIDE)
        with open(foil_png[:-4] + ".boxes.json") as f:
            boxes = json.load(f)
        foil = np.asarray(Image.open(foil_png).convert("RGB")).astype(np.int16)
        bare = np.asarray(Image.open(bare_png).convert("RGB")).astype(np.int16)
        if foil.shape != bare.shape:
            h = min(foil.shape[0], bare.shape[0])
            foil, bare = foil[:h], bare[:h]
        drop = lum(bare) - lum(foil)          # positive where the foil darkened the print
        # A darkened edge of the print (line art under an engraving shadow,
        # lettering under a glare) is shading, not a speck: only flat print
        # that the foil dotted counts.
        bl = lum(bare).astype(np.float32)
        gy, gx = np.gradient(bl)
        drop = np.where(np.hypot(gx, gy) > EDGE, 0, drop)
        sheet = Image.open(foil_png).convert("RGB")
        draw = ImageDraw.Draw(sheet)
        s = args.scale
        for b in boxes:
            x0, y0 = int((b["x"] + b["w"] * INSET) * s), int((b["y"] + b["h"] * INSET) * s)
            x1, y1 = int((b["x"] + b["w"] * (1 - INSET)) * s), int((b["y"] + b["h"] * (1 - INSET)) * s)
            region = drop[y0:y1, x0:x1]
            if region.size == 0:
                continue
            lit = lum(foil)[y0:y1, x0:x1]
            flat = bl[y0:y1, x0:x1]
            mask = region > DROP
            comps = blobs(mask)
            areas = [c for c in comps if c[0] >= BIG]
            specks = []
            for n, (bx0, by0, bx1, by1) in comps:
                if n > SMALL:
                    continue
                # A speck is a dot darker than what surrounds it in the foiled
                # render, not a fragment of a shaded edge: compare the blob's
                # pixels with the ring around its box.
                ry0, ry1 = max(0, by0 - 4), min(lit.shape[0], by1 + 5)
                rx0, rx1 = max(0, bx0 - 4), min(lit.shape[1], bx1 + 5)
                ring = lit[ry0:ry1, rx0:rx1]
                inner = lit[by0:by1 + 1, bx0:bx1 + 1]
                # ...and it must be a dot the foil made: where the bare print
                # already dipped (fine lettering, a sketch line too thin for
                # the edge test) the foil only shaded a feature of the print.
                bare_ring = flat[ry0:ry1, rx0:rx1]
                bare_inner = flat[by0:by1 + 1, bx0:bx1 + 1]
                if np.median(ring) - inner.min() >= DIP and np.median(bare_ring) - bare_inner.min() < DIP:
                    specks.append((n, (bx0, by0, bx1, by1)))
            area_px = (x1 - x0) * (y1 - y0)
            speck_px = sum(c[0] for c in specks)
            rows.append({
                "card": b["caption"].split("·", 1)[-1].strip(), "pose": b["pose"], "finish": b["finish"],
                "specks": len(specks), "speck_share": speck_px / area_px * 100,
                "dark_area_share": sum(c[0] for c in areas) / area_px * 100,
                "worst_drop": int(region.max()) if region.size else 0,
                # A Scodix gold's scan is flat and its line art exists only in
                # the engraving, drawn dark on purpose (paldean-fates.md): its
                # dark pixels are lines, not dots, so it is reported, not gated.
                "engraving": "foil-scodix" in b["card"].split(),
            })
            for n, (bx0, by0, bx1, by1) in specks:
                draw.rectangle((x0 + bx0 - 2, y0 + by0 - 2, x0 + bx1 + 2, y0 + by1 + 2), outline=(255, 40, 40))
            for n, (bx0, by0, bx1, by1) in areas:
                draw.rectangle((x0 + bx0, y0 + by0, x0 + bx1, y0 + by1), outline=(255, 160, 0), width=2)
        marked = os.path.join(args.out, f"{args.set}-{bi}-specks.png")
        sheet.save(marked)
        marked_sheets.append(marked)

    rows.sort(key=lambda r: (-r["specks"], -r["speck_share"]))
    print(f"{'card':34s} {'pose':6s} {'finish':14s} {'specks':>6s} {'speck%':>7s} {'dark-area%':>10s} {'drop':>4s}")
    over = [r for r in rows if r["specks"] > args.max_specks and not r["engraving"]]
    for r in rows:
        flag = ("  (engraving, not gated)" if r["engraving"] else "  <- over budget") if r["specks"] > args.max_specks else ""
        print(f"{r['card'][:34]:34s} {r['pose']:6s} {r['finish'][:14]:14s} {r['specks']:6d} {r['speck_share']:7.2f} {r['dark_area_share']:10.1f} {r['worst_drop']:4d}{flag}")
    print("marked sheets:", ", ".join(marked_sheets))
    if over:
        print(f"FAIL: {len(over)} card poses over {args.max_specks} dark specks")
        return 1
    print("ok: no card over the dark-speck budget")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
