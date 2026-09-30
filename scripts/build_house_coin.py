"""The house coin's relief: Meowth (heads) and its koban charm (tails), struck in
the casino's gold and shipped as one transparent sheet, both faces side by side
(heads left), for js/coin.js to lay over its CSS field. The rim, beads, legends
and the field itself stay vector/CSS so they are crisp at every size; only the
sculpted emblem is a picture.

    python3 scripts/build_house_coin.py            -> assets/casino/house-coin-v1.webp

Meowth's official artwork is fetched from PokeAPI (the same source the drawn
gear coins use, see build_gear.py); the koban is drawn here. Never overwrite a
shipped file under assets/: bump the -v suffix instead.
"""
from __future__ import annotations

import hashlib
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
import gear_art as g  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "casino" / "house-coin-v1.webp"
CACHE = Path(__file__).resolve().parent / ".cache" / "house-coin"  # gitignored
ARTWORK = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{}.png"
MEOWTH = 52

FACE = 512           # px per face in the sheet
SS = 3               # render supersample
# The coin's 200-unit face in js/coin.js: the emblem must sit inside the inner
# ring (r 61), the legends run at r 69..76 and the beads at r 86.
EMBLEM = 0.6         # emblem box as a fraction of the face

# House gold (css/casino-coin.css): shadow, body, light, pressed line.
GOLD = {
    "shadow": (60, 34, 4),
    "body": (236, 196, 96),
    "light": (255, 244, 196),
    "line": (110, 72, 16),
}


def fetch(url: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".png")
    if not p.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.5.0", "Accept": "*/*"})
        p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return p


def blur(a: np.ndarray, r: float) -> np.ndarray:
    return g._blur(a, r)


def fit_art(art: Image.Image, S: int, frac: float, dy: float = 0.0) -> np.ndarray:
    """Artwork trimmed to content and centred in an S-square, as float RGBA."""
    art = art.convert("RGBA")
    bb = art.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bb:
        art = art.crop(bb)
    fit = S * frac
    k = min(fit / art.width, fit / art.height)
    art = art.resize((max(1, round(art.width * k)), max(1, round(art.height * k))), Image.LANCZOS)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.paste(art, (round((S - art.width) / 2), round((S - art.height) / 2 + S * dy)), art)
    return np.asarray(layer).astype(np.float32) / 255


def koban_art(S: int) -> Image.Image:
    """Pay Day: three of Meowth's koban charms, the coins it scatters, drawn flat
    so the relief pass reads them like a drawing. A koban is a tall gold oval
    with a rim ridge, a stamped seal in the middle and fan-shaped strikes at
    each end."""
    ss = 2
    W = S * ss
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    body = (238, 196, 92, 255)
    ink = (60, 34, 4, 255)
    lw = int(W * 0.016)

    def koban(cx: float, cy: float, rx: float, ry: float, tilt: float) -> None:
        layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=body, outline=ink, width=lw)
        k = 0.78
        d.ellipse((cx - rx * k, cy - ry * k, cx + rx * k, cy + ry * k), outline=ink, width=int(lw * 0.7))
        sw, sh = rx * 0.34, ry * 0.30
        d.rounded_rectangle((cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2), radius=int(sw * 0.2), outline=ink, width=int(lw * 0.8))
        d.line((cx, cy - sh * 0.26, cx, cy + sh * 0.26), fill=ink, width=int(lw * 0.7))
        for sy in (-1, 1):
            y = cy + sy * ry * 0.5
            box = (cx - rx * 0.4, y - ry * 0.1, cx + rx * 0.4, y + ry * 0.1)
            d.arc(box, 200 if sy < 0 else 20, 340 if sy < 0 else 160, fill=ink, width=int(lw * 0.7))
        layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(cx, cy))
        im.alpha_composite(layer)

    cx = cy = W / 2
    rx, ry = W * 0.20, W * 0.30
    # two behind, leaning out; the front one upright and a touch lower
    koban(cx - W * 0.20, cy - W * 0.08, rx, ry, 22)
    koban(cx + W * 0.20, cy - W * 0.08, rx, ry, -22)
    koban(cx, cy + W * 0.10, rx * 1.04, ry * 1.04, 0)
    return im.resize((S, S), Image.LANCZOS)


def relief(art: Image.Image, S: int, frac: float, dy: float = 0.0, line_gain: float = 9.0) -> np.ndarray:
    """A struck emblem on a transparent ground: the silhouette raised, the
    artwork's own line work pressed in, lit from the upper left, with the
    cast shadow and the catch light the CSS emboss draws (js/coin.js emboss())."""
    la = fit_art(art, S, frac, dy)
    alpha = la[..., 3]
    sil = blur(alpha, S * 0.004)
    lum = 0.299 * la[..., 0] + 0.587 * la[..., 1] + 0.114 * la[..., 2]
    lum_s = blur(lum, S * 0.0035)
    gx = np.abs(np.gradient(lum_s, axis=1))
    gy = np.abs(np.gradient(lum_s, axis=0))
    lines = np.clip((gx + gy) * line_gain + (1 - lum) * 0.75, 0, 1) * alpha
    lines = blur(lines, S * 0.002)
    # Height: a domed silhouette (edges roll off) with the drawing pressed in.
    dome = blur(sil, S * 0.014) * 0.55 + sil * 0.45
    H = dome - lines * 0.6
    H = blur(H, S * 0.002)
    gy_, gx_ = np.gradient(H)
    amp = S / 70
    nx, ny = -gx_ * amp, -gy_ * amp
    nz = np.ones_like(nx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / n, ny / n, nz / n
    lx, ly, lz = -0.55, -0.6, 0.58
    diff = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
    hx, hy, hz = lx, ly, lz + 1.0
    hn = math.sqrt(hx * hx + hy * hy + hz * hz)
    spec = np.clip((nx * hx + ny * hy + nz * hz) / hn, 0, 1) ** 30
    shadow, body, light, line = [np.array(GOLD[k], np.float32) / 255 for k in ("shadow", "body", "light", "line")]
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    # The metal catching the room: a warm-to-pale sweep, the same direction as the field's.
    sweep = np.clip((xx + yy) / (2 * S), 0, 1)[..., None]
    base = body * (1 - lines[..., None] * 0.8) + line * lines[..., None] * 0.8
    base = base * (0.9 + 0.2 * (1 - sweep))
    shade = 0.42 + 0.8 * diff[..., None]
    col = base * shade + light * spec[..., None] * 0.9
    col = np.clip(col, 0, 1)
    body_rgba = np.dstack([col, alpha])

    # Cast shadow (lower right) and catch light (upper left), as soft offset copies.
    def shifted(a: np.ndarray, dx: float, dy: float, r: float) -> np.ndarray:
        im = Image.fromarray((np.clip(a, 0, 1) * 255).astype("uint8"))
        im = im.transform(im.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BILINEAR)
        return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255

    sh_a = shifted(alpha, S * 0.013, S * 0.015, S * 0.007) * 0.78
    hi_a = shifted(alpha, -S * 0.007, -S * 0.008, S * 0.003) * 0.9
    out = np.zeros((S, S, 4), np.float32)
    for rgb, a in ((shadow, sh_a), (light, hi_a), (col, alpha)):
        a = a[..., None]
        out_rgb = out[..., :3]
        out_a = out[..., 3:4]
        new_a = a + out_a * (1 - a)
        out_rgb[:] = np.where(new_a > 0, (rgb * a + out_rgb * out_a * (1 - a)) / np.maximum(new_a, 1e-6), 0)
        out[..., 3:4] = new_a
    return out


def to_image(arr: np.ndarray, size: int) -> Image.Image:
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype("uint8"), "RGBA")
    return im.resize((size, size), Image.LANCZOS)


def main() -> int:
    S = FACE * SS
    meowth = Image.open(fetch(ARTWORK.format(MEOWTH)))
    heads = to_image(relief(meowth, S, EMBLEM, dy=0.005), FACE)
    tails = to_image(relief(koban_art(S), S, EMBLEM * 0.9, line_gain=7.0), FACE)
    sheet = Image.new("RGBA", (FACE * 2, FACE), (0, 0, 0, 0))
    sheet.paste(heads, (0, 0))
    sheet.paste(tails, (FACE, 0))
    if OUT.exists() and "--force" not in sys.argv:
        print(f"{OUT.relative_to(ROOT)} exists; assets are immutable, bump the -v suffix (or pass --force while iterating before it ships)")
        return 1
    g.save_webp(sheet, OUT, quality=90)
    print(OUT.relative_to(ROOT), sheet.size, f"{OUT.stat().st_size // 1024} KB")
    # A quick look over the coin's own gold, for the eye.
    preview = Image.new("RGBA", sheet.size, (0, 0, 0, 255))
    d = ImageDraw.Draw(preview)
    for i in range(2):
        d.ellipse((i * FACE + 4, 4, i * FACE + FACE - 4, FACE - 4), fill=(200, 150, 50, 255))
        d.ellipse((i * FACE + 32, 32, i * FACE + FACE - 32, FACE - 32), fill=(214, 166, 64, 255))
    preview.alpha_composite(sheet)
    pv = Path(sys.argv[sys.argv.index("--preview") + 1]) if "--preview" in sys.argv else None
    if pv:
        preview.save(pv)
        print("preview", pv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
