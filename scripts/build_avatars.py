#!/usr/bin/env python3
"""Build the profile picture catalogue: js/avatar-dex.js and the thumbnail sheets.

    python3 scripts/build_avatars.py --cache /tmp/avatar-cache

Every Pokémon and its forms, from the public PokeAPI data and sprite repos:
which pictures exist for each (official art, pixel sprite, animated sprite,
and the shiny of each), its English name, and where it sits on its group's
thumbnail sheet. The picker (js/avatar-picker.js) shows the sheets, so a
thousand faces cost a dozen images instead of a thousand 120 KB downloads.

The cache holds the downloaded art and the answers about which sprites exist;
delete it to ask again. Sheets are written as assets/avatars/<group>-vN.webp
and never overwritten in place: bump VERSION when the art changes.
"""
import argparse, csv, io, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

VERSION = 1
CELL = 80
COLS = 12
ROOT = Path(__file__).resolve().parent.parent
DATA = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
KINDS = {  # flag bit -> path under SPRITES
    1: "other/official-artwork/{id}.png",
    2: "other/official-artwork/shiny/{id}.png",
    4: "{id}.png",
    8: "shiny/{id}.png",
    16: "other/showdown/{id}.gif",
    32: "other/showdown/shiny/{id}.gif",
}
REGIONS = {"alola": "Alolan", "galar": "Galarian", "hisui": "Hisuian", "paldea": "Paldean"}
# Looks that are the same picture as the base Pokémon, or not a Pokémon look at all.
SKIP_WORDS = ("totem", "-cap", "starter", "cosplay", "pikachu-rock-star", "pikachu-belle", "pikachu-pop-star",
              "pikachu-phd", "pikachu-libre", "-busted", "-hangry", "koraidon-", "miraidon-", "-own-tempo",
              "-battle-bond", "-power-construct", "zarude-dada", "rockruff", "-low-key-gmax", "-dudunsparce")


def curl(url, out=None, head=False):
    cmd = ["curl", "-s", "-f", "--retry", "3", "--retry-all-errors"]
    if head:
        cmd += ["-I", "-o", os.devnull, "-w", "%{http_code}"]
    elif out:
        cmd += ["-o", str(out)]
    res = subprocess.run(cmd + [url], capture_output=True)
    if head:
        return res.stdout.decode().strip()
    return res.stdout if not out else res.returncode == 0


def table(cache, name):
    path = cache / f"{name}.csv"
    if not path.exists():
        curl(DATA + f"{name}.csv", path)
    return list(csv.DictReader(open(path, encoding="utf8")))


def title(slug):
    return " ".join(w.capitalize() for w in slug.split("-"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(ROOT / ".avatar-cache"))
    args = ap.parse_args()
    cache = Path(args.cache)
    for sub in ("raw/art", "raw/arts"):
        (cache / sub).mkdir(parents=True, exist_ok=True)

    pokemon = table(cache, "pokemon")
    species = {r["id"]: r for r in table(cache, "pokemon_species")}
    names = {r["pokemon_species_id"]: r["name"] for r in table(cache, "pokemon_species_names") if r["local_language_id"] == "9"}
    forms = {}
    for r in table(cache, "pokemon_forms"):
        forms.setdefault(r["pokemon_id"], r)
    form_names = {r["pokemon_form_id"]: r for r in table(cache, "pokemon_form_names") if r["local_language_id"] == "9"}

    # Which sprites exist. The two art kinds are downloaded (the sheets need them); the rest are asked for.
    probe_path = cache / "probe.json"
    probe = json.loads(probe_path.read_text()) if probe_path.exists() else {}

    def fetch(job):
        pid, bit = job
        key = f"{pid}:{bit}"
        if key in probe:
            return
        url = SPRITES + KINDS[bit].format(id=pid)
        if bit in (1, 2):
            out = cache / ("raw/art" if bit == 1 else "raw/arts") / f"{pid}.png"
            probe[key] = out.exists() and out.stat().st_size > 200 or bool(curl(url, out))
        else:
            code = curl(url, head=True)
            if code in ("200", "404"):
                probe[key] = code == "200"

    jobs = [(r["id"], bit) for r in pokemon for bit in KINDS]
    for _ in range(3):  # a few passes: a dropped connection leaves a gap
        with ThreadPoolExecutor(24) as pool:
            list(pool.map(fetch, jobs))
        if all(f"{p}:{b}" in probe for p, b in jobs):
            break
    probe_path.write_text(json.dumps(probe))

    groups = {}  # key -> list of entries
    order = [f"g{n}" for n in range(1, 10)] + ["mega", "regional", "forms"]
    for r in pokemon:
        pid, slug, sid = r["id"], r["identifier"], r["species_id"]
        flags = sum(bit for bit in KINDS if probe.get(f"{pid}:{bit}"))
        if not flags & 1:
            continue
        base = names.get(sid, title(slug))
        if int(pid) <= 10000:
            key, name = f"g{species[sid]['generation_id']}", base
        else:
            if any(w in slug for w in SKIP_WORDS):
                continue
            form = forms.get(pid, {})
            ident = form.get("form_identifier", "")
            fname = form_names.get(form.get("id", ""), {})
            region = next((word for part, word in REGIONS.items() if part in ident.split("-")), None)
            if form.get("is_mega") == "1" or "primal" in ident:
                key = "mega"
            elif region:
                key = "regional"
            else:
                key = "forms"
            name = fname.get("pokemon_name") or (f"{base} ({fname['form_name']})" if fname.get("form_name") else f"{base} ({title(ident)})")
            if region and "pokemon_name" not in fname:
                name = f"{region} {base}"
        groups.setdefault(key, []).append([int(pid), name, flags, int(sid)])

    out_dir = ROOT / "assets" / "avatars"
    out_dir.mkdir(parents=True, exist_ok=True)

    def thumb(path):
        im = Image.open(path).convert("RGBA")
        box = im.getbbox()
        if box:
            im = im.crop(box)
        im.thumbnail((CELL - 6, CELL - 6), Image.LANCZOS)
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        cell.paste(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
        return cell

    total = 0
    for key in order:
        rows = groups.get(key, [])
        if key in ("mega", "regional", "forms"):
            rows.sort(key=lambda e: (e[3], e[0]))
        else:
            rows.sort(key=lambda e: e[0])
        height = -(-len(rows) // COLS) * CELL
        for kind, sub in (("art", "raw/art"), ("shiny", "raw/arts")):
            sheet = Image.new("RGBA", (COLS * CELL, height), (0, 0, 0, 0))
            for i, (pid, _, flags, _) in enumerate(rows):
                src = cache / sub / f"{pid}.png"
                if kind == "shiny" and not flags & 2:
                    src = cache / "raw/art" / f"{pid}.png"
                sheet.paste(thumb(src), ((i % COLS) * CELL, (i // COLS) * CELL))
            dest = out_dir / f"{kind}-{key}-v{VERSION}.webp"
            sheet.save(dest, "WEBP", quality=80, method=6)
            total += dest.stat().st_size
        print(key, len(rows))

    labels = {"mega": "Mega", "regional": "Regional", "forms": "Forms", **{f"g{n}": f"Gen {n}" for n in range(1, 10)}}
    lines = [
        "// GENERATED by scripts/build_avatars.py. Do not edit.",
        "// Every profile picture: [id, name, flags]. Flags: 1 art, 2 shiny art, 4 pixel, 8 shiny pixel, 16 animated, 32 shiny animated.",
        "// An entry's place in its group is its cell on the group's thumbnail sheet (assets/avatars/<art|shiny>-<group>-vN.webp).",
        f"export const AVATAR_SHEET = {{ version: {VERSION}, cols: {COLS}, cell: {CELL} }};",
        "export const AVATAR_GROUPS = [",
    ]
    for key in order:
        rows = groups.get(key, [])
        body = ",".join(json.dumps([pid, name, flags], ensure_ascii=False, separators=(",", ":")) for pid, name, flags, _ in rows)
        lines.append(f'  {{ id: "{key}", name: "{labels[key]}", list: [{body}] }},')
    lines.append("];")
    (ROOT / "js" / "avatar-dex.js").write_text("\n".join(lines) + "\n", encoding="utf8")
    count = sum(len(groups.get(k, [])) for k in order)
    print(f"{count} pictures, sheets {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
