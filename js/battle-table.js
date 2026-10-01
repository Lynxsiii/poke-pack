/* One battle table (/battles/<id>): the lobby, the 3-2-1, the live arena and
   the result, in every state and on reload at any moment.

   The table owns the page and each lane's frame (avatar, name, live score,
   leader crown, round header, result). Everything inside a lane's stage
   (.tb-stage) belongs to the reveal engine (js/battle-reveal.js). The server
   owns every pull and the clock: a round appears in `battle.rounds` only once
   the server has revealed it, and its animation plays until the next one is due. */
import { api } from "./api.js";
import { tintFrom } from "./fx.js";
import { createReveal } from "./battle-reveal.js";
import { esc, coins, coinTag, icon, wrapperArt, seatAvatar, hitTier } from "./battle-kit.js";
// Same specifier as the router, so this is the same module instance (the
// builder's state lives there). A namespace import tolerates a missing export.
import * as hallModule from "./battle-hall.js?v=3";
import { mountWinnings, winningsSlot } from "./casino-winnings.js";

const MODE_NAME = { standard: "Standard", crazy: "Crazy", shared: "Shared" };
const SCORED_BY = { total: "total value", last: "the last round", best: "best single card" };
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const smallImage = (card) => card?.imageSmall || String(card?.image || "").replace(/(\.\w+)$/, "-sm$1");
const cents = (v) => Math.round(Number(v || 0) * 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Highest score takes every card, scored by total value. 2v2, fast." */
export function rulesLine(s = {}) {
  const who = s.mode === "shared"
    ? "Everyone splits the cards by value"
    : `${s.mode === "crazy" ? "Lowest" : "Highest"} score takes every card, scored by ${SCORED_BY[s.scoring] || SCORED_BY.total}`;
  const extras = [s.teams && "2v2 teams", s.fast && "fast reveals", s.skipCommons && "commons skipped in the reveal"].filter(Boolean);
  const tail = extras.length ? ` ${extras.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "";
  return `${MODE_NAME[s.mode] || "Standard"}. ${who}.${tail}`;
}

export function createTable(ctx) {
  const reveal = createReveal(ctx);
  const R = (name, arg) => {
    try { return typeof reveal?.[name] === "function" ? reveal[name](arg) : undefined; }
    catch (err) { console.warn("battle reveal", name, err); return undefined; }
  };

  // One element owns the page while a table is shown; its listeners go with it.
  const host = document.createElement("div");
  host.className = "tb";

  let id = "", battle = null, visible = false, gen = 0;
  let view = "loading";            // loading error lobby cancelled intro live result replay
  let loadError = null, netError = false, busy = false;
  let pollTimer = 0, tickTimer = 0, rafId = 0;
  const timers = new Set();
  let roundBase = 1;               // 1: round i is revealed at startsAt + i*roundMs (spec); 0: one round later
  let shownRound = -1, stale = true, playing = null, finishing = false, stageToken = 0, replayToken = 0;
  let finaleDone = false, sawLive = false, introDigit = "", headRound = -2;
  const stages = new Map(), stageState = new Map(), stageCards = new Map();
  let disp = [], tweens = new Map();
  const html = new Map();          // last HTML per region, so polls don't churn the DOM
  let laneKey = "", bestCards = [], inviteOpen = false;
  const refreshed = new Set();
  // Every response is stamped; one that lands after a newer one was accepted
  // (a poll in flight while Start or Skip went out) is dropped.
  let reqSeq = 0, acceptedSeq = 0;
  // The page takes its light from the wrapper on the table, as the hall does,
  // and hands the previous light back when the table goes.
  let ambientBefore = null, ambientSrc = "";
  const RESOLVE_MS = 2500;

  /* ---- Small helpers ---------------------------------------------------- */
  const alive = (g) => g === gen && visible;
  const wait = (ms) => new Promise((resolve) => {
    const t = setTimeout(() => { timers.delete(t); resolve(); }, Math.max(0, ms));
    timers.add(t);
  });
  const uid = () => ctx.user?.()?.id ?? null;
  const isMe = (seat) => Boolean(seat && !seat.bot && seat.userId != null && uid() != null && String(seat.userId) === String(uid()));
  const mySeat = () => battle?.seats?.find(isMe) || null;
  const isHost = () => Boolean(battle && uid() != null && String(battle.hostId) === String(uid()));
  const seatAt = (i) => battle?.seats?.find((s) => s.seat === i) || null;
  const players = () => Number(battle?.settings?.players || 2);
  const settings = () => battle?.settings || {};
  const motion = () => ctx.motion?.() !== false;
  const inviteUrl = () => `${location.origin}/battles/${battle?.id || id}`;
  const soloMe = () => {
    if (!battle || !mySeat()) return false;
    const humans = battle.seats.filter((s) => !s.bot).length;
    return battle.soloHuman ?? humans === 1;
  };
  const planAt = (i) => battle?.plan?.[Math.max(0, Math.min(i, (battle?.plan?.length || 1) - 1))] || {};
  const region = (name) => host.querySelector(`[data-region="${name}"]`);
  function setHTML(name, markup) {
    const el = region(name);
    if (!el || html.get(name) === markup) return false;
    html.set(name, markup);
    el.innerHTML = markup;
    return true;
  }
  const revealAt = (i) => Number(battle.startsAt) + (i + 1 - roundBase) * Number(battle.roundMs || 6000);
  const winners = () => battle?.result?.winners ?? battle?.winners ?? [];
  const teamOf = (i) => Math.floor(i / 2);

  /* ---- Lifecycle -------------------------------------------------------- */
  function show(nextId) {
    hide();
    visible = true;
    ambientSrc = "";
    id = String(nextId || "");
    battle = null; view = "loading"; loadError = null; netError = false; busy = false;
    shownRound = -1; stale = false; playing = null; finishing = false; finaleDone = false; sawLive = false;
    introDigit = ""; headRound = -2; laneKey = ""; bestCards = []; inviteOpen = false; roundBase = 1;
    disp = []; tweens = new Map(); html.clear();
    stages.clear(); stageState.clear(); stageCards.clear();
    host.innerHTML = `
      <nav class="tb-top" data-region="top"></nav>
      <div class="tb-head" data-region="head"></div>
      <div class="tb-table" data-region="table">
        <div class="tb-pot" data-region="pot"></div>
        <div class="tb-lanes" data-region="lanes"></div>
        <div class="tb-intro" data-region="intro" aria-live="polite"></div>
      </div>
      <p class="tb-rules" data-region="rules"></p>
      <div class="tb-below" data-region="below"></div>`;
    ctx.root.replaceChildren(host);
    measureHeader();
    render();
    poll();
  }

  function hide() {
    visible = false;
    gen++;
    clearTimeout(pollTimer);
    clearInterval(tickTimer); tickTimer = 0;
    cancelAnimationFrame(rafId); rafId = 0;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    replayToken++; stageToken++;
    playing = null; finishing = false;
    cancelAnimationFrame(floatRaf); floatRaf = 0;
    R("stop");
    if (ambientBefore !== null) {
      if (ambientBefore) document.body.style.setProperty("--ambient", ambientBefore);
      else document.body.style.removeProperty("--ambient");
      ambientBefore = null;
    }
    ambientSrc = "";
  }

  /** Light the page from the wrapper (or box) on the table right now. */
  function tintTable() {
    if (!battle || !visible) return;
    const index = ["intro", "live", "replay"].includes(view) ? Math.max(0, shownRound) : 0;
    const plan = planAt(index);
    const first = battle.lineup?.[0];
    const src = plan.image || wrapperArt(plan.setId) || first?.image || wrapperArt(first?.setId) || "";
    if (!src || src === ambientSrc) return;
    ambientSrc = src;
    const g = gen;
    const img = new Image();
    img.decoding = "async";
    const apply = () => {
      if (!alive(g) || ambientSrc !== src) return;
      // Remember the light we found only now, so a tint the site applied
      // while we loaded is the one handed back.
      if (ambientBefore === null) ambientBefore = document.body.style.getPropertyValue("--ambient");
      tintFrom(img);
    };
    img.addEventListener("load", apply, { once: true });
    img.src = src;
    if (img.complete && img.naturalWidth) apply();
  }

  /** Card records for the reveal, never waiting on set data for long. */
  function resolveSoon(cards) {
    const raw = cards || [];
    if (!ctx.resolveCards) return Promise.resolve(raw);
    let timer = 0;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(raw), RESOLVE_MS); });
    return Promise.race([Promise.resolve(ctx.resolveCards(raw)).then((r) => r || raw, () => raw), late])
      .finally(() => clearTimeout(timer));
  }

  function measureHeader() {
    const h = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
    host.style.setProperty("--tb-top", `${Math.round(h)}px`);
  }

  /* ---- Server ----------------------------------------------------------- */
  async function poll() {
    clearTimeout(pollTimer);
    if (!visible || !id) return;
    const g = gen;
    const seq = ++reqSeq;
    try {
      const data = await api(`/api/battles/${encodeURIComponent(id)}`);
      if (!alive(g)) return;
      if (seq < acceptedSeq) { schedulePoll(); return; }
      acceptedSeq = seq;
      ctx.clock?.sync?.(data.serverNow);
      if (data.save) ctx.applySave?.(data.save);
      netError = false; loadError = null;
      if (!data.battle) throw Object.assign(new Error("This battle could not be found."), { status: 404 });
      accept(data.battle, data.serverNow);
    } catch (err) {
      if (!alive(g)) return;
      if (!battle || err?.status === 404) {
        loadError = err; view = "error";
        render();
        return;
      }
      netError = true;
      renderTop();
    }
    if (alive(g)) schedulePoll();
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!visible || document.hidden || !battle || view === "error") return;
    const status = battle.status;
    if ((status === "finished" || status === "cancelled") && !netError) return;
    let ms = netError ? 3000 : status === "lobby" ? 2500 : 1000;
    if (status === "running" && !netError) {
      const next = (battle.rounds?.length || 0) < battle.roundCount ? revealAt(battle.rounds.length) : Number(battle.endsAt);
      if (Number.isFinite(next)) ms = Math.max(150, Math.min(ms, next - ctx.clock.now() + 90));
    }
    pollTimer = setTimeout(poll, ms);
  }

  function accept(next, serverNow) {
    battle = next;
    battle.rounds ||= [];
    battle.seats ||= [];
    battle.plan ||= [];
    battle.roundMs = Number(battle.roundMs) || (battle.settings?.fast ? 2600 : 6000);
    const now = Number(serverNow) || ctx.clock.now();
    if (battle.status === "running" && now >= battle.startsAt && battle.revealedRounds < battle.roundCount) {
      // The spec reveals round i at startsAt + i*roundMs (base 1). An older
      // server revealed it one round later (base 0); only believe that when
      // the gap is a whole round, well away from a round boundary.
      const since = now - battle.startsAt;
      const elapsed = Math.floor(since / battle.roundMs);
      const into = since - elapsed * battle.roundMs;
      const gap = battle.revealedRounds - elapsed;
      if (gap >= 1) roundBase = 1;
      else if (gap <= 0 && into > 500 && into < battle.roundMs - 500) roundBase = 0;
    }
    update();
  }

  function update() {
    const b = battle;
    if (view === "replay") { renderTop(); return; }
    if (b.status === "lobby") setView("lobby");
    else if (b.status === "cancelled") setView("cancelled");
    else if (b.status === "running") {
      sawLive = true;
      if (view !== "live" && view !== "intro") setView(ctx.clock.now() < b.startsAt ? "intro" : "live");
      else render();
      syncRounds();
    } else if (b.status === "finished") {
      if (view === "result" || finishing) render();
      else if (["lobby", "intro", "live"].includes(view)) runFinish();
      else enterResult({ finale: false });
    }
  }

  async function act(action, body = {}) {
    if (busy || !battle) return null;
    if (!ctx.user?.()) { ctx.signIn?.(); return null; }
    const g = gen;
    busy = true; syncBusy();
    clearTimeout(pollTimer);
    const seq = ++reqSeq;
    try {
      const data = await api(`/api/battles/${encodeURIComponent(battle.id)}/${action}`, { method: "POST", body: JSON.stringify(body) });
      if (!alive(g)) return null;
      acceptedSeq = Math.max(acceptedSeq, seq);
      ctx.clock?.sync?.(data.serverNow);
      if (data.save) ctx.applySave?.(data.save);
      busy = false;
      if (data.battle) accept(data.battle, data.serverNow);
      return data;
    } catch (err) {
      if (!alive(g)) return null;
      busy = false;
      if (err?.status === 401) ctx.signIn?.();
      else ctx.toast?.(friendly(err, action));
      return null;
    } finally {
      if (alive(g)) { busy = false; syncBusy(); schedulePoll(); }
    }
  }

  function friendly(err, action) {
    if (err?.status === 404 && ["unbot", "skip"].includes(action)) return action === "skip" ? "Skipping isn't available yet." : "Bots can't be removed yet.";
    return err?.message || "Something went wrong. Try again.";
  }

  function syncBusy() {
    host.classList.toggle("is-busy", busy);
    host.querySelectorAll("[data-act]").forEach((el) => {
      if (el.dataset.lock === "1") return;
      if (busy) el.setAttribute("aria-disabled", "true");
      else el.removeAttribute("aria-disabled");
    });
  }

  /* ---- Views ------------------------------------------------------------ */
  function setView(next) {
    const prev = view;
    if (view !== next) {
      view = next;
      host.dataset.view = next;
    }
    render();
    // Start pressed from the dock at the bottom: bring the table up for the 3-2-1.
    if (prev === "lobby" && (next === "intro" || next === "live") && players() <= 2) {
      const top = region("head")?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > innerHeight * 0.4) region("head").scrollIntoView({ behavior: motion() ? "smooth" : "auto", block: "start" });
    }
    if (next === "lobby" || next === "intro") ensurePacks(0);
    if ((next === "intro" || next === "live") && prev !== next && players() > 2) bringTableUp();
    // The table shrinks to a note when it is cancelled: start from the top.
    if (next === "cancelled" && prev !== "cancelled" && prev !== "loading" && (region("head")?.getBoundingClientRect().top ?? 0) < 0) {
      window.scrollTo({ top: 0, behavior: motion() ? "smooth" : "auto" });
    }
    ensureTicker();
  }

  function render() {
    host.dataset.view = view;
    renderTop();
    if (view === "loading") return renderSkeleton();
    if (view === "error") return renderError();
    renderHead();
    renderPot();
    renderLanes();
    setHTML("rules", battle && view !== "result" ? esc(rulesLine(settings())) : "");
    renderBelow();
    paintHeads();
    paintIntro();
    syncBusy();
    updateFloats();
    tintTable();
  }

  /* The page scrolls inside a body that clips overflow, so position: sticky
     never engages here. The round header and the lobby's action dock float
     (position: fixed) once their place scrolls out of view. */
  let floatRaf = 0;
  function onScroll() {
    if (visible && !floatRaf) floatRaf = requestAnimationFrame(updateFloats);
  }
  function updateFloats() {
    floatRaf = 0;
    if (!visible || !host.isConnected) return;
    const siteHeader = document.querySelector(".site-header")?.getBoundingClientRect();
    const top = Math.max(0, siteHeader ? siteHeader.bottom : 0);
    host.style.setProperty("--tb-top", `${Math.round(top)}px`);
    const head = region("head");
    if (head) {
      const round = head.querySelector(".tb-round");
      const table = region("table")?.getBoundingClientRect();
      const r = head.getBoundingClientRect();
      const float = Boolean(round) && r.top < top - 1 && (!table || table.bottom > top + 120);
      if (float && !head.classList.contains("is-float")) head.style.height = `${head.offsetHeight}px`;
      if (!float) head.style.height = "";
      head.classList.toggle("is-float", float);
    }
    const slot = host.querySelector(".tb-dock-slot");
    if (slot) {
      const bar = document.querySelector(".tabbar");
      const barTop = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : innerHeight;
      const r = slot.getBoundingClientRect();
      const float = r.bottom > barTop - 12;
      if (float && !slot.classList.contains("is-float")) slot.style.height = `${slot.offsetHeight}px`;
      if (!float) slot.style.height = "";
      slot.classList.toggle("is-float", float);
    }
  }

  function renderSkeleton() {
    setHTML("head", `<div class="tb-skel tb-skel-title"></div><div class="tb-skel tb-skel-line"></div>`);
    setHTML("pot", "");
    setHTML("lanes", `<div class="tb-lanes-grid p2">${[0, 1].map(() => `<div class="tb-lane is-skel"><div class="tb-lane-head"><span class="tb-skel tb-skel-avatar"></span><span class="tb-skel tb-skel-name"></span></div><div class="tb-stage-skel tb-skel"></div></div>`).join("")}</div>`);
    host.querySelector(".tb-lanes")?.setAttribute("aria-busy", "true");
    setHTML("rules", "");
    setHTML("below", `<p class="tb-quiet" role="status">Setting the table</p>`);
  }

  function renderError() {
    const missing = loadError?.status === 404;
    setHTML("head", `<h1 class="page-title">${missing ? "This table is gone" : "The table didn't load"}</h1>
      <p class="tb-lede">${missing ? "It may have expired, or the link is incomplete." : esc(loadError?.message && loadError.status ? loadError.message : "Check your connection and try again.")}</p>
      <div class="tb-row">${missing ? "" : `<button class="solid" data-act="retry">${icon("refresh")}Try again</button>`}
      <a class="${missing ? "solid" : "ghost"}" href="/battles" data-nav="/battles">All battles</a></div>`);
    setHTML("pot", "");
    setHTML("lanes", "");
    setHTML("rules", "");
    setHTML("below", "");
    host.querySelector(".tb-lanes")?.removeAttribute("aria-busy");
  }

  function renderTop() {
    let status = "";
    let right = "";
    if (battle) {
      const b = battle;
      const seated = b.seats.length;
      if (view === "replay") status = `<span class="tb-status">Replay</span>`;
      else if (b.status === "lobby") status = `<span class="tb-status">${seated} of ${players()} seated</span>`;
      else if (b.status === "running") status = `<span class="tb-status is-live"><i aria-hidden="true"></i>Live</span>`;
      else if (b.status === "finished") status = `<span class="tb-status">Finished</span>`;
      else if (b.status === "cancelled") status = `<span class="tb-status">Cancelled</span>`;
      if (netError) status = `<span class="tb-status is-warn" role="status">Reconnecting</span>`;
      if (view === "replay") right = `<button class="ghost sm" data-act="stop-replay">${icon("close")}Stop replay</button>`;
      else if (b.status === "running" && soloMe()) right = `<button class="ghost sm" data-act="skip">${icon("skip")}Skip to result</button>`;
      else if (b.status === "lobby" || b.status === "running") right = `<button class="tb-link-btn" data-act="invite">${icon("link")}<span>Invite link</span></button>`;
    }
    const field = inviteOpen && battle ? `<div class="tb-invite-field"><input readonly value="${esc(inviteUrl())}" aria-label="Invite link" /><span>Copy this link to invite someone</span></div>` : "";
    setHTML("top", `<a class="tb-back" href="/battles" data-nav="/battles">${icon("back")}<span>All battles</span></a>
      <span class="tb-top-mid">${status}</span><span class="tb-top-right">${right}</span>${field}`);
  }

  function lobbyCopy() {
    const b = battle, open = players() - b.seats.length, me = mySeat();
    if (isHost()) {
      return open > 0
        ? [open === 1 ? "Waiting for one more" : `Waiting for ${open} players`, "Call a bot for free, or send the invite link to a friend."]
        : ["Ready when you are", "Every seat is filled. Start the battle when you're set."];
    }
    if (me) return open > 0
      ? ["You're in", "The host starts the battle once every seat is filled."]
      : ["Waiting for the host", "Every seat is filled. The battle starts any moment."];
    return open > 0
      ? ["Take a seat", `Entry is ${coinTag(b.entryCost)}. Leave before the start and it comes straight back.`]
      : ["This table is full", "The battle starts soon. Stay and watch it live."];
  }

  function renderHead() {
    const b = battle;
    if (view === "lobby") {
      const [title, line] = lobbyCopy();
      headRound = -2;
      setHTML("head", `<h1 class="page-title">${esc(title)}</h1><p class="tb-lede">${line}</p>`);
    } else if (view === "cancelled") {
      headRound = -2;
      setHTML("head", `<h1 class="page-title">This table was cancelled</h1><p class="tb-lede">Every entry was refunded. The lineup is still here if you want to run it again.</p>`);
    } else if (view === "result") {
      headRound = -2;
      if (setHTML("head", resultHead())) {
        const slot = region("head")?.querySelector("[data-winnings]");
        if (slot) mountWinnings(slot, { source: "battle", id: battle.id, ctx });
      }
    } else {
      renderRoundHeader();
    }
  }

  /* The slim sticky round header: product, set, "Round 3 of 12", one track
     segment per round and the countdown to the next reveal. */
  function renderRoundHeader() {
    const b = battle;
    const index = Math.max(0, view === "intro" ? 0 : shownRound);
    const key = `${view}:${index}:${shownRound}`;
    if (key === html.get("head-key") && region("head").querySelector(".tb-round")) return paintCountdown();
    html.set("head-key", key);
    headRound = index;
    const plan = planAt(index);
    const n = Number(b.roundCount || b.plan.length || 1);
    const started = view === "replay" || (shownRound >= 0 && view !== "intro");
    const now = ctx.clock.now();
    const segs = Array.from({ length: n }, (_, i) => {
      if (!started || i > index) return "<i></i>";
      if (i < index) return `<i class="is-done"></i>`;
      const span = view === "replay" ? b.roundMs : Math.max(1, revealAt(i + 1) - revealAt(i));
      const elapsed = view === "replay" ? 0 : Math.max(0, Math.min(span, now - revealAt(i)));
      return `<i class="is-now"><b style="--d:${Math.round(span)}ms;--delay:-${Math.round(elapsed)}ms"></b></i>`;
    }).join("");
    const art = plan.image || wrapperArt(plan.setId);
    setHTML("head", `<div class="tb-round${n > 40 ? " is-dense" : ""}" role="group" aria-label="Round ${index + 1} of ${n}">
      <h1 class="tb-sr">Pack battle, round ${index + 1} of ${n}</h1>
      <div class="tb-round-main">
        <span class="tb-round-art">${art ? `<img src="${esc(art)}" alt="" decoding="async" />` : ""}</span>
        <span class="tb-round-copy"><b>${esc(plan.productName || "Booster pack")}</b><span>${esc(plan.setName || "")}</span></span>
        <span class="tb-round-count"><b>Round ${index + 1} <span>of ${n}</span></b><span class="tb-next" aria-live="off"></span></span>
      </div>
      <div class="tb-track" aria-hidden="true">${segs}</div>
    </div>`);
    paintCountdown();
    tintTable();
  }

  function paintCountdown() {
    const el = host.querySelector(".tb-next");
    if (!el || !battle) return;
    if (view === "replay") { el.textContent = "Replay"; return; }
    if (view === "intro") { el.textContent = "Starting"; return; }
    if (battle.status === "finished" || finishing) { el.textContent = "Final pack"; return; }
    const nextIndex = shownRound + 1;
    if (nextIndex >= battle.roundCount) { el.textContent = "Final pack"; return; }
    const left = Math.max(0, revealAt(nextIndex) - ctx.clock.now());
    el.textContent = left > 400 ? `Next in ${Math.ceil(left / 1000)}s` : "Opening";
  }

  function renderPot() {
    if (!(view === "lobby" || view === "cancelled")) return setHTML("pot", "");
    const b = battle;
    const items = b.lineup || [];
    const shown = items.slice(0, 6);
    const art = shown.map((p, i) => {
      const src = p.image || wrapperArt(p.setId);
      return `<span class="tb-pot-item" style="--r:${((i - (shown.length - 1) / 2) * 5).toFixed(1)}deg" title="${esc(`${p.quantity} x ${p.name}`)}">
        ${src ? `<img src="${esc(src)}" data-full="${esc(wrapperArt(p.setId))}" alt="${esc(p.name)}" decoding="async" />` : ""}
        ${p.quantity > 1 ? `<span class="tb-qty">×${p.quantity}</span>` : ""}</span>`;
    }).join("");
    const more = items.length > shown.length ? `<span class="tb-pot-more">+${items.length - shown.length}</span>` : "";
    const names = items.map((p) => `${p.name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}`).join(", ");
    setHTML("pot", `<div class="tb-pot-art">${art}${more}</div>
      <div class="tb-pot-copy">
        <span class="tb-pot-label">The pot</span>
        <b>${esc(names)}</b>
        <span>${plural(Number(b.roundCount || 0), "round")}, entry ${coinTag(b.entryCost)} each</span>
      </div>`);
  }

  /* ---- Lanes ------------------------------------------------------------ */
  function renderLanes() {
    const b = battle;
    const s = settings();
    const kind = view === "cancelled" ? "none" : view === "lobby" ? "lobby" : "arena";
    const key = JSON.stringify([kind, s.players, s.teams, b.seats.map((x) => [x.seat, x.userId, x.name, x.bot, x.avatar, x.handle]),
      kind === "lobby" ? [uid(), isHost(), Boolean(mySeat()), ctx.coins?.() >= b.entryCost] : 0]);
    if (key === laneKey) return;
    laneKey = key;
    const lanesEl = region("lanes");
    lanesEl.removeAttribute("aria-busy");
    if (kind === "none") { lanesEl.innerHTML = ""; html.set("lanes", ""); return; }
    const n = players();
    const lane = (i) => laneHTML(i, kind);
    const vs = `<span class="tb-vs" aria-hidden="true">vs</span>`;
    let inner;
    if (s.teams && n === 4) {
      const team = (t) => `<div class="tb-team" data-team="${t}"><div class="tb-team-head"><span class="tb-crown" aria-hidden="true">${icon("crown")}</span><b>Team ${t + 1}</b><span class="tb-team-score"></span></div><div class="tb-team-lanes">${lane(t * 2)}${lane(t * 2 + 1)}</div></div>`;
      inner = `<div class="tb-lanes-grid teams">${team(0)}${vs}${team(1)}</div>`;
    } else if (n === 2) {
      inner = `<div class="tb-lanes-grid p2">${lane(0)}${vs}${lane(1)}</div>`;
    } else {
      inner = `<div class="tb-lanes-grid p${n}">${Array.from({ length: n }, (_, i) => lane(i)).join("")}</div>`;
    }
    lanesEl.innerHTML = inner;
    html.set("lanes", inner);
    lanesEl.querySelectorAll(".tb-stage-slot").forEach((slot) => {
      const i = Number(slot.dataset.seat);
      slot.replaceWith(stageFor(i));
    });
    // Seats that emptied lose their stage.
    for (const [i, el] of stages) if (!seatAt(i) && !el.isConnected) { stages.delete(i); stageState.delete(i); stageCards.delete(i); }
  }

  function stageFor(i) {
    let el = stages.get(i);
    if (!el) {
      el = document.createElement("div");
      el.className = "tb-stage";
      el.dataset.seat = String(i);
      stages.set(i, el);
    }
    return el;
  }

  function laneHTML(i, kind) {
    const b = battle;
    const seat = seatAt(i);
    if (!seat) {
      if (kind !== "lobby") return `<section class="tb-lane is-open" data-seat="${i}"></section>`;
      const signed = Boolean(ctx.user?.());
      const canJoin = !mySeat();
      const afford = !signed || (ctx.coins?.() ?? Infinity) >= b.entryCost;
      const buttons = isHost()
        ? `<button class="ghost tb-seat-btn" data-act="bot" data-seat="${i}">${icon("bot")}<span>Call a bot</span><small>Free</small></button>
           <button class="tb-link-btn" data-act="invite">${icon("link")}<span>Invite link</span></button>`
        : canJoin
          ? `<button class="ghost tb-seat-btn" data-act="join" data-seat="${i}" ${afford ? "" : "disabled"}><span>${signed ? "Take this seat" : "Sign in to sit"}</span>${signed ? coinTag(b.entryCost, "tb-seat-cost") : ""}</button>`
          : "";
      return `<section class="tb-lane is-open" data-seat="${i}" aria-label="Open seat ${i + 1}">
        <header class="tb-lane-head">${seatAvatar(null)}<span class="tb-lane-id"><b class="tb-lane-name">Open seat</b><span class="tb-lane-sub">Seat ${i + 1}</span></span></header>
        <div class="tb-seat-open"><p>Waiting for a player</p>${buttons}</div>
      </section>`;
    }
    const me = isMe(seat);
    const hostSeat = !seat.bot && String(seat.userId) === String(b.hostId);
    const role = seat.bot ? "Bot" : hostSeat ? "Host" : "Ready";
    const unbot = kind === "lobby" && isHost() && seat.bot
      ? `<button class="tb-unbot" data-act="unbot" data-seat="${i}" aria-label="Remove ${esc(seat.name)}" title="Remove bot">${icon("close")}</button>` : "";
    return `<section class="tb-lane${me ? " is-me" : ""}${seat.bot ? " is-bot" : ""}" data-seat="${i}" aria-label="${esc(seat.name)}${me ? " (you)" : ""}">
      <header class="tb-lane-head">
        <span class="tb-lane-avatar">${seatAvatar(seat)}<span class="tb-crown" aria-hidden="true">${icon("crown")}</span></span>
        <span class="tb-lane-id">
          <b class="tb-lane-name"><span>${esc(seat.name || "Trainer")}</span>${me ? `<small>You</small>` : ""}</b>
          ${kind === "lobby"
            ? `<span class="tb-lane-sub">${role}${seat.bot && hostSeat ? "" : ""}</span>`
            : `<span class="tb-score bt-coins" data-score="${i}"><span aria-hidden="true">✦</span> <span class="tb-score-n">0.00</span></span>`}
        </span>
        ${unbot}
      </header>
      <div class="tb-stage-frame"><div class="tb-stage-slot" data-seat="${i}"></div><span class="tb-ring" aria-hidden="true"></span></div>
    </section>`;
  }

  /** Scores, leader, winners: patched in place, never rebuilt mid-reveal. */
  function paintHeads() {
    if (!battle || !["intro", "live", "result", "replay"].includes(view)) return;
    const s = settings();
    const n = players();
    const result = view === "result";
    const win = new Set(result ? winners() : []);
    // Leader: highest (lowest on crazy); nobody while everything is level.
    const groups = s.teams && n === 4 ? [[0, 1], [2, 3]] : Array.from({ length: n }, (_, i) => [i]);
    const sums = groups.map((g) => g.reduce((t, i) => t + cents(disp[i]), 0));
    const target = s.mode === "crazy" ? Math.min(...sums) : Math.max(...sums);
    const level = sums.every((v) => v === sums[0]);
    const leaders = new Set(!result && s.mode !== "shared" && !level && shownRound >= 0
      ? groups.flatMap((g, k) => (sums[k] === target ? g : [])) : []);
    host.querySelectorAll(".tb-lane[data-seat]").forEach((lane) => {
      const i = Number(lane.dataset.seat);
      lane.classList.toggle("is-leader", leaders.has(i));
      lane.classList.toggle("is-winner", result && win.has(i));
      lane.classList.toggle("is-loser", result && s.mode !== "shared" && win.size > 0 && !win.has(i));
      const score = lane.querySelector(".tb-score-n");
      if (score) score.textContent = coins(disp[i] || 0);
    });
    host.querySelectorAll(".tb-team").forEach((team) => {
      const t = Number(team.dataset.team);
      const el = team.querySelector(".tb-team-score");
      if (el) el.innerHTML = view === "intro" ? "" : coinTag(sums[t] / 100);
      team.classList.toggle("is-leader", leaders.has(t * 2));
      team.classList.toggle("is-winner", result && win.has(t * 2));
      team.classList.toggle("is-loser", result && s.mode !== "shared" && win.size > 0 && !win.has(t * 2));
    });
  }

  /* Score count-ups: one rAF loop, text only. */
  function setScore(i, value, ms = 420) {
    const to = Number(value || 0);
    const from = Number(disp[i] || 0);
    if (!motion() || ms <= 0 || Math.abs(to - from) < 0.005) {
      tweens.delete(i); disp[i] = to; paintHeads(); return;
    }
    tweens.set(i, { from, to, start: performance.now(), ms });
    if (!rafId) rafId = requestAnimationFrame(stepTweens);
  }
  function stepTweens(t) {
    rafId = 0;
    if (!visible) return;
    for (const [i, tw] of tweens) {
      // A frame's timestamp can be a little older than the tween's start:
      // clamp, or the ease runs backwards and a score dips below zero.
      const f = Math.max(0, Math.min(1, (t - tw.start) / tw.ms));
      disp[i] = tw.from + (tw.to - tw.from) * (1 - Math.pow(1 - f, 3));
      if (f >= 1) { disp[i] = tw.to; tweens.delete(i); }
    }
    paintHeads();
    if (tweens.size) rafId = requestAnimationFrame(stepTweens);
  }
  const roundScore = (r, i) => Number(battle.rounds[r]?.scores?.[i] || 0);
  function settleScores(r, ms = 420) {
    for (let i = 0; i < players(); i++) setScore(i, r < 0 ? 0 : roundScore(r, i), ms);
  }

  /* ---- Stages: hand-off to the reveal engine ---------------------------- */
  function laneEls() {
    return Array.from({ length: players() }, (_, i) => (seatAt(i) ? { seat: i, el: stages.get(i) } : null))
      .filter((l) => l && l.el?.isConnected);
  }

  function ensurePacks(roundIndex) {
    if (!battle || !battle.plan.length) return;
    const plan = planAt(roundIndex);
    const lanes = laneEls().filter((l) => stageState.get(l.seat) !== `packs:${roundIndex}`)
      .map((l) => ({ ...l, setId: plan.setId, wrapper: plan.image || wrapperArt(plan.setId), image: plan.image, kind: plan.kind || "pack" }));
    if (!lanes.length) return;
    for (const l of lanes) { stageState.set(l.seat, `packs:${roundIndex}`); stageCards.delete(l.seat); }
    R("showPacks", { lanes, fast: Boolean(settings().fast) });
    warmSets();
  }

  let warmed = false;
  function warmSets() {
    // Load each lineup set's catalog before its first reveal, so resolving a
    // round's cards doesn't eat into the reveal window.
    if (warmed || !battle?.plan?.length) return;
    warmed = true;
    const sets = [...new Set(battle.plan.map((p) => p.setId).filter(Boolean))];
    ctx.resolveCards?.(sets.map((setId) => ({ id: `${setId}-1` }))).catch?.(() => {});
  }

  async function laneData(roundIndex, cardsFor) {
    const plan = planAt(roundIndex);
    const lanes = laneEls();
    const resolved = await Promise.all(lanes.map((l) => resolveSoon(cardsFor(l.seat))));
    return lanes.map((l, k) => ({
      seat: l.seat, el: l.el, cards: resolved[k] || [],
      value: (resolved[k] || []).reduce((t, c) => t + Number(c.value || 0), 0),
      setId: plan.setId, wrapper: plan.image || wrapperArt(plan.setId), image: plan.image, kind: plan.kind || "pack",
    }));
  }
  const pullCards = (r) => (seat) => battle.rounds[r]?.pulls?.find((p) => p.seat === seat)?.cards || [];

  async function showRoundAt(r) {
    const token = ++stageToken;
    const g = gen;
    shownRound = r; stale = false;
    renderHead();
    const lanes = await laneData(r, pullCards(r));
    if (!alive(g) || token !== stageToken) return;
    for (const l of lanes) { stageCards.set(l.seat, l.cards); stageState.set(l.seat, `round:${r}`); }
    R("showRound", { lanes, skipCommons: Boolean(settings().skipCommons) });
    settleScores(r, 0);
  }

  async function playRoundAt(r, duration, { replay = false } = {}) {
    const token = ++stageToken;
    const g = gen;
    const began = performance.now();
    shownRound = r; stale = false;
    renderHead();
    const lanes = await laneData(r, pullCards(r));
    if (!alive(g) || token !== stageToken) return;
    const left = Math.max(600, duration - (performance.now() - began));
    for (const l of lanes) { stageCards.set(l.seat, l.cards); stageState.set(l.seat, `round:${r}`); }
    const scoring = settings().scoring;
    const base = (i) => (r > 0 ? roundScore(r - 1, i) : 0);
    const run = R("playRound", {
      lanes, duration: left, fast: Boolean(settings().fast), skipCommons: Boolean(settings().skipCommons),
      onTick(seat, running) {
        if (!alive(g) || token !== stageToken) return;
        const v = Number(running || 0);
        if (scoring === "total") setScore(seat, base(seat) + v, 360);
        else if (scoring === "last") setScore(seat, v, 360);
      },
      onHit(seat, card, tier) {
        if (!alive(g) || token !== stageToken) return;
        laneHit(seat, tier ?? hitTier(card));
      },
    });
    // Never let a missing or stopped engine stall the table.
    await Promise.race([Promise.resolve(run).catch(() => {}), wait(left + 1500)]);
    if (!alive(g) || token !== stageToken) return;
    settleScores(r, replay ? 300 : 420);
  }

  function laneHit(seat, tier) {
    const lane = host.querySelector(`.tb-lane[data-seat="${seat}"]`);
    if (!lane || tier < 2) return;
    lane.classList.remove("is-hit", "is-chase");
    void lane.offsetWidth;
    lane.classList.add(tier >= 3 ? "is-chase" : "is-hit");
    const t = setTimeout(() => { timers.delete(t); lane.classList.remove("is-hit", "is-chase"); }, 1400);
    timers.add(t);
    if (isMe(seatAt(seat))) ctx.buzz?.(tier >= 3 ? [18, 40, 28] : 14);
  }

  /** Bring the stages up to the server: play the newest round if we're on
      time, otherwise jump straight to it (reload, hidden tab, slow poll). */
  function syncRounds() {
    if (!battle || view !== "live" || playing || finishing) return;
    const target = battle.rounds.length - 1;
    if (target < 0) { ensurePacks(0); return; }
    if (target === shownRound && !stale) return;
    const left = revealAt(target + 1) - ctx.clock.now();
    const onTime = !stale && target === shownRound + 1;
    const g = gen;
    const job = onTime && motion() && left > Math.min(1400, battle.roundMs * 0.5) && !document.hidden
      ? playRoundAt(target, left - 120)
      : showRoundAt(target);
    const mine = job.finally(() => {
      // A job the page gave up on (hidden tab) must not clear a newer one.
      if (!alive(g) || playing !== mine) return;
      playing = null;
      if (battle.status === "finished" && !finishing && view === "live") runFinish();
      else syncRounds();
    });
    playing = mine;
  }

  /* ---- Intro: 3-2-1 over the table --------------------------------------- */
  function paintIntro() {
    const el = region("intro");
    if (!el) return;
    if (view !== "intro" || !battle) {
      if (introDigit) { introDigit = ""; el.innerHTML = ""; }
      el.classList.remove("is-on");
      host.classList.remove("is-counting");
      return;
    }
    const left = battle.startsAt - ctx.clock.now();
    const digit = left > 0 ? String(Math.min(3, Math.ceil(left / 1000))) : "";
    el.classList.toggle("is-on", Boolean(digit));
    host.classList.toggle("is-counting", Boolean(digit));
    if (digit) placeIntro(el);
    if (digit === introDigit) return;
    introDigit = digit;
    el.innerHTML = digit ? `<span class="tb-intro-n${motion() ? " is-anim" : ""}" aria-label="Starting in ${digit}">${digit}</span>` : "";
  }

  /* The numeral sits in the middle of the part of the table on screen, not
     the middle of a 2x2 table that runs under the tab bar. */
  function placeIntro(el) {
    const table = region("table")?.getBoundingClientRect();
    if (!table) return;
    const head = host.querySelector(".tb-head.is-float .tb-round")?.getBoundingClientRect();
    const top = Math.max(table.top, head ? head.bottom : Math.max(0, document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0));
    const bar = document.querySelector(".tabbar");
    const barTop = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : innerHeight;
    const bottom = Math.min(table.bottom, barTop, innerHeight);
    const y = bottom > top ? (top + bottom) / 2 - table.top : table.height / 2;
    el.style.setProperty("--intro-y", `${Math.round(Math.max(60, Math.min(table.height - 60, y)))}px`);
  }

  /* 3 and 4 player tables are taller than a phone: once the battle starts,
     bring the whole table on screen (under the floating round header). */
  let broughtUp = "";
  function bringTableUp() {
    if (!battle || broughtUp === battle.id || !matchMedia("(max-width: 720px)").matches) return;
    const table = region("table");
    if (!table) return;
    broughtUp = battle.id;
    const r = table.getBoundingClientRect();
    const bar = document.querySelector(".tabbar");
    const barTop = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : innerHeight;
    if (r.bottom <= barTop - 4 && r.top >= 0) return;
    // The round header floats at the top once the page scrolls (about its own height plus padding).
    const headH = (region("head")?.querySelector(".tb-round")?.offsetHeight || 55) + 18;
    const y = scrollY + r.top - headH - 6;
    if (Math.abs(y - scrollY) > 24) window.scrollTo({ top: Math.max(0, y), behavior: motion() ? "smooth" : "auto" });
  }

  function ensureTicker() {
    const want = ["intro", "live", "replay"].includes(view) && visible && !document.hidden;
    if (want && !tickTimer) tickTimer = setInterval(tick, 200);
    if (!want && tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }
  function tick() {
    if (!visible || !battle) return;
    if (view === "intro") {
      paintIntro();
      if (ctx.clock.now() >= battle.startsAt) {
        setView("live");
        paintIntro();
        syncRounds();
        schedulePoll();
      }
      return;
    }
    paintCountdown();
  }

  /* ---- Finish and result ----------------------------------------------- */
  async function runFinish() {
    if (finishing) return;
    finishing = true;
    const g = gen;
    if (view === "intro" || view === "lobby") { view = "live"; render(); }
    ensureTicker();
    if (playing) await playing;
    if (!alive(g)) return;
    finishing = true;
    const last = battle.rounds.length - 1;
    if (last >= 0 && (shownRound < last || stale)) {
      const onTime = shownRound === last - 1 && !stale;
      if (onTime && motion() && !document.hidden) await playRoundAt(last, Math.min(battle.roundMs, Math.max(1600, revealAt(last + 1) - ctx.clock.now())));
      else await showRoundAt(last);
      if (!alive(g)) return;
    }
    await wait(motion() ? 450 : 0);
    if (!alive(g)) return;
    await enterResult({ finale: true });
    finishing = false;
  }

  async function enterResult({ finale }) {
    const g = gen;
    const direct = !finale;
    const prev = view;
    view = "result";
    host.dataset.view = "result";
    ensureTicker();
    const final = battle.result?.scores || battle.rounds.at(-1)?.scores || [];
    for (let i = 0; i < players(); i++) setScore(i, final[i] || 0, direct ? 0 : 500);
    renderLanes();
    // Straight to a finished table (a link, a reload): every lane shows its
    // best pulls of the whole battle, the winners already lifted.
    if (direct || prev === "loading") await showHaul();
    if (!alive(g)) return;
    if (finale && motion() && !finaleDone && settings().mode !== "shared") {
      finaleDone = true;
      // Hold the pre-result header while the lanes lift and the cards fly.
      html.set("head-key", "");
      paintHeads();
      await wait(650);
      if (!alive(g)) return;
      const win = new Set(winners());
      const lanes = laneEls();
      const w = lanes.filter((l) => win.has(l.seat)).map((l) => l.el);
      const lose = lanes.filter((l) => !win.has(l.seat)).map((l) => l.el);
      if (w.length && lose.length) {
        await Promise.race([Promise.resolve(R("playFinale", { winners: w, losers: lose })).catch(() => {}), wait(6000)]);
        if (!alive(g)) return;
        leaveGhosts(lanes.filter((l) => !win.has(l.seat)).map((l) => l.seat));
      }
    }
    finaleDone = true;
    // The result heading is taller than the round header: slide the table
    // down to its new place instead of letting it jump under the reader.
    const tableEl = region("table");
    const before = tableEl?.getBoundingClientRect().top;
    render();
    const shift = before - (tableEl?.getBoundingClientRect().top ?? before);
    if (!direct && motion() && Math.abs(shift) > 4 && tableEl?.animate) {
      tableEl.animate([{ transform: `translateY(${Math.round(shift)}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
    host.classList.toggle("is-entering", !direct && motion());
    if (!direct && motion()) {
      const t = setTimeout(() => { timers.delete(t); host.classList.remove("is-entering"); }, 1200);
      timers.add(t);
    }
    fillBestPulls();
    const me = mySeat();
    if (me && !refreshed.has(battle.id) && (sawLive || ctx.clock.now() - Number(battle.endsAt || 0) < 10 * 60000)) {
      refreshed.add(battle.id);
      Promise.resolve(ctx.refreshSave?.()).catch(() => {});
    }
  }

  /* After the finale a losing stage is empty: keep a ghost of its best pull
     and say where the cards went, so the result reads as a result. */
  function leaveGhosts(seats) {
    const w = winners();
    const s = settings();
    const to = s.teams && players() === 4 && new Set(w.map(teamOf)).size === 1
      ? `Team ${teamOf(w[0]) + 1}`
      : w.length === 1 ? (isMe(seatAt(w[0])) ? "you" : seatAt(w[0])?.name || "the winner") : "the winners";
    const all = allPulls();
    for (const seat of seats) {
      const frame = host.querySelector(`.tb-lane[data-seat="${seat}"] .tb-stage-frame`);
      if (!frame || frame.querySelector(".tb-gone")) continue;
      const mine = all.filter((p) => p.seat === seat);
      const best = mine.reduce((b, p) => (!b || cents(p.card.value) > cents(b.card.value) ? p : b), null);
      const who = isMe(seatAt(seat)) ? "Your" : "";
      const el = document.createElement("div");
      el.className = `tb-gone${motion() ? " is-anim" : ""}`;
      el.innerHTML = `${best ? `<img src="${esc(smallImage(best.card))}" data-full="${esc(best.card.image || "")}" alt="" decoding="async" />` : ""}
        <p>${who ? `${who} ${plural(mine.length, "card").replace(/^1 card$/, "card")}` : plural(mine.length, "card")} went to ${esc(to)}</p>`;
      frame.appendChild(el);
    }
  }
  const clearGhosts = () => host.querySelectorAll(".tb-gone").forEach((el) => el.remove());

  async function showHaul() {
    clearGhosts();
    const token = ++stageToken;
    const g = gen;
    const all = allPulls();
    const lanes = await laneData(Math.max(0, battle.rounds.length - 1), (seat) =>
      all.filter((p) => p.seat === seat).map((p) => p.card)
        .sort((a, b) => cents(b.value) - cents(a.value)).slice(0, 5).reverse());
    if (!alive(g) || token !== stageToken) return;
    shownRound = battle.rounds.length - 1; stale = false;
    for (const l of lanes) { stageCards.set(l.seat, l.cards); stageState.set(l.seat, "haul"); }
    R("showRound", { lanes, skipCommons: false });
  }

  function allPulls() {
    const out = [];
    battle.rounds.forEach((r, ri) => r.pulls.forEach((p) => p.cards.forEach((card, k) => out.push({ card, seat: p.seat, round: ri, k }))));
    return out;
  }

  function headline() {
    const s = settings();
    const w = winners();
    if (s.mode === "shared") return "Everyone splits the pot";
    if (s.teams && players() === 4) {
      const teams = new Set(w.map(teamOf));
      if (teams.size === 1) {
        const t = [...teams][0];
        const me = mySeat();
        return me && teamOf(me.seat) === t ? "Your team takes the pot" : `Team ${t + 1} takes the pot`;
      }
      return "A tie, the pot is split";
    }
    if (w.length === 1) {
      const seat = seatAt(w[0]);
      return isMe(seat) ? "You win the pot" : `${seat?.name || "A player"} takes the pot`;
    }
    return "A tie, the pot is split";
  }

  function potLines() {
    const allocations = battle.result?.allocations || [];
    return allocations.map((a) => {
      const seat = seatAt(a.seat);
      const worth = `${plural(a.cardCount, "card")} worth ${coinTag(a.value)}`;
      if (isMe(seat)) return `<p class="is-me">${worth} added to your collection</p>`;
      if (seat?.bot) return `<p>${esc(seat.name)}'s ${worth} go back to the shop</p>`;
      return `<p>${worth} go to ${esc(seat?.name || "the winner")}</p>`;
    }).join("");
  }

  /** True when this viewer was allocated cards, so the shared "sell all winnings" has something to offer. */
  const wonCards = () => (battle.result?.allocations || []).some((a) => Number(a.cardCount) > 0 && isMe(seatAt(a.seat)));

  function resultHead() {
    const b = battle;
    const total = (b.result?.allocations || []).reduce((t, a) => t + Number(a.value || 0), 0)
      || b.rounds.reduce((t, r) => t + r.pulls.reduce((u, p) => u + Number(p.value || 0), 0), 0);
    const count = (b.result?.allocations || []).reduce((t, a) => t + Number(a.cardCount || 0), 0) || allPulls().length;
    return `<div class="tb-result">
      <p class="tb-eyebrow">${MODE_NAME[b.settings?.mode] || "Standard"} battle, ${plural(Number(b.roundCount || b.rounds.length), "round")}, ${plural(count, "card")} worth ${coinTag(total)}</p>
      <h1 class="page-title">${esc(headline())}</h1>
      <div class="tb-pot-lines">${potLines()}</div>
      <div class="tb-row tb-result-actions">
        <button class="solid" data-act="rematch">${icon("refresh")}Rematch</button>
        <button class="ghost" data-act="replay">${icon("play")}Watch again</button>
        <a class="tb-text-link" href="/battles" data-nav="/battles">All battles</a>
      </div>
      ${wonCards() ? winningsSlot("battle", b.id) : ""}
    </div>`;
  }

  /* ---- Below the table ------------------------------------------------- */
  function renderBelow() {
    const b = battle;
    if (view === "lobby") {
      const me = mySeat();
      const open = players() - b.seats.length;
      const signed = Boolean(ctx.user?.());
      let dock = "";
      let links = "";
      if (isHost()) {
        dock = `<button class="solid" data-act="start" ${open > 0 ? "disabled" : ""}>${icon("play")}Start battle</button>
          ${open > 0 ? `<button class="ghost" data-act="fill">${icon("bot")}Fill with bots</button>` : ""}`;
        links = `<button class="tb-text-link" data-act="cancel">Cancel table</button>`;
      } else if (me) {
        dock = `<button class="ghost" data-act="leave">Leave <span class="tb-refund">refund ${coinTag(b.entryCost)}</span></button>`;
      } else if (open > 0) {
        const afford = !signed || (ctx.coins?.() ?? Infinity) >= b.entryCost;
        dock = `<button class="solid" data-act="join" ${afford ? "" : "disabled"}>${signed ? `Join for <span class="tb-on-rip">✦ ${coins(b.entryCost)}</span>` : "Sign in to join"}</button>`;
        if (!afford) links = `<span class="tb-quiet">You need ${coinTag(b.entryCost - (ctx.coins?.() || 0))} more to join.</span>`;
      }
      const note = isHost() && open > 0 ? `<p class="tb-quiet">Bots are free. Their winnings go back to the shop.</p>` : "";
      setHTML("below", `${dock ? `<div class="tb-dock-slot"><div class="tb-dock">${dock}</div></div>` : ""}${note}${links ? `<div class="tb-links">${links}</div>` : ""}`);
      return;
    }
    if (view === "cancelled") {
      setHTML("below", `<div class="tb-row"><button class="solid" data-act="use-lineup">Use this lineup</button><a class="ghost" href="/battles" data-nav="/battles">All battles</a></div>`);
      return;
    }
    if (view === "intro" || view === "live") {
      setHTML("below", `<p class="tb-quiet">Every reveal follows the server clock, so you can leave and come back without missing a card.</p>`);
      return;
    }
    if (view === "replay") {
      setHTML("below", `<div class="tb-row"><button class="ghost" data-act="stop-replay">${icon("skip")}Skip to the result</button></div>`);
      return;
    }
    if (view === "result") {
      setHTML("below", `${standingsHTML()}
        <section class="tb-section" aria-labelledby="tb-best-h"><h2 id="tb-best-h">Best pulls</h2><div class="tb-best" data-region="best">${bestSkeleton()}</div></section>
        ${receiptHTML()}`);
    }
  }

  function standingsHTML() {
    const s = settings();
    const final = battle.result?.scores || battle.rounds.at(-1)?.scores || [];
    const win = new Set(winners());
    const alloc = new Map((battle.result?.allocations || []).map((a) => [a.seat, a]));
    const dir = s.mode === "crazy" ? 1 : -1;
    const row = (seat, rank) => {
      const a = alloc.get(seat.seat);
      const note = s.mode === "shared" ? (a ? `${plural(a.cardCount, "card")}` : "") : win.has(seat.seat) ? "Takes the pot" : "";
      return `<li class="${win.has(seat.seat) ? "is-win" : ""}${isMe(seat) ? " is-me" : ""}">
        <span class="tb-rank">${rank}</span>${seatAvatar(seat)}
        <span class="tb-st-name"><b><span>${esc(seat.name)}</span>${isMe(seat) ? "<small>You</small>" : seat.bot ? "<small>Bot</small>" : ""}</b>${note ? `<span>${note}</span>` : ""}</span>
        ${coinTag(final[seat.seat] || 0)}</li>`;
    };
    const ranked = (list) => {
      const sorted = [...list].sort((a, b) => dir * (cents(final[a.seat]) - cents(final[b.seat])) || a.seat - b.seat);
      let rank = 0, prev = null;
      return sorted.map((seat, k) => {
        const v = cents(final[seat.seat]);
        if (v !== prev) { rank = k + 1; prev = v; }
        return row(seat, rank);
      }).join("");
    };
    let body;
    if (s.teams && players() === 4) {
      const teams = [0, 1].map((t) => ({ t, seats: battle.seats.filter((x) => teamOf(x.seat) === t) }));
      const total = (tm) => tm.seats.reduce((n, x) => n + cents(final[x.seat]), 0);
      teams.sort((a, b) => dir * (total(a) - total(b)) || a.t - b.t);
      body = teams.map((tm) => `<li class="tb-st-team${win.has(tm.seats[0]?.seat) ? " is-win" : ""}"><b>Team ${tm.t + 1}</b>${coinTag(total(tm) / 100)}</li>${ranked(tm.seats)}`).join("");
    } else body = ranked(battle.seats);
    return `<section class="tb-section" aria-labelledby="tb-st-h"><h2 id="tb-st-h">Final standings</h2><ol class="tb-standings">${body}</ol></section>`;
  }

  function bestSkeleton() {
    return Array.from({ length: Math.min(6, allPulls().length) }, () => `<div class="tb-best-card is-wait"><div class="tb-best-ph"></div></div>`).join("");
  }

  async function fillBestPulls() {
    const g = gen;
    const top = allPulls().sort((a, b) => cents(b.card.value) - cents(a.card.value) || a.round - b.round).slice(0, 6);
    const resolved = await resolveSoon(top.map((t) => t.card));
    if (!alive(g) || view !== "result") return;
    bestCards = top.map((t, k) => ({ ...t, card: resolved[k] || t.card }));
    const el = host.querySelector('[data-region="best"]');
    if (!el) return;
    el.innerHTML = bestCards.map((t, k) => {
      const seat = seatAt(t.seat);
      const face = ctx.cardFace ? ctx.cardFace(t.card, { small: true }) : `<img src="${esc(smallImage(t.card))}" alt="${esc(t.card.name)}" />`;
      return `<figure class="tb-best-card" style="--k:${k}">
        <button class="tb-best-face" data-inspect-best="${k}" aria-label="Inspect ${esc(t.card.name)}">${face}</button>
        <figcaption><b>${esc(t.card.name)}</b><span>${esc(seat?.name || "")}</span><span class="tb-best-val">${coinTag(t.card.value)} <small>round ${t.round + 1}</small></span></figcaption>
      </figure>`;
    }).join("");
  }

  function receiptHTML() {
    const rounds = battle.rounds;
    if (!rounds.length) return "";
    return `<section class="tb-section" aria-labelledby="tb-rc-h"><h2 id="tb-rc-h">Every pull</h2>
      <div class="tb-receipts">${rounds.map((r, i) => {
        const plan = planAt(i);
        const total = r.pulls.reduce((t, p) => t + Number(p.value || 0), 0);
        const art = plan.image || wrapperArt(plan.setId);
        return `<details class="tb-receipt" data-round="${i}">
          <summary><span class="tb-rc-art">${art ? `<img src="${esc(art)}" alt="" loading="lazy" decoding="async" />` : ""}</span>
            <span class="tb-rc-title"><b>Round ${i + 1}</b><span>${esc(plan.productName || "")}</span></span>${coinTag(total)}</summary>
          <div class="tb-rc-body"></div>
        </details>`;
      }).join("")}</div></section>`;
  }

  function fillReceipt(details) {
    const body = details.querySelector(".tb-rc-body");
    if (!body || body.childElementCount) return;
    const r = Number(details.dataset.round);
    const round = battle.rounds[r];
    if (!round) return;
    const order = [...round.pulls].sort((a, b) => a.seat - b.seat);
    body.innerHTML = order.map((p) => {
      const seat = seatAt(p.seat);
      const cards = p.cards.map((c, k) => `<button class="tb-thumb" data-card="${r}:${p.seat}:${k}" aria-label="${esc(`${c.name}, ${coins(c.value)}`)}">
          <img src="${esc(smallImage(c))}" data-full="${esc(c.image || "")}" alt="" loading="lazy" decoding="async" />
          <span>${coins(c.value)}</span></button>`).join("");
      return `<div class="tb-rc-seat"><div class="tb-rc-who">${seatAvatar(seat)}<b>${esc(seat?.name || "Player")}</b>${coinTag(p.value)}</div><div class="tb-rc-cards">${cards}</div></div>`;
    }).join("");
  }

  /* ---- Replay ("Watch again") ------------------------------------------ */
  async function replay() {
    if (!battle?.rounds?.length) return;
    const token = ++replayToken;
    const g = gen;
    R("stop");
    stageToken++;
    view = "replay";
    host.dataset.view = "replay";
    html.set("head-key", "");
    stageState.clear();
    shownRound = -1;
    disp = []; tweens.clear();
    laneKey = "";
    render();
    ensureTicker();
    host.querySelector(".tb-table")?.scrollIntoView?.({ behavior: motion() ? "smooth" : "auto", block: "center" });
    ensurePacks(0);
    await wait(motion() ? 900 : 0);
    const ms = battle.roundMs || 6000;
    for (let r = 0; r < battle.rounds.length; r++) {
      if (!alive(g) || token !== replayToken) return;
      if (motion()) await playRoundAt(r, ms, { replay: true });
      else { await showRoundAt(r); await wait(250); }
    }
    if (!alive(g) || token !== replayToken) return;
    await wait(motion() ? 450 : 0);
    if (!alive(g) || token !== replayToken) return;
    finaleDone = false;
    await enterResult({ finale: true });
  }

  function stopReplay() {
    replayToken++;
    R("stop");
    stageToken++;
    finaleDone = true;
    view = "loading";      // so enterResult treats this as a direct arrival
    enterResult({ finale: false });
  }

  /* ---- Actions ---------------------------------------------------------- */
  async function copyInvite(button) {
    const url = inviteUrl();
    try {
      await navigator.clipboard.writeText(url);
      ctx.toast?.("Invite link copied");
      if (button) {
        const label = button.querySelector("span");
        if (label) { label.textContent = "Link copied"; const t = setTimeout(() => { timers.delete(t); label.textContent = "Invite link"; }, 1800); timers.add(t); }
      }
    } catch {
      inviteOpen = true;
      renderTop();
      const input = host.querySelector(".tb-invite-field input");
      input?.focus();
      input?.select();
    }
  }

  async function fillBots() {
    if (busy || !battle) return;
    const g = gen;
    busy = true; syncBusy();
    clearTimeout(pollTimer);
    const seq = ++reqSeq;
    try {
      const data = await api(`/api/battles/${encodeURIComponent(battle.id)}/bot`, { method: "POST", body: JSON.stringify({ fill: true }) });
      if (!alive(g)) return;
      acceptedSeq = Math.max(acceptedSeq, seq);
      ctx.clock?.sync?.(data.serverNow);
      if (data.save) ctx.applySave?.(data.save);
      busy = false;
      if (data.battle) accept(data.battle, data.serverNow);
      if (battle.seats.length >= players()) { syncBusy(); schedulePoll(); return; }
    } catch { /* an older server wants one seat per call */ }
    if (!alive(g)) return;
    busy = false; syncBusy();
    for (let i = 0; i < players(); i++) {
      if (seatAt(i)) continue;
      const res = await act("bot", { seat: i });
      if (!res) break;
    }
  }

  async function rematch() {
    if (!battle) return;
    if (!ctx.user?.()) { ctx.signIn?.(); return; }
    const me = mySeat();
    const others = battle.seats.filter((s) => s.seat !== me?.seat);
    const quick = Boolean(me && others.length && others.every((s) => s.bot));
    if (!quick) return openBuilder();
    if (busy) return;
    busy = true; syncBusy();
    const g = gen;
    try {
      const body = { requestId: uuid(), lineup: battle.lineup.map(({ key, quantity }) => ({ key, quantity })), settings: { ...battle.settings }, quick: true };
      const data = await api("/api/battles", { method: "POST", body: JSON.stringify(body) });
      if (!alive(g)) return;
      ctx.clock?.sync?.(data.serverNow);
      if (data.save) ctx.applySave?.(data.save);
      let next = data.battle;
      if (next?.status === "lobby") next = await quickFallback(next);
      if (!alive(g) || !next) return;
      ctx.navigate?.(`/battles/${next.id}`);
    } catch (err) {
      if (!alive(g)) return;
      if (err?.status === 401) ctx.signIn?.();
      else ctx.toast?.(err?.message || "The rematch didn't start. Try again.");
    } finally {
      if (alive(g)) { busy = false; syncBusy(); }
    }
  }

  // A server without `quick` hands back a lobby: seat the bots and start it.
  async function quickFallback(b) {
    const post = (path, body) => api(`/api/battles/${encodeURIComponent(b.id)}/${path}`, { method: "POST", body: JSON.stringify(body) });
    let current = b;
    try { current = (await post("bot", { fill: true })).battle || current; }
    catch {
      for (let i = 0; i < Number(b.settings.players); i++) {
        if (current.seats.some((s) => s.seat === i)) continue;
        try { current = (await post("bot", { seat: i })).battle || current; } catch { break; }
      }
    }
    try { const data = await post("start", {}); if (data.save) ctx.applySave?.(data.save); current = data.battle || current; } catch { /* the lobby still works */ }
    return current;
  }

  function openBuilder() {
    const lineup = (battle.lineup || []).map((p) => ({ ...p }));
    try {
      if (typeof hallModule.prefillBuilder === "function") hallModule.prefillBuilder({ lineup, settings: { ...battle.settings } });
    } catch (err) { console.warn("battle builder prefill", err); }
    ctx.navigate?.("/battles/new");
  }

  async function inspectCard(card) {
    if (!card) return;
    try {
      const [full] = card.set || card.imageSmall ? [card] : await ctx.resolveCards([card]);
      ctx.inspect?.(full || card);
    } catch { ctx.inspect?.(card); }
  }

  host.addEventListener("click", (event) => {
    if (!visible) return;
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
      event.preventDefault();
      ctx.navigate?.(nav.dataset.nav);
      return;
    }
    const stageCard = event.target.closest(".tb-stage [data-card-id]");
    if (stageCard) {
      const seat = Number(stageCard.closest(".tb-stage")?.dataset.seat);
      const cards = stageCards.get(seat) || [];
      const index = Number(stageCard.dataset.cardIndex);
      const card = cards[index]?.id === stageCard.dataset.cardId ? cards[index] : cards.find((c) => c.id === stageCard.dataset.cardId);
      if (card) inspectCard(card);
      return;
    }
    const best = event.target.closest("[data-inspect-best]");
    if (best) { inspectCard(bestCards[Number(best.dataset.inspectBest)]?.card); return; }
    const thumb = event.target.closest("[data-card]");
    if (thumb) {
      const [r, seat, k] = thumb.dataset.card.split(":").map(Number);
      inspectCard(battle?.rounds?.[r]?.pulls?.find((p) => p.seat === seat)?.cards?.[k]);
      return;
    }
    const button = event.target.closest("[data-act]");
    if (!button || button.disabled) return;
    const action = button.dataset.act;
    if (busy && !["invite", "retry", "stop-replay"].includes(action)) return;
    const seat = button.dataset.seat !== undefined ? Number(button.dataset.seat) : undefined;
    if (action === "retry") { view = "loading"; loadError = null; render(); poll(); }
    else if (action === "invite") copyInvite(button);
    else if (action === "start") act("start");
    else if (action === "join") act("join", seat === undefined ? {} : { seat });
    else if (action === "leave") act("leave").then((d) => d && ctx.toast?.("You left the table. Your entry was refunded."));
    else if (action === "cancel") act("cancel").then((d) => d && ctx.toast?.("Table cancelled. Every entry was refunded."));
    else if (action === "bot") act("bot", { seat });
    else if (action === "unbot") act("unbot", { seat });
    else if (action === "fill") fillBots();
    else if (action === "skip") act("skip");
    else if (action === "rematch") rematch();
    else if (action === "use-lineup") { if (!ctx.user?.()) ctx.signIn?.(); else openBuilder(); }
    else if (action === "replay") replay();
    else if (action === "stop-replay") stopReplay();
  });

  host.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".tb-receipt") && event.target.open) fillReceipt(event.target);
  }, true);

  // Small thumbnails fall back to the full scan when a -sm file is missing.
  host.addEventListener("error", (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.full || img.getAttribute("src") === img.dataset.full) return;
    img.src = img.dataset.full;
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (!visible || !battle) return;
    if (document.hidden) {
      clearTimeout(pollTimer);
      ensureTicker();
      if (view === "live" && (playing || shownRound >= 0)) {
        // The reveal can't keep time in a hidden tab: stop it and jump to the
        // server's newest round on return.
        stageToken++;
        R("stop");
        playing = null;
        stale = true;
      }
      return;
    }
    measureHeader();
    if (view === "live" && !finishing) stale = true;
    ensureTicker();
    poll();
  });
  addEventListener("resize", () => { if (visible) { measureHeader(); updateFloats(); } }, { passive: true });
  addEventListener("scroll", onScroll, { passive: true, capture: true });

  return { show, hide };
}
