# Holo family dp-sp: SP Pokemon Rare Holos (Platinum era)

Files: `js/fam/dp-sp.js` (claims), `css/holo/fam/dp-sp.css` (every rule scoped to `.fam-dp-sp`),
`assets/foil/fam/dp-sp/<card id>.webp` (one map per card), `scripts/fam/dp-sp/make_sp_maps.py` (+ `make_sp_maps_hints.json`,
the GrabCut scribbles per card). Research and photos: `/mnt/project-files/holo-remaster/dp-sp/` (53 refs, mostly video frames;
the sharpest still is `refs/cx_1299-zapdos.jpg`, a Collexy scan of Zapdos G pl4-12).

## What the real card does

An SP Rare Holo (Pokemon G, GL, FB, C; pl1-pl4 and the SP promos) carries the DP cosmos holofoil in the art window's
BACKGROUND only. The Pokemon is printed over white and is matte, so are the trainer portrait in its medallion (bottom right,
the head often breaks into the window), the printed SP logo (its "S" crosses the window's bottom-left corner), the frame
and the "X's Pokemon" strip. The scans carry the frozen cosmos (small bright dots) in the background only, never on the
Pokemon. Tilted, the background flashes rainbow while the creature stays flat. Sources: the Collexy Zapdos G scan and the
YouTube tilt frames in refs/ (2+ independent sources, high confidence on "background only").

## What is built

* Claimed (23 faces, all map-checked on `scratchpad/dp-sp/r/contact.jpg`): dpp-dpp41, pl1-7 12 17, pl2-2 3 4 6 8 9 10 11 12,
  pl2-dpp42 dpp43, pl3-1 2 3 4 8 9 11, pl4-12. Every other SP card keeps the era look: SP LV.X (own finish), non-holo SP
  Rares/Uncommons/Commons (the plain Rare is not foil), and the SP holos without a checked map.
* Map (600 x 838 RGBA, lossless): alpha = the foil area (the DP basic-SP window `dp-basic-sp.webp` minus the SP logo and the
  medallion ring, minus the Pokemon and the portrait head found by GrabCut with the hand-scribbled hints, 1 px off the ink
  outline, feathered); RGB = grey cosmos dots (blobs found in the scan plus a seeded synthetic cosmos where the scan shows few,
  so dark backgrounds such as Weavile G and Dialga G still sparkle).
* CSS (same recipe as the shipped dp-cosmos-holo, whose Pokemon-cut-out maps are the same kind): `.foil` is masked by
  `--art` (window) intersected with the card's `--foil-map` (alpha); lit = a radial light pool x a long spectrum
  colour-dodged on the print with the closing `contrast(0.8)` (Safari); rest = the map's dots plus a soft pale band, screen.
  `.cure` lights the dots themselves, one hue per tilt, plus a white glint band that runs with the light. `.glare` is a small
  soft-light gloss. No grain, no line screens, no dark layer, nothing outside the map's alpha, so the Pokemon, portrait,
  logo, text box and frame stay matte.

## How to judge it

Phone size (220 px x 3), `foil_probe.mjs --query "set=pl2&cards=3,4&proof=off&w=220&poses=rest,30:25,75:65,50:78"` and
`&fam=off` for the before. The background must sparkle and flash, the creature, medallion and "SP" must not take any light
(zoom the Pokemon's outline: no halo of foil on its ink edge). WebKit: `PLAYWRIGHT_BROWSERS_PATH=/home/user/pw-webkit
--browser webkit`, 1-2 cards per page.

## What remains

* The maps come from GrabCut: pl2-6 (Froslass hood gap) and pl3-9 (Regigigas orb) are the least certain; re-scribble in
  `make_sp_maps_hints.json` and rerun `make_sp_maps.py --ids <id>` to fix one card.
* SP Rare Holos of pl4 other than Zapdos G and the SP LV.X are not drawn here (LV.X is dp-lvx's finish).
* Not yet compared against the TCG Live foil (none exists for DP).
