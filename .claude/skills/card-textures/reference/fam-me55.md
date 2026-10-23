# Family me55: 30th Celebration Commons, Pikachu Rares, Classic Collection and RGB Mews (135 faces claimed)

Files: `js/fam/me55.js` (claims the me55 faces below; one class `m55-<finish>` per face; per-face `--foil-map` for Commons,
Pikachu Rares and the Classic Collection, `--m55-border` for the Classic Collection), `css/holo/fam/me55.css` (every rule
scoped to `.fam-me55` plus a finish class; overrides `css/holo/celebration.css`, which is not edited),
`assets/foil/fam/me55/` (tiles `*-v1.webp`, `maps/<n>-v1.webp`, `cc/<n>-v1.webp` and `cc/<n>-border-v1.webp`),
`scripts/fam/me55/` (seeded, re-runnable): `make_me55_maps.py` (the tiles and the stretched Commons / Pikachu Rare maps),
`make_classic_maps.py` + `classic_hints.json` (the Classic Collection maps, drawn from the scans). Era notes:
`reference/30th-celebration.md`. Photos: `/home/user/holo-refs/w2-me55-main/` and `/home/user/holo-refs/w2-me55-special/`
(one SOURCES.md each; most are Elite Fourum post #280 by koala, livestream stills and graded scans of every card).

## Which faces (`finishOf()` in the module)
| class | faces | what the real card has |
|---|---|---|
| m55-common | 68 | me55 Commons (Pokemon and the four Trainer items) whose TCG Live map is in `assets/foil/maps/me55/`: silver border + window background foil, rainbow |
| m55-pika | 30 | the 30 Pikachu Rares (`/30` numbered): cracked-ice border, foil head stamp in the text box, StitchedRings cast-and-cure over the whole face |
| m55-classic | 30 | Classic Collection reprints `cc*`: gold glitter border with stars, confetti glitter in the art background, subject and text matte |
| m55-rgb | 3 | RGB Mew B, G, R: deep metallic ink, fine silver radial lines, etched |
| m55-future | 4 | Futuristic Rares (157 Mewtwo ex, 158 Mew ex and the two Pikachu ex promos): no rule here, `celebration.css` draws them as before |

Not claimed: reverse holos (`card.reverse`), the 116 blister promo (`card.promo`; it shares Eevee's map path), and
any face whose id is not `me55-`. Census (2026-10-22): 135 claimed, none missing, none extra.

## What the real foil does (2026-10-22 audits w2-me55-main and w2-me55-special)
- Commons: the silver border is full-strength foil and shows a saturated, broad rainbow in hand (HSV saturation 0.43-0.56
  measured on the border), the hue running round the card, still coloured in soft light; fine 1-2 px sandy speckle. The window
  background is foil in grades that follow the painting (the TCG Live map); lit it shows ONE broad rainbow sweep (Articuno
  magenta/pink/orange/violet, Exeggutor green-yellow-orange); light art is tinted, never bleached; dark art (Chandelure) stays
  dark with a teal sheen and sparkle. Pokemon, 30 stamp and text matte. Sources: `w2-me55-main/me55-1`, `me55-18`, `me55-75`,
  `me55-2`, `common/me55-122-zorua-*`, `maps/tcgl-foil-maps-alpha-*`.
- Pikachu Rare: the head stamp in the text box is foil; off-angle it reads DARK OLIVE/OCHRE against the yellow box; lit it is a
  dense gold / green-yellow / orange faceted glitter (flakes 0.5-1 % of the card). The border is a high-contrast cracked-ice
  mosaic, mid/dark grey off-angle, silver-white / light blue / pink when lit. The StitchedRings bursts (rings of short radial
  dashes, 20-35 % of the card) cover the WHOLE face when lit, gold/orange and white on foil, glossy yellow on ink; invisible in
  diffuse light. Sources: `w2-me55-main/me55-25/*`, `me55-39/*`, `pikachu-rare/*`.
- Classic Collection: the foil is the gold border plus the art background behind the subject; the Pokemon/trainer and its
  foreground (Charizard's flame, Delcatty's flowers) are matte; on old-style frames the name bar, species strip and text box are
  matte; on full-art reprints the background runs behind the attack text. Border: dark olive/bronze ground, dense coarse warm
  flecks (gold, orange, red, yellow, some green, 0.5-1 % of the card) and puffy flat-colour stars 3-3.5 % wide; never lemon.
  Art background: round confetti dots on a fine square-grid emboss, colour in broad horizontal bands (pink, orange, yellow,
  green) on light art, silver-white on dark art (Gengar, Buzzwole, Lugia's sky). The 30 stamp is flat ink. TCG Live has NO
  Classic Collection maps (me5-5c export is an empty list, checked 2026-10-22). Sources: `w2-me55-special/cc4/*`, `cc149/*`,
  `cc94/*`, `_shared/cc-jp-n-153-art-macro-confetti-dots-stars-relief.jpg`, `_shared/official-jp-render-m6a-137-*`.
- RGB Mew: deep saturated metallic ink (emerald, royal blue, red) that keeps its colour under tilt; a fine silver radial line
  texture with prismatic glints behind Mew; Mew flat metallic with a posterised dither; a soft local rainbow ring by the swirl;
  never milky or pastel. Sources: `w2-me55-special/G/*`.

## What the family draws
- Commons: `.foil` hard-light (50 % grey neutral, nothing colour-dodges). Rest: a conic border spectrum, the window at 0.3.
  Lit: one broad 95-degree rainbow sweep under a grey cover band, positioned to stay over the window, masked by the art and the
  map (stretched to the card: TCG Live's maps sit 3.8 % / 2.7 % inside the scan; `maps/<n>-v1.webp`, alpha floor 36). `::before`
  the border: conic spectrum turning with the tilt plus a sparkle tile. `::after` sparkle in the window, falling off from the light.
  Glare capped at 0.26.
- Pikachu Rare: rest: the head dark olive (hsl(50 35% 24%) hard-lit, 0.75), the border a grey mosaic (ice tile over a 46 % floor,
  lighten). Lit: `::before` border ice over a silver / blue / pink wash; `::after` the head: two counter-shifted flake tiles over
  a floor (lighten, so the lighter flake wins and none is darker than the floor); `.cure` the rings tile (70 % of the card)
  in gold and orange, screened, masked by the art, the light and the map (+0.6 everywhere so they cross the ink).
- Classic: `--foil-map` (border + background) and `--m55-border` per card from `make_classic_maps.py` (GrabCut subject cut inside
  the window from `classic_hints.json`, stamp cut where `stampPos` / `stampSize` put it). Rest: the border only (muted bronze
  ground, flecks and stars, lighten). Lit: `::before` the border; `::after` the background: a dots tile as mask, light band
  colours plus a counter-shifted white copy of the dots, silver sparkle on top, falling off from the light. Glare capped at 0.3.
- RGB: hard-lit pool and band; `::before` fine silver radial lines on TCG Live's B channel (repeating conic) with a prismatic
  band; `::after` a soft rainbow ring by the swirl; rest tones the B area toward the card's ink.

## 2026-10-22 fix (round 1), what changed
- The module was an empty stub; it now claims the 135 faces above. Before, `celebration.css` drew every me55 face.
- Commons: border colourless pale silver -> saturated rainbow (border sat 0.29-0.32 rest, 0.50-0.59 lit, measured on WebKit
  renders); window bleach (12 % of the window clipped to white at 30:25) -> under 1 %; Chandelure stays dark.
- Pikachu Rare: head lemon -> dark olive at rest, gold faceted glitter lit; border plain -> cracked-ice mosaic; rings white and
  washing the face -> gold/orange dashes, the face stays yellow (me55-26).
- Classic: one glitter over the whole card (subject, text) and a lemon border -> per-card maps: subject and old-frame text matte,
  border and background foil; border bronze with flecks and stars; background confetti.
- RGB: colour-dodge mint/white wash and thermal-map Mew -> the ink keeps its colour, silver line texture, soft ring.
- Every glitter layer only adds light (lighten floors, colours with every channel >= 50 % in hard light): the first pass
  failed `dark_specks.py` on the Pikachu border and head and the Classic border and confetti (up to 243 specks); now 0.

## How to judge it
WebKit (`foil_probe.mjs --browser webkit`) at 220 px wide, scale 3, poses rest, 30:25, 75:65, 50:78; compare with the photos
above. Gates: `foil_coverage.mjs me55`, `dark_specks.py --set me55 --cards 1,18,75,25,39,cc4,cc94,cc149,cc33,G`,
`rainbow_speed.py css/holo/fam/me55.css`, `sweep_finishes.py --check-only`, `check_asset_overwrites.py`,
`node scripts/test-celebration.mjs`.

## Open
- Classic border ground is lighter than the real dark bronze, and the confetti on light art (Charizard) is subtler than the
  photo's dark speckle: both are held back by the dark-speck gate (a darker ground with bright flecks reads as dark dots).
- Classic maps where GrabCut is weakest (subject partly foiled or background partly matte): cc41 Greninja BREAK, cc99/cc100
  Darkrai & Cresselia, cc114 Mew VMAX, cc11g Genesect-EX, cc89 Solgaleo-GX, cc203 Magikarp (busy full art reads noisy). Better
  `fg` / `bg` hints in `classic_hints.json` and a re-run of `make_classic_maps.py` (write `-v2`) would fix them.
- The Classic maps could move into `data/me55.json` (`foilMap`) later; the module sets `--foil-map` itself for now.
- Futuristic Rares are untouched (the audit noted Mew ex reads a little milky at 40:30; minor).
- The Pikachu Rare window has no own glitter beyond the rings; the rings read faint at phone size on pale windows.
