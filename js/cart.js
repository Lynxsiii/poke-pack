/* Cart store: the lines a player has put in their cart, kept in localStorage.

   OWNER: cart agent. The contract is /mnt/project-files/cart-sealed/CONTRACT.md.

   A line is { setId, productId, qty }; prices are never stored (they are read
   from the loaded catalog each time). `mode` ("open" | "keep") rides along so a
   player's choice survives a reload; it defaults to "open". One cart per account:
   `pokepack.cart.v1.<userId>`. Reads and writes are wrapped in try/catch, so
   the page works with storage blocked (the cart then lives in memory).

   Exports the app and the pages share (keep these names):
     cartStore.setUser(userId | null)       switch accounts (the cart follows the account)
     cartStore.lines()                      [{ setId, productId, qty, mode }]
     cartStore.count()                      total products (sum of qty)
     cartStore.qty(setId, productId)        0 when not in the cart
     cartStore.add(setId, productId, n = 1) clamps to ORDER_LIMITS, returns the line's new qty
     cartStore.setQty(setId, productId, n)  0 removes, returns the line's new qty
     cartStore.remove(setId, productId)
     cartStore.clear()
     cartStore.subscribe(fn)                fn() on any change (also from another tab); returns unsubscribe
   Also here: setMode / setAllModes / take / prune / capReason (store), planCart (pure
   order maths), cartControlHtml / cartControlClick / refreshCartControls (the add-to-cart
   control on product cards) and mountCartBar (the phone bar on /packs). */
import { ORDER_LIMITS, ORDER_MODES, lineCents, packsInOffer } from "./orders-rules.js?v=1";

const PREFIX = "pokepack.cart.v1.";
const SET_ID = /^[a-z0-9]{1,24}$/i;
const PRODUCT_ID = /^[A-Za-z0-9_.-]{1,80}$/;

/** Coins are dollars, so they always read with cents (same as the shop's coin()). */
export const coinText = (n) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const centsText = (cents) => coinText((Number(cents) || 0) / 100);

/** Stepper marks: drawn, so they weigh the same in every browser's fallback font. */
export const MINUS = '<svg class="cart-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
export const PLUS = '<svg class="cart-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg>';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let userId = null;
let items = [];
const listeners = new Set();

function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Bring whatever storage held (or a hand-edited blob) back inside the limits. */
function clean(raw) {
  if (!Array.isArray(raw)) return [];
  const merged = new Map();
  for (const row of raw) {
    const setId = String(row?.setId || "");
    const productId = String(row?.productId || "");
    const qty = Math.floor(Number(row?.qty));
    if (!SET_ID.test(setId) || !PRODUCT_ID.test(productId) || !(qty >= 1)) continue;
    const key = `${setId}/${productId}`;
    const mode = ORDER_MODES.includes(row?.mode) ? row.mode : "open";
    const have = merged.get(key);
    if (have) have.qty = Math.min(ORDER_LIMITS.maxQtyPerLine, have.qty + qty);
    else if (merged.size < ORDER_LIMITS.maxLines) merged.set(key, { setId, productId, qty: Math.min(ORDER_LIMITS.maxQtyPerLine, qty), mode });
  }
  const out = [];
  let room = ORDER_LIMITS.maxProducts;
  for (const row of merged.values()) {
    if (room <= 0) break;
    row.qty = Math.min(row.qty, room);
    room -= row.qty;
    out.push(row);
  }
  return out;
}

/** What storage holds for the signed-in account, or null when it cannot be read. */
function read() {
  if (!userId) return [];
  try {
    const text = store()?.getItem(PREFIX + userId);
    if (text === undefined) return null;
    return clean(text ? JSON.parse(text) : []);
  } catch {
    return null;
  }
}

function write() {
  if (!userId) return;
  try {
    store()?.setItem(PREFIX + userId, JSON.stringify(items));
  } catch {
    /* blocked or full: the cart stays in memory for this tab */
  }
}

function emit() {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

/** Another tab may have written since we last looked: start every change from storage. */
function sync() {
  const stored = read();
  if (stored) items = stored;
}

const total = () => items.reduce((sum, row) => sum + row.qty, 0);
const find = (setId, productId) => items.find((row) => row.setId === setId && row.productId === productId);

function commit(before) {
  items = clean(items);
  if (JSON.stringify(before) === JSON.stringify(items)) return false;
  write();
  emit();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!userId || (e.key !== null && e.key !== PREFIX + userId)) return;
    const stored = read();
    if (!stored || JSON.stringify(stored) === JSON.stringify(items)) return;
    items = stored;
    emit();
  });
}

export const cartStore = {
  setUser(id) {
    const next = id ? String(id) : null;
    if (next === userId) return;
    userId = next;
    items = read() || [];
    emit();
  },
  lines: () => items.map((row) => ({ ...row })),
  count: () => total(),
  qty: (setId, productId) => find(setId, productId)?.qty || 0,
  mode: (setId, productId) => find(setId, productId)?.mode || "open",
  add(setId, productId, n = 1) {
    if (!userId) return 0;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    const want = Math.floor(Number(n)) || 0;
    if (want < 1) return find(setId, productId)?.qty || 0;
    const row = find(setId, productId);
    const room = Math.max(0, ORDER_LIMITS.maxProducts - total());
    if (row) row.qty = Math.min(ORDER_LIMITS.maxQtyPerLine, row.qty + Math.min(want, room));
    else if (room) items.push({ setId: String(setId), productId: String(productId), qty: Math.min(ORDER_LIMITS.maxQtyPerLine, want, room), mode: "open" });
    commit(before);
    return find(setId, productId)?.qty || 0;
  },
  setQty(setId, productId, n) {
    if (!userId) return 0;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    const row = find(setId, productId);
    const want = Math.floor(Number(n)) || 0;
    if (!row) return 0;
    if (want < 1) items = items.filter((r) => r !== row);
    else row.qty = Math.min(want, ORDER_LIMITS.maxQtyPerLine, row.qty + Math.max(0, ORDER_LIMITS.maxProducts - total()));
    commit(before);
    return find(setId, productId)?.qty || 0;
  },
  remove(setId, productId) {
    cartStore.setQty(setId, productId, 0);
  },
  clear() {
    if (!userId) return;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    items = [];
    commit(before);
  },
  /** Open now or keep sealed for one line (kept in the cart so a reload remembers it). */
  setMode(setId, productId, mode) {
    if (!userId || !ORDER_MODES.includes(mode)) return;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    const row = find(setId, productId);
    if (row) row.mode = mode;
    commit(before);
  },
  setAllModes(mode) {
    if (!userId || !ORDER_MODES.includes(mode)) return;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    for (const row of items) row.mode = mode;
    commit(before);
  },
  /** Take bought product out of the cart (rows are { setId, productId, qty }); the rest stays. */
  take(rows) {
    if (!userId) return;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    for (const taken of rows || []) {
      const row = find(taken.setId, taken.productId);
      if (row) row.qty -= Math.floor(Number(taken.qty)) || 0;
    }
    items = items.filter((row) => row.qty > 0);
    commit(before);
  },
  /** Drop lines the catalog no longer sells. Call only once the catalog has loaded. */
  prune(isKnown) {
    if (!userId) return;
    sync();
    const before = JSON.parse(JSON.stringify(items));
    items = items.filter((row) => isKnown(row.setId, row.productId));
    commit(before);
  },
  /** Why an add did nothing, in a sentence a player can read ("" when it was not a limit). */
  capReason(setId, productId) {
    const row = find(setId, productId);
    if (row && row.qty >= ORDER_LIMITS.maxQtyPerLine) return `You can add up to ${ORDER_LIMITS.maxQtyPerLine} of one product.`;
    if (total() >= ORDER_LIMITS.maxProducts) return `A cart holds up to ${ORDER_LIMITS.maxProducts} products.`;
    if (!row && items.length >= ORDER_LIMITS.maxLines) return `A cart holds up to ${ORDER_LIMITS.maxLines} different products.`;
    return "";
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/* ---- Order maths (pure: the cart page and the tests share it) ----------------- */

/**
 * Turn cart lines into an order. Rows come back grouped by set (first seen first),
 * which is also the order the page draws them and the order the 360-pack budget is
 * spent in. A line the player wants opened gets as many opened copies as the budget
 * allows and the rest are kept sealed (`forced`). `rows` of the request are the
 * `{ setId, productId, qty, mode }` lines the Worker takes; a product split between
 * opened and kept becomes two of them.
 */
export function planCart(lines, offerFor) {
  const bySet = new Map();
  for (const line of lines || []) {
    const offer = offerFor(line.setId, line.productId);
    if (!offer) continue;
    if (!bySet.has(line.setId)) bySet.set(line.setId, []);
    bySet.get(line.setId).push({ ...line, offer });
  }
  let budget = ORDER_LIMITS.maxOpenPacks;
  const lines2 = [];
  for (const group of bySet.values()) {
    for (const line of group) {
      const packs = packsInOffer(line.offer);
      const want = line.mode === "keep" ? 0 : line.qty;
      const openQty = !want ? 0 : packs ? Math.min(want, Math.floor(budget / packs)) : want;
      budget -= openQty * packs;
      lines2.push({
        setId: line.setId,
        productId: line.productId,
        qty: line.qty,
        mode: line.mode === "keep" ? "keep" : "open",
        offer: line.offer,
        packs,
        unitCents: lineCents(line.offer, 1),
        cents: lineCents(line.offer, line.qty),
        openQty,
        keepQty: line.qty - openQty,
        forced: want - openQty,
      });
    }
  }
  // A split line is two rows on the wire; never let that pass the line limit.
  let rowCount = lines2.reduce((n, l) => n + (l.openQty > 0) + (l.keepQty > 0), 0);
  for (let i = lines2.length - 1; i >= 0 && rowCount > ORDER_LIMITS.maxLines; i -= 1) {
    const l = lines2[i];
    if (l.openQty > 0 && l.keepQty > 0) {
      l.forced += l.openQty;
      l.keepQty += l.openQty;
      l.openQty = 0;
      rowCount -= 1;
    }
  }
  const rows = lines2.flatMap((l) => [
    ...(l.openQty > 0 ? [{ setId: l.setId, productId: l.productId, qty: l.openQty, mode: "open" }] : []),
    ...(l.keepQty > 0 ? [{ setId: l.setId, productId: l.productId, qty: l.keepQty, mode: "keep" }] : []),
  ]);
  return {
    lines: lines2,
    rows,
    products: lines2.reduce((n, l) => n + l.qty, 0),
    totalCents: lines2.reduce((n, l) => n + l.cents, 0),
    openProducts: lines2.reduce((n, l) => n + l.openQty, 0),
    keptProducts: lines2.reduce((n, l) => n + l.keepQty, 0),
    openPacks: lines2.reduce((n, l) => n + l.openQty * l.packs, 0),
    forcedProducts: lines2.reduce((n, l) => n + l.forced, 0),
  };
}

/* ---- The add-to-cart control on a product card ---------------------------------- */

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * "Add to cart", or once the product is in the cart a stepper that says how many.
 * It sits beside the card's own Open button; its clicks never reach that button.
 */
export function cartControlHtml(setId, productId, name) {
  const n = cartStore.qty(setId, productId);
  const data = `data-cart-set="${esc(setId)}" data-cart-product="${esc(productId)}" data-cart-name="${esc(name)}"`;
  if (!n) {
    return `<div class="cart-ctl" ${data}>
      <button type="button" class="ghost cart-add" data-cart="add" aria-label="Add ${esc(name)} to your cart">Add to cart</button>
    </div>`;
  }
  return `<div class="cart-ctl in-cart" ${data}>
    <div class="cart-step" role="group" aria-label="${esc(name)} in your cart">
      <button type="button" data-cart="less" aria-label="One fewer ${esc(name)}">${MINUS}</button>
      <a class="cart-step-n" href="/cart" data-cart="view" aria-label="${n} in your cart, open the cart"><b>${n}</b> in cart</a>
      <button type="button" data-cart="more" aria-label="One more ${esc(name)}">${PLUS}</button>
    </div>
  </div>`;
}

/**
 * A tap on an add-to-cart control. `deps`: signedIn, signIn(), toast(message).
 * Returns true when the click was the cart's (the card must not treat it as a buy).
 */
export function cartControlClick(target, { signedIn, signIn, toast }) {
  const btn = target.closest?.("[data-cart]");
  if (!btn) return false;
  const ctl = btn.closest(".cart-ctl");
  const action = btn.dataset.cart;
  if (!ctl || action === "view") return Boolean(ctl);
  const { cartSet: setId, cartProduct: productId } = ctl.dataset;
  if (!signedIn) {
    toast("Sign in to use your cart.");
    signIn();
    return true;
  }
  if (action === "less") {
    cartStore.setQty(setId, productId, cartStore.qty(setId, productId) - 1);
    return true;
  }
  const had = cartStore.qty(setId, productId);
  const now = cartStore.add(setId, productId, 1);
  if (now === had) toast(cartStore.capReason(setId, productId) || "Couldn't add that.");
  return true;
}

/**
 * Redraw the controls under `root` after the cart changed, in place, so the card (and the
 * button the player is on) is not rebuilt. Focus stays on the same kind of button.
 */
export function refreshCartControls(root) {
  if (!root) return;
  for (const ctl of root.querySelectorAll(".cart-ctl[data-cart-set]")) {
    const { cartSet, cartProduct, cartName } = ctl.dataset;
    const had = ctl.classList.contains("in-cart");
    const n = cartStore.qty(cartSet, cartProduct);
    if (had === Boolean(n) && (!had || ctl.querySelector(".cart-step-n b")?.textContent === String(n))) continue;
    const focused = ctl.contains(document.activeElement) ? document.activeElement.dataset.cart : "";
    const next = document.createElement("template");
    next.innerHTML = cartControlHtml(cartSet, cartProduct, cartName).trim();
    ctl.replaceWith(next.content.firstElementChild);
    if (focused) {
      const fresh = root.querySelector(`.cart-ctl[data-cart-set="${CSS.escape(cartSet)}"][data-cart-product="${CSS.escape(cartProduct)}"]`);
      const order = focused === "add" ? ["more", "add"] : [focused, "more", "add"];
      for (const kind of order) {
        const el = fresh?.querySelector(`[data-cart="${kind}"]`);
        if (el) {
          el.focus();
          break;
        }
      }
    }
  }
}

/**
 * The phone bar on /packs: a slim strip above the tab bar while the cart holds
 * anything. `host` is the shop section (so it goes away with it); `offerFor`
 * prices the lines. Returns { paint } for the app to call when prices move.
 */
export function mountCartBar(host, offerFor) {
  if (!host) return { paint() {} };
  const bar = document.createElement("a");
  bar.className = "cart-bar";
  bar.href = "/cart";
  bar.hidden = true;
  host.append(bar);
  function paint() {
    const n = cartStore.count();
    bar.hidden = !n;
    host.classList.toggle("has-cart-bar", Boolean(n));
    if (!n) return;
    const cents = planCart(cartStore.lines(), offerFor).totalCents;
    bar.innerHTML = `<span class="cart-bar-copy"><b>Cart</b> ${plural(n, "product")}</span>
      <span class="cart-bar-total"><span aria-hidden="true">✦</span> ${centsText(cents)}</span>
      <span class="cart-bar-go">View cart</span>`;
    bar.setAttribute("aria-label", `Cart, ${plural(n, "product")}, ${centsText(cents)} coins. View cart`);
  }
  paint();
  cartStore.subscribe(paint);
  return { paint };
}
