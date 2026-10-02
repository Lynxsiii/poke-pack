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

## How it is built

- The photo (assets/coins/<id>-vN.webp, 512x256, obverse left) already holds the real coin's
  rim, so it fills the face (`.cf-photo`); the old machined rim around it doubled the rim.
- `scripts/coin_foil.py` draws a luminance map per coin in the same 512x256 layout
  (`assets/coins/foil/<id>-m<v*10+mv>.webp`, never overwritten: bump `mv` in
  scripts/gear/coin-foil.json). Overrides: `mode`, `gain`, `floor`. `--sheet out.png` = art | map | overlay.
  data/gear.json carries `foil: {finish, map}`; build_gear.py keeps it.
- `.cf-holo` is masked by the map (`mask-mode: luminance`, same 200% sizing as the photo) and holds
  an oversized spectrum moved by `translate` from the tilt vars. Blend is `hard-light`:
  `screen` vanishes on pale metal and glitter, hard-light shows colour on dark and light alike
  (colour-dodge is out: WebKit blocks).
- Tilt vars on the coin: `--rx --ry` (deg), `--nx --ny` (-1..1), `--tilt` (0..1), set by `tiltCoin()`;
  `.cf-tilt` is the inner wrapper that takes the rotation so the toss (WAAPI on `.cf-coin`) never
  fights it. A released coin eases home by CSS; `glintCoin()` is one sweep, no loops.
- Never put `filter` on `.cf-coin` / `.cf-tilt` or any 3D ancestor (Safari draws the back through);
  a missing coin is greyed on `.cf-photo`.

## Checking

`scripts/.lab`-style page: coinStageHTML + coinOf(item) at 120px, poses rest / (0.8,-0.5) / (-0.7,0.7),
Chromium and WebKit, then toss frames. Judge the holo at phone size against the real photos.
