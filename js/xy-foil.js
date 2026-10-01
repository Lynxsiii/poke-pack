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

/**
 * Prints that are foil edge to edge and take foilExtras()'s all-white map. EMPTY on
 * purpose (f3, 2026-10-01): the full arts (Rare Ultra, Rare Secret) take a text-safe
 * map per frame from xyFullArtMap() below, through the xyMap() hook, so the attack
 * text, name bar and rule box stay calm (css/holo/xy-fullart.css).
 */
export const XY_FULL_ART = new Set();
/** Prints with an etched layer (the shared engraving tile) until a finish agent decides otherwise. */
export const XY_ETCHED = new Set(["Rare Ultra", "Rare Secret"]);

/** Ancient Origins' three shiny full arts (Primal Kyogre, Primal Groudon, M Rayquaza), filed Rare Secret. */
const XY_SHINY = new Set(["xy7-96", "xy7-97", "xy7-98"]);
/** Secret EX printed in silver rather than a gold border (css/holo/xy-fullart.css). */
const XY_SILVER = new Set(["xy4-122"]);

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
  const fa = xyFullArtMap(card);
  if (fa) return fa;
  void card;
  return "";
}

/**
 * f3: the text-safe map of a full art, secret rare or Radiant Collection card,
 * one per frame (scripts/make_xy_safe_maps.py): `ex` Basic full-art EX and the
 * gold-border secret EX, `mega` Mega EX (also the shiny Mega and Primal),
 * `tfa` full-art Supporter, `item` gold Trainer Item, `rc` a regular-frame Radiant Collection
 * card. "" for any other card. Used only where TCG Live has no map (cards with `foilMap` keep it).
 */
export function xyFullArtFrame(card) {
  // Radiant Collection: RC1-RC27 are regular frames (`rc`), RC28-RC32 full arts (below).
  if (isRadiantCollection(card) && card.rarity !== "Rare Ultra") return "rc";
  if (card?.rarity !== "Rare Ultra" && card?.rarity !== "Rare Secret") return "";
  // A reprint in a later product (foilAs, era other than xy) keeps its own finish; a promo of the
  // era itself (xyp150a, the g1 / xy8 / xy10 xyp prints: era "xy" + foilAs "Rare Ultra") is the full art.
  if (card.foilAs && card.era !== "xy") return "";
  const subs = (card.subtypes || []).map((s) => String(s).toUpperCase());
  if (card.supertype === "Trainer" || subs.includes("SUPPORTER") || subs.includes("ITEM")) {
    return card.rarity === "Rare Secret" ? "item" : "tfa";
  }
  return isMega(card) || /^Primal /.test(String(card.name || "")) ? "mega" : "ex";
}
export function xyFullArtMap(card) {
  const frame = xyFullArtFrame(card);
  return frame && !isNotFoil(card) ? `assets/foil/xy-safe-${frame}-v1.webp` : "";
}

/** The five Evolutions secret rares (109-113) are the 1999 promos reprinted flat: Scrydex lists them as "normal", not holofoil. */
function isNotFoil(card) {
  return /^xy12-1(09|1[0-3])$/.test(String(card?.id || ""));
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
  // f2: Double Crisis's two EX (Team Aqua's Kyogre, Team Magma's Groudon) print on a
  // full-bleed frame of their own, whatever rarity word the data gives them.
  if (XY_DC_EX.has(card.id)) return "foil-ex xy-ex xy-dc";
  switch (card.rarity) {
    case "Rare Secret":
      // Evolutions' five secrets (109-113) are flat reprints: not foil.
      if (isNotFoil(card)) {
        pattern = "foil-none";
        break;
      }
      // Gold Trainer Items and Energy are gold stock (xy-secret xy-item). A secret Pokémon-EX
      // or Mega EX is a full art in a gold border (xy-secret-ex), or Ancient Origins' shiny
      // (xy-shiny); Dialga EX 122/119 is a silver one (xy-silver).
      if (trainer) pattern = "foil-gold xy-secret xy-item";
      else {
        pattern = `foil-ultra xy-fa xy-secret xy-secret-ex${mega ? " xy-mega" : ""}`;
        if (XY_SHINY.has(card.id)) pattern += " xy-shiny";
        if (XY_SILVER.has(card.id)) pattern += " xy-silver";
      }
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
  // RC1-RC27 take one finish whatever frame they copy (the EX frames of RC6 and RC21 too,
  // so f2's EX recipe never meets the sparkle sheet); RC28-RC32 are full arts: xy-fa + xy-rc.
  if (isRadiantCollection(card)) return card.rarity === "Rare Ultra" && pattern ? `${pattern} xy-rc` : "foil-holo xy-rc";
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

/* ---- f2: Pokémon-EX, Mega EX, BREAK, Double Crisis EX (css/holo/xy-ex.css) ---- */

/** Double Crisis' Team Aqua's Kyogre-EX and Team Magma's Groudon-EX: full-bleed art behind the text. */
export const XY_DC_EX = new Set(["dc1-6", "dc1-15"]);
