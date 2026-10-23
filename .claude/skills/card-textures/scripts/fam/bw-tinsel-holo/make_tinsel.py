"""Draw the bw-tinsel-holo family's Tinsel textures (the Black & White era's Rare Holo foil), version 2.

What the real foil does (photos: /home/user/holo-refs/bw-tinsel-*/, the 2026-10-22 audit; the earlier research in
/mnt/project-files/holo-remaster/bw-tinsel-holo/refs/SOURCES.md): the art window of every Black & White Rare Holo, Dragon
Vault card and Tinsel promo is a field of fine HORIZONTAL ridges, 0.74-0.95 % of the card height apart (FFT of flat
scans: Reuniclus 57/114, Cobalion 77/98, Eelektross 47/108, Japanese Leavanny, Cinccino, Vanilluxe, Vileplume:
about 105-135 ridges a card), thin bright crests about a third of the pitch wide with dark gaps between them, each
ridge its own brightness and broken into short streaks (3-15 % of the width). Under a lamp each crest flashes its OWN
colour (pink, peach, yellow, mint, cyan, lavender, or near white: the Articuno 32/113, Klinklang 90/135, Umbreon
64/116 and Eelektross 47/108 photos), changing from ridge to ridge and along a ridge in short flecks, never one broad
rainbow sheet over the window. The Pokemon is matte (TCG Live's per-card map keeps it out).

Five full-card textures, from one seeded ridge list so they line up exactly (the CSS lays them all at 106 % of the
card height with the same vertical shift):

- tinsel-crests-v2.webp (512 x 1024, grey on black): the crests. The colour-dodged `.cure` layer multiplies its light by
  it, so only the crests flash.
- tinsel-gaps-v2.webp (512 x 1024, RGBA): grey GAP_GREY everywhere, alpha 1 in the gaps and 0-0.3 at a crest's
  centre (the ridge is there even where it catches little light). Over the hard-light `.foil` it pulls the gaps under neutral (x0.86 at GAP_GREY 0.43, never more than 40 levels on white, the dark-speck budget), so the ridges read as
  light and dark rules at rest, on a pale window as on a dark one.
- tinsel-glints-v2.webp (512 x 1024, grey on black): short bright threads on about a third of the crests.
- tinsel-hue-v2.webp (1024 x 1024, RGB: two card widths, so it can slide along the ridges with the tilt): every ridge
  band one pale pastel that drifts slowly along x (one cycle per 0.85-1.15 card widths, the next ridge 20-75 degrees on
  either way), with a strong low-frequency 2D field on top so colours come in patches a quarter of the window across
  while neighbouring ridges still differ (Articuno 32/113: pink, peach, green, lavender ridges side by side); about a
  third of the ridges near white; saturation broken into flecks along each ridge. HSL lightness 0.70-0.78 and
  saturation at most 0.40 (HSV saturation median about 30/255, every channel within about 0.11 of the ridge's grey):
  the round-2 review (2026-10-22) measured the first draft (lightness 0.58-0.70, saturation 0.6-0.95, median 97/255)
  showing almost unmixed through hard-light over dark ink, a rainbow line screen over Victini's, Cobalion's and
  Weezing's windows, where the real cards (the Victini tilt video, the Klinklang 90/135 zoom: bright-pixel saturation
  median 22) show silver-white ridges with only faint pastel flecks.
- tinsel-tint-v2.webp (1024 x 1024, RGB, the same bands and hues as tinsel-hue): each ridge's colour as a small
  colour-dodge GAIN for the held `.cure` layer, HSV value 0.62 and saturation up to 0.9 (near-white ridges grey). A
  colour-dodge scales the ink by 1/(1-S), so a gain that differs a little per channel tints the ink in proportion to its
  own brightness: pale ink (Articuno's sky) takes the ridge's pastel, mid ink a faint one, black ink none, which is what
  the photos show and what no hard-light source can do (hard-light tints dark ink twice as much as pale). Never use
  it as a hard-light or screen source.
- tinsel-fleck-v2.webp (1024 x 1024, RGB on black, the same crests): the crests cut into short flecks of SATURATED
  colour, about half of them dark, the hue in patches (draw_flecks). A screen source only, held to the lamp's band in
  the CSS: dark ink shows the fleck's own colour, pale ink a pastel of it (the round-3 fix: the round-2 review found
  the lit dark windows colourless).

Spacing is aperiodic (PITCH px of 1024) with soft cosine profiles: no single frequency for the browser's resampling to
beat against (a regular 2-4 px grating aliases into a line screen on a phone, SKILL.md).

    python3 .claude/skills/card-textures/scripts/fam/bw-tinsel-holo/make_tinsel.py [--force] [--preview <png>]

Writes assets/foil/fam/bw-tinsel-holo/tinsel-{crests,gaps,glints,hue,tint,fleck}-v2.webp. A file that exists is kept unless --force
(only for a draft that has never shipped: /assets/* is cached for a year, so a shipped texture changes under a new -vN
name; check_asset_overwrites.py lists any in-place change against master).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, gaussian_filter1d

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "bw-tinsel-holo"
V = "v2"
W, H = 512, 1024
HW = 1024             # the hue texture is two card widths wide
SEED = 20111
GAP_GREY = 0.43       # the grey the gaps are pulled to (hard-light: x0.86, a drop of at most 36 levels on white: dark_specks.py)
PITCH = (6.5, 9.5)    # px between crests at 1024 px (x 1.06 in the CSS: 0.67-0.98 % of the card height, mean 0.83 %)
CREST = (0.30, 0.38)  # a crest's half support as a share of its pitch (raised cosine: about a third of the pitch at half height)
TINT_V, TINT_S = 0.62, 0.9   # tinsel-tint: HSV value, and the saturation a fully tinted ridge reaches
LIGHT = (0.70, 0.78)  # a tinted ridge's HSL lightness (from the drawn 0.58-0.70)
WHITE_LIGHT = (0.76, 0.82)
SAT_SCALE = 0.42      # the drawn saturation (0.6-0.95, in flecks) times this: at most 0.40
EXTRA_WHITE = 0.14    # a second share of the ridges made near white (with the drawn 22 %: about a third)
FLECK_ON = 0.5        # tinsel-fleck: the share of a crest's flecks that carry colour (the rest dark)
FLECK_LEN = (10, 64)  # a fleck's length, px of the 1024-wide texture (two card widths): 2-12 % of the card width
FLECK_WHITE = 0.18    # the share of lit flecks that flash near white rather than a hue


def segments(rng: np.random.Generator, n: int, base: float, lo: float, hi: float, dead: float, soft: float) -> np.ndarray:
    """A crest's brightness along x: piecewise levels in segments lo-hi px long, softened at the joins."""
    amp = np.empty(n)
    pos = -rng.uniform(0, hi)
    while pos < n:
        length = rng.uniform(lo, hi)
        level = base * rng.uniform(0.55, 1.0)
        if rng.random() < dead:
            level *= 0.2
        a, b = int(max(pos, 0)), int(min(pos + length, n))
        if b > a:
            amp[a:b] = level
        pos += length
    return gaussian_filter1d(amp, soft, mode="nearest")


def ridge_list(rng: np.random.Generator) -> list[dict]:
    out = []
    y = rng.uniform(0, PITCH[0])
    hue = rng.uniform(0, 360)
    while y < H + PITCH[1]:
        pitch = rng.uniform(*PITCH)
        u = rng.uniform(-1, 1)   # the next ridge 20-75 degrees on, either way: neighbours differ, colours come in patches
        hue = (hue + np.sign(u) * (20 + 55 * abs(u))) % 360
        out.append({
            "y": y,
            "pitch": pitch,
            "half": pitch * rng.uniform(*CREST),
            "base": 0.4 + 0.6 * rng.random() ** 0.7,
            "hue": hue,
            "period": rng.uniform(0.85, 1.15) * HW / 2,     # one hue cycle per 0.85-1.15 card widths (the ridges keep together)
            "white": rng.random() < 0.22,
            "light": rng.uniform(0.58, 0.70),   # remapped to LIGHT in draw() (kept as drawn so the ridge sequence stays put)
        })
        y += pitch
    return out


def hsl_rgb(h: np.ndarray, s: np.ndarray, l: np.ndarray) -> np.ndarray:
    """Vectorised HSL (h in degrees, s and l 0-1) to RGB 0-1."""
    c = (1 - np.abs(2 * l - 1)) * s
    hp = (h % 360) / 60
    x = c * (1 - np.abs(hp % 2 - 1))
    z = np.zeros_like(h)
    conds = [(hp < 1), (hp < 2), (hp < 3), (hp < 4), (hp < 5), (hp >= 5)]
    rs = [c, x, z, z, x, c]
    gs = [x, c, c, x, z, z]
    bs = [z, z, x, c, c, x]
    r = np.select(conds, rs)
    g = np.select(conds, gs)
    b = np.select(conds, bs)
    m = l - c / 2
    return np.dstack([r + m, g + m, b + m])


def draw(seed: int):
    rng = np.random.default_rng(seed)
    ridges = np.zeros((H, W))
    relief = np.zeros((H, W))   # the ridge itself: there even where it catches little light
    glints = np.zeros((H, W))
    x = np.arange(W)
    xh = np.arange(HW)
    rl = ridge_list(rng)
    # a low-frequency 2D hue field (patches about a quarter of the window across)
    field = gaussian_filter(rng.standard_normal((H // 8, HW // 8)), 6, mode="wrap")
    field = field / (np.abs(field).max() + 1e-9)
    field = np.asarray(Image.fromarray(np.float32(field), "F").resize((HW, H), Image.BICUBIC))
    hue_h = np.zeros((H, HW))
    hue_s = np.zeros((H, HW))
    hue_l = np.zeros((H, HW))
    rng2 = np.random.default_rng(seed + 99)   # the round-2 additions draw here, so the crests stay exactly as they were
    for i, r in enumerate(rl):
        y, half = r["y"], r["half"]
        amp = segments(rng, W, r["base"], 15, 80, 0.10, 3)
        amp *= 1 + 0.12 * np.sin(2 * np.pi * (x / rng.uniform(140, 420)) + rng.uniform(0, 2 * np.pi))
        r0, r1 = int(np.floor(y - half)) - 1, int(np.ceil(y + half)) + 2
        rows = np.arange(max(r0, 0), min(r1, H))
        if rows.size:
            d = (rows - y) / half
            prof = np.where(np.abs(d) < 1, 0.5 * (1 + np.cos(np.pi * d)), 0.0)
            ridges[rows] = np.maximum(ridges[rows], prof[:, None] * amp[None, :])
            relief[rows] = np.maximum(relief[rows], prof[:, None] * (0.7 + 0.3 * amp[None, :]))
            if rng.random() < 0.34:
                g = np.zeros(W)
                for _ in range(rng.integers(1, 4)):
                    c, w = rng.uniform(0, W), rng.uniform(12, 70)
                    g = np.maximum(g, rng.uniform(0.55, 1.0) * np.exp(-0.5 * ((x - c) / (w / 2.4)) ** 2))
                gd = (rows - y) / (half * 0.7)
                gprof = np.where(np.abs(gd) < 1, 0.5 * (1 + np.cos(np.pi * gd)), 0.0)
                glints[rows] = np.maximum(glints[rows], gprof[:, None] * g[None, :])
        # the hue band: from the midpoint with the ridge above to the midpoint with the ridge below
        top = int(np.floor(y - r["pitch"] / 2)) if i else 0
        bot = int(np.ceil(y + r["pitch"] / 2))
        band = np.arange(max(top, 0), min(bot, H))
        if band.size:
            yc = int(min(max(round(y), 0), H - 1))
            h = r["hue"] + 360 * xh / r["period"] + 130 * field[yc]
            if r["white"]:
                s = np.full(HW, rng.uniform(0.04, 0.14)) * 0.4
            else:
                s = rng.uniform(0.6, 0.95) * segments(rng, HW, 1.0, 30, 160, 0.25, 6) * SAT_SCALE
            light = LIGHT[0] + (r["light"] - 0.58) / 0.12 * (LIGHT[1] - LIGHT[0])
            if r["white"] or rng2.random() < EXTRA_WHITE:
                s = np.full(HW, rng2.uniform(0.0, 0.06))
                light = rng2.uniform(*WHITE_LIGHT)
            hue_h[band] = h[None, :]
            hue_s[band] = s[None, :]
            hue_l[band] = light
    # rows between two hue bands that neither covered (a short pitch after a long one): the band above carries on
    for yy in range(1, H):
        if hue_l[yy, 0] == 0:
            hue_h[yy], hue_s[yy], hue_l[yy] = hue_h[yy - 1], hue_s[yy - 1], hue_l[yy - 1]
    fleck = draw_flecks(np.random.default_rng(seed + 333), rl, field)
    ridges = gaussian_filter(np.clip(ridges, 0, 1), (0.5, 1.2))
    relief = gaussian_filter(np.clip(relief, 0, 1), (0.5, 1.2))
    glints = gaussian_filter(np.clip(glints, 0, 1), (0.5, 1.5))
    hue = hsl_rgb(hue_h, np.clip(hue_s, 0, 1), hue_l)
    hue = gaussian_filter(hue, (0.4, 2.0, 0))
    # the dodge gain: the same hue at HSV value TINT_V, its saturation the ridge's own relative to the most tinted
    sv = np.clip(hue_s / (0.95 * SAT_SCALE), 0, 1) * TINT_S
    hp = (hue_h % 360) / 60
    k = lambda n: (n + hp) % 6  # noqa: E731
    f = lambda n: TINT_V - TINT_V * sv * np.clip(np.minimum(k(n), 4 - k(n)), 0, 1)  # noqa: E731
    tint = gaussian_filter(np.dstack([f(5), f(3), f(1)]), (0.4, 2.0, 0))
    return ridges, relief, glints, hue, tint, fleck


def draw_flecks(rng: np.random.Generator, rl: list[dict], field: np.ndarray) -> np.ndarray:
    """tinsel-fleck: the crests as short flecks of SATURATED colour on black, for a screen layer held to the lamp's band.

    The round-2 review (2026-10-22) found the lit dark windows with no colour at all, where the real cards throw short,
    vivid streaks at the lamp: green, magenta and white on Eelektross 47/108's navy (in-hand video), multi-hue flecks
    on Umbreon 64/116, yellow, cyan and pink streak blocks over Blastoise 16/101's dark water (pack-pull photo), gold,
    violet and cyan patches on Oshawott BW03. Each crest is cut into flecks FLECK_LEN px long, about 0.8 of the pitch tall and flat-topped; FLECK_ON of them lit at
    0.7-1, the rest dark; the hue comes in patches (the low-frequency field leads, the ridge and the fleck shift it a
    little), so a patch of neighbouring ridges flashes one family of colours and the next patch another; FLECK_WHITE of
    the lit flecks near white. Same ridge rows as the crests (106 % tall in the CSS, the same shift), two card widths wide.
    """
    out = np.zeros((H, HW, 3))
    xh = np.arange(HW)
    # the field flattened to a uniform 0-1 by its rank, so the patches spread over every hue (not mostly the middle one)
    fu = np.empty(field.size)
    fu[np.argsort(field, axis=None)] = np.linspace(0, 1, field.size)
    fu = fu.reshape(field.shape)
    for r in rl:
        y, half = r["y"], r["pitch"] * 0.42   # wider than the crest, flat-topped: a streak that reads at phone size
        r0, r1 = int(np.floor(y - half)) - 1, int(np.ceil(y + half)) + 2
        rows = np.arange(max(r0, 0), min(r1, H))
        if not rows.size:
            continue
        d = (rows - y) / half
        prof = np.where(np.abs(d) < 1, (0.5 * (1 + np.cos(np.pi * d))) ** 0.45, 0.0)
        yc = int(min(max(round(y), 0), H - 1))
        ridge_shift = rng.uniform(-35, 35)
        col = np.zeros((HW, 3))
        pos = -rng.uniform(0, FLECK_LEN[1])
        while pos < HW:
            length = rng.uniform(*FLECK_LEN)
            a, b = int(max(pos, 0)), int(min(pos + length, HW))
            if b > a and rng.random() < FLECK_ON:
                level = rng.uniform(0.7, 1.0)
                xm = (a + b) // 2
                hue = (40 + 420 * fu[yc, min(xm, HW - 1)] + ridge_shift + rng.uniform(-20, 20)) % 360
                if rng.random() < FLECK_WHITE:
                    rgb = np.full(3, 0.92)
                else:
                    rgb = hsl_rgb(np.array([[hue]]), np.array([[rng.uniform(0.85, 1.0)]]), np.array([[0.55]]))[0, 0]
                ramp = np.minimum(1, np.minimum(xh[a:b] - a + 1, b - xh[a:b]) / 4.0)
                col[a:b] = rgb[None, :] * (level * ramp)[:, None]
            pos += length
        col = gaussian_filter1d(col, 1.5, axis=0, mode="wrap")
        out[rows] = np.maximum(out[rows], prof[:, None, None] * col[None, :, :])
    out = gaussian_filter(out, (0.4, 1.0, 0))
    return out / max(out.max(), 1e-6)


def u8(arr: np.ndarray) -> np.ndarray:
    return np.uint8(np.clip(arr, 0, 1) * 255 + 0.5)


def save(img: Image.Image, name: str, force: bool, quality: int = 92) -> None:
    path = OUT / name
    if path.exists() and not force:
        print("kept", path.relative_to(ROOT), "(pass --force to rewrite a draft that has never shipped)")
        return
    img.save(path, "WEBP", quality=quality, method=6)
    print("wrote", path.relative_to(ROOT), path.stat().st_size, "bytes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview", help="also write a PNG preview (crests | gaps | hue on crests) here")
    ap.add_argument("--only", choices=["crests", "gaps", "glints", "hue", "tint", "fleck"], help="write just this one texture")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ridges, relief, glints, hue, tint, fleck = draw(SEED)
    gaps = 1 - relief
    grey = np.full((H, W), GAP_GREY)
    want = lambda k: args.only in (None, k)  # noqa: E731
    if want("crests"):
        save(Image.fromarray(u8(ridges), "L"), f"tinsel-crests-{V}.webp", args.force)
    if want("gaps"):
        save(Image.fromarray(np.dstack([u8(grey)] * 3 + [u8(gaps)]), "RGBA"), f"tinsel-gaps-{V}.webp", args.force)
    if want("glints"):
        save(Image.fromarray(u8(glints), "L"), f"tinsel-glints-{V}.webp", args.force)
    if want("hue"):
        save(Image.fromarray(u8(hue), "RGB"), f"tinsel-hue-{V}.webp", args.force, 90)
    if want("tint"):
        save(Image.fromarray(u8(tint), "RGB"), f"tinsel-tint-{V}.webp", args.force, 90)
    if want("fleck"):
        save(Image.fromarray(u8(fleck), "RGB"), f"tinsel-fleck-{V}.webp", args.force, 90)
    if args.preview:
        lit = hue[:, :W] * ridges[..., None] + 0.2 * (1 - ridges[..., None])
        Image.fromarray(np.hstack([u8(np.dstack([ridges] * 3)), u8(np.dstack([gaps] * 3)), u8(lit)])).save(args.preview)


if __name__ == "__main__":
    main()
