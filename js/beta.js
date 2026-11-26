/* BETA TESTING: the casino's invite-only games (worker/beta.js settles every one).

   /casino/beta     join with an invite code, the perks, the games; the owner makes codes here
   /casino/grass    Tall Grass: clear tiles, dodge the Voltorb, cash out
   /casino/rocket   Rocket: one shared round, cash out before the pop
   /casino/tins     Mystery Tins: a themed tin, one card out

   The page only asks and shows. Every stake, roll and payout is the Worker's. */
import { api, esc, coinTag, uuid } from "./casino-kit.js";
import { BETA_GAMES, BETA_RULES, GRASS, ROCKET, TIN_MAX_OPEN, rocketAt, grassMultiplier } from "./beta-rules.js?v=2";

const fmtX = (m) => `${Number(m || 0).toFixed(2)}x`;
const num = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });

// ---- Art ---------------------------------------------------------------------------------
const VOLTORB = `<svg class="bz-voltorb" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="var(--hp-low)" stroke="var(--k0)" stroke-width="2.5"/><path d="M4 20a16 16 0 0 0 32 0z" fill="#fff" stroke="var(--k0)" stroke-width="2.5"/><path d="M11 15l7 3M29 15l-7 3" stroke="var(--k0)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const ART = {
  grass: `<svg viewBox="0 0 70 70" aria-hidden="true"><g stroke="var(--k0)" stroke-width="2.5"><rect x="4" y="4" width="18" height="18" fill="var(--hp)"/><rect x="26" y="4" width="18" height="18" fill="var(--hp)"/><rect x="48" y="4" width="18" height="18" fill="var(--box)"/><rect x="4" y="26" width="18" height="18" fill="var(--box)"/><rect x="26" y="26" width="18" height="18" fill="var(--hp)"/><rect x="48" y="26" width="18" height="18" fill="var(--hp)"/><rect x="4" y="48" width="18" height="18" fill="var(--hp)"/><rect x="26" y="48" width="18" height="18" fill="var(--hp-low)"/><rect x="48" y="48" width="18" height="18" fill="var(--hp)"/></g></svg>`,
  rocket: `<svg viewBox="0 0 70 70" aria-hidden="true"><path d="M6 64 C30 62 46 44 60 10" stroke="var(--cy-2)" stroke-width="3.5" fill="none"/><path d="M6 66H66M6 66V6" stroke="var(--k)" stroke-width="2.5"/><circle cx="60" cy="10" r="5" fill="var(--yel)" stroke="var(--k0)" stroke-width="2"/></svg>`,
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
          <p class="bz-note">Three games to try: ${BETA_GAMES.map((g) => esc(g.title)).join(", ")}. Free play with virtual coins, like the rest of the casino.</p></section>`}
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
/* A patch of tall grass, five by five. Each clear tile is cut down and stamped with the multiplier it took you to;
   the big figure over the field is what cashing out pays now, and the ladder under it is what the next tiles pay. */
const TUFT = `<svg class="bz-tuft" viewBox="0 0 40 40" aria-hidden="true"><path d="M5 37c1-9 3-15 6-21 1 7 2 11 3 15 1-10 3-18 6-25 2 8 3 16 4 24 1-5 3-10 6-14 1 7 2 14 5 21z"/></svg>`;
const STUBBLE = `<svg class="bz-stubble" viewBox="0 0 40 12" aria-hidden="true"><path d="M3 11l2-7 3 7 3-9 3 9 3-7 3 7 3-9 3 9 3-6 3 6 3-7 2 7z"/></svg>`;
function grassPage(ctx, root) {
  return page(ctx, root, "grass", (p) => {
    let run = null;
    let recent = [];
    let last = { stake: 10, mines: 3 };
    let fresh = -1; // the tile the last tap turned over: only it animates
    const tile = (i) => {
      const at = run?.open?.indexOf(i) ?? -1;
      const open = at >= 0;
      const volt = run?.voltorb?.includes(i);
      const hit = run?.hit === i;
      const live = run?.state === "open";
      const cls = open ? "is-open" : volt ? `is-volt${hit ? " is-hit" : ""}` : run && !live ? "is-left" : "";
      const inner = volt ? VOLTORB : open ? `${STUBBLE}<b>${fmtX(grassMultiplier(run.mines, at + 1))}</b>` : TUFT;
      return `<button type="button" class="bz-tile ${cls}${fresh === i ? " is-new" : ""}" data-tile="${i}" ${live && !open ? "" : "disabled"} aria-label="Tile ${i + 1}${open ? ", clear" : volt ? ", Voltorb" : ""}">${inner}</button>`;
    };
    /** What the next clear tiles pay, the very next one first. */
    const ladder = (mines, n) => {
      const left = GRASS.tiles - mines - n;
      const steps = Array.from({ length: Math.min(5, left) }, (_, k) => grassMultiplier(mines, n + k + 1));
      return steps.length ? `<p class="bz-ladder" aria-label="What the next clear tiles pay"><small>Next</small>${steps.map((m, k) => `<span class="${k ? "" : "is-next"}">${fmtX(m)}</span>`).join("")}</p>` : `<p class="bz-ladder"><small>The field is clear. Cash out.</small></p>`;
    };
    function paint() {
      const live = run?.state === "open";
      const n = run?.open?.length || 0;
      const pay = live ? Math.min(BETA_RULES.maxWin, Math.floor(run.stake * run.mult * 100) / 100) : 0;
      const mines = run ? run.mines : last.mines;
      const hud = !run ? `<div class="bz-hud"><p class="bz-hud-fig"><small>Tall grass</small><b>${GRASS.tiles - last.mines} clear</b></p><p class="bz-hud-side"><span data-mines-hud>${last.mines}</span> Voltorb hiding</p></div>`
        : live ? `<div class="bz-hud is-live"><p class="bz-hud-fig"><small>${n ? "Cash out now for" : "Tap a tile"}</small><b>${n ? fmtX(run.mult) : "1.00x"}</b></p><p class="bz-hud-side">${n ? coinTag(pay) : coinTag(run.stake)}<small>${run.mines} Voltorb, ${GRASS.tiles - run.mines - n} clear left</small></p></div>`
        : run.state === "lost" ? `<div class="bz-hud is-bad"><p class="bz-hud-fig"><small>A wild Voltorb</small><b>Boom</b></p><p class="bz-hud-side">${coinTag(run.stake)}<small>stake lost after ${n} clear</small></p></div>`
        : `<div class="bz-hud is-good"><p class="bz-hud-fig"><small>Cashed out at</small><b>${fmtX(run.mult)}</b></p><p class="bz-hud-side">${coinTag(run.payout)}<small>${n} clear, ${run.mines} Voltorb dodged</small></p></div>`;
      root.innerHTML = `<div class="cs-page bz-page bz-grass">${p.head("Tall Grass")}
        <div class="bz-play">
          <div class="bz-board-wrap"><div class="bz-patch${run && !live ? " is-over" : ""}">${hud}
            <div class="bz-grid" style="--n:5">${Array.from({ length: GRASS.tiles }, (_, i) => tile(i)).join("")}</div>
            <div data-ladder>${ladder(mines, live ? n : 0)}</div></div></div>
          <form class="rt-box bz-box bz-controls" data-go>
            ${live ? `<button type="button" class="solid rt-go" data-cash ${n ? "" : "disabled"}>Cash out ${n ? coinTag(pay) : ""}</button>
              <p class="bz-note">${n ? `Or keep walking: the next clear tile takes it to ${fmtX(run.next)}.` : "Every clear tile raises the payout. Hit a Voltorb and the stake is gone."}</p>`
            : `${stakeField("gr-stake", last.stake)}
              <label class="bz-field"><span>Voltorb in the grass <b data-mines-out>${last.mines}</b></span><input class="bz-range" type="range" name="mines" min="${GRASS.minMines}" max="${GRASS.maxMines}" value="${last.mines}" /></label>
              <p class="bz-note">More Voltorb, bigger steps. Cash out any time after your first clear tile.</p>
              <button class="solid rt-go" type="submit">${run ? "Walk in again" : "Walk into the grass"}</button>`}
          </form>
        </div>
        ${recentRows(recent.map((r) => ({ won: r.state === "cashed", line: `${r.mines} Voltorb, ${r.open.length} clear`, mult: r.mult, stake: r.stake, payout: r.payout })))}
      </div>`;
    }
    root.addEventListener("input", (e) => {
      if (e.target.name === "mines") {
        last.mines = Number(e.target.value);
        root.querySelector("[data-mines-out]").textContent = last.mines;
        const hud = root.querySelector("[data-mines-hud]");
        if (hud) { hud.textContent = last.mines; hud.closest(".bz-hud").querySelector("b").textContent = `${GRASS.tiles - last.mines} clear`; }
        if (run?.state !== "open") root.querySelector("[data-ladder]").innerHTML = ladder(last.mines, 0);
      }
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
        if (run.state === "lost") { fresh = run.hit; ctx.buzz?.([60, 40, 90]); }
        else if (t) ctx.buzz?.(12);
        if (run.state !== "open") load(true);
        paint();
      } catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    async function load(quiet) {
      try {
        const res = await api("/api/casino/beta/grass");
        if (!quiet) { run = res.run; fresh = -1; }
        recent = res.recent || [];
        if (p.visible()) paint();
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

// ---- Rocket ------------------------------------------------------------------------------
/* The sky is a chart: the rocket climbs a fixed flight path as the multiplier grows (the far end is 10x), past
   markers for 1.5x, 2x, 3x and 5x, and bursts where the round pops. Only transforms move. */
const SHIP = `<svg viewBox="0 0 64 36" aria-hidden="true"><path class="bz-flame" d="M17 18 2 9l6 9-6 9z" fill="var(--yel)" stroke="var(--k0)" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M13 6l11 6v12l-11 6z" fill="var(--hp-low)" stroke="var(--k0)" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M18 8h22c10 0 18 6 21 10-3 4-11 10-21 10H18z" fill="#fff" stroke="var(--k0)" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M47 9.600c6 1.700 10.500 5 13.500 8.400-3 3.400-7.500 6.700-13.500 8.400z" fill="var(--hp-low)"/><circle cx="33" cy="18" r="4.500" fill="var(--cy)" stroke="var(--k0)" stroke-width="2.500"/></svg>`;
const BURST = `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 2l6 14 13-8-4 15 14 3-12 8 9 12-15-2-2 15-9-12-9 12-2-15-15 2 9-12-12-8 14-3-4-15 13 8z" fill="var(--yel)" stroke="var(--k0)" stroke-width="2.500" stroke-linejoin="round"/></svg>`;
const ARC = [[13, 90], [64, 90], [93, 12]]; // the flight path, in % of the sky: start, pull, end
const arcAt = (t) => ARC[0].map((_, k) => (1 - t) ** 2 * ARC[0][k] + 2 * t * (1 - t) * ARC[1][k] + t * t * ARC[2][k]);
const arcT = (m) => Math.min(1, Math.log(Math.max(1, m)) / Math.log(10));
function rocketPage(ctx, root) {
  return page(ctx, root, "rocket", (p) => {
    let data = null;
    let timer = 0;
    let raf = 0;
    let stake = 10;
    let auto = 2;
    let painted = "";
    const phase = () => {
      if (!data) return "";
      const now = ctx.clock.now();
      if (data.round.phase === "popped") return "popped";
      return now < data.round.launchAt ? "betting" : "flying";
    };
    function figure() {
      const el = root.querySelector("[data-rk-fig]");
      const sky = root.querySelector(".bz-sky");
      if (!p.visible()) return;
      if (!el || !data) { raf = requestAnimationFrame(figure); return; }
      const ph = phase();
      const now = ctx.clock.now();
      let m = 1;
      if (ph === "popped") m = data.round.crash;
      else if (ph === "flying") m = rocketAt(now - data.round.launchAt);
      el.textContent = ph === "betting" ? `${Math.max(0, Math.ceil((data.round.launchAt - now) / 1000))}s` : fmtX(m);
      // The rocket rides the flight path with the log of the multiplier, nose along the curve: transform only.
      if (sky) {
        const t = arcT(m);
        const w = sky.clientWidth, hgt = sky.clientHeight;
        const [x, y] = arcAt(t);
        const [x2, y2] = arcAt(Math.min(1, t + 0.02)), [x1, y1] = arcAt(Math.max(0, t - 0.02));
        const turn = Math.atan2(((y2 - y1) * hgt) / 100, ((x2 - x1) * w) / 100);
        const at = `translate(${((x * w) / 100).toFixed(1)}px, ${((y * hgt) / 100).toFixed(1)}px) translate(-50%, -50%)`;
        const ship = sky.querySelector(".bz-ship"), burst = sky.querySelector(".bz-burst");
        if (ship) ship.style.transform = `${at} rotate(${turn.toFixed(3)}rad)`;
        if (burst) burst.style.transform = at;
        sky.classList.toggle("is-max", ph === "flying" && t >= 1);
        const fuse = sky.querySelector("[data-rk-fuse]");
        if (fuse) fuse.style.transform = `scaleX(${ph === "betting" ? Math.max(0, Math.min(1, (data.round.launchAt - now) / ROCKET.betMs)).toFixed(3) : 0})`;
      }
      const cash = root.querySelector("[data-rk-cash]");
      if (cash && data.mine?.status === "open" && ph === "flying") cash.innerHTML = `Cash out ${coinTag(Math.floor(data.mine.stake * Math.min(m, data.mine.auto) * 100) / 100)}`;
      if (phase() !== painted) paint();
      raf = requestAnimationFrame(figure);
    }
    const betRow = (b) => `<div class="rt-row bz-row${b.status === "won" ? " is-won" : ""}${b.mine ? " is-mine" : ""}"><span class="rt-row-lab">${b.cashed ? fmtX(b.cashed) : b.status === "lost" ? "Popped" : "In"}</span>
      <span class="rt-row-name">${esc(b.name)}${b.mine ? " (you)" : ""}<small>Stake ${num(b.stake)}${b.mine && b.auto ? `, auto ${fmtX(b.auto)}` : ""}</small></span><span class="rt-row-val">${b.status === "won" ? coinTag(b.payout) : ""}</span></div>`;
    function paint() {
      const ph = phase();
      painted = ph;
      const mine = data?.mine;
      const controls = !data ? "" : ph === "betting" && !mine ? `${stakeField("rk-stake", stake)}
          <label class="bz-field"><span>Auto cash-out</span><input id="rk-auto" class="bz-input" type="number" inputmode="decimal" min="${ROCKET.minAuto}" max="${ROCKET.maxMult}" step="0.01" value="${auto}" /></label>
          <div class="bz-autos" role="group" aria-label="Quick auto cash-out">${[1.5, 2, 3, 5, 10].map((a) => `<button type="button" class="rt-word${Number(auto) === a ? " on" : ""}" data-auto="${a}">${a}x</button>`).join("")}</div>
          <button class="solid rt-go" type="submit">Join this round</button>`
        : mine?.status === "open" && ph === "flying" ? `<button type="button" class="solid rt-go" data-rk-cash>Cash out</button><p class="bz-note">Auto cash-out at ${fmtX(mine.auto)}.</p>`
        : mine ? `<p class="bz-status ${mine.status === "won" ? "is-good" : mine.status === "lost" ? "is-bad" : ""}">${mine.status === "won" ? `You cashed out at ${fmtX(mine.cashed)} for ${coinTag(mine.payout)}.` : mine.status === "lost" ? "It popped before you cashed out." : `You're in with ${coinTag(mine.stake)}, auto at ${fmtX(mine.auto)}.`}</p>`
        : `<p class="bz-note">${ph === "flying" ? "This round is in the air. Bets open again when it pops." : "Next round soon."}</p>`;
      root.innerHTML = `<div class="cs-page bz-page bz-rocket">${p.head("Rocket")}
        <div class="bz-play"><div class="bz-board-wrap">
          <div class="bz-sky is-${ph}">
            <svg class="bz-arc" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M${ARC[0]} Q${ARC[1]} ${ARC[2]}" vector-effect="non-scaling-stroke"/></svg>
            ${[1.5, 2, 3, 5, 10].map((m) => { const [x, y] = arcAt(arcT(m)); return `<span class="bz-mark" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"><i></i>${m}x</span>`; }).join("")}
            <span class="bz-ship" aria-hidden="true">${SHIP}</span><span class="bz-burst" aria-hidden="true">${BURST}</span>
            <p class="bz-mult"><small>${ph === "betting" ? "Launch in" : ph === "popped" ? "Popped at" : "Flying"}</small><b data-rk-fig>-</b></p>
            <span class="bz-fuse" aria-hidden="true"><i data-rk-fuse></i></span></div>
          <p class="bz-hist" aria-label="Last rounds"><small>Last rounds</small>${(data?.history || []).map((h) => `<span class="${h.crash >= 2 ? "is-hi" : ""}">${fmtX(h.crash)}</span>`).join("")}</p>
        </div>
        <form class="rt-box bz-box bz-controls" data-go>${controls}</form></div>
        <section class="cs-section bz-recent"><h2 class="cs-h">In this round</h2><div class="cs-rows">${(data?.bets || []).length ? data.bets.map(betRow).join("") : `<p class="bz-note">Nobody yet. Bets close at launch.</p>`}</div></section></div>`;
    }
    async function load() {
      clearTimeout(timer);
      try {
        data = p.apply(await api("/api/casino/beta/rocket"));
        if (p.visible() && !p.state.busy) paint();
      } catch (err) { p.fail(err); }
      if (!p.visible()) return;
      const ph = phase();
      const wait = ph === "flying" ? 450 : ph === "popped" ? Math.max(500, data.round.endAt - ctx.clock.now() + 50) : Math.min(1500, Math.max(300, data.round.launchAt - ctx.clock.now() + 30));
      timer = setTimeout(load, wait);
    }
    root.addEventListener("submit", async (e) => {
      if (!e.target.closest("[data-go]")) return;
      e.preventDefault();
      if (p.state.busy || !data) return;
      stake = readStake(root, "rk-stake");
      auto = Number(root.querySelector("#rk-auto")?.value) || auto;
      p.state.busy = true;
      try { data = p.apply(await post("/api/casino/beta/rocket/bet", { round: data.round.id, stake, auto, requestId: uuid() })); paint(); }
      catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    root.addEventListener("click", async (e) => {
      const quick = e.target.closest("[data-auto]");
      if (quick) {
        auto = Number(quick.dataset.auto);
        const input = root.querySelector("#rk-auto");
        if (input) input.value = String(auto);
        root.querySelectorAll("[data-auto]").forEach((x) => x.classList.toggle("on", x === quick));
        return;
      }
      if (!e.target.closest("[data-rk-cash]") || p.state.busy) return;
      p.state.busy = true;
      try { data = p.apply(await post("/api/casino/beta/rocket/cash", {})); paint(); }
      catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    return {
      show() { paint(); load(); cancelAnimationFrame(raf); raf = requestAnimationFrame(figure); },
      hide() { clearTimeout(timer); cancelAnimationFrame(raf); },
    };
  });
}

// ---- Mystery Tins ------------------------------------------------------------------------
/* The chase cards are the show. On the shelf a tin is its three best cards standing in an open tin; a tin's own
   page (/casino/tins/<id>) lines up the chase cards as real faces, then every card with its odds. Opening spins
   a reel of the tin's cards that stops on yours, and the card grows where it landed. */
const paintOf = (t) => (/^#[0-9a-f]{6}$/i.test(t.color || "") ? t.color : "#00b4c8");
/** Ink that reads on a tin's paint: dark on the light paints, white on the rest. */
const paintInk = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? "var(--k0)" : "#fff"; };
const tinStyle = (t) => `--paint:${paintOf(t)};--paint-ink:${paintInk(paintOf(t))}`;
const TIN_CHASE = 6; // how many cards a tin's page shows off as faces

function tinsPage(ctx, root) {
  return page(ctx, root, "tins", (p) => {
    let tins = null;
    let recent = [];
    let viewId = ""; // the tin whose page is open ("" = the shelf)
    let stage = null; // { phase: 'reel'|'landed', cards } while tins are being opened
    let count = 1; // how many tins the key opens at once (up to TIN_MAX_OPEN)
    const full = new Map(); // card id -> the catalog's card, once its set has loaded (ctx.cardsById)
    const asked = new Set();
    const pct = (o) => (o >= 0.01 ? `${(o * 100).toFixed(o >= 0.1 ? 0 : 1)}%` : o >= 0.0001 ? `${(o * 100).toFixed(2)}%` : `1 in ${Math.round(1 / o).toLocaleString("en-US")}`);
    const oneIn = (o) => (o >= 0.5 ? pct(o) : `1 in ${Math.max(2, Math.round(1 / o)).toLocaleString("en-US")}`);
    const big = (t, c) => c.price >= t.price * 3;
    const shortName = (t) => t.name.replace(/( high roller)? tin$/i, "");
    const tinOf = (id) => tins?.find((t) => t.id === id) || null;

    /** A card on show: the real face with its foil when the catalog has it, the plain picture until then. */
    const faceInner = (c, large) => {
      const card = full.get(c.id);
      return card && ctx.tcgFace ? ctx.tcgFace(card, { small: !large, stamp: false }) : `<img class="bz-face-img" src="${esc(c.image)}" alt="${esc(c.name)}" decoding="async" />`;
    };
    const face = (c, large = false) => `<span class="bz-face" data-face="${esc(c.id)}"${large ? " data-large" : ""}>${faceInner(c, large)}</span>`;
    /** Fetch the real cards for these briefs, then swap the faces already on screen. */
    async function lightFaces(cards) {
      const ids = cards.map((c) => c.id).filter((id) => !asked.has(id));
      if (!ids.length || !ctx.cardsById) return;
      ids.forEach((id) => asked.add(id));
      try { for (const [id, card] of await ctx.cardsById(ids)) full.set(id, card); } catch { return; }
      for (const el of root.querySelectorAll("[data-face]")) {
        if (!ids.includes(el.dataset.face) || !full.has(el.dataset.face) || el.querySelector(".tcg")) continue;
        const c = { id: el.dataset.face, name: "", image: "" };
        el.innerHTML = faceInner(c, el.hasAttribute("data-large"));
      }
    }

    // ---- The shelf: each tin is its three best cards standing in the open tin.
    const fan = (t) => `<span class="bz-fan">
      ${t.cards[1] ? `<span class="bz-fan-card is-l">${face(t.cards[1])}</span>` : ""}
      ${t.cards[2] ? `<span class="bz-fan-card is-r">${face(t.cards[2])}</span>` : ""}
      <span class="bz-fan-card is-c">${face(t.cards[0])}</span>
      <span class="bz-tinfront"><b>${esc(shortName(t))}</b><i>${t.risk === "high" ? "High roller tin" : "Mystery tin"}</i></span></span>`;
    const tinBox = (t) => `<article class="rt-box bz-tin" style="${tinStyle(t)}">
      <a class="bz-tin-well" href="/casino/tins/${esc(t.id)}" data-bt-link aria-label="${esc(t.name)}: see every card">${fan(t)}</a>
      <div class="bz-tin-copy">
        <p class="bz-tin-best"><small>Top card, ${oneIn(t.cards[0].odds)}</small><b>${esc(t.cards[0].name)}</b>${coinTag(t.cards[0].price)}</p>
        <div class="bz-tin-keys"><a class="bz-tin-all" href="/casino/tins/${esc(t.id)}" data-bt-link>All ${t.cards.length} cards and odds</a>
          <button type="button" class="ghost bz-open" data-open="${esc(t.id)}">Open for ${coinTag(t.price)}</button></div></div></article>`;
    const recentHTML = () => (recent.length ? `<section class="cs-section bz-recent"><h2 class="cs-h">Your last tins</h2><div class="cs-rows">${recent.map((r) => `<div class="rt-row bz-row${r.card.price >= r.price ? " is-won" : ""}"><span class="rt-row-lab">${esc(r.tinName.replace(/ tin$/, ""))}</span><span class="rt-row-name">${esc(r.card.name)}<small>Paid ${num(r.price)}</small></span><span class="rt-row-val">${coinTag(r.card.price)}</span></div>`).join("")}</div></section>` : "");
    /** Two shelves: the themed tins, then the high rollers that cost more and swing harder. */
    const shelves = () => {
      const high = tins.filter((t) => t.risk === "high");
      return `<div class="bz-tin-list">${tins.filter((t) => t.risk !== "high").map(tinBox).join("")}</div>
        ${high.length ? `<section class="cs-section bz-rollers"><h2 class="cs-h">High rollers</h2><p class="bz-note">These cost more and swing harder: a pricey tin where every card is a hit, or bulk with a small shot at something huge. Each tin's page lists its odds and what comes back on average.</p>
          <div class="bz-tin-list">${high.map(tinBox).join("")}</div></section>` : ""}`;
    };
    const shelfHTML = () => `<p class="bz-lede">Each tin is built around its chase cards. Pick one, spin it open, and the card you land on goes straight into your collection.</p>
      ${!tins ? `<div class="rt-skel bz-skel"></div>` : shelves()}${recentHTML()}`;

    // ---- A tin's page: the chase cards as faces, the key, every card and its odds.
    const chaseHTML = (t) => `<div class="bz-chase" role="list">${t.cards.slice(0, TIN_CHASE).map((c, i) => `<figure class="bz-chase-card" role="listitem">
        <button type="button" class="bz-chase-face" data-look="${esc(c.id)}" aria-label="Look at ${esc(c.name)}">${face(c, true)}</button>
        <figcaption><b>${esc(c.name)}</b><span>${coinTag(c.price)}</span><small>${i === 0 ? "Top card, " : ""}${oneIn(c.odds)}</small></figcaption></figure>`).join("")}</div>`;
    /** What one landed card was: its plate and figure. Several cards get a row each and one total. */
    const revealHTML = (t, cards) => {
      if (cards.length === 1) {
        const card = cards[0];
        return `<div class="bz-reveal">
          <div class="bz-reveal-plate${big(t, card) ? " is-hit" : ""}"><b>${esc(card.name)}</b><span>${esc(card.rarity || "")}${card.setName ? `, ${esc(card.setName)}` : ""}</span></div>
          <p class="bz-reveal-fig">${coinTag(card.price)} <small>${card.price >= t.price ? `${(card.price / t.price).toFixed(1)}x what you paid` : "Added to your collection"}</small></p></div>`;
      }
      const total = cards.reduce((sum, c) => sum + c.price, 0);
      const paid = t.price * cards.length;
      return `<div class="bz-reveal is-many">
        <div class="cs-rows bz-reveal-rows">${cards.map((c) => `<div class="rt-row bz-row${big(t, c) ? " is-hit" : c.price >= t.price ? " is-won" : ""}"><span class="rt-row-name">${esc(c.name)}<small>${esc(c.rarity || "")}</small></span><span class="rt-row-val">${coinTag(c.price)}</span></div>`).join("")}</div>
        <p class="bz-reveal-fig">${coinTag(Math.round(total * 100) / 100)} <small>${total >= paid ? `${(total / paid).toFixed(1)}x what you paid` : `from ${cards.length} tins, all in your collection`}</small></p></div>`;
    };
    const stageHTML = (t) => (stage ? `<section class="bz-stage is-reel is-n${stage.cards.length}" aria-live="polite">${stage.cards.map(() => `<div class="bz-reel-wrap"><div class="bz-reel"></div></div>`).join("")}</section>` : chaseHTML(t));
    const keysHTML = (t) => {
      const beat = t.cards.filter((c) => c.price >= t.price);
      const chance = beat.reduce((sum, c) => sum + c.odds, 0);
      const again = stage?.phase === "landed";
      const n = Math.min(count, TIN_MAX_OPEN);
      return `<div class="bz-view-keys">
        <div class="bz-count" role="group" aria-label="How many tins to open"><span>Open</span>${Array.from({ length: TIN_MAX_OPEN }, (_, i) => `<button type="button" class="rt-word${i + 1 === n ? " on" : ""}" data-count="${i + 1}" aria-pressed="${i + 1 === n}">${i + 1}</button>`).join("")}<span>at once</span></div>
        <button type="button" class="solid rt-go" data-open="${esc(t.id)}" data-n="${n}">${again ? "Open " + (n > 1 ? `${n} more` : "another") : n > 1 ? `Open ${n}` : "Open"} for ${coinTag(Math.round(t.price * n * 100) / 100)}</button>
        ${again ? `<button type="button" class="ghost" data-close>Back to the chase cards</button>` : ""}
        <p class="bz-note">${beat.length} of the ${t.cards.length} cards are worth more than the tin, a ${oneIn(chance)} chance. On average ${Math.round((t.back || 0.9) * 100)}% of the price comes back.</p></div>`;
    };
    const cell = (c) => `<button type="button" class="bz-cell" data-look="${esc(c.id)}"><img src="${esc(c.image)}" alt="" loading="lazy" decoding="async" />
      <b>${esc(c.name)}</b><small>${esc(c.setName || "")}${c.number ? ` ${esc(c.number)}` : ""}</small><span class="bz-cell-fig"><i>${pct(c.odds)}</i>${coinTag(c.price)}</span></button>`;
    const viewHTML = (t) => `<div class="bz-view" style="${tinStyle(t)}">
      <div class="bz-view-head"><a class="bz-view-back" href="/casino/tins" data-bt-link>All tins</a>
        <h2 class="bz-view-name">${esc(t.name)}</h2><p class="bz-note">${esc(t.line || "")} ${t.cards.length} cards inside.</p></div>
      <div class="bz-view-show" data-stage>${stageHTML(t)}</div>
      <div data-keys>${keysHTML(t)}</div>
      <section class="cs-section bz-all"><h2 class="cs-h">All ${t.cards.length} cards and odds</h2><div class="bz-grid">${t.cards.map(cell).join("")}</div></section></div>`;

    function paint() {
      const t = viewId ? tinOf(viewId) : null;
      root.innerHTML = `<div class="cs-page bz-page bz-tins">${p.head("Mystery Tins")}
        ${viewId && !tins ? `<div class="rt-skel bz-skel"></div>` : t ? viewHTML(t) : shelfHTML()}</div>`;
      if (t) lightFaces(t.cards.slice(0, TIN_CHASE));
      else if (tins) lightFaces(tins.flatMap((x) => x.cards.slice(0, 3)));
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
        reel.innerHTML = strip.map((c, i) => `<span class="bz-reel-card${i === 30 ? " is-won" : ""}"><img src="${esc(c.image)}" alt="" decoding="async" /></span>`).join("");
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
        item.innerHTML = `<button type="button" class="bz-chase-face" data-look="${esc(card.id)}" aria-label="Look at ${esc(card.name)}">${face(card, cards.length === 1)}</button>`;
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
    rocket: rocketPage(ctx, roots.rocket),
    tins: tinsPage(ctx, roots.tins),
  };
}
export const BETA_KEYS = ["beta", "grass", "rocket", "tins"];
export { ART as BETA_ART };
