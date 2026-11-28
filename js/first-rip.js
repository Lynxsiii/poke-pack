/**
 * The visitor's free first pack, on this browser (js/first-rip-rules.js).
 *
 * The Worker rolled it and keeps the real copy (worker/first-rip.js); this is
 * only what the page needs to show it again and to name it at signup. A pack
 * the visitor has seen all of is "seen": the key on Home then keeps it rather
 * than opening it again.
 */

const KEY = "pokepack.firstrip";

let cache;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw.id !== "string" || !Array.isArray(raw.cards) || !raw.cards.length) return null;
    if (Number(raw.keptUntil) && Number(raw.keptUntil) < Date.now()) return null;
    return raw;
  } catch {
    return null;
  }
}

function write(pack) {
  cache = pack;
  try {
    if (pack) localStorage.setItem(KEY, JSON.stringify(pack));
    else localStorage.removeItem(KEY);
  } catch {
    /* no storage: the pack lasts for this visit */
  }
}

/** The pack waiting on this browser, or null. */
export function keptPack() {
  if (cache === undefined) cache = read();
  if (cache && Number(cache.keptUntil) && Number(cache.keptUntil) < Date.now()) write(null);
  return cache || null;
}

/** Keep what the Worker answered: `{ id, setId, wrapperId, keptUntil, cards }`. */
export function keepPack(pack) {
  write({ id: pack.id, setId: pack.setId, wrapperId: pack.wrapperId, keptUntil: pack.keptUntil, cards: pack.cards, seen: false });
  return cache;
}

/** Every card has been turned over. */
export function markPackSeen() {
  const pack = keptPack();
  if (pack && !pack.seen) write({ ...pack, seen: true });
}

/** It is on an account now, or it is gone. */
export function dropPack() {
  write(null);
}
