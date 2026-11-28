/**
 * The free first pack (js/first-rip-rules.js).
 *
 * POST /api/packs/first
 *   Signed out: rolls one pack with the set's real odds and keeps it in
 *   first_rips, unowned. The same network gets the same pack back for a day,
 *   so reloading is not a reroll. Nothing about the visitor is stored but a
 *   hash of the address, which is dropped when the pack is claimed or expires.
 *   Signed in: an account made since the free pack began, that has not had
 *   one, opens its first pack at no cost.
 *
 * Signup names a kept pack (`firstRip`) and claimFirstRip puts it on the new
 * account. The partial unique index on user_id is the rule: one row can ever
 * belong to an account, so one free pack per account whichever way it came.
 *
 * The table is made on demand; worker/terms.js PERSONAL_TABLES deletes an
 * account's row with the account.
 */

import { PLAYABLE_SETS } from "../js/catalog.js";
import { ripPack } from "../js/engine.js";
import { FIRST_RIP_KEEP_MS, FIRST_RIP_SINCE, firstRipOk } from "../js/first-rip-rules.js";
import { ensureSecuritySchema, hit, sha256 } from "./security.js";

const DDL = [
  `CREATE TABLE IF NOT EXISTS first_rips (
    id TEXT PRIMARY KEY,
    ip_key TEXT,
    set_id TEXT NOT NULL,
    wrapper_id TEXT NOT NULL,
    cards TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    user_id TEXT,
    claimed_at INTEGER
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS first_rips_user ON first_rips (user_id) WHERE user_id IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS first_rips_ip ON first_rips (ip_key, created_at)",
];

const DAY = 24 * 60 * 60 * 1000;
// New rolls one network can ask for in a day. A household is a few; a script is many.
const ROLLS_PER_DAY = 6;

let ready = false;
async function ensureTable(env) {
  if (ready) return;
  for (const sql of DDL) await env.DB.prepare(sql.replace(/\s+/g, " ")).run();
  ready = true;
}

function newId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clientIp = (request) =>
  request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";

/** What a row stores of a pack: enough to deal the same cards again. */
const slim = (pulls) => pulls.map((card) => ({ id: card.id, reverse: Boolean(card.reverse), ...(card.reverseKind ? { reverseKind: card.reverseKind } : {}) }));

/** The stored pack as full cards, or null if the set has changed under it. */
function dealAgain(stored, catalog) {
  const byId = new Map(catalog.map((card) => [card.id, card]));
  const out = [];
  for (const entry of stored) {
    const card = byId.get(entry.id);
    if (!card) return null;
    out.push({ ...card, reverse: Boolean(entry.reverse), ...(entry.reverseKind ? { reverseKind: entry.reverseKind } : {}) });
  }
  return out;
}

function parseCards(text) {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Has this account a free first pack still to open? */
export async function firstRipOpen(env, user) {
  if (!user || Number(user.created_at) < FIRST_RIP_SINCE) return false;
  try {
    await ensureTable(env);
    return !(await env.DB.prepare("SELECT id FROM first_rips WHERE user_id = ?").bind(user.id).first());
  } catch {
    return false;
  }
}

async function eligibleSet(env, request, setId, deps) {
  const live = PLAYABLE_SETS.find((item) => item.id === String(setId || ""));
  if (!live) return { error: "Unknown set." };
  const cost = await deps.packCost(env, request, live);
  if (!firstRipOk(live, cost)) return { error: "That pack isn't one of the free ones. Pick a newer set." };
  return { live, cost };
}

/** POST /api/packs/first */
export async function handleFirstRip(request, env, deps) {
  const { json, readJson, requireUser, loadSetCards, openPacks } = deps;
  const body = (await readJson(request)) || {};
  await ensureTable(env);
  const auth = await requireUser(request, env);

  if (!auth.response) {
    // An account's own free pack: taken and opened in one go.
    const user = auth.user;
    if (Number(user.created_at) < FIRST_RIP_SINCE) return json({ error: "Your first pack is already behind you." }, 400);
    const picked = await eligibleSet(env, request, body.setId, deps);
    if (picked.error) return json({ error: picked.error }, 400);
    const { live } = picked;
    const wrapper = live.wrappers.find((item) => item.id === body.wrapperId) || live.wrappers[0];
    // Rolled from the player's seed pair like any pack they open (worker/fair.js).
    const catalog = await loadSetCards(env, request, live);
    const fair = await deps.takeRoll(env, user.id);
    const pulls = deps.withRandom(fair.stream.unit, () => ripPack(live, catalog));
    const fairLog = fair.log("packs", null, { setId: live.id, product: "pack" }, { draws: fair.stream.used(), cards: pulls.map((card) => card.id) });
    const id = newId();
    const now = Date.now();
    try {
      await env.DB.prepare(
        "INSERT INTO first_rips (id, ip_key, set_id, wrapper_id, cards, created_at, user_id, claimed_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)"
      )
        .bind(id, live.id, wrapper.id, JSON.stringify(slim(pulls)), now, user.id, now)
        .run();
    } catch (err) {
      if (String(err?.message || "").includes("UNIQUE")) return json({ error: "You've had your free pack." }, 409);
      throw err;
    }
    let opened;
    try {
      opened = await openPacks(env, user.id, live, [{ wrapper, pulls }], 0, [], [], { extraStmts: [fairLog] });
    } catch (err) {
      await env.DB.prepare("DELETE FROM first_rips WHERE id = ?").bind(id).run();
      throw err;
    }
    if (opened.response) {
      await env.DB.prepare("DELETE FROM first_rips WHERE id = ?").bind(id).run();
      return opened.response;
    }
    return json({ save: opened.save, cards: opened.packs[0].cards, cost: 0, free: true, setId: live.id, wrapperId: wrapper.id });
  }

  // A visitor. The pack already kept for this network comes back as it was.
  const now = Date.now();
  const ipKey = await sha256(`first-rip:${clientIp(request)}`);
  const kept = await env.DB.prepare(
    "SELECT * FROM first_rips WHERE ip_key = ? AND user_id IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1"
  )
    .bind(ipKey, now - DAY)
    .first();
  if (kept) {
    const set = PLAYABLE_SETS.find((item) => item.id === kept.set_id);
    const cards = set ? dealAgain(parseCards(kept.cards), await loadSetCards(env, request, set)) : null;
    if (cards) return json(guestPack(kept.id, kept.set_id, kept.wrapper_id, cards, kept.created_at));
    await env.DB.prepare("DELETE FROM first_rips WHERE id = ?").bind(kept.id).run();
  }

  const picked = await eligibleSet(env, request, body.setId, deps);
  if (picked.error) return json({ error: picked.error }, 400);
  if ((await ensureSecuritySchema(env)) && !(await hit(env, `firstrip:${ipKey}`, ROLLS_PER_DAY, DAY))) {
    return json({ error: "Make a trainer to keep ripping.", needAccount: true }, 429);
  }
  const { live } = picked;
  const wrapper = live.wrappers.find((item) => item.id === body.wrapperId) || live.wrappers[0];
  const pulls = ripPack(live, await loadSetCards(env, request, live));
  const id = newId();
  await env.DB.batch([
    // Packs nobody came back for.
    env.DB.prepare("DELETE FROM first_rips WHERE user_id IS NULL AND created_at < ?").bind(now - FIRST_RIP_KEEP_MS),
    env.DB.prepare(
      "INSERT INTO first_rips (id, ip_key, set_id, wrapper_id, cards, created_at, user_id, claimed_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)"
    ).bind(id, ipKey, live.id, wrapper.id, JSON.stringify(slim(pulls)), now),
  ]);
  return json(guestPack(id, live.id, wrapper.id, pulls, now));
}

/** A visitor owns nothing yet, so every card in the pack is new to them. */
function guestPack(id, setId, wrapperId, cards, at) {
  return {
    guest: true,
    id,
    setId,
    wrapperId,
    keptUntil: Number(at) + FIRST_RIP_KEEP_MS,
    cards: cards.map((card) => ({ ...card, reverse: Boolean(card.reverse), wasNew: true })),
  };
}

/**
 * Signup: put the pack a visitor ripped onto the account they just made.
 * Answers how many cards went on, or 0 when the pack was gone (spent, expired
 * or never there), in which case the account still has its own free pack.
 */
export async function claimFirstRip(env, request, userId, rawId, deps) {
  const id = String(rawId || "");
  if (!/^[0-9a-f]{32}$/.test(id)) return 0;
  try {
    await ensureTable(env);
    const now = Date.now();
    const row = await env.DB.prepare("SELECT * FROM first_rips WHERE id = ? AND user_id IS NULL AND created_at > ?")
      .bind(id, now - FIRST_RIP_KEEP_MS)
      .first();
    if (!row) return 0;
    const live = PLAYABLE_SETS.find((item) => item.id === row.set_id);
    const pulls = live ? dealAgain(parseCards(row.cards), await deps.loadSetCards(env, request, live)) : null;
    if (!pulls?.length) return 0;
    // Take the row first: of two signups naming one pack, one gets it.
    const taken = await env.DB.prepare("UPDATE first_rips SET user_id = ?, claimed_at = ?, ip_key = NULL WHERE id = ? AND user_id IS NULL")
      .bind(userId, now, id)
      .run();
    if (!taken.meta?.changes) return 0;
    const wrapper = live.wrappers.find((item) => item.id === row.wrapper_id) || live.wrappers[0];
    // If the cards can't be put on, hand the row back so the pack isn't lost.
    const giveBack = () => env.DB.prepare("UPDATE first_rips SET user_id = NULL, claimed_at = NULL WHERE id = ?").bind(id).run();
    let opened;
    try {
      opened = await deps.openPacks(env, userId, live, [{ wrapper, pulls }], 0);
    } catch (err) {
      await giveBack();
      throw err;
    }
    if (opened.response) {
      await giveBack();
      return 0;
    }
    return pulls.length;
  } catch (err) {
    console.error("first rip claim", err);
    return 0;
  }
}
