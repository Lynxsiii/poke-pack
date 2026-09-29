# Licensing and attribution

poke-pack.rip is licensed under the **GNU General Public License v3.0**. The
full text is in [LICENSE](LICENSE).

It is GPL-3 because the card holofoil effects are derived from
[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) by Simon
Goellner (@simeydotme), which is GPL-3. Serving that CSS to a browser conveys
it, so the combined work carries the same licence. That is a deliberate
choice, not an accident — the effects were worth it.

## Third-party work

| What | Who | Licence |
|---|---|---|
| Holofoil CSS in `css/holo/` — the shine and glare layer maths, the pointer variable model, and the spring-damped interaction | [Simon Goellner](https://github.com/simeydotme), [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | GPL-3.0 |
| `assets/foil/reference/vmaxbg.jpg`, `glitter.png`, `illusion.png` and `illusion2.png`, copied from the upstream `public/img/` directory | [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css/tree/main/public/img) | GPL-3.0 repository; upstream also credits Vecteezy for some backgrounds |
| Layer recipes in `css/holo/celebration.css` (the 30th Celebration finishes), following the regular-holo, illustration-rare and special-illustration-rare cards | [Simon Goellner](https://github.com/simeydotme), [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | GPL-3.0 |
| Layer recipes in `css/holo/sv-finishes.css` (Tera ex and ACE SPEC), following the special-illustration-rare card of pokemon-cards-151 and the radiant holo of pokemon-cards-css | [Simon Goellner](https://github.com/simeydotme) | GPL-3.0 |
| The cosmos holo in `css/holo/promos.css` and its three galaxy layers, `assets/foil/promo/cosmos-bottom.webp`, `cosmos-middle-trans.webp` and `cosmos-top-trans.webp`, copied from upstream's `public/img/` | [Simon Goellner](https://github.com/simeydotme), [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | GPL-3.0 |
| Layer recipes in `css/holo/sv-fullart.css` (the Scarlet & Violet full-art Ultra Rare and gold Hyper Rare), following the ex-full-art and hyper-rare cards | [Simon Goellner](https://github.com/simeydotme), [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | GPL-3.0 |
| The pointer radial, diagonal streak and color-dodge of the Scarlet & Violet reverse holo in `css/holo/sv-reverse.css`, following the reverse-holo card | [Simon Goellner](https://github.com/simeydotme), [pokemon-cards-151](https://github.com/simeydotme/pokemon-cards-151) | GPL-3.0 |
| Layer recipes in `css/holo/swsh.css` (the Sword & Shield finishes: Rare Holo, Pokémon V, VMAX and VSTAR, Trainer Gallery, Rainbow and Amazing Rare, Radiant Rare, Shiny Vault), following the regular-holo, v-regular, v-full-art, vmax, rainbow-alt, radiant-holo and shiny-v cards | [Simon Goellner](https://github.com/simeydotme), [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css) | GPL-3.0 |
| Galaxy / cosmos holo sheet, the basis for the cosmos pattern | [aschefield101](https://www.deviantart.com/aschefield101/art/HoloSheet-2012-313543843) | see source |
| Bricolage Grotesque font in `assets/fonts/bricolage-*.woff2` | Mathieu Triay (Atelier Triay), via Google Fonts | SIL Open Font License 1.1 |

`css/holo/realism.css` follows upstream's full-art, rainbow-alt and glare layers most closely.

The 30th Celebration textures in `assets/foil/celebration/` (star glints,
firework rings, cracked ice, confetti, puffy stars, grid glitter) are our own,
drawn by `scripts/make_celebration_textures.py`.

The Sword & Shield foil textures are our own too: the etched diagonal streaks
of Pokémon V in `assets/foil/swsh-streaks-v2.webp` (drawn by
`.claude/skills/card-textures/scripts/make_swsh_streaks.py`) and the chevron
reverse-holo tiles per type in `assets/foil/swsh-reverse/` (drawn by
`.claude/skills/card-textures/scripts/make_swsh_reverse.py`).

`css/holo/` is adapted rather than copied verbatim: the selectors are remapped
from simey's `.card__translater / .card__rotator / .card__shine / .card__glare`
structure onto this project's flatter `.tcg > img + .foil + .glare`, and the
rarity keys are remapped from the Sword & Shield era names his demo uses to
the Scarlet & Violet and Mega Evolution rarities this site actually deals in.
Changes are noted at the top of each file.

The original per-rarity effect system this project shipped before is still
here, in `css/app.css`, and is selectable in Settings as **Classic**. It is
original work and not derived from pokemon-cards-css.

## Not third-party, but not ours either

Card names, numbers, artists and scans match the public Pokémon TCG card
database. The per-card foil and etch maps in `assets/foil/maps/` are
Pokémon TCG Live's own, as published through [malie.io](https://malie.io)'s
TCG Live exports; they say where each printed card is foil, which is what
lets the shine stop at the Pokémon and the 30th Celebration stamp. The Prismatic Evolutions pattern textures in `assets/foil/prismatic/` are
derived from the same maps (`scripts/make_prismatic_textures.py`). The
Scarlet & Violet reverse holo patterns in `assets/foil/sv-reverse/` are
medians of TCG Live's reverse maps, one per type. The
maps for the two Pikachu ex promos (`mep107*`, `mep109*`) are not TCG
Live's: we drew them from the card scans in the same layout. Set symbols in
`assets/cards/sets/*-symbol.webp` are [pokesymbols.com](https://pokesymbols.com)'s
drawings of the printed marks, cropped and resized by
`scripts/mirror_images.py --symbols`; set logos come from scrydex and
pokemontcg.io. Product photos
in `assets/products/` are TCGplayer's catalogue images, cut out of their
white backgrounds by `scripts/build_products.py`; product prices are
TCGplayer market prices, read through [tcgcsv.com](https://tcgcsv.com). poke-pack.rip is a fan-made simulator and is not affiliated with
Nintendo, Game Freak, Wizards of the Coast, or The Pokémon Company. The GPL
covers this project's own code; it makes no claim over Pokémon trademarks or
card artwork.
