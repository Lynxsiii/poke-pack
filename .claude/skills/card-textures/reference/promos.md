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
back to the art window: foil over the Pokémon and no border. They now get
a drawn window-and-frame map from `stamp_knockout.py` (below), stamped or
not, so the silver border is foil too; a Trainer's window sits lower
(`TRAINER_WINDOW`, windows.css's `.foil-trainer` inset). The Pokémon stays
foil: nothing on the scan says where it is. The drawing
is only for window holos: a stamped full-art print (the Paradox Rift
Pokémon Center promos, Illustration Rares) is foil where the drawing is
not, so `stamp_knockout.py` skips it until its TCG Live map is fetched
(`fetch_foil_maps.py --set <set> --cards <plain number> --ship --write-data`).

## Full-art promos with no map (Espeon ex MEP 108 and friends)

TCG Live has no maps for the Mega Evolution Black Star promos (MEP 037-063
starters, MEP 102-110 30th prints), nor for the Mega Evolution sets, Black
Bolt or White Flare. Until 2026-09-28 those full arts fell to realism.css's
no-map recipes, which stretch upstream's `illusion2.png` (concentric op-art
rings) over the card as `.foil::before`: on a phone the rings covered the
art and the text (Noah's Espeon ex MEP 108 and Keldeo ex screenshots).
`foilExtras()` now gives every Illustration Rare, Special Illustration
Rare, Ultra Rare, Hyper Rare and Mega Hyper Rare without a map the
all-white `assets/foil/maps/full.webp`, so celebration.css's and
sv-fullart.css's map recipes paint them edge to edge (the Pokémon and the
text box included, which the real maps would exclude; a Live map, when one
appears, wins automatically). Double Rares and Mega Attack Rares keep the
older recipes: their `illusion.png` tile at 33% reads as etch texture, not
rings.

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
   for the rest of the set. A list of boxes is knocked out as their union,
   so a crest over a wordmark (Pokémon Horizons: the Pokémon logo,
   HORIZONS, THE SERIES; Paradox Rift: the Scarlet & Violet mark over the
   name) gets a hole that hugs it rather than one rectangle of art.

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
frame print, the stamp sits in the matte art window) and `me1-133-stamp`
(the scan shows no stamp). A stamped print whose scan is the plain print's
(same `imageRemote`; `me1-64-stamp` and `me1-88-stamp`, which TCGplayer has
no photo of) has nothing to cut and takes the map as it is.

An unstamped window holo promo with no map (`foilAs` "Cosmos" or a holo
rarity, not a reverse) gets the drawn map in the same run. Limit a run to
some cards with `--only` (card numbers, across every set with `--all`).

Adding a stamped print: name it `<base id>-<suffix>` with one of the
suffixes above, ship its scan, run `stamp_knockout.py --set <set> --debug`,
and check the sheet. A new kind of stamp needs a zone in `ZONES` and, if
it is one logo across sets, a place in `GLOBAL_KINDS`.

**A print whose only copy is the stamped one is still a stamped print**
(2026-09-28, Noah: "the badge is fucked here"). Sprigatito svp191 and
Fuecoco svp192, the Pokémon Horizons promos, and the four Paradox Rift
Build & Battle promos (svp057 Chi-Yu, svp058 Iron Bundle, svp059 Xatu,
svp060 Aegislash) exist only with their logo, so they have no `-stamp`
suffix, no plain print to difference against, and no TCG Live map; filed
as `foilAs: "Rare"` with no map they fell to the old window recipe, whose
`clip-path` cut straight through the logo and whose bands streaked over
it. Give the plain id a hand box (a list of boxes for a logo with a
wordmark) and the script treats it as a stamped print: the drawn
window-and-frame map with the logo cut out (`"Rare"` counts as a window
holo, as `foilClass()` draws it). `sweep_finishes.py` lists every promo the
site draws as a window holo that has no map, and exits 1 while one exists;
`--stamped` sheets every stamped print. Promos with `foilAs` unset draw
with no foil at all, so a logo on them is safe until someone makes them
holo, which is when they need a box too (svp101, svp190, svp213 to svp215,
svp225 and me5 mep093 carry Play! Pokémon, Worlds and Illustration Contest
logos in the art).

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
