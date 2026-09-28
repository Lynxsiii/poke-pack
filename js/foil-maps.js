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

/**
 * Whether a cosmos promo prints the "pixel" (retro) cosmos foil rather than
 * the smooth one: every English cosmos promo since Tinkaton SVP 140
 * (September 2024) and every Mega Evolution-era one does (the card-textures
 * skill, reference/promos.md). A `variant` naming "Pixel" settles it either
 * way; otherwise the promo number or the set decides.
 */
export function pixelCosmos(card) {
  const variant = String(card?.variant || "");
  if (/pixel/i.test(variant)) return true;
  if (/smooth|hd cosmos/i.test(variant)) return false;
  const set = String(card?.id || "").split("-")[0];
  if (/^me\d/.test(set) || ["sv8pt5", "sv9", "sv10", "zsv10pt5", "rsv10pt5"].includes(set)) return true;
  const svp = /^svp(\d+)/i.exec(String(card?.number || ""));
  return Boolean(svp && Number(svp[1]) >= 140);
}

/**
 * Full-art finishes are foil edge to edge, so a print TCG Live has no map for
 * (the Mega Evolution sets, Black Bolt and White Flare, the ME Black Star
 * promos) takes an all-white map and the same recipe as the mapped prints.
 * Without it the card fell to the older no-map recipe in realism.css, which
 * stretches an op-art ring texture over the whole card.
 */
const FULL_ART = new Set(["Illustration Rare", "Special Illustration Rare", "Ultra Rare", "Hyper Rare", "Mega Hyper Rare"]);
const FULL_MAP = "assets/foil/maps/full.webp";

/** A stable 0..1 pair per card, so tiled glitter never lines up the same way twice. */
function seed(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000];
}

const SV_REVERSE_TYPES = new Set([
  "grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless",
]);

/**
 * The standard reverse holo of a Scarlet & Violet or Mega Evolution print
 * (css/holo/sv-reverse.css). TCG Live's reverse maps show three kinds:
 * - the SV "cobblestone": pebbles, the type's symbol and a big type badge,
 *   the same picture on every card of a type in every SV set, so one pattern
 *   per type ships in assets/foil/sv-reverse/ (Trainers get Poké Balls,
 *   Special Energy is foil only in its text box);
 * - a plain mirror on Ancient and Future cards, and on every Mega Evolution
 *   reverse.
 * Promos, Prismatic's Poké Ball and Master Ball prints (`pattern`) and
 * older sets keep their own. So does any reverse with a kind of
 * its own: `kind` is the one the site resolved (the card's `reverseKind`,
 * else its set's `reverseFoil`), such as Poké Ball, Master Ball or Shrouded
 * Fable's chain; "cosmos" means none.
 */
export function reverseFinish(card, kind = card?.reverseKind) {
  if (!card?.reverse || card.foilAs || card.pattern || (kind && kind !== "cosmos")) return "";
  const set = String(card.id || "").split("-")[0];
  const sv = /^sv\d/.test(set);
  if (!sv && !(/^me\d/.test(set) && set !== "me55")) return "";
  const subtypes = card.subtypes || [];
  if (!sv || subtypes.includes("Ancient") || subtypes.includes("Future")) return "mirror";
  if (card.supertype === "Trainer") return "trainer";
  if (card.supertype === "Energy") return subtypes.includes("Special") ? "special-energy" : "";
  const type = String(card.types?.[0] || "").toLowerCase();
  return SV_REVERSE_TYPES.has(type) ? type : "";
}

/**
 * Extra classes and inline custom properties for a card face. `url` turns a
 * repo path into an absolute URL (see assetUrl() in app.js for why).
 * `reverseKind` is reverseKindOf() in app.js, for reverseFinish().
 */
export function foilExtras(card, url, reverseKind) {
  // The maps describe the holo print; a reverse holo is foil everywhere else,
  // in the reverse's own pattern: TCG Live's map of the reverse print where
  // it ships (`reverseMap`: Prismatic Evolutions prints its reverses with Tera
  // crystals and a type symbol worked into the foil), else the SV one.
  if (card.reverse) {
    if (card.reverseMap) {
      return { classes: "has-rev-map", style: `--rev-map:url('${url(card.reverseMap)}')`, cure: false };
    }
    const finish = reverseFinish(card, reverseKind);
    if (finish === "mirror") return { classes: "rev-mirror", style: "", cure: false };
    if (!finish) return { classes: "", style: "", cure: false };
    return {
      classes: `rev-sv rev-${finish}`,
      style: `--rev-pattern:url('${url(`assets/foil/sv-reverse/${finish}.webp`)}')`,
      cure: false,
    };
  }
  const classes = [];
  const vars = [];
  const add = (cls, name, path) => {
    if (cls) classes.push(cls);
    vars.push(`${name}:url('${url(path)}')`);
  };
  if (card.foilMap) add("has-foil-map", "--foil-map", card.foilMap);
  else if (FULL_ART.has(card.rarity)) add("has-foil-map", "--foil-map", FULL_MAP);
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
  // Scarlet & Violet prints (sv*, and Black Bolt / White Flare's zsv/rsv):
  // finishes the Mega Evolution era prints differently key off this, such as
  // the Double Rare streaks (css/holo/sv-double-rare.css).
  if (/^[zr]?sv\d/.test(String(card.id || ""))) classes.push("era-sv");
  // Tiled or galaxy textures start somewhere different on every card.
  if (cure || ["Classic Collection", "Cosmos", "Confetti"].includes(card.rarity)) {
    const [x, y] = seed(card.id);
    vars.push(`--seed-x:${x}`, `--seed-y:${y}`);
  }
  // Cosmos promos since late 2024 print the pixel cosmos (css/holo/promos.css).
  if (card.rarity === "Cosmos" && pixelCosmos(card)) classes.push("cosmos-pixel");
  return { classes: classes.join(" "), style: vars.join(";"), cure: Boolean(cure) };
}
