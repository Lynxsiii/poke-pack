#!/usr/bin/env python3
"""Ship TCG Live's etch at its native size for the sm-shiny faces (2026-11-23).

The Shiny Vault (Hidden Fates SV1-SV80) and Shining Legends' Rare Shining (sm35 9, 27, 40, 42, 56, 57) carried only
400 px etch maps (`<n>-etch.webp`) and Gaussian-softened copies of them (`<n>-etch-arc.webp`, sigma 0.8-1.2), which the
audit of 2026-10-22 found too faint: the crisp straight line engraving that defines the real cards was invisible. Live
has the etch at 733 x 1024 under sm11-5 (SV<n> is number 69 + n) and sm3-5. This fetches each one (curl; the CDN refuses
urllib), builds it the way scripts/native_era_etch.py does (floor stretched to 0, sub-pixel blur, white with the etch as
alpha) and writes assets/foil/fam/sm-shiny/<id>-etch-v1.webp. js/fam/sm-shiny.js (LIVE_ETCH) points `--sms-etch` at it;
data/*.json is left alone. Never overwrites a shipped file. The three Shining promos (smp070, smp079, smp082) are left on
their data maps.

    python3 .claude/skills/card-textures/scripts/fam/sm-shiny/ship_live_etch.py [--cache DIR] [--sigma 0.6]
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
sys.path.insert(0, str(HERE.parents[1]))
from native_era_etch import build  # noqa: E402

BASE = "https://cdn.malie.io/file/malie-io/tcgl/cards/png/en"
OUT = ROOT / "assets" / "foil" / "fam" / "sm-shiny"

CARDS = {f"sm115-SV{n}": ("sm11-5", 69 + n) for n in range(1, 81)}
CARDS.update({f"sm35-{n}": ("sm3-5", n) for n in (9, 27, 40, 42, 56, 57)})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=str(ROOT / ".claude" / "skills" / "card-textures" / "lab" / "cache" / "sm-shiny"))
    ap.add_argument("--sigma", type=float, default=0.6)
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, (key, n) in CARDS.items():
        src = cache / f"{key}-{n:03d}.etch.png"
        if not src.exists():
            url = f"{BASE}/{key}/{key}_en_{n:03d}_std.etch.png"
            if subprocess.run(["curl", "-sfL", "-m", "60", url, "-o", str(src)]).returncode != 0:
                src.unlink(missing_ok=True)
                print(f"{cid}: no etch at {url}")
                continue
        dest = OUT / f"{cid}-etch-v1.webp"
        if dest.exists():
            print(f"{cid}: {dest.name} exists, left as it is")
            continue
        build(src, a.sigma).save(dest, quality=75, alpha_quality=50, method=6)
        print(f"{cid}: wrote {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
