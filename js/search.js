/* Site search: one box that finds any card (by name, set or the number printed bottom-left)
   and any sealed product, and lets you open the card or put the product in your cart.

   The ranking lives in js/search-rules.js (pure, tested by scripts/test-search.mjs). The cards
   come from data/search-index.json, one row per card (scripts/build_search_index.mjs), loaded the
   first time the box is touched; sealed products are read from the shop's own price and product
   lists, so a price that moved is the price shown. The screen is a full-height dialog, so it does
   not depend on the page header (which scrolls away on a phone).

   initSearch(deps) -> { open, close, isOpen, warm }
     deps.root              the #search dialog
     deps.opener            the header button(s) that open it
     deps.openDialog / closeDialog   the app's dialog stack
     deps.sealedItems()     async -> [{ setId, id, name, short, kind, price, image, cart }]
     deps.openCard(card)    open the card inspector (the app loads the set's data first)
     deps.openShop(setId)   show a set's shop page
     deps.owned(cardId)     copies the player holds
     deps.signedIn() / signIn() / toast(message) / canOpen()
   Cart controls come from js/cart.js (the same ?v= as the app, or there are two stores). */
import { SET_BY_ID, RARITY_LABEL } from "./catalog.js";
import { homeSetId } from "./card-home.js";
import { cartStore, cartControlHtml, cartControlClick, cartControlChange, refreshCartControls } from "./cart.js?v=4";
import { coinAmount } from "./money.js?v=1";
import { buildCardList, buildSealedList, searchCards, searchSealed, parseQuery, asksForProduct } from "./search-rules.js?v=1";

const CARD_PAGE = 12;
const SEALED_PAGE = 6;
const INDEX_URL = "data/search-index.json";

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const EXAMPLES = [
  ["Charizard ex", "A name"],
  ["177/132", "The number printed on the card"],
  ["Surging Sparks booster box", "A sealed product"],
];

function setInfo(id) {
  const set = SET_BY_ID[id];
  return set ? { name: set.name, printedTotal: set.printedTotal, released: Date.parse(set.released) || 0 } : null;
}

/** The number as the card prints it: "177/132" for a numbered card, the plain code ("TG05", "25-costco") for the rest. */
export function numberText(card) {
  if (card.printed) return card.printed;
  if (/^\d+$/.test(card.number) && card.total > 0) {
    const width = Math.max(3, String(card.total).length);
    return `${card.number.padStart(width, "0")}/${String(card.total).padStart(width, "0")}`;
  }
  return card.number;
}

export function initSearch(deps) {
  const root = deps.root;
  const input = root.querySelector("#search-input");
  const body = root.querySelector("#search-body");
  const form = root.querySelector("#search-form");
  let cards = null; // built from the index on first use
  let sealed = [];
  let loading = null;
  let failed = false;
  let query = "";
  let showCards = CARD_PAGE;
  let showSealed = SEALED_PAGE;
  let timer = 0;
  let open = false;

  /** Fetch the card list once. Safe to call early (the header button warms it on hover and touch). */
  function warm() {
    if (cards || loading) return loading;
    loading = fetch(INDEX_URL, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then((raw) => {
        cards = buildCardList(raw, { setOf: setInfo, homeOf: homeSetId, rarityLabel: (r) => RARITY_LABEL[r] || r });
      })
      .catch(() => {
        failed = true;
      })
      .finally(() => {
        loading = null;
        if (open) paint();
      });
    return loading;
  }

  async function loadSealed() {
    try {
      const items = await deps.sealedItems();
      sealed = buildSealedList(items, setInfo);
    } catch {
      sealed = [];
    }
    if (open) paint();
  }

  function cardRow(card) {
    const owned = deps.owned(card.id);
    const set = card.setName;
    const rarity = card.rarityLabel;
    return `<li><button type="button" class="search-card" data-card="${esc(card.id)}" data-set="${esc(card.dataSetId)}">
      <span class="search-thumb"><img src="${esc(card.image)}" alt="" width="52" height="73" loading="lazy" decoding="async" /></span>
      <span class="search-text">
        <b>${esc(card.name)}</b>
        <span class="search-meta">${esc(numberText(card))}${rarity ? ` · ${esc(rarity)}` : ""}</span>
        <span class="search-set">${esc(set)}</span>
      </span>
      ${owned > 0 ? `<span class="search-owned">Owned ${owned}</span>` : ""}
    </button></li>`;
  }

  function sealedRow(item) {
    const set = SET_BY_ID[item.setId];
    const packs = item.packs ? `${item.packs} pack${item.packs === 1 ? "" : "s"}` : "";
    const meta = [packs, item.price > 0 ? coinAmount(item.price) : ""].filter(Boolean);
    const image = item.image
      ? `<img src="${esc(item.image)}" alt="" width="64" height="64" loading="lazy" decoding="async" />`
      : `<img class="search-symbol" src="assets/cards/sets/${esc(set?.tcgId || set?.id || item.setId)}-symbol.webp" alt="" width="40" height="40" loading="lazy" decoding="async" />`;
    return `<li class="search-prod" data-set="${esc(item.setId)}">
      <span class="search-box">${image}</span>
      <span class="search-text">
        <b>${esc(item.title)}</b>
        <span class="search-meta">${meta.join(" · ")}</span>
      </span>
      <span class="search-acts">
        ${item.cart ? cartControlHtml(item.setId, item.id, item.title) : ""}
        <button type="button" class="ghost search-shop" data-shop="${esc(item.setId)}">${item.kind === "pack" ? "Open a pack" : "See in shop"}</button>
      </span>
    </li>`;
  }

  function section(title, count, rows, moreAttr, more, left) {
    const next = Math.min(more, left);
    return `<section class="search-sec" aria-label="${esc(title)}">
      <h3><span>${esc(title)}</span><i>${count.toLocaleString()}</i></h3>
      <ul class="search-list">${rows}</ul>
      ${left > 0 ? `<button type="button" class="text-btn search-more" ${moreAttr}>Show ${next} more</button>` : ""}
    </section>`;
  }

  function paint() {
    const q = parseQuery(query);
    if (q.empty) {
      body.innerHTML = `<div class="search-hint">
        <p>Search any card, set or sealed product.</p>
        <ul>${EXAMPLES.map(
          ([text, note]) => `<li><button type="button" class="search-eg" data-eg="${esc(text)}"><b>${esc(text)}</b><span>${esc(note)}</span></button></li>`
        ).join("")}</ul>
      </div>`;
      return;
    }
    if (failed && !cards) {
      body.innerHTML = `<p class="search-note">Search couldn't load. Check your connection and try again.</p>`;
      return;
    }
    if (!cards) {
      body.innerHTML = `<p class="search-note">Loading the card list…</p>`;
      return;
    }
    const found = searchCards(cards, q, { limit: showCards });
    const prods = searchSealed(sealed, q, { limit: showSealed });
    const cardPart = found.total
      ? section("Cards", found.total, found.hits.map(cardRow).join(""), "data-more=\"cards\"", CARD_PAGE, found.total - found.hits.length)
      : "";
    const sealedPart = prods.total
      ? section("Sealed", prods.total, prods.hits.map(sealedRow).join(""), "data-more=\"sealed\"", SEALED_PAGE, prods.total - prods.hits.length)
      : "";
    if (!cardPart && !sealedPart) {
      body.innerHTML = `<p class="search-note">Nothing matches “${esc(query.trim())}”. Try fewer words, or the number printed on the card.</p>`;
      return;
    }
    const sealedFirst = asksForProduct(q) || !cardPart;
    const parts = sealedFirst ? [sealedPart, cardPart] : [cardPart, sealedPart];
    body.innerHTML = `<p class="search-count" role="status">${[
      found.total ? `${found.total.toLocaleString()} card${found.total === 1 ? "" : "s"}` : "",
      prods.total ? `${prods.total.toLocaleString()} product${prods.total === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(" and ")}</p>${parts.join("")}`;
  }

  function setQuery(next) {
    if (next === query) return;
    query = next;
    showCards = CARD_PAGE;
    showSealed = SEALED_PAGE;
    cancelAnimationFrame(timer);
    timer = requestAnimationFrame(paint);
  }

  input.addEventListener("input", () => setQuery(input.value));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    input.blur(); // closes the phone keyboard so the results can be read
  });

  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.closest("#search-close")) {
      close();
      return;
    }
    if (cartControlClick(t, { signedIn: deps.signedIn(), signIn: deps.signIn, toast: deps.toast })) return;
    const eg = t.closest("[data-eg]");
    if (eg) {
      input.value = eg.dataset.eg;
      setQuery(input.value);
      input.focus();
      return;
    }
    const more = t.closest("[data-more]");
    if (more) {
      if (more.dataset.more === "cards") showCards += CARD_PAGE;
      else showSealed += SEALED_PAGE;
      paint();
      return;
    }
    const shop = t.closest("[data-shop]");
    if (shop) {
      close();
      deps.openShop(shop.dataset.shop);
      return;
    }
    const card = t.closest("[data-card]");
    if (card && card.getAttribute("aria-busy") !== "true") {
      // Not disabled while it loads: the button keeps focus, so closing the inspector lands back on it.
      card.setAttribute("aria-busy", "true");
      try {
        await deps.openCard({ id: card.dataset.card, setId: card.dataset.set });
      } finally {
        card.removeAttribute("aria-busy");
      }
    }
  });
  root.addEventListener("change", (e) => {
    cartControlChange(e.target, { toast: deps.toast });
  });
  // A thumbnail that is missing leaves its frame, not a broken-image mark.
  root.addEventListener(
    "error",
    (e) => {
      if (e.target instanceof HTMLImageElement) e.target.style.visibility = "hidden";
    },
    true
  );
  cartStore.subscribe(() => refreshCartControls(body));

  function openSearch(text) {
    if (open || !deps.canOpen()) return;
    open = true;
    failed = false; // a failed load is tried again on the next open
    warm();
    loadSealed();
    if (typeof text === "string") {
      input.value = text;
      query = text;
    }
    paint();
    deps.openDialog(root, input);
    input.select();
  }

  function close() {
    if (!open) return;
    open = false;
    deps.closeDialog(root);
  }

  for (const btn of deps.opener) {
    btn.addEventListener("click", () => openSearch());
    btn.addEventListener("pointerenter", warm, { once: true });
    btn.addEventListener("touchstart", warm, { once: true, passive: true });
  }

  // "/" or Cmd/Ctrl+K from anywhere that isn't a text field.
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const field = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
    const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !field;
    const chord = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey;
    if (!slash && !chord) return;
    if (open) {
      if (chord) {
        e.preventDefault();
        input.focus();
        input.select();
      }
      return;
    }
    e.preventDefault();
    openSearch();
  });

  return { open: openSearch, close, isOpen: () => open, warm };
}
