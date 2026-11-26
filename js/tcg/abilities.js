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
 * `kind` is the printed label: "Ability", "Poké-Body", "Poké-Power" or "Pokémon Power".
 */

import { compileTrainer } from "./trainers.js";

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

/** Texts that stand for as long as the Pokémon is in play. */
const STANDING = [
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
/** What "you may ..." asks for, where a Trainer wouldn't say it that way. [wording, steps]. */
const DOES = [
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

function stepsOf(words) {
  const said = words.replace(/^use this (?:Ability|power)\. /i, "");
  const text = said[0].toUpperCase() + said.slice(1);
  for (const [pattern, build] of DOES) {
    const m = text.match(pattern);
    if (m) return build(m);
  }
  return compileTrainer(text);
}

const PRICE = /^You must discard (an?|\d+) cards? from your hand in order to use this (?:Ability|Poké-Power)\. /;
const USE = /^(Once|As often as you like) during your turn(?: \(before your attack\))?, (?:if this Pokémon is (in the Active Spot|your Active Pokémon|on your Bench), )?you may (.+)$/;
const ENTER = /^(?:Once during your turn, )?[Ww]hen you play this Pokémon from your hand (onto your Bench|to evolve 1 of your Pokémon)(?: during your turn)?, you may (.+)$/;

export function compileAbility(ability, cardName = "") {
  const kind = ability?.type || "Ability";
  let text = String(ability?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Older cards name themselves where newer ones say "this Pokémon".
  if (cardName) text = text.split(cardName).join("this Pokémon");
  text = text
    .replace(/ This power can't be used if this Pokémon is (?:affected by a Special Condition|Asleep, Confused, or Paralyzed)\./, "")
    .replace(/ \(This doesn't use up your 1 Energy card attachment for the turn\.\)/, "");
  let single = false;
  text = text.replace(/ You can't use more than 1 .+? (?:Ability|Poké-Power) each turn\./, () => ((single = true), ""));
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
  if (m) {
    const steps = stepsOf(m[3]);
    if (!steps) return null;
    const where = !m[2] ? "" : /Bench/.test(m[2]) ? "bench" : "active";
    return { ...base, use: { steps: cost ? [{ op: "cost", n: cost, spare: 0 }, ...steps] : steps, where, often: m[1] !== "Once", single } };
  }
  m = !cost && text.match(ENTER);
  if (m) {
    const steps = stepsOf(m[2]);
    return steps ? { ...base, enter: { steps, how: /Bench/.test(m[1]) ? "bench" : "evolve" } } : null;
  }
  return null;
}
