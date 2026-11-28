/**
 * Earned shiny profile pictures (the rules are in js/shiny.js).
 *
 *   GET  /api/me/shinies            what the player has unlocked, and the mastered sets that still owe a pick
 *   GET  /api/me/shinies?set=<id>   the Pokémon a mastered set's pick can be spent on
 *   POST /api/me/shinies/pick       { setId, species } spends that set's one pick, for good
 *
 * A Black Label unlock is written down the first time it is seen (on any page
 * load), so it stays after the slab is sold, cracked or lost in the casino.
 */
import { ALL_SETS } from "../js/catalog.js";
import { avatarSpecies, cardSpecies, speciesInCards } from "../js/shiny.js";
import { avatarShiny } from "../js/cosmetics.js";
import { masterySetIds } from "./social.js";

// Mirrors worker/migrations/0041_shiny_unlocks.sql.
const DDL = [
  `CREATE TABLE IF NOT EXISTS shiny_unlocks (
    user_id TEXT NOT NULL,
    species INTEGER NOT NULL,
    source TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, species)
  )`,
  `CREATE TABLE IF NOT EXISTS shiny_picks (
    user_id TEXT NOT NULL,
    set_id TEXT NOT NULL,
    species INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (user_id, set_id)
  )`,
];
let ready = null;
export function ensureShinySchema(env) {
  if (!ready) {
    ready = env.DB.batch(DDL.map((sql) => env.DB.prepare(sql))).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

const parse = (text) => {
  try {
    const value = JSON.parse(text || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

/**
 * Writes down every Pokémon the player has a Black Label of and has not been credited for yet.
 * Also run on every /api/me, so a Black Label counts from the next page load, before it can be staked and lost.
 * Costs one read when there is nothing new.
 */
export async function creditBlackLabels(env, request, userId, deps) {
  await ensureShinySchema(env);
  let rows = [];
  try {
    rows =
      (
        await env.DB.prepare(
          `SELECT DISTINCT card_id FROM graded_cards WHERE user_id = ?1 AND black_label = 1
           AND ('bl:' || card_id) NOT IN (SELECT source FROM shiny_unlocks WHERE user_id = ?1)`
        )
          .bind(userId)
          .all()
      ).results || [];
  } catch {
    return; // no grading table yet: nobody has a Black Label
  }
  if (!rows.length) return;
  const have = new Set(((await env.DB.prepare("SELECT species FROM shiny_unlocks WHERE user_id = ?").bind(userId).all()).results || []).map((row) => Number(row.species)));
  const now = Date.now();
  const writes = [];
  for (const row of rows) {
    const card = await deps.findCatalogCard(env, request, String(row.card_id)).catch(() => null);
    for (const species of cardSpecies(card?.name)) {
      if (have.has(species)) continue;
      have.add(species);
      writes.push(
        env.DB.prepare("INSERT OR IGNORE INTO shiny_unlocks (user_id, species, source, at) VALUES (?, ?, ?, ?)").bind(userId, species, `bl:${row.card_id}`, now)
      );
    }
  }
  if (writes.length) await env.DB.batch(writes);
}

/** Pokédex numbers whose shiny this player may wear. */
export async function shinyUnlocks(env, request, userId, deps) {
  await ensureShinySchema(env);
  await creditBlackLabels(env, request, userId, deps);
  const rows = (await env.DB.prepare("SELECT species, source FROM shiny_unlocks WHERE user_id = ? ORDER BY at, species").bind(userId).all()).results || [];
  return rows.map((row) => ({ species: Number(row.species), source: String(row.source) }));
}

/** null when the player may wear this picture in this style, otherwise the refusal. Plain styles always pass. */
export async function shinyError(env, request, userId, avatar, style, deps) {
  if (!avatarShiny(style)) return null;
  const species = avatarSpecies(avatar);
  const have = await shinyUnlocks(env, request, userId, deps);
  if (species && have.some((row) => row.species === species)) return null;
  return { status: 403, error: "That shiny is locked. Get a Black Label of that Pokémon, or master a set and pick it." };
}

async function masteredSets(env, userId) {
  const profile = await env.DB.prepare("SELECT claimed FROM profiles WHERE user_id = ?").bind(userId).first().catch(() => null);
  return masterySetIds(parse(profile?.claimed));
}

export async function handleShiny(request, env, path, method, deps) {
  if (!path.startsWith("/api/me/shinies")) return null;
  const { json, requireUser, readJson, loadSetCards } = deps;
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const userId = auth.user.id;
  const setOf = (id) => ALL_SETS.find((set) => set.id === id);

  if (path === "/api/me/shinies" && method === "GET") {
    const mastered = await masteredSets(env, userId);
    const want = new URL(request.url).searchParams.get("set");
    if (want) {
      const set = setOf(want);
      if (!set || !mastered.includes(want)) return json({ error: "Master that set first." }, 403);
      return json({ setId: want, species: speciesInCards(await loadSetCards(env, request, set)) });
    }
    const unlocked = await shinyUnlocks(env, request, userId, deps);
    const picks = (await env.DB.prepare("SELECT set_id, species FROM shiny_picks WHERE user_id = ?").bind(userId).all()).results || [];
    const spent = new Set(picks.map((row) => row.set_id));
    return json({
      unlocked,
      picks: picks.map((row) => ({ setId: row.set_id, species: Number(row.species) })),
      open: mastered.filter((id) => !spent.has(id)).map((id) => ({ id, name: setOf(id)?.name || id })),
    });
  }

  if (path === "/api/me/shinies/pick" && method === "POST") {
    const body = (await readJson(request)) || {};
    const setId = String(body.setId || "");
    const species = Number(body.species) | 0;
    const set = setOf(setId);
    if (!set || !(await masteredSets(env, userId)).includes(setId)) return json({ error: "Master that set first." }, 403);
    if (!speciesInCards(await loadSetCards(env, request, set)).includes(species)) {
      return json({ error: "That Pokémon is not in this set." }, 400);
    }
    const have = await shinyUnlocks(env, request, userId, deps);
    if (have.some((row) => row.species === species)) return json({ error: "You already have that shiny. Pick another." }, 409);
    const now = Date.now();
    // The pick row is the lock: one per set, so a double tap or a replay cannot spend it twice.
    const res = await env.DB.prepare("INSERT OR IGNORE INTO shiny_picks (user_id, set_id, species, at) VALUES (?, ?, ?, ?)").bind(userId, setId, species, now).run();
    if (!res.meta?.changes) return json({ error: "That set's shiny pick is already used." }, 409);
    await env.DB.prepare("INSERT OR IGNORE INTO shiny_unlocks (user_id, species, source, at) VALUES (?, ?, ?, ?)").bind(userId, species, `set:${setId}`, now).run();
    return json({ ok: true, species, setId });
  }
  return json({ error: "Not found." }, 404);
}
