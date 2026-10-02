/**
 * Holo family bw-secret: Black & White secret rares (32 faces).
 *
 * Scope: every `bw-secret` print. The gold secrets and gold Items of Boundaries Crossed to Plasma Blast (bw7-bw10),
 * the yellow-bordered secrets (Pikachu bw1-115, Meowth bw3-102 and the shiny reprints and Pokémon Catcher of
 * bw4-bw6) and Legendary Treasures' all-gold Reshiram and Zekrom (bw11-114, bw11-115).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-secret` (every rule in css/holo/fam/bw-secret.css is scoped to it), a finish class and the family's own
 * maps as custom properties, and `cure: true` for the extra `.cure` layer the sheet paints the lit holo on.
 *
 *   bws-gold      bw7-bw10: brushed gold frame (`--bws-metal`), holo art window and type symbol (`--bws-holo`)
 *   bws-goldfull  bw11-114, bw11-115: the whole face mirror gold, engraved
 *   bws-yellow    bw1, bw3-bw6: matte yellow frame, the Pokémon (or the Item) and the type symbol are the foil
 *   bws-grain     bw1-115, bw3-102 (with bws-yellow): the scenery is pebbled varnish (`--bws-grain-a`, `-b`)
 *   --bws-etch    every face: TCG Live's etch at its native 733 x 1024, alpha = what is etched
 *
 * The maps are built by .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_maps.py into
 * assets/foil/fam/bw-secret/; a face without them is not claimed, so it keeps the era sheet's look rather than
 * painting with a missing mask. Never import js/foil-maps.js from here (it waits on this module).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Every face the maps were built for, by finish. */
const GOLD = new Set([
  "bw7-150", "bw7-151", "bw7-152", "bw7-153",
  "bw8-136", "bw8-137", "bw8-138",
  "bw9-117", "bw9-118", "bw9-119", "bw9-120", "bw9-121", "bw9-122",
  "bw10-102", "bw10-103", "bw10-104", "bw10-105",
]);
const GOLD_FULL = new Set(["bw11-114", "bw11-115"]);
const YELLOW = new Set([
  "bw1-115", "bw3-102",
  "bw4-100", "bw4-101", "bw4-102", "bw4-103",
  "bw5-109", "bw5-110", "bw5-111",
  "bw6-125", "bw6-126", "bw6-127", "bw6-128",
]);
const GRAIN = new Set(["bw1-115", "bw3-102"]);
const DIR = "assets/foil/fam/bw-secret";

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isBw(card) || !has(bwPattern(card), "bw-secret")) return false;
  const id = String(card.id || "");
  return GOLD.has(id) || GOLD_FULL.has(id) || YELLOW.has(id);
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const map = (kind, suffix = "") => `url('${url(`${DIR}/${kind}/${id}${suffix}.webp`)}')`;
  const style = [`--bws-etch:${map("etch")}`];
  let finish = "bws-yellow";
  if (GOLD.has(id)) {
    finish = "bws-gold";
    style.push(`--bws-metal:${map("metal")}`, `--bws-holo:${map("holo")}`);
  } else if (GOLD_FULL.has(id)) {
    finish = "bws-goldfull";
  } else if (GRAIN.has(id)) {
    finish = "bws-yellow bws-grain";
    style.push(`--bws-grain-a:${map("grain", "-a")}`, `--bws-grain-b:${map("grain", "-b")}`);
  }
  return { classes: `fam-bw-secret ${finish}`, style: style.join(";"), cure: true };
}
