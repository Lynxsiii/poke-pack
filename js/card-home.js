/**
 * Which set a card belongs to when you count, list or sell it.
 *
 * Almost always that is the set in the card's id ("me5-12" is Pitch Black). The
 * ME Black Star Promos are the exception: they ship in the Mega Evolution sets'
 * own boxes, so their cards sit in those sets' data files (ids like
 * "me5-mep055", the product lists name them that way, and a collection saved
 * under that id keeps working), but they are cards of the ME Black Star Promos
 * set, not of the set whose box carried them. Anything that asks "is this card
 * in set X" (dex, completion, set value, spare copies, achievements) goes
 * through homeSetId; anything that asks "where is its data" (scans, price
 * history, the catalog lookup) keeps reading the id prefix.
 *
 * Pure: imported by the browser and by the Worker.
 */

export const MEP_SET_ID = "mep";

/** "me5-mep055", "me1-mep009-pc", "me55-mep107": a black star promo filed in an ME set's data. */
const MEP_CARD_ID = /^me\d+(?:pt5)?-mep\d/;

export function isMepCardId(cardId) {
  return MEP_CARD_ID.test(String(cardId || ""));
}

/** The id of the set a card id is counted under: "mep" for an ME black star promo, else its prefix. */
export function homeSetId(cardId) {
  const id = String(cardId || "");
  if (MEP_CARD_ID.test(id)) return MEP_SET_ID;
  const dash = id.indexOf("-");
  return dash > 0 ? id.slice(0, dash) : id;
}

/** True when `cardId` is counted under set `setId`. */
export function inHomeSet(cardId, setId) {
  return homeSetId(cardId) === String(setId || "");
}
