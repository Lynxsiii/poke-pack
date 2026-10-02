<!-- Family note for the holo family wotc-crystal (older-era holo remaster, 2026-10-01/02). Research, photos and sheets: /mnt/project-files/holo-remaster/wotc-crystal/ -->
# wotc-crystal: working notes

Family: the nine Crystal Pokémon HOLO faces. Aquapolis (ecard2) 148 Kingdra, 149 Lugia, 150 Nidoking; Skyridge (ecard3)
145 Celebi, 146 Charizard, 147 Crobat, 148 Golem, 149 Ho-Oh, 150 Kabutops. Their reverse holos (Skyridge only) belong
to wotc-expedition. Noah: "Crystal Pokémon holos need to be fixed".

## What the real card does (sources: refs/, listed in refs/SOURCES.md)

- It is an ordinary e-Card HOLO. The foil is the e-Card "cosmos" pattern: one-colour squares, small dots, rounded
  crosses and a few big round sparkle discs, each fleck a single colour. It shows in:
  - the art window BACKGROUND (sky, ground, glow), not the Pokémon;
  - the "see-through" parts of the crystal drawing, because they are printed as background: Nidoking's chest plates,
    Kingdra's translucent fins, the ghost-outline region round Ho-Oh, Celebi's rose/green streak;
  - the left slot dashes, the 13 slots of the bottom strip and the e logo (Lugia PSA 9 photo, crops in refs/).
- Matte: the Pokémon itself (the "crystal" look is ink: pale, cyan-to-violet translucent drawing), the yellow frame,
  the name bar, the text box and the "Crystal Type" banner (the banner is plain print on the holo; nothing shines there).
- Colour behaviour: the window field takes one hue that slides with tilt (photos show the sky gold on Ho-Oh, green on
  Charizard, cyan on Kingdra at different angles); individual flecks flash in their own colour, so at any angle a few
  dots are bright while the field is a soft glow in the print's colour. Not a rainbow wash, not a body mirror.
- The REVERSE Crystal (Skyridge only) is the mirror: the whole body flashes rainbow and the window is flat. The era
  recipe (body mirror on the holo) was built from a reverse clip (YouTube _udvbInOcnU, title says REVERSE) and is
  wrong for the holo.
- Japanese prints sparkle over the body too (different foil): do not use Japanese photos as the reference.
- The era note's claim "Collexy shows the 13-slot strip as plain print on holos" is contradicted by the Lugia PSA 9
  photo and the scans (strip slots, dashes and e logo carry sparkle).

## Decisions

- Foil only where the real card is: per-card maps drawn from each scan (window background + see-through parts + slot
  dashes + strip slots + e logo), the Pokémon cut out by GrabCut with hand polygons where it failed.
- The scan's own sparkle flecks are found and registered (so the dots sit where the print's dots are), split into two
  halves (dots-a, dots-b) that flash with different gradients and angles, and both wink white on .glare.
- Field colour: a pastel spectrum under a pointer pool in colour-dodge capped by contrast(0.8) (saturated colours read
  as a colour filter on the art; pastel keeps the print's own colour and brightens it).
- Rest: a soft neutral sheen on the foil field only (no colour cast), dots dim.
- No body mirror, no rainbow on the frame, the Crystal Type banner stays matte.
- The shared window mask (assets/foil/wotc-ecard/win-pokemon-v1.webp) misfits these cards (a stepped tab into the name
  bar and evolution circle top-left, 1-3 px onto the bevel left and bottom, ~4 px short on the right), so each card's
  window is measured from its own scan (card_window() in the map script).

## Built (files)

- js/fam/wotc-crystal.js: claims the nine (not reverse, wotcPattern has wotc-crystal); sets --foil-map,
  --foil-map-dots-a, --foil-map-dots-b per card (names start with --foil-map so the lab's pose reset keeps them).
- css/holo/fam/wotc-crystal.css: resets every paint property the era set on .foil, .foil::before/::after, .glare,
  .glare::after; .foil = field glow (pastel spectrum, pointer pool, colour-dodge, contrast(0.8)) masked art ∩ foil map;
  ::before / ::after = two flash gradients on dots-a / dots-b; .glare = a white band (plus-lighter) on the dots only.
- assets/foil/fam/wotc-crystal/<id>-{foil,dots-a,dots-b}-v1.webp (27 files, white RGBA 600×838, alpha masks).
- .claude/skills/card-textures/scripts/fam/wotc-crystal/make_crystal_maps.py (seeded, re-runnable: --cards, --suffix,
  --preview, --dry-run, --force) and zone_levels.py (foil-minus-bare per zone: sky, pokemon, textbox, frame).

## Measured (Chromium, flat, scale 2; ecard3 146/149/148), foil minus bare in luminance levels

sky rest +24..+34, 30:25 +40..+64, 75:65 ~+35, 50:78 +26..+28; pokemon +0.0 and textbox +0.0 everywhere; frame zone
mean +1..+4 but p95 +14..+32 (to check: the zone rectangle may cover the slot dashes / name-bar small foil).

## Left (at the time of writing)

- Look iteration (rest sheen maybe too strong; 30:25 sky peak on Charizard), Aquapolis cards check, WebKit check.
- Dots discs drawn as rings in places (fill holes in fleck components, regenerate with --force).
- refs/SOURCES.md, gates (before/after sheets, phone-compare, coverage, sweep ×2, idle, census, settings),
  reference/fam-wotc-crystal.md, LESSONS.md, REPORT.md.
- Shared changes to report: wotc-ecard.css Crystal recipe (body mirror from a reverse clip) and its .glare::after
  clamp() mask-position; the era note's "strip is plain print" claim; win-pokemon-v1 tab/edge misfit; reverse Crystals
  keep baked window dots although the real reverse window is flat (wotc-expedition).
