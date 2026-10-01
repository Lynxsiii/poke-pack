"""Draw the foil masks of the Diamond & Pearl generation's LV.X, Prime and LEGEND frames (TCG Live has no maps for it).

Each mask is one RGBA webp, stretched over the whole card (`mask-size: 100% 100%`, like the shipped TCG Live maps):

    ALPHA      where the card is foil at all. The foil group (`.foil`) is cut to it, so a layer that is not masked
               again shines wherever alpha is up.
    LUMINANCE  the zone a recipe lights specially: the art window of an LV.X (cosmos goes there only), the name plate
               of a Prime (gold name foil goes there only). A layer that wants only that zone adds the same file
               again as a luminance mask (`mask-mode: luminance`).

Frames (fractions of the card, measured on Scrydex scans; the picture is stretched to 63:88 on the site, so fractions
are what matter):

    lvx.webp, lvx-sp.webp   Pokémon LV.X (dp1-dp7, pl1-pl4; the Arceus LV.X frame has the same silhouette). Art window
                            x .077-.927, y .098-.499 (the LEVEL-UP ribbon cuts its top left); foil frame = the outer
                            ring, the strips around the window and the bar under it. The name plate, the rules text, the
                            rule box and the footer are NOT foil. `-sp` also cuts the trainer badge of an SP LV.X
                            (Dialga G, Luxray GL ...), which is a printed picture sitting on the window's lower right.
    prime-basic.webp, prime-evo.webp
                            Pokémon Prime (hgss1-hgss4 and the HGSS Prime promos). The frame is DATA, not geometry: the
                            printed frame is identical on every Prime, so it is the region where the 26 Primes of
                            hgss1-hgss4 do not differ (per-pixel standard deviation under 25 of 255). That gives the outer
                            border, the spiky ring around the art window (the spikes are foil), the name plate, the
                            plates and the bottom edge, and leaves out the art, the text box, the HP and the type
                            symbol. The name is variable ink on the plate, so a box over the name is added: foil layers
                            gild it (luminance = the name box). `-evo` has the evolution portrait circle cut out and the
                            name starting right of it; `-basic` has the name from the left.
    legend-top.webp, legend-bottom.webp
                            LEGEND halves (hgss1 111-114, hgss2 90-95, hgss3 87-90, hgss4 99-102). The first card of a
                            pair is the TOP half: its name bar runs down the LEFT edge and the picture runs off its RIGHT
                            edge; the second is the BOTTOM half, whose picture runs off its LEFT edge and whose attack
                            text sits on the right. Foil is the whole face except the printed text: the name bar, rules
                            strip and footer of a top half; the header plate and the text panel of a bottom half.

New files only (assets are cached for a year); the script keeps an existing file and says so.

    python3 .claude/skills/card-textures/scripts/make_dp_special_masks.py [--scans DIR]

`--scans` is a folder of `<set>-<n>.png` Scrydex scans for the Prime standard deviation; missing ones are fetched.
"""
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "assets" / "foil" / "dp-special"  # `--out` overrides (draft into scratch, then ship)
W, H = 734, 1024
SS = 3  # supersample for anti-aliased edges

PRIMES = [("hgss1", n) for n in range(105, 111)] + [("hgss2", n) for n in range(84, 90)] + \
    [("hgss3", n) for n in range(81, 87)] + [("hgss4", n) for n in range(91, 99)]


# ---- drawing helpers -------------------------------------------------------------------------------------------

def canvas() -> Image.Image:
    return Image.new("L", (W * SS, H * SS), 0)


def poly(im: Image.Image, pts, fill=255) -> None:
    ImageDraw.Draw(im).polygon([(x * W * SS, y * H * SS) for x, y in pts], fill=fill)


def rect(im: Image.Image, x0, y0, x1, y1, fill=255) -> None:
    ImageDraw.Draw(im).rectangle([x0 * W * SS, y0 * H * SS, x1 * W * SS - 1, y1 * H * SS - 1], fill=fill)


def disc(im: Image.Image, cx, cy, r, fill=255) -> None:
    # r is a fraction of the width
    ImageDraw.Draw(im).ellipse([(cx - r) * W * SS, (cy * H - r * W) * SS, (cx + r) * W * SS, (cy * H + r * W) * SS], fill=fill)


def down(im: Image.Image) -> np.ndarray:
    return np.asarray(im.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0


def save(name: str, alpha: np.ndarray, lum: np.ndarray) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    if path.exists():
        print("exists, kept:", path.name)
        return
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = np.round(np.clip(lum, 0, 1) * 255).astype(np.uint8)
    rgba[..., 3] = np.round(np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", lossless=True, method=6, exact=True)
    print(path, path.stat().st_size, "bytes")


# ---- LV.X ------------------------------------------------------------------------------------------------------

def lvx(sp: bool) -> tuple[np.ndarray, np.ndarray]:
    px, py = 1 / 600, 1 / 825  # measured on 600 x 825 scans
    win = canvas()
    # the art window; the LEVEL-UP ribbon and its "Put onto" strip cover the top left, the window starts lower there
    poly(win, [(46 * px, 98 * py), (345 * px, 98 * py), (364 * px, 81 * py), (556 * px, 81 * py), (556 * px, 411 * py), (46 * px, 411 * py)])
    frame = canvas()
    # outer ring: the silver border, 26 px at the sides, 20 above, 25 below
    rect(frame, 0, 0, 1, 1)
    rect(frame, 26 * px, 20 * py, 574 * px, 800 * py, fill=0)
    # the silver around the window: left and right strips, the strip over the window's right, the bar under it
    rect(frame, 26 * px, 98 * py, 46 * px, 432 * py)
    rect(frame, 556 * px, 70 * py, 574 * px, 432 * py)
    rect(frame, 364 * px, 70 * py, 574 * px, 81 * py)
    rect(frame, 26 * px, 411 * py, 574 * px, 432 * py)
    if sp:
        # the trainer badge sits over the window's lower right and the bar under it
        for im in (win, frame):
            disc(im, 516 * px, 412 * py, 60 * px, fill=0)
    wa, fa = down(win), down(frame)
    alpha = np.maximum(wa, fa)
    return alpha, wa


# ---- Prime -----------------------------------------------------------------------------------------------------

def fetch(set_id: str, n: int, folder: Path) -> Path:
    path = folder / f"{set_id}-{n}.png"
    if not path.exists():
        folder.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(f"https://images.scrydex.com/pokemon/{set_id}-{n}/large", headers={"User-Agent": "Mozilla/5.0"})
        path.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return path


def prime_frame(folder: Path) -> np.ndarray:
    stack = []
    for set_id, n in PRIMES:
        im = Image.open(fetch(set_id, n, folder)).convert("RGBA")
        bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
        bg.alpha_composite(im)
        stack.append(np.asarray(bg.convert("RGB").resize((W, H), Image.LANCZOS), dtype=np.float32))
    std = np.stack(stack).std(axis=0).mean(axis=2)
    lab, n = ndi.label(std < 25)
    sizes = ndi.sum(std < 25, lab, range(1, n + 1))
    frame = lab == (int(np.argmax(sizes)) + 1)
    # no pixel specks: close hairline gaps, then drop what is not the big component any more
    frame = ndi.binary_closing(frame, iterations=1)
    lab, n = ndi.label(frame)
    sizes = ndi.sum(frame, lab, range(1, n + 1))
    frame = lab == (int(np.argmax(sizes)) + 1)
    # holes smaller than a few dozen pixels are scan noise, bigger ones are print (text, symbols): keep those
    holes = ndi.binary_fill_holes(frame) & ~frame
    hl, hn = ndi.label(holes)
    hs = ndi.sum(holes, hl, range(1, hn + 1))
    for i, s in enumerate(hs, start=1):
        if s < 40:
            frame[hl == i] = True
    return frame.astype(np.float32)


def prime(folder: Path, evo: bool, hp_cut: bool = False) -> tuple[np.ndarray, np.ndarray]:
    frame = prime_frame(folder)
    name = canvas()
    # the name sits on the plate: a band over the name text, from the evolution circle (or the left border) to the HP
    x0 = 0.172 if evo else 0.075
    rect(name, x0, 0.030, 0.612, 0.074)
    if evo:
        # the evolution portrait circle: printed picture, never foil
        disc(name, 0.0905, 0.0605, 0.062, fill=0)
    nm = down(name)
    # the band fills the plate holes the name ink left; the circle stays out of the frame
    # the name is gold foil ink: the frame's sheen would bleach it, so the box carries only 30% of the foil (the gold
    # gleam, `.glare::after`, reads the box through its luminance and is multiplied by that alpha)
    # v2 (review rv-h2): the name box is alpha 1 / luminance 1, and the recipe subtracts the luminance from the foil
    # (`mask-composite: subtract`), so the sheen never touches the gold lettering while the gleam still reads the full box.
    # v1 had 30% alpha there, which still washed the gold out under a lit sheen and left the gleam at 30% strength.
    alpha = np.maximum(frame * (1.0 - 0.7 * nm), (1.0 if hp_cut else 0.3) * nm)
    # the STAGE / BASIC line and "Evolves from" under the name are printed text
    stage = canvas()
    rect(stage, 0.08, 0.074, 0.66, 0.118)
    alpha = alpha * (1.0 - down(stage))
    if evo:
        circ = canvas()
        disc(circ, 0.0905, 0.0605, 0.062)
        alpha = alpha * (1.0 - down(circ))
    if hp_cut:
        # v2 (review rv-h2): the HP digits differ per card, so the consensus frame covered the last digit (HP 13|0) and
        # a lit sheen washed it out. The whole HP figure is printed text.
        hp = canvas()
        rect(hp, 0.728, 0.040, 0.868, 0.088)
        alpha = alpha * (1.0 - down(hp))
    return alpha, nm


# ---- LEGEND ----------------------------------------------------------------------------------------------------

def legend(top: bool, feather: bool = False) -> tuple[np.ndarray, np.ndarray]:
    face = canvas()
    rect(face, 0, 0, 1, 1)
    cut = canvas()
    if top:
        # the name bar down the left edge with the HP and type symbols, the rules strip at the top left of the picture
        rect(cut, 0.036, 0.034, 0.140, 0.980)
        rect(cut, 0.140, 0.028, 0.610, 0.072)
        # the footer: copyright, number, set symbol
        rect(cut, 0.140, 0.944, 1.0, 0.985)
    else:
        # the header plate (name, rules line, type symbols) and the LEGEND tab under it
        rect(cut, 0.036, 0.026, 0.972, 0.100)
        rect(cut, 0.036, 0.100, 0.345, 0.126)
        # the attack text panel with the retreat, resistance, weakness column and the rules strip on the right
        # (v1: a hard-edged panel, a third of the foil stays. v2, review rv-h2: the panel edge is feathered (16 px) and keeps 0.61,
        # because the hard step from the full-foil picture to the panel read as a printed box with a visible edge)
        if not feather:
            rect(cut, 0.352, 0.100, 0.972, 0.946, fill=165)  # printed over foil: a third of the foil stays
        # the footer
        rect(cut, 0.036, 0.946, 0.972, 0.985)
    f, c = down(face), down(cut)
    if feather and not top:
        panel = canvas()
        rect(panel, 0.352, 0.100, 0.972, 0.946, fill=100)  # 0.39 cut, 0.61 of the foil stays
        pn = np.asarray(panel.filter(ImageFilter.GaussianBlur(16 * SS)).resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0
        c = np.maximum(c, pn)
    alpha = f * (1.0 - c)
    return alpha, np.ones_like(alpha)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scans", default="/tmp/dp-special-scans")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    folder = Path(args.scans)
    global OUT
    if args.out:
        OUT = Path(args.out)
    for name, sp in (("lvx.webp", False), ("lvx-sp.webp", True)):
        a, l = lvx(sp)
        save(name, a, l)
    for name, evo in (("prime-basic.webp", False), ("prime-evo.webp", True)):
        a, l = prime(folder, evo)
        save(name, a, l)
    for name, top in (("legend-top.webp", True), ("legend-bottom.webp", False)):
        a, l = legend(top)
        save(name, a, l)
    a, l = legend(False, feather=True)
    save("legend-bottom-v2.webp", a, l)
    for name, evo in (("prime-basic-v2.webp", False), ("prime-evo-v2.webp", True)):
        a, l = prime(folder, evo, hp_cut=True)
        save(name, a, l)


if __name__ == "__main__":
    main()
