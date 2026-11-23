# Family sv-acespec: Scarlet & Violet ACE SPEC Rare

Module `js/fam/sv-acespec.js`, sheet `css/holo/fam/sv-acespec.css`, assets `assets/foil/fam/sv-acespec/<id>-body-v1.webp`
(33 body masks, generator `scripts/fam/sv-acespec/make_body_masks.py`). 33 faces, sv5-sv8pt5.

## The real card (audit w2-sv-ace; photos re-fetched to /home/user/holo-refs/w2-sv-ace/, sources in SOURCES.md)
- Whole face foil except text, rule box, illustrator strip; TCG Live ACE_FOIL map placement is right.
- Stock is raspberry (hue ~330-340), not the scan's neon fuchsia (238,0,141; hue 324) (Hyper Aroma TWM 152, Maximum Belt
  PRE 117, Hero's Cape TEF 152 photos).
- Diamond lattice at ±45°, ~8 diamonds across (~26 CSS px at 220 wide), bars bundles of 2-3 thin lines: paler rose
  lines on the body, gold/rainbow glints in the art window. Banners steel-blue/cyan.

## What the family draws (2026-11-23)
- `.foil` multiply masked by art ∩ per-card body mask (the scan's stock pink, art window cut out): raspberry tint
  rgb(228,250,172) with the lattice lines left paler (tile 12.5% × 8.95%, bundles at 0/50/100% so they join).
- `.glare` multiply: lattice lines coloured by a slow light spectrum (no channel under ~90: no dark specks), masked by
  art ∩ foil map ∩ pool, minus the body mask. Rest: tint + faint lattice.
- Custom-property gotcha: `--ace-lines` uses `--ace-ink`, so it is declared on each layer, not on `.tcg`.

## Left
- Fine horizontal ridges and four-point stars are not drawn (ridges at 1 px read as scanlines last time).
- The item art takes the window lattice where Live's map is strong on it (e.g. Hyper Aroma's canisters).
