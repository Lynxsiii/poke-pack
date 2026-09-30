/* Coinflip rules that the Worker enforces and the pages describe. Values are
   whole cents. Kept apart from worker/casino.js so the client can show the same
   windows the server checks (the server always has the last word). */

export const COINFLIP_RULES = {
  minCents: 10,      // a flip needs at least 0.10 coins of cards
  maxCards: 40,      // different cards in one stake
  maxCopies: 120,    // cards in one stake, counting copies
  maxOpen: 5,        // open flips one player can leave on the table
  openHours: 24,     // an unmatched flip returns the cards after this
  tolerance: 0.05,   // a challenger may be this far above or below the host's value
  toleranceMinCents: 10,
  botEdge: 0.06,     // the bot stakes up to this much less than you, never more
};

/** The values a challenger's cards may total to match a host's stake, in cents. */
export function matchWindow(hostCents) {
  const slack = Math.max(COINFLIP_RULES.toleranceMinCents, Math.round(hostCents * COINFLIP_RULES.tolerance));
  return { min: Math.max(1, hostCents - slack), max: hostCents + slack };
}

/** What the bot may put up against a stake, in cents: a little under, never over. */
export function botStakeWindow(hostCents) {
  return { low: Math.max(1, Math.floor(hostCents * (1 - COINFLIP_RULES.botEdge))), high: hostCents };
}
