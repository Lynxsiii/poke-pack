/* Binder lock: a card sitting in a binder pocket can't leave the account
   (sold, staked in the casino, traded away) until the player takes it out of
   the binder. The lock is the binder itself, so every card already in a
   binder is locked the moment this ships and nothing is stored twice.

   A pocket holds one copy of a card id. The copies that may fill it are the
   raw copies (cards.qty) plus the player's active slabs of that card that are
   not staked (graded_cards status 'slabbed', locked IS NULL). So with three
   copies and one pocket, two can go; with one copy and one pocket, none can.
   Grading a pocketed card is fine (the slab keeps the pocket filled), and so
   is cracking a pocketed slab (the raw copy comes back).

   Two layers:
   - The Worker checks first (freeRaw / freeSlabs below) so each page can say
     what's locked in words.
   - Two SQLite triggers refuse any write that would leave fewer copies than
     pockets, with RAISE(ABORT, 'binder-locked'). They are the backstop for
     races and for every path that moves cards inside other triggers (casino
     escrow, trades, sell-all winnings), and for any path added later.
   Applied once per isolate (no session can run remote migrations); every
   statement is IF NOT EXISTS, purely additive. Migration 0043 holds the same. */

export const BINDER_LOCKED = 'binder-locked';
export const LOCKED_MESSAGE = "That card is locked in your binder. Take it out of the binder first.";

/** Pockets in `user`'s binder holding `card`, as SQL. A broken binder value counts as empty. */
const pockets = (user, card) => `(SELECT COUNT(*) FROM profiles p, json_each(CASE WHEN json_valid(p.binder) THEN p.binder ELSE '[]' END) s
      WHERE p.user_id = ${user} AND s.type = 'object' AND json_extract(s.value, '$.id') = ${card})`;

export const BINDER_LOCK_DDL = [
  `CREATE TRIGGER IF NOT EXISTS binder_lock_cards BEFORE UPDATE OF qty ON cards
WHEN NEW.qty < OLD.qty
  AND NEW.qty + (SELECT COUNT(*) FROM graded_cards g WHERE g.user_id = OLD.user_id AND g.card_id = OLD.card_id AND g.status = 'slabbed' AND g.locked IS NULL)
    < ${pockets('OLD.user_id', 'OLD.card_id')}
BEGIN
  SELECT RAISE(ABORT, '${BINDER_LOCKED}');
END`,
  `CREATE TRIGGER IF NOT EXISTS binder_lock_slabs BEFORE UPDATE ON graded_cards
WHEN OLD.status = 'slabbed' AND OLD.locked IS NULL
  AND (NEW.status NOT IN ('slabbed', 'cracked') OR NEW.locked IS NOT NULL OR NEW.user_id IS NOT OLD.user_id OR NEW.card_id IS NOT OLD.card_id)
  AND COALESCE((SELECT qty FROM cards c WHERE c.user_id = OLD.user_id AND c.card_id = OLD.card_id), 0)
    + (SELECT COUNT(*) FROM graded_cards g WHERE g.user_id = OLD.user_id AND g.card_id = OLD.card_id AND g.status = 'slabbed' AND g.locked IS NULL AND g.id != OLD.id)
    < ${pockets('OLD.user_id', 'OLD.card_id')}
BEGIN
  SELECT RAISE(ABORT, '${BINDER_LOCKED}');
END`,
];

let ready = false;
let work = null;

export function resetBinderLockCache() { ready = false; work = null; }

/** Install the triggers once per isolate. Needs cards, profiles and graded_cards to exist (ensureGradingSchema first). */
export async function ensureBinderLock(env, ensureGradingSchema) {
  if (ready) return;
  if (!work) {
    work = (async () => {
      try {
        if (ensureGradingSchema) await ensureGradingSchema(env);
        for (const sql of BINDER_LOCK_DDL) await env.DB.exec(`${sql.replace(/\s+/g, ' ').trim()};`);
        ready = true;
      } finally {
        work = null;
      }
    })();
  }
  await work;
}

export const isBinderLocked = (err) => String(err?.message || err || '').includes(BINDER_LOCKED);

/** Pockets per card id in a stored binder value (JSON text or a list). */
export function pocketCounts(binder) {
  let list = binder;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
  const held = {};
  for (const slot of Array.isArray(list) ? list : []) {
    const id = slot && typeof slot === 'object' ? String(slot.id || '') : '';
    if (id) held[id] = (held[id] || 0) + 1;
  }
  return held;
}

/**
 * What the binder holds back for `userId`: { held, slabs, raw } per card id, and
 * freeRaw(id) / freeSlabs(id): how many raw copies and active slabs of a card may leave.
 * `collection` is the raw map from inventoryMap when the caller already has it.
 */
export async function binderLocks(env, userId, collection = null) {
  const profile = await env.DB.prepare('SELECT binder FROM profiles WHERE user_id = ?').bind(userId).first();
  const held = pocketCounts(profile?.binder);
  const ids = Object.keys(held);
  const slabs = {};
  const raw = {};
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    const slabRows = (await env.DB.prepare(
      `SELECT card_id AS id, COUNT(*) AS n FROM graded_cards WHERE user_id = ? AND status = 'slabbed' AND locked IS NULL AND card_id IN (${marks}) GROUP BY card_id`
    ).bind(userId, ...ids).all().catch((err) => { if (/no such table/i.test(String(err?.message || err))) return { results: [] }; throw err; })).results || [];
    for (const row of slabRows) slabs[row.id] = Number(row.n) || 0;
    if (collection) {
      for (const id of ids) raw[id] = collection[id] || 0;
    } else {
      const rows = (await env.DB.prepare(`SELECT card_id AS id, qty FROM cards WHERE user_id = ? AND card_id IN (${marks})`).bind(userId, ...ids).all()).results || [];
      for (const row of rows) raw[row.id] = Number(row.qty) || 0;
    }
  }
  const need = (id) => held[id] || 0;
  return {
    held,
    slabs,
    raw,
    /** Raw copies that may leave, out of `have` (default: what the account holds). */
    freeRaw(id, have = null) {
      if (!need(id)) return have ?? Infinity; // nothing pocketed: no limit from the binder
      const n = have ?? raw[id] ?? 0;
      return Math.max(0, n - Math.max(0, need(id) - (slabs[id] || 0)));
    },
    /** Active slabs of a card that may leave, with `rawLeft` raw copies staying (default: all of them). */
    freeSlabs(id, rawLeft = null) {
      const n = slabs[id] || 0;
      if (!need(id)) return Infinity;
      return Math.max(0, n - Math.max(0, need(id) - Math.max(0, rawLeft ?? raw[id] ?? 0)));
    },
    locked: (id) => need(id) > 0,
  };
}

/**
 * A player's holdings with the binder's copies taken out: what another page may offer to move.
 * Raw copies go first to the pockets slabs don't fill; reverse counts are clamped to what's left;
 * `slabs` (each with cardId) keeps only as many of a card as freeSlabs allows, in list order.
 */
export function withoutPocketed(locks, collection = {}, reverses = {}, slabs = []) {
  const cards = {};
  const revs = {};
  for (const [id, n] of Object.entries(collection || {})) {
    const free = Math.min(n, locks.freeRaw(id, n));
    if (free > 0) cards[id] = free;
    if (free > 0 && reverses?.[id] > 0) revs[id] = Math.min(free, reverses[id]);
  }
  const kept = {};
  const freeSlabs = slabs.filter((slab) => {
    const id = slab.cardId;
    kept[id] = (kept[id] || 0) + 1;
    return kept[id] <= locks.freeSlabs(id);
  });
  return { collection: cards, reverses: revs, slabs: freeSlabs };
}
