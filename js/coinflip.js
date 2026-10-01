/* Coinflip (/casino/coinflip and /casino/coinflip/<id>).

   The list is the open tables; the table is one flip: the host's pile, the
   coin, the challenger's pile. Everything real happens in the Worker at the
   moment a challenger matches (worker/casino.js): the cards move and the coin is
   decided in one transaction. This module presents that result, timing the toss
   from the server's flippedAt so the host, who was waiting, sees the same flip
   the challenger just made. */
import { api, esc, coins, coinTag, icon, casinoIcon, uuid, timeLeft, plural, countLine, stakeStack, pileTiles, playerChip, playerName, emptyLine } from "./casino-kit.js";
import { COINFLIP_RULES } from "./casino-rules.js";
import { coinStageHTML, flipCoin, restCoin } from "./coin.js?v=2";
import { mountWinnings, winningsSlot } from "./casino-winnings.js";

const LIST_POLL_MS = 6000;
const TABLE_POLL_MS = 2500;
const TOSS_MS = 3200;
const FRESH_MS = 30000; // a flip newer than this is played, not just shown
const SEEN = "pp.coinflip.seen.v1";

const post = (path, body = {}) => api(path, { method: "POST", body: JSON.stringify(body) });
const seenSet = () => {
  try { return new Set(JSON.parse(sessionStorage.getItem(SEEN) || "[]")); } catch { return new Set(); }
};
const markSeen = (id) => {
  try {
    const set = seenSet();
    set.add(id);
    sessionStorage.setItem(SEEN, JSON.stringify([...set].slice(-40)));
  } catch { /* private mode: the flip just isn't remembered as seen */ }
};

export function createCoinflip(ctx) {
  const root = ctx.root;
  let visible = false;
  let mode = "list";
  let flipId = "";
  let timer = 0;
  let token = 0; // bumped on every navigation so a slow response never paints the wrong page
  let list = null;
  let table = null; // { flip, animated }
  let playing = 0;

  const me = () => ctx.user?.() || null;
  const signedIn = () => Boolean(me());
  const isMine = (flip) => Boolean(me() && flip?.host?.userId === me().id);
  const isGuest = (flip) => Boolean(me() && flip?.guest?.userId === me().id);
  const clockNow = () => ctx.clock.now();
  const hostSlabs = (flip) => flip?.hostSlabs || [];
  const guestSlabs = (flip) => flip?.guestSlabs || [];
  const stakeWord = (flip) => (hostSlabs(flip).length ? "cards and slabs" : "cards");
  const stop = () => { clearTimeout(timer); timer = 0; };
  const later = (fn, ms) => { stop(); timer = setTimeout(fn, ms); };

  // ---- Data ---------------------------------------------------------------
  async function loadList() {
    const at = ++token;
    try {
      const data = await api("/api/casino/coinflips");
      if (at !== token || !visible || mode !== "list") return;
      ctx.clock.sync(data.serverNow);
      list = data;
      paintList();
    } catch (err) {
      if (at !== token) return;
      if (!list) root.innerHTML = `<div class="cs-page">${emptyLine("Couldn't reach the casino. Try again in a moment.")}</div>`;
    }
    if (visible && mode === "list") later(loadList, LIST_POLL_MS);
  }

  async function loadTable(first = false) {
    const at = ++token;
    try {
      const data = await api(`/api/casino/coinflips/${encodeURIComponent(flipId)}`);
      if (at !== token || !visible || mode !== "table") return;
      ctx.clock.sync(data.serverNow);
      applyFlip(data.flip, { fromPoll: true });
    } catch (err) {
      if (at !== token) return;
      if (first) root.innerHTML = `<div class="cs-page cf-page"><a class="cs-back" href="/casino/coinflip">${icon("back")}Coinflip</a>${emptyLine(err?.status === 404 ? "That flip doesn't exist." : "Couldn't load that flip.")}</div>`;
    }
    if (visible && mode === "table" && (!table?.flip || table.flip.status === "open")) later(loadTable, TABLE_POLL_MS);
  }

  // ---- The list -----------------------------------------------------------
  function paintList() {
    if (mode !== "list" || !list) return;
    const open = list.open || [];
    const done = list.done || [];
    const rec = list.record;
    const scroll = window.scrollY;
    root.innerHTML = `<div class="cs-page cf-page">
      <header class="cs-head">
        <h1 class="page-title">Coinflip</h1>
        <p class="cs-lede">Put up cards or graded slabs. Someone matches them to within ${Math.round(COINFLIP_RULES.tolerance * 100)}% and one flip of the coin decides who takes both piles.</p>
      </header>
      <div class="cf-actions">
        <button class="solid" type="button" data-new>${casinoIcon("coin")}Put up cards</button>
        <button class="ghost" type="button" data-bot>${icon("bot")}Flip a bot</button>
      </div>
      <p class="cs-fine">Calling a bot is free. It puts up cards worth a little less than yours, so it can never hand out value. A bot never puts up slabs. ${
        rec ? `You have flipped ${plural(rec.played, "time")} and won ${rec.won}.` : ""}</p>
      <section class="cs-section" aria-labelledby="cf-open">
        <h2 class="cs-h" id="cf-open">Open flips${open.length ? ` <span>${open.length}</span>` : ""}</h2>
        <div class="cs-rows">${open.length ? open.map(rowHTML).join("") : emptyLine("No open flips right now. Put up cards and wait for a match, or call a bot.")}</div>
      </section>
      <section class="cs-section" aria-labelledby="cf-done">
        <h2 class="cs-h" id="cf-done">Recent flips</h2>
        <div class="cs-rows">${done.length ? done.slice(0, 12).map(doneRowHTML).join("") : emptyLine("Nothing has been flipped yet.")}</div>
      </section>
      ${howItWorks()}
    </div>`;
    if (Math.abs(window.scrollY - scroll) > 2) window.scrollTo(0, scroll);
  }

  const rowHTML = (flip) => {
    const mine = isMine(flip);
    const left = timeLeft(flip.expiresAt - clockNow());
    return `<article class="cs-row cf-row" data-id="${esc(flip.id)}">
      <a class="cs-row-main" href="/casino/coinflip/${esc(flip.id)}" data-open="${esc(flip.id)}">
        ${playerChip(flip.host)}
        <span class="cs-row-stake">${stakeStack(flip.hostStake, 5, "", flip.hostSlabs)}<span class="cs-row-figs">${coinTag(flip.hostValue)}<small>${countLine(flip.hostStake, flip.hostSlabs)}${left ? `, ${left} left` : ""}</small></span></span>
      </a>
      ${mine ? `<button class="ghost sm" type="button" data-cancel="${esc(flip.id)}">Cancel</button>` : `<button class="solid sm" type="button" data-match="${esc(flip.id)}">Match</button>`}
    </article>`;
  };

  const doneRowHTML = (flip) => {
    const winner = flip.winner === "host" ? flip.host : flip.guest;
    return `<article class="cs-row cf-row is-done">
      <a class="cs-row-main" href="/casino/coinflip/${esc(flip.id)}" data-open="${esc(flip.id)}">
        ${playerChip(winner)}
        <span class="cs-row-stake"><span class="cs-row-figs"><b class="cs-took">took ${coinTag(flip.hostValue + flip.guestValue)}</b><small>from ${esc(playerName(flip.winner === "host" ? flip.guest : flip.host))}${flip.bot ? ", a bot" : ""}</small></span></span>
      </a>
    </article>`;
  };

  const howItWorks = () => `<details class="cs-how"><summary>How the flip stays fair</summary>
    <p>The moment a challenger matches, the server flips the coin. Their cards and yours move in the same step, so nothing can be taken back and nothing can be faked from a browser.</p>
    <p>Cards are priced at the current market price, the same price selling uses. A graded slab counts at its graded value, what it sells for, and the winner takes the slab itself. A challenger can be within ${Math.round(COINFLIP_RULES.tolerance * 100)}% of the stake, and a flip nobody matches returns your cards and slabs after ${COINFLIP_RULES.openHours} hours.</p>
    <p>A bot stakes new cards worth up to ${Math.round(COINFLIP_RULES.botEdge * 100)}% less than yours. Win and you get those cards, lose and yours leave the game. Either way the bot never gives away value.</p>
    <p>A bot never puts up slabs. If a bot beats your slab, the slab leaves the game. A guard on it stays with you.</p></details>`;

  // ---- The table ----------------------------------------------------------
  const sideHTML = (flip, side) => {
    const player = flip[side];
    const stake = side === "host" ? flip.hostStake : flip.guestStake;
    const value = side === "host" ? flip.hostValue : flip.guestValue;
    const slabs = (side === "host" ? flip.hostSlabs : flip.guestSlabs) || [];
    const label = side === "host" ? "Heads" : "Tails";
    if (!player || !stake) {
      const w = flip.window;
      return `<section class="cf-side is-${side} is-open-seat" data-side="${side}"><header class="cf-side-head">${playerChip(null)}<span class="cf-face-tag">${label}</span></header>
        <div class="cf-pile cf-pile-empty">${flip.status === "open" ? `<p>Waiting for cards or slabs worth ${coins(w?.min)} to ${coins(w?.max)}.</p>` : `<p>Nobody matched.</p>`}</div></section>`;
    }
    return `<section class="cf-side is-${side}" data-side="${side}"><header class="cf-side-head">${playerChip(player)}<span class="cf-face-tag">${label}</span></header>
      <p class="cf-side-value">${coinTag(value)}<small>${countLine(stake, slabs)}</small></p>
      <div class="cf-pile">${pileTiles(stake, slabs)}</div></section>`;
  };

  const centerHTML = (flip) => {
    const mine = isMine(flip);
    let body = "";
    if (flip.status === "open") {
      const left = timeLeft(flip.expiresAt - clockNow());
      body = mine
        ? `<p class="cf-line"><b>Waiting for a challenger.</b> ${left ? `Your ${stakeWord(flip)} come back in ${left} if nobody matches.` : ""}</p>
           <div class="cf-btns"><button class="ghost" type="button" data-copy>${icon("link")}Copy link</button><button class="ghost" type="button" data-cancel="${esc(flip.id)}">Cancel and take ${hostSlabs(flip).length ? "them" : "cards"} back</button></div>`
        : `<p class="cf-line"><b>Match ${coinTag(flip.hostValue)}</b> with cards or slabs worth ${coins(flip.window?.min)} to ${coins(flip.window?.max)}.</p>
           <div class="cf-btns"><button class="solid" type="button" data-match="${esc(flip.id)}">${casinoIcon("coin")}Match and flip</button></div>`;
    } else if (flip.status === "cancelled" || flip.status === "expired") {
      body = `<p class="cf-line"><b>This flip was cancelled.</b> The ${stakeWord(flip)} went back to ${esc(playerName(flip.host))}.</p><div class="cf-btns"><a class="ghost" href="/casino/coinflip" data-nav>Back to coinflip</a></div>`;
    } else {
      body = `<p class="cf-line cf-result" aria-live="polite"></p><div class="cf-btns cf-after" hidden></div>`;
    }
    return `<div class="cf-center"><div class="cf-coin-wrap">${coinStageHTML({ heads: coinFor(flip.hostCoin), tails: coinFor(flip.guestCoin), size: 168 })}</div>${body}</div>`;
  };

  const coinFor = (id) => (id && ctx.coinArt ? ctx.coinArt(id) : null);

  function paintTable(flip) {
    root.innerHTML = `<div class="cs-page cf-page cf-table" data-status="${esc(flip.status)}">
      <a class="cs-back" href="/casino/coinflip" data-nav>${icon("back")}Coinflip</a>
      <div class="cf-arena">${sideHTML(flip, "host")}${centerHTML(flip)}${sideHTML(flip, "guest")}</div>
      ${flip.status === "open" ? "" : ""}
    </div>`;
  }

  const outcome = (flip) => {
    const total = coins(flip.hostValue + flip.guestValue);
    const hostWon = flip.winner === "host";
    const winner = hostWon ? flip.host : flip.guest;
    const anySlab = hostSlabs(flip).length + guestSlabs(flip).length > 0;
    const of = anySlab ? "cards and slabs" : "cards";
    if (isMine(flip) || isGuest(flip)) {
      const won = hostWon === isMine(flip);
      const mineValue = isMine(flip) ? flip.hostValue : flip.guestValue;
      const mine = isMine(flip) ? hostSlabs(flip) : guestSlabs(flip);
      if (won) return `You take it. ${total} coins of ${of} are yours.`;
      return `${playerName(winner)} takes it. You lose ${coins(mineValue)} coins of ${mine.length ? "cards and slabs" : "cards"}.`;
    }
    return `${playerName(winner)} takes ${total} coins of ${of}.`;
  };

  /** A quiet second line when the viewer lost a slab: where it went, and that its guard stays. */
  const outcomeNote = (flip) => {
    if (!(isMine(flip) || isGuest(flip))) return "";
    const hostWon = flip.winner === "host";
    if (hostWon === isMine(flip)) return "";
    const mine = isMine(flip) ? hostSlabs(flip) : guestSlabs(flip);
    if (!mine.length) return "";
    const winner = hostWon ? flip.host : flip.guest;
    const gone = winner?.bot
      ? `${mine.length === 1 ? "Your slab leaves" : "Your slabs leave"} the game with the house bot.`
      : `${mine.length === 1 ? "Your slab goes" : "Your slabs go"} to ${playerName(winner)}.`;
    return `${gone}${mine.some((sl) => sl.guard) ? " A guard stays with you." : ""}`;
  };

  /** The slabs the viewer just won (the other side's). */
  const wonSlabs = (flip) => {
    if (!(isMine(flip) || isGuest(flip))) return [];
    const won = (flip.winner === "host") === isMine(flip);
    if (!won) return [];
    return isMine(flip) ? guestSlabs(flip) : hostSlabs(flip);
  };

  /** Show one flip. A fresh finished flip plays its toss once; everything else just shows. */
  function applyFlip(flip, { fromPoll = false } = {}) {
    const prev = table?.flip;
    table = { flip };
    const fresh = flip.status === "done" && clockNow() - flip.flippedAt < FRESH_MS && !seenSet().has(flip.id);
    // The joiner's own answer and the table poll can both deliver the same finished flip: paint it once.
    if (prev && flip.status === "done" && prev.id === flip.id && prev.status === "done") return;
    const changed = !prev || prev.status !== flip.status || prev.guest?.userId !== flip.guest?.userId;
    if (!changed && fromPoll && flip.status === "open") {
      // Only the countdown moves while it waits.
      const line = root.querySelector(".cf-line");
      if (line && isMine(flip)) line.innerHTML = `<b>Waiting for a challenger.</b> ${timeLeft(flip.expiresAt - clockNow()) ? `Your ${stakeWord(flip)} come back in ${timeLeft(flip.expiresAt - clockNow())} if nobody matches.` : ""}`;
      return;
    }
    if (!changed && fromPoll) return;
    paintTable(flip);
    if (flip.status !== "done") return;
    if (fresh) play(flip);
    else settle(flip, false);
  }

  function settle(flip, animated) {
    const page = root.querySelector(".cf-table");
    if (!page) return;
    const coin = root.querySelector(".cf-coin");
    if (coin) restCoin(coin, flip.winner === "host" ? "heads" : "tails");
    page.classList.add("is-decided", flip.winner === "host" ? "host-won" : "guest-won");
    const line = root.querySelector(".cf-result");
    if (line) line.textContent = outcome(flip);
    const note = outcomeNote(flip);
    if (line && note && !root.querySelector(".cf-note")) line.insertAdjacentHTML("afterend", `<p class="cs-note cf-note">${esc(note)}</p>`);
    const won = wonSlabs(flip);
    if (won.length && !root.querySelector(".cf-haul")) {
      page.insertAdjacentHTML("beforeend", `<section class="cf-haul" aria-label="Slabs you won"><h2 class="cs-h">${esc(`You won ${plural(won.length, "slab")}`)}</h2><div class="cf-pile">${pileTiles([], won)}</div></section>`);
    }
    const after = root.querySelector(".cf-after");
    if (after) {
      after.hidden = false;
      after.innerHTML = `<a class="ghost" href="/casino/coinflip" data-nav>Back to coinflip</a>${
        isMine(flip) || isGuest(flip) ? `<button class="solid" type="button" data-new>${casinoIcon("coin")}Flip again</button>` : ""}`;
      const won = (flip.winner === "host") === isMine(flip);
      if ((isMine(flip) || isGuest(flip)) && won && !root.querySelector("[data-winnings]")) {
        after.insertAdjacentHTML("beforebegin", winningsSlot("coinflip", flip.id));
        mountWinnings(root.querySelector("[data-winnings]"), { source: "coinflip", id: flip.id, ctx });
      }
    }
    if (animated) ctx.buzz?.([18, 40, 26]);
  }

  async function play(flip) {
    const mark = ++playing;
    markSeen(flip.id);
    const page = root.querySelector(".cf-table");
    const coin = root.querySelector(".cf-coin");
    const line = root.querySelector(".cf-result");
    if (line) line.textContent = "The coin is in the air.";
    page?.classList.add("is-flipping");
    if (coin) await flipCoin(coin, flip.winner === "host" ? "heads" : "tails", { ms: TOSS_MS, motion: ctx.motion() });
    if (mark !== playing || !visible) return;
    page?.classList.remove("is-flipping");
    settle(flip, true);
    ctx.applySave?.(pendingSave);
    pendingSave = null;
  }
  let pendingSave = null;

  // ---- Actions ------------------------------------------------------------
  const needSignIn = () => {
    if (signedIn()) return false;
    ctx.toast?.("Sign in to flip. Your cards and slabs are what you put up.");
    ctx.signIn?.();
    return true;
  };

  function openCreate({ withBot }) {
    if (needSignIn()) return;
    ctx.picker.open({
      title: withBot ? "Flip a bot" : "Put up cards or slabs",
      lede: withBot ? "Pick the cards or slabs to risk. The bot answers with cards worth a little less. It never puts up slabs." : `Pick the cards or slabs to put on the table. A player matches them within ${Math.round(COINFLIP_RULES.tolerance * 100)}%.`,
      confirmLabel: (total) => (withBot ? `Flip a bot for ${coins(total)}` : `Put up ${coins(total)}`),
      busyLabel: withBot ? "Tossing" : "Putting them up",
      onConfirm: async (cards, _total, _choices, slabIds) => {
        const data = await post(withBot ? "/api/casino/coinflips/bot" : "/api/casino/coinflips", { requestId: uuid(), cards, slabs: slabIds || [] });
        ctx.clock.sync(data.serverNow);
        if (withBot) pendingSave = data.save;
        else ctx.applySave?.(data.save);
        ctx.navigate(`/casino/coinflip/${data.flip.id}`);
        if (withBot) {
          // The table page mounts on navigation; hand it the flip so the toss starts at once.
          setTimeout(() => { if (mode === "table" && flipId === data.flip.id) applyFlip(data.flip); }, 0);
        }
      },
    });
  }

  function openMatch(id) {
    if (needSignIn()) return;
    const flip = (table?.flip?.id === id ? table.flip : list?.open?.find((f) => f.id === id));
    if (!flip?.window) return;
    ctx.picker.open({
      title: `Match ${coins(flip.hostValue)} coins`,
      lede: `${playerName(flip.host)} is risking ${countLine(flip.hostStake, flip.hostSlabs)}. Match them with cards or slabs and the coin decides.`,
      target: { min: flip.window.min, max: flip.window.max, value: flip.hostValue },
      confirmLabel: (total) => `Match and flip ${coins(total)}`,
      busyLabel: "Flipping",
      onConfirm: async (cards, _total, _choices, slabIds) => {
        const data = await post(`/api/casino/coinflips/${encodeURIComponent(id)}/join`, { cards, slabs: slabIds || [] });
        ctx.clock.sync(data.serverNow);
        pendingSave = data.save;
        if (mode === "table" && flipId === id) { table = { flip: data.flip }; paintTable(data.flip); play(data.flip); }
        else {
          ctx.navigate(`/casino/coinflip/${id}`);
          setTimeout(() => { if (mode === "table" && flipId === id) applyFlip(data.flip); }, 0);
        }
      },
    });
  }

  async function cancelFlip(id) {
    try {
      const data = await post(`/api/casino/coinflips/${encodeURIComponent(id)}/cancel`);
      ctx.applySave?.(data.save);
      ctx.toast?.(`Flip cancelled. Your ${stakeWord(data.flip)} are back.`);
      if (mode === "table") applyFlip(data.flip);
      else loadList();
    } catch (err) {
      ctx.toast?.(err?.message || "Couldn't cancel that flip.");
    }
  }

  root.addEventListener("click", (e) => {
    if (!visible) return;
    const nav = e.target.closest("[data-nav], [data-open]");
    if (nav && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) {
      e.preventDefault();
      ctx.navigate(nav.getAttribute("href"));
      return;
    }
    if (e.target.closest("[data-new]")) return openCreate({ withBot: false });
    if (e.target.closest("[data-bot]")) return openCreate({ withBot: true });
    const match = e.target.closest("[data-match]");
    if (match) return openMatch(match.dataset.match);
    const cancel = e.target.closest("[data-cancel]");
    if (cancel) return cancelFlip(cancel.dataset.cancel);
    if (e.target.closest("[data-copy]")) {
      const url = `${location.origin}/casino/coinflip/${flipId}`;
      navigator.clipboard?.writeText(url).then(() => ctx.toast?.("Link copied."), () => ctx.toast?.(url));
      return;
    }
    const card = e.target.closest("[data-inspect]");
    if (card) ctx.inspect?.({ id: card.dataset.inspect, reverse: card.dataset.rev === "1" });
  });

  // ---- Lifecycle ----------------------------------------------------------
  function show(id = "") {
    const nextMode = id ? "table" : "list";
    if (visible && mode === nextMode && flipId === id) return;
    visible = true;
    stop();
    playing++;
    mode = nextMode;
    flipId = id;
    table = null;
    root.innerHTML = `<div class="cs-page cf-page"><p class="cs-empty">Loading.</p></div>`;
    if (mode === "list") loadList();
    else loadTable(true);
  }
  function hide() {
    visible = false;
    stop();
    token++;
    playing++;
    mode = "list";
    flipId = "";
    ctx.picker.close();
  }
  return { show, hide };
}
