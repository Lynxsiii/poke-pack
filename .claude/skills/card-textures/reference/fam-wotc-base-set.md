<!-- Family note for the holo family wotc-base-set (older-era holo remaster, 2026-10-01/02). Research, photos and sheets: /mnt/project-files/holo-remaster/wotc-base-set/ -->
# wotc-base-set working notes (Base Set base1 Rare Holo 1-16 + base4-cdrom8)

Family agent notes, kept so a restart never costs the research again. Brief: /mnt/project-files/holo-remaster/BRIEF.md.

## What the real card does (sources in refs/SOURCES.md)

- **Foil = the art window's BACKGROUND only.** 1999 Starlight holofoil: a mirror foil embossed with short horizontal
  streaks and thin four-point stars ("Starlight Holofoil pattern, a holofoil pattern with stars": Collexy deep dive 1 and
  holofoil overview; Bulbapedia Holofoil "starbursts, different sizes, slightly blurry"). Background ink is printed
  straight on the foil. The Pokémon is printed over an opaque white underlay -> matte. Frame, name, attacks, text,
  evolution badge, 1st Edition stamp (ink) are flat.
- **The pattern is not registered to the art**: our scan of Machamp has a big star at the right elbow, the Collexy
  shadowed copy has it lower on the arm (machamp_elbow comparison) -> the stars/streaks in each scan are that copy's foil.
- **Halo**: on most cards the white underlay runs ~6 px (card px at 600 wide) past the Pokémon's outline, printed in a
  "glow" colour: Mewtwo maroon (scan (74,48,63) vs navy bg (23,31,76); maroon also in the lit photos
  yt mewtwo hNhxmSl2EEg / OWntKYuVkw4 -> matte), Alakazam pink-lavender (lit photo e4/alakazam_mewthree.jpg: pink matte
  band), Charizard lilac-blue band, Zapdos olive, Ninetales light blue, Raichu olive-yellow. Measured: a colour step at
  6-7 px from the segmented outline on 1,2,4,10,11,12,13,14,15,16; none visible on 3 Chansey, 5 Clefairy, 6 Gyarados,
  7 Hitmonchan, 8 Machamp (thin white line only on the Collexy shadowed copy), 9 Magneton. Partial on Blastoise (none at
  the left hip, where a foil star sits on the outline: cut out).
- **Look under a lamp** (Alakazam photo; Charizard 360rapine clip hQqWTIfkNYM frames; Blastoise clips VaYWvuU7sRA,
  jD6nt2C3koE, skiZ5vwo6fk; Raichu PSEYosyrgog; Zapdos QEiUwxrGAg4; Venusaur galalyth photo): the background lights up
  as a whole in its own ink colour (Charizard gold-orange, Blastoise yellow-green -> lilac, Raichu green-yellow, Mewtwo
  violet-blue with gold and blue sparkle), a rainbow tint drifts with the angle, fine multicolour sparkle over all of it,
  big stars flare white; strongest at grazing angles. Off the lamp: dark metallic version of the print (= the scan).
- **CD-ROM Machamp** (base4-cdrom8): the real card is the SHADOWED 1st Edition print with a COSMOS holofoil and
  (c) 1999 (Collexy deep dive 1, Machamp Variant 3; refs j1 cx_cd_rom_cosmos_machamp_grrxhf.jpg). Our data deals it with
  the base1/8 scan (shadowless starlight) -> the foil follows the scan (starlight); data issue for the lead.
- Chansey holo-shift error (e4/chansey_holoshift_*.jpg, EF topic 27859): the white underlay layer misregistered -> top
  strip of the window cream, top of Chansey's head printed straight on foil: confirms "white underlay = matte, no
  underlay = foil".

## Decisions

- Masks drawn per card from the scan: measured window (2-3 px wider than the shared wotc-win mask), GrabCut Pokémon,
  hand hints (make_base1_masks_hints.json: Gyarados whiskers/top fin, Raichu ink tail + paw + ear curl, Machamp
  fingers/leg gap/elbow star/toe, Clefairy left ear, Blastoise hip star), halo 6 px where the scan shows it, evolution
  badge voted over the 11 evolved cards. Foil share of window 0.27 (Venusaur) to 0.79 (Hitmonchan).
- Sparkle = the scan's own starlight (band-pass of the inpainted scan), two halves that wink in turn.
- Recipe: `.foil` colour-dodge group masked to `--wbs-bg` (pointer pool x wide rainbow sliding x3, brightness rises with
  --pointer-from-center, ends contrast(0.8)); rest = soft diagonal sheen (opacity 0.85 x strength); `::before/::after`
  spark halves screened in pale rainbow, each through a band sliding a different way; `.glare` white pool screened, same
  mask; `.glare::after` off. All layers on the bg mask, so Pokémon/text stay flat.

## Built (files)

- js/fam/wotc-base-set.js: claims unchanged; `wbs-mapped` + `--wbs-bg`, `--wbs-spark-a`, `--wbs-spark-b`
  (base4-cdrom8 -> base1/8 maps).
- css/holo/fam/wotc-base-set.css: v0 recipe written 2026-10-01 23:05, first render r1_after.png (scratch) not yet judged.
- assets/foil/fam/wotc-base-set/<n>-bg-v1.webp (16), <n>-spark-a-v1.webp, <n>-spark-b-v1.webp (32); 400 KB.
- scripts/fam/wotc-base-set/: make_base1_masks.py (+ _hints.json), make_base1_sparkle.py.

## Left

1. Judge/tune the recipe (scale 2, 4 cards: 4, 2, 10, 3), then the 16 + cdrom8; measure foil-minus-bare per zone.
2. Gates: before-after sheets (Chromium + WebKit, >= 6 cards, rest/30:25/75:65/50:78 beside photos), phone-compare,
   foil_coverage.mjs base1 base4, sweep_finishes.py --set base1 / base4, foil_probe --idle on 2 cards, settings, census.
3. refs/SOURCES.md, reference/fam-wotc-base-set.md, LESSONS.md, REPORT.md, SubagentHandback.
4. Shared changes: base4-cdrom8 scan is the wrong print (real = shadowed cosmos); index.html ?v= bump for the sheet.
