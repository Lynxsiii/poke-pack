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

/* Jackpot (migration 0016): 3 to 10 players toss cards into one pot; when it is
   full (or the host draws it early with at least 2 entries) one entry is drawn at
   random, weighted by the value it put up, and that player takes every card. The
   host's entry sets the pot's minimum; a joiner puts up between 1x and
   maxMultiple x of it, so a whale cannot dominate. The value window is also
   enforced by a trigger in the migration, which hard-codes the 5. */
export const JACKPOT_RULES = {
  minCents: 10,        // the host's entry (the pot's minimum) is at least 0.10 coins of cards
  maxCards: 40,        // different cards in one entry
  maxCopies: 120,      // cards in one entry, counting copies
  minPlayers: 3,       // a full table auto-draws; tables are 3 to 10 seats
  maxPlayers: 10,
  defaultPlayers: 6,
  earlyDrawMin: 2,     // the host may draw an unfilled pot once it has this many entries
  maxMultiple: 5,      // a joiner may put up at most this many times the host's entry
  maxOpen: 3,          // open pots one player can host at once
  openHours: 24,       // an undrawn pot returns every pile after this
};

/** The values a joiner's cards may total to enter a pot whose minimum is `minCents`. */
export function jackpotWindow(minCents) {
  return { min: minCents, max: minCents * JACKPOT_RULES.maxMultiple };
}
