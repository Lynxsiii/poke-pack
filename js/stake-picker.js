/* The stake picker: a sheet where a player chooses which of their cards, and
   which of their graded slabs, to put on the table. Used by every casino game.
   It only builds a list of { id, qty } for cards and a list of slab ids; the
   Worker checks ownership, prices everything and moves it.

   Slabs are unique (one row each), so a slab tile is a toggle with no stepper.
   A slab counts at its graded value, the figure the Worker freezes at stake time.
   onConfirm(cards, totalCoins, choices, slabIds).

   Two modes. Free: "put up cards", showing the window a challenger may match.
   Match: a target window (min..max coins) the total has to land in, with an
   auto-fill that reaches it from duplicates first. */
import { esc, coins, icon, plural } from "./casino-kit.js";
import { matchWindow, COINFLIP_RULES, JACKPOT_RULES } from "./casino-rules.js";
import { slabHTML, gradeWord } from "./slab.js?v=1";

const PAGE = 60;
const SLAB_PAGE = 30;
/** Most slabs one stake may hold; the Worker and the triggers enforce the same number. */
const MAX_SLABS = Math.min(COINFLIP_RULES.maxSlabs ?? 10, JACKPOT_RULES.maxSlabs ?? 10);
/** Different cards one stake may hold: read from the shared rules, never hardcoded (the Worker enforces the same). */
const MAX_CARDS = Math.min(COINFLIP_RULES.maxCards ?? 100, JACKPOT_RULES.maxCards ?? 100);
const cents = (coinsValue) => Math.round(Number(coinsValue) * 100);
const count = (n) => Number(n).toLocaleString("en-US");

/** Cards to reach `target` cents inside [min, max]: biggest that fit first, then small ones to close the gap. */
export function autoFill(entries, target, min, max, poolOf, maxCards = MAX_CARDS) {
  const pool = entries
    .map((e) => ({ id: e.id, cents: cents(e.value), avail: poolOf(e) }))
    .filter((e) => e.cents > 0 && e.avail > 0)
    .sort((a, b) => b.cents - a.cents);
  const picked = new Map();
  let total = 0;
  const take = (e, n) => {
    if (n <= 0) return;
    if (!picked.has(e.id) && picked.size >= maxCards) return;
    picked.set(e.id, (picked.get(e.id) || 0) + n);
    e.avail -= n;
    total += n * e.cents;
  };
  for (const e of pool) {
    const fit = Math.min(e.avail, Math.floor((max - total) / e.cents));
    if (fit > 0 && total + e.cents <= target) take(e, Math.min(fit, Math.floor((target - total) / e.cents)));
  }
  // Close the gap with the cheapest cards that keep it under max.
  // One step per card (never one copy at a time): a stack of 9999 stays instant.
  for (const e of [...pool].reverse()) {
    if (total >= min) break;
    take(e, Math.min(e.avail, Math.ceil((min - total) / e.cents), Math.floor((max - total) / e.cents)));
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
    return sum + slabCents();
  };
  const copies = () => [...state.picked.values()].reduce((n, q) => n + q, 0);
  const slabCents = () => {
    let sum = 0;
    for (const id of state.pickedSlabs) sum += cents(state.slabById.get(id)?.value || 0);
    return sum;
  };
  const slabCount = () => state.pickedSlabs.size;
  const hasSlabs = () => state.slabs.length > 0;
  const capped = () => slabCount() >= state.maxSlabs;
  const stakeWords = (n, s) => (s ? (n ? `${plural(n, "card")}, ${plural(s, "slab")}` : plural(s, "slab")) : plural(n, "card"));

  function listed() {
    const q = state.query.trim().toLowerCase();
    let list = state.entries;
    if (state.scope === "graded") list = [];
    else if (state.scope === "dupes") list = list.filter((e) => e.owned > 1);
    else if (state.scope === "picked") list = list.filter((e) => state.picked.has(e.id));
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || String(e.number).toLowerCase() === q || e.id === q);
    return [...list].sort(state.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }

  function listedSlabs() {
    if (state.scope !== "graded" && state.scope !== "picked") return [];
    const q = state.query.trim().toLowerCase();
    let list = state.slabs;
    if (state.scope === "picked") list = list.filter((e) => state.pickedSlabs.has(String(e.id)));
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || String(e.number).toLowerCase() === q || e.cert.toLowerCase().includes(q) || String(e.cardId || "").toLowerCase() === q);
    return [...list].sort(state.sort === "name" ? (a, b) => a.name.localeCompare(b.name) || b.grade - a.grade : (a, b) => b.value - a.value || b.grade - a.grade || a.name.localeCompare(b.name));
  }

  /** A slab as one flat tile: the real slab frame (js/slab.js, grid size) around the card's picture. */
  function slabTile(e) {
    const on = state.pickedSlabs.has(String(e.id));
    const blocked = !on && capped();
    const face = `<span class="cs-slabface"><img src="${esc(e.small || e.image)}" alt="" loading="lazy" decoding="async" /></span>`;
    const label = `${e.name}, RIP ${e.grade} ${gradeWord(e.grade)}${e.reverse ? ", reverse holo" : ""}${e.guard ? ", guarded" : ""}, ${coins(e.value)} coins`;
    return `<div class="cs-pick cs-slabtile${on ? " is-on" : ""}${blocked ? " is-capped" : ""}" data-slabtile="${esc(e.id)}">
      <button class="cs-slabtile-art" type="button" data-slabpick="${esc(e.id)}" aria-pressed="${on}" aria-label="${esc(on ? `Take out ${label}` : `Put up ${label}`)}" ${blocked ? "disabled" : ""}>
        ${slabHTML({ face, card: { name: e.name, number: e.number, rarity: e.rarity }, slab: { id: e.id, cert: e.cert, grade: e.grade, reverse: e.reverse, guard: e.guard }, size: "grid" })}
        ${on ? `<b class="cs-pick-badge cs-slab-check" aria-hidden="true">${icon("check")}</b>` : ""}
      </button>
      <span class="cs-pick-name">${esc(e.name)}</span>
      <span class="cs-pick-meta"><span class="cs-slab-cert">${esc(e.cert)}</span><b>${coins(e.value)}</b></span>
      ${e.reverse ? `<span class="cs-slab-rev">Reverse holo</span>` : ""}
    </div>`;
  }

  /** One quiet line above the slabs; the cap line only shows once the cap is reached. */
  function slabNote() {
    return `<p class="cs-slabnote">The winner takes the slab. A guard stays with you if the slab is lost.<b ${capped() ? "" : "hidden"}> That is the most slabs one stake can hold (${state.maxSlabs}).</b></p>`;
  }

  function tile(e) {
    const on = state.picked.get(e.id) || 0;
    const max = availOf(e);
    return `<div class="cs-pick${on ? " is-on" : ""}" data-id="${esc(e.id)}">
      <button class="cs-pick-art" type="button" data-add="${esc(e.id)}" aria-label="Add ${esc(e.name)}">
        <img src="${esc(e.small || e.image)}" alt="" loading="lazy" decoding="async" />
        ${on ? `<b class="cs-pick-badge">${count(on)}</b>` : ""}
      </button>
      <span class="cs-pick-name">${esc(e.name)}</span>
      <span class="cs-pick-meta"><span>${e.owned > 1 ? `Own ${count(e.owned)}` : "Own 1"}</span><b>${coins(e.value)}</b></span>
      ${
        on
          ? `<span class="cs-step"><button type="button" data-less="${esc(e.id)}" aria-label="Remove one ${esc(e.name)}">${icon("minus")}</button><output>${count(on)}</output><button type="button" data-add="${esc(e.id)}" aria-label="Add one ${esc(e.name)}" ${on >= e.owned ? "disabled" : ""}>${icon("plus")}</button></span>`
          : `<span class="cs-pick-hint">${max > 1 ? `Up to ${count(max)}` : ""}</span>`
      }
    </div>`;
  }

  function paintGrid() {
    const cardList = listed();
    const slabList = listedSlabs();
    const list = [...cardList, ...slabList];
    const limit = state.scope === "graded" ? SLAB_PAGE : PAGE;
    const cardsShown = cardList.slice(0, state.shown);
    const slabsShown = state.scope === "graded" ? slabList.slice(0, state.shown) : slabList;
    const more = cardList.length - cardsShown.length + slabList.length - slabsShown.length;
    const grid = root.querySelector(".cs-grid");
    grid.classList.toggle("is-slabs", state.scope === "graded");
    if (state.loading) grid.innerHTML = `<p class="cs-empty">Loading your cards.</p>`;
    else if (!list.length) {
      grid.innerHTML = `<p class="cs-empty">${
        state.scope === "graded"
          ? state.query
            ? "No slab matches that."
            : "No graded cards yet. Send one to RIP Grading and it can be put up here."
          : state.scope === "dupes"
          ? "No duplicates to put up. Switch to Everything to use single copies."
          : state.scope === "picked"
            ? "Nothing picked yet."
            : state.query
              ? "No card matches that."
              : "You have no cards yet. Open some packs first."
      }</p>`;
    } else {
      const noteAt = state.scope === "graded" || slabList.length ? slabNote() : "";
      grid.innerHTML = cardsShown.map(tile).join("") + noteAt + slabsShown.map(slabTile).join("") +
        (more > 0 ? `<button class="cs-more" type="button" data-more>Show ${Math.min(limit, more)} more of ${more}</button>` : "");
    }
  }

  function paintMeter() {
    const total = totalCents();
    const t = state.target;
    const meter = root.querySelector(".cs-meter");
    const n = copies();
    const s = slabCount();
    const fig = `<b>${coins(total / 100)}</b><span>${stakeWords(n, s)}</span>`;
    const slabHint = t && hasSlabs() ? `<p class="cs-meter-hint">Slabs count at graded value.</p>` : "";
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
        }</p>${slabHint}`;
    } else {
      meter.dataset.state = total ? "in" : "low";
      const w = total ? matchWindow(total) : null;
      meter.innerHTML = `<div class="cs-meter-fig">${fig}</div>
        <p class="cs-meter-note">${state.hint ? state.hint(total / 100) : w ? `A challenger can match between ${coins(w.min / 100)} and ${coins(w.max / 100)}.` : hasSlabs() ? `Tap cards or slabs to put them up. They leave your collection until the ${state.noun} is over.` : `Tap cards to put them up. The cards leave your collection until the ${state.noun} is over.`}</p>`;
    }
    const ok = t ? total >= cents(t.min) && total <= cents(t.max) : total >= (state.minValue || 10);
    const btn = root.querySelector("[data-confirm]");
    btn.disabled = !ok || state.busy;
    btn.innerHTML = state.busy ? state.busyLabel || "Working" : state.confirmLabel(total / 100, n, s);
    root.querySelector("[data-fill]")?.toggleAttribute("hidden", !t);
    root.querySelector("[data-clear]")?.toggleAttribute("hidden", !n && !s);
    const pickedSeg = root.querySelector('[data-scope="picked"]');
    if (pickedSeg) pickedSeg.textContent = n + s ? `Picked (${count(n + s)})` : "Picked";
  }

  function paintTools() {
    root.querySelectorAll("[data-scope]").forEach((b) => b.classList.toggle("on", b.dataset.scope === state.scope));
    root.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === state.sort));
    root.querySelector('[data-scope="graded"]')?.toggleAttribute("hidden", !hasSlabs());
    const search = root.querySelector(".cs-search input");
    if (search) search.placeholder = state.scope === "graded" ? "Search your slabs" : "Search your cards";
  }

  const setError = (msg) => {
    const el = root.querySelector(".cs-error");
    el.textContent = msg || "";
    el.hidden = !msg;
  };

  function change(id, delta) {
    const entry = state.byId.get(id);
    if (!entry) return;
    if (delta > 0 && !state.picked.has(id) && state.picked.size >= MAX_CARDS) {
      setError(`One stake can hold ${MAX_CARDS} different cards. Take one out to add this.`);
      return;
    }
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

  /** Put a slab up or take it back. Only this tile, the cap state of its neighbours and the meter change. */
  function toggleSlab(id) {
    const entry = state.slabById.get(id);
    if (!entry) return;
    if (state.pickedSlabs.has(id)) state.pickedSlabs.delete(id);
    else if (capped()) return;
    else state.pickedSlabs.add(id);
    setError("");
    if (state.scope === "picked") paintGrid();
    else {
      const el = root.querySelector(`.cs-slabtile[data-slabtile="${CSS.escape(id)}"]`);
      if (el) {
        const hadFocus = el.contains(document.activeElement);
        const holder = document.createElement("div");
        holder.innerHTML = slabTile(entry);
        const next = holder.firstElementChild;
        el.replaceWith(next);
        if (hadFocus) next.querySelector("[data-slabpick]")?.focus({ preventScroll: true });
      }
      // The cap changes which of the other slabs can still be added.
      root.querySelectorAll(".cs-slabtile").forEach((t) => {
        const on = state.pickedSlabs.has(t.dataset.slabtile);
        t.classList.toggle("is-capped", !on && capped());
        t.querySelector("[data-slabpick]").disabled = !on && capped();
      });
      const note = root.querySelector(".cs-slabnote b");
      if (note) note.hidden = !capped();
    }
    paintMeter();
  }

  async function confirm() {
    if (state.busy) return;
    state.busy = true;
    paintMeter();
    setError("");
    try {
      await state.onConfirm([...state.picked].map(([id, qty]) => ({ id, qty })), totalCents() / 100, { ...state.choices }, [...state.pickedSlabs].map((id) => state.slabById.get(id).id));
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
    // Cards only. Slabs already picked stay, and the cards close the rest of the gap.
    const held = slabCents();
    const target = cents(t.value ?? (t.min + t.max) / 2) - held;
    const attempt = (poolOf) => autoFill(state.entries, target, cents(t.min) - held, cents(t.max) - held, poolOf);
    let out = attempt((e) => Math.max(0, e.owned - 1));
    if (!out.ok) out = attempt((e) => e.owned);
    state.picked = out.picked;
    state.shown = PAGE;
    paintTools();
    paintGrid();
    paintMeter();
    setError(out.ok ? "" : held ? "Your picks can't reach that exactly. Adjust them by hand." : "Your cards can't reach that exactly. Adjust the picks by hand.");
  }

  async function open(opts) {
    close();
    returnFocus = document.activeElement;
    state = {
      target: opts.target || null, minValue: opts.minValue || 10, confirmLabel: opts.confirmLabel || (() => "Confirm"),
      busyLabel: opts.busyLabel, onConfirm: opts.onConfirm, hint: opts.hint || null, noun: opts.noun || "flip", entries: [], byId: new Map(), picked: new Map(),
      slabs: [], slabById: new Map(), pickedSlabs: new Set(), maxSlabs: Math.max(1, Number(opts.maxSlabs) || MAX_SLABS),
      choices: Object.fromEntries((opts.options || []).map((o) => [o.key, o.value])),
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
          ${(opts.options || []).map((o) => `<div class="cs-opt"><span>${esc(o.label)}</span><div class="cs-seg" role="group" aria-label="${esc(o.label)}" data-option="${esc(o.key)}">${o.values.map((v) => `<button type="button" data-optval="${esc(v)}" class="${String(v) === String(o.value) ? "on" : ""}">${esc(v)}</button>`).join("")}</div></div>`).join("")}
          <label class="cs-search">${icon("search")}<input type="search" inputmode="search" placeholder="Search your cards" autocomplete="off" enterkeyhint="search" /></label>
          <div class="cs-seg" role="group" aria-label="Which cards">
            <button type="button" data-scope="dupes">Duplicates</button><button type="button" data-scope="all">Everything</button><button type="button" data-scope="graded" hidden>Graded</button><button type="button" data-scope="picked">Picked</button>
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
      const slab = e.target.closest("[data-slabpick]");
      if (slab) return toggleSlab(slab.dataset.slabpick);
      const add = e.target.closest("[data-add]");
      if (add) return change(add.dataset.add, 1);
      const less = e.target.closest("[data-less]");
      if (less) return change(less.dataset.less, -1);
      const optval = e.target.closest("[data-optval]");
      if (optval) {
        const group = optval.closest("[data-option]");
        state.choices[group.dataset.option] = optval.dataset.optval;
        group.querySelectorAll("[data-optval]").forEach((b) => b.classList.toggle("on", b === optval));
        return;
      }
      const scope = e.target.closest("[data-scope]");
      if (scope) { state.scope = scope.dataset.scope; state.shown = scope.dataset.scope === "graded" ? SLAB_PAGE : PAGE; paintTools(); paintGrid(); return; }
      const sort = e.target.closest("[data-sort]");
      if (sort) { state.sort = sort.dataset.sort; paintTools(); paintGrid(); return; }
      if (e.target.closest("[data-more]")) { state.shown += state.scope === "graded" ? SLAB_PAGE : PAGE; paintGrid(); return; }
      if (e.target.closest("[data-fill]")) return fill();
      if (e.target.closest("[data-clear]")) { state.picked.clear(); state.pickedSlabs.clear(); paintGrid(); paintMeter(); return; }
      if (e.target.closest("[data-confirm]")) confirm();
    });
    root.querySelector(".cs-search input").addEventListener("input", (e) => {
      state.query = e.target.value;
      state.shown = state.scope === "graded" ? SLAB_PAGE : PAGE;
      paintGrid();
    });
    root.querySelector(".cs-sheet").focus?.();

    let cardsOk = false;
    try {
      const entries = await ctx.ownedCards();
      if (!root) return;
      state.entries = entries;
      state.byId = new Map(entries.map((e) => [e.id, e]));
      if (!entries.some((e) => e.owned > 1)) state.scope = "all";
      state.loading = false;
      cardsOk = true;
      paintTools();
      paintGrid();
      paintMeter();
    } catch {
      if (!root) return;
      state.loading = false;
      root.querySelector(".cs-grid").innerHTML = `<p class="cs-empty">Couldn't load your cards. Close this and try again.</p>`;
    }
    // Slabs load after the cards (the cards call refreshes the save they come from). A failure only hides the Graded choice.
    try {
      const slabs = (await (opts.ownedSlabs ?? ctx.ownedSlabs)?.()) || [];
      if (!root) return;
      state.slabs = slabs.map((s) => ({ ...s, cert: String(s.cert || ""), guard: s.guard || null, reverse: Boolean(s.reverse) })).filter((s) => s.cert && s.value > 0);
      state.slabById = new Map(state.slabs.map((s) => [String(s.id), s]));
      if (cardsOk && !state.entries.length && state.slabs.length && state.scope === "all") { state.scope = "graded"; state.shown = SLAB_PAGE; }
      paintTools();
      if (cardsOk || state.slabs.length) { paintGrid(); paintMeter(); }
    } catch {
      /* no slabs to offer */
    }
  }

  return { open, close, isOpen: () => Boolean(root) };
}
