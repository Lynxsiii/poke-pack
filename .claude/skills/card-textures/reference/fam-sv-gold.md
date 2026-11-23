# Family sv-gold: Scarlet & Violet Hyper Rare golds

Module `js/fam/sv-gold.js`, sheet `css/holo/fam/sv-gold.css`. Built 2026-11-23 from the audit
`/home/user/holo-work/w2-sv-gold/AUDIT.json`.

## Scope

Every non-reverse Hyper Rare on a Live foil map with a Scarlet & Violet id: census 2026-11-23, 76 faces = 65 plain
golds (SV_ULTRA / ETCHED; 12 of them gold Energies, `sgv-energy`) + 6 Paldean Fates Scodix (sv4pt5 240-245, `sgv-pf`)
+ 5 Prismatic Evolutions Scodix (sv8pt5 176-180, `sgv-pre`). Mega Hyper Rares (era me) are not claimed. No asset.

## The real card (photos)

- Miraidon 253 tilted and at the glare angle, Koraidon 254 heavy grain and rainbow flare (scarlet-violet/texture-refs);
  Pikachu 247 full and macro (surging-sparks/texture-refs); Wo-Chien 240, Chien-Pao 242 whole and macro, Ting-Lu 244 flat,
  Koraidon 245 (paldean-fates/texture-refs); Pikachu 179 PRE photo (holo-refs/w2-sv-gold/sv8pt5-176/s4/01.jpg).
- Plain golds: dense fine glitter sand over the whole card, Pokémon included; rings read at every angle; brass/olive off
  the lamp, lemon in strong light, champagne at the hot spot; a broad soft warm flare at some angles; black ink black;
  gold Energies keep their printed field colour.
- Paldean Fates Scodix: deep steel-teal ground, brass gold, very dense multicolour glitter, saturated level rainbow
  pillar. Prismatic Evolutions Scodix: brass ground with dense grain, bold BLACK line art, rainbow-glitter silhouette.

## What changed

- Plain golds (was sv-fullart.css: narrow hard 110deg band on a hard-light glare, which recoloured text, Energy symbols
  and the Energies' fields and lifted black ink to olive/blue; red-orange far side; invisible glitter): now after
  swsh-gold: `.foil` colour-dodge = black + warm pool + etch under a lamp; `::before` one broad soft warm flare (blue and
  violet weak), held to 0.12 on `sgv-energy`, which also gets a softer pool; `::after` fleck tiles; `.glare` overlay
  champagne-to-olive (black stays black); `.cure` the sparkle over the dodge, gated by the scan's luminance.
- Scodix (shiny-vault.css recipe kept): a grey-blue multiply in the hard-light group (teal to steel-teal, gold to brass,
  at rest too), the pillar 0.72 and about a fifth of the card tall, winks 0.75, plus the `.cure` sparkle.

## Prismatic Evolutions golds (sgv-pre), 2026-11-23 second pass

- Line art: `scripts/fam/sv-gold/make_pre_lines.py` traces it per card from Live's soft etch (`<n>-etch-soft.webp`): the
  strokes are thin ridges brighter than the hatched fills, so a white top-hat (etch-soft minus its 7x7 grey opening),
  a light blur, a threshold and a component-size filter isolate them; cut to the art window and off the printed ink
  (dark in the scan or empty in the foil map). Output `assets/foil/fam/sv-gold/sv8pt5-<n>-lines-v1.webp` (new, 2x the
  etch, smoothed: no aliasing at 220 px x3 in WebKit). A plain grey opening of the crisp etch kept hatch fragments
  (dotted strokes); the soft etch is the right source. The module sets `--sgv-lines`.
- `.cure` draws the lines multiplied over everything at every pose, resting too (an exception to "rest paints `.foil`
  alone", for these five faces only), so they stay matte dark ink above the foil and the glitter.
- No rainbow band (the Paldean Fates pillar read as a flag stripe here): `--pf-a: 0`, a warm multiply in place of the
  steel one, and `.foil::before` is the fleck glitter screened near the light with its hue turning slowly with the
  pointer, so colour comes only from the grain. The raised-varnish sliver (`.foil::after`) is off: it lifted the strokes.
- Left: the scans' silhouettes stay flat cyan/pastel under the grain (the real card's silhouette is a rainbow glitter
  foil); Iron Leaves 176's etch has few ridges, so its line art is lighter than the others'.

## Open

- Lit plain golds near the lamp still lean lemon on the brightest scans (Ogerpon 221, Miraidon 253 at 20:30-30:25).
