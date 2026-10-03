// Upload the slash commands (worker/discord-commands.js COMMANDS) to the Discord server, and optionally
// point the application at the Worker's interactions endpoint.
//
//   DISCORD_BOT_TOKEN=... node scripts/register-discord-commands.mjs [--endpoint]
//
// The token comes from the environment and is never written anywhere. Guild commands appear at once.
import { COMMANDS } from "../worker/discord-commands.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = "1556002527818948771";
const GUILD_ID = "1556000686070825070";
const ENDPOINT = "https://poke-pack.rip/api/discord/interactions";
if (!TOKEN) {
  console.error("Set DISCORD_BOT_TOKEN.");
  process.exit(1);
}
const call = async (method, path, body) => {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { authorization: `Bot ${TOKEN}`, "content-type": "application/json", "user-agent": "DiscordBot (https://poke-pack.rip, 1.0)" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

const done = await call("PUT", `/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, COMMANDS);
console.log("registered:", done.map((command) => `/${command.name}`).join(" "));
if (process.argv.includes("--endpoint")) {
  await call("PATCH", "/applications/@me", { interactions_endpoint_url: ENDPOINT });
  console.log("interactions endpoint set:", ENDPOINT);
}
