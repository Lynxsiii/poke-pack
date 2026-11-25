/* Sleeves and coins: the page at /gear and the pieces other screens borrow.

   Data rules live in js/gear.js (shared with the Worker); the Worker owns what a
   player holds (worker/gear.js). This module only presents it.

   Borrowed by other screens:
     loadGearCatalog()            fetch data/gear.json once
     coinHtml(coin, { side })     a coin as a flippable element (also the house coin)
     sleeveHtml(sleeve)           a sleeve as a card back
     cardBackSrc(gear, fallback)  the picture a face-down card should show
     cardBackHtml(gear, fallback) a face-down card, the equipped sleeve's foil included
     giftHtml(granted, gear)      the "in the box" strip on the opening spread */
import { ALL_SETS } from "./catalog.js";
import { HOUSE_COIN, equippedCoin, equippedSleeve, gearItem, gearPrice, normalizeGear, ownedItems } from "./gear.js?v=2";
import { coinAmount, coinText } from "./money.js?v=2";
import { coinFaceHTML, coinOf, coinStageHTML, flipCoin, glintCoin, tiltCoin } from "./coin.js?v=5";

let catalog = { sleeves: {}, coins: {}, products: {} };

export const getGearCatalog = () => catalog;

export async function loadGearCatalog() {
  try {
    const res = await fetch("data/gear.json", { cache: "no-cache" });
    if (res.ok) catalog = await res.json();
  } catch {
    /* the page works without cosmetics */
  }
  return catalog;
}

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const abs = (path) => {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
};

const clampN = (v) => Math.max(-1, Math.min(1, v)).toFixed(3);

const MATERIALS = { metal: "Metal coin", plastic: "Plastic coin", foil: "Foil coin", unknown: "Coin" };

/**
 * A coin. Small ones (tiles, chips, the gift rows) are flat discs lit like the
 * real thing: the coin's own photo, its holo layer and varnish glare, and the
 * light follows a mouse (css/casino-coin.css). The big ones (`cls` "xl" in the
 * sheet, "lg" in your-coin slot) are real 3D discs with an edge, the same coin the
 * casino tosses (js/coin.js); mount3d() makes them tilt and flip. `side` picks the
 * face that shows ("back" = the reverse). The house coin is the casino's Meowth.
 */
export function coinHtml(coin, { side = "front", cls = "", label = "" } = {}) {
  const c = coin || HOUSE_COIN;
  const name = label || c.name || "Coin";
  const house = c.house || !c.front;
  if (/\b(xl|lg)\b/.test(cls)) {
    const size = /\bxl\b/.test(cls) ? Math.max(150, Math.min(260, Math.round((window.innerWidth || 390) * 0.62))) : 92;
    return `<span class="gcoin3d ${cls}" role="img" aria-label="${esc(name)}">${coinStageHTML({
      heads: house ? null : coinOf(c, "front"),
      tails: house ? null : coinOf(c, "back"),
      size,
      rest: side === "back" ? "tails" : "heads",
    })}</span>`;
  }
  const face = house ? null : coinOf(c, side === "back" ? "back" : "front");
  return `<span class="gcoin ${cls}" role="img" aria-label="${esc(name)}"><span class="gcoin-in">${coinFaceHTML(
    face,
    house ? (side === "back" ? "Tails" : "Heads") : ""
  )}</span></span>`;
}

/** Give the 3D coins under `root` their tilt, and toss them when tapped (a tap on `flipArea`
    or a key press on it). `glint` sweeps one flash of light across the foil. */
function mount3d(root, { flipArea = null, glint = false } = {}) {
  for (const coin of root.querySelectorAll(".cf-coin")) {
    const area = flipArea || coin;
    const toss = () => {
      if (coin._cfAnim) return;
      const next = coin.dataset.rest === "tails" ? "heads" : "tails";
      flipCoin(coin, next, { ms: 1500 });
    };
    tiltCoin(coin, { area, onTap: flipArea ? toss : null });
    coin._cfToss = toss;
    if (glint) glintCoin(coin);
  }
}

/** A sleeve is a card back: `.tcg.back` so the site's card motion tilts it like any card.
    Every sleeve is glossy plastic, so each carries a varnish glare; the ones with
    hot-stamped foil or a holo film (catalog `foil`: metal and a map of where it
    is, drawn by scripts/gear_foil.py) also carry a `.foil` layer that
    css/holo/sleeves.css lights with the card engine. */
export function sleeveHtml(sleeve, { cls = "", alt = "" } = {}) {
  if (!sleeve) return "";
  const foil = sleeve.foil;
  const style = [`--tint:${esc(sleeve.tint || "#7a7a88")}`];
  if (foil) style.push(`--art:url('${esc(abs(sleeve.art))}')`, `--foil-map:url('${esc(abs(foil.map))}')`);
  return `<div class="tcg back gsleeve ${cls} ${foil ? `sleeve-foil sleeve-${esc(foil.metal)}` : "sleeve-plain"}" style="${style.join(";")}">
    <img src="${esc(sleeve.art)}" alt="${esc(alt || sleeve.name)}" loading="lazy" decoding="async" draggable="false" />
    ${foil ? `<span class="foil" aria-hidden="true"></span>` : ""}
    <span class="glare" aria-hidden="true"></span></div>`;
}

/** Face-down cards show the equipped sleeve, else the set's own back. */
export function cardBackSrc(gear, fallback) {
  return equippedSleeve(gear, catalog)?.art || fallback;
}

/** A face-down card as markup: the equipped sleeve with its foil, else the printed back. */
export function cardBackHtml(gear, fallback, { cls = "" } = {}) {
  const sleeve = equippedSleeve(gear, catalog);
  if (sleeve) return sleeveHtml(sleeve, { cls, alt: "Pokémon TCG card back" });
  return `<div class="tcg back ${cls}"><img src="${esc(fallback)}" alt="Pokémon TCG card back" draggable="false" /></div>`;
}

const setName = (id) => ALL_SETS.find((set) => set.id === id)?.name || id;

/** "Mega Evolution", from the set a product row belongs to. */
function productLine(key) {
  const row = catalog.products?.[key];
  return row ? `${row.name}` : key;
}

/** Items a product row hands out, each with what the player did with it. */
export function giftHtml(granted, gear, { also = true } = {}) {
  const rows = (granted || [])
    .map((g) => ({ ...g, item: gearItem(catalog, g.kind, g.id) }))
    .filter((g) => g.item);
  if (!rows.length) return "";
  const g = normalizeGear(gear);
  const tile = (row) => {
    const on = g.equipped[row.kind] === row.id;
    const visual =
      row.kind === "coin"
        ? coinHtml(row.item, { cls: "sm" })
        : sleeveHtml(row.item, { cls: "sm" });
    return `<div class="gift ${row.kind}">
      <span class="gift-art">${visual}${row.wasNew ? `<span class="chip new">New</span>` : ""}</span>
      <span class="gift-copy"><b>${esc(row.item.name)}</b>
        <span>${row.kind === "coin" ? esc(MATERIALS[row.item.material] || "Coin") : `${row.item.count || 65} sleeves`}</span></span>
      <button type="button" class="ghost sm" data-gear-equip="${row.kind}:${esc(row.id)}" ${on ? "disabled" : ""}>${
        on ? "In use" : row.kind === "coin" ? "Use as my coin" : "Use as my card back"
      }</button>
    </div>`;
  };
  return `<div class="spread-gear"><h3>${also ? "Also in the box" : "In the box"}</h3>${rows.map(tile).join("")}</div>`;
}

/**
 * The page. `deps`: root, api, getGear, setGear, user, toast.
 * Returns { show, hide, render }.
 */
export function initGear(deps) {
  const root = deps.root;
  if (!root) return { show() {}, hide() {}, render() {} };
  const view = { kind: "coin", filter: "all", open: null, confirm: null, buying: false, stagger: true, pop: null, swap: null, picked: null };
  let sheet = null;
  let confirmTimer = 0;

  const wallet = () => Number(deps.coins?.() || 0);

  /** The shop button: arm, then confirm (as a sealed product's Open does), and a short wallet says so. */
  function buyHtml(kind, item) {
    const price = gearPrice(kind, item);
    if (price == null) return "";
    const key = `${kind}:${item.id}`;
    const short = Math.round((price - wallet()) * 100) / 100;
    if (short > 0) return `<button type="button" class="ghost" disabled>Need ${coinText(short)} more coins</button>`;
    const armed = view.confirm === key;
    return `<button type="button" class="${armed ? "solid rt-go confirming" : "ghost"}" data-gear-buy="${key}" ${view.buying ? "disabled" : ""}>${
      view.buying ? "Buying" : armed ? `Confirm ${coinAmount(price)}` : `Buy for ${coinAmount(price)}`
    }</button>`;
  }

  function buyNote(kind, item) {
    const price = gearPrice(kind, item);
    if (price == null) return "";
    const short = Math.round((price - wallet()) * 100) / 100;
    if (short > 0) return `You have ${coinAmount(wallet())}. This one costs ${coinAmount(price)}.`;
    return view.confirm === `${kind}:${item.id}` ? "Tap again to pay. Nothing is charged until you do." : "It comes out of your coins and stays yours.";
  }

  /** Repaint just the buy button and its line, so arming it never rebuilds the 3D coin above. */
  function paintBuy(kind, id) {
    const item = gearItem(catalog, kind, id);
    const actions = sheet?.querySelector(".gear-sheet-actions");
    if (!item || !actions) return;
    actions.innerHTML = buyHtml(kind, item);
    const note = sheet.querySelector("[data-gear-buy-note]");
    if (note) note.innerHTML = buyNote(kind, item);
  }

  function disarm() {
    clearTimeout(confirmTimer);
    view.confirm = null;
  }

  async function buy(kind, id) {
    const item = gearItem(catalog, kind, id);
    const price = item ? gearPrice(kind, item) : null;
    if (price == null || view.buying) return;
    const key = `${kind}:${id}`;
    if (view.confirm !== key) {
      view.confirm = key;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        view.confirm = null;
        if (view.open?.kind === kind && view.open.id === id && sheet?.open) paintBuy(kind, id);
      }, 4000);
      paintBuy(kind, id);
      return;
    }
    disarm();
    view.buying = true;
    paintBuy(kind, id);
    try {
      const data = await deps.api("/api/gear/buy", { method: "POST", body: JSON.stringify({ kind, id }) });
      view.buying = false;
      deps.applySave(data.save);
      deps.toast(`${item.name} is yours for ${coinText(price)} coins.`);
    } catch (err) {
      view.buying = false;
      deps.toast(err.message || "Couldn't buy that.");
      await deps.refresh?.();
    }
    render();
    if (view.open && sheet?.open) openSheet(view.open.kind, view.open.id);
  }

  const gear = () => normalizeGear(deps.getGear());

  function itemsOf(kind) {
    return Object.values((kind === "sleeve" ? catalog.sleeves : catalog.coins) || {});
  }

  function ownedMap(kind) {
    const g = gear();
    return kind === "sleeve" ? g.sleeves : g.coins;
  }

  /** Groups by set, newest set first (ALL_SETS is ordered that way). */
  function groups(kind) {
    const owned = ownedMap(kind);
    const order = new Map(ALL_SETS.map((set, i) => [set.id, i]));
    const bySet = new Map();
    for (const item of itemsOf(kind)) {
      const own = (owned[item.id] || 0) > 0;
      if (view.filter === "owned" && !own) continue;
      if (view.filter === "missing" && own) continue;
      const set = (item.sets && item.sets[0]) || "other";
      if (!bySet.has(set)) bySet.set(set, []);
      bySet.get(set).push(item);
    }
    return [...bySet.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
      .map(([set, items]) => ({ set, items }));
  }

  function totals(kind) {
    const owned = ownedMap(kind);
    const all = itemsOf(kind);
    return { have: all.filter((item) => (owned[item.id] || 0) > 0).length, total: all.length };
  }

  /** One thing on the shelf: the object large on its cell, the name, then the price and a
      white Buy key, or the ink Owned / Equipped tag. `n` staggers the first screen in. */
  function tile(kind, item, n = -1) {
    const owned = ownedMap(kind)[item.id] || 0;
    const g = gear();
    const on = g.equipped[kind] === item.id;
    const key = `${kind}:${esc(item.id)}`;
    const art = kind === "coin" ? coinHtml(item, { cls: "tile" }) : sleeveHtml(item, { cls: "tile" });
    const price = gearPrice(kind, item);
    return `<div class="gear-tile ${kind} ${owned ? "is-own" : "is-missing"} ${on ? "in-use" : ""}${n >= 0 ? " gear-in" : ""}"${n >= 0 ? ` style="--i:${n}"` : ""}>
      <button type="button" class="gear-hit" data-gear-open="${key}"
        aria-label="${esc(item.name)}${owned ? "" : price != null ? `, ${coinText(price)} coins` : ""}${on ? ", equipped" : ""}">
        <span class="gear-art">${art}</span>
        <span class="gear-name">${esc(item.name)}</span>
      </button>
      <span class="gear-foot">${
        on
          ? `<span class="gear-eq-tag">Equipped</span>`
          : owned
            ? `<span class="gear-own">${owned > 1 ? `${owned} owned` : "Owned"}</span><button type="button" class="ghost sm gear-key" data-gear-equip="${key}" aria-label="Equip ${esc(item.name)}">Equip</button>`
            : price != null
              ? `<span class="gear-price">${coinAmount(price)}</span><button type="button" class="ghost sm gear-key" data-gear-open="${key}" aria-label="Buy ${esc(item.name)}">Buy</button>`
              : `<span class="gear-own is-quiet">In boxes only</span>`
      }</span>
    </div>`;
  }

  /** What is equipped for this kind, large on the cyan slab, with its name on the plate. */
  function hero(kind, t) {
    const g = gear();
    const item = kind === "coin" ? equippedCoin(g, catalog) : equippedSleeve(g, catalog);
    const art =
      kind === "coin"
        ? coinHtml(item, { cls: "xl hero" })
        : item
          ? sleeveHtml(item, { cls: "xl hero" })
          : `<span class="gsleeve-standard hero" role="img" aria-label="Standard Pokémon back"></span>`;
    const name = kind === "coin" ? item.name : item ? item.name : "Standard Pokémon back";
    const note =
      kind === "coin"
        ? item.house
          ? item.blurb || "The house coin, until you choose another."
          : `${MATERIALS[item.material] || "Coin"}${item.subject ? `, ${item.subject}` : ""}`
        : item
          ? `${item.count || 65} sleeves${item.subject ? `, ${item.subject}` : ""}`
          : "Every face-down card shows the printed back.";
    const canClear = kind === "coin" ? !item.house : Boolean(item);
    const pop = view.pop === kind;
    const swap = !pop && view.swap === kind;
    const pctOwned = t.total ? Math.round((t.have / t.total) * 100) : 0;
    const noun = kind === "coin" ? "coins" : "sleeves";
    return `<section class="gear-hero ${kind}" aria-labelledby="gear-inuse-h">
        <div class="gear-hero-stage${pop ? " is-pop" : swap ? " is-swap" : ""}">
          <span class="gear-hero-slab" aria-hidden="true"></span>
          <div class="gear-hero-obj">${kind === "coin" ? `<button type="button" class="gear-hero-flip" data-gear-flip aria-label="Flip the coin">${art}</button>` : art}</div>
          ${kind === "coin" ? `<small class="gear-hero-hint" aria-hidden="true">Tap to flip</small>` : ""}
        </div>
        <div class="gear-hero-info">
          <p class="gear-hero-kicker"><span class="gear-eq-tag">Equipped</span><span id="gear-inuse-h">${kind === "coin" ? "Your coin" : "Your card back"}</span></p>
          <h2 class="gear-hero-name"><span>${esc(name)}</span></h2>
          <p class="gear-hero-note">${esc(note)}</p>
          ${canClear ? `<button type="button" class="tlink gear-hero-clear" data-gear-clear="${kind}">${kind === "coin" ? "Use the house coin" : "Use the standard back"}</button>` : ""}
          <div class="rt-box gear-progress" role="img" aria-label="${t.have} of ${t.total} ${noun} owned">
            <p class="gear-progress-top"><b>${t.have}</b><span>/${t.total} ${noun}</span><small>${pctOwned}%</small></p>
            <div class="rt-hp"><em>Owned</em><span class="rt-track"><i style="width:${pctOwned}%"></i></span></div>
          </div>
        </div>
      </section>`;
  }

  function render() {
    if (!deps.user()) {
      root.innerHTML = `<div class="gear-head"><h1>Sleeves &amp; coins</h1>
          <p class="gear-lede">Coins for the casino's flips, sleeves for every face-down card.</p></div>
        <section class="gear-hero gear-gate-hero coin">
          <div class="gear-hero-stage">
            <span class="gear-hero-slab" aria-hidden="true"></span>
            <div class="gear-hero-obj">${coinHtml(HOUSE_COIN, { cls: "tile gate" })}</div>
          </div>
          <div class="rt-box gear-gate">
            <h2>Trainers only</h2>
            <p>Coins and sleeves you buy or find in a box stay on your account.</p>
            <div class="gear-gate-actions">
              <button class="solid" type="button" data-open-auth="signup">Create account</button>
              <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
            </div>
          </div>
        </section>`;
      return;
    }
    const coinT = totals("coin");
    const sleeveT = totals("sleeve");
    const list = groups(view.kind);
    const t = view.kind === "coin" ? coinT : sleeveT;
    const stagger = view.stagger;
    view.stagger = false;
    let n = 0;
    const word = (f) => (f === "all" ? "All" : f === "owned" ? "Owned" : "Not owned");
    root.innerHTML = `
      <div class="gear-head">
        <h1>Sleeves &amp; coins</h1>
        <p class="gear-lede">${coinT.have} of ${coinT.total} coins, ${sleeveT.have} of ${sleeveT.total} sleeves</p>
      </div>
      <div class="gear-kinds" role="tablist" aria-label="Collection">
        <button type="button" class="rt-word gear-kind ${view.kind === "coin" ? "on" : ""}" role="tab" aria-selected="${view.kind === "coin"}" data-gear-kind="coin">Coins <span class="gear-count">${coinT.have}</span></button>
        <button type="button" class="rt-word gear-kind ${view.kind === "sleeve" ? "on" : ""}" role="tab" aria-selected="${view.kind === "sleeve"}" data-gear-kind="sleeve">Sleeves <span class="gear-count">${sleeveT.have}</span></button>
      </div>
      ${hero(view.kind, t)}
      <div class="gear-toolbar">
        <div class="gear-filter" role="group" aria-label="Show">
          ${["all", "owned", "missing"]
            .map((f) => `<button type="button" class="rt-word ${view.filter === f ? "on" : ""}" aria-pressed="${view.filter === f}" data-gear-filter="${f}">${word(f)}</button>`)
            .join("")}
        </div>
      </div>
      ${
        list.length
          ? `<div class="gear-groups">${list
              .map(({ set, items }) => {
                const owned = ownedMap(view.kind);
                const have = items.filter((item) => (owned[item.id] || 0) > 0).length;
                return `<section class="gear-group"><div class="gear-group-h"><h2>${esc(setName(set))}</h2><span><b>${have}</b>/${items.length}</span></div>
                  <div class="gear-grid gear-shelf ${view.kind}">${items.map((item) => tile(view.kind, item, stagger && n < 8 ? n++ : -1)).join("")}</div></section>`;
              })
              .join("")}</div>`
          : `<div class="rt-empty gear-empty"><span class="rt-ball e" aria-hidden="true"></span><p>${
              view.filter === "owned"
                ? `No ${view.kind}s yet. Buy one here, or find one in an elite trainer box, collection, tin or blister.`
                : view.filter === "missing"
                  ? `You own every ${view.kind}. That's the full set.`
                  : "Nothing to show."
            }</p></div>`
      }`;
    view.pop = null;
    view.swap = null;
    // The word just chosen grows its plate (the strip is redrawn on every choice).
    if (view.picked) root.querySelector(view.picked)?.classList.add("is-pick");
    view.picked = null;
    const flip = root.querySelector(".gear-hero-flip");
    if (flip) mount3d(flip, { flipArea: flip });
  }

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement("dialog");
    sheet.className = "gear-sheet";
    sheet.addEventListener("close", () => {
      view.open = null;
      disarm();
      document.documentElement.classList.remove("dialog-open");
    });
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) sheet.close();
    });
    document.body.append(sheet);
    return sheet;
  }

  function openSheet(kind, id) {
    const item = gearItem(catalog, kind, id);
    if (!item) return;
    if (view.confirm && view.confirm !== `${kind}:${id}`) disarm();
    view.open = { kind, id };
    const owned = ownedMap(kind)[id] || 0;
    const on = gear().equipped[kind] === id;
    const sources = (item.from || []).map((key) => ({ key, row: catalog.products?.[key] })).filter((s) => s.row);
    const dlg = ensureSheet();
    dlg.innerHTML = `
      <div class="gear-sheet-body">
        <button type="button" class="gear-sheet-close" data-gear-close aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
        <div class="gear-stage ${kind} ${owned ? "" : "missing"}">
          <span class="gear-stage-slab" aria-hidden="true"></span>
          ${kind === "coin" ? `<button type="button" class="gear-flip" data-gear-flip aria-label="Flip the coin">${coinHtml(item, { cls: "xl" })}</button><small class="gear-hint" aria-hidden="true">Drag to tilt, tap to flip</small>` : sleeveHtml(item, { cls: "xl" })}
        </div>
        <p class="gear-sheet-tags">${on ? `<span class="gear-eq-tag">Equipped</span>` : owned ? `<span class="gear-own">${owned > 1 ? `${owned} owned` : "Owned"}</span>` : gearPrice(kind, item) != null ? `<span class="gear-price is-big">${coinAmount(gearPrice(kind, item))}</span>` : ""}</p>
        <h2>${esc(item.name)}</h2>
        <p class="gear-sheet-note">${
          kind === "coin"
            ? `${esc(MATERIALS[item.material] || "Coin")}${item.subject ? `, ${esc(item.subject)}` : ""}`
            : `${item.count || 65} sleeves${item.subject ? `, ${esc(item.subject)}` : ""}`
        }${owned > 1 ? `. You have ${owned}.` : ""}</p>
        ${item.blurb ? `<p class="gear-sheet-blurb">${esc(item.blurb)}</p>` : ""}
        ${
          sources.length
            ? `<div class="gear-found"><small>Comes in</small>${sources
                .map(({ key, row }) => `<a href="/packs/${esc(key.split("/")[0])}">${esc(row.name)}</a>`)
                .join("")}</div>`
            : ""
        }
        <div class="gear-sheet-actions">
          ${
            owned
              ? on
                ? `<button type="button" class="ghost" data-gear-clear="${kind}">${kind === "coin" ? "Use the house coin" : "Use the standard back"}</button>`
                : `<button type="button" class="solid rt-go" data-gear-equip="${kind}:${esc(id)}">${kind === "coin" ? "Equip as my coin" : "Equip as my card back"}</button>`
              : buyHtml(kind, item)
          }
        </div>
        ${owned ? "" : `<p class="gear-buy-note" data-gear-buy-note>${buyNote(kind, item)}</p>`}
      </div>`;
    if (!dlg.open) {
      dlg.showModal();
      document.documentElement.classList.add("dialog-open");
    }
    if (kind === "coin") {
      const stage = dlg.querySelector(".gear-flip");
      if (stage) mount3d(stage, { flipArea: stage, glint: true });
    }
  }

  async function equip(kind, id) {
    try {
      const data = await deps.api("/api/gear/equip", { method: "POST", body: JSON.stringify({ kind, id }) });
      deps.setGear(data.gear);
      deps.toast(
        id
          ? kind === "coin"
            ? "That's your coin now."
            : "That's your card back now."
          : kind === "coin"
            ? "Back to the house coin."
            : "Back to the standard card back."
      );
    } catch (err) {
      deps.toast(err.message || "Couldn't change that.");
      return false;
    }
    view.pop = kind;
    render();
    if (view.open && sheet?.open) openSheet(view.open.kind, view.open.id);
    return true;
  }

  // A mouse over a flat coin moves the light across its foil (fingers have the sheet's 3D coin).
  root.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const coin = event.target instanceof Element ? event.target.closest(".gcoin") : null;
    if (!coin) return;
    const r = coin.getBoundingClientRect();
    coin.style.setProperty("--nx", clampN(((event.clientX - r.left) / r.width - 0.5) * 2.2));
    coin.style.setProperty("--ny", clampN(((event.clientY - r.top) / r.height - 0.5) * 2.2));
    coin.style.setProperty("--tilt", "0.7");
  });
  root.addEventListener("pointerout", (event) => {
    const coin = event.target instanceof Element ? event.target.closest(".gcoin") : null;
    if (!coin || coin.contains(event.relatedTarget)) return;
    for (const k of ["--nx", "--ny", "--tilt"]) coin.style.removeProperty(k);
  });

  root.addEventListener("click", (event) => {
    const t = event.target;
    const kind = t.closest("[data-gear-kind]");
    if (kind) {
      if (view.kind !== kind.dataset.gearKind) {
        view.swap = kind.dataset.gearKind;
        view.picked = `[data-gear-kind="${kind.dataset.gearKind}"]`;
      }
      view.kind = kind.dataset.gearKind;
      view.stagger = true;
      render();
      return;
    }
    const filter = t.closest("[data-gear-filter]");
    if (filter) {
      if (view.filter !== filter.dataset.gearFilter) view.picked = `[data-gear-filter="${filter.dataset.gearFilter}"]`;
      view.filter = filter.dataset.gearFilter;
      view.stagger = true;
      render();
      return;
    }
    const open = t.closest("[data-gear-open]");
    if (open) {
      const [k, id] = open.dataset.gearOpen.split(":");
      openSheet(k, id);
      return;
    }
    const clear = t.closest("[data-gear-clear]");
    if (clear) equip(clear.dataset.gearClear, null);
  });

  document.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const purchase = t.closest("[data-gear-buy]");
    if (purchase && !purchase.disabled) {
      const [k, ...rest] = purchase.dataset.gearBuy.split(":");
      buy(k, rest.join(":"));
      return;
    }
    const eq = t.closest("[data-gear-equip]");
    if (eq && !eq.disabled) {
      const [k, ...rest] = eq.dataset.gearEquip.split(":");
      equip(k, rest.join(":")).then((ok) => {
        if (ok && eq.isConnected) {
          eq.disabled = true;
          eq.textContent = "In use";
        }
      });
      return;
    }
    if (t.closest("[data-gear-close]")) sheet?.close();
    const flip = t.closest("[data-gear-flip]");
    // a tap is handled by the coin's own pointer tilt; this is the keyboard (detail 0)
    if (flip && event.detail === 0) flip.querySelector(".cf-coin")?._cfToss?.();
    // Leaving for the shop: the sheet is a modal, so it has to close first.
    if (t.closest(".gear-sheet a[href]")) sheet?.close();
    const clear = t.closest(".gear-sheet [data-gear-clear]");
    if (clear) equip(clear.dataset.gearClear, null);
  });

  return {
    show() {
      view.stagger = true;
      render();
    },
    hide() {
      sheet?.close();
    },
    render,
  };
}
