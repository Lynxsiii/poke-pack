# Etched full-art Ultra Rare and gold Hyper Rare (Scarlet & Violet)

The two etched finishes every Scarlet & Violet main set prints besides the
Tera ex and SIR, built from Scarlet & Violet base (sv1) on 2026-09-27.
Rules: `css/holo/sv-etched.css`, loaded after `sv-finishes.css`. No hook
change: `foilPattern()` in `js/app.js` already gives Ultra Rares
`foil-ultra` and Hyper Rares `foil-gold`, and both rules key on
`has-etch-map`, so any set whose maps are shipped
(`fetch_foil_maps.py --ship --write-data`) gets them. A card without an etch
map keeps the older `foil-ultra` / `foil-gold` recipes in `rarities.css` and
`realism.css`.

## What TCG Live prints in a Scarlet & Violet main set

sv1 (`longFormID` tail after the print id), checked 2026-09-27:

| Rarity | TCG Live foil / etch | Site classes |
|---|---|---|
| Rare | `SvHolo` / `Holo` (21) | `foil-holo foil-svholo` (celebration.css) |
| C / U / R reverse | `FlatSilver` / `Reverse` | the site's reverse finish |
| Double Rare | `SunPillar` / `Holo` + `CastAndCure_SouthernCross` (10) | `foil-ex foil-sunpillar` + stars (celebration.css, foil-maps.js `cureOf`) |
| Tera Double Rare | `SvUltra` / `Etched` (2) | `foil-ex foil-tera` (sv-finishes.css) |
| Illustration Rare | `SunPillar` / `Holo` (24, no etch) | `foil-ir has-foil-map` (celebration.css) |
| Ultra Rare | `SunPillar` / `Etched` (18) | `foil-ultra has-etch-map` (**this file**) |
| Tera Ultra Rare | `SvUltra` / `Etched` (2) | `foil-ultra foil-tera` (sv-finishes.css, excluded here) |
| Special Illustration Rare | `SvUltra` / `Etched` (10) | `foil-sir has-foil-map` (celebration.css) |
| Hyper Rare (gold, incl. gold energy) | `SvUltra` / `Etched` (6) | `foil-gold has-etch-map` (**this file**) |

Basic energy is non-foil. sv1 has no ACE SPEC and no god packs.

## Ultra Rare full art: `SunPillar` / `Etched`

- **Where** (foil map): the whole card; the Pokémon or Trainer at part
  strength, the background full.
- **Etch**: follows the painting's own lines (feathers, hair, lightning), not
  a generic grating, plus the text box border. It reads as textured metal.
- **Recipe**: pokemon-cards-151's `ex-full-art.css`: a vertical sun pillar
  (200% 700%) recoloured by steep 128.5deg light bars (`hue`, `hard-light`),
  a pointer radial darkener, all `color-dodge` with
  `brightness(pfc * .4 + .5) contrast(2.5) saturate(.66)`; a mirrored twin
  on `::after` (negative positions, 195% bars, `exclusion`) flips colours
  where they cross; a cool `hard-light` radial glare.
- **Pitfall, alpha maps**: upstream's `--foil` is a black and white
  luminance image used as a `soft-light` layer (smooth foil grey, etch
  white). The site's maps are alpha masks (white with alpha). Soft-lighting
  only the etch over black squares the brightness and the card goes dim.
  Stack `var(--foil-map), var(--etch-map), linear-gradient(#000, #000)` all
  `soft-light` instead: the foil map lifts the smooth foil to mid grey, the
  etch lifts its lines above it, which is what upstream's images read as.
- **Dropped**: a Supporter-only glare variant; it put a white haze over
  Miriam's face.

## Hyper Rare, gold: `SvUltra` / `Etched`

- **What it is**: gold ink printed over foil. The etch cuts the art's
  contours and a fine grain into it; the energies' etch is four-point stars.
- **Recipe**: pokemon-cards-151's `hyper-rare.css`: a 15deg rainbow on
  `.foil` (color-dodge) that only shows inside two light bars crossing with
  the tilt (`::before`, `exclusion` between them, `hard-light`), glitter on
  `::after` (`plus-lighter`, opacity `.2 + pfc * .3`), a `multiply` glare
  that dims the card away from the light, and the etch catching it: a warm
  `overlay` hot spot on `.glare::after` (masked by the etch through
  celebration.css's generic `has-etch-map` rule).
- **Pitfall, gold turns orange**: upstream's `brightness(.6) saturate(1)`
  colour-dodges the rainbow's red and magenta slices into bright gold ink,
  and the card turns orange and red when lit. `soft-light` and `overlay`
  keep the hue but go orange-brown in the shadows. What works:
  `brightness(.5) contrast(1.5) saturate(.45)` on `.foil`, still
  `color-dodge`: the gold brightens towards pale gold with a rainbow tint.
  Resting, `saturate(.3)`.
- **Gold energy**: the scan is already near-white yellow, so any dodge
  bleaches it. The stars in the etch map carry the sparkle; don't raise
  the dodge for them.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs \
  --query "set=sv1&cards=227,228,238,225,253,254,256,257&proof=off&poses=rest,30:25,70:60" \
  --out /tmp/sv-etched.png
```

227 Miraidon ex, 228 Gardevoir ex and 238 Miriam are `SunPillar` Ultra
Rares; 225 Gyarados ex is a Tera UR and must look different (foil-tera);
253 and 254 are the gold Miraidon and Koraidon, 256 Rare Candy, 257 a gold
energy.

Before shipping a new set's maps, run the Surging Sparks thread's
`check_foil_maps.py --set <id>` (TCG Live files some maps under the wrong
card). In sv1 it flags only near-ties between prints of the same art (a UR
and its gold HR, the two gold energies); none is a swap.
