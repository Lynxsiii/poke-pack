/* How the site prints coins. Coins are dollars, so a whole amount reads without
   cents (2,500) and anything else with two (217.40, 0.22). Every module that
   shows money comes through here, so the shop, cart, casino and profile agree. */

/** 2500 -> "2,500", 217.4 -> "217.40", 0.22 -> "0.22" */
export const coinText = (value) => {
  const n = Math.round(Number(value || 0) * 100) / 100 + 0; // + 0 turns -0 into 0
  const digits = Math.round(n * 100) % 100 === 0 ? 0 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

/** The house coin as an inline mark. Decorative, so the amount carries the word "coins" for screen readers. */
export const COIN_I = '<img class="coin-i" src="assets/coins/house-coin-sm.webp" alt="" width="16" height="16" aria-hidden="true">';

/** The coin mark, the amount, and a visually hidden "coins". For plain-text places write `${coinText(n)} coins`. */
export const coinAmount = (value) => `${COIN_I}${coinText(value)}<span class="sr-only"> coins</span>`;
