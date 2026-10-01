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
 * TCG Live has no foil maps for any of this (probed 2026-10-01), so the maps
 * are ours: `xyMap(card)` below is the hook where the finish agents return a
 * shared drawn map (a window mask per frame) the way smSafeMap() does.
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
  const holo = xyHoloMap(card);
  if (holo) return holo;
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
      pattern = xyHoloPattern(card);
      break;
    case "Rare":
      // The plain Rare is not foil at all, except the 13 holo rares Evolutions
      // files as "Rare" (xyHoloPattern).
      pattern = XY_HOLO_IDS.has(card.id) ? xyHoloPattern(card) : "foil-none";
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
  // "xy-<type>" (xyReverseExtras): a card with no type or supertype keeps the plain "xy" mirror.
  return xyReverseKind(card) ? `xy-${xyReverseKind(card)}` : "xy";
}


/* ---- Finish family f1 (css/holo/xy.css): Rare Holo, reverse holo, plain glare -------------------------
 * Photos and sources: /mnt/project-files/every-era/xy/texture-refs/f1-holo-reverse/SOURCES.txt and
 * .claude/skills/card-textures/reference/xy-holo-reverse.md. The pack Rare Holo of XY is Bulbapedia's
 * "Sheen Holofoil" (broad diagonal rainbow bands and a fine sand, foil over the whole art window,
 * Pokémon included), not the cosmos of earlier eras; Evolutions (xy12) is the "Starlight" star field.
 */

/**
 * Holo rares the builders' data files as plain "Rare" (pkmn.gg folds them in xy4, xy5, xy11, xy12, dc1): the numbers
 * pokemontcg.io lists as "Rare Holo" for those sets (xy12 agrees with cardmavin's list). Drop an entry once
 * the data says "Rare Holo".
 */
const XY_HOLO_FALLBACK = {
  xy4: "12 17 30 43 45 50 63 69 71 74 77 86 97 98",
  xy5: "9 12 28 36 44 50 56 61 65 77 80 88 92 97 100 104 108 110",
  xy11: "11 20 40 50 64 65 73 81 86",
  xy12: "11 15 25 34 36 38 42 45 53 59 62 63 70",
  dc1: "2 5 8 11 14 21"
};
const XY_HOLO_IDS = new Set(Object.entries(XY_HOLO_FALLBACK).flatMap(([set, nums]) => nums.split(" ").map((n) => `${set}-${n}`)));

const isEvolutions = (card) => /^xy12-/.test(String(card?.id || ""));

/** `foil-holo xy-holo`, plus `xy-starlight` on an Evolutions print (the Base Set star field). */
function xyHoloPattern(card) {
  return `foil-holo xy-holo${isEvolutions(card) ? " xy-starlight" : ""}`;
}

/**
 * The art-window mask of a regular-frame Rare Holo (assets/foil/xy-win/, make_xy_window_masks.py): the
 * Pokémon window of the XY frame (a Stage 1 / Stage 2 card's evolution circle punched out), a Trainer's
 * picture, and Evolutions' own retro frame. "" for any other card.
 */
export function xyHoloMap(card) {
  if (!card || !/\bxy-holo\b/.test(xyPattern(card))) return "";
  const base = "assets/foil/xy-win/";
  const subs = card.subtypes || [];
  if (card.id === "xy12-11") return `${base}evo12-pokemon-11.webp`; // the Evolutions logo is printed over the art
  const evo = isEvolutions(card);
  if (card.supertype === "Trainer" || subs.some((x) => x === "Item" || x === "Supporter" || x === "Stadium" || x === "Pokémon Tool")) {
    return `${base}${evo ? "evo12-trainer" : "trainer"}.webp`;
  }
  if (evo) return `${base}evo12-pokemon.webp`;
  const circle = subs.includes("Stage 1") || subs.includes("Stage 2") || Boolean(card.evolvesFrom);
  return `${base}${circle ? "pokemon-evo" : "pokemon"}.webp`;
}

const XY_REVERSE_TYPES = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "fairy", "dragon", "colorless"]);

/** The tile a reverse holo draws with: its type, "trainer", or "" for a card with neither. */
function xyReverseKind(card) {
  if (card?.supertype === "Trainer") return "trainer";
  const type = String(card?.types?.[0] || "").toLowerCase();
  if (XY_REVERSE_TYPES.has(type)) return type;
  return card?.supertype === "Pokémon" || card?.supertype === "Energy" ? "colorless" : "";
}

/**
 * Classes and inline variables of an XY reverse holo (foil-maps.js hands over `finish` from
 * xyReverseFinish): the type's symbol tile as --rev-pattern, the layout of its window as a class for
 * css/holo/xy.css (`xy-rev-evo12` for Evolutions' retro frame, `xy-rev-trainer`, `xy-rev-energy`).
 */
export function xyReverseExtras(card, url, finish) {
  const kind = finish.slice(3);
  const subs = card.subtypes || [];
  const evo12 = isEvolutions(card);
  const basicEnergy = card.supertype === "Energy" && !subs.includes("Special");
  const pictureTrainer = kind === "trainer" || (card.supertype === "Energy" && !basicEnergy); // Special Energy: a Trainer-style picture box
  const classes = ["rev-mirror", "era-xy", "xy-rev", `xy-rev-${kind}`];
  let win = "";
  if (basicEnergy) classes.push("xy-rev-energy");
  else if (pictureTrainer) {
    classes.push("xy-rev-trainer");
    win = evo12 ? "evo12-trainer" : "trainer";
  } else {
    const circle = subs.includes("Stage 1") || subs.includes("Stage 2") || Boolean(card.evolvesFrom);
    if (circle && !evo12) classes.push("xy-rev-circle");
    win = evo12 ? "evo12-pokemon" : circle ? "pokemon-evo" : "pokemon";
  }
  if (evo12) classes.push("xy-rev-evo12");
  // --rev-pattern: the type's symbol tile; --xy-win: the layout's art window, cut out of the foil (xy.css)
  const vars = [`--rev-pattern:url('${url(`assets/foil/xy-reverse/${kind}.webp`)}')`];
  if (win) vars.push(`--xy-win:url('${url(`assets/foil/xy-win/${win}.webp`)}')`);
  return { classes: classes.join(" "), style: vars.join(";"), cure: false };
}
