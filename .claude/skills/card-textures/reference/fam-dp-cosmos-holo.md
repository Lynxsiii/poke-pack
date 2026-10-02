# Family dp-cosmos-holo: the DP-era "cosmos" Rare Holo (Diamond & Pearl, Platinum, HeartGold SoulSilver, Call of Legends)

Files: `js/fam/dp-cosmos-holo.js` (claims + per-card map), `css/holo/fam/dp-cosmos-holo.css` (every rule under `.fam-dp-cosmos-holo`),
`assets/foil/fam/dp-cosmos-holo/<set>/<n>.webp` (one RGBA map per card), generators in `scripts/fam/dp-cosmos-holo/`
(`auto_mask.py` then `gen_maps.py`). Research and photos: `/mnt/project-files/holo-remaster/dp-cosmos-holo/` (refs/SOURCES.md, sheets/, NOTES.md).

## What the real card does (3+ sources: Collexy flat photos, Pokemon Holo tilt clips, PriceCharting/eBay listing photos)
- Foil is the art window only. Frame, name bar, text box and the evolution circle are matte.
- The Pokemon is printed ink over the foil: matte. Foil shows in the sky/background around it.
- The pattern is a dot-matrix galaxy: round discs, plus signs and diamonds built of 1-2 px dots on a ~4 px pitch, plus lone dots,
  scattered over the window. Each element is ONE saturated colour (teal, cyan, green, blue, magenta, gold) and the colour shifts
  as the card tips (dichroic). Under it a soft rainbow sheen sweeps the sky as the angle changes (tilt frames: sky teal, then
  orange, then blue). DP is denser and brighter, HGSS and Call of Legends sparser and finer, the same vocabulary.
- The scans on the site already show some printed dots (DP sets more than HGSS): re-light them where they are.

## What was built
- Per card, a 600x838 RGBA map: alpha = era art-window shape minus the Pokemon cut-out; RGB = the cosmos flecks, one hue per element
  (dots detected in the scan keep the colour they stand out in; seeded synthetic discs/pluses/diamonds/dots fill up, fewer where the
  scan already shows many). No tile anywhere: each card has its own map, so there is no repeat to see.
- The Pokemon cut-out is SAM2-small (ONNX), three ways. Most cards: automatic prompts (window box, a saliency peak, the blob centre), best
  candidate by predicted IoU (`auto_mask.py`). Cards whose cut failed an automatic check (SAM IoU < 0.70 with a weak outline match, outline score
  < 1.15, or an inverted cut that hides the sky and foils the creature): `fix_masks.py` re-runs SAM with several prompts and scores each candidate
  by the window ring (the border should stay uncovered), area and outline, including the inverse of each candidate. The last 15 cards
  (dp2-10 dp2-dpp07 dp5-5 dp5-12 dp7-3 hgss1-4 hgss1-123 hgss2-9 hgss3-8 hgss4-4 hgss4-8 hgss4-hsp22 pl1-13 pl4-2 pl4-9) were cut by hand clicks with
  `hand_mask.py`: the window crop is a 12 x 8 grid (columns A-L, rows 1-8), a prompt line is `<id>: +F3 +D5@0.3,0.8 -K2 ...` (`+` on the Pokemon,
  `-` on the background, `@fx,fy` places the click inside the cell), `run` writes the three SAM candidates and a review sheet, `pick <id>=1:fill=1` keeps one
  (`:fill=1` closes the holes the cut encloses, e.g. an eye ring; `:add=x0,y0,x1,y1` / `:sub=...` paint a box in crop px). The middle candidate (k1) won on all 15.
  Thin or light parts (claws, a sleeve, a mouth, a paw) need a click each: look at the overlay (`overlay.py`: window with the foil area tinted blue), add a `+`
  where a part is dimmed, run again. The 15 chosen cut-outs are in `scripts/fam/dp-cosmos-holo/hand-masks/` (thresholded .npz, so `gen_maps.py --masks` rebuilds
  their maps without SAM), the click lines in `hand_prompts.txt`.
- CSS, three layers. `.foil` (masked by the art window AND the map's alpha): one long spectrum under a pool of light at the pointer,
  colour-dodged on the print, `filter: brightness(0.5) saturate(1.5) contrast(0.8)` (at brightness 1 the dodge washed the whole sky magenta or mint); lit opacity 0.6-1.0 (x max(1, strength)); at rest a
  pale band plus the fleck map, screen, 0.72. `.cure` (own layer, lit only; the module sets `cure: true`): the fleck map with
  `hue-rotate` driven by the pointer, brightness 1.6, screen, plus a moving white glint band over the same flecks. `.glare`: a small
  soft-light gloss. `.foil::before/::after` off.

## How to judge
Lab: `foil_probe.mjs --query "set=dp1&cards=1,11&proof=off&w=220&poses=rest,30:25,75:65,50:78" --scale 3`; `&fam=off` is the BEFORE.
Look for: sheen colour changes between poses and is bright (not grey), flecks twinkle in different hues, Pokemon and text keep their
own colours, no tile edges, no foil outside the window. Ho-Oh col1-9, Jirachi col1-11 (light, busy windows) are the hard cases for
colour-dodge; Palkia dp1-11, Rayquaza dp6-14 the dark ones.

## What remains
- 267 of the 269 plain dp-holo faces of the scope are in `MAPPED` (2026-10-02). Left on the era look after review fix-3:
  hgss4-8 Rapidash (its flame mane and tail took the cosmos; the shipped maps keep flames matte, as on dp5-10 Moltres,
  hgss1-1 Arcanine and dp3-4 Entei) and dp2-dpp07 Cranidos (a wedge of head dome by the left horn fell outside the
  cut-out). Neither map was shipped (ship-exclude), so a re-cut can keep its file name; then add the id to `MAPPED`.
- Cut-outs are SAM2 masks, still imperfect on thin parts (tails, whiskers); to redo one card: put a better `.npz` (same format as `auto_mask.py`
  writes: `mask` uint8, `box`, `iou`, `area`, `prompts`) in a masks folder, run `gen_maps.py --census census.json --masks DIR --out DIR <id>` and copy
  the map over the old one. A map that is live (on origin/master) is cached for a year: a changed map needs a new file name and the module has to point at it.
- The two SAM2 ONNX files are not in the repo (HuggingFace vietanhdev/segment-anything-2-onnx-models); `auto_mask.py` and `hand_mask.py` take `--models DIR`.
