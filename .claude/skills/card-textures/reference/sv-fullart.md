# Full-art Ultra Rare and gold Hyper Rare (shared Scarlet & Violet finishes)

Built once for every Scarlet & Violet and Mega Evolution set with TCG Live
foil maps (2026-09-27, from the Paradox Rift thread). Rules:
`css/holo/sv-fullart.css`. No JS hook: the cards already carry
`foil-ultra` / `foil-gold` from `foilPattern()` in `js/app.js`, and the rules
only match with `has-foil-map`. A set without maps keeps the older recipes
(`rarities.css`, `realism.css`).

## Which cards

| Finish | Cards | TCG Live (Paradox Rift) | Site classes |
|---|---|---|---|
| Full-art Ultra Rare | rarity `Ultra Rare`, not Tera | `SUN_PILLAR` / `ETCHED`, print id `..._UltraRare_SunPillar_Etched` (23 cards) | `foil-ultra has-foil-map has-etch-map`; Supporters also `foil-trainer` |
| Gold Hyper Rare | rarity `Hyper Rare` or `Mega Hyper Rare` | `SV_ULTRA` / `ETCHED`, print id `..._HyperRare_SvUltra_Etched` (7 cards) | `foil-gold has-foil-map has-etch-map` |

Tera Ultra Rares (`UltraRareC`, `SV_ULTRA`) stay with `sv-finishes.css`; a
Tera Pokémon's gold Hyper Rare is an ordinary gold card. The Classic
Collection's full-foil cards (`foil-ultra foil-classic`) are excluded too.

The whole Paradox Rift tally, for comparison: Rare `SV_HOLO`/`HOLO`, Double
Rare `SUN_PILLAR`/`HOLO` (cast and cure SouthernCross), Illustration Rare
`SUN_PILLAR`/`HOLO`, Special Illustration Rare and Hyper Rare
`SV_ULTRA`/`ETCHED`, reverses `FLAT_SILVER`/`REVERSE`. So the Ultra Rare is
the Double Rare's sun pillar foil, etched instead of windowed; the gold card
is the SIR's foil under gold ink.

## Full-art Ultra Rare

- **Where** (foil map): the whole card; the Pokémon at part strength, the
  attack text and rule box lighter.
- **Etch**: fine lines following the art (flames, hair, cloth), over about
  nine tenths of the card. The etch map is white with alpha (mean alpha
  about 0.47).
- **Pattern**: pokemon-cards-151's `ex-full-art.css`: vertical sunpillar ramp
  (`hue`) over 128.5deg tinsel bars (`hard-light`) over a pointer darkener,
  with the card's `--mask` and `--foil` (etch) as `soft-light` images on top,
  `brightness(pfc*.4+.5) contrast(2.5) saturate(.66)`, and an `exclusion`
  twin on `::after` running the bars the other way.
- **Porting the soft-light etch**: upstream's etch image is opaque grey (black
  where uncut). Ours is an alpha map, and a background layer can't be
  "etch over black, then soft-light" in one element. So the two cases are
  split by where the etch is: `.foil` draws the stack under a white and a
  black soft-light (the foil between the lines), and `::before` draws the
  same stack under two white soft-lights, masked by `--etch-map` (the cut
  lines, a step brighter). Put the stack in custom properties on `.foil`
  (`--fa-pillar`, `--fa-bars`, `--fa-dim`, `--fa-pos`) so both layers line
  up; `::before` inherits them, `::after` restates `--fa-pillar` so its ramp
  picks up the rotated sunpillar colours base.css gives `::after`.
  (Custom properties resolve `var()` where they are declared.)
- **Glare**: upstream's hard-light radial. Upstream gives Supporters a
  flatter, brighter one; on a pale full art it hazes the face (sv1 238
  Miriam, found by the SV base thread), so every Ultra Rare gets the plain
  one. The etch hot spot `celebration.css` gives every etched card is a
  white disc in a hard-light glare on a card this etched, so it is smaller
  and fainter here, and still washed the Supporter text box at 0.7; 0.5 is
  right.
- **The printed outline**: Paradox Rift's full arts print a teal outline
  around the Pokémon (Armarouge, Roaring Moon). It is ink, not a foil
  artifact; check the raw scan before chasing it.

## Gold Hyper Rare

- **Where**: nearly the whole card (map mean alpha about 0.8); etched like
  the Ultra Rare.
- **Pattern**: pokemon-cards-151's `hyper-rare.css` is its SIR recipe: 15deg
  rainbow, two light bars crossing with the tilt (`hard-light`), iridescent
  glitter, a multiply glare, and `glare2`: white masked by the etch, so the
  cut lines light up across the whole card, not just under the pointer.
- **Recipe**: the SIR-with-map port from `celebration.css`, dodged paler,
  `brightness(.5) contrast(1.5) saturate(.45)` (resting `saturate(.3)`), and
  a `.glare::after`
  whose etch-masked white never falls below 0.3 alpha (upstream's glare2).
  Inside the multiply glare, white means "not dimmed", so the lines read
  bright against the rest.
- **Bright gold goes orange.** Upstream dodges the rainbow at
  `brightness(.6) saturate(1)`; its red and magenta slices push the red
  channel to full, and sv1's brighter golds (253 Miraidon ex, 254 Koraidon
  ex, the near-white gold energies 257/258) turn orange and red when lit.
  `soft-light` and `overlay` keep the hue but go orange-brown in the
  shadows. The paler dodge above stays gold with a rainbow tint on sv1, sv4
  and sv5 (found by the SV base thread; see its `scarlet-violet.md`).
- **Before this**, the old gold recipe (`rarities.css`, conic gradient plus
  `--holo-metal`) drew horizontal scanlines on mapped cards.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv4&cards=218,229,240,260,264&poses=rest,30:25,50:50,75:70&proof=off" --out /tmp/fullart.png
```

218 Armarouge ex and 229 Roaring Moon ex (Pokémon Ultra Rares), 240
Professor Turo's Scenario (Supporter Ultra Rare), 260 Garchomp ex and 264
Counter Catcher (gold). Add `&w=420` to see the etch. Brightest golds and a
pale Supporter: `set=sv1&cards=253,254,257,238&poses=30:25,70:60`.
