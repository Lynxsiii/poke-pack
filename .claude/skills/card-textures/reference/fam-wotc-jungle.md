<!-- Family note for the holo family wotc-jungle (older-era holo remaster, 2026-10-01/02). Research, photos and sheets: /mnt/project-files/holo-remaster/wotc-jungle/ -->
# wotc-jungle: working notes

Family agent notes for Jungle (base2) Rare Holo 1-16 (Starlight). Written so a restart never costs the research again.
Scratch: /tmp/claude-0/-home-user-poke-pack/df72335e-214f-5d4a-b747-c7cb0408b049/scratchpad/wotc-jungle/ ($SC).

## What the real card does (research, 2026-10-01)

Sources (links in refs/SOURCES.md): about 14 English Jungle tilt clips on YouTube (frames via i.ytimg.com maxres1-3 thumbnails:
Clefable 1st Ed + prerelease, Electrode, Flareon, Jolteon x2, Kangaskhan x2, Mr. Mime, Pidgeot, Pinsir, Scyther, Snorlax,
Vaporeon, Venomoth, Vileplume, Wigglytuff, an Australian Eeveelution set), Collexy (insights.collexy.com posts 529, 640, 192:
English Jungle is Starlight in every print, 1st Ed, Unlimited, no-symbol, the Clefable prerelease; other languages Cosmos),
Collexy's high-res Snorlax and Clefable photos, Base Set clips for comparison (Blastoise), Bulbapedia Holofoil.

- Foil: the whole art-window BACKGROUND (sky and scenery, Clefable's rock too). The Pokémon is printed over a white underlay
  and stays matte; frame, name bar, text box and the evolution badge are flat.
- Off the lamp: a muted metallic version of the print, the stars and smears visible.
- On the lamp: the background brightens as a whole (gold-olive, silver-blue, violet, teal as the angle changes; a broad
  colour drift across the card), dense short upright streaks of every colour (gold, green, cyan, blue, violet, pink, white,
  roughly 10 card px apart, 1-2 px wide, 3-10 px long) glitter over it, and the thin four-point stars flare white or tinted.
- Dark ink blocks it: Mr. Mime's black background stays black, only the swirl lines glow.
- Stars are NOT registered to the art: Collexy's Snorlax and the site's Snorlax scan have stars in different places. So the
  stars to flare are the scan's own (this copy's), found in the scan.
- The scanner draws each glint as a horizontal smear (line light source); under a lamp the streaks are upright. Same foil.
- Jungle vs Base Set: no difference found (same Starlight foil, same window layout); Jungle/Fossil are the last Starlight.

## Diagnosis of the old recipe (`foil-holo wotc-cosmos wotc-starlight`, css/holo/wotc.css)

Pale screened wash cut to per-card spark islands (assets/foil/wotc-spark/base2/<n>-v1.webp): most of the real foil stays
dark (islands), the screen wash greys rather than flashes, the island maps carry Pokémon linework (Vaporeon's fin), and on
Stage cards the shared window (wotc-win) foils the evolution badge. No glitter, no flash.

## Decisions

- Per-card background mask from the scan (window measured per card, evolution badge voted from 99 Stage scans of base1-3 and
  slid on by template match, Pokémon cut with seeded GrabCut + hand hints, grown 1 px, feathered 0.8 px).
- `.foil` = one colour-dodge group on that mask (gain on the print: hue kept, dark ink stays dark). Rest: soft diagonal sheen.
  Lit: diffraction spectrum sliding with tilt + pointer pool. Chain ends contrast(0.8).
- Glitter: shared seeded image of upright micro-streaks (two halves a/b), screened into the dodge group, each half lit by its
  own sliding band and the pointer pool so streaks wink in turn. Base gain must stay moderate or the glitter has no headroom.
- Stars: the scan's own top-hat sparkle (pale only, 3 px inside the background) + bloom, screened white on `.glare` around
  the pointer.
- Tuning tool: $SC/sim.py (numpy flat-card simulation of the sheet; matches the browser closely), $SC/measure.py
  (foil-minus-bare per zone), params_v*.py.

## Built (state at 2026-10-02 02:25)

- .claude/skills/card-textures/scripts/fam/wotc-jungle/make_jungle_maps.py + make_jungle_maps_hints.json (hints for 1, 3, 6,
  11, 12, 14; all 16 cuts checked by eye).
- assets/foil/fam/wotc-jungle/: <n>-bg-v1.webp, <n>-stars-v1.webp (16 each), glitter-a-v1.webp, glitter-b-v1.webp (744 KB).
- js/fam/wotc-jungle.js: per-card --wj-bg, --wj-stars, --wj-glitter-a/-b, class wj-mapped.
- css/holo/fam/wotc-jungle.css: v1 recipe (too bright and pastel when lit; being retuned in the sim).

## Measured (sim, v4 params)

foil-minus-bare in the background zone: rest +6..13, lit +18..54 (dark cards lower); Pokémon and text 0.0.

## Left

- Finish tuning (v4+: lower base gain, make the glitter carry the sparkle), port to CSS, browser check (Chromium s2).
- Gates: before/after sheets (Chromium + WebKit, s3, 6+ cards: Scyther, Snorlax, Vaporeon, Jolteon, Mr. Mime, Wigglytuff,
  Electrode), phone-compare.jpg, foil_coverage.mjs base2, sweep_finishes.py --set base2, foil_probe --idle, famcensus = 16,
  settings (strength low/high, no-shine, reduced motion, no-tilt, Classic).
- refs/ + SOURCES.md, reference/fam-wotc-jungle.md, LESSONS.md, REPORT.md.
- Shared change to report: assets/foil/wotc-win/pokemon-v1.webp foils the evolution badge on every Stage card of the other
  WotC families that still use it.
