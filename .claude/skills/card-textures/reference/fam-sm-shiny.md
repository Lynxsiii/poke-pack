# Family sm-shiny: Hidden Fates Shiny Vault and Shining Legends' Shining Pokémon (js/fam/sm-shiny.js, css/holo/fam/sm-shiny.css)

Built 2026-11-23 from the empty stub. Audit group w2-sm-shiny (/home/user/holo-work/w2-sm-shiny/AUDIT.json). Claims
exactly the 89 faces smPattern() files with `sm-shiny`: Shiny Rare SV1-SV45 (`sms-window`), Shiny GX SV46-SV80
(`sms-gx`), Rare Shining sm35 9/27/40/42/56/57 and the promos Ho-Oh smp070, Celebi smp079, Lugia smp082 (`sms-shining`).
SV81-SV86 belong to sm-fullart, SV87-SV94 (golds, e.g. Tapu Bulu-GX SV91) to sm-gold. The era sheets
(css/holo/shiny-vault.css, css/holo/sm-shiny.css) still draw them under `?fam=off`; the background on the real cards is
in reference/sun-moon-shiny-vault.md.

## Real finish (sources)

- Shining: only the Pokémon is foil; the ink keeps its colour (Genesect red, Rayquaza dark), straight engraving per
  panel, blue/violet flashes on the white highlights. Photo: /home/user/holo-refs/w2-sm-shiny/sm35-9/s1/02.jpg (Genesect,
  tilted: red body, blue-violet on the white plates); PSA shots 01, 06 (Arceus JP), 07 (Ho-Oh) beside it.
- Shiny GX: silver edge to edge with a crisp line engraving over art, text box and frame; rays behind.
- Shiny Rare: silver window, rays, a fine pastel shimmer; printed stars are unfoiled.

## What changed

- Native TCG Live etch (733 x 1024, sigma 0.6) for SV1-SV80 and the six sm35 Shining:
  scripts/fam/sm-shiny/ship_live_etch.py -> assets/foil/fam/sm-shiny/<id>-etch-v1.webp (86 files, 12 MB), wired as
  `--sms-etch` (class `sms-live`); the sheet points the era's --etch-soft/--etch-map at it on `.foil` and `.glare`. The
  data's 400 px maps and their blurred copies drew the engraving as a faint grain. No line screen at 220 px x 3 in WebKit.
- Shining: own stack. `.foil` = the etch's lines (twice) over neutral grey, soft-light, cut to the Pokémon's map: lines
  lighten, hue untouched. `.glare` = narrow cool pastel bands multiplied through the inverted, desaturated scan squared
  (colours the white plates only). `::before`, `::after`, `.glare::after` off. The era's hard-light silver ramp (red
  to pink, dark to blue-grey) and the pastel slab are gone.
- Shiny GX: rays 0.3 -> 0.45, bands 0.6 -> 0.45, held screen 0.5 -> 0.32.
- Shiny Rare: bands 0.62 -> 0.4 (pastel), held screen 0.22, silver lifted (lamp 95, mid 90, floor 84) so the printed
  stars glow less; rest a faint pastel (0.16, saturate 0.8) instead of grey.

## Left

- Shiny Rare: the band is still one smooth sun-pillar, not broken line by line by the etch (audit step 4); Diancie /
  Guzzlord dark ink not specially protected (step 6). Both minor per the audit. No tilted photo of a Shiny Rare or GX.
- Shining promos (smp070/079/082) keep their data's softened etch (Live key for them not probed).

## Lessons

- Screen cannot colour white ink: colour on a white highlight needs a multiply tint (1 - (1 - tint) x luminance).
- In a background stack a grey `saturation` layer desaturates everything under it; put it under the colour layer.
