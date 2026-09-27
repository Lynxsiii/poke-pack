"""Download every card scan we use and serve it from our own assets.

Card faces are currently hotlinked from images.scrydex.com. On a real domain
that is a dependency we do not control — rate limits, hotlink blocking or a
CDN change would break every card at once, and none of those hosts owe us the
bandwidth. This pulls each scan once, re-encodes it to WebP at the two sizes
the site actually renders, and repoints data/<set>.json at the local copies.

Sizes come from measuring the live layout: the biggest a card ever draws is the
focus/inspect view at ~300 CSS px, so 600px covers it at 2x retina; the binder
draws at ~157px, so 320px covers that. Shipping the raw 733x1024 PNGs would be
~1.2MB per card for no visible gain.

The original URL is kept on each card as `imageRemote`, so a re-run can refetch
without going back to the source site, and nothing is silently lost.

Resumable: files that already exist are skipped unless --force is passed.

Usage:
    py scripts/mirror_images.py               # every set
    py scripts/mirror_images.py me5           # one set
    py scripts/mirror_images.py --fix-local    # re-round/un-matte files already on disk
    py scripts/mirror_images.py --photos sv10  # re-trim cards scanned from TCGplayer photos
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CARD_DIR = ROOT / "assets" / "cards"

SETS = [p.stem for p in (DATA / "sets").glob("*.json")]

# (suffix, width, quality) — width in px, height follows the 733x1024 scan ratio.
VARIANTS = [("", 600, 75), ("-sm", 320, 75)]
RATIO = 1024 / 733
# Printed Pokémon card corner: 2.5 mm on a 63 mm short edge.
CORNER_MM = 2.5
CARD_WIDTH_MM = 63
# Photos on white: a pixel whose darkest channel is at least this is paper.
# Silver borders photograph at about 200-230, so they stay card.
PAPER = 236
# Most paper a photo can lose from each side, as a fraction of that side.
# TCGplayer pads some photos to 800 x 1000, about 4.5% a side.
MAX_TRIM = 0.08
# Border shaved off each side of a photo past the paper, as a fraction of
# the width: 0.3 mm, which takes the pale cut edge and leaves the frame.
EDGE_INSET = 0.005

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) poke-pack.rip image mirror"

# Shared art that is equally hotlinked: the card back and the basic Energy
# faces referenced from js/catalog.js.
SHARED = {
    "card-back": "https://images.pokemontcg.io/card-back.png",
    **{
        f"energy-{name}": f"https://images.pokemontcg.io/sve/{i}_hires.png"
        for i, name in enumerate(
            ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal"],
            start=1,
        )
    },
}


def download(url: str, tries: int = 3) -> bytes | None:
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == tries - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def usable(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 64:
        return False
    try:
        with Image.open(path) as img:
            img.load()
        return True
    except (OSError, UnidentifiedImageError, ValueError):
        return False


def sample_border(img: Image.Image) -> tuple[int, int, int]:
    """Colour of the printed frame, used as the transparent-pixel matte.

    Pillow's WebP encoder zeros RGB on fully-transparent pixels unless
    `exact=True`. Those (0,0,0,0) corners blend into a black wedge when the
    browser scales the card on a dark page.
    """
    w, h = img.size
    for y in range(min(h, 12)):
        r, g, b, a = img.getpixel((w // 2, y))
        if a > 200:
            return (r, g, b)
    return (220, 222, 224)


def is_photo(img: Image.Image) -> bool:
    """True for a flat photo of the card (TCGplayer's listing JPEGs).

    Scans carry the card's outline in their alpha channel. A photo has none:
    the card sits on white paper, with white in its rounded corners and
    sometimes a sliver of white down each side.
    """
    return "A" not in img.getbands() or img.getchannel("A").getextrema()[0] == 255


def trim_photo(img: Image.Image) -> tuple[Image.Image, float]:
    """Crop a photo to the card's own edge and measure its corner radius.

    Returns the crop and the radius as a fraction of its width. Without this
    the paper around the card survives the resize as a white rim, and since
    photographed corners are rounder than the printed 2.5 mm, white wedges
    survive the rounding too.
    """
    rgb = np.asarray(img.convert("RGB"))
    card = rgb.min(axis=2) < PAPER
    h, w = card.shape
    cols = np.nonzero(card.mean(axis=0) > 0.5)[0]
    rows = np.nonzero(card.mean(axis=1) > 0.5)[0]
    if not len(cols) or not len(rows):
        return img, CORNER_MM / CARD_WIDTH_MM
    left, right = int(cols[0]), int(cols[-1]) + 1
    top, bottom = int(rows[0]), int(rows[-1]) + 1
    # A pale silver border could pass for paper. Trust the trim only when
    # what is left is card-shaped (63 x 88), and never past MAX_TRIM a side.
    shape = (right - left) / (bottom - top) * RATIO
    if abs(shape - 1) > 0.035 or max(left, w - right) > w * MAX_TRIM or max(top, h - bottom) > h * MAX_TRIM:
        left, right, top, bottom = 0, w, 0, h
    # Then a hair more: the card's cut edge photographs as a pale line a
    # pixel or two wide, half paper and half border.
    inset = max(1, round(w * EDGE_INSET))
    left, right, top, bottom = left + inset, right - inset, top + inset, bottom - inset
    card = card[top:bottom, left:right]
    ch, cw = card.shape
    # Walk the diagonal in from each corner to the first pixel of card. A
    # circular corner of radius r meets the diagonal r * (1 - 1/sqrt 2) in.
    limit = round(cw * 2 * CORNER_MM / CARD_WIDTH_MM)
    radius = CORNER_MM / CARD_WIDTH_MM
    for x0, y0, dx, dy in ((0, 0, 1, 1), (cw - 1, 0, -1, 1), (0, ch - 1, 1, -1), (cw - 1, ch - 1, -1, -1)):
        k = 0
        while k < limit and not card[y0 + dy * k, x0 + dx * k]:
            k += 1
        radius = max(radius, k / (1 - 0.5**0.5) / cw)
    return img.crop((left, top, right, bottom)), min(radius, 2 * CORNER_MM / CARD_WIDTH_MM)


def round_and_unmatte(img: Image.Image, radius: float | None = None) -> Image.Image:
    """Force the printed card radius and strip the black corner matte.

    `radius` (a fraction of the width) widens the corner for photos whose
    corners are rounder than print. The mask is drawn at 4x and scaled down
    so the corner is antialiased rather than stair-stepped.
    """
    img = img.convert("RGBA")
    w, h = img.size
    px = max(6, round(w * CORNER_MM / CARD_WIDTH_MM))
    if radius:
        # A pixel or two extra so the photo's own antialiased edge, which is
        # half paper, falls outside the mask too.
        px = max(px, round(w * radius) + max(1, round(w / 300)))
    big = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=px * 4, fill=255)
    mask = big.resize((w, h), Image.LANCZOS)
    alpha = ImageChops.multiply(img.getchannel("A"), mask)
    # Composite onto the frame colour first so transparent pixels keep a
    # matching RGB instead of compressed-to-black.
    flat = Image.new("RGBA", (w, h), (*sample_border(img), 255))
    flat.alpha_composite(img)
    out = flat.convert("RGB").convert("RGBA")
    out.putalpha(alpha)
    return out


def save_webp(img: Image.Image, path: Path, quality: int) -> int:
    img.save(path, "WEBP", quality=quality, method=4, exact=True)
    size = path.stat().st_size
    if size == 0:
        path.unlink(missing_ok=True)
        raise OSError(f"{path.name} wrote 0 bytes")
    return size


def encode(raw: bytes, out_dir: Path, stem: str, force: bool) -> tuple[int, bool]:
    """Write every variant for one card. Returns (bytes written, did work).

    Keep RGBA. The scans carry the card's rounded corners in their alpha
    channel, and flattening to RGB paints those corners onto opaque black —
    visible as square blobs, and it also breaks the foil masks, which use
    `--art` alpha to clip the shine to the card outline.
    """
    targets = [(out_dir / f"{stem}{suffix}.webp", w, q) for suffix, w, q in VARIANTS]
    if not force and all(usable(p) for p, _, _ in targets):
        return sum(p.stat().st_size for p, _, _ in targets), False

    source = Image.open(BytesIO(raw))
    radius = None
    if is_photo(source):
        source, radius = trim_photo(source)
    source = source.convert("RGBA")
    written = 0
    for path, width, quality in targets:
        height = round(width * RATIO)
        face = round_and_unmatte(source.resize((width, height), Image.LANCZOS), radius)
        written += save_webp(face, path, quality)
    return written, True


def fix_local_set(set_id: str) -> tuple[int, int, int]:
    """Re-round and un-matte files already on disk. Re-download broken ones."""
    path = DATA / f"{set_id}.json"
    if not path.exists():
        print(f"  no data/{set_id}.json — skipped")
        return 0, 0, 0
    cards = json.loads(path.read_text(encoding="utf-8"))
    out_dir = CARD_DIR / set_id
    out_dir.mkdir(parents=True, exist_ok=True)
    done = failed = total = 0
    for index, card in enumerate(cards, start=1):
        stem = str(card.get("number") or card.get("id"))
        remote = card.get("imageRemote") or ""
        ok = True
        for suffix, _width, quality in VARIANTS:
            dest = out_dir / f"{stem}{suffix}.webp"
            if usable(dest):
                try:
                    with Image.open(dest) as img:
                        face = round_and_unmatte(img)
                    total += save_webp(face, dest, quality)
                except OSError as exc:
                    print(f"    #{stem}{suffix}: {exc}")
                    ok = False
            elif remote.startswith("http"):
                raw = download(remote)
                if raw is None:
                    print(f"    #{stem}: download failed")
                    ok = False
                    break
                try:
                    written, _ = encode(raw, out_dir, stem, force=True)
                except OSError as exc:
                    print(f"    #{stem}: encode failed ({exc})")
                    ok = False
                    break
                total += written
                time.sleep(0.15)
                break
            else:
                print(f"    #{stem}{suffix}: missing, no remote")
                ok = False
        if ok:
            done += 1
        else:
            failed += 1
        if index % 50 == 0:
            print(f"    {index}/{len(cards)}…")
    return done, failed, total


def fix_local_shared() -> tuple[int, int]:
    out_dir = CARD_DIR / "shared"
    if not out_dir.exists():
        return 0, 0
    done = total = 0
    for dest in sorted(out_dir.glob("*.webp")):
        if not usable(dest):
            continue
        quality = 75 if dest.name.endswith("-sm.webp") else 75
        with Image.open(dest) as img:
            face = round_and_unmatte(img)
        total += save_webp(face, dest, quality)
        done += 1
    return done, total


def photo_source(url: str) -> bool:
    """Whether a card's remote is a JPEG photo rather than a cut-out scan."""
    return url.split("?")[0].lower().endswith((".jpg", ".jpeg"))


def replace_scan(raw: bytes, set_id: str, card: dict, stem: str) -> bool:
    """Encode `raw` as the card's scan, under a new name if the art changed.

    /assets/* is served immutable for a year (see _headers), so new art under
    an old filename never reaches a browser that already holds the old one.
    When the card already has a local scan and the new encode differs, it is
    written as <stem>-v2 (then -v3, ...), the card is repointed and the old
    files are deleted. Returns whether the art changed.
    """
    out_dir = CARD_DIR / set_id
    have = card.get("image") or ""
    old = Path(have).stem if have.startswith(f"assets/cards/{set_id}/") else ""
    # Only this card's own files: `stem` itself or an earlier -vN of it.
    if not re.fullmatch(rf"{re.escape(stem)}(-v\d+)?", old) or not usable(ROOT / have):
        old = ""
    version = re.fullmatch(r".*-v(\d+)", old)
    name = f"{stem}-v{int(version.group(1)) + 1 if version else 2}" if old else stem
    encode(raw, out_dir, name, force=True)
    changed = True
    if old:
        pairs = [(out_dir / f"{old}{s}.webp", out_dir / f"{name}{s}.webp") for s, _, _ in VARIANTS]
        if all(a.exists() and a.read_bytes() == b.read_bytes() for a, b in pairs):
            for _, b in pairs:
                b.unlink()
            name, changed = old, False
        else:
            for a, _ in pairs:
                a.unlink(missing_ok=True)
    card["image"] = f"assets/cards/{set_id}/{name}.webp"
    card["imageSmall"] = f"assets/cards/{set_id}/{name}-sm.webp"
    return changed


def photo_source(url: str) -> bool:
    """Whether a card's remote is a JPEG photo rather than a cut-out scan."""
    return url.split("?")[0].lower().endswith((".jpg", ".jpeg"))


def refetch_photos(set_id: str) -> tuple[int, int]:
    """Re-encode every card in a set whose scan came from a photo on white.

    Promo prints the scan sites lack (stamps, Cosmos holos, Pokémon Center
    and prerelease copies) come from TCGplayer's listing photos. Rerun this
    after the trim in `trim_photo` changes, or when a set arrives with photos
    encoded before it existed. Changed scans get a new filename.
    """
    path = DATA / f"{set_id}.json"
    if not path.exists():
        return 0, 0
    cards = json.loads(path.read_text(encoding="utf-8"))
    done = failed = 0
    for card in cards:
        remote = card.get("imageRemote") or ""
        local = card.get("image") or ""
        if not photo_source(remote) or not local.startswith(f"assets/cards/{set_id}/"):
            continue
        raw = download(remote)
        if raw is None:
            print(f"    {card['id']}: download failed")
            failed += 1
            continue
        stem = re.sub(r"-v\d+$", "", Path(local).stem)
        done += replace_scan(raw, set_id, card, stem)
        time.sleep(0.15)
    path.write_text(json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return done, failed


def mirror_set(set_id: str, force: bool) -> tuple[int, int, int]:
    path = DATA / f"{set_id}.json"
    if not path.exists():
        print(f"  no data/{set_id}.json — skipped")
        return 0, 0, 0

    cards = json.loads(path.read_text(encoding="utf-8"))
    out_dir = CARD_DIR / set_id
    out_dir.mkdir(parents=True, exist_ok=True)

    done = failed = total_bytes = 0
    for index, card in enumerate(cards, start=1):
        stem = str(card.get("number") or card.get("id"))
        # Prefer the remote we recorded on a previous run; fall back to whatever
        # `image` currently holds, which is the remote URL on a first pass.
        remote = card.get("imageRemote") or card.get("image") or ""
        local = f"assets/cards/{set_id}/{stem}.webp"
        local_sm = f"assets/cards/{set_id}/{stem}-sm.webp"

        targets_exist = usable(out_dir / f"{stem}.webp") and usable(out_dir / f"{stem}-sm.webp")
        if targets_exist and not force:
            total_bytes += (out_dir / f"{stem}.webp").stat().st_size
            total_bytes += (out_dir / f"{stem}-sm.webp").stat().st_size
        else:
            if not remote.startswith("http"):
                failed += 1
                continue
            raw = download(remote)
            if raw is None:
                print(f"    #{stem} {card.get('name','?')}: download failed, kept remote URL")
                failed += 1
                continue
            try:
                written, _ = encode(raw, out_dir, stem, force)
            except OSError as exc:
                print(f"    #{stem}: encode failed ({exc}), kept remote URL")
                failed += 1
                continue
            total_bytes += written
            time.sleep(0.15)  # be a polite guest

        if remote.startswith("http"):
            card["imageRemote"] = remote
        card["image"] = local
        card["imageSmall"] = local_sm
        done += 1
        if index % 25 == 0:
            print(f"    {index}/{len(cards)}…")

    path.write_text(json.dumps(cards, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return done, failed, total_bytes


def encode_flat(raw: bytes, path: Path, max_width: int, quality: int) -> int:
    """Encode a logo or symbol, keeping transparency and aspect ratio.

    Card faces get converted to RGB, but these sit on the dark page and must
    keep their alpha channel or they arrive in an opaque box.
    """
    img = Image.open(BytesIO(raw)).convert("RGBA")
    if img.width > max_width:
        height = round(img.height * max_width / img.width)
        img = img.resize((max_width, height), Image.LANCZOS)
    img.save(path, "WEBP", quality=quality, method=6, exact=True)
    return path.stat().st_size


def set_identities() -> list[tuple[str, str, str]]:
    """(set id, logo url, symbol url) for every set in js/catalog.js.

    Parsed out of catalog.js rather than restated here, so adding a set to the
    roadmap automatically brings its art along on the next run.
    """
    src = (ROOT / "js" / "catalog.js").read_text(encoding="utf-8")

    def block(name: str) -> str:
        match = re.search(rf"{name}\s*=\s*(?:new Set\()?[\[{{](.*?)[\]}}]\)?;", src, re.S)
        return match.group(1) if match else ""

    alias = dict(re.findall(r'(\w+):\s*"([^"]+)"', block("TCG_ID_ALIAS")))
    scrydex = set(re.findall(r'"([^"]+)"', block("SCRYDEX_LOGO")))
    limitless = dict(re.findall(r'(\w+):\s*"([^"]+)"', block("LIMITLESS_SYMBOL")))

    # Roadmap entries and playable sets both carry a released date; wrappers and
    # rarity groups do not, which keeps their ids out of this.
    ids: list[str] = []
    for match in re.finditer(r'id:\s*"([A-Za-z0-9]+)"', src):
        tail = src[match.end() : match.end() + 220]
        if "released:" not in tail and "tcgId:" not in tail:
            continue
        tcg = re.search(r'tcgId:\s*"([^"]+)"', tail)
        set_id = tcg.group(1) if tcg else alias.get(match.group(1), match.group(1))
        if set_id not in ids:
            ids.append(set_id)

    out = []
    for set_id in ids:
        if set_id in scrydex:
            logo = f"https://images.scrydex.com/pokemon/{set_id}-logo/logo"
            symbol = f"https://s3.limitlesstcg.com/sets/en/{limitless.get(set_id, set_id)}_SM.png"
        else:
            logo = f"https://images.pokemontcg.io/{set_id}/logo.png"
            symbol = f"https://images.pokemontcg.io/{set_id}/symbol.png"
        out.append((set_id, logo, symbol))
    return out


def mirror_identity(force: bool) -> tuple[int, int, int]:
    """Set logos and symbols for the catalog view."""
    out_dir = CARD_DIR / "sets"
    out_dir.mkdir(parents=True, exist_ok=True)
    done = missing = total = 0
    for set_id, logo_url, symbol_url in set_identities():
        for kind, url, width, quality in (
            ("logo", logo_url, 480, 82),
            ("symbol", symbol_url, 96, 88),
        ):
            path = out_dir / f"{set_id}-{kind}.webp"
            if path.exists() and not force:
                total += path.stat().st_size
                done += 1
                continue
            raw = download(url, tries=2)
            if raw is None:
                missing += 1
                continue
            try:
                total += encode_flat(raw, path, width, quality)
                done += 1
            except OSError:
                missing += 1
            time.sleep(0.1)
    return done, missing, total


def mirror_shared(force: bool) -> tuple[int, int]:
    out_dir = CARD_DIR / "shared"
    out_dir.mkdir(parents=True, exist_ok=True)
    done = total = 0
    for stem, url in SHARED.items():
        if (out_dir / f"{stem}.webp").exists() and not force:
            total += (out_dir / f"{stem}.webp").stat().st_size
            done += 1
            continue
        raw = download(url)
        if raw is None:
            print(f"    {stem}: download failed")
            continue
        try:
            written, _ = encode(raw, out_dir, stem, force)
        except OSError as exc:
            print(f"    {stem}: encode failed ({exc})")
            continue
        total += written
        done += 1
        time.sleep(0.15)
    return done, total


def main(argv: list[str]) -> int:
    force = "--force" in argv
    fix_local = "--fix-local" in argv
    wanted = [a for a in argv if not a.startswith("-")] or SETS
    unknown = [s for s in wanted if s not in SETS]
    if unknown:
        print(f"unknown set(s): {', '.join(unknown)}", file=sys.stderr)
        return 2

    if "--photos" in argv:
        for set_id in wanted:
            done, failed = refetch_photos(set_id)
            if done or failed:
                note = f", {failed} failed" if failed else ""
                print(f"{set_id}: {done} photos re-encoded under new names{note}")
        return 0

    if fix_local:
        grand = 0
        for set_id in wanted:
            print(f"{set_id}:")
            done, failed, size = fix_local_set(set_id)
            grand += size
            note = f", {failed} failed" if failed else ""
            print(f"  {done} cards rewritten ({size / 1_048_576:.1f} MB){note}")
        print("shared:")
        shared_done, shared_size = fix_local_shared()
        grand += shared_size
        print(f"  {shared_done} images ({shared_size / 1024:.0f} KB)")
        print(f"\ntotal on disk: {grand / 1_048_576:.1f} MB")
        return 0

    grand = 0
    for set_id in wanted:
        print(f"{set_id}:")
        done, failed, size = mirror_set(set_id, force)
        grand += size
        note = f", {failed} still remote" if failed else ""
        print(f"  {done} cards local ({size / 1_048_576:.1f} MB){note}")

    print("shared:")
    shared_done, shared_size = mirror_shared(force)
    grand += shared_size
    print(f"  {shared_done} images ({shared_size / 1024:.0f} KB)")

    print("set logos + symbols:")
    id_done, id_missing, id_size = mirror_identity(force)
    grand += id_size
    gap = f", {id_missing} unavailable upstream" if id_missing else ""
    print(f"  {id_done} images ({id_size / 1024:.0f} KB){gap}")

    print(f"\ntotal on disk: {grand / 1_048_576:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
