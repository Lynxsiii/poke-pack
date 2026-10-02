# Family dp-reverse: the Diamond & Pearl generation Mirror reverse holo

Files: `js/fam/dp-reverse.js`, `css/holo/fam/dp-reverse.css`, `assets/foil/fam/dp-reverse/<frame>-<layout>.webp`
(10 masks), `scripts/fam/dp-reverse/make_masks.py`. Research and photos: `/mnt/project-files/holo-remaster/dp-reverse/`
(refs/SOURCES.md: CE101 slab photos, Collexy flat scans, Pokemon Holo tilt clips; 3 independent sources).
Built in the 2026-10-02 burst (25 minutes); what is claimed and what is not is below.

## What the real card does (Mirror reverse: dp1-dp7, pl1-pl4, hgss1-hgss4, col1)

- Foil: everything inside the yellow border EXCEPT the picture (art window, the evolution circle's little picture
  on Stage cards, a Special Energy's big picture, a Trainer's window). Name bar, attacks, text box, weakness row, HP
  all take it. Black text stays black (ink over foil).
- Matte: the picture(s) and the yellow border. A reverse holo's art window is matte (no cosmos).
- Pattern: a smooth mirror with no pattern of its own, throwing VERTICAL rainbow bands of unequal widths
  (4-12% of the card width), strongest on the light areas, tinted by the ink under them (green frame: green/yellow
  bands; purple: magenta/blue). The Trainer's white text box is a bright silver mirror with fine rainbow lines.
- Motion: one broad bright white-cyan column (rainbow fringes) where the lamp reflects, sliding sideways as the card
  turns; off the lamp the foil goes back to the ink colour with a dull metallic cast.

## What is built

- Mask (`--dpr-mask`, set per card by `famExtras`): `<dp|hgss>-<basic|stage|trainer|senergy|sp>.webp`, 600x838, white
  where the card is foil, transparent over the picture and the border. Drawn from the SITE'S OWN scans by
  `make_masks.py` (mean + per-pixel spread of every dealt card of a frame x layout; pictures are the high-spread
  regions, flood-filled to the shared window frame line). The earlier `assets/foil/dp-win` masks were drawn from
  another scan source and missed by 3-8 px. The matte holes are grown a little and feathered 1.6 px because the DP
  scans register to about +-3 px.
- `.foil` (multiply): saturated vertical rainbow, repeat-x 300% wide, slides with `--background-x`; a white veil fades
  it to the ink away from the lamp column (`--pointer-x`). Tints light areas, never lifts black text.
- `.glare` (OVERLAY, not screen): lamp column (white core, cyan/magenta fringes) over a 50% grey veil (identity under
  overlay, fades the rainbow away from the lamp) over a vivid rainbow. Overlay keeps black text black and gives the
  frame's mid-tones the bands. A first try with screen washed all the text grey (the "grey under the thumb" failure).
- No colour-dodge anywhere (no WebKit pixel blocks, no `contrast(0.8)` needed), no grain, no repeating tile
  smaller than 1/9 of the card width.
- Reset: `clip-path`, `border-radius`, `.foil::before/::after`, `.glare::after` (the era recipe set clip-path and
  the dp-win mask on them).

## Claimed / not claimed

Claimed: every DP-generation reverse face except a basic Energy (`claims()`: `card.reverse && isDp && layout !== energy`).
NOT claimed (left on the era look in `dp.css`): Call of Legends basic Energy 88-95 (the Crosshatch, `dp-rev-cross`;
research in refs/SOURCES.md, not rebuilt) and any other basic Energy reverse.

## How to judge it

`foil_probe.mjs --query "set=dp1&cards=r24,r55&proof=off&w=220&poses=rest,30:25,75:65,50:78"` (`&fam=off` is the
before). Check: window and border match the base scan exactly (no rainbow over the picture or the yellow), black text
stays black in the lamp column, the rest pose still reads as foil, no grey at 50:78.

## Open

- The bands are fuller and more saturated than the real card at a grazing angle (chosen: "grab attention on a phone");
  `min(1.3, foil-strength)` scales both layers.
- Crosshatch (col1 Energy) and the Special Energy mask (7 cards) are not verified against photos.
- The Pokemon SP frame (Platinum G, GL, E4, FB, C, M, 4) has its own mask (`dp-sp`): checked on overlays by the
  earlier agent, not re-rendered in this burst.
