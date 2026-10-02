# Sun & Moon full arts, Rainbow Rares and gold (css/holo/sm-fullart.css)

Family f3: Rare Ultra GX / Tag Team full art (`foil-ultra sm-fa`), alternate arts
(`sm-fa sm-alt`), full-art Supporters and Trainers (`sm-tfa`), Rare Rainbow
(`foil-ir sm-rainbow`), Rare Secret gold (`foil-gold sm-gold`). Classes come
from `smPattern()` in js/sm-foil.js. Research photos and their caveats:
`/mnt/project-files/sun-moon/texture-refs/f3-fullart-rainbow-gold/SOURCES.txt`.
Contact sheets: `/mnt/project-files/sun-moon/finish-sheets/f3-fullart-rainbow-gold/`.

## What the real cards and TCG Live's maps say

- poke-holo.simey.me has NO Sun & Moon card; upstream's CardProxy gives SM
  rarities the SWSH recipes (Rare Ultra sunpillar/etched, Rainbow and Secret
  swsecret). The benchmark is therefore the SWSH equivalents in
  `/mnt/project-files/holo-benchmark/` (Scizor V, Marnie, rainbow swsh8-268,
  gold swsh9-186).
- Photos are low-res video frames (eBay, Reddit, image search are blocked), so
  they fix colour and movement only; micro-texture comes from TCG Live's maps.
  **Evidence gaps (review 2026-09-30):** the standard full art (Umbreon &
  Darkrai SM241), rainbow (Lurantis, Pikachu & Zekrom) and gold have two or
  more video frames each; the **alternate arts, the Cosmic Eclipse colour
  secrets and the full-art Supporter have at most one frame each** (Lillie
  147 in hand, one gloved colour card, one static Misty's Favor slide), none
  second-sourced. Those three recipes rest on TCG Live's maps. Look again when
  a macro photo turns up.
- Standard full art GX / Tag Team (sm9 162, 163): foil map bright on the
  background and frame, part strength on the Pokemon; etch is a concentric
  fingerprint over the whole face, text box included. Tilted, steep diagonal
  rainbow bands over the whole face (Umbreon & Darkrai SM241).
- Alternate-art Tag Teams (sm9 161 165 170, sm10 192 197 199 201 205, sm11 218
  221 226, sm12 215 221 224 226): Pokemon is black (plain ink) in the map,
  scenery is foil, etch faint and background only.
- Cosmic Eclipse Rare Secret 237-248 and Shining Legends 78 (Mewtwo-GX): full
  colour art, NOT gold. 237-248: matte Pokemon, foil scenery, no etch map.
  sm35-78: foil on Mewtwo and frame, scenery matte, etch on the whole face.
- Gold (Trainers, Energy, gold GX, Hidden Fates SV87-94): map full; etch is a
  dense fingerprint with the printed four-point stars and Energy circle cut out.
- Rainbow: pastel rainbow is PRINTED (in the scan); foil under it is a fine
  glitter, etch a fingerprint over the whole card.
- Full-art Supporter: etch follows the line art in short hatches.

## Recipes

- **sm-fa**: sv-fullart's Ultra Rare layers, dodge-safe chain
  `brightness(p*0.4+0.4) contrast(2) saturate(.85) contrast(.8)` (rest
  `brightness(.5) contrast(2.5) saturate(.35) contrast(.8)`), a 40% foil floor
  under the map so the lit frame never stops at a hard corner, glare at half
  opacity, the etch twin (`.foil::before`) at 0.35.
- **sm-tfa**: same, flatter: `brightness(p*.15+.5) contrast(1.9) saturate(1)
  contrast(.8)`, own grey glare at 0.4.
- **sm-alt**: no floor; map alone decides; glare masked by art AND map so the
  varnish gloss stays off the matte Pokemon; with no etch map the shared etch
  tile is neutralised (`--fa-etch` transparent).
- **sm-rainbow**: swsh.css's glitter rainbow (glitter + flecks under
  color-dodge, winking `::before`, pastel `::after`, hard-light glare, etch-lit
  `.glare::after`); the inherited IR recipe washed the card milky.
- **sm-gold**: `brightness(.62) contrast(1.5) saturate(.45) contrast(.8)` (rest
  `brightness(.6) contrast(1.5) saturate(.3) contrast(.8)`).
- Routing (smPattern): Rare Secret that is a Pokemon and not GX, or in
  `SM_ALT_ART`, is `foil-ultra sm-fa sm-alt`; every other Rare Secret is gold.
  `SM_ALT_ART` (Rare Ultra alts, sm35-78) is measured by
  `scripts/sm_alt_art.py`; rerun it after a new set lands.
- Etch: every card of the family uses TCG Live's native etch
  (`<n>-etch-v4.webp`, `native_era_etch.py`, sigma 0.6), not the builders'
  400 px `-etch.webp`. `scripts/repoint_native_etch.py <sets>` repoints the
  data to files already shipped.

## Review round (2026-09-30)

- Etch: the six densest maps (sm35-75, sm12-270, sm8-235, sm2-166, sm1-160,
  sm10-233) are `-etch-v5` (sigma 1.0). etch_metrics `lb` went UP (117-189), not
  down: it is peak/mean in the 2-9 px band, and a blur removes the band's mean
  faster than its peak. What changed is `mid` (0.35-0.63 to 0.71-0.80), the
  "sheen, not lines" end of the doc's scale; the real test is WebKit at 340 px
  x 2 (sm2-166, sm35-75 checked: a soft ripple, no screen). Do not chase `lb`.
- Full art: a fifth brighter (brightness offset .4 to .5, floor .4 to .5,
  glare .5 to .6); mean change 14.5 to 18.5 levels at 30:25 (`lift.sh`-style
  on/off render diff). The same metric on swsh3-183/185 (Scizor V, Salamence V)
  gave 14.2, so the review's "under-lit next to SWSH" held only against the
  photo, not against our own SWSH recipe.
- Rainbow: `.foil` now closes in `contrast(0.8)` (lit and rest; it was the one
  dodged chain without the cap), glitter cut by a third (foil opacity, wink
  layer .5 to .33), the glare's dark end lifted to alpha .15 (verify.md limit),
  glare .6 to .4, the lit etch lines drawn in the spectrum instead of white and
  the pastel sheen at full opacity and saturate(2.4). Lit saturation of the
  card 0.254 to 0.271 (bare print 0.290; before: 0.246).
- Gold: the lit etch lines are cut to the foil map too (the native etch runs
  under the title and rules text; hard-light white over dark ink made grey),
  lines and glitter a step lower, and a header-band mask (2.5% to 10.5% of the
  card, 45%) keeps TRAINER / ENERGY readable. Dark Energy stays dark teal.
- Reviewer's nit 8 was not itemised in the brief; nothing done for it.

## Mistakes made and fixed

- First rainbow used the IR recipe: milky wash. Replaced by the swsh glitter
  rainbow.
- Colour-dodge chains without the closing `contrast(0.8)` would show WebKit
  blue blocks; every chain here ends with it.
- Alt arts with the 40% floor lit the matte Pokemon; floor is `:not(.sm-alt)`.
- Colour secrets and sm35-78 first drew gold; found only by measuring the maps
  (the data's rarity is the same "Rare Secret").
- A foil-map-less "a" print (sm12-143a, sm7-177a) with `foilAs` but no
  `era: "sm"` bypasses smPattern and falls to the generic holo: vertical
  streaks and a blown-out title. Data fix, not CSS (see report).

## Verification (2026-09-30)

- Chromium and WebKit (Playwright), 220 px x 3, rest / 30:25 / 70:60 / 50:78,
  nine sheets in finish-sheets/f3-fullart-rainbow-gold/.
- etch_metrics on the v4 etches: lb 38-56, coh 0.56-0.66 (sm35-78 lb 89); the
  SM maps are fingerprints like swsh9-186, which shipped; at 180 / 220 / 340
  px WebKit they read as a fine ripple, no line screen.
- dark_specks on 15 sets (sm1 to sm12, sm115, sm75, sm35): 0 specks.
- foil_coverage.mjs over all fifteen sets: prints nothing.
- sweep_finishes.py sm5 sm9 sm12 sm35: clean; no asset changed in place.
- foil_probe --idle: no running animations at rest.

## Secrets rebuild (2026-10-02)

Noah: "most have really shitty texture" and "overuse of the rainbow glare as
most cards dont really have that rainbow glare". Photos and maps:
`/mnt/project-files/sun-moon/texture-refs/secrets-v2/` (findings.md: real
rainbows and golds carry one relief, a dense fingerprint of ridges at about
1% of the card width following the line art; golds and the Cosmic Eclipse
colour secrets throw almost no rainbow).

- **sm-rainbow** replaced (the swsh glitter rainbow above is gone): `.foil`
  is a neutral grey pool (84% at the pointer to 41% far) on `overlay`, cut to
  art AND map AND (etch OR 30% floor), so the printed pastels brighten along
  the ridges near the light and deepen away from it; `.foil::before` one
  faint screened glitter tile; `.foil::after` empty (the 240% spectrum sheen
  was the "rainbow glare"); `.glare` a small white soft-light pool;
  `.glare::after` the ridges lit white near the pointer. No colour-dodge.
- **sm-gold**: the `.foil` spectrum under the dodge (teal frame rim) is now
  a warm gold radial pool, `.glare` a warm grey at 0.34, lines sepia'd.
- **sm-alt** (Cosmic Eclipse 237-248, alt-art Tag Teams) unchanged: the maps
  keep the characters matte and the band on the scenery, which matches the
  photos.
- Gates: rainbow_speed exit 0, dark_specks 0 on sm9/sm12/sm115,
  foil_coverage silent, WebKit and Chromium at 220 px x 3.
