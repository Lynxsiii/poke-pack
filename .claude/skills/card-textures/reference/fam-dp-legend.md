# Family dp-legend: HGSS LEGEND halves

Scope: 18 faces, both halves of every LEGEND: hgss1 111-114, hgss2 90-95, hgss3 87-90, hgss4 99-102 (`js/fam/dp-legend.js`
claims `dp-legend` faces that have a map; `legendHalf()` of `js/dp-foil.js` adds `fam-dp-legend-top` / `-bottom`).

## What the real card does
Bleeding Cool's Darkrai & Cresselia pair photo, binder-page photos of Rayquaza & Deoxys and Kyogre & Groudon and the earlier
research (`/mnt/project-files/holo-remaster/dp-legend/AGENT-LOG-thread-b.md`): the picture, the type-coloured swooshes and the
attack text printed over it are DP cosmos holofoil; the pearl/silver plates (name column or header plate, LEGEND tag, Illus.
plate, rule tab, Pokedex and knock-out bars), the energy orbs and the cream gold-dust border are opaque print and stay matte.
The two halves are one picture: the top half's right edge (portrait view) is the bottom half's left edge, no border there.
Confidence: medium (photos are flat phone shots, no macro of the foil; the sheen colours are the era's galaxy holo).

## What was built
- `assets/foil/fam/dp-legend/legend-<set>-<n>.webp` x18 (600x838 RGBA, alpha = foil), from
  `scripts/fam/dp-legend/make_legend_maps.py` (data-driven: group deviation + pearl detection per card, reviewed orb table,
  feathered swoosh edges; `--debug` writes the overlay sheet). Used as `--foil-map`, mask only.
- `assets/foil/fam/dp-legend/cosmos-glints.webp`, from `make_glints.py`: the era's two cosmos alpha textures merged, blobs
  over 220 px removed (the big discs read as stickers on a phone).
- `css/holo/fam/dp-legend.css`: `.foil` = one long spectrum under a pool of light, colour-dodged, closed by `contrast(0.8)`;
  rest = a soft pale band; `.cure` = rainbow through map x glints (screen); `.glare` = light-only gloss; `::before/::after`
  off. The spectrum is two card widths across a pair (`--lg-join` 0 top / 1 bottom) so the halves carry one field.

## How to judge
Phone render (220 px x3, rest 30:25 75:65 50:78, `&fam=off` is the before): plates, orbs and border keep their print,
the picture flashes a rainbow with speckle glints, nothing grey at 50:78, no tiles. Dark pair (hgss4 99/100) and the Lugia
pair (hgss1 113/114) were checked in Chromium and WebKit.

## Open
- The attack text sits inside the foil mask (it is printed over the picture on the real card); check against a macro photo.
- The era's join-continuity is only visible with both halves lit by one pointer; the lab lights each card on its own.
- Orbs printed over the picture are cut from the reviewed table; a few small ones on hgss1 may be missing.
