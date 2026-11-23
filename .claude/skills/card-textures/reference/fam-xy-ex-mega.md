# Family xy-ex-mega: XY Pokémon-EX, Mega EX, Double Crisis EX

Scope: every `xy-ex` face that is an EX or Mega EX (186: xy1-xy12, dc1, g1 main-set EX, Evolutions' M Blastoise/Venusaur-EX, 39 black star
promos). Full arts and gold secrets are xy-full-art's. Pyroar xy2-xyp026 is a Stage 1 (data says `foilAs "Rare Holo EX"`, wrongly) and stays
unclaimed. Files: `js/fam/xy-ex-mega.js`, `css/holo/fam/xy-ex-mega.css`, `assets/foil/fam/xy-ex-mega/` (sparkle-v1.webp, 40 `<id>-map.webp`,
186 `<id>-ink.webp`, dc1 `-facets-v1` / `-tint-v1`), `scripts/fam/xy-ex-mega/` (make_sparkle.py, ship_promo_maps.py, make_ink_masks.py,
make_dc_facets.py, make_dc_ink.py, list_claimed.mjs). Photos and notes: `/mnt/project-files/holo-remaster/xy-ex-mega/` (refs/SOURCES.md, sheets/).

## The real card
Regular EX / Mega EX (Bleeding Cool, Pokemon Holo x5 cards, Daniel Ortiz, SNC Grading, Double K, KauGon):
- Foil: the frame, the art background behind the Pokémon, the bottom strip and the gold plates (name tab, Mega badge, rule strip,
  Pokémon-EX rule box). Matte: the Pokémon, the text box and ALL lettering (the gold "EX", "Evolves from", HP stay ink while the plate flashes).
- Pattern: fine sparkle grain; the rainbow is tall saturated vertical columns that slide sideways as the card tilts, brightest near the lamp.

Double Crisis EX (Rare Ultra; dc1-6 Team Aqua's Kyogre-EX, dc1-15 Team Magma's Groudon-EX; ddog281330 x2, Hakuhodo, Sieye):
- A shattered-glass / cracked-ice texture over the whole print: many small angular facets (a few mm), each reflecting its own colour
  (green, magenta, orange, blue) as the tilt crosses it, so the card glitters in patches instead of sliding columns. Pokémon colours stay intact.
- TCG Live has no etch for xy5-5 (probed, 404). Confidence MEDIUM: Japanese-print photos and video frames, no macro; the English frames are tiny.

## What was built (current: audit w2-xy-ex 2026-10-22 fix, reviewed and fixed 2026-11-23)
- The real lit look is DISCRETE narrow vertical prism bars (about 3-5 % of the card each, 2-3 on the card, wide plain gaps) over a fine
  silver sparkle; unlit, print plus silver sparkle, no colour (Pokemon Holo's Mewtwo-EX 62/162 and Gengar-EX 34/119 tilt clips).
- `.foil`: the bars (`--xm-bars`, make_bars.py) over black in colour-dodge, masked to `--xm-ink` x a pointer falloff x art x Live map (twice,
  added). Unlit: sparkle only. `.foil::before`: fine prism lines on the frame ring only. `.foil::after`: sparkle, screened. `.cure`: the same
  bars in hard-light for gold plates and pale ink, masked by the scan's luminance over a 10 % floor (black ink stays black). `.glare`: overlay lamp.
- `xm-pale` (59 prints): the bars in hard-light over 50 % grey instead of the dodge (keeps colour on pale prints, art readable).
- Double Crisis dc1-6 / dc1-15: the English prints have the same bars over the whole face (their Live map covers it); the facets
  (`-facets-v1`, `-tint-v1`, make_dc_facets.py) were the Japanese print and are unused. Text rows are knocked out (make_dc_ink.text_ink).
- `--xm-ink` = `<id>-ink-v2.webp` (make_ink_masks_v2.py): name-plate ink, the gold EX found by shape, the evolution circle, rule-box header
  lettering, and Live-map islands inside the matte Pokémon. 2026-11-23 (fix2): a saturated art island with no foil within 20 px all round
  is knocked out too (red eyes: Gengar-EX xy4-34, Manectric-EX xy4-23, Magnezone, Espeon's gem; 70 prints), and the rule-lettering band also
  covers a Mega's higher "Mega Evolution rule" header (its gold "Mega" turned red under a bar on M Charizard-EX xy2-69). All 186 masks redrawn
  (wip-only files, never on master).

## Judge it
Phone size, WebKit (one card per render for lit poses) and Chromium, poses rest / 20:30 / 30:25 / 50:45 / 80:60 / 75:65 / 50:78. Frame and background flash a saturated rainbow at 30:25, a soft sheen at rest,
still colour at 50:78; Pokémon and text box within a few levels of the bare scan; name, EX, "Evolves from", HP and the circle stay readable
and in colour at every pose; no card weaker than master (`fam=off`) in HSV saturation or chroma in the foil zone; one rainbow cycle at most
over a full sweep. Double Crisis: bars like the rest, over the whole face, art colour intact.

## Open
Bars are a little fainter than the brightest photo frames (the M Charizard-EX xy2-69 tilt shows a broad bright band); the black rule-box header's
right end can take a sliver of bar colour; yellow lightning right under the name plate is knocked out by v1's gold-blob test (harmless).
