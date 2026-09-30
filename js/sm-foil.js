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
 * Alternate-art Tag Teams (Rare Ultra): the Pokémon is plain ink in TCG Live's
 * foil map and the foil sits on the scenery (css/holo/sm-fullart.css, `sm-alt`).
 * The card data cannot tell them from the standard full art, so the list is
 * measured from the maps: scripts/sm_alt_art.py in the card-textures skill.
 */
export const SM_ALT_ART = new Set([
  "sm35-78", // Shining Legends' full-colour secret Mewtwo-GX: foil on Mewtwo and the frame, scenery matte
  "sm9-161", "sm9-165", "sm9-170",
  "sm10-192", "sm10-197", "sm10-199", "sm10-201", "sm10-205",
  "sm11-218", "sm11-221", "sm11-226",
  "sm12-215", "sm12-221", "sm12-224", "sm12-226",
]);

/**
 * Lost Thunder to Cosmic Eclipse (and Detective Pikachu): the window holo went
 * from shattered rainbow to a soft satin sheen (photos in
 * texture-refs/f1-holo-reverse; css/holo/sm.css).
 */
const SM_LATE = /^(sm8|sm9|sm10|sm11|sm115|sm12|det1|mcd19)-/;
/** Black Star promos from SM120 on (2018-11 and later) are Lost Thunder era or after; holo promos before are early. */
const SM_LATE_PROMO = 120;
export function smLate(card) {
  const id = String(card?.id || "");
  if (SM_LATE.test(id)) return true;
  const promo = /^smp-?smp?(\d+)/.exec(id);
  return Boolean(promo && Number(promo[1]) >= SM_LATE_PROMO);
}

/**
 * The text-safe median map of a GX, Prism Star or Rare Holo Pokémon that has no TCG Live
 * map of its own (an alternate-art promo: sm35-10a, sm4-63a, sm5-10a), so the
 * finish still gets `has-foil-map`: rules text and a typical Pokémon matte,
 * not every pixel of the card foiled (css/holo/sm-gx.css, make_sm_safe_maps.py).
 * "" for any other card.
 */
export function smSafeMap(card) {
  if (card.supertype !== "Pokémon") return "";
  const p = smPattern(card);
  if (p.includes("sm-shiny")) return "";
  // The window holo of a print with no map of its own (a holo reprint,
  // `foilAs: "Rare Holo"`): the window with a typical Pokémon matte
  // (make_sm_window_map.py), not the whole card foiled.
  if (/\bsm-holo\b/.test(p)) return "assets/foil/maps/sm-holo-safe.webp";
  if (p.includes("sm-prism")) return "assets/foil/maps/sm-prism-safe.webp";
  if (p.includes("sm-gx")) return "assets/foil/maps/sm-gx-safe.webp";
  return "";
}

/**
 * A regular GX or TAG TEAM GX's baked map (`<n>-gx-v1.webp`, scripts/make_sm_gx_maps.py):
 * TCG Live's map (the text-safe median for an alternate-art GX with none) smoothed
 * to the scan's size with the dark attack bar cut out, as on the real cards.
 * "" for any other card.
 */
export function smGxMap(card) {
  if (card.supertype !== "Pokémon") return "";
  const k = card.foilAs && !card.reverse ? { ...card, rarity: card.foilAs } : card;
  const p = smPattern(k);
  if (!/\bsm-gx\b/.test(p) || /sm-shiny|sm-fa/.test(p)) return "";
  if (card.foilMap) return card.foilMap.replace(/\.webp$/, "-gx-v1.webp");
  // No TCG Live map (an alternate-art GX): baked from the text-safe median by the scan's path.
  const m = /^assets\/cards\/([^/]+)\/(.+)\.webp$/.exec(card.image || "");
  return m ? `assets/foil/maps/${m[1]}/${m[2]}-gx-v1.webp` : "";
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
  // Hidden Fates' Shiny Vault (gallery "sv"): the Shiny Rares and Shiny GX, the
  // Supporters; the golds fall through to "Rare Secret" below.
  if (card.gallery === "sv" && card.rarity !== "Rare Secret") {
    if (card.rarity === "Rare Ultra") return "foil-ultra sm-tfa";
    if (is("GX")) return "foil-ultra foil-shiny sm-shiny sm-shiny-gx";
    return "foil-holo foil-shiny sm-shiny";
  }
  switch (card.rarity) {
    case "Rare Secret":
      // Gold: Trainers, Energy and GX. A Pokémon that is not a GX is Cosmic
      // Eclipse's full-colour alternate art, foil on its scenery, not gold.
      if (SM_ALT_ART.has(card.id) || (card.supertype === "Pokémon" && !is("GX"))) return "foil-ultra sm-fa sm-alt";
      return "foil-gold sm-gold";
    case "Rare Rainbow":
      return "foil-ir sm-rainbow";
    case "Rare Ultra":
      if (trainer) return "foil-ultra sm-tfa";
      return `foil-ultra sm-fa${SM_ALT_ART.has(card.id) ? " sm-alt" : ""}${tag ? " sm-tag" : ""}`;
    case "Rare Holo GX":
      return `foil-ex sm-gx${tag ? " sm-tag" : ""}`;
    case "Rare Prism Star":
      return "foil-holo sm-prism";
    case "Rare Shining":
      // Shining Legends' Shining Pokémon (finish owner: the shiny family).
      return "foil-holo foil-shiny sm-shiny sm-shining";
    case "Rare Holo":
      return `foil-holo sm-holo${smLate(card) ? " sm-late" : ""}`;
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
const SM_REVERSE_TYPES = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "fairy", "dragon", "colorless"]);
export function smReverseFinish(card) {
  // A basic Energy reverse (Shining Legends' pack Energy): the type's symbols on
  // a mirror body, the central orb and the two bars left plain (sm.css, `rev-energy`).
  if (card.supertype === "Energy" || card.energy) {
    const kind = String(card.types?.[0] || "").toLowerCase();
    return SM_REVERSE_TYPES.has(kind) ? `sm-${kind}` : "";
  }
  if (card.supertype === "Trainer") return "sm-trainer";
  const type = String(card.types?.[0] || "").toLowerCase();
  return SM_REVERSE_TYPES.has(type) ? `sm-${type}` : "mirror";
}
