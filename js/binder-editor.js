/**
 * The binder customiser: the "choose your cover" counter.
 *
 * A bottom sheet on a phone, a panel beside the live binder on a laptop. Four
 * short tabs (Cover, Colour, Details, Animated) edit a draft look; every
 * choice repaints the real binder through `onDraft`, and nothing is stored
 * until Save. Cancel puts the saved look back. Colours and materials are
 * free; an animated edition can always be tried on, and is bought once with
 * coins (the Worker refuses to save one the account does not own).
 *
 *   const editor = initBinderEditor({ mount, ...deps });
 *   editor.open() / .close() / .isOpen() / .refresh()
 *
 * deps (all plain functions, so the page stays in charge of data and money):
 *   mount            the element the editor fills (hidden until opened)
 *   getLook()        the saved look (any shape; normalised here)
 *   getOwned()       edition ids the account owns
 *   getCoins()       the coin balance
 *   getCards()       the cards on show, for the "Match my cards" swatch
 *   getAccents()     hexes refined from art, aligned with getCards()
 *   onDraft(look)    called with the look being tried (live preview)
 *   onToggle(open)   the editor opened or closed
 *   onTry(editionId) an edition is being tried on (scroll its effect into view)
 *   save(look)       async, throws with a readable message on failure
 *   buy(editionId)   async, throws with a readable message on failure (402 "Not enough coins.")
 *   toast(msg)
 *
 * Needs css/binder/editor.css. Edition thumbnails use `.edition-swatch[data-edition]`
 * from css/binder/editions.css when it is loaded and a flat tile when it is not.
 */
import {
  BINDER_COLORS,
  BINDER_EDITIONS,
  BINDER_HARDWARE,
  BINDER_MATERIALS,
  BINDER_METALS,
  BINDER_NAME_MAX,
  BINDER_PAGES,
  BINDER_POCKETS,
  COLOR_FROM_CARDS,
  DEFAULT_BINDER_LOOK,
  cleanBinderName,
  editionById,
  normalizeBinderLook,
  resolveBinderLook,
} from "./binder-looks.js";
import { dominantAccents } from "./card-accent.js";
import { coinText as coin, coinAmount } from "./money.js?v=1";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const TABS = [
  ["cover", "Cover"],
  ["colour", "Colour"],
  ["details", "Details"],
  ["animated", "Animated"],
];
const HARDWARE_SHORT = { none: "None", rings: "Silver", brass: "Brass", black: "Black", zip: "Zip" };
const HARDWARE_METAL = { rings: "#c9ccd2", brass: "#c9a24a", black: "#1b1b21" };
const HARDWARE_NOTE = {
  none: "The pages sit loose in the cover, like a folder.",
  rings: "Three silver rings hold the pages.",
  brass: "Three brass rings hold the pages.",
  black: "Three black rings hold the pages.",
  zip: "A zip closes the cover around the pages.",
};
const COLOR_NAME = new Map([...BINDER_COLORS, ...BINDER_METALS].map((row) => [row.id, row.name]));

const same = (a, b) => JSON.stringify(normalizeBinderLook(a)) === JSON.stringify(normalizeBinderLook(b));

export function initBinderEditor(deps) {
  const mount = deps.mount;
  if (!mount) return { open() {}, close() {}, isOpen: () => false, refresh() {} };

  let draft = null;
  let saved = null;
  let tab = "cover";
  let moreTrim = false;
  let trimOpen = false;
  let busy = ""; // "save" or an edition id while a request is out
  let problem = "";
  let opener = null;
  let built = false;
  let editionsKey = "";

  const owned = () => new Set(deps.getOwned?.() || []);
  const cards = () => deps.getCards?.() || [];

  /* ---- markup ----------------------------------------------------------- */

  function seg(group, rows, label) {
    return `<div class="be-seg" role="group" aria-label="${esc(label)}">${rows
      .map(
        ([id, text, lead]) =>
          `<button type="button" data-be-${group}="${esc(id)}" aria-pressed="false">${lead || ""}<span>${esc(text)}</span></button>`
      )
      .join("")}</div>`;
  }

  function shellHtml() {
    const tabs = TABS.map(
      ([id, name]) =>
        `<button type="button" role="tab" class="be-tab" id="be-tab-${id}" data-be-tab="${id}" aria-controls="be-panel-${id}" aria-selected="false" tabindex="-1">${name}</button>`
    ).join("");

    const materials = BINDER_MATERIALS.map(
      (row) =>
        `<button type="button" class="be-mat" data-be-material="${esc(row.id)}" aria-pressed="false">
          <span class="be-art" data-material="${esc(row.id)}" aria-hidden="true">${row.id === "classic" ? "<i></i>".repeat(6) : ""}</span>
          <b>${esc(row.name)}</b>
        </button>`
    ).join("");

    const swatches = (attr) =>
      BINDER_COLORS.map(
        (row) =>
          `<button type="button" class="be-sw" ${attr}="${esc(row.id)}" aria-pressed="false" style="--sw:${esc(row.hex)}" aria-label="${esc(row.name)}" title="${esc(row.name)}"></button>`
      ).join("");

    const trimWords = [
      ["auto", "Auto", ""],
      ...BINDER_METALS.map((row) => [row.id, row.name, `<i class="be-chip" style="--sw:${esc(row.hex)}" aria-hidden="true"></i>`]),
    ]
      .map(
        ([id, name, lead]) =>
          `<button type="button" class="be-word" data-be-accent="${esc(id)}" aria-pressed="false">${lead}<span>${esc(name)}</span></button>`
      )
      .join("");

    return `<header class="be-head">
        <h3 id="be-title" tabindex="-1">Customise</h3>
        <div class="be-head-act">
          <button type="button" class="ghost be-cancel" data-be-cancel>Cancel</button>
          <button type="button" class="solid be-save" data-be-save>Save</button>
        </div>
      </header>
      <div class="be-tabs" role="tablist" aria-label="Binder options">${tabs}</div>
      <p class="be-status" role="status" data-be-status></p>
      <div class="be-body">
        <section class="be-panel" role="tabpanel" id="be-panel-cover" aria-labelledby="be-tab-cover" data-panel="cover">
          <div class="be-mats">${materials}</div>
          <p class="be-note" data-be-note="material"></p>
          <label class="be-field">
            <span class="be-label">Name on the plate</span>
            <input type="text" data-be-name maxlength="${BINDER_NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="Eeveelutions" />
            <small data-be-name-help>Up to ${BINDER_NAME_MAX} characters.</small>
          </label>
          <button type="button" class="text-btn be-reset" data-be-reset>Reset to default</button>
        </section>

        <section class="be-panel" role="tabpanel" id="be-panel-colour" aria-labelledby="be-tab-colour" data-panel="colour" hidden>
          <div class="be-line"><h4 class="be-label">Cover colour</h4><output class="be-read" data-be-read="color" aria-live="polite"></output></div>
          <button type="button" class="be-cards" data-be-color="${COLOR_FROM_CARDS}" aria-pressed="false">
            <span class="be-halves" aria-hidden="true"><i data-be-half="a"></i><i data-be-half="b"></i></span>
            <span class="be-cards-text"><b>Match my cards</b><small data-be-cards-note></small></span>
          </button>
          <div class="be-grid" role="group" aria-label="Cover colour">${swatches("data-be-color")}</div>
          <button type="button" class="be-line be-trim" data-be-trim aria-expanded="false" aria-controls="be-trimbox"><span class="be-label">Trim colour</span><output class="be-read" data-be-read="accent"></output></button>
          <div class="be-trimbox" id="be-trimbox" hidden>
            <p class="be-note">Stitching, edges and the plate.</p>
            <div class="be-words" role="group" aria-label="Trim colour">${trimWords}<button type="button" class="be-word" data-be-more aria-expanded="false" aria-controls="be-trim-grid"><span>More colours</span></button></div>
            <div class="be-grid be-grid-trim" id="be-trim-grid" role="group" aria-label="Trim colour, more" hidden>${swatches("data-be-accent")}</div>
          </div>
        </section>

        <section class="be-panel" role="tabpanel" id="be-panel-details" aria-labelledby="be-tab-details" data-panel="details" hidden>
          <div class="be-set">
            <h4 class="be-label">Hardware</h4>
            ${seg(
              "hardware",
              BINDER_HARDWARE.map((row) => [row.id, HARDWARE_SHORT[row.id] || row.name, HARDWARE_METAL[row.id] ? `<i class="be-chip" style="--sw:${HARDWARE_METAL[row.id]}" aria-hidden="true"></i>` : ""]),
              "Hardware"
            )}
            <p class="be-note" data-be-note="hardware"></p>
          </div>
          <div class="be-set">
            <h4 class="be-label">Pockets</h4>
            ${seg("pockets", BINDER_POCKETS.map((row) => [row.id, row.name]), "Pockets")}
            <p class="be-note" data-be-note="pockets"></p>
          </div>
          <div class="be-set">
            <h4 class="be-label">Page tone</h4>
            ${seg("page", BINDER_PAGES.map((row) => [row.id, row.name]), "Page tone")}
            <p class="be-note" data-be-note="page"></p>
          </div>
        </section>

        <section class="be-panel" role="tabpanel" id="be-panel-animated" aria-labelledby="be-tab-animated" data-panel="animated" hidden>
          <div class="be-line"><p class="be-lede">Try any on for free. Buy one to keep it.</p><output class="be-purse" data-be-purse></output></div>
          <div class="be-eds" data-be-eds></div>
        </section>
      </div>
    `;
  }

  function editionsHtml() {
    const have = owned();
    const none = `<div class="be-ed be-ed-none" data-be-ed="">
        <button type="button" class="be-ed-pick" data-be-edition="" aria-pressed="false">
          <span class="be-thumb" aria-hidden="true"></span>
          <b>Still cover</b>
          <small>No animation.</small>
          <span class="be-try" data-be-try></span>
        </button>
      </div>`;
    const rows = BINDER_EDITIONS.map((row) => {
      const mine = have.has(row.id);
      return `<div class="be-ed" data-be-ed="${esc(row.id)}" data-owned="${mine}">
        <button type="button" class="be-ed-pick" data-be-edition="${esc(row.id)}" aria-pressed="false">
          <span class="be-thumb" aria-hidden="true"><span class="edition-swatch" data-edition="${esc(row.id)}"></span></span>
          <b>${esc(row.name)}</b>
          <small>${esc(row.note)}</small>
          <span class="be-try" data-be-try></span>
        </button>
        <div class="be-ed-act">${
          mine
            ? `<span class="be-owned">Owned</span>`
            : `<button type="button" class="be-buy" data-be-buy="${esc(row.id)}">Buy for ${coinAmount(row.price)}</button>`
        }</div>
      </div>`;
    }).join("");
    return none + rows;
  }

  /* ---- paint (never rebuilds what the person is touching) ----------------- */

  const $ = (sel) => mount.querySelector(sel);
  const $$ = (sel) => [...mount.querySelectorAll(sel)];
  const press = (el, on) => el.setAttribute("aria-pressed", on ? "true" : "false");

  function colourName(id) {
    return id === COLOR_FROM_CARDS ? "Match my cards" : COLOR_NAME.get(id) || "";
  }

  function paint() {
    if (!draft) return;
    const look = normalizeBinderLook(draft);
    const classic = look.material === "classic";
    const have = owned();
    const resolved = resolveBinderLook(look, { cards: cards(), accents: deps.getAccents?.() });
    for (const [key, value] of Object.entries(resolved.vars)) mount.style.setProperty(key, value);

    $$("[data-be-tab]").forEach((btn) => {
      const on = btn.dataset.beTab === tab;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle("on", on);
    });
    $$("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });

    $$("[data-be-material]").forEach((btn) => press(btn, btn.dataset.beMaterial === look.material));
    const matNote = BINDER_MATERIALS.find((row) => row.id === look.material)?.note || "";
    $('[data-be-note="material"]').textContent = matNote;

    const nameInput = $("[data-be-name]");
    nameInput.disabled = classic;
    if (document.activeElement !== nameInput) nameInput.value = draft.name || "";
    $("[data-be-name-help]").textContent = classic
      ? "The plate sits on a cover. Pick one above first."
      : `Shows on the cover plate. Up to ${BINDER_NAME_MAX} characters.`;

    // Colour: 24 flat squares, plus the one that follows the cards.
    $$("[data-be-color]").forEach((btn) => press(btn, btn.dataset.beColor === look.color));
    $('[data-be-read="color"]').textContent = colourName(look.color);
    const dom = dominantAccents(cards(), deps.getAccents?.());
    const halves = dom || { a: "#1b1b21", b: "#3a3b42" };
    const cardsBtn = $(".be-cards");
    cardsBtn.style.setProperty("--c1", halves.a);
    cardsBtn.style.setProperty("--c2", halves.b);
    $("[data-be-cards-note]").textContent = dom
      ? "The cover takes the main colour, the trim the second."
      : "Put cards in the binder and the cover follows them.";

    // Trim.
    $$("[data-be-accent]").forEach((btn) => {
      const id = btn.dataset.beAccent;
      if (btn.classList.contains("be-sw")) press(btn, id === look.accent);
      else press(btn, id === look.accent);
    });
    const isColourAccent = COLOR_NAME.has(look.accent) && !BINDER_METALS.some((row) => row.id === look.accent);
    const trimBtn = $("[data-be-trim]");
    trimBtn.setAttribute("aria-expanded", trimOpen ? "true" : "false");
    $("#be-trimbox").hidden = !trimOpen;
    const more = $("[data-be-more]");
    const showMore = moreTrim || isColourAccent;
    more.setAttribute("aria-expanded", showMore ? "true" : "false");
    more.classList.toggle("on", isColourAccent);
    $("#be-trim-grid").hidden = !showMore;
    $('[data-be-read="accent"]').textContent = look.accent === "auto" ? "Auto" : COLOR_NAME.get(look.accent) || "";

    // Fittings.
    $$("[data-be-hardware]").forEach((btn) => {
      press(btn, btn.dataset.beHardware === look.hardware);
      btn.disabled = classic;
    });
    $('[data-be-note="hardware"]').textContent = classic
      ? "Rings and zips need a cover."
      : HARDWARE_NOTE[look.hardware] || "";
    $$("[data-be-pockets]").forEach((btn) => press(btn, btn.dataset.bePockets === look.pockets));
    $('[data-be-note="pockets"]').textContent = BINDER_POCKETS.find((row) => row.id === look.pockets)?.note || "";
    $$("[data-be-page]").forEach((btn) => press(btn, btn.dataset.bePage === look.page));
    $('[data-be-note="page"]').textContent = BINDER_PAGES.find((row) => row.id === look.page)?.note || {
      black: "Near black, so cards pop.",
      cream: "Warm paper, like an archival page.",
      tint: "A deep wash of the cover colour.",
    }[look.page] || "";

    // Animated editions.
    const purse = $("[data-be-purse]");
    purse.innerHTML = coinAmount(deps.getCoins?.() || 0);
    $$("[data-be-ed]").forEach((tile) => {
      const id = tile.dataset.beEd;
      const on = look.edition === id;
      const mine = !id || have.has(id);
      tile.classList.toggle("on", on);
      press(tile.querySelector(".be-ed-pick"), on);
      const tryEl = tile.querySelector("[data-be-try]");
      if (tryEl) tryEl.textContent = on ? (mine ? "In use" : "Trying on") : mine ? "Use" : "Try on";
      const buy = tile.querySelector("[data-be-buy]");
      if (buy) {
        buy.disabled = Boolean(busy);
        buy.innerHTML = busy === id ? "Buying" : `Buy for ${coinAmount(editionById(id)?.price || 0)}`;
      }
    });

    // Save and the line beside it.
    const trial = look.edition && !have.has(look.edition);
    const dirty = !same(look, saved);
    const save = $("[data-be-save]");
    save.disabled = !dirty || Boolean(trial) || Boolean(busy);
    save.textContent = busy === "save" ? "Saving" : "Save";
    const status = $("[data-be-status]");
    status.textContent = problem || (trial ? `${editionById(look.edition)?.name} is a try-on. Buy it to keep it.` : "");
    status.classList.toggle("bad", Boolean(problem));
    $("[data-be-reset]").disabled = same(look, DEFAULT_BINDER_LOOK);
  }

  function emit() {
    paint();
    deps.onDraft?.(normalizeBinderLook(draft));
  }

  /* ---- draft edits ------------------------------------------------------ */

  function pickMaterial(id) {
    draft.material = id;
    if (id === "classic") {
      draft.hardware = "none";
      draft.edition = ""; // an animated cover needs a cover to play on
    } else if (draft.hardware === "none") {
      draft.hardware = "rings";
    }
  }

  function pickEdition(id) {
    draft.edition = id;
    if (id && draft.material === "classic") pickMaterial("matte");
  }

  /** Tell the page an edition is being tried on, so it can bring the part of the cover with the effect into view. */
  function showTry() {
    if (draft?.edition) deps.onTry?.(draft.edition);
  }

  /* ---- events ----------------------------------------------------------- */

  function onClick(e) {
    const t = e.target;
    const btn = t.closest("button");
    if (!btn || !mount.contains(btn)) return;
    if (btn.hasAttribute("data-be-cancel")) return close();
    if (btn.hasAttribute("data-be-save")) return void save();
    if (btn.hasAttribute("data-be-reset")) {
      draft = { ...DEFAULT_BINDER_LOOK };
      problem = "";
      return emit();
    }
    if (btn.dataset.beTab) {
      tab = btn.dataset.beTab;
      paint();
      $(".be-body").scrollTop = 0;
      if (tab === "animated") showTry();
      return;
    }
    if (btn.hasAttribute("data-be-trim")) {
      trimOpen = !trimOpen;
      return paint();
    }
    if (btn.hasAttribute("data-be-more")) {
      moreTrim = !(btn.getAttribute("aria-expanded") === "true");
      return paint();
    }
    if (btn.dataset.beBuy) return void buy(btn.dataset.beBuy);
    problem = "";
    if (btn.dataset.beMaterial) pickMaterial(btn.dataset.beMaterial);
    else if (btn.dataset.beColor) draft.color = btn.dataset.beColor;
    else if (btn.dataset.beAccent) draft.accent = btn.dataset.beAccent;
    else if (btn.dataset.beHardware) draft.hardware = btn.dataset.beHardware;
    else if (btn.dataset.bePockets) draft.pockets = btn.dataset.bePockets;
    else if (btn.dataset.bePage) draft.page = btn.dataset.bePage;
    else if (btn.hasAttribute("data-be-edition")) pickEdition(btn.dataset.beEdition);
    else return;
    emit();
    if (btn.hasAttribute("data-be-edition")) showTry();
  }

  function onInput(e) {
    if (!e.target.matches("[data-be-name]")) return;
    draft.name = e.target.value.slice(0, BINDER_NAME_MAX);
    problem = "";
    emit();
  }

  function onKey(e) {
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      close();
      return;
    }
    const tabBtn = e.target.closest?.("[data-be-tab]");
    if (!tabBtn || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const ids = TABS.map(([id]) => id);
    const at = ids.indexOf(tabBtn.dataset.beTab);
    const to = e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : (at + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
    tab = ids[to];
    paint();
    $(`[data-be-tab="${tab}"]`).focus();
  }

  /* ---- money and saving -------------------------------------------------- */

  async function buy(id) {
    const row = editionById(id);
    if (!row || busy) return;
    const coins = Number(deps.getCoins?.() || 0);
    if (coins + 1e-9 < row.price) {
      problem = `${row.name} costs ${coin(row.price)} coins. You have ${coin(coins)} coins.`;
      return paint();
    }
    busy = id;
    problem = "";
    paint();
    try {
      await deps.buy(id);
      busy = "";
      deps.toast?.(`${row.name} is yours.`);
      // The sheet may have been closed while the purchase was in flight: the edition is bought either way.
      if (draft) {
        pickEdition(id);
        problem = "";
        buildEditions(`[data-be-edition="${id}"]`);
        emit();
        showTry();
      }
    } catch (err) {
      busy = "";
      problem = err?.message || "Couldn't buy that. Try again.";
      paint();
    }
  }

  async function save() {
    if (busy || !draft) return;
    const look = normalizeBinderLook(draft);
    busy = "save";
    problem = "";
    paint();
    try {
      await deps.save(look);
      busy = "";
      saved = look;
      deps.toast?.("Binder look saved.");
      close();
    } catch (err) {
      busy = "";
      problem = err?.message || "Couldn't save the look. Try again.";
      paint();
    }
  }

  /* ---- open and close ----------------------------------------------------- */

  function buildEditions(focusSel) {
    const holder = $("[data-be-eds]");
    if (!holder) return;
    editionsKey = [...owned()].sort().join(",");
    holder.innerHTML = editionsHtml();
    if (focusSel) holder.querySelector(focusSel)?.focus({ preventScroll: true });
  }

  function build() {
    mount.innerHTML = shellHtml();
    mount.classList.add("be");
    mount.setAttribute("role", "dialog");
    mount.setAttribute("aria-labelledby", "be-title");
    buildEditions();
    if (!built) {
      mount.addEventListener("click", onClick);
      mount.addEventListener("input", onInput);
      mount.addEventListener("keydown", onKey);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen() && !mount.contains(document.activeElement)) onKey(e);
      });
      built = true;
    }
  }

  const isOpen = () => !mount.hidden && Boolean(draft);

  function open() {
    if (isOpen()) return;
    saved = normalizeBinderLook(deps.getLook?.());
    draft = { ...saved };
    tab = "cover";
    moreTrim = false;
    trimOpen = false;
    busy = "";
    problem = "";
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    build();
    mount.hidden = false;
    deps.onToggle?.(true);
    paint();
    deps.onDraft?.(normalizeBinderLook(draft));
    $("#be-title")?.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    draft = null;
    mount.hidden = true;
    deps.onToggle?.(false);
    deps.onDraft?.(null);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  }

  /** Ownership, coins or the cards on show changed while the editor is up. */
  function refresh() {
    if (!isOpen()) return;
    if (editionsKey !== [...owned()].sort().join(",")) buildEditions();
    paint();
  }

  return { open, close, isOpen, refresh };
}
