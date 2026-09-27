# Promos: cosmos, shiny promos and stamped prints

How the collection-box, blister and store promos got their real foils
(2026-09-27, from the "Shiny and promo holo fix" thread). Three things were
wrong: the cosmos foil showed as a few faint sparkles, Shiny Rare promos
(and the set's shinies) stayed paper white, and every stamped print ran its
foil straight over the stamp because it reused the plain print's map.

## What a promo is on the site

A promo record has `rarity: "Promo"` and borrows a finish through `foilAs`
(`foilLook()` in `js/app.js`): `"Cosmos"`, `"Shiny Ultra Rare"`,
`"Illustration Rare"`, `"Double Rare"`, `"Frame"` (a reverse cosmos frame),
`"Poke Ball"`. The borrowed rarity picks the classes; `js/foil-maps.js`
adds the map classes from the promo's own `foilMap`, `etchMap` and
`etchAngle`. A `variant` names the print ("Pokémon Center stamp",
"Pixel Cosmos Holo").

## Cosmos (`foilAs: "Cosmos"`, `css/holo/promos.css`)

Two prints exist; the "Promos for existing sets" thread measured them from
photos (`/mnt/project-files/promos-existing-sets/texture-refs/REPORT.md`):

- **Smooth cosmos** (SVP 001 to 139, 2023 to mid-2024): round soft planets
  up to 8% of the card width, finer round dots, the odd thin continuous
  swirl.
- **Pixel cosmos** (every English cosmos promo since Tinkaton SVP 140,
  September 2024, and every Mega Evolution-era one, whatever TCGplayer
  calls it): a square grid of cells about 0.4% of the width; stair-stepped
  blocky planets 2.5-8% (mostly 2-4%); single-cell specks and 5-cell "+"
  shapes about 1.5% apart; sparse blocky crosses and 8-point stars 1.3-3.5%;
  zero to two dotted swirls. Placement differs on every copy.

Both: the foil sits under the art-window background and the whole outer
silver border; the Pokémon, header, text box and any stamp are ink on top.
Off the light it is dark grey with pale specks, which the scans already
show. Held to the light each patch of foil lights in one saturated colour,
the colour sweeps across the card over about 2 cm as it tips, and the
specks flash brighter than the ground.

`pixelCosmos(card)` in `js/foil-maps.js` decides the print: a `variant`
naming "Pixel" wins; otherwise Mega Evolution sets, sv8pt5 and later, and
SVP numbers of 140 and up are pixel. It adds `cosmos-pixel` next to
`foil-holo foil-cosmos`.

The recipe: `.foil` is the colour sweep (upstream's 12-stop rainbow at
400% x 900%, moved by the pointer) over a white radial sheen, screened at
full strength when held and 0.3 at rest; the TCG Live map does the rest,
since it paints the inked art background at about half and the bare border
at full. `::before` is the specks lit in the sweep's colour: the galaxy
texture is the layer's mask (upstream's `cosmos-middle-trans` plus
`cosmos-top-trans` at 200%, or `assets/foil/promo/pixel-cosmos.webp` at
125%, both placed by `--seed-x/y`), and the sweep behind it sits a little
off the ground's. `::after` runs narrow white stripes over the same specks,
three times as fast as the pointer, so specks wink. `.glare` is a soft
overlay highlight.

`scripts/make_pixel_cosmos.py --out assets/foil/promo/pixel-cosmos.webp`
draws the pixel texture (seeded; white shapes on transparent, 720 x 1008,
24 KB). Its numbers come from the report above; the planets carry a
top-to-bottom brightness ramp in their alpha.

A cosmos print with no map (the set-card cosmos prints of Journey Together
and the Mega Evolution sets, whose plain print is a non-holo Rare) falls
back to the art window: foil over the Pokémon and no border. The stamped
ones now get a drawn window-and-frame map (below); the unstamped ones
could take the same map for the border's sake, not done yet.

## Shiny Rare and Shiny Ultra Rare (`css/holo/shiny-vault.css`)

Rewritten; the recipe is in [paldean-fates.md](paldean-fates.md). The
change that mattered: the scan is white where the silver is, so the silver
has to darken it. `.foil` now multiplies onto the card (a pointer-centred
silver ramp, pastel translucent rainbow bands, the etch soft-lit on top as
grain), which also gives a silver rest state from the one layer. The rings
come from the line-direction map (`--etch-angle`) at a softer contrast, in
a light copy (screen) and a dark copy half a turn round the whorl
(`.glare::after`, multiply, `mod()` on the pointer phase). Shiny promos
(SVP 069 to 084) print the same and need `etchAngle`: `fetch_foil_maps.py
--set <set> --cards <numbers> --ship --write-data --etch-angle etched`.

## Stamped prints (`scripts/stamp_knockout.py`)

A stamped print is a card id of the form `<base>-<suffix>`: `-pc` (Pokémon
Center), `-stamp` and `-stamped` (a set or collection logo), `-prerelease`,
`-pokemon-day`, `-blister`, `-gamestop`, `-ebgames`. TCG Live has no map for
any of them (its svbsp 072 map is the plain print's), so the site filed
each with the plain print's map and the foil ran over the stamp. On the
card the stamp is opaque ink with no foil under it.

`stamp_knockout.py --all` finds each stamp and cuts it out:

1. **Difference**, when both scans come from one source (they differ on
   under 5% of the card): align (whole-card phase correlation, then per
   120 px tile), difference, blur, threshold, keep the strongest compact
   blob in the zone that kind of stamp sits in (bottom right for Pokémon
   Center, the art window for the rest) plus the blobs next to it. The
   crop under it becomes a template.
2. **Template**: scans from different sources differ everywhere (a
   re-scan, other sharpening), so the stamp is found by masked normalised
   cross-correlation with the templates step 1 made, at five scales.
   Pokémon Center, GameStop and EB Games stamps are one logo everywhere and
   share templates across sets; set logos match within a set. Pokémon
   Center stamps come in two sizes (190 px and 145 px wide on a 600 px
   scan), and a difference often catches only the ball, so every PC print
   gets the widest complete detection placed by template.
3. **Hand box**: `scripts/stamp_boxes.json` maps a card id to
   `[x, y, w, h]` on the 600 x 838 scan (a fifth entry `"ellipse"` for a
   round badge). When a base scan exists the box is refined to the stamp's
   shape from the difference inside it, and the result seeds a template
   for the rest of the set.

The stamp is dilated two pixels, feathered, and subtracted from the map to
cut from: the plain print's map; else the print's own TCG Live map (kept
beside the cut one as `<number>.live.webp`, so a rerun cuts from the
original); else a drawn map of the standard art window (windows.css's
inset) and the outer frame (3.6% x 2.6%), which also gives those prints
the border foil they lacked. Output: `assets/foil/maps/<set>/<number>.webp`
and the card's `foilMap`; the base's etch maps are shared. Maps come out
with TCG Live's dark floor removed (`fetch_foil_maps.py` does the same
now: "not foil" is 22/255 in Live's PNGs, which leaked a faint sheen over
text boxes).

`--debug` writes a contact sheet per set to `scripts/_debug/stamps/`
(gitignored); look at it. Anything skipped is listed with the reason; give
it a box. Skipped for good reasons: `sv8pt5-74-pokemon-day` (a reverse
frame print, the stamp sits in the matte art window) and
`me1-64/88/133-stamp` (the scans show no stamp).

Adding a stamped print: name it `<base id>-<suffix>` with one of the
suffixes above, ship its scan, run `stamp_knockout.py --set <set> --debug`,
and check the sheet. A new kind of stamp needs a zone in `ZONES` and, if
it is one logo across sets, a place in `GLOBAL_KINDS`.

## Lab pitfalls fixed on the way

- `lab/lab.js` had no `foilLook()`, so every promo rendered as `foil-none`,
  and `lab/index.html` did not load `promos.css`: cosmos looked like holo
  bars. Both fixed; the lab now mirrors the site's sheet order.
- The rest state's `.foil` opacity multiplies its pseudo layers too. A
  speck layer at `opacity: 1` inside a `.foil` at 0.4 shows at 0.4; put the
  translucency in the gradient's alpha and keep `.foil` near 1 when held.
- A TCG Live map paints a translucently inked art background at about
  half alpha, the bare border at full. Tune layers for the border and let
  the map scale the window down, not the other way round.
