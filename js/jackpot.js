/* Jackpot (/casino/jackpot and /casino/jackpot/<id>).

   3 to 10 players toss cards into one pot. When it is full, or the host draws it
   early, one entry is drawn at random, weighted by the value it put up, and that
   player takes every card. Everything real happens in the Worker
   (worker/jackpot.js); this module presents it, timing the draw sweep from the
   server's drawnAt so every player at the table sees the same reveal. */
import { api, esc, coins, coinTag, icon, uuid, timeLeft, plural, countLine, stakeStack, pileTiles, playerChip, playerName, emptyLine, emptyBox, seatAvatar, potArtHTML } from "./casino-kit.js";
import { JACKPOT_RULES } from "./casino-rules.js";
import { mountWinnings, winningsSlot } from "./casino-winnings.js";
import { gateLock, gateNoticeHTML, gateRefusal } from "./gate-notice.js";

const LIST_POLL_MS = 6000;
const TABLE_POLL_MS = 2500;
const FRESH_MS = 30000;
const SEEN = "pp.jackpot.seen.v1";

const post = (path, body = {}) => api(path, { method: "POST", body: JSON.stringify(body) });
const seenSet = () => {
  try { return new Set(JSON.parse(sessionStorage.getItem(SEEN) || "[]")); } catch { return new Set(); }
};
const markSeen = (id) => {
  try {
    const set = seenSet();
    set.add(id);
    sessionStorage.setItem(SEEN, JSON.stringify([...set].slice(-40)));
  } catch { /* private mode */ }
};
const pct = (odds) => `${Math.round(odds * 1000) / 10}%`.replace(/\.0%$/, "%");

export function createJackpot(ctx) {
  const root = ctx.root;
  let visible = false;
  let mode = "list";
  let potId = "";
  let timer = 0;
  let token = 0;
  let list = null;
  let table = null;
  let playing = 0;
  let pendingSave = null;

  const me = () => ctx.user?.() || null;
  const clockNow = () => ctx.clock.now();
  const stop = () => { clearTimeout(timer); timer = 0; };
  const later = (fn, ms) => { stop(); timer = setTimeout(fn, ms); };
  const inPot = (pot) => Boolean(me() && pot.entries.some((e) => e.player.userId === me().id));
  const isHost = (pot) => Boolean(me() && pot.hostId === me().id);
  const humans = (pot) => pot.entries.filter((e) => !e.player.bot);
  // Level gate (js/levels.js GATES): shut for a level-too-low player with no pots of their own on the page.
  const lock = () => {
    if (!list) return null;
    const used = Boolean(list.record?.played) || (list.open || []).some((p) => isHost(p) || inPot(p)) || (list.done || []).some(inPot);
    return gateLock("jackpot", me(), used);
  };

  // ---- Data ---------------------------------------------------------------
  async function loadList() {
    const at = ++token;
    try {
      const data = await api("/api/casino/jackpots");
      if (at !== token || !visible || mode !== "list") return;
      ctx.clock.sync(data.serverNow);
      list = data;
      paintList();
    } catch {
      if (at !== token) return;
      if (!list) root.innerHTML = `<div class="cs-page">${emptyLine("Couldn't reach the casino. Try again in a moment.")}</div>`;
    }
    if (visible && mode === "list") later(loadList, LIST_POLL_MS);
  }

  async function loadTable(first = false) {
    const at = ++token;
    try {
      const data = await api(`/api/casino/jackpots/${encodeURIComponent(potId)}`);
      if (at !== token || !visible || mode !== "table") return;
      ctx.clock.sync(data.serverNow);
      applyPot(data.jackpot, { fromPoll: true });
    } catch (err) {
      if (at !== token) return;
      if (first) root.innerHTML = `<div class="cs-page jp-page"><a class="cs-back" href="/casino/jackpot" data-nav>${icon("back")}Jackpot</a>${emptyLine(err?.status === 404 ? "That jackpot doesn't exist." : "Couldn't load that jackpot.")}</div>`;
    }
    if (visible && mode === "table" && (!table?.pot || table.pot.status === "open")) later(loadTable, TABLE_POLL_MS);
  }

  // ---- The list -----------------------------------------------------------
  function paintList() {
    if (mode !== "list" || !list) return;
    const open = list.open || [];
    const done = list.done || [];
    const rec = list.record;
    const scroll = window.scrollY;
    const gated = lock() ? ' aria-disabled="true"' : "";
    root.innerHTML = `<div class="cs-page jp-page">
      <header class="cs-head">
        <h1 class="page-title">Jackpot</h1>
        <p class="cs-lede">Everyone throws into one pot. One draw, weighted by value, takes it all.</p>
      </header>
      ${gateNoticeHTML(lock())}
      <div class="cs-cols">
        <div class="cs-col-play">
          <section class="rt-box cs-new cs-mode" aria-labelledby="jp-new">
            <div class="cs-mode-art" aria-hidden="true">${potArtHTML({ size: 116 })}</div>
            <div class="plate-head"><h2 id="jp-new">New pot</h2><span class="cs-tag">Bots are free</span></div>
            <dl class="cs-facts">
              <div><dt>Players</dt><dd>${JACKPOT_RULES.minPlayers} to ${JACKPOT_RULES.maxPlayers}</dd></div>
              <div><dt>Entry, against the host's</dt><dd>1 to ${JACKPOT_RULES.maxMultiple} times</dd></div>
              <div><dt>Pot never fills</dt><dd>Back in ${JACKPOT_RULES.openHours}h</dd></div>
              ${rec?.played ? `<div><dt>Your record</dt><dd>${rec.won} won of ${rec.played}</dd></div>` : ""}
            </dl>
            <div class="cs-actions">
              <button class="solid rt-go${lock() ? " is-gated" : ""}"${gated} type="button" data-new>Start a pot</button>
              <button class="ghost${lock() ? " is-gated" : ""}"${gated} type="button" data-quick>Quick pot, bots</button>
            </div>
          </section>
        </div>
        <div class="cs-col-live">
          <section class="cs-section" aria-labelledby="jp-open">
            <h2 class="cs-h" id="jp-open">Open pots${open.length ? ` <span>${open.length}</span>` : ""}</h2>
            <div class="cs-rows">${open.length ? open.map(rowHTML).join("") : emptyBox("No open pots. Start one, or play a quick pot against bots.")}</div>
          </section>
          <section class="cs-section" aria-labelledby="jp-done">
            <h2 class="cs-h" id="jp-done">Recent draws</h2>
            <div class="cs-rows">${done.length ? done.slice(0, 12).map(doneRowHTML).join("") : emptyBox("No pots have been drawn yet.")}</div>
          </section>
          <details class="cs-how"><summary>How the draw stays fair</summary>
            <p>The server draws the winner the moment the pot fills or the host draws it, using its own randomness. Every card and slab moves in the same step, so nothing can be taken back or faked from a browser.</p>
            <p>Odds are each entry's share of the pot's value. Everyone else has to put up between one and ${JACKPOT_RULES.maxMultiple} times the host's entry, so nobody can drown out the table. A graded slab counts at its graded value, what it sells for. A pot that never fills returns every pile after ${JACKPOT_RULES.openHours} hours.</p>
            <p>Bots are free to call. A bot puts in new cards, and sometimes new graded slabs, worth up to 6% less than the minimum. If it wins, those leave the game. If you win, you receive them, slabs included. Either way the bot never gives away value.</p>
            <p>If a bot wins the pot, every slab in it leaves the game. A guard on a lost slab stays with you.</p></details>
        </div>
      </div>
    </div>`;
    if (Math.abs(window.scrollY - scroll) > 2) window.scrollTo(0, scroll);
  }

  const seatsStack = (pot) => `<span class="jp-seats" role="img" aria-label="${plural(pot.entries.length, "seat")} taken of ${pot.maxPlayers}">${pot.entries
    .slice(0, 3)
    .map((e) => seatAvatar(e.player, "bt-avatar"))
    .join("")}</span>`;

  const rowHTML = (pot) => {
    const mine = isHost(pot);
    const inside = inPot(pot);
    const left = timeLeft(pot.expiresAt - clockNow());
    const host = pot.entries[0]?.player;
    return `<article class="rt-row cs-row jp-row" data-id="${esc(pot.id)}">
      <a class="rt-row-lab cs-row-lab" href="/casino/jackpot/${esc(pot.id)}" data-open="${esc(pot.id)}" tabindex="-1" aria-hidden="true">${seatAvatar(host)}</a>
      <a class="cs-row-main" href="/casino/jackpot/${esc(pot.id)}" data-open="${esc(pot.id)}">
        <span class="cs-row-line"><b>${esc(playerName(host))}'s pot</b><small>${pot.entries.length} of ${pot.maxPlayers} seats, enter with ${coins(pot.minValue)} to ${coins(pot.maxValue)}${left ? `, ${left} left` : ""}</small></span>
        <span class="cs-row-stack">${seatsStack(pot)}</span>
      </a>
      <span class="cs-row-end"><span class="cs-row-fig">${coinTag(pot.pot)}</span>${
        mine ? `<button class="ghost sm cs-act is-quiet" type="button" data-cancel="${esc(pot.id)}">Cancel</button>` : inside ? `<a class="ghost sm cs-act" href="/casino/jackpot/${esc(pot.id)}" data-open="${esc(pot.id)}">You're in</a>` : `<button class="ghost sm cs-act" type="button" data-join="${esc(pot.id)}">Join</button>`
      }</span>
    </article>`;
  };

  const doneRowHTML = (pot) => {
    const winner = pot.entries.find((e) => e.won)?.player;
    const lost = pot.entries.filter((e) => !e.won);
    return `<a class="rt-row cs-row cs-row-link jp-row is-done" href="/casino/jackpot/${esc(pot.id)}" data-open="${esc(pot.id)}">
      <span class="rt-row-lab cs-row-lab">${seatAvatar(winner)}</span>
      <span class="cs-row-main">
        <span class="cs-row-line"><b>${esc(playerName(winner))}</b><small>beat ${plural(pot.entries.length - 1, "player")}</small></span>
        ${stakeStack(lost.flatMap((e) => e.stake), 3, "cs-row-stack", lost.flatMap((e) => e.slabs || []))}
      </span>
      <span class="cs-row-end"><span class="cs-row-fig">${coinTag(pot.pot)}</span></span>
    </a>`;
  };

  // ---- The table ----------------------------------------------------------
  const entryHTML = (pot, e, i = 0) => `<li class="jp-entry${e.won ? " is-won" : ""}" data-seat="${e.seat}" style="--i:${Math.min(i, 9)}">
      ${playerChip(e.player)}
      <span class="jp-entry-stake">${stakeStack(e.stake, 3, "is-lg", e.slabs)}</span>
      <span class="jp-entry-figs">${coinTag(e.value)}</span>
      <span class="jp-share"><em class="jp-odds">${pct(e.odds)}</em><span class="jp-bar" aria-hidden="true"><b style="width:${Math.max(2, e.odds * 100)}%"></b></span></span>
    </li>`;

  const openSeatHTML = (_, i = 0) => `<li class="jp-entry is-open-seat">${playerChip(null)}<span class="jp-entry-stake"></span></li>`;

  function actionsHTML(pot) {
    if (pot.status !== "open") return "";
    const host = isHost(pot);
    const inside = inPot(pot);
    const canDraw = host && pot.entries.length >= JACKPOT_RULES.earlyDrawMin;
    const buttons = [];
    // One red press: join if you're out, draw once the host can, otherwise call a bot.
    if (!inside) buttons.push(`<button class="solid" type="button" data-join="${esc(pot.id)}">Join the pot</button>`);
    if (host) {
      if (canDraw) buttons.push(`<button class="solid" type="button" data-draw>Draw now</button>`);
      buttons.push(`<button class="${canDraw ? "ghost" : "solid"}" type="button" data-bot="add">Add a free bot</button>`);
      if (humans(pot).length > 1 && pot.seatsOpen > 1) buttons.push(`<button class="ghost" type="button" data-bot="fill">Fill with bots</button>`);
    }
    const quiet = [];
    if (host || inside) quiet.push(`<button class="ghost" type="button" data-copy>${icon("link")}Copy link</button>`);
    if (host) quiet.push(`<button class="ghost" type="button" data-cancel="${esc(pot.id)}">Cancel</button>`);
    else if (inside) quiet.push(`<button class="ghost" type="button" data-leave>Leave</button>`);
    return `<div class="cf-btns">${buttons.join("")}</div>${quiet.length ? `<div class="cf-btns${quiet.length > 1 ? " is-pair" : ""}">${quiet.join("")}</div>` : ""}`;
  }

  function paintTable(pot) {
    const left = timeLeft(pot.expiresAt - clockNow());
    const seats = pot.entries.map((e, i) => entryHTML(pot, e, i)).join("") + Array.from({ length: pot.status === "open" ? pot.seatsOpen : 0 }, openSeatHTML).join("");
    // Seats as Poké Ball pips, and the time left before an unfilled pot goes back, as a bar.
    const pips = Array.from({ length: pot.maxPlayers }, (_, i) => `<i class="rt-ball${i < pot.entries.length ? "" : " e"}"></i>`).join("");
    const span = JACKPOT_RULES.openHours * 3600000;
    const timeShare = pot.status === "open" ? Math.max(0, Math.min(1, (pot.expiresAt - clockNow()) / span)) : 0;
    const line =
      pot.status === "open"
        ? `${pot.entries.length} of ${pot.maxPlayers} seats. Enter with ${coins(pot.minValue)} to ${coins(pot.maxValue)} coins of cards or slabs${left ? `, closes in ${left}` : ""}.`
        : pot.status === "done" ? `${pot.entries.length} players, ${countLine(pot.entries.flatMap((e) => e.stake), pot.entries.flatMap((e) => e.slabs || []))} in the pot.` : "This pot was cancelled. Every pile went back to its owner.";
    root.innerHTML = `<div class="cs-page jp-page jp-table" data-status="${esc(pot.status)}">
      <a class="cs-back" href="/casino/jackpot" data-nav>${icon("back")}Jackpot</a>
      <div class="jp-board">
        <header class="jp-head">
          <div class="jp-pot" aria-hidden="true">${potArtHTML({ size: 132 })}</div>
          <div class="jp-head-copy">
            <span class="jp-kicker">${pot.status === "done" ? "The pot" : pot.status === "open" ? "In the pot" : "Cancelled pot"}</span>
            <p class="jp-total">${coinTag(pot.pot)}</p>
            <p class="jp-sub">${esc(line)}</p>
            <div class="jp-meters">
              <span class="jp-seatpips" role="img" aria-label="${plural(pot.entries.length, "seat")} taken of ${pot.maxPlayers}">${pips}</span>
              ${pot.status === "open" ? `<span class="rt-hp jp-time" aria-hidden="true"><em>Time</em><span class="rt-track"><i style="transform:scaleX(${timeShare.toFixed(4)})"></i></span></span>` : ""}
            </div>
          </div>
        </header>
        <ol class="jp-entries">${seats}</ol>
        <p class="cf-line cf-result jp-result" aria-live="polite"></p>
        <div class="jp-actions">${actionsHTML(pot)}</div>
      </div>
      <section class="jp-haul" hidden></section>
    </div>`;
  }

  const potSlabs = (pot) => pot.entries.flatMap((e) => e.slabs || []);
  const outcome = (pot) => {
    const winner = pot.entries.find((e) => e.won);
    if (!winner) return "";
    const total = coins(pot.pot);
    const of = potSlabs(pot).length ? "cards and slabs" : "cards";
    const mine = me() && winner.player.userId === me().id;
    if (mine) return `You take the pot. ${total} coins of ${of} are yours.`;
    const lost = pot.entries.find((e) => me() && e.player.userId === me().id);
    if (!lost) return `${playerName(winner.player)} takes ${total} coins of ${of}.`;
    return `${playerName(winner.player)} takes the pot. You lose ${coins(lost.value)} coins of ${(lost.slabs || []).length ? "cards and slabs" : "cards"}.`;
  };

  /** The call in a few words; the red row and the line under it carry the rest. */
  const headline = (pot) => {
    const winner = pot.entries.find((e) => e.won);
    if (!winner) return "";
    return me() && winner.player.userId === me().id ? "You take the pot" : `${playerName(winner.player)} takes the pot`;
  };
  /** What the viewer put in and lost, in one quiet line. */
  const lossLine = (pot) => {
    const lost = pot.entries.find((e) => me() && e.player.userId === me().id && !e.won);
    return lost ? `You lose ${coins(lost.value)} coins of ${(lost.slabs || []).length ? "cards and slabs" : "cards"}.` : "";
  };

  /** A quiet second line when the viewer lost a slab: where it went, and that its guard stays. */
  const outcomeNote = (pot) => {
    const winner = pot.entries.find((e) => e.won);
    const lost = pot.entries.find((e) => me() && e.player.userId === me().id && !e.won);
    const slabs = lost?.slabs || [];
    if (!winner || !slabs.length) return "";
    const gone = winner.player.bot
      ? `${slabs.length === 1 ? "Your slab leaves" : "Your slabs leave"} the game with the house bot.`
      : `${slabs.length === 1 ? "Your slab goes" : "Your slabs go"} to ${playerName(winner.player)}.`;
    return `${gone}${slabs.some((sl) => sl.guard) ? " A guard stays with you." : ""}`;
  };

  function applyPot(pot, { fromPoll = false } = {}) {
    const prev = table?.pot;
    table = { pot };
    const fresh = pot.status === "done" && clockNow() - pot.drawnAt < FRESH_MS && !seenSet().has(pot.id);
    const changed = !prev || prev.status !== pot.status || prev.entries.length !== pot.entries.length ||
      prev.entries.some((e, i) => e.player.userId !== pot.entries[i]?.player.userId || e.value !== pot.entries[i]?.value);
    if (!changed && fromPoll) {
      const sub = root.querySelector(".jp-sub");
      if (sub && pot.status === "open") {
        const left = timeLeft(pot.expiresAt - clockNow());
        sub.textContent = `${pot.entries.length} of ${pot.maxPlayers} seats. Enter with ${coins(pot.minValue)} to ${coins(pot.maxValue)} coins of cards or slabs${left ? `, closes in ${left}` : ""}.`;
        const bar = root.querySelector(".jp-time .rt-track > i");
        if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, (pot.expiresAt - clockNow()) / (JACKPOT_RULES.openHours * 3600000))).toFixed(4)})`;
      }
      return;
    }
    paintTable(pot);
    if (pot.status !== "done") return;
    if (fresh) play(pot);
    else settle(pot, false);
  }

  function settle(pot, animated) {
    const page = root.querySelector(".jp-table");
    if (!page) return;
    page.classList.add("is-decided");
    page.classList.toggle("is-live", Boolean(animated));
    const mineEntry = pot.entries.find((e) => me() && e.player.userId === me().id);
    if (mineEntry) page.classList.add(mineEntry.won ? "you-won" : "you-lost");
    root.querySelectorAll(".jp-entry.is-lit").forEach((el) => el.classList.remove("is-lit"));
    const line = root.querySelector(".jp-result");
    if (line) {
      line.textContent = headline(pot);
      line.setAttribute("aria-label", outcome(pot));
    }
    const note = outcomeNote(pot);
    const under = [lossLine(pot), note].filter(Boolean).join(" ");
    if (line && under && !root.querySelector(".jp-note")) line.insertAdjacentHTML("afterend", `<p class="cs-note jp-note">${esc(under)}</p>`);
    const winner = pot.entries.find((e) => e.won);
    const haul = root.querySelector(".jp-haul");
    if (haul && winner) {
      const all = pot.entries.filter((e) => !e.won).flatMap((e) => e.stake);
      const allSlabs = pot.entries.filter((e) => !e.won).flatMap((e) => e.slabs || []);
      const mineWon = Boolean(me() && winner.player.userId === me().id);
      haul.hidden = false;
      haul.innerHTML = `<h2 class="cs-h">What ${mineWon ? "you won" : `${esc(playerName(winner.player))} won`}</h2>${
        mineWon && allSlabs.length ? `<p class="cs-won-line">${esc(`You won ${plural(allSlabs.length, "slab")}`)}</p>` : ""
      }<div class="cf-pile">${pileTiles(all, allSlabs)}</div>`;
    }
    const actions = root.querySelector(".jp-actions");
    const iWon = Boolean(me() && winner?.player.userId === me().id);
    if (actions) {
      actions.innerHTML = `${iWon ? winningsSlot("jackpot", pot.id) : ""}<div class="cf-btns${inPot(pot) ? " is-pair" : ""}"><a class="ghost" href="/casino/jackpot" data-nav>All pots</a>${
        inPot(pot) ? `<button class="solid" type="button" data-new>Start another</button>` : ""}</div>`;
      if (iWon) mountWinnings(actions.querySelector("[data-winnings]"), { source: "jackpot", id: pot.id, ctx });
    }
    if (animated) ctx.buzz?.([18, 40, 26]);
  }

  /** Sweep a light down the seats, slowing to a stop on the winner. */
  async function play(pot) {
    const mark = ++playing;
    markSeen(pot.id);
    const rows = [...root.querySelectorAll(".jp-entry[data-seat]")];
    const winnerIdx = Math.max(0, pot.entries.findIndex((e) => e.won));
    const line = root.querySelector(".jp-result");
    if (line) line.textContent = "Drawing";
    root.querySelector(".jp-table")?.classList.add("is-drawing");
    if (ctx.motion() && rows.length > 1) {
      const laps = 2 + (rows.length < 5 ? 2 : 1);
      const total = laps * rows.length + winnerIdx;
      for (let step = 0; step <= total; step++) {
        if (mark !== playing || !visible) return;
        rows.forEach((el, i) => el.classList.toggle("is-lit", i === step % rows.length));
        // Quick at first, then the last few steps ease to a stop.
        const remaining = total - step;
        await new Promise((r) => setTimeout(r, 70 + Math.pow(Math.max(0, 9 - remaining), 2.2) * (remaining < 9 ? 9 : 0)));
      }
    } else await new Promise((r) => setTimeout(r, 300));
    if (mark !== playing || !visible) return;
    root.querySelector(".jp-table")?.classList.remove("is-drawing");
    settle(pot, true);
    ctx.applySave?.(pendingSave);
    pendingSave = null;
  }

  // ---- Actions ------------------------------------------------------------
  const needSignIn = () => {
    if (me()) return false;
    ctx.toast?.("Sign in to play. Your cards and slabs are what you put in.");
    ctx.signIn?.();
    return true;
  };

  const seatOption = (values, value) => [{ key: "players", label: "Seats", values, value }];

  function openCreate({ quick }) {
    if (needSignIn()) return;
    if (lock()) return ctx.toast?.(gateRefusal(lock()));
    ctx.picker.open({
      title: quick ? "Quick pot with bots" : "Start a pot",
      lede: quick ? "Your entry sets the stakes. Bots fill every other seat and it is drawn at once." : `Your entry is the pot's minimum. Everyone else puts in one to ${JACKPOT_RULES.maxMultiple === 5 ? "five" : JACKPOT_RULES.maxMultiple} times as much.`,
      options: seatOption(quick ? [3, 4, 5, 6] : [3, 4, 6, 8, 10], quick ? 4 : JACKPOT_RULES.defaultPlayers),
      confirmLabel: (total) => (quick ? `Play a quick pot for ${coins(total)}` : `Start a pot with ${coins(total)}`),
      busyLabel: quick ? "Drawing" : "Setting the table",
      noun: "pot",
      hint: (total) => (total > 0 ? `Others can enter with ${coins(total)} to ${coins(total * JACKPOT_RULES.maxMultiple)} coins of cards or slabs.` : "Tap cards or slabs to put them in. They leave your collection until the pot is drawn."),
      onConfirm: async (cards, _total, choices, slabIds) => {
        const data = await post(quick ? "/api/casino/jackpots/quick" : "/api/casino/jackpots", { requestId: uuid(), cards, slabs: slabIds || [], players: Number(choices.players) });
        ctx.clock.sync(data.serverNow);
        if (quick) pendingSave = data.save;
        else ctx.applySave?.(data.save);
        ctx.navigate(`/casino/jackpot/${data.jackpot.id}`);
        if (quick) setTimeout(() => { if (mode === "table" && potId === data.jackpot.id) applyPot(data.jackpot); }, 0);
      },
    });
  }

  function openJoin(id) {
    if (needSignIn()) return;
    if (lock()) return ctx.toast?.(gateRefusal(lock()));
    const pot = table?.pot?.id === id ? table.pot : list?.open?.find((p) => p.id === id);
    if (!pot) return;
    ctx.picker.open({
      title: "Join the pot",
      lede: `${pot.seatsOpen === 1 ? "Last seat: your entry fills the pot and it is drawn at once." : `${plural(pot.seatsOpen, "seat")} open.`}`,
      target: { min: pot.minValue, max: pot.maxValue, value: pot.minValue },
      confirmLabel: (total) => `Put in ${coins(total)}`,
      busyLabel: "Joining",
      onConfirm: async (cards, _total, _choices, slabIds) => {
        const data = await post(`/api/casino/jackpots/${encodeURIComponent(id)}/join`, { cards, slabs: slabIds || [] });
        ctx.clock.sync(data.serverNow);
        if (data.jackpot.status === "done") pendingSave = data.save;
        else ctx.applySave?.(data.save);
        if (mode === "table" && potId === id) { table = { pot: data.jackpot }; paintTable(data.jackpot); if (data.jackpot.status === "done") play(data.jackpot); else later(loadTable, TABLE_POLL_MS); }
        else {
          ctx.navigate(`/casino/jackpot/${id}`);
          setTimeout(() => { if (mode === "table" && potId === id) applyPot(data.jackpot); }, 0);
        }
      },
    });
  }

  async function act(path, body, { done, failure } = {}) {
    try {
      const data = await post(path, body);
      ctx.clock.sync(data.serverNow);
      if (data.jackpot.status === "done") {
        pendingSave = data.save;
        if (mode === "table") { table = { pot: data.jackpot }; paintTable(data.jackpot); play(data.jackpot); }
      } else {
        ctx.applySave?.(data.save);
        if (done) ctx.toast?.(done);
        if (mode === "table") { table = null; applyPot(data.jackpot); if (data.jackpot.status === "open") later(loadTable, TABLE_POLL_MS); }
        else loadList();
      }
    } catch (err) {
      ctx.toast?.(err?.message || failure || "That didn't work.");
      if (mode === "table") loadTable();
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
    if (e.target.closest("[data-new]")) return openCreate({ quick: false });
    if (e.target.closest("[data-quick]")) return openCreate({ quick: true });
    const join = e.target.closest("[data-join]");
    if (join) return openJoin(join.dataset.join);
    const cancel = e.target.closest("[data-cancel]");
    if (cancel) return act(`/api/casino/jackpots/${encodeURIComponent(cancel.dataset.cancel)}/cancel`, {}, { done: "Pot cancelled. Every pile went back." });
    if (e.target.closest("[data-leave]")) return act(`/api/casino/jackpots/${encodeURIComponent(potId)}/leave`, {}, { done: "You left the pot. Your stake is back." });
    const bot = e.target.closest("[data-bot]");
    if (bot) return act(`/api/casino/jackpots/${encodeURIComponent(potId)}/bot`, bot.dataset.bot === "fill" ? { fill: true } : {});
    if (e.target.closest("[data-draw]")) return act(`/api/casino/jackpots/${encodeURIComponent(potId)}/draw`, {});
    if (e.target.closest("[data-copy]")) {
      const url = `${location.origin}/casino/jackpot/${potId}`;
      navigator.clipboard?.writeText(url).then(() => ctx.toast?.("Link copied."), () => ctx.toast?.(url));
      return;
    }
    const card = e.target.closest("[data-inspect]");
    if (card) ctx.inspect?.({ id: card.dataset.inspect, reverse: card.dataset.rev === "1" });
  });

  // ---- Lifecycle ----------------------------------------------------------
  function show(id = "") {
    const nextMode = id ? "table" : "list";
    if (visible && mode === nextMode && potId === id) return;
    visible = true;
    stop();
    playing++;
    mode = nextMode;
    potId = id;
    table = null;
    root.innerHTML = `<div class="cs-page jp-page"><p class="cs-empty">Loading.</p></div>`;
    if (mode === "list") loadList();
    else loadTable(true);
  }
  function hide() {
    visible = false;
    stop();
    token++;
    playing++;
    mode = "list";
    potId = "";
    ctx.picker.close();
  }
  return { show, hide };
}
