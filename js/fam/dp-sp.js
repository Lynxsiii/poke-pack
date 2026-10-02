/**
 * Holo family dp-sp: SP Pokémon holos (Platinum era).
 *
 * Scope: the SP Rare Holo basics (Pokémon G, GL, FB, C) of pl1-pl4 and the SP promos that have a drawn map.
 * Not claimed (they keep the era look): every SP LV.X (its own finish, dp-lvx), every non-holo SP card, and any
 * SP holo without a checked map.
 *
 * Part of the older-era holo remaster (2026-10-02; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-sp` (every rule in css/holo/fam/dp-sp.css is scoped to it), the card's own foil map as `--foil-map`
 * (through `url()`, which makes a repo path absolute) and `cure: true` to get the extra `.cure` layer. `base` is
 * foilExtras()'s own result; a custom property set here comes after the era's in the style attribute, so it wins.
 * `card` has been through foilLook(), so a promo's rarity is its foilAs. Never import js/foil-maps.js from here.
 *
 * The real card: the cosmos holofoil shows in the art window's BACKGROUND only; the Pokémon, the trainer portrait in
 * its medallion, the SP logo and the frame are matte ink. The maps (assets/foil/fam/dp-sp/<card id>.webp, from
 * scripts/fam/dp-sp/make_sp_maps.py) hold the foil area as alpha and the cosmos dots as grey.
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

// The faces that have a map. A face without one is not claimed and keeps the era's look.
// Left out after review #1 (2026-10-02): pl2-8 Lucario (its map lit the aura and chest), pl3-2, pl3-9 and pl3-11 (a flat hue
// wash over a pale sky); they keep the era look until their maps are re-cut.
const MAPPED = new Set("dpp-dpp41 pl1-7 pl1-12 pl1-17 pl2-2 pl2-3 pl2-4 pl2-6 pl2-9 pl2-10 pl2-11 pl2-12 pl2-dpp42 pl2-dpp43 pl3-1 pl3-3 pl3-4 pl3-8 pl4-12".split(" "));

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && (card.subtypes || []).includes("SP") && !(card.subtypes || []).includes("Level-Up") && has(dpPattern(card), "dp-holo") && MAPPED.has(String(card.id));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const map = `assets/foil/fam/dp-sp/${String(card.id)}.webp`;
  return { classes: "fam-dp-sp has-foil-map", style: `--foil-map:url('${url(map)}')`, cure: true };
}
