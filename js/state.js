const KEY = "poke-pack-rip-v3";
const LEGACY_KEYS = ["poke-pack-rip-v2", "poke-pack-rip-v1"];
const STARTING_COINS = 750;
const DAILY_BONUS = 15000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SETTINGS = {
  shine: true,
  tilt: true,
  stamps: true,
  motion: true,
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
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Merge settings separately so saves from before a new toggle existed
      // still pick up its default instead of dropping it.
      return {
        ...blank(),
        ...saved,
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
        activeSetId: saved.activeSetId || "me5",
        reverses: saved.reverses || {},
      };
    }
    for (const legacyKey of LEGACY_KEYS) {
      const legacy = localStorage.getItem(legacyKey);
      if (!legacy) continue;
      const old = JSON.parse(legacy);
      return {
        ...blank(),
        coins: old.coins ?? STARTING_COINS,
        lastDaily: old.lastDaily ?? null,
        packTrick: Boolean(old.packTrick),
      };
    }
  } catch {
    /* start fresh */
  }
  return blank();
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
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
  state.coins += DAILY_BONUS;
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

export function resetProgress(state) {
  const keep = { ...state.settings };
  const setId = state.activeSetId;
  Object.assign(state, blank(), { settings: keep, activeSetId: setId });
  saveState(state);
}

/**
 * Sell a spare copy. Reverse prints are sold off first so `state.reverses`
 * stays in step with what is actually left in the binder — otherwise a card
 * keeps rendering as a reverse long after that print was sold.
 */
export function sellOne(state, id, value) {
  if ((state.collection[id] || 0) < 2) return false;
  state.collection[id] -= 1;
  if (state.reverses?.[id] > 0) {
    state.reverses[id] -= 1;
    if (state.reverses[id] <= 0) delete state.reverses[id];
  }
  state.coins += value;
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
  });
  saveState(state);
  return true;
}

export { STARTING_COINS, DAILY_BONUS, DAILY_COOLDOWN_MS };
