/* Wishlist: hearted cards, owned or not, and the page at /wishlist that lists them by set
   with where each one comes from, so a player can hunt one card.

   The Worker keeps a signed-in player's list (worker/wishlist.js, save.wishlist). A guest's
   hearts live in this browser until they sign in, then move onto the account.

   initWishlist(deps) -> { adopt, reset, has, ids, heart, toggle, show, sync }
     deps.root               the #view-wishlist section
     deps.api(path, opts)    the app's fetch helper
     deps.signedIn()         a trainer is signed in
     deps.openAuth(mode)     open sign-in
     deps.openSearch()       open the site search
     deps.toast(message)
     deps.owned(cardId)      copies held (raw + graded)
     deps.openCard({id, setId})   open the inspector (the app loads the set first)
     deps.openShop(setId)    a set's shop page
     deps.sourceOf(entry)    -> { kind: "pack"|"product"|"none", setId, products: [name] }
     deps.setInfo(setId)     -> { name, symbol } or null
     deps.onChange()         the list changed (the app repaints filters that count hearts) */
import { loadCardIndex, numberText } from "./search.js?v=6";

const LOCAL_KEY = "pokepack.wishlist";
const MAX = 500;

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const HEART = `<svg class="wish-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.9 4.9 0 0 1 0-7 4.9 4.9 0 0 1 7 0l.4.4.4-.4a4.9 4.9 0 0 1 7 0 4.9 4.9 0 0 1 0 7Z"/></svg>`;

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(list) ? list.filter((id) => typeof id === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try {
    if (list.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* private mode: the hearts last for this visit */
  }
}

export function initWishlist(deps) {
  let list = readLocal(); // newest first
  let cloud = false; // list came from the account
  let moving = false;
  let tab = "all";
  let shownOnce = new Set(); // rows hearted off while the page is open stay until it is left

  const has = (id) => list.includes(id);

  /** The account's list, from a fresh save. A guest's local hearts move onto the account once. */
  function adopt(save) {
    if (!deps.signedIn()) return;
    const next = Array.isArray(save?.wishlist) ? save.wishlist.slice(0, MAX) : list;
    const local = readLocal().filter((id) => !next.includes(id));
    const changed = !cloud || next.join() !== list.join();
    cloud = true;
    list = next;
    if (local.length && !moving) {
      moving = true;
      deps
        .api("/api/wishlist", { method: "POST", body: JSON.stringify({ cardIds: local.slice().reverse() }) })
        .then((data) => {
          writeLocal([]);
          if (Array.isArray(data?.wishlist)) list = data.wishlist;
          sync();
        })
        .catch(() => {
          /* kept locally; tried again on the next save */
        })
        .finally(() => {
          moving = false;
        });
    }
    if (changed) sync();
  }

  /** Signed out: the account's hearts leave with it, and this browser's own come back. */
  function reset() {
    if (!cloud) return;
    cloud = false;
    list = readLocal();
    sync();
  }

  /** A heart button for a card. `word` adds the label beside the icon (the inspector). */
  function heart(id, name = "this card", { word = false, cls = "" } = {}) {
    const on = has(id);
    return `<button type="button" class="wish-heart${word ? " wish-word" : ""}${cls ? ` ${cls}` : ""}" data-wish="${esc(id)}" data-wish-name="${esc(name)}" aria-pressed="${on}" aria-label="${on ? "On your wishlist" : "Add to wishlist"}: ${esc(name)}">${HEART}${
      word ? `<span class="wish-say">${on ? "On your wishlist" : "Wishlist"}</span>` : ""
    }</button>`;
  }

  /** Every heart on the page shows the list as it is now. */
  function sync() {
    document.querySelectorAll("[data-wish]").forEach((btn) => {
      const on = has(btn.dataset.wish);
      if (btn.getAttribute("aria-pressed") === String(on)) return;
      btn.setAttribute("aria-pressed", String(on));
      const name = btn.dataset.wishName || "this card";
      btn.setAttribute("aria-label", `${on ? "On your wishlist" : "Add to wishlist"}: ${name}`);
      const say = btn.querySelector(".wish-say");
      if (say) say.textContent = on ? "On your wishlist" : "Wishlist";
    });
    deps.onChange?.();
  }

  async function toggle(id, btn) {
    const on = !has(id);
    if (on && list.length >= MAX) {
      deps.toast(`Your wishlist is full (${MAX} cards). Take one off first.`);
      return;
    }
    const before = list.slice();
    list = on ? [id, ...list.filter((x) => x !== id)] : list.filter((x) => x !== id);
    if (on && btn) {
      btn.classList.remove("is-pop");
      void btn.offsetWidth;
      btn.classList.add("is-pop");
    }
    sync();
    if (!deps.signedIn() || !cloud) {
      writeLocal(list);
      if (on) deps.toast(before.length ? "Added to your wishlist" : "Added to your wishlist. Sign in to keep it on your account.");
      return;
    }
    try {
      const data = await deps.api("/api/wishlist", { method: "POST", body: JSON.stringify({ cardId: id, on }) });
      if (Array.isArray(data?.wishlist)) {
        // A newer tap already changed this card: keep what the player sees.
        list = data.wishlist;
        sync();
      }
      if (on) deps.toast("Added to your wishlist");
    } catch (err) {
      list = before;
      sync();
      deps.toast(err?.message || "Couldn't save your wishlist.");
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-wish]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(btn.dataset.wish, btn);
  }, true); // capture: a heart inside a card row must not also open the card

  /* ---- The page ---- */

  function tabsHtml(counts) {
    return [
      ["all", "All"],
      ["hunt", "Still hunting"],
      ["got", "Got it"],
    ]
      .map(
        ([key, label]) =>
          `<button type="button" class="rt-word" data-wish-tab="${key}" aria-pressed="${tab === key}">${label} <i>${counts[key]}</i></button>`
      )
      .join("");
  }

  function whereHtml(src, setName) {
    if (src.kind === "product") {
      const names = src.products.slice(0, 3);
      const more = src.products.length - names.length;
      return `Comes in ${names.map(esc).join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
    }
    if (src.kind === "pack") return `Pulled from ${esc(setName)} packs`;
    return "Not sold in the shop right now";
  }

  function rowHtml(card, src, setName) {
    const owned = deps.owned(card.id);
    return `<li class="wish-row${owned ? " is-got" : ""}">
      <button type="button" class="wish-open" data-wish-open="${esc(card.id)}" data-set="${esc(card.dataSetId)}" aria-label="${esc(card.name)}, ${owned ? "owned" : "not pulled yet"}">
        <span class="wish-thumb"><img src="${esc(card.image)}" alt="" width="50" height="70" loading="lazy" decoding="async" /></span>
        <span class="wish-text">
          <b>${esc(card.name)}</b>
          <span class="wish-meta">${esc(numberText(card))}${card.rarityLabel ? `, ${esc(card.rarityLabel)}` : ""}</span>
          <span class="wish-where">${whereHtml(src, setName)}</span>
        </span>
        ${owned ? `<span class="wish-own">${owned > 1 ? `×${owned} owned` : "Owned"}</span>` : `<span class="wish-miss">Missing</span>`}
      </button>
      ${heart(card.id, card.name, { cls: "wish-row-heart" })}
    </li>`;
  }

  async function show() {
    const root = deps.root;
    if (!root) return;
    shownOnce = new Set(list);
    const head = `<div class="section-head wish-head"><div><h2>Wishlist</h2><p id="wish-fact"></p></div></div>`;
    if (!list.length) {
      root.innerHTML = `${head}<div class="wish-empty rt-empty">
        <span class="wish-empty-ico">${HEART}</span>
        <p><b>Nothing hearted yet.</b> Tap the heart on any card, in a set, in search or on the card itself, and it lands here with the set and pack it comes from.</p>
        <button type="button" class="ghost" data-wish-search>Search for a card</button>
      </div>`;
      root.querySelector("#wish-fact").textContent = "Cards you want, and where to find them.";
      return;
    }
    if (!root.querySelector(".wish-list")) {
      root.innerHTML = `${head}<div class="search-note is-loading" role="status"><i class="search-ball" aria-hidden="true"></i><p>Loading your cards</p></div>`;
    }
    let index;
    try {
      index = await loadCardIndex();
    } catch {
      root.innerHTML = `${head}<div class="wish-empty rt-empty"><p><b>Your wishlist couldn't load.</b> Check your connection and try again.</p></div>`;
      return;
    }
    paint(index);
  }

  let byId = null;
  function paint(index) {
    const root = deps.root;
    if (!byId || byId.size !== index.length) byId = new Map(index.map((card) => [card.id, card]));
    const ids = [...new Set([...list, ...shownOnce])];
    const cards = ids.map((id) => byId.get(id)).filter(Boolean);
    const counts = { all: cards.length, hunt: 0, got: 0 };
    for (const card of cards) {
      if (deps.owned(card.id) > 0) counts.got += 1;
      else counts.hunt += 1;
    }
    const shown = cards.filter((card) => tab === "all" || (tab === "got") === deps.owned(card.id) > 0);
    // One group per set, newest heart first; inside a set, in number order.
    const order = new Map(list.map((id, i) => [id, i]));
    const groups = new Map();
    for (const card of shown) {
      const src = deps.sourceOf(card);
      const key = card.setId;
      if (!groups.has(key)) groups.set(key, { setId: key, first: Infinity, rows: [] });
      const g = groups.get(key);
      g.first = Math.min(g.first, order.has(card.id) ? order.get(card.id) : Infinity);
      g.rows.push({ card, src });
    }
    const sets = [...groups.values()].sort((a, b) => a.first - b.first);
    const body = sets
      .map((g) => {
        const info = deps.setInfo(g.setId) || { name: g.rows[0].card.setName, symbol: "" };
        g.rows.sort((a, b) => (a.card.num ?? 0) - (b.card.num ?? 0) || String(a.card.number).localeCompare(String(b.card.number)));
        const packSet = g.rows.find((r) => r.src.kind === "pack")?.src.setId;
        const shopSet = packSet || g.rows.find((r) => r.src.kind === "product")?.src.setId;
        return `<section class="wish-set" aria-label="${esc(info.name)}">
          <h3 class="wish-set-head">${info.symbol ? `<img src="${esc(info.symbol)}" alt="" width="24" height="24" decoding="async" />` : ""}<span>${esc(info.name)}</span><i>${g.rows.length}</i>
            ${shopSet ? `<button type="button" class="ghost sm wish-shop" data-wish-shop="${esc(shopSet)}">${packSet ? "Open a pack" : "See in shop"}</button>` : ""}
          </h3>
          <ul class="wish-list">${g.rows.map((r) => rowHtml(r.card, r.src, info.name)).join("")}</ul>
        </section>`;
      })
      .join("");
    const signNote = deps.signedIn()
      ? ""
      : `<p class="wish-guest">These hearts live in this browser. <button type="button" class="tlink" data-wish-auth>Create an account</button> to keep them.</p>`;
    root.innerHTML = `<div class="section-head wish-head"><div><h2>Wishlist</h2><p id="wish-fact">${counts.all} card${counts.all === 1 ? "" : "s"}, ${counts.got} in your collection.</p></div></div>
      ${signNote}
      <div class="wish-tabs" role="group" aria-label="Show">${tabsHtml(counts)}</div>
      ${body || `<div class="wish-empty rt-empty"><p>${tab === "got" ? "None of these are in your collection yet." : "You have every card on your list. Nice."}</p></div>`}`;
  }

  deps.root?.addEventListener("click", async (e) => {
    const t = e.target;
    const tabBtn = t.closest("[data-wish-tab]");
    if (tabBtn) {
      tab = tabBtn.dataset.wishTab;
      try {
        paint(await loadCardIndex());
      } catch {
        /* the page already says it couldn't load */
      }
      return;
    }
    if (t.closest("[data-wish-search]")) {
      deps.openSearch();
      return;
    }
    if (t.closest("[data-wish-auth]")) {
      deps.openAuth("signup");
      return;
    }
    const shop = t.closest("[data-wish-shop]");
    if (shop) {
      deps.openShop(shop.dataset.wishShop);
      return;
    }
    const open = t.closest("[data-wish-open]");
    if (open && open.getAttribute("aria-busy") !== "true") {
      open.setAttribute("aria-busy", "true");
      try {
        await deps.openCard({ id: open.dataset.wishOpen, setId: open.dataset.set });
      } finally {
        open.removeAttribute("aria-busy");
      }
    }
  });
  deps.root?.addEventListener(
    "error",
    (e) => {
      if (e.target instanceof HTMLImageElement) e.target.style.visibility = "hidden";
    },
    true
  );

  return { adopt, reset, has, ids: () => list.slice(), heart, toggle, show, sync };
}
