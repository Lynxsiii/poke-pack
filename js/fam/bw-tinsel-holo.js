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
 *   Oshawott box prints (bw2-bw1-*-cosmos).
 * - ice: Cracked Ice: the theme-deck reprints (their drawn map is the whole window, Pokemon included, as on the card) and
 *   the promos BW13, BW25, BW34 (the site's TCGplayer ids are the Cracked Ice printings), BW70-72 (Live maps, Pokemon cut).
 * - mirror: a plain mirror window, no pattern: Genesect BW99 and the Dragon Vault stamped Latias, Latios, Rayquaza,
 *   Haxorus, Druddigon (their scans are photos of the foil card, the sheen is already in the pixels).
 * - rev-mirror: reverse holos (the body foil, the window matte): Thundurus BW41, Tornadus BW42, Lillipup BW52, N BW100.
 * - rev-ball: Battle City BW39, the reverse with the Poke Ball pattern (TCG Live's map carries the balls; drawn with the mirror sheen).
 * - rev-cross: the Victory Cup trophies BW29-31, Crosshatch foil over the frame, the text panel and the window: NOT drawn yet
 *   (needs a crosshatch texture); LEAVE below keeps these 3 cards on the era look.
 * - matte: Meowth BW35 is not foil at all (TCGplayer sells it as Normal only, Pokumon files it Non-Holo).
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

/* Finishes this pass did not get to: their cards stay on the era's look (bw.css) until a later pass builds them. */
const LEAVE = new Set(["rev-cross"]);

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

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const finish = finishOf(card);
  return { classes: `fam-bw-tinsel-holo bwt-${finish}`, style: "", cure: DODGE.has(finish) };
}
