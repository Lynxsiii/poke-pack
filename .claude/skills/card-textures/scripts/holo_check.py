#!/usr/bin/env python3
"""Check every holo card one by one: does the foil leave each card's art looking good?

Noah, 2026-11-27, after EX Holon Phantoms Rayquaza δ 016/110 came out of a grading slab with its art box buried
under a blue-purple haze: "everytime we do a holo update I want every card quickly checked individually by a agent
no matter what it may be as long as it's smart enough to tell what looks good". The family sweeps pick one or two
cards per finish; a recipe that suits those can still bury the art of the card next to it. This check looks at
every card a change touches, in two steps:

1. Metrics (this script). Every face is rendered in the lab at phone size (220 CSS px x 3) in Safari's engine, at
   rest and lit (35:35), and again with every foil layer hidden (the plain print). Inside the art box and over the
   whole card it measures what the foil does to the print:

       dL      mean change in lightness (CIE L*, 0-100)
       haze    how far the print's darkest quarter is lifted (L*): a wash greys the shadows first
       con     contrast lit over plain (std of L*): under 1 the foil flattens the art
       keep    correlation of the art's own fine detail lit vs plain, 0-1: low means the foil buries the drawing
       tint    shift of the mean colour (a*, b*): a cast over the whole box, with its hue angle
       sat     chroma lit over plain

   It flags a card whose art box is hazed, flattened, buried or tinted past the floors below, or that is an
   outlier inside its own family (robust z over 3.5), and writes for every card a side-by-side crop
   (plain | rest | lit) for the vision step, plus contact sheets of the flagged ones.

2. Vision review (an agent step, see SKILL.md "Every card, every holo update"). A capable vision model looks at
   EVERY card's crop that the change touches, flagged or not, beside a real photo where one exists, and answers
   per card: good, or what is wrong. The metrics only order the queue; they never pass a card on their own.

    python3 holo_check.py --sets ex13,js12a                 # every holo face of these sets
    python3 holo_check.py --family ex-delta-holon,sv-sir    # every face of these families
    python3 holo_check.py --changed                         # every face whose family or sheet differs from master
    python3 holo_check.py --all --skip-reverse              # every holo face on the site (about 3 h with --jobs 3)
    python3 holo_check.py --cards ex13-16,js12a-214

Output in --out (default /tmp/holo-check): check.json (every score), flagged.json, crops/<id>.jpg,
sheets/flagged-NN.jpg, review/batch-NNN.jpg + review/batch-NNN.json (every card of the run, 12 per sheet, for
the agents). Renders resume: a cut-off run picks up where it stopped. Needs PLAYWRIGHT_BROWSERS_PATH pointing
at a WebKit install (the poke-pack-webkit-testing note).
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
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
RENDER = os.path.join(HERE, "holo_check_render.mjs")
CENSUS = os.path.join(HERE, "foil_census.mjs")
LIT = "35:35"
PER_JOB = 30

# Floors on the art box, lit. Tuned on the 2026-11-27 run (see SKILL.md); a real holo adds light and texture but
# keeps the drawing: its darks stay dark, its contrast holds, its own detail stays put, and it carries no cast.
FLOORS = {"haze": 9.0, "con": 0.72, "keep": 0.55, "tint": 9.0, "rest_haze": 6.0, "rest_keep": 0.75}
FULL_ART = re.compile(r"foil-(sir|ir|ultra|gold|future)|swsh-(alt|tfa|vfa|rainbow|gold)|sm-(fa|tfa|rainbow|gold)|"
                      r"full-art|fullart|foil-bwr")


def art_box(face, w, h):
    """The art box in card pixels: the whole face inside its border for a full art, else the art window."""
    if FULL_ART.search(face.get("pattern", "") + " " + face.get("classes", "")):
        return (int(w * .05), int(h * .04), int(w * .95), int(h * .96))
    era = face.get("era") or ""
    if era in ("wotc",):
        return (int(w * .11), int(h * .11), int(w * .89), int(h * .48))
    if era in ("ex", "dp"):
        return (int(w * .08), int(h * .10), int(w * .92), int(h * .47))
    return (int(w * .08), int(h * .10), int(w * .92), int(h * .50))


def to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def highpass(L):
    im = Image.fromarray(np.clip(L * 2.55, 0, 255).astype(np.uint8))
    return L - np.asarray(im.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 2.55


def measure(on, off):
    a, o = to_lab(np.asarray(on, np.float32)), to_lab(np.asarray(off, np.float32))
    La, Lo = a[..., 0], o[..., 0]
    dark = Lo <= np.percentile(Lo, 25)
    ha, ho = highpass(La).ravel(), highpass(Lo).ravel()
    keep = float(np.corrcoef(ha, ho)[0, 1]) if ho.std() > 0.3 and ha.std() > 0.3 else 1.0
    # medians, so a light band crossing the box (a real foil's highlight) does not count as a wash over it
    da, db = float(np.median(a[..., 1] - o[..., 1])), float(np.median(a[..., 2] - o[..., 2]))
    ca, co = np.hypot(a[..., 1], a[..., 2]).mean(), np.hypot(o[..., 1], o[..., 2]).mean()
    return {
        "dL": float(np.median(La - Lo)), "haze": float(np.percentile(La[dark] - Lo[dark], 65)),
        "wash": float(((La - Lo) > 6).mean()),
        "con": float(La.std() / max(Lo.std(), 1e-3)), "keep": keep,
        "tint": float(np.hypot(da, db)), "hue": float(np.degrees(np.arctan2(db, da)) % 360),
        "sat": float(ca / max(co, 1e-3)),
    }


def face_key(f):
    tok = token(f)
    return f"{f['set']}:{tok}" if tok else None


def token(f):
    n = str(f["n"])
    suffix = f["id"][len(f["set"]) + 1 + len(n):] if f["id"].startswith(f"{f['set']}-{n}") else ""
    if f["reverse"]:
        return ("r" + n) if re.match(r"\d", n) else None
    if "foil-rev-pokeball" in f["pattern"]:
        return n + "-pb"
    if "foil-rev-masterball" in f["pattern"]:
        return n + "-mb"
    return n + suffix


def select(faces, args):
    fams = set(filter(None, (args.family or "").split(",")))
    sets = set(filter(None, (args.sets or "").split(",")))
    cards = set(filter(None, (args.cards or "").split(",")))
    if args.changed:
        fams |= changed_families(faces)
        print(f"changed families: {', '.join(sorted(fams)) or 'none'}", file=sys.stderr)
    out = []
    for f in faces:
        if args.skip_reverse and f["reverse"]:
            continue
        if args.all or (f["set"] in sets) or (f["family"] in fams) or (f["id"] in cards):
            if token(f):
                out.append(f)
    return out


def changed_families(faces):
    """Families whose css/js/assets differ from origin/master, plus every family when a shared sheet changed."""
    diff = subprocess.run(["git", "diff", "--name-only", "origin/master...HEAD"], capture_output=True, text=True,
                          cwd=ROOT).stdout.split()
    diff += subprocess.run(["git", "diff", "--name-only"], capture_output=True, text=True, cwd=ROOT).stdout.split()
    fams, everything = set(), False
    known = {f["family"] for f in faces if f["family"]}
    for p in diff:
        m = re.search(r"(?:css/holo/fam|js/fam|assets/foil/fam)/([a-z0-9-]+)", p)
        if m and m.group(1).replace(".css", "").replace(".js", "") in known:
            fams.add(m.group(1).replace(".css", "").replace(".js", ""))
        elif re.match(r"(css/holo/|js/foil-maps\.js|js/[a-z]+-foil\.js|js/app\.js)", p):
            everything = True
        elif m2 := re.match(r"(?:data|assets/foil/maps)/([a-z0-9]+)", p):
            fams |= {f["family"] or f"set:{m2.group(1)}" for f in faces if f["set"] == m2.group(1)}
    if everything:
        print("a shared sheet or classifier changed: every face is affected; pass --all, or narrow with --sets",
              file=sys.stderr)
    return fams


def plan(selected):
    per = collections.OrderedDict()
    for f in selected:
        per.setdefault(f["set"], [])
        t = token(f)
        if t not in per[f["set"]]:
            per[f["set"]].append(t)
    return [{"tag": f"{s}-{i // PER_JOB}", "set": s, "cards": toks[i:i + PER_JOB]}
            for s, toks in per.items() for i in range(0, len(toks), PER_JOB)]


def render(jobs, args):
    os.makedirs(args.renders, exist_ok=True)
    chunks = [jobs[i::args.jobs] for i in range(args.jobs)]

    def run(i):
        if not chunks[i]:
            return
        jf = os.path.join(args.renders, f"jobs-{i}.json")
        json.dump(chunks[i], open(jf, "w"))
        subprocess.run(["node", RENDER, "--jobs", jf, "--out", args.renders, "--poses", f"rest,{LIT}"], cwd=ROOT)
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(run, range(args.jobs)))


def score_job(job, by_key, args):
    base = os.path.join(args.renders, job["tag"])
    try:
        meta = json.load(open(base + ".boxes.json"))
        on, off = Image.open(base + "-on.png").convert("RGB"), Image.open(base + "-off.png").convert("RGB")
    except OSError:
        return []
    s = meta["scale"]
    cells = collections.defaultdict(dict)
    for b in meta["boxes"]:
        if not b.get("token"):
            continue
        box = tuple(int(round(v * s)) for v in (b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]))
        cells[b["token"]][b["pose"]] = box
    rows = []
    for tok, poses in cells.items():
        key = f"{job['set']}:{tok}"
        face = by_key.get(key)
        if not face or "rest" not in poses or LIT not in poses:
            continue
        plain = off.crop(poses[LIT])
        rest, lit = on.crop(poses["rest"]), on.crop(poses[LIT])
        w, h = plain.size
        ab = art_box(face, w, h)
        r = {"key": key, "id": face["id"], "name": face["name"], "rarity": face["rarity"], "era": face["era"],
             "family": face["family"] or f"({face['pattern']})", "reverse": face["reverse"],
             "classes": face["classes"], "pattern": face["pattern"],
             "art": measure(lit.crop(ab), plain.crop(ab)), "card": measure(lit, plain),
             "rest": measure(rest.crop(ab), plain.crop(ab))}
        trip = Image.new("RGB", (w * 3 + 16, h), "white")
        for i, im in enumerate((plain, rest, lit)):
            trip.paste(im, (i * (w + 8), 0))
        trip.thumbnail((990, 460))
        trip.save(os.path.join(args.out, "crops", key.replace(":", "_") + ".jpg"), quality=84)
        rows.append(r)
    if not args.keep_renders:
        for suffix in ("-on.png", "-off.png"):
            try:
                os.remove(base + suffix)
            except OSError:
                pass
    return rows


def flag(rows):
    fam = collections.defaultdict(list)
    for r in rows:
        fam[r["family"]].append(r)
    for members in fam.values():
        stats = {}
        for k in ("haze", "con", "keep", "tint"):
            v = np.array([m["art"][k] for m in members])
            med = float(np.median(v))
            mad = max(float(np.median(np.abs(v - med))) * 1.4826, {"haze": 1.5, "con": .04, "keep": .03, "tint": 1.5}[k])
            stats[k] = (med, mad)
        for r in members:
            a, rest, why = r["art"], r["rest"], []
            if a["haze"] > FLOORS["haze"]:
                why.append(f"art hazed: darks lifted {a['haze']:.1f} L*")
            if a["con"] < FLOORS["con"]:
                why.append(f"art flattened: contrast x{a['con']:.2f}")
            if a["keep"] < FLOORS["keep"]:
                why.append(f"art buried: detail kept {a['keep']:.2f}")
            if a["tint"] > FLOORS["tint"]:
                why.append(f"art tinted {a['tint']:.1f} at hue {a['hue']:.0f}")
            if rest["haze"] > FLOORS["rest_haze"]:
                why.append(f"hazed at rest: darks lifted {rest['haze']:.1f} L*")
            if "has-etch-tile" in r.get("classes", ""):
                why.append("on the shared hatch tile: needs its own etch (make_card_etch.py)")
            if rest["keep"] < FLOORS["rest_keep"]:
                why.append(f"buried at rest: detail kept {rest['keep']:.2f}")
            if len(members) >= 8:
                for k, sign in (("haze", 1), ("tint", 1), ("con", -1), ("keep", -1)):
                    med, mad = stats[k]
                    z = sign * (a[k] - med) / mad
                    if z > 3.5 and abs(a[k] - med) > {"haze": 3, "tint": 3, "con": .08, "keep": .08}[k]:
                        why.append(f"outlier in family on {k} (z {z:.1f})")
            r["flags"] = why
            r["severity"] = (max(0, a["haze"] - 4) + max(0, (1 - a["con"]) * 20) + max(0, (0.9 - a["keep"]) * 30)
                             + max(0, a["tint"] - 4) + max(0, rest["haze"] - 3) * 1.5 + len(why) * 2)
    return rows


def sheet(rows, path, title, cols=4):
    if not rows:
        return
    tiles = []
    for r in rows:
        try:
            im = Image.open(os.path.join(OUT, "crops", r["key"].replace(":", "_") + ".jpg"))
        except OSError:
            continue
        cap = Image.new("RGB", (im.width, im.height + 40), "white")
        cap.paste(im, (0, 40))
        d = ImageDraw.Draw(cap)
        d.text((4, 2), f"{r['id']}  {r['name']}  [{r['rarity']}]  {r['family']}"[:150], fill="black")
        d.text((4, 20), ("; ".join(r.get("flags", [])) or "plain | rest | lit")[:150], fill=(170, 0, 0))
        tiles.append(cap)
    tw, th = max(t.width for t in tiles), max(t.height for t in tiles)
    cols = min(cols, len(tiles))
    rows_n = (len(tiles) + cols - 1) // cols
    out = Image.new("RGB", (tw * cols, th * rows_n + 30), "white")
    ImageDraw.Draw(out).text((6, 8), title, fill="black")
    for i, t in enumerate(tiles):
        out.paste(t, ((i % cols) * tw, 30 + (i // cols) * th))
    out.save(path, quality=82)


def main():
    global OUT
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--sets"), ap.add_argument("--family"), ap.add_argument("--cards")
    ap.add_argument("--all", action="store_true"), ap.add_argument("--changed", action="store_true")
    ap.add_argument("--skip-reverse", action="store_true")
    ap.add_argument("--out", default="/tmp/holo-check")
    ap.add_argument("--renders", help="where the raw renders go (default <out>/renders)")
    ap.add_argument("--jobs", type=int, default=2, help="WebKit processes at once")
    ap.add_argument("--keep-renders", action="store_true")
    ap.add_argument("--score-only", action="store_true", help="score renders already on disk")
    args = ap.parse_args()
    OUT = args.out
    args.renders = args.renders or os.path.join(args.out, "renders")
    for d in ("crops", "sheets", "review"):
        os.makedirs(os.path.join(args.out, d), exist_ok=True)

    faces = json.loads(subprocess.run(["node", CENSUS], capture_output=True, text=True, cwd=ROOT, check=True).stdout)
    selected = select(faces, args)
    by_key = {face_key(f): f for f in selected}
    jobs = plan(selected)
    print(f"{len(by_key)} faces in {len(jobs)} renders", file=sys.stderr)
    if not args.score_only:
        render(jobs, args)
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = [r for part in pool.map(lambda j: score_job(j, by_key, args), jobs) for r in part]
    old = os.path.join(args.out, "check.json")
    if os.path.exists(old):  # merge with earlier scored parts of a resumed run
        seen = {r["key"] for r in rows}
        rows += [r for r in json.load(open(old)) if r["key"] not in seen]
    rows = flag(rows)
    rows.sort(key=lambda r: -r["severity"])
    json.dump(rows, open(old, "w"), indent=0)
    flagged = [r for r in rows if r["flags"]]
    json.dump(flagged, open(os.path.join(args.out, "flagged.json"), "w"), indent=1)
    for i in range(0, len(flagged), 12):
        sheet(flagged[i:i + 12], os.path.join(args.out, "sheets", f"flagged-{i // 12:02d}.jpg"),
              f"flagged {i + 1}-{min(i + 12, len(flagged))} of {len(flagged)} (plain | rest | lit)")
    ordered = sorted(rows, key=lambda r: r["key"])
    for i in range(0, len(ordered), 12):
        part = ordered[i:i + 12]
        sheet(part, os.path.join(args.out, "review", f"batch-{i // 12:03d}.jpg"), f"review batch {i // 12}")
        json.dump([{"id": r["id"], "key": r["key"], "name": r["name"], "rarity": r["rarity"], "family": r["family"],
                    "flags": r["flags"]} for r in part],
                  open(os.path.join(args.out, "review", f"batch-{i // 12:03d}.json"), "w"), indent=1)
    for r in flagged[:40]:
        a = r["art"]
        print(f"{r['id']:16} {r['family'][:26]:26} haze {a['haze']:5.1f} con {a['con']:.2f} keep {a['keep']:.2f} "
              f"tint {a['tint']:4.1f} rest-haze {r['rest']['haze']:4.1f} | {'; '.join(r['flags'])}")
    print(f"{len(flagged)} of {len(rows)} faces flagged; {args.out}/sheets and review/ for the vision step",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
