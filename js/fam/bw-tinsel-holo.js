/**
 * Holo family bw-tinsel-holo: Black & White Tinsel Rare Holo.
 *
 * Scope: every `bw-holo` print: Rare Holo of bw1-bw11, Dragon Vault, the bwp and theme-deck holos (cosmos and cracked-ice promos included).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-tinsel-holo` (every rule in css/holo/fam/bw-tinsel-holo.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * The finish each print really has (one class `bwt-<finish>` per face; research, photos and sources in
 * /mnt/project-files/holo-remaster/bw-tinsel-holo/refs/SOURCES.md, the family note in
 * .claude/skills/card-textures/reference/fam-bw-tinsel-holo.md). The era files every one of them as Tinsel; most of the
 * promos are not:
 * - tinsel: every set Rare Holo bw1-bw11, the Tinsel promos (BW01-05, BW20-22, BW32, BW60), the Trainer Kit holos.
 * - vault: Dragon Vault's 21 cards, the same Tinsel, stronger.
 * - cosmos: the blister, box and tin promos Collexy, Pokumon and TCGplayer file as Cosmos Holo, and the Snivy, Tepig and
 *   Oshawott box prints (bw2-bw1-*-cosmos). Eevee BW94's window is printed white over the foil, bare grey metal on the
 *   real card: make_bare_foil.py's grey mask (`--bwc-bare`). Only the Sylveon Collection (BW87-94) has the large
 *   bubbles (`bwt-bubbles`).
 * - ice: Cracked Ice: the theme-deck reprints (their drawn map is the whole window, Pokemon included, as on the card) and
 *   the promos BW13, BW25, BW34 (the site's TCGplayer ids are the Cracked Ice printings), BW70-72 (Live maps, Pokemon cut).
 * - mirror: a plain mirror window, no pattern: Genesect BW99 and the Dragon Vault stamped Latias, Latios, Rayquaza,
 *   Haxorus, Druddigon (their scans are photos of the foil card, the sheen is already in the pixels).
 * - rev-mirror: reverse holos (the body foil, the window matte): Thundurus BW41, Tornadus BW42, Lillipup BW52, N BW100.
 * - rev-ball: Battle City BW39, the reverse with the Poke Ball pattern (TCG Live's map carries the balls; drawn with the mirror sheen).
 * - rev-cross: the Victory Cup trophies BW29-31, Crosshatch foil (a plaid of fine horizontal ridges and +-45 degree bands)
 *   over the card's body (frame, header, text panel), the art window not foil: make_crosshatch.py's texture and its
 *   per-card map drawn from each scan.
 * - matte: Meowth BW35 is not foil at all (TCGplayer sells it as Normal only, Pokumon files it Non-Holo).
 * Tinsel, vault, cosmos and mirror faces draw TCG Live's map at full strength (make_maps.py's copies, FULL_MAP below).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const ids = (list) => new Set(list.split(/\s+/).filter(Boolean));

const FINISH = new Map();
const put = (finish, list) => ids(list).forEach((id) => FINISH.set(id, finish));
put("cosmos", `
  bw1-bwp006 bw1-bwp007 bw1-bwp008 bw1-bwp009 bw1-bwp010 bw1-bwp017
  bw2-bwp011 bw2-bwp012 bw2-bwp018 bw2-bwp019 bw2-bwp023 bw2-bwp024 bw2-bw1-1-cosmos bw2-bw1-15-cosmos bw2-bw1-27-cosmos
  bw3-bwp026 bw3-bwp027 bw4-bwp033 bw5-bwp044 bw6-bwp049 bw7-bwp056 bw7-bwp057
  bw8-bwp058 bw8-bwp059 bw8-bwp064 bw8-bwp066 bw8-bwp067 bw9-bwp076 bw9-bwp079 bw9-bwp080
  bw10-bwp085 bw10-bwp086 bw11-bwp097 bw11-bwp098
  bwp-bwp087 bwp-bwp088 bwp-bwp089 bwp-bwp090 bwp-bwp091 bwp-bwp092 bwp-bwp093 bwp-bwp094`);
put("ice", `
  bw1-5-cracked-ice bw1-19-cracked-ice bw1-31-cracked-ice bw2-40-cracked-ice bw2-62-cracked-ice bw3-12-cracked-ice bw3-80-cracked-ice
  bw2-bwp013 bw3-bwp025 bw4-bwp034 bw8-bwp070 bw8-bwp071 bw8-bwp072`);
put("mirror", "bw10-bwp099 dv1-9-dvstamp dv1-10-dvstamp dv1-11-dvstamp dv1-16-dvstamp dv1-17-dvstamp");
put("rev-mirror", "bw4-bwp041 bw4-bwp042 bw6-bwp052 bwp-bwp100");
put("rev-ball", "bw4-bwp039");
put("rev-cross", "bwp-bwp029 bwp-bwp030 bwp-bwp031");
put("matte", "bw5-bwp035");

/* Finishes not built yet: their cards stay on the era's look (bw.css) until a later pass builds them. None today. */
const LEAVE = new Set([]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isBw(card) && has(bwPattern(card), "bw-holo") && !LEAVE.has(FINISH.get(card.id));
}

/** The real finish of a claimed face (see the list above). */
export function finishOf(card) {
  return FINISH.get(card.id) || (set(card) === "dv1" ? "vault" : "tinsel");
}

/* The finishes that light a second, colour-dodged layer while the card is held (the `.cure` span). */
const DODGE = new Set(["tinsel", "vault", "cosmos", "ice"]);

/* The faces whose TCG Live map is drawn at full strength: make_maps.py's copies (alpha smoothstepped so every foil pixel
   is full; Live's maps hold inked backgrounds at 0.14-0.7, so Dragonite, Blastoise, Venusaur's cliffs drew at half
   strength where the real cards are plainly foiled). A copy is named after the map: assets/foil/maps/<p>.webp ->
   assets/foil/fam/bw-tinsel-holo/maps/<p>-v<MAP_V>.webp. */
const FULL_MAP = new Set(["tinsel", "vault", "cosmos", "mirror"]);
/* Cosmos faces whose window is printed white, bare grey metal on the real card (make_bare_foil.py). */
const BARE = new Set(["bwp-bwp094"]);
/* The Sylveon Collection's cosmos (BW87-94) also carries large soft bubbles (Collexy's Leafeon BW87 and Glaceon BW90,
   the PSA Jolteon BW91); the other cosmos promos are pinpoints only (Collexy's Zorua BW12, Ducklett BW17): class
   `bwt-bubbles` picks the bubbled texture. */
const BUBBLES = ids("bwp-bwp087 bwp-bwp088 bwp-bwp089 bwp-bwp090 bwp-bwp091 bwp-bwp092 bwp-bwp093 bwp-bwp094");
/* Tinsel faces whose foiled window is mostly pale ink (make_pale.py: alpha-weighted luma under the map at least 0.62,
   dark ink at most 12 %): their ridges show their pastel plainly when lit (Articuno 32/113 tilted), where on dark and
   mid windows the crests stay silver-white with vivid flecks only at the lamp (Victini, Klinklang, Eelektross):
   class `bwt-pale`. Oshawott BW03 is left out on its tilted photo (the blue print stays deep, the colour comes in
   saturated patches, round-3 review: the pale route washed it milky). */
const PALE = ids(`
  bw1-5 bw1-bwp001 bw10-41 bw10-54 bw10-64 bw11-22 bw11-23 bw11-32 bw11-53 bw11-105
  bw11-108 bw2-17 bw2-63 bw2-77 bw3-15 bw4-57 bw4-74 bw5-82 bw6-103 bw7-13 bw7-85 bw7-94 bw7-108 bw7-122
  bw8-34 bw8-104 bw9-83 bwtk5a-30`);
/* Faces whose real foil washes the window toward silver even off the lamp (Dragonite 83/116 in hand: the blue and
   white sky goes silver-beige): a lighter, warmer foil silver. */
const WASH = new Map([["bw9-83", "40, 10%, 71%"], ["bw1-bwp003", "215, 8%, 54%"]]);
/* Faces whose real foil throws bigger, brighter streak blocks at the lamp than the family's (--bwt-fk strength,
   --bwt-fw/--bwt-fh the band's half width and height): Blastoise 16/101's pack-pull photo, bright yellow, cyan and pink
   streak blocks over the dark water right of the head and the lower-left spray. */
const VIVID = new Map([["bw10-16", "--bwt-fk:1;--bwt-fw:86%;--bwt-fh:24%"]]);
const MAP_V = 1;
const SRC_MAPS = "assets/foil/maps/";

function fullMap(card) {
  const m = String(card.foilMap || "");
  if (!m.startsWith(SRC_MAPS) || !m.endsWith(".webp")) return "";
  return `assets/foil/fam/bw-tinsel-holo/maps/${m.slice(SRC_MAPS.length, -5)}-v${MAP_V}.webp`;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const finish = finishOf(card);
  const map = FULL_MAP.has(finish) ? fullMap(card)
    : finish === "rev-cross" ? `assets/foil/fam/bw-tinsel-holo/maps/bwp/${card.id.split("-")[1]}-cross-v1.webp` : "";
  const style = [];
  if (map) style.push(`--foil-map:url('${url(map)}')`);
  if (WASH.has(card.id)) style.push(`--bwt-silver:${WASH.get(card.id)}`);
  if (VIVID.has(card.id)) style.push(VIVID.get(card.id));
  if (BARE.has(card.id)) style.push(`--bwc-bare:url('${url(`assets/foil/fam/bw-tinsel-holo/bare/${card.id}-v1.webp`)}')`);
  const extra = (BUBBLES.has(card.id) ? " bwt-bubbles" : "") + (finish === "tinsel" && PALE.has(card.id) ? " bwt-pale" : "");
  return { classes: `fam-bw-tinsel-holo bwt-${finish}${extra}`, style: style.join(";"), cure: DODGE.has(finish) };
}
