# EX generation: the refractor ("Holon") holos and the sheen Energy (css/holo/ex-delta.css, finish agent i3)

Photos and SOURCES: /mnt/project-files/every-era/ex/texture-refs/i3/. Sheets (Chromium and WebKit, 220 px x 3, poses rest, 30:25, -30:-20, 50:78,
plus `photo-vs-site-webkit.png`): /mnt/project-files/every-era/ex/finish-sheets/i3/.

## What the photos showed
- Refractor ("inverse") holo: the POKEMON itself is the foil, the art background is flat print (Collexy "Holofoil Overview EX Series era" section 3 and
  17 flat scans; Elite Fourum posts 54, 57, 58, 60; Grazskin's tilt clips of Latias, Latios, Feraligatr, Typhlosion, Rayquaza, Flareon, Flygon, Gyarados).
  The clips show a bright specular glare lying across the Pokémon's body (red-white on Latias ex11, orange on Latios, cyan on Feraligatr, rainbow on
  Typhlosion) that moves with the tilt; smooth, no pattern, no grain at that resolution. Prints: all ex11 holos, ex13 holos (not the Energy) and the
  Gyarados star, ex14's Blastoise, Charizard, Ludicolo and Sceptile ex delta, all of ex15 (holos, ex, both Gold Stars). 64 prints.
- The yellow border of a Delta Species holo takes a soft sheen in three clips (medium-low confidence); a Pokémon-ex's and a Gold Star's border is plain.
- Sheen Energy (ex13 105-110, ex16 103-108): plain reflective foil, no pattern; one slanted band of the full rainbow with a white-hot core, about a
  fifth of the card wide, lies across the picture (HP Psychic clip, Collexy scans); header bar, yellow border and footer stay plain.
- Emerald Energy (ex9 101-106) is cosmos, i1's.

## Recipe (ex-delta.css)
- `.foil` is cut to the card's mask (has-foil-map, assets/foil/ex-delta/) and screened on; no pattern tile, nothing grained, nothing dark, no colour dodge
  (so no closing contrast chain is needed; light layers only: screen and overlay).
- Refractor: `.foil::before` is a slanted band of the spectrum (a 118deg mask band, 200% wide, 40% of the card wide) whose centre follows the pointer
  through `--exd-bx/--exd-by` (kept inside 12-88% so the thumb on the text box still lights the Pokémon); `.foil::after` a faint all-over sweep; `.glare`
  overlays the same band cut to the silhouette so the print's own colours are pushed towards it. Rest: a faint static spectrum on `.foil` (opacity 0.2).
- Sheen Energy: `.foil::before` is a rainbow band (stripes red, orange, yellow, green, cyan, blue, violet) over a white-hot core, 200% wide layer, skewed
  -9deg, position `--exs-x` (50% + (50% - background-x) x 1.1); `.foil::after` a very faint sweep; the rest state shows a thin band.
- `clamp()` in `mask-position` mis-paints in Chromium: the band position is a plain calc().

## Masks (assets/foil/ex-delta/, 65 files, 268 KB; scripts/make_ex_delta_masks.py + make_ex_delta_hints.json)
- `<card id>.webp` (64): 300 x 419, alpha = shine. Derived from the scan by GrabCut inside the art window (centred seed ellipse, window edge as
  background), 1-3 hand hints for about 30 cards where the art defeats it (bgpoly / fgpoly polygons, fg / bg dabs, in preview-crop pixels), small holes
  filled, opened, closed, grown one pixel (the dark outline belongs to the Pokémon) and feathered. Intersected with the frame's window (ex-win/pokemon
  and pokemon-evo for regular frames, ex-ex/win-A-basic and -stage for ex and Gold Star), so the Evolves-from circle, the BASIC tab, the name bar and
  the text can never be lit. Delta Species holos add the border ring (11 px) at 0.30. Every mask was checked by eye on a darkened overlay of its card
  (the review sheets, 11 of 6 or 8 cards); a numeric check confirms no alpha outside window and border for all 64. ex13-16 (Rayquaza, whose coils fill
  the art) is the whole window eased in from its edge (`FULL`); no card needed the oval fallback.
- `energy-art.webp`: the basic Energy picture alone (x 13-587, y 77-785 of 600 x 838; header bar above, footer below, border outside), shared by the
  twelve sheen Energy (same frame in ex13 and ex16).
- exDeltaMap(card) in js/ex-foil.js returns the file; exMap() ORs it after i2's and i1's functions, and exRefractor() is the single switch (np promos
  filed in a set's folder are not refractor, rv-i2).
- Never regenerate in place: `--force -v2` redraws under a new name.

## Not settled
- No macro of the refractor surface: it is drawn smooth. The border sheen of Delta Species holos rests on three clips (0.3 alpha, barely visible).
- Silhouettes are derived from the scans: soft inside edges of flames and lightning (Charizard, Rayquaza) are approximated; ex13-9 Kabutops, ex15-8
  Ninetales and ex15-95 Latias ex needed the most hand hints and may leave a few pixels of background lit at their edges.
- The glare's colours were tuned against low-resolution frames; whether a given real copy shows red-white or cyan depends on the lamp, so the band
  carries the whole spectrum and the pointer decides.
- Promos: np/ex-set promos with a cosmos `foilAs` stay cosmos; no refractor promo was found (np035 Pikachu delta holo is cosmos per research np.md).
