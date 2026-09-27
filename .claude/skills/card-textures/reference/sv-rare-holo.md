# Scarlet & Violet holo Rare with a Future or Ancient frame

A fix on top of the `foil-svholo` recipe in `celebration.css`, for the holo
Rares whose frame prints a halftone panel in the text box (2026-09-27, from
the Twilight Masquerade thread). Rule: `css/holo/sv-rare.css`. Hook:
`foilExtras()` in `js/foil-maps.js` adds `frame-paradox` to mapped cards
whose `subtypes` include `Future` or `Ancient`. Nothing else changes, so it
applies to every set with those frames (Paradox Rift, Temporal Forces,
Twilight Masquerade and later) once that set has its foil maps.

## What the print does

TCG Live files these as `Rare_SvHolo_Holo`, the same print id as any other
SV holo Rare. The difference is in the foil map: on a normal frame it is
white only round the Pokémon, but on a Future or Ancient frame it is also
white over the halftone dot panel that runs down the right of the text box
(the chrome dots on Iron Leaves, the painted dots on Walking Wake). The real
card shows a rainbow shimmer through those dots and the attack text stays
black on top.

## The bug it fixes

`foil-svholo` was tuned for a mask that only covers the art window. Its
`::before` light bars multiply to near black for most of their period, and
its `::after` luminosity falloff darkens everything away from the pointer.
That reads as mirror foil behind a painting, but on the text box panel it
turned the panel and the attack text printed on it solid black whenever the
card was lit.

## Recipe

Below about half the card's height, drop the two pseudo layers and keep only
`.foil` itself, whose rainbow overlays the ink rather than covering it:

```css
body.fx-holo.fx-holo.fx-holo .tcg.foil-svholo.frame-paradox .foil::before,
body.fx-holo.fx-holo.fx-holo .tcg.foil-svholo.frame-paradox .foil::after {
  -webkit-mask-image: linear-gradient(to bottom, #000 48%, transparent 51%);
  mask-image: linear-gradient(to bottom, #000 48%, transparent 51%);
}
```

The pseudo layers already sit inside `.foil`, which carries the foil map as
its own mask, so this gradient only trims them further. The text box starts
at about half the card's height on the SV frames checked (Twilight
Masquerade's Future and Ancient Rares); the 3% ramp hides the seam under
the art window's bottom border.

## Pitfalls

- Don't key it off the card's rarity or set: the same frame appears on
  Rares in several sets, and a Future or Ancient Pokémon that prints as a
  Double Rare or Illustration Rare uses a different recipe and map.
- Don't edit the foil map to cut the panel out. The panel really is foil,
  and the shimmer through the dots is the look.
- Only mapped cards get the class. Without a foil map the card falls back
  to the older full-card holo and has no panel to protect.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv6&cards=19,63,24&poses=rest,20:15,50:50,80:70&proof=off" --out /tmp/sv-rare.png
```

Twilight Masquerade 19 is Iron Leaves (Future), 63 Walking Wake (Ancient)
and 24 Teal Mask Ogerpon, a normal frame for comparison. At every pose the
attack text on 19 and 63 should read as black ink with rainbow dots beside
it, never a black block.
