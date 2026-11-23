# Holo family swsh-vmax: Sword & Shield regular VMAX and VSTAR

Module `js/fam/swsh-vmax.js`, sheet `css/holo/fam/swsh-vmax.css`, generator `scripts/fam/swsh-vmax/bands.py` (writes
the band gradients into the sheet). No assets: the texture is TCG Live's own `-etch-v4` map (`--fa-etch`, set by
css/holo/sv-fullart.css from `--etch-map`). Built 2026-11-23 from the audit w2-swsh-vmax.

## Scope (167 faces, census 2026-11-23)

Exactly the faces `swshPattern()` files as `foil-ultra swsh-vmax` ("Rare Holo VMAX", 111) or `foil-ultra swsh-vstar`
("Rare Holo VSTAR", 56). Not the Shiny Vault VMAX (`sf-shiny sf-vmax`) nor "Rare Ultra" VMAX/VSTAR (`swsh-alt`).
Classes: `svm-vstar` (56), `svm-alt` (26 Trainer Gallery / Galarian Gallery TG/GG numbers: bands and tint capped 0.65).

## The real finish (photos: /mnt/project-files/sword-shield/texture-refs/vmax/ and vstar/, copies in
/home/user/holo-refs/w2-swsh-vmax; the audit's own photo set did not survive)

- Whole face foil, Pokémon included; only black ink dark (Charizard VMAX DAA 020 in sleeve, Leafeon VMAX EVS 008 on
  wood, Flying Pikachu VMAX CEL 007 per the audit).
- Fingerprint/contour etch over the whole card = Live's -etch-v4 map; lit, the ridges carry the colour.
- Lit: parallel rainbow bands rising to the right (~60deg), several hues at once, about an eighth of the card wide, on a
  silver lift. Room light: close to the print. VSTAR: paler pastel bands (Charizard VSTAR BRS 018).

## What was wrong (era: sv-fullart.css + swsh.css)

Foil invisible at phone size (etch near zero, dodge at brightness 0.4-0.8 in a pointer pool); straight swsh-streaks
hairlines the real cards lack; a colour-blended sun pillar flooding a third of the card with one hue (Rillaboom lime,
Zeraora's black chest teal).

## How the sheet draws it (full-art architecture)

- `.foil` colour-dodge masked by art ∩ (Live map ∪ 0.5 floor): the etch at 0.58 lit / 0.38 rest plus a silver light
  pool, multiplied by the scan. This is what the Pokémon mostly shows lit: silver ridges.
- `.foil::before` band set A (120deg, sized 200%, three uneven bands per 23% period) and `.foil::after` band set B
  (113deg, sized 260%, two bands per 37% period, sliding the other way, 0.8 strength): the two never line up. Each is
  times a breaker along the bands (30 / 24deg, uneven on/off) and the scan's luminance, screened into the dodge. Mask:
  a tight pointer pool (full to 15%, 0.55 at 40%, 0.05 at the far corner) ∩ Live's map twice ∩ (etch ∪ 0.4 floor).
  Live's VMAX map shades the Pokémon darker than the background (Flying Pikachu 91 against 145-210), so the squared map
  puts the colour on the background and frame and leaves the Pokémon mostly silver. Light: VMAX A 1.0 / B 0.75, VSTAR
  0.8 / 0.6 (high because the squared map and the pool take most of it away).
- `.glare` set A's pastel tint through the inverted scan (VMAX saturation 0.42, VSTAR 0.32), broken by the inverse
  breaker, masked by art ∩ map² ∩ (etch ∪ 0.35 floor), faded to nothing away from the pointer. `.glare::after` off.
  No streak tile, no sun pillar, no hard-light glare.
- Checked 2026-11-23, WebKit 220 px, one card per render, seven poses: cel25-7, swsh4-141, swsh8-23, swsh12pt5-54,
  swsh9-18, swsh12pt5-GG47 (plus earlier passes on swsh35-15, pgo-31, swsh11-136 and Chromium contact sheets of all
  167). Dark ink stays dark at 75:65 (Zeraora), no single-hue sheet (Rillaboom), no even stripe repeat over a large pale
  Pokémon (Flying Pikachu, Togekiss), the etch reads as contour ridges at native pixels.
- Tuning history: a single band set repeating evenly (light 0.5, then 0.34) read as a ruler pattern over Flying Pikachu
  and Togekiss (lead review); squaring the map at the old light (0.6) made the bands vanish at native pixels.
