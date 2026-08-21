import {
  avatarId,
  bannerId,
  normalizeStats,
  SHOWCASE_MAX,
  DEFAULT_AVATAR,
  DEFAULT_BANNER,
} from "../js/cosmetics.js";

const ONLINE_MS = 90_000;
const CHAT_GAP_MS = 2000;
const COMMENT_GAP_MS = 8000;
const CHAT_LIMIT = 40;
const COMMENT_LIMIT = 30;
const ONLINE_LIMIT = 32;
const MAX_FRIENDS = 200;
const MAX_PENDING = 40;

let schemaReady = false;

async function runDdl(env, sql) {
  const text = `${String(sql).trim().replace(/;+$/, "")};`;
  await env.DB.exec(text);
}

function missingSchema(err) {
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes("no such table") || msg.includes("no such column") || msg.includes("has no column");
}

export async function ensureSocialSchema(env) {
  if (schemaReady) return;
  try {
    const info = await env.DB.prepare("PRAGMA table_info(users)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    const alters = [
      ["avatar", "ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT '25'"],
      ["banner", "ALTER TABLE users ADD COLUMN banner TEXT NOT NULL DEFAULT 'me5:darkrai'"],
      ["showcase", "ALTER TABLE users ADD COLUMN showcase TEXT"],
      ["shown_stats", "ALTER TABLE users ADD COLUMN shown_stats TEXT"],
    ];
    for (const [name, sql] of alters) {
      if (have.has(name)) continue;
      try {
        await runDdl(env, sql);
      } catch (err) {
        if (!String(err?.message || err).toLowerCase().includes("duplicate")) throw err;
      }
    }
    const stmts = [
      "CREATE TABLE IF NOT EXISTS friends (from_id TEXT NOT NULL, to_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (from_id, to_id))",
      "CREATE TABLE IF NOT EXISTS profile_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS presence (user_id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL, last_chat_at INTEGER NOT NULL DEFAULT 0, last_comment_at INTEGER NOT NULL DEFAULT 0)",
      "CREATE INDEX IF NOT EXISTS idx_friends_to ON friends(to_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_friends_from ON friends(from_id, status)",
      "CREATE INDEX IF NOT EXISTS idx_comments_profile ON profile_comments(profile_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at)",
      "CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(seen_at)",
    ];
    for (const sql of stmts) await runDdl(env, sql);
    schemaReady = true;
  } catch (err) {
    console.error("ensureSocialSchema", err);
  }
}

async function queryAll(env, sql, ...binds) {
  try {
    const stmt = env.DB.prepare(sql);
    const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
    return result.results || [];
  } catch (err) {
    if (missingSchema(err)) return [];
    throw err;
  }
}

async function queryFirst(env, sql, ...binds) {
  try {
    const stmt = env.DB.prepare(sql);
    return binds.length ? await stmt.bind(...binds).first() : await stmt.first();
  } catch (err) {
    if (missingSchema(err)) return null;
    throw err;
  }
}

export async function handleSocial(path, method, request, env, helpers) {
  const { json } = helpers;

  if (path === "/api/lounge" && method === "GET") {
    return lounge(request, env, helpers);
  }
  if (path === "/api/chat" && method === "POST") {
    return postChat(request, env, helpers);
  }
  if (path === "/api/friends" && method === "GET") {
    return listFriends(request, env, helpers);
  }
  if (path === "/api/friends/request" && method === "POST") {
    return requestFriend(request, env, helpers);
  }
  if (path === "/api/friends/respond" && method === "POST") {
    return respondFriend(request, env, helpers);
  }
  if (path === "/api/friends/remove" && method === "POST") {
    return removeFriend(request, env, helpers);
  }

  const userMatch = path.match(/^\/api\/u\/([a-z0-9_]{3,16})$/i);
  if (userMatch && method === "GET") {
    return publicProfile(request, env, helpers, userMatch[1]);
  }
  const commentMatch = path.match(/^\/api\/u\/([a-z0-9_]{3,16})\/comments$/i);
  if (commentMatch && method === "POST") {
    return postComment(request, env, helpers, commentMatch[1]);
  }

  return null;
}

export function socialUserFields(row) {
  return {
    avatar: avatarId(row.avatar || DEFAULT_AVATAR),
    banner: bannerId(row.banner || DEFAULT_BANNER),
    showcase: parseShowcase(row.showcase),
    shownStats: normalizeStats(parseJson(row.shown_stats, null)),
  };
}

function parseJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseShowcase(raw) {
  const list = parseJson(raw, []);
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => {
      if (!row) return null;
      if (typeof row === "string") return { id: row, reverse: false };
      const id = String(row.id || "");
      if (!id) return null;
      return { id, reverse: Boolean(row.reverse) };
    })
    .filter(Boolean)
    .slice(0, SHOWCASE_MAX);
}

function cleanText(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function touchPresence(env, userId, extra = {}) {
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO presence (user_id, seen_at, last_chat_at, last_comment_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         seen_at = excluded.seen_at,
         last_chat_at = CASE WHEN ? > 0 THEN excluded.last_chat_at ELSE presence.last_chat_at END,
         last_comment_at = CASE WHEN ? > 0 THEN excluded.last_comment_at ELSE presence.last_comment_at END`
    )
      .bind(
        userId,
        now,
        extra.chat ? now : 0,
        extra.comment ? now : 0,
        extra.chat ? 1 : 0,
        extra.comment ? 1 : 0
      )
      .run();
  } catch (err) {
    if (!missingSchema(err)) throw err;
  }
  return now;
}

async function lounge(request, env, { json, requireUser, publicUser, normalizeHandle }) {
  const auth = await optionalUser(request, env, requireUser);
  if (auth.user) await touchPresence(env, auth.user.id);

  const cutoff = Date.now() - ONLINE_MS;
  const onlineRows = await queryAll(
    env,
    `SELECT users.* FROM presence
     JOIN users ON users.id = presence.user_id
     WHERE presence.seen_at >= ?
     ORDER BY presence.seen_at DESC
     LIMIT ?`,
    cutoff,
    ONLINE_LIMIT
  );

  const chatRows = (
    await queryAll(
      env,
      `SELECT chat_messages.id, chat_messages.body, chat_messages.created_at AS at,
              users.id AS user_id, users.name, users.handle, users.color, users.title
       FROM chat_messages
       JOIN users ON users.id = chat_messages.user_id
       ORDER BY chat_messages.id DESC
       LIMIT ?`,
      CHAT_LIMIT
    )
  ).reverse();

  return json({
    me: auth.user ? publicUser(auth.user) : null,
    online: onlineRows.map((row) => slimUser(row, publicUser)),
    chat: chatRows.map((row) => ({
      id: row.id,
      body: row.body,
      at: row.at,
      user: slimUser(row, publicUser, {
        id: row.user_id,
        name: row.name,
        handle: row.handle,
        color: row.color,
        title: row.title,
        avatar: row.avatar,
      }),
    })),
  });
}

async function postChat(request, env, { json, requireUser, publicUser, readJson }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const text = cleanText(body?.body, 180);
  if (text.length < 1) return json({ error: "Type a message." }, 400);

  const now = Date.now();
  const row = await env.DB.prepare("SELECT last_chat_at FROM presence WHERE user_id = ?")
    .bind(auth.user.id)
    .first();
  if (row && now - Number(row.last_chat_at || 0) < CHAT_GAP_MS) {
    return json({ error: "Slow down a second." }, 429);
  }
  await touchPresence(env, auth.user.id, { chat: true });
  await env.DB.prepare("INSERT INTO chat_messages (user_id, body, created_at) VALUES (?, ?, ?)")
    .bind(auth.user.id, text, now)
    .run();
  try {
    await env.DB.prepare(
      `DELETE FROM chat_messages WHERE id NOT IN (
        SELECT id FROM chat_messages ORDER BY id DESC LIMIT 150
      )`
    ).run();
  } catch {
    /* extras are fine */
  }
  return json({ ok: true, at: now, user: publicUser(auth.user), body: text });
}

async function publicProfile(request, env, helpers, rawHandle) {
  const { json, requireUser, publicUser, normalizeHandle, findCatalogCard, money } = helpers;
  const handle = normalizeHandle(rawHandle);
  const user = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  if (!user) return json({ error: "Trainer not found." }, 404);

  const auth = await optionalUser(request, env, requireUser);
  if (auth.user) await touchPresence(env, auth.user.id);

  const profile = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(user.id).first();
  const uniqueRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM cards WHERE user_id = ? AND qty > 0"
  )
    .bind(user.id)
    .first();
  const friendCount = await queryFirst(
    env,
    "SELECT COUNT(*) AS n FROM friends WHERE from_id = ? AND status = 'accepted'",
    user.id
  );
  const seen = await queryFirst(env, "SELECT seen_at FROM presence WHERE user_id = ?", user.id);

  const shown = normalizeStats(parseJson(user.shown_stats, null));
  const stats = {};
  if (shown.includes("packs")) stats.packs = profile?.packs_opened || 0;
  if (shown.includes("pulls")) stats.pulls = profile?.pulls || 0;
  if (shown.includes("unique")) stats.unique = uniqueRow?.n || 0;
  if (shown.includes("coins")) stats.coins = money(profile?.coins || 0);

  const showcase = [];
  for (const slot of parseShowcase(user.showcase)) {
    try {
      const card = await findCatalogCard(env, request, slot.id);
      if (!card) continue;
      showcase.push({
        id: card.id,
        name: card.name,
        rarity: card.rarity,
        image: card.imageSmall || card.image,
        reverse: slot.reverse,
      });
    } catch {
      /* skip a card whose set data is missing */
    }
  }

  const comments = await queryAll(
    env,
    `SELECT profile_comments.id, profile_comments.body, profile_comments.created_at AS at,
            users.id AS user_id, users.name, users.handle, users.color, users.title
     FROM profile_comments
     JOIN users ON users.id = profile_comments.author_id
     WHERE profile_comments.profile_id = ?
     ORDER BY profile_comments.id DESC
     LIMIT ?`,
    user.id,
    COMMENT_LIMIT
  );

  return json({
    user: { ...publicUser(user), ...socialUserFields(user) },
    stats,
    shownStats: shown,
    friends: friendCount?.n || 0,
    online: Boolean(seen && Date.now() - Number(seen.seen_at) < ONLINE_MS),
    relation: await relation(env, auth.user?.id, user.id),
    showcase,
    comments: comments.map((row) => ({
      id: row.id,
      body: row.body,
      at: row.at,
      user: slimUser(row, publicUser, {
        id: row.user_id,
        name: row.name,
        handle: row.handle,
        color: row.color,
        title: row.title,
        avatar: row.avatar,
      }),
    })),
  });
}

async function postComment(request, env, { json, requireUser, publicUser, normalizeHandle, readJson }, rawHandle) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const handle = normalizeHandle(rawHandle);
  const target = await env.DB.prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first();
  if (!target) return json({ error: "Trainer not found." }, 404);
  const body = await readJson(request);
  const text = cleanText(body?.body, 220);
  if (text.length < 1) return json({ error: "Write a comment." }, 400);

  const now = Date.now();
  const row = await env.DB.prepare("SELECT last_comment_at FROM presence WHERE user_id = ?")
    .bind(auth.user.id)
    .first();
  if (row && now - Number(row.last_comment_at || 0) < COMMENT_GAP_MS) {
    return json({ error: "Give it a moment before another comment." }, 429);
  }
  await touchPresence(env, auth.user.id, { comment: true });
  const result = await env.DB.prepare(
    "INSERT INTO profile_comments (profile_id, author_id, body, created_at) VALUES (?, ?, ?, ?)"
  )
    .bind(target.id, auth.user.id, text, now)
    .run();
  return json({
    ok: true,
    comment: {
      id: result.meta?.last_row_id || 0,
      body: text,
      at: now,
      user: publicUser(auth.user),
    },
  });
}

async function listFriends(request, env, { json, requireUser, publicUser }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  await touchPresence(env, auth.user.id);

  const accepted =
    (
      await env.DB.prepare(
        `SELECT users.*, presence.seen_at
         FROM friends
         JOIN users ON users.id = friends.to_id
         LEFT JOIN presence ON presence.user_id = users.id
         WHERE friends.from_id = ? AND friends.status = 'accepted'
         ORDER BY users.name`
      )
        .bind(auth.user.id)
        .all()
    ).results || [];

  const incoming =
    (
      await env.DB.prepare(
        `SELECT users.*
         FROM friends
         JOIN users ON users.id = friends.from_id
         WHERE friends.to_id = ? AND friends.status = 'pending'
         ORDER BY friends.created_at DESC`
      )
        .bind(auth.user.id)
        .all()
    ).results || [];

  const outgoing =
    (
      await env.DB.prepare(
        `SELECT users.*
         FROM friends
         JOIN users ON users.id = friends.to_id
         WHERE friends.from_id = ? AND friends.status = 'pending'`
      )
        .bind(auth.user.id)
        .all()
    ).results || [];

  return json({
    friends: accepted.map((row) => ({
      ...slimUser(row, publicUser),
      online: Boolean(row.seen_at && Date.now() - Number(row.seen_at) < ONLINE_MS),
    })),
    incoming: incoming.map((row) => slimUser(row, publicUser)),
    outgoing: outgoing.map((row) => slimUser(row, publicUser)),
  });
}

async function requestFriend(request, env, { json, requireUser, publicUser, normalizeHandle, readJson }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const handle = normalizeHandle(body?.handle);
  const target = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  if (!target) return json({ error: "Trainer not found." }, 404);
  if (target.id === auth.user.id) return json({ error: "That's you." }, 400);

  const existing = await env.DB.prepare(
    "SELECT status FROM friends WHERE from_id = ? AND to_id = ?"
  )
    .bind(auth.user.id, target.id)
    .first();
  if (existing?.status === "accepted") return json({ error: "You're already friends." }, 400);
  if (existing?.status === "pending") return json({ error: "Request already sent." }, 400);

  const inbound = await env.DB.prepare(
    "SELECT status FROM friends WHERE from_id = ? AND to_id = ?"
  )
    .bind(target.id, auth.user.id)
    .first();
  if (inbound?.status === "pending") {
    await acceptPair(env, target.id, auth.user.id);
    return json({ ok: true, status: "accepted", user: publicUser(target) });
  }

  const friends = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM friends WHERE from_id = ? AND status = 'accepted'"
  )
    .bind(auth.user.id)
    .first();
  if ((friends?.n || 0) >= MAX_FRIENDS) return json({ error: "Friend list is full." }, 400);
  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM friends WHERE from_id = ? AND status = 'pending'"
  )
    .bind(auth.user.id)
    .first();
  if ((pending?.n || 0) >= MAX_PENDING) return json({ error: "Too many pending requests." }, 400);

  await env.DB.prepare(
    "INSERT INTO friends (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)"
  )
    .bind(auth.user.id, target.id, Date.now())
    .run();
  return json({ ok: true, status: "pending", user: publicUser(target) });
}

async function respondFriend(request, env, { json, requireUser, publicUser, normalizeHandle, readJson }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const handle = normalizeHandle(body?.handle);
  const accept = Boolean(body?.accept);
  const other = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  if (!other) return json({ error: "Trainer not found." }, 404);

  const row = await env.DB.prepare(
    "SELECT status FROM friends WHERE from_id = ? AND to_id = ? AND status = 'pending'"
  )
    .bind(other.id, auth.user.id)
    .first();
  if (!row) return json({ error: "No request from them." }, 400);

  if (!accept) {
    await env.DB.prepare("DELETE FROM friends WHERE from_id = ? AND to_id = ?")
      .bind(other.id, auth.user.id)
      .run();
    return json({ ok: true, status: "none" });
  }
  await acceptPair(env, other.id, auth.user.id);
  return json({ ok: true, status: "accepted", user: publicUser(other) });
}

async function removeFriend(request, env, { json, requireUser, normalizeHandle, readJson }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const handle = normalizeHandle(body?.handle);
  const other = await env.DB.prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first();
  if (!other) return json({ error: "Trainer not found." }, 404);
  await env.DB.prepare(
    "DELETE FROM friends WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)"
  )
    .bind(auth.user.id, other.id, other.id, auth.user.id)
    .run();
  return json({ ok: true, status: "none" });
}

async function acceptPair(env, fromId, toId) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE friends SET status = 'accepted' WHERE from_id = ? AND to_id = ?"
    ).bind(fromId, toId),
    env.DB.prepare(
      `INSERT INTO friends (from_id, to_id, status, created_at) VALUES (?, ?, 'accepted', ?)
       ON CONFLICT(from_id, to_id) DO UPDATE SET status = 'accepted'`
    ).bind(toId, fromId, now),
  ]);
}

async function relation(env, meId, themId) {
  if (!meId) return "anon";
  if (meId === themId) return "self";
  const out = await queryFirst(env, "SELECT status FROM friends WHERE from_id = ? AND to_id = ?", meId, themId);
  if (out?.status === "accepted") return "friends";
  if (out?.status === "pending") return "pending-out";
  const inn = await queryFirst(env, "SELECT status FROM friends WHERE from_id = ? AND to_id = ?", themId, meId);
  if (inn?.status === "pending") return "pending-in";
  if (inn?.status === "accepted") return "friends";
  return "none";
}

function slimUser(row, publicUser, override) {
  const src = override || row;
  const pub = publicUser({
    id: src.id,
    name: src.name,
    handle: src.handle,
    color: src.color,
    bio: src.bio || "",
    title: src.title,
    created_at: src.created_at || src.createdAt,
    last_played: src.last_played || src.lastPlayed,
    avatar: src.avatar,
    banner: src.banner,
    showcase: src.showcase,
    shown_stats: src.shown_stats,
  });
  return pub;
}

async function optionalUser(request, env, requireUser) {
  const sid = (request.headers.get("cookie") || "").includes("pp_sid=");
  if (!sid) return { user: null };
  const auth = await requireUser(request, env);
  if (auth.response) return { user: null };
  return auth;
}

export function patchSocialFields(body, user) {
  const next = {
    avatar: avatarId(user.avatar || DEFAULT_AVATAR),
    banner: bannerId(user.banner || DEFAULT_BANNER),
    showcase: parseShowcase(user.showcase),
    shownStats: normalizeStats(parseJson(user.shown_stats, null)),
  };
  if (body.avatar != null) next.avatar = avatarId(body.avatar);
  if (body.banner != null) next.banner = bannerId(body.banner);
  if (body.shownStats != null) next.shownStats = normalizeStats(body.shownStats);
  if (Array.isArray(body.showcase)) {
    next.showcase = parseShowcase(body.showcase);
  }
  return next;
}
