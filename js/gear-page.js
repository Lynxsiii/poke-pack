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
import { HOUSE_COIN, equippedCoin, equippedSleeve, gearItem, gearPrice, normalizeGear, ownedItems } from "./gear.js";
import { coinAmount, coinText } from "./money.js?v=1";
import { coinFaceHTML, coinOf, coinStageHTML, flipCoin, glintCoin, tiltCoin } from "./coin.js?v=3";

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
  const view = { kind: "coin", filter: "all", open: null, confirm: null, buying: false };
  let sheet = null;
  let confirmTimer = 0;

  const wallet = () => Number(deps.coins?.() || 0);

  /** The shop button: arm, then confirm (as a sealed product's Open does), and a short wallet says so. */
  function buyHtml(kind, item) {
    const price = gearPrice(kind, item);
    if (price == null) return "";
    const key = `${kind}:${item.id}`;
    const short = Math.round((price - wallet()) * 100) / 100;
    if (short > 0) return `<button type="button" class="solid" disabled>Need ${coinText(short)} more coins</button>`;
    const armed = view.confirm === key;
    return `<button type="button" class="${armed ? "solid confirming" : "solid"}" data-gear-buy="${key}" ${view.buying ? "disabled" : ""}>${
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

  function tile(kind, item) {
    const owned = ownedMap(kind)[item.id] || 0;
    const g = gear();
    const on = g.equipped[kind] === item.id;
    const art = kind === "coin" ? coinHtml(item, { cls: "tile" }) : sleeveHtml(item, { cls: "tile" });
    return `<button type="button" class="gear-tile ${kind} ${owned ? "own" : "missing"} ${on ? "in-use" : ""}" data-gear-open="${kind}:${esc(item.id)}"
      aria-label="${esc(item.name)}${owned ? "" : `, ${coinText(gearPrice(kind, item))} coins`}${on ? ", in use" : ""}">
      <span class="gear-art">${art}</span>
      <span class="gear-name">${esc(item.name)}</span>
      <span class="gear-meta${owned ? "" : " gear-price"}">${on ? "In use" : owned > 1 ? `${owned} owned` : owned ? "Owned" : coinAmount(gearPrice(kind, item))}</span>
    </button>`;
  }

  function slot(kind) {
    const g = gear();
    const item = kind === "coin" ? equippedCoin(g, catalog) : equippedSleeve(g, catalog);
    const label = kind === "coin" ? "Your coin" : "Your card back";
    const art =
      kind === "coin"
        ? coinHtml(item, { cls: "lg" })
        : item
          ? sleeveHtml(item, { cls: "lg" })
          : `<span class="gsleeve-standard" aria-hidden="true"></span>`;
    const name = kind === "coin" ? item.name : item ? item.name : "Standard Pokémon back";
    const note =
      kind === "coin"
        ? item.house
          ? item.blurb || "The house coin, until you choose another."
          : item.subject || ""
        : item
          ? `${item.count || 65} sleeves`
          : "Every face-down card shows the printed back.";
    const canClear = kind === "coin" ? !item.house : Boolean(item);
    return `<div class="gear-slot ${kind}">
      <span class="gear-slot-art">${art}</span>
      <span class="gear-slot-copy"><small>${label}</small><b>${esc(name)}</b><span>${esc(note)}</span>
        ${canClear ? `<button type="button" class="link-btn" data-gear-clear="${kind}">${kind === "coin" ? "Use the house coin" : "Use the standard back"}</button>` : ""}</span>
    </div>`;
  }

  function render() {
    if (!deps.user()) {
      root.innerHTML = `<div class="section-head"><div><h2>Sleeves &amp; coins</h2></div></div>
        <div class="need-account"><p>Sleeves and coins live on your account. Sign in to collect them.</p>
        <div class="account-hero-actions">
          <button class="solid" type="button" data-open-auth="signup">Create account</button>
          <button class="ghost" type="button" data-open-auth="signin">Sign in</button></div></div>`;
      return;
    }
    const coinT = totals("coin");
    const sleeveT = totals("sleeve");
    const list = groups(view.kind);
    const t = view.kind === "coin" ? coinT : sleeveT;
    root.innerHTML = `
      <div class="gear-head">
        <h1>Sleeves &amp; coins</h1>
      </div>
      <div class="gear-table">${slot("coin")}${slot("sleeve")}</div>
      <div class="gear-kinds" role="tablist" aria-label="Collection">
        <button type="button" class="gear-kind ${view.kind === "coin" ? "on" : ""}" role="tab" aria-selected="${view.kind === "coin"}" data-gear-kind="coin">Coins <span class="gear-count">${coinT.have}/${coinT.total}</span></button>
        <button type="button" class="gear-kind ${view.kind === "sleeve" ? "on" : ""}" role="tab" aria-selected="${view.kind === "sleeve"}" data-gear-kind="sleeve">Sleeves <span class="gear-count">${sleeveT.have}/${sleeveT.total}</span></button>
      </div>
      <div class="gear-toolbar">
        <div class="seg" role="group" aria-label="Show">
          ${["all", "owned", "missing"]
            .map((f) => `<button type="button" class="seg-btn ${view.filter === f ? "on" : ""}" data-gear-filter="${f}">${f === "all" ? "All" : f === "owned" ? "Owned" : "Missing"}</button>`)
            .join("")}
        </div>
        <span class="gear-progress"><i style="width:${t.total ? Math.round((t.have / t.total) * 100) : 0}%"></i></span>
      </div>
      ${
        list.length
          ? list
              .map(({ set, items }) => {
                const owned = ownedMap(view.kind);
                const have = items.filter((item) => (owned[item.id] || 0) > 0).length;
                return `<section class="gear-group"><h2>${esc(setName(set))} <small>${have}/${items.length}</small></h2>
                  <div class="gear-grid ${view.kind === "coin" ? "gear-tray" : "gear-rack"} ${view.kind}" style="--n:${items.length}">${items.map((item) => tile(view.kind, item)).join("")}</div></section>`;
              })
              .join("")
          : `<p class="gear-empty">${
              view.filter === "owned"
                ? `Open an elite trainer box, collection, tin or blister to find ${view.kind}s.`
                : view.filter === "missing"
                  ? `You have every ${view.kind} listed.`
                  : "Nothing to show."
            }</p>`
      }`;
    mount3d(root.querySelector(".gear-slot.coin") || root);
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
          ${kind === "coin" ? `<button type="button" class="gear-flip" data-gear-flip aria-label="Flip the coin">${coinHtml(item, { cls: "xl" })}</button><small class="gear-hint" aria-hidden="true">Drag to tilt, tap to flip</small>` : sleeveHtml(item, { cls: "xl" })}
        </div>
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
                : `<button type="button" class="solid" data-gear-equip="${kind}:${esc(id)}">${kind === "coin" ? "Use as my coin" : "Use as my card back"}</button>`
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
      view.kind = kind.dataset.gearKind;
      render();
      return;
    }
    const filter = t.closest("[data-gear-filter]");
    if (filter) {
      view.filter = filter.dataset.gearFilter;
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
      render();
    },
    hide() {
      sheet?.close();
    },
    render,
  };
}
