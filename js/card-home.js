/**
 * Which set a card belongs to when you count, list or sell it.
 *
 * Almost always that is the set in the card's id ("me5-12" is Pitch Black). The
 * black star promo sets (ME Black Star Promos, XY Black Star Promos) are the
 * exception: their promos ship in other sets' own boxes, so the cards sit in
 * those sets' data files (ids like "me5-mep055" or "xy5-xyp003", the product
 * lists name them that way, and a collection saved under that id keeps
 * working), but they are cards of the promo set, not of the set whose box
 * carried them. Anything that asks "is this card
 * in set X" (dex, completion, set value, spare copies, achievements) goes
 * through homeSetId; anything that asks "where is its data" (scans, price
 * history, the catalog lookup) keeps reading the id prefix.
 *
 * Pure: imported by the browser and by the Worker.
 */

export const MEP_SET_ID = "mep";
export const XYP_SET_ID = "xyp";

/**
 * Promo homes: for each black star promo set, a test for the ids of its cards
 * that sit in other sets' data files, and the SQL LIKE patterns that find those
 * rows (the Worker). A black star promo never counts toward the dex of the set
 * whose box carried it.
 *
 *  - "mep": "me5-mep055", "me1-mep009-pc", "me55-mep107" (an ME set's file).
 *  - "xyp": "xy5-xyp003", "g1-xyp010", "dc1-xyp005" (an XY set's file). The
 *    promos no set's product claims live in data/xyp.json as "xyp-xyp001" and
 *    count as xyp through their own prefix.
 */
export const PROMO_HOMES = {
  [MEP_SET_ID]: { test: /^me\d+(?:pt5)?-mep\d/, like: ["me%-mep%"] },
  [XYP_SET_ID]: { test: /^(?:xy\d+|dc1|g1)-xyp\d/, like: ["xy%-xyp%", "dc1-xyp%", "g1-xyp%"] },
};

/** SQL LIKE patterns for every promo-home id filed in another set's file. */
export const PROMO_HOME_LIKE = Object.values(PROMO_HOMES).flatMap((home) => home.like);

/** The promo set a card id is filed under when it sits in another set's file ("mep", "xyp"), else "". */
export function promoHomeOf(cardId) {
  const id = String(cardId || "");
  for (const [setId, home] of Object.entries(PROMO_HOMES)) if (home.test.test(id)) return setId;
  return "";
}

export function isMepCardId(cardId) {
  return promoHomeOf(cardId) === MEP_SET_ID;
}

export function isXypCardId(cardId) {
  return promoHomeOf(cardId) === XYP_SET_ID;
}

/** The id of the set a card id is counted under: a promo set for a black star promo filed in another set's data, else its prefix. */
export function homeSetId(cardId) {
  const id = String(cardId || "");
  const promo = promoHomeOf(id);
  if (promo) return promo;
  const dash = id.indexOf("-");
  return dash > 0 ? id.slice(0, dash) : id;
}

/** True when `cardId` is counted under set `setId`. */
export function inHomeSet(cardId, setId) {
  return homeSetId(cardId) === String(setId || "");
}
