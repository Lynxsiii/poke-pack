/**
 * Card definitions for the rules engine.
 *
 * The site's card files (data/<set>.json) say what a card looks like and what
 * it prints; data/tcg/rules.json (scripts/build_tcg_rules.mjs) adds weakness,
 * resistance, retreat and prizes. defineCard() joins the two into what
 * js/tcg/engine.js reads:
 *
 *   pokemon  { id, kind, name, stage: "basic" | "evolution", evolvesFrom, line?: 1 | 2, roots? (a Stage 2's Basics), hp, types, attacks, weakness,
 *              resistance, retreat, prizes, playable, why, notes }
 *            attack: { name, cost, damage, text, fx (steps, js/tcg/effects.js), plain (true when text isn't read yet) }
 *   energy   { id, kind, name, provides: [type], basic, playable, special? (js/tcg/energy.js) }
 *   trainer  { id, kind, name, playable: false }
 *
 * `playable` false keeps a card out of decks, with `why` to tell the player.
 * `notes` are things a playable card does not do yet (an Ability, attack text).
 */

import { compileAbility } from "./abilities.js";
import { compileAttack } from "./effects.js";
import { compileCard, compileStadium, compileTool } from "./trainers.js";
import { compileSpecialEnergy } from "./energy.js";
import { deckName, legalityOf } from "./formats.js";

export const ENERGY_TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Fairy"];

/** The basic Energy every player has as many of as they like, as catalog ids (js/catalog.js BASIC_ENERGY). */
export const FREE_ENERGY = ENERGY_TYPES.map((type) => ({
  id: type === "Fairy" ? "energy-fairy-xy" : `energy-${type.toLowerCase()}`,
  type,
}));
const FREE_IDS = new Set(FREE_ENERGY.map((e) => e.id));
export const isFreeEnergy = (id) => FREE_IDS.has(id);

const TAGS = ["Team Plasma", "SP", "Level-Up", "Baby", "Ultra Beast", "Ancient", "Future", "Rapid Strike", "Single Strike", "Fusion Strike", "TAG TEAM"];
const EVOLVED = /^(Stage 1|Stage 2|VMAX|VSTAR|BREAK|Level-Up)$/;
const NOT_YET = /^(LEGEND|V-UNION|Restored)$/;

function side(text) {
  const m = String(text || "").match(/^([A-Za-z]+)\s*([×x+\-−])\s*(\d+)$/);
  if (!m) return null;
  return { type: m[1], op: m[2] === "×" || m[2] === "x" ? "x" : m[2] === "+" ? "+" : "-", n: Number(m[3]) };
}

function attackOf(raw, name = "") {
  // GX attacks and VSTAR Power attacks are once a game (rulebook): the reminder is a rule, not an effect.
  const once = /\(You can't use more than 1 GX attack in a game\.\)/.test(raw.text || "") ? "gx" : /\(You can't use more than 1 VSTAR Power in a game\.\)/.test(raw.text || "") ? "vstar" : "";
  const fx = compileAttack(String(raw.text || "").replace(/\s*\(You can't use more than 1 (?:GX attack|VSTAR Power) in a game\.\)/, "").trim(), name);
  return {
    ...(once ? { once } : {}),
    name: raw.name,
    cost: (raw.cost || []).filter((c) => c !== "Free"),
    damage: parseInt(raw.damage, 10) || 0,
    text: raw.text || "",
    fx: fx || [],
    plain: fx === null,
  };
}

/**
 * Deck limits a card prints on itself: one Radiant Pokémon, one ACE SPEC card and one
 * Pokémon ★ in a whole deck (`club`); one of each Prism Star card and of each Neo Shining
 * Pokémon by name (`cap`); the Arceus of Platinum—Arceus and its DP promos say "You may have
 * as many of this card in your deck as you like" (`any`).
 */
function limitsOf(card) {
  const subs = card.subtypes || [];
  const rarity = String(card.rarity || "");
  const name = card.name || "";
  if (subs.includes("Radiant") || /^Radiant /.test(name)) return { club: "Radiant Pokémon" };
  if (subs.includes("ACE SPEC") || /ACE SPEC/i.test(rarity)) return { club: "ACE SPEC card" };
  if (subs.includes("Star") || / ★/.test(name)) return { club: "Pokémon ★" };
  // Prism Star cards also go to the Lost Zone instead of the discard pile (engine.js toLostZone).
  if (subs.includes("Prism Star") || /◇/.test(name)) return { cap: 1, prism: true };
  if (/^Shining /.test(name) && /^neo/.test(card.id || "")) return { cap: 1 };
  if (/^Arceus( LV\.X)?$/.test(name) && /^(pl4|dpp)-|^[a-z0-9]+-dpp/.test(card.id || "")) return { any: true };
  return {};
}

/** A Classic Collection reprint (Celebrations, 30th Celebration): legal in Unlimited only. */
const isClassic = (card) => card.rarity === "Classic Collection" || /^[a-z0-9]+-cc\d/.test(card.id || "");

/**
 * Prize cards the opponent takes for a Knock Out. The rules table reads it off the card's own
 * rule box; where that box is missing from our source, the card's kind decides.
 */
function prizesFor(card, row) {
  const subs = card.subtypes || [];
  const name = card.name || "";
  const has = (s) => subs.some((x) => x.toLowerCase() === s.toLowerCase());
  let n = 1;
  if (has("VMAX") || has("TAG TEAM") || / VMAX$/.test(name)) n = 3;
  else if (/^Mega /.test(name) && (subs.includes("ex") || / ex$/.test(name))) n = 3;
  else if (subs.includes("ex") || has("EX") || has("GX") || has("V") || has("VSTAR") || / ex$|-EX$|-GX$| V$| VSTAR$/.test(name)) n = 2;
  return Math.max(n, Number(row?.[3]) || 1);
}

/** The rule box a Pokémon carries ("ex", "EX", "GX", "V", "VMAX", "VSTAR"), which some Abilities ask about. */
function boxOf(card) {
  const name = card.name || "";
  const subs = card.subtypes || [];
  if (subs.includes("VMAX") || / VMAX$/.test(name)) return "VMAX";
  if (subs.includes("VSTAR") || / VSTAR$/.test(name)) return "VSTAR";
  if (subs.includes("V") || / V$/.test(name)) return "V";
  if (subs.includes("GX") || /-GX$/.test(name)) return "GX";
  if (subs.includes("ex") || / ex$/.test(name)) return "ex";
  if (subs.includes("EX") || /-EX$/.test(name)) return "EX";
  return "";
}

/**
 * Trainers played "as if it were a Basic Pokémon" (Clefairy Doll, Mysterious Fossil, Claw Fossil, Unidentified
 * Fossil, the Antique Fossils): in the hand, the deck and the discard pile it is an Item card; in play it is the
 * Pokémon `mon` (engine.js defOf). Every sentence of the text must be one read here, or the card waits.
 *   mon      the Pokémon it is in play: its HP, Colorless or no type, no attacks, Weakness, Resistance or Retreat Cost
 *   noKo     "If it is Knocked Out, it doesn't count as a Knocked Out Pokémon": no Prize card for it, and no Knock Out
 *            for what asks about one; noPrize: no Prize card for it (Lillie's Poké Doll), and noKo's too
 *   immune   the Special Conditions it can't have
 *   drop     "At any time during your turn (before your attack), you may discard it from play": "discard";
 *            Lillie's Poké Doll: "bottom" (its cards discarded, it goes to the bottom of the deck), as the Active only
 */
function compileFossil(text, card) {
  const hp = Number(card.hp) || 0;
  // (Some card files carry the rules text again as an "attack" named Item: that isn't one.)
  if (!hp || !text || (card.attacks || []).some((a) => a.name !== "Item" || a.damage || (a.cost || []).length)) return null;
  const name = card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Its own name (or a misprint of it: "If Mysterious is Knocked Out") stands for "this card".
  let t = ` ${text.replace(/\s+/g, " ").replace(/’/g, "'").replace(new RegExp(`\\b${name}\\b`, "g"), "this card").replace(/\bMysterious is\b/, "this card is")} `;
  const out = { noKo: false, immune: [], drop: "", colorless: false, noRetreat: false, trainer: false };
  const take = (re, fn = () => {}) => {
    const m = t.match(re);
    if (!m) return false;
    fn(m);
    t = t.replace(re, " ");
    return true;
  };
  if (!take(/ Play this card as if it were a (?:(\d+)-HP )?(Colorless )?Basic (Colorless )?Pokémon\. /, (m) => {
    if (m[1] && Number(m[1]) !== hp) out.bad = true;
    out.colorless = Boolean(m[2] || m[3]);
  })) return null;
  take(/ While in play,? this card counts as a (Colorless )?Pokémon \((?:instead of|as well as) a Trainer card\)\. /, (m) => {
    out.colorless ||= Boolean(m[1]);
    out.trainer = /as well as/.test(m[0]);
  });
  take(/ \(this card counts as a Trainer card as well, but if this card is Knocked Out, this counts as a Knocked Out Pokémon\.\) /, () => (out.trainer = true));
  take(/ this card has no attacks(?: of its own)?, can't retreat, and can't be (?:affected by (?:any )?Special Conditions|Asleep, Confused, Paralyzed, or Poisoned)\. /, (m) => {
    out.noRetreat = true;
    out.immune = /Special Conditions/.test(m[0]) ? ["all"] : ["asleep", "confused", "paralyzed", "poisoned"];
  });
  take(/ (?:T|t)his card can't be affected by any Special Conditions,? and (?:it )?can't retreat\. /, () => {
    out.noRetreat = true;
    out.immune = ["all"];
  });
  take(/ This card can't retreat\. /, () => (out.noRetreat = true));
  take(/ If this card is Knocked Out, it doesn't count as a Knocked Out Pokémon\.(?: \(Discard it anyway\.\))? /, () => (out.noKo = true));
  take(/ If this card is Knocked Out, your opponent can't take any Prize cards for it\. /, () => (out.noPrize = true));
  take(/ At any time during your turn(?: \(before your attack\)| before your attack)?, you may discard this card(?: from play)?\.(?: \(This doesn't count as a Knocked Out Pokémon\.\))? /, () => (out.drop = "discard"));
  take(/ At any time during your turn \(before your attack\), if this Pokémon is your Active Pokémon, you may discard all cards from it and put it on the bottom of your deck\. /, () => (out.drop = "bottom"));
  take(/ You can put Pokémon that evolve from this card on this card\. /);
  if (t.trim() || out.bad || !out.noRetreat || !out.drop) return null;
  return { noKo: out.noKo, noPrize: out.noKo || Boolean(out.noPrize), noRetreat: true, immune: out.immune, drop: out.drop, colorless: out.colorless, trainer: out.trainer };
}

/** Printed costs our card source lost (checked against the card): Technical Machine TS-1's Evoluter costs Colorless. */
const COST_FIX = { "dp6-136": ["Colorless"] };

const TM_TYPE = "(?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal)";
/**
 * A Technical Machine: "Attach this card to 1 of your [Evolved] [Fire, Lightning, or Fighting] Pokémon in play. That Pokémon
 * may use this card's attack instead of its own. [At the end of your turn, discard this card.]" -> { only, turn }
 * (`turn`: it goes at the end of the turn, else it stays), or null. Played like an Item, it is held on the Pokémon (engine.js heldOn).
 */
function compileTm(text, card) {
  // Miracle Sphere α's text names the card Miracle Plate α.
  const own = [card.name, card.name.replace(/^Miracle Sphere/, "Miracle Plate")].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const m = clean.match(new RegExp(`^Attach this card to 1 of your (Evolved )?(?:(${TM_TYPE}(?:, ${TM_TYPE})*,? or ${TM_TYPE}|${TM_TYPE}) )?Pokémon(?: in play)?\\. That Pokémon may use this card's attack instead of its own\\.( At the end of your turn, discard (?:${own})\\.)?$`));
  if (!m) return null;
  const types = m[2] ? m[2].match(new RegExp(TM_TYPE, "g")) : null;
  return { only: { ...(m[1] ? { evolved: true } : {}), ...(types ? { types } : {}) }, turn: Boolean(m[3]) };
}

/** A Stadium whose attacks Pokémon may use: Holon Lake ({ who: { delta } }) and Meteor Falls ({ under: true }). */
function compileLend(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean === "Each player's Pokémon that has δ on its card can use attacks on this card instead of its own.") return { who: { delta: true } };
  if (clean === "Each player's Active Evolved Pokémon (excluding Pokémon-ex) can use any attack from its Basic Pokémon or its Stage 1 Evolution card. (You still have to pay for that attack's Energy cost.)") return { under: true };
  return null;
}

/** The Item card, carrying the Pokémon it is in play (`fossil.mon`). */
function fossilDef(base, card, text, fossil) {
  const printed = card.abilities || [];
  const ability = printed.length === 1 ? compileAbility(printed[0], card.name) : null;
  const notes = printed.length && !ability ? [`${printed[0].type || "Ability"} not live yet`] : [];
  const mon = {
    ...base,
    kind: "pokemon",
    stage: "basic",
    evolvesFrom: "",
    hp: Number(card.hp),
    types: fossil.colorless ? ["Colorless"] : [],
    attacks: [],
    weakness: null,
    resistance: null,
    retreat: 0,
    prizes: fossil.noPrize ? 0 : 1,
    box: "",
    rule: false,
    ...(printed.length ? { abilityKind: printed[0].type || "Ability" } : {}),
    ...(ability ? { ability } : {}),
    fossil: { ...fossil },
    playable: true,
    why: "",
    notes,
  };
  return { ...base, kind: "trainer", sub: "item", text, fx: [], fossil: { ...fossil, mon }, hp: mon.hp, notes, playable: true, why: "" };
}

/**
 * `row` is the card's entry in data/tcg/rules.json, or undefined when it has none.
 * `lines`: Stage 1 names to the names they evolve from (data/tcg/trainers.json `lines`), for Rare Candy.
 */
export function defineCard(card, row, text = "", lines = null, print = null) {
  const def = defineRules(card, row, text, lines, print);
  // Which formats it may be played in (js/tcg/formats.js), as a reason to show the player.
  def.legal = legalityOf(def, print?.reprints);
  return def;
}

/**
 * `print`: what data/tcg/legal.json says of this print, { mark, reprints }
 * (js/tcg/formats.js). Without it a card has no regulation mark.
 */
function defineRules(card, row, text, lines, print) {
  // Kinds some Trainers ask for by name: "a Team Plasma card", "Pokémon SP", "(excluding Pokémon LV.X)", "Baby Pokémon".
  const tags = (card.subtypes || []).filter((s) => TAGS.includes(s));
  const base = {
    id: card.id,
    name: card.name,
    // The name it counts under for the 4-copy rule ("Gengar LV.X" is a Gengar).
    deckName: deckName(card.name),
    mark: print?.mark || "",
    ...(isClassic(card) ? { classic: true } : {}),
    ...limitsOf(card),
    ...(tags.length ? { tags } : {}),
  };
  if (card.supertype === "Energy" || card.energy) {
    const type = ENERGY_TYPES.find((t) => new RegExp(`^(Basic )?${t} Energy$`).test(card.name));
    const basic = Boolean(type) && (card.subtypes || []).includes("Basic");
    if (basic) return { ...base, kind: "energy", provides: [type], basic, playable: true, why: "" };
    // Special Energy: what it provides and does comes from its text (js/tcg/energy.js).
    const special = compileSpecialEnergy(text, card.name);
    if (!special) return { ...base, kind: "energy", provides: [], basic: false, text: text || "", playable: false, why: "This Special Energy's text isn't live yet." };
    return { ...base, kind: "energy", provides: special.provides, basic: false, special, text, playable: true, why: "" };
  }
  if (card.supertype !== "Pokémon") {
    const subs = card.subtypes || [];
    const sub = subs.includes("Supporter") ? "supporter" : subs.includes("Stadium") ? "stadium" : subs.some((x) => /Tool|Technical Machine/.test(x)) ? "tool" : "item";
    const fossil = sub === "item" ? compileFossil(text, card) : null;
    if (fossil) return fossilDef(base, card, text, fossil);
    // Technical Machines and the Stadiums whose attacks Pokémon may use: the card's own attacks, all of them read.
    const lent = subs.includes("Technical Machine") ? compileTm(text, card) : sub === "stadium" ? compileLend(text) : null;
    if (lent) {
      const attacks = (card.attacks || []).map((raw) => attackOf({ ...raw, cost: COST_FIX[card.id] || raw.cost }, card.name));
      const read = lent.under ? !attacks.length : attacks.length && attacks.every((a) => !a.plain);
      const why = read ? "" : `This ${sub === "stadium" ? "Stadium" : "Technical Machine"}'s attack text isn't live yet.`;
      if (sub === "stadium") return { ...base, kind: "trainer", sub, text, fx: [], stadium: { lend: lent }, attacks, playable: !why, why };
      return { ...base, kind: "trainer", sub: "item", tm: true, text, fx: [{ op: "tm", ...lent }], attacks, playable: !why, why };
    }
    const fx = sub === "item" || sub === "supporter" ? compileCard(text) : null;
    // A Tool is not played and discarded: it is attached, and its numbers ride on the Pokémon.
    const tool = sub === "tool" && subs.includes("Pokémon Tool") ? compileTool(text, card.name) : null;
    const stadium = sub === "stadium" ? compileStadium(text) : null;
    const why = sub === "stadium" ? (stadium ? "" : "This Stadium's text isn't live yet.") : sub === "tool" ? (tool ? "" : "This Tool's text isn't live yet.") : fx ? "" : "This Trainer's text isn't live yet.";
    return { ...base, kind: "trainer", sub, text: text || "", fx: fx || [], ...(tool ? { tool } : {}), ...(stadium ? { stadium } : {}), playable: !why, why };
  }

  const subs = card.subtypes || [];
  // The XY era's Mega Evolution Pokémon-EX ("M Charizard-EX", subtypes "MEGA"/"Mega" in the data) and Primal Reversion.
  const megaEvolved = (subs.includes("MEGA") && subs.includes("EX")) || /^(M|Primal) .+-EX$/.test(card.name || "");
  let stage = "";
  if (card.evolvesFrom && (subs.some((s) => EVOLVED.test(s)) || megaEvolved)) stage = "evolution";
  else if (subs.includes("Basic") || subs.includes("Baby")) stage = "basic";
  else if (card.evolvesFrom && !subs.some((s) => NOT_YET.test(s))) stage = "evolution";

  const attacks = (card.attacks || []).map((raw) => attackOf(raw, card.name));
  const notes = [];
  // One Ability a card, as nearly every card has it; a second one waits with the unread ones.
  const printed = card.abilities || [];
  const ability = printed.length === 1 ? compileAbility(printed[0], card.name) : null;
  if (printed.length && !ability) notes.push(`${printed[0].type || "Ability"} not live yet`);
  if (attacks.some((a) => a.plain)) notes.push("Some attack text not live yet");

  let why = "";
  if (!stage) why = "This kind of Pokémon isn't in yet.";
  // A BREAK keeps the Weakness, Resistance, Retreat Cost and attacks of what it evolved from; until the table reads those through, it waits.
  else if (subs.includes("BREAK")) why = "BREAK Evolution isn't in yet.";
  else if (!row) why = "We don't have this card's play data yet.";
  // A Pokémon with no attack of its own may still be played for its Ability (Elekid's Playful Punch).
  else if (!attacks.length && !ability) why = "It has no attack to use yet.";

  return {
    ...base,
    kind: "pokemon",
    stage,
    evolvesFrom: stage === "evolution" ? card.evolvesFrom : "",
    // Stage 1 or Stage 2 (Rare Candy asks); a Stage 2's `roots` are the Basic Pokémon its Stage 1 evolves from.
    ...(stage === "evolution" && subs.includes("Stage 1") ? { line: 1 } : {}),
    ...(stage === "evolution" && subs.includes("Stage 2") ? { line: 2, roots: lines?.[card.evolvesFrom] || [] } : {}),
    hp: Number(card.hp) || 0,
    types: card.types || [],
    attacks,
    weakness: side(row?.[0]),
    resistance: side(row?.[1]),
    retreat: Number(row?.[2]) || 0,
    prizes: prizesFor(card, row),
    box: boxOf(card),
    ...(printed.length ? { abilityKind: printed[0].type || "Ability" } : {}),
    // The Baby Pokémon rule (attacking it takes a coin flip), and Team Plasma for the cards that ask.
    ...(subs.includes("Baby") ? { baby: true } : {}),
    ...(subs.includes("Team Plasma") ? { plasma: true } : {}),
    // "A Pokémon that doesn't have a Rule Box" (Pokémon ex, V, GX, Radiant, Prism Star ...).
    rule: Boolean(boxOf(card)) || subs.some((s) => /^(Radiant|Prism Star|BREAK|LEGEND|V-UNION|Level-Up|Star|TAG TEAM|MEGA)$/.test(s)),
    ...(ability ? { ability } : {}),
    // Old Mega Evolution Pokémon-EX (and Primal Reversion) end the turn they come into play by evolving; the new Mega ex don't.
    ...(megaEvolved ? { megaEnds: true } : {}),
    ...(subs.includes("Tera") ? { tera: true } : {}),
    playable: !why && Number(card.hp) > 0,
    why,
    notes,
  };
}

/** The set a rules row is filed under and its key there: "sv10-svp199" -> ["sv10", "svp199"]. */
export function rulesKey(id) {
  const at = String(id).indexOf("-");
  return at < 0 ? [id, ""] : [id.slice(0, at), id.slice(at + 1)];
}

/**
 * A lookup the engine can call: defs(id) -> definition.
 * `findCard(id)` finds the site's card; `rules` is data/tcg/rules.json, `trainers` data/tcg/trainers.json,
 * `legal` data/tcg/legal.json (regulation marks: without it only basic Energy is legal in Standard).
 */
export function createDefs(findCard, rules, trainers = null, legal = null) {
  const cache = new Map();
  return function defs(id) {
    let def = cache.get(id);
    if (def) return def;
    const card = findCard(id);
    if (!card) return null;
    const [set, full] = rulesKey(id);
    // A special print ("swsh1-15-cracked-ice", a stamped promo) plays as the card it reprints.
    const base = full.replace(/-.*$/, "");
    const key = rules?.[set]?.[full] || trainers?.cards?.[set]?.[full] != null ? full : base;
    const textKey = trainers?.cards?.[set]?.[key];
    const marks = legal?.marks?.[set];
    const print = { mark: marks?.[full] ?? marks?.[key] ?? marks?._ ?? "", reprints: legal?.reprints || null };
    def = defineCard(card, rules?.[set]?.[key], trainers?.texts[textKey] || "", trainers?.lines, print);
    cache.set(id, def);
    return def;
  };
}
