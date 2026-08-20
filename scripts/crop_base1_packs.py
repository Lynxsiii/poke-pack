"""Crop Base Set English pack arts from the Elite Fourum collage.

Source thread (public):
https://www.elitefourum.com/t/english-and-japanese-booster-pack-arts/28522
"""
from collections import deque
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "scripts" / "_tmp" / "wotc-base-set-collage.jpeg"
OUT_DIR = ROOT / "assets" / "packs" / "base1"
COLLAGE_URL = (
    "https://efour.b-cdn.net/uploads/default/original/3X/5/c/"
    "5c99903ab87627587ca3e118317009c88326ce32.jpeg"
)
THREAD = "https://www.elitefourum.com/t/english-and-japanese-booster-pack-arts/28522"

PACK_NAMES = [
    "en-1ed-venusaur",
    "en-1ed-charizard",
    "en-1ed-blastoise",
]


def is_white(rgb, thresh=248):
    r, g, b = rgb[:3]
    return r >= thresh and g >= thresh and b >= thresh


def column_has_content(im, x, min_pixels=6):
    w, h = im.size
    hits = 0
    for y in range(h):
        if not is_white(im.getpixel((x, y))):
            hits += 1
            if hits >= min_pixels:
                return True
    return False


def find_column_ranges(im, min_gap=8):
    w, _h = im.size
    active = [column_has_content(im, x) for x in range(w)]
    ranges = []
    start = None
    gap = 0
    for x, on in enumerate(active):
        if on:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                ranges.append((start, x - gap))
                start = None
                gap = 0
    if start is not None:
        ranges.append((start, w - 1 - gap))
    return ranges


def vertical_bounds(im, x0, x1, pad=2):
    w, h = im.size
    top, bot = h, -1
    for x in range(x0, x1 + 1):
        for y in range(h):
            if not is_white(im.getpixel((x, y))):
                if y < top:
                    top = y
                if y > bot:
                    bot = y
    top = max(0, top - pad)
    bot = min(h - 1, bot + pad)
    x0 = max(0, x0 - pad)
    x1 = min(w - 1, x1 + pad)
    return x0, top, x1, bot


def cutout(rgb_im, thresh=242):
    """Make outer white (and JPEG off-white) transparent via border flood-fill."""
    im = rgb_im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()

    def idx(x, y):
        return y * w + x

    def push(x, y):
        if 0 <= x < w and 0 <= y < h and not seen[idx(x, y)]:
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        i = idx(x, y)
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, _a = px[x, y]
        if r >= thresh and g >= thresh and b >= thresh:
            px[x, y] = (255, 255, 255, 0)
            push(x + 1, y)
            push(x - 1, y)
            push(x, y + 1)
            push(x, y - 1)

    bbox = im.getbbox()
    if not bbox:
        raise SystemExit("cutout produced empty image")
    return im.crop(bbox)


def download_collage():
    SRC.parent.mkdir(parents=True, exist_ok=True)
    req = Request(
        COLLAGE_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; poke-pack.rip local fan project)",
            "Referer": THREAD,
            "Accept": "image/jpeg,image/*,*/*",
        },
    )
    print("GET", COLLAGE_URL)
    with urlopen(req, timeout=60) as resp:
        SRC.write_bytes(resp.read())
    print("collage", SRC, SRC.stat().st_size, "bytes")


def main():
    if not SRC.exists():
        download_collage()
    im = Image.open(SRC).convert("RGB")
    ranges = find_column_ranges(im)
    boxes = [vertical_bounds(im, a, b) for a, b in ranges]
    print("collage", im.size, "packs", boxes)
    if len(boxes) != len(PACK_NAMES):
        raise SystemExit(f"expected {len(PACK_NAMES)} packs, found {len(boxes)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, box in zip(PACK_NAMES, boxes):
        crop = im.crop((box[0], box[1], box[2] + 1, box[3] + 1))
        cut = cutout(crop)
        dest = OUT_DIR / f"{name}.png"
        cut.save(dest, "PNG", optimize=True)
        print("wrote", dest.name, cut.size)


if __name__ == "__main__":
    main()
