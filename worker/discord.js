/* The Discord feed: big pulls, Black Label slabs and new patch notes, posted into the
   community server through channel webhooks.

   Nothing runs unless a webhook is set. Two Worker secrets switch the two feeds on:
   DISCORD_PULLS_WEBHOOK (the pulls channel) and DISCORD_NOTES_WEBHOOK (patch notes).
   With neither set this module queues and posts nothing, so the site behaves as before.

   A pull is queued in the same batch that saves the rip (an outbox row in discord_feed), so
   a post is never lost and never fires for a rip that did not happen. The request that
   queued it then flushes the outbox in the background (ctx.waitUntil), and the 10-minute cron
   flushes whatever is left (a failed post is retried until it is an hour old). Each trainer
   chooses whether their pulls are shared (users.feed_share, on unless they turn it off in
   Settings). Nobody can run remote migrations, so the table and column are created on demand
   like the other worker/*.js modules do. */

import { money } from "../js/catalog.js";
import { gradedValue } from "../js/grading-rules.js";

export const DISCORD_INVITE = "vmb8zuYgne";
export const DISCORD_URL = `https://discord.gg/${DISCORD_INVITE}`;

const SITE = "https://poke-pack.rip";
const GOLD = 0xe8b84a;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// A card is shared when it is worth this much or more, or when its rarity is Special Illustration Rare or above.
export const BIG_PRICE = 100;
export const TOP_RARITIES = new Set([
  "Special Illustration Rare",
  "Hyper Rare",
  "Mega Hyper Rare",
  "Black White Rare",
  "RGB Rare",
  "Rare Secret",
  "Rare Rainbow",
  "Rare Holo Star",
  "Rare Crystal",
  "Rare Shiny Legendary",
  "LEGEND",
]);
// At most this many posts per trainer per hour, so one box opening spree cannot flood the channel.
const POSTS_PER_HOUR = 6;
const CARDS_PER_POST = 4;
const NOTES_PER_RUN = 3;

let schemaReady = false;

export async function ensureFeedSchema(env) {
  if (schemaReady) return;
  const info = await env.DB.prepare("PRAGMA table_info(users)").all();
  const have = new Set((info.results || []).map((row) => row.name));
  if (!have.has("feed_share")) {
    try {
      await env.DB.exec("ALTER TABLE users ADD COLUMN feed_share INTEGER NOT NULL DEFAULT 1;");
    } catch (err) {
      if (!String(err?.message || err).toLowerCase().includes("duplicate")) throw err;
    }
  }
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS discord_feed (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, user_id TEXT, payload TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER);"
  );
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_discord_feed_open ON discord_feed(sent_at, id);");
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS discord_posted (kind TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (kind, key));"
  );
  schemaReady = true;
}

export const sharesFeed = (row) => row?.feed_share == null || Number(row.feed_share) !== 0;

export function isBigPull(card) {
  if (!card || card.reverse) return false;
  return TOP_RARITIES.has(card.rarity) || Number(card.market) >= BIG_PRICE;
}

const cardRef = (card, set) => ({
  id: card.id,
  name: card.name,
  number: card.number,
  rarity: card.rarity,
  price: money(card.market || 0),
  image: card.image || card.imageRemote || null,
  set: set?.name || "",
});

/* The outbox statement for one opened batch of packs (worker/index.js openPacks adds it to the
   rip's own batch), or [] when nothing is worth sharing, the trainer opted out, or no pulls
   webhook is set. */
export async function pullFeedStmts(env, userId, live, packs, promos = [], boxCards = [], now = Date.now()) {
  if (!env.DISCORD_PULLS_WEBHOOK) return [];
  try {
    const found = new Map();
    const add = (card, set) => {
      if (!isBigPull(card)) return;
      const key = card.id;
      const seen = found.get(key);
      if (seen) seen.count += card.n && card.n > 1 ? card.n : 1;
      else found.set(key, { ...cardRef(card, set), count: card.n && card.n > 1 ? card.n : 1 });
    };
    for (const pack of packs) for (const card of pack.cards) add(card, pack.set || live);
    for (const card of promos) add(card, live);
    for (const card of boxCards) add(card, live);
    if (!found.size) return [];
    await ensureFeedSchema(env);
    const user = await env.DB.prepare("SELECT name, handle, feed_share FROM users WHERE id = ?").bind(userId).first();
    if (!user || !sharesFeed(user)) return [];
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM discord_feed WHERE user_id = ? AND created_at > ?")
      .bind(userId, now - HOUR_MS)
      .first();
    if ((recent?.n || 0) >= POSTS_PER_HOUR) return [];
    const best = [...found.values()].sort((a, b) => b.price - a.price).slice(0, CARDS_PER_POST);
    const payload = { name: user.name, handle: user.handle, cards: best, more: found.size - best.length };
    return [
      env.DB.prepare("INSERT INTO discord_feed (kind, user_id, payload, created_at) VALUES ('pulls', ?, ?, ?)").bind(
        userId,
        JSON.stringify(payload),
        now
      ),
    ];
  } catch (err) {
    console.error("discord feed (queue)", err);
    return [];
  }
}

/* Queue a Black Label 10 (worker/grading.js calls this after the slab is saved). */
export async function queueBlackLabel(env, user, card, set, now = Date.now()) {
  if (!env.DISCORD_PULLS_WEBHOOK) return;
  try {
    await ensureFeedSchema(env);
    const row = await env.DB.prepare("SELECT name, handle, feed_share FROM users WHERE id = ?").bind(user.id).first();
    if (!row || !sharesFeed(row)) return;
    const payload = {
      name: row.name,
      handle: row.handle,
      card: { ...cardRef(card, set), slab: money(gradedValue(card, 10, set, true)) },
    };
    await env.DB.prepare("INSERT INTO discord_feed (kind, user_id, payload, created_at) VALUES ('blacklabel', ?, ?, ?)")
      .bind(user.id, JSON.stringify(payload), now)
      .run();
  } catch (err) {
    console.error("discord feed (black label)", err);
  }
}

const usd = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const imageUrl = (path) => (path ? (/^https?:/.test(path) ? path : `${SITE}/${String(path).replace(/^\//, "")}`) : null);
const trim = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1).trimEnd()}…` : String(text));

export function pullMessage(payload) {
  const author = { name: `@${payload.handle} pulled`, url: `${SITE}/u/${payload.handle}` };
  const single = payload.cards.length === 1;
  const embeds = payload.cards.map((card, i) => {
    const count = card.count > 1 ? ` (x${card.count})` : "";
    const image = imageUrl(card.image);
    const embed = {
      color: GOLD,
      title: trim(`${card.name}${count}`, 250),
      description: `${card.rarity}${card.set ? ` from ${card.set}` : ""}\n**${usd(card.price)}** market value`,
    };
    if (i === 0) embed.author = author;
    if (image) embed[single ? "image" : "thumbnail"] = { url: image };
    return embed;
  });
  if (payload.more > 0) {
    embeds[embeds.length - 1].footer = { text: `and ${payload.more} more big pull${payload.more === 1 ? "" : "s"}` };
  }
  return { embeds };
}

export function blackLabelMessage(payload) {
  const card = payload.card;
  const image = imageUrl(card.image);
  const embed = {
    color: 0x0b0b0d,
    author: { name: `@${payload.handle} graded`, url: `${SITE}/u/${payload.handle}` },
    title: trim(`Black Label 10: ${card.name}`, 250),
    description: `All four subgrades are 10.\n${card.rarity}${card.set ? ` from ${card.set}` : ""}\n**${usd(card.slab)}** as a slab`,
  };
  if (image) embed.image = { url: image };
  return { embeds: [embed] };
}

export function noteMessage(entry) {
  const lines = [];
  const take = (items) => {
    for (const item of items || []) lines.push(`• ${trim(item, 220)}`);
  };
  take(entry.items);
  for (const group of entry.groups || []) {
    lines.push(`**${trim(group.title, 100)}**`);
    take(group.items);
  }
  let body = "";
  let used = 0;
  for (const line of lines) {
    if (body.length + line.length + 1 > 1400) break;
    body += `${body ? "\n" : ""}${line}`;
    used += 1;
  }
  const rest = lines.length - used;
  const url = `${SITE}/notes#note-${entry.id}`;
  return {
    embeds: [
      {
        color: GOLD,
        title: trim(entry.title, 250),
        url,
        description: [trim(entry.summary || "", 600), body, rest > 0 ? `[Read the rest on the site](${url})` : ""]
          .filter(Boolean)
          .join("\n\n"),
        ...(entry.date ? { footer: { text: entry.date } } : {}),
      },
    ],
  };
}

/* One webhook call. "sent" and "drop" settle the row; "retry" leaves it for the next flush. */
async function post(hook, message, fetcher) {
  let res;
  try {
    res = await fetcher(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "poke-pack.rip",
        avatar_url: `${SITE}/assets/avatar-round.png`,
        allowed_mentions: { parse: [] },
        ...message,
      }),
    });
  } catch {
    return "retry";
  }
  if (res.ok) return "sent";
  if (res.status === 429 || res.status >= 500) return "retry";
  return "drop"; // the message itself is refused (a deleted webhook, a bad embed): retrying cannot help
}

export async function flushFeed(env, { now = Date.now(), fetcher = fetch, limit = 6 } = {}) {
  const hook = env.DISCORD_PULLS_WEBHOOK;
  if (!hook) return { sent: 0 };
  await ensureFeedSchema(env);
  await env.DB.prepare("DELETE FROM discord_feed WHERE (sent_at IS NULL AND created_at < ?) OR (sent_at IS NOT NULL AND sent_at < ?)")
    .bind(now - HOUR_MS, now - DAY_MS)
    .run();
  const rows =
    (await env.DB.prepare("SELECT id, kind, payload FROM discord_feed WHERE sent_at IS NULL ORDER BY id LIMIT ?").bind(limit).all())
      .results || [];
  let sent = 0;
  for (const row of rows) {
    // Claim first so two flushes at once never post the same pull twice.
    const claim = await env.DB.prepare("UPDATE discord_feed SET sent_at = ? WHERE id = ? AND sent_at IS NULL").bind(now, row.id).run();
    if (!claim.meta?.changes) continue;
    const payload = JSON.parse(row.payload);
    const outcome = await post(hook, row.kind === "blacklabel" ? blackLabelMessage(payload) : pullMessage(payload), fetcher);
    if (outcome === "retry") {
      await env.DB.prepare("UPDATE discord_feed SET sent_at = NULL WHERE id = ?").bind(row.id).run();
      break; // rate limited or Discord is down: try again on the next flush
    }
    if (outcome === "sent") sent += 1;
  }
  return { sent };
}

/* Post patch notes that appeared on the site since the last run. The first run only records what
   is already published (so turning the feed on never replays the whole history), except the
   entries dated today, which are posted. */
export async function postNewPatchNotes(env, { now = Date.now(), fetcher = fetch } = {}) {
  const hook = env.DISCORD_NOTES_WEBHOOK;
  if (!hook) return { posted: 0 };
  await ensureFeedSchema(env);
  const res = await env.ASSETS.fetch(new Request(`${SITE}/data/patch-notes.json`));
  if (!res.ok) return { posted: 0 };
  const entries = (await res.json()).filter((entry) => entry?.id && entry.title);
  const done = new Set(
    ((await env.DB.prepare("SELECT key FROM discord_posted WHERE kind = 'notes'").all()).results || []).map((row) => row.key)
  );
  if (!done.has("__started")) {
    const today = new Date(now).toISOString().slice(0, 10);
    const stmts = entries
      .filter((entry) => entry.date < today)
      .map((entry) => env.DB.prepare("INSERT OR IGNORE INTO discord_posted (kind, key, at) VALUES ('notes', ?, ?)").bind(entry.id, now));
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO discord_posted (kind, key, at) VALUES ('notes', '__started', ?)").bind(now));
    await env.DB.batch(stmts);
    for (const entry of entries) if (entry.date < today) done.add(entry.id);
  }
  const waiting = entries.filter((entry) => !done.has(entry.id)).reverse().slice(0, NOTES_PER_RUN); // oldest first
  let posted = 0;
  for (const entry of waiting) {
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO discord_posted (kind, key, at) VALUES ('notes', ?, ?)").bind(entry.id, now).run();
    if (!claim.meta?.changes) continue;
    const outcome = await post(hook, noteMessage(entry), fetcher);
    if (outcome === "retry") {
      await env.DB.prepare("DELETE FROM discord_posted WHERE kind = 'notes' AND key = ?").bind(entry.id).run();
      break;
    }
    if (outcome === "sent") posted += 1;
  }
  return { posted };
}
