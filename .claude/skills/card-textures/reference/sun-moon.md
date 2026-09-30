# Sun & Moon era (sm1 to sm12, sm35, sm75, sm115, det1, smp, mcd17-19)

Built on 2026-09-30 by the "Sun and Moon era" thread: one lead, six set
builders, four finish agents, three research agents, two integration agents,
and an independent reviewer for every finish family before it merged. This is
the era overview; every set and every finish family has a note of its own
(linked at the end). Read this one first, then the set or family note you need.

## Shape of the era

| Piece | Where |
|---|---|
| Era plumbing (`isSm`, `smPattern`, `smLate`, `smSafeMap`, `smReverseFinish`) | `js/sm-foil.js` (hooked into `js/foil-maps.js` and `js/app.js`) |
| Four finish sheets, keyed by `era-sm` with repeated-class specificity | `css/holo/sm.css` (window holo, reverse, plain glare), `sm-gx.css` (GX, Tag Team, Prism Star), `sm-fullart.css` (full art, alt art, Supporter, rainbow, gold), `sm-shiny.css` (Hidden Fates Shiny Vault, Shining Legends) |
| Pack slots | `smSlots({...})` in `js/catalog.js`; Prism Stars and other reverse-slot hits go through `reverseSpecial` |
| Hit rarities | `HIT_RARITIES` and the engine pools (`gx`, `prismStar`, `shining`, `shinyGX`, `shinyUltra`, `character`) in `js/engine.js` |
| Basic Energy | print `sm17` (sm1 to sm8, sm75) and `sm19` (sm9 on): `assets/cards/shared/energy-<type>-sm17|sm19.webp` (the `-sm` suffix is the small-scan suffix, so the print suffix is `-sm17`) |
| Research | `/mnt/project-files/sun-moon/research/` (per set, `second-source-check.md`, `box-contents.md`) |
| Photos | `/mnt/project-files/sun-moon/texture-refs/<family>/SOURCES.txt` |
| Contact sheets | `/mnt/project-files/sun-moon/finish-sheets/<family>/` |

## Pack structure (researched, two or more sources each)

- 11 cards: 1 basic Energy, 5 Commons, 3 Uncommons, 1 reverse slot, 1 rare slot.
- **Plain Rare is exactly 2/3 of packs, holo-or-better is 1/3**, measured from
  per-card pull counts of complete boxes (66.5 to 67.0 percent in every main
  set). So `holo = 1/3 - (GX + ultra + rainbow + secret)`. Dragon Majesty has
  no plain Rare (every pack has a holo or better in the rare slot).
- **Prism Stars sit in the reverse slot**, not the rare slot (sm5, sm6, sm7,
  sm75, sm8, sm9): use `reverseSpecial: [["prismStar", p]]`.
- Hidden Fates: a Shiny Vault card takes the reverse slot about one pack in
  three. Cosmic Eclipse: the 12 Character Rares sit in the reverse slot (pool
  `character`, flagged `"character": true` in `data/sm12.json`). Shining
  Legends: Shining Pokémon fill the rare slot. Detective Pikachu: 4-card
  packs sold only inside products.
- ETBs are filed as product `elite-trainer-box` (8 packs; sm35 and sm75: 10),
  not as the `eliteTrainerBox` row of `data/sealed.json`.
- Confidence: high for sm5 and sm7, medium-high for sm6, medium-low for sm75
  (n=949, rainbow and gold about one point wide). All tallies reach us through
  one forum (Elite Fourum); each set's `data/pullrates.json` row says so.

## Data gotchas

- pkmn.gg lists prize and event reprints as extra numbers ("a" prints). The
  ones no pack or product holds are dropped with `skipNumbers` in
  `data/sets/<id>.json`; the box-only ones stay with `promo: true` so they
  stay out of pack pools.
- **Any card with `foilAs` needs `era: "sm"`.** `js/app.js` only asks
  `smPattern` when the card has no `foilAs` or carries the era; without it
  Detective Pikachu, the promo reprints and the "a" prints fell to the
  generic holo (caught by the reviewers: det1 drew no foil at all).
- `build_products.py` keeps `promo: true` cards whose rarity is not "Promo" or
  whose number ends in `a`; smp keys are `SM001` on pkmn.gg and `SM01` on
  scrydex.
- Do not run `mirror_images.py` or `fetch_foil_maps.py` at the same time on
  one set: both rewrite `data/<set>.json`.
- TCG Live gives sm1 #1 Caterpie and sm3 #18 Charmander a reverse-holo
  pattern as their "foil map"; `fetch_foil_maps.py` stamps it back on every
  run, so remove those two after a re-run.
- Wrappers: the builders cut the white box out with `clean_pack_art.py`
  (-v2 names where the uncut file had shipped).

## Deploy size

Free Cloudflare caps a deploy at 20,000 files; Noah upgraded to Workers Paid
on 2026-09-30 (100,000 files, 25 MiB per file), and
`scripts/prepare-cf-assets.mjs` `MAX_FILES` follows. The era adds about 5,000
files on top of roughly 17,800 (22.8k before the finish assets), most of them
card scans, foil and etch maps. The 484 native `-etch-v4` maps of the full-art
family are the heaviest item (about 95 MB); their 400 px predecessors were
deleted.

## Finish families (what each one is)

| Family | Classes | Note |
|---|---|---|
| Rare Holo, two looks: early (sm1 to sm7, sm75) shattered rainbow; late (sm8 on, det1, mcd19, Black Star promos from SM120) soft satin pools | `foil-holo sm-holo`, `sm-late` | [sun-moon-holo-reverse.md](sun-moon-holo-reverse.md) |
| Reverse holo: type symbols tiled over a mirror, broad rainbow band; Trainer and basic Energy have their own | `rev-sv rev-sm rev-<type>`, `rev-trainer`, `rev-energy` | same |
| Plain Rare, Common, Uncommon: not foil, pointer glare only | `foil-none` | same |
| Pokémon-GX, TAG TEAM GX, Prism Star | `foil-ex sm-gx[ sm-tag]`, `foil-holo sm-prism` | [sun-moon-gx.md](sun-moon-gx.md) |
| Full art GX and Tag Team, alt-art Tag Teams and colour secrets, full-art Supporter, rainbow, gold | `foil-ultra sm-fa[ sm-alt]`, `sm-tfa`, `foil-ir sm-rainbow`, `foil-gold sm-gold` | [sun-moon-fullart.md](sun-moon-fullart.md) |
| Hidden Fates Shiny Vault (Shiny Rare, Shiny GX) and Shining Legends' Shining Pokémon | `foil-holo sm-shiny`, `foil-ex sm-shiny sm-gx`, `sm-shining` | [sun-moon-shiny-vault.md](sun-moon-shiny-vault.md) |

Cards with no TCG Live map (alternate-art promos and reprints) take a
text-safe median map (`assets/foil/maps/sm-gx-safe.webp`, `sm-prism-safe.webp`,
`sm-holo-safe.webp`, from `smSafeMap()`), so the recipe still gets
`has-foil-map` and never foils the text or the whole Pokémon.

## What the independent reviews caught (so the next era can avoid it)

Every finish was attacked by a fresh-context reviewer (Chromium and WebKit,
phone size) before merging. What they found, in rough order of cost:

- **Colour-dodge recolouring dark print**: Prism Star rules text turned neon
  green (same class as the Radiant bug); fixed by keeping foil off the strip
  and multiplying the strip's rainbow on. Rainbow `.foil` had no closing
  `contrast(0.8)` (copied from swsh.css): every dodged chain needs the cap.
- **Finishes that silently do nothing**: a missing data field (`era: "sm"`)
  switched a whole set off; a stamp on the wrong data file dropped the
  softened etch; a native etch sat unused until the data was repointed. After
  any asset or data step, render the real app, not only the lab.
- **Fallbacks louder than the main path**: cards with no foil map painted the
  whole card or the Pokémon; the answer is a median map, not a separate loud
  recipe.
- **Too weak or too strong against photos**: Shining Pokémon read as plain
  print and darkened at rest; the late holo hazed dark art by 60 levels.
  Measure the mean foil-minus-bare change of the art window per pose next to
  a finish that already shipped, and compare to the photos.
- **Etch line screens**: `etch_metrics.py` `lb` is peak over mean in the 2-9 px
  band, so softening a map raises `lb` while moving it toward "sheen, not
  lines" (`mid` up); judge by eye in WebKit at 340 px, DPR 2.
- **Evidence gaps**: photos were low-resolution thumbnails from few channels;
  alt-art Tag Teams, colour secrets and the full-art Supporter rest on TCG
  Live's maps alone. The notes say so per finish.
- Process: subagents have no Agent tool, so the lead dispatches the
  reviewers; `pkill -f <script>` kills other agents' runs; the shared disk
  fills when several agents render sheets (prune scratch and old sheets).

## Sets, oldest first

[sm1](sun-moon-sm1.md) Sun & Moon, [sm2](sun-moon-sm2.md) Guardians Rising,
[sm3](sun-moon-sm3.md) Burning Shadows, [sm35](sun-moon-sm35.md) Shining
Legends, [sm4](sun-moon-sm4.md) Crimson Invasion, [sm5](sun-moon-sm5.md)
Ultra Prism, [sm6](sun-moon-sm6.md) Forbidden Light, [sm7](sun-moon-sm7.md)
Celestial Storm, [sm75](sun-moon-sm75.md) Dragon Majesty,
[sm8](sun-moon-sm8.md) Lost Thunder, [sm9](sun-moon-sm9.md) Team Up,
[det1](sun-moon-det1.md) Detective Pikachu, [sm10](sun-moon-sm10.md)
Unbroken Bonds, [sm11](sun-moon-sm11.md) Unified Minds,
[sm115](sun-moon-sm115.md) Hidden Fates (with the Shiny Vault),
[sm12](sun-moon-sm12.md) Cosmic Eclipse, [smp, trainer kits and McDonald's
2017 to 2019](sun-moon-smp.md).

Also: [achievements and mastery](sun-moon-achievements.md) (the Alola ladder,
GX finish rows, what needs a touch per set) and
[box contents](sun-moon-box-contents.md) (ETB Energy, Premium Collections,
what was held back for a second source).
