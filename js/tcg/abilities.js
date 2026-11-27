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
 *   ends), selfKo (this Pokémon is Knocked Out afterwards), need { first, lost, stadium, foePrizes }
 *   (terms: the first turn, a Knock Out last turn, a Stadium in play, their Prizes left).
 *   rise     { steps }: "when this Pokémon moves from your Bench to the Active Spot, you may ..."
 *   ko       { steps | toHand | counters, active, untilTails }: when an opponent's attack Knocks it Out
 *            (`untilTails`: `counters` for each heads of coins flipped until tails)
 *   soften   n: coins flipped until tails as an attack would damage it, n less damage for each heads
 *   foeAttach n: damage when the other player attaches an Energy from their hand
 *   lock     { side: "foe" | "all", active, bench, stage, boxes, exceptBoxes, exceptRuleBox, damaged,
 *            except (an Ability name), kinds, selfKo }: whose Abilities stop (engine.js abilityOn)
 *   ward / trainerWard  keeps off the effects of the other side's Abilities / Items and Supporters
 *   `when` may also be { special }, { tool }, { hpMax }.
 * `kind` is the printed label: "Ability", "Poké-Body", "Poké-Power" or "Pokémon Power".
 */

import { compileTrainer, condOf, whatOf } from "./trainers.js";

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
    else if (/^Basic Pokémon ex$/.test(p)) out.basicEx = true;
    else if (/^Tera Pokémon$/.test(p)) out.tera = true;
    else if ((m = p.match(new RegExp(`^(${TYPE}) Pokémon$`)))) out.types.push(m[1]);
    else return null;
  }
  return out;
}

const CONDITION = "(?:Asleep|Burned|Confused|Paralyzed|Poisoned)";
const condsIn = (words) => (words.match(new RegExp(CONDITION, "g")) || []).map((w) => w.toLowerCase());

const BOTH_KINDS = ["Poké-Power", "Poké-Body"];
/**
 * What follows "As long as this Pokémon is your Active Pokémon / in the Active Spot, ...": locks on
 * Abilities (`lock`, read by abilityOn in engine.js), and the rest that only work from the front.
 */
const FRONT = [
  [/^your opponent's Pokémon-GX and Pokémon-EX in play, in their hand, and in their discard pile have no Abilities, except for (.+)\.$/, (m) => ({ lock: { side: "foe", boxes: ["GX", "EX"], except: m[1] } })],
  [/^your opponent's Pokémon in play that have any damage counters on them have no Abilities, except for Pokémon ex\.$/, () => ({ lock: { side: "foe", damaged: true, exceptBoxes: ["ex"] } })],
  [/^your opponent's Active Pokémon has no Abilities, except for (.+)\.$/, (m) => ({ lock: { side: "foe", active: true, except: m[1] } })],
  [/^your opponent's Basic Pokémon in play have no Abilities, except for Pokémon with a Rule Box \(Pokémon V, Pokémon-GX, etc\. have Rule Boxes\)\.$/, () => ({ lock: { side: "foe", stage: "basic", exceptRuleBox: true } })],
  [/^your opponent's Pokémon in play have no Abilities, except for (.+)\.$/, (m) => ({ lock: { side: "foe", except: m[1] } })],
  [/^Basic Pokémon in play \(both yours and your opponent's\) have no Abilities, except for (.+)\.$/, (m) => ({ lock: { side: "all", stage: "basic", except: m[1] } })],
  [/^Pokémon with a Rule Box in play \(both yours and your opponent's\) have no Abilities, except for (Future|Ancient) Pokémon\.$/, (m) => ({ lock: { side: "all", ruleBox: true, exceptTag: m[1] } })],
  // Cards the other player can't play from their hand (engine.js handLock).
  [/^your opponent can't play any (Item|Stadium) cards(?: or Pokémon Tool cards)? from their hand\.$/, (m) => ({ handBar: { kinds: [m[1].toLowerCase()] } })],
  [/^your opponent can't play any Pokémon that has an Ability from their hand, except for ((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon\.$/, (m) => ({ handBar: { abilityMon: true, exceptOwner: m[1] } })],
  [/^whenever your opponent plays a Supporter card from their hand, prevent all effects of that card done to all of your Pokémon\.$/, () => ({ teamWard: "supporter" })],
  [/^whenever you attach an Energy card from your hand to 1 of your Pokémon, heal (\d+) damage from that Pokémon\.$/, (m) => ({ attachHealAll: Number(m[1]) })],
  [/^whenever your opponent's Active Pokémon moves to the Bench during their turn, their new Active Pokémon is now (Confused|Burned|Poisoned|Asleep|Paralyzed)\.$/, (m) => ({ foeSwap: { status: m[1].toLowerCase() } })],
  [/^put (\d+) more damage counters on your opponent's (Poisoned|Burned) Pokémon during Pokémon Checkup\.$/, (m) => ({ checkupMore: { n: Number(m[1]) * 10, kind: m[2].toLowerCase() } })],
  [/^your opponent's Pokémon can't use any Poké-Powers\.$/, () => ({ lock: { side: "foe", kinds: ["Poké-Power"] } })],
  [/^Benched Pokémon \(yours and your opponent's\) can't use Poké-Powers\.$/, () => ({ lock: { side: "all", bench: true, kinds: ["Poké-Power"] } })],
  [/^each player's Pokémon can't use any Poké-Powers\.$/, () => ({ lock: { side: "all", kinds: ["Poké-Power"] } })],
  [/^each player's Pokémon \(excluding Pokémon-ex\) can't use any Poké-Powers or Poké-Bodies\.$/, () => ({ lock: { side: "all", exceptBoxes: ["ex"], kinds: BOTH_KINDS } })],
  [/^ignore all Poké-Powers and Poké-Bodies other than (.+)\.$/, (m) => ({ lock: { side: "all", kinds: BOTH_KINDS, except: m[1] } })],
  [new RegExp(`^attacks used by your opponent's Active Pokémon do (\\d+) less damage${BEFORE}\\.$`), (m) => ({ foeAura: { who: { active: true }, mod: { plus: -Number(m[1]) } } })],
  [/^whenever your opponent attaches an Energy(?: card)? from (?:their|his or her) hand to 1 of (?:their|his or her) Pokémon, put (\d+) damage counters? on that Pokémon\.$/, (m) => ({ foeAttach: Number(m[1]) * 10 })],
];
const FRONT_FIRST = /^As long as this Pokémon is (?:your Active Pokémon|in the Active Spot), (.+)$/;

/** "If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, ..." */
const KO = /^If this Pokémon (is in the Active Spot and )?is Knocked Out by damage from an attack from your opponent's Pokémon, (.+)$/;
const KO_DOES = [
  [/^search your deck for (?:a card|up to (\d+) cards) and put (?:it|them) into your hand\. Then, shuffle your deck\.$/, (m) => ({ steps: [{ op: "search", what: "any", n: Number(m[1] || 1) }] })],
  [/^put it into your hand instead of the discard pile\. \(Discard all attached cards\.\)$/, () => ({ toHand: true })],
  [/^put (\d+) damage counters on the Attacking Pokémon\.$/, (m) => ({ counters: Number(m[1]) * 10 })],
  [/^discard the top (\d+) cards of your opponent's deck\.$/, (m) => ({ steps: [{ op: "foeMill", n: Number(m[1]) }] })],
  [/^discard (\d+) random cards? from your opponent's hand\.$/, (m) => ({ steps: [{ op: "foeDiscardRandom", n: Number(m[1]) }] })],
  // Gengar ex: heads, the Attacking Pokémon is Knocked Out too (engine.js resolveKnockOuts).
  [/^flip a coin\. If heads, the Attacking Pokémon is Knocked Out\.$/, () => ({ flipKo: true })],
  // Miraidon: Energy of a type from it to 1 Benched Pokémon, as Wishful Baton moves it.
  [new RegExp(`^move up to (\\d+) Basic (${TYPE}) Energy cards? from this Pokémon to 1 of your Benched Pokémon\\.$`), (m) => ({ baton: Number(m[1]), batonType: m[2] })],
];

/** "your Grass Pokémon and Fire Pokémon", "your Evolution Fire Pokémon", "your Future Pokémon, except any Iron Crown ex". */
function whoOf(words) {
  let m = words.match(/^(.+?), except any (.+)$/);
  if (m) {
    const who = whoOf(m[1]);
    return who && { ...who, notName: m[2] };
  }
  if (words === "Pokémon") return {};
  m = words.match(new RegExp(`^(Basic |Evolution )?(${TYPE}) Pokémon(?: and (${TYPE}) Pokémon)?$`));
  if (m) return { types: [m[2], ...(m[3] ? [m[3]] : [])], ...(m[1] ? { stage: m[1] === "Basic " ? "basic" : "evolution" } : {}) };
  m = words.match(/^(Basic |Evolution )?(Future|Ancient) Pokémon$/);
  if (m) return { tag: m[2], ...(m[1] ? { stage: m[1] === "Basic " ? "basic" : "evolution" } : {}) };
  m = words.match(/^((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon$/);
  if (m) return { owner: m[1] };
  return null;
}
const FROM_FOE = "(?:from (?:your opponent's )?attacks|from attacks from your opponent's Pokémon)";

/** Newer standing wordings: auras on all or some of your Pokémon, numbers that grow, and walls with terms. */
const STANDING_MORE = [
  // Meganium's Wild Growth: each Basic Grass Energy on its owner's Pokémon provides 2 (engine.js unitsOn).
  [new RegExp(`^Each Basic (${TYPE}) Energy attached to all of your Pokémon provides \\1 ?\\1 Energy\\.$`), (m) => ({ growth: m[1] })],
  // Relicanth, Mew ex: attacks of other cards (engine.js attacksOf).
  [/^Each of your evolved Pokémon can use any attack from its previous Evolutions\. \(You still need the necessary Energy to use each attack\.\)$/, () => ({ lendUnder: true })],
  [/^This Pokémon can use the attacks of any of your Benched Pokémon\. \(You still need the necessary Energy to use each attack\.\)$/, () => ({ lendBench: true })],
  // Festival Lead: two attacks a turn with the Stadium in play (engine.js encoreDue).
  [/^If ([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*) is in play, this Pokémon may use an attack it has twice\. If the first attack Knocks Out your opponent's Active Pokémon, you may attack again after your opponent chooses a new Active Pokémon\.$/, (m) => ({ encore: true, when: { stadium: m[1] } })],
  // Palafin ex: it comes into play only by Palafin's Zero to Hero (engine.js canEvolveOnto keeps it out of the hand's evolutions).
  [/^Put this Pokémon into play only with the effect of (?:.+?)'s (.+?) Ability\.$/, (m) => ({ onlyVia: m[1] })],
  // Lillie's Clefairy ex: their Dragon Pokémon take Psychic Weakness (engine.js typedDef).
  [new RegExp(`^The Weakness of each of your opponent's (${TYPE}) Pokémon in play is now (${TYPE})\\. \\(Apply Weakness as ×2\\.\\)$`), (m) => ({ foeAura: { who: { types: [m[1]] }, mod: { weakAs: m[2] } } })],
  // Illumise: Weakness ×3 for both Active Pokémon, with Volbeat in play.
  [/^If you have ([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*) in play, apply Weakness for both Active Pokémon as [x×](\d+)\.?$/, (m) => ({ weakTimes: Number(m[2]), when: { inPlay: `name=${m[1]}` } })],
  // Eevee ex: played from the hand onto it, any Pokémon ex that evolves from Eevee.
  [/^This Pokémon can evolve into any Pokémon ex that evolves from ([A-Z][\w'é.-]*) if you play it from your hand onto this Pokémon\. \(This Pokémon can't evolve during your first turn or the turn you play it\.\)$/, (m) => ({ rainbow: m[1] })],
  // Hits back for each Energy of a type on it; in the Active Spot only, or (without those words) wherever it is damaged.
  [new RegExp(`^If this Pokémon (is in the Active Spot and )?is damaged by an attack from your opponent's Pokémon \\(even if this Pokémon is Knocked Out\\), ${COUNTERS} the Attacking Pokémon( for each (${TYPE}) Energy attached to this Pokémon)?\\.$`), (m) => ({ thorns: { n: Number(m[2]) * 10, ...(m[3] ? { per: m[4] } : {}), ...(m[1] ? {} : { any: true }) } })],
  // Turtonator: an Energy off the Attacking Pokémon; Team Rocket's Koffing: a search. Both once the attack is done (engine.js strike).
  [/^If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon \(even if this Pokémon is Knocked Out\), (discard an Energy from the Attacking Pokémon|search your deck for up to (\d+) Pokémon that have "([A-Z][\w'é.-]*)" in their name and put them onto your Bench\. Then, shuffle your deck)\.$/, (m) => ({
    thorns: m[2] ? { steps: [{ op: "search", what: `basic~${m[3]}`, n: Number(m[2]), to: "bench" }] } : { shed: 1 },
  })],
  // Spiritomb, Wishiwashi: one of your Active Pokémon of a kind is damaged, and the Attacking Pokémon takes damage counters.
  [new RegExp(`^If your Active (${TYPE}) Pokémon is damaged by an attack from your opponent's Pokémon \\(even if your Active \\1 Pokémon is Knocked Out\\), ${COUNTERS} the Attacking Pokémon\\.$`), (m) => ({ allyThorns: { what: `pokemon:${m[1]}`, n: Number(m[2]) * 10 } })],
  [new RegExp(`^If your ([A-Z][\\w'é.-]*) or \\1 ex is in the Active Spot and is damaged by an attack from your opponent's Pokémon \\(even if your Pokémon is Knocked Out\\), ${COUNTERS} the Attacking Pokémon\\.$`), (m) => ({ allyThorns: { what: `name=${m[1]}|name=${m[1]} ex`, n: Number(m[2]) * 10 } })],
  // Yveltal: the other Active Pokémon can't be healed (engine.js healRoom).
  [/^Your opponent's Active Pokémon can't be healed\.$/, () => ({ noHealFoe: true })],
  // Garbodor: less damage from their Active Pokémon while it has a Tool attached.
  [new RegExp(`^Attacks used by your opponent's Active Pokémon that has a Pokémon Tool attached do (\\d+) less damage${BEFORE}\\.$`), (m) => ({ foeAura: { who: { active: true, tooled: true }, mod: { plus: -Number(m[1]) } } })],
  // Team Rocket's Articuno: the effects of their attacks kept off some of your Pokémon.
  [/^Prevent all effects of attacks used by your opponent's Pokémon done to your (.+?)\. \(Existing effects are not removed\. Damage is not an effect\.\)$/, (m) => {
    const what = whatOf(m[1]);
    return what && what !== "any" ? { teamNoEffects: what } : null;
  }],
  // Team Rocket's Ampharos: damage counters on what they evolve from their hand.
  [/^Whenever your opponent plays a Pokémon from their hand to evolve 1 of their Pokémon, put (\d+) damage counters on that Pokémon\.$/, (m) => ({ foeEvolve: Number(m[1]) * 10 })],
  // Bastiodon: from the Bench, no damage to your Pokémon from attackers with that little Energy.
  [/^As long as this Pokémon is on your Bench, prevent all damage done to each of your Pokémon by attacks from your opponent's Pokémon that have (\d+) or less Energy attached\.$/, (m) => ({ teamWall: { energyMax: Number(m[1]) }, where: "bench" })],
  [new RegExp(`^All of your Pokémon that have any (${TYPE}) Energy attached take (\\d+) less damage ${FROM_FOE}${AFTER}\\.$`), (m) => ({ aura: { who: { energy: m[1] }, mod: { less: Number(m[2]) } } })],
  [new RegExp(`^(?:All of your|Your) (.+?) take (\\d+) less damage ${FROM_FOE}${AFTER}\\.$`), (m) => {
    const who = whoOf(m[1]);
    return who ? { aura: { who, mod: { less: Number(m[2]) } } } : null;
  }],
  // Bouffalant's Curly Wall: "As long as you have at least 1 other Bouffalant in play, ..." (its own name reads "this Pokémon" here).
  [new RegExp(`^As long as you have at least 1 other this Pokémon in play, all of your (.+?) take (\\d+) less damage ${FROM_FOE}${AFTER}\\.$`), (m) => {
    const who = whoOf(m[1]);
    return who ? { aura: { who, mod: { less: Number(m[2]) } }, term: { twoOf: true } } : null;
  }],
  [new RegExp(`^As long as this Pokémon is on your Bench, all of your (.+?) take (\\d+) less damage ${FROM_FOE}${AFTER}\\.$`), (m) => {
    const who = whoOf(m[1]);
    return who ? { aura: { who, mod: { less: Number(m[2]) } }, where: "bench" } : null;
  }],
  [new RegExp(`^Attacks used by your (.+?) do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => {
    const who = whoOf(m[1]);
    return who ? { aura: { who, mod: { plus: Number(m[2]) } } } : null;
  }],
  [/^All of your Pokémon in play get \+(\d+) HP\.$/, (m) => ({ aura: { who: {}, mod: { hp: Number(m[1]) } } })],
  [new RegExp(`^If this Pokémon has any Energy attached(?: to it)?, it takes (\\d+) less damage from attacks${AFTER}\\.$`), (m) => ({ mod: { less: Number(m[1]) }, when: { energy: "any" } })],
  [/^Your opponent's Active Evolution Pokémon's Retreat Cost is ((?:Colorless)+) more\.$/, (m) => ({ foeAura: { who: { active: true, stage: "evolution" }, mod: { retreat: -colorless(m[1]) } } })],
  // Thick Fat: less damage from attackers of these types.
  [new RegExp(`^This Pokémon takes (\\d+) less damage from attacks from your opponent's (${TYPE}) or (${TYPE}) Pokémon${AFTER}\\.$`), (m) => ({ guardLess: { n: Number(m[1]), types: [m[2], m[3]] } })],
  [/^Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon if that damage is (\d+) or more\.$/, (m) => ({ wall: { min: Number(m[1]), boxes: [], types: [], stage: "" } })],
  // "Prevent all damage from and effects of attacks from your opponent's Tera Pokémon done to this Pokémon."
  [/^Prevent all damage from and effects of attacks (?:from your opponent's (.+?) done to this Pokémon|done to this Pokémon by your opponent's Pokémon that have any (Special) Energy attached)\.$/, (m) => {
    if (m[2]) return { wall: { special: true, boxes: [], types: [], stage: "" }, wallFx: true };
    const wall = wallOf(m[1]);
    return wall ? { wall, wallFx: true } : null;
  }],
  [/^As long as this Pokémon is on your Bench, prevent all damage from and effects of attacks from your opponent's Pokémon done to this Pokémon\.$/, () => ({ benchSafe: "foe", noEffects: true, where: "bench" })],
  [/^Prevent all damage from and effects of attacks from your opponent's Pokémon done to your Benched Pokémon\.$/, () => ({ benchWall: true, benchWard: true })],
  [/^Prevent all damage done to your Benched Pokémon that don't have a Rule Box by attacks from your opponent's Pokémon\.$/, () => ({ benchWall: "noRule" })],
  [/^Damage from attacks used by this Pokémon isn't affected by any effects on your opponent's Active Pokémon\.$/, () => ({ pierce: true })],
  // Numbers that grow: HP for each Energy or each Prize card taken, more damage for each Prize card taken.
  [new RegExp(`^This Pokémon gets \\+(\\d+) HP for each (${TYPE}) Energy attached to it\\.$`), (m) => ({ grow: { hp: Number(m[1]), per: "energy", type: m[2] } })],
  [/^This Pokémon gets \+(\d+) HP for each Prize card your opponent has taken\.$/, (m) => ({ grow: { hp: Number(m[1]), per: "foeTaken" } })],
  [new RegExp(`^If this Pokémon has (\\d+) or more (${TYPE}) Energy attached, it gets \\+(\\d+) HP\\.$`), (m) => ({ grow: { hp: Number(m[3]), per: "energy", type: m[2], min: Number(m[1]) } })],
  [new RegExp(`^Attacks used by this Pokémon do (\\d+) more damage to your opponent's Active Pokémon for each Prize card your opponent has taken${BEFORE}\\.$`), (m) => ({ grow: { plus: Number(m[1]), per: "foeTaken" } })],
  // More damage to some Defending Pokémon only.
  [new RegExp(`^Attacks used by this Pokémon do (\\d+) more damage to your opponent's Active Pokémon that has an Ability${BEFORE}\\.$`), (m) => ({ plusVs: { n: Number(m[1]), foe: "ability", who: null } })],
  [new RegExp(`^Attacks used by your Pokémon do (\\d+) more damage to your opponent's Active Evolution Pokémon${BEFORE}\\.$`), (m) => ({ plusVs: { n: Number(m[1]), foe: "evolution", who: {} } })],
  // Attack costs: Colorless less for each of something, all Colorless (or all Energy) ignored on terms, another cost.
  [/^(?:Attacks used by this Pokémon cost|(.+?) used by this Pokémon costs) (?:1 )?Colorless(?: Energy)? less for each (of your opponent's Benched Pokémon|Kofu card in your discard pile|Prize card your opponent has taken)\.$/, (m) => ({
    cost: { less: 1, per: /Benched/.test(m[2]) ? "foeBench" : /Kofu/.test(m[2]) ? "discard:Kofu" : "foeTaken", ...(m[1] ? { attack: m[1] } : {}) },
  })],
  [/^If (.+?), ignore all (Colorless )?Energy in the costs? of (attacks|.+?) used by this Pokémon\.$/, (m) => {
    const term = condOf(m[1]);
    return term ? { cost: { ignore: m[2] ? "Colorless" : "all", ...(m[3] !== "attacks" ? { attack: m[3] } : {}) }, term } : null;
  }],
  [new RegExp(`^If (.+?), this Pokémon can use the (.+?) attack for (${TYPE})\\.$`), (m) => {
    const term = condOf(m[1]);
    return term ? { cost: { as: [m[3]], attack: m[2] }, term } : null;
  }],
  [/^If you go first, this Pokémon can use attacks during your first turn\.$/, () => ({ firstAttack: true })],
  [/^If your opponent has no (Pokémon ex or Pokémon V) in play, this Pokémon can't attack\.$/, () => ({ attackUnless: { foe: "box=ex|box=V|box=VSTAR|box=VMAX" } })],
  [/^If (.+?), this Pokémon can evolve during your first turn or the turn you play it\.$/, (m) => {
    const term = condOf(m[1]);
    return term ? { early: "any", term } : null;
  }],
  [/^As long as this Pokémon is on your Bench, Benched Stage 2 Pokémon \(both yours and your opponent's\) have no Abilities\.$/, () => ({ lock: { side: "all", bench: true, line: 2 }, where: "bench" })],
  [/^If this Pokémon has a Pokémon Tool attached, your opponent can't play any ACE SPEC cards from their hand\.$/, () => ({ handBar: { ace: true }, when: { tool: true } })],
  [/^Whenever your opponent's Active Pokémon moves to the Bench during their turn, (?:place|put) (\d+) damage counters? on that Pokémon\.$/, (m) => ({ foeSwap: { counters: Number(m[1]) * 10 } })],
  [/^Whenever your opponent's Active Pokémon moves to the Bench during their turn, their new Active Pokémon is now (Confused|Burned|Poisoned|Asleep|Paralyzed)\.$/, (m) => ({ foeSwap: { status: m[1].toLowerCase() } })],
  [/^During Pokémon Checkup, put (\d+) more damage counters on your opponent's (Poisoned|Burned) Pokémon\.$/, (m) => ({ checkupMore: { n: Number(m[1]) * 10, kind: m[2].toLowerCase() } })],
  [/^During Pokémon Checkup, put (\d+) damage counters? on each Pokémon that has an Ability \(both yours and your opponent's\), except any (.+)\.$/, (m) => ({ checkupHurt: { n: Number(m[1]) * 10, ability: true, notName: m[2] } })],
  [/^During Pokémon Checkup, if this Pokémon is in the Active Spot, put (\d+) damage counters? on each of your opponent's (Basic )?Pokémon\.$/, (m) => ({ checkupHurt: { n: Number(m[1]) * 10, foe: true, ...(m[2] ? { stage: "basic" } : {}) }, where: "active" })],
  // Prize cards more or fewer (engine.js prizeShift).
  [/^If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon ex, your opponent can't take any Prize cards for it\.$/, () => ({ prizes: { self: true, none: true, by: "box=ex" } })],
  [/^If this Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon, and if you have any (.+?) in play, your opponent takes 1 fewer Prize card\.$/, (m) => {
    const what = whatOf(m[1]) || (/^[A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*(?: ex)?$/.test(m[1]) ? `name=${m[1]}` : "");
    return what ? { prizes: { self: true, fewer: 1 }, term: { inPlay: what } } : null;
  }],
  [new RegExp(`^If 1 of your (${TYPE}) Pokémon is Knocked Out by damage from an attack from your opponent's Pokémon ex, that player takes 1 fewer Prize card\\.$`), (m) => ({ prizes: { ally: { types: [m[1]] }, fewer: 1, by: "box=ex" } })],
  [/^If your opponent's (Basic )?Pokémon is Knocked Out by damage from an attack used by this Pokémon, take 1 more Prize card\.$/, (m) => ({ prizes: { attacker: true, more: 1, ...(m[1] ? { foe: "basic" } : {}) } })],
  [/^When your opponent's Active Pokémon is Knocked Out, flip a coin\. If heads, take 1 more Prize card\.$/, () => ({ prizes: { flipMore: 1 } })],
  [/^If this Pokémon remains Asleep during Pokémon Checkup, heal all damage from this Pokémon\.$/, () => ({ sleepHeal: true })],
];

/** Texts that stand for as long as the Pokémon is in play. */
const STANDING = [
  [/^Prevent all effects of your opponent's Pokémon's Abilities done to this Pokémon\.$/, () => ({ ward: true })],
  [/^Prevent all effects of your opponent's Pokémon's attacks and Abilities done to this Pokémon\. \(Damage is not an effect\.\)$/, () => ({ noEffects: true, ward: true })],
  [/^Whenever your opponent plays an Item or Supporter card from (?:their|his or her) hand, prevent all effects of that card done to this Pokémon\.$/, () => ({ trainerWard: true })],
  [/^Pokémon in play \(both yours and your opponent's\) lose any Ability that requires the Pokémon using it to Knock Out itself\.$/, () => ({ lock: { side: "all", selfKo: true, kinds: ["Ability"] } })],
  [/^If this Pokémon has a Pokémon Tool card attached to it, each Pokémon in play, in each player's hand, and in each player's discard pile has no Abilities \(except for (.+)\)\.$/, (m) => ({ lock: { side: "all", except: m[1] }, when: { tool: true } })],
  [/^Basic Pokémon V in play \(both yours and your opponent's\) have no Abilities\.$/, () => ({ lock: { side: "all", stage: "basic", boxes: ["V"] } })],
  [/^Whenever your opponent attaches an Energy card from (?:their|his or her) hand to 1 of (?:their|his or her) Pokémon, put (\d+) damage counters? on that Pokémon\.$/, (m) => ({ foeAttach: Number(m[1]) * 10 })],
  [/^If this Pokémon has any Special Energy attached(?: to it)?, it gets \+(\d+) HP\.$/, (m) => ({ mod: { hp: Number(m[1]) }, when: { special: true } })],
  [new RegExp(`^(?:If this Pokémon's remaining HP is (\\d+) or less, its attacks do (\\d+) more damage to your opponent's Active Pokémon|As long as this Pokémon's remaining HP is (\\d+) or less, this Pokémon does (\\d+) more damage to the Defending Pokémon)${BEFORE}\\.$`), (m) => ({ mod: { plus: Number(m[2] || m[4]) }, when: { hpMax: Number(m[1] || m[3]) } })],
  [/^Your Pokémon in play have no Retreat Cost\.$/, () => ({ aura: { who: {}, mod: { retreat: "all" } } })],
  [/^Prevent all damage done to this Pokémon by attacks from your opponent's Pokémon that have (?:any )?Special Energy attached(?: to them)?\.$/, () => ({ wall: { special: true, boxes: [], types: [], stage: "" } })],
  [/^Prevent all damage from attacks done to this Pokémon by your opponent's Pokémon that have an Ability\.$/, () => ({ wall: { ability: true, boxes: [], types: [], stage: "" } })],
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
  [/^At any times? between turns, remove (\d+) damage counters? from this Pokémon\.$/, (m) => ({ mend: Number(m[1]) * 10 })],
  // Armor Fossil's Armor Stone: coins until tails, each heads 10 less of the attack's damage.
  [/^Whenever this Pokémon would be damaged by your opponent's attack, flip a coin until you get tails\. For each heads, reduce that damage by (\d+)\.$/, (m) => ({ soften: Number(m[1]) })],
  // Skull Fossil's Skull Stone.
  [/^During your opponent's turn, if this Pokémon would be Knocked Out by damage from an opponent's attack, flip a coin until you get tails\. For each heads, put (\d+) damage counters? on the Attacking Pokémon\.$/, (m) => ({ ko: { counters: Number(m[1]) * 10, untilTails: true } })],
  [/^As long as this Pokémon is Asleep, prevent all damage done to this Pokémon by attacks\.$/, () => ({ wall: { all: true, boxes: [], types: [], stage: "" }, when: { status: "asleep" } })],
  [/^Whenever you attach an Energy card from your hand to this Pokémon, remove all Special Conditions from it\.$/, () => ({ attachCure: true })],
  [/^Prevent all effects of (?:attacks (?:from|used by) your opponent's Pokémon done to this Pokémon\. \(Damage is not an effect\.\)|your opponent's attacks, except damage, done to this Pokémon\.)$/, () => ({ noEffects: true })],
  [new RegExp(`^(?:This Pokémon takes (\\d+) less damage from (?:your opponent's )?attacks|(?:Any|All) damage done (?:to this Pokémon by attacks|by attacks to this Pokémon) is reduced by (\\d+))${AFTER}\\.$`), (m) => ({ mod: { less: Number(m[1] || m[2]) } })],
  [/^This Pokémon has no Retreat Cost\.$/, () => ({ mod: { retreat: "all" } })],
  [/^If this Pokémon has any Energy attached(?: to it)?, it has no Retreat Cost\.$/, () => ({ mod: { retreat: "all" }, when: { energy: "any" } })],
  [/^This Pokémon can't attack unless you have (\d+) or more (.+?) in play\.$/, (m) => (whatOf(m[2]) ? { attackUnless: { what: whatOf(m[2]), n: Number(m[1]) } } : null)],
  [/^This Pokémon can't use attacks unless you have (\d+) or more cards in your hand\.$/, (m) => ({ attackUnless: { hand: Number(m[1]) } })],
  [new RegExp(`^If this Pokémon has full HP, it takes (\\d+) less damage from (?:your opponent's attacks|attacks from your opponent's Pokémon)${AFTER}\\.$`), (m) => ({ mod: { less: Number(m[1]) }, when: { fullHp: true } })],
  [new RegExp(`^Your Basic Pokémon's attacks do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => ({ aura: { who: { stage: "basic" }, mod: { plus: Number(m[1]) } } })],
  [new RegExp(`^Attacks used by your (${TYPE}) Pokémon do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => ({ aura: { who: { types: [m[1]] }, mod: { plus: Number(m[2]) } } })],
  [new RegExp(`^Attacks used by your ((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => ({ aura: { who: { owner: m[1] }, mod: { plus: Number(m[2]) } } })],
  [new RegExp(`^All of your Pokémon that have "([A-Z][a-zé]+)" in their name take (\\d+) less damage from (?:your opponent's attacks|attacks from your opponent's Pokémon)${AFTER}\\.$`), (m) => ({ aura: { who: { named: m[1] }, mod: { less: Number(m[2]) } } })],
  [/^As long as this Pokémon is on your Bench, your Active Pokémon's Retreat Cost is (\d+) less\.$/, (m) => ({ aura: { who: { active: true }, mod: { retreat: Number(m[1]) } }, where: "bench" })],
  [new RegExp(`^If you have any (.+?) in play, attacks used by this Pokémon do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => (whatOf(m[1]) ? { mod: { plus: Number(m[2]) }, when: { inPlay: whatOf(m[1]) } } : null)],
  [new RegExp(`^If you have the same number of cards in your hand as your opponent, attacks used by this Pokémon do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.?$`), (m) => ({ mod: { plus: Number(m[1]) }, when: { sameHand: true } })],
  [new RegExp(`^If this Pokémon has (\\d+) or more damage counters on it, attacks used by this Pokémon do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => ({ mod: { plus: Number(m[2]) }, when: { countersMin: Number(m[1]) } })],
  [/^If your opponent has any (.+?) in play, this Pokémon has no Retreat Cost\.$/, (m) => (whatOf(m[1]) ? { mod: { retreat: "all" }, when: { foeInPlay: whatOf(m[1]) } } : null)],
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
const CONDS = "(Asleep|Burned|Confused|Paralyzed|Poisoned)";
const LOOK_REST = { "Shuffle the other cards back into your deck": "shuffle", "Shuffle the other cards and put them on the bottom of your deck": "bottom", "Discard the other cards": "discard" };
const isEnergy = (what) => /^(basicEnergy|energy)(:|$)/.test(what) || /^card=.* Energy$/.test(what);
/** Newer wordings of what an Ability does. */
const DOES_MORE = [
  // Palafin's Zero to Hero: the Pokémon named takes over this one's place (as a form change does).
  [/^Search your deck for an? ([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*(?: ex)?) and switch it with this Pokémon\. Any attached cards, damage counters, Special Conditions, turns in play, and any other effects remain on the new Pokémon\. If you switched a Pokémon in this way, put this card into your deck\. Then, shuffle your deck\.$/, (m) => [{ op: "formChange", name: m[1] }]],
  // Ninjask, Silcoon: a Pokémon by name straight onto the Bench (an Evolution card too: the Ability says so).
  [/^Search your deck for an? ([A-Z][\w'é.-]*)(?: or an? ([A-Z][\w'é.-]*))? and put it onto your Bench\. Then, shuffle your deck\.$/, (m) => [{ op: "search", what: [m[1], m[2]].filter(Boolean).map((n) => `name=${n}`).join("|"), n: 1, to: "bench" }]],
  // Pidove: an Unfezant from the deck onto it (past its Stage 1), as the rules for evolving allow.
  [/^Search your deck for an? ([A-Z][\w'é.-]*)(?: or (?:an? )?([A-Z][\w'é.-]*(?: ex)?))? and put it onto this (?:this Pokémon|[A-Z][\w'é.-]*) to evolve it\. Then, shuffle your deck\.$/, (m) => [{ op: "evolveDeck", how: { skip: "any" }, self: true, what: [m[1], m[2]].filter(Boolean).map((n) => `name=${n}`).join("|") }]],
  // Misty's Psyduck: the bottom card of the deck for this Pokémon on top of it.
  [/^Discard the bottom card of your deck\. If you do, discard all cards from this Pokémon and put this Pokémon on top of your deck\.$/, () => [{ op: "selfTop" }]],
  // Latios: Energy from the Bench to the Active Pokémon, any amount.
  [/^Move any amount of Energy from your Benched Pokémon to your Active Pokémon\.$/, () => [{ op: "gather", type: "", to: "active" }]],
  // Farfetch'd: a Pokémon Tool from the deck onto this Pokémon.
  [/^Search your deck for a Pokémon Tool card and attach it to this Pokémon\. Then, shuffle your deck\.$/, () => [{ op: "toolFetch" }]],
  // Ambipom: coins, and for each heads a random card from their hand into their deck.
  [/^Flip (\d+) coins\. For each heads, choose a random card from your opponent's hand\. Your opponent reveals those cards and shuffles them into their deck\.$/, (m) => [{ op: "foeHandToDeck", coins: Number(m[1]) }]],
  // Toxtricity: a Basic Energy onto a Benched Pokémon of a type, and damage counters on it.
  [new RegExp(`^Search your deck for a Basic (${TYPE}) Energy card and attach it to 1 of your Benched (${TYPE}) Pokémon\\. Then, shuffle your deck\\. If you attached Energy to a Pokémon in this way, place (\\d+) damage counters on that Pokémon\\.$`), (m) => [{ op: "fetchEnergy", what: `basicEnergy:${m[1]}`, n: 1, to: "one", where: { to: "bench", whoType: m[2] }, hurt: Number(m[3]) * 10 }]],
  // "Look at the top 6 cards of your deck and attach any number of Basic Energy cards you find there to your Dragon Pokémon in any way you like."
  [new RegExp(`^Look at the top (\\d+) cards of your deck and attach (any number of|an?|up to \\d+) (.+?) you find there to (this Pokémon|your Pokémon in any way you like|your (${TYPE}) Pokémon in any way you like)\\. (Shuffle the other cards back into your deck|Shuffle the other cards and put them on the bottom of your deck|Discard the other cards)\\.$`), (m) => {
    const what = whatOf(m[3]);
    const top = Number(m[1]);
    if (!isEnergy(what)) return null;
    const n = /^any/.test(m[2]) ? top : /^up to/.test(m[2]) ? Number(m[2].slice(6)) : 1;
    return [{ op: "fetchEnergy", what, n, top, to: m[4] === "this Pokémon" ? "self" : "spread", ...(m[5] ? { where: { to: "any", whoType: m[5] } } : {}), rest: LOOK_REST[m[6]] }];
  }],
  [new RegExp(`^Search your deck for (up to \\d+|an?) (.+?) and attach (?:it|them) to (your ((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon in any way you like|1 of your Benched (${TYPE}) Pokémon)\\. Then, shuffle your deck\\.$`), (m) => {
    const what = whatOf(m[2]);
    if (!isEnergy(what)) return null;
    const n = /^up to/.test(m[1]) ? Number(m[1].slice(6)) : 1;
    return [{ op: "fetchEnergy", what, n, to: m[4] ? "spread" : "one", where: m[4] ? { to: "any", who: `name^${m[4]}` } : { to: "bench", whoType: m[5] } }];
  }],
  [new RegExp(`^Search your deck for a Basic (${TYPE}) Energy card, a Basic (${TYPE}) Energy card, or 1 of each and attach them to your (${TYPE}) Pokémon and (${TYPE}) Pokémon in any way you like\\. Then, shuffle your deck\\.$`), (m) => [
    { op: "fetchEnergy", what: `basicEnergy:${m[1]}|basicEnergy:${m[2]}`, n: 2, to: "spread", where: { to: "any", who: `pokemon:${m[3]}|pokemon:${m[4]}` }, rule: { apiece: [`basicEnergy:${m[1]}`, `basicEnergy:${m[2]}`] } },
  ]],
  [new RegExp(`^Attach (up to \\d+|an?) (.+?) from your (hand|discard pile) to (this Pokémon|your (${TYPE}) Pokémon in any way you like|your Pokémon in any way you like|1 of your Pokémon)\\.(?: If you attached Energy to a Pokémon in this way, heal (\\d+) damage from that Pokémon\\.)?$`), (m) => {
    const what = whatOf(m[2]);
    if (!isEnergy(what)) return null;
    const n = /^up to/.test(m[1]) ? Number(m[1].slice(6)) : 1;
    const spread = /any way/.test(m[4]);
    if (m[6] && spread) return null;
    return [{ op: "attachPick", zone: m[3] === "hand" ? "hand" : "discard", what, to: m[4] === "this Pokémon" ? "self" : "any", whoType: m[5] || "", n, ...(/^up to/.test(m[1]) ? { upTo: true } : {}), ...(spread ? { spread: true } : {}), ...(m[6] ? { heal: Number(m[6]) } : {}) }];
  }],
  [new RegExp(`^Attach a Basic (${TYPE}) Energy card, a Basic (${TYPE}) Energy card, or 1 of each from your hand to your (Pokémon|[A-Z][\\w'é.-]*(?: ex)? and [A-Z][\\w'é.-]*(?: ex)?) in any way you like\\.$`), (m) => [
    { op: "attachPick", zone: "hand", what: `basicEnergy:${m[1]}|basicEnergy:${m[2]}`, to: "any", n: 2, spread: true, rule: { apiece: [`basicEnergy:${m[1]}`, `basicEnergy:${m[2]}`] }, ...(m[3] !== "Pokémon" ? { who: m[3].split(" and ").map((x) => `name=${x}`).join("|") } : {}) },
  ]],
  [/^Choose (\d+) of your opponent's (Benched )?Pokémon and put (\d+) damage counters? on each of them\.$/, (m) => [{ op: "counters", n: Number(m[3]) * 10, count: Number(m[1]), ...(m[2] ? { where: "bench" } : {}) }]],
  [new RegExp(`^Heal all damage from your Active (${TYPE}) Pokémon\\. If you healed any damage in this way, discard all Energy from that Pokémon\\.$`), (m) => [{ op: "heal", n: 9990, to: "active", whoType: m[1], strip: true }]],
  [/^Heal all damage from each of your Evolution Pokémon\. If you healed any damage in this way, discard all Energy from those Pokémon\.$/, () => [{ op: "heal", n: 9990, to: "all", who: "evolution", strip: true }]],
  [/^Heal (\d+) damage from your Active Pokémon and have it recover from a Special Condition\.$/, (m) => [{ op: "heal", n: Number(m[1]), to: "active" }, { op: "cureOne" }]],
  [/^Discard the top (card|\d+ cards) of your opponent's deck\.$/, (m) => [{ op: "foeMill", n: m[1] === "card" ? 1 : Number(m[1].split(" ")[0]) }]],
  [/^Discard a Stadium in play\.$/, () => [{ op: "dropStadium" }]],
  [/^Have each player draw a card\.$/, () => [{ op: "draw", n: 1 }, { op: "foeDraw", n: 1 }]],
  [/^Switch your Active Pokémon with 1 of your Benched Pokémon\. If you do, switch out your opponent's Active Pokémon to the Bench\. \(Your opponent chooses the new Active Pokémon\.\)$/, () => [{ op: "switch", need: true }, { op: "foeSwitch" }]],
  [new RegExp(`^Switch 1 of your Benched (${TYPE}) Pokémon, except any (.+?), with your Active Pokémon\\. If you do, the new Active Pokémon is now ${CONDS}\\.$`), (m) => [{ op: "switch", benchWho: `pokemon:${m[1]}&&not:name=${m[2]}`, need: true }, { op: "selfCondition", kinds: [m[3].toLowerCase()] }]],
  [new RegExp(`^Switch in 1 of your opponent's Benched Pokémon to the Active Spot, and the new Active Pokémon is now ${CONDS}\\.$`), (m) => [{ op: "gust", need: true }, { op: "condition", kinds: [m[1].toLowerCase()] }]],
  [/^Switch in 1 of your opponent's Benched Pokémon that has (\d+) HP or less remaining to the Active Spot\.$/, (m) => [{ op: "gust", hpMax: Number(m[1]) }]],
  [/^Choose Burned, Confused, or Poisoned\. Your opponent's Active Pokémon is now affected by that Special Condition\.$/, () => [
    { op: "choice", prompt: "Choose the Special Condition.", options: ["burned", "confused", "poisoned"].map((kind) => ({ label: kind[0].toUpperCase() + kind.slice(1), steps: [{ op: "condition", kinds: [kind] }] })) },
  ]],
  [/^Look at the top (\d+) cards of your deck, reveal (an?) (.+?) you find there, and put it into your hand\. (Shuffle the other cards back into your deck|Shuffle the other cards and put them on the bottom of your deck)\.$/, (m) => {
    const what = whatOf(`${m[2]} ${m[3]}`);
    return what && what !== "any" ? [{ op: "search", what, n: 1, top: Number(m[1]), ...(/bottom/.test(m[4]) ? { rest: "bottom" } : {}) }] : null;
  }],
  [/^Put (an?) (.+?) from your discard pile onto your Bench\.$/, (m) => {
    const what = whatOf(`${m[1]} ${m[2]}`);
    return what && what.split("|").every((w) => /^basic(?=$|[:@!&])/.test(w)) ? [{ op: "recover", what, n: 1, to: "bench" }] : null;
  }],
  [/^Move (\d+) damage counters? from 1 of your ((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon to another of your Pokémon\.$/, (m) => [{ op: "moveCounters", n: Number(m[1]) * 10, to: "mine", fromWho: `name^${m[2]}` }]],
  [/^Move an Energy from 1 of your other Pokémon to this Pokémon\.$/, () => [{ op: "moveEnergy", type: "", basic: false, from: "others", to: "self" }]],
  [/^Search your deck for up to (\d+) (.+?) and discard them\. Then, shuffle your deck\.$/, (m) => {
    const what = whatOf(m[2]);
    return what && what !== "any" ? [{ op: "searchMill", n: Number(m[1]), what }] : null;
  }],
  [/^Search your deck for a card\. Shuffle your deck, then put that card on top of it\.$/, () => [{ op: "search", what: "any", n: 1, to: "top" }]],
  [/^Look at the top card of your deck\. You may discard that card\.$/, () => [{ op: "topMill", n: 1 }]],
  [/^Shuffle (?:it|this Pokémon) and all attached cards into your deck\.$/, () => [{ op: "selfIn" }]],
  [/^Draw (\d+) cards\. If you drew any cards in this way, shuffle this Pokémon and all attached cards into your deck\.$/, (m) => [{ op: "draw", n: Number(m[1]), need: true }, { op: "selfIn" }]],
  [new RegExp(`^Put (\\d+) damage counters on this Pokémon\\. If you do, during this turn, attacks used by this Pokémon do (\\d+) more damage to your opponent's Active Pokémon${BEFORE}\\.$`), (m) => [{ op: "hurtSelf", n: Number(m[1]) * 10 }, { op: "boost", n: Number(m[2]), self: true }]],
  [/^(?:Have your opponent reveal their hand and you put any number of Basic Pokémon you find there onto their Bench|Your opponent reveals their hand, and you put (an?) (.+?) that you find there onto your opponent's Bench)\.$/, (m) => {
    if (!m[1]) return [{ op: "foeBasicsOut" }];
    const what = whatOf(`${m[1]} ${m[2]}`);
    return what && what.split("|").every((w) => /^basic(?=$|[:@!&])/.test(w)) ? [{ op: "foeBasicsOut", what, n: 1 }] : null;
  }],
  [/^Devolve 1 of your opponent's evolved Pokémon by putting the highest Stage Evolution card on it into your opponent's hand\.$/, () => [{ op: "foeDevolve" }]],
];

const DOES = [
  ...DOES_MORE,
  [new RegExp(`^Move any amount of (?:(${TYPE}) )?Energy from your other Pokémon to (?:it|this Pokémon)\\.$`), (m) => [{ op: "gather", type: m[1] || "" }]],
  [/^Switch in 1 of your opponent's Benched (Basic )?Pokémon to the Active Spot\.$/, (m) => [{ op: "gust", stage: m[1] ? "basic" : "" }]],
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
  [/^Discard an Energy from your opponent's Active Pokémon\.$/, () => [{ op: "hammer", active: true }]],
  [/^Put an Energy attached to your opponent's Active Pokémon into their hand\.$/, () => [{ op: "hammerActive" }]],
  [/^Discard a random card from your opponent's hand\.$/, () => [{ op: "foeDiscardRandom", n: 1 }]],
  [/^Each player draws a card\.$/, () => [{ op: "draw", n: 1 }, { op: "foeDraw", n: 1 }]],
  [/^Have your opponent shuffle their hand into their deck and draw (\d+) cards\.$/, (m) => [{ op: "foeShuffle" }, { op: "foeDraw", n: Number(m[1]) }]],
  [/^Heal all damage from 1 of your Pokémon\.$/, () => [{ op: "heal", n: 9999 }]],
  [/^Switch a card from your hand with the top card of your deck\.$/, () => [{ op: "swapTop" }]],
  [/^Draw a card\. If you do, you may put a card from your hand on the bottom of your deck\.$/, () => [{ op: "draw", n: 1, need: true }, { op: "stash", n: 1, at: "bottom", upTo: true }]],
  [/^Switch (?:it|this Pokémon) with your Active Pokémon\. If you do, you may move any amount of Energy from your other Pokémon to this Pokémon\.$/, () => [{ op: "switchSelf", need: true }, { op: "gather", type: "" }]],
  // "to 1 of your Iono's Pokémon", "to 1 of your Benched Ethan's Pokémon", "to your Active Larry's Pokémon".
  [new RegExp(`^Attach (an?|up to (\\d+)) (Basic (${TYPE}) Energy cards?|Energy card) from your hand to (1 of your|1 of your Benched|your Active) ((?:Team Rocket|[A-Z][a-zé]*)'s) Pokémon\\.$`), (m) => [
    { op: "attachPick", zone: "hand", what: m[4] ? `basicEnergy:${m[4]}` : "energy", to: /Benched/.test(m[5]) ? "bench" : /Active/.test(m[5]) ? "active" : "any", who: `name^${m[6]}`, n: m[2] ? Number(m[2]) : 1, ...(m[2] ? { upTo: true } : {}) },
  ]],
  // Old Pokémon Powers that do damage: to the Active Pokémon, with Weakness and Resistance, but not an attack.
  [/^[Dd]o (\d+) damage to your opponent's Active Pokémon\. \(Apply Weakness and Resistance\.\)$/, (m) => [{ op: "zap", n: Number(m[1]) }]],
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
    const got = m && build(m);
    if (got) return got;
  }
  return compileTrainer(text);
}

const PRICE = /^You must (discard|put) (.+?) in order to use this (?:Ability|Poké-Power)\. /;
const INLINE_PRICE = /^((?:Once|As often as you like) during your turn(?: \(before your attack\))?, (?:if this Pokémon is (?:in the Active Spot|your Active Pokémon|on your Bench), )?)you may (discard) (an? .+? from your hand) in order to use this (?:Ability|Poké-Power)\. (.+)$/;
/** "discard a Basic Fire Energy card from your hand", "discard a Basic Lightning Energy from this Pokémon", "put a card from your hand on the bottom of your deck" -> the steps that pay it, or null. */
function priceOf(verb, words) {
  let m = words.match(/^(an?|\d+) (.+?) from your hand$/);
  if (verb === "discard" && m) {
    const n = many(m[1]);
    if (/^cards?$/.test(m[2])) return [{ op: "cost", n, spare: 0 }];
    const named = m[2].match(/^([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*) cards?$/);
    const what = whatOf(`${m[1]} ${m[2]}`) || (named && !/^(Basic|Energy|Pokémon|Item|Supporter|Trainer)\b/.test(named[1]) && !/ (Energy|Pokémon)$/.test(named[1]) ? `trainer=${named[1]}` : "");
    return what && what !== "any" ? [{ op: "cost", n, what, spare: 0 }] : null;
  }
  m = words.match(new RegExp(`^(an?) (Basic )?(?:(${TYPE}) )?Energy(?: card)? from this Pokémon$`));
  if (verb === "discard" && m) return [{ op: "selfShed", type: m[3] || "", basic: Boolean(m[2]) }];
  if (verb === "put" && /^a card from your hand on the bottom of your deck$/.test(words)) return [{ op: "stash", n: 1, at: "bottom", need: true }];
  return null;
}
const USE = /^(?:If this Pokémon is your Active Pokémon, )?(Once|As often as you like|During your turn)(?: during your turn)?(?: \(before your attack\))?, (?:if this Pokémon is (in the Active Spot|your Active Pokémon|on your Bench), )?(?:you may )?(.+)$/;
const ACTIVE_FIRST = /^If this Pokémon is your Active Pokémon, /;
const ENTER = /^(?:Once during your turn, )?[Ww]hen you play this Pokémon from your hand (onto your Bench|to evolve 1 of your Pokémon)(?: during your turn)?, (?:if (.+?), )?you may (.+)$/;

const SYMBOL = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal", Y: "Fairy", N: "Dragon", C: "Colorless" };
/**
 * One line of an Ability's text, as the wordings below read it: Energy symbols written out ("{L}",
 * "[Water]"), "Pokemon" with its accent, and the misprints some card sources carry.
 */
function tidyAbility(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\{([GRWLPFDMYNC])\}/g, (_, k) => SYMBOL[k])
    .replace(new RegExp(`\\[(${TYPE})\\]`, "g"), "$1")
    .replace(/\bPokemon\b/g, "Pokémon")
    .replace(/\+(\d+)HP\b/g, "+$1 HP")
    .replace(/\bKnocket Out\b/g, "Knocked Out")
    .replace(/\bdiscord pile\b/g, "discard pile")
    .replace(/^Once during your turn you may /, "Once during your turn, you may ")
    .replace(/ \(Pokémon ex, Pokémon V, etc\. have Rule Boxes\.\)$/, "")
    .replace(/ If you attached Energy to a Pokémon this way, /, " If you attached Energy to a Pokémon in this way, ")
    .trim()
    // A print that lost its last full stop.
    .replace(/([a-z])$/, "$1.");
}

export function compileAbility(ability, cardName = "") {
  const got = readAbility(ability, cardName, true);
  // A text that names its own card among others ("If you have Tornadus, Thundurus, Landorus, and Enamorus in play") is
  // read again with the names left as they are.
  if (got || !cardName || !tidyAbility(ability?.text).includes(cardName)) return got;
  return readAbility(ability, cardName, false);
}

function readAbility(ability, cardName, named) {
  const kind = ability?.type || "Ability";
  let text = tidyAbility(ability?.text);
  if (!text) return null;
  // Older cards name themselves where newer ones say "this Pokémon".
  if (cardName && named) text = text.split(cardName).join("this Pokémon");
  text = text.replace(/^this Pokémon\b/, "This Pokémon");
  let calm = false, vstar = false, ends = false, selfKo = false, single = false, singleTag = "";
  text = text
    .replace(/ This power can't be used if this Pokémon is affected by a Special Condition\./, () => ((calm = true), ""))
    .replace(/ This power can't be used if this Pokémon is Asleep, Confused, or Paralyzed\./, "")
    .replace(/ \(This doesn't use up your 1 Energy card attachment for the turn\.\)/, "")
    .replace(/ \(You can't use more than 1 VSTAR Power in a game\.\)/, () => ((vstar = true), ""))
    .replace(/ If you use this (?:Ability|Poké-Power|power), your turn ends\./, () => ((ends = true), ""))
    .replace(/ Either way, this ends your turn\./, () => ((ends = true), ""))
    .replace(/ (?:If you use this (?:Ability|Poké-Power)|If you searched your deck in this way), this Pokémon is Knocked Out\./, () => ((selfKo = true), ""))
    .replace(/ You can't use more than 1 Ability that has "(.+?)" in its name each turn\./, (_, tag) => ((singleTag = tag), ""))
    .replace(/ You can't use more than 1 .+? (?:Ability|Poké-Power)(?: each turn| during your turn)\./, () => ((single = true), ""));
  // "The effect of Tundra Wall doesn't stack": two of these Pokémon in play give it once (engine.js toolOf, by the Ability's name).
  let noStack = false;
  text = text.replace(/ The effect of (?:.+?) doesn't stack\.$/, () => ((noStack = true), ""));
  const base = { name: ability.name || kind, kind, text: String(ability.text || "").replace(/\s+/g, " ").trim() };
  // Only what toolOf and the Prize count read is kept to one; anything else that says so waits.
  const stacked = (got) => (!noStack ? got : got && (got.aura || got.foeAura || got.prizes || got.foeEvolve || got.growth) ? { ...got, noStack } : null);

  const front = text.match(FRONT_FIRST);
  if (front) {
    for (const [pattern, build] of FRONT) {
      const m = front[1].match(pattern);
      const got = m && build(m);
      if (got) return stacked({ ...base, ...got, where: got.where || "active" });
    }
  }

  // The newer wordings first; one whose words it can't name lets the older ones try.
  for (const [pattern, build] of STANDING_MORE) {
    const m = text.match(pattern);
    const got = m && stacked(build(m));
    if (!got) continue;
    if (got.term?.twoOf) {
      if (!cardName) continue;
      got.term = { nameCount: { name: cardName, n: 2 } };
    }
    return { ...base, ...got };
  }
  for (const [pattern, build] of STANDING) {
    const m = text.match(pattern);
    if (!m) continue;
    const got = stacked(build(m));
    return got ? { ...base, ...got } : null;
  }
  if (noStack) return null;

  const ko = text.match(KO);
  if (ko) {
    for (const [pattern, build] of KO_DOES) {
      const m = ko[2].match(pattern);
      if (m) return { ...base, ko: { ...build(m), ...(ko[1] ? { active: true } : {}) } };
    }
    return null;
  }

  // "Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may ..."
  const rise = !ends && !selfKo && !vstar && text.match(/^Once during your turn, when this Pokémon moves from your Bench to the Active Spot, you may (.+)$/);
  if (rise) {
    const steps = stepsOf(rise[1], cardName);
    return steps ? { ...base, rise: { steps } } : null;
  }
  // Latios: "Once during your turn, when your Mega Latias ex moves from your Bench to the Active Spot, you may use this Ability."
  const allyRise = !ends && !selfKo && !vstar && !singleTag && text.match(/^Once during your turn, when your ([A-Z][\w'é.-]*(?: [A-Z][\w'é.-]*)*(?: ex)?) moves from your Bench to the Active Spot, you may (.+)$/);
  if (allyRise) {
    const steps = stepsOf(allyRise[2], cardName);
    return steps ? { ...base, allyRise: { steps, name: allyRise[1] } } : null;
  }
  // "Once during your turn, when this Pokémon moves from the Active Spot to your Bench, you may ..." (engine.js benchedFrom).
  const fall = !ends && !selfKo && !vstar && !singleTag && text.match(/^Once during your turn, when this Pokémon moves from the Active Spot to (?:your|the) Bench, you may (.+)$/);
  if (fall) {
    const steps = stepsOf(fall[1], cardName);
    return steps ? { ...base, fall: { steps } } : null;
  }
  // Flygon: as it evolves from the hand, and also as it is Knocked Out in the Active Spot by their attack.
  const twice = !ends && !selfKo && !vstar && !singleTag && text.match(/^Once during your turn, when you play this Pokémon from your hand (onto your Bench|to evolve 1 of your Pokémon), you may use this Ability\. You may also use this Ability if this Pokémon (is in the Active Spot and )?is Knocked Out by damage from an attack from your opponent's Pokémon\. (.+)$/);
  if (twice) {
    const steps = stepsOf(twice[3], cardName);
    return steps ? { ...base, enter: { steps, how: /Bench/.test(twice[1]) ? "bench" : "evolve" }, ko: { steps, ...(twice[2] ? { active: true } : {}) } } : null;
  }

  // Terms on a use: the first turn only, after a Knock Out last turn, with a Stadium in play, late in the game.
  const need = {};
  text = text
    .replace(/^Once during your first turn\b/, () => ((need.first = true), "Once during your turn"))
    .replace(/^(Once during your turn(?: \(before your attack\))?, )if (any of your Pokémon were Knocked Out during your opponent's last turn|a Stadium is in play|your opponent has (\d+) or fewer Prize cards remaining), /, (_, head, what, n) => {
      if (/Knocked Out/.test(what)) need.lost = true;
      else if (/Stadium/.test(what)) need.stadium = true;
      else need.foePrizes = Number(n);
      return head;
    })
    // Thwackey: "if your Active Pokémon has the Festival Lead Ability".
    .replace(/^(Once during your turn(?: \(before your attack\))?, )if your Active Pokémon has the (.+?) Ability, /, (_, head, name) => ((need.activeAbility = name), head));

  // Other terms, as a Trainer says them ("if this Pokémon has any Grass Energy attached", "if you have any Tera Pokémon in play").
  let term = null;
  text = text.replace(/^((?:Once|As often as you like) during your turn(?: \(before your attack\))?, )(if this Pokémon is (?:in the Active Spot|on your Bench), and )?if (.+?), you may /, (all, head, spot, words) => {
    term = condOf(words);
    if (!term) return all;
    return `${head}${spot ? spot.replace(/, and $/, ", ") : ""}you may `;
  });

  // The price of a use: cards from the hand (of a kind), an Energy from this Pokémon, a card to the bottom of the deck.
  let pay = [];
  const price = text.match(PRICE);
  if (price) {
    pay = priceOf(price[1], price[2]);
    if (!pay) return null;
    text = text.slice(price[0].length);
  }
  const inline = !price && text.match(INLINE_PRICE);
  if (inline) {
    pay = priceOf(inline[2], inline[3]);
    if (!pay) return null;
    text = `${inline[1]}you may ${inline[4]}`;
  }
  const cost = pay.length;
  let m = text.match(USE);
  // "During your turn, you may" is a VSTAR Power's wording: once a game is the only limit then.
  if (m && (m[1] !== "During your turn" || vstar)) {
    // A wording that starts the same way but isn't read here may still be a "when you play" one below.
    const steps = stepsOf(m[3], cardName);
    const where = ACTIVE_FIRST.test(text) ? "active" : !m[2] ? "" : /Bench/.test(m[2]) ? "bench" : "active";
    const flags = { ...(calm ? { calm } : {}), ...(vstar ? { vstar } : {}), ...(ends ? { ends } : {}), ...(selfKo ? { selfKo } : {}), ...(Object.keys(need).length ? { need } : {}) };
    if (steps) return { ...base, use: { steps: [...(term ? [{ op: "only", when: term }] : []), ...pay, ...steps], where, often: m[1] === "As often as you like", single, ...(singleTag ? { singleTag } : {}), ...flags } };
  }
  m = !cost && !ends && !selfKo && !vstar && !term && !Object.keys(need).length && text.match(ENTER);
  if (m) {
    const term = m[2] ? condOf(m[2]) : null;
    if (m[2] && !term) return null;
    const steps = stepsOf(m[3], cardName);
    return steps ? { ...base, enter: { steps: term ? [{ op: "only", when: term }, ...steps] : steps, how: /Bench/.test(m[1]) ? "bench" : "evolve", ...(singleTag ? { singleTag } : {}) } } : null;
  }
  return null;
}
