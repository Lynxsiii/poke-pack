# EX generation: Pokémon-ex, Gold Star, Unown, secret rares, cracked ice (css/holo/ex-ex.css)

Photos and SOURCES: /mnt/project-files/every-era/ex/texture-refs/ex-ex/. Sheets: /mnt/project-files/every-era/ex/finish-sheets/ex-ex/ (Chromium and WebKit).

## What the real cards do
- Pokémon-ex: cosmos in the art window (Pokémon included) AND on the silver frame all round it, a little brighter there; name plate, text box, stats, BASIC tab or evolution circle, Knocked Out box and (ex2-ex4) the dot strip are flat print.
- Gold Star, Unown, non-ex secret rares: cosmos in the art window only; the yellow border is plain. (The finish brief said "whole-card holo" for Gold Stars: both photo sources show window only.)
- Cracked ice (ex5 Regice/Regirock/Registeel ex, ex6 secret Articuno/Moltres/Zapdos ex): the whole face is a sheet of flat angular facets (3-12% of the card width, no outline); most barely lighter than the print, some flash silver-white or saturated; strongest in the window and silver frame; text box flat.

## How it is drawn
- No TCG Live maps. Masks are drawn by scripts/make_ex_ex_masks.py (600x838 webp, 4x supersampled), returned by `exExMap(card)` in js/ex-foil.js, which `exMap()` calls first; foil-maps.js sets `--foil-map` from it. Encoding: alpha = everything that is foil, RGB luminance = the art window alone (white window, black frame), so a layer takes the window with mask-mode luminance or the frame with alpha minus luminance (mask-composite subtract).
- Frames measured on Scrydex scans (strongest brightness gradient per edge, median per set, spread 0.2-0.3% of the card): A (ex1, ex4, ex5, ex7-ex16) window x 6.7-93.1 y 8.85-46.4; A2 (ex2) 7.8-92.3 / 9.2-46.5; B (ex3, ex6) 8.7-91.2 / 10.2-46.5. Files: `ring-<frame>[-s]-<basic|stage>` (window + silver frame; `-s` cuts the dot strip) for Pokémon-ex and secret ex, `win-<A|B>-<basic|stage>` (window only) for Gold Stars, Unown and non-ex secrets, `win-trainer` for the Supporter. `-basic` cuts the BASIC tab, `-stage` the evolution circle. Never regenerate in place: `--suffix -v2`.
- Recipe (ex-ex.css): `.foil` screen pool + colour wash; `::before` the cosmos tile (dp-cosmos-v1.webp) lit by the spectrum; `::after` the same tile in white gated by a moving band; `.glare::after` a silver band on the frame only (ring classes). Cracked ice: two copies of assets/foil/ex-cracked-ice-v1.webp (scripts/make_ex_cracked_ice.py, RGBA seamless) screened, the second gated by a band, hue turning with the tilt. Light-additive throughout because the scans already carry the foil. No colour-dodge, so no closing contrast needed; no dark layers.
- Selectors: `.ex-ex` (not cracked ice, not refractor) and `.ex-star`; `.ex-cracked-ice`; refractor prints stay with ex-delta.css. Non-ex secrets and Unown (`foil-holo ex-cosmos`) are drawn by ex.css (i1) with my window masks through exMap.

## Not settled
Ring width and sparkle strength were judged from low-resolution clip frames; no macro of the grain. Dot strip is single-source (Collexy).
