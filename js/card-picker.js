/* The binder's "Choose a card" sheet: a search box, three filters (set, rarity, type), a sort, and the grid of spare cards.

   The rules are in js/card-picker-rules.js (pure, tested by scripts/test-card-picker.mjs). This file is the screen.
   Typing or choosing a filter repaints only the results under the tools, never the whole binder, so the search box
   keeps its focus and the sheet its scroll position.

   createCardPicker(deps) -> { html, mount, attach, reset }
     deps.esc / deps.coinAmount     the app's escaping and coin formatting
     deps.renderFace(card)          the card's picture as HTML (drawn only near the screen)
     deps.windowFaces(holders, cards, root)   mounts faces as they scroll near (the app's windowFaces)
     deps.setOf / rarityLabel / rarityRank / value   as card-picker-rules.js buildRows
     deps.canFocus()                true when opening may focus the box (a laptop, not a phone's keyboard)
   html(spares) is the dialog, mount(root) wires the faces after it is in the page, attach(root) binds the
   events once, reset() clears the search and filters when a pocket is chosen. */
import { SORTS, buildFacets, buildRows, filterRows, isFiltered } from "./card-picker-rules.js?v=1";

const FILTERS = [
  ["set", "All sets", "Set"],
  ["rarity", "All rarities", "Rarity"],
  ["kind", "All types", "Type"],
];

export function createCardPicker(deps) {
  const { esc, coinAmount } = deps;
  const fresh = (sort = "value") => ({ query: "", set: "", rarity: "", kind: "", sort });
  let st = fresh();
  let rows = [];
  let facets = { sets: [], rarities: [], kinds: [] };
  let shown = [];
  let justOpened = false;
  let filtersOpen = false; // on a phone the three filters fold away under the search box

  const num = (n) => Number(n).toLocaleString();

  function tileHtml({ card, spare, value }, i) {
    return `<button type="button" class="picker-card" data-pick="${esc(card.id)}" title="${esc(card.name)}">
      <span class="picker-face" data-face="${i}"></span>
      <span class="picker-name">${esc(card.name)}</span>
      <span class="picker-meta"><span class="picker-price">${coinAmount(value)}</span>${spare > 1 ? ` · ${spare} spare` : ""}</span>
    </button>`;
  }

  function optionsHtml(key, all) {
    const list = facets[key === "set" ? "sets" : key === "rarity" ? "rarities" : "kinds"];
    return `<option value="">${esc(all)}</option>${list
      .map((o) => `<option value="${esc(o.id)}"${st[key] === o.id ? " selected" : ""}>${esc(o.name)} (${num(o.count)})</option>`)
      .join("")}`;
  }

  const narrowed = () => Boolean(st.set || st.rarity || st.kind);

  function countText() {
    if (!isFiltered(st)) return `${num(rows.length)} card${rows.length === 1 ? "" : "s"}`;
    return `${num(shown.length)} of ${num(rows.length)}`;
  }

  function resultsHtml() {
    if (shown.length) return `<div class="picker-grid">${shown.map(tileHtml).join("")}</div>`;
    return `<div class="picker-none"><p>No spare card matches that.</p>
      <button type="button" class="picker-link" data-picker-clear>Clear search and filters</button></div>`;
  }

  /** Recompute what shows from the current search, filters and sort. */
  function refilter() {
    shown = filterRows(rows, st);
  }

  /** Put the cards under the tools and mount the ones near the screen. */
  function paint(root) {
    const results = root.querySelector("[data-picker-results]");
    if (!results) return;
    refilter();
    results.innerHTML = resultsHtml();
    root.scrollTop = 0; // a new list starts at its first card
    const count = root.querySelector("[data-picker-count]");
    if (count) count.textContent = countText();
    root.querySelector("[data-picker-filters]")?.toggleAttribute("data-active", narrowed());
    const clear = root.querySelector(".picker-clear-x");
    if (clear) clear.hidden = !st.query;
    root.querySelectorAll("[data-picker-sort]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pickerSort === st.sort)));
    deps.windowFaces(
      results.querySelectorAll("[data-face]"),
      shown.map((r) => r.card),
      root
    );
  }

  /** The whole dialog. `spares` is [{ card, spare }] from the binder; empty gives the "nothing to add" line. */
  function html(spares) {
    rows = buildRows(spares, deps);
    facets = buildFacets(rows);
    // A filter for something no longer spare (the card was placed elsewhere) would show an empty sheet.
    if (st.set && !facets.sets.some((o) => o.id === st.set)) st.set = "";
    if (st.rarity && !facets.rarities.some((o) => o.id === st.rarity)) st.rarity = "";
    if (st.kind && !facets.kinds.some((o) => o.id === st.kind)) st.kind = "";
    refilter();
    const head = `<div class="picker-head">
        <h3>Choose a card</h3>
        <button type="button" class="ghost" data-picker-close>Cancel</button>
      </div>`;
    if (!rows.length) {
      return `<div class="picker-backdrop" data-picker-close></div>
    <div class="picker" role="dialog" aria-modal="true" aria-label="Choose a card">
      <div class="picker-top">${head}</div>
      <p class="panel-empty">No spare cards to add. Rip a pack or free one from another pocket.</p>
    </div>`;
    }
    const selects = FILTERS.map(
      ([key, all, label]) => `<label class="picker-select"><span class="picker-select-label">${label}</span>
        <select data-picker-filter="${key}" aria-label="${label}">${optionsHtml(key, all)}</select></label>`
    ).join("");
    const words = SORTS.map(
      ([id, label]) => `<button type="button" data-picker-sort="${id}" aria-pressed="${id === st.sort}">${label}</button>`
    ).join("");
    return `<div class="picker-backdrop" data-picker-close></div>
    <div class="picker" role="dialog" aria-modal="true" aria-label="Choose a card"${filtersOpen ? ' data-filters="open"' : ""}>
      <div class="picker-top">
        ${head}
        <div class="picker-find">
        <label class="picker-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>
          <input type="search" data-picker-q value="${esc(st.query)}" placeholder="Search name, set or number" aria-label="Search your spare cards"
            enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
          <button type="button" class="picker-clear-x" data-picker-clear-q aria-label="Clear search"${st.query ? "" : " hidden"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
          </button>
        </label>
        <button type="button" class="picker-filter-toggle" data-picker-filters aria-expanded="${filtersOpen}" aria-label="Filters"${narrowed() ? " data-active" : ""}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
        </button>
        </div>
      </div>
      <div class="picker-filters">${selects}</div>
      <div class="picker-bar">
        <div class="picker-words" role="group" aria-label="Sort">${words}</div>
        <p class="picker-count" data-picker-count aria-live="polite">${countText()}</p>
      </div>
      <div data-picker-results>${resultsHtml()}</div>
    </div>`;
  }

  /** After the dialog is in the page: mount the faces, and (the first time after a pocket is chosen) give a laptop's keyboard the search box. */
  function mount(root) {
    const picker = root.querySelector(".picker");
    if (!picker) return;
    const results = picker.querySelector("[data-picker-results]");
    if (results)
      deps.windowFaces(
        results.querySelectorAll("[data-face]"),
        shown.map((r) => r.card),
        picker
      );
    if (justOpened && rows.length && deps.canFocus?.()) picker.querySelector("[data-picker-q]")?.focus({ preventScroll: true });
    justOpened = false;
  }

  /** Bind the events once, on the element the binder draws into. */
  function attach(root) {
    const picker = () => root.querySelector(".picker");
    let timer = 0;
    root.addEventListener("input", (e) => {
      const box = e.target.closest?.("[data-picker-q]");
      if (!box) return;
      st.query = box.value;
      clearTimeout(timer);
      timer = setTimeout(() => picker() && paint(picker()), 90);
    });
    root.addEventListener("keydown", (e) => {
      // Search on a phone: the keyboard's button puts the keyboard away so the whole list shows.
      if (e.key === "Enter" && e.target.closest?.("[data-picker-q]")) e.target.blur();
    });
    root.addEventListener("change", (e) => {
      const select = e.target.closest?.("[data-picker-filter]");
      if (!select) return;
      st[select.dataset.pickerFilter] = select.value;
      if (picker()) paint(picker());
    });
    root.addEventListener("click", (e) => {
      const p = picker();
      if (!p || !p.contains(e.target)) return;
      if (e.target.closest("[data-picker-filters]")) {
        filtersOpen = !filtersOpen;
        if (filtersOpen) p.dataset.filters = "open";
        else delete p.dataset.filters;
        p.querySelector("[data-picker-filters]").setAttribute("aria-expanded", String(filtersOpen));
        return;
      }
      const sort = e.target.closest("[data-picker-sort]");
      const clearQ = e.target.closest("[data-picker-clear-q]");
      const clearAll = e.target.closest("[data-picker-clear]");
      if (!sort && !clearQ && !clearAll) return;
      if (sort) st.sort = sort.dataset.pickerSort;
      if (clearQ) st.query = "";
      if (clearAll) st = fresh(st.sort);
      if (clearQ || clearAll) {
        const box = p.querySelector("[data-picker-q]");
        if (box) box.value = st.query;
        p.querySelectorAll("[data-picker-filter]").forEach((s) => (s.value = st[s.dataset.pickerFilter]));
        if (clearQ) box?.focus({ preventScroll: true });
      }
      paint(p);
    });
  }

  /** A pocket was chosen: start from the whole list again (the sort stays). */
  function reset() {
    st = fresh(st.sort);
    filtersOpen = false;
    justOpened = true;
  }

  /** The search box has the focus now (so a repaint of the binder can give it back). */
  function typing(root) {
    const el = document.activeElement;
    if (!el || !root.contains(el) || !el.matches?.("[data-picker-q]")) return null;
    return { start: el.selectionStart, end: el.selectionEnd };
  }
  function restoreTyping(root, caret) {
    const box = root.querySelector("[data-picker-q]");
    if (!box || !caret) return;
    box.focus({ preventScroll: true });
    try {
      box.setSelectionRange(caret.start, caret.end);
    } catch {
      /* a search input may refuse a selection */
    }
  }

  return { html, mount, attach, reset, typing, restoreTyping };
}
