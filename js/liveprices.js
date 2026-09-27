/**
 * Live market prices, same job as scripts/fetch_prices.py, running in the
 * browser every 5 minutes.
 *
 * pkmn.gg and pittpokeresearch.com are what the Python script reads, but
 * neither allows poke-pack.rip to fetch them (CORS). TCGplayer numbers still
 * come through TCGdex (and pokemontcg.io when it is up), matched by collector
 * number + name so a numbering drift cannot silently reprice the binder.
 *
 * Failures stay silent: baked `market` values from data/<set>.json remain.
 */

import { money } from "./catalog.js";
import { noteLivePrice } from "./pricechart.js";

export const PRICE_INTERVAL_MS = 5 * 60 * 1000;
const CACHE_KEY = "poke-pack-prices-v1";
const LOCK_KEY = "poke-pack-prices-lock";
const TCGDEX_SET = {
  me1: "me01",
  me2: "me02",
  me2pt5: "me02.5",
  me3: "me03",
  me4: "me04",
  me5: "me05",
  sv4: "sv04",
};

/** pokemontcg.io is flaky on new sets; one 5xx and we stop asking for this session. */
let ptcgioOk = true;

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!raw || typeof raw !== "object") return { sets: {} };
    return { sets: raw.sets && typeof raw.sets === "object" ? raw.sets : {} };
  } catch {
    return { sets: {} };
  }
}

function unwrapPriced(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.priced && typeof entry.priced === "object") return entry.priced;
  if ("fetchedAt" in entry) return null;
  return entry;
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota / private mode */
  }
}

function takeLock() {
  try {
    const now = Date.now();
    const held = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (held && now - held < 90_000) return false;
    localStorage.setItem(LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

function dropLock() {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = null;
      }
    }
  }
  const n = Math.min(limit, items.length) || 0;
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

function pickUsd(pricing) {
  const t = pricing?.tcgplayer;
  if (!t || typeof t !== "object") return null;
  const order = ["holofoil", "holo", "normal", "unlimited", "1st-edition", "1stEdition"];
  for (const key of order) {
    const n = t[key]?.marketPrice;
    if (typeof n === "number" && n > 0) return money(n);
  }
  for (const [key, val] of Object.entries(t)) {
    if (key === "unit" || key === "updated" || /reverse/i.test(key)) continue;
    const n = val?.marketPrice;
    if (typeof n === "number" && n > 0) return money(n);
  }
  return null;
}

function pickPtcgio(card) {
  const prices = card?.tcgplayer?.prices;
  if (!prices || typeof prices !== "object") return null;
  const order = ["holofoil", "normal", "unlimitedHolofoil", "1stEditionHolofoil"];
  for (const key of order) {
    const n = prices[key]?.market;
    if (typeof n === "number" && n > 0) return money(n);
  }
  return null;
}

function numKey(value) {
  const n = Number(String(value).replace(/^#/, ""));
  return Number.isFinite(n) ? String(n) : String(value);
}

function namesMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function tcgdexId(setId, number) {
  const prefix = TCGDEX_SET[setId];
  if (!prefix) return "";
  const n = String(number).replace(/^0+/, "") || "0";
  return `${prefix}-${n.padStart(3, "0")}`;
}

async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function singlesFromPtcgio(setId) {
  const out = {};
  let page = 1;
  let total = Infinity;
  while ((page - 1) * 250 < total) {
    const url = `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(
      setId
    )}&pageSize=250&page=${page}`;
    const data = await fetchJson(url, 8000);
    const rows = Array.isArray(data?.data) ? data.data : [];
    total = Number(data?.totalCount) || rows.length;
    if (!rows.length) break;
    for (const card of rows) {
      const price = pickPtcgio(card);
      if (price == null) continue;
      out[numKey(card.number)] = { price, name: card.name || "" };
    }
    page += 1;
    if (page > 8) break;
  }
  if (!Object.keys(out).length) throw new Error("empty");
  return out;
}

async function singlesFromTcgdex(setId, numbers) {
  if (!TCGDEX_SET[setId]) throw new Error("unknown set");
  const ids = (numbers.length ? numbers : []).map((n) => tcgdexId(setId, n)).filter(Boolean);
  if (!ids.length) {
    const listed = await fetchJson(`https://api.tcgdex.net/v2/en/cards?set=${encodeURIComponent(TCGDEX_SET[setId])}`);
    if (!Array.isArray(listed)) throw new Error("empty");
    ids.push(...listed.map((c) => c.id).filter(Boolean));
  }
  const out = {};
  const rows = await mapPool(ids, 5, (id) => fetchJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`));
  for (const card of rows) {
    if (!card) continue;
    const price = pickUsd(card.pricing);
    if (price == null) continue;
    out[numKey(card.localId)] = { price, name: card.name || "" };
  }
  if (!Object.keys(out).length) throw new Error("empty");
  return out;
}

async function singlesForSet(setId, cards) {
  const numbers = (cards || []).map((c) => c.number).filter((n) => n != null);
  if (ptcgioOk) {
    try {
      return await singlesFromPtcgio(setId);
    } catch (err) {
      if (String(err?.message) !== "empty") ptcgioOk = false;
    }
  }
  return singlesFromTcgdex(setId, numbers);
}

/**
 * Apply a number -> {price, name} map onto a card list. Returns how many
 * cards got a new market value, or 0 if names drifted and we refused.
 */
export function applySingles(cards, priced) {
  if (!Array.isArray(cards) || !priced) return 0;
  let hit = 0;
  const day = todayStamp();
  for (const card of cards) {
    const entry = priced[numKey(card.number)];
    if (!entry || !(entry.price > 0) || !namesMatch(card.name, entry.name)) continue;
    card.market = entry.price;
    noteLivePrice(card.id, entry.price, day);
    hit += 1;
  }
  return hit;
}

export function applyCachedPrices(cards, setId) {
  const priced = unwrapPriced(readCache().sets[setId]);
  if (!priced) return 0;
  return applySingles(cards, priced);
}

async function refreshOne(setId, cards) {
  const priced = await singlesForSet(setId, cards);
  const cache = readCache();
  cache.sets[setId] = { fetchedAt: Date.now(), priced };
  writeCache(cache);
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  return applySingles(cards, priced);
}

export function startLivePrices(hooks) {
  let timer = 0;
  let running = false;
  let queued = false;

  async function tick(force = false) {
    if (running) {
      queued = true;
      return;
    }
    if (document.hidden && !force) return;
    const sets = (hooks.sets?.() || []).filter((set) => set.cards?.length);
    const active = hooks.activeId?.();
    const ordered = [...sets].sort((a, b) => (a.id === active ? -1 : b.id === active ? 1 : 0));
    const stale = ordered.filter((set) => {
      const at = Number(readCache().sets[set.id]?.fetchedAt) || 0;
      return force || Date.now() - at >= PRICE_INTERVAL_MS - 5000;
    });
    if (!stale.length) {
      let any = 0;
      for (const set of ordered) any += applyCachedPrices(set.cards, set.id);
      if (any) hooks.onUpdate?.();
      return;
    }
    if (!takeLock()) {
      for (const set of ordered) applyCachedPrices(set.cards, set.id);
      hooks.onUpdate?.();
      return;
    }
    running = true;
    try {
      await hooks.refreshSealed?.();
      for (const set of stale) {
        try {
          await refreshOne(set.id, set.cards);
        } catch {
          applyCachedPrices(set.cards, set.id);
        }
        if (set.id === active) hooks.onUpdate?.();
      }
      hooks.onUpdate?.();
    } finally {
      running = false;
      dropLock();
      if (queued) {
        queued = false;
        tick(false);
      }
    }
  }

  const sets = hooks.sets?.() || [];
  for (const set of sets) applyCachedPrices(set.cards, set.id);

  timer = window.setInterval(() => tick(false), PRICE_INTERVAL_MS);
  const kick = () => window.setTimeout(() => tick(false), 400);
  if (document.readyState === "complete") kick();
  else window.addEventListener("load", kick, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick(false);
  });
  return { tick: () => tick(false), stop: () => clearInterval(timer) };
}
