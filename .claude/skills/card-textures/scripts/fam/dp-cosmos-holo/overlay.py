"""dp-cosmos-holo, cut-out review sheet: the art window of each card with the foil area (window minus Pokemon) tinted blue.

    python3 overlay.py out.png MASKDIR id [id ...]        # MASKDIR holds <id>.npz (auto_mask.py / hand_mask.py pick format)
env TW = tile width in px (default 190), PER = tiles per row (default 8), ROOT = repo root.
The Pokemon keeps its own colours, everything the foil will cover is dark blue: a part of the creature that is dimmed needs another click
(hand_mask.py), a patch of sky that is bright was taken for the creature."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import auto_mask as A, gen_maps as G
ROOT = os.environ.get("ROOT", "/home/user/poke-pack")
rows = {r["id"]: r for r in json.load(open(os.path.join(HERE, "census.json")))}
out, md, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
TW = int(os.environ.get("TW", 190)); PER = int(os.environ.get("PER", 8)); tiles = []
for cid in ids:
    r = rows[cid]
    crop, box, win = A.window_crop(r)
    im = Image.open(f"{ROOT}/{r['img']}").convert("RGB")
    fw = np.asarray(Image.open(f"{ROOT}/{r['map']}").convert("RGBA").resize(im.size))[..., 3].astype(np.float32) / 255
    poke = G.poke_soft(f"{md}/{cid}.npz", (im.height, im.width), fw)[box[1]:box[3], box[0]:box[2]]
    a = np.asarray(crop).astype(np.float32)
    ov = a * (0.35 + 0.65 * poke[..., None]) + np.array([0, 0, 70]) * (1 - poke[..., None])
    t = Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8)); t = t.resize((TW, int(t.height * TW / t.width)), Image.LANCZOS)
    ImageDraw.Draw(t).text((2, 2), cid, fill=(255, 255, 0)); tiles.append(t)
TH = max(t.height for t in tiles)
sh = Image.new("RGB", (TW * PER, TH * ((len(tiles) + PER - 1) // PER)), (10, 10, 12))
for i, t in enumerate(tiles): sh.paste(t, ((i % PER) * TW, (i // PER) * TH))
sh.save(out); print(out, sh.size)
