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
