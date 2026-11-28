/**
 * The first pack is free: the rules the page and the Worker share.
 *
 * A new visitor rips one pack before making an account, and it goes onto the
 * account they make. An account made without one opens its first pack free
 * instead. Either way it is one pack per account, for good.
 *
 * Only a pack the starting coins could have bought can be the free one, so
 * nobody's first pack is a vintage one worth hundreds.
 */

/** The dearest pack that can be the free one: what a new account starts with. */
export const FIRST_RIP_MAX_COST = 25;

/** Accounts made from here on have a free first pack. Older ones started under the old rules. */
export const FIRST_RIP_SINCE = Date.UTC(2026, 10, 28, 9, 0, 0);

/** A pack kept for a visitor waits this long for them to make an account. */
export const FIRST_RIP_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Can a pack of this set, at this price, be someone's free first pack? */
export function firstRipOk(set, cost) {
  const price = Number(cost);
  return Boolean(set && !set.promoSet && set.wrappers?.length && price > 0 && price <= FIRST_RIP_MAX_COST);
}
