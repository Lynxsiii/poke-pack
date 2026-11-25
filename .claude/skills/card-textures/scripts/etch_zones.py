#!/usr/bin/env python3
"""Does an engraved card show its engraving over the painting, and does the foil leave the painting alone?

Noah, 2026-11-25: Mega Rayquaza ex 138/103 "doesn't have texture ... find out why though and don't just hand fix it,
others might be like that", and "sometimes the holo effect looks like it's a little too much". The cause was a class,
not a card: TCG Live's foil map is near zero wherever the ink is heavy (a Pokémon that fills the card), every lit
layer was masked by that map, and so the engraving, which the real card carries edge to edge, only showed on the
frame. The visibility sweep could not see it, because it scores the card as a whole and the frame carried the score.

This gate scores the two zones of every engraved face apart:

    ink zone    where the card's foil map is near zero but its etch map has lines (the painted Pokémon)
    foil zone   where the foil map is open (the frame, a pale background)

    tex    fine-detail change the lit layers make in the zone (the engraving reading as lines), 0-255
    lift   mean absolute change in the zone (how much the foil repaints the print), 0-255

and the whole card: gain (how much lighter the lit card is, 0-255), white (the share of it blown to white) and sat
(its colourfulness lit over unlit: under 1 the foil is greying the print). `--every` scores every face of a family.

For each family it takes the faces with the largest ink zone (the worst case for the class), renders them at phone
size in Safari's engine twice (as the site draws them, and with every foil layer hidden) and fails:

    ink tex under --min-ink-tex             the engraving is missing over the painting (the Rayquaza class)
    ink lift over --max-ink-lift            the foil takes the painting over (a wash, not a shine)

    python3 .claude/skills/card-textures/scripts/etch_zones.py                      # every engraved family
    python3 .claude/skills/card-textures/scripts/etch_zones.py --family me-sir,sv-sir --per 4
    python3 .claude/skills/card-textures/scripts/etch_zones.py --cards me6-138,sv8-238

Writes <out>/zones.json and one lit crop per card in <out>/crops/. Needs PLAYWRIGHT_BROWSERS_PATH pointing at a
WebKit install (the poke-pack-webkit-testing note). A family whose real card is smooth over the painting goes in
etch_zones_allow.json with the reason.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PROBE = os.path.join(HERE, "foil_probe.mjs")
CENSUS = os.path.join(HERE, "foil_census.mjs")
ALLOW = os.path.join(HERE, "etch_zones_allow.json")
HIDE = ".tcg .foil, .tcg .glare, .tcg .cure, .tcg .shine, .tcg .relief { display: none !important }"
POSES = "35:35,65:55"  # both inside the walk the app's own light takes
W, SCALE = 220, 3


def alpha(path, size):
    im = Image.open(os.path.join(ROOT, path))
    ch = im.getchannel("A") if im.mode in ("RGBA", "LA") else im.convert("L")
    return np.asarray(ch.resize(size, Image.BILINEAR), dtype=np.float32) / 255


def zones(card, size=(110, 154)):
    """(ink, foil) boolean masks at `size`, or None when the card has no map pair."""
    if not card.get("foilMap") or not card.get("etchMap"):
        return None
    try:
        foil = alpha(card["foilMap"], size)
        im = Image.open(os.path.join(ROOT, card["etchMap"]))
        ch = im.getchannel("A") if im.mode in ("RGBA", "LA") else im.convert("L")
    except OSError:
        return None
    # lines: local contrast of the etch at its own size, then down to the zone grid
    e = np.asarray(ch, dtype=np.float32)
    blur = np.asarray(ch.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
    lines = Image.fromarray(np.clip(np.abs(e - blur) * 2, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    lines = np.asarray(lines.resize(size, Image.BILINEAR), dtype=np.float32) / 255
    etched = lines > 0.18
    return (foil < 0.12) & etched, (foil > 0.5) & etched


def load_cards():
    out = {}
    for f in os.listdir(os.path.join(ROOT, "data")):
        if not f.endswith(".json"):
            continue
        try:
            d = json.load(open(os.path.join(ROOT, "data", f)))
        except (OSError, ValueError):
            continue
        cards = d if isinstance(d, list) else d.get("cards", []) if isinstance(d, dict) else []
        for c in cards:
            if isinstance(c, dict) and c.get("id"):
                out[c["id"]] = c
    return out


def probe(query, out, css=None, boxes=False, wait=2500):
    cmd = ["node", PROBE, "--query", query, "--out", out, "--width", "1900", "--scale", str(SCALE), "--browser", "webkit",
           "--wait", str(wait)]
    if css:
        cmd += ["--css", css]
    if boxes:
        cmd += ["--boxes"]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-400:] + r.stderr[-400:])
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--family"), ap.add_argument("--cards")
    ap.add_argument("--per", type=int, default=2, help="faces per family, largest ink zone first")
    ap.add_argument("--out", default="/tmp/etch-zones")
    ap.add_argument("--min-ink", type=float, default=0.12, help="smallest ink zone (share of the card) worth scoring")
    ap.add_argument("--min-ink-tex", type=float, default=2.5)
    ap.add_argument("--max-ink-lift", type=float, default=30.0)
    ap.add_argument("--every", action="store_true", help="score every face of the chosen families, not the worst cases")
    ap.add_argument("--css", help="extra CSS for the lit render (to try a change)")
    args = ap.parse_args()
    os.makedirs(os.path.join(args.out, "crops"), exist_ok=True)
    faces = json.loads(subprocess.run(["node", CENSUS], capture_output=True, text=True, cwd=ROOT).stdout)
    cards = load_cards()
    allow = json.load(open(ALLOW)) if os.path.exists(ALLOW) else {}
    want = set(filter(None, (args.cards or "").split(",")))
    fams = set(filter(None, (args.family or "").split(",")))
    by_fam = collections.defaultdict(list)
    for f in faces:
        if f["reverse"] or "has-etch-map" not in f["classes"].split():
            continue
        fam = f["family"] or f"{f['era']}-nofam"
        if want and f["id"] not in want:
            continue
        if fams and fam not in fams:
            continue
        z = zones(cards.get(f["id"], {}))
        if z is None:
            continue
        ink = float(z[0].mean())
        if ink >= args.min_ink or want or args.every:
            by_fam[fam].append((ink, f))
    picks = []
    for fam, rows in sorted(by_fam.items()):
        rows.sort(key=lambda r: -r[0])
        # the worst case and one from the middle of the family's ink-heavy faces
        chosen = rows if want or args.every else [rows[i] for i in sorted({0, *[len(rows) * k // args.per for k in range(1, args.per)]})]
        picks += [(fam, ink, f) for ink, f in chosen]
        print(f"{fam}: {len(rows)} faces with an ink zone, scoring {len(chosen)}", file=sys.stderr)
    per_set = collections.OrderedDict()
    for fam, ink, f in picks:
        per_set.setdefault(f["set"], []).append((fam, ink, f))
    results = []
    for set_id, rows in per_set.items():
        for i in range(0, len(rows), 8):
            chunk = rows[i:i + 8]
            base = os.path.join(args.out, f"{set_id}-{i // 8}")
            q = f"set={set_id}&cards={','.join(str(f['n']) for _, _, f in chunk)}&proof=off&w={W}&poses={POSES}&tilt=0"
            if not (probe(q, base + "-on.png", css=args.css, boxes=True) and probe(q, base + "-off.png", css=HIDE)):
                continue
            on, off = Image.open(base + "-on.png").convert("RGB"), Image.open(base + "-off.png").convert("RGB")
            boxes = json.load(open(base + "-on.boxes.json"))
            by_n = {str(f["n"]): (fam, ink, f) for fam, ink, f in chunk}
            for b in boxes:
                m = re.match(r"site · (\S+) ", b["caption"])
                if not m or m.group(1) not in by_n:
                    continue
                fam, ink, f = by_n[m.group(1)]
                x, y, w, h = [int(round(b[k] * SCALE)) for k in "xywh"]
                a = np.asarray(on.crop((x, y, x + w, y + h)), dtype=np.float32)
                o = np.asarray(off.crop((x, y, x + w, y + h)), dtype=np.float32)
                d = (a - o).mean(axis=2)
                blur = np.asarray(Image.fromarray(np.clip(d + 128, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)),
                                  dtype=np.float32) - 128
                zi, zf = zones(cards[f["id"]], (w, h))
                row = {"id": f["id"], "family": fam, "pose": b["pose"], "ink": ink,
                       "inkTex": float(np.abs(d - blur)[zi].mean()) if zi.any() else 0.0,
                       "inkLift": float(np.abs(a - o).mean(axis=2)[zi].mean()) if zi.any() else 0.0,
                       "foilTex": float(np.abs(d - blur)[zf].mean()) if zf.any() else 0.0,
                       "foilLift": float(np.abs(a - o).mean(axis=2)[zf].mean()) if zf.any() else 0.0,
                       # the whole card: how much lighter it gets, the share blown to white, and the colour it loses
                       "gain": float((a - o).mean()),
                       "white": float(((a.min(axis=2) > 244) & (o.min(axis=2) < 225)).mean()),
                       "sat": float(((a.max(axis=2) - a.min(axis=2)).mean() + 1) / ((o.max(axis=2) - o.min(axis=2)).mean() + 1))}
                results.append(row)
                if b["pose"] == POSES.split(",")[0]:
                    on.crop((x, y, x + w, y + h)).save(os.path.join(args.out, "crops", f["id"] + ".png"))
    json.dump(results, open(os.path.join(args.out, "zones.json"), "w"), indent=1)
    by_card = collections.OrderedDict()
    for r in results:
        by_card.setdefault(r["id"], []).append(r)
    failed = 0
    print(f"{'card':16} {'family':24} {'ink':>5} {'inkTex':>7} {'inkLift':>8} {'foilTex':>8} {'foilLift':>9} {'gain':>6} {'white':>6} {'sat':>5}")
    for cid, rows in sorted(by_card.items(), key=lambda kv: (kv[1][0]["family"], kv[0])):
        g = lambda k: sum(r[k] for r in rows) / len(rows)
        fam = rows[0]["family"]
        flag = ""
        if fam not in allow and cid not in allow:
            if g("inkTex") < args.min_ink_tex and rows[0]["ink"] >= args.min_ink:
                flag += "  NO ENGRAVING OVER THE PAINTING"
            if g("inkLift") > args.max_ink_lift:
                flag += "  FOIL TAKES THE PAINTING OVER"
        failed += bool(flag)
        print(f"{cid:16} {fam:24} {rows[0]['ink']:5.2f} {g('inkTex'):7.2f} {g('inkLift'):8.2f} {g('foilTex'):8.2f} {g('foilLift'):9.2f} {g('gain'):6.1f} {g('white'):6.3f} {g('sat'):5.2f}{flag}")
    print(f"{failed} of {len(by_card)} cards fail; zones.json and crops in {args.out}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
