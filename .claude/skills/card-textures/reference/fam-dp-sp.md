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

* Claimed (23 faces; 19 shipped in PR #193, the four re-cut ones pl2-8 pl3-2 pl3-9 pl3-11 added back in run 2): dpp-dpp41, pl1-7 12 17, pl2-2 3 4 6 8 9 10 11 12,
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

## Re-cut after review #1 (run 2, 2026-10-02): pale skies and the Lucario aura

Review #1 dropped four faces: pl2-8 Lucario GL (the map lit the ear aura, the ear and the chest fur neon green) and pl3-2
Blaziken FB, pl3-9 Regigigas FB, pl3-11 Staraptor FB (a flat magenta, mint or lime wash over the whole window at 30:25, 75:65
and 50:78). Cause: `.foil` lit is a colour-dodge of a dimmed spectrum, and colour-dodge multiplies the base, so a pale or grey
sky lands on one flat hue while a dark sky stays dark with coloured dots. The CSS is shared with dp-cosmos-holo, so the fix is
in the map (alpha is the foil's mask):

* `pale` in `make_sp_maps_hints.json` (script option `pale_sky()`): alpha x max(atten, dot core), where atten falls from 1 to
  `floor` between the blurred scan luminances `l0` and `l1` (blurred over the foil area only, sigma 9 px, so no pattern), and a
  dot core of strength `core` or more keeps full alpha. A pale sky therefore shows the cosmos dots lit in colour and a faint
  sheen, a dark sky keeps the whole sweep. Values: Lucario, Blaziken, Regigigas l0 .22, l1 .55, floor .14; Staraptor (mid-dark
  olive grass, the strongest sheen at 30:25) l0 .17, l1 .45, floor .15.
* `erode` (script option): foil shrunk by N px inside a box. Lucario's ear is eroded 5 px (its pale outline is part of the ink).
* Lucario: new matte strokes on the ear lobes, the chest fur and horn and the left blue spike.
* pl2-9 Luxray GL (shipped in PR #193; review #1 "watch": a pale sage tint at 50:78). Measured: the shipped map washes the whole
  window flat pink at 30:25 and mint at 75:65 (foil-minus-bare mean change 28.6 / 15.3 / 14.2, wash-like share 38-40%), so it got
  the same `pale` cut. The shipped `pl2-9.webp` stays (never rewritten); the new map is `pl2-9-v2.webp`, hints key `pl2-9-v2` with
  `"card": "pl2-9"` (same scan, scribbles and dots), and `FILE` in `js/fam/dp-sp.js` points the card at it. To go back to the
  shipped look, delete the `FILE` entry.
* The 19 live maps are untouched: both options are per card, and the script is run with `--ids` only.

Judge a pale-sky card by the foil-minus-bare difference (`foil_probe.mjs --css ".fam-dp-sp .foil,.fam-dp-sp .cure,.fam-dp-sp
.glare{display:none!important}"` vs without): a wash is a large connected area of strong, same-direction change; sparkles are
small and scattered. After the re-cut the wash-like share of the window at 75:65 and 50:78 is 2.7-9.8% on the four cards (Lucario 4.5-9.8, Blaziken
5.0-6.4, Regigigas 7.0-9.1, Staraptor 2.7-5.1; mean change 5.6-9.1 levels), against 1.6-35% on cards that passed review
(Rayquaza C 7.7-9.0, Darkrai G 1.6-5.9, Floatzel GL 31-35: a lit blue band, not a flat hue). The four now carry LESS foil than
the passing cards on pale skies, by design; the sparkle is the dots.

## What remains

* The maps come from GrabCut: pl2-6 (Froslass hood gap) is the least certain; re-scribble in
  `make_sp_maps_hints.json` and rerun `make_sp_maps.py --ids <id>` to fix one card.
* SP Rare Holos of pl4 other than Zapdos G and the SP LV.X are not drawn here (LV.X is dp-lvx's finish).
* Not yet compared against the TCG Live foil (none exists for DP).
