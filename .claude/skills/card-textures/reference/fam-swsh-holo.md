# Holo family swsh-holo: the Sword & Shield Rare Holo ("Line" holofoil)

Module `js/fam/swsh-holo.js`, sheet `css/holo/fam/swsh-holo.css`, assets `assets/foil/fam/swsh-holo/lines-v1.webp` and
`lines-soft-v1.webp` (generator `scripts/fam/swsh-holo/make_lines.py`). Made 2026-10-22 (holo accuracy overhaul) from the w2-swsh-holo
audit; its photos and lit scans are in `/home/user/holo-refs/w2-swsh-holo/` (SOURCES.md lists every URL), the
comparison sheets of the fix in `/home/user/holo-work/fix-swsh-holo/ba-*.jpg`.

## Scope

Every non-reverse face swshPattern() gives exactly `foil-holo swsh-holo` (407 faces on 2026-10-22): the Rare Holo of
swsh1-swsh12pt5, swsh35, swsh45 and Pokémon GO, the Black Star promos filed `foilAs: "Rare Holo"`, and Trick or Trade
2023's six SWSH reprints (tot23 7, 9, 11, 14, 17, 19). Not the Celebrations pearl (`swsh-cel`) or the Classic Collection
(`swsh-classic`). The module cannot import foil-maps.js, so `claims()` repeats swshPattern()'s Rare Holo branch; a
data change that refiles a card (foilAs, rarity, gallery) moves it out of the family by itself.

Sub-classes: `swh-lines` (the 394 window holos), `swh-tg` (swsh10 TG01-TG12, Astral Radiance's Trainer Gallery filed
as "Rare Holo"), `swh-radiant` (Radiant Eevee SWSH230, filed "Rare Holo" by foilAs). The last two are stop-gaps until
the routing / data is fixed (see "Left for the lead").

## The real finish (sources)

- WHERE: the art window's background only; the Pokémon, frame, text box and the yellow border are matte on English
  prints (Japanese and Chinese prints of the same art also foil the border). TCG Live's per-card map already says this
  (the Pokémon cut out). Infernape BRS angled, Rapidash SIT 022 lit, the same-art JP/CN lit scans. High confidence.
- PATTERN: fine vertical lines, about 120-160 across the card (FFT: JP Vileplume s9a ~119, JP Beedrill s8b ~121, CN
  Shaymin CS2aC ~125, Infernape BRS ~140, Rapidash SIT ~155). No etch or emboss.
- COLOUR: lit, the lines carry colour grouped into broad soft pastel bands (pink, mint/cyan, lavender, pale gold), each
  about 15-20% of the window wide, the full window height, sliding sideways with the tilt; no narrow hard streaks
  (Rapidash SIT 022, JP s4a 018, JP s12a 008, JP s9a 003).
- STRENGTH: the print stays readable at every tilt, the foil tints the window and never bleaches it (Rapidash lit:
  window mean 159 / std 50, about the flat scan's). Flat, the window is the print with a faint silver grain.

## What the sheet does

- `.foil` is a hard-light source over the scan (0.5 grey = no change): a neutral silver ground, the pastel band ramp
  (`--swh-bands`, one cycle = 0.8 card width in a 300% layer, slid by `(50% - --background-x) * 2`, about 1.3 cycles
  over a full sweep) and the line strip on top in soft-light. The lines are an image (`lines-v1.webp`, 140 sinusoidal
  lines, 10 source px each, stretched to the card): about 4.7 device px per line on a phone, band-limited so WebKit
  draws no moiré or hairline screen. Lit opacity 0.32 + 0.43 x --card-opacity; at rest 0.3 with saturate(0.5).
- Screens of 1.5 dppx or less take `lines-soft-v1.webp` (same lines, a third of the swing, `--swh-lines-soft`): a
  220 px card there gives a line 1.6 device px wide and the full strip aliased into a coarser beat in Chromium and
  WebKit at scale 1; the phone (3 dppx) render is byte-identical with or without the rule.
- `::before`: one soft silver bar (soft-light, 0.6) sliding against the bands. `::after`: neutral grey laid over the
  foil away from the pointer (0 at the light, 0.45 at the far corner), so the colour gathers near the light.
- `.glare`: neutral white overlay at half the era's strength (the era's cyan-white tinted the matte Pokémon).
- `swh-tg` / `swh-radiant`: no lines, glitter flecks in soft-light, the bands twice as broad (600%) and softer.
- Selectors carry `.fam-swsh-holo` x8 (no `era-swsh`, which tot23 lacks) and reset every paint property of every
  layer, so nothing of swsh.css's `.swsh-holo` block (color-dodge, brightness 1.3, the hard-light bar families, the
  luminosity hot spot with contrast 2, the #222/#999 2px scanlines) leaks through. swsh.css itself is unchanged
  (`?fam=off` still shows the old look).

Measured (WebKit, 220 px x 3, rough window rectangle; before -> after, levels over the flat scan at 30:25):
Flapple +62 -> +17, Shaymin +40 -> +10, Vileplume +52 -> +13, Venusaur +54 -> +18, Beedrill +55 -> +16, Torterra
+44 -> +14, Rapidash (same card as the photo) about +6. Line pitch at rest: 140 across the card (was 71).
rainbow_motion.py: Shaymin swsh4-15 0.72 spectra per sweep across (p75 1.16), TG01 1.08 (p75 1.47); rainbow_speed.py
cannot read gradients held in custom properties, so it prints nothing for this sheet.

## Left for the lead (outside this family's paths)

- swsh10 TG01-TG12: route to `swsh-tg` (swshPattern: `gallery === "tg"` with rarity "Rare Holo"), or refile them
  "Trainer Gallery Rare Holo" in data/swsh10.json.
- pgo-swshp230 Radiant Eevee: foilAs "Radiant Rare".
- Blister / collection-box promos are Cosmos holo, not Line: Gossifleur SWSH010, Rayquaza SWSH029 (Bulbapedia),
  Croagunk SWSH245, Manaphy SWSH275 (photos): foilAs "Cosmos". Check the rest one by one; do not refile all 125.
- swshp-swshp120 Marnie (a Supporter filed Rare Holo): check its real finish.
- foil-maps.js line 406 adds `era-swsh` by id prefix, so tot23 misses it; this family no longer needs it, but other
  SWSH finishes on tot23 would.
- reference/sword-shield.md's Rare Holo bullet still says the recipe "needs brightness 1.3 and a broad hot spot or it
  vanishes": that gain is what bleached the window; point it here.
