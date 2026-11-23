/* Trading rules, shared by the page (js/trades-page.js) and the Worker
   (worker/trades.js). Change a number here and both sides follow.

   A trade is an offer from one player to another: cards, slabs and coins each
   way. Nothing is held while an offer waits; the swap happens in one database
   statement when the other player accepts, and only if both still own
   everything (worker/trades-ddl.js).

   Every item has a coin value, the same one selling pays: a card its sell
   value, a slab the better of its graded and raw value, coins their face. The
   side that gives more is "down" by the gap, and the gap is what the rules
   watch, because a gap is how coins would leak from one account to another:
     - strangers may only trade close to even (EVEN_SHARE, or EVEN_SLACK_CENTS);
     - friends may trade uneven, a gift;
     - either way the gap counts against a daily limit that grows with level,
       once for the player giving it and once for the player getting it. The
       getting side is what stops a farm of spare accounts feeding one. */

export const TRADE_RULES = {
  /** Different cards one side may hold, copies of one card, and copies in a whole side. */
  maxCards: 30,
  maxQty: 99,
  maxCopies: 500,
  /** Slabs one side may hold. */
  maxSlabs: 10,
  /** Coins one side may add, in cents. */
  maxCoinsCents: 100_000_000,
  /** An offer nobody answers closes itself after this long. */
  expiryMs: 7 * 24 * 60 * 60 * 1000,
  /** Offers one player may have waiting, and may send in a day. */
  maxOpenSent: 20,
  maxPerDay: 60,
  /** Strangers: the smaller side is at least this share of the bigger one, or the gap is at most the slack. */
  evenShare: 0.8,
  evenSlackCents: 100,
  /** The daily gap limit in cents: base plus perLevel for each level. Counted over the last 24 hours. */
  gapBaseCents: 25_000,
  gapPerLevelCents: 2_500,
  gapWindowMs: 24 * 60 * 60 * 1000,
  /** Closed offers the Trades page lists. */
  historyShown: 30,
};

/** Who may send a player offers. */
export const TRADE_FROM = ["all", "friends", "none"];
export const TRADE_FROM_WORDS = { all: "Everyone", friends: "Friends", none: "Nobody" };

/** How big a gap (cents) a player of this level may give, or get, in a day. */
export function gapLimit(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return TRADE_RULES.gapBaseCents + TRADE_RULES.gapPerLevelCents * lv;
}

/**
 * The shape of a trade from its two totals (cents): which side is down and by
 * how much, and whether strangers may make it. `down` is "give" when the
 * sender hands over more than they get, "take" when the receiver does.
 */
export function tradeGap(giveCents, takeCents) {
  const give = Math.max(0, Math.round(Number(giveCents) || 0));
  const take = Math.max(0, Math.round(Number(takeCents) || 0));
  const gap = Math.abs(give - take);
  const big = Math.max(give, take);
  const small = Math.min(give, take);
  const even = gap <= TRADE_RULES.evenSlackCents || small >= big * TRADE_RULES.evenShare;
  return { gap, even, down: gap === 0 ? null : give > take ? "give" : "take" };
}

/** The coins that would bring an uneven trade inside the stranger band, in cents (0 when it already is). */
export function coinsToEven(giveCents, takeCents) {
  const give = Math.round(Number(giveCents) || 0);
  const take = Math.round(Number(takeCents) || 0);
  if (tradeGap(give, take).even) return 0;
  const big = Math.max(give, take);
  const small = Math.min(give, take);
  // small + x >= (big) * share, the smaller side adds x.
  return Math.max(0, Math.ceil(big * TRADE_RULES.evenShare - small));
}
