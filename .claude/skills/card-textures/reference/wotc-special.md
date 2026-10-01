# Wizards of the Coast special finishes (finish agent j3)

Shining Pokémon (Neo Revelation, Neo Destiny), the Wizards Black Star reverse promos (34 Entei, 35 Pichu), the Best of Game reverse promos (bp 1, 2, 3, 8, 9) and
the First Movie gold-stamp promos (basep 2-5). Sheet: `css/holo/wotc-special.css`. Hooks: `js/wotc-special.js` (called first by `wotcPattern`, `wotcMap`,
`wotcReverseFinish` in js/wotc-foil.js; `specialReverseMap` in js/foil-maps.js). Photos and sources: `/mnt/project-files/every-era/wotc/texture-refs/j3/SOURCES.txt`.
Contact sheets (Chromium and WebKit, 220 px, rest / 30:25 / -30:-20 / 50:78): `/mnt/project-files/every-era/wotc/finish-sheets/j3/`.

## What each finish is (photos decide)
| class | cards | what the photos show | what the sheet draws |
|---|---|---|---|
| `wotc-shining` | neo4 106-113 | the Pokémon FIGURE is a smooth metal foil; art scene and card are plain print. Dark at rest, rainbow bands lit. | colour-dodged 150% rainbow band on the figure mask, fine grain screen, silver sweep |
| `wotc-shining wotc-shining-bg` | neo3 65, 66 | the BACKGROUND of the art window is a silver star-field foil, the figure is plain print | the same band (cooler) on window-minus-figure, star tile lit by a spectrum |
| `wotc-rev-promo wotc-rev-<neo\|baby\|rocket\|trainer>` | basep 34, 35; bp 1, 2, 3, 8, 9 | reverse holo: dark silver star-field mirror over the card face inside the yellow border, art window and banner plain | lamp pool + spectrum colour-dodged, star tile lit by a moving spectrum, mask = frame |
| `wotc-stamp` | basep 2-5 | flat card; only the gold "Kids WB Presents Pokémon The First Movie" stamp glints | gold ramp screened through the stamp mask |

CONFLICT to remember: the research notes (neo3.md, neo4.md, from BP/PSA) say every Shining is "the Pokémon only, background not holo". True for Neo Destiny, false for
Neo Revelation (three photos, SOURCES claim 2): Gyarados and Magikarp are background foil. `wotcMap` returns the figure for neo4 and window-minus-figure for neo3.

## Masks (all drawn, TCG Live has none for this era; L-mode webp, so the sheet uses `mask-mode: luminance`)
- `assets/foil/wotc-shining/<set>-<n>.webp` (10 files, 600x838): `scripts/make_wotc_shining_masks.py`. Per-card figure recipes (GrabCut and colour seeds, flood fill
  inside the glow outline) inside the art window rectangle (65,95)-(537,429). neo4 keep the figure (eroded 1 px, blur 0.8); neo3 are the window minus the figure
  (closing 9, dilation 4 so the foil stops short of the outline).
- `assets/foil/wotc-promo/{neo,baby,rocket,trainer}.webp`: `scripts/make_wotc_promo_masks.py`, the card field inside the border minus the art window and banner
  (frame holes measured per frame: Neo, Baby (Pichu), Rocket, Trainer).
- `assets/foil/wotc-promo/stamp-firstmovie.webp`: the stamp lettering, the union of the ink detected on basep03 and basep05 inside the zone (290,85)-(570,270). It is
  blobby: the "The First Movie" line is patchy. The four stamps sit in the same place to within a pixel or two.
- `assets/foil/wotc-stars-v1.webp` (512x512 RGBA, about 5% lit, seamless, seeded): `scripts/make_wotc_stars.py`. Star tile for the reverse mirrors and Neo Revelation.

## Rules learned here
1. A map saved as L comes back as RGB without alpha: use `mask-mode: luminance` for it. The art scan is alpha. A mask list like `art, map` needs `alpha, luminance`
   (`-webkit-mask-mode` too). Getting it wrong lit the whole card (text, border) pink in the first render.
2. Never put pseudo-elements inside `:is()` in a selector list: the whole selector is dropped (silently). The parent `.foil` mask clips its `::before`/`::after` anyway.
3. A reverse card's map comes from the finish name (`wotc-promo-<frame>`), because `foilExtras` returns early for reverse prints.
4. Chromium and WebKit disagree on how strong a colour-dodge through a mask group is: WebKit reads the rainbow much more saturated. The Shining chain is tuned
   to look right in both (saturate 1.2, opacity 0.3 + 0.55 x lift) and closed with `contrast(0.8)`.
5. The scans carry their foil baked in (Entei and Pichu are dark and starry, the Shinings grainy): the sheet adds light, not structure.

## Tests changed (they asserted the scaffold)
`scripts/test-wotc.mjs`: neo3-65 is `foil-holo wotc-shining wotc-shining-bg`; basep02 is `foil-holo wotc-stamp` (a flat promo is now basep06); basep34's reverse classes are
`rev-mirror era-wotc wotc-rev-promo wotc-rev-neo`. `scripts/test-basep.mjs` fails in a sparse worktree before any change (ecard1-basep51 scan is not checked out).

## Not settled
- No tabletop photo of a Best of Game card was found; its recipe is the Entei/Pichu one checked against our scans (SOURCES claim 4).
- Pichu 35: one Japanese-print photo; the English card is read from our scan.
- The First Movie stamp mask is blobby; a hand-traced one would be cleaner.
- Shining Celebi/Kabutops/Raichu/Steelix/Tyranitar/Mewtwo were tuned by the Charizard and Noctowl photos; the figure colours are set by the band, not per card.
