/* The stake picker: a sheet where a player chooses which of their cards to put
   on the table. Used by every casino game. It only builds a list of
   { id, qty }; the Worker checks ownership, prices the cards and moves them.

   Two modes. Free: "put up cards", showing the window a challenger may match.
   Match: a target window (min..max coins) the total has to land in, with an
   auto-fill that reaches it from duplicates first. */
import { esc, coins, icon, plural } from "./casino-kit.js";
import { matchWindow } from "./casino-rules.js";

const PAGE = 60;
const cents = (coinsValue) => Math.round(Number(coinsValue) * 100);

/** Cards to reach `target` cents inside [min, max]: biggest that fit first, then small ones to close the gap. */
export function autoFill(entries, target, min, max, poolOf) {
  const pool = entries
    .map((e) => ({ id: e.id, cents: cents(e.value), avail: poolOf(e) }))
    .filter((e) => e.cents > 0 && e.avail > 0)
    .sort((a, b) => b.cents - a.cents);
  const picked = new Map();
  let total = 0;
  const take = (e, n) => {
    if (n <= 0) return;
    picked.set(e.id, (picked.get(e.id) || 0) + n);
    e.avail -= n;
    total += n * e.cents;
  };
  for (const e of pool) {
    const fit = Math.min(e.avail, Math.floor((max - total) / e.cents));
    if (fit > 0 && total + e.cents <= target) take(e, Math.min(fit, Math.floor((target - total) / e.cents)));
  }
  // Close the gap with the cheapest cards that keep it under max.
  for (const e of [...pool].reverse()) {
    while (total < min && e.avail > 0 && total + e.cents <= max) take(e, 1);
    if (total >= min) break;
  }
  return { picked, total, ok: total >= min && total <= max };
}

export function createStakePicker(ctx) {
  let root = null;
  let state = null;
  let returnFocus = null;

  const close = () => {
    if (!root) return;
    document.removeEventListener("keydown", onKey, true);
    root.remove();
    root = null;
    state = null;
    document.body.classList.remove("cs-locked");
    returnFocus?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const availOf = (entry) => (state.scope === "dupes" ? Math.max(0, entry.owned - 1) : entry.owned);
  const totalCents = () => {
    let sum = 0;
    for (const [id, qty] of state.picked) sum += cents(state.byId.get(id)?.value || 0) * qty;
    return sum;
  };
  const copies = () => [...state.picked.values()].reduce((n, q) => n + q, 0);

  function listed() {
    const q = state.query.trim().toLowerCase();
    let list = state.entries;
    if (state.scope === "dupes") list = list.filter((e) => e.owned > 1);
    else if (state.scope === "picked") list = list.filter((e) => state.picked.has(e.id));
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || String(e.number).toLowerCase() === q || e.id === q);
    return [...list].sort(state.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }

  function tile(e) {
    const on = state.picked.get(e.id) || 0;
    const max = availOf(e);
    return `<div class="cs-pick${on ? " is-on" : ""}" data-id="${esc(e.id)}">
      <button class="cs-pick-art" type="button" data-add="${esc(e.id)}" aria-label="Add ${esc(e.name)}">
        <img src="${esc(e.small || e.image)}" alt="" loading="lazy" decoding="async" />
        ${on ? `<b class="cs-pick-badge">${on}</b>` : ""}
      </button>
      <span class="cs-pick-name">${esc(e.name)}</span>
      <span class="cs-pick-meta"><span>${e.owned > 1 ? `Own ${e.owned}` : "Own 1"}</span><b>${coins(e.value)}</b></span>
      ${
        on
          ? `<span class="cs-step"><button type="button" data-less="${esc(e.id)}" aria-label="Remove one ${esc(e.name)}">${icon("minus")}</button><output>${on}</output><button type="button" data-add="${esc(e.id)}" aria-label="Add one ${esc(e.name)}" ${on >= e.owned ? "disabled" : ""}>${icon("plus")}</button></span>`
          : `<span class="cs-pick-hint">${max > 1 ? `Up to ${max}` : ""}</span>`
      }
    </div>`;
  }

  function paintGrid() {
    const list = listed();
    const shown = list.slice(0, state.shown);
    const grid = root.querySelector(".cs-grid");
    if (state.loading) grid.innerHTML = `<p class="cs-empty">Loading your cards.</p>`;
    else if (!list.length) {
      grid.innerHTML = `<p class="cs-empty">${
        state.scope === "dupes"
          ? "No duplicates to put up. Switch to Everything to use single copies."
          : state.scope === "picked"
            ? "Nothing picked yet."
            : state.query
              ? "No card matches that."
              : "You have no cards yet. Open some packs first."
      }</p>`;
    } else {
      grid.innerHTML = shown.map(tile).join("") +
        (list.length > shown.length ? `<button class="cs-more" type="button" data-more>Show ${Math.min(PAGE, list.length - shown.length)} more of ${list.length - shown.length}</button>` : "");
    }
  }

  function paintMeter() {
    const total = totalCents();
    const t = state.target;
    const meter = root.querySelector(".cs-meter");
    const n = copies();
    const fig = `<b>${coins(total / 100)}</b><span>${plural(n, "card")}</span>`;
    if (t) {
      const lo = cents(t.min); const hi = cents(t.max); const scale = hi * 1.35;
      const at = Math.min(100, (total / scale) * 100);
      const st = total < lo ? "low" : total > hi ? "high" : "in";
      meter.dataset.state = st;
      meter.innerHTML = `<div class="cs-meter-fig">${fig}</div>
        <div class="cs-meter-bar" role="img" aria-label="Stake ${coins(total / 100)} coins, needs ${coins(t.min)} to ${coins(t.max)}">
          <i class="cs-win" style="left:${(lo / scale) * 100}%;width:${((hi - lo) / scale) * 100}%"></i><i class="cs-dot" style="left:${at}%"></i></div>
        <p class="cs-meter-note">${
          st === "in" ? `On the money. Needs ${coins(t.min)} to ${coins(t.max)}.` : st === "low" ? `Add ${coins((lo - total) / 100)} more. Needs ${coins(t.min)} to ${coins(t.max)}.` : `Take out ${coins((total - hi) / 100)}. Needs ${coins(t.min)} to ${coins(t.max)}.`
        }</p>`;
    } else {
      meter.dataset.state = total ? "in" : "low";
      const w = total ? matchWindow(total) : null;
      meter.innerHTML = `<div class="cs-meter-fig">${fig}</div>
        <p class="cs-meter-note">${w ? `A challenger can match between ${coins(w.min / 100)} and ${coins(w.max / 100)}.` : "Tap cards to put them up. The cards leave your collection until the flip is over."}</p>`;
    }
    const ok = t ? total >= cents(t.min) && total <= cents(t.max) : total >= (state.minValue || 10);
    const btn = root.querySelector("[data-confirm]");
    btn.disabled = !ok || state.busy;
    btn.innerHTML = state.busy ? state.busyLabel || "Working" : state.confirmLabel(total / 100, n);
    root.querySelector("[data-fill]")?.toggleAttribute("hidden", !t);
    root.querySelector("[data-clear]")?.toggleAttribute("hidden", !n);
    const pickedSeg = root.querySelector('[data-scope="picked"]');
    if (pickedSeg) pickedSeg.textContent = n ? `Picked (${n})` : "Picked";
  }

  function paintTools() {
    root.querySelectorAll("[data-scope]").forEach((b) => b.classList.toggle("on", b.dataset.scope === state.scope));
    root.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === state.sort));
  }

  const setError = (msg) => {
    const el = root.querySelector(".cs-error");
    el.textContent = msg || "";
    el.hidden = !msg;
  };

  function change(id, delta) {
    const entry = state.byId.get(id);
    if (!entry) return;
    const next = Math.max(0, Math.min(entry.owned, (state.picked.get(id) || 0) + delta));
    if (next) state.picked.set(id, next);
    else state.picked.delete(id);
    setError("");
    // Only this tile and the meter change, so the grid keeps its scroll.
    const el = root.querySelector(`.cs-pick[data-id="${CSS.escape(id)}"]`);
    if (el && state.scope !== "picked") {
      const holder = document.createElement("div");
      holder.innerHTML = tile(entry);
      el.replaceWith(holder.firstElementChild);
    } else paintGrid();
    paintMeter();
  }

  async function confirm() {
    if (state.busy) return;
    state.busy = true;
    paintMeter();
    setError("");
    try {
      await state.onConfirm([...state.picked].map(([id, qty]) => ({ id, qty })), totalCents() / 100);
      close();
    } catch (err) {
      state.busy = false;
      setError(err?.message || "That didn't work. Try again.");
      paintMeter();
    }
  }

  function fill() {
    const t = state.target;
    if (!t) return;
    const target = cents(t.value ?? (t.min + t.max) / 2);
    const attempt = (poolOf) => autoFill(state.entries, target, cents(t.min), cents(t.max), poolOf);
    let out = attempt((e) => Math.max(0, e.owned - 1));
    if (!out.ok) out = attempt((e) => e.owned);
    state.picked = out.picked;
    state.scope = state.scope === "picked" ? "picked" : state.scope;
    state.shown = PAGE;
    paintTools();
    paintGrid();
    paintMeter();
    setError(out.ok ? "" : "Your cards can't reach that exactly. Adjust the picks by hand.");
  }

  async function open(opts) {
    close();
    returnFocus = document.activeElement;
    state = {
      target: opts.target || null, minValue: opts.minValue || 10, confirmLabel: opts.confirmLabel || (() => "Confirm"),
      busyLabel: opts.busyLabel, onConfirm: opts.onConfirm, entries: [], byId: new Map(), picked: new Map(),
      scope: "dupes", sort: "value", query: "", shown: PAGE, loading: true, busy: false,
    };
    root = document.createElement("div");
    root.className = "cs-sheet-wrap";
    root.innerHTML = `<div class="cs-scrim" data-close></div>
      <section class="cs-sheet" role="dialog" aria-modal="true" aria-labelledby="cs-sheet-title">
        <header class="cs-sheet-head">
          <div><h2 id="cs-sheet-title">${esc(opts.title || "Put up cards")}</h2>${opts.lede ? `<p>${esc(opts.lede)}</p>` : ""}</div>
          <button class="cs-x" type="button" data-close aria-label="Close">${icon("close")}</button>
        </header>
        <div class="cs-meter" data-state="low"></div>
        <div class="cs-tools">
          <label class="cs-search">${icon("search")}<input type="search" inputmode="search" placeholder="Search your cards" autocomplete="off" enterkeyhint="search" /></label>
          <div class="cs-seg" role="group" aria-label="Which cards">
            <button type="button" data-scope="dupes">Duplicates</button><button type="button" data-scope="all">Everything</button><button type="button" data-scope="picked">Picked</button>
          </div>
          <div class="cs-tool-row">
            <span class="cs-words" role="group" aria-label="Sort"><button type="button" data-sort="value">Highest value</button><button type="button" data-sort="name">Name</button></span>
            <span class="cs-tool-actions"><button type="button" class="cs-link" data-fill hidden>Fill it for me</button><button type="button" class="cs-link" data-clear hidden>Clear</button></span>
          </div>
        </div>
        <div class="cs-grid" tabindex="-1"></div>
        <footer class="cs-sheet-foot">
          <p class="cs-error" role="alert" hidden></p>
          <button class="cs-go" type="button" data-confirm disabled></button>
        </footer>
      </section>`;
    document.body.append(root);
    document.body.classList.add("cs-locked");
    document.addEventListener("keydown", onKey, true);
    paintTools();
    paintMeter();
    paintGrid();

    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      const add = e.target.closest("[data-add]");
      if (add) return change(add.dataset.add, 1);
      const less = e.target.closest("[data-less]");
      if (less) return change(less.dataset.less, -1);
      const scope = e.target.closest("[data-scope]");
      if (scope) { state.scope = scope.dataset.scope; state.shown = PAGE; paintTools(); paintGrid(); return; }
      const sort = e.target.closest("[data-sort]");
      if (sort) { state.sort = sort.dataset.sort; paintTools(); paintGrid(); return; }
      if (e.target.closest("[data-more]")) { state.shown += PAGE; paintGrid(); return; }
      if (e.target.closest("[data-fill]")) return fill();
      if (e.target.closest("[data-clear]")) { state.picked.clear(); paintGrid(); paintMeter(); return; }
      if (e.target.closest("[data-confirm]")) confirm();
    });
    root.querySelector(".cs-search input").addEventListener("input", (e) => {
      state.query = e.target.value;
      state.shown = PAGE;
      paintGrid();
    });
    root.querySelector(".cs-sheet").focus?.();

    try {
      const entries = await ctx.ownedCards();
      if (!root) return;
      state.entries = entries;
      state.byId = new Map(entries.map((e) => [e.id, e]));
      if (!entries.some((e) => e.owned > 1)) state.scope = "all";
      state.loading = false;
      paintTools();
      paintGrid();
      paintMeter();
    } catch {
      if (!root) return;
      state.loading = false;
      root.querySelector(".cs-grid").innerHTML = `<p class="cs-empty">Couldn't load your cards. Close this and try again.</p>`;
    }
  }

  return { open, close, isOpen: () => Boolean(root) };
}
