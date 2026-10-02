import { createCardMotion } from "./card-motion.js";
import { foilExtras, isBw, isDp, isEx, isSm, isSwsh, isWotc, isXy, bwPattern, dpPattern, exPattern, smPattern, swshPattern, wotcPattern, xyPattern } from "./foil-maps.js?v=92";
import { initFx } from "./fx.js";
import { PROFILE_PAGE_LIMIT } from "./profile-pages.js";
import * as profileView from "./profile-view.js"; // the public profile page: hero, sections, room
import * as profileEditor from "./profile-editor.js"; // the Layout tab on the account page
import {
  ALL_SETS,
  PLAYABLE_SETS,
  DEFAULT_SET_ID,
  getSet,
  erasWithSets,
  ROADMAP,
  RARITY_ORDER,
  RARITY_LABEL,
  RARITY_MARK,
  BASIC_ENERGY,
  sellValue,
  money,
  rarityKey,
  setIdentity,
  sealedOffers,
  promoOffers,
  findOffer,
  offerPackCount,
  offerPackSets,
  hasCardData,
  dataSetsOf,
  homeCards,
} from "./catalog.js";
import { dexIds, foldCopies, homeSetId, promoHomeOf } from "./card-home.js";
import { createCardPicker } from "./card-picker.js?v=1";
import { HIT_RARITIES, isHit, tallyRarity } from "./engine.js";
import { initRadio } from "./radio.js?v=3";
import { createTear } from "./tear.js";
import { initSocial, notifySignedIn, faceHtml, levelTag, sendChat, refreshLounge, currentFriends } from "./social.js?v=4";
import { frameHtml, levelBadgeHtml, framePicksHtml, userFrame } from "./level-badge.js";
import { BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES, frameInfo } from "./levels.js";
import { roomLine } from "./gate-notice.js";
import {
  AVATARS,
  avatarSrc,
  avatarStyle,
  avatarIcon,
  bannerVars,
  parseBanner,
  BANNER_MOTIONS,
  searchAvatars,
  STAT_KEYS,
  DEFAULT_STATS,
  SHOWCASE_MAX,
} from "./cosmetics.js";
import { unlockedTitles, titleContext, TITLES, isTitleUnlocked, ownedPerSet } from "./titles.js";
import { slabHTML, gradeWord } from "./slab.js?v=2";
import { GRADING_LIMITS, gradedValue } from "./grading-rules.js";
import {
  ACHIEVEMENTS,
  ACH_CATEGORIES,
  achievementById,
  achievementContext,
  achievementProgress,
  isAchievementDone,
  achievementFace,
  isSecret,
  achievementsBySet,
  masteryRowFor,
  readyToClaim,
  claimTotal,
} from "./achievements.js";
import * as questRules from "./quests.js";
import { masteryEmblemHtml as masteryEmblem, masterySetIds, masteryBannerId } from "./mastery.js";
import { bannerBlockHtml } from "./mastery-banner.js";
import { masteryShelfProfileHtml } from "./mastery-shelf.js";
import * as questArea from "./quest-area.js?v=6";
import * as levelUi from "./level-ui.js";
import { createXpFeed } from "./level-feed.js";
import { startLivePrices, applyCachedPrices, applyLatestSealed } from "./liveprices.js?v=4";
import {
  loadPriceHistory,
  priceHistoryReady,
  productTrend,
  renderPriceChart,
  renderProductChart,
  renderWorthChart,
} from "./pricechart.js";
import {
  loadState,
  saveState,
  setPersistProgress,
  cloneSave,
  ownedCount,
  msUntilDaily,
  logWorth,
  BINDER_PAGE,
  binderHeld,
  spareFor,
  placeInBinder,
  clearBinderSlot,
  addBinderPage,
  reconcileBinder,
  DAILY_BONUS,
  STARTING_COINS,
  DEFAULT_SETTINGS,
} from "./state.js";
import {
  AVATAR_COLORS,
  avatarColor,
  trainerCode,
} from "./accounts.js";
import { api, ApiError } from "./api.js";
import { gearItem, normalizeGear } from "./gear.js";
import { cardBackHtml, cardBackSrc, coinHtml, getGearCatalog, giftHtml, initGear, loadGearCatalog, sleeveHtml } from "./gear-page.js?v=11";
import { initBattles } from "./battles.js?v=5";
import { initCasino } from "./casino.js?v=12";
import { coinOf } from "./coin.js?v=3";
// grading
import { initGrading, GRADING_ROUTE } from "./grading-page.js?v=10";
import { coinTag } from "./battle-kit.js";
import { coinText, coinAmount, COIN_I } from "./money.js?v=1";
import { receiptHtml, pullRow } from "./receipt.js?v=1";
// cart and sealed collection (CONTRACT: /mnt/project-files/cart-sealed/CONTRACT.md)
import { cartStore, cartControlHtml, cartControlClick, cartControlChange, refreshCartControls, mountCartBar } from "./cart.js?v=4";
import { initCart } from "./cart-page.js?v=6";
import { initVault } from "./vault-page.js?v=5";
import { initBatchOpen } from "./batch-open.js?v=4";
import { cartEligible } from "./orders-rules.js?v=1";
import { initSearch } from "./search.js?v=2";
// binder looks: the /binder cover, the customiser and the owner's look on a profile
import { binderObjectHtml, applyBinderLook } from "./binder-object.js";
import { watchBinderFx } from "./binder-editions.js";
import { normalizeBinderLook, resolveBinderLook, COLOR_FROM_CARDS } from "./binder-looks.js";
import { hexToHsl, hslToHex, mixHex } from "./card-accent.js";
import { cachedCardAccents, sampleCardAccents } from "./card-art-accent.js?v=1";
import { initBinderEditor } from "./binder-editor.js?v=3";
import { renderNotesPage } from "./notes-page.js?v=1";

const state = loadState();
let cloudUser = null;
let profileHandle = "";
let profileBinderView = {handle:"", pages:[], mine:false, position:0};
// Binder page index named by a /u/<handle>/binder/<n> link, kept while that page is on screen.
let profilePageWanted = null;
let profilePageScroll = false;
let dmHandle = "";
let avatarQuery = "";
const CLOUD_SEEN_KEY = "poke-pack-rip-cloud-seen";
let pendingClaim = localStorage.getItem(CLOUD_SEEN_KEY) ? null : snapshotIfProgress(state);
let ripLock = false;
let battleReturnPath = "";
let battlePath = "/battles";
let casinoReturnPath = "";
let casinoPath = "/casino";
let gradingPath = "/grading"; // grading
let cartPath = "/cart";
let vaultPath = "/bulk/sealed";

function snapshotIfProgress(save) {
  if (!save) return null;
  const owned = Object.values(save.collection || {}).some((n) => n > 0);
  if (save.packsOpened > 0 || owned || save.coins !== STARTING_COINS || Boolean(save.lastDaily)) {
    return cloneSave(save);
  }
  return null;
}

function activeTrainer() {
  return cloudUser;
}

/** The level a player's unlocks count from: the highest reached (prestige, or the first curve), else the level. */
const unlockOf = (user) => Number(user?.unlockLevel ?? user?.perks?.unlockLevel ?? user?.level) || 1;

function applyCloudSave(save) {
  if (!save) return;
  if (cloudUser && save.xp?.level) {
    // The badge shows the level; gates and perks read the highest level reached (js/gate-notice.js).
    cloudUser.level = save.xp.level;
    cloudUser.prestige = save.xp.prestige || 0;
    cloudUser.unlockLevel = save.xp.peak || save.xp.level;
  }
  state.coins = save.coins;
  state.collection = save.collection || {};
  state.reverses = save.reverses || {};
  state.lastDaily = save.lastDaily ?? null;
  state.packsOpened = save.packsOpened || 0;
  state.pulls = save.pulls || 0;
  state.packsSinceHit = save.packsSinceHit || 0;
  state.packTrick = Boolean(save.packTrick);
  state.history = Array.isArray(save.history) ? save.history : [];
  state.granted = save.granted;
  state.claimed = Array.isArray(save.claimed) ? save.claimed : [];
  state.quests = save.quests || null;
  state.stats = save.stats || null;
  state.xp = save.xp || null;
  state.binder = Array.isArray(save.binder) ? save.binder : [];
  state.worthLog = Array.isArray(save.worthLog) ? save.worthLog : [];
  state.gear = normalizeGear(save.gear);
  state.graded = Array.isArray(save.graded) ? save.graded : []; // grading: slabs ride along with the save
  state.vaultKept = Math.max(0, Math.floor(Number(save.vaultKept) || 0)); // kept sealed product (total)
  if (save.createdAt) state.createdAt = save.createdAt;
  if (save.activeSetId) state.activeSetId = save.activeSetId;
  setPersistProgress(true);
  saveState(state);
  xpFeed.adopt(save, cloudUser?.id ?? null); // what the save earned, and the header readout
}

function wipeProgressMemory() {
  state.coins = 0;
  state.graded = [];
  state.collection = {};
  state.reverses = {};
  state.lastDaily = null;
  state.packsOpened = 0;
  state.pulls = 0;
  state.packsSinceHit = 0;
  state.packTrick = false;
  state.history = [];
  state.granted = 0;
  state.claimed = [];
  state.quests = null;
  state.stats = null;
  state.xp = null;
  xpFeed.reset();
  state.worthLog = [];
  state.binder = [];
  state.gear = normalizeGear(null);
  state.graded = []; // grading
  state.vaultKept = 0;
  // Screen memory belongs to the account that is gone: a secret revealed for one
  // trainer must not stay revealed for the next.
  achFilter = "all";
  achCat = "";
  masteryEra = "";
  masterySet = "";
  freshClaims = new Set();
  seenSecrets.clear();
}

async function refreshSession() {
  try {
    const me = await api("/api/me");
    cloudUser = me.user;
    pendingClaim = null;
    localStorage.setItem(CLOUD_SEEN_KEY, "1");
    applyCloudSave(me.save);
    return true;
  } catch (err) {
    cloudUser = null;
    if (err instanceof ApiError && err.status === 401) {
      setPersistProgress(false);
      wipeProgressMemory();
    }
    return false;
  }
}

function accountGateHtml(kind) {
  const copy =
    kind === "binder"
      ? "Your binder lives on your account, so it follows you to any device. Sign in to start filling it."
      : "Cards, coins and sales live on your account, not in this browser. Sign in to keep what you pull.";
  return `<div class="need-account">
    <p>${copy}</p>
    <div class="account-hero-actions">
      <button class="solid" type="button" data-open-auth="signup">Create account</button>
      <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
    </div>
  </div>`;
}

async function persistWorth() {
  if (!cloudUser) return;
  try {
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ worthLog: state.worthLog }) });
  } catch {
    /* chart samples are optional */
  }
}

function afterEconomy(save) {
  applyCloudSave(save);
  trackWorth();
  persistWorth();
}

async function pushBinder() {
  if (!cloudUser) return false;
  try {
    const data = await api("/api/binder", {
      method: "PUT",
      body: JSON.stringify({ binder: state.binder }),
    });
    applyCloudSave(data.save);
    return true;
  } catch (err) {
    toast(err.message || "Couldn't save the binder.");
    await refreshSession();
    return false;
  }
}

const setCache = {};
let priceTicker = null;
let liveSet = getSet(state.activeSetId);
/** Sealed market prices (pack, box, ETB…) per set id, from data/sealed.json. */
let sealedPrices = {};
/** Promo products (collections, tins, decks) per set id, from data/products.json. */
let productList = {};
/** The single cards a box holds beyond packs and promos, by "set/product", from data/box-contents.json. */
let boxContents = {};
let cards = [];
let setCards = [];
let byId = {};
let view = "home";
let viewFadeGen = 0;
let patchNotes = [];
let ownedMode = "all";
let rarityMode = "all";
let authTab = "signup";
let signupColor = "gold";
/** Account page: which tab is open, how the badge wall is filtered. */
let accountTab = "overview";
let achFilter = "all";
let achCat = "";
let masteryEra = "";
let masterySet = "";
/** Ids just claimed, so their tiles pulse once on the next paint; secret rows already revealed this session. */
let freshClaims = new Set();
const seenSecrets = new Set();
let historyOpen = false;
let historyFilter = "all";
let currentPulls = [];
let packPhase = "idle";
/**
 * A sealed product being opened: `{ product, packs: [{ wrapper, cards }], promos, index, cost }`.
 * Every pack is already saved when this is set; it only walks the player through them.
 * `index` is -1 while a product's promo cards are on the table, before its first pack.
 */
let sealedRun = null;
/** Which sealed product's buy button is waiting for its confirming second click. */
let sealedConfirm = null;
let sealedConfirmTimer = 0;
let focusIndex = 0;
let activeWrapper = liveSet.wrappers[0];
/** The set of the pack on the table: a promo set's boxes open other sets' packs. */
let packSet = liveSet;
let tearing = false;
let flipBusy = false;
let flipTimer = 0;
let flipGen = 0;
let pendingAdvance = false;
let handoffTimer = 0;
let packExiting = false;
let showStrip = false;

const els = {
  coinCount: document.getElementById("coin-count"),
  dailyBtn: document.getElementById("daily-btn"),
  packGrid: document.getElementById("pack-grid"),
  sealedBlock: document.getElementById("sealed-block"),
  sealedGrid: document.getElementById("sealed-grid"),
  promoBlock: document.getElementById("promo-block"),
  promoBlockTitle: document.getElementById("promo-block-title"),
  promoBlockSub: document.getElementById("promo-block-sub"),
  promoElsewhere: document.getElementById("promo-elsewhere"),
  packHead: document.getElementById("pack-head"),
  promoGrid: document.getElementById("promo-grid"),
  setSwitcher: document.getElementById("set-switcher"),
  shopKicker: document.getElementById("shop-kicker"),
  shopTitle: document.getElementById("shop-title"),
  shopPackTrend: document.getElementById("shop-pack-trend"),
  priceDialog: document.getElementById("price-dialog"),
  priceClose: document.getElementById("price-close"),
  priceArt: document.getElementById("price-art"),
  priceKicker: document.getElementById("price-kicker"),
  priceTitle: document.getElementById("price-title"),
  priceChart: document.getElementById("price-chart"),
  priceNote: document.getElementById("price-note"),
  binderTitle: document.getElementById("binder-title"),
  bulkKicker: document.getElementById("bulk-kicker"),
  bulkPulse: document.getElementById("bulk-pulse"),
  bulkSets: document.getElementById("bulk-sets"),
  sellDuplicates: document.getElementById("sell-duplicates"),
  viewHome: document.getElementById("view-home"),
  viewShop: document.getElementById("view-shop"),
  viewBattles: document.getElementById("view-battles"),
  viewGear: document.getElementById("view-gear"),
  viewCasino: document.getElementById("view-casino"),
  viewGrading: document.getElementById("view-grading"), // grading
  cartLink: document.getElementById("cart-link"),
  cartCount: document.getElementById("cart-count"),
  viewCart: document.getElementById("view-cart"),
  viewVault: document.getElementById("view-vault"),
  collectionTabs: document.getElementById("collection-tabs"),
  batchOpen: document.getElementById("batch-open"),
  casinoBar: document.getElementById("casino-bar"),
  viewCollection: document.getElementById("view-collection"),
  viewBinder: document.getElementById("view-binder"),
  binderBody: document.getElementById("binder-body"),
  binderCount: document.getElementById("binder-count"),
  binderAddPage: document.getElementById("binder-add-page"),
  binderCustomise: document.getElementById("binder-customise"),
  binderEditorMount: document.getElementById("binder-editor"),
  binderLayout: document.getElementById("binder-layout"),
  viewCatalog: document.getElementById("view-catalog"),
  viewAccount: document.getElementById("view-account"),
  viewProfile: document.getElementById("view-profile"),
  viewSocial: document.getElementById("view-social"),
  viewAuth: document.getElementById("view-auth"),
  viewSettings: document.getElementById("view-settings"),
  viewNotes: document.getElementById("view-notes"),
  homeKicker: document.getElementById("home-kicker"),
  homeBody: document.getElementById("home-body"),
  accountBody: document.getElementById("account-body"),
  profileBody: document.getElementById("profile-body"),
  socialBody: document.getElementById("social-body"),
  authBody: document.getElementById("auth-body"),
  settingsBody: document.getElementById("settings-body"),
  notesBody: document.getElementById("notes-body"),
  authEntry: document.getElementById("auth-entry"),
  trainerChip: document.getElementById("trainer-chip"),
  trainerAvatar: document.getElementById("trainer-avatar"),
  trainerChipName: document.getElementById("trainer-chip-name"),
  trainerChipHandle: document.getElementById("trainer-chip-handle"),
  dexGrid: document.getElementById("dex-grid"),
  binderNote: document.getElementById("binder-note"),
  search: document.getElementById("search"),
  rarityFilter: document.getElementById("rarity-filter"),
  ownedFilter: document.getElementById("owned-filter"),
  catalogEras: document.getElementById("catalog-eras"),
  overlay: document.getElementById("overlay"),
  packBody: document.getElementById("pack-body"),
  packRest: document.getElementById("pack-rest"),
  packRestArt: document.getElementById("pack-rest-art"),
  tearStrip: document.getElementById("tear-strip"),
  tearEdge: document.getElementById("tear-edge"),
  tearShade: document.getElementById("tear-shade"),
  tearGlints: document.getElementById("tear-glints"),
  focusWrap: document.getElementById("focus-wrap"),
  focusMeta: document.getElementById("focus-meta"),
  focusAura: document.getElementById("focus-aura"),
  focusCard: document.getElementById("focus-card"),
  focusPrev: document.getElementById("focus-prev"),
  focusNext: document.getElementById("focus-next"),
  hitFx: document.getElementById("hit-fx"),
  opWhere: document.getElementById("op-where"),
  opReceipt: document.getElementById("op-receipt"),
  spread: document.getElementById("spread"),
  thumbs: document.getElementById("thumbs"),
  ripHint: document.getElementById("rip-hint"),
  overlayActions: document.getElementById("overlay-actions"),
  leavePack: document.getElementById("leave-pack"),
  stepBtn: document.getElementById("step-btn"),
  skipHitsBtn: document.getElementById("skip-hits-btn"),
  skipBtn: document.getElementById("skip-btn"),
  againBtn: document.getElementById("again-btn"),
  viewPullsBtn: document.getElementById("view-pulls-btn"),
  doneBtn: document.getElementById("done-btn"),
  binderHitBtn: document.getElementById("binder-hit-btn"),
  boxSummaryBtn: document.getElementById("box-summary-btn"),
  boxProgress: document.getElementById("box-progress"),
  inspect: document.getElementById("inspect"),
  inspectArt: document.getElementById("inspect-art"),
  inspectInfo: document.getElementById("inspect-info"),
  inspectClose: document.getElementById("inspect-close"),
  toast: document.getElementById("toast"),
};

/*
 * Both overlays are real dialogs now. `inert` takes everything underneath out
 * of the tab order so focus cannot wander into the page behind an open pack,
 * and focus returns to whatever opened the dialog when it closes.
 */
const dialogStack = [];
let scrollLockY = 0;

function backdropNodes() {
  return [document.querySelector(".site-header"), document.querySelector(".wrap"), document.querySelector(".site-footer")];
}

function lockPageScroll() {
  if (document.documentElement.classList.contains("dialog-open")) return;
  scrollLockY = window.scrollY;
  document.documentElement.classList.add("dialog-open");
  document.body.style.top = `-${scrollLockY}px`;
}

function unlockPageScroll() {
  if (dialogStack.length) return;
  document.documentElement.classList.remove("dialog-open");
  document.body.style.top = "";
  window.scrollTo(0, scrollLockY);
}

function openDialog(el, firstFocus) {
  if (dialogStack.some((entry) => entry.el === el)) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!dialogStack.length) {
    lockPageScroll();
    backdropNodes().forEach((n) => n && (n.inert = true));
  } else dialogStack.at(-1).el.inert = true;
  dialogStack.push({ el, opener });
  el.classList.remove("hidden");
  el.scrollTop = 0;
  const visible = (n) => n instanceof HTMLElement && n.offsetParent !== null && !n.disabled;
  const target =
    (visible(firstFocus) && firstFocus) ||
    [...el.querySelectorAll("button, [href], input, select")].find(visible) ||
    el;
  if (target === el && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

function closeDialog(el) {
  const index = dialogStack.findIndex((entry) => entry.el === el);
  el.classList.add("hidden");
  if (index < 0) return;
  const [entry] = dialogStack.splice(index, 1);
  if (!dialogStack.length) backdropNodes().forEach((n) => n && (n.inert = false));
  else dialogStack.at(-1).el.inert = false;
  unlockPageScroll();
  const opener = entry.opener;
  const back =
    opener && opener.isConnected && opener.offsetParent !== null
      ? opener
      : document.querySelector(".nav-btn.active");
  back?.focus?.({ preventScroll: true });
}

/** Keep Tab inside the topmost dialog. */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || !dialogStack.length) return;
  const el = dialogStack.at(-1).el;
  const focusable = [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (n) => !n.disabled && n.offsetParent !== null
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

/** What each adopted save earned (js/level-feed.js): the XP toast, the level-up card, the header readout. */
const xpFeed = createXpFeed({
  toast: els.toast,
  readout: document.getElementById("lvl-read"),
  isBusy: () => dialogStack.length > 0 || !els.overlay.classList.contains("hidden"),
  openLevels: () => openLevelsTab(),
  uiDeps: {
    esc: (value) => esc(value),
    num: (value) => num(value),
    gearName: (kind, id) => gearItem(getGearCatalog(), kind, id)?.name || "",
  },
});
document.getElementById("lvl-read")?.addEventListener("click", () => openLevelsTab());

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function packPicture(wrap, extraAlt = "", set = liveSet) {
  const alt = extraAlt || `${wrap.name} ${set.name} booster pack`;
  const fallback = wrap.artFallback || wrap.art;
  return `<picture>
    <source srcset="${esc(wrap.art)}" type="image/avif" />
    <img src="${esc(fallback)}" alt="${esc(alt)}" draggable="false" />
  </picture>`;
}

function isExCard(card) {
  return Boolean(
    card?.subtypes?.some((s) => String(s).toLowerCase() === "ex") ||
      /(^|\s)ex$/i.test(card?.name || "")
  );
}

/**
 * Tera ex Double and Ultra Rares, which TCG Live prints in SV_ULTRA etched
 * foil (its DoubleRareC / UltraRareC prints). Their Special Illustration and
 * Hyper Rares print like any other. Needs the card's foil map to keep the
 * shine to the foil, like the other TCG Live recipes.
 */
function isTeraFoil(card) {
  return Boolean(card?.foilMap) && (card.subtypes || []).includes("Tera") &&
    (card.rarity === "Double Rare" || card.rarity === "Ultra Rare");
}

function hasEvoCircle(card) {
  const subs = card?.subtypes || [];
  return subs.includes("Stage 1") || subs.includes("Stage 2") || Boolean(card?.evolvesFrom);
}

/** Sets like 30th Celebration print every card in the pack as a holo. */
function isAllFoil(card) {
  return Boolean(setForCard(card)?.allFoil) && !card.energy && card.supertype !== "Energy";
}

function foilClass(card) {
  if (!card) return "";
  if (card.reverse || card.pattern) return "rare-glow";
  // Sword & Shield's plain Rare is not a foil card.
  if (isSwsh(card) && (!card.foilAs || card.era === "swsh") && swshPattern(card) === "foil-none") return "";
  if (isSm(card) && (!card.foilAs || card.era === "sm") && smPattern(card) === "foil-none") return "";
  // XY's plain Rare is not foil either; every Radiant Collection card is (js/xy-foil.js).
  if (isXy(card) && (!card.foilAs || card.era === "xy")) {
    const xy = xyPattern(card);
    if (xy === "foil-none") return "";
    if (xy.includes("xy-rc")) return "holo";
  }
  // Black & White's plain Rare is not foil either; every Radiant Collection card is (js/bw-foil.js).
  if (isBw(card) && (!card.foilAs || card.era === "bw")) {
    const bw = bwPattern(card);
    if (bw === "foil-none") return "";
    if (bw.includes("bw-rc") || bw.includes("bw-vault")) return "holo";
  }
  // The Diamond & Pearl generation's plain Rare is not foil either (js/dp-foil.js).
  if (isDp(card) && (!card.foilAs || card.era === "dp") && dpPattern(card) === "foil-none") return "";
  // The EX generation's plain Rare is not foil either; its holo Energy, Unown Collection and kit holos are (js/ex-foil.js).
  if (isEx(card) && (!card.foilAs || card.era === "ex")) {
    const ex = exPattern(card);
    if (ex === "foil-none") return "";
    if (/\bex-(energy|unown|kit)\b/.test(ex)) return "holo";
  }
  // The Wizards of the Coast generation's plain Rare is not foil either (js/wotc-foil.js).
  if (isWotc(card) && (!card.foilAs || card.era === "wotc") && wotcPattern(card) === "foil-none") return "";
  if (HIT_RARITIES.has(card.rarity) || ["Rare", "Rare Holo", "Pikachu Rare", "Cosmos", "Metal", "Confetti"].includes(card.rarity)) return "holo";
  if (isAllFoil(card)) return "holo";
  return "";
}

/** Classic Collection reprints: the rule-box cards got full-card foil originally. */
const CLASSIC_FULL_FOIL = /(-?EX|-?GX|\bV|VMAX|VSTAR|LV\.X|BREAK|LEGEND)$/i;

/**
 * Reverse holos foil the card body (name, attacks, frame) and leave the
 * picture matte. Regular holos do the opposite: rainbow on the art window.
 * Pokémon ex, IRs, and chases keep a whole-card treatment.
 */
/*
 * "Trainer's Pokemon" cards print an owner portrait over the bottom-right of
 * the illustration window — N's Reshiram, Larry's Staraptor, Hop's Cramorant.
 * The foil has to stop at the character's outline, and every owner draws a
 * different one, so each portrait gets its own window cut out by
 * scripts/make_owner_masks.py. `ownerMask` names the one this card takes; it
 * is stamped into data/<set>.json by that script.
 */
function ownerWindow(card) {
  if (!card?.ownerMask) return "";
  // The evolution badge is punched into the same file, so pick the variant
  // rather than layering a second mask on top of it.
  const variant = hasEvoCircle(card) ? "-evo" : "";
  return assetUrl(`assets/masks/owner/${card.ownerMask}${variant}.png`);
}

function setForCard(card) {
  const id = card?.id || "";
  // Retired sets included: a binder page or a pull history still has to draw
  // cards from a set that is no longer openable.
  return ALL_SETS.find((set) => id.startsWith(`${set.id}-`)) || liveSet;
}

function reverseKindOf(card) {
  // Prismatic Evolutions files its pattern prints as cards of their own.
  if (card?.pattern) return card.pattern;
  if (!card?.reverse) return "";
  if (card.reverseKind) return card.reverseKind === "cosmos" ? "" : card.reverseKind;
  return setForCard(card)?.reverseFoil || "";
}

function foilLayout(card) {
  if (card.energy || card.supertype === "Energy") return "foil-energy";
  if (card.rarity === "ACE SPEC Rare") return "";
  if (card.supertype === "Trainer") return "foil-trainer";
  if (card.ownerMask) return "foil-owner";
  return hasEvoCircle(card) ? "foil-evo" : "";
}

function foilPattern(card) {
  if (!card) return "foil-none";
  // Prismatic Evolutions' Poké Ball and Master Ball prints: the ball reverse,
  // and with the card's foil map TCG Live's RAINBOW / ETCHED recipe on a
  // second class (css/holo/prismatic.css).
  if (card.pattern) return `foil-reverse foil-rev-${card.pattern} foil-prism`;
  if (card.reverse) {
    const kind = reverseKindOf(card);
    // The galaxy holo (css/holo/promos.css) on the frame: 151's Costco promos.
    if (kind === "galaxy") return "foil-reverse foil-cosmos";
    return kind ? `foil-reverse foil-rev-${kind}` : "foil-reverse";
  }
  // Sword & Shield era prints (js/foil-maps.js, shared with the lab). A
  // reprint in a later product names its finish through foilAs (foilLook has
  // already made it the rarity here).
  if (isSwsh(card) && (!card.foilAs || card.era === "swsh")) {
    const swsh = swshPattern(card);
    if (swsh) return swsh;
  }
  // Sun & Moon era prints (js/sm-foil.js).
  if (isSm(card) && (!card.foilAs || card.era === "sm")) {
    const sm = smPattern(card);
    if (sm) return sm;
  }
  // XY era prints (js/xy-foil.js).
  if (isXy(card) && (!card.foilAs || card.era === "xy")) {
    const xy = xyPattern(card);
    if (xy) return xy;
  }
  // Black & White era prints (js/bw-foil.js).
  if (isBw(card) && (!card.foilAs || card.era === "bw")) {
    const bw = bwPattern(card);
    if (bw) return bw;
  }
  // Diamond & Pearl generation prints (js/dp-foil.js).
  if (isDp(card) && (!card.foilAs || card.era === "dp")) {
    const dp = dpPattern(card);
    if (dp) return dp;
  }
  // EX generation prints (js/ex-foil.js).
  if (isEx(card) && (!card.foilAs || card.era === "ex")) {
    const ex = exPattern(card);
    if (ex) return ex;
  }
  // Wizards of the Coast generation prints (js/wotc-foil.js).
  if (isWotc(card) && (!card.foilAs || card.era === "wotc")) {
    const wotc = wotcPattern(card);
    if (wotc) return wotc;
  }
  // Paldean Fates (css/holo/shiny-vault.css): the Shiny Vault's silver
  // fingerprint-etched foil, and its gold cards' glitter and raised Scodix.
  if (card.rarity === "Shiny Ultra Rare") return "foil-ultra foil-shiny";
  if (card.rarity === "Shiny Rare") return "foil-holo foil-shiny";
  if (card.finish === "scodix") return "foil-gold foil-scodix";
  if (card.rarity === "Mega Hyper Rare" || card.rarity === "Hyper Rare") return "foil-gold";
  // Tera ex print TCG Live's SV_ULTRA etched foil across the whole card
  // (css/holo/sv-finishes.css). Before the Ultra Rare check, which would
  // otherwise take the full-art Tera cards.
  if (isTeraFoil(card)) return card.rarity === "Ultra Rare" ? "foil-ultra foil-tera" : "foil-ex foil-tera";
  if (card.rarity === "Special Illustration Rare") return "foil-sir";
  if (card.rarity === "Illustration Rare") return "foil-ir";
  // Before the ex check: Ultra Rares are ex cards too, so they'd otherwise
  // share the plain full-art foil instead of getting their own.
  if (card.rarity === "Ultra Rare") return "foil-ultra";
  if (card.rarity === "Mega Attack Rare") return "foil-mega-attack";
  if (card.rarity === "Black White Rare") return "foil-bwr";
  // The 30th Celebration's own finishes (css/holo/celebration.css) ride on a
  // second class, so the Classic engine keeps reading the first one.
  if (card.rarity === "Futuristic Rare") return "foil-future";
  if (card.rarity === "RGB Rare") return "foil-future foil-rgb";
  if (card.rarity === "Classic Collection") {
    return `${CLASSIC_FULL_FOIL.test(card.name || "") ? "foil-ultra" : "foil-holo"} foil-classic`;
  }
  if (card.rarity === "Pikachu Rare") return "foil-holo foil-pikachu";
  // Collection-box promos (css/holo/promos.css).
  if (card.rarity === "Cosmos") return "foil-holo foil-cosmos";
  // Brass cards like 151's Ultra-Premium Collection Mew ex (css/holo/sv151.css).
  if (card.rarity === "Metal") return "foil-metal";
  // McDonald's Happy Meal holos (css/holo/side-sets.css).
  if (card.rarity === "Confetti") return "foil-holo foil-confetti";
  if (card.rarity === "ACE SPEC Rare") return card.foilMap ? "foil-holo foil-acespec" : "foil-holo";
  // TCG Live's SUN_PILLAR and SV_HOLO recipes need the card's foil map to keep
  // off the Pokémon, so they only replace the older recipes where one ships.
  if (isExCard(card) && (HIT_RARITIES.has(card.rarity) || card.rarity === "Rare")) {
    return card.foilMap && card.rarity === "Double Rare" ? "foil-ex foil-sunpillar" : "foil-ex";
  }
  if (card.supertype === "Trainer" && HIT_RARITIES.has(card.rarity)) return "foil-ex";
  if (card.rarity === "Rare" && card.foilMap) return "foil-holo foil-svholo";
  if (HIT_RARITIES.has(card.rarity) || card.rarity === "Rare") return "foil-holo";
  if (isAllFoil(card)) return card.foilMap ? "foil-holo foil-rainbow" : "foil-holo";
  return "foil-none";
}

function rarityPips(rarity) {
  const mark = RARITY_MARK[rarity];
  if (!mark) return "";
  return mark.pips
    .map(([glyph, tone]) => `<i class="pip tone-${tone}">${glyph}</i>`)
    .join("");
}

const RARITY_SHAPE = {
  "●": "circle",
  "◆": "diamond",
  "★": "star",
  "☆": "star-line",
  "◈": "gem",
  "◓": "ball",
};

function rarityShapeSvg(shape) {
  if (shape === "circle") {
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2" fill="currentColor"/></svg>`;
  }
  if (shape === "diamond") {
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.6 14.4 8 8 14.4 1.6 8Z"/></svg>`;
  }
  if (shape === "ball") {
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.6a6.4 6.4 0 0 0-6.4 6.4h3.9a2.5 2.5 0 0 1 5 0h3.9A6.4 6.4 0 0 0 8 1.6Z"/><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>`;
  }
  if (shape === "gem") {
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M8 1.2 14.8 8 8 14.8 1.2 8Z M8 4.2 11.8 8 8 11.8 4.2 8Z"/></svg>`;
  }
  if (shape === "star-line") {
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" d="M8 1.6 9.9 6l4.7.4-3.6 3.2.9 4.6L8 11.8l-3.9 2.4.9-4.6L1.4 6.4 6.1 6Z"/></svg>`;
  }
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.35 9.95 6.1l5.05.42-3.85 3.37.96 4.95L8 12.2l-4.11 2.64.96-4.95L1 6.52l5.05-.42Z"/></svg>`;
}

function rarityIcons(rarity) {
  const mark = RARITY_MARK[rarity];
  if (!mark) return "";
  return mark.pips
    .map(
      ([glyph, tone]) =>
        `<span class="rarity-ico tone-${tone}">${rarityShapeSvg(RARITY_SHAPE[glyph] || "star")}</span>`
    )
    .join("");
}

function rarityMark(card) {
  // A pattern print carries its base card's printed symbol.
  const pips = rarityPips(card.printedRarity || card.rarity);
  if (!pips) return "";
  const label = rarityLine(card);
  const kind = reverseKindOf(card);
  const rev = card.reverse || card.pattern ? ` rev${kind ? ` rev-${kind}` : ""}` : "";
  return `<span class="focus-mark${rev}" title="${esc(label)}" aria-hidden="true">${pips}</span>`;
}

/** Printed rarity mark, bottom-right of the card so it reads at a glance. */
function rarityStamp(card, extraClass = "") {
  const pips = rarityPips(card.printedRarity || card.rarity);
  if (!pips) return "";
  const label = rarityLine(card);
  const kind = reverseKindOf(card);
  const rev = card.reverse || card.pattern ? ` rev${kind ? ` rev-${kind}` : ""}` : "";
  return `<span class="rarity-stamp${rev}${extraClass}" title="${esc(label)}" aria-label="${esc(label)}">${pips}</span>`;
}

/**
 * Absolute URL for a card face.
 *
 * `--art` feeds mask-image inside css/app.css, and a relative url() in a custom
 * property gets resolved against the stylesheet rather than the document — so
 * "assets/cards/…" was being fetched as "css/assets/cards/…" and every foil and
 * glare mask 404'd silently while the plain <img> still loaded. Absolute URLs
 * sidestep it, and keep working if the site is ever served from a subpath.
 */
function assetUrl(src) {
  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
}

/**
 * Promo cards are printed in another rarity's finish: a full-art promo is foiled
 * like an Illustration Rare, an ex promo like a Double Rare. `foilAs` names that
 * rarity (scripts/build_products.py reads it from TCG Live's print data), so the
 * foil engine draws the promo with its recipe. "Cosmos" is the galaxy holo most
 * collection-box promos (and 151's holo basic Energies) use; "Frame" foils only
 * the card frame, like a reverse, and "Reverse Cosmos" puts the galaxy there.
 * "Metal" is a brass card: one broad reflection, no rainbow. "Poke Ball" is a
 * Poké Ball pattern reverse. Holo prints in Trick or Trade and McDonald's
 * packs carry `foilAs` the same way, so it applies to any card, not only promos.
 */
function foilLook(card) {
  if (!card?.foilAs || card.reverse) return card;
  if (card.foilAs === "Frame") return { ...card, rarity: "Common", reverse: true, reverseKind: "cosmos" };
  if (card.foilAs === "Reverse Cosmos") return { ...card, rarity: "Common", reverse: true, reverseKind: "galaxy" };
  // A Poké Ball pattern print, like Black Bolt's reverses (the Victini
  // Illustration Collection's Victini).
  if (card.foilAs === "Poke Ball") return { ...card, rarity: "Rare", reverse: true, reverseKind: "pokeball" };
  return { ...card, rarity: card.foilAs };
}

function tcgFace(card, { small = false, stamp = true, lazy = false } = {}) {
  if (!card) return cardBack();
  const src = small ? card.imageSmall : card.image;
  const shown = card;
  card = foilLook(card);
  const reverse = card.reverse ? "reverse" : "";
  const evo = foilLayout(card);
  const pattern = foilPattern(card);
  // These monochrome printings need different light response: color-dodge
  // cannot reveal relief on white stock and bleaches Victini's red lacquer.
  const finish = card.rarity === "Black White Rare"
    ? (card.name === "Reshiram ex" ? "pearl" : card.name === "Victini" ? "ruby" : "silver")
    : card.rarity === "RGB Rare"
      ? ({ R: "red", G: "green", B: "blue" }[card.number] || "")
      : "";
  // Only the window foils read --win-owner. The whole-card patterns (ex, ultra,
  // IR, SIR, gold) print shiny edge to edge, portrait included, so they take no
  // layout mask at all.
  const owner = evo === "foil-owner" ? ownerWindow(card) : "";
  // Per-card foil maps, stamp placement and cast-and-cure coats (js/foil-maps.js).
  const extra = foilExtras(card, assetUrl, reverseKindOf(card));
  const load = lazy ? ` loading="lazy" decoding="async"` : ` decoding="async"`;
  return `<div class="tcg ${rarityKey(shown.rarity)} ${foilClass(card)} ${pattern} ${reverse} ${evo} ${extra.classes}" data-finish="${finish}" data-ball-layout="${setForCard(card)?.id === "sv8pt5" ? "prismatic" : "repeat"}"
    style="--art:url('${esc(assetUrl(src))}')${owner ? `;--win-owner:url('${esc(owner)}')` : ""}${extra.style ? `;${esc(extra.style)}` : ""}">
    <img src="${esc(src)}" alt="${esc(card.name)}"${load} />
    <span class="foil" aria-hidden="true"></span>
    ${extra.cure ? `<span class="cure" aria-hidden="true"></span>` : ""}
    <span class="glare" aria-hidden="true"></span>
    ${stamp ? rarityStamp(shown) : ""}
  </div>`;
}

/** The face-down card: the equipped sleeve when there is one, else the set's printed back. */
function backSrc(set = liveSet) {
  return cardBackSrc(state.gear, set?.cardBack || liveSet.cardBack);
}

function cardBack(set = liveSet) {
  return cardBackHtml(state.gear, set?.cardBack || liveSet.cardBack);
}

function setOwned() {
  return ownedCount({ collection: ownedMapNow() }, setCards);
}

function numberLine(card) {
  if (card.energy || card.number === "—") return "Energy";
  // Classic Collection reprints keep their original number; RGB Mews print a letter.
  if (card.printedNumber) return card.printedNumber;
  const total = String(setForCard(card).printedTotal);
  const width = Math.max(3, total.length);
  return `${String(card.number).padStart(width, "0")}/${total.padStart(width, "0")}`;
}

function rarityLine(card) {
  const label = RARITY_LABEL[card.rarity] || card.rarity;
  if ((card.promo || card.energy) && card.variant) return `${label} · ${card.variant}`;
  if (card.pattern) return `${label} · ${RARITY_LABEL[card.printedRarity] || card.printedRarity}`;
  if (!card.reverse) return label;
  if (card.reverseKind === "pokeball" || reverseKindOf(card) === "pokeball") {
    return `Poké Ball reverse · ${label}`;
  }
  if (card.reverseKind === "masterball" || reverseKindOf(card) === "masterball") {
    return `Master Ball reverse · ${label}`;
  }
  return `Reverse · ${label}`;
}

function fillRarityFilter() {
  if (!els.rarityFilter) return;
  const present = new Set(cards.map((card) => card.rarity));
  const inSet = RARITY_ORDER.filter((r) => present.has(r) && r !== "Energy");
  if (rarityMode !== "all" && !present.has(rarityMode)) rarityMode = "all";
  const chip = (value, label, marks = "") =>
    `<button type="button" class="rarity-chip${rarityMode === value ? " on" : ""}" data-rarity="${esc(
      value
    )}">${marks}<span>${esc(label)}</span></button>`;
  els.rarityFilter.innerHTML = [
    chip("all", "All"),
    ...inSet.map((r) =>
      chip(r, RARITY_LABEL[r] || r, `<span class="rarity-marks">${rarityIcons(r)}</span>`)
    ),
  ].join("");
}

/** "Ready in 47m" — coarse until the last minute, then to the second. */
function waitLabel(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

/**
 * Header button label, split so a phone can drop the wording of the countdown
 * and keep the time: "Ready in 2h 14m" becomes "2h 14m". "Claim 100" stays
 * whole (css/theme.css).
 */
function shortLabel(lead, value) {
  return `<span class="btn-word">${esc(lead)} </span>${esc(value)}`;
}

function renderHeader() {
  const trainer = activeTrainer();
  if (!trainer) {
    els.coinCount.textContent = "0";
    els.dailyBtn.disabled = false;
    els.dailyBtn.innerHTML = shortLabel("Claim", String(DAILY_BONUS));
    els.dailyBtn.setAttribute("aria-label", `Claim ${DAILY_BONUS} daily coins`);
  } else {
    const wait = msUntilDaily(state);
    // Levels and prestige stars raise the hourly claim (js/levels.js hourlyBonus); a guest save has none.
    const hourly = state.xp ? levelUi.xpOf(state).hourly : DAILY_BONUS;
    els.coinCount.textContent = coin(state.coins);
    els.dailyBtn.disabled = wait > 0;
    els.dailyBtn.innerHTML = wait > 0
      ? shortLabel("Ready in", waitLabel(wait))
      : shortLabel("Claim", String(hourly));
    // The name keeps the visible words ("Claim 100", "Ready in 2h 14m") for voice control.
    els.dailyBtn.setAttribute("aria-label", wait > 0 ? `Daily coins ready in ${waitLabel(wait)}` : `Claim ${hourly} daily coins`);
  }
  paintShopProgress();
  xpFeed.paint(trainer ? state : null);
  els.authEntry?.classList.toggle("hidden", Boolean(trainer));
  els.trainerChip?.classList.toggle("hidden", !trainer);
  cartStore.setUser(trainer?.id || null);
  pruneCart();
  paintCartLink();
  if (trainer && els.trainerChip) {
    const color = avatarColor(trainer.color);
    els.trainerChip.style.setProperty("--avatar", color.hex);
    els.trainerAvatar.innerHTML = `<img src="${esc(avatarSrc(trainer.avatar, trainer.avatarStyle))}" alt="" />`;
    els.trainerAvatar.classList.toggle("pixel", avatarStyle(trainer.avatarStyle) === "pixel");
    els.trainerChipName.textContent = trainer.name;
    els.trainerChipHandle.textContent = `@${trainer.handle}`;
  }
}

/** The header's cart link: shown with the product count while the cart holds anything. */
function paintCartLink() {
  const n = cartStore.count();
  els.cartLink?.classList.toggle("hidden", !n);
  if (els.cartCount) els.cartCount.textContent = n > 99 ? "99+" : String(n);
  els.cartLink?.setAttribute("aria-label", n ? `Cart, ${n} product${n === 1 ? "" : "s"}` : "Cart");
}
/** Once the catalog is in, drop cart lines it no longer sells (a stale cart from another day). */
function pruneCart() {
  if (!Object.keys(productList).length || !Object.keys(sealedPrices).length) return;
  cartStore.prune((setId, productId) => {
    const offer = offerFor(setId, productId);
    return cartEligible(offer) && Boolean(offerPackSets(offer, getSet(setId)));
  });
}

mountCartBar(document.getElementById("view-shop"), (setId, productId) => offerFor(setId, productId));
cartStore.subscribe(() => {
  paintCartLink();
  refreshCartControls(els.sealedGrid);
  refreshCartControls(els.promoGrid);
});

function renderSetChrome() {
  const month = liveSet.released.replace(/ \d+,/, "");
  paintSign(els.shopTitle, liveSet.name);
  const facts = document.getElementById("shop-facts");
  if (facts) facts.textContent = setFacts(liveSet);
  paintShopProgress();
  const rates = document.getElementById("shop-rates");
  if (rates) {
    rates.innerHTML = liveSet.promoSet ? "" : rateCardHtml(liveSet);
    rates.hidden = !rates.innerHTML;
  }
  // A promo set sells no boosters, only the boxes its promos come in.
  els.packHead?.classList.toggle("hidden", Boolean(liveSet.promoSet));
  document.querySelector("#view-shop .shop-counter")?.classList.toggle("no-packs", Boolean(liveSet.promoSet));
  const bulkRip = document.getElementById("bulk-rip");
  if (bulkRip) bulkRip.textContent = liveSet.promoSet ? "Shop the promos" : "Rip a pack";
  if (els.binderTitle) els.binderTitle.textContent = liveSet.name;
  if (els.bulkKicker) {
    els.bulkKicker.textContent = `Collection, ${liveSet.edition}, ${month}`;
  }
  document.title = viewTitle();
}

/** "Mega Evolution, released July 17, 2026, 130 cards, 84 in the main set" */
function setFacts(set) {
  const parts = [set.era || set.edition, set.released ? `released ${set.released}` : ""];
  if (set.totalCount) parts.push(`${num(set.totalCount)} cards`);
  if (!set.promoSet && set.printedTotal && set.totalCount > set.printedTotal) parts.push(`${num(set.printedTotal)} in the main set`);
  return parts.filter(Boolean).join(", ");
}

/** The player's progress on the live set, one plain line under its facts. */
function paintShopProgress() {
  const line = document.getElementById("shop-progress");
  if (!line) return;
  const owned = activeTrainer() ? setOwned() : 0;
  line.hidden = !activeTrainer();
  line.textContent = owned
    ? `You've found ${num(owned)} of ${num(liveSet.totalCount || setCards.length)}.`
    : "You haven't pulled one yet.";
}

/** Short forms in a set's odds line, spelled out on the rate card. */
const RATE_WORDS = {
  DR: "Double Rare",
  UR: "Ultra Rare",
  IR: "Illustration Rare",
  SIR: "Special Illustration Rare",
  TG: "Trainer Gallery",
  GG: "Galarian Gallery",
  BWR: "Black White Rare",
  ACE: "ACE SPEC Rare",
  ex: "Pokémon ex",
  EX: "Pokémon-EX",
  GX: "Pokémon-GX",
  V: "Pokémon V",
  VMAX: "Pokémon VMAX",
  VSTAR: "Pokémon VSTAR",
  Classic: "Classic Collection",
  Futuristic: "Futuristic Rare",
  holo: "Holo rare",
  rainbow: "Rainbow rare",
  secret: "Secret rare",
};

/** What a pack is made of, slot by slot, in the words a player uses. */
const SLOT_WORDS = {
  common: ["Common", "Commons"],
  uncommon: ["Uncommon", "Uncommons"],
  rare: ["Rare", "Rares"],
  reverse: ["reverse holo", "reverse holos"],
  "rare-slot": ["rare slot", "rare slots"],
  "art-slot": ["art slot", "art slots"],
  pikachu: ["Pikachu", "Pikachu"],
  plain: ["non-holo card", "non-holo cards"],
  printedHolo: ["holo", "holos"],
  vault: ["holo", "holos"],
  rcCommon: ["Radiant Collection Common", "Radiant Collection Commons"],
  rcUncommon: ["Radiant Collection card", "Radiant Collection cards"],
};

/**
 * The set's own odds line ("DR 1/5 · UR 1/12 · ...") as rate card rows, the
 * rarest last; anything in it that is not a rate ("2 Energy a pack") stays a
 * plain line under them.
 */
function rateRows(set) {
  const rows = [];
  const notes = [];
  for (const piece of String(set.oddsLine || "").split("·").map((part) => part.trim()).filter(Boolean)) {
    const match = piece.match(/^(.*?)\s*(~?)1\/(\d[\d,.]*)\s*(.*)$/);
    if (!match || !match[1]) {
      notes.push(piece.charAt(0).toUpperCase() + piece.slice(1));
      continue;
    }
    const word = RATE_WORDS[match[1]] || match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const every = Number(match[3].replace(/,/g, ""));
    rows.push({ word, every, rate: `${match[2] ? "about " : ""}1 in ${num(every)}${match[4] ? ` ${match[4]}` : ""}` });
  }
  return { rows: rows.sort((a, b) => a.every - b.every), notes };
}

/**
 * "4 Commons, 3 Uncommons, 1 reverse holo, 1 rare slot, 1 art slot and a
 * basic Energy", slots of one pool counted together, or "" when a slot is one
 * it can't name.
 */
function packMakeup(set) {
  const counts = new Map();
  for (const slot of set.slots || []) {
    if (slot.pool !== "energy" && !SLOT_WORDS[slot.pool]) return "";
    counts.set(slot.pool, (counts.get(slot.pool) || 0) + (slot.count || 1));
  }
  const energy = counts.get("energy") || 0;
  counts.delete("energy");
  const parts = [...counts].map(([pool, n]) => `${n} ${SLOT_WORDS[pool][n === 1 ? 0 : 1]}`);
  if (energy) parts.push(energy === 1 ? "a basic Energy" : `${energy} basic Energy`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] || "";
}

/** The pull rates on a laminated card in an acrylic holder, from the set's own odds and slots. */
function rateCardHtml(set) {
  const { rows, notes } = rateRows(set);
  const makeup = packMakeup(set);
  if (!rows.length && !notes.length && !makeup) return "";
  return `<div class="ratecard-lam">
      <div class="ratecard-paper">
        <h2>Pull rates</h2>
        ${rows.length ? `<p class="ratecard-per">Chance of each in one pack</p>
        <dl>${rows.map((row) => `<div class="ratecard-row"><dt>${esc(row.word)}</dt><dd>${esc(row.rate)}</dd></div>`).join("")}</dl>` : ""}
        ${notes.map((note) => `<p class="ratecard-note">${esc(note)}</p>`).join("")}
        ${makeup ? `<p class="ratecard-slots"><b>Every pack, ${num(set.packSize)} cards</b>${esc(makeup)}.</p>` : ""}
      </div>
    </div>`;
}

function eraYears(sets) {
  const years = sets
    .map((set) => String(set.released).match(/\d{4}/)?.[0])
    .filter(Boolean);
  if (!years.length) return "";
  const newest = years.reduce((a, b) => (b > a ? b : a));
  const oldest = years.reduce((a, b) => (b < a ? b : a));
  return newest === oldest ? newest : `${oldest}–${newest}`;
}

function shortReleased(set) {
  const raw = String(set.released || "");
  const monthYear = raw.match(/^([A-Za-z]+)\s+\d+,\s+(\d{4})$/);
  if (monthYear) return `${monthYear[1].slice(0, 3)} ${monthYear[2]}`;
  return raw.replace(/ \d+,/, "") || "TBA";
}

const openEras = new Set();
let bulkEra = "";

function eraSwitcherHtml({ withOwned = false } = {}) {
  const ripping = packPhase !== "idle";
  const homeEra = liveSet.era || liveSet.edition;
  if (homeEra) openEras.add(homeEra);

  return erasWithSets()
    .map((block) => {
      const liveCount = block.live.length;
      const open = openEras.has(block.era) ? "open" : "";
      const rows = block.sets
        .map((set) => {
          const live = Boolean(set.live && hasCardData(set));
          const on = live && set.id === liveSet.id ? "active" : "";
          const { symbol } = setIdentity(set);
          if (!live) {
            return `<button type="button" class="rail-set is-queued" data-soon="${esc(set.name)}">
              <span class="rail-symbol-slot"><img class="rail-symbol" src="${esc(symbol)}" alt="" width="22" height="22" loading="lazy" decoding="async" /></span>
              <span class="rail-set-copy">
                <b>${esc(set.name)}</b>
                <small>${esc(shortReleased(set))}</small>
              </span>
              <span class="soon">Queued</span>
            </button>`;
          }
          const owned = withOwned ? `${ownedInSet(set)}/${set.totalCount}` : shortReleased(set);
          return `<button type="button" class="rail-set ${on}" data-set="${esc(set.id)}" ${
            ripping ? "disabled" : ""
          }>
            <span class="rail-symbol-slot"><img class="rail-symbol" src="${esc(symbol)}" alt="" width="22" height="22" loading="lazy" decoding="async" /></span>
            <span class="rail-set-copy">
              <b>${esc(set.name)}</b>
              <small>${esc(owned)}</small>
            </span>
          </button>`;
        })
        .join("");
      return `<details class="rail-era" data-era="${esc(block.era)}" ${open}>
        <summary>
          <span class="rail-era-title">
            <b>${esc(eraTitle(block.era))}</b>
            <small>${esc(eraYears(block.sets))}</small>
          </span>
          <span class="rail-era-count">${
            liveCount && liveCount !== block.sets.length
              ? `${liveCount} of ${block.sets.length} live`
              : `${block.sets.length} sets`
          }</span>
        </summary>
        <div class="rail-sets">${rows}</div>
      </details>`;
    })
    .join("");
}

function renderSwitcher() {
  if (!els.setSwitcher) return;
  els.setSwitcher.innerHTML = eraSwitcherHtml();
}

/** "both", "all three", "all 5": how many wrappers share the odds. */
function allOf(n) {
  return n === 2 ? "both" : `all ${["", "", "", "three", "four"][n] || n}`;
}

/**
 * The wrapper choice: the set's open display box on the counter, lid folded
 * back with the set's logo, its wrappers standing in it and the chosen one
 * lifted. A real radio group, so it works from the keyboard. A set with one
 * wrapper stands that pack forward on the counter instead.
 */
function displayBoxHtml(set) {
  const wraps = set.wrappers || [];
  const chosen = chosenWrapper(set);
  if (wraps.length < 2) {
    return chosen
      ? `<div class="single-pack">${packPicture(chosen, "", set)}${priceSticker(set.cost, { cls: "counter-gun" })}</div>`
      : "";
  }
  return `<fieldset class="display-box" style="--n:${wraps.length}">
      <legend class="sr-only">Choose a wrapper</legend>
      <div class="dbox-lid" aria-hidden="true">
        <img class="dbox-logo" src="${esc(setIdentity(set).logo)}" alt="" loading="lazy" decoding="async" />
      </div>
      <div class="dbox-body">
        <div class="dbox-tray">${wraps
          .map((wrap) => `<span class="dbox-slot">
            <input type="radio" class="dbox-input" name="shop-wrapper" id="shop-wrap-${esc(wrap.id)}" value="${esc(wrap.id)}"${wrap === chosen ? " checked" : ""} />
            <label class="dbox-pack" for="shop-wrap-${esc(wrap.id)}">${quietPackPicture(wrap, set)}</label>
          </span>`)
          .join("")}</div>
      </div>
      <div class="dbox-front" aria-hidden="true">${priceSticker(set.cost, { each: true, cls: "dbox-gun" })}</div>
      <div class="dbox-names">${wraps
        .map((wrap) => `<label class="dbox-name${wrap === chosen ? " is-on" : ""}" for="shop-wrap-${esc(wrap.id)}">${esc(wrap.name)}</label>`)
        .join("")}</div>
    </fieldset>`;
}

/** The rip button names the chosen wrapper; the box marks it. */
function paintWrapperChoice() {
  const wrap = chosenWrapper();
  const signed = Boolean(activeTrainer());
  const affordable = signed && state.coins >= liveSet.cost;
  const rip = document.getElementById("shop-rip");
  if (rip) {
    rip.textContent = !signed ? "Sign in to rip" : !affordable ? "Need coins" : `Rip the ${wrap?.name || liveSet.name} pack`;
    rip.disabled = signed && !affordable;
  }
  const input = wrap && document.getElementById(`shop-wrap-${wrap.id}`);
  if (input && !input.checked) input.checked = true;
  els.packGrid?.querySelectorAll(".dbox-name").forEach((label) => {
    label.classList.toggle("is-on", label.htmlFor === `shop-wrap-${wrap?.id}`);
  });
}

function renderShop() {
  renderSetChrome();
  renderSwitcher();
  const quickSets = document.getElementById("shop-quick-sets");
  if (quickSets) {
    quickSets.innerHTML = PLAYABLE_SETS.map((set) => {
      const on = set.id === liveSet.id;
      return `<button type="button" class="shop-quick-set${on ? " active" : ""}"
        data-quick-set="${esc(set.id)}" aria-pressed="${on}">${esc(set.name)}</button>`;
    }).join("");
    centerQuickSet();
  }
  const allSets = document.getElementById("shop-all-sets");
  if (allSets) allSets.textContent = `All ${PLAYABLE_SETS.length} sets`;

  // Keep the box as it is while the same set is on the counter, so a re-render
  // after a rip or a sale doesn't take the focus off the chosen wrapper.
  const boxKey = `${liveSet.id}/${liveSet.wrappers.length}`;
  if (els.packGrid.dataset.box !== boxKey || !els.packGrid.childElementCount) {
    els.packGrid.dataset.box = boxKey;
    els.packGrid.innerHTML = displayBoxHtml(liveSet);
  }
  paintWrapperChoice();
  const same = document.getElementById("shop-same");
  if (same) {
    const n = liveSet.wrappers.length;
    same.textContent = n > 1 ? `Pick any wrapper. The odds are the same on ${allOf(n)}.` : "";
    same.hidden = n < 2;
  }
  if (els.shopPackTrend) els.shopPackTrend.innerHTML = trendButton("boosterPack", `${liveSet.name} booster pack`);

  // The chase: the set's most valuable cards, in the glass case.
  const chase = document.getElementById("shop-chase");
  if (chase) {
    // A set's own page shows what its packs can pull; the stamped promos
    // that only come in its boxes stay on the shelf below.
    const top = liveSet.promoSet ? topByValue(12) : topByValue(40).filter((card) => !card.promo).slice(0, 12);
    document.getElementById("shop-case")?.classList.toggle("hidden", !top.length);
    const sub = document.getElementById("shop-case-sub");
    if (sub) sub.textContent = `The most valuable ${liveSet.promoSet ? liveSet.name : `${liveSet.name} pulls`}, at market value in coins`;
    chase.innerHTML = caseHtml(top, (card) => `${numberLine(card)} · ${rarityLine(card)}`);
  }
  renderSealed();
  loadShopTrends();
}

/**
 * The set chips scroll sideways and hold more sets than fit on a phone, so
 * the chosen one is brought to the middle of the row. Nothing to measure
 * while the shop is hidden; setView calls this again when it shows.
 */
function centerQuickSet() {
  const row = document.getElementById("shop-quick-sets");
  const on = row?.querySelector(".shop-quick-set.active");
  if (!on || !row.clientWidth) return;
  row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
}

/** Sets whose price history has loaded for the shop's trend buttons. */
const shopTrendSets = new Set();

/**
 * The link to a pack's or box's price chart, from data/prices/<set>.json.
 * Hidden until the set's prices are in, and left out for a product with
 * under two recorded prices.
 */
function trendButton(key, name) {
  const trend = productTrend(liveSet.id, key);
  if (!trend && shopTrendSets.has(liveSet.id)) return "";
  return `<button type="button" class="text-btn price-link${trend ? "" : " pending"}" data-price-chart="${esc(key)}"
    data-price-name="${esc(name)}" aria-label="${esc(name)} price history"${trend ? "" : " hidden"}>Price history</button>`;
}

/** Fetch the live set's price history once, then swap the placeholders for trends. */
function loadShopTrends() {
  const setId = liveSet.id;
  if (shopTrendSets.has(setId)) return;
  loadPriceHistory(setId).then((store) => {
    if (store) shopTrendSets.add(setId);
    if (liveSet.id !== setId) return;
    for (const grid of [els.shopPackTrend, els.sealedGrid, els.promoGrid]) {
      grid?.querySelectorAll(".price-link.pending").forEach((el) => {
        el.outerHTML = store ? trendButton(el.dataset.priceChart, el.dataset.priceName) : "";
      });
    }
  });
}

/** A product's two quiet buttons, open it now or add it to the cart, shared by the sealed and promo shelves. */
function productButton(offer) {
  const signed = Boolean(activeTrainer());
  const affordable = signed && state.coins >= offer.price;
  const confirming = sealedConfirm === offer.id && affordable;
  const label = !signed
    ? "Sign in to open"
    : !affordable
      ? "Need coins"
      : confirming
        ? `Confirm ${coinAmount(offer.price)}`
        : `Open ${offer.short}`;
  return `<button type="button" class="ghost product-open${confirming ? " confirming" : ""}" data-open-product ${signed && !affordable ? "disabled" : ""}>${label}</button>${
    cartEligible(offer) ? cartControlHtml(liveSet.id, offer.id, offer.name) : ""
  }`;
}

/** "Nidorina promo" / "Moltres, Articuno and Zapdos promos". */
function promoNames(ids, pick = 0) {
  const cards = ids.map((id) => byId[id]).filter(Boolean);
  if (!cards.length) return "";
  if (pick === 1) {
    const names = cards.map((card) => card.name);
    return `one of ${names.length} promos: ${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  }
  if (pick > 1 && pick < cards.length) return `${pick} of ${cards.length} promos`;
  // The Pokémon Center ETB has the Nidorina promo twice, stamped and not.
  const counts = new Map();
  for (const card of cards) counts.set(card.name, (counts.get(card.name) || 0) + 1);
  const names = [...counts].map(([name, n]) => (n > 1 ? `${n} ${name}` : name));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `the ${list} promo${cards.length > 1 ? "s" : ""}`;
}

/** A product with no photo of its own: a plain carton with the set's logo, or its packs fanned. */
function drawnProduct(set, offer, stack) {
  if (offer.id === "boosterBox" || offer.id === "boosterBundle") {
    return `<span class="drawn-box ${offer.id === "boosterBox" ? "is-box" : "is-bundle"}">
      <span class="drawn-top"></span>
      <span class="drawn-face"><img class="drawn-logo" src="${esc(setIdentity(set).logo)}" alt="" loading="lazy" decoding="async" /><span>${offer.packs} booster packs</span></span>
      <span class="drawn-side"></span>
    </span>`;
  }
  return `<span class="good-fan">${stack.map((wrap) => `<span>${quietPackPicture(wrap, set, true)}</span>`).join("")}</span>`;
}

/**
 * Booster boxes, ETBs and bundles for the live set, priced from
 * data/sealed.json: each stands on the shelf over a paper label with what is
 * inside and the price.
 */
function renderSealed() {
  if (!els.sealedGrid) return;
  const offers = sealedOffers(sealedPrices[liveSet.id], productList[liveSet.id]);
  els.sealedBlock.classList.toggle("hidden", !offers.length || !liveSet.wrappers.length);
  const single = Number(liveSet.cost) || 0;
  const stack = [0, 1, 2].map((i) => liveSet.wrappers[i % liveSet.wrappers.length]).filter(Boolean);
  // The ETB has a box photo in data/products.json; the box and bundle are drawn.
  const boxArt = Object.fromEntries((productList[liveSet.id] || []).map((item) => [item.id, item.image || ""]));
  els.sealedGrid.innerHTML = offers
    .map((offer) => {
      const each = offer.price / offer.packs;
      const vsSingle = single ? Math.round((1 - each / single) * 100) : 0;
      const deal =
        vsSingle >= 1 ? `${vsSingle}% under single packs` : vsSingle <= -1 ? `${-vsSingle}% over single packs` : "the same as single packs";
      const image = boxArt[offer.id];
      const what = [
        `${offer.packs} packs`,
        promoNames(offer.promos, offer.pick),
        boxContents[`${liveSet.id}/${offer.id}`]?.label,
        `${coin(each)} coins a pack`,
        deal,
      ].filter(Boolean).join(", ");
      return `<article class="good" data-sealed="${esc(offer.id)}">
        <div class="good-stand" aria-hidden="true">${
          image ? `<img class="good-img" src="${esc(image)}" alt="" loading="lazy" decoding="async" />` : drawnProduct(liveSet, offer, stack)
        }</div>
        <div class="shelf-chan"><div class="shelf-label good-label">
          <h3 class="good-name">${esc(offer.name)}</h3>
          <p class="good-what">${esc(what)}</p>
          <p class="good-price">${coin(offer.price)}<span class="sr-only"> coins</span></p>
        </div></div>
        <div class="good-acts">${productButton(offer)}${trendButton(offer.id, `${liveSet.name} ${offer.name}`)}</div>
      </article>`;
    })
    .join("");
  renderPromoProducts();
}

/**
 * What a promo product holds, in one line: "29 packs + 1 Classic Collection
 * pack", or "2 Obsidian Flames packs + 2 Paldea Evolved packs" when the packs
 * are another set's.
 */
function productContents(offer) {
  const parts = [];
  if (offer.from) {
    for (const [id, n] of Object.entries(offer.from)) {
      parts.push(`${n} ${getSet(id).name} pack${n === 1 ? "" : "s"}`);
    }
  } else if (offer.packs) {
    parts.push(`${offer.packs} pack${offer.packs === 1 ? "" : "s"}`);
  }
  for (const [key, n] of Object.entries(offer.special || {})) {
    const name = liveSet.specialPacks?.[key]?.wrapper?.name || key;
    parts.push(`${n} ${name} pack${n === 1 ? "" : "s"}`);
  }
  const box = boxContents[`${liveSet.id}/${offer.id}`];
  if (box?.label) parts.push(box.label);
  else {
    if (!parts.length && offer.kind === "deck") parts.push("60-card deck");
    if (offer.kind === "battle") parts.push("40-card deck");
  }
  if (!parts.length && offer.kind === "event") parts.push(offer.note || "The card on its own");
  return parts.join(" + ");
}

/** "Nov 6" for a product that is still on preorder. */
function releaseNote(offer) {
  if (!offer.released) return "";
  const when = new Date(`${offer.released}T12:00:00Z`);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return "";
  return `Out ${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Headings for a promo set's products, which run to dozens: kind, then newest first. */
const PROMO_KIND_HEADS = [
  ["premium", "Premium collections"],
  ["collection", "Boxes"],
  ["tin", "Tins"],
  ["deck", "Battle decks"],
  ["event", "Event promos"],
];

/**
 * Collections, tins, premium collections and battle decks for the live set:
 * the products that come with promo cards, from data/products.json. The
 * promo cards sit in front of the box photo, and each one can be inspected.
 * A product holding a set that isn't playable yet stays off the shelf.
 */
/** " 19 more open once Paradox Rift and Surging Sparks are here.": a promo set's boxes waiting on their packs' sets. */
function waitingLine() {
  const waiting = promoOffers(productList[liveSet.id]).filter((offer) => !offerPackSets(offer, liveSet));
  const ids = [...new Set(waiting.flatMap((offer) => Object.keys(offer.from || {})))].filter(
    (id) => !PLAYABLE_SETS.some((set) => set.id === id && set.wrappers?.length)
  );
  if (!waiting.length || !ids.length) return "";
  const names = ids.map((id) => ROADMAP.flatMap((era) => era.sets).find((set) => set.id === id)?.name || id);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return ` ${waiting.length} more open once ${list} ${names.length > 1 ? "are" : "is"} here.`;
}

function renderPromoProducts() {
  if (!els.promoGrid) return;
  let offers = promoOffers(productList[liveSet.id]).filter(
    (offer) => offer.promos.every((id) => byId[id]) && offerPackSets(offer, liveSet)
  );
  const grouped = Boolean(liveSet.promoSet);
  if (grouped) {
    const rank = (offer) => {
      const i = PROMO_KIND_HEADS.findIndex(([kind]) => kind === offer.kind);
      return i < 0 ? PROMO_KIND_HEADS.length : i;
    };
    const newest = (offer) => Math.max(...offer.promos.map((id) => parseInt(String(byId[id]?.number).replace(/\D/g, ""), 10) || 0));
    offers = offers.slice().sort((a, b) => rank(a) - rank(b) || newest(b) - newest(a));
  }
  els.promoBlock.classList.toggle("hidden", !offers.length);
  // One shelf run holds the set's boxes and then its collections, under one head.
  if (els.promoBlockTitle) els.promoBlockTitle.textContent = grouped ? "Boxes, tins and decks" : `Sealed ${liveSet.name}`;
  if (els.promoBlockSub) {
    els.promoBlockSub.textContent = grouped
      ? `Each product opens with the packs named on its box and lands its promos in your binder. Priced at TCGplayer market.${waitingLine()}`
      : offers.length
        ? `Boxes, tins and premium collections with promo cards no pack has. Priced at TCGplayer market.${promoHomeNote(offers)}`
        : "";
    els.promoBlockSub.hidden = !els.promoBlockSub.textContent;
  }
  const faces = [];
  let lastKind = "";
  els.promoGrid.innerHTML = offers
    .map((offer) => {
      const promos = offer.promos.map((id) => byId[id]);
      const note = releaseNote(offer);
      const values = promos.map((card) => sellValue(card));
      const total = values.reduce((sum, v) => sum + v, 0);
      // Most ETBs, pin blisters and booster boxes carry no promo card, so they get no worth line.
      const worth = !promos.length
        ? ""
        : offer.pick
          ? `Promo worth ${coin(Math.min(...values))} to ${coin(Math.max(...values))} coins`
          : `Promo${promos.length === 1 ? "" : "s"} worth ${coin(total)} coin${coin(total) === "1" ? "" : "s"}`;
      let head = "";
      if (grouped && offer.kind !== lastKind) {
        lastKind = offer.kind;
        const label = PROMO_KIND_HEADS.find(([kind]) => kind === offer.kind)?.[1] || "More";
        head = `<h3 class="promo-kind-head">${esc(label)}</h3>`;
      }
      const fan = promos
        .slice(0, 4)
        .map((card) => {
          faces.push(card);
          return `<button type="button" class="promo-face" data-face="${faces.length - 1}" ${inspectAttrs(card)}
            title="${esc(card.name)} · ${esc(numberLine(card))}" aria-label="Inspect the ${esc(card.name)} promo"></button>`;
        })
        .join("");
      const contents = productContents(offer);
      const inside = [contents, offer.kind === "event" ? "" : promoNames(offer.promos, offer.pick)].filter(Boolean).join(" with ");
      return `${head}<article class="good promo-product${offer.image ? "" : " no-box"}" data-sealed="${esc(offer.id)}">
        <div class="good-stand promo-stage">
          ${offer.image ? `<img class="good-img promo-box" src="${esc(offer.image)}" alt="" loading="lazy" decoding="async" />` : ""}
          <div class="promo-fan count-${Math.min(promos.length, 4)}">${fan}</div>
          ${note ? `<span class="promo-note">${esc(note)}</span>` : ""}
        </div>
        <div class="shelf-chan"><div class="shelf-label good-label">
          <h3 class="good-name">${esc(offer.name)}</h3>
          <p class="good-what">${esc(inside)}</p>
          ${offer.note && offer.kind !== "event" ? `<p class="good-what">${esc(offer.note)}</p>` : ""}
          ${worth ? `<p class="good-what">${worth}</p>` : ""}
          <p class="good-price">${coin(offer.price)}<span class="sr-only"> coins</span></p>
        </div></div>
        <div class="good-acts">${productButton(offer)}${trendButton(offer.id, offer.name)}</div>
      </article>`;
    })
    .join("");
  // Dozens of products on a promo set's page: only the faces near the screen are drawn.
  windowFaces("promos", els.promoGrid.querySelectorAll(".promo-face[data-face]"), faces, (card) =>
    tcgFace(card, { small: true, stamp: false, lazy: true })
  );
  renderPromoElsewhere();
}

/** "The black star promos (MEP) are filed under ME Black Star Promos." for a set whose boxes carry promos counted under a promo set (js/card-home.js). */
function promoHomeNote(offers) {
  const home = offers.flatMap((offer) => offer.promos).map(promoHomeOf).find(Boolean);
  const promoSet = home && PLAYABLE_SETS.find((set) => set.id === home);
  return promoSet ? ` The black star promos (${String(promoSet.promoPrefix || "").trim()}) are filed under ${promoSet.name}.` : "";
}

/**
 * On a promo set's page, the promos that come in a set's own boxes (its ETB,
 * Build & Battle Box, blisters). They are that set's cards and are bought
 * there, so this lists them from the sets already loaded and links across.
 */
function renderPromoElsewhere() {
  const block = els.promoElsewhere;
  if (!block) return;
  const prefix = liveSet.promoSet ? liveSet.promoPrefix || `${String(liveSet.id).toUpperCase()} ` : "";
  const groups = prefix
    ? PLAYABLE_SETS.filter((set) => set.id !== liveSet.id)
        .map((set) => ({
          set,
          cards: (setCache[set.id] || [])
            .filter((card) => card.promo && String(card.printedNumber || "").startsWith(prefix))
            .sort((a, b) => String(a.number).localeCompare(String(b.number))),
        }))
        .filter((group) => group.cards.length)
    : [];
  block.classList.toggle("hidden", !groups.length);
  if (!groups.length) {
    windowFaces("promo-elsewhere", [], [], tcgFace);
    block.innerHTML = "";
    return;
  }
  const faces = [];
  const total = groups.reduce((n, group) => n + group.cards.length, 0);
  const owned = groups.reduce((n, group) => n + group.cards.filter((card) => ownedQty(card.id) > 0).length, 0);
  block.innerHTML = `<div class="section-head">
      <div>
        <h2>${liveSet.viewOf ? "Where they come from" : "In the sets' own boxes"}</h2>
        <p>${
          liveSet.viewOf
            ? `All ${total} come in ${esc(liveSet.viewNote || "the Mega Evolution sets' own boxes (Elite Trainer Boxes, Build & Battle Boxes, blisters, tins and First Partner collections)")}, so each box is sold on its set's page. You have ${owned}.`
            : `${total} more ${esc(liveSet.name)} come in a set's Elite Trainer Box, Build &amp; Battle Box or blisters, so they're sold on that set's page. You have ${owned}.`
        }</p>
      </div>
    </div>
    ${groups
      .map(({ set, cards: list }) => {
        const have = list.filter((card) => ownedQty(card.id) > 0).length;
        return `<section class="elsewhere-set">
          <header>
            <b>${esc(set.name)}</b>
            <span>${have} / ${list.length}</span>
            <button type="button" class="ghost" data-go-set="${esc(set.id)}">Open ${esc(set.name)}</button>
          </header>
          <div class="elsewhere-cards">${list
            .map((card) => {
              faces.push(card);
              const missing = !(ownedQty(card.id) > 0);
              return `<button type="button" class="elsewhere-card${missing ? " missing" : ""}" data-face="${faces.length - 1}"
                ${inspectAttrs(card)} title="${esc(card.name)} · ${esc(numberLine(card))}" aria-label="Inspect ${esc(card.name)}"></button>`;
            })
            .join("")}</div>
        </section>`;
      })
      .join("")}`;
  windowFaces("promo-elsewhere", block.querySelectorAll(".elsewhere-card[data-face]"), faces, (card) =>
    tcgFace(card, { small: true, stamp: false, lazy: true })
  );
}

/**
 * Explain a /packs/<id> link that can't open, above the set showing instead.
 * The address keeps the asked-for set, so the link still says what it named.
 */
function showSetNotice(id, failed = false) {
  const box = document.getElementById("set-notice");
  if (!box) return;
  const known = ALL_SETS.find((set) => set.id === id);
  const queued = ROADMAP.flatMap((block) => block.sets).find((set) => set.id === id);
  const name = esc(known?.name || queued?.name || id);
  let title = `There's no set called “${name}”.`;
  let body = "That link doesn't match any set here.";
  if (failed) {
    title = `Couldn't load ${name}.`;
    body = "Its cards didn't come through.";
  } else if (known) {
    title = `${name} is closed for now.`;
    body = "Its packs can't be opened at the moment. Cards you already pulled stay in your binder.";
  } else if (queued) {
    title = `${name} isn't open yet.`;
    body = "It's queued in the catalog, newest sets first.";
  }
  box.dataset.set = id;
  box.innerHTML = `<div class="set-notice-copy">
      <b>${title}</b>
      <p>${body} Showing ${esc(liveSet.name)} ${failed ? "until they do" : "instead"}.</p>
    </div>
    <div class="set-notice-actions">
      ${failed
        ? `<button type="button" class="solid sm" data-notice="retry">Try again</button>`
        : `<button type="button" class="ghost sm" data-notice="catalog">See all sets</button>`}
      <button type="button" class="ghost sm" data-notice="dismiss">Dismiss</button>
    </div>`;
  box.classList.remove("hidden");
}

function hideSetNotice() {
  document.getElementById("set-notice")?.classList.add("hidden");
}

async function activateSet(id, force = false, quiet = false) {
  if (packPhase !== "idle") {
    toast("Finish this pack first.");
    return false;
  }
  const next = getSet(id);
  if (next.id === liveSet.id && setCards.length && !force) {
    hideSetNotice();
    if (view === "shop") replacePath(pathForView("shop"));
    return true;
  }
  try {
    // The ME Black Star Promos have no file: they are read from the files of the
    // Mega Evolution sets whose boxes carry them (dataSetsOf).
    for (const source of dataSetsOf(next)) {
      if (!setCache[source.id]) {
        setCache[source.id] = await fetch(source.dataFile, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
      }
      applyCachedPrices(setCache[source.id], source.id);
    }
  } catch {
    if (!quiet) toast(`Couldn't load ${next.name}.`);
    return false;
  }
  hideSetNotice();
  liveSet = next;
  state.activeSetId = next.id;
  saveState(state);
  bulkEra = liveSet.era || liveSet.edition || bulkEra;
  // The dex is the set's own cards. `byId` also holds the promos filed in the
  // set's file, because its boxes deal them (the black star promos are listed
  // under ME Black Star Promos, not under the set that sells them).
  const fileCards = dataSetsOf(next).flatMap((source) => setCache[source.id]);
  setCards = homeCards(next, dataSetsOf(next).map((source) => setCache[source.id]));
  cards = [...setCards, ...BASIC_ENERGY];
  byId = Object.fromEntries([...fileCards, ...BASIC_ENERGY].map((c) => [c.id, c]));
  activeWrapper = liveSet.wrappers[0];
  try {
    fillRarityFilter();
    renderHeader();
    renderShop();
    renderCollection();
    renderCatalog();
    if (view === "home") renderHome();
    if (view === "account") renderAccount();
    if (view === "shop") replacePath(pathForView("shop"));
  } catch (err) {
    console.error(err);
    toast(err?.message || `Couldn't render ${next.name}.`);
    throw err;
  }
  return true;
}

/* ---- Graded copies (RIP Grading). A slab leaves the raw `collection` counts,
   because a graded copy can't be sold or staked as a raw card, but it still
   counts as owned for completion, value and the collection grid. ---- */
let gradedIndexFor = null;
let gradedIndexMap = new Map();
function gradedIndex() {
  const list = Array.isArray(state.graded) ? state.graded : [];
  if (gradedIndexFor !== list) {
    gradedIndexMap = new Map();
    for (const slab of list) {
      if (!slab?.cardId) continue;
      const arr = gradedIndexMap.get(slab.cardId);
      if (arr) arr.push(slab);
      else gradedIndexMap.set(slab.cardId, [slab]);
    }
    gradedIndexFor = list;
  }
  return gradedIndexMap;
}
function gradedSlabs(cardId) {
  return gradedIndex().get(cardId) || [];
}
/* A Trainer Kit card the deck held more than once is listed once (js/card-home.js
   KIT_COPIES), and an older collection may still hold its copies under their own
   numbers, so a card's counts add up every id in dexIds; selling, grading and the
   showcase act on an id the player actually holds (heldId). */
function rawQty(cardId) {
  return dexIds(cardId).reduce((n, id) => n + (state.collection[id] || 0), 0);
}
function slabsOf(cardId) {
  return dexIds(cardId).flatMap((id) => gradedSlabs(id));
}
function heldId(cardId) {
  const ids = dexIds(cardId);
  return [...ids.slice(1), ids[0]].find((id) => (state.collection[id] || 0) > 0) || ids[0];
}
/** Raw copies plus graded ones: what "owned" means everywhere but sell and stake. */
function ownedQty(cardId) {
  return rawQty(cardId) + slabsOf(cardId).length;
}
function ownedMapNow() {
  const map = { ...(state.collection || {}) };
  for (const [id, slabs] of gradedIndex()) map[id] = (map[id] || 0) + slabs.length;
  return foldCopies(map);
}
function bestGrade(slabs) {
  return slabs.reduce((best, slab) => Math.max(best, Number(slab.grade) || 0), 0);
}
function gradeBadge(slabs) {
  if (!slabs.length) return "";
  const best = bestGrade(slabs);
  const title = `${slabs.length === 1 ? "One graded copy" : `${slabs.length} graded copies`}, best grade ${best}`;
  return `<span class="grade-badge grade-${best}" title="${title}"><i>RIP</i>${best}</span>`;
}

function spareCopies(set = liveSet) {
  let n = 0;
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (homeSetId(id) === set.id && count > 1) n += count - 1;
  }
  return n;
}

function eraCountLabel(block) {
  const liveCount = block.live.length;
  if (liveCount && liveCount !== block.sets.length) return `${liveCount} live · ${block.sets.length}`;
  if (liveCount) return `${liveCount} live`;
  return `${block.sets.length} set${block.sets.length === 1 ? "" : "s"}`;
}

function renderBulkSets() {
  if (!els.bulkSets) return;
  const ripping = packPhase !== "idle";
  const eras = erasWithSets();
  if (!eras.some((block) => block.era === bulkEra)) {
    bulkEra = liveSet.era || liveSet.edition || eras[0]?.era || "";
  }
  const active = eras.find((block) => block.era === bulkEra) || eras[0];
  const eraTabs = eras
    .map((block) => {
      const on = block.era === bulkEra;
      const years = eraYears(block.sets) || eraCountLabel(block);
      return `<button type="button" class="bulk-era${on ? " on" : ""}" role="tab"
        aria-selected="${on}" data-era="${esc(block.era)}" title="${esc(years)}">${esc(eraTitle(block.era))}</button>`;
    })
    .join("");
  // The sets are words, like the era row above them: the name, then how many of
  // its cards you have in small figures. The open set is ink with a line under it.
  const signed = Boolean(activeTrainer());
  const setBtns = (active?.sets || [])
    .map((set) => {
      const live = Boolean(set.live && hasCardData(set));
      if (!live) {
        return `<button type="button" class="bulk-set is-queued" data-soon="${esc(set.name)}"
          title="${esc(set.name)} is queued (${esc(shortReleased(set))})"><span class="bulk-set-name">${esc(set.name)}</span> <span class="bulk-set-count">queued</span></button>`;
      }
      const on = set.id === liveSet.id;
      const owned = ownedInSet(set);
      const count = signed ? ` <span class="bulk-set-count">${num(owned)}/${num(set.totalCount)}</span>` : "";
      return `<button type="button" class="bulk-set${on ? " active" : ""}" data-set="${esc(set.id)}"
        aria-pressed="${on}" ${ripping ? "disabled" : ""}${signed ? ` aria-label="${esc(set.name)}, ${num(owned)} of ${num(set.totalCount)}"` : ""}><span class="bulk-set-name">${esc(set.name)}</span>${count}</button>`;
    })
    .join("");
  els.bulkSets.innerHTML = `
    <div class="bulk-eras" role="tablist" aria-label="Eras">${eraTabs}</div>
    <div class="bulk-shelf" aria-label="Sets">${setBtns || `<p class="bulk-era-empty">No sets in this era yet.</p>`}</div>`;
  // Both rows scroll sideways on a phone: bring the chosen era and set into view
  // (horizontally only, so the page itself does not jump).
  for (const [row, on] of [
    [".bulk-eras", ".bulk-era.on"],
    [".bulk-shelf", ".bulk-set.active"],
  ]) {
    const track = els.bulkSets.querySelector(row);
    const chip = track?.querySelector(on);
    if (track && chip && track.scrollWidth > track.clientWidth) {
      track.scrollLeft = Math.max(0, chip.offsetLeft - (track.clientWidth - chip.offsetWidth) / 2);
    }
  }
}

/*
 * Long card grids (a set's collection, the binder's card picker) draw only the
 * cards within a screen and a half of what is showing. Every face is a scan
 * plus a masked, filtered, blended foil, and holding a whole 200-card set of
 * them at once was enough for a phone to kill the tab and reload the site.
 * A holder is an element with `data-face="<index into faces>"` that keeps the
 * card's size while empty; faces mount as they come near and unmount once
 * they are far away, so memory stays at a few screens however far you scroll.
 */
const FACE_REACH = 1.5;
const faceWindows = new Map();

function windowFaces(key, holders, faces, render, root = null) {
  faceWindows.get(key)?.disconnect();
  faceWindows.delete(key);
  if (!holders.length) return;
  const draw = (holder, near) => {
    const face = holder.firstElementChild;
    if (near) {
      if (!face) holder.innerHTML = render(faces[holder.dataset.face]);
    } else if (face && !face.matches(".lit, .settling")) {
      holder.replaceChildren();
    }
  };
  if (!("IntersectionObserver" in window)) {
    holders.forEach((holder) => draw(holder, true));
    return;
  }
  // Draw what is near the screen now, so a re-render (a sale, a filter) does
  // not blink empty for a frame while the observer catches up.
  const box = root ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const reach = (box.bottom - box.top) * FACE_REACH;
  for (const holder of holders) {
    const rect = holder.getBoundingClientRect();
    if (rect.height && rect.bottom > box.top - reach && rect.top < box.bottom + reach) draw(holder, true);
  }
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => draw(entry.target, entry.isIntersecting)),
    { root, rootMargin: `${FACE_REACH * 100}% 0px` }
  );
  holders.forEach((holder) => observer.observe(holder));
  faceWindows.set(key, observer);
}

/** The card an inspector link jumped to; the grid is rebuilt when prices land, so it carries the mark. */
let foundCardId = "";

function renderCollection({ refreshSets = true } = {}) {
  if (els.collectionTabs) els.collectionTabs.innerHTML = vaultPage.tabsHtml("cards"); // Cards | Sealed (N)
  const q = (els.search?.value || "").trim().toLowerCase();
  const rarity = rarityMode;
  const { owned, total, pct } = completion();
  const purse = binderValue(liveSet);
  const spares = spareCopies();
  if (els.sellDuplicates) {
    els.sellDuplicates.disabled = !activeTrainer() || spares < 1;
    els.sellDuplicates.textContent = spares > 0
      ? `Sell ${num(spares)} duplicate${spares === 1 ? "" : "s"}`
      : "No duplicates to sell";
  }

  // The set's sign, one line of facts, then your progress as a sentence over a
  // thin rule (the shop's own words, as on Packs).
  paintSign(els.binderTitle, liveSet.name);
  if (els.bulkPulse) {
    const facts = [liveSet.era || liveSet.edition, releaseMonth(liveSet), total ? `${num(total)} cards` : ""]
      .filter(Boolean)
      .join(", ");
    const found = owned
      ? `You've found ${num(owned)} of ${num(total)}${purse.value > 0 ? `, worth ${coinAmount(purse.value)}` : ""}.`
      : "You haven't pulled one yet.";
    const share = total ? Math.min(100, (owned / total) * 100) : 0;
    els.bulkPulse.innerHTML = `<p class="bulk-facts">${esc(facts)}</p>${
      activeTrainer()
        ? `<p class="bulk-found">${found}</p>
          <div class="bulk-bar" role="progressbar" aria-label="${esc(liveSet.name)} found"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${share.toFixed(2)}%"></span></div>`
        : accountGateHtml("bulk")
    }`;
  }

  els.ownedFilter?.querySelectorAll("[data-owned]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.owned === ownedMode);
  });
  els.rarityFilter?.querySelectorAll("[data-rarity]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.rarity === rarityMode);
  });
  if (refreshSets) renderBulkSets();

  const list = cards.filter((card) => {
    const raw = rawQty(card.id);
    const count = ownedQty(card.id);
    if (rarity !== "all" && card.rarity !== rarity) return false;
    if (ownedMode === "owned" && count < 1) return false;
    if (ownedMode === "missing" && count > 0) return false;
    if (ownedMode === "dupes" && raw < 2) return false;
    if (card.energy && !card.reverse && count < 1) return false;
    if (
      q &&
      !card.name.toLowerCase().includes(q) &&
      !String(card.number).includes(q) &&
      !(card.artist || "").toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  if (els.binderNote) {
    const shown = list.length;
    const filtered = ownedMode !== "all" || rarity !== "all" || q;
    els.binderNote.textContent = `${shown} card${shown === 1 ? "" : "s"}${filtered ? `. Filtered from ${total} in the set.` : ""}`;
  }

  if (!list.length) {
    windowFaces("collection", [], [], tcgFace);
    els.dexGrid.innerHTML = `<div class="bulk-empty">
      <p>No cards match. Try another filter or search, or rip a pack.</p>
    </div>`;
    return;
  }

  const faces = list.map((card) => (ownedQty(card.id) < 1 ? card : ownedFace(card)));
  els.dexGrid.innerHTML = list
    .map((card, i) => {
      const raw = rawQty(card.id);
      const slabs = slabsOf(card.id);
      const count = raw + slabs.length;
      const missing = count < 1;
      const face = faces[i];
      const value = sellValue(card);
      // An owned card wears the white price tag a single gets in the case; a
      // missing one keeps its value as plain figures under it.
      const action = !activeTrainer()
        ? ""
        : raw > 0
        ? `<button type="button" class="sell-btn" data-sell="${heldId(card.id)}" aria-label="Sell ${raw > 1 ? "an extra" : "your"} ${esc(card.name)}">Sell${raw > 1 ? " extra" : ""}</button>`
        : slabs.length
        ? `<a class="slot-graded" href="/grading/${esc(String(slabs[0].id))}">Graded</a>`
        : "";
      const said = missing ? "not pulled yet" : `${count} owned`;
      return `<article class="binder-slot bulk-card${missing ? " missing" : ""}${card.id === foundCardId ? " is-found" : ""}">
        <div class="slot-art">
          <button type="button" class="slot-face" data-face="${i}" ${inspectAttrs(face)} aria-label="${esc(card.name)}, ${said}"></button>
          ${gradeBadge(slabs)}
          ${missing ? "" : `<span class="price-tag slot-tag">${coin(value)}<span class="sr-only"> coins</span></span>`}
        </div>
        <div class="slot-meta">
          <b>${esc(card.name)}</b>
          <span class="slot-line"><span class="slot-num">${esc(numberLine(card))}</span><i class="slot-dot">·</i><span class="slot-rarity">${rarityPips(card.rarity)} ${esc(rarityLine(face))}</span></span>
        </div>
        <div class="slot-foot">
          ${missing ? `<span class="slot-price">${coinAmount(value)}</span>` : raw > 1 ? `<span class="slot-qty" title="${raw} copies">×${raw}</span>` : ""}
          ${action}
        </div>
      </article>`;
    })
    .join("");
  windowFaces("collection", els.dexGrid.querySelectorAll("[data-face]"), faces, (face) =>
    tcgFace(face, { small: true, lazy: true })
  );
}

/* One set on the catalog wall: its logo, the symbol printed on its cards, its
   name, month and state. Live sets are links into Packs (the document click
   handler turns a /packs/<id> link into playSet); queued sets are plain tiles.
   The symbol files are 15-40px rasters, so the symbol stays small and crisp
   and the logo carries the tile. */
/* One set on the shelf: its first wrapper standing on the board and the paper
   label under it (name, release month, the code badge, the price of a pack). A
   set with no boosters (promos, kits) stands as its logo. A set still on the way
   waits dark and is not a link. */
function catalogSlot(set, { live = false } = {}) {
  const { symbol, logo } = setIdentity(set);
  const wrap = set.wrappers?.[0];
  const when = shortReleased(set);
  const price = live && set.cost ? coin(set.cost) : "";
  const pack = wrap
    ? `<span class="wall-pack">${quietPackPicture(wrap, set, true)}</span>`
    : `<span class="wall-pack catalog-sign"><img src="${esc(logo)}" alt="" loading="lazy" decoding="async" /></span>`;
  const label = `<span class="shelf-chan"><span class="shelf-label">
      <span class="shelf-name">${esc(set.name)}</span>
      <span class="shelf-date">${live ? esc(when) : `Coming ${esc(when)}`}</span>
      <span class="shelf-row"><img class="shelf-code" src="${esc(symbol)}" alt="" width="28" height="14" loading="lazy" decoding="async" />${price ? `<span class="shelf-price">${price}</span>` : ""}</span>
    </span></span>`;
  return live
    ? `<a class="wall-slot catalog-slot" href="/packs/${esc(set.id)}" aria-label="${esc(set.name)}, ${esc(when)}${price ? `, ${price} coins a pack` : ""}">${pack}${label}</a>`
    : `<div class="wall-slot catalog-slot is-soon" role="group" aria-label="${esc(set.name)}, coming ${esc(when)}">${pack}${label}</div>`;
}

/* ROADMAP names a span of eras with arrows ("Sun & Moon → XY → BW"); on the
   page they read as a plain list. */
function eraTitle(name) {
  const parts = String(name).split(/\s*→\s*/).filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : String(name);
}

/* ---- Binder: the showcase --------------------------------------------------
   Bulk is the inventory; this is what you choose to display. Slots are pages of
   nine, drawn as a facing spread so it reads like an open binder. */

let binderSpread = 0;   // index of the left-hand page in the current spread
let binderPicking = null; // slot index awaiting a card, or null

function binderPageCount() {
  return Math.max(2, Math.ceil((state.binder?.length || 0) / BINDER_PAGE));
}

function binderPocket(index) {
  const slot = state.binder?.[index] || null;
  if (!slot) {
    return `<button type="button" class="pocket empty" data-pocket="${index}"
      aria-label="Empty pocket ${index + 1}"><span>+</span></button>`;
  }
  const base = findCard(slot.id);
  if (!base) {
    return `<button type="button" class="pocket empty" data-pocket="${index}"
      aria-label="Empty pocket ${index + 1}"><span>+</span></button>`;
  }
  const card = slot.reverse ? { ...base, reverse: true } : base;
  return `<div class="pocket filled">
    <button type="button" class="pocket-card" ${inspectAttrs(card)} title="${esc(card.name)}">
      ${tcgFace(card, { small: true, stamp: false })}
    </button>
    <button type="button" class="pocket-clear" data-unpocket="${index}"
      title="Take ${esc(card.name)} out" aria-label="Take ${esc(card.name)} out of the binder">×</button>
  </div>`;
}

/* ---- Binder look: the cover, the live preview and the customiser ------------
   The trainer's binderLook (js/binder-looks.js) dresses the spread in a
   .binder-object (js/binder-object.js). "cards" colour reads the cards on show;
   art refinement (js/card-art-accent.js) only ever repaints, never blocks. */
let binderDraft = null; // the look being tried in the customiser, or null
let binderEditor = null; // wired up with the click handlers below

const savedBinderLook = () => normalizeBinderLook(activeTrainer()?.binderLook);
const binderLookNow = () => binderDraft || savedBinderLook();

/** Cards on show, in pocket order (the whole binder, or the slots start..end). */
function binderCardsOf(start = 0, end = Infinity) {
  return (state.binder || [])
    .slice(start, end)
    .map((slot) => (slot ? findCard(slot.id) : null))
    .filter(Boolean);
}

const binderResolved = (look, list) => resolveBinderLook(look, { cards: list, accents: cachedCardAccents(list) });

/**
 * Paper and pocket tint of one page when the cover follows the cards. The hue is the cover's (one
 * object, one colour family) and so is the lightness; the page's own cards only nudge saturation.
 * Returns only the variables that the look actually tints, or null.
 */
function pageLookVars(look, list, coverList) {
  const tintPage = look.page === "tint";
  const tintPockets = look.pockets === "tint";
  if (look.color !== COLOR_FROM_CARDS || (!tintPage && !tintPockets) || !list.length) return null;
  const cover = binderResolved(look, coverList || list).vars["--b-main"];
  const own = binderResolved(look, list).vars["--b-main"];
  const [h, sc, l] = hexToHsl(cover);
  const [, sp] = hexToHsl(own);
  const main = hslToHex(h, Math.max(0, Math.min(1, sc + (sp - sc) * 0.35)), l);
  const vars = {};
  if (tintPage) vars["--b-page"] = mixHex(main, "#0b0b10", 0.72);
  if (tintPockets) vars["--b-pocket"] = mixHex(main, "#ffffff", 0.2);
  return vars;
}
const pageStyleAttr = (vars) => (vars ? ` style="${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}"` : "");
function setPageVars(el, vars) {
  for (const key of ["--b-page", "--b-pocket"]) {
    if (vars?.[key]) el.style.setProperty(key, vars[key]);
    else el.style.removeProperty(key);
  }
}

let artBusy = false;
let artNext = null; // the latest request that arrived while one was sampling
/** Sharpen "cards" colour from the art: sample in the background, then repaint through `repaint`. */
function refineArt(list, repaint) {
  if (!list.length) return;
  if (artBusy) {
    artNext = { list, repaint };
    return;
  }
  artBusy = true;
  sampleCardAccents(list, repaint)
    .catch(() => {})
    .finally(() => {
      artBusy = false;
      const next = artNext;
      artNext = null;
      if (next) refineArt(next.list, next.repaint);
    });
}

/** Repaint the binder on screen for the look now showing (a draft while customising) without redrawing the cards. */
function paintBinderLook() {
  const object = els.binderBody?.querySelector(".binder-object");
  if (!object) return;
  const look = binderLookNow();
  const all = binderCardsOf();
  applyBinderLook(object, binderResolved(look, all));
  object.querySelectorAll(".binder-page[data-page-index]").forEach((el) => {
    const start = Number(el.dataset.pageIndex) * BINDER_PAGE;
    setPageVars(el, pageLookVars(look, binderCardsOf(start, start + BINDER_PAGE), all));
  });
  binderEditor?.refresh();
  if (look.color === COLOR_FROM_CARDS || binderEditor?.isOpen()) refineArt(all, paintBinderLook);
}

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function saveBinderLook(look) {
  const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ binderLook: look }) });
  if (data?.user) cloudUser = data.user;
  if (cloudUser && !("binderLook" in cloudUser)) cloudUser.binderLook = look;
  renderHeader();
}

const editionAttempts = new Map(); // edition id -> requestId kept while a retry is possible
async function buyBinderEdition(editionId) {
  const requestId = editionAttempts.get(editionId) || makeRequestId();
  editionAttempts.set(editionId, requestId);
  try {
    const res = await api("/api/binder/editions/buy", { method: "POST", body: JSON.stringify({ editionId, requestId }) });
    editionAttempts.delete(editionId);
    if (typeof res?.coins === "number") {
      state.coins = res.coins;
      saveState(state);
    }
    if (cloudUser && Array.isArray(res?.binderEditions)) cloudUser.binderEditions = res.binderEditions;
    renderHeader();
  } catch (err) {
    if (err instanceof ApiError) editionAttempts.delete(editionId); // answered: a retry is a new purchase
    if (err instanceof ApiError && err.status === 409) {
      // "Already yours": a purchase whose answer got lost. Take the account's word for what it owns.
      try {
        const me = await api("/api/me");
        if (me?.user) cloudUser = me.user;
        renderHeader();
        if (cloudUser?.binderEditions?.includes(editionId)) return;
      } catch {
        /* fall through to the original refusal */
      }
    }
    throw err;
  }
}

function binderPageHtml(page) {
  const start = page * BINDER_PAGE;
  const pockets = Array.from({ length: BINDER_PAGE }, (_, i) => binderPocket(start + i)).join("");
  const shared = (activeTrainer()?.binderPages || []).includes(page);
  const empty = !(state.binder || []).slice(start, start + BINDER_PAGE).some(Boolean);
  const own = pageLookVars(binderLookNow(), binderCardsOf(start, start + BINDER_PAGE), binderCardsOf());
  return `<div class="binder-page" data-page-index="${page}"${pageStyleAttr(own)}>
    <div class="binder-page-toolbar"><span>Page ${page + 1}</span>
      <button type="button" class="ghost page-share" data-share-page="${page}" aria-pressed="${shared}" ${empty && !shared ? "disabled" : ""}>
        ${shared ? "Remove from profile" : "Display on profile"}
      </button></div>
    <div class="binder-pockets">${pockets}</div>
  </div>`;
}

/** Owned copies not already on show. The picker (js/card-picker.js) orders and filters them. */
function binderCandidates() {
  const out = [];
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (!count) continue;
    const card = findCard(id);
    if (!card) continue;
    const spare = spareFor(state, id);
    if (spare > 0) out.push({ card, spare });
  }
  return out;
}

/** The binder's "Choose a card": search, set / rarity / type filters and a sort over the spare cards. */
const cardPicker = createCardPicker({
  esc,
  coinAmount,
  renderFace: (card) => tcgFace(card, { small: true, stamp: false, lazy: true }),
  windowFaces: (holders, cards, root) =>
    windowFaces("picker", holders, cards, (card) => tcgFace(card, { small: true, stamp: false, lazy: true }), root),
  setOf: (card) => setForCard(card),
  rarityLabel: (rarity) => RARITY_LABEL[rarity] || rarity,
  rarityRank: (rarity) => RARITY_ORDER.indexOf(rarity),
  value: (card) => sellValue(card),
  // A phone's keyboard would cover the grid the moment the sheet opens; a laptop's would not.
  canFocus: () => matchMedia("(hover: hover) and (pointer: fine)").matches,
});

function binderPickerHtml(options) {
  return binderPicking == null ? "" : cardPicker.html(options);
}

/*
 * A pocket can hold a card from a set whose file has not been fetched yet (only
 * the open set loads at first; the rest arrive in the background). Fetch those
 * sets and draw the binder again, once per set, so a fresh visit does not show
 * owned cards as empty pockets until something else repaints the page.
 */
const binderSetsAsked = new Set();
function loadBinderSets() {
  const sets = new Set();
  for (const slot of state.binder || []) {
    if (!slot || findCard(slot.id)) continue;
    const set = setForCardId(slot.id);
    if (set?.dataFile && !binderSetsAsked.has(set.id)) sets.add(set);
  }
  if (!sets.size) return;
  for (const set of sets) binderSetsAsked.add(set.id);
  Promise.all([...sets].map((set) => loadSetData(set).catch(() => null))).then(() => {
    if (view === "binder") renderBinder();
  });
}

function renderBinder() {
  if (!els.binderBody) return;
  if (!activeTrainer()) {
    if (els.binderCount) els.binderCount.textContent = "Sign in to keep a binder";
    els.binderBody.innerHTML = accountGateHtml("binder");
    if (els.binderCustomise) els.binderCustomise.hidden = true;
    binderEditor?.close();
    return;
  }
  if (els.binderCustomise) els.binderCustomise.hidden = false;
  if (reconcileBinder(state)) saveState(state);
  loadBinderSets();

  const pages = binderPageCount();
  binderSpread = Math.min(binderSpread, Math.max(0, pages - 2));
  const left = binderSpread;
  const right = binderSpread + 1;
  const shown = (state.binder || []).filter(Boolean).length;

  if (els.binderCount) {
    const worth = money(
      (state.binder || []).reduce((sum, slot) => {
        const card = slot && findCard(slot.id);
        return card ? sum + sellValue(card) : sum;
      }, 0)
    );
    els.binderCount.innerHTML = shown
      ? `${shown} card${shown === 1 ? "" : "s"} on show, worth <b class="binder-worth">${coinAmount(worth)}</b>`
      : "Tap a pocket to put a card on show.";
  }

  const typing = binderPicking == null ? null : cardPicker.typing(els.binderBody); // a redraw must not drop a search being typed
  const options = binderPicking == null ? [] : binderCandidates();
  const onProfile = (activeTrainer()?.binderPages || []).length;
  const room = roomLine("pages", activeTrainer() ? unlockOf(activeTrainer()) : undefined, onProfile, PROFILE_PAGE_LIMIT);
  // The page controls sit over the binder on a laptop, beside the profile line;
  // on a phone, where the leaves stack, css moves them under it.
  els.binderBody.innerHTML = `
    <p class="binder-sharing-note">${onProfile} of ${room.cap} pages on your profile.${room.more}</p>
    <div class="binder-nav">
      <button type="button" class="ghost" data-flip="-1" ${left === 0 ? "disabled" : ""}>Back</button>
      <span>${right < pages ? `Pages ${left + 1} and ${right + 1}` : `Page ${left + 1}`} of ${pages}</span>
      <button type="button" class="ghost" data-flip="1" ${right >= pages - 1 ? "disabled" : ""}>Next</button>
    </div>
    ${binderObjectHtml({
      innerHtml: `<div class="binder-spread">
        ${binderPageHtml(left)}
        ${right < pages ? binderPageHtml(right) : ""}
      </div>`,
      resolved: binderResolved(binderLookNow(), binderCardsOf()),
    })}
    ${binderPickerHtml(options)}`;
  if (binderPicking != null) {
    cardPicker.mount(els.binderBody);
    cardPicker.restoreTyping(els.binderBody, typing);
  }
  binderEditor?.refresh();
  if (binderLookNow().color === COLOR_FROM_CARDS || binderEditor?.isOpen()) refineArt(binderCardsOf(), paintBinderLook);
}

function renderCatalog() {
  const eras = erasWithSets();
  const queued = eras.reduce((total, block) => total + block.queued.length, 0);
  const summary = queued
    ? `<p class="catalog-summary"><b>${PLAYABLE_SETS.length}</b> sets are live and <b>${queued}</b> more are on the way.</p>`
    : `<p class="catalog-summary"><b>${PLAYABLE_SETS.length}</b> sets are live: every English set from Base Set to ${esc(eras[0]?.era || "today")}.</p>`;

  const blocks = eras
    .map((block) => {
      const live = block.live.map((set) => catalogSlot(set, { live: true })).join("");
      const rest = block.queued.map((set) => catalogSlot(set)).join("");
      const count = block.live.length + block.queued.length;
      const sets = `${count} set${count === 1 ? "" : "s"}`;
      const state = !block.queued.length
        ? sets
        : !block.live.length
          ? `${sets} on the way`
          : `${sets}, ${block.live.length} live`;
      return `<section class="era-block">
      <header class="era-head">
        <h3>${esc(eraTitle(block.era))}</h3>
        <p><span class="era-span">${esc(eraYears(block.sets))}</span> <span class="era-count">${state}</span></p>
      </header>
      <div class="wall-shelves catalog-wall">${live}${rest}</div>
    </section>`;
    })
    .join("");

  els.catalogEras.innerHTML = summary + blocks;
}

/* ---- Home / Account / Settings ------------------------------------------ */

const num = (n) => Number(n || 0).toLocaleString();
/* Coins are dollars: whole amounts read without cents (see js/money.js). */
const coin = coinText;

function completion() {
  const total = setCards.length || liveSet.totalCount || 0;
  const owned = setOwned();
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : 0 };
}

/** Per-set id index, built once per loaded list, so an owned-card lookup is a map hit and not a scan. */
const cardIndexes = new WeakMap();

function findCard(id) {
  if (byId[id]) return byId[id];
  for (const list of Object.values(setCache)) {
    if (!list) continue;
    let index = cardIndexes.get(list);
    if (!index || index.size !== list.length) {
      index = new Map(list.map((c) => [c.id, c]));
      cardIndexes.set(list, index);
    }
    const hit = index.get(id);
    if (hit) return hit;
  }
  return null;
}

function ownedReverse(id) {
  return (state.reverses?.[id] || 0) > 0;
}

/** Binder / inspect copies: reverse foil if this print was pulled as a reverse. */
function withOwnedFoil(card) {
  if (!card) return card;
  if (card.reverse) return card;
  if (!ownedReverse(card.id)) return card;
  const kind = setForCard(card)?.reverseFoil;
  return kind ? { ...card, reverse: true, reverseKind: kind } : { ...card, reverse: true };
}

/** The face a collection tile shows: raw copies decide the foil; a card held
    only as slabs shows a reverse face when every slab is a reverse print. */
function ownedFace(card) {
  if (rawQty(card.id) > 0) return withOwnedFoil(card);
  const slabs = slabsOf(card.id);
  if (slabs.length && slabs.every((slab) => slab.reverse)) {
    const kind = setForCard(card)?.reverseFoil;
    return kind ? { ...card, reverse: true, reverseKind: kind } : { ...card, reverse: true };
  }
  return card;
}

function inspectAttrs(card) {
  const rev = card.reverse ? ` data-reverse="1"` : "";
  return `data-inspect="${esc(card.id)}"${rev}${card.reverseKind ? ` data-reverse-kind="${esc(card.reverseKind)}"` : ""}`;
}

function historyCards(entries, limit) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const card = findCard(entry.id);
      if (!card) return null;
      return entry.reverse ? { ...card, reverse: true } : card;
    })
    .filter(Boolean)
    .slice(0, limit);
}

function miniCardRow(cards, emptyNote, rowClass = "") {
  if (!cards.length) return `<p class="panel-empty">${esc(emptyNote)}</p>`;
  return `<div class="mini-row ${rowClass}">${cards
    .map(
      (card) => `<button type="button" class="mini-card" ${inspectAttrs(card)}
      title="${esc(card.name)}" aria-label="${esc(card.name)}">${tcgFace(card, { small: true })}</button>`
    )
    .join("")}</div>`;
}

function ownedInSet(set) {
  return Object.entries(ownedMapNow()).reduce(
    (n, [id, count]) => n + (count > 0 && homeSetId(id) === set.id ? 1 : 0),
    0
  );
}

/** Pull-table key → short label for the odds strip. */
const ODDS_LABELS = {
  double: "Double rare",
  ultra: "Ultra rare",
  ir: "Illustration",
  sir: "Special art",
  hyper: "Gold",
};

/**
 * Odds read straight off the set's own slot tables, so a set with different
 * pull rates shows its own numbers instead of the live set's. These used to be
 * a hardcoded list, which quietly showed Pitch Black's rates for every set.
 */
function packOdds(set) {
  const out = [];
  for (const slot of set.slots || []) {
    for (const [key, weight] of slot.table || []) {
      const label = ODDS_LABELS[key];
      if (!label || !weight) continue;
      out.push([label, `1/${Math.round(1 / weight)}`, weight]);
    }
  }
  return out.sort((a, b) => b[2] - a[2]);
}

/** Real market value of everything owned from one set, plus its best card. */
function binderValue(set) {
  let value = 0;
  let copies = 0;
  let best = null;
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (!count || homeSetId(id) !== set.id) continue;
    const card = findCard(id);
    if (!card) continue;
    const each = sellValue(card);
    value += each * count;
    copies += count;
    if (!best || each > best.each) best = { card, each };
  }
  for (const slab of state.graded || []) {
    if (homeSetId(slab.cardId) !== set.id) continue;
    const card = findCard(slab.cardId);
    if (!card) continue;
    const each = Number(slab.value) > 0 ? Number(slab.value) : sellValue(card);
    value += each;
    copies += 1;
    if (!best || each > best.each) best = { card, each };
  }
  return { value: money(value), copies, best };
}

/**
 * Market value of the whole collection, across every set whose data is loaded.
 * `loadAllSets()` pulls the rest in after first paint so this is a true total
 * rather than just the set you happen to be looking at.
 */
function totalBinderValue() {
  let value = 0;
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (!count) continue;
    const card = findCard(id);
    if (card) value += sellValue(card) * count;
  }
  for (const slab of state.graded || []) {
    const card = findCard(slab.cardId);
    if (card) value += Number(slab.value) > 0 ? Number(slab.value) : sellValue(card);
  }
  return money(value);
}

function netWorth() {
  return money(state.coins + totalBinderValue());
}

/**
 * Sample net worth into the save. Called after anything that moves money:
 * ripping, selling, claiming. A save from before this existed has no `granted`
 * baseline, so it starts at break-even here instead of inventing a past.
 */
function trackWorth() {
  if (!allSetsLoaded) return;
  const worth = netWorth();
  if (state.granted == null) state.granted = worth;
  logWorth(state, worth);
  saveState(state);
}

/**
 * The most valuable card in the pull history, for the home feature slot.
 * Value beats rarity here — a cheap Special Illustration Rare shouldn't outrank
 * an expensive Ultra Rare when the whole site runs on real prices.
 * (Distinct from bestPull(), which ranks the current pack by rarity.)
 */
function bestHistoryPull() {
  let best = null;
  for (const entry of state.history || []) {
    const found = findCard(entry.id);
    if (!found) continue;
    const card = entry.reverse ? { ...found, reverse: true } : found;
    const worth = sellValue(card);
    if (!best || worth > best.worth) best = { card, entry, worth };
  }
  return best;
}

/** The priciest cards in the loaded set, for the market board. */
function topByValue(limit = 5) {
  return [...setCards]
    .filter((card) => !card.energy && typeof card.market === "number")
    .sort((a, b) => sellValue(b) - sellValue(a))
    .slice(0, limit);
}

function setForCardId(id) {
  if (!id) return null;
  return (
    PLAYABLE_SETS.slice()
      .sort((a, b) => b.id.length - a.id.length)
      .find((set) => id === set.id || id.startsWith(`${set.id}-`)) || null
  );
}

function allCatalogCards() {
  const seen = new Set();
  const out = [];
  for (const list of Object.values(setCache)) {
    if (!Array.isArray(list)) continue;
    for (const card of list) {
      if (!card?.id || card.energy || seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

function topCardsOnSite(limit = 8) {
  return allCatalogCards()
    .filter((card) => typeof card.market === "number")
    .sort((a, b) => sellValue(b) - sellValue(a))
    .slice(0, limit);
}

function cheapestPackCost() {
  const costs = PLAYABLE_SETS.map((set) => Number(set.cost)).filter((n) => n > 0);
  return costs.length ? Math.min(...costs) : liveSet.cost;
}

/** "July 17, 2026" reads as "July 2026" under the set name; the day is noise there. */
function releaseMonth(set) {
  return String(set?.released || "").replace(/\s+\d{1,2},\s*/, " ").trim();
}

/** The pack wall behind the counter: the newest sets, less the one standing on the counter. */
function wallSets(limit = 9) {
  return PLAYABLE_SETS.filter((set) => !set.promoSet && set.wrappers?.length && set.id !== liveSet.id).slice(0, limit);
}

/** A wrapper picture that waits until it is near the screen. */
function lazyPackPicture(wrap, set) {
  return packPicture(wrap, "", set).replace("<img ", '<img loading="lazy" decoding="async" ');
}

/** A wrapper picture whose name is said by the control around it. */
function quietPackPicture(wrap, set, lazy = false) {
  return (lazy ? lazyPackPicture(wrap, set) : packPicture(wrap, "", set)).replace(/ alt="[^"]*"/, ' alt=""');
}

/** The wrapper on the counter and in the rip buttons: the one picked in the display box, else the set's first. */
function chosenWrapper(set = liveSet) {
  return set.wrappers?.includes(activeWrapper) ? activeWrapper : set.wrappers?.[0];
}

/** The price gun's orange sticker, for packs and sealed product. */
function priceSticker(value, { each = false, cls = "" } = {}) {
  return `<span class="price-sticker${cls ? ` ${cls}` : ""}">${coin(value)} <small>coins${each ? " each" : ""}</small></span>`;
}

/* A set's name is the shop's sign. Lines break where the browser balances
   them; only a word too long for its column brings the size down. js
   measures the widest word in em (--name-em) and the CSS stops the size where
   that word would meet the column's edge. Widths are cached once the display
   font is really in. */
const titleWidths = new Map();
function titleWidthEm(host, text) {
  if (titleWidths.has(text)) return titleWidths.get(text);
  const probe = document.createElement("span");
  probe.textContent = text;
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:100px;pointer-events:none";
  host.appendChild(probe);
  const em = probe.getBoundingClientRect().width / 100 || text.length * 0.5;
  probe.remove();
  if (document.fonts?.check?.('800 100px "Bricolage Grotesque"')) titleWidths.set(text, em);
  return em;
}
function paintSign(host, name) {
  if (!host) return;
  if (host.textContent !== name) host.textContent = name;
  const words = String(name).split(/\s+/).filter(Boolean);
  host.style.setProperty("--name-em", Math.max(1, ...words.map((word) => titleWidthEm(host, word))).toFixed(3));
}

/** "10 cards and a basic Energy a pack, at the printed pull rates.", from the set's own slots. */
function packLine(set) {
  if (set.promoSet || !set.packSize) return "No boosters here. Each promo comes in its box.";
  const energy = (set.slots || []).filter((slot) => slot.pool === "energy").reduce((n, slot) => n + (slot.count || 1), 0);
  const tail = energy === 1 ? " and a basic Energy" : energy > 1 ? ` and ${energy} Energy` : "";
  return `${set.packSize - energy} cards${tail} a pack, at the printed pull rates.`;
}

/**
 * The glass case: cards standing in top-loaders on a glass shelf, a white
 * price tag clipped to each. A card opens the inspector; `line` writes the
 * caption under its name.
 */
function caseHtml(list, line) {
  return list
    .map((card) => {
      const price = coin(sellValue(card));
      return `<li class="loader">
        <button type="button" class="loader-card" ${inspectAttrs(card)} aria-label="${esc(card.name)}, ${price} coins">
          ${tcgFace(card, { small: true, stamp: false, lazy: true })}
        </button>
        <span class="price-tag loader-tag" aria-hidden="true">${price}</span>
        <p class="loader-cap"><b>${esc(card.name)}</b>${esc(line(card))}</p>
      </li>`;
    })
    .join("");
}

/**
 * The checklist slip lying on the counter: a box for each card in the set,
 * ticked once it is in the binder. The slip opens the set's collection page.
 */
function checklistSlip(set) {
  const trainer = activeTrainer();
  const list = setCards.filter((card) => !card.energy);
  const total = set.totalCount || list.length;
  const owned = setOwned();
  const cols = Math.max(20, Math.min(40, Math.round(Math.sqrt(list.length * 6))));
  const boxes = list.map((card) => (ownedQty(card.id) > 0 ? '<i class="on"></i>' : "<i></i>")).join("");
  return `<a class="checklist-slip" href="/bulk" aria-label="${esc(set.name)} checklist, ${num(owned)} of ${num(total)} found">
    <span class="slip-head"><b>${esc(set.name)} checklist</b>${trainer ? `<span>${esc(trainer.name)}</span>` : ""}</span>
    ${boxes ? `<span class="slip-boxes" style="--cols:${cols}" aria-hidden="true">${boxes}</span>` : ""}
    <span class="slip-count">${num(owned)} of ${num(total)} found</span>
  </a>`;
}

/* The pack on the counter rises into place only when the player brings
   another set over from the wall; renderHome() also runs after a rip, a sale
   or a chat line, and nothing should move then. */
let homeStageKey = "";
let homeWallSet = "";

function renderHome() {
  const set = liveSet;
  const wrap = chosenWrapper(set);
  const signed = Boolean(activeTrainer());

  paintSign(document.getElementById("home-title"), set.name);
  const meta = document.getElementById("home-meta");
  if (meta) {
    meta.textContent = [set.era || set.edition, releaseMonth(set), set.totalCount ? `${num(set.totalCount)} cards` : ""]
      .filter(Boolean)
      .join(", ");
  }
  const lede = document.getElementById("home-lede");
  if (lede) lede.textContent = packLine(set);
  const rip = document.getElementById("home-rip");
  if (rip) rip.textContent = set.promoSet ? `Shop ${set.name}` : "Rip a pack";
  const choose = document.getElementById("home-choose");
  if (choose) {
    choose.href = `/packs/${set.id}`;
    choose.textContent = set.wrappers.length > 1 ? "Choose a wrapper" : "Pull rates and boxes";
    choose.hidden = Boolean(set.promoSet);
  }

  // The featured pack stands forward on the counter with the price gun's
  // sticker on it. A promo set has no boosters: its top promo stands there
  // in a top-loader instead.
  const stage = document.getElementById("home-stage");
  const key = `${set.id}/${wrap?.id || ""}`;
  if (stage && (key !== homeStageKey || !stage.childElementCount)) {
    const moved = Boolean(homeStageKey) && !homeStageKey.startsWith(`${set.id}/`);
    homeStageKey = key;
    const card = wrap ? null : set.heroIds.map((id) => byId[id]).find(Boolean);
    stage.innerHTML = wrap
      ? `<button type="button" class="counter-pack${moved ? " is-new" : ""}" aria-label="Rip a ${esc(set.name)} pack, ${coin(set.cost)} coins">
          ${quietPackPicture(wrap, set)}${priceSticker(set.cost, { cls: "counter-gun" })}
        </button>`
      : card
        ? `<div class="counter-loader${moved ? " is-new" : ""}" aria-hidden="true">${tcgFace(card, { small: true, stamp: false })}</div>`
        : "";
  }

  const wall = document.getElementById("home-set-picker");
  if (wall && (homeWallSet !== set.id || !wall.childElementCount)) {
    homeWallSet = set.id;
    wall.innerHTML = `${wallSets()
      .map((item) => {
        const price = coin(item.cost);
        return `<div class="wall-slot">
          <button type="button" class="wall-pack" data-feature-set="${esc(item.id)}"
            aria-label="Put ${esc(item.name)} on the counter">${quietPackPicture(item.wrappers[0], item, true)}</button>
          <span class="shelf-chan"><a class="shelf-label" href="/packs/${esc(item.id)}" aria-label="${esc(item.name)}, ${price} coins a pack">
            <span class="shelf-name">${esc(item.name)}</span>
            <span class="shelf-row">
              <img class="shelf-code" src="${esc(setIdentity(item).symbol)}" alt="" width="28" height="14" loading="lazy" decoding="async" />
              <span class="shelf-price">${price}</span>
            </span>
          </a></span>
        </div>`;
      })
      .join("")}
      <div class="wall-slot wall-all">
        <span class="wall-pack" aria-hidden="true"></span>
        <span class="shelf-chan"><a class="shelf-label" href="/catalog">All ${PLAYABLE_SETS.length} sets</a></span>
      </div>`;
  }

  const countertop = document.getElementById("home-countertop");
  if (countertop) countertop.innerHTML = checklistSlip(set);

  // The glass case: the most valuable cards on the site.
  const top = topCardsOnSite(6);
  const caseBlock = top.length
    ? `<section class="glass-case home-case" aria-labelledby="home-case-h">
        <div class="case-in">
          <h2 class="case-h" id="home-case-h">In the case</h2>
          <p class="case-sub">The most valuable cards on the site, at market value in coins</p>
          <ul class="case-loaders">${caseHtml(top, (card) =>
            [rarityLine(card), setForCardId(card.id)?.name].filter(Boolean).join(", ")
          )}</ul>
        </div>
      </section>`
    : "";

  // The player's best pull and the latest ones, once there are any.
  const best = bestHistoryPull();
  const pullsBlock = best
    ? `<section class="home-block home-pulls" aria-labelledby="home-pulls-h">
        <div class="home-block-head">
          <h2 id="home-pulls-h">Your pulls</h2>
          <a class="text-btn" href="/bulk">Collection</a>
        </div>
        <div class="home-pulls-row">
          <article class="home-hit">
            <button type="button" class="home-hit-art" ${inspectAttrs(best.card)}
              aria-label="${esc(best.card.name)}">${tcgFace(best.card, { small: true, stamp: false })}</button>
            <div class="home-hit-copy">
              <p class="home-hit-label">Best pull so far</p>
              <h3>${esc(best.card.name)}</h3>
              <p>${rarityPips(best.card.rarity)} ${esc(rarityLine(best.card))}</p>
              ${best.entry?.at ? `<p>Pulled ${esc(formatWhen(best.entry.at))}</p>` : ""}
              <span class="price-tag tilt">${coin(sellValue(best.card))}<span class="sr-only"> coins</span></span>
            </div>
          </article>
          <div class="home-strip">
            <p class="home-strip-label">Just pulled</p>
            ${miniCardRow(historyCards(state.history, 8), "", "home-film")}
          </div>
        </div>
      </section>`
    : "";

  // Net worth: one sentence, and the chart once there is a history to draw.
  const binder = totalBinderValue();
  const charted = (state.worthLog || []).length >= 2;
  const worthBlock = signed
    ? `<section class="home-block home-networth" aria-labelledby="home-worth-h">
        <div class="home-block-head">
          <h2 id="home-worth-h">Net worth</h2>
          <a class="text-btn" href="/binder">Binder</a>
        </div>
        <p class="home-worth-line">${
          binder
            ? `Your binder is worth ${coinAmount(binder)}, and with your coins that's ${coinAmount(netWorth())}.`
            : `Nothing in your binder yet, and packs start at ${coinAmount(cheapestPackCost())}.`
        }</p>
        ${charted ? `<div class="home-worth-chart" id="home-worth-chart"></div>` : ""}
      </section>`
    : "";

  const eras = erasWithSets();
  const queued = eras.reduce((n, era) => n + era.queued.length, 0);
  const upcoming = eras.find((era) => era.queued.length)?.queued.slice(0, 4) || [];
  const nextBlock = queued
    ? `<section class="home-block home-next" aria-labelledby="home-next-h">
        <div class="home-block-head">
          <h2 id="home-next-h">Coming next</h2>
          <a class="text-btn" href="/catalog">Full catalog</a>
        </div>
        <p class="home-road">${upcoming.map((item) => esc(item.name)).join(", ")}${
          queued > upcoming.length ? `, and ${queued - upcoming.length} more queued` : ""
        }.</p>
      </section>`
    : "";

  els.homeBody.innerHTML = `${caseBlock}${pullsBlock}${worthBlock}${nextBlock}`;
  const worthChart = els.homeBody.querySelector("#home-worth-chart");
  if (worthChart) renderWorthChart(worthChart, state.worthLog, state.granted);
}

function formatWhen(ts) {
  const t = Number(ts) || 0;
  if (!t) return "Earlier";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Month and year a trainer signed up — a stat tile has no room for a full date. */
function joinedOn(ts) {
  const t = Number(ts) || 0;
  if (!t) return "Unknown";
  return new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function uniqueOwned() {
  return Object.values(ownedMapNow()).filter((n) => n > 0).length;
}

function reverseOwned() {
  return Object.values(state.reverses || {}).reduce((n, count) => n + (count > 0 ? count : 0), 0);
}

function guestHasProgress() {
  const save = pendingClaim || (activeTrainer() ? null : state);
  if (!save) return false;
  const owned = Object.values(save.collection || {}).some((n) => n > 0);
  return save.packsOpened > 0 || owned || save.coins !== STARTING_COINS || Boolean(save.lastDaily);
}

function setCompletionRows() {
  const perSet = ownedPerSet(ownedMapNow());
  return PLAYABLE_SETS.map((set) => {
    const owned = perSet.get(set.id) || 0;
    const total = set.totalCount || 1;
    return { set, owned, total, pct: Math.round((owned / total) * 100) };
  });
}

function ownedRarities() {
  const counts = {};
  for (const [id, n] of Object.entries(ownedMapNow())) {
    if (!n) continue;
    const card = findCard(id);
    if (!card) continue;
    tallyRarity(counts, { ...card, id: card.id || id });
  }
  return counts;
}

/** Progress context shared by the badge wall, the title picker, and the hero. */
function achieveCtx() {
  return achievementContext(state, { signed: Boolean(activeTrainer()), rarities: ownedRarities(), findCard });
}

function claimedIds() {
  return new Set(Array.isArray(state.claimed) ? state.claimed : []);
}

/**
 * One pass over the table for everything the account page needs to say about
 * achievements: what is done, what is banked, and what is sitting unclaimed.
 */
function achievementStats() {
  const ctx = achieveCtx();
  const claimed = claimedIds();
  const ready = readyToClaim(ctx, claimed);
  const done = ACHIEVEMENTS.filter((row) => claimed.has(row.id) || isAchievementDone(row, ctx)).length;
  const banked = ACHIEVEMENTS.reduce((n, row) => n + (claimed.has(row.id) ? row.coins : 0), 0);
  return {
    ctx,
    claimed,
    ready,
    done,
    banked,
    waiting: claimTotal(ready),
    total: ACHIEVEMENTS.length,
    pct: Math.round((claimed.size / ACHIEVEMENTS.length) * 100),
    setRows: setCompletionRows(),
  };
}

/* ---- The quest area (js/quest-area.js draws it; this file owns state and events) ---- */

const SET_BY_ID = new Map(PLAYABLE_SETS.map((set) => [set.id, set]));

/** A chest's bonus: the Worker sends it with the summary; the shared rules compute the same number. */
function chestCoins(period, rows, summary) {
  return summary?.chestCoins?.[period] ?? questRules.chestFor(period, rows).coins;
}

const areaDeps = {
  esc,
  num,
  setIdentity,
  eraTitle,
  sets: PLAYABLE_SETS,
  setById: (id) => SET_BY_ID.get(id) || null,
  rows: ACHIEVEMENTS,
  categories: ACH_CATEGORIES,
  achievementProgress,
  achievementFace,
  achievementById,
  isSecret,
  achievementsBySet,
  masteryRowFor,
  masteryEmblem,
  gearArt: (kind, id) => levelDeps.gearArt(kind, id), // levelDeps is declared further down; called lazily
  masteryBannerId,
  bannerVars,
  questRow: questRules.questById,
  chestCoins,
  chestRow: (period, rows) => questRules.chestFor(period, rows),
};

function colorPicks(selected, attr = "data-color", label = "Avatar colour") {
  return `<div class="color-picks" role="radiogroup" aria-label="${esc(label)}">${AVATAR_COLORS.map(
    (c) => `<button type="button" role="radio" aria-checked="${c.id === selected}" class="color-pick${c.id === selected ? " on" : ""}" ${attr}="${esc(c.id)}" style="--swatch:${esc(c.hex)}" title="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`
  ).join("")}</div>`;
}

function avatarMark(trainer, extraClass = "trainer-mark") {
  const color = avatarColor(trainer?.color);
  const pixel = avatarStyle(trainer?.avatarStyle) === "pixel" ? " pixel" : "";
  const mark = `<div class="${extraClass}${pixel}" style="--avatar:${esc(color.hex)}"><img src="${esc(avatarSrc(trainer?.avatar, trainer?.avatarStyle))}" alt="" /></div>`;
  const frame = userFrame(trainer);
  return frame ? frameHtml(mark, frame, { size: "xl", color: color.hex }) : mark;
}

/** The one line under the trainer's name: what they hold. The rest of the career lives on the Overview tab. */
function careerLine() {
  const cards = uniqueOwned();
  const binder = totalBinderValue();
  // The comma before "and" keeps "worth" on the cards, not on the coins.
  return `Holding ${coinAmount(state.coins)}, and ${num(cards)} different ${cards === 1 ? "card" : "cards"}${binder ? ` worth ${coinAmount(binder)}` : ""}.`;
}

/** The career as a ledger of rows between hairlines (Overview), not a row of big numbers. */
function careerLedger() {
  const worth = netWorth();
  const pnl = state.granted == null ? null : money(worth - state.granted);
  const dir = pnl == null || Math.abs(pnl) < 0.005 ? "flat" : pnl > 0 ? "up" : "down";
  const rows = [
    ["Packs ripped", num(state.packsOpened)],
    ["Cards pulled", num(state.pulls)],
    ["Different cards", num(uniqueOwned())],
    ["Reverse holos", num(reverseOwned())],
  ];
  // The label says which way, so the amount carries no sign.
  if (pnl != null) rows.push([dir === "down" ? "Down overall" : dir === "up" ? "Up overall" : "Break even", coinAmount(Math.abs(pnl)), dir]);
  return `<dl class="acct-ledger">${rows
    .map(([label, value, cls]) => `<div${cls ? ` class="${cls}"` : ""}><dt>${esc(label)}</dt><dd>${value}</dd></div>`)
    .join("")}</dl>`;
}

function busyPack() {
  if (packPhase !== "idle") {
    toast("Finish this pack first.");
    return true;
  }
  return false;
}

function openAuth(tab) {
  if (busyPack()) return;
  if (view === "battles") battleReturnPath = battlePath;
  if (view === "casino") casinoReturnPath = casinoPath;
  authTab = tab === "signin" ? "signin" : tab === "signup" ? "signup" : "signup";
  setView("auth");
}

function returnAfterAuth() {
  if (casinoReturnPath) {
    casinoPath = casinoReturnPath;
    casinoReturnPath = "";
    setView("casino");
  } else if (battleReturnPath) {
    battlePath = battleReturnPath;
    battleReturnPath = "";
    setView("battles");
  } else setView("account");
}

async function hydrateAfterAccountChange() {
  applySettings();
  await activateSet(state.activeSetId || DEFAULT_SET_ID, true);
  renderHeader();
  scheduleDailyTick();
  renderShop();
  renderCollection();
  renderBinder();
  if (view === "home") renderHome();
  if (view === "account") renderAccount();
  if (view === "profile") renderProfile();
  if (view === "social") renderSocial();
  if (view === "auth") renderAuth();
  if (view === "settings") renderSettings();
  if (view === "notes") renderNotes();
  notifySignedIn();
}

function renderAuth() {
  const signed = activeTrainer();
  const keepDefault = !signed && guestHasProgress();
  const signin = authTab === "signin";
  const signupForm = `
    <form id="signup-form" class="auth-form" autocomplete="on">
      <label class="field">
        <span>Trainer name</span>
        <input name="name" minlength="2" maxlength="24" required placeholder="Ash Ketchum" autocomplete="nickname" />
      </label>
      <label class="field">
        <span>Handle</span>
        <span class="field-at"><input name="handle" minlength="3" maxlength="16" required placeholder="ripper" autocapitalize="off" spellcheck="false" autocomplete="username" /></span>
        <span class="hint">3 to 16 letters, numbers or underscores.</span>
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="password" minlength="6" maxlength="64" required placeholder="At least 6 characters" autocomplete="new-password" />
      </label>
      <div class="field">
        <span>Avatar colour</span>
        ${colorPicks(signupColor, "data-signup-color")}
      </div>
      ${
        keepDefault
          ? `<label class="check-row"><input type="checkbox" name="keep" checked /> Bring the packs and cards already on this browser</label>`
          : ""
      }
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="solid" type="submit">Create account</button>
    </form>`;

  const signinForm = `<form id="signin-form" class="auth-form" autocomplete="on">
      <label class="field">
        <span>Handle</span>
        <span class="field-at"><input name="handle" maxlength="16" required placeholder="ripper" autocapitalize="off" spellcheck="false" autocomplete="username" /></span>
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="password" maxlength="64" required autocomplete="current-password" />
      </label>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="solid" type="submit">Sign in</button>
    </form>`;

  els.authBody.innerHTML = `
    <div class="auth-page">
      <div class="auth-copy">
        <img class="auth-mark" src="assets/mark.png?v=35" width="256" height="256" alt="" />
        <h1>${signin ? "Welcome back" : "Make a trainer"}</h1>
        <p class="lede">${
          signin
            ? "Sign in with your handle to pick up your cards, coins and binder."
            : "Your cards, coins and binder live on your account, so they follow you to any device. No email needed."
        }</p>
      </div>
      <div class="auth-card">
        <div class="auth-tabs" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected="${signin}" class="auth-tab${signin ? " on" : ""}" data-auth-tab="signin">Sign in</button>
          <button type="button" role="tab" aria-selected="${!signin}" class="auth-tab${signin ? "" : " on"}" data-auth-tab="signup">Create account</button>
        </div>
        ${signin ? signinForm : signupForm}
      </div>
      <div class="auth-foot">
        ${
          signed
            ? `<button class="text-btn auth-guest" type="button" data-goto="account">Back to your account</button>`
            : `<button class="text-btn auth-guest" type="button" data-continue-guest>Keep browsing without an account</button>`
        }
        <ul class="auth-points">
          <li>Home, Packs and the Catalog are open to everyone.</li>
          <li>Opening packs, hourly coins, selling and the binder need an account.</li>
        </ul>
      </div>
    </div>`;
}

const ACCOUNT_TABS = [
  { id: "overview", name: "Overview", note: "Career, sets, and what you pulled." },
  { id: "levels", name: "Levels", note: "Your level, the road ahead and where your XP comes from." },
  { id: "quests", name: "Quests", note: "Daily, weekly and monthly coin rewards." },
  { id: "achievements", name: "Achievements", note: "Badges, secrets, rewards and titles." },
  { id: "mastery", name: "Mastery", note: "Complete a set for a title, an emblem and a banner." },
  { id: "profile", name: "Profile", note: "Name, bio, and what the public sees." },
  { id: "look", name: "Look", note: "Avatar, banner, and title." },
  { id: "layout", name: "Layout", note: "Room colour, backdrop and the sections of your public profile." },
  { id: "security", name: "Security", note: "Password and deleting the account." },
];

/** Word rows scroll sideways on a phone: bring the chosen word into view, sideways only. */
function bringIntoView(el) {
  const track = el.parentElement;
  if (!track || track.scrollWidth <= track.clientWidth) return;
  track.scrollLeft = Math.max(0, el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2);
}

/** The little count on a tab: things waiting to be claimed there. */
function tabDot(id, stats) {
  const n =
    id === "achievements"
      ? stats.ready.length
      : id === "quests"
        ? questArea.questReadyCount(state.quests, areaDeps)
        : id === "levels"
          ? levelUi.levelsReadyCount(levelUi.xpOf(state))
          : 0;
  return n ? `<i class="acct-dot" aria-hidden="true">${n}</i><span class="sr-only">, ${n} ready to claim</span>` : "";
}

/** What has focus inside the account page, as an attribute and value that survive a repaint. */
const FOCUS_ATTRS = ["data-acct-tab", "data-ach-cat", "data-ach-filter", "data-mastery-era", "data-mastery-set", "data-claim", "data-quest-claim", "data-set-motion", "data-set-frame", "data-set-banner", "data-set-title", "data-claim-levels", "data-road-past", "data-prestige"];
function focusKey() {
  const el = document.activeElement;
  if (!el || el === document.body || !els.accountBody.contains(el)) return null;
  for (const attr of FOCUS_ATTRS) if (el.hasAttribute(attr)) return [attr, el.getAttribute(attr), el.classList[0] || ""];
  return el.id === "claim-all" ? ["id", "claim-all", el.classList[0] || ""] : null;
}

/** Repainting replaces every node, so put focus back on the same control (or its closest survivor). */
function restoreFocus(key) {
  if (!key) return;
  const [attr, value, cls] = key;
  // The same value can sit on two controls (a tab and a shortcut in the hero): take the one that looks alike.
  const matches = [...els.accountBody.querySelectorAll(attr === "id" ? `#${value}` : `[${attr}="${CSS.escape(value)}"]`)];
  const target =
    matches.find((el) => el.classList.contains(cls)) ||
    matches[0] ||
    // A claimed row's button is gone: land on the category or tab that holds it.
    els.accountBody.querySelector(".qa-word.on, .acct-tab.on");
  target?.focus({ preventScroll: true });
}

function renderAccount() {
  const focused = focusKey();
  renderAccountBody();
  restoreFocus(focused);
}

function renderAccountBody() {
  const trainer = activeTrainer();
  if (!trainer) {
    els.accountBody.innerHTML = signedOutAccount();
    return;
  }
  if (!ACCOUNT_TABS.some((tab) => tab.id === accountTab)) accountTab = "overview";
  const stats = achievementStats();
  const body =
    accountTab === "levels"
      ? levelsTab()
      : accountTab === "quests"
      ? questsTab()
      : accountTab === "achievements"
      ? achievementsTab(stats)
      : accountTab === "mastery"
      ? masteryTab(stats)
      : accountTab === "profile"
        ? profileTab(trainer)
        : accountTab === "look"
          ? lookTab(trainer, stats)
          : accountTab === "layout"
            ? profileEditor.layoutTab(trainer, layoutDeps())
          : accountTab === "security"
            ? securityTab(trainer)
            : overviewTab(trainer, stats);

  els.accountBody.innerHTML = `
    ${accountHero(trainer, stats)}
    <div class="acct-tabs" role="group" aria-label="Account sections">
      ${ACCOUNT_TABS.map(
        (tab) => `<button type="button" class="acct-tab${tab.id === accountTab ? " on" : ""}"
          aria-current="${tab.id === accountTab}" data-acct-tab="${esc(tab.id)}" title="${esc(tab.note)}">
          ${esc(tab.name)}${tabDot(tab.id, stats)}
        </button>`
      ).join("")}
    </div>
    <div class="acct-body">${body}</div>
    ${historyOpen ? historySheet() : ""}`;

  const chart = els.accountBody.querySelector("#acct-worth-chart");
  if (chart) renderWorthChart(chart, state.worthLog, state.granted);
  if (accountTab === "mastery") placeMasteryDetail();
  for (const on of els.accountBody.querySelectorAll(".acct-tabs .on, .qa-words:not(.qa-words-inline) .on")) bringIntoView(on);
  freshClaims = new Set();
  freshLevels = new Set();
}

function signedOutAccount() {
  const preview = ACHIEVEMENTS.filter((row) => !isSecret(row))
    .slice(0, 10)
    .map(
      (row) => `<article class="qa-tile t${row.tier} is-locked">
        ${questArea.miniMedal(row, 0, areaDeps).replace("qa-badge sm", "qa-badge")}
        <div class="qa-copy"><b>${esc(row.name)}</b><p>${esc(row.note)}</p></div>
        <div class="qa-side"><span class="qa-coin">${coinAmount(row.coins)}</span></div>
      </article>`
    )
    .join("");
  return `
    <header class="acct-hero signed-out">
      <div class="acct-hero-body">
        <img class="brand-logo lg" src="assets/mark.png?v=35" width="256" height="256" alt="" />
        <div class="acct-copy">
          <h1 class="acct-name">Make a trainer</h1>
          <p class="acct-meta">Your coins, cards, badges and binder live on your account, not in this browser.</p>
        </div>
        <div class="acct-hero-actions">
          <button class="solid" type="button" data-open-auth="signup">Create account</button>
          <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
        </div>
      </div>
    </header>
    <section class="acct-sec">
      <div class="acct-sec-head">
        <h2>${num(ACHIEVEMENTS.length)} badges to earn</h2>
      </div>
      <div class="qa-grid preview">${preview}</div>
    </section>`;
}

function accountHero(trainer, stats) {
  const ready = stats.ready.length;
  return `<header class="acct-hero">
    ${bannerBlockHtml(trainer.banner, { className: "acct-banner", eager: true })}
    <div class="acct-hero-body">
      ${avatarMark(trainer, "trainer-mark acct-face")}
      <div class="acct-copy">
        <h1 class="acct-name">${esc(trainer.name)}${levelBadgeHtml(trainer.level, { size: "xl", prestige: trainer.prestige })}</h1>
        <p class="acct-meta">
          <span class="account-handle">@${esc(trainer.handle)}</span>
          <span class="account-title">${esc(trainer.title || "Rookie")}</span>
          <span class="acct-code" title="Your trainer code">${esc(trainerCode(trainer.id))}</span>
          ${trainer.createdAt ? `<span>Joined ${esc(joinedOn(trainer.createdAt))}</span>` : ""}
        </p>
        <p class="acct-facts">${careerLine()}</p>
        ${questArea.masteryStripHtml(masterySetIds(state.claimed), areaDeps, { mine: true })}
        ${trainer.bio ? `<p class="account-bio">${esc(trainer.bio)}</p>` : ""}
      </div>
      <div class="acct-hero-actions">
        ${
          ready
            ? `<button class="solid claim-cta" type="button" data-acct-tab="achievements">Claim <span class="claim-amt">${coinAmount(stats.waiting)}</span></button>`
            : ""
        }
        <a class="ghost" href="/u/${esc(trainer.handle)}">Public profile</a>
        <button class="text-btn" type="button" id="copy-profile-link">Copy link</button>
        <button class="text-btn acct-signout" type="button" id="sign-out">Sign out</button>
      </div>
    </div>
  </header>`;
}

/* ---- Overview ----------------------------------------------------------- */

function setRingHtml(row) {
  const { symbol } = setIdentity(row.set);
  return `<button type="button" class="set-ring${row.pct >= 100 ? " done" : ""}" data-jump-set="${esc(row.set.id)}"
    title="Open ${esc(row.set.name)} collection">
    <img src="${esc(symbol)}" alt="" width="28" height="28" loading="lazy" decoding="async" />
    <span class="set-ring-copy">
      <b>${esc(row.set.name)}</b>
      <small>${num(row.owned)} of ${num(row.total)} cards</small>
    </span>
    <span class="set-ring-pct">${row.pct}%</span>
    <span class="qa-bar" aria-hidden="true"><i style="width:${row.pct}%"></i></span>
  </button>`;
}

/** Sets with a card in them first; the untouched ones fold away underneath. */
function setRings() {
  const rows = setCompletionRows();
  const started = rows.filter((row) => row.owned > 0);
  const rest = rows.filter((row) => row.owned < 1);
  const list = (items) => `<div class="set-rings">${items.map(setRingHtml).join("")}</div>`;
  return `${started.length ? list(started) : `<p class="panel-empty">Rip a pack to start filling your first set.</p>`}
    ${
      rest.length
        ? `<details class="set-rest"${started.length ? "" : " open"}>
            <summary>${num(rest.length)} ${rest.length === 1 ? "set" : "sets"} not started</summary>
            ${list(rest)}
          </details>`
        : ""
    }`;
}

function overviewTab(trainer, stats) {
  const history = state.history || [];
  const recent = historyCards(history, 8);
  const binder = totalBinderValue();
  // Secret rows never show up here; their progress would give the secret away.
  const nextUp = ACHIEVEMENTS.filter((row) => !isSecret(row) && !stats.claimed.has(row.id) && !isAchievementDone(row, stats.ctx))
    .map((row) => ({ row, p: achievementProgress(row, stats.ctx) }))
    .sort((a, b) => b.p.pct - a.p.pct || b.row.coins - a.row.coins)
    .slice(0, 3);

  return `<div class="acct-overview">
    <div class="acct-main">
      <section class="acct-sec acct-worth">
        <div class="acct-sec-head">
          <h2>Net worth</h2>
        </div>
        <p class="acct-worth-line">${
          binder
            ? `Your binder is worth ${coinAmount(binder)}, and with your coins that's ${coinAmount(netWorth())}.`
            : `Nothing in your binder yet, and with your coins that's ${coinAmount(netWorth())}.`
        }</p>
        <div class="acct-chart" id="acct-worth-chart"></div>
      </section>
      <section class="acct-sec acct-career">
        <div class="acct-sec-head">
          <h2>Career</h2>
        </div>
        ${careerLedger()}
      </section>
    </div>
    <section class="acct-sec acct-next">
      <div class="acct-sec-head">
        <h2>Closest badges</h2>
        <button class="text-btn" type="button" data-acct-tab="achievements">All ${num(stats.total)}</button>
      </div>
      ${
        nextUp.length
          ? `<ol class="next-list">${nextUp
              .map(
                ({ row, p }) => `<li class="next-row t${row.tier}">
                  ${questArea.miniMedal(row, p.pct, areaDeps)}
                  <div class="next-copy">
                    <div class="next-head"><b>${esc(row.name)}</b><span class="qa-coin">${coinAmount(row.coins)}</span></div>
                    <span class="qa-bar" aria-hidden="true"><i style="width:${p.pct}%"></i></span>
                    <small>${esc(row.note)} ${num(p.at)} of ${num(p.goal)} so far.${row.title ? ` Unlocks the ${esc(row.title)} title.` : ""}</small>
                  </div>
                </li>`
              )
              .join("")}</ol>`
          : `<p class="panel-empty">You've earned every badge.</p>`
      }
    </section>
    <section class="acct-sec acct-pulls">
      <div class="acct-sec-head">
        <h2>Pull history</h2>
        ${history.length ? `<button class="text-btn" type="button" id="open-history">See all ${num(history.length)}</button>` : ""}
      </div>
      ${
        recent.length
          ? `<div class="acct-pull-row">${recent
              .map(
                (card) => `<div class="pull-card">
                  <button type="button" class="mini-card" ${inspectAttrs(card)} title="${esc(card.name)}" aria-label="${esc(card.name)}">${tcgFace(card, { small: true })}</button>
                  <span class="price-tag tilt" aria-hidden="true">${coin(sellValue(card))}</span>
                </div>`
              )
              .join("")}</div>`
          : `<p class="panel-empty"><button class="text-btn" type="button" data-goto="shop">Rip a pack</button> to start your pull history.</p>`
      }
    </section>
    <section class="acct-sec acct-sets">
      <div class="acct-sec-head">
        <h2>Set completion</h2>
      </div>
      ${setRings()}
    </section>
  </div>`;
}

/* ---- Achievements ------------------------------------------------------- */

/** The wall keeps a claimed-this-session pulse and remembers which secrets it has already revealed. */
function achievementUi(stats) {
  const reveal = new Set();
  for (const row of ACHIEVEMENTS) {
    if (!isSecret(row) || seenSecrets.has(row.id)) continue;
    if (!stats.claimed.has(row.id) && isAchievementDone(row, stats.ctx)) {
      reveal.add(row.id);
      seenSecrets.add(row.id);
    }
  }
  return { cat: achCat, filter: achFilter, fresh: freshClaims, reveal };
}

function achievementsTab(stats) {
  const ui = achievementUi(stats);
  if (!ui.cat) {
    // First visit: open the category with something to claim, else the first.
    const ready = ACHIEVEMENTS.find((row) => stats.ready.includes(row.id));
    achCat = ui.cat = ready?.cat || ACH_CATEGORIES[0]?.id || "";
  }
  return questArea.achievementWallHtml(stats, ui, areaDeps);
}

/** The set shelf: eras as words, sets as flat tiles, the chosen one opens a panel underneath. */
function masteryTab(stats) {
  if (!masteryEra) masteryEra = PLAYABLE_SETS.find((set) => set.id === masterySet)?.era || PLAYABLE_SETS[0]?.era || "";
  return questArea.masteryShelfHtml(stats, { era: masteryEra, set: masterySet, fresh: freshClaims, reveal: new Set() }, areaDeps);
}

/**
 * The detail panel is drawn first in the markup; here it moves to sit under
 * the row of the chosen tile, whatever the current column count is.
 */
function placeMasteryDetail() {
  const panel = els.accountBody.querySelector(".qm-detail");
  const shelf = els.accountBody.querySelector(".qm-shelf");
  if (!panel || !shelf) return;
  const tiles = [...shelf.querySelectorAll(".qm-set")];
  const at = tiles.findIndex((tile) => tile.classList.contains("on"));
  if (at < 0) return;
  const cols = getComputedStyle(shelf).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  const last = Math.min(tiles.length - 1, (Math.floor(at / cols) + 1) * cols - 1);
  tiles[last].after(panel);
}

/* ---- Pull history sheet ------------------------------------------------- */

const HISTORY_FILTERS = [
  { id: "all", name: "Everything" },
  { id: "new", name: "First copies" },
  { id: "hits", name: "Hits" },
  { id: "reverse", name: "Reverse holos" },
];

function historySheet() {
  const all = state.history || [];
  const rows = all.filter((entry) => {
    if (historyFilter === "new") return entry.wasNew;
    if (historyFilter === "reverse") return entry.reverse;
    if (historyFilter === "hits") return isHit(entry);
    return true;
  });
  const worth = rows.reduce((n, entry) => {
    const card = findCard(entry.id);
    return n + (card ? sellValue(card) : 0);
  }, 0);

  const list = rows.length
    ? `<div class="pull-list">${rows
        .map((entry) => {
          const card = findCard(entry.id);
          const face = card
            ? `<button type="button" class="mini-card" ${inspectAttrs(entry.reverse ? { ...card, reverse: true } : card)}
                aria-label="${esc(entry.name)}">${tcgFace(entry.reverse ? { ...card, reverse: true } : card, { small: true, stamp: false, lazy: true })}</button>`
            : `<span class="mini-card ghost-card" aria-hidden="true"></span>`;
          const set = setForCardId(entry.id);
          return `<div class="pull-row">
            ${face}
            <div class="pull-copy">
              <b>${esc(entry.name)}</b>
              <span>${esc(RARITY_LABEL[entry.rarity] || entry.rarity || "Card")}${set ? ` &middot; ${esc(set.name)}` : ""}</span>
              <span class="pull-tags">
                ${entry.wasNew ? `<span class="tag new">New</span>` : ""}
                ${entry.reverse ? `<span class="tag rev">Reverse holo</span>` : ""}
              </span>
            </div>
            <div class="pull-end">
              <span class="pull-value">${card ? coinAmount(sellValue(card)) : "-"}</span>
              <time>${esc(formatWhen(entry.at))}</time>
            </div>
          </div>`;
        })
        .join("")}</div>`
    : `<p class="panel-empty">${
        all.length ? "No pulls match that filter. Try Everything." : "Rip a pack to start your pull history."
      }</p>`;

  return `<div class="sheet-backdrop" data-history-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="sheet-head">
        <div>
          <h2 id="history-title">Pull history</h2>
          <p>The last ${num(all.length)} cards off the top of a pack, newest first.</p>
        </div>
        <button class="ghost sm" type="button" data-history-close>Close</button>
      </div>
      <div class="sheet-filters">
        <div class="chip-row" role="group" aria-label="Filter pulls">
          ${HISTORY_FILTERS.map(
            (f) => `<button type="button" class="pick-chip${f.id === historyFilter ? " on" : ""}" data-history-filter="${esc(f.id)}" aria-pressed="${f.id === historyFilter}">${esc(f.name)}</button>`
          ).join("")}
        </div>
        <span class="sheet-total">${num(rows.length)} shown, worth <b>${coinAmount(worth)}</b></span>
      </div>
      <div class="sheet-body">${list}</div>
    </div>`;
}

/* ---- Profile ------------------------------------------------------------ */

function statLabel(key) {
  return { packs: "Packs ripped", pulls: "Cards pulled", unique: "Unique cards", coins: "Coins" }[key] || key;
}

function profileTab(trainer) {
  const shown = new Set(trainer.shownStats || DEFAULT_STATS);
  const showcase = trainer.showcase || [];
  const pinned = showcase
    .map((slot) => {
      const card = findCard(slot.id);
      if (!card) return "";
      const face = tcgFace(slot.reverse ? { ...card, reverse: true } : card, { small: true, stamp: false, lazy: true });
      return `<div class="pin-slot">
        <button type="button" class="mini-card" ${inspectAttrs(card)} aria-label="${esc(card.name)}">${face}</button>
        <button type="button" class="pin-drop" data-unpin="${esc(card.id)}" aria-label="Unpin ${esc(card.name)}">Unpin</button>
      </div>`;
    })
    .join("");

  return `<div class="acct-cols">
    <section class="acct-sec">
      <div class="acct-sec-head">
        <div>
          <h2>Name and bio</h2>
        </div>
      </div>
      <form id="profile-form" class="acct-form">
        <label class="field"><span>Trainer name</span><input name="name" minlength="2" maxlength="24" value="${esc(trainer.name)}" required /></label>
        <label class="field"><span>Handle</span><span class="field-at"><input name="handle" minlength="3" maxlength="16" value="${esc(trainer.handle)}" required autocapitalize="off" spellcheck="false" /></span>
          <span class="hint">Your profile lives at poke-pack.rip/u/${esc(trainer.handle)}.</span>
        </label>
        <label class="field"><span>Bio</span><textarea name="bio" maxlength="160" placeholder="What are you chasing?">${esc(trainer.bio || "")}</textarea></label>
        <p class="form-error" id="profile-error" role="alert"></p>
        <button class="solid" type="submit">Save profile</button>
      </form>
    </section>
    <section class="acct-sec">
      <div class="acct-sec-head">
        <div>
          <h2>What the public sees</h2>
        </div>
      </div>
      <div class="stat-toggles">${STAT_KEYS.map(
        (key) => `<label><input type="checkbox" data-stat-toggle="${key}" ${shown.has(key) ? "checked" : ""} /> ${esc(statLabel(key))}</label>`
      ).join("")}</div>
      <div class="share-row">
        <span class="share-url">poke-pack.rip/u/${esc(trainer.handle)}</span>
        <button class="ghost sm" type="button" id="copy-profile-link-2">Copy link</button>
      </div>
      <a class="text-btn share-open" href="/u/${esc(trainer.handle)}">Open your public profile</a>
    </section>
  </div>
  <section class="acct-sec acct-pins">
    <div class="acct-sec-head">
      <div>
        <h2>Showcase</h2>
        <p>${showcase.length} of ${roomLine("showcase", unlockOf(trainer), showcase.length, SHOWCASE_MAX).cap} pinned.${roomLine("showcase", unlockOf(trainer), showcase.length, SHOWCASE_MAX).more}</p>
      </div>
    </div>
    ${
      pinned
        ? `<div class="pin-row">${pinned}</div>`
        : `<p class="panel-empty">Open a card you own and choose Pin to showcase it here.</p>`
    }
  </section>`;
}

/* ---- Look --------------------------------------------------------------- */

/** Banner motions with the level each opens at (0 = free). The level-driven ones are listed even before cosmetics.js knows them. */
function bannerMotionRows() {
  const rows = BANNER_MOTIONS.map((row) => ({ id: row.id, name: row.name, level: Number(row.level ?? BANNER_MOTION_LEVELS[row.id]) || 0 }));
  for (const [id, level] of Object.entries(BANNER_MOTION_LEVELS)) {
    if (!rows.some((row) => row.id === id)) rows.push({ id, name: BANNER_MOTION_NAMES[id] || id, level });
  }
  return rows.sort((a, b) => a.level - b.level);
}

function lookTab(trainer, stats) {
  const avatars = searchAvatars(avatarQuery);
  const banner = parseBanner(trainer.banner);
  const style = avatarStyle(trainer.avatarStyle);
  const ctx = titleContext(state, { signed: true, findCard, rarities: ownedRarities(), level: state.xp?.peak ?? state.xp?.level ?? unlockOf(cloudUser) });
  const unlocked = new Set(unlockedTitles(ctx).map((row) => row.name));
  const titleGroups = questArea.titleGroupsHtml(TITLES, trainer.title, unlocked, areaDeps);
  const onMastery = Boolean(banner.set);

  return `<div class="look-layout">
    <aside class="look-preview" aria-label="Preview">
      <div class="look-card">
        ${bannerBlockHtml(trainer.banner, { className: "acct-banner" })}
        <div class="look-id">
          ${avatarMark(trainer, "trainer-mark look-face")}
          <b>${esc(trainer.name)}${levelBadgeHtml(trainer.level, { size: "md", prestige: trainer.prestige })}</b>
          <small>@${esc(trainer.handle)}</small>
          <span class="account-title">${esc(trainer.title || "Rookie")}</span>
        </div>
      </div>
      <div class="look-actions">
        <button class="ghost sm" type="button" id="look-random">Surprise me</button>
        <button class="ghost sm" type="button" id="look-swap">Swap banner colours</button>
      </div>
    </aside>
    <div class="look-controls">
      <section class="acct-sec">
        <div class="acct-sec-head">
          <div>
            <h2>Picture</h2>
          </div>
          <div class="seg style-picks" role="group" aria-label="Picture style">
            <button type="button" class="seg-btn${style === "art" ? " on" : ""}" data-set-style="art" aria-pressed="${style === "art"}">Full art</button>
            <button type="button" class="seg-btn${style === "pixel" ? " on" : ""}" data-set-style="pixel" aria-pressed="${style === "pixel"}">Pixel</button>
          </div>
        </div>
        <label class="field avatar-search"><span>Search Pokémon</span>
          <input id="avatar-search" type="search" value="${esc(avatarQuery)}" placeholder="Pikachu, 25, Darkrai" autocomplete="off" />
        </label>
        <div class="avatar-grid">${avatars
          .map(
            ([id, name]) => `<button type="button" class="pick${String(trainer.avatar) === String(id) ? " on" : ""}" data-set-avatar="${id}" title="${esc(name)}">
            <img class="${style === "pixel" ? "pixel" : ""}" src="${esc(style === "pixel" ? avatarIcon(id) : avatarSrc(id, "art"))}" alt="${esc(name)}" loading="lazy" />
            <small>${esc(name)}</small>
          </button>`
          )
          .join("")}</div>
        <div class="field"><span>Ring colour</span>${colorPicks(trainer.color, "data-profile-color", "Ring colour")}</div>
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head">
          <h2>Frame</h2>
        </div>
        ${framePicksHtml({
          level: unlockOf(trainer),
          prestige: trainer.prestige || 0,
          frame: trainer.frame,
          color: avatarColor(trainer.color).hex,
          avatar: faceHtml({ ...trainer, online: false }, "md", { frame: false }),
        })}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head">
          <div>
            <h2>Banner</h2>
          </div>
        </div>
        <div class="qa-words qa-words-inline qa-words-wrap" role="group" aria-label="Banner motion">${bannerMotionRows()
          .map((row) => {
            const locked = unlockOf(trainer) < row.level;
            const on = !onMastery && banner.motion === row.id;
            return locked
              ? `<button type="button" class="qa-word locked" data-motion-locked="${esc(row.id)}" aria-disabled="true"><span>${esc(row.name)}</span><small>Level ${row.level}</small></button>`
              : `<button type="button" class="qa-word${on ? " on" : ""}" data-set-motion="${esc(row.id)}" aria-pressed="${on}"><span>${esc(row.name)}</span></button>`;
          })
          .join("")}</div>
        <div class="field"><span>First colour</span>${colorPicks(onMastery ? "" : banner.colors[0], "data-banner-a", "First banner colour")}</div>
        <div class="field"><span>Second colour</span>${colorPicks(onMastery ? "" : banner.colors[1], "data-banner-b", "Second banner colour")}</div>
        ${questArea.masteryBannersHtml(banner.set ? masteryBannerId(banner.set) : "", stats.claimed, areaDeps)}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head">
          <div>
            <h2>Title</h2>
            <p>${unlocked.size} of ${TITLES.length - questArea.hiddenTitles(TITLES, unlocked, areaDeps).length} unlocked.</p>
          </div>
        </div>
        <div class="title-groups">${titleGroups}</div>
      </section>
    </div>
  </div>`;
}

/* ---- Security ----------------------------------------------------------- */

function securityTab(trainer) {
  return `<div class="acct-cols">
    <section class="acct-sec">
      <div class="acct-sec-head">
        <div>
          <h2>Password</h2>
        </div>
      </div>
      <form id="password-form" class="acct-form">
        <label class="field"><span>Current password</span><input name="current" type="password" maxlength="64" required autocomplete="current-password" /></label>
        <label class="field"><span>New password</span><input name="password" type="password" minlength="6" maxlength="64" required autocomplete="new-password" />
          <span class="hint">At least 6 characters.</span>
        </label>
        <p class="form-error" id="password-error" role="alert"></p>
        <button class="solid" type="submit">Update password</button>
      </form>
    </section>
    <section class="acct-sec acct-danger">
      <div class="acct-sec-head">
        <div>
          <h2>Delete account</h2>
          <p>Removes @${esc(trainer.handle)}, every card, every badge and the binder. There's no undo.</p>
        </div>
      </div>
      <button class="ghost danger-btn" type="button" id="delete-trainer">Delete ${esc(trainer.name)}</button>
    </section>
  </div>`;
}

async function renderProfile() {
  const handle = profileHandle;
  if (!els.profileBody) return;
  if (!handle) {
    els.profileBody.innerHTML = `<p class="panel-empty profile-missing">There's no trainer at this address. Check the handle in the link.</p>`;
    profileView.leaveProfileRoom();
    return;
  }
  els.profileBody.innerHTML = `<p class="panel-empty profile-loading">Loading @${esc(handle)}…</p>`;
  try {
    const data = await api(`/api/u/${encodeURIComponent(handle)}`);
    if (profileHandle !== handle) return;
    const user = data.user;
    const mine = data.relation === "self";
    const sameProfile = profileBinderView.handle === handle;
    const pageId = sameProfile ? profileBinderView.pages[profileBinderView.position]?.index : null;
    const pages = data.binderPages || [];
    const preserved = pages.findIndex(page => page.index === pageId);
    const wanted = profilePageWanted == null ? -1 : pages.findIndex(page => page.index === profilePageWanted);
    // A link to a page that is no longer displayed falls back to the profile itself.
    if (profilePageWanted != null && wanted < 0) {
      profilePageWanted = null;
      profilePageScroll = false;
      replacePath(profilePath(handle, null));
    }
    // look: the owner's binder look (user.binderLook) draws "Inside the binder" in profileBinderPagesHtml.
    profileBinderView = {handle, pages, mine, look:user.binderLook, position:wanted >= 0 ? wanted : preserved >= 0 ? preserved : 0};
    const signed = Boolean(activeTrainer());
    const friendBtn =
      !signed
        ? `<button class="ghost" type="button" data-open-auth="signin">Sign in to add</button>`
        : mine
          ? `<a class="ghost" href="/account">Edit profile</a>`
          : data.relation === "friends"
            ? `<button class="ghost" type="button" data-open-dm="${esc(user.handle)}">Message</button><button class="text-btn" type="button" data-friend-remove="${esc(user.handle)}">Unfriend</button>`
            : data.relation === "pending-out"
              ? `<button class="ghost" type="button" disabled>Request sent</button>`
              : data.relation === "pending-in"
                ? `<button class="solid" type="button" data-friend-accept="${esc(user.handle)}">Accept friend</button>`
                : `<button class="solid" type="button" data-friend-add="${esc(user.handle)}">Add friend</button>`;

    // The Graded section: slabs the trainer chose to show, drawn with the real face.
    const gradedSlabs = Array.isArray(data.graded) ? data.graded : [];
    const gradedSets = new Map();
    for (const slab of gradedSlabs) {
      const set = setForCardId(slab.cardId);
      if (set && !findCard(slab.cardId)) gradedSets.set(set.id, set);
    }
    if (gradedSets.size) {
      await Promise.all([...gradedSets.values()].map((set) => loadSetData(set).catch(() => null)));
      if (profileHandle !== handle) return;
    }
    // The page itself (hero, then the trainer's sections in their order) lives in js/profile-view.js.
    if (view !== "profile") return; // left the profile while it loaded: it must not paint the room
    const page = profileView.profilePageHtml({ data, mine, signed, friendBtn, gradedSlabs, deps: profileDeps() });
    els.profileBody.innerHTML = page.html;
    profileView.applyProfileRoom(page.look, page.cards, { accents: cachedCardAccents(page.cards) });
    if (page.look.tint === COLOR_FROM_CARDS) {
      // Refine the room's "cards" colour from the art once it has been read (type colours stand in until then).
      sampleCardAccents(page.cards, () => {
        if (view === "profile" && profileHandle === handle) profileView.applyProfileRoom(page.look, page.cards, { accents: cachedCardAccents(page.cards) });
      });
    }
    if (profilePageScroll) {
      profilePageScroll = false;
      els.profileBody.querySelector(".profile-binder")?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    }
  } catch (err) {
    els.profileBody.innerHTML = `<p class="panel-empty profile-missing">${esc(err.message || "Trainer not found.")} Check the handle in the link.</p>`;
    profileView.leaveProfileRoom();
  }
}

/** What the Layout tab (js/profile-editor.js) needs: the trainer's cards for "match my cards", and the save. */
function layoutDeps() {
  return {
    esc, avatarMark, bannerBlock: bannerBlockHtml, findCard, toast, activeTrainer,
    showcaseIds: () => (activeTrainer()?.showcase || []).map((slot) => slot.id),
    binderSlots: () => {
      // The pages this trainer displays, as the public profile will show them.
      const out = [];
      for (const page of activeTrainer()?.binderPages || []) {
        for (const slot of (state.binder || []).slice(page * BINDER_PAGE, (page + 1) * BINDER_PAGE)) if (slot?.id) out.push(slot.id);
      }
      return out;
    },
    save: async (profileLook) => {
      const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ profileLook }) });
      cloudUser = data.user;
    },
  };
}
profileEditor.initProfileEditor(els.accountBody, layoutDeps());

/** What js/profile-view.js and js/profile-editor.js need from the app: helpers, never state. */
function profileDeps() {
  return {
    esc, num, joinedOn, formatWhen, faceHtml, findCard, setForCardId, tcgFace, inspectAttrs, slabHTML, gradeWord,
    bannerBlock: bannerBlockHtml, levelBadge: levelBadgeHtml, levelTag, roomLine,
    masteryShelf: masteryShelfProfileHtml,
    binderSection: () => profileBinderPagesHtml(),
    showcaseMax: SHOWCASE_MAX,
    gradedMax: GRADING_LIMITS.maxShown,
  };
}

async function renderSocial() {
  const body = els.socialBody;
  if (!body) return;
  const trainer = activeTrainer();
  if (!trainer) {
    body.innerHTML = `<div class="social-gate">
      <h2>Social</h2>
      <p>Sign in to add friends and message them.</p>
      <div class="social-gate-actions">
        <button class="solid" type="button" data-open-auth="signin">Sign in</button>
        <button class="ghost" type="button" data-open-auth="signup">Create account</button>
      </div>
    </div>`;
    return;
  }
  const draft = body.querySelector("#dm-form [name=body]")?.value || "";
  try {
    const inbox = await api("/api/dms");
    const threads = inbox.threads || [];
    let thread = null;
    if (dmHandle) {
      try {
        thread = await api(`/api/dms/${encodeURIComponent(dmHandle)}`);
      } catch (err) {
        thread = { error: err.message || "Couldn't open that thread." };
      }
    }
    const online = new Set(currentFriends().friends.filter((row) => row.online).map((row) => row.handle));
    const list = threads
      .map((row) => {
        const on = dmHandle === row.user.handle;
        const preview = row.last ? `${row.last.mine ? "You: " : ""}${esc(row.last.body)}` : "Say hello";
        return `<a class="dm-thread${on ? " on" : ""}" href="/social/${esc(row.user.handle)}"${on ? ` aria-current="page"` : ""}>
          ${faceHtml({ ...row.user, online: online.has(row.user.handle) }, "sm")}
          <span><b>${levelTag(row.user)}${esc(row.user.name)}</b><small>${preview}</small></span>
          ${row.last ? `<time>${esc(formatWhen(row.last.at))}</time>` : ""}
        </a>`;
      })
      .join("");
    const { incoming, outgoing } = currentFriends();
    const incomingRows = incoming
      .map(
        (row) => `<div class="friends-row">
          <a href="/u/${esc(row.handle)}">${faceHtml(row, "sm")}<span><b>${levelTag(row)}${esc(row.name)}</b><small>@${esc(row.handle)} wants to be friends</small></span></a>
          <div class="friends-row-actions">
            <button type="button" class="ghost sm" data-friend-accept="${esc(row.handle)}">Accept</button>
            <button type="button" class="text-btn" data-friend-deny="${esc(row.handle)}">Decline</button>
          </div>
        </div>`
      )
      .join("");
    const outgoingRows = outgoing
      .map(
        (row) => `<div class="friends-row dim">
          <a href="/u/${esc(row.handle)}">${faceHtml(row, "sm")}<span><b>${levelTag(row)}${esc(row.name)}</b><small>Request sent</small></span></a>
        </div>`
      )
      .join("");
    const requests =
      (incomingRows ? `<p class="friends-label">Requests</p><div class="social-requests">${incomingRows}</div>` : "") +
      (outgoingRows ? `<p class="friends-label">Waiting on them</p><div class="social-requests">${outgoingRows}</div>` : "");
    const messages = (thread?.messages || [])
      .map(
        (msg) => `<div class="dm-line${msg.mine ? " mine" : ""}"><span>${esc(msg.body)}</span><time>${esc(formatWhen(msg.at))}</time></div>`
      )
      .join("");
    const pane = thread?.error
      ? `<p class="panel-empty">${esc(thread.error)}</p>`
      : thread
        ? `<div class="dm-head">
            <a class="dm-back" href="/social" aria-label="Back to all friends">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </a>
            <a class="dm-who" href="/u/${esc(thread.user.handle)}">
              ${faceHtml({ ...thread.user, online: online.has(thread.user.handle) }, "sm")}
              <span><b>${levelTag(thread.user)}${esc(thread.user.name)}</b><small>${online.has(thread.user.handle) ? "Online now" : `@${esc(thread.user.handle)}`}</small></span>
            </a>
            <a class="text-btn dm-profile" href="/u/${esc(thread.user.handle)}">Profile</a>
          </div>
          <div class="dm-log" id="dm-log">${
            messages || `<p class="dm-empty">Send ${esc(thread.user.name)} the first message.</p>`
          }</div>
          <form class="dm-form" id="dm-form">
            <input name="body" maxlength="220" placeholder="Message ${esc(thread.user.name)}" autocomplete="off" aria-label="Message ${esc(thread.user.name)}" />
            <button class="solid" type="submit">Send</button>
          </form>`
        : `<div class="dm-idle">
            <p><b>Pick a friend to open your messages.</b></p>
          </div>`;
    body.innerHTML = `
      <div class="section-head social-head">
        <div>
          <h2>Social</h2>
        </div>
      </div>
      <div class="social-grid${thread && !thread.error ? " has-thread" : ""}">
        <aside class="social-friends" aria-label="Friends">
          <form class="friends-add social-add" id="social-add">
            <input name="handle" maxlength="17" placeholder="Add a friend by @handle" autocapitalize="off" spellcheck="false" aria-label="Add a friend by handle" />
            <button class="ghost" type="submit">Add</button>
          </form>
          ${requests}
          ${requests ? `<p class="friends-label">Friends</p>` : ""}
          <nav class="dm-threads" aria-label="Messages">${
            list || `<p class="panel-empty">Add a trainer by handle above, or tap a name in the chat on Home.</p>`
          }</nav>
        </aside>
        <section class="dm-pane" aria-label="Messages">${pane}</section>
      </div>
      <section class="trade-soon" aria-labelledby="trade-title">
        <div class="trade-copy">
          <h2 id="trade-title">Trading <span class="soon">Soon</span></h2>
          <p>Card-for-card trades with friends open here next. Keep the cards you'd swap in your binder so friends can see what you have.</p>
          <a class="text-btn" href="/binder">Open your binder</a>
        </div>
        <div class="trade-slips" aria-hidden="true">
          <span class="trade-slot"></span>
          <svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
          <span class="trade-slot"></span>
        </div>
      </section>`;
    const log = body.querySelector("#dm-log");
    if (log) log.scrollTop = log.scrollHeight;
    const form = body.querySelector("#dm-form");
    const input = form?.querySelector("[name=body]");
    if (input && draft) input.value = draft;
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = String(new FormData(form).get("body") || "").trim();
      if (!text || !dmHandle) return;
      try {
        await api("/api/dms", { method: "POST", body: JSON.stringify({ handle: dmHandle, body: text }) });
        renderSocial();
      } catch (err) {
        toast(err.message || "Couldn't send.");
      }
    });
    body.querySelector("#social-add")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const field = e.target.handle;
      const handle = String(field.value || "").replace(/^@/, "").trim();
      if (handle.length < 3) {
        toast("Handles are at least 3 characters.");
        return;
      }
      try {
        const data = await api("/api/friends/request", { method: "POST", body: JSON.stringify({ handle }) });
        field.value = "";
        toast(data.status === "accepted" ? `You and @${handle} are friends.` : `Request sent to @${handle}.`);
        await notifySignedIn();
        renderSocial();
      } catch (err) {
        toast(err.message || "Couldn't send that request.");
      }
    });
  } catch (err) {
    body.innerHTML = `<p class="panel-empty">${esc(err.message || "Couldn't load your messages.")} Refresh the page to try again.</p>`;
  }
}

els.socialBody?.addEventListener("click", async (e) => {
  const accept = e.target.closest("[data-friend-accept]");
  const deny = e.target.closest("[data-friend-deny]");
  const handle = accept?.dataset.friendAccept || deny?.dataset.friendDeny;
  if (!handle) return;
  e.preventDefault();
  e.target.closest(".friends-row")?.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
  try {
    await api("/api/friends/respond", { method: "POST", body: JSON.stringify({ handle, accept: Boolean(accept) }) });
    toast(accept ? `You and @${handle} are friends.` : "Request declined.");
  } catch (err) {
    toast(err.message || "Couldn't update friends.");
  }
  await notifySignedIn();
  renderSocial();
});

/*
 * Settings are grouped for the page, and each row declares its own control so
 * renderSettings stays a dumb loop. `type` is "toggle" (boolean) or "choice"
 * (segmented control backed by `options`).
 */
const SETTING_GROUPS = [
  {
    title: "Cards",
    rows: [
      {
        key: "fx",
        type: "choice",
        label: "Card effects",
        note: "Holo is the newer, glossier foil. Classic is the original, closer to the printed holo windows.",
        options: [
          ["holo", "Holo"],
          ["classic", "Classic"],
        ],
      },
      { key: "shine", type: "toggle", label: "Card shine", note: "Gloss highlight that follows your cursor across a card." },
      { key: "tilt", type: "toggle", label: "Card tilt", note: "Cards lean toward your finger or cursor in 3D." },
      { key: "stamps", type: "toggle", label: "Rarity stamps", note: "A small rarity mark in the corner of each card." },
      { key: "motion", type: "toggle", label: "Idle shimmer", note: "Slow shimmer on foiled cards when you're not touching them." },
      {
        key: "foil",
        type: "choice",
        label: "Foil strength",
        note: "How hard the holo pattern reads on foiled cards.",
        options: [
          ["subtle", "Subtle"],
          ["normal", "Normal"],
          ["intense", "Intense"],
        ],
      },
    ],
  },
  {
    title: "Opening packs",
    rows: [
      { key: "flash", type: "toggle", label: "Hit effects", note: "Spark burst and screen shake when you pull a rare." },
      { key: "haptics", type: "toggle", label: "Vibration", note: "Short buzz when the wrapper tears and when a hit lands. Phones and tablets only." },
    ],
  },
  {
    title: "Binder",
    rows: [
      {
        key: "binder",
        type: "choice",
        label: "Card size",
        note: "How many cards fit across the binder grid.",
        options: [
          ["compact", "Compact"],
          ["cosy", "Cosy"],
          ["large", "Large"],
        ],
      },
      { key: "confirmSell", type: "toggle", label: "Confirm before selling", note: "Ask first when you sell a duplicate, so a stray tap can't cost you a card." },
    ],
  },
  {
    title: "Start-up",
    rows: [
      {
        key: "startView",
        type: "choice",
        label: "Opening view",
        note: "Which page loads first.",
        options: [
          ["home", "Home"],
          ["shop", "Packs"],
          ["collection", "Collection"],
        ],
      },
    ],
  },
];

const FOIL_STRENGTH = { subtle: 0.55, normal: 1, intense: 1.5 };
const BINDER_MIN = { compact: "116px", cosy: "150px", large: "196px" };

function settingRow(row) {
  const value = state.settings[row.key];
  if (row.type === "choice") {
    const opts = row.options
      .map(
        ([val, label]) => `<button type="button" class="seg-btn${value === val ? " on" : ""}"
          data-choice="${row.key}" data-value="${esc(val)}"
          aria-pressed="${value === val}">${esc(label)}</button>`
      )
      .join("");
    return `<div class="set-row">
      <span class="set-copy">
        <b>${esc(row.label)}</b>
        <small>${esc(row.note)}</small>
      </span>
      <span class="seg" role="group" aria-label="${esc(row.label)}">${opts}</span>
    </div>`;
  }
  return `<label class="set-row toggle-row">
    <span class="set-copy">
      <b>${esc(row.label)}</b>
      <small>${esc(row.note)}</small>
    </span>
    <input type="checkbox" data-setting="${row.key}" ${value ? "checked" : ""} />
    <i class="switch" aria-hidden="true"></i>
  </label>`;
}

function changedSettingCount() {
  return Object.keys(DEFAULT_SETTINGS).filter(
    (key) => state.settings[key] !== DEFAULT_SETTINGS[key]
  ).length;
}

function settingsSummaryText(changed) {
  if (!changed) return "Everything is on its default.";
  return `${changed} setting${changed === 1 ? "" : "s"} changed from the default.`;
}

function updateSettingsSummary() {
  const changed = changedSettingCount();
  const line = els.settingsBody.querySelector(".set-bar p");
  const reset = els.settingsBody.querySelector("#reset-settings");
  if (line) line.textContent = settingsSummaryText(changed);
  if (reset) reset.disabled = !changed;
}

/* Settings read as a spec sheet on the open page: each group is a title and a
   line on the left, its rows on the right (stacked on a phone). No panels. */
function renderSettings() {
  const changed = changedSettingCount();

  const group = (title, rows, extra = "") => `<section class="set-group${extra}">
      <header class="set-group-head">
        <h3>${esc(title)}</h3>
      </header>
      <div class="set-list">${rows}</div>
    </section>`;

  const groups = SETTING_GROUPS.map((g) => group(g.title, g.rows.map(settingRow).join(""))).join("");
  const progress = group(
    "Progress",
    `<div class="set-row">
        <span class="set-copy">
          <b>Reset progress</b>
          <small>Clears coins, binder and history on this account. Settings stay. This can't be undone.</small>
        </span>
        <button class="ghost danger-btn" id="reset-progress" type="button">Reset everything</button>
      </div>`,
    " set-danger"
  );

  els.settingsBody.innerHTML = `
    <div class="set-bar">
      <p>${esc(settingsSummaryText(changed))}</p>
      <button class="ghost sm" id="reset-settings" type="button" ${changed ? "" : "disabled"}>Restore defaults</button>
    </div>
    <div class="set-groups">${groups}${progress}</div>`;
}

function applySettings() {
  const { shine, tilt, stamps, motion, flash, foil, binder, fx } = state.settings;
  // Exactly one foil engine paints at a time; css/holo/ and the .tcg foil
  // rules in app.css both target the same two layers, so they cannot overlap.
  document.body.classList.toggle("fx-holo", fx !== "classic");
  document.body.classList.toggle("fx-classic", fx === "classic");
  document.body.classList.toggle("no-shine", !shine);
  document.body.classList.toggle("no-tilt", !tilt);
  document.body.classList.toggle("no-stamps", !stamps);
  document.body.classList.toggle("no-motion", !motion);
  document.body.classList.toggle("no-flash", !flash);
  document.body.style.setProperty("--foil-strength", FOIL_STRENGTH[foil] ?? 1);
  document.body.style.setProperty("--binder-min", BINDER_MIN[binder] ?? BINDER_MIN.cosy);
}

function formatNoteDate(value) {
  const at = new Date(`${value}T00:00:00`);
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const notesState = {};
function renderNotes() {
  renderNotesPage(els.notesBody, patchNotes, document.getElementById("notes-fact"), notesState);
}

/** Short buzz on the tear and on a hit, when the setting is on and supported. */
function buzz(pattern) {
  if (!state.settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

const VIEW_SECTIONS = {
  home: "viewHome",
  shop: "viewShop",
  battles: "viewBattles",
  gear: "viewGear",
  casino: "viewCasino",
  grading: "viewGrading", // grading
  cart: "viewCart",
  vault: "viewVault",
  collection: "viewCollection",
  binder: "viewBinder",
  catalog: "viewCatalog",
  account: "viewAccount",
  profile: "viewProfile",
  auth: "viewAuth",
  settings: "viewSettings",
  notes: "viewNotes",
  social: "viewSocial",
};

const VIEW_PATHS = {
  home: "/home",
  shop: "/packs",
  battles: "/battles",
  gear: "/gear",
  casino: "/casino",
  grading: "/grading", // grading
  cart: "/cart",
  vault: "/bulk/sealed",
  collection: "/bulk",
  binder: "/binder",
  catalog: "/catalog",
  account: "/account",
  profile: "/u",
  auth: "/signin",
  settings: "/settings",
  notes: "/notes",
  social: "/social",
};

const PATH_VIEWS = {
  "/": "home",
  "/home": "home",
  "/index.html": "home",
  "/packs": "shop",
  "/battles": "battles",
  "/gear": "gear",
  "/sleeves": "gear",
  "/coins": "gear",
  "/casino": "casino",
  "/grading": "grading", // grading
  "/cart": "cart",
  "/bulk/sealed": "vault",
  "/collection/sealed": "vault",
  "/sealed": "vault",
  "/shop": "shop",
  "/bulk": "collection",
  "/collection": "collection",
  "/binder": "binder",
  "/catalog": "catalog",
  "/account": "account",
  "/signin": "auth",
  "/login": "auth",
  "/signup": "auth",
  "/auth": "auth",
  "/settings": "settings",
  "/notes": "notes",
  "/patch-notes": "notes",
  "/social": "social",
};

const VIEW_TITLES = {
  home: "poke-pack.rip | rip packs, fill the binder",
  shop: "Packs | poke-pack.rip",
  battles: "Pack battles | poke-pack.rip",
  gear: "Sleeves & coins | poke-pack.rip",
  casino: "Casino | poke-pack.rip",
  grading: "Grading | poke-pack.rip", // grading
  cart: "Cart | poke-pack.rip",
  vault: "Sealed collection | poke-pack.rip",
  collection: "Collection | poke-pack.rip",
  binder: "Binder | poke-pack.rip",
  catalog: "All sets | poke-pack.rip",
  account: "Account | poke-pack.rip",
  profile: "Trainer | poke-pack.rip",
  auth: "Sign in | poke-pack.rip",
  settings: "Settings | poke-pack.rip",
  notes: "Patch notes | poke-pack.rip",
  social: "Social | poke-pack.rip",
};

const VIEW_RENDER = {
  home: () => {
    renderHome();
    refreshLounge();
  },
  shop: () => centerQuickSet(),
  battles: () => battles.show(battlePath),
  gear: () => gearPage.show(),
  casino: () => casino.show(casinoPath),
  grading: () => grading.show(gradingPath), // grading
  cart: () => cartPage.show(cartPath),
  vault: () => vaultPage.show(vaultPath),
  collection: () => renderCollection(),
  binder: () => renderBinder(),
  catalog: () => renderCatalog(),
  account: () => renderAccount(),
  profile: () => renderProfile(),
  auth: () => renderAuth(),
  settings: () => renderSettings(),
  notes: () => renderNotes(),
  social: () => renderSocial(),
};

function normalizePath(pathname) {
  const path = (pathname || "/").replace(/\/+$/, "");
  return path || "/";
}

function viewFromPath(pathname) {
  const path = normalizePath(pathname);
  if (/^\/battles(?:\/[a-zA-Z0-9_-]+)?$/.test(path)) {
    battlePath = path;
    return "battles";
  }
  if (/^\/casino(?:\/[a-z]+(?:\/[a-zA-Z0-9-]+)?)?$/.test(path)) {
    casinoPath = path;
    return "casino";
  }
  // grading: /grading, /grading/send, /grading/send/<cardId>, /grading/<slabId>
  if (GRADING_ROUTE.test(path)) {
    gradingPath = path;
    return "grading";
  }
  if (PATH_VIEWS[path]) {
    if (PATH_VIEWS[path] === "social") dmHandle = "";
    return PATH_VIEWS[path];
  }
  if (/^\/(packs|shop)\/[a-z0-9]+$/i.test(path)) return "shop";
  const profile = path.match(/^\/u\/([a-z0-9_]{3,16})(?:\/binder\/([1-9]\d{0,2}))?$/i);
  if (profile) {
    profileHandle = profile[1].toLowerCase();
    profilePageWanted = profile[2] ? Number(profile[2]) - 1 : null;
    profilePageScroll = profilePageWanted != null;
    return "profile";
  }
  const social = path.match(/^\/social\/([a-z0-9_]{3,16})$/i);
  if (social) {
    dmHandle = social[1].toLowerCase();
    return "social";
  }
  return null;
}

/** The set id a /packs/<id> path names, playable or not; "" for /packs itself. */
function pathSetId(pathname) {
  return normalizePath(pathname).match(/^\/(?:packs|shop)\/([a-z0-9]+)$/i)?.[1].toLowerCase() || "";
}

/** The playable set a /packs/<id> path names, or "" when it names none. */
function setIdFromPath(pathname) {
  const id = pathSetId(pathname);
  return id && PLAYABLE_SETS.some((set) => set.id === id) ? id : "";
}

function profilePath(handle, page) {
  return `/u/${handle}${page != null ? `/binder/${page + 1}` : ""}`;
}

/** Keep the address bar on what is shown without adding a history entry. */
function replacePath(path) {
  if (normalizePath(location.pathname) === path) return;
  history.replaceState({ view }, "", path + location.search);
}

function viewTitle() {
  if (view === "profile" && profileHandle) return `@${profileHandle} | poke-pack.rip`;
  if (view === "social" && dmHandle) return `DM @${dmHandle} | poke-pack.rip`;
  if (view === "shop") return `${liveSet.name} packs | poke-pack.rip`;
  return VIEW_TITLES[view] || VIEW_TITLES.home;
}

function pathForView(name) {
  if (name === "battles") return battlePath;
  if (name === "casino") return casinoPath;
  if (name === "grading") return gradingPath; // grading
  if (name === "profile") return profilePath(profileHandle || "trainer", profilePageWanted);
  if (name === "shop") return `/packs/${liveSet.id}`;
  if (name === "social") return dmHandle ? `/social/${dmHandle}` : "/social";
  return VIEW_PATHS[name] || "/home";
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function paintNav(current) {
  const navView =
    current === "auth" || current === "profile" ? "account" : current === "battles" ? "casino" : current === "vault" ? "collection" : current;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const on = btn.dataset.view === navView;
    btn.classList.toggle("active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

function applyView(next, hist) {
  if (next !== "battles") battles.hide();
  if (next !== "casino") casino.hide();
  if (next !== "grading") grading.hide(); // grading
  if (next !== "profile") profileView.leaveProfileRoom(); // the room's tint and backdrop belong to the profile only
  if (next !== "cart") cartPage.hide();
  if (next !== "vault") vaultPage.hide();
  if (next !== "binder") binderEditor?.close(); // an unsaved draft is dropped when you leave
  if (next !== "auth" && next !== "battles") battleReturnPath = "";
  if (next !== "auth" && next !== "casino") casinoReturnPath = "";
  view = next;
  for (const [name, key] of Object.entries(VIEW_SECTIONS)) {
    els[key]?.classList.toggle("hidden", view !== name);
  }
  paintNav(view);
  document.querySelectorAll(".nav-more").forEach((more) => more.removeAttribute("open"));
  if (view !== "shop") hideSetNotice();
  VIEW_RENDER[view]?.();
  // Battles live under the casino: it draws the sub-nav above them.
  if (view === "battles") casino.paintBar("battles");
  else if (view !== "casino") casino.paintBar("");
  document.body.classList.toggle("on-home", view === "home");
  document.body.classList.toggle("on-shop", view === "shop");
  document.body.classList.toggle("on-collection", view === "collection");
  document.body.classList.toggle("on-auth", view === "auth");
  document.body.classList.toggle("on-social", view === "social");
  document.body.classList.toggle("on-battles", view === "battles");
  document.body.classList.toggle("on-casino", view === "casino" || view === "battles");
  document.title = viewTitle();
  if (!document.body.classList.contains("is-booting")) {
    window.scrollTo(0, 0);
  }
  if (hist === "none") return;
  const want = pathForView(view);
  const have = normalizePath(location.pathname);
  if (have === want) return;
  if (view === "home" && have === "/") return;
  const url = want + location.search;
  if (hist === "replace") history.replaceState({ view }, "", url);
  else history.pushState({ view }, "", url);
}

function setView(next, { history: hist = "push", handle } = {}) {
  if (!VIEW_SECTIONS[next]) return;
  if (next === "social" && handle != null) {
    dmHandle = String(handle || "").replace(/^@/, "").toLowerCase();
  }
  const nextHandle =
    next === "profile" ? String(handle || profileHandle || "").replace(/^@/, "").toLowerCase() : profileHandle;
  const same =
    view === next &&
    (next !== "profile" || nextHandle === profileHandle) &&
    (next !== "social" || !handle || String(handle).replace(/^@/, "").toLowerCase() === dmHandle);
  if (next === "profile") {
    if (handle != null) profilePageWanted = null;
    profileHandle = nextHandle;
  }
  paintNav(next);
  const wrap = document.querySelector(".wrap");
  const skipFade =
    document.body.classList.contains("is-booting") ||
    reduceMotion() ||
    same;

  if (skipFade) {
    viewFadeGen += 1;
    applyView(next, hist);
    wrap?.classList.remove("is-switching");
    return;
  }

  const gen = ++viewFadeGen;
  wrap?.classList.add("is-switching");
  window.setTimeout(() => {
    if (gen !== viewFadeGen) return;
    applyView(next, hist);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (gen !== viewFadeGen) return;
        wrap?.classList.remove("is-switching");
      });
    });
  }, 180);
}

function remainingBacks() {
  return currentPulls.filter((card) => !card.drawn).length;
}

function motionOk() {
  return !document.body.classList.contains("no-motion");
}

/** Decorative opening motion: off for the no-motion setting and for reduced motion. */
function fxOk() {
  return motionOk() && !reduceMotion();
}

/** The flashy part of a hit (build-up, flash, shake) also needs the hit-effects setting. */
function hitFxOk() {
  return fxOk() && Boolean(state.settings.flash);
}

const PACK_GLOW_DEFAULT = "150 176 232";
const packGlowCache = new Map();

/** The wrapper's dominant colour as an "r g b" triplet, sampled once from a 16px copy. */
function packGlow(wrap) {
  const sources = [wrap?.art, wrap?.artFallback].filter(Boolean);
  if (!sources.length) return Promise.resolve(null);
  const key = sources[0];
  if (packGlowCache.has(key)) return packGlowCache.get(key);
  const sample = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        try {
          const size = 16;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          // The middle of the wrapper: the logo band and the foot are the same on every pack.
          const iw = img.naturalWidth || img.width;
          const ih = img.naturalHeight || img.height;
          ctx.drawImage(img, 0, ih * 0.28, iw, ih * 0.5, 0, 0, size, size);
          const px = ctx.getImageData(0, 0, size, size).data;
          // Bucket by hue so a pink-and-green wrapper glows pink or green, not a
          // muddy average of both. Saturated, bright pixels carry the vote.
          const bins = Array.from({ length: 12 }, () => ({ r: 0, g: 0, b: 0, w: 0 }));
          for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] < 128) continue;
            const [pr, pg, pb] = [px[i], px[i + 1], px[i + 2]];
            const max = Math.max(pr, pg, pb);
            const min = Math.min(pr, pg, pb);
            const chroma = max - min;
            if (!max || chroma < 24) continue;
            let hue;
            if (max === pr) hue = ((pg - pb) / chroma + 6) % 6;
            else if (max === pg) hue = (pb - pr) / chroma + 2;
            else hue = (pr - pg) / chroma + 4;
            const sat = chroma / max;
            const w = sat * sat * (max / 255);
            const bin = bins[Math.floor(hue * 2) % 12];
            bin.r += pr * w;
            bin.g += pg * w;
            bin.b += pb * w;
            bin.w += w;
          }
          const best = bins.reduce((a, c) => (c.w > a.w ? c : a));
          if (!best.w) return resolve(null);
          const rgb = [best.r, best.g, best.b].map((c) => c / best.w);
          const k = 235 / (Math.max(...rgb) || 1);
          resolve(rgb.map((c) => Math.round(c * k)).join(" "));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  const job = sample(sources[0]).then((rgb) => rgb || (sources[1] ? sample(sources[1]) : null));
  packGlowCache.set(key, job);
  return job;
}

function absUrl(path) {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
}

/** The wrapper's colour for the light on the mat and the tear flash; the card back for the slot strip. */
function paintOpeningStage(wrap) {
  const overlay = els.overlay;
  if (!packGlowCache.has(wrap?.art)) overlay.style.setProperty("--pack-glow", PACK_GLOW_DEFAULT);
  if (wrap?.art) overlay.style.setProperty("--pack-mask", `url("${absUrl(wrap.art)}")`);
  if (liveSet.cardBack) overlay.style.setProperty("--card-back", `url("${absUrl(backSrc())}")`);
  packGlow(wrap).then((rgb) => {
    if (activeWrapper === wrap) overlay.style.setProperty("--pack-glow", rgb || PACK_GLOW_DEFAULT);
  });
}

/** The line beside Leave: which pack this is. */
function paintWhere() {
  const run = sealedRun;
  const set = (run && run.index < 0 ? run.packs[0]?.set || run.set : packSet) || liveSet;
  const wrap = activeWrapper?.name ? `${activeWrapper.name} wrapper` : "";
  const parts =
    run && packPhase === "summary"
      ? [(run.set || set).name, run.product.name]
      : run
        ? [set.name, run.index < 0 ? run.product.name : wrap]
        : [set.name, `pack ${num(state.packsOpened)}`, wrap];
  els.opWhere.textContent = parts.filter(Boolean).join(", ");
}

/** Restart a one-shot CSS class on an element and drop it again after `ms`. */
function replayClass(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el._replay = el._replay || {};
  clearTimeout(el._replay[cls]);
  el._replay[cls] = setTimeout(() => el.classList.remove(cls), ms);
}

/** Flash and shockwave where the wrapper tore through. */
function tearBurst() {
  if (!hitFxOk()) return;
  const rect = els.packBody.getBoundingClientRect();
  // The position lives on the flash layer, not on the overlay: a custom
  // property set on the overlay would restyle everything inside it at the
  // one moment the wrapper is flying apart.
  const flash = els.overlay.querySelector(".op-flash") || els.overlay;
  flash.style.setProperty("--burst-x", `${Math.round(rect.left + rect.width / 2)}px`);
  flash.style.setProperty("--burst-y", `${Math.round(rect.top + rect.height * 0.07)}px`);
  replayClass(els.overlay, "tear-burst", 900);
}

function hitTier(card) {
  if (!card) return 0;
  if (card.reverse) return card.reverseKind === "masterball" ? 2 : 1;
  if (card.rarity === "Poké Ball") return 1;
  if (
    card.rarity === "Mega Hyper Rare" ||
    card.rarity === "Hyper Rare" ||
    card.rarity === "Special Illustration Rare" ||
    card.rarity === "Black White Rare" ||
    card.rarity === "Futuristic Rare" ||
    card.rarity === "RGB Rare"
  ) {
    return 3;
  }
  if (isHit(card)) return 2;
  if (card.rarity === "Rare") return 1;
  return 0;
}

const TYPE_AURA = {
  Grass: "rgba(72, 196, 86, 0.52)",
  Fire: "rgba(255, 92, 48, 0.55)",
  Water: "rgba(48, 148, 236, 0.55)",
  Lightning: "rgba(255, 208, 40, 0.52)",
  Psychic: "rgba(204, 88, 204, 0.52)",
  Fighting: "rgba(204, 88, 48, 0.5)",
  Darkness: "rgba(96, 72, 144, 0.55)",
  Metal: "rgba(176, 192, 208, 0.48)",
  Dragon: "rgba(232, 176, 48, 0.55)",
  Fairy: "rgba(255, 132, 188, 0.52)",
  Colorless: "rgba(204, 196, 180, 0.36)",
  Trainer: "rgba(240, 120, 48, 0.5)",
};

function cardType(card) {
  if (card?.types?.[0]) return card.types[0];
  const name = card?.name || "";
  for (const type of Object.keys(TYPE_AURA)) {
    if (type !== "Colorless" && type !== "Trainer" && name.includes(type)) return type;
  }
  if (card?.supertype === "Trainer") return "Trainer";
  return "Colorless";
}

function isRainbowAura(card) {
  return (
    card?.rarity === "Special Illustration Rare" ||
    card?.rarity === "Mega Hyper Rare" ||
    card?.rarity === "Hyper Rare"
  );
}

function typeAura(card) {
  return TYPE_AURA[cardType(card)] || TYPE_AURA.Colorless;
}

function auraColor(card, faceUp) {
  if (!faceUp || !card) return "transparent";
  return typeAura(card);
}

const AURA_FADE_MS = 420;
let auraTimer = 0;
let auraGen = 0;

function glowKey(pull, faceUp) {
  if (!faceUp || !pull) return "off";
  if (isRainbowAura(pull)) return "rainbow";
  return typeAura(pull);
}

function setGlowOn(on) {
  els.overlay.classList.toggle("glow-on", Boolean(on));
  els.focusWrap.classList.toggle("revealed", Boolean(on));
}

function applyFocusChrome(pull, faceUp) {
  const wrap = els.focusWrap;
  const rainbow = Boolean(faceUp && isRainbowAura(pull));
  const glow = auraColor(pull, faceUp);
  wrap.classList.toggle("rainbow", rainbow);
  els.overlay.classList.toggle("rainbow", rainbow);
  wrap.classList.toggle("is-hit", Boolean(faceUp && hitTier(pull) >= 2 && !rainbow));
  wrap.classList.toggle("is-legend", rainbow);
  wrap.classList.toggle("is-reverse", Boolean(faceUp && pull.reverse && !rainbow));
  wrap.style.setProperty("--aura", glow);
  els.overlay.style.setProperty("--aura", glow);
  els.focusAura.classList.toggle("rays", rainbow);
}

function syncFocusChrome(pull, faceUp, { snap } = {}) {
  const next = glowKey(pull, faceUp);
  const current = els.focusWrap.dataset.glow || "off";
  const gen = ++auraGen;
  clearTimeout(auraTimer);
  auraTimer = 0;

  const snapClasses = (on) => {
    els.focusWrap.classList.toggle("aura-snap", on);
    els.overlay.classList.toggle("aura-snap", on);
  };

  const commit = (withSnap) => {
    if (gen !== auraGen) return;
    if (withSnap) snapClasses(true);
    applyFocusChrome(pull, faceUp);
    els.focusWrap.dataset.glow = next;
    setGlowOn(next !== "off");
    if (withSnap) {
      void els.focusWrap.offsetWidth;
      snapClasses(false);
    }
  };

  if (snap || !motionOk()) {
    commit(true);
    return;
  }

  if (current === next) {
    applyFocusChrome(pull, faceUp);
    setGlowOn(next !== "off");
    return;
  }

  const fadeIn = () => {
    if (gen !== auraGen) return;
    applyFocusChrome(pull, faceUp);
    els.focusWrap.dataset.glow = next;
    if (next === "off") {
      setGlowOn(false);
      return;
    }
    setGlowOn(false);
    void els.focusAura.offsetWidth;
    requestAnimationFrame(() => {
      if (gen !== auraGen) return;
      setGlowOn(true);
    });
  };

  if (current !== "off") {
    setGlowOn(false);
    auraTimer = setTimeout(fadeIn, AURA_FADE_MS);
    return;
  }

  fadeIn();
}

function clearFocusChrome(opts = {}) {
  syncFocusChrome(null, false, opts);
}

function hitStartIndex() {
  return Math.max(0, currentPulls.length - 3);
}

function canSkipToHits() {
  if (packPhase !== "reveal") return false;
  const start = hitStartIndex();
  return currentPulls.slice(0, start).some((card) => !card.revealed);
}

function slotHints() {
  const hints = [];
  for (const slot of (packSet || liveSet).slots) {
    const label =
      slot.pool === "energy"
        ? "E"
        : slot.pool === "common"
          ? "C"
          : slot.pool === "uncommon"
            ? "U"
            : slot.pool === "reverse"
              ? "RH"
              : slot.pool === "rare-slot"
                ? "★"
                : slot.pool === "art-slot"
                  ? "IR"
                  : "•";
    const kind =
      slot.pool === "rare-slot" || slot.pool === "art-slot"
        ? "hit"
        : slot.pool === "reverse"
          ? "rev"
          : slot.pool === "energy"
            ? "energy"
            : "basic";
    for (let i = 0; i < slot.count; i += 1) hints.push({ label, kind });
  }
  return hints;
}

/** Rate-card rarities, keyed to the slot tables' pools (see packOdds). */
const ODDS_POOL = {
  "Double Rare": "double",
  "Ultra Rare": "ultra",
  "Illustration Rare": "ir",
  "Special Illustration Rare": "sir",
  "Hyper Rare": "hyper",
  "Mega Hyper Rare": "hyper",
};

/** "1 in 80 packs", read off the set's slot tables the way the rate card reads them; "" when the card isn't on it. */
function pullOdds(card, set = packSet || liveSet) {
  const pool = !card?.reverse && ODDS_POOL[card?.rarity];
  if (!pool) return "";
  let weight = 0;
  for (const slot of set.slots || []) {
    for (const [key, w] of slot.table || []) if (key === pool) weight += Number(w) || 0;
  }
  return weight > 0 ? `1 in ${num(Math.round(1 / weight))} packs` : "";
}

/** The card's own data line, as it prints it: "045/084 · Fighting". */
function cardDataLine(card) {
  const no = numberLine(card);
  const kind = card.types?.join(" / ") || (card.supertype && card.supertype !== "Energy" ? card.supertype : "");
  return [no, kind].filter(Boolean).join(" · ");
}

function renderFocusMeta(pull) {
  if (!pull || !pull.revealed) {
    els.focusMeta.innerHTML = "";
    els.focusMeta.classList.remove("in");
    return;
  }
  // A hit's name is the shop's signage; any other card is set like a page title.
  const odds = hitTier(pull) >= 2 ? pullOdds(pull) : "";
  els.focusMeta.innerHTML = `
    <p class="focus-kicker">${rarityMark(pull)}<span>${esc(rarityLine(pull))}${odds ? `, ${esc(odds)}` : ""}</span></p>
    <h2 class="focus-title${hitTier(pull) >= 2 ? " sign" : ""}">${esc(pull.name)}</h2>
    <p class="focus-data">${esc(cardDataLine(pull))}${pull.wasNew ? `<br><span class="focus-new">New to your collection</span>` : ""}</p>`;
}

function syncActions() {
  const ready = packPhase === "ready";
  const reveal = packPhase === "reveal";
  const spread = packPhase === "spread";
  const pull = currentPulls[focusIndex];
  els.overlay.dataset.phase = packPhase;
  els.overlayActions.classList.toggle("hidden", packPhase === "idle");
  els.overlay.classList.toggle("is-spread", spread || packPhase === "summary");
  els.skipBtn.classList.toggle("hidden", !(ready || reveal));
  els.skipHitsBtn.classList.toggle("hidden", !canSkipToHits());
  const summary = packPhase === "summary";
  const boxLeft = sealedRun ? sealedRun.packs.length - sealedRun.index - 1 : 0;
  els.againBtn.classList.toggle("hidden", !spread);
  if (sealedRun) {
    els.againBtn.disabled = false;
    els.againBtn.title = "";
    // A battle deck is its promo and nothing else: there is no next pack or summary.
    els.againBtn.classList.toggle("hidden", !spread || !sealedRun.packs.length);
    els.againBtn.textContent = sealedRun.index < 0
      ? `Open pack 1 of ${sealedRun.packs.length}`
      : boxLeft
        ? `Next pack (${sealedRun.index + 2} of ${sealedRun.packs.length})`
        : `${sealedRun.product.short} summary`;
  } else {
    els.againBtn.disabled = spread && state.coins < liveSet.cost;
    els.againBtn.title = els.againBtn.disabled ? "Claim coins or sell extras to open another pack" : "";
    // The action wears the price the way the pack on the wall does.
    els.againBtn.innerHTML = `Open another <span class="op-price">${coinAmount(liveSet.cost)}</span>`;
  }
  els.boxSummaryBtn?.classList.toggle("hidden", !(sealedRun && boxLeft > 0 && !summary && sealedRun.index >= 0));
  if (els.boxSummaryBtn && sealedRun) els.boxSummaryBtn.textContent = `Skip to ${sealedRun.product.noun} summary`;
  // Mid-box, the way out is the summary, so the remaining packs aren't skipped unseen.
  const exits = summary || (spread && !boxLeft);
  els.viewPullsBtn.classList.toggle("hidden", !exits);
  els.doneBtn.classList.toggle("hidden", !exits);
  const keep = spread && !sealedRun ? binderHitCard() : null;
  els.binderHitBtn.classList.toggle("hidden", !keep);
  if (keep) els.binderHitBtn.textContent = `Put ${keep.name} in your binder`;
  els.stepBtn.classList.toggle("hidden", spread || summary);
  els.leavePack?.classList.toggle("hidden", summary);
  els.ripHint.classList.toggle("hidden", reveal || spread);
  els.thumbs.classList.toggle("hidden", !(reveal && showStrip));
  if (ready) els.stepBtn.textContent = "Tear pack";
  else if (reveal && pull && !pull.revealed) els.stepBtn.textContent = flipBusy ? "Flipping…" : "Flip";
  else if (reveal && remainingBacks()) els.stepBtn.textContent = "Next card";
  else if (reveal) els.stepBtn.textContent = "See the pack";

  const canPrev = reveal && !flipBusy && currentPulls.some((card, i) => i < focusIndex && card.drawn);
  const canNext =
    reveal &&
    !flipBusy &&
    (Boolean(pull && pull.drawn && !pull.revealed) ||
      currentPulls.some((card, i) => i > focusIndex && card.drawn) ||
      remainingBacks() > 0 ||
      Boolean(pull && pull.revealed));
  els.focusPrev.disabled = !canPrev;
  els.focusNext.disabled = !canNext;
  els.focusPrev.classList.toggle("hidden", !reveal);
  els.focusNext.classList.toggle("hidden", !reveal);
}

const thumbsShown = new Set();

function renderThumbs() {
  const hints = slotHints();
  els.thumbs.innerHTML = currentPulls
    .map((card, i) => {
      const hint = hints[i] || { label: String(i + 1), kind: "basic" };
      // A face-down card is its back; the slot's rarity is printed under it.
      if (!card.revealed) {
        return `<div class="thumb empty ${hint.kind} ${i === focusIndex && card.drawn ? "current" : ""}" title="${esc(hint.label)}"><i class="thumb-back" aria-hidden="true"></i><span>${esc(hint.label)}</span></div>`;
      }
      const hit = hitTier(card) >= 2 ? "hit" : card.reverse ? "rev" : "";
      // Only a card revealed since the last paint pops in; the rest stay put.
      const pop = thumbsShown.has(i) ? "" : "pop";
      thumbsShown.add(i);
      return `<button type="button" class="thumb ${hit} ${pop} ${i === focusIndex ? "current" : ""}"
        data-focus="${i}" title="${esc(card.name)}, ${esc(rarityLine(card))}"${i === focusIndex ? ` aria-current="true"` : ""}>
        ${tcgFace(card, { small: true, stamp: false })}<span>${esc(hint.label)}</span>
      </button>`;
    })
    .join("");
  // Keep the current card's thumb in view once the strip is wider than the screen.
  const now = els.thumbs.querySelector(".thumb.current");
  if (now && els.thumbs.scrollWidth > els.thumbs.clientWidth) {
    const strip = els.thumbs.getBoundingClientRect();
    const box = now.getBoundingClientRect();
    const left = els.thumbs.scrollLeft + (box.left - strip.left) - (strip.width - box.width) / 2;
    els.thumbs.scrollTo({ left: Math.max(0, left), behavior: reduceMotion() ? "auto" : "smooth" });
  }
}

/** Every state class the hit choreography puts on the overlay. */
const HIT_CLASSES = [
  "hit-flash", "hit-shake", "hit-shake-sm", "charging", "charged",
  "charge-t2", "charge-t3", "hit-t1", "hit-t2", "hit-t3",
];

function clearHitFx() {
  clearTimeout(playHitFx._t);
  clearTimeout(playHitFx._b);
  playHitFx._t = 0;
  playHitFx._b = 0;
  els.hitFx.replaceChildren();
  els.overlay.classList.remove(...HIT_CLASSES);
  els.focusCard.classList.remove("charging", "charged");
}

/** How long a hit builds up before it turns over; commons and rares flip at once. */
function chargeMs(card) {
  const tier = hitTier(card);
  if (tier < 2 || !hitFxOk()) return 0;
  return tier >= 3 ? 1150 : 620;
}

function playHitFx(card) {
  const tier = hitTier(card);
  clearHitFx();
  if (!tier) return;
  buzz(tier >= 3 ? [24, 40, 60] : tier === 2 ? [18, 30, 30] : 18);
  if (!hitFxOk()) return;
  els.overlay.classList.add(`hit-t${tier}`);
  // The burst lands as the face turns toward the viewer, a little under
  // half-way through the flip (earlier for a charged card, whose turn starts
  // faster). A fixed handful of sparks: each one is its own small layer, so
  // the count is the cost.
  const at = Math.round(flipDurationMs() * (tier >= 2 ? 0.37 : 0.42));
  const frag = document.createDocumentFragment();
  const count = tier === 3 ? 16 : tier === 2 ? 12 : 6;
  const reach = tier === 3 ? 210 : tier === 2 ? 170 : 120;
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    spark.className = `hit-spark t${tier}${tier >= 2 && i % 2 === 1 ? " streak" : ""}`;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const dist = reach * (0.7 + Math.random() * 0.5);
    spark.style.setProperty("--sx", `${(Math.cos(angle) * dist).toFixed(1)}px`);
    spark.style.setProperty("--sy", `${(Math.sin(angle) * dist).toFixed(1)}px`);
    spark.style.setProperty("--ang", `${((angle * 180) / Math.PI).toFixed(1)}deg`);
    spark.style.setProperty("--dly", `${Math.round(at + Math.random() * 120)}ms`);
    frag.appendChild(spark);
  }
  for (let i = 0; i < Math.min(tier, 2); i += 1) {
    const ring = document.createElement("i");
    ring.className = `hit-ring t${tier}`;
    ring.style.setProperty("--dly", `${at + i * 170}ms`);
    frag.appendChild(ring);
  }
  els.hitFx.appendChild(frag);
  clearTimeout(playHitFx._b);
  playHitFx._b = setTimeout(() => {
    // The flash lets the dimmed room go; the halo and rays blow out with it.
    els.overlay.classList.remove("charged");
    els.overlay.classList.add("hit-flash");
    if (tier >= 3) els.overlay.classList.add("hit-shake");
    else if (tier === 2) els.overlay.classList.add("hit-shake-sm");
    renderThumbs();
  }, at);
  clearTimeout(playHitFx._t);
  playHitFx._t = setTimeout(() => {
    els.overlay.classList.remove("hit-shake", "hit-shake-sm", "hit-flash");
    els.hitFx.replaceChildren();
  }, tier === 3 ? 2800 : tier === 2 ? 2000 : 1400);
}

function bumpCardMotion() {
  flipGen += 1;
  clearTimeout(flipTimer);
  flipTimer = 0;
  return flipGen;
}

function unlockCard(gen) {
  if (gen !== flipGen) return;
  flipBusy = false;
  syncActions();
  if (!pendingAdvance || packPhase !== "reveal") return;
  pendingAdvance = false;
  requestAnimationFrame(() => {
    if (!flipBusy && packPhase === "reveal") advanceOpen();
  });
}

function flipDurationMs() {
  const sec = parseFloat(getComputedStyle(els.focusCard).getPropertyValue("--flip-ms"));
  return Number.isFinite(sec) ? Math.round(sec * 1000) : 620;
}

function mountFocus(pull, opts = {}) {
  const faceUp = opts.faceUp ?? pull.revealed;
  const deal = opts.deal ?? !faceUp;
  const foil = isHit(pull) ? "hit" : pull.reverse ? "reverse" : "";
  const tier = hitTier(pull);
  const gen = bumpCardMotion();
  clearGlare();
  els.focusCard.style.transform = "";
  els.focusCard.style.setProperty("--flip-ms", tier >= 2 ? "0.92s" : tier === 1 ? "0.72s" : "0.62s");
  els.focusCard.className = `focus-card ${rarityKey(pull.rarity)} ${foil} t${tier}`;
  els.focusCard.innerHTML = `
    <div class="pull-lift">
      <div class="pull-inner">
        <div class="face-front">${cardBack()}</div>
        <div class="face-back">${tcgFace(pull)}</div>
      </div>
    </div>
    <i class="reveal-sweep" aria-hidden="true"></i>`;
  syncFocusChrome(pull, faceUp, { snap: opts.snap });
  if (faceUp) {
    els.focusCard.classList.add("no-anim", "flipped", "settled");
    void els.focusCard.offsetWidth;
    els.focusCard.classList.remove("no-anim");
  } else if (deal) {
    flipBusy = true;
    if (opts.fromPack) els.focusCard.classList.add("from-pack");
    void els.focusCard.offsetWidth;
    els.focusCard.classList.add("deal");
    const finishDeal = (event) => {
      if (event && event.target !== els.focusCard) return;
      if (gen !== flipGen) return;
      els.focusCard.removeEventListener("animationend", finishDeal);
      els.focusCard.classList.remove("deal", "from-pack");
      unlockCard(gen);
    };
    els.focusCard.addEventListener("animationend", finishDeal);
    flipTimer = setTimeout(() => finishDeal(), opts.fromPack ? 720 : 500);
  }
  renderFocusMeta(pull);
  if (faceUp) els.focusMeta.classList.add("in");
  renderThumbs();
  syncActions();
}

function showPullAt(index, { deal = false } = {}) {
  const pull = currentPulls[index];
  if (!pull || !pull.drawn || flipBusy) return;
  if (index === focusIndex) return;
  focusIndex = index;
  clearHitFx();
  els.packBody.classList.add("hidden");
  els.overlay.classList.add("dealing");
  els.focusWrap.classList.remove("hidden");
  mountFocus(pull, { faceUp: pull.revealed, deal, snap: true });
}

function bestPull() {
  const rank = (card) => RARITY_ORDER.indexOf(card.rarity);
  return currentPulls.reduce((best, card) => {
    if (!best) return card;
    const by = rank(card) - rank(best) || sellValue(card) - sellValue(best);
    return by > 0 ? card : best;
  }, null);
}

/** How a laid-out card introduces itself to a screen reader and on hover. */
function pullLabel(card) {
  return [card.name, rarityLine(card), card.promo ? "promo" : "", card.wasNew ? "new" : ""].filter(Boolean).join(", ");
}

/**
 * Cards laid out on the mat at the end of a pack or a box: the lead card
 * large, the rest beside it in order, and the lead's name under them. Every
 * card opens the inspector.
 */
function endMatHtml(cards, lead, about) {
  const face = (card, big) => `<button type="button" class="spread-card${big ? " top-pull" : ""}"
      ${inspectAttrs(card)} aria-label="${esc(pullLabel(card))}" title="${esc(pullLabel(card))}">
      ${tcgFace(card, { small: !big })}
    </button>`;
  return `<div class="end-mat">
    ${lead ? `<div class="end-lead">${face(lead, true)}</div>` : ""}
    <div class="end-rest">${cards.filter((card) => card !== lead).map((card) => face(card, false)).join("")}</div>
    ${about}
  </div>`;
}

/** The lead card's name, signage when it is a hit, over its own data line. */
function endAboutHtml(card, kicker = "") {
  if (!card) return "";
  const hit = isHit(card);
  const odds = kicker || (hit ? pullOdds(card) : "");
  const data = `${numberLine(card) === "Energy" ? "" : `${numberLine(card)} · `}${rarityLine(card)}`;
  return `<div class="end-about">
    ${odds ? `<p class="end-kicker">${esc(odds)}</p>` : ""}
    <h2 class="end-name${hit ? " sign" : ""}" id="end-name" tabindex="-1">${esc(card.name)}</h2>
    <p class="end-data">${esc(data)}${card.wasNew ? `<br>New to your collection` : ""}</p>
  </div>`;
}

/** Print the till's receipt beside the mat, or tear it off (no argument). */
function setReceipt(html = "") {
  els.opReceipt.innerHTML = html;
  els.opReceipt.classList.toggle("hidden", !html);
  els.overlay.classList.toggle("with-receipt", Boolean(html));
}

const RECEIPT_FOOT = ["Coins are virtual.", "Nothing here costs real money."];

/** The pack's hit, when it could still go in a binder pocket: owned, and not already in one. */
function binderHitCard() {
  const best = bestPull();
  if (!best || !isHit(best) || !activeTrainer()) return null;
  return binderHeld(state, best.id) === 0 && spareFor(state, best.id) > 0 ? best : null;
}

/** Slot the hit into the first empty pocket, adding a page when the binder is full. */
async function putHitInBinder() {
  const card = binderHitCard();
  if (!card) return;
  const slots = state.binder || [];
  let pocket = slots.findIndex((slot) => !slot);
  if (pocket < 0) pocket = slots.length;
  if (pocket >= Math.max(slots.length, BINDER_PAGE * 2)) addBinderPage(state);
  if (!placeInBinder(state, pocket, card.id, Boolean(card.reverse))) return;
  els.binderHitBtn.disabled = true;
  const saved = await pushBinder();
  els.binderHitBtn.disabled = false;
  if (packPhase !== "spread") return;
  syncActions();
  if (saved) {
    toast(`${card.name} is in your binder.`);
    els.doneBtn.focus({ preventScroll: true });
  }
}

/** The set-progress line a receipt ends on, for the set on the shop floor. */
function setProgressLine(set) {
  if (set !== liveSet) return null;
  const done = completion();
  return done.total ? [set.name, `${num(done.owned)} of ${num(done.total)}`] : null;
}

/** One pack's receipt: each pull with its number and value, the hit inverted, then the totals. */
function packReceiptHtml(best) {
  const set = packSet || liveSet;
  const run = sealedRun;
  const values = currentPulls.map((card) => sellValue(card));
  return receiptHtml({
    label: "Receipt for this pack",
    head: [
      run ? `${set.name}, ${run.product.name}` : `${set.name}, pack ${num(state.packsOpened)}`,
      run ? `Pack ${run.index + 1} of ${run.packs.length}` : "",
      [activeWrapper?.name ? `${activeWrapper.name} wrapper` : "", activeTrainer()?.name].filter(Boolean).join(", "),
    ],
    groups: [currentPulls.map((card, i) => pullRow(card, { value: values[i], hit: card === best }))],
    totals: [
      // A box's packs were paid for together; the box summary prints that.
      run ? null : ["Pack cost", liveSet.cost],
      ["New cards", String(currentPulls.filter((card) => card.wasNew).length)],
      setProgressLine(set),
    ],
    total: ["Pack total", money(values.reduce((sum, value) => sum + value, 0))],
    foot: RECEIPT_FOOT,
  });
}

function showSpread() {
  bumpCardMotion();
  flipBusy = false;
  pendingAdvance = false;
  packPhase = "spread";
  clearHitFx();
  clearHandoff();
  clearFocusChrome({ snap: true });
  els.packBody.classList.add("hidden", "emptied");
  els.focusWrap.classList.add("hidden");
  els.thumbs.innerHTML = "";
  els.spread.classList.remove("hidden");

  const best = bestPull();
  els.spread.innerHTML = endMatHtml(currentPulls, best, endAboutHtml(best));
  setReceipt(packReceiptHtml(best));

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  els.overlay.scrollTop = 0;
  const lead = els.againBtn.classList.contains("hidden") || els.againBtn.disabled ? els.viewPullsBtn : els.againBtn;
  lead.focus({ preventScroll: true });
}

function drawNext(opts = {}) {
  const next = currentPulls.find((card) => !card.drawn);
  if (!next) {
    showSpread();
    return;
  }
  next.drawn = true;
  focusIndex = currentPulls.indexOf(next);
  els.packBody.classList.add("hidden");
  els.overlay.classList.add("dealing");
  els.focusWrap.classList.remove("hidden");
  clearHitFx();
  mountFocus(next, { faceUp: false, deal: true, fromPack: opts.fromPack });
}

function afterFlip(gen) {
  if (gen !== flipGen) return;
  els.focusCard.classList.remove("flipping");
  els.focusCard.classList.add("settled");
  const pull = currentPulls[focusIndex];
  if (pull && hitTier(pull) >= 1 && fxOk()) els.focusCard.classList.add("swept");
  if (pull) {
    syncFocusChrome(pull, true);
    renderFocusMeta(pull);
    requestAnimationFrame(() => els.focusMeta.classList.add("in"));
  }
  unlockCard(gen);
}

function flipCurrent() {
  const pull = currentPulls[focusIndex];
  if (!pull || pull.revealed || flipBusy) return;
  const gen = bumpCardMotion();
  flipBusy = true;
  pull.revealed = true;
  const charge = chargeMs(pull);
  if (charge) {
    // A hit gathers itself first: the room dims and the card trembles, then it turns.
    const tier = hitTier(pull);
    clearHitFx();
    els.overlay.style.setProperty("--charge-ms", `${charge}ms`);
    els.focusCard.classList.add("charging");
    els.overlay.classList.add("charging", `charge-t${tier}`);
    buzz(tier >= 3 ? [8, 60, 8, 60, 8] : 8);
    syncActions();
    flipTimer = setTimeout(() => {
      if (gen !== flipGen) return;
      // The light holds where it gathered until the flash lets it go.
      els.focusCard.classList.remove("charging");
      els.focusCard.classList.add("charged");
      els.overlay.classList.remove("charging");
      els.overlay.classList.add("charged");
      turnCard(pull, gen);
    }, charge);
    return;
  }
  turnCard(pull, gen);
}

function turnCard(pull, gen) {
  const tier = hitTier(pull);
  clearGlare();
  els.focusCard.classList.add("flipping");
  void els.focusCard.offsetWidth;
  // The charged pose is the turn's starting point (see .charged in opening.css).
  els.focusCard.classList.remove("charged");
  els.focusCard.classList.add("flipped");
  if (tier) playHitFx(pull);
  // A hit's thumb fills in with the flash, so the turn's first frame has no
  // strip rebuild in it; a plain card's thumb updates now.
  if (!tier || !hitFxOk()) renderThumbs();
  syncActions();
  const inner = els.focusCard.querySelector(".pull-inner");
  let settled = false;
  const settle = (event) => {
    if (event) {
      if (event.target !== inner) return;
      if (event.propertyName && event.propertyName !== "transform") return;
    }
    if (gen !== flipGen || settled) return;
    settled = true;
    inner?.removeEventListener("transitionend", settle);
    afterFlip(gen);
  };
  inner?.addEventListener("transitionend", settle);
  flipTimer = setTimeout(settle, flipDurationMs() + 72);
}

function goPrevCard() {
  if (packPhase !== "reveal" || flipBusy) return;
  for (let i = focusIndex - 1; i >= 0; i -= 1) {
    if (currentPulls[i].drawn) {
      showPullAt(i);
      return;
    }
  }
}

function advanceOpen() {
  if (packPhase !== "reveal") return;
  if (flipBusy) {
    pendingAdvance = true;
    return;
  }
  const pull = currentPulls[focusIndex];
  if (!pull) return;
  if (pull.drawn && !pull.revealed) {
    flipCurrent();
    return;
  }
  const nextDrawn = currentPulls.findIndex((card, i) => i > focusIndex && card.drawn);
  if (nextDrawn >= 0) {
    showPullAt(nextDrawn);
    return;
  }
  if (remainingBacks()) {
    drawNext();
    return;
  }
  showSpread();
}

function skipToHits() {
  if (!canSkipToHits() || flipBusy) return;
  const start = hitStartIndex();
  currentPulls.forEach((card, i) => {
    if (i < start) {
      card.drawn = true;
      card.revealed = true;
    }
  });
  const pull = currentPulls[start];
  pull.drawn = true;
  focusIndex = start;
  clearHitFx();
  els.packBody.classList.add("hidden");
  els.overlay.classList.add("dealing");
  els.focusWrap.classList.remove("hidden");
  els.spread.classList.add("hidden");
  mountFocus(pull, { faceUp: pull.revealed, deal: !pull.revealed, snap: true });
}

function revealAllCards() {
  if (packPhase === "ready") {
    tearing = false;
    packExiting = false;
    tear.reset();
    clearHandoff();
    els.packBody.classList.add("hidden", "emptied");
    packPhase = "reveal";
  }
  if (packPhase !== "reveal") return;
  currentPulls.forEach((card) => {
    card.drawn = true;
    card.revealed = true;
  });
  showSpread();
}

function syncBoxProgress() {
  if (!els.boxProgress) return;
  // The spread's own kicker names the pack, so the bar shows while tearing and flipping.
  const on = Boolean(sealedRun) && (packPhase === "ready" || packPhase === "reveal");
  els.boxProgress.classList.toggle("hidden", !on);
  if (on) {
    const total = sealedRun.packs.length;
    const done = sealedRun.index;
    // One pip per pack when they fit; a plain bar for the biggest products.
    const meter =
      total <= 40
        ? `<span class="box-pips">${Array.from(
            { length: total },
            (_, i) => `<i class="${i < done ? "done" : i === done ? "now" : ""}"></i>`
          ).join("")}</span>`
        : `<span class="box-progress-bar"><span style="width:${(done / total) * 100}%"></span></span>`;
    els.boxProgress.innerHTML = `<b>${esc(sealedRun.product.name)}</b><span>Pack ${done + 1} of ${total}</span>${meter}`;
  }
}

function nextBoxPack() {
  if (!sealedRun) return;
  const pack = sealedRun.packs[sealedRun.index + 1];
  if (!pack) {
    showBoxSummary();
    return;
  }
  sealedRun.index += 1;
  finishRip({ keepOpen: true });
  presentPack(pack.wrapper, pack.cards, pack.set);
}

/** Leaving mid-box goes to the summary: the rest of the box is already in the collection. */
function leavePack() {
  if (sealedRun && packPhase !== "summary") showBoxSummary();
  else finishRip();
}

/** Every hit from the whole product on the mat, best first, and one long receipt for the box. */
function showBoxSummary() {
  if (!sealedRun) return;
  const run = sealedRun;
  finishRip({ keepOpen: true });
  sealedRun = run;
  packPhase = "summary";
  els.overlay.classList.add("is-spread");
  els.packBody.classList.add("hidden", "emptied");
  els.focusWrap.classList.add("hidden");
  els.thumbs.innerHTML = "";
  els.spread.classList.remove("hidden");

  const promos = run.promos || [];
  const all = [...promos, ...run.packs.flatMap((pack) => pack.cards)];
  const hits = all.filter((card) => isHit(card));
  const rank = (card) => RARITY_ORDER.indexOf(card.rarity);
  // The promos lead, then the hits (or the best cards, in a box with none).
  const shown = [
    ...promos,
    ...(hits.length ? hits : all.filter((card) => card.rarity !== "Energy" && !card.promo))
      .map((card, i) => ({ card, i }))
      .sort((a, b) => rank(b.card) - rank(a.card) || sellValue(b.card) - sellValue(a.card) || a.i - b.i)
      .slice(0, hits.length ? 60 : 12)
      .map(({ card }) => card),
  ];
  // The best hit takes the big spot; a box with no pack hits leads with its first promo.
  const lead = shown[hits.length ? promos.length : 0] || null;
  const unseen = run.packs.length - run.index - 1;
  const boxCards = run.boxCards || [];
  const kicker = hits.length
    ? `${hits.length} hit${hits.length === 1 ? "" : "s"} in the ${run.product.noun}`
    : promos.length
      ? "No pack hits, but the promos are yours"
      : "No hits this time";
  const tip = [
    unseen > 0 ? `${unseen} unopened pack${unseen === 1 ? " was" : "s were"} added straight to your collection.` : "",
    boxCards.length ? `The box's other ${boxCards.reduce((sum, card) => sum + card.n, 0)} cards are in your collection too.` : "",
    hits.length || !run.packs.length ? "" : "Showing the best cards instead.",
  ].filter(Boolean).join(" ");

  els.spread.innerHTML = `${endMatHtml(shown, lead, endAboutHtml(lead, kicker))}
    ${tip ? `<p class="spread-tip">${esc(tip)}</p>` : ""}`;
  setReceipt(boxReceiptHtml(run, lead));

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  paintWhere();
  els.overlay.scrollTop = 0;
  els.viewPullsBtn.focus({ preventScroll: true });
}

/**
 * The box's receipt: every pack with its subtotal and the hits under it, the
 * promos and the rest of the box, the hits by rarity, what was paid and what
 * it all comes to. Packs the player skipped are marked unopened.
 */
function boxReceiptHtml(run, lead) {
  const set = run.packs[0]?.set || run.set || liveSet;
  const promos = run.promos || [];
  const boxCards = run.boxCards || [];
  const row = (card) => pullRow(card, { value: sellValue(card), hit: card === lead });
  let total = 0;
  const packRows = run.packs.flatMap((pack, i) => {
    const value = money(pack.cards.reduce((sum, card) => sum + sellValue(card), 0));
    total += value;
    const hits = pack.cards.filter((card) => isHit(card)).map((card) => ({ ...row(card), sub: true }));
    return [{ name: `Pack ${i + 1}`, tags: i > run.index ? ["unopened"] : [], value }, ...hits];
  });
  const promoRows = promos.map((card) => {
    total += sellValue(card);
    return { ...row(card), tags: ["promo", ...(card.wasNew ? ["new"] : [])] };
  });
  const boxCount = boxCards.reduce((sum, card) => sum + card.n, 0);
  const boxValue = money(boxCards.reduce((sum, card) => sum + sellValue(card) * card.n, 0));
  total += boxValue;
  const rank = (rarity) => RARITY_ORDER.indexOf(rarity);
  const counts = {};
  for (const pack of run.packs) {
    for (const card of pack.cards) if (isHit(card)) counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  }
  const tally = Object.entries(counts)
    .sort((a, b) => rank(b[0]) - rank(a[0]))
    .map(([rarity, n]) => ({ name: RARITY_LABEL[rarity] || rarity, value: String(n) }));
  const cards = [...promos, ...run.packs.flatMap((pack) => pack.cards), ...boxCards];
  return receiptHtml({
    label: `Receipt for the ${run.product.noun}`,
    head: [set.name, `${run.product.name}, ${run.packs.length} pack${run.packs.length === 1 ? "" : "s"}`, activeTrainer()?.name],
    groups: [
      promoRows,
      packRows,
      boxCount ? [{ name: "Rest of the box", code: `${boxCount} cards`, value: boxValue }] : [],
      tally,
    ],
    totals: [
      ["Paid", run.cost],
      ["New cards", String(cards.filter((card) => card.wasNew).length)],
      setProgressLine(set),
    ],
    total: [`${run.product.short || "Box"} total`, money(total)],
    foot: RECEIPT_FOOT,
  });
}

function setPackArt(wrap) {
  els.packRestArt.innerHTML = packPicture(wrap);
}

/** The foil tear itself lives in js/tear.js; this wires it to the stage. */
const tear = createTear({
  booster: els.packBody,
  art: els.packRestArt,
  strip: els.tearStrip,
  edge: els.tearEdge,
  shade: els.tearShade,
  glints: els.tearGlints,
  fxOn: () => fxOk(),
  buzz: (pattern) => buzz(pattern),
});

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function resetTear() {
  tearing = false;
  tear.newPack();
  els.overlay.classList.remove("dealing");
  els.packBody.classList.remove(
    "torn",
    "tearing",
    "dragging",
    "emptied",
    "hidden",
    "cutting",
    "pack-exit",
    "spill",
    "tear-from-left",
    "tear-from-right"
  );
}

async function startRip(wrapper) {
  if (!activeTrainer()) {
    toast("Sign in to rip packs. Cards save to your account.");
    openAuth("signup");
    return;
  }
  if (!wrapper) {
    toast("Couldn't open that pack.");
    return;
  }
  if (ripLock || packPhase !== "idle") return;
  if (state.coins < liveSet.cost) {
    toast("Not enough coins.");
    return;
  }
  ripLock = true;
  try {
    const pack = await api("/api/packs/rip", {
      method: "POST",
      body: JSON.stringify({ setId: liveSet.id, wrapperId: wrapper.id }),
    });
    sealedRun = null;
    afterEconomy(pack.save);
    renderHeader();
    renderShop();
    presentPack(wrapper, pack.cards);
  } catch (err) {
    toast(err.message || "Couldn't rip that pack.");
    renderHeader();
    renderShop();
  } finally {
    ripLock = false;
  }
}

/**
 * Pack art for a pack the server opened: one of its set's wrappers, or a
 * special pack's. A promo set's boxes hold other sets' packs.
 */
function wrapperFor(id, set = liveSet) {
  const special = Object.values(set.specialPacks || {}).find((pack) => pack.wrapper.id === id);
  return special?.wrapper || set.wrappers.find((w) => w.id === id) || set.wrappers[0];
}

/** A set's cards, fetched once, for a box that holds another set's packs. */
async function loadSetData(set) {
  if (setCache[set.id]) return setCache[set.id];
  const list = await fetch(set.dataFile, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
  setCache[set.id] = list;
  applyCachedPrices(list, set.id);
  return list;
}

/**
 * Buy a whole sealed product. The server opens every pack; we deal them one at
 * a time. A product with promo cards shows them first, face up, the way they
 * sit in the window of the real box.
 */
async function startSealed(productId) {
  if (!activeTrainer()) {
    toast("Sign in to open boxes. Cards save to your account.");
    openAuth("signup");
    return;
  }
  const offer = findOffer(sealedPrices[liveSet.id], productList[liveSet.id], productId);
  if (!offer) {
    toast("That product isn't sold for this set.");
    return;
  }
  if (ripLock || packPhase !== "idle") return;
  if (state.coins < offer.price) {
    toast("Not enough coins.");
    return;
  }
  ripLock = true;
  try {
    const data = await api("/api/sealed/open", {
      method: "POST",
      body: JSON.stringify({ setId: liveSet.id, product: offer.id }),
    });
    afterEconomy(data.save);
    const packs = (data.packs || []).map((pack) => {
      const set = pack.setId ? getSet(pack.setId) : liveSet;
      return { set, wrapper: wrapperFor(pack.wrapperId, set), cards: pack.cards || [] };
    });
    // The inspector looks cards up by id, so another set's packs need its data.
    await Promise.all(
      [...new Set(packs.map((pack) => pack.set))].map((set) => loadSetData(set).catch(() => null))
    );
    const promos = (data.promos || []).map((card) => ({ ...card, reverse: false }));
    const gift = Array.isArray(data.gear) ? data.gear : [];
    // The rest of the box (a deck's other cards, an ETB's Energy): each card of its own set.
    const boxCards = (data.boxCards || []).map((card) => ({ ...card, reverse: false }));
    await Promise.all(
      [...new Set(boxCards.map((card) => setForCard(card)))].map((set) => loadSetData(set).catch(() => null))
    );
    sealedRun = {
      product: { ...offer, ...data.product },
      packs,
      promos,
      gift,
      boxCards,
      index: promos.length || boxCards.length || gift.length ? -1 : 0,
      cost: data.cost,
    };
    renderHeader();
    renderShop();
    if (promos.length || boxCards.length || gift.length) showPromoIntro();
    else if (packs.length) presentPack(packs[0].wrapper, packs[0].cards, packs[0].set);
  } catch (err) {
    toast(err.message || "Couldn't open that box.");
    renderHeader();
    renderShop();
  } finally {
    ripLock = false;
  }
}

/**
 * The rest of a box on the table under its promos: a battle deck's other cards
 * or an ETB's Energy, grouped Pokémon, Trainer, Energy, each card once with
 * its copy count.
 */
function boxCardsHtml(box, label) {
  const groups = [
    ["Pokémon", (card) => card.supertype === "Pokémon"],
    ["Trainer", (card) => card.supertype === "Trainer"],
    ["Energy", (card) => card.supertype === "Energy" || card.energy],
  ];
  const seen = new Set();
  const sections = groups
    .map(([name, test]) => {
      const list = box.filter((card) => !seen.has(card.id) && test(card));
      list.forEach((card) => seen.add(card.id));
      return { name, list };
    })
    .concat({ name: "Other", list: box.filter((card) => !seen.has(card.id)) })
    .filter((group) => group.list.length);
  let index = 0;
  return `<section class="box-cards" aria-label="${esc(label)}">
    <h3 class="box-cards-title">${esc(label)}</h3>
    ${sections
      .map(
        (group) => `<div class="box-cards-group">
      <h4>${esc(group.name)} <span>${group.list.reduce((sum, card) => sum + card.n, 0)}</span></h4>
      <div class="box-cards-grid">${group.list
        .map(
          (card) => `<button type="button" class="box-card" style="--d:${Math.min(index++, 24) * 25}ms"
          ${inspectAttrs(card)} title="${esc(card.name)} · ${esc(rarityLine(card))}">
        ${tcgFace(card, { small: true })}
        ${card.n > 1 ? `<span class="box-count">×${card.n}</span>` : ""}
        ${card.wasNew ? `<span class="box-new">New</span>` : ""}
      </button>`
        )
        .join("")}</div>
    </div>`
      )
      .join("")}
  </section>`;
}

/**
 * The product's promo cards on the table before its first pack: they are the
 * reason to buy the box, so they get a spread of their own.
 */
function showPromoIntro() {
  const run = sealedRun;
  if (!run) return;
  bumpCardMotion();
  flipBusy = false;
  pendingAdvance = false;
  packPhase = "spread";
  clearHitFx();
  clearHandoff();
  clearFocusChrome({ snap: true });
  paintOpeningStage(run.packs[0]?.wrapper || (run.set || liveSet).wrappers[0]);
  els.overlay.classList.add("is-spread");
  els.packBody.classList.add("hidden", "emptied");
  els.focusWrap.classList.add("hidden");
  els.thumbs.innerHTML = "";
  els.spread.classList.remove("hidden");

  const promos = run.promos;
  const box = run.boxCards || [];
  const boxTotal = box.reduce((sum, card) => sum + card.n, 0);
  const worth = money(
    promos.reduce((sum, card) => sum + sellValue(card), 0) + box.reduce((sum, card) => sum + sellValue(card) * card.n, 0)
  );
  const fresh = [...promos, ...box].filter((card) => card.wasNew).length;
  const packs = run.packs.length;
  const gift = run.gift || [];
  const giftHead =
    gift.some((g) => g.kind === "coin") && gift.some((g) => g.kind === "sleeve")
      ? `Sleeves and a coin in the ${run.product.noun}`
      : gift.some((g) => g.kind === "coin")
        ? `A coin in the ${run.product.noun}`
        : `Sleeves in the ${run.product.noun}`;
  const head = !promos.length
    ? boxTotal
      ? `${boxTotal} cards in the ${run.product.noun}`
      : giftHead
    : promos.length === 1
      ? `${promos[0].name}, ${numberLine(promos[0])}`
      : `${promos.length} promos in the ${run.product.noun}`;
  // A plain line of facts: the promos are the show, so nothing here is a badge.
  const facts = [
    promos.length ? `${promos.length} promo${promos.length === 1 ? "" : "s"}` : "",
    box.length ? `${boxTotal} in the box` : "",
    `${fresh} new`,
    `${coinAmount(worth)} value`,
    packs ? `${packs} pack${packs === 1 ? "" : "s"} to open` : "",
  ].filter(Boolean);
  els.spread.innerHTML = `
    <div class="spread-head">
      <h2>${esc(head)}</h2>
      <p class="spread-facts">${facts.join(", ")}</p>
    </div>
    ${
      promos.length
        ? `<div class="spread-grid promo-spread">${promos
            .map(
              (card, i) => `<button type="button" class="spread-card promo-pull ${i === 0 ? "top-pull" : ""}"
          ${inspectAttrs(card)}
          aria-label="${esc(pullLabel(card))}" title="${esc(pullLabel(card))}">
        ${tcgFace(card)}
      </button>`
            )
            .join("")}</div>`
        : ""
    }
    ${box.length ? boxCardsHtml(box, boxContents[`${(run.set || liveSet).id}/${run.product.id}`]?.label || "The rest of the box") : ""}
    ${giftHtml(gift, state.gear, { also: promos.length > 0 || box.length > 0 })}
    ${(() => {
      const tip = packs ? "The packs come next." : box.length ? "" : "The deck's other cards aren't simulated.";
      return tip ? `<p class="spread-tip">${tip}</p>` : "";
    })()}`;

  els.ripHint.textContent = "";
  setReceipt();
  syncBoxProgress();
  syncActions();
  paintWhere();
  openDialog(els.overlay, packs ? els.againBtn : els.doneBtn);
}

/**
 * Put a freshly ripped pack on the table, ready to tear. `set` is the set the
 * pack belongs to, which is not the live set for a promo set's boxes.
 */
function presentPack(wrapper, pulled, set = liveSet) {
  activeWrapper = wrapper;
  packSet = set || liveSet;
  currentPulls = (pulled || []).map((card) => ({
    ...card,
    reverse: Boolean(card.reverse),
    revealed: false,
    drawn: false,
  }));
  if (!currentPulls.length) {
    toast("That pack came back empty.");
    return;
  }

  packPhase = "ready";
  focusIndex = 0;
  bumpCardMotion();
  flipBusy = false;
  pendingAdvance = false;
  packExiting = false;
  showStrip = false;
  resetTear();
  clearFocusChrome({ snap: true });
  els.packBody.classList.remove("hidden", "emptied", "pack-exit");
  thumbsShown.clear();
  paintOpeningStage(wrapper);
  setPackArt(wrapper);
  els.focusWrap.classList.add("hidden");
  els.spread.classList.add("hidden");
  els.spread.innerHTML = "";
  els.thumbs.innerHTML = "";
  els.ripHint.textContent = "Grab the top and drag across to rip it open";
  setReceipt();
  syncBoxProgress();
  syncActions();
  paintWhere();
  openDialog(els.overlay, els.stepBtn);
  warmPullImages();
}

/**
 * Fetch the pack's card faces while the wrapper is still on. Without this the
 * first card's photo is requested the instant it lands, and the decode and the
 * repaint fall inside its own deal animation. The first face is decoded now;
 * the rest only need to be in the cache before their flip.
 */
function warmPullImages() {
  const faces = [];
  for (const card of currentPulls) {
    if (card.image) faces.push(card.image);
    if (card.imageSmall) faces.push(card.imageSmall);
  }
  faces.forEach((src, i) => {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (i === 0) img.decode().catch(() => {});
  });
}

function clearHandoff() {
  clearTimeout(handoffTimer);
  handoffTimer = 0;
  els.overlay.classList.remove("handoff");
  els.packBody.classList.remove("pack-exit");
  els.focusCard.classList.remove("deal", "from-pack");
}

function hidePackThenDeal() {
  clearTimeout(handoffTimer);
  handoffTimer = 0;
  if (packPhase !== "ready") return;
  packExiting = false;
  packPhase = "reveal";
  tear.reset();
  els.packBody.classList.add("hidden", "emptied");
  els.packBody.classList.remove("torn", "tearing", "dragging", "cutting", "pack-exit", "spill");
  els.overlay.classList.add("dealing");
  els.ripHint.textContent = "";
  showStrip = true;
  drawNext({ fromPack: true });
}

function completeTear() {
  if (packPhase !== "ready" || packExiting) return;
  packExiting = true;
  tearing = false;
  els.packBody.classList.add("tearing", "torn");
  els.packBody.classList.remove("dragging");
  els.ripHint.textContent = "Wrapper coming off";
  buzz([12, 18, 26]);
  tear.complete({
    onRipped() {
      tearBurst();
      if (fxOk()) els.packBody.classList.add("spill");
    },
    onDone() {
      // Let the cards clear the wrapper before the first one comes forward.
      if (els.packBody.classList.contains("spill")) handoffTimer = setTimeout(hidePackThenDeal, 300);
      else hidePackThenDeal();
    },
  });
}

function finishRip({ keepOpen = false, collection = false } = {}) {
  // A box of a batch order hands control back to that order's results when it ends.
  const back = keepOpen ? null : sealedRun?.onDone;
  if (!keepOpen) sealedRun = null;
  currentPulls = [];
  packPhase = "idle";
  bumpCardMotion();
  flipBusy = false;
  pendingAdvance = false;
  packExiting = false;
  showStrip = false;
  resetTear();
  clearHitFx();
  clearHandoff();
  els.packBody.classList.add("hidden");
  setReceipt();
  if (!keepOpen) closeDialog(els.overlay);
  syncBoxProgress();
  clearTimeout(auraTimer);
  auraTimer = 0;
  auraGen += 1;
  els.overlay.classList.remove("dealing", "rainbow", "glow-on", "aura-snap", "is-spread", ...HIT_CLASSES);
  els.overlay.style.removeProperty("--aura");
  els.focusWrap.classList.remove("rainbow", "revealed", "is-hit", "is-legend", "is-reverse", "aura-snap");
  els.focusWrap.style.removeProperty("--aura");
  delete els.focusWrap.dataset.glow;
  els.focusAura.classList.remove("rays");
  renderHeader();
  renderShop();
  if (view === "home") renderHome();
  if (view === "collection") renderCollection();
  if (!keepOpen && !back) toast("Added to collection.");
  back?.({ collection });
}

function inspectFromEl(el) {
  const slot = el.closest("[data-inspect]");
  if (!slot) return;
  openInspect(slot.dataset.inspect, slot.dataset.reverse === "1", slot.dataset.reverseKind || "");
}

/** The card the inspector is currently showing, for the chart's range buttons. */
let inspectCard = null;
let inspectRange = "30d";
let inspectOpenedAt = 0;

function inspectSellRow(card) {
  const count = rawQty(card.id);
  const slabs = slabsOf(card.id);
  const value = sellValue(card);
  if (!activeTrainer()) {
    return `<div class="pc-sell">
      <span class="pc-own">Sign in to keep and sell cards.</span>
    </div>`;
  }
  if (count < 1 && !slabs.length) {
    return `<div class="pc-sell">
      <span class="pc-own">Not in your collection yet.</span>
    </div>`;
  }
  const gradedNote = slabs.length ? ` and ${slabs.length === 1 ? "one graded copy" : `${num(slabs.length)} graded copies`}` : "";
  const own = count < 1
    ? `You own ${slabs.length === 1 ? "one graded copy" : `${num(slabs.length)} graded copies`} and no raw copy.`
    : `You own ${count === 1 ? "one copy" : `${num(count)} copies`}${gradedNote}.`;
  const gradeHref = `/grading/send/${encodeURIComponent(heldId(card.id))}${card.reverse ? "?reverse=1" : ""}`;
  return `<div class="pc-sell">
    <span class="pc-own">${own}</span>
    <span class="pc-actions">
      ${count > 0 ? `<button type="button" class="solid pc-sell-btn" data-inspect-sell="${esc(heldId(card.id))}">
        Sell one for <span class="pc-sell-value">${coinAmount(value)}</span>
      </button>
      <a class="ghost pc-grade-btn" href="${esc(gradeHref)}">Send for grading</a>` : ""}
      ${inspectShowcaseBtn(card)}
    </span>
  </div>${inspectGradedRow(card, slabs)}`;
}

/** The player's slabs of this card, as small cases that open on the grading page. */
function inspectGradedRow(card, slabs) {
  if (!slabs.length) return "";
  const set = setForCard(card);
  const list = [...slabs].sort((a, b) => b.grade - a.grade || Number(Boolean(b.blackLabel)) - Number(Boolean(a.blackLabel)) || b.gradedAt - a.gradedAt);
  return `<div class="pc-graded">
    <span class="pc-own">Graded ${list.length === 1 ? "copy" : "copies"}</span>
    <div class="pc-slabs">${list
      .map((slab) => {
        const face = slab.reverse ? { ...card, reverse: true, ...(set?.reverseFoil ? { reverseKind: set.reverseFoil } : {}) } : { ...card, reverse: false };
        return `<a class="pc-slab" href="/grading/${esc(String(slab.id))}" aria-label="${esc(card.name)} graded ${esc(String(slab.grade))}${slab.blackLabel ? " Black Label" : ""}, ${esc(String(slab.cert || ""))}">${slabHTML({
          face: tcgFace(face, { small: true }),
          card,
          slab,
          set,
          size: "grid",
        })}</a>`;
      })
      .join("")}</div>
  </div>`;
}

function inspectShowcaseBtn(card) {
  const trainer = activeTrainer();
  if (!trainer) return "";
  const ids = dexIds(card.id);
  const shown = (trainer.showcase || []).find((slot) => ids.includes(slot.id));
  return `<button type="button" class="ghost pc-showcase-btn" data-inspect-showcase="${esc(shown ? shown.id : heldId(card.id))}">${
    shown ? "Remove from showcase" : "Add to showcase"
  }</button>`;
}

async function sellOwnedCard(card, { extra = false } = {}) {
  if (!activeTrainer()) {
    toast("Sign in to sell cards.");
    openAuth("signin");
    return false;
  }
  if (!card) return false;
  const value = sellValue(card);
  const last = rawQty(card.id) <= 1;
  if (
    (state.settings.confirmSell || last) &&
    !confirm(
      last
        ? `Sell your only ${card.name} for ${coin(value)} coins? It leaves the binder.`
        : `Sell a ${extra ? "spare " : ""}${card.name} for ${coin(value)} coins?`
    )
  ) {
    return false;
  }
  try {
    const data = await api("/api/cards/sell", {
      method: "POST",
      body: JSON.stringify({ cardId: card.id }),
    });
    afterEconomy(data.save);
    toast(`Sold ${card.name} for ${coin(data.value ?? value)} coins`);
    renderHeader();
    renderShop();
    renderCollection();
    if (view === "binder") renderBinder();
    if (view === "account") renderAccount();
    if (inspectCard) paintInspect(inspectCard);
    return true;
  } catch (err) {
    toast(err.message || "Couldn't sell that card.");
    return false;
  }
}

/* ---- Levels (js/level-ui.js draws it; js/level-feed.js reports what a save earned) ---- */

let roadPast = false; // the Levels tab shows every stop behind you
let freshLevels = new Set(); // levels just paid, so their tiles stamp in

const levelDeps = {
  esc,
  num,
  gearName: (kind, id) => gearItem(getGearCatalog(), kind, id)?.name || "",
  gearArt: (kind, id) => {
    const item = gearItem(getGearCatalog(), kind, id);
    return item ? (kind === "coin" ? coinHtml(item, { cls: "sm" }) : sleeveHtml(item, { cls: "sm" })) : "";
  },
};

function levelsTab() {
  return levelUi.levelsTabHtml(levelUi.xpOf(state), levelDeps, { past: roadPast, fresh: freshLevels });
}

function openLevelsTab() {
  accountTab = "levels";
  if (view === "account") renderAccount();
  else setView("account");
}

let levelClaiming = false;
async function claimLevelRewards(button) {
  if (levelClaiming) return;
  levelClaiming = true;
  button?.setAttribute("aria-disabled", "true");
  const focused = focusKey();
  try {
    const data = await api("/api/levels/claim", { method: "POST" });
    afterEconomy(data.save);
    freshLevels = new Set(data.paid?.levels || []);
    renderHeader();
    renderAccount();
    restoreFocus(focused);
    toast(levelUi.claimedText(data.paid, levelDeps));
  } catch (err) {
    toast(err.message || "Couldn't claim level rewards.");
    renderAccount();
    restoreFocus(focused);
  } finally {
    levelClaiming = false;
  }
}

let prestiging = false;
async function prestigeNow(button) {
  if (prestiging) return;
  const xp = levelUi.xpOf(state);
  if (!xp.canPrestige) return;
  if (!confirm(`Prestige to star ${xp.prestige + 1}? You go back to level 1 and climb again. Your hourly claim goes up for good, and every frame, title and profile slot you've opened stays yours.`)) return;
  prestiging = true;
  button?.setAttribute("aria-disabled", "true");
  const focused = focusKey();
  try {
    const data = await api("/api/levels/prestige", { method: "POST" });
    afterEconomy(data.save);
    renderHeader();
    renderAccount();
    restoreFocus(focused);
    toast(levelUi.prestigedText(levelUi.xpOf(state)));
  } catch (err) {
    toast(err.message || "Couldn't prestige.");
    renderAccount();
    restoreFocus(focused);
  } finally {
    prestiging = false;
  }
}

function questsTab() {
  return questArea.questBoardHtml(state.quests, areaDeps, { fresh: freshClaims });
}

async function sellSetDuplicates() {
  if (!activeTrainer()) return openAuth("signin");
  const setId = liveSet.id;
  const count = spareCopies();
  if (!count) return;
  let estimate = 0;
  for (const [id, qty] of Object.entries(state.collection || {})) {
    if (homeSetId(id) !== setId || qty < 2) continue;
    const card = findCard(id);
    if (card) estimate += (qty - 1) * sellValue(card);
  }
  if (!confirm(`Sell ${count} duplicate${count === 1 ? "" : "s"} from ${liveSet.name} for about ${coin(estimate)} coins? You'll keep one copy of every card.`)) return;
  els.sellDuplicates.disabled = true;
  try {
    const data = await api("/api/cards/sell-duplicates", {
      method: "POST",
      body: JSON.stringify({ setId }),
    });
    afterEconomy(data.save);
    toast(`Sold ${data.copies} duplicates for ${coin(data.value)} coins. Kept one of each.`);
    renderHeader();
    renderShop();
    renderCollection();
    if (view === "binder") renderBinder();
    if (view === "account") renderAccount();
  } catch (err) {
    toast(err.message || "Couldn't sell duplicates.");
    renderCollection();
  }
}

els.sellDuplicates?.addEventListener("click", sellSetDuplicates);

function paintInspect(card) {
  const chart = els.inspectInfo.querySelector("#inspect-chart");
  if (chart) renderPriceChart(chart, card, inspectRange);
  if (chart && !priceHistoryReady(card.id)) {
    // Each set's history is its own file, fetched the first time it's needed.
    loadPriceHistory(card.id.split("-")[0]).then(() => {
      const mount = els.inspectInfo.querySelector("#inspect-chart");
      if (mount && inspectCard?.id === card.id) renderPriceChart(mount, inspectCard, inspectRange);
    });
  }
  const sell = els.inspectInfo.querySelector("#inspect-sell");
  if (sell) sell.innerHTML = inspectSellRow(card);
}

/** "Charizard ex" is a Charizard; the search wants the name every print shares. */
function inspectNameRoot(card) {
  const root = String(card.name || "")
    .replace(/\s*[-–]?\s*(?:ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|Star|LV\.X|☆|δ)\s*$/u, "")
    .replace(/^(?:M|Mega|Radiant|Dark|Light|Shining)\s+(?=\S)/u, "")
    .trim();
  return root || card.name;
}

/** Two plain links under the facts: every card of that name, and the set's cards of the same rarity. */
function inspectFindMore(card, set) {
  const root = inspectNameRoot(card);
  const links = [`<button type="button" class="inspect-link" data-inspect-find="${esc(root)}">Every ${esc(root)} card</button>`];
  if (card.rarity && !card.energy && card.supertype !== "Energy") {
    links.push(`<button type="button" class="inspect-link" data-inspect-rarity="${esc(card.id)}">${esc(rarityLine(card))} cards in ${esc(set.name)}</button>`);
  }
  return links.join("");
}

/**
 * Leave the inspector for the set's page in the collection, opened at this card
 * (or filtered to its rarity). The set is activated first so its cards are on the page.
 */
async function showCardInSet(cardId, { rarity = false } = {}) {
  const card = findCard(cardId);
  if (!card) return;
  const set = setForCard(card);
  if (!(await activateSet(set.id))) return;
  if (siteSearch.isOpen()) siteSearch.close();
  closeDialog(els.inspect);
  ownedMode = "all";
  rarityMode = rarity && els.rarityFilter?.querySelector(`[data-rarity="${CSS.escape(card.rarity)}"]`) ? card.rarity : "all";
  if (els.search) els.search.value = "";
  setView("collection");
  // The page swaps in after a short fade and then scrolls to the top, so wait for it.
  let tries = 0;
  const settle = () => {
    if (view !== "collection") {
      if (tries++ < 90) requestAnimationFrame(settle);
      return;
    }
    requestAnimationFrame(() => {
      const slot = rarity ? null : [...els.dexGrid.querySelectorAll("[data-inspect]")].find((el) => el.dataset.inspect === card.id)?.closest(".bulk-card");
      const target = slot || els.dexGrid;
      target.scrollIntoView({ block: slot ? "center" : "start", behavior: reduceMotion() ? "auto" : "smooth" });
      if (slot) {
        foundCardId = card.id;
        slot.classList.add("is-found");
        setTimeout(() => {
          foundCardId = "";
          els.dexGrid.querySelectorAll(".is-found").forEach((el) => el.classList.remove("is-found"));
        }, 2600);
      }
    });
  };
  settle();
}

function openInspect(id, reverse = false, reverseKind = "") {
  const base = findCard(id);
  if (!base) return;
  const card = reverse ? { ...base, reverse: true, ...(reverseKind ? {reverseKind} : {}) } : base;
  inspectCard = card;
  inspectRange = "30d";
  inspectOpenedAt = Date.now();
  els.inspectArt.innerHTML = tcgFace(card);
  const set = setForCard(card);
  const type = [card.supertype, ...(card.subtypes || []), card.hp ? `${card.hp} HP` : ""]
    .filter((part, i, all) => part && all.indexOf(part) === i)
    .join(" · ");
  // The facts as plain rows between hairlines; the chart and what you can do with your copies under them.
  const rows = [
    ["Number", esc(numberLine(card))],
    ["Rarity", `<span class="kicker-rarity">${rarityPips(card.rarity)} ${esc(rarityLine(card))}</span>`],
    type ? ["Type", esc(type)] : null,
    card.evolvesFrom ? ["Evolves from", esc(card.evolvesFrom)] : null,
    ["Illustrator", esc(card.artist || "Unknown")],
    ["Find more", inspectFindMore(card, set)],
  ].filter(Boolean);
  els.inspectInfo.innerHTML = `
    <p class="inspect-set"><button type="button" class="inspect-set-link" data-inspect-set="${esc(card.id)}" aria-label="Show ${esc(card.name)} in ${esc(set.name)}"><img class="inspect-set-symbol" src="${esc(setIdentity(set).symbol)}" alt="" width="24" height="24" decoding="async" /><span>${esc(set.name)}</span></button></p>
    <h2 id="inspect-title">${esc(card.name)}</h2>
    <dl class="inspect-rows">${rows.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <div class="price-card" id="inspect-chart"></div>
    <div id="inspect-sell"></div>`;
  paintInspect(card);
  openDialog(els.inspect, els.inspectClose);
}

els.inspectInfo.addEventListener("click", (e) => {
  const inSet = e.target.closest("[data-inspect-set]");
  if (inSet) {
    showCardInSet(inSet.dataset.inspectSet);
    return;
  }
  const sameRarity = e.target.closest("[data-inspect-rarity]");
  if (sameRarity) {
    showCardInSet(sameRarity.dataset.inspectRarity, { rarity: true });
    return;
  }
  const find = e.target.closest("[data-inspect-find]");
  if (find) {
    closeDialog(els.inspect);
    siteSearch.open(find.dataset.inspectFind);
    return;
  }
  // Grading links leave the inspector; the document handler routes them.
  if (e.target.closest('a[href^="/grading"]')) {
    closeDialog(els.inspect);
    return;
  }
  const range = e.target.closest("[data-range]");
  if (range && inspectCard) {
    inspectRange = range.dataset.range;
    renderPriceChart(els.inspectInfo.querySelector("#inspect-chart"), inspectCard, inspectRange);
    return;
  }
  const sell = e.target.closest("[data-inspect-sell]");
  if (sell && inspectCard) {
    const card = findCard(sell.dataset.inspectSell);
    sellOwnedCard(card);
    return;
  }
  const pin = e.target.closest("[data-inspect-showcase]");
  if (!pin || !inspectCard) return;
  toggleShowcase(pin.dataset.inspectShowcase);
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    if (btn.dataset.view === "battles") battlePath = "/battles";
    if (btn.dataset.view === "casino") casinoPath = "/casino";
    if (btn.dataset.view === "grading") gradingPath = "/grading"; // grading
    setView(btn.dataset.view);
  });
});

els.setSwitcher.addEventListener("click", (e) => {
  const soon = e.target.closest("[data-soon]");
  if (soon) {
    toast(`${soon.dataset.soon} is queued.`);
    return;
  }
  const tab = e.target.closest("[data-set]");
  if (tab) activateSet(tab.dataset.set);
});
els.bulkSets?.addEventListener("click", (e) => {
  const era = e.target.closest("[data-era]");
  if (era) {
    bulkEra = era.dataset.era;
    renderBulkSets();
    return;
  }
  const soon = e.target.closest("[data-soon]");
  if (soon) {
    toast(`${soon.dataset.soon} is queued.`);
    return;
  }
  const tab = e.target.closest("[data-set]");
  if (tab) activateSet(tab.dataset.set);
});
els.setSwitcher.addEventListener("toggle", onEraToggle);

function onEraToggle(e) {
  const era = e.target.closest("details.rail-era");
  if (!era || e.target !== era) return;
  if (era.open) openEras.add(era.dataset.era);
  else openEras.delete(era.dataset.era);
}

document.addEventListener("click", (e) => {
  if (e.defaultPrevented) return;
  const quickSet = e.target.closest("[data-quick-set]");
  if (quickSet) {
    activateSet(quickSet.dataset.quickSet);
    return;
  }
  const open = e.target.closest("[data-open-auth]");
  if (open) {
    openAuth(open.dataset.openAuth);
    return;
  }
  const jump = e.target.closest("[data-goto]");
  if (jump) {
    setView(jump.dataset.goto);
    return;
  }
  const gateTab = e.target.closest(".gate-lock [data-acct-tab]"); // the lock notice's link to the Levels tab
  if (gateTab) {
    accountTab = gateTab.dataset.acctTab;
    setView("account");
    return;
  }
  const link = e.target.closest("a[href]");
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
  let url;
  try {
    url = new URL(link.getAttribute("href"), location.origin);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  const next = viewFromPath(url.pathname);
  if (!next) return;
  e.preventDefault();
  if (next === "auth") openAuth();
  else if (setIdFromPath(url.pathname)) playSet(setIdFromPath(url.pathname));
  else setView(next);
});

window.addEventListener("popstate", () => {
  routeFromLocation();
});

document.getElementById("set-notice")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-notice]");
  if (!btn) return;
  const act = btn.dataset.notice;
  if (act === "retry") {
    btn.disabled = true;
    await activateSet(e.currentTarget.dataset.set);
    btn.disabled = false;
    return;
  }
  hideSetNotice();
  if (act === "catalog") setView("catalog");
  else replacePath(pathForView("shop"));
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !historyOpen) return;
  historyOpen = false;
  renderAccount();
});

els.viewHome.addEventListener("click", (e) => {
  const feature = e.target.closest("[data-feature-set]");
  if (feature) {
    activateSet(feature.dataset.featureSet);
    return;
  }
  // The pack standing on the counter rips like the button beside it.
  if (e.target.closest("#home-rip, .counter-pack")) {
    if (liveSet.promoSet) setView("shop");
    else startRip(chosenWrapper());
    return;
  }
  const play = e.target.closest("[data-play-set]");
  if (play) {
    playSet(play.dataset.playSet);
    return;
  }
  inspectFromEl(e.target);
});

async function playSet(id) {
  if (await activateSet(id)) setView("shop");
}

document.querySelector(".brand")?.addEventListener("click", (e) => {
  e.preventDefault();
  setView("home");
});

els.authEntry?.addEventListener("click", () => openAuth("signin"));
els.trainerChip?.addEventListener("click", () => setView("account"));

els.settingsBody.addEventListener("change", (e) => {
  const toggle = e.target.closest("[data-setting]");
  if (!toggle) return;
  state.settings[toggle.dataset.setting] = toggle.checked;
  saveState(state);
  applySettings();
  // Only the summary line changes, so patch it rather than rebuilding the page
  // out from under the switch the pointer is still on.
  updateSettingsSummary();
});

els.settingsBody.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-choice]");
  if (choice) {
    state.settings[choice.dataset.choice] = choice.dataset.value;
    saveState(state);
    applySettings();
    renderSettings();
    if (choice.dataset.choice === "binder") renderCollection();
    return;
  }

  if (e.target.closest("#reset-settings")) {
    Object.assign(state.settings, DEFAULT_SETTINGS);
    saveState(state);
    applySettings();
    renderSettings();
    renderCollection();
    toast("Settings back to default.");
    return;
  }

  if (!e.target.closest("#reset-progress")) return;
  if (!confirm("Reset coins, binder, and history? This can't be undone.")) return;
  if (!activeTrainer()) {
    toast("Sign in first. There's no local binder to reset.");
    openAuth("signin");
    return;
  }
  api("/api/me/reset", { method: "POST" })
    .then(async (data) => {
      applyCloudSave(data.save);
      if (data.user) cloudUser = data.user; // the reset takes bought binder editions back
      renderHeader();
      renderShop();
      renderCollection();
      renderBinder();
      renderSettings();
      if (view === "home") renderHome();
      if (view === "account") renderAccount();
      toast("Progress reset.");
    })
    .catch((err) => toast(err.message || "Couldn't reset progress."));
});

els.accountBody.addEventListener("click", async (e) => {
  inspectFromEl(e.target);
  const open = e.target.closest("[data-open-auth]");
  if (open) {
    openAuth(open.dataset.openAuth);
    return;
  }
  const tab = e.target.closest("[data-acct-tab]");
  if (tab) {
    accountTab = tab.dataset.acctTab;
    renderAccount();
    els.accountBody.querySelector(".acct-tabs")?.scrollIntoView({ block: "nearest" });
    return;
  }
  const prestigeBtn = e.target.closest("[data-prestige]");
  if (prestigeBtn) {
    prestigeNow(prestigeBtn);
    return;
  }
  const claimLevelsBtn = e.target.closest("[data-claim-levels]");
  if (claimLevelsBtn) {
    claimLevelRewards(claimLevelsBtn);
    return;
  }
  if (e.target.closest("[data-road-past]")) {
    roadPast = !roadPast;
    renderAccount();
    return;
  }
  const filter = e.target.closest("[data-ach-filter]");
  if (filter) {
    achFilter = filter.dataset.achFilter;
    renderAccount();
    return;
  }
  const achCatBtn = e.target.closest("[data-ach-cat]");
  if (achCatBtn) {
    achCat = achCatBtn.dataset.achCat;
    renderAccount();
    return;
  }
  const eraBtn = e.target.closest("[data-mastery-era]");
  if (eraBtn) {
    masteryEra = eraBtn.dataset.masteryEra;
    masterySet = "";
    renderAccount();
    return;
  }
  const setBtn = e.target.closest("[data-mastery-set]");
  if (setBtn) {
    masterySet = masterySet === setBtn.dataset.masterySet ? "" : setBtn.dataset.masterySet;
    renderAccount();
    els.accountBody.querySelector(".qm-detail")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const bannerBtn = e.target.closest("[data-set-banner]");
  if (bannerBtn) {
    try {
      await patchLook({ banner: bannerBtn.dataset.setBanner });
    } catch (err) {
      toast(err.message || "That banner is locked.");
    }
    return;
  }
  const claim = e.target.closest("[data-claim]");
  const questClaim = e.target.closest("[data-quest-claim]");
  if (questClaim) {
    if (questClaim.getAttribute("aria-disabled") === "true") return;
    questClaim.setAttribute("aria-disabled", "true");
    const focused = focusKey();
    try {
      const data = await api("/api/quests/claim", { method: "POST", body: JSON.stringify({ id: questClaim.dataset.questClaim }) });
      afterEconomy(data.save);
      freshClaims = new Set([questClaim.dataset.questClaim]);
      renderHeader();
      renderAccount();
      restoreFocus(focused);
      const chest = questClaim.dataset.questClaim.startsWith("chest-");
      toast(chest ? `Chest opened, +${num(data.coins)} coins` : `Quest claimed, +${num(data.coins)} coins`);
    } catch (err) {
      toast(err.message || "Couldn't claim quest.");
      renderAccount();
      restoreFocus(focused);
    }
    return;
  }
  if (claim) {
    if (achievementClaiming) return;
    claim.setAttribute("aria-disabled", "true");
    const row = achievementById(claim.dataset.claim);
    await claimAchievements({ id: claim.dataset.claim }, row?.name || "Claimed");
    return;
  }
  const claimAll = e.target.closest("#claim-all");
  if (claimAll) {
    if (achievementClaiming) return;
    claimAll.setAttribute("aria-disabled", "true");
    await claimAchievements({ all: true }, "Cleared the wall");
    return;
  }
  if (e.target.closest("#open-history")) {
    historyOpen = true;
    renderAccount();
    return;
  }
  if (e.target.closest("[data-history-close]")) {
    historyOpen = false;
    renderAccount();
    return;
  }
  const hFilter = e.target.closest("[data-history-filter]");
  if (hFilter) {
    historyFilter = hFilter.dataset.historyFilter;
    renderAccount();
    return;
  }
  const jump = e.target.closest("[data-jump-set]");
  if (jump) {
    await activateSet(jump.dataset.jumpSet);
    setView("collection");
    return;
  }
  if (e.target.closest("#sign-out")) {
    if (busyPack()) return;
    try {
      await api("/api/auth/signout", { method: "POST" });
    } catch {
      /* cookie may already be gone */
    }
    cloudUser = null;
    pendingClaim = null;
    setPersistProgress(false);
    wipeProgressMemory();
    await hydrateAfterAccountChange();
    setView("account");
    toast("Signed out.");
    return;
  }
  if (e.target.closest("#delete-trainer")) {
    const trainer = activeTrainer();
    if (!trainer || busyPack()) return;
    if (!confirm(`Delete ${trainer.name} (@${trainer.handle}) and every card on this account?`)) return;
    const password = prompt("Type your password to delete this account.");
    if (password == null) return;
    try {
      await api("/api/auth/delete", { method: "POST", body: JSON.stringify({ password }) });
      cloudUser = null;
      pendingClaim = null;
      setPersistProgress(false);
      wipeProgressMemory();
      await hydrateAfterAccountChange();
      setView("account");
      toast("Account deleted.");
    } catch (err) {
      toast(err.message || "Couldn't delete the account.");
    }
    return;
  }
  const color = e.target.closest("[data-profile-color]");
  if (color) {
    try {
      const data = await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ color: color.dataset.profileColor }),
      });
      cloudUser = data.user;
      renderHeader();
      renderAccount();
    } catch (err) {
      toast(err.message || "Couldn't update color.");
    }
    return;
  }
  const setAvatar = e.target.closest("[data-set-avatar]");
  if (setAvatar) {
    try {
      await patchLook({ avatar: setAvatar.dataset.setAvatar });
    } catch (err) {
      toast(err.message || "Couldn't update avatar.");
    }
    return;
  }
  const setStyle = e.target.closest("[data-set-style]");
  if (setStyle) {
    try {
      await patchLook({ avatarStyle: setStyle.dataset.setStyle });
    } catch (err) {
      toast(err.message || "Couldn't update picture style.");
    }
    return;
  }
  const setFrame = e.target.closest("[data-set-frame]");
  if (setFrame) {
    try {
      await patchLook({ frame: setFrame.dataset.setFrame || null });
    } catch (err) {
      toast(err.message || "Couldn't change the frame.");
    }
    return;
  }
  const lockedFrame = e.target.closest("[data-frame-locked]");
  if (lockedFrame) {
    const info = frameInfo(lockedFrame.dataset.frameLocked);
    if (info) toast(`Reach ${frameNeed(info).toLowerCase()} to wear the ${info.name} frame.`);
    return;
  }
  const lockedMotion = e.target.closest("[data-motion-locked]");
  if (lockedMotion) {
    const level = BANNER_MOTION_LEVELS[lockedMotion.dataset.motionLocked];
    if (level) toast(`Reach level ${level} to use the ${BANNER_MOTION_NAMES[lockedMotion.dataset.motionLocked]} banner.`);
    return;
  }
  const setMotion = e.target.closest("[data-set-motion]");
  if (setMotion) {
    const trainer = activeTrainer();
    if (!trainer) return;
    if (setMotion.getAttribute("aria-disabled") === "true") return toast(setMotion.title || "That banner is locked.");
    const banner = parseBanner(trainer.banner);
    try {
      await patchLook({ banner: `${setMotion.dataset.setMotion}:${banner.colors.join("+")}` });
    } catch (err) {
      toast(err.message || "Couldn't update banner.");
    }
    return;
  }
  const bannerA = e.target.closest("[data-banner-a]");
  if (bannerA) {
    const trainer = activeTrainer();
    if (!trainer) return;
    const banner = parseBanner(trainer.banner);
    banner.colors[0] = bannerA.dataset.bannerA;
    try {
      await patchLook({ banner: `${banner.motion}:${banner.colors.join("+")}` });
    } catch (err) {
      toast(err.message || "Couldn't update banner.");
    }
    return;
  }
  const bannerB = e.target.closest("[data-banner-b]");
  if (bannerB) {
    const trainer = activeTrainer();
    if (!trainer) return;
    const banner = parseBanner(trainer.banner);
    banner.colors[1] = bannerB.dataset.bannerB;
    try {
      await patchLook({ banner: `${banner.motion}:${banner.colors.join("+")}` });
    } catch (err) {
      toast(err.message || "Couldn't update banner.");
    }
    return;
  }
  const setTitle = e.target.closest("[data-set-title]");
  if (setTitle) {
    try {
      await patchLook({ title: setTitle.dataset.setTitle });
    } catch (err) {
      toast(err.message || "That title is locked.");
    }
    return;
  }
  const unpin = e.target.closest("[data-unpin]");
  if (unpin) {
    await toggleShowcase(unpin.dataset.unpin);
    return;
  }
  if (e.target.closest("#look-random")) {
    await surpriseLook();
    return;
  }
  if (e.target.closest("#look-swap")) {
    const trainer = activeTrainer();
    if (!trainer) return;
    const banner = parseBanner(trainer.banner);
    try {
      await patchLook({ banner: `${banner.motion}:${banner.colors[1]}+${banner.colors[0]}` });
    } catch (err) {
      toast(err.message || "Couldn't swap the banner.");
    }
    return;
  }
  if (e.target.closest("#copy-profile-link") || e.target.closest("#copy-profile-link-2")) {
    const trainer = activeTrainer();
    if (!trainer) return;
    copyText(`${location.origin}/u/${trainer.handle}`, "Profile link copied.");
  }
});

/** Clipboard with a toast either way — it fails on http:// and old Safari. */
function copyText(text, done) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast(done))
    .catch(() => toast(text));
}

/** One roll of the dice across picture, ring, and banner. */
async function surpriseLook() {
  const trainer = activeTrainer();
  if (!trainer) return;
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const [a, b] = [pick(AVATAR_COLORS).id, pick(AVATAR_COLORS).id];
  try {
    await patchLook({
      avatar: String(pick(AVATARS)[0]),
      color: pick(AVATAR_COLORS).id,
      banner: `${pick(BANNER_MOTIONS.filter((m) => !m.level || unlockOf(trainer) >= m.level)).id}:${a}+${b === a ? pick(AVATAR_COLORS).id : b}`,
    });
    toast("New look rolled.");
  } catch (err) {
    toast(err.message || "Couldn't roll a new look.");
  }
}

/**
 * Cash in one achievement, or every ready one. The reward comes back from the
 * worker rather than the table here, so the coins shown are the coins paid.
 */
let achievementClaiming = false;
async function claimAchievements(body, label) {
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  // One request at a time: a second click on the same button must not send a second batch.
  if (achievementClaiming) return;
  achievementClaiming = true;
  // Something else may repaint while the request is out; remember where focus was now.
  const focused = focusKey();
  try {
    const data = await api("/api/achievements/claim", { method: "POST", body: JSON.stringify(body) });
    afterEconomy(data.save);
    freshClaims = new Set(data.claimed || (body.id ? [body.id] : []));
    renderHeader();
    renderAccount();
    restoreFocus(focused);
    rewardFlash(data.rewards || [], data.coins || 0, data.gear);
    const titles = data.titles || [];
    const masteries = (data.rewards || []).filter((row) => achievementById(row.id)?.kind === "mastery");
    const won = titles.length === 1 ? ` and the ${titles[0]} title` : titles.length ? ` and ${titles.length} new titles` : "";
    const extra = masteries.length ? `, plus ${masteries.length === 1 ? "an emblem and a banner" : `${masteries.length} emblems and banners`}` : "";
    toast(`${label}: ${num(data.coins)} coins banked${won}${extra}.`);
  } catch (err) {
    toast(err.message || "Couldn't claim that.");
    renderAccount();
    restoreFocus(focused);
  } finally {
    achievementClaiming = false;
  }
}

/** The little card that drops in when a reward lands; mastery adds the emblem and what it unlocked. */
function rewardFlash(rewards, coins, gear) {
  if (!rewards.length) return;
  // Sleeves and coins gifted by a mastery or crown; only the ones that were new count.
  const gifts = questArea.giftsLine((gear || rewards.flatMap((row) => row.gear || [])).filter((g) => g.wasNew !== false));
  document.querySelector(".reward-flash")?.remove();
  const titles = rewards.filter((row) => row.title);
  const masteries = rewards.map((row) => achievementById(row.id)).filter((row) => row?.kind === "mastery" && row.set);
  const secrets = rewards.filter((row) => isSecret(achievementById(row.id)));
  const el = document.createElement("div");
  el.className = `reward-flash${masteries.length ? " has-mastery" : ""}`;
  el.setAttribute("role", "status");
  const emblems = masteries.length
    ? `<div class="flash-emblems">${masteries.slice(0, 4).map((row) => masteryEmblem(row.set, { size: "lg" })).join("")}</div>`
    : "";
  const perks = masteries.length
    ? `<i>${masteries.length === 1 ? "Emblem and exclusive banner unlocked" : `${masteries.length} emblems and exclusive banners unlocked`}</i>`
    : "";
  el.innerHTML = `
    ${emblems}
    <b>${coinAmount(coins)}</b>
    <span>${rewards.length === 1 ? esc(rewards[0].name) : `${rewards.length} achievements claimed`}</span>
    ${secrets.length ? `<i>${secrets.length === 1 ? "A secret, revealed" : `${secrets.length} secrets, revealed`}</i>` : ""}
    ${titles.length ? `<i>${titles.length === 1 ? "New title" : "New titles"}: ${titles.slice(0, 3).map((row) => esc(row.title)).join(", ")}${titles.length > 3 ? ` and ${titles.length - 3} more` : ""}</i>` : ""}
    ${perks}
    ${gifts ? `<a class="flash-gear" href="/gear">${esc(gifts)}</a>` : ""}`;
  document.body.appendChild(el);
  el.querySelector(".flash-gear")?.addEventListener("click", () => el.remove());
  requestAnimationFrame(() => el.classList.add("show"));
  window.setTimeout(() => {
    el.classList.remove("show");
    window.setTimeout(() => el.remove(), 400);
  }, gifts ? 6000 : masteries.length ? 4200 : 2800);
}

let masteryResize = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(masteryResize);
  masteryResize = window.setTimeout(() => {
    if (view === "account" && accountTab === "mastery") placeMasteryDetail();
  }, 120);
});

els.accountBody.addEventListener("input", (e) => {
  if (e.target.id !== "avatar-search") return;
  avatarQuery = e.target.value;
  const trainer = activeTrainer();
  const grid = els.accountBody.querySelector(".avatar-grid");
  if (!trainer || !grid) return;
  grid.innerHTML = searchAvatars(avatarQuery)
    .map(([id, name]) => {
      const style = avatarStyle(trainer.avatarStyle);
      const src = style === "pixel" ? avatarIcon(id) : avatarSrc(id, "art");
      return `<button type="button" class="pick${String(trainer.avatar) === String(id) ? " on" : ""}" data-set-avatar="${id}" title="${esc(name)}">
      <img class="${style === "pixel" ? "pixel" : ""}" src="${esc(src)}" alt="${esc(name)}" loading="lazy" />
      <small>${esc(name)}</small>
    </button>`;
    })
    .join("");
});

els.accountBody.addEventListener("change", async (e) => {
  const box = e.target.closest("[data-stat-toggle]");
  if (!box) return;
  const trainer = activeTrainer();
  if (!trainer) return;
  const shown = new Set(trainer.shownStats || DEFAULT_STATS);
  if (box.checked) shown.add(box.dataset.statToggle);
  else shown.delete(box.dataset.statToggle);
  if (!shown.size) shown.add("packs");
  try {
    await patchLook({ shownStats: [...shown] });
  } catch (err) {
    toast(err.message || "Couldn't update stats.");
    renderAccount();
  }
});

async function patchLook(body) {
  const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(body) });
  cloudUser = data.user;
  renderHeader();
  renderAccount();
}

/** The cards of the shared pages (all of them, or one page's slots) as the site's card objects. */
function profileBinderCards(pages) {
  return pages.flatMap(pg => pg.slots.map(slot => slot && findCard(slot.id))).filter(Boolean);
}

/** Repaint "Inside the binder" once art colours have been sampled; touches only variables, never the cards. */
function paintProfileBinderLook() {
  const object = els.profileBody?.querySelector(".profile-binder .binder-object");
  const {pages, look} = profileBinderView;
  if (!object || !pages.length) return;
  const mine = normalizeBinderLook(look);
  applyBinderLook(object, binderResolved(mine, profileBinderCards(pages)));
  object.querySelectorAll(".binder-page[data-page-index]").forEach(el => {
    const pg = pages.find(row => row.index === Number(el.dataset.pageIndex));
    setPageVars(el, pg ? pageLookVars(mine, profileBinderCards([pg]), profileBinderCards(pages)) : null);
  });
}

function profileBinderPagesHtml() {
  const {pages, mine, position} = profileBinderView;
  if (!pages.length) return mine ? `<section class="panel profile-binder"><h3>Binder pages</h3><p class="panel-empty">Display up to four favourite pages from your binder.</p><a class="ghost" href="/binder">Choose a binder page</a></section>` : "";
  const page = pages[position];
  // The owner's look dresses the pages: the cover colour follows the shared pages' cards, each page's tint its own.
  const ownerLook = normalizeBinderLook(profileBinderView.look);
  const shared = profileBinderCards(pages);
  const pageVars = pageLookVars(ownerLook, profileBinderCards([page]), shared);
  if (ownerLook.color === COLOR_FROM_CARDS) requestAnimationFrame(() => refineArt(shared, paintProfileBinderLook));
  const pockets = page.slots.map(slot => {
    if (!slot) return `<div class="profile-pocket pocket empty" aria-label="Empty pocket"></div>`;
    const known = findCard(slot.id);
    const card = known ? {...known, reverse:slot.reverse} : null;
    return `<div class="profile-pocket pocket"><button type="button" class="mini-card" ${card ? inspectAttrs(card) : ""} aria-label="${esc(slot.name)}">${card ? tcgFace(card, {small:true, stamp:false, lazy:true}) : `<img src="${esc(slot.image)}" alt="${esc(slot.name)}" loading="lazy">`}</button></div>`;
  }).join("");
  return `<section class="panel profile-binder"><div class="profile-section-head"><div><h3>Inside the binder</h3></div><span>${pages.length} shared ${pages.length === 1 ? "page" : "pages"}</span></div>
    <nav class="profile-page-nav" aria-label="Shared binder pages">
      <button type="button" class="ghost" data-profile-page="-1" ${position === 0 ? "disabled" : ""} aria-label="Previous binder page">Back</button>
      <span role="status" aria-live="polite">${position + 1} of ${pages.length}</span>
      <button type="button" class="ghost" data-profile-page="1" ${position === pages.length - 1 ? "disabled" : ""} aria-label="Next binder page">Next</button>
    </nav>
    <div class="profile-binder-pages">${binderObjectHtml({leaves:1, resolved:binderResolved(ownerLook, shared), innerHtml:`<div class="binder-spread single"><article class="profile-binder-page binder-page" data-page-index="${page.index}"${pageStyleAttr(pageVars)}><header><b>Binder page ${page.index + 1}</b><span class="profile-page-actions"><button type="button" class="link-btn" data-copy-page-link="${page.index}">Copy link</button>${mine ? `<button type="button" class="link-btn" data-share-page="${page.index}">Remove from profile</button>` : ""}</span></header><div class="binder-pockets">${pockets}</div></article></div>`})}</div></section>`;
}

function turnProfilePage(direction) {
  const next = profileBinderView.position + direction;
  if (next < 0 || next >= profileBinderView.pages.length) return;
  profileBinderView.position = next;
  profilePageWanted = profileBinderView.pages[next].index;
  replacePath(profilePath(profileBinderView.handle, profilePageWanted));
  const section = els.profileBody.querySelector(".profile-binder");
  if (!section) return;
  section.outerHTML = profileBinderPagesHtml();
  // Keep keyboard focus in the pager, including at either end of the binder.
  const button = els.profileBody.querySelector(`[data-profile-page="${direction}"]:not(:disabled)`)
    || els.profileBody.querySelector("[data-profile-page]:not(:disabled)");
  button?.focus({preventScroll:true});
}

let sharingPage = false;
async function toggleProfilePage(page) {
  if (sharingPage) return;
  const trainer = activeTrainer();
  if (!trainer) { openAuth("signin"); return; }
  const binderPages = [...(trainer.binderPages || [])];
  const at = binderPages.indexOf(page);
  if (at >= 0) binderPages.splice(at, 1);
  else if (binderPages.length >= PROFILE_PAGE_LIMIT) { toast("You can display up to four binder pages. Remove one to choose another."); return; }
  else binderPages.push(page);
  sharingPage = true;
  try {
    const data = await api("/api/me", {method:"PATCH", body:JSON.stringify({binderPages})});
    cloudUser = data.user;
    renderBinder();
    if (view === "profile") renderProfile();
    toast(at >= 0 ? "Page removed from profile." : "Page displayed on your profile.");
  } catch (err) { toast(err.message || "Couldn't update displayed pages."); }
  finally { sharingPage = false; }
}

async function toggleShowcase(id) {
  const trainer = activeTrainer();
  if (!trainer) {
    toast("Sign in to pin a showcase.");
    openAuth("signin");
    return;
  }
  const showcase = [...(trainer.showcase || [])];
  const at = showcase.findIndex((slot) => slot.id === id);
  if (at >= 0) showcase.splice(at, 1);
  else if (showcase.length >= SHOWCASE_MAX) {
    toast("Showcase holds six cards.");
    return;
  } else showcase.push({ id, reverse: ownedReverse(id) });
  try {
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify({ showcase }) });
    cloudUser = data.user;
    if (inspectCard) paintInspect(inspectCard);
    if (view === "profile") renderProfile();
    if (view === "account") renderAccount();
    toast(at >= 0 ? "Removed from showcase." : "Pinned to showcase.");
  } catch (err) {
    toast(err.message || "Couldn't update showcase.");
  }
}

els.profileBody?.addEventListener("click", async (e) => {
  const pageTurn = e.target.closest("[data-profile-page]");
  if (pageTurn) { turnProfilePage(Number(pageTurn.dataset.profilePage)); return; }
  const pageLink = e.target.closest("[data-copy-page-link]");
  if (pageLink) {
    const page = Number(pageLink.dataset.copyPageLink);
    copyText(`${location.origin}${profilePath(profileBinderView.handle, page)}`, "Page link copied.");
    return;
  }
  const sharedPage = e.target.closest("[data-share-page]");
  if (sharedPage) { await toggleProfilePage(Number(sharedPage.dataset.sharePage)); return; }
  inspectFromEl(e.target);
  const dm = e.target.closest("[data-open-dm]");
  if (dm) {
    setView("social", { handle: dm.dataset.openDm });
    return;
  }
  const add = e.target.closest("[data-friend-add]");
  const accept = e.target.closest("[data-friend-accept]");
  const remove = e.target.closest("[data-friend-remove]");
  const handle = add?.dataset.friendAdd || accept?.dataset.friendAccept || remove?.dataset.friendRemove;
  if (!handle) return;
  try {
    if (add) {
      const data = await api("/api/friends/request", { method: "POST", body: JSON.stringify({ handle }) });
      toast(data.status === "accepted" ? `You and @${handle} are friends.` : `Request sent to @${handle}.`);
    } else if (accept) {
      await api("/api/friends/respond", { method: "POST", body: JSON.stringify({ handle, accept: true }) });
      toast(`You and @${handle} are friends.`);
    } else {
      await api("/api/friends/remove", { method: "POST", body: JSON.stringify({ handle }) });
      toast(`Removed @${handle}.`);
    }
    renderProfile();
    notifySignedIn();
  } catch (err) {
    toast(err.message || "Couldn't update friends.");
  }
});

els.profileBody?.addEventListener("submit", async (e) => {
  const form = e.target.closest("#comment-form");
  if (!form) return;
  e.preventDefault();
  const body = String(new FormData(form).get("body") || "").trim();
  if (!body) return;
  try {
    await api(`/api/u/${encodeURIComponent(profileHandle)}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    renderProfile();
    toast("Posted.");
  } catch (err) {
    toast(err.message || "Couldn't comment.");
  }
});

document.getElementById("home-chat-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  const input = e.target.body;
  const text = String(input?.value || "").trim();
  if (!text) return;
  try {
    await sendChat(text);
    input.value = "";
  } catch (err) {
    toast(err.message || "Couldn't send.");
  }
});

els.accountBody.addEventListener("submit", async (e) => {
  const profile = e.target.closest("#profile-form");
  if (profile) {
    e.preventDefault();
    const data = new FormData(profile);
    const err = els.accountBody.querySelector("#profile-error");
    try {
      const next = await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: String(data.get("name") || ""),
          handle: String(data.get("handle") || ""),
          bio: String(data.get("bio") || ""),
        }),
      });
      cloudUser = next.user;
      if (next.save) applyCloudSave(next.save);
      renderHeader();
      renderAccount();
      toast("Profile saved.");
    } catch (error) {
      if (err) err.textContent = error.message;
      toast(error.message || "Couldn't save profile.");
    }
    return;
  }
  const pw = e.target.closest("#password-form");
  if (!pw) return;
  e.preventDefault();
  const data = new FormData(pw);
  const err = els.accountBody.querySelector("#password-error");
  try {
    await api("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        current: String(data.get("current") || ""),
        password: String(data.get("password") || ""),
      }),
    });
    renderAccount();
    toast("Password updated.");
  } catch (error) {
    if (err) err.textContent = error.message;
    toast(error.message || "Couldn't update password.");
  }
});

els.authBody?.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-auth-tab]");
  if (tab) {
    authTab = tab.dataset.authTab === "signin" ? "signin" : "signup";
    renderAuth();
    return;
  }
  const swatch = e.target.closest("[data-signup-color]");
  if (swatch) {
    signupColor = swatch.dataset.signupColor;
    els.authBody.querySelectorAll("[data-signup-color]").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.signupColor === signupColor);
    });
    return;
  }
  if (e.target.closest("[data-continue-guest]")) {
    setView("home");
  }
});

els.authBody?.addEventListener("submit", async (e) => {
  const signup = e.target.closest("#signup-form");
  if (signup) {
    e.preventDefault();
    if (busyPack()) return;
    const data = new FormData(signup);
    const keep = !activeTrainer() && data.has("keep") && pendingClaim;
    const err = els.authBody.querySelector("#auth-error");
    try {
      const result = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name: String(data.get("name") || ""),
          handle: String(data.get("handle") || ""),
          password: String(data.get("password") || ""),
          color: signupColor,
          localSave: keep ? pendingClaim : undefined,
        }),
      });
      cloudUser = result.user;
      pendingClaim = null;
      localStorage.setItem(CLOUD_SEEN_KEY, "1");
      applyCloudSave(result.save);
      await hydrateAfterAccountChange();
      returnAfterAuth();
      toast(keep ? `Welcome, ${result.user.name}. This binder is yours.` : `Welcome, ${result.user.name}.`);
    } catch (error) {
      if (err) err.textContent = error.message;
      toast(error.message || "Couldn't create that account.");
    }
    return;
  }
  const signin = e.target.closest("#signin-form");
  if (!signin) return;
  e.preventDefault();
  if (busyPack()) return;
  const data = new FormData(signin);
  const err = els.authBody.querySelector("#auth-error");
  try {
    const result = await api("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({
        handle: String(data.get("handle") || ""),
        password: String(data.get("password") || ""),
      }),
    });
    cloudUser = result.user;
    pendingClaim = null;
    localStorage.setItem(CLOUD_SEEN_KEY, "1");
    applyCloudSave(result.save);
    await hydrateAfterAccountChange();
    returnAfterAuth();
    toast(`Signed in as ${result.user.name}.`);
  } catch (error) {
    if (err) err.textContent = error.message;
    toast(error.message || "Couldn't sign in.");
  }
});

els.dailyBtn.addEventListener("click", async () => {
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  try {
    const data = await api("/api/daily", { method: "POST" });
    afterEconomy(data.save);
    renderHeader();
    scheduleDailyTick();
    renderShop();
    if (view === "home") renderHome();
    if (view === "account") renderAccount();
    toast(`Hourly stack: +${coin(data.amount)} coins`);
  } catch (err) {
    toast(err.message || "Wait a second, then claim again.");
    renderHeader();
  }
});

/*
 * Price history for a pack or box. The trend buttons sit inside cards that buy
 * on click, so this listens in the capture phase and stops the click there.
 */
let priceKey = "";
let priceRange = "90d";
let priceOpenedAt = 0;

function paintPriceDialog() {
  renderProductChart(els.priceChart, liveSet.id, priceKey, priceRange);
}

function openPriceDialog(key, name) {
  const offer = key === "boosterPack" ? null : findOffer(sealedPrices[liveSet.id], productList[liveSet.id], key);
  const shopPrice = key === "boosterPack" ? liveSet.cost : offer?.price;
  const wrap = liveSet.wrappers[0];
  priceKey = key;
  priceRange = "90d";
  priceOpenedAt = Date.now();
  els.priceArt.innerHTML = offer?.image
    ? `<img src="${esc(offer.image)}" alt="" decoding="async" />`
    : wrap
      ? packPicture(wrap, " ")
      : "";
  els.priceKicker.textContent = liveSet.name;
  els.priceTitle.textContent = key === "boosterPack" ? "Booster pack" : offer?.name || name;
  els.priceNote.textContent =
    `TCGplayer market price in US dollars, recorded once a day.` +
    (shopPrice > 0 ? ` The shop sells it for ${coin(shopPrice)} coins.` : "");
  paintPriceDialog();
  const setId = liveSet.id;
  loadPriceHistory(setId).then(() => {
    if (priceKey === key && liveSet.id === setId && !els.priceDialog.classList.contains("hidden")) paintPriceDialog();
  });
  openDialog(els.priceDialog, els.priceClose);
}

document.getElementById("view-shop")?.addEventListener(
  "click",
  (e) => {
    const trend = e.target.closest("[data-price-chart]");
    if (!trend) return;
    e.stopPropagation();
    openPriceDialog(trend.dataset.priceChart, trend.dataset.priceName);
  },
  true
);

els.priceDialog?.addEventListener("click", (e) => {
  const range = e.target.closest("[data-range]");
  if (range) {
    priceRange = range.dataset.range;
    paintPriceDialog();
    return;
  }
  if (e.target === els.priceClose || (e.target === els.priceDialog && Date.now() - priceOpenedAt > 500)) {
    closeDialog(els.priceDialog);
  }
});

// Picking a wrapper in the display box only lifts it; the rip button opens it.
els.packGrid.addEventListener("change", (e) => {
  const input = e.target.closest(".dbox-input");
  if (!input) return;
  activeWrapper = liveSet.wrappers.find((w) => w.id === input.value) || activeWrapper;
  paintWrapperChoice();
});
document.getElementById("shop-rip")?.addEventListener("click", () => startRip(chosenWrapper()));

// A box costs real coin, so the first click arms the button and the second buys.
function onProductClick(e) {
  // The add-to-cart control is its own thing: it never arms or fires the Open button.
  if (cartControlClick(e.target, { signedIn: Boolean(activeTrainer()), signIn: () => openAuth("signup"), toast })) return;
  const face = e.target.closest("[data-inspect]");
  if (face) {
    inspectFromEl(face);
    return;
  }
  const open = e.target.closest("[data-open-product]");
  const card = open?.closest("[data-sealed]");
  if (!card || open.disabled) return;
  const id = card.dataset.sealed;
  if (activeTrainer() && sealedConfirm !== id) {
    sealedConfirm = id;
    clearTimeout(sealedConfirmTimer);
    sealedConfirmTimer = setTimeout(() => {
      sealedConfirm = null;
      renderSealed();
    }, 4000);
    renderSealed();
    return;
  }
  sealedConfirm = null;
  clearTimeout(sealedConfirmTimer);
  startSealed(id);
}
els.sealedGrid?.addEventListener("click", onProductClick);
els.promoGrid?.addEventListener("click", onProductClick);
// The cart count on a product card is a field: typing a number and leaving it (or Enter) sets it.
for (const grid of [els.sealedGrid, els.promoGrid]) {
  grid?.addEventListener("change", (e) => cartControlChange(e.target, { toast }));
  grid?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.('input[data-cart="qty"]')) e.target.blur();
  });
}
// The chase cards in the shop's case open the inspector, as the home case does.
document.getElementById("shop-chase")?.addEventListener("click", (e) => inspectFromEl(e.target));
els.promoElsewhere?.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go-set]");
  if (go) {
    activateSet(go.dataset.goSet).then(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    return;
  }
  const face = e.target.closest("[data-inspect]");
  if (face) inspectFromEl(face);
});

function grabTop(e) {
  if (e.target.closest?.(".tear-handle")) return true;
  const rect = els.packBody.getBoundingClientRect();
  const relX = (e.clientX - rect.left) / rect.width;
  const relY = (e.clientY - rect.top) / rect.height;
  return relY <= 0.18 && relY >= -0.1 && relX >= -0.08 && relX <= 1.08;
}

function beginTear(e) {
  if (packPhase !== "ready" || tearing) return false;
  if (!grabTop(e)) return false;
  tearing = true;
  els.packBody.classList.add("tearing");
  tear.begin(e);
  try {
    els.packBody.setPointerCapture?.(e.pointerId);
  } catch {
    /* no capture available; window listeners still track the drag */
  }
  e.preventDefault();
  return true;
}

els.packBody.addEventListener("pointerdown", beginTear);

function moveTear(e) {
  if (!tearing || packPhase !== "ready") return;
  tear.move(e);
  if (tear.started()) els.packBody.classList.add("dragging");
  if (tear.tornThrough()) completeTear();
}

// On window so the rip keeps following the cursor past the pack edges.
window.addEventListener("pointermove", moveTear);

function endTear(e) {
  if (!tearing) return;
  tearing = false;
  els.packBody.classList.remove("dragging");
  if (packPhase === "ready") {
    if (tear.tornEnough()) completeTear();
    else
      tear.easeBack(() => {
        if (packPhase === "ready" && !packExiting) els.packBody.classList.remove("tearing");
      });
  }
  try {
    els.packBody.releasePointerCapture(e.pointerId);
  } catch {
    /* already released */
  }
}

window.addEventListener("pointerup", endTear);
window.addEventListener("pointercancel", endTear);

els.focusCard.addEventListener("click", () => {
  if (packPhase === "reveal") advanceOpen();
});

els.focusPrev.addEventListener("click", goPrevCard);
els.focusNext.addEventListener("click", advanceOpen);

els.stepBtn.addEventListener("click", () => {
  if (packPhase === "ready") completeTear();
  else if (packPhase === "reveal") advanceOpen();
});

els.skipBtn.addEventListener("click", revealAllCards);
els.skipHitsBtn.addEventListener("click", skipToHits);

els.spread.addEventListener("click", (e) => inspectFromEl(e.target));

els.thumbs.addEventListener("click", (e) => {
  const thumb = e.target.closest("[data-focus]");
  if (!thumb || packPhase !== "reveal") return;
  showPullAt(Number(thumb.dataset.focus));
});

// Each card keeps its own settling motion when the pointer moves to its neighbour.
const cardMotion = createCardMotion({
  settings: () => state.settings,
  reducedMotion: reduceMotion,
  blocked: () => flipBusy || els.focusCard?.classList.contains("flipping"),
});
function clearGlare() { cardMotion.clear(); }

els.doneBtn.addEventListener("click", finishRip);
els.againBtn.addEventListener("click", () => {
  if (sealedRun) {
    nextBoxPack();
    return;
  }
  const wrapper = activeWrapper || liveSet.wrappers?.[0];
  finishRip();
  startRip(wrapper);
});
els.boxSummaryBtn?.addEventListener("click", showBoxSummary);
els.binderHitBtn.addEventListener("click", putHitInBinder);
els.viewPullsBtn.addEventListener("click", () => {
  const batched = Boolean(sealedRun?.onDone); // the order's results take it to the collection
  finishRip({ collection: true });
  if (!batched) setView("collection");
});
els.leavePack?.addEventListener("click", leavePack);

els.binderBody?.addEventListener("click", async (e) => {
  const sharedPage = e.target.closest("[data-share-page]");
  if (sharedPage) { await toggleProfilePage(Number(sharedPage.dataset.sharePage)); return; }
  const flip = e.target.closest("[data-flip]");
  if (flip) {
    binderSpread = Math.max(0, binderSpread + Number(flip.dataset.flip) * 2);
    renderBinder();
    return;
  }
  if (e.target.closest("[data-picker-close]")) {
    binderPicking = null;
    renderBinder();
    return;
  }
  const pick = e.target.closest("[data-pick]");
  if (pick && binderPicking != null) {
    const id = pick.dataset.pick;
    if (placeInBinder(state, binderPicking, id, ownedReverse(id))) {
      binderPicking = null;
      await pushBinder();
      renderBinder();
    }
    return;
  }
  const pocket = e.target.closest("[data-pocket]");
  if (pocket) {
    binderPicking = Number(pocket.dataset.pocket);
    cardPicker.reset();
    renderBinder();
    return;
  }
  const out = e.target.closest("[data-unpocket]");
  if (out) {
    clearBinderSlot(state, Number(out.dataset.unpocket));
    await pushBinder();
    renderBinder();
    return;
  }
  // anything else in a filled pocket opens the inspector
  inspectFromEl(e.target);
});

if (els.binderBody) cardPicker.attach(els.binderBody);

els.binderAddPage?.addEventListener("click", async () => {
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  addBinderPage(state);
  await pushBinder();
  binderSpread = Math.max(0, binderPageCount() - 2);
  renderBinder();
  toast("Page added.");
});

// Animated binder covers rest while scrolled offscreen (js/binder-editions.js): watch the places binders are drawn.
for (const host of [els.binderBody, els.profileBody]) {
  if (!host) continue;
  watchBinderFx(host);
  new MutationObserver(() => watchBinderFx(host)).observe(host, { childList: true, subtree: true });
}

// binder customiser (js/binder-editor.js): a sheet or side panel that edits a draft look
// live on the binder above it; nothing is stored until Save.
binderEditor = initBinderEditor({
  mount: els.binderEditorMount,
  getLook: savedBinderLook,
  getOwned: () => activeTrainer()?.binderEditions || [],
  getCoins: () => state.coins,
  getCards: () => binderCardsOf(),
  getAccents: () => cachedCardAccents(binderCardsOf()),
  onDraft: (look) => {
    binderDraft = look;
    paintBinderLook();
  },
  onToggle: (open) => {
    els.binderLayout?.classList.toggle("is-editing", open);
    document.body.classList.toggle("binder-editing", open);
    els.binderCustomise?.setAttribute("aria-expanded", String(open));
    if (open) {
      requestAnimationFrame(() =>
        els.binderBody?.querySelector(".binder-object")?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" })
      );
    }
  },
  // Under the sheet only the top of the screen shows the binder: bring the part of the cover that
  // carries the effect there (ember lives on the foot, the others on the head and sides).
  onTry: (id) => {
    if (matchMedia("(min-width: 980px)").matches) return;
    const object = els.binderBody?.querySelector(".binder-object");
    if (!object) return;
    const box = object.getBoundingClientRect();
    const sheetTop = els.binderEditorMount.getBoundingClientRect().top;
    const delta = id === "ember" ? box.bottom - (sheetTop - 12) : box.top - 72;
    window.scrollBy({ top: delta, behavior: reduceMotion() ? "auto" : "smooth" });
  },
  save: saveBinderLook,
  buy: buyBinderEdition,
  toast,
});
els.binderCustomise?.addEventListener("click", () => {
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  if (binderEditor.isOpen()) binderEditor.close();
  else binderEditor.open();
});

els.dexGrid.addEventListener("click", (e) => {
  const sellBtn = e.target.closest("[data-sell]");
  if (sellBtn) {
    e.preventDefault();
    e.stopPropagation();
    sellOwnedCard(byId[sellBtn.dataset.sell], { extra: true });
    return;
  }
  if (e.target.closest("a[href]")) return;
  inspectFromEl(e.target);
});

els.inspectClose.addEventListener("click", () => closeDialog(els.inspect));
els.inspect.addEventListener("click", (e) => {
  if (e.target !== els.inspect) return;
  if (Date.now() - inspectOpenedAt < 500) return;
  closeDialog(els.inspect);
});

/*
 * Typing rebuilt the entire binder grid on every keystroke. Selects still
 * apply instantly; only free text waits for a pause in typing.
 */
let searchTimer = 0;
els.search?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderCollection({ refreshSets: false }), 150);
});
els.rarityFilter?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-rarity]");
  if (!btn) return;
  rarityMode = btn.dataset.rarity;
  renderCollection({ refreshSets: false });
});
els.ownedFilter?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-owned]");
  if (!btn) return;
  ownedMode = btn.dataset.owned;
  renderCollection({ refreshSets: false });
});

/*
 * Card art is hotlinked from image CDNs we do not control. If one fails,
 * leave a readable placeholder frame rather than a broken image icon.
 */
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const face = img.closest(".tcg");
    if (!face || face.classList.contains("art-missing")) return;
    face.classList.add("art-missing");
    img.removeAttribute("src");
    img.alt = img.alt ? `${img.alt} (art unavailable)` : "Card art unavailable";
  },
  true
);

function hideBrokenSetArt(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.classList.contains("catalog-logo")) {
    img.closest(".catalog-art")?.classList.add("no-logo");
  } else if (
    img.classList.contains("catalog-symbol") ||
    img.classList.contains("rail-symbol") ||
    img.classList.contains("qs-symbol") ||
    img.classList.contains("inspect-set-symbol") ||
    img.classList.contains("shelf-code") ||
    img.classList.contains("drawn-logo") ||
    img.classList.contains("dbox-logo")
  ) {
    img.remove();
  }
}
els.catalogEras.addEventListener("error", hideBrokenSetArt, true);
els.inspectInfo.addEventListener("error", hideBrokenSetArt, true);
els.setSwitcher.addEventListener("error", hideBrokenSetArt, true);
document.getElementById("shop-quick-sets")?.addEventListener("error", hideBrokenSetArt, true);
els.packGrid.addEventListener("error", hideBrokenSetArt, true);
els.sealedGrid?.addEventListener("error", hideBrokenSetArt, true);
document.getElementById("home-set-picker")?.addEventListener("error", hideBrokenSetArt, true);
els.bulkSets?.addEventListener("error", hideBrokenSetArt, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.priceDialog && !els.priceDialog.classList.contains("hidden")) {
      closeDialog(els.priceDialog);
      return;
    }
    if (!els.inspect.classList.contains("hidden")) {
      closeDialog(els.inspect);
      return;
    }
    if (siteSearch.isOpen()) {
      siteSearch.close();
      return;
    }
    if (packPhase !== "idle") leavePack();
  }
  if (e.key === " " && packPhase === "reveal") {
    e.preventDefault();
    advanceOpen();
  }
  if (e.key === "ArrowLeft" && packPhase === "reveal") {
    e.preventDefault();
    goPrevCard();
  }
  if (e.key === "ArrowRight" && packPhase === "reveal") {
    e.preventDefault();
    advanceOpen();
  }
  if ((e.key === "r" || e.key === "R") && (packPhase === "ready" || packPhase === "reveal")) {
    e.preventDefault();
    revealAllCards();
  }
  if ((e.key === "h" || e.key === "H") && packPhase === "reveal") {
    e.preventDefault();
    skipToHits();
  }
});

/*
 * Sealed prices live in data/sealed.json so `scripts/fetch_prices.py` can
 * refresh them without touching code. Each set's pack cost is the real market
 * price of that booster pack; if the file is missing or a set isn't in it, the
 * cost baked into catalog.js stands.
 */
async function loadSealedPrices() {
  try {
    productList = await fetch("data/products.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  } catch {
    productList = {};
  }
  try {
    boxContents = await fetch("data/box-contents.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  } catch {
    boxContents = {};
  }
  try {
    const prices = await fetch("data/sealed.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
    sealedPrices = prices;
    PLAYABLE_SETS.forEach((set) => {
      const pack = prices[set.id]?.boosterPack;
      if (typeof pack === "number" && pack > 0) set.cost = money(pack);
    });
  } catch {
    /* keep the costs from catalog.js */
  }
  // The Worker's newest TCGplayer prices, once they have arrived (js/liveprices.js), sit over the baked files.
  applyLatestSealed(sealedPrices, productList, PLAYABLE_SETS);
}

let allSetsLoaded = false;

/**
 * Pull in the sets the player isn't looking at, so net worth counts their whole
 * collection. Runs after first paint — it is ~100KB per set and nothing on
 * screen needs it immediately.
 */
async function loadAllSets() {
  await Promise.all(
    PLAYABLE_SETS.map(async (set) => {
      if (!set.dataFile || setCache[set.id]) return;
      try {
        setCache[set.id] = await fetch(set.dataFile, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
        applyCachedPrices(setCache[set.id], set.id);
      } catch {
        /* a missing set just doesn't count toward the total */
      }
    })
  );
  allSetsLoaded = true;
  trackWorth();
  if (view === "home") renderHome();
  // A promo set's page lists the promos in other sets' boxes once they load.
  if (view === "shop" && liveSet.promoSet && packPhase === "idle") renderPromoElsewhere();
  priceTicker?.tick?.();
}

async function loadPatchNotes() {
  try {
    const notes = await fetch("data/patch-notes.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
    patchNotes = Array.isArray(notes) ? notes : [];
  } catch {
    patchNotes = [];
  }
}

async function routeFromLocation() {
  const hash = (location.hash || "").replace("#", "").toLowerCase();
  const path = normalizePath(location.pathname);
  if (hash === "signup" || hash === "register" || path === "/signup") {
    history.replaceState({ view: "auth" }, "", pathForView("auth") + location.search);
    openAuth("signup");
    return;
  }
  if (hash === "signin" || hash === "login") {
    history.replaceState({ view: "auth" }, "", pathForView("auth") + location.search);
    openAuth("signin");
    return;
  }
  if (viewFromPath(path) === "auth") {
    openAuth("signin");
    return;
  }
  const atRoot = path === "/" || path === "/index.html";
  const pathView = viewFromPath(path);
  if (pathView === "shop") {
    const wanted = pathSetId(path);
    const setId = setIdFromPath(path);
    const opened = setId ? await activateSet(setId, false, true) : !wanted;
    if (opened || packPhase !== "idle") {
      // /packs settles on the address of the set that is showing.
      setView("shop", { history: "replace" });
      return;
    }
    // A set that is queued, retired, unknown or failed to load keeps its
    // address and says why, rather than quietly becoming another set.
    showSetNotice(wanted, Boolean(setId));
    setView("shop", { history: "none" });
    return;
  }
  if (pathView && !atRoot) {
    setView(pathView, { history: "none" });
    return;
  }
  const start = state.settings.startView;
  if (start && start !== "home" && VIEW_SECTIONS[start]) {
    setView(start, { history: atRoot ? "replace" : "none" });
    return;
  }
  setView("home", { history: "none" });
}

const gearPage = initGear({
  root: els.viewGear,
  user: () => cloudUser,
  api,
  getGear: () => state.gear,
  setGear: (gear) => {
    state.gear = normalizeGear(gear);
  },
  coins: () => Number(state.coins || 0),
  // A purchase answers with the whole save: the coins, the gear, the header.
  applySave: (save) => {
    if (!cloudUser || !save) return;
    afterEconomy(save);
    renderHeader();
  },
  refresh: async () => {
    await refreshSession();
    renderHeader();
  },
  toast,
});

const battles = initBattles({
  root: els.viewBattles,
  user: () => cloudUser,
  coins: () => Number(state.coins || 0),
  settings: () => state.settings,
  featuredSetId: () => liveSet?.id || state.activeSetId,
  applySave: (save) => {
    if (!cloudUser || !save) return;
    applyCloudSave(save);
    renderHeader();
  },
  refreshSave: async () => {
    await refreshSession();
    renderHeader();
  },
  navigate: (path) => {
    if (!/^\/battles(?:\/[a-zA-Z0-9_-]+)?$/.test(path)) return;
    battlePath = path;
    setView("battles");
  },
  signIn: () => openAuth("signin"),
  toast,
  buzz,
  // Card faces use the same holo component as the pack opening; the
  // document-wide card motion (createCardMotion) tilts any .tcg on the page.
  cardFace: (card, opts) => tcgFace(card, opts),
  cardBack: (setId) => cardBack(ALL_SETS.find((s) => s.id === setId) || liveSet),
  // Battle pulls carry only what scoring needs; the face wants the full
  // catalog record (foil maps, subtypes, small scan). Fetches each set once.
  resolveCards: async (cards) => {
    const sets = new Set((cards || []).map((c) => setForCardId(c.id)).filter(Boolean));
    await Promise.all([...sets].map((set) => loadSetData(set).catch(() => null)));
    return (cards || []).map((c) => {
      const full = findCard(c.id);
      if (!full) return c;
      return { ...full, reverse: Boolean(c.reverse), ...(c.reverseKind ? { reverseKind: c.reverseKind } : {}), value: c.value };
    });
  },
  inspect: (card) => openInspect(card.id, Boolean(card.reverse), card.reverseKind || ""),
});

/** Every card the player owns that has a picture and a price, for the stake picker. */
async function casinoOwnedCards() {
  await Promise.all([refreshSession().catch(() => null), ...PLAYABLE_SETS.map((set) => loadSetData(set).catch(() => null))]);
  renderHeader();
  const out = [];
  for (const [id, owned] of Object.entries(state.collection || {})) {
    if (!(owned > 0)) continue;
    const card = findCard(id);
    if (!card?.image) continue;
    out.push({
      id,
      owned,
      name: card.name,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      small: card.imageSmall || card.image,
      value: sellValue(card),
    });
  }
  return out;
}

/** The player's slabs the casino can stake, for the stake picker's Graded list.
    state.graded never holds a slab that is already in a game (the Worker leaves
    escrowed slabs out of the save), so this is exactly what may be put up.
    value is coins at graded value, the same figure the Worker freezes at stake time. */
async function casinoOwnedSlabs() {
  const slabs = Array.isArray(state.graded) ? state.graded : [];
  const sets = new Set(slabs.filter((s) => !findCard(s.cardId)).map((s) => setForCardId(s.cardId)).filter(Boolean));
  await Promise.all([...sets].map((set) => loadSetData(set).catch(() => null)));
  const out = [];
  for (const slab of slabs) {
    const card = findCard(slab.cardId);
    if (!card?.image) continue;
    const value = Number(slab.value) > 0 ? Number(slab.value) : gradedValue(card, slab.grade, setForCardId(slab.cardId), Boolean(slab.blackLabel));
    if (!(value > 0)) continue;
    out.push({
      id: slab.id,
      cardId: slab.cardId,
      name: card.name,
      number: card.number,
      rarity: card.rarity,
      image: card.image,
      small: card.imageSmall || card.image,
      grade: slab.grade,
      blackLabel: Boolean(slab.blackLabel),
      reverse: Boolean(slab.reverse),
      guard: slab.guard || null,
      value,
      cert: slab.cert || `RIP-${String(slab.id).padStart(7, "0")}`,
    });
  }
  return out;
}

let casinoCardsCache = null;
/**
 * Every card of every set with a picture and a price, for the Upgrader's target picker. Loads each set's
 * data once (a few at a time) and keeps the list: opening the picker again is instant.
 */
function casinoAllCards() {
  casinoCardsCache ||= (async () => {
    const sets = ALL_SETS.filter((set) => set.dataFile);
    let next = 0;
    let failed = false;
    const lane = async () => {
      while (next < sets.length) await loadSetData(sets[next++]).catch(() => { failed = true; });
    };
    await Promise.all(Array.from({ length: 6 }, lane));
    // A set that would not load leaves holes in the list: serve what there is, but ask again next time.
    if (failed) casinoCardsCache = null;
    const seen = new Set();
    const out = [];
    for (const set of sets) {
      for (const card of setCache[set.id] || []) {
        if (!card?.id || !card.image || card.energy || seen.has(card.id)) continue;
        // Only a real market price makes a target; a card priced by the rarity fallback is not one (the Worker refuses it).
        if (!(typeof card.market === "number" && card.market > 0)) continue;
        const value = sellValue(card);
        seen.add(card.id);
        out.push({ id: card.id, setId: set.id, name: card.name, number: card.number, rarity: card.rarity, image: card.image, small: card.imageSmall || card.image, value });
      }
    }
    return out;
  })();
  const pending = casinoCardsCache;
  pending.catch(() => { if (casinoCardsCache === pending) casinoCardsCache = null; });
  return pending;
}

/** Forget the card list (prices moved): the next target pick builds it again from the sets' fresh prices. */
function invalidateCasinoCards() {
  casinoCardsCache = null;
}

/** Every sealed product the shop sells and the cart takes, in every playable set, at the shop's price. */
async function casinoSealedTargets() {
  // The shop's prices load at boot; a list built before they land would be empty, and the picker would keep it.
  if (!Object.keys(sealedPrices).length || !Object.keys(productList).length) await loadSealedPrices();
  if (!Object.keys(sealedPrices).length) throw new Error("The shop prices aren't loaded.");
  const out = [];
  for (const set of PLAYABLE_SETS) {
    const offers = [...sealedOffers(sealedPrices[set.id], productList[set.id]), ...promoOffers(productList[set.id])];
    for (const offer of offers) {
      if (!cartEligible(offer) || !offerPackSets(offer, set)) continue;
      out.push({ kind: "sealed", setId: set.id, id: offer.id, name: offer.name, short: offer.short, image: productImage(set.id, offer.id), packs: offerPackCount(offer), value: offer.price });
    }
  }
  return out;
}

const casino = initCasino({
  root: els.viewCasino,
  bar: els.casinoBar,
  user: () => cloudUser,
  settings: () => state.settings,
  featuredSetId: () => liveSet?.id || state.activeSetId,
  applySave: (save) => {
    if (!cloudUser || !save) return;
    applyCloudSave(save);
    renderHeader();
  },
  navigate: (path) => {
    // A won sealed product waits in the Sealed collection.
    if (path === "/bulk/sealed") return navigateTo(path);
    if (!/^\/casino(?:\/[a-z]+(?:\/[a-zA-Z0-9-]+)?)?$/.test(path) && !/^\/battles(?:\/[a-zA-Z0-9_-]+)?$/.test(path)) return;
    if (path.startsWith("/battles")) {
      battlePath = path;
      setView("battles");
      return;
    }
    casinoPath = path;
    setView("casino");
  },
  signIn: () => openAuth("signin"),
  toast,
  buzz,
  ownedCards: casinoOwnedCards,
  ownedSlabs: casinoOwnedSlabs,
  allCards: casinoAllCards,
  invalidateCards: invalidateCasinoCards,
  sealedTargets: casinoSealedTargets,
  inspect: (card) => openInspect(card.id, Boolean(card.reverse), card.reverseKind || ""),
  // A flip remembers the coin id each player flipped with; the art is that coin's
  // picture from the catalog (null = the house coin).
  coinArt: (id) => {
    const coin = getGearCatalog().coins?.[id];
    return coin ? coinOf(coin, "front") : null;
  },
});

// grading: RIP Grading pages (js/grading-page.js). Money and cards move only through
// its POSTs, each answered with a save that applyCloudSave takes as-is.
const grading = initGrading({
  root: els.viewGrading,
  api,
  user: () => cloudUser,
  getSave: () => state,
  applySave: (save) => {
    if (!cloudUser || !save) return;
    applyCloudSave(save);
    renderHeader();
  },
  cardFace: (card, opts) => tcgFace(card, opts),
  findCard,
  loadSetData,
  inspect: (card) => openInspect(card.id, Boolean(card.reverse), card.reverseKind || ""),
  toast,
  navigate: (path) => {
    // The "In the casino" rows link to the game their slab is sitting in.
    if (/^\/casino\/(?:coinflip|jackpot)\/[a-zA-Z0-9-]{1,80}$/.test(path)) {
      casinoPath = path;
      setView("casino");
      return;
    }
    if (!GRADING_ROUTE.test(path)) return;
    gradingPath = path;
    setView("grading");
  },
  coinTag,
});

/** Any product of any set, by id: the shop, the cart and the sealed collection all resolve through here. */
function offerFor(setId, productId) {
  return findOffer(sealedPrices[setId], productList[setId], productId);
}

/** The box photo data/products.json carries for a product ("" for a box that is only packs). */
function productImage(setId, productId) {
  return (productList[setId] || []).find((item) => item.id === productId)?.image || "";
}

/**
 * Play one box of an order (an OpenResult box) through the normal pack-by-pack
 * opening. Its cards are already in the collection, so nothing is charged and
 * the server is not asked: the slim cards become the same sealedRun startSealed
 * builds. The run keeps `onDone`, which finishRip calls when the player leaves
 * the box summary. Resolves true once the opening is on the table.
 */
async function playOpenedBox(box, { onDone } = {}) {
  if (ripLock || packPhase !== "idle") return false;
  ripLock = true;
  try {
    const set = getSet(box.setId);
    const offer = findOffer(sealedPrices[box.setId], productList[box.setId], box.productId);
    const wrapped = (box.packs || []).map((pack) => ({ set: pack.setId ? getSet(pack.setId) : set, pack }));
    const slimCards = [...(box.promos || []), ...(box.boxCards || [])];
    await Promise.all(
      [...new Set([...wrapped.map((item) => item.set), ...slimCards.map((card) => setForCard(card))])].map((item) =>
        loadSetData(item).catch(() => null)
      )
    );
    const full = (slim, extra) => {
      const base = findCard(slim.id);
      return base ? { ...base, ...extra, wasNew: Boolean(slim.wasNew) } : null;
    };
    const packs = wrapped
      .map(({ set: packSet, pack }) => ({
        set: packSet,
        wrapper: wrapperFor(pack.wrapperId, packSet),
        cards: (pack.cards || [])
          .map((slim) => full(slim, { reverse: Boolean(slim.reverse), ...(slim.reverseKind ? { reverseKind: slim.reverseKind } : {}) }))
          .filter(Boolean),
      }))
      .filter((pack) => pack.cards.length);
    const promos = (box.promos || []).map((slim) => full(slim, { reverse: false })).filter(Boolean);
    const boxCards = (box.boxCards || []).map((slim) => full(slim, { reverse: false, n: slim.n })).filter(Boolean);
    const gift = Array.isArray(box.gear) ? box.gear : [];
    if (!packs.length && !promos.length && !boxCards.length && !gift.length) return false;
    sealedRun = {
      product: {
        ...offer,
        id: box.productId,
        name: box.name || offer?.name || "Box",
        short: box.short || offer?.short || "Box",
        noun: box.noun || offer?.noun || "box",
        packs: packs.length,
      },
      set,
      packs,
      promos,
      gift,
      boxCards,
      index: promos.length || boxCards.length || gift.length ? -1 : 0,
      cost: box.price,
      onDone,
    };
    if (promos.length || boxCards.length || gift.length) showPromoIntro();
    else presentPack(packs[0].wrapper, packs[0].cards, packs[0].set);
    return true;
  } catch {
    sealedRun = null;
    toast("Couldn't play that one.");
    return false;
  } finally {
    ripLock = false;
  }
}

const batchOpen = initBatchOpen({
  root: els.batchOpen,
  findCard,
  loadSetData,
  getSet,
  setForCard,
  cardFace: (card, opts) => tcgFace(card, opts),
  inspect: (card) => openInspect(card.id, Boolean(card.reverse), card.reverseKind || ""),
  sellValue,
  playBox: playOpenedBox,
  openDialog,
  closeDialog,
  giftHtml: (rows, opts) => giftHtml(rows, state.gear, opts),
  toast,
  navigate: (path) => navigateTo(path),
});

/** Client-side route change to any known path (the cart, the sealed collection, the shop...). */
function navigateTo(path) {
  const target = viewFromPath(path);
  if (!target) return;
  setView(target);
}

const cartPage = initCart({
  root: els.viewCart,
  api,
  user: () => cloudUser,
  coins: () => Number(state.coins || 0),
  offerFor,
  productImage,
  getSet,
  packPicture,
  eligible: (setId, productId) => cartEligible(offerFor(setId, productId)),
  applySave: (save) => {
    if (!cloudUser || !save) return;
    afterEconomy(save);
    renderHeader();
    renderShop();
  },
  showOpened: (opened, opts) => batchOpen.show(opened, opts),
  navigate: (path) => navigateTo(path),
  signIn: () => openAuth("signin"),
  toast,
});

/** Every sealed product in the shop, at the shop's price, for the site search (cart-eligible ones carry `cart`). */
async function searchSealedItems() {
  if (!Object.keys(sealedPrices).length || !Object.keys(productList).length) await loadSealedPrices();
  const out = [];
  for (const set of PLAYABLE_SETS) {
    const prices = sealedPrices[set.id];
    const offers = [...sealedOffers(prices, productList[set.id]), ...promoOffers(productList[set.id])];
    for (const offer of offers) {
      out.push({
        setId: set.id,
        id: offer.id,
        name: offer.name,
        short: offer.short,
        kind: offer.kind || offer.id,
        price: offer.price,
        packs: offerPackCount(offer),
        image: productImage(set.id, offer.id),
        cart: cartEligible(offer) && Boolean(offerPackSets(offer, set)),
      });
    }
    if (typeof prices?.boosterPack === "number" && prices.boosterPack > 0) {
      out.push({ setId: set.id, id: "boosterPack", name: "Booster Pack", short: "Pack", kind: "pack", price: money(prices.boosterPack), packs: 1, image: "", cart: false });
    }
  }
  return out;
}

const siteSearch = initSearch({
  root: document.getElementById("site-search"),
  opener: [document.getElementById("search-open"), document.getElementById("search-open-tab")].filter(Boolean),
  openDialog,
  closeDialog,
  sealedItems: searchSealedItems,
  // The inspector looks a card up by id, so the card's set has to be loaded first.
  openCard: async ({ id, setId }) => {
    try {
      const set = getSet(setId);
      if (set.id !== setId) throw new Error("unknown set");
      await loadSetData(set);
      if (!findCard(id)) throw new Error("missing card");
      openInspect(id);
    } catch {
      toast("Couldn't open that card.");
    }
  },
  openShop: async (setId) => {
    if (await activateSet(setId)) setView("shop");
  },
  owned: (id) => ownedQty(id),
  signedIn: () => Boolean(activeTrainer()),
  signIn: () => openAuth("signup"),
  toast,
  canOpen: () => packPhase === "idle",
});

const vaultPage = initVault({
  root: els.viewVault,
  api,
  user: () => cloudUser,
  kept: () => state.vaultKept || 0,
  offerFor,
  productImage,
  getSet,
  packPicture,
  applySave: (save) => {
    if (!cloudUser || !save) return;
    afterEconomy(save);
    renderHeader();
  },
  showOpened: (opened, opts) => batchOpen.show(opened, opts),
  navigate: (path) => navigateTo(path),
  signIn: () => openAuth("signin"),
  toast,
});

async function boot() {
  try {
    await Promise.all([loadSealedPrices(), loadPatchNotes(), loadGearCatalog()]);
    await refreshSession();
    // Friends and requests load now rather than on the next 5s poll, so the
    // Social page and the Friends badge are right on first paint.
    if (cloudUser) notifySignedIn();
    // A linked set that won't load falls back to the saved one so the page
    // still has cards; routeFromLocation then says why.
    const linkedSet = setIdFromPath(location.pathname);
    if (!linkedSet || !(await activateSet(linkedSet, false, true))) {
      const saved = state.activeSetId || DEFAULT_SET_ID;
      if (saved === linkedSet || !(await activateSet(saved))) await activateSet(DEFAULT_SET_ID);
    }
    applySettings();
    renderHeader();
    scheduleDailyTick();
    const back = new Image();
    back.src = backSrc();
    await routeFromLocation();

    // Not awaited: the page is usable without it, and it refreshes home when done.
    loadAllSets();
    priceTicker = startLivePrices({
      sets: () =>
        PLAYABLE_SETS.map((set) => ({
          id: set.id,
          cards: setCache[set.id] || [],
        })),
      activeId: () => liveSet.id,
      refreshSealed: loadSealedPrices,
      onUpdate: () => {
        renderHeader();
        if (packPhase !== "idle") return;
        if (view === "home") renderHome();
        if (view === "shop") renderShop();
        if (view === "collection") renderCollection();
        if (view === "binder") renderBinder();
        if (view === "account") renderAccount();
        if (inspectCard && els.inspect && !els.inspect.classList.contains("hidden")) {
          paintInspect(inspectCard);
        }
      },
    });
  } finally {
    revealSite();
  }
}

function revealSite() {
  initFx();
  const go = () => {
    document.body.classList.add("is-ready");
    document.body.classList.remove("is-booting");
  };
  if (reduceMotion()) {
    go();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(go));
}

boot().catch((err) => {
  console.error(err);
  toast(err?.message || `Couldn't load ${liveSet.name} data.`);
});
initRadio();
initSocial({
  getUser: () => cloudUser,
  toast,
  openProfile: (handle) => setView("profile", { handle }),
  openAuth,
  openDm: (handle) => setView("social", { handle }),
  onTick: () => {
    if (view !== "social") return;
    if (document.activeElement?.closest("#dm-form, .dm-threads")) return;
    renderSocial();
  },
});

/*
 * The header only changes on its own when the hourly stack unlocks, so
 * schedule a single tick for the next meaningful change instead of rewriting
 * the DOM four times a second for the whole session.
 */
let dailyTimer = 0;
function scheduleDailyTick() {
  clearTimeout(dailyTimer);
  const wait = msUntilDaily(state);
  if (wait <= 0) return;
  // Tick every second in the last minute, otherwise on the next whole minute.
  const next = wait <= 60_000 ? Math.min(wait, 1000) : Math.min(wait - 60_000, 60_000);
  dailyTimer = setTimeout(() => {
    renderHeader();
    scheduleDailyTick();
  }, Math.max(next, 250));
}

// A tab left sitting should notice the hourly stack is ready again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    renderHeader();
    scheduleDailyTick();
  }
});
