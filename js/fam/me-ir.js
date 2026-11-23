/**
 * Holo family me-ir: the Mega Evolution Illustration Rares (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: every non-reverse face whose rarity (after foilLook(), so a promo's foilAs) is "Illustration Rare" in the Mega
 * Evolution sets (ids `me1-` to `me5-` and `me2pt5-`; not `me55-`, the 30th Celebration keeps celebration.css): the
 * set IRs and the ME Black Star promos foiled as IR, stamped prints included. 145 faces on 2026-10-22.
 *
 * TCG Live prints them SUN_PILLAR / HOLO with a per-card foil map: the Pokemon (and trainer, and text) at 0, the
 * painted background graded by tone, the silver border at full. The data carries that map for 17 faces (the stamped
 * promos and their plain prints, mep026, mep070); the other 128 fell to the all-white full.webp, so the foil covered
 * the Pokemon. scripts/fam/me-ir/ship_live_maps.py ships Live's map for each of those as
 * assets/foil/fam/me-ir/<id>-map.webp, and this module points `--foil-map` at it (a custom property set here comes
 * after the era's in the style attribute, so it wins).
 *
 * The look is css/holo/fam/me-ir.css, scoped to `.fam-me-ir` (research and photos: reference/fam-me-ir.md).
 */

const DIR = "assets/foil/fam/me-ir";

/** Faces the data gives no foil map, with TCG Live's map shipped as <id>-map.webp (ship_live_maps.py --ids-only). */
const LIVE_MAP = new Set([
  "me1-133", "me1-134", "me1-135", "me1-136", "me1-137", "me1-138", "me1-139", "me1-140", "me1-141", "me1-142",
  "me1-143", "me1-144", "me1-145", "me1-146", "me1-147", "me1-148", "me1-149", "me1-150", "me1-151", "me1-152",
  "me1-153", "me1-154", "me1-mep037", "me1-mep038", "me1-mep039", "me1-mep040", "me1-mep041", "me1-mep042",
  "me1-mep043", "me1-mep044", "me1-mep045",
  "me2-95", "me2-96", "me2-97", "me2-98", "me2-99", "me2-100", "me2-101", "me2-102", "me2-103", "me2-104", "me2-105",
  "me2-106", "me2-107",
  "me2pt5-218", "me2pt5-219", "me2pt5-220", "me2pt5-221", "me2pt5-222", "me2pt5-223", "me2pt5-224", "me2pt5-225",
  "me2pt5-226", "me2pt5-227", "me2pt5-228", "me2pt5-229", "me2pt5-230", "me2pt5-231", "me2pt5-232", "me2pt5-233",
  "me2pt5-234", "me2pt5-235", "me2pt5-236", "me2pt5-237", "me2pt5-238", "me2pt5-239", "me2pt5-240", "me2pt5-241",
  "me2pt5-242", "me2pt5-243", "me2pt5-244", "me2pt5-245", "me2pt5-246", "me2pt5-247", "me2pt5-248", "me2pt5-249",
  "me2pt5-250",
  "me3-89", "me3-90", "me3-91", "me3-92", "me3-93", "me3-94", "me3-95", "me3-96", "me3-97", "me3-98", "me3-99",
  "me4-87", "me4-88", "me4-89", "me4-90", "me4-91", "me4-92", "me4-93", "me4-94", "me4-95", "me4-96", "me4-97",
  "me4-mep046", "me4-mep047", "me4-mep048", "me4-mep049", "me4-mep050", "me4-mep051", "me4-mep052", "me4-mep053",
  "me4-mep054",
  "me5-85", "me5-86", "me5-87", "me5-88", "me5-89", "me5-90", "me5-91", "me5-92", "me5-93", "me5-94", "me5-95",
  "me5-mep055", "me5-mep056", "me5-mep057", "me5-mep058", "me5-mep059", "me5-mep060", "me5-mep061", "me5-mep062",
  "me5-mep063",
]);

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern) return false;
  if (!/^me\d(pt5)?-/.test(String(card.id || ""))) return false;
  return card.rarity === "Illustration Rare";
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const style = [];
  if (!card.foilMap && LIVE_MAP.has(id)) style.push(`--foil-map:url('${url(`${DIR}/${id}-map.webp`)}')`);
  return { classes: "fam-me-ir", style: style.join(";"), cure: false };
}
