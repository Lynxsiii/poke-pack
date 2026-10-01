/* RIP Grading: the /grading pages. Send a card from the collection to be graded
   (the Worker draws the grade, once, at submit), look at the slabs that came
   back, buy slab guards and put them on a slab.

   Everything that changes money or cards is a POST answered with a fresh save;
   this module applies it (deps.applySave) and redraws from that. A submission
   carries a requestId made once per attempt: a retry after a network error
   sends the same id, so the Worker answers with the slab it already made and
   nothing is graded twice. Routes:

     /grading                 the landing: how it works, the latest slabs, the guard shop
     /grading/graded          every slab, sortable, with what sits on the profile
     /grading/send            pick an owned card
     /grading/send/<cardId>   fee, odds, disclaimer, the send button, then the reveal
     /grading/<slabId>        one slab large, guard controls, crack and sell

   deps: { root, api, getSave, applySave, cardFace, findCard, loadSetData, inspect,
           toast, navigate, coinTag, user?, signIn? } */
import {
  GRADING_BRAND,
  GRADE_WORDS,
  GRADING_FEE,
  GRADING_LIMITS,
  GUARDS,
  bandFor,
  gradingFee,
  gradedValue,
} from "./grading-rules.js";
import { slabHTML, revealSlab, guardName, gradeWord } from "./slab.js";
import { uuid, slabTileHTML } from "./casino-kit.js";
import { gateLock, gateNoticeHTML, gateRefusal } from "./gate-notice.js";
import { esc, coins } from "./battle-kit.js";
import { ALL_SETS, sellValue } from "./catalog.js";

/** The paths this page answers. app.js uses it to route and to allow navigate(). */
export const GRADING_ROUTE = /^\/grading(?:\/send(?:\/([a-zA-Z0-9-]{1,60}))?|\/graded|\/(\d{1,12}))?$/;

const PICK_PAGE = 60;
const RECENT_SLABS = 6;
const GRADED_SORTS = [
  ["newest", "Newest"],
  ["grade", "Highest grade"],
  ["value", "Value"],
  ["name", "Name"],
];
const ATTEMPT_KEY = "gd-attempt";
const ATTEMPT_TTL = 15 * 60 * 1000;
const GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SETS_LONGEST_FIRST = [...ALL_SETS].sort((a, b) => b.id.length - a.id.length);

const setOfCard = (cardId) => SETS_LONGEST_FIRST.find((set) => String(cardId || "").startsWith(`${set.id}-`)) || null;
const pct = (bp) => `${(bp / 100).toFixed(1)}%`;
const dateWords = (ms) => {
  const d = new Date(Number(ms) || Date.now());
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const article = (grade) => (grade === 8 ? "an" : "a");
/** "017/084", the same line the collection and the slab label print. */
const numberLine = (card, set) => {
  if (!card) return "";
  if (card.energy || card.number === "\u2014") return "Energy";
  if (card.printedNumber) return card.printedNumber;
  const total = set?.printedTotal != null ? String(set.printedTotal) : "";
  if (!total) return String(card.number || "");
  const width = Math.max(3, total.length);
  return `${String(card.number || "").padStart(width, "0")}/${total.padStart(width, "0")}`;
};
const readAttempt = () => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || "null");
    return raw && Date.now() - (raw.at || 0) < ATTEMPT_TTL ? raw : null;
  } catch {
    return null;
  }
};
const writeAttempt = (attempt) => {
  try {
    if (attempt) sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    /* private mode: the id still lives in memory for this page */
  }
};

export function initGrading(deps) {
  const root = deps.root;
  if (!root) return { show() {}, hide() {}, render() {}, path: "/grading" };
  root.classList.add("grading-view");
  const coinTag = deps.coinTag || ((v, cls = "") => `<span class="bt-coins ${cls}"><span aria-hidden="true">✦</span> ${coins(v)}</span>`);
  const toast = (msg) => deps.toast?.(msg);
  const navigate = (path) => deps.navigate?.(path);

  // What the server said last: active slabs and guard stock. Also fed from every save.
  const data = { slabs: [], inGame: [], owned: {}, loaded: false, signedOut: false };
  let route = { kind: "landing", slabId: 0, cardId: "" };
  let visible = false;
  let refreshToken = 0;
  let observer = null;
  let sheet = null;

  // The send page.
  let reverse = false;
  let sendReverse = null; // set by the picker before navigate(), read once by show()
  let stage = "form"; // form | sending | reveal | done
  let attempt = null; // { requestId, cardId, reverse, at }
  let sendError = "";
  let revealed = null; // the slab just graded

  // The Graded page.
  let gradedSort = "newest";

  // The picker.
  let pickQuery = "";
  let pickSort = "value";
  let pickShown = PICK_PAGE;
  let pickEntries = null;

  // The shop and a slab's guard controls.
  const shopQty = {};
  const buyAttempts = {};
  let buying = "";
  let slabPick; // undefined = nothing picked yet, null = "None", else a guard id
  let slabBusy = false;
  let slabError = "";
  let slabSaleId = "";

  // ---- State helpers ------------------------------------------------------
  const save = () => deps.getSave?.() || {};
  const coinsNow = () => Number(save().coins || 0);
  const signedIn = () => (deps.user ? Boolean(deps.user()) : !data.signedOut);
  // Level gate (js/levels.js GATES): shut for a level-too-low player who has never graded a card.
  const lock = () => (data.loaded ? gateLock("grading", deps.user?.(), data.slabs.length > 0) : null);
  const motion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches && !document.body.classList.contains("no-motion");

  function syncFromSave(s) {
    if (!s) return;
    if (Array.isArray(s.graded)) data.slabs = s.graded;
    if (s.gear && typeof s.gear === "object" && s.gear.guards && typeof s.gear.guards === "object") data.owned = s.gear.guards;
  }
  const slabById = (id) => data.slabs.find((s) => Number(s.id) === Number(id)) || null;
  const equippedCount = (guardId) => data.slabs.filter((s) => s.guard === guardId).length;
  const ownedOf = (guardId) => Number(data.owned[guardId] || 0);
  const freeOf = (guardId) => Math.max(0, ownedOf(guardId) - equippedCount(guardId));
  const guardOf = (id) => GUARDS.find((g) => g.id === id) || null;
  const shownCount = () => data.slabs.filter((s) => s.shown).length;
  const handleNow = () => deps.user?.()?.handle || "";
  const sortedSlabs = (by) => {
    const name = (s) => deps.findCard(s.cardId)?.name || s.cardId;
    const list = [...data.slabs];
    if (by === "grade") return list.sort((a, b) => b.grade - a.grade || b.value - a.value || (b.gradedAt || 0) - (a.gradedAt || 0));
    if (by === "value") return list.sort((a, b) => b.value - a.value || b.grade - a.grade);
    if (by === "name") return list.sort((a, b) => name(a).localeCompare(name(b)) || b.grade - a.grade);
    return list.sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0) || b.id - a.id);
  };
  const plainOwned = (cardId) => Math.max(0, Number(save().collection?.[cardId] || 0) - Number(save().reverses?.[cardId] || 0));
  const reverseOwned = (cardId) => Number(save().reverses?.[cardId] || 0);

  async function ensureCard(cardId) {
    const set = setOfCard(cardId);
    if (!set) return { card: null, set: null };
    let card = deps.findCard(cardId);
    if (!card) {
      try {
        await deps.loadSetData(set);
      } catch {
        /* the page says the card could not load */
      }
      card = deps.findCard(cardId);
    }
    return { card, set };
  }

  async function ensureSlabCards(slabs) {
    const sets = new Map();
    for (const slab of slabs) {
      const set = setOfCard(slab.cardId);
      if (set && !deps.findCard(slab.cardId)) sets.set(set.id, set);
    }
    await Promise.all([...sets.values()].map((set) => deps.loadSetData(set).catch(() => null)));
  }

  const faceOf = (card, isReverse, opts) => deps.cardFace(card && isReverse ? { ...card, reverse: true } : card, opts);

  function slabMarkup(slab, size, cls = "", guardOverride) {
    const card = deps.findCard(slab.cardId);
    const set = setOfCard(slab.cardId);
    const shown = guardOverride === undefined ? slab : { ...slab, guard: guardOverride };
    return slabHTML({ face: faceOf(card, slab.reverse, size === "grid" ? { small: true } : undefined), card, slab: shown, set, size, cls });
  }

  /** Highest grade, then value: the slab the shop previews guards on. */
  function bestSlab() {
    return [...data.slabs].sort((a, b) => b.grade - a.grade || b.value - a.value)[0] || null;
  }

  /** A stand-in slab for the shop when the player has none yet. */
  async function sampleSlab() {
    let cardId = "";
    let best = 0;
    for (const [id, qty] of Object.entries(save().collection || {})) {
      if (!(qty > 0)) continue;
      const card = deps.findCard(id);
      const value = card ? sellValue(card) : 0;
      if (card?.image && value > best) {
        best = value;
        cardId = id;
      }
    }
    if (!cardId) {
      const set = ALL_SETS.find((s) => s.live) || ALL_SETS[0];
      try {
        const list = await deps.loadSetData(set);
        cardId = list?.find((c) => c.image)?.id || "";
      } catch {
        return null;
      }
    }
    const card = deps.findCard(cardId);
    if (!card) return null;
    const set = setOfCard(cardId);
    return { id: 0, cert: "RIP-0000000", cardId, reverse: false, grade: 10, band: bandFor(set).id, fee: 0, value: gradedValue(card, 10, set), guard: null, gradedAt: Date.now(), sample: true };
  }

  // ---- Server --------------------------------------------------------------
  async function refresh() {
    const at = ++refreshToken;
    try {
      const res = await deps.api("/api/grading");
      if (at !== refreshToken) return;
      data.slabs = Array.isArray(res.slabs) ? res.slabs : [];
      // Slabs on a casino table; an older server does not send the list.
      data.inGame = Array.isArray(res.inGame) ? res.inGame : [];
      data.owned = res.guards?.owned || {};
      data.loaded = true;
      data.signedOut = false;
    } catch (err) {
      if (at !== refreshToken) return;
      if (err?.status === 401) data.signedOut = true;
      else if (!data.loaded) toast(err?.message || "Couldn't load your slabs.");
    }
    if (visible && (stage === "form" || route.kind !== "send")) render();
  }

  async function post(path, body) {
    const res = await deps.api(path, { method: "POST", body: JSON.stringify(body) });
    if (res?.save) {
      deps.applySave(res.save);
      syncFromSave(res.save);
    }
    return res;
  }

  const isNetwork = (err) => !err?.status;
  const errorLine = (err, retry = "Try again.") => (isNetwork(err) ? `Couldn't reach the server. ${retry}` : err.message || "That didn't work.");

  // ---- Small pieces ------------------------------------------------------------
  const mark = (cls = "") => `<span class="gd-mark ${cls}" aria-label="${esc(GRADING_BRAND.name)}"><b>${esc(GRADING_BRAND.short)}</b><span>Grading</span></span>`;
  const fine = () => `<p class="gd-fine">${esc(GRADING_BRAND.disclaimer)}</p>`;
  const back = (href, label) => `<a class="gd-back" href="${href}" data-gd-link>${esc(label)}</a>`;
  const gate = () => `<div class="gd-page gd-landing">
      <header class="gd-head">${mark()}<h1 class="page-title">Grading</h1>
      <p class="gd-lede">${esc(GRADING_BRAND.tagline)} Send a card from your collection and it comes back sealed in a slab with a grade on the label.</p></header>
      <div class="need-account"><p>Slabs live on your account. Sign in to send a card.</p>
      <div class="account-hero-actions">
        <button class="solid" type="button" data-open-auth="signup">Create account</button>
        <button class="ghost" type="button" data-open-auth="signin">Sign in</button></div></div>
      ${fine()}</div>`;

  function slabTile(slab) {
    const card = deps.findCard(slab.cardId);
    return `<a class="gd-slab-tile" href="/grading/${Number(slab.id)}" data-gd-link>
      <span class="gd-slab-holder" data-slab-holder="${Number(slab.id)}"></span>
      <span class="gd-slab-caption"><b>${esc(card?.name || slab.cardId)}</b><small>${slab.grade} ${esc(gradeWord(slab.grade))} · ${coinTag(slab.value)}${slab.shown ? `<span class="gd-onprofile"> · On profile</span>` : ""}</small></span>
    </a>`;
  }

  /** Slabs staked in a coinflip or a jackpot: read-only, each one links to its table. */
  function inCasinoHTML() {
    const list = data.inGame.filter((s) => s && (s.game === "coinflip" || s.game === "jackpot") && s.gameId);
    if (!list.length) return "";
    return `<section class="gd-section gd-incasino" aria-labelledby="gd-ic-h">
      <h2 class="gd-h" id="gd-ic-h">In the casino <span>${list.length}</span></h2>
      <p class="gd-sub">These slabs are on a table right now. They come back to you, or change hands, when the game ends. A guard stays with you if a slab is lost.</p>
      <ul class="gd-ic-list">${list
        .map((slab) => {
          const card = deps.findCard(slab.cardId);
          const name = slab.name || card?.name || slab.cardId;
          return `<li><a class="gd-ic-row" href="/casino/${esc(slab.game)}/${esc(slab.gameId)}" data-gd-link>
            <span class="gd-ic-thumb" aria-hidden="true">${slabTileHTML(slab, "mini")}</span>
            <span class="gd-ic-copy"><b>${esc(name)}</b><small>${Number(slab.grade)} ${esc(gradeWord(slab.grade))} · ${coinTag(slab.value)}</small></span>
            <span class="gd-ic-where">In a ${slab.game === "jackpot" ? "jackpot" : "coinflip"}</span>
          </a></li>`;
        })
        .join("")}</ul>
    </section>`;
  }

  function windowSlabs() {
    observer?.disconnect();
    observer = null;
    const holders = [...root.querySelectorAll("[data-slab-holder]")];
    if (!holders.length) return;
    const draw = (holder) => {
      if (holder.firstElementChild) return;
      const slab = slabById(holder.dataset.slabHolder);
      if (slab) holder.innerHTML = slabMarkup(slab, "grid");
    };
    if (!("IntersectionObserver" in window)) {
      holders.forEach(draw);
      return;
    }
    observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && draw(entry.target)),
      { rootMargin: "60% 0px" }
    );
    holders.forEach((holder) => observer.observe(holder));
  }

  // ---- The landing -------------------------------------------------------------
  async function paintLanding() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    const slabs = sortedSlabs("newest");
    const recent = slabs.slice(0, RECENT_SLABS);
    await ensureSlabCards(recent);
    const preview = bestSlab() || (await sampleSlab());
    if (!visible || route.kind !== "landing") return;
    const worth = slabs.reduce((n, s) => n + (Number(s.value) || 0), 0);
    const onProfile = shownCount();
    pendingPreview = preview;
    const balance = coinsNow();
    root.innerHTML = `<div class="gd-page gd-landing">
      <header class="gd-head">
        ${mark()}
        <h1 class="page-title">Grading</h1>
        <p class="gd-lede">${esc(GRADING_BRAND.tagline)} Send a card from your collection and it comes back sealed in a slab, with a grade on the label and a value to match.</p>
      </header>
      ${gateNoticeHTML(lock())}
      <section class="gd-how panel" aria-labelledby="gd-how-h">
        <h2 class="gd-panel-h" id="gd-how-h">How it works</h2>
        <ol class="gd-lines">
          <li><b>The fee</b> is ${GRADING_FEE.flat} coins plus ${Math.round(GRADING_FEE.rate * 100)}% of the card's market value, taken when you send it.</li>
          <li><b>The grade</b> is drawn by the server the moment you submit. One draw, no rerolls, and it stays on the card.</li>
          <li><b>Older sets</b> come back a 10 less often. You see the exact odds for a card before you send it.</li>
        </ol>
        ${fine()}
        <div class="gd-actions"><a class="solid${lock() ? " is-gated" : ""}" href="/grading/send" data-gd-link>Send a card</a></div>
      </section>
      <section class="gd-section" aria-labelledby="gd-slabs-h">
        <div class="gd-section-head">
          <h2 class="gd-h" id="gd-slabs-h">Graded <span>${slabs.length}${slabs.length >= GRADING_LIMITS.maxSlabs ? ` of ${GRADING_LIMITS.maxSlabs}` : ""}</span></h2>
          ${slabs.length ? `<a class="gd-more-link" href="/grading/graded" data-gd-link>All ${slabs.length} ${slabs.length === 1 ? "slab" : "slabs"}</a>` : ""}
        </div>
        ${
          slabs.length
            ? `<p class="gd-sub">${slabs.length > recent.length ? `The latest ${recent.length}. ` : ""}Worth ${coinTag(worth)} together${onProfile ? `, ${onProfile} on your profile` : ""}.</p>
               <div class="gd-slabs">${recent.map(slabTile).join("")}</div>`
            : `<p class="gd-empty">${data.loaded ? "Nothing in plastic yet. Send a card and it comes back here." : "Loading your slabs."}</p>`
        }
      </section>
      ${inCasinoHTML()}
      <section class="gd-section gd-shop" aria-labelledby="gd-guards-h">
        <h2 class="gd-h" id="gd-guards-h">Slab guards</h2>
        <p class="gd-sub">A bumper around the outside of the case. Cosmetic only: the grade, the label and the value do not change. Buy one here, then put it on from a slab's page.</p>
        <div class="gd-guards">${GUARDS.map((g) => guardShopTile(g, preview, balance)).join("")}</div>
      </section>
    </div>`;
    windowSlabs();
  }

  // ---- Graded: every slab --------------------------------------------------------
  async function paintGraded() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    const slabs = sortedSlabs(gradedSort);
    await ensureSlabCards(slabs);
    if (!visible || route.kind !== "graded") return;
    const worth = slabs.reduce((n, s) => n + (Number(s.value) || 0), 0);
    const best = bestSlab();
    const onProfile = shownCount();
    const handle = handleNow();
    root.innerHTML = `<div class="gd-page gd-graded">
      ${back("/grading", "Grading")}
      <header class="gd-head">
        ${mark()}
        <h1 class="page-title">Graded</h1>
        <p class="gd-lede">Every card of yours in a case. Open a slab to change its guard, show it on your profile, crack it or sell it.</p>
      </header>
      ${
        slabs.length
          ? `<dl class="gd-facts gd-facts-graded">
            <div><dt>Slabs</dt><dd>${slabs.length}${slabs.length >= GRADING_LIMITS.maxSlabs ? ` <small>of ${GRADING_LIMITS.maxSlabs}</small>` : ""}</dd></div>
            <div><dt>Worth together</dt><dd>${coinTag(worth)}</dd></div>
            <div><dt>Best grade</dt><dd>${best ? `${best.grade} ${esc(gradeWord(best.grade))}` : ""}</dd></div>
            <div><dt>On your profile</dt><dd>${onProfile} of ${GRADING_LIMITS.maxShown}${handle ? ` <small><a href="/u/${esc(handle)}">See your profile</a></small>` : ""}</dd></div>
          </dl>
          <div class="gd-graded-tools">
            <span class="gd-words" role="group" aria-label="Sort">${GRADED_SORTS.map(([id, label]) => `<button type="button" data-gd-gsort="${id}" class="${gradedSort === id ? "on" : ""}">${label}</button>`).join("")}</span>
          </div>
          <div class="gd-slabs">${slabs.map(slabTile).join("")}</div>`
          : `<p class="gd-empty">${data.loaded ? "Nothing in plastic yet. Send a card and it comes back here." : "Loading your slabs."}</p>
             <div class="gd-actions"><a class="solid" href="/grading/send" data-gd-link>Send a card</a></div>`
      }
      ${inCasinoHTML()}
    </div>`;
    windowSlabs();
  }

  function guardShopTile(guard, preview, balance) {
    const qty = shopQty[guard.id] || 1;
    const cost = Math.round(guard.price * qty * 100) / 100;
    const owned = ownedOf(guard.id);
    const on = equippedCount(guard.id);
    const short = balance + 1e-9 < cost;
    const isBuying = buying === guard.id;
    const retry = Boolean(buyAttempts[guard.id]);
    return `<div class="gd-gshop" data-gd-shop="${esc(guard.id)}">
      <div class="gd-gshop-preview" aria-hidden="true">${preview ? slabMarkup(preview, "grid", "", guard.id) : ""}</div>
      <div class="gd-gshop-copy">
        <b>${esc(guard.name)}</b>
        <span class="gd-gshop-blurb">${esc(guard.blurb)}</span>
        <span class="gd-gshop-line">${coinTag(guard.price)} each${owned ? ` · you own ${owned}${on ? `, ${on} on a slab` : ""}` : ""}</span>
        <div class="gd-buy">
          <span class="gd-qty" role="group" aria-label="How many">
            <button type="button" data-gd-qty="${esc(guard.id)}:-1" aria-label="One fewer" ${qty <= 1 ? "disabled" : ""}>−</button>
            <output aria-live="polite">${qty}</output>
            <button type="button" data-gd-qty="${esc(guard.id)}:1" aria-label="One more" ${qty >= GRADING_LIMITS.maxGuardQty ? "disabled" : ""}>+</button>
          </span>
          <button type="button" class="ghost" data-gd-buy="${esc(guard.id)}" ${short || isBuying ? "disabled" : ""}>${isBuying ? "Buying" : retry ? "Try again" : `Buy · ${coinTag(cost)}`}</button>
        </div>
        ${short ? `<small class="gd-reason">Needs ${coins(cost)} coins, you have ${coins(balance)}.</small>` : ""}
        <small class="gd-error" data-gd-shop-error="${esc(guard.id)}" role="alert" hidden></small>
      </div>
    </div>`;
  }

  async function buy(guardId) {
    if (buying) return;
    const guard = guardOf(guardId);
    if (!guard) return;
    const qty = shopQty[guardId] || 1;
    const requestId = buyAttempts[guardId] || uuid();
    buyAttempts[guardId] = requestId;
    buying = guardId;
    render();
    try {
      await post("/api/grading/guards/buy", { guardId, qty, requestId });
      delete buyAttempts[guardId];
      buying = "";
      toast(qty > 1 ? `${qty} ${guard.name} guards are yours.` : `A ${guard.name} guard is yours.`);
      render();
    } catch (err) {
      buying = "";
      if (!isNetwork(err)) delete buyAttempts[guardId];
      render();
      const el = root.querySelector(`[data-gd-shop-error="${CSS.escape(guardId)}"]`);
      if (el) {
        el.textContent = errorLine(err, "Your purchase is safe to try again.");
        el.hidden = false;
      }
    }
  }

  // ---- The picker -------------------------------------------------------------
  async function loadPickEntries() {
    const owned = save().collection || {};
    const sets = new Map();
    for (const [id, qty] of Object.entries(owned)) {
      if (!(qty > 0)) continue;
      const set = setOfCard(id);
      if (set) sets.set(set.id, set);
    }
    await Promise.all([...sets.values()].map((set) => deps.loadSetData(set).catch(() => null)));
    const out = [];
    for (const [id, qty] of Object.entries(owned)) {
      if (!(qty > 0)) continue;
      const card = deps.findCard(id);
      const set = setOfCard(id);
      if (!card?.image || !set) continue;
      out.push({ id, owned: Number(qty), reverse: reverseOwned(id), card, set, value: sellValue(card), fee: gradingFee(card) });
    }
    return out;
  }

  function pickList() {
    const q = pickQuery.trim().toLowerCase();
    let list = pickEntries || [];
    if (q) list = list.filter((e) => e.card.name.toLowerCase().includes(q) || String(e.card.number).toLowerCase() === q || e.set.name.toLowerCase().includes(q));
    return [...list].sort(pickSort === "name" ? (a, b) => a.card.name.localeCompare(b.card.name) : (a, b) => b.value - a.value || a.card.name.localeCompare(b.card.name));
  }

  function paintPickGrid() {
    const grid = root.querySelector(".gd-pick-grid");
    if (!grid) return;
    if (!pickEntries) {
      grid.innerHTML = `<p class="gd-empty">Loading your cards.</p>`;
      return;
    }
    const list = pickList();
    const shown = list.slice(0, pickShown);
    grid.innerHTML = list.length
      ? shown
          .map(
            (e) => `<a class="gd-pick-card" href="/grading/send/${esc(e.id)}" data-gd-link>
          <img src="${esc(e.card.imageSmall || e.card.image)}" alt="" loading="lazy" decoding="async" />
          <b>${esc(e.card.name)}</b>
          <small>${esc(e.set.name)} · ${e.owned > 1 ? `own ${e.owned}` : "own 1"}${e.reverse ? ", reverse" : ""}</small>
          <span class="gd-pick-fee">Fee ${coinTag(e.fee)}</span>
        </a>`
          )
          .join("") +
        (list.length > shown.length
          ? `<button class="gd-more ghost" type="button" data-gd-more>Show ${Math.min(PICK_PAGE, list.length - shown.length)} more of ${list.length - shown.length}</button>`
          : "")
      : `<p class="gd-empty">${pickQuery ? "No card matches that." : "You have no cards to send yet. Open some packs first."}</p>`;
  }

  async function paintPicker() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    root.innerHTML = `<div class="gd-page gd-pick">
      ${back("/grading", "Grading")}
      <header class="gd-head">
        <h1 class="page-title">Send a card</h1>
        <p class="gd-lede">Pick a card from your collection. You see the fee and the odds before anything is sent.</p>
      </header>
      ${gateNoticeHTML(lock())}
      <div class="gd-pick-tools">
        <label class="gd-search"><input type="search" inputmode="search" placeholder="Search your cards" autocomplete="off" enterkeyhint="search" value="${esc(pickQuery)}" data-gd-search /></label>
        <span class="gd-words" role="group" aria-label="Sort">
          <button type="button" data-gd-sort="value" class="${pickSort === "value" ? "on" : ""}">Highest value</button>
          <button type="button" data-gd-sort="name" class="${pickSort === "name" ? "on" : ""}">Name</button>
        </span>
      </div>
      <div class="gd-pick-grid"></div>
    </div>`;
    paintPickGrid();
    if (!pickEntries) {
      const entries = await loadPickEntries();
      if (!visible || route.kind !== "send" || route.cardId) return;
      pickEntries = entries;
      paintPickGrid();
    }
  }

  // ---- The send page -------------------------------------------------------
  function oddsRows(band) {
    return GRADES.map((g) => `<li><span><b>${g}</b> ${esc(GRADE_WORDS[g])}</span><output>${pct(band.odds[g])}</output></li>`).join("");
  }

  function expectedWords(band) {
    const mode = GRADES.reduce((best, g) => (band.odds[g] > band.odds[best] ? g : best), 10);
    return `Most cards from ${band.label} sets come back ${article(mode)} ${mode}, ${GRADE_WORDS[mode]}. About ${pct(band.odds[10])} of them are a 10.`;
  }

  async function paintSend() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    const cardId = route.cardId;
    root.innerHTML = `<div class="gd-page gd-send-page">${back("/grading/send", "Pick another card")}<p class="gd-empty">Loading the card.</p></div>`;
    const { card, set } = await ensureCard(cardId);
    if (!visible || route.kind !== "send" || route.cardId !== cardId || stage !== "form") return;
    if (!card || !set) {
      root.innerHTML = `<div class="gd-page gd-send-page">${back("/grading/send", "Pick another card")}<p class="gd-empty">That card isn't in the catalog.</p></div>`;
      return;
    }
    const plain = plainOwned(cardId);
    const rev = reverseOwned(cardId);
    if (reverse && !rev) reverse = false;
    if (!reverse && !plain && rev) reverse = true;
    const owns = reverse ? rev > 0 : plain > 0;
    const band = bandFor(set);
    const fee = gradingFee(card);
    const raw = sellValue(card);
    const balance = coinsNow();
    const short = balance + 1e-9 < fee;
    const busy = stage === "sending";
    const stored = readAttempt();
    if (!attempt && stored && stored.cardId === cardId && Boolean(stored.reverse) === reverse) attempt = stored;
    root.innerHTML = `<div class="gd-page gd-send-page">
      ${back("/grading/send", "Pick another card")}
      <div class="gd-send">
        <div class="gd-send-card"><div class="gd-send-face">${faceOf(card, reverse)}</div></div>
        <div class="gd-send-copy">
          ${mark("small")}
          <h1 class="gd-send-h">${esc(card.name)}</h1>
          <p class="gd-cardline">${esc(set.name)} · ${esc(numberLine(card, set))} · ${esc(reverse ? "Reverse holo" : card.rarity || "")}</p>
          ${
            plain > 0 && rev > 0
              ? `<div class="gd-seg" role="group" aria-label="Which copy">
                  <button type="button" class="${reverse ? "" : "on"}" data-gd-copy="plain" ${busy ? "disabled" : ""}>Plain <small>${plain}</small></button>
                  <button type="button" class="${reverse ? "on" : ""}" data-gd-copy="reverse" ${busy ? "disabled" : ""}>Reverse holo <small>${rev}</small></button>
                </div>`
              : ""
          }
          <dl class="gd-facts">
            <div><dt>Grading fee</dt><dd>${coinTag(fee)}</dd></div>
            <div><dt>Raw market</dt><dd>${coinTag(raw)}</dd></div>
            <div><dt>Set band</dt><dd>${esc(band.label)}</dd></div>
            <div><dt>You have</dt><dd>${coinTag(balance)}</dd></div>
          </dl>
          <h2 class="gd-h">Odds for ${esc(band.label)}</h2>
          <ol class="gd-odds">${oddsRows(band)}</ol>
          <p class="gd-expect">${esc(expectedWords(band))}</p>
          <p class="gd-worth">A 10 would be worth ${coinTag(gradedValue(card, 10, set))}, a 9 ${coinTag(gradedValue(card, 9, set))}, an 8 ${coinTag(gradedValue(card, 8, set))}. Raw, it sells for ${coinTag(raw)}.</p>
          <p class="gd-policy">You can crack a slab to get the raw card back at any time; grading it again costs a new fee. There are no rerolls.</p>
          ${fine()}
          <p class="gd-error" role="alert" ${sendError ? "" : "hidden"}>${esc(sendError)}</p>
          ${
            owns
              ? `${gateNoticeHTML(lock())}<button type="button" class="solid gd-send-btn" data-gd-submit ${busy || short || lock() ? "disabled" : ""}>${busy ? "Sending" : attempt && sendError ? `Try again · ${coinTag(fee)}` : `Send for grading · ${coinTag(fee)}`}</button>
                 ${short ? `<small class="gd-reason">Needs ${coins(fee)} coins, you have ${coins(balance)}.</small>` : ""}`
              : `<p class="gd-reason">You don't own ${reverse ? "a reverse holo" : "a plain"} copy of this card any more.</p>`
          }
        </div>
      </div>
    </div>`;
  }

  async function submit() {
    if (stage !== "form") return;
    if (lock()) return toast(gateRefusal(lock()));
    const cardId = route.cardId;
    const isReverse = reverse;
    if (!attempt || attempt.cardId !== cardId || Boolean(attempt.reverse) !== isReverse) {
      attempt = { requestId: uuid(), cardId, reverse: isReverse, at: Date.now() };
    }
    writeAttempt(attempt);
    stage = "sending";
    sendError = "";
    render();
    try {
      const res = await post("/api/grading/submit", { cardId, reverse: isReverse, requestId: attempt.requestId });
      attempt = null;
      writeAttempt(null);
      if (!visible || route.kind !== "send" || route.cardId !== cardId) return;
      await showReveal(res.slab);
    } catch (err) {
      stage = "form";
      if (!isNetwork(err)) {
        // The server said no and made nothing: the next try is a new attempt.
        attempt = null;
        writeAttempt(null);
        sendError = err.message || "That didn't work.";
      } else {
        sendError = "Couldn't reach the server. Nothing was charged; try again and the same request goes out, so it can't be graded twice.";
      }
      if (visible && route.kind === "send" && route.cardId === cardId) render();
    }
  }

  async function showReveal(slab) {
    if (!slab) {
      stage = "form";
      render();
      return;
    }
    stage = "reveal";
    revealed = slab;
    if (!data.slabs.some((s) => Number(s.id) === Number(slab.id))) data.slabs = [slab, ...data.slabs];
    // A refresh from here lands on the slab, not on the form: nothing can be sent twice.
    try {
      history.replaceState(history.state, "", `/grading/${Number(slab.id)}`);
    } catch {
      /* file: or a sandbox without history */
    }
    const card = deps.findCard(slab.cardId);
    const set = setOfCard(slab.cardId);
    root.innerHTML = `<div class="gd-page gd-reveal">
      <div class="gd-reveal-stage">${slabMarkup(slab, "hero")}</div>
      <div class="gd-result" aria-live="polite">
        <p class="gd-result-label">${esc(set?.name || "")} · ${esc(numberLine(card, set))} · ${esc(card?.name || slab.cardId)}${slab.reverse ? " · Reverse holo" : ""}</p>
        <h2 class="gd-result-grade" tabindex="-1"><b>${slab.grade}</b><span>${esc(gradeWord(slab.grade))}</span></h2>
        <p class="gd-result-line">Graded value ${coinTag(slab.value)}${card ? `, raw ${coinTag(sellValue(card))}` : ""}. Cert ${esc(slab.cert || "")}.</p>
        <div class="gd-actions">
          <a class="solid" href="/grading/${Number(slab.id)}" data-gd-link>Add a guard</a>
          <a class="ghost" href="/grading" data-gd-link>See your slabs</a>
          <a class="ghost" href="/grading/send" data-gd-link>Send another</a>
        </div>
      </div>
    </div>`;
    const el = root.querySelector(".slab");
    // The form was tall and the send button sat at its foot: bring the case into view.
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }
    try {
      await revealSlab(el, { motion: motion() });
    } catch {
      /* the result still shows */
    }
    if (revealed !== slab) return;
    stage = "done";
    root.querySelector(".gd-result")?.classList.add("is-shown");
    root.querySelector(".gd-result-grade")?.focus({ preventScroll: true });
  }

  // ---- One slab -------------------------------------------------------------
  function guardAction(slab) {
    const current = slab.guard || null;
    const pick = slabPick === undefined ? current : slabPick;
    if (pick === current) {
      return current
        ? { kind: "guard", guardId: null, label: `Remove ${guardName(current)}` }
        : { kind: "none", label: "No guard on this slab" };
    }
    if (pick === null) return { kind: "guard", guardId: null, label: `Remove ${guardName(current)}` };
    const guard = guardOf(pick);
    if (!guard) return { kind: "none", label: "" };
    if (freeOf(pick) > 0) return { kind: "guard", guardId: pick, label: current ? `Swap to ${guard.name}` : `Equip ${guard.name}` };
    const short = coinsNow() + 1e-9 < guard.price;
    return { kind: "buy", guardId: pick, label: `Buy ${guard.name} · ${coinTag(guard.price)}`, short, price: guard.price };
  }

  async function paintSlab() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    const slab = slabById(route.slabId);
    if (!slab) {
      root.innerHTML = `<div class="gd-page">${back("/grading", "Your slabs")}
        <p class="gd-empty">${data.loaded ? "That slab isn't in your collection. It may have been cracked or sold." : "Loading the slab."}</p></div>`;
      return;
    }
    const { card, set } = await ensureCard(slab.cardId);
    if (!visible || route.kind !== "slab" || route.slabId !== slab.id) return;
    const current = slab.guard || null;
    const pick = slabPick === undefined ? current : slabPick;
    const action = guardAction(slab);
    const raw = card ? sellValue(card) : 0;
    const value = Number(slab.value) || (card ? gradedValue(card, slab.grade, set) : 0);
    root.innerHTML = `<div class="gd-page gd-slab-page">
      ${back("/grading", "Your slabs")}
      <div class="gd-slab-layout">
        <div class="gd-slab-stage">${slabMarkup(slab, "inspect", "", pick)}</div>
        <div class="gd-slab-copy">
          ${mark("small")}
          <h1 class="gd-slab-h">${esc(card?.name || slab.cardId)}</h1>
          <dl class="gd-facts gd-facts-slab">
            <div><dt>Set</dt><dd>${esc(set?.name || "")}</dd></div>
            <div><dt>Number</dt><dd>${esc(numberLine(card, set))}${slab.reverse ? " · Reverse holo" : ""}</dd></div>
            <div><dt>Grade</dt><dd>${slab.grade} ${esc(gradeWord(slab.grade))}</dd></div>
            <div><dt>Cert</dt><dd>${esc(slab.cert || "")}</dd></div>
            <div><dt>Graded</dt><dd>${esc(dateWords(slab.gradedAt))}</dd></div>
            <div><dt>Graded value</dt><dd>${coinTag(value)} <small>raw ${coinTag(raw)}</small></dd></div>
          </dl>
          <div class="gd-showrow">
            <button type="button" class="ghost" data-gd-show="${slab.shown ? "0" : "1"}" ${slabBusy ? "disabled" : ""}>${slabBusy ? "Working" : slab.shown ? "Remove from profile" : "Show on profile"}</button>
            <small class="gd-reason">${
              slab.shown
                ? `In the Graded section of your profile.${handleNow() ? ` <a href="/u/${esc(handleNow())}">See it</a>` : ""}`
                : `Your profile has room for ${GRADING_LIMITS.maxShown} slabs, ${shownCount()} in use.`
            }</small>
          </div>
          <section class="gd-guardbox" aria-labelledby="gd-guard-h">
            <h2 class="gd-h" id="gd-guard-h">Guard</h2>
            <p class="gd-sub">Tap a style to see it on this slab. Cosmetic only.</p>
            <div class="gd-gtiles" role="group" aria-label="Guard style">
              <button type="button" class="gd-gtile ${pick === null ? "on" : ""}" data-gd-pick="" ${slabBusy ? "disabled" : ""}><i class="gd-swatch none"></i><b>None</b><small>${current ? "Take it off" : "As it is"}</small></button>
              ${GUARDS.map((g) => {
                const owned = ownedOf(g.id);
                const free = freeOf(g.id);
                return `<button type="button" class="gd-gtile ${pick === g.id ? "on" : ""} ${current === g.id ? "is-current" : ""}" data-gd-pick="${esc(g.id)}" ${slabBusy ? "disabled" : ""}>
                  <i class="gd-swatch" data-guard="${esc(g.id)}"></i><b>${esc(g.name)}</b>
                  <small>${current === g.id ? "On this slab" : owned ? `${free} of ${owned} free` : coinTag(g.price)}</small></button>`;
              }).join("")}
            </div>
            <div class="gd-guard-actions">
              ${
                action.kind === "guard"
                  ? `<button type="button" class="ghost accent" data-gd-guard="${action.guardId === null ? "" : esc(action.guardId)}" ${slabBusy ? "disabled" : ""}>${slabBusy ? "Working" : action.label}</button>`
                  : action.kind === "buy"
                    ? `<button type="button" class="ghost accent" data-gd-buy-one="${esc(action.guardId)}" ${slabBusy || action.short ? "disabled" : ""}>${slabBusy ? "Working" : action.label}</button>
                       <small class="gd-reason">${action.short ? `Needs ${coins(action.price)} coins, you have ${coins(coinsNow())}.` : "None free in your stock. Buy one and it goes straight on."}</small>`
                    : `<button type="button" class="ghost" disabled>${esc(action.label)}</button>`
              }
            </div>
          </section>
          <p class="gd-error" role="alert" ${slabError ? "" : "hidden"}>${esc(slabError)}</p>
          <div class="gd-actions gd-slab-actions">
            <button type="button" class="ghost" data-gd-crack ${slabBusy ? "disabled" : ""}>Crack the slab</button>
            <button type="button" class="ghost" data-gd-sell ${slabBusy ? "disabled" : ""}>Sell slab · ${coinTag(value)}</button>
          </div>
          <p class="gd-policy">Cracking returns the raw card to your collection; the grade is gone and the fee is not refunded. Selling takes the graded value in coins.</p>
          ${fine()}
        </div>
      </div>
    </div>`;
  }

  function previewGuard(guardId) {
    slabPick = guardId;
    slabError = "";
    const slab = slabById(route.slabId);
    if (!slab) return;
    const el = root.querySelector(".gd-slab-stage .slab");
    if (el) {
      if (guardId) el.dataset.guard = guardId;
      else delete el.dataset.guard;
    }
    root.querySelectorAll("[data-gd-pick]").forEach((b) => b.classList.toggle("on", (b.dataset.gdPick || null) === guardId));
    const actions = root.querySelector(".gd-guard-actions");
    if (!actions) return;
    const action = guardAction(slab);
    actions.innerHTML =
      action.kind === "guard"
        ? `<button type="button" class="ghost accent" data-gd-guard="${action.guardId === null ? "" : esc(action.guardId)}">${action.label}</button>`
        : action.kind === "buy"
          ? `<button type="button" class="ghost accent" data-gd-buy-one="${esc(action.guardId)}" ${action.short ? "disabled" : ""}>${action.label}</button>
             <small class="gd-reason">${action.short ? `Needs ${coins(action.price)} coins, you have ${coins(coinsNow())}.` : "None free in your stock. Buy one and it goes straight on."}</small>`
          : `<button type="button" class="ghost" disabled>${esc(action.label)}</button>`;
  }

  async function slabCall(run, { done = "" } = {}) {
    if (slabBusy) return false;
    slabBusy = true;
    slabError = "";
    render();
    try {
      await run();
      slabBusy = false;
      if (done) toast(done);
      return true;
    } catch (err) {
      slabBusy = false;
      slabError = errorLine(err);
      if (visible && route.kind === "slab") render();
      return false;
    }
  }

  async function setGuard(guardId) {
    const slabId = route.slabId;
    const ok = await slabCall(() => post("/api/grading/guard", { slabId, guardId }), {
      done: guardId ? `${guardName(guardId)} is on.` : "Guard taken off.",
    });
    if (ok) {
      slabPick = undefined;
      if (visible && route.kind === "slab") render();
    }
  }

  async function buyOne(guardId) {
    const slabId = route.slabId;
    const ok = await slabCall(async () => {
      await post("/api/grading/guards/buy", { guardId, qty: 1, requestId: uuid() });
      await post("/api/grading/guard", { slabId, guardId });
    }, { done: `${guardName(guardId)} bought and put on.` });
    if (ok) {
      slabPick = undefined;
      if (visible && route.kind === "slab") render();
    }
  }

  async function setShown(shown) {
    const slabId = route.slabId;
    const ok = await slabCall(() => post("/api/grading/show", { slabId, shown }), {
      done: shown ? "On your profile." : "Taken off your profile.",
    });
    if (ok && visible && route.kind === "slab") render();
  }

  async function crack() {
    const slabId = route.slabId;
    const ok = await slabCall(() => post("/api/grading/crack", { slabId }), { done: "Cracked. The raw card is back in your collection." });
    if (ok) navigate("/grading");
  }

  async function sell() {
    const slabId = route.slabId;
    const requestId = slabSaleId || uuid();
    slabSaleId = requestId;
    let sold = 0;
    const ok = await slabCall(async () => {
      const res = await post("/api/grading/sell", { slabId, requestId });
      sold = Number(res?.sold) || 0;
    });
    if (ok) {
      slabSaleId = "";
      toast(`Sold for ${coins(sold)} coins.`);
      navigate("/grading");
    } else if (slabError && !slabError.startsWith("Couldn't reach")) {
      slabSaleId = "";
    }
  }

  // ---- Confirm sheet (the gear page's dialog) ----------------------------------
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement("dialog");
    sheet.className = "gear-sheet gd-sheet";
    sheet.addEventListener("close", () => document.documentElement.classList.remove("dialog-open"));
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) sheet.close();
    });
    document.body.append(sheet);
    return sheet;
  }

  function confirmSheet({ title, body, confirm, cancel = "Keep it", danger = false }) {
    return new Promise((resolve) => {
      const dlg = ensureSheet();
      let answered = false;
      dlg.innerHTML = `<div class="gear-sheet-body gd-sheet-body">
        <button type="button" class="gear-sheet-close" data-gd-close aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
        <h2>${title}</h2>
        <p class="gd-sheet-copy">${body}</p>
        <div class="gd-sheet-actions">
          <button type="button" class="ghost" data-gd-close autofocus>${esc(cancel)}</button>
          <button type="button" class="${danger ? "ghost danger-btn" : "solid"}" data-gd-confirm>${confirm}</button>
        </div>
      </div>`;
      const onClick = (event) => {
        if (event.target.closest("[data-gd-confirm]")) {
          answered = true;
          dlg.close();
          resolve(true);
        } else if (event.target.closest("[data-gd-close]")) dlg.close();
      };
      dlg.addEventListener("click", onClick);
      dlg.addEventListener(
        "close",
        () => {
          dlg.removeEventListener("click", onClick);
          if (!answered) resolve(false);
        },
        { once: true }
      );
      if (!dlg.open) {
        dlg.showModal();
        document.documentElement.classList.add("dialog-open");
      }
    });
  }

  // ---- Events -----------------------------------------------------------------
  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const link = t.closest("[data-gd-link]");
    if (link) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      const href = link.getAttribute("href");
      if (link.dataset.gdReverse === "1") sendReverse = true;
      navigate(href);
      return;
    }
    const qty = t.closest("[data-gd-qty]");
    if (qty) {
      const [id, delta] = qty.dataset.gdQty.split(":");
      shopQty[id] = Math.max(1, Math.min(GRADING_LIMITS.maxGuardQty, (shopQty[id] || 1) + Number(delta)));
      const tile = qty.closest("[data-gd-shop]");
      const balance = coinsNow();
      if (tile) {
        const holder = document.createElement("div");
        holder.innerHTML = guardShopTile(guardOf(id), bestSlab() || pendingPreview, balance);
        // Keep the preview slab as drawn; only the copy changes.
        const fresh = holder.firstElementChild;
        const preview = tile.querySelector(".gd-gshop-preview");
        if (preview) fresh.querySelector(".gd-gshop-preview")?.replaceWith(preview);
        tile.replaceWith(fresh);
      }
      return;
    }
    const buyBtn = t.closest("[data-gd-buy]");
    if (buyBtn) return buy(buyBtn.dataset.gdBuy);
    const sort = t.closest("[data-gd-sort]");
    if (sort) {
      pickSort = sort.dataset.gdSort;
      root.querySelectorAll("[data-gd-sort]").forEach((b) => b.classList.toggle("on", b === sort));
      paintPickGrid();
      return;
    }
    if (t.closest("[data-gd-more]")) {
      pickShown += PICK_PAGE;
      paintPickGrid();
      return;
    }
    const copy = t.closest("[data-gd-copy]");
    if (copy) {
      reverse = copy.dataset.gdCopy === "reverse";
      sendError = "";
      try {
        const url = new URL(location.href);
        if (reverse) url.searchParams.set("reverse", "1");
        else url.searchParams.delete("reverse");
        history.replaceState(history.state, "", url);
      } catch {
        /* no history */
      }
      render();
      return;
    }
    if (t.closest("[data-gd-submit]")) return submit();
    const pick = t.closest("[data-gd-pick]");
    if (pick) return previewGuard(pick.dataset.gdPick || null);
    const guardBtn = t.closest("[data-gd-guard]");
    if (guardBtn) return setGuard(guardBtn.dataset.gdGuard || null);
    const showBtn = t.closest("[data-gd-show]");
    if (showBtn) return setShown(showBtn.dataset.gdShow === "1");
    const gsort = t.closest("[data-gd-gsort]");
    if (gsort) {
      gradedSort = gsort.dataset.gdGsort;
      render();
      return;
    }
    const buyOneBtn = t.closest("[data-gd-buy-one]");
    if (buyOneBtn) return buyOne(buyOneBtn.dataset.gdBuyOne);
    if (t.closest("[data-gd-crack]")) {
      const slab = slabById(route.slabId);
      if (!slab) return;
      const card = deps.findCard(slab.cardId);
      const ok = await confirmSheet({
        title: "Crack the slab?",
        body: `${esc(card?.name || "The card")} goes back to your collection as a raw card. The ${slab.grade} ${esc(gradeWord(slab.grade))} grade and the cert are gone, and the fee is not refunded. Grading it again costs a new fee.`,
        confirm: "Crack it",
        danger: true,
      });
      if (ok) crack();
      return;
    }
    if (t.closest("[data-gd-sell]")) {
      const slab = slabById(route.slabId);
      if (!slab) return;
      const card = deps.findCard(slab.cardId);
      const ok = await confirmSheet({
        title: `Sell the slab for ${coinTag(slab.value)}?`,
        body: `${esc(card?.name || "The card")}, graded ${slab.grade} ${esc(gradeWord(slab.grade))}, leaves your collection and the coins arrive right away.`,
        confirm: `Sell · ${coinTag(slab.value)}`,
        cancel: "Keep it",
      });
      if (ok) sell();
    }
  });

  root.addEventListener("input", (e) => {
    const search = e.target.closest?.("[data-gd-search]");
    if (!search) return;
    pickQuery = search.value;
    pickShown = PICK_PAGE;
    paintPickGrid();
  });

  // ---- Render and routing ----------------------------------------------------
  let pendingPreview = null;
  let renderGen = 0;
  function render() {
    const gen = ++renderGen;
    const job =
      route.kind === "slab" ? paintSlab() : route.kind === "graded" ? paintGraded() : route.kind === "send" ? (route.cardId ? paintSend() : paintPicker()) : paintLanding();
    job.catch((err) => {
      if (gen !== renderGen) return;
      console.error(err);
      root.innerHTML = `<div class="gd-page">${back("/grading", "Grading")}<p class="gd-empty">Couldn't draw this page. ${esc(err?.message || "")}</p></div>`;
    });
  }

  function show(path = "/grading") {
    const clean = String(path || "/grading").replace(/\/+$/, "") || "/grading";
    const m = clean.match(GRADING_ROUTE);
    const next = m?.[2]
      ? { kind: "slab", slabId: Number(m[2]), cardId: "" }
      : clean === "/grading/graded"
        ? { kind: "graded", slabId: 0, cardId: "" }
        : clean.startsWith("/grading/send")
        ? { kind: "send", slabId: 0, cardId: m?.[1] || "" }
        : { kind: "landing", slabId: 0, cardId: "" };
    const wasVisible = visible;
    visible = true;
    // The reveal keeps the screen even if the app repaints the same path.
    if (wasVisible && route.kind === "send" && next.kind === "send" && route.cardId === next.cardId && route.cardId && stage !== "form") return;
    route = next;
    stage = "form";
    sendError = "";
    revealed = null;
    slabPick = undefined;
    slabBusy = false;
    slabError = "";
    if (next.kind === "send" && next.cardId) {
      reverse = sendReverse ?? new URLSearchParams(location.search).get("reverse") === "1";
    } else if (next.kind === "send") {
      pickEntries = null;
      pickShown = PICK_PAGE;
    }
    sendReverse = null;
    if (next.kind === "send" && !next.cardId) attempt = null;
    syncFromSave(save());
    render();
    refresh();
  }

  function hide() {
    visible = false;
    refreshToken++;
    observer?.disconnect();
    observer = null;
    sheet?.open && sheet.close();
  }

  return { show, hide, render, path: "/grading" };
}
