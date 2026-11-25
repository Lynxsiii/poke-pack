#!/usr/bin/env python3
"""Does every finish on the site visibly show? One card of every finish signature, lit, in Safari's engine.

Noah, 2026-11-23 and 11-25: "a lot of cards lost their etched art", "I just want all the etched and everything like
that to actually work and show the texture". A recipe tuned against photos can end up so quiet that nothing reads on
a phone, and nobody notices until he does. This sweep notices first.

It takes the census of every foil face (foil_census.mjs), groups the faces by signature (era, family, pattern
classes, reverse or not), picks one or two cards per signature, renders them in the lab twice at phone size (as the
site draws them, and with every foil layer hidden) and measures, inside each card, what the foil changes:

    mad     mean absolute change of the print, 0-255 (how much light the foil adds at all)
    tex     mean fine-detail change (the change minus its own blur: etch lines, glitter, bars; a flat wash scores ~0)
    cover   share of the card the foil changes visibly
    white   share of the card the foil blows out to white (a wash, not a shine)

    python3 .claude/skills/card-textures/scripts/foil_visibility.py                 # everything (about an hour)
    python3 .claude/skills/card-textures/scripts/foil_visibility.py --era sv,me     # some eras
    python3 .claude/skills/card-textures/scripts/foil_visibility.py --family sv-holo,sv-ir
    python3 .claude/skills/card-textures/scripts/foil_visibility.py --sets sv4,ex11 # every signature these sets hold

Prints the weakest signatures first and exits 1 when a signature is under the floor (--min-mad, --min-tex) or over
--max-white, unless it is listed in foil_visibility_allow.json (finishes that are matte or mirror-smooth on the real
card, with the reason). Writes <out>/visibility.json (every score) and one contact sheet per render job to look at.

Renders run one at a time by default: a loaded WebKit screenshots before masks decode and reads a working card as
foil-less. Scores from a parallel run (--jobs 3) are a first pass only; re-run the failures alone.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
PROBE = os.path.join(HERE, "foil_probe.mjs")
CENSUS = os.path.join(HERE, "foil_census.mjs")
ALLOW = os.path.join(HERE, "foil_visibility_allow.json")
HIDE = ".tcg .foil, .tcg .glare, .tcg .cure, .tcg .shine, .tcg .relief { display: none !important }"
POSES = "35:35,65:55"  # both inside the walk the app's own light takes (x 18-82%, y 20-68%)


def signature(face):
    cls = " ".join(sorted(c for c in face["classes"].split() if not re.match(r"(cure-|has-stamp)", c)))
    return (face["era"] or "", face["family"], face["pattern"], cls, face["reverse"])


def plan(faces, args):
    groups = collections.OrderedDict()
    for f in faces:
        groups.setdefault(signature(f), []).append(f)
    eras = set(filter(None, (args.era or "").split(",")))
    fams = set(filter(None, (args.family or "").split(",")))
    sets = set(filter(None, (args.sets or "").split(",")))
    per, meta = collections.OrderedDict(), {}
    for key, members in groups.items():
        if eras and key[0] not in eras:
            continue
        if fams and key[1] not in fams:
            continue
        if sets:
            members = [m for m in members if m["set"] in sets]
            if not members:
                continue
        picks = [members[0]] + ([members[len(members) // 2]] if len(members) > 3 else [])
        for f in picks:
            n = str(f["n"])
            if f["reverse"] and not re.match(r"\d", n):
                continue  # the lab only draws r<number> as a reverse
            token = ("r" if f["reverse"] else "") + n
            per.setdefault(f["set"], [])
            if token not in per[f["set"]]:
                per[f["set"]].append(token)
            meta[f"{f['set']}:{token}"] = {
                "era": key[0], "family": key[1], "pattern": key[2], "classes": key[3], "rarity": f["rarity"],
                "name": f["name"], "faces": len(groups[key]),
            }
    jobs = [(s, c[i:i + 8], i // 8) for s, c in per.items() for i in range(0, len(c), 8)]
    return jobs, meta


def probe(query, out, args, css=None, boxes=False):
    cmd = ["node", PROBE, "--query", query, "--out", out, "--width", "1900", "--scale", "2", "--browser", args.browser,
           "--wait", str(args.wait)]
    if css:
        cmd += ["--css", css]
    if boxes:
        cmd += ["--boxes"]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-400:] + r.stderr[-400:])
    return r.returncode == 0


def score(base, set_id, crops=None):
    on = Image.open(base + "-on.png").convert("RGB")
    off = Image.open(base + "-off.png").convert("RGB")
    boxes = json.load(open(base + "-on.boxes.json"))
    rows = []
    for b in boxes:
        x, y, w, h = [int(round(b[k] * 2)) for k in "xywh"]
        inset = int(w * 0.04)
        box = (x + inset, y + inset, x + w - inset, y + h - inset)
        a = np.asarray(on.crop(box), dtype=np.float32)
        o = np.asarray(off.crop(box), dtype=np.float32)
        d = a - o
        dl = d.mean(axis=2)
        blur = np.asarray(Image.fromarray(np.clip(dl + 128, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)),
                          dtype=np.float32) - 128
        m = re.match(r"site · (\S+) ", b["caption"])
        reverse = " reverse " in f" {b['card']} "
        key = f"{set_id}:{'r' if reverse else ''}{m.group(1) if m else '?'}"
        if crops and b["pose"] == POSES.split(",")[0]:  # one lit picture per card, for a gallery
            pic = on.crop((x, y, x + w, y + h))
            pic.thumbnail((260, 400))
            pic.save(os.path.join(crops, key.replace(":", "_") + ".jpg"), quality=80)
        rows.append({
            "key": key, "pose": b["pose"],
            "mad": float(np.abs(d).mean()), "tex": float(np.abs(dl - blur).mean()),
            "cover": float((np.abs(dl) > 6).mean()),
            "white": float(((a.min(axis=2) > 245) & (o.min(axis=2) < 225)).mean()),
        })
    bottom = int(max(b["y"] + b["h"] for b in boxes) * 2) + 20
    sheet = on.crop((0, 0, on.width, min(on.height, bottom)))
    sheet.thumbnail((1900, 2400))
    sheet.save(base + ".jpg", quality=82)
    for suffix in ("-on.png", "-off.png", "-on.boxes.json"):
        os.remove(base + suffix)
    return rows


def run_job(job, args):
    set_id, cards, idx = job
    base = os.path.join(args.out, f"{set_id}-{idx}")
    query = f"set={set_id}&cards={','.join(cards)}&proof=off&w=220&poses={POSES}&tilt=0"
    if not (probe(query, base + "-on.png", args, boxes=True) and probe(query, base + "-off.png", args, css=HIDE)):
        return []
    return score(base, set_id, args.crops)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--era"), ap.add_argument("--family"), ap.add_argument("--sets")
    ap.add_argument("--out", default="/tmp/foil-visibility")
    ap.add_argument("--browser", default="webkit")
    ap.add_argument("--wait", type=int, default=2500)
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--min-mad", type=float, default=3.0)
    ap.add_argument("--min-tex", type=float, default=0.7)
    ap.add_argument("--max-white", type=float, default=0.25)
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--crops", help="also save one lit picture per card into this folder")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    if args.crops:
        os.makedirs(args.crops, exist_ok=True)

    faces = json.loads(subprocess.run(["node", CENSUS], capture_output=True, text=True, cwd=ROOT, check=True).stdout)
    jobs, meta = plan(faces, args)
    print(f"{len(meta)} cards in {len(jobs)} renders", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        rows = [r for part in pool.map(lambda j: run_job(j, args), jobs) for r in part]

    best = {}
    for r in rows:  # a card counts by its better pose
        cur = best.setdefault(r["key"], dict(r))
        for k in ("mad", "tex", "cover"):
            cur[k] = max(cur[k], r[k])
        cur["white"] = max(cur["white"], r["white"])
    allow = json.load(open(ALLOW)) if os.path.exists(ALLOW) else {}
    out, failed = [], 0
    for key, r in best.items():
        m = meta.get(key)
        if not m:
            continue
        label = m["family"] or m["pattern"]
        why = allow.get(label) or allow.get(f"{label}|{m['classes']}")
        bad = r["mad"] < args.min_mad or r["tex"] < args.min_tex or r["white"] > args.max_white
        out.append({**r, **m, "fail": bool(bad and not why), "allowed": why or ""})
        failed += bool(bad and not why)
    out.sort(key=lambda o: (not o["fail"], o["tex"]))
    json.dump(out, open(os.path.join(args.out, "visibility.json"), "w"), indent=1)
    for o in out[:args.top]:
        flag = "FAIL" if o["fail"] else ("ok  " if not o["allowed"] else "skip")
        print(f"{flag} {o['key']:22} mad {o['mad']:5.1f} tex {o['tex']:4.1f} cover {o['cover']:.2f} white {o['white']:.2f} | "
              f"{o['era']} {o['family'] or o['pattern']} | {o['rarity']} | {o['faces']} faces")
    print(f"{failed} of {len(out)} cards under the floor; sheets and visibility.json in {args.out}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
