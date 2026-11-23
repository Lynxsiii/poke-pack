# Family sv-shiny: Paldean Fates Shiny Rare / Shiny Ultra Rare

Module `js/fam/sv-shiny.js`, sheet `css/holo/fam/sv-shiny.css`. 149 faces (sv4pt5: 129 Shiny Rare, 20 Shiny Ultra Rare
incl. the SVP prints filed under the set). No assets: the TCG Live foil, etch and etch-angle maps are right.

## The real card (audit w2-sv-shiny; photos re-fetched to /home/user/holo-refs/w2-sv-shiny/, sources in SOURCES.md)
- TCG Live: SUN_PILLAR / ETCHED. SR: foil = art window (Pokémon part strength) + thin border; SUR: edge to edge.
- Ground is GREY mirror silver (~70% grey held flat, darker off the lamp), never paper white; printed sparkles,
  dashes and stars are not foil and read whiter than it (Oddish 092, Mew 216 diffuse photos).
- Fingerprint etch (wavy lines, ~0.9% of card width) in whorls round the Pokémon, visible in every light.
- Lit: SR one or two narrow diagonal bands near the light; SUR two or three broad saturated rippled bands over a
  darker ground (Mew 216 lit). Black text stays black over the bands. Pale Pokémon read mostly silver-tinted.

## What the family draws (2026-11-23)
- `.foil` multiply (art ∩ foil map): grey gap + white etch lines (`--etch-map`), times a light pool when held.
- `.foil::before` multiply: the band as a pastel tint, masked by a pool round the pointer and the foil map again.
- `.foil::after` screen: whorl arcs facing the lamp (etch-angle difference trick), soft.
- `.glare` color-dodge: the band, masked by art ∩ foil map ×3 ∩ pool ∩ etch map (rippled, near the light, little on the
  part-foil Pokémon). Rest: grey silver + etch only.
- `sv4pt5-svp072-stamp` (scan is a photo with glare baked in) gets `--foil-strength:0.55`.

## Lessons
- The era recipe's pastel repeating spectrum read as a flag stripe and a milky wash; colour must be pooled at the light.
- A tint layer not pooled paints the whole band length across pale Pokémon (Wigglytuff 222); pool it.
