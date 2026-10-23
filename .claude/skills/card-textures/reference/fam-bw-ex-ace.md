# Family bw-ex-ace: Black & White regular-art Pokemon-EX and ACE SPEC (81 faces)

Files: `js/fam/bw-ex-ace.js` (claims every `bw-ex` and `bw-ace` face; class `fam-bw-ex-ace`), `css/holo/fam/bw-ex-ace.css`,
`assets/foil/fam/bw-ex-ace/{ex-vlines,ex-grain,ex-pillar,ex-fan,exp-<set>-<n> (all 68 EX),ace-dash,ace-glint,ace-<set>-<n>}.webp`,
`scripts/fam/bw-ex-ace/{make_ex_vlines,make_ex_grain,make_ex_pillar,make_ex_pillar_masks,make_ace_dash,make_ace_masks}.py` (make_ace_tinsel.py drew
the retired ace-tinsel.webp; ex_bands.py printed the retired --bxa-strips).
Research, photos, sheets: `/mnt/project-files/holo-remaster/bw-ex-ace/` (refs/SOURCES.md, sheets/, NOTES.md, LESSONS.md).
Scope: bw4 to bw11 EX and promo EX (68), ACE SPEC of bw7 to bw10 (13). Full art EX, secrets and the Radiant Collection are other
families'. The older era sheet `css/holo/bw-ex.css` still draws these cards when `&fam=off` (the BEFORE picture).

## What the real cards do (re-derived from photos, audit 2026-10-22)
Photos: /home/user/holo-refs/bw-ex-a, bw-ex-b and bw-ace (SOURCES.md in each); the older set in the remaster folder's refs/.
- Pokemon-EX WHERE: foil on the border ring, the art's ground, the rule box and the EX logo; the Pokemon, the attack text box
  and all printed text matte (TCG Live maps, flat scans; high confidence).
- Pokemon-EX in diffuse light: a pale silver sheen, NO colour (Cobalion-EX 93 in hand, Keldeo-EX BCR 49 sleeved, White
  Kyurem-EX BW63 diffuse, Kyogre-EX in-hand video).
- Pokemon-EX under one lamp: ONE blazing grainy pillar, about a tenth of the card wide (a sixth with its glow), saturated and
  bright, the brightest thing on the card; its edges are ragged and streaky, its broad white-hot core mottled, its colour in
  blotches that change mostly down its length (cyan/white at the top of the art, yellow, orange-red at its foot: about 200 deg
  over a third of the card's height) and a little across it, and the whole is broken by sparkle grain (frame 3: nearly all
  glitter). It slides with the tilt and stops at the matte Pokemon (Darkrai-EX 88/113 three tilt frames). At most a short run of broad, much dimmer colour blocks beside it (Lugia-EX BW83's foot, Chandelure-EX 77's right
  border). The ground near the light goes silver-white with glitter (Keldeo-EX in hand). The rest of the frame stays silver (pale blue on Team Plasma frames). Never all four borders at once.
  Many crisp vertical colour lines over the whole foil only show in a flatbed scanner's even light (JP Kyogre/Giratina scans).
- ACE SPEC WHERE: border ring, art ground, name strip (black pill included, its white letters not), ACE SPEC lettering, right
  rule pill, TRAINER letters; item, brushed-grey text box, inner tick frame matte (TCG Live maps).
- ACE SPEC pattern: fine, short, straight HORIZONTAL dashes (1-2 px tall at phone size, 3-25% of the card long, gaps between),
  no etch or emboss. Room light: neutral silver lines on a dark gunmetal border, print colours kept (Master Ball, Crystal Wall,
  G Booster, Victory Piece clips). Sun: each dash its own saturated hue, neighbours disagreeing like confetti (Computer Search
  sunlit zooms). Dark ink over the foil (black name pill, Crystal Wall's black ground, Master Ball's dark swirl) stays dark
  with thin bright lines only. Team Plasma blue borders stay blue.

## Round 4 (2026-10-23): the pillar off the Pokemon's eyes, a warmer pillar
Review of round 3: at the 50:78 thumb pose the four-fold boosted pillar lit the small foil patches TCG Live's maps leave
INSIDE the Pokemon (Victini-EX's iris turned into a green-white disc and lost its pupil; Mew-EX's iris rainbow; Shaymin-EX's
eye opal; Darkrai-EX BW46's smoke by its jaw; Darkrai-EX bw5-63's red claw). The real card breaks the pillar at the Pokemon;
where an eye is foil at all it takes a pale silver sheen (Victini-EX photo), never the pillar.
- EVERY Pokemon-EX face (68) now has its own pillar mask `exp-<id>.webp` (make_ex_pillar_masks.py; the module's PILLAR_MASK
  lists them all), inside the art window only (the border ring, name band, rule box and text box keep the map):
  1. round 3's per-card smoothstep CUTS (Kyogre's body, Mewtwo's arm, Heatran's mouth ...), unchanged;
  2. quiet grounds lifted first: the window's median foil alpha g is scaled toward 0.5 (gain up to 3: Keldeo-EX 0.37 -> x1.3,
     Registeel-EX 0.22 -> x2.3), so a lightly inked ground takes the pillar like Darkrai's half-inked one;
  3. bodies = big matte regions (alpha < 0.06, >= 2500 px of the 367 x 512 map) after opening away matte lines under ~5 px
     (the gaps between speed lines touch the body and would cut the ground into "holes"); foil wholly enclosed by a body and
     under 3000 px goes (irises, collar spots, dust strewn over a body, small ground pockets between coils);
  4. what is left is weighted by the share of foil around it (Gaussian sigma 9 px, 0.25 -> 0.45) and faded over 1-5 px from a
     body, so the pillar breaks just before the silhouette;
  5. hand-drawn BODY polygons where the map inks foil over the Pokemon itself: Darkrai-EX bw5-63/bw11-88 (the glitter cloud
     over the red collar and claw), Darkrai-EX BW46 (smoke by the jaw), Entei-EX (fire over its paw), Registeel-EX (the seven
     red eye dots, inked 1.0), Genesect-EX (the red visor). Checked with `--preview <base>` (scan | lit pillar alpha in magenta,
     68 cards in 8 sheets).
  The lit `.foil` group uses the same mask (three-fold), so those eyes are matte while lit and keep the faint rest sheen.
- ex-pillar.webp redrawn warmer (make_ex_pillar.py, round-4 note in its docstring): the warm run takes ~40% of the hue period,
  green-to-cyan 20%; lightness 52%; a 30 deg per 5% sideways fan (red flank, white core, yellow-green flank, Darkrai frame 1);
  white core ~3.5% wide (was 5.6%); no thin white streaks (with the core they read as parallel stripes). ex-fan's blocks at
  half strength (0.13 / 0.06). `.glare::after` (the sparkle copy) is `brightness(1.35) saturate(1.3)` (was 1.6 / 0.8, which
  turned the flecks white: "pale green and white").

## What the family draws (2026-10-22, round 3)
Everything is one `.foil` group per card, clipped by `--art` and the map, plus the lamp layers. No tile repeats on the card.
- EX pillar position `--bxa-x` = 0.5 + (pointer - 0.5) x 1.3 + a per-card seed offset (+-0.15): a little ahead of the pointer,
  so a strong tilt puts it on the side border (Kyogre's left border, Keldeo's right frame). Hue drift `--bxa-ry` (0.65 of a
  spectrum for a full vertical sweep).
- EX `.foil` (hard-light): a grey a shade over 50% (#8c8c8c lit, #a6a6a6 at rest) through the art, a name-band fade (0.15 over
  the EX logo), `ex-vlines.webp` (vertical line grain, floor baked in) and the map: added to itself THREE times while lit
  (1-(1-a)^3, so the light reaches the heavily inked speed lines of Latias/Giratina) and twice at rest (the rest sheen the audit
  measured right is unchanged). AT REST nothing else: silver line sheen, no hue. LIT: `ex-fan.webp` (make_ex_pillar.py), four
  broad soft blocks 6% of the card wide at +-11.5 and +-18% from the pillar, alpha 0.24 / 0.12, spectral order, each drifting in
  hue down its length; cut into fine vertical lines by the grain, well under the pillar. `::after` (screen): glitter tile, a
  white pool at the pointer and a broad vertical silver band about the pillar (0.72 white at its middle, 0.4 at +-15%, gone by
  +-33%; round 3 raised it from 0.5 for the "silver-white ground near the light" of the Keldeo-EX in-hand photo).
- EX `.glare` is HARD-LIGHT, masked by the art, the name fade and `--bxa-pmask` added to itself FOUR times (1-(1-a)^4:
  half-inked ground ~0.94, speed lines ~0.5, matte 0). `--bxa-pmask` is the map, except on the twelve cards whose map gives the
  Pokemon's own body a partial alpha (Kyogre-EX bw5-26's body 0.27-0.37, Mewtwo-EX bw4-54/bw11-54's arm and the gold energy over
  it, Heatran-EX bw9-13's face and fire-filled mouth, Victini-EX bw11-24/bw8-18's face, Deoxys-EX bw9-53's arm, Regigigas-EX
  bw4-82's chest, Genesect-EX bw10-11, Chandelure-EX bw11-77's globe, Raikou-EX bw5-38's mane, Black Kyurem-EX BW62's beam):
  round 2's four-fold add lifted those to 0.5-0.9 and the pillar ran straight across the Pokemon (review round 2). They get
  `exp-<id>.webp`, the map through a smoothstep(lo, hi) picked per card (make_ex_pillar_masks.py, CUTS; checked as an overlay on
  the scan), set by js/fam/bw-ex-ace.js, which also pre-fetches each per-card mask (ACE and EX) with `crossOrigin = "anonymous"`:
  a mask image is a CORS fetch, and a plain `new Image()` of the same URL left WebKit's mask unusable (the ACE dashes vanished).
  The lit `.foil` group uses `--bxa-pmask` too (three times), the rest state the plain map. Round 3 (review: "a pasted RGB
  ribbon" of parallel hard-edged straight stripes, smooth inside): `.glare`'s own background is the pillar, `ex-pillar.webp`
  (make_ex_pillar.py: 34% of the card wide, two card heights; a column about 13% wide whose middle and width wander down its
  length, ragged streaky edges, alpha mottled 0.55-1, a pale bloom to +-15%; a broad mottled white core about 5% wide and a few
  thin white streaks; hue = one spectrum per 0.6 card height + 15 deg per 5% across + round patches of +-25 and +-12 deg;
  S 100%, L 58%, every channel lifted to >= ~0.3 so a blue patch tints a pale ground instead of darkening it), over a faint
  white pool. `.glare::after` is the same pillar, `brightness(1.6) saturate(0.8)`, through `ex-grain.webp` (make_ex_grain.py,
  floor 0: sparkle flecks about 4 x 6 phone px, fixed to the card while the pillar slides under them), opacity 0.9-1: bright
  flecks in the column. Hard-light keeps the core white and a hue saturated on dark grounds.
  Round 2's pillar (one image through the grain added to itself, floor ~0.8, a 70 deg/5% sideways fan) read as a row of
  parallel, ruler-straight spectrum stripes. A round-3 try with a 0.3-0.5 grain floor under the whole column made it too dim
  to read at phone size; keep the solid mottled base and put the sparkle on top.
  Round 1 had the pillar inside the line-grained hard-light group (and a screened 1.8% core on .glare): it painted at about 0.35
  alpha, a pale see-through column; the reviewer failed it. Isolate it with
  `--css ".tcg .foil{opacity:0!important} .tcg .glare{background-image:none!important}"` to see it alone, and add
  `-webkit-mask-image:none!important;mask-image:none!important` on .glare to see where it stands before the map cuts it.
- ACE `.foil` (hard-light): `ace-dash.webp` (make_ace_dash.py) is both colour and shape: short horizontal dashes (2-3 px rows,
  pitch 3-6 px, 20-160 px long, no floor), each with its own hue (green, cyan, blue, violet, magenta, orange, yellow) in RGB.
  Over it a white veil of 0.3 (lifts each hue's low channels to ~0.37, so a blue dash never darkens the silver into a dark
  speck: dark_specks failed at 78 specks without it) and a grey that takes over the dashes far from the pointer (from 55% of
  the farthest-corner radius; silver far, colour near). No white pool (round 1's bleached the dashes nearest the lamp).
  `hue-rotate(pointer)` turns every dash's colour with the tilt (half a turn per full sweep). Mask: art, the dashes added to
  themselves three times while lit (twice at rest) and
  `--bxa-ace-mask`, a per-card mask = map added to itself x a smoothstep of the scan's luminance (0.10..0.40), drawn by
  make_ace_masks.py and set by js/fam/bw-ex-ace.js (falls back to the map). That keeps dark ink dark under hard-light.
  `mask-mode: luminance` on the scan drew nothing in Chromium or WebKit, so do not try it again. Overlay keeps black too but
  only gives pastels on the pale silver border.
- ACE rest: the dashes in a plain 80% grey, no hue, opacity 0.3. `.glare` is screen: a faint gloss pool and, on `::after`,
  white-cyan glints (opacity 0.8) on `ace-glint.webp` (make_ace_dash.py --seed 4021 --keep 0.3: a third of the dashes of another
  draw, so the glints fall on their own lines and most coloured dashes keep their hue) in a pool reaching about a third of the
  card (map only, no luminance gate), so thin bright lines cross black ink and streak the art ground as on the sunlit card.
- Removed: `ace-tinsel.webp` (long soft streaks with a 0.2 floor) and the two ACE colour ramps (bands a sixth of the card tall
  that painted whole borders cyan or violet and repainted the art); the ACE `::before`/`::after`.

## Promo EX (12 faces) and the review-1 fix (2026-10-02)
Nine promo EX (bw4-bwp036/037/038, bw6-bwp045/046/047, bw8-bwp061/062/063) carry their own TCG Live map in their data record
(`foilMap`, which foil-maps.js uses before bwMap()). The three of bw10 (BWP081 Thundurus-EX, BWP082 Deoxys-EX, BWP083 Lugia-EX) had none
and drew on the generic median map `bw-ex-safe.webp`, which counts most of their art as Pokemon: timid. TCG Live does carry them
(`cards/png/en/bwbsp/bwbsp_en_081..083_std.foil.png`, fetched with curl; urllib gets a 403): scripts/fam/bw-ex-ace/make_promo_maps.py
converts them as fetch_foil_maps.py does into `assets/foil/fam/bw-ex-ace/map-bwp081..083.webp`, and `famExtras()` sets `--foil-map` to
them. Do NOT point a promo at a regular print's map unless the art is the same: SIFT + RANSAC over the art window gave 800 to 1100
inliers for BW36/37/38 against the Next Destinies prints (a true match) and 7 to 13 for every other promo against all 56 regular EX
(BW83 Lugia-EX is not Plasma Storm 108/135's art, BW82 Deoxys-EX is the red form, BW81 Thundurus-EX shows Thundurus and Tornadus).
`.glare` is halved (0.4 of the card opacity, both recipes): the soft-light pool lifted the matte text box 7 to 9 luma levels.

## How to judge it
Phone size (220 CSS px x3), poses rest, 30:25, 75:65, 50:78, WebKit first, beside the photos (Darkrai-EX 88/113 three frames for the
EX lit look, Cobalion-EX 93 / Keldeo-EX BCR 49 for EX rest, Computer Search sunlit and Master Ball / Crystal Wall room-light zooms for
the ACE). EX: rest is a colourless silver line sheen; lit is one blazing pillar (ragged and mottled, a broad white core, colour in
blotches drifting down it, sparkle flecks; never parallel straight stripes) with dim broad blocks beside it and silver everywhere else, never colour on all four borders; where the pillar falls on the
Pokemon it is cut away, as on the real card. ACE: short dashes, confetti colour near the pointer, silver far from it and at rest; black ink stays black (Crystal
Wall's ground, the name pill); the Plasma border stays blue. Text box and Pokemon matte. No tile, grid or repeat; `dark_specks.py`.

## What remains
- No macro photo of either grain exists; the line pitch is a judgement from phone frames.
- Where the art is nearly all Pokemon (Latias-EX bw9-85, Giratina-EX bw6-92, Darkrai-EX BW46 at 30:25) the pillar lands on the
  matte Pokemon and only its ends show on the border; TCG Live's maps mark those speed-line grounds 0.0-0.2. A per-card mask
  (make_ex_pillar_masks.py with a low cut such as (0.03, 0.2)) would open them if it reads too quiet; not done (no photo of
  those cards lit).
- The per-card cuts only cover the bodies spotted on overlays of all 68 maps (2026-10-22). A map that gives some other
  Pokemon's body partial alpha would still take the pillar; add it to CUTS and PILLAR_MASK.
- Darkrai-EX bw5-63/bw11-88's collar and claw are cut out by hand (round 4); a map that inks some other Pokemon part at
  ground strength needs a BODY polygon too (make_ex_pillar_masks.py), checked on the --preview sheets.
- Where the Pokemon fills the art (Rayquaza-EX bw6-85, Heatran-EX, Deoxys-EX bw9-53, Chandelure-EX) little or no pillar shows:
  the ground is small pockets enclosed by the body, which the mask drops with the eyes. That is the real card's rule (the
  pillar breaks at the Pokemon); no photo of those cards lit.
- The ACE border is the scan's light silver; the real one reads dark gunmetal in room light. Darkening it needs a layer that can
  reach between the dashes (the .foil group cannot), left for now.
- No Dowsing Machine, Rock Guard or Life Dew tilt photo besides the clips (ACE is one stock; the maps agree).
