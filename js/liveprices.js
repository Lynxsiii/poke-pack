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
  sv2: "sv02",
  sv3: "sv03",
  sv3pt5: "sv03.5",
  sv4: "sv04",
  sv4pt5: "sv04.5",
  sv5: "sv05",
  sv6: "sv06",
  sv7: "sv07",
  sv8: "sv08",
  sv8pt5: "sv08.5",
  sv9: "sv09",
  sv10: "sv10",
  sv1: "sv01",
  sv6pt5: "sv06.5",
  // Sword & Shield: TCGdex keeps the era's ids; TG01-style numbers pass through.
  swsh1: "swsh1", swsh2: "swsh2", swsh3: "swsh3", swsh35: "swsh3.5", swsh4: "swsh4", swsh45: "swsh4.5",
  swsh5: "swsh5", swsh6: "swsh6", swsh7: "swsh7", cel25: "cel25", swsh8: "swsh8", swsh9: "swsh9",
  swsh10: "swsh10", pgo: "pgo", swsh11: "swsh11", swsh12: "swsh12", swsh12pt5: "swsh12.5",
  // Sun & Moon: TCGdex's ids (the half sets use a dot; Shiny Vault rides Hidden Fates).
  sm1: "sm1", sm2: "sm2", sm3: "sm3", sm35: "sm3.5", sm4: "sm4", sm5: "sm5", sm6: "sm6", sm7: "sm7", sm75: "sm7.5",
  sm8: "sm8", sm9: "sm9", det1: "det1", sm10: "sm10", sm11: "sm11", sm115: "sm11.5", sm12: "sm12", smp: "smp",
  // XY: TCGdex keeps the era's ids (checked 2026-10-01: /v2/en/series/xy lists xyp, xy0, xy1 to xy12, dc1, g1).
  xy0: "xy0", xy1: "xy1", xy2: "xy2", xy3: "xy3", xy4: "xy4", xy5: "xy5", dc1: "dc1", xy6: "xy6", xy7: "xy7",
  xy8: "xy8", xy9: "xy9", g1: "g1", xy10: "xy10", xy11: "xy11", xy12: "xy12", xyp: "xyp",
  // Black & White: TCGdex keeps the era's ids (checked 2026-10-01: /v2/en/series/bw lists bw1 to bw11, dv1, bwp;
  // Legendary Treasures' Radiant Collection is inside bw11 as bw11-RC1 to RC25).
  bw1: "bw1", bw2: "bw2", bw3: "bw3", bw4: "bw4", bw5: "bw5", bw6: "bw6", dv1: "dv1", bw7: "bw7", bw8: "bw8",
  bw9: "bw9", bw10: "bw10", bw11: "bw11", bwp: "bwp",
  // Diamond & Pearl generation: TCGdex keeps the era's ids (checked 2026-10-01: /v2/en/series/dp, pl, hgss, col, pop; the
  // HGSS Black Star Promos are "hgssp", the Trainer Kits "tk-dp-m", "tk-dp-l", "tk-hs-g", "tk-hs-r" and are not mapped here).
  dp1: "dp1", dp2: "dp2", dp3: "dp3", dp4: "dp4", dp5: "dp5", dp6: "dp6", dp7: "dp7", dpp: "dpp",
  pl1: "pl1", pl2: "pl2", pl3: "pl3", pl4: "pl4",
  hgss1: "hgss1", hgss2: "hgss2", hgss3: "hgss3", hgss4: "hgss4", hsp: "hgssp", col1: "col1",
  pop6: "pop6", pop7: "pop7", pop8: "pop8", pop9: "pop9",
  // EX generation: TCGdex keeps the era's ids, unpadded (checked 2026-10-01: /v2/en/series/ex and /series/pop; "ex1-1" is a card, "ex1-001"
  // a 404; the Nintendo promos are "np-1", unpadded and without a prefix, listed under the POP series; the Trainer Kits are
  // "tk-ex-latia", "tk-ex-latio", "tk-ex-p" (Plusle) and "tk-ex-m" (Minun), cards "tk-ex-latia-4"; Unseen Forces' Unown A-Z, ! and ?
  // are NOT on TCGdex: ex10 stops at 117, so those 28 stay on the site's own prices).
  ex1: "ex1", ex2: "ex2", ex3: "ex3", ex4: "ex4", ex5: "ex5", ex6: "ex6", ex7: "ex7", ex8: "ex8", ex9: "ex9", ex10: "ex10",
  ex11: "ex11", ex12: "ex12", ex13: "ex13", ex14: "ex14", ex15: "ex15", ex16: "ex16", np: "np",
  pop1: "pop1", pop2: "pop2", pop3: "pop3", pop4: "pop4", pop5: "pop5",
  extk1a: "tk-ex-latia", extk1b: "tk-ex-latio", extk2a: "tk-ex-p", extk2b: "tk-ex-m",
};

/**
 * TCGdex zero-pads only the Scarlet & Violet, Mega Evolution and Crown Zenith ids ("sv01-001", "me01-001", "swsh12.5-001").
 * Every older set is unpadded as printed: "swsh1-1", "cel25-1", "sm1-1", "sm3.5-1", "det1-1", "xy1-1", "g1-1", "dc1-1", "bw1-1",
 * "bw11-RC1", "dv1-1", "dp1-1", "hgss1-ONE", "dp7-SH1", "dpp-DP01", "hgssp-HGSS01" (probed 2026-10-01; "sm1-001" and "xy5-001"
 * are 404s). tcgdexId() pads by prefix.
 */
const TCGDEX_PADDED = /^(?:sv|me|swsh12\.5)/;

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

export function tcgdexId(setId, number) {
  const prefix = TCGDEX_SET[setId];
  if (!prefix) return "";
  const n = String(number).replace(/^0+/, "") || "0";
  if (TCGDEX_PADDED.test(prefix)) return `${prefix}-${n.padStart(3, "0")}`;
  // A promo's number is "dpp01" on the site and "DP01" on TCGdex; a subset's is "SH1", "RT1", "AR1", "SL1"; Alph's is "ONE".
  // The Nintendo promos' number is "np012" on the site and "12" on TCGdex ("np-12").
  if (/^np\d/i.test(String(number))) return `${prefix}-${String(number).replace(/^np0*/i, "")}`;
  return `${prefix}-${/^(?:dpp|hsp)\d/i.test(String(number)) ? String(number).replace(/^dpp/i, "DP").replace(/^hsp/i, "HGSS") : String(number)}`;
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
  // Promos (numbered "mep082") live in TCGdex's promo set, not this one, so
  // asking for them under the set only ever 404s. They keep their baked
  // market price. So do set Energy cards (Shrouded Fable's reverse holo
  // Energy), which have no collector number in the set.
  const numbers = (cards || []).filter((c) => !c.promo && !c.energy).map((c) => c.number).filter((n) => n != null);
  // A promo set (SV Black Star Promos) has nothing else, so nothing to ask for.
  if (!numbers.length) throw new Error("no singles");
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
