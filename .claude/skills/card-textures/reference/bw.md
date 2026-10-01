# Black & White era (bw1 to bw11, dv1, bwp, mcd11-12, bwtk5a/5b)

Built on 2026-10-01 by the "Every era, every set" thread: one lead, five set
builders (c1 to c5), three finish agents (g1 to g3) and a fresh-context
reviewer per family (rv-g1 to rv-g3). Era overview; set and family notes are
linked at the end.

## Shape of the era

| Piece | Where |
|---|---|
| Era plumbing (`isBw`, `bwPattern`, `bwMap`, `bwExSafeMap`, `bwEtched`, `bwReverseFinish`, `bwReverseExtras`, `isRadiantCollection`) | `js/bw-foil.js` (hooked into `js/foil-maps.js`) |
| Three finish sheets, keyed by `era-bw` x5 | `css/holo/bw.css` (Tinsel holo, reverse, Dragon Vault, RC confetti, plain glare), `bw-ex.css` (Pokémon-EX regular art, Ace Spec), `bw-fullart.css` (full arts flat bw1-bw3 and textured bw4-bw10, full-art Supporters, yellow and gold secrets, Items, Radiant Collection full arts) |
| Pack slots | `bwSlots({...})` in `js/catalog.js` (10 cards: 5 Commons, 3 Uncommons, a reverse, a rare slot, no Energy slot; `commonEnergy` for the own basic Energy on the commons sheet) |
| Foil maps | TCG Live publishes per-card maps for bw1 to bw11 and dv1 (`assets/foil/maps/<set>/`); none for the Radiant Collection, McDonald's or promos: `assets/foil/bw-rc/window-basic-v2.webp` / `window-trainer-v2.webp` (`make_bw_rc_matte.py`: window times the average of 151 Live holo maps) and `bw-rc-v1.webp` / `bw-rc-fa-v1.webp`; EX safe maps from `make_bw_ex_safe_maps.py` |
| Tiles | `assets/foil/bw-tinsel.webp` (`make_bw_tinsel.py`), `bw-reverse/<type>.webp` (`make_bw_reverse.py --cache`, from Live's `_ph.foil.png`), `bw-brush-v1.webp`, `bw-rc-sparkle-v1.webp`, `bw-confetti.webp` |
| Research, photos, sheets | `/mnt/project-files/every-era/bw/research/`, `texture-refs/<family>/SOURCES.txt`, `finish-sheets/<family>/` |

## Finish families

- **Tinsel Rare Holo**, not cosmos: fine horizontal ridge lines in the art
  window, Pokémon matte, colour bands sliding across the lines. Dragon Vault
  is the same, stronger. Cosmos survives only on some promos (bwp, bw2/bw3
  theme-deck prints), which still draw Tinsel when they have no map.
- **Reverse**: bw1 a plain mottled mirror; bw2 on, big shaded type symbols
  over the body (Poké Balls on Trainers, a Team Plasma shield on bw8-bw10),
  one tile per type, `no-repeat` at 100% so no seam at any tilt.
- **Radiant Collection and McDonald's 2011/2012**: confetti chips in the
  window, Pokémon matte.
- **EX and Ace Spec**: prism bars and brush streaks on the frame and name
  tab, text and Pokémon matte; the Ace's blue border tinsel.
- **Full arts**: flat (bw1-bw3) and textured (bw4 on, Live's etch), yellow
  secrets with ring etch, gold bw11 114/115, Items.

## What the independent reviews caught

- **A keep-both merge can let a later sheet override an earlier family.**
  `bw-fullart.css` loads after `bw.css` with one class more, so its `.bw-rc`
  rules painted every Radiant card and g1's confetti never drew. When two
  families share a class, gate each with what the other lacks
  (`.has-foil-map:not(.bw-rc-fa)`) and check the merged DOM, not the branch.
- **Promos with `foilAs: "Rare Holo"` and no map draw the era's default holo**
  (Tinsel) even where the real card is cosmos or cracked ice; `sweep_finishes.py`
  lists them. A window-only wrong pattern is sane; whole-card foil is not.
- **Gold ink under screened foil goes white.** The EX logo lost half its
  saturation; a third mask layer fades the foil across the name band.
- **Foil strength "intense" changes nothing once lit opacity is 1**: scale
  bars, dust and glare by `max(1, --foil-strength)`.
- **Pale paintings go pastel under a dodge plus a silver glare** (full-art
  Supporters); hold the foil at 70% and halve the glare. **Overlay rainbow
  recolours dark ink** (Emboar olive, Zoroark green): overlay at 0.4-0.65,
  saturate 0.8.
- **Live's bw1-bw3 etch is a silhouette**, not an engraving: showing it draws
  a Pokémon-shaped halo. Probe a holo number when checking whether a set has
  maps, or the whole block looks mapless.
- **An invisible layer is usually a multiplied opacity** (0.22 on a `.glare`
  at 0.35): bisect with `--css` hiding layers, never by guessing.
- Merging a builder branch in a sparse checkout removes tracked files outside
  the sparse set; add the branch's asset dirs first (never a whole
  `ls-tree`).

## Sets, oldest first

[bw1](bw-bw1.md) Black & White, [bw2](bw-bw2.md) Emerging Powers,
[bw3](bw-bw3.md) Noble Victories, [bw4](bw-bw4.md) Next Destinies,
[bw5](bw-bw5.md) Dark Explorers, [bw6](bw-bw6.md) Dragons Exalted,
[dv1](bw-dv1.md) Dragon Vault, [bw7](bw-bw7.md) Boundaries Crossed,
[bw8](bw-bw8.md) Plasma Storm, [bw9](bw-bw9.md) Plasma Freeze,
[bw10](bw-bw10.md) Plasma Blast, [bw11](bw-bw11.md) Legendary Treasures
(with the Radiant Collection), [bwp, McDonald's 2011/2012 and the Trainer
Kits](bw-promos-mcd-kit.md).

Finish notes: [bw-holo-reverse.md](bw-holo-reverse.md), [bw-ex.md](bw-ex.md),
[bw-fullart.md](bw-fullart.md).
