/**
 * Test accounts: players made by the bug-hunting agents (or anyone given the
 * tester key) to play the site end to end without showing up to real players.
 *
 * A tester is a normal account with users.tester = 1. It plays, trades and
 * battles like anyone, but it never appears in rankings, the online list, the
 * global chat or the Discord pulls feed, and it cannot post in global chat.
 *
 * An account becomes a tester only at sign-up, when the sign-up body carries
 * `testerKey` equal to the Worker secret TEST_ACCOUNT_KEY. With no secret set,
 * nobody can make one. The column is added at runtime (like worker/social.js
 * does for its columns), so there is no migration file to replay.
 */

let ready = false;

export async function ensureTesterSchema(env) {
  if (ready || !env?.DB) return;
  try {
    const info = await env.DB.prepare("PRAGMA table_info(users)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    if (!have.has("users") && !(info.results || []).length) return; // no users table yet
    if (!have.has("tester")) {
      try {
        await env.DB.exec("ALTER TABLE users ADD COLUMN tester INTEGER NOT NULL DEFAULT 0;");
      } catch (err) {
        if (!String(err?.message || err).toLowerCase().includes("duplicate")) throw err;
      }
    }
    ready = true;
  } catch (err) {
    console.error("ensureTesterSchema", err);
  }
}

/** True when a sign-up asked to be a tester with the right key. */
export function wantsTester(env, body) {
  const key = String(env?.TEST_ACCOUNT_KEY || "");
  const given = String(body?.testerKey || "");
  if (key.length < 8 || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export const isTester = (row) => Number(row?.tester) === 1;

/** SQL that keeps testers out, for a query that already joins `users` under `alias`. */
export const notTester = (alias = "users") => ` AND COALESCE(${alias}.tester, 0) = 0`;
