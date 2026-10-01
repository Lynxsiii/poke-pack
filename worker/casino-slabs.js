import { CASINO_DDL, JACKPOT_DDL, SLABS_COLUMNS, SLABS_DDL } from './casino-ddl.js';
import { ensureGradingSchema } from './grading.js';

/* Graded slabs in the casino (migration 0021). Applied by the Worker itself, like
   every casino schema, because nobody can run remote migrations. The upgrade
   has three parts, each safe to repeat and safe on the live database:
     1. the coinflip and jackpot tables exist (their own IF NOT EXISTS DDL);
     2. the new columns (graded_cards.locked, coinflips.host_slabs / guest_slabs,
        jackpot_entries.slabs) are added only when `PRAGMA table_info` lacks them,
        and a "duplicate column" from another isolate that got there first is fine;
     3. the replaced and new triggers go in as ONE atomic D1 batch (DROP IF EXISTS +
        CREATE), run only while `coinflip_stake_check`, `coinflip_settle_check` or
        `jackpot_entry_check` lacks the SLABS_MARKER comment. Until the batch
        commits the old triggers stay in force, and games that exist already (NULL
        slab columns) behave identically under the new ones. No row is touched. */
export const SLABS_MARKER = '/* slabs-v1 */';
const MARKED = ['coinflip_stake_check', 'coinflip_settle_check', 'jackpot_entry_check'];
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

export async function slabTriggersCurrent(env) {
  const rows = (await env.DB.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN (${MARKED.map(() => '?').join(',')})`)
    .bind(...MARKED).all()).results || [];
  return MARKED.every(name => String(rows.find(row => row.name === name)?.sql || '').includes(SLABS_MARKER));
}

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
