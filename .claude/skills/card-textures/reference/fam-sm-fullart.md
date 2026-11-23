# Family sm-fullart: Sun & Moon full arts (js/fam/sm-fullart.js, css/holo/fam/sm-fullart.css)

Built 2026-11-23 from the empty stub. Audit groups w2-sm-fa (195 faces: full-art GX and TAG TEAM GX, alternate-art Tag
Teams and Cosmic Eclipse's colour secrets) and w2-sm-tfa (86 faces: full-art Supporters and Trainers, Hidden Fates
SV81-SV86 included). Claims exactly the faces smPattern() files as `foil-ultra sm-fa` / `foil-ultra sm-tfa` (281 in the
census of 2026-11-23, none taken from another family). The era sheet css/holo/sm-fullart.css still draws them under
`?fam=off`.

## What the real cards do (sources)

Photos: /home/user/holo-refs/w2-sm-fa/dl (SOURCES.md there lists the original URLs: Shuckle-GX sm8-195 lit scan
chaoticfactory, Gardevoir-GX 140 eBay photo, Sceptile-GX 196, Shiftry-GX sm7-152, Rowlet & Exeggutor sm11-214 Etsy);
Steelix sm12-247 search sheet in /home/user/holo-refs/w2-sm-fa/sm12-247/s1. Audit facts: /home/user/holo-work/w2-sm-fa
and w2-sm-tfa AUDIT.json.

- The whole face is foil, frame included; the art keeps its printed, saturated colours, the dark GX attack bar and the
  text stay dark. The cyan halo round the line art is printed (it is in every flat scan): add no glow.
- TCG Live's etch (`-etch-v4`, native) is a faceted line hatch: triangular facets of straight parallel lines at their
  own angles on the background, contour ridges on the Pokémon. It reads at every angle.
- Lit: broad soft diagonal sheen bands, rising to the right, about six down the diagonal, sweep the whole face, text box
  included, lighter where they fall and darker between; they carry the hatch. The frame is grey silver with a fine
  sparkle. GX: silver-white, only a faint tint. Supporters: a stronger saturated rainbow led by the frame and header,
  skin and dark ink unchanged (audit, medium confidence: video frames).
- Alternate arts / colour secrets: TCG Live's map keeps the characters matte; the scenery and printed star glints are
  foil; Cosmic Eclipse 237-248 have no etch.

## Recipe (classes from the module)

`smf-gx`, `smf-t`, `smf-alt`, plus `smf-noetch` (no Live etch: the data's shared tile is not drawn). `cure: true` adds the
`.cure` span.

- `.foil` colour-dodge, x the scan: the etch at 45% (38% at rest) and the silver ring; lit, a soft pool. Masked art AND
  (map OR 35% floor); the alts the map alone.
- `.foil::before` the band light x the scan's luminance, masked by pool, map and the etch lines (30% floor).
- `.foil::after` faint glitter x the scan, screened.
- `.cure` multiply: the shade between the bands (GX only, 0.72 grey at the gaps), the frame strips at grey 206 (silver),
  and the tint through the inverted scan (colours white/pale ink only).
- `.glare` screen: white sheen bands x (etch lines + floor) x the scan desaturated (so dark ink gets nothing), masked by
  pool, art and map. A colour-dodge cannot lift a zero channel (a saturated green has no red), so the white of the
  bands has to be screened outside the dodge group.
- `.glare::after` the frame's sparkle (the alts: over the scenery), inside the screened glare.

## Lessons

- A layer inside a blended element (`.glare::after` in a screened `.glare`) blends with that element's own content,
  not with the card: a multiply there never darkens the card. Use the `.cure` span for a multiply layer.
- `mask-mode: luminance` on one layer of a mask stack blanked the whole glare in WebKit; weight by the scan inside the
  background stack instead (`art` multiply, then a grey `saturation` layer).
- Bands under 10% contrast vanish at phone size; the shade between them is what makes them read.

## Left / open

- No per-facet flash (each facet lighting at its own tilt): needs line-direction maps (`etch-angle`) for the full arts,
  which the data has only for the Shiny Vault. A generator from the -etch-v4 maps would be a later step.
- sm8-smp173 (Jolteon-GX promo) has no Live etch: draws no etch (smf-noetch) instead of the shared tile.
- Supporter rainbow strength rests on video frames only.
