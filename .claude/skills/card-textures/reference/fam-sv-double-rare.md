# Family sv-double-rare: Scarlet & Violet Double Rare ex (SUN_PILLAR + SouthernCross)

Built 2026-11-23. Module `js/fam/sv-double-rare.js`, sheet `css/holo/fam/sv-double-rare.css`. No assets, no scripts:
every face keeps TCG Live's foil map and the era's `southern-cross.webp` star tile. Audit and photos:
`/home/user/holo-work/w2-sv-dr/AUDIT.json`, `/home/user/holo-refs/w2-sv-dr/` (SOURCES.md; photos used are in `finish/`,
copied from `/mnt/project-files/{paldean-fates,surging-sparks}/texture-refs/` or refetched). Work dir and before/after
sheets: `/home/user/holo-work/fix2-sv-double-rare/` (`ba-<id>.jpg`: real photos, BEFORE, AFTER; WebKit 220 px x 2).

## Scope (221 faces, census 2026-11-23)

Every face drawn as `foil-ex foil-sunpillar` (a Double Rare ex with a foil map, not Tera) whose id matches
`/^([zr]?sv\d|svp-)/`: 184 set faces (163 plain, 21 Future/Ancient `frame-paradox`) and 37 SVP promos (36 of them have
no `era-sv`: js/foil-maps.js tests `/^[zr]?sv\d/`, so the old SV look never reached them and they drew celebration.css's
milky pastel SUN_PILLAR). The sheet is scoped to the family class only, so they now draw like the set cards. Nothing taken
from another family, none missed. svp196 Charizard ex carries an etch map (`has-etch-map`); its data says plain ex, not
Tera, so it is claimed and drawn as a Double Rare (open question below).

## What the real cards do

- Foil on the frame, the art background and the text box (Live map); the Pokémon print with stars on it (Clodsire PAF 059,
  Gardevoir PAF 029).
- Parallel bands lower left to upper right, about 50-55 degrees off horizontal: broad saturated spectra with a near-white
  core 12-15% of the card apart, bunches of sharp thin lines, soft silver bands in room light (Magnezone SVI 065, Great Tusk
  SVI 123, Spidops SVI 019, Alakazam SVP 050). 3-6 bands near the light; the art between keeps its colour; dark ink dark.
- Bands and stars are glittery grain in macro (Clodsire macro). Stars cluster in a few patches plus singles (Great Tusk
  tusk, Mimikyu SVP 004 text box, Gardevoir lower left).

## What changed (was: sv-double-rare.css's one regular comb of airbrushed hairlines, celebration.css's milky overlay glare)

- `.foil` colour-dodge (black ink stays black): grain soft-lit over broad 128deg spectrum bands (4.5% wide, white core,
  every 14%) screened over soft silver bands (every 22%). Lit opacity 0.18 + 0.5 x lit (was 0.82).
- `::before`: bunched thin lines (a comb every 4% gated by a coarse 17% gate) screened in; the comb slides at 0.28 of the
  bands so it never strobes (rainbow_speed).
- `::after`: steep multiply fall-off round the pointer (white to black by 62%), so bands show only near the light. It has
  to reset size/position/blend/filter/opacity, which celebration.css's counter-tracked twin sets on the same pseudo.
- `.glare`: masked by the Live map, a pastel multiply copy of the broad bands near the light, so pale prints (Whimsicott,
  Amoonguss) get coloured stripes where colour-dodge only whitens. Replaces the overlay glare (milky -20% saturation).
- `.cure` stars: two scales of the era's tile (about twice as many), clustered by a mask (three seeded patches over a
  0.5 floor) instead of a background gate: a grey gate in the background screened a milky veil over the art (found by
  isolating layers: hiding `.cure` removed the veil).
- Rest: faint silver bands and stars in `.foil` at 0.22.

## Gates (2026-11-23)

foil_coverage on sv1-sv10, pt5 sets, rsv/zsv10pt5, svp silent; dark_specks ok on sv9-11, sv8-4, rsv10pt5-5, svp004;
rainbow_speed silent; sweep `--check-only` lists nothing in this sheet; no asset files; test-svp and test-celebration pass.

## Open

- Bands at 75:65 still read as a fairly regular comb on large text boxes; the real card's spacing is less even.
- Stars are the era's flat tile (no grain inside a star); a cluster texture of their own would be closer to the macro.
- svp196 Charizard ex: check whether the print is the Tera promo (then it belongs to foil-tera and the etch map is right).
- sv4-svp067 / svp068 (Roaring Moon ex, Iron Valiant ex) are Double Rare `foil-ex` with no map: not this family (no map).
