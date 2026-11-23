/**
 * Recovery codes: the forgotten-password path for accounts that have no email.
 *
 * A signed-in trainer makes a code (POST /api/me/recovery). It is shown once and
 * only its hash is kept, so making a new one replaces the old. With the handle,
 * the code and a new password (POST /api/auth/recover) the password is reset,
 * every other session is signed out, the code is spent, and the browser is
 * signed in. A code is 16 characters from a 32-letter alphabet (80 bits), so it
 * can't be guessed; a wrong one says so without saying whether the handle exists.
 *
 * The table is made on demand (no remote migrations from a session);
 * worker/terms.js PERSONAL_TABLES deletes it with the account.
 */

const DDL =
  "CREATE TABLE IF NOT EXISTS recovery_codes (user_id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, created_at INTEGER NOT NULL)";
// Crockford base32: no I, L, O or U, so a code read off a screenshot can't be misread.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const WRONG = "That handle and recovery code don't match.";

let ready = false;
async function ensureTable(env) {
  if (ready) return;
  await env.DB.exec(`${DDL};`);
  ready = true;
}

export function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ALPHABET[b & 31]).join("");
  return chars.match(/.{4}/g).join("-");
}

/** Upper-case, the look-alike letters mapped back, dashes and spaces dropped. */
export function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .slice(0, 32);
}

export async function hasRecoveryCode(env, userId) {
  try {
    await ensureTable(env);
    const row = await env.DB.prepare("SELECT created_at FROM recovery_codes WHERE user_id = ?").bind(userId).first();
    return row ? Number(row.created_at) : 0;
  } catch {
    return 0;
  }
}

/** POST /api/me/recovery: a new code for the signed-in trainer, shown once. */
export async function makeRecoveryCode(request, env, { json, requireUser, hashPassword }) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  await ensureTable(env);
  const code = newRecoveryCode();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at"
  )
    .bind(auth.user.id, await hashPassword(normalizeCode(code)), now)
    .run();
  return json({ code, createdAt: now });
}

/** POST /api/auth/recover {handle, code, password}: reset the password with a recovery code. */
export async function recoverAccount(request, env, deps) {
  const { json, readJson, normalizeHandle, hashPassword, verifyPassword, createSession, sessionCookie, loadSave, trainerUser } = deps;
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);
  const handle = normalizeHandle(body.handle);
  const code = normalizeCode(body.code);
  const password = String(body.password || "");
  if (password.length < 6 || password.length > 64) return json({ error: "Password needs 6–64 characters." }, 400);
  if (handle.length < 3 || code.length !== 16) return json({ error: WRONG }, 401);
  await ensureTable(env);
  const user = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  const row = user
    ? await env.DB.prepare("SELECT code_hash FROM recovery_codes WHERE user_id = ?").bind(user.id).first()
    : null;
  if (!user || !row || !(await verifyPassword(code, row.code_hash))) return json({ error: WRONG }, 401);

  const now = Date.now();
  await env.DB.batch([
    // Spend the code first: a second request with the same code finds nothing to delete and changes nothing.
    env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ? AND code_hash = ?").bind(user.id, row.code_hash),
    env.DB.prepare("UPDATE users SET password_hash = ?, last_played = ? WHERE id = ? AND changes() = 1").bind(
      await hashPassword(password),
      now,
      user.id
    ),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND (SELECT changes()) = 1").bind(user.id),
  ]);
  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  if (fresh.password_hash === user.password_hash) return json({ error: WRONG }, 401);
  const token = await createSession(env, user.id, now);
  const save = await loadSave(env, user.id);
  return json({ user: await trainerUser(env, fresh, save), save }, 200, sessionCookie(request, token));
}
