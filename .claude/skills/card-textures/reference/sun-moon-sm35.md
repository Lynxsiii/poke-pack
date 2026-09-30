# Sun & Moon: Shining Legends (sm35)

Built 2026-09-30 (builder b2). Research: `/mnt/project-files/sun-moon/research/sm35.md` plus the tail section of
`second-source-check.md`. pkmn.gg lists 81 entries (78 printed + `10a`, `68a`, `77a`); the data file holds 101 cards:
80 of them (68a left out), the 8 reverse Energy and 13 promo cards.

## Pack
Eleven cards: basic Energy (`sm17` print), 5 Commons, 3 Uncommons, a reverse slot, a rare slot that is ALWAYS holo or better
(no plain Rare exists: TCGplayer group 2054 lists none; Elite Fourum post 144 https://www.elitefourum.com/t/39762/144
"all of these cards come in the rare slot"). The six Shining Pokémon are rare-slot cards (`Rare Shining`, `shining` in
`smSlots`), not reverse: measured 8.86% of packs (burpies n=1,536; Derium n=1,002; sturzflugbombardieru n=330) is what 32 of
360 rare-slot positions give. The reverse slot is a reverse holo of a Common/Uncommon/Rare Holo, or (7%) a reverse basic
Energy: the data carries 8 `sm35-energy-<type>` cards (`reverse: true`, `energy: true`, the 2017 Energy faces; no Fairy, the site has none) for
the engine's `reverseEnergy` pool. No TCGplayer listing exists for them, so they have no `market` (they sell at the Energy fallback).
Rates (data/pullrates.json): holo .7255 (remainder), GX .1189, Shining .0886, full art .0425, rainbow .0157, gold (tube Mewtwo-GX) .0088, reverse Energy .07.
The rainbow/gold split is E2's raw per-card counts (22 : 11, own + Derium) and burpies (23 : 14), not the equal-per-secret sheet rule (second-source-check.md section 6).

## `a` prints
pkmn.gg files `10a` Entei-GX, `68a` Ultra Ball and `77a` Zoroark-GX beside the set. `68a` is a League Cup prize with no
product anywhere: left out (scans removed). `10a` (Legends of Johto box, used by sm5 through `like: "sm35:10a"`) and `77a` (Hidden Fates' Poké Ball
Collection [Shiny Zoroark], sm115.md) stay with `promo: true` (out of the pools), `era: "sm"`, `foilAs` = their rarity, `market` copied from the
base card (TCGplayer lists no separate print) and no foil map. No product of sm35 itself holds them, so they are unobtainable in this
set's own boxes: mastery of sm35 needs them (lead's call, see the report).

## Maps
TCG Live key `sm3-5` (numbers line up with the site's). 42 of 45 holo/foil prints have a foil map; the 14 full-art, rainbow, gold and Shining
prints have an etch map too (20 etch maps with the promos). No map: 10a, 77a, the 28h Pikachu reprint. Checked by overlaying every map on its
scan. The promos map through `smbsp` (SM70 = smbsp 70 and so on, checked on the sheet).

## Products (data/sets/sm35.json)
Built (priced by TCGplayer): Elite Trainer Box (10 packs, SM70 Shining Ho-Oh), the four Pin Collections (SM76 Pikachu, SM77 Mewtwo, SM89 Zoroark,
SM93 Marshadow), Super-Premium Collection [Ho-Oh GX] (10 packs, SM79 Shining Celebi, SM80 Ho-Oh-GX, SM81 Pikachu, SM82 Shining Lugia), Premium Powers
Collection (8 packs, same four), Special Collection [Zoroark GX] (SM83, SM84), Special Collection [Raichu GX] (SM90 and the holo Pikachu 28, `28h`),
the two Shiny Darkrai GX boxes (4 packs each; their promo is Burning Shadows 88a, not built here). Left out because TCGplayer has no market price
for them: the Collector Chest (152603, SM86 to SM88) and the Shiny Zygarde GX Box (169543, SM122). Finishes: Shining for SM70/79/82, Rainbow for
SM80 (printed rainbow full art), full art for SM84/SM90, holo for the rest. Sources per row are in the research note (TCGplayer text, ToyWiz, Bulbapedia).
The Shining Legends ETB is 10 packs (TCGplayer text + Bulbapedia); a booster pack is $109.79 and the ETB $1,183 on TCGplayer today.

## Oddities
- `Rare Shining` needs the engine pool and `sm-shining` finish added on master (#109); nothing else of the engine is touched here.
- Wrappers: Genesect, Mewtwo, Mew, Rayquaza; opaque from pokesymbols, cut with clean_pack_art.py and shipped as `-v2` only.
