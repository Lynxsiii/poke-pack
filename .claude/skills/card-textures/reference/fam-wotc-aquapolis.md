<!-- Family note for the holo family wotc-aquapolis (older-era holo remaster, 2026-10-02). Research: /mnt/project-files/holo-remaster/wotc-aquapolis/. -->
# wotc-aquapolis: working notes

Family agent, 2026-10-01. Scope: Aquapolis (ecard2) Rare Holo H1-H32, 32 faces (`claims()` = ecard2, `wotc-ecard`
pattern, not reverse, number H1-H32). Crystals (148-150) are wotc-crystal's, the reverses wotc-expedition's.
The named cards: Ampharos H1, Entei H8, Espeon H9, Kingdra H14, Scizor H21, Suicune H25, Tyranitar H28, Umbreon H29.
Lugia is only Crystal 149 (wotc-crystal); Raikou is Skyridge H26 (wotc-skyridge).

## What the real card does (refs/SOURCES.md, 27 files)

- Foil area: the art window's BACKGROUND, the dark ladder bars on the left edge (both groups), the 13 slots at the
  bottom and the e logo (olive with sparkle on the holo, blue print on the plain Rare). Matte: the Pokemon, anything
  else the painting puts on white (Espeon's river), the yellow frame, the name bar, the text box, the strip's yellow.
  Sources: the PSA 10 set photos (all 32, room light), the binder under ceiling lamps, the Tentacruel / Exeggutor /
  Houndoom / Hypno / Nidoking clips, our own scans (holo vs plain twin).
- Pattern: the e-Card "pixel cosmos": pinpoint dots and dashes, plus / snowflake clusters of square cells, roundish
  pixel discs (up to ~4 % of the window), a few starbursts. One colour per element; over the window the colour runs
  as a ramp (violet-blue top, cyan-green middle, yellow-orange-red bottom, about one spectrum per window height in the
  1920 px Expedition scan); dark between the elements in a flat scan.
- Light: at the specular angle the flat foil between the dots mirrors the lamp: the background turns silver-white and
  its inks pastel (Houndoom lamp frame; binder: Steelix, Kingdra, Slowking, Azumarill windows blown bright). Off the
  specular the dots carry the show: coloured pinpoints, white near the lamp. The Pokemon stays its own colour.
- The scans are of the real foil cards: every dot is already printed in the scan. The foil layers add LIGHT.

## The twin trick (how the maps are drawn)

Each H holo has a plain Rare with the same painting (same artist): H1->1 ... H32->44 (table PAIR in the generator).
Registered (ECC affine on the text box + name bar, cc 0.90-0.98; refined on the window's gradient image), colour matched
per channel on the text box. Over bare foil (no white underlay) the background scans much darker than over paper and
carries dots the twin does not; the Pokemon on its white underlay scans the same. So:
- dL = L*(twin) - L*(holo): 25+ on foil backgrounds, ~0 on the Pokemon (Octillery's red body +8..12: different print).
- holo-only dots (point response of the holo minus the twin's, dilated): dense on foil, none on the Pokemon.
GrabCut on the holo scan, seeded by those, snaps the cut to the drawing.
The wotc-expedition agent found the same twin pairing on its own (scripts/fam/wotc-expedition/twins.py): consistent.

Per-card findings so far:
- Espeon H9: the cobblestones and the top-right orb are foil; the river (bright blue + white band, no dots, same as the
  twin) is matte.
- Umbreon H29: sky, moon, city foil; the roof carries faint dots and is a little darker than the twin: partial foil.
- Hypno H12, Magneton H16: the background scans like the twin (white kept) with sparse faint dots: weak foil.
- Ampharos H1, Hypno H12, Ninetales H19, Zapdos H32: yellow Pokemon touch the window edge, so the flood fill leaves
  them out of the window; harmless (they are matte anyway).

## Old recipe (what Noah saw)

`foil-holo wotc-ecard` (css/holo/wotc-ecard.css): a generic 768 px cosmos tile (`cosmos-v1.webp`) masked by blobby
per-card density maps (window x smoothed sparkle density, floor 0.22): the tile's flakes do not sit on the printed dots,
so they read as stuck-on squares; the light is a faint screen wash (window +8 at rest, +37 at 30:25); the slots, bars
and e logo are matte (they are foil on the real card).
