/**
 * The drawn foil maps of the e-Card sets (Expedition, Aquapolis, Skyridge). TCG Live published no maps for 2002-2003, so
 * the art window of the e-Reader frame was measured on the scans (scripts/make_wotc_ecard_masks.py) and the Crystal
 * Pokémon's "clear" figure was cut out of their own scans (scripts/make_wotc_crystal_masks.py). Called from wotcMap() in
 * js/wotc-foil.js; the reverse holo and the Crystal's body foil take their masks from css/holo/wotc-ecard.css instead
 * (the layout classes foil-trainer / foil-energy pick the file), because a reverse card carries no foil map.
 */

const DIR = "assets/foil/wotc-ecard/";

/** Every Pokémon holo of the three sets sits in the one e-Card frame: the Pokémon window. */
const WINDOW = `${DIR}win-pokemon-v1.webp`;

/** Crystal Pokémon with a drawn mask (window minus the Pokémon): ids ecard2-148..150, ecard3-145..150. */
const CRYSTAL = new Set(["ecard2-148", "ecard2-149", "ecard2-150", "ecard3-145", "ecard3-146", "ecard3-147", "ecard3-148", "ecard3-149", "ecard3-150"]);

/** The foil map of an e-Card print, or "" for none (every non-holo e-Card print has none). */
export function ecardMap(card) {
  const id = String(card?.id || "");
  if (!/^ecard[123]-/.test(id)) return "";
  if (CRYSTAL.has(id)) return `${DIR}crystal-${id}-v1.webp`;
  // A Rare Holo takes its own map: the window times the density of the scan's baked sparkle, floored (rv-j2: the shared window
  // put flakes on the Pokémon's dark body; scripts/make_wotc_ecard_holo_maps.py). Every Rare Holo of the three sets has one.
  if (card.rarity === "Rare Holo") return `${DIR}holo-${id}-v1.webp`;
  if (card.rarity === "Rare Crystal" || card.rarity === "Rare Secret") return WINDOW;
  return "";
}
