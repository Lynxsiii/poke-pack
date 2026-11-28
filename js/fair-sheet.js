/* "Odds and fairness": the small entry every casino game shows, and the odds blocks the Fairness page reuses.

   fairSheetHTML(gameKey)                  the sheet's markup for one game (js/fair-odds.js GAME_ODDS)
   mountFairButton(el, gameKey, navigate)  puts the button in `el`; it opens the sheet and owns its listeners
   oddsBodyHTML(game), wireOdds(root)      one game's odds block and the listeners its Voltorb picker needs

   Every figure comes from js/fair-odds.js, which reads the rules modules the Worker settles with.
   Styles: css/pages/fair.css (.fr-*). */
import { oddsFor, grassTable } from "./fair-odds.js";
import { GRASS } from "./beta-rules.js";
import { esc, icon } from "./casino-kit.js";

const GRASS_START = 3; // the Voltorb count the table opens on
const GRASS_SHORT = 8; // rows shown before "Show all"

/** A chance as a percentage with as many places as it needs to not read as zero. */
export function pctText(p) {
  const v = p * 100;
  if (v >= 99.995) return "100%";
  if (v >= 10) return `${Number(v.toFixed(1))}%`;
  if (v >= 1) return `${Number(v.toFixed(2))}%`;
  if (v >= 0.01) return `${Number(v.toFixed(3))}%`;
  return `${Number(v.toPrecision(2))}%`;
}
const multText = (m) => `${Number(m).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
const bar = (p) => `<i class="fr-bar" aria-hidden="true"><i style="--f:${Math.max(0.004, Math.min(1, p)).toFixed(4)}"></i></i>`;

/** Tall Grass: the table for one Voltorb count. `all` shows every row. */
function grassRowsHTML(mines, all) {
  const rows = grassTable(mines);
  const shown = all ? rows : rows.slice(0, GRASS_SHORT);
  return `<table class="fr-table">
    <thead><tr><th scope="col">Clear tiles</th><th scope="col">Chance</th><th scope="col">Pays</th></tr></thead>
    <tbody>${shown.map((r) => `<tr><th scope="row">${r.safe}</th><td><span>${pctText(r.chance)}</span>${bar(r.chance)}</td><td>${multText(r.mult)}</td></tr>`).join("")}</tbody>
  </table>${rows.length > GRASS_SHORT ? `<button class="fr-link" type="button" data-fr-grass-all>${all ? "Show fewer" : `Show all ${rows.length} rows`}</button>` : ""}`;
}

function grassHTML(mines = GRASS_START, all = false) {
  return `<div class="fr-grass" data-fr-grass="${mines}"${all ? " data-all" : ""}>
    <div class="fr-step">
      <span class="fr-step-lab" id="fr-volt-lab">Voltorb in the patch</span>
      <span class="fr-step-keys" role="group" aria-labelledby="fr-volt-lab">
        <button type="button" data-fr-grass-step="-1" aria-label="One fewer Voltorb"${mines <= GRASS.minMines ? " disabled" : ""}>${icon("minus")}</button>
        <b aria-live="polite">${mines}</b>
        <button type="button" data-fr-grass-step="1" aria-label="One more Voltorb"${mines >= GRASS.maxMines ? " disabled" : ""}>${icon("plus")}</button>
      </span>
    </div>
    <div class="fr-grass-rows">${grassRowsHTML(mines, all)}</div>
  </div>`;
}

/** One game's odds: how it is decided, what it pays back, its figures, and the long table when it has one. */
export function oddsBodyHTML(game) {
  if (!game) return "";
  return `<div class="fr-odds" data-fr-odds="${esc(game.key)}">
    <p class="fr-how">${esc(game.how)}</p>
    <dl class="fr-facts">
      <div class="is-wide"><dt>Payback</dt><dd>${esc(game.payback)}</dd></div>
      ${game.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
    </dl>
    ${game.key === "grass" ? grassHTML() : ""}
  </div>`;
}

/** Listeners for the odds blocks inside `root` (the Voltorb picker and "Show all"). Call once per container. */
export function wireOdds(root) {
  root.addEventListener("click", (e) => {
    const step = e.target.closest("[data-fr-grass-step]");
    const all = e.target.closest("[data-fr-grass-all]");
    if (!step && !all) return;
    const box = (step || all).closest("[data-fr-grass]");
    if (!box) return;
    let mines = Number(box.dataset.frGrass) || GRASS_START;
    let showAll = box.hasAttribute("data-all");
    if (step) mines = Math.max(GRASS.minMines, Math.min(GRASS.maxMines, mines + Number(step.dataset.frGrassStep)));
    else showAll = !showAll;
    box.dataset.frGrass = String(mines);
    box.toggleAttribute("data-all", showAll);
    box.querySelector(".fr-step-keys b").textContent = String(mines);
    box.querySelector('[data-fr-grass-step="-1"]').disabled = mines <= GRASS.minMines;
    box.querySelector('[data-fr-grass-step="1"]').disabled = mines >= GRASS.maxMines;
    box.querySelector(".fr-grass-rows").innerHTML = grassRowsHTML(mines, showAll);
    if (all) box.querySelector("[data-fr-grass-all]")?.focus();
  });
}

const SEED_LINE = {
  yours: "Decided by your own seed pair. You can change your seed and check every bet.",
  game: "Decided by the game's own seed. Its hash is shown before the game starts and the seed is revealed when it ends.",
};

/** The sheet for one game: its odds, which seed decides it, and the way to the Fairness page. */
export function fairSheetHTML(gameKey) {
  const game = oddsFor(gameKey);
  if (!game) return "";
  return `<div class="fr-sheet-head">
      <h2 id="fr-sheet-title">${esc(game.name)} odds</h2>
      <button class="fr-x" type="button" data-fr-close aria-label="Close">${icon("close")}</button>
    </div>
    <div class="fr-sheet-body">
      ${oddsBodyHTML(game)}
      <p class="fr-seedline">${esc(SEED_LINE[game.seed] || "")}</p>
    </div>
    <div class="fr-sheet-foot"><a class="ghost sm" href="/casino/fair" data-fr-fair>Check a bet on the Fairness page</a></div>`;
}

const SHIELD = `<svg class="bt-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 5 6v5.4c0 4.3 2.9 7.7 7 9.4 4.1-1.7 7-5.1 7-9.4V6z"/><path d="m8.8 12 2.3 2.3 4.1-4.5"/></svg>`;

const mounted = new WeakMap(); // el -> { key, navigate, close }

/**
 * Put the "Odds and fairness" button in `el`. Safe to call again after a repaint or with another game: the element keeps
 * one listener. `navigate(path)` is the casino's own; without it the link is a plain link. Returns `{ open, close }`.
 */
export function mountFairButton(el, gameKey, navigate) {
  if (!el || !oddsFor(gameKey)) return { open() {}, close() {} };
  let state = mounted.get(el);
  if (!state) {
    state = { key: gameKey, navigate, dialog: null };
    mounted.set(el, state);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-fr-open]")) open(el);
    });
  }
  state.key = gameKey;
  state.navigate = navigate;
  el.innerHTML = `<button class="fr-open" type="button" data-fr-open aria-haspopup="dialog">${SHIELD}<span>Odds and fairness</span></button>`;
  return { open: () => open(el), close: () => close(el) };
}

function close(el) {
  const state = mounted.get(el);
  const dialog = state?.dialog;
  if (!dialog) return;
  state.dialog = null;
  if (dialog.open) dialog.close();
  dialog.remove();
  document.body.classList.remove("cs-locked");
  const opener = el.querySelector("[data-fr-open]");
  if (opener?.isConnected) opener.focus({ preventScroll: true });
}

function open(el) {
  const state = mounted.get(el);
  if (!state || state.dialog) return;
  const dialog = document.createElement("dialog");
  dialog.className = "fr-sheet";
  dialog.setAttribute("aria-labelledby", "fr-sheet-title");
  dialog.innerHTML = fairSheetHTML(state.key);
  document.body.append(dialog);
  state.dialog = dialog;
  wireOdds(dialog);
  dialog.addEventListener("click", (e) => {
    // A press on the dim ground lands on the dialog itself, never on something inside it.
    if (e.target === dialog || e.target.closest("[data-fr-close]")) return close(el);
    const link = e.target.closest("[data-fr-fair]");
    if (link && state.navigate && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) {
      e.preventDefault();
      close(el);
      state.navigate(link.getAttribute("href"));
    }
  });
  // Escape: the browser asks to cancel; close our way so focus and the scroll lock are put back.
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(el); });
  dialog.addEventListener("close", () => close(el));
  document.body.classList.add("cs-locked");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  dialog.querySelector("[data-fr-close]")?.focus({ preventScroll: true });
}
