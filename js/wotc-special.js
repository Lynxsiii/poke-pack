/**
 * Wizards of the Coast special finishes (finish agent j3): the Shining Pokémon of Neo Revelation and Neo Destiny, the
 * reverse-holo promos of the Wizards Black Star set and Best of Game, and the First Movie gold-stamp promos. Kept in its own
 * module like js/wotc-ecard-maps.js so the three finish threads edit different files; js/wotc-foil.js calls these first.
 * The recipes are in css/holo/wotc-special.css, the masks in assets/foil/wotc-shining/ and assets/foil/wotc-promo/ (drawn
 * from the scans by scripts/make_wotc_shining_masks.py and make_wotc_promo_masks.py: TCG Live has no maps for this era).
 * What the photos show is in .claude/skills/card-textures/reference/wotc-special.md.
 */

const SHINING = "assets/foil/wotc-shining/";
const PROMO = "assets/foil/wotc-promo/";

/** Neo Revelation 65-66 and Neo Destiny 106-113, by id (the set files call them "Rare Shining"). */
function shiningId(card) {
  const m = /^(neo[34])-(\d+)$/.exec(String(card?.id || ""));
  return card?.rarity === "Rare Shining" && m ? `${m[1]}-${m[2]}` : "";
}

/** The reverse-holo promos' frame: the masks in assets/foil/wotc-promo/. basep 34 Entei, 35 Pichu; bp 1, 2, 3, 8, 9. */
const REVERSE_FRAME = {
  "basep-basep34": "neo",
  "basep-basep35": "baby",
  "bp-bp01": "neo",
  "bp-bp02": "neo",
  "bp-bp03": "trainer",
  "bp-bp08": "rocket",
  "bp-bp09": "neo",
};

/** basep 2-5: the Kids WB "The First Movie" gold stamp promos. */
function isFirstMovie(card) {
  return /^basep-basep0[2-5]$/.test(String(card?.id || ""));
}

/** The class string of a print this module draws, or null for any other (wotcPattern then carries on). */
export function specialPattern(card) {
  if (shiningId(card)) return /^neo3-/.test(card.id) ? "foil-holo wotc-shining wotc-shining-bg" : "foil-holo wotc-shining";
  if (isFirstMovie(card)) return "foil-holo wotc-stamp";
  return null;
}

/** The mask path of a Shining (its figure, or its background for Neo Revelation) or a First Movie stamp, else "". */
export function specialMap(card) {
  const s = shiningId(card);
  if (s) return `${SHINING}${s}.webp`;
  if (isFirstMovie(card)) return `${PROMO}stamp-firstmovie.webp`;
  return "";
}

/** "wotc-promo-<frame>" for a reverse-holo promo of basep or bp, else "". */
export function specialReverseFinish(card) {
  const frame = REVERSE_FRAME[String(card?.id || "")];
  return frame ? `wotc-promo-${frame}` : "";
}

/** The reverse promo's frame mask path for a finish returned by specialReverseFinish(). */
export function specialReverseMap(finish) {
  return `${PROMO}${String(finish).slice("wotc-promo-".length)}.webp`;
}
