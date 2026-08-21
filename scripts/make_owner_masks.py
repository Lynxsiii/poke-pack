"""Generate the owner-portrait holo windows in assets/masks/owner/.

"Trainer's Pokemon" cards carry a portrait badge in the bottom-right of the
illustration: a silver plate with the owner's bust spilling out of the top of
it. On a real holo the foil stops at that badge; on a real reverse holo the
badge is part of the foiled frame layer instead. Either way the boundary is the
character's silhouette, and every portrait draws a different one - hair, hats,
the Team Rocket "R" - so no single hand-drawn shape fits them all.

The silhouette is recovered rather than drawn. A portrait is the same bitmap on
every card it appears on, while the illustration behind it is different every
time, so a pixel that agrees across all of them is badge and a pixel that
disagrees is illustration. Cards are grouped by comparing the badge itself
rather than by name, because "Team Rocket's" alone covers four portraits
(two grunts, Giovanni, Ariana). A trimmed spread absorbs WebP compression
drift; the blob is then closed, reduced to its largest component, hole-filled
and feathered.

Only the part of the badge inside the illustration rect is recovered - that is
all the foil window can use, and stopping at the rect keeps the frame, which is
identical on every card of a type, from bridging the badge to the border.

Output is the finished foil window: the illustration rect, minus the evolution
badge on the -evo variant, minus the portrait. .foil-holo intersects with it
and .foil-reverse subtracts it, so one file drives both. Cards that got one are
stamped with `ownerMask` in data/<set>.json, which is what app.js keys off.

    py scripts/make_owner_masks.py [--debug]
"""
from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from collections import defaultdict, deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "masks" / "owner"
DEBUG_DIR = ROOT / "scripts" / "_debug"

# Card scans are 600x838. Every measurement below is in that space.
SIZE = (600, 838)
RECT = (47, 78, 556, 395)      # illustration window, x0 y0 x1 y1
EVO = (59, 105, 56)            # evolution badge circle: cx, cy, r
EVO_SOLID = 0.88               # fraction drawn at full strength before fading

# Badge search box, clipped to the illustration rect on the right and bottom:
# outside it the card frame is byte-identical on same-type cards, and it would
# bridge the badge to the border and swallow half the card.
# INSET keeps the window's own inner shadow out of it as well: that shadow is
# byte-identical on every card of a type, so on an owner whose cards share one
# it would "agree" and hang a hairline off the badge, all the way down the art.
INSET = 4
BOX = (440, 268, RECT[2] - INSET, RECT[3] - INSET)
# Medallion interior - badge on every owner card, so it is what portraits are
# compared on when grouping them.
CORE = (512, 342, 568, 392)

SPREAD = 34        # max trimmed channel spread that still counts as "agrees"
# ...but with only a handful of cards behind a portrait, a patch of shared
# background clears that bar too easily, so a short sample list has to agree
# more closely before it is believed.
SPREAD_BY_SAMPLES = {2: 14, 3: 26}
# Mean abs channel difference over CORE. Measured across every owner card, the
# same portrait lands at 3-10 and a different one at 45 or more, so the cut sits
# in the empty middle of that gap.
SAME_PORTRAIT = 20
CLOSE = 5          # px of morphological close, to bridge thin outlines
OPEN = 5           # px of morphological open, to shed hairline strips
FEATHER = 1.1      # px of gaussian softening on the finished cut
WELL_SAMPLED = 3   # cards needed before a portrait may shape the envelope
ENVELOPE_SLACK = 9 # px the envelope is grown by before it is trusted as a bound

OWNER_SUBTYPE = re.compile("['’]s\\s+Pok")
OWNER_NAME = re.compile("(.+?)['’]s\\s")
# Full-art rarities print the illustration edge to edge with no window and take
# a whole-card foil, so they are neither useful samples nor consumers.
FULL_ART = {
    "Illustration Rare",
    "Special Illustration Rare",
    "Hyper Rare",
    "Ultra Rare",
}


def slugify(name):
    flat = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub("[^a-z0-9]+", "-", flat.lower()).strip("-")


def card_sort_key(card):
    digits = re.sub("[^0-9]", "", str(card["number"])) or "0"
    return (card["set"], int(digits), str(card["number"]))


def collect():
    """Every windowed owner card, plus the loaded data files to stamp later."""
    files = {}
    cards = []
    for path in sorted((ROOT / "data").glob("me*.json")):
        before = path.read_text(encoding="utf-8")
        raw = json.loads(before)
        files[path.stem] = (path, raw, before)
        records = raw["cards"] if isinstance(raw, dict) and "cards" in raw else raw
        for record in records:
            subtypes = [str(s) for s in record.get("subtypes") or []]
            if record.get("supertype") != "Pokémon":
                continue
            if not any(OWNER_SUBTYPE.search(s) for s in subtypes):
                continue
            record.pop("ownerMask", None)
            if record.get("rarity") in FULL_ART:
                continue
            match = OWNER_NAME.match(record["name"])
            if not match:
                continue
            cards.append({
                "set": path.stem,
                "number": str(record["number"]),
                "owner": slugify(match.group(1)),
                "evo": "Stage 1" in subtypes or "Stage 2" in subtypes or bool(record.get("evolvesFrom")),
                "record": record,
            })
    return files, sorted(cards, key=card_sort_key)


def scan(card):
    path = ROOT / "assets" / "cards" / card["set"] / (card["number"] + ".webp")
    return Image.open(path).convert("RGB")


def group_by_portrait(cards):
    """Cluster cards whose medallion holds the same bitmap.

    Single linkage rather than greedy: two scans of one portrait can sit either
    side of a third, and a first-match-wins pass would file them separately.
    """
    cores = [scan(card).crop(CORE) for card in cards]
    parent = list(range(len(cards)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(cards)):
        for j in range(i + 1, len(cards)):
            if find(i) == find(j):
                continue
            diff = ImageStat.Stat(ImageChops.difference(cores[i], cores[j])).mean
            if sum(diff) / 3 <= SAME_PORTRAIT:
                parent[find(j)] = find(i)

    clusters = []
    index = {}
    for i, card in enumerate(cards):
        root = find(i)
        if root not in index:
            index[root] = len(clusters)
            clusters.append({"cards": []})
        clusters[index[root]]["cards"].append(card)

    # One slug per portrait; a name covering several portraits gets numbered in
    # first-appearance order, which is stable because `cards` is sorted.
    seen = defaultdict(int)
    for cluster in clusters:
        owner = cluster["cards"][0]["owner"]
        seen[owner] += 1
        cluster["slug"] = owner if seen[owner] == 1 else "%s-%d" % (owner, seen[owner])
    return clusters


def agreement(samples):
    """255 where every sample paints the same colour, 0 where they disagree."""
    w, h = BOX[2] - BOX[0], BOX[3] - BOX[1]
    # A touch of blur first: WebP rings around the badge outline, and the ring
    # differs with whatever it was encoded against.
    px = [im.crop(BOX).filter(ImageFilter.GaussianBlur(0.8)).load() for im in samples]
    n = len(px)
    spread = SPREAD_BY_SAMPLES.get(n, SPREAD)
    trim = min(2, max(0, (n - 3) // 4))
    lo, hi = trim, n - 1 - trim
    out = Image.new("L", (w, h), 0)
    dst = out.load()
    for y in range(h):
        for x in range(w):
            pixels = [p[x, y] for p in px]
            worst = 0
            for ch in range(3):
                band = sorted(p[ch] for p in pixels)
                worst = max(worst, band[hi] - band[lo])
                if worst > spread:
                    break
            if worst <= spread:
                dst[x, y] = 255
    return out


def largest_blob(mask):
    """Drop everything but the biggest connected run of set pixels."""
    w, h = mask.size
    src = mask.load()
    seen = [[False] * w for _ in range(h)]
    best = []
    for sy in range(h):
        for sx in range(w):
            if src[sx, sy] < 128 or seen[sy][sx]:
                continue
            blob = []
            queue = deque([(sx, sy)])
            seen[sy][sx] = True
            while queue:
                x, y = queue.popleft()
                blob.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and src[nx, ny] >= 128:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
            if len(blob) > len(best):
                best = blob
    out = Image.new("L", (w, h), 0)
    dst = out.load()
    for x, y in best:
        dst[x, y] = 255
    return out


def fill_holes(mask):
    """Close interior gaps - eyes and highlights inside the bust read as art."""
    w, h = mask.size
    src = mask.load()
    outside = [[False] * w for _ in range(h)]
    queue = deque()
    edges = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    edges += [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for x, y in edges:
        if src[x, y] < 128 and not outside[y][x]:
            outside[y][x] = True
            queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and src[nx, ny] < 128:
                outside[ny][nx] = True
                queue.append((nx, ny))
    out = Image.new("L", (w, h), 0)
    dst = out.load()
    for y in range(h):
        for x in range(w):
            dst[x, y] = 0 if outside[y][x] else 255
    return out


def silhouette(samples, envelope=None):
    mask = agreement(samples)
    if envelope is not None:
        mask = ImageChops.darker(mask, envelope)
    # Close before picking the blob so the plate, the bust and Team Rocket's "R"
    # arrive as one piece rather than three; open after it to shed the hairline
    # of frame that runs down the window's own edge, which agrees on every card
    # of a type and would otherwise hang off the badge as a 1px tail.
    mask = mask.filter(ImageFilter.MaxFilter(CLOSE)).filter(ImageFilter.MinFilter(CLOSE))
    mask = mask.filter(ImageFilter.MinFilter(OPEN)).filter(ImageFilter.MaxFilter(OPEN))
    return fill_holes(largest_blob(mask))


def portrait_envelope(clusters, shapes):
    """Where a portrait is allowed to reach, learned from the well-sampled ones.

    Two cards is enough to place a portrait but not to rule out a coincidence:
    a pair from one evolution line can share enough background that whole
    patches of illustration "agree". Every portrait is a bust in the same
    plate, so the union of the ones backed by real samples, grown a little,
    bounds the rest.
    """
    reliable = [shape for cluster, shape in zip(clusters, shapes)
                if shape is not None and len(cluster["cards"]) >= WELL_SAMPLED]
    if not reliable:
        return None
    union = reliable[0]
    for shape in reliable[1:]:
        union = ImageChops.lighter(union, shape)
    return union.filter(ImageFilter.MaxFilter(ENVELOPE_SLACK * 2 + 1))


def punch_evo(img):
    cx, cy, r = EVO
    px = img.load()
    for y in range(max(0, cy - r - 2), min(SIZE[1], cy + r + 2)):
        for x in range(max(0, cx - r - 2), min(SIZE[0], cx + r + 2)):
            d = math.hypot(x - cx, y - cy)
            if d > r:
                continue
            t = d / r
            cut = 1.0 if t <= EVO_SOLID else max(0.0, 1.0 - (t - EVO_SOLID) / (1 - EVO_SOLID))
            px[x, y] = int(round(px[x, y] * (1 - cut)))


def window(badge, evo):
    """Illustration rect, minus the evo badge, minus the owner portrait."""
    win = Image.new("L", SIZE, 0)
    win.paste(255, RECT)
    if evo:
        punch_evo(win)
    cut = Image.new("L", SIZE, 0)
    cut.paste(badge, (BOX[0], BOX[1]))
    # Carry the badge across the inset, out to the corner of the rect. The plate
    # runs straight through there, so repeating the last row and column lands on
    # the same edge the recovered part of the badge was heading for.
    cp = cut.load()
    for x in range(BOX[2], RECT[2]):
        for y in range(BOX[1], BOX[3]):
            cp[x, y] = cp[BOX[2] - 1, y]
    for y in range(BOX[3], RECT[3]):
        for x in range(BOX[0], RECT[2]):
            cp[x, y] = cp[x, BOX[3] - 1]
    cut = cut.filter(ImageFilter.GaussianBlur(FEATHER))
    px, cp = win.load(), cut.load()
    for y in range(BOX[1] - 3, min(SIZE[1], RECT[3] + 3)):
        for x in range(BOX[0] - 3, min(SIZE[0], RECT[2] + 3)):
            if cp[x, y]:
                px[x, y] = int(px[x, y] * (255 - cp[x, y]) / 255)
    return win


def as_alpha(mask):
    out = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    out.putalpha(mask)
    return out


def main():
    debug = "--debug" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    files, cards = collect()
    if not cards:
        print("no owner cards found")
        return 0

    clusters = group_by_portrait(cards)
    scans = {}
    for cluster in clusters:
        for card in cluster["cards"]:
            scans[card["set"] + "-" + card["number"]] = scan(card)

    def samples_for(cluster):
        return [scans[c["set"] + "-" + c["number"]] for c in cluster["cards"]]

    # First pass shapes the envelope, second pass is bounded by it.
    first = [silhouette(samples_for(c)) if len(c["cards"]) >= 2 else None for c in clusters]
    envelope = portrait_envelope(clusters, first)
    shapes = [silhouette(samples_for(c), envelope) if len(c["cards"]) >= 2 else None
              for c in clusters]

    stamped = 0
    panels = []

    for cluster, badge in zip(clusters, shapes):
        members = cluster["cards"]
        slug = cluster["slug"]
        if badge is None:
            head = members[0]
            print("  skip %s (%s-%s): only one card, nothing to compare against"
                  % (slug, head["set"], head["number"]))
            continue
        samples = samples_for(cluster)
        # Both variants every time: a portrait picked up by a future set may
        # arrive on the evolution stage this one never printed.
        for evo in (False, True):
            name = (slug + "-evo.png") if evo else (slug + ".png")
            path = OUT / name
            as_alpha(window(badge, evo)).save(path, optimize=True)
            print("  %s  %s bytes" % (path.relative_to(ROOT), format(path.stat().st_size, ",")))
        for card in members:
            card["record"]["ownerMask"] = slug
            stamped += 1
        print("      %s: %s" % (slug, ", ".join(c["set"] + "-" + c["number"] for c in members)))
        if debug:
            base = samples[0].crop(BOX)
            tint = Image.new("RGB", base.size, (255, 40, 40))
            panels.append(Image.composite(Image.blend(base, tint, 0.55), base, badge))

    for stem, (path, raw, before) in sorted(files.items()):
        after = json.dumps(raw, ensure_ascii=False, indent=2) + "\n"
        if after != before:
            path.write_text(after, encoding="utf-8", newline="\n")
            print("  rewrote %s" % path.relative_to(ROOT))
    print("\n  stamped ownerMask on %d card(s) across %d portrait(s)" % (stamped, len(clusters)))

    if debug and panels:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        w, h = panels[0].size
        cols = 4
        rows = (len(panels) + cols - 1) // cols
        sheet = Image.new("RGB", (w * 2 * cols, h * 2 * rows), (18, 18, 22))
        for i, panel in enumerate(panels):
            sheet.paste(panel.resize((w * 2, h * 2), Image.NEAREST),
                        ((i % cols) * w * 2, (i // cols) * h * 2))
        sheet.save(DEBUG_DIR / "owner-masks.png")
        print("  debug sheet -> %s" % (DEBUG_DIR / "owner-masks.png").relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
