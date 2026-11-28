#!/usr/bin/env python3
"""Per-card shine regression gate: does any card show less holo than it did before?

holo_check.py records, for every face, `shine` (mean colour change the foil makes) and `texadd` (structure it adds),
at rest (art box) and lit (whole card). Render the same cards twice, once on the baseline (the last version Noah
saw and accepted, e.g. a worktree of origin/master) and once with the change, then:

    shine_gate.py <baseline>/check.json <candidate>/check.json [--drop 0.15]

Fails (exit 1) on any card whose lit shine, lit texture or resting shine drops by more than --drop (15%) of its
baseline value. Quieting a wash is allowed only where it keeps the texture: a card may lose lit shine only if its
texadd does not fall (`--allow-shine-for-texture`). Written after round 2 (2026-11-28) made most holos look like
the plain print while passing every fault check ("where is the holo on Japanese cards").
"""
import argparse, json, sys


def load(p):
    rows = json.load(open(p))
    rows = rows["rows"] if isinstance(rows, dict) and "rows" in rows else rows
    return {r["key"]: r for r in rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("baseline"); ap.add_argument("candidate")
    ap.add_argument("--drop", type=float, default=0.15)
    ap.add_argument("--allow-shine-for-texture", action="store_true")
    a = ap.parse_args()
    base, cand = load(a.baseline), load(a.candidate)
    fails, n = [], 0
    for k, c in cand.items():
        b = base.get(k)
        if not b or "shine" not in b.get("card", {}):
            continue
        n += 1
        why = []
        for zone, metric, label in (("card", "shine", "lit shine"), ("card", "texadd", "lit texture"),
                                    ("rest", "shine", "rest shine")):
            bv, cv = b[zone][metric], c[zone][metric]
            if bv > 0.5 and cv < bv * (1 - a.drop):
                if (a.allow_shine_for_texture and metric == "shine" and zone == "card"
                        and c["card"]["texadd"] >= b["card"]["texadd"]):
                    continue
                why.append(f"{label} {bv:.1f} -> {cv:.1f}")
        if why:
            fails.append((k, c.get("name", ""), c.get("family", ""), why))
    for k, name, fam, why in fails:
        print(f"{k:18} {fam:24} {name[:28]:28} " + "; ".join(why))
    print(f"{len(fails)} of {n} cards lost shine (baseline {a.baseline})", file=sys.stderr)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
