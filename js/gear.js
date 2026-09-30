/**
 * Sleeves and coins: the cosmetics that come in sealed products.
 *
 * This module is shared by the page and the Worker, so it holds only data
 * rules, no DOM. The catalog is data/gear.json (built by scripts/build_gear.py
 * from the research in the project's sleeves-coins folder):
 *
 *   sleeves  { id: { id, name, sets, subject, count, art, tint, blurb } }
 *   coins    { id: { id, name, sets, subject, material, front, back, tint, blurb } }
 *   products { "<setId>/<productId>": { sleeves: [id], coins: [id], pick?: { coins: n } } }
 *
 * A player's holdings travel inside their save as `save.gear`:
 *
 *   { sleeves: { id: qty }, coins: { id: qty }, guards: { id: qty }, equipped: { sleeve: id|null, coin: id|null },
 *     recent: [{ kind, id, at }] }
 *
 * `guards` are the slab bumpers of RIP Grading (js/grading-rules.js GUARDS),
 * bought with coins and worn per slab, so they never appear in `equipped`.
 *
 * What other features read:
 *   equippedCoin(gear, catalog)   the coin a coinflip should draw (falls back to the house coin)
 *   equippedSleeve(gear, catalog) the sleeve that replaces the card back
 *   grantGear(env, userId, items) (worker/gear.js) hands items out, e.g. as an achievement reward
 */

export const GEAR_KINDS = ["sleeve", "coin"];

export const HOUSE_COIN = {
  id: "house",
  name: "House coin",
  subject: "Poké Ball",
  material: "metal",
  front: "",
  back: "",
  tint: "#c9a24a",
  house: true,
};

export function gearKey(setId, productId) {
  return `${setId}/${productId}`;
}

function table(catalog, kind) {
  return (kind === "sleeve" ? catalog?.sleeves : catalog?.coins) || {};
}

export function gearItem(catalog, kind, id) {
  if (!id) return null;
  const hit = table(catalog, kind)[String(id)];
  if (hit) return hit;
  return kind === "coin" && id === HOUSE_COIN.id ? HOUSE_COIN : null;
}

/** What one copy of a product holds, or null when it holds no sleeve or coin. */
export function productGear(catalog, setId, productId) {
  const row = catalog?.products?.[gearKey(setId, productId)];
  if (!row) return null;
  const sleeves = (row.sleeves || []).filter((id) => catalog.sleeves?.[id]);
  const coins = (row.coins || []).filter((id) => catalog.coins?.[id]);
  if (!sleeves.length && !coins.length) return null;
  return { sleeves, coins, pick: row.pick || {} };
}

/**
 * The items one opened copy of a product hands out. A row lists every design it
 * can hold; `pick.coins = 1` of 3 coins means one of the three at random, the
 * way a blister holds one coin of its set's designs.
 */
export function rollGear(entry, rand = Math.random) {
  if (!entry) return [];
  const out = [];
  for (const kind of GEAR_KINDS) {
    const ids = kind === "sleeve" ? entry.sleeves : entry.coins;
    const pick = Math.floor(Number(entry.pick?.[kind === "sleeve" ? "sleeves" : "coins"]) || 0);
    if (!ids?.length) continue;
    if (pick > 0 && pick < ids.length) {
      const pool = ids.slice();
      for (let i = 0; i < pick; i += 1) {
        out.push({ kind, id: pool.splice(Math.floor(rand() * pool.length), 1)[0] });
      }
    } else {
      for (const id of ids) out.push({ kind, id });
    }
  }
  return out;
}

export function emptyGear() {
  return { sleeves: {}, coins: {}, guards: {}, equipped: { sleeve: null, coin: null }, recent: [] };
}

/** A save's gear block, always complete, so callers never branch on its absence. */
export function normalizeGear(raw) {
  const gear = emptyGear();
  if (!raw || typeof raw !== "object") return gear;
  for (const kind of GEAR_KINDS) {
    const key = kind === "sleeve" ? "sleeves" : "coins";
    for (const [id, qty] of Object.entries(raw[key] || {})) {
      const n = Math.floor(Number(qty) || 0);
      if (n > 0) gear[key][id] = n;
    }
  }
  for (const [id, qty] of Object.entries(raw.guards || {})) {
    const n = Math.floor(Number(qty) || 0);
    if (n > 0) gear.guards[id] = n;
  }
  gear.equipped.sleeve = raw.equipped?.sleeve || null;
  gear.equipped.coin = raw.equipped?.coin || null;
  gear.recent = Array.isArray(raw.recent) ? raw.recent.slice(0, 12) : [];
  return gear;
}

export function ownedItems(gear, catalog, kind) {
  const key = kind === "sleeve" ? "sleeves" : "coins";
  const at = new Map((gear?.recent || []).filter((r) => r.kind === kind).map((r) => [r.id, r.at]));
  return Object.entries(gear?.[key] || {})
    .map(([id, qty]) => ({ item: gearItem(catalog, kind, id), qty, at: at.get(id) || 0 }))
    .filter((row) => row.item && row.qty > 0);
}

export function equippedSleeve(gear, catalog) {
  const id = gear?.equipped?.sleeve;
  return id && (gear.sleeves?.[id] || 0) > 0 ? gearItem(catalog, "sleeve", id) : null;
}

/** The coin a coinflip draws: the equipped one, else the house coin. */
export function equippedCoin(gear, catalog) {
  const id = gear?.equipped?.coin;
  const coin = id && (gear.coins?.[id] || 0) > 0 ? gearItem(catalog, "coin", id) : null;
  return coin || HOUSE_COIN;
}
