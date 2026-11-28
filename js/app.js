import { createCardMotion } from "./card-motion.js?v=4";
import {
  foilExtras, foilClass as finishClass, foilLayout as finishLayout, foilLook as finishLook, foilPattern as finishPattern,
  reverseKindOf as finishReverseKind, dataFinish,
} from "./foil-maps.js?v=147";
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
  COINS_PER_USD,
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
  boxPromoCards,
  isBoosterSet,
  isExtraSet,
  kitHalves,
  kitHalfName,
  kitName,
  foldKits,
  setCategory,
  SET_CATEGORIES,
} from "./catalog.js";
import { dexId, dexIds, foldCopies, homeSetId, isBoxPromoId, promoHomeOf } from "./card-home.js";
import { createCardPicker } from "./card-picker.js?v=3";
import { HIT_RARITIES, canPullReverse, isHit, tallyRarity } from "./engine.js";
import { initRadio } from "./radio.js?v=5";
import { createTear } from "./tear.js?v=2";
import { initSocial, notifySignedIn, faceHtml, levelTag, sendChat, refreshLounge, currentFriends, paintLounge } from "./social.js?v=7";
import { hubHeadHtml, socialTabFromPath } from "./social-hub.js?v=3";
import { renderRankings, standingLine } from "./rankings.js?v=7";
import { frameHtml, levelBadgeHtml, framePicksHtml, userFrame } from "./level-badge.js";
import { BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES, frameInfo } from "./levels.js";
import { roomLine } from "./gate-notice.js";
import {
  AVATARS,
  avatarSrc,
  avatarFit,
  avatarStyle,
  avatarPixel,
  avatarFallback,
  bannerVars,
  parseBanner,
  BANNER_MOTIONS,
  STAT_KEYS,
  DEFAULT_STATS,
  SHOWCASE_MAX,
} from "./cosmetics.js";
import { unlockedTitles, titleContext, TITLES, isTitleUnlocked, ownedPerSet } from "./titles.js";
import { slabHTML, gradeWord } from "./slab.js?v=3";
import { GRADING_LIMITS, gradedValue } from "./grading-rules.js";
import {
  ACHIEVEMENTS,
  achievementsFor,
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
import * as questArea from "./quest-area.js?v=10";
import * as levelUi from "./level-ui.js";
import { rollFigures, growBars, flyCoins, markPicks, landPreview } from "./acct-motion.js";
import { avatarPickerHtml, initAvatarPicker, resetAvatarPicker } from "./avatar-picker.js";
import { createXpFeed } from "./level-feed.js";
import { startLivePrices, applyCachedPrices, applyLatestSealed } from "./liveprices.js?v=5";
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
  DAILY_COOLDOWN_MS,
  STARTING_COINS,
  DEFAULT_SETTINGS,
} from "./state.js";
import {
  AVATAR_COLORS,
  avatarColor,
  trainerCode,
} from "./accounts.js";
import { api, ApiError } from "./api.js";
import { THEMES, canUseTheme, resolveLook } from "./themes.js?v=2";
import { equippedCoin, gearItem, normalizeGear } from "./gear.js?v=2";
import { cardBackHtml, cardBackSrc, coinHtml, getGearCatalog, giftHtml, initGear, loadGearCatalog, sleeveHtml } from "./gear-page.js?v=17";
import { initBattles } from "./battles.js?v=10";
import { initCasino } from "./casino.js?v=33";
import { coinOf } from "./coin.js?v=7";
// grading
import { initGrading, GRADING_ROUTE, CERT_ROUTE } from "./grading-page.js?v=21";
// trades
import { initTrades, TRADES_ROUTE } from "./trades-page.js?v=6";
import { coinTag } from "./battle-kit.js";
import { coinText, coinAmount, COIN_I } from "./money.js?v=2";
import { receiptHtml, pullRow } from "./receipt.js?v=2";
// cart and sealed collection (CONTRACT: /mnt/project-files/cart-sealed/CONTRACT.md)
import { cartStore, cartControlHtml, cartControlClick, cartControlChange, refreshCartControls, mountCartBar } from "./cart.js?v=6";
import { initCart } from "./cart-page.js?v=10";
import { startTour, maybeStartTour } from "./tour.js?v=3";
import { initVault } from "./vault-page.js?v=9";
import { initBatchOpen } from "./batch-open.js?v=6";
import { cartEligible } from "./orders-rules.js?v=1";
import { initSearch } from "./search.js?v=7";
import { initWishlist } from "./wishlist.js?v=2";
import { initSecurity, securityTabHtml, resetSecurity, securityChanged, finishDiscordReturn, startTwoStep, inTwoStep, endTwoStep, twoStepAuthHtml, twoStepHandle } from "./account-security.js?v=1";
import { createShareSheet, pullUrl } from "./share-pull.js?v=3";
// binder looks: the /binder cover, the customiser and the owner's look on a profile
import { binderObjectHtml, applyBinderLook } from "./binder-object.js";
import { watchBinderFx } from "./binder-editions.js";
import { normalizeBinderLook, resolveBinderLook, COLOR_FROM_CARDS } from "./binder-looks.js";
import { hexToHsl, hslToHex, mixHex } from "./card-accent.js";
import { cachedCardAccents, sampleCardAccents } from "./card-art-accent.js?v=1";
import { initBinderEditor } from "./binder-editor.js?v=4";
import { renderNotesPage } from "./notes-page.js?v=4";
import { initThisWeek } from "./this-week.js?v=1";
import { renderLegalPage, LEGAL_TITLES } from "./legal-page.js?v=6";
import { ageFieldsHtml, agreeRowHtml, readAgeFields, ageBlocked, blockAge, UNDERAGE_HTML, syncTermsSheet } from "./terms-sheet.js?v=1";

const state = loadState();
let cloudUser = null;
// The share-a-pull sheet (js/share-pull.js); it builds its dialog on first use.
const shareSheet = createShareSheet({ openDialog, closeDialog, toast });
let profileHandle = "";
let profileReturn = "";
let profileBinderView = {handle:"", pages:[], mine:false, position:0};
// Binder page index named by a /u/<handle>/binder/<n> link, kept while that page is on screen.
let profilePageWanted = null;
let profilePageScroll = false;
let dmHandle = "";
let dmSeen = { handle: "", n: 0 }; // social: how many lines of the open thread were last painted
let rankingsDrawnAt = 0; // social: when the rankings were last fetched, so the 5s social tick refreshes them once a minute
let dmStick = false; // social: the next paint of the open thread goes to the newest line (a message was just sent)
let socialTab = "friends"; // friends, rankings or lounge (js/social-hub.js)
const CLOUD_SEEN_KEY = "poke-pack-rip-cloud-seen";
let pendingClaim = localStorage.getItem(CLOUD_SEEN_KEY) ? null : snapshotIfProgress(state);
let ripLock = false;
let battleReturnPath = "";
let battlePath = "/battles";
let casinoReturnPath = "";
let casinoPath = "/casino";
let gradingPath = "/grading"; // grading
let tradesPath = "/trades"; // trades
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
  wishlist?.adopt(save); // hearted cards (js/wishlist.js)
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
  wishlist?.reset(); // the account's hearts leave with it; this browser's come back
  // Screen memory belongs to the account that is gone: a secret revealed for one
  // trainer must not stay revealed for the next.
  achFilter = "all";
  achCat = "";
  masteryEra = "";
  masterySet = "";
  freshClaims = new Set();
  seenSecrets.clear();
}

async function refreshSession(early = null) {
  try {
    const me = await (early || api("/api/me"));
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
/** The live set's box promos (stamped and cosmos prints from its blisters and boxes): on its collection page under their own word, never in its dex or its count. */
let boxCards = [];
let byId = {};
let view = "home";
let viewFadeGen = 0;
let patchNotes = [];
let ownedMode = "all";
/** The collection's rarity group (RARITY_GROUPS), and one rarity inside it when the group holds several. */
let rarityGroup = "all";
let rarityMode = "all";
let authTab = "signup";
let signupColor = "";
let legalDoc = "terms"; // which of /terms, /privacy, /legal the legal view shows
/** Account page: which tab is open, how the badge wall is filtered. */
let accountTab = "overview";
let acctArriving = false; // the account page is arriving: its figures roll from 0 (js/acct-motion.js)
let acctTabShown = "";
let achFilter = "all";
let questPeriod = ""; // the quest board's chosen period word; "" opens the first with something to claim
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
  viewTcg: document.getElementById("view-tcg"),
  viewWishlist: document.getElementById("view-wishlist"),
  viewCasino: document.getElementById("view-casino"),
  viewGrading: document.getElementById("view-grading"), // grading
  viewTrades: document.getElementById("view-trades"), // trades
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
  viewLegal: document.getElementById("view-legal"),
  homeKicker: document.getElementById("home-kicker"),
  homeBody: document.getElementById("home-body"),
  accountBody: document.getElementById("account-body"),
  profileBody: document.getElementById("profile-body"),
  socialBody: document.getElementById("social-body"),
  authBody: document.getElementById("auth-body"),
  settingsBody: document.getElementById("settings-body"),
  notesBody: document.getElementById("notes-body"),
  legalBody: document.getElementById("legal-body"),
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
  opPurse: document.getElementById("op-purse"),
  opCount: document.getElementById("op-count"),
  opReceipt: document.getElementById("op-receipt"),
  spread: document.getElementById("spread"),
  ripHint: document.getElementById("rip-hint"),
  overlayActions: document.getElementById("overlay-actions"),
  leavePack: document.getElementById("leave-pack"),
  stepBtn: document.getElementById("step-btn"),
  skipHitsBtn: document.getElementById("skip-hits-btn"),
  skipBtn: document.getElementById("skip-btn"),
  againBtn: document.getElementById("again-btn"),
  viewPullsBtn: document.getElementById("view-pulls-btn"),
  doneBtn: document.getElementById("done-btn"),
  sellBulkBtn: document.getElementById("sell-bulk-btn"),
  binderHitBtn: document.getElementById("binder-hit-btn"),
  boxSummaryBtn: document.getElementById("box-summary-btn"),
  boxProgress: document.getElementById("box-progress"),
  inspect: document.getElementById("inspect"),
  inspectArt: document.getElementById("inspect-art"),
  inspectInfo: document.getElementById("inspect-info"),
  inspectClose: document.getElementById("inspect-close"),
  toast: document.getElementById("toast"),
};

/* ---- Wishlist (js/wishlist.js): hearted cards and the /wishlist page ---- */

/** promo card id -> [{ setId, name }] of the products that hold it, rebuilt when the product list changes. */
let promoHomes = null;
let promoHomesOf = null;
function productsHolding(cardId) {
  if (promoHomesOf !== productList) {
    promoHomes = new Map();
    promoHomesOf = productList;
    for (const [setId, items] of Object.entries(productList || {})) {
      if (!Array.isArray(items) || !PLAYABLE_SETS.some((set) => set.id === setId)) continue;
      for (const item of items) {
        for (const id of Array.isArray(item?.promos) ? item.promos : []) {
          if (!promoHomes.has(id)) promoHomes.set(id, []);
          if (!promoHomes.get(id).some((p) => p.name === item.name)) promoHomes.get(id).push({ setId, name: String(item.name || "") });
        }
      }
    }
  }
  return promoHomes.get(cardId) || [];
}

/** Where a card on the wishlist comes from: the products that hold it, else its set's packs. */
function wishSource(entry) {
  const products = productsHolding(entry.id);
  if (products.length) return { kind: "product", setId: products[0].setId, products: products.map((p) => p.name) };
  const set = PLAYABLE_SETS.find((item) => item.id === entry.dataSetId) || PLAYABLE_SETS.find((item) => item.id === entry.setId);
  if (set?.wrappers?.length) return { kind: "pack", setId: set.id, products: [] };
  return { kind: "none", setId: "", products: [] };
}

const wishlist = initWishlist({
  root: document.getElementById("view-wishlist"),
  api,
  signedIn: () => Boolean(activeTrainer()),
  openAuth: (mode) => openAuth(mode),
  openSearch: () => siteSearch.open(),
  toast: (msg) => toast(msg),
  owned: (id) => ownedQty(id),
  openCard: (card) => openIndexedCard(card),
  openShop: async (setId) => {
    if (await activateSet(setId)) setView("shop");
  },
  sourceOf: wishSource,
  setInfo: (id) => {
    const set = ALL_SETS.find((item) => item.id === id);
    return set ? { name: kitOf(set)?.name || set.name, symbol: setIdentity(set).symbol } : null;
  },
});

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

function hasEvoCircle(card) {
  const subs = card?.subtypes || [];
  return subs.includes("Stage 1") || subs.includes("Stage 2") || Boolean(card?.evolvesFrom);
}

// Which finish a face is drawn in lives in js/foil-maps.js ("The finish classifier"), shared with the lab and the census.
function foilClass(card) {
  return finishClass(card, setForCard(card));
}

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
  return finishReverseKind(card, setForCard(card));
}

function foilLayout(card) {
  return finishLayout(card);
}

function foilPattern(card) {
  return finishPattern(card, setForCard(card));
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
  return finishLook(card);
}

function tcgFace(card, { small = false, stamp = true, lazy = false } = {}) {
  if (!card) return cardBack();
  const src = small ? card.imageSmall : card.image;
  const shown = card;
  card = foilLook(card);
  const reverse = card.reverse ? "reverse" : "";
  const evo = foilLayout(card);
  const pattern = foilPattern(card);
  // The monochrome printings need a different light response (js/foil-maps.js dataFinish).
  const finish = dataFinish(card);
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
    ${/\bhas-set-stamp\b/.test(extra.classes) ? `<span class="set-stamp" aria-hidden="true"></span>` : ""}
    ${/\bhas-etch-map\b/.test(extra.classes) ? `<span class="shine" aria-hidden="true"></span><span class="relief" aria-hidden="true"></span>` : ""}
    ${stamp ? rarityStamp(shown) : ""}
  </div>`;
}

/** The face-down card out of a pack: always the set's own printed back. Sleeves are for the
    card game only (Noah, 2026-11-26: "save the sleeves for the game"); it passes state.gear itself. */
function backSrc(set = liveSet) {
  return cardBackSrc(null, set?.cardBack || liveSet.cardBack);
}

function cardBack(set = liveSet) {
  return cardBackHtml(null, set?.cardBack || liveSet.cardBack);
}

function setOwned() {
  return setCards.filter((card) => ownedNow(card.id) > 0).length;
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

/* The collection's five-way rarity control: everything, then Common,
   Uncommon, Rare (every other rare-slot card) and Hits (isHit), each
   with how many of its cards the player has. */
const RARITY_GROUPS = [
  ["all", "All"],
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["hits", "Hits"],
  ["box", "Box promos"],
];
const GROUP_ALL_WORD = { common: "All commons", uncommon: "All uncommons", rare: "All rares", hits: "All hits", box: "All box promos" };

function rarityGroupOf(card) {
  if (isBoxPromoId(card.id)) return "box";
  if (card.rarity === "Common" || card.rarity === "Energy") return "common";
  if (card.rarity === "Uncommon") return "uncommon";
  // A WotC holo Rare is a hit; a later holo Rare is the rare slot's usual card.
  return isHit({ ...card, reverse: false }) ? "hits" : "rare";
}

/** { all: { have, total }, common: {...}, ... } over the set's own cards. */
function groupCounts() {
  const counts = Object.fromEntries(RARITY_GROUPS.map(([key]) => [key, { have: 0, total: 0 }]));
  for (const card of setCards) {
    const have = ownedQty(card.id) > 0 ? 1 : 0;
    for (const key of ["all", rarityGroupOf(card)]) {
      counts[key].total += 1;
      counts[key].have += have;
    }
  }
  // Box promos are counted under their own word only: "All" is the set's pack cards.
  for (const card of boxCards) {
    counts.box.total += 1;
    counts.box.have += ownedQty(card.id) > 0 ? 1 : 0;
  }
  return counts;
}

/**
 * The paper key slides to the chosen group, so the buttons are only rebuilt
 * when a label or count changes; choosing a group just moves the key.
 */
let groupsHtml = "";
function paintRarityGroups(counts) {
  const host = document.getElementById("rarity-groups");
  if (!host) return;
  const shown = RARITY_GROUPS.filter(([key]) => key === "all" || counts[key].total > 0);
  if (!shown.some(([key]) => key === rarityGroup)) rarityGroup = "all";
  // All and one group would say the same thing twice.
  host.hidden = shown.length < 3;
  const signed = Boolean(activeTrainer());
  // Slanted words (css/pages/collection.css): the name, then how many you have of how many.
  const html = shown
    .map(([key, word]) => {
      const label = key === "all" ? "All rarities" : word;
      const { have, total } = counts[key];
      const figure = signed ? `${num(have)}/${num(total)}` : num(total);
      const said = signed ? `${num(have)} of ${num(total)}` : `${num(total)} cards`;
      return `<button type="button" class="rt-word coll-word" data-group="${key}" aria-label="${label}, ${said}"><span>${label}</span><small>${figure}</small></button>`;
    })
    .join("");
  if (html !== groupsHtml) {
    host.innerHTML = html;
    groupsHtml = html;
  }
  host.querySelectorAll("[data-group]").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.group === rarityGroup)));
}

/** Inside a group that holds several rarities (Hits, or an old set's rares), a row of words narrows it to one. */
function fillRarityFilter() {
  if (!els.rarityFilter) return;
  const present = new Set(
    rarityGroup === "all" ? [] : setCards.filter((card) => rarityGroupOf(card) === rarityGroup).map((card) => card.rarity)
  );
  const list = [...RARITY_ORDER.filter((r) => present.has(r)), ...[...present].filter((r) => !RARITY_ORDER.includes(r))];
  if (rarityMode !== "all" && !present.has(rarityMode)) rarityMode = "all";
  els.rarityFilter.hidden = list.length < 2;
  if (list.length < 2) {
    els.rarityFilter.innerHTML = "";
    return;
  }
  const chip = (value, label, marks = "") =>
    `<button type="button" class="rt-word coll-word coll-rar" data-rarity="${esc(value)}" aria-pressed="${rarityMode === value}">${marks}<span>${esc(label)}</span></button>`;
  els.rarityFilter.innerHTML = [
    chip("all", GROUP_ALL_WORD[rarityGroup] || "All"),
    ...list.map((r) => chip(r, RARITY_LABEL[r] || r, `<span class="rarity-marks">${rarityIcons(r)}</span>`)),
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

/** Accounts from before the Terms agree to them once (js/terms-sheet.js); the sheet comes and goes with the header. */
function syncTerms() {
  syncTermsSheet(activeTrainer(), {
    api,
    done: async (result) => {
      if (result?.deleted) {
        cloudUser = null;
        pendingClaim = null;
        setPersistProgress(false);
        wipeProgressMemory();
        await hydrateAfterAccountChange();
        setView("home");
        toast("Account deleted.");
        return;
      }
      cloudUser = result.user;
      if (result.save) applyCloudSave(result.save);
      renderHeader();
      VIEW_RENDER[view]?.();
      toast("Thanks, you're all set.");
    },
    signOut: async () => {
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
      setView("home");
      toast("Signed out.");
    },
  });
}

/**
 * The Claim tile: a coin in a ring that fills back up over the cooldown, over
 * two lines ("Claim / 100", "Ready in / 49m"). `left` is the share of the
 * cooldown still to go, 0 when it's ready.
 */
function claimTile(lead, value, left = 0) {
  const gap = Math.round(Math.min(1, Math.max(0, left)) * 100);
  return `<span class="claim-ring" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" /><circle class="claim-arc" cx="12" cy="12" r="10.5" pathLength="100" style="stroke-dashoffset:${gap}" /></svg><img src="assets/coins/pp-coin-v1.svg" alt="" width="14" height="14" /></span><span class="claim-tx"><small class="btn-word">${esc(lead)} </small><b>${esc(value)}</b></span>`;
}

/** The phone HUD's trainer: their face in a ring that fills toward the next level, and the level under it. */
function paintHud(trainer) {
  const me = document.getElementById("hud-me");
  if (!me) return;
  const face = document.getElementById("hud-face");
  const lv = document.getElementById("hud-lv");
  const xp = trainer && state.xp ? levelUi.xpOf(state) : null;
  const pct = xp ? (xp.maxed ? 100 : Math.max(0, Math.min(100, Number(xp.pct) || 0))) : 0;
  me.style.setProperty("--lvl-gap", String(100 - pct));
  me.classList.toggle("is-guest", !trainer);
  me.classList.toggle("has-wait", Boolean(xp && (xp.claimable.length || xp.canPrestige)));
  if (face) {
    face.classList.toggle("pixel", Boolean(trainer) && avatarPixel(trainer.avatarStyle));
    face.innerHTML = trainer
      ? `<img src="${esc(avatarSrc(trainer.avatar, trainer.avatarStyle, { still: true }))}"${avatarFit(trainer.avatar, trainer.avatarStyle, { still: true })} alt="" />`
      : `<img src="assets/mark-v3.png" alt="" />`;
    if (trainer) face.style.setProperty("--avatar", avatarColor(trainer.color).hex);
  }
  if (lv) {
    lv.hidden = !xp;
    lv.textContent = xp ? `Lv ${num(xp.level)}` : "";
  }
  me.setAttribute(
    "aria-label",
    trainer ? `Menu. Signed in as @${trainer.handle}${xp ? `, level ${num(xp.level)}` : ""}` : "Menu"
  );
}

function renderHeader() {
  syncTerms();
  const trainer = activeTrainer();
  if (!trainer) {
    els.coinCount.textContent = "0";
    els.dailyBtn.disabled = false;
    els.dailyBtn.innerHTML = claimTile("Claim", String(DAILY_BONUS));
    els.dailyBtn.setAttribute("aria-label", `Claim ${DAILY_BONUS} daily coins`);
  } else {
    const wait = msUntilDaily(state);
    // Levels and prestige stars raise the hourly claim (js/levels.js hourlyBonus); a guest save has none.
    const hourly = state.xp ? levelUi.xpOf(state).hourly : DAILY_BONUS;
    els.coinCount.textContent = coin(state.coins);
    els.dailyBtn.disabled = wait > 0;
    els.dailyBtn.innerHTML = wait > 0
      ? claimTile("Ready in", waitLabel(wait), wait / DAILY_COOLDOWN_MS)
      : claimTile("Claim", String(hourly));
    // The name keeps the visible words ("Claim 100", "Ready in 2h 14m") for voice control.
    els.dailyBtn.setAttribute("aria-label", wait > 0 ? `Daily coins ready in ${waitLabel(wait)}` : `Claim ${hourly} daily coins`);
  }
  // A long purse ("49,947.74") leaves no room for the word beside Lite on a phone.
  els.coinCount.closest(".site-header")?.classList.toggle("long-purse", els.coinCount.textContent.length > 7);
  paintHud(trainer);
  const lite = document.getElementById("lite-toggle");
  if (lite) lite.checked = Boolean(state.settings.lite);
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
    els.trainerAvatar.innerHTML = `<img src="${esc(avatarSrc(trainer.avatar, trainer.avatarStyle, { still: true }))}"${avatarFit(trainer.avatar, trainer.avatarStyle, { still: true })} alt="" />`;
    els.trainerAvatar.classList.toggle("pixel", avatarPixel(trainer.avatarStyle));
    els.trainerChipName.textContent = trainer.name;
    els.trainerChipHandle.textContent = `@${trainer.handle}`;
  }
  paintMeMenus(trainer);
}

/** The menu under your name (computers) and the head of the phone menu: who you are, your level, your links. */
function paintMeMenus(trainer) {
  const xp = trainer && state.xp ? levelUi.xpOf(state) : null;
  const face = trainer
    ? `<img src="${esc(avatarSrc(trainer.avatar, trainer.avatarStyle, { still: true }))}"${avatarFit(trainer.avatar, trainer.avatarStyle, { still: true })} alt="" />`
    : `<img src="assets/mark-v3.png" alt="" />`;
  const pixel = Boolean(trainer) && avatarPixel(trainer.avatarStyle);
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  for (const id of ["me-face", "menu-me-face"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = face;
    el.classList.toggle("pixel", pixel);
    if (trainer) el.style.setProperty("--avatar", avatarColor(trainer.color).hex);
  }
  set("me-name", trainer ? trainer.name : "Trainer");
  set("me-handle", trainer ? `@${trainer.handle}` : "");
  set("menu-me-name", trainer ? trainer.name : "Playing as a guest");
  set("menu-me-handle", trainer ? `@${trainer.handle}` : "Sign in to keep your cards");
  for (const id of ["me-lv", "menu-me-lv"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.hidden = !xp;
    el.textContent = xp ? `Lv ${num(xp.level)}` : "";
  }
  const bar = document.getElementById("me-xp");
  if (bar) {
    bar.hidden = !xp;
    const pct = xp ? (xp.maxed ? 100 : Math.max(0, Math.min(100, Number(xp.pct) || 0))) : 0;
    document.getElementById("me-xp-fill")?.style.setProperty("width", `${pct}%`);
    set("me-xp-note", xp ? (xp.maxed ? "Top level" : `${Math.round(pct)}% to level ${num(xp.level + 1)}`) : "");
  }
  const profile = document.getElementById("me-profile");
  if (profile && trainer) profile.href = `/u/${trainer.handle}`;
  set("me-profile-url", trainer ? `poke-pack.rip/u/${trainer.handle}` : "");
  const out = document.getElementById("menu-out");
  if (out) out.hidden = !trainer;
  if (!trainer) closeMeMenu();
}

const meMenu = document.getElementById("me-menu");
let meMenuTimer = 0;
function closeMeMenu() {
  if (!meMenu || meMenu.hidden || meMenu.classList.contains("is-closing")) return;
  els.trainerChip?.setAttribute("aria-expanded", "false");
  // It folds back up under your name, then leaves the page.
  meMenu.classList.add("is-closing");
  clearTimeout(meMenuTimer);
  meMenuTimer = setTimeout(() => {
    meMenu.hidden = true;
    meMenu.classList.remove("is-closing");
  }, document.body.classList.contains("no-motion") ? 0 : 130);
}
function toggleMeMenu() {
  if (!meMenu) return setView("account");
  if (!meMenu.hidden && !meMenu.classList.contains("is-closing")) return closeMeMenu();
  clearTimeout(meMenuTimer);
  meMenu.classList.remove("is-closing");
  meMenu.hidden = false;
  els.trainerChip?.setAttribute("aria-expanded", "true");
}

/** The header's cart link: shown with the product count while the cart holds anything. */
function paintCartLink() {
  const n = cartStore.count();
  els.cartLink?.classList.toggle("hidden", !n);
  if (els.cartCount) {
    const text = n > 99 ? "99+" : String(n);
    // The badge pops when the count changes in front of the player.
    if (els.cartCount.textContent !== text && els.cartCount.textContent !== "" && fxOk()) {
      els.cartCount.classList.remove("is-pop");
      void els.cartCount.offsetWidth;
      els.cartCount.classList.add("is-pop");
    }
    els.cartCount.textContent = text;
  }
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
  const kit = kitOf(liveSet);
  paintSign(els.shopTitle, kit?.name || liveSet.name);
  // A Trainer Kit is one page: its two half decks are a switch under the name.
  const halfSwitch = document.getElementById("shop-halves");
  if (halfSwitch) {
    halfSwitch.hidden = !kit;
    halfSwitch.innerHTML = kit
      ? kit.halves
          .map((half) => {
            const on = half === liveSet;
            const have = activeTrainer() ? ` <small>${num(Math.min(ownedInSet(half), half.totalCount))}/${num(half.totalCount)}</small>` : "";
            return `<button type="button" class="kit-half${on ? " active" : ""}" data-quick-set="${esc(half.id)}" aria-pressed="${on}">${esc(kitHalfName(half))} half deck${have}</button>`;
          })
          .join("")
      : "";
  }
  // The set's own logo heads its page; the name stands in when there is none.
  const logo = document.getElementById("shop-logo");
  const head = logo?.closest(".sethead");
  if (logo) {
    const src = setIdentity(liveSet).logo;
    if (logo.getAttribute("src") !== src) {
      head?.classList.remove("no-logo");
      logo.src = src;
    }
  }
  // A red tag over the name while a set is new (two months from release) or still to come.
  const tag = document.getElementById("shop-new");
  const at = Date.parse(liveSet.released || "");
  const age = Number.isNaN(at) ? Infinity : Date.now() - at;
  const fresh = age < 60 * 86_400_000;
  if (tag) {
    const day = String(liveSet.released || "").replace(/,/g, "");
    tag.hidden = !fresh;
    tag.textContent = age < 0 ? `Out ${day}` : `New, ${day}`;
  }
  const facts = document.getElementById("shop-facts");
  if (facts) {
    facts.textContent = kit
      ? [liveSet.era || liveSet.edition, "one box, two half decks", `${num(kit.halves.reduce((n, half) => n + half.totalCount, 0))} different cards`, `out ${String(liveSet.released).replace(/ /g, " ")}`].join(", ")
      : shopMetaLine(liveSet, !fresh);
  }
  paintShopProgress();
  const rates = document.getElementById("shop-rates");
  if (rates) {
    rates.innerHTML = liveSet.promoSet ? "" : rateCardHtml(liveSet);
    rates.hidden = !rates.innerHTML;
  }
  // A promo set sells no boosters, only the boxes its promos come in.
  els.packHead?.classList.toggle("hidden", Boolean(liveSet.promoSet));
  const bulkRip = document.getElementById("bulk-rip");
  if (bulkRip) bulkRip.textContent = liveSet.promoSet ? "Shop the promos" : "Rip a pack";
  if (els.binderTitle) els.binderTitle.textContent = liveSet.name;
  if (els.bulkKicker) {
    els.bulkKicker.textContent = `Collection, ${liveSet.edition}, ${month}`;
  }
  document.title = viewTitle();
}

/** ["Mega Evolution, released July 17, 2026", "130 cards, 84 in the main set"] */
function setFactLines(set) {
  const when = [set.era || set.edition, set.released ? `released ${set.released}` : ""].filter(Boolean).join(", ");
  const size = [
    set.totalCount ? `${num(set.totalCount)} cards` : "",
    !set.promoSet && set.printedTotal && set.totalCount > set.printedTotal ? `${num(set.printedTotal)} in the main set` : "",
  ].filter(Boolean).join(", ");
  return [when, size];
}

/** "Mega Evolution, 130 cards, 11 per pack, out July 17, 2026": the line under a set's name. */
function shopMetaLine(set, withDate = true) {
  return [
    set.era || set.edition,
    set.totalCount ? `${num(set.totalCount)} cards` : "",
    !set.promoSet && set.packSize ? `${num(set.packSize)} per pack` : "",
    withDate && set.released ? `out ${String(set.released).replace(/ /g, " ")}` : "", // the date never splits over two lines
  ].filter(Boolean).join(", ");
}

/** The player's progress on the live set: a HUD box with the set's HP bar, the count and what it's worth. */
function paintShopProgress() {
  const box = document.getElementById("shop-progress");
  if (!box) return;
  const signed = Boolean(activeTrainer());
  box.hidden = !signed;
  if (!signed) return;
  const owned = setOwned();
  const total = liveSet.totalCount || setCards.length || 0;
  const share = total ? Math.min(100, (owned / total) * 100) : 0;
  const worth = owned ? binderValue(liveSet).value : 0;
  box.innerHTML = `<div class="sp-l1"><b>In your binder</b><span>${total ? `${Math.floor(share)}%` : ""}</span></div>
    <div class="rt-hp"><em>Found</em><span class="rt-track"><i style="width:${share.toFixed(2)}%"></i></span></div>
    <div class="sp-l3"><span><b>${num(owned)}/${num(total)}</b> cards</span>${
      owned ? `<span>Worth <b class="price">${coinAmount(worth)}</b></span>` : `<span>Nothing pulled yet</span>`
    }</div>`;
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

/** The set's odds rows, "Gold" named as the set's own gold rarity so it gets its printed mark. */
function oddsRows(set) {
  const { rows, notes } = rateRows(set);
  const gold = ["Mega Hyper Rare", "Hyper Rare"].find((word) => setCards.some((card) => card.rarity === word));
  if (gold) rows.forEach((row) => { if (row.word === "Gold") row.word = gold; });
  return { rows, notes };
}

/** The odds table: each rarity's printed mark, its name and "1 in N". */
function oddsTable(rows) {
  return `<ul class="odds-rows">${rows
    .map((row) => `<li><span class="rt-type" data-ty="${rarityType(row.word)}">${esc(row.word)}</span><span class="odds-v">${esc(row.rate)}</span></li>`)
    .join("")}</ul>`;
}

/** A rarity word as a type badge's colour (css/rotom.css .rt-type[data-ty]). */
function rarityType(word) {
  const w = String(word || "").toLowerCase();
  if (/special illustration|special art/.test(w)) return "sir";
  if (/illustration|gallery|character/.test(w)) return "illus";
  if (/hyper|gold/.test(w)) return "hyper";
  if (/secret|rainbow|black white/.test(w)) return "secret";
  if (/promo/.test(w)) return "promo";
  if (/double|ace spec/.test(w)) return "double";
  if (/ultra|full art|vmax|vstar|-gx|-ex|pokémon ex|pokémon v|shiny|futuristic/.test(w)) return "ultra";
  if (/holo|radiant|amazing|classic/.test(w)) return "holo";
  if (/uncommon/.test(w)) return "uncommon";
  if (/common|energy/.test(w)) return "common";
  return "rare";
}

/** The pull rates in a box: one row a rarity, its type badge and "1 in N", then what every pack holds. */
function rateCardHtml(set) {
  const { rows, notes } = oddsRows(set);
  const makeup = packMakeup(set);
  if (!rows.length && !notes.length && !makeup) return "";
  return `<section class="rt-box shop-odds" aria-labelledby="shop-odds-h">
    <div class="odds-head"><h2 id="shop-odds-h">Pull rates</h2>${rows.length ? "<span>per pack</span>" : ""}</div>
    ${rows.length ? oddsTable(rows) : ""}
    ${notes.map((note) => `<p class="odds-note">${esc(note)}</p>`).join("")}
    ${makeup ? `<p class="odds-note"><b>Every pack, ${num(set.packSize)} cards:</b> ${esc(makeup)}.</p>` : ""}
  </section>`;
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
 * The wrapper choice: the set's wrappers side by side, the chosen one lifted
 * with a red edge. A real radio group, so it works from the keyboard. A set
 * with one wrapper shows that pack on its own.
 */
function displayBoxHtml(set) {
  const wraps = set.wrappers || [];
  const chosen = chosenWrapper(set);
  if (!chosen) return "";
  // The chosen pack stands large on its own cyan slab; the wrappers are slanted party slots beside it.
  const stage = `<div class="stage-pack"><span class="stage-slab" aria-hidden="true"></span><span class="stage-img" data-wrap="${esc(chosen.id)}">${packPicture(chosen, "", set)}</span></div>`;
  if (wraps.length < 2) return `<div class="shop-stage is-single">${stage}</div>`;
  return `<div class="shop-stage${wraps.length > 4 ? " is-many" : ""}"><fieldset class="wrappers">
      <legend class="sr-only">Choose a wrapper</legend>
      ${wraps
        .map((wrap) => `<span class="wr">
          <input type="radio" class="dbox-input" name="shop-wrapper" id="shop-wrap-${esc(wrap.id)}" value="${esc(wrap.id)}"${wrap === chosen ? " checked" : ""} />
          <label class="wr-pack" for="shop-wrap-${esc(wrap.id)}"><span class="wr-th">${quietPackPicture(wrap, set)}</span><span class="wr-name">${esc(wrap.name)}</span></label>
        </span>`)
        .join("")}
    </fieldset>${stage}</div>`;
}

/** Roll a figure from one amount to the next (the Rip key's price when the set changes). */
function rollShopFigure(el, from, to) {
  if (!el) return;
  cancelAnimationFrame(Number(el.dataset.raf) || 0);
  if (!fxOk() || !Number.isFinite(from) || from === to) {
    el.textContent = coinText(to);
    return;
  }
  const start = performance.now();
  const dp = Math.round(to * 100) % 100 || Math.round(from * 100) % 100 ? 2 : 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / 460);
    if (t >= 1) {
      el.textContent = coinText(to);
      return;
    }
    const n = from + (to - from) * (1 - (1 - t) ** 3);
    el.textContent = n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    el.dataset.raf = String(requestAnimationFrame(step));
  };
  el.dataset.raf = String(requestAnimationFrame(step));
}

/** The rip button names the chosen wrapper; the box marks it. */
function paintWrapperChoice() {
  const wrap = chosenWrapper();
  const signed = Boolean(activeTrainer());
  const affordable = signed && state.coins >= liveSet.cost;
  const rip = document.getElementById("shop-rip");
  if (rip) {
    // The key says what it does and carries the price, which rolls when the set changes.
    // On a phone the key drops "the" and "pack" (css/pages/packs.css), so a long wrapper name stays on one line.
    const name = wrap?.name || liveSet.name;
    const label = !signed
      ? "Sign in to rip"
      : !affordable
        ? "Need coins"
        : `Rip <span class="rip-x">the </span>${esc(name)}${/(?:pack|pouch)$/i.test(wrap?.name || "") ? "" : `<span class="rip-x"> pack</span>`}`;
    let words = rip.querySelector(".rip-l");
    let fig = rip.querySelector(".rip-n");
    if (!words || !fig) {
      rip.innerHTML = `<span class="rip-l"></span><span class="rip-p price">${COIN_I}<span class="rip-n"></span><span class="sr-only"> coins</span></span>`;
      words = rip.querySelector(".rip-l");
      fig = rip.querySelector(".rip-n");
    }
    words.innerHTML = label;
    const cost = Number(liveSet.cost) || 0;
    const was = rip.dataset.cost ? Number(rip.dataset.cost) : NaN;
    rip.dataset.cost = String(cost);
    rollShopFigure(fig, was, cost);
    rip.disabled = signed && !affordable;
  }
  const input = wrap && document.getElementById(`shop-wrap-${wrap.id}`);
  if (input && !input.checked) input.checked = true;
  // The big pack follows the chosen wrapper, sliding in with a small tilt.
  const big = els.packGrid?.querySelector(".stage-img");
  if (big && wrap && big.dataset.wrap !== wrap.id) {
    big.dataset.wrap = wrap.id;
    big.innerHTML = packPicture(wrap, "", liveSet);
    big.classList.remove("is-swap");
    void big.offsetWidth;
    big.classList.add("is-swap");
  }
  // "Darkrai wrapper. 10 cards and a basic Energy, same odds on every wrapper."
  const same = document.getElementById("shop-same");
  if (same) {
    const n = liveSet.wrappers.length;
    const what = packShort(liveSet);
    same.textContent = [
      wrap?.name ? `${wrap.name} wrapper.` : "",
      what ? `${what}${n > 1 ? `, same odds on ${allOf(n) === "both" ? "both wrappers" : "every wrapper"}` : ""}.` : "",
    ].filter(Boolean).join(" ");
    same.hidden = !same.textContent;
  }
  const price = document.getElementById("shop-pack-price");
  if (price) price.innerHTML = coinAmount(liveSet.cost);
}

function renderShop() {
  renderSetChrome();
  renderSwitcher();
  const quickSets = document.getElementById("shop-quick-sets");
  if (quickSets) {
    quickSets.innerHTML = setTabsHtml();
    centerQuickSet();
  }

  // Keep the box as it is while the same set is on the counter, so a re-render
  // after a rip or a sale doesn't take the focus off the chosen wrapper.
  const boxKey = `${liveSet.id}/${liveSet.wrappers.length}`;
  if (els.packGrid.dataset.box !== boxKey || !els.packGrid.childElementCount) {
    // Another set on the counter: its name, pack, rates and rows arrive anew (css/pages/packs.css .is-newset).
    const shopView = document.getElementById("view-shop");
    if (els.packGrid.dataset.box && view === "shop" && fxOk() && shopView) {
      homeReplay(shopView, "is-newset");
      clearTimeout(renderShop.newsetTimer);
      renderShop.newsetTimer = setTimeout(() => shopView.classList.remove("is-newset"), 900);
    }
    els.packGrid.dataset.box = boxKey;
    els.packGrid.innerHTML = displayBoxHtml(liveSet);
  }
  paintWrapperChoice();
  if (els.shopPackTrend) els.shopPackTrend.innerHTML = trendButton("boosterPack", `${liveSet.name} booster pack`);

  // The chase: the set's most valuable cards, straight on the ground.
  const chase = document.getElementById("shop-chase");
  if (chase) {
    // A set's own page shows what its packs can pull; the stamped promos
    // that only come in its boxes stay on the shelf below.
    const top = topByValue(liveSet.promoSet ? 12 : 6);
    document.getElementById("shop-case")?.classList.toggle("hidden", !top.length);
    const sub = document.getElementById("shop-case-sub");
    if (sub) {
      const have = top.filter((card) => ownedQty(card.id) > 0).length;
      sub.textContent = activeTrainer() ? `${num(have)} of ${num(top.length)} in your binder` : "At market value";
    }
    chase.innerHTML = shopChaseRows(top);
    // A promo set has no pack to stand on the slab: its top promo stands there instead.
    const hero = document.getElementById("shop-hero-card");
    if (hero) {
      const card = liveSet.promoSet ? top[0] : null;
      const box = kitOf(liveSet)?.image;
      hero.hidden = !card && !box;
      hero.classList.toggle("is-box", Boolean(box));
      hero.innerHTML = box || card ? `<span class="stage-slab"></span><img src="${esc(box || card.image || card.imageSmall)}" alt="" decoding="async" />` : "";
    }
  }
  renderSealed();
  renderShopBox();
  renderShopFoot();
  loadShopTrends();
}

/**
 * The set's box promos: the stamped and cosmos prints from its blisters and
 * boxes. They are listed here and in the collection, and never count toward
 * the set.
 */
function renderShopBox() {
  const block = document.getElementById("shop-box");
  if (!block) return;
  const list = boxCards;
  block.classList.toggle("hidden", !list.length);
  if (!list.length) {
    block.innerHTML = "";
    return;
  }
  const have = list.filter((card) => ownedQty(card.id) > 0).length;
  block.innerHTML = `<h2 class="ground-h" id="shop-box-h">Box promos <span>${activeTrainer() ? `${num(have)} of ${num(list.length)} in your binder` : num(list.length)}</span></h2>
    <p class="shop-box-note">Stamped and special prints from this set's boxes and blisters. They're extras: no pack holds them and they don't count toward the set.</p>
    <ul class="box-strip">${list
      .map((card) => {
        const owned = ownedQty(card.id) > 0;
        return `<li><button type="button" class="box-card${owned ? " is-owned" : ""}" ${inspectAttrs(card)} aria-label="${esc(card.name)}, ${esc(numberLine(card))}${owned ? ", in your binder" : ""}">
          <img src="${esc(card.imageSmall || card.image)}" alt="" loading="lazy" decoding="async" />
          <span class="box-card-name">${esc(card.name)}</span>
        </button></li>`;
      })
      .join("")}</ul>`;
}

/** The foot of a set page: the set before and after it among its own kind, and the way back to every pack. */
function renderShopFoot() {
  const foot = document.getElementById("shop-foot");
  if (!foot) return;
  const cat = setCategory(liveSet);
  // Newest first by release date, so the set after this one came out earlier.
  const day = (set) => Date.parse(set.released || "") || 0;
  const kin = foldKits(PLAYABLE_SETS.filter((set) => setCategory(set) === cat)).sort((x, y) => day(y) - day(x));
  const at = kin.indexOf(kitHalves(liveSet)?.[0] || liveSet);
  const step = (set, word) =>
    set
      ? `<a class="shop-step" href="/packs/${esc(set.id)}"><small>${word}</small><b>${esc(kitOf(set)?.name || set.name)}</b></a>`
      : `<span class="shop-step is-none" aria-hidden="true"></span>`;
  foot.innerHTML = `<div class="shop-steps">${step(kin[at + 1], "Older")}${step(kin[at - 1], "Newer")}</div>
    <a class="ghost shop-allpacks" href="/packs">All packs</a>`;
}

/**
 * The set page's chase cards as rows: the number on a slanted ink label, the
 * card, its name and rarity, its value. A tap opens the inspector.
 */
function shopChaseRows(list) {
  const twice = new Set(list.map((card) => card.name).filter((name, i, all) => all.indexOf(name) !== i));
  return list
    .map((card, i) => {
      const owned = ownedQty(card.id) > 0;
      const name = twice.has(card.name) ? `${card.name}, ${printWord(card)}` : card.name;
      return `<li style="--i:${i}"><button type="button" class="rt-row chase-row" ${inspectAttrs(card)} aria-label="${esc(name)}, ${esc(rarityLine(card))}${owned ? ", in your binder" : ""}">
        <span class="rt-row-lab">${esc(numberLine(card))}</span>
        <img class="chase-th" src="${esc(card.imageSmall || card.image)}" alt="" loading="lazy" decoding="async" />
        <span class="rt-row-name">${esc(name)}<small>${esc(RARITY_LABEL[card.rarity] || card.rarity || "")}${owned ? ` <em class="chase-own">In binder</em>` : ""}</small></span>
        <span class="rt-row-val price">${coinAmount(sellValue(card))}</span>
      </button></li>`;
    })
    .join("");
}

/** The sets that share the live set's era, booster sets first and then the extras: what the set tabs offer. */
function eraSiblings() {
  const era = liveSet.era || liveSet.edition;
  const sets = PLAYABLE_SETS.filter((set) => (set.era || set.edition) === era);
  // A Trainer Kit is one tab: the half that is open, else its first.
  const shown = sets.filter((set) => {
    const halves = kitHalves(set);
    return !halves || (halves.includes(liveSet) ? set === liveSet : set === halves[0]);
  });
  return [...shown.filter(isBoosterSet), ...shown.filter((set) => !isBoosterSet(set))];
}

/** The box a Trainer Kit half belongs to: its two halves, the name on the box and the box photo (data/products.json); null for any other set. */
function kitOf(set) {
  const halves = kitHalves(set);
  if (!halves) return null;
  const product = halves.map((half) => (productList[half.id] || [])[0]).find(Boolean);
  return { halves, name: product?.name || kitName(set), image: product?.image || "" };
}

/** The live set's era as tabs, each with its wrapper (or its symbol) beside the name: the set page's and the collection's. Every other era is one tap away on the Packs page. */
function setTabsHtml() {
  return eraSiblings().map((set) => {
    const on = set.id === liveSet.id;
    const wrap = set.wrappers?.[0];
    const thumb = wrap
      ? quietPackPicture(wrap, set, true)
      : `<img class="qs-symbol" src="${esc(setIdentity(set).symbol)}" alt="" loading="lazy" decoding="async" />`;
    return `<button type="button" class="st${on ? " active" : ""}"
      data-quick-set="${esc(set.id)}" aria-pressed="${on}"><span class="st-th${wrap ? "" : " is-symbol"}">${thumb}</span>${esc(kitOf(set)?.name || set.name)}</button>`;
  }).join("");
}

/**
 * The set tabs scroll sideways and hold more sets than fit on a phone, so
 * the chosen one is brought to the middle of the row. Nothing to measure
 * while the page is hidden; setView calls this again when it shows.
 */
function centerQuickSet(id = "shop-quick-sets") {
  const row = document.getElementById(id);
  const on = row?.querySelector(".st.active");
  if (!on || !row.clientWidth) return;
  // Centre it in the part of the row that shows: a pinned (sticky) All packs link at the
  // front covers the left of the row, and offsetLeft can be measured from another parent.
  const first = row.firstElementChild;
  const pin = first && first !== on && getComputedStyle(first).position === "sticky" ? first.getBoundingClientRect().width : 0;
  const box = row.getBoundingClientRect();
  const at = on.getBoundingClientRect().left - box.left + row.scrollLeft;
  const room = row.clientWidth - pin;
  row.scrollLeft = Math.max(0, at - pin - Math.max(0, (room - on.offsetWidth) / 2));
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
        ? `Confirm <span class="confirm-price">${coinAmount(offer.price)}</span>`
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

/** Set ids whose sealed shelf the player opened with "Show all" this visit. */
const sealedShownAll = new Set();

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
  // A set's own shelf shows its first few products; the rest wait behind one button.
  // Once opened it stays open for this set, so a buy or add-to-cart re-render
  // (which redraws the grid) doesn't fold it shut under the player's thumb.
  const SHOWN = 5;
  if (!grouped && offers.length > SHOWN + 1 && !sealedShownAll.has(liveSet.id)) {
    els.promoGrid.querySelectorAll(":scope > .promo-product").forEach((el, i) => el.classList.toggle("is-more", i >= SHOWN));
    els.promoGrid.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="ghost show-all-sealed" data-show-all-sealed>Show all ${offers.length} sealed products</button>`
    );
  }
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
    // The promos filed under this set sit in other sets' data: fetch those once, then list them.
    if (prefix && !everySetLoaded) loadEverySet();
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
        setCache[source.id] = await fetchSetFile(source.dataFile);
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
  boxCards = boxPromoCards(next, dataSetsOf(next).map((source) => setCache[source.id]));
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
/** One entry of ownedMapNow() without copying the whole collection: raw plus graded copies, folded onto the dex id. */
function ownedNow(cardId) {
  const id = String(cardId || "");
  if (!id || dexId(id) !== id) return 0;
  let n = 0;
  for (const each of dexIds(id)) {
    const v = (state.collection?.[each] || 0) + gradedSlabs(each).length;
    if (v > 0) n += v;
  }
  return n;
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
  // Booster sets first, then the era's extras under their own small label.
  const shelf = active?.sets || [];
  const ordered = [...shelf.filter((set) => !isExtraSet(set)), ...shelf.filter(isExtraSet)];
  const firstExtra = ordered.find(isExtraSet);
  const setBtns = ordered
    .map((set) => {
      const label = set === firstExtra && set !== ordered[0] ? `<p class="bulk-shelf-label">Extras <small>no mastery</small></p>` : "";
      const live = Boolean(set.live && hasCardData(set));
      if (!live) {
        return `${label}<button type="button" class="bulk-set is-queued" data-soon="${esc(set.name)}"
          title="${esc(set.name)} is queued (${esc(shortReleased(set))})"><span class="bulk-set-name">${esc(set.name)}</span> <span class="bulk-set-count">queued</span></button>`;
      }
      const on = set.id === liveSet.id;
      const owned = ownedInSet(set);
      const count = signed ? ` <span class="bulk-set-count">${num(owned)}/${num(set.totalCount)}</span>` : "";
      return `${label}<button type="button" class="bulk-set${on ? " active" : ""}" data-set="${esc(set.id)}"
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
  // Read every rect before drawing any face: a draw between two reads forces a fresh layout per holder.
  const nearNow = Array.prototype.filter.call(holders, (holder) => {
    const rect = holder.getBoundingClientRect();
    return rect.height && rect.bottom > box.top - reach && rect.top < box.bottom + reach;
  });
  nearNow.forEach((holder) => draw(holder, true));
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => draw(entry.target, entry.isIntersecting)),
    { root, rootMargin: `${FACE_REACH * 100}% 0px` }
  );
  holders.forEach((holder) => observer.observe(holder));
  faceWindows.set(key, observer);
}

/** The card an inspector link jumped to; the grid is rebuilt when prices land, so it carries the mark. */
let foundCardId = "";

/**
 * The number a slot shows: the printed number without its padding zeros or
 * the set total ("034/132" is 34), a stamped print's base number ("10-ebgames"
 * is 10), a promo's own digits ("mep001" is 1). Printed codes stay (TG01, SWSH001).
 */
function slotNumber(card) {
  if (card.energy || card.number === "—") return "Energy";
  const n = String(card.printedNumber || card.number).split("/")[0].replace(/-.*$/, "");
  if (/^[a-z]+\d+$/.test(n)) return String(Number(n.replace(/^[a-z]+/, "")));
  return n.replace(/^0+(?=\d)/, "") || String(card.number);
}

/* ---- Collection motion: figures roll, the bar refills and the first screen of
   slots rises when the set changes (css/pages/collection.css). Nothing runs on
   scroll, and nothing moves under reduced motion or body.no-motion. */
let collShownSet = "";
let collShownOwned = ""; // the show word last drawn: a new choice grows its plate
let collRise = false; // set by a filter or set change: the next grid paint staggers its first slots
const collMotionOff = () => reduceMotion() || document.body.classList.contains("no-motion");

/** Roll the figures in an element from what it showed to `text` (numbers only; anything else just swaps). */
function rollCollFigure(el, text) {
  if (!el) return;
  const from = el.dataset.rollTo;
  el.dataset.rollTo = text;
  const nums = (t) => (String(t).match(/[\d,.]+/g) || []).map((n) => Number(n.replace(/,/g, "")));
  const a = nums(from ?? "");
  const b = nums(text);
  if (from == null || collMotionOff() || a.length !== b.length || !b.length || from === text || view !== "collection") {
    el.textContent = text;
    return;
  }
  const t0 = performance.now();
  const dur = 520;
  const tick = (now) => {
    if (el.dataset.rollTo !== text) return;
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    let i = 0;
    el.textContent = String(text).replace(/[\d,.]+/g, (m) => {
      const to = b[i];
      const fr = a[i++];
      const dp = (m.split(".")[1] || "").length;
      const v = fr + (to - fr) * e;
      return dp ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : Math.round(v).toLocaleString();
    });
    if (k < 1) requestAnimationFrame(tick);
    else el.textContent = text;
  };
  requestAnimationFrame(tick);
}

/** One slanted word with its count (the show filter). */
const collWord = (attr, value, label, count, on) =>
  `<button type="button" class="rt-word coll-word" ${attr}="${value}" aria-pressed="${on}" aria-label="${label}, ${num(count)}"><span>${label}</span><small>${num(count)}</small></button>`;

function renderCollection({ refreshSets = true } = {}) {
  if (els.collectionTabs) els.collectionTabs.innerHTML = vaultPage.tabsHtml("cards"); // Cards | Sealed | Binder
  const signed = Boolean(activeTrainer());
  const q = (els.search?.value || "").trim().toLowerCase();
  const counts = groupCounts();
  const total = counts.all.total || liveSet.totalCount || 0;
  const owned = counts.all.have;
  const purse = binderValue(liveSet);
  const spares = spareCopies();
  const sortBy = state.settings.collSort === "value" ? "value" : "number";
  const setChanged = collShownSet !== liveSet.id;
  const firstPaint = !collShownSet;
  collShownSet = liveSet.id;
  if (setChanged) collRise = true;

  const picker = document.getElementById("coll-picker");
  if (refreshSets) {
    // The quick row (every set with its wrapper) lives in the set picker; it is only drawn while that is open.
    const row = document.getElementById("coll-quick-sets");
    if (row && picker && !picker.hidden) {
      row.innerHTML = setTabsHtml();
      centerQuickSet("coll-quick-sets");
    }
    if (els.bulkSets && !els.bulkSets.hidden) renderBulkSets();
  }

  // The HUD box: the set's name (the picker), which set of how many, the Found
  // bar, the count and what the set's cards are worth, and the spares sale.
  if (els.binderTitle && els.binderTitle.textContent !== liveSet.name) els.binderTitle.textContent = liveSet.name;
  const at = PLAYABLE_SETS.findIndex((set) => set.id === liveSet.id);
  const setNo = document.getElementById("coll-setno");
  if (setNo) {
    const prev = PLAYABLE_SETS[at - 1];
    const next = PLAYABLE_SETS[at + 1];
    const step = (set, dir, label) =>
      `<button type="button" class="coll-step" ${set ? `data-quick-set="${esc(set.id)}" aria-label="${label}: ${esc(set.name)}"` : `disabled aria-label="${label}"`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"}" /></svg></button>`;
    setNo.innerHTML = at < 0
      ? ""
      : `${step(prev, -1, "Previous set")}<span>Set ${num(at + 1)} of ${num(PLAYABLE_SETS.length)}</span>${step(next, 1, "Next set")}`;
  }
  const sortLabel = document.getElementById("coll-sort-label");
  if (sortLabel) sortLabel.textContent = sortBy === "value" ? "By value" : "By number";
  document.getElementById("coll-sort")?.setAttribute(
    "aria-label",
    `Sorted by ${sortBy}. Sort by ${sortBy === "value" ? "number" : "value"} instead.`
  );
  if (els.bulkPulse) {
    const share = total ? Math.min(100, (owned / total) * 100) : 0;
    const bar = els.bulkPulse.querySelector(".coll-hp .rt-track");
    if (signed && bar && !setChanged) {
      // Same set: move the fill, so a pull or a sale slides the bar instead of redrawing it.
      bar.setAttribute("aria-valuenow", String(owned));
      bar.setAttribute("aria-valuemax", String(total));
      bar.firstElementChild.style.setProperty("--fill", (share / 100).toFixed(4)); // scaleX, so the slide is a transform
    } else {
      els.bulkPulse.innerHTML = signed
        ? `<div class="rt-hp coll-hp"><em>Found</em><div class="rt-track" role="progressbar"
            aria-label="${esc(liveSet.name)} found" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${owned}"><i style="--fill:${(share / 100).toFixed(4)}"></i></div></div>`
        : accountGateHtml("bulk");
    }
  }
  const worth = document.getElementById("coll-worth");
  if (worth) {
    worth.hidden = !signed;
    const countEl = document.getElementById("coll-count");
    if (countEl && signed) {
      if (!countEl.firstElementChild) countEl.innerHTML = `<b class="num"></b> cards`;
      rollCollFigure(countEl.firstElementChild, `${num(owned)}/${num(total)}`);
      // An extra (a promo binder, a Happy Meal year, a kit) has no mastery: a full one is stamped Complete instead.
      const complete = !isBoosterSet(liveSet) && total > 0 && owned >= total;
      let stamp = countEl.querySelector(".coll-stamp");
      if (complete && !stamp) {
        stamp = document.createElement("span");
        stamp.className = "coll-stamp";
        stamp.textContent = "Complete";
        countEl.append(" ", stamp);
      } else if (!complete && stamp) stamp.remove();
    }
    const figure = document.getElementById("coll-worth-v");
    if (figure) {
      if (!figure.querySelector(".coll-v")) figure.innerHTML = `${COIN_I}<span class="coll-v"></span><span class="sr-only"> coins</span>`;
      rollCollFigure(figure.querySelector(".coll-v"), coin(purse.value));
    }
  }
  if (els.sellDuplicates) {
    els.sellDuplicates.hidden = !signed || spares < 1;
    els.sellDuplicates.disabled = !signed || spares < 1;
    els.sellDuplicates.textContent = `Sell ${num(spares)} duplicate${spares === 1 ? "" : "s"}`;
  }
  document.getElementById("coll-hud-foot")?.toggleAttribute("hidden", !signed || spares < 1);

  paintRarityGroups(counts);
  fillRarityFilter();

  const ofSet = new Set(setCards);
  // Everything but the show filter, so the show words can say how many each would show.
  const base = (rarityGroup === "box" ? boxCards : cards).filter((card) => {
    const count = ownedQty(card.id);
    if (rarityGroup !== "all" && rarityGroupOf(card) !== rarityGroup) return false;
    if (rarityMode !== "all" && card.rarity !== rarityMode) return false;
    // A plain basic Energy (not one of the set's own cards) shows only once it's pulled.
    if (card.energy && !card.reverse && count < 1 && !ofSet.has(card)) return false;
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
  const showCounts = { all: base.length, owned: 0, missing: 0, dupes: 0, wish: 0 };
  for (const card of base) {
    if (wishlist.has(card.id)) showCounts.wish += 1;
    if (ownedQty(card.id) > 0) showCounts.owned += 1;
    else showCounts.missing += 1;
    if (rawQty(card.id) > 1) showCounts.dupes += 1;
  }
  if (els.ownedFilter) {
    if (!signed && ownedMode !== "all") ownedMode = "all";
    els.ownedFilter.hidden = !signed;
    els.ownedFilter.innerHTML = [
      ["all", "All"],
      ["owned", "Owned"],
      ["missing", "Missing"],
      ["dupes", "Spares"],
      ["wish", "Wishlist"],
    ]
      .filter(([key]) => (key !== "dupes" && key !== "wish") || showCounts[key] > 0 || ownedMode === key)
      .map(([key, label]) => collWord("data-owned", key, label, showCounts[key], ownedMode === key))
      .join("");
    if (collShownOwned && collShownOwned !== ownedMode) els.ownedFilter.querySelector('[aria-pressed="true"]')?.classList.add("is-pick");
    collShownOwned = ownedMode;
  }

  const list = base.filter((card) => {
    const count = ownedQty(card.id);
    if (ownedMode === "owned" && count < 1) return false;
    if (ownedMode === "missing" && count > 0) return false;
    if (ownedMode === "dupes" && rawQty(card.id) < 2) return false;
    if (ownedMode === "wish" && !wishlist.has(card.id)) return false;
    return true;
  });
  if (sortBy === "value") {
    const worthOf = new Map(list.map((card) => [card.id, sellValue(card)]));
    list.sort((a, b) => worthOf.get(b.id) - worthOf.get(a.id));
  }

  if (els.binderNote) {
    const shown = list.length;
    const filtered = ownedMode !== "all" || rarityGroup !== "all" || rarityMode !== "all" || q;
    // Box promos are not part of the set's count, so their note says where they come from instead.
    els.binderNote.textContent =
      rarityGroup === "box"
        ? `${num(shown)} box promo${shown === 1 ? "" : "s"}. They come in ${liveSet.name} boxes and blisters, and don't count toward the set.`
        : `${num(shown)} card${shown === 1 ? "" : "s"}${filtered ? `, filtered from ${num(total)} in the set` : ""}`;
  }

  // A set change cross-fades the grid; a set or filter change lifts the first screen of slots.
  const grid = els.dexGrid;
  const rise = collRise && !firstPaint && !collMotionOff();
  collRise = false;
  grid.classList.remove("coll-swap", "coll-rise");
  if (rise) {
    void grid.offsetWidth; // restart the animation
    grid.classList.add("coll-rise");
    if (setChanged) {
      grid.classList.add("coll-swap");
      const hp = els.bulkPulse?.querySelector(".rt-track > i");
      hp?.classList.add("coll-fill");
    }
    clearTimeout(renderCollection.riseTimer);
    renderCollection.riseTimer = setTimeout(() => grid.classList.remove("coll-swap", "coll-rise"), 900);
  }

  if (!list.length) {
    windowFaces("collection", [], [], tcgFace);
    const why = q
      ? `Nothing in ${esc(liveSet.name)} matches “${esc(q)}”.`
      : ownedMode === "owned"
        ? "You haven't pulled any of these yet."
        : ownedMode === "missing"
          ? "You have every one of these. Nice."
          : ownedMode === "dupes"
            ? "No spares here."
            : ownedMode === "wish"
              ? "Nothing from this set is on your wishlist."
            : "No cards match.";
    grid.innerHTML = `<div class="bulk-empty rt-empty">
      <i class="coll-ball" aria-hidden="true"></i>
      <p>${why}</p>
      <p class="bulk-empty-sub">Try another filter, or rip a pack.</p>
    </div>`;
    return;
  }

  // A card you have shows in its slot; one you don't is a dashed empty place
  // with a hollow ball and its name. Under each: the number, then the value or "Missing".
  const faces = list.map((card) => (ownedQty(card.id) < 1 ? card : ownedFace(card)));
  grid.innerHTML = list
    .map((card, i) => {
      const raw = rawQty(card.id);
      const slabs = slabsOf(card.id);
      const count = raw + slabs.length;
      const missing = count < 1;
      const no = slotNumber(card);
      const said = missing ? "not pulled yet" : `${count} owned`;
      const art = missing
        ? `<button type="button" class="slot-ghost rt-empty" ${inspectAttrs(card)} aria-label="${esc(card.name)}, ${said}"><i class="coll-ball" aria-hidden="true"></i><span>${esc(card.name)}</span></button>`
        : `<button type="button" class="slot-face" data-face="${i}" ${inspectAttrs(faces[i])} aria-label="${esc(card.name)}, ${said}"></button>${gradeBadge(slabs)}${
            raw > 1 ? `<span class="slot-qty" title="${raw} copies">×${raw}</span>` : ""
          }`;
      const value = missing
        ? `<span class="slot-vl is-miss">Missing</span>`
        : `<span class="slot-vl">${coin(sellValue(card))}<span class="sr-only"> coins</span></span>`;
      // The heart sits on every card you're still missing, and on any card already hearted.
      const wish = missing || wishlist.has(card.id) ? wishlist.heart(card.id, card.name, { cls: "slot-wish" }) : "";
      return `<article class="cslot bulk-card${missing ? " missing" : ""}${card.id === foundCardId ? " is-found" : ""}"${i < 12 ? ` style="--i:${i}"` : ""}>
        <div class="slot-art">${art}${wish}</div>
        <p class="slot-meta"><span class="slot-no">${esc(no)}<span class="slot-mark" title="${esc(rarityLine(card))}">${rarityIcons(card.printedRarity || card.rarity)}</span></span>${value}</p>
      </article>`;
    })
    .join("");
  windowFaces("collection", grid.querySelectorAll("[data-face]"), faces, (face) =>
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
function catalogSlot(set, { live = false, owned = null, total: size = null } = {}) {
  const { symbol, logo } = setIdentity(set);
  const wrap = set.wrappers?.[0];
  const kit = kitOf(set);
  const name = kit?.name || set.name;
  const when = shortReleased(set);
  const price = live && set.cost ? coin(set.cost) : "";
  const pack = wrap
    ? `<span class="cat-art">${quietPackPicture(wrap, set, true)}</span>`
    : kit?.image
      ? `<span class="cat-art is-box"><img src="${esc(kit.image)}" alt="" loading="lazy" decoding="async" /></span>`
    : `<span class="cat-art is-logo"><img src="${esc(logo)}" alt="" loading="lazy" decoding="async" /></span>`;
  // Signed in: the set's HP bar, cards found of its total.
  const total = size ?? (Number(set.totalCount) || 0);
  const have = live && owned != null && total ? Math.min(owned, total) : null;
  const hp = have != null
    ? `<span class="cat-hp"><span class="rt-track"><i style="width:${((have / total) * 100).toFixed(2)}%"></i></span><small>${num(have)}/${num(total)}</small></span>`
    : "";
  const label = `<span class="cat-copy">
      <span class="cat-name">${esc(name)}</span>
      <span class="cat-meta"><img class="cat-sym" src="${esc(symbol)}" alt="" width="28" height="14" loading="lazy" decoding="async" /><span>${live ? esc(when) : `Coming ${esc(when)}`}</span>${price ? `<span class="cat-price price">${COIN_I}${price}</span>` : ""}</span>
      ${hp}
    </span>`;
  const said = `${esc(name)}, ${esc(when)}${price ? `, ${price} coins a pack` : ""}${have != null ? `, ${num(have)} of ${num(total)} found` : ""}`;
  return live
    ? `<a class="cat-tile" href="/packs/${esc(set.id)}" aria-label="${said}">${pack}${label}</a>`
    : `<div class="cat-tile is-soon" role="group" aria-label="${esc(set.name)}, coming ${esc(when)}">${pack}${label}</div>`;
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

let binderSpread = 0;   // index of the first page on screen (one page on a phone, a facing pair from 860px)
let binderTurn = 0;     // the next draw turns the pages: 1 forward, -1 back (css/binder/flipbook.css)
let binderOpen = false; // the binder starts closed, showing its cover; opening is kept for the visit
try { binderOpen = sessionStorage.getItem("pp-binder-open") === "1"; } catch { /* closed */ }
let binderArranging = false; // Arrange: the one place cards are moved, taken out and put in
let binderHolding = null;    // slot picked up in Arrange, waiting for the pocket it goes to
const binderWide = () => matchMedia("(min-width: 860px)").matches;
/** The first page of the view that holds page `p`. */
function binderViewOf(p, pages = binderPageCount()) {
  if (!binderWide()) return Math.max(0, Math.min(p, pages - 1));
  return Math.max(0, Math.min(p - (p % 2), pages - 2));
}
/** Turn to a page (its view), or to the cover with -1. */
function binderGo(target) {
  const before = binderOpen ? binderSpread : -1;
  const to = target < 0 ? -1 : binderViewOf(target);
  if (to === before) return;
  binderTurn = to > before ? 1 : -1;
  binderOpen = to >= 0;
  if (binderOpen) binderSpread = to;
  binderHolding = null;
  try { sessionStorage.setItem("pp-binder-open", binderOpen ? "1" : "0"); } catch { /* not kept */ }
  renderBinder();
  // Opening on a phone: bring the page up under the header so all nine pockets and the keys fit.
  if (before < 0 && binderOpen && !binderWide()) {
    requestAnimationFrame(() =>
      els.binderBody?.querySelector(".binder-object")?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" })
    );
  }
}
let binderMark = null;  // { i, kind: "in" | "out" }: the pocket a card just went into or came out of
let binderPicking = null; // slot index awaiting a card, or null

function binderPageCount() {
  return Math.max(2, Math.ceil((state.binder?.length || 0) / BINDER_PAGE));
}

function binderPocket(index) {
  const slot = state.binder?.[index] || null;
  if (!slot) {
    return `<button type="button" class="pocket empty" data-pocket="${index}"
      aria-label="Empty pocket ${index + 1}"><i class="pocket-ball" aria-hidden="true"></i></button>`;
  }
  const base = findCard(slot.id);
  if (!base) {
    return `<button type="button" class="pocket empty" data-pocket="${index}"
      aria-label="Empty pocket ${index + 1}"><i class="pocket-ball" aria-hidden="true"></i></button>`;
  }
  const card = slot.reverse ? { ...base, reverse: true } : base;
  return `<div class="pocket filled${binderHolding === index ? " is-held" : ""}" style="--i:${index % BINDER_PAGE}">
    <button type="button" class="pocket-card" data-slot="${index}" ${inspectAttrs(card)} title="${esc(card.name)}">
      ${tcgFace(card, { small: true, stamp: false })}
    </button><i class="pocket-sheen" aria-hidden="true"></i>
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
      ${shared ? `<em class="bd-onprofile">On your profile</em>` : ""}
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

/**
 * Swing the pages that were showing over (or under) the ones just drawn. One
 * page on a phone turns on its ring edge; a facing pair turns across the spine
 * in two halves. The old pages ride along as inert ghosts and are dropped when
 * the turn ends. Transform and opacity only (css/binder/flipbook.css).
 */
let binderTurnTimer = 0;
function stageBinderTurn(spread, leaving, turn) {
  if (!spread) return;
  const fresh = [...spread.querySelectorAll(":scope > .binder-page")];
  const lit = () => fresh.forEach((el) => el.classList.add("bd-lit"));
  clearTimeout(binderTurnTimer);
  if (!leaving.length) { lit(); return; }
  const ghost = (el, cls) => {
    el.className += ` bd-ghost ${cls}`;
    if (el._bd) Object.assign(el.style, { left: `${el._bd.l}px`, top: `${el._bd.t}px`, width: `${el._bd.w}px`, height: `${el._bd.h}px` });
    el.inert = true;
    el.setAttribute("aria-hidden", "true");
    el.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    spread.append(el);
  };
  if (document.body.classList.contains("no-motion")) {
    leaving.forEach((el) => ghost(el, "bd-fade-out")); // no swing: the old page fades off the new one
  } else if (leaving.length === 1 && fresh.length === 1) {
    if (turn > 0) ghost(leaving[0], "bd-leaf-out");
    else { ghost(leaving[0], "bd-under"); fresh[0].classList.add("bd-leaf-in"); }
  } else if (leaving.length === 2 && fresh.length === 2) {
    if (turn > 0) {
      ghost(leaving[0], "bd-under bd-g-l");
      ghost(leaving[1], "bd-g-r bd-half-out-l");
      fresh[0].classList.add("bd-half-in-r");
    } else {
      ghost(leaving[1], "bd-under bd-g-r");
      ghost(leaving[0], "bd-g-l bd-half-out-r");
      fresh[1].classList.add("bd-half-in-l");
    }
  } else {
    fresh.forEach((el) => el.classList.add("bd-enter")); // cover to a facing pair and back: the sizes differ
  }
  lit();
  binderTurnTimer = setTimeout(() => {
    spread.querySelectorAll(".bd-ghost").forEach((el) => el.remove());
    fresh.forEach((el) => el.classList.remove("bd-leaf-in", "bd-half-in-r", "bd-half-in-l", "bd-enter"));
  }, 900);
}

function renderBinder() {
  if (!els.binderBody) return;
  const binderTabs = document.getElementById("binder-tabs");
  if (binderTabs) binderTabs.innerHTML = vaultPage.tabsHtml("binder"); // Cards | Sealed | Binder
  if (!activeTrainer()) {
    if (els.binderCount) els.binderCount.textContent = "Sign in to keep a binder";
    els.binderBody.innerHTML = accountGateHtml("binder");
    if (els.binderCustomise) els.binderCustomise.hidden = true;
    const key = document.getElementById("binder-arrange");
    if (key) key.hidden = true;
    binderArranging = false;
    els.viewBinder?.classList.remove("is-arranging");
    binderEditor?.close();
    return;
  }
  if (els.binderCustomise) els.binderCustomise.hidden = false;
  if (reconcileBinder(state)) saveState(state);
  loadBinderSets();

  const pages = binderPageCount();
  const wide = binderWide();
  if (binderArranging || binderPicking != null) binderOpen = true;
  binderSpread = binderViewOf(binderSpread, pages);
  const closed = !binderOpen;
  const left = binderSpread;
  const right = wide ? binderSpread + 1 : -1;
  const shown = (state.binder || []).filter(Boolean).length;
  const worth = money(
    (state.binder || []).reduce((sum, slot) => {
      const card = slot && findCard(slot.id);
      return card ? sum + sellValue(card) : sum;
    }, 0)
  );
  const lookName = binderLookNow().name || "";
  const nameEl = document.getElementById("binder-name");
  if (nameEl) nameEl.textContent = lookName || "Binder";
  if (els.binderCount) {
    els.binderCount.innerHTML = shown
      ? `<b>${num(shown)}</b> card${shown === 1 ? "" : "s"} on show, worth <b class="binder-worth">${coinAmount(worth)}</b>`
      : "Tap an empty pocket to put a card on show.";
  }
  els.viewBinder?.classList.toggle("is-arranging", binderArranging);
  const arrangeKey = document.getElementById("binder-arrange");
  if (arrangeKey) {
    arrangeKey.hidden = false;
    arrangeKey.textContent = binderArranging ? "Done" : "Arrange";
    arrangeKey.setAttribute("aria-pressed", String(binderArranging));
    arrangeKey.classList.toggle("solid", binderArranging);
    arrangeKey.classList.toggle("ghost", !binderArranging);
  }

  const typing = binderPicking == null ? null : cardPicker.typing(els.binderBody); // a redraw must not drop a search being typed
  const options = binderPicking == null ? [] : binderCandidates();
  const onProfile = (activeTrainer()?.binderPages || []).length;
  const room = roomLine("pages", activeTrainer() ? unlockOf(activeTrainer()) : undefined, onProfile, PROFILE_PAGE_LIMIT);
  // Under the binder: Back, a pip for the cover and a Poke Ball pip for every page
  // (an empty page is a hollow pip), Next. A pip turns straight to its page.
  const pageHasCards = (p) => (state.binder || []).slice(p * BINDER_PAGE, (p + 1) * BINDER_PAGE).some(Boolean);
  const onScreen = (p) => !closed && (p === left || p === right);
  const pips = pages <= 12
    ? `<button type="button" class="bd-pip" data-goto="-1" aria-label="Cover"${closed ? ' aria-current="true"' : ""}><i class="bd-cover-pip"></i></button>` +
      Array.from({ length: pages }, (_, p) =>
        `<button type="button" class="bd-pip" data-goto="${p}" aria-label="Page ${p + 1}${pageHasCards(p) ? "" : ", empty"}"${onScreen(p) ? ' aria-current="true"' : ""}><i class="rt-ball${pageHasCards(p) ? "" : " e"}${onScreen(p) ? " now" : ""}"></i></button>`
      ).join("")
    : `<p class="bd-where"><b>${closed ? "Cover" : right >= 0 && right < pages ? `Pages ${left + 1} and ${right + 1}` : `Page ${left + 1}`}</b> of ${pages}</p>`;
  const atEnd = !closed && (wide ? left >= pages - 2 : left >= pages - 1);
  const hint = binderArranging
    ? binderHolding != null
      ? "Now tap the pocket it should go in."
      : "Tap a card to pick it up, × to take it out, an empty pocket to add one."
    : closed
      ? "Tap the cover to open your binder."
      : wide ? "Use the keys to turn the page. Click a card to look closer." : "Swipe to turn the page. Tap a card to look closer.";
  const trainerName = activeTrainer()?.name || "";
  const front = `<button type="button" class="binder-page binder-front" data-goto="0" aria-label="Open your binder">
      <span class="bf-size" aria-hidden="true"><span class="binder-page-toolbar"><span>&nbsp;</span></span><span class="binder-pockets">${'<i class="pocket"></i>'.repeat(BINDER_PAGE)}</span></span>
      <span class="bf-band" aria-hidden="true"></span>
      <span class="bf-plate"><em>Binder</em><b>${esc(lookName || trainerName || "My binder")}</b></span>
      <span class="bf-stats"><span><b>${num(shown)}</b> card${shown === 1 ? "" : "s"} on show</span><span><b>${coinAmount(worth)}</b> worth</span><span><b>${num(pages)}</b> pages</span></span>
      <span class="bf-open">Tap to open</span>
    </button>`;
  // A turn keeps the pages that were showing, to swing them over the new ones (stageBinderTurn).
  const turn = binderTurn;
  const mark = binderMark;
  binderTurn = 0;
  binderMark = null;
  const leaving = turn && !reduceMotion() ? [...els.binderBody.querySelectorAll(".binder-spread > .binder-page:not(.bd-ghost)")] : [];
  for (const el of leaving) el._bd = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  els.binderBody.innerHTML = `
    <p class="binder-sharing-note bd-edit-only">${onProfile} of ${room.cap} pages on your profile.${room.more}</p>
    ${binderObjectHtml({
      innerHtml: `<div class="binder-spread${closed ? " is-closed" : ""}">
        ${closed ? front : binderPageHtml(left)}
        ${!closed && right >= 0 && right < pages ? binderPageHtml(right) : ""}
      </div>`,
      resolved: binderResolved(binderLookNow(), binderCardsOf()),
    })}
    <div class="binder-nav">
      <button type="button" class="ghost sm" data-flip="-1" ${closed || (binderArranging && left === 0) ? "disabled" : ""}>Back</button>
      <div class="bd-pips">${pips}</div>
      <button type="button" class="ghost sm" data-flip="1" ${atEnd ? "disabled" : ""}>Next</button>
    </div>
    <p class="bd-hint">${hint}</p>
    ${binderPickerHtml(options)}`;
  els.binderBody.querySelector(".binder-object")?.classList.toggle("is-closed", closed);
  if (wide && !closed) els.binderBody.querySelector(".binder-spread > .binder-page")?.classList.add("bd-left"); // its ring edge is on the right
  if (turn) {
    stageBinderTurn(els.binderBody.querySelector(".binder-spread"), leaving, turn);
    els.binderBody.querySelector(".bd-pips")?.classList.add("is-turned");
  }
  if (mark) {
    const at = els.binderBody.querySelector(mark.kind === "in" ? `[data-unpocket="${mark.i}"]` : `[data-pocket="${mark.i}"]`);
    (mark.kind === "in" ? at?.closest(".pocket") : at)?.classList.add(mark.kind === "in" ? "is-placed" : "is-cleared");
  }
  if (binderPicking != null) {
    cardPicker.mount(els.binderBody);
    cardPicker.restoreTyping(els.binderBody, typing);
  }
  binderEditor?.refresh();
  if (binderLookNow().color === COLOR_FROM_CARDS || binderEditor?.isOpen()) refineArt(binderCardsOf(), paintBinderLook);
}

/** The category the Packs page is showing (SET_CATEGORIES in js/catalog.js). */
let catalogCat = "booster";
/** What one entry of a category is called in an era's count: "10 sets", "1 binder". */
const CATEGORY_NOUN = { booster: ["set", "sets"], japanese: ["set", "sets"], promos: ["binder", "binders"], special: ["pack", "packs"], decks: ["box", "boxes"] };

/**
 * The Packs page: the set on the counter to jump back into, the four
 * categories as word tabs (Sets, Promos, Special packs, Decks and kits), the
 * eras of the chosen one as a jump row, then each era's tiles.
 */
function renderCatalog() {
  const cats = SET_CATEGORIES.map((cat) => ({ ...cat, sets: foldKits(PLAYABLE_SETS.filter((set) => setCategory(set) === cat.id)) }));
  const cat = cats.find((entry) => entry.id === catalogCat) || cats[0];
  const [one, many] = CATEGORY_NOUN[cat.id] || CATEGORY_NOUN.booster;
  const eras = erasWithSets()
    .map((block) => ({
      ...block,
      live: foldKits(block.live.filter((set) => setCategory(set) === cat.id)),
      queued: cat.id === "booster" ? block.queued : [],
    }))
    .filter((block) => block.live.length + block.queued.length);

  // Cards found per set, counted in one pass over the collection (signed in only).
  const ownedBy = activeTrainer() ? new Map() : null;
  if (ownedBy) {
    for (const [id, count] of Object.entries(ownedMapNow())) {
      if (count > 0 && !isBoxPromoId(id)) {
        const home = homeSetId(id);
        ownedBy.set(home, (ownedBy.get(home) || 0) + 1);
      }
    }
  }
  const slug = (era) => `era-${String(era).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const blocks = eras
    .map((block) => {
      // A Trainer Kit's tile counts both of its half decks.
      const parts = (set) => kitHalves(set) || [set];
      const foundIn = (set) => parts(set).reduce((n, part) => n + Math.min(ownedBy.get(part.id) || 0, Number(part.totalCount) || 0), 0);
      const sizeOf = (set) => parts(set).reduce((n, part) => n + (Number(part.totalCount) || 0), 0);
      const live = block.live.map((set) => catalogSlot(set, { live: true, owned: ownedBy ? foundIn(set) : null, total: sizeOf(set) })).join("");
      const rest = block.queued.map((set) => catalogSlot(set)).join("");
      const count = block.live.length + block.queued.length;
      const sets = `${count} ${count === 1 ? one : many}`;
      const state = !block.queued.length
        ? sets
        : !block.live.length
          ? `${sets} on the way`
          : `${sets}, ${block.live.length} live`;
      const found = ownedBy ? block.live.reduce((n, set) => n + foundIn(set), 0) : 0;
      const of = block.live.reduce((n, set) => n + sizeOf(set), 0);
      return `<section class="era-block" id="${esc(slug(block.era))}">
      <header class="era-head">
        <h3>${esc(eraTitle(block.era))}</h3>
        <p><span class="era-span">${esc(eraYears(block.live.length ? block.live : block.sets))}</span><span class="era-count">${state}</span>${
          ownedBy && of ? `<span class="era-found">${num(found)} of ${num(of)} cards found</span>` : ""
        }</p>
      </header>
      <div class="cat-grid">${live}${rest}</div>
    </section>`;
    })
    .join("");

  const top = document.getElementById("catalog-top");
  if (top) {
    // The set on the counter, one tap from its page.
    const wrap = chosenWrapper(liveSet);
    const thumb = wrap
      ? quietPackPicture(wrap, liveSet, true)
      : `<img src="${esc(setIdentity(liveSet).logo)}" alt="" loading="lazy" decoding="async" />`;
    const back = `<a class="rt-row cat-back" href="/packs/${esc(liveSet.id)}">
        <span class="rt-row-lab">Jump back in</span>
        <span class="cat-back-th${wrap ? "" : " is-logo"}">${thumb}</span>
        <span class="rt-row-name">${esc(liveSet.name)}<small>${esc(liveSet.era || liveSet.edition || "")}</small></span>
        ${liveSet.cost && liveSet.wrappers?.length ? `<span class="rt-row-val price">${coinAmount(liveSet.cost)}</span>` : ""}
      </a>`;
    const tabs = cats
      .map((entry) => {
        const on = entry.id === cat.id;
        return `<button type="button" class="st cat-tab${on ? " active" : ""}" role="tab" aria-selected="${on}" data-cat="${esc(entry.id)}">${esc(entry.name)} <small>${num(entry.sets.length)}</small></button>`;
      })
      .join("");
    const jumps = eras.length > 2
      ? `<nav class="cat-jump" aria-label="Eras">${eras.map((block) => `<button type="button" class="cat-jump-era" data-era-jump="${esc(slug(block.era))}">${esc(eraTitle(block.era))}</button>`).join("")}</nav>`
      : "";
    top.innerHTML = `${back}
      <div class="cat-tabs" role="tablist" aria-label="Kinds of packs">${tabs}</div>
      <p class="catalog-summary${cat.id === "booster" || cat.id === "japanese" ? " is-plain" : ""}">${esc(cat.note)}${cat.id === "booster" || cat.id === "japanese" ? "" : " Extras have a collection page and no mastery."}</p>
      ${jumps}`;
  }
  els.catalogEras.innerHTML = blocks;
  // The tabs scroll sideways on a phone: keep the chosen one in view.
  const row = top?.querySelector(".cat-tabs");
  const on = row?.querySelector(".cat-tab.active");
  if (row && on && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
}

// "All packs" on a set page opens the Packs page on that set's own category.
document.getElementById("view-shop")?.addEventListener("click", (e) => {
  if (e.target.closest('a[href="/packs"]')) catalogCat = setCategory(liveSet);
}, true);

document.getElementById("view-catalog")?.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-cat]");
  if (tab) {
    catalogCat = tab.dataset.cat;
    renderCatalog();
    document.querySelector("#catalog-top .cat-tab.active")?.focus({ preventScroll: true });
    return;
  }
  const jump = e.target.closest("[data-era-jump]");
  if (jump) document.getElementById(jump.dataset.eraJump)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
});

/* ---- Home / Account / Settings ------------------------------------------ */

const num = (n) => Number(n || 0).toLocaleString();
/* Coins are dollars: whole amounts read without cents (see js/money.js). */
const coin = coinText;

function completion() {
  const total = setCards.length || liveSet.totalCount || 0;
  const owned = setOwned();
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : 0 };
}

/**
 * One id -> card index over every loaded set's list. A collection lookup used to walk every list in setCache
 * (180+ once every set is loaded), so adding up a big collection was cards x sets. Lists are indexed once when
 * they first show up; a hit is checked against its list so a replaced list can never hand back a stale card.
 */
const cardIndex = new Map(); // id -> { card, key, list }
const indexedLists = new Map(); // setCache key -> [list, length]

function syncCardIndex() {
  let stale = false;
  for (const [key, [list, length]] of indexedLists) {
    if (setCache[key] !== list || list.length !== length) stale = true;
  }
  if (stale) {
    cardIndex.clear();
    indexedLists.clear();
  }
  for (const [key, list] of Object.entries(setCache)) {
    if (!Array.isArray(list) || indexedLists.has(key)) continue;
    for (const card of list) if (card?.id && !cardIndex.has(card.id)) cardIndex.set(card.id, { card, key, list });
    indexedLists.set(key, [list, list.length]);
  }
}

function findCard(id) {
  if (byId[id]) return byId[id];
  let hit = cardIndex.get(id);
  if (hit && setCache[hit.key] === hit.list) return hit.card;
  syncCardIndex();
  hit = cardIndex.get(id);
  return hit ? hit.card : null;
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
    (n, [id, count]) => n + (count > 0 && homeSetId(id) === set.id && !isBoxPromoId(id) ? 1 : 0),
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

/**
 * The priciest cards in the loaded set: its chase cards. A set with packs only
 * counts what those packs can pull, so the stamped promos, box toppers and
 * deck-only cards filed in its data stay out (the same test as the engine's
 * pool). A promo set has no packs, so its promos are its chase.
 */
function topByValue(limit = 5) {
  const packs = !liveSet?.promoSet;
  return [...setCards]
    .filter((card) => !card.energy && card.rarity !== "Energy" && typeof card.market === "number")
    .filter((card) => !packs || (!card.promo && !card.noPack && !card.boxTopper))
    .sort((a, b) => sellValue(b) - sellValue(a))
    .slice(0, limit);
}

/** Longest set id first, so "sv3pt5-1" finds sv3pt5 before sv3. Sorted once, not on every call. */
let setsLongestFirst = null;
const setForCardMemo = new Map();

function setForCardId(id) {
  if (!id) return null;
  if (!setsLongestFirst || setsLongestFirst.length !== PLAYABLE_SETS.length) {
    setsLongestFirst = PLAYABLE_SETS.slice().sort((a, b) => b.id.length - a.id.length);
    setForCardMemo.clear();
  }
  if (setForCardMemo.has(id)) return setForCardMemo.get(id);
  const set = setsLongestFirst.find((s) => id === s.id || id.startsWith(`${s.id}-`)) || null;
  setForCardMemo.set(id, set);
  return set;
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
  if (document.fonts?.check?.('800 100px "Sofia Sans Extra Condensed"')) titleWidths.set(text, em);
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
  const cards = set.packSize - energy;
  return `${cards} card${cards === 1 ? "" : "s"}${tail} a pack, at the printed pull rates.`;
}

/* ---- Home: the set on show --------------------------------------------------
   One set at a time, like a game's title screen: its tag, its name, the
   wrapper party, the big pack on its cyan slab, the chase cards and the Open
   key. The arrows by the tag (or a swipe across the pack) step through the
   newest sets; the words and the pack change at once, and the set itself is
   put on show once the player stops stepping (activateSet loads its cards). */
let shelfCenter = ""; // the set whose words and pack are on show
let shelfSettle = 0;
let homeSwiped = false; // a swipe just stepped the set: the tap that ends it is not a rip
const homeShown = { set: "", wrap: "" }; // what is painted, so only a change moves
let homePriceRaf = 0;

/** The sets the arrows step through: the newest dozen with packs, and the set on show if it is older. */
function shelfSets() {
  const list = PLAYABLE_SETS.filter((set) => !set.promoSet && set.wrappers?.length).slice(0, 12);
  if (!list.some((set) => set.id === liveSet.id)) list.unshift(liveSet);
  return list;
}

/** A set out in the last six weeks wears the red "New" tag. */
function homeIsNew(set) {
  const t = Date.parse(String(set?.released || ""));
  if (!Number.isFinite(t)) return false;
  const age = Date.now() - t;
  return age >= 0 && age < 45 * 86_400_000;
}

/** "New, Nov 6 2026" */
function homeTagText(set) {
  const m = String(set.released || "").match(/^([A-Za-z]+)\s+(\d+),\s+(\d{4})$/);
  return m ? `New, ${m[1].slice(0, 3)} ${m[2]} ${m[3]}` : "New";
}

/** Restart a one-off animation class on an element. */
function homeReplay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const HOME_ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>`;

/** The arrows by the tag: the newer set, "2 of 12", the older set. Built once, then only relabelled, so focus stays put. */
function paintShelfSteps() {
  const nav = document.getElementById("home-set-picker");
  if (!nav) return;
  if (!nav.querySelector("[data-shelf-step]")) {
    nav.innerHTML = `<button type="button" class="hh-step is-newer" data-shelf-step="-1">${HOME_ARROW}</button>
      <span class="hh-count" aria-hidden="true"></span>
      <button type="button" class="hh-step is-older" data-shelf-step="1">${HOME_ARROW}</button>`;
  }
  const list = shelfSets();
  const at = Math.max(0, list.findIndex((set) => set.id === shelfCenter));
  const [newer, older] = nav.querySelectorAll("[data-shelf-step]");
  const label = (btn, set, word) => {
    btn.disabled = !set;
    btn.setAttribute("aria-label", set ? `${word} set, ${set.name}` : `No ${word.toLowerCase()} set`);
  };
  label(newer, list[at - 1], "Newer");
  label(older, list[at + 1], "Older");
  nav.querySelector(".hh-count").innerHTML = `<b>${at + 1}</b> of ${list.length}`;
  nav.hidden = list.length < 2;
}

function renderShelf() {
  const all = document.getElementById("home-all-sets");
  if (all) all.textContent = `All ${num(PLAYABLE_SETS.length)} sets`;
  if (!shelfCenter || !shelfSets().some((set) => set.id === shelfCenter)) shelfCenter = liveSet.id;
  paintShelfSteps();
}

/** Step to the next newer (-1) or older (1) set. */
function stepShelf(dir) {
  const list = shelfSets();
  const at = list.findIndex((set) => set.id === shelfCenter);
  const next = list[at + dir];
  if (!next || packPhase !== "idle") return;
  shelfCenter = next.id;
  paintShelfSteps();
  paintFeatured(next, dir);
  clearTimeout(shelfSettle);
  shelfSettle = setTimeout(settleShelf, 320);
}

/** Put the set the player stepped to on show once they stop stepping. */
function settleShelf() {
  if (!shelfCenter || shelfCenter === liveSet.id || packPhase !== "idle" || view !== "home") return;
  activateSet(shelfCenter, false, true);
}

/** The set the arrows are on, put on show first if it hasn't settled yet. */
async function shelfSetReady() {
  if (view !== "home" || !shelfCenter || shelfCenter === liveSet.id) return true;
  clearTimeout(shelfSettle);
  return activateSet(shelfCenter);
}

/** "10 cards and a basic Energy", from the set's own slots. */
function packShort(set) {
  if (set.promoSet || !set.packSize) return "";
  const energy = (set.slots || []).filter((slot) => slot.pool === "energy").reduce((n, slot) => n + (slot.count || 1), 0);
  const tail = energy === 1 ? " and a basic Energy" : energy > 1 ? ` and ${energy} Energy` : "";
  const cards = set.packSize - energy;
  return `${cards} card${cards === 1 ? "" : "s"}${tail}`;
}

/** The pack picture on the stage: the img carries the hard shadow, the layers around it move. */
function homePackLayers(inner) {
  return `<span class="hh-lean"><span class="hh-float">${inner}</span></span>`;
}

/** The stage: the chosen wrapper big and tilted, the wrappers either side of it fanned behind (computers). */
function homePacksHtml(set, wrap) {
  if (!wrap) {
    // A promo set has no packs: its top promo stands in a top-loader.
    const card = (set.heroIds || []).map((id) => byId[id]).find(Boolean);
    return card
      ? `<button type="button" class="hh-pack is-loader" data-shelf-pick="${esc(set.id)}" aria-label="Shop ${esc(set.name)}">${homePackLayers(`<span class="hs-loader">${tcgFace(card, { small: true, stamp: false })}</span>`)}</button>`
      : "";
  }
  const all = set.wrappers || [];
  const i = all.indexOf(wrap);
  const n = all.length;
  const side = (w, cls) =>
    w ? `<button type="button" class="hh-side ${cls}" data-home-wrapper="${esc(w.id)}" tabindex="-1" aria-hidden="true">${quietPackPicture(w, set, true)}</button>` : "";
  return `${n > 2 ? side(all[(i + n - 1) % n], "is-l") : ""}${n > 1 ? side(all[(i + 1) % n], "is-r") : ""}
    <button type="button" class="hh-pack" data-shelf-pick="${esc(set.id)}" aria-label="Open a ${esc(wrap.name)} ${esc(set.name)} pack">${homePackLayers(packPicture(wrap, "", set).replace(/ alt="[^"]*"/, ' alt=""'))}</button>`;
}

/** The price on the Open key; it rolls to a new set's price. */
function rollHomePrice(el, to, moving) {
  const from = el.dataset.value ? Number(el.dataset.value) : NaN;
  el.dataset.value = String(to);
  cancelAnimationFrame(homePriceRaf);
  el.innerHTML = `${COIN_I}<span class="hh-n">${coinText(Number.isFinite(from) && moving ? from : to)}</span><span class="sr-only"> coins</span>`;
  if (!moving || !Number.isFinite(from) || from === to) return;
  const figure = el.querySelector(".hh-n");
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 420);
    const eased = 1 - (1 - t) ** 3;
    figure.textContent = coinText(t >= 1 ? to : Math.round((from + (to - from) * eased) * 100) / 100);
    if (t < 1) homePriceRaf = requestAnimationFrame(tick);
  };
  homePriceRaf = requestAnimationFrame(tick);
}

/** The set on show: tag, name, meta, the wrapper party, the pack, the Open key. `dir` is the step that brought it (-1 newer, 1 older). */
function paintFeatured(set, dir = 0) {
  const wrap = set.id === liveSet.id ? chosenWrapper(set) : set.wrappers?.[0];
  const firstPaint = !homeShown.set;
  const setChanged = homeShown.set !== set.id;
  const wrapChanged = setChanged || homeShown.wrap !== (wrap?.id || "");
  homeShown.set = set.id;
  homeShown.wrap = wrap?.id || "";
  const moving = !firstPaint && fxOk();
  const hero = document.getElementById("home-shelf");
  const isNew = homeIsNew(set);

  const tag = document.getElementById("home-tag");
  if (tag) {
    tag.hidden = !isNew;
    tag.textContent = isNew ? homeTagText(set) : "";
  }
  // The name is as big as the room allows: js measures it in em, the whole
  // name (--line-em, one line on a phone) and its widest word (--name-em).
  const title = document.getElementById("home-title");
  if (title) {
    paintSign(title, set.name);
    title.style.setProperty("--line-em", titleWidthEm(title, set.name).toFixed(3));
    if (setChanged && moving) homeReplay(title, "hh-in");
  }
  const meta = document.getElementById("home-meta");
  if (meta) {
    // "Mega Evolution, 148 cards, 11 per pack"; an older set gives its year too.
    const year = String(set.released || "").match(/\d{4}/)?.[0];
    meta.textContent = [
      set.era || set.edition,
      !isNew && year,
      set.totalCount ? `${num(set.totalCount)} cards` : "",
      set.promoSet ? "promos come in boxes" : set.packSize ? `${set.packSize} per pack` : "",
    ].filter(Boolean).join(", ");
    if (setChanged && moving) homeReplay(meta, "hh-in");
  }

  // The party: one slanted slot per wrapper; the chosen one is ink with the yellow edge.
  const many = set.wrappers?.length > 1;
  hero?.classList.toggle("has-party", Boolean(many));
  const pager = document.getElementById("home-pager");
  if (pager) {
    pager.hidden = !many;
    if (!many) pager.innerHTML = "";
    else if (setChanged || pager.dataset.set !== set.id) {
      pager.dataset.set = set.id;
      pager.innerHTML = set.wrappers
        .map(
          (w, i) => `<button type="button" class="hh-slot" style="--i:${i}" data-home-wrapper="${esc(w.id)}" aria-pressed="${w.id === wrap?.id}">
            <span class="hh-slot-in">${quietPackPicture(w, set, true)}<b>${esc(w.name)}</b></span></button>`
        )
        .join("");
      if (moving) homeReplay(pager, "hh-in");
    } else {
      pager.querySelectorAll("[data-home-wrapper]").forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.homeWrapper === wrap?.id)));
    }
  }

  const packs = document.getElementById("home-packs");
  if (packs && (wrapChanged || !packs.childElementCount)) {
    packs.style.setProperty("--dir", dir < 0 ? "-1" : "1");
    packs.innerHTML = homePacksHtml(set, wrap);
    if (moving) homeReplay(packs, "is-swap");
    else packs.classList.remove("is-swap");
  }

  // The chase cards belong to the loaded set; while another is on its way they wait, faded.
  document.getElementById("home-chase")?.classList.toggle("is-stale", set.id !== liveSet.id);

  const price = document.getElementById("home-price");
  if (price) {
    if (set.promoSet) {
      price.innerHTML = "";
      delete price.dataset.value;
    } else rollHomePrice(price, Number(set.cost) || 0, moving && setChanged);
  }
  const rip = document.getElementById("home-rip");
  if (rip) {
    const guest = !activeTrainer();
    const label = document.getElementById("home-rip-label");
    const words = set.promoSet ? `Shop ${set.name}` : guest ? "Your first pack" : "Open a pack";
    if (label) label.textContent = words;
    else rip.textContent = words;
    rip.closest(".home-cta")?.classList.toggle("is-guest", guest && !set.promoSet);
    rip.classList.toggle("is-shop", Boolean(set.promoSet));
    const pitch = document.getElementById("home-pitch");
    if (pitch) pitch.hidden = !guest;
  }
  const choose = document.getElementById("home-choose");
  if (choose) {
    choose.href = `/packs/${set.id}`;
    choose.hidden = Boolean(set.promoSet);
  }
}

/** A different wrapper for the set on show: the big pack swaps to it. */
function pickHomeWrapper(id) {
  const wrapper = liveSet.wrappers?.find((w) => w.id === id);
  if (!wrapper) return;
  const before = liveSet.wrappers.indexOf(chosenWrapper());
  activeWrapper = wrapper;
  paintWrapperChoice();
  paintFeatured(liveSet, liveSet.wrappers.indexOf(wrapper) < before ? -1 : 1);
}

/** A row of rarity marks as the card prints them, for a rate's rarity word. */
function oddsMark(word) {
  const marks = rarityIcons(word);
  return marks ? `<span class="odds-mark" aria-hidden="true">${marks}</span>` : "";
}

/** A carbon plate with one cut corner (DESIGN.md: panels). */
function plate(title, aside, body, cls = "") {
  return `<section class="plate${cls ? ` ${cls}` : ""}">
    <div class="plate-head"><h2>${esc(title)}</h2>${aside ? `<span>${aside}</span>` : ""}</div>
    ${body}
  </section>`;
}

/** A print's finish in a word, to tell two prints of one card apart. */
function printWord(card) {
  if (card.rarity === "Mega Hyper Rare" || card.rarity === "Hyper Rare") return "gold";
  if (card.rarity === "Special Illustration Rare") return "special art";
  if (card.rarity === "Illustration Rare") return "art";
  if (card.rarity === "Ultra Rare") return "full art";
  return String(card.rarity || card.number || "").toLowerCase();
}

/** "Special illustration rare": a rarity in sentence case (a word in capitals, like ACE SPEC, keeps them). */
function rarityWords(card) {
  const label = String(RARITY_LABEL[card.rarity] || card.rarity || "");
  return label.split(" ").map((word, i) => (i && word !== word.toUpperCase() ? word.toLowerCase() : word)).join(" ");
}

/** "SIR", the hobby's short name for a rarity of two words or more that ends in Rare. */
function rarityShort(card) {
  const words = String(RARITY_LABEL[card.rarity] || card.rarity || "").split(/\s+/).filter(Boolean);
  return words.length > 1 && /^rare$/i.test(words[words.length - 1]) ? words.map((w) => w[0].toUpperCase()).join("") : rarityWords(card);
}

/** The chase cards as rows: the number on the slanted ink label (a phone shows one row, "Chase card"), the card, its name, its rarity, its value. */
function homeChaseRows(list) {
  const twice = new Set(list.map((card) => card.name).filter((name, i, all) => all.indexOf(name) !== i));
  return list
    .map((card, i) => {
      const name = twice.has(card.name) ? `${card.name}, ${printWord(card)}` : card.name;
      const no = numberLine(card);
      return `<button type="button" class="rt-row hh-row" style="--i:${i}" ${inspectAttrs(card)} aria-label="${esc(name)}, ${esc(rarityLine(card))}, ${esc(coinText(sellValue(card)))} coins">
        <span class="rt-row-lab"><span class="hh-ph">Chase card</span><span class="hh-dk">${esc(no)}</span></span>
        <span class="hh-thumb">${tcgFace(card, { small: true, stamp: false, lazy: i > 0 })}</span>
        <span class="rt-row-name"><span class="hh-nm"><span class="hh-ph">${esc(card.name)}</span><span class="hh-dk">${esc(name)}</span></span><small><span class="hh-ph">${esc(no)}, ${esc(rarityShort(card))}</span><span class="hh-dk">${esc(rarityWords(card))}</span>${ownedQty(card.id) > 0 ? `<span class="own">In binder</span>` : ""}</small></span>
        <span class="rt-row-val">${coinAmount(sellValue(card))}</span>
      </button>`;
    })
    .join("");
}

function renderHome() {
  const set = liveSet;
  const trainer = activeTrainer();

  renderShelf();
  paintFeatured(shelfCenter && shelfCenter !== set.id ? getSet(shelfCenter) : set);

  // Chase cards: the set's four most valuable cards, as rows beside the pack.
  const chaseList = topByValue(4);
  const chase = document.getElementById("home-chase");
  if (chase) {
    chase.innerHTML = homeChaseRows(chaseList);
    chase.hidden = !chaseList.length;
    chase.classList.toggle("is-stale", Boolean(shelfCenter && shelfCenter !== set.id));
    // A new set's rows rise in turn once it has loaded (css/pages/home.css).
    const arrived = chase.dataset.set && chase.dataset.set !== set.id && fxOk();
    chase.dataset.set = set.id;
    if (arrived) homeReplay(chase, "hh-in");
  }
  const homeSetMoved = els.homeBody.dataset.set && els.homeBody.dataset.set !== set.id && fxOk();
  els.homeBody.dataset.set = set.id;
  const chaseHead = document.getElementById("home-chase-h");
  if (chaseHead) chaseHead.hidden = !chaseList.length;

  // Your binder: this set's progress as an HP bar, and what it is worth.
  const { owned, total } = completion();
  const share = total ? Math.min(100, (owned / total) * 100) : 0;
  const purse = binderValue(set);
  const binder = plate(
    "Your binder",
    trainer ? `@${esc(trainer.handle)}` : "",
    `<div class="prog"><b>${num(owned)} / ${num(total)}</b><span class="bar" role="img" aria-label="${num(owned)} of ${num(total)} ${esc(set.name)} cards found"><i style="width:${share.toFixed(2)}%"></i></span></div>
    <p class="kv"><span>${esc(set.name)} binder value</span><span class="price">${coinAmount(purse.value || 0)}</span></p>
    <a class="tlink" href="/bulk">Open the collection</a>`,
    homeSetMoved ? "home-binder hh-in" : "home-binder"
  );

  // Kept short on purpose (Noah, 2026-11-23: too much going on for new players):
  // the set on show and its chase cards, then the player's binder. Odds live on
  // the set page, older sets in All sets, pulls on the account page, chat on Social.
  els.homeBody.innerHTML = trainer ? `<div class="home-grid">${binder}</div>` : "";
  thisWeek.render();
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
  // Only a save from before accounts can be carried over: a signed-out page
  // zeroes its live state (wipeProgressMemory), which is not progress.
  const save = activeTrainer() ? null : pendingClaim;
  if (!save) return false;
  const owned = Object.values(save.collection || {}).some((n) => n > 0);
  return save.packsOpened > 0 || owned || save.coins !== STARTING_COINS || Boolean(save.lastDaily);
}

/** Booster sets, then any extra whose mastery was claimed while it existed (it keeps its seal, title and banner). */
function masterySets() {
  const claimed = claimedIds();
  return PLAYABLE_SETS.filter((set) => isBoosterSet(set) || claimed.has(`set-${set.id}-master`));
}

function setCompletionRows() {
  const perSet = ownedPerSet(ownedMapNow());
  return masterySets().map((set) => {
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
  // The live rows, plus any retired row this player claimed while it could still be earned (an extra's old mastery).
  const rows = achievementsFor(claimed);
  const done = rows.filter((row) => claimed.has(row.id) || isAchievementDone(row, ctx)).length;
  const banked = rows.reduce((n, row) => n + (claimed.has(row.id) ? row.coins : 0), 0);
  const claimedShown = rows.reduce((n, row) => n + (claimed.has(row.id) ? 1 : 0), 0);
  return {
    ctx,
    claimed,
    ready,
    done,
    banked,
    waiting: claimTotal(ready),
    total: rows.length,
    pct: Math.round((claimedShown / rows.length) * 100),
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
  // The sets with a mastery: every booster set, plus an extra whose mastery this player claimed before it was retired.
  get sets() {
    return masterySets();
  },
  setById: (id) => SET_BY_ID.get(id) || null,
  get rows() {
    return achievementsFor(claimedIds());
  },
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
  const pixel = avatarPixel(trainer?.avatarStyle) ? " pixel" : "";
  const mark = `<div class="${extraClass}${pixel}" style="--avatar:${esc(color.hex)}"><img src="${esc(avatarSrc(trainer?.avatar, trainer?.avatarStyle))}"${avatarFit(trainer?.avatar, trainer?.avatarStyle)} alt="" /></div>`;
  const frame = userFrame(trainer);
  return frame ? frameHtml(mark, frame, { size: "xl", color: color.hex }) : mark;
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
  // From someone's profile, signing in goes back to it and signup offers the way back.
  profileReturn = view === "profile" ? profileHandle : "";
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
  } else if (profileReturn) {
    const handle = profileReturn;
    profileReturn = "";
    setView("profile", handle);
  } else setView("account");
}

async function hydrateAfterAccountChange() {
  recoveryInfo = { loaded: false, createdAt: 0, code: "" };
  resetSecurity();
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

/** The sign-in screen's hero: the set on show, its wrappers fanned on the cyan slab (decoration only). */
function authHeroHtml() {
  const wraps = (liveSet?.wrappers || []).slice(0, 3);
  if (!wraps.length) return `<div class="au-hero is-mark" aria-hidden="true"><span class="au-slab"></span><img class="au-pack" src="assets/mark-v3.png" alt="" /></div>`;
  const order = wraps.length === 3 ? [wraps[1], wraps[2], wraps[0]] : wraps.length === 2 ? [wraps[1], wraps[0]] : wraps;
  return `<div class="au-hero n${wraps.length}" aria-hidden="true"><span class="au-slab"></span>${order
    .map((w, i) => `<span class="au-pack p${order.length - i}">${packPicture(w, " ", liveSet).replace(/ alt="[^"]*"/, ' alt=""')}</span>`)
    .join("")}</div>`;
}

/** Signup steps: a ball fills as each step is answered (visual only; the submit checks stay as they are). */
function syncSignupSteps(form) {
  if (!form) return;
  const data = new FormData(form);
  const done = {
    trainer: cleanHandle(data.get("handle")).length >= 3 && !form.querySelector("#handle-hint.bad") && String(data.get("password") || "").length >= 6,
    age: Boolean(data.get("birthMonth") && data.get("birthYear")),
    terms: data.has("agree"),
  };
  let now = false;
  form.querySelectorAll("[data-step]").forEach((step) => {
    const ok = done[step.dataset.step];
    const ball = step.querySelector(".rt-ball");
    step.classList.toggle("is-done", ok);
    ball?.classList.toggle("e", !ok);
    ball?.classList.toggle("now", !ok && !now);
    if (!ok) now = true;
  });
}

/** The first screen after signup: what you start with and one button to your first pack. */
function welcomeHtml(trainer) {
  const cost = Number(liveSet?.cost) || 0;
  const canRip = !liveSet?.promoSet && cost > 0 && state.coins >= cost;
  const claimReady = msUntilDaily(state) <= 0;
  const hourly = state.xp ? levelUi.xpOf(state).hourly : DAILY_BONUS;
  const packLine = canRip
    ? `A ${esc(liveSet.name)} pack is ${coinAmount(cost)}.`
    : "";
  return `<div class="auth-page welcome-page">
      ${authHeroHtml()}
      <div class="auth-copy">
        <p class="au-kicker"><span class="rt-tag">New trainer</span></p>
        <div class="welcome-face">${avatarMark(trainer, "trainer-mark look-face")}</div>
        <h1>Welcome, <span class="welcome-name" style="--nl:${[...String(trainer.name)].length}">${esc(trainer.name)}</span></h1>
        <p class="lede">You've got ${coinAmount(state.coins)}. ${packLine}</p>
      </div>
      <div class="welcome-actions">
        ${
          canRip
            ? `<button class="solid rt-go welcome-rip" type="button" data-welcome-rip>Rip your first pack</button>`
            : claimReady
              ? `<button class="solid rt-go" type="button" data-welcome-claim>Claim ${num(hourly)} coins</button>`
              : `<button class="solid rt-go" type="button" data-goto="shop">See the packs</button>`
        }
        <dl class="welcome-facts">
          <div class="rt-row"><dt class="rt-row-lab">Claim</dt><dd class="rt-row-name">${num(hourly)} coins every hour, from the top of the screen</dd></div>
          <div class="rt-row"><dt class="rt-row-lab">Your link</dt><dd class="rt-row-name">poke-pack.rip/u/${esc(trainer.handle)}</dd></div>
          <div class="rt-row"><dt class="rt-row-lab">Password</dt><dd class="rt-row-name"><button class="text-btn" type="button" data-welcome-recovery>Make a recovery code</button> in Account, Security, in case you forget it. You can turn on two-step sign-in there too.</dd></div>
          <div class="rt-row"><dt class="rt-row-lab">New here?</dt><dd class="rt-row-name"><button class="text-btn" type="button" data-tour-start>Take the 30-second tour</button></dd></div>
        </dl>
        ${
          profileReturn
            ? `<a class="text-btn welcome-back" href="/u/${esc(profileReturn)}">Back to @${esc(profileReturn)}</a>`
            : `<button class="text-btn" type="button" data-welcome-look>Pick an avatar and colour</button>`
        }
      </div>
    </div>`;
}

function renderAuth() {
  const signed = activeTrainer();
  if (authTab === "welcome" && signed) {
    els.authBody.innerHTML = welcomeHtml(signed);
    return;
  }
  if (authTab === "welcome") authTab = "signup";
  if (authTab === "twostep" && !inTwoStep()) authTab = "signin";
  if (authTab === "twostep") {
    els.authBody.innerHTML = `
    <div class="auth-page is-signin is-twostep">
      ${authHeroHtml()}
      <div class="auth-copy">
        <p class="au-kicker"><img class="auth-mark" src="assets/mark-v3.png" width="256" height="256" alt="" /><span class="au-plate">Two-step</span></p>
        <h1>One more step</h1>
        <p class="lede">Signing in as @${esc(twoStepHandle())}.</p>
      </div>
      ${twoStepAuthHtml()}
    </div>`;
    return;
  }
  const keepDefault = !signed && guestHasProgress();
  const recover = authTab === "recover";
  const signin = authTab === "signin" || recover;
  const signupForm = `
    <form id="signup-form" class="auth-form" autocomplete="on" novalidate>
      <div class="au-step" data-step="trainer">
        <p class="au-step-h" aria-hidden="true"><i class="rt-ball e now"></i><span>Your trainer</span></p>
        <label class="field" data-field="handle">
          <span>Pick a handle</span>
          <span class="field-at"><input name="handle" minlength="3" maxlength="16" required placeholder="ripper" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" aria-describedby="handle-hint" /></span>
          <span class="hint handle-hint" id="handle-hint" aria-live="polite">Letters, numbers and _. It's your name on the site and your profile link.</span>
        </label>
        <label class="field" data-field="password">
          <span>Password</span>
          <span class="field-pass"><input name="password" type="password" minlength="6" maxlength="64" required autocomplete="new-password" aria-describedby="pass-hint" /><button class="pass-show" type="button" data-pass-show aria-pressed="false">Show</button></span>
          <span class="hint" id="pass-hint">At least 6 characters.</span>
        </label>
      </div>
      <div class="au-step" data-step="age">
        <p class="au-step-h" aria-hidden="true"><i class="rt-ball e"></i><span>Your birthday</span></p>
        ${ageFieldsHtml()}
      </div>
      <div class="au-step" data-step="terms">
        <p class="au-step-h" aria-hidden="true"><i class="rt-ball e"></i><span>The rules</span></p>
        ${
          keepDefault
            ? `<label class="check-row"><input type="checkbox" name="keep" checked /> Bring the cards already on this browser</label>`
            : ""
        }
        ${agreeRowHtml()}
      </div>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="solid rt-go" type="submit">Create account</button>
    </form>`;

  const signinForm = `<form id="signin-form" class="auth-form" autocomplete="on">
      <label class="field">
        <span>Handle</span>
        <span class="field-at"><input name="handle" maxlength="16" required placeholder="ripper" autocapitalize="off" spellcheck="false" autocomplete="username" /></span>
      </label>
      <label class="field">
        <span>Password</span>
        <span class="field-pass"><input name="password" type="password" maxlength="64" required autocomplete="current-password" /><button class="pass-show" type="button" data-pass-show aria-pressed="false">Show</button></span>
      </label>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="solid rt-go" type="submit">Sign in</button>
      <button class="text-btn auth-forgot" type="button" data-auth-tab="recover">Forgot your password?</button>
    </form>`;

  const recoverForm = `<form id="recover-form" class="auth-form sec-auth" autocomplete="on">
      <p class="auth-note">A recovery code is the way back in. You make one in Account, under Security. Without one the password can't be reset.</p>
      <label class="field">
        <span>Handle</span>
        <span class="field-at"><input name="handle" maxlength="16" required placeholder="ripper" autocapitalize="off" spellcheck="false" autocomplete="username" /></span>
      </label>
      <label class="field">
        <span>Recovery code</span>
        <input name="code" required maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off" />
      </label>
      <label class="field">
        <span>New password</span>
        <span class="field-pass"><input name="password" type="password" minlength="6" maxlength="64" required autocomplete="new-password" /><button class="pass-show" type="button" data-pass-show aria-pressed="false">Show</button></span>
        <span class="hint">At least 6 characters.</span>
      </label>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="solid rt-go" type="submit">Save and sign in</button>
      <div class="sec-auth-links"><button class="text-btn" type="button" data-auth-tab="signin">Back to sign in</button></div>
    </form>`;

  els.authBody.innerHTML = `
    <div class="auth-page ${recover ? "is-recover" : signin ? "is-signin" : "is-signup"}">
      ${authHeroHtml()}
      <div class="auth-copy">
        <p class="au-kicker"><img class="auth-mark" src="assets/mark-v3.png" width="256" height="256" alt="" /><span class="au-plate">${recover ? "Recovery" : signin ? "Continue" : "New game"}</span></p>
        <h1>${recover ? "Reset your password" : signin ? "Welcome back" : "Make a trainer"}</h1>
        <p class="lede">${
          recover
            ? "Use the recovery code you saved to pick a new password."
            : signin
            ? "Sign in with your handle to pick up your cards, coins and binder."
            : `Start with ${coin(STARTING_COINS)} coins and claim ${DAILY_BONUS} more every hour. No email needed.`
        }</p>
      </div>
      <div class="auth-card rt-box">
        <div class="auth-tabs" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected="${signin}" class="auth-tab${signin ? " on" : ""}" data-auth-tab="signin">Sign in</button>
          <button type="button" role="tab" aria-selected="${!signin}" class="auth-tab${signin ? "" : " on"}" data-auth-tab="signup">Create account</button>
        </div>
        ${recover ? recoverForm : signin ? signinForm : ageBlocked() ? UNDERAGE_HTML : signupForm}
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

/* The account page is two places. What you play: five tabs under your trainer card.
   What you edit: "Edit profile", one screen with a live preview and a word for each
   thing you can change, and Security on its own. Old tab names still land somewhere. */
const ACCOUNT_TABS = [
  { id: "overview", name: "Overview", note: "Career, sets, and what you pulled." },
  { id: "levels", name: "Levels", note: "Your level, the road ahead and where your XP comes from." },
  { id: "quests", name: "Quests", note: "Daily, weekly and monthly coin rewards." },
  { id: "achievements", name: "Badges", note: "Badges, secrets, rewards and titles." },
  { id: "mastery", name: "Mastery", note: "Complete a set for a title, an emblem and a banner." },
];
const EDIT_TABS = [
  { id: "picture", name: "Picture", note: "Your Pokémon, its style and ring colour." },
  { id: "frame", name: "Frame", note: "The frame around your picture." },
  { id: "banner", name: "Banner", note: "The band behind your name." },
  { id: "name", name: "Name", note: "Name, handle, bio and the title under your name." },
  { id: "page", name: "Page", note: "Your public profile: room, sections, showcase and what it shares." },
];
const TAB_ALIASES = { look: "picture", profile: "name", about: "name", title: "name", layout: "page" };
const isEditTab = (id) => EDIT_TABS.some((tab) => tab.id === id);

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
const FOCUS_ATTRS = ["data-acct-tab", "data-quest-period", "data-ach-cat", "data-ach-filter", "data-mastery-era", "data-mastery-set", "data-claim", "data-quest-claim", "data-set-motion", "data-set-frame", "data-set-banner", "data-set-title", "data-claim-levels", "data-road-past", "data-prestige"];
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

function tabRowHtml(tabs, stats, label) {
  return `<nav class="acct-tabs${tabs === EDIT_TABS ? " edit-tabs" : ""}" aria-label="${label}">
      <div class="acct-tabrow">${tabs
        .map(
          (tab) => `<button type="button" class="acct-tab${tab.id === accountTab ? " on" : ""}"
          aria-current="${tab.id === accountTab}" data-acct-tab="${esc(tab.id)}" title="${esc(tab.note)}">
          ${esc(tab.name)}${stats ? tabDot(tab.id, stats) : ""}
        </button>`
        )
        .join("")}</div>
    </nav>`;
}

/** The head of Edit profile and Security: the way back, the screen's name, and the public page. */
function editTopHtml(trainer, title) {
  return `<header class="edit-top">
      <button type="button" class="edit-back" data-acct-tab="overview"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Account</button>
      <h1 class="edit-h">${title}</h1>
      <a class="tlink edit-view" href="/u/${esc(trainer.handle)}">View profile</a>
    </header>`;
}

/** The small trainer card that stays in view while you edit: every pick lands on it. */
function lookCardHtml(trainer) {
  return `${bannerBlockHtml(trainer.banner, { className: "acct-banner" })}
        <div class="look-id">
          ${avatarMark(trainer, "trainer-mark look-face")}
          <b>${esc(trainer.name)}${levelBadgeHtml(trainer.level, { size: "md", prestige: trainer.prestige })}</b>
          <small>@${esc(trainer.handle)}</small>
          <span class="account-title">${esc(trainer.title || "Rookie")}</span>
        </div>`;
}

function renderAccountBody() {
  const trainer = activeTrainer();
  if (!trainer) {
    els.accountBody.innerHTML = signedOutAccount();
    return;
  }
  accountTab = TAB_ALIASES[accountTab] || accountTab;
  const editing = isEditTab(accountTab);
  if (!editing && accountTab !== "security" && !ACCOUNT_TABS.some((tab) => tab.id === accountTab)) accountTab = "overview";
  if (accountTab !== "picture") resetAvatarPicker();
  const stats = achievementStats();
  els.accountBody.dataset.mode = editing ? "edit" : accountTab === "security" ? "security" : "play";

  if (editing) {
    // The Page tab brings its own preview (the room, js/profile-editor.js); the rest share the trainer card.
    const body =
      accountTab === "picture" ? pictureTab(trainer)
      : accountTab === "frame" ? frameTab(trainer)
      : accountTab === "banner" ? bannerTab(trainer, stats)
      : accountTab === "name" ? `${aboutTab(trainer)}${titleTab(trainer)}`
      : pageTab(trainer);
    els.accountBody.innerHTML = `
      ${editTopHtml(trainer, "Edit profile")}
      ${
        accountTab === "page"
          ? `${tabRowHtml(EDIT_TABS, null, "Edit profile")}<div class="acct-body">${body}</div>`
          : `<div class="look-layout">
              <aside class="look-preview" aria-label="Preview"><div class="look-card">${lookCardHtml(trainer)}</div></aside>
              <div class="look-controls">${tabRowHtml(EDIT_TABS, null, "Edit profile")}<div class="acct-body">${body}</div></div>
            </div>`
      }`;
  } else if (accountTab === "security") {
    els.accountBody.innerHTML = `${editTopHtml(trainer, "Security")}<div class="acct-body">${securityTab(trainer)}</div>`;
  } else {
    const body =
      accountTab === "levels" ? levelsTab()
      : accountTab === "quests" ? questsTab()
      : accountTab === "achievements" ? achievementsTab(stats)
      : accountTab === "mastery" ? masteryTab(stats)
      : overviewTab(trainer, stats);
    els.accountBody.innerHTML = `
      ${accountHero(trainer, stats)}
      ${tabRowHtml(ACCOUNT_TABS, stats, "Account sections")}
      <div class="acct-body">${body}</div>
      ${historyOpen ? historySheet() : ""}`;
  }

  const chart = els.accountBody.querySelector("#acct-worth-chart");
  if (chart) renderWorthChart(chart, state.worthLog, state.granted);
  if (accountTab === "mastery") placeMasteryDetail();
  for (const on of els.accountBody.querySelectorAll(".acct-tabs .on, .qa-words:not(.qa-words-inline) .on")) bringIntoView(on);
  // Motion (css/pages/trainer-card.css): figures roll on arrival and when they change; a new tab's rows rise in turn.
  rollFigures(els.accountBody, { arriving: acctArriving });
  growBars(els.accountBody, { arriving: acctArriving });
  // A pick that changed grows its plate or lands; a list that was re-filtered deals its first rows in again.
  const newTab = acctArriving || acctTabShown !== accountTab;
  const picked = markPicks(els.accountBody, { quiet: newTab });
  landPreview(els.accountBody.querySelector(".look-card"), { quiet: newTab });
  if (newTab) els.accountBody.querySelector(".acct-body")?.classList.add("acct-swap");
  else if (["data-quest-period", "data-ach-cat", "data-ach-filter", "data-mastery-era"].some((a) => picked.has(a)))
    els.accountBody.querySelector(".acct-body")?.classList.add("acct-refilter");
  acctArriving = false;
  acctTabShown = accountTab;
  freshClaims = new Set();
  freshLevels = new Set();
}

/** Redraw only the small trainer card on Edit profile (a picture was picked: nothing else may move). */
function repaintLookCard() {
  const trainer = activeTrainer();
  const card = els.accountBody.querySelector(".look-card");
  if (!trainer || !card) return;
  card.innerHTML = lookCardHtml(trainer);
  card.classList.remove("is-landing");
  void card.offsetWidth;
  landPreview(card);
}

function signedOutAccount() {
  const preview = ACHIEVEMENTS.filter((row) => !isSecret(row))
    .slice(0, 10)
    .map(
      (row) => `<article class="qa-tile t${row.tier} is-locked">
        <div class="qa-top">${questArea.miniMedal(row, 0, areaDeps).replace("qa-badge sm", "qa-badge")}<span class="qa-coin">${coinAmount(row.coins)}</span></div>
        <div class="qa-copy"><b>${esc(row.name)}</b><p>${esc(row.note)}</p></div>
      </article>`
    )
    .join("");
  return `
    <header class="tcard signed-out">
      <div class="tcard-band"></div>
      <div class="tcard-id">
        <img class="brand-logo lg" src="assets/mark-v3.png" width="256" height="256" alt="" />
        <div class="tcard-who">
          <h1 class="tcard-name">Make a trainer</h1>
          <p class="tcard-idno"><span><small>ID No.</small> <b>Not issued yet</b></span></p>
        </div>
      </div>
      <p class="tcard-lede">Your coins, cards, badges and binder live on your account, so they follow you to any device.</p>
      <div class="tcard-xp tcard-ghost-xp" aria-hidden="true">
        <span class="tcard-lv"><small>Lv</small><b>1</b></span>
        <span class="tcard-meter"><span class="rt-hp"><em>XP</em><span class="rt-track"><i style="width:0%"></i></span></span><small>Rip your first pack to start levelling</small></span>
      </div>
      <div class="acct-hero-actions tcard-actions">
        <button class="solid rt-go" type="button" data-open-auth="signup">Create account</button>
        <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
      </div>
    </header>
    <section class="acct-sec acct-preview">
      <h2 class="ground-h acct-preview-h">${num(ACHIEVEMENTS.length)} badges to earn</h2>
      <div class="qa-grid preview">${preview}</div>
    </section>`;
}

function accountHero(trainer, stats) {
  const ready = stats.ready.length;
  const xp = levelUi.xpOf(state);
  const cards = uniqueOwned();
  const binder = totalBinderValue();
  const left = xp.maxed ? 0 : xp.need - xp.into;
  // The facts: figures in a tidy two-column list, each with its word above.
  const facts = [
    ["Coins", `<span class="price">${coinAmount(state.coins)}</span>`],
    ["Cards", `<b class="tcard-fig" data-roll="${cards}" data-roll-key="cards">${num(cards)}</b>`],
    ["Binder worth", `<span class="price">${coinAmount(binder)}</span>`],
    ["Badges", `<b class="tcard-fig"><span data-roll="${stats.claimed.size}" data-roll-key="badges">${num(stats.claimed.size)}</span><small> of ${num(stats.total)}</small></b>`],
  ];
  return `<header class="tcard">
    <div class="tcard-band">${bannerBlockHtml(trainer.banner, { className: "tcard-banner", eager: true })}</div>
    <div class="tcard-id">
      <div class="tcard-face">${avatarMark(trainer, "trainer-mark acct-face")}</div>
      <div class="tcard-who">
        <h1 class="tcard-name">${esc(trainer.name)}</h1>
        <p class="tcard-sub"><span class="account-handle">@${esc(trainer.handle)}</span><span class="account-title">${esc(trainer.title || "Rookie")}</span></p>
        <p class="tcard-idno"><span><small>ID No.</small> <b>${esc(trainerCode(trainer.id))}</b></span>${trainer.createdAt ? `<span><small>Joined</small> <b>${esc(joinedOn(trainer.createdAt))}</b></span>` : ""}</p>
      </div>
    </div>
    <button type="button" class="tcard-xp" data-grow-up data-acct-tab="levels" aria-label="Level ${num(xp.level)}${xp.prestige ? `, prestige ${num(xp.prestige)}` : ""}. Open Levels.">
      <span class="tcard-lv"><small>Lv</small><b data-roll="${xp.level}" data-roll-key="level">${num(xp.level)}</b>${xp.prestige ? `<i class="tcard-star" title="Prestige ${num(xp.prestige)}">${num(xp.prestige)}</i>` : ""}</span>
      <span class="tcard-meter">
        <span class="rt-hp"><em>XP</em><span class="rt-track"><i data-grow-key="xp" style="width:${xp.maxed ? 100 : xp.pct}%"></i></span></span>
        <small>${xp.maxed ? `<b>${num(xp.total)}</b> XP, top level` : `<b>${num(xp.into)}</b> of ${num(xp.need)} XP, <span class="nw">${num(left)} to level ${num(xp.level + 1)}</span>`}</small>
      </span>
    </button>
    <dl class="tcard-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${questArea.masteryStripHtml(masterySetIds(state.claimed), areaDeps, { mine: true })}
    ${trainer.bio ? `<p class="account-bio">${esc(trainer.bio)}</p>` : ""}
    <div class="acct-hero-actions tcard-actions">
      ${
        ready
          ? `<button class="solid claim-cta rt-go" type="button" data-acct-tab="achievements">Claim <span class="claim-amt">${coinAmount(stats.waiting)}</span></button>`
          : ""
      }
      <button class="ghost" type="button" data-acct-tab="picture">Edit profile</button>
      <a class="ghost" href="/u/${esc(trainer.handle)}">Public profile</a>
      <span class="tcard-links">
        <button class="tlink" type="button" id="copy-profile-link">Copy link</button>
        <button class="tlink" type="button" data-acct-tab="security">Security</button>
        <button class="tlink acct-signout" type="button" id="sign-out">Sign out</button>
      </span>
    </div>
  </header>`;
}

/* ---- Overview ----------------------------------------------------------- */

function setRingHtml(row) {
  const { symbol } = setIdentity(row.set);
  return `<li><button type="button" class="row-btn setc-row${row.pct >= 100 ? " done" : ""}" data-jump-set="${esc(row.set.id)}"
    title="Open ${esc(row.set.name)} collection">
    <img class="setc-sym" src="${esc(symbol)}" alt="" width="28" height="28" loading="lazy" decoding="async" />
    <span class="tx">
      <b>${esc(row.set.name)}</b>
      <span>${num(row.owned)} of ${num(row.total)} cards</span>
    </span>
    <span class="setc-pct">${row.pct}%</span>
    <span class="bar" aria-hidden="true"><i style="width:${row.pct}%"></i></span>
  </button></li>`;
}

/** Sets with a card in them first; the untouched ones fold away underneath. */
function setRings() {
  const rows = setCompletionRows();
  const started = rows.filter((row) => row.owned > 0).sort((a, b) => b.pct - a.pct);
  const rest = rows.filter((row) => row.owned < 1);
  const list = (items) => `<ul class="rows setc-rows">${items.map(setRingHtml).join("")}</ul>`;
  return `${started.length ? list(started) : `<p class="panel-empty">No set started yet. <button class="tlink" type="button" data-goto="shop">Rip a pack</button></p>`}
    ${
      rest.length
        ? `<details class="set-rest">
            <summary>${num(rest.length)} ${rest.length === 1 ? "set" : "sets"} not started</summary>
            ${list(rest)}
          </details>`
        : ""
    }`;
}

function overviewTab(trainer, stats) {
  const history = state.history || [];
  const recent = historyCards(history, 8);
  const started = setCompletionRows().filter((row) => row.owned > 0).length;
  // Secret rows never show up here; their progress would give the secret away.
  const nextUp = ACHIEVEMENTS.filter((row) => !isSecret(row) && !stats.claimed.has(row.id) && !isAchievementDone(row, stats.ctx))
    .map((row) => ({ row, p: achievementProgress(row, stats.ctx) }))
    // Closest first; among equals, the smaller reward is the nearer goal (a new trainer sees first-pack badges, not era crowns).
    .sort((a, b) => b.p.pct - a.p.pct || a.row.coins - b.row.coins)
    .slice(0, 3);

  return `<div class="acct-overview">
    <div class="acct-col">
    <section class="plate acct-worth" aria-labelledby="acct-worth-h">
      <div class="plate-head">
        <h2 id="acct-worth-h">Net worth</h2>
        <span>Coins and binder</span>
      </div>
      <p class="acct-worth-fig"><span class="price">${coinAmount(netWorth())}</span></p>
      <div class="acct-chart" id="acct-worth-chart"></div>
    </section>
    <section class="acct-sec acct-pulls" aria-labelledby="acct-pulls-h">
      <div class="ground-h">
        <h2 id="acct-pulls-h">Pull history</h2>
        ${history.length ? `<button class="tlink" type="button" id="open-history">All ${num(history.length)}</button>` : ""}
      </div>
      ${
        recent.length
          ? `<ul class="acct-pull-row">${recent
              .map(
                (card) => `<li class="pull-card">
                  <button type="button" class="mini-card" ${inspectAttrs(card)} title="${esc(card.name)}" aria-label="${esc(card.name)}">${tcgFace(card, { small: true })}</button>
                  <span class="price">${coinAmount(sellValue(card))}</span>
                </li>`
              )
              .join("")}</ul>`
          : `<div class="acct-pull-empty">
              <span class="acct-slot" aria-hidden="true"></span><span class="acct-slot" aria-hidden="true"></span><span class="acct-slot" aria-hidden="true"></span>
              <p>Nothing pulled yet. <button class="tlink" type="button" data-goto="shop">Rip a pack</button></p>
            </div>`
      }
    </section>
    <section class="acct-sec acct-sets" aria-labelledby="acct-sets-h">
      <div class="ground-h">
        <h2 id="acct-sets-h">Set completion</h2>
        <span>${num(started)} of ${num(PLAYABLE_SETS.length)} started</span>
      </div>
      ${setRings()}
    </section>
    </div>
    <div class="acct-col">
    <section class="plate acct-career" aria-labelledby="acct-career-h">
      <div class="plate-head">
        <h2 id="acct-career-h">Career</h2>
      </div>
      ${careerLedger()}
    </section>
    <section class="acct-sec acct-next" aria-labelledby="acct-next-h">
      <div class="ground-h">
        <h2 id="acct-next-h">Closest badges</h2>
        <button class="tlink" type="button" data-acct-tab="achievements">All ${num(stats.total)}</button>
      </div>
      ${
        nextUp.length
          ? `<ol class="rows next-list">${nextUp
              .map(
                ({ row, p }) => `<li class="next-row t${row.tier}">
                  ${questArea.miniMedal(row, p.pct, areaDeps)}
                  <div class="next-copy">
                    <div class="next-head"><b>${esc(row.name)}</b><span class="price">${coinAmount(row.coins)}</span></div>
                    <small>${esc(row.note)}${row.title ? ` Unlocks the ${esc(row.title)} title.` : ""}</small>
                    <div class="next-prog"><span class="bar" aria-hidden="true"><i style="width:${p.pct}%"></i></span><span>${num(p.at)} of ${num(p.goal)}</span></div>
                  </div>
                </li>`
              )
              .join("")}</ol>`
          : `<p class="panel-empty">You've earned every badge.</p>`
      }
    </section>
    </div>
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

/** Name, handle and bio. */
function aboutTab(trainer) {
  return `<section class="acct-sec">
      <div class="acct-sec-head"><h2>Name and bio</h2></div>
      <form id="profile-form" class="acct-form">
        <label class="field"><span>Trainer name</span><input name="name" minlength="2" maxlength="24" value="${esc(trainer.name)}" required /></label>
        <label class="field"><span>Handle</span><span class="field-at"><input name="handle" minlength="3" maxlength="16" value="${esc(trainer.handle)}" required autocapitalize="off" spellcheck="false" /></span>
          <span class="hint">Your profile lives at poke-pack.rip/u/${esc(trainer.handle)}.</span>
        </label>
        <label class="field"><span>Bio</span><textarea name="bio" maxlength="160" placeholder="What are you chasing?">${esc(trainer.bio || "")}</textarea></label>
        <p class="form-error" id="profile-error" role="alert"></p>
        <button class="solid" type="submit">Save</button>
      </form>
    </section>`;
}

/** The public page: its room and sections (js/profile-editor.js), then what it shares and the cards pinned to it. */
function pageTab(trainer) {
  const shown = new Set(trainer.shownStats || DEFAULT_STATS);
  const showcase = trainer.showcase || [];
  const room = roomLine("showcase", unlockOf(trainer), showcase.length, SHOWCASE_MAX);
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
  return `${profileEditor.layoutTab(trainer, layoutDeps())}
  <div class="acct-cols page-extras">
    <section class="acct-sec">
      <div class="acct-sec-head"><div><h2>Shared figures</h2><p>The numbers visitors see under your name. These save as you tick them.</p></div></div>
      <div class="stat-toggles">${STAT_KEYS.map(
        (key) => `<label><input type="checkbox" data-stat-toggle="${key}" ${shown.has(key) ? "checked" : ""} /> ${esc(statLabel(key))}</label>`
      ).join("")}</div>
    </section>
    <section class="acct-sec acct-pins">
      <div class="acct-sec-head">
        <div>
          <h2>Showcase</h2>
          <p>${showcase.length} of ${room.cap} pinned.${room.more}</p>
        </div>
      </div>
      ${pinned ? `<div class="pin-row">${pinned}</div>` : `<p class="panel-empty">Open a card you own and choose Pin to showcase it here.</p>`}
    </section>
  </div>`;
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

/** Your Pokémon (js/avatar-picker.js) and the colour of the ring behind it. */
function pictureTab(trainer) {
  return `<section class="acct-sec av-sec">
      <div class="acct-sec-head"><h2>Picture</h2></div>
      ${avatarPickerHtml(trainer)}
    </section>
    <section class="acct-sec">
      <div class="acct-sec-head"><h2>Ring colour</h2></div>
      ${colorPicks(trainer.color, "data-profile-color", "Ring colour")}
    </section>`;
}

function frameTab(trainer) {
  return `<section class="acct-sec">
      <div class="acct-sec-head"><h2>Frame</h2></div>
      ${framePicksHtml({
        level: unlockOf(trainer),
        prestige: trainer.prestige || 0,
        beta: Boolean(trainer.beta || cloudUser?.beta),
        frame: trainer.frame,
        color: avatarColor(trainer.color).hex,
        avatar: faceHtml({ ...trainer, online: false }, "md", { frame: false }),
      })}
    </section>`;
}

function bannerTab(trainer, stats) {
  const banner = parseBanner(trainer.banner);
  const onMastery = Boolean(banner.set);
  return `<section class="acct-sec">
      <div class="acct-sec-head"><h2>Banner</h2></div>
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
    </section>`;
}

function titleTab(trainer) {
  const ctx = titleContext(state, { signed: true, findCard, rarities: ownedRarities(), level: state.xp?.peak ?? state.xp?.level ?? unlockOf(cloudUser) });
  const unlocked = new Set(unlockedTitles(ctx).map((row) => row.name));
  return `<section class="acct-sec">
      <div class="acct-sec-head">
        <div>
          <h2>Title</h2>
          <p>${unlocked.size} of ${TITLES.length - questArea.hiddenTitles(TITLES, unlocked, areaDeps).length} unlocked.</p>
        </div>
      </div>
      <div class="title-groups">${questArea.titleGroupsHtml(TITLES, trainer.title, unlocked, areaDeps)}</div>
    </section>`;
}

/* ---- Security ----------------------------------------------------------- */

/* Recovery code: shown once right after it's made; otherwise only whether one exists. */
let recoveryInfo = { loaded: false, createdAt: 0, code: "" };

async function loadRecoveryInfo() {
  try {
    const res = await api("/api/me/recovery");
    recoveryInfo = { loaded: true, createdAt: Number(res.createdAt) || 0, code: recoveryInfo.code };
  } catch {
    recoveryInfo = { ...recoveryInfo, loaded: true };
  }
  if (view === "account" && accountTab === "security") renderAccount();
}

/* The tab itself is js/account-security.js; the recovery code state above stays here. */
function securityTab(trainer) {
  return securityTabHtml(trainer);
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
        ? `<button class="solid" type="button" data-open-auth="signup">Make your own trainer</button><button class="text-btn" type="button" data-open-auth="signin">Sign in to add ${esc(user.name)}</button>`
        : mine
          ? `<a class="ghost" href="/account">Edit profile</a>`
          : data.relation === "friends"
            ? `<button class="ghost" type="button" data-open-dm="${esc(user.handle)}">Message</button><a class="ghost" href="/trades/new/${esc(user.handle)}">Trade</a><button class="text-btn" type="button" data-friend-remove="${esc(user.handle)}">Unfriend</button>`
            : (data.relation === "pending-out"
              ? `<button class="ghost" type="button" disabled>Request sent</button>`
              : data.relation === "pending-in"
                ? `<button class="solid" type="button" data-friend-accept="${esc(user.handle)}">Accept friend</button>`
                : `<button class="solid" type="button" data-friend-add="${esc(user.handle)}">Add friend</button>`) + `<a class="ghost" href="/trades/new/${esc(user.handle)}">Trade</a>`; // trades

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
    // Their best places on the boards (js/rankings.js), under the name once it's known.
    standingLine(api, user.handle).then((line) => {
      const meta = els.profileBody.querySelector(".profile-copy .acct-meta");
      if (!line || !meta || view !== "profile" || profileHandle !== handle || meta.nextElementSibling?.classList.contains("profile-rank")) return;
      meta.insertAdjacentHTML("afterend", `<p class="profile-rank"><a href="/rankings">${esc(line)}</a></p>`);
    });
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
// The picture picker saves in place: only the header and the small trainer card are redrawn, so the grid never jumps.
initAvatarPicker({
  root: () => els.accountBody,
  trainer: activeTrainer,
  esc,
  toast,
  api,
  save: async (patch) => {
    const data = await api("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
    cloudUser = data.user;
    renderHeader();
    repaintLookCard();
  },
});
// A picture that fails to load (a sprite the art repo has lost) steps down to a plainer one of the same Pokémon.
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.avFell) return;
  const next = avatarFallback(img.src);
  if (!next) return;
  img.dataset.avFell = "1";
  img.src = next;
}, true);

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

/**
 * The Social page: the title and its words (js/social-hub.js), then the
 * chosen part. The pane is kept between renders of the same part, so the
 * rankings keep their picks and a half-typed message survives a refresh.
 */
function socialPane(key) {
  const body = els.socialBody;
  const incoming = activeTrainer() ? currentFriends().incoming.length : 0;
  const head = hubHeadHtml(key, { friends: incoming, trades: currentFriends().trades });
  if (body.dataset.tab !== key || !body.querySelector(":scope > .hub-pane")) {
    // Moving between Friends, Rankings and the Lounge: the plate grows under the new word and the part rises in.
    const moved = Boolean(body.dataset.tab) && body.dataset.tab !== key;
    body.dataset.tab = key;
    body.innerHTML = `${head}<div class="hub-pane" data-pane="${key}"></div>`;
    if (moved) {
      body.classList.remove("is-switch");
      void body.offsetWidth;
      body.classList.add("is-switch");
      clearTimeout(Number(body.dataset.switchTimer) || 0);
      body.dataset.switchTimer = String(setTimeout(() => body.classList.remove("is-switch"), 700));
    }
  } else {
    // A count that changed (a friend request landed) bumps.
    const was = new Map([...body.querySelectorAll(":scope > .hub-head .hub-word")].map((a) => [a.getAttribute("href"), a.querySelector(".hub-count")?.textContent || ""]));
    body.querySelector(":scope > .hub-head").outerHTML = head;
    body.querySelectorAll(":scope > .hub-head .hub-count").forEach((b) => {
      if (was.get(b.parentElement.getAttribute("href")) !== b.textContent) b.classList.add("is-bump");
    });
  }
  return body.querySelector(":scope > .hub-pane");
}

function renderLoungePane(pane) {
  if (!pane.querySelector("#social-chat-log")) {
    pane.innerHTML = `<div class="hub-lounge">
      <section class="lounge-panel hub-chat" aria-labelledby="social-chat-h">
        <div class="lounge-head"><h3 id="social-chat-h">Global chat</h3><span>Everyone can see this</span></div>
        <div class="chat-log" id="social-chat-log"></div>
        <form class="chat-form" id="social-chat-form">
          <input name="body" maxlength="180" placeholder="Say something to everyone" autocomplete="off" enterkeyhint="send" aria-label="Message the whole site" />
          <button class="solid" type="submit">Send</button>
        </form>
      </section>
      <section class="lounge-panel hub-online" aria-labelledby="social-online-h">
        <div class="lounge-head"><h3 id="social-online-h">Online now</h3><span><i class="live-dot" aria-hidden="true"></i><b id="social-online-count">0</b> on</span></div>
        <div class="online-list" id="social-online-list"></div>
      </section>
    </div>`;
  }
  paintLounge();
  refreshLounge().catch(() => {});
}

async function renderSocial() {
  const body = els.socialBody;
  if (!body) return;
  const trainer = activeTrainer();
  if (socialTab === "rankings") {
    const pane = socialPane("rankings");
    rankingsDrawnAt = Date.now();
    renderRankings(pane, { api, faceHtml, levelTag, user: () => activeTrainer() });
    return;
  }
  if (socialTab === "lounge") {
    renderLoungePane(socialPane("lounge"));
    return;
  }
  if (!trainer) {
    socialPane("friends").innerHTML = `<div class="social-gate">
      <i class="soc-ball" aria-hidden="true"></i>
      <p>Sign in to add friends and message them. Rankings and the lounge are open to everyone.</p>
      <div class="social-gate-actions">
        <button class="solid" type="button" data-open-auth="signin">Sign in</button>
        <button class="ghost" type="button" data-open-auth="signup">Create account</button>
      </div>
    </div>`;
    return;
  }
  const paneEl = socialPane("friends");
  const draft = body.querySelector("#dm-form [name=body]")?.value || "";
  // Rows that were not on the last paint (a request that just came in, a new friend) land; the first paint deals them all in.
  const hadRows = paneEl.querySelector(".social-grid") ? new Set([...paneEl.querySelectorAll("[data-h]")].map((el) => el.dataset.h)) : null;
  const landed = (key) => (hadRows && !hadRows.has(key) ? " is-new" : "");
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
        const live = online.has(row.user.handle);
        return `<div class="dm-thread${on ? " on" : ""}${live ? " is-live" : ""}${landed(`dm:${row.user.handle}`)}" data-h="dm:${esc(row.user.handle)}">
          <a class="dm-thread-go" href="/social/${esc(row.user.handle)}"${on ? ` aria-current="page"` : ""}>
            <span class="dm-lab">${faceHtml({ ...row.user, online: live }, "sm")}</span>
            <span class="dm-copy"><b>${levelTag(row.user)}<span class="dm-name">${esc(row.user.name)}</span></b><small>${live ? `<i class="live-dot" aria-hidden="true"></i><em class="live-word">Online</em> ` : ""}${preview}</small></span>
            ${row.last ? `<time>${esc(formatWhen(row.last.at))}</time>` : ""}
          </a>
          <a class="ghost sm dm-trade" href="/trades/new/${esc(row.user.handle)}" aria-label="Trade with @${esc(row.user.handle)}">Trade</a>
        </div>`;
      })
      .join("");
    const { incoming, outgoing } = currentFriends();
    const incomingRows = incoming
      .map(
        (row) => `<div class="friends-row is-ask${landed(`ask:${row.handle}`)}" data-h="ask:${esc(row.handle)}">
          <a href="/u/${esc(row.handle)}"><span class="dm-lab">${faceHtml(row, "sm")}</span><span class="dm-copy"><b>${levelTag(row)}<span class="dm-name">${esc(row.name)}</span></b><small>@${esc(row.handle)}</small></span></a>
          <div class="friends-row-actions">
            <button type="button" class="ghost sm" data-friend-accept="${esc(row.handle)}">Accept</button>
            <button type="button" class="text-btn" data-friend-deny="${esc(row.handle)}">Decline</button>
          </div>
        </div>`
      )
      .join("");
    const outgoingRows = outgoing
      .map(
        (row) => `<div class="friends-row dim${landed(`out:${row.handle}`)}" data-h="out:${esc(row.handle)}">
          <a href="/u/${esc(row.handle)}"><span class="dm-lab">${faceHtml(row, "sm")}</span><span class="dm-copy"><b>${levelTag(row)}<span class="dm-name">${esc(row.name)}</span></b><small>Request sent</small></span></a>
        </div>`
      )
      .join("");
    const requests =
      (incomingRows ? `<p class="friends-label">Requests</p><div class="social-requests">${incomingRows}</div>` : "") +
      (outgoingRows ? `<p class="friends-label">Waiting on them</p><div class="social-requests">${outgoingRows}</div>` : "");
    // Lines that arrived since the last paint of this thread rise in; a thread just opened does not replay.
    const allMsgs = thread?.messages || [];
    const sameThread = dmSeen.handle === dmHandle;
    const seenBefore = sameThread ? dmSeen.n : allMsgs.length;
    dmSeen = { handle: dmHandle, n: allMsgs.length };
    const messages = allMsgs
      .map(
        (msg, i) => `<div class="dm-line${msg.mine ? " mine" : ""}${i >= seenBefore ? " is-new" : ""}"><span>${esc(msg.body)}</span><time>${esc(formatWhen(msg.at))}</time></div>`
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
              <span class="dm-lab">${faceHtml({ ...thread.user, online: online.has(thread.user.handle) }, "sm")}</span>
              <span class="dm-copy"><b>${levelTag(thread.user)}<span class="dm-name">${esc(thread.user.name)}</span></b><small>${online.has(thread.user.handle) ? `<i class="live-dot" aria-hidden="true"></i><em class="live-word">Online now</em>` : `@${esc(thread.user.handle)}`}</small></span>
            </a>
            <a class="text-btn dm-profile" href="/u/${esc(thread.user.handle)}">Profile</a>
          </div>
          <div class="dm-log" id="dm-log">${
            messages || `<p class="dm-empty"><i class="soc-ball" aria-hidden="true"></i>Send ${esc(thread.user.name)} the first message.</p>`
          }</div>
          <form class="dm-form" id="dm-form">
            <input name="body" maxlength="220" placeholder="Message ${esc(thread.user.name)}" autocomplete="off" aria-label="Message ${esc(thread.user.name)}" />
            <button class="solid" type="submit">Send</button>
          </form>`
        : `<div class="dm-idle">
            <i class="soc-ball" aria-hidden="true"></i>
            <p><b>Pick a friend</b>Your messages with them open here.</p>
          </div>`;
    const fresh = !paneEl.querySelector(".social-grid");
    // A refresh keeps the place in a thread that was scrolled up to read; only a reader at the newest line follows new ones.
    const oldLog = paneEl.querySelector("#dm-log");
    const keepTop = sameThread && !dmStick && oldLog && oldLog.scrollHeight - oldLog.scrollTop - oldLog.clientHeight > 48 ? oldLog.scrollTop : null;
    dmStick = false;
    paneEl.innerHTML = `
      <div class="hub-me">
        <a class="hub-me-who" href="/u/${esc(trainer.handle)}">
          <span class="dm-lab">${faceHtml(trainer, "md")}</span>
          <span class="dm-copy"><b>${levelTag(trainer)}<span class="dm-name">${esc(trainer.name)}</span></b><small>@${esc(trainer.handle)}</small></span>
        </a>
        <a class="hub-me-rank tlink" id="hub-me-rank" href="/rankings">Rankings</a>
      </div>
      <div class="social-grid${thread && !thread.error ? " has-thread" : ""}${fresh ? " is-fresh" : ""}">
        <aside class="social-friends" aria-label="Friends">
          <form class="friends-add social-add" id="social-add">
            <input name="handle" maxlength="17" placeholder="Add a friend by @handle" autocapitalize="off" spellcheck="false" aria-label="Add a friend by handle" />
            <button class="solid" type="submit">Add</button>
          </form>
          ${requests}
          ${requests || list ? `<p class="friends-label">Friends</p>` : ""}
          <nav class="dm-threads" aria-label="Messages">${
            list || `<div class="soc-empty"><i class="soc-ball" aria-hidden="true"></i><p><b>No friends yet</b>Add a trainer by handle above, or tap a name in the Lounge chat.</p></div>`
          }</nav>
        </aside>
        <section class="dm-pane" aria-label="Messages">${pane}</section>
      </div>
      <section class="trade-soon" aria-labelledby="trade-title">
        <div class="trade-copy">
          <h2 id="trade-title">Trading</h2>
          <p>Swap cards, slabs and coins with any trainer. ${currentFriends().trades ? `${currentFriends().trades === 1 ? "One offer is" : `${currentFriends().trades} offers are`} waiting on you.` : "Friends can send each other gifts too."}</p>
          <a class="ghost sm" href="/trades">Open trades</a>
        </div>
        <div class="trade-slips" aria-hidden="true">
          <span class="trade-slot"><i class="soc-ball"></i></span>
          <svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
          <span class="trade-slot"><i class="soc-ball"></i></span>
        </div>
      </section>`;
    standingLine(api, trainer.handle).then((line) => {
      const rank = paneEl.querySelector("#hub-me-rank");
      if (rank && line) rank.textContent = line;
    });
    const log = body.querySelector("#dm-log");
    if (log) log.scrollTop = keepTop == null ? log.scrollHeight : keepTop;
    const form = body.querySelector("#dm-form");
    const input = form?.querySelector("[name=body]");
    if (input && draft) input.value = draft;
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = String(new FormData(form).get("body") || "").trim();
      if (!text || !dmHandle) return;
      try {
        await api("/api/dms", { method: "POST", body: JSON.stringify({ handle: dmHandle, body: text }) });
        // Clear the box first: the repaint keeps whatever is typed as a draft.
        if (input) input.value = "";
        dmStick = true;
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
    paneEl.innerHTML = `<p class="panel-empty">${esc(err.message || "Couldn't load your messages.")} Refresh the page to try again.</p>`;
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
    title: "Look",
    rows: [
      {
        key: "theme",
        type: "choice",
        label: "Light or dark",
        note: "Dark turns the page to ink with light lines. Device follows your phone or computer.",
        options: [
          ["light", "Light"],
          ["dark", "Dark"],
          ["device", "Device"],
        ],
      },
      { type: "themes" },
    ],
  },
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
      { key: "lite", type: "toggle", label: "Lite", note: "Turns off card shine, tilt, idle shimmer and hit effects in one go, for older phones. The same switch sits at the top of the screen." },
      { key: "shine", type: "toggle", label: "Card shine", note: "Gloss highlight that follows your cursor across a card." },
      { key: "tilt", type: "toggle", label: "Card tilt", note: "Cards lean toward your finger or cursor in 3D." },
      { key: "stamps", type: "toggle", label: "Rarity stamps", note: "A small rarity mark in the corner of each card." },
      { key: "motion", type: "toggle", label: "Idle shimmer", note: "The card you just pulled, or opened to look at, moves its own light for a while when you're not touching it." },
      { key: "phoneTilt", type: "toggle", label: "Tilt your phone", note: "Lean your phone to move the light on the card you pulled or opened, like turning a real card. Your phone asks before it shares its motion. Phones and tablets only." },
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
  if (row.type === "themes") return themeRow();
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

/* The colour themes: one flat tile each, drawn in its own colours (the tile
   carries data-palette, so css/themes.css paints it). A locked theme shows a
   lock and can't be chosen (js/themes.js). */
function themeRow() {
  const chosen = resolveLook(state.settings, { unlocked: unlockedThemes() }).theme.id;
  const tiles = THEMES.map((t) => {
    const open = canUseTheme(t.id, unlockedThemes());
    return `<button type="button" class="look-tile${t.id === chosen ? " on" : ""}${open ? "" : " is-locked"}"
        data-palette="${t.id}" data-look="${t.id}" aria-pressed="${t.id === chosen}"${open ? "" : ' aria-disabled="true"'}>
        <span class="look-swatch" aria-hidden="true"><i class="look-slab"></i><i class="look-box"></i><i class="look-key"></i></span>
        <span class="look-name">${esc(t.name)}${open ? "" : '<span class="sr-only">, locked</span>'}</span>
      </button>`;
  }).join("");
  return `<div class="set-row look-row">
      <span class="set-copy">
        <b>Colours</b>
        <small>Same menu, a whole new coat of paint. Rotom follows Light or dark above, the others bring their own.</small>
      </span>
      <div class="look-tiles" role="group" aria-label="Colours">${tiles}</div>
    </div>`;
}

/** Theme ids this player has unlocked. Nothing is locked yet, so nothing is stored. */
function unlockedThemes() {
  return [];
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

/* Settings: one plate per group, its rows split by hairlines (label and note on
   the left, the switch or the keys on the right). Two columns of plates from 961px. */
function renderSettings() {
  const changed = changedSettingCount();

  const group = (title, rows, extra = "") => `<section class="plate set-group${extra}">
      <header class="plate-head">
        <h2>${esc(title)}</h2>
      </header>
      <div class="set-list">${rows}</div>
    </section>`;

  const groups = SETTING_GROUPS.map((g) => group(g.title, g.rows.map(settingRow).join(""))).join("");
  // The Discord feed choice lives on the account (the server decides what gets posted), so it only shows when signed in.
  const feedRow = activeTrainer()
    ? `<label class="set-row toggle-row">
        <span class="set-copy">
          <b>Share big pulls on Discord</b>
          <small>A pull worth $100 or more, a Special Illustration Rare or better, or a Black Label 10 is posted in our Discord with your handle. Turn it off to stay out of the feed.</small>
        </span>
        <input type="checkbox" data-feed-share ${activeTrainer().feedShare === false ? "" : "checked"} />
        <i class="switch" aria-hidden="true"></i>
      </label>`
    : "";
  const community = group(
    "Community",
    `${feedRow}<div class="set-row">
        <span class="set-copy">
          <b>Our Discord</b>
          <small>Chat, show off pulls and report bugs.</small>
        </span>
        <a class="tlink" href="/discord" target="_blank" rel="noopener">Join the Discord</a>
      </div>
      <div class="set-row">
        <span class="set-copy">
          <b>The tour</b>
          <small>A 30-second look at where everything is.</small>
        </span>
        <button class="tlink" type="button" data-tour-start>Take the tour</button>
      </div>`
  );
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
      <button class="tlink" id="reset-settings" type="button" ${changed ? "" : "disabled"}>Restore defaults</button>
    </div>
    <div class="set-groups">${groups}${community}${progress}</div>`;
}

// The look: light or dark, and the colour theme. The choice is mirrored to
// localStorage so the inline script in index.html can paint the right ground
// before the save has loaded.
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const look = resolveLook(state.settings, { prefersDark: darkQuery.matches, unlocked: unlockedThemes() });
  const root = document.documentElement;
  root.dataset.theme = look.dark ? "dark" : "light";
  if (look.theme.id === "rotom") delete root.dataset.palette;
  else root.dataset.palette = look.theme.id;
  root.style.backgroundColor = "";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", look.ground);
  try {
    localStorage.setItem("pp-look", JSON.stringify({ mode: look.theme.mode || look.mode, palette: look.theme.id, light: look.theme.ground.light, dark: look.theme.ground.dark }));
  } catch {}
}
darkQuery.addEventListener?.("change", applyTheme);

function applySettings() {
  applyTheme();
  const { shine, tilt, stamps, motion, flash, foil, binder, fx, lite } = state.settings;
  // Exactly one foil engine paints at a time; css/holo/ and the .tcg foil
  // rules in app.css both target the same two layers, so they cannot overlap.
  document.body.classList.toggle("fx-holo", fx !== "classic");
  document.body.classList.toggle("fx-classic", fx === "classic");
  // Lite (the HUD switch) turns the expensive effects off without touching the settings underneath.
  document.body.classList.toggle("lite", Boolean(lite));
  document.body.classList.toggle("no-shine", !shine || Boolean(lite));
  document.body.classList.toggle("no-tilt", !tilt || Boolean(lite));
  document.body.classList.toggle("no-stamps", !stamps);
  document.body.classList.toggle("no-motion", !motion || Boolean(lite));
  // The loading screen reads this before anything else runs (index.html), so it can lie still too.
  try {
    localStorage.setItem("pp-calm", !motion || lite ? "1" : "0");
  } catch {
    /* private mode */
  }
  document.body.classList.toggle("no-flash", !flash || Boolean(lite));
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
  tcg: "viewTcg",
  wishlist: "viewWishlist",
  casino: "viewCasino",
  grading: "viewGrading", // grading
  trades: "viewTrades", // trades
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
  legal: "viewLegal",
  social: "viewSocial",
};

const VIEW_PATHS = {
  home: "/home",
  shop: "/packs",
  battles: "/battles",
  gear: "/gear",
  tcg: "/play",
  wishlist: "/wishlist",
  casino: "/casino",
  grading: "/grading", // grading
  trades: "/trades", // trades
  cart: "/cart",
  vault: "/bulk/sealed",
  collection: "/bulk",
  binder: "/binder",
  catalog: "/packs",
  account: "/account",
  profile: "/u",
  auth: "/signin",
  settings: "/settings",
  notes: "/notes",
  legal: "/legal",
  social: "/social",
};

const PATH_VIEWS = {
  "/": "home",
  "/home": "home",
  "/index.html": "home",
  "/packs": "catalog",
  "/battles": "battles",
  "/gear": "gear",
  "/sleeves": "gear",
  "/coins": "gear",
  "/wishlist": "wishlist",
  "/favourites": "wishlist",
  "/favorites": "wishlist",
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
  "/rankings": "social",
  "/leaderboard": "social",
  "/leaderboards": "social",
  "/lounge": "social",
  "/chat": "social",
};

const VIEW_TITLES = {
  home: "poke-pack.rip | rip packs, fill the binder",
  shop: "Packs | poke-pack.rip",
  battles: "Pack battles | poke-pack.rip",
  gear: "Sleeves & coins | poke-pack.rip",
  tcg: "Play | poke-pack.rip",
  wishlist: "Wishlist | poke-pack.rip",
  casino: "Casino | poke-pack.rip",
  grading: "Grading | poke-pack.rip", // grading
  trades: "Trades | poke-pack.rip", // trades
  cart: "Cart | poke-pack.rip",
  vault: "Sealed collection | poke-pack.rip",
  collection: "Collection | poke-pack.rip",
  binder: "Binder | poke-pack.rip",
  catalog: "Packs | poke-pack.rip",
  account: "Account | poke-pack.rip",
  profile: "Trainer | poke-pack.rip",
  auth: "Sign in | poke-pack.rip",
  settings: "Settings | poke-pack.rip",
  notes: "Patch notes | poke-pack.rip",
  legal: "Legal | poke-pack.rip",
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
  tcg: () => showTcg(),
  wishlist: async () => {
    if (!Object.keys(productList).length) await loadSealedPrices();
    wishlist.show();
  },
  casino: () => casino.show(casinoPath),
  grading: () => grading.show(gradingPath), // grading
  trades: () => trades.show(tradesPath), // trades
  cart: () => cartPage.show(cartPath),
  vault: () => vaultPage.show(vaultPath),
  collection: () => renderCollection(),
  binder: () => renderBinder(),
  catalog: () => renderCatalog(),
  account: () => {
    acctArriving = true;
    renderAccount();
  },
  profile: () => renderProfile(),
  auth: () => renderAuth(),
  settings: () => renderSettings(),
  notes: () => renderNotes(),
  legal: () => renderLegalPage(els.legalBody, legalDoc),
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
  if (GRADING_ROUTE.test(path) || CERT_ROUTE.test(path)) {
    // The public cert pages (/cert, /cert/<number>) live on the grading page too.
    gradingPath = path;
    return "grading";
  }
  // trades: /trades, /trades/new/<handle>[/<offer id>], /trades/<offer id>
  if (TRADES_ROUTE.test(path)) {
    tradesPath = path.toLowerCase();
    return "trades";
  }
  // The card game (js/tcg-page.js): /play, /play/deck/<id>, /play/match, /play/friends, /play/online/<id>. Not in any menu yet.
  if (TCG_ROUTE.test(path)) {
    tcgPath = path;
    return "tcg";
  }
  // Account > Security, and the way back from linking Discord (js/account-security.js finishes it).
  if (path === "/account/security" || path === "/account/discord") {
    accountTab = "security";
    return "account";
  }
  const legal = path.match(/^\/(terms|privacy|legal)$/);
  if (legal) {
    legalDoc = legal[1];
    return "legal";
  }
  if (PATH_VIEWS[path]) {
    if (PATH_VIEWS[path] === "social") {
      dmHandle = "";
      socialTab = socialTabFromPath(path) || "friends";
    }
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
    socialTab = "friends";
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
  if (view === "social" && socialTab === "rankings") return "Rankings | poke-pack.rip";
  if (view === "social" && socialTab === "lounge") return "Lounge | poke-pack.rip";
  if (view === "social" && dmHandle) return `DM @${dmHandle} | poke-pack.rip`;
  if (view === "shop") return `${kitOf(liveSet)?.name || `${liveSet.name} packs`} | poke-pack.rip`;
  if (view === "legal") return `${LEGAL_TITLES[legalDoc]} | poke-pack.rip`;
  return VIEW_TITLES[view] || VIEW_TITLES.home;
}

function pathForView(name) {
  if (name === "battles") return battlePath;
  if (name === "casino") return casinoPath;
  if (name === "grading") return gradingPath; // grading
  if (name === "trades") return tradesPath; // trades
  if (name === "tcg") return tcgPath;
  if (name === "profile") return profilePath(profileHandle || "trainer", profilePageWanted);
  if (name === "shop") return `/packs/${liveSet.id}`;
  if (name === "social") return socialTab === "rankings" ? "/rankings" : socialTab === "lounge" ? "/lounge" : dmHandle ? `/social/${dmHandle}` : "/social";
  if (name === "legal") return `/${legalDoc}`;
  return VIEW_PATHS[name] || "/home";
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Each view's area, (body[data-area]): Packs, Collection, Casino, Community or You. */
const VIEW_AREA = {
  collection: "coll", vault: "coll", binder: "coll", grading: "coll", gear: "coll",
  casino: "casino", battles: "casino",
  social: "comm", rankings: "comm", trades: "comm",
  account: "you", auth: "you", profile: "you", settings: "you", notes: "you",
};

/** On a computer the header is a side menu, so its list of pages stays open. */
const railQuery = window.matchMedia("(min-width: 961px)");
function keepRailOpen() {
  const more = document.querySelector(".site-header .nav-more");
  if (more) more.open = railQuery.matches;
}
railQuery.addEventListener?.("change", keepRailOpen);

function paintNav(current) {
  const navView =
    current === "auth" || current === "profile" ? "account" : current === "battles" ? "casino" : current === "vault" || current === "binder" ? "collection" : current === "shop" ? "catalog"
      : current === "social" && socialTab === "rankings" ? "rankings" : current;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    let on = btn.dataset.view === navView || (current === "social" && btn.dataset.view === "social" && !btn.closest(".nav-more-list"));
    // A game's own menu entry lights only on that game; the Casino entry stays lit for the whole area.
    if (btn.dataset.casino) on = current === "casino" && casinoPath.startsWith(btn.dataset.casino);
    else if (btn.dataset.view === "battles") on = current === "battles";
    btn.classList.toggle("active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

function applyView(next, hist) {
  if (next !== "battles") battles.hide();
  if (next !== "casino") casino.hide();
  if (next !== "grading") grading.hide(); // grading
  if (next !== "trades") trades.hide(); // trades
  if (next !== "profile") profileView.leaveProfileRoom(); // the room's tint and backdrop belong to the profile only
  if (next !== "cart") cartPage.hide();
  if (next !== "tcg") tcgPage?.hide();
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
  keepRailOpen();
  document.body.dataset.area = VIEW_AREA[view] || "packs";
  document.body.dataset.view = view; // css/rotom.css and js/rotom.js key off the page
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
  // The rankings keep their picks in the query; it doesn't follow you off the page.
  const url = want + (have === "/rankings" && want !== "/rankings" ? "" : location.search);
  if (hist === "replace") history.replaceState({ view }, "", url);
  else history.pushState({ view }, "", url);
}

function setView(next, { history: hist = "push", handle } = {}) {
  if (!VIEW_SECTIONS[next]) return;
  if (next === "social" && handle != null) {
    dmHandle = String(handle || "").replace(/^@/, "").toLowerCase();
    socialTab = "friends";
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

/** The two lines beside Leave: the set, then the wrapper (in a box, which of its packs this is). */
function paintWhere() {
  const run = sealedRun;
  const set = (run && run.index < 0 ? run.packs[0]?.set || run.set : packSet) || liveSet;
  const product = run ? run.product.short || run.product.name : "";
  const [name, under] =
    run && packPhase === "summary"
      ? [(run.set || set).name, run.product.name]
      : run
        ? [set.name, run.index < 0 ? run.product.name : `${product}, pack ${run.index + 1} of ${run.packs.length}`]
        : [set.name, activeWrapper?.name ? `${activeWrapper.name} wrapper` : ""];
  els.opWhere.innerHTML = `<span>${esc(name)}</span>${under ? `<small>${esc(under)}</small>` : ""}`;
  paintPurse();
}

/** The coins beside it, as the HUD prints them. */
function paintPurse() {
  els.opPurse.innerHTML = coinAmount(state.coins);
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

/** "Special Illustration Rare, 116/084": the rarity, the foil when it is a reverse, the number. */
function pullLine(card) {
  const label = RARITY_LABEL[card.rarity] || card.rarity || "";
  const foil = foilWord(card);
  const variant =
    (card.promo || card.energy) && card.variant ? card.variant : card.pattern ? RARITY_LABEL[card.printedRarity] || card.printedRarity : "";
  const no = numberLine(card);
  return [label, variant, foil, no === "Energy" ? "" : no].filter(Boolean).join(", ");
}

/**
 * The facts under a turned card: the set's count, the artist, and for a
 * chase rarity how often a pack holds one. The collection already holds the
 * whole pack, so the count only climbs as each new card turns. The pips under
 * the bar show what is left in the pack.
 */
function pullFactsHtml(pull) {
  const facts = [];
  if ((packSet || liveSet) === liveSet) {
    const done = completion();
    const fresh = new Set(currentPulls.filter((card) => card.wasNew).map((card) => card.id));
    const turned = new Set(currentPulls.filter((card) => card.wasNew && card.revealed).map((card) => card.id));
    if (done.total) facts.push(["Collection", `${num(Math.max(0, done.owned - fresh.size + turned.size))} / ${num(done.total)}`]);
  }
  if (pull.artist) facts.push(["Illustrated by", pull.artist]);
  const odds = pullOdds(pull);
  if (odds) facts.push(["Odds", odds]);
  return `<dl class="focus-facts">${facts
    .map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`)
    .join("")}</dl>`;
}

/** The type badge a rarity wears (css/rotom.css .rt-type): its colour family. */
function pullTy(card) {
  const r = String(card?.rarity || "");
  if (card?.promo || r === "Promo") return "promo";
  if (r === "Special Illustration Rare") return "sir";
  if (r === "Illustration Rare" || r === "Trainer Gallery Rare Holo" || r === "Classic Collection") return "illus";
  if (/Hyper|Rainbow|Gold Star|Holo Star/.test(r)) return "hyper";
  if (/Secret|Black White|Futuristic|RGB|Master Ball|Crystal/.test(r)) return "secret";
  if (/Ultra|Mega Attack|Amazing|Radiant|Shiny|Shining|ACE/.test(r)) return "ultra";
  if (/Double|V$|VMAX|VSTAR|GX|EX|BREAK|LV\.X|Prime|LEGEND|Prism/.test(r)) return "double";
  if (/Holo|Rotom|Arceus|Unown|Pikachu/.test(r)) return "holo";
  if (r === "Rare" || r === "Poké Ball") return "rare";
  if (r === "Uncommon") return "uncommon";
  return "common";
}

/** "138/103, Delta Reign": what follows the rarity badge, the foil when it is a reverse, the number and the set. */
function pullRest(card) {
  const foil = foilWord(card);
  const variant =
    (card.promo || card.energy) && card.variant ? card.variant : card.pattern ? RARITY_LABEL[card.printedRarity] || card.printedRarity : "";
  const no = numberLine(card);
  return [variant, foil, no === "Energy" ? "" : no, (packSet || liveSet)?.name].filter(Boolean).join(", ");
}

/** Kanit 700's figure widths (em), 0 to 9: the odometer's windows. */
const ODO_W = Array(10).fill(0.6); // the site's figures share one width ("Kanit Tab", css/rotom.css)

/**
 * A card's value as a counter that rolls up from zero as the card lands (css
 * .odo): each figure is a strip of digits, the pennies spinning most and the
 * strips stopping left to right. A hit spins long; anything else just ticks.
 */
function rollingValueHtml(value, tier) {
  const text = coinText(value);
  const total = text.replace(/\D/g, "").length;
  let seen = 0;
  const figures = [...text].map((ch) => {
    if (!/\d/.test(ch)) return `<span class="odo-sep">${ch}</span>`;
    const place = total - 1 - seen;
    seen += 1;
    // A hit spins long; any other card just ticks its last figures over.
    const turns = Math.max(0, (tier >= 3 ? 3 : tier >= 2 ? 2 : 1) - place);
    const ms = (tier >= 3 ? 900 : tier >= 2 ? 620 : 360) + seen * (tier >= 2 ? 60 : 40);
    const count = (turns + 1) * 10;
    const strip = Array.from({ length: count }, (_, i) => `<i>${i % 10}</i>`).join("");
    // A share of the strip's own height, so each figure lands square in its window.
    const y = (-(turns * 10 + Number(ch)) / count) * 100;
    // Kanit's figures are proportional, so each window is as wide as the figure it lands on.
    return `<span class="odo-d" style="--w:${ODO_W[ch]}em"><span class="odo-s" style="--y:${y.toFixed(4)}%;--ms:${ms}ms">${strip}</span></span>`;
  });
  return `${COIN_I}<span class="odo" aria-hidden="true">${figures.join("")}</span><span class="sr-only">${text} coins</span>`;
}

function renderFocusMeta(pull, { roll = false } = {}) {
  const tier = pull?.revealed ? hitTier(pull) : 0;
  els.focusMeta.classList.toggle("is-hit", tier >= 2);
  els.focusMeta.dataset.tier = String(tier);
  if (!pull || !pull.revealed) {
    // Face down, the name's plate waits as a dashed outline where it will land.
    els.focusMeta.innerHTML = pull ? `<i class="op-plate op-plate-wait" aria-hidden="true"></i><p class="focus-wait">Tap the card to turn it over</p>` : "";
    els.focusMeta.classList.remove("in");
    return;
  }
  // The name on its plate (yellow for a hit), the rarity as a type badge, then
  // what it is worth: a hit's figure is the headline, and rolls up as it lands.
  const hit = tier >= 2;
  const rolling = roll && fxOk();
  const label = RARITY_LABEL[pull.rarity] || pull.rarity || "";
  const rest = pullRest(pull);
  els.focusMeta.innerHTML = `
    <div class="op-plate${hit ? " hit" : ""}"><h2 class="focus-title">${esc(pull.name)}${pull.wasNew ? `<span class="sr-only">, new to your collection</span>` : ""}</h2></div>
    <p class="focus-line">${label ? `<span class="rt-type" data-ty="${pullTy(pull)}">${esc(label)}</span>` : ""}${rest ? `<span>${esc(rest)}</span>` : ""}</p>
    <div class="focus-worth">
      <div class="focus-worth-v"><small>Worth</small><p class="focus-value${hit ? "" : " lo"}">${rolling ? rollingValueHtml(sellValue(pull), tier) : coinAmount(sellValue(pull))}</p></div>
      ${pull.wasNew ? `<i class="focus-new" aria-hidden="true">New to your collection</i>` : ""}
    </div>
    ${pullFactsHtml(pull)}`;
  if (rolling) {
    const odo = els.focusMeta.querySelector(".odo");
    void odo.offsetWidth; // every strip starts at zero
    odo.classList.add("go");
  }
}

/** A Poké Ball pip per card in the pack under the bar: filled once it has turned, ringed on the card on show. */
const opPips = document.getElementById("op-pips");
function paintOpPips(on) {
  if (!opPips) return;
  opPips.classList.toggle("hidden", !on || !currentPulls.length);
  if (!on) return;
  const showing = packPhase === "reveal";
  // A new pack deals a fresh row (css .op-pips.deal); after that each pip is
  // patched in place, so a ball fills the moment its card turns (.fill) and
  // the ring moves to the card on show instead of every ball redrawing.
  if (opPips._pulls !== currentPulls || opPips.children.length !== currentPulls.length) {
    opPips._pulls = currentPulls;
    opPips.innerHTML = currentPulls.map((_, i) => `<i class="rt-ball e" style="--i:${Math.min(i, 15)}"></i>`).join("");
    replayClass(opPips, "deal", 900);
  }
  let filling = 0; // several at once (Reveal all, Skip to rares) fill in a quick run
  currentPulls.forEach((card, i) => {
    const pip = opPips.children[i];
    const filled = Boolean(card.revealed);
    if (filled && pip.classList.contains("e")) {
      pip.style.setProperty("--fd", `${Math.min(filling++, 12) * 30}ms`);
      pip.classList.add("fill");
      pip.addEventListener("animationend", () => pip.classList.remove("fill"), { once: true });
    }
    pip.classList.toggle("e", !filled);
    pip.classList.toggle("now", showing && i === focusIndex);
    pip.classList.toggle("hit", filled && hitTier(card) >= 2);
  });
}

function syncActions() {
  const ready = packPhase === "ready";
  const reveal = packPhase === "reveal";
  const spread = packPhase === "spread";
  const pull = currentPulls[focusIndex];
  els.overlay.dataset.phase = packPhase;
  els.overlayActions.classList.toggle("hidden", packPhase === "idle");
  els.overlay.classList.toggle("is-spread", spread || packPhase === "summary");
  // Beside the step there is one way to hurry: past the commons while they last, then Reveal all.
  const skipHits = canSkipToHits();
  els.skipBtn.classList.toggle("hidden", !(ready || reveal) || skipHits);
  els.skipHitsBtn.classList.toggle("hidden", !skipHits);
  // Which card of the pack, in the bar.
  const counting = reveal && Boolean(pull);
  els.opCount.classList.toggle("hidden", !counting);
  els.overlay.classList.toggle("is-counting", counting);
  if (counting) {
    const count = `Card ${focusIndex + 1} of ${currentPulls.length}`;
    // The figure ticks over when the card on show changes (css .op-count.tick).
    if (els.opCount.textContent !== count) {
      els.opCount.textContent = count;
      if (fxOk()) replayClass(els.opCount, "tick", 400);
    }
    els.opCount.removeAttribute("aria-label");
  }
  paintOpPips(ready || reveal);
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
  paintSellBulk(spread && !sealedRun && activeTrainer() ? bulkLots() : null);
  els.stepBtn.classList.toggle("hidden", spread || summary);
  els.leavePack?.classList.toggle("hidden", summary);
  els.ripHint.classList.toggle("hidden", reveal || spread);
  const more = remainingBacks() > 0 || currentPulls.some((card, i) => i > focusIndex && card.drawn);
  if (ready) els.stepBtn.textContent = "Tear pack";
  // A card still dealing is busy too, but a tap then flips it as it lands, so it reads Flip.
  else if (reveal && pull && !pull.revealed) els.stepBtn.textContent = "Flip";
  else if (reveal && more) els.stepBtn.textContent = "Next";
  else if (reveal) els.stepBtn.textContent = "Your pulls";

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

/** The tell's state classes on the overlay; the slam takes over from them. */
const CHARGE_CLASSES = ["charging", "charged", "charge-t2", "charge-t3"];
/** Every state class the hit choreography puts on the overlay. */
const HIT_CLASSES = [...CHARGE_CLASSES, "hit-flash", "hit-shake", "hit-shake-sm", "hit-t1", "hit-t2", "hit-t3"];

function clearHitFx({ keepCharge = false } = {}) {
  clearTimeout(playHitFx._t);
  clearTimeout(playHitFx._b);
  playHitFx._t = 0;
  playHitFx._b = 0;
  els.hitFx.replaceChildren();
  els.overlay.classList.remove(...(keepCharge ? HIT_CLASSES.filter((c) => !CHARGE_CLASSES.includes(c)) : HIT_CLASSES));
  if (!keepCharge) els.focusCard.classList.remove("charging", "charged");
}

/** How long a hit builds up before it turns over; commons and rares flip at once. */
function chargeMs(card) {
  const tier = hitTier(card);
  if (tier < 2 || !hitFxOk()) return 0;
  return tier >= 3 ? 1050 : 600;
}

/**
 * The burst at a hit's slam: yellow and white four-point stars thrown out
 * from behind the card along rays from its middle, each starting just inside
 * the card's edge. A fixed handful: each star is its own small layer, so the
 * count is the cost.
 */
function burstLines(tier) {
  const frag = document.createDocumentFragment();
  const hw = els.focusCard.offsetWidth / 2;
  const hh = els.focusCard.offsetHeight / 2;
  const count = tier >= 3 ? 14 : 8;
  const reach = tier >= 3 ? 120 : 84;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * (i + 0.5)) / count + (Math.random() - 0.5) * 0.4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const edge = Math.min(hw / Math.max(Math.abs(cos), 0.01), hh / Math.max(Math.abs(sin), 0.01));
    const from = edge * 0.8;
    const to = edge + reach * (0.45 + Math.random() * 0.6);
    const star = document.createElement("span");
    star.className = `hit-spark t${tier}${i % 3 === 1 ? " w" : ""}`;
    star.style.setProperty("--x0", `${(cos * from).toFixed(1)}px`);
    star.style.setProperty("--y0", `${(sin * from).toFixed(1)}px`);
    star.style.setProperty("--x1", `${(cos * to).toFixed(1)}px`);
    star.style.setProperty("--y1", `${(sin * to).toFixed(1)}px`);
    star.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 120)}deg`);
    star.style.setProperty("--s", (0.55 + Math.random() * 0.65).toFixed(2));
    star.style.setProperty("--dly", `${Math.round(Math.random() * 60)}ms`);
    frag.appendChild(star);
  }
  els.hitFx.replaceChildren(frag);
}

function playHitFx(card) {
  const tier = hitTier(card);
  // A charged card keeps its line (and the dimmed table) until the slam.
  clearHitFx({ keepCharge: true });
  if (!tier) return;
  buzz(tier >= 3 ? [24, 40, 60] : tier === 2 ? [18, 30, 30] : 18);
  if (!hitFxOk()) return;
  els.overlay.classList.add(`hit-t${tier}`);
  // The slam lands as the face turns toward the viewer, a little under
  // half-way through the flip (earlier for a charged card, whose turn starts
  // faster).
  const at = Math.round(flipDurationMs() * (tier >= 2 ? 0.37 : 0.42));
  clearTimeout(playHitFx._b);
  playHitFx._b = setTimeout(() => {
    // The slam: the line opens into the band (css .hit-flash), the dimmed
    // table comes back, the lines burst and the stage takes the kick.
    els.overlay.classList.remove("charged");
    els.overlay.classList.add("hit-flash");
    if (tier >= 3) els.overlay.classList.add("hit-shake");
    else if (tier === 2) els.overlay.classList.add("hit-shake-sm");
    if (tier >= 2) burstLines(tier);
  }, at);
  clearTimeout(playHitFx._t);
  playHitFx._t = setTimeout(() => {
    els.overlay.classList.remove("hit-shake", "hit-shake-sm", "hit-flash", ...CHARGE_CLASSES);
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
  els.focusCard.style.setProperty("--flip-ms", tier >= 2 ? "0.8s" : tier === 1 ? "0.72s" : "0.62s");
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
  // Decode the face while it lies face down, so it is there the moment it turns.
  if (!faceUp) els.focusCard.querySelector(".face-back img")?.decode?.().catch(() => {});
  if (faceUp) {
    els.focusCard.classList.add("no-anim", "flipped", "settled");
    void els.focusCard.offsetWidth;
    els.focusCard.classList.remove("no-anim");
    presentFace(els.focusCard.querySelector(".face-back .tcg"));
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

/**
 * The pack's bulk that can go without costing the collection a card: the
 * commons, uncommons, reverses and plain rares under a coin, one sale per
 * spare copy (a copy beyond the one kept, or beyond those in binder pockets).
 * The worker pays the card's own price, so that is what the button quotes.
 */
function bulkLots() {
  const lots = new Map();
  for (const pull of currentPulls) {
    if (hitTier(pull) > 1 || pull.promo || pull.energy || pull.rarity === "Energy" || pull.supertype === "Energy") continue;
    const card = findCard(pull.id) || pull;
    const value = sellValue({ ...card, reverse: false });
    if (!(value > 0 && value < 1)) continue;
    const lot = lots.get(pull.id) || { card, n: -(bulkSold.get(pull.id) || 0), value };
    lot.n += 1;
    lots.set(pull.id, lot);
  }
  return [...lots.values()]
    .map((lot) => {
      const have = state.collection?.[lot.card.id] || 0;
      return { ...lot, n: Math.min(lot.n, Math.max(0, have - Math.max(1, binderHeld(state, lot.card.id)))) };
    })
    .filter((lot) => lot.n > 0);
}

let sellingBulk = false;
/** Copies of this pack's cards Sell bulk has sold, by card id, so it never sells past what the pack brought. */
const bulkSold = new Map();

/** Sell bulk wears what it would sell; with nothing spare it stays, greyed, so players know it is there. */
function paintSellBulk(lots) {
  els.sellBulkBtn.classList.toggle("hidden", !lots);
  if (!lots) return;
  const count = lots.reduce((sum, lot) => sum + lot.n, 0);
  const value = money(lots.reduce((sum, lot) => sum + lot.n * lot.value, 0));
  els.sellBulkBtn.disabled = !count || sellingBulk;
  els.sellBulkBtn.title = count
    ? "This pack's spares worth under 1 coin. You keep one of every card."
    : bulkSold.size
      ? "This pack's bulk is sold"
      : "Nothing from this pack is a spare yet";
  els.sellBulkBtn.innerHTML = `<span>${sellingBulk ? "Selling…" : "Sell bulk"}</span><small>${
    count ? `${count} card${count === 1 ? "" : "s"} <span class="price">${coinAmount(value)}</span>` : bulkSold.size ? "All sold" : "No spares"
  }</small>`;
}

async function sellPackBulk() {
  if (sellingBulk || packPhase !== "spread" || sealedRun) return;
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  const lots = bulkLots();
  const count = lots.reduce((sum, lot) => sum + lot.n, 0);
  if (!count) return;
  const estimate = money(lots.reduce((sum, lot) => sum + lot.n * lot.value, 0));
  if (state.settings.confirmSell && !confirm(`Sell ${count} spare card${count === 1 ? "" : "s"} for ${coin(estimate)} coins? You keep one of every card.`)) return;
  sellingBulk = true;
  syncActions();
  let sold = 0;
  let paid = 0;
  let failed = "";
  // One card a request, as the card's details sell it, so the worker checks every copy.
  sale: for (const lot of lots) {
    for (let i = 0; i < lot.n; i += 1) {
      try {
        const data = await api("/api/cards/sell", { method: "POST", body: JSON.stringify({ cardId: lot.card.id }) });
        afterEconomy(data.save);
        bulkSold.set(lot.card.id, (bulkSold.get(lot.card.id) || 0) + 1);
        sold += 1;
        paid += Number(data.value ?? lot.value) || 0;
      } catch (err) {
        failed = err.message || "Couldn't sell that card.";
        break sale;
      }
    }
  }
  sellingBulk = false;
  renderHeader();
  paintPurse();
  if (packPhase === "spread") syncActions();
  if (sold && packPhase === "spread") markBulkSold();
  if (sold) toast(`Sold ${sold} bulk card${sold === 1 ? "" : "s"} for ${coin(money(paid))} coins.${failed ? ` ${failed}` : ""}`);
  else toast(failed);
}

/**
 * The answer to Sell bulk on the end page: as many of each card's copies as
 * were sold go quiet in the pile and the reveal order, with a Sold tag
 * stamped on, and the purse bumps (css/opening.css .is-sold, .op-purse.bump).
 */
function markBulkSold() {
  const lay = els.spread.querySelector("#pulls-lay");
  const rows = els.opReceipt.querySelectorAll(".order-rows > li");
  const left = new Map(bulkSold);
  // Plain copies first: the sale takes the card, not its reverse.
  const order = currentPulls.map((card, i) => i).sort((a, b) => Number(Boolean(currentPulls[a].reverse)) - Number(Boolean(currentPulls[b].reverse)));
  let n = 0;
  for (const i of order) {
    const card = currentPulls[i];
    const due = left.get(card.id) || 0;
    if (!due) continue;
    left.set(card.id, due - 1);
    for (const li of [lay?.children[i], rows[i]]) {
      if (!li || li.classList.contains("is-sold")) continue;
      li.classList.add("is-sold");
      li.style.setProperty("--sd", `${Math.min(n, 8) * 40}ms`);
      li.insertAdjacentHTML("beforeend", `<i class="sold-tag" aria-hidden="true">Sold</i>`);
    }
    n += 1;
  }
  if (fxOk()) replayClass(els.opPurse, "bump", 450);
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

/* ---- Your pulls: the end of a pack -------------------------------------
   What the pack cost against what came out of it, the best pull, the cards as
   a pile on the table or a grid in reveal order, and the reveal order as a
   list beside them (css/opening.css). */

/** Pile or Grid, as the player last left it. */
function pullsView() {
  return state.settings.pullsView === "grid" ? "grid" : "pile";
}

function setPullsView(view) {
  const next = view === "grid" ? "grid" : "pile";
  if (state.settings.pullsView !== next) {
    state.settings.pullsView = next;
    saveState(state);
  }
  const lay = els.spread.querySelector("#pulls-lay");
  const keys = els.spread.querySelector(".pulls-keys");
  if (!lay || !keys) return;
  // The cards slide from the pile into the grid and back (a FLIP: measured
  // before and after, then eased from where they were by transform alone).
  const items = fxOk() && lay.classList.contains(next === "grid" ? "pile" : "grid") && lay.children.length <= 24 ? [...lay.children] : [];
  const before = items.map((li) => li.getBoundingClientRect());
  lay.classList.toggle("pile", next === "pile");
  lay.classList.toggle("grid", next === "grid");
  keys.style.setProperty("--i", next === "grid" ? "1" : "0");
  if (items.length) {
    items.forEach((li, i) => {
      const a = before[i];
      const b = li.getBoundingClientRect();
      if (!b.width) return;
      const s = a.width / b.width;
      li.style.transition = "none";
      li.style.transform = `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${s.toFixed(3)})`;
    });
    void lay.offsetWidth;
    lay.classList.add("morph");
    items.forEach((li, i) => {
      li.style.transition = "";
      li.style.transitionDelay = `${Math.min(i, 10) * 18}ms`;
      li.style.transform = "";
    });
    clearTimeout(lay._morph);
    lay._morph = setTimeout(() => {
      lay.classList.remove("morph");
      items.forEach((li) => li.style.removeProperty("transition-delay"));
    }, 700);
  }
  for (const key of keys.querySelectorAll("[data-pulls-view]")) key.setAttribute("aria-pressed", String(key.dataset.pullsView === next));
}

/** Fixed tilts and drops for the pile, so a pack lands the same way every time it is drawn. */
const PILE_TILT = [-3, 2, -1.5, 3, -2.5, 2, -2, 3, -1, 2.5, -2, 1.5, -3, 2.5, -1.5, 2];
const PILE_DROP = [0.02, -0.03, 0.04, -0.02, 0.03, -0.04, 0.01, 0.03, -0.01, 0.02, -0.03, 0.04];

/**
 * Where each card lies in the pile, as fractions of the room a card leaves:
 * the earlier half along the back, the later half along the front, and the
 * best pull across the middle, on top of them all.
 */
function pileSpots(cards, best) {
  const rest = cards.filter((card) => card !== best);
  const back = rest.slice(0, Math.ceil(rest.length / 2));
  const front = rest.slice(back.length);
  const spots = new Map();
  back.forEach((card, i) => spots.set(card, { x: back.length < 2 ? 0.5 : i / (back.length - 1), y: 0.04, z: 1 + i }));
  front.forEach((card, i) => spots.set(card, { x: (i + 0.5) / front.length, y: 0.94, z: 20 + i }));
  if (best) spots.set(best, { x: 0.5, y: 0.47, z: 40 });
  return cards.map((card, i) => {
    const spot = spots.get(card);
    const y = Math.min(1, Math.max(0, spot.y + PILE_DROP[i % PILE_DROP.length]));
    return { ...spot, y, r: PILE_TILT[i % PILE_TILT.length] };
  });
}

/** "116/084": the number as the card prints it, without the leading zeros. */
function shortNo(card) {
  const no = numberLine(card);
  return no === "Energy" ? "" : no.replace(/^0+(?=\d)/, "");
}

/** A box's packs were paid for together, so each one's share of the price stands for it. */
function packCost() {
  return sealedRun ? money(sealedRun.cost / Math.max(1, sealedRun.packs.length)) : liveSet.cost;
}

function bestPullHtml(card) {
  const hit = hitTier(card) >= 2;
  const label = RARITY_LABEL[card.rarity] || card.rarity || "";
  const rest = [foilWord(card), shortNo(card)].filter(Boolean).join(", ");
  return `<div class="best${hit ? " is-hit" : ""}">
    <div class="best-stage">
      <button type="button" class="best-card" ${inspectAttrs(card)} aria-label="${esc(pullLabel(card))}">${tcgFace(card, { small: true })}</button>
      ${hit ? `<span class="best-stars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>` : ""}
    </div>
    <div class="best-tx">
      <span class="best-lbl">Best pull</span>
      <b class="best-name op-plate${hit ? " hit" : ""}"><span>${esc(card.name)}</span></b>
      <span class="best-ln">${label ? `<span class="rt-type" data-ty="${pullTy(card)}">${esc(label)}</span>` : ""}${rest ? `<span>${esc(rest)}</span>` : ""}</span>
      <span class="best-val"><span class="price">${coinAmount(sellValue(card))}</span>${card.wasNew ? `<span class="tag-new">New</span>` : ""}</span>
      ${hit ? `<button type="button" class="tlink best-share" data-share-pull="${currentPulls.indexOf(card)}">Share this pull</button>` : ""}
    </div>
  </div>`;
}

/**
 * The top of an end page, on the dark stage: the title, what it was, the
 * total pulled (rolling up) against what it cost, and the best pull on the
 * slab beside it.
 */
function pullsHeroHtml({ title, titleId, sub, paidLabel, cost, pulled, best }) {
  const net = money(pulled - cost);
  const roll = fxOk();
  return `<header class="pulls-hero">
    <div class="pulls-hero-tx">
      <h2 class="pulls-title" id="${titleId}" tabindex="-1">${esc(title)}</h2>
      <p class="pulls-sub">${esc(sub)}</p>
      <div class="pulls-total">
        <small>Pulled</small>
        <b class="pulls-total-v">${roll ? rollingValueHtml(pulled, 3) : coinAmount(pulled)}</b>
        <p class="pulls-net"><span>${esc(paidLabel)} ${coinAmount(cost)}</span><i class="${net >= 0 ? "up" : "down"}">${net >= 0 ? "+" : "-"}${coinText(Math.abs(net))}<span class="sr-only"> coins ${net >= 0 ? "up" : "down"}</span></i></p>
      </div>
    </div>
    ${best ? bestPullHtml(best) : ""}
  </header>`;
}

/** The page itself: the hero with the total and the best pull, then the cards as a pile or a grid. */
function pullsPageHtml(best) {
  const set = packSet || liveSet;
  const run = sealedRun;
  const cost = packCost();
  const pulled = money(currentPulls.reduce((sum, card) => sum + sellValue(card), 0));
  const fresh = currentPulls.filter((card) => card.wasNew).length;
  const wrap = run
    ? `${run.product.short || run.product.name}, pack ${run.index + 1} of ${run.packs.length}`
    : activeWrapper?.name
      ? `${activeWrapper.name} wrapper`
      : "";
  const sub = [set.name, wrap, `${currentPulls.length} card${currentPulls.length === 1 ? "" : "s"}`, fresh ? `${fresh} new` : ""].filter(Boolean).join(", ");
  const view = pullsView();
  const spots = pileSpots(currentPulls, best);
  return `<div class="pulls-page">
    ${pullsHeroHtml({ title: "Your pulls", titleId: "pulls-title", sub, paidLabel: "Pack", cost, pulled, best })}
    <section class="pulls-panel" aria-label="The cards">
      <div class="pulls-seg-row">
        <div class="keys pulls-keys" role="group" aria-label="Show the cards as" style="--n:2;--i:${view === "grid" ? 1 : 0}">
          <i class="seg-thumb" aria-hidden="true"></i>
          <button type="button" class="seg-key" data-pulls-view="pile" aria-pressed="${view === "pile"}"><span>Pile</span></button>
          <button type="button" class="seg-key" data-pulls-view="grid" aria-pressed="${view === "grid"}"><span>Grid</span></button>
        </div>
        <span class="pulls-note">In reveal order</span>
      </div>
      <ol class="pulls-lay ${view}" id="pulls-lay">${currentPulls
        .map((card, i) => {
          const spot = spots[i];
          return `<li style="--x:${spot.x.toFixed(3)};--y:${spot.y.toFixed(3)};--z:${spot.z};--r:${spot.r}deg;--d:${Math.min(i, 12) * 30}ms">
          <button type="button" class="pulls-card${card === best ? " is-best" : ""}" ${inspectAttrs(card)} aria-label="${esc(`${i + 1}, ${pullLabel(card)}`)}">${tcgFace(card, { small: true })}</button>
          <p class="pulls-cap" aria-hidden="true"><span><b>${i + 1}</b>${esc(card.name)}</span><span class="price">${coinAmount(sellValue(card))}</span></p>
        </li>`;
        })
        .join("")}</ol>
    </section>
  </div>`;
}

/** "reverse holo", or the ball the pattern is: what a reverse adds to a card's name. */
function foilWord(card) {
  const kind = card.reverse ? card.reverseKind || reverseKindOf(card) : "";
  if (!card.reverse) return "";
  return kind === "pokeball" ? "Poké Ball reverse" : kind === "masterball" ? "Master Ball reverse" : "reverse holo";
}

/** The reveal order beside the cards: each pull with its mark, number and value, then what it all came to. */
function pullsOrderHtml(best) {
  const run = sealedRun;
  const pulled = money(currentPulls.reduce((sum, card) => sum + sellValue(card), 0));
  const rows = currentPulls
    .map((card, i) => {
      const lead = card === best;
      // Red is for the hit: only the best pull's New is a red tag; any other new card says so quietly.
      const note = [foilWord(card), card.wasNew && !lead ? "new" : ""].filter(Boolean).join(", ");
      const tag = lead && card.wasNew ? `<span class="tag-new">New</span>` : "";
      const small = note || tag ? `<small>${esc(note)}${note && tag ? " " : ""}${tag}</small>` : "";
      return `<li${lead ? ` class="is-hit"` : ""}><button type="button" class="order-row" ${inspectAttrs(card)} aria-label="${esc(`${i + 1}, ${pullLabel(card)}, ${coin(sellValue(card))} coins`)}">
        <span class="n rt-type" data-ty="${pullTy(card)}" title="${esc(rarityLine(card))}">${i + 1}</span>
        <span class="nm">${esc(card.name)}${small}</span>
        <span class="no">${esc(shortNo(card))}</span>
        <span class="vl">${coinText(sellValue(card))}</span>
      </button></li>`;
    })
    .join("");
  const head = run ? `Pack ${run.index + 1} of ${run.packs.length}` : `Pack ${coinText(packCost())}`;
  return `<section class="plate pulls-order" aria-labelledby="pulls-order-h">
    <div class="plate-head"><h2 id="pulls-order-h">Reveal order</h2><span>${esc(head)}</span></div>
    <ol class="order-rows">${rows}</ol>
    <p class="kv order-total"><span>Pulled</span><span class="price">${coinAmount(pulled)}</span></p>
    <p class="order-foot">${RECEIPT_FOOT.map(esc).join(" ")}</p>
  </section>`;
}

/** The end page's total rolls up from zero (css .odo), every strip from its first figure. */
function rollPullsTotal() {
  const odo = els.spread.querySelector(".pulls-total .odo");
  if (!odo) return;
  void odo.offsetWidth;
  requestAnimationFrame(() => odo.classList.add("go"));
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
  els.spread.classList.remove("hidden");

  const best = bestPull();
  els.spread.innerHTML = pullsPageHtml(best);
  setReceipt(pullsOrderHtml(best));
  rollPullsTotal();

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  paintPurse();
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
    renderFocusMeta(pull, { roll: true });
    requestAnimationFrame(() => els.focusMeta.classList.add("in"));
  }
  // A hit holds the screen: a tap that came in while it turned doesn't skip past it.
  if (pull && hitTier(pull) >= 2) pendingAdvance = false;
  unlockCard(gen);
  // The turned card moves its own light until a finger takes over (js/card-motion.js).
  presentFace(els.focusCard.querySelector(".face-back .tcg"));
}

function flipCurrent() {
  const pull = currentPulls[focusIndex];
  if (!pull || pull.revealed || flipBusy) return;
  const gen = bumpCardMotion();
  flipBusy = true;
  pull.revealed = true;
  els.focusMeta.querySelector(".focus-wait")?.remove();
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
    // The bar's second line says which pack this is; the meter only shows how far in.
    els.boxProgress.innerHTML = meter;
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
  els.spread.innerHTML = boxSummaryHtml(run, shown, lead, hits.length);
  rollPullsTotal();
  setReceipt(boxReceiptHtml(run, lead));

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  paintWhere();
  els.overlay.scrollTop = 0;
  els.viewPullsBtn.focus({ preventScroll: true });
}

/**
 * The box summary page, laid out like Your pulls: the title, what the box
 * cost against what came out of it with the best hit, then the hits (or the
 * best cards, in a box with none) as a grid on the ground.
 */
function boxSummaryHtml(run, shown, lead, hitCount) {
  const set = run.packs[0]?.set || run.set || liveSet;
  const promos = run.promos || [];
  const boxCards = run.boxCards || [];
  const packCards = run.packs.flatMap((pack) => pack.cards);
  const boxCount = boxCards.reduce((sum, card) => sum + card.n, 0);
  const count = promos.length + packCards.length + boxCount;
  const fresh = [...promos, ...packCards, ...boxCards].filter((card) => card.wasNew).length;
  const pulled = money(
    [...promos, ...packCards].reduce((sum, card) => sum + sellValue(card), 0) +
      boxCards.reduce((sum, card) => sum + sellValue(card) * card.n, 0)
  );
  const cost = run.cost || 0;
  const noun = run.product.noun || "box";
  const packs = run.packs.length;
  const sub = [
    set.name,
    run.product.name,
    packs ? `${packs} pack${packs === 1 ? "" : "s"}` : "",
    `${num(count)} cards`,
    fresh ? `${num(fresh)} new` : "",
  ].filter(Boolean).join(", ");
  const unseen = packs - run.index - 1;
  const tip = [
    unseen > 0 ? `${unseen} unopened pack${unseen === 1 ? " went" : "s went"} straight to your collection.` : "",
    boxCount ? `The ${noun}'s other ${num(boxCount)} cards are in your collection too.` : "",
  ].filter(Boolean).join(" ");
  const heading = hitCount ? "Hits" : promos.length && !packs ? "Promos" : "Best cards";
  const aside = hitCount
    ? `${num(hitCount)} in the ${noun}${promos.length ? `, ${num(promos.length)} promo${promos.length === 1 ? "" : "s"}` : ""}`
    : packs
      ? "No hits this time"
      : "";
  return `<div class="pulls-page box-sum">
    ${pullsHeroHtml({ title: `${noun.charAt(0).toUpperCase() + noun.slice(1)} summary`, titleId: "end-name", sub, paidLabel: "Paid", cost, pulled, best: lead })}
    <section class="pulls-panel" aria-label="${esc(heading)}">
    ${shown.length ? `<h3 class="ground-h box-sum-h">${heading}${aside ? ` <span>${esc(aside)}</span>` : ""}</h3>
    <ol class="pulls-lay grid" id="pulls-lay">${shown
      .map((card, i) => `<li style="--d:${Math.min(i, 12) * 30}ms">
        <button type="button" class="pulls-card" ${inspectAttrs(card)} aria-label="${esc(pullLabel(card))}">${tcgFace(card, { small: true })}</button>
        <p class="pulls-cap" aria-hidden="true"><span>${esc(card.name)}</span><span class="price">${coinAmount(sellValue(card))}</span></p>
      </li>`)
      .join("")}</ol>` : ""}
    ${tip ? `<p class="spread-tip">${esc(tip)}</p>` : ""}
    </section>
  </div>`;
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
    "tear-from-right",
    "entered"
  );
}

/*
 * A rip or a box the server is slow to answer: after a moment the keys that
 * buy go to their disabled look (and a box key reads Opening), so the press
 * is seen to have landed. They come back when the answer does.
 */
let ripWaitTimer = 0;
function ripWaiting(on) {
  clearTimeout(ripWaitTimer);
  if (on) {
    ripWaitTimer = setTimeout(() => {
      document.querySelectorAll("#home-rip, #tab-rip, #shop-rip, [data-open-product]").forEach((btn) => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.dataset.ripWait = "1";
        btn.setAttribute("aria-busy", "true");
        if (btn.matches(".confirming")) {
          btn.dataset.ripLabel = btn.innerHTML;
          btn.textContent = "Opening";
        }
      });
    }, 300);
    return;
  }
  document.querySelectorAll("[data-rip-wait]").forEach((btn) => {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    if (btn.dataset.ripLabel != null) btn.innerHTML = btn.dataset.ripLabel;
    delete btn.dataset.ripWait;
    delete btn.dataset.ripLabel;
  });
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
  ripWaiting(true);
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
    ripWaiting(false);
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

/** Set files boot asked for early (prefetchSetFiles), handed to the first caller that wants each one. */
const setFilePrefetch = new Map();

function fetchSetFile(url) {
  const early = setFilePrefetch.get(url);
  if (early) {
    setFilePrefetch.delete(url);
    return early;
  }
  return fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
}

/** Start the files of the set this page will most likely open while the shop files and session load. */
function prefetchSetFiles(setId) {
  const set = PLAYABLE_SETS.find((s) => s.id === setId);
  if (!set) return;
  for (const source of dataSetsOf(set)) {
    if (!source.dataFile || setCache[source.id] || setFilePrefetch.has(source.dataFile)) continue;
    const early = fetchSetFile(source.dataFile);
    early.catch(() => {}); // the caller that takes it sees the failure
    setFilePrefetch.set(source.dataFile, early);
  }
}

/** A set's cards, fetched once, for a box that holds another set's packs. */
async function loadSetData(set) {
  if (setCache[set.id]) return setCache[set.id];
  const list = await fetchSetFile(set.dataFile);
  setCache[set.id] = list;
  applyCachedPrices(list, set.id);
  return list;
}

/**
 * A pre-made deck (a Theme Deck, a Battle Deck) opened here becomes a deck in
 * the playable TCG under its own name, made of the very cards that came in
 * it. It waits in this device's inbox until /play picks it up (js/tcg-page.js
 * takeThemeDecks). Only a single 60-card deck counts: a Trainer Kit's two half
 * decks or a bundle of several decks have no one list to play.
 */
function keepThemeDeck(product, setId, promos, boxCards) {
  if (product?.kind !== "deck" || /trainer kit/i.test(product.name || "")) return;
  const cards = {};
  for (const card of promos || []) cards[card.id] = (cards[card.id] || 0) + 1;
  for (const card of boxCards || []) cards[card.id] = (cards[card.id] || 0) + (card.n || 1);
  if (Object.values(cards).reduce((a, b) => a + b, 0) !== 60) return;
  const quoted = String(product.name || "").match(/"([^"]+)"/);
  // "Theme Deck "Rillaboom"" -> "Rillaboom", "ex Battle Deck: Lucario ex" -> "Lucario ex".
  const name = (quoted ? quoted[1] : String(product.name || "Theme deck").replace(/^.*\bBattle Deck:\s*/i, "")).trim();
  const key = `pp-tcg-inbox-v1:${cloudUser?.id || cloudUser?.handle || "guest"}`;
  try {
    const inbox = JSON.parse(localStorage.getItem(key) || "[]");
    inbox.push({ product: product.id, setId, name, cards, at: Date.now() });
    localStorage.setItem(key, JSON.stringify(inbox.slice(-40)));
  } catch {
    /* private mode: the cards are still owned and can be built into a deck by hand */
  }
}

/** Every pre-made deck in an order or a vault opening (an OpenResult), kept for /play. */
function keepThemeDecks(opened) {
  for (const box of opened?.boxes || []) {
    const offer = offerFor(box.setId, box.productId);
    if (offer) keepThemeDeck({ ...offer, id: box.productId }, box.setId, box.promos, box.boxCards);
  }
  return opened;
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
  ripWaiting(true);
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
    keepThemeDeck({ ...offer, ...data.product }, liveSet.id, promos, boxCards);
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
    ripWaiting(false);
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
  bulkSold.clear();
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
  resetTear();
  clearFocusChrome({ snap: true });
  els.packBody.classList.remove("hidden", "emptied", "pack-exit");
  paintOpeningStage(wrapper);
  setPackArt(wrapper);
  els.focusWrap.classList.add("hidden");
  els.spread.classList.add("hidden");
  els.spread.innerHTML = "";
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
  const fromRect = button?.getBoundingClientRect();
  try {
    const data = await api("/api/levels/claim", { method: "POST" });
    afterEconomy(data.save);
    freshLevels = new Set(data.paid?.levels || []);
    renderHeader();
    renderAccount();
    restoreFocus(focused);
    flyCoins(fromRect, { count: 6 });
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
  return questArea.questBoardHtml(state.quests, areaDeps, { fresh: freshClaims, period: questPeriod });
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
  if (!sell) return;
  // What changed after a sale or a showcase pin answers (css/pages/inspect.css .is-new).
  const was = sell.dataset.card === card.id ? [...sell.querySelectorAll(".pc-own, .pc-actions > *")].map((el) => el.textContent.trim()) : null;
  sell.dataset.card = card.id;
  sell.innerHTML = inspectSellRow(card);
  if (!was || !fxOk()) return;
  [...sell.querySelectorAll(".pc-own, .pc-actions > *")].forEach((el, i) => {
    if (was[i] !== undefined && was[i] !== el.textContent.trim()) el.classList.add("is-new");
  });
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
  rarityGroup = rarity ? rarityGroupOf(card) : "all";
  rarityMode = rarity ? card.rarity : "all";
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
    .join(", ");
  // The name, the rarity as a type badge, what it is worth and what you can do
  // with your copies; then the chart, and the facts as rows in a box.
  const rows = [
    // A Japanese print (data/<set>.json `lang`): English name and text on the site, the printed name here.
    card.lang === "ja" ? ["Language", `Japanese${card.nameJa ? ` <span lang="ja">${esc(card.nameJa)}</span>` : ""}`] : null,
    type ? ["Type", esc(type)] : null,
    card.evolvesFrom ? ["Evolves from", esc(card.evolvesFrom)] : null,
    ["Illustrator", esc(card.artist || "Unknown")],
    ["Find more", inspectFindMore(card, set)],
  ].filter(Boolean);
  const no = numberLine(card);
  const rest = [card.reverse ? foilWord(card) : "", no === "Energy" ? "" : no].filter(Boolean).join(", ");
  els.inspectInfo.innerHTML = `
    ${TILT_CAPABLE && !tiltLive && !state.settings.lite && els.inspectArt.querySelector(".foil") && !els.inspectArt.querySelector(".tcg.foil-none:not(.reverse)") ? `<p class="inspect-tilt"><button type="button" class="inspect-link" data-inspect-tilt>Tilt your phone to move the light</button></p>` : ""}
    <p class="inspect-set"><button type="button" class="inspect-set-link" data-inspect-set="${esc(card.id)}" aria-label="Show ${esc(card.name)} in ${esc(set.name)}"><img class="inspect-set-symbol" src="${esc(setIdentity(set).symbol)}" alt="" width="24" height="24" decoding="async" /><span>${esc(set.name)}</span></button></p>
    <h2 id="inspect-title">${esc(card.name)}</h2>
    <p class="inspect-line"><span class="rt-type" data-ty="${pullTy(card)}">${esc(rarityLine(card))}</span>${rest ? `<span>${esc(rest)}</span>` : ""}${wishlist.heart(card.id, card.name, { word: true, cls: "inspect-wish" })}</p>
    <div class="inspect-worth"><small>Worth</small><b class="price">${coinAmount(sellValue(card))}</b></div>
    <div id="inspect-sell"></div>
    <div class="price-card" id="inspect-chart"></div>
    <dl class="inspect-rows">${rows.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <p class="inspect-share"><button type="button" class="tlink" data-inspect-share>Share this card</button></p>`;
  paintInspect(card);
  openDialog(els.inspect, els.inspectClose);
  presentFace(els.inspectArt.querySelector(".tcg"));
}

els.inspectInfo.addEventListener("click", (e) => {
  if (e.target.closest("[data-inspect-share]")) {
    if (inspectCard) sharePull(inspectCard);
    return;
  }
  if (e.target.closest("[data-inspect-tilt]")) {
    setPhoneTilt(true);
    return;
  }
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
    if (!btn.dataset.view) return; // the Discord link opens its own tab
    e.preventDefault();
    if (btn.dataset.view === "rankings" || btn.dataset.view === "social") {
      socialTab = btn.dataset.view === "rankings" ? "rankings" : "friends";
      if (socialTab === "friends") dmHandle = "";
      setView("social");
      return;
    }
    if (btn.dataset.view === "battles") battlePath = "/battles";
    if (btn.dataset.view === "casino") casinoPath = btn.dataset.casino || "/casino";
    if (btn.dataset.view === "grading") gradingPath = "/grading"; // grading
    if (btn.dataset.view === "trades") tradesPath = "/trades"; // trades
    setView(btn.dataset.view);
  });
});

els.setSwitcher?.addEventListener("click", (e) => {
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
  if (tab) activateSet(tab.dataset.set).then((ok) => ok && toggleSetBrowser(false));
});
els.setSwitcher?.addEventListener("toggle", onEraToggle);

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
  // The lock notice's link to the Levels tab, and the profile to-do's "Pick a banner" (js/profile-view.js) to the Look tab.
  const gateTab = e.target.closest(".gate-lock [data-acct-tab], .profile-todo [data-acct-tab]");
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
  else {
    // A link to one update (Home's "This week"): the notes page opens it once it is on screen.
    if (next === "notes" && url.hash.startsWith("#note-")) notesState.jump = decodeURIComponent(url.hash.slice(1));
    setView(next);
  }
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

/** Rip the set on show, or open the shop for a promo set (which has no boosters). */
async function ripOnShow() {
  if (!(await shelfSetReady())) return;
  if (liveSet.promoSet) setView("shop");
  else startRip(chosenWrapper());
}

els.viewHome.addEventListener("click", async (e) => {
  // An older set from the list goes on the shelf, and the page goes back up to it.
  const feature = e.target.closest("[data-feature-set]");
  if (feature) {
    if (await activateSet(feature.dataset.featureSet)) window.scrollTo({ top: 0, behavior: fxOk() ? "smooth" : "instant" });
    return;
  }
  // The arrows by the tag step through the newest sets; the big pack rips.
  const step = e.target.closest("[data-shelf-step]");
  if (step) {
    stepShelf(Number(step.dataset.shelfStep));
    return;
  }
  const pick = e.target.closest("[data-shelf-pick]");
  if (pick) {
    if (homeSwiped) homeSwiped = false;
    else ripOnShow();
    return;
  }
  const wrapper = e.target.closest("[data-home-wrapper]");
  if (wrapper) {
    if (await shelfSetReady()) pickHomeWrapper(wrapper.dataset.homeWrapper);
    return;
  }
  if (e.target.closest("#home-rip")) {
    ripOnShow();
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

async function signOut() {
  document.querySelector(".tabbar .nav-more")?.removeAttribute("open");
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
}
// Sign out in the menu under your name and in the phone menu (the Account page has its own key).
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest("[data-signout]")) signOut();
});

els.authEntry?.addEventListener("click", () => openAuth("signin"));
els.trainerChip?.addEventListener("click", toggleMeMenu);
// The menu's entries press the side menu's own links, so they go exactly where those go.
meMenu?.addEventListener("click", (e) => {
  const item = e.target.closest(".me-item");
  if (!item) return;
  const go = item.dataset.meGo;
  closeMeMenu();
  if (item.hasAttribute("data-me-edit")) {
    accountTab = "picture";
    if (view === "account") { renderAccount(); window.scrollTo({ top: 0, behavior: "auto" }); }
    else setView("account");
    return;
  }
  if (go) document.querySelector(`.site-header .nav .nav-btn[data-view="${go}"]`)?.click();
});
document.addEventListener("pointerdown", (e) => {
  if (!meMenu || meMenu.hidden || !(e.target instanceof Element)) return;
  if (e.target.closest("#me-menu, #trainer-chip")) return;
  closeMeMenu();
});
document.addEventListener("keydown", (e) => {
  if (!meMenu || meMenu.hidden) return;
  if (e.key === "Escape") {
    closeMeMenu();
    els.trainerChip?.focus({ preventScroll: true });
    return;
  }
  // Up and down walk the entries, like any menu, when the chip or an entry has the focus.
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || !document.activeElement?.closest("#me-menu, #trainer-chip")) return;
  const items = [...meMenu.querySelectorAll(".me-item")];
  const at = items.indexOf(document.activeElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (at + 1) % items.length : (at <= 0 ? items.length : at) - 1;
  e.preventDefault();
  items[next]?.focus({ preventScroll: true });
});
// Tabbing on past the last entry (or back past your name) closes it.
meMenu?.addEventListener("focusout", (e) => {
  if (e.relatedTarget instanceof Element && !e.relatedTarget.closest("#me-menu, #trainer-chip")) closeMeMenu();
});

els.settingsBody.addEventListener("change", (e) => {
  const feed = e.target.closest("[data-feed-share]");
  if (feed) {
    const on = feed.checked;
    api("/api/me", { method: "PATCH", body: JSON.stringify({ feedShare: on }) })
      .then((data) => {
        if (data?.user) cloudUser = data.user;
        toast(on ? "Your big pulls will show in the Discord feed." : "You're out of the Discord feed.");
      })
      .catch((err) => {
        feed.checked = !on;
        toast(err.message || "Couldn't save that.");
      });
    return;
  }
  const toggle = e.target.closest("[data-setting]");
  if (!toggle) return;
  if (toggle.dataset.setting === "phoneTilt") {
    setPhoneTilt(toggle.checked).then((on) => { toggle.checked = on; updateSettingsSummary(); });
    return;
  }
  state.settings[toggle.dataset.setting] = toggle.checked;
  saveState(state);
  applySettings();
  // Only the summary line changes, so patch it rather than rebuilding the page
  // out from under the switch the pointer is still on.
  updateSettingsSummary();
});

els.settingsBody.addEventListener("click", (e) => {
  const look = e.target.closest("[data-look]");
  if (look) {
    if (!canUseTheme(look.dataset.look, unlockedThemes())) {
      toast("That one's locked for now.");
      return;
    }
    state.settings.palette = look.dataset.look;
    saveState(state);
    applySettings();
    look.parentElement.querySelectorAll("[data-look]").forEach((btn) => {
      const on = btn === look;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    updateSettingsSummary();
    return;
  }
  const choice = e.target.closest("[data-choice]");
  if (choice) {
    state.settings[choice.dataset.choice] = choice.dataset.value;
    saveState(state);
    applySettings();
    // Move the plate in place (so it can slide to the new word) instead of rebuilding the page.
    choice.parentElement.querySelectorAll("[data-choice]").forEach((btn) => {
      const on = btn === choice;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    updateSettingsSummary();
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
  if (e.target.closest("[data-make-recovery]")) {
    const btn = e.target.closest("[data-make-recovery]");
    btn.disabled = true;
    try {
      const res = await api("/api/me/recovery", { method: "POST", body: "{}" });
      recoveryInfo = { loaded: true, createdAt: Number(res.createdAt) || Date.now(), code: res.code };
      renderAccount();
    } catch (error) {
      btn.disabled = false;
      toast(error.message || "Couldn't make a code. Try again.");
    }
    return;
  }
  if (e.target.closest("[data-copy-recovery]")) {
    try {
      await navigator.clipboard.writeText(recoveryInfo.code);
      toast("Recovery code copied.");
    } catch {
      const range = document.createRange();
      const el = els.accountBody.querySelector("#recovery-value");
      if (el) {
        range.selectNodeContents(el);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
      toast("Select the code and copy it.");
    }
    return;
  }
  inspectFromEl(e.target);
  const open = e.target.closest("[data-open-auth]");
  if (open) {
    openAuth(open.dataset.openAuth);
    return;
  }
  const tab = e.target.closest("[data-acct-tab]");
  if (tab) {
    const wasMode = els.accountBody.dataset.mode;
    accountTab = tab.dataset.acctTab;
    renderAccount();
    if (els.accountBody.dataset.mode !== wasMode) {
      // Edit profile and Security are screens of their own: arrive at their top, and come back to the trainer card.
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    // "nearest" left the tabs under the phone's tab bar, so a tap on Claim seemed
    // to do nothing; bring the tabs up under the header instead.
    const tabs = els.accountBody.querySelector(".acct-tabs");
    if (tabs) {
      const head = document.querySelector(".site-header")?.getBoundingClientRect().bottom || 0;
      const top = tabs.getBoundingClientRect().top;
      if (top < head || top > innerHeight * 0.6) window.scrollTo({ top: Math.max(0, scrollY + top - head - 8), behavior: reduceMotion() ? "auto" : "smooth" });
    }
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
  const periodBtn = e.target.closest("[data-quest-period]");
  if (periodBtn) {
    questPeriod = periodBtn.dataset.questPeriod;
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
    const claimRect = questClaim.getBoundingClientRect();
    try {
      const data = await api("/api/quests/claim", { method: "POST", body: JSON.stringify({ id: questClaim.dataset.questClaim }) });
      afterEconomy(data.save);
      freshClaims = new Set([questClaim.dataset.questClaim]);
      renderHeader();
      renderAccount();
      restoreFocus(focused);
      flyCoins(claimRect, { count: data.coins >= 100 ? 6 : 4 });
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
    await claimAchievements({ id: claim.dataset.claim }, row?.name || "Claimed", claim.getBoundingClientRect());
    return;
  }
  const claimAll = e.target.closest("#claim-all");
  if (claimAll) {
    if (achievementClaiming) return;
    claimAll.setAttribute("aria-disabled", "true");
    await claimAchievements({ all: true }, "Cleared the wall", claimAll.getBoundingClientRect());
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
    await signOut();
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
    if (info) toast(info.beta ? `The ${info.name} frame is for beta testers. Join in the casino with an invite code.` : `Reach ${frameNeed(info).toLowerCase()} to wear the ${info.name} frame.`);
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
  if (e.target.closest("#copy-profile-link")) {
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


/**
 * Cash in one achievement, or every ready one. The reward comes back from the
 * worker rather than the table here, so the coins shown are the coins paid.
 */
let achievementClaiming = false;
async function claimAchievements(body, label, fromRect) {
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
    if (fromRect && data.coins) flyCoins(fromRect, { count: body.all ? 6 : 4 });
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

els.socialBody?.addEventListener("submit", async (e) => {
  if (e.target.id !== "social-chat-form") return;
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
    securityChanged();
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
    authTab = ["signin", "recover"].includes(tab.dataset.authTab) ? tab.dataset.authTab : "signup";
    endTwoStep();
    renderAuth();
    // Switching forms: only the title and the form swap in (css/pages/auth.css), the packs stay put.
    els.authBody.querySelector(".auth-page")?.classList.add("is-swap");
    els.authBody.querySelector("form input")?.focus({ preventScroll: true });
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
    return;
  }
  const show = e.target.closest("[data-pass-show]");
  if (show) {
    const input = show.parentElement.querySelector("input");
    const on = input.type === "password";
    input.type = on ? "text" : "password";
    show.textContent = on ? "Hide" : "Show";
    show.setAttribute("aria-pressed", String(on));
    return;
  }
  if (e.target.closest("[data-welcome-rip]")) {
    setView("home");
    ripOnShow();
    return;
  }
  if (e.target.closest("[data-welcome-claim]")) {
    els.dailyBtn.click();
    return;
  }
  if (e.target.closest("[data-welcome-recovery]")) {
    accountTab = "security";
    setView("account");
    return;
  }
  if (e.target.closest("[data-welcome-look]")) {
    accountTab = "look";
    setView("account");
  }
});

/* Signup: say whether the handle is free while it's typed, and put each error under its own field. */
let handleCheck = 0;
let handleTimer = 0;
const HANDLE_HINT = "Letters, numbers and _. It's your name on the site and your profile link.";

function setHandleHint(text, bad = false) {
  const hint = els.authBody?.querySelector("#handle-hint");
  if (!hint) return;
  hint.textContent = text;
  hint.classList.toggle("bad", bad);
  hint.closest(".field")?.classList.toggle("has-error", bad);
  syncSignupSteps(hint.closest("form"));
}

function cleanHandle(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 16);
}

els.authBody?.addEventListener("input", (e) => {
  const field = e.target.closest?.(".field, .check-row");
  if (field?.querySelector(".field-error")) {
    field.querySelector(".field-error").remove();
    if (field.dataset.field !== "handle" || !field.querySelector(".handle-hint.bad")) field.classList.remove("has-error");
  }
  if (e.target.closest?.("#signup-form")) syncSignupSteps(e.target.closest("#signup-form"));
  if (e.target.name !== "handle" || !e.target.closest("#signup-form")) return;
  clearTimeout(handleTimer);
  const typed = e.target.value;
  const handle = cleanHandle(typed);
  const ticket = ++handleCheck;
  if (!typed.trim()) return setHandleHint(HANDLE_HINT);
  if (handle.length < 3) return setHandleHint(`At least 3 letters or numbers${handle !== typed.trim().toLowerCase().replace(/^@/, "") ? `. Spaces and symbols are dropped: @${handle || "..."}` : ""}.`, false);
  handleTimer = setTimeout(async () => {
    try {
      const res = await api(`/api/auth/handle?h=${encodeURIComponent(handle)}`);
      if (ticket !== handleCheck) return;
      const changed = handle !== typed.trim().toLowerCase().replace(/^@/, "");
      if (res.free) setHandleHint(`${changed ? `Saved as @${handle}. ` : ""}poke-pack.rip/u/${handle} is yours if you want it.`);
      else setHandleHint(`@${handle} is taken. Try another.`, true);
    } catch {
      /* offline or an older Worker: signup still checks */
    }
  }, 300);
});

function fieldError(form, name, message) {
  const field = form.querySelector(`[data-field="${name}"]`) || form.querySelector(`[name="${name}"]`)?.closest(".field, .check-row");
  if (!field) return false;
  field.classList.add("has-error");
  field.querySelector(".field-error")?.remove();
  const p = document.createElement("span");
  p.className = "field-error";
  p.setAttribute("role", "alert");
  p.textContent = message;
  field.append(p);
  return true;
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
  form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
  const err = form.querySelector("#auth-error");
  if (err) err.textContent = "";
}

/** Which field a Worker error belongs to, so it shows where the problem is. */
function errorField(message) {
  const m = String(message || "");
  if (/handle/i.test(m)) return "handle";
  if (/password/i.test(m)) return "password";
  if (/birth|13 or older/i.test(m)) return "birthYear";
  if (/terms|tick the box/i.test(m)) return "agree";
  return "";
}

/** The form's own checks before it asks the Worker. Returns true when there was something to fix. */
function signupProblems(form, data) {
  let bad = false;
  const handle = cleanHandle(data.get("handle"));
  if (handle.length < 3) bad = fieldError(form, "handle", "Pick a handle with at least 3 letters or numbers.") || bad;
  else if (form.querySelector("#handle-hint.bad")) bad = true;
  const pass = String(data.get("password") || "");
  if (pass.length < 6) bad = fieldError(form, "password", "Use at least 6 characters.") || bad;
  if (!data.get("birthMonth") || !data.get("birthYear")) bad = fieldError(form, "birthYear", "Pick your birth month and year.") || bad;
  if (!data.has("agree")) bad = fieldError(form, "agree", "Tick the box to agree to the Terms and Privacy policy.") || bad;
  return bad;
}

els.authBody?.addEventListener("submit", async (e) => {
  const signup = e.target.closest("#signup-form");
  if (signup) {
    e.preventDefault();
    if (busyPack()) return;
    const data = new FormData(signup);
    const keep = !activeTrainer() && data.has("keep") && pendingClaim;
    const err = els.authBody.querySelector("#auth-error");
    const submit = signup.querySelector('button[type="submit"]');
    if (submit?.disabled) return;
    clearFieldErrors(signup);
    if (signupProblems(signup, data)) {
      signup.querySelector(".has-error input, .has-error select")?.focus();
      return;
    }
    const handle = cleanHandle(data.get("handle"));
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Making your trainer";
    }
    try {
      const result = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          // The display name starts as the handle; Account > Profile changes it.
          name: String(data.get("name") || handle),
          handle,
          password: String(data.get("password") || ""),
          color: signupColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)].id,
          ...readAgeFields(data),
          localSave: keep ? pendingClaim : undefined,
        }),
      });
      cloudUser = result.user;
      pendingClaim = null;
      localStorage.setItem(CLOUD_SEEN_KEY, "1");
      applyCloudSave(result.save);
      await hydrateAfterAccountChange();
      if (casinoReturnPath || battleReturnPath) returnAfterAuth();
      else {
        authTab = "welcome";
        renderAuth();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      if (keep) toast("The cards from this browser are on your account.");
    } catch (error) {
      if (error instanceof ApiError && error.payload?.underage) {
        blockAge();
        renderAuth();
        return;
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Create account";
      }
      const message = error.message || "Couldn't create that account.";
      const where = errorField(message);
      if (where === "handle" && /taken/i.test(message)) setHandleHint(`@${handle} is taken. Try another.`, true);
      else if (!(where && fieldError(signup, where, message)) && err) err.textContent = message;
      signup.querySelector(".has-error input, .has-error select")?.focus();
    }
    return;
  }
  const recoverForm = e.target.closest("#recover-form");
  if (recoverForm) {
    e.preventDefault();
    if (busyPack()) return;
    const data = new FormData(recoverForm);
    const err = els.authBody.querySelector("#auth-error");
    const submit = recoverForm.querySelector('button[type="submit"]');
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    try {
      const result = await api("/api/auth/recover", {
        method: "POST",
        body: JSON.stringify({
          handle: String(data.get("handle") || ""),
          code: String(data.get("code") || ""),
          password: String(data.get("password") || ""),
        }),
      });
      cloudUser = result.user;
      pendingClaim = null;
      localStorage.setItem(CLOUD_SEEN_KEY, "1");
      applyCloudSave(result.save);
      await hydrateAfterAccountChange();
      accountTab = "security";
      setView("account");
      toast("Password reset. That code is used up, so make a new one.");
    } catch (error) {
      if (submit) submit.disabled = false;
      if (err) err.textContent = error.message || "Couldn't reset the password.";
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
    // Two-step on (js/account-security.js): the password was right, now the app's code.
    if (result.twoStep) {
      startTwoStep(result.ticket, String(data.get("handle") || "").replace(/^@/, "").toLowerCase());
      authTab = "twostep";
      renderAuth();
      els.authBody.querySelector("#signin-totp-form input")?.focus({ preventScroll: true });
      return;
    }
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
    // Already on the sign-in or sign-up form: leave what is typed there alone.
    if (view === "auth" && els.authBody.querySelector("form")) {
      toast("Sign in or create an account to claim coins.");
      return;
    }
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
    if (view === "auth") {
      // The form is redrawn (a guest with coins gets the keep-progress row): what was typed stays.
      const typed = [...els.authBody.querySelectorAll("form [name]")].map((el) => [el.form.id, el.name, el.type === "checkbox" ? el.checked : el.value]);
      const focused = document.activeElement?.closest?.("#auth-body form") ? [document.activeElement.form?.id, document.activeElement.name] : null;
      renderAuth();
      for (const [formId, name, value] of typed) {
        const el = formId && els.authBody.querySelector(`#${formId} [name="${name}"]`);
        if (!el || el.type === "hidden") continue;
        if (el.type === "checkbox") el.checked = value;
        else el.value = value;
      }
      const form = els.authBody.querySelector("#signup-form");
      if (form) syncSignupSteps(form);
      if (focused?.[0]) els.authBody.querySelector(`#${focused[0]} [name="${focused[1]}"]`)?.focus({ preventScroll: true });
    }
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
  // The picture the shelf shows for it: the product's photo, the drawn carton or fanned packs, or a promo product's card. Only the booster pack row shows the pack.
  const photo = offer ? offer.image || productImage(liveSet.id, offer.id) : "";
  const promoCard = offer && !photo && offer.kind ? offer.promos?.map((id) => byId[id]).find((card) => card?.image || card?.imageSmall) : null;
  const drawn = Boolean(offer && !photo && !promoCard && wrap);
  els.priceArt.classList.toggle("is-drawn", drawn);
  els.priceArt.innerHTML = photo
    ? `<img src="${esc(photo)}" alt="" decoding="async" />`
    : promoCard
      ? `<img src="${esc(promoCard.imageSmall || promoCard.image)}" alt="" decoding="async" />`
      : drawn
        ? drawnProduct(liveSet, offer, [0, 1, 2].map((i) => liveSet.wrappers[i % liveSet.wrappers.length]))
        : wrap && !offer
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
// The tab bar's raised Rip button rips the set on show (on Home, the pack in the middle of the shelf).
document.getElementById("tab-rip")?.addEventListener("click", () => ripOnShow());
// Home: a sideways swipe across the pack steps to the next set (touch only;
// the stage is touch-action: pan-y, so the page still scrolls up and down).
{
  const stage = document.getElementById("home-stage");
  let from = null;
  stage?.addEventListener("pointerdown", (e) => {
    from = e.pointerType === "mouse" ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
  }, { passive: true });
  stage?.addEventListener("pointerup", (e) => {
    if (!from || from.id !== e.pointerId) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    from = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    homeSwiped = true;
    setTimeout(() => { homeSwiped = false; }, 450);
    stepShelf(dx < 0 ? 1 : -1);
  }, { passive: true });
  stage?.addEventListener("pointercancel", () => { from = null; }, { passive: true });
}
// Search from the desktop menu opens the same dialog as the header's search.
document.querySelectorAll("[data-search-open]").forEach((btn) => btn.addEventListener("click", (e) => {
  e.currentTarget.closest(".nav-more")?.removeAttribute("open");
  keepRailOpen();
  document.getElementById("search-open")?.click();
}));
// Search opens from More on a phone: the menu closes behind it.
document.getElementById("search-open-tab")?.addEventListener("click", (e) => {
  e.currentTarget.closest(".nav-more")?.removeAttribute("open");
});
// On a phone the trainer in the HUD opens the menu (the tab bar has no More key).
const tabMore = document.querySelector(".tabbar .nav-more");
document.getElementById("hud-me")?.addEventListener("click", () => {
  if (!tabMore) return;
  tabMore.toggleAttribute("open");
  if (tabMore.open) tabMore.querySelector(".nav-more-list .nav-btn")?.focus({ preventScroll: true });
});
// The last input, for theme.css: Safari rings a button that script focuses after a
// tap (the pack's ✕ as it opens, Open another at the end), so rings stay for keys.
document.addEventListener("pointerdown", () => { document.documentElement.dataset.input = "pointer"; }, true);
document.addEventListener("keydown", () => { document.documentElement.dataset.input = "keys"; }, true);
document.addEventListener("pointerdown", (e) => {
  if (!tabMore?.open || !(e.target instanceof Element)) return;
  if (e.target.closest(".tabbar .nav-more, #hud-me")) return;
  tabMore.removeAttribute("open");
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !tabMore?.open) return;
  tabMore.removeAttribute("open");
  document.getElementById("hud-me")?.focus({ preventScroll: true });
});
// The Lite switch in the HUD: the same setting as Settings, Lite.
document.getElementById("lite-toggle")?.addEventListener("change", (e) => {
  state.settings.lite = e.currentTarget.checked;
  saveState(state);
  applySettings();
  if (view === "settings") renderSettings();
});

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
  // "entered": the entrance is over for this pack, so letting go early can't replay its fade-in.
  els.packBody.classList.add("tearing", "entered");
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

els.spread.addEventListener("click", (e) => {
  const share = e.target.closest("[data-share-pull]");
  if (share) {
    const card = currentPulls[Number(share.dataset.sharePull)];
    if (card) sharePull(card, { pulled: true });
    return;
  }
  const key = e.target.closest("[data-pulls-view]");
  if (key) setPullsView(key.dataset.pullsView);
  else inspectFromEl(e.target);
});
els.opReceipt.addEventListener("click", (e) => inspectFromEl(e.target));

// Each card keeps its own settling motion when the pointer moves to its neighbour.
const cardMotion = createCardMotion({
  settings: () => state.settings,
  reducedMotion: reduceMotion,
  blocked: () => flipBusy || els.focusCard?.classList.contains("flipping"),
});
function clearGlare() { cardMotion.clear(); }
/** Let a card on show light itself. Function declaration: the pack opening calls it from code above. */
function presentFace(face) { cardMotion.present(face); }

/* Phone tilt. A phone that can report its lean (and has no hover) gets a plain link under the inspector's card;
   the setting remembers the yes. iOS forgets the permission with every page load and only answers inside a tap, so
   a remembered yes is asked for again, silently, on the first tap of a visit. */
const TILT_CAPABLE = typeof DeviceOrientationEvent !== "undefined" && matchMedia("(hover: none) and (pointer: coarse)").matches;
let tiltLive = false;
async function setPhoneTilt(on) {
  tiltLive = await cardMotion.tiltPhone(on);
  if (on && !tiltLive) toast(TILT_CAPABLE ? "Your phone didn't share its motion. Allow Motion & Orientation for this site, then try again." : "Tilt needs a phone or tablet.");
  if (on && tiltLive) toast("Tilt is on. Lean your phone to move the light.");
  state.settings.phoneTilt = tiltLive;
  saveState(state);
  if (tiltLive) document.querySelectorAll("[data-inspect-tilt]").forEach((el) => el.closest("p")?.remove());
  return tiltLive;
}
if (TILT_CAPABLE && state.settings.phoneTilt) {
  const rearm = () => {
    document.removeEventListener("click", rearm, true);
    cardMotion.tiltPhone(true).then((on) => { tiltLive = on; });
  };
  if (typeof DeviceOrientationEvent.requestPermission === "function") document.addEventListener("click", rearm, true);
  else rearm();
}

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
els.sellBulkBtn.addEventListener("click", sellPackBulk);
els.viewPullsBtn.addEventListener("click", () => {
  const batched = Boolean(sealedRun?.onDone); // the order's results take it to the collection
  finishRip({ collection: true });
  if (!batched) setView("collection");
});
els.leavePack?.addEventListener("click", leavePack);

els.binderBody?.addEventListener("click", async (e) => {
  const sharedPage = e.target.closest("[data-share-page]");
  if (sharedPage) { await toggleProfilePage(Number(sharedPage.dataset.sharePage)); return; }
  if (binderSwiped) return; // the click that ends a swipe
  const goto = e.target.closest("[data-goto]");
  if (goto) { binderGo(Number(goto.dataset.goto)); return; }
  const flip = e.target.closest("[data-flip]");
  if (flip) {
    const step = Number(flip.dataset.flip) * (binderWide() ? 2 : 1);
    if (!binderOpen) { if (step > 0) binderGo(0); }
    else if (step < 0 && binderSpread === 0) { if (!binderArranging) binderGo(-1); }
    else binderGo(binderSpread + step);
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
      binderMark = { i: binderPicking, kind: "in" };
      binderPicking = null;
      await pushBinder();
      renderBinder();
    }
    return;
  }
  const pocket = e.target.closest("[data-pocket]");
  if (pocket) {
    const to = Number(pocket.dataset.pocket);
    if (binderArranging && binderHolding != null) { await moveBinderCard(binderHolding, to); return; }
    binderArranging = true; // an empty pocket is the way into Arrange
    binderPicking = to;
    cardPicker.reset();
    renderBinder();
    return;
  }
  const out = e.target.closest("[data-unpocket]");
  if (out) {
    clearBinderSlot(state, Number(out.dataset.unpocket));
    binderMark = { i: Number(out.dataset.unpocket), kind: "out" };
    await pushBinder();
    // The last card out of a page on show: the profile hides an empty page, so
    // take it off the profile too rather than leave it holding one of the slots.
    const page = Math.floor(Number(out.dataset.unpocket) / BINDER_PAGE);
    const left = (state.binder || []).slice(page * BINDER_PAGE, (page + 1) * BINDER_PAGE).some(Boolean);
    if (!left && (activeTrainer()?.binderPages || []).includes(page)) await toggleProfilePage(page);
    renderBinder();
    return;
  }
  // Arrange: a tap picks a card up, the next tap on a pocket puts it there (two cards trade places).
  const held = binderArranging && !e.target.closest(".picker") ? e.target.closest("[data-slot]") : null;
  if (held) {
    const i = Number(held.dataset.slot);
    if (binderHolding == null) { binderHolding = i; renderBinder(); }
    else if (binderHolding === i) { binderHolding = null; renderBinder(); }
    else await moveBinderCard(binderHolding, i);
    return;
  }
  // anything else in a filled pocket opens the inspector
  inspectFromEl(e.target);
});

/** Move the card in pocket `from` to pocket `to`; a card already there takes its place. */
async function moveBinderCard(from, to) {
  const slots = state.binder || (state.binder = []);
  while (slots.length <= Math.max(from, to)) slots.push(null);
  [slots[from], slots[to]] = [slots[to], slots[from]];
  saveState(state);
  binderHolding = null;
  binderMark = { i: to, kind: "in" };
  await pushBinder();
  // A page on show that just lost its last card comes off the profile, as when a card is taken out.
  const page = Math.floor(from / BINDER_PAGE);
  const left = (state.binder || []).slice(page * BINDER_PAGE, (page + 1) * BINDER_PAGE).some(Boolean);
  if (!left && (activeTrainer()?.binderPages || []).includes(page)) await toggleProfilePage(page);
  renderBinder();
}

// A sideways swipe on the pages turns them; the click it ends with is swallowed.
let binderSwipe = null;
let binderSwiped = false;
els.binderBody?.addEventListener("pointerdown", (e) => {
  binderSwipe = e.target.closest(".binder-spread") && !e.target.closest(".picker") ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
});
els.binderBody?.addEventListener("pointerup", (e) => {
  const from = binderSwipe;
  binderSwipe = null;
  if (!from || from.id !== e.pointerId || binderPicking != null) return;
  const dx = e.clientX - from.x;
  const dy = e.clientY - from.y;
  if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - from.t > 700) return;
  binderSwiped = true;
  setTimeout(() => { binderSwiped = false; }, 80);
  const step = (dx < 0 ? 1 : -1) * (binderWide() ? 2 : 1);
  if (!binderOpen) { if (step > 0) binderGo(0); }
  else if (step < 0 && binderSpread === 0) { if (!binderArranging) binderGo(-1); }
  else binderGo(binderSpread + step);
});
els.binderBody?.addEventListener("pointercancel", () => { binderSwipe = null; });

document.getElementById("binder-arrange")?.addEventListener("click", () => {
  if (!activeTrainer()) { openAuth("signin"); return; }
  binderArranging = !binderArranging;
  binderHolding = null;
  binderPicking = null;
  if (!binderArranging) binderEditor?.close();
  if (binderArranging && !binderOpen) { binderGo(binderSpread); return; } // opens the cover onto the page it was last on
  renderBinder();
});

matchMedia("(min-width: 860px)").addEventListener?.("change", () => { if (view === "binder") renderBinder(); });

if (els.binderBody) cardPicker.attach(els.binderBody);

els.binderAddPage?.addEventListener("click", async () => {
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  addBinderPage(state);
  await pushBinder();
  const before = binderOpen ? binderSpread : -1;
  binderOpen = true;
  binderSpread = binderViewOf(binderPageCount() - 1);
  binderTurn = Math.sign(binderSpread - before);
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
  collRise = true;
  renderCollection({ refreshSets: false });
});
document.getElementById("rarity-groups")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-group]");
  if (!btn || btn.dataset.group === rarityGroup) return;
  rarityGroup = btn.dataset.group;
  rarityMode = "all";
  collRise = true;
  renderCollection({ refreshSets: false });
});
// The show filter: All, Owned, Missing, Spares as slanted words.
els.ownedFilter?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-owned]");
  if (!btn || btn.dataset.owned === ownedMode) return;
  ownedMode = btn.dataset.owned;
  collRise = true;
  renderCollection({ refreshSets: false });
});
document.getElementById("coll-sort")?.addEventListener("click", () => {
  state.settings.collSort = state.settings.collSort === "value" ? "number" : "value";
  saveState(state);
  collRise = true;
  renderCollection({ refreshSets: false });
});
// The set's name in the HUD box opens the set picker (every set, then the sets by era); picking one closes it.
const collAllSets = document.getElementById("coll-all-sets");
function toggleSetBrowser(open) {
  if (!collAllSets || !els.bulkSets) return;
  collAllSets.setAttribute("aria-expanded", String(open));
  els.bulkSets.hidden = !open;
  const picker = document.getElementById("coll-picker");
  if (picker) picker.hidden = !open;
  if (open) {
    const row = document.getElementById("coll-quick-sets");
    if (row) {
      row.innerHTML = setTabsHtml();
      centerQuickSet("coll-quick-sets");
    }
    renderBulkSets();
  }
}
collAllSets?.addEventListener("click", () => toggleSetBrowser(els.bulkSets.hidden));
document.getElementById("coll-quick-sets")?.addEventListener("error", hideBrokenSetArt, true);
// A set picked from the picker's quick row: the document handler activates it; the picker closes.
document.getElementById("coll-quick-sets")?.addEventListener("click", (e) => {
  if (e.target.closest("[data-quick-set]")) toggleSetBrowser(false);
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
  } else if (img.classList.contains("setlogo")) {
    img.closest(".sethead")?.classList.add("no-logo");
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
els.setSwitcher?.addEventListener("error", hideBrokenSetArt, true);
document.getElementById("shop-quick-sets")?.addEventListener("error", hideBrokenSetArt, true);
document.getElementById("shop-logo")?.addEventListener("error", hideBrokenSetArt);
els.packGrid.addEventListener("error", hideBrokenSetArt, true);
els.sealedGrid?.addEventListener("error", hideBrokenSetArt, true);
document.getElementById("home-set-picker")?.addEventListener("error", hideBrokenSetArt, true);
els.bulkSets?.addEventListener("error", hideBrokenSetArt, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (shareSheet.close()) return;
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
let sealedLoadedAt = 0;
async function loadSealedPrices() {
  // These files only change with a deploy. The price ticker calls this again a moment after boot (and every
  // few minutes) to lay the Worker's newest prices over them, which needs no second download and parse of
  // products.json and box-contents.json (over 700 KB): lay them over what is already loaded.
  if (sealedLoadedAt && Date.now() - sealedLoadedAt < 30 * 60 * 1000 && Object.keys(productList).length) {
    applyLatestSealed(sealedPrices, productList, PLAYABLE_SETS);
    return;
  }
  // The three files are asked for together: one after the other was three round trips before the page could draw.
  const grab = (url) =>
    fetch(url, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  const [products, contents, prices] = await Promise.allSettled([
    grab("data/products.json"),
    grab("data/box-contents.json"),
    grab("data/sealed.json"),
  ]);
  productList = products.status === "fulfilled" ? products.value : {};
  boxContents = contents.status === "fulfilled" ? contents.value : {};
  if (prices.status === "fulfilled") {
    try {
      sealedPrices = prices.value;
      PLAYABLE_SETS.forEach((set) => {
        const pack = prices.value[set.id]?.boosterPack;
        if (typeof pack === "number" && pack > 0) set.cost = money(pack);
      });
    } catch {
      /* keep the costs from catalog.js */
    }
  }
  // The Worker's newest TCGplayer prices, once they have arrived (js/liveprices.js), sit over the baked files.
  applyLatestSealed(sealedPrices, productList, PLAYABLE_SETS);
  if (Object.keys(productList).length) sealedLoadedAt = Date.now();
}

let allSetsLoaded = false;
let everySetLoaded = null;

/** The sets the player has something from: cards, reverses, slabs, binder pockets or recent pulls. */
function setsThePlayerHas() {
  const ids = new Set();
  const add = (id) => {
    const set = id && setForCardId(id);
    if (set?.dataFile) ids.add(set.id);
  };
  for (const [id, n] of Object.entries(state.collection || {})) if (n > 0) add(id);
  for (const [id, n] of Object.entries(state.reverses || {})) if (n > 0) add(id);
  for (const slab of state.graded || []) add(slab?.cardId);
  for (const slot of state.binder || []) add(slot?.id);
  for (const entry of (state.history || []).slice(0, 200)) add(entry?.id);
  return PLAYABLE_SETS.filter((set) => ids.has(set.id));
}

async function loadSetsInto(sets) {
  let next = 0;
  const lane = async () => {
    while (next < sets.length) {
      const set = sets[next++];
      if (!set.dataFile || setCache[set.id]) continue;
      try {
        await loadSetData(set);
      } catch {
        /* a missing set just doesn't count toward the total */
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, lane));
}

/**
 * Pull in the other sets the player owns cards from, so net worth counts their
 * whole collection. Runs after first paint. Only the sets they have something
 * from: every set is about 180 files (over 20 MB unpacked), far too much for a
 * phone to fetch and parse on every visit just to add up a total.
 */
async function loadAllSets() {
  await loadSetsInto(setsThePlayerHas());
  allSetsLoaded = true;
  trackWorth();
  if (view === "home") renderHome();
  priceTicker?.tick?.();
}

/** Every set's cards, for the few screens that list across all of them (a promo set's "in the sets' own boxes"). */
function loadEverySet() {
  everySetLoaded ||= loadSetsInto(PLAYABLE_SETS.slice()).then(() => {
    if (view === "shop" && liveSet.promoSet && packPhase === "idle") renderPromoElsewhere();
    priceTicker?.tick?.();
  });
  return everySetLoaded;
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
    // Already signed in: the sign-in form has nothing to do, so show the account.
    if (activeTrainer() && authTab !== "welcome") {
      setView("account", { history: "replace" });
      return;
    }
    openAuth("signin");
    return;
  }
  const atRoot = path === "/" || path === "/index.html";
  // A shared pull (poke-pack.rip/pull/<card>): its set's page with the card open.
  const pulled = path.match(/^\/pull\/([a-z0-9]+-[a-z0-9-]+)$/i);
  if (pulled && (await openSharedPull(pulled[1].toLowerCase()))) return;
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
  // An address that names no page (a made-up route, a pull of a card that does not exist) lands on the
  // start page with the address corrected, so a reload or a copied link is not the bad one again.
  const start = state.settings.startView;
  if (start && start !== "home" && VIEW_SECTIONS[start]) {
    setView(start, { history: "replace" });
    return;
  }
  if (!atRoot) history.replaceState({ view: "home" }, "", "/");
  setView("home", { history: "none" });
}

/*
 * The card game (/play). Its code loads the first time the page is opened, so
 * nobody who never plays pays for it. Rules: js/tcg/; screen: js/tcg-page.js.
 */
const TCG_ROUTE = /^\/play(?:\/match|\/friends|\/online\/[a-f0-9]{20}|\/deck\/[a-z0-9]+)?$/;
let tcgPath = "/play";
let tcgPage = null;
let tcgLoading = null;
function showTcg() {
  if (tcgPage) return tcgPage.show(tcgPath);
  els.viewTcg.innerHTML = `<div class="tg-page"><div class="rt-skel tg-loading">Loading</div></div>`;
  tcgLoading ||= import("./tcg-page.js?v=43")
    .then(({ initTcg }) => {
      tcgPage = initTcg({
        root: els.viewTcg,
        esc,
        toast,
        buzz,
        reduceMotion: () => reduceMotion() || state.settings.motion === false || state.settings.lite,
        navigate: (path) => {
          if (!TCG_ROUTE.test(path)) return navigateTo(path);
          const same = view === "tcg";
          tcgPath = path;
          if (!same) return setView("tcg");
          if (normalizePath(location.pathname) !== path) history.pushState({ view: "tcg" }, "", path);
          window.scrollTo(0, 0);
          tcgPage.show(path);
        },
        playerName: () => (cloudUser?.handle ? `@${cloudUser.handle}` : "You"),
        signedIn: () => Boolean(cloudUser),
        refreshSave: () => refreshSession(),
        storeKey: () => cloudUser?.id || cloudUser?.handle || "guest",
        owned: () => ownedMapNow(),
        findCard,
        loadOwnedSets: () => loadSetsInto(setsThePlayerHas()),
        loadSet: (id) => loadSetData(getSet(id)),
        setOf: (id) => setForCardId(id),
        face: (card) => tcgFace(card, { stamp: false }),
        backHtml: () => cardBackHtml(state.gear, liveSet.cardBack),
        coinFaces: () => {
          const coin = equippedCoin(state.gear, getGearCatalog());
          return coin && !coin.house && coin.front ? { heads: coinOf(coin, "front"), tails: coinOf(coin, "back") } : null;
        },
      });
      if (view === "tcg") tcgPage.show(tcgPath);
    })
    .catch(() => {
      tcgLoading = null;
      if (view === "tcg") els.viewTcg.innerHTML = `<div class="tg-page"><p class="rt-empty tg-none">Couldn't load the game. Check your connection and try again.</p></div>`;
    });
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
  // After joining the beta: the badge and the frame read the fresh account.
  refreshUser: () => refreshSession().then(() => renderHeader()),
  toast,
  buzz,
  ownedCards: casinoOwnedCards,
  ownedSlabs: casinoOwnedSlabs,
  allCards: casinoAllCards,
  wishlist: () => wishlist.ids(), // the Upgrader's Wishlist tab
  invalidateCards: invalidateCasinoCards,
  sealedTargets: casinoSealedTargets,
  inspect: (card) => openInspect(card.id, Boolean(card.reverse), card.reverseKind || ""),
  // Mystery Tins show their chase cards as real faces: the full cards for these ids (their sets load on demand),
  // the face itself, and the light a card on show gives itself.
  cardsById: async (ids) => {
    const sets = new Set(ids.map((id) => setForCardId(id)).filter((set) => set?.dataFile));
    await Promise.all([...sets].map((set) => loadSetData(set).catch(() => null)));
    return new Map(ids.map((id) => [id, findCard(id)]).filter(([, card]) => card));
  },
  tcgFace,
  presentFace,
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
  navigate: (path, opts) => {
    // The "In the casino" rows link to the game their slab is sitting in.
    if (/^\/casino\/(?:coinflip|jackpot)\/[a-zA-Z0-9-]{1,80}$/.test(path)) {
      casinoPath = path;
      setView("casino");
      return;
    }
    if (!GRADING_ROUTE.test(path) && !CERT_ROUTE.test(path)) return;
    gradingPath = path;
    setView("grading", opts?.replace ? { history: "replace" } : undefined);
  },
  coinTag,
});

// trades: player-to-player trading (js/trades-page.js). The Worker moves everything;
// an accepted trade answers with a save that applyCloudSave takes as-is.
const trades = initTrades({
  root: els.viewTrades,
  api,
  user: () => cloudUser,
  getSave: () => state,
  applySave: (save) => {
    if (!cloudUser || !save) return;
    applyCloudSave(save);
    renderHeader();
  },
  refreshSave: async () => {
    await refreshSession();
    renderHeader();
  },
  cardEntries: tradeCardEntries,
  inspect: async (card) => {
    const set = tradeSetOf(card.id);
    if (set && !findCard(card.id)) await loadSetData(set).catch(() => null);
    openInspect(card.id, Boolean(card.reverse));
  },
  toast,
  navigate: (path) => {
    if (!TRADES_ROUTE.test(path)) return;
    tradesPath = path.toLowerCase();
    setView("trades");
  },
  signIn: () => openAuth("signin"),
  friends: currentFriends,
  faceHtml,
  levelTag,
  onChange: () => notifySignedIn(),
});

/** The set a card id belongs to, retired sets included (a traded card can come from any of them). */
function tradeSetOf(id) {
  return ALL_SETS.slice().sort((a, b) => b.id.length - a.id.length).find((set) => String(id).startsWith(`${set.id}-`)) || null;
}

/** A collection map (and its reverse counts) as priced cards for the trade builder: [{ id, qty, rev, name, number, rarity, image, small, value }]. */
async function tradeCardEntries(collection, reverses) {
  const ids = Object.keys(collection || {}).filter((id) => collection[id] > 0);
  const sets = new Set(ids.filter((id) => !findCard(id)).map(tradeSetOf).filter(Boolean));
  await Promise.all([...sets].map((set) => loadSetData(set).catch(() => null)));
  const out = [];
  for (const id of ids) {
    const card = findCard(id);
    if (!card?.image) continue;
    const qty = collection[id];
    out.push({
      id,
      qty,
      rev: Math.min(qty, reverses?.[id] || 0),
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
  showOpened: (opened, opts) => batchOpen.show(keepThemeDecks(opened), opts),
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

/* ---- Share a pull (js/share-pull.js; the link's preview is worker/seo.js) ---- */

/** Open the share sheet for a card: a picture of it and its /pull/ link. */
function sharePull(card, { pulled = false } = {}) {
  const trainer = activeTrainer();
  const owns = pulled || ownedNow(card.id) > 0;
  const by = trainer && owns ? trainer.handle : "";
  const rarity = rarityLine(card);
  const no = numberLine(card);
  const set = setForCard(card);
  const reverseKind = card.reverse ? reverseKindOf(card) : "";
  shareSheet.open({
    id: card.id,
    image: `/${String(card.image || card.imageSmall || "").replace(/^\//, "")}`,
    coin: "/assets/coins/pp-coin-v1.svg",
    mark: "/assets/mark-v3.png",
    name: card.name,
    line: [rarity, no === "Energy" ? "" : no].filter(Boolean).join(", "),
    rarity,
    ty: pullTy(card),
    rest: [card.reverse ? foilWord(card) : "", no === "Energy" ? "" : no, set.name].filter(Boolean).join(", "),
    setName: set.name,
    valueText: coinText(sellValue(card)),
    by,
    title: `${by ? `@${by} pulled ` : ""}${card.name}, ${rarity}`,
    heading: pulled ? "Share this pull" : "Share this card",
    url: pullUrl(card, { by, reverseKind }),
  });
}

/** /pull/<card>?by=<handle>&r=<reverse>: show the card over its set's page. */
async function openSharedPull(cardId) {
  const set = setForCardId(cardId);
  if (!set) return false;
  const params = new URLSearchParams(location.search);
  const opened = await activateSet(set.id, false, true).catch(() => false);
  if (!opened) return false;
  history.replaceState(history.state, "", location.pathname);
  setView("shop", { history: "replace" });
  await loadSetData(set).catch(() => null);
  if (!findCard(cardId)) return true;
  // A reverse flag the set's packs cannot deal (Base Set has no reverse holos) is ignored.
  const r = canPullReverse(set, findCard(cardId)) ? params.get("r") || "" : "";
  openInspect(cardId, Boolean(r), r === "pokeball" || r === "masterball" ? r : "");
  const by = (params.get("by") || "").toLowerCase();
  if (/^[a-z0-9_]{3,16}$/.test(by)) toast(`Pulled by @${by}`);
  return true;
}

/** Open a card from the search index (search, the wishlist): the inspector looks a card up by id, so its set loads first. */
async function openIndexedCard({ id, setId }) {
  try {
    const set = getSet(setId);
    if (set.id !== setId) throw new Error("unknown set");
    await loadSetData(set);
    if (!findCard(id)) throw new Error("missing card");
    openInspect(id);
  } catch {
    toast("Couldn't open that card.");
  }
}

// Home's "This week" (js/this-week.js): the newest big update and the week's price moves.
const thisWeek = initThisWeek({
  root: document.getElementById("home-week"),
  esc,
  coinAmount,
  coinText,
  toCoins: (usd) => Math.max(0.01, money(Number(usd) * COINS_PER_USD)),
  openCard: openIndexedCard,
  loadMovers: () =>
    fetch("/api/prices/movers").then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }),
  notes: () => patchNotes,
});

const siteSearch = initSearch({
  root: document.getElementById("site-search"),
  opener: [document.getElementById("search-open"), document.getElementById("search-open-tab")].filter(Boolean),
  openDialog,
  closeDialog,
  sealedItems: searchSealedItems,
  openCard: openIndexedCard,
  heart: (id, name) => wishlist.heart(id, name),
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
  showOpened: (opened, opts) => batchOpen.show(keepThemeDecks(opened), opts),
  navigate: (path) => navigateTo(path),
  signIn: () => openAuth("signin"),
  toast,
});

// The loading screen's percentage (index.html, ppBoot): boot reports each step as it finishes.
const bootAt = (step) => window.ppBoot?.at(step);

async function boot() {
  bootAt(1); // every script is in
  try {
    // The session is asked for alongside the shop files, not after them (one round trip less before first paint);
    // it is still applied after them, as before.
    const me = api("/api/me");
    me.catch(() => {}); // refreshSession reads the failure
    try {
      prefetchSetFiles(setIdFromPath(location.pathname) || state.activeSetId || DEFAULT_SET_ID);
    } catch {
      /* only a head start */
    }
    await Promise.all([loadSealedPrices(), loadPatchNotes(), loadGearCatalog()]);
    bootAt(2); // shop files
    await refreshSession(me);
    bootAt(3); // who is signed in
    // Back from Discord's consent screen: link it (js/account-security.js), then land on Security.
    finishDiscordReturn().catch(() => {});
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
    bootAt(4); // the set's cards
    applySettings();
    renderHeader();
    scheduleDailyTick();
    const back = new Image();
    back.src = backSrc();
    await routeFromLocation();
    bootAt(5); // the page is drawn

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
    window.ppBoot?.paint?.(); // the loading screen ends on 100%
  };
  if (reduceMotion()) {
    go();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(go));
}

// Account > Security and the sign-in page's two-step step (js/account-security.js).
initSecurity({
  api,
  toast,
  esc,
  rerender: () => renderAccount(),
  onSecurityTab: () => view === "account" && accountTab === "security",
  getRecovery: () => recoveryInfo,
  loadRecovery: () => loadRecoveryInfo(),
  renderAuth: () => renderAuth(),
  backToSignin: () => {
    authTab = "signin";
    renderAuth();
  },
  onSignedIn: async (result) => {
    cloudUser = result.user;
    pendingClaim = null;
    localStorage.setItem(CLOUD_SEEN_KEY, "1");
    applyCloudSave(result.save);
    await hydrateAfterAccountChange();
    returnAfterAuth();
    toast(`Signed in as ${result.user.name}.`);
  },
});

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
    if (socialTab === "rankings" && Date.now() - rankingsDrawnAt < 60_000) return;
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

// The server says this browser is no longer signed in (signed out in another tab, or the session ran out)
// while the page still shows the account: show it signed out, once, the way Sign out does.
let sessionLostBusy = false;
window.addEventListener("pp:signed-out", async () => {
  if (!cloudUser || sessionLostBusy) return;
  sessionLostBusy = true;
  try {
    cloudUser = null;
    pendingClaim = null;
    setPersistProgress(false);
    wipeProgressMemory();
    await hydrateAfterAccountChange();
    VIEW_RENDER[view]?.();
    toast("You were signed out. Sign in to keep playing.");
  } catch {
    /* the next page load starts signed out */
  } finally {
    sessionLostBusy = false;
  }
});

// A tab left sitting should notice the hourly stack is ready again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    renderHeader();
    scheduleDailyTick();
    checkForNewDeploy();
  } else {
    hiddenSince = Date.now();
  }
});

/* A phone keeps a tab alive for days, so a fix can be live while the tab still
   runs the old app.js and catalog (Noah saw a pack art that had been replaced
   an hour earlier). Coming back to a tab that sat hidden for a while, ask the
   server which app.js?v= it serves now and reload when it moved on, but only
   when nothing is in progress: no pack open, no dialog, no field being typed in. */
let hiddenSince = 0;
async function checkForNewDeploy() {
  const now = Date.now();
  if (!hiddenSince || now - hiddenSince < 30_000) return;
  const mine = new URL(import.meta.url).searchParams.get("v");
  if (!mine) return;
  try {
    const res = await fetch("/", { cache: "no-store" });
    const live = (await res.text()).match(/js\/app\.js\?v=(\d+)/)?.[1];
    if (!live || live === mine) return;
    const busy =
      packPhase !== "idle" ||
      document.querySelector("dialog[open], .batch-open:not(.hidden)") ||
      document.activeElement?.matches?.("input, textarea, select, [contenteditable]");
    if (!busy && document.visibilityState === "visible") location.reload();
  } catch {
    /* offline: try again next time the tab comes back */
  }
}

/* The first-run tour (js/tour.js): once, on Home, when nothing is open over it.
   Settings and the welcome screen can start it again. */
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element) || !e.target.closest("[data-tour-start]")) return;
  setView("home");
  setTimeout(startTour, 450);
});
maybeStartTour(
  () =>
    view === "home" &&
    packPhase === "idle" &&
    document.visibilityState === "visible" &&
    !document.querySelector("dialog[open], .batch-open:not(.hidden), .tabbar .nav-more[open]")
);

document.addEventListener("click", (e) => {
  const btn = e.target instanceof Element && e.target.closest("[data-show-all-sealed]");
  if (!btn) return;
  sealedShownAll.add(liveSet.id);
  btn.closest(".promo-grid")?.querySelectorAll(".is-more").forEach((el) => el.classList.remove("is-more"));
  btn.remove();
});
