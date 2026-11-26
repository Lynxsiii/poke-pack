/* BETA TESTING: the casino's invite-only games (worker/beta.js settles every one).

   /casino/beta     join with an invite code, the perks, the games; the owner makes codes here
   /casino/grass    Tall Grass: clear tiles, dodge the Voltorb, cash out
   /casino/drop     Poké Ball Drop: one ball down 12 rows of pegs
   /casino/rocket   Rocket: one shared round, cash out before the pop
   /casino/higher   Higher or Lower on a set's real card prices
   /casino/tins     Mystery Tins: a themed tin, one card out

   The page only asks and shows. Every stake, roll and payout is the Worker's. */
import { api, esc, coinTag, uuid } from "./casino-kit.js";
import { BETA_GAMES, BETA_RULES, GRASS, DROP_ROWS, DROP_RISKS, ROCKET, rocketAt, grassMultiplier } from "./beta-rules.js?v=1";

const fmtX = (m) => `${Number(m || 0).toFixed(2)}x`;
const num = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });

// ---- Art ---------------------------------------------------------------------------------
const VOLTORB = `<svg class="bz-voltorb" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="var(--hp-low)" stroke="var(--k0)" stroke-width="2.5"/><path d="M4 20a16 16 0 0 0 32 0z" fill="#fff" stroke="var(--k0)" stroke-width="2.5"/><path d="M11 15l7 3M29 15l-7 3" stroke="var(--k0)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const BALL = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#fff" stroke="var(--k0)" stroke-width="2.5"/><path d="M4 20a16 16 0 0 1 32 0z" fill="var(--hp-low)" stroke="var(--k0)" stroke-width="2.5"/><circle cx="20" cy="20" r="5" fill="#fff" stroke="var(--k0)" stroke-width="2.5"/></svg>`;
const ART = {
  grass: `<svg viewBox="0 0 70 70" aria-hidden="true"><g stroke="var(--k0)" stroke-width="2.5"><rect x="4" y="4" width="18" height="18" fill="var(--hp)"/><rect x="26" y="4" width="18" height="18" fill="var(--hp)"/><rect x="48" y="4" width="18" height="18" fill="var(--box)"/><rect x="4" y="26" width="18" height="18" fill="var(--box)"/><rect x="26" y="26" width="18" height="18" fill="var(--hp)"/><rect x="48" y="26" width="18" height="18" fill="var(--hp)"/><rect x="4" y="48" width="18" height="18" fill="var(--hp)"/><rect x="26" y="48" width="18" height="18" fill="var(--hp-low)"/><rect x="48" y="48" width="18" height="18" fill="var(--hp)"/></g></svg>`,
  drop: `<svg viewBox="0 0 70 70" aria-hidden="true"><g fill="var(--k)"><circle cx="35" cy="12" r="3"/><circle cx="25" cy="24" r="3"/><circle cx="45" cy="24" r="3"/><circle cx="15" cy="36" r="3"/><circle cx="35" cy="36" r="3"/><circle cx="55" cy="36" r="3"/></g><g stroke="var(--k0)" stroke-width="2.5"><circle cx="40" cy="47" r="7" fill="var(--hp-low)"/><path d="M33 47h14"/></g><g stroke="var(--k0)" stroke-width="2"><rect x="4" y="58" width="12" height="9" fill="var(--hp-low)"/><rect x="17" y="58" width="12" height="9" fill="var(--hp-mid)"/><rect x="30" y="58" width="12" height="9" fill="var(--hp)"/><rect x="43" y="58" width="12" height="9" fill="var(--hp-mid)"/><rect x="56" y="58" width="10" height="9" fill="var(--hp-low)"/></g></svg>`,
  rocket: `<svg viewBox="0 0 70 70" aria-hidden="true"><path d="M6 64 C30 62 46 44 60 10" stroke="var(--cy-2)" stroke-width="3.5" fill="none"/><path d="M6 66H66M6 66V6" stroke="var(--k)" stroke-width="2.5"/><circle cx="60" cy="10" r="5" fill="var(--yel)" stroke="var(--k0)" stroke-width="2"/></svg>`,
  higher: `<svg viewBox="0 0 70 70" aria-hidden="true"><g stroke="var(--k0)" stroke-width="2.5"><rect x="6" y="14" width="26" height="38" fill="var(--box)"/><rect x="38" y="18" width="26" height="38" fill="var(--cy-3)"/></g><path d="M51 30l-6 8h12z" fill="var(--hp)"/><path d="M51 48l-6-8h12z" fill="var(--hp-low)"/></svg>`,
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
    if (err?.payload?.needBeta) return ctx.navigate("/casino/beta");
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
      <p class="bz-note">Only you see this. Make a code, send it to someone, and they type it here to join.</p>
      <form class="bz-make" data-make>
        <label class="bz-field"><span>Codes</span><input class="bz-input" name="count" type="number" min="1" max="20" value="1" /></label>
        <label class="bz-field"><span>Uses each</span><input class="bz-input" name="uses" type="number" min="1" max="500" value="1" /></label>
        <label class="bz-field bz-wide"><span>Note</span><input class="bz-input" name="note" maxlength="60" placeholder="Who it's for" /></label>
        <button class="solid" type="submit">Make codes</button></form>
      <div class="bz-codes">${(data.codes || []).length ? data.codes.map(codeRow).join("") : `<p class="bz-note">No codes yet.</p>`}</div></section>` : "";
    function paint() {
      const inside = data?.member || data?.admin;
      root.innerHTML = `<div class="cs-page bz-page bz-home">
        <header class="cs-head bz-head"><h1 class="page-title">Beta testing <span class="rt-tag bz-tag">Beta</span></h1></header>
        ${!data ? `<div class="rt-skel bz-skel"></div>` : inside ? `${data.member ? `<p class="bz-lede">You're a beta tester. These games are new, so tell us what feels off.</p>` : `<p class="bz-lede">You run the beta. Join with one of your own codes to get the badge and frame.</p>`}
          ${tiles()}
          <section class="rt-box bz-box"><h2 class="cs-h">Your perks</h2>${perks}</section>` : `
          <p class="bz-lede">New casino games, open to invited testers first. Got a code? Enter it to join.</p>
          <form class="rt-box bz-box bz-join" data-join><label class="bz-field bz-wide"><span>Invite code</span><input class="bz-input bz-code" name="code" autocomplete="off" autocapitalize="characters" placeholder="BETA-XXXXXX" required /></label>
          <button class="solid rt-go" type="submit">Join the beta</button></form>
          <section class="rt-box bz-box"><h2 class="cs-h">What testers get</h2>${perks}
          <p class="bz-note">Five games to try: ${BETA_GAMES.map((g) => esc(g.title)).join(", ")}. Free play with virtual coins, like the rest of the casino.</p></section>`}
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
function grassPage(ctx, root) {
  return page(ctx, root, "grass", (p) => {
    let run = null;
    let recent = [];
    let last = { stake: 10, mines: 3 };
    let boom = -1;
    const tile = (i) => {
      const open = run?.open?.includes(i);
      const volt = run?.voltorb?.includes(i);
      const hit = run?.hit === i;
      const live = run?.state === "open";
      const cls = open ? "is-open" : volt ? `is-volt${hit ? " is-hit" : ""}` : run && !live ? "is-left" : "";
      return `<button type="button" class="bz-tile ${cls}${hit && boom === i ? " is-boom" : ""}" data-tile="${i}" ${live && !open ? "" : "disabled"} aria-label="Tile ${i + 1}${open ? ", clear" : volt ? ", Voltorb" : ""}">${volt ? VOLTORB : open ? `<i class="bz-leaf"></i>` : ""}</button>`;
    };
    function paint() {
      const live = run?.state === "open";
      const n = run?.open?.length || 0;
      const pay = live ? Math.min(BETA_RULES.maxWin, Math.floor(run.stake * run.mult * 100) / 100) : 0;
      const status = !run ? `<p class="bz-status">Pick a stake and how many Voltorb hide in the grass.</p>`
        : live ? `<p class="bz-status">${n ? `${n} clear, cash out for ${coinTag(pay)} (${fmtX(run.mult)})` : "Tap a tile."} Next clear tile: ${fmtX(run.next)}</p>`
        : run.state === "lost" ? `<p class="bz-status is-bad">A wild Voltorb. The stake is gone.</p>`
        : `<p class="bz-status is-good">Cashed out ${coinTag(run.payout)} at ${fmtX(run.mult)}.</p>`;
      root.innerHTML = `<div class="cs-page bz-page bz-grass">${p.head("Tall Grass")}
        <div class="bz-play">
          <div class="bz-board-wrap">${status}<div class="bz-grid" style="--n:5">${Array.from({ length: GRASS.tiles }, (_, i) => tile(i)).join("")}</div></div>
          <form class="rt-box bz-box bz-controls" data-go>
            ${live ? `<p class="bz-fig"><small>Stake</small>${coinTag(run.stake)}<small>Voltorb</small><b>${run.mines}</b></p>
              <button type="button" class="solid rt-go" data-cash ${n ? "" : "disabled"}>Cash out ${n ? coinTag(pay) : ""}</button>`
            : `${stakeField("gr-stake", last.stake)}
              <label class="bz-field"><span>Voltorb <b data-mines-out>${last.mines}</b></span><input class="bz-range" type="range" name="mines" min="${GRASS.minMines}" max="${GRASS.maxMines}" value="${last.mines}" /></label>
              <p class="bz-note" data-mines-note>First clear tile pays ${fmtX(grassMultiplier(last.mines, 1))}, five pay ${fmtX(grassMultiplier(last.mines, Math.min(5, 25 - last.mines)))}.</p>
              <button class="solid rt-go" type="submit">Walk into the grass</button>`}
          </form>
        </div>
        ${recentRows(recent.map((r) => ({ won: r.state === "cashed", line: `${r.mines} Voltorb, ${r.open.length} clear`, mult: r.mult, stake: r.stake, payout: r.payout })))}
      </div>`;
    }
    root.addEventListener("input", (e) => {
      if (e.target.name === "mines") {
        last.mines = Number(e.target.value);
        root.querySelector("[data-mines-out]").textContent = last.mines;
        root.querySelector("[data-mines-note]").textContent = `First clear tile pays ${fmtX(grassMultiplier(last.mines, 1))}, five pay ${fmtX(grassMultiplier(last.mines, Math.min(5, 25 - last.mines)))}.`;
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
        boom = -1;
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
        if (run.state === "lost") { boom = run.hit; ctx.buzz?.([60, 40, 90]); }
        if (run.state !== "open") load(true);
        paint();
      } catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    async function load(quiet) {
      try {
        const res = await api("/api/casino/beta/grass");
        if (!quiet) run = res.run;
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

// ---- Poké Ball Drop ----------------------------------------------------------------------
function dropPage(ctx, root) {
  return page(ctx, root, "drop", (p) => {
    let slots = null;
    let recent = [];
    let risk = "medium";
    let stake = 10;
    let lastSlot = -1;
    const W = 320, TOP = 22, ROW = 22, GAP = W / (DROP_ROWS + 2);
    const pegX = (row, i) => W / 2 + (i - row / 2) * GAP;
    function board() {
      let pegs = "";
      for (let r = 0; r < DROP_ROWS; r++) for (let i = 0; i <= r + 1; i++) pegs += `<circle cx="${pegX(r + 1, i).toFixed(1)}" cy="${TOP + r * ROW}" r="2.6"/>`;
      const list = slots?.[risk] || [];
      const sw = GAP - 2;
      const cells = list.map((m, k) => {
        const x = pegX(DROP_ROWS, k) - sw / 2;
        const tone = m >= 2 ? "hi" : m >= 1 ? "mid" : "lo";
        return `<g class="bz-slot is-${tone}${k === lastSlot ? " is-hit" : ""}" data-slot="${k}"><rect x="${x.toFixed(1)}" y="${TOP + DROP_ROWS * ROW - 6}" width="${sw.toFixed(1)}" height="20" rx="3"/><text x="${(x + sw / 2).toFixed(1)}" y="${TOP + DROP_ROWS * ROW + 8}">${m < 10 ? m : Math.round(m)}</text></g>`;
      }).join("");
      return `<svg class="bz-pegs" viewBox="0 0 ${W} ${TOP + DROP_ROWS * ROW + 20}" role="img" aria-label="Peg board"><g class="bz-peg">${pegs}</g>${cells}</svg><span class="bz-ball" hidden>${BALL}</span>`;
    }
    function paint() {
      root.innerHTML = `<div class="cs-page bz-page bz-drop">${p.head("Poké Ball Drop")}
        <div class="bz-play"><div class="bz-board-wrap"><p class="bz-status" data-drop-status>Drop a ball. It lands in a slot and pays that much times your stake.</p><div class="bz-board">${board()}</div></div>
        <form class="rt-box bz-box bz-controls" data-go>${stakeField("dr-stake", stake)}
          <div class="bz-field"><span>Risk</span><div class="bz-words">${DROP_RISKS.map((r) => `<button type="button" class="rt-word${r === risk ? " on" : ""}" data-risk="${r}" aria-pressed="${r === risk}">${r[0].toUpperCase() + r.slice(1)}</button>`).join("")}</div></div>
          <button class="solid rt-go" type="submit">Drop</button></form></div>
        ${recentRows(recent.map((r) => ({ won: r.payout > 0, line: `${r.risk[0].toUpperCase() + r.risk.slice(1)} risk, slot ${r.slot + 1}`, mult: r.mult, stake: r.stake, payout: r.payout })))}</div>`;
    }
    async function animate(run) {
      const ball = root.querySelector(".bz-ball");
      const svg = root.querySelector(".bz-pegs");
      if (!ball || !svg || !ctx.motion()) return;
      const scale = svg.getBoundingClientRect().width / W;
      let i = 0;
      const frames = [{ transform: `translate(${(W / 2) * scale}px, 0px)` }];
      run.path.forEach((right, r) => {
        i += right;
        frames.push({ transform: `translate(${pegX(r + 1, i) * scale}px, ${(TOP + r * ROW + ROW * 0.6) * scale}px)`, easing: "cubic-bezier(.3,0,.7,1)" });
      });
      ball.hidden = false;
      ball.style.setProperty("--b", `${16 * Math.max(scale, 0.8)}px`);
      await ball.animate(frames, { duration: 140 * DROP_ROWS, fill: "forwards", easing: "linear" }).finished.catch(() => {});
    }
    root.addEventListener("click", (e) => {
      const r = e.target.closest("[data-risk]");
      if (!r || p.state.busy) return;
      risk = r.dataset.risk;
      stake = readStake(root, "dr-stake") || stake;
      lastSlot = -1;
      paint();
    });
    root.addEventListener("submit", async (e) => {
      if (!e.target.closest("[data-go]")) return;
      e.preventDefault();
      if (p.state.busy) return;
      stake = readStake(root, "dr-stake");
      p.state.busy = true;
      try {
        const res = await post("/api/casino/beta/drop/play", { stake, risk, requestId: uuid() });
        lastSlot = -1;
        paint();
        root.querySelector("[data-go] button[type=submit]").disabled = true;
        await animate(res.run);
        p.apply(res);
        lastSlot = res.run.slot;
        recent = [res.run, ...recent].slice(0, 8);
        paint();
        const st = root.querySelector("[data-drop-status]");
        st.innerHTML = res.run.payout >= res.run.stake ? `${fmtX(res.run.mult)}, you win ${coinTag(res.run.payout)}.` : `${fmtX(res.run.mult)}, back ${coinTag(res.run.payout)}.`;
        st.classList.add(res.run.payout >= res.run.stake ? "is-good" : "is-bad");
        if (res.run.mult >= 5) ctx.buzz?.([30, 30, 30]);
      } catch (err) { p.fail(err); paint(); } finally { p.state.busy = false; }
    });
    async function load() {
      try {
        const res = await api("/api/casino/beta/drop");
        slots = res.slots;
        recent = res.recent || [];
        if (p.visible() && !p.state.busy) paint();
      } catch (err) { p.fail(err); }
    }
    return { show() { paint(); load(); } };
  });
}

// ---- Rocket ------------------------------------------------------------------------------
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
      // The balloon rises with the log of the multiplier: transform only.
      const h = Math.min(1, Math.log(m) / Math.log(ROCKET.maxMult) * 1.6);
      sky?.style.setProperty("--rise", h.toFixed(3));
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
          <button class="solid rt-go" type="submit">Join this round</button>`
        : mine?.status === "open" && ph === "flying" ? `<button type="button" class="solid rt-go" data-rk-cash>Cash out</button><p class="bz-note">Auto cash-out at ${fmtX(mine.auto)}.</p>`
        : mine ? `<p class="bz-status ${mine.status === "won" ? "is-good" : mine.status === "lost" ? "is-bad" : ""}">${mine.status === "won" ? `You cashed out at ${fmtX(mine.cashed)} for ${coinTag(mine.payout)}.` : mine.status === "lost" ? "It popped before you cashed out." : `You're in with ${coinTag(mine.stake)}, auto at ${fmtX(mine.auto)}.`}</p>`
        : `<p class="bz-note">${ph === "flying" ? "This round is in the air. Bets open again when it pops." : "Next round soon."}</p>`;
      root.innerHTML = `<div class="cs-page bz-page bz-rocket">${p.head("Rocket")}
        <div class="bz-play"><div class="bz-board-wrap">
          <div class="bz-sky is-${ph}" style="--rise:0"><span class="bz-balloon" aria-hidden="true"><svg viewBox="0 0 40 52"><path d="M20 2C9 2 3 10 3 19c0 11 10 18 17 22 7-4 17-11 17-22C37 10 31 2 20 2z" fill="var(--yel)" stroke="var(--k0)" stroke-width="2.5"/><path d="M20 41v9" stroke="var(--k0)" stroke-width="2"/></svg></span>
            <p class="bz-mult"><small>${ph === "betting" ? "Launch in" : ph === "popped" ? "Popped at" : "Now"}</small><b data-rk-fig>-</b></p></div>
          <p class="bz-hist" aria-label="Last rounds">${(data?.history || []).map((h) => `<span class="${h.crash >= 2 ? "is-hi" : ""}">${fmtX(h.crash)}</span>`).join("")}</p>
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

// ---- Higher or Lower ---------------------------------------------------------------------
function higherPage(ctx, root) {
  return page(ctx, root, "higher", (p) => {
    let run = null;
    let recent = [];
    let stake = 10;
    const card = (c, cls = "") => `<figure class="bz-card ${cls}"><img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" decoding="async" /><figcaption><b>${esc(c.name)}</b>${coinTag(c.price)}</figcaption></figure>`;
    function paint() {
      const live = run?.state === "open";
      const cur = run?.shown?.[run.shown.length - 1];
      const pay = live ? Math.min(BETA_RULES.maxWin, Math.floor(run.stake * run.mult * 100) / 100) : 0;
      const status = !run ? `<p class="bz-status">Each round deals from one real set. Guess if the next card sells for more or less.</p>`
        : live ? `<p class="bz-status">${run.set?.name ? `${esc(run.set.name)}. ` : ""}${run.guesses ? `${run.guesses} right, cash out for ${coinTag(pay)} (${fmtX(run.mult)}).` : "Make your first guess."}</p>`
        : run.state === "lost" ? `<p class="bz-status is-bad">Wrong call${run.last ? `: ${esc(run.last.name)} sells for ${coinTag(run.last.price)}` : ""}. The stake is gone.</p>`
        : `<p class="bz-status is-good">Cashed out ${coinTag(run.payout)} at ${fmtX(run.mult)}.</p>`;
      root.innerHTML = `<div class="cs-page bz-page bz-higher">${p.head("Higher or Lower")}
        <div class="bz-play"><div class="bz-board-wrap">${status}
          <div class="bz-cards">${cur ? card(cur, "is-now") : `<div class="bz-card is-empty">${ART.higher}</div>`}${run?.state === "lost" && run.last ? card(run.last, "is-wrong") : ""}</div>
          ${run?.shown?.length > 1 ? `<div class="bz-trail" aria-label="Cards so far">${run.shown.slice(0, -1).map((c) => `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" />`).join("")}</div>` : ""}</div>
        <form class="rt-box bz-box bz-controls" data-go>${live ? `
            <div class="bz-guess"><button type="button" class="ghost" data-dir="higher" ${run.pays.higher ? "" : "disabled"}>Higher <small>${run.pays.higher ? fmtX(run.pays.higher) : "none"}</small></button>
            <button type="button" class="ghost" data-dir="lower" ${run.pays.lower ? "" : "disabled"}>Lower <small>${run.pays.lower ? fmtX(run.pays.lower) : "none"}</small></button></div>
            <p class="bz-note">${run.odds.above} cards in this set sell for more, ${run.odds.below} for less.</p>
            <button type="button" class="solid rt-go" data-cash ${run.guesses ? "" : "disabled"}>Cash out ${run.guesses ? coinTag(pay) : ""}</button>`
          : `${stakeField("hl-stake", stake)}<button class="solid rt-go" type="submit">Deal a card</button>`}</form></div>
        ${recentRows(recent.map((r) => ({ won: r.state === "cashed", line: r.state === "cashed" ? "Cashed out" : "Wrong guess", mult: r.mult, stake: r.stake, payout: r.payout })))}</div>`;
    }
    root.addEventListener("submit", async (e) => {
      if (!e.target.closest("[data-go]")) return;
      e.preventDefault();
      if (p.state.busy) return;
      stake = readStake(root, "hl-stake");
      p.state.busy = true;
      try { run = p.apply(await post("/api/casino/beta/higher/start", { stake, requestId: uuid() })).run; paint(); }
      catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    root.addEventListener("click", async (e) => {
      const dir = e.target.closest("[data-dir]");
      const cash = e.target.closest("[data-cash]");
      if ((!dir && !cash) || p.state.busy || run?.state !== "open") return;
      p.state.busy = true;
      try {
        run = p.apply(dir ? await post("/api/casino/beta/higher/guess", { id: run.id, dir: dir.dataset.dir }) : await post("/api/casino/beta/higher/cash", { id: run.id })).run;
        if (run.state !== "open") load(true);
        paint();
      } catch (err) { p.fail(err); } finally { p.state.busy = false; }
    });
    async function load(quiet) {
      try {
        const res = await api("/api/casino/beta/higher");
        if (!quiet) run = res.run;
        recent = res.recent || [];
        if (p.visible()) paint();
      } catch (err) { p.fail(err); }
    }
    return { show() { paint(); load(); } };
  });
}

// ---- Mystery Tins ------------------------------------------------------------------------
function tinsPage(ctx, root) {
  return page(ctx, root, "tins", (p) => {
    let tins = null;
    let recent = [];
    let won = null;
    const pct = (o) => (o >= 0.01 ? `${(o * 100).toFixed(o >= 0.1 ? 0 : 1)}%` : o >= 0.0001 ? `${(o * 100).toFixed(2)}%` : `1 in ${Math.round(1 / o).toLocaleString("en-US")}`);
    const tinBox = (t) => `<article class="rt-box bz-box bz-tin" data-tin="${esc(t.id)}">
      <div class="bz-tin-top"><span class="bz-art bz-tin-art">${ART.tins}</span><div><h2 class="cs-h">${esc(t.name)}</h2><p class="bz-note">${t.cards.length} cards. Best: ${esc(t.cards[0].name)}, worth ${coinTag(t.cards[0].price)}</p></div></div>
      <div class="bz-tin-strip">${t.cards.slice(0, 5).map((c) => `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" decoding="async" />`).join("")}</div>
      <details class="bz-odds"><summary>All ${t.cards.length} cards and odds</summary><div class="cs-rows">${t.cards.map((c) => `<div class="rt-row bz-row"><span class="rt-row-lab">${pct(c.odds)}</span><span class="rt-row-name">${esc(c.name)}<small>${esc(c.setName || "")}${c.number ? ` ${esc(c.number)}` : ""}</small></span><span class="rt-row-val">${coinTag(c.price)}</span></div>`).join("")}</div></details>
      <button type="button" class="solid" data-open="${esc(t.id)}">Open for ${coinTag(t.price)}</button></article>`;
    function paint() {
      root.innerHTML = `<div class="cs-page bz-page bz-tins">${p.head("Mystery Tins")}
        <p class="bz-lede">Every card in a tin and its odds are listed. The card goes straight into your collection.</p>
        <div class="bz-reel-wrap" ${won ? "" : "hidden"}><div class="bz-reel"></div><p class="bz-status" data-tin-status></p></div>
        ${!tins ? `<div class="rt-skel bz-skel"></div>` : `<div class="bz-tin-list">${tins.map(tinBox).join("")}</div>`}
        ${recent.length ? `<section class="cs-section bz-recent"><h2 class="cs-h">Your last tins</h2><div class="cs-rows">${recent.map((r) => `<div class="rt-row bz-row${r.card.price >= r.price ? " is-won" : ""}"><span class="rt-row-lab">${esc(r.tinName.replace(/ tin$/, ""))}</span><span class="rt-row-name">${esc(r.card.name)}<small>Paid ${num(r.price)}</small></span><span class="rt-row-val">${coinTag(r.card.price)}</span></div>`).join("")}</div></section>` : ""}</div>`;
    }
    async function spin(tin, card) {
      const wrap = root.querySelector(".bz-reel-wrap");
      const reel = root.querySelector(".bz-reel");
      wrap.hidden = false;
      wrap.scrollIntoView?.({ block: "nearest", behavior: ctx.motion() ? "smooth" : "auto" });
      // A strip of weighted picks with the won card near the end; it slides to stop on it.
      const pick = () => { let u = Math.random(); for (const c of tin.cards) { if (u < c.odds) return c; u -= c.odds; } return tin.cards[tin.cards.length - 1]; };
      const strip = Array.from({ length: 34 }, pick);
      strip[30] = card;
      reel.innerHTML = strip.map((c, i) => `<img src="${esc(c.image)}" alt="" class="${i === 30 ? "is-won" : ""}" decoding="async" />`).join("");
      const item = reel.children[30];
      const target = item.offsetLeft + item.offsetWidth / 2 - reel.parentElement.clientWidth / 2;
      if (ctx.motion()) await reel.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-target}px)` }], { duration: 4200, easing: "cubic-bezier(.12,.6,.12,1)", fill: "forwards" }).finished.catch(() => {});
      else reel.style.transform = `translateX(${-target}px)`;
      item.classList.add("is-land");
    }
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-open]");
      if (!b || p.state.busy) return;
      const tin = tins.find((t) => t.id === b.dataset.open);
      p.state.busy = true;
      root.querySelectorAll("[data-open]").forEach((x) => (x.disabled = true));
      try {
        const res = await post("/api/casino/beta/tins/open", { tin: tin.id, price: tin.price, requestId: uuid() });
        won = res.run;
        await spin(tin, won.card);
        p.apply(res);
        ctx.invalidateCards?.();
        recent = [won, ...recent].slice(0, 8);
        const st = root.querySelector("[data-tin-status]");
        st.innerHTML = `${esc(won.card.name)}, worth ${coinTag(won.card.price)}. It's in your collection.`;
        st.classList.add(won.card.price >= tin.price ? "is-good" : "is-plain");
        if (won.card.price >= tin.price * 5) ctx.buzz?.([40, 30, 40, 30, 80]);
      } catch (err) { p.fail(err); } finally {
        p.state.busy = false;
        root.querySelectorAll("[data-open]").forEach((x) => (x.disabled = false));
      }
    });
    async function load() {
      try {
        const res = await api("/api/casino/beta/tins");
        tins = res.tins;
        recent = res.recent || [];
        if (p.visible() && !p.state.busy) paint();
      } catch (err) { p.fail(err); }
    }
    return { show() { won = null; paint(); load(); } };
  });
}

/** Every beta page, keyed like the casino's routes. */
export function createBetaPages(ctx, roots) {
  return {
    beta: homePage(ctx, roots.beta),
    grass: grassPage(ctx, roots.grass),
    drop: dropPage(ctx, roots.drop),
    rocket: rocketPage(ctx, roots.rocket),
    higher: higherPage(ctx, roots.higher),
    tins: tinsPage(ctx, roots.tins),
  };
}
export const BETA_KEYS = ["beta", "grass", "drop", "rocket", "higher", "tins"];
export { ART as BETA_ART };
