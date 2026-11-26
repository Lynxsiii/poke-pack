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

import { flip } from "./engine.js";

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

/** [wording, steps]. A text compiles only when its sentences are all read. */
const PATTERNS = [
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

/** The steps of an attack's text, [] when it has none, null when it can't be read yet. */
export function compileAttack(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  for (const [pattern, build] of PATTERNS) {
    const m = clean.match(pattern);
    if (m) return build(m);
  }
  return null;
}

export function runAttackEffects(when, attack, ctx) {
  for (const step of attack.fx || []) {
    if (step.when !== when) continue;
    OPS[step.op]?.(ctx, step);
  }
}
