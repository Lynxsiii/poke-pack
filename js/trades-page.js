/* Trading: the /trades pages. Offer cards, slabs and coins to another player
   for some of theirs; they accept, decline or counter.

   The Worker (worker/trades.js) checks ownership, prices everything and does
   the swap in one statement; this module only builds the request and shows
   what came back. The rules it previews (how uneven a trade may be) are the
   shared ones in js/trade-rules.js, and the server has the last word.

     /trades                    inbox, sent, history, start a trade, who may send you offers
     /trades/new/<handle>       build an offer (/trades/new/<handle>/<id> answers offer <id> with a counter)
     /trades/<id>               one offer: accept, counter, decline or cancel

   deps: { root, api, user, getSave, applySave, refreshSave, cardEntries, inspect, toast,
           navigate, signIn, friends, faceHtml, levelTag } */
import { esc, coins, icon } from "./battle-kit.js";
import { coinAmount, coinText } from "./money.js?v=2";
import { slabTileHTML, timeLeft, uuid } from "./casino-kit.js";
import { gateLock, gateNoticeHTML } from "./gate-notice.js";
import { TRADE_RULES, TRADE_FROM, TRADE_FROM_WORDS, tradeGap, coinsToEven } from "./trade-rules.js?v=1";
import { hubWordsHtml } from "./social-hub.js?v=3";

/** The paths this page answers. app.js uses it to route and to allow navigate(). */
export const TRADES_ROUTE = /^\/trades(?:\/new\/([a-z0-9_]{3,16})(?:\/([a-f0-9]{20}))?|\/([a-f0-9]{20}))?$/i;

const POLL_MS = 15000;
const PICK_PAGE = 60;
const money = (value) => `<span class="price">${coinAmount(value)}</span>`;
const cents = (value) => Math.round(Number(value) * 100);
const plural = (n, one, many = `${one}s`) => `${Number(n).toLocaleString("en-US")} ${n === 1 ? one : many}`;
const coinWords = (value) => `${coins(value)} ${Number(value) === 1 ? "coin" : "coins"}`;
const STATUS_WORDS = { open: "Waiting", accepted: "Traded", declined: "Declined", cancelled: "Cancelled", countered: "Countered", expired: "Expired" };
const NONE_BALL = '<i class="tr-ball" aria-hidden="true"></i>';
/** Time left on an offer: days once it is two or more, then the casino's hours and minutes. */
const leftWords = (ms) => (ms >= 2 * 86400000 ? `${Math.floor(ms / 86400000)}d` : timeLeft(ms) || "0m");
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("no-motion");

/** Roll the figure in a .price from one amount to the next. Decoration only: the end text is the real one. */
function rollPrice(el, from, to) {
  const node = el?.querySelector(".coin-i")?.nextSibling;
  if (!node || node.nodeType !== 3 || still() || !Number.isFinite(from) || Math.round(from * 100) === Math.round(to * 100)) return;
  const dp = Math.round(to * 100) % 100 || Math.round(from * 100) % 100 ? 2 : 0;
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const start = performance.now();
  el.classList.add("is-rolling");
  node.nodeValue = fmt(from);
  const step = (now) => {
    if (!node.isConnected) return;
    const t = Math.min(1, (now - start) / 440);
    if (t >= 1) { node.nodeValue = coinText(to); el.classList.remove("is-rolling"); return; }
    node.nodeValue = fmt(from + (to - from) * (1 - (1 - t) ** 3));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A segmented key's ink plate slides from the key that was on (the hub redraws the keys). */
function slideThumb(keys, from) {
  const thumb = keys?.querySelector(".seg-thumb");
  if (!thumb || still() || !(from >= 0)) return;
  const to = keys.style.getPropertyValue("--i");
  if (String(from) === to) return;
  keys.style.setProperty("--i", String(from));
  void thumb.offsetWidth;
  keys.style.setProperty("--i", to);
}

const SWAP_ICON = '<svg class="tr-swap" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M15.5 4.5 19 8l-3.5 3.5M19 16H5M8.5 12.5 5 16l3.5 3.5"/></svg>';

export function initTrades(deps) {
  const root = deps.root;
  if (!root) return { show() {}, hide() {}, count: () => 0 };
  root.classList.add("trades-view");
  const toast = (msg) => deps.toast?.(msg);
  const navigate = (path) => deps.navigate?.(path);
  const user = () => deps.user?.() || null;

  let visible = false;
  let route = { kind: "hub", handle: "", id: "", counter: "" };
  let token = 0;
  let timer = 0;
  let sheet = null;

  // The hub.
  let hub = null;
  let hubTab = "inbox";
  let hubError = "";
  let startHandle = "";
  let hubDrawn = "";
  let oneDrawn = ""; // the offer (and its state) last drawn, so a poll doesn't replay the cards dealing in

  // One offer.
  let one = null; // { trade, check, counterId }
  let oneError = "";
  let oneBusy = "";
  let confirming = false;

  // The builder.
  let build = null;
  let drawnItems = { give: null, take: null }; // the builder's things last drawn on each side, so only a new one drops in
  let figs = null; // the builder's totals and balance last drawn, so they roll and slide to the next ones

  const emptySide = () => ({ cards: new Map(), slabs: new Set(), coins: "" });

  // ---- Small pieces ----------------------------------------------------------
  const face = (u, size = "sm") => (u?.gone ? `<span class="user-face ${size} tr-gone" aria-hidden="true"></span>` : deps.faceHtml?.(u, size) || "");
  const nameOf = (u) => (u?.gone ? "Deleted trainer" : `@${u?.handle || ""}`);
  const lockOf = () => gateLock("trading", user());
  const sideCount = (side) => (side.cards || []).reduce((n, c) => n + c.qty, 0) + (side.slabs || []).length;
  const sideWords = (side) => {
    const n = (side.cards || []).reduce((sum, c) => sum + c.qty, 0);
    const s = (side.slabs || []).length;
    const parts = [];
    if (n) parts.push(plural(n, "card"));
    if (s) parts.push(plural(s, "slab"));
    if (Number(side.coins) > 0) parts.push(coinWords(side.coins));
    return parts.join(", ") || "Nothing";
  };

  /** A row of small overlapping pictures for a list row: the most valuable things first. */
  function stackHTML(side, max = 4) {
    const items = [
      ...(side.slabs || []).map((s) => ({ v: s.value, html: slabTileHTML(s, "mini") })),
      ...(side.cards || []).map((c) => ({ v: c.value, html: `<img src="${esc(c.small || c.image)}" alt="" loading="lazy" decoding="async" />` })),
    ].sort((a, b) => b.v - a.v);
    const shown = items.slice(0, max);
    const more = sideCount(side) - shown.length;
    const coin = Number(side.coins) > 0 ? `<span class="tr-stack-coins">${money(side.coins)}</span>` : "";
    if (!shown.length && !coin) return `<span class="tr-stack tr-stack-none">Nothing</span>`;
    return `<span class="tr-stack">${shown.map((it) => `<span class="tr-stack-it">${it.html}</span>`).join("")}${more > 0 ? `<span class="tr-stack-more">+${more}</span>` : ""}${coin}</span>`;
  }

  /** A side drawn in full: every card and slab with its count and value. Cards open the inspector. */
  function itemsHTML(side, { empty = "Nothing", fresh = null } = {}) {
    let dropped = 0;
    const drop = (key) => (fresh?.has(key) ? ` is-new" style="--i:${dropped++}` : "");
    const slabs = (side.slabs || []).map(
      (s) => `<button type="button" class="tr-item tr-item-slab${drop(`s${s.id}`)}" data-inspect="${esc(s.cardId)}" aria-label="${esc(`${s.name}, RIP ${s.grade}, ${coinWords(s.value)}`)}">
        ${slabTileHTML(s, "tile")}
        <span class="tr-item-name">${esc(s.name)}</span>
        <span class="tr-item-meta"><span>RIP ${esc(String(s.grade))}${s.blackLabel ? " BL" : ""}</span>${money(s.value)}</span>
      </button>`
    );
    const cards = (side.cards || []).map((c) => {
      const rev = c.rev > 0 ? (c.rev === c.qty ? "Reverse holo" : `${c.rev} reverse holo`) : "";
      return `<button type="button" class="tr-item${drop(c.id)}" data-inspect="${esc(c.id)}"${c.rev === c.qty && c.rev > 0 ? ' data-reverse="1"' : ""} aria-label="${esc(`${c.qty} ${c.name}${rev ? `, ${rev}` : ""}, ${coinWords(c.value)} each`)}">
        <span class="tr-item-art"><img src="${esc(c.small || c.image)}" alt="" loading="lazy" decoding="async" />${c.qty > 1 ? `<b class="tr-qty">${c.qty}</b>` : ""}</span>
        <span class="tr-item-name">${esc(c.name)}</span>
        <span class="tr-item-meta"><span>${esc(rev || String(c.number ?? ""))}</span>${money(c.value)}</span>
      </button>`;
    });
    const coin = Number(side.coins) > 0 ? `<p class="tr-coinline"><span>Coins</span>${money(side.coins)}</p>` : "";
    if (!slabs.length && !cards.length && !coin) return `<div class="tr-empty-side"><span class="tr-slot">${NONE_BALL}</span><p class="tr-none">${esc(empty)}</p></div>`;
    return `${slabs.length || cards.length ? `<div class="tr-items">${slabs.join("")}${cards.join("")}</div>` : ""}${coin}`;
  }

  /** The fairness gauge: an HP bar of how close the two sides are (the smaller side as a share of the bigger),
      a tick where the stranger rule sits, the two totals, and one line that says who is down. */
  function balanceHTML(giveValue, takeValue, note = "", bad = false) {
    const g = cents(giveValue);
    const t = cents(takeValue);
    const big = Math.max(g, t);
    const share = big > 0 ? Math.min(g, t) / big : 1;
    const pct = Math.round(share * 100);
    const shape = tradeGap(g, t);
    const tone = bad ? "low" : shape.even ? "ok" : "mid";
    const word = big === 0 ? "Empty" : !shape.gap ? "Even" : shape.even ? "Fair" : "Uneven";
    return `<div class="tr-bal" role="group" aria-label="Trade balance" data-tone="${tone}">
      <div class="tr-gauge rt-hp">
        <em>${word}</em>
        <div class="rt-track tr-track"><i style="transform:scaleX(${big ? share.toFixed(4) : 0})"></i><b class="tr-tick" style="left:${Math.round(TRADE_RULES.evenShare * 100)}%" aria-hidden="true"></b></div>
        <span class="tr-pct">${big ? `${pct}%` : "0%"}</span>
      </div>
      <div class="tr-bal-sums">
        <span><small>You give</small>${money(giveValue)}</span>
        <span><small>You get</small>${money(takeValue)}</span>
      </div>
      ${note ? `<p class="tr-bal-note${bad ? " is-bad" : ""}">${esc(note)}</p>` : ""}
    </div>`;
  }

  const gapLine = (giveValue, takeValue) => {
    const diff = cents(takeValue) - cents(giveValue);
    if (!diff) return "An even trade.";
    return diff > 0 ? `You come out ${coinWords(diff / 100)} ahead.` : `You're ${coinWords(-diff / 100)} down on this one.`;
  };

  // ---- The hub -----------------------------------------------------------------
  function rowHTML(t) {
    const them = t.mine === "from" ? t.to : t.from;
    const get = t.mine === "from" ? t.take : t.give;
    const giveSide = t.mine === "from" ? t.give : t.take;
    const open = t.status === "open";
    const when = open ? `${leftWords(t.expiresAt - (hub?.now || Date.now()))} left` : STATUS_WORDS[t.status] || t.status;
    const lead = open ? (t.mine === "to" ? `${nameOf(them)} offers` : `To ${nameOf(them)}`) : nameOf(them);
    return `<li><a class="tr-row" href="/trades/${esc(t.id)}" data-trade-link>
      <span class="tr-row-who"><span class="tr-lab">${face(them)}</span><span class="tr-row-copy"><b>${esc(lead)}</b><small class="tr-when" data-st="${esc(t.status)}">${esc(when)}</small></span></span>
      <span class="tr-row-sides">
        <span class="tr-row-side"><small>You get</small>${stackHTML(get)}</span>
        ${SWAP_ICON}
        <span class="tr-row-side"><small>You give</small>${stackHTML(giveSide)}</span>
      </span>
    </a></li>`;
  }

  function startHTML() {
    const friends = (deps.friends?.()?.friends || []).slice(0, 30);
    const rows = friends
      .map(
        (f) => `<li><a class="tr-friend" href="/trades/new/${esc(f.handle)}" data-trade-link>
          <span class="tr-lab">${face(f)}</span><span class="tr-friend-name"><b>${deps.levelTag?.(f) || ""}<span class="tr-nm">${esc(f.name)}</span></b><small>${f.online ? `<i class="live-dot" aria-hidden="true"></i><em class="live-word">Online</em>` : `@${esc(f.handle)}`}</small></span>
          <span class="tr-friend-go ghost sm">Trade</span>
        </a></li>`
      )
      .join("");
    return `<section class="plate tr-start" aria-labelledby="tr-start-h">
      <div class="plate-head"><h2 id="tr-start-h">Start a trade</h2></div>
      <form class="tr-find" data-find>
        <label class="sr-only" for="tr-find-handle">Trainer's handle</label>
        <input id="tr-find-handle" name="handle" maxlength="17" placeholder="@handle" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(startHandle)}" />
        <button type="submit" class="solid">Open</button>
      </form>
      ${rows ? `<ul class="rows tr-friends">${rows}</ul>` : `<div class="tr-empty-box tr-empty-sm">${NONE_BALL}<p>Add friends from the Social page and they show up here. Friends can also send each other uneven trades.</p></div>`}
    </section>`;
  }

  function rulesHTML() {
    if (!hub) return "";
    const l = hub.limits;
    const from = hub.from || "all";
    const i = Math.max(0, TRADE_FROM.indexOf(from));
    return `<section class="plate tr-rules" aria-labelledby="tr-rules-h">
      <div class="plate-head"><h2 id="tr-rules-h">How trades work</h2></div>
      <ul class="tr-lines">
        <li>Nothing is held while an offer waits. The swap happens the moment it's accepted, if you both still have everything.</li>
        <li>Everything counts at its sell value, a slab at the better of graded and raw. Slabs change hands without their guard.</li>
        <li>With players who aren't your friends, a trade has to be close to even. Coins can make up the difference.</li>
        <li>Uneven trades count toward a daily limit that grows with your level.</li>
      </ul>
      ${[["Given away today", l.given], ["Come out ahead today", l.got]]
        .map(([label, v]) => {
          const used = Number(l.cap) > 0 ? Math.max(0, Math.min(1, Number(v) / Number(l.cap))) : 0;
          return `<div class="tr-limit"><p class="kv"><span>${label}</span><span>${money(v)}<small class="tr-of"> of ${coins(l.cap)}</small></span></p>
            <div class="rt-hp tr-limit-hp" aria-hidden="true"><div class="rt-track"><i style="transform:scaleX(${(1 - used).toFixed(4)})"></i></div></div></div>`;
        })
        .join("")}
      <div class="tr-from">
        <span id="tr-from-l">Who can send you offers</span>
        <div class="keys" role="group" aria-labelledby="tr-from-l" style="--n:${TRADE_FROM.length};--i:${i}">
          <i class="seg-thumb" aria-hidden="true"></i>
          ${TRADE_FROM.map((id) => `<button type="button" class="seg-key" data-from="${id}" aria-pressed="${id === from}"><span>${TRADE_FROM_WORDS[id]}</span></button>`).join("")}
        </div>
      </div>
    </section>`;
  }

  function paintHub() {
    const lock = lockOf();
    const offers = deps.friends?.() || {};
    const head = `<header class="tr-head hub-head">${hubWordsHtml("trades", { friends: offers.incoming?.length || 0, trades: offers.trades || 0 })}<h1 class="page-title">Trades</h1></header>`;
    if (!user()) {
      root.innerHTML = `<div class="tr-page">${head}
        <div class="tr-empty-box tr-gate">${NONE_BALL}<p class="tr-lede">Swap cards, slabs and coins with other trainers. Sign in to send and answer offers.</p>
        <div class="tr-actions"><button type="button" class="solid" data-signin>Sign in</button></div></div></div>`;
      return;
    }
    if (lock || (hub && !hub.open)) {
      root.innerHTML = `<div class="tr-page">${head}${gateNoticeHTML(lock || { key: "trading", need: hub.needLevel, level: hub.level })}
        <p class="tr-lede">Trading opens at level ${hub?.needLevel || lock?.need}. Then you can swap cards, slabs and coins with any trainer who has it open too.</p></div>`;
      return;
    }
    if (!hub) {
      root.innerHTML = `<div class="tr-page">${head}${hubError ? `<div class="tr-empty-box">${NONE_BALL}<p>${esc(hubError)}</p></div>` : `<p class="sr-only">Loading your trades.</p><div class="tr-ghosts" aria-hidden="true"><i></i><i style="--i:1"></i><i style="--i:2"></i></div>`}</div>`;
      return;
    }
    const lists = { inbox: hub.incoming, sent: hub.sent, history: hub.history };
    const empty = {
      inbox: "No offers waiting on you.",
      sent: "You have no offers out.",
      history: "No finished trades yet.",
    };
    const words = [
      ["inbox", hub.incoming.length ? `Inbox (${hub.incoming.length})` : "Inbox"],
      ["sent", hub.sent.length ? `Sent (${hub.sent.length})` : "Sent"],
      ["history", "History"],
    ];
    const list = lists[hubTab] || [];
    // The rows stagger in the first time a list is drawn, not on every poll.
    const hubFresh = hubDrawn !== hubTab;
    hubDrawn = hubTab;
    root.innerHTML = `<div class="tr-page">${head}
      <div class="tr-cols">
        <section class="tr-main" aria-label="Offers">
          <div class="tr-words" role="group" aria-label="Offers">${words.map(([id, label]) => `<button type="button" class="tr-word rt-word${id === hubTab ? " on" : ""}" data-tab="${id}" aria-pressed="${id === hubTab}">${esc(label)}</button>`).join("")}</div>
          ${list.length ? `<ul class="rows tr-list${hubFresh ? " is-fresh" : ""}">${list.map(rowHTML).join("")}</ul>` : `<div class="tr-empty-box">${NONE_BALL}<p>${empty[hubTab]}</p></div>`}
        </section>
        <div class="tr-side">${startHTML()}${rulesHTML()}</div>
      </div></div>`;
  }

  async function loadHub() {
    const mine = ++token;
    if (!user()) { hub = null; paintHub(); return; }
    try {
      const data = await deps.api("/api/trades");
      if (mine !== token || route.kind !== "hub") return;
      hub = data;
      hubError = "";
    } catch (err) {
      if (mine !== token) return;
      hubError = err?.message || "Couldn't load your trades.";
    }
    // Typing a handle must not be wiped by the poll.
    const field = root.querySelector("#tr-find-handle");
    const typing = field && document.activeElement === field;
    if (typing) startHandle = field.value;
    paintHub();
    if (typing) {
      const next = root.querySelector("#tr-find-handle");
      next?.focus({ preventScroll: true });
      next?.setSelectionRange(next.value.length, next.value.length);
    }
  }

  // ---- One offer ---------------------------------------------------------------
  function paintOne() {
    const back = `<a class="tr-back" href="/trades" data-trade-link>Trades</a>`;
    if (!one) {
      root.innerHTML = `<div class="tr-page">${back}${oneError ? `<div class="tr-empty-box">${NONE_BALL}<p>${esc(oneError)}</p></div>` : `<p class="sr-only">Loading the offer.</p><div class="tr-ghosts tr-ghosts-two" aria-hidden="true"><i></i><i style="--i:1"></i></div>`}</div>`;
      return;
    }
    const t = one.trade;
    const them = t.mine === "from" ? t.to : t.from;
    const giveSide = t.mine === "from" ? t.give : t.take;
    const getSide = t.mine === "from" ? t.take : t.give;
    const open = t.status === "open";
    const now = one.check || {};
    // Today's values while it is open, the values it closed at otherwise.
    const giveTotal = open && now.giveValue != null ? (t.mine === "from" ? now.giveValue : now.takeValue) : t.mine === "from" ? t.giveValue : t.takeValue;
    const getTotal = open && now.giveValue != null ? (t.mine === "from" ? now.takeValue : now.giveValue) : t.mine === "from" ? t.takeValue : t.giveValue;
    const title = open
      ? t.mine === "to" ? `${nameOf(them)} wants to trade` : `Your offer to ${nameOf(them)}`
      : t.status === "accepted" ? `Traded with ${nameOf(them)}` : `${STATUS_WORDS[t.status]} offer`;
    const sub = open
      ? t.mine === "to" ? `${leftWords(t.expiresAt - (one.now || Date.now()))} left to answer` : `${nameOf(them)} has ${leftWords(t.expiresAt - (one.now || Date.now()))} left to answer`
      : t.status === "accepted" ? "The swap is done. Everything is in your collection."
      : t.status === "declined" ? (t.mine === "to" ? "You declined this offer." : `${nameOf(them)} declined this offer.`)
      : t.status === "cancelled" ? (t.mine === "from" ? "You cancelled this offer." : `${nameOf(them)} cancelled this offer.`)
      : t.status === "countered" ? (t.mine === "to" ? "You answered with a counter." : `${nameOf(them)} answered with a counter.`)
      : "Nobody answered in time.";
    const blocked = open && now.ok === false;
    let actions = "";
    if (open && t.mine === "to") {
      actions = confirming
        ? `<p class="tr-confirm">You give ${esc(sideWords(giveSide).toLowerCase())}. You get ${esc(sideWords(getSide).toLowerCase())}. This can't be undone.</p>
           <div class="tr-actions"><button type="button" class="solid rt-go" data-accept-go ${oneBusy ? "disabled" : ""}>${oneBusy === "accept" ? "Trading" : "Confirm trade"}</button>
           <button type="button" class="ghost" data-accept-back ${oneBusy ? "disabled" : ""}>Back</button></div>`
        : `<div class="tr-actions"><button type="button" class="solid" data-accept ${blocked || oneBusy ? "disabled" : ""}>Accept</button>
           <a class="ghost" href="/trades/new/${esc(them.handle)}/${esc(t.id)}" data-trade-link>Counter</a>
           <button type="button" class="text-btn" data-decline ${oneBusy ? "disabled" : ""}>Decline</button></div>`;
    } else if (open) {
      actions = `<div class="tr-actions"><button type="button" class="ghost" data-cancel ${oneBusy ? "disabled" : ""}>${oneBusy === "cancel" ? "Cancelling" : "Cancel offer"}</button></div>`;
    } else if (t.status === "accepted") {
      actions = `<div class="tr-actions"><a class="ghost" href="/bulk">Open your collection</a>${them.gone ? "" : `<a class="text-btn" href="/trades/new/${esc(them.handle)}" data-trade-link>Trade again</a>`}</div>`;
    } else if (t.status === "countered" && one.counterId) {
      actions = `<div class="tr-actions"><a class="ghost" href="/trades/${esc(one.counterId)}" data-trade-link>See the counter</a></div>`;
    } else if (!them.gone) {
      actions = `<div class="tr-actions"><a class="ghost" href="/trades/new/${esc(them.handle)}" data-trade-link>New offer</a></div>`;
    }
    const oneFresh = oneDrawn !== `${t.id}:${t.status}`;
    // Accepted in front of the player: the two sides cross over instead of dealing in again.
    const swapped = oneDrawn === `${t.id}:open` && t.status === "accepted";
    oneDrawn = `${t.id}:${t.status}`;
    root.innerHTML = `<div class="tr-page tr-one${oneFresh ? " is-fresh" : ""}${swapped ? " is-swapped" : ""}">${back}
      <header class="tr-head tr-head-one">
        ${them.gone ? face(them, "md") : `<a href="/u/${esc(them.handle)}" class="tr-head-face" aria-label="${esc(nameOf(them))}'s profile">${face(them, "md")}</a>`}
        <div><span class="tr-state" data-st="${esc(t.status)}">${esc(STATUS_WORDS[t.status] || t.status)}</span><h1 class="tr-title">${esc(title)}</h1><p class="tr-sub">${esc(sub)}</p></div>
      </header>
      <div class="tr-sides tr-vs" data-st="${esc(t.status)}">
        <section class="plate tr-side-box is-give" aria-labelledby="tr-give-h">
          <div class="plate-head"><h2 id="tr-give-h">You give</h2>${money(giveTotal)}</div>
          ${itemsHTML(giveSide, { empty: "Nothing. This one is a gift to you." })}
        </section>
        <span class="tr-vs-mark" aria-hidden="true">${SWAP_ICON}</span>
        <section class="plate tr-side-box is-get" aria-labelledby="tr-get-h">
          <div class="plate-head"><h2 id="tr-get-h">You get</h2>${money(getTotal)}</div>
          ${itemsHTML(getSide, { empty: "Nothing. This one is a gift from you." })}
        </section>
      </div>
      <div class="tr-foot">
        ${balanceHTML(giveTotal, getTotal, blocked ? now.error : gapLine(giveTotal, getTotal), blocked)}
        ${oneError ? `<p class="tr-error" role="alert">${esc(oneError)}</p>` : ""}
        ${actions}
      </div>
    </div>`;
  }

  async function loadOne({ quiet = false } = {}) {
    const mine = ++token;
    const id = route.id;
    try {
      const data = await deps.api(`/api/trades/${id}`);
      if (mine !== token || route.kind !== "one" || route.id !== id) return;
      // A poll must not redraw under a finger on the confirm step, or while a button is working.
      if (quiet && (confirming || oneBusy) && one?.trade.status === data.trade.status) { one = data; return; }
      one = data;
      if (data.trade.status !== "open") confirming = false;
      if (!quiet) oneError = "";
    } catch (err) {
      if (mine !== token) return;
      if (!quiet) { one = null; oneError = err?.status === 404 ? "That offer doesn't exist, or isn't yours." : err?.message || "Couldn't load the offer."; }
    }
    paintOne();
  }

  async function answer(action) {
    if (oneBusy || !one) return;
    oneBusy = action;
    oneError = "";
    paintOne();
    try {
      const data = await deps.api(`/api/trades/${one.trade.id}/${action}`, { method: "POST", body: "{}" });
      if (data.save) deps.applySave?.(data.save);
      one = { ...one, trade: data.trade, check: null };
      confirming = false;
      toast(action === "accept" ? "Trade done." : action === "decline" ? "Offer declined." : "Offer cancelled.");
      deps.onChange?.();
    } catch (err) {
      oneError = err?.message || "That didn't work. Try again.";
      confirming = false;
    }
    oneBusy = "";
    if (route.kind === "one") { paintOne(); if (oneError) loadOne({ quiet: true }); }
  }

  // ---- The builder -------------------------------------------------------------
  /** A side of the builder as the lists the server takes. */
  function sideBody(side) {
    const cards = [];
    for (const [key, qty] of side.cards) {
      const [id, r] = key.split("|");
      cards.push({ id, qty, ...(r ? { reverse: true } : {}) });
    }
    return { cards, slabs: [...side.slabs], coins: cents(side.coins || 0) / 100 };
  }

  const coinCents = (side) => {
    const t = String(side.coins ?? "").replace(/[\s,]/g, "");
    if (!t) return 0;
    if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(t)) return NaN;
    return Math.round(Number(t) * 100);
  };

  /** A builder side as display lists (the same shape an offer's side has) and its total in cents. */
  function sideView(which) {
    const side = build[which];
    const entries = which === "give" ? build.mine : build.theirs;
    const cards = new Map();
    let total = 0;
    for (const [key, qty] of side.cards) {
      const e = entries.byKey.get(key);
      if (!e) continue;
      const row = cards.get(e.id) || { id: e.id, qty: 0, rev: 0, name: e.name, number: e.number, rarity: e.rarity, image: e.image, small: e.small, value: e.value };
      row.qty += qty;
      if (e.reverse) row.rev += qty;
      cards.set(e.id, row);
      total += cents(e.value) * qty;
    }
    const slabs = [];
    for (const id of side.slabs) {
      const s = entries.slabById.get(id);
      if (!s) continue;
      slabs.push(s);
      total += cents(s.value);
    }
    const c = coinCents(side);
    return { cards: [...cards.values()].sort((a, b) => b.value - a.value), slabs: slabs.sort((a, b) => b.value - a.value), coins: Number.isFinite(c) ? c / 100 : 0, total: total + (Number.isFinite(c) ? c : 0), badCoins: !Number.isFinite(c) };
  }

  /** What the rules say about the offer on the table: { ok, note }. The server decides again when it is sent. */
  function verdict(give, take) {
    const empty = !give.cards.length && !give.slabs.length && !give.coins && !take.cards.length && !take.slabs.length && !take.coins;
    if (give.badCoins || take.badCoins) return { ok: false, note: "Type coins as a number, like 25 or 12.50." };
    if (empty) return { ok: false, note: "Add something to either side." };
    if (give.coins > 0 && take.coins > 0) return { ok: false, note: "Coins can only go one way." };
    if (cents(give.coins) > cents(deps.getSave?.().coins || 0)) return { ok: false, note: "You don't have that many coins." };
    const shape = tradeGap(give.total, take.total);
    if (!shape.gap) return { ok: true, note: "An even trade." };
    const them = `@${build.partner.handle}`;
    const iAmDown = shape.down === "give";
    if (!shape.even && !build.friends) {
      const need = coinsToEven(give.total, take.total) / 100;
      return { ok: false, note: `Too uneven for players who aren't friends. ${iAmDown ? them : "You"} would need to add about ${coinWords(need)} of value.` };
    }
    const lim = build.limits;
    const giveLeft = iAmDown ? cents(lim.mine.cap) - cents(lim.mine.given) : cents(lim.theirs.cap) - cents(lim.theirs.given);
    const getLeft = iAmDown ? cents(lim.theirs.cap) - cents(lim.theirs.got) : cents(lim.mine.cap) - cents(lim.mine.got);
    if (shape.gap > giveLeft) {
      return { ok: false, note: `${iAmDown ? "You'd be" : `${them} would be`} ${coinWords(shape.gap / 100)} down, and ${iAmDown ? "your" : "their"} daily limit for uneven trades has ${coinWords(Math.max(0, giveLeft) / 100)} left.` };
    }
    if (shape.gap > getLeft) {
      return { ok: false, note: `${iAmDown ? `${them} would` : "You'd"} come out ${coinWords(shape.gap / 100)} ahead, and ${iAmDown ? "their" : "your"} daily limit for uneven trades has ${coinWords(Math.max(0, getLeft) / 100)} left.` };
    }
    return { ok: true, note: gapLine(give.total / 100, take.total / 100) };
  }

  function plateHTML(which, view) {
    const mine = which === "give";
    const label = mine ? "You give" : "You get";
    const side = build[which];
    const has = view.cards.length || view.slabs.length;
    const keys = new Set([...view.cards.map((c) => c.id), ...view.slabs.map((sl) => `s${sl.id}`)]);
    const seen = drawnItems[which];
    const fresh = seen ? new Set([...keys].filter((k) => !seen.has(k))) : null;
    drawnItems[which] = keys;
    return `<section class="plate tr-build-side tr-side-box is-${mine ? "give" : "get"}" aria-labelledby="tr-b-${which}">
      <div class="plate-head"><h2 id="tr-b-${which}">${label}</h2>${money(view.total / 100)}</div>
      ${has ? itemsHTML({ cards: view.cards, slabs: view.slabs }, { fresh }) : `<div class="tr-empty-side"><span class="tr-slot" aria-hidden="true">${NONE_BALL}</span><p class="tr-none">${mine ? "Nothing from you yet." : `Nothing from @${esc(build.partner.handle)} yet.`}</p></div>`}
      <div class="tr-build-tools">
        <button type="button" class="ghost" data-pick="${which}">${has ? "Change" : "Add"} ${mine ? "your cards" : "their cards"}</button>
        <label class="tr-coins"><span>${mine ? "Add coins" : "Ask for coins"}</span>
          <input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" data-coins="${which}" value="${esc(side.coins)}" placeholder="0" aria-label="${mine ? "Coins you add" : "Coins you ask for"}" /></label>
      </div>
    </section>`;
  }

  function paintBuild() {
    const back = `<a class="tr-back" href="/trades" data-trade-link>Trades</a>`;
    if (!build || build.loading) {
      root.innerHTML = `<div class="tr-page">${back}${build?.error ? `<div class="tr-empty-box">${NONE_BALL}<p>${esc(build.error)}</p></div>` : `<p class="sr-only">Loading.</p><div class="tr-ghosts tr-ghosts-two" aria-hidden="true"><i></i><i style="--i:1"></i></div>`}</div>`;
      return;
    }
    const p = build.partner;
    const head = `<header class="tr-head tr-head-one">
      <a href="/u/${esc(p.handle)}" class="tr-head-face" aria-label="@${esc(p.handle)}'s profile">${face(p, "md")}</a>
      <div><h1 class="tr-title">${build.counterOf ? "Counter" : "Trade with"} @${esc(p.handle)}</h1>
      <p class="tr-sub">${build.friends ? "You're friends, so this one can be uneven." : "You aren't friends, so keep it close to even."}</p></div>
    </header>`;
    if (!build.can.ok) {
      const lock = build.can.code === "level" ? gateNoticeHTML(lockOf() || { key: "trading", need: build.can.needLevel, level: user()?.level || 1 }) : "";
      root.innerHTML = `<div class="tr-page tr-one">${back}${head}${lock || `<p class="tr-error" role="alert">${esc(build.can.error)}</p>`}</div>`;
      return;
    }
    const give = sideView("give");
    const take = sideView("take");
    const v = verdict(give, take);
    const buildFresh = oneDrawn !== `build:${build.requestId}`;
    oneDrawn = `build:${build.requestId}`;
    root.innerHTML = `<div class="tr-page tr-one${buildFresh ? " is-fresh" : ""}">${back}${head}
      <div class="tr-sides tr-vs">${plateHTML("give", give)}<span class="tr-vs-mark" aria-hidden="true">${SWAP_ICON}</span>${plateHTML("take", take)}</div>
      <div class="tr-foot">
        ${balanceHTML(give.total / 100, take.total / 100, v.note, !v.ok && give.total + take.total > 0)}
        ${build.error ? `<p class="tr-error" role="alert">${esc(build.error)}</p>` : ""}
        <div class="tr-actions"><button type="button" class="solid rt-go" data-send ${!v.ok || build.busy ? "disabled" : ""}>${build.busy ? "Sending" : build.counterOf ? "Send counter" : "Send offer"}</button>
        ${build.counterOf ? `<a class="text-btn" href="/trades/${esc(build.counterOf)}" data-trade-link>Back to their offer</a>` : ""}</div>
      </div>
    </div>`;
    settleFigures(give.total / 100, take.total / 100);
  }

  /** The two totals roll from what they were, and the balance bar slides, rather than jumping. */
  function settleFigures(give, take) {
    const big = Math.max(cents(give), cents(take));
    const share = big > 0 ? Math.min(cents(give), cents(take)) / big : 0;
    const prev = figs;
    figs = { give, take, share };
    if (!prev || still()) return;
    const heads = root.querySelectorAll(".tr-build-side .plate-head .price");
    const sums = root.querySelectorAll(".tr-bal-sums .price");
    rollPrice(heads[0], prev.give, give);
    rollPrice(heads[1], prev.take, take);
    rollPrice(sums[0], prev.give, give);
    rollPrice(sums[1], prev.take, take);
    const bar = root.querySelector(".tr-bal .tr-track > i");
    if (bar && Math.abs(prev.share - share) > 0.0005) {
      bar.style.transition = "none";
      bar.style.transform = `scaleX(${prev.share.toFixed(4)})`;
      void bar.offsetWidth;
      bar.style.transition = "";
      bar.style.transform = `scaleX(${share.toFixed(4)})`;
    }
  }

  /** Only the totals, the bars and the send button, so typing coins keeps its field and keyboard. */
  function paintBuildFigures() {
    if (!build || build.loading || !build.can.ok) return;
    const give = sideView("give");
    const take = sideView("take");
    const v = verdict(give, take);
    const heads = root.querySelectorAll(".tr-build-side .plate-head .price");
    if (heads[0]) heads[0].outerHTML = money(give.total / 100);
    if (heads[1]) heads[1].outerHTML = money(take.total / 100);
    const bal = root.querySelector(".tr-bal");
    if (bal) bal.outerHTML = balanceHTML(give.total / 100, take.total / 100, v.note, !v.ok && give.total + take.total > 0);
    const send = root.querySelector("[data-send]");
    if (send) send.disabled = !v.ok || build.busy;
    settleFigures(give.total / 100, take.total / 100);
  }

  /** Card entries (plain and reverse copies apart) and slabs, indexed for the picker and the totals. */
  function indexEntries(cards, slabs) {
    const list = [];
    for (const c of cards) {
      const plain = c.qty - c.rev;
      if (plain > 0) list.push({ ...c, key: c.id, reverse: false, have: plain });
      if (c.rev > 0) list.push({ ...c, key: `${c.id}|r`, reverse: true, have: c.rev });
    }
    return { list, byKey: new Map(list.map((e) => [e.key, e])), slabs, slabById: new Map(slabs.map((s) => [s.id, s])) };
  }

  async function loadBuild() {
    const mine = ++token;
    const handle = route.handle;
    build = { loading: true, error: "" };
    drawnItems = { give: null, take: null };
    figs = null;
    paintBuild();
    if (!user()) { build = { loading: true, error: "Sign in to trade." }; paintBuild(); return; }
    try {
      const [data, answering] = await Promise.all([
        deps.api(`/api/trades/with/${handle}`),
        route.counter ? deps.api(`/api/trades/${route.counter}`).catch(() => null) : null,
        deps.refreshSave?.().catch(() => null),
      ]);
      if (mine !== token || route.kind !== "new" || route.handle !== handle) return;
      const save = deps.getSave?.() || {};
      const [myCards, theirCards] = data.can.ok
        ? await Promise.all([deps.cardEntries(save.collection || {}, save.reverses || {}), deps.cardEntries(data.their.collection, data.their.reverses)])
        : [[], []];
      if (mine !== token) return;
      build = {
        loading: false, error: "", busy: false, requestId: uuid(), partner: data.partner, friends: data.friends, can: data.can, limits: data.limits,
        mine: indexEntries(myCards, data.mine.slabs || []), theirs: indexEntries(theirCards, data.their.slabs || []),
        give: emptySide(), take: emptySide(), counterOf: "",
      };
      // A counter starts from their offer turned round: what they asked for is what you give.
      const old = answering?.trade;
      if (old && old.status === "open" && old.mine === "to" && old.from.handle === data.partner.handle) {
        build.counterOf = old.id;
        const fill = (side, from, entries) => {
          for (const c of from.cards) {
            const plain = c.qty - c.rev;
            if (plain > 0 && entries.byKey.has(c.id)) side.cards.set(c.id, Math.min(plain, entries.byKey.get(c.id).have));
            if (c.rev > 0 && entries.byKey.has(`${c.id}|r`)) side.cards.set(`${c.id}|r`, Math.min(c.rev, entries.byKey.get(`${c.id}|r`).have));
          }
          for (const s of from.slabs) if (entries.slabById.has(s.id)) side.slabs.add(s.id);
          if (from.coins > 0) side.coins = String(from.coins);
        };
        fill(build.give, old.take, build.mine);
        fill(build.take, old.give, build.theirs);
      }
    } catch (err) {
      if (mine !== token) return;
      build = { loading: true, error: err?.status === 404 ? "No trainer has that handle." : err?.message || "Couldn't load that trainer." };
    }
    paintBuild();
  }

  async function send() {
    if (!build || build.busy) return;
    const give = sideView("give");
    const take = sideView("take");
    if (!verdict(give, take).ok) return;
    build.busy = true;
    build.error = "";
    paintBuild();
    try {
      const data = await deps.api("/api/trades", {
        method: "POST",
        body: JSON.stringify({ to: build.partner.handle, give: sideBody(build.give), take: sideBody(build.take), requestId: build.requestId, ...(build.counterOf ? { counterOf: build.counterOf } : {}) }),
      });
      toast(build.counterOf ? `Counter sent to @${build.partner.handle}.` : `Offer sent to @${build.partner.handle}.`);
      deps.onChange?.();
      navigate(`/trades/${data.trade.id}`);
    } catch (err) {
      build.busy = false;
      build.error = err?.message || "That didn't send. Try again.";
      // The same request id is only reused when nothing reached the server; a refusal gets a fresh one.
      if (err?.status) build.requestId = uuid();
      paintBuild();
    }
  }

  // ---- The picker sheet --------------------------------------------------------
  function closeSheet() {
    if (!sheet) return;
    document.removeEventListener("keydown", sheet.onKey, true);
    sheet.el.remove();
    document.body.classList.remove("cs-locked");
    const focus = sheet.returnFocus;
    sheet = null;
    paintBuild();
    root.querySelector(`[data-pick="${focus}"]`)?.focus({ preventScroll: true });
  }

  function openSheet(which) {
    if (sheet || !build) return;
    const mine = which === "give";
    const entries = mine ? build.mine : build.theirs;
    const side = build[which];
    const st = { scope: entries.list.length ? "cards" : "slabs", sort: "value", query: "", shown: PICK_PAGE };
    const el = document.createElement("div");
    el.className = "tr-sheet-wrap";
    const title = mine ? "Your cards" : `@${build.partner.handle}'s cards`;
    el.innerHTML = `<div class="tr-scrim" data-sheet-close></div>
      <section class="tr-sheet" role="dialog" aria-modal="true" aria-labelledby="tr-sheet-h" tabindex="-1">
        <header class="tr-sheet-head"><h2 id="tr-sheet-h">${esc(title)}</h2><button type="button" class="tr-x" data-sheet-close aria-label="Close">${icon("close")}</button></header>
        <div class="tr-sheet-tools">
          <label class="tr-search">${icon("search")}<input type="search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="Search by name or number" /></label>
          <div class="keys" role="group" aria-label="Show" style="--n:3;--i:0" data-scope-keys>
            <i class="seg-thumb" aria-hidden="true"></i>
            <button type="button" class="seg-key" data-scope="cards" aria-pressed="true"><span>Cards</span></button>
            <button type="button" class="seg-key" data-scope="slabs" aria-pressed="false"><span>Slabs</span></button>
            <button type="button" class="seg-key" data-scope="picked" aria-pressed="false"><span>Picked</span></button>
          </div>
          <div class="tr-words tr-sort" role="group" aria-label="Sort"><button type="button" class="tr-word rt-word on" data-sort="value" aria-pressed="true">Highest value</button><button type="button" class="tr-word rt-word" data-sort="name" aria-pressed="false">Name</button></div>
        </div>
        <div class="tr-grid" tabindex="-1"></div>
        <footer class="tr-sheet-foot"><p class="tr-sheet-note" aria-live="polite"></p><button type="button" class="solid" data-sheet-close>Done</button></footer>
      </section>`;
    const grid = el.querySelector(".tr-grid");
    const note = el.querySelector(".tr-sheet-note");
    const pickedCopies = () => [...side.cards.values()].reduce((n, q) => n + q, 0);

    const tile = (e) => {
      const on = side.cards.get(e.key) || 0;
      const max = Math.min(e.have, TRADE_RULES.maxQty);
      return `<div class="tr-pick${on ? " is-on" : ""}" data-key="${esc(e.key)}">
        <button type="button" class="tr-pick-art" data-add="${esc(e.key)}" aria-label="Add ${esc(e.name)}${e.reverse ? ", reverse holo" : ""}">
          <img src="${esc(e.small || e.image)}" alt="" loading="lazy" decoding="async" />${on ? `<b class="tr-qty">${on}</b>` : ""}
        </button>
        <span class="tr-item-name">${esc(e.name)}</span>
        <span class="tr-item-meta"><span>${e.reverse ? "Reverse" : esc(String(e.number ?? ""))}${e.have > 1 ? `, ${mine ? "own" : "has"} ${e.have}` : ""}</span>${money(e.value)}</span>
        ${on ? `<span class="tr-step"><button type="button" data-less="${esc(e.key)}" aria-label="Remove one ${esc(e.name)}">${icon("minus")}</button><output>${on}</output><button type="button" data-add="${esc(e.key)}" aria-label="Add one ${esc(e.name)}" ${on >= max ? "disabled" : ""}>${icon("plus")}</button></span>` : ""}
      </div>`;
    };
    const slabTile = (s) => {
      const on = side.slabs.has(s.id);
      return `<div class="tr-pick tr-pick-slab${on ? " is-on" : ""}" data-slab="${s.id}">
        <button type="button" class="tr-pick-art" data-slabpick="${s.id}" aria-pressed="${on}" aria-label="${esc(`${on ? "Take out" : "Add"} ${s.name}, RIP ${s.grade}`)}">
          ${slabTileHTML(s, "tile")}${on ? `<b class="tr-qty tr-check">${icon("check")}</b>` : ""}
        </button>
        <span class="tr-item-name">${esc(s.name)}</span>
        <span class="tr-item-meta"><span>RIP ${esc(String(s.grade))}${s.blackLabel ? " BL" : ""}</span>${money(s.value)}</span>
      </div>`;
    };
    const listed = () => {
      const q = st.query.trim().toLowerCase();
      const match = (e) => !q || e.name.toLowerCase().includes(q) || String(e.number ?? "").toLowerCase() === q;
      const order = st.sort === "name" ? (a, b) => a.name.localeCompare(b.name) || b.value - a.value : (a, b) => b.value - a.value || a.name.localeCompare(b.name);
      const cards = st.scope === "slabs" ? [] : entries.list.filter((e) => match(e) && (st.scope !== "picked" || side.cards.has(e.key))).sort(order);
      const slabs = st.scope === "cards" ? [] : entries.slabs.filter((s) => match(s) && (st.scope !== "picked" || side.slabs.has(s.id))).sort(order);
      return { cards, slabs };
    };
    const paintNote = () => {
      const n = pickedCopies();
      const s = side.slabs.size;
      note.textContent = n || s ? [n ? plural(n, "card") : "", s ? plural(s, "slab") : ""].filter(Boolean).join(", ") + " picked" : "Tap a card to add it.";
    };
    const paintGrid = () => {
      const { cards, slabs } = listed();
      const shownCards = cards.slice(0, st.shown);
      const room = Math.max(0, st.shown - shownCards.length);
      const shownSlabs = slabs.slice(0, st.scope === "slabs" ? st.shown : room);
      const more = cards.length - shownCards.length + slabs.length - shownSlabs.length;
      if (!cards.length && !slabs.length) {
        grid.innerHTML = `<p class="tr-none tr-grid-none">${NONE_BALL}${
          st.query ? "Nothing matches that."
          : st.scope === "picked" ? "Nothing picked yet."
          : st.scope === "slabs" ? (mine ? "You have no slabs to trade. A slab in a casino game can't be traded." : "They have no slabs to trade.")
          : mine ? "You have no cards yet. Rip a pack first." : "They have no cards to trade."
        }</p>`;
      } else {
        grid.innerHTML = shownSlabs.map(slabTile).join("") + shownCards.map(tile).join("") + (more > 0 ? `<button type="button" class="tr-more" data-more>Show ${Math.min(PICK_PAGE, more)} more of ${more}</button>` : "");
      }
      paintNote();
    };
    const paintTools = () => {
      const scopes = ["cards", "slabs", "picked"];
      el.querySelector("[data-scope-keys]").style.setProperty("--i", String(scopes.indexOf(st.scope)));
      el.querySelectorAll("[data-scope]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scope === st.scope)));
      el.querySelectorAll("[data-sort]").forEach((b) => { b.classList.toggle("on", b.dataset.sort === st.sort); b.setAttribute("aria-pressed", String(b.dataset.sort === st.sort)); });
    };
    const flash = (text) => { note.textContent = text; };
    const repaint = (key) => {
      const e = entries.byKey.get(key);
      const old = grid.querySelector(`.tr-pick[data-key="${CSS.escape(key)}"]`);
      if (!e || !old || st.scope === "picked") return paintGrid();
      const holder = document.createElement("div");
      holder.innerHTML = tile(e);
      const hadFocus = old.contains(document.activeElement) ? document.activeElement.dataset : null;
      old.replaceWith(holder.firstElementChild);
      if (hadFocus) {
        const next = grid.querySelector(`.tr-pick[data-key="${CSS.escape(key)}"]`);
        (hadFocus.less ? next.querySelector("[data-less]") || next.querySelector("[data-add]") : next.querySelector(".tr-step [data-add]:not(:disabled)") || next.querySelector("[data-add]"))?.focus({ preventScroll: true });
      }
      paintNote();
    };
    const change = (key, delta) => {
      const e = entries.byKey.get(key);
      if (!e) return;
      const have = side.cards.get(key) || 0;
      if (delta > 0) {
        const ids = new Set([...side.cards.keys()].map((k) => k.split("|")[0]));
        if (!have && !ids.has(e.id) && ids.size >= TRADE_RULES.maxCards) return flash(`One side can hold ${TRADE_RULES.maxCards} different cards.`);
        if (pickedCopies() >= TRADE_RULES.maxCopies) return flash(`One side can hold ${TRADE_RULES.maxCopies} cards.`);
        // The same card can't sit on both sides of a trade.
        const other = build[mine ? "take" : "give"];
        if ([...other.cards.keys()].some((k) => k.split("|")[0] === e.id)) return flash("That card is already on the other side.");
        // Plain and reverse copies of one card share the per-card limit.
        const sameCard = (side.cards.get(e.id) || 0) + (side.cards.get(`${e.id}|r`) || 0);
        if (sameCard >= TRADE_RULES.maxQty) return flash(`One trade can hold ${TRADE_RULES.maxQty} copies of a card.`);
      }
      const next = Math.max(0, Math.min(e.have, have + delta));
      if (next) side.cards.set(key, next);
      else side.cards.delete(key);
      repaint(key);
    };
    const toggleSlab = (id) => {
      if (side.slabs.has(id)) side.slabs.delete(id);
      else if (side.slabs.size >= TRADE_RULES.maxSlabs) return flash(`One side can hold ${TRADE_RULES.maxSlabs} slabs.`);
      else side.slabs.add(id);
      paintGrid();
      grid.querySelector(`[data-slabpick="${id}"]`)?.focus({ preventScroll: true });
    };

    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-sheet-close]")) return closeSheet();
      const add = e.target.closest("[data-add]");
      if (add) return change(add.dataset.add, 1);
      const less = e.target.closest("[data-less]");
      if (less) return change(less.dataset.less, -1);
      const slab = e.target.closest("[data-slabpick]");
      if (slab) return toggleSlab(Number(slab.dataset.slabpick));
      const scope = e.target.closest("[data-scope]");
      if (scope) { st.scope = scope.dataset.scope; st.shown = PICK_PAGE; paintTools(); paintGrid(); grid.scrollTop = 0; return; }
      const sort = e.target.closest("[data-sort]");
      if (sort) { st.sort = sort.dataset.sort; paintTools(); paintGrid(); return; }
      if (e.target.closest("[data-more]")) { st.shown += PICK_PAGE; paintGrid(); }
    });
    el.querySelector(".tr-search input").addEventListener("input", (e) => { st.query = e.target.value; st.shown = PICK_PAGE; paintGrid(); });
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeSheet(); return; }
      if (e.key !== "Tab") return;
      // Keep the focus inside the sheet.
      const items = [...el.querySelectorAll("button:not(:disabled), input, [tabindex='0']")].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    document.body.append(el);
    document.body.classList.add("cs-locked");
    sheet = { el, onKey, returnFocus: which };
    paintTools();
    paintGrid();
    el.querySelector(".tr-sheet").focus({ preventScroll: true });
  }

  // ---- Events ------------------------------------------------------------------
  root.addEventListener("click", (e) => {
    const link = e.target.closest("[data-trade-link]");
    if (link) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      e.stopPropagation();
      navigate(new URL(link.href, location.origin).pathname);
      return;
    }
    if (e.target.closest("[data-signin]")) return deps.signIn?.();
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      const again = hubTab === tab.dataset.tab;
      hubTab = tab.dataset.tab;
      paintHub();
      const on = root.querySelector(`[data-tab="${hubTab}"]`);
      if (!again) on?.classList.add("is-picked");
      on?.focus({ preventScroll: true });
      return;
    }
    const from = e.target.closest("[data-from]");
    if (from && hub) {
      const before = hub.from;
      hub.from = from.dataset.from;
      paintHub();
      slideThumb(root.querySelector(".tr-from .keys"), TRADE_FROM.indexOf(before || "all"));
      root.querySelector(`[data-from="${hub.from}"]`)?.focus({ preventScroll: true });
      deps.api("/api/trades/settings", { method: "POST", body: JSON.stringify({ from: hub.from }) }).catch((err) => {
        if (hub) hub.from = before;
        toast(err?.message || "Couldn't save that.");
        if (route.kind === "hub") paintHub();
      });
      return;
    }
    const inspect = e.target.closest("[data-inspect]");
    if (inspect) { deps.inspect?.({ id: inspect.dataset.inspect, reverse: inspect.dataset.reverse === "1" }); return; }
    if (e.target.closest("[data-accept]")) { confirming = true; oneError = ""; paintOne(); root.querySelector("[data-accept-go]")?.focus({ preventScroll: true }); return; }
    if (e.target.closest("[data-accept-back]")) { confirming = false; paintOne(); root.querySelector("[data-accept]")?.focus({ preventScroll: true }); return; }
    if (e.target.closest("[data-accept-go]")) return answer("accept");
    if (e.target.closest("[data-decline]")) return answer("decline");
    if (e.target.closest("[data-cancel]")) return answer("cancel");
    const pick = e.target.closest("[data-pick]");
    if (pick) return openSheet(pick.dataset.pick);
    if (e.target.closest("[data-send]")) return send();
  });
  root.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-find]");
    if (!form) return;
    e.preventDefault();
    const handle = String(form.handle.value || "").trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) return toast("A handle is 3 to 16 letters, numbers or underscores.");
    if (handle === user()?.handle) return toast("That's you.");
    startHandle = "";
    navigate(`/trades/new/${handle}`);
  });
  root.addEventListener("input", (e) => {
    const field = e.target.closest("[data-coins]");
    if (!field || !build) return;
    build[field.dataset.coins].coins = field.value;
    paintBuildFigures();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-coins]")) e.target.blur();
  });

  // ---- Showing and hiding --------------------------------------------------------
  function parse(path) {
    const m = String(path || "/trades").split("?")[0].match(TRADES_ROUTE);
    if (m?.[1]) return { kind: "new", handle: m[1].toLowerCase(), id: "", counter: (m[2] || "").toLowerCase() };
    if (m?.[3]) return { kind: "one", handle: "", id: m[3].toLowerCase(), counter: "" };
    return { kind: "hub", handle: "", id: "", counter: "" };
  }

  function poll() {
    if (!visible || document.visibilityState !== "visible" || sheet) return;
    if (route.kind === "hub" && user()) loadHub();
    else if (route.kind === "one" && one?.trade.status === "open") loadOne({ quiet: true });
  }

  function show(path) {
    const next = parse(path);
    const same = visible && next.kind === route.kind && next.handle === route.handle && next.id === route.id && next.counter === route.counter;
    visible = true;
    if (sheet) closeSheet();
    if (!timer) timer = window.setInterval(poll, POLL_MS);
    if (same) {
      // Shown again (a save arrived, the session changed): repaint what is there, quietly refresh.
      if (route.kind === "hub") { paintHub(); loadHub(); }
      else if (route.kind === "one") loadOne({ quiet: Boolean(one) });
      return;
    }
    route = next;
    token++;
    if (route.kind === "hub") { paintHub(); loadHub(); }
    else if (route.kind === "one") { one = null; oneError = ""; oneBusy = ""; confirming = false; paintOne(); loadOne(); }
    else loadBuild();
  }

  function hide() {
    visible = false;
    token++;
    if (sheet) { const s = sheet; sheet = null; document.removeEventListener("keydown", s.onKey, true); s.el.remove(); document.body.classList.remove("cs-locked"); }
    if (timer) { window.clearInterval(timer); timer = 0; }
  }

  return { show, hide };
}
