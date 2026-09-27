"""Find a printed overlay (set stamp, badge, logo) on every card of a set.

Some marks are the same bitmap on every card they appear on: the 30th
Celebration Pikachu stamp, a Trainer's Pokemon portrait, a set logo. On the
real card the foil usually stops at that mark's outline, so a foil mask needs
its exact silhouette and where it sits on each card.

Two steps:

  1. Template. Take a group of cards where the mark sits in one place over
     artwork that changes from card to card (for 30th Celebration that is the
     Double Rares). A pixel that agrees across the whole group is the mark; one
     that disagrees is artwork. That gives the mark's colours and a clean alpha,
     with no frame or background stuck to it.
  2. Locate. Slide the template over every other card at a few scales and take
     the best masked normalised cross-correlation. Layouts that move or resize
     the mark (Illustration Rares, Classic Collection reprints, the Pikachu
     Rare's large stamp) are found the same way.

Output, in --out:

  <name>.png        the mark's alpha, white on transparent, at template size.
                    CSS positions this one file per card as a mask layer.
  <name>-rgb.png    the template colours, for debugging and for demo pages.
  <name>.json       per card: left/top/width as fractions of the card, the
                    CSS mask-position and mask-size that place it, and the
                    match score. Cards scoring under --min-score are listed
                    under "missing" so they can be checked by eye.

    python3 .claude/skills/card-textures/scripts/find_overlay.py \\
        --set me55 --template-rarity "Double Rare" \\
        --box 0.62,0.30,1.0,0.62 --name stamp30 --out assets/masks/stamp

Card scans are the 600x838 WebPs in assets/cards/<set>/. Needs numpy and
Pillow.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[4]

AGREE = 50          # max colour distance from the group median that still agrees
# Share of the group that has to agree for a pixel to count. Not 1.0: a group
# can hold a card or two that move the mark (two of the twelve 30th Celebration
# Double Rares do), and the median still lands on the majority's pixels.
AGREE_SHARE = 0.75
OPEN = 3            # px; bridges thinner than twice this are cut from the mark
FEATHER = 0.8       # px of gaussian softening on the finished alpha


def load(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def morph(mask: np.ndarray, op) -> np.ndarray:
    return np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(op)) > 127


def largest_blob(mask: np.ndarray) -> np.ndarray:
    """Keep the biggest 4-connected component. Flood fill, no scipy."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best: list[tuple[int, int]] = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        stack, blob = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            blob.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(blob) > len(best):
            best = blob
    out = np.zeros_like(mask, dtype=bool)
    if best:
        ys, xs = zip(*best)
        out[list(ys), list(xs)] = True
    return out


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Anything the outside cannot reach is inside: the cheek numerals, the eyes."""
    h, w = mask.shape
    outside = np.zeros_like(mask, dtype=bool)
    stack = [(y, x) for y in range(h) for x in (0, w - 1) if not mask[y, x]]
    stack += [(y, x) for x in range(w) for y in (0, h - 1) if not mask[y, x]]
    for y, x in stack:
        outside[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))
    return ~outside


def template(scans: list[np.ndarray], box: tuple[int, int, int, int]):
    x0, y0, x1, y1 = box
    stack = np.stack([s[y0:y1, x0:x1] for s in scans])
    median = np.median(stack, axis=0)
    dist = np.sqrt(((stack - median) ** 2).sum(axis=3))
    agree = (dist < AGREE).mean(axis=0) >= AGREE_SHARE
    # The card border and frame agree across the group too, and where the mark
    # touches them they fuse into one blob. Opening cuts those thin bridges,
    # the largest blob is the mark, and a few steps of dilation that may only
    # grow into agreeing pixels give back the outline and ear tips it shaved.
    opened = morph(morph(agree, ImageFilter.MinFilter(OPEN * 2 + 1)), ImageFilter.MaxFilter(OPEN * 2 + 1))
    shape = largest_blob(opened)
    for _ in range(OPEN + 1):
        shape = morph(shape, ImageFilter.MaxFilter(3)) & agree
    shape = fill_holes(shape)
    ys, xs = np.nonzero(shape)
    if not len(ys):
        raise SystemExit("no agreeing blob in --box; widen it or pick another group")
    ty0, ty1, tx0, tx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return median[ty0:ty1, tx0:tx1], shape[ty0:ty1, tx0:tx1], (x0 + tx0, y0 + ty0)


def correlate(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Valid-mode cross-correlation of 2-D a with smaller b, via FFT."""
    H, W = a.shape
    h, w = b.shape
    fa = np.fft.rfft2(a, s=(H, W))
    fb = np.fft.rfft2(b[::-1, ::-1], s=(H, W))
    full = np.fft.irfft2(fa * fb, s=(H, W))
    return full[h - 1:H, w - 1:W]


def locate(scan: np.ndarray, rgb: np.ndarray, alpha: np.ndarray, box, scales):
    """Best masked NCC of the template over `box`, trying each scale.

    Coarse to fine: every scale at half resolution first, then the winner is
    refined at full resolution in a small window around it.
    """
    x0, y0, x1, y1 = box
    region = scan[y0:y1, x0:x1]
    half = shrink(region, 2)
    score, hx, hy, scale = ncc(half, shrink(rgb, 2), shrink(alpha, 2), scales)
    if score < 0:
        return (-1.0, 0, 0, 1.0)
    pad = 6
    th, tw = round(rgb.shape[0] * scale), round(rgb.shape[1] * scale)
    fx0, fy0 = max(0, hx * 2 - pad), max(0, hy * 2 - pad)
    fx1, fy1 = min(region.shape[1], hx * 2 + tw + pad), min(region.shape[0], hy * 2 + th + pad)
    fine = [scale * f for f in (0.96, 0.98, 1, 1.02, 1.04)]
    score, fx, fy, scale = ncc(region[fy0:fy1, fx0:fx1], rgb, alpha, fine)
    return (score, x0 + fx0 + fx, y0 + fy0 + fy, scale)


def shrink(arr: np.ndarray, by: int) -> np.ndarray:
    h, w = arr.shape[:2]
    mode = arr.ndim == 2
    im = Image.fromarray(np.clip(arr * (255 if mode else 1), 0, 255).astype(np.uint8))
    out = np.asarray(im.resize((max(1, w // by), max(1, h // by)), Image.BILINEAR), dtype=np.float32)
    return out / 255 if mode else out


def ncc(region: np.ndarray, rgb: np.ndarray, alpha: np.ndarray, scales):
    best = (-1.0, 0, 0, 1.0)
    for scale in scales:
        th = max(6, round(rgb.shape[0] * scale))
        tw = max(6, round(rgb.shape[1] * scale))
        if th > region.shape[0] or tw > region.shape[1]:
            continue
        t = np.asarray(Image.fromarray(rgb.astype(np.uint8)).resize((tw, th), Image.BILINEAR), dtype=np.float32)
        m = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((tw, th), Image.BILINEAR), dtype=np.float32) / 255
        m = (m > 0.5).astype(np.float32)
        n = m.sum()
        num = np.zeros((region.shape[0] - th + 1, region.shape[1] - tw + 1))
        den_i = np.zeros_like(num)
        den_t = 0.0
        for c in range(3):
            tc = t[..., c]
            tz = m * (tc - (tc * m).sum() / n)
            ic = region[..., c]
            num += correlate(ic, tz)
            s1 = correlate(ic, m)
            s2 = correlate(ic * ic, m)
            den_i += s2 - s1 * s1 / n
            den_t += (tz * tz).sum()
        # A flat patch (a plain border, an empty text box) has almost no
        # variance, and dividing by it lets noise score in the thousands.
        flat = den_i < 0.05 * den_t
        score = np.where(flat, 0.0, num / np.sqrt(np.maximum(den_i * den_t, 1e-6)))
        iy, ix = np.unravel_index(np.argmax(score), score.shape)
        if score[iy, ix] > best[0]:
            best = (float(score[iy, ix]), int(ix), int(iy), scale)
    return best


def edges(arr: np.ndarray) -> np.ndarray:
    """Gradient magnitude, blurred a little. Colour-blind on purpose."""
    lum = arr if arr.ndim == 2 else arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    im = Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    g = np.asarray(im, dtype=np.float32)
    gy, gx = np.gradient(g)
    return np.hypot(gx, gy)


def locate_shape(scan, shape, box, scales):
    """Match the mark's outline instead of its colours.

    For printings that recolour the mark (the rainbow stamp on a Futuristic
    Rare), colour NCC fails but the silhouette and its white keyline do not
    move, so the template alpha's edges are matched against the scan's.
    """
    x0, y0, x1, y1 = box
    region = edges(scan[y0:y1, x0:x1])
    outline = edges(shape.astype(np.float32) * 255)
    as_rgb = lambda e: np.dstack([e / max(e.max(), 1e-6) * 255] * 3)  # noqa: E731
    ones = np.ones(shape.shape, dtype=np.float32)
    score, x, y, scale = ncc(shrink(as_rgb(region), 2), shrink(as_rgb(outline), 2), shrink(ones, 2), scales)
    return score, x0 + x * 2, y0 + y * 2, scale


def placement(x, y, tw, th, W, H, score, how):
    return {
        "score": round(score, 3), "found_by": how,
        "left": round(x / W, 4), "top": round(y / H, 4),
        "width": round(tw / W, 4), "height": round(th / H, 4),
        # mask-position percentages align the image's own x% with the box's
        # x%, so a left offset L of an image w wide sits at L / (W - w).
        "position": f"{100 * x / max(W - tw, 1):.2f}% {100 * y / max(H - th, 1):.2f}%",
        "size": f"{100 * tw / W:.2f}% auto",
    }


def cutout(scan, rgb, alpha, entry, W, H):
    """Full-card mask of the mark minus anything printed over it.

    The Pikachu Rare's big stamp sits under the attack text. Where the scan
    still matches the template it is stamp; where it does not, ink was printed
    on top, and on the real card that ink is not foil either.
    """
    x, y = round(entry["left"] * W), round(entry["top"] * H)
    tw, th = round(entry["width"] * W), round(entry["height"] * H)
    t = np.asarray(Image.fromarray(rgb.astype(np.uint8)).resize((tw, th), Image.BILINEAR), dtype=np.float32)
    a = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((tw, th), Image.BILINEAR), dtype=np.float32) / 255
    out = np.zeros((H, W), dtype=np.float32)
    cx0, cy0, cx1, cy1 = max(0, x), max(0, y), min(W, x + tw), min(H, y + th)
    crop = scan[cy0:cy1, cx0:cx1]
    tt = t[cy0 - y:cy1 - y, cx0 - x:cx1 - x]
    aa = a[cy0 - y:cy1 - y, cx0 - x:cx1 - x]
    same = np.sqrt(((crop - tt) ** 2).sum(axis=2)) < AGREE
    same = morph(morph(same, ImageFilter.MaxFilter(3)), ImageFilter.MinFilter(3))
    out[cy0:cy1, cx0:cx1] = aa * same
    soft = Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(FEATHER))
    white = Image.new("L", (W, H), 255)
    return Image.merge("RGBA", (white, white, white, soft))


def check_sheet(cards, found, path, dest):
    """Every card at thumbnail size with its placement outlined, for eyeballing."""
    from PIL import ImageDraw
    tw, th, cols = 150, 210, 16
    rows = (len(cards) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (20, 20, 20))
    for i, card in enumerate(cards):
        if not path(card).exists():
            continue
        im = Image.open(path(card)).convert("RGB").resize((tw, th))
        spot = found.get(card["id"])
        if spot:
            d = ImageDraw.Draw(im)
            x, y = spot["left"] * tw, spot["top"] * th
            colour = {"colour": (0, 255, 0), "outline": (0, 200, 255), "rarity": (255, 200, 0)}.get(spot["found_by"], (255, 0, 255))
            d.rectangle([x, y, x + spot["width"] * tw, y + spot["height"] * th], outline=colour, width=2)
        sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
    sheet.save(dest, quality=80)


def fraction_box(text: str, size: tuple[int, int]) -> tuple[int, int, int, int]:
    fx0, fy0, fx1, fy1 = (float(v) for v in text.split(","))
    w, h = size
    return round(fx0 * w), round(fy0 * h), round(fx1 * w), round(fy1 * h)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True, help="set id, e.g. me55 (reads data/<set>.json)")
    ap.add_argument("--template-rarity", required=True,
                    help="rarity whose cards all carry the mark in one place over varied art")
    ap.add_argument("--box", required=True,
                    help="x0,y0,x1,y1 as card fractions: where the mark sits on the template group")
    ap.add_argument("--search", default="0,0,1,1",
                    help="x0,y0,x1,y1 card fractions to search on every card (default: whole card)")
    # Small scales find Pikachu's own face in a Pikachu illustration, so they
    # are opt-in; cards that need them go in --overrides instead.
    ap.add_argument("--scales", default="0.8,0.9,1,1.1,1.25,1.5,1.75,2,2.25,2.5",
                    help="template scales to try")
    ap.add_argument("--overrides", default="",
                    help='JSON file of {"<card id>": {"left": f, "top": f, "width": f} | null} '
                         "to pin placements by hand; null means the card has no mark")
    ap.add_argument("--debug", action="store_true",
                    help="also write <name>-check.jpg, every card with its placement outlined")
    ap.add_argument("--min-score", type=float, default=0.6)
    ap.add_argument("--min-shape-score", type=float, default=0.45,
                    help="threshold for the outline match used on recoloured marks")
    ap.add_argument("--cutouts", default="",
                    help="comma-separated rarities to also write per-card masks for (mark minus overprint)")
    ap.add_argument("--name", default="overlay")
    ap.add_argument("--out", required=True, help="output folder, relative to the repo root")
    args = ap.parse_args()

    cards = json.loads((ROOT / "data" / f"{args.set}.json").read_text(encoding="utf-8"))
    cards = cards["cards"] if isinstance(cards, dict) else cards
    path = lambda c: ROOT / c["image"]  # noqa: E731
    group = [c for c in cards if c.get("rarity") == args.template_rarity]
    if len(group) < 4:
        raise SystemExit(f"only {len(group)} {args.template_rarity} cards; consensus needs 4 or more")

    scans = [load(path(c)) for c in group]
    H, W = scans[0].shape[:2]
    rgb, shape, _ = template(scans, fraction_box(args.box, (W, H)))
    alpha = np.asarray(
        Image.fromarray((shape * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(FEATHER)),
        dtype=np.float32) / 255

    out = ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    white = np.dstack([np.full(alpha.shape, 255, np.uint8)] * 3 + [(alpha * 255).astype(np.uint8)])
    Image.fromarray(white, "RGBA").save(out / f"{args.name}.png", optimize=True)
    rgba = np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(out / f"{args.name}-rgb.png", optimize=True)

    scales = [float(s) for s in args.scales.split(",")]
    search = fraction_box(args.search, (W, H))
    found, weak = {}, []
    for card in cards:
        if not card.get("image") or not path(card).exists():
            continue
        scan = load(path(card))
        score, x, y, scale = locate(scan, rgb, shape.astype(np.float32), search, scales)
        how = "colour"
        if score < args.min_score:
            s2, x2, y2, sc2 = locate_shape(scan, shape, search, scales)
            if s2 >= args.min_shape_score:
                score, x, y, scale, how = s2, x2, y2, sc2, "outline"
        entry = placement(x, y, round(rgb.shape[1] * scale), round(rgb.shape[0] * scale), W, H, score, how)
        (found.__setitem__(card["id"], entry) if how == "outline" or score >= args.min_score
         else weak.append((card, entry)))

    # A layout that pins the mark in one place (every Pikachu Rare) can bury it
    # under text on a few cards. If most of that rarity agree on one placement,
    # the buried ones take it too; anything left is listed for a human to check.
    missing = []
    for card, entry in weak:
        peers = [found[c["id"]] for c in cards if c.get("rarity") == card.get("rarity") and c["id"] in found]
        spots = {}
        for p in peers:
            key = (p["left"], p["top"], p["width"])
            spots[key] = spots.get(key, 0) + 1
        best = max(spots.items(), key=lambda kv: kv[1]) if spots else None
        if best and best[1] >= max(3, 0.6 * len(peers)):
            twin = next(p for p in peers if (p["left"], p["top"], p["width"]) == best[0])
            found[card["id"]] = {**twin, "score": entry["score"], "found_by": "rarity"}
        else:
            missing.append({"id": card["id"], "rarity": card.get("rarity"), **entry})

    unmarked = []
    if args.overrides:
        pinned = json.loads((ROOT / args.overrides).read_text(encoding="utf-8"))
        for card_id, spot in pinned.items():
            missing = [m for m in missing if m["id"] != card_id]
            if spot is None:
                found.pop(card_id, None)
                unmarked.append(card_id)
                continue
            tw, th = round(spot["width"] * W), round(spot["width"] * W * rgb.shape[0] / rgb.shape[1])
            found[card_id] = placement(round(spot["left"] * W), round(spot["top"] * H), tw, th, W, H, 1.0, "hand")

    if args.debug:
        check_sheet(cards, found, path, out / f"{args.name}-check.jpg")

    wanted = {r.strip() for r in args.cutouts.split(",") if r.strip()}
    if wanted:
        (out / args.name).mkdir(exist_ok=True)
        for card in cards:
            if card.get("rarity") in wanted and card["id"] in found:
                img = cutout(load(path(card)), rgb, alpha, found[card["id"]], W, H)
                img.save(out / args.name / f"{card['number']}.png", optimize=True)
                found[card["id"]]["cutout"] = f"{args.name}/{card['number']}.png"

    manifest = {
        "template": {"rarity": args.template_rarity, "size": [int(rgb.shape[1]), int(rgb.shape[0])], "card": [W, H]},
        "cards": found,
        "missing": missing,
        "unmarked": unmarked,
    }
    (out / f"{args.name}.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    print(f"{len(found)} placed, {len(missing)} not found: {out / (args.name + '.json')}")


if __name__ == "__main__":
    main()
