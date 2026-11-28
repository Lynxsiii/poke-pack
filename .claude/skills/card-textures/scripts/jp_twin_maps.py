#!/usr/bin/env python3
"""Give a Japanese print the English twin's TCG Live maps when the art is the same, from ANY English set.

scripts/build_jp_set.py copies maps from one `englishTwin` set (151 for jsv2a). The Japanese high-class and special
sets reprint art from many English sets (Shiny Treasure ex's Double Rares are Paldea Evolved's and Obsidian Flames';
Terastal Festival's are Temporal Forces' and Twilight Masquerade's), so those prints had no map at all and fell to the
old no-map recipes: a flat wash, no texture (Noah, 2026-11-27: the Japanese cards "feel so weak with the texture").

For every Japanese face of a mapped finish with no foilMap, this looks for English cards of the same name and rarity
in every English set of the same era, compares the art (the scans' top 55%, grey, 96 px wide, normalised
cross-correlation; the frame and text differ between the languages, the painting does not) and takes the best match
over --min-corr. It copies foilMap, etchMap (Live's only: a drawn English etch belongs to the English scan) and sets
foilTwin. Full arts are not touched: their Japanese text sits elsewhere, so an English etch would ghost English text;
they take a drawn etch of their own (make_card_etch.py), and since 2026-11-28 the twin's foil map (FULL below), which
must then go through --clean-text.

    python3 jp_twin_maps.py            # report
    python3 jp_twin_maps.py --write    # and write data/<jp set>.json
    python3 jp_twin_maps.py --clean-text --write   # paint the English lettering out of every twin map (run after
                                                   # foil_align.py --only-variants --fix)
"""
import argparse
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
MAPPED = {"Double Rare", "Shiny Rare", "Shiny Ultra Rare", "ACE SPEC Rare", "Rare", "Rare Holo", "Rare Prism Star",
          "Illustration Rare", "Rare Holo GX", "Rare Holo V", "Radiant Rare"}
# Full arts and the other prints whose Japanese text sits elsewhere: since --clean-text paints the English lettering out
# of a twin's map (2026-11-27), they take the twin's foil map too, but keep their own drawn etch. Without one they wore
# the all-white map, so the whole face was foil: skin and faces took the bands' tint and the Supporters' diagonal
# streaks (per-card review 2026-11-28: Professor Burnet js8b-265, Volo js12a-245, Bea js8b-261).
FULL = {"Rare Ultra", "Rare Secret", "Rare Rainbow", "Rare Rainbow Alt", "Rare Holo VMAX", "Rare Holo VSTAR",
        "Rare Holo V", "Trainer Gallery Rare Holo", "Rare Shiny", "Rare Shiny GX", "Special Illustration Rare",
        "Hyper Rare", "Ultra Rare", "Illustration Rare"}
ERA_SETS = {"sv": r"^(sv\d|sv\d+pt5|svp)", "sm": r"^(sm\d|smp)", "swsh": r"^(swsh|cel25|pgo)"}


def art(path):
    im = Image.open(os.path.join(ROOT, path)).convert("L")
    w, h = im.size
    im = im.crop((int(w * .06), int(h * .09), int(w * .94), int(h * .55))).resize((96, 64), Image.BILINEAR)
    a = np.asarray(im, np.float32)
    return (a - a.mean()) / (a.std() + 1e-3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--min-corr", type=float, default=0.55)
    a = ap.parse_args()
    english = {}
    for p in glob.glob(os.path.join(ROOT, "data", "*.json")):
        s = os.path.basename(p)[:-5]
        if s.startswith("j") or s in ("pullrates", "products", "patch-notes"):
            continue
        try:
            d = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(d, list) and d and isinstance(d[0], dict) and "rarity" in d[0]:
            english[s] = d
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "j*.json"))):
        s = os.path.basename(p)[:-5]
        cfg_p = os.path.join(ROOT, "data", "sets", f"{s}.json")
        if not os.path.exists(cfg_p):
            continue
        era = json.load(open(cfg_p, encoding="utf-8")).get("era") or "sv"
        pat = re.compile(ERA_SETS.get(era, r"^$"))
        cards = json.load(open(p, encoding="utf-8"))
        changed = 0
        for c in cards:
            full = c.get("rarity") not in MAPPED
            if c.get("foilMap") or (full and c.get("rarity") not in FULL) or not c.get("image") or c.get("pattern"):
                continue
            mine = art(c["image"])
            best = None
            for es, ecards in english.items():
                if not pat.match(es):
                    continue
                for e in ecards:
                    if e.get("name") != c.get("name") or not e.get("foilMap") or not e.get("image"):
                        continue
                    if full:
                        if e.get("rarity") not in FULL and e.get("rarity") != "Promo":
                            continue
                    elif e.get("rarity") != c.get("rarity") and not (
                            e.get("rarity") == "Promo" and (c["rarity"].startswith("Shiny") or c["rarity"] == "Double Rare")):
                        # a Double Rare too: Terastal Festival's nine ex with new art are the English SVP promos
                        # (2026-11-28: they had no map and wore the whole-face foil-ex wash)
                        continue
                    try:
                        corr = float((mine * art(e["image"])).mean())
                    except OSError:
                        continue
                    if not best or corr > best[0]:
                        best = (corr, e)
            if not best:
                print(f"  {c['id']:14} {c['name']:24} {c['rarity']:18} no English card of that name with a map")
                continue
            corr, e = best
            ok = corr >= (max(a.min_corr, 0.65) if full else a.min_corr)
            print(f"{'ok' if ok else '  '} {c['id']:14} {c['name']:24} {c['rarity']:18} <- {e['id']:14} art corr {corr:.2f}")
            if ok and a.write:
                c["foilMap"] = e["foilMap"]
                if full:
                    pass  # the Japanese print's own drawn etch stays; --clean-text --only takes the English words out
                elif e.get("etchMap") and not e.get("etchDrawn"):
                    c["etchMap"] = e["etchMap"]
                c["foilTwin"] = e["id"]
                changed += 1
        if changed:
            with open(p, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(cards, ensure_ascii=False, indent=2) + "\n")
            print(f"{s}: {changed} prints now wear their English twin's maps")


if __name__ == "__main__" and "--clean-text" not in sys.argv:
    main()


# ---- English text inside a twin's map ---------------------------------------------------------------------------
# A TCG Live map holds the English card's lettering as holes (foil) or solid shapes (etch). On the Japanese print the
# text sits elsewhere, so lit, the English words show through the foil: "Invitation", "TRAINER" on jsv2a-206/207, an
# attack name on jsm12a-77 (the per-card review of 2026-11-27). Wherever the Japanese scan differs from the English
# scan once the two are registered (the text, the name bar), the map is replaced by its own heavy blur: the foil level
# stays, the English glyphs go. Files are new (`-tN`); the data follows.

def unletter(alpha, m):
    """Take lettering out of a map's alpha where m (0..1) says the two prints differ.

    Inpainting: inside the mask the map's own pixels are the English words, so none of them is used; the hole is
    filled from the map around it (Telea). Lettering goes whatever its weight or polarity (dark glyphs cut into the
    foil, light ones standing on the etch), and where the mask only grazes an edge (a face's or a Pokémon's outline,
    which it catches when the two scans' detail differs) the band is thin and the outline comes back from both
    sides. Tried first: a Gaussian blur (soft English words still readable at rest, the foil smeared over faces,
    jsv2a-206), a close-open (filled the etch's white text lines into bars), a median (bold text survives)."""
    import cv2
    w = alpha.shape[1]
    hole = (m > 0.35).astype(np.uint8)
    flat = cv2.inpaint(alpha.astype(np.uint8), hole, max(3, int(w / 120)), cv2.INPAINT_TELEA).astype(np.float32)
    flat = cv2.GaussianBlur(flat, (0, 0), w / 400)
    return np.clip(alpha.astype(np.float32) * (1 - m) + flat * m, 0, 255).astype(np.uint8)


def clean_text(write, only=None):
    import cv2
    from foil_align import variant_fit, warp  # noqa: E402  (scan-to-scan affine, the same fit --fix used)
    W, H = 360, 503
    en = {}
    for p in glob.glob(os.path.join(ROOT, "data", "*.json")):
        s = os.path.basename(p)[:-5]
        if s.startswith("j"):
            continue
        try:
            d = json.load(open(p, encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(d, list):
            for c in d:
                if isinstance(c, dict) and c.get("id"):
                    en[c["id"]] = c
    total = 0
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "j*.json"))):
        cards = json.load(open(p, encoding="utf-8"))
        text = open(p, encoding="utf-8").read()
        changed = 0
        for c in cards:
            twin = en.get(c.get("foilTwin") or "")
            if only and c.get("id") not in only:
                continue
            if not twin or not twin.get("image"):
                continue
            # only maps that came from the twin: a full art's own drawn etch (no etchDrawn flag on some) is left alone;
            # foil_align.py --fix renames the twin's etch to -etch-a1, which is still the twin's (2026-11-28: Pidgeot ex
            # jsv3-136 showed "Quick Search" through the foil because its aligned etch was skipped)
            keys = [k for k in ("foilMap", "etchMap") if c.get(k) and not (k == "etchMap" and c.get("etchDrawn"))
                    and not (k == "etchMap" and re.sub(r"(-a\d+)+\.webp$", ".webp", c[k]) != twin.get("etchMap"))
                    and not re.search(r"-t\d+\.webp$", c[k])]
            if not keys:
                continue
            r = variant_fit((c["id"], keys[0], c["image"], c[keys[0]], twin["image"]))[4]
            if not r or r[0] < 0.6:
                continue
            A = np.array(r[2], np.float32)
            jp = np.asarray(Image.open(os.path.join(ROOT, c["image"])).convert("L").resize((W, H)), np.float32)
            eg = np.asarray(Image.open(os.path.join(ROOT, twin["image"])).convert("L").resize((W, H)), np.float32)
            eg = cv2.warpAffine(eg, A, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
            # lettering is fine detail: compare the two prints' detail (high-pass), not their tone, which differs
            # between the two scans' exposure and printing
            def hp(x):
                x = cv2.GaussianBlur(x, (0, 0), 0.8)
                return np.abs(x - cv2.GaussianBlur(x, (0, 0), 3))
            d = cv2.GaussianBlur(np.abs(hp(jp) - hp(eg)), (0, 0), 2.5)
            diff = d > max(6.0, float(np.median(d)) * 2.2)
            diff = cv2.morphologyEx(diff.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            diff = cv2.dilate(diff, np.ones((7, 7), np.uint8)) > 0
            share = float(diff.mean())
            if share < 0.01:
                continue
            for k in keys:
                src = os.path.join(ROOT, c[k])
                im = np.asarray(Image.open(src).convert("RGBA")).copy()
                h, w = im.shape[:2]
                m = cv2.resize(diff.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
                m = cv2.GaussianBlur(m, (0, 0), w / 160)
                im[..., 3] = unletter(im[..., 3], m)
                base = re.sub(r"\.webp$", "", c[k])
                n = 1
                while os.path.exists(os.path.join(ROOT, f"{base}-t{n}.webp")):
                    n += 1
                out = f"{base}-t{n}.webp"
                if write:
                    Image.fromarray(im, "RGBA").save(os.path.join(ROOT, out), quality=90, alpha_quality=100, method=4)
                    at = text.find(json.dumps(c["id"]))
                    j = text.find(json.dumps(c[k]), at)
                    if at >= 0 and j >= 0:
                        text = text[:j] + json.dumps(out) + text[j + len(json.dumps(c[k])):]
                        changed += 1
                        # a family that derives a baked map from the foil map's name (sm-gx `-gx-v1`) follows
                        gx = os.path.join(ROOT, base + "-gx-v1.webp")
                        if k == "foilMap" and os.path.exists(gx):
                            g = np.asarray(Image.open(gx).convert("RGBA")).copy()
                            gh, gw = g.shape[:2]
                            mg = cv2.GaussianBlur(cv2.resize(diff.astype(np.float32), (gw, gh)), (0, 0), gw / 160)
                            g[..., 3] = unletter(g[..., 3], mg)
                            Image.fromarray(g, "RGBA").save(os.path.join(ROOT, f"{out[:-5]}-gx-v1.webp"), quality=90,
                                                            alpha_quality=100, method=4)
            print(f"{c['id']:14} text differs over {share:.0%} of the card: {', '.join(keys)} cleaned")
        if write and changed:
            open(p, "w", encoding="utf-8", newline="\n").write(text)
            json.loads(text)
            total += changed
    print(f"{total} maps cleaned")


if __name__ == "__main__" and "--clean-text" in sys.argv:
    _o = [x.split("=", 1)[1] for x in sys.argv if x.startswith("--only=")]
    clean_text("--write" in sys.argv, set(_o[0].split(",")) if _o else None)
