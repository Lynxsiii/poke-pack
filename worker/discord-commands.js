/* Slash commands for the Discord server's bot, answered over HTTP (Discord's "interactions endpoint")
   instead of a long-running bot process: Discord POSTs every command here, signed with the
   application's public key, and the answer goes straight back in the response. That keeps the
   commands up around the clock on the same Worker as the site, with no extra host.

   The public key is not a secret (it only lets us check that a request came from Discord), so it
   lives in the code; env.DISCORD_PUBLIC_KEY overrides it for tests. Commands are registered once
   with scripts/register-discord-commands.mjs.

   Commands: /card (a card's rarity and price, with name suggestions as you type), /profile (a
   trainer's public profile), /notes (the latest patch note), /play (the link). */

import { ALL_SETS, RARITY_ORDER, money } from "../js/catalog.js";
import { noteMessage } from "./discord.js";

export const DISCORD_PUBLIC_KEY = "e077890c799694a0f90ef8c84dccb900603d30c69dcba01cdc47a978f8512f55";
const SITE = "https://poke-pack.rip";
const GOLD = 0xe8b84a;
const MAX_AGE_S = 300;
const SHOWN = 5; // prints looked up per /card

const hex = (text) => Uint8Array.from(text.match(/../g) || [], (byte) => parseInt(byte, 16));
const rarityRank = (name) => {
  const at = RARITY_ORDER.indexOf(name);
  return at < 0 ? 0 : at;
};

async function verified(request, body, publicKey) {
  const signature = request.headers.get("x-signature-ed25519");
  const stamp = request.headers.get("x-signature-timestamp");
  if (!signature || !stamp || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  if (Math.abs(Date.now() / 1000 - Number(stamp)) > MAX_AGE_S) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(signature), new TextEncoder().encode(stamp + body));
  } catch {
    return false;
  }
}

let indexCache = null;
async function searchIndex(env) {
  if (indexCache) return indexCache;
  const res = await env.ASSETS.fetch(new Request(`${SITE}/data/search-index.json`));
  if (!res.ok) throw new Error("search index unavailable");
  indexCache = await res.json();
  return indexCache;
}

const norm = (text) => String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* Card names that match a typed query: starts-with before contains, shortest first. */
export function matchNames(index, query, limit = 25) {
  const q = norm(query);
  if (!q) return [];
  const starts = [];
  const has = [];
  index.names.forEach((name, i) => {
    const n = norm(name);
    if (n === q || n.startsWith(q)) starts.push(i);
    else if (n.includes(q)) has.push(i);
  });
  const byLength = (a, b) => index.names[a].length - index.names[b].length || index.names[a].localeCompare(index.names[b]);
  return [...starts.sort(byLength), ...has.sort(byLength)].slice(0, limit);
}

/* The prints of those names, rarest first: [{ id, name, rarity }]. */
export function printsOf(index, nameIdx, limit) {
  const wanted = new Set(nameIdx);
  const found = [];
  for (const [setId, rows] of Object.entries(index.sets)) {
    for (const [number, name, rarity, , extra] of rows) {
      if (!wanted.has(name)) continue;
      found.push({ id: (extra && extra.id) || `${setId}-${number}`, name: index.names[name], rarity: index.rarities[rarity] });
    }
  }
  found.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
  return { total: found.length, prints: found.slice(0, limit) };
}

const usd = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const setName = (id) => ALL_SETS.find((set) => id.startsWith(`${set.id}-`))?.name || "";
const imageUrl = (path) => (path ? (/^https?:/.test(path) ? path : `${SITE}/${String(path).replace(/^\//, "")}`) : null);
const reply = (data) => ({ type: 4, data: { allowed_mentions: { parse: [] }, ...data } });
const note = (text) => reply({ content: text, flags: 64 }); // 64: only the person who ran it sees it

async function cardCommand(env, request, deps, query) {
  const index = await searchIndex(env);
  const names = matchNames(index, query, 12);
  if (!names.length) return note(`No card called "${String(query).slice(0, 60)}". Try part of the name.`);
  // The exact name wins over longer ones that merely contain it.
  const exact = names.filter((i) => norm(index.names[i]) === norm(query));
  const { total, prints } = printsOf(index, exact.length ? exact : names.slice(0, 3), 40);
  const priced = [];
  for (const print of prints.slice(0, SHOWN * 2)) {
    const card = await deps.findCatalogCard(env, request, print.id).catch(() => null);
    if (card) priced.push({ card, price: money(card.market || 0) });
    if (priced.length >= SHOWN) break;
  }
  if (!priced.length) return note("That card isn't in the game yet.");
  priced.sort((a, b) => b.price - a.price);
  const [top, ...rest] = priced;
  const embed = {
    color: GOLD,
    title: top.card.name,
    description: `${top.card.rarity}${setName(top.card.id) ? ` from ${setName(top.card.id)}` : ""}\n**${usd(top.price)}** market value`,
  };
  const image = imageUrl(top.card.image || top.card.imageSmall);
  if (image) embed.image = { url: image };
  if (rest.length) {
    embed.fields = [
      {
        name: total > priced.length ? `Other prints (${total - 1} in all)` : "Other prints",
        value: rest.map((r) => `${r.card.rarity}, ${setName(r.card.id) || r.card.id}: ${usd(r.price)}`).join("\n").slice(0, 1000),
      },
    ];
  }
  return reply({ embeds: [embed] });
}

async function profileCommand(env, deps, handle) {
  const clean = String(handle || "").trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 16);
  if (clean.length < 3) return note("Give a trainer handle, like ash.");
  const res = await deps.publicProfile(clean);
  if (res.status === 404) return note(`No trainer called @${clean}.`);
  if (!res.ok) return note("Couldn't load that profile. Try again in a moment.");
  const data = await res.json();
  const user = data.user || data.trainer || data;
  const stats = data.stats || user.stats || {};
  const lines = [];
  if (user.title) lines.push(user.title);
  if (user.level) lines.push(`Level ${user.level}${user.prestige ? `, prestige ${user.prestige}` : ""}`);
  if (stats.packs != null) lines.push(`${Number(stats.packs).toLocaleString("en-US")} packs opened`);
  if (stats.unique != null) lines.push(`${Number(stats.unique).toLocaleString("en-US")} different cards`);
  const embed = {
    color: GOLD,
    title: `${user.name || clean} (@${clean})`,
    url: `${SITE}/u/${clean}`,
    description: [user.bio ? String(user.bio).slice(0, 160) : "", lines.join("\n")].filter(Boolean).join("\n\n") || "Open the profile to see their binder.",
  };
  const pinned = (data.showcase || [])[0];
  if (pinned?.image) embed.thumbnail = { url: imageUrl(pinned.image) };
  return reply({ embeds: [embed] });
}

async function notesCommand(env) {
  const res = await env.ASSETS.fetch(new Request(`${SITE}/data/patch-notes.json`));
  const entries = res.ok ? await res.json() : [];
  if (!entries.length) return note("No patch notes yet.");
  return reply(noteMessage(entries[0]));
}

/* The route handler for POST /api/discord/interactions. */
export async function handleInteraction(request, env, deps) {
  const body = await request.text();
  if (!(await verified(request, body, env.DISCORD_PUBLIC_KEY || DISCORD_PUBLIC_KEY))) {
    return new Response("Invalid request signature", { status: 401 });
  }
  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const send = (payload) => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  if (interaction.type === 1) return send({ type: 1 }); // Discord's ping, also what saves the endpoint URL
  const options = Object.fromEntries((interaction.data?.options || []).map((option) => [option.name, option]));
  try {
    if (interaction.type === 4) {
      // Autocomplete: card names as they type.
      const typed = String(options.name?.value || "");
      const index = await searchIndex(env);
      const choices = matchNames(index, typed, 25).map((i) => ({ name: index.names[i].slice(0, 100), value: index.names[i].slice(0, 100) }));
      return send({ type: 8, data: { choices } });
    }
    if (interaction.type !== 2) return send(note("That isn't supported."));
    switch (interaction.data?.name) {
      case "card":
        return send(await cardCommand(env, request, deps, options.name?.value));
      case "profile":
        return send(await profileCommand(env, deps, options.trainer?.value));
      case "notes":
        return send(await notesCommand(env));
      case "play":
        return send(reply({ content: `Rip packs, fill the binder: ${SITE}` }));
      default:
        return send(note("I don't know that command."));
    }
  } catch (err) {
    console.error("discord command", err);
    return send(note("Something went wrong. Try again in a moment."));
  }
}

/* The command definitions scripts/register-discord-commands.mjs uploads. */
export const COMMANDS = [
  {
    name: "card",
    description: "Look up a card's rarity and price",
    options: [{ type: 3, name: "name", description: "Card name, like Charizard ex", required: true, autocomplete: true }],
  },
  {
    name: "profile",
    description: "Show a trainer's profile",
    options: [{ type: 3, name: "trainer", description: "Their handle, like ash", required: true, max_length: 17 }],
  },
  { name: "notes", description: "The latest poke-pack.rip patch notes" },
  { name: "play", description: "Link to poke-pack.rip" },
];
