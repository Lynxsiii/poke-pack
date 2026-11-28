/* Provably fair seeds (js/fair.js holds the scheme and the draws; this file keeps the seeds).

   Each player has one active seed pair: a secret server seed (shown only as its hash), the next server seed (also shown
   only as a hash, so a player can see it was fixed before they rotate), their client seed and the nonce of the next bet.
   Every house game (Upgrader, Tall Grass, Mystery Tins, a coinflip against a bot, opening packs and boxes) takes the next
   nonce of that pair and logs a row in fair_rolls. Rotating reveals the old server seed, moves the next one in, makes a
   new next one, and resets the nonce to 0.

   Games between players use one seed per game (fair_games), shown hashed from the moment
   the game opens and revealed once it is over.

   Tables are made at runtime (no migration) and only ever added to. */
import { fairStream, hashSeed, newServerSeed, newClientSeed, cleanClientSeed, gameClientSeed } from '../js/fair.js';

export const FAIR_DDL = [
  `CREATE TABLE IF NOT EXISTS fair_seeds (user_id TEXT PRIMARY KEY, server_seed TEXT NOT NULL, server_hash TEXT NOT NULL,
    next_seed TEXT NOT NULL, next_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS fair_seed_history (user_id TEXT NOT NULL, server_seed TEXT NOT NULL, server_hash TEXT NOT NULL,
    client_seed TEXT NOT NULL, nonces INTEGER NOT NULL, created_at INTEGER NOT NULL, retired_at INTEGER NOT NULL, PRIMARY KEY (user_id, server_hash))`,
  `CREATE TABLE IF NOT EXISTS fair_rolls (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, game TEXT NOT NULL, ref TEXT,
    server_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce INTEGER NOT NULL, params TEXT, result TEXT, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS fair_rolls_user ON fair_rolls (user_id, id)',
  'CREATE INDEX IF NOT EXISTS fair_rolls_ref ON fair_rolls (game, ref)',
  `CREATE TABLE IF NOT EXISTS fair_games (kind TEXT NOT NULL, game_id TEXT NOT NULL, server_seed TEXT NOT NULL, server_hash TEXT NOT NULL,
    client_seed TEXT, params TEXT, result TEXT, done INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, done_at INTEGER, PRIMARY KEY (kind, game_id))`,
];

let ready = false;
export const resetFairSchemaCache = () => { ready = false; };
export async function ensureFairSchema(env) {
  if (ready) return;
  await env.DB.batch(FAIR_DDL.map((sql) => env.DB.prepare(sql)));
  ready = true;
}

/** Make the player's first seed pair if they have none. An isolate that made the tables in another database (tests,
    a restored database) finds them missing here and makes them again. */
async function ensurePair(env, userId) {
  await ensureFairSchema(env);
  const seed = newServerSeed();
  const next = newServerSeed();
  const insert = () => env.DB.prepare(`INSERT OR IGNORE INTO fair_seeds (user_id, server_seed, server_hash, next_seed, next_hash, client_seed, nonce, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)`).bind(userId, seed, hashSeed(seed), next, hashSeed(next), newClientSeed(), Date.now()).run();
  try {
    await insert();
  } catch (err) {
    if (!/no such table/i.test(String(err?.message || err))) throw err;
    ready = false;
    await ensureFairSchema(env);
    await insert();
  }
}

/** The player's active client seed (made on first use), for games between players. */
export async function clientSeedOf(env, userId) {
  if (!userId) return 'bot';
  await ensurePair(env, userId);
  const row = await env.DB.prepare('SELECT client_seed FROM fair_seeds WHERE user_id = ?').bind(userId).first();
  return row?.client_seed || '';
}

/**
 * Take the next nonce of the player's pair for one bet. Returns `{ stream, serverHash, clientSeed, nonce, log }`:
 * draw the bet's numbers from `stream`, then put `log(game, ref, params, result)` (a statement) in the bet's batch.
 * A bet that is then refused (not enough coins) leaves a gap in the nonces; nothing is learned from it.
 */
export async function takeRoll(env, userId) {
  await ensurePair(env, userId);
  const row = await env.DB.prepare(`UPDATE fair_seeds SET nonce = nonce + 1 WHERE user_id = ?
    RETURNING server_seed, server_hash, client_seed, nonce - 1 AS nonce`).bind(userId).first();
  if (!row) throw new Error('No seed pair.');
  const stream = fairStream(row.server_seed, row.client_seed, row.nonce);
  // `guard` ({ sql, args }) is a condition the log row needs, such as the bet's own row existing in the same batch.
  const log = (game, ref, params, result, now = Date.now(), guard = null) =>
    env.DB.prepare(`INSERT INTO fair_rolls (user_id, game, ref, server_hash, client_seed, nonce, params, result, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard ? `(${guard.sql})` : '1'}`).bind(userId, game, ref == null ? null : String(ref), row.server_hash, row.client_seed, row.nonce,
      params == null ? null : JSON.stringify(params), result == null ? null : JSON.stringify(result), now, ...(guard?.args || []));
  return { stream, serverHash: row.server_hash, clientSeed: row.client_seed, nonce: row.nonce, log };
}

/** True while the player has a Tall Grass patch open: its board is already drawn, so the seed can't be revealed yet. */
async function openRun(env, userId) {
  try {
    const row = await env.DB.prepare("SELECT 1 FROM beta_runs WHERE user_id = ? AND state = 'open' LIMIT 1").bind(userId).first();
    return Boolean(row);
  } catch {
    return false; // no beta table yet
  }
}

/** Rotate: reveal the active server seed, move the next one in, make a new next one, set the client seed, nonce 0. */
export async function rotatePair(env, userId, clientSeed) {
  await ensurePair(env, userId);
  if (await openRun(env, userId)) {
    const err = new Error('Finish your Tall Grass patch first. Its board comes from this seed.');
    err.status = 409;
    throw err;
  }
  const cur = await env.DB.prepare('SELECT * FROM fair_seeds WHERE user_id = ?').bind(userId).first();
  const fresh = newServerSeed();
  const now = Date.now();
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO fair_seed_history (user_id, server_seed, server_hash, client_seed, nonces, created_at, retired_at)
      SELECT user_id, server_seed, server_hash, client_seed, nonce, created_at, ? FROM fair_seeds WHERE user_id = ? AND server_hash = ?`)
      .bind(now, userId, cur.server_hash),
    env.DB.prepare(`UPDATE fair_seeds SET server_seed = next_seed, server_hash = next_hash, next_seed = ?, next_hash = ?, client_seed = ?,
      nonce = 0, created_at = ? WHERE user_id = ? AND server_hash = ?`)
      .bind(fresh, hashSeed(fresh), clientSeed, now, userId, cur.server_hash),
  ]);
  if (!res[1]?.meta?.changes) {
    const err = new Error('Your seed just changed. Try again.');
    err.status = 409;
    throw err;
  }
  return { serverSeed: cur.server_seed, serverHash: cur.server_hash, clientSeed: cur.client_seed, nonces: cur.nonce };
}

// ---- Games with their own seed ---------------------------------------------------------------------------------------
/** The seed of one game between players, made (and so fixed) the first time it is asked for. */
export async function gameSeed(env, kind, gameId) {
  await ensureFairSchema(env);
  await env.DB.prepare('SELECT 1 FROM fair_games LIMIT 1').first().catch(async () => { ready = false; await ensureFairSchema(env); });
  const seed = newServerSeed();
  await env.DB.prepare(`INSERT OR IGNORE INTO fair_games (kind, game_id, server_seed, server_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(kind, String(gameId), seed, hashSeed(seed), Date.now()).run();
  return env.DB.prepare('SELECT * FROM fair_games WHERE kind = ? AND game_id = ?').bind(kind, String(gameId)).first();
}

/**
 * The draw of a game between players: `{ stream, clientSeed, finish }`. `seeds` are the seats' client seeds in seat order.
 * `finish(params, result, landedSql, landedArgs)` is a statement for the game's batch that records the inputs and reveals the
 * seed, guarded by `landedSql` (an EXISTS check that the game's own result landed).
 */
export async function gameRoll(env, kind, gameId, seeds) {
  const row = await gameSeed(env, kind, gameId);
  const clientSeed = gameClientSeed(gameId, seeds);
  const stream = fairStream(row.server_seed, clientSeed, 0);
  const finish = (params, result, landedSql = '1', landedArgs = [], now = Date.now()) =>
    env.DB.prepare(`UPDATE fair_games SET client_seed = ?, params = ?, result = ?, done = 1, done_at = ?
      WHERE kind = ? AND game_id = ? AND done = 0 AND (${landedSql})`)
      .bind(clientSeed, params == null ? null : JSON.stringify(params), result == null ? null : JSON.stringify(result), now, kind, String(gameId), ...landedArgs);
  return { stream, clientSeed, serverHash: row.server_hash, finish };
}

/** Mark a game's seed done without a guard (a shared round, once it is over). */
export const revealGame = (env, kind, gameId, clientSeed, result, now = Date.now()) =>
  env.DB.prepare(`UPDATE fair_games SET client_seed = ?, result = ?, done = 1, done_at = ? WHERE kind = ? AND game_id = ? AND done = 0`)
    .bind(clientSeed, result == null ? null : JSON.stringify(result), now, kind, String(gameId));

const parse = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };

/** One game's seed as anyone may see it: the hash always, the seed itself once the game is over. */
export function publicGame(row) {
  if (!row) return null;
  return { kind: row.kind, id: row.game_id, serverHash: row.server_hash, serverSeed: row.done ? row.server_seed : null,
    clientSeed: row.done ? row.client_seed : null, nonce: 0, params: row.done ? parse(row.params) : null, result: row.done ? parse(row.result) : null,
    done: Boolean(row.done), createdAt: row.created_at, doneAt: row.done_at };
}

/**
 * What a game page shows about one game's fairness: its own seed (a game between players), or the
 * seed pair and nonce of the house bet it was (a flip against a bot, an upgrade). Null when there is none (an old game).
 */
export async function fairOf(env, kind, id, rollGame = kind) {
  try {
    await ensureFairSchema(env);
    const game = await env.DB.prepare('SELECT * FROM fair_games WHERE kind = ? AND game_id = ?').bind(kind, String(id)).first();
    if (game) return publicGame(game);
    const r = await env.DB.prepare(`SELECT r.*, h.server_seed FROM fair_rolls r LEFT JOIN fair_seed_history h ON h.user_id = r.user_id AND h.server_hash = r.server_hash
      WHERE r.game = ? AND r.ref = ? LIMIT 1`).bind(rollGame, String(id)).first();
    if (!r) return null;
    return { kind: rollGame, id: String(id), house: true, serverHash: r.server_hash, serverSeed: r.server_seed || null, clientSeed: r.client_seed,
      nonce: r.nonce, params: parse(r.params), result: parse(r.result), done: true };
  } catch (err) {
    console.error('fairOf', err);
    return null;
  }
}

// ---- The API ------------------------------------------------------------------------------------------------------
async function view(env, userId) {
  await ensurePair(env, userId);
  const pair = await env.DB.prepare('SELECT server_hash, next_hash, client_seed, nonce, created_at FROM fair_seeds WHERE user_id = ?').bind(userId).first();
  const history = (await env.DB.prepare(`SELECT server_seed, server_hash, client_seed, nonces, created_at, retired_at FROM fair_seed_history
    WHERE user_id = ? ORDER BY retired_at DESC LIMIT 20`).bind(userId).all()).results || [];
  const rolls = (await env.DB.prepare(`SELECT r.id, r.game, r.ref, r.server_hash, r.client_seed, r.nonce, r.params, r.result, r.created_at, h.server_seed
    FROM fair_rolls r LEFT JOIN fair_seed_history h ON h.user_id = r.user_id AND h.server_hash = r.server_hash
    WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 40`).bind(userId).all()).results || [];
  return {
    seed: { serverHash: pair.server_hash, nextHash: pair.next_hash, clientSeed: pair.client_seed, nonce: pair.nonce, createdAt: pair.created_at },
    history: history.map((h) => ({ serverSeed: h.server_seed, serverHash: h.server_hash, clientSeed: h.client_seed, nonces: h.nonces,
      createdAt: h.created_at, retiredAt: h.retired_at })),
    rolls: rolls.map((r) => ({ id: r.id, game: r.game, ref: r.ref, serverHash: r.server_hash, serverSeed: r.server_seed || null,
      clientSeed: r.client_seed, nonce: r.nonce, params: parse(r.params), result: parse(r.result), createdAt: r.created_at })),
    serverNow: Date.now(),
  };
}

const GAME_KINDS = new Set(['coinflip', 'jackpot', 'battle']);

export async function handleFair(path, method, request, env, helpers) {
  const { json, requireUser, readJson } = helpers;
  try {
    await ensureFairSchema(env);
    const game = path.match(/^\/api\/fair\/game\/([a-z]+)\/([a-zA-Z0-9-]{1,80})$/);
    if (game && method === 'GET') {
      if (!GAME_KINDS.has(game[1])) return json({ error: 'Unknown game.' }, 404);
      const row = await env.DB.prepare('SELECT * FROM fair_games WHERE kind = ? AND game_id = ?').bind(game[1], game[2]).first();
      if (!row) return json({ error: 'No seed for that game.' }, 404);
      return json({ game: publicGame(row) });
    }
    const auth = await requireUser(request, env);
    if (auth.response) return auth.response;
    const userId = auth.user.id;
    if (path === '/api/fair' && method === 'GET') return json(await view(env, userId));
    if (path === '/api/fair/rotate' && method === 'POST') {
      const body = (await readJson(request)) || {};
      const wanted = body.clientSeed == null || body.clientSeed === '' ? newClientSeed() : cleanClientSeed(body.clientSeed);
      if (!wanted) return json({ error: 'A client seed is 1 to 64 letters, numbers or symbols, with no spaces.' }, 400);
      const revealed = await rotatePair(env, userId, wanted);
      return json({ ...(await view(env, userId)), revealed });
    }
    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    if (err?.status) return json({ error: err.message }, err.status);
    throw err;
  }
}
