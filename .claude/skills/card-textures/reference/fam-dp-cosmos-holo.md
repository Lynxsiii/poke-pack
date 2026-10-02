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
- The Pokemon cut-out is SAM2-small (ONNX) with automatic prompts (window box, a saliency peak, the blob centre), best candidate by
  predicted IoU; cards whose cut failed an automatic check (SAM IoU < 0.70 with a weak outline match, or outline score < 1.15) are left out.
- CSS, three layers. `.foil` (masked by the art window AND the map's alpha): one long spectrum under a pool of light at the pointer,
  colour-dodged on the print, `filter: brightness(1) saturate(1.5) contrast(0.8)`; lit opacity 0.6-1.0 (x max(1, strength)); at rest a
  pale band plus the fleck map, screen, 0.72. `.cure` (own layer, lit only; the module sets `cure: true`): the fleck map with
  `hue-rotate` driven by the pointer, brightness 1.6, screen, plus a moving white glint band over the same flecks. `.glare`: a small
  soft-light gloss. `.foil::before/::after` off.

## How to judge
Lab: `foil_probe.mjs --query "set=dp1&cards=1,11&proof=off&w=220&poses=rest,30:25,75:65,50:78" --scale 3`; `&fam=off` is the BEFORE.
Look for: sheen colour changes between poses and is bright (not grey), flecks twinkle in different hues, Pokemon and text keep their
own colours, no tile edges, no foil outside the window. Ho-Oh col1-9, Jirachi col1-11 (light, busy windows) are the hard cases for
colour-dodge; Palkia dp1-11, Rayquaza dp6-14 the dark ones.

## What remains
- Cards without a map keep the era look (list in the family REPORT: Platinum pl1-pl4, dp7 and the cards whose cut-out failed).
- Cut-outs are automatic: thin parts (tails, whiskers) and light creatures (Ampharos dp3-1) can be coarse; a hand-prompted mask
  (`samp-*` in the scratch, see `auto_mask.py` for the format) replaces any card's `.npz` and `gen_maps.py` rebuilds its map.
- To finish the rest: download the two SAM2 ONNX files (HuggingFace vietanhdev/segment-anything-2-onnx-models), run `auto_mask.py` for
  the missing ids, then `gen_maps.py`, then add the ids to `MAPPED` in the module.
