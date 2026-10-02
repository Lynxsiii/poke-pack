/* Batch opening: the combined results of an order, and a way to watch it pack by pack.

   initBatchOpen(deps) -> { show(opened, { title, onClose }), hide() }
     opened = OpenResult (/mnt/project-files/cart-sealed/CONTRACT.md): slim cards,
              boxes[], totals. The layer resolves faces itself (set data first).
     title    optional heading; without it the headline is "Opened N products, M packs"
     onClose  runs when the player closes the layer (not on hide())
   deps (wired in js/app.js):
     root                 the #batch-open element
     findCard(id)         full card record once its set is loaded
     loadSetData(set)     fetch a set's cards (js/app.js); getSet(setId) resolves ids
     getSet(setId), setForCard(card)
     cardFace(card, opts) holo face html (tcgFace)
     inspect(card)        open the card inspector (id, reverse, reverseKind)
     sellValue(card)      market sell value of a card
     playBox(box, { onDone })   the normal pack-by-pack opening for one box of the order;
                          returns false when it could not start. onDone({ collection })
                          runs when the player leaves that box's summary.
     openDialog(el, focus), closeDialog(el)   the app's dialog stack (scroll lock, inert, focus)
     giftHtml(rows, opts) the "in the box" sleeves and coins strip
     toast(message), navigate(path)

   One order can hold 360 packs and 4,000 cards. Nothing here draws more than a
   screen of card faces: pull grids append in chunks and mount faces only near
   the viewport, the way the collection does.

   It looks like the end of a pack (css/opening.css): the cards on a playmat
   on the counter, and one long till receipt beside them with every product,
   every pack's subtotal and the totals (css/pages/batch.css). */
import { RARITY_LABEL, RARITY_ORDER } from "./catalog.js";
import { HIT_RARITIES, isHit } from "./engine.js";
import { coinAmount } from "./money.js?v=1";
import { receiptHtml, pullRow } from "./receipt.js?v=1";

const esc = (value = "") =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Number(n || 0).toLocaleString();
const plural = (n, one, many = `${one}s`) => `${num(n)} ${Number(n) === 1 ? one : many}`;

/** Hits, plus the rares a collector still counts (the holo rare, Pikachu rare). */
const NOTABLE = new Set([...HIT_RARITIES, "Rare Holo", "Pikachu Rare"]);
const CHUNK = 120; // tiles appended per step in a pull grid
const BEST = 12;
const rankOf = (rarity) => RARITY_ORDER.indexOf(rarity);
const rarityWord = (rarity) => RARITY_LABEL[rarity] || rarity;

/** Mount a card face only while its holder is near the screen (see windowFaces in js/app.js). */
function createWindow(scrollEl, render) {
  const reach = 1.5;
  const draw = (holder, near) => {
    const face = holder.firstElementChild;
    if (near) {
      if (!face) holder.innerHTML = render(holder.dataset.k);
    } else if (face && !face.matches(".lit, .settling")) {
      holder.replaceChildren();
    }
  };
  if (!("IntersectionObserver" in window)) {
    return { add: (holders) => holders.forEach((holder) => draw(holder, true)), stop() {} };
  }
  const io = new IntersectionObserver((entries) => entries.forEach((entry) => draw(entry.target, entry.isIntersecting)), {
    root: scrollEl,
    rootMargin: `${reach * 100}% 0px`,
  });
  return {
    add(holders) {
      // Draw what is near now so a view does not blink empty while the observer catches up.
      const box = scrollEl.getBoundingClientRect();
      const span = (box.bottom - box.top) * reach;
      for (const holder of holders) {
        const rect = holder.getBoundingClientRect();
        if (rect.height && rect.bottom > box.top - span && rect.top < box.bottom + span) draw(holder, true);
        io.observe(holder);
      }
    },
    stop: () => io.disconnect(),
  };
}

export function initBatchOpen(deps) {
  const { root } = deps;
  if (!root) return { show() {}, hide() {} };

  let S = null; // the order on screen, or null when the layer is closed
  let gen = 0;
  let windows = [];
  let more = null;

  /* ---- Open / close -------------------------------------------------- */

  const openDialog = (el, focus) => {
    if (deps.openDialog) return deps.openDialog(el, focus);
    el.classList.remove("hidden");
    (focus || el).focus?.({ preventScroll: true });
  };
  const closeDialog = (el) => (deps.closeDialog ? deps.closeDialog(el) : el.classList.add("hidden"));

  function show(opened, { title = "", onClose } = {}) {
    hide();
    const mine = ++gen;
    S = {
      opened: opened || { boxes: [], totals: {} },
      title: String(title || ""),
      onClose,
      A: null,
      view: "results",
      scope: { box: null, source: null },
      mode: "best",
      queue: [],
      watched: 0,
      playing: false,
      resultsTop: 0,
    };
    root.setAttribute("aria-labelledby", "bo-bar");
    root.setAttribute("aria-busy", "true");
    root.innerHTML = `<div class="bo-frame enter">
      <header class="bo-bar"><span class="bo-bar-title" id="bo-bar">${esc(S.title || "Opening results")}</span>
        <button type="button" class="ghost sm" data-bo="close">Close</button></header>
      <div class="bo-scroll" tabindex="-1"><p class="bo-loading">Getting your cards ready.</p></div>
    </div>`;
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("popstate", onPop);
    openDialog(root, root.querySelector("[data-bo=close]"));
    prepare(S.opened)
      .then((A) => {
        if (mine !== gen || !S) return;
        S.A = A;
        paint();
      })
      .catch(() => {
        if (mine !== gen || !S) return;
        scrollEl().innerHTML = `<div class="bo-body"><h1 class="bo-title" tabindex="-1">Couldn't show these cards</h1><p class="bo-lede">They're in your collection.</p></div>`;
      })
      .finally(() => {
        if (mine !== gen || !S) return;
        root.removeAttribute("aria-busy");
        const sc = scrollEl();
        (sc.querySelector(".bo-title") || sc).focus({ preventScroll: true });
      });
  }

  /** Close without telling the opener (a route change, a new order replacing this one). */
  function hide() {
    if (!S && root.classList.contains("hidden")) return;
    gen += 1;
    S = null;
    root.inert = false; // a dialog opened above this one leaves it inert
    stopWindows();
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("popstate", onPop);
    closeDialog(root);
    root.classList.add("hidden");
    root.removeAttribute("aria-busy");
    root.textContent = "";
  }

  function close({ collection = false } = {}) {
    if (!S) return;
    const done = S.onClose;
    hide();
    done?.();
    if (collection) deps.navigate?.("/bulk");
  }

  const onPop = () => hide();

  /** Escape steps back from a pull grid, then closes. Capture phase and only while this layer is the top dialog (the app inerts it under the card inspector and the pack opening). */
  function onKey(event) {
    if (event.key !== "Escape" || !S || root.inert) return;
    event.preventDefault();
    if (S.view === "pulls") showResults();
    else close();
  }

  /* ---- Data ---------------------------------------------------------- */

  /** Load every involved set, then flatten the order into light entries (no card copies). */
  async function prepare(opened) {
    const boxes = Array.isArray(opened.boxes) ? opened.boxes : [];
    const sets = new Set();
    for (const box of boxes) {
      sets.add(deps.getSet(box.setId));
      for (const pack of box.packs || []) sets.add(deps.getSet(pack.setId || box.setId));
      for (const card of [...(box.promos || []), ...(box.boxCards || [])]) sets.add(deps.setForCard({ id: card.id }));
    }
    await Promise.all([...sets].filter(Boolean).map((set) => deps.loadSetData(set).catch(() => null)));

    const all = []; // every entry, indexed by its k
    const values = new Map();
    let missing = 0;
    const valueOf = (base) => {
      if (!values.has(base.id)) values.set(base.id, deps.sellValue(base));
      return values.get(base.id);
    };
    const add = (list, slim, source, pack, n) => {
      const base = deps.findCard(slim.id);
      if (!base) {
        missing += n;
        return;
      }
      const reverse = source === 0 && Boolean(slim.reverse);
      const entry = {
        k: all.length,
        id: slim.id,
        reverse,
        reverseKind: reverse && slim.reverseKind ? slim.reverseKind : "",
        wasNew: Boolean(slim.wasNew),
        n,
        source, // 0 pulled from a pack, 1 promo, 2 the rest of the box
        pack,
        name: base.name,
        rarity: base.rarity,
        rank: rankOf(base.rarity),
        value: valueOf(base),
        hit: isHit({ rarity: base.rarity, reverse }),
      };
      all.push(entry);
      list.push(entry);
    };

    let paid = 0;
    let worth = 0;
    const rows = boxes.map((raw, index) => {
      const entries = [];
      for (const slim of raw.promos || []) add(entries, slim, 1, -1, 1);
      (raw.packs || []).forEach((pack, p) => {
        for (const slim of pack.cards || []) add(entries, slim, 0, p, 1);
      });
      for (const slim of raw.boxCards || []) add(entries, slim, 2, -1, Math.max(1, Math.floor(Number(slim.n) || 1)));
      let best = null;
      let value = 0;
      let cards = 0;
      for (const entry of entries) {
        entry.box = index;
        value += entry.value * entry.n;
        cards += entry.n;
        if (!best || entry.value > best.value) best = entry;
      }
      const price = Number(raw.price) || 0;
      paid += price;
      worth += value;
      const same = boxes.filter((other) => other.setId === raw.setId && other.productId === raw.productId);
      return {
        index,
        raw,
        entries,
        best,
        value,
        cards,
        price,
        packs: (raw.packs || []).length,
        nth: same.indexOf(raw) + 1,
        of: same.length,
        watchable: Boolean((raw.packs || []).length || (raw.promos || []).length || (raw.boxCards || []).length || (raw.gear || []).length),
      };
    });

    const flat = rows.flatMap((row) => row.entries);
    const sum = (test) => flat.reduce((n, entry) => n + (test(entry) ? 1 : 0), 0);
    const given = opened.totals || {};
    const pick = (key, fallback) => (Number.isFinite(Number(given[key])) && given[key] != null ? Number(given[key]) : fallback);
    const packs = pick("packs", rows.reduce((n, row) => n + row.packs, 0));
    const totals = {
      products: pick("products", rows.length),
      packs,
      cards: pick("cards", flat.reduce((n, entry) => n + entry.n, 0)),
      newCards: pick("newCards", sum((entry) => entry.wasNew)),
      hits: pick("hits", sum((entry) => entry.hit)),
      reverses: pick("reverses", sum((entry) => entry.reverse)),
    };

    // Rarity tally: pulled hits and notable rarities, plus promos.
    const tally = new Map();
    for (const entry of flat) {
      if (entry.source !== 0 || entry.reverse || !NOTABLE.has(entry.rarity)) continue;
      tally.set(entry.rarity, (tally.get(entry.rarity) || 0) + 1);
    }
    const rarities = [...tally].sort((a, b) => rankOf(b[0]) - rankOf(a[0]));

    // Gear from every box, one row per design.
    const gear = new Map();
    for (const row of rows) {
      for (const item of row.raw.gear || []) {
        const key = `${item.kind}:${item.id}`;
        const have = gear.get(key);
        if (have) {
          have.qty += Number(item.qty) || 1;
          have.wasNew = have.wasNew || Boolean(item.wasNew);
        } else gear.set(key, { kind: item.kind, id: item.id, qty: Number(item.qty) || 1, wasNew: Boolean(item.wasNew) });
      }
    }

    return { all, rows, totals, rarities, gear: [...gear.values()], paid, worth, missing };
  }

  const byValue = (a, b) => b.value - a.value || b.rank - a.rank || a.k - b.k;

  /** The same card pulled again is one tile with a count. */
  function collapse(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const key = `${entry.id}|${entry.reverse ? 1 : 0}`;
      const group = groups.get(key);
      if (group) {
        group.copies += entry.n;
        group.fresh = group.fresh || entry.wasNew;
      } else groups.set(key, { entry, copies: entry.n, fresh: entry.wasNew });
    }
    return [...groups.values()];
  }

  /* ---- Markup -------------------------------------------------------- */

  const money = (n) => `<span class="bo-money">${coinAmount(n)}</span>`;

  function tileHtml(entry, { copies = entry.n, fresh = entry.wasNew, sub = "", where = "", i = -1 } = {}) {
    const label = `${entry.name}, ${rarityWord(entry.rarity)}${entry.reverse ? ", reverse" : ""}${fresh ? ", new" : ""}`;
    // "New" is a word in the line under the card, not a badge on every face.
    const note = [sub, fresh ? (sub ? "new" : "New") : ""].filter(Boolean).join(", ");
    return `<article class="bo-tile"${i >= 0 ? ` style="--i:${i}"` : ""}>
      <button type="button" class="bo-face" data-k="${entry.k}" aria-label="${esc(label)}"></button>
      <p class="bo-name"><span>${esc(entry.name)}</span>${copies > 1 ? `<small>×${copies}</small>` : ""}</p>
      <p class="bo-sub">${money(entry.value)}${note ? `<span>${esc(note)}</span>` : ""}</p>
      ${where ? `<p class="bo-where">${esc(where)}</p>` : ""}
    </article>`;
  }

  /** Which product a card came from, for a grid that mixes several. */
  function whereWord(entry) {
    const row = S.A.rows[entry.box];
    const set = deps.getSet(row.raw.setId);
    const name = `${set?.name || row.raw.name}${row.of > 1 ? ` ${row.nth}` : ""}`;
    return entry.pack >= 0 ? `${name}, pack ${entry.pack + 1}` : `${name}, ${row.raw.name}`;
  }

  const sourceWord = (entry) =>
    entry.source === 1 ? "Promo" : entry.source === 2 ? "In the box" : entry.pack >= 0 ? `Pack ${entry.pack + 1}` : "";

  function headline(A) {
    const { products, packs } = A.totals;
    return `Opened ${plural(products, "product")}${packs ? `, ${plural(packs, "pack")}` : ""}`;
  }

  function resultsHtml() {
    const A = S.A;
    const t = A.totals;
    const rows = A.rows;
    if (!rows.length) {
      return `<div class="bo-body"><h1 class="bo-title">Nothing was opened</h1></div>`;
    }
    const lead = headline(A);
    const best = collapse(A.all).sort((a, b) => byValue(a.entry, b.entry)).slice(0, BEST);

    const promos = collapse(A.all.filter((entry) => entry.source === 1)).sort((a, b) => byValue(a.entry, b.entry));
    const boxed = collapse(A.all.filter((entry) => entry.source === 2)).sort((a, b) => byValue(a.entry, b.entry));
    const boxedTotal = boxed.reduce((n, group) => n + group.copies, 0);

    // The cards lie on the mat: the best pulls, then the promos and the rest of the boxes.
    const mat = [
      best.length
        ? `<section class="bo-section" aria-labelledby="bo-h-best">
        <div class="bo-section-head">
          <h2 id="bo-h-best">Best pulls</h2>
          <button type="button" class="link-btn" data-bo-pulls="all">Browse all ${num(A.all.reduce((n, entry) => n + entry.n, 0))} cards</button>
        </div>
        <div class="bo-grid bo-best">${best
          .map(({ entry, copies, fresh }, i) => tileHtml(entry, { copies, fresh, sub: sourceWord(entry), i }))
          .join("")}</div>
      </section>`
        : "",
      promos.length
        ? `<section class="bo-section" aria-labelledby="bo-h-promos">
              <h2 id="bo-h-promos">Promos</h2>
              <div class="bo-grid">${promos.map(({ entry, copies, fresh }) => tileHtml(entry, { copies, fresh })).join("")}</div>
            </section>`
        : "",
      boxed.length
        ? `<section class="bo-section" aria-labelledby="bo-h-boxed">
              <div class="bo-section-head">
                <h2 id="bo-h-boxed">Rest of the boxes</h2>
                ${boxed.length > BEST ? `<button type="button" class="link-btn" data-bo-pulls="boxed">See all ${num(boxedTotal)} cards</button>` : ""}
              </div>
              <p class="bo-quiet">${num(boxedTotal)} cards that come with the product: deck lists and Energy, kept in copies.</p>
              <div class="bo-grid">${boxed
                .slice(0, BEST)
                .map(({ entry, copies, fresh }) => tileHtml(entry, { copies, fresh }))
                .join("")}</div>
            </section>`
        : "",
    ].join("");

    const list =
      rows.length > 1
        ? `<section class="bo-section bo-order" aria-labelledby="bo-h-list">
            <h2 id="bo-h-list">In this order</h2>
            <ul class="bo-list">${rows.map(rowHtml).join("")}</ul>
          </section>`
        : "";

    const giftBlock = A.gear.length
      ? `<section class="bo-section bo-gear" aria-labelledby="bo-h-gear"><h2 id="bo-h-gear">Sleeves and coins</h2>${deps.giftHtml?.(A.gear, { also: false }) || ""}</section>`
      : "";

    return `<div class="bo-body bo-results">
      <div class="bo-head">
        <h1 class="bo-title" id="bo-title" tabindex="-1">${esc(S.title || lead)}</h1>
        <p class="bo-lede">${S.title ? `${esc(lead)}. ` : ""}They're already in your collection.</p>
      </div>
      <div class="bo-table">
        <div class="bo-main">
          ${mat ? `<div class="bo-mat">${mat}</div>` : ""}
          ${list}
          ${giftBlock}
          ${A.missing ? `<p class="bo-quiet bo-missing">${plural(A.missing, "card")} couldn't be shown. They're in your collection.</p>` : ""}
        </div>
        <div class="bo-side">${receiptFor(A)}</div>
      </div>
    </div>`;
  }

  /**
   * The order's till receipt: each product at its price, every pack with its
   * subtotal and the hits under it, the promos and the rest of each box, what
   * each product paid out, then the hits by rarity and the totals. Past 60
   * packs a product prints one line for its packs and its best pull.
   */
  function receiptFor(A) {
    const t = A.totals;
    const perPack = t.packs <= 60;
    const cents = (n) => Math.round(n * 100) / 100;
    const worth = (list) => cents(list.reduce((sum, entry) => sum + entry.value * entry.n, 0));
    const top = A.all.reduce((keep, entry) => (!keep || byValue(entry, keep) < 0 ? entry : keep), null);
    const face = (entry) => {
      const base = deps.findCard(entry.id) || { name: entry.name, rarity: entry.rarity };
      return { ...base, reverse: entry.reverse, reverseKind: entry.reverseKind, wasNew: entry.wasNew };
    };
    const pull = (entry, sub) => ({ ...pullRow(face(entry), { value: entry.value, hit: entry === top }), sub });
    const groups = A.rows.map((row) => {
      const set = deps.getSet(row.raw.setId);
      const lines = [{ name: `${set?.name ? `${set.name} ` : ""}${row.raw.name}${row.of > 1 ? ` ${row.nth}` : ""}`, value: row.price }];
      for (const entry of row.entries.filter((entry) => entry.source === 1)) {
        lines.push({ ...pull(entry, 1), tags: ["promo", ...(entry.wasNew ? ["new"] : [])] });
      }
      const pulled = row.entries.filter((entry) => entry.source === 0);
      if (row.packs && perPack) {
        for (let p = 0; p < row.packs; p += 1) {
          const cards = pulled.filter((entry) => entry.pack === p);
          lines.push({ name: `Pack ${p + 1}`, value: worth(cards), sub: 1 });
          for (const entry of cards.filter((entry) => entry.hit)) lines.push(pull(entry, 2));
        }
      } else if (row.packs) {
        lines.push({ name: plural(row.packs, "pack"), value: worth(pulled), sub: 1 });
        const lead = pulled.reduce((keep, entry) => (!keep || byValue(entry, keep) < 0 ? entry : keep), null);
        if (lead) lines.push(pull(lead, 2));
      }
      const rest = row.entries.filter((entry) => entry.source === 2);
      if (rest.length) {
        lines.push({ name: "Rest of the box", code: `${num(rest.reduce((n, entry) => n + entry.n, 0))} cards`, value: worth(rest), sub: 1 });
      }
      lines.push({ name: "Pulled", value: cents(row.value), sub: 1 });
      return lines;
    });
    const net = cents(A.worth - A.paid);
    return receiptHtml({
      label: "Receipt for this order",
      head: [S.title || "Opened", `${plural(t.products, "product")}${t.packs ? `, ${plural(t.packs, "pack")}` : ""}`],
      groups: [...groups, A.rarities.map(([rarity, n]) => ({ name: rarityWord(rarity), value: num(n) }))],
      totals: [
        ["Paid", cents(A.paid)],
        ["New cards", num(t.newCards)],
        t.packs ? ["Hits", num(t.hits)] : null,
        Math.abs(net) < 0.005 ? ["Even", "0"] : net > 0 ? ["Ahead", net] : ["Down", -net],
      ],
      total: ["Pulls total", cents(A.worth)],
      foot: ["Coins are virtual.", "Nothing here costs real money."],
    });
  }

  function rowHtml(row) {
    const set = deps.getSet(row.raw.setId);
    const best = row.best;
    return `<li class="bo-row" data-row="${row.index}">
      <span class="bo-row-face">${best ? `<button type="button" class="bo-face" data-k="${best.k}" aria-label="Inspect ${esc(best.name)}"></button>` : ""}</span>
      <div class="bo-row-main">
        <h3>${esc(row.raw.name)}${row.of > 1 ? ` <small>${row.nth} of ${row.of}</small>` : ""}</h3>
        <p class="bo-row-meta">${esc(set?.name || "")}${row.packs ? `, ${plural(row.packs, "pack")}` : ""}</p>
        ${best ? `<p class="bo-row-best">Best pull ${esc(best.name)} ${money(best.value)}</p>` : ""}
      </div>
      <div class="bo-row-actions">
        ${row.watchable ? `<button type="button" class="link-btn" data-bo-watch="${row.index}">${row.packs ? "Watch pack by pack" : "Look through the box"}</button>` : ""}
        <button type="button" class="link-btn" data-bo-pulls="${row.index}">View all pulls</button>
      </div>
    </li>`;
  }

  function footHtml() {
    const A = S.A;
    const watchable = A.rows.filter((row) => row.watchable);
    const queued = S.queue.length;
    const many = A.rows.length > 1;
    const word = A.totals.packs
      ? queued
        ? "Watch next box"
        : many
          ? "Watch all pack by pack"
          : "Watch pack by pack"
      : queued
        ? "Next box"
        : many
          ? "Look through every box"
          : "Look through the box";
    const primary = watchable.length || queued ? `<button type="button" class="solid" data-bo-watch="${queued ? "next" : "all"}">${word}</button>` : "";
    return `${noteHtml()}${primary}
      <button type="button" class="${primary ? "ghost" : "solid"}" data-bo="collection">View collection</button>
      <button type="button" class="ghost" data-bo="close">Close</button>`;
  }

  function noteHtml() {
    const A = S.A;
    if (!S.queue.length) return "";
    const next = A.rows[S.queue[0]];
    const total = S.watched + S.queue.length;
    return `<div class="bo-watch" role="status">
      <p><b>${A.totals.packs ? "Watched" : "Seen"} ${S.watched} of ${total}.</b> Up next, ${esc(next.raw.name)}${next.of > 1 ? ` ${next.nth} of ${next.of}` : ""}.</p>
      <button type="button" class="link-btn" data-bo="stop">Stop watching</button>
    </div>`;
  }

  /* ---- Painting ------------------------------------------------------ */

  const scrollEl = () => root.querySelector(".bo-scroll");

  function stopWindows() {
    windows.forEach((win) => win.stop());
    windows = [];
    more?.disconnect();
    more = null;
  }

  function frame(barLeft, body, foot) {
    root.innerHTML = `<div class="bo-frame">
      <header class="bo-bar">${barLeft}<button type="button" class="ghost sm" data-bo="close">Close</button></header>
      <div class="bo-scroll" tabindex="-1">${body}</div>
      ${foot ? `<footer class="bo-foot">${foot}</footer>` : ""}
    </div>`;
  }

  /** Faces for a set of holders: the results page draws its few tiles at once. */
  function mountFaces(scope = root) {
    const holders = [...scope.querySelectorAll(".bo-face[data-k]")];
    if (!holders.length) return;
    const win = createWindow(scrollEl(), renderFace);
    windows.push(win);
    win.add(holders);
  }

  function renderFace(k) {
    const entry = S?.A.all[Number(k)];
    const base = entry && deps.findCard(entry.id);
    if (!base) return "";
    const card = { ...base, reverse: entry.reverse, wasNew: entry.wasNew };
    if (entry.reverseKind) card.reverseKind = entry.reverseKind;
    return deps.cardFace(card, { small: true, lazy: true });
  }

  function paint() {
    if (!S?.A) return;
    stopWindows();
    S.view = "results";
    frame(`<span class="bo-bar-title" id="bo-bar">${esc(S.title || "Opening results")}</span>`, resultsHtml(), footHtml());
    root.setAttribute("aria-labelledby", S.A.rows.length ? "bo-title" : "bo-bar");
    mountFaces();
  }

  function showResults(focusSel) {
    if (!S?.A) return;
    paint();
    const sc = scrollEl();
    sc.scrollTop = S.resultsTop;
    const target = (focusSel && root.querySelector(focusSel)) || root.querySelector(".bo-foot .solid") || sc;
    target.focus({ preventScroll: true });
  }

  /** Repaint only the footer (a box finished: the page the player was reading stays put). */
  function paintChrome() {
    if (!S?.A || S.view !== "results") return;
    root.querySelector(".bo-foot").innerHTML = footHtml();
  }

  /* ---- Pull grids ---------------------------------------------------- */

  function pullList() {
    const { box, source } = S.scope;
    let list = S.A.all.filter((entry) => (box == null || entry.box === box) && (source == null || entry.source === source));
    if (S.mode === "hits") list = list.filter((entry) => entry.hit);
    if (S.mode === "new") list = list.filter((entry) => entry.wasNew);
    if (S.mode === "pack") return list.slice().sort((a, b) => a.k - b.k);
    if (S.mode === "hits") return list.slice().sort((a, b) => b.rank - a.rank || byValue(a, b));
    return list.slice().sort(byValue);
  }

  function showPulls(scope, mode = "best") {
    if (!S?.A) return;
    if (S.view === "results") S.resultsTop = scrollEl().scrollTop;
    S.view = "pulls";
    S.scope = scope;
    S.mode = mode;
    paintPulls();
    root.querySelector(".bo-back")?.focus({ preventScroll: true });
  }

  function paintPulls() {
    stopWindows();
    const A = S.A;
    const { box, source } = S.scope;
    const row = box == null ? null : A.rows[box];
    const pool = A.all.filter((entry) => (box == null || entry.box === box) && (source == null || entry.source === source));
    const hits = pool.filter((entry) => entry.hit).length;
    const fresh = pool.filter((entry) => entry.wasNew).length;
    const list = pullList();
    const name = row ? `${row.raw.name}${row.of > 1 ? ` ${row.nth} of ${row.of}` : ""}` : source === 2 ? "Rest of the boxes" : "Everything you opened";
    const modes = [
      ["best", "Best first", ""],
      ["pack", "Pack order", ""],
      ["hits", "Hits", hits],
      ["new", "New", fresh],
    ];
    frame(
      `<button type="button" class="link-btn bo-back" data-bo="back">Back to results</button>`,
      `<div class="bo-body">
        <div class="bo-head">
          <h1 class="bo-title" id="bo-pulls-title" tabindex="-1">${esc(name)}</h1>
          <p class="bo-lede">${plural(pool.reduce((n, entry) => n + entry.n, 0), "card")}${row && row.packs ? ` from ${plural(row.packs, "pack")}` : ""}.</p>
        </div>
        <div class="bo-modes" role="group" aria-label="Show">${modes
          .map(
            ([key, label, n]) =>
              `<button type="button" class="${S.mode === key ? "on" : ""}" aria-pressed="${S.mode === key}" data-bo-mode="${key}">${label}${n !== "" ? ` <small>${num(n)}</small>` : ""}</button>`
          )
          .join("")}</div>
        ${list.length ? `<div class="bo-mat"><div class="bo-grid bo-all" data-grid></div><div class="bo-more" data-more></div></div>` : `<p class="bo-quiet">Nothing here.</p>`}
      </div>`,
      ""
    );
    root.setAttribute("aria-labelledby", "bo-pulls-title");
    if (!list.length) return;
    const grid = root.querySelector("[data-grid]");
    const sentinel = root.querySelector("[data-more]");
    const win = createWindow(scrollEl(), renderFace);
    windows.push(win);
    let shown = 0;
    const next = () => {
      const slice = list.slice(shown, shown + CHUNK);
      if (!slice.length) return;
      const start = grid.childElementCount;
      const mixed = box == null && A.rows.length > 1;
      grid.insertAdjacentHTML(
        "beforeend",
        slice.map((entry) => tileHtml(entry, { sub: mixed ? "" : sourceWord(entry), where: mixed ? whereWord(entry) : "" })).join("")
      );
      shown += slice.length;
      win.add([...grid.children].slice(start).map((tile) => tile.querySelector(".bo-face")));
      if (shown >= list.length) {
        more?.disconnect();
        sentinel.remove();
      }
    };
    next();
    if (shown < list.length) {
      if ("IntersectionObserver" in window) {
        more = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && next(), {
          root: scrollEl(),
          rootMargin: "120% 0px",
        });
        more.observe(sentinel);
      } else while (shown < list.length) next();
    }
  }

  /* ---- Watching pack by pack ----------------------------------------- */

  async function watch(order) {
    if (!S?.A || S.playing || !order.length) return;
    const [first, ...rest] = order;
    S.queue = rest;
    play(first);
  }

  async function play(index) {
    const mine = gen;
    const box = S.A.rows[index].raw;
    S.playing = true;
    let finished = false;
    const done = (info = {}) => {
      if (finished || mine !== gen || !S) return;
      finished = true;
      S.playing = false;
      S.watched += 1;
      if (info.collection) {
        close({ collection: true });
        return;
      }
      paintChrome();
      const again = S.queue.length ? null : root.querySelector(`.bo-row [data-bo-watch="${index}"]`);
      (again || root.querySelector(".bo-foot .solid") || scrollEl()).focus({ preventScroll: true });
    };
    try {
      const started = await deps.playBox(box, { onDone: done });
      if (started === false && !finished) {
        finished = true;
        S.playing = false;
      }
    } catch (err) {
      finished = true;
      if (S) S.playing = false;
      deps.toast?.("Couldn't play that one.");
    }
  }

  const watchNext = () => {
    if (!S?.queue.length) return;
    const [first, ...rest] = S.queue;
    S.queue = rest;
    play(first);
  };

  /* ---- Events -------------------------------------------------------- */

  root.addEventListener("click", (event) => {
    if (!S) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const face = target.closest(".bo-face[data-k]");
    if (face) {
      const entry = S.A?.all[Number(face.dataset.k)];
      if (entry) deps.inspect?.({ id: entry.id, reverse: entry.reverse, reverseKind: entry.reverseKind });
      return;
    }
    const act = target.closest("[data-bo]")?.dataset.bo;
    if (act === "close") return close();
    if (act === "collection") return close({ collection: true });
    if (act === "back") {
      const { box, source } = S.scope;
      return showResults(`[data-bo-pulls="${box != null ? box : source === 2 ? "boxed" : "all"}"]`);
    }
    if (act === "stop") {
      S.queue = [];
      paintChrome();
      root.querySelector(".bo-foot .solid")?.focus({ preventScroll: true });
      return;
    }
    const watchBtn = target.closest("[data-bo-watch]");
    if (watchBtn) {
      const which = watchBtn.dataset.boWatch;
      if (which === "next") return watchNext();
      if (!S.A) return;
      if (which === "all") {
        const order = S.A.rows.filter((row) => row.watchable).map((row) => row.index);
        S.watched = 0;
        return watch(order);
      }
      S.watched = 0;
      return watch([Number(which)]);
    }
    const pulls = target.closest("[data-bo-pulls]");
    if (pulls) {
      const which = pulls.dataset.boPulls;
      return showPulls(which === "all" ? { box: null, source: null } : which === "boxed" ? { box: null, source: 2 } : { box: Number(which), source: null });
    }
    const mode = target.closest("[data-bo-mode]");
    if (mode && S.view === "pulls") {
      S.mode = mode.dataset.boMode;
      paintPulls();
      root.querySelector(`[data-bo-mode="${S.mode}"]`)?.focus({ preventScroll: true });
    }
  });

  return { show, hide };
}
