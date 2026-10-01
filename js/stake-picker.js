/* The stake picker: a sheet where a player chooses which of their cards, and
   which of their graded slabs, to put on the table. Used by every casino game.
   It only builds a list of { id, qty } for cards and a list of slab ids; the
   Worker checks ownership, prices everything and moves it.

   Slabs are unique (one row each), so a slab tile is a toggle with no stepper.
   A slab counts at its graded value, the figure the Worker freezes at stake time.
   onConfirm(cards, totalCoins, choices, slabIds).

   Two modes. Free: "put up cards", showing the window a challenger may match.
   Match: a target window (min..max coins) the total has to land in.

   The big figure is a field: type an amount (or tap a quick amount) and the
   cards are filled to it, duplicates first (fillTo). Tapping cards still works
   and the figure is always the real total once you leave the field. */
import { esc, coins, icon, plural } from "./casino-kit.js";
import { matchWindow, COINFLIP_RULES, JACKPOT_RULES } from "./casino-rules.js";
import { slabHTML, gradeWord } from "./slab.js?v=1";

const PAGE = 60;
const SLAB_PAGE = 30;
/** Most slabs one stake may hold; the Worker and the triggers enforce the same number. */
const MAX_SLABS = Math.min(COINFLIP_RULES.maxSlabs ?? 10, JACKPOT_RULES.maxSlabs ?? 10);
/** Different cards one stake may hold: read from the shared rules, never hardcoded (the Worker enforces the same). */
const MAX_CARDS = Math.min(COINFLIP_RULES.maxCards ?? 100, JACKPOT_RULES.maxCards ?? 100);
/** Copies of one card, and copies in a whole stake: the shared rules, so the picker never builds a stake the Worker refuses. */
const MAX_QTY = Math.min(COINFLIP_RULES.maxQty ?? 9999, JACKPOT_RULES.maxQty ?? 9999);
const MAX_COPIES = Math.min(COINFLIP_RULES.maxCopies ?? 100000, JACKPOT_RULES.maxCopies ?? 100000);
const cents = (coinsValue) => Math.round(Number(coinsValue) * 100);
const count = (n) => Number(n).toLocaleString("en-US");

/** Cards to reach `target` cents inside [min, max]: biggest that fit first, then small ones to close the gap. */
export function autoFill(entries, target, min, max, poolOf, maxCards = MAX_CARDS, maxCopies = MAX_COPIES) {
  const pool = entries
    .map((e) => ({ id: e.id, cents: cents(e.value), avail: poolOf(e) }))
    .filter((e) => e.cents > 0 && e.avail > 0)
    .sort((a, b) => b.cents - a.cents);
  const picked = new Map();
  let total = 0;
  let taken = 0;
  const take = (e, n) => {
    n = Math.min(n, maxCopies - taken);
    if (n <= 0) return;
    if (!picked.has(e.id) && picked.size >= maxCards) return;
    taken += n;
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

/** What the player typed, in cents: "1,234.5", "50", " 20 " all work. Anything else (or nothing) is null. */
export function parseAmount(text) {
  const t = String(text ?? "").replace(/[\u2726\s,]/g, "");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return Number.isSafeInteger(c) && c <= 1e14 ? c : null;
}

/**
 * Fill a stake to `target` cents from cards. `held` is what the picked slabs already count for;
 * `window` is the {min, max} (cents, whole stake) the total has to land in, which defaults to the
 * coinflip tolerance around the target. Duplicates first, then single copies, whichever lands in the window;
 * when neither does, the one that gets closest. Returns the cards only: { picked, total, ok, source, reach }
 * where total is the cards' cents and reach is cards plus slabs.
 */
export function fillTo(entries, target, { held = 0, window: win = null, maxCards = MAX_CARDS, maxCopies = MAX_COPIES, maxQty = MAX_QTY } = {}) {
  const w = win || matchWindow(target);
  const goal = target - held;
  if (goal <= 0) return { picked: new Map(), total: 0, ok: held >= w.min && held <= w.max, source: "none", reach: held };
  const attempt = (poolOf) => autoFill(entries, goal, w.min - held, w.max - held, poolOf, maxCards, maxCopies);
  const dupes = attempt((e) => Math.min(maxQty, Math.max(0, e.owned - 1)));
  let out = dupes;
  let source = "dupes";
  if (!dupes.ok) {
    const all = attempt((e) => Math.min(maxQty, e.owned));
    if (all.ok || all.total > dupes.total) { out = all; source = "all"; }
  }
  if (!out.picked.size) source = "none";
  return { picked: out.picked, total: out.total, ok: out.ok, source, reach: out.total + held };
}

export function createStakePicker(ctx) {
  let root = null;
  let state = null;
  let returnFocus = null;

  const close = () => {
    if (!root) return;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", paintAmountsFade);
    root.remove();
    root = null;
    state = null;
    document.body.classList.remove("cs-locked");
    returnFocus?.focus?.({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (state?.dirty) {
        state.dirty = false;
        state.pressing = false;
        root.querySelector(".cs-amount").blur();
        paintMeter();
        return;
      }
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
    const order = state.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.value - a.value || a.name.localeCompare(b.name);
    // Right after a fill the cards it picked sit first, so you see what it did; any scope, sort or search change lets go.
    const pin = state.pinned;
    return [...list].sort(pin ? (a, b) => Number(pin.has(b.id)) - Number(pin.has(a.id)) || order(a, b) : order);
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
    return `<p class="cs-slabnote">${esc(state.slabNote)}<b ${capped() ? "" : "hidden"}> That is the most slabs one stake can hold (${state.maxSlabs}).</b></p>`;
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
          ? `<span class="cs-step"><button type="button" data-less="${esc(e.id)}" aria-label="Remove one ${esc(e.name)}">${icon("minus")}</button><output>${count(on)}</output><button type="button" data-add="${esc(e.id)}" aria-label="Add one ${esc(e.name)}" ${on >= Math.min(e.owned, MAX_QTY) ? "disabled" : ""}>${icon("plus")}</button></span>`
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

  /** The note under the figure: the one place the sheet says what just happened. */
  function noteText(total) {
    const t = state.target;
    if (state.flash) return state.flash;
    if (t) {
      const lo = cents(t.min); const hi = cents(t.max);
      const range = `Needs ${coins(t.min)} to ${coins(t.max)}.`;
      return total < lo ? `Add ${coins((lo - total) / 100)} more. ${range}` : total > hi ? `Take out ${coins((total - hi) / 100)}. ${range}` : `On the money. ${range}`;
    }
    // After a fill: what it did, then the game's own line (the window a challenger may match, or its hint).
    const rule = !total ? "" : state.hint ? state.hint(total / 100) : (() => { const w = matchWindow(total); return `A challenger can match between ${coins(w.min / 100)} and ${coins(w.max / 100)}.`; })();
    if (state.fillNote) return state.fillNote + (rule && !state.bad ? `\n${rule}` : "");
    return total ? rule : "Type an amount, or tap cards.";
  }

  /** The note is plain text (its two lines break on \n); a rejection reads in the loss colour. */
  const clearNote = () => { state.fillNote = state.flash = ""; state.bad = false; };

  /** The figure field shows `text`; the hidden measuring span (data-v) sizes it to its content. */
  function setAmount(text) {
    const input = root.querySelector(".cs-amount");
    input.value = text;
    input.parentElement.dataset.v = text || "0";
  }

  function paintMeter() {
    const total = totalCents();
    const t = state.target;
    const n = copies();
    const s = slabCount();
    const meter = root.querySelector(".cs-meter");
    if (!state.dirty) setAmount(coins(total / 100));
    root.querySelector(".cs-fig-words").textContent = stakeWords(n, s);
    paintFillWord();
    root.querySelector(".cs-amount").disabled = state.busy;
    root.querySelectorAll("[data-amt]").forEach((b) => { b.disabled = state.busy; });
    const bar = root.querySelector(".cs-meter-bar");
    bar.hidden = !t;
    if (t) {
      const lo = cents(t.min); const hi = cents(t.max); const scale = hi * 1.35;
      const at = Math.min(100, (total / scale) * 100);
      meter.dataset.state = total < lo ? "low" : total > hi ? "high" : "in";
      bar.setAttribute("aria-label", `Stake ${coins(total / 100)} coins, needs ${coins(t.min)} to ${coins(t.max)}`);
      const win = bar.querySelector(".cs-win");
      win.style.left = `${(lo / scale) * 100}%`;
      win.style.width = `${((hi - lo) / scale) * 100}%`;
      bar.querySelector(".cs-dot").style.left = `${at}%`;
      // Once the stake is in the window the match tile has done its job and goes quiet.
      root.querySelector('[data-amt="match"]')?.classList.toggle("is-quiet", meter.dataset.state === "in");
    } else meter.dataset.state = total ? "in" : "low";
    const note = root.querySelector(".cs-meter-note");
    note.textContent = noteText(total);
    note.classList.toggle("is-bad", Boolean(state.bad));
    root.querySelector(".cs-meter-hint").hidden = !(t && hasSlabs());
    const ok = t ? total >= cents(t.min) && total <= cents(t.max) : total >= (state.minValue || 10);
    const btn = root.querySelector("[data-confirm]");
    const typed = state.dirty ? parseAmount(root.querySelector(".cs-amount").value) : null;
    if (state.dirty && !state.busy && typed !== totalCents()) {
      // Typed but not filled yet: the big button fills first, so it never confirms a stake the player has not seen.
      btn.disabled = typed == null;
      btn.textContent = typed == null ? state.confirmLabel(total / 100, n, s) : `Fill to ${coins(typed / 100)}`;
    } else {
      btn.disabled = !ok || state.busy;
      btn.innerHTML = state.busy ? state.busyLabel || "Working" : state.confirmLabel(total / 100, n, s);
    }
    root.querySelector("[data-clear]")?.toggleAttribute("hidden", !n && !s);
    const pickedSeg = root.querySelector('[data-scope="picked"]');
    if (pickedSeg) pickedSeg.textContent = n + s ? `Picked (${count(n + s)})` : "Picked";
  }

  /** "Fill" takes the place of the count words while the typed amount differs from the real total. */
  function paintFillWord() {
    const typed = parseAmount(root.querySelector(".cs-amount").value);
    const show = state.dirty && typed !== totalCents();
    root.querySelector("[data-fillamt]").hidden = !show;
    root.querySelector(".cs-fig-words").hidden = show;
  }

  /** The quick row fades at its right edge while there is more to scroll to. */
  function paintAmountsFade() {
    const row = root?.querySelector(".cs-amounts");
    if (row) row.classList.toggle("is-more", row.scrollWidth - row.clientWidth - row.scrollLeft > 4);
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
    const have = state.picked.get(id) || 0;
    let next = Math.max(0, Math.min(entry.owned, MAX_QTY, have + delta));
    if (delta > 0 && copies() - have + next > MAX_COPIES) next = Math.max(0, MAX_COPIES - (copies() - have));
    if (delta > 0 && next <= have) {
      setError(next >= MAX_QTY ? `One stake can hold ${count(MAX_QTY)} copies of a card.` : `One stake can hold ${count(MAX_COPIES)} cards in total.`);
      return;
    }
    if (next) state.picked.set(id, next);
    else state.picked.delete(id);
    clearNote();
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
    clearNote();
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

  /** Everything the player could stake from cards in the scope on screen, in cents (duplicates only on Duplicates). */
  const poolCents = () => state.entries.reduce((sum, e) => sum + cents(e.value) * Math.min(MAX_QTY, state.scope === "dupes" ? Math.max(0, e.owned - 1) : e.owned), 0);

  /** Fill the cards to `want` cents (the whole stake, slabs already picked included) and say how it went. `quiet` (the fill on open) leaves errors to the meter's own note. */
  function runFill(want, { quiet = false } = {}) {
    if (state.loading) { state.pending = () => runFill(want, { quiet }); return; }
    const t = state.target;
    const held = slabCents();
    clearNote();
    if (t && (want < cents(t.min) || want > cents(t.max))) {
      state.flash = `${coins(want / 100)} is outside the window. Needs ${coins(t.min)} to ${coins(t.max)}.`;
      state.bad = true;
      paintMeter();
      return;
    }
    if (want <= 0) {
      state.picked = new Map();
      state.pinned = null;
      state.shown = PAGE;
      setError("");
      paintGrid();
      paintMeter();
      return;
    }
    const out = fillTo(state.entries, want, { held, window: t ? { min: cents(t.min), max: cents(t.max) } : null });
    state.picked = out.picked;
    state.shown = PAGE;
    if (out.source === "all" && state.scope === "dupes") state.scope = "all";
    state.pinned = out.picked.size ? new Set(out.picked.keys()) : null;
    const n = copies();
    const s = slabCount();
    if (!t) {
      if (out.ok) state.fillNote = `${stakeWords(n, s)}${out.source === "dupes" && !s ? " from your duplicates" : ""}.`;
      else if (!n && !state.entries.length) state.fillNote = "You have no cards to put up yet.";
      else {
        state.fillNote = out.reach < want ? `${coins(want / 100)} is more than your ${s ? "picks" : "cards"} reach: ${coins(out.reach / 100)}.` : `Your ${s ? "picks" : "cards"} can't land near ${coins(want / 100)}. They reach ${coins(out.reach / 100)}.`;
        state.bad = true;
      }
    }
    // Match mode already says what is missing in the meter's note; only a real, adjustable miss gets the line under the grid.
    setError(out.ok || !t || quiet || !state.entries.length ? "" : "Your picks can't land in that window exactly. Adjust them by hand.");
    paintTools();
    paintGrid();
    root.querySelector(".cs-grid").scrollTop = 0;
    paintMeter();
  }

  /** Commit what was typed: blank puts the real total back, junk says so, a number fills to it. True when something was filled or refused. */
  function commit() {
    if (!state?.dirty || !root) return false;
    const input = root.querySelector(".cs-amount");
    state.dirty = false;
    const raw = input.value;
    const c = parseAmount(raw);
    if (!raw.trim()) { clearNote(); paintMeter(); return false; }
    if (c == null) { clearNote(); state.flash = "That isn't a number. Try 50 or 12.5."; state.bad = true; paintMeter(); return true; }
    if (c === totalCents()) { clearNote(); paintMeter(); return false; }
    runFill(c);
    return true;
  }

  /** A quick amount: 10, 50, 100, 500 coins, or Half / All of what the scope can stake. */
  function quick(kind, opts) {
    state.dirty = false;
    const field = root?.querySelector(".cs-amount");
    if (field && document.activeElement === field) field.blur();
    if (state.loading) { state.pending = () => quick(kind, opts); return; }
    const base = poolCents() + slabCents();
    if (kind === "match") return runFill(cents(state.target.value ?? (state.target.min + state.target.max) / 2), opts);
    if ((kind === "half" || kind === "all") && !poolCents()) {
      clearNote();
      state.fillNote = state.scope === "dupes" ? "No duplicates to fill from." : "No cards to fill from.";
      return paintMeter();
    }
    if (kind === "half") return runFill(Math.floor(base / 2), opts);
    if (kind === "all") return runFill(base, opts);
    runFill(cents(kind), opts);
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
      slabNote: opts.slabNote || "The winner takes the slab. A guard stays with you if the slab is lost.",
      dirty: false, fillNote: "", flash: "", bad: false, pending: null, pressing: false, pressDirty: false, pinned: null,
    };
    root = document.createElement("div");
    root.className = "cs-sheet-wrap";
    root.innerHTML = `<div class="cs-scrim" data-close></div>
      <section class="cs-sheet" role="dialog" aria-modal="true" aria-labelledby="cs-sheet-title" tabindex="-1">
        <header class="cs-sheet-head">
          <h2 id="cs-sheet-title">${esc(opts.title || "Put up cards")}</h2>
          <button class="cs-x" type="button" data-close aria-label="Close">${icon("close")}</button>
        </header>
        <div class="cs-meter" data-state="low">
          <div class="cs-meter-fig">
            <span class="cs-fig"><span class="cs-fig-field" data-v="0.00"><input class="cs-amount" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${esc(opts.amountLabel || "Stake amount")}" aria-describedby="cs-sheet-note" value="0.00" /></span></span>
            <span class="cs-fig-words"></span>
            <button type="button" class="cs-link cs-fillword" data-fillamt aria-label="Fill cards to the typed amount" hidden>Fill</button>
          </div>
          <div class="cs-amounts" role="group" aria-label="Quick amounts">${
            opts.target
              ? `<button type="button" data-amt="match" aria-label="Fill to the amount to match">Match ${coins(opts.target.value ?? (opts.target.min + opts.target.max) / 2)}</button>`
              : `${[10, 50, 100, 500].map((k) => `<button type="button" class="cs-amt-tile" data-amt="${k}" aria-label="Fill to ${k} coins">${k}</button>`).join("")}<button type="button" class="cs-amt-word" data-amt="half" aria-label="Fill half of what you can stake">Half</button><button type="button" class="cs-amt-word" data-amt="all" aria-label="Fill everything in this tab">All</button>`
          }</div>
          <div class="cs-meter-bar" role="img" hidden><i class="cs-win"></i><i class="cs-dot"></i></div>
          <p class="cs-meter-note" id="cs-sheet-note" aria-live="polite"></p>
          <p class="cs-meter-hint" hidden>Slabs count at graded value.</p>
        </div>
        <div class="cs-tools">
          ${(opts.options || []).map((o) => `<div class="cs-opt"><span>${esc(o.label)}</span><div class="cs-seg" role="group" aria-label="${esc(o.label)}" data-option="${esc(o.key)}">${o.values.map((v) => `<button type="button" data-optval="${esc(v)}" class="${String(v) === String(o.value) ? "on" : ""}">${esc(v)}</button>`).join("")}</div></div>`).join("")}
          <label class="cs-search">${icon("search")}<input type="search" inputmode="search" placeholder="Search your cards" autocomplete="off" enterkeyhint="search" /></label>
          <div class="cs-seg" role="group" aria-label="Which cards">
            <button type="button" data-scope="dupes">Duplicates</button><button type="button" data-scope="all">Everything</button><button type="button" data-scope="graded" hidden>Graded</button><button type="button" data-scope="picked">Picked</button>
          </div>
          <div class="cs-tool-row">
            <span class="cs-words" role="group" aria-label="Sort"><button type="button" data-sort="value">Highest value</button><button type="button" data-sort="name">Name</button></span>
            <button type="button" class="cs-link" data-clear hidden>Clear</button>
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
    paintAmountsFade();

    root.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      // Typed but not committed (a touch screen keeps the field focused): the amount fills first.
      const wasDirty = state.dirty || state.pressDirty;
      state.pressDirty = false;
      if (wasDirty && !e.target.closest(".cs-amount, [data-fillamt], [data-amt]")) {
        commit();
        input.blur();
        // The big button only fills here; a second tap flips what the player can now see.
        if (e.target.closest("[data-confirm]")) return;
      }
      const amt = e.target.closest("[data-amt]");
      if (amt) return quick(amt.dataset.amt === "match" || amt.dataset.amt === "half" || amt.dataset.amt === "all" ? amt.dataset.amt : Number(amt.dataset.amt));
      if (e.target.closest("[data-fillamt]")) { commit(); input.blur(); return; }
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
      if (scope) { state.pinned = null; state.scope = scope.dataset.scope; state.shown = scope.dataset.scope === "graded" ? SLAB_PAGE : PAGE; paintTools(); paintGrid(); return; }
      const sort = e.target.closest("[data-sort]");
      if (sort) { state.pinned = null; state.sort = sort.dataset.sort; paintTools(); paintGrid(); return; }
      if (e.target.closest("[data-more]")) { state.shown += state.scope === "graded" ? SLAB_PAGE : PAGE; paintGrid(); return; }
      if (e.target.closest("[data-clear]")) { state.picked.clear(); state.pickedSlabs.clear(); clearNote(); state.pinned = null; setError(""); paintGrid(); paintMeter(); return; }
      if (e.target.closest("[data-confirm]")) confirm();
    });
    root.querySelector(".cs-search input").addEventListener("input", (e) => {
      state.query = e.target.value;
      state.pinned = null;
      state.shown = state.scope === "graded" ? SLAB_PAGE : PAGE;
      paintGrid();
    });
    const input = root.querySelector(".cs-amount");
    input.addEventListener("focus", () => setTimeout(() => { if (root && !state.dirty && document.activeElement === input) input.setSelectionRange(0, input.value.length); }, 0));
    // A mouse click into the field would drop the caret after the focus handler selected everything: keep the selection once.
    let selectOnUp = false;
    input.addEventListener("mousedown", () => { selectOnUp = document.activeElement !== input; });
    input.addEventListener("mouseup", (e) => { if (selectOnUp) { e.preventDefault(); input.select(); } selectOnUp = false; });
    input.addEventListener("input", () => {
      state.dirty = true;
      input.parentElement.dataset.v = input.value || "0";
      paintFillWord();
      paintMeter();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      commit();
      input.blur();
    });
    // A press on a button or card must not commit (and repaint the grid) before its click lands; the click, or the release, commits.
    input.addEventListener("blur", () => { if (!state?.pressing) commit(); });
    root.addEventListener("pointerdown", (e) => {
      if (state && e.target.closest("button, .cs-pick, [data-close]") && !e.target.closest(".cs-amount")) { state.pressing = true; state.pressDirty = state.dirty; }
    }, true);
    const release = () => setTimeout(() => {
      if (!state) return;
      state.pressing = false;
      if (state.dirty && document.activeElement !== input) commit();
    }, 0);
    root.addEventListener("pointerup", release, true);
    root.addEventListener("pointercancel", release, true);
    // Tapping Fill must not blur the field first (the tile under the finger would move before the tap lands).
    root.querySelector("[data-fillamt]").addEventListener("pointerdown", (e) => e.preventDefault());
    root.querySelector(".cs-amounts").addEventListener("scroll", paintAmountsFade, { passive: true });
    window.addEventListener("resize", paintAmountsFade);
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
      paintAmountsFade();
      // A match opens already filled to the host's value, so matching is one tap. Typing during the load runs after it.
      if (state.pending) state.pending();
      else if (state.target) quick("match", { quiet: true });
      state.pending = null;
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
