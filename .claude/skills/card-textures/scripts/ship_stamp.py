"""Ship a printed mark found by find_overlay.py: the mask into site assets,
the per-card placements onto data/<set>.json.

    python3 .claude/skills/card-textures/scripts/ship_stamp.py --set me55 \
      --placements .claude/skills/card-textures/lab/masks/stamp30.json \
      --mask .claude/skills/card-textures/lab/masks/stamp30.png

Copies the mask to assets/masks/stamp/<name>.png and writes `stampPos` and
`stampSize` (CSS mask-position and mask-size, card fractions) onto every card
the placements cover, removing them from cards they do not. Cards whose
placement is a per-card cut-out (`--cutouts` in find_overlay.py, such as the
Pikachu Rare's big foil stamp) are skipped: that mark is foil, not a hole.
tcgFace() in js/app.js turns the fields into --stamp-mask, --stamp-pos and
--stamp-size plus a `has-stamp` class; css/holo/masks.css knocks the mark
out of the foil where a finish has no per-card foil map.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", required=True)
    ap.add_argument("--placements", required=True, help="the .json find_overlay.py wrote")
    ap.add_argument("--mask", required=True, help="the mark's alpha .png find_overlay.py wrote")
    args = ap.parse_args()

    mask = Path(args.mask)
    dest = ROOT / "assets" / "masks" / "stamp" / mask.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(mask, dest)

    placements = json.loads(Path(args.placements).read_text(encoding="utf-8"))["cards"]
    data_path = ROOT / "data" / f"{args.set}.json"
    raw = data_path.read_text(encoding="utf-8")
    cards = json.loads(raw)
    records = cards if isinstance(cards, list) else cards["cards"]
    changed = placed = 0
    for record in records:
        p = placements.get(record["id"])
        want = {} if not p or p.get("cutout") else {"stampPos": p["position"], "stampSize": p["size"]}
        placed += bool(want)
        for field in ("stampPos", "stampSize"):
            if want.get(field) and record.get(field) != want[field]:
                record[field] = want[field]
                changed += 1
            elif not want.get(field) and field in record:
                record.pop(field)
                changed += 1
    after = json.dumps(cards, ensure_ascii=False, indent=2) + "\n"
    if after != raw:
        data_path.write_text(after, encoding="utf-8", newline="\n")
    print(f"mask -> {dest.relative_to(ROOT)}; {placed} cards placed, {changed} field(s) changed")


if __name__ == "__main__":
    main()
