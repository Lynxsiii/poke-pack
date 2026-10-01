# Wizards of the Coast: cosmos and starlight window holos, the Legendary Collection fireworks reverse

Family j1 (`css/holo/wotc.css`, `js/wotc-foil.js`: `wotcMap`, `wotcWindowMap`, `wotcLegendaryExtras`, `isStarlight`).
Photos and sources: `/mnt/project-files/every-era/wotc/texture-refs/j1/` (SOURCES.txt). Sheets:
`/mnt/project-files/every-era/wotc/finish-sheets/j1/`. TCG Live published no foil maps for 1999-2003, so every mask is drawn.

## What the real cards look like

- **Starlight (Base Set, Jungle, Fossil, Legendary Collection holos).** Thin four-point stars of different sizes, a little blurry, on a pale
  shimmer over the whole picture. The Pokemon is ink over the foil and stays matte; frame, name, text flat. (Legendary Collection is a one-text-source
  claim: Collexy; the scans agree.)
- **Cosmos (Base Set 2, Team Rocket, Gym, Neo, the seven cosmos basep promos, Dark Raichu).** Dots, discs, squares and crosses over the window, each lit in one
  colour (cyan and teal lead), thick in dark sky, thin over pale ink. Southern Islands is plain.
- **Fireworks reverse (Legendary Collection, base6).** Starbursts of thin straight rays over the whole card except the art window (name bar, text, border
  included), silver, lit in a band as it tips.

## Recipe

- One art window fits every WotC frame (measured over 1001 scans, so there is no separate Neo frame): `assets/foil/wotc-win/{pokemon,trainer,energy}-v1.webp`
  (`scripts/make_wotc_window_masks.py`).
- The Scrydex scans of the holos carry the real foil: `scripts/make_wotc_spark_maps.py` lifts each card's sparkle (a top-hat above a 9 px median, small
  isolated pieces only, not beside ink lines) into `assets/foil/wotc-spark/<set>/<n>-v1.webp` (216 cards, 4.7 MB), a crop of the window placed by
  `--wotc-map-size/-pos` per layout. Cosmos sets gate by local density (a lone fleck is the Pokemon's colour); starlight sets carry a stronger floor.
- `.wotc-cosmos .foil`: screen-blended pointer pool and a spectrum wash, masked by `--art` x the card's map; `::before` the spectrum multiplied with a pool;
  `::after` white glints gated by a moving band; `.glare` overlay. `.wotc-starlight` repaints it paler and cooler (`--wotc-silver`). Nothing is colour-dodged.
- Fireworks: `assets/foil/wotc-rev/fireworks-v2.webp` (`scripts/make_wotc_fireworks.py`, seeded, 380 hubs, broken dashes; v1 was too faint and was dropped, see the review) as the mask of a teal-silver veil
  (normal blend; alpha = rays over a sheen floor) plus a white ray layer on `::before` (the same file's colour channels, `mask-mode: luminance`), minus the layout's window, extra specificity (`.foil-reverse.wotc-rev.wotc-rev-legendary`) so it beats the generic mirror rules.

## Known limits

- The maps are what the scan shows, so a Trainer holo (mostly ink) lights faintly, as the real one does.
- base1 and base5 scans are 1st Edition prints (data issue, not a finish issue).

## Review (rv-j1, 2026-10-01, fresh-context reviewer)

Checked: Base Set (Charizard, Blastoise, Venusaur, Alakazam, Ninetales), Jungle, Fossil, Base Set 2, Team Rocket (Dark Charizard, Dark Raichu, Dark Dragonite,
Rainbow Energy), Gym Heroes and Challenge (incl. Blaine, the trainer holo), Neo Genesis (Lugia, Steelix, Metal Energy, Pichu), Neo Discovery, Neo Revelation,
Neo Destiny, the Legendary Collection holos and reverses (Ivysaur, Pikachu, Bill, Full Heal Energy, Ninetales), basep cosmos promos and flat ones, Southern Islands,
the CD-ROM Machamp. Chromium and WebKit at 220 px x 3, poses rest, 30:25, -30:-20, 50:78, beside the Collexy scans in texture-refs/j1; a foil-minus-bare
measurement for every holo of every set (window and text box, three poses); the real app at iPhone 13 size (rip, reveal, inspector); settings.
Sheets: /mnt/project-files/every-era/wotc/finish-sheets/j1-review/.

What holds: the holos are the scan's own foil plus a pale light layer. The window map keeps the Pokemon matte (Lugia, Machamp, Gengar checked at full size), the frame,
name bar and rules text are flat at rest (foil-minus-bare 0.0 over the text box at rest, window +3 to +7 levels), the lit window gains 20 to 38 levels on 45 to 84 percent of
its pixels at 30:25 (same band as the EX cosmos on ex1: 29 to 32), no dark dots (dark_specks over every set), WebKit shows no dodge blocks (nothing is colour-dodged),
foil_coverage prints nothing, every Rare Holo of base1..neo4 resolves to a map file and the classes `wotc-cosmos` (+ `wotc-starlight` on base1/2/3/6) in the app DOM.

Found and changed:
- **Legendary Collection reverse too faint.** The v1 fireworks (150 hubs of 34-78 px, floor 0.16, pale veil) read as a faint shimmer beside the Pikachu, Ivysaur,
  Gengar and Charizard reverse scans: the bursts vanished on the pale frame. Real bursts are smaller (about 4 to 8 percent of the card width), denser, white rays on a
  teal-silver sheen, and the print stays readable through them. Redrawn as `fireworks-v2.webp` (v1 had never shipped and was removed), with the rays alone in the colour
  channels so one file masks both the veil (alpha) and the white rays (luminance). Keep the veil floor near 0.3: at 0.44 the flavour text and the name bar washed out in the inspector.
- **CD-ROM Machamp (base4-cdrom8, foilAs Rare Holo, scan base1/8) had no map**: it asked for wotc-spark/base4/cdrom8-v1.webp (404), so the cosmos layer was empty. A foilAs
  card now takes its scan's map. Any further reprint that borrows a WotC scan works the same.

What remains (not fixed):
- The `.glare` of the cosmos recipe is not cut to the window: at 30:25 it shades the text box by about 8 levels and at 50:78 lifts it by about 9 (EX cosmos does the same,
  so the family is consistent). Flat print stays legible; if Noah wants the text box dead flat, mask `.glare` with the window box (`--wotc-map-size/-pos`).
- Base Set and Team Rocket scans are 1st Edition prints (the Edition 1 stamp is in the picture): a data issue, not a finish issue.
- The sparkle maps carry short horizontal dashes where the scan has banding (Machamp, Dragonite): visible only as faint streaks at 30:25, not a screen.
- sweep_finishes.py flagged base4-cdrom8 as a window holo promo with no foil map (it only reads `foilMap` from the data file); it now skips `era: "wotc"`, whose maps come from wotcMap().
- Fossil Dragonite: the Collexy photo (cx_dargonite_cosmos) shows dots on a dark sky where the Scrydex scan shows a rainbow sky with stars; the recipe follows the scan, and the starlight-vs-cosmos label for Fossil rests on one source family (Collexy + Bulbapedia): unresolved.
- poke-holo.simey.me could not be rendered from this sandbox (its certificate is not trusted by the headless browsers); the comparison is with the in-site EX cosmos and the Collexy scans.
