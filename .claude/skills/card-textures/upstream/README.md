# Upstream reference copies

Unmodified copies of the effect sheets from Simon Goellner's two card
projects, kept here so a texture can be ported by reading the original
instead of recalling it. They are reference material for agents: nothing
here is loaded by the site, and `.claude/` is never deployed.

| Folder | Source | Commit | Era |
|---|---|---|---|
| `swsh/` | [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) `src/lib/components/`, `public/css/cards/` | `acb1197633e749a1fba4412231db2f6581586d00` | Sword & Shield, the demo at poke-holo.simey.me |
| `sv151/` | [simeydotme/pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) `src/lib/components/`, `public/css/cards/` | `98030f941cdc4919b648457200277e29b60d5f5a` | Scarlet & Violet 151, the demo at poke-151.simey.me |

Both are **GPL-3.0**, like this repo. Anything ported into `css/` needs a
line in the repo's `NOTICE.md` (pokemon-cards-css is already credited there;
add pokemon-cards-151 when the first rule from `sv151/` ships) and a note at
the top of the site file saying what it follows.

## What is in each

- `Card.svelte`: the pointer maths (springs, `--pointer-*`, `--background-*`,
  `--rotate-*`), the rarity and subtype attributes the sheets select on,
  and, in 151, `--seedx`/`--seedy` random offsets and the per-card `--foil`
  and `--mask` images. `reference/variables.md` maps all of it onto
  `js/card-motion.js`.
- `CardProxy.svelte`: how a card's data picks its rarity sheet and its
  foil or mask image.
- `base.css`: the shared layer set-up (grid stacking, default blend modes,
  the sunpillar palette, `.masked` luminance masks).
- `_cards.css`: upstream's `public/css/cards.css`, the import list, which
  shows the cascade order.
- One sheet per finish, named after the rarity. `reference/finish-catalog.md`
  says which to start from for each finish the site needs.

## Textures the sheets use

- `swsh/` loads `/img/<name>` from its own repo's `public/img/`: for example
  `https://raw.githubusercontent.com/simeydotme/pokemon-cards-css/acb1197633e749a1fba4412231db2f6581586d00/public/img/galaxy.jpg`.
  The site already has `glitter.png`, `illusion.png`, `illusion2.png` and
  `vmaxbg.jpg` in `assets/foil/reference/`.
- `sv151/` loads `/img/glitter.webp`, `/img/grain.webp`, `/img/illusion.png`,
  `/img/trainerbg.png` from its repo, and the 151 foils from
  `https://poke-holo.b-cdn.net/foils/151/<name>.webp`: `iri-1` to `iri-9`
  (glitter tiles), `birthday-holo`, `birthday-holo-dank`,
  `birthday-holo-dank-2` (the Double Rare star sparkle), `noise-base`,
  `noise-top`, `pokeball-inner`/`-outer`, `masterball-inner`/`-outer`.

Never hotlink these from the site. Download the ones a finish needs into
`assets/foil/reference/`, as the site did for the four above, and credit
them in `NOTICE.md`.

## Structural differences to remember when porting

| Upstream | This site |
|---|---|
| `.card__shine` | `.foil` |
| `.card__shine:before`, `:after` | `.foil::before`, `.foil::after` |
| `.card__glare` | `.glare` |
| `.card__glare:after` | `.glare::after` |
| `.card__glitter` (151) | no element: fold it into a background layer of `.foil` or its `::before` |
| `.card__glare2` (151) | no element: use `.glare::after` |
| `data-rarity`, `data-subtypes` attributes | classes from `tcgFace()`: rarity key, `foil-*` pattern, `foil-evo`/`-owner`/`-trainer`/`-energy` layout |
| `--foil`, `--mask` per card | `--art` (the scan) only; per-card masks are the gap, see `reference/masks.md` |
| `--rotate-delta` (popover spin) | not written; treat as `0deg` |
| Every layer painted at rest | resting cards paint only `.foil`; see `reference/variables.md` |
