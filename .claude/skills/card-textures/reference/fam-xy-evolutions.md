# Family xy-evolutions: Evolutions (xy12) Starlight holos and reverse holos

Part of the older-era holo remaster (2026-10-01/02). Module `js/fam/xy-evolutions.js`, sheet `css/holo/fam/xy-evolutions.css`
(every rule scoped to `.fam-xy-evolutions`), assets `assets/foil/fam/xy-evolutions/`, generators
`.claude/skills/card-textures/scripts/fam/xy-evolutions/` (`make_starlight.py`, `make_maps.py`). Research, photos and sheets:
`/mnt/project-files/holo-remaster/xy-evolutions/` (`refs/SOURCES.md`, `sheets/`, `LESSONS.md`).

Scope: the 13 Rare Holo reprints (Charizard 11, Ninetales 15, Poliwrath 25, Gyarados 34, Raichu 36, Magneton 38, Zapdos 42, Nidoking 45,
Mew 53, Machamp 59, Hitmonchan 62, Clefairy 63, Chansey 70) and every xy12 reverse print (Pokemon, Trainer, Special Energy). xy12's EX,
Mega EX, BREAK and full arts belong to xy-ex-mega, xy-break and xy-full-art. Census (`famcensus.mjs`): 13 holo faces, 138 faces if every
xy12 card were a reverse (the reverse flag decides).

## What the real cards do
- **Starlight (xy12-star).** Collexy's "Starlight Holofoil", only on Evolutions in the XY era. Foil: the art window's background; the
  Pokemon is matte (TCG Live's `assets/foil/maps/xy12/<n>.webp` cut it out). Pattern: a dense field of stars at two depths, sharp 8-point
  stars, 12-point bursts, hairline twinkles, round dots near the surface; blurred stars and blobs far away; each flashes its own hue; the
  ground between is dark metal, so the stars show through black ink (Zapdos) and pale ink (Chansey). Five independent photo sources
  (Collexy scans of Charizard, Machamp, Chansey; Kronozio Zapdos; YouTube frames) plus the maps: confidence high.
- **Reverse (xy12-rev).** Collexy: "In Evolutions, the Set Reverse Holofoil Pattern is the Mirror Pattern" (every other XY set is the
  Energy pattern with ghosted type symbols; `reference/xy-holo-reverse.md` was wrong for xy12). TCG Live's xy12 reverse maps are flat white
  (no symbols), and the Charmeleon and Arcanine tilt frames show a smooth body with one broad rainbow reflection (cyan, blue, violet,
  pink, orange, pale yellow core) and black text. Foil: everything but the art window, the type circle, the attack energy symbols and a
  Trainer's title bar; the yellow border is not foil.

## What it draws
- `xy12-star` (`cure: true`): `.foil` (hard-light) the star textures `starlight-near-a/b` + `starlight-far` over a field a little under
  mid grey, masked `--art` x `--foil-map` (Charizard's own `map-11.webp` has the scan's EVOLUTIONS logo cut out: the pack card has none);
  `::before` / `::after` light the two halves of the sharp stars with spectra that slide in opposite directions; `.cure` (colour-dodge) is
  the moving rainbow light; `.glare` a soft white varnish. The textures are 1.2 x 0.62 of the card, one crop per card (`--seed-x/y`), no
  repeat. `make_starlight.py` (seeded): 62 compass stars, 16 bursts, 26 twinkles, 110 dots, 80 soft stars, 160 blobs per texture.
- `xy12-rev` (+ `xy12-rev-map`): `.foil` (overlay, floor 50% grey so the ink stays dark) a broad rainbow band (repeating, 150deg, 300%
  layer, position = pointer) with a soft white pool; `::before` (overlay) its pale specular core; `::after` (multiply) a pastel band on
  pale bodies only (Trainer, Colorless, Energy), every stop at 78% or more; `.glare` (overlay) a light varnish. Every layer masked by the
  card's own reverse map `--xy12-rev-map` (alpha, `rev/<n>.webp`, from TCG Live's `_ph.foil`).

## How to judge it
Lab: `foil_probe.mjs --query "set=xy12&cards=11,70,r9,r80&proof=off&w=220&poses=rest,30:25,75:65,50:78" --scale 3` (WebKit, 2-3 cards per page),
BEFORE with `&fam=off`. Look for: stars visible at rest on black, orange and pastel art; Pokemon matte; no tile edge; the reverse's
window, type circle and energy symbols matte; text still dark at 50:78.

## What remains
- The real Starlight also carries a fine square grain over the stars that is not drawn (Noah named visible squares as a failure).
- Reverse text takes a faint tint at the thumb pose (overlay lifts dark ink a little); a mask of the ink would be exact.
- No macro photos of either finish; the reverse rainbow is judged from two 480p tilt frames.
- `reference/xy-holo-reverse.md` and `xy-xy12.md` still say "Energy pattern" for xy12 reverses and "Starlight = glitter tiles".
