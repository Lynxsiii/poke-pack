/* The Upgrader (/casino/upgrader and /casino/upgrader/<id>).

   Put up cards or slabs, pick a target worth more (any card of any set, or any
   sealed product) and press once. The Worker rolls one number, values both
   sides, takes the stake and, on a win, hands over the target in the same
   transaction (worker/upgrader.js). This module sets the stage, shows the odds
   from the shared rules (js/upgrader-rules.js, so the dial and the Worker use
   the same sum) and turns the needle to where the server's roll landed.

   The stage is three things in a row: your stake, the dial, the target. The
   dial is the whole page: a ring whose ink arc is the part of the ring that
   wins, and a needle that spins and stops somewhere on it. */
import { api, esc, coins, coinTag, icon, uuid, plural, countLine, copiesIn, playerName, emptyLine, seatAvatar, slabTileHTML } from "./casino-kit.js";
import { UPGRADER_RULES, upgradeChance, chanceText, multiplierText } from "./upgrader-rules.js?v=1";
import { createTargetPicker } from "./target-picker.js?v=1";
import { mountWinnings, winningsSlot } from "./casino-winnings.js";
import { gateLock, gateNoticeHTML, gateRefusal } from "./gate-notice.js";
import { ALL_SETS } from "./catalog.js";
import { wrapperArt } from "./battle-kit.js";

const POLL_MS = 8000;
const SPIN_MS = 3200;
const TURNS = 4;
const EASE = "cubic-bezier(.17,.67,.12,1)";
const RING_R = 82;
const RING_C = 2 * Math.PI * RING_R;
const SETS = new Map(ALL_SETS.map((s) => [s.id, s.name || s.id]));
const setName = (id) => SETS.get(id) || String(id || "");

const post = (path, body = {}) => api(path, { method: "POST", body: JSON.stringify(body) });
const cents = (value) => Math.round(Number(value) * 100);
/** The roll as a percentage of the ring: "31.2%". */
const rollText = (roll) => {
  const p = (Number(roll) || 0) / 10000;
  return `${Number(p.toFixed(p >= 10 ? 1 : 2))}%`;
};

export function createUpgrader(ctx) {
  const root = ctx.root;
  let visible = false;
  let mode = "play";
  let viewId = "";
  let timer = 0;
  let token = 0; // bumped on every navigation so a slow answer never paints the wrong page
  let feed = null; // { recent, mine, record, rules }
  let shown = null; // the finished upgrade on /casino/upgrader/<id>

  // The play state: what is on the stage.
  let stake = null; // { cards:[{id,qty}], slabIds, cents, value, items, slabs }
  let target = null; // what the target picker handed back
  let chanceOverride = 0; // the server's new chance after a 409, until either side changes
  let attempt = null; // { id } the requestId of the press in flight, kept across a retry
  let phase = "idle"; // idle | spinning | done
  let outcome = null; // the finished upgrade the stage shows
  let busy = false;
  let playing = 0;
  let lastLocked = false; // the gate state the action area was last drawn for
  let refreshTargets = false; // the next target picker forgets its lists (prices moved under the player)
  let prefetched = false;

  const me = () => ctx.user?.() || null;
  const signedIn = () => Boolean(me());
  const rules = () => ({ ...UPGRADER_RULES, ...(feed?.rules || {}) });
  const targets = createTargetPicker({
    allCards: () => ctx.allCards?.() ?? [],
    sealedTargets: () => ctx.sealedTargets?.() ?? [],
  });
  const stop = () => { clearTimeout(timer); timer = 0; };
  const later = (fn, ms) => { stop(); timer = setTimeout(fn, ms); };
  const isMine = (up) => Boolean(me() && up?.player?.userId === me().id);

  // Level gate (js/levels.js GATES): shut for a level-too-low player with no upgrades of their own on the page.
  const lock = () => {
    if (!feed) return null;
    const used = Boolean(feed.record?.played) || (feed.mine || []).length > 0;
    return gateLock("upgrader", me(), used);
  };

  // ---- The sums -----------------------------------------------------------
  const stakeCents = () => stake?.cents || 0;
  const targetCents = () => (target ? cents(target.value) : 0);
  const chanceNow = () => chanceOverride || (stake && target ? upgradeChance(stakeCents(), targetCents()) : 0);

  // ---- Pieces of the stage --------------------------------------------------
  /** Up to three of the dearest things in a stake, fanned like a hand. */
  function fanHTML(d) {
    const parts = [
      ...(d.slabs || []).map((s) => ({ v: Number(s.value) || 0, html: `<span class="ug-fan-i is-slab">${slabTileHTML(s, "mini")}</span>` })),
      ...(d.stake || []).map((c) => ({ v: (Number(c.value) || 0) * (c.qty || 1), html: `<span class="ug-fan-i"><img src="${esc(c.small || c.image)}" alt="" loading="lazy" decoding="async" /></span>` })),
    ].sort((a, b) => b.v - a.v);
    const shownParts = parts.slice(0, 3);
    const more = copiesIn(d.stake) + (d.slabs || []).length - shownParts.length;
    return `<span class="ug-art-wrap"><span class="ug-fan">${shownParts.map((p) => p.html).join("")}</span>${
      more > 0 ? `<b class="ug-more">+${Number(more).toLocaleString("en-US")}</b>` : ""}<span class="ug-gone" aria-hidden="true">Gone</span></span>`;
  }

  function stakeSlotHTML(m) {
    const d = m.stake;
    if (!d) {
      return `<button class="ug-slot ug-stake is-empty" type="button" data-stake aria-label="Put up cards or slabs">
        <span class="ug-art-wrap"><span class="ug-empty">${icon("plus")}<span>Put up cards</span></span></span></button>`;
    }
    const body = `${fanHTML(d)}
      <span class="ug-fig">${coinTag(d.value)}</span>
      <span class="ug-count">${esc(countLine(d.stake, d.slabs))}</span>
      ${m.interactive ? `<span class="ug-change">Change</span>` : ""}`;
    return m.interactive
      ? `<button class="ug-slot ug-stake" type="button" data-stake aria-label="Your stake, ${esc(coins(d.value))} coins. Change it">${body}</button>`
      : `<div class="ug-slot ug-stake">${body}</div>`;
  }

  function targetSlotHTML(m) {
    const t = m.target;
    if (!t) {
      return `<button class="ug-slot ug-targetslot is-empty" type="button" data-target aria-label="Pick a target">
        <span class="ug-art-wrap"><span class="ug-empty">${icon("plus")}<span>Pick a target</span></span></span></button>`;
    }
    const sealed = t.kind === "sealed";
    const src = sealed ? t.image || wrapperArt(t.setId) : t.small || t.image;
    const pic = sealed
      ? `<span class="ug-photo"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" /></span>`
      : `<img class="ug-pic" src="${esc(src)}" alt="" loading="lazy" decoding="async" />`;
    const set = setName(t.setId);
    const sub = sealed ? `${set}${t.packs ? `, ${plural(t.packs, "pack")}` : ""}` : `${set}${t.number ? ` ${t.number}` : ""}`;
    const body = `<span class="ug-art-wrap">${pic}</span>
      <span class="ug-fig">${coinTag(t.value)}</span>
      <span class="ug-name">${esc(t.name)}</span>
      <span class="ug-sub">${esc(sub)}</span>
      ${m.interactive ? `<span class="ug-change">Change</span>` : ""}`;
    return m.interactive
      ? `<button class="ug-slot ug-targetslot" type="button" data-target aria-label="Your target, ${esc(t.name)}, ${esc(coins(t.value))} coins. Change it">${body}</button>`
      : `<div class="ug-slot ug-targetslot">${body}</div>`;
  }

  /** The ring, the chance in the middle, the multiplier under it and the needle at `deg`. */
  function dialHTML(m) {
    const live = m.chance >= 1;
    // A very small chance still draws a sliver so the arc is never invisible; the text next to it stays exact.
    const arc = live ? Math.max((RING_C * m.chance) / 1e6, 3.4) : 0;
    const ticks = Array.from({ length: 10 }, (_, i) => `<line class="ug-tick${i ? "" : " is-zero"}" x1="100" y1="${i ? 4 : 2}" x2="100" y2="9" transform="rotate(${i * 36} 100 100)"/>`).join("");
    const label = live ? `${chanceText(m.chance)} chance to win${m.mult ? `, ${m.mult}` : ""}` : "No odds yet";
    return `<div class="ug-dial" role="img" aria-label="${esc(label)}">
      <svg class="ug-ring" viewBox="0 0 200 200" aria-hidden="true">${ticks}
        <circle class="ug-track" cx="100" cy="100" r="${RING_R}"/>
        <circle class="ug-win" cx="100" cy="100" r="${RING_R}" transform="rotate(-90 100 100)" stroke-dasharray="${arc.toFixed(2)} ${RING_C.toFixed(2)}"/>
      </svg>
      <span class="ug-needle" style="transform:rotate(${m.deg || 0}deg)"></span>
      <span class="ug-read" aria-hidden="true"><b>${live ? chanceText(m.chance) : "—"}</b><small>${live ? esc(m.mult || "") : ""}</small></span>
    </div>`;
  }

  /** What the stage shows right now, from the play state. */
  function playModel() {
    const up = outcome;
    const stakeDisp = stake ? { stake: stake.items, slabs: stake.slabs, value: stake.value } : null;
    const chance = up ? up.chance : chanceNow();
    return {
      stake: stakeDisp,
      target,
      chance,
      mult: stake && target && !chanceOverride ? multiplierText(stakeCents(), targetCents()) : "",
      deg: up ? (up.roll / 1e6) * 360 : 0,
      phase,
      result: phase === "done" && up ? (up.won ? "won" : "lost") : "",
      interactive: phase === "idle",
    };
  }

  /** What the stage shows for a finished upgrade somebody else (or I) made. */
  function viewModel(up) {
    return {
      stake: { stake: up.stake, slabs: up.slabs || [], value: up.stakeValue },
      target: { ...up.target, value: up.targetValue },
      chance: up.chance,
      mult: multiplierText(cents(up.stakeValue), cents(up.targetValue)),
      deg: (up.roll / 1e6) * 360,
      phase: "done",
      result: up.won ? "won" : "lost",
      interactive: false,
    };
  }

  function stageInner(m) {
    return `${stakeSlotHTML(m)}${dialHTML(m)}${targetSlotHTML(m)}`;
  }
  const stageAttrs = (m) => ({ phase: m.phase, result: m.result });

  function paintStage() {
    const el = root.querySelector(".ug-stage");
    if (!el) return;
    const m = mode === "view" && shown ? viewModel(shown) : playModel();
    const a = stageAttrs(m);
    el.dataset.phase = a.phase;
    el.dataset.result = a.result;
    el.innerHTML = stageInner(m);
  }

  // ---- The action area under the stage ----------------------------------------
  function goState() {
    const s = rules();
    const sc = stakeCents();
    const tc = targetCents();
    if (busy) return { label: "Upgrading", disabled: true, hint: "" };
    if (!stake && !target) return { label: "Upgrade", disabled: true, hint: "Put up cards, then pick what you want." };
    if (!stake) return { label: "Put up cards", disabled: true, hint: "Put up cards worth less than your target." };
    if (!target) return { label: "Pick a target", disabled: true, hint: "Pick a card or a sealed product worth more than your stake." };
    if (tc <= sc && !chanceOverride) return { label: "Pick a target worth more", disabled: true, hint: `Your stake is worth ${coins(sc / 100)}. The target has to be worth more.` };
    const ch = chanceNow();
    if (ch < s.minChance) return { label: "Too far away", disabled: true, hint: "That target is too far away for this stake. Pick a closer one." };
    return {
      label: `Upgrade at ${chanceText(ch)}`,
      disabled: false,
      hint: chanceOverride
        ? `Prices moved. Your odds are now ${chanceText(ch)}.`
        : `The stake is used up either way. ${target.kind === "sealed" ? "A win puts the box in your Sealed collection." : "A win puts the card in your collection."}`,
    };
  }

  function idleHTML() {
    const g = goState();
    return `<button class="solid ug-go${lock() ? " is-gated" : ""}" type="button" data-go${g.disabled ? " disabled" : ""}${lock() ? ' aria-disabled="true"' : ""}>${esc(g.label)}</button>
      ${g.hint ? `<p class="cs-fine ug-hint">${esc(g.hint)}</p>` : ""}`;
  }

  /** The result line, its one-line proof, and the buttons. `up` is the finished upgrade. */
  function resultHTML(up) {
    const mine = isMine(up);
    const name = up.target.name;
    const sealed = up.target.kind === "sealed";
    const proof = `The needle stopped at ${rollText(up.roll)}. Anything under ${chanceText(up.chance)} wins.`;
    let line;
    if (mine) {
      line = up.won
        ? `<b>You got it.</b> ${sealed ? `The ${esc(name)} is in your Sealed collection.` : `${esc(name)} is in your collection.`}`
        : `<b>Not this time.</b> Your ${coins(up.stakeValue)} is gone.`;
    } else {
      line = `<b>${esc(playerName(up.player))}</b> put up ${coins(up.stakeValue)} for ${esc(name)} and ${up.won ? "took it" : "missed"}.`;
    }
    let buttons;
    if (mode === "view") {
      buttons = `<button class="solid" type="button" data-nav-play>${mine ? "Upgrade again" : "Try your own"}</button><button class="ghost" type="button" data-copy>${icon("link")}Copy link</button>`;
    } else if (up.won && sealed) {
      buttons = `<button class="solid" type="button" data-again>Upgrade again</button><button class="ghost" type="button" data-vault>Open it</button>`;
    } else if (up.won) {
      buttons = `<button class="solid" type="button" data-again>Upgrade again</button><button class="ghost" type="button" data-see>See it</button>`;
    } else {
      buttons = `<button class="solid" type="button" data-retry>Try again</button>`;
    }
    const wins = mine && up.won && !sealed ? winningsSlot("upgrader", up.id) : "";
    return `<p class="ug-line" aria-live="polite">${line}</p>
      <p class="cs-fine ug-proof">${esc(proof)}</p>
      <div class="ug-btns">${buttons}</div>
      ${wins}`;
  }

  function paintAct() {
    const el = root.querySelector(".ug-act");
    if (!el) return;
    if (mode === "view") {
      el.innerHTML = shown ? resultHTML(shown) : "";
    } else if (phase === "done" && outcome) {
      el.innerHTML = resultHTML(outcome);
    } else if (phase === "spinning") {
      el.innerHTML = `<button class="solid ug-go" type="button" disabled>Rolling</button><p class="cs-fine ug-hint">The server has rolled. The needle is turning.</p>`;
    } else {
      el.innerHTML = idleHTML();
    }
    const slot = el.querySelector("[data-winnings]");
    if (slot && (phase === "done" || mode === "view")) mountWinnings(slot, { source: "upgrader", id: slot.dataset.game, ctx });
  }

  // ---- The feed ---------------------------------------------------------------
  const rowHTML = (up, own) => {
    const who = own ? "<b>You</b>" : `<b>${esc(playerName(up.player))}</b>`;
    return `<a class="cs-row cs-row-link ug-row" href="/casino/upgrader/${esc(up.id)}" data-nav>
      <span class="cs-row-main">${seatAvatar(up.player)}<span class="cs-row-line"><span>${who} went for ${esc(up.target.name)} (${coins(up.targetValue)})</span>
        <small>${coins(up.stakeValue)} at ${chanceText(up.chance)}, <span class="ug-out${up.won ? " is-won" : ""}">${up.won ? "took it" : "missed"}</span></small></span></span></a>`;
  };

  function howItWorks() {
    const r = rules();
    const edge = Math.round((r.edgeMillionths / 1e6) * 100);
    const keep = 100 - edge;
    return `<details class="cs-how"><summary>How the odds work</summary>
      <p>Your stake divided by the target's value, times 0.${keep}, is your chance to win. It stops at ${Math.round(r.maxChance / 1e4)}%, so no jump is ever a sure thing, and a target worth twice your stake gives you a little under 48%.</p>
      <p>The server makes the roll, one number from 0 to 100, the moment you press the button. If it lands inside the ink arc you win. Nothing in your browser can change it: the needle only shows where the server's number landed.</p>
      <p>Your stake is used up whether you win or lose. Cards count at their market price, slabs at their graded value and sealed products at the shop price. A won card goes into your collection. A won sealed product goes into your Sealed collection, where you open it the normal way.</p>
      <p>The ${edge}% is the house's edge: on average an upgrade is worth at most ${keep}% of what you put up, however high you aim.</p></details>`;
  }

  function paintFeed() {
    const el = root.querySelector(".ug-feed");
    if (!el || !feed) return;
    const recent = feed.recent || [];
    const mine = feed.mine || [];
    const rec = feed.record;
    el.innerHTML = `<section class="cs-section ug-recent" aria-labelledby="ug-recent">
        <h2 class="cs-h" id="ug-recent">Recent upgrades</h2>
        <div class="cs-rows">${recent.length ? recent.map((u) => rowHTML(u, isMine(u))).join("") : emptyLine("Nobody has gone for anything yet. Put up cards and be the first.")}</div>
      </section>
      ${signedIn() ? `<section class="cs-section" aria-labelledby="ug-mine">
        <h2 class="cs-h" id="ug-mine">Your upgrades</h2>
        ${rec?.played ? `<p class="cs-fine ug-record">You have gone for ${plural(rec.played, "upgrade")} and won ${rec.won}.${rec.biggest > 0 ? ` Your biggest win was worth ${coins(rec.biggest)}.` : ""}</p>` : ""}
        <div class="cs-rows">${mine.length ? mine.map((u) => rowHTML(u, true)).join("") : emptyLine("Your upgrades will show here.")}</div>
      </section>` : ""}`;
  }

  function paintGate() {
    const el = root.querySelector(".ug-gate");
    if (el) el.innerHTML = gateNoticeHTML(lock());
  }

  // ---- Pages ------------------------------------------------------------------
  function paintPlay() {
    root.innerHTML = `<div class="cs-page ug-page">
      <header class="cs-head">
        <h1 class="page-title">Upgrader</h1>
        <p class="cs-lede">Put up cards or slabs and go for anything: a card from any set, or a sealed product. The bigger the jump, the lower the odds.</p>
      </header>
      <div class="ug-gate"></div>
      <div class="ug-main">
        <div class="ug-play">
          <section class="ug-stage" aria-label="The upgrade" data-phase="idle" data-result=""></section>
          <div class="ug-act"></div>
        </div>
        <div class="ug-side"><div class="ug-feed"></div>${howItWorks()}</div>
      </div>
    </div>`;
    lastLocked = false;
    paintStage();
    paintAct();
    paintGate();
    paintFeed();
  }

  function paintView() {
    root.innerHTML = `<div class="cs-page ug-page ug-viewpage">
      <a class="cs-back" href="/casino/upgrader" data-nav>${icon("back")}Upgrader</a>
      <div class="ug-play">
        <section class="ug-stage" aria-label="The upgrade" data-phase="done" data-result=""></section>
        <div class="ug-act"></div>
      </div>
    </div>`;
    paintStage();
    paintAct();
  }

  // ---- Data ---------------------------------------------------------------
  async function loadFeed() {
    const at = ++token;
    try {
      const data = await api("/api/casino/upgrades");
      if (at !== token || !visible || mode !== "play") return;
      ctx.clock.sync(data.serverNow);
      feed = data;
      paintFeed();
      const locked = Boolean(lock());
      if (locked !== lastLocked) {
        lastLocked = locked;
        paintGate();
        if (phase === "idle" && !busy) paintAct();
      }
    } catch {
      if (at !== token) return;
      if (!feed) {
        const side = root.querySelector(".ug-feed");
        if (side) side.innerHTML = emptyLine("Couldn't reach the casino. Try again in a moment.");
      }
    }
    if (visible && mode === "play") later(loadFeed, POLL_MS);
  }

  async function loadView(first = false) {
    const at = ++token;
    try {
      const data = await api(`/api/casino/upgrades/${encodeURIComponent(viewId)}`);
      if (at !== token || !visible || mode !== "view") return;
      ctx.clock.sync(data.serverNow);
      shown = data.upgrade;
      paintView();
    } catch (err) {
      if (at !== token) return;
      if (first) root.innerHTML = `<div class="cs-page ug-page"><a class="cs-back" href="/casino/upgrader" data-nav>${icon("back")}Upgrader</a>${emptyLine(err?.status === 404 ? "That upgrade doesn't exist." : "Couldn't load that upgrade.")}</div>`;
    }
  }

  // ---- The press ----------------------------------------------------------------
  const needSignIn = () => {
    if (signedIn()) return false;
    ctx.toast?.("Sign in to upgrade. Your cards and slabs are what you put up.");
    ctx.signIn?.();
    return true;
  };

  function setStake(cards, total, slabIds) {
    const snap = ctx.owned?.() || { cards: [], slabs: [] };
    const byId = new Map((snap.cards || []).map((e) => [e.id, e]));
    const slabById = new Map((snap.slabs || []).map((s) => [String(s.id), s]));
    const items = cards.map((c) => {
      const e = byId.get(c.id) || {};
      return { id: c.id, qty: c.qty, name: e.name || "Card", image: e.image || "", small: e.small || e.image || "", value: e.value || 0 };
    });
    const slabs = (slabIds || []).map((id) => slabById.get(String(id))).filter(Boolean);
    stake = { cards, slabIds: slabIds || [], cents: cents(total), value: total, items, slabs };
    chanceOverride = 0;
    attempt = null;
    paintStage();
    paintAct();
    refocus("[data-stake]");
    prefetchTargets();
  }

  /** The sheet that just closed took focus with it: put it back on the slot that changed. */
  const refocus = (selector) => setTimeout(() => root.querySelector(selector)?.focus({ preventScroll: true }), 0);

  /** Start loading the card list while the player decides, so the target picker opens full. */
  function prefetchTargets() {
    if (prefetched || !ctx.allCards) return;
    prefetched = true;
    const run = () => Promise.resolve(ctx.allCards()).catch(() => { prefetched = false; });
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1500);
  }

  function setTarget(t) {
    target = t;
    chanceOverride = 0;
    attempt = null;
    paintStage();
    paintAct();
    refocus("[data-target]");
  }

  function openStake() {
    if (phase !== "idle" || busy) return;
    if (needSignIn()) return;
    if (lock()) return ctx.toast?.(gateRefusal(lock()));
    const r = rules();
    ctx.picker.open({
      title: "Put up cards or slabs",
      confirmLabel: (total) => `Put up ${coins(total)}`,
      busyLabel: "Putting them up",
      noun: "upgrade",
      minValue: r.minCents,
      maxSlabs: r.maxSlabs,
      slabNote: "Slabs are used up, win or lose. The guard stays with you.",
      hint: () => "Pick a target worth more than this.",
      onConfirm: async (cards, total, _choices, slabIds) => setStake(cards, total, slabIds),
    });
  }

  function openTarget() {
    if (phase !== "idle" || busy) return;
    const refresh = refreshTargets;
    refreshTargets = false;
    targets.open({ stakeCents: stakeCents(), current: target, onPick: setTarget, ...(refresh ? { refresh: true } : {}) });
  }

  const targetBody = (t) => (t.kind === "sealed" ? { kind: "sealed", setId: t.setId, id: t.id } : { kind: "card", id: t.id });

  async function go() {
    if (busy || phase !== "idle") return;
    if (needSignIn()) return;
    if (lock()) return ctx.toast?.(gateRefusal(lock()));
    const g = goState();
    if (g.disabled || !stake || !target) return;
    busy = true;
    paintAct();
    const mine = playing;
    try {
      attempt ||= { id: uuid() };
      const data = await post("/api/casino/upgrades", {
        requestId: attempt.id,
        cards: stake.cards,
        slabs: stake.slabIds,
        target: targetBody(target),
        expectedChance: chanceNow(),
      });
      ctx.clock.sync(data.serverNow);
      attempt = null;
      if (mine !== playing || !visible) {
        // The player left the page while the request was out. The Worker took the stake, so take its save.
        ctx.applySave?.(data.save);
        return;
      }
      await reveal(data);
    } catch (err) {
      if (mine !== playing || !visible) return;
      busy = false;
      if (err?.status === 409 && err.payload?.chance >= 1) {
        // The prices moved under the player: show the new odds and let them press again.
        chanceOverride = err.payload.chance;
        attempt = null;
        refreshTargets = true;
        ctx.invalidateCards?.();
        paintStage();
      } else if (err?.status === 409) {
        // The cards are no longer theirs (or another 409): the stake on the stage is stale.
        stake = null;
        chanceOverride = 0;
        attempt = null;
        paintStage();
      } else if (err?.status >= 400 && err?.status < 500) attempt = null;
      ctx.toast?.(err?.message || "Couldn't reach the casino. Press again to retry.");
      if (phase === "idle") paintAct();
    }
  }

  /** Turn the needle to where the roll landed. Under reduced motion it is simply there. */
  function spin(deg) {
    const needle = root.querySelector(".ug-needle");
    if (!needle) return Promise.resolve();
    if (!ctx.motion()) {
      needle.style.transition = "none";
      needle.style.transform = `rotate(${deg}deg)`;
      return Promise.resolve();
    }
    needle.style.transition = "none";
    needle.style.transform = "rotate(0deg)";
    void needle.offsetWidth;
    needle.style.transition = `transform ${SPIN_MS}ms ${EASE}`;
    needle.style.transform = `rotate(${TURNS * 360 + deg}deg)`;
    return new Promise((resolve) => {
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        needle.removeEventListener("transitionend", onEnd);
        // Same place on the ring, minus the four laps, so the next spin starts clean.
        needle.style.transition = "none";
        needle.style.transform = `rotate(${deg}deg)`;
        resolve();
      };
      const onEnd = (e) => { if (e.target === needle && e.propertyName === "transform") end(); };
      needle.addEventListener("transitionend", onEnd);
      const guard = setTimeout(end, SPIN_MS + 150);
    });
  }

  async function reveal(data) {
    const up = data.upgrade;
    const mark = ++playing;
    outcome = up;
    chanceOverride = 0;
    phase = "spinning";
    busy = false;
    paintStage();
    paintAct();
    await spin((up.roll / 1e6) * 360);
    // The save is the Worker's answer to this press: take it even if the player has already walked away.
    ctx.applySave?.(data.save);
    if (mark !== playing || !visible) return;
    settle(up);
  }

  function settle(up) {
    phase = "done";
    const stage = root.querySelector(".ug-stage");
    if (stage) {
      stage.dataset.phase = "done";
      stage.dataset.result = up.won ? "won" : "lost";
    }
    paintAct();
    ctx.buzz?.(up.won ? [18, 40, 26] : [30]);
    root.querySelector(".ug-act")?.scrollIntoView?.({ block: "nearest", behavior: ctx.motion() ? "smooth" : "auto" });
    loadFeed();
  }

  function reset({ keepTarget = false } = {}) {
    playing++;
    stake = null;
    if (!keepTarget) target = null;
    chanceOverride = 0;
    attempt = null;
    outcome = null;
    phase = "idle";
    busy = false;
    paintStage();
    paintAct();
  }

  // ---- Events -------------------------------------------------------------------
  root.addEventListener("click", (e) => {
    if (!visible) return;
    const nav = e.target.closest("[data-nav]");
    if (nav && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) {
      e.preventDefault();
      ctx.navigate(nav.getAttribute("href"));
      return;
    }
    if (e.target.closest("[data-stake]")) return openStake();
    if (e.target.closest("[data-target]")) return openTarget();
    if (e.target.closest("[data-go]")) return go();
    if (e.target.closest("[data-again]")) return reset();
    if (e.target.closest("[data-retry]")) return reset({ keepTarget: true });
    if (e.target.closest("[data-nav-play]")) return ctx.navigate("/casino/upgrader");
    if (e.target.closest("[data-vault]")) return ctx.navigate("/bulk/sealed");
    if (e.target.closest("[data-see]") && outcome?.target?.kind !== "sealed") return ctx.inspect?.({ id: outcome.target.id, reverse: false });
    if (e.target.closest("[data-copy]")) {
      const url = `${location.origin}/casino/upgrader/${viewId}`;
      navigator.clipboard?.writeText(url).then(() => ctx.toast?.("Link copied."), () => ctx.toast?.(url));
    }
  });

  // ---- Lifecycle ----------------------------------------------------------------
  function show(id = "") {
    const nextMode = id ? "view" : "play";
    if (visible && mode === nextMode && viewId === id) return;
    visible = true;
    stop();
    playing++;
    token++;
    mode = nextMode;
    viewId = id;
    shown = null;
    stake = null;
    target = null;
    chanceOverride = 0;
    attempt = null;
    outcome = null;
    phase = "idle";
    busy = false;
    targets.close();
    if (mode === "play") {
      paintPlay();
      loadFeed();
    } else {
      root.innerHTML = `<div class="cs-page ug-page"><p class="cs-empty">Loading.</p></div>`;
      loadView(true);
    }
  }

  function hide() {
    visible = false;
    stop();
    token++;
    playing++;
    mode = "play";
    viewId = "";
    targets.close();
    ctx.picker.close();
  }

  return { show, hide };
}
