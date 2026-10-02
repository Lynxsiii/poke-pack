import { CASINO_DDL, JACKPOT_DDL, SLABS_COLUMNS, SLABS_DDL, BOT_SLABS_DDL, BOT_BL_DDL, BOT_V4_DDL } from './casino-ddl.js';
import { ensureGradingSchema } from './grading.js';

/* Graded slabs in the casino (migration 0022). Applied by the Worker itself, like
   every casino schema, because nobody can run remote migrations. The upgrade
   has three parts, each safe to repeat and safe on the live database:
     1. the coinflip and jackpot tables exist (their own IF NOT EXISTS DDL);
     2. the new columns (graded_cards.locked, coinflips.host_slabs / guest_slabs,
        jackpot_entries.slabs) are added only when `PRAGMA table_info` lacks them,
        and a "duplicate column" from another isolate that got there first is fine;
     3. the replaced and new triggers go in as ONE atomic D1 batch (DROP IF EXISTS +
        CREATE), run only while one of the triggers named in SLABS_REQUIRED is missing
        or lacks the slab code (the comment marker is documentation only). Until the batch
        commits the old triggers stay in force, and games that exist already (NULL
        slab columns) behave identically under the new ones. No row is touched.
   slabs-v2 (migration 0027, BOT_SLABS_DDL) is a fourth part: a second atomic batch replaces
   five triggers while any of SLABS_V2_REQUIRED lacks its v2 code. It always runs after
   part 3, so a v1 database (the live one) goes v1 -> v2 in place, and a v2 database is
   never taken back to v1. slabs-v3 (migration 0030, BOT_BL_DDL) is a fifth part: a third atomic batch replaces the two
   mint triggers so a bot's Black Label (snapshot `bl`) is minted as one, while any trigger lacks the black_label code.
   slabs-v4 (migration 0032, BOT_V4_DDL) is a sixth part: a bot may carry 20 slabs (a human 10), three triggers replaced in one atomic
   batch while any lacks the v4 code. v4 always runs after v3 (a v2 or v1 database goes through every part in order). */
export const SLABS_MARKER = '/* slabs-v1 */';
// What the current version of each trigger must contain as real SQL (never a comment: a path that strips comments
// would otherwise re-run the upgrade on every cold isolate), and the triggers that must exist at all.
export const SLABS_REQUIRED = {
  coinflip_stake_check: /host_slabs/,
  coinflip_settle_check: /'coinflip:'\s*\|\|\s*OLD\.id/,
  jackpot_settle_check: /'jackpot:'\s*\|\|\s*OLD\.id/,
  jackpot_entry_check: /NEW\.slabs/,
  graded_slab_escrow: /OLD\.locked/,
  graded_slab_escrow_delete: /OLD\.locked/,
};
// slabs-v2 (migration 0027: bots stake generated slabs and a human winner is minted them). Five triggers are replaced; v2 SQL
// is told from v1 by code that only v2 has (the v1 tokens above still hold in v2, so a v2 database is never taken back to v1).
export const SLABS_V2_REQUIRED = {
  coinflip_settle_check: /\$\.band/,
  coinflip_slab_settle: /INSERT INTO graded_cards/,
  jackpot_entry_check: /\$\.band/,
  jackpot_settle_check: /bot = 0 THEN json_array_length/,
  jackpot_slab_settle: /INSERT INTO graded_cards/,
};
// slabs-v3 (migration 0030: bots may stake a Black Label). The two mint triggers gain the black_label column.
export const SLABS_V3_REQUIRED = {
  coinflip_slab_settle: /black_label/,
  jackpot_slab_settle: /black_label/,
};
// slabs-v4 (migration 0032: a bot carries up to 20 slabs). Three triggers; the mint trigger names a bot's slabs by seat * 100.
export const SLABS_V4_REQUIRED = {
  coinflip_settle_check: /THEN 20 ELSE 10/,
  jackpot_entry_check: /THEN 20 ELSE 10/,
  jackpot_slab_settle: /e\.seat \* 100/,
};
const objectName = sql => sql.match(/CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/)[1];

let slabsReady = false;
let slabsWork = null;
/** Tests only: forget the per-isolate cache so another database is checked. */
export const resetSlabsSchemaCache = () => { slabsReady = false; slabsWork = null; };

async function ensureBase(env, ddl) {
  const names = ddl.map(objectName);
  const rows = (await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${names.map(() => '?').join(',')})`).bind(...names).all()).results || [];
  if (rows.length < names.length) await env.DB.batch(ddl.map(sql => env.DB.prepare(sql)));
}

async function addColumns(env) {
  const have = new Map();
  for (const [table, column, sql] of SLABS_COLUMNS) {
    if (!have.has(table)) {
      const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
      have.set(table, new Set((info.results || []).map(row => row.name)));
    }
    if (have.get(table).has(column)) continue;
    try { await env.DB.prepare(sql).run(); }
    catch (err) {
      // Another isolate got there first.
      if (!/duplicate column/i.test(String(err?.message || err))) throw err;
    }
  }
}

const triggersMatch = async (env, required) => {
  const names = Object.keys(required);
  const rows = (await env.DB.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN (${names.map(() => '?').join(',')})`)
    .bind(...names).all()).results || [];
  return names.every(name => required[name].test(String(rows.find(row => row.name === name)?.sql || '')));
};
/** slabs-v1 (migration 0022) is in: the slab triggers exist and carry its code. */
export const slabTriggersCurrent = env => triggersMatch(env, SLABS_REQUIRED);
/** slabs-v2 (migration 0027) is in. */
export const botSlabTriggersCurrent = env => triggersMatch(env, SLABS_V2_REQUIRED);
/** slabs-v3 (migration 0030) is in. */
export const botBlackLabelTriggersCurrent = env => triggersMatch(env, SLABS_V3_REQUIRED);
/** slabs-v4 (migration 0032) is in. */
export const botSlabCapTriggersCurrent = env => triggersMatch(env, SLABS_V4_REQUIRED);

/**
 * Bring the casino to the slab-aware schema (see the header). Requests that
 * arrive together share one upgrade; the work is a few reads once the database is current.
 */
export async function ensureSlabsSchema(env) {
  if (slabsReady) return;
  if (!slabsWork) {
    slabsWork = (async () => {
      try {
        await ensureGradingSchema(env); // graded_cards (and its own `locked` column) before anything refers to it
        await ensureBase(env, CASINO_DDL);
        await ensureBase(env, JACKPOT_DDL);
        await addColumns(env);
        if (!await slabTriggersCurrent(env)) await env.DB.batch(SLABS_DDL.map(sql => env.DB.prepare(sql)));
        // v1 -> v2 -> v3 -> v4 in ONE atomic batch (a live database is already at some version; a new one passes through them all): each
        // version replaces triggers the next one also touches, so a database that needs one gets every later one too. graded_cards.black_label
        // exists (ensureGradingSchema ran first).
        let batch = null;
        if (!await botSlabTriggersCurrent(env)) batch = [...BOT_SLABS_DDL, ...BOT_BL_DDL, ...BOT_V4_DDL];
        else if (!await botBlackLabelTriggersCurrent(env)) batch = [...BOT_BL_DDL, ...BOT_V4_DDL];
        else if (!await botSlabCapTriggersCurrent(env)) batch = BOT_V4_DDL;
        if (batch) await env.DB.batch(batch.map(sql => env.DB.prepare(sql)));
        slabsReady = true;
      } catch (err) {
        console.error('ensureSlabsSchema', err);
        throw err;
      } finally {
        slabsWork = null;
      }
    })();
  }
  return slabsWork;
}
