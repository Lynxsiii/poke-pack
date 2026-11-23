# Holo family sm-gold: Sun & Moon gold secret rares

Module `js/fam/sm-gold.js`, sheet `css/holo/fam/sm-gold.css`. No assets or generators (CSS over the scan, TCG Live's
map and its `-etch-v4/-v5` etch). Built 2026-11-23 from the audit w2-sm-gold (/home/user/holo-work/w2-sm-gold/AUDIT.json).

## Scope (101 faces, census 2026-11-23)

Exactly the faces `smPattern()` files as `foil-gold sm-gold`: the gold "Rare Secret" Items, Tools, Stadiums, Energy
and Pokémon-GX of sm1-sm12, sm75 75-78, Hidden Fates SV87-SV94 (Tapu Bulu-GX SV91, Tapu Fini SV92, Koko SV93, Lele
SV94 and the four Stadiums) and the promos SM247/SM248. No family claimed them before. Classes: `smg-gx` (11 gold
Pokémon-GX), `smg-energy` (9 gold basic Energies).

## The real finish (photos: /home/user/holo-refs/w2-sm-gold, SOURCES.md lists the URLs)

- Whole face foil under gold ink; title and rules text matte (Live's map).
- One relief, Live's etch: dense fingerprint ridges about 1% of the card, contour-following, visible at arm's length
  over bright and dark gold (Max Potion sm2 164, Cherish Ball sm11 250 tilted, Tapu Koko-GX SV93).
- Away from the light warm amber/olive gold, darks stay dark (Net Ball sm8 234, DCE sm2 166, Counter Catcher flash).
- Near the light a broken rainbow on the ridges: green/teal, magenta/violet, cyan, orange (Switch + Counter Catcher
  flash photo, Ultra Ball sm1 161 tilted: green-yellow top, magenta lower burst; the six sm7 golds on a table).
- No glitter on Items/Tools/Stadiums/GX. Gold GX: amber field, swirl ridges, green-cyan tint near the GX bar.

## How the sheet draws it (held; rest paints `.foil` alone)

- `.foil` colour-dodge, masked by calm header x art x (map + 0.7 floor): a small warm pool (red > green > blue, gone
  by 52%) and the etch lit by a warm lamp, `brightness(0.9)` closing. Rest: the etch faint (brightness 0.6).
- `.cure` multiply rgb(196,168,128) at 0.62 through the etch: the ridges about x0.86 darker over the whole face, so
  the relief reads over bright gold (a dodge cannot show lines on near-white gold). Darker than that tripped
  dark_specks.py (ridges at 220 px break into dots).
- `.glare` the rainbow's hue with the `color` blend (lightness kept: dark ink stays dark), 0.8 on Items/Energy, 0.32
  on the GX (their dense etch turned it into a pastel sheet), masked to the ridges x a pool round the pointer.
  Overlay only turned gold orange/olive; a normal paint lifted Counter Catcher's dark dish to milky lilac.
- Removed from the era look: the sepia glitter (`.foil::after`), the grey hard-light glare and the lemon pool.

## Left / for the lead

- Bump `?v=` of `css/holo/fam/sm-gold.css` in index.html and the `sm-gold` entry in js/holo-fam.js's FAMILIES.
- Not done: the smooth lilac stars / lilac-pink-blue Item box (map minus etch) and a separate stipple-sand sparkle on
  the Energies' art field (they take the cool-biased ridge rainbow only).
- The ridges are only drawn while lit (`.cure` and `.glare` are hidden at rest, like every lit layer).
