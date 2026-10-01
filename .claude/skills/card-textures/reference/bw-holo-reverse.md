# Black & White: Rare Holo, reverse holo, Dragon Vault, plain glare (g1)

Built 2026-10-01 by finish agent g1 (branch `bw/g1`). Owns `css/holo/bw.css`, `js/bw-foil.js`, `assets/foil/bw-tinsel.webp`,
`assets/foil/bw-reverse/`, `scripts/make_bw_tinsel.py`, `scripts/make_bw_reverse.py`. Photos and sources:
`/mnt/project-files/every-era/bw/texture-refs/g1/` (SOURCES.txt there names every claim's sources).

## The brief was wrong about the holo
The BW brief said "cosmos window holo". It is **Tinsel**: the standard Rare Holo of the whole era is a field of fine HORIZONTAL
ridge lines in the art window (Collexy's BW holofoil overview, CardVeil's pattern guide, Pokumon's Tinsel list: three
sources; Bulbapedia was unreachable, 403). Cosmos survives only on some promos. Dragon Vault is Tinsel on all 21 cards.
The Pokemon in the window is **matte** (the foil is the background ridges; TCG Live's per-card map agrees).

## What the real cards do
- **Rare Holo (Tinsel).** Flat scans show the window as fine scan-line ridges, pitch about 1.3% of card height, shades of the
  type colour. Tilting: colour bands slide sideways across the lines, individual lines flare one after another; frame, text,
  name bar stay plain print.
- **Dragon Vault.** Same Tinsel, stronger and more saturated; the Trainers (Exp. Share) have it in the window too.
- **Reverse holo, bw1.** A plain mirror: the body is a flat sheen in the card colour, mottled, with wide pale vertical bands that
  move; art window and name bar matte, border matte. No pattern.
- **Reverse holo, bw2 on (Energy pattern).** Big shaded outlines of the type symbol, 2-3 sizes, over the whole body (stat lines
  and text box included); Trainers carry Poke Balls; Special Energy have a big star-in-ball pattern; Team Plasma cards (bw8-bw10)
  carry a Team Plasma shield in the middle of the text area. Window matte, Pokemon art untouched.
- **Radiant Collection (bw11 RC1-RC20).** Confetti holofoil: a mosaic of small irregular chips (about 1.6% of the card wide), each its
  own colour and brightness, over the art window with the Pokemon matte (Collexy overview section 9; scans of RC10 Gardevoir and the
  McDonald's 2011 Blitzle). RC10 also carries a lace / star pattern on its body, which is not drawn here.
- **Plain Common / Uncommon / Rare.** Not foil, only ordinary gloss.

## The recipe (css/holo/bw.css)
Selectors are `body.fx-holo.fx-holo.fx-holo .tcg.era-bw` with `.era-bw` x5.
- **Tinsel** (`.bw-holo .foil`): `assets/foil/bw-tinsel.webp` (128x256 grey tile: 64 random ridge values, a few dark gaps, a slow wobble
  per row; made by `make_bw_tinsel.py`, seamless, random so it has no frequency to alias) drawn at 1.5 CSS px a row, multiplied
  with a 450%-wide horizontal spectrum (bright green / gold / cyan / silver / magenta bands between wide dark gaps, sliding
  with `--background-x`) and a pointer pool, `mix-blend-mode: color-dodge`, chain `brightness(1.05) contrast(1.6) saturate(1.7)
  contrast(0.8)`. `::before` is a second copy of the ridges offset 31.5 px, screened, fading in with the tilt, so lines flicker one
  by one; `::after` is a light glitter sand. The window clip comes from the engine's art mask, so frame and text stay clean.
- **Dragon Vault** (`.bw-vault`): the same with `brightness(1.12) saturate(2.1)` and a brighter second copy.
- **Reverse** (`.foil-reverse.bw-rev`): mask = `var(--art)` intersected, then the `--bw-layout` mask added (Basic, Stage with its
  evolution notch, Trainer) = card minus art window and the symbols that are never foil. Texture = `--rev-pattern`, the per-type tile in
  `assets/foil/bw-reverse/<type>.webp`, built by `make_bw_reverse.py` as the per-pixel median of ~14 (Darkness, Dragon: up to 60)
  TCG Live reverse maps of that type (the pattern is identical for every card of a type, median difference about 3 grey levels), floor
  stretched to 0. Multiplied with a diagonal spectrum band and a pointer pool, colour-dodged, `contrast(1.7) ... contrast(0.8)`.
  bw1 (`bw-rev-plain`) swaps the tile for a flat grey so the sheen is plain. Dark bodies (Darkness, Metal) re-screen the tile in `::after`.
- **Radiant Collection** (`foil-holo bw-rc`, from `bwPattern`): TCG Live has no map, so `bwMap()` returns a drawn window mask
  (`assets/foil/bw-rc/window-basic.webp` or `window-trainer.webp` for Elesa; cut from the hole in bw1's plain reverse map by
  `make_bw_rc.py`). The chips are `assets/foil/bw-confetti.webp` (256 px Voronoi mosaic, a colour and a brightness per chip, a third
  dark, thin seams), 45% of the card wide, multiplied with a pointer pool and colour-dodged (`contrast(1.5) ... contrast(0.8)`); a
  second copy, offset and hue-turned, is screened on and fades in with the tilt so other chips catch the light. The Pokemon is NOT
  kept matte (no map to say where it is): the chips run over it too. RC11 (EX) and RC21-RC25 belong to the EX and full-art families.
- **Dragon Vault stamp promos** (`dv1-<n>-dvstamp`): `bwPattern` returns `foil-none`; their scans are photos of the foil card.
- **Plain glare** (`.tcg.foil-none.era-bw .glare`): overlay radial, dark end held at 0.3 so the thumb pose does not shade the card.
- **JS** (`js/bw-foil.js`): `bwReverseFinish` returns `bw-plain` for bw1, else `bw-<kind>`; `bwReverseExtras` returns the classes and
  `--bw-layout` / `--rev-pattern`; hooked into `foil-maps.js` with one line.

## Found along the way
- TCG Live serves **reverse maps**: `.../en/<key>/<key>_en_<nnn>_ph.foil.png` (367x512 RGBA). bw1's are a plain white mask; bw2+
  carry the shaded symbol pattern; layouts differ (Basic, Stage, Trainer, Special Energy). `fetch_foil_maps.py` does not fetch these;
  `make_bw_reverse.py --cache` downloads them. Other eras with reverse patterns may have them too.
- `assets/foil/bw-tinsel.webp` is reusable (g2's Ace Spec borders).

## Mistakes made and fixed
- First tile attempts kept text residue (names, HP, stats) in the median: Darkness and Dragon needed many more maps plus a grey closing
  in the text zones; a plain median filter destroyed the symbol outlines.
- A flat 100%-wide spectrum made the foil a uniform wash: the 450% spectrum with dark gaps gives travelling bands.
- Reverse at the first strength washed out text (Growlithe 30:25): tempered to contrast 1.7, opacity 0.35 + 0.4 x card opacity,
  glare 0.45.
- A mask-composite written for Chromium only; both prefixed and standard forms are now set (WebKit renders the same).

## Verification
Chromium and WebKit at 220 px x 3: Tinsel (Virizion, Victini, Emboar, Reshiram, Serperior, Dragonite, Rayquaza, Fraxure), plain reverse
(Blitzle, Pansear, Lillipup), pattern reverse (Cottonee, Simipour, Growlithe), Trainer reverse (Bianca, Great Ball), Special
Energy (Double Colorless, Prism), Dragon Vault. Poses rest, 30:25, -30:-20. `foil_coverage.mjs` prints nothing for bw1-bw11, dv1, bwp; `sweep_finishes.py` (with its dark-speck pass) clean for the sets that
rendered under load; `check_asset_overwrites.py` flags only `assets/packs/sources.json`, a builder file. Contact sheets: `/mnt/project-files/every-era/bw/finish-sheets/g1/`.

## What still looks off
- Radiant Collection: the chips cover the Pokemon (no silhouette to mask by) and the lace body pattern of RC10 is not drawn; the chip
  look comes from two scans only. McDonald's 2011/2012 Confetti (same pattern) still uses the older shared `foil-confetti` recipe.
- No macro photo of a BW holo was found, only scans and phone clips; the line pitch and flare rate are judged from those.
- The Trainer and Special Energy reverses are the least photographed finish (medium confidence); basic Energy reverses (bw1 Double
  Album Box prints) have only one source.
- Rest-state Tinsel is faint on very pale art.
