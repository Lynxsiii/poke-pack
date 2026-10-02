# Family note: bw-reverse (Black & White reverse holos)

Status (2026-10-02, fourth run): 1,072 prints claimed (bw1 104, bw2 96, bw3 96, bw4 87, bw5 96, bw6 99, bw7 130, bw8 119, bw9 100, bw10 74,
bw11 71). Files: `js/fam/bw-reverse.js`, `css/holo/fam/bw-reverse.css`, `assets/foil/fam/bw-reverse/<set>/<number>.webp` (1,072 masks, about 4.3 MB) and
`mirror-mottle.webp`, six type tiles `pattern-<kind>.webp` (~260 KB), `scripts/fam/bw-reverse/make_masks.py`, `make_masks_bw6.py` (+ `bw6_matches.json`), `make_mirror_mottle.py`, `make_patterns.py`. Review #1
(/mnt/project-files/holo-remaster/bw-reverse/REVIEW-1.md) failed the first pass (imperceptible lift, bw1's plain mirror read as no holo); review #2
(REVIEW-2.md) found three blockers, all fixed in run 3: (1) ink took the foil colour, (2) dark bodies were darker than the era look under the thumb,
(3) bw10-3 Lileep had foil on its art window. Review #3 (REVIEW-3.md) verified those and found one more, fixed in run 4: a dull olive disc above the attack-cost symbol
of single-attack prints (see "Type tiles" below).

## What the real card does
- bw1 reverse = the plain "mirror": the body (text box and frame, not the art window) is a soft mottle of wide pale vertical bands with cool
  and warm tints over the type colour (Collexy scans of Blitzle 40, Lillipup 81, Emboar 20: /mnt/project-files/every-era/bw/texture-refs/g1/).
  Blitzle: yellow body with teal and blue clouds and bright vertical bands; Emboar: red body with pale blotches and darker mottling.
- Emerging Powers on: the shaded Energy-symbol pattern of the type (Poke Balls on Trainers) over the body; Plasma sets (bw8-bw10): the Team
  Plasma shield in the text area; Special Energy: picture box matte, text box foil.
- The ink is printed over the foil and stays black; the art window is matte.
- Sources: Collexy photos (3 bw1, 1 bw5), TCG Live foil maps (the mask: `cdn.malie.io/.../<set>_en_<NNN>_ph.foil.png`). Confidence: shape high,
  colour behaviour medium (no tilt video of a bw1 reverse was found; the colours are judged from the scans).

## What was built
1. Per-print mask (`make_masks.py`): `clip(R*A/255 / 24, 0, 1)` of TCG Live's map, then (a) a stray alpha under 0.25 is zero (bw10-3's art window carried
   0.2: blocker 3), (b) holes under 12 px^2 are filled (specks only), (c) the foil is eroded by a 2 px disc (the anti-aliased rim of a symbol or the
   window frame is mid grey and the overlay drew a dark or orange ring around every symbol), (d) the INK is cut out of the foil from the print's own
   scan: TCG Live leaves the body text (attacks, rules, Trainer and Energy text) UNDER the foil in its map, like the real card whose ink is opaque, and an
   overlay on a dark or grey letter gives 2 x ink x sheen, a green or yellow letter (review #2, Float Stone, DCE). In the text zone (rows 266-476 of 512)
   a pixel is ink when it is darker than 110 (of 255) and differs from the local body colour (11 px median) by more than 40 in RGB distance; dilated 1 px,
   alpha 0. Near-black bodies (zone median under 75: Darkness, white text) get none: white stays white under an overlay and the gaps between its
   letters are not ink (the first try, any contrast over 40, cut half of Weavile's text zone and the Team Plasma shield outline). What stays a hole:
   the art window, the attack-cost circles, the weakness/resistance/retreat icons, the evolution notch, the names TCG Live cuts out.
   `js/fam/bw-reverse.js` sets it as `--bw-layout`; the era rule (`css/holo/bw.css`, `.bw-rev .foil` and `.glare`) already intersects `--art` with it.
   Special Energy had no `--bw-layout` in the era (an undefined variable voids the mask list); it now has one.
2. Sheen, `css/holo/fam/bw-reverse.css`: `.foil` = tile x saturated 100deg spectrum band x pointer pool, **mix-blend-mode: overlay** (not the era's
   colour-dodge), `filter: brightness(2.35) contrast(1) saturate(1.8)`, opacity rest 0.7 / lit 0.8 + 0.2 x pointer, both x foil-strength.
   Why overlay: colour-dodge on a light body saturates to white (no visible change) and lifts dark ink to red or cyan (the text bled); overlay
   keeps a dark ink dark (at most x2) while a light body takes the tints and the flash. Tile = the type's pattern (bw2+) or, for bw1, the
   mottled-mirror map `mirror-mottle.webp` (card-sized, drawn once, no tiling; soft vertical clouds + wide pale bands, `make_mirror_mottle.py`).
   Dark bodies (Darkness 0.12-0.15, Dragon 0.40: the module adds `bwr-dark`) use `brightness(3.2)`: overlay doubles a dark body at most (2 x body x
   sheen), so with 2.35 the lit text box was 19 to 21 levels BELOW the era look (Weavile); 3.2 saturates the sheen and lifts the body instead.
   bw1 also gets a lit-only white pool in `.foil::after` (screen) so the overlay flashes under the pointer. The glare keeps the era's mask and
   blend but its dark end is 0.08 instead of 0.3 (a tilted reverse never reads darker than before).
3. Type tiles (`make_patterns.py`, run 4): the era's tiles `assets/foil/bw-reverse/<kind>.webp` were cut from ONE TCG Live map per type, and that print's attack-cost
   symbols are black discs in them (18 px across, x 37 / 57 of the 367x512 tile: grass and fighting y 313, psychic and colorless y 334, dragon y 293, plasma y 293 and 363,
   fighting's second row y 365). Under the overlay a black tile pixel stays black, so a print with no cost symbol, ability box or dark ink on that spot (one attack, no ability,
   short text) showed a dull olive disc on the mint body (review #3: bw6-1, bw6-4, bw6-13, bw8-2, bw8-4, bw11-4, bw9-1); the era's colour-dodge hid it. The fix is in the tile, not the
   mask: `pattern-<kind>.webp` is the era's tile with the discs inpainted (cv2 Telea, lossless; only the disc areas change), and `js/fam/bw-reverse.js` sets `--rev-pattern` to it for
   colorless, dragon, fighting, grass, plasma and psychic (kind read from the era's `bw-rev-<kind>` class in `base.classes`; `--rev-pattern` also feeds the lit `.foil::after`
   screen layer). A matte hole in the mask would have shown the raw scan (olive) against the foil body: the same dot. Exposed prints (mask alpha >= 0.9 over a disc): 106 of the 530
   in the six kinds, listed in /mnt/project-files/holo-remaster/bw-reverse/DISC-LIST.md. Check a new set: render its single-attack prints at rest and look above the cost symbol.
4. Rainbow speed (Noah 2026-10-02): the band is 260% of the card, 100deg, two spectra per 100% of the 3.19-card gradient line (period 1.6 cards);
   the pointer shifts it 1.6 cards across a full horizontal sweep = 0.99 spectrum (1.2 corner to corner). Limit 1.5.
   `rainbow_speed.py` does not parse `--pointer-from-left` layers, so this was computed by hand.

## Judge it
`foil_probe.mjs --query "set=bw1&cards=r7,r3&proof=off&w=220&poses=rest,30:25,75:65,50:78" --width 1000 --scale 3` (reverse = `cards=r<n>`; add
`&fam=off` for the before). Look for: colour bands in the text box at rest and tilted, the art window and name bar matte, the ink black and untinted.
Text-box mean luminance is a poor metric on pale bodies (hue bands cost luminance, and the era's colour-dodge lifts and washes the ink, which the
before counts as light): use it for DARK bodies, and the darkest-ink RGB / ink chroma for pale ones. Run 3, 220 px x3, Chromium (WebKit within 2 levels), text-box
window, after - before at rest / 30:25 / 75:65 / 50:78: dark bodies Weavile bw9-66 +19.2 / +22.3 / +11.2 / +10.6 (was -19 / -21 at 75:65 / 50:78 in
review #2), Umbreon bw9-64 +17.6 / +20.0 / +8.7 / +7.1, Hydreigon bw9-78 +17.0 / +18.5 / +7.1 / +6.2, Houndoom bw6-75 +9.8 / +15.5 / +14.0 / +12.7,
Dragon Gible bw6-86 +24.9 / +33.8 / +23.0 / +19.2, Druddigon bw8-94 +23.1 / +21.4 / +6.8 / +3.9. Pale bodies (vivid pastel, ink black):
DCE +1.5 / -3.4 / -8.5 / -9.9, Torterra +3.8 / -1.6 / -11.0 / -12.7, Float Stone +3.2 / -0.1 / -1.2 / -2.0, Plasma Energy +5.1 / +3.3 / -1.8 / -3.0, bw1
Pansage +2.6 / -1.0 / +6.7 / +9.8. Darkest ink (mean of the darkest 0.5%, 50:78), before -> after: DCE (20,9,9) -> (16,7,6), Float Stone (70,59,54) -> (43,36,32)
(the era's glare hazes the thin text; chroma 16 -> 10), Plasma Energy (1,0,39) -> (0,0,33), Braviary (29,24,20) -> (19,15,13); ink chroma never above the
before. Lileep art window after - before 1.8-3.5 levels, as Tirtouga (2.6-4.6). Look at the sheets in /mnt/project-files/holo-remaster/bw-reverse/sheets/ (`r3-*`).
Gates run: foil_coverage bw1-bw11 prints nothing; rainbow_speed prints nothing; dark_specks (reverse faces, max per card and pose, budget 40): bw1 0, bw11 DCE 14, bw8 Torterra 9, bw6 Braviary 21, bw9 Weavile 8; foil_probe --idle clean (bw9-66 + bw9-99, bw6-86 + bw6-1).

## bw6 Dragons Exalted (matched by image)
TCG Live's DRX files for bw6-1 to 49 are duplicated/misnumbered (44 of them are other cards' maps). `make_masks_bw6.py` + `bw6_matches.json` write each
bw6 mask from either the print's own file (65: precision of holes-on-printed-pixels >= 0.93 against its own scan) or a DONOR print of the same layout
(34: same attack-cost rows and ability, donor fit >= 0.94, or >= 0.92 with a margin >= 0.10 over the runner-up; e.g. bw6-1 Hoppip uses bw7-90's map,
bw6-45 Emolga uses bw11-49's). Checked by overlaying the mask holes on the scans (art window, cost symbols, weakness/resistance/retreat symbols
all holed). Left on the era look (13, not sure): bw6-2 3 5 6 10 18 19 21 33 34 47 48 49. A donor's text holes can differ from the card's own text
by a line (Hoppip's second attack text), so for donor prints every hole under 100 px^2 is filled (no ghost text) and the ink comes from the print's own
scan, as above (own-file and donor prints alike).

## What remains
- bw6: the 13 prints above.
- Pale bodies lose 5 to 13 levels of text-box mean luminance at 75:65 / 50:78 (vivid pastel bands on white or cream, ink now black): DCE, Torterra, Lileep,
  Tirtouga about -10. Review #2 accepted the same band as non-blocking; a pale print is not made lighter than the era's haze without washing out the colour.
- The ink cut is a scan heuristic (dark pixels, rows 266-476): a print whose body text is light on a mid-tone body (Dragon prints use dark text, fine) would need
  its own rule; check any new set with the contact sheet (magenta = cut ink).
- The metal pattern (diagonal hatch) is TCG Live's real one but reads as fine lines at 30:25 on Escavalier-type prints; not changed here.
- No tilt-video reference for the bw2+ colour behaviour; bw1 colours are matched to scans only.
