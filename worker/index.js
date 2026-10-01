import { validateProfilePages } from "../js/profile-pages.js";
/**
 * Cloud accounts, inventory, and pack rips. Static pages still come from
 * the ASSETS binding; only /api/* is handled here.
 */
import {
  ALL_SETS,
  BASIC_ENERGY,
  dataSetsOf,
  getSet,
  homeCards,
  PLAYABLE_SETS,
  RARITY_ORDER,
  boxCardList,
  findOffer,
  money,
  offerPackSets,
  sellValue,
} from "../js/catalog.js";
import { drawPromos, isHit, ripPack } from "../js/engine.js";
import { homeSetId } from "../js/card-home.js";
import { handleSocial, socialUserFields, patchSocialFields, ensureSocialSchema, looksLikeMasteryBanner, masteryBannerError } from "./social.js";
import { DEFAULT_BANNER, SHOWCASE_MAX, bannerId } from "../js/cosmetics.js";
import { levelFields, levelOf, frameChoice, bannerMotionError, slotError, slotPeak } from "./perks.js";
import { handlePrices, recordDailyPrices } from "./prices.js";
import { COLOR_IDS } from "../js/palette.js";
import { isTitleUnlocked, ownedMap, titleContext } from "../js/titles.js";
import {
  bumpStatStmt,
  clearStatsStmts,
  ensureQuestSchema,
  eventStmt,
  friendsCount,
  isMissingTable,
  loadCounters,
  maxStatStmt,
  recordActivity,
  setPacksFor,
  setStatStmt,
  skipSettledBattles,
  syncBattleStats,
} from "./stats.js";
import { activeChests, activeQuests, activeRowById, questPeriods, streakFromDays } from "../js/quests.js";
import { handleBattles, maintainBattles } from "./battles.js";
import { ensureGearSchema, gearSummary, grantRewardGear, handleGear, loadGearCatalog, prepareGrant } from "./gear.js";
import { productGear, rollGear } from "../js/gear.js";
import { handleCasino, maintainCoinflips } from "./casino.js";
import { ensureGradingSchema, gradedCounts, gradedSlabs, gradedTotal, handleGrading, shownSlabs } from "./grading.js";
import { bestHistory, rollSealedProduct, tallyOpened } from "./sealed-roll.js";
import { ensureOrdersSchema, handleOrders, vaultKept } from "./orders.js";
import { claimLevels, clearXpStmts, ensureXpSchema, loadXpCounters, readXpRow, syncXp } from "./xp.js";
import {
  achievementById,
  achievementContext,
  isAchievementDone,
  readyToClaim,
} from "../js/achievements.js";

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const COOKIE = "pp_sid";
const STARTING_COINS = 25;
const DAILY_BONUS = 100;
const DAILY_COOLDOWN_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const CLAIM_ATTEMPTS = 4;
// Quest events only feed the current month; claims also feed the streak.
const QUEST_EVENT_KEEP_MS = 40 * DAY_MS;
const QUEST_CLAIM_KEEP_MS = 400 * DAY_MS;
const COUNTER_KEYS = [
  "sold", "bonus", "sealed", "battles", "battleWins", "questsClaimed", "chests",
  "hitsPulled", "maxDrought", "streak", "streakBest",
  // Counted from the casino and grading tables at read time (worker/xp.js loadXpCounters).
  "casinoPlayed", "casinoWon", "graded", "gemMint",
];
const PBKDF2_ITERS = 12_000;
const BINDER_PAGE = 9;
const BINDER_MAX_SLOTS = BINDER_PAGE * 40;
const MAX_CLAIM_CARDS = 8000;
const MAX_COINS = 1_000_000;
// Ceilings for an unverifiable guest save handed to signup — see sanitizeClaim.
const CLAIM_MAX_COINS = 250_000;
const CLAIM_PACK_YIELD = 60;
const CLAIM_CARDS_PER_PACK = 20;
const CLAIM_MAX_AGE_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const MAX_QTY = 999;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const setCache = new Map();
let sealedCache = null;
let productsCache = null;
let boxContentsCache = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      // The small card thumbnails are not uploaded (Cloudflare allows 20,000
      // static files and the scans alone pass that; scripts/prepare-cf-assets.mjs
      // leaves them out), so a "-sm.webp" request gets the full scan. Same
      // art, same immutable caching, a bigger file.
      const small = url.pathname.match(/^\/assets\/cards\/.+-sm\.webp$/);
      if (small) {
        url.pathname = url.pathname.replace(/-sm\.webp$/, ".webp");
        return env.ASSETS.fetch(new Request(url, request));
      }
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      const message = err?.message || "Server error.";
      const status = err.status && Number.isInteger(err.status) ? err.status
        : /(active battles|open coin flips|open jackpots) before (deleting|resetting)/.test(message) ? 409 : 500;
      if (status >= 500) console.error(err);
      return json({ error: status >= 500 ? "Server error." : message }, status);
    }
  },

  // Every 10 minutes (wrangler.toml [triggers]): one small step of recording
  // each set's market prices once a UTC day into D1. See worker/prices.js.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(maintainBattles(env, Date.now(), { settleLimit: 10 }).catch(err => console.error('battle maintenance', err)));
    ctx.waitUntil(maintainCoinflips(env).catch(err => console.error('coinflip maintenance', err)));
    ctx.waitUntil(
      recordDailyPrices(env).then(
        (result) => console.log("daily prices", JSON.stringify(result)),
        (err) => console.error("daily prices failed", err)
      )
    );
  },
};

/**
 * The casino module reports what a player did through this helper. Selling
 * winnings is selling cards, so it feeds the same "sold" event and lifetime
 * counter the market sell does.
 */
function recordQuestEvent(env, userId, kind, amount = 1, at = Date.now()) {
  return recordActivity(env, userId, { event: kind, counter: kind === "sold" ? "sold" : null, amount, at });
}

export async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  if (path.startsWith('/api/battles')) {
    return handleBattles(path, method, request, env, {
      json, requireUser, readJson, loadSave, loadSetCards, loadSealed, loadProducts, packCost, ensureSocialSchema,
    });
  }

  if (path.startsWith('/api/casino')) {
    return handleCasino(path, method, request, env, {
      json, requireUser, readJson, loadSave, loadSetCards, findCatalogCard, inventoryMap, reconcileBinder, ownedWithSlabs, parseJson, ensureSocialSchema, recordQuestEvent,
    });
  }

  if (path.startsWith('/api/grading')) {
    return handleGrading(path, method, request, env, { json, requireUser, readJson, loadSave, findCatalogCard, recordQuestEvent });
  }

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true });
  }

  if (path.startsWith("/api/prices/") && method === "GET") {
    return handlePrices(request, env, url, decodeURIComponent(path.slice("/api/prices/".length)));
  }

  if (path === "/api/auth/signup" && method === "POST") {
    return signup(request, env);
  }
  if (path === "/api/auth/signin" && method === "POST") {
    return signin(request, env);
  }
  if (path === "/api/auth/signout" && method === "POST") {
    return signout(request, env);
  }
  if (path === "/api/auth/delete" && method === "POST") {
    return deleteAccount(request, env);
  }
  if (path === "/api/me" && method === "GET") {
    await ensureAchievementSchema(env);
    return me(request, env);
  }
  if (path === "/api/me" && method === "PATCH") {
    await ensureSocialSchema(env);
    await ensureAchievementSchema(env);
    return patchMe(request, env);
  }
  if (path === "/api/me/reset" && method === "POST") {
    return resetMe(request, env);
  }
  if (path === "/api/packs/rip" && method === "POST") {
    return rip(request, env);
  }
  if (path === "/api/sealed/open" && method === "POST") {
    return openSealed(request, env);
  }
  if (path === "/api/vault" || path.startsWith("/api/vault/") || path === "/api/cart/checkout" || path.startsWith("/api/orders/")) {
    return handleOrders(path, method, request, env, { json, requireUser, readJson, loadSave, ...SEALED_DEPS });
  }
  if (path === "/api/daily" && method === "POST") {
    return daily(request, env);
  }
  if (path === "/api/achievements/claim" && method === "POST") {
    await ensureAchievementSchema(env);
    return claimAchievement(request, env);
  }
  if (path === "/api/quests/claim" && method === "POST") {
    return claimQuest(request, env);
  }
  if (path === "/api/levels/claim" && method === "POST") {
    return claimLevelRewards(request, env);
  }
  if (path === "/api/cards/sell" && method === "POST") {
    return sell(request, env);
  }
  if (path === "/api/cards/sell-duplicates" && method === "POST") {
    return sellDuplicates(request, env);
  }
  if (path === "/api/binder" && method === "PUT") {
    return putBinder(request, env);
  }

  const gear = await handleGear(path, method, request, env, { json, requireUser, readJson });
  if (gear) return gear;

  await ensureSocialSchema(env);
  const social = await handleSocial(path, method, request, env, {
    json,
    requireUser,
    publicUser,
    normalizeHandle,
    findCatalogCard,
    money,
    readJson,
    ownedWithSlabs,
    shownSlabs,
    gradedTotal,
    loadSave,
  });
  if (social) return social;

  return json({ error: "Not found." }, 404);
}

async function signup(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  const name = String(body.name || "").trim().slice(0, 24);
  const handle = normalizeHandle(body.handle);
  const password = String(body.password || "");
  const color = COLOR_IDS.has(body.color) ? body.color : "gold";
  if (name.length < 2) return json({ error: "Pick a trainer name (at least 2 letters)." }, 400);
  if (handle.length < 3) {
    return json({ error: "Handle needs 3–16 letters, numbers, or underscores." }, 400);
  }
  if (password.length < 6 || password.length > 64) {
    return json({ error: "Password needs 6–64 characters." }, 400);
  }

  const taken = await env.DB.prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first();
  if (taken) return json({ error: "That handle is taken." }, 409);

  const now = Date.now();
  const id = newId();
  const passwordHash = await hashPassword(password);
  const claim = sanitizeClaim(body.localSave);
  const coins = claim ? claim.coins : STARTING_COINS;
  const granted = claim ? claim.granted : STARTING_COINS;

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, name, handle, password_hash, color, bio, title, created_at, last_played)
         VALUES (?, ?, ?, ?, ?, '', 'Rookie', ?, ?)`
      ).bind(id, name, handle, passwordHash, color, now, now),
      env.DB.prepare(
        `INSERT INTO profiles (user_id, coins, last_daily, packs_opened, pulls, packs_since_hit, pack_trick, granted, active_set_id, created_at, binder, worth_log)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        coins,
        claim?.lastDaily ?? null,
        claim?.packsOpened ?? 0,
        claim?.pulls ?? 0,
        claim?.packsSinceHit ?? 0,
        claim?.packTrick ? 1 : 0,
        granted,
        claim?.activeSetId || "me5",
        claim?.createdAt || now,
        JSON.stringify(claim?.binder || emptyBinder()),
        JSON.stringify(claim?.worthLog || [])
      ),
    ]);
    await runBatches(env, [
      ...inventoryInserts(env, id, claim?.collection || {}, claim?.reverses || {}),
      ...historyInserts(env, id, claim?.history || []),
    ]);
  } catch (err) {
    if (String(err?.message || "").includes("UNIQUE")) {
      return json({ error: "That handle is taken." }, 409);
    }
    throw err;
  }

  // Battles settled before this account existed are nobody's to count.
  if (await ensureQuestSchema(env)) await skipSettledBattles(env, id);
  const token = await createSession(env, id, now);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  const save = await loadSave(env, id);
  return json({ user: await userWithLevel(env, publicUser(user), user, save), save }, 201, sessionCookie(request, token));
}

async function signin(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);
  const handle = normalizeHandle(body.handle);
  const password = String(body.password || "");
  const user = await env.DB.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return json({ error: "Wrong handle or password." }, 401);
  }
  const now = Date.now();
  await env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(now, user.id).run();
  const token = await createSession(env, user.id, now);
  const save = await loadSave(env, user.id);
  return json({ user: await userWithLevel(env, publicUser({ ...user, last_played: now }), user, save), save }, 200, sessionCookie(request, token));
}

async function signout(request, env) {
  const sid = readCookie(request, COOKIE);
  if (sid) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  }
  return json({ ok: true }, 200, clearCookie(request));
}

async function deleteAccount(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const password = String(body?.password || "");
  if (!(await verifyPassword(password, auth.user.password_hash))) {
    return json({ error: "Wrong password." }, 401);
  }
  const id = auth.user.id;
  const statsReady = await ensureQuestSchema(env);
  const xpReady = await ensureXpSchema(env);
  await env.DB.batch([
    ...(statsReady ? clearStatsStmts(env, id) : []),
    ...(xpReady ? clearXpStmts(env, id) : []),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM history WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM pack_log WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM cards WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM profiles WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
  return json({ ok: true }, 200, clearCookie(request));
}

async function me(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const save = await loadSave(env, auth.user.id);
  return json({ user: await userWithLevel(env, publicUser(auth.user), auth.user, save), save });
}

async function patchMe(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  const user = auth.user;
  let name = user.name;
  let handle = user.handle;
  let bio = user.bio;
  let color = user.color;
  let title = user.title;
  let passwordHash = user.password_hash;
  // The stored level, read once and only when a field below needs it (level perks: js/levels.js).
  let levelNow = null;
  const level = async () => (levelNow ??= await levelOf(env, user.id));
  // A mastery banner is a reward: only for a set whose mastery is claimed.
  // A banner is a string; anything else (an array that bannerId would coerce) is refused.
  if (body.banner != null && typeof body.banner !== "string") return json({ error: "That banner does not exist." }, 400);
  if (looksLikeMasteryBanner(body.banner) || (body.banner != null && bannerId(body.banner).startsWith("mastery:"))) {
    await ensureAchievementSchema(env);
    const refusal = await masteryBannerError(env, user.id, body.banner);
    if (refusal) return json({ error: refusal.error }, refusal.status);
  }
  const social = patchSocialFields(body, user);
  if (body.banner != null) {
    const refusal = bannerMotionError(bannerId(body.banner), user.banner, await level());
    if (refusal) return json({ error: refusal.error, needLevel: refusal.needLevel }, refusal.status);
  }
  if (Object.prototype.hasOwnProperty.call(body, "frame")) {
    const choice = frameChoice(body.frame, await level());
    if (choice.error) return json({ error: choice.error, needLevel: choice.needLevel }, choice.status);
    social.frame = choice.value;
  }

  if (body.name != null) {
    name = String(body.name || "").trim().slice(0, 24);
    if (name.length < 2) return json({ error: "Pick a trainer name (at least 2 letters)." }, 400);
  }
  if (body.handle != null) {
    handle = normalizeHandle(body.handle);
    if (handle.length < 3) {
      return json({ error: "Handle needs 3–16 letters, numbers, or underscores." }, 400);
    }
    if (handle !== user.handle) {
      const taken = await env.DB.prepare("SELECT id FROM users WHERE handle = ? AND id != ?")
        .bind(handle, user.id)
        .first();
      if (taken) return json({ error: "That handle is taken." }, 409);
    }
  }
  if (body.bio != null) bio = String(body.bio || "").slice(0, 160);
  if (body.color != null) {
    if (!COLOR_IDS.has(body.color)) return json({ error: "Pick an avatar color." }, 400);
    color = body.color;
  }
  if (body.title != null) {
    const nextTitle = String(body.title || "").slice(0, 32);
    const save = await loadSave(env, user.id);
    const rarities = await rarityCountsFor(env, request, ownedMap(save));
    const ctx = titleContext(save, { signed: true, rarities, level: await level() });
    if (!isTitleUnlocked(nextTitle, ctx)) return json({ error: "That title is locked." }, 400);
    title = nextTitle;
  }
  if (body.password != null && String(body.password).length) {
    const next = String(body.password);
    if (next.length < 6 || next.length > 64) {
      return json({ error: "Password needs 6–64 characters." }, 400);
    }
    if (!(await verifyPassword(String(body.current || ""), user.password_hash))) {
      return json({ error: "Wrong current password." }, 401);
    }
    passwordHash = await hashPassword(next);
  }

  if (Object.prototype.hasOwnProperty.call(body, "binderPages")) {
    const profile = await env.DB.prepare("SELECT binder FROM profiles WHERE user_id = ?").bind(user.id).first();
    const error = validateProfilePages(body.binderPages, parseJson(profile?.binder, []), social.binderPages);
    if (error) return json({error}, 400);
    const room = slotError("pages", await level(), await slotPeak(env, user.id, "pages", social.binderPages.length), body.binderPages.length);
    if (room) return json({ error: room.error }, room.status);
    await slotPeak(env, user.id, "pages", body.binderPages.length);
    social.binderPages = body.binderPages;
  }

  if (Array.isArray(body.showcase)) {
    const { collection } = await inventoryMap(env, user.id);
    social.showcase = social.showcase.filter((slot) => (collection[slot.id] || 0) > 0);
    const room = slotError("showcase", await level(), await slotPeak(env, user.id, "showcase", savedShowcaseCount(user.showcase)), social.showcase.length);
    if (room) return json({ error: room.error }, room.status);
    await slotPeak(env, user.id, "showcase", social.showcase.length);
  }

  await env.DB.prepare(
    `UPDATE users SET name = ?, handle = ?, bio = ?, color = ?, title = ?, password_hash = ?, last_played = ?,
       avatar = ?, avatar_style = ?, banner = ?, showcase = ?, shown_stats = ?, binder_pages = ?, frame = ?
     WHERE id = ?`
  )
    .bind(
      name,
      handle,
      bio,
      color,
      title,
      passwordHash,
      Date.now(),
      social.avatar,
      social.avatarStyle,
      social.banner,
      JSON.stringify(social.showcase),
      JSON.stringify(social.shownStats),
      JSON.stringify(social.binderPages),
      social.frame,
      user.id
    )
    .run();

  if (Array.isArray(body.worthLog)) {
    const worthLog = body.worthLog
      .filter((row) => Array.isArray(row) && row.length >= 2)
      .slice(-200)
      .map((row) => [Number(row[0]) || 0, money(row[1])]);
    await env.DB.prepare("UPDATE profiles SET worth_log = ? WHERE user_id = ?")
      .bind(JSON.stringify(worthLog), user.id)
      .run();
  }

  const nextUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  const save = await loadSave(env, user.id);
  return json({ user: { ...withLevel(publicUser(nextUser), save), ...(await levelFields(env, nextUser, levelNow)) }, save });
}

async function resetMe(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  await ensureAchievementSchema(env);
  await ensureGearSchema(env);
  await ensureGradingSchema(env);
  await ensureOrdersSchema(env);
  await ensureSocialSchema(env);
  const statsReady = await ensureQuestSchema(env);
  const xpReady = await ensureXpSchema(env);
  const now = Date.now();
  const profile = await env.DB.prepare("SELECT active_set_id FROM profiles WHERE user_id = ?")
    .bind(auth.user.id)
    .first();
  await env.DB.batch([
    ...(statsReady ? clearStatsStmts(env, auth.user.id) : []),
    ...(xpReady ? clearXpStmts(env, auth.user.id) : []),
    // A reset drops every claimed mastery, so a mastery banner goes with them.
    env.DB.prepare("UPDATE users SET banner = ? WHERE id = ? AND banner LIKE 'mastery:%'").bind(DEFAULT_BANNER, auth.user.id),
    env.DB.prepare("DELETE FROM cards WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM history WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM pack_log WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM user_gear WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM gear_equipped WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM graded_cards WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM gear_purchases WHERE user_id = ?").bind(auth.user.id),
    // Kept sealed product and past orders go too (an order's chunk markers with it).
    env.DB.prepare("DELETE FROM sealed_vault WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare("DELETE FROM sealed_order_chunks WHERE order_id IN (SELECT id FROM sealed_orders WHERE user_id = ?)").bind(auth.user.id),
    env.DB.prepare("DELETE FROM sealed_orders WHERE user_id = ?").bind(auth.user.id),
    env.DB.prepare(
      `UPDATE profiles SET coins = ?, last_daily = NULL, packs_opened = 0, pulls = 0,
        packs_since_hit = 0, pack_trick = 0, granted = ?, binder = ?, worth_log = ?, claimed = ?, created_at = ?
       WHERE user_id = ?`
    ).bind(
      STARTING_COINS,
      STARTING_COINS,
      JSON.stringify(emptyBinder()),
      JSON.stringify([]),
      JSON.stringify([]),
      now,
      auth.user.id
    ),
  ]);
  // Battles fought before the reset are not counted again.
  if (statsReady) await skipSettledBattles(env, auth.user.id);
  const save = await loadSave(env, auth.user.id);
  // A title that came from what was just wiped goes back to Rookie.
  if (!isTitleUnlocked(auth.user.title, titleContext(save, { signed: true, rarities: {}, level: await levelOf(env, auth.user.id) }))) {
    await env.DB.prepare("UPDATE users SET title = 'Rookie' WHERE id = ?").bind(auth.user.id).run();
  }
  if (profile?.active_set_id) save.activeSetId = profile.active_set_id;
  return json({ save });
}

async function rip(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  const live = PLAYABLE_SETS.find((item) => item.id === String(body.setId || ""));
  if (!live) return json({ error: "Unknown set." }, 400);
  const wrapper =
    live.wrappers.find((item) => item.id === body.wrapperId) || live.wrappers[0];
  if (!wrapper) return json({ error: "Unknown pack art." }, 400);

  const catalog = await loadSetCards(env, request, live);
  const cost = await packCost(env, request, live);
  const opened = await openPacks(env, auth.user.id, live, [{ wrapper, pulls: ripPack(live, catalog) }], cost);
  if (opened.response) return opened.response;
  return json({ save: opened.save, cards: opened.packs[0].cards, cost });
}

// The asset loaders a sealed roll and the order routes (worker/orders.js) need.
const SEALED_DEPS = { loadSealed, loadProducts, loadSetCards, loadBoxContents, findCatalogCard };

/**
 * Buy a sealed product and open every pack in it. The price is the product's
 * market price (sealed.json for boxes, ETBs and bundles; products.json for the
 * promo products), charged once; each pack still lands in pack_log on its
 * own, so quests and pack counts see a box as 36 packs. Wrappers are mixed,
 * the way a real box is. A product's promo cards come with it, and never
 * count as a pack.
 */
async function openSealed(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400);

  // The same roll a checkout and the sealed collection use (worker/sealed-roll.js).
  let rolled;
  try {
    rolled = await rollSealedProduct(env, request, body.setId, body.product, SEALED_DEPS);
  } catch (err) {
    if (err?.status === 400) return json({ error: err.message }, 400);
    throw err;
  }
  const { live, offer, packs, promos, boxCards, gearItems } = rolled;
  const grant = await prepareGrant(env, auth.user.id, gearItems);
  const opened = await openPacks(env, auth.user.id, live, packs, offer.price, promos, boxCards, { sealed: true, extraStmts: grant.stmts });
  if (opened.response) return opened.response;
  return json({
    save: opened.save,
    gear: grant.granted,
    product: { id: offer.id, name: offer.name, packs: opened.packs.length },
    packs: opened.packs.map((pack) => ({ setId: (pack.set || live).id, wrapperId: pack.wrapper.id, cards: pack.cards })),
    promos: opened.promos,
    boxCards: opened.boxCards,
    cost: offer.price,
  });
}

/**
 * Charge `cost` once and add every pack's pulls to the account. `wasNew` runs
 * across the whole purchase, so only the first copy of a card in a box is new.
 * `promos` are the product's promo cards: owned like pulls, but not a pack.
 * `boxCards` are its other cards (`{...card, n}`): owned in `n` copies, not pulls.
 * Returns `{ response }` when the player can't afford it.
 */
async function openPacks(env, userId, live, packs, cost, promos = [], boxCards = [], { sealed = false, extraStmts = [] } = {}) {
  const now = Date.now();
  // Counters first: an old account's lifetime hits are read out of pack_log
  // here, before this rip writes its own rows there.
  const statsReady = await ensureQuestSchema(env);
  let run = 0;
  if (statsReady) {
    await loadCounters(env, userId);
    run = (await env.DB.prepare("SELECT packs_since_hit FROM profiles WHERE user_id = ?").bind(userId).first())?.packs_since_hit || 0;
  }
  const ids = [
    ...new Set([...promos, ...boxCards, ...packs.flatMap((pack) => pack.pulls)].map((card) => card.id)),
  ];
  const existing = [];
  // D1 caps bound parameters per query at 100.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows =
      (
        await env.DB.prepare(
          `SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? AND card_id IN (${chunk.map(() => "?").join(",")})`
        )
          .bind(userId, ...chunk)
          .all()
      ).results || [];
    existing.push(...rows);
  }
  const counted = tallyOpened([{ packs, promos, boxCards }], {
    qty: Object.fromEntries(existing.map((row) => [row.card_id, row.qty])),
    reverseQty: Object.fromEntries(existing.map((row) => [row.card_id, row.reverse_qty])),
    run,
  });
  const { qty, reverseQty, pulled, sinceHit } = counted;
  const { packs: opened, promos: promoCards, boxCards: boxOut } = counted.boxes[0];
  const tally = { hits: counted.hits, fresh: counted.fresh, reverses: counted.reverses, drought: counted.drought };

  // sinceHit is -1 when nothing hit, else the dry packs after the last hit.
  const deducted = await env.DB.prepare(
    `UPDATE profiles SET coins = coins - ?, packs_opened = packs_opened + ?, pulls = pulls + ?,
      packs_since_hit = CASE WHEN ? >= 0 THEN ? ELSE packs_since_hit + ? END,
      active_set_id = ?
     WHERE user_id = ? AND coins >= ?`
  )
    .bind(cost, opened.length, pulled, sinceHit, sinceHit, opened.length, live.id, userId, cost)
    .run();
  if (!deducted.meta?.changes) {
    return { response: json({ error: "Not enough coins." }, 400) };
  }

  const stmts = [];
  for (const id of Object.keys(qty)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO cards (user_id, card_id, qty, reverse_qty) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, card_id) DO UPDATE SET qty = cards.qty + excluded.qty,
           reverse_qty = cards.reverse_qty + excluded.reverse_qty`
      ).bind(userId, id, qty[id] - (existing.find(row => row.card_id === id)?.qty || 0),
        (reverseQty[id] || 0) - (existing.find(row => row.card_id === id)?.reverse_qty || 0))
    );
  }
  // History only keeps 24 rows, so a box records its best 24 cards, in pull order.
  const recent = bestHistory(counted.boxes);
  for (const { card, wrapperId } of recent) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO history (user_id, card_id, name, rarity, reverse, was_new, pack_id, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(userId, card.id, card.name, card.rarity, card.reverse ? 1 : 0, card.wasNew ? 1 : 0, wrapperId, now)
    );
  }
  // Split the price across packs in cents, the last pack taking the remainder.
  // A battle deck has no packs, so nothing goes to pack_log.
  const share = opened.length ? Math.floor((cost * 100) / opened.length) / 100 : 0;
  opened.forEach((pack, i) => {
    const packCostShare = i === opened.length - 1 ? money(cost - share * (opened.length - 1)) : share;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO pack_log (user_id, set_id, wrapper_id, cost, cards, at) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        (pack.set || live).id,
        pack.wrapper.id,
        packCostShare,
        JSON.stringify(pack.cards.map((card) => ({ id: card.id, reverse: card.reverse, rarity: card.rarity }))),
        now
      )
    );
  });
  stmts.push(env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(now, userId));
  stmts.push(...extraStmts);
  if (statsReady) {
    if (tally.hits) stmts.push(eventStmt(env, userId, "hits", tally.hits, now), bumpStatStmt(env, userId, "hitsPulled", tally.hits));
    if (tally.fresh) stmts.push(eventStmt(env, userId, "newcards", tally.fresh, now));
    if (tally.reverses) stmts.push(eventStmt(env, userId, "reverses", tally.reverses, now));
    if (opened.length) stmts.push(maxStatStmt(env, userId, "maxDrought", tally.drought));
    if (sealed) stmts.push(eventStmt(env, userId, "sealed", 1, now), bumpStatStmt(env, userId, "sealed", 1));
  }
  await runBatches(env, stmts);

  await trimHistory(env, userId);
  return { save: await loadSave(env, userId), packs: opened, promos: promoCards, boxCards: boxOut };
}

async function daily(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const now = Date.now();
  const cutoff = now - DAILY_COOLDOWN_MS;
  const updated = await env.DB.prepare(
    `UPDATE profiles SET coins = MIN(coins + ?, ?), granted = granted + ?, last_daily = ?
     WHERE user_id = ? AND (last_daily IS NULL OR last_daily <= ?)`
  )
    .bind(DAILY_BONUS, MAX_COINS, DAILY_BONUS, now, auth.user.id, cutoff)
    .run();
  if (!updated.meta?.changes) {
    return json({ error: "Hourly bonus is not ready yet." }, 400);
  }
  await recordActivity(env, auth.user.id, { event: "bonus", counter: "bonus", at: now });
  const save = await loadSave(env, auth.user.id);
  return json({ save, amount: DAILY_BONUS });
}

/**
 * Cash in a finished achievement. The reward is read from the shared table and
 * the progress is recomputed here from the stored save, so a forged request
 * gets nothing — the body only names which achievement to check.
 *
 * `all: true` sweeps every ready one in a single round trip, which is what the
 * "Claim all" button sends.
 */
async function claimAchievement(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  await ensureAchievementSchema(env);
  const body = await readJson(request);

  // The write is conditional on the stored `claimed` text it was worked out
  // from. If another claim lands in between, nothing is paid, and this one
  // starts again from what is stored now, so an id is paid once and no id is
  // lost from the list.
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const stored = await env.DB.prepare("SELECT claimed FROM profiles WHERE user_id = ?").bind(auth.user.id).first();
    const raw = stored?.claimed ?? null;
    const save = await loadSave(env, auth.user.id);
    const claimed = new Set(normalizeClaimed(parseJson(raw, [])));
    const { rarities, cards } = await ownedCardsFor(env, request, ownedMap(save));
    const ctx = achievementContext(save, { signed: true, rarities, cards });

    let ids;
    if (body?.all) {
      ids = readyToClaim(ctx, claimed);
      if (!ids.length) return json({ error: "Nothing ready to claim." }, 400);
    } else {
      const row = achievementById(body?.id);
      if (!row) return json({ error: "Unknown achievement." }, 400);
      if (claimed.has(row.id)) return json({ error: "Already claimed." }, 400);
      if (!isAchievementDone(row, ctx)) return json({ error: "Not unlocked yet." }, 400);
      ids = [row.id];
    }

    const rewards = ids.map((id) => achievementById(id)).filter(Boolean);
    const coins = money(rewards.reduce((n, row) => n + (row.coins || 0), 0));
    const titles = rewards.map((row) => row.title).filter(Boolean);
    for (const id of ids) claimed.add(id);

    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE profiles SET coins = MIN(coins + ?, ?), granted = granted + ?, claimed = ?
         WHERE user_id = ? AND claimed IS ?`
      ).bind(coins, MAX_COINS, coins, JSON.stringify([...claimed]), auth.user.id, raw),
      env.DB.prepare("UPDATE users SET last_played = ? WHERE id = ?").bind(Date.now(), auth.user.id),
    ]);
    if (!results[0]?.meta?.changes) continue;

    // Won the compare-and-swap, so only this request hands out the gear gifts
    // (set masteries and era crowns carry reward.gear).
    const gifts = await grantRewardGear(env, request, auth.user.id, rewards);
    const next = await loadSave(env, auth.user.id);
    return json({
      save: next,
      coins,
      titles,
      claimed: ids,
      gear: gifts.gear,
      rewards: rewards.map((row) => ({
        id: row.id,
        name: row.name,
        coins: row.coins,
        title: row.title || null,
        gear: gifts.byRow[row.id] || [],
      })),
    });
  }
  return json({ error: "Your claims collided. Try again." }, 409);
}

/** POST /api/levels/claim. No body is read: what is owed comes from the stored save (worker/xp.js). */
async function claimLevelRewards(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const out = await claimLevels(env, auth.user.id, { request, loadSave, maxCoins: MAX_COINS });
  return out.error ? json({ error: out.error }, out.status || 400) : json(out);
}

/**
 * Cash in a quest or a period chest. The list of what is active, the goals and
 * the coins all come from js/quests.js and the progress from the database, so
 * the body only names an id. Each (id, period) pays once: the claim row is the
 * gate and the coin credit is tied to that insert.
 */
async function claimQuest(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const id = String(body?.id || "");
  const summary = await questSummary(env, auth.user.id);
  if (summary.unavailable) return json({ error: "Quests are being prepared. Try again shortly." }, 503);
  const active = activeQuests(summary.periods);
  const row = activeRowById(id, active);
  if (!row) return json({ error: "Unknown quest." }, 400);
  if (summary.claimed.includes(row.id)) return json({ error: "Already claimed this period." }, 400);
  if (row.chest) {
    if (!summary.chests[row.period]) return json({ error: "Claim every quest first." }, 400);
  } else if ((summary.progress[row.id] || 0) < row.goal) {
    return json({ error: "Quest is not complete yet." }, 400);
  }

  const now = Date.now();
  const period = summary.periods[row.period];
  const results = await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO quest_claims (user_id, quest_id, period_start, claimed_at) VALUES (?, ?, ?, ?)"
    ).bind(auth.user.id, row.id, period, now),
    env.DB.prepare(
      "UPDATE profiles SET coins = MIN(coins + ?, ?), granted = granted + ? WHERE user_id = ? AND changes() = 1"
    ).bind(row.coins, MAX_COINS, row.coins, auth.user.id),
  ]);
  if (!results[0]?.meta?.changes) return json({ error: "Already claimed this period." }, 400);

  // The day's streak comes from the claim days on record, then is kept in
  // player_stats so a read needs no scan.
  const today = Math.floor(now / DAY_MS);
  const days =
    (
      await env.DB.prepare(
        "SELECT DISTINCT claimed_at / 86400000 AS d FROM quest_claims WHERE user_id = ? AND claimed_at >= ? ORDER BY d DESC"
      )
        .bind(auth.user.id, now - QUEST_CLAIM_KEEP_MS)
        .all()
    ).results || [];
  const streak = streakFromDays(new Set(days.map((r) => r.d)), today);
  await env.DB.batch([
    bumpStatStmt(env, auth.user.id, row.chest ? "chests" : "questsClaimed", 1),
    setStatStmt(env, auth.user.id, "streak", streak),
    setStatStmt(env, auth.user.id, "_streakDay", today),
    maxStatStmt(env, auth.user.id, "streakBest", streak),
    // Old rows only: nothing this period or the last month is ever dropped.
    env.DB.prepare("DELETE FROM quest_events WHERE user_id = ? AND at < ?").bind(auth.user.id, now - QUEST_EVENT_KEEP_MS),
    env.DB.prepare("DELETE FROM quest_claims WHERE user_id = ? AND claimed_at < ?").bind(auth.user.id, now - QUEST_CLAIM_KEEP_MS),
  ]);
  return json({
    save: await loadSave(env, auth.user.id),
    coins: row.coins,
    name: row.name,
    chest: Boolean(row.chest),
    streak,
  });
}

/**
 * Progress, claims, chests and the streak for the current periods. Pack
 * quests count pack_log (a box is 36 packs, a battle's packs count too); the
 * rest come from quest_events, which the Worker writes where each thing
 * happens. Progress is only returned for the quests that are active today.
 */
async function questSummary(env, userId, counters = null) {
  const periods = questPeriods();
  const active = activeQuests(periods);
  const chestRows = activeChests(active);
  const base = {
    periods,
    active: {
      daily: active.daily.map((row) => row.id),
      weekly: active.weekly.map((row) => row.id),
      monthly: active.monthly.map((row) => row.id),
    },
    progress: {},
    claimed: [],
    streak: 0,
    streakBest: 0,
    chests: { daily: false, weekly: false, monthly: false },
    chestCoins: { daily: chestRows.daily.coins, weekly: chestRows.weekly.coins, monthly: chestRows.monthly.coins },
  };
  if (!(await ensureQuestSchema(env))) return { ...base, unavailable: true };
  try {
    // Settled battles become events before progress is read (a claim asks too).
    const stored = counters || (await syncBattleStats(env, userId, await loadCounters(env, userId)));
    const [packs, eventRows, claimRows] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS monthly, SUM(CASE WHEN at >= ? THEN 1 ELSE 0 END) AS weekly,
           SUM(CASE WHEN at >= ? THEN 1 ELSE 0 END) AS daily FROM pack_log WHERE user_id = ? AND at >= ?`
      ).bind(periods.weekly, periods.daily, userId, periods.monthly).first(),
      env.DB.prepare(
        `SELECT kind, SUM(amount) AS monthly, SUM(CASE WHEN at >= ? THEN amount ELSE 0 END) AS weekly,
           SUM(CASE WHEN at >= ? THEN amount ELSE 0 END) AS daily FROM quest_events WHERE user_id = ? AND at >= ? GROUP BY kind`
      ).bind(periods.weekly, periods.daily, userId, periods.monthly).all(),
      env.DB.prepare(
        "SELECT quest_id, period_start FROM quest_claims WHERE user_id = ? AND period_start IN (?, ?, ?)"
      ).bind(userId, periods.daily, periods.weekly, periods.monthly).all(),
    ]);
    const events = eventRows.results || [];
    const claims = claimRows.results || [];
    const counts = { packs: { daily: packs?.daily || 0, weekly: packs?.weekly || 0, monthly: packs?.monthly || 0 } };
    for (const row of events) counts[row.kind] = { daily: row.daily || 0, weekly: row.weekly || 0, monthly: row.monthly || 0 };

    const have = new Set(claims.map((row) => `${row.quest_id}:${row.period_start}`));
    const claimed = [];
    const progress = {};
    const chests = {};
    for (const period of ["daily", "weekly", "monthly"]) {
      let all = true;
      const needs = new Set(chestRows[period].needs);
      for (const row of active[period]) {
        progress[row.id] = counts[row.kind]?.[period] || 0;
        if (have.has(`${row.id}:${periods[period]}`)) claimed.push(row.id);
        else if (needs.has(row.id)) all = false;
      }
      chests[period] = all;
      if (have.has(`${chestRows[period].id}:${periods[period]}`)) claimed.push(chestRows[period].id);
    }

    const today = Math.floor(periods.daily / DAY_MS);
    // A streak survives until a whole UTC day passes without a claim.
    const live = (stored._streakDay || 0) >= today - 1 ? stored.streak || 0 : 0;
    return {
      ...base,
      progress,
      claimed,
      chests,
      streak: live,
      streakBest: Math.max(stored.streakBest || 0, live),
    };
  } catch (err) {
    if (isMissingTable(err)) return { ...base, unavailable: true };
    throw err;
  }
}

async function sell(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const cardId = String(body?.cardId || "");
  if (!cardId) return json({ error: "Missing card." }, 400);

  const owned = await env.DB.prepare(
    "SELECT qty, reverse_qty FROM cards WHERE user_id = ? AND card_id = ?"
  )
    .bind(auth.user.id, cardId)
    .first();
  if (!owned || owned.qty < 1) return json({ error: "You don't own that card." }, 400);

  const card = await findCatalogCard(env, request, cardId);
  if (!card) return json({ error: "Unknown card." }, 400);
  const value = sellValue(card);

  const nextQty = owned.qty - 1;
  const nextReverse = owned.reverse_qty > 0 ? owned.reverse_qty - 1 : 0;
  const profile = await env.DB.prepare("SELECT binder FROM profiles WHERE user_id = ?")
    .bind(auth.user.id)
    .first();
  const binder = reconcileBinder(parseJson(profile?.binder, emptyBinder()), await ownedWithSlabs(env, auth.user.id, {
    ...((await inventoryMap(env, auth.user.id)).collection),
    [cardId]: nextQty,
  }));

  // Awarding a battle can change this row between the read and write. Compare
  // its exact snapshot before paying; D1 batch is the credit/decrement transaction.
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE profiles SET coins = coins + ?,
      binder = CASE WHEN binder IS ? THEN ? ELSE binder END WHERE user_id = ?
      AND EXISTS(SELECT 1 FROM cards WHERE user_id = ? AND card_id = ? AND qty = ? AND reverse_qty = ?)`)
      .bind(value, profile?.binder ?? null, JSON.stringify(binder), auth.user.id, auth.user.id, cardId, owned.qty, owned.reverse_qty),
    env.DB.prepare(`UPDATE cards SET qty = qty - 1, reverse_qty = MAX(reverse_qty - 1, 0)
      WHERE user_id = ? AND card_id = ? AND changes() = 1`).bind(auth.user.id, cardId),
    env.DB.prepare('DELETE FROM cards WHERE user_id = ? AND card_id = ? AND qty = 0').bind(auth.user.id, cardId),
  ]);
  if (!results[0]?.meta?.changes) return json({ error: 'Collection changed. Try again.' }, 409);

  await recordActivity(env, auth.user.id, { event: owned.qty > 1 ? "sold" : null, counter: "sold" });
  const save = await loadSave(env, auth.user.id);
  return json({ save, value });
}

async function sellDuplicates(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  const setId = String(body?.setId || "");
  const set = ALL_SETS.find(row => row.id === setId);
  if (!set) return json({ error: "Unknown set." }, 400);

  // The ME black star promos are filed under the Mega Evolution sets' ids
  // ("me5-mep055") but belong to the "mep" set, so a set sells the rows it owns.
  const owned = ((await env.DB.prepare(
    "SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? AND (card_id LIKE ? OR card_id LIKE 'me%-mep%') AND qty > 1"
  ).bind(auth.user.id, `${setId}-%`).all()).results || []).filter(row => homeSetId(row.card_id) === setId);
  if (!owned.length) return json({ error: "No duplicates to sell in this set." }, 400);

  const catalog = new Map((await loadSetCards(env, request, set)).map(card => [card.id, card]));
  const rows = owned.filter(row => catalog.has(row.card_id));
  if (!rows.length) return json({ error: "No priced duplicates to sell." }, 400);
  const value = money(rows.reduce((sum, row) => sum + (row.qty - 1) * sellValue(catalog.get(row.card_id)), 0));
  const copies = rows.reduce((sum, row) => sum + row.qty - 1, 0);
  const ids = rows.map(row => row.card_id);
  const collection = (await inventoryMap(env, auth.user.id)).collection;
  for (const id of ids) collection[id] = 1;
  const profile = await env.DB.prepare("SELECT binder FROM profiles WHERE user_id = ?")
    .bind(auth.user.id).first();
  const binder = reconcileBinder(parseJson(profile?.binder, emptyBinder()), await ownedWithSlabs(env, auth.user.id, collection));
  // Compare every priced row, not just aggregate copies (different cards have
  // different values). JSON keeps arbitrarily large sets below D1's bind limit.
  const snapshot = JSON.stringify(rows);
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE profiles SET coins = coins + ?, binder = CASE WHEN binder IS ? THEN ? ELSE binder END WHERE user_id = ?
       AND NOT EXISTS(SELECT 1 FROM json_each(?) s LEFT JOIN cards c
         ON c.user_id = ? AND c.card_id = json_extract(s.value, '$.card_id')
         WHERE c.qty IS NULL OR c.qty != json_extract(s.value, '$.qty')
           OR c.reverse_qty != json_extract(s.value, '$.reverse_qty'))`
    ).bind(value, profile?.binder ?? null, JSON.stringify(binder), auth.user.id, snapshot, auth.user.id),
    env.DB.prepare(
      `UPDATE cards SET qty = 1, reverse_qty = MIN(reverse_qty, 1)
       WHERE user_id = ? AND card_id IN (SELECT json_extract(value, '$.card_id') FROM json_each(?))
         AND qty > 1 AND changes() = 1`
    ).bind(auth.user.id, snapshot),
  ]);
  if (!results[0]?.meta?.changes) return json({ error: "Collection changed. Try again." }, 409);
  await recordActivity(env, auth.user.id, { event: "sold", counter: "sold", amount: copies });
  return json({ save: await loadSave(env, auth.user.id), copies, value });
}

async function putBinder(request, env) {
  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!Array.isArray(body?.binder)) return json({ error: "Binder must be a list of pockets." }, 400);
  if (body.binder.length > BINDER_MAX_SLOTS) return json({ error: "Binder is too large." }, 400);

  const collection = await ownedWithSlabs(env, auth.user.id, (await inventoryMap(env, auth.user.id)).collection);
  const binder = normalizeBinder(body.binder);
  const held = {};
  for (const slot of binder) {
    if (!slot) continue;
    held[slot.id] = (held[slot.id] || 0) + 1;
    if (held[slot.id] > (collection[slot.id] || 0)) {
      return json({ error: "That pocket needs a card you own." }, 400);
    }
  }
  await env.DB.prepare("UPDATE profiles SET binder = ? WHERE user_id = ?")
    .bind(JSON.stringify(binder), auth.user.id)
    .run();
  const save = await loadSave(env, auth.user.id);
  return json({ save });
}

async function requireUser(request, env) {
  const sid = readCookie(request, COOKIE);
  if (!sid) return { response: json({ error: "Sign in first." }, 401) };
  const row = await env.DB.prepare(
    `SELECT sessions.id AS sid, sessions.expires_at AS expires_at, users.*
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ?`
  )
    .bind(sid)
    .first();
  if (!row || row.expires_at < Date.now()) {
    if (sid) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return { response: json({ error: "Sign in first." }, 401, clearCookie(request)) };
  }
  const { sid: _s, expires_at: _e, ...user } = row;
  return { user };
}

async function createSession(env, userId, now) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(token, userId, now, now + SESSION_MS)
    .run();
  return token;
}

let claimedColumnReady = false;

/**
 * `profiles.claimed` arrived after the first deploy, so add it on demand the
 * way ensureSocialSchema does for the users table.
 */
async function ensureAchievementSchema(env) {
  if (claimedColumnReady) return;
  try {
    const info = await env.DB.prepare("PRAGMA table_info(profiles)").all();
    const have = new Set((info.results || []).map((row) => row.name));
    if (!have.has("claimed")) {
      await env.DB.exec("ALTER TABLE profiles ADD COLUMN claimed TEXT;");
    }
    claimedColumnReady = true;
  } catch (err) {
    if (String(err?.message || err).toLowerCase().includes("duplicate")) {
      claimedColumnReady = true;
      return;
    }
    console.error("ensureAchievementSchema", err);
  }
}

/** Only ids that still exist in the table, deduped. */
function normalizeClaimed(list) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const id of list) {
    if (achievementById(id)) out.add(String(id));
  }
  return [...out];
}

async function rarityCountsFor(env, request, collection) {
  return (await ownedCardsFor(env, request, collection)).rarities;
}

/**
 * Rarity counts plus `cards`, `{ id, name, rarity, setId }` for every owned
 * card the catalog knows: the `opts.cards` that achievementContext reads.
 * Callers hand it ownedMap(save), so a copy sitting in a slab still counts.
 */
async function ownedCardsFor(env, request, collection) {
  const rarities = {};
  const cards = [];
  for (const [id, n] of Object.entries(collection || {})) {
    if (!n) continue;
    const card = await findCatalogCard(env, request, id);
    if (!card) continue;
    if (card.rarity) rarities[card.rarity] = (rarities[card.rarity] || 0) + 1;
    const setId = homeSetId(id);
    const set = ALL_SETS.find((row) => row.id === setId);
    cards.push({ id: card.id, name: card.name, rarity: card.rarity, setId: set ? set.id : setId });
  }
  return { rarities, cards };
}

async function loadSave(env, userId) {
  await ensureQuestSchema(env);
  // Independent reads, run together: this is called on every rip.
  // Battle results are folded into the counters here, at read time (no triggers).
  const [profile, inventory, historyRows, counters, setPacks, friends, xpRow] = await Promise.all([
    env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(userId).first(),
    inventoryMap(env, userId),
    env.DB.prepare(
      `SELECT card_id AS id, name, rarity, reverse, was_new AS wasNew, pack_id AS packId, at
       FROM history WHERE user_id = ? ORDER BY at DESC LIMIT 24`
    )
      .bind(userId)
      .all()
      .then((res) => res.results || []),
    // Casino and grading counts come from their own tables (worker/xp.js).
    Promise.all([
      loadCounters(env, userId).then((stored) => syncBattleStats(env, userId, stored)),
      loadXpCounters(env, userId),
    ]).then(([stored, tables]) => ({ ...stored, ...tables })),
    setPacksFor(env, userId),
    friendsCount(env, userId),
    readXpRow(env, userId),
  ]);
  if (!profile) fail("Missing profile.", 500);
  const { collection, reverses } = inventory;
  const quests = await questSummary(env, userId, counters);
  const save = {
    coins: money(profile.coins),
    collection,
    reverses,
    lastDaily: profile.last_daily,
    packsOpened: profile.packs_opened || 0,
    pulls: profile.pulls || 0,
    packsSinceHit: profile.packs_since_hit || 0,
    packTrick: Boolean(profile.pack_trick),
    history: historyRows.map((row) => ({
      id: row.id,
      name: row.name,
      rarity: row.rarity,
      reverse: Boolean(row.reverse),
      wasNew: Boolean(row.wasNew),
      packId: row.packId,
      at: row.at,
    })),
    granted: money(profile.granted),
    claimed: normalizeClaimed(parseJson(profile.claimed, [])),
    quests,
    stats: { setPacks, counters: publicCounters(counters, quests), friends },
    gear: await gearSummary(env, userId),
    // Active slabs, valued at today's market. `collection` stays the raw sellable
    // counts; ownedMap(save) (js/titles.js) unions the two for completion counts.
    graded: await gradedSlabs(env, userId, { findCatalogCard }),
    // Sealed products kept unopened (the sealed collection), all copies.
    vaultKept: await vaultKept(env, userId),
    activeSetId: profile.active_set_id || "me5",
    createdAt: profile.created_at,
    binder: normalizeBinder(parseJson(profile.binder, emptyBinder())),
    worthLog: Array.isArray(parseJson(profile.worth_log, [])) ? parseJson(profile.worth_log, []).slice(-200) : [],
  };
  // XP is worked out from the finished save (slabs and all), then kept as a high-water mark.
  save.xp = await syncXp(env, userId, save, xpRow);
  return save;
}

/** Counters as the client sees them: no bookkeeping keys, the live streak, the known keys always present. */
function publicCounters(stored, quests) {
  const out = {};
  for (const key of COUNTER_KEYS) out[key] = 0;
  for (const [key, value] of Object.entries(stored || {})) {
    if (!key.startsWith("_")) out[key] = value;
  }
  out.streak = quests?.streak || 0;
  out.streakBest = quests?.streakBest || 0;
  return out;
}

async function runBatches(env, stmts) {
  for (let i = 0; i < stmts.length; i += 40) {
    await env.DB.batch(stmts.slice(i, i + 40));
  }
}

async function inventoryMap(env, userId) {
  const rows =
    (await env.DB.prepare("SELECT card_id, qty, reverse_qty FROM cards WHERE user_id = ? AND qty > 0").bind(userId).all())
      .results || [];
  const collection = {};
  const reverses = {};
  for (const row of rows) {
    collection[row.card_id] = row.qty;
    if (row.reverse_qty > 0) reverses[row.card_id] = row.reverse_qty;
  }
  return { collection, reverses };
}

async function loadSetCards(env, request, set) {
  if (setCache.has(set.id)) return setCache.get(set.id);
  if (set.viewOf) {
    // ME Black Star Promos: the promos filed in the Mega Evolution sets' files.
    const lists = await Promise.all(dataSetsOf(set).map((source) => loadSetCards(env, request, source)));
    const own = homeCards(set, lists);
    setCache.set(set.id, own);
    return own;
  }
  const path = set.dataFile.startsWith("/") ? set.dataFile : `/${set.dataFile}`;
  const res = await env.ASSETS.fetch(new Request(new URL(path, request.url), { method: "GET" }));
  if (!res.ok) fail(`Missing set data for ${set.id}.`, 500);
  const cards = await res.json();
  const all = [...cards, ...BASIC_ENERGY];
  setCache.set(set.id, all);
  return all;
}

async function loadSealed(env, request) {
  try {
    if (!sealedCache) {
      const res = await env.ASSETS.fetch(new Request(new URL("/data/sealed.json", request.url), { method: "GET" }));
      if (!res.ok) return {};
      sealedCache = await res.json();
    }
  } catch {
    return {};
  }
  return sealedCache || {};
}

async function loadProducts(env, request) {
  try {
    if (!productsCache) {
      const res = await env.ASSETS.fetch(new Request(new URL("/data/products.json", request.url), { method: "GET" }));
      if (!res.ok) return {};
      productsCache = await res.json();
    }
  } catch {
    return {};
  }
  return productsCache || {};
}

/** data/box-contents.json: the single cards each box holds beyond packs and promos, by "set/product". */
async function loadBoxContents(env, request) {
  try {
    if (!boxContentsCache) {
      const res = await env.ASSETS.fetch(new Request(new URL("/data/box-contents.json", request.url), { method: "GET" }));
      if (!res.ok) return {};
      boxContentsCache = await res.json();
    }
  } catch {
    return {};
  }
  return boxContentsCache || {};
}

async function packCost(env, request, set) {
  const pack = (await loadSealed(env, request))?.[set.id]?.boosterPack;
  if (typeof pack === "number" && pack > 0) return money(pack);
  return money(set.cost);
}

async function findCatalogCard(env, request, cardId) {
  if (cardId.startsWith("energy-")) {
    return BASIC_ENERGY.find((card) => card.id === cardId) || null;
  }
  // ALL_SETS, not PLAYABLE_SETS — a card from a retired set is still owned,
  // still worth coins, and still has to price when its owner sells it.
  const match = ALL_SETS.find((set) => cardId.startsWith(`${set.id}-`));
  const set = match || getSet(cardId.split("-")[0]);
  const cards = await loadSetCards(env, request, set);
  return cards.find((card) => card.id === cardId) || null;
}

async function trimHistory(env, userId) {
  try {
    await env.DB.prepare(
      `DELETE FROM history WHERE user_id = ? AND id NOT IN (
        SELECT id FROM (SELECT id FROM history WHERE user_id = ? ORDER BY at DESC LIMIT 24)
      )`
    )
      .bind(userId, userId)
      .run();
  } catch {
    /* extras are fine; GET /api/me already caps at 24 */
  }
}

function inventoryInserts(env, userId, collection, reverses) {
  const stmts = [];
  for (const [cardId, raw] of Object.entries(collection || {})) {
    const qty = clampInt(raw, 0, MAX_QTY);
    if (!qty || !safeCardId(cardId)) continue;
    const reverseQty = Math.min(qty, clampInt(reverses?.[cardId], 0, MAX_QTY));
    stmts.push(
      env.DB.prepare("INSERT INTO cards (user_id, card_id, qty, reverse_qty) VALUES (?, ?, ?, ?)").bind(
        userId,
        cardId,
        qty,
        reverseQty
      )
    );
  }
  return stmts;
}

function historyInserts(env, userId, history) {
  return (Array.isArray(history) ? history : [])
    .slice(0, 24)
    .filter((row) => row && safeCardId(row.id || row.card_id))
    .map((row) =>
      env.DB.prepare(
        `INSERT INTO history (user_id, card_id, name, rarity, reverse, was_new, pack_id, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        String(row.id || row.card_id),
        String(row.name || "").slice(0, 80),
        String(row.rarity || "").slice(0, 40),
        row.reverse ? 1 : 0,
        row.wasNew ? 1 : 0,
        row.packId ? String(row.packId).slice(0, 40) : null,
        Number(row.at) || Date.now()
      )
    );
}

/**
 * A guest save lives in localStorage, so nothing in it can be verified — but
 * it can be held to what a guest could plausibly have reached. The claim is
 * capped by hourly bonuses since the save was made plus a generous per-pack
 * sell yield, and the collection by what that many packs could have contained.
 * Real guests clear these by a wide margin; without them a single
 * unauthenticated signup mints a maxed account.
 */
function sanitizeClaim(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.coins !== "number" || !raw.collection || typeof raw.collection !== "object") return null;

  const now = Date.now();
  const createdAt =
    typeof raw.createdAt === "number"
      ? Math.min(now, Math.max(now - CLAIM_MAX_AGE_MS, raw.createdAt))
      : now;
  const packsOpened = clampInt(raw.packsOpened, 0, 1_000_000);
  const hours = Math.max(0, (now - createdAt) / (60 * 60 * 1000));
  const coinCap = Math.min(
    CLAIM_MAX_COINS,
    STARTING_COINS + hours * DAILY_BONUS + packsOpened * CLAIM_PACK_YIELD
  );
  const cardCap = Math.min(MAX_CLAIM_CARDS, BINDER_PAGE + packsOpened * CLAIM_CARDS_PER_PACK);

  const collection = {};
  let n = 0;
  for (const [id, qty] of Object.entries(raw.collection)) {
    if (!safeCardId(id)) continue;
    collection[id] = clampInt(qty, 0, MAX_QTY);
    n += 1;
    if (n >= cardCap) break;
  }
  const reverses = {};
  if (raw.reverses && typeof raw.reverses === "object") {
    for (const [id, qty] of Object.entries(raw.reverses)) {
      if (!collection[id]) continue;
      reverses[id] = Math.min(collection[id], clampInt(qty, 0, MAX_QTY));
    }
  }
  return {
    coins: Math.min(coinCap, Math.max(0, money(raw.coins))),
    collection,
    reverses,
    lastDaily: typeof raw.lastDaily === "number" ? Math.min(now, raw.lastDaily) : null,
    packsOpened,
    pulls: clampInt(raw.pulls, 0, packsOpened * CLAIM_CARDS_PER_PACK),
    packsSinceHit: clampInt(raw.packsSinceHit, 0, packsOpened),
    packTrick: Boolean(raw.packTrick),
    granted: Math.min(coinCap, Math.max(0, money(raw.granted ?? raw.coins))),
    activeSetId: PLAYABLE_SETS.some((set) => set.id === raw.activeSetId) ? raw.activeSetId : "me5",
    createdAt,
    binder: normalizeBinder(raw.binder),
    worthLog: Array.isArray(raw.worthLog) ? raw.worthLog.slice(-200) : [],
    history: Array.isArray(raw.history) ? raw.history.slice(0, 24) : [],
  };
}

function emptyBinder() {
  return Array.from({ length: BINDER_PAGE * 2 }, () => null);
}

function normalizeBinder(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, BINDER_MAX_SLOTS) : [];
  while (list.length < BINDER_PAGE * 2) list.push(null);
  while (list.length % BINDER_PAGE !== 0) list.push(null);
  return list.map((slot) => {
    if (!slot || typeof slot !== "object" || !safeCardId(slot.id)) return null;
    return { id: String(slot.id), reverse: Boolean(slot.reverse) };
  });
}

/** A raw collection map plus one per active slab: what a binder pocket may hold. */
async function ownedWithSlabs(env, userId, collection) {
  const merged = { ...(collection || {}) };
  for (const [id, n] of Object.entries(await gradedCounts(env, userId))) merged[id] = (merged[id] || 0) + n;
  return merged;
}

function reconcileBinder(binder, collection) {
  const slots = normalizeBinder(binder);
  const budget = {};
  return slots.map((slot) => {
    if (!slot) return null;
    budget[slot.id] = (budget[slot.id] || 0) + 1;
    if (budget[slot.id] > (collection[slot.id] || 0)) return null;
    return slot;
  });
}

/** The player's own user object with their level and total XP (from the save loadSave just built). */
/** A user payload with level, xp (from the fresh save when there is one), the equipped frame and the perks. */
async function userWithLevel(env, user, row, save) {
  return { ...withLevel(user, save), ...(await levelFields(env, row, save?.xp?.level ?? null)) };
}

function withLevel(user, save) {
  return save?.xp ? { ...user, level: save.xp.level, xp: save.xp.total } : user;
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    color: row.color,
    bio: row.bio || "",
    title: row.title || "Rookie",
    createdAt: row.created_at,
    lastPlayed: row.last_played,
    ...socialUserFields(row),
  };
}

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 16);
}

function safeCardId(id) {
  return typeof id === "string" && /^[a-z0-9-]{3,48}$/i.test(id);
}

function clampInt(n, min, max) {
  const v = Math.floor(Number(n) || 0);
  return Math.min(max, Math.max(min, v));
}

function newId() {
  return hex(crypto.getRandomValues(new Uint8Array(8)));
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToB64(bytes) {
  let s = "";
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

async function hashPassword(password, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    key,
    256
  );
  return `${bytesToB64(salt)}:${bytesToB64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  if (!password || !stored || !stored.includes(":")) return false;
  const [saltB64] = stored.split(":");
  const next = await hashPassword(password, b64ToBytes(saltB64));
  return next === stored;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** How many cards a player has pinned already, so a level check never cuts a saved showcase. */
function savedShowcaseCount(raw) {
  const saved = parseJson(raw, []);
  return Array.isArray(saved) ? Math.min(SHOWCASE_MAX, saved.length) : 0;
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]+)`));
  return match?.[1] || "";
}

function sessionCookie(request, token) {
  return cookieHeader(request, token, SESSION_DAYS * 24 * 60 * 60);
}

function clearCookie(request) {
  return cookieHeader(request, "", 0);
}

function cookieHeader(request, token, maxAge) {
  const https = new URL(request.url).protocol === "https:";
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (https) parts.push("Secure");
  return parts.join("; ");
}

function json(data, status = 200, setCookie = "") {
  const headers = { ...jsonHeaders };
  if (setCookie) headers["set-cookie"] = setCookie;
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}
