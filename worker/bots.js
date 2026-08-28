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
import { PLAYABLE_SETS } from "../js/catalog.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const SESSION_MIN_MS = 8 * MINUTE;
const SESSION_MAX_MS = 52 * MINUTE;
const AWAY_MIN_MS = 40 * MINUTE;
const AWAY_MAX_MS = 7 * HOUR;
const RETRY_MS = 12 * MINUTE;

const ACT_CHANCE = 0.5;
const WAKE_CHANCE = 0.35;
const CHAT_CHANCE = 0.12;
const HIT_CHAT_CHANCE = 0.45;
const RIP_CHANCE = 0.2;
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

const HIT_RARITIES = new Set([
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
        .bind(next.userId, persona.handle, next.cookie, now + rand(0, 90 * MINUTE))
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
 * Sell a double if the coins ran low, otherwise open a pack — what a player
 * does with the same balance, and what keeps a bot solvent between hourly
 * stacks. Anything said here is said because it just happened.
 */
async function openOrSell(env, call, row, persona, cookie, save, quiet, now) {
  const collection = save.collection || {};
  if (Number(save.coins) < LOW_COINS) {
    const dupes = Object.keys(collection).filter((id) => collection[id] > 1);
    if (dupes.length) {
      const sold = await call("/api/cards/sell", {
        method: "POST",
        cookie,
        body: { cardId: pick(dupes) },
      });
      if (sold.status === 200 && quiet && Math.random() < CHAT_CHANCE) {
        await say(env, call, row, cookie, pick(SELL_LINES), now);
      }
      return;
    }
  }

  const ripped = await call("/api/packs/rip", {
    method: "POST",
    cookie,
    body: { setId: pick(playableSets(persona)) },
  });

  if (ripped.status !== 200) {
    // Broke with nothing left to sell. Idle until the hourly stack is ready.
    if (quiet && Math.random() < CHAT_CHANCE) {
      await say(env, call, row, cookie, pick(BROKE_LINES), now);
    }
    return;
  }

  const packs = Number(ripped.body?.save?.packsOpened || 0);
  if (quiet && MILESTONE_PACKS.includes(packs)) {
    await say(env, call, row, cookie, milestoneLine(packs), now);
    return;
  }

  const hit = (ripped.body?.cards || []).find(
    (card) => !card.reverse && HIT_RARITIES.has(card.rarity)
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
  if (Math.random() > ACT_CHANCE) return;

  const mine = await call("/api/me", { cookie });
  if (mine.status === 401) {
    await clearSession(env, row);
    return;
  }
  const save = mine.body?.save;
  if (!save) return;

  const quiet = now - Number(row.last_chat_at || 0) >= CHAT_GAP_MS;

  if (save.lastDaily == null || now - Number(save.lastDaily) >= HOUR) {
    await call("/api/daily", { method: "POST", cookie });
    return;
  }

  // Opening a pack is the expensive part of a tick — around 36 D1 rows once
  // the card, history, and trim writes are counted, against one for simply
  // being present. Presence is what fills the online list, so most ticks stop
  // short of this. ACT_CHANCE and RIP_CHANCE compound to about a tenth of an
  // online bot's ticks, or a pack every ten minutes or so, which still builds
  // a lived-in profile over a day without the roster eating the write budget.
  if (Math.random() < RIP_CHANCE) {
    await openOrSell(env, call, row, persona, cookie, save, quiet, now);
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
