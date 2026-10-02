# Full-art Ultra Rare, gold Hyper Rare and Special Illustration Rare (shared Scarlet & Violet finishes)

Built once for every Scarlet & Violet and Mega Evolution set with TCG Live
foil maps (2026-09-27, from the Paradox Rift thread). Rules:
`css/holo/sv-fullart.css`. No JS hook: the cards already carry
`foil-ultra` / `foil-gold` from `foilPattern()` in `js/app.js`, and the rules
only match with `has-foil-map`. A set without maps keeps the older recipes
(`rarities.css`, `realism.css`).

## Which cards

| Finish | Cards | TCG Live (Paradox Rift) | Site classes |
|---|---|---|---|
| Full-art Ultra Rare | rarity `Ultra Rare`, not Tera | `SUN_PILLAR` / `ETCHED`, print id `..._UltraRare_SunPillar_Etched` (23 cards) | `foil-ultra has-foil-map has-etch-map`; Supporters also `foil-trainer` |
| Gold Hyper Rare | rarity `Hyper Rare` or `Mega Hyper Rare` | `SV_ULTRA` / `ETCHED`, print id `..._HyperRare_SvUltra_Etched` (7 cards) | `foil-gold has-foil-map has-etch-map` |

Tera Ultra Rares (`UltraRareC`, `SV_ULTRA`) stay with `sv-finishes.css`; a
Tera Pokémon's gold Hyper Rare is an ordinary gold card. The Classic
Collection's full-foil cards (`foil-ultra foil-classic`) are excluded too.

The whole Paradox Rift tally, for comparison: Rare `SV_HOLO`/`HOLO`, Double
Rare `SUN_PILLAR`/`HOLO` (cast and cure SouthernCross), Illustration Rare
`SUN_PILLAR`/`HOLO`, Special Illustration Rare and Hyper Rare
`SV_ULTRA`/`ETCHED`, reverses `FLAT_SILVER`/`REVERSE`. So the Ultra Rare is
the Double Rare's sun pillar foil, etched instead of windowed; the gold card
is the SIR's foil under gold ink.

## Full-art Ultra Rare

- **Where** (foil map): the whole card; the Pokémon at part strength, the
  attack text and rule box lighter.
- **Etch**: fine lines following the art (flames, hair, cloth), over about
  nine tenths of the card. The etch map is white with alpha (mean alpha
  about 0.47).
- **Pattern**: pokemon-cards-151's `ex-full-art.css`: vertical sunpillar ramp
  (`hue`) over 128.5deg tinsel bars (`hard-light`) over a pointer darkener,
  with the card's `--mask` and `--foil` (etch) as `soft-light` images on top,
  `brightness(pfc*.4+.5) contrast(2.5) saturate(.66)`, and an `exclusion`
  twin on `::after` running the bars the other way.
- **Porting the soft-light etch**: upstream's etch image is opaque grey (black
  where uncut). Ours is an alpha map, and a background layer can't be
  "etch over black, then soft-light" in one element. So the two cases are
  split by where the etch is: `.foil` draws the stack under a white and a
  black soft-light (the foil between the lines), and `::before` draws the
  same stack under two white soft-lights, masked by `--etch-map` (the cut
  lines, a step brighter). Put the stack in custom properties on `.foil`
  (`--fa-pillar`, `--fa-bars`, `--fa-dim`, `--fa-pos`) so both layers line
  up; `::before` inherits them, `::after` restates `--fa-pillar` so its ramp
  picks up the rotated sunpillar colours base.css gives `::after`.
  (Custom properties resolve `var()` where they are declared.)
- **Against real cards** (photos in the project's
  `scarlet-violet/texture-refs/`, collected by the SV base thread): several
  parallel, saturated diagonal rainbow bands at once, running over the
  Pokémon, the text and the frame; the silver frame always has a rainbow
  edge; the etch reads as fine crosshatch in backgrounds. Upstream's `hue`
  blend takes its saturation from the grey tinsel bars, so it only tints.
  Blending the sunpillar ramp with `color` (the ramp's hue and saturation,
  the bars' luminance), tightening the bars to 200% (130% on the twin) and
  keeping `saturate(1)` gives the bands.
- **Where the light is** (151 thread's photos, 2026-09-27): 151's Alakazam
  ex, Arbok ex and Zapdos ex keep the art saturated, with fine glitter on
  the body, etched swirls in the background and rainbow only at glancing
  edges; SV base's photos show strong bands, but only in the part of the
  card catching the light. Unmasked, the recipe washed the whole face pastel
  at 30:25. So `.foil` (both twins with it) carries a third mask layer,
  `--fa-light`: a radial around the pointer, full strength for about a
  third of the card, a quarter by the far corner. The glare stays
  whole-card.
- **Glare**: upstream's hard-light radial. Upstream gives Supporters a
  flatter, brighter one; on a pale full art it hazes the face (sv1 238
  Miriam, found by the SV base thread), so every Ultra Rare gets the plain
  one. The etch hot spot `celebration.css` gives every etched card is a
  white disc in a hard-light glare on a card this etched, so it is smaller
  and fainter here, and still washed the Supporter text box at 0.7; 0.5 is
  right.
- **The printed outline**: Paradox Rift's full arts print a teal outline
  around the Pokémon (Armarouge, Roaring Moon). It is ink, not a foil
  artifact; check the raw scan before chasing it.

### Etch over the whole card (2026-09-28)

With the SIR rebuild, the Ultra Rare's `.glare::after` (the lit lines) went
from a hot spot fading out at 40% to a whole-card floor (white 0.55 at the
pointer, 0.28 at 25%, 0.16 at 60%, 0.1 at the edge; opacity 0.5 + 0.5
from-center), so the relief shows at every pose, as the SIR's does, but
softer: nine tenths of a full art is etched and the hard-light glare already
lifts it. Ultra Rares and golds with no Live etch (the ME sets, Black Bolt,
White Flare) got `has-etch-tile` and the drawn `assets/foil/sir-etch.webp`
(`--fa-etch` / `--fa-etch-size` / `--fa-etch-pos` / `--fa-etch-repeat`
pick the map or the tile) on the `::before` etch pass and on `.glare::after`;
since 2026-09-28 they carry per-card drawn maps instead (`has-etch-map`,
below under Drawn prints), through the same variables.
Before this they were a smooth rainbow with no relief at all (Kyurem ex and
Serperior ex UR, White Flare).

## Gold Hyper Rare

- **Where**: nearly the whole card (map mean alpha about 0.8); etched like
  the Ultra Rare.
- **Pattern**: pokemon-cards-151's `hyper-rare.css` is its SIR recipe: 15deg
  rainbow, two light bars crossing with the tilt (`hard-light`), iridescent
  glitter, a multiply glare, and `glare2`: white masked by the etch, so the
  cut lines light up across the whole card, not just under the pointer.
- **Against real cards**: warm gold off-angle, washing to pale champagne or
  silver with a pastel rainbow at the glare angle; a heavy glitter grain over
  the whole card, the Pokémon included; concentric etched rings behind the
  subject (the etch); a red-orange-green flare only as a band at a steep
  angle, never the whole card.
- **Recipe**: the SIR-with-map port from `celebration.css`, dodged paler,
  `brightness(.5) contrast(1.5) saturate(.45)` (resting `saturate(.3)`); two
  glitter tiles (14% and 23%) screened together and drifting apart for the
  grain; a hard-light glare (warm 74% grey at the light, 40% away) instead of
  upstream's multiply, so the card washes pale near the light; and a
  `.glare::after`
  whose etch-masked white never falls below 0.3 alpha (upstream's glare2).
  In the hard-light glare, the white lines lift the gold under them.
- **Bright gold goes orange.** Upstream dodges the rainbow at
  `brightness(.6) saturate(1)`; its red and magenta slices push the red
  channel to full, and sv1's brighter golds (253 Miraidon ex, 254 Koraidon
  ex, the near-white gold energies 257/258) turn orange and red when lit.
  `soft-light` and `overlay` keep the hue but go orange-brown in the
  shadows. The paler dodge above stays gold with a rainbow tint on sv1, sv4
  and sv5 (found by the SV base thread; see its `scarlet-violet.md`).
- **Before this**, the old gold recipe (`rarities.css`, conic gradient plus
  `--holo-metal`) drew horizontal scanlines on mapped cards.
- **Remade 2026-10-02 for Scarlet & Violet and Mega Evolution** (Noah:
  "overuse of the rainbow glare"). Judged against 25 seller photos of six
  real Mega Hyper Rares (`/mnt/project-files/mega-hyper-rare/texture-refs/`,
  `SOURCES.txt`): lemon gold (lit about #D7B843 to #E8BA2A) that goes pale
  near the lamp and olive (#81740C to #9A7809) away from it, engraved lines
  and a fine glitter grain, and colour only as one hard-edged diffraction
  band (red to violet, a third of the card wide) that slides with the tilt
  and vanishes at some angles. Dark ink stays matte. The recipe above lit
  the whole card with a pastel 15deg rainbow, washed the text pale under
  the light and could never darken the gold. Now, scoped to
  `:is(.era-sv, .era-me):not(.foil-scodix)` at the end of `sv-fullart.css`:
  `.foil` is a warm radial light pool dodged at `brightness(.7)`, the etch
  floor drops from 40% to 22% so the light follows the lines, the glitter is
  quieter, and the hard-light `.glare` carries the gold-to-olive ramp (far end
  34% grey, never dark dots) plus the band at about half alpha (300%, `k` 1:
  0.7 spectra a sweep by `rainbow_motion.py`). The glare is masked by the
  foil map twice (art, map, map, `intersect, intersect`): squaring the map
  keeps the band and the shade off the ink and gives the half-foil Pokémon a
  quarter of it, which matters on the coloured SV golds (Koraidon ex 254).
  The Sword & Shield golds keep the recipe above (their sheet only changes
  the filter), and the Paldean Fates Scodix golds keep `shiny-vault.css`.

## Special Illustration Rare

Rebuilt 2026-09-28 (Noah: "sir are supposed to have texture yet this looks
like an ar card", Team Rocket's Mewtwo ex and Cynthia's Garchomp ex, Destined
Rivals). Rules: `css/holo/celebration.css`, `.foil-sir.has-foil-map`, on
every SIR of every set with `has-foil-map` (all SV sets, the 30th, and the
fallback-map ME, Black Bolt and White Flare prints).

- **What the real card does** (photos in `/mnt/project-files/*/texture-refs/`:
  151's Charizard ex macro, Surging Sparks' Latias ex and Milotic ex
  close-ups, Paldean Fates' Charizard ex and Mew ex, 151's Erika's
  Invitation in hand): the whole face is foil, frame and text box included.
  Fine engraved lines follow the painting edge to edge and cross the
  Pokémon; they are what lights up as the card turns. Over that, a sand of
  fine glitter, and a broad pastel rainbow that drifts across the whole
  card rather than two bars. The Pokémon is matte ink with less sheen (TCG
  Live's map holds it at nothing and the background at a third to a half).
- **Where** (foil map): Live's SIR maps are dark on the Pokémon and on
  figures (Giovanni), a third to a half on the background, full on the
  frame. Left alone that made the frame glitter and the art flat.
- **Foil** (`.foil`, the rest layer): the 15deg `--spectrum` rainbow at
  240%, color-dodge, brightness 0.68 contrast 1.5 (saturate 0.4 at rest,
  so the frame rests silver). Its mask is `var(--art), var(--sir-map),
  var(--sir-etch), var(--sir-floor)` with `mask-composite: intersect,
  intersect, add, add`: the etch, with a 45% floor between the lines, cuts
  the rainbow and everything inside `.foil` to the relief. `--sir-map` is
  the Live map, or a flat 45% on tile prints; `--sir-etch` is `--etch-map`
  at `100% 100%`, or `--etch-tile` at `100% auto`, repeating, from
  `--seed-pos`.
- **Light** (`.foil::before`, hard-light): one broad band
  (`calc(var(--rotate-x) * -0.25 + 100deg)`, 300%, sliding with
  `--background-y`) screened over a radial pool at the pointer (#8e 0%,
  #6c 45%, #3c 100%), contrast 0.9. Hard-light with mid grey is neutral,
  so the far corners dim rather than go black, which is what the old pair
  of narrow bars did (`#000` outside them gated the rainbow off).
- **Sand** (`.foil::after`, plus-lighter): `--holo-glitter` twice, 26% and
  15%, drifting against each other by 4px with the pointer; brightness 1.35
  contrast 1.9; opacity 0.16 + 0.3 from-center (was 1.5 / 2.2 / 0.3 + 0.45
  until 2026-09-28: the Mew ex photos show a pinpoint grain under the
  sheen, and Noah found the sand "a little overpowering").
- **Glare** (`.glare`, hard-light, 0.85 card-opacity): 62% at the pointer,
  47% at 55%, 34% far. Hard-light, not multiply, so the lit lines below
  brighten the card.
- **Lines** (`.glare::after`, masked by `--sir-etch`, whole card): white at
  0.7 under the pointer, 0.4 at 25%, 0.2 at 60%, 0.12 at the far edge.
  Never off, so the relief shows at every pose, over the Pokémon too.
- **Scarlet & Violet tone-down** (2026-10-02, Noah: "overuse of the
  rainbow glare"; Hilda 171): Live's SV SIR maps hold about 0.7 of the card
  against about 0.3 on the ME ones, so the same rainbow put a pastel haze
  over SV paintings under the light and the etch read faint. `.era-sv`
  SIRs take a 12% floor between the lines (was 45%) and a paler, darker
  dodge (`brightness(.62) contrast(1.5) saturate(.55)`); the ME SIRs keep
  the recipe above, which Noah liked in #147.
- **Black Bolt and White Flare have Live maps after all** (keys `zsv10-5`,
  `rsv10-5`, found 2026-10-02; #228): their SIRs, URs and BWRs now carry
  the real foil and etch (`<n>-etch-live.webp`), and their drawn `-v3`
  etches are unused. The paragraph below still holds for the ME Black Star
  promos.
- **Drawn prints** (`has-etch-map has-etch-drawn`, `js/foil-maps.js`): the
  ME sets, Black Bolt, White Flare and the ME Black Star promos have no
  Live etch, so each of their 202 etched prints carries a map drawn from
  its own scan by `scripts/make_card_etch.py` (2026-09-28, Noah: "every
  texture unique to each card"): a structure tensor gives the direction of
  the drawing's edges, eased into a slow seeded sweep where the art is
  flat; that direction only steers a fingerprint of short, curving 2.6 px
  ridges (white noise band-passed in 24 orientations, mixed near the
  drawing's direction), redrawn as `-v3` on 2026-09-29 after the straight
  facet gratings of the first draw still read as a diagonal screen on
  Espeon ex MEP 108; thin near-neutral ink (outlines, lettering) is left
  smooth, wide dark fills are hatched like colour. 400 px wide, white with
  the etch as alpha, about 165 KB each. The recipe keeps the flat 45% in
  the Live map's place, as the tile had, since the foil map is the white
  fallback. `assets/foil/sir-etch.webp` (`scripts/make_sir_etch.py`, a
  seamless diagonal hatch) remains only as the `has-etch-tile` fallback for
  a print nobody has drawn yet; `sweep_finishes.py` fails on one. No
  whorls in either: closed rings read as op-art on a phone, the fault PR 50
  removed. Judge at `--scale 3`, `w=220`; at desktop size in the lab the
  lines vanish into grey.
- **Neighbours untouched**: the generic etch glare
  (`.tcg.has-etch-map.has-etch-map .glare::after`) still serves the
  Futuristic Rares and gold Hyper Rares; the SIR rules win on specificity.
  Double Rares and Mega Attack Rares keep their own recipes.
- **Verify**: `--idle` reports 0 ms and no running animations (2026-09-28).
  `set=sv10&cards=231,232`, `set=sv4pt5&cards=232,234` (against the PAF
  photos), `set=sv3pt5&cards=199,203`, `set=zsv10pt5&cards=167,164` and
  `set=me1&cards=177` (tile), `set=me55&cards=147,158` (SIR beside a
  Futuristic), all with `&proof=off&maps=1&w=300&poses=rest,30:25,70:60`
  and `--width 700 --scale 2`.

### Gold relief (2026-09-28)

Noah asked for "a little bit of texture" on the golds (Iron Crown ex
216/162, Temporal Forces). White lit lines alone read faint on bright gold
ink, so the gold `.foil` is now cut to the etch like the SIR's (art, map,
etch with a 40% floor; `--fa-etch` picks the Live map or the tile), with
brightness 0.62 lit and 0.6 at rest to pay for the cut. The sheen and the
two glitter tiles then follow the engraving, and the relief shows at rest
as well. The UR light pool and the gold glare2 are unchanged. ME Mega
Hyper Rares (no Live etch) come along through their drawn maps. Photos:
Paldean Fates' Koraidon ex macro (glitter dots over a fine gold line
texture) and Chien-Pao ex (crinkle texture under the glitter).

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv4&cards=218,229,240,260,264&poses=rest,30:25,50:50,75:70&proof=off" --out /tmp/fullart.png
```

218 Armarouge ex and 229 Roaring Moon ex (Pokémon Ultra Rares), 240
Professor Turo's Scenario (Supporter Ultra Rare), 260 Garchomp ex and 264
Counter Catcher (gold). Add `&w=420` to see the etch. Brightest golds and a
pale Supporter: `set=sv1&cards=253,254,257,238&poses=30:25,70:60`.
