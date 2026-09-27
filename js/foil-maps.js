/**
 * Per-card foil data for tcgFace(): where the physical card is foil, and the
 * clear textured coats printed over it.
 *
 * - `foilMap` (and the RGB channels, `foilMapR/G/B`) are Pokémon TCG Live's
 *   per-card foil maps: white where the card is foil, black where it is not.
 *   They stop the shine at the Pokémon, the text and the 30th Celebration
 *   Pikachu stamp exactly. `etchMap` is the etched texture on SIR, Futuristic
 *   and RGB prints; `etchMapH/V` split it by line direction, and `etchAngle`
 *   draws that direction as a grey (the Paldean Fates shinies).
 *   `reverseMap` is the same for the card's reverse holo print.
 *   The card-textures skill's scripts/fetch_foil_maps.py writes all of these
 *   into data/<set>.json.
 * - `stampPos` / `stampSize` place the 30th Celebration stamp on cards with no
 *   foil map (the Classic Collection), so the foil can go around it
 *   (scripts/ship_stamp.py in the same skill).
 * - A "cast and cure" coat is a holographic pattern pressed into UV varnish.
 *   It shines over plain ink as well as foil, so it gets its own layer,
 *   `.cure`, masked by the card rather than the foil map: star glints on the
 *   30th Celebration Double Rares, firework rings on the Pikachu Rares.
 *
 * Shared with the card-textures lab so the lab draws what the site draws.
 */

export function cureOf(card) {
  if (card?.rarity === "Pikachu Rare") return "rings";
  // SouthernCross is TCG Live's name for the Double Rare star coat. Only cards
  // with a foil map are confirmed to carry it (every Double Rare in the
  // Mega ex era is not). Tera ex Double Rares print SV_ULTRA etched foil
  // instead and carry no coat.
  if (card?.rarity === "Double Rare" && card.foilMap && !(card.subtypes || []).includes("Tera")) return "stars";
  return "";
}

/** A stable 0..1 pair per card, so tiled glitter never lines up the same way twice. */
function seed(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000];
}

/**
 * Extra classes and inline custom properties for a card face. `url` turns a
 * repo path into an absolute URL (see assetUrl() in app.js for why).
 */
export function foilExtras(card, url) {
  // The maps describe the holo print; a reverse holo is foil everywhere else,
  // unless TCG Live's map of the reverse print ships (`reverseMap`:
  // Prismatic Evolutions prints its reverses with Tera crystals and a type
  // symbol worked into the foil).
  if (card.reverse) {
    return card.reverseMap
      ? { classes: "has-rev-map", style: `--rev-map:url('${url(card.reverseMap)}')`, cure: false }
      : { classes: "", style: "", cure: false };
  }
  const classes = [];
  const vars = [];
  const add = (cls, name, path) => {
    if (cls) classes.push(cls);
    vars.push(`${name}:url('${url(path)}')`);
  };
  if (card.foilMap) add("has-foil-map", "--foil-map", card.foilMap);
  if (card.foilMapR && card.foilMapB) {
    add("has-foil-rgb", "--foil-map-r", card.foilMapR);
    add("", "--foil-map-b", card.foilMapB);
  }
  if (card.etchMap) add("has-etch-map", "--etch-map", card.etchMap);
  if (card.etchMapH && card.etchMapV) {
    add("has-etch-bins", "--etch-map-h", card.etchMapH);
    add("", "--etch-map-v", card.etchMapV);
  }
  if (card.etchAngle) add("has-etch-angle", "--etch-angle", card.etchAngle);
  if (card.stampPos && card.stampSize && !card.foilMap) {
    classes.push("has-stamp");
    vars.push(`--stamp-pos:${card.stampPos}`, `--stamp-size:${card.stampSize}`);
  }
  const cure = cureOf(card);
  if (cure) classes.push(`cure-${cure}`);
  // Future and Ancient frames print a halftone panel in the text box, and
  // their holo prints foil it too (css/holo/sv-rare.css).
  if (card.foilMap && (card.subtypes || []).some((s) => s === "Future" || s === "Ancient")) {
    classes.push("frame-paradox");
  }
  // Tiled or galaxy textures start somewhere different on every card.
  if (cure || ["Classic Collection", "Cosmos", "Confetti"].includes(card.rarity)) {
    const [x, y] = seed(card.id);
    vars.push(`--seed-x:${x}`, `--seed-y:${y}`);
  }
  return { classes: classes.join(" "), style: vars.join(";"), cure: Boolean(cure) };
}
