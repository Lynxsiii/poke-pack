<!-- Family note for the holo family wotc-fossil (older-era holo remaster, 2026-10-02). Research, photos and sheets: /mnt/project-files/holo-remaster/wotc-fossil/. Built on the wotc-jungle recipe (fam-wotc-jungle.md): same Starlight foil, per-card background masks from scripts/fam/wotc-fossil/make_fossil_maps.py. -->
# wotc-fossil working notes (Fossil, base3 Rare Holo 1-15)

Updated 2026-10-02 02:30 UTC after the container restart. Read this first on any restart.

## Scope
- `js/fam/wotc-fossil.js` claims the 15 base3 Rare Holo faces (`wotc-cosmos` pattern, not reverse). Fossil printed no reverse
  holos and no holo Trainers/Energy, so there is one finish and one layout (Pokémon window, Stage badge on 9 of them).
- BEFORE (master): `foil-holo wotc-cosmos wotc-starlight` in css/holo/wotc.css: a pale screened wash cut to the scan's
  sparkle map (assets/foil/wotc-spark/base3/<n>-v1.webp). Weak because the foil only exists on the scan's star pixels plus
  a blotchy floor; the mirror background never lights; nothing moves like a lamp on foil.

## What the real card does (sources in refs/SOURCES.md)
- Pattern: English Fossil holos are all **Starlight** (Collexy holofoil overview: "In Fossil, the Starlight Holofoil pattern
  was used for all English variants of all Masters with the rarity Holo Rare"). The Collexy photo of Dragonite with dots on a
  dark sky is the **cosmos** foil of the unofficial English cosmos release ("for Fossil there was an unofficial release of
  English variants with the Cosmos Holofoil pattern"; also Elite Fourum threads, Pokumon). So the scan (starlight) is right:
  open item of reference/wotc.md settled.
- Where: the art window's BACKGROUND only. The Pokémon is ink on a white underlay and stays matte; frame, name, text,
  Stage badge, illustrator line flat. Dark ink blocks the foil (Muk's black, Moltres' black hole stay dark).
- Pattern detail: (a) sparse printed 8-point starbursts at fixed places (4 long arms + 4 short diagonals, solid core; the
  scan shows exactly where; big crisp ones and small softer ones); (b) a dense micro pattern of tiny diffraction flecks over
  the whole background. Under a point lamp each fleck lights as a short UPRIGHT streak (about 0.6% of the window wide,
  2-3% tall) in one saturated colour; neighbours differ (green, red, orange, gold, blue, violet), but colours group by
  region (Lapras frame: warm on the left, green middle, blue-violet right) and the grouping slides as the card tilts.
  The scanner draws the same flecks as horizontal dashes (scanner lamp), which is why the scan shows "brushed" dashes.
- Light: diffuse room light = the print with a faint sparkle (Hypno pair, Zapdos room light). Lamp near the mirror angle =
  the background lights up as a whole in the ink's own hue (gold for Hitmonlee/Kabutops, lilac-silver for Gengar), the
  streak flecks glitter all over it and the stars flare crisp in one colour each (Hitmonlee: yellow, green, cyan). Sun on a
  PSA slab: the window flashes nearly white (Gengar). Off-angle the background goes a muted greyer version of the print.
- Evidence: 8 cards in video frames (Lapras, Hitmonlee x2, Kabutops, Hypno, Zapdos, Gengar, Articuno, Muk) + Collexy scans.

## Decisions
1. Foil area per card = art window minus the Pokémon (hand-guided silhouettes refined on the scan's ink outline) minus the
   Stage badge (consensus template from the 7 clean stage scans, dilated 2 px). Generator:
   `.claude/skills/card-textures/scripts/fam/wotc-fossil/make_fossil_maps.py` (+ `fossil_hints.json`).
2. `.foil` = one colour-dodge group (gain on the print: the ink keeps its hue, dark ink stays dark), chain ends contrast(0.8).
   Rest: soft diagonal sheen + faint flecks. Lit: pointer pool + sliding diffraction spectrum.
3. Flecks: per-card seeded upright streaks (not a shared tile), coloured by a sliding spectrum; per-fleck colour variety
   via an RGB key image blended `exclusion` with the spectrum (neighbours differ, grouping slides with tilt).
4. Stars: the scan's own stars, located and redrawn crisp at their exact place, flaring with the pointer.
5. Glare: light only (screen), masked to the foil area; never on the Pokémon or text.

## Built so far
- Silhouettes for all 15 (scratch: scratchpad/wotc-fossil/seg5.py + hints5.json + auto.py thresholds, previews
  seg/all-masks.jpg); Stage badge consensus (evo.py, seg/evo-cons.npy).
- Auto-threshold parameters used (auto.py n thr open mode keep): 2: .45/2; 3: GrabCut (seg3.py, hints.json "3");
  6: .30/2; 7: .36/2; 8: .36/2; 9: .33/2; 10: .40/2; 11: .36/2; 12: .40/2 keep 2; 13: .30/2; 14: .42/2;
  15: .38/1 mode (L>thr)|((G-B>-0.03)&(L>0.08)). 1, 4, 5 are hand outlines (hints5.json), 4 uses the ridge method.

## Left
- Port segmentation into the generator, write maps, module styles, CSS; renders + measurement; gates 1-6; docs.
