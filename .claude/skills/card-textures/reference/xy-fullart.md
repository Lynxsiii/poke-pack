# XY full arts, secret rares and the Radiant Collection (css/holo/xy-fullart.css)

Family f3 of the XY era (branch `xy/f3`): full-art Pokemon-EX and Mega EX (Rare Ultra,
`foil-ultra xy-fa[ xy-mega]`), full-art Supporters (`foil-ultra xy-fa xy-tfa`), secret rares
(`foil-ultra xy-fa xy-secret xy-secret-ex[ xy-mega| xy-shiny| xy-silver]`, gold Trainer Items
`foil-gold xy-secret xy-item`), Generations' Radiant Collection (`xy-rc`), Evolutions' secrets
(flat, `foil-none`). Classes come from `xyPattern()` in js/xy-foil.js. Photo research, with every
caveat: `/mnt/project-files/every-era/xy/texture-refs/f3/SOURCES.txt`. Contact sheets:
`/mnt/project-files/every-era/xy/finish-sheets/f3/`.

## What the real cards say

Evidence: YouTube tilt-clip frames (Pokemon Holo, Pokemon Cards Under Light and others) fix where the
foil is, the colours and how it moves; no macro photo was obtainable (YouTube download, eBay, Reddit
and PokeBeach are blocked from the container), so the micro texture comes from TCG Live's own maps
(below) and from Bulbapedia's "Textured Holofoil" note (XY full arts and secrets from Phantom Forces
on carry a raised, embossed surface).

- **TCG Live DOES have XY maps** (lead's correction, SCAFFOLD-NOTES section 0): key = the set id
  (`xy1`..`xy12`), Generations `xy9-5`, Double Crisis `xy5-5`, promos `xybsp`; none for xy0,
  McDonald's, the Trainer Kits or the Radiant Collection. For the full arts and secrets the foil map is a
  per-card text-safe map (white card, lettering and name bar black, rule box black) and the etch map is a
  contour/fingerprint line field that follows the art (xy1 141 Venusaur EX, 146 Xerneas EX). Gold items
  and Mega secrets of Phantom Forces and Flashfire have foil maps but a few have no etch map (xy2 107-109,
  xy3 112-113, xy4 120-121: foil only).
- Full-art EX / Mega EX: foil over the whole face, frame included; broad near-vertical prismatic bands
  (cyan / green / yellow one side, magenta / violet the other) sliding across as the card tilts, the
  Pokemon keeping its colours, the body text box a lighter satin. Photos: Sharpedo EX RJgXgNFw000,
  Dragonite EX Pb6l3nxsDQA, M Latios YPU5820uCxw, M Gardevoir K39MVDsrxJg.
- Full-art Supporter: tall, narrow VERTICAL rainbow columns over the whole card. Photos: TR's Handiwork
  KJJIW5LIyjY, AZ O6rQ2CeJ0us, Pokemon Ranger 9RejpvYFaAI.
- Gold-border secret EX / Mega: full art as above in a metallic gold border that flares white-yellow.
  Photos: Gyarados EX 8_XJ1Fz8pNk, Gardevoir EX wqXskr6FuP8, Mewtwo EX KAskvWocLSE. Dialga EX 122/119 is
  SILVER (white line art on silver, acR856cS6GQ).
- Gold Trainer Item: the whole card gold, a warm shimmer and a soft rainbow only low on the card, the white
  text box a pale satin. Photos: Weakness Policy 2pFphPUaJfg, VS Seeker n35taCKQ4es (one channel, medium-low
  confidence).
- Shiny full art (Ancient Origins 96-98): dark ground, gold and teal art, the brightest rainbow of the family
  (mnrbzZiLLSg, SBOLtXO8mN0, zBJhYXSKHlg).
- Radiant Collection RC1-RC32: yellow border, pastel art; confetti of small heart and star shaped foil over
  the whole card on a pale rainbow sheen, finer than the main-set full arts. Photos: Flareon EX
  FslHCZ1iu70, Sylveon EX tG0lo6Lrf5M, Altaria YMWp0GDViq0.
- Evolutions 109-113 secrets: yellow border, NOT foil (Scrydex lists only "normal"; two clips show no
  sheen at any tilt). `xyPattern` returns `foil-none`.
- poke-holo.simey.me's demo has NO XY card (only swsh); benchmark = the SWSH equivalents in
  `/mnt/project-files/holo-benchmark/` (same stock family as sv-fullart.css).

## Recipe

The family keeps sv-fullart.css's Ultra Rare layers (the same prismatic stock) and retunes them to
the photos; everything is keyed `era-xy` x5 so it beats the shared sheets.

- **xy-fa / xy-tfa** (`foil-ultra`; the Supporter's own bars were replaced in review, see the review section): `--fa-bars` re-drawn as `repeating-linear-gradient(100deg ...)`
  (EX: 100deg broad bars; Supporter: 94deg, narrower and denser); filter
  `brightness(calc(pointer-from-center * 0.45 + 0.5)) contrast(2) saturate(0.95) contrast(0.8)` lit,
  `brightness(0.55) contrast(2.5) saturate(0.4) contrast(0.8)` at rest (Supporter 0.15 and 1.9), always
  closing in `contrast(0.8)` (Safari divide by zero). Mask = `var(--art), var(--fa-light), var(--foil-map)`
  intersected: the card's own TCG Live map keeps lettering matte. Glare 0.6 (Supporter: grey radial 0.4);
  the etch twin on `::before` at 0.35.
- **xy-secret-ex** (gold border EX / Mega) and **xy-mega**: the same layers with a warmer sweep; the
  border rides the foil map. **xy-shiny** (xy7 96-98) the brightest variant. **xy-silver** (xy4-122): foil
  MULTIPLIED on (pale rainbow x silver ramp, floor above 80%, mask = `var(--art)` only, because a dimmed
  text box would show as a grey panel), etch as a soft grey relief, glare 0.35.
- **xy-item** (`foil-gold`, gold Trainer Items): filter `brightness(0.62) contrast(1.5) saturate(0.45)
  contrast(0.8)`; the lit etch lines are masked by `--fa-etch` intersected with the foil map.
- **xy-rc** (`foil-holo xy-rc`, RC1-RC27): the hearts and stars are a 512 px tile
  (`assets/foil/xy-rc-sparkle-v1.webp`, `scripts/make_xy_rc_sparkle.py`) laid on `.foil` twice at 250 px
  and 170 px and moved against each other by the pointer, blended `screen` (it only adds light: the art
  keeps its colours; a colour-dodged first try bleached the art white), a third set of pastel hearts on
  `::after` whose rainbow ramp shifts with the tilt, and a pastel wash on `.glare` in `soft-light`. The
  map is ours (`assets/foil/xy-safe-rc-v1.webp`: art window full, name bar half, text 26%). RC28-RC32
  (`foil-ultra xy-fa xy-rc`) take the full-art recipe above plus the `::after` hearts.
- **Evolutions 109-113** and anything `isNotFoil`: `foil-none`.

## Maps and assets

- TCG Live foil + etch maps for 138 cards (xy1-xy12, dc1), shipped with `fetch_foil_maps.py --cards
  <numbers> --ship --write-data` (400 px etch, the script's default); the lead's builders ship the same
  files for the rest of each set, byte-identical.
- Safe maps where TCG Live has none (`xyMap()` hook, `make_xy_safe_maps.py`, 367x512 white, alpha =
  strength, ~2 KB each): `xy-safe-ex-v1`, `-mega-v1`, `-tfa-v1`, `-item-v1`, `-rc-v1`. A card with a
  `foilMap` of its own never reaches them. Used by g1-28a / 73a, xy9-98b, the four xy10 "a" prints,
  RC1-RC32 and any print a builder lands without a map.
- An earlier f3 pass drew its own fingerprint etch maps (`make_card_etch.py`, Rare Ultra and Rare Secret
  added to ETCHED) before the lead found the TCG Live maps; they were removed unreleased, so no `-v2` names
  and no `etchDrawn` flags are left in the data. `make_card_etch.py`'s ETCHED edit stays (harmless).

## Verification

Chromium and WebKit at 220 px x 2 (phone), poses rest, 50:50, 20:15, 80:30, three cards a sheet (larger
sheets time out the screenshot); `foil_coverage.mjs` over g1, dc1 and xy1-xy12 prints nothing; WebKit
blue-block pixel count (`b>250 and r<100`) zero on every sheet; `sweep_finishes.py --set` for each set
reads clean. See the final report for the numbers.

## What still looks off

- Wally and the other pale full-art Supporters stay slightly milky when lit (the 100% wash on light art).
- No macro photograph was obtainable; the etch's real depth (raised texture) is only suggested by the
  contour lines catching light.
- RC hearts are paler on the full arts than in the photos, and the RC sparkle is one shared tile (no two
  real cards share a texture, but the Collection's stamp is a shared sheet in the real print too).
- Evolutions 109-113 "not foil" rests on two sources of medium confidence.

## Review (rv-f3, 2026-10-01, fresh-context, Chromium and WebKit at 220 px x 3, plus the real app at 390 x 844)

Sheets: `/mnt/project-files/every-era/xy/finish-sheets/f3-review/` (photo beside render, 1 to 8).

Checked: full-art EX / Mega (xy1, xy5, xy7, xy9, xy11, xy12), Supporters, gold-border secrets (xy2, xy4, xy7, xy9, xy10),
shiny AO 96-98, Dialga EX silver, gold Items, RC1-RC27 and RC28-RC32 (g1), Evolutions 109 and 113, dc1 EX, and the prints with no
TCG Live map (xyp150a, 177a, 198a, 200a, g1/xy8/xy10 xyp full arts). Rest, 30:25, -30:-20, 50:78; `dark_specks.py` (0 specks on
every card tried; Dialga reads "dark area" because it is multiplied on by design); `foil_coverage.mjs` over g1, dc1, xy1-xy12, xyp;
WebKit blue-block pixel counts equal Chromium's on every sheet (after the fix below; before it the unmapped promos drew 26% more in WebKit);
the app's inspector with foil strength low / high, no-shine, Classic and no-tilt on Archie (157), Dive Ball, Dialga, Flareon RC6, Gyarados
EX 123; a real rip of Primal Clash (Kyogre-EX full art, class `foil-ultra xy-fa has-foil-map has-etch-map`). dc1 EX (`foil-ex xy-ex xy-dc`
from xyPattern's early return) carries no `xy-fa` class, so no f3 rule touches it and f2's rules are not doubled.

Found and fixed:
- **About 32 era promos fell to the no-map ultra recipe.** `xyFullArtFrame` returned "" for any card with `foilAs`, but the era's own promos
  (xyp150a, 177a, 198a, 200a, g1-xyp110-126, xy8-xyp074-083, xy10-xyp103) are `era: "xy"` with `foilAs: "Rare Ultra"`: class `foil-ultra xy-fa`
  without `has-foil-map`, so the foil painted over the rules text and the op-art rings of realism.css showed in Karen's art. Now gated on
  `era !== "xy"` like every other reprint rule.
- **The shared engraving tile as a line screen.** Prints with no etch map (the promos above, and the gold Mega secrets xy2 107-109, xy3 112-113,
  xy4 120-121, whose foil map TCG Live ships without an etch) took the sir-etch tile: one regular diagonal hatch over the whole card. Its layers
  are hidden on `xy-fa` / `xy-item` + `has-etch-tile` without `has-etch-map`; those prints are smooth foil. TCG Live publishing no etch for
  the Mega secrets suggests the real card carries none either; for the promos it is unknown (a drawn fingerprint etch, `make_card_etch.py`,
  is the way to give them one).
- **Supporters were a pale pink wash** beside the clips' tall saturated columns (Ranger, TR's Handiwork). The Ultra recipe's grey-teal bars
  are now seven coloured columns at 94deg, dodged at mid brightness, still cut by the safe map.
- **Dialga EX silver went grey**: art window 207 bare to 142 at the thumb pose. The rainbow x ramp x etch multiply x the Ultra hard-light grey
  glare compounded. Lighter ramp, etch multiply 0.3, a screened white pool, rainbow at 88-92% lightness: 173-193 now, with colour.

The builder's four doubts, against photos: the **pale Poke Ball disc in the gold Items' text box is real** (Weakness Policy and VS Seeker
clips both show it): keep it. **RC hearts** are about as pale as the clips' (grey-pink translucent hearts on the photo of RC6), fine.
**Pale art goes milky when lit** is true and measured: Mew (xyp110) saturation 0.145 to 0.084 and +14 luminance at 30:25, caused by the `.foil`
dodge alone (the glare and the pseudo layers add nothing); lowering the brightness only recovers a quarter of it and weakens the rainbow on
dark art by a third, because the closing `contrast(0.8)` the chain needs for Safari lifts black to a grey that the dodge then adds to white
art. Left as it is. **No macro photo**: still none; the Live etch's fine fingerprint lines read right at 220 px x 3.

Left as is, for the lead: the EX and Mega EX are milder than the clips (the clips are lamp-lit; ours at 30:25 matches the colour and band
direction but not the strength); `xy-secret-ex`, `xy-mega` and `xy-shiny` have no rules of their own (the family recipe plus the gold
border in the print), so the "warmer sweep" and "brightest variant" in the recipe list above are not drawn; shiny AO 96-98 is not brighter than a
regular full art.
