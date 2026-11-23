# Holo family sv-prismatic: Prismatic Evolutions Poké Ball and Master Ball prints

Module `js/fam/sv-prismatic.js`, sheet `css/holo/fam/sv-prismatic.css` (retunes `css/holo/prismatic.css`), assets
`assets/foil/fam/sv-prismatic/<n>-ink.webp`, generator `scripts/fam/sv-prismatic/make_ink_masks.py`. Built
2026-11-23 from the audit w2-sv-prismatic (`/home/user/holo-work/w2-sv-prismatic/AUDIT.json`).

## Scope
Every sv8pt5 face with `pattern` (pokeball / masterball) and a TCG Live foil map: 167 faces (100 Poké Ball, 67 Master
Ball). The regular sv8pt5 reverses stay with sv-reverse; holo, ex, IR, SIR etc. with their families.
Not claimed: `sv8pt5-74-pokemon-day` (stamped Eevee, plain reverse) and `zsv10pt5-12-pokeball` (Black Bolt ball
reverse) — not Prismatic pattern prints.

## Finish facts (photos)
- Foil everywhere but the Pokémon and the ink; black text stays black (ink over foil). Sources: audit photos, and
  in-hand/eBay photos fetched 2026-11-23 (`/home/user/holo-refs/w2-sv-prismatic/mb1/`, `pb1/`: Larvitar, Spritzee,
  Duraludon, Hawlucha Master Ball; Black Belt's Training, Rescue Board, Umbreon lit).
- Flat light: a tonal shard mosaic in the card's own colour, silver on white/grey stock (Duraludon, Hawlucha), no
  colour cast.
- Lit: the big ball throws a pastel rainbow across several hues (Black Belt's Training, Rescue Board photo); on the
  Master Ball print the ball reads darker and more saturated than the shards (JP Umbreon, Espeon).

## What changed (2026-11-23)
- Ink knockout: the foil mask is art ∩ foil map ∩ `--prism-ink` (alpha 0 on dark low-chroma ink, from the scan).
  Most `-ball` maps did not cut the text out, so hard-light recoloured black text green/yellow.
- Base wash desaturated (S ≤ 12%): white, colourless and Trainer cards light silver, not mint-teal.
- Lit ball: a repeating 7-hue pastel gradient with a period of about one ball (30.3% of a 130% tile), mid-light so it
  tints white stock too; the resting ball image is dropped while lit so it no longer tints the gradient one hue.
  Fixes the flat yellow / flat green ball discs.
- Master Ball ball: same gradient at L 38-44% (darker, more saturated shape).
- Shard glint opacity 0.7 → 0.85 (near-white flashes).
- Specificity: every rule doubles `.fam-sv-prismatic` — prismatic.css's `.foil-prism.foil-prism.has-foil-map` rules
  otherwise outrank a single family class (the first try's Poké Ball ::after silently lost).

## Left as is / ideas
- Fine parallel line ruling inside each shard (pitch ~1/200 W) is not drawn: at phone size it risks reading as
  scanlines; the mosaic plus glints carries it.
- Art-window background sheen on Master Ball prints (low-confidence audit item) not added.
- `scripts/test-prismatic-evolutions.mjs` fails on master and here at an sv-reverse assertion (has-rev-map classes),
  before it reaches anything of this family.
