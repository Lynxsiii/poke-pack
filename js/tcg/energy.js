/**
 * Special Energy: the text on an Energy card that isn't basic, turned into what it
 * provides and what it does, the same road Trainer text (trainers.js) takes.
 *
 *   compileSpecialEnergy(text, cardName) -> what it does, or null when the text isn't read yet
 *
 * What comes back:
 *   provides  the Energy it gives, one entry per unit ("Any" counts as every type)
 *   only      { types } it can be attached only to Pokémon of these types (and gives nothing on others)
 *   mods      [{ who, mod }] standing changes to the Pokémon it is attached to (see compileTool),
 *             for the ones that fit `who` ({ types } or {} for any)
 *   attach    steps run when it is attached from the hand (see trainers.js), with `where`
 *             ("active" | "bench" | "") when the text names a spot
 *   alt       [{ who, provides }] what it gives instead on the Pokémon that fit
 *   crowd     it gives only Colorless while another Special Energy is attached with it
 *
 * The text is read a sentence at a time; one sentence that isn't read keeps the whole
 * card out, so nothing is half working.
 */

import { compileTrainer, tidy } from "./trainers.js";

const TYPE = "(?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon|Colorless)";
const AFTER = "(?: \\(after applying Weakness and Resistance\\))?";
const BEFORE = "(?: \\(before applying Weakness and Resistance\\))?";
const units = (words) => words.match(new RegExp(TYPE, "g")) || [];
/** What it provides: a "provides every type" line wins over a plainer one before or after it. */
const give = (out, list) => {
  if (!out.any) out.provides = list;
  return true;
};
const HOLDER = "the (?:(" + TYPE + ") )?Pokémon (?:that )?this card is attached to";

/** Parentheses that say nothing the engine needs. */
const ASIDES = [
  /\s*\(Doesn't count as a basic Energy card(?: when not in play)?(?: and has no effect other than providing Energy)?\.\)/g,
  /\s*\(Has no effect other than providing Energy\.\)/g,
  /\s*\(Existing effects are not removed\. Damage is not an effect\.\)/g,
  /\s*\(Don't apply Weakness and Resistance\.\)/g,
  /\s*Doesn't count as a basic Energy card\./g,
  /\s*\(Doesn't count as a [Bb]asic card\.\)/g,
  /\s*\(While not in play, this card counts as Colorless Energy\.\)/g,
  /\s*\(If this card is attached to anything other than an? .+? Pokémon, discard this card\.\)/g,
  /\s*If this card is attached to anything other than an? .+? Pokémon, discard this card\./g,
];

/** [wording, (match, out) => true when read]. Each fills in `out`. */
const SENTENCES = [
  [new RegExp(`^(?:This card|It) provides ((?:${TYPE} ?)+) [Ee]nergy$`), (m, out) => give(out, units(m[1]))],
  [new RegExp(`^Provides ((?:${TYPE} ?)+) [Ee]nergy$`), (m, out) => give(out, units(m[1]))],
  [new RegExp(`^As long as this card is attached to a Pokémon, it provides ((?:${TYPE} ?)+) Energy$`), (m, out) => give(out, units(m[1]))],
  [/^Attach this card to 1 of your Pokémon$/, () => true],
  // Neo Upper Energy: on a Stage 2 Pokémon, 2 units of any type.
  [/^If this card is attached to a Stage 2 Pokémon, this card provides every type of Energy but provides only 2 Energy at a time$/, (m, out) => alt(out, { line: 2 }, ["Any", "Any"])],
  // Ignition Energy: 3 Colorless on an Evolution Pokémon, and gone at the end of its owner's turn.
  [/^If this card is attached to an Evolution Pokémon, it provides ColorlessColorlessColorless Energy instead$/, (m, out) => alt(out, { stage: "evolution" }, ["Colorless", "Colorless", "Colorless"])],
  [/^If this card is attached to 1 of your Pokémon, discard it at the end of your turn$/, (m, out) => (out.burnOut = true)],
  // Team Rocket's Energy.
  [/^This card can only be attached to an? (Team Rocket's) Pokémon$/, (m, out) => ((out.only = { named: m[1] }), true)],
  [new RegExp(`^As long as this card is attached to a Pokémon, it provides 2 in any combination of (${TYPE}) Energy and (${TYPE}) Energy$`), (m, out) => give(out, [`${m[1]}|${m[2]}`, `${m[1]}|${m[2]}`])],
  // Mist Energy, Rocky Fighting Energy: no effects of the opponent's attacks (damage still lands).
  [new RegExp(`^Prevent all effects of attacks used by your opponent's Pokémon done to ${HOLDER}$`), (m, out) => mod(out, m[1], { noEffects: true })],
  // Shadowy Darkness Energy.
  [new RegExp(`^As long as ${HOLDER} is on your Bench, prevent all damage done to it by attacks from your opponent's Pokémon$`), (m, out) => mod(out, m[1], { benchSafe: true })],
  // Spiky Energy.
  [new RegExp(`^If ${HOLDER} is in the Active Spot and is damaged by an attack from your opponent's Pokémon \\(even if this Pokémon is Knocked Out\\), put (\\d+) damage counters? on the Attacking Pokémon$`), (m, out) => mod(out, m[1], { thorns: Number(m[2]) * 10 })],
  // Legacy Energy: one fewer Prize card, once a game.
  [new RegExp(`^If ${HOLDER} is Knocked Out by damage from an attack from your opponent's Pokémon, that player takes 1 fewer Prize card$`), (m, out) => mod(out, m[1], { legacy: 1 })],
  [/^This effect of (?:your )?this card can't be applied more than once per game$/, (m, out) => out.mods.some((x) => x.mod.legacy)],
  [new RegExp(`^This card provides 1 (${TYPE}) Energy$`), (m, out) => give(out, [m[1]])],
  [/^(?:As long as|While) this card is attached to a Pokémon, it provides every type of Energy but provides only 1 Energy at a time$/, (m, out) => ((out.provides = ["Any"]), (out.any = true))],
  [new RegExp(`^(?:While this card is attached to a Pokémon, it|When this card is attached to a Pokémon, this card|While in play, this card) provides ((?:${TYPE}(?:, or |, and |, | or | and )?)+) Energy,? but provides only 1 Energy at a time$`), (m, out) => ((out.provides = [units(m[1]).join("|")]), (out.any = true))],
  [new RegExp(`^While in play, this card provides (${TYPE}) Energy and (${TYPE}) Energy, but provides only 1 Energy at a time$`), (m, out) => ((out.provides = [`${m[1]}|${m[2]}`]), (out.any = true))],
  [/^This card can be attached only to an Evolved Pokémon( \(excluding Pokémon-ex\))?$/, (m, out) => ((out.only = { evolved: true, ...(m[1] ? { noEx: true } : {}) }), true)],
  [/^While in play, this card (?:provides every type of Energy but provides only 1 Energy at a time|counts as every type of basic Energy but only provides 1 Energy at a time)$/, (m, out) => ((out.provides = ["Any"]), (out.any = true))],
  [new RegExp(`^This card can only be attached to (${TYPE}) Pokémon$`), (m, out) => ((out.only = { types: [m[1]] }), true)],
  // Double Dragon Energy: 2 units, each of any type, on the only Pokémon it may go on.
  [new RegExp(`^This card provides every type of Energy, but provides only 2 Energy at a time, only while this card is attached to an? (${TYPE}) Pokémon$`), (m, out) => out.only?.types?.[0] === m[1] && ((out.provides = ["Any", "Any"]), (out.any = true))],
  // Multi Energy: on a Pokémon with another Special Energy attached, only Colorless.
  [/^(?:this card|Multi energy) provides Colorless Energy when attached to a Pokémon that already has Special Energy cards attached to it$/i, (m, out) => (out.crowd = true)],
  [new RegExp(`^This card provides (${TYPE}) Energy only while this card is attached to an? (${TYPE}) Pokémon$`), (m, out) => ((out.provides = [m[1]]), (out.only = { types: [m[2]] }), true)],
  [new RegExp(`^${HOLDER} has no Weakness$`, "i"), (m, out) => mod(out, m[1], { noWeakness: true })],
  [new RegExp(`^${HOLDER} gets \\+(\\d+) HP$`, "i"), (m, out) => mod(out, m[1], { hp: Number(m[2]) })],
  [new RegExp(`^The attacks of ${HOLDER} do (\\d+) (more|less) damage to your opponent's (?:Active )?Pokémon${BEFORE}$`), (m, out) => mod(out, m[1], { plus: Number(m[2]) * (m[3] === "less" ? -1 : 1) })],
  [new RegExp(`^${HOLDER} takes (\\d+) less damage from (?:attacks from your opponent's Pokémon|(?:your opponent's )?attacks)${AFTER}$`, "i"), (m, out) => mod(out, m[1], { less: Number(m[2]) })],
  [new RegExp(`^${HOLDER} has no Retreat Cost$`, "i"), (m, out) => mod(out, m[1], { retreat: "all" })],
  [new RegExp(`^Attacks used by ${HOLDER} do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}$`), (m, out) => mod(out, m[1], { plus: Number(m[2]) })],
  // More on some Pokémon than on others: `alt` is what it gives where `who` fits (see energyOf).
  [/^If (?:the Pokémon this card is attached to is|this card is attached to) a Basic Pokémon, this card provides every type of Energy but provides only 1 Energy at a time$/, (m, out) => alt(out, { stage: "basic" }, ["Any"])],
  [/^While attached to a Pokémon that has δ on its card, this card provides every type of Energy but provides only 1 Energy at a time$/, (m, out) => alt(out, { delta: true }, ["Any"])],
  [/^As long as this card is attached to a Pokémon that isn't a Pokémon V or a Pokémon-GX, it provides ColorlessColorless Energy$/, (m, out) => alt(out, { notBoxes: ["V", "VMAX", "VSTAR", "GX"] }, ["Colorless", "Colorless"])],
  [/^If this card is attached to a Pokémon V or a Pokémon-GX, it provides Colorless Energy instead$/, (m, out) => give(out, ["Colorless"])],
  [/^If you have more Prize cards remaining than your opponent, and if this card is attached to a Pokémon that isn't a Pokémon-GX or Pokémon-EX, this card provides every type of Energy but provides only 2 Energy at a time$/, (m, out) => alt(out, { notBoxes: ["GX", "EX"], behind: true }, ["Any", "Any"])],
  [new RegExp(`^${HOLDER} (?:recovers from all Special Conditions and )?can't be affected by any Special Conditions$`, "i"), (m, out) => mod(out, m[1], { immune: ["all"] })],
  // Old Metal and Darkness Energy: the change, then "Ignore this effect if ... isn't Metal".
  [new RegExp(`^Damage done (?:by attacks )?to the Pokémon (?:that )?this card (?:is )?attached to is reduced by (\\d+)${AFTER}$`), (m, out) => mod(out, "", { less: Number(m[1]) })],
  [new RegExp(`^If the Pokémon this card is attached to attacks?, the attack does (\\d+) more damage to the Active Pokémon${BEFORE}$`), (m, out) => mod(out, "", { plus: Number(m[1]) })],
  [new RegExp(`^Ignore this effect if the Pokémon (?:that )?this card is attached to isn't (${TYPE})$`, "i"), (m, out) => {
    const last = out.mods[out.mods.length - 1];
    if (!last || last.who.types) return false;
    last.who = { types: [m[1]] };
    return true;
  }],
  [/^Ignore this effect unless the Attacking Pokémon is Darkness or has Dark in its name$/, (m, out) => {
    const last = out.mods[out.mods.length - 1];
    if (!last || last.who.types) return false;
    last.who = { types: ["Darkness"], dark: true };
    return true;
  }],
  // When it is attached from the hand.
  [/^When you attach this card from your hand to (?:1 of your Pokémon|a Pokémon), (.+)$/, (m, out) => onAttach(out, m[1], "")],
  [/^If you play this card from your hand, (.+)$/, (m, out) => onAttach(out, m[1], "")],
  [/^When you (?:attach this card from your hand|play this card from your hand and attach it) to your Active Pokémon, (?:switch 1 of the Defending Pokémon with 1 of your opponent's Benched Pokémon|your opponent switches (?:his or her|their) Active Pokémon with 1 of (?:his or her|their) Benched Pokémon)$/, (m, out) => ((out.attach = { steps: [{ op: "foeSwitch" }], where: "active" }), true)],
  [/^Your opponent chooses the Benched Pokémon to switch$/, (m, out) => out.attach?.steps[0]?.op === "foeSwitch"],
  [new RegExp(`^When you attach this card from your hand to an? (${TYPE.slice(3, -1)}) Pokémon, (.+)$`), (m, out) => onAttach(out, m[2], "", m[1])],
  [/^When you attach this card from your hand to your Active Pokémon, switch (?:that Pokémon|your Active Pokémon) with 1 of your Benched Pokémon$/, (m, out) => ((out.attach = { steps: [{ op: "switch" }], where: "active" }), true)],
  [/^When you attach this card from your hand to 1 of your Benched Pokémon, switch that Pokémon with your Active Pokémon$/, (m, out) => ((out.attach = { steps: [{ op: "switchSelf" }], where: "bench" }), true)],
];

function mod(out, type, change) {
  out.mods.push({ who: type ? { types: [type] } : {}, mod: change });
  return true;
}

/** What it does once attached: to the Pokémon it went on, unless it says otherwise. */
const ATTACHED = [
  [/^draw a card$/, () => [{ op: "draw", n: 1 }]],
  [/^put (\d+) damage counters? on that Pokémon$/, (m) => [{ op: "hurtSelf", n: Number(m[1]) * 10 }]],
  [/^it does (\d+) damage to that Pokémon$/, (m) => [{ op: "hurtSelf", n: Number(m[1]) }]],
  [/^remove (\d+) damage counters? from (?:that Pokémon|the Pokémon you attach it to)(?:, if it has any)?$/, (m) => [{ op: "heal", n: Number(m[1]) * 10, to: "self" }]],
  [/^remove all Special Conditions from that Pokémon$/, () => [{ op: "cure", to: "self" }]],
  [/^the Pokémon you attach it to is no longer (?:Asleep, Confused, Paralyzed, or Poisoned|affected by a Special Condition)$/, () => [{ op: "cure", to: "self" }]],
  [/^remove (\d+) damage counters? and all Special Conditions from that Pokémon$/, (m) => [{ op: "heal", n: Number(m[1]) * 10, to: "self" }, { op: "cure", to: "self" }]],
  [/^search your deck for a Basic Pokémon and put it onto your Bench\. Then, shuffle your deck$/, () => [{ op: "search", what: "basic", n: 1, to: "bench" }]],
  [/^heal (\d+) damage from that Pokémon$/, (m) => [{ op: "heal", n: Number(m[1]), to: "self" }]],
];

/** `type`: it happens only when the Pokémon it goes on is of that type ("to a Lightning Pokémon"). */
function onAttach(out, words, where, type = "") {
  for (const [pattern, build] of ATTACHED) {
    const m = words.match(pattern);
    if (m) {
      out.attach = { steps: build(m), where, ...(type ? { type } : {}) };
      return true;
    }
  }
  // Anything a Trainer could say that doesn't name "that Pokémon" ("draw 4 cards").
  const steps = !/that Pokémon/.test(words) && compileTrainer(`${words[0].toUpperCase()}${words.slice(1)}.`);
  if (!steps) return false;
  out.attach = { steps, where, ...(type ? { type } : {}) };
  return true;
}

function alt(out, who, provides) {
  (out.alt ||= []).push({ who, provides });
  return true;
}

export function compileSpecialEnergy(text, cardName = "", debug = false) {
  let clean = tidy(text);
  if (!clean) return null;
  // The card's own name means "this card", except where it names the Energy it gives ("Metal Energy provides Metal Energy").
  if (cardName) clean = clean.replace(new RegExp(`(?<!provides )${cardName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "this card");
  clean = clean.replace(/\bColorless Colorless\b/g, "ColorlessColorless");
  for (const aside of ASIDES) clean = clean.replace(aside, "");
  // Sentences, with "Then, shuffle your deck." kept on the one before it.
  const sentences = clean
    .split(/(?<=\.)\s+(?=[A-Za-z])/)
    .reduce((list, s) => (/^Then, /.test(s) && list.length ? [...list.slice(0, -1), `${list[list.length - 1].replace(/\.$/, "")}. ${s}`] : [...list, s]), [])
    .map((s) => s.replace(/\.$/, "").trim())
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .filter(Boolean);
  const out = { provides: null, mods: [] };
  for (const sentence of sentences) {
    const read = SENTENCES.some(([pattern, build]) => {
      const m = sentence.match(pattern);
      return m ? build(m, out) : false;
    });
    if (!read) return debug ? { unread: sentence } : null;
  }
  if (!out.provides?.length) return null;
  const special = { provides: out.provides };
  if (out.only) special.only = out.only;
  if (out.mods.length) special.mods = out.mods;
  if (out.attach) special.attach = out.attach;
  if (out.alt) special.alt = out.alt;
  if (out.crowd) special.crowd = true;
  if (out.burnOut) special.burnOut = true;
  return special;
}
