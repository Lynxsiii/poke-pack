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

Every non-EX holo of the era is "Rare Holo" in the data (`data/xy*.json`, dc1, g1) and has a TCG Live map (`foilMap`) or, for McDonald's 2014-16 and the trainer kits (rarity "Promo", `foilAs: "Rare Holo"`, `era: "xy"`, no map), the drawn window mask of its frame. The `XY_HOLO_FALLBACK` table the builder first wrote (numbers filed as "Rare" in xy4, xy5, xy11, xy12, dc1) was redundant once the data was merged and was removed in the review; the plain "Rare" of `xyPattern` is `foil-none`. XY set configs list "Rare Holo" in `reverseRarities`, so a Rare Holo can also be the reverse-slot card: it takes the `xy-rev` finish, not the holo.

## What I would check next / what still looks off

- No macro photos: sand grain and glint size are judged from phone-size thumbnails only.
- The Sheen bands are one repeating gradient; the real foil has a crisper, more crystalline edge between bands than a CSS gradient can give.
- Basic Energy reverse is the least evidenced finish (one thumbnail, no text source); Trainer reverse is medium.
- Some scans (Salamence xy6-57) are posterised in the source image; the foil on them looks harsher than the real card.

## Review (rv-f1, branch xy/rv-f1)

Checked: Sheen Rare Holo (xy1, xy2, xy4, xy5, xy6, xy7, xy10, dc1, g1), Starlight (xy12), reverse holo of Pokemon, Trainer and basic Energy (xy1, xy2, xy7, xy12 sheets), plain glare, the drawn-window fallbacks (xy0 Kalos Starter Set, McDonald's 2014, trainer kit xytk6a, xy12 black-star promos). Foil probe sheets at 220 px, 3x, poses rest, 30:25, -30:-20, 50:78, in Chromium and WebKit; `foil_coverage.mjs` over xy0-xy12, dc1, g1, xyp, mcd14-16, xytk* printed nothing (exit 0); `dark_specks` inside the budget for xy0, xy1, xy2, xy4, xy12, dc1, g1, mcd14, xytk6a; a data survey (every XY card through `xyPattern` / `foilExtras`, with `foilAs` gating) shows no card falling to the generic engine and every non-EX holo with a mask; the real app at iPhone 13 size (ripped packs of xy1 and xy12, reveal and inspector of Vivillon xy1-17 and Delphox xy1-26 reverse in Chromium, Chansey and Mew in WebKit); settings toggled through the settings page on Vivillon (subtle, intense, no shine, classic, reduced motion).

Found and changed (one commit each):
- `XY_HOLO_FALLBACK` and `XY_HOLO_IDS` removed (redundant once merged, the data says "Rare Holo" everywhere).
- `isEvolutions` matched every id starting `xy12-`, so the xy12-xyp Black Star promos drew Starlight and the retro window mask. It now matches `xy12-<number>` only.
- Starlight on a white or very pale window (Chansey, Mew's sky, Poliwrath's water): a colour-dodge cannot brighten white, so the foil read as nothing at tilt. `.xy-starlight.has-foil-map .glare` now multiplies a pastel cyan / yellow / pink wash (lightness 76% or more) through the same mask, the dodge foil stays. Verified in both engines and in the app.
- Basic Energy reverse: `.xy-rev .glare` masked with the undefined `--xy-win`, which drops the whole mask declaration, so the glare was unmasked. It now has the foil's own `--art` mask and `inset()` clip. No visible change in sheets (the glare is faint there), correctness only.

Judged fine: the McDonald's, kit, xyp and Kalos holos paint the art window only (text, name bar and evolution circle clean); Metal commons show a diagonal hatch, that is the printed frame of the scan, not foil; Sheen reads like SM's envelope; reverse text lift at the thumb pose is comparable to SM; no dodge blotches or specks on the dark cards (Ralts, Goomy, Darkness Energy) in WebKit; foil strength subtle and intense differ only slightly at a lit pose (opacity is capped), classic mode draws the shared classic window stripes, no shine switches the foil off as in every era, reduced motion keeps the lit pose static.

Remains:
- Radiant Collection (g1-RC*, `xy-rc`, 12 Commons, 12 Uncommons and 2 EX with no map) belongs to f3 (css/holo/xy-fullart.css); not reviewed here.
- Reverse of basic Energy is the least evidenced finish (one thumbnail, no macro photo); sand grain and glint size are judged from thumbnails only and there is no poke-holo.simey.me side-by-side (no network in the session).
- Real packs cannot yield a reverse of basic Energy; it only shows through cards with a reverse flag (the inspector, trades).
- Chromium sweeps hit 30 s screenshot timeouts while the machine ran at load 30; the re-renders with longer timeouts were done by hand and are in the sheets.
- Tilted 3D screenshots in headless Chromium are rasterised softly (text blurs while the card is moving); at rest the card is crisp. Shared card-motion code, not XY.

