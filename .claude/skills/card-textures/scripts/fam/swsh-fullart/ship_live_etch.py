#!/usr/bin/env python3
"""Ship TCG Live's etch at its native size for the swsh-fullart faces that had none (2026-10-22).

Thirteen faces of the family carried only the blurred, grained `-etch-v3` map (the "camouflage blotches" the era note
warns about) and Judge (Silver Tempest TG25) only the shared engraving tile, which ignores the drawing. Live has the
etch for all of them under the Black Star promo key (swshbsp <n>) and the Trainer Gallery key (swsh12a 025). This
fetches each one (curl; the CDN refuses urllib), builds it the way scripts/native_era_etch.py does (floor stretched to
0, sigma 0.6, white with the etch as alpha) and writes assets/foil/fam/swsh-fullart/<id>-etch-v1.webp. The family module
(js/fam/swsh-fullart.js, LIVE_ETCH) points `--fa-etch` at it; data/*.json is left alone. Never overwrites a shipped file.

    python3 .claude/skills/card-textures/scripts/fam/swsh-fullart/ship_live_etch.py [--cache DIR]
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
OUT = ROOT / "assets" / "foil" / "fam" / "swsh-fullart"

# site id -> (Live key, Live number)
CARDS = {
    "swsh35-swshp050": ("swshbsp", 50),
    "swsh45-swshp084": ("swshbsp", 84),
    "swsh45-swshp085": ("swshbsp", 85),
    "swsh45-swshp086": ("swshbsp", 86),
    "swsh45-swshp096": ("swshbsp", 96),
    "swsh45-swshp098": ("swshbsp", 98),
    "pgo-swshp226": ("swshbsp", 226),
    "pgo-swshp227": ("swshbsp", 227),
    "pgo-swshp228": ("swshbsp", 228),
    "pgo-swshp229": ("swshbsp", 229),
    "swsh12pt5-swshp292": ("swshbsp", 292),
    "swsh12pt5-swshp293": ("swshbsp", 293),
    "swsh12-TG25": ("swsh12a", 25),
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=str(ROOT / ".claude" / "skills" / "card-textures" / "lab" / "cache" / "swsh-fullart"))
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
        build(src, 0.6).save(dest, quality=75, alpha_quality=50, method=6)
        print(f"{cid}: wrote {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
