/**
 * Which cards a deck may hold in each official Constructed format, as Play! Pokémon
 * runs them. Sources, both checked against a second one, are in
 * /mnt/project-files/tcg-rules/formats-2026-11.md:
 *
 *   - Play! Pokémon TCG Tournament Handbook (revision of September 1, 2026), sections 4, 4.1.1,
 *     4.1.3 (reprints), 4.2 (Unlimited);
 *   - pokemon.com, "2026 Pokémon TCG Standard Format Rotation Announcement" (G rotates on
 *     April 10, 2026; March 26 in Pokémon TCG Live) and the Pokémon TCG Banned Card List;
 *   - Bulbapedia, "2026-27 Standard format", "Expanded format", "Deck".
 *
 *   Standard   cards printed with regulation mark H, I or J. A Trainer or Special Energy with
 *              an older print is legal too when a print with a legal mark has the same name
 *              and the same text (Handbook 4.1.3; data/tcg/legal.json `reprints`). A Pokémon
 *              counts only by its own print (the safer reading: Bulbapedia says a rotated
 *              Pokémon can't stand in for a legal reprint). No banned cards.
 *   Expanded   Black & White onward (the sets of Handbook 4.1.1), every regulation mark D and
 *              later, BW, XY and SM Black Star promos; older Trainer prints by the same reprint
 *              rule; minus the Expanded ban list.
 *   Unlimited  every card. No banned cards.
 *
 * Every format: exactly 60 cards, 6 Prize cards, at most 4 of a card by its English name
 * except basic Energy, at least one Basic Pokémon (js/tcg/decks.js checkDeck).
 *
 * The regulation mark a print carries comes from data/tcg/legal.json (scripts/build_tcg_legal.mjs),
 * which reads it per card from TCGdex; js/tcg/cards.js puts it on the card as `mark`.
 */

/** The formats a player can build for, in the order the deck screens offer them. */
export const DECK_FORMATS = ["standard", "expanded", "unlimited"];

export const STANDARD_MARKS = ["H", "I", "J"];
export const EXPANDED_MARKS = ["D", "E", "F", "G", "H", "I", "J"];

/** What the deck screens say about each format. */
export const FORMAT_NOTES = {
  standard: "Cards with regulation mark H, I or J; the G cards rotated out on April 10, 2026.",
  expanded: "Black & White onward, minus the Expanded ban list.",
  unlimited: "Every card ever printed. No bans.",
};

/**
 * Expanded by set (Handbook 4.1.1): the Black & White, XY and Sun & Moon expansions, their
 * Trainer Kits, Detective Pikachu, McDonald's Collections 2011 to 2021. Sword & Shield onward
 * is legal by regulation mark. Keys are this site's set ids (data/sets).
 */
export const EXPANDED_SETS = new Set([
  "bw1", "bw2", "bw3", "bw4", "bw5", "dv1", "bw6", "bw7", "bw8", "bw9", "bw10", "bw11", "bwtk5a", "bwtk5b",
  "xy0", "xy1", "xy2", "xy3", "xy4", "xy5", "dc1", "xy6", "xy7", "xy8", "xy9", "g1", "xy10", "xy11", "xy12",
  "xytk6a", "xytk6b", "xytk7a", "xytk7b", "xytk8a", "xytk8b", "xytk9a", "xytk9b",
  "sm1", "sm2", "sm3", "sm35", "sm4", "sm5", "sm6", "sm7", "sm75", "sm8", "sm9", "sm10", "sm11", "sm115", "sm12", "det1",
  "mcd11", "mcd12", "mcd14", "mcd15", "mcd16", "mcd17", "mcd18", "mcd19",
  "bwp", "xyp", "smp",
]);

/** Promo prints filed under another set ("sv1-svp013"): the prefix of the key names the promo series. */
const PROMO = /^(basep|np|dpp|hsp|bwp|xyp|smp|swshp|svp|mep)(\d+)/;

/**
 * The official Expanded ban list (pokemon.com Banned Card List, checked November 2026; 27 cards).
 * Pokémon are banned by print ("set:number", the number without leading zeros); Trainers by name,
 * since every print of a banned Trainer is banned.
 */
export const BANNED = {
  standard: { prints: [], names: [] },
  expanded: {
    prints: [
      "bw3:67", "bw5:110", // Archeops (Noble Victories 67, Dark Explorers 110)
      "bw5:62", // Sableye (Dark Explorers 62)
      "xy2:23", // Milotic (Flashfire 23)
      "xy6:77", "xy6:77a", "xy6:106", // Shaymin-EX (Roaring Skies 77, 77a, 106)
      "sm35:45", "smp:85", // Marshadow (Shining Legends 45, SM85)
      "sm5:114", // Oranguru (Ultra Prism 114)
      "sm6:83", // Flabébé (Forbidden Light 83)
      "sm8:90", "sm8:91", // Unown (Lost Thunder 90, 91)
      "sm10:78", // Mismagius (Unbroken Bonds 78)
      "sm12:83", // Duskull (Cosmic Eclipse 83)
      "swsh2:22", "swsh45:SV13", "swsh10:TG2", "swshp:22", // Flapple (RCL 22, SHF SV013, ASR TG02, SWSH022)
      "swsh7:83", "swsh7:185", "swsh7:186", // Medicham V (Evolving Skies 83, 185, 186)
    ],
    names: [
      "Chip-Chip Ice Axe", "Delinquent", "Forest of Giant Plants", "Ghetsis", "Hex Maniac", "Island Challenge Amulet", "Jessie & James",
      "Lt. Surge's Strategy", "Lysandre's Trump Card", "Maxie's Hidden Ball Trick", "Puzzle of Time", "Red Card", "Reset Stamp", "Scoop Up Net",
    ],
  },
  unlimited: { prints: [], names: [] },
};

/**
 * The name a card counts under for the 4-copy rule: the level ("LV.X", "LV. 43") and δ Delta
 * Species are not part of a name, the professor named on Professor's Research isn't either;
 * everything else is ("Radiant", "ex", "EX", "◇", "★", "Alolan", "Team Rocket's").
 */
export function deckName(name) {
  return String(name || "")
    .replace(/[’`]/g, "'")
    .replace(/\s+\((Professor [^)]*)\)$/, "")
    .replace(/\s+LV\.\s?(X|\d+)\b/gi, "")
    .replace(/\s*δ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A card's text reduced to what it does, for the reprint rule (Handbook 4.1.3: "functionally
 * identical" text; Copycat CES and TRR count as the same though worded apart). Case, punctuation,
 * reminder text in parentheses and the two wordings of the closing shuffle are dropped; anything
 * else that differs keeps two prints apart (the safer reading).
 */
export function canonText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/é/g, "e")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(then,? )?shuffle your deck( afterward)?\b/g, " shuffle your deck ")
    .replace(/[^a-z0-9+×-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

/**
 * The ways a Trainer or Special Energy print can match another for the reprint rule: its text
 * ("t" + canonText) and, when the game reads the text, what it does ("e": the compiled steps,
 * so "Discard 2 cards from your hand. If you do, search ..." and "You can use this card only if
 * you discard 2 other cards ..." are the same Ultra Ball). Short hashes, for data/tcg/legal.json.
 */
export function reprintKeys(def) {
  const keys = [];
  const text = canonText(def?.text);
  if (text) keys.push(`t${hash(text)}`);
  if (def?.playable && def.kind !== "pokemon") keys.push(`e${hash(JSON.stringify([def.kind, def.sub || "", def.fx || [], def.tool || null, def.stadium || null, def.special || null]))}`);
  return keys;
}

/** "sv1-svp013" -> "svp:13", "swsh45-SV013" -> "swsh45:SV13", "xy6-77" -> "xy6:77". Variants ("-pb") are dropped. */
export function printCode(id) {
  const at = String(id).indexOf("-");
  const set = at < 0 ? String(id) : id.slice(0, at);
  const key = at < 0 ? "" : id.slice(at + 1).split("-")[0];
  const promo = key.match(PROMO);
  if (promo) return `${promo[1]}:${Number(promo[2])}`;
  const m = key.match(/^([A-Za-z]*)0*(\d+)([a-z]?)$/);
  return m ? `${set}:${m[1].toUpperCase()}${m[2]}${m[3]}` : `${set}:${key}`;
}

/** The series a print belongs to by its own number: its promo prefix, else its set. */
function seriesOf(id) {
  const at = String(id).indexOf("-");
  const set = at < 0 ? String(id) : id.slice(0, at);
  const promo = (at < 0 ? "" : id.slice(at + 1)).match(PROMO);
  return promo ? promo[1] : set;
}

const isBasicEnergy = (def) => def.kind === "energy" && def.basic;

/**
 * Why this one print can't go in a deck of this format, judged by the print alone ("" when it can).
 * `def` is a card definition from js/tcg/cards.js: { id, kind, basic, provides, mark, classic }.
 */
export function printProblem(def, format) {
  if (format === "unlimited") return "";
  if (isBasicEnergy(def)) {
    // Basic Energy carries no mark and is always legal; Fairy left with the Fairy type in Sword & Shield.
    if (format === "standard" && def.provides?.[0] === "Fairy") return "Basic Fairy Energy isn't in Standard: the Fairy type left with Sword & Shield.";
    return "";
  }
  if (def.classic) return "Classic Collection prints are only legal in Unlimited.";
  // "-": printed in the Sword & Shield era or later, but no source gives its mark (data/tcg/legal.json).
  const mark = def.mark || "";
  if (format === "standard") {
    if (STANDARD_MARKS.includes(mark)) return "";
    if (mark === "-") return "Its regulation mark isn't on record, so it isn't counted as Standard legal.";
    if (mark) return `Regulation mark ${mark} rotated out of Standard.`;
    return "Printed before regulation marks, so not legal in Standard.";
  }
  if (format === "expanded") {
    if (mark === "-" || EXPANDED_MARKS.includes(mark) || EXPANDED_SETS.has(seriesOf(def.id))) return "";
    return "Printed before Black & White, so not legal in Expanded.";
  }
  return "Not a format this game plays.";
}

/**
 * Why this card can't go in a deck of this format ("" when it can): its own print, or for a
 * Trainer or Special Energy a print of the same name and text that is legal (Handbook 4.1.3),
 * then the ban list. `reprints` is data/tcg/legal.json `reprints`: { format: { name: [reprintKeys] } }.
 */
export function cardProblem(def, format, reprints = null) {
  if (!def) return "This card couldn't be found.";
  const ban = BANNED[format];
  if (ban && (ban.prints.includes(printCode(def.id)) || (def.kind !== "pokemon" && ban.names.includes(deckName(def.name))))) return `Banned in ${format === "expanded" ? "Expanded" : "this format"}.`;
  const own = printProblem(def, format);
  if (!own || def.kind === "pokemon" || def.classic) return own;
  const keys = reprints?.[format]?.[deckName(def.name)];
  if (keys && reprintKeys(def).some((k) => keys.includes(k))) return "";
  return own;
}

/** The legality of one card in every format a deck can be: { standard: reason, expanded: reason, unlimited: reason }. */
export function legalityOf(def, reprints = null) {
  return Object.fromEntries(DECK_FORMATS.map((f) => [f, cardProblem(def, f, reprints)]));
}

/** Sets the house bot can fall back on when none of the player's sets gives it a legal deck. */
export const BOT_FALLBACK = {
  standard: ["me1", "sv8", "sv10", "me2", "sv5", "sv6", "sv7", "sv9"],
  expanded: ["sm1", "xy1", "bw1", "swsh1"],
  unlimited: ["base1", "sv1"],
};
