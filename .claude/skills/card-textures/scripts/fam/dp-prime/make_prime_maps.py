#!/usr/bin/env python3
"""Draw the Pokémon Prime foil maps for the holo family dp-prime (css/holo/fam/dp-prime.css, js/fam/dp-prime.js).

What the real card does (photos in /mnt/project-files/holo-remaster/dp-prime/refs/, SOURCES.md): the outer BAND of the
frame is bare mirror-silver foil with a glitter emboss (it reads dark with coloured sparkles when it reflects a room,
bright cream when it catches the lamp; a printed yellow ombre tints it); the SPIKES round the art window, the white
name plate, the STAGE tab, the "Evolves from" strip and the Illus. pill are white ink over the foil (bright satin, they
never go dark); the NAME LETTERING, the ring round the evolution portrait and one of the two HP slashes are GOLD foil;
the art, the text box, the type stripes, coloured plates, HP digits and symbols are matte print.

Where each zone is, measured, not guessed:
  * the 26 set scans (hgss1-hgss4) are pixel-registered to each other: their median is the template frame;
  * the band's inner edge is a straight line on every card (stripe outer edge x 24.5 / 573.5, plate top y 22.5, text
    box bottom y 809.5, on the 600 x 838 scans);
  * the three HGSS promo scans (HGSS07-09) are cropped tighter: an affine warp (ECC on frame gradients) maps the
    template onto each of them;
  * those promo scans caught the bare foil DARK (a star field) and the white ink cream, so "cream on the set scans AND
    cream on the promo scans" is the white-ink satin (spikes, plates), "cream on the set scans, dark on the promos" is
    the bare mirror band, and the spike tips that cross the band come out right by themselves;
  * gold, the white plate parts and the dark ink (HP digits, STAGE letters) are read from each card's own scan.

Writes into assets/foil/fam/dp-prime/ (new files only; a redraw after shipping goes to a new -vN suffix):
  <id>-zones-v1.webp   600 x 838 RGBA. alpha: band 255, satin SATIN_ALPHA, else 0. RGB: white on the band, black
                       elsewhere, so the same file read with mask-mode: luminance is the band alone.
  <id>-gold-v1.webp    600 x 838, alpha = the gold foil (lettering, portrait ring, gold HP slash).
  glitter-v1.webp      1200 x 1676 shared fleck field (white flecks, alpha), only round the frame, no tiling.
  twinkle-v1.webp      256 x 256 seamless tile of coloured light blobs: seen only through the flecks, it slides
                       with the pointer so each fleck lights and changes colour on its own (glitter twinkle).

Seeded and re-runnable:  python3 make_prime_maps.py [--preview <dir>] [--out assets/foil/fam/dp-prime] [--suffix v1]
"""
import argparse
import glob
import json
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../../.."))
W, H = 600, 838
SATIN_ALPHA = 150          # the white-ink zones take this share of the frame recipe (no mirror darkening there)
INNER = (24.5, 22.5, 573.5, 809.5)   # x0, y0, x1, y1: the band's straight inner edge on the set scans
SEED = 20101001


def load_primes():
    """Every Prime face the family claims: rarity Rare Prime, or a promo printed as one (foilAs)."""
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "hgss*.json"))):
        for c in json.load(open(f)):
            if c.get("rarity") == "Rare Prime" or c.get("foilAs") == "Rare Prime":
                subs = c.get("subtypes") or []
                evo = "Stage 1" in subs or "Stage 2" in subs or bool(c.get("evolvesFrom"))
                out.append({"id": c["id"], "image": os.path.join(ROOT, c["image"]), "evo": evo,
                            "promo": bool(c.get("foilAs")), "name": c.get("name", "")})
    return out


def rgb(path):
    return np.array(Image.open(path).convert("RGB")).astype(np.float32)


def alpha(path):
    return np.array(Image.open(path).convert("RGBA"))[..., 3].astype(np.float32) / 255.0


def hsv(a):
    return cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)


def grad(g):
    g = cv2.GaussianBlur(g, (0, 0), 1.0)
    return np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3))


def not_cream(a):
    h = hsv(a)
    return (h[..., 1] > 70) | (h[..., 2] < 120)


def cream(a):
    h = hsv(a)
    return (h[..., 2] > 150) & (h[..., 1] < 75)


def keep_big(mask, min_area):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_area
    return keep[lab]


def register_promo(template_grad, frame, a):
    """Affine warp (template -> promo scan) by ECC on frame gradients."""
    gi = grad(a.mean(-1)).astype(np.float32)
    best = None
    for s0 in (0.975, 0.965, 0.985):
        si = 1 / s0
        m0 = np.float32([[si, 0, (1 - si) * W / 2], [0, si, (1 - si) * H / 2]])
        try:
            cc, m = cv2.findTransformECC(template_grad, gi, m0.copy(), cv2.MOTION_AFFINE,
                                         (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), frame, 5)
        except cv2.error:
            continue
        if best is None or cc > best[0]:
            best = (cc, m)
    return best


def template(primes):
    sets = [p for p in primes if not p["promo"]]
    scans = {p["id"]: rgb(p["image"]) for p in primes}
    st = np.stack([scans[p["id"]] for p in sets])
    gray = st.mean(-1)
    med = np.median(st, 0)
    std = gray.std(0)
    # Cards whose type stripe is itself pale (Colorless, Metal) cannot show where the spikes cross it.
    good = []
    for p in sets:
        a = scans[p["id"]]
        nc = not_cream(a)[100:430, 26:31].mean()
        if nc > 0.5:
            good.append(p["id"])
    frac_nc = np.stack([not_cream(scans[i]).astype(np.float32) for i in good]).mean(0)
    # promos: register, then read their cream into template coordinates
    frame = cv2.dilate((std < 22).astype(np.uint8), np.ones((7, 7), np.uint8))
    tgrad = (grad(med.mean(-1).astype(np.float32)) * frame).astype(np.float32)
    warps = {}
    acc = np.zeros((H, W), np.float32)
    cov = np.zeros((H, W), np.float32)
    for p in primes:
        if not p["promo"]:
            continue
        cc, m = register_promo(tgrad, frame, scans[p["id"]])
        warps[p["id"]] = m
        cr = cream(scans[p["id"]]).astype(np.float32)
        ct = cv2.warpAffine(cr, m, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=-1)
        valid = (ct >= 0).astype(np.float32)
        acc += np.clip(ct, 0, 1) * valid
        cov += valid
        print(f"  {p['id']}: ecc {cc:.3f}  warp {np.round(m, 4).tolist()}")
    promo_cream = np.where(cov > 0, acc / np.maximum(cov, 1), -1)

    card = alpha(sets[0]["image"]) > 0.5
    yy, xx = np.mgrid[0:H, 0:W]
    x0, y0, x1, y1 = INNER
    inner_rect = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    # white ink: cream on the set scans and on the promo scans
    satin = (promo_cream >= 0.34) & (frac_nc < 0.35)
    satin = keep_big(satin, 25)
    # the band from the data: everything outside the filled inner structure
    inner = (frac_nc >= 0.25) | (promo_cream >= 0.34)
    inner = keep_big(inner, 400)
    inner = ndi.binary_fill_holes(inner)
    inner = ndi.binary_closing(inner, structure=np.ones((3, 3)), iterations=2)
    inner = ndi.binary_fill_holes(inner)
    band_data = keep_big(~inner, 60)
    band = (band_data | ~inner_rect) & card & ~satin
    band = keep_big(band, 30)
    satin = satin & card
    top = top_row(std, satin)
    return {"med": med, "std": std, "frac_nc": frac_nc, "promo_cream": promo_cream, "band": band,
            "satin": satin, "warps": warps, "inner_rect": inner_rect, "scans": scans, "good": good, "top": top}


# Name-row geometry on the set scans (template coordinates), measured: the gold ring round the evolution portrait
# (centre and radius fitted to the gold of the 20 Stage 1/2 set scans) and the round type symbol right of the HP.
PORTRAIT = (60.0, 54.0)
RING = (32.5, 39.5)            # gold ring between these radii; inside it the portrait is print, outside a white ring
SYMBOL = (539.5, 50.5, 23.0)   # the type symbol (Lightning's is yellow, never gold foil)
GOLD_ROW = 82                  # gold foil only above this line: lettering, ring, the slash strokes


def top_row(std, satin):
    """The name row in template coordinates: plate, portrait, HP, STAGE tab and Evolves strip. It is what is the same on
    every set scan (low spread) or white ink, with what it encloses (letters, digits, the portrait) filled in; the art
    window below it is not enclosed by it, so it stays out."""
    yy, xx = np.mgrid[0:H, 0:W]
    x0, y0, x1, y1 = INNER
    zone = (xx >= x0) & (xx <= x1) & (yy >= y0)
    stable = ((std < 25) | satin) & zone
    top = np.zeros((H, W), bool)
    top[:100] = ndi.binary_fill_holes(stable[:100])
    top = ndi.binary_closing(top, structure=np.ones((5, 5)))
    top |= zone & (yy < 80)
    return top & zone


def card_maps(p, T):
    """Band (bare mirror foil), satin (white ink over foil) and gold foil for one card, in its own pixel coordinates."""
    a = T["scans"][p["id"]]
    m = T["warps"].get(p["id"])

    def to_card(mask):
        f = mask.astype(np.float32)
        if m is None:
            return f
        return cv2.warpAffine(f, m.astype(np.float32), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    def pt(x, y):
        return (x, y) if m is None else (float(m[0, 0] * x + m[0, 1] * y + m[0, 2]), float(m[1, 0] * x + m[1, 1] * y + m[1, 2]))

    scale = 1.0 if m is None else float(np.sqrt(abs(np.linalg.det(m[:, :2]))))
    card = alpha(p["image"]) > 0.5
    band = to_card(T["band"]) > 0.5
    satin_t = to_card(T["satin"]) > 0.5
    top = to_card(T["top"]) > 0.5
    gold_row = to_card(np.mgrid[0:H, 0:W][0] < GOLD_ROW) > 0.5
    h = hsv(a)
    hue, sat, val = h[..., 0] * 2, h[..., 1] / 255, h[..., 2] / 255
    yy, xx = np.mgrid[0:H, 0:W]
    sx, sy = pt(SYMBOL[0], SYMBOL[1])
    sym = np.hypot(xx - sx, yy - sy) <= SYMBOL[2] * scale
    if p["evo"]:
        cx, cy = pt(*PORTRAIT)
        d = np.hypot(xx - cx, yy - cy)
        inside = d < RING[0] * scale
        ring = (d >= RING[0] * scale) & (d <= RING[1] * scale)
    else:
        inside = np.zeros((H, W), bool)
        ring = inside
    # gold foil: solid gold (the printed yellow "sand" on the band and on the plate edges is paler, sat 0.26-0.48,
    # lettering and slashes are sat 0.6-0.9), grown into its own anti-aliased edge
    # (gold on the set scans is hue 42-52; the promo scans caught it dark olive, hue up to ~70, value ~0.45; a set
    # scan's olive plate, Celebi's, is not gold)
    goldish = (hue >= 28) & (hue <= (74 if p["promo"] else 62)) & (val >= 0.26)
    core = goldish & (sat >= 0.55) & (val >= 0.30) & top & gold_row & ~inside & ~sym
    core = cv2.medianBlur(core.astype(np.uint8) * 255, 3) > 127
    core = keep_big(core, 14)
    grow = goldish & (sat >= 0.30) & top & gold_row & ~inside & ~sym
    gold = ndi.binary_dilation(core, iterations=2, mask=grow) | core
    gold |= ring & (hue >= 22) & (hue <= 66) & (sat >= 0.22) & (val >= 0.22)
    # white ink in the name row: near-white or silver (the sand on it included), not dark ink, not gold
    white = top & ~gold & ~inside & ~sym & (val >= 0.50) & ((sat < 0.16) | ((sat < 0.50) & goldish & ~core))
    white = ndi.binary_closing(white, structure=np.ones((3, 3))) & top & ~gold & ~inside & ~sym & (val >= 0.42)
    white = keep_big(white, 12)
    # the silver stroke between the two gold slash strokes: bare silver foil, like the band
    slash_zone = np.zeros((H, W), bool)
    slash_zone[20:84, 340:480] = True
    slash_zone = to_card(slash_zone) > 0.5
    between = ndi.binary_closing(gold & slash_zone, structure=np.ones((7, 7)))
    silver = between & ~gold & (sat < 0.16) & (val > 0.40) & slash_zone
    silver = keep_big(silver, 10)
    band = (band | silver) & ~gold & ~inside & card
    band &= ~(top & ~silver)            # the name row is never the bare band, except that silver stroke
    satin = ((satin_t & ~top) | white) & ~band & ~gold & card
    satin &= ~(val < 0.42)              # dark ink on white parts (STAGE letters, Illus. name, outlines) is print
    return band.astype(np.float32), satin.astype(np.float32), gold.astype(np.float32), None


def soften(mask, sigma=0.55):
    return np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma), 0, 1)


def write_zones(path, band, satin):
    b = soften(band)
    s = soften(satin) * (1 - b)
    a = np.clip(b * 255 + s * SATIN_ALPHA, 0, 255)
    lum = np.where(b + s > 0, 255 * b / np.maximum(b + s, 1e-6), 0)
    img = np.dstack([lum, lum, lum, a]).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)


def write_alpha(path, mask, sigma=0.5):
    a = (soften(mask, sigma) * 255).astype(np.uint8)
    white = np.full_like(a, 255)
    Image.fromarray(np.dstack([white, white, white, a]), "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)


def glitter(T, cards_frames, path, rng):
    """A field of fine flecks round the frame (no tile, no repeat): mostly pinpoints, a few larger flakes."""
    S = 2
    hw, hh = W * S, H * S
    region = np.zeros((H, W), np.float32)
    for f in cards_frames:
        region = np.maximum(region, f)
    region = cv2.dilate((region > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    region = cv2.resize(region, (hw, hh), interpolation=cv2.INTER_LINEAR) > 0.5
    img = np.zeros((hh, hw), np.float32)
    # blue-noise-ish placement: jittered grid
    pitch = 9.0                      # px at 1200 wide: about one fleck per 80 px^2 of frame
    gy, gx = np.mgrid[0:hh:pitch, 0:hw:pitch]
    pts = np.stack([gx.ravel(), gy.ravel()], 1) + rng.uniform(0, pitch, (gx.size, 2))
    pts = pts[(pts[:, 0] < hw - 1) & (pts[:, 1] < hh - 1)]
    keep = region[pts[:, 1].astype(int), pts[:, 0].astype(int)]
    pts = pts[keep]
    n = len(pts)
    size = rng.choice([0.55, 0.75, 1.0, 1.4, 2.0], n, p=[0.30, 0.30, 0.22, 0.13, 0.05])
    bright = np.clip(rng.lognormal(-0.55, 0.45, n), 0.18, 1.0)
    yy, xx = np.mgrid[-4:5, -4:5]
    for (x, y), s, b in zip(pts, size, bright):
        ix, iy = int(x), int(y)
        fx, fy = x - ix, y - iy
        k = np.exp(-(((xx - fx) ** 2 + (yy - fy) ** 2) / (2 * s * s)))
        k = k / k.max() * b
        y0, y1 = max(iy - 4, 0), min(iy + 5, hh)
        x0, x1 = max(ix - 4, 0), min(ix + 5, hw)
        img[y0:y1, x0:x1] = np.maximum(img[y0:y1, x0:x1], k[(y0 - iy + 4):(y1 - iy + 4), (x0 - ix + 4):(x1 - ix + 4)])
    a = np.clip(img * 255, 0, 255).astype(np.uint8)
    white = np.full_like(a, 255)
    Image.fromarray(np.dstack([white, white, white, a]), "RGBA").save(path, "WEBP", lossless=True, quality=100, method=6)
    return n


def twinkle(path, rng, size=256):
    """Seamless coloured light blobs: random hue, random brightness, many off (dark), blob ~ one fleck wide."""
    f = rng.normal(0, 1, (size, size))
    F = np.fft.fft2(f)
    ky = np.fft.fftfreq(size)[:, None]
    kx = np.fft.fftfreq(size)[None, :]
    k = np.hypot(kx, ky)
    lum = np.real(np.fft.ifft2(F * np.exp(-(k / 0.085) ** 2)))
    lum = (lum - lum.mean()) / lum.std()
    on = np.clip((lum - 0.35) / 1.3, 0, 1) ** 1.2          # about a third of the area lit, soft edges
    hf = np.real(np.fft.ifft2(np.fft.fft2(rng.normal(0, 1, (size, size))) * np.exp(-(k / 0.03) ** 2)))
    hue = ((hf - hf.min()) / (hf.max() - hf.min()) * 360 * 2.2) % 360
    hsv_img = np.dstack([hue / 2, np.full_like(hue, 150), np.full_like(hue, 255)]).astype(np.uint8)
    col = cv2.cvtColor(hsv_img, cv2.COLOR_HSV2RGB).astype(np.float32)
    # a third of the lit blobs are white sparkles
    white = np.clip((np.real(np.fft.ifft2(np.fft.fft2(rng.normal(0, 1, (size, size))) * np.exp(-(k / 0.06) ** 2))) > 0.012), 0, 1)
    col = col * (1 - white[..., None] * 0.75) + 255 * white[..., None] * 0.75
    out = col * on[..., None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").save(path, "WEBP", lossless=True, quality=100, method=6)


def preview(out_dir, primes, T, maps):
    os.makedirs(out_dir, exist_ok=True)
    tiles = []
    for p in primes:
        a = T["scans"][p["id"]]
        band, satin, gold, _ = maps[p["id"]]
        vis = a * 0.55
        vis = vis * (1 - band[..., None] * 0.6) + np.array([255, 40, 40]) * band[..., None] * 0.6
        vis = vis * (1 - satin[..., None] * 0.6) + np.array([40, 170, 255]) * satin[..., None] * 0.6
        vis = vis * (1 - gold[..., None] * 0.8) + np.array([255, 220, 0]) * gold[..., None] * 0.8
        tiles.append(Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8)))
        Image.fromarray(np.clip(vis, 0, 255).astype(np.uint8)).save(os.path.join(out_dir, f"zones-{p['id']}.png"))
    cols = 6
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (300 * cols, 419 * rows))
    for k, t in enumerate(tiles):
        sheet.paste(t.resize((300, 419)), ((k % cols) * 300, (k // cols) * 419))
    sheet.save(os.path.join(out_dir, "zones-all.jpg"), quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "assets/foil/fam/dp-prime"))
    ap.add_argument("--suffix", default="v1")
    ap.add_argument("--preview", default="")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    rng = np.random.default_rng(SEED)
    primes = load_primes()
    print(f"{len(primes)} Prime faces")
    T = template(primes)
    maps = {p["id"]: card_maps(p, T) for p in primes}
    if args.preview:
        preview(args.preview, primes, T, maps)
    if args.no_write:
        return
    os.makedirs(args.out, exist_ok=True)
    frames = []
    for p in primes:
        band, satin, gold, circ = maps[p["id"]]
        write_zones(os.path.join(args.out, f"{p['id']}-zones-{args.suffix}.webp"), band, satin)
        write_alpha(os.path.join(args.out, f"{p['id']}-gold-{args.suffix}.webp"), gold)
        frames.append(np.maximum(band, satin))
    n = glitter(T, frames, os.path.join(args.out, f"glitter-{args.suffix}.webp"), rng)
    twinkle(os.path.join(args.out, f"twinkle-{args.suffix}.webp"), rng)
    print(f"wrote {len(primes) * 2} card maps, glitter ({n} flecks), twinkle into {args.out}")


if __name__ == "__main__":
    main()
