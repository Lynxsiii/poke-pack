# swsh-sf-shiny: Shining Fates Shiny Vault (swsh45 SV001-SV120)

Module `js/fam/swsh-sf-shiny.js`, sheet `css/holo/fam/swsh-sf-shiny.css`. Claims swshPattern()'s `card.gallery === "sv"`
faces minus the two gold Rare Secrets (SV121-SV122 stay with swsh-gold): 104 baby Rare Shiny + 16 shiny V / VMAX
(census 2026-11-23: 120 faces, all previously unclaimed). No assets: the data's Live maps are right.

## The real finish (audit w2-swsh-sf, photos in /home/user/holo-refs/w2-swsh-sf/, sources in SOURCES.md there)

- Baby shinies: foil in the art window only (Live foil map: window, gold sparkle stars cut out, Pokémon at about
  half). Grey mirror silver, 125-185 luminance held flat, never paper white (Zigzagoon SV078 flat eBay photo).
- Pattern: a fine herringbone / zig-zag maze etch (vertical chevron columns, about 0.35 mm pitch), the same as Live's
  `etchMap` (`-etch-v4`, alpha lines) and `etchHd` (RGB, white lines). On the Pokémon it reads as a fine hatch
  through the ink (Inteleon SV027, Dottler SV008 angled).
- Lit: broad rainbow rays across the silver near the light; the Pokémon keeps its printed colours (JP s4a Rowlet,
  Scorbunny video frame).
- V / VMAX: foil over the whole face (Live map, text box partly). Grimmsnarl V held: grey silver with the etch over
  the large white Pokémon, rainbow streaks only near the light; never a lavender wash.

## What the era recipe did wrong (css/holo/shiny-vault.css `sf-shiny`, still there for `?fam=off`)

Colour-dodge onto a white window changes nothing: window stayed paper white, no etch, no rainbow; the only colour
landed on the Pokémon's ink. V / VMAX went milky lavender / pink at every lit pose.

## The recipe (2026-11-23)

Same engine as the shipped sv-shiny family: `.foil` multiplies grey silver + the etch lines (lighter than the grey,
`lighten` blend, so both the RGBA v4 map and SV020's opaque etchHd fallback work) + a light pool round the pointer,
masked to art ∩ foil map. `::before` multiplies a soft uneven band tint near the light; `.glare` colour-dodges the
band, masked to the foil map three times, a pool and the etch lines. Resting: flat silver + etch, no colour.
`sfs-v` (V / VMAX) uses a lighter ground (gap 226, rest 230/222): at the baby values the etch gaps on Charizard
VMAX's pale ink failed dark_specks (120 specks at rest); at these values every sample passes.

## Left / lessons

- The rainbow is deliberately a narrow band near the light (reviewers reject full-window flag stripes); the JP
  Rowlet photo shows broader rays, so the band could be a little broader if the lead wants.
- A Shiny V's foil map includes text; check new V cards for etch over black text at native pixels.
