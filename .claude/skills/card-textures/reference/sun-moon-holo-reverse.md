# Sun & Moon: Rare Holo, Reverse Holo, plain-card glare

Sheet: `css/holo/sm.css`. Classes from `js/sm-foil.js` (`smPattern`, `smReverseFinish`, `smLate`) and `js/foil-maps.js` (reverse branch). Tiles: `assets/foil/sm-reverse/<type>.webp` (12 files, built by `scripts/make_sm_reverse.py`). Photos and caveats: `/mnt/project-files/sun-moon/texture-refs/f1-holo-reverse/SOURCES.txt`. Contact sheets: `/mnt/project-files/sun-moon/finish-sheets/f1-holo-reverse/` (Chromium + WebKit, 220 px x 3, rest / 30:25 / -30:-20 / 50:78).

## What the photos say (written before the CSS)

Evidence is YouTube thumbnails of handheld clips (two channels) plus two flat seller scans and two text sources; no macros. Micro texture comes from TCG Live's maps only.

- **Rare Holo splits in two by set.** Sun & Moon to Celestial Storm (sm1 to sm7, sm75): the art background is foil, the Pokémon is matte print (TCG Live's map knocks the silhouette out). The foil is saturated rainbow, blue-violet one side, yellow-green the other, broken into crystalline shards that flash separately, with a fine white sparkle and a few thin crossing light lines. Dark art hides it (Alolan Persian). Lost Thunder to Cosmic Eclipse (sm8 to sm12, det1): nearly the print; tilted, a soft pink or pale green pool drifts over the window and a little sheen rides the highlights. No shards. Unified Minds (Chandelure) is the dullest.
- **Reverse Holo, every set.** Everything except the art window, the name bar and the attack-name text is one smooth mirror. The card type's small symbol is tiled over the right of the body and along the top and bottom borders, a giant one lower left, lighter than the print between them. A broad rainbow band (pink, yellow, green, cyan) sweeps across as the card turns. The art window is matte. Dark types (Darkness, Metal) read as light symbols on a dark glossy base.
- **Plain Rare / Common / Uncommon:** not foil. Only the ordinary surface glare.
- Texts disagree on which side the big symbol sits; TCG Live's maps put it lower left, used here.

## Recipes

**Early Rare Holo (`foil-holo sm-holo`).** `.foil` = two copies of `celebration/cracked-ice.webp` (the facets) sliding against each other, multiplied/screened over a 300% 115deg rainbow whose position is clamped to 0-100%, `mix-blend-mode: color-dodge`, filter `brightness(0.58) contrast(1.5) saturate(1.8) contrast(0.8)`. `::before` = `glitter-fine.webp` screened at 0.25 to 0.55 opacity (light only). `::after` = grey luminosity pool under the pointer, centre lightness 62% (not 95%). `.glare` = overlay radial at 0.45 x card opacity. The map (TCG Live `std.foil`) limits all of it to the art window and keeps the Pokémon matte.

**Late Rare Holo (`sm-late`: sm8 to sm12, det1, mcd19, Black Star promos from SM120).** `smLate(card)` in js/sm-foil.js picks it by id (set prefix, `smp` number >= 120). Black base, one broad soft green band (115deg, `hsl(150 50% 24%)`, slides with the pointer) and a small dim pink pool (`hsl(330 55% 15%)`), `screen` blend; no ice tile, no dodge, no luminosity pool (that one pulled dark art up to grey), sparkle at 0.05 to 0.13, glare at 0.35. Mean change of the art window against the no-foil render is 12 to 19 levels at 30:25 (Chandelure sm11-30 was 62), the same order as the photos' "nearly unchanged, one soft green band".

**Reverse (`rev-sv rev-sm rev-<type>`).** `sv-reverse.css` supplies the mask (`--art` window knock-out, `--rev-pattern`). The tile is the per-pixel median of a dozen TCG Live reverse maps of that type across sets (grey = pattern, alpha = where the card is foil), text residue cleaned for darkness, metal and trainer. `.foil` = tile multiplied over a -52deg pink/yellow/green/cyan/violet streak (190%, pointer driven) over a pointer radial, `brightness(0.6) contrast(1.25) saturate(1.1) contrast(0.8)`. `::before` = the same band pale and multiplied, so it tints white and pale print (Trumbeak's text box, Trainers) where dodge has nothing to lift. Trainers use `sm-trainer` (Poké Ball tiling); Energy gets no reverse finish.

**Holo reprints with no TCG Live map** (`foilAs: "Rare Holo"`: sm1-101a, sm2-19a/21a/51a, sm3-18a/92a, sm4-84a, sm6-2a, sm7-10a, sm35-28h, det1 holos). `smSafeMap()` hands them `assets/foil/maps/sm-holo-safe.webp`, the per-pixel median of the 222 shipped holo maps (`make_sm_window_map.py`): the window with a typical Pokémon matte knocked out, blurred 3 px, the Ultra Beast banner corner cut. Without it the holo paints the whole card and bleaches the Pokémon (sm2-21a Alolan Vulpix).

**Trainer reverse.** Colour-dodge flattens the brushed-silver text box to white and the pale multiplied band greens the text, so `rev-trainer` uses `overlay` (`contrast(1.1) saturate(0.6)`) and a nearly-off band (0.1): the silver stays, the Poké Ball tiling reads as lighter and darker balls, a little pastel rides the band.

**Basic Energy reverse (`rev-energy`, the sm35 pack Energy).** `smReverseFinish` returns `sm-<type>` for Energy; foil-maps.js adds `rev-energy` and `--energy-tile`. The mask is the card minus the central orb (ellipse) and the title and footer bars, not a Pokémon's tile; the symbols are a 45 x 123 px seamless cell of the type's own tile (`make_sm_energy_reverse.py`, `assets/foil/sm-reverse/energy-<type>.webp`, 8 files of 2 to 5 KB) repeated over the whole field, under the same spectrum band and dodge. No hard edge (the legacy recipe had one at 62% height).

**Plain card glare.** `.tcg.foil-none.era-sm .glare`: overlay radial, white 0.8 to 0.65 near the pointer, dark end held at 0.3 (same call as swsh.css, so the thumb pose does not shade the card).

## Mistakes made and fixed

- Reverse rules did not apply: `foilExtras` returns early for reverse cards, so they never get `era-sm`. Selectors use `.foil-reverse.rev-sm` x5.
- Tile text residue (footers, attack names, Trainer header) in the dark types: `clean_text` with a 9 px median inside the text zones only. Filtering black-text types ghosted their flavour text, so those are left alone.
- Colour-dodge whites out pale art (Shiinotic, Victini, Ludicolo sm7-38 whose scan is bright bokeh in the upper left). Three levers, all needed: dodge brightness 0.7 down to 0.58 (0.42 killed the rainbow, 0.75 bleached), pointer pool centre lightness 95% down to 62% (a luminosity blend of near-white turns the art white), glare 0.7 down to 0.45. Late holos use `screen`, not dodge, for the same reason. Ludicolo's top-left is still pale at 30:25 (see below).
- A 300% rainbow background positioned past 0-100% wraps into a seam on tilt: position clamped, `foil_coverage.mjs` clean.
- Late-holo pools first lifted the whole art 40% at tilt (Victini): pool lightness 38 and 36 down to 30 and 28.
- Two probe mistakes worth keeping: `rX` in the lab `cards=` list draws card X as a reverse (there is no `reverse=1`), and Playwright WebKit needs its own `PLAYWRIGHT_BROWSERS_PATH`; setting it empty breaks Chromium too.
- A sheet full of broken scans was a builder still writing images into a symlinked worktree, not a CSS bug; rerun after the builder commits.

## Verification

Chromium and WebKit contact sheets (rest, 30:25, -30:-20, 50:78) for early holo (sm1, sm7), late holo (sm9, sm12), plain glare (sm10) and reverse (sm1, sm9, sm12: grass, water, metal, colorless, darkness, trainer). `foil_coverage.mjs` over sm1 to sm12, sm115, sm75, det1 prints nothing. `sweep_finishes.py` for sm1, sm9, sm12 passes the dark-speck gate and the asset-overwrite check; sm7 fails only on Jirachi Prism Star (not this family) and sm12 only lists the `smp` window-holo promos with no map (promos are another family). No asset under `assets/` was overwritten; 12 new tiles, 220 KB.

## Review round (2026-09-30, independent reviewer)

Fixed: app.js ?v= bump with every import-tag change (#80 failure); holo prints with no map now take the window map; Trainer reverse keeps its silver; reverse basic Energy has its own finish; late holo no longer hazes dark art; late-era promos (smp157, smp190, mcd19) take the late look. Left as is, said plainly: the sm7/sm75 (shards) versus sm8 (satin) boundary rests on one channel's clips (Pokemon Holo), so treat set boundaries as a good guess; the early holo is faint away from the top-left light (5 to 8 levels at the 50:78 thumb pose, 20 at 30:25) because the light leaves the window, raising it whitens pale art.

## Still off

- Early holo is calmer than the clips: the shards read at rest and tilted, but the clips show a stronger saturated wash over the whole window. Raising it whites out pale art (Ludicolo) in WebKit.
- Pale art such as sm7 Ludicolo still lifts toward white in the upper left at 30:25.
- No macro photo of the real grain; the sparkle pitch is a judgement from phone-scale thumbnails.
- poke-holo.simey.me could not be opened from headless Chromium here (proxy certificate error), so the side-by-side was done against simey's own CSS (`upstream/swsh/regular-holo.css`, `reverse-holo.css`). Simey draws every era with its Sword & Shield scanline-and-bar recipe, so it is not a Sun & Moon photo reference anyway; ours follows the photos.
