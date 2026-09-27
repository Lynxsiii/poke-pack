# Scarlet & Violet reverse holos (shared)

Built once for every Scarlet & Violet set, plus the Mega Evolution sets'
mirror (2026-09-27, from the Paradox Rift thread). Rules:
`css/holo/sv-reverse.css`. Hook: `reverseFinish()` / `foilExtras()` in
`js/foil-maps.js`. Assets: `assets/foil/sv-reverse/<pattern>.webp`, built by
`.claude/skills/card-textures/scripts/make_sv_reverse.py`.

## What TCG Live says

Every reverse print has a reverse map beside its holo one:
`https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<key>/<key>_en_<nnn>_ph.foil.png`
(`ph` in place of `std`). Every SV reverse is `FLAT_SILVER` / `REVERSE` in
the export, so the finish name tells nothing; the map does. It is opaque
grey: black where the card is plain (the art window, the name bar, the
energy-cost dots), grey levels where it is foil.

| Card | Reverse map |
|---|---|
| Pokémon, SV (sv1-sv10, 151, Paldean Fates, Prismatic) | the "cobblestone": pebbles, the type's symbol scattered between them, a big type badge (a sunburst ring) on the right of the body |
| Trainer | the same pebbles with Poké Balls |
| Special Energy | foil only in the text box, colorless star cobblestone |
| Ancient or Future card (Paradox Rift on), Trainers too | plain mirror: one flat light grey |
| Mega Evolution | plain mirror |

The cobblestone is the same picture for a type in every SV set: sv1, sv4-5,
sv8-5 and sv10 grass cards differ from the sv4/5/6/2/7 median by 5-9 grey
levels (body mean absolute difference); 151, Journey Together and Black
Bolt / White Flare by about 20, only because their greys are lighter. One
pattern per type is enough, instead of a map per card (12 files, 224 KB).

Why the site had it wrong: the old reverse (`rarities.css`) is a cosmos
tile, which is a Sword & Shield era look, and on a 151 pack it drew white
crackle over the text box and border.

## Building the patterns

`make_sv_reverse.py` takes 7 non-Paradox reverse prints per group from
several sets, round-robin, and keeps the per-pixel median, which drops what
differs per card (dots, a Stage card's evolution bite). Two steps matter:

- **Stretch the grey levels.** The pebbles differ by a few dozen levels. As
  the reverse recipe's `difference` texture that reads as a faint pattern;
  stretched to the full range (2nd-98th percentile of the body) the pebbles
  and badge catch the light like the real cards.
- **Alpha is the foil region.** Grey > 40 is foil. Storing that as alpha
  makes one image both the texture and part of the mask, so the name bar and
  the art window stay plain without a new window image.

Special Energy is the one where the mask matters most: the old reverse lit
the whole card below the art.

## Against real cards

151 photos (`/mnt/project-files/sv151/texture-refs/reverse-holo_*`, from the
151 thread) and SV base photos (`scarlet-violet/texture-refs/reverse-holo-*`):

- The pattern is plain to see at rest: pale pebbles and the badge read as a
  lighter shade of the frame colour, the lines between them darker.
- Tilted, the foil is a smooth mirror with one broad soft highlight and a
  metallic streak; the pale pebbles brighten, the lines stay dark. Nothing
  sparkles or crackles.
- The silver outer border is not foil (the map is 33 grey there, under the
  40 cut-off), the art window is matte.
- The motif is not in the card scans. 151 Parasect's scan has a plain green
  text box; its reverse map is the leaf cobblestone and sunburst badge in the
  photo. So a mirror with no pattern would be wrong for 151 too.

## Recipe

Upstream's reverse (a pointer radial soft-lit over a -45deg gradient,
`difference`-blended with the card's reverse map, color-dodge) inverts the
pattern under the light: the thin dark lines between pebbles turn into the
brightest thing on the card, which reads as white veins. It also shows
nothing at rest. `sv-reverse.css` keeps its parts and changes the blend:

- **Light × pattern.** `.foil` stacks the pattern (`multiply`) over a
  -45deg streak (`screen`) over a soft pointer radial (white at the pointer,
  30% grey at the far corner): the foil that shows through a pebble is the
  light times how pale the pebble is. `color-dodge`, `brightness(.55)
  contrast(1.2)`. Upstream's per-type brightness filters were for the
  difference blend and are gone.
- **At rest** the same layer sits at 0.4 opacity (not the 0.18 every other
  foil rests at), rising to 1 with `--card-opacity`, so the pattern shows on
  a binder page and there is no jump when a card is picked up.
- **Mask** `var(--art)` ∩ pattern alpha − the layout window (`--win-holo`,
  `--win-evo`, `--win-owner`, `--win-holo-trainer`): three layers,
  `mask-composite: intersect, subtract` (`-webkit-mask-composite: source-in,
  source-out`). The composite list pairs each layer with everything below
  it, top first. Special Energy: `var(--art)` ∩ pattern alpha only.
- **Mirror**: the same stack with a flat 72% grey for the pattern, so it is
  the two lights on a smooth mirror.

Scope in `reverseFinish()`: ids `sv<digit>...` get patterns (Ancient and
Future get the mirror); `me<digit>...` except `me55` get the mirror; promos
(`foilAs`) and other sets keep what they had. So does any reverse with a
kind of its own, which the app resolves as `reverseKindOf()` (the card's
`reverseKind`, else its set's `reverseFoil`) and passes to `foilExtras()`:
Poké Ball, Master Ball, Shrouded Fable's chain. A set with its own reverse
sets `reverseFoil`.

## Verify

The lab draws card N as a reverse when it is listed as `rN`:

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv5&cards=r1,r101,r142,r161,r61&poses=rest,30:25,75:75&proof=off&w=300" --out /tmp/rev.png
```

Temporal Forces 1 Scyther (grass), 101 Arbok (darkness, Stage 1), 142
Bianca's Devotion (Supporter, Poké Balls), 161 Mist Energy (Special Energy),
61 Iron Hands (Future, mirror). At rest the pattern shows faintly; tilted,
the pebbles and badge brighten with the frame colour kept, and the thin lines
stay dark. Mega Evolution mirror: `set=me1&cards=r1,r20&poses=rest,30:25`.
A set's own kind is untouched: `set=sv6pt5&cards=r5,r20&rev=chain` still
draws Shrouded Fable's chain.
