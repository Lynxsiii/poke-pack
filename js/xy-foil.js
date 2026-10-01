/**
 * XY era finishes (2014-2016): which class string a card of the era draws with.
 *
 * Split out of foil-maps.js like js/sm-foil.js so the finish threads can tune
 * it without touching the shared file. The recipes live in css/holo/xy.css
 * (window holo, reverse, plain glare), xy-ex.css (EX, Mega EX, BREAK) and
 * xy-fullart.css (full art, secret, Radiant Collection); every class below
 * starts from the older class the Classic engine keys on (`foil-holo`,
 * `foil-ex`, `foil-ultra`, `foil-gold`) and adds its own `xy-*` class, the way
 * js/sm-foil.js does for Sun & Moon.
 *
 * The rarity words are pkmn.gg's, read from its pages on 2026-10-01 (xy1 to
 * xy12, dc1, g1; set 'Rare Holo' is NOT folded into 'Rare' for this era, see
 * scripts/build_set.py):
 *   Common, Uncommon, Rare (not foil), Rare Holo (the cosmos window holo),
 *   Rare Holo EX (Pokémon-EX; subtypes ["MEGA","EX"] for a Mega EX, name "M ..."),
 *   Rare BREAK (subtype "BREAK"), Rare Ultra (full art EX, full art Mega EX,
 *   full-art Supporter), Rare Secret (gold or shiny secret rares: EX, Mega,
 *   Trainer, Item).
 * Generations' Radiant Collection (RC1-RC32, number "RC<n>", flagged `rc: true`
 * by scripts/build_set.py) has no rarity of its own: each RC card keeps the
 * rarity of the print it reproduces (Common, Uncommon, Rare Holo EX, Rare Ultra).
 *
 * TCG Live DOES have per-card foil maps for the numbered sets (cdn.malie.io key
 * = the set id, xy1..xy12, holo prints only), Generations (key xy9-5), Double Crisis (xy5-5) and the
 * promos (xybsp), probed 2026-10-01; see .claude/skills/card-textures/scripts/
 * fetch_foil_maps.py. Not on the CDN: xy0, the Trainer Kits, McDonald's,
 * the Radiant Collection. `xyMap(card)` below is the hook where the finish
 * agents return a map path (fetched or a shared drawn one) the way smSafeMap()
 * does.
 *
 * The card's `era: "xy"` (set by build_products.py for the promos and the
 * reprints, from the set's `era`) lets a later product's reprint take the era's
 * finish through its `foilAs`; the numbered sets are recognised by id.
 */

/** An XY era print: the numbered sets, Generations, Double Crisis, the Kalos Starter Set, the promos, McDonald's 2014-16, the Trainer Kits. */
export function isXy(card) {
  return card?.era === "xy" || /^(xy\d|xy0|dc1|g1|xyp|mcd1[456]|xytk)/.test(String(card?.id || ""));
}

/** Prints that are foil edge to edge; they take the all-white map (no TCG Live map exists). */
export const XY_FULL_ART = new Set(["Rare Ultra", "Rare Secret"]);
/** Prints with an etched layer (the shared engraving tile) until a finish agent decides otherwise. */
export const XY_ETCHED = new Set(["Rare Ultra", "Rare Secret"]);

function isMega(card) {
  return (card.subtypes || []).some((s) => String(s).toUpperCase() === "MEGA") || /^M\s/.test(String(card.name || ""));
}

/** A Generations Radiant Collection card (data flag, else its g1-RC<n> id). */
export function isRadiantCollection(card) {
  return Boolean(card?.rc) || /^g1-RC\d/.test(String(card?.id || ""));
}

/**
 * The drawn foil map of an XY print, or "" for none (the generic engine then
 * decides). The finish agents fill this in: f1 returns the window mask of the
 * regular frame for `foil-holo xy-holo`, f2 the EX / Mega / BREAK frame masks,
 * f3 the full-art safe map. foilExtras() adds `has-foil-map` when it returns a path.
 */
export function xyMap(card) {
  void card;
  return "";
}

/**
 * The finish of an XY print, read from its rarity and its MEGA / BREAK subtype.
 * An empty string means the generic engine decides; "foil-none" means the card
 * is not foil (the plain Rare, as in Sword & Shield and Sun & Moon).
 */
export function xyPattern(card) {
  const subs = card.subtypes || [];
  const is = (sub) => subs.some((s) => String(s).toUpperCase() === sub);
  const trainer = card.supertype === "Trainer" || is("SUPPORTER") || is("ITEM");
  const mega = isMega(card);
  let pattern = "";
  switch (card.rarity) {
    case "Rare Secret":
      // Gold Trainers, Items and Energy, gold and shiny Pokémon-EX and Mega EX.
      pattern = `foil-gold xy-secret${mega ? " xy-mega" : ""}`;
      break;
    case "Rare Ultra":
      // Full art Pokémon-EX and Mega EX; a full-art Supporter has no frame to keep.
      pattern = trainer ? "foil-ultra xy-fa xy-tfa" : `foil-ultra xy-fa${mega ? " xy-mega" : ""}`;
      break;
    case "Rare Holo EX":
      pattern = `foil-ex xy-ex${mega ? " xy-mega" : ""}`;
      break;
    case "Rare BREAK":
      pattern = "foil-ex xy-break";
      break;
    case "Rare Holo":
      pattern = "foil-holo xy-holo";
      break;
    case "Rare":
      // The plain Rare is not foil at all.
      pattern = "foil-none";
      break;
    default:
      break;
  }
  // Generations' Radiant Collection: foil on the whole card, whatever the print's
  // rarity (a Common or Uncommon RC card is foil too; finish owner: f3).
  if (isRadiantCollection(card)) return !pattern || pattern === "foil-none" ? "foil-holo xy-rc" : `${pattern} xy-rc`;
  return pattern;
}

/**
 * The reverse holo of an XY print. One finish for every type until the finish
 * agent (f1) draws type patterns: "xy" makes foil-maps.js add the plain mirror
 * (`rev-mirror`) plus `xy-rev` and `era-xy`, which css/holo/xy.css styles.
 * A reverse of a basic Energy or a Trainer takes the same class.
 */
export function xyReverseFinish(card) {
  void card;
  return "xy";
}
