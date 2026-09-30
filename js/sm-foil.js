/**
 * Sun & Moon era finishes: which class string a card of the era draws with.
 *
 * Split out of foil-maps.js so the era's finish threads can tune it without
 * touching the shared file. The recipes live in css/holo/sm.css (window
 * holo, reverse), sm-gx.css (GX, Tag Team, Prism Star), sm-fullart.css
 * (full art, rainbow, gold) and sm-shiny.css (Hidden Fates' Shiny Vault);
 * every class below starts from the older class the Classic engine keys on
 * (`foil-holo`, `foil-ex`, `foil-ultra`, `foil-ir`, `foil-gold`) and adds its
 * own `sm-*` class, the way js/foil-maps.js does for Sword & Shield.
 *
 * The card's `era: "sm"` (set by build_products.py / build_set.py for the
 * promos and McDonald's reprints) makes a later product's reprint take the
 * era's finish through its `foilAs`.
 */

/** A Sun & Moon era print: the numbered sets, Shiny Vault, Detective Pikachu, the promos. */
export function isSm(card) {
  return card?.era === "sm" || /^(sm\d|sma-|sma$|det1|smp|mcd1[789])/.test(String(card?.id || ""));
}

/** Prints that are foil edge to edge; they take TCG Live's map or the all-white one. */
export const SM_FULL_ART = new Set(["Rare Ultra", "Rare Rainbow", "Rare Secret"]);
/** Prints with an etched layer (TCG Live's etch map, else the shared engraving tile). */
export const SM_ETCHED = new Set(["Rare Ultra", "Rare Rainbow", "Rare Secret"]);

/**
 * The text-safe median map of a GX or Prism Star Pokémon that has no TCG Live
 * map of its own (an alternate-art promo: sm35-10a, sm4-63a, sm5-10a), so the
 * finish still gets `has-foil-map`: rules text and a typical Pokémon matte,
 * not every pixel of the card foiled (css/holo/sm-gx.css, make_sm_safe_maps.py).
 * "" for any other card.
 */
export function smSafeMap(card) {
  if (card.supertype !== "Pokémon") return "";
  const p = smPattern(card);
  if (p.includes("sm-shiny")) return "";
  if (p.includes("sm-prism")) return "assets/foil/maps/sm-prism-safe.webp";
  if (p.includes("sm-gx")) return "assets/foil/maps/sm-gx-safe.webp";
  return "";
}

/**
 * The finish of a Sun & Moon print, read from its rarity, its GX / TAG TEAM
 * subtype and the Shiny Vault gallery tag (`gallery: "sv"`). An empty string
 * means the generic engine decides; "foil-none" means the card is not foil
 * (the plain Rare, as in Sword & Shield).
 */
export function smPattern(card) {
  const subs = card.subtypes || [];
  const is = (sub) => subs.some((s) => String(s).toUpperCase() === sub);
  const trainer = card.supertype === "Trainer";
  const tag = is("TAG TEAM");
  if (card.gallery === "sv" && card.rarity !== "Rare Secret") {
    if (card.rarity === "Rare Ultra") return "foil-ultra sm-shiny sm-fa";
    if (is("GX")) return `foil-ex sm-shiny sm-gx${tag ? " sm-tag" : ""}`;
    return "foil-holo sm-shiny";
  }
  switch (card.rarity) {
    case "Rare Secret":
      return "foil-gold sm-gold";
    case "Rare Rainbow":
      return "foil-ir sm-rainbow";
    case "Rare Ultra":
      if (trainer) return "foil-ultra sm-tfa";
      return `foil-ultra sm-fa${tag ? " sm-tag" : ""}`;
    case "Rare Holo GX":
      return `foil-ex sm-gx${tag ? " sm-tag" : ""}`;
    case "Rare Prism Star":
      return "foil-holo sm-prism";
    case "Rare Shining":
      // Shining Legends' Shining Pokémon (finish owner: the shiny family).
      return "foil-ex sm-shining";
    case "Rare Shiny":
      return "foil-holo sm-shiny";
    case "Rare Shiny GX":
      return `foil-ex sm-shiny sm-gx${tag ? " sm-tag" : ""}`;
    case "Rare Holo":
      return "foil-holo sm-holo";
    default:
      break;
  }
  // The plain Rare is not foil at all.
  if (card.rarity === "Rare") return "foil-none";
  return "";
}

/**
 * The reverse holo of a Sun & Moon print: "mirror" (the plain mirror the
 * engine already draws) until a type pattern is drawn for the era; then a
 * `sm-<type>` or `sm-trainer` name like Sword & Shield's (foil-maps.js turns
 * it into assets/foil/sm-reverse/<type>.webp).
 */
export function smReverseFinish(card) {
  if (card.supertype === "Energy" || card.energy) return "";
  return "mirror";
}
