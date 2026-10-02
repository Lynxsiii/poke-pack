"""dp-cosmos-holo, flames: add the flames (and any fire-coloured part) of a Pokemon to its SAM cut-out.

    python3 flame_cut.py <id> <in.npz> <out.npz> [--exclude x0,y0,x1,y1] [--pale x0,y0,x1,y1] [--smin 0.5] [--vmin 0.28] [--hmax 62] [--holes 400]

SAM keeps the creature but takes big gradient flames (Rapidash's mane and tail, hgss4-8) for the background, and flames are part of the Pokemon:
they stay matte, as on dp5-10 Moltres, hgss1-1 Arcanine and dp3-4 Entei. A colour test finds them (hue red..yellow, saturated), and only the warm
regions that touch the cut-out count. Boxes are in art-window crop px (overlay.py shows them): --exclude never flames there (a red pagoda roof),
--pale never flames for pale yellow there (a moon). Small enclosed holes are filled unless they are sky. The output npz also carries `foil`:
cool sky pixels away from the creature, plus the pale pixels of --pale, which gen_maps.poke_soft keeps foil whatever the smoothing did
(its hole fill and closing would otherwise swallow a moon or a cloud sliver caught between flames)."""
import sys, os, json, argparse
import numpy as np
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import auto_mask as A
ap = argparse.ArgumentParser(); ap.add_argument("id"); ap.add_argument("inp"); ap.add_argument("out")
ap.add_argument("--smin", type=float, default=0.5); ap.add_argument("--vmin", type=float, default=0.28); ap.add_argument("--hmax", type=float, default=62)
ap.add_argument("--exclude", action="append", default=[], help="x0,y0,x1,y1 in crop px: never flame")
ap.add_argument("--pale", action="append", default=[], help="x0,y0,x1,y1 in crop px: pale yellow (a moon, a star) is never flame there")
ap.add_argument("--holes", type=int, default=400)
a = ap.parse_args()
rows = {r["id"]: r for r in json.load(open(os.path.join(HERE, "census.json")))}
crop, box, win = A.window_crop(rows[a.id])
hsv = np.asarray(crop.convert("HSV")).astype(np.float32)
h = hsv[..., 0] * 360 / 255; s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
warm = ((h <= a.hmax) | (h >= 340)) & (s >= a.smin) & (v >= a.vmin)
pale_all = (h >= 36) & (h <= 72) & (s < 0.66) & (v > 0.8)
for e in a.exclude:
    x0, y0, x1, y1 = [int(t) for t in e.split(",")]; warm[y0:y1, x0:x1] = False
pale_keep = np.zeros_like(warm)
for e in a.pale:
    x0, y0, x1, y1 = [int(t) for t in e.split(",")]
    sub = np.zeros_like(warm); sub[y0:y1, x0:x1] = ndi.binary_dilation(pale_all, iterations=2)[y0:y1, x0:x1]
    warm &= ~sub; pale_keep |= ndi.binary_opening(np.logical_and(sub, pale_all), structure=np.ones((2, 2)))
z = np.load(a.inp, allow_pickle=True); horse = z["mask"] > 127
warm = ndi.binary_opening(warm, structure=np.ones((3, 3)))
cand = warm | horse
lab, n = ndi.label(ndi.binary_dilation(cand, iterations=1))
touch = np.unique(lab[horse]); touch = touch[touch > 0]
m = (np.isin(lab, touch) & ndi.binary_dilation(cand, iterations=1)) | horse
m = ndi.binary_closing(m, structure=np.ones((3, 3)), iterations=2)
holes = ndi.binary_fill_holes(m) & ~m
hl, hn = ndi.label(holes)
if hn:
    sky = ((h >= 150) & (h <= 270) & (s > 0.2)) | pale_all
    idx = range(1, hn + 1)
    sz = ndi.sum(holes, hl, idx); skyfrac = ndi.mean(sky, hl, idx)
    small = np.zeros(hn + 1, bool); small[1:] = (sz < a.holes) & (np.asarray(skyfrac) < 0.35); m |= small[hl]
skyk = (h >= 150) & (h <= 270) & (s > 0.25) & (v > 0.25)
skyk &= ~ndi.binary_dilation(horse, iterations=2)
skyk = ndi.binary_opening(skyk, structure=np.ones((2, 2))) | pale_keep
m &= ~skyk
np.savez_compressed(a.out, foil=(skyk * 255).astype(np.uint8), mask=(m * 255).astype(np.uint8), box=z["box"], iou=np.float32(0.9),
                    area=np.float32(m.mean()), prompts=np.array([[0.0, 0.0]], np.float32))
print(a.id, "creature", round(float(horse.mean()), 3), "warm", round(float(warm.mean()), 3), "cut-out", round(float(m.mean()), 3), "warm regions touched", len(touch), "of", n)
