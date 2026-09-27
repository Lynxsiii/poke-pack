import { createCardMotion } from "./card-motion.js";
import { foilExtras } from "./foil-maps.js";
import { initFx, tintFrom } from "./fx.js";
import { PROFILE_PAGE_LIMIT } from "./profile-pages.js";
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
} from "./catalog.js";
import { HIT_RARITIES, isHit } from "./engine.js";
import { initRadio } from "./radio.js";
import { initSocial, notifySignedIn, faceHtml, sendChat, refreshLounge, currentFriends } from "./social.js";
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
import { unlockedTitles, titleContext, TITLES, isTitleUnlocked } from "./titles.js";
import {
  ACHIEVEMENTS,
  ACH_CATEGORIES,
  achievementById,
  achievementContext,
  achievementProgress,
  isAchievementDone,
  readyToClaim,
  claimTotal,
} from "./achievements.js";
import { QUESTS } from "./quests.js";
import { startLivePrices, applyCachedPrices } from "./liveprices.js";
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

function applyCloudSave(save) {
  if (!save) return;
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
  state.binder = Array.isArray(save.binder) ? save.binder : [];
  state.worthLog = Array.isArray(save.worthLog) ? save.worthLog : [];
  if (save.createdAt) state.createdAt = save.createdAt;
  if (save.activeSetId) state.activeSetId = save.activeSetId;
  setPersistProgress(true);
  saveState(state);
}

function wipeProgressMemory() {
  state.coins = 0;
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
  state.worthLog = [];
  state.binder = [];
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
      ? "The showcase binder lives on your account so it can follow you — and, later, trade."
      : "Cards, coins, and sales live on your account, not this browser.";
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
let tearing = false;
let tearStart = { x: 0, y: 0 };
let lastPointer = { x: 0, y: 0 };
let tearCut = 0;
let tearLift = 0;
let tearDir = null;
let tearAnim = 0;
let tearPose = { dx: 0, dy: 0, rot: 0 };
let lastCrumbCut = 0;
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
  promoGrid: document.getElementById("promo-grid"),
  setSwitcher: document.getElementById("set-switcher"),
  heroArt: document.getElementById("hero-art"),
  shopKicker: document.getElementById("shop-kicker"),
  shopTitle: document.getElementById("shop-title"),
  shopLede: document.getElementById("shop-lede"),
  shopPackTitle: document.getElementById("shop-pack-title"),
  shopPackSub: document.getElementById("shop-pack-sub"),
  shopOdds: document.getElementById("shop-odds"),
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
  bulkLede: document.getElementById("bulk-lede"),
  bulkPulse: document.getElementById("bulk-pulse"),
  bulkSets: document.getElementById("bulk-sets"),
  sellDuplicates: document.getElementById("sell-duplicates"),
  statOwned: document.getElementById("stat-owned"),
  statOwnedLabel: document.getElementById("stat-owned-label"),
  statPacks: document.getElementById("stat-packs"),
  statPulls: document.getElementById("stat-pulls"),
  viewHome: document.getElementById("view-home"),
  viewShop: document.getElementById("view-shop"),
  viewCollection: document.getElementById("view-collection"),
  viewBinder: document.getElementById("view-binder"),
  binderBody: document.getElementById("binder-body"),
  binderCount: document.getElementById("binder-count"),
  binderAddPage: document.getElementById("binder-add-page"),
  viewCatalog: document.getElementById("view-catalog"),
  viewAccount: document.getElementById("view-account"),
  viewProfile: document.getElementById("view-profile"),
  viewSocial: document.getElementById("view-social"),
  viewAuth: document.getElementById("view-auth"),
  viewSettings: document.getElementById("view-settings"),
  viewNotes: document.getElementById("view-notes"),
  homeKicker: document.getElementById("home-kicker"),
  homePulse: document.getElementById("home-pulse"),
  homeStage: document.getElementById("home-stage"),
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
  packTop: document.getElementById("pack-top"),
  packRest: document.getElementById("pack-rest"),
  packTopArt: document.getElementById("pack-top-art"),
  packRestArt: document.getElementById("pack-rest-art"),
  packMouth: document.getElementById("pack-mouth"),
  tearEdge: document.getElementById("tear-edge"),
  crumbs: document.getElementById("tear-crumbs"),
  focusWrap: document.getElementById("focus-wrap"),
  focusMeta: document.getElementById("focus-meta"),
  focusAura: document.getElementById("focus-aura"),
  focusCard: document.getElementById("focus-card"),
  focusPrev: document.getElementById("focus-prev"),
  focusNext: document.getElementById("focus-next"),
  hitFx: document.getElementById("hit-fx"),
  opMotes: document.getElementById("op-motes"),
  hitBanner: document.getElementById("hit-banner"),
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
  if (HIT_RARITIES.has(card.rarity) || ["Rare", "Pikachu Rare", "Cosmos", "Metal"].includes(card.rarity)) return "holo";
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
  return `<span class="focus-mark${rev}" title="${esc(label)}" aria-label="${esc(label)}">${pips}</span>`;
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
 * "Metal" is a brass card: one broad reflection, no rainbow.
 */
function foilLook(card) {
  if (!(card?.promo || card?.energy) || !card.foilAs || card.reverse) return card;
  if (card.foilAs === "Frame") return { ...card, rarity: "Common", reverse: true, reverseKind: "cosmos" };
  if (card.foilAs === "Reverse Cosmos") return { ...card, rarity: "Common", reverse: true, reverseKind: "galaxy" };
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
  const extra = foilExtras(card, assetUrl);
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

function cardBack() {
  return `<div class="tcg back">
    <img src="${esc(liveSet.cardBack)}" alt="Pokémon TCG card back" draggable="false" />
  </div>`;
}

function setOwned() {
  return ownedCount(state, setCards);
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
 * Header button label, split so a phone can drop the wording and keep the
 * number. "Claim +100" becomes "+100" and "Ready in 2h" becomes "2h", which is
 * the difference between the brand fitting in the top bar and being cut off.
 */
function shortLabel(lead, value) {
  return `<span class="btn-word">${esc(lead)} </span>${esc(value)}`;
}

function renderHeader() {
  const trainer = activeTrainer();
  if (!trainer) {
    els.coinCount.textContent = "—";
    els.dailyBtn.disabled = false;
    els.dailyBtn.innerHTML = shortLabel("Claim", `+${DAILY_BONUS}`);
    els.statOwned.textContent = `0/${liveSet.totalCount}`;
    els.statPacks.textContent = "0";
    els.statPulls.textContent = "0";
  } else {
    const wait = msUntilDaily(state);
    els.coinCount.textContent = coin(state.coins);
    els.dailyBtn.disabled = wait > 0;
    els.dailyBtn.innerHTML = wait > 0
      ? shortLabel("Ready in", waitLabel(wait))
      : shortLabel("Claim", `+${DAILY_BONUS}`);
    els.statOwned.textContent = `${setOwned()}/${liveSet.totalCount}`;
    els.statPacks.textContent = state.packsOpened;
    els.statPulls.textContent = state.pulls;
  }
  if (els.statOwnedLabel) els.statOwnedLabel.textContent = `${liveSet.name} cards`;
  els.authEntry?.classList.toggle("hidden", Boolean(trainer));
  els.trainerChip?.classList.toggle("hidden", !trainer);
  if (trainer && els.trainerChip) {
    const color = avatarColor(trainer.color);
    els.trainerChip.style.setProperty("--avatar", color.hex);
    els.trainerAvatar.innerHTML = `<img src="${esc(avatarSrc(trainer.avatar, trainer.avatarStyle))}" alt="" />`;
    els.trainerAvatar.classList.toggle("pixel", avatarStyle(trainer.avatarStyle) === "pixel");
    els.trainerChipName.textContent = trainer.name;
    els.trainerChipHandle.textContent = `@${trainer.handle}`;
  }
}

function renderSetChrome() {
  const wrapCount = liveSet.wrappers.length;
  const month = liveSet.released.replace(/ \d+,/, "");
  if (els.shopKicker) els.shopKicker.textContent = `${liveSet.edition} · ${month}`;
  if (els.shopTitle) els.shopTitle.textContent = `${liveSet.name}.`;
  if (els.shopLede) els.shopLede.textContent = liveSet.lede || liveSet.blurb;
  if (els.shopPackTitle) els.shopPackTitle.textContent = `${liveSet.name} boosters`;
  if (els.shopPackSub) {
    els.shopPackSub.textContent = `${liveSet.packSize}-card pack. ${wrapCount} wrapper${
      wrapCount === 1 ? "" : "s"
    } from the ${month} print.`;
  }
  if (els.shopOdds) els.shopOdds.textContent = liveSet.oddsLine;
  if (els.binderTitle) els.binderTitle.textContent = liveSet.name;
  if (els.bulkKicker) {
    els.bulkKicker.textContent = `Collection · ${liveSet.edition} · ${month}`;
  }
  if (els.bulkLede) {
    els.bulkLede.textContent = `Everything you pull from ${liveSet.name} lands here. Sell extras at their listed value, or send keepers to the binder.`;
  }
  document.title = viewTitle();
}

function eraYears(sets) {
  const years = sets
    .map((set) => String(set.released).match(/\d{4}/)?.[0])
    .filter(Boolean);
  if (!years.length) return "";
  const newest = years[0];
  const oldest = years[years.length - 1];
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
          const live = Boolean(set.live && set.dataFile);
          const on = live && set.id === liveSet.id ? "active" : "";
          const { symbol } = setIdentity(set);
          if (!live) {
            return `<button type="button" class="rail-set is-queued" data-soon="${esc(set.name)}">
              <img class="rail-symbol" src="${esc(symbol)}" alt="" width="22" height="22" loading="lazy" decoding="async" />
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
            <img class="rail-symbol" src="${esc(symbol)}" alt="" width="22" height="22" loading="lazy" decoding="async" />
            <span class="rail-set-copy">
              <b>${esc(set.name)}</b>
              <small>${esc(owned)}</small>
            </span>
            <span class="live-tag">Live</span>
          </button>`;
        })
        .join("");
      return `<details class="rail-era" data-era="${esc(block.era)}" ${open}>
        <summary>
          <span class="rail-era-title">
            <b>${esc(block.era)}</b>
            <small>${esc(eraYears(block.sets))}</small>
          </span>
          <span class="rail-era-count">${
            liveCount && liveCount !== block.sets.length
              ? `${liveCount} live · ${block.sets.length}`
              : liveCount
                ? `${liveCount} live`
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

function renderHero() {
  if (!els.heroArt) return;
  els.heroArt.innerHTML = liveSet.heroIds
    .map((id, i) => {
      const card = byId[id];
      return `<div class="float-card" style="animation-delay:${-i * 1.4}s">${tcgFace(card, { small: true })}</div>`;
    })
    .join("");
}

function renderShop() {
  renderSetChrome();
  renderSwitcher();
  const quickSets = document.getElementById("shop-quick-sets");
  if (quickSets) quickSets.innerHTML = PLAYABLE_SETS.map((set) => `
    <button type="button" class="shop-quick-set${set.id === liveSet.id ? " active" : ""}"
      data-quick-set="${esc(set.id)}" aria-pressed="${set.id === liveSet.id}">${esc(set.name)}</button>`).join("");
  const signed = Boolean(activeTrainer());
  els.packGrid.innerHTML = liveSet.wrappers
    .map((wrap) => {
      const affordable = signed && state.coins >= liveSet.cost;
      const label = !signed ? "Sign in to rip" : affordable ? "Rip pack" : "Need coins";
      return `<article class="pack-card" data-wrapper="${wrap.id}">
        <div class="pack-tag">${wrap.tag}</div>
        <div class="shop-wrapper">
          ${packPicture(wrap)}
        </div>
        <h3>${wrap.name} pack</h3>
        <p class="blurb">${liveSet.blurb}</p>
        <div class="pack-meta">
          <span class="cost">✦ ${coin(liveSet.cost)}</span>
          <button class="buy" ${signed && !affordable ? "disabled" : ""}>
            ${label}
          </button>
        </div>
      </article>`;
    })
    .join("");
  tintFrom(els.packGrid.querySelector(".shop-wrapper img"));
  if (els.shopPackTrend) els.shopPackTrend.innerHTML = trendButton("boosterPack", `${liveSet.name} booster pack`);
  renderSealed();
  loadShopTrends();
}

/** Sets whose price history has loaded for the shop's trend buttons. */
const shopTrendSets = new Set();

/**
 * A pack's or box's market trend for the shop: a sparkline and the change
 * over three months, from data/prices/<set>.json. Tapping it opens the full
 * chart. A placeholder until the set's file arrives, and nothing at all for a
 * product with under two recorded prices.
 */
function trendButton(key, name) {
  const trend = productTrend(liveSet.id, key);
  if (!trend && shopTrendSets.has(liveSet.id)) return "";
  const attrs = `type="button" data-price-chart="${esc(key)}" data-price-name="${esc(name)}"`;
  if (!trend) {
    return `<button ${attrs} class="price-trend pending" aria-label="${esc(name)} price history">
      <span class="pt-spark" aria-hidden="true"></span>
      <span class="pt-copy"><b>Market</b><small>Loading prices</small></span>
    </button>`;
  }
  const way = trend.dir === "up" ? "up" : trend.dir === "down" ? "down" : "flat at";
  return `<button ${attrs} class="price-trend ${trend.dir}"
      aria-label="${esc(name)} price history: ${way} ${Math.abs(trend.pct).toFixed(1)}% over ${trend.span}">
    ${trend.spark}
    <span class="pt-copy"><b>${trend.change}</b><small>${trend.span}</small></span>
    <span class="pt-go" aria-hidden="true">Chart</span>
  </button>`;
}

/** Fetch the live set's price history once, then swap the placeholders for trends. */
function loadShopTrends() {
  const setId = liveSet.id;
  if (shopTrendSets.has(setId)) return;
  loadPriceHistory(setId).then((store) => {
    if (store) shopTrendSets.add(setId);
    if (liveSet.id !== setId) return;
    for (const grid of [els.shopPackTrend, els.sealedGrid, els.promoGrid]) {
      grid?.querySelectorAll(".price-trend.pending").forEach((el) => {
        el.outerHTML = store ? trendButton(el.dataset.priceChart, el.dataset.priceName) : "";
      });
    }
  });
}

/** The buy button's label, shared by the sealed and promo product cards. */
function productButton(offer) {
  const signed = Boolean(activeTrainer());
  const affordable = signed && state.coins >= offer.price;
  const confirming = sealedConfirm === offer.id && affordable;
  const label = !signed
    ? "Sign in to open"
    : !affordable
      ? "Need coins"
      : confirming
        ? `Confirm ✦ ${coin(offer.price)}`
        : `Open ${offer.short}`;
  return `<button class="buy${confirming ? " confirming" : ""}" ${signed && !affordable ? "disabled" : ""}>${label}</button>`;
}

/** "Nidorina promo" / "Moltres, Articuno and Zapdos promos". */
function promoNames(ids, pick = 0) {
  const cards = ids.map((id) => byId[id]).filter(Boolean);
  if (!cards.length) return "";
  if (pick === 1) {
    const names = cards.map((card) => card.name);
    return `one of ${names.length} promos: ${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
  }
  // The Pokémon Center ETB has the Nidorina promo twice, stamped and not.
  const counts = new Map();
  for (const card of cards) counts.set(card.name, (counts.get(card.name) || 0) + 1);
  const names = [...counts].map(([name, n]) => (n > 1 ? `${n} ${name}` : name));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `${list} promo${cards.length > 1 ? "s" : ""}`;
}

/** Booster boxes, ETBs and bundles for the live set, priced from data/sealed.json. */
function renderSealed() {
  if (!els.sealedGrid) return;
  const offers = sealedOffers(sealedPrices[liveSet.id], productList[liveSet.id]);
  els.sealedBlock.classList.toggle("hidden", !offers.length || !liveSet.wrappers.length);
  const single = Number(liveSet.cost) || 0;
  const stack = [0, 1, 2].map((i) => liveSet.wrappers[i % liveSet.wrappers.length]).filter(Boolean);
  els.sealedGrid.innerHTML = offers
    .map((offer) => {
      const each = offer.price / offer.packs;
      const vsSingle = single ? Math.round((1 - each / single) * 100) : 0;
      const deal =
        vsSingle >= 1 ? `${vsSingle}% under single packs` : vsSingle <= -1 ? `${-vsSingle}% over single packs` : "Same as single packs";
      const promo = promoNames(offer.promos, offer.pick);
      return `<article class="sealed-card" data-sealed="${esc(offer.id)}">
        <div class="sealed-stack" aria-hidden="true">
          ${stack.map((wrap) => `<span>${packPicture(wrap, " ")}</span>`).join("")}
        </div>
        <div class="sealed-copy">
          <h3>${esc(offer.name)}</h3>
          <p>${offer.packs} packs${promo ? ` + ${esc(promo)}` : ""} · ✦ ${coin(each)} each · ${esc(deal)}</p>
          ${trendButton(offer.id, `${liveSet.name} ${offer.name}`)}
        </div>
        <div class="pack-meta">
          <span class="cost">✦ ${coin(offer.price)}</span>
          ${productButton(offer)}
        </div>
      </article>`;
    })
    .join("");
  renderPromoProducts();
}

/** What a promo product holds, in one line: "29 packs + 1 Classic Collection pack". */
function productContents(offer) {
  const parts = [];
  if (offer.packs) parts.push(`${offer.packs} pack${offer.packs === 1 ? "" : "s"}`);
  for (const [key, n] of Object.entries(offer.special || {})) {
    const name = liveSet.specialPacks?.[key]?.wrapper?.name || key;
    parts.push(`${n} ${name} pack${n === 1 ? "" : "s"}`);
  }
  if (!parts.length && offer.kind === "deck") parts.push("60-card deck");
  if (offer.kind === "battle") parts.push("40-card deck");
  return parts.join(" + ");
}

/** "Nov 6" for a product that is still on preorder. */
function releaseNote(offer) {
  if (!offer.released) return "";
  const when = new Date(`${offer.released}T12:00:00Z`);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return "";
  return `Out ${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/**
 * Collections, tins, premium collections and battle decks for the live set:
 * the products that come with promo cards, from data/products.json. The
 * promo cards sit in front of the box photo, and each one can be inspected.
 */
function renderPromoProducts() {
  if (!els.promoGrid) return;
  const offers = promoOffers(productList[liveSet.id])
    .filter((offer) => offer.promos.every((id) => byId[id]));
  els.promoBlock.classList.toggle("hidden", !offers.length);
  els.promoGrid.innerHTML = offers
    .map((offer) => {
      const promos = offer.promos.map((id) => byId[id]);
      const note = releaseNote(offer);
      const values = promos.map((card) => sellValue(card));
      const worth = offer.pick
        ? `Promo worth ✦ ${coin(Math.min(...values))} to ✦ ${coin(Math.max(...values))}`
        : `Promo${promos.length === 1 ? "" : "s"} worth ✦ ${coin(values.reduce((sum, v) => sum + v, 0))}`;
      return `<article class="sealed-card promo-product" data-sealed="${esc(offer.id)}">
        <div class="promo-stage">
          ${offer.image ? `<img class="promo-box" src="${esc(offer.image)}" alt="" loading="lazy" decoding="async" />` : ""}
          <div class="promo-fan count-${Math.min(promos.length, 4)}">
            ${promos
              .slice(0, 4)
              .map(
                (card) => `<button type="button" class="promo-face" ${inspectAttrs(card)}
                  title="${esc(card.name)} · ${esc(numberLine(card))}" aria-label="Inspect the ${esc(card.name)} promo">
                  ${tcgFace(card, { small: true, stamp: false, lazy: true })}
                </button>`
              )
              .join("")}
          </div>
          ${note ? `<span class="promo-note">${esc(note)}</span>` : ""}
        </div>
        <div class="sealed-copy">
          <h3>${esc(offer.name)}</h3>
          <p>${esc(productContents(offer))} · ${esc(promoNames(offer.promos, offer.pick))}</p>
          <p class="promo-worth">${worth}</p>
          ${trendButton(offer.id, offer.name)}
        </div>
        <div class="pack-meta">
          <span class="cost">✦ ${coin(offer.price)}</span>
          ${productButton(offer)}
        </div>
      </article>`;
    })
    .join("");
}

async function activateSet(id, force = false) {
  if (packPhase !== "idle") {
    toast("Finish this pack first.");
    return;
  }
  const next = getSet(id);
  if (next.id === liveSet.id && setCards.length && !force) return;
  try {
    if (!setCache[next.id]) {
      setCache[next.id] = await fetch(next.dataFile, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    }
    applyCachedPrices(setCache[next.id], next.id);
  } catch {
    toast(`Couldn't load ${next.name}.`);
    return;
  }
  liveSet = next;
  state.activeSetId = next.id;
  saveState(state);
  bulkEra = liveSet.era || liveSet.edition || bulkEra;
  setCards = setCache[next.id];
  cards = [...setCards, ...BASIC_ENERGY];
  byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  activeWrapper = liveSet.wrappers[0];
  try {
    fillRarityFilter();
    renderHero();
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
}

function spareCopies(set = liveSet) {
  const prefix = `${set.id}-`;
  let n = 0;
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (id.startsWith(prefix) && count > 1) n += count - 1;
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
      const on = block.era === bulkEra ? "on" : "";
      return `<button type="button" class="bulk-era ${on}" data-era="${esc(block.era)}">
        <b>${esc(block.era)}</b>
        <small>${esc(eraYears(block.sets) || eraCountLabel(block))}</small>
      </button>`;
    })
    .join("");
  const setBtns = (active?.sets || [])
    .map((set) => {
      const live = Boolean(set.live && set.dataFile);
      const { symbol } = setIdentity(set);
      if (!live) {
        return `<button type="button" class="bulk-set-card is-queued" data-soon="${esc(set.name)}">
          <img class="rail-symbol" src="${esc(symbol)}" alt="" width="28" height="28" loading="lazy" decoding="async" />
          <span class="bulk-set-copy">
            <b>${esc(set.name)}</b>
            <small>${esc(shortReleased(set))}</small>
          </span>
          <span class="soon">Queued</span>
        </button>`;
      }
      const on = set.id === liveSet.id ? "active" : "";
      return `<button type="button" class="bulk-set-card ${on}" data-set="${esc(set.id)}" ${
        ripping ? "disabled" : ""
      }>
        <img class="rail-symbol" src="${esc(symbol)}" alt="" width="28" height="28" loading="lazy" decoding="async" />
        <span class="bulk-set-copy">
          <b>${esc(set.name)}</b>
          <small>${ownedInSet(set)}/${set.totalCount}</small>
        </span>
        <span class="live-tag">Live</span>
      </button>`;
    })
    .join("");
  els.bulkSets.innerHTML = `
    <div class="bulk-eras" role="tablist" aria-label="Eras">${eraTabs}</div>
    <div class="bulk-era-sets">${setBtns || `<p class="bulk-era-empty">No sets in this era yet.</p>`}</div>`;
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

function renderCollection({ refreshSets = true } = {}) {
  const q = (els.search?.value || "").trim().toLowerCase();
  const rarity = rarityMode;
  const { owned, total, pct } = completion();
  const purse = binderValue(liveSet);
  const missingN = Math.max(0, total - owned);
  const spares = spareCopies();
  if (els.sellDuplicates) {
    els.sellDuplicates.disabled = !activeTrainer() || spares < 1;
    els.sellDuplicates.textContent = spares > 0
      ? `Sell ${spares} duplicate${spares === 1 ? "" : "s"}`
      : "No duplicates to sell";
  }

  if (els.bulkPulse) {
    els.bulkPulse.innerHTML = `
      ${activeTrainer() ? "" : accountGateHtml("bulk")}
      <div class="home-ring" style="--pct:${pct}" title="${esc(liveSet.name)} completion">
        <span><b>${pct}%</b><small>set</small></span>
      </div>
      <div class="home-pulse-stat"><b>${owned} / ${total}</b><span>Owned</span></div>
      <div class="home-pulse-stat"><b>${missingN}</b><span>Missing</span></div>
      <div class="home-pulse-stat"><b>✦ ${coin(purse.value)}</b><span>This set</span></div>
      <div class="home-pulse-stat"><b>${spares}</b><span>Spares</span></div>`;
  }

  els.ownedFilter?.querySelectorAll("[data-owned]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.owned === ownedMode);
  });
  els.rarityFilter?.querySelectorAll("[data-rarity]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.rarity === rarityMode);
  });
  if (refreshSets) renderBulkSets();

  const list = cards.filter((card) => {
    const count = state.collection[card.id] || 0;
    if (rarity !== "all" && card.rarity !== rarity) return false;
    if (ownedMode === "owned" && count < 1) return false;
    if (ownedMode === "missing" && count > 0) return false;
    if (ownedMode === "dupes" && count < 2) return false;
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
    const filterHint =
      ownedMode === "all" && rarity === "all" && !q
        ? `Sell any copy at live market, including your last.`
        : `Filtered from ${total} in the set.`;
    els.binderNote.textContent = `${shown} card${shown === 1 ? "" : "s"} · ${filterHint}`;
  }

  if (!list.length) {
    windowFaces("collection", [], [], tcgFace);
    els.dexGrid.innerHTML = `<div class="bulk-empty">
      <b>Nothing in this view.</b>
      <span>Try another filter, or rip a pack to fill the set.</span>
    </div>`;
    return;
  }

  const faces = list.map((card) => ((state.collection[card.id] || 0) < 1 ? card : withOwnedFoil(card)));
  els.dexGrid.innerHTML = list
    .map((card, i) => {
      const count = state.collection[card.id] || 0;
      const missing = count < 1;
      const face = faces[i];
      const sell = !activeTrainer()
        ? `<span class="slot-miss">Sign in</span>`
        : count > 0
        ? `<button type="button" class="sell-btn" data-sell="${card.id}">Sell${
            count > 1 ? " extra" : ""
          }</button>`
        : `<span class="slot-miss">Unpulled</span>`;
      return `<article class="binder-slot bulk-card ${missing ? "missing" : ""}">
        ${count > 1 ? `<span class="count-badge">×${count}</span>` : ""}
        <button type="button" class="slot-face" data-face="${i}" ${inspectAttrs(face)} aria-label="${esc(card.name)}"></button>
        <div class="slot-meta">
          <b>${esc(card.name)}</b>
          <span>${esc(numberLine(card))} · ${rarityPips(card.rarity)} ${esc(rarityLine(face))}</span>
        </div>
        <div class="slot-foot">
          <span class="slot-price">✦ ${coin(sellValue(card))}</span>
          ${sell}
        </div>
      </article>`;
    })
    .join("");
  windowFaces("collection", els.dexGrid.querySelectorAll("[data-face]"), faces, (face) =>
    tcgFace(face, { small: true, lazy: true })
  );
}

function catalogCard(set, { live = false } = {}) {
  const { logo, symbol } = setIdentity(set);
  const eager = live ? `fetchpriority="high"` : `loading="lazy"`;
  const released = set.released;
  const count = live ? set.totalCount : set.cards;
  const note = live
    ? `${set.edition} · ${set.packSize}-card boosters`
    : set.note || "Queued for poke-pack.rip";
  return `<article class="catalog-card ${live ? "live" : ""}">
    <div class="catalog-head">
      <img class="catalog-symbol" src="${esc(symbol)}" alt="" width="24" height="24"
        loading="lazy" decoding="async" />
      ${live ? `<span class="live-tag">Live</span>` : `<span class="soon">Coming</span>`}
    </div>
    <div class="catalog-art">
      <img class="catalog-logo" src="${esc(logo)}" alt="${esc(set.name)} set logo"
        ${eager} decoding="async" />
      <span class="logo-fallback">${esc(set.name)}</span>
    </div>
    <h3>${esc(set.name)}</h3>
    <div class="catalog-meta">
      <span>${esc(released)}</span>
      <span>${count === "—" ? "Count TBA" : `${esc(count)} cards`}</span>
    </div>
    <p class="catalog-note">${esc(note)}</p>
  </article>`;
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

function binderPageHtml(page) {
  const start = page * BINDER_PAGE;
  const pockets = Array.from({ length: BINDER_PAGE }, (_, i) => binderPocket(start + i)).join("");
  const shared = (activeTrainer()?.binderPages || []).includes(page);
  const empty = !(state.binder || []).slice(start, start + BINDER_PAGE).some(Boolean);
  return `<div class="binder-page">
    <div class="binder-page-toolbar"><span>Page ${page + 1}</span>
      <button type="button" class="ghost page-share" data-share-page="${page}" aria-pressed="${shared}" ${empty && !shared ? "disabled" : ""}>
        ${shared ? "Remove from profile" : "Display on profile"}
      </button></div>
    <div class="binder-pockets">${pockets}</div>
    <span class="binder-page-no">${page + 1}</span>
  </div>`;
}

/** Owned copies not already on show, newest sets first. */
function binderCandidates() {
  const out = [];
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (!count) continue;
    const card = findCard(id);
    if (!card) continue;
    const spare = spareFor(state, id);
    if (spare > 0) out.push({ card, spare });
  }
  return out.sort((a, b) => sellValue(b.card) - sellValue(a.card));
}

function binderPickerHtml(options) {
  if (binderPicking == null) return "";
  const body = options.length
    ? `<div class="picker-grid">${options
        .map(
          ({ card, spare }, i) => `<button type="button" class="picker-card" data-pick="${esc(card.id)}"
            title="${esc(card.name)}">
            <span class="picker-face" data-face="${i}"></span>
            <span class="picker-name">${esc(card.name)}</span>
            <span class="picker-meta">✦ ${coin(sellValue(card))}${spare > 1 ? ` · ${spare} spare` : ""}</span>
          </button>`
        )
        .join("")}</div>`
    : `<p class="panel-empty">Nothing spare to show yet — rip a pack, or take a card
       out of another pocket first.</p>`;
  return `<div class="picker-backdrop" data-picker-close></div>
    <div class="picker" role="dialog" aria-modal="true" aria-label="Choose a card">
      <div class="picker-head">
        <h3>Choose a card</h3>
        <button type="button" class="ghost" data-picker-close>Cancel</button>
      </div>
      ${body}
    </div>`;
}

function renderBinder() {
  if (!els.binderBody) return;
  if (!activeTrainer()) {
    if (els.binderCount) els.binderCount.textContent = "Sign in to keep a binder";
    els.binderBody.innerHTML = accountGateHtml("binder");
    return;
  }
  if (reconcileBinder(state)) saveState(state);

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
    els.binderCount.textContent = shown
      ? `${shown} card${shown === 1 ? "" : "s"} on show · ✦ ${coin(worth)}`
      : "No cards on show yet";
  }

  const options = binderPicking == null ? [] : binderCandidates();
  els.binderBody.innerHTML = `
    <div class="binder-sharing-note"><span>${(activeTrainer()?.binderPages || []).length} / ${PROFILE_PAGE_LIMIT} pages on your profile</span><small>Displayed pages update when you change their cards.</small></div>
    <div class="binder-spread">
      ${binderPageHtml(left)}
      ${right < pages ? binderPageHtml(right) : ""}
    </div>
    <div class="binder-nav">
      <button type="button" class="ghost" data-flip="-1" ${left === 0 ? "disabled" : ""}>‹ Back</button>
      <span>Pages ${left + 1}–${Math.min(right + 1, pages)} of ${pages}</span>
      <button type="button" class="ghost" data-flip="1" ${right >= pages - 1 ? "disabled" : ""}>Next ›</button>
    </div>
    ${binderPickerHtml(options)}`;
  const picker = els.binderBody.querySelector(".picker");
  windowFaces(
    "picker",
    picker?.querySelectorAll("[data-face]") || [],
    options.map((option) => option.card),
    (card) => tcgFace(card, { small: true, stamp: false, lazy: true }),
    picker
  );
}

function renderCatalog() {
  const eras = erasWithSets();
  const queued = eras.reduce((total, block) => total + block.queued.length, 0);
  const summary = `<div class="catalog-summary">
    <span class="now"><b>${PLAYABLE_SETS.length}</b> playable now</span>
    <span><b>${queued}</b> sets queued</span>
    <span><b>${eras.length}</b> eras</span>
  </div>`;

  const blocks = eras
    .map((block) => {
      const live = block.live.map((set) => catalogCard(set, { live: true })).join("");
      const rest = block.queued.map((set) => catalogCard(set)).join("");
      const count = block.sets.length;
      return `<section class="era-block">
      <div class="era-head">
        <h3>${esc(block.era)}</h3>
        <span class="era-span">${eraYears(block.sets)}</span>
        <span class="era-rule"></span>
        <span class="era-count">${count} set${count === 1 ? "" : "s"}</span>
      </div>
      <div class="catalog-grid">${live}${rest}</div>
    </section>`;
    })
    .join("");

  els.catalogEras.innerHTML = summary + blocks;
}

/* ---- Home / Account / Settings ------------------------------------------ */

const num = (n) => Number(n || 0).toLocaleString();
/* Coins are dollars, so they always read with cents. */
const coin = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function completion() {
  const total = setCards.length || liveSet.totalCount || 0;
  const owned = setOwned();
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : 0 };
}

function findCard(id) {
  if (byId[id]) return byId[id];
  for (const list of Object.values(setCache)) {
    const hit = list?.find((c) => c.id === id);
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
  const prefix = `${set.id}-`;
  return Object.entries(state.collection || {}).reduce(
    (n, [id, count]) => n + (count > 0 && id.startsWith(prefix) ? 1 : 0),
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
  const prefix = `${set.id}-`;
  let value = 0;
  let copies = 0;
  let best = null;
  for (const [id, count] of Object.entries(state.collection || {})) {
    if (!count || !id.startsWith(prefix)) continue;
    const card = findCard(id);
    if (!card) continue;
    const each = sellValue(card);
    value += each * count;
    copies += count;
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

function siteCompletion() {
  let owned = 0;
  let total = 0;
  for (const set of PLAYABLE_SETS) {
    const list = setCache[set.id];
    total += list?.length || set.totalCount || 0;
    owned += ownedInSet(set);
  }
  return { owned, total, pct: total ? Math.round((owned / total) * 100) : 0 };
}

function cheapestPackCost() {
  const costs = PLAYABLE_SETS.map((set) => Number(set.cost)).filter((n) => n > 0);
  return costs.length ? Math.min(...costs) : liveSet.cost;
}

function renderHome() {
  const { owned, total } = siteCompletion();
  const recent = historyCards(state.history, 8);
  const stars = topCardsOnSite(4);
  const chase = stars.length
    ? topCardsOnSite(8)
    : liveSet.heroIds.map((id) => byId[id]).filter(Boolean);
  const eras = erasWithSets();
  const queued = eras.reduce((n, era) => n + era.queued.length, 0);
  const upcoming = eras.find((era) => era.queued.length)?.queued.slice(0, 4) || [];
  const origin = ROADMAP.at(-1)?.sets?.at(-1);

  const worth = netWorth();
  const binder = totalBinderValue();
  const movers = topCardsOnSite(8);
  const topPrice = movers[0] ? sellValue(movers[0]) : 0;
  const floorCost = cheapestPackCost();
  const pnl = state.granted == null ? null : money(worth - state.granted);
  const pnlDir = pnl == null || Math.abs(pnl) < 0.005 ? "flat" : pnl > 0 ? "up" : "down";

  if (els.homePulse) {
    els.homePulse.innerHTML = `
      <div class="home-pulse-stat"><b>✦ ${coin(state.coins)}</b><span>Coins ready</span></div>
      <div class="home-pulse-stat"><b>${owned} / ${total}</b><span>Cards found</span></div>
      <div class="home-pulse-stat"><b>${num(state.packsOpened)}</b><span>Packs opened</span></div>`;
  }

  const homeSetPicker = document.getElementById("home-set-picker");
  if (homeSetPicker) {
    const featuredSets = PLAYABLE_SETS.slice(0, 4);
    if (!featuredSets.some((set) => set.id === liveSet.id)) featuredSets[3] = liveSet;
    homeSetPicker.innerHTML = `<span>Featured set</span><div class="home-set-options">${featuredSets
      .map((set) => `<button type="button" class="home-set-option${set.id === liveSet.id ? " active" : ""}"
        data-feature-set="${esc(set.id)}" aria-pressed="${set.id === liveSet.id}">${esc(set.name)}</button>`)
      .join("")}</div>`;
  }
  const homeRip = document.getElementById("home-rip");
  if (homeRip) homeRip.textContent = `Open ${liveSet.name} · ✦ ${coin(liveSet.cost)}`;

  if (els.homeStage) {
    const wrap = liveSet.wrappers?.[0];
    const featureCard = liveSet.heroIds.map((id) => byId[id]).find(Boolean);
    els.homeStage.innerHTML = `<div class="home-feature-top">
        <span>On the press table</span><span>${esc(liveSet.edition)}</span>
      </div>
      <div class="home-feature-art">
        <span class="home-sparks" aria-hidden="true"></span>
        ${featureCard ? `<div class="home-feature-card">${tcgFace(featureCard, { small: true })}</div>` : ""}
        ${wrap ? `<div class="home-feature-pack">${packPicture(wrap, "", liveSet)}</div>` : ""}
      </div>
      <div class="home-feature-bottom">
        <div><strong>${esc(liveSet.name)}</strong><span>${esc(liveSet.released)} · ${liveSet.totalCount} cards</span></div>
        <b>✦ ${coin(liveSet.cost)}</b>
      </div>
      <p class="home-feature-odds">${esc(liveSet.oddsLine)}</p>`;
    tintFrom(els.homeStage.querySelector(".home-feature-pack img"), els.homeStage.querySelector(".home-feature-pack"));
  }

  const setTiles = PLAYABLE_SETS.slice(0, 6).map((set) => {
    const have = ownedInSet(set);
    const pctSet = set.totalCount ? Math.round((have / set.totalCount) * 100) : 0;
    const fan = set.wrappers
      .slice(0, 3)
      .map((wrap) => `<div class="home-set-pack">${packPicture(wrap, "", set)}</div>`)
      .join("");
    return `<button type="button" class="home-set" data-play-set="${esc(set.id)}" data-set="${esc(set.id)}">
      <div class="home-set-fan">${fan}</div>
      <div class="home-set-copy">
        <span class="live-tag">Live</span>
        <h3>${esc(set.name)}</h3>
        <p>${esc(set.edition)} · ${esc(set.released)}</p>
        <div class="home-set-meta"><span>Binder</span><b>${have} / ${set.totalCount}</b></div>
        <div class="dex-bar"><span style="width:${pctSet}%"></span></div>
      </div>
    </button>`;
  }).join("");

  /*
   * One block instead of two near-identical filmstrips. The best pull is
   * promoted to a feature card with its rarity and what it is actually worth —
   * a single card sitting alone in a wide flex row just read as a layout bug,
   * and neither row said why any pull mattered.
   */
  const best = bestHistoryPull();
  const pullsBlock = best
    ? `<div class="home-block">
        <div class="home-block-head">
          <div>
            <h2>Your pulls</h2>
            <p>${num(state.pulls)} card${state.pulls === 1 ? "" : "s"} pulled from ${num(state.packsOpened)} pack${state.packsOpened === 1 ? "" : "s"}.</p>
          </div>
          <button type="button" class="text-btn" data-goto="collection">Binder →</button>
        </div>
        <div class="home-pulls">
          <article class="home-hit">
            <button type="button" class="home-hit-art" ${inspectAttrs(best.card)}
              aria-label="${esc(best.card.name)}">${tcgFace(best.card, { small: true, stamp: false })}</button>
            <div class="home-hit-copy">
              <h3>${esc(best.card.name)}</h3>
              <span class="home-hit-label">Best pull so far</span>
              <p>${rarityPips(best.card.rarity)} ${esc(rarityLine(best.card))}${
                best.entry?.at ? ` · ${esc(formatWhen(best.entry.at))}` : ""
              }</p>
              <div class="home-hit-value">✦ ${coin(sellValue(best.card))}</div>
            </div>
          </article>
          <div class="home-strip">
            <span class="home-strip-label">Just pulled</span>
            ${miniCardRow(recent, "", "home-film")}
          </div>
        </div>
      </div>`
    : `<div class="home-block">
        <div class="home-block-head">
          <div>
            <h2>On the hunt</h2>
            <p>The priciest art on the site. Rip a pack to start the binder.</p>
          </div>
        </div>
        ${miniCardRow(chase, "Load a set to see the chase.", "home-film")}
      </div>`;

  const upcomingChips = upcoming
    .map((set) => `<span class="home-chip">${esc(set.name)}</span>`)
    .join("");
  const originChip = origin
    ? `<span class="home-chip origin">${esc(origin.name)}</span>`
    : "";

  els.homeBody.innerHTML = `
    <div class="home-block">
      <div class="home-block-head">
        <div>
          <h2>Live now</h2>
          <p>${PLAYABLE_SETS.length} playable sets · same 11-card math on every wrapper.</p>
        </div>
        <button type="button" class="text-btn" data-goto="shop">All packs →</button>
      </div>
      <div class="home-sets">${setTiles}</div>
    </div>

    ${pullsBlock}

    <div class="home-block">
      <div class="home-block-head">
        <div>
          <h2>The market</h2>
          <p>Market-based card values help you decide what to keep or sell.</p>
        </div>
        <button type="button" class="text-btn" data-goto="collection">Binder →</button>
      </div>
      <div class="home-market">
        <article class="home-worth">
          <b>✦ ${coin(worth)}</b>
          <span class="home-worth-label">Collection value and coins</span>
          <p class="home-pnl ${pnlDir}">
            ${pnl == null
              ? `Coins plus every card you hold, across every set.`
              : `${pnlDir === "down" ? "▼" : pnlDir === "up" ? "▲" : "■"}
                 ✦ ${coin(Math.abs(pnl))} ${pnlDir === "down" ? "down" : pnlDir === "up" ? "up" : "even"}
                 since tracking began at ✦ ${coin(state.granted)}`}
          </p>
          <div class="home-worth-chart" id="home-worth-chart"></div>
          <p class="home-worth-note">${
            binder
              ? `✦ ${coin(binder)} sitting in the binder across ${PLAYABLE_SETS.length} live sets.`
              : `Nothing in the binder yet. Boosters start at ✦ ${coin(floorCost)}.`
          }</p>
          <div class="home-worth-cta">
            <button type="button" class="solid" data-goto="shop">Rip a pack · from ✦ ${coin(floorCost)}</button>
          </div>
        </article>
        <article class="home-board">
          <div class="home-board-head">
            <span>Most expensive on the site</span>
            <span class="home-board-note">market estimates</span>
          </div>
          <ol class="home-board-list">
            ${movers
              .map((card, i) => {
                const price = sellValue(card);
                const bar = topPrice ? Math.max(8, Math.round((price / topPrice) * 100)) : 0;
                const from = setForCardId(card.id);
                return `<li>
                  <button type="button" class="home-board-row" ${inspectAttrs(card)}
                    aria-label="${esc(card.name)}, ✦ ${coin(price)}">
                    <span class="home-board-rank">${i + 1}</span>
                    <span class="home-board-name">
                      <b>${esc(card.name)}</b>
                      <small>${esc(rarityLine(card))}${from ? ` · ${esc(from.name)}` : ""}</small>
                      <span class="home-board-meter" style="--pct:${bar}%"><span></span></span>
                    </span>
                    <span class="home-board-price">✦ ${coin(price)}</span>
                  </button>
                </li>`;
              })
              .join("")}
          </ol>
        </article>
      </div>
    </div>

    <div class="home-block">
      <div class="home-block-head">
        <div>
          <h2>The long game</h2>
          <p>${PLAYABLE_SETS.length} live · ${queued} queued, newest first, all the way to Base Set.</p>
        </div>
        <button type="button" class="text-btn" data-goto="catalog">Full catalog →</button>
      </div>
      <div class="home-road">${upcomingChips}${originChip}</div>
    </div>`;

  const worthChart = els.homeBody.querySelector("#home-worth-chart");
  if (worthChart) renderWorthChart(worthChart, state.worthLog, state.granted);
}

function formatWhen(ts) {
  const t = Number(ts) || 0;
  if (!t) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Month and year a trainer signed up — a stat tile has no room for a full date. */
function joinedOn(ts) {
  const t = Number(ts) || 0;
  if (!t) return "—";
  return new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function uniqueOwned() {
  return Object.values(state.collection || {}).filter((n) => n > 0).length;
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
  return PLAYABLE_SETS.map((set) => {
    const owned = ownedInSet(set);
    const total = set.totalCount || 1;
    return { set, owned, total, pct: Math.round((owned / total) * 100) };
  });
}

function ownedRarities() {
  const counts = {};
  for (const [id, n] of Object.entries(state.collection || {})) {
    if (!n) continue;
    const card = findCard(id);
    if (!card) continue;
    counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  }
  return counts;
}

/** Progress context shared by the badge wall, the title picker, and the hero. */
function achieveCtx() {
  return achievementContext(state, { signed: Boolean(activeTrainer()), rarities: ownedRarities() });
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
  };
}

function colorPicks(selected, attr = "data-color") {
  return `<div class="color-picks" role="radiogroup" aria-label="Avatar color">${AVATAR_COLORS.map(
    (c) => `<button type="button" class="color-pick${c.id === selected ? " on" : ""}" ${attr}="${esc(c.id)}" style="--swatch:${esc(c.hex)}" title="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`
  ).join("")}</div>`;
}

function avatarMark(trainer, extraClass = "trainer-mark") {
  const color = avatarColor(trainer?.color);
  const pixel = avatarStyle(trainer?.avatarStyle) === "pixel" ? " pixel" : "";
  return `<div class="${extraClass}${pixel}" style="--avatar:${esc(color.hex)}"><img src="${esc(avatarSrc(trainer?.avatar, trainer?.avatarStyle))}" alt="" /></div>`;
}

/** The career ribbon under the hero — the numbers, not the chrome. */
function careerTiles() {
  const worth = netWorth();
  const pnl = state.granted == null ? null : money(worth - state.granted);
  const dir = pnl == null || Math.abs(pnl) < 0.005 ? "flat" : pnl > 0 ? "up" : "down";
  const tiles = [
    ["✦ " + coin(state.coins), "Coins"],
    ["✦ " + coin(worth), "Net worth"],
    [num(state.packsOpened), "Packs ripped"],
    [num(state.pulls), "Cards pulled"],
    [num(uniqueOwned()), "Unique cards"],
    [num(reverseOwned()), "Reverse holos"],
  ];
  const pnlTile =
    pnl == null
      ? ""
      : `<div class="acct-tile pnl ${dir}"><b>${pnl > 0 ? "+" : pnl < 0 ? "−" : ""}✦ ${coin(Math.abs(pnl))}</b><span>Up or down</span></div>`;
  return `<div class="acct-tiles">${tiles
    .map(([value, label]) => `<div class="acct-tile"><b>${esc(value)}</b><span>${esc(label)}</span></div>`)
    .join("")}${pnlTile}</div>`;
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
  authTab = tab === "signin" ? "signin" : tab === "signup" ? "signup" : "signup";
  setView("auth");
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
  const signupForm = `
    <form id="signup-form" autocomplete="on">
      <label class="field">
        <span>Trainer name</span>
        <input name="name" maxlength="24" required placeholder="Ash Ketchum" />
      </label>
      <label class="field">
        <span>Handle</span>
        <input name="handle" maxlength="16" required placeholder="ripper" autocapitalize="off" spellcheck="false" />
        <span class="hint">3–16 letters, numbers, or underscores. Unique on the site.</span>
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="password" minlength="6" maxlength="64" required placeholder="At least 6 characters" autocomplete="new-password" />
        <span class="hint">Needed to sign in on another device. Trading later uses this account.</span>
      </label>
      <div class="field">
        <span>Avatar color</span>
        ${colorPicks(signupColor, "data-signup-color")}
      </div>
      ${
        keepDefault
          ? `<label class="check-row"><input type="checkbox" name="keep" checked /> Bring the packs and cards already on this browser</label>`
          : ""
      }
      <p class="form-error" id="auth-error"></p>
      <button class="solid" type="submit">Create account</button>
    </form>`;

  const signinForm = `<form id="signin-form" autocomplete="on">
      <label class="field">
        <span>Handle</span>
        <input name="handle" maxlength="16" required placeholder="ripper" autocapitalize="off" spellcheck="false" autocomplete="username" />
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="password" maxlength="64" required autocomplete="current-password" />
      </label>
      <p class="form-error" id="auth-error"></p>
      <button class="solid" type="submit">Sign in</button>
    </form>`;

  els.authBody.innerHTML = `
    <div class="auth-page">
      <div class="auth-copy">
        <p class="kicker">Cloud accounts</p>
        <h1>${authTab === "signin" ? "Welcome back." : "Make it yours."}</h1>
        <p class="lede">
          Rips, coins, and the binder live on your account so they can follow you —
          and so trading can be honest later. Browse Home, Packs, and Catalog without signing in.
        </p>
        <ul class="auth-points">
          <li>Handle + password. No email required.</li>
          <li>Opening a pack, claiming hourly coins, selling, and the binder need an account.</li>
          <li>If this browser already has a local collection, you can claim it once when you sign up.</li>
        </ul>
      </div>
      <div class="auth-card">
        <div class="auth-tabs">
          <button type="button" class="auth-tab${authTab === "signup" ? " on" : ""}" data-auth-tab="signup">Create</button>
          <button type="button" class="auth-tab${authTab === "signin" ? " on" : ""}" data-auth-tab="signin">Sign in</button>
        </div>
        ${authTab === "signin" ? signinForm : signupForm}
        ${
          signed
            ? `<button class="ghost auth-guest" type="button" data-goto="account">Back to account</button>`
            : `<button class="ghost auth-guest" type="button" data-continue-guest>Keep browsing</button>`
        }
      </div>
    </div>`;
}

const ACCOUNT_TABS = [
  { id: "overview", name: "Overview", note: "Career, sets, and what you pulled." },
  { id: "quests", name: "Quests", note: "Daily and weekly coin rewards." },
  { id: "achievements", name: "Achievements", note: "Badges, rewards, and titles." },
  { id: "profile", name: "Profile", note: "Name, bio, and what the public sees." },
  { id: "look", name: "Look", note: "Avatar, banner, and title." },
  { id: "security", name: "Security", note: "Password and deleting the account." },
];

function renderAccount() {
  const trainer = activeTrainer();
  if (!trainer) {
    els.accountBody.innerHTML = signedOutAccount();
    return;
  }
  if (!ACCOUNT_TABS.some((tab) => tab.id === accountTab)) accountTab = "overview";
  const stats = achievementStats();
  const body =
    accountTab === "quests"
      ? questsTab()
      : accountTab === "achievements"
      ? achievementsTab(stats)
      : accountTab === "profile"
        ? profileTab(trainer)
        : accountTab === "look"
          ? lookTab(trainer, stats)
          : accountTab === "security"
            ? securityTab(trainer)
            : overviewTab(trainer, stats);

  els.accountBody.innerHTML = `
    ${accountHero(trainer, stats)}
    <div class="acct-tabs" role="tablist" aria-label="Account sections">
      ${ACCOUNT_TABS.map(
        (tab) => `<button type="button" role="tab" class="acct-tab${tab.id === accountTab ? " on" : ""}"
          aria-selected="${tab.id === accountTab}" data-acct-tab="${esc(tab.id)}" title="${esc(tab.note)}">
          ${esc(tab.name)}${tab.id === "achievements" && stats.ready.length ? `<i class="acct-dot">${stats.ready.length}</i>` : ""}
        </button>`
      ).join("")}
    </div>
    <div class="acct-body">${body}</div>
    ${historyOpen ? historySheet() : ""}`;

  const chart = els.accountBody.querySelector("#acct-worth-chart");
  if (chart) renderWorthChart(chart, state.worthLog, state.granted);
}

function signedOutAccount() {
  const preview = ACHIEVEMENTS.slice(0, 8)
    .map(
      (row) => `<div class="ach-tile t${row.tier} is-locked">
        <div class="ach-badge" style="--pct:0"><span>${esc(row.mark)}</span></div>
        <div class="ach-tile-copy"><b>${esc(row.name)}</b><p>${esc(row.note)}</p></div>
        <div class="ach-reward"><span class="ach-coin">&#10022; ${num(row.coins)}</span></div>
      </div>`
    )
    .join("");
  return `
    <div class="acct-hero signed-out">
      <div class="acct-banner banner-wash" data-motion="aurora" style="--b1:#f0c14b;--b2:#9b6dff"></div>
      <div class="acct-hero-body">
        <img class="brand-logo lg" src="assets/mark.png?v=35" width="256" height="256" alt="" />
        <div class="acct-copy">
          <p class="account-title">Signed out</p>
          <h2>Make a trainer</h2>
          <p class="acct-meta">Coins, cards, badges, and the binder live on your account &mdash; not this browser.</p>
        </div>
        <div class="acct-hero-actions">
          <button class="solid" type="button" data-open-auth="signup">Create account</button>
          <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>${ACHIEVEMENTS.length} achievements waiting</h3>
        <p class="panel-note">Every one pays coins, and thirteen hand over a title nobody can earn any other way.</p>
      </div>
      <div class="ach-grid preview">${preview}</div>
    </div>`;
}

function accountHero(trainer, stats) {
  const banner = bannerVars(trainer.banner);
  const joined = trainer.createdAt ? `joined ${formatWhen(trainer.createdAt)}` : "";
  return `<div class="acct-hero">
    <div class="acct-banner banner-wash" data-motion="${esc(banner.motion)}" style="${esc(banner.style)}"></div>
    <div class="acct-hero-body">
      ${avatarMark(trainer, "trainer-mark acct-face")}
      <div class="acct-copy">
        <p class="account-title">${esc(trainer.title || "Rookie")}</p>
        <h2>${esc(trainer.name)}</h2>
        <p class="acct-meta">
          <span class="account-handle">@${esc(trainer.handle)}</span>
          <span class="acct-code">${esc(trainerCode(trainer.id))}</span>
          ${joined ? `<span>${esc(joined)}</span>` : ""}
        </p>
        ${trainer.bio ? `<p class="account-bio">${esc(trainer.bio)}</p>` : ""}
      </div>
      <div class="acct-hero-actions">
        <a class="ghost" href="/u/${esc(trainer.handle)}">Public profile</a>
        <button class="ghost" type="button" id="copy-profile-link">Copy link</button>
        <button class="ghost" type="button" id="sign-out">Sign out</button>
      </div>
    </div>
    ${careerTiles()}
    <div class="acct-progress">
      <div class="acct-progress-copy">
        <b>${stats.claimed.size} / ${stats.total} achievements claimed</b>
        <span>${
          stats.ready.length
            ? `${stats.ready.length} ready to cash in`
            : stats.done < stats.total
              ? `${stats.total - stats.done} still locked`
              : "every badge on the wall"
        }</span>
      </div>
      <div class="dex-bar slim"><span style="width:${stats.pct}%"></span></div>
      ${
        stats.ready.length
          ? `<button class="solid claim-cta" type="button" data-acct-tab="achievements">Claim &#10022; ${num(stats.waiting)}</button>`
          : ""
      }
    </div>
  </div>`;
}

/* ---- Overview ----------------------------------------------------------- */

function setRings() {
  return `<div class="set-rings">${setCompletionRows()
    .map((row) => {
      const { symbol } = setIdentity(row.set);
      return `<button type="button" class="set-ring${row.pct >= 100 ? " done" : ""}" data-jump-set="${esc(row.set.id)}"
        title="Open ${esc(row.set.name)} collection">
        <span class="home-ring" style="--pct:${row.pct}"><span><b>${row.pct}%</b><small>set</small></span></span>
        <span class="set-ring-copy">
          <img src="${esc(symbol)}" alt="" width="22" height="22" loading="lazy" decoding="async" />
          <b>${esc(row.set.name)}</b>
          <small>${num(row.owned)} / ${num(row.total)} cards</small>
        </span>
      </button>`;
    })
    .join("")}</div>`;
}

function overviewTab(trainer, stats) {
  const history = state.history || [];
  const recent = historyCards(history, 6);
  const nextUp = ACHIEVEMENTS.filter((row) => !stats.claimed.has(row.id) && !isAchievementDone(row, stats.ctx))
    .map((row) => ({ row, p: achievementProgress(row, stats.ctx) }))
    .sort((a, b) => b.p.pct - a.p.pct)
    .slice(0, 3);

  return `<div class="acct-grid">
    <div class="panel span-2">
      <div class="panel-head">
        <h3>Net worth</h3>
        <p class="panel-note">Coins plus every card at today's market, sampled on each rip and sale.</p>
      </div>
      <div class="acct-chart" id="acct-worth-chart"></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>Pull history</h3>
        <button class="ghost sm" type="button" id="open-history">Open</button>
      </div>
      ${miniCardRow(recent, "Rip a pack and the last cards land here.", "tight")}
      <p class="panel-note tail">${
        history.length
          ? `Last ${history.length} card${history.length === 1 ? "" : "s"} off the top of a pack.`
          : "Nothing pulled yet."
      }</p>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>Closest badges</h3>
        <button class="ghost sm" type="button" data-acct-tab="achievements">All ${stats.total}</button>
      </div>
      ${
        nextUp.length
          ? `<div class="next-list">${nextUp
              .map(
                ({ row, p }) => `<div class="next-row">
                  <div class="next-head"><b>${esc(row.name)}</b><span>${num(p.at)} / ${num(p.goal)}</span></div>
                  <div class="ach-bar"><span style="width:${p.pct}%"></span></div>
                  <small>${esc(row.note)} &middot; &#10022; ${num(row.coins)}${row.title ? ` &middot; title ${esc(row.title)}` : ""}</small>
                </div>`
              )
              .join("")}</div>`
          : `<p class="panel-empty">Every achievement is done. Ridiculous.</p>`
      }
    </div>
    <div class="panel span-full">
      <div class="panel-head">
        <h3>Set completion</h3>
        <p class="panel-note">Select a set to open its collection.</p>
      </div>
      ${setRings()}
    </div>
  </div>`;
}

/* ---- Achievements ------------------------------------------------------- */

const ACH_FILTERS = [
  { id: "all", name: "All" },
  { id: "ready", name: "Ready" },
  { id: "claimed", name: "Claimed" },
  { id: "locked", name: "Locked" },
  ...ACH_CATEGORIES.map((cat) => ({ id: cat.id, name: cat.name })),
];

function achTile(row, ctx, claimed) {
  const p = achievementProgress(row, ctx);
  const isClaimed = claimed.has(row.id);
  const ready = !isClaimed && p.done;
  const cls = isClaimed ? "is-claimed" : ready ? "is-ready" : "is-locked";
  const action = isClaimed
    ? `<span class="ach-done">Claimed</span>`
    : ready
      ? `<button class="solid sm" type="button" data-claim="${esc(row.id)}">Claim</button>`
      : `<span class="ach-progress">${num(p.at)} / ${num(p.goal)}</span>`;
  return `<article class="ach-tile t${row.tier} ${cls}">
    <div class="ach-badge" style="--pct:${p.pct}"><span>${esc(row.mark)}</span></div>
    <div class="ach-tile-copy">
      <b>${esc(row.name)}</b>
      <p>${esc(row.note)}</p>
      ${p.done ? "" : `<div class="ach-bar"><span style="width:${p.pct}%"></span></div>`}
    </div>
    <div class="ach-reward">
      <span class="ach-coin">&#10022; ${num(row.coins)}</span>
      ${row.title ? `<span class="ach-title-tag">Title &middot; ${esc(row.title)}</span>` : ""}
      ${action}
    </div>
  </article>`;
}

function titlesFromClaims(claimed) {
  return ACHIEVEMENTS.filter((row) => row.title && claimed.has(row.id)).length;
}

function achievementsTab(stats) {
  const { ctx, claimed } = stats;
  const rows = ACHIEVEMENTS.filter((row) => {
    if (achFilter === "all") return true;
    if (achFilter === "claimed") return claimed.has(row.id);
    if (achFilter === "ready") return !claimed.has(row.id) && isAchievementDone(row, ctx);
    if (achFilter === "locked") return !claimed.has(row.id) && !isAchievementDone(row, ctx);
    return row.cat === achFilter;
  });

  return `<div class="ach-wall">
    <div class="ach-head">
      <div class="ach-summary">
        <div><b>${stats.claimed.size} / ${stats.total}</b><span>Claimed</span></div>
        <div><b>&#10022; ${num(stats.banked)}</b><span>Banked so far</span></div>
        <div class="${stats.waiting ? "hot" : ""}"><b>&#10022; ${num(stats.waiting)}</b><span>Waiting for you</span></div>
        <div><b>${titlesFromClaims(claimed)}</b><span>Titles won</span></div>
      </div>
      <button class="solid" type="button" id="claim-all" ${stats.ready.length ? "" : "disabled"}>
        ${stats.ready.length ? `Claim all &middot; &#10022; ${num(stats.waiting)}` : "Nothing to claim"}
      </button>
    </div>
    <div class="ach-filters" role="group" aria-label="Filter achievements">
      ${ACH_FILTERS.map(
        (f) => `<button type="button" class="pick-chip${f.id === achFilter ? " on" : ""}" data-ach-filter="${esc(f.id)}">${esc(f.name)}</button>`
      ).join("")}
    </div>
    ${
      rows.length
        ? `<div class="ach-grid">${rows.map((row) => achTile(row, ctx, claimed)).join("")}</div>`
        : `<p class="panel-empty">Nothing in that filter yet.</p>`
    }
  </div>`;
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
            </div>
            <div class="pull-tags">
              ${entry.wasNew ? `<span class="tag new">New</span>` : ""}
              ${entry.reverse ? `<span class="tag rev">Reverse</span>` : ""}
            </div>
            <div class="pull-value">${card ? `&#10022; ${coin(sellValue(card))}` : "&mdash;"}</div>
            <time>${esc(formatWhen(entry.at))}</time>
          </div>`;
        })
        .join("")}</div>`
    : `<p class="panel-empty">Nothing matches that filter.</p>`;

  return `<div class="sheet-backdrop" data-history-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Pull history">
      <div class="sheet-head">
        <div>
          <h3>Pull history</h3>
          <p>The last ${num(all.length)} cards off the top of a pack, newest first.</p>
        </div>
        <button class="ghost" type="button" data-history-close>Close</button>
      </div>
      <div class="sheet-filters">
        ${HISTORY_FILTERS.map(
          (f) => `<button type="button" class="pick-chip${f.id === historyFilter ? " on" : ""}" data-history-filter="${esc(f.id)}">${esc(f.name)}</button>`
        ).join("")}
        <span class="sheet-total">${num(rows.length)} shown &middot; &#10022; ${coin(worth)}</span>
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
        <button type="button" class="pin-drop" data-unpin="${esc(card.id)}">Unpin</button>
      </div>`;
    })
    .join("");

  return `<div class="acct-grid">
    <div class="panel">
      <div class="panel-head">
        <h3>Identity</h3>
        <p class="panel-note">Your name and handle show anywhere you appear &mdash; chat, walls, the friends dock.</p>
      </div>
      <form id="profile-form">
        <label class="field"><span>Trainer name</span><input name="name" maxlength="24" value="${esc(trainer.name)}" required /></label>
        <label class="field"><span>Handle</span><input name="handle" maxlength="16" value="${esc(trainer.handle)}" required autocapitalize="off" spellcheck="false" />
          <span class="hint">Your profile lives at /u/${esc(trainer.handle)}.</span>
        </label>
        <label class="field"><span>Bio</span><textarea name="bio" maxlength="160" placeholder="What are you chasing?">${esc(trainer.bio || "")}</textarea></label>
        <p class="form-error" id="profile-error"></p>
        <button class="solid" type="submit">Save profile</button>
      </form>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>What the public sees</h3>
        <p class="panel-note">Tick the numbers you are happy for anyone to read on your profile.</p>
      </div>
      <div class="stat-toggles">${STAT_KEYS.map(
        (key) => `<label><input type="checkbox" data-stat-toggle="${key}" ${shown.has(key) ? "checked" : ""} /> ${esc(statLabel(key))}</label>`
      ).join("")}</div>
      <div class="share-row">
        <code>poke-pack.rip/u/${esc(trainer.handle)}</code>
        <button class="ghost sm" type="button" id="copy-profile-link-2">Copy</button>
      </div>
      <a class="ghost wide" href="/u/${esc(trainer.handle)}">Open my public profile</a>
    </div>
    <div class="panel span-full">
      <div class="panel-head">
        <h3>Showcase &middot; ${showcase.length}/${SHOWCASE_MAX}</h3>
        <p class="panel-note">Six pinned cards sit at the top of your public profile. Pin one from any card's inspect view.</p>
      </div>
      ${
        pinned
          ? `<div class="pin-row">${pinned}</div>`
          : `<p class="panel-empty">Nothing pinned. Open a card, then use Pin to showcase.</p>`
      }
    </div>
  </div>`;
}

/* ---- Look --------------------------------------------------------------- */

function lookTab(trainer, stats) {
  const avatars = searchAvatars(avatarQuery);
  const banner = parseBanner(trainer.banner);
  const style = avatarStyle(trainer.avatarStyle);
  const ctx = titleContext(state, { signed: true, findCard, rarities: ownedRarities() });
  const unlocked = new Set(unlockedTitles(ctx).map((row) => row.name));

  const titleChips = TITLES.map((row) => {
    const open = unlocked.has(row.name);
    const on = trainer.title === row.name;
    return `<button type="button" class="title-chip${on ? " on" : ""}${open ? "" : " locked"}"
      ${open ? `data-set-title="${esc(row.name)}"` : "disabled"} title="${esc(row.note)}">
      <b>${esc(row.name)}</b><small>${esc(row.note)}</small>
      ${row.award ? `<i class="title-award">reward</i>` : ""}
    </button>`;
  }).join("");

  return `<div class="look-layout">
    <aside class="look-preview">
      <p class="look-cap">Live preview</p>
      <div class="look-card">
        <div class="acct-banner banner-wash" data-motion="${esc(banner.motion)}" style="${esc(bannerVars(trainer.banner).style)}"></div>
        <div class="look-id">
          ${avatarMark(trainer, "trainer-mark look-face")}
          <p class="account-title">${esc(trainer.title || "Rookie")}</p>
          <b>${esc(trainer.name)}</b>
          <small>@${esc(trainer.handle)}</small>
        </div>
      </div>
      <div class="look-actions">
        <button class="ghost sm" type="button" id="look-random">Surprise me</button>
        <button class="ghost sm" type="button" id="look-swap">Swap colours</button>
      </div>
      <p class="panel-note">${
        titlesFromClaims(stats.claimed)
          ? `${titlesFromClaims(stats.claimed)} of your titles came from achievements.`
          : "Claim achievements to unlock titles nobody can earn any other way."
      }</p>
    </aside>
    <div class="look-controls">
      <div class="panel">
        <div class="panel-head">
          <h3>Picture</h3>
          <p class="panel-note">A Pokemon still, in full art or as a pixel sprite. Custom pictures and GIFs stay premium for later.</p>
        </div>
        <div class="style-picks">
          <button type="button" class="pick-chip${style === "art" ? " on" : ""}" data-set-style="art">High quality</button>
          <button type="button" class="pick-chip${style === "pixel" ? " on" : ""}" data-set-style="pixel">Pixel</button>
        </div>
        <label class="field"><span>Search a Pokemon</span>
          <input id="avatar-search" value="${esc(avatarQuery)}" placeholder="Pikachu, 25, Darkrai" />
        </label>
        <div class="avatar-grid">${avatars
          .map(
            ([id, name]) => `<button type="button" class="pick${String(trainer.avatar) === String(id) ? " on" : ""}" data-set-avatar="${id}" title="${esc(name)}">
            <img class="${style === "pixel" ? "pixel" : ""}" src="${esc(style === "pixel" ? avatarIcon(id) : avatarSrc(id, "art"))}" alt="${esc(name)}" loading="lazy" />
            <small>${esc(name)}</small>
          </button>`
          )
          .join("")}</div>
        <div class="field"><span>Ring colour</span>${colorPicks(trainer.color, "data-profile-color")}</div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Banner</h3>
          <p class="panel-note">No photos &mdash; a motion and two colours, mixed live behind your profile.</p>
        </div>
        <div class="style-picks">${BANNER_MOTIONS.map(
          (row) => `<button type="button" class="pick-chip${banner.motion === row.id ? " on" : ""}" data-set-motion="${esc(row.id)}">${esc(row.name)}</button>`
        ).join("")}</div>
        <div class="field"><span>Colour A</span>${colorPicks(banner.colors[0], "data-banner-a")}</div>
        <div class="field"><span>Colour B</span>${colorPicks(banner.colors[1], "data-banner-b")}</div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Title &middot; ${unlocked.size}/${TITLES.length}</h3>
          <p class="panel-note">Sits above your name everywhere. Greyed-out ones are still locked.</p>
        </div>
        <div class="title-wall">${titleChips}</div>
      </div>
    </div>
  </div>`;
}

/* ---- Security ----------------------------------------------------------- */

function securityTab(trainer) {
  return `<div class="acct-grid">
    <div class="panel">
      <div class="panel-head">
        <h3>Password</h3>
        <p class="panel-note">Change the password for this account. You'll need the current one.</p>
      </div>
      <form id="password-form">
        <label class="field"><span>Current password</span><input name="current" type="password" maxlength="64" required autocomplete="current-password" /></label>
        <label class="field"><span>New password</span><input name="password" type="password" minlength="6" maxlength="64" required autocomplete="new-password" /></label>
        <p class="form-error" id="password-error"></p>
        <button class="ghost" type="submit">Update password</button>
      </form>
    </div>
    <div class="panel danger">
      <div class="panel-head">
        <h3>Delete account</h3>
        <p class="panel-note">Removes @${esc(trainer.handle)}, every card, every badge, and the binder. There is no undo.</p>
      </div>
      <button class="ghost danger-btn" type="button" id="delete-trainer">Delete ${esc(trainer.name)}</button>
    </div>
  </div>`;
}

async function renderProfile() {
  const handle = profileHandle;
  if (!els.profileBody) return;
  if (!handle) {
    els.profileBody.innerHTML = `<div class="panel"><p class="panel-empty">No trainer here.</p></div>`;
    return;
  }
  els.profileBody.innerHTML = `<div class="panel"><p class="panel-empty">Loading @${esc(handle)}…</p></div>`;
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
    profileBinderView = {handle, pages, mine, position:wanted >= 0 ? wanted : preserved >= 0 ? preserved : 0};
    const signed = Boolean(activeTrainer());
    const stats = data.stats || {};
    const friendBtn =
      !signed
        ? `<button class="ghost" type="button" data-open-auth="signin">Sign in to add</button>`
        : mine
          ? `<a class="ghost" href="/account">Edit profile</a>`
          : data.relation === "friends"
            ? `<button class="ghost" type="button" data-open-dm="${esc(user.handle)}">Message</button><button class="ghost" type="button" data-friend-remove="${esc(user.handle)}">Unfriend</button>`
            : data.relation === "pending-out"
              ? `<button class="ghost" type="button" disabled>Request sent</button>`
              : data.relation === "pending-in"
                ? `<button class="solid" type="button" data-friend-accept="${esc(user.handle)}">Accept friend</button>`
                : `<button class="solid" type="button" data-friend-add="${esc(user.handle)}">Add friend</button>`;

    // Preserve the collector's chosen order, including favourite commons.
    const pinned = (data.showcase || []).slice();
    const showcase = pinned
      .map((slot, i) => {
        const known = findCard(slot.id);
        const face = known
          ? tcgFace({ ...known, reverse: slot.reverse }, { small: true, stamp: false, lazy: true })
          : `<img src="${esc(slot.image)}" alt="${esc(slot.name)}" />`;
        const worth = Number(slot.value) > 0 ? `<span>✦ ${coin(slot.value)}</span>` : "";
        return `<figure class="showcase-slot${i === 0 ? " best" : ""}">
          <button type="button" class="mini-card" ${known ? inspectAttrs({...known, reverse:slot.reverse}) : ""} aria-label="${esc(slot.name)}">${face}</button>
          <figcaption><b>${esc(slot.name)}</b>${worth}</figcaption>
        </figure>`;
      })
      .join("");

    const comments = (data.comments || [])
      .map(
        (row) => `<div class="comment-item">
          <a href="/u/${esc(row.user.handle)}">${faceHtml(row.user, "sm")}</a>
          <div>
            <a href="/u/${esc(row.user.handle)}"><b>${esc(row.user.name)}</b></a>
            <time>${esc(formatWhen(row.at))}</time>
            <p>${esc(row.body)}</p>
          </div>
        </div>`
      )
      .join("");

    const banner = bannerVars(user.banner);
    els.profileBody.innerHTML = `
      <div class="profile-page">
        <div class="profile-hero">
          <div class="profile-banner banner-wash" data-motion="${esc(banner.motion)}" style="${esc(banner.style)}"></div>
          <div class="profile-id">
            ${faceHtml({ ...user, online: data.online }, "lg")}
            <div class="profile-copy">
              <p class="account-title">${esc(user.title || "Rookie")}${data.online ? " · online" : ""}</p>
              <h1>${esc(user.name)}</h1>
              <p>@${esc(user.handle)} · ${num(data.friends || 0)} friends</p>
              ${user.bio ? `<p class="account-bio">${esc(user.bio)}</p>` : ""}
            </div>
            <div class="profile-actions">${friendBtn}</div>
          </div>
          <div class="profile-stats">
            ${stats.packs != null ? `<div><b>${num(stats.packs)}</b><span>Packs ripped</span></div>` : ""}
            ${stats.pulls != null ? `<div><b>${num(stats.pulls)}</b><span>Cards pulled</span></div>` : ""}
            ${stats.unique != null ? `<div><b>${num(stats.unique)}</b><span>Unique cards</span></div>` : ""}
            ${stats.coins != null ? `<div><b>✦ ${coin(stats.coins)}</b><span>Coins</span></div>` : ""}
            ${user.createdAt ? `<div><b>${esc(joinedOn(user.createdAt))}</b><span>Collecting since</span></div>` : ""}
          </div>
        </div>
        <div class="panel profile-showcase">
          <h3>Showcase${pinned.length ? ` <small>${pinned.length} pinned</small>` : ""}</h3>
          ${
            showcase
              ? `<div class="showcase-row">${showcase}</div>`
              : `<p class="panel-empty">${mine ? "Pin your best pulls from the binder." : "No cards pinned yet."}</p>`
          }
        </div>
        ${profileBinderPagesHtml()}
        <div class="profile-grid">
          <div class="panel">
            <h3>Wall</h3>
            <div class="comment-list">${comments || `<p class="panel-empty">No comments yet.</p>`}</div>
            ${
              signed
                ? `<form class="comment-form" id="comment-form">
                    <textarea name="body" maxlength="220" placeholder="Leave a note"></textarea>
                    <button class="solid" type="submit">Comment</button>
                  </form>`
                : `<p class="panel-note">Sign in to comment.</p>`
            }
          </div>
        </div>
      </div>`;
    if (profilePageScroll) {
      profilePageScroll = false;
      els.profileBody.querySelector(".profile-binder")?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    }
  } catch (err) {
    els.profileBody.innerHTML = `<div class="panel"><p class="panel-empty">${esc(err.message || "Trainer not found.")}</p></div>`;
  }
}

async function renderSocial() {
  const body = els.socialBody;
  if (!body) return;
  const trainer = activeTrainer();
  if (!trainer) {
    body.innerHTML = `<div class="panel">
      <h3>Social</h3>
      <p class="panel-note">Sign in to DM friends. Trading lands here next.</p>
      <button class="solid" type="button" data-open-auth="signin">Sign in</button>
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
    const list = threads
      .map((row) => {
        const on = dmHandle === row.user.handle;
        const preview = row.last ? esc(row.last.body) : "No messages yet";
        return `<a class="dm-thread${on ? " on" : ""}" href="/social/${esc(row.user.handle)}">
          ${faceHtml(row.user, "sm")}
          <span><b>${esc(row.user.name)}</b><small>${preview}</small></span>
        </a>`;
      })
      .join("");
    const { incoming, outgoing } = currentFriends();
    const incomingRows = incoming
      .map(
        (row) => `<div class="friends-row">
          <a href="/u/${esc(row.handle)}">${faceHtml(row, "sm")}<span><b>${esc(row.name)}</b><small>@${esc(row.handle)}</small></span></a>
          <div class="friends-row-actions">
            <button type="button" class="solid" data-friend-accept="${esc(row.handle)}">Accept</button>
            <button type="button" class="ghost" data-friend-deny="${esc(row.handle)}">No</button>
          </div>
        </div>`
      )
      .join("");
    const outgoingRows = outgoing
      .map(
        (row) => `<div class="friends-row dim">
          <a href="/u/${esc(row.handle)}">${faceHtml(row, "sm")}<span><b>${esc(row.name)}</b><small>pending</small></span></a>
        </div>`
      )
      .join("");
    const requests =
      (incomingRows ? `<p class="friends-label">Requests</p><div class="dm-threads">${incomingRows}</div>` : "") +
      (outgoingRows ? `<p class="friends-label">Sent</p><div class="dm-threads">${outgoingRows}</div>` : "");
    const pane = thread?.error
      ? `<p class="panel-empty">${esc(thread.error)}</p>`
      : thread
        ? `<div class="dm-head">
            <a href="/u/${esc(thread.user.handle)}">${faceHtml(thread.user, "sm")}</a>
            <div>
              <b>${esc(thread.user.name)}</b>
              <small>@${esc(thread.user.handle)}</small>
            </div>
          </div>
          <div class="dm-log" id="dm-log">${
            (thread.messages || [])
              .map(
                (msg) => `<div class="dm-line${msg.mine ? " mine" : ""}"><span>${esc(msg.body)}</span><time>${esc(formatWhen(msg.at))}</time></div>`
              )
              .join("") || `<p class="lounge-empty">Say hi.</p>`
          }</div>
          <form class="dm-form" id="dm-form">
            <input name="body" maxlength="220" placeholder="Message @${esc(thread.user.handle)}" autocomplete="off" />
            <button class="solid" type="submit">Send</button>
          </form>`
        : `<p class="panel-empty">Pick a friend to start a DM. Trading will live on this tab next.</p>`;
    body.innerHTML = `
      <div class="section-head">
        <div>
          <h2>Social</h2>
          <p>Friends, DMs, and soon trading — all in one tab.</p>
        </div>
      </div>
      <div class="social-grid">
        <div class="panel">
          <h3>Friends</h3>
          ${requests}
          ${requests && list ? `<p class="friends-label">Friends</p>` : ""}
          <div class="dm-threads">${list || `<p class="panel-empty">No friends yet. Use the Friends button in the bottom-left corner to add a trainer by handle.</p>`}</div>
        </div>
        <div class="panel dm-pane">${pane}</div>
      </div>
      <div class="panel">
        <h3>Trading</h3>
        <p class="panel-note">Card-for-card trades land here after DMs feel solid. Friends first.</p>
      </div>`;
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
  } catch (err) {
    body.innerHTML = `<div class="panel"><p class="panel-empty">${esc(err.message || "Couldn't load social.")}</p></div>`;
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
    note: "How cards look in the binder, the spread, and the inspector.",
    rows: [
      {
        key: "fx",
        type: "choice",
        label: "Card effects",
        note: "Holo is the newer foil engine — springier, glossier, closer to a card under a lamp. Classic is the original, which reads the printed holo windows more literally.",
        options: [
          ["holo", "Holo"],
          ["classic", "Classic"],
        ],
      },
      { key: "shine", type: "toggle", label: "Card shine", note: "Gloss highlight that follows your cursor across a card." },
      { key: "tilt", type: "toggle", label: "Card tilt", note: "Cards lean toward your finger or cursor in 3D." },
      { key: "stamps", type: "toggle", label: "Rarity stamps", note: "Off by default. Small rarity mark in the corner of each card." },
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
    note: "The tear, the reveal, and what happens when a hit lands.",
    rows: [
      { key: "flash", type: "toggle", label: "Hit effects", note: "Spark burst and screen shake when you pull a rare." },
      { key: "haptics", type: "toggle", label: "Vibration", note: "Short buzz when the wrapper tears and when a hit lands. Phones and tablets only." },
    ],
  },
  {
    title: "Binder",
    note: "Your collection view.",
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
    note: "Where the site drops you when you open it.",
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

function renderSettings() {
  const changed = changedSettingCount();

  const groups = SETTING_GROUPS.map(
    (group) => `<section class="panel set-panel">
      <div class="set-panel-head">
        <h3>${esc(group.title)}</h3>
        <p>${esc(group.note)}</p>
      </div>
      <div class="set-list">${group.rows.map(settingRow).join("")}</div>
    </section>`
  ).join("");

  els.settingsBody.innerHTML = `
    <div class="set-bar">
      <p>${esc(settingsSummaryText(changed))}</p>
      <button class="ghost" id="reset-settings" type="button" ${changed ? "" : "disabled"}>Restore defaults</button>
    </div>
    <div class="set-groups">${groups}</div>
    <section class="panel danger set-danger">
      <div class="set-panel-head">
        <h3>Reset progress</h3>
        <p>Clears coins, binder, and history on this account. Settings stay. This cannot be undone.</p>
      </div>
      <button class="ghost danger-btn" id="reset-progress" type="button">Reset everything</button>
    </section>`;
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
  return at.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderNotes() {
  if (!els.notesBody) return;
  if (!patchNotes.length) {
    els.notesBody.innerHTML = `<p class="notes-empty">No notes yet. The next site push will land here.</p>`;
    return;
  }
  els.notesBody.innerHTML = `<div class="notes-list">${patchNotes
    .map(
      (note) => `<article class="notes-entry">
        <header>
          <h3>${esc(note.title)}</h3>
          <time datetime="${esc(note.date)}">${esc(formatNoteDate(note.date))}</time>
        </header>
        <ul>${(note.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      </article>`
    )
    .join("")}</div>`;
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
  home: "poke-pack.rip — rip packs, fill the binder",
  shop: "Packs — poke-pack.rip",
  collection: "Collection — poke-pack.rip",
  binder: "Binder — poke-pack.rip",
  catalog: "Catalog — poke-pack.rip",
  account: "Account — poke-pack.rip",
  profile: "Trainer — poke-pack.rip",
  auth: "Sign in — poke-pack.rip",
  settings: "Settings — poke-pack.rip",
  notes: "Patch notes — poke-pack.rip",
  social: "Social — poke-pack.rip",
};

const VIEW_RENDER = {
  home: () => {
    renderHome();
    refreshLounge();
  },
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

/** The playable set a /packs/<id> path names, or "" when it names none. */
function setIdFromPath(pathname) {
  const id = normalizePath(pathname).match(/^\/(?:packs|shop)\/([a-z0-9]+)$/i)?.[1].toLowerCase();
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
  if (view === "profile" && profileHandle) return `@${profileHandle} — poke-pack.rip`;
  if (view === "social" && dmHandle) return `DM @${dmHandle} — poke-pack.rip`;
  if (view === "shop") return `${liveSet.name} packs — poke-pack.rip`;
  return VIEW_TITLES[view] || VIEW_TITLES.home;
}

function pathForView(name) {
  if (name === "profile") return profilePath(profileHandle || "trainer", profilePageWanted);
  if (name === "shop") return `/packs/${liveSet.id}`;
  if (name === "social") return dmHandle ? `/social/${dmHandle}` : "/social";
  return VIEW_PATHS[name] || "/home";
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function paintNav(current) {
  const navView = current === "auth" || current === "profile" ? "account" : current;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const on = btn.dataset.view === navView;
    btn.classList.toggle("active", on);
    if (on) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

function applyView(next, hist) {
  view = next;
  for (const [name, key] of Object.entries(VIEW_SECTIONS)) {
    els[key]?.classList.toggle("hidden", view !== name);
  }
  paintNav(view);
  document.querySelector(".nav-more")?.removeAttribute("open");
  VIEW_RENDER[view]?.();
  document.body.classList.toggle("on-home", view === "home");
  document.body.classList.toggle("on-shop", view === "shop");
  document.body.classList.toggle("on-collection", view === "collection");
  document.body.classList.toggle("on-auth", view === "auth");
  document.body.classList.toggle("on-social", view === "social");
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

/** Light and dust for the opening stage, tinted by the wrapper being opened. */
function paintOpeningStage(wrap) {
  const overlay = els.overlay;
  if (!packGlowCache.has(wrap?.art)) overlay.style.setProperty("--pack-glow", PACK_GLOW_DEFAULT);
  if (wrap?.art) overlay.style.setProperty("--pack-mask", `url("${absUrl(wrap.art)}")`);
  if (liveSet.cardBack) overlay.style.setProperty("--card-back", `url("${absUrl(liveSet.cardBack)}")`);
  packGlow(wrap).then((rgb) => {
    if (activeWrapper === wrap) overlay.style.setProperty("--pack-glow", rgb || PACK_GLOW_DEFAULT);
  });
  if (els.opMotes && !els.opMotes.childElementCount) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 18; i += 1) {
      const mote = document.createElement("i");
      const dur = 10 + Math.random() * 10;
      mote.style.setProperty("--x", `${(Math.random() * 100).toFixed(1)}%`);
      mote.style.setProperty("--dx", `${((Math.random() - 0.5) * 120).toFixed(0)}px`);
      mote.style.setProperty("--s", `${(1.5 + Math.random() * 2.5).toFixed(1)}px`);
      mote.style.setProperty("--dur", `${dur.toFixed(1)}s`);
      mote.style.setProperty("--dl", `${(-Math.random() * dur).toFixed(1)}s`);
      mote.style.setProperty("--o", (0.3 + Math.random() * 0.5).toFixed(2));
      frag.appendChild(mote);
    }
    els.opMotes.appendChild(frag);
  }
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
  els.overlay.style.setProperty("--burst-x", `${Math.round(rect.left + rect.width / 2)}px`);
  els.overlay.style.setProperty("--burst-y", `${Math.round(rect.top + rect.height * 0.07)}px`);
  replayClass(els.overlay, "tear-burst", 900);
}

/** Count the summary figures up from zero. Cheap: a few text nodes for under a second. */
function countUpStats(root) {
  const nodes = [...root.querySelectorAll("[data-count]")];
  if (!nodes.length || !fxOk()) return;
  const targets = nodes.map((node) => Number(node.dataset.count) || 0);
  const fmt = (node, value) =>
    (node.dataset.prefix || "") + (node.dataset.fmt === "coin" ? coin(value) : String(Math.round(value)));
  nodes.forEach((node) => (node.textContent = fmt(node, 0)));
  const t0 = performance.now() + 380;
  const dur = 900;
  const tick = (now) => {
    if (!root.isConnected || packPhase === "idle") return;
    const t = clamp((now - t0) / dur, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    nodes.forEach((node, i) => (node.textContent = fmt(node, targets[i] * e)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Deal the summary cards out from the middle of the table, best pull last. */
function dealSpread() {
  const grid = els.spread.querySelector(".spread-grid");
  if (!grid || !fxOk()) return;
  const cards = [...grid.querySelectorAll(".spread-card")];
  const box = grid.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + Math.min(box.height / 2, 200);
  const step = cards.length > 20 ? 26 : 70;
  let order = 0;
  cards.forEach((card) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--dx", `${Math.round(cx - (r.left + r.width / 2))}px`);
    card.style.setProperty("--dy", `${Math.round(cy - (r.top + r.height / 2))}px`);
    card.style.setProperty("--rz", `${((Math.random() - 0.5) * 24).toFixed(1)}deg`);
    if (!card.classList.contains("top-pull")) {
      card.style.setProperty("--d", `${140 + Math.min(order, 30) * step}ms`);
      order += 1;
    }
  });
  const top = grid.querySelector(".spread-card.top-pull");
  if (top) top.style.setProperty("--d", `${360 + Math.min(order, 30) * step}ms`);
  grid.classList.add("deal");
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
  if (HIT_RARITIES.has(card.rarity)) return 2;
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
  for (const slot of liveSet.slots) {
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
                  ? "✦"
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

function renderFocusMeta(pull) {
  if (!pull || !pull.revealed) {
    els.focusMeta.innerHTML = "";
    els.focusMeta.classList.remove("in");
    els.hitBanner.innerHTML = "";
    els.hitBanner.classList.remove("on");
    return;
  }
  const bits = [liveSet.name, numberLine(pull), pull.types?.join(" / ")].filter(Boolean);
  els.focusMeta.innerHTML = `
    <p class="focus-kicker">${esc(bits.join(" · "))} ${rarityMark(pull)}</p>
    <h2 class="focus-title">${esc(pull.name)}</h2>`;
  const tier = hitTier(pull);
  els.hitBanner.innerHTML = tier >= 2 ? `<span class="t${tier}">${esc(rarityLine(pull))}</span>` : "";
  els.hitBanner.classList.toggle("on", tier >= 2);
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
    els.againBtn.textContent = "Open another";
  }
  els.boxSummaryBtn?.classList.toggle("hidden", !(sealedRun && boxLeft > 0 && !summary && sealedRun.index >= 0));
  if (els.boxSummaryBtn && sealedRun) els.boxSummaryBtn.textContent = `Skip to ${sealedRun.product.noun} summary`;
  // Mid-box, the way out is the summary, so the remaining packs aren't skipped unseen.
  const exits = summary || (spread && !boxLeft);
  els.viewPullsBtn.classList.toggle("hidden", !exits);
  els.doneBtn.classList.toggle("hidden", !exits);
  els.stepBtn.classList.toggle("hidden", spread || summary);
  els.leavePack?.classList.toggle("hidden", summary);
  els.ripHint.classList.toggle("hidden", reveal || spread);
  els.thumbs.classList.toggle("hidden", !(reveal && showStrip));
  els.skipBtn.textContent = ready ? "Skip to pack" : "Reveal all";
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
      if (!card.revealed) {
        return `<div class="thumb empty ${hint.kind}" title="${esc(hint.label)}">${esc(hint.label)}</div>`;
      }
      const hit = hitTier(card) >= 2 ? "hit" : card.reverse ? "rev" : "";
      // Only a card revealed since the last paint pops in; the rest stay put.
      const pop = thumbsShown.has(i) ? "" : "pop";
      thumbsShown.add(i);
      return `<button type="button" class="thumb ${hit} ${pop} ${i === focusIndex ? "current" : ""}"
        data-focus="${i}" title="${esc(card.name)} · ${esc(rarityLine(card))}">
        ${tcgFace(card, { small: true, stamp: false })}
      </button>`;
    })
    .join("");
}

function clearHitFx() {
  clearTimeout(playHitFx._t);
  clearTimeout(playHitFx._b);
  playHitFx._t = 0;
  playHitFx._b = 0;
  els.hitFx.replaceChildren();
  els.overlay.classList.remove("hit-flash", "hit-shake", "hit-shake-sm", "charging", "charge-t2", "charge-t3");
  els.focusCard.classList.remove("charging");
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
  // The burst lands as the face turns toward the viewer, a little under half-way through the flip.
  const at = Math.round(flipDurationMs() * 0.42);
  const frag = document.createDocumentFragment();
  const count = tier === 3 ? 34 : tier === 2 ? 22 : 10;
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    spark.className = `hit-spark t${tier}${tier >= 2 && i % 3 === 0 ? " streak" : ""}`;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
    const dist = 80 + Math.random() * (60 + tier * 48);
    spark.style.setProperty("--sx", `${(Math.cos(angle) * dist).toFixed(1)}px`);
    spark.style.setProperty("--sy", `${(Math.sin(angle) * dist).toFixed(1)}px`);
    spark.style.setProperty("--ang", `${((angle * 180) / Math.PI).toFixed(1)}deg`);
    spark.style.setProperty("--dly", `${Math.round(at + Math.random() * 160)}ms`);
    frag.appendChild(spark);
  }
  const glow = document.createElement("i");
  glow.className = `hit-glow t${tier}`;
  glow.style.setProperty("--dly", `${at}ms`);
  frag.appendChild(glow);
  for (let i = 0; i < Math.min(tier, 2); i += 1) {
    const ring = document.createElement("i");
    ring.className = `hit-ring t${tier}`;
    ring.style.setProperty("--dly", `${at + i * 170}ms`);
    frag.appendChild(ring);
  }
  els.hitFx.appendChild(frag);
  clearTimeout(playHitFx._b);
  playHitFx._b = setTimeout(() => {
    els.overlay.classList.add("hit-flash");
    if (tier >= 3) els.overlay.classList.add("hit-shake");
    else if (tier === 2) els.overlay.classList.add("hit-shake-sm");
  }, at);
  clearTimeout(playHitFx._t);
  playHitFx._t = setTimeout(() => {
    els.overlay.classList.remove("hit-shake", "hit-shake-sm");
    els.overlay.classList.remove("hit-flash");
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
        <div class="face-back">${tcgFace(pull)}${pull.wasNew ? `<span class="new-badge">NEW</span>` : ""}</div>
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

function packHitLine() {
  const hits = currentPulls.filter((card) => isHit(card));
  if (hits.some((c) => c.rarity === "Mega Hyper Rare")) return "Gold Mega Hyper Rare. That’s the one.";
  if (hits.some((c) => c.rarity === "Hyper Rare")) return "Gold Hyper Rare. That’s the one.";
  if (hits.some((c) => c.rarity === "Special Illustration Rare")) return "Special Illustration Rare in the pack.";
  if (hits.length) return `${hits.map((c) => RARITY_LABEL[c.rarity]).join(" · ")} pulled.`;
  return "Pack ripped.";
}

function bestPull() {
  return currentPulls.reduce((best, card) => {
    if (!best) return card;
    return RARITY_ORDER.indexOf(card.rarity) > RARITY_ORDER.indexOf(best.rarity) ? card : best;
  }, null);
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

  const worth = money(currentPulls.reduce((sum, card) => sum + sellValue(card), 0));
  const fresh = currentPulls.filter((card) => card.wasNew).length;
  const best = bestPull();

  const cardsHtml = currentPulls
    .map((card, i) => {
      const hit = isHit(card) ? "hit" : "";
      const top = best && card.id === best.id ? "top-pull" : "";
      return `<button type="button" class="spread-card ${hit} ${top}"
          style="--d:${i * 45}ms"
          ${inspectAttrs(card)}
          title="${esc(card.name)} · ${esc(rarityLine(card))}">
        ${tcgFace(card, { small: true })}
        ${card.wasNew ? `<span class="chip new">New</span>` : ""}
        ${top ? `<span class="best-tag">Best pull</span>` : ""}
      </button>`;
    })
    .join("");

  els.spread.innerHTML = `
    <div class="spread-head">
      <p class="spread-kicker">${esc(liveSet.name)} · ${
        sealedRun
          ? `${esc(sealedRun.product.name)} · pack ${sealedRun.index + 1} of ${sealedRun.packs.length}`
          : `pack #${state.packsOpened}`
      }</p>
      <h2>${esc(packHitLine())}</h2>
      <div class="spread-stats">
        <span><b data-count="${currentPulls.length}">${currentPulls.length}</b> cards</span>
        <span><b data-count="${fresh}">${fresh}</b> new</span>
        <span><b data-count="${worth}" data-fmt="coin" data-prefix="✦ ">✦ ${coin(worth)}</b> value</span>
        ${best ? `<span class="best">${rarityPips(best.rarity)} <b>${esc(best.name)}</b></span>` : ""}
      </div>
    </div>
    <div class="spread-grid">${cardsHtml}</div>
    <p class="spread-tip">Your pulls are saved. Select a card to inspect it.</p>`;

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  dealSpread();
  countUpStats(els.spread);
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
    els.focusCard.classList.add("charging");
    els.overlay.classList.add("charging", `charge-t${tier}`);
    buzz(tier >= 3 ? [8, 60, 8, 60, 8] : 8);
    syncActions();
    flipTimer = setTimeout(() => {
      if (gen !== flipGen) return;
      els.focusCard.classList.remove("charging");
      els.overlay.classList.remove("charging", "charge-t2", "charge-t3");
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
  els.focusCard.classList.add("flipped");
  if (tier) playHitFx(pull);
  renderThumbs();
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
    cancelTearAnim();
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
    els.boxProgress.innerHTML = `<b>${esc(sealedRun.product.name)}</b> · pack ${done + 1} of ${total} ${meter}`;
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
  presentPack(pack.wrapper, pack.cards);
}

/** Leaving mid-box goes to the summary: the rest of the box is already in the collection. */
function leavePack() {
  if (sealedRun && packPhase !== "summary") showBoxSummary();
  else finishRip();
}

/** Every hit from the whole product on one sheet, best first. */
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
  const worth = money(all.reduce((sum, card) => sum + sellValue(card), 0));
  const fresh = all.filter((card) => card.wasNew).length;
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
  const counts = {};
  for (const card of hits) counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  const tally = Object.entries(counts)
    .sort((a, b) => rank({ rarity: b[0] }) - rank({ rarity: a[0] }))
    .map(([rarity, n]) => `${n} ${RARITY_LABEL[rarity] || rarity}`)
    .join(" · ");
  const unseen = run.packs.length - run.index - 1;

  els.spread.innerHTML = `
    <div class="spread-head">
      <p class="spread-kicker">${esc(liveSet.name)} · ${esc(run.product.name)} · ${run.packs.length} pack${run.packs.length === 1 ? "" : "s"}</p>
      <h2>${esc(hits.length ? `${hits.length} hit${hits.length === 1 ? "" : "s"} in the ${run.product.noun}.` : promos.length ? "No pack hits, but the promos are yours." : "No hits this time.")}</h2>
      <div class="spread-stats">
        <span><b data-count="${all.length}">${all.length}</b> cards</span>
        <span><b data-count="${fresh}">${fresh}</b> new</span>
        <span><b data-count="${worth}" data-fmt="coin" data-prefix="✦ ">✦ ${coin(worth)}</b> value</span>
        <span><b>✦ ${coin(run.cost)}</b> paid</span>
      </div>
      ${tally ? `<p class="box-tally">${esc(tally)}</p>` : ""}
    </div>
    <div class="spread-grid">${shown
      .map((card, i) => {
        const best = i === promos.length && (hits.length || !promos.length);
        return `<button type="button" class="spread-card ${isHit(card) || card.promo ? "hit" : ""} ${card.promo ? "promo-pull" : ""} ${best ? "top-pull" : ""}"
          style="--d:${Math.min(i, 30) * 30}ms"
          ${inspectAttrs(card)}
          title="${esc(card.name)} · ${esc(rarityLine(card))}">
        ${tcgFace(card, { small: true })}
        ${card.promo ? `<span class="chip promo">Promo</span>` : ""}
        ${card.wasNew ? `<span class="chip new">New</span>` : ""}
        ${best ? `<span class="best-tag">Best pull</span>` : ""}
      </button>`;
      })
      .join("")}</div>
    <p class="spread-tip">${
      unseen > 0 ? `${unseen} unopened pack${unseen === 1 ? " was" : "s were"} added straight to your collection. ` : ""
    }${hits.length || !run.packs.length ? "" : "Showing the best cards instead. "}Select a card to inspect it.</p>`;

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  dealSpread();
  countUpStats(els.spread);
  els.viewPullsBtn.focus({ preventScroll: true });
}

function setPackArt(wrap) {
  const html = packPicture(wrap);
  els.packTopArt.innerHTML = html;
  els.packRestArt.innerHTML = html;
}

function cancelTearAnim() {
  if (tearAnim) {
    cancelAnimationFrame(tearAnim);
    tearAnim = 0;
  }
}

const TEAR_BASE = 6.6;
let TEAR = [];

// Fresh zigzag per pack so no two rips look identical.
function buildTearPath() {
  const pts = [];
  let x = 0;
  let up = Math.random() > 0.5;
  while (x < 99) {
    const swing = 0.45 + Math.random() * 1.75;
    pts.push([x, clamp(TEAR_BASE + (up ? -swing : swing), 3.2, 9.8)]);
    x += 1.8 + Math.random() * 4.2;
    up = !up;
  }
  pts.push([100, TEAR_BASE + (Math.random() - 0.5) * 1.4]);
  TEAR = pts;
}

buildTearPath();

function tearY(x) {
  const t = clamp(x, 0, 100);
  for (let i = 0; i < TEAR.length - 1; i++) {
    const [x0, y0] = TEAR[i];
    const [x1, y1] = TEAR[i + 1];
    if (t >= x0 && t <= x1) {
      const u = x1 === x0 ? 0 : (t - x0) / (x1 - x0);
      return y0 + (y1 - y0) * u;
    }
  }
  return TEAR[TEAR.length - 1][1];
}

function jagged(from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const mids = TEAR.filter(([x]) => x > lo + 1e-6 && x < hi - 1e-6);
  const pts = [[from, tearY(from)]];
  if (from <= to) pts.push(...mids);
  else pts.push(...mids.slice().reverse());
  if (Math.abs(to - from) > 1e-6) pts.push([to, tearY(to)]);
  return pts;
}

function poly(pts) {
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(", ")})`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Tearing rightward starts at the left edge, and vice versa.
function tearFront(cut = tearCut) {
  return tearDir === "left" ? 100 - cut * 100 : cut * 100;
}

// The strip that has already come loose, from the start edge to the tear front.
function flapPoly(front) {
  const f = clamp(front + (tearDir === "left" ? -0.7 : 0.7), 0, 100);
  return tearDir === "left"
    ? poly([[f, 0], [100, 0], ...jagged(100, f)])
    : poly([[0, 0], [f, 0], ...jagged(f, 0)]);
}

// The pack minus that strip — the top stays intact ahead of the tear.
function bodyPoly(front) {
  const f = clamp(front, 0, 100);
  return tearDir === "left"
    ? poly([[0, 0], [f, 0], ...jagged(f, 100), [100, 100], [0, 100]])
    : poly([[f, 0], [100, 0], [100, 100], [0, 100], ...jagged(0, f)]);
}

// Dark opening, only under the part that has torn away.
function mouthPoly(front) {
  const f = clamp(front, 0, 100);
  const depth = 7;
  return tearDir === "left"
    ? poly([...jagged(f, 100), [100, tearY(100) + depth], [f, tearY(f) + depth]])
    : poly([...jagged(0, f), [f, tearY(f) + depth], [0, tearY(0) + depth]]);
}

function applyTearVisuals({ fade = 1 } = {}) {
  const live = els.packBody.classList.contains("tearing") || fade < 1;
  if (!live || !tearDir || tearCut <= 0.001) {
    els.packRestArt.style.clipPath = "";
    els.packTopArt.style.clipPath = "";
    els.packTop.style.transform = "";
    els.packTop.style.transformOrigin = "";
    els.packTop.style.opacity = "0";
    els.packTop.style.visibility = "hidden";
    if (els.packMouth) {
      els.packMouth.style.clipPath = "";
      els.packMouth.style.opacity = "0";
    }
    if (els.tearEdge) els.tearEdge.setAttribute("d", "");
    return;
  }

  const front = tearFront();
  els.packTopArt.style.clipPath = flapPoly(front);
  els.packRestArt.style.clipPath = bodyPoly(front);
  els.packTop.style.visibility = "visible";
  els.packTop.style.opacity = String(clamp(fade, 0, 1));
  // Hinge on the tear front so the loose strip peels off it as the tear grows.
  els.packTop.style.transformOrigin = `${front.toFixed(2)}% ${tearY(front).toFixed(2)}%`;
  els.packTop.style.transform =
    `translate(${tearPose.dx.toFixed(2)}px, ${tearPose.dy.toFixed(2)}px) rotate(${tearPose.rot.toFixed(2)}deg)`;

  if (els.packMouth) {
    els.packMouth.style.clipPath = mouthPoly(front);
    els.packMouth.style.opacity = String(clamp(tearCut * 6, 0, 1));
  }

  if (els.tearEdge) {
    const pts = tearDir === "left" ? jagged(100, front) : jagged(0, front);
    els.tearEdge.setAttribute(
      "d",
      pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ")
    );
  }
}

function addCrumbs(xPct, count, strong = false) {
  if (!els.crumbs) return;
  const away = tearDir === "left" ? -1 : 1;
  const reach = strong ? 130 : 26;
  const rise = strong ? 75 : 26;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const at = clamp(xPct + (Math.random() - 0.5) * (strong ? 40 : 10), 0, 100);
    const bit = document.createElement("i");
    bit.className = "crumb";
    bit.style.left = `${at.toFixed(2)}%`;
    bit.style.top = `${(tearY(at) - 0.6 + Math.random() * 1.4).toFixed(2)}%`;
    bit.style.width = `${2 + Math.random() * (strong ? 4 : 2.4)}px`;
    bit.style.height = `${1.5 + Math.random() * (strong ? 3 : 2)}px`;
    bit.style.setProperty("--cx", `${away * (10 + Math.random() * reach) + (Math.random() - 0.5) * 22}px`);
    bit.style.setProperty("--cy", `${-8 - Math.random() * rise}px`);
    bit.style.setProperty("--rot", `${(Math.random() - 0.5) * 620}deg`);
    bit.style.setProperty("--dly", `${Math.random() * (strong ? 110 : 40)}ms`);
    bit.addEventListener("animationend", () => bit.remove());
    frag.appendChild(bit);
  }
  els.crumbs.appendChild(frag);
}

function tornEnough() {
  return tearCut >= 0.45;
}

function setTearDir(dir) {
  tearDir = dir === "right" ? "right" : "left";
  els.packBody.classList.toggle("tear-from-left", tearDir === "left");
  els.packBody.classList.toggle("tear-from-right", tearDir === "right");
}

function resetScrapStyle() {
  els.packRestArt.style.clipPath = "";
  els.packTopArt.style.clipPath = "";
  els.packTop.style.transform = "";
  els.packTop.style.transformOrigin = "";
  els.packTop.style.opacity = "";
  els.packTop.style.visibility = "";
  els.packTop.style.pointerEvents = "";
  els.packTop.style.animation = "";
  if (els.packMouth) {
    els.packMouth.style.clipPath = "";
    els.packMouth.style.opacity = "";
  }
  if (els.crumbs) els.crumbs.innerHTML = "";
  if (els.tearEdge) els.tearEdge.setAttribute("d", "");
}

function resetTear() {
  cancelTearAnim();
  tearing = false;
  tearCut = 0;
  tearLift = 0;
  lastCrumbCut = 0;
  tearDir = null;
  tearPose = { dx: 0, dy: 0, rot: 0 };
  lastPointer = { x: 0, y: 0 };
  resetScrapStyle();
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

/** Pack art for a pack the server opened: one of the set's wrappers, or a special pack's. */
function wrapperFor(id) {
  const special = Object.values(liveSet.specialPacks || {}).find((pack) => pack.wrapper.id === id);
  return special?.wrapper || liveSet.wrappers.find((w) => w.id === id) || liveSet.wrappers[0];
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
    const packs = (data.packs || []).map((pack) => ({
      wrapper: wrapperFor(pack.wrapperId),
      cards: pack.cards || [],
    }));
    const promos = (data.promos || []).map((card) => ({ ...card, reverse: false }));
    sealedRun = {
      product: { ...offer, ...data.product },
      packs,
      promos,
      index: promos.length ? -1 : 0,
      cost: data.cost,
    };
    renderHeader();
    renderShop();
    if (promos.length) showPromoIntro();
    else if (packs.length) presentPack(packs[0].wrapper, packs[0].cards);
  } catch (err) {
    toast(err.message || "Couldn't open that box.");
    renderHeader();
    renderShop();
  } finally {
    ripLock = false;
  }
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
  paintOpeningStage(run.packs[0]?.wrapper || liveSet.wrappers[0]);
  els.overlay.classList.add("is-spread");
  els.packBody.classList.add("hidden", "emptied");
  els.focusWrap.classList.add("hidden");
  els.thumbs.innerHTML = "";
  els.spread.classList.remove("hidden");

  const promos = run.promos;
  const worth = money(promos.reduce((sum, card) => sum + sellValue(card), 0));
  const fresh = promos.filter((card) => card.wasNew).length;
  const packs = run.packs.length;
  const head =
    promos.length === 1
      ? `${promos[0].name}, ${numberLine(promos[0])}.`
      : `${promos.length} promos in the ${run.product.noun}.`;
  els.spread.innerHTML = `
    <div class="spread-head">
      <p class="spread-kicker">${esc(liveSet.name)} · ${esc(run.product.name)}</p>
      <h2>${esc(head)}</h2>
      <div class="spread-stats">
        <span><b data-count="${promos.length}">${promos.length}</b> promo${promos.length === 1 ? "" : "s"}</span>
        <span><b data-count="${fresh}">${fresh}</b> new</span>
        <span><b data-count="${worth}" data-fmt="coin" data-prefix="✦ ">✦ ${coin(worth)}</b> value</span>
        ${packs ? `<span><b>${packs}</b> pack${packs === 1 ? "" : "s"} to open</span>` : ""}
      </div>
    </div>
    <div class="spread-grid promo-spread">${promos
      .map(
        (card, i) => `<button type="button" class="spread-card promo-pull ${i === 0 ? "top-pull" : ""}"
          style="--d:${i * 90}ms"
          ${inspectAttrs(card)}
          title="${esc(card.name)} · ${esc(rarityLine(card))}">
        ${tcgFace(card)}
        <span class="chip promo">Promo</span>
        ${card.wasNew ? `<span class="chip new">New</span>` : ""}
      </button>`
      )
      .join("")}</div>
    <p class="spread-tip">${
      `${promos.length === 1 ? "Your promo is" : "Your promos are"} saved. ${
        packs ? "The packs come next." : "The deck's other cards aren't simulated."
      }`
    } Select a card to inspect it.</p>`;

  els.ripHint.textContent = "";
  syncBoxProgress();
  syncActions();
  openDialog(els.overlay, packs ? els.againBtn : els.doneBtn);
  dealSpread();
  countUpStats(els.spread);
}

/** Put a freshly ripped pack on the table, ready to tear. */
function presentPack(wrapper, pulled) {
  activeWrapper = wrapper;
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
  buildTearPath();
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
  syncBoxProgress();
  syncActions();
  openDialog(els.overlay, els.stepBtn);
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
  resetScrapStyle();
  els.packBody.classList.add("hidden", "emptied");
  els.packBody.classList.remove("torn", "tearing", "dragging", "cutting", "pack-exit", "spill");
  els.overlay.classList.add("dealing");
  els.ripHint.textContent = "";
  showStrip = true;
  drawNext({ fromPack: true });
}

function flyOffPose() {
  const away = tearDir === "left" ? -1 : 1;
  return {
    dx: away * (els.packBody.getBoundingClientRect().width * 0.55 + 70),
    dy: -68,
    rot: away * 46,
  };
}

function completeTear() {
  if (packPhase !== "ready" || packExiting) return;
  packExiting = true;
  tearing = false;
  cancelTearAnim();
  if (!tearDir) setTearDir("right");
  els.packBody.classList.add("tearing", "torn");
  els.packBody.classList.remove("dragging");
  els.ripHint.textContent = "Wrapper coming off";
  buzz([12, 18, 26]);
  const startCut = tearCut;
  const startLift = tearLift;
  const endPose = flyOffPose();
  const t0 = performance.now();
  const dur = 560;
  let ripped = false;
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    // Finish the tear across the pack first, then throw the strip clear.
    const rip = clamp(t / 0.45, 0, 1);
    const easeRip = 1 - Math.pow(1 - rip, 2);
    tearCut = startCut + (1 - startCut) * easeRip;
    const toss = clamp((t - 0.4) / 0.6, 0, 1);
    const easeToss = 1 - Math.pow(1 - toss, 3);
    const peel = liftRot(Math.max(startLift, 0.2 + 0.5 * easeRip), tearFront());
    tearPose = {
      dx: endPose.dx * easeToss,
      dy: endPose.dy * easeToss,
      rot: peel + (endPose.rot - peel) * easeToss,
    };
    if (!ripped && rip >= 1) {
      ripped = true;
      addCrumbs(tearFront(), 10, true);
      tearBurst();
      if (fxOk()) els.packBody.classList.add("spill");
    } else if (rip < 1 && tearCut - lastCrumbCut > 0.07) {
      lastCrumbCut = tearCut;
      addCrumbs(tearFront(), 2);
    }
    applyTearVisuals({ fade: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3 });
    if (t < 1) {
      tearAnim = requestAnimationFrame(tick);
      return;
    }
    tearAnim = 0;
    // Let the cards clear the wrapper before the first one comes forward.
    if (els.packBody.classList.contains("spill")) handoffTimer = setTimeout(hidePackThenDeal, 300);
    else hidePackThenDeal();
  };
  applyTearVisuals();
  tearAnim = requestAnimationFrame(tick);
}

function clearLiveTear() {
  tearCut = 0;
  tearLift = 0;
  lastCrumbCut = 0;
  tearDir = null;
  tearPose = { dx: 0, dy: 0, rot: 0 };
  resetScrapStyle();
  els.packBody.classList.remove("tearing", "dragging", "cutting", "tear-from-left", "tear-from-right");
}

function easeTearBack() {
  cancelTearAnim();
  const startCut = tearCut;
  const startLift = tearLift;
  if (startCut < 0.02) {
    clearLiveTear();
    return;
  }
  const t0 = performance.now();
  const dur = 260;
  const tick = (now) => {
    if (tearing || packPhase !== "ready") return;
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - t) * (1 - t);
    tearCut = startCut * (1 - e);
    tearLift = startLift * (1 - e);
    tearPose = { dx: 0, dy: 0, rot: liftRot(tearLift, tearFront()) };
    applyTearVisuals();
    if (t < 1) {
      tearAnim = requestAnimationFrame(tick);
      return;
    }
    tearAnim = 0;
    clearLiveTear();
  };
  tearAnim = requestAnimationFrame(tick);
}

function finishRip({ keepOpen = false } = {}) {
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
  if (!keepOpen) closeDialog(els.overlay);
  syncBoxProgress();
  clearTimeout(auraTimer);
  auraTimer = 0;
  auraGen += 1;
  els.overlay.classList.remove("dealing", "hit-flash", "hit-shake", "rainbow", "glow-on", "aura-snap", "is-spread");
  els.overlay.style.removeProperty("--aura");
  els.focusWrap.classList.remove("rainbow", "revealed", "is-hit", "is-legend", "is-reverse", "aura-snap");
  els.focusWrap.style.removeProperty("--aura");
  delete els.focusWrap.dataset.glow;
  els.focusAura.classList.remove("rays");
  renderHeader();
  renderShop();
  if (view === "home") renderHome();
  if (view === "collection") renderCollection();
  if (!keepOpen) toast("Added to collection.");
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
  const count = state.collection[card.id] || 0;
  const value = sellValue(card);
  if (!activeTrainer()) {
    return `<div class="pc-sell">
      <span class="pc-own">Sign in to own and sell cards</span>
    </div>`;
  }
  if (count < 1) {
    return `<div class="pc-sell">
      <span class="pc-own">Unpulled — still hunting this one</span>
    </div>`;
  }
  return `<div class="pc-sell">
    <span class="pc-own">You own ×${count}</span>
    <button type="button" class="solid pc-sell-btn" data-inspect-sell="${esc(card.id)}">
      Sell one · +${coin(value)}
    </button>
    ${inspectShowcaseBtn(card)}
  </div>`;
}

function inspectShowcaseBtn(card) {
  const trainer = activeTrainer();
  if (!trainer) return "";
  const on = (trainer.showcase || []).some((slot) => slot.id === card.id);
  return `<button type="button" class="ghost pc-showcase-btn" data-inspect-showcase="${esc(card.id)}">${
    on ? "Remove from showcase" : "Add to showcase"
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
  const last = (state.collection[card.id] || 0) <= 1;
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

function questsTab() {
  const summary = state.quests;
  if (!summary || summary.unavailable) return `<p class="panel-empty">Quests are being prepared. Check back shortly.</p>`;
  const claimed = new Set(summary.claimed || []);
  const section = (period, title, reset) => `<section class="ach-wall">
    <div class="ach-head"><div><h2>${title}</h2><p class="panel-note">Resets ${new Date(reset).toLocaleString()} · UTC schedule</p></div></div>
    <div class="ach-grid">${QUESTS.filter(row => row.period === period).map(row => {
      const at = Math.min(row.goal, Number(summary.progress?.[row.id] || 0));
      const done = at >= row.goal;
      const paid = claimed.has(row.id);
      return `<article class="ach-tile ${paid ? "is-claimed" : done ? "is-ready" : "is-locked"}">
        <div class="ach-badge" style="--pct:${Math.round(at / row.goal * 100)}"><span>${period === "daily" ? "D" : "W"}</span></div>
        <div class="ach-tile-copy"><b>${esc(row.name)}</b><p>${esc(row.note)}</p>
          ${done ? "" : `<div class="ach-bar"><span style="width:${Math.round(at / row.goal * 100)}%"></span></div>`}
        </div>
        <div class="ach-reward"><span class="ach-coin">&#10022; ${num(row.coins)}</span>
          ${paid ? `<span class="ach-done">Claimed</span>` : done ? `<button class="solid sm" type="button" data-quest-claim="${esc(row.id)}">Claim</button>` : `<span class="ach-progress">${at} / ${row.goal}</span>`}
        </div>
      </article>`;
    }).join("")}</div>
  </section>`;
  return `<div class="ach-wall"><p class="panel-note">Earn extra coins through play. Rewards are checked on your account when you claim them.</p>
    ${section("daily", "Daily quests", Number(summary.periods.daily) + 86_400_000)}
    ${section("weekly", "Weekly quests", Number(summary.periods.weekly) + 7 * 86_400_000)}
  </div>`;
}

async function sellSetDuplicates() {
  if (!activeTrainer()) return openAuth("signin");
  const setId = liveSet.id;
  const count = spareCopies();
  if (!count) return;
  let estimate = 0;
  for (const [id, qty] of Object.entries(state.collection || {})) {
    if (!id.startsWith(`${setId}-`) || qty < 2) continue;
    const card = findCard(id);
    if (card) estimate += (qty - 1) * sellValue(card);
  }
  if (!confirm(`Sell ${count} duplicate${count === 1 ? "" : "s"} from ${liveSet.name} for about ${coin(estimate)} coins? You will keep one copy of every card.`)) return;
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

function openInspect(id, reverse = false, reverseKind = "") {
  const base = findCard(id);
  if (!base) return;
  const card = reverse ? { ...base, reverse: true, ...(reverseKind ? {reverseKind} : {}) } : base;
  inspectCard = card;
  inspectRange = "30d";
  inspectOpenedAt = Date.now();
  els.inspectArt.innerHTML = tcgFace(card);
  els.inspectInfo.innerHTML = `
    <p class="kicker">${esc(numberLine(card))} · <span class="kicker-rarity">${rarityPips(card.rarity)} ${esc(rarityLine(card))}</span> · ${esc(card.supertype)}</p>
    <h2>${esc(card.name)}</h2>
    <p>${esc(card.subtypes?.join(" · ") || "")}${card.hp ? ` · ${esc(card.hp)} HP` : ""}${card.evolvesFrom ? ` · Evolves from ${esc(card.evolvesFrom)}` : ""}</p>
    <div class="price-card" id="inspect-chart"></div>
    <div id="inspect-sell"></div>
    <p class="artist">Illus. ${esc(card.artist || "Unknown")}</p>`;
  paintInspect(card);
  openDialog(els.inspect, els.inspectClose);
}

els.inspectInfo.addEventListener("click", (e) => {
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
  if (e.target.closest("#home-rip")) {
    startRip(liveSet.wrappers?.[0]);
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
  await activateSet(id);
  setView("shop");
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
  if (!confirm("Reset coins, binder, and history? This cannot be undone.")) return;
  if (!activeTrainer()) {
    toast("Sign in first — there is no local binder to reset.");
    openAuth("signin");
    return;
  }
  api("/api/me/reset", { method: "POST" })
    .then(async (data) => {
      applyCloudSave(data.save);
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
  const filter = e.target.closest("[data-ach-filter]");
  if (filter) {
    achFilter = filter.dataset.achFilter;
    renderAccount();
    return;
  }
  const claim = e.target.closest("[data-claim]");
  const questClaim = e.target.closest("[data-quest-claim]");
  if (questClaim) {
    questClaim.disabled = true;
    try {
      const data = await api("/api/quests/claim", { method: "POST", body: JSON.stringify({ id: questClaim.dataset.questClaim }) });
      afterEconomy(data.save);
      renderHeader();
      renderAccount();
      toast(`Quest claimed · +${coin(data.coins)} coins`);
    } catch (err) {
      toast(err.message || "Couldn't claim quest.");
      renderAccount();
    }
    return;
  }
  if (claim) {
    const row = achievementById(claim.dataset.claim);
    await claimAchievements({ id: claim.dataset.claim }, row?.name || "Claimed");
    return;
  }
  if (e.target.closest("#claim-all")) {
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
  const setMotion = e.target.closest("[data-set-motion]");
  if (setMotion) {
    const trainer = activeTrainer();
    if (!trainer) return;
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
      banner: `${pick(BANNER_MOTIONS).id}:${a}+${b === a ? pick(AVATAR_COLORS).id : b}`,
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
async function claimAchievements(body, label) {
  if (!activeTrainer()) {
    openAuth("signin");
    return;
  }
  try {
    const data = await api("/api/achievements/claim", { method: "POST", body: JSON.stringify(body) });
    afterEconomy(data.save);
    renderHeader();
    renderAccount();
    rewardFlash(data.rewards || [], data.coins || 0);
    const titles = data.titles || [];
    toast(
      titles.length
        ? `${label} · +✦ ${num(data.coins)} · title unlocked: ${titles.join(", ")}`
        : `${label} · +✦ ${num(data.coins)}`
    );
  } catch (err) {
    toast(err.message || "Couldn't claim that.");
    renderAccount();
  }
}

/** The little gold card that flies in when a reward lands. */
function rewardFlash(rewards, coins) {
  if (!rewards.length) return;
  document.querySelector(".reward-flash")?.remove();
  const titles = rewards.filter((row) => row.title);
  const el = document.createElement("div");
  el.className = "reward-flash";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <b>+✦ ${num(coins)}</b>
    <span>${rewards.length === 1 ? esc(rewards[0].name) : `${rewards.length} achievements claimed`}</span>
    ${titles.length ? `<i>Title unlocked · ${titles.map((row) => esc(row.title)).join(", ")}</i>` : ""}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  window.setTimeout(() => {
    el.classList.remove("show");
    window.setTimeout(() => el.remove(), 400);
  }, 2800);
}

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

function profileBinderPagesHtml() {
  const {pages, mine, position} = profileBinderView;
  if (!pages.length) return mine ? `<section class="panel profile-binder"><h3>Binder pages</h3><p class="panel-empty">Display up to four favourite pages from your binder.</p><a class="ghost" href="/binder">Choose a binder page</a></section>` : "";
  const page = pages[position];
  const pockets = page.slots.map(slot => {
    if (!slot) return `<div class="profile-pocket empty" aria-label="Empty pocket"></div>`;
    const known = findCard(slot.id);
    const card = known ? {...known, reverse:slot.reverse} : null;
    return `<div class="profile-pocket"><button type="button" class="mini-card" ${card ? inspectAttrs(card) : ""} aria-label="${esc(slot.name)}">${card ? tcgFace(card, {small:true, stamp:false, lazy:true}) : `<img src="${esc(slot.image)}" alt="${esc(slot.name)}" loading="lazy">`}</button></div>`;
  }).join("");
  return `<section class="panel profile-binder"><div class="profile-section-head"><div><p class="eyebrow">THE COLLECTION</p><h3>Inside the binder</h3></div><span>${pages.length} shared ${pages.length === 1 ? "page" : "pages"}</span></div>
    <nav class="profile-page-nav" aria-label="Shared binder pages">
      <button type="button" class="ghost" data-profile-page="-1" ${position === 0 ? "disabled" : ""} aria-label="Previous binder page">← Back</button>
      <span role="status" aria-live="polite">${position + 1} of ${pages.length}</span>
      <button type="button" class="ghost" data-profile-page="1" ${position === pages.length - 1 ? "disabled" : ""} aria-label="Next binder page">Next →</button>
    </nav>
    <div class="profile-binder-pages"><article class="profile-binder-page"><header><b>Binder page ${page.index + 1}</b><span class="profile-page-actions"><button type="button" class="link-btn" data-copy-page-link="${page.index}">Copy link</button>${mine ? `<button type="button" class="link-btn" data-share-page="${page.index}">Remove from profile</button>` : ""}</span></header><div class="binder-pockets">${pockets}</div></article></div></section>`;
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
      setView("account");
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
    setView("account");
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
  els.priceKicker.textContent = `${liveSet.name} · Market price`;
  els.priceTitle.textContent = key === "boosterPack" ? "Booster pack" : offer?.name || name;
  els.priceNote.textContent =
    `TCGplayer market price in US dollars, recorded once a day.` +
    (shopPrice > 0 ? ` The shop sells it for ✦ ${coin(shopPrice)}.` : "");
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

els.packGrid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-wrapper]");
  if (!card) return;
  const wrapper = liveSet.wrappers.find((w) => w.id === card.dataset.wrapper);
  startRip(wrapper);
});

// A box costs real coin, so the first click arms the button and the second buys.
function onProductClick(e) {
  const face = e.target.closest("[data-inspect]");
  if (face) {
    inspectFromEl(face);
    return;
  }
  const card = e.target.closest("[data-sealed]");
  if (!card || e.target.closest("button")?.disabled) return;
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
  cancelTearAnim();
  tearing = true;
  tearStart = { x: e.clientX, y: e.clientY };
  lastPointer = { x: e.clientX, y: e.clientY };
  tearCut = 0;
  tearLift = 0;
  lastCrumbCut = 0;
  tearDir = null;
  tearPose = { dx: 0, dy: 0, rot: 0 };
  els.packBody.classList.add("tearing");
  try {
    els.packBody.setPointerCapture?.(e.pointerId);
  } catch {
    /* no capture available; window listeners still track the drag */
  }
  applyTearVisuals();
  e.preventDefault();
  return true;
}

els.packBody.addEventListener("pointerdown", beginTear);

// Angle the loose strip so its free end peels up by a steady amount, however
// long the strip has grown — a fixed angle would swing it wildly once it's long.
function liftRot(lift, front) {
  const w = els.packBody.getBoundingClientRect().width || 270;
  const lenPct = tearDir === "left" ? 100 - front : front;
  const lenPx = Math.max((lenPct / 100) * w, 1);
  const rise = 20 + 38 * clamp(lift, 0, 1);
  const deg = (Math.asin(clamp(rise / lenPx, 0, 0.6)) * 180) / Math.PI;
  return (tearDir === "left" ? -1 : 1) * deg;
}

function moveTear(e) {
  if (!tearing || packPhase !== "ready") return;
  lastPointer = { x: e.clientX, y: e.clientY };
  const rect = els.packBody.getBoundingClientRect();
  const dx = e.clientX - tearStart.x;
  const dy = e.clientY - tearStart.y;
  if (!tearDir && Math.abs(dx) >= 5) {
    setTearDir(dx > 0 ? "right" : "left");
    els.packBody.classList.add("dragging");
  }
  if (!tearDir) return;

  // 1px of drag = 1px of tear, so the front stays under the cursor.
  const along = tearDir === "left" ? Math.max(0, -dx) : Math.max(0, dx);
  tearCut = clamp(along / Math.max(rect.width, 1), 0, 1);
  tearLift = Math.max(tearCut * 0.55, clamp(-dy / Math.max(rect.height * 0.3, 1), 0, 1));
  tearPose = { dx: 0, dy: 0, rot: liftRot(tearLift, tearFront()) };

  if (tearCut - lastCrumbCut > 0.07) {
    lastCrumbCut = tearCut;
    addCrumbs(tearFront(), 2);
  }

  applyTearVisuals();
  if (tearCut >= 0.94) completeTear();
}

// On window so the rip keeps following the cursor past the pack edges.
window.addEventListener("pointermove", moveTear);

function endTear(e) {
  if (!tearing) return;
  tearing = false;
  els.packBody.classList.remove("dragging");
  if (packPhase === "ready") {
    if (tornEnough()) completeTear();
    else easeTearBack();
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
els.viewPullsBtn.addEventListener("click", () => {
  finishRip();
  setView("collection");
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

els.dexGrid.addEventListener("click", (e) => {
  const sellBtn = e.target.closest("[data-sell]");
  if (sellBtn) {
    e.preventDefault();
    e.stopPropagation();
    sellOwnedCard(byId[sellBtn.dataset.sell], { extra: true });
    return;
  }
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
  } else if (img.classList.contains("catalog-symbol") || img.classList.contains("rail-symbol")) {
    img.remove();
  }
}
els.catalogEras.addEventListener("error", hideBrokenSetArt, true);
els.setSwitcher.addEventListener("error", hideBrokenSetArt, true);
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
      if (setCache[set.id]) return;
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
    const setId = setIdFromPath(path);
    if (setId) await activateSet(setId);
    // /packs and unknown sets settle on the address of the set that is showing.
    setView("shop", { history: "replace" });
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

async function boot() {
  try {
    await Promise.all([loadSealedPrices(), loadPatchNotes()]);
    await refreshSession();
    // Friends and requests load now rather than on the next 5s poll, so the
    // Social page and the Friends badge are right on first paint.
    if (cloudUser) notifySignedIn();
    await activateSet(setIdFromPath(location.pathname) || state.activeSetId || DEFAULT_SET_ID);
    applySettings();
    renderHeader();
    scheduleDailyTick();
    const back = new Image();
    back.src = liveSet.cardBack;
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
