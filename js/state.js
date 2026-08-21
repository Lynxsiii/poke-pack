import { money } from "./catalog.js";

const KEY = "poke-pack-rip-v3";
const LEGACY_KEYS = ["poke-pack-rip-v2", "poke-pack-rip-v1"];
// Coins are dollars: a card sells for its real market price, and a pack costs
// what that pack costs online. Both figures are on that same scale.
const STARTING_COINS = 25;
const DAILY_BONUS = 100;
const DAILY_COOLDOWN_MS = 60 * 60 * 1000;

export const DEFAULT_SETTINGS = {
  // Card look
  shine: true,
  tilt: true,
  stamps: false,
  motion: true,
  foil: "normal", // subtle | normal | intense
  // Opening a pack
  flash: true,
  haptics: true,
  // Binder
  binder: "cosy", // compact | cosy | large
  confirmSell: false,
  // Start-up
  startView: "home", // home | shop | collection
};

function blank() {
  return {
    coins: STARTING_COINS,
    collection: {},
    reverses: {},
    lastDaily: null,
    packsOpened: 0,
    pulls: 0,
    packsSinceHit: 0,
    packTrick: false,
    history: [],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: Date.now(),
    activeSetId: "me5",
    economyScale: ECONOMY_SCALE,
    settingsRev: SETTINGS_REV,
    // Money handed to the player (start + every hourly claim). Net worth
    // minus this is profit or loss, which is the only honest way to say
    // whether ripping has gained or lost value.
    granted: STARTING_COINS,
    // [timestamp, netWorth] samples for the home-page chart.
    worthLog: [],
    // Curated showcase, separate from `collection`. A flat list of slots read
    // BINDER_PAGE at a time, so it pages like a real 9-pocket binder. Entries
    // are { id, reverse } or null for an empty pocket.
    binder: [],
  };
}

/*
 * Coins used to be 100 per USD with made-up rarity prices; they are now 1 per
 * USD against real market data. A save from before that carries a balance ~100x
 * too big, so divide it once and stamp the save so it only ever happens once.
 */
const ECONOMY_SCALE = 2;
const SETTINGS_REV = 1;

const WORTH_LOG_LIMIT = 160;

function migrateSettings(save) {
  const rev = Number(save.settingsRev) || 0;
  if (rev < 1) {
    if (!save.settings) save.settings = { ...DEFAULT_SETTINGS };
    save.settings.stamps = false;
    save.settingsRev = 1;
  }
  return save;
}

function migrateEconomy(save) {
  if (save.economyScale === ECONOMY_SCALE) return save;
  save.coins = money((Number(save.coins) || 0) / 100);
  save.economyScale = ECONOMY_SCALE;
  // Past dailies are unknowable, so don't guess a baseline.
  save.granted = null;
  return save;
}

/**
 * Record a net-worth sample. One sample per money move — collapsing by time
 * would flatten a run of packs opened back to back, which is exactly the
 * stretch worth seeing. Only a genuinely unchanged value is folded into the
 * previous point, and the series is capped rather than time-bucketed.
 */
export function logWorth(state, worth) {
  const log = Array.isArray(state.worthLog) ? state.worthLog : (state.worthLog = []);
  const value = money(worth);
  const last = log[log.length - 1];
  if (last && last[1] === value) log[log.length - 1] = [Date.now(), value];
  else log.push([Date.now(), value]);
  if (log.length > WORTH_LOG_LIMIT) log.splice(0, log.length - WORTH_LOG_LIMIT);
  return log;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Merge settings separately so saves from before a new toggle existed
      // still pick up its default instead of dropping it.
      const next = migrateSettings(migrateEconomy({
        ...blank(),
        ...saved,
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
        activeSetId: saved.activeSetId || "me5",
        reverses: saved.reverses || {},
        // blank() stamps the current scale, so an untagged save has to be
        // treated as old here or the migration would skip it.
        economyScale: saved.economyScale ?? 1,
        settingsRev: saved.settingsRev || 0,
      }));
      if ((saved.settingsRev || 0) < 1) {
        localStorage.setItem(KEY, JSON.stringify(next));
      }
      return next;
    }
    for (const legacyKey of LEGACY_KEYS) {
      const legacy = localStorage.getItem(legacyKey);
      if (!legacy) continue;
      const old = JSON.parse(legacy);
      return migrateEconomy({
        ...blank(),
        coins: old.coins ?? STARTING_COINS,
        lastDaily: old.lastDaily ?? null,
        packTrick: Boolean(old.packTrick),
        economyScale: 1,
      });
    }
  } catch {
    /* start fresh */
  }
  return blank();
}

export function saveState(state) {
  if (!persistProgress) {
    try {
      const prev = JSON.parse(localStorage.getItem(KEY) || "null") || {};
      localStorage.setItem(
        KEY,
        JSON.stringify({
          ...prev,
          settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
          settingsRev: state.settingsRev || prev.settingsRev,
          activeSetId: state.activeSetId || prev.activeSetId,
        })
      );
    } catch {
      /* ignore quota / parse issues */
    }
  } else {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  afterSave?.(state);
}

let afterSave = null;
export function setAfterSave(fn) {
  afterSave = fn;
}

let persistProgress = true;
export function setPersistProgress(on) {
  persistProgress = Boolean(on);
}

function lastClaimAt(state) {
  if (state.lastDaily == null) return 0;
  return typeof state.lastDaily === "number" ? state.lastDaily : Date.parse(state.lastDaily) || 0;
}

export function canClaimDaily(state) {
  return msUntilDaily(state) <= 0;
}

/** Milliseconds until the next claim, 0 when it is ready. */
export function msUntilDaily(state) {
  return Math.max(0, lastClaimAt(state) + DAILY_COOLDOWN_MS - Date.now());
}

export function claimDaily(state) {
  if (!canClaimDaily(state)) return false;
  state.coins = money(state.coins + DAILY_BONUS);
  state.granted = money((state.granted || 0) + DAILY_BONUS);
  state.lastDaily = Date.now();
  saveState(state);
  return DAILY_BONUS;
}

export function ownedCount(state, catalog) {
  return catalog.filter((card) => (state.collection[card.id] || 0) > 0).length;
}

export function addPull(state, card, packId) {
  const wasNew = !state.collection[card.id];
  state.collection[card.id] = (state.collection[card.id] || 0) + 1;
  if (card.reverse) {
    state.reverses[card.id] = (state.reverses[card.id] || 0) + 1;
  }
  state.pulls += 1;
  state.history.unshift({
    id: card.id,
    name: card.name,
    rarity: card.rarity,
    reverse: Boolean(card.reverse),
    packId,
    at: Date.now(),
    wasNew,
  });
  state.history = state.history.slice(0, 24);
  return wasNew;
}

/** Nine pockets a page, the standard sheet. */
export const BINDER_PAGE = 9;
/** Two facing pages, so a fresh binder opens on a full spread. */
const BINDER_START_PAGES = 2;

function binderSlots(state) {
  if (!Array.isArray(state.binder)) state.binder = [];
  const min = BINDER_PAGE * BINDER_START_PAGES;
  while (state.binder.length < min) state.binder.push(null);
  return state.binder;
}

/** How many cards of `id` are sitting in binder pockets. */
export function binderHeld(state, id) {
  return binderSlots(state).filter((slot) => slot && slot.id === id).length;
}

/**
 * Copies free to place: what you own minus what is already showcased, so the
 * same card can't be slotted twice from a single copy.
 */
export function spareFor(state, id) {
  return Math.max(0, (state.collection[id] || 0) - binderHeld(state, id));
}

export function placeInBinder(state, index, id, reverse = false) {
  const slots = binderSlots(state);
  if (index < 0 || index >= slots.length) return false;
  if (spareFor(state, id) < 1) return false;
  slots[index] = { id, reverse: Boolean(reverse) };
  saveState(state);
  return true;
}

export function clearBinderSlot(state, index) {
  const slots = binderSlots(state);
  if (!slots[index]) return false;
  slots[index] = null;
  saveState(state);
  return true;
}

/** Append another empty page. */
export function addBinderPage(state) {
  const slots = binderSlots(state);
  for (let i = 0; i < BINDER_PAGE; i += 1) slots.push(null);
  saveState(state);
  return slots.length / BINDER_PAGE;
}

/**
 * Drop showcased copies you no longer own — selling out of a card should empty
 * its pocket rather than leave the binder claiming a card that has gone.
 */
export function reconcileBinder(state) {
  const slots = binderSlots(state);
  const budget = {};
  let changed = false;
  slots.forEach((slot, i) => {
    if (!slot) return;
    const owned = state.collection[slot.id] || 0;
    budget[slot.id] = (budget[slot.id] || 0) + 1;
    if (budget[slot.id] > owned) {
      slots[i] = null;
      changed = true;
    }
  });
  return changed;
}

export function resetProgress(state) {
  const keep = { ...state.settings };
  const setId = state.activeSetId;
  Object.assign(state, blank(), { settings: keep, activeSetId: setId });
  saveState(state);
}

/**
 * Sell one copy, including the last one — the binder tracks what you own, so
 * selling out of a card is allowed and just empties that slot again.
 * Reverse prints are sold off first so `state.reverses` stays in step with what
 * is actually left, otherwise a card keeps rendering as a reverse long after
 * that print was sold.
 */
export function sellOne(state, id, value) {
  if ((state.collection[id] || 0) < 1) return false;
  state.collection[id] -= 1;
  if (state.collection[id] <= 0) delete state.collection[id];
  if (state.reverses?.[id] > 0) {
    state.reverses[id] -= 1;
    if (state.reverses[id] <= 0) delete state.reverses[id];
  }
  state.coins = money(state.coins + value);
  reconcileBinder(state);
  saveState(state);
  return true;
}

/**
 * Replace progress from an exported save file. Returns false for anything that
 * is not a save, so a mis-picked file cannot wipe a binder.
 */
export function importState(state, raw) {
  if (!raw || typeof raw !== "object") return false;
  if (typeof raw.coins !== "number" || typeof raw.collection !== "object" || !raw.collection) {
    return false;
  }
  const keepSettings = { ...state.settings };
  Object.assign(state, blank(), raw, {
    settings: { ...DEFAULT_SETTINGS, ...keepSettings, ...(raw.settings || {}) },
    reverses: raw.reverses || {},
    history: Array.isArray(raw.history) ? raw.history.slice(0, 24) : [],
    // A save exported before coins became dollars still needs converting.
    economyScale: raw.economyScale ?? 1,
    settingsRev: raw.settingsRev || 0,
  });
  migrateEconomy(state);
  migrateSettings(state);
  saveState(state);
  return true;
}

/** JSON-safe snapshot of progress so trainers can switch without sharing a binder. */
export function cloneSave(state) {
  return {
    coins: state.coins,
    collection: { ...(state.collection || {}) },
    reverses: { ...(state.reverses || {}) },
    lastDaily: state.lastDaily,
    packsOpened: state.packsOpened,
    pulls: state.pulls,
    packsSinceHit: state.packsSinceHit,
    packTrick: Boolean(state.packTrick),
    history: Array.isArray(state.history) ? state.history.slice(0, 24) : [],
    settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
    createdAt: state.createdAt,
    activeSetId: state.activeSetId || "me5",
    economyScale: state.economyScale ?? ECONOMY_SCALE,
    settingsRev: state.settingsRev || SETTINGS_REV,
    granted: state.granted,
    worthLog: Array.isArray(state.worthLog) ? state.worthLog.slice(-WORTH_LOG_LIMIT) : [],
    binder: Array.isArray(state.binder) ? state.binder.slice() : [],
  };
}

export function emptySave() {
  return blank();
}

export { STARTING_COINS, DAILY_BONUS, DAILY_COOLDOWN_MS };
