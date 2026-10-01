/* Rules every cart / checkout / sealed-collection screen and the Worker share.

   Pure functions only: this file is imported by the browser and by worker/orders.js,
   so it must not touch the DOM, storage or the network. The contract is
   /mnt/project-files/cart-sealed/CONTRACT.md. */

export const ORDER_LIMITS = {
  maxLines: 40,
  maxQtyPerLine: 99,
  maxProducts: 250,
  // One order opens at most this many packs (ten booster boxes); the rest is kept sealed.
  maxOpenPacks: 360,
  requestIdPattern: /^[A-Za-z0-9_-]{8,64}$/,
};

export const ORDER_MODES = ["open", "keep"];

/**
 * Can this offer go through the cart? Any sealed product the shop sells as a box,
 * ETB, bundle, tin, collection, blister or deck. An "event" promo is a single card
 * sold on its own, so it keeps its direct buy button only.
 */
export function cartEligible(offer) {
  return Boolean(offer && offer.kind !== "event" && Number(offer.price) > 0);
}

/**
 * Boosters in one copy of an offer: the packs of its own set or of the sets named
 * in `from`, plus special packs. A deck holds none.
 */
export function packsInOffer(offer) {
  if (!offer) return 0;
  const own = offer.from ? Object.values(offer.from).reduce((sum, n) => sum + (Number(n) || 0), 0) : Number(offer.packs) || 0;
  const special = Object.values(offer.special || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return own + special;
}

/** What `qty` copies of an offer cost, in whole cents. */
export function lineCents(offer, qty) {
  return Math.round(Number(offer?.price || 0) * 100) * Math.max(0, Math.floor(Number(qty) || 0));
}

function fail(message, code) {
  throw Object.assign(new Error(message), { status: 400, ...(code ? { code } : {}) });
}

/**
 * Check the shape of an order's lines and merge duplicates of the same product and
 * mode. Returns `[{ setId, productId, qty, mode }]` in first-seen order, or throws an
 * error with a message a player can read. `mode` defaults to "keep" only when absent
 * from a vault open (which passes `{ modeless: true }`).
 */
export function normalizeLines(lines, { modeless = false } = {}) {
  if (!Array.isArray(lines) || !lines.length) fail("The cart is empty.");
  const merged = new Map();
  for (const raw of lines) {
    const setId = String(raw?.setId || "");
    const productId = String(raw?.productId ?? raw?.product ?? "");
    const qty = Number(raw?.qty);
    const mode = modeless ? "open" : String(raw?.mode || "");
    if (!/^[a-z0-9]{1,24}$/i.test(setId) || !/^[A-Za-z0-9_.-]{1,80}$/.test(productId)) fail("That order has a product that is not valid.");
    if (!Number.isInteger(qty) || qty < 1) fail("Each product needs a whole quantity of at least 1.");
    if (qty > ORDER_LIMITS.maxQtyPerLine) fail(`You can add up to ${ORDER_LIMITS.maxQtyPerLine} of one product.`);
    if (!ORDER_MODES.includes(mode)) fail("Choose open now or keep sealed for every product.");
    const key = `${setId}/${productId}/${mode}`;
    const row = merged.get(key);
    if (row) row.qty += qty;
    else merged.set(key, { setId, productId, qty, mode });
  }
  const out = [...merged.values()];
  if (out.length > ORDER_LIMITS.maxLines) fail(`An order holds up to ${ORDER_LIMITS.maxLines} different products.`);
  if (out.some((row) => row.qty > ORDER_LIMITS.maxQtyPerLine)) fail(`You can add up to ${ORDER_LIMITS.maxQtyPerLine} of one product.`);
  if (out.reduce((sum, row) => sum + row.qty, 0) > ORDER_LIMITS.maxProducts) fail(`An order holds up to ${ORDER_LIMITS.maxProducts} products.`);
  return out;
}

/** A fresh request id for one checkout attempt. Reuse it when the same attempt is retried. */
export function newRequestId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
