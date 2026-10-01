# EX generation (2003-2007: ex1 to ex16, np, pop1-pop5, extk1a to extk2b)

Built on 2026-10-01 by the "Every era, every set" thread: a scaffold agent
(s-ex), five set builders (e1 to e5; e5 took the promos, POP and kits), three
finish agents (i1 to i3) and a fresh-context reviewer per family (rv-i1 to
rv-i3). Era overview; every set and finish family has a note of its own,
linked at the end. Read this first, then the set or family note you need.

## Shape of the era

| Piece | Where |
|---|---|
| Era plumbing (`isEx`, `exPattern`, `exRefractor`, `isCrackedIce`, `exMap`, `exExMap`, `exWindow`, `exDeltaMap`, `EX_REVERSE`, `exReverseFinish`, `exReverseExtras`) | `js/ex-foil.js` (hooked into `js/foil-maps.js` and `js/app.js`); `exMap()` tries `exExMap`, then `exWindowMap`, then `exDeltaMap`, each returning "" for prints that are not its own |
| Three finish sheets, keyed by `era-ex` repeated five times | `css/holo/ex.css` (cosmos window holo, the reverse families, Unown, non-ex secrets, kit holos), `ex-ex.css` (Pokémon-ex, Gold Star, cracked ice), `ex-delta.css` (refractor "Holon" holos, sheen Energy) |
| Pack slots | `exSlots({...})` in `js/catalog.js`: 9 cards, ex1-ex3 the early layout (4 Commons, a fifth slot of common / Energy / holo / ex / secret, 2 Uncommons, a Mirror reverse, a rare slot that is always a plain Rare), ex4 on the late one (5 Commons, 2 Uncommons, a reverse, a rare slot of Rare / holo / ex / Gold Star / secret); `popSlots({rare, rareAt})` for the 2-card POP packs |
| Foil maps | **TCG Live published none for 2003-2007** (probed keys ex1-ex16, ex-1, rs1, exbsp, np), so everything is drawn: `assets/foil/ex-win/` (`make_ex_window_masks.py`), `ex-ex/` (`make_ex_ex_masks.py`), `ex-delta/` (`make_ex_delta_masks.py`, hints in `make_ex_delta_hints.json`) |
| Tiles | `assets/foil/ex-cosmos-v2.webp` (`make_ex_cosmos.py`), `ex-cracked-ice-v1.webp` (`make_ex_cracked_ice.py`), the reverse families under `assets/foil/ex-reverse/` and `stamp-soft-v1.webp` (`make_ex_reverse.py`) |
| Promos | `np` pseudo-set (`NP_PROMOS`), `exPopSeries` (pop1-pop5), side sets `extk1a/1b/2a/2b`; data only, no CSS of their own |
| Research, photos, sheets | `/mnt/project-files/every-era/ex/research/`, `texture-refs/<family>/SOURCES.txt` (i1, ex-ex, i3), `finish-sheets/`; the scaffold's decisions in `ex/SCAFFOLD-NOTES.md` |

## Finish families

| Family | Classes | Mask and recipe | Note |
|---|---|---|---|
| Rare Holo, cosmos: sparse blocky pixel shapes (dots, snowflakes, pluses), each lit in one saturated colour, in the art window only; Emerald's six holo Energy are cosmos too | `foil-holo ex-cosmos` (`ex-energy`, `ex-unown`, `ex-secret`, `ex-kit`) | `ex-win/{pokemon,pokemon-evo,trainer,energy}.webp` (`-i` variants for ex3 and ex6, whose scans sit about 5% zoomed out); the Evolves-from circle is cut out | [ex-holo-reverse.md](ex-holo-reverse.md) |
| Reverse holo: ex1-ex4 the Mirror (whole card but the art box); from ex5 the pattern sits inside the art box, one per set: Energy columns (ex5 big, ex6 medium, ex7 small), wheel (ex8), Poké Ball (ex9, ex10), plain sheen (ex11, ex13-ex16), cosmos (ex12) | `EX_REVERSE` families | mask = tile AND (window MINUS the set-logo stamp box); stamp boxes `EX_STAMP` for ex7-ex16, soft-edged | same |
| Pokémon-ex, secret ex: cosmos in the window AND on the silver frame; name plate, text, stats and tab flat | `foil-ex ex-ex[ ex-secret]` | `ex-ex/ring-<frame>[-s]-<basic\|stage>` (frames A, A2, B measured per set) | [ex-ex.md](ex-ex.md) |
| Gold Star, Unown, non-ex secrets: cosmos in the window only, yellow border plain | `foil-ultra ex-star`, `foil-holo ex-cosmos ex-unown`, `ex-secret` | `ex-ex/win-<A\|B>-<basic\|stage>`, `win-trainer` | same |
| Cracked ice: Regice, Regirock, Registeel ex (ex5), the secret Articuno, Moltres, Zapdos ex (ex6): the whole face a sheet of flat angular facets | `ex-cracked-ice` | the ring map plus two screened copies of the ice tile | same |
| Refractor ("inverse", Holon): the Pokémon is the foil, the background is flat print; 64 prints (all of ex11 and ex13 holos, the Gyarados star, ex14's Blastoise, Charizard and Ludicolo delta holos and the Sceptile ex delta, all of ex15) | `ex-refractor` | per-card silhouette `ex-delta/<card id>.webp`, a narrow band plus a specular streak | [ex-delta.md](ex-delta.md) |
| Sheen Energy (ex13 105-110, ex16 103-108): plain reflective foil, one slanted rainbow band over a white-hot core | `ex-sheen ex-energy` | `ex-delta/energy-art.webp` | same |
| Plain Rare and POP in-pack cards: not foil (Commons and Uncommons carry no class) | `foil-none` | none | [ex-promos-pop-kits.md](ex-promos-pop-kits.md) |

Where each set's reverse and refractor rules differ is in the set notes; the
mixed one is ex14 (refractor decided per card from the scans, `cardFlags`).

## What the independent reviews caught

- **foilAs rewrites a promo's rarity, so the era hooks must key on the
  subtype.** `foilLook()` turns a promo's rarity into its `foilAs` before the
  pattern is read, so every EX promo arrived as a plain "Rare Holo" and drew
  the window cosmos with no ex frame (ex9-np037 to np039, ex11-np031 to np033,
  np001, np002). `exPattern` and `exExMap` now read the ex subtype; np001
  Kyogre ex and np002 Groudon ex (yellow border) take the art window alone.
- **Chunky cosmos.** The first tile's glints were 4-6 times the size of the
  real foil's fine sparkle and read as game-pixel plus signs: the first thing
  seen on every Rare Holo, Unown and non-ex secret. `ex-cosmos-v2.webp` has 3
  px cells, shapes half the size, 1.5 times as many, the same 10.5% coverage.
  Do not go below 3 px cells (they alias at 220 x 3) or double the density
  (the sparkle becomes a veil that greys the art).
- **The Mirror was a seven-band rainbow barcode** over the name bar and rules
  text; the tilt clips show two or three soft pastel hues at once. Bands are
  2.4 times wider now.
- **A hard-edged hole in the pattern reads as a dark box.** The set-logo stamp
  cut-out was a rectangle (ex8 Donphan, ex10 Curse Powder): now a rounded
  alpha-only soft box. The site's scans carry no logo, so the hole is all
  there is.
- **A refractor band drowned the print's colours.** A mask band's width is a
  share of the LAYER and the layer is 200% wide: a 14% stop span painted 28% of
  the card at 0.5 opacity in screen, plus an overlay at 0.7 and an all-over
  sweep, and Latios became a rainbow smear. The band is a fifth of the card
  now, softer, with a 3% white specular in its core, and the print stays
  readable; the sheen Energy had the same arithmetic. **Judge a glare by the
  share of the print it covers at tilt, not by how it looks at rest.**
- **Silhouette masks need a per-card look.** GrabCut seeds failed on four
  cards (Charizard star lit its black background and lost both wings;
  Deoxys delta, Ninetales, Kabutops) and were redrawn as `-v2` files
  (`DELTA_V2`); `cv2.setRNGSeed(7)` makes a redraw repeatable, but the other
  59 masks were drawn before the seed.
- **Wrong frame, wrong mask.** ex3's six evolved ex are filed Basic and took
  the `-basic` mask (circle foiled, BASIC tab cut): `exExLayout` reads
  `evolvesFrom`. The ex11 np031-np033 promo ex took ex11's refractor rule and
  drew hard white bars over the window: `exRefractor` ignores `-np` ids.
- **A window map that returns "" is a rectangle.** Emerald's holo basic
  Energy drew foil only inside a visible box with a seam because
  `exWindowMap` returned "" and the Energy clip applied;
  `ex-win/energy-full-v1.webp` is its map.
- **The scans carry the foil.** Judge the added foil against the render with
  `.foil, .glare` hidden. Measured pixel by pixel on every Pokémon-ex frame,
  `.foil` changes nothing outside its mask (name plate, text box, stats, tab,
  dot strip: mean 0.00); only `.glare`, the era's whole-card gloss, shows
  there (+1 at a tilt, +11 to +13 with the thumb on the text box).
- **Dodge chains end in `contrast(0.8)`** (WebKit divides by zero); the
  reverse families, ex-ex and ex-delta use `screen`, `overlay` and `multiply`
  instead. `clamp()` in `mask-position` mis-paints
  in Chromium: the band positions are plain `calc()`. An undefined `var()`
  voids a whole mask list, so the basic Energy has its own art-only rule.
- **The sweep read data, not hooks.** `sweep_finishes.py` exempted only DP and
  SM from "window holo promo with no foil map" and flagged every np, POP, kit
  and in-set np promo; the exemption now covers `ex\d|np-|pop[1-5]|extk|tk[12][ab]`.

## Open items

- **POP has no holo to render.** In-pack POP cards are `foil-none` on a single
  source; the holo prints are blister, tin and value-pack products that are
  not built. Armaldo ex (POP 1) and the POP 5 Gold Stars may have been foil in
  the pack: unresolved. A POP Pokémon-ex with `holo: true` (Tyranitar ex,
  POP1 17) would draw `ex-kit` with no window map: send it to the ex-ex
  finish if such a print is added.
- **Evidence.** Ring width and sparkle strength were judged from low-resolution
  clip frames, the dot strip on Pokémon-ex is single-source (Collexy), the
  Delta holo border sheen rests on three clips (alpha 0.3, barely visible), the
  refractor is drawn smooth with no macro, and no poke-holo.simey.me benchmark
  exists for the era.
- **Masks to look at again.** Silhouettes are derived from scans: soft edges of
  flames and lightning approximated; 59 of the 64 have no review redraw and a
  few straight edges where a hint polygon met the window edge (ex15-10 Snorlax,
  ex13-5 Deoxys, ex14-96 Sceptile ex). The unused first-draft files
  ex13-4, ex13-9, ex15-8, ex15-95, ex15-100 (no `-v2`) are dead weight if
  nothing is served from them: delete before a push if they never reached origin.
- **Not drawn (print, not foil).** The reverse stamp is only a gap, no logo
  (ex8's wide DEOXYS box is the most visible); the ex5/ex6 Rare and Holo Rare
  reverse type or Poké Ball stamp, the later golden borders and gold names.
- **ex12 93 Pikachu delta.** The handoff recorded it over the dark-speck budget
  (243 specks at 30:25) under the refractor recipe; ex12 is cosmos throughout
  and is outside the per-set refractor rule, so re-run `dark_specks.py` on it.
- **Card data.** ex14's mixed finish (delta cards refractor, the rest cosmos)
  and ex11's Azumarill secret (finish stated by neither source, defaults to
  cosmos) are low confidence. The `reverseTwice` card names are not in the
  research (only ex4's Double Rainbow Energy and ex12's 27 Commons are listed).
- **Judgement items for Noah** (handoff): the whole EX era has no theme decks
  (no lists, no prices); NP6, NP7, NP23, NP27, NP28, NP36 are unpriced and not
  built; vintage sealed prices are huge but real thin TCGplayer numbers (the
  ex7 box about $108k, POP 5 $2,290 a pack).
- **Process.** In a sparse worktree run `mirror_images.py`'s per-set function
  only, never its CLI with a set argument (it re-encodes every shared Energy
  and set logo).

## Sets, oldest first

[ex1](ex-ex1.md) Ruby & Sapphire, [ex2](ex-ex2.md) Sandstorm,
[ex3](ex-ex3.md) Dragon, [ex4](ex-ex4.md) Team Magma vs Team Aqua,
[ex5](ex-ex5.md) Hidden Legends, [ex6](ex-ex6.md) FireRed & LeafGreen,
[ex7](ex-ex7.md) Team Rocket Returns, [ex8](ex-ex8.md) Deoxys,
[ex9](ex-ex9.md) Emerald, [ex10](ex-ex10.md) Unseen Forces,
[ex11](ex-ex11.md) Delta Species, [ex12](ex-ex12.md) Legend Maker,
[ex13](ex-ex13.md) Holon Phantoms, [ex14](ex-ex14.md) Crystal Guardians,
[ex15](ex-ex15.md) Dragon Frontiers, [ex16](ex-ex16.md) Power Keepers,
[np, POP 1-5 and the EX Trainer Kits](ex-promos-pop-kits.md).

Finish notes: [ex-holo-reverse.md](ex-holo-reverse.md),
[ex-ex.md](ex-ex.md), [ex-delta.md](ex-delta.md).
