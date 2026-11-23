# Family me-holo: Mega Evolution holo Rares and Double Rares

Holo accuracy overhaul, 2026-10-22 (round 1). Module `js/fam/me-holo.js`, sheet `css/holo/fam/me-holo.css`. No assets, no
scripts: every face keeps TCG Live's foil map (and etch map) that the era already ships. Audit and photos:
`/home/user/holo-work/w2-me-holo-dr/AUDIT.json`, `/home/user/holo-refs/w2-me-holo-dr/` (SOURCES.md); fix sheets
`/home/user/holo-work/fix-me-holo/ba-<set>-<n>.jpg` (real / before / after, WebKit 220 px x 3).

## Round 2 (2026-11-23): pixel cosmos added, Rare streak narrowed

Fresh-eyes pass (work dir `/home/user/holo-work/fix2-me-holo/`, sheets in `sheets/`, photos refetched from SOURCES.md into
`/home/user/holo-refs/w2-me-holo-dr/dl/` and `/home/user/holo-refs/w2-me-cosmos/dl/`).

- **Scope now 279 faces**: the 206 below plus the 73 ME-era pixel cosmos promos of audit group w2-me-cosmos (`meh-cosmos`,
  `card.rarity === "Cosmos"` on an `me<digit>`/`me2pt5` id; me55's seven stay out). They were claimed by no family before
  (the `me-cosmos` stub claims nothing); if that stub is ever filled, move this kind there.
- **Cosmos facts** (Kyogre 034 off the light, Gloom 002 angled, Ralts 058, Kirlia 059, the Riolu 076 macro, Aurorus 024
  sleeved; audit w2-me-cosmos): foil = art-window background + whole border, Pokémon, stamps and text box matte; the
  ground is achromatic (charcoal off the light, silver under it); colour only in the pixel shapes, one saturated hue
  per patch that drifts over about a third of the card. promos.css screened a 12-stop rainbow over the whole map (pastel
  sheet on the border, a tinted veil over the window and the Pokémon) and lit-photo scans showed no cosmos at rest.
- **Cosmos recipe** (me-holo.css): `.foil` one hard-light group, a grey radial ground (94% at the pointer to 44%),
  at rest a flat 44% ground with `pixel-cosmos.webp` laid on so every scan shows its specks; `::before` a saturated
  spectrum (10 hues over 300% width, l 60%) through the era's map-and-pixel mask with `lighten`, so a speck only adds
  light; `::after` the era's white glint stripe; a soft glare with no dark end to speak of.
- **Cosmos maps** (`scripts/fam/me-holo/cosmos_maps.py`, `assets/foil/fam/me-holo/cosmos/`, table COSMOS_MAPS in the
  module, applied as `--foil-map` in the face's style): 44 prints whose plain print is a TCG Live-mapped Rare (same
  number, or meg/pfl/asc/por/jtg/dri reprints) get min(drawn, Live), i.e. the drawn border and stamp cut with the
  Pokémon taken out; dri159 (window wiped by the owner-badge cut) takes Live's map as is; Tangela 7, Komala 175 and
  Mimikyu asc097 (window wiped, no Live map) get Kyogre 034's drawn window back with the badge cut; the 11 other prints
  with no Live map (Commons/Uncommons) keep their window but at alpha 70 instead of 130. MEP promos keep their own Live
  maps; tef051 untouched.
- **Rare**: the streak was about 15% of the card with its soft edges and read as a pale wash over the upper window at
  20:30; the gate gap is now 2.4% of its 300% (about 7% of the card) with 0.8% edges, white core peak 0.6 (was 0.72).
- Open: the 11 Commons/Uncommons cosmos prints and Tangela/Komala/Mimikyu still have no cut for the Pokémon (needs a
  drawn mask per card; their window is held at half so the specks on the Pokémon are faint); tef051-stamp still has
  another card's map; me1-64-stamp's scan lacks its stamp (data). No tilted photo of the exact cosmos samples; facts rest
  on same-finish siblings.

## Scope (206 faces, census 2026-10-22)

Every `era-me` face (me1-me5, me2pt5 and their MEP promos; not me55) on one of TCG Live's three foils for these rarities,
exactly the faces the old look painted for the audit group w2-me-holo-dr:

| Class | Pattern (js/app.js) | TCG Live | Faces |
|---|---|---|---|
| `meh-rare` | `foil-holo foil-svholo` | SV_HOLO / HOLO | 101 (8 of them Special Energy: `meh-energy`) |
| `meh-mega` | `foil-ex foil-sunpillar has-etch-map` (Mega ex), `foil-ex foil-tera` (Tera ex) | SV_ULTRA / ETCHED | 61 + 6 |
| `meh-ex` | `foil-ex foil-sunpillar`, no etch map | SUN_PILLAR + SouthernCross | 38 |

`kindOf()` mirrors foilPattern(): a map, an `me<digit>`/`me2pt5` id, not reverse; Double Rare + Tera, or ex with or without
etch; Rare that is not an ex.

## What the real cards do (photos, not the earlier notes)

- **Holo Rare** (Meganium 010 in hand and outdoors, Gengar 050, the SV_HOLO twin Togekiss 072): foil on the art window's
  background and the silver border; the Pokémon, name bar, frame, text box and stamps are print (the Live map already says
  so). ONE narrow rainbow streak, about a tenth of the card tall, a few degrees off horizontal, hue running along it, a bright
  silver-white core near the light; it slides with the tilt. Elsewhere the print keeps its colours under fine pinpoint
  silver glitter noticed second. Confidence medium (video frames, one close-up).
- **Border texture**: flat scans show fine horizontal lines on the border; the Togekiss photo shows pinpoint glitter there.
  Scans only, so the glitter stays (low confidence; not changed).
- **Mega ex / Tera ex Double Rare** (Mega Zeraora 027 x2, Mega Charizard Y 022): whole face foil, a dense fine multicolour
  glitter, a glittery gold text box, saturated rainbow patches near the light; dark ink stays dark and only sparkles.
- **Regular-frame ex Double Rare**: no ME photo found; left on sv-double-rare.css.

## What changed (all scoped to `.fam-me-holo`, nothing in the era sheets)

- **Rare** (was: celebration.css's band about 27% of the card tall, full-strength spectrum 1.5 cycles wide, hard-lit:
  the whole art window turned into a left-to-right rainbow at 75:65 / 50:78 and went milky at 30:25). Now one hard-light
  group over 50% grey: a white core (peak 0.72, about 8% of the card), the grey gate with a clear gap 3% of its 300% height
  (9% of the card) and 1% soft edges, a spectrum at 88% alpha with two cycles over 300% of the width (2-3 hues under the
  streak; the Live map holds the window at about half, so it lands near 0.45 there). The gap travels 8% to 52% of the card
  (`0.71 - py * 0.22`). Lit opacity capped at 0.85 x strength; glitter mask far end 0.35 (was 0.5). Special Energies
  (`meh-energy`, art circle nearly all foil) at 0.75 of that.
- **Mega ex / Tera ex** (was: the 15deg spectrum colour-dodged through two hard-light bars 72% of the card wide, a flat
  magenta-lilac sheet over every dark ground). `.foil::before` is now a pool round the pointer (grey 0.54 to black at 70%)
  darkened by the scan itself (`var(--art)`, `darken`, then grayscale): hard-light black kills the dodge, so the rainbow
  shows only near the light and only where the ink is light enough for foil to show through; dark ink stays dark. Dodge
  `brightness(0.74)` (was 0.72), chain still ends in `contrast(0.8)`. Glitter: the white points over `glitter-flecks.webp`
  (multicolour), opacity 0.22 + 0.33 from-centre (max 0.55).
- **Regular ex**: claimed, no rule; it renders exactly as before.

## Gates (2026-10-22)

foil_coverage me1-me5 + me2pt5 silent; dark_specks ok on me1 10/28/77/86, me2 3/79, me2pt5 6/57, me3 6/87, me4 7/86,
me5 12; rainbow_speed silent; sweep `--check-only` lists nothing in this sheet; no asset overwrites; test-mep and
test-celebration pass.

## Open

- Tera ex (me2pt5 57 Pikachu ex and 5 more): no photo; pale art still lifts toward pastel near the pointer at 30:25.
- Mega ex rainbow on the gold text box reads gold-yellow more than multi-hue (colour-dodge cannot tint yellow pink).
- Promos filed as Rare (mep001 ...): check whether the blister prints are pixel cosmos (promos-existing-sets/REPORT.md).
