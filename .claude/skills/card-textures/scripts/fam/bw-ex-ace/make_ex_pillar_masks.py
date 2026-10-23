"""Draw the per-card masks of the Black & White Pokemon-EX pillar (family bw-ex-ace): exp-<set>-<n>.webp, one per EX face.

Why. The pillar on .glare is masked by this mask added to itself four times (1 - (1 - a)^4), so the light blazes through
the half-inked art ground as on the Darkrai-EX 88/113 photos. Fed the bare TCG Live map, that boost also lit everything the
map inks inside the Pokemon:
  - round 2: bodies the map gives a partial alpha (Kyogre-EX's body 0.27-0.37, Mewtwo-EX's arm 0.35-0.46, Heatran-EX's
    face and mouth 0.15-0.63). Fixed in round 3 by a per-card smoothstep (CUTS below), kept as it was.
  - round 3 review, at the 50:78 thumb pose: the small foil patches the map leaves INSIDE the silhouette (Victini-EX's and
    Mew-EX's irises, Shaymin-EX's eye, Darkrai-EX's eye and claw, sparkle dust over a body) became hued rainbow discs that
    erased the pupil. The real card breaks the pillar at the Pokemon; where an eye is foil at all it takes a pale silver
    sheen (Victini-EX photo), never the pillar.
  - round 3 review: on grounds the map inks lightly (Keldeo-EX's pale splash, 0.15-0.5) the pillar hardly showed.

What this draws, for every Pokemon-EX face of the family (EX below), inside the art window only (the border ring, the name
band, the rule box and the text box keep the map exactly):
  1. CUTS (round 3): the map through smoothstep(lo, hi) for the cards whose body carries partial alpha.
  2. Islands out: a grey-level area opening (every bright patch smaller than ISLAND px of the 367 x 512 map, at every level,
     sinks to the level of what surrounds it): patches sitting in the matte Pokemon (eyes, collar spots, claws) sink to
     zero, dust strewn over a body sinks to the faint web it hangs on; bumps standing on an inked ground (0.3 and up)
     keep their detail.
  3. Body haze out: what is left is weighted by how much foil surrounds it (a Gaussian of the foil/matte split, sigma
     HAZE_SIGMA px): a patch of partial alpha reaching into a body from the ground (Darkrai-EX BW46's aura over its jaw,
     Darkrai-EX bw5-63's red claw) is mostly surrounded by matte and fades out; open ground keeps all of it. The pillar so
     fades a few pixels before the silhouette, as the real one stops at the Pokemon.
  4. Quiet grounds up: the ground's typical alpha G (the median of what is left, over the window's foil) is lifted toward
     GROUND (gain up to MAX_GAIN), so a lightly inked ground (Keldeo-EX, Shaymin-EX, Latias-EX) takes the pillar like
     Darkrai's half-inked one; a heavily inked ground is left as it is.
The output is white with the mask in alpha, the same size as the map (367 x 512). js/fam/bw-ex-ace.js points --bxa-pmask
at it for every face in EX. --preview writes overlay sheets (the scan | the lit pillar's alpha on it) to check by eye.

    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ex_pillar_masks.py
        # -> assets/foil/fam/bw-ex-ace/exp-<id>.webp
    python3 .claude/skills/card-textures/scripts/fam/bw-ex-ace/make_ex_pillar_masks.py --preview /tmp/sheet --only bw8-18,bw6-46

Re-running rewrites the same bytes. Once shipped, write a changed mask under a new name (exp-<id>-v2.webp) and point the
module at it.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageDraw
from scipy.ndimage import binary_dilation, binary_fill_holes, binary_opening, distance_transform_edt, gaussian_filter, label

ROOT = Path(__file__).resolve().parents[6]

# Every Pokemon-EX face js/fam/bw-ex-ace.js claims (68; the census of 2026-10-22). Keep in step with PILLAR_MASK there.
EX = """
bw4-5 bw4-22 bw4-38 bw4-51 bw4-54 bw4-82 bw4-bwp036 bw4-bwp037 bw4-bwp038
bw5-13 bw5-26 bw5-38 bw5-54 bw5-63 bw5-90
bw6-22 bw6-46 bw6-71 bw6-81 bw6-85 bw6-92 bw6-bwp045 bw6-bwp046 bw6-bwp047
bw7-9 bw7-49 bw7-67 bw7-89 bw7-101 bw7-103
bw8-14 bw8-18 bw8-25 bw8-48 bw8-93 bw8-95 bw8-96 bw8-108 bw8-bwp061 bw8-bwp062 bw8-bwp063
bw9-13 bw9-38 bw9-53 bw9-85 bw9-86 bw9-98
bw10-9 bw10-11 bw10-30 bw10-60 bw10-65 bw10-66 bw10-bwp081 bw10-bwp082 bw10-bwp083
bw11-24 bw11-29 bw11-44 bw11-45 bw11-52 bw11-54 bw11-77 bw11-82 bw11-88 bw11-100 bw11-101 bw11-102
""".split()

# card id: (lo, hi) of the smoothstep on the map's alpha (round 3, checked as overlays on the scans)
CUTS = {
    "bw4-54": (0.80, 0.95),     # Mewtwo-EX: the arm 0.35-0.46 and the gold energy over it 0.5-0.8
    "bw11-54": (0.80, 0.95),    # Mewtwo-EX (Legendary Treasures, same art and map)
    "bw5-26": (0.38, 0.52),     # Kyogre-EX: the body 0.27-0.37
    "bw9-13": (0.60, 0.75),     # Heatran-EX: the face and the fire in its mouth 0.15-0.63
    "bw11-24": (0.38, 0.52),    # Victini-EX: the face
    "bw8-18": (0.38, 0.52),     # Victini-EX (Boundaries Crossed, same art)
    "bw9-53": (0.30, 0.45),     # Deoxys-EX: the right arm
    "bw4-82": (0.38, 0.52),     # Regigigas-EX: the chest under the lightning
    "bw10-11": (0.30, 0.45),    # Genesect-EX: the body
    "bw11-77": (0.30, 0.45),    # Chandelure-EX: the glass globe
    "bw5-38": (0.30, 0.45),     # Raikou-EX: the white mane
    "bw8-bwp062": (0.30, 0.45),  # Black Kyurem-EX BW62: the beam across the body
    # round 4: Keldeo-EX's cream hind legs and horn 0.0-0.24 (the splash ground 0.16-0.63): at 50:78 the pillar lit the leg
    "bw7-49": (0.14, 0.28),
    "bw11-45": (0.14, 0.28),    # Keldeo-EX (Legendary Treasures, same art and map)
}

# card id: polygons (x, y as shares of the card) where the map inks foil over the Pokemon itself, so no pillar may fall
# there (review round 3, 50:78 pose). Drawn on a 5% grid over the scan (--grid), checked on the --preview overlay.
BODY = {
    # Darkrai-EX (Dark Explorers 63, Legendary Treasures 88, same art): the glitter cloud over the red collar and claw
    "bw5-63": [[(0.39, 0.47), (0.44, 0.40), (0.52, 0.355), (0.60, 0.33), (0.68, 0.28), (0.76, 0.27), (0.84, 0.33),
                (0.86, 0.50), (0.60, 0.52), (0.42, 0.52)]],
    "bw11-88": [[(0.39, 0.47), (0.44, 0.40), (0.52, 0.355), (0.60, 0.33), (0.68, 0.28), (0.76, 0.27), (0.84, 0.33),
                 (0.86, 0.50), (0.60, 0.52), (0.42, 0.52)]],
    # Darkrai-EX BW46: the smoke about its jaw and the end of its collar, right of the teeth
    "bw6-bwp046": [[(0.46, 0.20), (0.56, 0.22), (0.64, 0.30), (0.67, 0.40), (0.64, 0.50), (0.50, 0.52), (0.44, 0.40)]],
    # Entei-EX: the white fire over its raised front paw
    "bw5-13": [[(0.06, 0.30), (0.15, 0.26), (0.27, 0.26), (0.35, 0.32), (0.35, 0.42), (0.20, 0.45), (0.05, 0.44)]],
    # Registeel-EX: its seven red eye dots (inked 1.0 in the map)
    "bw6-81": [[(0.54, 0.36), (0.83, 0.36), (0.83, 0.50), (0.70, 0.55), (0.54, 0.55)]],
    # Genesect-EX: the red visor
    "bw10-11": [[(0.37, 0.27), (0.47, 0.21), (0.57, 0.23), (0.58, 0.36), (0.50, 0.42), (0.38, 0.42)]],
}

WINDOW = (0.035, 0.085, 0.965, 0.565)  # the art window (x0, y0, x1, y1 as shares of the card), a little generous
ISLAND = 3000      # px of the 367 x 512 map (1.6% of the card): Victini-EX's iris is about 1500
HAZE_SIGMA = 9.0   # px (2.5% of the card's width)
HAZE = (0.25, 0.45)  # share of foil around a pixel: below the first it takes nothing, above the second all of it
BODY_AREA = 2500   # px: a matte region at least this big is a body (thinner matte lines in the ground are not)
MARGIN = (1.0, 5.0)  # px from a body: the pillar fades in over this (1.4% of the card), so it breaks before the Pokemon
GROUND = 0.5       # the ground's typical alpha after the lift (Darkrai-EX's half-inked ground, which reads right)
MAX_GAIN = 3.0


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def card_record(card_id):
    set_id = card_id.split("-", 1)[0]
    data = json.loads((ROOT / "data" / f"{set_id}.json").read_text())
    cards = data if isinstance(data, list) else data.get("cards", data)
    for c in cards:
        if c.get("id") == card_id:
            return c
    raise KeyError(card_id)


def card_map(card_id):
    c = card_record(card_id)
    if c.get("foilMap"):
        return ROOT / c["foilMap"]
    return ROOT / "assets/foil/fam/bw-ex-ace" / f"map-{card_id.split('-', 1)[1]}.webp"


def window_weight(h, w):
    """1 inside the art window, 0 outside, with a 4 px feather."""
    x0, y0, x1, y1 = WINDOW
    ys = (np.arange(h) + 0.5) / h
    xs = (np.arange(w) + 0.5) / w
    fy = smooth(np.minimum((ys - y0) * h, (y1 - ys) * h) / 4.0)
    fx = smooth(np.minimum((xs - x0) * w, (x1 - xs) * w) / 4.0)
    return fy[:, None] * fx[None, :]


def pillar_mask(card_id, al):
    """The map's alpha (0..1) -> the pillar's mask (0..1, before the sheet's four-fold add), the gain and the ground level."""
    a = al_after_cut(card_id, al)
    h, w = a.shape
    win = window_weight(h, w)
    # 4 (first, so the thresholds below mean the same on every card). Quiet grounds: lift the typical ground alpha
    # toward GROUND
    inside = (win > 0.5) & (a > 0.03)
    g = float(np.median(a[inside])) if inside.sum() > 200 else GROUND
    gain = float(np.clip(GROUND / max(g, 1e-3), 1.0, MAX_GAIN))
    # the lift reaches only the ground's own level: alpha under half the ground's median (a faint haze over a body) keeps
    # its value
    a = np.clip(a * (1 + (gain - 1) * smooth((a - 0.5 * g) / (0.5 * g))), 0, 1)
    # the bodies: big matte regions (thin matte lines between speed lines are not), and the hand-drawn ones
    body_poly = np.zeros((h, w), bool)
    if card_id in BODY:
        img = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(img)
        for poly in BODY[card_id]:
            d.polygon([(x * w, y * h) for x, y in poly], fill=255)
        body_poly = np.asarray(img) > 127
    # matte lines narrower than about 5 px (the gaps between speed lines, which often touch the body) are opened away
    # first, or the ground they cross would read as small holes in the body
    yy, xx = np.mgrid[-2:3, -2:3]
    lab, n = label(binary_opening(a < 0.06, structure=(xx * xx + yy * yy) <= 5))
    sizes = np.bincount(lab.ravel())
    big = sizes >= BODY_AREA
    big[0] = False
    body = big[lab]
    # 2. islands: foil wholly enclosed by one body and smaller than ISLAND (an iris, a collar spot, dust strewn over a
    # body with the faint web it hangs on) goes; a big enclosed ground (seen through a tail's loop) stays
    holes = binary_fill_holes(body) & ~body
    hl, hn = label(holes)
    if hn:
        hs = np.bincount(hl.ravel())
        small = hs < ISLAND
        small[0] = False
        island = binary_dilation(small[hl], iterations=1)
    else:
        island = np.zeros_like(body)
    a1 = a * ~island
    # 3. body haze: weight by the share of foil around
    foil = (a1 > 0.12).astype(float)
    share = gaussian_filter(foil, HAZE_SIGMA, mode="nearest")
    a2 = a1 * smooth((share - HAZE[0]) / (HAZE[1] - HAZE[0]))
    # 3b. a margin from the bodies, so the pillar breaks a little before the Pokemon
    dist = distance_transform_edt(~(body | island | body_poly))
    a2 = a2 * smooth((dist - MARGIN[0]) / (MARGIN[1] - MARGIN[0])) * ~body_poly
    out = a2 * win + al_after_cut(card_id, al) * (1 - win)
    return np.clip(out, 0, 1), gain, g


def al_after_cut(card_id, al):
    if card_id in CUTS:
        lo, hi = CUTS[card_id]
        return smooth((al - lo) / (hi - lo))
    return al


def scan(card_id, size):
    s, n = card_id.split("-", 1)
    return np.asarray(Image.open(ROOT / "assets/cards" / s / f"{n}.webp").convert("RGB").resize(size, Image.LANCZOS)).astype(float)


def lit(a):
    return 1 - (1 - a) ** 4


def preview(ids, masks, out_base, per_row=3, rows_per_sheet=3):
    """Overlay sheets: per card the scan's art window beside it with the lit pillar's alpha (1 - (1 - a)^4) in magenta."""
    tiles = []
    for cid in ids:
        m = masks[cid]
        h, w = m.shape
        s = scan(cid, (w, h))
        y0, y1 = int(0.07 * h), int(0.58 * h)
        al = lit(m)[..., None] * 0.75
        over = s * (1 - al) + np.array([255, 0, 255], float) * al
        tiles.append(np.hstack([s[y0:y1], over[y0:y1], np.zeros((y1 - y0, 6, 3))]))
    blank = np.zeros_like(tiles[0])
    per = per_row * rows_per_sheet
    for k in range(0, len(tiles), per):
        chunk = tiles[k:k + per] + [blank] * (per - len(tiles[k:k + per]))
        sheet = np.vstack([np.hstack(chunk[r * per_row:(r + 1) * per_row]) for r in range(rows_per_sheet)])
        Image.fromarray(sheet.clip(0, 255).astype(np.uint8)).save(f"{out_base}-{k // per:02d}.jpg", quality=88)
        print(f"{out_base}-{k // per:02d}.jpg", " ".join(ids[k:k + per]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out-dir", default="assets/foil/fam/bw-ex-ace")
    ap.add_argument("--only", default="", help="comma-separated card ids (default: every EX face)")
    ap.add_argument("--preview", default="", help="write overlay sheets <base>-NN.jpg instead of the masks")
    a = ap.parse_args()
    ids = [i for i in a.only.split(",") if i] or EX
    out_dir = ROOT / a.out_dir
    masks = {}
    for cid in ids:
        src = Image.open(card_map(cid)).convert("RGBA")
        al = np.asarray(src)[..., 3].astype(float) / 255
        m, gain, g = pillar_mask(cid, al)
        masks[cid] = m
        if a.preview:
            print(f"{cid}: ground {g:.2f}, gain {gain:.2f}")
            continue
        a8 = (m * 255).round().astype(np.uint8)
        white = np.full_like(a8, 255)
        out = out_dir / f"exp-{cid}.webp"
        Image.fromarray(np.dstack([white, white, white, a8]), "RGBA").save(out, "WEBP", quality=80, alpha_quality=80, method=6)
        print(out.relative_to(ROOT), src.size, out.stat().st_size, "bytes", f"gain {gain:.2f}")
    if a.preview:
        preview(ids, masks, a.preview)


if __name__ == "__main__":
    main()
