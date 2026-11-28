/* BETA TESTING: the casino's invite-only games (worker/beta.js settles every one).

   /casino/beta     join with an invite code, the perks, the games; the owner makes codes here
   /casino/grass    Tall Grass: clear tiles, dodge the Voltorb, cash out
   /casino/tins     Mystery Tins: a themed tin, one card out

   The page only asks and shows. Every stake, roll and payout is the Worker's. */
import { api, esc, coinTag, uuid } from "./casino-kit.js";
import { BETA_GAMES, BETA_RULES, GRASS, TIN_MAX_OPEN, TIN_TIERS, grassMultiplier } from "./beta-rules.js?v=6";
import { slabHTML } from "./slab.js?v=3";

const fmtX = (m) => `${Number(m || 0).toFixed(2)}x`;
const num = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });

// ---- Art ---------------------------------------------------------------------------------
const VOLTORB = `<svg class="bz-voltorb" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="var(--hp-low)" stroke="var(--k0)" stroke-width="2.5"/><path d="M4 20a16 16 0 0 0 32 0z" fill="#fff" stroke="var(--k0)" stroke-width="2.5"/><path d="M11 15l7 3M29 15l-7 3" stroke="var(--k0)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const ART = {
  grass: `<svg viewBox="0 0 70 70" aria-hidden="true"><g stroke="var(--k0)" stroke-width="2.5"><rect x="4" y="4" width="18" height="18" fill="var(--hp)"/><rect x="26" y="4" width="18" height="18" fill="var(--hp)"/><rect x="48" y="4" width="18" height="18" fill="var(--box)"/><rect x="4" y="26" width="18" height="18" fill="var(--box)"/><rect x="26" y="26" width="18" height="18" fill="var(--hp)"/><rect x="48" y="26" width="18" height="18" fill="var(--hp)"/><rect x="4" y="48" width="18" height="18" fill="var(--hp)"/><rect x="26" y="48" width="18" height="18" fill="var(--hp-low)"/><rect x="48" y="48" width="18" height="18" fill="var(--hp)"/></g></svg>`,
  tins: `<svg viewBox="0 0 70 70" aria-hidden="true"><g stroke="var(--k0)" stroke-width="2.5"><rect x="8" y="22" width="54" height="34" fill="var(--cy)"/><rect x="5" y="14" width="60" height="10" fill="var(--yel)"/></g><circle cx="35" cy="39" r="7" fill="var(--box)" stroke="var(--k0)" stroke-width="2.5"/></svg>`,
};

/** The stake field every game uses: a number with half and double keys. */
const stakeField = (id, value) => `<label class="bz-field"><span>Stake</span>
  <span class="bz-stake"><input id="${id}" class="bz-input" type="number" inputmode="decimal" min="${BETA_RULES.minStake}" max="${BETA_RULES.maxStake}" step="1" value="${esc(value)}" />
  <button type="button" class="ghost sm" data-stake="half">Half</button><button type="button" class="ghost sm" data-stake="double">2x</button></span></label>`;
function wireStake(root) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-stake]");
    if (!b) return;
    const input = b.closest(".bz-stake").querySelector("input");
    const v = Number(input.value) || BETA_RULES.minStake;
    const next = b.dataset.stake === "half" ? Math.floor(v / 2) : v * 2;
    input.value = String(Math.max(BETA_RULES.minStake, Math.min(BETA_RULES.maxStake, next)));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const readStake = (root, id) => Number(root.querySelector(`#${id}`)?.value);

/** A page module: show/hide around a paint function, with the shared plumbing. */
function page(ctx, root, key, impl) {
  let visible = false;
  const state = { busy: false };
  const fail = (err) => {
    if (err?.payload?.needBeta) {
      ctx.toast?.("Enter an invite code to play the beta games.");
      return ctx.navigate("/casino/beta");
    }
    ctx.toast?.(err?.message || "Something went wrong.");
  };
  const apply = (res) => {
    if (res?.save) ctx.applySave?.(res.save);
    if (res?.serverNow) ctx.clock.sync(res.serverNow);
    return res;
  };
  const head = (title, extra = "") => `<header class="cs-head bz-head"><a class="bz-back" href="/casino/beta" data-bt-link>Beta testing</a>
    <h1 class="page-title">${esc(title)} <span class="rt-tag bz-tag">Beta</span></h1>${extra}</header>`;
  const api2 = { state, fail, apply, head, visible: () => visible, root, ctx };
  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-bt-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    ctx.navigate(a.getAttribute("href"));
  });
  wireStake(root);
  const mod = impl(api2);
  return {
    show(id) {
      visible = true;
      if (!ctx.user?.()) {
        root.innerHTML = `<div class="cs-page bz-page">${head(BETA_GAMES.find((g) => g.key === key)?.title || "Beta testing")}
          <div class="rt-box bz-box"><p>Sign in to play the beta games.</p><button type="button" class="solid rt-go" data-bt-signin>Sign in</button></div></div>`;
        root.querySelector("[data-bt-signin]").onclick = () => ctx.signIn?.();
        return;
      }
      mod.show(id);
    },
    hide() {
      visible = false;
      mod.hide?.();
    },
  };
}

// ---- The beta home -------------------------------------------------------------------------
function homePage(ctx, root) {
  return page(ctx, root, "beta", (p) => {
    let data = null;
    const perks = `<ul class="bz-perks">
      <li><b>Beta badge</b><span>A Beta tag beside your name on your profile.</span></li>
      <li><b>Beta Tester frame</b><span>An avatar frame only testers can wear. Pick it in Settings, Look.</span></li>
      <li><b>Early access</b><span>Play new casino games before everyone else, and help shape them.</span></li></ul>`;
    const tiles = () => `<ul class="hub-games bz-games" aria-label="Beta games">${BETA_GAMES.map((g) => `<li class="hub-tile" data-game="${g.key}">
      <a class="hub-game" href="${g.href}" data-bt-link><span class="hub-game-art" aria-hidden="true"><span class="hub-game-obj bz-art">${ART[g.key]}</span></span>
      <span class="hub-game-copy"><b>${esc(g.title)}</b><span>${esc(g.line)}</span></span><i class="hub-game-go" aria-hidden="true"></i></a></li>`).join("")}</ul>`;
    const codeRow = (c) => `<div class="rt-row bz-code-row${c.revoked ? " is-off" : ""}"><span class="rt-row-lab">${c.uses}/${c.maxUses}</span>
      <span class="rt-row-name"><code>${esc(c.code)}</code><small>${c.revoked ? "Turned off" : c.uses >= c.maxUses ? "Used up" : `${c.maxUses - c.uses} left`}${c.note ? `, ${esc(c.note)}` : ""}</small></span>
      <span class="rt-row-val">${c.revoked ? "" : `<button type="button" class="ghost sm" data-copy="${esc(c.code)}">Copy</button><button type="button" class="ghost sm" data-revoke="${esc(c.code)}">Turn off</button>`}</span></div>`;
    const admin = () => data?.admin ? `<section class="rt-box bz-box bz-admin" aria-labelledby="bz-codes"><h2 class="cs-h" id="bz-codes">Invite codes</h2>
      <p class="bz-note">Only you see this. Make a code, send it to someone, and they type it here to join. Only code holders can play; your account is always in.</p>
      <form class="bz-make" data-make>
        <label class="bz-field"><span>Codes</span><input class="bz-input" name="count" type="number" min="1" max="20" value="1" /></label>
        <label class="bz-field"><span>Uses each</span><input class="bz-input" name="uses" type="number" min="1" max="500" value="1" /></label>
        <label class="bz-field bz-wide"><span>Note</span><input class="bz-input" name="note" maxlength="60" placeholder="Who it's for" /></label>
        <button class="solid" type="submit">Make codes</button></form>
      <div class="bz-codes">${(data.codes || []).length ? data.codes.map(codeRow).join("") : `<p class="bz-note">No codes yet.</p>`}</div></section>` : "";
    function paint() {
      const inside = data?.member;
      root.innerHTML = `<div class="cs-page bz-page bz-home">
        <header class="cs-head bz-head"><h1 class="page-title">Beta testing <span class="rt-tag bz-tag">Beta</span></h1></header>
        ${!data ? `<div class="rt-skel bz-skel"></div>` : inside ? `${data.member ? `<p class="bz-lede">You're a beta tester. These games are new, so tell us what feels off.</p>` : `<p class="bz-lede">You run the beta. Join with one of your own codes to get the badge and frame.</p>`}
          ${tiles()}
          <section class="rt-box bz-box"><h2 class="cs-h">Your perks</h2>${perks}</section>` : `
          <p class="bz-lede">New casino games, open to invited testers first. Got a code? Enter it to join.</p>
          <form class="rt-box bz-box bz-join" data-join><label class="bz-field bz-wide"><span>Invite code</span><input class="bz-input bz-code" name="code" autocomplete="off" autocapitalize="characters" placeholder="BETA-XXXXXX" required /></label>
          <button class="solid rt-go" type="submit">Join the beta</button></form>
          <section class="rt-box bz-box"><h2 class="cs-h">What testers get</h2>${perks}
          <p class="bz-note">Games to try: ${BETA_GAMES.map((g) => esc(g.title)).join(", ")}. Free play with virtual coins, like the rest of the casino.</p></section>`}
        ${data?.member && data?.admin ? "" : ""}${admin()}</div>`;
    }
    root.addEventListener("submit", async (e) => {
      const join = e.target.closest("[data-join]");
      const make = e.target.closest("[data-make]");
      if (!join && !make) return;
      e.preventDefault();
      if (p.state.busy) return;
      p.state.busy = true;
      try {
        if (join) {
          await post("/api/casino/beta/join", { code: new FormData(join).get("code") });
          ctx.toast?.("You're in. Welcome to the beta.");
          ctx.refreshUser?.();
        } else {
          const f = new FormData(make);
          const res = await post("/api/casino/beta/codes", { count: Number(f.get("count")), uses: Number(f.get("uses")), note: f.get("note") });
          ctx.toast?.(`Made ${res.made.length} code${res.made.length === 1 ? "" : "s"}.`);
        }
        await load();
      } catch (err) {
        p.fail(err);
      } finally {
        p.state.busy = false;
      }
    });
    root.addEventListener("click", async (e) => {
      const copy = e.target.closest("[data-copy]");
      if (copy) {
        try { await navigator.clipboard.writeText(copy.dataset.copy); ctx.toast?.("Copied."); } catch { ctx.toast?.(copy.dataset.copy); }
        return;
      }
      const off = e.target.closest("[data-revoke]");
      if (off) {
        try { data.codes = (await post("/api/casino/beta/codes/revoke", { code: off.dataset.revoke })).codes; paint(); } catch (err) { p.fail(err); }
      }
    });
    async function load() {
      try {
        data = await api("/api/casino/beta");
        if (p.visible()) paint();
      } catch (err) {
        p.fail(err);
      }
    }
    return { show() { paint(); load(); } };
  });
}

// ---- Tall Grass -----------------------------------------------------------------------------
/* A patch of tall grass, five by five, swaying. Cutting a clear tile sends the blades flying and leaves a sparkle
   stamped with the multiplier it took you to. Over the field: what cashing out pays now, and an HP bar for how
   likely the next tile is clear. Under it: what the next tiles pay. A Voltorb shakes the whole patch. */
const TUFT = `<svg class="bz-tuft is-b" viewBox="0 0 40 40" aria-hidden="true"><path d="M2 38c1-8 2-13 4-18 1 6 2 9 3 12 1-9 3-17 6-23 1 8 2 15 3 21 1-7 3-13 5-19 2 7 3 14 4 20 1-5 2-9 5-13 1 7 2 13 6 20z"/></svg>
  <svg class="bz-tuft is-f" viewBox="0 0 40 40" aria-hidden="true"><path d="M5 39c1-7 2-11 5-16 1 5 1 8 2 11 2-8 4-14 8-20 1 8 2 13 3 19 1-4 3-8 6-11 1 6 2 11 6 17z"/><path class="bz-glint" d="M19 17c-2 5-3 9-4 14M29 25c-1 3-2 6-2 9"/></svg>`;
const STUBBLE = `<svg class="bz-stubble" viewBox="0 0 40 12" aria-hidden="true"><path d="M3 11l2-7 3 7 3-9 3 9 3-7 3 7 3-9 3 9 3-6 3 6 3-7 2 7z"/></svg>`;
const SPARK = `<svg class="bz-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.800 8.200L23 12l-8.200 2.800L12 23l-2.800-8.200L1 12l8.200-2.800z"/></svg>`;
const ZAP = `<svg class="bz-zap" viewBox="0 0 60 60" aria-hidden="true"><path d="M30 2l6 14 13-8-4 15 14 3-12 8 9 12-15-2-2 15-9-12-9 12-2-15-15 2 9-12-12-8 14-3-4-15 13 8z"/></svg>`;
function grassPage(ctx, root) {
  return page(ctx, root, "grass", (p) => {
    let run = null;
    let recent = [];
    let last = { stake: 10, mines: 3 };
    let fresh = -1; // the tile the last tap turned over: only it animates
    let ended = false; // true for the one paint where the run just ended: the board reveals
    const tile = (i) => {
      const at = run?.open?.indexOf(i) ?? -1;
      const open = at >= 0;
      const volt = run?.voltorb?.includes(i);
      const hit = run?.hit === i;
      const live = run?.state === "open";
      const cls = open ? "is-open" : volt ? `is-volt${hit ? " is-hit" : ""}` : run && !live ? "is-left" : "";
      const inner = volt ? `${hit ? ZAP : ""}${VOLTORB}`
        : open ? `${STUBBLE}${SPARK}<b>${fmtX(grassMultiplier(run.mines, at + 1))}</b>${fresh === i ? `<i class="bz-bit"></i><i class="bz-bit"></i><i class="bz-bit"></i><i class="bz-bit"></i>` : ""}`
        : TUFT;
      return `<button type="button" class="bz-tile ${cls}${fresh === i ? " is-new" : ""}" style="--i:${i}" data-tile="${i}" ${live && !open ? "" : "disabled"} aria-label="Tile ${i + 1}${open ? ", clear" : volt ? ", Voltorb" : ""}">${inner}</button>`;
    };
    /** What the next clear tiles pay, the very next one first. */
    const ladder = (mines, n) => {
      const left = GRASS.tiles - mines - n;
      const steps = Array.from({ length: Math.min(4, left) }, (_, k) => grassMultiplier(mines, n + k + 1));
      return steps.length ? `<p class="bz-ladder" aria-label="What the next clear tiles pay"><small>Next</small>${steps.map((m, k) => `<span class="${k ? "" : "is-next"}">${fmtX(m)}</span>`).join("")}</p>` : `<p class="bz-ladder"><small>The field is clear. Cash out.</small></p>`;
    };
    /** How likely the next tile is clear, as an HP bar. */
    const safety = (mines, n) => {
      const left = GRASS.tiles - n;
      const safe = left > 0 ? Math.max(0, (left - mines) / left) : 0;
      const tone = safe >= 0.6 ? "" : safe >= 0.35 ? " is-mid" : " is-low";
      return `<p class="bz-safe${tone}"><span class="bz-safe-bar" aria-hidden="true"><i style="transform:scaleX(${safe.toFixed(3)})"></i></span><small><b>${Math.round(safe * 100)}%</b> the next tile is clear</small><span class="bz-safe-volt">${VOLTORB}<b>${mines}</b></span></p>`;
    };
    const clearLine = (m) => `${GRASS.tiles - m} clear tiles, ${Math.round(((GRASS.tiles - m) / GRASS.tiles) * 100)}% safe`;
    /** Before a run: how many Voltorb hide, as quick picks with a step either side. */
    const picker = () => `<div class="bz-volts" role="group" aria-label="How many Voltorb hide in the grass"><span class="bz-safe-volt">${VOLTORB}<b data-mines-out>${last.mines}</b></span>
      <button type="button" class="ghost sm" data-mines-step="-1" aria-label="One fewer Voltorb">-</button>
      ${[1, 3, 5, 10, 20].map((m) => `<button type="button" class="rt-word${last.mines === m ? " on" : ""}" data-mines="${m}">${m}</button>`).join("")}
      <button type="button" class="ghost sm" data-mines-step="1" aria-label="One more Voltorb">+</button></div>`;
    const recentHTML = () => recentRows(recent.map((r) => ({ won: r.state === "cashed", line: `${r.mines} Voltorb, ${r.open.length} clear`, mult: r.mult, stake: r.stake, payout: r.payout })));
    function paint() {
      const live = run?.state === "open";
      const n = run?.open?.length || 0;
      const pay = live ? Math.min(BETA_RULES.maxWin, Math.floor(run.stake * run.mult * 100) / 100) : 0;
      const mines = run ? run.mines : last.mines;
      const bump = fresh >= 0 && live ? " is-bump" : "";
      const hud = !run ? `<div class="bz-hud"><p class="bz-hud-fig"><small>First clear tile pays</small><b data-first-hud>${fmtX(grassMultiplier(last.mines, 1))}</b></p><p class="bz-hud-side"><small data-clear-hud>${clearLine(last.mines)}</small><small>More Voltorb, bigger steps</small></p></div>`
        : live ? `<div class="bz-hud is-live"><p class="bz-hud-fig"><small>${n ? "Cash out now for" : "Tap a tile"}</small><b class="${bump}">${n ? fmtX(run.mult) : "1.00x"}</b></p><p class="bz-hud-side">${n ? coinTag(pay) : coinTag(run.stake)}<small>${GRASS.tiles - run.mines - n} clear left</small></p></div>`
        : run.state === "lost" ? `<div class="bz-hud is-bad"><p class="bz-hud-fig"><small>A wild Voltorb</small><b>Boom</b></p><p class="bz-hud-side">${coinTag(run.stake)}<small>stake lost after ${n} clear</small></p></div>`
        : `<div class="bz-hud is-good"><p class="bz-hud-fig"><small>Cashed out at</small><b>${fmtX(run.mult)}</b></p><p class="bz-hud-side">${coinTag(run.payout)}<small>${n} clear, ${run.mines} Voltorb dodged</small></p></div>`;
      root.innerHTML = `<div class="cs-page bz-page bz-grass">${p.head("Tall Grass")}
        <div class="bz-play">
          <div class="bz-board-wrap"><div class="bz-patch${run && !live ? " is-over" : ""}${ended ? " is-ended" : ""}${ended && run?.state === "lost" ? " is-boom" : ""}">${hud}
            ${live ? safety(mines, n) : picker()}
            <div class="bz-grid${run ? "" : " is-idle"}" style="--n:5">${Array.from({ length: GRASS.tiles }, (_, i) => tile(i)).join("")}</div>
            <div data-ladder>${ladder(mines, live ? n : 0)}</div></div></div>
          <form class="rt-box bz-box bz-controls" data-go>
            ${live ? `<button type="button" class="solid rt-go" data-cash ${n ? "" : "disabled"}>Cash out ${n ? coinTag(pay) : ""}</button>
              <p class="bz-note">${n ? `Or keep walking: the next clear tile takes it to ${fmtX(run.next)}.` : "Every clear tile raises the payout. Hit a Voltorb and the stake is gone."}</p>`
            : `${stakeField("gr-stake", last.stake)}
              <button class="solid rt-go" type="submit">${run ? "Walk in again" : "Walk into the grass"}</button>`}
          </form>
        </div>
        <div data-recent>${recentHTML()}</div>
      </div>`;
      ended = false;
    }
    /** Pick how many Voltorb hide: everything that depends on it follows at once. */
    function setMines(n) {
      last.mines = Math.max(GRASS.minMines, Math.min(GRASS.maxMines, n));
      const put = (sel, text) => { const el = root.querySelector(sel); if (el) el.textContent = text; };
      put("[data-mines-out]", last.mines);
      put("[data-clear-hud]", clearLine(last.mines));
      put("[data-first-hud]", fmtX(grassMultiplier(last.mines, 1)));
      root.querySelectorAll("[data-mines]").forEach((x) => x.classList.toggle("on", Number(x.dataset.mines) === last.mines));
      root.querySelector("[data-ladder]").innerHTML = ladder(last.mines, 0);
    }
    root.addEventListener("click", (e) => {
      if (run?.state === "open") return;
      const pick = e.target.closest("[data-mines]"), step = e.target.closest("[data-mines-step]");
      if (pick) setMines(Number(pick.dataset.mines));
      else if (step) setMines(last.mines + Number(step.dataset.minesStep));
    });
    root.addEventListener("submit", async (e) => {
      if (!e.target.closest("[data-go]")) return;
      e.preventDefault();
      if (p.state.busy) return;
      last.stake = readStake(root, "gr-stake");
      p.state.busy = true;
      try {
        const res = p.apply(await post("/api/casino/beta/grass/start", { stake: last.stake, mines: last.mines, requestId: uuid() }));
        run = res.run;
        fresh = -1;
        paint();
      } catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    root.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-tile]");
      const cash = e.target.closest("[data-cash]");
      if ((!t && !cash) || p.state.busy || run?.state !== "open") return;
      p.state.busy = true;
      t?.classList.add("is-wait");
      try {
        const res = p.apply(t ? await post("/api/casino/beta/grass/tap", { id: run.id, tile: Number(t.dataset.tile) }) : await post("/api/casino/beta/grass/cash", { id: run.id }));
        run = res.run;
        fresh = t ? Number(t.dataset.tile) : -1;
        ended = run.state !== "open";
        if (run.state === "lost") { fresh = run.hit; ctx.buzz?.([60, 40, 90]); }
        else if (t) ctx.buzz?.(12);
        paint();
        if (run.state !== "open") load(true);
      } catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    async function load(quiet) {
      try {
        const res = await api("/api/casino/beta/grass");
        recent = res.recent || [];
        if (!p.visible()) return;
        // After a round the board is mid-reveal: only the list under it changes.
        if (quiet) { const el = root.querySelector("[data-recent]"); if (el) el.innerHTML = recentHTML(); return; }
        run = res.run;
        fresh = -1;
        paint();
      } catch (err) { p.fail(err); }
    }
    return { show() { paint(); load(); } };
  });
}

/** The player's last rounds of a game, as rows. */
function recentRows(rows) {
  if (!rows.length) return "";
  return `<section class="cs-section bz-recent"><h2 class="cs-h">Your last rounds</h2><div class="cs-rows">${rows.map((r) => `<div class="rt-row bz-row${r.won ? " is-won" : ""}">
    <span class="rt-row-lab">${r.won ? fmtX(r.mult) : "Lost"}</span><span class="rt-row-name">${esc(r.line)}<small>Stake ${num(r.stake)}</small></span>
    <span class="rt-row-val">${r.won ? coinTag(r.payout) : ""}</span></div>`).join("")}</div></section>`;
}

// ---- Mystery Tins ------------------------------------------------------------------------
/* The chase cards are the show. Tins sit on five shelves by price (TIN_TIERS), one shelf on screen at a time. On a
   shelf a tin is its three best cards standing in an open tin with its price on the front; a tin's own page
   (/casino/tins/<id>) lines up the chase cards as real faces, then every card with its odds. Opening spins a reel
   of the tin's cards that stops on yours, and the card grows where it landed. A slab tin holds graded slabs. */
const paintOf = (t) => (/^#[0-9a-f]{6}$/i.test(t.color || "") ? t.color : "#00b4c8");
const TIN_CHASE = 6; // how many cards a tin's page shows off as faces
/* The tin itself, drawn here (never a real product's art). The shelf decides the metal: the bargain bin is bare,
   dented steel, then a painted lip, riveted silver, chrome corners, and gold with a latch for the high rollers.
   A slab tin is a hard case with ribs. Lines keep their weight at any size (non-scaling-stroke). */
const NS = `vector-effect="non-scaling-stroke"`;
const TIN_TRIM = {
  bargain: `<path d="M194 10v22l-16-22z" class="bz-t-bare"/><path d="M160 26q12 9 3 22M22 46q8 5 4 14M148 58l24 3M44 24l16 3" class="bz-t-dent" ${NS}/>`,
  budget: `<rect x="62" y="27" width="76" height="30" rx="15" class="bz-t-press" ${NS}/>`,
  mid: `<rect x="62" y="27" width="76" height="30" rx="15" class="bz-t-press" ${NS}/><g class="bz-t-metal" ${NS}><circle cx="18" cy="28" r="3.2"/><circle cx="18" cy="52" r="3.2"/><circle cx="182" cy="28" r="3.2"/><circle cx="182" cy="52" r="3.2"/></g>`,
  high: `<g class="bz-t-metal" ${NS}><path d="M6 44v18a8 8 0 0 0 8 8h22v-9H19a4 4 0 0 1-4-4V44zM194 44v18a8 8 0 0 1-8 8h-22v-9h17a4 4 0 0 0 4-4V44z"/></g><path d="M100 24l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" class="bz-t-press" ${NS}/>`,
  roller: `<path d="M12 22h176M12 58h176" class="bz-t-pin" ${NS}/><g class="bz-t-metal" ${NS}><path d="M6 44v18a8 8 0 0 0 8 8h22v-9H19a4 4 0 0 1-4-4V44zM194 44v18a8 8 0 0 1-8 8h-22v-9h17a4 4 0 0 0 4-4V44z"/></g>`,
};
const tinFront = (t) => `<svg class="bz-tin-front" viewBox="0 0 200 74" preserveAspectRatio="none" aria-hidden="true">
  <path d="M6 9h188v53a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" class="bz-t-body" ${NS}/>
  ${t.slab ? `<path d="M6 30h188v20H6z" class="bz-t-band"/><path d="M34 16v50M56 16v50M144 16v50M166 16v50" class="bz-t-rib" ${NS}/>` : `<path d="M28 9h15L27 70H12z" class="bz-t-sheen"/>`}
  <path d="M6 56h188v6a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" class="bz-t-shade"/>
  ${TIN_TRIM[t.tier] || ""}
  <rect x="2" y="2" width="196" height="12" rx="3.5" class="bz-t-rim" ${NS}/><path d="M10 6.5h52" class="bz-t-glint" ${NS}/>
  ${t.tier === "roller" ? `<path d="M86 3h28v17a6 6 0 0 1-6 6H92a6 6 0 0 1-6-6z" class="bz-t-latch" ${NS}/><circle cx="100" cy="15" r="3.4" class="bz-t-key" ${NS}/>` : ""}</svg>`;
const tinLid = () => `<svg class="bz-tin-lid" viewBox="0 0 200 124" preserveAspectRatio="none" aria-hidden="true">
  <path d="M10 122L24 9a7 7 0 0 1 7-6h138a7 7 0 0 1 7 6l14 113z" class="bz-t-lid" ${NS}/><path d="M26 112L37 17h126l11 95" class="bz-t-lidline" ${NS}/>
  <rect x="20" y="1.5" width="160" height="10" rx="3.5" class="bz-t-rim" ${NS}/></svg>`;
/** The hub's picture of the game: a tin with three cards standing in it. */
ART.tins = `<svg viewBox="0 0 70 70" aria-hidden="true"><g stroke="var(--k0)" stroke-width="2.5" stroke-linejoin="round"><path d="M11 60L15 26h40l4 34z" fill="var(--k-3)"/><rect x="9" y="17" width="20" height="28" rx="2" fill="var(--box)" transform="rotate(-12 19 31)"/><rect x="41" y="17" width="20" height="28" rx="2" fill="var(--box)" transform="rotate(12 51 31)"/><rect x="23" y="6" width="24" height="34" rx="2" fill="var(--box)"/><rect x="27" y="11" width="16" height="12" fill="var(--cy)" stroke-width="2"/><path d="M6 44h58v15a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" fill="var(--yel)"/><rect x="4" y="40" width="62" height="7" rx="2" fill="var(--box)"/></g></svg>`;

function tinsPage(ctx, root) {
  return page(ctx, root, "tins", (p) => {
    let tins = null;
    let recent = [];
    let viewId = ""; // the tin whose page is open ("" = the shelves)
    let shelf = TIN_TIERS[0].id; // the shelf on screen
    let stage = null; // { phase: 'reel'|'landed', cards } while tins are being opened
    let count = 1; // how many tins the key opens at once (up to TIN_MAX_OPEN)
    const full = new Map(); // card id -> the catalog's card, once its set has loaded (ctx.cardsById)
    const asked = new Set();
    const pct = (o) => (o >= 0.01 ? `${(o * 100).toFixed(o >= 0.1 ? 0 : 1)}%` : o >= 0.0001 ? `${(o * 100).toFixed(2)}%` : `1 in ${Math.round(1 / o).toLocaleString("en-US")}`);
    const oneIn = (o) => (o >= 0.5 ? pct(o) : `1 in ${Math.max(2, Math.round(1 / o)).toLocaleString("en-US")}`);
    const big = (t, c) => c.price >= t.price * 3;
    const shortName = (t) => t.name.replace(/( high roller)? tin$/i, "");
    const tinOf = (id) => tins?.find((t) => t.id === id) || null;
    const tierOf = (t) => TIN_TIERS.find((x) => x.id === t.tier) || TIN_TIERS[TIN_TIERS.length - 1];
    const backOf = (t) => Math.round((t.back || 0) * 100);
    /** What a card in a tin is called: a slab says its grade. */
    const label = (c) => (c.grade ? `${c.name}, RIP ${c.grade}` : c.name);

    /** A card on show: the real face with its foil when the catalog has it, the plain picture until then. A slab
        tin's card sits in its slab. */
    const faceInner = (c, large) => {
      const card = full.get(c.id);
      const inner = card && ctx.tcgFace ? ctx.tcgFace(card, { small: !large, stamp: false }) : `<img class="bz-face-img" src="${esc(c.image || "")}" alt="${esc(c.name || "")}" decoding="async" />`;
      return c.grade ? slabHTML({ face: inner, card: card || { name: c.name, number: c.number, rarity: c.rarity }, slab: { grade: c.grade }, size: "grid" }) : inner;
    };
    const face = (c, large = false) => `<span class="bz-face" data-face="${esc(c.id)}"${c.grade ? ` data-grade="${c.grade}"` : ""} data-name="${esc(c.name)}" data-img="${esc(c.image || "")}"${large ? " data-large" : ""}>${faceInner(c, large)}</span>`;
    /** Fetch the real cards for these briefs, then swap the faces already on screen. */
    async function lightFaces(cards) {
      const ids = cards.map((c) => c.id).filter((id) => !asked.has(id));
      if (!ids.length || !ctx.cardsById) return;
      ids.forEach((id) => asked.add(id));
      try { for (const [id, card] of await ctx.cardsById(ids)) full.set(id, card); } catch { return; }
      for (const el of root.querySelectorAll("[data-face]")) {
        if (!ids.includes(el.dataset.face) || !full.has(el.dataset.face) || el.querySelector(".tcg")) continue;
        const c = { id: el.dataset.face, name: el.dataset.name || "", image: el.dataset.img || "", grade: Number(el.dataset.grade) || 0 };
        el.innerHTML = faceInner(c, el.hasAttribute("data-large"));
      }
    }

    // ---- The shelves: a tin is its three best cards standing in the open tin, its price on the front.
    const tinArt = (t) => `<span class="bz-tinart" data-tier="${esc(t.tier)}"${t.slab ? " data-slab" : ""} style="--paint:${paintOf(t)}">
      ${tinLid()}
      ${t.cards[1] ? `<span class="bz-fan-card is-l">${face(t.cards[1])}</span>` : ""}
      ${t.cards[2] ? `<span class="bz-fan-card is-r">${face(t.cards[2])}</span>` : ""}
      <span class="bz-fan-card is-c">${face(t.cards[0])}</span>
      ${tinFront(t)}<span class="bz-tin-tag">${coinTag(t.price)}</span></span>`;
    const tinTile = (t) => `<a class="rt-box bz-tin" href="/casino/tins/${esc(t.id)}" data-bt-link data-tier="${esc(t.tier)}" aria-label="${esc(t.name)}, ${num(t.price)} coins">
      <span class="bz-tin-well">${tinArt(t)}</span>
      <span class="bz-tin-copy"><b>${esc(shortName(t))}</b>
        <span class="bz-tin-top"><small>Top card</small>${coinTag(t.cards[0].price)}</span>
        <small class="bz-tin-odds">${oneIn(t.cards[0].odds)}</small></span></a>`;
    const recentHTML = () => (recent.length ? `<section class="cs-section bz-recent"><h2 class="cs-h">Your last tins</h2><div class="cs-rows">${recent.map((r) => `<div class="rt-row bz-row${r.card.price >= r.price ? " is-won" : ""}"><span class="rt-row-lab">${esc(r.tinName.replace(/( high roller)? tin$/i, ""))}</span><span class="rt-row-name">${esc(label(r.card))}<small>Paid ${num(r.price)}</small></span><span class="rt-row-val">${coinTag(r.card.price)}</span></div>`).join("")}</div></section>` : "");
    const tabWord = (tier) => tier.name.replace(/ bin$/, "").replace(/^High roller$/, "Roller");
    /** One shelf: what it costs, what comes back, and its tins. */
    const shelfBody = () => {
      const tier = TIN_TIERS.find((x) => x.id === shelf) || TIN_TIERS[0];
      const list = tins.filter((t) => t.tier === tier.id).sort((a, b) => a.price - b.price);
      if (!list.length) return `<p class="rt-empty bz-note">Nothing on this shelf right now.</p>`;
      const lo = Math.min(...list.map((t) => t.price));
      const hi = Math.max(...list.map((t) => t.price));
      const back = Math.round((list.reduce((sum, t) => sum + (t.back || 0), 0) / list.length) * 100);
      return `<section class="bz-shelf" data-tier="${esc(tier.id)}" aria-label="${esc(tier.name)}">
        <div class="bz-shelf-head"><h2 class="bz-shelf-name">${esc(tier.name)}</h2><span class="bz-shelf-odds">${esc(tier.odds)}</span>
          <p class="bz-note">${lo === hi ? `${num(lo)} ${lo === 1 ? "coin" : "coins"}` : `${num(lo)} to ${num(hi)} coins`} a tin. ${esc(tier.line)}</p>
          <div class="rt-hp bz-back" data-level="${back >= 88 ? "ok" : back >= 72 ? "mid" : "low"}"><em>${back}% comes back on average</em><span class="rt-track"><i style="--fill:${(back / 100).toFixed(2)}"></i></span></div></div>
        <div class="bz-tin-list">${list.map(tinTile).join("")}</div></section>`;
    };
    const shelfHTML = () => `<p class="bz-lede">Pick a shelf, pick a tin, spin it open. The card you land on is yours.</p>
      <div class="bz-tiers" role="tablist" aria-label="Shelves">${TIN_TIERS.map((tier) => `<button type="button" role="tab" class="rt-word${tier.id === shelf ? " on" : ""}" data-shelf="${esc(tier.id)}" aria-selected="${tier.id === shelf}">${esc(tabWord(tier))}</button>`).join("")}</div>
      <div data-shelfbody>${!tins ? `<div class="rt-skel bz-skel"></div>` : shelfBody()}</div>${recentHTML()}`;
    const lightShelf = () => { if (tins) lightFaces(tins.filter((t) => t.tier === shelf).flatMap((x) => x.cards.slice(0, 3))); };

    // ---- A tin's page: the chase cards as faces, the key, the odds in three figures, every card and its odds.
    const chaseHTML = (t) => `<div class="bz-chase${t.slab ? " is-slabs" : ""}" role="list">${t.cards.slice(0, TIN_CHASE).map((c, i) => `<figure class="bz-chase-card" role="listitem">
        <button type="button" class="bz-chase-face" data-look="${esc(c.id)}" aria-label="Look at ${esc(label(c))}">${face(c, true)}</button>
        <figcaption><b>${esc(c.name)}</b><span>${coinTag(c.price)}</span><small>${i === 0 ? "Top card, " : ""}${c.grade ? `RIP ${c.grade}, ` : ""}${oneIn(c.odds)}</small></figcaption></figure>`).join("")}</div>`;
    /** What one landed card was: its plate and figure. Several cards get a row each and one total. */
    const revealHTML = (t, cards) => {
      const where = t.slab ? "In your slab case" : "Added to your collection";
      if (cards.length === 1) {
        const card = cards[0];
        return `<div class="bz-reveal">
          <div class="bz-reveal-plate${big(t, card) ? " is-hit" : ""}"><b>${esc(card.name)}</b><span>${card.grade ? `RIP ${card.grade}, ` : ""}${esc(card.rarity || "")}${card.setName ? `, ${esc(card.setName)}` : ""}</span></div>
          <p class="bz-reveal-fig">${coinTag(card.price)} <small>${card.price >= t.price ? `${(card.price / t.price).toFixed(1)}x what you paid` : where}</small></p></div>`;
      }
      const total = cards.reduce((sum, c) => sum + c.price, 0);
      const paid = t.price * cards.length;
      return `<div class="bz-reveal is-many">
        <div class="cs-rows bz-reveal-rows">${cards.map((c) => `<div class="rt-row bz-row${big(t, c) ? " is-hit" : c.price >= t.price ? " is-won" : ""}"><span class="rt-row-name">${esc(c.name)}<small>${c.grade ? `RIP ${c.grade}, ` : ""}${esc(c.rarity || "")}</small></span><span class="rt-row-val">${coinTag(c.price)}</span></div>`).join("")}</div>
        <p class="bz-reveal-fig">${coinTag(Math.round(total * 100) / 100)} <small>${total >= paid ? `${(total / paid).toFixed(1)}x what you paid` : `from ${cards.length} tins, ${t.slab ? "all in your slab case" : "all in your collection"}`}</small></p></div>`;
    };
    const stageHTML = (t) => (stage ? `<section class="bz-stage is-reel is-n${stage.cards.length}${t.slab ? " is-slabs" : ""}" aria-live="polite">${stage.cards.map(() => `<div class="bz-reel-wrap"><div class="bz-reel"></div></div>`).join("")}</section>` : chaseHTML(t));
    const keysHTML = (t) => {
      const again = stage?.phase === "landed";
      const n = Math.min(count, TIN_MAX_OPEN);
      return `<div class="bz-view-keys">
        <div class="bz-count" role="group" aria-label="How many tins to open"><span>Open</span>${Array.from({ length: TIN_MAX_OPEN }, (_, i) => `<button type="button" class="rt-word${i + 1 === n ? " on" : ""}" data-count="${i + 1}" aria-pressed="${i + 1 === n}">${i + 1}</button>`).join("")}<span>at once</span></div>
        <button type="button" class="solid rt-go" data-open="${esc(t.id)}" data-n="${n}">${again ? "Open " + (n > 1 ? `${n} more` : "another") : n > 1 ? `Open ${n}` : "Open"} for ${coinTag(Math.round(t.price * n * 100) / 100)}</button>
        ${again ? `<button type="button" class="ghost" data-close>Back to the chase cards</button>` : ""}</div>`;
    };
    /** The odds, said three ways: what comes back, how often a tin pays for itself, how rare the top card is. */
    const statsHTML = (t) => {
      const beat = t.cards.filter((c) => c.price >= t.price);
      const chance = beat.reduce((sum, c) => sum + c.odds, 0);
      const tier = tierOf(t);
      return `<dl class="rt-box bz-stats" aria-label="This tin's odds">
        <div><dt>Comes back</dt><dd>${backOf(t)}%</dd></div>
        <div><dt>Beats the price</dt><dd>${chance > 0 ? oneIn(chance) : "Never"}</dd></div>
        <div><dt>Top card</dt><dd>${oneIn(t.cards[0].odds)}</dd></div></dl>
        <p class="bz-note bz-stats-note">${esc(tier.name)} shelf, ${esc(tier.odds.toLowerCase())}. ${beat.length} of the ${t.cards.length} ${t.slab ? "slabs" : "cards"} inside are worth more than the tin.</p>`;
    };
    const cell = (c) => `<button type="button" class="bz-cell" data-look="${esc(c.id)}"><span class="bz-cell-pic"><img src="${esc(c.image)}" alt="" loading="lazy" decoding="async" />${c.grade ? `<i class="bz-grade" data-g="${c.grade}">${c.grade}</i>` : ""}</span>
      <b>${esc(c.name)}</b><small>${esc(c.setName || "")}${c.number ? ` ${esc(c.number)}` : ""}</small><span class="bz-cell-fig"><i>${pct(c.odds)}</i>${coinTag(c.price)}</span></button>`;
    const viewHTML = (t) => `<div class="bz-view" data-tier="${esc(t.tier)}" style="--paint:${paintOf(t)}">
      <div class="bz-view-head"><a class="bz-view-back" href="/casino/tins" data-bt-link>All tins</a>
        <h2 class="bz-view-name">${esc(t.name)}</h2><p class="bz-note">${esc(t.line || "")} ${t.cards.length} ${t.slab ? "slabs" : "cards"} inside.</p></div>
      <div class="bz-view-show" data-stage>${stageHTML(t)}</div>
      <div data-keys>${keysHTML(t)}</div>
      ${statsHTML(t)}
      <section class="cs-section bz-all"><h2 class="cs-h">All ${t.cards.length} ${t.slab ? "slabs" : "cards"} and odds</h2><div class="bz-cards">${t.cards.map(cell).join("")}</div></section></div>`;

    function paint() {
      const t = viewId ? tinOf(viewId) : null;
      if (t) shelf = t.tier; // "All tins" goes back to the shelf this tin sits on
      root.innerHTML = `<div class="cs-page bz-page bz-tins">${p.head("Mystery Tins")}
        ${viewId && !tins ? `<div class="rt-skel bz-skel"></div>` : t ? viewHTML(t) : shelfHTML()}</div>`;
      if (t) lightFaces(t.cards.slice(0, TIN_CHASE));
      else lightShelf();
    }
    const paintView = () => {
      const t = tinOf(viewId);
      const el = root.querySelector("[data-stage]");
      if (!t || !el) return paint();
      el.innerHTML = stageHTML(t);
      root.querySelector("[data-keys]").innerHTML = keysHTML(t);
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    /** The spin: a strip of the tin's cards, picked at their real odds, runs under the marker and stops on yours. */
    async function spin(tin, cards) {
      const moving = ctx.motion();
      stage = { phase: "reel", cards };
      paintView();
      const box = root.querySelector(".bz-stage");
      box?.scrollIntoView?.({ block: "start", behavior: moving ? "smooth" : "auto" });
      const pick = () => { let u = Math.random(); for (const c of tin.cards) { if (u < c.odds) return c; u -= c.odds; } return tin.cards[tin.cards.length - 1]; };
      await lightFaces(cards);
      // Every reel starts together; each stops a beat after the one above it.
      const reels = [...root.querySelectorAll(".bz-reel")].map((reel, n) => {
        const card = cards[n];
        const strip = Array.from({ length: 36 }, pick);
        // A chase card or two always goes by, so the spin shows what the tin holds.
        strip[9] = tin.cards[Math.floor(Math.random() * Math.min(3, tin.cards.length))];
        strip[31] = tin.cards[Math.floor(Math.random() * Math.min(TIN_CHASE, tin.cards.length))];
        strip[30] = card;
        reel.innerHTML = strip.map((c, i) => `<span class="bz-reel-card${i === 30 ? " is-won" : ""}"><img src="${esc(c.image)}" alt="" decoding="async" />${c.grade ? `<i class="bz-grade" data-g="${c.grade}">${c.grade}</i>` : ""}</span>`).join("");
        return { reel, card, item: reel.children[30], n };
      });
      await Promise.all(reels.map(async ({ reel, card, item, n }) => {
        // Stop a little off centre, like a wheel does, but always well inside the card.
        const off = (Math.random() - 0.5) * item.offsetWidth * 0.5;
        const target = item.offsetLeft + item.offsetWidth / 2 - reel.parentElement.clientWidth / 2;
        if (moving) {
          await reel.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-(target + off)}px)` }], { duration: 4400 + n * 550, easing: "cubic-bezier(.1,.62,.1,1)", fill: "forwards" }).finished.catch(() => {});
          await reel.animate([{ transform: `translateX(${-(target + off)}px)` }, { transform: `translateX(${-target}px)` }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }).finished.catch(() => {});
        } else reel.style.transform = `translateX(${-target}px)`;
        // The card grows where it landed, as the real face with its foil, and lights itself.
        item.innerHTML = `<button type="button" class="bz-chase-face" data-look="${esc(card.id)}" aria-label="Look at ${esc(label(card))}">${face(card, cards.length === 1)}</button>`;
        reel.parentElement.classList.add("is-landed");
        if (big(tin, card)) reel.parentElement.classList.add("is-hit");
        item.classList.add("is-land");
        ctx.presentFace?.(item.querySelector(".tcg"));
        if (big(tin, card)) ctx.buzz?.(cards.length > 1 ? [40, 30, 40] : [40, 30, 40, 30, 80]);
      }));
      box.classList.replace("is-reel", "is-landed");
      if (moving) await wait(450);
      stage = { phase: "landed", cards };
      if (cards.length === 1 && big(tin, cards[0])) box.classList.add("is-hit");
      box.insertAdjacentHTML("beforeend", revealHTML(tin, cards));
    }

    root.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) { stage = null; paintView(); return; }
      const look = e.target.closest("[data-look]");
      if (look) {
        try { await ctx.cardsById?.([look.dataset.look]); ctx.inspect?.({ id: look.dataset.look }); } catch { /* the picture is still there */ }
        return;
      }
      const pickShelf = e.target.closest("[data-shelf]");
      if (pickShelf && tins && !viewId) {
        shelf = pickShelf.dataset.shelf;
        for (const b of root.querySelectorAll("[data-shelf]")) { const on = b === pickShelf; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); }
        root.querySelector("[data-shelfbody]").innerHTML = shelfBody();
        lightShelf();
        return;
      }
      const pickCount = e.target.closest("[data-count]");
      if (pickCount && !p.state.busy) {
        count = Math.max(1, Math.min(TIN_MAX_OPEN, Number(pickCount.dataset.count) || 1));
        const t = tinOf(viewId);
        if (t) root.querySelector("[data-keys]").innerHTML = keysHTML(t);
        return;
      }
      const b = e.target.closest("[data-open]");
      if (!b || p.state.busy) return;
      const tin = tinOf(b.dataset.open);
      if (!tin) return;
      p.state.busy = true;
      root.querySelectorAll("[data-open]").forEach((x) => (x.disabled = true));
      try {
        const n = Math.max(1, Math.min(TIN_MAX_OPEN, Number(b.dataset.n) || 1)); // the shelf's key opens one
        const res = await post("/api/casino/beta/tins/open", { tin: tin.id, price: tin.price, count: n, requestId: uuid() });
        const runs = res.runs || [res.run];
        // Opening from the shelf moves to the tin's own page, where the spin plays.
        if (viewId !== tin.id) { viewId = tin.id; ctx.navigate(`/casino/tins/${tin.id}`); paint(); window.scrollTo?.(0, 0); }
        await spin(tin, runs.map((r) => r.card));
        p.apply(res);
        ctx.invalidateCards?.();
        recent = [...runs, ...recent].slice(0, 8);
        root.querySelector("[data-keys]").innerHTML = keysHTML(tin);
      } catch (err) { p.fail(err); stage = null; paintView(); } finally {
        p.state.busy = false;
        root.querySelectorAll("[data-open]").forEach((x) => (x.disabled = false));
      }
    });
    async function load() {
      try {
        const res = await api("/api/casino/beta/tins");
        tins = res.tins;
        recent = res.recent || [];
        if (viewId && !tinOf(viewId)) viewId = "";
        if (p.visible() && !p.state.busy) paint();
      } catch (err) { p.fail(err); }
    }
    return {
      show(id) {
        if (p.state.busy) return;
        const first = !tins;
        viewId = id || "";
        stage = null;
        paint();
        window.scrollTo?.(0, 0);
        if (first || !viewId) load();
      },
    };
  });
}

/** Every beta page, keyed like the casino's routes. */
export function createBetaPages(ctx, roots) {
  return {
    beta: homePage(ctx, roots.beta),
    grass: grassPage(ctx, roots.grass),
    tins: tinsPage(ctx, roots.tins),
  };
}
export const BETA_KEYS = ["beta", "grass", "tins"];
export { ART as BETA_ART };
