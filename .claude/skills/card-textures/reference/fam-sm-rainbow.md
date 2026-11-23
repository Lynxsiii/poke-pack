# Family sm-rainbow: Sun & Moon Rainbow Rares

Module `js/fam/sm-rainbow.js`, sheet `css/holo/fam/sm-rainbow.css`. Claims exactly the faces `smPattern()` files as
`foil-ir sm-rainbow`: 147 faces in the census of 2026-11-23 (sm1-sm12, sm35, sm75, sm115, plus the promo prints
sm35-smp080, sm75-smp155 and smp156 filed foilAs "Rare Rainbow"). All were unclaimed before.

## Real finish (audit w2-sm-rainbow; photos in /home/user/holo-refs/w2-sm-rainbow, SOURCES.md there)

- The rainbow is printed, pastel, static: the scan has it.
- The whole face is foil (TCG Live map), text ink matte. A dense fingerprint etch at about 1% of card width (Live's
  `-etch-v4` map) reads as relief even on flatbed scans (Lapras sm1-151, Palkia sm6-132, Rowlet sm11-237 scans).
- Lit: a bright warm-white hot spot, the crests catching the light.
- The audit also called for a diffractive spectral halo. Not added: Noah rejected exactly that on 2026-10-02
  ("rainbow glare", sun-moon-fullart.md "Secrets rebuild"), and over a printed rainbow it reads as a second sheet.

## What the sheet does (2026-11-23)

- `.foil`: Live's etch (grey crests under a 30% veil) over a dark grey, `soft-light`, masked by art x map: grooves
  sink, crests lift, black ink stays black. Visible at rest (0.85) and lit (1).
- `.foil::before`: a warm-white pool round the pointer screened into the group through the etch alone (image mask),
  so near the light the crests glow and the grooves stay dark.
- `.foil::after`: a soft warm hot spot screened into the group. `.glare`: faint white soft-light gloss.
  `.glare::after`: off. The era's glitter tile is gone (no glitter on the real card).
- Pseudo-elements paint inside `.foil`'s blend group, so they raise the soft-light source; they are not separate
  blends onto the card.
- Gradient masks composited with the map are dropped by WebKit: fade a layer with a cover gradient painted in that
  blend's no-op colour instead.

Measured (art crop, Gaussian 4 px high-pass on 696 px cells): Lurantis sm1-150 rest 10.9 -> 14.0, 75:65 8.0 -> 11.7.

## Left

- The promo prints use 400 px etch maps (sm35/smp080-etch.webp, sm75/smp155, smp156): ridges are softer than their
  siblings'. A native 733 px map would need a new asset name and a data change outside this family.
- `css/holo/sm-fullart.css` still holds the old "Rainbow Rare" section; this sheet overrides it (it could be deleted
  by the lead once this ships).
