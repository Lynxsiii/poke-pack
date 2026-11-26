/**
 * Attack text, turned into steps the engine can run.
 *
 * A card's text is read once (compileAttack, called by js/tcg/cards.js) into a
 * short list of steps. Each step names an op from OPS below. Text that no
 * pattern reads fully compiles to null: the attack then does its printed
 * damage and the screen says the text isn't live yet.
 *
 * Growing this is the road to full card effects (docs/tcg-plan.md, phase 2):
 * add an op here, add the wording that maps to it in PATTERNS, add a case to
 * scripts/test-tcg.mjs. `node scripts/test-tcg.mjs --coverage` prints how many
 * of the site's attacks are read, and the commonest wordings that are not.
 *
 * A step is { op, when, ...args }. `when` is "before" (it can change or cancel
 * the damage) or "after" (it runs once the damage has landed).
 *
 * ctx: { state, defs, events, player, slot (the attacker), target (the other Active), hit: { damage, cancelled } }
 */

import { addCondition, flip, other } from "./engine.js";

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const count = (word) => WORDS[String(word).toLowerCase()] || Number(word) || 0;

function flips(ctx, n) {
  const results = Array.from({ length: n }, () => flip(ctx.state));
  ctx.events.push({ t: "flip", p: ctx.player, results });
  return results;
}

export const OPS = {
  /** Flip a coin: heads adds damage. */
  flipBonus(ctx, { n }) {
    if (flips(ctx, 1)[0]) ctx.hit.damage += n;
  },
  /** Flip a coin: tails and the attack does nothing. */
  flipOrNothing(ctx) {
    if (!flips(ctx, 1)[0]) {
      ctx.hit.cancelled = true;
      ctx.events.push({ t: "miss", p: ctx.player });
    }
  },
  /** Flip some coins: damage for each heads. */
  flipTimes(ctx, { coins, n }) {
    ctx.hit.damage = flips(ctx, coins).filter(Boolean).length * n;
  },
  healSelf(ctx, { n }) {
    const healed = Math.min(n, ctx.slot.damage);
    if (!healed) return;
    ctx.slot.damage -= healed;
    ctx.events.push({ t: "heal", p: ctx.player, spot: -1, n: healed });
  },
  /** The damage skips Weakness, Resistance, or both. */
  typing(ctx, { noWeakness = false, noResistance = false }) {
    if (noWeakness) ctx.hit.noWeakness = true;
    if (noResistance) ctx.hit.noResistance = true;
  },
  /** Flip a coin and run one list of steps or the other. */
  flip(ctx, { heads = [], tails = [] }) {
    runSteps(flips(ctx, 1)[0] ? heads : tails, ctx);
  },
  /** A Special Condition on the other Active Pokémon, or on the attacker itself. */
  condition(ctx, { kind, self = false }) {
    const slot = self ? ctx.slot : ctx.state.players[other(ctx.player)].active;
    const p = self ? ctx.player : other(ctx.player);
    if (addCondition(ctx.state, slot, kind)) ctx.events.push({ t: "condition", p, kind });
  },
  /** The attacker hurts itself. No Weakness or Resistance: it is not an attack on it. */
  selfDamage(ctx, { n }) {
    ctx.slot.damage += n;
    ctx.events.push({ t: "damage", p: ctx.player, spot: -1, n, self: true });
  },
  draw(ctx, { n }) {
    const side = ctx.state.players[ctx.player];
    const drawn = side.deck.splice(0, n);
    if (!drawn.length) return;
    side.hand.push(...drawn);
    ctx.events.push({ t: "draw", p: ctx.player, uids: drawn });
  },
  /** Discard Energy from the attacker: of one type when the card names it, any otherwise. */
  discardEnergy(ctx, { n, type }) {
    const { state, defs, slot, player } = ctx;
    const gone = [];
    for (let i = slot.energy.length - 1; i >= 0 && gone.length < n; i -= 1) {
      const provides = defs(state.cards[slot.energy[i]]).provides || [];
      if (type && !provides.includes(type)) continue;
      gone.push(...slot.energy.splice(i, 1));
    }
    if (!gone.length) return;
    state.players[player].discard.push(...gone);
    ctx.events.push({ t: "discard-energy", p: player, spot: -1, uids: gone });
  },
};

const N = "(\\d+|an?|one|two|three|four|five|six)";
const TYPE = "(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy)";

const COND = "(Asleep|Burned|Confused|Paralyzed|Poisoned)";
const FOE = "(?:the Defending Pokémon|your opponent's Active Pokémon)";
const cond = (kind, self = false) => ({ op: "condition", when: "after", kind: kind.toLowerCase(), ...(self ? { self } : {}) });

/** [wording, steps]. A text compiles only when its sentences are all read. */
const PATTERNS = [
  [new RegExp(`^${FOE} is now ${COND}\\.$`, "i"), (m) => [cond(m[1])]],
  [new RegExp(`^${FOE} is now ${COND} and ${COND}\\.$`, "i"), (m) => [cond(m[1]), cond(m[2])]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])] }]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}\\. If tails, (?:the Defending Pokémon|it) is now ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])], tails: [cond(m[2])] }]],
  [new RegExp(`^Flip a coin\\. If heads, ${FOE} is now ${COND}; if tails, (?:the Defending Pokémon|it) is now ${COND}\\.$`, "i"), (m) => [{ op: "flip", when: "after", heads: [cond(m[1])], tails: [cond(m[2])] }]],
  [/^This attack's damage isn't affected by Resistance\.$/, () => [{ op: "typing", when: "before", noResistance: true }]],
  [/^This attack's damage isn't affected by Weakness\.$/, () => [{ op: "typing", when: "before", noWeakness: true }]],
  [/^This attack's damage isn't affected by Weakness or Resistance\.$/, () => [{ op: "typing", when: "before", noWeakness: true, noResistance: true }]],
  [/^Don't apply (Weakness|Resistance|Weakness and Resistance)(?: for this attack)?\.$/, (m) => [{ op: "typing", when: "before", noWeakness: /Weak/.test(m[1]), noResistance: /Resist/.test(m[1]) }]],
  [new RegExp(`^This Pokémon is now ${COND}\\.$`), (m) => [cond(m[1], true)]],
  [new RegExp(`^Flip a coin\\. If heads, this attack does (\\d+) more damage\\.$`), (m) => [{ op: "flipBonus", when: "before", n: Number(m[1]) }]],
  [new RegExp(`^Flip a coin\\. If heads, this attack does \\d+ damage plus (\\d+) more damage(?:; if tails, this attack does \\d+ damage)?\\.$`), (m) => [{ op: "flipBonus", when: "before", n: Number(m[1]) }]],
  [new RegExp(`^Flip a coin\\. If tails, this attack does nothing\\.$`), () => [{ op: "flipOrNothing", when: "before" }]],
  [new RegExp(`^Flip ${N} coins?\\. This attack does (\\d+) damage (?:times the number of heads|for each heads)\\.$`, "i"), (m) => [{ op: "flipTimes", when: "before", coins: count(m[1]), n: Number(m[2]) }]],
  [new RegExp(`^Heal (\\d+) damage from this Pokémon\\.$`), (m) => [{ op: "healSelf", when: "after", n: Number(m[1]) }]],
  [new RegExp(`^Discard ${N} (?:${TYPE} )?Energy(?: cards?)? (?:from|attached to) this Pokémon\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "" }]],
  [new RegExp(`^Draw ${N} cards?\\.$`, "i"), (m) => [{ op: "draw", when: "after", n: count(m[1]) }]],
  [new RegExp(`^(?:(?!\\. ).)+? (?:also )?does (\\d+) damage to itself\\.$`), (m) => [{ op: "selfDamage", when: "after", n: Number(m[1]) }]],
  // The old wording names the Pokémon: "Discard 2 Energy cards attached to Charizard in order to use this attack."
  [new RegExp(`^Discard ${N} (?:${TYPE} )?Energy cards? attached to .+ in order to use this attack\\.$`, "i"), (m) => [{ op: "discardEnergy", when: "after", n: count(m[1]), type: m[2] || "" }]],
];

function compileOne(clean) {
  for (const [pattern, build] of PATTERNS) {
    const m = clean.match(pattern);
    if (m) return build(m);
  }
  return null;
}

/** The steps of an attack's text, [] when it has none, null when it can't be read yet. */
export function compileAttack(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const whole = compileOne(clean);
  if (whole) return whole;
  // Several effects in one text: read it sentence by sentence, joining the ones that belong
  // together ("Flip a coin. If heads, ..."). Every sentence must be read, or none is.
  const sentences = clean.match(/[^.]+\.(?:\)|")?(?= |$)/g)?.map((part) => part.trim());
  if (!sentences || sentences.join(" ") !== clean || sentences.length < 2) return null;
  const steps = [];
  for (let i = 0; i < sentences.length; ) {
    let took = 0;
    for (let n = Math.min(3, sentences.length - i); n >= 1 && !took; n -= 1) {
      const part = compileOne(sentences.slice(i, i + n).join(" "));
      if (part) {
        steps.push(...part);
        took = n;
      }
    }
    if (!took) return null;
    i += took;
  }
  return steps;
}

function runSteps(steps, ctx) {
  for (const step of steps) OPS[step.op]?.(ctx, step);
}

export function runAttackEffects(when, attack, ctx) {
  runSteps((attack.fx || []).filter((step) => step.when === when), ctx);
}
