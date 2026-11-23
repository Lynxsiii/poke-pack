# Holo family swsh-gallery: Sword & Shield Trainer Gallery / Galarian Gallery character rares

Module `js/fam/swsh-gallery.js`, sheet `css/holo/fam/swsh-gallery.css`, grain generator
`scripts/fam/swsh-gallery/make_grain.py` -> `assets/foil/fam/swsh-gallery/grain-v1.webp`. Built 2026-11-23 from the audit
w2-swsh-gallery (`/home/user/holo-work/w2-swsh-gallery/AUDIT.json`).

## Scope (census 2026-11-23: 68 faces)

Exactly what `swshPattern()` files as `foil-ex swsh-tg` ("Trainer Gallery Rare Holo"): BRS (swsh9), LOR (swsh11), SIT
(swsh12) TG01-TG11/12 and Crown Zenith GG01-GG34. The gallery V / VMAX / VSTAR / Trainers / golds belong to
swsh-fullart, swsh-vmax and swsh-gold. Astral Radiance's 12 character rares (swsh10 TG01-TG12) share this finish but
the data files them "Rare Holo", so swsh-holo claims them; moving them here needs a `js/foil-maps.js` routing change
and swsh-holo's agreement.

## The real finish (photos: /home/user/holo-refs/w2-swsh-gallery, SOURCES.md there)

- Foil is the scenery only; Pokémon, people, yellow border, name, HP and black text are matte. TCG Live's per-card map
  (all 68 shipped) encodes exactly this.
- A fine dense sand grain (1-2 device px at 220 CSS px x3) under the colour; white points in dark ink.
- Lit: a broad smooth rainbow near the light with several hues at once (Hisuian Goodra GG21: cyan, green, yellow,
  orange, red over a third of the card). Pastel over pale art (Octillery TG03, Altaria TG11), vivid over mid tones,
  dark ink keeps its depth.
- Flat: almost plain print with a faint shimmer.
- No etched lines: Live ships no etch for TG01-TG11 / GG01-GG34; the Milotic TG02 waves are scanner moire.

## What the sheet does

`.foil` dodges a smooth two-cycle spectrum (115 deg, 160% so about four hues cross the card, sliding with
--background-x/y) times a pool round the pointer, masked by art x Live's map. At rest it paints only the grain at 0.4.
`.foil::before` screens the grain into the dodge group, masked by a wider pool. `.foil::after` (the era's hard-light
magenta ellipse) and `.glare::after` (the shared SIR engraving tile, which landed on the matte figures) are off;
`.glare` is a faint soft white gloss that fades out instead of the era's grey-ended radial.

## Lessons

- Colour-dodge with a saturated spectrum times a dark-ended pool keeps dark ink dark (Comfey GG14, Duskull GG28) and
  only tints pale ink; the era's contrast(2) single-hue band was what made the milky sheets.
- Hue bands at 230% left one hue over a whole region (a lemon sheet over Parasect TG01's brown ground at 75:65);
  160% puts two or three hues near the light. Warm-brown grounds still go fairly yellow near the light: the main
  thing to watch in review.
