# Family xy-evo-secret: Evolutions' five secret rares (xy12-109 to 113), drawn flat on purpose

Part of the secret rare remake (2026-10-02). Module `js/fam/xy-evo-secret.js`, sheet `css/holo/fam/xy-evo-secret.css` (no rules),
assets none (no `assets/foil/fam/xy-evo-secret/` folder was needed), script `.claude/skills/card-textures/scripts/fam/xy-evo-secret/compose_sheets.py`
(builds the comparison and evidence sheets). Research, photos and sheets: `/mnt/project-files/holo-remaster/xy-evo-secret/`
(`refs/SOURCES.md`, `sheets/`, `REPORT.md`, `LESSONS.md`).

Scope: xy12-109 Exeggutor (Japanese text), 110 Flying Pikachu, 111 Surfing Pikachu, 112 Imakuni?'s Doduo, 113 Here Comes Team Rocket!
(not their reverses: xy12's `reverseRarities` is Common, Uncommon, Rare and Rare Holo, so a Rare Secret is never a reverse; the census shows 5 holo faces and 0 reverse faces).

## What the real cards do
**They are not foil.** All five are plain glossy cardstock, edge to edge. The art window, the gold bevel round it, the mottled paper
wash (green on Exeggutor, cream yellow on the Pikachus, silver-grey on the Doduo) and the Trainer's brushed-silver frame are printed
ink. In the light they give a warm gradient and one soft white gloss patch, with no glitter, rainbow, etched lines or prismatic edge.
Evidence (high confidence, 42 frames from 20 videos in `refs/SOURCES.md`):
- Same-frame comparisons with holo cards: Exeggutor beside the Starlight Charizard 11 (`BHiKUHpasvk`: stars in the Charizard window,
  a flat window on Exeggutor; `sheets/real-windows-zoom.jpg`), Surfing Pikachu in front of two holo Charizards (`CgrBNLI9jfo`), the
  Doduo PSA 10 slab beside a holo Venusaur EX slab (`NYVr7Onu494`), binder pages with a flashing holo neighbour (`rLZPtjeU5cc`,
  `UDQoPgX35rY`).
- Angled and sunlit photos: Flying Pikachu in direct sunlight (`y93vCfO2MGc`), Doduo in three tilts (`JMR8y22nM6M`), Team Rocket tilted
  and flat (`KQ1lgKejVWM`, `UjQr3Leb2K0`), Exeggutor in hand (`bN64Z-wNSGk`).
- Catalogues: Scrydex and Cardrake list one variant, Normal; eBay's finish field says "Regular"; TCG Live answers 200 for the card image
  and 404 for both the foil and the etch map; Collexy's XY overview gives no pattern to any Evolutions secret; the five are printed on
  the uncommon sheet (Elite Fourum rarity guide), which is plain stock.

## What it draws
Nothing. `js/xy-foil.js` `xyPattern()` returns `foil-none` for them through `isNotFoil()` (`/^xy12-1(09|1[0-3])$/`), and `css/holo/base.css`
(lines about 175-177, `body.fx-holo... .tcg.foil-none .foil, .glare { display: none }`, plus `css/app.css` for Classic mode) hides the foil
and glare layers, so the card is the bare scan under the tilt, like every plain Rare, Uncommon and Common of the site. The module only
claims the five faces (so the census and the lab list them as a family) and adds `fam-xy-evo-secret`; its style and `cure` are empty.
They also carry `has-etch-tile` (`XY_ETCHED` holds "Rare Secret"), which is harmless: `.foil` is hidden, so the etch tile is never painted.
Hiding `.foil, .glare, .cure` changes no pixel, and `&famskip=xy-evo-secret` (the BEFORE) is pixel-identical to the AFTER (max abs diff 0
over every tile of `sheets/before-after-evo-secret-*.jpg`).

## How to judge it
Lab (WebKit, 2 to 3 cards per page): `WEBKIT=1 /home/user/holo-tools/render-slot.sh node .claude/skills/card-textures/scripts/foil_probe.mjs --browser webkit --boxes --query "set=xy12&cards=109,110,111&proof=off&w=220&poses=rest,30:25,75:65,50:78[&famskip=xy-evo-secret]" --width 760 --scale 3 --out x.png`.
Expect the bare scan at every pose, classes `tcg rare-secret foil-none [foil-evo|foil-trainer] has-etch-tile era-xy fam-xy-evo-secret`.
`compose_sheets.py --renders <dir> --out <dir>` builds `phone-compare.jpg` (real photo | before | after at 30:25), the two
`before-after-evo-secret-*.jpg` and the evidence sheets from the `--boxes` renders (file names in its docstring).
Gates run on 2026-10-02: `foil_coverage.mjs xy12` (and `BATCH=60`) prints nothing; `dark_specks.py --set xy12 --cards 109,110,111,112,113`
0 specks, 0 dark area; `foil_probe.mjs --idle` 0 ms and no running animations; `rainbow_speed.py ... --all` lists no layer; the module emits no URL;
`famcensus.mjs`: 5 faces, 0 reverse.

## What remains
- No macro photograph at a raking angle for any of the five (frames are 480p to 720p). What would change the verdict: a clear macro or a
  slow tilt video of a real copy showing glitter or etched lines in the art window. Then draw the mask from the card's own scan (the five
  scans are `assets/cards/xy12/109..113.webp`, 600x838) and rainbow only where that photo shows it.
- A few eBay titles say "Holo" (sellers filing Secret Rare as holo); the structured sources all say plain. One blurred 480p frame
  (`FudmNb5ysuk` hq3, Surfing Pikachu close to the lens) shows a smooth blue-violet haze; no grain or pattern, and the same video's sharp frame is plain: read as a reflection.
- Plain gloss: a real glossy card glints a little, the site's non-foil cards (every `foil-none` print) draw none, because the "plain varnish"
  `.glare` rules (`css/holo/base.css` about 266, `css/holo/xy.css` about 266) sit behind the `display: none` above and never show. Whether
  non-foil prints should glint is a site-wide decision, not this family's.
- `reference/xy-fullart.md` still says the 109-113 "not foil" verdict "rests on two sources of medium confidence"; it now rests on five lines of
  evidence (high).
- Collexy's XY holofoil overview (the page read here) names the Energy Pattern for Evolutions' reverse holos, where `reference/fam-xy-evolutions.md` quotes Collexy for the
  Mirror Pattern: two Collexy pages disagree, and only a photo of a real Evolutions reverse settles it (not this family's cards).
