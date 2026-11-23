# Family sv-holo: Scarlet & Violet holo Rare (SV_HOLO)

Built 2026-11-23. Module `js/fam/sv-holo.js`, sheet `css/holo/fam/sv-holo.css`. No assets, no scripts. Audit and photos:
`/home/user/holo-work/w2-sv-holo/AUDIT.json`, `/home/user/holo-refs/w2-sv-holo/` (SOURCES.md; photos used in `dl/`,
copied from `/mnt/project-files/{paldean-fates,surging-sparks}/texture-refs/` or refetched). Work dir and sheets:
`/home/user/holo-work/fix2-sv-holo/` (`ba-<id>.jpg`: real photos, BEFORE, AFTER; WebKit 220 px x 2).

## Scope (319 faces, census 2026-11-23)

Every face drawn as `foil-holo foil-svholo` (a non-ex Rare with a foil map) whose id matches `/^([zr]?sv\d|svp-|tot23-)/`:
315 SV faces (21 with Future/Ancient frames) and the 4 Trick or Trade 2023 reprints (no `era-sv`). ME holo Rares stay
with me-holo. Nothing taken from another family, none missed. Extra classes: `svh-late` (sv8 onward: glitter a step more
visible), `svh-rectmap` (tot23-21: its map is a plain window rectangle, held weaker), `svh-baked` (sv10-96-prerelease: the
scan has foil sparkle baked in, little glitter on top).

## What the real cards do

Sprigatito SVP 001 under a lamp, the SV starter promos in hand, Abomasnow PAL 011, Heat Rotom PAF 013, Togekiss SSP 072:
foil on the art background and the silver border; horizontal rainbow bars, a ladder down both side borders about every
11% of the card's height with silver between, one crisp band 3-6% tall across the art near the light plus fainter
repeats, hue running along each bar; the print between reads normally. Glitter fine and quiet (visible on Surging Sparks).

## What changed (was: celebration.css's one tall soft band hard-lit over the window, coarse white glitter snow)

- `.foil` is soft-light over 50% grey (not hard-light): colour tints the print, black ink stays black (the Rocket arts,
  Wo-Chien's leaves, Zarude no longer turn neon). Layers: two border strips 5% wide with the dash ladder (period 11.5%,
  dashes 2.5%, walking down about one period with the tilt), a grey veil clear round the light's height (one broad soft
  band about 8% of the card, a fifth of the art window, feathered, then fading to 0.97 over the next 12%), and the
  spectrum (two cycles over three widths, sliding with x, so the hue runs along the band). `saturate(1.8) contrast(1.5)`.
- `.glare`: masked by the Live map, a saturated multiply copy of the same strips, veil and spectrum (white neutral), so the
  silver border shows saturated dashes beside the band and a pale sky clearly takes the band; dark ink barely changes.
  Replaces the overlay gloss.
- Glitter (`::before`): half the speck size, opacity 0.45 (0.65 on sv8+), mask far end 0.2.
- `::after`: a softer hot spot. Rest: faint dashes and a faint even tint.
- Future/Ancient frames: the HP halftone and badge no longer go magenta; sv-rare.css's text-box mask still applies.

### Round 2 (lead review, same day)

The first build ran the ladder across the whole face, so inside the art the colour was several thin hard-edged lines
(read as a scanline glitch on Wo-Chien), and the border dashes were pastel and too many. The ladder now lives only in the
border strips; the art carries one broad soft band (Quaxly / Fuecoco photos); the dashes are saturated (the multiply copy)
and fade away from the band. Checked at rest, 20:30, 50:45, 80:60, 30:25, 75:65, 50:78 on sv4-18, svp001, sv2-3, sv8-11 and
sv10-51, one card per WebKit render (`/home/user/holo-work/fix2-sv-holo/poses-<set>-<n>.jpg`).

## Gates (2026-11-23)

foil_coverage on the SV sets, svp and tot23 silent; dark_specks ok on sv2-3, sv4-18, sv8-11, sv10-51, svp001, tot23-21;
rainbow_speed silent; sweep `--check-only` lists nothing in this sheet; no asset files.

## Open

- The border dashes are small at phone size (only the two or three beside the band read); the top border never carries the
  full spectrum the Abomasnow photo shows when a bar lines up with it.
- tot23-21 needs a drawn map with Houndoom cut out; sv10-96-prerelease needs a clean base scan (data/asset outside paths).
