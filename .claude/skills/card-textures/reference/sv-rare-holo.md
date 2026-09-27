# Scarlet & Violet holo Rare (`SV_HOLO`)

The regular holo Rare of every Scarlet & Violet and Mega Evolution set, and
the 30th Celebration: TCG Live files all of them as `SV_HOLO` / `HOLO`
(`Rare_SvHolo_Holo`), class `foil-holo foil-svholo` on a mapped card. The
recipe is in `css/holo/celebration.css` under "Rare: SV_HOLO / HOLO". The
Twilight Masquerade thread rebuilt it on 2026-09-27 from photos of real
cards, and owns it.

## What the real card does

Photos: `/mnt/project-files/surging-sparks/texture-refs/` (notes in
`../texture-notes.md`), mainly `rare-holo_072-togekiss_art-and-border-closeup.jpg`,
`rare-holo_072-togekiss_107-gastrodon_065-tapu-koko_three-card-photo.jpg`
and `rare-holo_CROSS-SET_sv-promo-quaxly-fuecoco-sprigatito_pattern-reference.jpg`.

- **Where**: the art window's background and the silver border (the foil
  map). The Pokémon, the type frame, the name bar and the text box are print.
- **Band**: one broad, saturated rainbow band, about a quarter of the card
  tall, sweeps across the art background as the card tilts. Its hue changes
  along its length (red, orange, yellow, green, cyan, blue from one side to
  the other), and the art stays visible through it.
- **Glitter**: a fine, even silver sandpaper grain over all of the foil,
  border included. The border shows only this glitter as a thin sparkling rim.
- **Between bands**: grey-silver metal with the grain. Nothing goes dark.

## The recipe

Every layer paints into `.foil`, and `.foil` hard-lights the result onto the
card, so:

- **`.foil` background**: the band is a `172deg` gradient of 50% grey
  (neutral under hard-light) with a transparent gap, laid over a `95deg`
  spectrum. The band layer is 300% tall and moves with `--py`, and the
  spectrum is 160% wide and moves with `--px`. Where the gap is, the
  spectrum tints the art without hiding it.
- **`::before`**: `glitter.png` (sparse white points) screened over
  `glitter-flecks.webp` (dense flecks), `saturate(0.3) brightness(1.45)`,
  sized in % of the card (38%, 33%) so the grain is the same on a thumbnail
  and in the inspector. It is masked by a radial under the light, 100% there
  and 50% at the far corner.
- **`::after`**: a soft white hot spot under the light, slightly darker (20%)
  away from it.

The old recipe was a port of pokemon-cards-151's regular holo: a `10deg`
spectrum overlay at `contrast(2.6)`, multiply light bars and a luminosity
falloff. Next to the photos it read as a dark, noisy background with only a
faint rainbow, and it turned Future and Ancient text boxes black (below).

## Future and Ancient frames

These frames print a halftone panel down the right of the text box, and the
`SV_HOLO` foil map is white over it: the panel really is foil. Under the old
recipe the multiply bars and luminosity falloff turned the panel and the
attack text on it solid black. The fix was `css/holo/sv-rare.css`: `foilExtras()` in
`js/foil-maps.js` adds `frame-paradox` to mapped cards whose `subtypes`
include `Future` or `Ancient`, and the rule masks `::before` and `::after`
to the top 48–51% of the card.

The new recipe has nothing that darkens, so the text stays black ink with the
band and glitter around it, with or without that mask. The rule is still
live. On those frames it now only keeps the glitter and the hot spot out of
the text box.

## Pitfalls

- Blend modes on the pseudo layers act inside `.foil`'s group, not against
  the art: `.foil`'s own `mix-blend-mode` is what reaches the card. Keep the
  group neutral (50% grey) wherever the foil should leave the art alone.
- `grain.png` is white with alpha of at most 37%, so filters can't make it
  sparkle. Use `glitter.png` / `glitter-flecks.webp` for visible specks.
- Fixed pixel tile sizes looked right in the inspector and like static on a
  240px thumbnail. Size textures in % of the card.
- Color-dodge (the first attempt) blows light art backgrounds out to white.
  Hard-light over a 50% grey base tints the art without doing that.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv6&cards=19,63,24,82&poses=rest,30:25,50:50,70:80&proof=off" --scale 2 --out /tmp/sv-rare.png
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv3&cards=25,30,62,70,85&poses=rest,40:30,60:55&proof=off" --out /tmp/sv-rare-sv3.png
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=me55&cards=12,14,19,56&poses=rest,30:25,50:50,70:80&proof=off" --out /tmp/sv-rare-me55.png
```

Twilight Masquerade 19 is Iron Leaves (Future), 63 Walking Wake (Ancient),
24 Teal Mask Ogerpon and 82 Alakazam (dark art). Obsidian Flames 85 is a
Togekiss to hold next to the Surging Sparks photo. At 60:55 the band should
sit across the bottom of the art in the same colours.
