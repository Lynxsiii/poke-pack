/**
 * Terms, age and account deletion (the legal pages are js/legal-page.js).
 *
 * Signup asks for a birth month and year, the neutral age screen the US FTC
 * describes for COPPA: nothing hints at the "right" answer. Under 13 gets no
 * account and nothing is stored. Only "YYYY-MM" is kept, so the casino can
 * tell an 18 year old from a 17 year old as players grow up.
 *
 * Accounts made before 2026-10-09 never saw any of this, so the site asks them
 * once (POST /api/me/terms). A trainer who says they are under 13 there is
 * deleted the same way the Delete account button deletes, after the page has
 * asked them to confirm.
 */

export const TERMS_VERSION = "2026-10-09";
export const MIN_AGE = 13;
export const CASINO_AGE = 18;

let schemaReady = false;
let schemaWork = null;

const USER_COLUMNS = [
  ["born", "ALTER TABLE users ADD COLUMN born TEXT"],
  ["terms_version", "ALTER TABLE users ADD COLUMN terms_version TEXT"],
  ["terms_at", "ALTER TABLE users ADD COLUMN terms_at INTEGER"],
];

export async function ensureTermsSchema(env) {
  if (schemaReady) return true;
  if (!schemaWork) {
    schemaWork = (async () => {
      try {
        const info = await env.DB.prepare("PRAGMA table_info(users)").all();
        const have = new Set((info.results || []).map((row) => row.name));
        for (const [name, sql] of USER_COLUMNS) {
          if (have.has(name)) continue;
          try {
            await env.DB.exec(`${sql};`);
          } catch (err) {
            if (!/duplicate column/i.test(String(err?.message || err))) throw err;
          }
        }
        schemaReady = true;
        return true;
      } catch (err) {
        console.error("ensureTermsSchema", err);
        return false;
      } finally {
        schemaWork = null;
      }
    })();
  }
  return schemaWork;
}

/** Whole years between a "YYYY-MM" birth month and now; null when unknown. */
export function ageOf(born, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(born || ""));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const at = new Date(now);
  let age = at.getUTCFullYear() - year;
  // Born this month counts as having had the birthday: day of birth is never asked.
  if (at.getUTCMonth() + 1 < month) age -= 1;
  return age;
}

/**
 * Reads { birthYear, birthMonth, agree } from a signup or terms body.
 * Returns { born, age } or { error, status, underage? }.
 */
export function readAgeAndAgreement(body, now = Date.now()) {
  const year = Math.floor(Number(body?.birthYear));
  const month = Math.floor(Number(body?.birthMonth));
  const thisYear = new Date(now).getUTCFullYear();
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12 || year < thisYear - 120 || year > thisYear) {
    return { error: "Pick your birth month and year.", status: 400 };
  }
  const born = `${year}-${String(month).padStart(2, "0")}`;
  const age = ageOf(born, now);
  if (age == null || age < 0) return { error: "Pick your birth month and year.", status: 400 };
  if (age < MIN_AGE) {
    return { error: "Sorry, you need to be 13 or older to make an account.", status: 403, underage: true };
  }
  if (body?.agree !== true) {
    return { error: "Tick the box to agree to the Terms and Privacy Policy.", status: 400 };
  }
  return { born, age };
}

/** What the signed-in trainer's own payload carries (never the birth month itself). */
export function termsFields(row, now = Date.now()) {
  const age = ageOf(row?.born, now);
  return {
    termsOk: row?.terms_version === TERMS_VERSION && age != null,
    adult: age != null && age >= CASINO_AGE,
  };
}

export function isAdult(row, now = Date.now()) {
  const age = ageOf(row?.born, now);
  return age != null && age >= CASINO_AGE;
}

/**
 * Rows that belong to one trainer and have no ON DELETE CASCADE in production
 * (the social tables were made by hand before foreign keys; the rest, such as
 * cards, gear, slabs and XP, cascade from users). Each table is cleared only
 * when it exists, so a fresh database never errors here. Coinflips, jackpots
 * and battles are shared with the other players in them and keep only the
 * opaque id, so they stay.
 */
const PERSONAL_TABLES = [
  ["chat_messages", "user_id"],
  ["chat_messages_cleared", "user_id"],
  ["dms", "from_id"],
  ["dms", "to_id"],
  ["friends", "from_id"],
  ["friends", "to_id"],
  ["profile_comments", "author_id"],
  ["profile_comments", "profile_id"],
  ["presence", "user_id"],
  ["discord_feed", "user_id"],
  ["coin_restores", "user_id"],
  ["upgrades", "user_id"],
  ["casino_sales", "user_id"],
];

export async function personalDataStmts(env, userId) {
  const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const tables = new Set((rows.results || []).map((row) => row.name));
  const out = [];
  for (const [table, column] of PERSONAL_TABLES) {
    if (!tables.has(table)) continue;
    const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    if (!(info.results || []).some((col) => col.name === column)) continue;
    out.push(env.DB.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).bind(userId));
  }
  return out;
}
