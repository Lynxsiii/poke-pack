/**
 * Ambient population.
 *
 * A roster of trainer accounts that hold presence, rip packs on a human
 * cadence, and now and then say something in the lounge. They are real rows
 * in `users`, and every action goes back through handleApi() — the same path
 * a browser takes — so their coins, collections, and titles are earned the
 * way a player's are. Nothing here can mint state the API would refuse.
 *
 * Deliberately one-way: they broadcast, they never answer. No DMs, no friend
 * responses, no profile comments. A room that looks busy is set dressing; an
 * account that answers a person who thinks they made a friend is not.
 *
 * Off entirely unless `BOT_SECRET` is bound, so dev and preview environments
 * never quietly grow a population.
 */
import { PLAYABLE_SETS, sellValue } from "../js/catalog.js";
import { isHit } from "../js/engine.js";
import { SHOWCASE_MAX } from "../js/cosmetics.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const SESSION_MIN_MS = 8 * MINUTE;
const SESSION_MAX_MS = 52 * MINUTE;
const AWAY_MIN_MS = 40 * MINUTE;
const AWAY_MAX_MS = 7 * HOUR;
// How long a bot waits after deciding not to come online. Short enough that
// the roster fills within an evening rather than trickling in over a day; the
// stagger that keeps them from arriving in a clump comes from AWAY_MIN/MAX
// once they have had a first session.
const RETRY_MS = 5 * MINUTE;
// First wake after signup. This used to spread over 90 minutes, which meant a
// freshly seeded roster left the lounge empty for most of an hour — exactly
// when someone turning it on is looking at it.
const FIRST_WAKE_MS = 12 * MINUTE;

const WAKE_CHANCE = 0.35;
const CHAT_CHANCE = 0.12;
const HIT_CHAT_CHANCE = 0.45;
// Rip odds scale with the balance: RIP_FLOOR once a bot can afford one pack,
// climbing RIP_PER_PACK for every further pack it could cover, capped at
// RIP_CEIL. A full hourly stack lands at the cap.
const RIP_FLOOR = 0.15;
const RIP_CEIL = 0.75;
const RIP_PER_PACK = 0.05;
const TITLE_CHANCE = 0.02;
const CHAT_GAP_MS = 24 * MINUTE;
const LOW_COINS = 20;
const MAX_ONLINE = 6;
const MAX_NEW_PER_TICK = 2;

/**
 * The sets bots are allowed to open. Scarlet & Violet (sv5 through sv10) is
 * left out on purpose — that data and its art are slated for a rebuild, and a
 * bot's binder and showcase are public surfaces. Widen this once those sets
 * are redone.
 */
const BOT_SETS = ["me5", "me4", "me3", "me2pt5", "me2", "me1", "zsv10pt5", "rsv10pt5"];

/**
 * Each persona keeps its own waking hours (UTC, wrapping past midnight) so the
 * online list thins out and refills over a day instead of sitting at a flat
 * count. `sets` biases what they open; `titles` are the ones they will try to
 * wear as they unlock, best first.
 */
const ROSTER = [
  { name: "Riley", handle: "rileyxo", color: "aqua", avatar: "134", banner: "drift:aqua+ocean", bio: "eeveelutions or nothing", hours: [22, 7], sets: ["me5", "me3"], titles: ["Gym Leader", "Binder rat", "Ripper"] },
  { name: "Marcus", handle: "mrcs_tcg", color: "ember", avatar: "6", banner: "beam:ember+flame", bio: "opening until the charizard shows up", hours: [13, 23], sets: ["me2", "me1"], titles: ["Century", "Hit hunter", "Trainer"] },
  { name: "Tess", handle: "tessellate", color: "violet", avatar: "150", banner: "pulse:violet+ghost", bio: "", hours: [16, 2], sets: ["me4", "me5"], titles: ["Living dex", "Collector"] },
  { name: "Dez", handle: "dezzy", color: "lime", avatar: "1", banner: "mist:lime+forest", bio: "grass types deserve better", hours: [11, 20], sets: ["me1", "me3"], titles: ["Ripper", "Trainer"] },
  { name: "Nori", handle: "norinori", color: "rose", avatar: "700", banner: "aurora:rose+fairy", bio: "sylveon collector, will trade nothing", hours: [23, 8], sets: ["me5", "me2pt5"], titles: ["Special artist", "Binder rat"] },
  { name: "Quinn", handle: "quinnwaves", color: "ocean", avatar: "658", banner: "drift:ocean+ice", bio: "", hours: [14, 1], sets: ["me3", "me4"], titles: ["Marathon", "Century"] },
  { name: "Sable", handle: "sablewing", color: "night", avatar: "197", banner: "mist:night+ghost", bio: "night shift ripper", hours: [1, 10], sets: ["me5", "me4"], titles: ["Gold chaser", "Hit hunter"] },
  { name: "Ike", handle: "ike_ttv", color: "thunder", avatar: "135", banner: "beam:thunder+gold", bio: "one more pack. always one more", hours: [17, 4], sets: ["me2", "me5"], titles: ["Pull machine", "Marathon"] },
  { name: "Wren", handle: "wrenbird", color: "ice", avatar: "144", banner: "aurora:ice+aqua", bio: "", hours: [9, 18], sets: ["rsv10pt5", "me1"], titles: ["Collector", "Trainer"] },
  { name: "Otto", handle: "ottoman", color: "steel", avatar: "376", banner: "pulse:steel+dragon", bio: "metagross apologist", hours: [12, 21], sets: ["me3", "me2"], titles: ["Binder rat", "Ripper"] },
  { name: "Juno", handle: "junobean", color: "fairy", avatar: "35", banner: "aurora:fairy+rose", bio: "just here for the art", hours: [15, 0], sets: ["me4", "me2pt5"], titles: ["Illustration", "Collector"] },
  { name: "Cass", handle: "cassidy_r", color: "flame", avatar: "257", banner: "beam:flame+ember", bio: "", hours: [10, 19], sets: ["me1", "me5"], titles: ["Double rare", "Trainer"] },
  { name: "Ravi", handle: "ravioli", color: "poison", avatar: "34", banner: "drift:poison+violet", bio: "chasing the gold", hours: [18, 5], sets: ["zsv10pt5", "me5"], titles: ["Gold chaser", "Century"] },
  { name: "Bex", handle: "bexlyn", color: "gold", avatar: "25", banner: "pulse:gold+thunder", bio: "", hours: [8, 17], sets: ["me2pt5", "me3"], titles: ["Hourly", "Ripper"] },
  { name: "Milo", handle: "milohaze", color: "forest", avatar: "254", banner: "mist:forest+lime", bio: "sceptile or bust", hours: [20, 6], sets: ["me1", "me4"], titles: ["Marathon", "Ripper"] },
  { name: "Sena", handle: "senaaa", color: "ghost", avatar: "94", banner: "pulse:ghost+night", bio: "gengar hoarder", hours: [21, 7], sets: ["me5", "me2"], titles: ["Ultra", "Hit hunter"] },
  { name: "Hollis", handle: "hollisj", color: "earth", avatar: "383", banner: "beam:earth+rock", bio: "", hours: [13, 22], sets: ["rsv10pt5", "me3"], titles: ["Loaded", "Trainer"] },
  { name: "Piper", handle: "piperpip", color: "rock", avatar: "95", banner: "drift:rock+earth", bio: "onix enthusiast, no notes", hours: [11, 21], sets: ["me2", "me1"], titles: ["Collector", "Trainer"] },
  { name: "Ada", handle: "adawrites", color: "dragon", avatar: "149", banner: "aurora:dragon+ocean", bio: "", hours: [16, 3], sets: ["me4", "zsv10pt5"], titles: ["Banked", "Loaded"] },
  { name: "Toby", handle: "tobes", color: "bug", avatar: "123", banner: "mist:bug+lime", bio: "scyther supremacy", hours: [9, 19], sets: ["me3", "me1"], titles: ["Ripper", "Trainer"] },
  { name: "Vic", handle: "vicvic", color: "violet", avatar: "282", banner: "pulse:violet+fairy", bio: "gardevoir. that is the whole bio", hours: [19, 5], sets: ["me5", "me2pt5"], titles: ["Illustration", "Binder rat"] },
  { name: "Noa", handle: "noaquartz", color: "thunder", avatar: "26", banner: "beam:thunder+ember", bio: "", hours: [14, 23], sets: ["me2", "me4"], titles: ["Century", "Hit hunter"] },
  { name: "Ren", handle: "renfield", color: "night", avatar: "359", banner: "mist:night+poison", bio: "absol truther", hours: [0, 9], sets: ["me1", "me5"], titles: ["Hit hunter", "Ripper"] },
  { name: "Suki", handle: "sukisuki", color: "aqua", avatar: "131", banner: "drift:aqua+ice", bio: "", hours: [12, 20], sets: ["me3", "rsv10pt5"], titles: ["Collector", "Trainer"] },
];

/**
 * Broadcast only: nothing here addresses anyone or invites a reply.
 *
 * Nothing here asserts a fact a visitor could check either. A bot's packs
 * opened, coins, and collection are all on its public profile, so a line like
 * "finally cracked 100 packs" from an account showing nine is the thing that
 * gives the whole roster away. Anything countable goes through
 * milestoneLine(), which only fires on a number the save actually holds.
 */
const IDLE_LINES = [
  "back to the mines",
  "ok one more pack then i'm done. lying",
  "three in a row with nothing. cool",
  "hourly stack is carrying me honestly",
  "the pull rates on this set are brutal",
  "why do i always get the same rare",
  "reverse holos hit different",
  "just watched my coins evaporate",
  "someone tell me to stop opening",
  "that art is genuinely so good",
  "down bad, zero hits today",
  "at least the commons look nice",
  "saving up for a proper run later",
  "chasing one card. one.",
  "my luck is unbelievable and not in a good way",
];

const SELL_LINES = [
  "dumped some dupes, back in business",
  "selling doubles to fund the next one",
  "ok that's the dupe pile gone",
];

const BROKE_LINES = [
  "and i'm broke again",
  "out of coins, waiting on the hourly",
  "zero coins. cool cool cool",
];

/** Only ever said on a number the profile actually shows. */
const MILESTONE_PACKS = [25, 50, 100, 250, 500, 1000];

function milestoneLine(packs) {
  return pick([
    `${packs} packs deep`,
    `just hit ${packs} packs`,
    `${packs} packs and still chasing`,
  ]);
}

const HIT_LINES = [
  (name) => `${name.toLowerCase()} out of nowhere`,
  (name) => `no way. ${name.toLowerCase()}`,
  (name) => `${name.toLowerCase()} finally`,
  (name) => `ok that pack was worth it. ${name.toLowerCase()}`,
  (name) => `been chasing ${name.toLowerCase()} forever`,
];

/**
 * Worth breaking silence over. Deliberately narrower than engine.js's isHit,
 * which counts Double Rares — those land in one pack in five and nobody
 * announces them.
 */
const CHAT_WORTHY = new Set([
  "Ultra Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "Mega Hyper Rare",
  "Black White Rare",
  "Mega Attack Rare",
  "ACE SPEC Rare",
  "Shiny Ultra Rare",
]);

let schemaReady = false;

function missingSchema(err) {
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes("no such table") || msg.includes("no such column") || msg.includes("has no column");
}

async function runDdl(env, sql) {
  try {
    await env.DB.prepare(sql).run();
  } catch (err) {
    const msg = String(err?.message || err).toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("already exists")) throw err;
  }
}

async function ensureBotSchema(env) {
  if (schemaReady) return;
  try {
    const info = await env.DB.prepare("PRAGMA table_info(users)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    if (!have.has("bot")) {
      await runDdl(env, "ALTER TABLE users ADD COLUMN bot INTEGER NOT NULL DEFAULT 0");
    }
    await runDdl(
      env,
      `CREATE TABLE IF NOT EXISTS bots (
        user_id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, cookie TEXT,
        online_until INTEGER NOT NULL DEFAULT 0, next_wake INTEGER NOT NULL DEFAULT 0,
        last_chat_at INTEGER NOT NULL DEFAULT 0
      )`
    );
    await runDdl(env, "CREATE INDEX IF NOT EXISTS idx_users_bot ON users(bot)");
    const bots = await env.DB.prepare("PRAGMA table_info(bots)").all();
    const cols = new Set((bots.results || []).map((row) => row.name));
    // coins = -1 means "never read", which is what forces the first sync.
    if (!cols.has("coins")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN coins REAL NOT NULL DEFAULT -1");
    }
    if (!cols.has("last_daily")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN last_daily INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.has("showcase")) {
      await runDdl(env, "ALTER TABLE bots ADD COLUMN showcase TEXT");
    }
    schemaReady = true;
  } catch (err) {
    console.error("ensureBotSchema", err);
  }
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Waking hours wrap past midnight, so [22, 7] means the late crowd. */
function awake(persona, now) {
  const hour = new Date(now).getUTCHours();
  const [from, to] = persona.hours;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

function playableSets(persona) {
  const wanted = persona.sets.filter((id) => BOT_SETS.includes(id));
  const live = (wanted.length ? wanted : BOT_SETS).filter((id) =>
    PLAYABLE_SETS.some((set) => set.id === id)
  );
  return live.length ? live : [PLAYABLE_SETS[0].id];
}

/**
 * Bot passwords are derived, never stored. BOT_SECRET is the only thing that
 * can sign these accounts in, and rotating it orphans them by design.
 */
async function botPassword(env, handle) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(env.BOT_SECRET)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`bot:${handle}`));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Re-stamp a roster account's password after BOT_SECRET has changed.
 *
 * Without this a rotated secret strands the roster for good: the derived
 * password no longer matches, so signin 401s, signup 409s on a handle that is
 * already taken, and ensureAccounts retries the same pair every tick forever.
 * These are our own rows, so the fix is to write the new hash directly —
 * keeping the account and everything it has collected.
 *
 * The `bot = 1` guard is the whole safety of this: it must never be able to
 * overwrite a real trainer's password, so a handle collision with a human is
 * left alone and that persona simply stays offline.
 */
async function reclaim(env, helpers, persona, password) {
  if (typeof helpers?.hashPassword !== "function") return false;
  try {
    const row = await env.DB.prepare("SELECT id FROM users WHERE handle = ? AND bot = 1")
      .bind(persona.handle)
      .first();
    if (!row) return false;
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(await helpers.hashPassword(password), row.id)
      .run();
    return true;
  } catch (err) {
    if (!missingSchema(err)) console.error("bot reclaim", persona.handle, err);
    return false;
  }
}

async function signIn(env, call, persona, helpers) {
  const password = await botPassword(env, persona.handle);
  const credentials = { handle: persona.handle, password };
  let res = await call("/api/auth/signin", { method: "POST", body: credentials });

  if (res.status === 401 && (await reclaim(env, helpers, persona, password))) {
    res = await call("/api/auth/signin", { method: "POST", body: credentials });
  }

  if (res.status === 401) {
    res = await call("/api/auth/signup", {
      method: "POST",
      body: { name: persona.name, handle: persona.handle, password, color: persona.color },
    });
    if (res.cookie && res.body?.user) {
      // Flag it here rather than back in ensureAccounts: if the tick died in
      // between, the row would be unflagged and reclaim() could never rescue it.
      await env.DB.prepare("UPDATE users SET bot = 1 WHERE id = ?").bind(res.body.user.id).run();
      await call("/api/me", {
        method: "PATCH",
        cookie: res.cookie,
        body: {
          avatar: persona.avatar,
          avatarStyle: "art",
          banner: persona.banner,
          bio: persona.bio || "",
        },
      });
    }
  }
  if (!res.cookie || !res.body?.user) return null;
  return { cookie: res.cookie, userId: res.body.user.id };
}

/**
 * Create at most a couple of accounts per tick — signup runs PBKDF2, and the
 * roster filling in over ten minutes reads better than two dozen trainers all
 * registering in the same second anyway.
 */
async function ensureAccounts(env, call, now, helpers) {
  const rows = (await env.DB.prepare("SELECT handle FROM bots").all()).results || [];
  const have = new Set(rows.map((row) => row.handle));
  const missing = ROSTER.filter((persona) => !have.has(persona.handle)).slice(0, MAX_NEW_PER_TICK);
  for (const persona of missing) {
    try {
      const next = await signIn(env, call, persona, helpers);
      if (!next) continue;
      await env.DB.prepare(
        `INSERT INTO bots (user_id, handle, cookie, online_until, next_wake, last_chat_at)
         VALUES (?, ?, ?, 0, ?, 0)
         ON CONFLICT(user_id) DO UPDATE SET cookie = excluded.cookie`
      )
        .bind(next.userId, persona.handle, next.cookie, now + rand(0, FIRST_WAKE_MS))
        .run();
    } catch (err) {
      if (!missingSchema(err)) console.error("bot signup", persona.handle, err);
    }
  }
}

async function session(env, call, row, persona, helpers) {
  if (row.cookie) return row.cookie;
  const next = await signIn(env, call, persona, helpers);
  if (!next) return null;
  await env.DB.prepare("UPDATE bots SET cookie = ?, user_id = ? WHERE handle = ?")
    .bind(next.cookie, next.userId, persona.handle)
    .run();
  row.cookie = next.cookie;
  row.user_id = next.userId;
  return next.cookie;
}

async function clearSession(env, row) {
  row.cookie = null;
  await env.DB.prepare("UPDATE bots SET cookie = NULL WHERE user_id = ?").bind(row.user_id).run();
}

async function say(env, call, row, cookie, text, now) {
  const res = await call("/api/chat", { method: "POST", cookie, body: { body: text } });
  if (res.status !== 200) return;
  await env.DB.prepare("UPDATE bots SET last_chat_at = ? WHERE user_id = ?")
    .bind(now, row.user_id)
    .run();
  row.last_chat_at = now;
}

/**
 * Cache the balance and the hourly stamp on the bots row.
 *
 * /api/me returns the whole save, which means reading every card the bot owns
 * — cheap on a new account, hundreds of rows once it has collected for a week.
 * Every response that already carries a save updates this instead, so a tick
 * decides what to do from a row it has in hand.
 */
async function remember(env, row, save) {
  const coins = Number(save?.coins);
  row.coins = Number.isFinite(coins) ? coins : -1;
  row.last_daily = save?.lastDaily == null ? 0 : Number(save.lastDaily);
  await env.DB.prepare("UPDATE bots SET coins = ?, last_daily = ? WHERE user_id = ?")
    .bind(row.coins, row.last_daily, row.user_id)
    .run();
}

/**
 * A player who logs in to an hourly stack spends it. Odds climb with how many
 * packs the balance actually covers, so a bot fresh off the bonus opens most
 * minutes and one down to its last coins slows to a trickle. Held flat, a bot
 * earned 100 coins an hour and opened about six packs with it, and the balance
 * — public on its profile, next to a packs-opened count that stayed low — grew
 * into a number no real trainer would sit on.
 *
 * The catalog cost is close enough to pace against; the worker prices the pack
 * off sealed.json when it actually charges for it.
 */
function ripChance(coins, cost) {
  if (!(cost > 0) || coins < cost) return 0;
  return Math.min(RIP_CEIL, RIP_FLOOR + (coins / cost) * RIP_PER_PACK);
}

function costOf(setId) {
  const set = PLAYABLE_SETS.find((item) => item.id === setId);
  return Number(set?.cost) || 0;
}

function readShowcase(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((slot) => slot && slot.id) : [];
  } catch {
    return [];
  }
}

const slotKey = (list) => list.map((s) => `${s.id}:${s.reverse ? 1 : 0}`).join(",");

/**
 * Put the best pulls on the profile.
 *
 * A player who lands a chase card sets it as their showcase; a bot whose six
 * slots stay empty while its binder fills is showing you exactly what it is.
 * Ranked by sell value rather than rarity, so the slots hold what is actually
 * worth something — a Double Rare worth pennies never displaces an
 * illustration rare.
 *
 * The cached copy is what keeps this cheap: it only PATCHes when a pull
 * genuinely beats what is already up, which after the first few packs is rare.
 */
async function showcaseBest(env, call, row, cookie, cards) {
  const held = readShowcase(row.showcase);
  const merged = held.slice();

  for (const card of cards) {
    if (!isHit(card)) continue;
    if (merged.some((slot) => slot.id === card.id)) continue;
    merged.push({ id: card.id, reverse: Boolean(card.reverse), value: Number(sellValue(card)) || 0 });
  }
  if (merged.length === held.length) return;

  merged.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
  const next = merged.slice(0, SHOWCASE_MAX);
  if (slotKey(next) === slotKey(held)) return;

  const res = await call("/api/me", {
    method: "PATCH",
    cookie,
    body: { showcase: next.map((slot) => ({ id: slot.id, reverse: slot.reverse })) },
  });
  if (res.status !== 200) return;

  row.showcase = JSON.stringify(next);
  await env.DB.prepare("UPDATE bots SET showcase = ? WHERE user_id = ?")
    .bind(row.showcase, row.user_id)
    .run();
}

/**
 * Sell a double if the coins ran low, otherwise open a pack — what a player
 * does with the same balance, and what keeps a bot solvent between hourly
 * stacks. Anything said here is said because it just happened.
 */
async function openOrSell(env, call, row, persona, cookie, setId, quiet, now) {
  if (Number(row.coins) < LOW_COINS) {
    // The collection is only pulled on this branch, which is rare — it is the
    // one decision the cached balance alone cannot answer.
    const mine = await call("/api/me", { cookie });
    const collection = mine.body?.save?.collection || {};
    const dupes = Object.keys(collection).filter((id) => collection[id] > 1);
    if (mine.body?.save) await remember(env, row, mine.body.save);
    if (dupes.length) {
      const sold = await call("/api/cards/sell", {
        method: "POST",
        cookie,
        body: { cardId: pick(dupes) },
      });
      if (sold.body?.save) await remember(env, row, sold.body.save);
      if (sold.status === 200 && quiet && Math.random() < CHAT_CHANCE) {
        await say(env, call, row, cookie, pick(SELL_LINES), now);
      }
      return;
    }
  }

  const ripped = await call("/api/packs/rip", { method: "POST", cookie, body: { setId } });

  if (ripped.status !== 200) {
    // Refused, so the cached balance was optimistic. Zero it so the next tick
    // goes looking for doubles to sell instead of asking again.
    row.coins = 0;
    await env.DB.prepare("UPDATE bots SET coins = 0 WHERE user_id = ?").bind(row.user_id).run();
    if (quiet && Math.random() < CHAT_CHANCE) {
      await say(env, call, row, cookie, pick(BROKE_LINES), now);
    }
    return;
  }

  await remember(env, row, ripped.body?.save);
  await showcaseBest(env, call, row, cookie, ripped.body?.cards || []);

  const packs = Number(ripped.body?.save?.packsOpened || 0);
  if (quiet && MILESTONE_PACKS.includes(packs)) {
    await say(env, call, row, cookie, milestoneLine(packs), now);
    return;
  }

  const hit = (ripped.body?.cards || []).find(
    (card) => !card.reverse && CHAT_WORTHY.has(card.rarity)
  );
  if (hit && quiet && Math.random() < HIT_CHAT_CHANCE) {
    await say(env, call, row, cookie, pick(HIT_LINES)(hit.name), now);
  }
}

/**
 * One thing per minute at most. Reading the lounge is what marks a bot online
 * in the first place — everything after it is optional.
 */
async function act(env, call, row, persona, now, helpers) {
  const cookie = await session(env, call, row, persona, helpers);
  if (!cookie) return;

  const seen = await call("/api/lounge", { cookie });
  if (seen.status === 401) {
    await clearSession(env, row);
    return;
  }

  const quiet = now - Number(row.last_chat_at || 0) >= CHAT_GAP_MS;

  if (Number(row.coins) < 0) {
    const mine = await call("/api/me", { cookie });
    if (mine.status === 401) {
      await clearSession(env, row);
      return;
    }
    if (!mine.body?.save) return;
    await remember(env, row, mine.body.save);
  }

  if (now - Number(row.last_daily || 0) >= HOUR) {
    const paid = await call("/api/daily", { method: "POST", cookie });
    if (paid.body?.save) {
      await remember(env, row, paid.body.save);
    } else {
      // Refused, so the stamp we hold has drifted. Resync once rather than ask
      // again every tick for the rest of the hour.
      const mine = await call("/api/me", { cookie });
      if (mine.body?.save) await remember(env, row, mine.body.save);
    }
    return;
  }

  const setId = pick(playableSets(persona));
  const broke = Number(row.coins) >= 0 && Number(row.coins) < LOW_COINS;
  if (Math.random() < ripChance(Number(row.coins), costOf(setId)) || (broke && Math.random() < 0.25)) {
    await openOrSell(env, call, row, persona, cookie, setId, quiet, now);
    return;
  }

  if (quiet && Math.random() < CHAT_CHANCE) {
    await say(env, call, row, cookie, pick(IDLE_LINES), now);
    return;
  }
  if (Math.random() < TITLE_CHANCE) {
    // The API rejects a locked title, so walking the list best-first and
    // ignoring the 400 lands them on whatever they have actually earned.
    for (const title of persona.titles) {
      const res = await call("/api/me", { method: "PATCH", cookie, body: { title } });
      if (res.status === 200) break;
    }
  }
}

async function step(env, call, row, persona, now, ctx, helpers) {
  if (Number(row.online_until) > now) {
    await act(env, call, row, persona, now, helpers);
    return;
  }
  if (Number(row.next_wake) > now) return;

  if (ctx.online >= MAX_ONLINE || !awake(persona, now) || Math.random() > WAKE_CHANCE) {
    await env.DB.prepare("UPDATE bots SET next_wake = ? WHERE user_id = ?")
      .bind(now + rand(RETRY_MS, RETRY_MS * 3), row.user_id)
      .run();
    return;
  }

  ctx.online += 1;
  const until = now + rand(SESSION_MIN_MS, SESSION_MAX_MS);
  await env.DB.prepare("UPDATE bots SET online_until = ?, next_wake = ? WHERE user_id = ?")
    .bind(until, until + rand(AWAY_MIN_MS, AWAY_MAX_MS), row.user_id)
    .run();
  row.online_until = until;
  await act(env, call, row, persona, now, helpers);
}

/**
 * Called once a minute by the scheduled handler. `call` is the in-process API
 * caller from worker/index.js, so a tick costs no outbound requests.
 */
export async function tickBots(env, call, helpers = {}) {
  if (!env.BOT_SECRET) return;
  await ensureBotSchema(env);
  const now = Date.now();

  try {
    await ensureAccounts(env, call, now, helpers);
    const rows = (await env.DB.prepare("SELECT * FROM bots").all()).results || [];
    const ctx = { online: rows.filter((row) => Number(row.online_until) > now).length };
    for (const row of rows) {
      const persona = ROSTER.find((item) => item.handle === row.handle);
      if (!persona) continue;
      try {
        await step(env, call, row, persona, now, ctx, helpers);
      } catch (err) {
        console.error("bot step", row.handle, err);
      }
    }
  } catch (err) {
    console.error("tickBots", err);
  }
}
