# Family sv-tera: Scarlet & Violet Tera Pokémon ex (Double Rare and full-art Ultra Rare)

Module `js/fam/sv-tera.js`, sheet `css/holo/fam/sv-tera.css`. Built 2026-11-23 from the audit
`/home/user/holo-work/w2-sv-tera/AUDIT.json`.

## Scope

Exactly the faces js/app.js files as `foil-ex foil-tera` / `foil-ultra foil-tera` (isTeraFoil(): Double or Ultra Rare,
Tera subtype, TCG Live foil map) with a Scarlet & Violet id (sv*, pt5 sets, rsv/zsv, svp-). Census 2026-11-23: 103
faces, 68 Double Rare and 35 Ultra Rare (`svt-fa`), including svp166 (no `era-sv`) and the nine sv8pt5 `-stamp`
prints (their stamp foil maps are kept). The six Mega Evolution Tera faces stay with me-holo. No asset: Live's foil
and etch maps are right.

Open: **svp196 Charizard ex** is a Tera print (Tera label and crystal art on the scan), but its data subtypes are
`Stage 2, ex` without `Tera`, so it is filed `foil-ex foil-sunpillar` and sv-double-rare claims it. Adding `"Tera"` to
its subtypes in data/svp.json moves it here with no code change (sv-double-rare excludes Tera; this module claims it).

## The real card (photos)

- Forretress PAF 002 whole card and macro, Charizard OBF/PAF 054 tilted and macro (paldean-fates/texture-refs);
  Gyarados SVI 045 whole card and text box (scarlet-violet/texture-refs); Sylveon SSP 086, Pikachu SSP 057, Pikachu
  219 and Exeggutor 225 full arts (surging-sparks/texture-refs); Arcanine SVI 032 on a dark surface.
- Whole face foil under the ink, text box included. Lit: one broad soft rainbow, strongest near the light, over art,
  Pokémon and text box; frame and text box go bright silver sand; dense fine multicolour glitter everywhere; fine
  fingerprint etch lines near the light. Flat: the print, a silver glittery frame, no rainbow. Dark ink stays dark
  (Charizard 054's teal text box stays deep teal with grain). Full arts: paler pastel rainbow, glitter heavy.

## What the era recipe did wrong (sv-finishes.css) and what this sheet does

- Was: 15deg repeating spectrum landing as one flat pink or violet tint on the frame; multiply glare dimming the card
  away from the pointer; faint gold glitter; a white etch hot spot that put a milky blob on the text box (the etch map
  is solid there).
- Now: `.foil` colour-dodge group (masked by the art and the map with a 0.36 floor) = black + a soft silver pool + the
  etch under a smaller lamp (in a dodge a solid etch area only brightens); `::before` one broad soft band (250% tile,
  116deg) with two narrower streaks at another angle and speed, screened, weighted round the light, dodge gain under
  2; `::after` two fleck tiles screened; `.glare` multiplies a pastel copy of the band onto pale inks (white elsewhere);
  `.cure` (cure: true) screens the fleck tile once more over the dodge, masked by the scan's own luminance first so
  black ink keeps no sparkle; `.glare::after` off. Rest: etch + glitter, faint, no rainbow.

## Lessons

- A silver pool or band brighter than about rgb(60) in the dodge bleaches cream and orange prints (Arcanine, Eiscue)
  to white near the light; the band's blue and violet stops whiten orange text boxes, so they are kept dim.
- Glitter inside a dodge disappears on bright inks; `.cure` with `mask-mode: luminance` on `var(--art)` (WebKit:
  `-webkit-mask-source-type`) shows it on bright ink and keeps it off black ink.
- Pale large Pokémon (Cinderace, Arcanine's mane) still lighten toward silver at 20:30-30:25; the art reads.
