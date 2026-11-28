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
     /grading/<slabId>/auto   auto-regrade setup, /grading/auto/<runId> the run (js/grading-auto.js)

   deps: { root, api, getSave, applySave, cardFace, findCard, loadSetData, inspect,
           toast, navigate, coinTag, user?, signIn? } */
import {
  GRADING_BRAND,
  GRADE_WORDS,
  BLACK_LABEL,
  BLACK_LABEL_SALES,
  GRADING_FEE,
  GRADING_LIMITS,
  GUARDS,
  GUARD_TIERS,
  guardsInTier,
  bandFor,
  gradingFee,
  gradedValue,
} from "./grading-rules.js";
import { slabHTML, revealSlab, guardName, gradeWord } from "./slab.js?v=3";
import { uuid, slabTileHTML } from "./casino-kit.js";
import { gateLock, gateNoticeHTML, gateRefusal, roomLine } from "./gate-notice.js";
import { esc, coins, coinTag as defaultCoinTag } from "./battle-kit.js";
import { ALL_SETS, sellValue } from "./catalog.js";
import { COIN_I as COIN_IMG } from "./money.js?v=4";
import { initAutoRegrade } from "./grading-auto.js?v=3";
import { slabViewerHTML, attachSlabViewers, flipSlab, openSlabFullscreen } from "./slab-viewer.js?v=2";

/** The paths this page answers. app.js uses it to route and to allow navigate(). */
export const GRADING_ROUTE = /^\/grading(?:\/send(?:\/([a-zA-Z0-9-]{1,60}))?|\/graded|\/guards|\/(\d{1,12})(\/auto)?|\/auto\/(\d{1,12}))?$/;

/** The public cert pages: /cert to look one up, /cert/<number> for one slab. Anyone can open them, signed in or not. */
export const CERT_ROUTE = /^\/cert(?:\/([A-Za-z0-9-]{1,20}))?$/i;
/** "RIP-0000123", "rip 123", "0000123" or "123" -> "RIP-0000123"; "" when it isn't one. Mirrors certId in worker/grading.js. */
export function certOf(raw) {
  const m = String(raw || "").trim().match(/^(?:rip[-\s]?)?0*(\d{1,12})$/i);
  const id = m ? Number(m[1]) : 0;
  return Number.isSafeInteger(id) && id > 0 ? `RIP-${String(id).padStart(7, "0")}` : "";
}

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
// A chance under 0.1% reads "<0.1%", not a flat 0.0% that says it can't happen.
const pct = (bp) => (bp > 0 && bp < 5 ? "<0.1%" : `${(bp / 100).toFixed(1)}%`);
/** A date on record, or "Unknown": a missing date never reads as today. */
const dateWords = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "Unknown";
  return new Date(n).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
  const coinTag = deps.coinTag || defaultCoinTag;
  const toast = (msg) => deps.toast?.(msg);
  const navigate = (path, opts) => deps.navigate?.(path, opts);

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
  let pickStagger = false;

  // The shop and a slab's guard controls. Both show one tier at a time.
  let shopTier = GUARD_TIERS[0].id;
  let pickTier = "";
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
  const slabRoom = () => { const u = deps.user?.(); return roomLine("slabs", u?.unlockLevel ?? u?.perks?.unlockLevel ?? u?.level, shownCount(), GRADING_LIMITS.maxShown); };
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
  const tierOf = (guardId) => guardOf(guardId)?.tier || GUARD_TIERS[0].id;
  const ownedInTier = (tierId) => guardsInTier(tierId).reduce((n, g) => n + ownedOf(g.id), 0);
  /** The tier picker: words with an ink line, with how many of that shelf you own. */
  const tierWords = (attr, active) =>
    `<span class="gd-words gd-tier-words" role="group" aria-label="Guard tier">${GUARD_TIERS.map((t) => {
      const owned = ownedInTier(t.id);
      return `<button type="button" ${attr}="${t.id}" class="rt-word ${active === t.id ? "on" : ""}">${esc(t.name)}${owned ? `<small>${owned}</small>` : ""}</button>`;
    }).join("")}</span>`;
  const shownCount = () => data.slabs.filter((s) => s.shown).length;
  const handleNow = () => deps.user?.()?.handle || "";
  const sortedSlabs = (by) => {
    const name = (s) => deps.findCard(s.cardId)?.name || s.cardId;
    const list = [...data.slabs];
    if (by === "grade") return list.sort((a, b) => b.grade - a.grade || Number(Boolean(b.blackLabel)) - Number(Boolean(a.blackLabel)) || b.value - a.value || (b.gradedAt || 0) - (a.gradedAt || 0));
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
        // The set's priciest card, so the stand-in shows off what a slab can hold.
        let top = 0;
        for (const c of list || []) {
          const v = c?.image ? sellValue(c) : 0;
          if (v > top || (!cardId && c?.image)) {
            top = Math.max(top, v);
            cardId = c.id;
          }
        }
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
    if (visible && (stage === "form" || route.kind !== "send") && !auto.busy()) render();
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
  const fine = () => `<p class="gd-fine">${esc(GRADING_BRAND.disclaimer)}</p>`;
  const back = (href, label) => `<a class="gd-back" href="${href}" data-gd-link><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>${esc(label)}</a>`;
  const tierName = (grade, black) => (grade >= 10 ? (black ? "black" : "gem") : grade === 9 ? "mint" : grade >= 7 ? "mid" : "low");
  /** The grade on its plate: yellow and slanted; a Black Label stands on ink with yellow figures. */
  const gradePlate = (grade, black, cls = "") =>
    `<span class="gd-plate ${cls}" data-tier="${tierName(grade, black)}"><b>${Number(grade)}</b><span>${esc(gradeWord(grade, black))}</span></span>`;
  /** A coin figure whose number can roll (see roll()). */
  const coinFig = (value, signed = false) => {
    const text = signed ? signedCoins(value) : coins(value);
    return `<span class="gd-coinfig">${signed ? "" : COIN_IMG}<span data-roll="${Number(value) || 0}"${signed ? ' data-signed="1"' : ""}>${text}</span><span class="sr-only"> coins</span></span>`;
  };
  /** Poké Ball pips for where you are in sending a card. */
  const STEPS = ["Pick a card", "See the odds", "Send it", "Slab comes back"];
  const steps = (at) => `<ol class="gd-steps" aria-label="Step ${at + 1} of ${STEPS.length}">${STEPS.map(
    (label, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"${i === at ? ' aria-current="step"' : ""}><span class="rt-ball${i > at ? " e" : i === at ? " now" : ""}" aria-hidden="true"></span><span>${label}</span></li>`
  ).join("")}</ol>`;
  /** The cyan slab and the object standing on it. */
  const stageHTML = (inner, cls = "") => `<div class="gd-stage ${cls}"><span class="gd-stage-slab" aria-hidden="true"></span><div class="gd-stage-obj">${inner}</div></div>`;
  /** A raw card standing on the slab: the face, with a hard shadow drawn behind it (never on the .tcg). */
  const rawCard = (card, isReverse, raw) => `<div class="gd-raw"><span class="gd-raw-shadow" aria-hidden="true"></span><div class="gd-send-face">${faceOf(card, isReverse)}</div>
      <span class="gd-raw-tag" aria-hidden="true">Raw ${COIN_IMG}${coins(raw)}</span></div>`;

  /** Roll the figures under `scope` from 0 (or 1 for a grade) up to their value. Only when motion is allowed. */
  function roll(scope) {
    if (!scope || !motion()) return;
    scope.querySelectorAll("[data-roll]").forEach((el) => {
      const to = Number(el.dataset.roll) || 0;
      const final = el.textContent;
      const grade = el.hasAttribute("data-grade");
      const from = grade ? 1 : 0;
      const ms = grade ? 520 : 760;
      const t0 = performance.now();
      const fmt = (n) => (grade ? String(Math.round(n)) : el.dataset.signed ? signedCoins(n) : coins(n));
      const step = (t) => {
        if (!el.isConnected) return;
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = k < 1 ? fmt(from + (to - from) * e) : final;
        if (k < 1) requestAnimationFrame(step);
      };
      el.textContent = fmt(from);
      requestAnimationFrame(step);
    });
  }

  const gate = () => `<div class="gd-page gd-landing gd-gate">
      <header class="gd-head"><h1 class="page-title">Grading</h1>
      <p class="gd-lede">Send a card from your collection and it comes back sealed in a slab with a grade on the label.</p></header>
      <section class="gd-lab">
        ${stageHTML(`<span class="gd-ghost-slab" aria-hidden="true"><span class="rt-ball e"></span></span>`, "is-empty")}
        <div class="gd-lab-info">
          ${steps(0)}
          <div class="rt-box gd-gatebox">
            <h2>Slabs live on your account</h2>
            <p>Sign in to send a card and keep what comes back.</p>
            <div class="gd-gate-actions">
              <button class="solid" type="button" data-open-auth="signup">Create account</button>
              <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
            </div>
          </div>
          ${fine()}
        </div>
      </section></div>`;

  /** One slab on the shelf: the real object with a hard shadow, its name, the grade plate and the value. */
  function slabTile(slab, n = -1) {
    const card = deps.findCard(slab.cardId);
    const name = card?.name || slab.cardId;
    const grade = `${slab.grade} ${gradeWord(slab.grade, slab.blackLabel)}`;
    return `<li class="gd-tile${n >= 0 ? " gd-in" : ""}"${n >= 0 ? ` style="--i:${n}"` : ""}>
      <a class="gd-tile-hit" href="/grading/${Number(slab.id)}" data-gd-link aria-label="${esc(name)}, ${esc(grade)}, ${coins(slab.value)} coins${slab.shown ? ", on your profile" : ""}">
        <span class="gd-tile-obj rt-drop"><span class="gd-slab-holder" data-slab-holder="${Number(slab.id)}"></span></span>
        <span class="gd-tile-copy">
          <b class="gd-tile-name">${esc(name)}</b>
          <span class="gd-tile-row">${gradePlate(slab.grade, slab.blackLabel, "sm")}<span class="gd-tile-val">${COIN_IMG}${coins(slab.value)}</span></span>
          ${slab.shown ? `<small class="gd-tile-shown">On your profile</small>` : ""}
        </span>
      </a>
    </li>`;
  }

  /** Slabs staked in a coinflip or a jackpot: read-only, each one links to its table. */
  function inCasinoHTML() {
    const list = data.inGame.filter((s) => s && (s.game === "coinflip" || s.game === "jackpot") && s.gameId);
    if (!list.length) return "";
    return `<section class="gd-section gd-incasino" aria-labelledby="gd-ic-h">
      <div class="gd-sec-head"><h2 class="gd-h" id="gd-ic-h">In the casino</h2><span class="gd-count">${list.length}</span></div>
      <p class="gd-sub">On a table right now. They come back to you, or change hands, when the game ends. A guard stays with you if a slab is lost.</p>
      <ul class="gd-ic-list">${list
        .map((slab) => {
          const card = deps.findCard(slab.cardId);
          const name = slab.name || card?.name || slab.cardId;
          return `<li><a class="rt-row gd-ic-row" href="/casino/${esc(slab.game)}/${esc(slab.gameId)}" data-gd-link>
            <span class="rt-row-lab">${slab.game === "jackpot" ? "Jackpot" : "Coinflip"}</span>
            <span class="gd-ic-thumb" aria-hidden="true">${slabTileHTML(slab, "mini")}</span>
            <span class="rt-row-name">${esc(name)}<small>${Number(slab.grade)} ${esc(gradeWord(slab.grade, slab.blackLabel))}</small></span>
            <span class="rt-row-val">${COIN_IMG}${coins(slab.value)}</span>
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


  // ---- Turning a slab over (js/slab-viewer.js) ------------------------------------
  /** A slab on its stage with the keys under it: turn it over, look closer, and share its cert. */
  let viewerSource = null; // { slab, card, set, guard } for the full-screen viewer
  function viewerBlock(slab, card, set, guard, { share = true } = {}) {
    const face = faceOf(card, slab.reverse);
    const shown = { ...slab, guard: guard || null };
    viewerSource = { shown, card, set, face };
    const markup = slabHTML({ face, card, slab: shown, set, size: "hero", back: true });
    return `<div class="gd-viewer">
      ${slabViewerHTML(markup, { guard: guard || "" })}
      <div class="sv-keys">
        <button type="button" class="ghost sm" data-sv-flip>Turn over</button>
        <button type="button" class="ghost sm" data-sv-full>Look closer</button>
        ${share && slab.cert ? `<button type="button" class="ghost sm" data-gd-share-cert="${esc(slab.cert)}">Share cert</button>` : ""}
      </div>
    </div>`;
  }
  function openViewerFull() {
    if (!viewerSource) return;
    const { shown, card, set, face } = viewerSource;
    openSlabFullscreen(slabHTML({ face, card, slab: shown, set, size: "hero", back: true }), { title: `${card?.name || "Slab"}, ${shown.cert || ""}`, guard: shown.guard || "" });
  }
  async function shareCert(cert) {
    const url = `${location.origin}/cert/${cert}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${GRADING_BRAND.name} cert ${cert}`, url });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Cert link copied.");
    } catch {
      toast(url);
    }
  }

  // ---- Public cert pages ------------------------------------------------------------
  const certCache = new Map(); // "RIP-0000123" -> { at, res } or { at, error, status }
  async function lookupCert(cert, { fresh = false } = {}) {
    const hit = certCache.get(cert);
    if (hit && !fresh && Date.now() - hit.at < 60000) return hit;
    let out;
    try {
      out = { at: Date.now(), res: await deps.api(`/api/cert/${encodeURIComponent(cert)}`) };
    } catch (err) {
      out = { at: Date.now(), error: err?.message || "Couldn't look that cert up.", status: err?.status || 0 };
    }
    certCache.set(cert, out);
    return out;
  }

  const certForm = (value = "", cls = "") => `<form class="gd-certform ${cls}" data-gd-cert-form role="search" aria-label="Look up a cert">
      <label class="gd-certfield"><span class="gd-certpre" aria-hidden="true">RIP</span>
        <input type="text" name="cert" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="20" placeholder="Cert number" value="${esc(value)}" aria-label="Cert number" />
      </label>
      <button type="submit" class="ghost sm">Look up</button>
    </form>`;

  const STATUS_WORDS = {
    active: ["Sealed", "In its slab and checked against the grading record."],
    "in-game": ["Sealed", "In its slab, on a casino table right now."],
    cracked: ["Cracked", "Taken out of its slab. This cert no longer holds a card."],
    sold: ["Sold", "Sold back to the shop. This cert is retired."],
    lost: ["Retired", "Lost to the house in the casino. This cert is retired."],
  };

  async function paintCert() {
    const cert = certOf(route.cert);
    if (!route.cert) {
      const mine = signedIn() ? sortedSlabs("newest").slice(0, 6) : [];
      root.innerHTML = `<div class="gd-page gd-cert-page">
        ${back("/grading", "Grading")}
        <header class="gd-head">
          <h1 class="page-title">Cert lookup</h1>
          <p class="gd-lede">Every ${esc(GRADING_BRAND.name)} slab has its own cert number on the label. Type one in to see the card, its grade, who holds it and when it was graded.</p>
        </header>
        ${certForm("", "is-big")}
        ${mine.length ? `<section class="gd-section"><div class="gd-sec-head"><h2 class="gd-h">Your latest certs</h2></div>
          <ul class="gd-certlist">${mine.map((s) => {
            const card = deps.findCard(s.cardId);
            return `<li><a class="rt-row" href="/cert/${esc(s.cert)}" data-gd-link><span class="rt-row-lab">${esc(String(s.grade))}</span><span class="rt-row-name">${esc(card?.name || s.cardId)}<small>${esc(s.cert)}</small></span><span class="rt-row-val">${esc(dateWords(s.gradedAt))}</span></a></li>`;
          }).join("")}</ul></section>` : ""}
      </div>`;
      return;
    }
    if (!cert) {
      root.innerHTML = `<div class="gd-page gd-cert-page">${back("/cert", "Cert lookup")}
        <h1 class="page-title">Cert lookup</h1>${certForm(route.cert)}
        <p class="gd-empty">That isn't a cert number. They look like RIP-0001234.</p></div>`;
      return;
    }
    if (cert !== route.cert) {
      // One spelling per cert, so a shared link always reads the same.
      try { history.replaceState(history.state, "", `/cert/${cert}`); } catch { /* no history */ }
      route.cert = cert;
    }
    const cached = certCache.get(cert);
    if (!cached) {
      root.innerHTML = `<div class="gd-page gd-cert-page">${back("/cert", "Cert lookup")}
        <h1 class="page-title gd-cert-title">${esc(cert)}</h1><div class="rt-skel gd-cert-skel" aria-label="Looking it up"></div></div>`;
    }
    const got = await lookupCert(cert);
    if (!visible || route.kind !== "cert" || route.cert !== cert) return;
    if (got.error) {
      root.innerHTML = `<div class="gd-page gd-cert-page">${back("/cert", "Cert lookup")}
        <h1 class="page-title gd-cert-title">${esc(cert)}</h1>
        ${certForm(cert)}
        <div class="rt-empty gd-cert-none"><span class="gd-ghost-slab sm" aria-hidden="true"><span class="rt-ball e"></span></span><p>${esc(got.error)}</p></div>
      </div>`;
      return;
    }
    const r = got.res;
    await ensureCard(r.card.id).catch(() => null);
    if (!visible || route.kind !== "cert" || route.cert !== cert) return;
    const card = deps.findCard(r.card.id) || (r.card.name ? { ...r.card, image: r.card.image } : null);
    const set = setOfCard(r.card.id) || r.set;
    const sealed = r.status === "active" || r.status === "in-game";
    const [statusWord, statusLine] = STATUS_WORDS[r.status] || STATUS_WORDS.active;
    const slab = { ...r.slab, cert: r.cert };
    const mineNow = sealed && data.slabs.some((s) => Number(s.id) === Number(slab.id));
    const owner = r.owner
      ? `<a class="tlink" href="/u/${esc(r.owner.handle)}">${esc(r.owner.name)}</a> <small>@${esc(r.owner.handle)}</small>`
      : `<span class="gd-muted">Nobody</span>`;
    const rows = [
      ["Card", esc(card?.name || r.card.id)],
      ["Set", `${esc(set?.name || "")}${numberLine(card, set) ? `, ${esc(numberLine(card, set))}` : ""}${slab.reverse ? ", reverse holo" : ""}`],
      ["Grade", `${slab.grade} ${esc(gradeWord(slab.grade, slab.blackLabel))}`],
      ["Graded", esc(dateWords(slab.gradedAt))],
      r.regrades > 0 ? ["First graded", `${esc(dateWords(r.firstGradedAt))}<small>, regraded ${r.regrades === 1 ? "once" : `${r.regrades.toLocaleString("en-US")} times`} since</small>`] : null,
      [sealed ? "Held by" : "Held by", owner],
      !sealed && r.closedAt ? [statusWord, esc(dateWords(r.closedAt))] : null,
      sealed && slab.value != null ? ["Graded value", coinTag(slab.value)] : null,
    ].filter(Boolean);
    const history = [
      r.regradedAs ? `<li><a class="rt-row" href="/cert/${esc(r.regradedAs.cert)}" data-gd-link><span class="rt-row-lab">Next</span><span class="rt-row-name">Regraded ${esc(String(r.regradedAs.grade))} ${esc(gradeWord(r.regradedAs.grade, r.regradedAs.blackLabel))}<small>${esc(r.regradedAs.cert)}</small></span><span class="rt-row-val">${esc(dateWords(r.regradedAs.gradedAt))}</span></a></li>` : "",
      ...r.earlier.map((e) => `<li><a class="rt-row" href="/cert/${esc(e.cert)}" data-gd-link><span class="rt-row-lab">${esc(String(e.grade))}</span><span class="rt-row-name">${esc(gradeWord(e.grade, e.blackLabel))}<small>${esc(e.cert)}</small></span><span class="rt-row-val">${esc(dateWords(e.gradedAt))}</span></a></li>`),
    ].join("");
    root.innerHTML = `<div class="gd-page gd-cert-page">
      ${back("/cert", "Cert lookup")}
      <div class="gd-slab-layout">
        <div class="gd-slab-hero ${sealed ? "" : "is-retired"}">
          <span class="gd-stage-slab" aria-hidden="true"></span>
          ${card ? viewerBlock(slab, card, set, sealed ? slab.guard : null) : ""}
          ${sealed ? "" : `<span class="gd-void" aria-hidden="true">${esc(statusWord)}</span>`}
        </div>
        <div class="gd-slab-copy">
          <p class="gd-certline"><span class="gd-certmark ${sealed ? "is-ok" : "is-off rt-tag"}">${sealed ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>` : ""}${esc(statusWord)}</span><span>${esc(statusLine)}</span></p>
          <h1 class="gd-slab-h">${esc(card?.name || r.card.id)}</h1>
          <div class="gd-slab-sub">${gradePlate(slab.grade, slab.blackLabel)}<span class="gd-cert-no">${esc(r.cert)}</span></div>
          <dl class="rt-box gd-rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
          ${mineNow ? `<p class="gd-mine-note">This is your slab. <a class="tlink" href="/grading/${Number(slab.id)}" data-gd-link>Open it in Grading</a></p>` : ""}
          ${history ? `<section class="gd-section gd-history" aria-labelledby="gd-hist-h"><div class="gd-sec-head"><h2 class="gd-h" id="gd-hist-h">This copy's certs</h2></div><ul class="gd-certlist">${history}</ul></section>` : ""}
          ${certForm("", "is-foot")}
          ${fine()}
        </div>
      </div>
    </div>`;
    attachSlabViewers(root);
  }


  // ---- Slab guards: five shelves on the landing, the whole shop on its own page ----------
  const SHELF_FACE = { solid: "guard-cherry", duo: "guard-rainbow", metal: "guard-gilt", crystal: "guard-sapphire", motion: "guard-prism" };
  function shelvesHTML(preview) {
    const total = GUARDS.length;
    return `<section class="gd-section gd-shelves" aria-labelledby="gd-guards-h">
      <div class="gd-sec-head"><h2 class="gd-h" id="gd-guards-h">Slab guards</h2><a class="tlink gd-more-link" href="/grading/guards" data-gd-link>All ${total}</a></div>
      <p class="gd-sub">A bumper round the case, for looks only. ${total} styles on five shelves.</p>
      <ul class="gd-tierstrip">${GUARD_TIERS.map((t) => {
        const list = guardsInTier(t.id);
        const from = Math.min(...list.map((g) => g.price));
        const owned = ownedInTier(t.id);
        return `<li><a class="gd-tiercard" href="/grading/guards" data-gd-link data-gd-tier-go="${esc(t.id)}">
          <span class="gd-tiercard-obj rt-drop" aria-hidden="true">${preview ? slabMarkup(preview, "grid", "", SHELF_FACE[t.id]) : ""}</span>
          <b>${esc(t.name)}</b>
          <small>${list.length} styles, from ${COIN_IMG}${coins(from)}${owned ? `, ${owned} owned` : ""}</small>
        </a></li>`;
      }).join("")}</ul>
    </section>`;
  }

  async function paintShop() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    const preview = bestSlab() || (await sampleSlab());
    if (!visible || route.kind !== "guards") return;
    if (preview) await ensureSlabCards([preview]);
    if (!visible || route.kind !== "guards") return;
    pendingPreview = preview;
    const balance = coinsNow();
    const tier = GUARD_TIERS.find((t) => t.id === shopTier) || GUARD_TIERS[0];
    root.innerHTML = `<div class="gd-page gd-shop-page">
      ${back("/grading", "Grading")}
      <header class="gd-head">
        <h1 class="page-title">Slab guards</h1>
        <p class="gd-lede">A bumper round the slab's case, for looks only: the grade and value stay the same. Buy one here, then put it on from the slab's page.${preview && !preview.sample ? ` Shown on your best slab.` : ""}</p>
      </header>
      <section class="gd-section gd-shop" aria-label="${esc(tier.name)} guards">
        ${tierWords("data-gd-shop-tier", tier.id)}
        <p class="gd-tier-blurb">${esc(tier.blurb)}</p>
        <div class="gd-guards">${guardsInTier(tier.id).map((g) => guardShopTile(g, preview, balance)).join("")}</div>
      </section>
      ${fine()}
    </div>`;
  }

  // ---- The landing -------------------------------------------------------------
  /** The shelf of slabs (landing and Graded): staggered on the first paint after the page opens. */
  function shelfHTML(list) {
    const st = staggerNext;
    staggerNext = false;
    return `<ul class="gd-shelf">${list.map((s, i) => slabTile(s, st && i < 8 ? i : -1)).join("")}</ul>`;
  }

  async function paintLanding() {
    if (!signedIn()) {
      root.innerHTML = gate();
      // Signed out, the stage shows the sample slab too, not an empty outline.
      const sample = await sampleSlab();
      if (!sample || signedIn() || !visible || route.kind !== "landing") return;
      const stage = root.querySelector(".gd-gate .gd-stage");
      if (!stage) return;
      stage.outerHTML = stageHTML(`<span class="gd-stand rt-drop">${slabMarkup(sample, "inspect")}</span><span class="gd-stage-tag">Sample slab</span>`);
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
    const atCap = slabs.length >= GRADING_LIMITS.maxSlabs && slabs.length <= GRADING_LIMITS.maxSlabs;
    const gated = lock();
    const heroCard = preview ? deps.findCard(preview.cardId) : null;
    root.innerHTML = `<div class="gd-page gd-landing">
      <header class="gd-head gd-head-row">
        <div>
          <h1 class="page-title">Grading</h1>
          <p class="gd-lede">Send a card from your collection and it comes back sealed in a slab with a grade on the label.</p>
        </div>
        ${certForm("", "is-head")}
      </header>
      ${gateNoticeHTML(gated)}
      <section class="gd-lab" aria-labelledby="gd-how-h">
        ${stageHTML(
          preview
            ? `<a class="gd-stand rt-drop" href="${preview.sample ? "/grading/send" : `/grading/${Number(preview.id)}`}" data-gd-link aria-label="${preview.sample ? "Send a card" : esc(`${heroCard?.name || preview.cardId}, your best slab`)}">${slabMarkup(preview, "inspect")}</a>
               <span class="gd-stage-tag">${preview.sample ? "Sample slab" : "Your best"}</span>`
            : `<span class="gd-ghost-slab" aria-hidden="true"><span class="rt-ball e"></span></span>`,
          preview ? "" : "is-empty"
        )}
        <div class="gd-lab-info">
          <h2 class="gd-lab-h" id="gd-how-h">Send it to the lab</h2>
          ${steps(0)}
          <dl class="rt-box gd-figs">
            <div><dt>Fee</dt><dd><b>${COIN_IMG}${GRADING_FEE.flat}</b><small>+ ${Math.round(GRADING_FEE.rate * 100)}% of value</small></dd></div>
            <div><dt>Turnaround</dt><dd><b>Instant</b><small>graded as you send</small></dd></div>
            <div><dt>Rerolls</dt><dd><b>None</b><small>each card is drawn once</small></dd></div>
          </dl>
          <p class="gd-lab-note">Older sets come back a 10 less often. You see the odds before you pay.</p>
          <div class="gd-actions"><a class="solid rt-go gd-go${gated ? " is-gated" : ""}"${gated ? ' aria-disabled="true"' : ""} href="/grading/send" data-gd-link>Send a card</a></div>
          ${fine()}
        </div>
      </section>
      <section class="gd-section gd-mine" aria-labelledby="gd-slabs-h">
        <div class="gd-sec-head">
          <h2 class="gd-h" id="gd-slabs-h">Your slabs</h2>
          ${slabs.length ? `<a class="tlink gd-more-link" href="/grading/graded" data-gd-link>All ${slabs.length}</a>` : ""}
        </div>
        ${
          slabs.length
            ? `<p class="gd-sub gd-mine-sub"><b>${slabs.length}</b> ${slabs.length === 1 ? "slab" : "slabs"}${atCap ? ` of ${GRADING_LIMITS.maxSlabs}` : ""}, worth ${coinTag(worth)} together${onProfile ? `, ${onProfile} on your profile` : ""}.</p>
               ${shelfHTML(recent)}`
            : data.loaded
              ? `<div class="rt-empty gd-shelf-empty"><span class="gd-ghost-slab sm" aria-hidden="true"><span class="rt-ball e"></span></span><p>No slabs yet. Send a card and it stands here.</p></div>`
              : `<p class="gd-empty">Loading your slabs.</p>`
        }
      </section>
      ${inCasinoHTML()}
      ${shelvesHTML(preview)}
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
    const cap = slabRoom().cap;
    const atCap = slabs.length >= GRADING_LIMITS.maxSlabs && slabs.length <= GRADING_LIMITS.maxSlabs;
    root.innerHTML = `<div class="gd-page gd-graded">
      ${back("/grading", "Grading")}
      <header class="gd-head"><h1 class="page-title">Your slabs</h1></header>
      ${
        slabs.length
          ? `<div class="rt-box gd-sum">
              <div class="gd-sum-top">
                <p class="gd-sum-big"><b>${slabs.length}</b> ${slabs.length === 1 ? "slab" : "slabs"}${atCap ? ` of ${GRADING_LIMITS.maxSlabs}` : ""}</p>
                <p class="gd-sum-worth">Worth <b>${COIN_IMG}${coins(worth)}</b></p>
              </div>
              <p class="gd-sum-best">Best ${best ? gradePlate(best.grade, best.blackLabel, "sm") : "none yet"}</p>
              <div class="rt-hp gd-sum-hp" role="img" aria-label="${onProfile} of ${cap} profile spots used"><em>Profile</em><span class="rt-track"><i style="width:${cap ? Math.min(100, Math.round((onProfile / cap) * 100)) : 0}%"></i></span><small>${onProfile}/${cap}</small></div>
              ${handle ? `<a class="tlink gd-sum-link" href="/u/${esc(handle)}">See your profile</a>` : ""}
            </div>
            <div class="gd-graded-tools">
              <span class="gd-words" role="group" aria-label="Sort">${GRADED_SORTS.map(([id, label]) => `<button type="button" data-gd-gsort="${id}" class="rt-word ${gradedSort === id ? "on" : ""}" aria-pressed="${gradedSort === id}">${label}</button>`).join("")}</span>
            </div>
            ${shelfHTML(slabs)}`
          : data.loaded
            ? `<div class="rt-empty gd-shelf-empty"><span class="gd-ghost-slab sm" aria-hidden="true"><span class="rt-ball e"></span></span><p>No slabs yet. Send a card and it shows up here.</p></div>
               <div class="gd-actions"><a class="solid rt-go" href="/grading/send" data-gd-link>Send a card</a></div>`
            : `<p class="gd-empty">Loading your slabs.</p>`
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
    return `<div class="gd-gshop${owned ? " is-owned" : ""}" data-gd-shop="${esc(guard.id)}">
      <div class="gd-gshop-preview" aria-hidden="true"><span class="gd-gshop-obj rt-drop">${preview ? slabMarkup(preview, "grid", "", guard.id) : ""}</span></div>
      <div class="gd-gshop-copy">
        <span class="gd-gshop-top"><b class="gd-gshop-name">${esc(guard.name)}</b><span class="gd-gshop-price">${COIN_IMG}${coins(guard.price)}<span class="sr-only"> coins each</span></span></span>
        <span class="gd-gshop-blurb"><i class="gd-swatch" data-guard="${esc(guard.id)}" aria-hidden="true"></i>${esc(guard.blurb)}</span>
        ${owned ? `<span class="gd-gshop-line"><span class="gd-own-tag">${owned} owned</span>${on ? `${on} on a slab` : ""}</span>` : ""}
        <div class="gd-buy">
          <span class="gd-qty" role="group" aria-label="How many">
            <button type="button" data-gd-qty="${esc(guard.id)}:-1" aria-label="One fewer" ${qty <= 1 ? "disabled" : ""}>−</button>
            <output aria-live="polite">${qty}</output>
            <button type="button" data-gd-qty="${esc(guard.id)}:1" aria-label="One more" ${qty >= GRADING_LIMITS.maxGuardQty ? "disabled" : ""}>+</button>
          </span>
          <button type="button" class="ghost sm" data-gd-buy="${esc(guard.id)}" ${short || isBuying ? "disabled" : ""}>${isBuying ? "Buying" : retry ? "Try again" : `Buy ${coinTag(cost)}`}</button>
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
      delete shopQty[guardId]; // back to 1, so the next tap doesn't buy the same stack again
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
            (e, i) => `<a class="gd-pick-card${i < 8 && pickStagger ? " gd-in" : ""}"${i < 8 ? ` style="--i:${i}"` : ""} href="/grading/send/${esc(e.id)}" data-gd-link>
          <span class="gd-pick-artbox"><img class="gd-pick-art" src="${esc(e.card.imageSmall || e.card.image)}" alt="" loading="lazy" decoding="async" />${e.owned > 1 ? `<span class="gd-pick-qty">×${e.owned}</span>` : ""}</span>
          <b>${esc(e.card.name)}</b>
          <small>${esc(e.set.name)}${e.reverse ? ", reverse" : ""}</small>
          <span class="gd-pick-fee"><span>Fee</span>${COIN_IMG}${coins(e.fee)}</span>
        </a>`
          )
          .join("") +
        (list.length > shown.length
          ? `<button class="gd-more ghost" type="button" data-gd-more>Show ${Math.min(PICK_PAGE, list.length - shown.length)} more of ${list.length - shown.length}</button>`
          : "")
      : `<div class="rt-empty gd-pick-empty"><span class="rt-ball e" aria-hidden="true"></span><p>${pickQuery ? "No card matches that." : "No cards yet. Rip a pack first, then pick a card to send."}</p>${pickQuery ? "" : `<a class="ghost sm" href="/packs">See the packs</a>`}</div>`;
    pickStagger = false;
  }

  async function paintPicker() {
    if (!signedIn()) {
      root.innerHTML = gate();
      return;
    }
    pickStagger = true;
    root.innerHTML = `<div class="gd-page gd-pick">
      ${back("/grading", "Grading")}
      <header class="gd-head">
        <h1 class="page-title">Send a card</h1>
        ${steps(0)}
      </header>
      ${gateNoticeHTML(lock())}
      <div class="gd-pick-tools">
        <label class="gd-search"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-search"/></svg><input type="search" inputmode="search" placeholder="Search your cards" aria-label="Search your cards" autocomplete="off" enterkeyhint="search" value="${esc(pickQuery)}" data-gd-search /></label>
        <span class="gd-words" role="group" aria-label="Sort">
          <button type="button" data-gd-sort="value" class="rt-word ${pickSort === "value" ? "on" : ""}">Highest value</button>
          <button type="button" data-gd-sort="name" class="rt-word ${pickSort === "name" ? "on" : ""}">Name</button>
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
    const top = Math.max(...GRADES.map((g) => band.odds[g] || 0)) || 1;
    const row = (g, word, value, bp, cls = "") =>
      `<div class="gd-rate-row ${cls}"><dt><b>${g}</b><span>${esc(word)}</span></dt><dd><span class="gd-rate-bar" aria-hidden="true"><i style="width:${Math.max(2, Math.round((bp / top) * 100))}%"></i></span><span class="gd-rate-val">${value}</span></dd></div>`;
    const rows = GRADES.map((g) => row(g, GRADE_WORDS[g], pct(band.odds[g]), band.odds[g], g === 10 ? "is-ten" : ""));
    // A Black Label is a 10 with four perfect subgrades: it comes out of the 10s, so it sits under the 10 row.
    rows.splice(1, 0, `<div class="gd-rate-row gd-rate-black"><dt><b>10</b><span>${esc(BLACK_LABEL.word)}</span></dt><dd><span class="gd-rate-val">1 in ${Math.round((10000 / band.odds[10]) * band.blackIn).toLocaleString("en-US")}</span></dd></div>`);
    return rows.join("");
  }

  function expectedWords(band) {
    const mode = GRADES.reduce((best, g) => (band.odds[g] > band.odds[best] ? g : best), 10);
    return `Most cards from ${band.label} sets come back ${article(mode)} ${mode}, ${GRADE_WORDS[mode]}. About ${pct(band.odds[10])} of them are a 10, and 1 in ${band.blackIn.toLocaleString("en-US")} of those 10s is a ${BLACK_LABEL.word} (all four subgrades perfect).`;
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
      root.innerHTML = `<div class="gd-page gd-send-page">${back("/grading/send", "Pick another card")}<div class="rt-empty gd-pick-empty"><span class="rt-ball e" aria-hidden="true"></span><p>That card isn't in the catalog.</p></div></div>`;
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
    root.innerHTML = `<div class="gd-page gd-send-page${busy ? " is-sending" : ""}">
      ${back("/grading/send", "Pick another card")}
      <div class="gd-send">
        <div class="gd-send-card">
          ${stageHTML(rawCard(card, reverse, raw), "is-card")}
        </div>
        <div class="gd-send-copy">
          ${steps(busy ? 2 : 1)}
          <h1 class="gd-send-h">${esc(card.name)}</h1>
          <p class="gd-cardline">${esc(set.name)}, ${esc(numberLine(card, set))}${reverse ? ", reverse holo" : card.rarity ? `, ${esc(card.rarity)}` : ""}</p>
          ${
            plain > 0 && rev > 0
              ? `<div class="gd-seg" role="group" aria-label="Which copy">
                  <button type="button" class="rt-word ${reverse ? "" : "on"}" aria-pressed="${!reverse}" data-gd-copy="plain" ${busy ? "disabled" : ""}>Plain <small>${plain}</small></button>
                  <button type="button" class="rt-word ${reverse ? "on" : ""}" aria-pressed="${reverse}" data-gd-copy="reverse" ${busy ? "disabled" : ""}>Reverse holo <small>${rev}</small></button>
                </div>`
              : ""
          }
          <dl class="rt-box gd-figs">
            <div class="is-fee"><dt>Fee</dt><dd><b>${COIN_IMG}${coins(fee)}</b><small>${GRADING_FEE.flat} + ${Math.round(GRADING_FEE.rate * 100)}% of ${coins(raw)}</small></dd></div>
            <div><dt>Turnaround</dt><dd><b>Instant</b><small>graded as you send</small></dd></div>
            <div class="${short ? "is-short" : ""}"><dt>You have</dt><dd><b>${COIN_IMG}${coins(balance)}</b><small>${short ? `${coins(Math.round((fee - balance) * 100) / 100)} short` : `${coins(Math.round((balance - fee) * 100) / 100)} after`}</small></dd></div>
          </dl>
          <p class="gd-error" role="alert" ${sendError ? "" : "hidden"}>${esc(sendError)}</p>
          ${
            owns
              ? `${gateNoticeHTML(lock())}<div class="gd-send-go"><button type="button" class="solid rt-go gd-send-btn" data-gd-submit ${busy || short || lock() ? "disabled" : ""}>${busy ? "Sending" : attempt && sendError ? `Try again ${coinTag(fee)}` : `Send for grading ${coinTag(fee)}`}</button></div>
                 ${short ? `<small class="gd-reason">Needs ${coins(fee)} coins, you have ${coins(balance)}.</small>` : ""}`
              : `<p class="gd-reason">You don't own ${reverse ? "a reverse holo" : "a plain"} copy of this card any more.</p>`
          }
          <section class="rt-box gd-ratecard" aria-labelledby="gd-odds-h">
            <div class="gd-box-head"><h2 id="gd-odds-h">Odds for ${esc(band.label)} sets</h2><span>Chance of each grade</span></div>
            <dl class="gd-rates">${oddsRows(band)}</dl>
            <p class="gd-ratecard-note">${esc(expectedWords(band))}</p>
          </section>
          <section class="rt-box gd-worthbox" aria-labelledby="gd-worth-h">
            <div class="gd-box-head"><h2 id="gd-worth-h">What it would be worth</h2></div>
            <dl class="gd-worths">
              <div class="is-black"><dt>${gradePlate(10, true, "xs")}</dt><dd>${COIN_IMG}${coins(gradedValue(card, 10, set, true))}</dd></div>
              <div><dt>${gradePlate(10, false, "xs")}</dt><dd>${COIN_IMG}${coins(gradedValue(card, 10, set))}</dd></div>
              <div><dt>${gradePlate(9, false, "xs")}</dt><dd>${COIN_IMG}${coins(gradedValue(card, 9, set))}</dd></div>
              <div><dt>${gradePlate(8, false, "xs")}</dt><dd>${COIN_IMG}${coins(gradedValue(card, 8, set))}</dd></div>
              <div class="is-raw"><dt><span class="gd-raw-word">Raw, today</span></dt><dd>${COIN_IMG}${coins(raw)}</dd></div>
            </dl>
            <p class="gd-worth-note">${BLACK_LABEL_SALES[card.id] ? `The ${esc(BLACK_LABEL.word)} price comes from ${BLACK_LABEL_SALES[card.id].n} real Beckett Black Label sales of this card.` : `A ${esc(BLACK_LABEL.word)} is worth about ${BLACK_LABEL.premium} times a 10.`}</p>
          </section>
          <p class="gd-policy">You can crack a slab to get the raw card back at any time; grading it again costs a new fee. There are no rerolls.</p>
          ${fine()}
        </div>
      </div>
    </div>`;
  }

  /** One submission, idempotent: a retry after a network error sends the same requestId. Resolves with the slab. */
  async function doSubmit(cardId, isReverse, regradeOf = 0) {
    if (!attempt || attempt.cardId !== cardId || Boolean(attempt.reverse) !== isReverse) {
      attempt = { requestId: uuid(), cardId, reverse: isReverse, at: Date.now() };
    }
    if (regradeOf) attempt.regradeOf = Number(regradeOf);
    writeAttempt(attempt);
    try {
      // A regrade names the slab it came out of, so the cert keeps the copy's first grading date.
      const res = await post("/api/grading/submit", { cardId, reverse: isReverse, requestId: attempt.requestId, ...(attempt.regradeOf ? { regradeOf: attempt.regradeOf } : {}) });
      attempt = null;
      writeAttempt(null);
      return res.slab;
    } catch (err) {
      if (!isNetwork(err)) {
        // The server said no and made nothing: the next try is a new attempt.
        attempt = null;
        writeAttempt(null);
      }
      throw err;
    }
  }

  const sendFailure = (err) =>
    isNetwork(err)
      ? "Couldn't reach the server. Nothing was charged; try again and the same request goes out, so it can't be graded twice."
      : err.message || "That didn't work.";

  async function submit() {
    if (stage !== "form") return;
    if (lock()) return toast(gateRefusal(lock()));
    const cardId = route.cardId;
    stage = "sending";
    sendError = "";
    render();
    try {
      const slab = await doSubmit(cardId, reverse);
      if (!visible || route.kind !== "send" || route.cardId !== cardId) return;
      await showReveal(slab);
    } catch (err) {
      stage = "form";
      sendError = sendFailure(err);
      if (visible && route.kind === "send" && route.cardId === cardId) render();
    }
  }

  /** "+12.30" / "−96.30" for the gap between a slab's value and the raw card. */
  const signedCoins = (n) => `${n > 0.004 ? "+" : n < -0.004 ? "\u2212" : ""}${coins(Math.abs(n))}`;

  /** How rare this grade is for the card's era, from the same odds the send page prints. */
  function rarityLine(slab, set) {
    const band = set ? bandFor(set) : null;
    const odds = band?.odds?.[slab.grade];
    if (!band || !odds) return "";
    if (slab.grade === 10 && slab.blackLabel) {
      return `A ${BLACK_LABEL.word}: about 1 in ${Math.round((band.blackIn * 10000) / odds).toLocaleString("en-US")} cards from ${band.label} sets.`;
    }
    return `${odds > 0 && odds < 5 ? "Fewer than 0.1%" : `About ${pct(odds)}`} of cards from ${band.label} sets come back ${article(slab.grade)} ${slab.grade}.`;
  }

  /** The line under the numbers: what the slab is worth next to the raw card, and what to do about it. */
  function valueHint(value, raw, fee) {
    const gap = value - raw;
    if (gap < -0.004) return `Worth ${coins(-gap)} less than the raw card. Crack it to get the raw card back, or regrade for another shot.`;
    if (gap > 0.004) return `Worth ${coins(gap)} more than the raw card. Sell it, keep it, or put a guard on it.`;
    return `Worth the same as the raw card. Regrading costs ${coins(fee)} and could go either way.`;
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
    const raw = card ? sellValue(card) : 0;
    const value = Number(slab.value) || 0;
    const fee = card ? gradingFee(card) : 0;
    const short = coinsNow() + 1e-9 < fee;
    const gap = value - raw;
    root.innerHTML = `<div class="gd-page gd-reveal" data-tier="${tierName(slab.grade, slab.blackLabel)}">
      ${stageHTML(`<div class="gd-arrive"><div class="gd-stand rt-drop">${slabMarkup(slab, "hero")}</div></div>`, "is-reveal")}
      <div class="gd-result" aria-live="polite" inert>
        <p class="gd-result-label">${esc(card?.name || slab.cardId)}<span>${esc(set?.name || "")}, ${esc(numberLine(card, set))}${slab.reverse ? ", reverse holo" : ""}</span></p>
        <h2 class="gd-result-grade" tabindex="-1"><span class="gd-plate big" data-tier="${tierName(slab.grade, slab.blackLabel)}"><b data-roll="${slab.grade}" data-grade>${slab.grade}</b><span>${esc(gradeWord(slab.grade, slab.blackLabel))}</span></span></h2>
        <p class="gd-result-rare">${esc(rarityLine(slab, set))}</p>
        ${
          card
            ? `<dl class="rt-box gd-ledger">
                <div><dt>Slab value</dt><dd>${coinFig(value)}</dd></div>
                <div><dt>Raw card</dt><dd>${coinFig(raw)}</dd></div>
                <div class="${gap > 0.004 ? "is-up" : gap < -0.004 ? "is-down" : ""}"><dt>Difference</dt><dd>${coinFig(gap, true)}</dd></div>
              </dl>
              <p class="gd-result-hint">${esc(valueHint(value, raw, fee))}</p>`
            : ""
        }
        <p class="gd-error" role="alert" hidden></p>
        <div class="gd-result-actions">
          <a class="solid rt-go gd-result-main" href="/grading/${Number(slab.id)}" data-gd-link>Add a guard</a>
          ${
            card
              ? `<div class="gd-result-more">
                  <button type="button" class="ghost sm" data-gd-r="sell">Sell ${coinTag(value)}</button>
                  <button type="button" class="ghost sm" data-gd-r="regrade" ${short ? 'disabled data-gd-short="1"' : ""}>Regrade ${coinTag(fee)}</button>
                  ${slab.blackLabel ? "" : `<a class="ghost sm" href="/grading/${Number(slab.id)}/auto" data-gd-link>Auto-regrade</a>`}
                  <button type="button" class="ghost sm" data-gd-r="crack">Crack the slab</button>
                </div>`
              : ""
          }
        </div>
        ${short && card ? `<small class="gd-reason">Regrading needs ${coins(fee)} coins, you have ${coins(coinsNow())}.</small>` : ""}
        <p class="gd-result-links"><a class="tlink" href="/grading/send" data-gd-link>Send another</a><a class="tlink" href="/grading" data-gd-link>See your slabs</a></p>
        <p class="gd-cert">Cert ${esc(slab.cert || "")}</p>
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
    // The grade is on the label: now the price goes on the case and the numbers come up.
    root.querySelector(".gd-reveal")?.classList.add("is-priced");
    const result = root.querySelector(".gd-result");
    result?.removeAttribute("inert");
    result?.classList.add("is-shown");
    roll(result);
    root.querySelector(".gd-result-grade")?.focus({ preventScroll: true });
  }

  // ---- Crack, regrade and sell on the result screen -------------------------------
  function resultError(message) {
    const line = root.querySelector(".gd-result .gd-error");
    if (!line) return;
    line.textContent = message || "";
    line.hidden = !message;
  }

  /** Lock the result's buttons while a move is in flight; `button` shows the word for it. */
  function resultBusy(on, button, word = "Working") {
    const el = root.querySelector(".gd-result");
    if (!el) return;
    el.classList.toggle("is-busy", on);
    el.setAttribute("aria-busy", on ? "true" : "false");
    el.querySelectorAll("button").forEach((b) => {
      b.disabled = on || b.dataset.gdShort === "1";
    });
    if (!button) return;
    if (on) {
      button.dataset.was = button.innerHTML;
      button.textContent = word;
    } else if (button.dataset.was) {
      button.innerHTML = button.dataset.was;
      delete button.dataset.was;
    }
  }

  /** The raw card is back in the collection and the old slab is gone: send it in again, on this same screen. */
  async function sendAgain(slab) {
    const cardId = slab.cardId;
    const isReverse = Boolean(slab.reverse);
    route = { kind: "send", slabId: 0, cardId };
    reverse = isReverse;
    stage = "sending";
    sendError = "";
    revealed = null;
    try {
      const fresh = await doSubmit(cardId, isReverse, slab.id);
      if (!visible || route.kind !== "send" || route.cardId !== cardId || stage !== "sending") return;
      await showReveal(fresh);
    } catch (err) {
      if (!visible || route.kind !== "send" || route.cardId !== cardId || stage !== "sending") return;
      // Cracked, but the new grade didn't go through: the form for that card, with the reason.
      stage = "form";
      sendError = `The slab is cracked and the raw card is back in your collection. ${sendFailure(err)}`;
      try {
        history.replaceState(history.state, "", `/grading/send/${cardId}${isReverse ? "?reverse=1" : ""}`);
      } catch {
        /* no history */
      }
      render();
    }
  }

  /** The slab is cracked: the raw card, the price it would sell for, and one tap to grade it again. */
  async function paintCracked(slab) {
    const { card, set } = await ensureCard(slab.cardId);
    if (!visible || stage !== "cracked") return;
    const raw = card ? sellValue(card) : 0;
    const fee = card ? gradingFee(card) : 0;
    const short = coinsNow() + 1e-9 < fee;
    root.innerHTML = `<div class="gd-page gd-reveal is-priced gd-cracked">
      ${stageHTML(rawCard(card, slab.reverse, raw), "is-card is-reveal")}
      <div class="gd-result is-shown" aria-live="polite">
        <p class="gd-result-label">${esc(card?.name || slab.cardId)}<span>${esc(set?.name || "")}, ${esc(card ? numberLine(card, set) : "")}${slab.reverse ? ", reverse holo" : ""}</span></p>
        <h2 class="gd-result-grade" tabindex="-1"><span class="gd-plate big" data-tier="cracked"><span>Cracked</span></span></h2>
        <p class="gd-result-hint">The raw card is back in your collection, worth ${coinTag(raw)}. The ${slab.grade} and the cert are gone, and the first fee isn't refunded.</p>
        <p class="gd-error" role="alert" hidden></p>
        <div class="gd-result-actions">
          <button type="button" class="solid rt-go gd-result-main" data-gd-r="again" ${short ? 'disabled data-gd-short="1"' : ""}>Grade it again ${coinTag(fee)}</button>
          <div class="gd-result-more"><a class="ghost sm" href="/grading/send" data-gd-link>Send another</a></div>
        </div>
        ${short ? `<small class="gd-reason">Grading needs ${coins(fee)} coins, you have ${coins(coinsNow())}.</small>` : ""}
        <p class="gd-result-links"><a class="tlink" href="/grading" data-gd-link>See your slabs</a></p>
      </div>
    </div>`;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }
    root.querySelector(".gd-result-grade")?.focus({ preventScroll: true });
  }

  async function crackHere(slab, button) {
    resultBusy(true, button, "Cracking");
    resultError("");
    try {
      await post("/api/grading/crack", { slabId: slab.id });
    } catch (err) {
      resultBusy(false, button);
      resultError(errorLine(err));
      return;
    }
    if (revealed !== slab) return;
    stage = "cracked";
    try {
      history.replaceState(history.state, "", `/grading/send/${slab.cardId}${slab.reverse ? "?reverse=1" : ""}`);
    } catch {
      /* no history */
    }
    await paintCracked(slab);
  }

  async function regradeHere(slab, button) {
    resultBusy(true, button, "Regrading");
    resultError("");
    try {
      await post("/api/grading/crack", { slabId: slab.id });
    } catch (err) {
      resultBusy(false, button);
      resultError(errorLine(err));
      return;
    }
    if (revealed !== slab) return;
    await sendAgain(slab);
  }

  async function sellHere(slab, button) {
    resultBusy(true, button, "Selling");
    resultError("");
    const requestId = slabSaleId || uuid();
    slabSaleId = requestId;
    let sold = 0;
    try {
      const res = await post("/api/grading/sell", { slabId: slab.id, requestId });
      sold = Number(res?.sold) || 0;
    } catch (err) {
      if (!isNetwork(err)) slabSaleId = "";
      resultBusy(false, button);
      resultError(errorLine(err));
      return;
    }
    slabSaleId = "";
    toast(`Sold for ${coins(sold)} coins.`);
    if (revealed === slab && visible) navigate("/grading");
  }

  async function resultAction(kind, button) {
    const slab = revealed;
    if (!slab) return;
    if (kind === "again") {
      resultBusy(true, button, "Sending");
      resultError("");
      return sendAgain(slab);
    }
    const card = deps.findCard(slab.cardId);
    const name = esc(card?.name || "The card");
    const word = `${slab.grade} ${esc(gradeWord(slab.grade, slab.blackLabel))}`;
    if (kind === "regrade") {
      const fee = card ? gradingFee(card) : 0;
      const ok = await confirmSheet({
        title: "Regrade this card?",
        body: `${name} comes out of its slab and goes straight back in for a new grade. The ${word} and the cert are gone, the first fee isn't refunded, and the new fee is ${coinTag(fee)}. It can come back higher or lower.`,
        confirm: `Regrade ${coinTag(fee)}`,
        cancel: "Keep it",
      });
      if (ok && revealed === slab) regradeHere(slab, button);
    } else if (kind === "crack") {
      const ok = await confirmSheet({
        title: "Crack the slab?",
        body: `${name} goes back to your collection as a raw card. The ${word} grade and the cert are gone, and the fee isn't refunded. Grading it again costs a new fee.`,
        confirm: "Crack it",
        danger: true,
      });
      if (ok && revealed === slab) crackHere(slab, button);
    } else if (kind === "sell") {
      const ok = await confirmSheet({
        title: `Sell the slab for ${coinTag(slab.value)}?`,
        body: `${name}, graded ${word}, leaves your collection and the coins arrive right away.`,
        confirm: `Sell ${coinTag(slab.value)}`,
        cancel: "Keep it",
      });
      if (ok && revealed === slab) sellHere(slab, button);
    }
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
    return { kind: "buy", guardId: pick, label: `Buy ${guard.name} ${coinTag(guard.price)}`, short, price: guard.price };
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
    // The copy's history (first graded, regrades) comes from its public cert; drawn when it arrives.
    const certHit = certCache.get(slab.cert);
    const lineage = certHit?.res && Number(certHit.res.slab?.id) === Number(slab.id) ? certHit.res : null;
    if (!certHit && slab.cert) lookupCert(slab.cert).then((got) => { if (got.res?.regrades > 0 && visible && route.kind === "slab" && route.slabId === slab.id) render(); });
    const current = slab.guard || null;
    const pick = slabPick === undefined ? current : slabPick;
    const action = guardAction(slab);
    const raw = card ? sellValue(card) : 0;
    const value = Number(slab.value) || (card ? gradedValue(card, slab.grade, set) : 0);
    const fee = card ? gradingFee(card) : 0;
    const short = coinsNow() + 1e-9 < fee;
    root.innerHTML = `<div class="gd-page gd-slab-page">
      ${back("/grading", "Your slabs")}
      <div class="gd-slab-layout">
        <div class="gd-slab-hero gd-slab-stage">
          <span class="gd-stage-slab" aria-hidden="true"></span>
          ${card ? viewerBlock(slab, card, set, pick) : `<div class="gd-stand rt-drop">${slabMarkup(slab, "inspect", "", pick)}</div>`}
        </div>
        <div class="gd-slab-copy">
          <h1 class="gd-slab-h">${esc(card?.name || slab.cardId)}</h1>
          <div class="gd-slab-sub">${gradePlate(slab.grade, slab.blackLabel)}<span class="gd-slab-val">${COIN_IMG}${coins(value)}</span></div>
          <dl class="rt-box gd-rows">
            <div><dt>Set</dt><dd>${esc(set?.name || "")}</dd></div>
            <div><dt>Number</dt><dd>${esc(numberLine(card, set))}${slab.reverse ? ", reverse holo" : ""}</dd></div>
            <div><dt>Cert</dt><dd><a class="tlink" href="/cert/${esc(slab.cert || "")}" data-gd-link>${esc(slab.cert || "")}</a></dd></div>
            <div><dt>Graded</dt><dd>${esc(dateWords(slab.gradedAt))}</dd></div>
            ${lineage?.regrades > 0 ? `<div><dt>First graded</dt><dd>${esc(dateWords(lineage.firstGradedAt))}<small>regraded ${lineage.regrades === 1 ? "once" : `${lineage.regrades.toLocaleString("en-US")} times`}</small></dd></div>` : ""}
            <div><dt>Raw card</dt><dd>${COIN_IMG}${coins(raw)}${Math.abs(value - raw) > 0.004 ? `<small class="${value > raw ? "is-up" : "is-down"}">slab ${value > raw ? "+" : "−"}${coins(Math.abs(value - raw))}</small>` : ""}</dd></div>
          </dl>
          <div class="gd-showrow">
            <button type="button" class="ghost sm" data-gd-show="${slab.shown ? "0" : "1"}" ${slabBusy ? "disabled" : ""}>${slabBusy ? "Working" : slab.shown ? "Remove from profile" : "Show on profile"}</button>
            <small class="gd-reason">${
              slab.shown
                ? `In the Graded section of your profile.${handleNow() ? ` <a href="/u/${esc(handleNow())}">See it</a>` : ""}`
                : `Your profile has room for ${slabRoom().cap} slabs, ${shownCount()} in use.${slabRoom().more}`
            }</small>
          </div>
          <section class="rt-box gd-guardbox" aria-labelledby="gd-guard-h">
            <div class="gd-box-head"><h2 id="gd-guard-h">Guard</h2><span>For looks only</span></div>
            ${tierWords("data-gd-pick-tier", pickTier || (pickTier = tierOf(pick || current)))}
            <div class="gd-gtiles" role="group" aria-label="Guard style">
              <button type="button" class="gd-gtile ${pick === null ? "on" : ""}" data-gd-pick="" ${slabBusy ? "disabled" : ""}><i class="gd-swatch none"></i><b>None</b><small>${current ? "Take it off" : "As it is"}</small></button>
              ${guardsInTier(pickTier).map((g) => {
                const owned = ownedOf(g.id);
                const free = freeOf(g.id);
                return `<button type="button" class="gd-gtile ${pick === g.id ? "on" : ""} ${current === g.id ? "is-current" : ""}" data-gd-pick="${esc(g.id)}" ${slabBusy ? "disabled" : ""}>
                  <i class="gd-swatch" data-guard="${esc(g.id)}"></i><b>${esc(g.name)}</b>
                  <small>${current === g.id ? "On this slab" : owned ? `${free} of ${owned} free` : coinTag(g.price)}</small></button>`;
              }).join("")}
            </div>
            <div class="gd-guard-actions">${guardActionHTML(slab, action)}</div>
          </section>
          <p class="gd-error" role="alert" ${slabError ? "" : "hidden"}>${esc(slabError)}</p>
          <div class="gd-slab-actions">
            <button type="button" class="ghost sm" data-gd-sell ${slabBusy ? "disabled" : ""}>Sell slab ${coinTag(value)}</button>
            ${card ? `<button type="button" class="ghost sm" data-gd-regrade ${slabBusy || short ? "disabled" : ""}>${slabBusy ? "Working" : `Regrade ${coinTag(fee)}`}</button>` : ""}
            ${card && !slab.blackLabel ? `<a class="ghost sm" href="/grading/${slab.id}/auto" data-gd-link>Auto-regrade</a>` : ""}
            <button type="button" class="ghost sm" data-gd-crack ${slabBusy ? "disabled" : ""}>Crack the slab</button>
          </div>
          <p class="gd-policy">Cracking returns the raw card to your collection; the grade is gone and the fee isn't refunded. Regrading cracks it and sends the card straight back in for a new fee; Auto-regrade keeps doing that until it lands the grade you pick. Selling takes the graded value in coins.</p>
          ${fine()}
        </div>
      </div>
    </div>`;
    attachSlabViewers(root);
  }

  /** The guard box's one key: yellow when it does something, a quiet disabled key when it doesn't. */
  function guardActionHTML(slab, action) {
    return action.kind === "guard"
      ? `<button type="button" class="solid rt-go" data-gd-guard="${action.guardId === null ? "" : esc(action.guardId)}" ${slabBusy ? "disabled" : ""}>${slabBusy ? "Working" : action.label}</button>`
      : action.kind === "buy"
        ? `<button type="button" class="solid rt-go" data-gd-buy-one="${esc(action.guardId)}" ${slabBusy || action.short ? "disabled" : ""}>${slabBusy ? "Working" : action.label}</button>
           <small class="gd-reason">${action.short ? `Needs ${coins(action.price)} coins, you have ${coins(coinsNow())}.` : "None free in your stock. Buy one and it goes straight on."}</small>`
        : `<button type="button" class="ghost" disabled>${esc(action.label)}</button>`;
  }

  function previewGuard(guardId) {
    slabPick = guardId;
    slabError = "";
    const slab = slabById(route.slabId);
    if (!slab) return;
    // Redraw the slab with the picked guard (the bumper has sides and a back too).
    const viewer = root.querySelector(".gd-slab-stage .gd-viewer");
    const card = deps.findCard(slab.cardId);
    if (viewer && card) {
      const holder = document.createElement("div");
      holder.innerHTML = viewerBlock(slab, card, setOfCard(slab.cardId), guardId);
      viewer.replaceWith(holder.firstElementChild);
      attachSlabViewers(root);
    }
    root.querySelectorAll("[data-gd-pick]").forEach((b) => b.classList.toggle("on", (b.dataset.gdPick || null) === guardId));
    const actions = root.querySelector(".gd-guard-actions");
    if (!actions) return;
    const action = guardAction(slab);
    actions.innerHTML = guardActionHTML(slab, action);
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

  /** Crack this slab and send the raw card straight back in: one confirm, no screens in between. */
  async function regradeSlab(slab) {
    if (slabBusy) return;
    slabBusy = true;
    slabError = "";
    render();
    try {
      await post("/api/grading/crack", { slabId: slab.id });
    } catch (err) {
      slabBusy = false;
      slabError = errorLine(err);
      if (visible && route.kind === "slab") render();
      return;
    }
    slabBusy = false;
    if (!visible || route.kind !== "slab" || route.slabId !== slab.id) return;
    await sendAgain(slab);
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
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="m6 6 12 12M18 6 6 18"/></svg>
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

  // Auto-regrade (js/grading-auto.js) draws /grading/<id>/auto and /grading/auto/<runId> with these helpers.
  const auto = initAutoRegrade({
    root,
    api: deps.api,
    post,
    isVisible: () => visible,
    slabById,
    ensureCard,
    slabMarkup,
    gradePlate,
    stageHTML,
    back,
    coinTag,
    coinsNow,
    fine,
    motion,
    confirmSheet,
    navigate,
    toast,
    errorLine,
    refresh: () => refresh(),
  });

  // ---- Events -----------------------------------------------------------------
  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const link = t.closest("[data-gd-link]");
    if (link?.dataset.gdTierGo) shopTier = link.dataset.gdTierGo;
    if (link) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      const href = link.getAttribute("href");
      if (link.dataset.gdReverse === "1") sendReverse = true;
      navigate(href);
      return;
    }
    if (route.kind.startsWith("auto") && auto.click(t)) return;
    const flip = t.closest("[data-sv-flip]");
    if (flip) {
      const stage = flip.closest(".gd-viewer")?.querySelector("[data-sv]");
      if (stage) flip.textContent = flipSlab(stage) ? "Turn back" : "Turn over";
      return;
    }
    if (t.closest("[data-sv-full]")) return openViewerFull();
    const shareBtn = t.closest("[data-gd-share-cert]");
    if (shareBtn) return shareCert(shareBtn.dataset.gdShareCert);
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
    const shopTierBtn = t.closest("[data-gd-shop-tier]");
    if (shopTierBtn) {
      shopTier = shopTierBtn.dataset.gdShopTier;
      // Only the shelf changes; the slabs above keep their drawn state.
      const shop = root.querySelector(".gd-shop");
      if (!shop) return;
      shop.querySelectorAll("[data-gd-shop-tier]").forEach((b) => b.classList.toggle("on", b === shopTierBtn));
      const blurb = shop.querySelector(".gd-tier-blurb");
      if (blurb) blurb.textContent = GUARD_TIERS.find((x) => x.id === shopTier)?.blurb || "";
      const list = shop.querySelector(".gd-guards");
      if (list) list.innerHTML = guardsInTier(shopTier).map((g) => guardShopTile(g, bestSlab() || pendingPreview, coinsNow())).join("");
      return;
    }
    const pickTierBtn = t.closest("[data-gd-pick-tier]");
    if (pickTierBtn) {
      if (pickTier !== pickTierBtn.dataset.gdPickTier) picked = `[data-gd-pick-tier="${pickTierBtn.dataset.gdPickTier}"]`;
      pickTier = pickTierBtn.dataset.gdPickTier;
      render();
      return;
    }
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
      if (reverse !== (copy.dataset.gdCopy === "reverse")) picked = `[data-gd-copy="${copy.dataset.gdCopy}"]`;
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
      if (gradedSort !== gsort.dataset.gdGsort) {
        picked = `[data-gd-gsort="${gsort.dataset.gdGsort}"]`;
        staggerNext = true; // the reordered shelf's first slabs rise in turn
      }
      gradedSort = gsort.dataset.gdGsort;
      render();
      return;
    }
    const buyOneBtn = t.closest("[data-gd-buy-one]");
    if (buyOneBtn) return buyOne(buyOneBtn.dataset.gdBuyOne);
    const rBtn = t.closest("[data-gd-r]");
    if (rBtn) return resultAction(rBtn.dataset.gdR, rBtn);
    if (t.closest("[data-gd-regrade]")) {
      const slab = slabById(route.slabId);
      if (!slab) return;
      const card = deps.findCard(slab.cardId);
      const fee = card ? gradingFee(card) : 0;
      const ok = await confirmSheet({
        title: "Regrade this card?",
        body: `${esc(card?.name || "The card")} comes out of its slab and goes straight back in for a new grade. The ${slab.grade} ${esc(gradeWord(slab.grade, slab.blackLabel))} and the cert are gone, the first fee isn't refunded, and the new fee is ${coinTag(fee)}. It can come back higher or lower.`,
        confirm: `Regrade ${coinTag(fee)}`,
        cancel: "Keep it",
      });
      if (ok) regradeSlab(slab);
      return;
    }
    if (t.closest("[data-gd-crack]")) {
      const slab = slabById(route.slabId);
      if (!slab) return;
      const card = deps.findCard(slab.cardId);
      const ok = await confirmSheet({
        title: "Crack the slab?",
        body: `${esc(card?.name || "The card")} goes back to your collection as a raw card. The ${slab.grade} ${esc(gradeWord(slab.grade, slab.blackLabel))} grade and the cert are gone, and the fee isn't refunded. Grading it again costs a new fee.`,
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
        body: `${esc(card?.name || "The card")}, graded ${slab.grade} ${esc(gradeWord(slab.grade, slab.blackLabel))}, leaves your collection and the coins arrive right away.`,
        confirm: `Sell ${coinTag(slab.value)}`,
        cancel: "Keep it",
      });
      if (ok) sell();
    }
  });

  root.addEventListener("submit", (e) => {
    const form = e.target.closest?.("[data-gd-cert-form]");
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector("input[name=cert]");
    const cert = certOf(input?.value);
    if (!cert) {
      input?.setCustomValidity("Type a cert number, like RIP-0001234 or 1234.");
      input?.reportValidity();
      return;
    }
    input.setCustomValidity("");
    navigate(`/cert/${cert}`);
  });

  root.addEventListener("input", (e) => {
    if (e.target.matches?.("[data-gd-cert-form] input")) e.target.setCustomValidity("");
    if (route.kind.startsWith("auto") && auto.input(e.target)) return;
    const search = e.target.closest?.("[data-gd-search]");
    if (!search) return;
    pickQuery = search.value;
    pickShown = PICK_PAGE;
    paintPickGrid();
  });

  // ---- Render and routing ----------------------------------------------------
  let pendingPreview = null;
  let staggerNext = false;
  let renderGen = 0;
  let picked = null; // a word just chosen on a redrawn page: its plate grows in
  function render() {
    const gen = ++renderGen;
    const job =
      route.kind === "auto-setup" || route.kind === "auto-run" ? auto.paint() : route.kind === "slab" ? paintSlab() : route.kind === "cert" ? paintCert() : route.kind === "guards" ? paintShop() : route.kind === "graded" ? paintGraded() : route.kind === "send" ? (route.cardId ? paintSend() : paintPicker()) : paintLanding();
    const mark = picked;
    picked = null;
    if (mark) job.then(() => { if (gen === renderGen) root.querySelector(mark)?.classList.add("is-pick"); }, () => {});
    job.catch((err) => {
      if (gen !== renderGen) return;
      console.error(err);
      root.innerHTML = `<div class="gd-page">${back("/grading", "Grading")}<p class="gd-empty">Couldn't draw this page. ${esc(err?.message || "")}</p></div>`;
    });
  }

  function show(path = "/grading") {
    const clean = String(path || "/grading").replace(/\/+$/, "") || "/grading";
    const m = clean.match(GRADING_ROUTE);
    const c = clean.match(CERT_ROUTE);
    const next = c
      ? { kind: "cert", slabId: 0, cardId: "", cert: c[1] || "" }
      : m?.[4]
      ? { kind: "auto-run", slabId: 0, runId: Number(m[4]), cardId: "" }
      : m?.[2] && m?.[3]
      ? { kind: "auto-setup", slabId: Number(m[2]), cardId: "" }
      : m?.[2]
      ? { kind: "slab", slabId: Number(m[2]), cardId: "" }
      : clean === "/grading/graded"
        ? { kind: "graded", slabId: 0, cardId: "" }
        : clean === "/grading/guards"
        ? { kind: "guards", slabId: 0, cardId: "" }
        : clean.startsWith("/grading/send")
        ? { kind: "send", slabId: 0, cardId: m?.[1] || "" }
        : { kind: "landing", slabId: 0, cardId: "" };
    const wasVisible = visible;
    visible = true;
    // The reveal keeps the screen even if the app repaints the same path.
    if (wasVisible && route.kind === "send" && next.kind === "send" && route.cardId === next.cardId && route.cardId && stage !== "form") return;
    if (route.kind.startsWith("auto") && (!wasVisible || !next.kind.startsWith("auto") || next.kind === "auto-setup")) auto.hide();
    if (next.kind === "auto-run") auto.show({ kind: "run", runId: next.runId });
    else if (next.kind === "auto-setup") auto.show({ kind: "setup", slabId: next.slabId });
    route = next;
    stage = "form";
    sendError = "";
    revealed = null;
    slabPick = undefined;
    slabBusy = false;
    slabError = "";
    pickTier = "";
    if (next.kind === "send" && next.cardId) {
      reverse = sendReverse ?? new URLSearchParams(location.search).get("reverse") === "1";
    } else if (next.kind === "send") {
      pickEntries = null;
      pickShown = PICK_PAGE;
    }
    sendReverse = null;
    staggerNext = true;
    if (next.kind === "send" && !next.cardId) attempt = null;
    syncFromSave(save());
    render();
    refresh();
  }

  function hide() {
    visible = false;
    auto.hide();
    refreshToken++;
    observer?.disconnect();
    observer = null;
    sheet?.open && sheet.close();
  }

  return { show, hide, render, path: "/grading" };
}
