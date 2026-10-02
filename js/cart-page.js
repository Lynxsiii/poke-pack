/* The /cart page: line list, per-line Open now / Keep sealed, one checkout.

   OWNER: cart agent. Contract: /mnt/project-files/cart-sealed/CONTRACT.md.

   initCart(deps) -> { show(path), hide() }
   deps (wired in js/app.js; ask the lead before adding keys):
     root                 the #view-cart element
     api                  fetch helper (js/api.js), throws ApiError with .status/.message and the JSON body on .payload
     user()               the signed-in account or null
     coins()              the player's coins
     offerFor(setId, productId)     catalog offer (price, name, packs, ...) or null
     productImage(setId, productId) box photo url or ""
     getSet(setId)        the set record (name, wrappers, ...)
     packPicture(wrap, alt, set)    html for a booster wrapper
     eligible(setId, productId)     cart-eligible offer check (ORDER rules)
     applySave(save)      take a save from the server (updates state and header)
     showOpened(opened, { title })  hand an OpenResult to the batch opener
     navigate(path)       client-side route change
     signIn()             open the sign-in screen
     toast(message)
   The header count badge and add-to-cart controls subscribe to cartStore.

   Checkout is exactly-once from the player's side: one requestId per attempt, kept in
   sessionStorage and localStorage (`pokepack.checkout.pending`) until a 200 arrives, so a
   retry, a refresh or a second tab sends the same id and the Worker replays the order
   instead of charging again. The cart is emptied only when the 200 is in hand. */
import { ORDER_LIMITS, newRequestId } from "./orders-rules.js?v=1";
// Same URL as js/app.js imports: one module, one store.
import { cartStore, centsText, centsAmount, planCart, MINUS, PLUS } from "./cart.js?v=4";
import { coinAmount, coinText } from "./money.js?v=1";

const PENDING_KEY = "pokepack.checkout.pending";
const RESEND_WINDOW_MS = 120_000; // an unanswered checkout this young may still be running on the server

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---- The unfinished checkout, in both storages ---------------------------------- */

function readPending(userId) {
  for (const kind of ["localStorage", "sessionStorage"]) {
    try {
      const text = window[kind].getItem(PENDING_KEY);
      if (!text) continue;
      const row = JSON.parse(text);
      if (!ORDER_LIMITS.requestIdPattern.test(String(row?.requestId)) || !Array.isArray(row.lines) || !row.lines.length) continue;
      if (row.userId && String(row.userId) !== String(userId)) continue;
      return row;
    } catch {
      /* try the other storage */
    }
  }
  return null;
}

function writePending(row) {
  for (const kind of ["localStorage", "sessionStorage"]) {
    try {
      window[kind].setItem(PENDING_KEY, JSON.stringify(row));
    } catch {
      /* the other one may still take it */
    }
  }
}

function clearPending() {
  for (const kind of ["localStorage", "sessionStorage"]) {
    try {
      window[kind].removeItem(PENDING_KEY);
    } catch {
      /* nothing to clear */
    }
  }
}

const rowsKey = (rows) =>
  rows
    .map((row) => `${row.setId}/${row.productId}/${row.mode}/${row.qty}`)
    .sort()
    .join("|");

export function initCart(deps) {
  const { root } = deps;
  let shown = false;
  let unsubscribe = null;
  let busy = false; // a checkout (or the check on an old one) is in flight
  let notice = null; // { text, action?: { key, label } }
  let noticeAtTop = false; // a notice from opening the page shows at the top; one from a tap on Check out, beside the button
  let receipt = null; // what the last checkout did
  let priceHeld = null; // { cents, key }: the Worker's total after a price_changed, agreed to on the next try
  let clearArmed = false;
  let clearTimer = 0;

  /* ---- Data ---------------------------------------------------------------------- */

  const plan = () => planCart(cartStore.lines(), (setId, productId) => (deps.eligible(setId, productId) ? deps.offerFor(setId, productId) : null));
  const totalFor = (p) => (priceHeld && priceHeld.key === rowsKey(p.rows) ? priceHeld.cents : p.totalCents);

  /* ---- Markup -------------------------------------------------------------------- */

  function artHtml(line) {
    const set = deps.getSet(line.setId);
    const image = deps.productImage(line.setId, line.productId) || line.offer.image || "";
    const stack = (set.wrappers || [])
      .slice(0, 3)
      .map((wrap) => `<span>${deps.packPicture(wrap, " ", set)}</span>`)
      .join("");
    return `<span class="cart-art${image ? "" : " no-box"}" aria-hidden="true">
      ${image ? `<img class="cart-box" src="${esc(image)}" alt="" loading="lazy" decoding="async" />` : ""}
      <span class="cart-stack">${stack}</span>
    </span>`;
  }

  function lineHtml(line) {
    const { offer } = line;
    const key = `${esc(line.setId)}/${esc(line.productId)}`;
    const all = line.forced === line.qty; // the pack limit is spent: this line can only stay sealed
    const part = line.forced > 0 && !all;
    const mode = all || line.mode === "keep" ? "keep" : "open";
    const meta = line.packs
      ? `${coinAmount(offer.price)} each, ${plural(line.packs, "pack")} each`
      : `${coinAmount(offer.price)} each, a ready-to-play deck`;
    const note = all
      ? "Stays sealed: this order's pack limit is used up."
      : part
        ? `${line.openQty} open, ${line.forced} stay${line.forced === 1 ? "s" : ""} sealed: this order's pack limit.`
        : "";
    return `<li class="cart-line" data-line="${key}" data-set="${esc(line.setId)}" data-product="${esc(line.productId)}">
      ${artHtml(line)}
      <div class="cart-line-body">
        <div class="cart-line-top">
          <h4 class="cart-name">${esc(offer.name)}</h4>
          <span class="cart-line-price">${centsAmount(line.cents)}</span>
        </div>
        <p class="cart-line-meta">${meta}</p>
        ${note ? `<p class="cart-line-note">${esc(note)}</p>` : ""}
        <div class="cart-line-ctl">
          <div class="cart-seg" role="group" aria-label="What to do with ${esc(offer.name)}">
            <button type="button" data-act="mode" data-mode="open" data-k="open:${key}" aria-pressed="${mode === "open"}" ${all ? "disabled" : ""}>Open now</button>
            <button type="button" data-act="mode" data-mode="keep" data-k="keep:${key}" aria-pressed="${mode === "keep"}">Keep sealed</button>
          </div>
          <div class="cart-qty" role="group" aria-label="Quantity of ${esc(offer.name)}">
            <button type="button" data-act="less" data-k="less:${key}" aria-label="One fewer ${esc(offer.name)}" ${line.qty <= 1 ? "disabled" : ""}>${MINUS}</button>
            <input type="number" inputmode="numeric" min="1" max="${ORDER_LIMITS.maxQtyPerLine}" value="${line.qty}" data-act="qty" data-k="qty:${key}" aria-label="Quantity of ${esc(offer.name)}" />
            <button type="button" data-act="more" data-k="more:${key}" aria-label="One more ${esc(offer.name)}" ${line.qty >= ORDER_LIMITS.maxQtyPerLine ? "disabled" : ""}>${PLUS}</button>
          </div>
          <button type="button" class="link-btn cart-remove" data-act="remove" data-k="remove:${key}" aria-label="Remove ${esc(offer.name)} from your cart">Remove</button>
        </div>
      </div>
    </li>`;
  }

  /** The order as the till would print it: a slip with the lines, the pack count and the total.
      It reuses the receipt's paper (css/opening.css); the actions under it stay plain. */
  function slipHtml(p, cents, coins, leftCents) {
    const coinCell = (value) => `${value}<span class="sr-only"> coins</span>`;
    const sets = [...new Set(p.lines.map((line) => line.setId))];
    const groups = sets
      .map((setId) => {
        const rows = p.lines
          .filter((line) => line.setId === setId)
          .map((line) => {
            const sealed = line.mode === "keep" || line.forced === line.qty;
            return `<li class="sub"><span class="r-name"><span class="r-nm">${line.qty} x ${esc(line.offer.name)}</span>${sealed ? " <i>sealed</i>" : ""}</span><span class="r-val">${coinCell(centsText(line.cents))}</span></li>`;
          })
          .join("");
        return `<ol class="receipt-rows"><li><span class="r-name"><span class="r-nm">${esc(deps.getSet(setId).name)}</span></span><span class="r-val"></span></li>${rows}</ol>`;
      })
      .join("<hr>");
    const short = leftCents < 0;
    return `<div class="receipt cart-slip" role="group" aria-label="Order slip, prices in coins">
      <p class="receipt-shop">poke-pack.rip</p>
      <p class="receipt-head">Order slip</p>
      <hr>${groups}<hr>
      <p class="receipt-line"><span>Products</span><span>${p.products}</span></p>
      <p class="receipt-line"><span>Packs to open</span><span>${p.openPacks} of ${ORDER_LIMITS.maxOpenPacks}</span></p>
      ${p.keptProducts ? `<p class="receipt-line"><span>Kept sealed</span><span>${p.keptProducts}</span></p>` : ""}
      <p class="receipt-line receipt-total"><span>Total</span><span>${coinCell(centsText(cents))}</span></p>
      <hr>
      <p class="receipt-line"><span>Your coins</span><span>${coinCell(coinText(coins))}</span></p>
      ${
        short
          ? `<ol class="receipt-rows"><li class="hit"><span class="r-name"><span class="r-nm">Short by</span></span><span class="r-val">${coinCell(centsText(-leftCents))}</span></li></ol>`
          : `<p class="receipt-line"><span>Left after</span><span>${coinCell(centsText(leftCents))}</span></p>`
      }
    </div>`;
  }

  function summaryHtml(p) {
    const cents = totalFor(p);
    const coins = Number(deps.coins() || 0);
    const leftCents = Math.round(coins * 100) - cents;
    const short = leftCents < 0;
    const capped = p.forcedProducts > 0;
    const label = busy ? "Checking out" : `Check out ${centsAmount(cents)}`;
    return `<aside class="cart-summary" aria-label="Order summary">
      ${slipHtml(p, cents, coins, leftCents)}
      ${capped ? `<p class="cart-cap">One order opens up to ${ORDER_LIMITS.maxOpenPacks} packs, so the rest of this cart stays sealed. Open it any time from your sealed collection.</p>` : ""}
      ${notice && !noticeAtTop ? noticeHtml() : ""}
      <button type="button" class="solid cart-checkout" data-act="checkout" data-k="checkout" ${busy || short ? "disabled" : ""}>${label}</button>
      ${short ? `<p class="cart-short">You're short by ${centsAmount(-leftCents)}. Take something out of the cart to check out.</p>` : ""}
    </aside>`;
  }

  function noticeHtml() {
    if (!notice) return "";
    return `<p class="cart-notice" role="status">${esc(notice.text)}${
      notice.action ? ` <button type="button" class="link-btn" data-act="${esc(notice.action.key)}" data-k="${esc(notice.action.key)}">${esc(notice.action.label)}</button>` : ""
    }</p>`;
  }

  function receiptHtml() {
    if (!receipt) return "";
    const kept = receipt.kept.map((row) => `${row.qty} ${esc(row.name)}`).join(", ");
    const opened = receipt.openedTotal ? ` ${plural(receipt.openedTotal, "other product was", "other products were")} opened.` : "";
    if (!receipt.keptTotal) {
      return `<section class="cart-done" role="status"><h3>Order complete</h3>
        <p>${plural(receipt.openedTotal, "product was", "products were")} opened. Paid <span class="money">${centsAmount(receipt.costCents)}</span>.</p></section>`;
    }
    return `<section class="cart-done" role="status"><h3>Kept sealed</h3>
      <p>${plural(receipt.keptTotal, "product")} added to your sealed collection (${kept}).${opened} Paid <span class="money">${centsAmount(receipt.costCents)}</span>.</p>
      <a class="link-btn" href="/bulk/sealed">See your sealed collection</a></section>`;
  }

  function html() {
    const head = (sub = "") => `<div class="section-head"><div><h2>Cart</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div></div>`;
    if (!deps.user()) {
      return `${head()}
        <div class="cart-empty"><div class="cart-empty-copy"><p>Sign in to fill your cart and check out.</p>
        <button type="button" class="solid" data-act="signin" data-k="signin">Sign in</button></div></div>`;
    }
    const p = plan();
    if (!p.lines.length) {
      return `${head()}${noticeHtml()}${receiptHtml()}
        <div class="cart-empty"><div class="cart-empty-copy"><p>${receipt ? "Your cart is empty again." : "Your cart is empty."} Add a box, an ETB or a bundle from a set's page in the shop.</p>
        <a class="solid" href="/packs">Go to the shop</a></div>
        ${receipt ? "" : `<div class="receipt cart-slip is-blank" aria-hidden="true"><p class="receipt-shop">poke-pack.rip</p><p class="receipt-head">Order slip</p><hr><p class="receipt-head">Nothing on it yet</p><hr><p class="receipt-line receipt-total"><span>Total</span><span>0</span></p></div>`}</div>`;
    }
    const sets = [...new Set(p.lines.map((line) => line.setId))];
    const groups = sets
      .map((setId) => {
        const lines = p.lines.filter((line) => line.setId === setId);
        const count = lines.reduce((n, line) => n + line.qty, 0);
        return `<section class="cart-set"><h3 class="cart-set-head">${esc(deps.getSet(setId).name)} <small>${plural(count, "product")}</small></h3>
          <ul class="cart-lines">${lines.map(lineHtml).join("")}</ul></section>`;
      })
      .join("");
    const allOpen = p.lines.every((line) => line.mode === "open");
    const allKeep = p.lines.every((line) => line.mode === "keep");
    return `${head()}
      ${noticeAtTop ? noticeHtml() : ""}${receiptHtml()}
      <div class="cart-layout">
        <div class="cart-main">
          <div class="cart-bulk">
            <div class="cart-seg" role="group" aria-label="Set every product at once">
              <button type="button" data-act="all" data-mode="open" data-k="all:open" aria-pressed="${allOpen}">Open all</button>
              <button type="button" data-act="all" data-mode="keep" data-k="all:keep" aria-pressed="${allKeep}">Keep all</button>
            </div>
            <button type="button" class="link-btn cart-clear" data-act="clear" data-k="clear">${clearArmed ? `Tap again to remove all ${p.products}` : "Clear cart"}</button>
          </div>
          ${groups}
        </div>
        ${summaryHtml(p)}
      </div>`;
  }

  function paint() {
    if (!shown) return;
    const active = document.activeElement;
    const key = active && root.contains(active) ? active.dataset.k : "";
    const typing = active?.matches?.("input") ? active.value : null;
    root.innerHTML = html();
    if (key) {
      const el = [...root.querySelectorAll("[data-k]")].find((node) => node.dataset.k === key && !node.disabled);
      if (el) {
        el.focus({ preventScroll: true });
        if (typing !== null && el.matches("input")) el.value = typing;
      }
    }
  }

  /* ---- Checkout ------------------------------------------------------------------ */

  function say(text, action) {
    notice = text ? { text, action } : null;
  }

  /** The cart's own bookkeeping once a 200 is in hand: coins, the cart, what to show. */
  function finish(data, pending) {
    deps.applySave(data.save);
    clearPending();
    priceHeld = null;
    cartStore.take(pending.lines); // only now: nothing leaves the cart before the order exists
    const kept = new Map();
    let keptTotal = 0;
    let openedTotal = 0;
    for (const row of pending.lines) {
      if (row.mode === "keep") {
        keptTotal += row.qty;
        const name = deps.offerFor(row.setId, row.productId)?.name || row.productId;
        kept.set(name, (kept.get(name) || 0) + row.qty);
      } else openedTotal += row.qty;
    }
    receipt = {
      costCents: Number.isFinite(data.order?.costCents) ? data.order.costCents : pending.expectedCents,
      keptTotal,
      openedTotal,
      kept: [...kept].map(([name, qty]) => ({ name, qty })),
    };
    say(data.order?.replayed ? "That order had already gone through, so you were charged once." : "");
    if (shown) {
      paint();
      window.scrollTo({ top: 0, behavior: "instant" }); // the page just got shorter: bring the confirmation into view
    }
    if (data.opened) deps.showOpened(data.opened, { title: "Opened from your cart" });
  }

  /** Ask the Worker what became of a checkout. "done", "gone" (it never happened) or "unknown". */
  async function settle(pending) {
    try {
      finish(await deps.api(`/api/orders/${encodeURIComponent(pending.requestId)}`), pending);
      return "done";
    } catch (err) {
      // A 404 only means "never happened" once the original request can no longer be
      // running: a reload can leave it in flight, about to create the order. Within
      // two minutes send the same id again (the Worker replays or creates it once).
      if (err.status === 404 && Date.now() - (Number(pending.at) || 0) < RESEND_WINDOW_MS) {
        try {
          finish(
            await deps.api("/api/cart/checkout", {
              method: "POST",
              body: JSON.stringify({ requestId: pending.requestId, expectedCents: pending.expectedCents, lines: pending.lines }),
            }),
            pending
          );
          return "done";
        } catch (again) {
          if (again.status >= 400 && again.status < 500) {
            clearPending();
            return "gone";
          }
          say("We couldn't confirm your last checkout yet. Nothing is lost: check again in a moment.", { key: "recheck", label: "Check again" });
          return "unknown";
        }
      }
      if (err.status === 404) {
        clearPending();
        return "gone";
      }
      say("We couldn't confirm your last checkout yet. Nothing is lost: check again in a moment.", { key: "recheck", label: "Check again" });
      return "unknown";
    }
  }

  async function send(pending) {
    try {
      finish(
        await deps.api("/api/cart/checkout", {
          method: "POST",
          body: JSON.stringify({ requestId: pending.requestId, expectedCents: pending.expectedCents, lines: pending.lines }),
        }),
        pending
      );
    } catch (err) {
      const body = err.payload || err.data || {};
      if (err.status === 409 && body.code === "price_changed") {
        clearPending(); // refused before charging: the next try is a fresh order at the new price
        if (Number.isFinite(body.totalCents)) priceHeld = { cents: body.totalCents, key: rowsKey(plan().rows) };
        const text = `The price moved. The total is now ${centsText(totalFor(plan()))} coins. Check out again to buy at that price.`;
        say(text);
        deps.toast("The price moved.");
      } else if (err.status === 409 && body.code === "request_reused") {
        // That id already belongs to an order: whatever it was, it happened. Show it.
        if ((await settle(pending)) === "gone") {
          say(err.message);
          deps.toast(err.message);
        }
      } else if (err.status >= 400 && err.status < 500) {
        clearPending(); // refused: nothing was charged
        say(err.message);
        deps.toast(err.message);
      } else {
        say("We couldn't reach the shop, so we can't tell if that went through. Check out again to retry the same order; you won't be charged twice.");
        deps.toast(err.status ? err.message : "Couldn't reach the shop. Check your connection and try again.");
      }
    }
  }

  async function checkout() {
    if (busy) return; // double taps and a second click while a request is out do nothing
    const user = deps.user();
    if (!user) return deps.signIn();
    const p = plan();
    if (!p.rows.length) return;
    const cents = totalFor(p);
    if (Math.round(Number(deps.coins() || 0) * 100) < cents) return deps.toast("Not enough coins.");
    busy = true;
    receipt = null;
    noticeAtTop = false;
    say("");
    paint();
    try {
      let pending = readPending(user.id);
      // An unfinished checkout for this very cart is retried as it was, same id. For a
      // different cart, find out what became of it before starting another.
      if (pending && rowsKey(pending.lines) !== rowsKey(p.rows)) {
        if ((await settle(pending)) !== "gone") return;
        pending = null;
      }
      if (!pending) {
        pending = { requestId: newRequestId(), lines: p.rows, expectedCents: cents, at: Date.now(), userId: user.id };
        writePending(pending);
      }
      await send(pending);
    } finally {
      busy = false;
      paint();
    }
  }

  /** On opening the page: a checkout that was in flight when the tab went away. */
  async function resume() {
    const user = deps.user();
    const pending = user && readPending(user.id);
    if (!pending || busy) return;
    busy = true;
    noticeAtTop = true;
    say("Finishing your last checkout.");
    paint();
    try {
      if ((await settle(pending)) === "gone") {
        say("Your last checkout didn't go through, so nothing was charged.");
        deps.toast("Nothing was charged.");
      }
    } finally {
      busy = false;
      paint();
    }
  }

  /* ---- Events -------------------------------------------------------------------- */

  const lineOf = (el) => el.closest("[data-line]")?.dataset;

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const line = lineOf(btn);
    if (act !== "clear" && clearArmed) {
      clearArmed = false;
      clearTimeout(clearTimer);
    }
    if (act === "checkout") checkout();
    else if (act === "signin") deps.signIn();
    else if (act === "recheck") resume();
    else if (act === "mode" && line) cartStore.setMode(line.set, line.product, btn.dataset.mode);
    else if (act === "all") cartStore.setAllModes(btn.dataset.mode);
    else if (act === "less" && line) cartStore.setQty(line.set, line.product, cartStore.qty(line.set, line.product) - 1);
    else if (act === "more" && line) {
      const had = cartStore.qty(line.set, line.product);
      if (cartStore.add(line.set, line.product, 1) === had) deps.toast(cartStore.capReason(line.set, line.product) || "Couldn't add more.");
    } else if (act === "remove" && line) cartStore.remove(line.set, line.product);
    else if (act === "clear") {
      if (!clearArmed) {
        clearArmed = true;
        clearTimer = setTimeout(() => {
          clearArmed = false;
          paint();
        }, 4000);
        paint();
      } else {
        clearArmed = false;
        clearTimeout(clearTimer);
        cartStore.clear();
      }
    }
  });

  root.addEventListener("change", (e) => {
    const input = e.target.closest('input[data-act="qty"]');
    const line = input && lineOf(input);
    if (!line) return;
    const want = Math.floor(Number(input.value));
    if (!(want >= 1)) {
      paint(); // not a quantity: put the old one back
      return;
    }
    const had = cartStore.qty(line.set, line.product);
    const now = cartStore.setQty(line.set, line.product, want);
    if (now < want) deps.toast(cartStore.capReason(line.set, line.product) || `You can add up to ${ORDER_LIMITS.maxQtyPerLine} of one product.`);
    if (now === had) paint();
  });

  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches('input[data-act="qty"]')) e.target.blur();
  });

  return {
    show() {
      shown = true;
      receipt = null;
      if (!busy) say("");
      clearArmed = false;
      unsubscribe?.();
      unsubscribe = cartStore.subscribe(paint);
      paint();
      resume();
    },
    hide() {
      shown = false;
      unsubscribe?.();
      unsubscribe = null;
      clearTimeout(clearTimer);
      clearArmed = false;
    },
  };
}
