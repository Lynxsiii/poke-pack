# Family bw-radiant-collection: Legendary Treasures' Radiant Collection (bw11 RC1-RC25)

Part of the older-era holo remaster (2026-10-01/02). Files: `js/fam/bw-radiant-collection.js`,
`css/holo/fam/bw-radiant-collection.css`, `assets/foil/fam/bw-radiant-collection/` (rc-chips.webp, rc-stars.webp, map-rc<n>.webp),
`scripts/fam/bw-radiant-collection/` (make_rc_textures.py, make_rc_maps.py). Research, photos and sheets:
`/mnt/project-files/holo-remaster/bw-radiant-collection/` (refs/SOURCES.md lists every photo).

## What the real cards do

- **Confetti holofoil** (Collexy's BW overview, section 9: "looks like confetti or pixels"; only Legendary Treasures' RC and the
  McDonald's 2011/2012 sets). Uncommons RC3, 4, 6, 7, 10, 12, 13, 14, 19, the regular-art Meloetta-EX RC11 and the full arts RC21-RC25.
  A field of small round foil chips (1.5-1.8% of the card wide, nearest neighbour 2.4%) on the **ground** of the art window and over
  the text box; the **Pokemon is matte ink** (Serebii's scan of Mew-EX RC24: glittering blue ground, smooth pink Mew; the
  Bleeding Cool photo of Pikachu RC7: chips on the magenta ground and the yellow text box, none on Pikachu). Every chip flashes
  one saturated colour (orange, lime, pink, yellow, cyan) and only some are lit at a time. The frame and name bar are matte; on the
  full arts the chips run edge to edge (the black border carries them too, Collexy's RC21 scan).
- **Star holo** (commons RC1, 2, 5, 8, 9, 15-18 and the Trainer RC20): faint five-point stars (3% of the card wide, spacing 4.5%) over
  the window, the text box and the border, each flashing gold, cyan or white on its own. No chips. They use the chips' crush
  (`--rcf-crush`, contrast 9, lit window 0.2): contrast 13 left the stars timid at rest (review 1, 2026-10-02).
- The printed shapes in the body (Pikachu faces and sparkles, Eevee's hearts, Piplup's bubbles) are in the scan already.

## What it draws

One glitter layer, `.foil`, with a second pass in `.cure` while the card is held, and a soft-light sheen on `.glare`:

- **Lit chips by difference.** The texture is a field of flakes, each a flat grey g (its facet) over its own anti-aliased coverage,
  clear elsewhere. It is blended `difference` over a hue ramp L (every channel in 0.3-0.9) that slides with the pointer, then
  `invert(1) brightness(b) contrast(c)` with b = 0.5 + 0.5/c: out = 1 where |g - L| = 0 and 0 from |g - L| = 2/(c+1). A flake lights in the
  channel where its facet matches the ramp, so each flake flashes ONE saturated colour, the colour changes from flake to flake, and the lit
  ones change as the card tips. The ground between the flakes shows L itself, which the crush sends to black (that is why L stays
  above 0.3). The result rides `screen`: black adds nothing, so the Pokemon, the text and the frame keep their ink and nothing darkens.
- **The zone** is a drawn map per Confetti card (`map-rc<n>.webp`, 400 x 559, alpha): the era's zone map (window full, text box 0.8; the whole
  face for RC11 and the full arts) times (1 - the Pokemon's silhouette). The silhouette is read from the real cards (make_rc_maps.py:
  TCGplayer and Serebii scans registered onto the site's scans give a local-texture map, a colour guided filter follows the printed edges,
  grabCut finishes it); RC14 (a pale window, no evidence) and RC19 (grey Cinccino on a pale ground) start from a hand rectangle. grabCut
  misses a Pokemon's dark ink (Emolga's black ears and tail, Stunfisk's shell and spikes, Meloetta's navy hair loops and skirt), so for
  RC11, 12, 23 and 25 `INK` in make_rc_maps.py adds every dark pixel (lum below 90, 110, 135 and 90) that touches the silhouette, closed 5 px,
  small lighter patches inside it filled, pieces under 20% of the card (60% for RC12's window) and outside the card's own border margin only:
  a dark GROUND (RC13, RC6, RC22, RC24) is not connected to a Pokemon, so it keeps its chips. The dark text lines that touch it go too (matte
  ink, as on the real card). The commons use the era's `bw-rc-v1.webp`.
- `.glare`: a white pool under the pointer and a pastel rainbow sliding with the tilt, `soft-light` (black ink stays black), cut to the same zone.
- `.foil::before/::after` are off: `.foil`'s own filter (the crush) would crush them with the rest.

## How to judge it

Phone size (220 x 3), rest, 30:25, 75:65, 50:78, beside `refs/rc7-pikachu-youtube-frame.png`, `rc24-mew-ex-serebii-zoom.png`. Look for: chips
on the ground and the text box, none on the Pokemon; chips of single saturated colours that change with the pose; no visible tile or grid
(the texture is 150% of the card, offset per card by --seed-x/-y); the text stays black. `foil_probe.mjs --styles` should name this sheet
on `.foil`, `.cure` and `.glare`.

## Pitfalls met

- The era's `bw-rc` rules in bw.css and bw-fullart.css are still in the cascade: this sheet beats them with five `.era-bw` and four family
  classes (and the `:not(.lit):not(.settling)` for the rest opacity). The old tile (`bw-confetti.webp`, 45% of the card, flat colours) read as
  a faint texture and its screen copy never drew once a later sheet overrode it.
- A `filter` on `.foil` applies to its pseudo layers too: a layer meant to ride on top of the crush has to be `.cure` or `.glare`.
- The pale cards (Eevee, silver body) hide `screen` light; their chips show on the window and as pastel flecks on the body.

## Not as good as the real card

- The body's printed foil motifs (Eevee's dotted hearts, Pikachu's faces and sparkles, Piplup's bubbles) show as silver shapes on the real
  cards and are not in the site's scans: not drawn. The registered difference maps (refs/loc/rc<n>.png) hold their outlines, so a per-card
  motif mask is the next step.
- The chips do not change size with the angle and there is no parallax between the chip layer and the print.
- The commons' stars are rainbow-coloured; the photos show them mostly gold, cyan or white, and faint. A phone at rest shows a few glints.
- Review 1 (2026-10-02) found the silhouette missing dark and grey Pokemon parts on RC23, RC12, RC25, RC11 and RC19; fixed by the `INK` cut and
  the RC19 rectangle seed above (sheets/fix-1.jpg, sheets/fix-1-other-cards.jpg). A threshold that is too low leaves highlights on a dark
  ear (RC23 needed 135, not 70: its ear highlights are lum 105-117, the pink ground 183 and up, its silver border 146 and up).
- The other silhouettes were not checked card by card against photos (grabCut can eat a little ground or leave a fringe).
