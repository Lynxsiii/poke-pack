# Wizards of the Coast era (1999-2003: base1-base6, gym1-gym2, neo1-neo4, ecard1-ecard3, si1, basep, bp, theme decks)

Built on 2026-10-01 by the "Every era, every set" thread: a scaffold agent
(s-wotc), five set builders (w1 to w5; w5 took the promos, Best of Game and
the theme decks), three finish agents (j1 to j3) and a fresh-context reviewer
per family (rv-j1 to rv-j3, each with follow-ups). Era overview; every set and
finish family has a note of its own, linked at the end. Read this first, then
the set or family note you need.

## Shape of the era

| Piece | Where |
|---|---|
| Era plumbing (`isWotc`, `wotcPattern`, `wotcMap`, `wotcLayout`, `isCrystal`, `wotcReverseFinish`, `wotcLegendaryExtras`) | `js/wotc-foil.js` (hooked into `js/foil-maps.js` and `js/app.js`); `js/wotc-ecard-maps.js` (`ecardMap`, asked first for e-Cards); `js/wotc-special.js` (`specialPattern`, `specialMap`, `specialInk`, `specialReverseFinish`, called first by `wotcPattern`, `wotcMap` and `wotcReverseFinish`; `specialReverseMap` in `js/foil-maps.js`) |
| Three finish sheets, keyed by `era-wotc` | `css/holo/wotc.css` (cosmos and starlight window holos, the Legendary Collection fireworks reverse), `wotc-ecard.css` (e-Card holo, reverse, Crystal), `wotc-special.css` (Shining, promo reverses, the First Movie stamp) |
| Pack slots | `wotcSlots({commons, energy, holo, secret, reverseSlot, commonHolo, rareSpecial})` in `js/catalog.js`; `BASEP_PROMOS`, `BP_PROMOS`; "Rare Crystal" registered as a rarity |
| Foil maps | **TCG Live published none for 1999-2003** (probed 24 set keys, all 404), so everything is drawn from the scans: `assets/foil/wotc-win/` (one window for every frame), `wotc-spark/`, `wotc-ecard/`, `wotc-rev/`, `wotc-shining/`, `wotc-promo/`, `wotc-stars-v1.webp` |
| Scripts | `make_wotc_window_masks.py`, `make_wotc_spark_maps.py`, `make_wotc_fireworks.py`, `make_wotc_ecard_masks.py`, `make_wotc_ecard_holo_maps.py`, `make_wotc_crystal_masks.py`, `make_wotc_ecard_cosmos.py`, `make_wotc_shining_masks.py`, `make_wotc_shining_ink.py`, `make_wotc_promo_masks.py`, `make_wotc_stars.py` |
| Research, photos, sheets | `/mnt/project-files/every-era/wotc/research/`, `texture-refs/<family>/SOURCES.txt` (j1, j2, j3), `finish-sheets/<family>/` and `finish-sheets/<family>-review/`; the scaffold's decisions in `wotc/SCAFFOLD-NOTES.md` |

## How the sets are built

- **English Unlimited prints only**; 1st Edition and Shadowless are not
  separate cards. Every digital source serves the 1st Edition image for base1,
  base2, base3, base5, gym1, gym2 and neo1-neo4 (the black "Edition 1" stamp
  under the art), so the dealt scan is the stamped one; base4 and base6 are
  the right prints. A rescan or a retouch of the stamp is the fix.
- **Packs are 11 cards, e-Cards 9**: Base Set and Base Set 2 5 Commons, 3
  Uncommons, 2 of the set's own Energy and a rare slot; Jungle, Fossil, Neo
  Discovery, Revelation, Destiny and Team Rocket 7 Commons, 3 Uncommons and a
  rare slot; Gym and Neo Genesis 6 Commons, 3 Uncommons, 1 own Energy;
  Legendary Collection 6 Commons, 3 Uncommons, a reverse and a rare slot;
  e-Card 5 Commons (one the holo slot), 2 Uncommons, a reverse and a
  guaranteed plain Rare. A holo is 1 pack in 3 almost everywhere; Team Rocket's
  Dark Raichu (1 in 55) and the Neo Shinings (neo3 0.0364, neo4 0.0833) and
  Crystals (ecard2 0.0273, ecard3 0.0424) are sheet models from Elite Fourum.
- **Special cards**: base1-8 Machamp (the 1st Edition holo of the 2-Player
  Starter Set) and `base4-cdrom8` are `noPack`, dealt only by their products.
  Aquapolis and Skyridge Crystals are "Rare Secret" on pkmn.gg and become
  "Rare Crystal" through `rarityOverrides`.
- **Promos**: `basep` (53, one `event` product each; #51 and #52 are filed as
  `ecard1-basep51/52`) and `bp` Best of Game (9). `si1` Southern Islands is a
  `promoSet` plus `kitSet` with one collection product (18 fixed cards, no pack).
- **Theme decks** are pack-less products (`kind: "deck"`, `packs: 0`) with
  their featured holo as the one promo and a box-contents row of the other 59
  cards (36 decks, lists in `scripts/box-research/wotc*.json`); Thunderstorm
  Gift Box adds three packs. A deck with no TCGplayer price carries a manual
  price with its `priceSource`; decks with neither lists nor prices are left out.

## Finish families

| Family | Classes | Mask and recipe | Note |
|---|---|---|---|
| **Starlight**: Base Set, Jungle, Fossil and Legendary Collection holos: thin four-point stars on a pale shimmer; the Pokémon is ink over the foil | `foil-holo wotc-cosmos wotc-starlight` (base1, 2, 3, 6) | window `wotc-win/{pokemon,trainer,energy}-v1.webp` (measured over 1001 scans, so no separate Neo frame) times the scan's own sparkle, `wotc-spark/<set>/<n>-v1.webp` (216 cards); nothing is colour-dodged | [wotc-j1.md](wotc-j1.md) |
| **Cosmos**: Base Set 2, Team Rocket (and Dark Raichu), Gym, Neo, seven basep promos; Southern Islands is plain | `foil-holo wotc-cosmos` | same maps; a foilAs reprint takes its scan's map (CD-ROM Machamp) | same |
| **Fireworks reverse**, Legendary Collection: starbursts of thin rays over everything but the art window | `wotc-rev wotc-rev-legendary` | `wotc-rev/fireworks-lift-v4.webp` overlaid, `fireworks-rays-v4.webp` for the band; light only | same |
| **e-Card holo** (Expedition, Aquapolis, Skyridge): cosmos in the art window only, frame, name bar, text and the e-reader strip flat | `foil-holo wotc-ecard` | per-Rare-Holo map `holo-<set>-<n>-v1.webp` (96) on `wotc-ecard/cosmos-v1.webp` | [wotc-ecard-finish.md](wotc-ecard-finish.md) |
| **e-Card reverse**: one smooth mirror over everything but the window and the bottom strip, broad bands, no pattern | `wotc-rev wotc-rev-ecard` | `wotc-ecard/body-*-v1.webp` | same |
| **Crystal** (ecard2 148-150, ecard3 145-150): the mirror on the body and cosmos in the window BACKGROUND, the Pokémon clear | `wotc-crystal` | per-card sparkle-density masks | same |
| **Shining**: neo4 106-113 the Pokémon figure is smooth mirror metal; neo3 65, 66 the BACKGROUND is a silver star field | `foil-holo wotc-shining[ wotc-shining-bg]` | `wotc-shining/<set>-<n>.webp` (10) and `neo4-<n>-ink.webp` | [wotc-special.md](wotc-special.md) |
| **Promo reverses**: basep 34 Entei, 35 Pichu; bp 1, 2, 3, 8, 9: dark star-field mirror inside the border, art window and banner plain | `wotc-rev-promo wotc-rev-<neo\|baby\|rocket\|trainer>` | `wotc-promo/{neo,baby,rocket,trainer}.webp` plus `wotc-stars-v1.webp` | same |
| **First Movie stamp** (basep 2-5): flat card, only the gold stamp glints | `wotc-stamp` | `wotc-promo/stamp-firstmovie-v2.webp` | same |
| Plain Rares, Commons, Energy, Southern Islands, flat promos | `foil-none` or no class | none | the set notes |

## What the independent reviews caught

- **e-Card flakes over the Pokémon.** The shared window mask let the added
  cosmos sit on Gengar's near-black belly, Mewtwo's legs and Umbreon's body,
  where it read as white blocks stuck on the drawing; the clips show the dots
  in the sky and the ground and the Pokémon nearly clear. Per-card maps (window
  times the scan's smoothed sparkle density, 0.22 floor) fixed it for every
  e-Card holo. Do not draw a mask from the scan's std image: text-box
  texture leaks in; the mean-image gradient fill does not.
- **A tile with a radius applied twice** made dots four times too big (check
  at 1x), and **a regular grid of dots reads as a grating**: fuse dots into
  flakes, jitter, vary size.
- **Smooth mirror foil on a grainy scan.** The Shining figure is one
  continuous rainbow with a soft highlight in the photos; ours read as sandy
  glitter at every tilt, because the scans carry the foil baked in as a grain
  and any layer that lights the scan (dodge, screen, even with `::before`
  off) amplifies it. **Do not light the scan: cover it** with an opaque,
  smooth normal-blend layer on the figure mask and **bring the printed lines
  back through a map** (`neo4-<n>-ink.webp`: black-hat strokes plus the scan's
  own form shading blurred at sigma 7 so the grain is gone).
- **The Shining band was too wide to read.** 150% of the card gave a figure a
  third of the spectrum (Steelix, Tyranitar one flat pink); 118% shows red,
  yellow, green, blue down the body and still moves (105% barely moved).
- **The Legendary Collection reverse needs a light-only recipe, visible at
  rest.** The real one is high-key: silver-white paper, white starburst rays,
  readable ink. v1 (pale veil) vanished on the pale frame; v2 (normal-blend
  paint) darkened the paper and washed the ink; v3 (multiply a burst sheet) was
  strong at rest but read as a dark, grimy olive film, built to pass
  `dark_specks` and the wrong look. v4 only ever adds light: an overlay group
  whose every channel stays at or above 0.5 (overlay then never darkens),
  screened tint, pointer pool on tilt, rays +40 to +80 levels at rest. Keep the
  veil floor near 0.3 (0.44 washed the flavour text). Near-white paper has no
  headroom (Pikachu's cream text box rises only a few levels): a light-only
  layer cannot draw dark gaps.
- **The gate for a light-only finish is the proof, not the speck count.**
  Foiled render minus the bare print (foil and glare at opacity 0, same
  compositing path) must never fall below -2 levels at rest and three tilts
  (Chromium min 0, WebKit min -1). Hide the foil with `opacity: 0`, not
  `display: none`: that pulls the card out of the blend group, the print
  resamples, and fake -3 to -8 dips appear.
- **A foilAs reprint with no map drew nothing.** The CD-ROM Machamp
  (`base4-cdrom8`, scan `base1/8`) asked for a map that does not exist; a
  foilAs card now takes its scan's map.
- **One finding that the research got wrong.** The research says every
  Shining is the Pokémon only; true for Neo Destiny, false for Neo Revelation
  (Gyarados and Magikarp are background foil, three photos), so `wotcMap`
  returns the figure for neo4 and window-minus-figure for neo3.
- **The First Movie stamp mask was patchy** ("The First Movie" in pieces, a
  stray dash on the frame): redrawn from the Dragonite's outline as
  `stamp-firstmovie-v2.webp`; the four stamps line up to a pixel or two.
- **Mask-mode traps.** A map saved as L comes back as RGB without alpha: use
  `mask-mode: luminance` for it (a list `art, map` needs `alpha, luminance`,
  `-webkit-mask-mode` too), or the whole card lights pink. A pseudo-element
  inside `:is()` in a selector list drops the whole selector silently. A
  reverse's map comes from the finish name because `foilExtras` returns early
  for reverse prints. Chromium and WebKit disagree on a dodge through a mask
  group (WebKit reads the rainbow far more saturated): close it with
  `contrast(0.8)`.
- **Headless WebKit drops whole `.foil` layers** when five masked, blended
  layers are on screen at 3x; render sheets in batches of 3 and 2.
- **The sweep read data, not hooks.** `sweep_finishes.py` flagged
  `base4-cdrom8` as a holo promo with no map; it now skips `era: "wotc"`,
  whose maps come from `wotcMap()`.

## Open items

- **Glare not cut to the window.** The cosmos `.glare` shades the text box
  about 8 levels at 30:25 and lifts it about 9 at 50:78 (the EX cosmos does the
  same). If the text box must be dead flat, mask `.glare` with the window box.
- **Starlight versus cosmos labels.** Legendary Collection starlight is j1's
  call (one text source, Collexy, the scans agree: low-medium); Fossil rests on
  one source family, and the Collexy photo of Dragonite shows dots on a dark sky
  where the scan shows a rainbow sky with stars (the recipe follows the scan).
  The sparkle maps carry short horizontal dashes where the scan bands
  (Machamp, Dragonite): faint streaks at 30:25.
- **e-Card.** The Crystal body mirror rests on one tilt clip plus the scans;
  the reverse rest opacity (0.5) is untested against a photo; no basic-Energy
  reverse layout exists (`body-energy` stops at 0.65 H) but the sets deal none;
  Skyridge Crystal reverse prints are not modelled; the strip is matte though
  the real slots and e logo sparkle; an Expedition Rare Holo's reverse draws the
  holo scan, so its window keeps the printed cosmos; Classic mode paints the old
  grey marble over an e-Card reverse's text box (`css/app.css`).
- **Shining and promo reverses.** No tabletop photo of a Best of Game card;
  Pichu 35 is one Japanese-print photo; no tilt photo of a real 34 Entei, and
  ours goes blue-violet over the text box at a lit tilt; Neo Destiny's lit
  rainbow is louder than the photos; the other Shinings were tuned by the
  Charizard and Noctowl photos; the stamp mask is blobby (a hand trace would
  be cleaner).
- **No poke-holo.simey.me benchmark**: its certificate fails in the headless
  browsers here; the comparison is with the EX cosmos and the Collexy scans.
- **Not modelled.** Legendary Collection box toppers (oversize cards, not
  pkmn.gg cards), 1st Edition products, Tempest decks, the late Neo Destiny "error packs", the extra random reverse card
  real decks hold from Legendary Collection on.
- **Judgement items for Noah** (handoff): vintage sealed prices are huge but
  real thin TCGplayer numbers (Base Set box about $33k, Legendary Collection
  box about $90k); every scan above is the 1st Edition print; theme decks with
  no list or price (neo Hotfoot, Wallop, Dark, Tempest, 1st Edition products)
  are left out; Fossil wrappers show a 1st Edition stamp; the Neo Revelation
  Shining rate is a range (0.028-0.056) and 0.0364 is the model; older eras'
  crowns gift no gear.
- **Process.** `test-basep.mjs` needs `assets/cards/ecard1` in a sparse tree;
  `test-wotc.mjs` asserts the Legendary Collection holos are starlight and Base
  Set Charizard carries its spark map.

## Sets, oldest first

[base1](wotc-base1.md) Base Set, [base2](wotc-base2.md) Jungle,
[base3](wotc-base3.md) Fossil, [base4](wotc-base4.md) Base Set 2,
[base5](wotc-base5.md) Team Rocket, [gym1](wotc-gym1.md) Gym Heroes,
[gym2](wotc-gym2.md) Gym Challenge, [neo1](wotc-neo1.md) Neo Genesis,
[neo2](wotc-neo2.md) Neo Discovery, [neo3](wotc-neo3.md) Neo Revelation,
[neo4](wotc-neo4.md) Neo Destiny, [si1](wotc-si1.md) Southern Islands,
[base6](wotc-base6.md) Legendary Collection, [ecard1](wotc-ecard1.md)
Expedition, [ecard2](wotc-ecard2.md) Aquapolis, [ecard3](wotc-ecard3.md)
Skyridge, [basep, bp and the theme decks](wotc-basep.md).

Finish notes: [wotc-j1.md](wotc-j1.md) (cosmos, starlight, fireworks),
[wotc-ecard-finish.md](wotc-ecard-finish.md) (holo, reverse, Crystal),
[wotc-special.md](wotc-special.md) (Shining, promo reverses, stamp).
