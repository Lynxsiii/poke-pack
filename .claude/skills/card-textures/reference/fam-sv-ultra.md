# Holo family sv-ultra: Scarlet & Violet full-art Ultra Rares

Module `js/fam/sv-ultra.js`, sheet `css/holo/fam/sv-ultra.css` (every rule scoped to `.fam-sv-ultra`), band generator
`scripts/fam/sv-ultra/bands.py`. Holo accuracy overhaul, 2026-10-22 (audit group `w2-sv-ur`).

## Scope

Every non-reverse face whose rarity after `foilLook()` is "Ultra Rare" in the Scarlet & Violet sets (`sv<n>-`,
`rsv10pt5-`, `zsv10pt5-`) and the SV Black Star promos (`svp-`, which carry no `era-sv` class), drawn on a foil map:
the app's plain `foil-ultra` pattern. Not the Tera ex (`foil-ultra foil-tera`, family sv-tera), the Shiny Ultra Rares
(sv-shiny), the Scodix golds or the Hyper Rares (`foil-gold`). 225 faces on 2026-10-22, exactly the census group (era
sv, `foil-ultra`, not `foil-tera`, not `foil-shiny`). Every face has TCG Live's foil and etch maps in the data; the
family ships no asset.

## The real card (photos: /home/user/holo-refs/w2-sv-ur, sources in its SOURCES.md)

TCG Live: SUN_PILLAR / ETCHED, the same stock for Pokémon ex and Supporter full arts in every SV set.

- Where: the whole face is foil under the ink; Live's map holds the frame at ~0.96 and the figure at 0.4-0.9 by ink
  density. The maps are right; do not redraw them.
- Colour, tilted: several narrow, parallel, diagonal rainbow bands at once (4-8 across the card), each a compact
  red-to-violet spectrum a few percent of the card wide, of uneven strength; between them the ink keeps its printed
  colour (Koraidon 231 in hand, Arven 235 tilted, Judge 228 same set as Clive). Strongest toward grazing angles.
- Colour, flat: no rainbow at all; saturated art, grey-silver frame, the etched relief (Latias 220 flat light,
  Glimmora 213 on a stand, Alakazam 188 video frame).
- Dark ink stays dark: a band over black or navy clothing is a thin, dim streak (Judge 228's shirt). Medium confidence.
- Texture: fine fingerprint etch over the whole face at every angle; a fine glitter grain on light inks (Nemona 229's
  skin, Miraidon 227's belly); a pebbled silver frame (Latias 220 macro).
- Frame: bright silver with a rainbow edge at an angle; away from the lamp duller silver, never dark grey.
- Photos of the sample cards themselves exist only for Glimmora 213 (and Judge 228 / Nemona 229 of Clive's set); the
  rest is cross-set photos of the same stock.

## What the site drew before (css/holo/sv-fullart.css, Ultra Rare section) and why it was wrong

A vertical sun-pillar ramp colour-blended over 128.5deg tinsel bars, colour-dodged at contrast(2.2), plus an exclusion
twin on `::after`: a broad pastel wash over the whole art (pink/lavender at 30:25, green/mint at 75:65). Pale art went
milky, dark ink neon (Clive's jacket, Larry's Skill), teal outlines glowed cyan, the frame went dark grey away from the
lamp (glare far end ~32-42%), no glitter, no relief at rest.

## The recipe (2026-10-22)

- `.foil` (colour-dodge onto the scan, masked by the art and Live's foil map): black, which the dodge leaves as it is,
  plus Live's etch seen through a black veil (16% lit, 14% at rest): the lines lift by up to a sixth, so the relief
  reads on light ink and the frame held flat. It is the only layer a resting card paints.
- `.foil::before`: the bands' light, screened onto the black. A repeating 120deg gradient on a tile twice the card;
  one period (26% of the tile's line, ~0.8 card widths) holds three bands of uneven width and strength (strong, weak,
  medium), black between; each band's brightest channel is at most 0.5, so the dodge gain is at most 2 and near-black
  ink stays near black. Opacity `clamp(0, (pointer-from-center - 0.12) * 1.8, 1)`: none held flat, 0.8-0.95 at the
  probe's lit poses; weighted by a soft pool round the pointer (full to 22%, 0.4 at the far corner).
- `.foil::after`: the sparse fine glitter tile (`assets/foil/glitter-fine.webp`, 45%), screened, 0.18 + 0.27 x
  from-center: the dodge lights it on pale ink only, under the bands.
- `.glare` (hard-light): 58% grey at the pointer, 50% by half the card, 47% at the far end: a soft lift near the
  lamp, silver away from it (the old far end at 32-42% darkened the frame).
- `.glare::before` (new layer): the same bands as tints multiplied onto the glare's grey (white between). Under the
  hard-light a tint takes the other channels down where the dodge lifted one, so a band reads as a saturated spectrum
  on the silver frame and on pale ink instead of a white streak. Same gate, pool and position as `::before`.
- `.glare::after`: Live's etch lit white over the whole card, as before, a little softer near the pointer (0.4 there,
  was 0.55: Live's etch is half line, and the brighter lines washed the art round the pointer).
- Motion: both band layers sit at `calc(100% - --background-x) --background-y` on the 200% tile, inside 0-100% (no
  seam). `rainbow_motion.py` on Durant 215: 0.91 spectra per sweep across, 0.94 down. (`rainbow_speed.py` reads one
  period of three bands as one cycle, 0.29; the true band rate is about three times that, still under 1.5.)

Checked in WebKit at 220 px x 3 against the photos (before/after sheets in /home/user/holo-work/fix-sv-ultra/ba-*.jpg):
Clive's jacket and Larry's Skill's suit stay dark, Durant's shell stays grey between bands, the teal outlines stay teal,
Whimsicott, Meloetta and Lisia keep their pastel print, Wo-Chien's Pokémon has no sheen, the frame stays silver at
75:65, the etch shows at rest. All 225 faces seen on Chromium contact sheets at 40:30
(/home/user/holo-work/fix-sv-ultra/contact/): no card without foil, no broken mask.

## Open

- sv7-svp165 Terapagos ex (promo, foilAs Ultra Rare): a Tera (Stellar) Pokémon printed with a rainbow border and
  crystal art, filed without the `Tera` subtype, so it falls in this family; its Live map leaves the border almost
  unfoiled (0.27). If the real card is on the Tera stock, add `"Tera"` to its subtypes in data/sv7.json and it moves to
  sv-tera. Not done here (data file outside this family's paths); no tilted photo of the real card found yet.
