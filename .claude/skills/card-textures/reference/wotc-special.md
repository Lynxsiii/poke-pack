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
- `assets/foil/wotc-promo/stamp-firstmovie-v2.webp` (review redraw; the first mask, a noisy union of Mewtwo and Dragonite reads, is gone): the lettering's dark outline plus the small
  counters it encloses, read from basep05's flat blue sky, inside the zone (290,85)-(570,270) (`make_wotc_promo_masks.py --stamp-v2`). The four stamps sit in the same place to within a pixel or two
  (checked on all four renders).
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

## Review (rv-j3, fresh-context reviewer, 2026-10-01)
Sheets: `/mnt/project-files/every-era/wotc/finish-sheets/j3-review/` (each photo beside ours at 220 px x 3, Chromium and WebKit, rest / 30:25 / -30:-20 / 50:78; the real app at iPhone 13 size).
Checked: all ten Shinings, Gyarados/Magikarp, Entei, Pichu, bp 1, 2, 3, 8, 9 (+ bp 4 and basep 1, 6 as flat controls), the four First Movie promos; `dark_specks.py` on all of them (0 dots, max drop 26); `foil_coverage.mjs neo3 neo4 basep bp` (silent); `sweep_finishes.py`
for the four sets (passes; the duplicate-rule lines it lists are bw/sm/sv sheets, not this one); pure-blue pixel count (b>250, r<100, g<100) in both engines (0 on the Neo Destiny figures,
Neo Revelation Magikarp's navy field is blue by nature and is identical in Chromium and WebKit, no dodge blocks); class check in the DOM (`wotc-shining`, `wotc-shining wotc-shining-bg`, `wotc-rev-promo wotc-rev-<frame>`, `wotc-stamp`) in the app inspector; era gating (sm35/dp7 Shinings carry
no wotc class, a `foilExtras` call for each); settings on one Shining (no-shine hides the foil, Classic is the old engine untouched, 0.55 and 1.5 strength both sane); `test-wotc.mjs` and `test-basep.mjs` pass
(test-basep needs `assets/cards/ecard1` in a sparse tree).
Found and changed:
- Neo Destiny figures read as ONE flat pink (Steelix, Tyranitar) or magenta plus a green tail (Charizard): the band was 150% of the card, so a figure only ever saw a third of the spectrum. The PSA/nerdventure
  Charizard shows red, yellow, green, blue down the body. The band is now 118% (still moves with the tilt; 105% showed the full rainbow but barely moved) and saturate 1.2 -> 1.
- The First Movie stamp mask was patchy ("The First Movie" in pieces) with a stray dash on the window frame: redrawn as `stamp-firstmovie-v2.webp` from the Dragonite's outline, the four stamps now line up. The stamp does carry foil in the photos
  (cream-gold lettering), so it keeps glinting; nothing else on those cards is foil.
Not changed, for the lead to weigh:
- The reverse promos go blue-violet over the text box at a lit tilt; the PSA 9 Entei photo is neutral dark with bright flecks (no tilt photo exists). Turning `.foil`'s saturation and opacity down changed little (the cast comes from `::before`'s spectrum
  over the star tile and the lamp pool); left as the builder tuned it. A tilt photo of a real 34 Entei would settle it.
- Neo Destiny's lit rainbow is louder than the photos (which are softer with silver patches); the rest state (dark purple-grey metal) matches the PSA Japanese Charizard.
- Best of Game reverse still rests on our scans alone (no tabletop photo).
