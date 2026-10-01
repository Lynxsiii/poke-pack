# XY: Rare Holo, Starlight, Reverse Holo, plain-card glare

Sheet: `css/holo/xy.css`. Classes from `js/xy-foil.js` (`xyPattern`, `xyHoloPattern`, `xyHoloMap`, `xyMap`, `xyReverseFinish`, `xyReverseExtras`) and the reverse hook in `js/foil-maps.js`. Assets: `assets/foil/xy-win/*.webp` (6 window masks, `scripts/make_xy_window_masks.py`), `assets/foil/xy-reverse/<type>.webp` (12 tiles, `scripts/make_xy_reverse.py`). Photos and caveats: `/mnt/project-files/every-era/xy/texture-refs/f1-holo-reverse/SOURCES.txt`. Contact sheets: `/mnt/project-files/every-era/xy/finish-sheets/f1/` (Chromium and WebKit, 220 px x 3, rest / 30:25 / -30:-20 / 50:78).

## What the real cards are (the brief said "cosmos"; the sources say otherwise)

- **XY pack Rare Holo is Sheen, not Cosmos.** Collexy's XY holofoil overview and Cardveil's holo-pattern guide agree (Bulbapedia's Holofoil page says the same in its search snippet; the page itself was blocked). Photos (Beautifly, Salamence, Delphox, Gengar, Azumarill, Hawlucha): broad saturated rainbow bands (cyan, green, magenta, yellow) cross the art on a rising diagonal with dark gaps, a fine sand over them, a few star glints; frame and text box stay matte. Cosmos and Cracked Ice exist only on XY theme-deck and blister variants (codedyellow, Cardveil); McDonald's 2014-16 are Confetti.
- **Which parts are foil.** TCG Live's per-card maps (xy1 to xy12, g1, dc1, promos; builders ship them to `assets/foil/maps/<set>/`) knock the Pokémon out on many cards (Beautifly, Salamence: background foil, body matte) and cover the whole extended art on others (Dragonite xy6-52). The photos of Beautifly and Salamence show exactly that, so the maps are right and win wherever data names one. The drawn masks cover prints without a map.
- **Evolutions (xy12) reprint holos are Starlight**: a fine gold-warm star-glint field over the whole picture, Base Set style (Collexy, codedyellow, cardmavin list; Charizard, Mew, Ninetales clips). Only 13 non-EX cards: 11 15 25 34 36 38 42 45 53 59 62 63 70. xy12-11 Charizard prints the EVOLUTIONS logo over its art, so its mask cuts the logo.
- **Reverse holo (standard sets)**: the whole body but the art window is mirror foil, mottled, with big ghosted outlined type symbols (2 to 3 sizes, tilted, overlapping); Trainers get Poke Balls (codedyellow, Cardveil; Espurr, Finneon clips). Mirror and Crosshatch appear only on stamped league and championship variants.
- **Plain Rare / Common / Uncommon**: not foil; ordinary glare.

## Recipes

**Sheen (`foil-holo xy-holo`).** `.foil`: a `repeating-linear-gradient(140deg)` of violet, blue, green, yellow, red between 12% grey gaps (period 24%), multiplied onto a pointer radial (80% to 30% grey), 170% size, position clamped 0-100% (`clamp()` on both axes), `mix-blend-mode: color-dodge`, `brightness(0.8) contrast(1.5) saturate(1.8) contrast(0.8)`. Rest: `brightness(0.9) contrast(1.15) saturate(0.7)`, opacity 0.22. `::before` = `glitter-fine.webp` twice, screened (light only). `::after` = soft conic rays from the pointer (9 degree wide steps, never a hairline), screened at 0.35. `.glare` = overlay radial at 0.45 x card opacity.

**Starlight (`xy-starlight`).** Two glitter tiles at 70% and 42% screened over a warm broad gradient (gold, cyan, pink, gold, green at 115deg, 220%) multiplied onto the pointer pool, color-dodge, `brightness(0.6) contrast(1.35) saturate(1.1) contrast(0.8)`; `::before` a third glitter scale screened.

**Window mask fallback (`xyHoloMap`).** `assets/foil/xy-win/pokemon.webp` (x .088-.912, y .105-.494 of the 734 x 1024 scan), `pokemon-evo.webp` (window top .113 and the evolution circle, centre .108/.1128, radius .076 of the width, punched out: Stage 1, Stage 2, any `evolvesFrom`), `trainer.webp` (.104-.896, .163-.512), and Evolutions' retro frame: `evo12-pokemon.webp`, `evo12-pokemon-11.webp` (logo cut), `evo12-trainer.webp`. Measured as the per-pixel standard deviation of about 50 scans per layout, edges inset 0.25%. White with the window as alpha; `has-foil-map` and `mask-mode: alpha` do the rest. EX, Mega and BREAK frames are f2's.

**Reverse (`rev-mirror era-xy xy-rev xy-rev-<type>`).** `.foil` = the type's tile (opaque, 600 x 838, grey 0.5 mottle, symbols lighter with a darker outline) multiplied with a broad pink/cyan/green/yellow band (62% floor grey) and a pointer pool (56% floor), color-dodge, `brightness(1.05) contrast(2) saturate(1.2) contrast(0.8)`. Mask: `--art` minus `--xy-win` (the layout's window, set inline by `xyReverseExtras`). `::after` = the tile again, `brightness(0.55) contrast(3.5)`, screened at 0.35 to 0.75: dark bodies (Darkness, Metal) are black to a colour-dodge, so the symbols are also added as light. Trainer (and Special Energy) start under the title and name plate (clip 15.8% top, 22.5% on Evolutions) so a Poke Ball does not smudge the pale plate. Basic Energy: the picture is foil, the name bar and footer are not (`clip-path: inset(7.2% 3.4% 4.6% 3.4%)`), no window.

**Plain glare.** `.tcg.foil-none.era-xy .glare`: overlay radial, white 0.8 to 0.65, dark end held at 0.3 (same as swsh.css and sm.css).

## Data note

Rare Holo is folded into "Rare" in the xy4, xy5, xy11, xy12 and dc1 data the builders filed (config has `era: "xy"` but pkmn.gg gave no holo split there). `XY_HOLO_FALLBACK` in `js/xy-foil.js` lists the numbers pokemontcg.io calls "Rare Holo" for those sets so they still draw; drop an entry once the data says "Rare Holo". Verified against cardmavin for xy12 only.

## What I would check next / what still looks off

- No macro photos: sand grain and glint size are judged from phone-size thumbnails only.
- The Sheen bands are one repeating gradient; the real foil has a crisper, more crystalline edge between bands than a CSS gradient can give.
- Basic Energy reverse is the least evidenced finish (one thumbnail, no text source); Trainer reverse is medium.
- Some scans (Salamence xy6-57) are posterised in the source image; the foil on them looks harsher than the real card.
