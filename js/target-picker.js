/* The target picker: a sheet where a player chooses what to go for in the
   Upgrader, any card of any set or any sealed product, and sees their odds on
   every tile. One tap picks and the sheet closes; there is no confirm step.

   A card can be aimed at raw or as a graded slab, any grade 1 to 10 or a Black Label: the grade words under the
   sort row. A grade re-prices every card (its graded value, never under the raw price: js/upgrader-rules.js
   slabTargetValue), and that index is built the first time the grade is asked for and kept.

   It only chooses. The Worker values the target, checks the odds and rolls
   (worker/upgrader.js); the figures here come from the shared rules in
   js/upgrader-rules.js so the badge and the dial can never disagree.

   The card list is every card of every set (tens of thousands of rows), so the
   work is arranged to keep a keystroke cheap: each row is wrapped once when
   the list loads (cents, a lowercase search string, the hit flag), the wrapped
   lists are sorted once, and a query is one pass over a sorted array. Only the
   60 tiles on screen are ever turned into HTML, as one string. */
import { esc, coins, icon, plural, slabTileHTML } from "./casino-kit.js";
import { RARITY_LABEL, ALL_SETS } from "./catalog.js";
import { isHit } from "./engine.js";
import { coinAmount } from "./money.js?v=1";
import { GRADES } from "./grading-rules.js";
import { upgradeChance, chanceText, multiplierText, slabTargetValue } from "./upgrader-rules.js?v=3";

const PAGE = 60;
const DEBOUNCE_MS = 80;
/** A jump: a target the player wins at most this often (millionths). Above it is a small step. */
const JUMP_MAX = 500000;
const count = (n) => Number(n).toLocaleString("en-US");
const cents = (value) => Math.round(Number(value) * 100);
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const SETS = new Map(ALL_SETS.map((s) => [s.id, { name: s.name || s.id, short: s.short || s.name || s.id }]));
const setOf = (id) => SETS.get(id) || { name: String(id || ""), short: String(id || "") };

/** One card row wrapped for searching and sorting. `r` is the caller's row, untouched. */
function wrapCard(r) {
  const set = setOf(r.setId);
  const number = String(r.number ?? "");
  return {
    r, cents: cents(r.value), hit: isHit(r), num: number.toLowerCase(),
    key: `${r.name}\n${set.name}\n${r.setId}`.toLowerCase(),
    sub: number ? `${number} ${set.short}` : set.short,
  };
}

function wrapSealed(r) {
  const set = setOf(r.setId);
  return {
    r, cents: cents(r.value), hit: false, num: "",
    key: `${r.name}\n${r.short || ""}\n${set.name}\n${r.setId}`.toLowerCase(),
    sub: set.short,
  };
}

/** Wrapped rows plus their two orders. Value order is built up front; name order the first time it is asked for. */
function indexOf(rows, wrap) {
  const items = rows.map(wrap);
  const byName = (a, b) => collator.compare(a.r.name, b.r.name) || a.cents - b.cents;
  const asc = [...items].sort((a, b) => a.cents - b.cents || collator.compare(a.r.name, b.r.name));
  let named = null;
  return { size: items.length, asc, names: () => (named ||= [...items].sort(byName)) };
}

/** The grade words: the raw card, a grade 1 to 10, and a Black Label (a 10 with four perfect subgrades). */
const GRADE_KEYS = ["raw", ...GRADES.map(String), "bl"];
const gradeWord = (key) => (key === "raw" ? "Raw" : key === "bl" ? "Black Label" : key);
/** A key as the Worker's pieces: { grade, blackLabel }, null for the raw card. */
const gradeOf = (key) => (key === "raw" ? null : key === "bl" ? { grade: 10, blackLabel: true } : { grade: Number(key), blackLabel: false });
/** The rows of a raw index re-priced as slabs of one grade, indexed like the raw list. Built once per list and grade. */
const graded = new WeakMap();
function gradeIndex(raw, key) {
  let byKey = graded.get(raw);
  if (!byKey) graded.set(raw, (byKey = new Map()));
  if (!byKey.has(key)) {
    const g = gradeOf(key);
    byKey.set(key, indexOf(raw.asc.map((w) => ({
      ...w.r, grade: g.grade, blackLabel: g.blackLabel, rawValue: w.r.value,
      value: slabTargetValue(w.r.value, w.r.id, g.grade, g.blackLabel),
    })), wrapCard));
  }
  return byKey.get(key);
}

export function createTargetPicker({ allCards, sealedTargets }) {
  let root = null;
  let state = null;
  let returnFocus = null;
  let timer = 0;
  // Loaded lists survive closing: opening again is instant. `refresh` forgets them.
  const lists = { card: null, sealed: null };
  const loaded = { card: null, sealed: null };

  const close = () => {
    if (!root) return;
    clearTimeout(timer);
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

  /** Load a list once; a failed load is forgotten so the next try fetches again. */
  function load(kind, force) {
    if (force || !lists[kind]) {
      const fetcher = kind === "card" ? allCards : sealedTargets;
      const wrap = kind === "card" ? wrapCard : wrapSealed;
      const promise = Promise.resolve()
        .then(fetcher)
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : [];
          // An empty answer (the catalog has not landed yet) is shown but never kept: the next open asks again.
          if (!list.length && lists[kind] === promise) { lists[kind] = null; loaded[kind] = null; }
          return indexOf(list, wrap);
        });
      lists[kind] = promise;
      loaded[kind] = null;
      promise.then((index) => { if (lists[kind] === promise && index.size) loaded[kind] = index; }, () => {});
      promise.catch(() => { if (lists[kind] === promise) lists[kind] = null; });
    }
    return lists[kind];
  }

  /** Odds for one row against the stake: millionths, 0 when out of reach. */
  const chanceFor = (w) => (state.stake > 0 ? upgradeChance(state.stake, w.cents) : 0);

  /** The rows to show, in order. One pass over a sorted array, no per-row DOM. */
  const rawIndex = () => state.index[state.kind];
  /** The index the player is looking at: the raw list, or the same cards priced as slabs of the chosen grade. */
  const viewIndex = () => {
    const raw = rawIndex();
    return raw && state.kind === "card" && state.grade !== "raw" ? gradeIndex(raw, state.grade) : raw;
  };
  function refilter() {
    const index = viewIndex();
    if (!index) { state.view = []; return; }
    const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = state.kind === "card" && state.hits;
    const src = state.sort === "name" ? index.names() : index.asc;
    const pass = (w) => {
      if (hits && !w.hit) return false;
      for (let t = 0; t < tokens.length; t++) if (!w.key.includes(tokens[t]) && w.num !== tokens[t]) return false;
      return true;
    };
    const out = [];
    if (state.sort === "name") {
      for (let i = 0; i < src.length; i++) if (pass(src[i])) out.push(src[i]);
    } else if (state.sort === "value") {
      for (let i = src.length - 1; i >= 0; i--) if (pass(src[i])) out.push(src[i]);
    } else {
      // Next step: the nearest jumps first (chance 50% or less, cheapest first), then the near-certain small steps,
      // then targets too far to roll for, then the ones not above the stake.
      const jump = []; const small = []; const far = []; const below = [];
      const stake = state.stake;
      for (let i = 0; i < src.length; i++) {
        const w = src[i];
        if (!pass(w)) continue;
        if (stake <= 0) { jump.push(w); continue; }
        if (w.cents <= stake) { below.push(w); continue; }
        const ch = chanceFor(w);
        if (ch < 1) far.push(w);
        else if (ch <= JUMP_MAX) jump.push(w);
        else small.push(w);
      }
      for (let i = below.length - 1; i >= 0; i--) far.push(below[i]);
      state.view = jump.concat(small, far);
      return;
    }
    state.view = out;
  }

  function tileHTML(w, k) {
    const r = w.r;
    const ch = chanceFor(w);
    const live = ch >= 1;
    const far = state.stake > 0 && !live;
    const on = state.current && state.current.kind === (r.kind || "card") && state.current.id === r.id && state.current.setId === r.setId
      && (state.current.grade || 0) === (r.grade || 0) && Boolean(state.current.blackLabel) === Boolean(r.blackLabel);
    const slab = state.kind === "card" && r.grade;
    const slabName = slab ? `RIP ${r.grade}${r.blackLabel ? " Black Label" : ""}, ` : "";
    const odds = live ? chanceText(ch) : "-";
    const label = `${slabName}${r.name}${state.kind === "card" && RARITY_LABEL[r.rarity] ? `, ${RARITY_LABEL[r.rarity]}` : ""}, ${coins(r.value)} coins, ${live ? `${chanceText(ch)} chance` : state.stake > 0 ? "out of reach" : "no stake yet"}`;
    const art = slab
      ? slabTileHTML({ grade: r.grade, blackLabel: r.blackLabel, small: r.small || r.image }, "tile")
      : state.kind === "card"
      ? `<img src="${esc(r.small || r.image)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="tp-photo"><img src="${esc(r.image || r.small || "")}" alt="" loading="lazy" decoding="async" /></span>`;
    return `<div class="cs-pick tp-pick${state.kind === "sealed" ? " tp-sealed" : ""}${slab ? " tp-slab" : ""}${on ? " is-on" : ""}${far ? " is-far" : ""}">
      <button class="cs-pick-art" type="button" data-k="${k}" aria-label="${esc(`Pick ${label}`)}"${on ? ' aria-current="true"' : ""}>${art}</button>
      <span class="cs-pick-name">${esc(r.name)}</span>
      <span class="tp-sub">${esc(w.sub)}${state.kind === "sealed" && r.packs ? `, ${plural(r.packs, "pack")}` : ""}</span>
      <span class="tp-meta"><b class="tp-val">${coins(r.value)}</b><span class="tp-odds">${odds}</span></span>
    </div>`;
  }

  const moreHTML = () => {
    const left = state.view.length - state.shown;
    return left > 0 ? `<button class="cs-more" type="button" data-more>Show ${Math.min(PAGE, left)} more of ${count(left)}</button>` : "";
  };

  function emptyText() {
    if (state.kind === "sealed") return state.query.trim() ? "No sealed product matches that." : "No sealed products are on sale right now.";
    if (state.hits && state.query.trim()) return "No hit matches that.";
    return state.query.trim() ? "No card matches that." : state.hits ? "No hits to show." : "No cards to show.";
  }

  /** Repaint the whole grid for a new query, sort or tab. */
  function paintGrid() {
    const grid = root.querySelector(".tp-grid");
    grid.scrollTop = 0;
    if (!rawIndex()) {
      grid.innerHTML = state.failed[state.kind]
        ? `<p class="cs-empty">Couldn't load them. Close this and try again.</p>`
        : `<p class="cs-empty">Loading ${state.kind === "card" ? "cards" : "sealed products"}.</p>`;
      return;
    }
    const shown = state.view.slice(0, state.shown);
    const parts = new Array(shown.length);
    for (let i = 0; i < shown.length; i++) parts[i] = tileHTML(shown[i], i);
    grid.innerHTML = shown.length ? parts.join("") + moreHTML() : `<p class="cs-empty">${emptyText()}</p>`;
  }

  /** Show more appends the next page and leaves the tiles above it, and the scroll, alone. */
  function appendPage() {
    const grid = root.querySelector(".tp-grid");
    grid.querySelector("[data-more]")?.remove();
    const from = state.shown;
    state.shown = Math.min(state.view.length, from + PAGE);
    const parts = [];
    for (let i = from; i < state.shown; i++) parts.push(tileHTML(state.view[i], i));
    grid.insertAdjacentHTML("beforeend", parts.join("") + moreHTML());
  }

  /** Query, sort or tab changed: filter, sort, paint. Marks the time it took for the tests. */
  function update() {
    performance.mark?.("tp:start");
    state.shown = PAGE;
    refilter();
    paintGrid();
    performance.mark?.("tp:end");
    try {
      performance.clearMeasures?.("tp:update");
      performance.measure?.("tp:update", "tp:start", "tp:end");
      performance.clearMarks?.("tp:start"); performance.clearMarks?.("tp:end");
    } catch { /* marks are optional */ }
  }

  function paintTools() {
    const card = state.kind === "card";
    root.querySelectorAll("[data-kind]").forEach((b) => b.classList.toggle("on", b.dataset.kind === state.kind));
    root.querySelectorAll("[data-sort]").forEach((b) => { b.classList.toggle("on", b.dataset.sort === state.sort); b.setAttribute("aria-pressed", String(b.dataset.sort === state.sort)); });
    const grades = root.querySelector(".tp-grades");
    grades.hidden = !card;
    grades.querySelectorAll("[data-grade]").forEach((b) => { b.classList.toggle("on", b.dataset.grade === state.grade); b.setAttribute("aria-pressed", String(b.dataset.grade === state.grade)); });
    // The words scroll sideways on a phone: bring the chosen one (Black Label sits past the edge) into view without scrolling the sheet.
    const words = grades.querySelector(".tp-grade-words"); const on = words.querySelector(".on");
    if (on && words.scrollWidth > words.clientWidth) words.scrollLeft = Math.max(0, on.offsetLeft - words.clientWidth + on.offsetWidth + 24);
    const hits = root.querySelector("[data-hits]");
    hits.hidden = !card;
    hits.classList.toggle("on", state.hits);
    hits.setAttribute("aria-pressed", String(state.hits));
    const search = root.querySelector(".cs-search input");
    search.placeholder = card ? "Search cards, numbers, sets" : "Search sealed products or sets";
    search.setAttribute("aria-label", search.placeholder);
  }

  function paintFoot() {
    const foot = root.querySelector(".tp-foot");
    const cur = state.current;
    if (!cur) { foot.hidden = true; return; }
    const target = cents(cur.value);
    const ch = state.stake > 0 ? upgradeChance(state.stake, target) : 0;
    const tail = ch >= 1 ? `, ${chanceText(ch)} for ${multiplierText(state.stake, target)}` : state.stake > 0 ? ", out of reach" : "";
    foot.hidden = false;
    foot.firstElementChild.textContent = `Current: ${cur.grade ? `RIP ${cur.grade}${cur.blackLabel ? " Black Label" : ""} ` : ""}${cur.name}${tail}`;
  }

  function paintLede() {
    const lede = root.querySelector(".tp-lede");
    lede.innerHTML = state.stake > 0
      ? `<span class="tp-full">Anything worth more than your stake, raw or graded. </span><span class="tp-yours">Your stake <b>${coinAmount(state.stake / 100)}</b></span>`
      : `<span class="tp-need">Put up cards first to see your odds.</span>`;
  }

  /** Make sure the list for the current tab is in; paint when it lands. */
  async function ensureList(force) {
    const kind = state.kind;
    if (state.index[kind] && !force) return;
    state.failed[kind] = false;
    update();
    try {
      const index = await load(kind, force);
      if (!root) return;
      state.index[kind] = index;
      // Build the by-name order while the player is looking, so the Name word is instant when they get to it.
      (globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 400)))(() => index.names(), { timeout: 2000 });
    } catch {
      if (!root) return;
      state.failed[kind] = true;
    }
    if (state.kind === kind) update();
  }

  function pick(k) {
    const w = state.view[k];
    if (!w) return;
    const r = w.r;
    const target = state.kind === "sealed"
      ? r
      : { kind: "card", id: r.id, setId: r.setId, name: r.name, number: r.number, rarity: r.rarity, image: r.image, small: r.small, value: r.value,
          ...(r.grade ? { grade: r.grade, blackLabel: Boolean(r.blackLabel) } : {}) };
    const onPick = state.onPick;
    try { onPick?.(target); } finally { close(); }
  }

  async function open(opts = {}) {
    close();
    returnFocus = document.activeElement;
    const stake = Math.max(0, Math.round(Number(opts.stakeCents) || 0));
    const current = opts.current || null;
    if (opts.refresh) { lists.card = lists.sealed = loaded.card = loaded.sealed = null; }
    state = {
      stake, current, onPick: opts.onPick,
      kind: current?.kind === "sealed" ? "sealed" : "card",
      // With no stake there is nothing to rank by odds, so lead with the dearest.
      grade: current?.grade ? (current.blackLabel ? "bl" : String(current.grade)) : "raw",
      sort: stake > 0 ? "step" : "value", hits: false, query: "", shown: PAGE,
      index: { card: loaded.card, sealed: loaded.sealed }, view: [], failed: { card: false, sealed: false },
    };
    root = document.createElement("div");
    root.className = "cs-sheet-wrap";
    root.innerHTML = `<div class="cs-scrim" data-close></div>
      <section class="cs-sheet tp-sheet" role="dialog" aria-modal="true" aria-labelledby="tp-title" tabindex="-1">
        <header class="cs-sheet-head">
          <div><h2 id="tp-title">Pick a target</h2><p class="tp-lede"></p></div>
          <button class="cs-x" type="button" data-close aria-label="Close">${icon("close")}</button>
        </header>
        <div class="cs-tools">
          <label class="cs-search">${icon("search")}<input type="search" inputmode="search" autocomplete="off" enterkeyhint="search" /></label>
          <div class="cs-seg" role="group" aria-label="What to go for">
            <button type="button" data-kind="card">Cards</button><button type="button" data-kind="sealed">Sealed</button>
          </div>
          <div class="cs-tool-row tp-grades" role="group" aria-label="Grade">
            <span class="tp-grade-label">Grade</span>
            <span class="cs-words tp-grade-words">${GRADE_KEYS.map((key) => `<button type="button" data-grade="${key}" aria-pressed="false">${gradeWord(key)}</button>`).join("")}</span>
          </div>
          <div class="cs-tool-row tp-row">
            <span class="cs-words" role="group" aria-label="Sort">
              <button type="button" data-sort="step">Next step</button><button type="button" data-sort="value">Highest value</button><button type="button" data-sort="name">Name</button>
            </span>
            <span class="cs-words tp-filter"><button type="button" data-hits aria-pressed="false">Hits only</button></span>
          </div>
        </div>
        <div class="cs-grid tp-grid" tabindex="-1"></div>
        <footer class="cs-sheet-foot tp-foot" hidden><p></p></footer>
      </section>`;
    document.body.append(root);
    document.body.classList.add("cs-locked");
    document.addEventListener("keydown", onKey, true);
    paintLede();
    paintTools();
    paintFoot();

    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      const art = e.target.closest("[data-k]");
      if (art) return pick(Number(art.dataset.k));
      if (e.target.closest("[data-more]")) return appendPage();
      const grade = e.target.closest("[data-grade]");
      if (grade) {
        if (grade.dataset.grade === state.grade) return;
        state.grade = grade.dataset.grade;
        paintTools();
        update();
        return;
      }
      const kind = e.target.closest("[data-kind]");
      if (kind) {
        if (kind.dataset.kind === state.kind) return;
        state.kind = kind.dataset.kind;
        paintTools();
        if (state.index[state.kind]) update(); else ensureList(false);
        return;
      }
      const sort = e.target.closest("[data-sort]");
      if (sort) { state.sort = sort.dataset.sort; paintTools(); update(); return; }
      if (e.target.closest("[data-hits]")) { state.hits = !state.hits; paintTools(); update(); }
    });
    const search = root.querySelector(".cs-search input");
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.query = search.value; update(); }, DEBOUNCE_MS);
    });
    search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      clearTimeout(timer);
      state.query = search.value;
      update();
      search.blur();
    });
    root.querySelector(".tp-sheet").focus({ preventScroll: true });

    if (state.index[state.kind]) update();
    else await ensureList(false);
  }

  return { open, close, isOpen: () => Boolean(root) };
}
