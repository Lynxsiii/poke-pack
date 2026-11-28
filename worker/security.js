/**
 * Account security: email on the account, password reset by email, two-step
 * sign-in (an authenticator app, TOTP), signed-in devices, sign-in history,
 * sign-in throttling and Discord linking.
 *
 * Rules this file keeps:
 * - Secrets are never stored in the clear: email codes, reset codes and sign-in
 *   tickets are kept as SHA-256 hashes, and nothing here stores a Discord token.
 *   (The TOTP secret has to be readable to check a code, so it is the one
 *   exception; it never leaves the server once two-step is on.)
 * - Nothing says whether an account or an email exists: a reset request answers
 *   the same for any handle or address.
 * - Every code has a short life and a handful of tries, and the sign-in and
 *   reset doors are rate limited per account and per network address.
 * - Tables and columns are made on demand (no remote migrations from a session),
 *   and every personal table is in worker/terms.js PERSONAL_TABLES.
 */

import { mailReady, sendMail } from "./mail.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DISCORD_APP_ID = "1556002527818948771";
const DISCORD_API = "https://discord.com/api/v10";

const DDL = [
  `CREATE TABLE IF NOT EXISTS user_email (
    user_id TEXT PRIMARY KEY,
    email TEXT,
    verified_at INTEGER,
    pending_email TEXT,
    pending_hash TEXT,
    pending_expires INTEGER,
    pending_tries INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS user_email_verified ON user_email(email) WHERE verified_at IS NOT NULL",
  `CREATE TABLE IF NOT EXISTS reset_codes (
    user_id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS user_totp (
    user_id TEXT PRIMARY KEY,
    secret TEXT,
    enabled_at INTEGER,
    pending_secret TEXT,
    pending_at INTEGER,
    last_step INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS signin_tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    device TEXT,
    place TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS security_events_user ON security_events(user_id, at)",
  `CREATE TABLE IF NOT EXISTS auth_throttle (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_discord (
    user_id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar TEXT,
    shown INTEGER NOT NULL DEFAULT 1,
    linked_at INTEGER NOT NULL
  )`,
];

const SESSION_COLUMNS = [
  ["device", "TEXT"],
  ["place", "TEXT"],
  ["last_seen", "INTEGER"],
];

let ready = false;
export async function ensureSecuritySchema(env) {
  if (ready) return true;
  try {
    for (const sql of DDL) await env.DB.prepare(sql).run();
    const info = await env.DB.prepare("PRAGMA table_info(sessions)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    for (const [name, type] of SESSION_COLUMNS) {
      if (have.has(name)) continue;
      try {
        await env.DB.prepare(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`).run();
      } catch (err) {
        if (!String(err?.message || err).toLowerCase().includes("duplicate")) throw err;
      }
    }
    ready = true;
  } catch (err) {
    console.error("ensureSecuritySchema", err);
  }
  return ready;
}

/* ---- small helpers -------------------------------------------------------- */

const enc = new TextEncoder();

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(String(text))));
}

/** A short public id for a session row: never the cookie value itself. */
export async function sessionKey(token) {
  return (await sha256(`session:${token}`)).slice(0, 16);
}

function sixDigits() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Equal-time compare of two hex strings. */
function sameHex(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length || !a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "";
}

/** n***@gmail.com: enough to recognise your own, not enough to learn someone else's. */
export function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "";
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
}

/** "iPhone · Safari" from a User-Agent, good enough for a device list. */
export function deviceLabel(ua) {
  ua = String(ua || "");
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "Chromebook"
          : /Windows/.test(ua)
            ? "Windows"
            : /Macintosh|Mac OS X/.test(ua)
              ? "Mac"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  return [os, browser].filter(Boolean).join(" · ") || "Unknown device";
}

/** "London, GB" from Cloudflare's guess at where the request came from. No address is stored. */
export function placeLabel(request) {
  const cf = request.cf || {};
  return [cf.city, cf.country].filter(Boolean).join(", ").slice(0, 60) || "";
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";
}

/* ---- throttling ----------------------------------------------------------- */

/**
 * A fixed window counter per key. `hit` counts one try and answers whether the
 * key is still under its limit; `blocked` only looks.
 */
async function throttleRow(env, key) {
  return env.DB.prepare("SELECT count, window_start FROM auth_throttle WHERE key = ?").bind(key).first();
}

export async function blocked(env, key, limit, windowMs) {
  const row = await throttleRow(env, key);
  return Boolean(row && Date.now() - Number(row.window_start) < windowMs && Number(row.count) >= limit);
}

export async function hit(env, key, limit, windowMs) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO auth_throttle (key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`
  )
    .bind(key, now, now, windowMs, now, windowMs, now)
    .run();
  const row = await throttleRow(env, key);
  return Number(row?.count || 0) <= limit;
}

async function clearThrottle(env, key) {
  await env.DB.prepare("DELETE FROM auth_throttle WHERE key = ?").bind(key).run();
}

// Sign-in, per 15 minutes: 10 wrong passwords for one account from one address, 50 for
// one account from anywhere (so a stranger alone can't lock a trainer out), 40 from one address.
const SIGNIN_USER = [10, 15 * MIN];
const SIGNIN_HANDLE = [50, 15 * MIN];
const SIGNIN_IP = [40, 15 * MIN];
// Reset emails: 3 an account an hour, 10 from one address. Codes: 5 tries each.
const RESET_USER = [3, HOUR];
const RESET_IP = [10, HOUR];
const CODE_TRIES = 5;
const CODE_LIFE = 30 * MIN;
const TICKET_LIFE = 5 * MIN;
const TOO_MANY = "Too many tries. Wait a few minutes and try again.";

export async function signinBlocked(env, request, handle) {
  if (!(await ensureSecuritySchema(env))) return false;
  const ip = await sha256(clientIp(request));
  return (
    (await blocked(env, `signin:u:${handle}:${ip}`, ...SIGNIN_USER)) ||
    (await blocked(env, `signin:u:${handle}`, ...SIGNIN_HANDLE)) ||
    (await blocked(env, `signin:ip:${ip}`, ...SIGNIN_IP))
  );
}

/** A wrong password: counts against the handle and the address, and goes in that account's history. */
export async function signinFailed(env, request, handle, userId) {
  if (!(await ensureSecuritySchema(env))) return;
  const ip = await sha256(clientIp(request));
  await hit(env, `signin:u:${handle}:${ip}`, ...SIGNIN_USER);
  await hit(env, `signin:u:${handle}`, ...SIGNIN_HANDLE);
  await hit(env, `signin:ip:${ip}`, ...SIGNIN_IP);
  if (userId) await logEvent(env, request, userId, "signin_failed");
}

export async function signinSucceeded(env, request, handle) {
  if (!(await ensureSecuritySchema(env))) return;
  const ip = await sha256(clientIp(request));
  await clearThrottle(env, `signin:u:${handle}:${ip}`);
}

export { TOO_MANY };

/* ---- history -------------------------------------------------------------- */

const HISTORY_KEEP = 40;
const EVENT_KINDS = new Set([
  "signin",
  "signin_failed",
  "code_failed",
  "signup",
  "password",
  "reset",
  "recover",
  "email_added",
  "email_removed",
  "totp_on",
  "totp_off",
  "discord_linked",
  "discord_unlinked",
  "signout_all",
]);

export async function logEvent(env, request, userId, kind) {
  if (!EVENT_KINDS.has(kind) || !(await ensureSecuritySchema(env))) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO security_events (user_id, at, kind, device, place) VALUES (?, ?, ?, ?, ?)").bind(
      userId,
      now,
      kind,
      deviceLabel(request.headers.get("User-Agent")),
      placeLabel(request)
    ),
    env.DB.prepare(
      `DELETE FROM security_events WHERE user_id = ? AND id NOT IN
         (SELECT id FROM security_events WHERE user_id = ? ORDER BY id DESC LIMIT ${HISTORY_KEEP})`
    ).bind(userId, userId),
  ]);
}

/* ---- sessions -------------------------------------------------------------- */

/** Called by createSession: what device and place a new session came from. */
export async function tagSession(env, request, token) {
  if (!request || !(await ensureSecuritySchema(env))) return;
  await env.DB.prepare("UPDATE sessions SET device = ?, place = ?, last_seen = ? WHERE id = ?")
    .bind(deviceLabel(request.headers.get("User-Agent")), placeLabel(request), Date.now(), token)
    .run();
}

/** Called by requireUser: last seen, written at most every 10 minutes per session. */
export async function touchSession(env, token) {
  if (!ready) return;
  const now = Date.now();
  await env.DB.prepare("UPDATE sessions SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)")
    .bind(now, token, now - 10 * MIN)
    .run();
}

async function deviceList(env, userId, currentToken) {
  const rows = await env.DB.prepare(
    "SELECT id, created_at, expires_at, device, place, last_seen FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY COALESCE(last_seen, created_at) DESC LIMIT 30"
  )
    .bind(userId, Date.now())
    .all();
  const out = [];
  for (const row of rows.results || []) {
    out.push({
      id: await sessionKey(row.id),
      device: row.device || "Unknown device",
      place: row.place || "",
      since: Number(row.created_at),
      seen: Number(row.last_seen || row.created_at),
      current: row.id === currentToken,
    });
  }
  return out;
}

/* ---- email ---------------------------------------------------------------- */

async function emailRow(env, userId) {
  return env.DB.prepare("SELECT * FROM user_email WHERE user_id = ?").bind(userId).first();
}

function mailShell(title, lines) {
  const text = `${title}\n\n${lines.join("\n\n")}\n\nPoke Pack, poke-pack.rip`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b1b1f">
  <p style="font-weight:700;font-size:18px;margin:0 0 16px">${title}</p>
  ${lines.map((line) => `<p style="font-size:15px;line-height:1.5;margin:0 0 14px">${line}</p>`).join("")}
  <p style="font-size:12px;color:#6b6b73;margin:24px 0 0">Poke Pack · <a href="https://poke-pack.rip" style="color:#6b6b73">poke-pack.rip</a></p>
</div>`;
  return { text: text.replace(/<[^>]+>/g, ""), html };
}

function codeBlock(code) {
  return `<span style="display:inline-block;font:700 28px/1.2 ui-monospace,Menlo,monospace;letter-spacing:6px;padding:10px 16px;border-radius:10px;background:#f1f1f4">${code}</span>`;
}

/* ---- TOTP ----------------------------------------------------------------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function totpAt(secret, step) {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  let n = step;
  for (let i = 7; i >= 0; i -= 1) {
    msg[i] = n & 255;
    n = Math.floor(n / 256);
  }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}

/** The step a code matches (one step either side of now, for a slow clock), or 0. */
export async function totpMatch(secret, code, now = Date.now()) {
  code = String(code || "").replace(/\D/g, "");
  if (code.length !== 6 || !secret) return 0;
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    if (sameHex(await totpAt(secret, s), code)) return s;
  }
  return 0;
}

async function totpRow(env, userId) {
  return env.DB.prepare("SELECT * FROM user_totp WHERE user_id = ?").bind(userId).first();
}

export async function totpOn(env, userId) {
  if (!(await ensureSecuritySchema(env))) return false;
  const row = await totpRow(env, userId);
  return Boolean(row?.secret && row?.enabled_at);
}

/** Checks a code against the account's live secret and spends that step, so a code works once. */
async function spendTotp(env, userId, code) {
  const row = await totpRow(env, userId);
  if (!row?.secret || !row.enabled_at) return false;
  const step = await totpMatch(row.secret, code);
  if (!step || step <= Number(row.last_step || 0)) return false;
  const res = await env.DB.prepare("UPDATE user_totp SET last_step = ? WHERE user_id = ? AND last_step < ?")
    .bind(step, userId, step)
    .run();
  return Number(res?.meta?.changes || 0) === 1;
}

/** Sign-in with two-step on: a ticket stands for "password was right" for five minutes. */
export async function makeSigninTicket(env, userId) {
  const ticket = hex(crypto.getRandomValues(new Uint8Array(24)));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM signin_tickets WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO signin_tickets (id, user_id, expires_at, tries) VALUES (?, ?, ?, 0)").bind(
      await sha256(ticket),
      userId,
      now + TICKET_LIFE
    ),
  ]);
  return ticket;
}

/* ---- Discord -------------------------------------------------------------- */

export async function shownDiscord(env, userId) {
  try {
    if (!(await ensureSecuritySchema(env))) return null;
    const row = await env.DB.prepare("SELECT discord_id, username, global_name, avatar, shown FROM user_discord WHERE user_id = ?")
      .bind(userId)
      .first();
    return row && Number(row.shown) === 1 ? discordFields(row) : null;
  } catch {
    return null;
  }
}

/** A linked trainer's Discord id, for a mention in the pulls feed (only when they show it). */
export async function discordIdFor(env, userId) {
  const row = await shownDiscord(env, userId);
  return row?.id || "";
}

function discordFields(row) {
  return {
    id: row.discord_id,
    username: row.username,
    name: row.global_name || row.username,
    avatar: row.avatar
      ? `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.avatar}.png?size=96`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(row.discord_id) >> 22n) % 6}.png`,
    shown: Number(row.shown) === 1,
  };
}

export function discordReady(env) {
  return Boolean(env.DISCORD_CLIENT_SECRET);
}

/* ---- the routes ----------------------------------------------------------- */

/**
 * Routes under /api/me/security, /api/auth/signin/code and /api/auth/reset.
 * deps carries index.js helpers so this file never imports index.js.
 */
export async function handleSecurity(path, method, request, env, deps) {
  const { json, readJson, requireUser, readCookie, COOKIE } = deps;
  if (!(await ensureSecuritySchema(env))) return json({ error: "Security settings are unavailable right now." }, 503);

  // ---- signed out: two-step code, reset by email ----
  if (path === "/api/auth/signin/code" && method === "POST") return signinCode(request, env, deps);
  if (path === "/api/auth/reset/request" && method === "POST") return resetRequest(request, env, deps);
  if (path === "/api/auth/reset/confirm" && method === "POST") return resetConfirm(request, env, deps);

  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;
  const token = readCookie(request, COOKIE);
  const body = method === "GET" ? {} : (await readJson(request)) || {};

  if (path === "/api/me/security" && method === "GET") {
    const [email, totp, discord, devices, history] = await Promise.all([
      emailRow(env, user.id),
      totpRow(env, user.id),
      env.DB.prepare("SELECT * FROM user_discord WHERE user_id = ?").bind(user.id).first(),
      deviceList(env, user.id, token),
      env.DB.prepare("SELECT at, kind, device, place FROM security_events WHERE user_id = ? ORDER BY id DESC LIMIT 15")
        .bind(user.id)
        .all(),
    ]);
    return json({
      mailReady: mailReady(env),
      discordReady: discordReady(env),
      discordAppId: DISCORD_APP_ID,
      email: email?.email && email.verified_at ? { masked: maskEmail(email.email), verifiedAt: Number(email.verified_at) } : null,
      pendingEmail: email?.pending_email && Number(email.pending_expires) > Date.now() ? maskEmail(email.pending_email) : null,
      totp: totp?.enabled_at ? { since: Number(totp.enabled_at) } : null,
      discord: discord ? { ...discordFields(discord), linkedAt: Number(discord.linked_at) } : null,
      devices,
      history: (history.results || []).map((row) => ({ at: Number(row.at), kind: row.kind, device: row.device || "", place: row.place || "" })),
    });
  }

  // ---- devices ----
  if (path === "/api/me/security/signout" && method === "POST") {
    if (body.all) {
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user.id, token).run();
      await logEvent(env, request, user.id, "signout_all");
      return json({ ok: true, devices: await deviceList(env, user.id, token) });
    }
    const rows = await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ?").bind(user.id).all();
    for (const row of rows.results || []) {
      if (row.id !== token && (await sessionKey(row.id)) === String(body.id || "")) {
        await env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").bind(row.id, user.id).run();
      }
    }
    return json({ ok: true, devices: await deviceList(env, user.id, token) });
  }

  // ---- email ----
  if (path === "/api/me/security/email" && method === "POST") return emailStart(request, env, user, body, deps);
  if (path === "/api/me/security/email/verify" && method === "POST") return emailVerify(request, env, user, body, deps);
  if (path === "/api/me/security/email" && method === "DELETE") {
    if (!(await deps.verifyPassword(String(body.password || ""), user.password_hash))) return json({ error: "Wrong password." }, 401);
    await env.DB.prepare("DELETE FROM user_email WHERE user_id = ?").bind(user.id).run();
    await logEvent(env, request, user.id, "email_removed");
    return json({ ok: true });
  }

  // ---- two-step ----
  if (path === "/api/me/security/totp/start" && method === "POST") {
    if (await totpOn(env, user.id)) return json({ error: "Two-step sign-in is already on." }, 409);
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    await env.DB.prepare(
      `INSERT INTO user_totp (user_id, pending_secret, pending_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET pending_secret = excluded.pending_secret, pending_at = excluded.pending_at`
    )
      .bind(user.id, secret, Date.now())
      .run();
    const label = encodeURIComponent(`Poke Pack:@${user.handle}`);
    return json({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Poke%20Pack&algorithm=SHA1&digits=6&period=30` });
  }
  if (path === "/api/me/security/totp/confirm" && method === "POST") {
    if (!(await hit(env, `totp:u:${user.id}`, 10, 15 * MIN))) return json({ error: TOO_MANY }, 429);
    const row = await totpRow(env, user.id);
    if (!row?.pending_secret || Date.now() - Number(row.pending_at) > HOUR) {
      return json({ error: "That setup ran out of time. Start again." }, 400);
    }
    const step = await totpMatch(row.pending_secret, body.code);
    if (!step) return json({ error: "That code doesn't match. Check the time on your phone is set automatically." }, 400);
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE user_totp SET secret = pending_secret, enabled_at = ?, pending_secret = NULL, pending_at = NULL, last_step = ? WHERE user_id = ?"
    )
      .bind(now, step, user.id)
      .run();
    // Turning two-step on signs every other device out: whoever else had a session now needs the code too.
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(user.id, token).run();
    await logEvent(env, request, user.id, "totp_on");
    return json({ ok: true, totp: { since: now } });
  }
  if (path === "/api/me/security/totp" && method === "DELETE") {
    if (!(await hit(env, `totp:u:${user.id}`, 10, 15 * MIN))) return json({ error: TOO_MANY }, 429);
    const byPassword = body.password && (await deps.verifyPassword(String(body.password), user.password_hash));
    const byCode = !byPassword && body.code && (await spendTotp(env, user.id, body.code));
    if (!byPassword && !byCode) return json({ error: body.code ? "That code doesn't match." : "Wrong password." }, 401);
    await env.DB.prepare("DELETE FROM user_totp WHERE user_id = ?").bind(user.id).run();
    await logEvent(env, request, user.id, "totp_off");
    return json({ ok: true });
  }

  // ---- Discord ----
  if (path === "/api/me/security/discord" && method === "POST") return discordLink(request, env, user, body, deps);
  if (path === "/api/me/security/discord" && method === "PATCH") {
    await env.DB.prepare("UPDATE user_discord SET shown = ? WHERE user_id = ?").bind(body.shown ? 1 : 0, user.id).run();
    return json({ ok: true, shown: Boolean(body.shown) });
  }
  if (path === "/api/me/security/discord" && method === "DELETE") {
    await env.DB.prepare("DELETE FROM user_discord WHERE user_id = ?").bind(user.id).run();
    await logEvent(env, request, user.id, "discord_unlinked");
    return json({ ok: true });
  }

  return json({ error: "Not found." }, 404);
}

async function emailStart(request, env, user, body, { json, verifyPassword }) {
  if (!mailReady(env)) return json({ error: "Email isn't switched on yet." }, 503);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "That doesn't look like an email address." }, 400);
  if (!(await verifyPassword(String(body.password || ""), user.password_hash))) return json({ error: "Wrong password." }, 401);
  if (!(await hit(env, `email:u:${user.id}`, 5, HOUR))) return json({ error: TOO_MANY }, 429);
  const code = sixDigits();
  await env.DB.prepare(
    `INSERT INTO user_email (user_id, pending_email, pending_hash, pending_expires, pending_tries) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET pending_email = excluded.pending_email, pending_hash = excluded.pending_hash,
       pending_expires = excluded.pending_expires, pending_tries = 0`
  )
    .bind(user.id, email, await sha256(`email:${user.id}:${code}`), Date.now() + CODE_LIFE)
    .run();
  const mail = mailShell("Your Poke Pack code", [
    `Here's the code to add this email to @${user.handle}:`,
    codeBlock(code),
    "It works for 30 minutes. If you didn't ask for it, ignore this email and nothing changes.",
  ]);
  const sent = await sendMail(env, { to: email, subject: `${code} is your Poke Pack code`, ...mail });
  if (!sent) return json({ error: "We couldn't send that email. Try again in a minute." }, 502);
  return json({ ok: true, pendingEmail: maskEmail(email) });
}

async function emailVerify(request, env, user, body, { json }) {
  const row = await emailRow(env, user.id);
  if (!row?.pending_email || Number(row.pending_expires) < Date.now()) return json({ error: "That code ran out. Send a new one." }, 400);
  if (Number(row.pending_tries) >= CODE_TRIES) return json({ error: "Too many wrong codes. Send a new one." }, 429);
  const code = String(body.code || "").replace(/\D/g, "");
  if (!sameHex(await sha256(`email:${user.id}:${code}`), row.pending_hash)) {
    await env.DB.prepare("UPDATE user_email SET pending_tries = pending_tries + 1 WHERE user_id = ?").bind(user.id).run();
    return json({ error: "That code doesn't match." }, 400);
  }
  const taken = await env.DB.prepare("SELECT user_id FROM user_email WHERE email = ? AND verified_at IS NOT NULL AND user_id != ?")
    .bind(row.pending_email, user.id)
    .first();
  if (taken) {
    await env.DB.prepare("UPDATE user_email SET pending_email = NULL, pending_hash = NULL WHERE user_id = ?").bind(user.id).run();
    return json({ error: "That email is already on another account." }, 409);
  }
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE user_email SET email = pending_email, verified_at = ?, pending_email = NULL, pending_hash = NULL, pending_expires = NULL, pending_tries = 0 WHERE user_id = ?"
  )
    .bind(now, user.id)
    .run();
  await logEvent(env, request, user.id, "email_added");
  return json({ ok: true, email: { masked: maskEmail(row.pending_email), verifiedAt: now } });
}

/** POST /api/auth/signin/code {ticket, code} or {ticket, recovery}: the second step of a sign-in. */
async function signinCode(request, env, deps) {
  const { json, readJson, createSession, sessionCookie, loadSave, trainerUser, verifyPassword } = deps;
  const body = (await readJson(request)) || {};
  const id = await sha256(String(body.ticket || ""));
  const row = await env.DB.prepare("SELECT * FROM signin_tickets WHERE id = ?").bind(id).first();
  if (!row || Number(row.expires_at) < Date.now()) return json({ error: "That sign-in ran out of time. Enter your password again.", restart: true }, 401);
  if (Number(row.tries) >= CODE_TRIES) {
    await env.DB.prepare("DELETE FROM signin_tickets WHERE id = ?").bind(id).run();
    return json({ error: TOO_MANY, restart: true }, 429);
  }
  let ok = false;
  let usedRecovery = false;
  if (body.recovery) {
    const { normalizeCode } = await import("./recovery.js");
    const rec = await env.DB.prepare("SELECT code_hash FROM recovery_codes WHERE user_id = ?").bind(row.user_id).first().catch(() => null);
    const code = normalizeCode(body.recovery);
    if (rec && code.length === 16 && (await verifyPassword(code, rec.code_hash))) {
      const spent = await env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ? AND code_hash = ?").bind(row.user_id, rec.code_hash).run();
      ok = Number(spent?.meta?.changes || 0) === 1;
      usedRecovery = ok;
    }
  } else {
    ok = await spendTotp(env, row.user_id, body.code);
  }
  if (!ok) {
    await env.DB.prepare("UPDATE signin_tickets SET tries = tries + 1 WHERE id = ?").bind(id).run();
    await logEvent(env, request, row.user_id, "code_failed");
    return json({ error: body.recovery ? "That recovery code doesn't match." : "That code doesn't match." }, 401);
  }
  await env.DB.prepare("DELETE FROM signin_tickets WHERE id = ?").bind(id).run();
  const now = Date.now();
  await env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(now, row.user_id).run();
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(row.user_id).first();
  await signinSucceeded(env, request, user.handle);
  const token = await createSession(env, user.id, now, request);
  await logEvent(env, request, user.id, "signin");
  const save = await loadSave(env, user.id);
  return json({ user: await trainerUser(env, user, save), save, usedRecovery }, 200, sessionCookie(request, token));
}

const RESET_SENT = "If that account has a verified email, a code is on its way. It works for 30 minutes.";

/** POST /api/auth/reset/request {who}: who is a handle or an email. Answers the same either way. */
async function resetRequest(request, env, { json, readJson, normalizeHandle }) {
  const body = (await readJson(request)) || {};
  const who = String(body.who || "").trim();
  if (!who) return json({ error: "Enter your handle or email." }, 400);
  if (!mailReady(env)) return json({ error: "Email resets aren't switched on yet. Use a recovery code." }, 503);
  const ip = await sha256(clientIp(request));
  if (!(await hit(env, `reset:ip:${ip}`, ...RESET_IP))) return json({ error: TOO_MANY }, 429);
  const email = normalizeEmail(who);
  const row = email
    ? await env.DB.prepare(
        "SELECT users.id, users.handle, user_email.email FROM user_email JOIN users ON users.id = user_email.user_id WHERE user_email.email = ? AND user_email.verified_at IS NOT NULL"
      )
        .bind(email)
        .first()
    : await env.DB.prepare(
        "SELECT users.id, users.handle, user_email.email FROM users JOIN user_email ON user_email.user_id = users.id WHERE users.handle = ? AND user_email.verified_at IS NOT NULL"
      )
        .bind(normalizeHandle(who))
        .first();
  // The same answer, and the same work for the hash, whether or not anyone matched.
  const code = sixDigits();
  const hash = await sha256(`reset:${row?.id || "none"}:${code}`);
  if (row && (await hit(env, `reset:u:${row.id}`, ...RESET_USER))) {
    await env.DB.prepare(
      `INSERT INTO reset_codes (user_id, code_hash, expires_at, tries) VALUES (?, ?, ?, 0)
       ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0`
    )
      .bind(row.id, hash, Date.now() + CODE_LIFE)
      .run();
    const link = `https://poke-pack.rip/reset?u=${encodeURIComponent(row.handle)}&c=${code}`;
    const mail = mailShell("Reset your Poke Pack password", [
      `Someone asked to reset the password for @${row.handle}. Here's the code:`,
      codeBlock(code),
      `Or open <a href="${link}">this link</a> to set a new password. It works for 30 minutes.`,
      "If it wasn't you, ignore this email. Your password stays the same.",
    ]);
    await sendMail(env, { to: row.email, subject: "Reset your Poke Pack password", ...mail });
  }
  return json({ ok: true, message: RESET_SENT });
}

/** POST /api/auth/reset/confirm {who, code, password, totp?}: a new password from an emailed code. */
async function resetConfirm(request, env, deps) {
  const { json, readJson, normalizeHandle, hashPassword, createSession, sessionCookie, loadSave, trainerUser } = deps;
  const body = (await readJson(request)) || {};
  const password = String(body.password || "");
  if (password.length < 6 || password.length > 64) return json({ error: "Password needs 6–64 characters." }, 400);
  const WRONG = "That code doesn't match, or it ran out. Ask for a new one.";
  const who = String(body.who || "").trim();
  const email = normalizeEmail(who);
  const user = email
    ? await env.DB.prepare(
        "SELECT users.* FROM user_email JOIN users ON users.id = user_email.user_id WHERE user_email.email = ? AND user_email.verified_at IS NOT NULL"
      )
        .bind(email)
        .first()
    : await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(normalizeHandle(who)).first();
  const row = user ? await env.DB.prepare("SELECT * FROM reset_codes WHERE user_id = ?").bind(user.id).first() : null;
  if (!user || !row || Number(row.expires_at) < Date.now() || Number(row.tries) >= CODE_TRIES) return json({ error: WRONG }, 401);
  const code = String(body.code || "").replace(/\D/g, "");
  if (!sameHex(await sha256(`reset:${user.id}:${code}`), row.code_hash)) {
    await env.DB.prepare("UPDATE reset_codes SET tries = tries + 1 WHERE user_id = ?").bind(user.id).run();
    return json({ error: WRONG }, 401);
  }
  // An email alone isn't enough when two-step is on: the app's code is needed too.
  if (await totpOn(env, user.id)) {
    if (!body.totp) return json({ error: "Enter the code from your authenticator app too.", needTotp: true }, 401);
    if (!(await spendTotp(env, user.id, body.totp))) {
      await env.DB.prepare("UPDATE reset_codes SET tries = tries + 1 WHERE user_id = ?").bind(user.id).run();
      return json({ error: "That authenticator code doesn't match.", needTotp: true }, 401);
    }
  }
  const now = Date.now();
  const spent = await env.DB.prepare("DELETE FROM reset_codes WHERE user_id = ? AND code_hash = ?").bind(user.id, row.code_hash).run();
  if (Number(spent?.meta?.changes || 0) !== 1) return json({ error: WRONG }, 401);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, last_played = ? WHERE id = ?").bind(await hashPassword(password), now, user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
  ]);
  await clearThrottle(env, `signin:u:${user.handle}`);
  await clearThrottle(env, `signin:u:${user.handle}:${await sha256(clientIp(request))}`);
  await logEvent(env, request, user.id, "reset");
  const token = await createSession(env, user.id, now, request);
  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  const save = await loadSave(env, user.id);
  return json({ user: await trainerUser(env, fresh, save), save }, 200, sessionCookie(request, token));
}

/**
 * POST /api/me/security/discord {code, verifier, redirect}: the page came back from
 * Discord's consent screen with a code. Swap it for a token (never stored), read who
 * the Discord user is, and link them. PKCE ties the code to the browser that asked.
 */
async function discordLink(request, env, user, body, { json }) {
  if (!discordReady(env)) return json({ error: "Discord linking isn't switched on yet." }, 503);
  const code = String(body.code || "").slice(0, 200);
  const verifier = String(body.verifier || "").slice(0, 200);
  const origin = new URL(request.url).origin;
  const redirect = `${origin}/account/discord`;
  if (!code || verifier.length < 43) return json({ error: "That Discord link didn't finish. Try again." }, 400);
  const form = new URLSearchParams({
    client_id: DISCORD_APP_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!tokenRes.ok) return json({ error: "Discord said no to that link. Try again." }, 400);
  const tokenBody = await tokenRes.json();
  const meRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { authorization: `Bearer ${tokenBody.access_token}` } });
  // The token's only use is that one read: hand it back to Discord straight away.
  await fetch(`${DISCORD_API}/oauth2/token/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: DISCORD_APP_ID, client_secret: env.DISCORD_CLIENT_SECRET, token: tokenBody.access_token }),
  }).catch(() => null);
  if (!meRes.ok) return json({ error: "Couldn't read your Discord account. Try again." }, 502);
  const d = await meRes.json();
  if (!/^\d{5,25}$/.test(String(d.id || ""))) return json({ error: "Couldn't read your Discord account. Try again." }, 502);
  const other = await env.DB.prepare("SELECT user_id FROM user_discord WHERE discord_id = ? AND user_id != ?").bind(d.id, user.id).first();
  if (other) return json({ error: "That Discord account is already linked to another trainer." }, 409);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO user_discord (user_id, discord_id, username, global_name, avatar, shown, linked_at) VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET discord_id = excluded.discord_id, username = excluded.username,
       global_name = excluded.global_name, avatar = excluded.avatar, linked_at = excluded.linked_at`
  )
    .bind(user.id, d.id, String(d.username || "").slice(0, 40), d.global_name ? String(d.global_name).slice(0, 40) : null, d.avatar || null, now)
    .run();
  await logEvent(env, request, user.id, "discord_linked");
  const row = await env.DB.prepare("SELECT * FROM user_discord WHERE user_id = ?").bind(user.id).first();
  return json({ ok: true, discord: { ...discordFields(row), linkedAt: now } });
}
