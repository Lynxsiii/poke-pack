# Holo family ex-gold-star (EX-era Gold Stars)

Module `js/fam/ex-gold-star.js`, sheet `css/holo/fam/ex-gold-star.css`, maps `assets/foil/fam/ex-gold-star/`, generators
`scripts/fam/ex-gold-star/`. Claims 25 faces: 22 cosmos stars (ex7-ex16, class `fam-ex-gold-star`) and the three refractor stars
(ex13-102 Gyarados, ex15-100 Charizard, ex15-101 Mew, all delta, class `fam-ex-gold-star-refractor`).

## The real cards (2026-10-22 audit; photos in /home/user/holo-refs/gs-ex7-ex8, gs-ex10-ex11, gs-ex12-ex13, gs-ex14-ex16, gs-delta-refractor)

Cosmos stars (high confidence unless noted):

- WHERE: the art window's BACKGROUND only. The Pokémon (fins, ribbons, crest, mane, fur included), the yellow border, the
  frame, the name bar and the text box are matte print. Sources: ex7-108/en-torchic-photo-lit-silver-ground-mixed-dots.jpg,
  ex10-115 (LegitApp authentic, CGC slab), ex12-90/inhand-slab-window-only-glitter-text-box-matte.jpg, ex16-100 in-hand.
- PATTERN: the EX cosmos, sparse: pinpoints, round dots, 4-dot clover clusters, a few big soft discs (Regice upper right,
  Pikachu beside the chest), printed where the scan shows them. Not uniform glitter. Fakes have big star-shaped sparkles; the
  real ones are round (LegitApp).
- COLOUR (medium): each dot one hue, mixed: white/silver, gold, green, cyan/blue, pink; the ink's tint leads (Regice gold and
  amber, Regirock cyan/teal, Pikachu blue/cyan/violet, Mewtwo a few cyan and white, Vaporeon gold in the cream swirl).
- GROUND (medium): a mirror under the dots. Facing the light it brightens as one broad soft sheet: silver-white (Rayquaza),
  a pastel violet-blue-green band (JP Latias), silver-gold (Suicune CGC, Regice). Dark windows (Treecko's bark, Mudkip's water,
  Raikou's navy sky) stay dark in hand.
- At rest or flat the card looks like the scan (the scan carries the printed dots).
- The gold star symbol after the name reflects as gold foil on Power Keepers (LegitApp "gold star reflection"; medium,
  not drawn yet).
- POP Series 5 Espeon ★ and Umbreon ★ (pop5-16, pop5-17) are NON-HOLO in English (fresh-pack tilted video frames, angled slab,
  Elite Fourum thread): the window's white dots are printed. Only the Japanese prints are cosmos. They stay `foil-none`.

Refractor stars (medium): the Pokémon is a smooth mirror (no dots, no grain) that throws a broad saturated rainbow when tilted
(about one spectrum across the Pokémon: Charizard green / cyan-blue / violet with its flame breath red-orange; Gyarados pink,
lilac, cyan, yellow on crest and fins; Mew pastel pink-yellow-green-blue on the head) and reads silver or steel in diffuse light;
the art background is ink. Charizard's flame breath and tail flame light with the body. Sources:
gs-delta-refractor/ex15-100/en-tilted-rainbow-body-and-flames.jpg, ex13-102/jp-tilted-rainbow-on-head-fins.jpg,
ex15-101/en-lit-rainbow-head-textbox-sparkle.jpg, ex15-100/en-inhand-silver-body-metallic-textbox.jpg. A fine sparkle on the
frame and text box under the ink (medium-low) is not drawn.

## What the site draws (2026-10-22 remake, review round 2; round 3 changes below)

Cosmos (`fam-ex-gold-star`). Two maps per card from make_ex_gold_star_maps.py (MAP_VERSION 4), both cropped to the art
window's box (scan pixels 36-563 x 70-393) and scaled to 456 x 279, placed by `--xg-map-size` / `--xg-map-pos` (87.8333%
38.5442% at 49.3151% 13.5922%):

- `<id>-v4.webp` (`--foil-map-xg`): alpha = the window background, a hard cut ending on the Pokémon's outline (GrabCut + hand
  HINTS: dabs, polygons, polylines; big holes stay background so sky seen through a loop is foil). The era window's notch
  above BASIC is filled (the foil runs down to the BASIC strip on the real Torchic). Saved with `exact` so RGB under alpha 0
  stays black (the encoder had filled it with stray lines).
- `<id>-dots-v4.webp` (`--foil-map-xg-dots`): the scan's own printed dots (local contrast over a 13 px and a 41 px median), each
  in its printed shape and one hue (60% its own tint, else a cosmos palette pick; Regice, Registeel, Vaporeon lean gold), a few
  pinpoints, Pikachu's lilac disc (EXTRA_DISCS, from the PSA 9 photo); OPAQUE, black between the dots, lifted x1.35.
- Why the size: WebKit decodes an image of 128,000 px or more asynchronously on a tile's first paint (ImageSource's 500 KB
  heuristic), so a 600 x 838 map left its layers blank on first lit frames.
- Why two layers only: with six masked, blended buffers per face (.foil, .glare, .cure and its two pseudos, filters) WebKit
  dropped whole layers on the last rows of a 3-card x 4-pose probe (review r1 measured it as ".cure darkens"; it was the
  .foil sheet and the dots both missing; hiding .glare alone brought them back). Now:
  - `.foil` the mirror ground: a soft band about half the window wide (silver-white core `--xg-core`, pastel violet / blue /
    cyan and green / lime / gold edges at `--xg-pastel`, default 0.4, 1 on Latias) sliding against the tilt; a pool at the
    pointer; the lamp's white core (was `.glare`); `--xg-wash` (Regice, Registeel: warm gold round the lamp). Screen,
    `(0.08 + card-opacity x 0.45) x --xg-sheen`; rest 0.05.
  - `.cure` one element: dots x (soft gate with a floor x a spectrum + the lamp's pool), multiplied onto the opaque dots file
    and masked by the ground; screen; x `--xg-dots`. `.cure::before/::after` and `.glare` draw nothing.
- Checked in WebKit, 3 cards x 5 poses (rest, 30:25, 75:65, 50:78, 15:15): .cure on minus .cure off >= -2 levels everywhere
  (JPEG noise), dots flashing at every lit pose.
- Per card (TUNE in the module): `--xg-sheen` 1 on light skies (Torchic, Latias, Rayquaza, Suicune, Regice), 0.9 on Jolteon,
  0.35-0.7 on dark ones; `--xg-dots` 0.6 Mewtwo, 1.25 Alakazam and Celebi; gold `--xg-core` on Regice, Registeel, Suicune,
  Vaporeon; `--xg-wash` gold on Regice and Registeel; `--xg-pastel` 1 Latias, 0.6 Torchic and Rayquaza, 0.12 Regice/Registeel.

Refractor (`fam-ex-gold-star-refractor`, maps `<id>-refractor-v3.webp`, 600 x 838, make_refractor_star_maps.py VERSION 3:
GrabCut in a band round the v1 blob plus FIX corrections, Charizard's flames at 0.7, `out` polygons for parts that leave the
window): v3 takes out the green between Charizard's tail and arm and under its left wing and the night sky under its right
wing's bone, adds its right wing tip over the frame; takes out the splash wedge between Mew's belly and tail, adds Mew's teal
tail loop (lower left) and the tail's oval tip over the frame; adds Gyarados' left fins, crest spike, fins under the head and
tail-fin tip, and takes out the fire seen through its neck loop. `.foil` a broad saturated spectrum (three cycles on a 220%
layer) plus a silver pool, screened; the pale prints (Mew, Gyarados: `gsr-pale`) by overlay; Charizard (`gsr-dark`) a cool
ping-pong spectrum (green, cyan, blue, violet) at 0.72 strength, because screened yellow turned its body a flat cream cut-out
and washed its ink out. Rest = a cool silver base at 0.14.

## Review round 2 fixes (2026-10-22, round 3)

- Masks, v5 for seven cards (the module's `V5` set; the rest stay v4). Each change is applied AFTER the card's GrabCut, so
  nothing else in a map moves: `cut` / `cutl` (Pokémon) and `uncut` (ground) shapes are snapped to the print by a small GrabCut
  of their own box (`local_cut`); `inkcut` polygons cut the pixels inside that are the Pokémon's ink (bright, or warm: white paws,
  brown and tan fur), not the forest or its dots. A first draft seeded the global GrabCut instead and lost Mudkip's lower tail
  lobe: a new seed shifts GrabCut's colour models and re-cuts far-away parts, so the generator now diffs cleanly against v4.
  - Rayquaza (ex8-107): its thin right arm, the arm's red fin, the claw and the coil down the right edge are cut (v4 lit them
    milky silver-green); the grey sky under its head is ground (the window's centre seed had made it a hard-edged unlit hole).
    The real sky lights as one sheet (en-rayquaza-psa-tilted-sky-silver.jpg).
  - Entei (ex10-113): the white front paws and the white paw, fur tuft and fur strand under the chest (inkcut; the white stick
    and grey square that lit on its leg are gone with the dots there).
  - Mudkip's left gill and left foot; Treecko's pupils and its right eye's sliver; Celebi's eye; Mewtwo's mouth and the arm's
    edge by the tail loop; Alakazam's right spoon.
- Gyarados (ex13-102, `gsr-pastel`, map refractor-v4): two alpha levels, the pale parts (low saturation, high value: the
  blue-grey and white fins, the light pink head, the tail fin) at 1 and the red body, crest and gold belly at 0.3, with a
  pastel cycle (pink, lilac, periwinkle, cyan, pale yellow, peach; every hue light, so overlay only lightens and tints). The
  saturated cycle at full strength had turned the red shiny body green / olive (75:65, 85:30) and hot magenta (15:15, 30:25);
  the JP and FR photos keep it red-orange with a gold belly and put the pastel rainbow on the crest and fins.
- Charizard (ex15-100, `gsr-dark`, map refractor-v4 + `ex15-100-flame-v1.webp`): lit `.foil` is hard-light (screen lifted the
  mid-grey body to a milky one-hue pastel): a saturated cool cycle (green, teal, cyan, blue, indigo, violet and back, about half a
  cycle across the body) multiplied by the inverted flame file (difference over a white background colour), and on
  `.foil::before` a warm cycle (red-orange, orange, gold, yellow-green) multiplied by the flame file and screened in, so the
  flame breath and tail flame glow red-orange while the body goes green / cyan / blue / violet (en-tilted-rainbow-body-and-
  flames.jpg). The flame file is 300 x 419 greyscale (the whole card, under WebKit's async-decode size); v4's map also lets the
  flame breath run out of the window over the frame (`flame_out`). Rest stays the screened silver base.
- Lead (outside these paths): bump index.html `css/holo/fam/ex-gold-star.css?v=5` to 6 and js/holo-fam.js `["ex-gold-star", 5]`
  to 6.

## Review round 3 fixes (2026-10-22, round 4)

- Charizard (ex15-100, map refractor-v5): v4 still held three pockets of black night sky (the sky right of the torso and thigh
  below the right arm, a strip right of the neck's outline up to the horn, the channel under the jaw between the left wing's arm
  and the left arm). Under the hard-light spectrum they lit as a royal-blue block with a straight edge and a dark-blue rectangle
  behind the neck; the real card's sky is ink (en-tilted-zoom.jpg, registered to the scan: photo = 1.16 x + 16.2, 1.14 y + 35.3).
  Charizard's skin is black ink like the sky, so colour cannot part them, but the printed outline (light blue-grey, 90-220) can:
  `sky_cut` floods each pocket from a seed over the 4-connected pixels darker than 35 inside a hand polygon, takes the dark fringe
  2 px into the outline, and drops islands left in the polygons. It runs after the GrabCut, so the v4 to v5 diff is only those
  pockets. The neck's outline fades where it meets the shoulder (y 210), so that polygon stops there (the shoulder is body, lit
  blue in the photo). The dark bands inside the right wing's membrane are membrane (they show on the wing in the photo) and stay.
- Gyarados (ex13-102, map refractor-v5): the light pink head behind the crest and the upper neck were at 1 with the fins and went
  an even pink-magenta at 30:25 (overlaying the pink stop on pink ink saturates it); the JP tilted photo keeps the head
  salmon-red. Inside a head polygon (FIX "warm") the warm pale ink (hue outside 130-310 degrees) drops to 0.35; the blue-grey fins
  and crest keep 1, and so does the tail fin outside the polygon (the photo lights it pale cyan). Lit, `gsr-pastel` adds a light
  constant silver (0.22) and a broad silver sheet sliding against the tilt over the pastel cycle, so the pale fins lift toward
  silver-white at every lit pose (at 75:65 they had stayed their printed pale blue) while the body and head only lighten a little.
- Entei (ex10-113, map v6): the pale smoke (matte ink: the top-centre and top-right banks, the right-edge column with its grey
  shadow, two strands at the lower right), two mane-spike tips and the brown fur fringe under the armour were still foil ground.
  `postcut` cuts them AFTER the dots are drawn (pale / grey / warm / ink tests inside hand polygons; the dark sky and the
  saturated dots stay), so the seeded dot colours and pinpoints elsewhere are byte-identical to v5.
- Lead (outside these paths, still required): bump index.html `css/holo/fam/ex-gold-star.css?v=5` to 6 and js/holo-fam.js
  `["ex-gold-star", 5]` to 6 (the module emits gsr-pastel, --gsr-flame and new map names the new sheet rules need).
- pop5-16 / pop5-17 stay non-holo (data/pop5.json unchanged): the English POP 5 prints are non-holo in the audit's fresh-pack
  tilted frames, an angled slab and the Elite Fourum thread; only the Japanese prints have a cosmos window.

## Not done yet

- The gold-foil star symbol after the name (needs a per-card mask; LegitApp shows it on Power Keepers).
- The refractor stars' faint frame and text-box sparkle (medium-low confidence).
- Whether the dark night-sky patch under Charizard's right wing bone is membrane or sky is not settled by the photos (it is
  left out, ending on the printed outline).
