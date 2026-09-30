"""Image helpers for sleeves and coins (used by build_gear.py).

Sleeves become card-back sized RGBA webps with rounded corners; a coin becomes
one image holding both faces side by side (obverse left), each a circle with
transparent corners. Nothing here fetches: build_gear.py hands in files.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SLEEVE_W, SLEEVE_H = 420, 586  # the printed card back is 600x838; same 63:88 shape
COIN = 256


def _bbox_of_content(im: Image.Image, thresh: int = 246):
    """Bounding box of everything that is not transparent or paper white."""
    rgba = im.convert("RGBA")
    a = np.asarray(rgba)
    alpha = a[..., 3] > 16
    white = (a[..., :3] >= thresh).all(axis=2)
    mask = alpha & ~white
    ys, xs = np.where(mask)
    if not len(xs):
        return (0, 0, im.width, im.height)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def _fit_circle(im: Image.Image):
    """Crop to the coin's own circle: the widest content box, made square."""
    x0, y0, x1, y1 = _bbox_of_content(im)
    w, h = x1 - x0, y1 - y0
    side = max(w, h)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    return im.convert("RGBA").crop(box)


def coin_face(im: Image.Image, size: int = COIN, inset: float = 0.0) -> Image.Image:
    """A coin photo as a circle with transparent corners, `size` pixels square."""
    sq = _fit_circle(im)
    sq = sq.resize((size, size), Image.LANCZOS)
    ss = 4
    mask = Image.new("L", (size * ss, size * ss), 0)
    r = size * ss / 2 * (1 - inset)
    ImageDraw.Draw(mask).ellipse((size * ss / 2 - r, size * ss / 2 - r, size * ss / 2 + r, size * ss / 2 + r), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    alpha = Image.fromarray((np.asarray(sq.getchannel("A")).astype(np.float32) * np.asarray(mask) / 255).astype("uint8"))
    out = sq.copy()
    out.putalpha(alpha)
    return out


def rim_color(face: Image.Image) -> tuple[int, int, int]:
    """Average colour of the outer ring of a coin face, for a matching reverse."""
    a = np.asarray(face.convert("RGBA")).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - w / 2, yy - h / 2) / (w / 2)
    ring = (d > 0.86) & (d < 0.97) & (a[..., 3] > 200)
    if not ring.any():
        return (150, 150, 160)
    px = a[..., :3][ring]
    return tuple(int(v) for v in px.mean(axis=0))


def _shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def generic_reverse(face: Image.Image, size: int = COIN) -> Image.Image:
    """A plausible reverse when no photo exists: the coin's own rim colour with a
    struck Poké Ball. Used only when the research found no image of the back."""
    c = rim_color(face)
    ss = 4
    S = size * ss
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.ellipse((0, 0, S - 1, S - 1), fill=_shade(c, 0.72) + (255,))
    d.ellipse((S * 0.03, S * 0.03, S * 0.97, S * 0.97), fill=_shade(c, 1.0) + (255,))
    inner = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    di = ImageDraw.Draw(inner)
    di.ellipse((S * 0.09, S * 0.09, S * 0.91, S * 0.91), fill=_shade(c, 0.86) + (255,))
    base.alpha_composite(inner)
    # Poké Ball in relief: dark line work over the lighter disc.
    line = _shade(c, 0.5) + (255,)
    lw = int(S * 0.028)
    cx = cy = S / 2
    r = S * 0.27
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=line, width=lw)
    d.line((cx - r, cy, cx + r, cy), fill=line, width=lw)
    rb = S * 0.085
    d.ellipse((cx - rb, cy - rb, cx + rb, cy + rb), fill=_shade(c, 0.86) + (255,), outline=line, width=lw)
    # A soft upper-left light so it reads as metal, not a flat disc.
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    light = 1 + 0.18 * (1 - (xx + yy) / (2 * S)) - 0.09
    arr = np.asarray(base).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] * light[..., None], 0, 255)
    out = Image.fromarray(arr.astype("uint8"), "RGBA").resize((size, size), Image.LANCZOS)
    return out


def coin_sheet(front: Image.Image, back: Image.Image | None, size: int = COIN) -> Image.Image:
    f = coin_face(front, size)
    b = coin_face(back, size) if back is not None else generic_reverse(f, size)
    sheet = Image.new("RGBA", (size * 2, size), (0, 0, 0, 0))
    sheet.paste(f, (0, 0))
    sheet.paste(b, (size, 0))
    return sheet


def sleeve_card(im: Image.Image, crop=None, w: int = SLEEVE_W, h: int = SLEEVE_H, radius: float = 0.048) -> Image.Image:
    """Sleeve art as a card back: cropped to the sleeve, 63:88, rounded corners."""
    im = im.convert("RGBA")
    if crop:
        im = im.crop(tuple(crop))
    else:
        im = im.crop(_bbox_of_content(im, thresh=250))
    # Fit to 63:88 by trimming the long side, centred.
    target = w / h
    iw, ih = im.size
    if iw / ih > target:
        nw = round(ih * target)
        im = im.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = round(iw / target)
        im = im.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    im = im.resize((w, h), Image.LANCZOS)
    ss = 4
    mask = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), radius=int(w * ss * radius), fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    alpha = Image.fromarray((np.asarray(im.getchannel("A")).astype(np.float32) * np.asarray(mask) / 255).astype("uint8"))
    im.putalpha(alpha)
    return im


def dominant_tint(im: Image.Image) -> str:
    """A saturated mid colour for glows and placeholders, as #rrggbb."""
    small = im.convert("RGBA").resize((24, 24))
    a = np.asarray(small).astype(np.float32)
    px = a[..., :3][a[..., 3] > 200]
    if not len(px):
        return "#8a8a96"
    mx, mn = px.max(axis=1), px.min(axis=1)
    sat = (mx - mn) / np.maximum(mx, 1)
    w = sat * sat * (mx / 255) + 0.01
    c = (px * w[:, None]).sum(axis=0) / w.sum()
    k = 205 / max(c.max(), 1)
    c = np.clip(c * k, 0, 255)
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def save_webp(im: Image.Image, path: Path, quality: int = 86):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)


# --------------------------------------------------------------------------
# Drawn coins. Some blister and tin coins have no clean photograph anywhere, so
# they are struck here: the Pokémon's official artwork is turned into a height
# map (silhouette raised, the artwork's own outlines pressed in), lit from the
# upper left and painted in a metal or plastic finish. These are our rendition
# of the subject, not a photo of the real coin, and build_gear.py marks them so.
# --------------------------------------------------------------------------
FINISHES = {
    #            shadow          body            light           field (recessed background)
    "silver": ((70, 74, 82), (176, 182, 192), (248, 250, 255), (92, 96, 106)),
    "bronze": ((74, 44, 20), (176, 118, 60), (255, 222, 168), (104, 66, 34)),
    "gold": ((92, 62, 10), (208, 160, 52), (255, 240, 170), (120, 84, 20)),
    "black": ((8, 8, 12), (52, 54, 64), (170, 176, 196), (16, 16, 22)),
    "blue": ((10, 30, 70), (48, 120, 200), (190, 230, 255), (14, 40, 88)),
    "red": ((70, 10, 14), (196, 44, 48), (255, 190, 170), (92, 16, 22)),
    "green": ((14, 52, 24), (62, 160, 84), (200, 255, 200), (18, 66, 32)),
    "purple": ((36, 14, 70), (122, 70, 190), (226, 200, 255), (44, 20, 88)),
    "pink": ((80, 20, 50), (214, 100, 156), (255, 214, 232), (100, 28, 64)),
    "orange": ((90, 34, 6), (224, 122, 30), (255, 220, 150), (112, 46, 10)),
}


def _blur(a: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype("uint8"))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255


def render_coin(art: Image.Image, finish: str = "silver", size: int = COIN, holo: bool = False, seed: int = 7) -> Image.Image:
    """A struck coin of the subject in `art` (RGBA artwork), `size` px square."""
    body_c = FINISHES.get(finish, FINISHES["silver"])
    S = size * 3
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
    disc = (d <= 0.995).astype(np.float32)
    # Artwork: trim to content, fit inside the field.
    art = art.convert("RGBA")
    bb = art.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bb:
        art = art.crop(bb)
    fit = S * 0.66
    k = min(fit / art.width, fit / art.height)
    art = art.resize((max(1, round(art.width * k)), max(1, round(art.height * k))), Image.LANCZOS)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.paste(art, (round((S - art.width) / 2), round((S - art.height) / 2 + S * 0.01)), art)
    la = np.asarray(layer).astype(np.float32) / 255
    sil = _blur(la[..., 3], 1.2)
    lum = (0.299 * la[..., 0] + 0.587 * la[..., 1] + 0.114 * la[..., 2])
    # Pressed-in line work: where the artwork is dark or changes quickly, inside the silhouette.
    gx = np.abs(np.gradient(_blur(lum, 1.5), axis=1))
    gy = np.abs(np.gradient(_blur(lum, 1.5), axis=0))
    lines = np.clip((gx + gy) * 9 + (1 - lum) * 0.55, 0, 1) * la[..., 3]
    rim = ((d > 0.90) & (d < 0.995)).astype(np.float32)
    rim = _blur(rim, 2.0)
    inner_ring = _blur(((d > 0.84) & (d < 0.865)).astype(np.float32), 1.5)
    H = rim * 1.0 + inner_ring * 0.35 + sil * 0.9 - lines * 0.35
    H = _blur(H, 1.6)
    gy_, gx_ = np.gradient(H)
    nx, ny = -gx_ * 14, -gy_ * 14
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / norm, ny / norm, nz / norm
    lx, ly, lz = -0.55, -0.6, 0.58
    diff = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
    hx, hy, hz = lx, ly, lz + 1.0
    hn = math.sqrt(hx * hx + hy * hy + hz * hz)
    spec = np.clip((nx * hx + ny * hy + nz * hz) / hn, 0, 1) ** 28
    shadow, body, light, field = [np.array(c, np.float32) / 255 for c in body_c]
    raised = np.clip(sil + rim + inner_ring * 0.6, 0, 1)[..., None]
    base = field * (1 - raised) + body * raised
    # Brushed grain across the recessed field.
    grain = _blur(rng.random((S, S)).astype(np.float32), 0.8)[..., None]
    base = base * (0.94 + 0.12 * grain)
    shade = 0.45 + 0.75 * diff[..., None]
    col = base * shade + light * spec[..., None] * 0.85
    # A cool-to-warm sweep across the face: the metal catching the room.
    sweep = np.clip((xx + yy) / (2 * S), 0, 1)[..., None]
    col = col * (0.92 + 0.16 * sweep)
    if holo:
        hue = np.stack([np.sin(6.28 * (sweep[..., 0] * 1.4 + o)) * 0.5 + 0.5 for o in (0.0, 0.33, 0.66)], axis=-1)
        col = col * (0.78 + 0.45 * hue) * (0.9 + 0.3 * (1 - raised))
    col = np.clip(col, 0, 1)
    out = np.dstack([col, disc])
    im = Image.fromarray((out * 255).astype("uint8"), "RGBA")
    return im.resize((size, size), Image.LANCZOS)
