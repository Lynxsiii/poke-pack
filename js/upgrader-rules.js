/* Upgrader rules that the Worker enforces and the page describes (migration 0028, worker/upgrader.js). Pure functions only: the
   browser and the Worker both import this file. Values are whole cents; chances are millionths (1_000_000 = certain).

   You put up cards and/or slabs (the stake) and pick a target worth more. One roll decides it:
     chance = min(maxChance, floor(stake * (1_000_000 - edge) / target)),  won = roll < chance, roll in [0, 1_000_000).
   So the win chance is stake / target x 0.95, capped at 80%, and the expected value of any upgrade is at most 95% of the
   stake whatever the target. The migration's trigger hard-codes the same numbers (950000, 800000, the 10 slabs).

   Targets: a card target must have a real market price (`typeof card.market === "number" && card.market > 0`; the Worker refuses a
   card priced only by the rarity fallback SELL_VALUE with 400 "That card has no market price to upgrade to."). A page building its
   list of targets applies the same filter (`hasMarketPrice`, below). Stakes may include fallback-priced cards: they sell at the
   fallback either way. A sealed target must be a cartEligible shop offer.

   A card target may also be a graded slab: any grade 1 to 10 of any priced card, or a Black Label (a 10, only ever a 10). A win
   mints that slab for the player. It is valued by `slabTargetValue`: what the slab sells for (gradedValue), but never under the
   card's raw price, because a slab can be cracked back into the raw card (a grade 1 slab target of a $100 card must not be a
   $30 way to win a $100 card). The odds formula is unchanged. */
import { ALL_SETS } from './catalog.js';
import { energySet, gradedValueOf } from './grading-rules.js';

/** True when a card has a real market price, the only kind of card that may be an upgrade target. */
export const hasMarketPrice = card => typeof card?.market === 'number' && card.market > 0;

export const UPGRADER_RULES = {
  minCents: 10,           // a stake needs at least 0.10 coins of cards
  maxCards: 100,          // different cards in one stake
  maxCopies: 100000,      // cards in one stake, counting copies (effectively unbounded: there is no coin ceiling)
  maxQty: 9999,           // copies of one card in a stake
  maxSlabs: 10,           // graded slabs in one stake
  edgeMillionths: 50000,  // 5% house edge
  maxChance: 800000,      // 80%
  minChance: 1,           // under one in a million is refused
};

/** Win chance in millionths for a stake against a target (both whole cents); 0 when the target is not worth more. */
export function upgradeChance(stakeCents, targetCents) {
  const stake = Math.round(Number(stakeCents)); const target = Math.round(Number(targetCents));
  if (!(stake > 0) || !(target > stake) || !Number.isFinite(target)) return 0;
  // BigInt: a stake can be worth billions of cents, and stake * 950000 must stay exact (the trigger does it in 64-bit SQL).
  const exact = Number(BigInt(stake) * BigInt(1_000_000 - UPGRADER_RULES.edgeMillionths) / BigInt(target));
  return Math.min(UPGRADER_RULES.maxChance, exact);
}

/**
 * "21.6%", "0.03%", "80%": a chance in millionths as a percentage, as short as it can be without lying. Only exactly the cap
 * reads "80%" (799663 is "79.97%"), and anything under 0.01% shows four decimals ("0.004%", "0.0001%").
 */
export function chanceText(millionths) {
  const m = Math.max(0, Number(millionths) || 0);
  const pct = m / 10000;
  const places = pct >= 10 ? 1 : pct >= 0.01 ? 2 : 4;
  let text = Number(pct.toFixed(places));
  // One decimal would round a chance under the cap up to the cap (or a tiny one down to nothing): show two.
  if (m < UPGRADER_RULES.maxChance && text >= 80) text = Number(Math.min(pct, 79.99).toFixed(2));
  if (m > 0 && text === 0) text = Number(pct.toFixed(4));
  return `${text}%`;
}

/** "4.4x": how many times the stake the target is. "-" when there is no stake. */
export function multiplierText(stakeCents, targetCents) {
  const stake = Number(stakeCents); const target = Number(targetCents);
  if (!(stake > 0) || !(target > 0)) return '-';
  const ratio = target / stake;
  const places = ratio >= 100 ? 0 : ratio >= 2 ? 1 : 2;
  const text = Number(ratio.toFixed(places)).toLocaleString('en-US', { maximumFractionDigits: places });
  // Never "1x": a target is always worth more than the stake, so a near-equal pair reads 1.0x.
  return text === '1' ? '1.0x' : `${text}x`;
}

/** What a slab target is worth in coins for the odds: its graded value, at least the card's raw price `raw` (cracking the slab returns the raw card). */
export function slabTargetValue(raw, cardId, grade, blackLabel = false) {
  const set = ALL_SETS.find(item => String(cardId).startsWith(`${item.id}-`)) || energySet(cardId);
  return Math.max(gradedValueOf(raw, cardId, grade, set, blackLabel), raw);
}
