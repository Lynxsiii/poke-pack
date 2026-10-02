"""Fetch Pokemon TCG Live's reverse-holo foil maps for the XY main sets (xy1-xy11) and Double Crisis (dc1).

Family xy-reverse of the older-era holo remaster (2026-10-02). TCG Live files each print of a card under
.../cards/png/en/<key>/<key>_en_<nnn>_<print>.foil.png, key = the set id (xy1..xy11), Double Crisis = xy5-5;
``ph`` is the reverse holo print (probed 2026-10-02: 200 for every card the reverse slot can deal, 404 for
EX / Mega / full arts, which have no reverse; xy0 and the Kalos Starter Set are not on the CDN).

Only downloads into a cache (never writes to the repo); ship_xy_rev_maps.py turns the cache into site assets.

    python3 fetch_xy_rev_maps.py [--cache DIR]

Re-runnable: a file in the cache, or a miss recorded as ``.none``, is not fetched again.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
DEFAULT_CACHE = Path("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-reverse/tcgl")
SETS = {f"xy{n}": f"xy{n}" for n in range(1, 12)} | {"dc1": "xy5-5"}


def curl(url: str, dest: Path) -> bool:
    res = subprocess.run(["curl", "-sfL", "-m", "60", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
    return res.returncode == 0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--reverse", action="store_true", help="walk the card list backwards (a second worker from the other end)")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    jobs = []
    for sid, key in SETS.items():
        for c in json.loads((ROOT / "data" / f"{sid}.json").read_text()):
            n = str(c.get("number", ""))
            if not n.isdigit():
                continue
            dest = args.cache / f"{sid}-{n}.ph.foil.png"
            if not dest.exists() and not dest.with_suffix(".none").exists():
                jobs.append((f"{BASE}/{key}/{key}_en_{int(n):03d}_ph.foil.png", dest))

    if args.reverse:
        jobs.reverse()

    def one(job):
        url, dest = job
        if curl(url, dest):
            return True
        dest.with_suffix(".none").touch()
        return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        got = sum(1 for ok in pool.map(one, jobs) if ok)
    print(f"{got} of {len(jobs)} files fetched into {args.cache}")


if __name__ == "__main__":
    main()
