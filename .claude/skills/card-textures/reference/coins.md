# Coins: 3D disc and holo

The promo coins from sealed products (Sleeves & coins page, the casino coinflip)
are one component: `js/coin.js` + `css/casino-coin.css`. Flat tiles are the same
face markup in `.gcoin` (css/pages/gear.css); the sheet and the "your coin" slot are the
3D disc.

## What the real coins are (catalog `material`)

- **metal** (48): struck, polished. A mirror: one broad bright band that slides with
  tilt, brightest on the relief and the rim. No rainbow bars.
- **foil** (46): holographic foil. Shows a spectrum wherever the print is bright or coloured.
- **plastic** (41): glossy moulded plastic; only silver / iridescent ink (Gardevoir, Pikachu 30)
  catches rainbow, coloured enamel and the black field only get gloss.

## The look decides the light (2026-11-28)

Noah, 2026-11-28: "coins holos must be fixed". The first recipe laid a full saturated
spectrum on every coin through `hard-light`: a red Incineroar, a silver Umbreon and a gold
Pikachu all came out the same rainbow disc, black line art glowed neon, and the metal coins
went milky under a white band. The photo IS the real coin under real light (rainbow where
the foil is rainbow, shards where it is cracked ice), so the light must reveal it, not
repaint it.

- Blend is `overlay`: black stays black, a coloured foil brightens in its own hue, and a
  dark flank beside the white band gives metal its contrast. Never `hard-light` or `screen`
  for the band (both lift the line art and wash the metal).
- Every coin has a `look` (`foil.look` in data/gear.json, read from its blurb by
  `coin_foil.py look_of`, overrides in scripts/gear/coin-foil.json): struck, mirror,
  rainbow, sheen, ice, glitter, pearl, gloss. `.cf-look-*` sets `--cf-band`, `--cf-dark`,
  `--cf-spec`, `--cf-spark`. A spectrum only where the real coin is rainbow foil; mirror
  and struck coins get none.
- The light is one diagonal stripe (mask on `.cf-holo > i`) that follows the pointer and
  stays on the coin (travel 0.42 of a face each way; the spectrum is 1.6 faces long, so
  about half a cycle drifts past per sweep).
- Glitter looks add `.cf-spark`: the flecks tile, masked by the map and a pool at the light.
- The reverse (`.cf-reverse`) is a plain tinted disc: band only.
- The look also picks the map mode (struck = metal, gloss/pearl = plastic, foils = foil).
- Check with `node scripts/coin-lab.mjs --query "strip=1&size=84&from=0&n=10" --poses rest`
  (bare photo | rest | lit | lit per coin; `--browser webkit`), all 149, against the bare photo:
  the lit coin must still read as the same coin.

## How it is built

- The photo (assets/coins/<id>-vN.webp, 512x256, obverse left) already holds the real coin's
  rim, so it fills the face (`.cf-photo`); the old machined rim around it doubled the rim.
- `scripts/coin_foil.py` draws a luminance map per coin in the same 512x256 layout
  (`assets/coins/foil/<id>-m<v*10+mv>.webp`, never overwritten: bump `mv` in
  scripts/gear/coin-foil.json). Overrides: `mode`, `gain`, `floor`. `--sheet out.png` = art | map | overlay.
  data/gear.json carries `foil: {finish, map}`; build_gear.py keeps it.
- `.cf-holo` is masked by the map (`mask-mode: luminance`, same 200% sizing as the photo) and holds
  an oversized light stripe moved by `translate` from the tilt vars. Blend is `overlay` (see above;
  colour-dodge is out: WebKit blocks).
- Tilt vars on the coin: `--rx --ry` (deg), `--nx --ny` (-1..1), `--tilt` (0..1), set by `tiltCoin()`;
  `.cf-tilt` is the inner wrapper that takes the rotation so the toss (WAAPI on `.cf-coin`) never
  fights it. A released coin eases home by CSS; `glintCoin()` is one sweep, no loops.
- Never put `filter` on `.cf-coin` / `.cf-tilt` or any 3D ancestor (Safari draws the back through);
  a missing coin is greyed on `.cf-photo`.

## Checking

`scripts/.lab`-style page: coinStageHTML + coinOf(item) at 120px, poses rest / (0.8,-0.5) / (-0.7,0.7),
Chromium and WebKit, then toss frames. Judge the holo at phone size against the real photos.
