/* The battles hall (/battles) and the builder (/battles/new).

   The hall is a quick-battle stage (one real product, 1 to 3 free bots, the
   entry in gold, one coral action) above the public tables: live now, open
   seats and recent results, polled while the page is on screen. The builder
   is a product shelf with a sticky lineup tray, then the rules. Every number
   and every pull comes from the server; this module only presents them. */
import { api } from "./api.js";
import { esc, coins, coinTag, icon, wrapperArt, setById, seatAvatar } from "./battle-kit.js";
import { battlesArtHTML } from "./casino-kit.js";
import { setIdentity } from "./catalog.js";
import { tintFrom } from "./fx.js";
import { gateLock, gateNoticeHTML, gateRefusal } from "./gate-notice.js";
import { BOT_PERSONAS } from "./battle-rules.js";

const POLL_MS = 5000;
const PAGE = 36;
const DEFAULT_SETTINGS = { players: 2, teams: false, mode: "standard", scoring: "total", fast: false, skipCommons: false, private: false };
const DEFAULT_LIMITS = { maxPacks: 72, maxRounds: 96 };
const STORE_BUILDER = "pp.battles.builder.v1";
const STORE_QUICK = "pp.battles.quick.v1";

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

function readStore(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function writeStore(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or storage full: module state still holds it */
  }
}

const cleanSettings = (raw = {}) => {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  s.players = [2, 3, 4].includes(Number(s.players)) ? Number(s.players) : 2;
  s.teams = Boolean(s.teams) && s.players === 4;
  if (!["standard", "crazy", "shared"].includes(s.mode)) s.mode = "standard";
  if (!["total", "last", "best"].includes(s.scoring)) s.scoring = "total";
  for (const key of ["fast", "skipCommons", "private"]) s[key] = Boolean(s[key]);
  return s;
};
const cleanLineup = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => ({ key: String(row?.key || ""), quantity: Math.max(0, Math.floor(Number(row?.quantity) || 0)) }))
    .filter((row) => row.key && row.quantity > 0);

// Builder state lives at module level, so leaving for a table and coming back
// (or a reload, through sessionStorage) keeps the lineup and the rules.
const saved = readStore(STORE_BUILDER);
const builder = {
  lineup: cleanLineup(saved?.lineup),
  settings: cleanSettings(saved?.settings),
  step: saved?.step === "rules" ? "rules" : "shelf",
};
let pendingPrefill = null;
const persistBuilder = () => writeStore(STORE_BUILDER, builder);

/** Prefill the builder for the next show("builder"): the table's "Rematch" or
    "Edit lineup". `lineup` rows need `key` and `quantity` (a battle's own
    lineup works as is). `step` is "rules" (default when there is a lineup)
    or "shelf". */
export function prefillBuilder({ lineup = [], settings = {}, step } = {}) {
  pendingPrefill = { lineup: cleanLineup(lineup), settings: cleanSettings(settings), step };
  builder.lineup = pendingPrefill.lineup;
  builder.settings = pendingPrefill.settings;
  builder.step = step === "shelf" || !builder.lineup.length ? "shelf" : "rules";
  persistBuilder();
}

// The catalog is the same for everyone and changes rarely: one fetch a visit.
let catalog = null;
let catalogPromise = null;
function loadCatalog(ctx) {
  if (catalog) return Promise.resolve(catalog);
  if (!catalogPromise) {
    catalogPromise = api("/api/battles/catalog")
      .then((data) => {
        ctx.clock?.sync?.(data?.serverNow);
        const products = Array.isArray(data?.products) ? data.products : [];
        const sets = [];
        const seen = new Set();
        for (const p of products) {
          if (seen.has(p.setId)) continue;
          seen.add(p.setId);
          sets.push({ id: p.setId, name: p.setName, pack: products.find((x) => x.setId === p.setId && x.productId === "boosterPack") || null });
        }
        catalog = { products, sets, byKey: new Map(products.map((p) => [p.key, p])), limits: { ...DEFAULT_LIMITS, ...(data?.limits || {}) } };
        return catalog;
      })
      .finally(() => {
        catalogPromise = null;
      });
  }
  return catalogPromise;
}

// ---- Words -----------------------------------------------------------------
const kindOf = (p) => (p?.productId === "boosterPack" ? "pack" : Number(p?.packs) > 0 ? "box" : "promo");
const playersLabel = (s) => (s?.teams ? "2v2" : Number(s?.players) === 2 ? "1v1" : `${Number(s?.players) || 2} players`);
function winLine(s = {}) {
  if (s.mode === "shared") return "everyone splits the cards";
  const low = s.mode === "crazy";
  if (s.scoring === "best") return low ? "lowest best card wins" : "best single card wins";
  if (s.scoring === "last") return low ? "lowest last round wins" : "best last round wins";
  return low ? "lowest total wins" : "highest total wins";
}
const rulesLine = (s) => `${playersLabel(s)}, ${winLine(s)}`;
const roundsWord = (n) => `${n} ${n === 1 ? "round" : "rounds"}`;
const productTitle = (p) => {
  if (!p) return "";
  if (kindOf(p) === "pack" || String(p.name || "").includes(p.setName || "\u0000")) return p.name;
  return `${p.setName} ${p.name}`;
};
const symbolOf = (setId) => {
  const set = setById(setId);
  return set ? setIdentity(set).symbol : "";
};

// ---- Art -------------------------------------------------------------------
const img = (src, cls = "", eager = false) =>
  src ? `<img class="${cls}" src="${esc(src)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false" />` : "";
const isWrapper = (src) => !src || /(^|\/)assets\/packs\//.test(src);

/** A product as it would stand on a shelf: a wrapper, a box photo, or (for a
    bundle with no photo of its own) its packs fanned. */
function productArt(p, eager = false) {
  const kind = kindOf(p);
  if (kind === "pack") return `<span class="hl-art is-pack">${img(p.image || wrapperArt(p.setId), "", eager)}</span>`;
  if (kind === "box" && isWrapper(p.image)) {
    const arts = (setById(p.setId)?.wrappers || []).map((w) => w.art).filter(Boolean);
    const three = [0, 1, 2].map((i) => arts[i % Math.max(arts.length, 1)] || p.image || wrapperArt(p.setId));
    return `<span class="hl-art is-fan">${three.map((src) => `<span>${img(src, "", eager)}</span>`).join("")}</span>`;
  }
  return `<span class="hl-art is-box">${img(p.image || wrapperArt(p.setId), "", eager)}</span>`;
}

/** Up to three wrappers or boxes, stacked, for a lineup. */
function stackArt(lineup = [], cls = "hl-stack") {
  const items = [];
  for (const row of lineup) {
    for (let i = 0; i < Math.min(row.quantity || 1, 3) && items.length < 3; i++) items.push(row);
    if (items.length >= 3) break;
  }
  if (!items.length) return `<span class="${cls} is-empty" aria-hidden="true"></span>`;
  return `<span class="${cls} n${items.length}" aria-hidden="true">${items
    .map((p) => `<span class="${kindOf(p) === "pack" || isWrapper(p.image) ? "is-pack" : "is-box"}">${img(p.image || wrapperArt(p.setId))}</span>`)
    .join("")}</span>`;
}

export function createHall(ctx) {
  const root = ctx.root;
  const motion = () => (typeof ctx.motion === "function" ? ctx.motion() : true);
  let visible = false;
  let mode = "";
  let gen = 0;
  let pollTimer = 0;
  let listing = null; // null while the first fetch is in flight
  let listKey = "";
  let listError = "";
  let ambient = null;
  const anims = new Set();
  const rafs = new Set();

  // Quick battle: one product and 1 to 3 bots.
  const savedQuick = readStore(STORE_QUICK);
  const quick = { key: savedQuick?.key || "", bots: [1, 2, 3].includes(savedQuick?.bots) ? savedQuick.bots : 1, busy: false, msg: "", requestId: "", sig: "" };
  let pickerOpen = false;
  let pickerSet = "";

  // Builder UI state (the lineup itself is module level).
  const shelf = { q: "", set: "all", type: "all", limit: PAGE };
  const create = { busy: false, msg: "", requestId: "", sig: "" };
  let trayNote = "";
  let shownEntry = 0;

  const user = () => (typeof ctx.user === "function" ? ctx.user() : null);
  // Level gate (js/levels.js GATES): shut for a level-too-low player who is not seated at any table listed.
  const lock = () => (Array.isArray(listing) ? gateLock("battles", user(), listing.some((b) => isMine(b))) : null);
  // The notice follows the table list: it can only be right once we know whether the player sits at any table.
  let gateSig = "";
  const sigOf = (lk) => (lk ? `${lk.key}:${lk.level}` : "");
  function paintGate() {
    const head = root.querySelector(".hl-hall > .hl-head");
    const lk = lock();
    if (!head || sigOf(lk) === gateSig) return;
    gateSig = sigOf(lk);
    head.parentElement.querySelector(":scope > .gate-lock")?.remove();
    head.insertAdjacentHTML("afterend", gateNoticeHTML(lk));
  }
  const signedIn = () => Boolean(user()?.id);
  const balance = () => Number(ctx.coins?.() ?? 0);
  const track = (anim) => {
    if (!anim) return anim;
    anims.add(anim);
    anim.finished?.then(() => anims.delete(anim), () => anims.delete(anim));
    return anim;
  };
  const stopMotion = () => {
    for (const a of anims) a.cancel();
    anims.clear();
    for (const id of rafs) cancelAnimationFrame(id);
    rafs.clear();
    document.querySelectorAll(".hl-fly").forEach((el) => el.remove());
  };
  const stopPoll = () => {
    clearTimeout(pollTimer);
    pollTimer = 0;
  };

  // ---- Show / hide ---------------------------------------------------------
  function show(next = "list") {
    const was = visible && mode;
    visible = true;
    mode = next === "builder" ? "builder" : "list";
    gen++;
    stopPoll();
    stopMotion();
    document.body.classList.toggle("hl-building", mode === "builder");
    document.body.classList.toggle("hl-in-hall", mode === "list");
    if (mode === "builder") {
      if (pendingPrefill) {
        shelf.q = "";
        shelf.set = "all";
        shelf.type = "all";
        shelf.limit = PAGE;
        pendingPrefill = null;
      }
      renderBuilder();
    } else {
      renderHall(was !== "list");
      fetchList();
    }
    if (was && was !== mode) window.scrollTo({ top: 0 });
    const token = gen;
    loadCatalog(ctx)
      .then(() => {
        if (token !== gen || !visible) return;
        if (mode === "builder") {
          builder.lineup = builder.lineup.filter((row) => catalog.byKey.has(row.key));
          renderBuilder();
        } else settleQuickProduct();
      })
      .catch((err) => {
        if (token !== gen || !visible) return;
        if (mode === "builder") renderBuilder(err);
        else {
          quick.msg = "The shop shelf didn't load. Pull to refresh or try again in a moment.";
          paintQuickMsg();
        }
      });
  }

  function hide() {
    visible = false;
    mode = "";
    gen++;
    stopPoll();
    stopMotion();
    document.body.classList.remove("hl-building", "hl-in-hall");
    // The quick-battle pack lit the page; hand the room back as it was.
    if (ambient !== null) {
      if (ambient) document.body.style.setProperty("--ambient", ambient);
      else document.body.style.removeProperty("--ambient");
      ambient = null;
    }
  }

  // ---- The hall --------------------------------------------------------------
  function quickProduct() {
    if (catalog) {
      const chosen = catalog.byKey.get(quick.key);
      if (chosen) return chosen;
      const featured = ctx.featuredSetId?.() || ctx.activeSetId?.();
      return (featured && catalog.byKey.get(`${featured}:boosterPack`)) || catalog.products.find((p) => kindOf(p) === "pack") || catalog.products[0] || null;
    }
    // Before the catalog lands, stand the wrapper up from local set data so
    // the stage has its entrance straight away; the price follows.
    const setId = quick.key.split(":")[0] || ctx.featuredSetId?.() || ctx.activeSetId?.() || "me55";
    const set = setById(setId);
    if (!set || (quick.key && !quick.key.endsWith(":boosterPack"))) return null;
    return { key: `${set.id}:boosterPack`, setId: set.id, setName: set.name, productId: "boosterPack", name: `${set.name} booster pack`, image: wrapperArt(set.id), packs: 1, rounds: 1, price: null };
  }

  function renderHall(entrance) {
    const p = quickProduct();
    gateSig = sigOf(lock());
    root.innerHTML = `<div class="hl-hall">
      <header class="hl-head">
        <h1 class="page-title">Pack battles</h1>
      </header>
      ${gateNoticeHTML(lock())}
      <section class="hl-quick bleed" aria-labelledby="hl-quick-name">
        <div class="hl-quick-inner">
          <div class="hl-stage${entrance && motion() ? " is-entering" : ""}">
            <span class="hl-kicker">Quick battle</span>
            <button type="button" class="hl-change" data-hall="picker" aria-expanded="${pickerOpen}">Change</button>
            <button type="button" class="hl-arrow is-prev" data-hall="prev" aria-label="Previous pack">${icon("back")}</button>
            <div class="hl-pack" data-key="${esc(p?.key || "")}">${stagePack(p)}</div>
            <button type="button" class="hl-arrow is-next" data-hall="next" aria-label="Next pack">${icon("back")}</button>
            <span class="hl-you" aria-hidden="true">${youFace()}</span>
            <span class="hl-bots" aria-label="${quick.bots} ${quick.bots === 1 ? "bot" : "bots"}">${botFaces()}</span>
          </div>
          <div class="hl-quick-body">
            <div class="hl-quick-copy">${quickCopy(p)}</div>
            <div class="hl-quick-row">
              <div class="hl-field">
                <span id="hl-opp-label">Free bots</span>
                <div class="hl-seg" role="radiogroup" aria-labelledby="hl-opp-label">
                  ${[1, 2, 3].map((n) => `<button type="button" role="radio" aria-checked="${quick.bots === n}" class="${quick.bots === n ? "on" : ""}" data-hall="bots" data-n="${n}">${n}</button>`).join("")}
                </div>
              </div>
              <div class="hl-entry"><span>Your entry</span><b class="hl-entry-fig">${p?.price != null ? coinTag(p.price) : '<span class="hl-skel-line"></span>'}</b></div>
            </div>
            <div class="hl-quick-actions">
              <button type="button" class="solid" data-hall="quick" ${quick.busy ? "disabled" : ""}>${quickLabel()}</button>
              <a class="ghost hl-build" href="/battles/new" data-hall-link>Build a battle</a>
            </div>
            <p class="hl-msg" role="alert" ${quick.msg ? "" : "hidden"}>${quick.msg}</p>
          </div>
        </div>
        <div class="hl-picker" ${pickerOpen ? "" : "hidden"}>${pickerOpen ? pickerHtml() : ""}</div>
      </section>
      <div class="hl-tables" aria-live="polite">${tablesHtml()}</div>
      <details class="hl-how">
        <summary>How battles work</summary>
        <ul>
          <li>Everyone opens the same lineup, pack by pack, at the same time.</li>
          <li>Every card counts its market value toward your score.</li>
          <li>Standard: the highest score takes every card. Crazy: the lowest does. Shared: everyone splits them by value.</li>
          <li>Bots are free to call. You pay only your own entry, and a bot's winnings go back in the box.</li>
        </ul>
      </details>
    </div>`;
    listKey = root.querySelector(".hl-tables")?.innerHTML === undefined ? "" : tablesHtml();
    hookStagePack(entrance);
  }

  function stagePack(p) {
    if (!p) return `<span class="hl-art is-pack is-ghost"></span>`;
    // A booster stands on the stage as the battles mark: two of the set's
    // wrappers clashing (casino-kit.js battlesArtHTML, the hub tile's art),
    // with the light sweep inside the front one. Boxes and bundles stand as
    // themselves.
    if (kindOf(p) === "pack") {
      return `<div class="hl-pack-art">${battlesArtHTML({ setId: p.setId, art: isWrapper(p.image) ? p.image || "" : "", size: 0, glint: true, eager: true })}</div>`;
    }
    return `<div class="hl-pack-art">${productArt(p, true)}<span class="hl-glint" aria-hidden="true"></span></div>`;
  }
  function quickCopy(p) {
    if (!p) return `<h2 id="hl-quick-name" class="hl-quick-name"><span class="hl-skel-line wide"></span></h2><p class="hl-quick-meta"><span class="hl-skel-line"></span></p>`;
    const kind = kindOf(p);
    const what = kind === "pack" ? "One pack each" : `${roundsWord(Number(p.rounds) || 1)} each`;
    return `<h2 id="hl-quick-name" class="hl-quick-name">${esc(productTitle(p))}</h2>
      <p class="hl-quick-meta">${symbolOf(p.setId) ? img(symbolOf(p.setId), "hl-sym") : ""}<span>${esc(kind === "pack" ? p.setName : what)}</span>${kind === "pack" ? `<span>${what}</span>` : ""}</p>`;
  }
  function youFace() {
    const u = user();
    return u ? seatAvatar({ seat: 0, userId: u.id, name: u.name, color: u.color, avatar: u.avatar, avatarStyle: u.avatarStyle, bot: false }, "bt-avatar hl-duel") : seatAvatar(null, "bt-avatar hl-duel");
  }
  const botFaces = () =>
    BOT_PERSONAS.slice(0, quick.bots).map((p, i) => seatAvatar({ seat: i + 1, bot: true, handle: `bot:${p.id}`, name: p.name, color: p.color }, "bt-avatar hl-duel")).join("");
  const quickLabel = () => (quick.busy ? "Dealing you in" : quick.bots === 1 ? "Battle a bot" : `Battle ${quick.bots} bots`);

  /** Point the stage's glint at the wrapper's outline and let it light the page. */
  function hookStagePack(entrance) {
    const art = root.querySelector(".hl-pack-art");
    if (!art) return;
    const first = art.querySelector("img");
    const glint = art.querySelector(".hl-glint");
    const pack = Boolean(glint && art.querySelector(".is-pack"));
    // Take the light once the art is in, and only then remember the page's
    // own light (a tint the site applied while the art loaded is kept).
    const tint = () => {
      if (!visible || !first.isConnected) return;
      if (ambient === null) ambient = document.body.style.getPropertyValue("--ambient");
      if (pack) tintFrom(first, glint);
      else tintFrom(first);
    };
    if (first) {
      if (first.complete && first.naturalWidth) tint();
      else first.addEventListener("load", tint, { once: true });
    }
    if (!entrance || !motion()) root.querySelector(".hl-stage")?.classList.remove("is-entering");
  }

  /** Swap the stage product, sliding the old one out and the new one in. */
  function swapQuick(key, dir = 1) {
    const p = catalog?.byKey.get(key);
    if (!p) return;
    quick.key = key;
    quick.msg = "";
    writeStore(STORE_QUICK, { key: quick.key, bots: quick.bots });
    const holder = root.querySelector(".hl-pack");
    const stage = root.querySelector(".hl-stage");
    stage?.classList.remove("is-entering");
    const place = () => {
      if (!holder?.isConnected) return;
      holder.dataset.key = key;
      holder.innerHTML = stagePack(p);
      hookStagePack(false);
      if (motion()) {
        track(holder.animate(
          [
            { transform: `translateX(${dir * 60}px) rotate(${dir * 6}deg) scale(0.92)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 520, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" },
        ));
        holder.querySelector(".hl-glint")?.classList.add("is-sweeping");
      }
    };
    if (holder && motion()) {
      const out = track(holder.animate(
        [{ transform: "none", opacity: 1 }, { transform: `translateX(${dir * -70}px) rotate(${dir * -8}deg) scale(0.9)`, opacity: 0 }],
        { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
      ));
      out.finished.then(() => { out.cancel(); place(); }, () => {});
    } else place();
    paintQuickCopy();
    paintPicker();
  }

  function settleQuickProduct() {
    const p = quickProduct();
    if (!p) return;
    const holder = root.querySelector(".hl-pack");
    if (holder && holder.dataset.key !== p.key) {
      holder.dataset.key = p.key;
      holder.innerHTML = stagePack(p);
      hookStagePack(false);
    }
    quick.key = p.key;
    paintQuickCopy();
    if (pickerOpen) paintPicker();
  }

  function paintQuickCopy() {
    const p = quickProduct();
    const copy = root.querySelector(".hl-quick-copy");
    if (copy) copy.innerHTML = quickCopy(p);
    const fig = root.querySelector(".hl-entry-fig");
    if (fig) fig.innerHTML = p?.price != null ? coinTag(p.price) : '<span class="hl-skel-line"></span>';
    const btn = root.querySelector('[data-hall="quick"]');
    if (btn) {
      btn.textContent = quickLabel();
      btn.disabled = quick.busy;
    }
    root.querySelectorAll('[data-hall="bots"]').forEach((b) => {
      const on = Number(b.dataset.n) === quick.bots;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    const bots = root.querySelector(".hl-bots");
    if (bots && bots.children.length !== quick.bots) {
      const before = bots.children.length;
      bots.innerHTML = botFaces();
      bots.setAttribute("aria-label", `${quick.bots} ${quick.bots === 1 ? "bot" : "bots"}`);
      if (motion()) {
        [...bots.children].slice(before).forEach((el, i) =>
          track(el.animate([{ transform: "translateY(10px) scale(0.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, delay: i * 60, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "backwards" })));
      }
    }
    paintQuickMsg();
  }
  function paintQuickMsg() {
    const msg = root.querySelector(".hl-hall .hl-msg");
    if (!msg) return;
    msg.hidden = !quick.msg;
    msg.innerHTML = quick.msg;
  }

  function stepQuick(dir) {
    if (!catalog) return;
    const packs = catalog.products.filter((p) => kindOf(p) === "pack");
    if (!packs.length) return;
    const current = quickProduct();
    let index = packs.findIndex((p) => p.key === current?.key);
    if (index < 0) index = Math.max(0, packs.findIndex((p) => p.setId === current?.setId));
    const next = packs[(index + dir + packs.length) % packs.length];
    swapQuick(next.key, dir);
    ctx.buzz?.(6);
  }

  function pickerHtml() {
    if (!catalog) return `<p class="hl-picker-empty">Loading the shelf.</p>`;
    const current = quickProduct();
    const setId = pickerSet || current?.setId || catalog.sets[0]?.id;
    const items = catalog.products.filter((p) => p.setId === setId);
    return `<div class="hl-words hl-picker-sets" role="tablist" aria-label="Sets">
        ${catalog.sets.map((s) => `<button type="button" role="tab" class="hl-word${s.id === setId ? " on" : ""}" aria-selected="${s.id === setId}" data-hall="pick-set" data-set="${esc(s.id)}">${symbolOf(s.id) ? img(symbolOf(s.id), "hl-sym") : ""}${esc(s.name)}</button>`).join("")}
      </div>
      <div class="hl-picker-shelf" role="list">
        ${items.map((p) => `<button type="button" role="listitem" class="hl-mini${p.key === current?.key ? " on" : ""}" data-hall="pick" data-key="${esc(p.key)}" aria-pressed="${p.key === current?.key}">
          <span class="hl-mini-art">${productArt(p)}</span>
          <span class="hl-mini-name">${esc(kindOf(p) === "pack" ? "Booster pack" : p.name)}</span>
          <span class="hl-mini-foot">${coinTag(p.price)}<small>${roundsWord(Number(p.rounds) || 1)}</small></span>
        </button>`).join("")}
      </div>`;
  }
  function paintPicker(scrollSet = false) {
    const box = root.querySelector(".hl-picker");
    const btn = root.querySelector('[data-hall="picker"]');
    if (btn) btn.setAttribute("aria-expanded", String(pickerOpen));
    if (!box) return;
    box.hidden = !pickerOpen;
    if (!pickerOpen) return;
    const keep = box.querySelector(".hl-picker-sets")?.scrollLeft;
    box.innerHTML = pickerHtml();
    const sets = box.querySelector(".hl-picker-sets");
    if (sets && keep != null && !scrollSet) sets.scrollLeft = keep;
    if (scrollSet) sets?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  async function startQuick() {
    const p = quickProduct();
    if (!p || p.price == null || quick.busy) return;
    if (!signedIn()) {
      ctx.signIn?.();
      return;
    }
    if (lock()) {
      quick.msg = esc(gateRefusal(lock()));
      paintQuickMsg();
      return;
    }
    if (balance() + 1e-9 < Number(p.price)) {
      quick.msg = `You need ${coinTag(Number(p.price) - balance())} more for this entry. Try a cheaper pack, or come back after your daily claim.`;
      paintQuickMsg();
      return;
    }
    const settings = { ...DEFAULT_SETTINGS, players: quick.bots + 1 };
    const sig = JSON.stringify([p.key, settings]);
    if (sig !== quick.sig || !quick.requestId) {
      quick.sig = sig;
      quick.requestId = uuid();
    }
    quick.busy = true;
    quick.msg = "";
    paintQuickCopy();
    const token = gen;
    try {
      const data = await api("/api/battles", {
        method: "POST",
        body: JSON.stringify({ requestId: quick.requestId, lineup: [{ key: p.key, quantity: 1 }], settings, quick: true }),
      });
      ctx.clock?.sync?.(data?.serverNow);
      if (data?.save) ctx.applySave?.(data.save);
      quick.requestId = "";
      quick.busy = false;
      if (!data?.battle?.id) throw new Error("The table didn't open. Try again.");
      ctx.buzz?.(14);
      if (token === gen && visible) ctx.navigate(`/battles/${data.battle.id}`);
    } catch (err) {
      quick.busy = false;
      if (token !== gen || !visible) return;
      if (err?.status === 401) {
        ctx.signIn?.();
      } else {
        quick.msg = esc(friendlyError(err));
      }
      paintQuickCopy();
    }
  }

  const friendlyError = (err) => {
    const m = String(err?.message || "");
    if (/not enough coins/i.test(m)) return "Not enough coins for this entry. Try a cheaper pack.";
    if (/failed to fetch|network|load failed/i.test(m)) return "No connection. Check your signal and try again.";
    return m || "Something went wrong. Try again.";
  };

  // ---- Tables ----------------------------------------------------------------
  // One poll chain at a time: a fetch in flight owns the next timer.
  let listInFlight = 0;
  async function fetchList() {
    const token = gen;
    stopPoll();
    if (listInFlight === token) return;
    listInFlight = token;
    try {
      const data = await api("/api/battles");
      if (token !== gen || !visible || mode !== "list") return;
      ctx.clock?.sync?.(data?.serverNow);
      listing = Array.isArray(data?.battles) ? data.battles : [];
      listError = "";
    } catch (err) {
      if (token !== gen || !visible || mode !== "list") return;
      listError = listing ? "" : "The tables didn't load. They'll try again in a moment.";
      if (!listing) listing = null;
    }
    finally {
      if (listInFlight === token) listInFlight = 0;
    }
    paintTables();
    if (token === gen && visible && mode === "list") paintGate();
    if (token === gen && visible && mode === "list") {
      stopPoll();
      pollTimer = setTimeout(tick, POLL_MS);
    }
  }
  function tick() {
    pollTimer = 0;
    if (!visible || mode !== "list") return;
    if (document.hidden) return; // visibilitychange restarts it
    fetchList();
  }
  const onVisibility = () => {
    if (!document.hidden && visible && mode === "list" && !pollTimer) fetchList();
  };
  document.addEventListener("visibilitychange", onVisibility);

  function paintTables() {
    const box = root.querySelector(".hl-tables");
    if (!box) return;
    const html = tablesHtml();
    if (html === listKey) return;
    listKey = html;
    box.innerHTML = html;
  }

  function tablesHtml() {
    if (listing === null) {
      if (listError) return `<div class="hl-quiet"><p>${esc(listError)}</p><button type="button" class="ghost sm" data-hall="retry">Try again</button></div>`;
      return `<section class="hl-sec" aria-busy="true"><div class="hl-sec-head"><h2>Tables</h2></div><div class="hl-rows">${[0, 1, 2].map(() => skeletonRow()).join("")}</div></section>`;
    }
    const live = listing.filter((b) => b.status === "running");
    const open = listing.filter((b) => b.status === "lobby");
    const done = listing.filter((b) => b.status === "finished").slice(0, 8);
    if (!live.length && !open.length && !done.length) {
      return `<div class="hl-quiet is-first">
        <span class="hl-quiet-seats" aria-hidden="true">${seatAvatar(null, "bt-avatar")}${seatAvatar(null, "bt-avatar")}</span>
        <p><b>No tables are open.</b> Battle a bot above, or build a battle and send a friend the link.</p>
      </div>`;
    }
    return `<section class="hl-sec is-live" aria-labelledby="hl-live-h">
        <div class="hl-sec-head"><h2 id="hl-live-h"><span class="hl-dot${live.length ? "" : " is-off"}" aria-hidden="true"></span>Live now</h2><span class="hl-sec-count">${live.length ? `${live.length} ${live.length === 1 ? "table" : "tables"}` : ""}</span></div>
        ${live.length ? `<div class="hl-rows">${live.map(liveRow).join("")}</div>` : `<p class="hl-empty">No one is opening right now. Start one with the stage above.</p>`}
      </section>
      <section class="hl-sec is-open" aria-labelledby="hl-open-h">
        <div class="hl-sec-head"><h2 id="hl-open-h">Open tables</h2><span class="hl-sec-count">${open.length ? `${open.length} waiting` : ""}</span></div>
        ${open.length ? `<div class="hl-rows">${open.map(openRow).join("")}</div>` : `<p class="hl-empty">No seats waiting. <a href="/battles/new" data-hall-link>Build a table</a> and invite a friend.</p>`}
      </section>
      <section class="hl-sec is-done" aria-labelledby="hl-done-h">
        <div class="hl-sec-head"><h2 id="hl-done-h">Recent results</h2></div>
        ${done.length ? `<div class="hl-rows">${done.map(doneRow).join("")}</div>` : `<p class="hl-empty">Results are listed here once a battle finishes.</p>`}
      </section>`;
  }

  const skeletonRow = () => `<div class="hl-row is-skel" aria-hidden="true"><span class="hl-stack is-empty"></span><span class="hl-row-main"><span class="hl-skel-line wide"></span><span class="hl-skel-line"></span></span><span class="hl-row-side"><span class="hl-skel-line short"></span></span></div>`;

  function rowTitle(b) {
    const lineup = b.lineup || [];
    if (!lineup.length) return "A pack battle";
    const first = lineup[0];
    if (lineup.length === 1) return `${first.quantity > 1 ? `${first.quantity} × ` : ""}${productTitle(first)}`;
    return `${productTitle(first)} and ${lineup.length - 1} more`;
  }
  const seatOf = (b, i) => (b.seats || []).find((s) => s.seat === i) || null;
  const isMine = (b) => {
    const id = user()?.id;
    return Boolean(id) && (b.seats || []).some((s) => !s.bot && String(s.userId) === String(id));
  };
  function seatsHtml(b, { open = false } = {}) {
    const players = Number(b.settings?.players) || (b.seats || []).length || 2;
    const faces = [];
    for (let i = 0; i < players; i++) {
      const seat = seatOf(b, i);
      if (!seat && !open) continue;
      faces.push(seatAvatar(seat, "bt-avatar hl-face"));
      if (b.settings?.teams && i === 1) faces.push('<span class="hl-vs">vs</span>');
    }
    return `<span class="hl-faces">${faces.join("")}</span>`;
  }
  function rowShell(b, cls, side, extra = "") {
    const href = `/battles/${encodeURIComponent(b.id)}`;
    const count = Number(b.roundCount) || (b.plan || []).length || (b.lineup || []).reduce((n, p) => n + (Number(p.rounds) || 1) * (Number(p.quantity) || 1), 0);
    return `<a class="hl-row ${cls}" href="${href}" data-hall-link>
      ${stackArt(b.lineup || [])}
      <span class="hl-row-main">
        <b class="hl-row-title">${esc(rowTitle(b))}</b>
        <span class="hl-row-rules">${esc(rulesLine(b.settings))}${b.settings?.fast ? ` <span class="hl-flag">${icon("bolt")}Fast</span>` : ""}<span class="hl-row-rounds">${roundsWord(count)}</span></span>
        ${extra}
      </span>
      <span class="hl-row-side">${side}</span>
    </a>`;
  }
  function liveRound(b) {
    const now = ctx.clock?.now?.() ?? Date.now();
    const total = Number(b.roundCount) || (b.plan || []).length || 1;
    if (Number.isFinite(b.startsAt) && now < b.startsAt) return { label: "Starting", frac: 0 };
    let r = Number.isFinite(b.revealedRounds) ? b.revealedRounds : 0;
    if (Number.isFinite(b.startsAt) && Number(b.roundMs) > 0) r = Math.max(r, Math.floor((now - b.startsAt) / b.roundMs) + 1);
    r = Math.min(Math.max(r, 1), total);
    return { label: `Round ${r} of ${total}`, frac: r / total };
  }
  function liveRow(b) {
    const { label, frac } = liveRound(b);
    return rowShell(
      b,
      "is-live",
      `${coinTag(b.entryCost)}<small class="hl-live-tag">${esc(label)}</small>`,
      `${seatsHtml(b)}<span class="hl-progress" aria-hidden="true"><i style="transform:scaleX(${frac.toFixed(3)})"></i></span>`,
    );
  }
  function openRow(b) {
    const players = Number(b.settings?.players) || 2;
    const seated = (b.seats || []).length;
    const mine = isMine(b);
    return rowShell(
      b,
      "is-open",
      `${coinTag(b.entryCost)}<span class="hl-take${mine ? " is-mine" : ""}">${mine ? "Your table" : "Take a seat"}</span>`,
      `${seatsHtml(b, { open: true })}<span class="hl-seated">${seated} of ${players} seated</span>`,
    );
  }
  function doneRow(b) {
    const winners = b.winners || b.result?.winners || [];
    const pot = (b.result?.allocations || []).reduce((n, a) => n + Number(a.value || 0), 0);
    const shared = b.settings?.mode === "shared";
    let who;
    if (shared) who = `${seatsHtml(b)}<span class="hl-winner-copy">Split between everyone</span>`;
    else if (!winners.length) who = `${seatsHtml(b)}<span class="hl-winner-copy">See who won</span>`;
    else {
      const seats = winners.map((i) => seatOf(b, i)).filter(Boolean);
      const names = seats.map((s) => s.name || "A trainer");
      const line = b.settings?.teams ? `${names.join(" and ")} took it` : winners.length > 1 ? `${names.join(" and ")} tied` : `${names[0]} took it`;
      who = `<span class="hl-faces is-winners">${seats.map((s) => seatAvatar(s, "bt-avatar hl-face")).join("")}<span class="hl-crown" aria-hidden="true">${icon("crown")}</span></span><span class="hl-winner-copy">${esc(line)}</span>`;
    }
    return rowShell(b, "is-done", `${pot > 0 ? coinTag(pot) : coinTag(b.entryCost)}<small>${pot > 0 ? "in cards" : "entry"}</small>`, `<span class="hl-winner">${who}</span>`);
  }

  // ---- The builder -------------------------------------------------------------
  const qtyOf = (key) => builder.lineup.find((r) => r.key === key)?.quantity || 0;
  function totals() {
    let cents = 0;
    let packs = 0;
    let rounds = 0;
    let items = 0;
    for (const row of builder.lineup) {
      const p = catalog?.byKey.get(row.key);
      if (!p) continue;
      cents += Math.round(Number(p.price) * 100) * row.quantity;
      packs += (Number(p.packs) || 0) * row.quantity;
      rounds += (Number(p.rounds) || 1) * row.quantity;
      items += row.quantity;
    }
    return { entry: cents / 100, packs, rounds, items };
  }
  const lineupProducts = () => builder.lineup.map((row) => ({ ...(catalog?.byKey.get(row.key) || { key: row.key }), quantity: row.quantity })).filter((p) => p.name);

  function filtered() {
    if (!catalog) return [];
    const words = shelf.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return catalog.products.filter((p) => {
      if (shelf.set !== "all" && p.setId !== shelf.set) return false;
      if (shelf.type !== "all" && kindOf(p) !== shelf.type) return false;
      if (!words.length) return true;
      const hay = `${p.name} ${p.setName}`.toLocaleLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function renderBuilder(loadError) {
    const step = builder.step === "rules" && builder.lineup.length ? "rules" : "shelf";
    builder.step = step;
    const count = builder.lineup.reduce((n, r) => n + r.quantity, 0);
    root.innerHTML = `<div class="hl-builder" data-step="${step}">
      <a class="hl-back" href="/battles" data-hall-link>${icon("back")}Battles</a>
      <header class="hl-head">
        <h1 class="page-title">Build a battle</h1>
      </header>
      ${gateNoticeHTML(lock())}
      <nav class="hl-words hl-steps" aria-label="Builder steps">
        <button type="button" class="hl-word${step === "shelf" ? " on" : ""}" data-hall="step" data-step="shelf" aria-current="${step === "shelf" ? "step" : "false"}">Lineup${count ? ` <span class="hl-step-n">${count}</span>` : ""}</button>
        <button type="button" class="hl-word${step === "rules" ? " on" : ""}" data-hall="step" data-step="rules" aria-current="${step === "rules" ? "step" : "false"}" ${builder.lineup.length ? "" : "disabled"}>Rules</button>
      </nav>
      ${loadError ? `<div class="hl-quiet"><p>The shelf didn't load. ${esc(friendlyError(loadError))}</p><button type="button" class="ghost sm" data-hall="reload">Try again</button></div>` : step === "shelf" ? shelfHtml() : rulesHtml()}
      <div class="hl-tray" role="region" aria-label="Your lineup">${trayHtml()}</div>
    </div>`;
    shownEntry = totals().entry;
    if (step === "shelf") root.querySelector(".hl-sets .on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function shelfHtml() {
    if (!catalog) {
      return `<div class="hl-shelf-tools"><div class="hl-search is-skel"></div></div><div class="hl-grid" aria-busy="true">${Array.from({ length: 8 }, () => `<div class="hl-prod is-skel"><span class="hl-prod-hit"><span class="hl-prod-art"></span><span class="hl-skel-line wide"></span><span class="hl-skel-line short"></span></span></div>`).join("")}</div>`;
    }
    return `<div class="hl-shelf-tools">
        <label class="hl-search">${icon("search")}<input class="search" type="search" aria-label="Search products" placeholder="Search packs, boxes and sets" value="${esc(shelf.q)}" data-hall="search" autocomplete="off" enterkeyhint="search" /></label>
        <div class="hl-sets" role="tablist" aria-label="Filter by set">
          <button type="button" role="tab" class="hl-set${shelf.set === "all" ? " on" : ""}" aria-selected="${shelf.set === "all"}" data-hall="set" data-set="all"><span class="hl-set-sym is-all">${icon("search")}<b>All sets</b></span><small>${catalog.products.length} products</small></button>
          ${catalog.sets.map((s) => `<button type="button" role="tab" class="hl-set${shelf.set === s.id ? " on" : ""}" aria-selected="${shelf.set === s.id}" data-hall="set" data-set="${esc(s.id)}"><span class="hl-set-sym">${symbolOf(s.id) ? img(symbolOf(s.id)) : ""}<b>${esc(s.name)}</b></span><small>${s.pack ? `Pack ${coinTag(s.pack.price)}` : `${catalog.products.filter((p) => p.setId === s.id).length} products`}</small></button>`).join("")}
        </div>
        <div class="hl-types">
          <div class="hl-words" role="tablist" aria-label="Filter by type">
            ${[["all", "All"], ["pack", "Packs"], ["box", "Boxes"], ["promo", "Promos"]].map(([v, t]) => `<button type="button" role="tab" class="hl-word${shelf.type === v ? " on" : ""}" aria-selected="${shelf.type === v}" data-hall="type" data-type="${v}">${t}</button>`).join("")}
          </div>
          <span class="hl-count"></span>
        </div>
      </div>
      <div class="hl-grid">${gridHtml()}</div>`;
  }

  function gridHtml() {
    const list = filtered();
    queueMicrotask(() => {
      const n = root.querySelector(".hl-count");
      if (n) n.textContent = `${list.length} ${list.length === 1 ? "product" : "products"}`;
    });
    if (!list.length) return `<p class="hl-empty hl-grid-empty">Nothing on the shelf matches. Try another set or a shorter search.</p>`;
    const shown = list.slice(0, shelf.limit);
    return `${shown.map(tileHtml).join("")}${list.length > shown.length ? `<div class="hl-more"><button type="button" class="ghost" data-hall="more">Show ${Math.min(PAGE, list.length - shown.length)} more</button></div>` : ""}`;
  }

  function tileHtml(p) {
    const q = qtyOf(p.key);
    const kind = kindOf(p);
    const detail = kind === "pack" ? "One pack" : kind === "promo" ? "Promo cards" : `${p.packs} packs`;
    return `<div class="hl-prod${q ? " is-in" : ""} is-${kind}" data-key="${esc(p.key)}">
      <button type="button" class="hl-prod-hit" data-hall="add" data-key="${esc(p.key)}" aria-label="Add ${esc(productTitle(p))}, ${coins(p.price)} coins">
        <span class="hl-prod-art">${productArt(p)}</span>
        <span class="hl-prod-name">${esc(kind === "pack" ? "Booster pack" : p.name)}</span>
        <span class="hl-prod-set">${esc(p.setName)}</span>
        <span class="hl-prod-foot">${coinTag(p.price)}<small>${esc(detail)}</small></span>
      </button>
      <span class="hl-qty" ${q ? "" : "hidden"}>
        <button type="button" data-hall="dec" data-key="${esc(p.key)}" aria-label="${q === 1 ? "Remove" : "Remove one"} ${esc(productTitle(p))}">${icon(q === 1 ? "close" : "minus")}</button>
        <b aria-live="polite">${q}</b>
        <button type="button" data-hall="inc" data-key="${esc(p.key)}" aria-label="Add one more ${esc(productTitle(p))}">${icon("plus")}</button>
      </span>
    </div>`;
  }

  function trayHtml() {
    const t = totals();
    const rules = builder.step === "rules" && builder.lineup.length;
    const summary = builder.lineup.length
      ? `<span class="hl-tray-entry"><span data-tray="entry">${coinTag(t.entry)}</span> <small>entry</small></span>
         <span class="hl-tray-count"><b data-tray="items">${t.items} ${t.items === 1 ? "product" : "products"}</b><span data-tray="rounds">${roundsWord(t.rounds)}</span></span>`
      : `<span class="hl-tray-count"><b>Your lineup is empty</b><span>Tap a product to add it</span></span>`;
    const note = trayNote || (!signedIn() && rules ? "Sign in to take your seat." : "");
    return `<div class="hl-tray-inner${rules ? " is-rules" : ""}">
      <button type="button" class="hl-tray-stack" data-hall="step" data-step="shelf" aria-label="Edit lineup">${stackArt(lineupProducts(), "hl-stack")}</button>
      <div class="hl-tray-copy">${summary}</div>
      <div class="hl-tray-actions">
        ${rules
          ? `<button type="button" class="ghost" data-hall="create-quick" ${create.busy ? "disabled" : ""}>${icon("bot")}Battle bots now</button>
             <button type="button" class="solid" data-hall="create" ${create.busy ? "disabled" : ""}>${create.busy ? "Opening" : "Create table"}</button>`
          : `<button type="button" class="solid" data-hall="step" data-step="rules" ${builder.lineup.length ? "" : "disabled"}>Set the rules</button>`}
      </div>
      <p class="hl-tray-note" role="status" ${note || create.msg ? "" : "hidden"}>${create.msg || esc(note)}</p>
    </div>`;
  }

  function rulesHtml() {
    const s = builder.settings;
    const t = totals();
    const seg = (name, value, label, on) => `<button type="button" role="radio" aria-checked="${on}" class="${on ? "on" : ""}" data-hall="set-rule" data-rule="${name}" data-value="${value}">${label}</button>`;
    const modeTile = (value, title, copy) => `<button type="button" role="radio" aria-checked="${s.mode === value}" class="hl-mode${s.mode === value ? " on" : ""}" data-hall="set-rule" data-rule="mode" data-value="${value}"><b>${title}</b><small>${copy}</small></button>`;
    const scoreNote = s.scoring === "last" ? "Only the final round counts. Every round's cards are still won." : s.scoring === "best" ? "Your single best pull is your score." : "Every card's value adds up.";
    return `<div class="hl-rules-layout">
      <section class="hl-lineup" aria-labelledby="hl-lineup-h">
        <div class="hl-lineup-stage">${stackArt(lineupProducts(), "hl-stack is-big")}</div>
        <div class="hl-lineup-head"><h2 id="hl-lineup-h">Your lineup</h2><button type="button" class="link-btn" data-hall="step" data-step="shelf">Add more</button></div>
        <ul class="hl-lineup-list">${lineupProducts().map((p) => `<li data-key="${esc(p.key)}">
            <span class="hl-lineup-art">${productArt(p)}</span>
            <span class="hl-lineup-copy"><b>${esc(productTitle(p))}</b><small>${roundsWord((Number(p.rounds) || 1) * p.quantity)}</small>${coinTag(Number(p.price) * p.quantity)}</span>
            <span class="hl-qty is-inline">
              <button type="button" data-hall="dec" data-key="${esc(p.key)}" aria-label="${p.quantity === 1 ? "Remove" : "Remove one"} ${esc(productTitle(p))}">${icon(p.quantity === 1 ? "close" : "minus")}</button>
              <b>${p.quantity}</b>
              <button type="button" data-hall="inc" data-key="${esc(p.key)}" aria-label="Add one more ${esc(productTitle(p))}">${icon("plus")}</button>
            </span>
          </li>`).join("")}</ul>
        <p class="hl-lineup-total"><span>${roundsWord(t.rounds)}, ${t.packs} ${t.packs === 1 ? "pack" : "packs"}</span><span>Entry per player ${coinTag(t.entry)}</span></p>
      </section>
      <section class="hl-rules" aria-label="Rules">
        <fieldset class="hl-rule">
          <legend>Players</legend>
          <div class="hl-seg is-wide" role="radiogroup" aria-label="Players">
            ${seg("players", "2", "1v1", s.players === 2)}${seg("players", "3", "3 players", s.players === 3)}${seg("players", "4", "4 players", s.players === 4 && !s.teams)}${seg("players", "teams", "2v2", s.teams)}
          </div>
          <p class="hl-rule-note">Friends take seats from the link. Empty seats can go to bots, free.</p>
        </fieldset>
        <fieldset class="hl-rule">
          <legend>Who takes the cards</legend>
          <div class="hl-modes" role="radiogroup" aria-label="Who takes the cards">
            ${modeTile("standard", "Standard", "Highest score takes every card.")}
            ${modeTile("crazy", "Crazy", "Lowest score takes every card.")}
            ${modeTile("shared", "Shared", "Everyone splits the cards by value.")}
          </div>
        </fieldset>
        <fieldset class="hl-rule">
          <legend>Scoring</legend>
          <div class="hl-seg is-wide" role="radiogroup" aria-label="Scoring">
            ${seg("scoring", "total", "Total", s.scoring === "total")}${seg("scoring", "last", "Last round", s.scoring === "last")}${seg("scoring", "best", "Best card", s.scoring === "best")}
          </div>
          <p class="hl-rule-note">${scoreNote}</p>
        </fieldset>
        <fieldset class="hl-rule hl-switches">
          <legend>Reveal</legend>
          <label class="toggle-row"><span><b>Fast reveal</b><small>Rounds open in under three seconds.</small></span><input type="checkbox" data-hall="toggle" data-rule="fast" ${s.fast ? "checked" : ""} /><span class="switch" aria-hidden="true"></span></label>
          <label class="toggle-row"><span><b>Skip commons</b><small>Commons and energy stay out of the reveal. They still score.</small></span><input type="checkbox" data-hall="toggle" data-rule="skipCommons" ${s.skipCommons ? "checked" : ""} /><span class="switch" aria-hidden="true"></span></label>
        </fieldset>
        <fieldset class="hl-rule">
          <legend>Table</legend>
          <div class="hl-seg is-wide" role="radiogroup" aria-label="Table visibility">
            ${seg("private", "false", "Public", !s.private)}${seg("private", "true", "Unlisted", s.private)}
          </div>
          <p class="hl-rule-note">${s.private ? "Only people with the link can find it." : "Listed in the hall for anyone to join."}</p>
        </fieldset>
      </section>
    </div>`;
  }

  function paintTray(bump = false) {
    const tray = root.querySelector(".hl-tray");
    if (!tray) return;
    const from = shownEntry;
    tray.innerHTML = trayHtml();
    const t = totals();
    shownEntry = t.entry;
    const fig = tray.querySelector('[data-tray="entry"] .bt-coins');
    if (fig && motion() && Math.abs(t.entry - from) > 0.004) countUp(fig, from, t.entry);
    if (bump && motion()) {
      const stack = tray.querySelector(".hl-tray-stack .hl-stack > span:last-child");
      if (stack) track(stack.animate([{ transform: "translateY(-14px) scale(1.08)", opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", composite: "add" }));
      const n = tray.querySelector('[data-tray="items"]');
      if (n) track(n.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }));
    }
    const count = builder.lineup.reduce((n, r) => n + r.quantity, 0);
    const stepWord = root.querySelector('.hl-steps [data-step="shelf"]');
    if (stepWord) stepWord.innerHTML = `Lineup${count ? ` <span class="hl-step-n">${count}</span>` : ""}`;
    const rulesWord = root.querySelector('.hl-steps [data-step="rules"]');
    if (rulesWord) rulesWord.disabled = !builder.lineup.length;
  }

  function countUp(el, from, to) {
    // Only the number changes; the coin mark stays put.
    const number = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (!number) return;
    const start = performance.now();
    const dur = 460;
    const frame = (now) => {
      rafs.delete(id);
      const k = Math.max(0, Math.min(1, (now - start) / dur));
      const eased = 1 - Math.pow(1 - k, 3);
      if (!el.isConnected) return;
      number.nodeValue = coins(from + (to - from) * eased);
      if (k < 1) {
        id = requestAnimationFrame(frame);
        rafs.add(id);
      }
    };
    let id = requestAnimationFrame(frame);
    rafs.add(id);
  }

  function paintTile(key) {
    const tile = root.querySelector(`.hl-prod[data-key="${CSS.escape(key)}"]`);
    const p = catalog?.byKey.get(key);
    if (tile && p) {
      const next = document.createElement("div");
      next.innerHTML = tileHtml(p);
      tile.replaceWith(next.firstElementChild);
    }
  }

  function changeQty(key, delta, fromEl) {
    const p = catalog?.byKey.get(key);
    if (!p) return;
    const row = builder.lineup.find((r) => r.key === key);
    if (delta > 0) {
      const t = totals();
      const limits = catalog.limits;
      if (t.packs + (Number(p.packs) || 0) > limits.maxPacks || t.rounds + (Number(p.rounds) || 1) > limits.maxRounds) {
        trayNote = `A battle holds up to ${limits.maxPacks} packs and ${limits.maxRounds} rounds.`;
        create.msg = "";
        paintTray();
        ctx.buzz?.([10, 40, 10]);
        return;
      }
    }
    trayNote = "";
    create.msg = "";
    if (row) row.quantity += delta;
    else if (delta > 0) builder.lineup.push({ key, quantity: 1 });
    builder.lineup = builder.lineup.filter((r) => r.quantity > 0);
    persistBuilder();
    if (delta > 0) {
      ctx.buzz?.(8);
      if (fromEl) fly(fromEl);
    }
    if (builder.step === "rules") {
      if (!builder.lineup.length) builder.step = "shelf";
      const y = window.scrollY;
      renderBuilder();
      window.scrollTo({ top: y });
      return;
    }
    paintTile(key);
    paintTray(delta > 0);
  }

  /** A copy of the product's art flies from the tile into the tray. */
  function fly(fromEl) {
    if (!motion()) return;
    const src = fromEl.querySelector("img");
    const target = root.querySelector(".hl-tray-stack");
    if (!src || !target) return;
    const a = src.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const ghost = src.cloneNode();
    ghost.className = "hl-fly";
    ghost.removeAttribute("loading");
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const scale = Math.max(0.12, Math.min(0.6, (b.height * 0.9) / a.height));
    const anim = track(ghost.animate(
      [
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.3 - 60}px) scale(${(1 + scale) / 2}) rotate(-8deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(4deg)`, opacity: 0.2 },
      ],
      { duration: 560, easing: "cubic-bezier(0.45, 0, 0.2, 1)", fill: "forwards" },
    ));
    anim.finished.then(() => ghost.remove(), () => ghost.remove());
  }

  function setRule(rule, value) {
    const s = builder.settings;
    if (rule === "players") {
      if (value === "teams") Object.assign(s, { players: 4, teams: true });
      else Object.assign(s, { players: Number(value), teams: false });
    } else if (rule === "mode") s.mode = value;
    else if (rule === "scoring") s.scoring = value;
    else if (rule === "private") s.private = value === "true";
    builder.settings = cleanSettings(s);
    persistBuilder();
    create.msg = "";
    const y = window.scrollY;
    renderBuilder();
    window.scrollTo({ top: y });
  }

  async function createBattle(isQuick) {
    if (create.busy || !catalog || !builder.lineup.length) return;
    if (!signedIn()) {
      ctx.signIn?.();
      return;
    }
    if (lock()) {
      create.msg = esc(gateRefusal(lock()));
      paintTray();
      return;
    }
    const t = totals();
    if (balance() + 1e-9 < t.entry) {
      create.msg = `You need ${coinTag(t.entry - balance())} more for this entry.`;
      paintTray();
      return;
    }
    const lineup = builder.lineup.map(({ key, quantity }) => ({ key, quantity }));
    const settings = cleanSettings(builder.settings);
    const sig = JSON.stringify([lineup, settings, Boolean(isQuick)]);
    if (sig !== create.sig || !create.requestId) {
      create.sig = sig;
      create.requestId = uuid();
    }
    create.busy = true;
    create.msg = "";
    paintTray();
    const token = gen;
    try {
      const data = await api("/api/battles", {
        method: "POST",
        body: JSON.stringify({ requestId: create.requestId, lineup, settings, ...(isQuick ? { quick: true } : {}) }),
      });
      ctx.clock?.sync?.(data?.serverNow);
      if (data?.save) ctx.applySave?.(data.save);
      create.busy = false;
      create.requestId = "";
      if (!data?.battle?.id) throw new Error("The table didn't open. Try again.");
      ctx.buzz?.(14);
      if (token === gen && visible) ctx.navigate(`/battles/${data.battle.id}`);
    } catch (err) {
      create.busy = false;
      if (token !== gen || !visible) return;
      if (err?.status === 401) ctx.signIn?.();
      else create.msg = esc(friendlyError(err));
      paintTray();
    }
  }

  // ---- Events ------------------------------------------------------------------
  root.addEventListener("click", (e) => {
    if (!visible) return;
    const link = e.target.closest("a[data-hall-link]");
    if (link && root.contains(link)) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      e.stopPropagation();
      ctx.navigate(link.getAttribute("href"));
      return;
    }
    const el = e.target.closest("[data-hall]");
    if (!el || !root.contains(el) || el.disabled) return;
    const act = el.dataset.hall;
    if (act === "quick") startQuick();
    else if (act === "prev") stepQuick(-1);
    else if (act === "next") stepQuick(1);
    else if (act === "bots") {
      quick.bots = Number(el.dataset.n) || 1;
      quick.msg = "";
      writeStore(STORE_QUICK, { key: quick.key, bots: quick.bots });
      paintQuickCopy();
      ctx.buzz?.(6);
    } else if (act === "picker") {
      pickerOpen = !pickerOpen;
      pickerSet = "";
      paintPicker(true);
      if (pickerOpen && !catalog) loadCatalog(ctx).then(() => visible && paintPicker(true), () => {});
    } else if (act === "pick-set") {
      pickerSet = el.dataset.set;
      paintPicker();
    } else if (act === "pick") {
      const current = quickProduct();
      const order = catalog?.products || [];
      const dir = order.indexOf(catalog?.byKey.get(el.dataset.key)) >= order.indexOf(current) ? 1 : -1;
      pickerOpen = false;
      swapQuick(el.dataset.key, dir);
      root.querySelector(".hl-quick")?.scrollIntoView({ block: "nearest", behavior: motion() ? "smooth" : "auto" });
    } else if (act === "retry") {
      listing = null;
      listError = "";
      paintTables();
      fetchList();
    } else if (act === "reload") show("builder");
    else if (act === "add") changeQty(el.dataset.key, 1, el);
    else if (act === "inc") changeQty(el.dataset.key, 1, el.closest(".hl-prod") || el.closest("li"));
    else if (act === "dec") changeQty(el.dataset.key, -1);
    else if (act === "set") {
      shelf.set = el.dataset.set;
      shelf.limit = PAGE;
      root.querySelectorAll(".hl-set").forEach((b) => {
        const on = b === el;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      });
      el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: motion() ? "smooth" : "auto" });
      paintGrid();
    } else if (act === "type") {
      shelf.type = el.dataset.type;
      shelf.limit = PAGE;
      root.querySelectorAll(".hl-types .hl-word").forEach((b) => {
        const on = b === el;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      });
      paintGrid();
    } else if (act === "more") {
      shelf.limit += PAGE;
      paintGrid();
    } else if (act === "step") {
      const next = el.dataset.step === "rules" && builder.lineup.length ? "rules" : "shelf";
      if (next === builder.step && next === "shelf" && el.classList.contains("hl-tray-stack")) return;
      builder.step = next;
      trayNote = "";
      persistBuilder();
      renderBuilder();
      window.scrollTo({ top: 0, behavior: "auto" });
    } else if (act === "set-rule") setRule(el.dataset.rule, el.dataset.value);
    else if (act === "create") createBattle(false);
    else if (act === "create-quick") createBattle(true);
  });

  root.addEventListener("change", (e) => {
    if (!visible) return;
    const el = e.target.closest('[data-hall="toggle"]');
    if (!el) return;
    builder.settings[el.dataset.rule] = el.checked;
    builder.settings = cleanSettings(builder.settings);
    persistBuilder();
    create.msg = "";
  });

  let searchTimer = 0;
  root.addEventListener("input", (e) => {
    if (!visible) return;
    const el = e.target.closest('[data-hall="search"]');
    if (!el) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      shelf.q = el.value;
      shelf.limit = PAGE;
      paintGrid();
    }, 120);
  });

  // Wrapper art ships as AVIF with a PNG beside it.
  root.addEventListener(
    "error",
    (e) => {
      const el = e.target;
      if (el?.tagName !== "IMG" || el.dataset.fallback) return;
      const src = el.getAttribute("src") || "";
      if (/\.avif$/.test(src)) {
        el.dataset.fallback = "1";
        el.src = src.replace(/\.avif$/, ".png");
      }
    },
    true,
  );

  function paintGrid() {
    const grid = root.querySelector(".hl-grid");
    if (grid) grid.innerHTML = gridHtml();
  }

  return { show, hide };
}
