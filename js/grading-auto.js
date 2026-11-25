/* Auto-regrade: pick a slab, pick a target grade, set your stops, and the
   Worker cracks and regrades it try after try until it lands (worker/grading-auto.js).
   Every try is one ordinary grading fee and one ordinary roll; this page only
   asks for the next few tries and plays them back.

     /grading/<slabId>/auto   the setup: target, spending limit, try limit, the odds
     /grading/auto/<runId>    the run: live while this page drives it, paused if
                              the page was closed, and the summary once it ends

   The loop lives here, so leaving the page stops the run (a closed tab or a
   lost connection leaves it paused, and the run page offers to carry on).
   Made by initGrading (js/grading-page.js), which hands over its helpers. */
import { GRADE_WORDS, BLACK_LABEL, bandFor, gradingFee } from "./grading-rules.js";
import { AUTO_BLACK, AUTO_LIMITS, autoHit, hitChance, hitWithin, triesFor } from "./grading-auto-rules.js";
import { uuid } from "./casino-kit.js";
import { esc, coins } from "./battle-kit.js";
import { COIN_I as COIN_IMG } from "./money.js?v=2";

/** How long each try stays on screen while a run plays back, in ms. */
const TRY_MS = 240;
const pct = (p) => (p >= 0.995 ? "over 99%" : p > 0 && p < 0.001 ? "under 0.1%" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);
const whole = (n) => Number(n).toLocaleString("en-US");
const targetWord = (t) => (t === AUTO_BLACK ? BLACK_LABEL.word : `${t} or better`);
const targetShort = (t) => (t === AUTO_BLACK ? BLACK_LABEL.word : String(t));

export function initAutoRegrade(h) {
  // h: { root, api, post, isVisible, slabById, ensureCard, slabMarkup, gradePlate, stageHTML, back, coinTag, coinsNow,
  //      fine, motion, confirmSheet, navigate, toast, errorLine, refresh }
  let view = null; // { kind: "setup", slabId } | { kind: "run", runId }
  let target = 0;
  let maxSpend = "";
  let maxTries = String(AUTO_LIMITS.defaultTries);
  let error = "";
  let starting = false;
  let startId = "";
  let run = null; // the server's run view
  let slab = null; // the slab the run is on now
  let driving = false; // this page is asking for tries
  let stopping = false;
  let loopToken = 0;
  let lastTry = null; // { grade, blackLabel } shown on the plate

  // ---- Setup ----------------------------------------------------------------------
  const targetsFor = (s) => {
    const list = [];
    for (let g = 2; g <= 10; g++) if (!autoHit(s.grade, s.blackLabel, g)) list.push(g);
    if (!s.blackLabel) list.push(AUTO_BLACK);
    return list.filter((g) => g === AUTO_BLACK || g >= Math.min(10, s.grade + 1)).slice(-4);
  };

  function oddsLine(band, fee, t, tries, spend) {
    const p = hitChance(band, t);
    if (!(p > 0)) return "";
    const capTries = Math.min(tries || Infinity, spend ? Math.floor(spend / fee + 1e-9) : Infinity);
    const nine = triesFor(p, 0.9);
    const mean = 1 / p;
    const bits = [`Each try lands ${t === AUTO_BLACK ? `a ${esc(BLACK_LABEL.word)}` : `${t === 10 ? "a 10" : `${t} or better`}`} ${pct(p)} of the time.`];
    bits.push(`That's about ${whole(Math.max(1, Math.round(mean)))} ${Math.round(mean) === 1 ? "try" : "tries"} on average, ${COIN_IMG}${coins(fee * mean)}.`);
    if (Number.isFinite(capTries) && capTries >= 1) {
      bits.push(`With your stops (${whole(capTries)} ${capTries === 1 ? "try" : "tries"} at most) it lands ${pct(hitWithin(p, capTries))} of the time.`);
    } else if (Number.isFinite(nine)) {
      bits.push(`Nine runs in ten land within ${whole(nine)} tries.`);
    }
    return bits.join(" ");
  }

  async function paintSetup() {
    const s = h.slabById(view.slabId);
    if (!s) {
      h.root.innerHTML = `<div class="gd-page">${h.back("/grading", "Your slabs")}<p class="gd-empty">That slab isn't in your collection. It may have been cracked, sold or regraded.</p></div>`;
      return;
    }
    const { card, set } = await h.ensureCard(s.cardId);
    if (!h.isVisible() || view?.kind !== "setup" || view.slabId !== s.id) return;
    if (!card) {
      h.root.innerHTML = `<div class="gd-page">${h.back(`/grading/${s.id}`, "Back to the slab")}<p class="gd-empty">That card has no price right now, so it can't be regraded.</p></div>`;
      return;
    }
    const band = bandFor(set);
    const fee = gradingFee(card);
    const targets = targetsFor(s);
    if (!targets.includes(target)) target = targets.includes(10) ? 10 : targets[targets.length - 1] || 0;
    const balance = h.coinsNow();
    const spend = Number(maxSpend) > 0 ? Number(maxSpend) : 0;
    const tries = Math.floor(Number(maxTries)) || 0;
    const short = balance + 1e-9 < fee;
    h.root.innerHTML = `<div class="gd-page gd-slab-page gd-auto-page">
      ${h.back(`/grading/${s.id}`, "Back to the slab")}
      <div class="gd-slab-layout">
        ${h.stageHTML(`<div class="gd-stand rt-drop">${h.slabMarkup(s, "inspect")}</div>`, "gd-slab-stage")}
        <div class="gd-slab-copy">
          <h1 class="gd-slab-h">Auto-regrade</h1>
          <p class="gd-cardline">${esc(card.name)}, now ${s.blackLabel ? esc(BLACK_LABEL.word) : `${s.grade} ${esc(GRADE_WORDS[s.grade])}`}</p>
          ${
            targets.length
              ? `<section class="rt-box gd-autobox" aria-labelledby="gd-auto-t">
              <div class="gd-box-head"><h2 id="gd-auto-t">Stop when it lands</h2><span>${esc(targetWord(target))}</span></div>
              <div class="gd-words gd-auto-targets" role="group" aria-label="Target grade">
                ${targets.map((t) => `<button type="button" class="rt-word ${t === target ? "on" : ""}" aria-pressed="${t === target}" data-ga-target="${t}" ${starting ? "disabled" : ""}>${esc(targetShort(t))}</button>`).join("")}
              </div>
              <div class="gd-auto-stops">
                <label class="gd-auto-field"><span>Spend at most</span><span class="gd-auto-input">${COIN_IMG}<input type="number" inputmode="decimal" min="${fee}" step="any" placeholder="No limit" value="${esc(maxSpend)}" data-ga-spend ${starting ? "disabled" : ""}></span></label>
                <label class="gd-auto-field"><span>Try at most</span><span class="gd-auto-input"><input type="number" inputmode="numeric" min="1" max="${AUTO_LIMITS.maxTries}" step="1" value="${esc(maxTries)}" data-ga-tries ${starting ? "disabled" : ""}><small>times</small></span></label>
              </div>
              <p class="gd-auto-odds" data-ga-odds>${oddsLine(band, fee, target, tries, spend)}</p>
            </section>
            <dl class="rt-box gd-figs">
              <div class="is-fee"><dt>Each try</dt><dd><b>${COIN_IMG}${coins(fee)}</b><small>the grading fee</small></dd></div>
              <div><dt>Odds</dt><dd><b>Same</b><small>as grading by hand</small></dd></div>
              <div class="${short ? "is-short" : ""}"><dt>You have</dt><dd><b>${COIN_IMG}${coins(balance)}</b><small>${whole(Math.floor(balance / fee + 1e-9))} tries' worth</small></dd></div>
            </dl>
            <p class="gd-error" role="alert" ${error ? "" : "hidden"}>${error}</p>
            <div class="gd-send-go"><button type="button" class="solid rt-go gd-send-btn" data-ga-start ${starting || short ? "disabled" : ""}>${starting ? "Starting" : "Start auto-regrade"}</button></div>
            ${short ? `<small class="gd-reason">Needs ${coins(fee)} coins for the first try, you have ${coins(balance)}.</small>` : ""}
            <p class="gd-policy">Each try cracks the slab you have and sends the card straight back in for a new fee, exactly like the Regrade key. It stops the moment it lands ${esc(targetWord(target))}, or at your limits, or when you run out of coins. ${target === AUTO_BLACK ? "Plain 10s get cracked too on the way to a Black Label. " : ""}Your guard and profile spot stay on the slab. Leaving this page stops the run.</p>`
              : `<p class="gd-reason">This slab is already a ${esc(BLACK_LABEL.word)}. There's nothing higher to roll for.</p>`
          }
          ${h.fine()}
        </div>
      </div>
    </div>`;
  }

  /** Redraw only the odds line while the player types, so the field keeps its cursor. */
  async function repaintOdds() {
    const s = h.slabById(view?.slabId);
    const el = h.root.querySelector("[data-ga-odds]");
    if (!s || !el) return;
    const { card, set } = await h.ensureCard(s.cardId);
    if (!card) return;
    el.innerHTML = oddsLine(bandFor(set), gradingFee(card), target, Math.floor(Number(maxTries)) || 0, Number(maxSpend) > 0 ? Number(maxSpend) : 0);
  }

  async function begin() {
    const s = h.slabById(view?.slabId);
    if (!s || starting) return;
    const tries = Math.floor(Number(maxTries));
    if (!(tries >= 1 && tries <= AUTO_LIMITS.maxTries)) {
      error = `Set a try limit from 1 to ${whole(AUTO_LIMITS.maxTries)}.`;
      return paint();
    }
    const spend = maxSpend === "" ? null : Number(maxSpend);
    if (spend != null && !(spend > 0)) {
      error = "Set a spending limit above zero, or leave it empty.";
      return paint();
    }
    const card = (await h.ensureCard(s.cardId)).card;
    const fee = card ? gradingFee(card) : 0;
    const worst = Math.min(tries * fee, spend ?? Infinity);
    const ok = await h.confirmSheet({
      title: `Auto-regrade to ${esc(targetWord(target))}?`,
      body: `The ${s.blackLabel ? esc(BLACK_LABEL.word) : `${s.grade} ${esc(GRADE_WORDS[s.grade])}`} you have now is cracked on the first try. Each try costs ${h.coinTag(fee)}, and this run can spend up to ${h.coinTag(worst)}${spend == null ? ` (${whole(tries)} tries)` : ""}. Fees aren't refunded, and the run can end lower than it started.`,
      confirm: "Start",
      cancel: "Not yet",
    });
    if (!ok || !h.isVisible() || view?.kind !== "setup") return;
    starting = true;
    error = "";
    startId = startId || uuid();
    paint();
    try {
      const res = await h.post("/api/grading/auto/start", { slabId: s.id, target: target === AUTO_BLACK ? "bl" : target, maxTries: tries, maxSpend: spend, requestId: startId });
      startId = "";
      starting = false;
      run = res.run;
      slab = res.slab;
      lastTry = null;
      openRun(run.id, true);
    } catch (err) {
      starting = false;
      if (err?.status) startId = ""; // refused: the next press is a new start
      if (err?.status === 409 && /already have/.test(err.message || "")) {
        const live = await h.api("/api/grading/auto").catch(() => null);
        error = live?.run ? `${esc(err.message)} <a href="/grading/auto/${live.run.id}" data-gd-link>Open it</a>` : esc(err.message);
      } else error = esc(h.errorLine(err));
      if (h.isVisible() && view?.kind === "setup") paint();
    }
  }

  // ---- The run ----------------------------------------------------------------------
  /** Swap the setup for the run page (the setup's slab is gone after the first try, so Back skips it). */
  function openRun(runId, drive) {
    view = { kind: "run", runId };
    h.navigate(`/grading/auto/${runId}`, { replace: true });
    if (drive && h.isVisible() && view?.kind === "run" && view.runId === runId) {
      startLoop();
      paint();
    }
  }

  const statusOf = () => (!run ? "loading" : run.status !== "running" ? "done" : driving ? "live" : "paused");

  function tallyRows(r) {
    const keys = ["bl", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"].filter((k) => r.tally?.[k]);
    if (!keys.length) return "";
    const top = Math.max(...keys.map((k) => r.tally[k]));
    return `<dl class="gd-auto-tally" aria-label="Grades rolled">${keys
      .map((k) => {
        const n = r.tally[k];
        return `<div${k === "bl" ? ' class="is-black"' : ""}><dt>${h.gradePlate(k === "bl" ? 10 : Number(k), k === "bl", "xs")}</dt><dd><span class="gd-rate-bar" aria-hidden="true"><i style="transform:scaleX(${(n / top).toFixed(3)})"></i></span><b>${whole(n)}</b></dd></div>`;
      })
      .join("")}</dl>`;
  }

  function meters(r) {
    const spendShare = r.maxSpend ? Math.max(0, 1 - r.spent / r.maxSpend) : null;
    const triesShare = Math.max(0, 1 - r.tries / r.maxTries);
    return `<div class="gd-auto-meters">
      <div class="gd-auto-meter"><div class="gd-auto-meter-top"><span>Tries</span><b data-ga-tries-n>${whole(r.tries)}</b><small>of ${whole(r.maxTries)}</small></div>
        <div class="rt-hp"><em>Left</em><span class="rt-track"><i data-ga-tries-bar style="transform:scaleX(${triesShare.toFixed(4)})"></i></span></div></div>
      <div class="gd-auto-meter"><div class="gd-auto-meter-top"><span>Spent</span><b>${COIN_IMG}<span data-ga-spent>${coins(r.spent)}</span></b>${r.maxSpend ? `<small>of ${coins(r.maxSpend)}</small>` : ""}</div>
        ${spendShare == null ? "" : `<div class="rt-hp"><em>Left</em><span class="rt-track"><i data-ga-spend-bar style="transform:scaleX(${spendShare.toFixed(4)})"></i></span></div>`}</div>
    </div>`;
  }

  async function paintRun() {
    if (!run || run.id !== view.runId) {
      h.root.innerHTML = `<div class="gd-page">${h.back("/grading", "Grading")}<p class="gd-empty">Loading the run.</p></div>`;
      try {
        const res = await h.api(`/api/grading/auto?run=${view.runId}`);
        if (!h.isVisible() || view?.kind !== "run") return;
        run = res.run;
        slab = res.slab;
      } catch (err) {
        if (!h.isVisible() || view?.kind !== "run") return;
        h.root.innerHTML = `<div class="gd-page">${h.back("/grading", "Grading")}<p class="gd-empty">${esc(err?.status === 404 ? "That run isn't yours or doesn't exist." : h.errorLine(err))}</p></div>`;
        return;
      }
    }
    const r = run;
    const shown = slab;
    if (shown) await h.ensureCard(shown.cardId);
    else await h.ensureCard(r.cardId);
    if (!h.isVisible() || view?.kind !== "run" || run !== r) return;
    const st = statusOf();
    const hit = r.status === "hit";
    const plate = lastTry || (shown ? { grade: shown.grade, blackLabel: shown.blackLabel } : { grade: r.startGrade, blackLabel: r.startBlack });
    const title = st === "live" ? "Regrading" : st === "paused" ? "Paused" : hit ? (plate.blackLabel ? `Landed a ${BLACK_LABEL.word}` : `Landed ${plate.grade === 8 ? "an" : "a"} ${plate.grade}`) : "Stopped";
    const startWords = r.startBlack ? BLACK_LABEL.word : `${r.startGrade} ${GRADE_WORDS[r.startGrade]}`;
    h.root.innerHTML = `<div class="gd-page gd-slab-page gd-auto-page is-${st}">
      ${h.back(shown ? `/grading/${shown.id}` : "/grading", shown ? "Back to the slab" : "Grading")}
      <div class="gd-slab-layout">
        ${h.stageHTML(`<div class="gd-stand rt-drop gd-auto-stand" data-ga-stand>${shown ? h.slabMarkup(shown, "inspect") : `<p class="gd-empty">The slab left your collection.</p>`}</div>`, "gd-slab-stage")}
        <div class="gd-slab-copy">
          <h1 class="gd-slab-h" data-ga-title>${esc(title)}</h1>
          <div class="gd-slab-sub"><span data-ga-plate>${h.gradePlate(plate.grade, plate.blackLabel, "big")}</span></div>
          <p class="gd-cardline">Target ${esc(targetWord(r.target))}. Started from ${esc(startWords)}.</p>
          ${meters(r)}
          ${st === "done" ? `<p class="gd-auto-reason${hit ? " is-hit" : ""}">${esc(r.reasonText || "")}</p>` : ""}
          ${st === "paused" ? `<p class="gd-auto-reason">The page was closed mid-run, so it's waiting. Nothing is charged while it waits.</p>` : ""}
          <p class="gd-error" role="alert" ${error ? "" : "hidden"}>${esc(error)}</p>
          <div class="gd-slab-actions gd-auto-actions">
            ${
              st === "live"
                ? `<button type="button" class="ghost" data-ga-stop ${stopping ? "disabled" : ""}>${stopping ? "Stopping" : "Stop"}</button>`
                : st === "paused"
                  ? `<button type="button" class="solid rt-go" data-ga-resume>Keep going</button><button type="button" class="ghost" data-ga-stop ${stopping ? "disabled" : ""}>${stopping ? "Stopping" : "Stop here"}</button>`
                  : `${shown ? `<a class="solid rt-go" href="/grading/${shown.id}" data-gd-link>See the slab</a>` : ""}${shown && !hit && targetsFor(shown).length ? `<a class="ghost" href="/grading/${shown.id}/auto" data-gd-link>Run again</a>` : ""}`
            }
          </div>
          <section class="rt-box gd-autobox gd-auto-summary" aria-labelledby="gd-auto-s" ${r.tries ? "" : "hidden"} data-ga-summary>
            <div class="gd-box-head"><h2 id="gd-auto-s">${st === "done" ? "How it went" : "So far"}</h2><span data-ga-avg>${r.tries ? `${COIN_IMG}${coins(r.spent / r.tries)} a try` : ""}</span></div>
            <div data-ga-tally>${tallyRows(r)}</div>
          </section>
          ${h.fine()}
        </div>
      </div>
    </div>`;
  }

  /** Update the figures in place while the run plays, so the slab and the page don't flash. */
  function tick(r, tr, card) {
    const root = h.root;
    if (tr) {
      lastTry = { grade: tr.grade, blackLabel: tr.blackLabel };
      const plate = root.querySelector("[data-ga-plate]");
      if (plate) {
        plate.innerHTML = h.gradePlate(tr.grade, tr.blackLabel, "big");
        plate.firstElementChild?.classList.add("is-new");
      }
      const stand = root.querySelector("[data-ga-stand]");
      if (stand && card) {
        stand.innerHTML = h.slabMarkup({ ...(slab || {}), id: slab?.id || 0, grade: tr.grade, blackLabel: tr.blackLabel }, "inspect");
        stand.classList.remove("is-swap");
        void stand.offsetWidth;
        stand.classList.add("is-swap");
      }
    }
    const n = tr ? tr.n : r.tries;
    const spent = tr ? tr.spent : r.spent;
    const set = (sel, text) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = text;
    };
    set("[data-ga-tries-n]", whole(n));
    set("[data-ga-spent]", coins(spent));
    const tb = root.querySelector("[data-ga-tries-bar]");
    if (tb) tb.style.transform = `scaleX(${Math.max(0, 1 - n / r.maxTries).toFixed(4)})`;
    const sb = root.querySelector("[data-ga-spend-bar]");
    if (sb && r.maxSpend) sb.style.transform = `scaleX(${Math.max(0, 1 - spent / r.maxSpend).toFixed(4)})`;
  }

  function paintTally(r) {
    const box = h.root.querySelector("[data-ga-summary]");
    if (!box) return;
    box.hidden = !r.tries;
    const t = box.querySelector("[data-ga-tally]");
    if (t) t.innerHTML = tallyRows(r);
    const avg = box.querySelector("[data-ga-avg]");
    if (avg) avg.innerHTML = r.tries ? `${COIN_IMG}${coins(r.spent / r.tries)} a try` : "";
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function startLoop() {
    const token = ++loopToken;
    driving = true;
    error = "";
    let failures = 0;
    const alive = () => token === loopToken && h.isVisible() && view?.kind === "run";
    while (alive() && run?.status === "running") {
      let res;
      try {
        res = await h.post("/api/grading/auto/step", { runId: run.id });
        failures = 0;
      } catch (err) {
        if (!alive()) return;
        if (!err?.status && ++failures < 4) {
          await wait(600 * failures); // a dropped connection: the run row knows where it was, so asking again is safe
          continue;
        }
        driving = false;
        error = h.errorLine(err, "The run is paused; nothing was charged for a try that didn't happen.");
        try {
          const fresh = await h.api(`/api/grading/auto?run=${run.id}`);
          run = fresh.run;
          slab = fresh.slab;
        } catch {
          /* keep what we had */
        }
        paint();
        return;
      }
      if (!alive()) {
        run = res.run;
        slab = res.slab;
        return;
      }
      const before = run;
      const tries = res.tries || [];
      // Play the tries back one by one, with the running total as it was after each.
      if (tries.length && h.motion()) {
        let spent = before.spent;
        const card = Boolean(res.slab || slab);
        for (const tr of tries) {
          spent = Math.round((spent + tr.fee) * 100) / 100;
          tick(res.run, { ...tr, spent }, card);
          await wait(TRY_MS);
          if (!alive()) break;
        }
      } else if (tries.length) {
        const tr = tries[tries.length - 1];
        lastTry = { grade: tr.grade, blackLabel: tr.blackLabel };
      }
      run = res.run;
      slab = res.slab;
      if (!alive()) return;
      if (run.status === "running") {
        tick(run, null);
        paintTally(run);
      }
    }
    if (token !== loopToken) return;
    driving = false;
    stopping = false;
    if (h.isVisible() && view?.kind === "run") {
      paint();
      if (run?.status === "hit") h.toast(run.target === AUTO_BLACK ? `${BLACK_LABEL.word} on try ${whole(run.tries)}.` : `Landed on try ${whole(run.tries)}.`);
      h.refresh();
    }
  }

  async function stopRun() {
    if (!run || stopping) return;
    stopping = true;
    loopToken++; // the loop stops asking for tries now
    driving = false;
    paint();
    try {
      const res = await h.post("/api/grading/auto/stop", { runId: run.id });
      run = res.run;
      slab = res.slab;
      error = "";
    } catch (err) {
      error = h.errorLine(err);
    }
    stopping = false;
    if (h.isVisible() && view?.kind === "run") paint();
    h.refresh();
  }

  // ---- Wiring -----------------------------------------------------------------------
  function paint() {
    if (!view) return Promise.resolve();
    return view.kind === "setup" ? paintSetup() : paintRun();
  }

  /** Called by initGrading's show() for /grading/<id>/auto and /grading/auto/<id>. */
  function show(next) {
    const same = view && next.kind === view.kind && (next.kind === "run" ? next.runId === view.runId : next.slabId === view.slabId);
    if (!same) {
      if (next.kind === "setup") {
        target = 0;
        error = "";
        startId = "";
      } else {
        error = "";
        if (!run || run.id !== next.runId) {
          run = null;
          slab = null;
          lastTry = null;
        }
      }
    }
    view = next;
  }

  /** Leaving the page ends a live run: the loop is this page. */
  function hide() {
    if (driving && run?.status === "running") {
      const id = run.id;
      loopToken++;
      driving = false;
      h.post("/api/grading/auto/stop", { runId: id }).then((res) => { run = res.run; slab = res.slab; }, () => {});
    }
    view = null;
  }

  /** While a run plays, the page owns its DOM: a refresh() from initGrading must not redraw over it. */
  const busy = () => driving;

  function click(t) {
    const tb = t.closest("[data-ga-target]");
    if (tb) {
      target = Number(tb.dataset.gaTarget);
      error = "";
      paint().then(() => h.root.querySelector(`[data-ga-target="${target}"]`)?.classList.add("is-pick"));
      return true;
    }
    if (t.closest("[data-ga-start]")) {
      begin();
      return true;
    }
    if (t.closest("[data-ga-stop]")) {
      stopRun();
      return true;
    }
    if (t.closest("[data-ga-resume]")) {
      startLoop();
      paint();
      return true;
    }
    return false;
  }

  function input(t) {
    if (t.matches?.("[data-ga-spend]")) maxSpend = t.value;
    else if (t.matches?.("[data-ga-tries]")) maxTries = t.value;
    else return false;
    repaintOdds();
    return true;
  }

  return { show, hide, paint, click, input, busy };
}
