/* The Sealed collection page (/bulk/sealed): kept sealed product, open later.

   Contract: /mnt/project-files/cart-sealed/CONTRACT.md. The Worker owns what a
   player holds (GET /api/vault) and what opening gives (POST /api/vault/open, the
   same roll a checkout "open now" uses); this module only presents it.

   An open is one POST carrying a requestId made once per attempt and kept in
   sessionStorage and localStorage (`pokepack.vault.pending`) until a 200 arrives.
   A retry, a double tap or a reload re-sends the same id, so the Worker answers
   with the order it already made and nothing is opened twice. On load a pending
   open is resumed through GET /api/orders/<id> (404 means it never happened).
   Tiles stay on the page until that 200: nothing is removed on a guess.

   initVault(deps) -> { show(path), hide(), tabsHtml(active) }
     tabsHtml("cards" | "sealed") returns the "Cards / Sealed (N)" strip the
     Collection page also draws (words with an ink line, not pills).
   deps (wired in js/app.js; ask the lead before adding keys):
     root                 the #view-vault element
     api                  fetch helper (js/api.js)
     user()               the signed-in account or null
     kept()               save.vaultKept (total kept sealed products)
     offerFor(setId, productId), productImage(setId, productId), getSet(setId), packPicture(wrap, alt, set)
     applySave(save)      take a save from the server
     showOpened(opened, { title })  hand an OpenResult to the batch opener
     navigate(path), signIn(), toast(message), coin(n) -> "1,234.50" */
import { ORDER_LIMITS, packsInOffer, newRequestId } from "./orders-rules.js?v=1";
import { SEALED_PRODUCTS } from "./catalog.js";

const PENDING_KEY = "pokepack.vault.pending";

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---- The open that has not been answered yet -------------------------------
   Both stores are written and either may be missing (private window, blocked
   site data); the page works with neither, it just cannot resume. */
const stores = () => {
  const out = [];
  for (const name of ["sessionStorage", "localStorage"]) {
    try {
      out.push(window[name]);
    } catch {
      /* blocked */
    }
  }
  return out;
};
const pendingStore = {
  read() {
    for (const store of stores()) {
      try {
        const rec = JSON.parse(store.getItem(PENDING_KEY) || "null");
        if (rec && /^[A-Za-z0-9_-]{8,64}$/.test(rec.requestId || "") && Array.isArray(rec.items) && rec.items.length) return rec;
      } catch {
        /* unreadable: treat as none */
      }
    }
    return null;
  },
  write(rec) {
    for (const store of stores()) {
      try {
        store.setItem(PENDING_KEY, JSON.stringify(rec));
      } catch {
        /* full or blocked */
      }
    }
  },
  clear() {
    for (const store of stores()) {
      try {
        store.removeItem(PENDING_KEY);
      } catch {
        /* blocked */
      }
    }
  },
};

const itemsKey = (items) =>
  items
    .map((i) => `${i.setId}/${i.productId}x${i.qty}`)
    .sort()
    .join(",");

/** An answer the server gave and meant: the request did not happen, so its id is spent. */
const refused = (err) => {
  const s = Number(err?.status);
  return s >= 400 && s < 500 && s !== 408 && s !== 429;
};

const releaseTime = (set) => {
  const t = Date.parse(set?.released || "");
  return Number.isNaN(t) ? 0 : t;
};

export function initVault(deps) {
  const root = deps.root;
  const signedIn = () => Boolean(deps.user());
  const keptNow = () => Math.max(0, Math.floor(Number(deps.kept()) || 0));

  let phase = "idle"; // idle, loading, ready, error, signedout
  let vault = { items: [], kept: 0 };
  let loaded = false;
  let loadToken = 0;
  let busy = null; // { key } while an open is in flight (key "all" for Open all)
  let notice = null; // { text, tone: "info" | "error", retry?: boolean }
  const picks = new Map(); // `${setId}/${productId}` -> how many the stepper says

  const normalizeVault = (raw) => {
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((i) => ({
        setId: String(i.setId || ""),
        productId: String(i.productId || ""),
        qty: Math.max(0, Math.floor(Number(i.qty) || 0)),
        firstAt: Number(i.firstAt) || 0,
        lastAt: Number(i.lastAt) || 0,
      }))
      .filter((i) => i.setId && i.productId && i.qty > 0);
    return { items, kept: Math.max(0, Math.floor(Number(raw?.kept) || items.reduce((sum, i) => sum + i.qty, 0))) };
  };

  // ---- Reading the vault ------------------------------------------------------
  function rows() {
    const list = vault.items.map((item) => {
      const offer = deps.offerFor(item.setId, item.productId);
      const set = deps.getSet(item.setId);
      const known = set && set.id === item.setId ? set : null;
      const catalogName = SEALED_PRODUCTS.find((p) => p.id === item.productId)?.name;
      return {
        ...item,
        key: `${item.setId}/${item.productId}`,
        offer,
        set: known,
        sellable: Boolean(offer),
        name: offer?.name || catalogName || item.productId.replace(/[-_]+/g, " "),
        price: Number(offer?.price) || 0,
        packs: packsInOffer(offer),
      };
    });
    // Newest set first, the way the collection lists sets; unknown sets last.
    const order = new Map();
    for (const row of list) if (!order.has(row.setId)) order.set(row.setId, releaseTime(row.set));
    return list.sort(
      (a, b) =>
        order.get(b.setId) - order.get(a.setId) ||
        (a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0) ||
        Number(b.sellable) - Number(a.sellable) ||
        b.price - a.price
    );
  }

  /** The most of one product a single open can take. */
  const maxPick = (row) => {
    let n = Math.min(row.qty, ORDER_LIMITS.maxQtyPerLine);
    if (row.packs > 0) n = Math.min(n, Math.floor(ORDER_LIMITS.maxOpenPacks / row.packs));
    return Math.max(1, n);
  };
  const pickFor = (row) => Math.min(maxPick(row), Math.max(1, picks.get(row.key) || maxPick(row)));

  /**
   * What "Open all" sends: product lines in the order shown, each as many as fit
   * under the limits of one open (packs, copies of a product, kinds, products).
   */
  function planAll(list) {
    const items = [];
    let packs = 0;
    let products = 0;
    let total = 0;
    for (const row of list) {
      if (!row.sellable) continue;
      total += row.qty;
      let take = Math.min(row.qty, ORDER_LIMITS.maxQtyPerLine, ORDER_LIMITS.maxProducts - products);
      if (row.packs > 0) take = Math.min(take, Math.floor((ORDER_LIMITS.maxOpenPacks - packs) / row.packs));
      if (items.length >= ORDER_LIMITS.maxLines) take = 0;
      if (take < 1) continue;
      items.push({ setId: row.setId, productId: row.productId, qty: take });
      packs += take * row.packs;
      products += take;
    }
    return { items, packs, products, left: total - products };
  }

  // ---- Server ---------------------------------------------------------------------
  const isNetwork = (err) => !err?.status;
  const errorLine = (err) =>
    isNetwork(err) ? "Couldn't reach the server." : err.message || "That didn't work.";

  async function loadVault() {
    const at = ++loadToken;
    phase = loaded ? "ready" : "loading";
    if (!loaded) render();
    try {
      const data = await deps.api("/api/vault");
      if (at !== loadToken) return;
      vault = normalizeVault(data);
      loaded = true;
      phase = "ready";
    } catch (err) {
      if (at !== loadToken) return;
      if (err?.status === 401) phase = "signedout";
      else if (!loaded) phase = "error";
      else notice = { tone: "error", text: `${errorLine(err)} What you see may be out of date.` };
    }
    render();
  }

  /** An order came back (a 200 from the open, or from resuming it): the id is spent. */
  function finish(data, title, remainder = "") {
    pendingStore.clear();
    loadToken += 1; // a list fetched before this open must not overwrite it
    if (data.save) deps.applySave(data.save);
    if (data.vault) {
      vault = normalizeVault(data.vault);
      loaded = true;
      phase = "ready";
    }
    busy = null;
    const packs = Number(data.opened?.totals?.packs) || 0;
    const products = Number(data.opened?.totals?.products) || 0;
    notice = {
      tone: "info",
      text: `${products ? `Opened ${plural(products, "product")}${packs ? ` and ${plural(packs, "pack")}` : ""}.` : "Opened."}${remainder ? ` ${remainder}` : ""}`,
    };
    render();
    if (!data.vault) loadVault();
    if (data.opened) deps.showOpened(data.opened, { title });
  }

  /** The open failed. A 4xx means it did not happen; anything else might have, so the id stays. */
  function failed(err) {
    busy = null;
    if (err?.status === 401) {
      pendingStore.clear();
      phase = "signedout";
    } else if (refused(err)) {
      pendingStore.clear();
      notice = { tone: "error", text: `${errorLine(err)} Nothing was opened.` };
      loadVault(); // counts on screen may be what made it fail
    } else {
      notice = {
        tone: "error",
        retry: true,
        text: `${errorLine(err)} Your open is saved, so trying again can't open anything twice.`,
      };
    }
    render();
  }

  /** Ask what became of an open we never heard back from. */
  async function settle(pending) {
    try {
      const data = await deps.api(`/api/orders/${encodeURIComponent(pending.requestId)}`);
      finish(data, pending.title || "Opened from your sealed collection", pending.remainder || "");
      return "done";
    } catch (err) {
      if (err?.status === 404) {
        pendingStore.clear(); // it never happened
        return "clear";
      }
      if (err?.status === 401) {
        pendingStore.clear();
        phase = "signedout";
        return "clear";
      }
      notice = {
        tone: "error",
        retry: true,
        text: `${errorLine(err)} An earlier open is still waiting to finish, and nothing is lost.`,
      };
      return "waiting";
    }
  }

  /** Send one attempt. The id was saved before this, and stays saved until a 200. */
  async function send({ requestId, items, title, remainder }) {
    try {
      const data = await deps.api("/api/vault/open", { method: "POST", body: JSON.stringify({ requestId, items }) });
      finish(data, title, remainder);
    } catch (err) {
      failed(err);
    }
  }

  async function open(items, { title, remainder = "", key }) {
    if (busy || !items.length) return;
    busy = { key };
    notice = null;
    const pending = pendingStore.read();
    let requestId = "";
    if (pending && itemsKey(pending.items) === itemsKey(items)) {
      requestId = pending.requestId; // the same attempt again: the Worker replays it
    } else if (pending) {
      // Something earlier is unanswered. Settle it first so two opens are never in flight.
      render();
      const result = await settle(pending);
      if (result !== "clear") {
        busy = null;
        render();
        return;
      }
      loadToken += 1;
    }
    if (!requestId) requestId = newRequestId();
    const attempt = { requestId, items, title, remainder, at: Date.now() };
    pendingStore.write(attempt);
    render();
    await send(attempt);
  }

  /** Try the saved open again with its own id. */
  async function retry() {
    if (busy) return;
    const pending = pendingStore.read();
    if (!pending) {
      notice = null;
      loadVault();
      return;
    }
    busy = { key: "retry" };
    notice = null;
    render();
    await send(pending);
  }

  // ---- Pieces ---------------------------------------------------------------------
  const coinText = (n) => `✦ ${deps.coin(n)}`;

  function tabsHtml(active = "cards") {
    const n = active === "sealed" && loaded ? vault.kept : keptNow();
    const tab = (id, href, label, count) =>
      `<a class="vt-tab${active === id ? " on" : ""}" href="${href}"${active === id ? ' aria-current="page"' : ""}>${label}${
        count > 0 ? ` <span class="vt-tab-n">(${count})</span>` : ""
      }</a>`;
    return `<nav class="vt-tabs" aria-label="Your collection">${tab("cards", "/bulk", "Cards", 0)}${tab("sealed", "/bulk/sealed", "Sealed", n)}</nav>`;
  }

  function art(row) {
    const image = deps.productImage(row.setId, row.productId);
    const set = row.set;
    const wraps = set?.wrappers?.length ? [0, 1, 2].map((i) => set.wrappers[i % set.wrappers.length]) : [];
    const standard = SEALED_PRODUCTS.some((p) => p.id === row.productId);
    // A box with a photo shows it; boxes and bundles, which have none, show their packs
    // (as the shop does), and so does a standard product beside its photo.
    const stack = wraps.length && (!image || standard);
    return `<div class="vt-stage${image ? "" : " no-box"}${stack ? "" : " no-stack"}" aria-hidden="true">
      ${image ? `<img class="vt-box" src="${esc(image)}" alt="" loading="lazy" decoding="async" />` : ""}
      ${stack ? `<div class="vt-stack">${wraps.map((w) => `<span>${deps.packPicture(w, " ", set)}</span>`).join("")}</div>` : ""}
    </div>`;
  }

  function tile(row, { only }) {
    const working = Boolean(busy);
    const n = pickFor(row);
    const max = maxPick(row);
    const label = (key, text) => (busy?.key === key ? "Opening" : text);
    const worth = row.sellable ? `<span class="vt-coin">${coinText(row.price * row.qty)}</span> total` : "";
    const actions = !row.sellable
      ? `<p class="vt-gone">No longer sold, so it can't be opened.</p>`
      : `<div class="vt-actions">
          <button type="button" class="${only ? "solid" : "ghost"}" data-vt-open="${esc(row.key)}" ${working ? "disabled" : ""}>${label(`one:${row.key}`, "Open 1")}</button>
          ${
            max > 1
              ? `<div class="vt-many">
                  <div class="vt-step" role="group" aria-label="How many ${esc(row.name)} to open">
                    <button type="button" class="vt-step-btn" data-vt-step="-1" aria-label="One fewer" ${working || n <= 1 ? "disabled" : ""}>−</button>
                    <input class="vt-step-n" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${n}" aria-label="How many to open" ${working ? "disabled" : ""} />
                    <button type="button" class="vt-step-btn" data-vt-step="1" aria-label="One more" ${working || n >= max ? "disabled" : ""}>+</button>
                  </div>
                  <button type="button" class="ghost vt-open-n" data-vt-openn="${esc(row.key)}" ${working ? "disabled" : ""}>${label(`many:${row.key}`, `Open ${n}`)}</button>
                </div>`
              : ""
          }
        </div>`;
    return `<article class="vt-tile${row.sellable ? "" : " is-gone"}" data-vt-tile="${esc(row.key)}">
      ${art(row)}
      <div class="vt-copy">
        <h3>${esc(row.name)}</h3>
        <p class="vt-count"><b>x ${row.qty}</b>${row.packs ? ` <span>${plural(row.packs, "pack")} each</span>` : ""}</p>
        <p class="vt-worth">${row.sellable ? `<span class="vt-coin">${coinText(row.price)}</span> each<br />` : ""}${worth}</p>
      </div>
      ${actions}
    </article>`;
  }

  const skeleton = () =>
    `<div class="vt-grid" aria-hidden="true">${[0, 1, 2]
      .map(() => `<div class="vt-tile vt-skel"><i class="vt-skel-art"></i><i class="vt-skel-line"></i><i class="vt-skel-line short"></i></div>`)
      .join("")}</div>`;

  const noticeHtml = () =>
    notice
      ? `<div class="vt-notice ${notice.tone === "error" ? "is-error" : ""}" role="${notice.tone === "error" ? "alert" : "status"}">
          <p>${esc(notice.text)}</p>
          ${notice.retry ? `<button type="button" class="ghost sm" data-vt-retry ${busy ? "disabled" : ""}>${busy?.key === "retry" ? "Trying" : "Try again"}</button>` : ""}
        </div>`
      : "";

  function head(list) {
    const sold = list.filter((r) => r.sellable);
    const products = list.reduce((sum, r) => sum + r.qty, 0);
    const value = sold.reduce((sum, r) => sum + r.price * r.qty, 0);
    const gone = list.length - sold.length;
    const figures =
      phase === "ready" && list.length
        ? `<div class="vt-figures">
            <div class="vt-figure"><b>${products}</b><span>${products === 1 ? "Product" : "Products"} sealed</span></div>
            <div class="vt-figure"><span class="pill gold vt-value" title="What these sell for at market today">${coinText(value)}</span><span>Market value</span></div>
          </div>
          ${gone ? `<p class="vt-fine">${plural(gone, "product")} no longer sold, so ${gone === 1 ? "it is" : "they are"} not counted.</p>` : ""}`
        : "";
    return `<header class="vt-head">
      <h1 class="page-title">Sealed collection</h1>
      <p class="vt-lede">Boxes, ETBs and bundles you kept sealed. Open them whenever you like and they give what they would have at checkout.</p>
      ${figures}
    </header>`;
  }

  function allBar(list) {
    const sold = list.filter((r) => r.sellable);
    const total = sold.reduce((sum, r) => sum + r.qty, 0);
    if (total < 2) return "";
    const plan = planAll(list);
    const capped = plan.left > 0;
    const summary = capped
      ? `One open takes up to ${ORDER_LIMITS.maxOpenPacks} packs, so this opens ${plural(plan.products, "product")} (${plural(plan.packs, "pack")}) in the order shown and ${plan.left} stay sealed for the next open.`
      : `Opens all ${plural(plan.products, "product")}${plan.packs ? ` and ${plural(plan.packs, "pack")}` : ""} at once.`;
    return `<div class="vt-all">
      <button type="button" class="solid" data-vt-all ${busy ? "disabled" : ""}>${busy?.key === "all" ? "Opening" : "Open all"}</button>
      <p>${esc(summary)}</p>
    </div>`;
  }

  function sections(list) {
    const only = list.filter((r) => r.sellable).reduce((sum, r) => sum + r.qty, 0) === 1;
    const groups = [];
    for (const row of list) {
      const last = groups[groups.length - 1];
      if (last && last.setId === row.setId) last.rows.push(row);
      else groups.push({ setId: row.setId, set: row.set, rows: [row] });
    }
    return groups
      .map((g) => {
        const worth = g.rows.reduce((sum, r) => sum + (r.sellable ? r.price * r.qty : 0), 0);
        const count = g.rows.reduce((sum, r) => sum + r.qty, 0);
        return `<section class="vt-set" aria-label="${esc(g.set?.name || g.setId)}">
          <h2 class="vt-set-h">${esc(g.set?.name || g.setId)} <span>${plural(count, "product")}${worth ? `, ${coinText(worth)}` : ""}</span></h2>
          <div class="vt-grid">${g.rows.map((r) => tile(r, { only })).join("")}</div>
        </section>`;
      })
      .join("");
  }

  function body(list) {
    if (!signedIn() || phase === "signedout") {
      return `<div class="need-account"><p>Your sealed collection lives on your account. Sign in to see what you have kept.</p>
        <div class="account-hero-actions"><button class="solid" type="button" data-vt-signin>Sign in</button></div></div>`;
    }
    if (phase === "loading" || phase === "idle") return skeleton();
    if (phase === "error") {
      return `<div class="vt-state"><p>Couldn't load your sealed collection.</p>
        <button type="button" class="ghost" data-vt-reload>Try again</button></div>`;
    }
    if (!list.length) {
      return `<div class="vt-state vt-empty">
        <b>Nothing sealed yet</b>
        <p>When you check out, choose Keep sealed on a product and it waits here until you want to open it.</p>
        <a class="solid" href="/packs">Shop for sealed product</a>
      </div>`;
    }
    return `${allBar(list)}${sections(list)}`;
  }

  function render() {
    if (!root) return;
    const list = signedIn() && phase === "ready" ? rows() : [];
    // Keep a focused stepper field focused across a redraw.
    const focus = root.querySelector(".vt-step-n:focus")?.closest("[data-vt-tile]")?.dataset.vtTile;
    root.innerHTML = `<div class="vt-page" ${busy ? 'aria-busy="true"' : ""}>
      ${tabsHtml("sealed")}
      ${head(list)}
      ${noticeHtml()}
      ${body(list)}
    </div>`;
    if (focus) root.querySelector(`[data-vt-tile="${CSS.escape(focus)}"] .vt-step-n`)?.focus();
  }

  // ---- Actions --------------------------------------------------------------------
  const rowFor = (key) => rows().find((r) => r.key === key);
  const nameFor = (row, n) => (n === 1 ? `Opened ${row.name}` : `Opened ${n} ${row.name}`);

  function openRow(key, n, mode) {
    const row = rowFor(key);
    if (!row || !row.sellable) return;
    const qty = Math.min(n, maxPick(row));
    open([{ setId: row.setId, productId: row.productId, qty }], {
      title: nameFor(row, qty),
      key: `${mode}:${key}`,
    });
  }

  function openAll() {
    const plan = planAll(rows());
    if (!plan.items.length) return;
    open(plan.items, {
      title: "Opened from your sealed collection",
      key: "all",
      remainder: plan.left > 0 ? `${plural(plan.left, "product")} stay sealed. Open all again to continue.` : "",
    });
  }

  /** Move a tile's stepper without redrawing it (a redraw would drop the keyboard). */
  function setPick(tileEl, value) {
    const row = rowFor(tileEl.dataset.vtTile);
    if (!row) return;
    const max = maxPick(row);
    const n = Math.min(max, Math.max(1, Math.floor(Number(value)) || 1));
    picks.set(row.key, n);
    const input = tileEl.querySelector(".vt-step-n");
    if (input && input.value !== String(n)) input.value = String(n);
    const [down, up] = tileEl.querySelectorAll(".vt-step-btn");
    if (down) down.disabled = n <= 1;
    if (up) up.disabled = n >= max;
    const go = tileEl.querySelector("[data-vt-openn]");
    if (go && go.textContent !== `Open ${n}`) go.textContent = `Open ${n}`;
  }

  root?.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-vt-signin]")) return void deps.signIn();
    if (t.closest("[data-vt-reload]")) return void loadVault();
    if (t.closest("[data-vt-retry]")) return void retry();
    if (t.closest("[data-vt-all]")) return void openAll();
    const one = t.closest("[data-vt-open]");
    if (one) return void openRow(one.dataset.vtOpen, 1, "one");
    const many = t.closest("[data-vt-openn]");
    if (many) {
      // The field may still hold a typed number that has not been settled yet.
      const tileEl = many.closest("[data-vt-tile]");
      setPick(tileEl, tileEl.querySelector(".vt-step-n")?.value);
      return void openRow(many.dataset.vtOpenn, picks.get(many.dataset.vtOpenn) || 1, "many");
    }
    const step = t.closest("[data-vt-step]");
    if (step) {
      const tileEl = step.closest("[data-vt-tile]");
      const row = rowFor(tileEl.dataset.vtTile);
      if (row) setPick(tileEl, pickFor(row) + Number(step.dataset.vtStep));
    }
  });
  root?.addEventListener("input", (e) => {
    const field = e.target.closest(".vt-step-n");
    if (!field) return;
    const digits = field.value.replace(/\D/g, "").slice(0, 3);
    if (digits !== field.value) field.value = digits;
    // Settle the number on blur or Enter; while typing only keep the label honest.
    const row = rowFor(field.closest("[data-vt-tile]").dataset.vtTile);
    const n = Math.min(row ? maxPick(row) : 1, Math.max(1, Number(digits) || 1));
    const go = field.closest("[data-vt-tile]").querySelector("[data-vt-openn]");
    if (go && !busy && go.textContent !== `Open ${n}`) go.textContent = `Open ${n}`;
  });
  root?.addEventListener("focusout", (e) => {
    const field = e.target.closest?.(".vt-step-n");
    if (field) setPick(field.closest("[data-vt-tile]"), field.value);
  });
  root?.addEventListener("keydown", (e) => {
    const field = e.target.closest?.(".vt-step-n");
    if (!field || e.key !== "Enter") return;
    e.preventDefault();
    const tileEl = field.closest("[data-vt-tile]");
    setPick(tileEl, field.value);
    if (!busy) openRow(tileEl.dataset.vtTile, picks.get(tileEl.dataset.vtTile) || 1, "many");
  });

  // ---- Page ---------------------------------------------------------------------
  return {
    async show() {
      notice = null;
      if (!signedIn()) {
        phase = "signedout";
        loaded = false;
        vault = { items: [], kept: 0 };
        render();
        return;
      }
      phase = loaded ? "ready" : "loading";
      render();
      const pending = pendingStore.read();
      if (pending && !busy) {
        busy = { key: "retry" };
        render();
        const result = await settle(pending);
        if (result === "done") return;
        busy = null;
      }
      if (phase === "signedout") return render();
      await loadVault();
    },
    hide() {},
    tabsHtml,
  };
}
