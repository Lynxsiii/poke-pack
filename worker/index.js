/**
 * Cloud accounts, inventory, and pack rips. Static pages still come from
 * the ASSETS binding; only /api/* is handled here.
 */
import { BASIC_ENERGY, getSet, PLAYABLE_SETS, money, sellValue } from "../js/catalog.js";
import { isHit, ripPack } from "../js/engine.js";
import { handleSocial, socialUserFields, patchSocialFields, ensureSocialSchema } from "./social.js";
import { tickBots } from "./bots.js";
import { COLOR_IDS } from "../js/palette.js";
import { isTitleUnlocked, titleContext } from "../js/titles.js";
import {
  achievementById,
  achievementContext,
  isAchievementDone,
  readyToClaim,
} from "../js/achievements.js";

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE = "pp_sid";
const STARTING_COINS = 25;
const DAILY_BONUS = 100;
const DAILY_COOLDOWN_MS = 60 * 60 * 1000;
const PBKDF2_ITERS = 12_000;
const BINDER_PAGE = 9;
const BINDER_MAX_SLOTS = BINDER_PAGE * 40;
const MAX_CLAIM_CARDS = 8000;
const MAX_COINS = 1_000_000;
// Ceilings for an unverifiable guest save handed to signup — see sanitizeClaim.
const CLAIM_MAX_COINS = 250_000;
const CLAIM_PACK_YIELD = 60;
const CLAIM_CARDS_PER_PACK = 20;
const CLAIM_MAX_AGE_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const MAX_QTY = 999;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const setCache = new Map();
let sealedCache = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      const message = err?.message || "Server error.";
      const status = err.status && Number.isInteger(err.status) ? err.status : 500;
      if (status >= 500) console.error(err);
      return json({ error: status >= 500 ? "Server error." : message }, status);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tickBots(env, (path, opts) => callApi(env, path, opts)));
  },
};

/**
 * Run one API call in-process, the way an incoming request would. The bot
 * driver uses this so its accounts go through every check a browser hits
 * without costing a subrequest, and so nothing can reach the database by a
 * path the public API would not allow.
 *
 * `SITE_ORIGIN` only has to be a valid absolute URL — asset reads go through
 * the ASSETS binding, not the network — but keeping it the real hostname
 * makes anything logged during a tick readable.
 */
async function callApi(env, path, { method = "GET", body = null, cookie = "" } = {}) {
  const url = new URL(path, env.SITE_ORIGIN || "https://poke-pack.rip");
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = `${COOKIE}=${cookie}`;
  const request = new Request(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });

  let res;
  try {
    res = await handleApi(request, env, url);
  } catch (err) {
    return { status: err?.status || 500, body: null, cookie: "" };
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  return { status: res.status, body: data, cookie: match ? match[1] : "" };
}

export async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true });
  }

  if (path === "/api/auth/signup" && method === "POST") {
    return signup(request, env);
  }
  if (path === "/api/auth/signin" && method === "POST") {
    return signin(request, env);
  }
  if (path === "/api/auth/signout" && method === "POST") {
    return signout(request, env);
  }
  if (path === "/api/auth/delete" && method === "POST") {
    return deleteAccount(request, env);
  }
  if (path === "/api/me" && method === "GET") {
    await ensureAchievementSchema(env);
    return me(request, env);
  }
  if (path === "/api/me" && method === "PATCH") {
    await ensureSocialSchema(env);
    await ensureAchievementSchema(env);
    return patchMe(request, env);
  }
  if (path === "/api/me/reset" && method === "POST") {
    return resetMe(request, env);
  }
  if (path === "/api/packs/rip" && method === "POST") {
    return rip(request, env);
  }
  if (path === "/api/daily" && method === "POST") {
    return daily(request, env);
  }
  if (path === "/api/achievements/claim" && method === "POST") {
    await ensureAchievementSchema(env);
    return claimAchievement(request, env);
  }
  if (path === "/api/cards/sell" && method === "POST") {
    return sell(request, env);
  }
  if (path === "/api/binder" && method === "PUT") {
    return putBinder(request, env);
  }

  await ensureSocialSchema(env);
  const social = await handleSocial(path, method, request, env, {
    json,
    requireUser,
    publicUser,
    normalizeHandle,
    findCatalogCard,
    money,
    readJson,
  });
  if (social) return social;

  return json({ error: "Not found." }, 404);
}

async function signup(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  const name = String(body.name || "").trim().slice(0, 24);
  const handle = normalizeHandle(body.handle);
  const password = String(body.password || "");
  const color = COLOR_IDS.has(body.color) ? body.color : "gold";
  if (name.length < 2) return json({ error: "Pick a trainer name (at least 2 letters)." }, 400);
  if (handle.length < 3) {
    return json({ error: "Handle needs 3–16 letters, numbers, or underscores." }, 400);
  }
  if (password.length < 6 || password.length > 64) {
    return json({ error: "Password needs 6–64 characters." }, 400);
  }

  const taken = await env.DB.prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first();
  if (taken) return json({ error: "That handle is taken." }, 409);

  const now = Date.now();
  const id = newId();
  const passwordHash = await hashPassword(password);
  const claim = sanitizeClaim(body.localSave);
  const coins = claim ? claim.coins : STARTING_COINS;
  const granted = claim ? claim.granted : STARTING_COINS;

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, name, handle, password_hash, color, bio, title, created_at, last_played)
         VALUES (?, ?, ?, ?, ?, '', 'Rookie', ?, ?)`
      ).bind(id, name, handle, passwordHash, color, now, now),
      env.DB.prepare(
        `INSERT INTO profiles (user_id, coins, last_daily, packs_opened, pulls, packs_since_hit, pack_trick, granted, active_set_id, created_at, binder, worth_log)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        coins,
        claim?.lastDaily ?? null,
        claim?.packsOpened ?? 0,
        claim?.pulls ?? 0,
        claim?.packsSinceHit ?? 0,
        claim?.packTrick ? 1 : 0,
        granted,
        claim?.activeSetId || "me5",
        claim?.createdAt || now,
        JSON.stringify(claim?.binder || emptyBinder()),
        JSON.stringify(claim?.worthLog || [])
      ),
    ]);
    await runBatches(env, [
      ...inventoryInserts(env, id, claim?.collection || {}, claim?.reverses || {}),
      ...historyInserts(env, id, claim?.history || []),
    ]);
  } catch (err) {
    if (String(err?.message || "").includes("UNIQUE")) {
      return json({ error: "That handle is taken." }, 409);
    }
    throw err;
  }

  const token = await createSession(env, id, now);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  const save = await loadSave(env, id);
  return json({ user: publicUser(user), save }, 201, sessionCookie(request, token));
}

async function signin(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);
  const handle = normalizeHandle(body.handle);
  const password = String(body.password || "");
  const user = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "Wrong handle or password." }, 401);
  }
  const now = Date.now();
  await env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(now, user.id).run();
  const token = await createSession(env, user.id, now);
  const save = await loadSave(env, user.id);
  return json({ user: publicUser({ ...user, last_played: now }), save }, 200, sessionCookie(request, token));
}

async function signout(request, env) {
  const sid = readCookie(request, COOKIE);
  if (sid) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  }
  return json({ ok: true }, 200, clearCookie(request));
}

async function deleteAccount(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const password = String(body?.password || "");
  if (!(await verifyPassword(password, auth.user.password_hash))) {
    return json({ error: "Wrong password." }, 401);
  }
  const id = auth.user.id;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM history WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM pack_log WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM cards WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM profiles WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
  return json({ ok: true }, 200, clearCookie(request));
}

async function me(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const save = await loadSave(env, auth.user.id);
  return json({ user: publicUser(auth.user), save });
}

async function patchMe(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  const user = auth.user;
  let name = user.name;
  let handle = user.handle;
  let bio = user.bio;
  let color = user.color;
  let title = user.title;
  let passwordHash = user.password_hash;
  const social = patchSocialFields(body, user);

  if (body.name != null) {
    name = String(body.name || "").trim().slice(0, 24);
    if (name.length < 2) return json({ error: "Pick a trainer name (at least 2 letters)." }, 400);
  }
  if (body.handle != null) {
    handle = normalizeHandle(body.handle);
    if (handle.length < 3) {
      return json({ error: "Handle needs 3–16 letters, numbers, or underscores." }, 400);
    }
    if (handle !== user.handle) {
      const taken = await env.DB.prepare("SELECT id FROM users WHERE handle = ? AND id != ?")
        .bind(handle, user.id)
        .first();
      if (taken) return json({ error: "That handle is taken." }, 409);
    }
  }
  if (body.bio != null) bio = String(body.bio || "").slice(0, 160);
  if (body.color != null) {
    if (!COLOR_IDS.has(body.color)) return json({ error: "Pick an avatar color." }, 400);
    color = body.color;
  }
  if (body.title != null) {
    const nextTitle = String(body.title || "").slice(0, 32);
    const save = await loadSave(env, user.id);
    const rarities = await rarityCountsFor(env, request, save.collection);
    const ctx = titleContext(save, { signed: true, rarities });
    if (!isTitleUnlocked(nextTitle, ctx)) return json({ error: "That title is locked." }, 400);
    title = nextTitle;
  }
  if (body.password != null && String(body.password).length) {
    const next = String(body.password);
    if (next.length < 6 || next.length > 64) {
      return json({ error: "Password needs 6–64 characters." }, 400);
    }
    if (!(await verifyPassword(String(body.current || ""), user.password_hash))) {
      return json({ error: "Wrong current password." }, 401);
    }
    passwordHash = await hashPassword(next);
  }

  if (Array.isArray(body.showcase)) {
    const { collection } = await inventoryMap(env, user.id);
    social.showcase = social.showcase.filter((slot) => (collection[slot.id] || 0) > 0);
  }

  await env.DB.prepare(
    `UPDATE users SET name = ?, handle = ?, bio = ?, color = ?, title = ?, password_hash = ?, last_played = ?,
       avatar = ?, avatar_style = ?, banner = ?, showcase = ?, shown_stats = ?
     WHERE id = ?`
  )
    .bind(
      name,
      handle,
      bio,
      color,
      title,
      passwordHash,
      Date.now(),
      social.avatar,
      social.avatarStyle,
      social.banner,
      JSON.stringify(social.showcase),
      JSON.stringify(social.shownStats),
      user.id
    )
    .run();

  if (Array.isArray(body.worthLog)) {
    const worthLog = body.worthLog
      .filter((row) => Array.isArray(row) && row.length >= 2)
      .slice(-200)
      .map((row) => [Number(row[0]) || 0, money(row[1])]);
    await env.DB.prepare("UPDATE profiles SET worth_log = ? WHERE user_id = ?")
      .bind(JSON.stringify(worthLog), user.id)
      .run();
  }

  const nextUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  const save = await loadSave(env, user.id);
  return json({ user: publicUser(nextUser), save });
}

async function resetMe(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  await ensureAchievementSchema(env);
  const now = Date.now();
  const profile = await env.DB.prepare("SELECT active_set_id FROM profiles WHERE user_id = ?")
    .bind(auth.user.id)
    .first();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cards WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM history WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM pack_log WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare(
      `UPDATE profiles SET coins = ?, last_daily = NULL, packs_opened = 0, pulls = 0,
        packs_since_hit = 0, pack_trick = 0, granted = ?, binder = ?, worth_log = ?, claimed = ?, created_at = ?
       WHERE user_id = ?`
    ).bind(
      STARTING_COINS,
      STARTING_COINS,
      JSON.stringify(emptyBinder()),
      JSON.stringify([]),
      JSON.stringify([]),
      now,
      auth.user.id
    ),
  ]);
  const save = await loadSave(env, auth.user.id);
  if (profile?.active_set_id) save.activeSetId = profile.active_set_id;
  return json({ save });
}

async function rip(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  const live = PLAYABLE_SETS.find((item) => item.id === String(body.setId || ""));
  if (!live) return json({ error: "Unknown set." }, 400);
  const wrapper =
    live.wrappers.find((item) => item.id === body.wrapperId) || live.wrappers[0];
  if (!wrapper) return json({ error: "Unknown pack art." }, 400);

  const catalog = await loadSetCards(env, request, live);
  const cost = await packCost(env, request, live);
  const pulls = ripPack(live, catalog);
  const now = Date.now();

  const ids = [...new Set(pulls.map((card) => card.id))];
  const existing = ids.length
    ? ((
        await env.DB.prepare(
          `SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? AND card_id IN (${ids.map(() => "?").join(",")})`
        )
          .bind(auth.user.id, ...ids)
          .all()
      ).results || [])
    : [];
  const qty = Object.fromEntries(existing.map((row) => [row.card_id, row.qty]));
  const reverseQty = Object.fromEntries(existing.map((row) => [row.card_id, row.reverse_qty]));

  const cards = [];
  let hits = 0;
  for (const card of pulls) {
    const wasNew = !(qty[card.id] > 0);
    qty[card.id] = (qty[card.id] || 0) + 1;
    if (card.reverse) reverseQty[card.id] = (reverseQty[card.id] || 0) + 1;
    if (isHit(card)) hits += 1;
    cards.push({ ...card, reverse: Boolean(card.reverse), wasNew });
  }

  const deducted = await env.DB.prepare(
    `UPDATE profiles SET coins = coins - ?, packs_opened = packs_opened + 1, pulls = pulls + ?,
      packs_since_hit = CASE WHEN ? > 0 THEN 0 ELSE packs_since_hit + 1 END,
      active_set_id = ?
     WHERE user_id = ? AND coins >= ?`
  )
    .bind(cost, cards.length, hits, live.id, auth.user.id, cost)
    .run();
  if (!deducted.meta?.changes) {
    return json({ error: "Not enough coins." }, 400);
  }

  const stmts = [];
  for (const id of Object.keys(qty)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO cards (user_id, card_id, qty, reverse_qty) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET qty = excluded.qty, reverse_qty = excluded.reverse_qty`
      ).bind(auth.user.id, id, qty[id], reverseQty[id] || 0)
    );
  }
  for (const card of cards) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO history (user_id, card_id, name, rarity, reverse, was_new, pack_id, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        auth.user.id,
        card.id,
        card.name,
        card.rarity,
        card.reverse ? 1 : 0,
        card.wasNew ? 1 : 0,
        wrapper.id,
        now
      )
    );
  }
  stmts.push(
    env.DB.prepare(
      `INSERT INTO pack_log (user_id, set_id, wrapper_id, cost, cards, at) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      auth.user.id,
      live.id,
      wrapper.id,
      cost,
      JSON.stringify(cards.map((card) => ({ id: card.id, reverse: card.reverse, rarity: card.rarity }))),
      now
    )
  );
  stmts.push(env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(now, auth.user.id));
  await runBatches(env, stmts);

  await trimHistory(env, auth.user.id);
  const save = await loadSave(env, auth.user.id);
  return json({ save, cards, cost });
}

async function daily(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const now = Date.now();
  const cutoff = now - DAILY_COOLDOWN_MS;
  const updated = await env.DB.prepare(
    `UPDATE profiles SET coins = coins + ?, granted = granted + ?, last_daily = ?
     WHERE user_id = ? AND (last_daily IS NULL OR last_daily <= ?)`
  )
    .bind(DAILY_BONUS, DAILY_BONUS, now, auth.user.id, cutoff)
    .run();
  if (!updated.meta?.changes) {
    return json({ error: "Hourly bonus is not ready yet." }, 400);
  }
  const save = await loadSave(env, auth.user.id);
  return json({ save, amount: DAILY_BONUS });
}

/**
 * Cash in a finished achievement. The reward is read from the shared table and
 * the progress is recomputed here from the stored save, so a forged request
 * gets nothing — the body only names which achievement to check.
 *
 * `all: true` sweeps every ready one in a single round trip, which is what the
 * "Claim all" button sends.
 */
async function claimAchievement(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const save = await loadSave(env, auth.user.id);
  const claimed = new Set(save.claimed);
  const rarities = await rarityCountsFor(env, request, save.collection);
  const ctx = achievementContext(save, { signed: true, rarities });

  let ids;
  if (body?.all) {
    ids = readyToClaim(ctx, claimed);
    if (!ids.length) return json({ error: "Nothing ready to claim." }, 400);
  } else {
    const row = achievementById(body?.id);
    if (!row) return json({ error: "Unknown achievement." }, 400);
    if (claimed.has(row.id)) return json({ error: "Already claimed." }, 400);
    if (!isAchievementDone(row, ctx)) return json({ error: "Not unlocked yet." }, 400);
    ids = [row.id];
  }

  const rewards = ids.map((id) => achievementById(id)).filter(Boolean);
  const coins = money(rewards.reduce((n, row) => n + (row.coins || 0), 0));
  const titles = rewards.map((row) => row.title).filter(Boolean);
  for (const id of ids) claimed.add(id);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE profiles SET coins = MIN(coins + ?, ?), granted = granted + ?, claimed = ?
       WHERE user_id = ?`
    ).bind(coins, MAX_COINS, coins, JSON.stringify([...claimed]), auth.user.id),
    env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(Date.now(), auth.user.id),
  ]);

  const next = await loadSave(env, auth.user.id);
  return json({
    save: next,
    coins,
    titles,
    claimed: ids,
    rewards: rewards.map((row) => ({ id: row.id, name: row.name, coins: row.coins, title: row.title || null })),
  });
}

async function sell(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const cardId = String(body?.cardId || "");
  if (!cardId) return json({ error: "Missing card." }, 400);

  const owned = await env.DB.prepare(
    "SELECT qty, reverse_qty FROM cards WHERE user_id = ? AND card_id = ?"
  )
    .bind(auth.user.id, cardId)
    .first();
  if (!owned || owned.qty < 1) return json({ error: "You don't own that card." }, 400);

  const card = await findCatalogCard(env, request, cardId);
  if (!card) return json({ error: "Unknown card." }, 400);
  const value = sellValue(card);

  const nextQty = owned.qty - 1;
  const nextReverse = owned.reverse_qty > 0 ? owned.reverse_qty - 1 : 0;
  const profile = await env.DB.prepare("SELECT binder FROM profiles WHERE user_id = ?")
    .bind(auth.user.id)
    .first();
  const binder = reconcileBinder(parseJson(profile?.binder, emptyBinder()), {
    ...((await inventoryMap(env, auth.user.id)).collection),
    [cardId]: nextQty,
  });

  const stmts = [
    env.DB.prepare("UPDATE profiles SET coins = coins + ? WHERE user_id = ?").bind(value, auth.user.id),
    env.DB.prepare("UPDATE profiles SET binder = ? WHERE user_id = ?").bind(JSON.stringify(binder), auth.user.id),
  ];
  if (nextQty <= 0) {
    stmts.push(env.DB.prepare("DELETE FROM cards WHERE user_id = ? AND card_id = ?").bind(auth.user.id, cardId));
  } else {
    stmts.push(
      env.DB.prepare("UPDATE cards SET qty = ?, reverse_qty = ? WHERE user_id = ? AND card_id = ?").bind(
        nextQty,
        nextReverse,
        auth.user.id,
        cardId
      )
    );
  }
  await env.DB.batch(stmts);

  const save = await loadSave(env, auth.user.id);
  return json({ save, value });
}

async function putBinder(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!Array.isArray(body?.binder)) return json({ error: "Binder must be a list of pockets." }, 400);
  if (body.binder.length > BINDER_MAX_SLOTS) return json({ error: "Binder is too large." }, 400);

  const { collection } = await inventoryMap(env, auth.user.id);
  const binder = normalizeBinder(body.binder);
  const held = {};
  for (const slot of binder) {
    if (!slot) continue;
    held[slot.id] = (held[slot.id] || 0) + 1;
    if (held[slot.id] > (collection[slot.id] || 0)) {
      return json({ error: "That pocket needs a card you own." }, 400);
    }
  }
  await env.DB.prepare("UPDATE profiles SET binder = ? WHERE user_id = ?")
    .bind(JSON.stringify(binder), auth.user.id)
    .run();
  const save = await loadSave(env, auth.user.id);
  return json({ save });
}

async function requireUser(request, env) {
  const sid = readCookie(request, COOKIE);
  if (!sid) return { response: json({ error: "Sign in first." }, 401) };
  const row = await env.DB.prepare(
    `SELECT sessions.id AS sid, sessions.expires_at AS expires_at, users.*
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ?`
  )
    .bind(sid)
    .first();
  if (!row || row.expires_at < Date.now()) {
    if (sid) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return { response: json({ error: "Sign in first." }, 401, clearCookie(request)) };
  }
  const { sid: _s, expires_at: _e, ...user } = row;
  return { user };
}

async function createSession(env, userId, now) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(token, userId, now, now + SESSION_MS)
    .run();
  return token;
}

let claimedColumnReady = false;

/**
 * `profiles.claimed` arrived after the first deploy, so add it on demand the
 * way ensureSocialSchema does for the users table.
 */
async function ensureAchievementSchema(env) {
  if (claimedColumnReady) return;
  try {
    const info = await env.DB.prepare("PRAGMA table_info(profiles)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    if (!have.has("claimed")) {
      await env.DB.exec("ALTER TABLE profiles ADD COLUMN claimed TEXT;");
    }
    claimedColumnReady = true;
  } catch (err) {
    if (String(err?.message || err).toLowerCase().includes("duplicate")) {
      claimedColumnReady = true;
      return;
    }
    console.error("ensureAchievementSchema", err);
  }
}

/** Only ids that still exist in the table, deduped. */
function normalizeClaimed(list) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const id of list) {
    if (achievementById(id)) out.add(String(id));
  }
  return [...out];
}

async function rarityCountsFor(env, request, collection) {
  const counts = {};
  for (const [id, n] of Object.entries(collection || {})) {
    if (!n) continue;
    const card = await findCatalogCard(env, request, id);
    if (card?.rarity) counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  }
  return counts;
}

async function loadSave(env, userId) {
  const profile = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(userId).first();
  if (!profile) fail("Missing profile.", 500);
  const { collection, reverses } = await inventoryMap(env, userId);
  const historyRows =
    (
      await env.DB.prepare(
        `SELECT card_id AS id, name, rarity, reverse, was_new AS wasNew, pack_id AS packId, at
         FROM history WHERE user_id = ? ORDER BY at DESC LIMIT 24`
      )
        .bind(userId)
        .all()
    ).results || [];
  return {
    coins: money(profile.coins),
    collection,
    reverses,
    lastDaily: profile.last_daily,
    packsOpened: profile.packs_opened || 0,
    pulls: profile.pulls || 0,
    packsSinceHit: profile.packs_since_hit || 0,
    packTrick: Boolean(profile.pack_trick),
    history: historyRows.map((row) => ({
      id: row.id,
      name: row.name,
      rarity: row.rarity,
      reverse: Boolean(row.reverse),
      wasNew: Boolean(row.wasNew),
      packId: row.packId,
      at: row.at,
    })),
    granted: money(profile.granted),
    claimed: normalizeClaimed(parseJson(profile.claimed, [])),
    activeSetId: profile.active_set_id || "me5",
    createdAt: profile.created_at,
    binder: normalizeBinder(parseJson(profile.binder, emptyBinder())),
    worthLog: Array.isArray(parseJson(profile.worth_log, [])) ? parseJson(profile.worth_log, []).slice(-200) : [],
  };
}

async function runBatches(env, stmts) {
  for (let i = 0; i < stmts.length; i += 40) {
    await env.DB.batch(stmts.slice(i, i + 40));
  }
}

async function inventoryMap(env, userId) {
  const rows =
    (await env.DB.prepare("SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? AND qty > 0").bind(userId).all())
      .results || [];
  const collection = {};
  const reverses = {};
  for (const row of rows) {
    collection[row.card_id] = row.qty;
    if (row.reverse_qty > 0) reverses[row.card_id] = row.reverse_qty;
  }
  return { collection, reverses };
}

async function loadSetCards(env, request, set) {
  if (setCache.has(set.id)) return setCache.get(set.id);
  const path = set.dataFile.startsWith("/") ? set.dataFile : `/${set.dataFile}`;
  const res = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: "GET" }));
  if (!res.ok) fail(`Missing set data for ${set.id}.`, 500);
  const cards = await res.json();
  const all = [...cards, ...BASIC_ENERGY];
  setCache.set(set.id, all);
  return all;
}

async function packCost(env, request, set) {
  try {
    if (!sealedCache) {
      const res = await env.ASSETS.fetch(new Request(new URL("/data/sealed.json", request.url), { method: "GET" }));
      sealedCache = res.ok ? await res.json() : {};
    }
    const pack = sealedCache?.[set.id]?.boosterPack;
    if (typeof pack === "number" && pack > 0) return money(pack);
  } catch {
    /* catalog cost */
  }
  return money(set.cost);
}

async function findCatalogCard(env, request, cardId) {
  if (cardId.startsWith("energy-")) {
    return BASIC_ENERGY.find((card) => card.id === cardId) || null;
  }
  const match = PLAYABLE_SETS.find((set) => cardId.startsWith(`${set.id}-`));
  const set = match || getSet(cardId.split("-")[0]);
  const cards = await loadSetCards(env, request, set);
  return cards.find((card) => card.id === cardId) || null;
}

async function trimHistory(env, userId) {
  try {
    await env.DB.prepare(
      `DELETE FROM history WHERE user_id = ? AND id NOT IN (
        SELECT id FROM (SELECT id FROM history WHERE user_id = ? ORDER BY at DESC LIMIT 24)
      )`
    )
      .bind(userId, userId)
      .run();
  } catch {
    /* extras are fine; GET /api/me already caps at 24 */
  }
}

function inventoryInserts(env, userId, collection, reverses) {
  const stmts = [];
  for (const [cardId, raw] of Object.entries(collection || {})) {
    const qty = clampInt(raw, 0, MAX_QTY);
    if (!qty || !safeCardId(cardId)) continue;
    const reverseQty = Math.min(qty, clampInt(reverses?.[cardId], 0, MAX_QTY));
    stmts.push(
      env.DB.prepare("INSERT INTO cards (user_id, card_id, qty, reverse_qty) VALUES (?, ?, ?, ?)").bind(
        userId,
        cardId,
        qty,
        reverseQty
      )
    );
  }
  return stmts;
}

function historyInserts(env, userId, history) {
  return (Array.isArray(history) ? history : [])
    .slice(0, 24)
    .filter((row) => row && safeCardId(row.id || row.card_id))
    .map((row) =>
      env.DB.prepare(
        `INSERT INTO history (user_id, card_id, name, rarity, reverse, was_new, pack_id, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        String(row.id || row.card_id),
        String(row.name || "").slice(0, 80),
        String(row.rarity || "").slice(0, 40),
        row.reverse ? 1 : 0,
        row.wasNew ? 1 : 0,
        row.packId ? String(row.packId).slice(0, 40) : null,
        Number(row.at) || Date.now()
      )
    );
}

/**
 * A guest save lives in localStorage, so nothing in it can be verified — but
 * it can be held to what a guest could plausibly have reached. The claim is
 * capped by hourly bonuses since the save was made plus a generous per-pack
 * sell yield, and the collection by what that many packs could have contained.
 * Real guests clear these by a wide margin; without them a single
 * unauthenticated signup mints a maxed account.
 */
function sanitizeClaim(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.coins !== "number" || !raw.collection || typeof raw.collection !== "object") return null;

  const now = Date.now();
  const createdAt =
    typeof raw.createdAt === "number"
      ? Math.min(now, Math.max(now - CLAIM_MAX_AGE_MS, raw.createdAt))
      : now;
  const packsOpened = clampInt(raw.packsOpened, 0, 1_000_000);
  const hours = Math.max(0, (now - createdAt) / (60 * 60 * 1000));
  const coinCap = Math.min(
    CLAIM_MAX_COINS,
    STARTING_COINS + hours * DAILY_BONUS + packsOpened * CLAIM_PACK_YIELD
  );
  const cardCap = Math.min(MAX_CLAIM_CARDS, BINDER_PAGE + packsOpened * CLAIM_CARDS_PER_PACK);

  const collection = {};
  let n = 0;
  for (const [id, qty] of Object.entries(raw.collection)) {
    if (!safeCardId(id)) continue;
    collection[id] = clampInt(qty, 0, MAX_QTY);
    n += 1;
    if (n >= cardCap) break;
  }
  const reverses = {};
  if (raw.reverses && typeof raw.reverses === "object") {
    for (const [id, qty] of Object.entries(raw.reverses)) {
      if (!collection[id]) continue;
      reverses[id] = Math.min(collection[id], clampInt(qty, 0, MAX_QTY));
    }
  }
  return {
    coins: Math.min(coinCap, Math.max(0, money(raw.coins))),
    collection,
    reverses,
    lastDaily: typeof raw.lastDaily === "number" ? Math.min(now, raw.lastDaily) : null,
    packsOpened,
    pulls: clampInt(raw.pulls, 0, packsOpened * CLAIM_CARDS_PER_PACK),
    packsSinceHit: clampInt(raw.packsSinceHit, 0, packsOpened),
    packTrick: Boolean(raw.packTrick),
    granted: Math.min(coinCap, Math.max(0, money(raw.granted ?? raw.coins))),
    activeSetId: PLAYABLE_SETS.some((set) => set.id === raw.activeSetId) ? raw.activeSetId : "me5",
    createdAt,
    binder: normalizeBinder(raw.binder),
    worthLog: Array.isArray(raw.worthLog) ? raw.worthLog.slice(-200) : [],
    history: Array.isArray(raw.history) ? raw.history.slice(0, 24) : [],
  };
}

function emptyBinder() {
  return Array.from({ length: BINDER_PAGE * 2 }, () => null);
}

function normalizeBinder(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, BINDER_MAX_SLOTS) : [];
  while (list.length < BINDER_PAGE * 2) list.push(null);
  while (list.length % BINDER_PAGE !== 0) list.push(null);
  return list.map((slot) => {
    if (!slot || typeof slot !== "object" || !safeCardId(slot.id)) return null;
    return { id: String(slot.id), reverse: Boolean(slot.reverse) };
  });
}

function reconcileBinder(binder, collection) {
  const slots = normalizeBinder(binder);
  const budget = {};
  return slots.map((slot) => {
    if (!slot) return null;
    budget[slot.id] = (budget[slot.id] || 0) + 1;
    if (budget[slot.id] > (collection[slot.id] || 0)) return null;
    return slot;
  });
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    color: row.color,
    bio: row.bio || "",
    title: row.title || "Rookie",
    createdAt: row.created_at,
    lastPlayed: row.last_played,
    ...socialUserFields(row),
  };
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 16);
}

function safeCardId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,48}$/i.test(id);
}

function clampInt(n, min, max) {
  const v = Math.floor(Number(n) || 0);
  return Math.min(max, Math.max(min, v));
}

function newId() {
  return hex(crypto.getRandomValues(new Uint8Array(8)));
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToB64(bytes) {
  let s = "";
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

async function hashPassword(password, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    key,
    256
  );
  return `${bytesToB64(salt)}:${bytesToB64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  if (!password || !stored || !stored.includes(":")) return false;
  const [saltB64] = stored.split(":");
  const next = await hashPassword(password, b64ToBytes(saltB64));
  return next === stored;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]+)`));
  return match?.[1] || "";
}

function sessionCookie(request, token) {
  return cookieHeader(request, token, SESSION_DAYS * 24 * 60 * 60);
}

function clearCookie(request) {
  return cookieHeader(request, "", 0);
}

function cookieHeader(request, token, maxAge) {
  const https = new URL(request.url).protocol === "https:";
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (https) parts.push("Secure");
  return parts.join("; ");
}

function json(data, status = 200, setCookie = "") {
  const headers = { ...jsonHeaders };
  if (setCookie) headers["set-cookie"] = setCookie;
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}
