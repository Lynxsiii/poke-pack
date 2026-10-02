# Family bw-tinsel-holo: Black & White Tinsel Rare Holo (252 faces claimed; 3 more `bw-holo` faces left on the era look)

Files: `js/fam/bw-tinsel-holo.js` (claims every `bw-holo` face except the finishes in `LEAVE`; one class `bwt-<finish>` per face),
`css/holo/fam/bw-tinsel-holo.css` (21 rules, one copy of each), `assets/foil/fam/bw-tinsel-holo/{tinsel-crests,tinsel-gaps,tinsel-glints,
cosmos-dots,cosmos-lit,ice-facets,ice-tint}.webp`, `scripts/fam/bw-tinsel-holo/{make_tinsel,make_cosmos,make_cracked_ice}.py` (seeded,
re-runnable, refuse to overwrite without `--force`). Research, photos, sheets: `/mnt/project-files/holo-remaster/bw-tinsel-holo/`
(refs/SOURCES.md, sheets/, NOTES.md, LESSONS.md, REPORT.md). The older era sheet `css/holo/bw.css` still draws these cards when `&fam=off`
(the BEFORE picture): it filed every one as Tinsel, a flat sheen over a tile of 2-4 px lines.

## Which faces (`finishOf()` in the module)
| class | faces | what the real card has |
|---|---|---|
| bwt-tinsel | 164 | every set Rare Holo bw1-bw11 and the Tinsel promos (BW01-05, BW20-22, BW32, BW60) and the Trainer Kit holos |
| bwt-vault | 21 | Dragon Vault, the same Tinsel, stronger |
| bwt-cosmos | 42 | blister, box and tin promos Collexy/Pokumon/TCGplayer file as Cosmos, and the Snivy/Tepig/Oshawott box prints (`bw2-bw1-*-cosmos`) |
| bwt-ice | 13 | Cracked Ice: the theme-deck reprints (`bw1-5-cracked-ice` ...) and the promos BW13, BW25, BW34, BW70-72 |
| bwt-mirror | 6 | Genesect BW99 and the Dragon Vault stamped Latias, Latios, Rayquaza, Haxorus, Druddigon (plain mirror) |
| bwt-rev-mirror | 4 | reverse mirrors Thundurus BW41, Tornadus BW42, Lillipup BW52, N BW100 (body foil; the TCG Live map decides) |
| bwt-rev-ball | 1 | Battle City BW39, the reverse with the Poke Ball pattern: the TCG Live map carries the balls, drawn with the same mirror sheen |
| bwt-matte | 1 | Meowth BW35: not foil (TCGplayer sells it Normal only, Pokumon files it Non-Holo): foil and varnish off |
| rev-cross | 3 | NOT claimed: they stay on the era look (`LEAVE` in the module): Victory Cup BW29-31 (Crosshatch; needs a crosshatch texture) |

## What the real foil does (sources in refs/SOURCES.md; two or more per claim unless marked)
- Tinsel: the art window's background is ruled with fine HORIZONTAL ridges, about 100 over the card's height (measured on Collexy's flat
  scans of Cobalion 77/98, Virizion 13/101, Serperior 6/114: one every 0.9-1.1 % of the height), each lit a little differently and broken
  into streaks. The Pokemon is matte (TCG Live's per-card map). Under a lamp a bright streak lies along the ridges at the lamp's height and
  slides up and down the window as the card tips; the crests flash in rainbow colours that change sideways with the angle, the light coming
  through the ink in the ink's colour; between the crests the foil stays darker. Frame, name bar, text box and Pokemon stay matte.
- Cosmos: fine field of small round dots (stars), pale, one per 1-2 % of the card width, the odd bigger dot and ring; Pokemon matte.
  Glitter-like as the card turns. Confidence medium (Collexy + Pokumon scans; no tilt video found).
- Cracked Ice: flat angular pastel facets (3-10 % of the card width), each its own colour and mirror angle, a few flashing at a time and
  changing as the card turns; whole window including the Pokemon on the theme-deck reprints, Pokemon matte on the promos. One photo
  family (Pokumon scans + Collexy BW13): medium confidence.
- Mirror, reverse mirror: low confidence (finish classification from Collexy + TCGplayer printing lists only).

## What the family draws
Every finish replaces bw.css's Tinsel outright: the shared reset block clears every paint property of `.foil`, `.foil::before/::after`,
`.glare`, `.glare::after` and `.cure`, then each finish paints the layers it uses. `.foil` keeps the era's map + `--art` mask (maps.css), so
foil sits only where the TCG Live map says.
- Tinsel/vault: `.foil` is `hard-light` (a 0.5 grey leaves the print, brighter lifts it, darker shades it never under 0.8): bottom up the
  spectrum (400 % wide, slides with `--background-x`), a neutral grey that fades in away from the lamp's streak (a flat ellipse on the
  pointer, its centre held inside the window: `--bwt-sheen-y` = 15 % + 34 % x pointer-from-top), then `tinsel-gaps.webp` (grey 0.43 in the
  gaps, clear on the crests) so the ridges show at rest on a pale window as on a dark one. `::before` screens the glints in a band;
  `.cure` (colour-dodge, held only) multiplies the streak by the crests texture by the spectrum-as-gain, so crests burn in the ink's colour.
  The textures are three 512 x 1024 images drawn from one seeded ridge list (aperiodic pitch 7.5-13.5 px, flat-topped cosine profiles):
  nothing repeats, nothing is a 2-4 px grating (a regular grating aliases into a line screen on a phone, SKILL.md).
- Cosmos: `.foil` hard-light: `cosmos-dots.webp` (grey 0.74 on the dots only) over a neutral grey that thins to a bloom at the lamp over the
  spectrum; `::before` the spectrum seen through the dots (alpha mask) in `screen`; `.cure` the dots as light (`cosmos-lit.webp`) x lamp glow
  x spectrum in colour-dodge.
- Cracked Ice: `.foil` hard-light: `ice-tint.webp` (pastel per facet, weakest channel 0.5, so it only lifts) at about half strength;
  `.cure` colour-dodge: `ice-facets.webp` (one grey per facet) `difference` a grey that follows the pointer, then
  `invert(1) brightness(0.5333) contrast(15) contrast(0.8)` (y = 8x - 7: a facet within 0.125 of the pointer's angle goes 0 to 1, the rest
  stay dark; the last contrast closes the dodge at 0.9, SKILL.md). Which facets flash, and in which pastel, changes as the card moves.
- Mirror, reverse mirror and Battle City: one hard-light layer: the spectrum seen through a grey that thins to a flat ellipse on the lamp.
- Never: no `mask-position` without `clamp()` needed (all `center`), no infinite animation, no outline or shadow on `.tcg`.

## How to judge it
Lab (Tinsel and Dragon Vault): `node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=bw1&cards=26,71,57,47&proof=off&w=220&poses=rest,30:25,75:65,50:78" --width 1000 --scale 3 --boxes --out <png>`; `&fam=off` is the BEFORE. All four
poses must show the flash inside the window (the 50:78 pose, the pointer low, is the one that failed first). Promos carry `foilAs`, which the
lab skips: render them in the real app with `site_cards.mjs --set <set> --ids <id,...>` (a copy of that script with `?fam=off` appended to the
URL gives their BEFORE). Dots must read as glitter, not a grid; ice facets must read as shards, not a triangle mosaic (Delaunay triangles of a 32 px Poisson
set, 60 % merged with a neighbour; keep the spacing above 30).

## Open
- Victory Cup BW29-31 (Crosshatch) is not drawn: it stays on the era look (maps: foil on the window and the text panel at half alpha).
- Cracked Ice shards are triangles merged up to three to a shard (60 %); the real ones are larger irregular polygons.
- Mirror/rev-mirror have one source each; no tilt video of a BW mirror card was found.
- Real tilt video of the Tinsel Pokemon holo channel is one photographer on one mat (g1/SOURCES.txt): not independent of itself.
