# swsh-special: Sword & Shield special finishes

Module `js/fam/swsh-special.js`, sheet `css/holo/fam/swsh-special.css`, asset `assets/foil/fam/swsh-special/grain-v1.webp`
(generator `scripts/fam/swsh-special/make_grain.py`), window finder `scripts/fam/swsh-special/find_cc_windows.py`.
Audit: /home/user/holo-work/w2-swsh-special/AUDIT.json; photos /home/user/holo-refs/w2-swsh-special/ (SOURCES.md).

Census 2026-11-23: 55 faces claimed, all previously unclaimed (24 ssp-cel + 7 ssp-cc + 15 ssp-rad + 9 ssp-am).

## ssp-cel: Celebrations 001-025 + SWSH promo reprints (24)

Real (Lugia 022 flat and on a stand, Mew 011 in hand, Yveltal 019): foil in the art window only, as TCG Live's map
has it (Pokémon and the 25 logo cut out); text box and frame plain print. The window reads metallic, the sky darker
and greyer, with a fine sparkle grain and a soft rainbow streak near the light. The era recipe (whole-face pearl /
lace) washed the art milky. Now: multiplied grey silver + glitter-fine pinpoints + light pool, band tint near the
light, dodge band + grain pinpoints near the light; all cut to art ∩ foil map. Pattern call is from small photos
(no macro found): medium confidence.

## ssp-cc: Classic Collection window holos (7: cc2, cc4, cc8, cc15-venusaur, cc15-rockets, cc20, cc24)

Real (Charizard 4/102 BGS "Confetti Holofoil" label, lit scan): flakes about 1/45 of the card wide in the art window
only, each takes the ink's colour and flashes white; frame, text box, border plain. No Live map, so the window is a
per-card clip-path inset in the module (`--ssp-win`; base layout measured on cc4 / cc15-venusaur). Flakes are
assets/foil/bw-confetti.webp taken to grey with a `color` blend; multiplied silver at rest, dodged near the light.
Limit: the Pokémon is not cut out (the BGS label and audit say it is matte; the lit scan is ambiguous).

Not claimed (still era recipe, whole-face confetti, several bleach): cc9, cc15 Claydol, cc15-here, cc17 Umbreon star,
cc54, cc60, cc66, cc73, cc76, cc86, cc88 Mew ex (worst: unreadable at 40:30), cc93, cc97, cc107, cc109, cc113, cc114,
cc145. Each reprints a different original finish (ex-era holo, DP/Pt, LV.X, BW/XY full art, trainers, Gold Star):
needs per-card research and window / cut-out masks.

## ssp-rad: Radiant Rares (15)

Real (Gardevoir LOR 069, JP s10b Venusaur, Tsareena / Jirachi / Alakazam SIT lit, Charizard CRZ / PGO): a bold X /
argyle of bands at +-45 deg, about a sixth of the card wide with equal gaps, filled with fine sparkle, over the frame,
the text box AND the window background (Live's map leaves the window out; the photos win), bright silver-rainbow near
the light, a tonal plaid elsewhere. The yellow border is plain. Era recipe was a random cracked-ice tile.
Recipe (round 2, 2026-11-23, after the lead found round 1 almost invisible):
- `.glare`: tonal plaid over the whole face, soft-light (gaps 108, bands to 244), cut to the art only, so the window
  background is included without a gradient + foil-map mask composite (the WebKit drop trap). Visible at rest.
- `.foil`: bright bands near the light, colour-dodged, cut to the art only (dodge keeps black text black): two band
  families screened x grey-floored grain (grain-v1.webp) x light pool x a pastel rainbow along the bands that shifts
  with the tilt.
- Both clipped inside the yellow border: `inset(2.75% 3.85% round 1.2%)` (23 px of 600 across, 23 of 838 down).
WebKit lessons: band stops in % of the layer gave no visible bands, stops in `cqw` (the .tcg is an inline-size
container) work; an opaque grain on `.foil::before` set to screen painted black over the dodge source, so the grain
is multiplied into the main stack instead (floor 0.6).
Left: on dark or busy windows (Alakazam, Jirachi) the window plaid is still weaker than the photos (soft-light moves
dark saturated ink little); the Pokémon's Live fingerprint etch is not lit separately (it gets the bands and grain).

## ssp-am: Amazing Rares (9)

Real (Celebi VIV 009 in sun and angled, Reshiram SHF 017, Rayquaza VIV 138 held, Jirachi VIV 119): the rainbow splash is
PRINTED; the foil under it (Live map, in and past the window) is a very fine glitter that takes the ink's colour; the
Pokémon is etched (Live etch map) and catches light; frame and text box matte. Era recipe: coarse white glitter, no
etch (its etch light was masked by the foil map, which cuts the Pokémon out).
Recipe: `.foil` dodges glitter-fine at 16% of the card times a light pool, cut to art ∩ foil map (no added colour);
`.glare` dodges a low grey pool through art ∩ etch map, clipped to the window rectangle `inset(9.8% 7% 51% 7%)`
(the etch map is uniform over frame and text box). The etch lines read on the Pokémon and finely over the splash.
