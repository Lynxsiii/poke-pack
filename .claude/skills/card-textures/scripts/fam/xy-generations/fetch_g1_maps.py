"""Fetch Pokemon TCG Live's maps for Generations (g1): the Radiant Collection, the holos and the reverses.

Family xy-generations of the older-era holo remaster (2026-10-01). TCG Live files Generations under two keys
on malie.io's CDN (probed 2026-10-01, HEAD on .../cards/png/en/<key>/<key>_en_<nnn>_<print>.<kind>.png):

- ``xy9-5``  the main set, 001-083 as printed. ``std`` foil maps exist for the holo prints only (005, 027,
  035, 042, 045 and the EX / full arts); ``ph`` (the reverse holo print) has a foil map for every card that
  was printed reverse, which carries Generations' own reverse pattern.
- ``xy9-5r`` the Radiant Collection, 001-032 = RC1-RC32. Every card has a ``std`` foil map, and each map is
  a different picture: the art background, plus a hidden foil drawing in the text box (Charizard RC5's
  snowflakes, Flareon-EX RC6's hearts and its starry black border, Altaria RC24's bubbles). This is what the
  Elite Fourum thread "Heart Reverse Foil Generations" (t/17617) describes: "every card is unique".

This script only downloads into a cache (default: the family scratch folder) and never writes to the repo;
``ship_g1_maps.py`` turns the cache into site assets under assets/foil/fam/xy-generations/.

    python3 fetch_g1_maps.py --cache <dir>            # everything: RC 1-32 std (+ card image), main 1-83 ph and std
    python3 fetch_g1_maps.py --cache <dir> --images   # also the card images TCG Live renders (to check the numbering)

Re-runnable: a file already in the cache, or a miss already recorded as ``.none``, is not fetched again.
"""
from __future__ import annotations

import argparse
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
DEFAULT_CACHE = Path("/tmp/claude-0/-home-user-poke-pack/6032daf4-813b-52e1-a08d-2db4b199665a/scratchpad/xy-generations/tcgl")


def curl(url: str, dest: Path) -> bool:
    # urllib gets a 403 from this CDN; curl is accepted (the shared fetch_foil_maps.py says the same).
    res = subprocess.run(["curl", "-sfL", "-m", "60", url, "-o", str(dest)], capture_output=True)
    if res.returncode != 0:
        dest.unlink(missing_ok=True)
    return res.returncode == 0


def jobs_for(cache: Path, images: bool) -> list[tuple[str, Path]]:
    jobs = []
    kinds = ["foil", "etch"] + (["img"] if images else [])
    for n in range(1, 33):
        for kind in kinds:
            suffix = "png" if kind == "img" else f"{kind}.png"
            url = f"{BASE}/xy9-5r/xy9-5r_en_{n:03d}_std.{suffix}"
            jobs.append((url, cache / f"rc{n}.std.{kind}.png"))
    for n in range(1, 84):
        for variant in ("ph", "std"):
            for kind in ["foil"] + (["img"] if images and variant == "ph" else []):
                suffix = "png" if kind == "img" else f"{kind}.png"
                url = f"{BASE}/xy9-5/xy9-5_en_{n:03d}_{variant}.{suffix}"
                jobs.append((url, cache / f"{n}.{variant}.{kind}.png"))
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--images", action="store_true", help="also fetch TCG Live's card renders")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    todo = [(u, d) for u, d in jobs_for(args.cache, args.images) if not d.exists() and not d.with_suffix(".none").exists()]

    def one(job):
        url, dest = job
        if curl(url, dest):
            return True
        dest.with_suffix(".none").touch()
        return False

    with ThreadPoolExecutor(max_workers=6) as pool:
        got = sum(1 for ok in pool.map(one, todo) if ok)
    print(f"{got} of {len(todo)} files fetched into {args.cache}")


if __name__ == "__main__":
    main()
