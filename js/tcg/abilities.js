/**
 * Abilities (and the Poké-Powers, Poké-Bodies and Pokémon Powers before them): the
 * text on the Pokémon turned into something the engine can act on, the same road
 * attack text (effects.js) and Trainer text (trainers.js) take.
 *
 *   compileAbility(ability, cardName) -> what it does, or null when the text isn't read yet
 *
 * What comes back holds one or more of:
 *   mod      standing change to this Pokémon's own numbers (see compileTool), with
 *            `when` ({ energy: type | "any" | "none" }) and `where` ("active" | "bench") if it has terms
 *   aura     { who, mod }: the same, for each of its owner's Pokémon that fits `who`
 *   thorns   { n } | { status }: hits back when it is damaged in the Active Spot
 *   dodge    a coin flip to take no damage from an attack
 *   wall     { boxes, types, stage }: no damage from attackers of that kind
 *   benchSafe  no damage from attacks while on the Bench
 *   sturdy   n: survives a Knock Out from full HP with n HP left
 *   use      { steps, where, often, cost }: "Once during your turn, you may ..."
 *   enter    { steps, how: "bench" | "evolve" }: "When you play this Pokémon from your hand ..."
 *   (and, newer) immune [conditions] in `mod`; benchWall; hangOn n (a coin flip to survive);
 *   foeAura { who, mod } on the other player's Pokémon; early "any" | "active" | "second" (may
 *   evolve sooner); mend n between turns; attachCure; noEffects (attack effects, not damage).
 *   `use` may carry: calm (not with a Special Condition), vstar (once a game), ends (the turn
 *   ends), selfKo (this Pokémon is Knocked Out afterwards).
 * `kind` is the printed label: "Ability", "Poké-Body", "Poké-Power" or "Pokémon Power".
 */

import { compileTrainer, whatOf } from "./trainers.js";

const TYPE = "(?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless)";
const AFTER = "(?: \\(after applying Weakness and Resistance\\))?";
const BEFORE = "(?: \\(before applying Weakness and Resistance\\))?";
const COUNTERS = "(?:put|place) (\\d+) damage counters? on";
const typesIn = (words) => words.match(new RegExp(TYPE, "g")) || [];
const colorless = (words) => words.length / 9;

/** "your opponent's Pokémon ex and Pokémon V" -> which attackers a wall stops, or null. */
function wallOf(words) {
  const out = { boxes: [], types: [], stage: "" };
  for (const part of words.split(/, and | and | or |, /)) {
    const p = part.trim();
    let m;
    if (/^Pokémon[ -]ex$/.test(p)) out.boxes.push("ex");
    else if (/^Pokémon[ -]EX$/.test(p)) out.boxes.push("EX");
    else if (/^Pokémon[ -]GX$/.test(p)) out.boxes.push("GX");
    else if (/^Pokémon V$/.test(p)) out.boxes.push("V", "VMAX", "VSTAR");
    else if (/^Pokémon VMAX$/.test(p)) out.boxes.push("VMAX");
    else if (/^Pokémon VSTAR$/.test(p)) out.boxes.push("VSTAR");
    else if (/^Basic Pokémon$/.test(p)) out.stage = "basic";
    else if ((m = p.match(new RegExp(`^(${TYPE}) Pokémon$`)))) out.types.push(m[1]);
    else return null;
  }
  return out;
}

const CONDITION = "(?:Asleep|Burned|Confused|Paralyzed|Poisoned)";
const condsIn = (words) => (words.match(new RegExp(CONDITION, "g")) || []).map((w) => w.toLowerCase());

/** Texts that stand for as long as the Pokémon is in play. */
const STANDING = [
  [/^This Pokémon can't be affected by any Special Conditions\.$/, () => ({ mod: { immune: ["all"] } })],
  [new RegExp(`^This Pokémon can't be ((?:${CONDITION}(?:, or |, | or | and )?)+)\\.$`), (m) => ({ mod: { immune: condsIn(m[1]) } })],
  [/^Prevent all damage done to your Benched Pokémon by (?:your opponent's attacks|attacks from your opponent's Pokémon)\.$/, () => ({ benchWall: true })],
  [/^If this Pokémon would be Knocked Out by damage from an attack, flip a coin\. If heads, this Pokémon is not Knocked Out, and its remaining HP becomes (\d+)\.$/, (m) => ({ hangOn: Number(m[1]) })],
  [/^Your opponent's Active Pokémon's Retreat Cost is ((?:Colorless)+) more\.$/, (m) => ({ foeAura: { who: { active: true }, mod: { retreat: -colorless(m[1]) } } })],
  [new RegExp(`^As long as this Pokémon is your Active Pokémon, (?:all of )?your Pokémon take (\\d+) less damage from (?:your opponent's )?attacks${AFTER}\\.$`), (m) => ({ aura: { who: {}, mod: { less: Number(m[1]) } }, where: "active" })],
  [/^As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is ((?:Colorless)+) less\.$/, (m) => ({ aura: { who: { active: true }, mod: { retreat: colorless(m[1]) } }, where: "bench" })],
  [/^This Pokémon can evolve during your first turn or the turn you play it\.$/, () => ({ early: "any" })],
  [/^As long as this Pokémon is in the Active Spot, it can evolve during your first turn or the turn you play it\.$/, () => ({ early: "active" })],
  [/^If you go second, this Pokémon can evolve during your first turn\.$/, () => ({ early: "second" })],
  [/^At any time between turns, remove (\d+) damage counters? from this Pokémon\.$/, (m) => ({ mend: Number(m[1]) * 10 })],
  [/^As long as this Pokémon is Asleep, prevent all damage done to this Pokémon by attacks\.$/, () => ({ wall: { all: true, boxes: [], types: [], stage: "" }, when: { status: "asleep" } })],
  [/^Whenever you attach an Energy card from your hand to this Pokémon, remove all Special Conditions from it\.$/, () => ({ attachCure: true })],
  [/^Prevent all effects of (?:attacks (?:from|used by) your opponent's Pokémon done to this Pokémon\. \(Damage is not an effect\.\)|your opponent's attacks, except damage, done to this Pokémon\.)$/, () => ({ noEffects: true })],
  [new RegExp(`^(?:This Pokémon takes (\\d+) less damage from (?:your opponent's )?attacks|(?:Any|All) damage done (?:to this Pokémon by attacks|by attacks to this Pokémon) is reduced by (\\d+))${AFTER}\\.$`), (m) => ({ mod: { less: Number(m[1] || m[2]) } })],
  [/^This Pokémon has no Retreat Cost\.$/, () => ({ mod: { retreat: "all" } })],
  [/^This Pokémon has no Weakness\.$/, () => ({ mod: { noWeakness: true } })],
  [new RegExp(`^If this Pokémon has any (${TYPE}) Energy attached(?: to it)?, (?:it has no Retreat Cost|the Retreat Cost for this Pokémon is 0)\\.$`), (m) => ({ mod: { retreat: "all" }, when: { energy: m[1] } })],
  [/^If this Pokémon has no Energy attached(?: to it)?, it has no Retreat Cost\.$/, () => ({ mod: { retreat: "all" }, when: { energy: "none" } })],
  [new RegExp(`^If this Pokémon has any (${TYPE}) Energy attached(?: to it)?, it gets \\+(\\d+) HP\\.$`), (m) => ({ mod: { hp: Number(m[2]) }, when: { energy: m[1] } })],
  [new RegExp(`^If this Pokémon has any (${TYPE}) Energy attached(?: to it)?, it gets \\+(\\d+) HP, and the attacks it uses do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => ({ mod: { hp: Number(m[2]), plus: Number(m[3]) }, when: { energy: m[1] } })],
  [new RegExp(`^If this Pokémon has any (${TYPE}) Energy attached(?: to it)?, it takes (\\d+) less damage from attacks${AFTER}\\.$`), (m) => ({ mod: { less: Number(m[2]) }, when: { energy: m[1] } })],
  [/^Your Basic Pokémon in play have no Retreat Cost\.$/, () => ({ aura: { who: { stage: "basic" }, mod: { retreat: "all" } } })],
  [new RegExp(`^(?:Each of your Pokémon that has any (${TYPE}) Energy attached to it has|All of your Pokémon that have (${TYPE}) Energy attached have) no Retreat Cost\\.$`), (m) => ({ aura: { who: { energy: m[1] || m[2] }, mod: { retreat: "all" } } })],
  [new RegExp(`^(?:Your (${TYPE}) Pokémon's attacks|The attacks of your (${TYPE}) Pokémon) do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => ({ aura: { who: { types: [m[1] || m[2]] }, mod: { plus: Number(m[3]) } } })],
  [new RegExp(`^Your (${TYPE}) Pokémon in play have no Retreat Cost\\.$`), (m) => ({ aura: { who: { types: [m[1]] }, mod: { retreat: "all" } } })],
  [new RegExp(`^If this Pokémon is (?:in the Active Spot|your Active Pokémon) and is damaged by an (?:opponent's attack|attack from your opponent's Pokémon) \\(even if (?:this Pokémon|it) is Knocked Out\\), ${COUNTERS} the Attacking Pokémon\\.$`), (m) => ({ thorns: { n: Number(m[1]) * 10 } })],
  [/^If this Pokémon is (?:in the Active Spot|your Active Pokémon) and is damaged by an (?:opponent's attack|attack from your opponent's Pokémon) \(even if (?:this Pokémon|it) is Knocked Out\), the Attacking Pokémon is now (Poisoned|Burned|Paralyzed|Asleep|Confused)\.$/, (m) => ({ thorns: { status: m[1].toLowerCase() } })],
  [/^If any damage is done to this Pokémon by attacks, flip a coin\. If heads, prevent that damage\.$/, () => ({ dodge: true })],
  [new RegExp(`^If this Pokémon has any (${TYPE}) Energy attached(?: to it)? and is damaged by an attack, flip a coin\\. If heads, prevent that damage\\.$`), (m) => ({ dodge: true, when: { energy: m[1] } })],
  [/^As long as this Pokémon is on your Bench, prevent all damage done to this Pokémon by attacks(?: \(both yours and your opponent's\))?\.$/, () => ({ benchSafe: true })],
  [/^If this Pokémon has full HP and would be Knocked Out by damage from an attack, (?:it|this Pokémon) is not Knocked Out,? and its remaining HP becomes (\d+)(?: instead)?\.$/, (m) => ({ sturdy: Number(m[1]) })],
  [/^Prevent all (?:damage done to this Pokémon by attacks from|effects of attacks, including damage, done to this Pokémon by) your opponent's (.+?)\.$/, (m) => {
    const wall = wallOf(m[1]);
    return wall ? { wall } : null;
  }],
];

const ENERGY = `(?:an?|1) (?:[Bb]asic )?(${TYPE})? ?Energy(?: card)?`;
const MOVE_TO = { "another of your Pokémon": "any", "your Active Pokémon": "active", "this Pokémon": "self", "1 of your Benched Pokémon": "bench" };
const FETCH_TO = { "this Pokémon": "self", "your Active Pokémon": "active", "1 of your Pokémon": "one", "your Pokémon in any way you like": "spread" };
const UPTO = "(?:up to )?(\\d+|an?)";
const many = (word) => (/^an?$/.test(word) ? 1 : Number(word));
/** What "you may ..." asks for, where a Trainer wouldn't say it that way. [wording, steps]. */
const DOES = [
  [new RegExp(`^Move ${ENERGY} (?:from|attached to) 1 of your (Benched )?Pokémon to (another of your Pokémon|your Active Pokémon|this Pokémon|1 of your Benched Pokémon)\\.$`), (m) => [{ op: "moveEnergy", type: m[1] || "", basic: /[Bb]asic/.test(m[0]), from: m[2] ? "bench" : "any", to: MOVE_TO[m[3]] }]],
  [new RegExp(`^Move ${ENERGY} from this Pokémon to (1 of your Benched Pokémon|another of your Pokémon|your Active Pokémon)\\.$`), (m) => [{ op: "moveEnergy", type: m[1] || "", basic: /[Bb]asic/.test(m[0]), from: "self", to: MOVE_TO[m[2]] }]],
  [/^(?:Put|Place) (\d+) damage counters? on 1 of your opponent's Benched Pokémon\.$/, (m) => [{ op: "counters", n: Number(m[1]) * 10, where: "bench" }]],
  [/^(?:Put|Place) (\d+) damage counters? on your opponent's Active Pokémon\.$/, (m) => [{ op: "counters", n: Number(m[1]) * 10, where: "active" }]],
  [/^Move (?:up to )?(\d+) damage counters? from 1 of your Pokémon to (1 of your opponent's Pokémon|another of your Pokémon)\.$/, (m) => [{ op: "moveCounters", n: Number(m[1]) * 10, to: /opponent/.test(m[2]) ? "foe" : "mine" }]],
  [new RegExp(`^Make your opponent's Active Pokémon ((?:${CONDITION}(?:, and |, | and | or )?)+)\\.$`), (m) => [{ op: "condition", kinds: condsIn(m[1]) }]],
  [/^(?:Switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)|Have your opponent switch (?:their|his or her) Active Pokémon with 1 of (?:their|his or her) Benched Pokémon\.)$/, () => [{ op: "foeSwitch" }]],
  [new RegExp(`^Search your deck for ${UPTO} (.+?) and attach (?:it|them) to (this Pokémon|your Active Pokémon|1 of your Pokémon|your Pokémon in any way you like)\\. (?:Then, shuffle your deck|Shuffle your deck afterward)\\.$`), (m) => {
    const what = whatOf(m[2]);
    if (!/^(basicEnergy|energy)/.test(what)) return null;
    return [{ op: "fetchEnergy", what, n: many(m[1]), to: FETCH_TO[m[3]] }];
  }],
  [new RegExp(`^Look at the top (\\d+) cards of your deck and attach any number of (.+?) you find there to this Pokémon\\. Put the other cards into your hand\\.$`), (m) => {
    const what = whatOf(m[2]);
    if (!/^(basicEnergy|energy)/.test(what)) return null;
    return [{ op: "fetchEnergy", what, n: Number(m[1]), to: "self", top: Number(m[1]), rest: "hand" }];
  }],
  [/^Heal (\d+) damage from each of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "all" }]],
  [/^Heal (\d+) damage from your Active Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "active" }]],
  [/^Heal (\d+) damage from this Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "self" }]],
  [/^Remove (\d+) damage counters? from 1 of your Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10 }]],
  [/^Remove (\d+) damage counters? from this Pokémon\.$/, (m) => [{ op: "heal", n: Number(m[1]) * 10, to: "self" }]],
  [/^Switch (?:it|this Pokémon) with your Active Pokémon\.$/, () => [{ op: "switchSelf" }]],
  [/^(?:Put|Place) (\d+) damage counters? on 1 of your opponent's Pokémon\.$/, (m) => [{ op: "counters", n: Number(m[1]) * 10 }]],
  [/^Discard a card from your hand\. If you do, draw (\d+) cards?\.$/, (m) => [{ op: "cost", n: 1, spare: 0 }, { op: "draw", n: Number(m[1]) }]],
  [new RegExp(`^Attach ${ENERGY} (?:from your (hand|discard pile) )?to (1 of your Pokémon|1 of your Benched Pokémon|this Pokémon|your Active Pokémon|1 of your (${TYPE}) Pokémon|1 of your Benched (${TYPE}) Pokémon)\\.( If you attached Energy to a Pokémon in this way, draw a card\\.)?$`), (m) => [
    { op: "energize", type: m[1] || "", zone: m[2] === "discard pile" ? "discard" : "hand", to: /this Pokémon/.test(m[3]) ? "self" : /Active/.test(m[3]) ? "active" : /Benched/.test(m[3]) ? "bench" : "any", whoType: m[4] || m[5] || "" },
    ...(m[6] ? [{ op: "draw", n: 1, bonus: true }] : []),
  ]],
];

function stepsOf(words, cardName = "") {
  const said = words.replace(/^use this (?:Ability|power|Poké-Power)\. /i, "");
  const text = said[0].toUpperCase() + said.slice(1);
  // "Search your deck for another Deoxys and switch it with Deoxys": a form change.
  const form = text.match(/^Search your deck for (?:another|any) (this Pokémon|[A-Z][\w'.é -]+?) and switch it with this Pokémon\. \(Any cards attached to this Pokémon, damage counters, Special Conditions, and effects on it are now on the new Pokémon\.\) (?:If you do, put this Pokémon on top of your deck\. Shuffle your deck afterward|Shuffle this Pokémon back into your deck)\.$/);
  // "another Unown" is one of the same name; "any Deoxys" is any of its Formes.
  if (form) return cardName ? [{ op: "formChange", name: form[1] === "this Pokémon" ? cardName : form[1], any: /^Search your deck for any /.test(text) }] : null;
  const coin = text.match(/^Flip a coin\. If heads, (.+)$/);
  if (coin) {
    const heads = stepsOf(coin[1], cardName);
    return heads ? [{ op: "flip", heads }] : null;
  }
  for (const [pattern, build] of DOES) {
    const m = text.match(pattern);
    if (m) return build(m);
  }
  return compileTrainer(text);
}

const PRICE = /^You must discard (an?|\d+) cards? from your hand in order to use this (?:Ability|Poké-Power)\. /;
const USE = /^(?:If this Pokémon is your Active Pokémon, )?(Once|As often as you like|During your turn)(?: during your turn)?(?: \(before your attack\))?, (?:if this Pokémon is (in the Active Spot|your Active Pokémon|on your Bench), )?(?:you may )?(.+)$/;
const ACTIVE_FIRST = /^If this Pokémon is your Active Pokémon, /;
const ENTER = /^(?:Once during your turn, )?[Ww]hen you play this Pokémon from your hand (onto your Bench|to evolve 1 of your Pokémon)(?: during your turn)?, you may (.+)$/;

export function compileAbility(ability, cardName = "") {
  const kind = ability?.type || "Ability";
  let text = String(ability?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Older cards name themselves where newer ones say "this Pokémon".
  if (cardName) text = text.split(cardName).join("this Pokémon");
  text = text.replace(/^this Pokémon\b/, "This Pokémon");
  let calm = false, vstar = false, ends = false, selfKo = false, single = false;
  text = text
    .replace(/ This power can't be used if this Pokémon is affected by a Special Condition\./, () => ((calm = true), ""))
    .replace(/ This power can't be used if this Pokémon is Asleep, Confused, or Paralyzed\./, "")
    .replace(/ \(This doesn't use up your 1 Energy card attachment for the turn\.\)/, "")
    .replace(/ \(You can't use more than 1 VSTAR Power in a game\.\)/, () => ((vstar = true), ""))
    .replace(/ If you use this (?:Ability|Poké-Power|power), your turn ends\./, () => ((ends = true), ""))
    .replace(/ (?:If you use this (?:Ability|Poké-Power)|If you searched your deck in this way), this Pokémon is Knocked Out\./, () => ((selfKo = true), ""))
    .replace(/ You can't use more than 1 .+? (?:Ability|Poké-Power)(?: each turn| during your turn)\./, () => ((single = true), ""));
  const base = { name: ability.name || kind, kind, text: String(ability.text || "").replace(/\s+/g, " ").trim() };

  for (const [pattern, build] of STANDING) {
    const m = text.match(pattern);
    if (!m) continue;
    const got = build(m);
    return got ? { ...base, ...got } : null;
  }

  let cost = 0;
  const price = text.match(PRICE);
  if (price) {
    cost = Number(price[1]) || 1;
    text = text.slice(price[0].length);
  }
  let m = text.match(USE);
  // "During your turn, you may" is a VSTAR Power's wording: once a game is the only limit then.
  if (m && (m[1] !== "During your turn" || vstar)) {
    // A wording that starts the same way but isn't read here may still be a "when you play" one below.
    const steps = stepsOf(m[3], cardName);
    const where = ACTIVE_FIRST.test(text) ? "active" : !m[2] ? "" : /Bench/.test(m[2]) ? "bench" : "active";
    const flags = { ...(calm ? { calm } : {}), ...(vstar ? { vstar } : {}), ...(ends ? { ends } : {}), ...(selfKo ? { selfKo } : {}) };
    if (steps) return { ...base, use: { steps: cost ? [{ op: "cost", n: cost, spare: 0 }, ...steps] : steps, where, often: m[1] === "As often as you like", single, ...flags } };
  }
  m = !cost && !ends && !selfKo && !vstar && text.match(ENTER);
  if (m) {
    const steps = stepsOf(m[2], cardName);
    return steps ? { ...base, enter: { steps, how: /Bench/.test(m[1]) ? "bench" : "evolve" } } : null;
  }
  return null;
}
