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
export const BWP_SET_ID = "bwp";
export const DPP_SET_ID = "dpp";
export const HSP_SET_ID = "hsp";
export const NP_SET_ID = "np";
export const BASEP_SET_ID = "basep";
export const BP_SET_ID = "bp";

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
 *  - "bwp": "bw5-bwp045", "dv1-bwp012" (a Black & White set's file, Dragon Vault's
 *    included); the rest are data/bwp.json's "bwp-bwp001".
 *  - "dpp": "dp1-dpp01", "pl2-dpp42" (a Diamond & Pearl or Platinum set's file: the DP Black Star Promos' Platinum
 *    numbers DP35-DP56 come with Platinum packs); the rest are data/dpp.json's "dpp-dpp05".
 *  - "hsp": "hgss2-hsp10", "col1-hsp24" (an HGSS set's file, Call of Legends included); the rest are data/hsp.json's "hsp-hsp01".
 *  - "np": "ex1-np012", "ex9-np037", "pop1-np001" (an EX set's file or a POP Series file: the Nintendo Black Star Promos that came
 *    in the tins, value packs and blisters of that set); the rest (magazines, DVDs, events) are data/np.json's "np-np001".
 *  - "basep": "base2-basep01", "neo1-basep22" (a Wizards of the Coast set's file: Base Set to Skyridge and Southern Islands carry the
 *    Wizards Black Star Promos their boxes, decks and gift sets held); the rest are data/basep.json's "basep-basep09".
 *  - "bp": Best of Game is its own promo set with no product that carries it (BattleZone tournament prizes), so every card is
 *    data/bp.json's "bp-bp01"; the entry only keeps the shape the other homes have.
 */
export const PROMO_HOMES = {
  [MEP_SET_ID]: { test: /^me\d+(?:pt5)?-mep\d/, like: ["me%-mep%"] },
  [XYP_SET_ID]: { test: /^(?:xy\d+|dc1|g1)-xyp\d/, like: ["xy%-xyp%", "dc1-xyp%", "g1-xyp%"] },
  [BWP_SET_ID]: { test: /^(?:bw\d+|dv1)-bwp\d/, like: ["bw%-bwp%", "dv1-bwp%"] },
  [DPP_SET_ID]: { test: /^(?:dp\d+|pl\d+)-dpp\d/, like: ["dp%-dpp%", "pl%-dpp%"] },
  [HSP_SET_ID]: { test: /^(?:hgss\d+|col1)-hsp\d/, like: ["hgss%-hsp%", "col1-hsp%"] },
  [NP_SET_ID]: { test: /^(?:ex\d+|pop[1-5])-np\d/, like: ["ex%-np%", "pop%-np%"] },
  [BASEP_SET_ID]: { test: /^(?:base\d|gym\d|neo\d|si1|ecard\d)-basep\d/, like: ["base_-basep%", "gym_-basep%", "neo_-basep%", "si1-basep%", "ecard_-basep%"] },
  [BP_SET_ID]: { test: /^(?:base\d|gym\d|neo\d|si1|ecard\d)-bp\d/, like: ["base_-bp%", "gym_-bp%", "neo_-bp%", "si1-bp%", "ecard_-bp%"] },
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

export function isBwpCardId(cardId) {
  return promoHomeOf(cardId) === BWP_SET_ID;
}

export function isDppCardId(cardId) {
  return promoHomeOf(cardId) === DPP_SET_ID;
}

export function isHspCardId(cardId) {
  return promoHomeOf(cardId) === HSP_SET_ID;
}

export function isNpCardId(cardId) {
  return promoHomeOf(cardId) === NP_SET_ID;
}

export function isBasepCardId(cardId) {
  return promoHomeOf(cardId) === BASEP_SET_ID;
}

export function isBpCardId(cardId) {
  return promoHomeOf(cardId) === BP_SET_ID;
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

/**
 * Trainer Kit copies. From the HGSS Trainer Kit (2010) on, every card of a 30-card half deck has its own number, so
 * the Bisharp deck's eleven Metal Energy are 2/30, 3/30 ... 24/30: the same card eleven times, which TCGplayer sells
 * as eleven singles. The site lists and counts each card once, under its lowest number, and a kit deals that id as
 * many times as the deck holds it (data/box-contents.json). The holofoil Pokémon (#30) is a card of its own. Each
 * group is the numbers of one card's copies, lowest first; the decklists and their sources are in
 * /mnt/project-files/kit-energies/ and scripts/test-kit-copies.mjs checks them against the data files.
 *
 * Collections from before 2026-10-02 can hold the higher numbers ("xytk7a-3"): they stay as they are and count as
 * the card they copy wherever cards are listed or counted (dexId), and selling one sells the id the player holds.
 */
export const KIT_COPIES = {
  xytk6a: [[5, 6, 7, 8, 9, 10, 17, 25], [11, 18], [12, 23], [15, 27], [19, 22, 26, 28]],
  xytk6b: [[1, 19], [2, 3, 5, 6, 7, 8, 9, 10, 12, 17, 18, 25], [11, 27], [13, 21], [14, 29], [16, 22], [20, 24]],
  xytk7a: [[2, 3, 5, 6, 7, 8, 9, 10, 18, 22, 24], [4, 28], [11, 27], [13, 21], [14, 23], [15, 26], [25, 29]],
  xytk7b: [[1, 18], [2, 23], [3, 5, 6, 7, 8, 9, 10, 17, 21, 22, 27], [11, 29], [12, 25], [13, 19], [15, 20], [16, 28]],
  xytk8a: [[1, 27], [2, 3, 5, 6, 7, 8, 9, 10, 17], [4, 25], [11, 28], [12, 26], [14, 22], [15, 23], [16, 18, 29], [19, 24]],
  xytk8b: [[1, 2, 3, 5, 19], [6, 21], [7, 24], [8, 9, 10, 17, 22, 28], [11, 23], [12, 25], [13, 26], [18, 27], [20, 29]],
  xytk9a: [[1, 27], [2, 3, 5, 6, 8, 9, 10, 17, 18, 29], [4, 25], [11, 28], [12, 26], [13, 22], [15, 23], [19, 24]],
  xytk9b: [[1, 2, 3, 5, 8, 9, 10, 17, 19, 22, 28], [6, 21], [7, 24], [11, 23], [12, 25], [13, 26], [18, 27], [20, 29]],
  bwtk5a: [[1, 25], [3, 5, 6, 7, 8, 9, 10, 20, 22, 24, 26, 28], [4, 19], [12, 29], [13, 23], [14, 21]],
  bwtk5b: [[1, 27], [2, 3, 5, 6, 7, 8, 9, 10, 20, 22, 26, 28], [11, 29], [12, 18], [13, 25], [15, 23]],
  hgsstk4a: [[1, 14], [2, 3, 4, 6, 7, 8, 9, 10, 11, 16, 26, 29], [5, 18], [12, 19], [13, 17], [15, 24], [22, 27]],
  hgsstk4b: [[1, 26], [2, 16], [3, 17], [4, 12], [5, 6, 7, 8, 9, 10, 11, 14, 15, 18, 23, 28], [13, 20], [22, 27]],
};

const COPY_OF = new Map(); // "xytk7a-3" -> "xytk7a-2"
const COPY_IDS = new Map(); // "xytk7a-2" -> ["xytk7a-2", "xytk7a-3", ...]
for (const [setId, groups] of Object.entries(KIT_COPIES)) {
  for (const group of groups) {
    const ids = group.map((n) => `${setId}-${n}`);
    COPY_IDS.set(ids[0], ids);
    for (const id of ids.slice(1)) COPY_OF.set(id, ids[0]);
  }
}

/** The id a card is listed and counted under: a Trainer Kit copy's lowest number, else the id itself. */
export function dexId(cardId) {
  const id = String(cardId || "");
  return COPY_OF.get(id) || id;
}

/** Every id that counts as the same card, its dexId first ("xytk7a-2", "xytk7a-3" ... "xytk7a-24"); [id] for most cards. */
export function dexIds(cardId) {
  const id = dexId(cardId);
  return COPY_IDS.get(id) || [id];
}

/** How many of a set's numbers are copies of a lower number (17 in a Trainer Kit half deck such as xytk6b, else 0). */
export function kitCopyCount(setId) {
  return (KIT_COPIES[setId] || []).reduce((n, group) => n + group.length - 1, 0);
}

/** A `{ cardId: qty }` map with every copy's quantity added to its dexId, for counting and listing. */
export function foldCopies(owned) {
  const out = {};
  for (const [id, n] of Object.entries(owned || {})) {
    if (!(n > 0)) continue;
    const key = dexId(id);
    out[key] = (out[key] || 0) + n;
  }
  return out;
}
