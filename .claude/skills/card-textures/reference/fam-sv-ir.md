# Holo family sv-ir: Scarlet & Violet Illustration Rares (2026-11-23)

Module `js/fam/sv-ir.js`, sheet `css/holo/fam/sv-ir.css`. No assets of its own (every face already carries TCG Live's
map in the data). Audits: `/home/user/holo-work/w2-sv-ir-a/AUDIT.json` (sv1-sv5, 151, Paldean Fates: 168 faces) and
`/home/user/holo-work/w2-sv-ir-b/AUDIT.json` (sv6-sv10, Black Bolt / White Flare, promos: 273 faces). Photos and
sources: `/home/user/holo-refs/w2-sv-ir-a/` and `w2-sv-ir-b/` (`SOURCES.md`).

## Scope

Every non-reverse face with rarity (after `foilLook()`) "Illustration Rare" and an id matching
`/^([zr]?sv\d|svp-)/`: the set IRs of sv1-sv10, sv3pt5, sv4pt5, sv6pt5, sv8pt5, rsv10pt5, zsv10pt5 and the SV Black Star
promos foiled as IR (stamped `-pc` prints included; the five `svp-` faces have no `era-sv` class, so the claim is by
id). 441 faces; the census matches the old `foil-ir` + era sv group one for one, nothing taken from another family.

## The real finish (photos)

- TCG Live: SUN_PILLAR / HOLO, per-card foil map, no etch. The shipped maps are white RGB with the information in the
  alpha (audit A read the RGB and called them all white; the alpha holds the Pokémon near 0 and the border at about
  12-36/255).
- PATTERN: narrow parallel diagonal streaks rising to the right (about 40-45 degrees), six to eight across the face,
  sliding with tilt (Klawf sv1-217, Pikachu sv3pt5-173, Palafin sv4pt5-225, the Japanese 151 ARs, Pawmot sv1-209). A
  broader band at a wide angle (Tapu Bulu JP sv6a 065, Wugtrio sv4pt5-224).
- COLOUR: each streak a full saturated spectrum; vivid over dark ink (Palafin), still clearly coloured over pale ink
  (Ralts, Klawf's text box). No white or gold wash.
- TEXTURE: smooth, a fine round pinpoint sparkle, noticed second (Wugtrio macro).
- WHERE: Pokémon matte or nearly (Tapu Bulu, Pawmot), black line art stays black, silver border flat.
- STRENGTH: in flat light the card reads as print (Wugtrio ambient photo, Feebas outdoors).

## What the site did (before) and what changed

Before: celebration.css's shared `.foil-ir.has-foil-map`: a desaturated colour-dodged vertical sun-pillar stack, a
grey-cyan 133deg ramp and a 128 px grain stretched to `140px 100%` (vertical "rain"), an overlay glare that washed pale
art milky; no spectrum anywhere.

Now (`.fam-sv-ir`, same structure as me-ir.css):
1. `.foil` (reworked after the lead's review, 2026-11-23): one background-blend chain, hard-lit onto the print. Three
   streak layers (black with one thin soft white line per period: 9.1%, 13.3%, 19.7% of a 200% box, angles 133/136/139deg,
   each moved at its own rate) are lightened together, so spacing and widths are irregular; a hue ramp (150deg, 160%
   box, pastel stops at lightness 82-93%) is multiplied in, so each line takes one hue and the next line another, sliding
   with tilt; a 50% grey is lightened on top, so every gap is neutral and nothing darkens. Lines read near white on pale
   ink and saturated on dark ink. Clipped inside the silver border (`--svir-clip`, inset 2.4% / 3.6%). Rest: opacity
   0.07. The first version (a full red-to-violet spectrum inside every streak, evenly spaced over the whole face) read
   as regular flag-stripe hatching next to the photos: on the real cards each streak is mostly one hue.
2. `.foil::after`: a neutral grey veil with a small hole at the light (clear to 18%, 0.6 at 40%, 0.93 at 62%), so only
   three to five lines near the light are lit and the far side stays plain print.
3. `.foil::before`: the sand (`glitter-fine` + `glitter-flecks`), screened, 0.24.
4. `.glare`: a soft white pool, soft-light, masked by the art and the map, clipped to the border; `.glare::after` off.
5. Miraidon ex / Koraidon ex (SVP 028/029, `svir-ex`): ex-frame promos whose real foil covers the whole face; they
   paint through `assets/foil/maps/full.webp` instead of Live's map. Closer would be the sv-double-rare look.

Open: Tapu Bulu-type cards show one broad band on the real card, ours draws the narrow streak set; streaks on very
pale art (Exeggcute sv8-192) are softer than the Ralts photo. `sv4-svp066-pc` has foil baked into its scan (data fix).

## Verify

`/home/user/holo-work/fix2-sv-ir/bin/strip.sh holo-wip sv1 217 x` (one card, seven poses, WebKit x3). Samples: sv1 217
Klawf (pale), sv4pt5 225 Palafin (dark), sv6pt5 65 Tapu Bulu (Pokémon matte), sv4pt5 224 Wugtrio (red bodies stay
red), sv8 192 Exeggcute (pale pink), sv2 194 Heracross, sv3 198 Gloom, svp svp028 / svp207.
