# Family sm-holo: the Sun & Moon Rare Holo

Module `js/fam/sm-holo.js`, sheet `css/holo/fam/sm-holo.css`, assets `assets/foil/fam/sm-holo/`, generators
`scripts/fam/sm-holo/`. Built 2026-10-22 (holo accuracy overhaul, round 1) from the audits w2-sm-holo-a and
w2-sm-holo-b (reports and comparison sheets in `/home/user/holo-work/w2-sm-holo-{a,b}/`, photos in
`/home/user/holo-refs/w2-sm-holo-{a,b}/` with `SOURCES.md`).

## Scope

Every non-reverse Sun & Moon face whose era finish is `foil-holo sm-holo` (smPattern() in js/sm-foil.js): 404 faces on
2026-10-22, the same 404 the old census painted with sm.css's two window-holo blocks (sm1-sm7, sm35, sm75, sm1-sm7
promos without `sm-late`, 217; sm8-sm12, sm115, det1, mcd19 and SM120+ promos with `sm-late`, 187). The module adds
`fam-sm-holo` and the finish class:

- `smh-window` (368 faces): the booster Rare Holo, both halves of the era.
- `smh-confetti` (36 faces): McDonald's Collection 2017, 2018, 2019.

sm.css's window-holo blocks stay in place for `?fam=off`; this sheet outranks them (fifteen classes before the layer,
seventeen at rest, against fourteen).

## The real finish (photos win over text)

| Fact | Sources | Confidence |
|---|---|---|
| Only the art window's background is foil; the Pokémon, frame, text box and border are matte. TCG Live's std.foil map is right, Pokémon knocked out. | Gigalith sm1 71 (era/zoom-gigalith-window.jpg), Vileplume sm3 6, Charizard sm75 3, Meganium sm8 8, Vaporeon sm115 18, Celebi sm11 4, Lickitung det1 16 | high |
| Tilted, the window background throws broad, saturated rainbow bands, several hues across the window at once (Gigalith: blue-violet left, magenta centre, yellow-green right; Meganium: cyan, pink, yellow, violet; Vileplume: gold and yellow-green, magenta in the dark leaves), with a white(-gold) hot spot where the light hits (Charizard's flame burst). Mid-tone and pale art change completely; very dark art hides it (Alolan Persian sm1 79). | the same photos and in-hand frames; Meganium frame measured at 5 saturated hue families, saturation 109 | high |
| Lost Thunder to Cosmic Eclipse is the same foil. The old "satin pool" note (sm.css) is contradicted by Meganium sm8 8, Lugia sm9 131, Dragonite sm9 119, Vaporeon sm115 18, Celebi sm11 4. Text sources name one pattern, "Water Web", for Sun & Moon to Cosmic Eclipse. | photos in w2-sm-holo-b/common, sm8-8, sm11-4, sm115-18; Bulbapedia quoted at elitefourum.com/t/completionist-help-water-web-holo/23534 | high (photos), medium (name) |
| Pattern: a fine dense pinpoint sparkle and a few thin, long, straight light streaks over the rainbow; curved arcs on Celebi. No cracked-ice facets in any photo. The micro-structure of "Water Web" is not resolved by the photos. | Gigalith and Charizard zooms, Celebi zoom | medium |
| Near the light the foil goes silver-white with pastel pink and green (Moltres sm9 19). | sm9-19/video-tilt-window-silver-pastel-wash.jpg | medium |
| McDonald's 2017-2019 are Confetti Holofoil: irregular 4-7 sided polygon flakes about 5 CSS px on a 220 px card, each its own colour (silver-white, pink, mint, cyan, copper), lighting on its own; no broad rainbow. Only the window background; the Pokémon is matte. The scans print the flakes. | Pikipek mcd17 11 scan, Pikachu mcd18 4 in hand and angled, Psyduck mcd18 2, Caterpie and Pikachu mcd19 scans; Bulbapedia "Confetti Holofoil" | high |
| TCG Live's maps of all 36 McDonald's prints are a plain white window (Pokémon included). | assets/foil/maps/mcd1{7,8,9}/*.webp (mean alpha identical) | high |

## The recipe

**Window (`smh-window`).** The foil is seen through the ink: about print x foil colour x light. `.foil` multiplies a
band colour onto the print (`--smh-bands`, 115deg, three cycles over a 280% layer: blue-violet, violet, magenta, gold,
green, cyan, each with its weakest channel near 0.36; white in a soft ellipse under the pointer). A silver-white band
was tried and dropped: it clipped pale windows (Meganium 18% white at 30:25) and washed out Vileplume's colour. The
held `.cure` layer (module `cure: true`) colour-dodges a gain over it: x1.85 everywhere on the foil, about x2.4 in a
warm hot spot under the pointer, with `sparkle-v1.webp` (fixed per card) and `streaks-v1.webp` (sliding against the
tilt) screened into the gain; `contrast(0.9)` closes the chain (Safari's dodge). Net: a band recolours mid tones
strongly, tints pale ink without bleaching it (one channel pulled down, another pushed up), and dark ink stays dark.
Both layers are masked by the scan and the foil map stacked twice (alpha a -> 1 - (1 - a)^2): Live holds inked
backgrounds at 0.25-0.7 (Charizard's sky 0.4), the Pokémon at 0 stays matte. At rest `.foil` soft-lights the bands at
0.42 (a faint rainbow, no haze). `.glare` is a faint white screen gloss (no dark end, no grey lift).

**Confetti (`smh-confetti`).** Three aligned Voronoi flake tiles (`confetti-{a,b,c}-v1.webp`, make_confetti.py: 484
cells per 384 px tile, shown at 50% of the card width, so about 5 CSS px a flake), each lighting a different quarter of
the same cells, hard-light around neutral grey. `.foil` holds a, `::before` fades b in with `--pointer-from-left`,
`::after` c with `--pointer-from-top`, so different flakes flash at different tilts; the tiles pan about one flake.
35 of the 36 prints take a map drawn from the scan (`maps/<id>-v1.webp`, make_confetti_maps.py: the McDonald's scan
minus the registered main-set scan of the same art, high-passed at flake scale; where they differ the confetti is
printed). Four (mcd17-1 Rowlet, mcd17-9 Alolan Diglett, mcd18-3 Horsea, mcd19-9 Onix) are cut by a GrabCut fallback on
the main-set scan, seeded with the difference map; Rowlet's stump and Diglett's rocks come out matte with the Pokémon
(a guess: the scans do not settle whether the foreground props are foil). Three more (mcd17-2 Grubbin, mcd19-1
Caterpie, mcd19-11 Alolan Dugtrio) are GrabCut on the McDonald's scan from a hand-set box (BOX).

**Detective Pikachu 1-18** have no TCG Live map. The safe map (a centred oval matte) foiled off-centre Pokémon
(Bulbasaur's head) and left background matte; each now has a map cut from its scan (`maps/det1-<n>-v1.webp`,
make_det1_maps.py: GrabCut inside the art window from a hand-set box around the Pokémon). Same window recipe.

## Measured (WebKit, 220 px x3, Vileplume sm3 6 window, glare hidden, against a no-foil render, 2026-10-23)

| pose | before (live): mean abs change, saturation | after |
|---|---|---|
| rest | 2.3, +0.7 | 6.0, +0.8 |
| 30:25 | 8.6, +5.8 | 27.4, +12.9 |
| 75:65 | 6.2, +3.6 | 21.1, +21.3 |
| 50:78 | 6.2, +3.6 | 19.5, +21.3 |

(The window crop includes Vileplume, which stays matte; the background alone changes more. White clipping in the
window stays at about 1%.)

## Open (round 1)

- Confetti map left on Live's plain window (the Pokémon takes confetti): mcd19-2 Alolan Exeggutor (REJECT in
  make_confetti_maps.py: every cut took its sky with the Pokémon). Thin parts of some drawn maps (Pikachu mcd18 4's
  ears and arm) still take flakes.
- The "a" reprints (sm1-101a, sm2-19a, sm3-18a, sm3-92a, ...) have no Live map and ride sm-holo-safe.webp (the window
  with a centred oval matte), which misses an off-centre Pokémon. They need per-card maps like det1's.
- Detective Pikachu maps (det1-<n>-v1.webp) are GrabCut cuts from hand-set boxes: a few take a strip of floor or
  background with the Pokémon (Psyduck 7, Mr. Mime 11, Machamp 13, Slaking 18, Greninja 9's water) and leave a thin
  tail or vine foiled. Good enough for phone size; redraw by hand if a reviewer flags one.
- sm12-smp228 Armored Mewtwo: Live's map foils the whole card but Mewtwo (text box included); the window recipe paints
  the text box. Needs photos and its own handling.
- sm4-28 Regice and sm3-87 Darkrai: the scans are League-stamped prints (stamp foiled); they need unstamped scans
  (data, outside the family).
- Set-logo-stamped promos (smp011, smp019, smp049, smp074, smp097, smp129, smp150, smp158, smp180, smp202, smp219 ...):
  the stamp is foil in Live's maps; SM158's slab photos show the stamp silver-white. Cut with stamp_knockout.py later.
