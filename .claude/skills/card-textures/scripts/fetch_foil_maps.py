"""Download TCG Live's per-card foil and etch maps into the lab's local cache.

These maps say exactly which parts of a printed card are foil (white), partly
foil (grey) or plain (black), and for etched cards where the texture is cut.
They are the most accurate reference there is, and the lab can use them as
masks to show what a texture looks like on the right area.

They are third-party files, and this repo does not ship them (see
reference/masks.md). The cache folder is gitignored and never deployed: use
the maps to measure, to check your own masks, and to judge a recipe, not as
site assets, unless Noah decides otherwise.

    python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --key me5-5 --cards 12,14,23,147
    python3 .claude/skills/card-textures/scripts/fetch_foil_maps.py --key me5-5 --all

Writes lab/cache/<key>/<n>.foil.png and <n>.etch.png (etch only exists for
etched prints). Card numbers are the TCG Live numbers, which match the site's
numeric card numbers for sets TCG Live carries (me55 is me5-5). Index of keys:
https://cdn.malie.io/file/malie-io/tcgl/export/index.json
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "lab" / "cache"
BASE = "https://cdn.malie.io/file/malie-io/tcgl"


def curl(url: str, dest: Path | None = None) -> bytes | None:
    # urllib gets a 403 from this CDN; curl is accepted.
    cmd = ["curl", "-sfL", url] + (["-o", str(dest)] if dest else [])
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        return None
    return res.stdout if dest is None else b"ok"


def set_size(key: str) -> int:
    index = json.loads(curl(f"{BASE}/export/index.json") or b"{}")
    entry = index.get("en-US", {}).get(key)
    if not entry:
        sys.exit(f"no set '{key}' in the TCG Live index")
    return int(entry["num"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key", required=True, help="TCG Live set key, e.g. me5-5")
    ap.add_argument("--cards", default="", help="comma-separated card numbers")
    ap.add_argument("--all", action="store_true", help="every card in the set")
    args = ap.parse_args()

    numbers = [n.strip() for n in args.cards.split(",") if n.strip()]
    if args.all:
        numbers = [str(n) for n in range(1, set_size(args.key) + 1)]
    if not numbers:
        sys.exit("give --cards or --all")

    out = CACHE / args.key
    out.mkdir(parents=True, exist_ok=True)
    got = 0
    for n in numbers:
        for kind in ("foil", "etch"):
            dest = out / f"{n}.{kind}.png"
            if dest.exists():
                continue
            url = f"{BASE}/cards/png/en/{args.key}/{args.key}_en_{int(n):03d}_std.{kind}.png"
            if curl(url, dest):
                got += 1
            else:
                dest.unlink(missing_ok=True)
    print(f"{got} new maps in {out}")


if __name__ == "__main__":
    main()
