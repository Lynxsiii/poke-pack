# Family dp-prime: Pokémon Prime (HeartGold & SoulSilver)

Scope: the 26 numbered Rare Primes of hgss1-hgss4 (hgss1-105..110, hgss2-84..89, hgss3-81..86, hgss4-91..98) and the three
HGSS promos hgss1-hsp07, hsp08, hsp09 (Prime print, `foilAs: Rare Prime`). 29 faces, all claimed. Celebrations Classic
Collection Gengar Prime and SWSH Dragapult "Prime" are other eras' prints and are not here.
Files: `js/fam/dp-prime.js` (claims + per-card map urls, `cure: true`), `css/holo/fam/dp-prime.css`,
`assets/foil/fam/dp-prime/` (`<id>-zones-v1.webp`, `<id>-gold-v1.webp`, `glitter-v1.webp`, `twinkle-v1.webp`),
`scripts/fam/dp-prime/make_prime_maps.py` (seeded; reads the scans in assets/cards/hgss*/ and data/hgss*.json).

## What the real card does (photos: /mnt/project-files/holo-remaster/dp-prime/refs/, 6 sources: Bleeding Cool hand photos of
Mew hgss4-97 and Umbreon hgss3-86, Pokemon Holo Typhlosion promo clip, a Typhlosion 110 short, Steelix/Lanturn/Gengar frames
of a top-10 video)
- The FRAME is foil, not the art. The outer band is bare mirror-silver with a glitter emboss: dark with coloured sparkles when it
  reflects a room, bright cream when it catches a lamp (a printed yellow ombre tints it).
- The spikes round the art window, the name plate, the STAGE tab, the Evolves-from strip and the Illus. pill are white ink
  over foil: bright satin, they never go dark.
- The NAME LETTERING, the ring round the evolution portrait and one of the two HP slashes are GOLD foil.
- Matte print: the art, the text box, the type stripes, coloured plates, HP digits, symbols.

## What is built
- Zones map (alpha: band 1, white-ink satin 0.59, else 0), drawn by registering the 26 set scans (pixel-registered, median =
  template frame) and ECC-warping the template onto the three tighter-cropped promo scans; the gold map is read from each
  card's own scan (name row only, solid gold, hue 28-62, 74 on the olive promo scans; Lightning's yellow symbol excluded).
- `.foil` = frame sheen (pearl cast, one broad saturated rainbow band that slides with the tilt, lamp pool at the pointer),
  normal blend, masked to scan x zones. `::before` = a narrow rainbow lobe (the flash at grazing angles). `::after` = the
  glitter: fleck field (alpha) x on/off blobs (luminance, slides with the pointer) as the mask over a spectrum, so each fleck
  lights, goes out and changes colour (light colours only, no black). `.cure` = the gold gleam over the gold map (screen).
  `.glare` = a soft-light gloss on the frame only. Nothing paints the art or the text box.
- Colour-dodge is not used (the frame scans cream-white: dodge/screen cannot add colour to near-white, the first era pass
  just bleached the spikes). Translucent colour in normal blend gives the colour.

## How to judge
Lab: `foil_probe.mjs --query "set=hgss3&cards=86,81&proof=off&w=220&poses=rest,30:25,75:65,50:78" --width 1000 --scale 3`
(add `&fam=off` for the era look). Art and text box must be identical to the bare card; the band and spikes carry the colour.

## Open
- The promo scans (hsp07-09) are cropped tighter and their gold/white zones come from a warped template: check them in the
  real app (`site_cards.mjs --set hgss1 --ids hsp07,hsp08,hsp09`), the lab does not draw promos with foilAs.
- The glitter field is one shared 1200 x 1676 fleck map: at 220 css px the flecks are sub-pixel, so on a 3x phone they read as
  fine sand; the on/off twinkle is what carries them.
- Not reviewed by a fresh pair of eyes yet; settings sweep (strength low/high, shine off, Classic) done only by reading the CSS.
