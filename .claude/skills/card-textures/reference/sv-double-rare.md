# Scarlet & Violet Double Rare streaks (shared)

Built 2026-09-27 from the Paradox Rift thread. Rules:
`css/holo/sv-double-rare.css`, on top of celebration.css's `foil-sunpillar`.
Scope: `era-sv`, a class `foilExtras()` (`js/foil-maps.js`) adds for ids
`sv<digit>`, `zsv<digit>` and `rsv<digit>` (Black Bolt, White Flare). Mega
Evolution and 30th Celebration Double Rares keep celebration.css's look.

## Against real cards

Photos: `/mnt/project-files/sv151/texture-refs/double-rare_*` (151's
Charizard ex, and the SVP Zapdos ex and Alakazam ex promos, same finish) and
`scarlet-violet/texture-refs/double-rare-*` (SV base Miraidon ex, Gardevoir
ex); Surging Sparks' photos match too.

- Thin, sharp rainbow streaks, each a full spectrum about 2% of the card
  wide, about a tenth of the card apart, running lower left to upper right
  at about 50 degrees, over the frame, art background and text box.
- The art between streaks stays fully saturated. The streaks are brightest
  near the light and fade across the card.
- The stars are the SouthernCross cure coat, in patches (unchanged,
  `.cure.cure-stars`). The SVP 050 misprint without stars shows the streaks
  alone.

celebration.css's SUN_PILLAR (a spectrum hard-lit into 115deg tinsel bars,
plus an exclusion twin) reads as a broad pastel wash over the whole card.

## Recipe

- `.foil`: one `repeating-linear-gradient(130deg, ...)`: black for 8%, the
  spectrum over 1.4%, black to 9.7%, at `200% 200%`, positioned at
  1.5x the tilt so the streaks sweep; `color-dodge`, so the black gaps leave
  the art alone; `brightness(1 + pfc*.3) contrast(1.15) saturate(1.5)`.
- `::before`: a steeper multiply radial than celebration.css's, so the far
  side of the card stays nearly plain.
- `::after`: none. One family of streaks.
- Rest: `brightness(.7)`, a few faint streaks.

Tera Double Rares are `foil-tera` (sv-finishes.css), not this.

## Verify

```
node .claude/skills/card-textures/scripts/foil_probe.mjs --query "set=sv1&cards=81,86&poses=rest,30:25,65:40&proof=off&w=330" --out /tmp/dr.png
```

81 Miraidon ex, 86 Gardevoir ex. Paradox Rift: `set=sv4&cards=27,68,38`
(38 Garchomp ex is Tera and must not change). Mega Evolution, unchanged:
`set=me1&cards=100`.
