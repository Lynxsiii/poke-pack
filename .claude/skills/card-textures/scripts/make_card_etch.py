#!/usr/bin/env python3
"""Draw a per-card etch map from the card's own art, for etched prints TCG
Live has no map for (the Mega Evolution sets, Black Bolt, White Flare, the
ME Black Star promos).

A real Special Illustration Rare, full-art Ultra Rare or gold Hyper Rare is
engraved edge to edge with fine lines that follow the drawing: the hatch
runs parallel to every outline and bends round every shape, the line art
and the lettering stay smooth, and no two cards share a pattern. Live's
etch maps (assets/foil/maps/<set>/<n>-etch.webp) are exactly that, so this
script makes the same thing from the scan when Live has none, instead of
the one shared tile every such card used to get (Noah, 2026-09-28: "I want
every texture to be unique to each card").

How: the scan at 400 px wide -> a structure tensor gives the direction of
the drawing's edges at every pixel, easing into a slow seeded sweep where
the art is flat -> that direction, smoothed, only STEERS a fingerprint: the
etch is white noise band-passed to one fine ridge pitch (PITCH px) in
ORIENT_BINS orientations, and each pixel mixes the orientations near the
drawing's direction there. The ridges are short, curve and break like the
fingerprint whorls on a real engraved card (the macro photos in
paldean-fates/texture-refs), lean along the outlines, and have no long
straight run and no single direction over a patch -> the printed black ink
(near-neutral, darker than INK and thin: outlines, lettering) is left
un-etched, like Live's; dark colour and wide dark fills are hatched like
any colour. The direction comes from the card's own art and the noise is
seeded by the card id, so no two cards share a pattern.

Why not a straight grating per direction facet (what this script drew until
2026-09-29): a painterly print has little edge structure, the quantised
direction collapses to two or three facets and each is one fixed-pitch
grating, so the browser's scaling turns the card into a diagonal line screen
(Espeon ex MEP 108, Noah: "still broken"). Measured with the structure
tensor at sigma 8, the drawn maps sat at direction coherence 0.70 (0.58 to
0.78) where Live's own maps sit at 0.34 to 0.59; the fingerprint sits at
0.30 to 0.45. The soft-wobble and Voronoi-cell gratings tried in between
still read as hatching at 340 px, and contour rings (distance to the
drawing's edges) read as a swirled fingerprint blob field; the band-passed
noise is the one that reads as a fine sheen.

    python3 .claude/skills/card-textures/scripts/make_card_etch.py --set me1 --cards 177,178 --debug
    python3 .claude/skills/card-textures/scripts/make_card_etch.py --set me1 --all --ship --write-data

--all takes every SIR, UR, HR and MHR of the set (and any `foilAs` of
those) that has no etchMap yet; --ship writes assets/foil/maps/<set>/
<n>-etch.webp (400 px wide, white with the etch as alpha, like the Live
maps; a redraw of a shipped map goes to the next <n>-etch-vN.webp, since
/assets/* is cached for a year under its name) and --write-data points the
card's `etchMap` at it and marks it
`etchDrawn`, after which js/foil-maps.js gives the print `has-etch-map`
instead of the shared tile. --debug writes a contact sheet (scan, steering
direction, etch) to scripts/_debug/etch/. --compare, on cards that have a Live map, puts
Live's map beside the drawn one on the sheet, for tuning against sv4pt5 232
Mew ex, sv3pt5 199 Charizard ex and co.
"""
import argparse
import os
import io
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_asset_overwrites import ever_existed, fresh_name  # noqa: E402
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[4]
WIDTH = 400
ETCHED = ("Special Illustration Rare", "Ultra Rare", "Hyper Rare", "Mega Hyper Rare", "Rare Ultra", "Rare Secret")  # + the XY rarity words (2026-10-01)
PITCH = 2.6       # ridge spacing in px at 400 px wide (Live's etches: 2 to 3 px)
INK = 40          # luma under which near-neutral print is ink and stays smooth
CHROMA = 40       # max-min of RGB above which a dark pixel is colour, not ink
INK_WIDTH = 11    # a dark neutral patch wider than this in every direction is a fill, not ink
ORIENT_BINS = 24  # oriented band-pass noises mixed over a half turn (7.5 deg apart)
RADIAL_BW = 0.18  # ridge-pitch bandwidth as a share of the pitch frequency (narrower = longer ridges)
ANGLE_BW = 0.35   # radians: how far a ridge strays from its bin's direction (wider = shorter, more broken ridges)
STEER = 2.2       # how strongly the drawing's direction picks the orientation mix (0 = isotropic fingerprint)
FLOW_SIGMA = 10   # px: smoothing of the steering direction, so the whorls lean, not jitter
GAIN = 3.0        # ridge contrast into tanh: higher = crisper ridges, lower = more mid-tone
AMP = 0.374       # ridge amplitude either side of 0.5 (Live's maps: two thirds mid-tone)
GRAIN = 0.06      # per-pixel grain on top, the pinpoint sparkle
SOFTEN = 0.5      # px: final blur, so a ridge is a ridge, not a step


def seed_of(card_id: str) -> np.random.Generator:
    h = int(hashlib.sha1(card_id.encode()).hexdigest()[:8], 16)
    return np.random.default_rng(h)


def ink_of(rgb: np.ndarray, gray: np.ndarray) -> np.ndarray:
    """Printed black ink: dark, near-neutral and thin (outlines, lettering,
    the rule box's border). A dark fill wider than INK_WIDTH px is the art's
    own shadow and is hatched like any colour, as Live hatches the dragon
    on sv3pt5 199 Charizard ex."""
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    dark = (gray < INK) & (chroma < CHROMA)
    r = INK_WIDTH // 2
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = (xx * xx + yy * yy) <= r * r
    fills = ndimage.binary_opening(dark, structure=disk)
    return dark & ~fills


def flow(gray: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """The hatch direction at every pixel, as a doubled angle (so it blends),
    following the art's edges where there are any and a slow seeded sweep
    where the art is flat. Returns the angle theta (0..pi, the direction the
    lines run along) and the edge weight."""
    h, w = gray.shape
    gx = ndimage.gaussian_filter(gray, 1.2, order=(0, 1))
    gy = ndimage.gaussian_filter(gray, 1.2, order=(1, 0))
    jxx = ndimage.gaussian_filter(gx * gx, 6.0)
    jyy = ndimage.gaussian_filter(gy * gy, 6.0)
    jxy = ndimage.gaussian_filter(gx * gy, 6.0)
    c2, s2 = jxx - jyy, 2 * jxy
    energy = np.sqrt(c2 * c2 + s2 * s2)
    c2, s2 = c2 / (energy + 1e-6), s2 / (energy + 1e-6)
    # The sweep: one straight hatch angle for the card, bending a little.
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    a0 = rng.uniform(0.35, 1.2) * rng.choice([-1, 1])
    kx, ky = rng.uniform(0.004, 0.009), rng.uniform(0.004, 0.009)
    px, py = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
    ang = a0 + 0.3 * np.sin(kx * xx + px) + 0.3 * np.cos(ky * yy + py)
    fc2, fs2 = np.cos(2 * ang), np.sin(2 * ang)
    # Only the card's real edges steer the hatch (the top tenth by energy);
    # soft shading and scan grain leave the sweep alone, so a plain sky is
    # one facet, as on Live's Mew ex, not a patchwork.
    ref = np.percentile(energy, 90) + 1e-6
    wgt = ndimage.gaussian_filter(np.clip(energy / ref, 0, 1) ** 2, 4.0)
    bc2 = ndimage.gaussian_filter(wgt * c2 + (1 - wgt) * fc2, 3.0)
    bs2 = ndimage.gaussian_filter(wgt * s2 + (1 - wgt) * fs2, 3.0)
    grad = 0.5 * np.arctan2(bs2, bc2)            # gradient direction
    theta = np.mod(grad + np.pi / 2, np.pi)      # the lines run along the edge
    return theta.astype(np.float32), wgt


def etch_from(scan: Image.Image, card_id: str) -> tuple[np.ndarray, np.ndarray]:
    """The etch (0..1) and the steering direction image, at WIDTH px wide."""
    w = WIDTH
    h = round(scan.height * w / scan.width)
    rgb = np.asarray(scan.convert("RGB").resize((w, h), Image.LANCZOS)).astype(np.float32)
    gray = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    rng = seed_of(card_id)
    theta, _ = flow(gray, rng)
    c2 = ndimage.gaussian_filter(np.cos(2 * theta), FLOW_SIGMA)
    s2 = ndimage.gaussian_filter(np.sin(2 * theta), FLOW_SIGMA)
    steer = 0.5 * np.arctan2(s2, c2)               # the direction the ridges lean along
    # One white noise, band-passed to a ring at the ridge pitch and to a wedge
    # around each of ORIENT_BINS ridge directions; every pixel takes the mix
    # of the wedges near the drawing's direction there. Each wedge alone is a
    # patch of parallel short ridges; the mix bends and breaks them.
    spec = np.fft.rfft2(rng.normal(size=(h, w)).astype(np.float32))
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.rfftfreq(w)[None, :]
    fr, fang = np.hypot(fx, fy), np.arctan2(fy, fx)
    f0 = 1.0 / PITCH
    radial = np.exp(-0.5 * ((fr - f0) / (RADIAL_BW * f0)) ** 2)
    acc = np.zeros((h, w), np.float32)
    norm = np.zeros((h, w), np.float32)
    for k in range(ORIENT_BINS):
        along = np.pi * k / ORIENT_BINS                          # this wedge's ridge direction
        d = np.angle(np.exp(2j * (fang - (along + np.pi / 2)))) / 2   # wave vector is across the ridge
        band = np.fft.irfft2(spec * radial * np.exp(-0.5 * (d / ANGLE_BW) ** 2), s=(h, w)).astype(np.float32)
        band /= band.std() + 1e-6
        wk = np.exp(STEER * np.cos(2 * (steer - along))).astype(np.float32)
        acc += wk * band
        norm += wk * wk
    n = acc / np.sqrt(norm + 1e-6)
    n /= n.std() + 1e-6
    # A soft ridge profile, not a hard cut: Live's maps are two thirds
    # mid-tone (0.25..0.75) and read as a sandy sheen at phone size; a binary
    # grating reads as lines. A pinch of per-pixel grain gives the pinpoint
    # sparkle under the glare.
    etch = 0.5 + AMP * np.tanh(GAIN * n) / np.tanh(GAIN)
    etch += rng.normal(0, GRAIN, size=(h, w)).astype(np.float32)
    etch = ndimage.gaussian_filter(np.clip(etch, 0, 1), SOFTEN)
    # Ink stays smooth: outlines, lettering, the rule box, with a hair of margin.
    keep = ndimage.binary_dilation(ink_of(rgb, gray), iterations=1)
    keep = ndimage.gaussian_filter(keep.astype(np.float32), 0.6)
    etch = etch * (1 - keep)
    facets = (np.mod(steer, np.pi) / np.pi).astype(np.float32)
    return etch.astype(np.float32), facets


def load_set(set_id: str):
    path = ROOT / "data" / f"{set_id}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else data.get("cards")
    return {"path": path, "data": data, "records": records}


def find_card(records, set_id, wanted):
    for c in records:
        if str(c.get("number")) in wanted or c["id"] in {f"{set_id}-{n}" for n in wanted}:
            yield c


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True, help="site set id (data/<set>.json)")
    ap.add_argument("--cards", default="", help="comma-separated card numbers")
    ap.add_argument("--all", action="store_true", help="every etched print of the set without an etchMap")
    ap.add_argument("--force", action="store_true", help="with --all, redraw prints that already carry a drawn map")
    ap.add_argument("--ship", action="store_true", help="write assets/foil/maps/<set>/<n>-etch.webp")
    ap.add_argument("--write-data", action="store_true", help="point each card's etchMap at the shipped file")
    ap.add_argument("--debug", action="store_true", help="contact sheet to scripts/_debug/etch/<set>.png")
    ap.add_argument("--compare", action="store_true", help="the cards have Live maps: report how the drawn map compares, and put Live's map on the sheet")
    a = ap.parse_args()
    loaded = load_set(a.set)
    wanted = {s.strip() for s in a.cards.split(",") if s.strip()}
    picked = []
    if wanted:
        picked = list(find_card(loaded["records"], a.set, wanted))
    elif a.all:
        for c in loaded["records"]:
            look = c.get("foilAs") or c.get("rarity")
            if look not in ETCHED or not c.get("image"):
                continue
            if c.get("etchMap") and not (a.force and c.get("etchDrawn")):
                continue
            picked.append(c)
    if not picked:
        print("nothing to do")
        return 0
    rows = []
    changed = 0
    for c in picked:
        scan = Image.open(ROOT / c["image"])
        etch, facets = etch_from(scan, c["id"])
        cover = float((etch > 0.5).mean())
        note = f"  {c['id']} {c.get('name')}: {cover:.0%} etched"
        live = None
        if a.compare and c.get("etchMap") and not c.get("etchDrawn"):
            live = np.asarray(Image.open(ROOT / c["etchMap"]).convert("RGBA"))[..., 3].astype(np.float32) / 255
            if live.shape != etch.shape:
                live = np.asarray(Image.fromarray((live * 255).astype(np.uint8)).resize((etch.shape[1], etch.shape[0]))).astype(np.float32) / 255
            note += f"; Live covers {float((live > 0.5).mean()):.0%}"
        print(note)
        if a.ship:
            alpha = (etch * 255).astype(np.uint8)
            rgba = np.dstack([np.full_like(alpha, 255)] * 3 + [alpha])
            buf = io.BytesIO()
            Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=80, alpha_quality=80, method=6)
            # /assets/* is cached for a year under its name (_headers), so a
            # redraw never lands on a filename that ever existed: the card's
            # current drawn map is kept if the bytes are the same, otherwise
            # the map ships under the next -vN name and the data follows.
            current = c.get("etchMap") if c.get("etchDrawn") else None
            if current and (ROOT / current).exists() and (ROOT / current).read_bytes() == buf.getvalue():
                rel = current
            else:
                rel = f"assets/foil/maps/{a.set}/{c['number']}-etch.webp"
                if ever_existed(rel) or current:
                    rel = fresh_name(current or rel)
                out = ROOT / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(buf.getvalue())
                print(f"    -> {rel}")
            if a.write_data and (c.get("etchMap") != rel or not c.get("etchDrawn")):
                c["etchMap"] = rel
                c["etchDrawn"] = True
                changed += 1
        if a.debug:
            g = scan.convert("L").resize((WIDTH, etch.shape[0]), Image.LANCZOS)
            imgs = [g, Image.fromarray((facets * 255).astype(np.uint8)), Image.fromarray((etch * 255).astype(np.uint8))]
            if live is not None:
                imgs.append(Image.fromarray((live * 255).astype(np.uint8)))
            rows.append((c["id"], imgs))
    if a.write_data and changed:
        after = json.dumps(loaded["data"], ensure_ascii=False, indent=2) + "\n"
        loaded["path"].write_text(after, encoding="utf-8", newline="\n")
        print(f"{a.set}: {changed} card(s) now carry a drawn etchMap")
    if a.debug and rows:
        w, h = rows[0][1][0].size
        cols = max(len(r[1]) for r in rows)
        sheet = Image.new("L", (cols * (w + 8), len(rows) * (h + 8)), 40)
        for r, (_, imgs) in enumerate(rows):
            for i, im in enumerate(imgs):
                sheet.paste(im, (i * (w + 8), r * (h + 8)))
        dest = ROOT / "scripts" / "_debug" / "etch"
        dest.mkdir(parents=True, exist_ok=True)
        sheet.save(dest / f"{a.set}.png")
        print(f"  contact sheet -> scripts/_debug/etch/{a.set}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
